import { test } from 'node:test';
import assert from 'node:assert/strict';
import lobbyModule from '../game/lobbyServer.js';

class FakeSocket {
  constructor(id, username) {
    this.id = id;
    this.user = { username, currencies: { Coins: 0 }, skins: { owned: [], equippedByWeapon: {} } };
    this.handlers = new Map();
    this.rooms = new Set([id]);
  }
  on(name, handler) {
    const list = this.handlers.get(name) || [];
    list.push(handler);
    this.handlers.set(name, list);
  }
  off(name, handler) {
    const list = this.handlers.get(name) || [];
    this.handlers.set(name, list.filter(item => item !== handler));
  }
  emit() {}
  join(room) { this.rooms.add(room); }
  leave(room) { this.rooms.delete(room); }
  trigger(name, ...args) {
    for (const handler of this.handlers.get(name) || []) handler(...args);
  }
}

function fakeIo() {
  let connection;
  const events = [];
  const sockets = new Map();
  const channel = target => ({
    emit(name, ...args) { events.push({ target, name, args }); },
    get volatile() { return this; },
  });
  return {
    events,
    sockets: { sockets },
    on(name, handler) { if (name === 'connection') connection = handler; },
    emit(name, ...args) { events.push({ target: null, name, args }); },
    to(target) { return channel(target); },
    connect(socket) { sockets.set(socket.id, socket); connection(socket); },
  };
}

function request(socket, event, payload = {}) {
  let result;
  socket.trigger(event, payload, response => { result = response; });
  return result;
}

test('independent fireteams launch isolated PvE matches in parallel', t => {
  t.mock.method(global, 'setInterval', () => 1);
  t.mock.method(global, 'clearInterval', () => {});
  const io = fakeIo();
  const manager = lobbyModule.createLobbyServer(io);
  const alpha = new FakeSocket('a', 'alpha');
  const bravo = new FakeSocket('b', 'bravo');
  io.connect(alpha);
  io.connect(bravo);

  try {
    const first = request(alpha, 'lobby:create', { mode: 'pve', weapon: 'sniper' });
    const second = request(bravo, 'lobby:create', { mode: 'pve', weapon: 'shotgun' });
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.notEqual(first.lobby.id, second.lobby.id);
    assert.equal(manager.lobbies.size, 2);

    assert.equal(request(alpha, 'lobby:start').ok, true);
    assert.equal(request(bravo, 'lobby:start').ok, true);
    const matches = [...manager.lobbies.values()];
    assert.ok(matches.every(lobby => lobby.status === 'active'));
    assert.ok(matches.every(lobby => lobby.engine.gameInProgress.status));
    assert.ok(matches.every(lobby => lobby.engine.activePlayers.some(player => !player.isBot)));
    assert.equal(matches[0].engine.activePlayers.some(player => player.accountUsername === 'bravo'), false);
    assert.equal(matches[1].engine.activePlayers.some(player => player.accountUsername === 'alpha'), false);
  } finally {
    manager.close();
  }
});

test('active Endless PvE fireteams accept reinforcements for the next floor only',t=>{
  t.mock.method(global,'setInterval',()=>1);
  t.mock.method(global,'clearInterval',()=>{});
  const io=fakeIo(),manager=lobbyModule.createLobbyServer(io);
  const leader=new FakeSocket('leader','leader'),late=new FakeSocket('late','reinforcement');
  io.connect(leader);io.connect(late);
  try {
    const created=request(leader,'lobby:create',{mode:'pve',weapon:'sniper'});
    assert.equal(request(leader,'lobby:start').ok,true);
    const result=request(late,'lobby:join',{lobbyId:created.lobby.id,weapon:'shotgun'});
    const lobby=manager.lobbies.get(created.lobby.id);
    assert.equal(result.ok,true);
    assert.equal(result.lobby.joinable,true);
    assert.equal(result.lobby.floor,1);
    assert.equal(result.lobby.players.find(player=>player.id==='late').joiningNextFloor,true);
    assert.equal(result.lateJoin.spawnFloor,2);
    assert.equal(result.lateJoin.players.some(player=>player.id==='late'),false,
      'reinforcement is not inserted into the live floor snapshot');
    assert.equal(lobby.engine.activePlayers.some(player=>player.id==='late'),false);
    assert.equal(lobby.engine.waitingPlayers.some(player=>player.id==='late'),true);
    assert.ok(result.lateJoin.players.some(player=>player.id==='leader'&&player.alive),
      'late joiner receives the current run for spectating');
  } finally {manager.close();}
});

