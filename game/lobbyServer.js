const { createGameServer } = require('./gameServer');
const {
  getUserFromCookieHeader,
  ensureUserCurrencies,
  ensureUserSkins,
} = require('../lib/userStore');

const MODES = Object.freeze({
  pvp: { id: 'pvp', name: 'Arena PvP', maxPlayers: 8 },
  pve: { id: 'pve', name: 'Endless PvE', maxPlayers: 4 },
  strike: { id: 'strike', name: 'The Red Vault', maxPlayers: 4 },
});

function scopedEmitter(io, roomName) {
  const scoped = {
    emit(name, ...args) {
      return io.to(roomName).emit(name, ...args);
    },
    to(target) {
      return io.to(target === 'waiting' ? roomName : target);
    },
    // The match room remains intact when a game begins. It replaces the old
    // global `waiting` room as both the fireteam and match transport.
    socketsLeave() {},
  };
  Object.defineProperty(scoped, 'volatile', {
    get() { return io.to(roomName).volatile; },
  });
  return scoped;
}

function createLobbyServer(io) {
  const lobbies = new Map();
  const socketState = new Map();
  let nextLobbyId = 1;

  function hydrateSocketUser(socket) {
    if (socket.user) return socket.user;
    const headers = socket.handshake?.headers || socket.request?.headers || {};
    const user = getUserFromCookieHeader(headers.cookie || '');
    if (!user) return null;
    ensureUserCurrencies(user);
    ensureUserSkins(user);
    socket.user = user;
    return user;
  }

  function publicLobby(lobby) {
    const maxPlayers = MODES[lobby.mode].maxPlayers;
    const hasCapacity = lobby.memberIds.size < maxPlayers;
    const players = lobby.engine.waitingPlayers.map(player => ({
      id: player.id,
      username: player.accountUsername || player.name,
      weapon: player.primaryWeapon || player.weapon,
      joiningNextFloor:lobby.status==='active',
    }));
    if (lobby.status === 'active') {
      for (const player of lobby.engine.activePlayers) {
        if (player.isBot || player.debugCloneOf || players.some(item => item.id === player.id)) continue;
        players.push({
          id: player.id,
          username: player.accountUsername || player.name,
          weapon: player.primaryWeapon || player.weapon,
        });
      }
    }
    return {
      id: lobby.id,
      mode: lobby.mode,
      modeName: MODES[lobby.mode].name,
      name: `${lobby.ownerName}'s fireteam`,
      ownerId: lobby.ownerId,
      ownerName: lobby.ownerName,
      status: lobby.status,
      maxPlayers,
      floor:lobby.status==='active'&&lobby.mode==='pve'?(lobby.engine.gameMap.floor||1):undefined,
      joinable:hasCapacity&&(lobby.status==='open'||
        (lobby.status==='active'&&lobby.mode==='pve'&&lobby.engine.floorState.phase!=='wiped')),
      players,
    };
  }

  function lobbyList() {
    return [...lobbies.values()]
      .map(publicLobby)
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
        if (a.mode !== b.mode) return a.mode.localeCompare(b.mode);
        return Number(a.id) - Number(b.id);
      });
  }

  function publishLobbyList() {
    io.emit('lobby:list', lobbyList());
  }

  function publishLobbyState(lobby) {
    if (!lobby) return;
    io.to(lobby.roomName).emit('lobby:state', publicLobby(lobby));
  }

  function unbindSocket(socketId) {
    const state = socketState.get(socketId);
    if (!state) return;
    if (typeof state.unbindGame === 'function') state.unbindGame();
    state.unbindGame = null;
  }

  function destroyLobby(lobbyId) {
    const lobby = lobbies.get(lobbyId);
    if (!lobby) return;
    lobbies.delete(lobbyId);
    for (const socketId of lobby.memberIds) {
      const state = socketState.get(socketId);
      if (state?.lobbyId === lobbyId) {
        unbindSocket(socketId);
        state.lobbyId = null;
        const socket = io.sockets?.sockets?.get(socketId);
        socket?.leave(lobby.roomName);
      }
    }
    lobby.memberIds.clear();
    lobby.engine.close();
    publishLobbyList();
  }

  function finishLobby(lobbyId) {
    // Let the engine finish its reset event before disposing its timer and
    // bindings. queueMicrotask also prevents cleanup from nesting inside a
    // disconnect-triggered match reset.
    queueMicrotask(() => destroyLobby(lobbyId));
  }

  function currentLobby(socket) {
    const lobbyId = socketState.get(socket.id)?.lobbyId;
    return lobbyId ? lobbies.get(lobbyId) : null;
  }

  function accountIsBusy(username, exceptSocketId) {
    for (const [socketId, state] of socketState) {
      if (socketId === exceptSocketId || !state.lobbyId || state.username !== username) continue;
      if (lobbies.has(state.lobbyId)) return true;
    }
    return false;
  }

  function joinLobby(socket, lobby, weapon) {
    const state = socketState.get(socket.id);
    if (!lobby) return { ok: false, error: 'That fireteam is no longer available.' };
    if (!state || !socket.user) return { ok: false, error: 'Sign in before joining a fireteam.' };
    const latePveJoin=lobby.status==='active'&&lobby.mode==='pve'&&lobby.engine.floorState.phase!=='wiped';
    if(lobby.status!=='open'&&!latePveJoin)
      return {ok:false,error:'That activity cannot be joined after launch.'};
    if(state.lobbyId===lobby.id)return {ok:true,lobby:publicLobby(lobby),
      ...(latePveJoin?{lateJoin:lobby.engine.latePveJoinState()}: {})};
    if (lobby.memberIds.size >= MODES[lobby.mode].maxPlayers) return { ok: false, error: 'That fireteam is full.' };
    if (state.lobbyId && state.lobbyId !== lobby.id) return { ok: false, error: 'Leave your current fireteam first.' };
    if (accountIsBusy(socket.user.username, socket.id)) return { ok: false, error: 'This account is already in another fireteam or match.' };

    state.lobbyId = lobby.id;
    lobby.memberIds.add(socket.id);
    socket.join(lobby.roomName);
    state.unbindGame = lobby.engine.connectSocket(socket, { lobby: false, disconnect: false });
    const joinPayload={
      displayName: socket.user.username,
      weapon,
    };
    const lateJoin=latePveJoin?lobby.engine.queueLatePveJoin(socket,joinPayload):null;
    if(latePveJoin&&!lateJoin) {
      unbindSocket(socket.id);lobby.memberIds.delete(socket.id);state.lobbyId=null;socket.leave(lobby.roomName);
      return {ok:false,error:'That PvE run is no longer accepting reinforcements.'};
    }
    if(!latePveJoin)lobby.engine.handleJoin(socket,joinPayload);
    publishLobbyState(lobby);
    publishLobbyList();
    return { ok: true, lobby: publicLobby(lobby), ...(lateJoin?{lateJoin}: {}) };
  }

  function leaveLobby(socket, { disconnected = false } = {}) {
    const state = socketState.get(socket.id);
    const lobby = currentLobby(socket);
    if (!state || !lobby) return;
    lobby.engine.handleDisconnect(socket);
    unbindSocket(socket.id);
    lobby.memberIds.delete(socket.id);
    state.lobbyId = null;
    if (!disconnected) socket.leave(lobby.roomName);

    if(lobby.status==='active'&&lobby.memberIds.size===0) {
      destroyLobby(lobby.id);
      return;
    }

    if (lobby.status === 'open') {
      if (lobby.memberIds.size === 0) {
        destroyLobby(lobby.id);
        return;
      }
      if (lobby.ownerId === socket.id) {
        lobby.ownerId = lobby.memberIds.values().next().value;
        const nextOwner = io.sockets?.sockets?.get(lobby.ownerId);
        lobby.ownerName = nextOwner?.user?.username ||
          lobby.engine.waitingPlayers.find(player => player.id === lobby.ownerId)?.name || 'Fireteam';
      }
      publishLobbyState(lobby);
    } else if(lobby.ownerId===socket.id) {
      lobby.ownerId=lobby.memberIds.values().next().value;
      const nextOwner=io.sockets?.sockets?.get(lobby.ownerId);
      lobby.ownerName=nextOwner?.user?.username||'Fireteam';
      publishLobbyState(lobby);
    }
    publishLobbyList();
  }

  function createLobby(socket, payload, reply) {
    const mode = MODES[payload?.mode] ? payload.mode : 'pvp';
    const state = socketState.get(socket.id);
    if (!state || !socket.user) return reply?.({ ok: false, error: 'Sign in before creating a fireteam.' });
    if (state.lobbyId) return reply?.({ ok: false, error: 'Leave your current fireteam first.' });
    if (accountIsBusy(socket.user.username, socket.id)) return reply?.({ ok: false, error: 'This account is already in another fireteam or match.' });

    const id = String(nextLobbyId++);
    const roomName = `match:${id}`;
    let lobby;
    const engine = createGameServer(scopedEmitter(io, roomName), {
      attachConnections: false,
      manageRooms: false,
      onReset: () => finishLobby(id),
      onFloorStateChange: () => publishLobbyList(),
    });
    lobby = {
      id,
      roomName,
      mode,
      ownerId: socket.id,
      ownerName: socket.user.username,
      status: 'open',
      memberIds: new Set(),
      engine,
    };
    lobbies.set(id, lobby);
    const result = joinLobby(socket, lobby, payload?.weapon);
    reply?.(result);
  }

  function handleJoinLobby(socket, payload, reply) {
    const lobby = lobbies.get(String(payload?.lobbyId || ''));
    reply?.(joinLobby(socket, lobby, payload?.weapon));
  }

  function handleLoadout(socket, payload, reply) {
    const lobby = currentLobby(socket);
    if (!lobby || lobby.status !== 'open') return reply?.({ ok: false, error: 'Loadouts can only change while waiting.' });
    lobby.engine.handleJoin(socket, {
      displayName: socket.user.username,
      weapon: payload?.weapon,
    });
    publishLobbyState(lobby);
    publishLobbyList();
    reply?.({ ok: true });
  }

  function startLobby(socket, payload, reply) {
    const lobby = currentLobby(socket);
    if (!lobby || lobby.status !== 'open') return reply?.({ ok: false, error: 'This fireteam cannot be started.' });
    if (lobby.ownerId !== socket.id) return reply?.({ ok: false, error: 'Only the fireteam leader can launch.' });

    const qingDebug = lobby.mode === 'pvp' && socket.user?.username === 'qing' && payload?.debugDouble === true;
    if (lobby.mode === 'pvp' && lobby.memberIds.size < 2 && !qingDebug) {
      return reply?.({ ok: false, error: 'PvP needs at least two players.' });
    }
    const options = {
      enableBots: lobby.mode !== 'pvp',
      strikeId:lobby.mode==='strike'?(payload?.strikeId||'red-vault'):undefined,
      startFloor: payload?.startFloor,
      pvpMap: payload?.pvpMap,
      debugDouble: qingDebug,
    };
    lobby.engine.handleStartGame(socket, options);
    if (!lobby.engine.gameInProgress.status) return reply?.({ ok: false, error: 'The match could not be launched.' });
    lobby.status = 'active';
    publishLobbyList();
    reply?.({ ok: true });
  }

  io.on('connection', socket => {
    const user = hydrateSocketUser(socket);
    socketState.set(socket.id, {
      username: user?.username || null,
      lobbyId: null,
      unbindGame: null,
    });
    if (!user) {
      socket.emit('authError', { message: 'Your session expired. Sign in again.' });
    } else {
      socket.emit('lobby:list', lobbyList());
    }

    socket.on('lobby:list:request', () => socket.emit('lobby:list', lobbyList()));
    socket.on('lobby:create', (payload, reply) => createLobby(socket, payload, reply));
    socket.on('lobby:join', (payload, reply) => handleJoinLobby(socket, payload, reply));
    socket.on('lobby:leave', (_, reply) => {
      const lobby = currentLobby(socket);
      if (lobby?.status === 'active'&&lobby.engine.floorState.phase!=='wiped')
        return reply?.({ ok: false, error: 'The match is already in progress.' });
      leaveLobby(socket);
      reply?.({ ok: true });
    });
    socket.on('lobby:loadout', (payload, reply) => handleLoadout(socket, payload, reply));
    socket.on('lobby:start', (payload, reply) => startLobby(socket, payload, reply));
    socket.on('disconnect', () => {
      leaveLobby(socket, { disconnected: true });
      socketState.delete(socket.id);
    });
  });

  return {
    lobbies,
    socketState,
    getActivePlayers() {
      return [...lobbies.values()].flatMap(lobby => lobby.engine.activePlayers);
    },
    close() {
      for (const lobby of lobbies.values()) lobby.engine.close();
      lobbies.clear();
      socketState.clear();
    },
  };
}

module.exports = { createLobbyServer, MODES, scopedEmitter };