test('full waiting fireteams are not advertised as joinable',t=>{
  t.mock.method(global,'setInterval',()=>1);
  t.mock.method(global,'clearInterval',()=>{});
  const io=fakeIo(),manager=lobbyModule.createLobbyServer(io);
  const sockets=Array.from({length:5},(_,index)=>new FakeSocket(`p${index}`,`player-${index}`));
  sockets.forEach(socket=>io.connect(socket));
  try {
    const created=request(sockets[0],'lobby:create',{mode:'pve'});
    let joined;
    for(let index=1;index<4;index++) {
      joined=request(sockets[index],'lobby:join',{lobbyId:created.lobby.id});
      assert.equal(joined.ok,true);
    }
    const fullLobby=joined.lobby;
    assert.equal(fullLobby.players.length,4);
    assert.equal(fullLobby.joinable,false);
    const rejected=request(sockets[4],'lobby:join',{lobbyId:created.lobby.id});
    assert.equal(rejected.ok,false);
    assert.match(rejected.error,/full/i);
  } finally {manager.close();}
});

test('launched PvP and Strike activities remain closed to late joining',t=>{
  t.mock.method(global,'setInterval',()=>1);
  t.mock.method(global,'clearInterval',()=>{});
  for(const mode of ['pvp','strike']) {
    const io=fakeIo(),manager=lobbyModule.createLobbyServer(io);
    const leader=new FakeSocket(`${mode}-leader`,`${mode}-leader`);
    const teammate=new FakeSocket(`${mode}-mate`,`${mode}-mate`);
    const late=new FakeSocket(`${mode}-late`,`${mode}-late`);
    io.connect(leader);io.connect(teammate);io.connect(late);
    try {
      const created=request(leader,'lobby:create',{mode,weapon:'autoRifle'});
      if(mode==='pvp')assert.equal(request(teammate,'lobby:join',{lobbyId:created.lobby.id}).ok,true);
      assert.equal(request(leader,'lobby:start').ok,true);
      const result=request(late,'lobby:join',{lobbyId:created.lobby.id});
      assert.equal(result.ok,false);assert.match(result.error,/cannot be joined/i);
    } finally {manager.close();}
  }
});

test('lobbies use the authenticated username and only their leader can launch', t => {
  t.mock.method(global, 'setInterval', () => 1);
  t.mock.method(global, 'clearInterval', () => {});
  const io = fakeIo();
  const manager = lobbyModule.createLobbyServer(io);
  const leader = new FakeSocket('leader', 'fixed-name');
  const member = new FakeSocket('member', 'teammate');
  io.connect(leader);
  io.connect(member);

  try {
    const created = request(leader, 'lobby:create', { mode: 'pvp', weapon: 'autoRifle' });
    assert.equal(request(member, 'lobby:join', { lobbyId: created.lobby.id, weapon: 'sniper' }).ok, true);
    const lobby = manager.lobbies.get(created.lobby.id);
    assert.deepEqual(lobby.engine.waitingPlayers.map(player => player.name).sort(), ['fixed-name', 'teammate']);
    assert.match(request(member, 'lobby:start').error, /leader/i);
    assert.equal(lobby.engine.gameInProgress.status, false);
    assert.equal(request(leader, 'lobby:start').ok, true);
    assert.equal(lobby.engine.gameInProgress.status, true);
  } finally {
    manager.close();
  }
});

test('a solo fireteam can launch The Red Vault without replacing Endless PvE', t => {
  t.mock.method(global, 'setInterval', () => 1);
  t.mock.method(global, 'clearInterval', () => {});
  const io = fakeIo();
  const manager = lobbyModule.createLobbyServer(io);
  const striker = new FakeSocket('striker', 'red-vault-lead');
  const endless = new FakeSocket('endless', 'endless-lead');
  io.connect(striker);io.connect(endless);

  try {
    const strikeCreated=request(striker,'lobby:create',{mode:'strike',weapon:'sniper'});
    const pveCreated=request(endless,'lobby:create',{mode:'pve',weapon:'autoRifle'});
    assert.equal(strikeCreated.ok,true);assert.equal(pveCreated.ok,true);
    assert.equal(request(striker,'lobby:start').ok,true,'one-player co-op Strike can launch');
    const strikeLobby=manager.lobbies.get(strikeCreated.lobby.id);
    const pveLobby=manager.lobbies.get(pveCreated.lobby.id);
    assert.equal(strikeLobby.status,'active');
    assert.equal(strikeLobby.engine.gameMap.id,'red-vault');
    assert.equal(strikeLobby.engine.gameMap.mode,'strike');
    assert.equal(strikeLobby.engine.gameMap.activity,'strike');
    assert.ok(strikeLobby.engine.strikeState);
    assert.equal(pveLobby.status,'open','the independent Endless fireteam remains available');
    assert.equal(pveLobby.engine.strikeState,null);
  } finally {
    manager.close();
  }
});
