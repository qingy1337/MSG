const { WEAPONS, DEFAULT_WEAPON_KEY, SECONDARY_WEAPON_KEY, WEAPON_SWITCH_MS,
  sniperBloomRadians,spreadSniperAim } = require("../public/weapons");
const { traceShot, tracePiercingShot, rayBox } = require("./hitscan");
const {traceShotgun}=require('./shotgun');
const {hitsElevatorOverride}=require('./elevatorOverride');
const {throwGrenade,stepGrenade,blastDamage}=require('./grenades');
const {deathDescriptor,makeDeathPickup,collectPickups}=require('./deathEffects');
const { floorDifficulty, tickOgre } = require('./pveDifficulty');
const { advanceKnockback,addKnockbackImpulse } = require('../public/arenaMap');
const {NavigationService}=require('./navigationService');
const {playerSnapshot,playerFrame}=require('./snapshots');
const {applyMovementInput}=require('../public/inputMovement');
const { BOT_COMBAT, readyToShoot, recordShot } = require("./botCombat");
const { DREAD_COMBAT, tickDreadCarbine, recordDreadShot } = require('./dreadCombat');
const {phaseForHealth,tickWardenPressure,cancelWardenPressure}=require('./wardenCombat');
const {GUARDIAN_COMBAT,tickGuardianBurst,launchGuardianProjectile,stepGuardianProjectile,guardianBlastDamage,guardianKnockbackSpeed}=require('./guardianCombat');
const { perceive, chooseIntent, angleDelta, alertNearbyBots } = require('./botAwareness');
const { recordEnemyHit, currentEnemyFear, fearRetreatGoal, enemyCanAttack } = require('./enemyReactions');
const { MOVEMENT, advanceJump, startJump } = require("../public/movement");
const { DEFAULT_MAP, createPveMap, createPvpMap, moveOnTerrain, regeneratePlayers, updateCargoLifts,
  groundHeight, supportHeight, authoredSupportAt, canOccupy } = require('../public/arenaMap');
const {PVP_MAPS}=require('../public/pvpMaps');
const { LIFT_TIMING, inElevator, floorSpawn, updateExitDoor } = require('../public/floors');
const PVP_SPAWN_SHIELD_MS=6000;
const {
  usersByUsername,
  getUserFromCookieHeader,
  ensureUserCurrencies,
  ensureUserSkins,
  recordUserKill,
  recordGrenadeThrown,
  saveUsers,
} = require("../lib/userStore");
const { DEFAULT_SKIN_BY_WEAPON } = require("../lib/skins");
const {
  isBotAlliedName,
  isBotAllyPlayer,
  hasDefaultSkin,
  isPointInsideAnyWall,
  lineIntersectsAnyWall,
  segmentCrossesWallDiscrete,
  distanceToLineSq,
  circleCollidesAnyWall,
  worldToGrid,
  gridToWorld,
  cellKey,
  isCellWithinBounds,
} = require("./helpers");

const colors = [
  "#FF5733",
  "#33FF57",
  "#3357FF",
  "#F033FF",
  "#FF33A8",
  "#33FFF5",
  "#FFD733",
  "#8C33FF",
  "#FF8C33",
  "#33FFBD",
];

const MAX_HEALTH = 101;
const WEAPON_DAMAGE = {
  pistol: 10.5,     // 1000 / 100 * 22.5  = 225
  autoRifle: 5.75,  // 1000 / 70  * 15.75 = 225
  sniper: 90,       // 1000 / 800 * 90    = 112.5
  miniGun: 4,
};

function killCoinReward(target) {
  if(!target?.isBot)return 5;
  if(target.botType==='dread'&&target.botRank==='captain')return 35;
  if(target.botType==='guardian')return 15;
  return 5;
}

function createGameServer(io, options = {}) {
  let lastTickMs=0;
  const navigation=new NavigationService();
  let snapshotDirty=false,snapshotSequence=0;
  const queueSnapshot=()=>{snapshotDirty=true;};
  function publishSnapshot(){
    // One replaceable packet for all moving entities. A separate reliable
    // grenade packet here makes the transport busy and drops this snapshot.
    const humanRooms=[...new Set([
      ...activePlayers.filter(player=>!player.isBot&&!player.debugCloneOf).map(player=>player.id),
      ...waitingPlayers.map(player=>player.id),
    ])];
    const channel=humanRooms.length&&typeof io.to==='function'?io.to(humanRooms):io;
    (channel.volatile||channel).emit('gameState',activePlayers.map(playerFrame),{
      serverNow:Date.now(),sequence:++snapshotSequence,
      grenades:grenades.map(({id,x,y,height,vx,vy,vz,expiresAt})=>({id,x,y,height,vx,vy,vz,expiresAt})),
      guardianProjectiles:guardianProjectiles.map(({id,x,y,height,vx,vy,vz,expiresAt})=>({id,x,y,height,vx,vy,vz,expiresAt})),
      pickups:pickups.map(({id,kind,x,y,height})=>({id,kind,x,y,height})),
    });
    snapshotDirty=false;
  }
  // Game state
  const waitingPlayers = [];
  const activePlayers = [];
  const matchParticipantIds = new Set();
  const gameInProgress = { status: false };
  const gameWalls = [];
  let gameMap = DEFAULT_MAP;
  let floorState = { phase: 'combat', floor: 1, startedAt: 0 };
  let strikeState = null;
  const strikeHazardTickAt=new Map();
  let strikeHazardSignature='';
  let strikeHazardPublishedAt=0;
  let floorBotCount = 0;
  let pveEncounterActive = true;
  let recentTerrain=[];
  let lastPvpMapId=null;
  const cooperative=()=>gameMap.mode==='pve'||gameMap.mode==='strike'||gameMap.activity==='strike';
  const riding = () => gameMap.mode === 'pve'&&gameMap.activity!=='strike'&&['riding','opening'].includes(floorState.phase);
  const travelCabin=()=>riding()?(floorState.phase==='opening'?gameMap.arrivalElevator:gameMap.elevator):null;
  function publishFloorState() { io.emit('floorState', { ...floorState, serverNow: Date.now() }); }
  function strikeReviveSnapshots() {
    return activePlayers.filter(player=>!player.isBot&&!player.alive&&player.strikeReviveBeacon)
      .map(player=>({id:`revive:${player.id}`,playerId:player.id,name:player.displayName||player.name||'ALLY',
        x:player.strikeReviveBeacon.x,y:player.strikeReviveBeacon.y,
        height:player.strikeReviveBeacon.height,holdMs:player.strikeReviveBeacon.holdMs||2000,
        reviverId:player.strikeReviveBeacon.reviverId||null,
        progress:Math.max(0,Math.min(1,player.strikeReviveBeacon.progress||0))}));
  }
  function publishStrikeState() {
    if(!strikeState)return;
    refreshStrikeGuidance();
    strikeState={...strikeState,reviveBeacons:strikeReviveSnapshots()};
    io.emit('strikeState',{...strikeState,serverNow:Date.now()});
  }
  let lastRegenAt = 0;
  const squadOrders = new Map();
  let solidsCache=[],solidsWallLength=-1,solidsTerrain=null,solidsTerrainLength=-1;
  const solids=()=>{
    const terrain=gameMap.terrain||[];
    if(solidsWallLength!==gameWalls.length||solidsTerrain!==terrain||solidsTerrainLength!==terrain.length){
      solidsCache=[...gameWalls,...terrain];solidsWallLength=gameWalls.length;
      solidsTerrain=terrain;solidsTerrainLength=terrain.length;
    }
    return solidsCache;
  };
  const insideRect=(player,rect,padding=0)=>!!rect&&player.x>=rect.x-padding&&player.x<=rect.x+rect.width+padding&&
    player.y>=rect.y-padding&&player.y<=rect.y+rect.height+padding;
  function inArrivalStaging(player) {
    const arrival=gameMap.zones?.find(zone=>zone.id===gameMap.encounter?.arrivalZoneId||zone.role==='arrival');
    // Padding joins the cabin doorway to the BSP room, so crossing the small
    // structural throat cannot prematurely wake the encounter.
    return insideRect(player,gameMap.arrivalElevator,32)||insideRect(player,arrival,8);
  }
  function activatePveEncounter(now=Date.now()) {
    if(!cooperative())return false;
    if(gameMap.activity==='strike')return activateStrikeEncounter(now);
    pveEncounterActive=true;return true;
  }
  const canDamage = (a, b) => {
    // Strike reinforcements exist during their arrival telegraph so every
    // client can render it reliably, but they are not combatants until the
    // materialization finishes. This prevents either side damaging an enemy
    // that is still only a warning silhouette.
    if(b?.spawnReadyAt>Date.now())return false;
    // PvP opens with a brief synchronized setup window. The deadline is
    // server-owned, so latency or a modified client can never bypass it.
    if(gameMap.mode==='pvp'&&(b?.spawnShieldUntil||0)>Date.now())return false;
    return cooperative() ? !!a.isBot !== !!b.isBot : !(a.isBot && isBotAllyPlayer(b));
  };
  // Simple server-side bot config (step 0: scripted bots)
  const BOT_CONFIG = {
    // When bots are enabled, try to roughly fill up to this many total players.
    targetTotalPlayers: 4,
    maxPerMatch: 10,
    // Slower than the player, leaving room to retreat and line up a shot.
    moveSpeedPerTick: 7,
    weaponKey: "autoRifle",
    playerRadius: MOVEMENT.radius,
    canvasWidth: 900,
    canvasHeight: 600,
    aimInaccuracy: BOT_COMBAT.aimSpread,
  };
  let nextBotId = 1;

  // Tracer IDs; hits are applied synchronously, once, by fireHitscan.
  let nextBulletId = 1;
  const grenades=[];
  const guardianProjectiles=[];
  const pickups=[];
  let nextPickupId=1;
  let nextGrenadeId=1;
  let nextGuardianProjectileId=1;
  // Existing navigation helpers accept a projectile list. Hitscan leaves it empty.
  const activeBullets = [];
  let gameOverTimeout = null;
  let cachedNavGrid = null;
  let wallLayoutVersion = 0;

  function connectSocket(socket, bindOptions) {
    hydrateSocketUser(socket);
    console.log(
      "New connection:",
      socket.id,
      socket.user ? `as ${socket.user.username}` : "(unauthenticated)",
    );
    return registerSocketHandlers(socket, bindOptions);
  }

  if (options.attachConnections !== false) {
    io.on("connection", (socket) => connectSocket(socket));
  }

  function hydrateSocketUser(socket) {
    const cookieHeader =
      (socket.handshake && socket.handshake.headers && socket.handshake.headers.cookie) ||
      (socket.request && socket.request.headers && socket.request.headers.cookie) ||
      "";
    const user = getUserFromCookieHeader(cookieHeader);
    if (user) {
      socket.user = user;
      ensureUserCurrencies(socket.user);
      ensureUserSkins(socket.user);
    }
  }

  function registerSocketHandlers(socket, bindOptions = {}) {
    const bindLobby = bindOptions.lobby !== false;
    const bindDisconnect = bindOptions.disconnect !== false;
    const bindings = [];
    const bind = (name, handler) => {
      socket.on(name, handler);
      bindings.push([name, handler]);
    };
    let lastProbeAt=-Infinity;
    bind('networkProbe',reply=>{
      if(typeof reply!=='function'||Date.now()-lastProbeAt<1000)return;
      lastProbeAt=Date.now();reply({tickMs:lastTickMs});
    });
    if (bindLobby) {
      bind("join", (payload) => handleJoin(socket, payload));
      bind("startGame", (startOptions) => handleStartGame(socket, startOptions));
    }
    bind("playerUpdate", (data) => handlePlayerUpdate(socket, data));
    bind("shoot", (bulletData) => handleShoot(socket, bulletData));
    bind("switchWeapon", () => handleSwitchWeapon(socket));
    bind('strikeInteractStart',aim=>handleStrikeInteractionStart(socket,aim));
    bind('strikeInteractCancel',()=>cancelStrikeInteraction(socket.id));
    bind('grenadeCharge',()=>{
      const p=activePlayers.find(p=>p.id===socket.id);
      if(gameInProgress.status&&!gameOverTimeout&&!riding()&&p?.alive&&p.grenades>0&&p.grenadeChargeAt==null)p.grenadeChargeAt=Date.now();
    });
    bind('grenadeCancel',()=>{const p=activePlayers.find(p=>p.id===socket.id);if(p)p.grenadeChargeAt=null;});
    bind('throwGrenade',data=>{
      const p=activePlayers.find(p=>p.id===socket.id),started=p?.grenadeChargeAt;
      if(p)p.grenadeChargeAt=null;
      if(!gameInProgress.status||gameOverTimeout||riding()||!p?.alive||!(p.grenades>0)||started==null||
        !data||!Number.isFinite(data.angle)||!Number.isFinite(data.pitch)||Math.abs(data.pitch)>1.35)return;
      const now=Date.now();updateCargoLifts(gameMap,activePlayers,now);advanceJump(p,now);
      activatePveEncounter();
      p.grenades--;
      const g=throwGrenade(p,data.angle,data.pitch,now-started,now,nextGrenadeId++);
      grenades.push(g);
      if (p.accountUsername) {
        const accountUser = usersByUsername.get(p.accountUsername);
        const stats = recordGrenadeThrown(accountUser);
        if (stats) io.to(p.id).emit('statsUpdated', stats);
      }
      // Creation must reach every client even if replaceable motion snapshots
      // are dropped. One lifecycle event per throw, not reliable per-tick traffic.
      const {id,x,y,height,vx,vy,vz,expiresAt}=g;
      io.emit('grenadeThrown',{id,x,y,height,vx,vy,vz,expiresAt,serverNow:now});
      queueSnapshot();
    });
    bind("jump", () => {
      if (!gameInProgress.status || gameOverTimeout || riding()) return;
      const player = activePlayers.find(p => p.id === socket.id);
      updateCargoLifts(gameMap,activePlayers,Date.now());
      if (player && startJump(player, Date.now())) queueSnapshot();
    });
    if (bindDisconnect) bind("disconnect", () => handleDisconnect(socket));
    return () => {
      if (typeof socket.off !== 'function') return;
      for (const [name, handler] of bindings) socket.off(name, handler);
    };
  }

  function handleJoin(socket, payload) {
    if (!socket.user) {
      socket.emit("authError", {
        message: "You must be logged in to join the game.",
      });
      return;
    }

    const { displayName, weapon } = parseJoinPayload(payload, socket.user.username);
    const player = buildWaitingPlayer(socket, displayName, weapon);
    const existingIndex = waitingPlayers.findIndex((waiting) => waiting.id === socket.id);
    if (existingIndex === -1) {
      waitingPlayers.push(player);
    } else {
      // A delayed UI callback or a double click must not create two copies of
      // the same socket in the next match. Preserve its lobby colour while
      // allowing a deliberate loadout/name change to replace the other data.
      player.color = waitingPlayers[existingIndex].color;
      waitingPlayers[existingIndex] = player;
    }
    if (options.manageRooms !== false) socket.join("waiting");

    io.to("waiting").emit("updateWaitingList", waitingPlayers);
    console.log(
      `${socket.user.username} joined the waiting room as "${displayName}" with ${weapon}`,
    );
  }

  function createAuthoredStrikeMap(strikeId) {
    if(typeof options.createStrikeMap==='function')return options.createStrikeMap(strikeId);
    // Keep the large authored mission out of the ordinary arena/PvE module
    // graph. This also lets headless runtime tests inject a compact fixture.
    const authored=require('../public/strikeMap');
    const factory=authored.createRedVaultMap||authored.createStrikeMap||authored.createStrikeValleyMap;
    if(typeof factory!=='function')throw new Error('The authored Strike map factory is unavailable.');
    return factory(strikeId);
  }

  function activateHumanPlayer(player, spawnPosition, now) {
    const cooperativeMatch=cooperative();
    const height=spawnPosition.height||0;
    return {
      ...player,
      x:spawnPosition.x,
      y:spawnPosition.y,
      angle:0,
      alive:true,
      health:MAX_HEALTH,
      maxHealth:MAX_HEALTH,
      grenades:3,
      team:cooperativeMatch?'players':player.id,
      color:cooperativeMatch?'#49cdb5':player.color,
      height,
      groundHeight:height,
      ceilingHeight:cooperativeMatch?(gameMap.elevator?.ceiling||gameMap.ceiling):gameMap.ceiling,
      zone:spawnPosition.zone??spawnPosition.sectorId,
      sectorId:spawnPosition.sectorId??spawnPosition.zone,
      grenadeChargeAt:null,
      jumpStartedAt:null,
      jumpBase:height,
      jumpVelocity:0,
      jumpInputSeq:null,
      jumpPlatformId:null,
      platformId:null,
      groundPlatformId:null,
      knockback:null,
      movementEpoch:(player.movementEpoch||0)+1,
      inputBudget:0.25,
      inputBudgetAt:now,
      lastShotAt:0,
      shotgunShotsRemaining:WEAPONS.shotgun.shotsPerReload,
      shotgunReloadUntil:0,
    };
  }

  function handleStartGame(socket, options) {
    if (gameInProgress.status) return;

    const config = options && typeof options === "object" ? options : {};
    const enableBots = !!config.enableBots;
    const strikeId=enableBots&&typeof config.strikeId==='string'&&config.strikeId?config.strikeId:null;
    const qingDebug=!enableBots&&socket.user?.username==='qing'&&waitingPlayers.some(p=>p.id===socket.id);
    const selectedPvpMap=qingDebug&&typeof config.pvpMap==='string'&&PVP_MAPS[config.pvpMap]
      ? config.pvpMap : undefined;
    const debugDouble=qingDebug&&config.debugDouble===true;
    const startFloor=enableBots && socket.user?.username==='qing' &&
      waitingPlayers.some(p=>p.id===socket.id) && Number.isSafeInteger(config.startFloor) && config.startFloor>=1
      ? config.startFloor : 1;

    const humanCount = waitingPlayers.length;
    let botCount = 0;
    if (enableBots) {
      const maxBots = BOT_CONFIG.maxPerMatch;
      botCount = Math.min(maxBots, Math.max(4, humanCount * 2));
      if (humanCount === 1 && botCount === 0 && maxBots > 0) {
        botCount = 1;
      }
    }

    const totalPlayers = humanCount + botCount + (debugDouble?1:0);
    if (humanCount === 0 || totalPlayers < 2) return;

    const layout = strikeId ? createAuthoredStrikeMap(strikeId) : enableBots ? createPveMap(undefined,startFloor) :
      createPvpMap(undefined,selectedPvpMap,selectedPvpMap?undefined:lastPvpMapId);
    if(!layout?.map||!Array.isArray(layout.walls))return;

    gameInProgress.status = true;
    matchParticipantIds.clear();
    clearActiveBullets(activeBullets);

    if(!enableBots)lastPvpMapId=layout.map.id;
    recentTerrain=enableBots&&!strikeId?[layout.map.composition]:[];
    gameMap = layout.map;
    if(strikeId) {
      gameMap.activity='strike';gameMap.strikeId=gameMap.strikeId||strikeId;
      gameMap.strikeEncounters=gameMap.strikeEncounters||gameMap.encounters||[];
    }
    pveEncounterActive=!enableBots;
    gameMap.platformEpoch=Date.now();
    const walls = layout.walls;
    BOT_CONFIG.canvasWidth = gameMap.width;
    BOT_CONFIG.canvasHeight = gameMap.height;
    const matchStartedAt=Date.now();
    lastRegenAt = matchStartedAt; squadOrders.clear();
    floorState = { phase: 'combat', floor: startFloor, startedAt: matchStartedAt };
    strikeState=strikeId?strikeTravelState(0,matchStartedAt,{checkpointIndex:-1,openedIds:[],
      machineryState:{},missionFlags:{}}):null;
    strikeHazardTickAt.clear();strikeHazardSignature='';strikeHazardPublishedAt=0;
    floorBotCount = botCount;
    wallLayoutVersion += 1;
    invalidateCachedNavGrid();
    gameWalls.length = 0;
    gameWalls.push(...walls);
    if(strikeId) {
      strikeState={...strikeState,machineryState:{...(gameMap.dynamicState||{}),
        ...(strikeState.machineryState||{})}};
      applyStrikePatch(gameMap.initialMissionState);
    }
    if(enableBots)navigation.configure(gameMap,gameWalls);

    while (waitingPlayers.length > 0) {
      const player = waitingPlayers.pop();
      matchParticipantIds.add(player.id);
      const spawnPosition = enableBots ? getTeamSpawn(false, activePlayers.filter(p => !p.isBot).length) : getValidSpawnPosition(solids(), activePlayers);
      const activePlayer={
        ...player,
        x: spawnPosition.x,
        y: spawnPosition.y,
        angle: 0,
        alive: true,
        health: MAX_HEALTH,
        maxHealth: MAX_HEALTH,
        grenades: 3,
        team: enableBots ? 'players' : player.id,
        color: enableBots ? '#49cdb5' : player.color,
        height: spawnPosition.height || 0,
        groundHeight: spawnPosition.height || 0,
        ceilingHeight: enableBots ? (gameMap.elevator?.ceiling||gameMap.ceiling) : gameMap.ceiling,
        zone:spawnPosition.zone??spawnPosition.sectorId,
        sectorId:spawnPosition.sectorId??spawnPosition.zone,
        spawnShieldUntil:enableBots?undefined:matchStartedAt+PVP_SPAWN_SHIELD_MS,
      };
      if(strikeId)activePlayer.strikeLastSafe={x:activePlayer.x,y:activePlayer.y,
        height:activePlayer.height,groundHeight:activePlayer.groundHeight,angle:activePlayer.angle,
        zone:activePlayer.zone,sectorId:activePlayer.sectorId,recordedAt:matchStartedAt};
      activePlayers.push(activePlayer);
      if(debugDouble&&player.id===socket.id) {
        const cloneId=`debug-clone:${player.id}`;
        const cloneSpawn=getValidSpawnPosition(solids(),activePlayers);
        activePlayers.push({...activePlayer,id:cloneId,name:`${player.name} · CLONE`,
          displayName:`${player.displayName||player.name} · CLONE`,debugCloneOf:player.id,
          x:cloneSpawn.x,y:cloneSpawn.y,height:cloneSpawn.height||0,groundHeight:cloneSpawn.height||0,
          team:cloneId,angle:Math.atan2(spawnPosition.y-cloneSpawn.y,spawnPosition.x-cloneSpawn.x),
          grenadeChargeAt:null,lastShotAt:0,lastProcessedInput:undefined});
      }
    }

    if (botCount > 0 && !strikeId) {
      createBotsForCurrentMatch(botCount);
    }

    io.emit("gameStarting", { players: activePlayers.map(playerSnapshot), walls, map: gameMap,
      serverNow:matchStartedAt });
    if(enableBots&&!strikeId) publishFloorState();
    if(strikeId)publishStrikeState();
    if (options.manageRooms !== false) io.socketsLeave("waiting");
    console.log(
      "Game started with",
      activePlayers.length,
      "players",
      activePlayers.some(player=>player.isBot)?`(including ${activePlayers.filter(player=>player.isBot).length} bots)`:"",
    );
  }

  function handlePlayerUpdate(socket, data) {
    if(data&&Array.isArray(data.inputs)){
      if(!gameInProgress.status||gameOverTimeout||!Number.isFinite(data.angle)||data.inputs.length>32)return;
      const player=activePlayers.find(p=>p.id===socket.id);if(!player?.alive)return;
      player.usesMovementInputs=true;
      const now=Date.now();player.angle=data.angle;
      // Token budget accommodates batching/jitter without allowing packet spam
      // or forged durations to turn into unlimited movement speed.
      player.inputBudget=Math.min(0.3,(player.inputBudget??0.25)+Math.max(0,now-(player.inputBudgetAt??now))/1000);
      player.inputBudgetAt=now;
      if(!riding())updateCargoLifts(gameMap,activePlayers,now);
      for(const input of data.inputs){
        if(!Number.isSafeInteger(input.seq)||input.seq<=0||input.seq<=(player.lastProcessedInput||0)||
          ![input.dx,input.dy,input.dt].every(Number.isFinite)||input.dt<=0||input.dt>0.05||
          Math.abs(input.dx)>1||Math.abs(input.dy)>1||!Number.isSafeInteger(input.epoch)||input.epoch<0)continue;
        player.lastProcessedInput=input.seq;
        if(input.epoch!==(player.movementEpoch||0))continue;
        const dt=Math.min(input.dt,player.inputBudget);player.inputBudget-=dt;
        if(dt>0)applyMovementInput(player,{...input,dt,jump:input.jump===true},gameMap,solids(),now,travelCabin());
      }
      rememberStrikeSafePosition(player,now);
      queueSnapshot();return;
    }
    if (!gameInProgress.status || gameOverTimeout || riding() || !data ||
        ![data.x, data.y, data.angle].every(Number.isFinite)) return;
    const player = activePlayers.find((p) => p.id === socket.id);
    if (player && player.alive) {
      if(player.usesMovementInputs)return;
      if(player.knockback){player.angle=data.angle;return;}
      const previousX=player.x,previousY=player.y,moveNow=Date.now();
      const x = Math.max(MOVEMENT.radius, Math.min(gameMap.width - MOVEMENT.radius, data.x));
      const y = Math.max(MOVEMENT.radius, Math.min(gameMap.height - MOVEMENT.radius, data.y));
      if (gameMap.ceiling) {
        updateCargoLifts(gameMap,activePlayers,Date.now());
        advanceJump(player, Date.now());
        moveOnTerrain(player, x, y, gameMap, solids(), Date.now());
      } else if (!circleCollidesAnyWall(x, y, MOVEMENT.radius - 0.1, gameWalls) &&
          !lineIntersectsAnyWall(player.x, player.y, x, y, gameWalls)) {
        player.x = x;
        player.y = y;
      }
      if(Math.hypot(player.x-previousX,player.y-previousY)>0.01)player.lastMovementAt=moveNow;
      player.angle = data.angle;
      rememberStrikeSafePosition(player,moveNow);

      queueSnapshot();
    }
  }

  function handleShoot(socket, bulletData) {
    const player = activePlayers.find((p) => p.id === socket.id);
    if (!bulletData || !Number.isFinite(bulletData.angle)) return;
    const pitch = bulletData.pitch ?? 0;
    if (!Number.isFinite(pitch) || Math.abs(pitch) > 1.35) return;
    fireHitscan(player, bulletData.angle, pitch);
  }

  function handleSwitchWeapon(socket) {
    const player=activePlayers.find(p=>p.id===socket.id);
    const now=Date.now();
    if(!gameInProgress.status||gameOverTimeout||!player?.alive||player.isBot||
      !player.primaryWeapon||now<(player.weaponSwapUntil||0))return false;
    const useSecondary=player.weapon!==SECONDARY_WEAPON_KEY;
    player.weapon=useSecondary?SECONDARY_WEAPON_KEY:player.primaryWeapon;
    player.weaponSkinKey=useSecondary?player.secondaryWeaponSkinKey:player.primaryWeaponSkinKey;
    player.miniGunSpinStartedAt=null;
    player.miniGunLastAttemptAt=null;
    player.weaponSwapUntil=now+WEAPON_SWITCH_MS;
    io.emit('weaponSwitched',{id:player.id,weapon:player.weapon,weaponSkinKey:player.weaponSkinKey,
      weaponSwapUntil:player.weaponSwapUntil});
    queueSnapshot();return true;
  }

  function fireHitscan(player, angle, pitch = 0) {
    if (!gameInProgress.status || gameOverTimeout || riding() || !player || !player.alive) return false;
    const now = Date.now();
    if(now<(player.weaponSwapUntil||0))return false;
    const weaponConfig=WEAPONS[player.weapon] || WEAPONS.pistol;
    if(player.weapon==='miniGun'&&!player.isBot) {
      const released=player.miniGunLastAttemptAt==null||
        now-player.miniGunLastAttemptAt>weaponConfig.triggerReleaseMs;
      if(released)player.miniGunSpinStartedAt=now;
      player.miniGunLastAttemptAt=now;
      if(now-(player.miniGunSpinStartedAt??now)<weaponConfig.spinUpMs)return false;
    }
    const cooldown = weaponConfig.cooldownMs;
    if (now - (player.lastShotAt || 0) < cooldown) return false;
    if(player.weapon==='shotgun') {
      if(now<(player.shotgunReloadUntil||0))return false;
      if(player.shotgunShotsRemaining==null||player.shotgunShotsRemaining===0)
        player.shotgunShotsRemaining=WEAPONS.shotgun.shotsPerReload;
      player.shotgunShotsRemaining--;
      player.shotgunReloadUntil=player.shotgunShotsRemaining===0?now+WEAPONS.shotgun.reloadMs:0;
      queueSnapshot();
    }
    if(!player.isBot)activatePveEncounter();
    player.lastShotAt = now;
    player.angle = angle;
    updateCargoLifts(gameMap,activePlayers,now);
    for (const active of activePlayers) advanceJump(active, now);
    // An actual, unobstructed shot at the rear button can bypass the normal
    // departure timer, but never enemy clearance or missing living teammates.
    if(!player.isBot&&hitsElevatorOverride(player,angle,pitch,gameMap,gameWalls))startElevatorRide(now);
    if(player.weapon==='shotgun') {
      const {pellets,damage}=traceShotgun(player,angle,pitch,gameWalls,activePlayers,
        target=>canDamage(player,target),gameMap);
      const reactorHits=pellets.map(pellet=>strikeDestructibleHit(player,pellet)).filter(Boolean);
      const reactorDamage=reactorHits.reduce((sum,hit)=>sum+
        Math.max(1,12-Math.max(0,hit.distance-100)/30),0);
      const reactorHit=reactorHits.length?{...reactorHits[0],damage:reactorDamage}:null;
      const shotgunBarrel=WEAPONS.shotgun.shotsPerReload-1-player.shotgunShotsRemaining;
      io.emit('shotFired',{...pellets[0],pellets,shotgunBarrel,weaponSkinKey:player.weaponSkinKey,
        bulletId:nextBulletId++,...(reactorHit?{strikeTargetId:reactorHit.target.id,
          strikeTargetDamage:reactorHit.damage}: {})});
      for(const [targetId,amount] of damage)handlePlayerHit({targetId,shooterId:player.id},
        amount*(player.isBot?BOT_COMBAT.damageScale:1));
      if(reactorHit)damageStrikeDestructible(reactorHit,player,now);
      return true;
    }
    const trace=player.weapon==='sniper'?tracePiercingShot:traceShot;
    const bloom=player.weapon==='sniper'&&!player.isBot?sniperBloomRadians(player,now):0;
    const aim=spreadSniperAim(angle,pitch,bloom);
    const shot = trace(player, aim.angle, gameWalls, activePlayers,
      target => canDamage(player, target), aim.pitch, gameMap);
    if(bloom>0)shot.bloom=bloom;
    shot.bulletId = nextBulletId++;
    const reactorHit=strikeDestructibleHit(player,shot);
    if(reactorHit) {
      reactorHit.damage=strikeWeaponDamage(player,reactorHit.distance);
      shot.strikeTargetId=reactorHit.target.id;shot.strikeTargetDamage=reactorHit.damage;
    }
    io.emit("shotFired", shot);
    for(const targetId of shot.targetIds||(shot.targetId?[shot.targetId]:[]))
      handlePlayerHit({ targetId, shooterId: player.id });
    if(reactorHit)damageStrikeDestructible(reactorHit,player,now);
    return true;
  }

  function handlePlayerHit(payload, specialDamage) {
    const now = Date.now();
    let targetId = typeof payload === "string" ? payload : payload && payload.targetId;
    const shooterId = payload && payload.shooterId ? payload.shooterId : null;

    const target = activePlayers.find((p) => p.id === targetId);
    if (!target || !target.alive) return;

    const shooter = shooterId ? activePlayers.find((p) => p.id === shooterId) : null;

    if (shooter && !canDamage(shooter, target)) {
      return;
    }

    if (shooter && shooter.isBot) {
      const shooterState =
        shooter.botState && typeof shooter.botState === "object"
          ? shooter.botState
          : (shooter.botState = {});
      shooterState.lastDamageDealtAt = now;
    }

    if (target && target.isBot) {
      const targetState =
        target.botState && typeof target.botState === "object"
          ? target.botState
          : (target.botState = {});
      targetState.lastDamageTakenAt = now;
    }

    let damage = WEAPON_DAMAGE.pistol;
    if (shooter && typeof WEAPON_DAMAGE[shooter.weapon] === "number") {
      damage = WEAPON_DAMAGE[shooter.weapon];
    }
    if (shooter?.weapon === 'miniGun') {
      // Keep the close/medium punch, then taper across the long-range band.
      // Up to 50: 4 HP; 150–350: 2 HP; 500: 1.25 HP; 650: 0.5 HP.
      const distance = Math.hypot(target.x - shooter.x, target.y - shooter.y);
      damage = distance <= 150
        ? damage - Math.max(0, distance - 50) * ((damage - 2) / 100)
        : distance <= 350 ? 2
        : distance <= 650 ? 2 - (distance - 350) * (1.5 / 300)
        : Math.max(0.15, 0.5 - (distance - 650) * 0.00175);
    }
    if (shooter?.isBot) damage *= BOT_COMBAT.damageScale;
    if (shooter?.botType==='dread') damage=DREAD_COMBAT.damage;
    if (shooter?.botType==='warden') damage=wardenCarbineConfig(shooter).damage;
    if (specialDamage !== undefined) damage = specialDamage;

    target.health = Math.max(0, (target.health ?? MAX_HEALTH) - damage);
    if(gameMap.activity==='strike'&&(target.boss||target.botType==='warden'))
      updateStrikeBossState(target,now);
    if(target.isBot && target.health>0 && damage>0) {
      // Bring the old residual velocity to the hit timestamp before adding the
      // next impulse, so rapid shots stack without gaining a tick of free force.
      advanceKnockback(target,now,gameMap,solids());
      const source=payload?.origin||shooter;
      const reaction=recordEnemyHit(target,source,payload?.kind||shooter?.weapon||'pistol',damage,now);
      // Heavy Ogres can be driven out of a charged laser, but an already
      // committed ground slam still lands. Their resistance keeps this rare.
      if(reaction.fearStarted&&target.botType==='ogre'&&target.ogreAttack?.kind==='laser') {
        target.ogreAttack=null;
        target.botState.ogreReadyAt=Math.max(target.botState.ogreReadyAt||0,now+700);
      }
    }
    if(cooperative() && target.isBot && damage>0) {
      alertNearbyBots(target,shooter,activePlayers.filter(p=>p!==target || target.health>0),now,target.health<=0);
    }
    if (target.health <= 0) {
      target.alive = false;
      if(gameMap.activity==='strike'&&!target.isBot)prepareStrikeReviveBeacon(target,now);
      const death=deathDescriptor(target,payload?.origin||shooter,payload?.kind||shooter?.weapon||'pistol',gameMap,gameWalls);
      io.emit("playerKilled", target.id,death);
      if(gameMap.activity==='strike'&&!target.isBot)publishStrikeState();
      if(cooperative()) {
        const pickup=makeDeathPickup(target,death,nextPickupId++,now);
        if(pickup){if(pickups.length>=16)pickups.shift();pickups.push(pickup);}
      }

      if (shooter && shooter.accountUsername) {
        const shooterUsername = shooter.accountUsername;
        const targetUsername = target && target.accountUsername;
        const sameAccountKill =
          typeof targetUsername === "string" && shooterUsername === targetUsername;
        const shooterNamedAsBot = isBotAlliedName(shooter.displayName || shooter.name);
        const killedBot = !!(target && target.isBot);

        if (!sameAccountKill && !(!cooperative() && shooterNamedAsBot && killedBot)) {
          const accountUser = usersByUsername.get(shooterUsername);
          if (accountUser) {
            if (!accountUser.currencies || typeof accountUser.currencies !== "object") {
              accountUser.currencies = {};
            }
            const currentCoins =
              typeof accountUser.currencies.Coins === "number"
                ? accountUser.currencies.Coins
                : 0;
            const newCoins = currentCoins + killCoinReward(target);
            accountUser.currencies.Coins = newCoins;
            const killWeapon = payload?.kind === 'grenade' ? null : shooter.weapon;
            const stats = recordUserKill(accountUser, cooperative()?'pve':gameMap.mode, killWeapon, { persist: false });
            saveUsers();

            io.to(shooter.id).emit("coinsUpdated", { coins: newCoins });
            io.to(shooter.id).emit("statsUpdated", stats);
          }
        } else {
          console.log(
            `Skipping coin reward: ${shooterUsername} eliminated same-account player.`,
          );
        }
      }
    }

    queueSnapshot();
    maybeTriggerGameOver();
  }

  function handleDisconnect(socket) {
    const waitingIndex = waitingPlayers.findIndex((p) => p.id === socket.id);
    if (waitingIndex !== -1) {
      waitingPlayers.splice(waitingIndex, 1);
      io.to("waiting").emit("updateWaitingList", waitingPlayers);
    }

    // Treat a debug owner and every clone derived from that socket as one
    // lifecycle unit. Scan independently of the owner record so an orphaned
    // clone can never keep a match alive after a reordered/double disconnect.
    const departed=[];
    for(let i=activePlayers.length-1;i>=0;i--) {
      const player=activePlayers[i];
      if(player.id!==socket.id&&player.debugCloneOf!==socket.id)continue;
      departed.push(player.id);activePlayers.splice(i,1);
    }
    for(const id of departed)io.emit('playerLeft',id);
    if(departed.length) {
      // With nobody left there is no winner or result screen to wait for.
      // Reset synchronously so the reconnecting owner can start another debug
      // match, while resetGame deliberately leaves a next lobby untouched.
      if(!cooperative()&&activePlayers.length===0)resetGame();
      else maybeTriggerGameOver();
    }

    console.log("Disconnected:", socket.id);
  }

  function parseJoinPayload(payload, fallbackName) {
    let displayName = "";
    let weapon = DEFAULT_WEAPON_KEY;

    if (typeof payload === "string") {
      displayName = payload;
    } else if (payload && typeof payload === "object") {
      displayName = String(payload.displayName || payload.name || "");
      if (typeof payload.weapon === "string") {
        const key = payload.weapon;
        const allowed = new Set(Object.keys(WEAPONS).filter(key=>WEAPONS[key].selectable!==false));
        weapon = allowed.has(key) ? key : DEFAULT_WEAPON_KEY;
      }
    }

    displayName = displayName.substring(0, 24);
    if (!displayName) {
      displayName = fallbackName;
    }

    return { displayName, weapon };
  }

  function buildWaitingPlayer(socket, displayName, weapon) {
    const playerColor = colors[Math.floor(Math.random() * colors.length)];
    const equipped=socket.user?.skins?.equippedByWeapon||{};
    const primaryWeaponSkinKey=equipped[weapon]||DEFAULT_SKIN_BY_WEAPON[weapon]||null;
    const secondaryWeaponSkinKey=equipped[SECONDARY_WEAPON_KEY]||DEFAULT_SKIN_BY_WEAPON[SECONDARY_WEAPON_KEY]||null;
    return {
      id: socket.id,
      name: displayName,
      displayName,
      accountUsername: socket.user.username,
      color: playerColor,
      weapon,
      weaponSkinKey:primaryWeaponSkinKey,
      primaryWeapon:weapon,
      primaryWeaponSkinKey,
      secondaryWeapon:SECONDARY_WEAPON_KEY,
      secondaryWeaponSkinKey,
    };
  }

  function latePveJoinState() {
    if(!gameInProgress.status||gameMap.mode!=='pve'||gameMap.activity==='strike')return null;
    return {
      players:activePlayers.map(playerSnapshot),
      walls:gameWalls,
      map:gameMap,
      state:{...floorState,serverNow:Date.now()},
      spawnFloor:(gameMap.floor||floorState.floor||1)+1,
    };
  }

  function queueLatePveJoin(socket,payload) {
    const state=latePveJoinState();
    if(!state||!socket?.user||activePlayers.some(player=>player.id===socket.id))return null;
    handleJoin(socket,payload);
    if(!waitingPlayers.some(player=>player.id===socket.id))return null;
    // A queued operative is already participating in this match lifecycle:
    // include them in wipe/reset delivery even though combat authority begins
    // only when the next floor packet promotes them into activePlayers.
    matchParticipantIds.add(socket.id);
    return state;
  }

  function scheduleGameOver(winner) {
    if (gameOverTimeout) return;
    // People may already be assembling the next lobby during the result
    // screen. Never broadcast an old match's delayed lifecycle events to
    // every connected socket.
    const recipients = [...matchParticipantIds];
    if (recipients.length > 0) io.to(recipients).emit("gameOver", winner);
    gameOverTimeout = setTimeout(() => {
      resetGame(recipients);
    }, 5000);
  }

  function maybeTriggerGameOver() {
    if (!gameInProgress.status || gameOverTimeout) return;

    const alivePlayers = activePlayers.filter((p) => p.alive);
    if (cooperative()) {
      if (!alivePlayers.some(p => !p.isBot)) scheduleGameOver({ name: 'Bots', team: 'bots' });
      else if(gameMap.activity==='strike') {
        if(strikeState?.phase==='combat'&&!alivePlayers.some(player=>player.isBot)&&
          !(strikeState.pendingGroupIndexes||[]).length)
          clearStrikeCombatPhase(Date.now());
      }
      else if (!alivePlayers.some(p => p.isBot) && floorState.phase === 'combat') {
        floorState = { phase: 'ready', floor: gameMap.floor, startedAt: Date.now() };
        publishFloorState();
      }
      return;
    }
    if (alivePlayers.length === 0) return;

    const aliveHumans = alivePlayers.filter((p) => !p.isBot);
    if (aliveHumans.length === 0) {
      scheduleGameOver({ name: "Bots" });
      return;
    }

    if (alivePlayers.length === 1) {
      scheduleGameOver(alivePlayers[0]);
    }
  }

  function resetGame(recipients = []) {
    grenades.length=0;
    guardianProjectiles.length=0;
    pickups.length=0;
    navigation.close();snapshotDirty=false;
    if (gameOverTimeout) {
      clearTimeout(gameOverTimeout);
      gameOverTimeout = null;
    }
    activePlayers.length = 0;
    gameWalls.length = 0;
    gameInProgress.status = false;
    nextBotId = 1;
    gameMap = DEFAULT_MAP; squadOrders.clear(); lastRegenAt = 0;pveEncounterActive=true;strikeState=null;
    strikeHazardTickAt.clear();strikeHazardSignature='';strikeHazardPublishedAt=0;
    floorState = {phase:'combat',floor:1,startedAt:0}; floorBotCount = 0;
    // Reset bullet bookkeeping between matches
    clearActiveBullets(activeBullets);
    nextBulletId = 1;
    if (recipients.length > 0) io.to(recipients).emit("resetGame");
    matchParticipantIds.clear();
    if (typeof options.onReset === 'function') options.onReset(recipients);
    console.log("Game reset");
  }

  function getValidSpawnPosition(walls, existingPlayers = []) {
    const PLAYER_RADIUS = MOVEMENT.radius;
    const CANVAS_WIDTH = gameMap.width;
    const CANVAS_HEIGHT = gameMap.height;
    const MIN_SPAWN_DISTANCE = 150; // keep players spaced to avoid instant kills
    const MAX_ATTEMPTS = 1000; // generous to accommodate stricter constraints

    // Helper: circle-rect overlap
    function overlapsAnyWall(px, py, footHeight = 0) {
      // Authored PvP spawns may live on catwalks. Collision must therefore be
      // evaluated in 3D: the supporting deck is legal at its top and raised
      // bridges do not incorrectly block a ground spawn beneath them.
      return !canOccupy(px,py,footHeight,walls,PLAYER_RADIUS,0.001,2.2);
    }

    // Evaluate candidate with respect to existing players
    function candidateIsValid(cx, cy, footHeight = 0) {
      // Not inside or overlapping walls
      if (overlapsAnyWall(cx, cy, footHeight)) return false;

      for (const p of existingPlayers) {
        if (!p || !p.alive) continue;
        // Keep a minimum spacing
        const dx = cx - p.x;
        const dy = cy - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < MIN_SPAWN_DISTANCE) return false;
        // Require at least one wall blocking direct LOS
        const blocked = lineIntersectsAnyWall(cx, cy, p.x, p.y, walls);
        if (!blocked) return false;
      }
      return true;
    }

    // Authored maps provide reviewed spawn pockets. Score those first, while
    // retaining random sampling as a fallback for The Maze and full lobbies.
    let best = null;
    let bestScore = -Infinity;

    const preferred=[...(gameMap.spawns||[])];
    if(preferred.length) {
      const offset=Math.floor(Math.random()*preferred.length);
      preferred.push(...preferred.splice(0,offset));
      for(const spawn of preferred) {
        if(candidateIsValid(spawn.x,spawn.y,spawn.height||0))return {...spawn};
        let blockedCount=0,minDist=Infinity;
        for(const p of existingPlayers) {
          if(!p?.alive)continue;
          minDist=Math.min(minDist,Math.hypot(spawn.x-p.x,spawn.y-p.y));
          if(lineIntersectsAnyWall(spawn.x,spawn.y,p.x,p.y,walls))blockedCount++;
        }
        const score=blockedCount*10000+(isFinite(minDist)?minDist:0);
        if(score>bestScore&&!overlapsAnyWall(spawn.x,spawn.y,spawn.height||0)){
          bestScore=score;best={...spawn};
        }
      }
    }

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const x = Math.random() * (CANVAS_WIDTH - 2 * PLAYER_RADIUS) + PLAYER_RADIUS;
      const y = Math.random() * (CANVAS_HEIGHT - 2 * PLAYER_RADIUS) + PLAYER_RADIUS;

      if (candidateIsValid(x, y)) {
        return { x, y };
      }

      // Fallback scoring: maximize number of blocked LOS, then maximize min distance
      let blockedCount = 0;
      let minDist = Infinity;
      for (const p of existingPlayers) {
        if (!p || !p.alive) continue;
        const dx = x - p.x;
        const dy = y - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDist) minDist = dist;
        if (lineIntersectsAnyWall(x, y, p.x, p.y, walls)) blockedCount++;
      }
      const score = blockedCount * 10000 + (isFinite(minDist) ? minDist : 0);
      if (score > bestScore && !overlapsAnyWall(x, y)) {
        bestScore = score;
        best = { x, y };
      }
    }

    // If strict constraints fail, use the best-scoring safe spot (still not overlapping walls)
    if (best) return best;

    // As a last resort, place anywhere not overlapping walls
    for (let attempt = 0; attempt < 200; attempt++) {
      const x = Math.random() * (CANVAS_WIDTH - 2 * PLAYER_RADIUS) + PLAYER_RADIUS;
      const y = Math.random() * (CANVAS_HEIGHT - 2 * PLAYER_RADIUS) + PLAYER_RADIUS;
      if (!overlapsAnyWall(x, y)) return { x, y };
    }

    // Extremely unlikely fallback
    return { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 };
  }

  function generateWalls() {
    const CANVAS_WIDTH = 900;
    const CANVAS_HEIGHT = 600;
    const MIN_WALL_LENGTH = 80;
    const MAX_WALL_LENGTH = 260;
    const MIN_WALL_THICKNESS = 18;
    const MAX_WALL_THICKNESS = 36;
    const NUM_WALLS = Math.floor(Math.random() * 5) + 8; // 8-12 walls

    const walls = [];

    // Generate walls
    for (let i = 0; i < NUM_WALLS; i++) {
      const isHorizontal = Math.random() > 0.5;
      const length =
        Math.floor(Math.random() * (MAX_WALL_LENGTH - MIN_WALL_LENGTH)) +
        MIN_WALL_LENGTH;
      const thickness =
        Math.floor(Math.random() * (MAX_WALL_THICKNESS - MIN_WALL_THICKNESS)) +
        MIN_WALL_THICKNESS;
      const width = isHorizontal ? length : thickness;
      const height = isHorizontal ? thickness : length;

      // No overlap checks: intersections are allowed to make layouts feel denser.
      const x = Math.floor(Math.random() * (CANVAS_WIDTH - width));
      const y = Math.floor(Math.random() * (CANVAS_HEIGHT - height));

      walls.push({ x, y, width, height });
    }

    return walls;
  }

  function invalidateCachedNavGrid() {
    cachedNavGrid = null;
  }

  function getNavGrid(walls) {
    if (
      cachedNavGrid &&
      cachedNavGrid.version === wallLayoutVersion &&
      cachedNavGrid.walkable &&
      cachedNavGrid.walkable.length > 0
    ) {
      return cachedNavGrid;
    }
    cachedNavGrid = buildNavGrid(walls);
    cachedNavGrid.version = wallLayoutVersion;
    return cachedNavGrid;
  }

  function buildNavGrid(walls) {
    const elevated=cooperative();
    // Bots use the permanent stairs, never plan a path through a timed lift.
    if(elevated)walls=walls.map(s=>s.kind==='lift'?{...s,top:s.maxTop}:s.liftId?{...s,bottom:0,top:gameMap.ceiling}:s);
    const surfaces=elevated?walls.filter(s=>s.walkable||s.kind==='ramp'):[];
    const radius = BOT_CONFIG.playerRadius;
    const cellSize = cooperative() ? 16 : Math.max(4, Math.floor(radius / 2));
    const width = BOT_CONFIG.canvasWidth;
    const height = BOT_CONFIG.canvasHeight;
    const cols = Math.ceil(width / cellSize);
    const rows = Math.ceil(height / cellSize);
    const walkable = new Array(rows);

    for (let r = 0; r < rows; r++) {
      walkable[r] = new Array(cols);
      for (let c = 0; c < cols; c++) {
        const wx = c * cellSize + cellSize / 2;
        const wy = r * cellSize + cellSize / 2;
        const insideBounds =
          wx >= radius &&
          wx <= width - radius &&
          wy >= radius &&
          wy <= height - radius;
        const blocked =
          !insideBounds ||
          (elevated?!canOccupy(wx,wy,groundHeight(wx,wy,surfaces),walls,radius,navStepAllowance(wx,wy,surfaces)):circleCollidesAnyWall(wx, wy, radius, walls));
        walkable[r][c] = !blocked;
      }
    }

    return {
      cellSize,
      cols,
      rows,
      walkable,
      radius,
      width,
      height,
      walls,
      elevated,surfaces,
      version: wallLayoutVersion,
    };
  }

  function collidesWithBulletsForPath(x, y, radius, bullets) {
    if (!bullets || bullets.length === 0) return false;
    for (const b of bullets) {
      if (!b || typeof b.x !== "number" || typeof b.y !== "number") continue;
      const avoidRadius = BOT_CONFIG.playerRadius;
      const dx = x - b.x;
      const dy = y - b.y;
      if (dx * dx + dy * dy < (avoidRadius + radius) * (avoidRadius + radius)) {
        return true;
      }
    }
    return false;
  }

  function isCellClear(nav, col, row, bullets) {
    if (!isCellWithinBounds(nav, col, row)) return false;
    if (!nav.walkable[row] || !nav.walkable[row][col]) return false;
    const pos = gridToWorld(col, row, nav);
    return !collidesWithBulletsForPath(pos.x, pos.y, nav.radius, bullets);
  }

  function findNearestClearCell(nav, startCol, startRow, bullets, maxRing = 8) {
    if (isCellClear(nav, startCol, startRow, bullets)) {
      return { col: startCol, row: startRow };
    }
    for (let ring = 1; ring <= maxRing; ring++) {
      for (let dr = -ring; dr <= ring; dr++) {
        for (let dc = -ring; dc <= ring; dc++) {
          if (Math.abs(dc) !== ring && Math.abs(dr) !== ring) continue;
          const col = startCol + dc;
          const row = startRow + dr;
          if (isCellClear(nav, col, row, bullets)) {
            return { col, row };
          }
        }
      }
    }
    return null;
  }

  function navStepAllowance(x,y,surfaces) {
    return surfaces.some(s=>s.kind==='ramp'&&x>=s.x&&x<=s.x+s.width&&y>=s.y&&y<=s.y+s.height)?0.28:0.001;
  }

  function directPathClear(ax, ay, bx, by, nav, bullets) {
    if(nav.elevated) {
      const p={x:ax,y:ay,height:groundHeight(ax,ay,nav.surfaces)};
      if(!moveOnTerrain(p,bx,by,gameMap,nav.walls,0)||p.jumpStartedAt!=null)return false;
    }
    const dx = bx - ax;
    const dy = by - ay;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1e-3) return true;
    const step = Math.max(4, nav.radius * 0.5);
    const steps = Math.max(1, Math.ceil(dist / step));

    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const px = ax + dx * t;
      const py = ay + dy * t;
      if (isPositionBlockedForPath(px, py, nav, bullets)) {
        return false;
      }
    }

    return true;
  }

  function isPositionBlockedForPath(x, y, nav, bullets) {
    const radius = nav.radius;
    if (
      x < radius ||
      x > nav.width - radius ||
      y < radius ||
      y > nav.height - radius
    ) {
      return true;
    }
    if(nav.elevated) {
      if(!canOccupy(x,y,groundHeight(x,y,nav.surfaces),nav.walls,radius,navStepAllowance(x,y,nav.surfaces)))return true;
    } else if (circleCollidesAnyWall(x, y, radius, nav.walls)) return true;
    if (collidesWithBulletsForPath(x, y, radius, bullets)) return true;
    return false;
  }

  function isTouchingBoundary(x, y, radius, width, height, margin = 1) {
    return (
      x <= radius + margin ||
      x >= width - radius - margin ||
      y <= radius + margin ||
      y >= height - radius - margin
    );
  }

  function smoothPath(points, nav, bullets) {
    if (!points || points.length <= 2) return points || [];
    const smoothed = [points[0]];
    let anchor = 0;
    while (anchor < points.length - 1) {
      let next = anchor + 1;
      for (let i = points.length - 1; i > anchor; i--) {
        if (
          directPathClear(
            points[anchor].x,
            points[anchor].y,
            points[i].x,
            points[i].y,
            nav,
            bullets,
          )
        ) {
          next = i;
          break;
        }
      }
      smoothed.push(points[next]);
      anchor = next;
    }
    return smoothed;
  }

  function pathCost(points) {
    if (!points || points.length < 2) return 0;
    let cost = 0;
    for (let i = 1; i < points.length; i++) {
      const dx = points[i].x - points[i - 1].x;
      const dy = points[i].y - points[i - 1].y;
      cost += Math.hypot(dx, dy);
    }
    return cost;
  }

  function findPath(nav, startPos, goalPos, bullets) {
    if (!nav || !startPos || !goalPos) return null;
    const startCell = worldToGrid(startPos.x, startPos.y, nav);
    const goalCell = worldToGrid(goalPos.x, goalPos.y, nav);
    const validStart = isCellClear(nav, startCell.col, startCell.row, bullets)
      ? startCell
      : findNearestClearCell(nav, startCell.col, startCell.row, bullets);
    const validGoal = isCellClear(nav, goalCell.col, goalCell.row, bullets)
      ? goalCell
      : findNearestClearCell(nav, goalCell.col, goalCell.row, bullets);
    if (!validStart || !validGoal) return null;

    const startKey = cellKey(validStart.col, validStart.row);
    const goalKey = cellKey(validGoal.col, validGoal.row);
    const cameFrom = {};
    const gScore = { [startKey]: 0 };
    const fScore = {
      [startKey]: Math.hypot(
        validGoal.col - validStart.col,
        validGoal.row - validStart.row,
      ),
    };

    const open = [
      {
        key: startKey,
        f: fScore[startKey],
        col: validStart.col,
        row: validStart.row,
      },
    ];
    const openSet = new Set([startKey]);

    const directions = [
      { dc: 1, dr: 0, cost: 1 },
      { dc: -1, dr: 0, cost: 1 },
      { dc: 0, dr: 1, cost: 1 },
      { dc: 0, dr: -1, cost: 1 },
      { dc: 1, dr: 1, cost: Math.SQRT2 },
      { dc: -1, dr: 1, cost: Math.SQRT2 },
      { dc: 1, dr: -1, cost: Math.SQRT2 },
      { dc: -1, dr: -1, cost: Math.SQRT2 },
    ];

    while (open.length > 0) {
      let bestIdx = 0;
      for (let i = 1; i < open.length; i++) {
        if (open[i].f < open[bestIdx].f) {
          bestIdx = i;
        }
      }
      const current = open.splice(bestIdx, 1)[0];
      openSet.delete(current.key);

      if (current.key === goalKey) {
        const rawPath = reconstructPath(cameFrom, current.key, nav);
        return smoothPath(rawPath, nav, bullets);
      }

      for (const dir of directions) {
        const nCol = current.col + dir.dc;
        const nRow = current.row + dir.dr;
        if (!isCellWithinBounds(nav, nCol, nRow)) continue;
        if (!isCellClear(nav, nCol, nRow, bullets)) continue;
        if (dir.dc !== 0 && dir.dr !== 0) {
          if (
            !isCellClear(nav, current.col + dir.dc, current.row, bullets) ||
            !isCellClear(nav, current.col, current.row + dir.dr, bullets)
          ) {
            continue;
          }
        }

        const neighborKey = cellKey(nCol, nRow);
        const tentativeG = (gScore[current.key] ?? Infinity) + dir.cost;
        if (tentativeG >= (gScore[neighborKey] ?? Infinity)) continue;
        if(nav.elevated) {
          const a=gridToWorld(current.col,current.row,nav),b=gridToWorld(nCol,nRow,nav);
          if(!directPathClear(a.x,a.y,b.x,b.y,nav,bullets))continue;
        }

        cameFrom[neighborKey] = current.key;
        gScore[neighborKey] = tentativeG;
        fScore[neighborKey] =
          tentativeG +
          Math.hypot(validGoal.col - nCol, validGoal.row - nRow);

        if (!openSet.has(neighborKey)) {
          open.push({ key: neighborKey, f: fScore[neighborKey], col: nCol, row: nRow });
          openSet.add(neighborKey);
        } else {
          const existing = open.find((n) => n.key === neighborKey);
          if (existing) {
            existing.f = fScore[neighborKey];
          }
        }
      }
    }

    return null;
  }

  function reconstructPath(cameFrom, currentKey, nav) {
    const path = [];
    let key = currentKey;
    while (key) {
      const [c, r] = key.split(",").map((v) => parseInt(v, 10));
      path.push(gridToWorld(c, r, nav));
      key = cameFrom[key];
    }
    return path.reverse();
  }

  function computePathMovement(bot, botState, target, hasLineOfSight, now, walls, bullets) {
    if (!bot || !target) return null;
    const radius = BOT_CONFIG.playerRadius;
    const PATH_RECALC_TRAVEL = radius * 2.5;
    const PATH_RETRY_MS = 350;
    const STUCK_WINDOW_MS = 900;
    const STUCK_MIN_MOVEMENT = 12;
    const TOUCH_MARGIN = 1.5;
    const PROGRESS_WINDOW_MS = 450;
    const PROGRESS_EPS = Math.max(3, radius * 0.35);
    const PATH_REPLACE_COOLDOWN_MS = 600;
    const PATH_LOCK_MS = 700;
    const PATH_IMPROVEMENT_RATIO = 0.92;
    const GOAL_SHIFT_REPLAN_DIST = Math.max(radius * 1.5, 12);
    const LINGER_RADIUS = radius * 5;
    const LINGER_TIMEOUT_MS = 900;

    if (hasLineOfSight) {
      botState.navPath = null;
      botState.navPathIndex = 0;
      botState.navPathNeedsRecalc = false;
      botState.navForcePath = false;
      botState.navProgressTargetIdx = null;
      botState.navProgressCheckAt = null;
      botState.navLastBlockedAt = null;
      botState.navPathCost = null;
      botState.navPathLockUntil = null;
      botState.navLastGoalX = null;
      botState.navLastGoalY = null;
      botState.navLingerAnchorX = null;
      botState.navLingerAnchorY = null;
      botState.navLingerStart = null;
      return null;
    }

    const nav = getNavGrid(walls);

    if (typeof botState.navStuckSampleTime !== "number") {
      botState.navStuckSampleTime = now;
      botState.navStuckSampleX = bot.x;
      botState.navStuckSampleY = bot.y;
    } else if (now - botState.navStuckSampleTime >= STUCK_WINDOW_MS) {
      const dxSample = bot.x - botState.navStuckSampleX;
      const dySample = bot.y - botState.navStuckSampleY;
      const movedLittle =
        dxSample * dxSample + dySample * dySample <
        STUCK_MIN_MOVEMENT * STUCK_MIN_MOVEMENT;
      const touchingWall = circleCollidesAnyWall(
        bot.x,
        bot.y,
        radius + TOUCH_MARGIN,
        walls,
      );
      const touchingBounds = isTouchingBoundary(
        bot.x,
        bot.y,
        radius,
        BOT_CONFIG.canvasWidth,
        BOT_CONFIG.canvasHeight,
        TOUCH_MARGIN,
      );
      if (movedLittle && (touchingWall || touchingBounds)) {
        botState.navForcePath = true;
      }
      botState.navStuckSampleTime = now;
      botState.navStuckSampleX = bot.x;
      botState.navStuckSampleY = bot.y;
    }

    const pathActive =
      Array.isArray(botState.navPath) &&
      botState.navPath.length > 0 &&
      typeof botState.navPathIndex === "number" &&
      botState.navPathIndex < botState.navPath.length;
    if (
      !pathActive &&
      (!botState.navLastFailAt || now - botState.navLastFailAt >= PATH_RETRY_MS)
    ) {
      botState.navForcePath = true;
      botState.navPathNeedsRecalc = true;
    }
    const traveledSinceCalc =
      typeof botState.navLastCalcX === "number" && typeof botState.navLastCalcY === "number"
        ? Math.hypot(bot.x - botState.navLastCalcX, bot.y - botState.navLastCalcY)
        : 0;

    if (pathActive && traveledSinceCalc >= PATH_RECALC_TRAVEL) {
      botState.navPathNeedsRecalc = true;
    }

    // If we linger in the same small area for too long, force a replan to break oscillation.
    if (
      typeof botState.navLingerAnchorX !== "number" ||
      typeof botState.navLingerAnchorY !== "number"
    ) {
      botState.navLingerAnchorX = bot.x;
      botState.navLingerAnchorY = bot.y;
      botState.navLingerStart = now;
    } else {
      const dxL = bot.x - botState.navLingerAnchorX;
      const dyL = bot.y - botState.navLingerAnchorY;
      const distL = Math.hypot(dxL, dyL);
      if (distL > LINGER_RADIUS) {
        console.log("RECHANGING ANCHOR!!!")
        botState.navLingerAnchorX = bot.x;
        botState.navLingerAnchorY = bot.y;
        botState.navLingerStart = now;
      } else if (now - (botState.navLingerStart || 0) >= LINGER_TIMEOUT_MS) {
        console.log("RECALCULATING!!!")
        botState.navPathNeedsRecalc = true;
        botState.navForcePath = true;
        if (pathActive && botState.navPathIndex < botState.navPath.length - 1) {
          botState.navPathIndex += 1; // skip the sticky waypoint
        }
        botState.navLingerAnchorX = bot.x;
        botState.navLingerAnchorY = bot.y;
        botState.navLingerStart = now;
      }
    }

    // If we are not closing distance to the current waypoint, force a replan.
    if (pathActive) {
      const activeIdx = Math.max(
        0,
        Math.min(
          typeof botState.navPathIndex === "number" ? botState.navPathIndex : 0,
          botState.navPath.length - 1,
        ),
      );
      const wp = botState.navPath[activeIdx];
      const distToWp = Math.hypot(wp.x - bot.x, wp.y - bot.y);
      if (
        botState.navProgressTargetIdx !== activeIdx ||
        typeof botState.navProgressCheckAt !== "number"
      ) {
        botState.navProgressTargetIdx = activeIdx;
        botState.navProgressCheckAt = now;
        botState.navProgressLastX = bot.x;
        botState.navProgressLastY = bot.y;
        botState.navProgressLastDist = distToWp;
      } else if (now - botState.navProgressCheckAt >= PROGRESS_WINDOW_MS) {
        const movedSq =
          (bot.x - botState.navProgressLastX) * (bot.x - botState.navProgressLastX) +
          (bot.y - botState.navProgressLastY) * (bot.y - botState.navProgressLastY);
        const progress =
          (typeof botState.navProgressLastDist === "number" ? botState.navProgressLastDist : distToWp) -
          distToWp;
        if (progress < PROGRESS_EPS && movedSq < PROGRESS_EPS * PROGRESS_EPS) {
          botState.navPathNeedsRecalc = true;
          botState.navForcePath = true;
          if (botState.navPathIndex < botState.navPath.length - 1) {
            botState.navPathIndex += 1; // skip a sticky waypoint
          }
        }
        botState.navProgressCheckAt = now;
        botState.navProgressLastX = bot.x;
        botState.navProgressLastY = bot.y;
        botState.navProgressLastDist = distToWp;
      } else if (
        typeof botState.navProgressLastDist !== "number" ||
        distToWp < botState.navProgressLastDist
      ) {
        botState.navProgressLastDist = distToWp;
      }
    } else {
      botState.navProgressTargetIdx = null;
      botState.navProgressCheckAt = null;
    }

    let shouldComputePath = false;
    if (pathActive) {
      shouldComputePath = !!botState.navPathNeedsRecalc || !!botState.navForcePath;
    } else {
      shouldComputePath = !!botState.navForcePath || !!botState.navPathNeedsRecalc;
    }

    const canRetryFail = now - (botState.navLastFailAt || 0) >= PATH_RETRY_MS;
    if (shouldComputePath && (botState.navForcePath || canRetryFail)) {
      let path = findPath(nav, { x: bot.x, y: bot.y }, { x: target.x, y: target.y }, bullets);
      if (!path && bullets && bullets.length > 0) {
        path = findPath(nav, { x: bot.x, y: bot.y }, { x: target.x, y: target.y }, []); // fallback ignoring bullets
      }
      if (path && path.length > 0) {
        const newCost = pathCost(path);
        const currentCost =
          pathActive && typeof botState.navPathCost === "number"
            ? botState.navPathCost
            : pathCost(botState.navPath);
        const lastAccepted =
          typeof botState.navLastAcceptedAt === "number"
            ? botState.navLastAcceptedAt
            : 0;
        const goalShift =
          typeof botState.navLastGoalX === "number" &&
          typeof botState.navLastGoalY === "number"
            ? Math.hypot(target.x - botState.navLastGoalX, target.y - botState.navLastGoalY)
            : Infinity;
        const blockedRecently =
          typeof botState.navLastBlockedAt === "number" &&
          now - botState.navLastBlockedAt < PATH_RETRY_MS * 2;
        const locked =
          pathActive &&
          typeof botState.navPathLockUntil === "number" &&
          now < botState.navPathLockUntil;
        const cooldownMet =
          !pathActive || now - lastAccepted >= PATH_REPLACE_COOLDOWN_MS;
        const improved =
          !pathActive ||
          newCost < currentCost * PATH_IMPROVEMENT_RATIO ||
          goalShift > GOAL_SHIFT_REPLAN_DIST ||
          blockedRecently;

        const shouldReplace =
          botState.navForcePath ||
          !pathActive ||
          goalShift > GOAL_SHIFT_REPLAN_DIST ||
          blockedRecently ||
          (improved && cooldownMet);

        if (shouldReplace && (!locked || botState.navForcePath || blockedRecently || goalShift > GOAL_SHIFT_REPLAN_DIST)) {
          botState.navPath = path;
          botState.navPathIndex = path.length > 1 ? 1 : 0;
          botState.navPathNeedsRecalc = false;
          botState.navForcePath = false;
          botState.navLastCalcAt = now;
          botState.navLastCalcX = bot.x;
          botState.navLastCalcY = bot.y;
          botState.navLastFailAt = null;
          botState.navPathCost = newCost;
          botState.navLastAcceptedAt = now;
          botState.navLastGoalX = target.x;
          botState.navLastGoalY = target.y;
          botState.navPathLockUntil = now + PATH_LOCK_MS;
          botState.navFailCount = 0;
        } else {
          botState.navPathNeedsRecalc = false;
          botState.navForcePath = false;
          botState.navLastCalcAt = now;
          botState.navLastCalcX = bot.x;
          botState.navLastCalcY = bot.y;
        }
      } else {
        botState.navPath = null;
        botState.navPathIndex = 0;
        botState.navLastFailAt = now;
        botState.navForcePath = false;
        botState.navFailCount =
          typeof botState.navFailCount === "number" ? botState.navFailCount + 1 : 1;
      }
    }

    const stillActive =
      Array.isArray(botState.navPath) &&
      botState.navPath.length > 0 &&
      !hasLineOfSight;

    if (!stillActive) {
      return null;
    }

    let idx = Math.max(
      0,
      Math.min(
        typeof botState.navPathIndex === "number" ? botState.navPathIndex : 0,
        botState.navPath.length - 1,
      ),
    );
    const reachDist = Math.max(radius * 0.8, nav.cellSize * 0.75);
    let blockedPath = false;
    while (idx < botState.navPath.length) {
      const wp = botState.navPath[idx];
      const dx = wp.x - bot.x;
      const dy = wp.y - bot.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < reachDist) {
        idx += 1;
        continue;
      }
      if (!directPathClear(bot.x, bot.y, wp.x, wp.y, nav, bullets)) {
        botState.navPathNeedsRecalc = true;
        botState.navForcePath = true;
        botState.navLastBlockedAt = now;
        blockedPath = true;
        break;
      }
      botState.navPathIndex = idx;
      return {
        moveX: dx / (dist || 1e-6),
        moveY: dy / (dist || 1e-6),
        active: true,
      };
    }
    if (blockedPath) {
      return null;
    }
    botState.navPath = null;
    botState.navPathIndex = 0;
    return null;
  }

  function clearActiveBullets(bullets) {
    bullets.length = 0;
  }

  function findIncomingBulletThreat(bot, bullets, walls) {
    if (!bot || !bullets || bullets.length === 0) return null;
    const botRadius = BOT_CONFIG.playerRadius;
    const maxLookaheadSec = 1.5;
    let best = null;

    for (const b of bullets) {
      if (!b || b.shooterIsBot) continue;
      if (
        typeof b.x !== "number" ||
        typeof b.y !== "number" ||
        typeof b.vx !== "number" ||
        typeof b.vy !== "number"
      ) {
        continue;
      }

      const relX = b.x - bot.x;
      const relY = b.y - bot.y;
      const vDotV = b.vx * b.vx + b.vy * b.vy;
      if (vDotV < 1e-9) continue;

      const radiusSum = (typeof b.radius === "number" ? b.radius : DEFAULT_BULLET_RADIUS) + botRadius;
      const bCoef = 2 * (relX * b.vx + relY * b.vy);
      const c = relX * relX + relY * relY - radiusSum * radiusSum;
      const disc = bCoef * bCoef - 4 * vDotV * c;
      if (disc < 0) continue;
      const sqrtDisc = Math.sqrt(disc);
      const t1 = (-bCoef - sqrtDisc) / (2 * vDotV);
      const t2 = (-bCoef + sqrtDisc) / (2 * vDotV);
      const times = [t1, t2].filter((t) => t >= 0 && Number.isFinite(t));
      if (times.length === 0) continue;
      const tHit = Math.min(...times);
      if (tHit > maxLookaheadSec) continue;
      // rel dot v < 0 means bullet is moving toward the bot
      if (bCoef >= 0) continue;

      const hitX = b.x + b.vx * tHit;
      const hitY = b.y + b.vy * tHit;
      if (
        segmentCrossesWallDiscrete(b.x, b.y, hitX, hitY, walls, 2) ||
        lineIntersectsAnyWall(b.x, b.y, hitX, hitY, walls)
      ) {
        continue;
      }

      const incomingAngle = Math.atan2(b.vy, b.vx);
      if (!best || tHit < best.timeToImpact) {
        best = {
          bullet: b,
          timeToImpact: tHit,
          hitX,
          hitY,
          incomingAngle,
        };
      }
    }

    return best;
  }

  // --- Simple server-side bots (step 0) ---

  function getTeamSpawn(bot, index) {
    if(cooperative()) return floorSpawn(gameMap,bot,index);
    // Reserved, obstacle-free staging areas. Formation slots are spaced apart.
    const cols = 3;
    return { x: (bot ? 1600 : 90) + (index % cols) * 55,
      y: 480 + Math.floor(index / cols) * 55 };
  }

  function createBotsForCurrentMatch(count) {
    const difficulty = floorDifficulty(gameMap.floor, count);
    const elite = cooperative() && gameMap.floor > 20;
    const numBots = Math.max(
      0,gameMap.activity==='strike'?Math.floor(count||0):
        cooperative() ? difficulty.count : Math.min(count || 0, BOT_CONFIG.maxPerMatch),
    );
    if (numBots === 0) return;

    const guardianCount=Math.min(difficulty.guardians||0,Math.max(0,numBots-difficulty.ogres));
    const ogreStart=Math.max(0,numBots-difficulty.ogres);
    // Three Dread Captains replace ordinary soldiers from floor 21 onward.
    // Guardians subsequently replace more soldiers, while the Captains and four
    // Ogres remain part of the same floor-20-sized wave.
    const dreadStart=guardianCount;
    const dreadEnd=Math.min(ogreStart,dreadStart+(elite?3:0));
    for (let i = 0; i < numBots; i++) {
      const botId = `bot-${nextBotId++}`;
      const color =
        colors[(activePlayers.length + i) % colors.length] || "#888888";
      let spawn = cooperative() ? getTeamSpawn(true, i) : getValidSpawnPosition(gameWalls, activePlayers);
      const authoredType=gameMap.activity==='strike'?(spawn.botType||spawn.enemyType):null;
      const ogre = authoredType==='ogre'||(!authoredType&&cooperative() && i >= ogreStart);
      const guardian = authoredType==='guardian'||(!authoredType&&cooperative() && i < guardianCount);
      const dread = authoredType==='dread'||(!authoredType&&cooperative() && i >= dreadStart && i < dreadEnd);
      const captain = spawn.botRank==='captain'||(dread&&!authoredType);
      // Expanded waves use validated ground slots, including room for Ogre bodies.
      if(cooperative()) {
        const radius=spawn.bodyRadius??(ogre?30:guardian?28:20);
        const bodyHeight=spawn.bodyHeight??(ogre?3.8:guardian?2.6:2.2);
        const safe=p=>p.x>radius&&p.x<gameMap.width-radius&&p.y>radius&&p.y<gameMap.height-radius&&
          ![gameMap.arrivalElevator,gameMap.elevator].filter(Boolean).some(e=>p.x>e.x-radius&&p.x<e.x+e.width+radius&&p.y>e.y-radius&&p.y<e.y+e.height+radius)&&
          (!ogre||gameMap.activity==='strike'||!(p.height>0))&&canOccupy(p.x,p.y,(p.height||0)+(guardian?1.1:0),solids(),radius,0.001,bodyHeight)&&
          activePlayers.every(other=>Math.hypot(other.x-p.x,other.y-p.y)>(other.bodyRadius||20)+radius+8);
        if(gameMap.activity==='strike') {
          const local=resolveStrikePlacement(spawn,safe,{radius,bodyHeight});
          if(!local)continue;
          spawn=local;
        } else if(!safe(spawn)) {
          const candidates=[];
          const staging=gameMap.elevator||gameMap.playerSpawns?.[0]||{x:0,y:gameMap.height/2};
          for(let y=60;y<gameMap.height-50;y+=55)for(let x=60;x<gameMap.width-50;x+=55){
            const p={x,y,height:groundHeight(x,y,gameMap.terrain)};
            if(safe(p)&&Math.hypot(x-staging.x,y-staging.y)>350)candidates.push(p);
          }
          candidates.sort((a,b)=>Math.hypot(a.x-gameMap.botSpawn.x,a.y-gameMap.botSpawn.y)-Math.hypot(b.x-gameMap.botSpawn.x,b.y-gameMap.botSpawn.y));
          if(!candidates.length)continue;
          spawn=candidates[0];
        }
      }
      const strikeDefaultHealth=authoredType==='ogre'?360:authoredType==='guardian'?420:authoredType==='dread'?220:
        authoredType==='warden'?900:100;
      const defaultHealth=gameMap.activity==='strike'?strikeDefaultHealth:
        ogre ? 360 : guardian ? Math.min(520,420+(gameMap.floor-41)*4) :
          cooperative() ? difficulty.health+(captain?40:0) : BOT_COMBAT.health;
      const name=spawn.name||spawn.displayName||(ogre ? 'OGRE' : guardian ? `GUARDIAN ${i + 1}` :
        captain ? `DREAD CAPTAIN ${i + 1}` : dread ? `DREAD TROOPER ${i + 1}` :
        authoredType==='warden'?'THE WARDEN':`BOT ${i + 1}`);
      const bot = {
        id: botId,
        name,displayName:name,
        accountUsername: null,
        color: spawn.color||(authoredType==='warden'?'#b31528':guardian ? '#7c2fc4' :
          dread ? (captain?'#e6323f':'#991d2b') : cooperative() ? '#df8153' : color),
        weapon: spawn.weapon||BOT_CONFIG.weaponKey,
        weaponSkinKey:
          DEFAULT_SKIN_BY_WEAPON[spawn.weapon||BOT_CONFIG.weaponKey] || null,
        x: spawn.x,
        y: spawn.y,
        angle: 0,
        alive: true,
        health: spawn.health??defaultHealth,maxHealth:spawn.maxHealth??spawn.health??defaultHealth,
        botType: authoredType||(ogre ? 'ogre' : guardian ? 'guardian' : dread ? 'dread' : 'soldier'),
        botRank: spawn.botRank??(captain ? 'captain' : undefined),
        boss:!!spawn.boss,
        bodyRadius: spawn.bodyRadius??(ogre ? 30 : guardian ? 28 : 20),
        bodyHeight: spawn.bodyHeight??(ogre ? 3.8 : guardian ? 2.6 : 2.2),
        eyeHeight: spawn.eyeHeight??(ogre ? 2.8 : guardian ? 2.4 : 1.84),
        hoverOffset: spawn.hoverOffset??(guardian ? 1.1 : undefined),
        moveScale: spawn.moveScale??(cooperative() ? difficulty.speed*(ogre?0.7:guardian?0.82:1) : 1),
        isBot: true,
        team: 'bots',
        squad: gameMap.activity==='strike'&&Number.isSafeInteger(spawn.strikeSpawnGroupIndex)?
          spawn.strikeSpawnGroupIndex:Math.floor(i / 3),
        squadSlot: gameMap.activity==='strike'&&Number.isSafeInteger(spawn.strikeSpawnSlot)?spawn.strikeSpawnSlot:i%3,
        strikeSpawnGroup:spawn.strikeSpawnGroup,strikeSpawnRole:spawn.strikeSpawnRole,
        spawnReadyAt:gameMap.activity==='strike'?Date.now()+1200:undefined,
        zone:spawn.zone??spawn.sectorId,sectorId:spawn.sectorId??spawn.zone,
        height: spawn.height || 0, groundHeight: spawn.height || 0,
        botState: {
          lastShotAt: 0,
          homeBounds: (()=>{
            const zone=[...(gameMap.zones||[]),...(gameMap.strikeSectors||[])].find(value=>
              value.id===(spawn.zone??spawn.sectorId));
            const bounds=zone?.bounds||zone;
            return bounds?{minX:bounds.x+36,maxX:bounds.x+bounds.width-36,
              minY:bounds.y+36,maxY:bounds.y+bounds.height-36}:undefined;
          })(),
        },
      };
      activePlayers.push(bot);
    }
  }

  function computeScriptedBotAction(bot, players, walls) {
    if (!bot || !bot.alive) {
      return {
        moveX: 0,
        moveY: 0,
        aimAngle: bot ? bot.angle || 0 : 0,
        shoot: false,
      };
    }

    const now = Date.now();
    const botState =
      bot.botState && typeof bot.botState === "object"
        ? bot.botState
        : (bot.botState = {});
    const prevHealth =
      typeof botState.lastHealth === "number" ? botState.lastHealth : bot.health;
    const tookDamage = bot.health < prevHealth;
    botState.lastHealth = bot.health;
    if (tookDamage) {
      botState.lastDamageTakenAt = now;
    }

    // Persistent strafe direction (flips when strafing is getting punished)
    if (typeof botState.strafeDir !== "number" || botState.strafeDir === 0) {
      botState.strafeDir = Math.random() < 0.5 ? -1 : 1;
    }

    // Occasionally flip strafe direction just to stay unpredictable.
    const STRAFE_DRIFT_INTERVAL_MS = 20000;
    const lastStrafeDriftCheck =
      typeof botState.lastStrafeDriftCheck === "number"
        ? botState.lastStrafeDriftCheck
        : 0;
    if (now - lastStrafeDriftCheck >= STRAFE_DRIFT_INTERVAL_MS) {
      botState.lastStrafeDriftCheck = now;
      if (Math.random() < 0.5) {
        botState.strafeDir = -botState.strafeDir;
      }
    }

    const STRAFE_DAMAGE_CHAIN_MS = 10000;
    if (
      typeof botState.lastDamageStrafeTime === "number" &&
      now - botState.lastDamageStrafeTime > STRAFE_DAMAGE_CHAIN_MS
    ) {
      botState.damageStrafeChain = 0;
    }

    let target = null;
    let closestDistSq = Infinity;
    for (const p of players) {
      // Bots should only target real players, never other bots (including themselves).
      if (!p || !p.alive || p.id === bot.id || p.isBot) continue;
      const dx = p.x - bot.x;
      const dy = p.y - bot.y;
      const distSq = dx * dx + dy * dy;
      if (distSq < closestDistSq) {
        closestDistSq = distSq;
        target = p;
      }
    }

    if (!target) {
      readyToShoot(botState, null, false, now);
      botState.lastMoveMode = "idle";
      botState.lastStrafeDirUsed = null;
      return {
        moveX: 0,
        moveY: 0,
        aimAngle: bot.angle || 0,
        shoot: false,
      };
    }

    const isDodgingActive =
      typeof botState.dodgeUntil === "number" &&
      now < botState.dodgeUntil &&
      typeof botState.dodgeDirX === "number" &&
      typeof botState.dodgeDirY === "number";
    if (
      !isDodgingActive &&
      typeof botState.dodgeUntil === "number" &&
      now >= botState.dodgeUntil
    ) {
      botState.dodgeUntil = null;
      botState.dodgeDirX = 0;
      botState.dodgeDirY = 0;
    }

    const dx = target.x - bot.x;
    const dy = target.y - bot.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1e-6;
    const dirX = dx / dist;
    const dirY = dy / dist;

    // If we're taking repeated damage while strafing in the same direction,
    // either flip our strafe direction *or* commit to a short forward charge
    // through the bullet stream.
    if (
      tookDamage &&
      botState.lastMoveMode === "strafe" &&
      typeof botState.lastStrafeDirUsed === "number"
    ) {
      const lastDamageDir =
        typeof botState.lastDamageStrafeDir === "number"
          ? botState.lastDamageStrafeDir
          : null;
      const lastDamageTime =
        typeof botState.lastDamageStrafeTime === "number"
          ? botState.lastDamageStrafeTime
          : 0;

      if (
        lastDamageDir === botState.lastStrafeDirUsed &&
        now - lastDamageTime <= STRAFE_DAMAGE_CHAIN_MS
      ) {
        botState.damageStrafeChain =
          typeof botState.damageStrafeChain === "number"
            ? botState.damageStrafeChain + 1
            : 1;
      } else {
        botState.damageStrafeChain = 1;
      }

      botState.lastDamageStrafeDir = botState.lastStrafeDirUsed;
      botState.lastDamageStrafeTime = now;

      const STRAFE_FLIP_COOLDOWN_MS = 500;
      const lastFlipAt =
        typeof botState.lastStrafeFlipAt === "number"
          ? botState.lastStrafeFlipAt
          : 0;
      if (
        botState.damageStrafeChain >= 1 &&
        now - lastFlipAt >= STRAFE_FLIP_COOLDOWN_MS
      ) {
        const commitCharge = Math.random() < 0.5;
        const currentDir =
          typeof botState.strafeDir === "number" && botState.strafeDir !== 0
            ? botState.strafeDir
            : 1;

        if (commitCharge) {
          const CHARGE_DURATION_MS = 900;
          botState.strafeChargeUntil = now + CHARGE_DURATION_MS;
          botState.strafeChargeDirX = dirX;
          botState.strafeChargeDirY = dirY;
        } else {
          botState.strafeDir = -currentDir;
        }

        botState.lastStrafeFlipAt = now;
        botState.damageStrafeChain = 0;
      }
    } else if (tookDamage) {
      botState.damageStrafeChain = 0;
      botState.lastDamageStrafeDir = null;
    }

    const chargeActive =
      typeof botState.strafeChargeUntil === "number" &&
      now < botState.strafeChargeUntil &&
      typeof botState.strafeChargeDirX === "number" &&
      typeof botState.strafeChargeDirY === "number";
    if (
      !chargeActive &&
      typeof botState.strafeChargeUntil === "number" &&
      now >= botState.strafeChargeUntil
    ) {
      botState.strafeChargeUntil = null;
      botState.strafeChargeDirX = 0;
      botState.strafeChargeDirY = 0;
    }

    // Hitscan has no travel time, so aim at the current position.
    const aimTargetX = target.x;
    const aimTargetY = target.y;
    let aimAngle = Math.atan2(dy, dx);

    // Hold an imperfect aim offset briefly instead of tracking perfectly every tick.
    if (now >= (botState.nextAimAt || 0)) {
      botState.aimOffset = (Math.random() - 0.5) * 2 * BOT_CONFIG.aimInaccuracy;
      botState.nextAimAt = now + 300;
    }
    aimAngle += botState.aimOffset || 0;

    const moveTargetX = target.x;
    const moveTargetY = target.y;
    const moveDx = moveTargetX - bot.x;
    const moveDy = moveTargetY - bot.y;
    const moveDist = Math.sqrt(moveDx * moveDx + moveDy * moveDy) || 1e-6;
    const moveDirX = moveDx / moveDist;
    const moveDirY = moveDy / moveDist;

    const desiredDistance = 220;
    const distanceBand = 40;
    let moveX = 0;
    let moveY = 0;
    let moveMode = "idle";
    let strafeDirUsed = null;

    if (chargeActive) {
      moveX = botState.strafeChargeDirX || dirX;
      moveY = botState.strafeChargeDirY || dirY;
      moveMode = "charge";
    } else if (moveDist > desiredDistance + distanceBand) {
      // Close in
      moveX = moveDirX;
      moveY = moveDirY;
      moveMode = "chase";
    } else if (moveDist < desiredDistance - distanceBand) {
      // Back up
      moveX = -moveDirX;
      moveY = -moveDirY;
      moveMode = "retreat";
    } else {
      // Strafe sideways around the target
      moveX = -moveDirY * botState.strafeDir;
      moveY = moveDirX * botState.strafeDir;
      moveMode = "strafe";
      strafeDirUsed = botState.strafeDir;
    }

    const hasLineOfSight = !lineIntersectsAnyWall(
      bot.x,
      bot.y,
      aimTargetX,
      aimTargetY,
      walls,
    );
    const targetIsBotAlly = isBotAllyPlayer(target);
    const shouldShoot = readyToShoot(botState, target.id,
      !targetIsBotAlly && hasLineOfSight && dist < 450, now);

    const pathMove = computePathMovement(
      bot,
      botState,
      target,
      hasLineOfSight,
      now,
      walls,
      activeBullets,
    );
    const pathFollowing = !!(pathMove && pathMove.active);
    const navigationFocused = pathFollowing || !!botState.navForcePath;
    const pathRecentlyBlocked =
      !hasLineOfSight &&
      botState.navForcePath &&
      (!botState.navPath || botState.navPath.length === 0) &&
      typeof botState.navLastFailAt === "number" &&
      now - botState.navLastFailAt < 800;

    if (pathMove && pathMove.active) {
      moveX = pathMove.moveX;
      moveY = pathMove.moveY;
      moveMode = "path";
      strafeDirUsed = null;
    } else if (pathRecentlyBlocked) {
      const sidestepDir = Math.random() < 0.5 ? -1 : 1;
      moveX = -moveDirY * sidestepDir;
      moveY = moveDirX * sidestepDir;
      moveMode = "pathBlocked";
      strafeDirUsed = null;
    }

    // Detect when we're trying to peek past a wall (line of sight blocked) and
    // repeatedly bouncing off bullet dodges. In that case, temporarily ignore
    // bullet-dodge logic so the bot can push through the bullet stream.
    const lineBlockedToTarget = lineIntersectsAnyWall(
      bot.x,
      bot.y,
      target.x,
      target.y,
      walls,
    );
    const pushActive =
      !navigationFocused &&
      typeof botState.pushThroughUntil === "number" &&
      now < botState.pushThroughUntil &&
      botState.pushThroughForTargetId === target.id;
    let pushingThrough = !navigationFocused && !!pushActive;
    if (pushingThrough && !lineBlockedToTarget) {
      botState.pushThroughUntil = null;
      botState.pushThroughForTargetId = null;
      botState.peekThreatCount = 0;
      pushingThrough = false;
    }

    // Dodge incoming bullets from human players by strafing perpendicular to the shot.
    const threat = findIncomingBulletThreat(bot, activeBullets, walls);
    const DODGE_DURATION_MS = 650;
    let dodging = isDodgingActive;

    const peekThreatEligible = !navigationFocused && threat && lineBlockedToTarget;
    if (peekThreatEligible) {
      const lastThreatAt =
        typeof botState.lastPeekThreatAt === "number"
          ? botState.lastPeekThreatAt
          : 0;
      if (now - lastThreatAt <= 1400) {
        botState.peekThreatCount =
          typeof botState.peekThreatCount === "number"
            ? botState.peekThreatCount + 1
            : 1;
      } else {
        botState.peekThreatCount = 1;
      }
      botState.lastPeekThreatAt = now;
      if (
        botState.peekThreatCount >= 2 &&
        (!pushingThrough ||
          !botState.peekMode ||
          typeof botState.peekModeUntil !== "number" ||
          now >= botState.peekModeUntil)
      ) {
        const decidePush = Math.random() < 0.5 ? "push" : "fallback";
        botState.peekMode = decidePush;
        botState.peekModeTargetId = target.id;
        botState.peekModeUntil = now + 1200;

        if (decidePush === "push") {
          botState.pushThroughUntil = now + 900;
          botState.pushThroughForTargetId = target.id;
          pushingThrough = true;
          botState.peekFallbackX = 0;
          botState.peekFallbackY = 0;
        } else {
          const options = [
            { x: -dirX, y: -dirY }, // back off
            { x: -dirY, y: dirX },  // strafe left
            { x: dirY, y: -dirX },  // strafe right
          ];
          const chosen =
            options[Math.floor(Math.random() * options.length)] || options[0];
          botState.peekFallbackX = chosen.x;
          botState.peekFallbackY = chosen.y;
          botState.pushThroughUntil = null;
          botState.pushThroughForTargetId = null;
          pushingThrough = false;
        }
      }
    } else if (!threat) {
      botState.peekThreatCount = 0;
      botState.peekMode = null;
      botState.peekModeUntil = null;
      botState.peekModeTargetId = null;
    }

    if (
      !dodging &&
      !pushingThrough &&
      threat &&
      threat.bullet &&
      threat.bullet.id !== botState.lastDodgedBulletId
    ) {
      const incoming = threat.incomingAngle;
      const left = { x: -Math.sin(incoming), y: Math.cos(incoming) };
      const right = { x: Math.sin(incoming), y: -Math.cos(incoming) };

      function scoreDodge(dir) {
        const step = BOT_CONFIG.moveSpeedPerTick * 3;
        const radius = BOT_CONFIG.playerRadius;
        const width = BOT_CONFIG.canvasWidth;
        const height = BOT_CONFIG.canvasHeight;
        let tx = bot.x + dir.x * step;
        let ty = bot.y + dir.y * step;
        tx = Math.max(radius, Math.min(tx, width - radius));
        ty = Math.max(radius, Math.min(ty, height - radius));
        if (circleCollidesAnyWall(tx, ty, radius, walls)) {
          return -Infinity;
        }
        const distToPathSq = distanceToLineSq(
          tx,
          ty,
          threat.bullet.x,
          threat.bullet.y,
          threat.bullet.vx,
          threat.bullet.vy,
        );
        const dxHit = tx - threat.hitX;
        const dyHit = ty - threat.hitY;
        const distFromHitSq = dxHit * dxHit + dyHit * dyHit;
        return distToPathSq * 0.7 + distFromHitSq * 0.3;
      }

      const scoreLeft = scoreDodge(left);
      const scoreRight = scoreDodge(right);

      if (scoreLeft > -Infinity || scoreRight > -Infinity) {
        let chosen = null;
        if (scoreLeft >= scoreRight) {
          chosen = left;
        } else {
          chosen = right;
        }
        if (chosen) {
          moveX = chosen.x;
          moveY = chosen.y;
          moveMode = "dodge";
          botState.dodgeDirX = chosen.x;
          botState.dodgeDirY = chosen.y;
          botState.dodgeUntil = now + DODGE_DURATION_MS;
          botState.lastDodgedBulletId = threat.bullet.id;
          botState.navPathNeedsRecalc = true;
          dodging = true;
        }
      }
    } else if (dodging) {
      moveX = botState.dodgeDirX;
      moveY = botState.dodgeDirY;
      moveMode = "dodge";
    }

    if (
      !navigationFocused &&
      botState.peekMode === "push" &&
      typeof botState.peekModeUntil === "number" &&
      now < botState.peekModeUntil &&
      botState.peekModeTargetId === target.id
    ) {
      pushingThrough = true;
    }

    const fallbackPeekActive =
      !navigationFocused &&
      botState.peekMode === "fallback" &&
      typeof botState.peekModeUntil === "number" &&
      now < botState.peekModeUntil &&
      botState.peekModeTargetId === target.id;

    if (fallbackPeekActive) {
      moveX =
        typeof botState.peekFallbackX === "number"
          ? botState.peekFallbackX
          : -dirX;
      moveY =
        typeof botState.peekFallbackY === "number"
          ? botState.peekFallbackY
          : -dirY;
      dodging = false; // commit to the fallback choice
      moveMode = "peekFallback";
      strafeDirUsed = null;
    }

    if (!dodging && !fallbackPeekActive) {
      // Occasionally pause movement so bots don't orbit forever in stalemates.
      const PAUSE_INTERVAL_MS = 20000; // roughly "once every 20 seconds"
      const MIN_PAUSE_MS = 800;
      const MAX_PAUSE_MS = 1600;
      const allowRandomPause = !navigationFocused;

      if (typeof botState.pauseUntil === "number") {
        if (!allowRandomPause) {
          botState.pauseUntil = null;
        } else if (now < botState.pauseUntil) {
          // Currently paused: stop movement but still allow aiming/shooting.
          moveX = 0;
          moveY = 0;
          moveMode = "pause";
          strafeDirUsed = null;
        } else {
          // Pause expired.
          botState.pauseUntil = null;
        }
      } else if (allowRandomPause) {
        const lastDecision =
          typeof botState.lastPauseDecisionAt === "number"
            ? botState.lastPauseDecisionAt
            : 0;
        if (now - lastDecision >= PAUSE_INTERVAL_MS) {
          botState.lastPauseDecisionAt = now;
          // Randomize whether we actually pause at this interval boundary.
          if (Math.random() < 0.6) {
            const duration =
              MIN_PAUSE_MS + Math.random() * (MAX_PAUSE_MS - MIN_PAUSE_MS);
            botState.pauseUntil = now + duration;
            moveX = 0;
            moveY = 0;
            moveMode = "pause";
            strafeDirUsed = null;
          }
        }
      }
    }

    const moveLengthSq = moveX * moveX + moveY * moveY;
    if (moveLengthSq < 1e-5 && moveMode !== "pause") {
      moveMode = "idle";
      strafeDirUsed = null;
    }

    botState.lastMoveMode = moveMode;
    botState.lastStrafeDirUsed = moveMode === "strafe" ? strafeDirUsed : null;

    return { moveX, moveY, aimAngle, shoot: shouldShoot };
  }

  function computeSquadAction(bot, bots, now) {
    const humans = activePlayers.filter(p => p.alive && !p.isBot);
    const state = bot.botState;
    if(gameMap.activity==='strike'&&strikeState?.phase==='staging') {
      state.mode='staged';state.velocityX=0;state.velocityY=0;
      return {moveX:0,moveY:0,speed:0,aimAngle:bot.angle||0,shoot:false};
    }
    const target=pveEncounterActive?perceive(bot,humans,now,p=>{
      const distance=Math.hypot(p.x-bot.x,p.y-bot.y);
      const pitch=Math.atan2((p.height||0)+1.4-(bot.height||0)-(bot.eyeHeight||1.84),distance*0.05);
      return traceShot(bot,Math.atan2(p.y-bot.y,p.x-bot.x),gameWalls,[p],()=>true,pitch,gameMap).targetId===p.id;
    }):null;
    if(target)squadOrders.set(bot.squad,{...state.lastSeen});
    const fear=currentEnemyFear(bot,now);
    if(bot.botType==='ogre' && (!fear||bot.ogreAttack?.kind==='slam') && tickOgre(bot,target,activePlayers,gameWalls,gameMap,now,
      (targetId,amount)=>handlePlayerHit({targetId,shooterId:bot.id},amount))) {
      state.velocityX=0;state.velocityY=0;
      return {moveX:0,moveY:0,speed:0,aimAngle:bot.ogreAttack?.angle??bot.angle,shoot:false};
    }
    if(bot.botType==='warden') {
      const pressure=tickWardenCombat(bot,target,humans,now);
      if(pressure.suppressFire) {
        state.velocityX=0;state.velocityY=0;
        return {moveX:0,moveY:0,speed:0,aimAngle:pressure.aimAngle??bot.angle,shoot:false,
          carbineConfig:wardenCarbineConfig(bot)};
      }
    }
    let goal=chooseIntent(bot,target,squadOrders.get(bot.squad),now);
    // Dread squads press closer than ordinary soldiers instead of hovering at
    // the standard rifle distance. Captains lead the push.
    if(target&&(bot.botType==='dread'||bot.botType==='warden'||bot.botType==='guardian')) {
      const distance=Math.hypot(goal.x-target.x,goal.y-target.y),desired=bot.botRank==='captain'?150:175;
      const range=bot.botType==='guardian'?285:desired;
      if(distance>1){goal.x=target.x+(goal.x-target.x)*range/distance;goal.y=target.y+(goal.y-target.y)*range/distance;}
    }
    const retreat=fearRetreatGoal(bot,now);
    if(retreat) { goal=retreat; state.mode='retreat'; }
    goal.x=Math.max(32,Math.min(gameMap.width-32,goal.x));
    goal.y=Math.max(32,Math.min(gameMap.height-32,goal.y));
    const distance=target?Math.hypot(target.x-bot.x,target.y-bot.y):Infinity;
    const yaw=target?Math.atan2(target.y-bot.y,target.x-bot.x):bot.angle;
    if (now >= (state.nextAimAt || 0)) {
      state.aimOffset = (Math.random() - 0.5) * 2 * BOT_CONFIG.aimInaccuracy;
      state.nextAimAt = now + 300;
    }
    bot.aimPitch = target?Math.atan2((target.height||0)+1.4-(bot.height||0)-1.84,distance*0.05):0;
    const shifted=!state.pathGoal||Math.hypot(goal.x-state.pathGoal.x,goal.y-state.pathGoal.y)>64;
    if(now>=(state.squadRepathAt||0) || (shifted&&now>=(state.pathRequestAt||0)+400)) {
      const requestedGoal={...goal,height:retreat?(bot.height||0):target?.height??state.lastSeen?.height??bot.height??0,
        zone:retreat?(bot.zone??bot.sectorId):target?.zone??target?.sectorId??state.lastSeen?.zone??
          state.lastSeen?.sectorId??bot.zone??bot.sectorId},requestedState=state;
      if(navigation.request(bot,requestedGoal,path=>{
        if(bot.alive&&bot.botState===requestedState){
          let index=0,best=Infinity;
          for(let i=0;i<Math.min(4,path.length);i++){
            const distance=Math.hypot(path[i].x-bot.x,path[i].y-bot.y),probe={...bot};
            if(distance<best&&distance<160&&moveOnTerrain(probe,path[i].x,path[i].y,gameMap,solids(),Date.now())&&probe.jumpStartedAt==null&&Math.abs(probe.height-(path[i].height||0))<0.3){best=distance;index=i;}
          }
          state.squadPath=path;state.pathIndex=index;state.pathGoal=requestedGoal;
        }
      })){
        state.pathRequestAt=now;state.squadRepathAt=now+1200+(Number(bot.id.replace(/\D/g,''))%7)*75;
      }
    }
    // Following a cached route is cheap. Validate only the immediate short
    // segment; expensive all-map searches/line checks belong to the worker.
    let waypoint=goal;
    const path=state.squadPath;
    if(path?.length) {
      let index=state.pathIndex||0;
      if(index<path.length-1&&Math.hypot(path[index].x-bot.x,path[index].y-bot.y)<10) {
        const next=path[index+1],probe={...bot};
        if(Math.hypot(next.x-bot.x,next.y-bot.y)<160&&moveOnTerrain(probe,next.x,next.y,gameMap,solids(),now)&&probe.jumpStartedAt==null)index++;
      }
      state.pathIndex=index;waypoint=path[index];
      if(index===path.length-1&&Math.hypot(waypoint.x-bot.x,waypoint.y-bot.y)<12)waypoint=goal;
    }
    let moveX = waypoint ? waypoint.x-bot.x : 0;
    let moveY = waypoint ? waypoint.y-bot.y : 0;
    const length = Math.hypot(moveX, moveY);
    if (length > 0) { moveX /= length; moveY /= length; }
    if (Math.hypot(goal.x-bot.x, goal.y-bot.y) < 20 && Math.abs((state.lastSeen?.height??bot.height??0)-(bot.height||0))<0.5) { moveX = 0; moveY = 0; }
    for (const other of bots) {
      if (other === bot) continue;
      const gap = Math.hypot(bot.x-other.x, bot.y-other.y);
      if (gap > 0 && gap < 48) {
        moveX += (bot.x-other.x) / gap * (48-gap) / 24;
        moveY += (bot.y-other.y) / gap * (48-gap) / 24;
      }
    }
    const facing=target?yaw+(state.aimOffset||0):Math.hypot(moveX,moveY)>0.05?
      Math.atan2(moveY,moveX):bot.angle+Math.sin(now/800)*0.035;
    const inRange=!!target&&distance<450,aligned=inRange&&Math.abs(angleDelta(yaw,bot.angle))<0.25;
    const canAttack=enemyCanAttack(bot,now);
    if(bot.botType==='guardian')tickGuardianBurst(bot,target,!!target&&canAttack,aligned,now,(victim,shotIndex)=>{
      const projectile=launchGuardianProjectile(bot,victim,now,nextGuardianProjectileId++);
      guardianProjectiles.push(projectile);
      const {id,x,y,height,vx,vy,vz,expiresAt}=projectile;
      io.emit('guardianProjectile',{id,x,y,height,vx,vy,vz,expiresAt,serverNow:now,shotIndex});
      queueSnapshot();
    });
    const carbineConfig=bot.botType==='warden'?wardenCarbineConfig(bot):DREAD_COMBAT;
    const shoot=(bot.botType==='dread'||bot.botType==='warden')?
      tickDreadCarbine(bot,target,inRange&&canAttack,aligned,now,carbineConfig):
      bot.botType!=='ogre'&&bot.botType!=='guardian'&&readyToShoot(state,target?.id,inRange&&aligned&&canAttack,now);
    const speed=retreat?.speed??(state.mode==='idle'?0.52:state.mode==='combat'?0.95:1);
    return { moveX, moveY, speed, aimAngle:facing,shoot,carbineConfig };
  }

  function fireBulletFromBot(bot) {
    return fireHitscan(bot, bot.angle, bot.aimPitch || 0);
  }

  function applyBotAction(bot, action, now) {
    if (!bot || !bot.alive || !action) return false;

    const radius = BOT_CONFIG.playerRadius;
    const width = BOT_CONFIG.canvasWidth;
    const height = BOT_CONFIG.canvasHeight;
    const staggered=now<(bot.botState?.hitStaggerUntil||0);
    const moveSpeed = BOT_CONFIG.moveSpeedPerTick * (bot.moveScale || 1) * (staggered?0.18:1);

    let moved = false;

    let mx = action.moveX || 0;
    let my = action.moveY || 0;
    if(cooperative()) {
      const state=bot.botState,len=Math.max(1,Math.hypot(mx,my)),speed=action.speed??1;
      state.velocityX=(state.velocityX||0)+(mx/len*speed-(state.velocityX||0))*0.38;
      state.velocityY=(state.velocityY||0)+(my/len*speed-(state.velocityY||0))*0.38;
      mx=state.velocityX;my=state.velocityY;
    }
    const length = Math.sqrt(mx * mx + my * my);

    if (length > 0.001 && cooperative()) {
      const beforeX = bot.x, beforeY = bot.y;
      moveOnTerrain(bot, bot.x + mx * moveSpeed, bot.y, gameMap, solids(), now);
      moveOnTerrain(bot, bot.x, bot.y + my * moveSpeed, gameMap, solids(), now);
      moved = beforeX !== bot.x || beforeY !== bot.y;
    } else if (length > 0.001) {
      const dirX = mx / length;
      const dirY = my / length;
      bot.x += dirX * moveSpeed;
      bot.y += dirY * moveSpeed;
      moved = true;

      // Resolve wall collisions by pushing the bot out
      for (const wall of gameWalls) {
        const closestX = Math.max(
          wall.x,
          Math.min(bot.x, wall.x + wall.width)
        );
        const closestY = Math.max(
          wall.y,
          Math.min(bot.y, wall.y + wall.height)
        );
        const distX = bot.x - closestX;
        const distY = bot.y - closestY;
        const distance = Math.sqrt(distX * distX + distY * distY);

        if (distance < radius) {
          const overlap = radius - distance;
          const pushAngle = Math.atan2(distY, distX);
          bot.x += Math.cos(pushAngle) * overlap;
          bot.y += Math.sin(pushAngle) * overlap;
        }
      }

      // Clamp to arena bounds after collision resolution
      bot.x = Math.max(radius, Math.min(bot.x, width - radius));
      bot.y = Math.max(radius, Math.min(bot.y, height - radius));
    }

    if (typeof action.aimAngle === "number") {
      const difference = Math.atan2(Math.sin(action.aimAngle - bot.angle), Math.cos(action.aimAngle - bot.angle));
      const turnStep=cooperative() ? (bot.botType==='ogre'?0.16:bot.botType==='guardian'?0.2:0.24) : 0.12;
      bot.angle += Math.max(-turnStep, Math.min(turnStep, difference));
    }

    if (action.shoot) {
      const botState = bot.botState || (bot.botState = {});
      const carbine=action.carbineConfig||DREAD_COMBAT;
      const interval=(bot.botType==='dread'||bot.botType==='warden')?carbine.shotIntervalMs:BOT_COMBAT.shotIntervalMs;
      if (now - (botState.lastShotAt || 0) >= interval) {
        if (fireBulletFromBot(bot)) {
          if(bot.botType==='dread'||bot.botType==='warden')recordDreadShot(bot,now,carbine);
          else recordShot(botState, now);
        }
      }
    }

    return moved;
  }

  const STRIKE_SAFE_ARRIVAL_MS=1800;
  const STRIKE_INTERMISSION_MS=1200;
  const STRIKE_HOSTILE_RECOVERY_MS=500;

  function strikeVolumeContains(source,actor) {
    const volume=source?.bounds||source;
    if(!volume||![volume.x,volume.y,volume.width,volume.height].every(Number.isFinite))return false;
    const x0=Math.min(volume.x,volume.x+volume.width),x1=Math.max(volume.x,volume.x+volume.width);
    const y0=Math.min(volume.y,volume.y+volume.height),y1=Math.max(volume.y,volume.y+volume.height);
    const z=Number.isFinite(actor.height)?actor.height:0;
    const z0=volume.minHeight??volume.minZ??volume.bottom??-Infinity;
    const z1=volume.maxHeight??volume.maxZ??volume.top??Infinity;
    return actor.x>=x0&&actor.x<=x1&&actor.y>=y0&&actor.y<=y1&&
      z>=Math.min(z0,z1)&&z<=Math.max(z0,z1);
  }

  function strikeAnyVolumeContains(source,actor) {
    return (Array.isArray(source)?source:[source]).some(volume=>strikeVolumeContains(volume,actor));
  }

  function collectStrikeSpawns(source,result=[]) {
    if(!source)return result;
    if(Array.isArray(source)){for(const value of source)collectStrikeSpawns(value,result);return result;}
    if(typeof source!=='object')return result;
    if(Number.isFinite(source.x)&&Number.isFinite(source.y)){result.push(source);return result;}
    collectStrikeSpawns(source.spawns??source.positions??source.points??source.bots??source.botSpawns??source.members,result);
    return result;
  }

  function strikePhaseCount(encounter) {
    if(Array.isArray(encounter?.phases))return Math.max(1,encounter.phases.length);
    if(Number.isSafeInteger(encounter?.phases))return Math.max(1,encounter.phases);
    const tagged=(encounter?.spawnGroups||[]).map(group=>Number(group.phase)).filter(Number.isFinite);
    return tagged.length?Math.max(1,...tagged.map(value=>value>=1?value:value+1)):1;
  }

  function strikePhaseGroups(encounter,phaseIndex) {
    const phaseCount=strikePhaseCount(encounter);
    if(Array.isArray(encounter?.phases)) {
      const phase=encounter.phases[phaseIndex]||{};
      if(Array.isArray(phase.spawnGroups))return phase.spawnGroups;
      if(phase.spawns||phase.positions||phase.botSpawns)return [{id:phase.id||`phase-${phaseIndex+1}`,
        role:phase.role,positions:collectStrikeSpawns(phase)}];
    }
    const groups=Array.isArray(encounter?.spawnGroups)?encounter.spawnGroups:[];
    if(phaseCount===1)return groups.length?groups:[{id:'encounter',positions:encounter?.botSpawns||[]}];
    const tagged=groups.some(group=>Number.isFinite(Number(group.phase)));
    if(tagged)return groups.filter(group=>{
      const phase=Number(group.phase);return phase===(phase>=1?phaseIndex+1:phaseIndex);
    });
    return groups[phaseIndex]?[groups[phaseIndex]]:[];
  }

  function strikeGroupDescriptors(encounter,phaseIndex) {
    return strikePhaseGroups(encounter,phaseIndex).map((group,localIndex)=>({group,
      groupIndex:(encounter.spawnGroups||[]).indexOf(group)>=0?(encounter.spawnGroups||[]).indexOf(group):localIndex,
      positions:collectStrikeSpawns(group)}));
  }

  function strikeBotSpawns(encounter,phaseIndex) {
    const result=[];
    for(const {group,groupIndex,positions} of strikeGroupDescriptors(encounter,phaseIndex)) {
      for(let slot=0;slot<positions.length;slot++)result.push({...positions[slot],
        strikeSpawnGroup:group.id||`group-${groupIndex}`,
        strikeSpawnRole:group.role||'line',strikeSpawnGroupIndex:groupIndex,
        strikeSpawnSlot:slot});
    }
    return result;
  }

  function strikePhaseDefinition(encounter,phaseIndex) {
    return Array.isArray(encounter?.phases)?encounter.phases[phaseIndex]||{}:{};
  }

  function strikePhaseObjective(encounter,phaseIndex,phaseCount) {
    const phase=strikePhaseDefinition(encounter,phaseIndex);
    const objective=phase.objective||encounter?.phaseObjectives?.[phaseIndex]||encounter?.combatObjective||
      encounter?.objective||'Eliminate all hostiles';
    return phaseCount>1?`${objective} · PHASE ${phaseIndex+1}/${phaseCount}`:objective;
  }

  function strikeObjectives(encounter) {
    if(Array.isArray(encounter?.objectives))return encounter.objectives.filter(value=>value&&typeof value==='object');
    if(encounter?.objectiveTrigger||encounter?.completionTrigger)return [{id:`${encounter.id}-objective`,
      trigger:encounter.objectiveTrigger||encounter.completionTrigger,
      holdMs:encounter.interaction?.holdMs??encounter.objectiveHoldMs,
      interaction:encounter.interaction,requiresInteraction:!!encounter.interaction,
      destructible:encounter.destructible,requiresDestruction:!!encounter.destructible,
      objective:encounter.postClearObjective||encounter.postCombatObjective||encounter.interactionObjective,
      opens:encounter.objectiveOpens,stateChanges:encounter.objectiveStateChanges}];
    return [];
  }

  function strikeDestructibleHit(shooter,shot) {
    if(gameMap.activity!=='strike'||strikeState?.phase!=='objective'||!shooter?.alive||shooter.isBot||!shot)return null;
    const encounter=gameMap.strikeEncounters?.[strikeState.encounterIndex];
    const objective=strikeObjectives(encounter)[strikeState.objectiveIndex||0];
    const target=objective?.destructible,box=target?.hitbox;
    if(!target||!box||strikeState.objectiveHealth<=0)return null;
    const angle=Number(shot.angle),pitch=Number(shot.pitch)||0;
    if(!Number.isFinite(angle)||!Number.isFinite(shot.x)||!Number.isFinite(shot.y)||
      !Number.isFinite(shot.height)||!Number.isFinite(shot.endX)||!Number.isFinite(shot.endY))return null;
    const distance=rayBox(shot.x,shot.y,Math.cos(angle),Math.sin(angle),box,shot.height,
      Math.tan(pitch)*.05);
    const travelled=Math.hypot(shot.endX-shot.x,shot.endY-shot.y);
    return Number.isFinite(distance)&&distance<=travelled+.03?{objective,target,distance}:null;
  }

  function strikeWeaponDamage(shooter,distance) {
    let damage=WEAPON_DAMAGE[shooter?.weapon]??WEAPON_DAMAGE.pistol;
    if(shooter?.weapon==='miniGun')damage=distance<=150
      ? damage-Math.max(0,distance-50)*((damage-2)/100)
      : distance<=350?2:distance<=650?2-(distance-350)*(1.5/300):
        Math.max(.15,.5-(distance-650)*.00175);
    return Math.max(0,damage);
  }

  function damageStrikeDestructible(hit,shooter,now) {
    const encounter=gameMap.strikeEncounters?.[strikeState?.encounterIndex];
    const objective=strikeObjectives(encounter)[strikeState?.objectiveIndex||0];
    if(strikeState?.phase!=='objective'||objective?.id!==hit?.objective?.id||
      objective?.destructible?.id!==hit?.target?.id)return false;
    const maximum=Math.max(1,Number(hit.target.maxHealth)||1);
    const previous=Math.max(0,Number.isFinite(strikeState.objectiveHealth)?strikeState.objectiveHealth:maximum);
    const dealt=Math.min(previous,Math.max(0,Number(hit.damage)||0));
    if(dealt<=0)return false;
    const health=Math.max(0,previous-dealt),destroyed=health<=0;
    const shouldPublish=destroyed||now-(strikeState.objectivePublishedAt||0)>=50;
    strikeState={...strikeState,objectiveHealth:health,objectiveMaxHealth:maximum,
      objectiveProgress:1-health/maximum,objectiveLastHitAt:now,objectiveLastHitBy:shooter.id,
      objectivePublishedAt:shouldPublish?now:strikeState.objectivePublishedAt,
      ...(destroyed?{objectiveDestroyedAt:now}: {})};
    if(shouldPublish)publishStrikeState();
    if(!destroyed)return true;
    io.emit('strikeObjectiveDestroyed',{id:hit.target.id,x:hit.target.x,y:hit.target.y,
      height:hit.target.height,serverNow:now});
    return completeStrikeObjective(now);
  }

  function strikeSafeArrivalMs(encounter) {
    if(encounter?.safeArrival===false)return 0;
    const authored=encounter?.safeArrivalMs??encounter?.safeArrival?.durationMs??
      encounter?.activation?.safeArrivalMs??gameMap.strikeSafeArrivalMs;
    return Number.isFinite(authored)?Math.max(0,authored):STRIKE_SAFE_ARRIVAL_MS;
  }

  function strikeGuidancePoint(source) {
    if(Array.isArray(source))return strikeGuidancePoint(source[0]);
    const value=source?.bounds||source;
    if(!value||!Number.isFinite(value.x)||!Number.isFinite(value.y))return null;
    const volume=Number.isFinite(value.width)&&Number.isFinite(value.height);
    return {x:value.x+(volume?value.width/2:0),y:value.y+(volume?value.height/2:0),
      height:volume?(value.bottom??value.minHeight??0):(value.height??value.bottom??value.minHeight??0),
      sectorId:value.sectorId??value.zone};
  }

  function refreshStrikeGuidance() {
    if(!strikeState||gameMap.activity!=='strike')return;
    const encounter=gameMap.strikeEncounters?.[strikeState.encounterIndex];
    if(!encounter||strikeState.phase==='complete') {
      strikeState={...strikeState,routeTargetId:null,activeRouteGuideIds:[],objectiveBeacon:null};return;
    }
    const operating=strikeState.phase==='objective',targetId=operating?`${encounter.id}:objective`:encounter.id;
    const liveHostiles=strikeState.phase==='combat'?activePlayers.filter(player=>player.alive&&player.isBot&&
      player.strikeEncounterId===encounter.id):[];
    const lastHostile=liveHostiles.length===1?liveHostiles[0]:null;
    const exact=(gameMap.routeGuides||[]).filter(guide=>guide?.encounterIndex===strikeState.encounterIndex&&
      guide.targetId===targetId);
    const fallback=operating&&!exact.length?(gameMap.routeGuides||[]).filter(guide=>
      guide?.encounterIndex===strikeState.encounterIndex&&guide.targetId===encounter.id):[];
    const guides=exact.length?exact:fallback;
    // Some long transitions use intermediate beacons (for example the upper
    // hoist dock) before the real destination. The last authored beacon is
    // the canonical goal; choosing the first made the HUD stop halfway there.
    const beaconGuide=[...guides].reverse().find(guide=>guide.kind==='beacon');
    const authoredPoint=lastHostile||(operating?encounter.interaction||encounter.destructible||
      encounter.objectiveTrigger||encounter.completionTrigger:
      strikeState.phase==='travel'?encounter.entryPoint||encounter.triggers||encounter.trigger:
        encounter.objectivePoint||encounter.triggers||encounter.trigger);
    const point=lastHostile?strikeGuidancePoint(lastHostile):
      strikeGuidancePoint(beaconGuide)||strikeGuidancePoint(authoredPoint);
    const beacon=point?{id:beaconGuide?.id||`objective-beacon:${targetId}`,targetId,
      x:point.x,y:point.y,height:point.height,sectorId:beaconGuide?.sectorId||point.sectorId||
      encounter.sectorId||encounter.zoneId,kind:lastHostile?'hostile':operating&&encounter.destructible?'destructible':operating?'interaction':
        strikeState.phase==='travel'?'rally':'combat',label:lastHostile?'LAST HOSTILE':beaconGuide?.label||strikeState.objective||
        encounter.objective||'Advance',phase:strikeState.phase}:null;
    const showPath=['travel','objective'].includes(strikeState.phase);
    const active=showPath?guides:beaconGuide?[beaconGuide]:[];
    strikeState={...strikeState,routeTargetId:targetId,
      activeRouteGuideIds:active.map(guide=>guide.id),objectiveBeacon:beacon};
  }

  function strikeCarry(source={}) {
    return {checkpointIndex:source.checkpointIndex??-1,checkpointId:source.checkpointId,
      openedIds:[...(source.openedIds||[])],machineryState:{...(source.machineryState||{})},
      openedAtById:{...(source.openedAtById||{})},missionFlags:{...(source.missionFlags||{})},
      solidStates:{...(source.solidStates||{})}};
  }

  function strikeTravelState(index,now,carry={}) {
    const preserved=strikeCarry(carry),encounter=gameMap.strikeEncounters?.[index];
    if(!encounter)return {encounterIndex:index,phase:'complete',objective:gameMap.completionObjective||
      'Strike complete',complete:true,startedAt:now,...preserved};
    return {encounterIndex:index,encounterId:encounter.id,actId:encounter.actId||encounter.act,
      zoneId:encounter.zoneId,sectorId:encounter.sectorId,phase:'travel',
      objective:encounter.objective||'Advance',complete:false,startedAt:now,...preserved};
  }

  function strikeIds(source) {
    return [...new Set((Array.isArray(source)?source:source?[source]:[])
      .map(value=>typeof value==='string'?value:value?.id).filter(Boolean))];
  }

  function setStrikeDoors(source,open=true) {
    const ids=strikeIds(source),opened=new Set(strikeState?.openedIds||[]);
    if(!ids.length)return false;
    const wanted=new Set(ids),openedAtById={...(strikeState?.openedAtById||{})},now=Date.now();let changed=false;
    for(const solid of [...gameWalls,...(gameMap.terrain||[])]) {
      const matchedId=wanted.has(solid.id)?solid.id:wanted.has(solid.dynamicId)?solid.dynamicId:null;
      if(!matchedId)continue;
      if(!solid.strikeClosedState)solid.strikeClosedState={nonSolid:!!solid.nonSolid,open:!!solid.open,
        bottom:solid.bottom??0,top:solid.top??gameMap.ceiling};
      // A dynamicId on a differently named deck is the replacement surface
      // that becomes solid when a bridge lowers. A matching door itself gets
      // out of the way. Both are driven by the same authored mission ID.
      const activatingSurface=solid.id!==matchedId&&solid.dynamicId===matchedId;
      const next=open?(activatingSurface?{nonSolid:false,open:true,enabled:true}:{nonSolid:true,open:true}):
        solid.strikeClosedState;
      for(const [key,value] of Object.entries(next))if(solid[key]!==value){solid[key]=value;changed=true;}
    }
    gameMap.dynamicState=gameMap.dynamicState||{};
    for(const id of ids) {
      if(open) {if(!opened.has(id))openedAtById[id]=now;opened.add(id);}
      else {opened.delete(id);delete openedAtById[id];}
      gameMap.dynamicState[id]=open?'open':'closed';
    }
    strikeState={...strikeState,openedIds:[...opened],openedAtById};
    if(changed){wallLayoutVersion++;invalidateCachedNavGrid();navigation.configure(gameMap,gameWalls);}
    return changed;
  }

  function strikeMachineEntries(source) {
    if(!source)return [];
    if(Array.isArray(source))return source.flatMap(value=>typeof value==='string'?[[value,true]]:
      value?.id?[[value.id,value.state??value.value??Object.fromEntries(Object.entries(value).filter(([key])=>key!=='id'))]]:[]);
    if(typeof source==='object')return Object.entries(source);
    return [];
  }

  function applyStrikeSolidStates(source) {
    if(!source)return false;
    const entries=Array.isArray(source)?source.filter(value=>value?.id).map(value=>[value.id,value]):
      typeof source==='object'?Object.entries(source):[];
    const allowed=new Set(['x','y','width','height','bottom','top','maxTop','phaseOffset','nonSolid','open','active','enabled']);
    let changed=false;const aggregate={...(strikeState?.solidStates||{})};
    for(const [id,value] of entries) {
      const patch=value&&typeof value==='object'?value:{active:!!value};
      const stored={...(aggregate[id]||{})};
      for(const key of allowed)if(Object.hasOwn(patch,key))stored[key]=patch[key];
      aggregate[id]=stored;
      for(const solid of [...gameWalls,...(gameMap.terrain||[])])if(solid.id===id)
        for(const [key,next] of Object.entries(stored))if(solid[key]!==next){solid[key]=next;changed=true;}
    }
    strikeState={...strikeState,solidStates:aggregate};
    if(changed){wallLayoutVersion++;invalidateCachedNavGrid();navigation.configure(gameMap,gameWalls);}
    return changed;
  }

  function applyStrikePatch(patch) {
    if(!patch||typeof patch!=='object')return;
    if(Array.isArray(patch)){for(const value of patch)applyStrikePatch(value);return;}
    if(patch.opens)setStrikeDoors(patch.opens,true);
    if(patch.closes)setStrikeDoors(patch.closes,false);
    if(patch.solidStates)applyStrikeSolidStates(patch.solidStates);
    const flags={...(strikeState?.missionFlags||{}),...(patch.flags||patch.missionFlags||{})};
    const machinery={...(strikeState?.machineryState||{})};
    for(const [id,value] of strikeMachineEntries(patch.machinery||patch.machineryState)) {
      machinery[id]=value;
      // The Red Vault hoist is machinery, not a generic always-running PvE
      // platform. Keep its support surface at the lower dock until the
      // authored counterweight objective has actually enabled it.
      if(id==='hoist')for(const lift of gameMap.terrain||[])if(lift.kind==='lift') {
        const state=value?.state??value;
        const wasEnabled=lift.enabled!==false;
        lift.enabled=!['locked','disabled','offline'].includes(state);
        if(lift.enabled&&!wasEnabled)lift.phaseEpoch=Date.now();
        if(!lift.enabled)lift.top=lift.minTop??lift.top;
      }
      for(const solid of [...gameWalls,...(gameMap.terrain||[])])if(solid.id===id) {
        solid.missionState=value?.state??value;
        if(value&&typeof value==='object')for(const key of ['active','enabled','open'])
          if(Object.hasOwn(value,key))solid[key]=value[key];
      }
    }
    strikeState={...strikeState,missionFlags:flags,machineryState:machinery};
  }

  function applyStrikeAuthoredState(patch) {
    if(!patch||typeof patch!=='object'||Array.isArray(patch)){applyStrikePatch(patch);return;}
    const directives=new Set(['opens','closes','solidStates','flags','missionFlags','machinery','machineryState']);
    const machinery={...(patch.machineryState||{}),...(patch.machinery||{})};
    for(const [key,value] of Object.entries(patch))if(!directives.has(key))machinery[key]=value;
    applyStrikePatch({...patch,...(Object.keys(machinery).length?{machinery}:{})});
  }

  function applyStrikeStage(encounter,stage) {
    const aliases={staging:['arrivalState','onEnter'],combat:['combatState','onCombat'],
      cleared:['clearedState','onClear'],complete:['completionState','onComplete'],
      intermission:['intermissionState','onIntermission']};
    for(const patch of [encounter?.stateChanges?.[stage],encounter?.missionState?.[stage],
      encounter?.[`${stage}State`],...(aliases[stage]||[]).map(key=>encounter?.[key])]) {
      // Compact encounter data uses the stage object itself as the machinery
      // state (for example `{ crane: 'tracking' }`). Keep supporting the more
      // explicit patch dialect without forcing authored maps to wrap every
      // state change in `{ machinery: ... }`.
      applyStrikeAuthoredState(patch);
    }
  }

  function applyStrikeEncounterPhaseState(encounter,phaseNumber) {
    if(!(phaseNumber>1))return;
    const key=`phase${phaseNumber}`;
    const patch=encounter?.stateChanges?.[key]??encounter?.missionState?.[key]??encounter?.[`${key}State`];
    applyStrikeAuthoredState(patch);
  }

  function resolveStrikePlacement(spawn,isSafe,{radius=16,bodyHeight=2.2,maxDistance=128}={}) {
    if(!spawn||!Number.isFinite(spawn.x)||!Number.isFinite(spawn.y))return null;
    const terrain=gameMap.terrain||[],desired=Number.isFinite(spawn.height)?spawn.height:
      groundHeight(spawn.x,spawn.y,terrain),seen=new Set();
    for(const distance of [...new Set([0,28,56,92,maxDistance])]) {
      const steps=distance===0?1:12;
      for(let step=0;step<steps;step++) {
        const angle=step*Math.PI*2/steps,x=spawn.x+Math.cos(angle)*distance,
          y=spawn.y+Math.sin(angle)*distance;
        if(x<radius||x>gameMap.width-radius||y<radius||y>gameMap.height-radius)continue;
        const below=supportHeight(x,y,desired,terrain,.001),upper=groundHeight(x,y,terrain);
        for(const height of [desired,below,upper]) {
          if(!Number.isFinite(height)||Math.abs(height-desired)>1.5)continue;
          const key=`${x.toFixed(3)}:${y.toFixed(3)}:${height.toFixed(4)}`;
          if(seen.has(key))continue;seen.add(key);
          const floor=supportHeight(x,y,height+.08,terrain,.08);
          if(Math.abs(floor-height)>.12||!canOccupy(x,y,height,solids(),radius,.001,bodyHeight))continue;
          const candidate={...spawn,x,y,height,groundHeight:height};
          if(isSafe(candidate))return candidate;
        }
      }
    }
    return null;
  }

  function strikeCheckpointSpawns(source) {
    return collectStrikeSpawns(source?.checkpointSpawns??source);
  }

  function strikePlayableSurfaces() {
    return (gameMap.terrain||[]).filter(surface=>!surface.nonSolid&&!surface.nonPlayable&&
      (surface.walkable||surface.platform===true||surface.kind==='ramp'||surface.kind==='lift'));
  }

  function strikePlayerHasSupport(player) {
    const surfaces=strikePlayableSurfaces();
    // Compact/legacy Strike fixtures use the implicit zero plane. Authored
    // missions with explicit decks must never fall back to that plane.
    if(!surfaces.length)return true;
    const foot=player.jumpStartedAt==null?(player.height||0):(player.groundHeight??player.height??0);
    // Trigger volumes deliberately begin a few centimetres below their deck;
    // tolerate that authored overlap while still rejecting a genuine fall.
    return authoredSupportAt(player.x,player.y,foot,surfaces,.65,0);
  }

  function rememberStrikeSafePosition(player,now=Date.now()) {
    if(gameMap.activity!=='strike'||!player?.alive||player.isBot)return false;
    if(player.jumpStartedAt!=null||!strikePlayerHasSupport(player)) {
      player.strikeUnsupportedSince??=now;return false;
    }
    player.strikeUnsupportedSince=null;
    player.strikeLastSafe={x:player.x,y:player.y,height:player.height||0,
      groundHeight:player.height||0,angle:player.angle||0,zone:player.zone,
      sectorId:player.sectorId,ceilingHeight:player.ceilingHeight,recordedAt:now};
    return true;
  }

  function clearStrikeReviveClaim(playerId) {
    let changed=false;
    for(const target of activePlayers)if(target.strikeReviveBeacon?.reviverId===playerId) {
      delete target.strikeReviveBeacon.reviverId;target.strikeReviveBeacon.progress=0;
      changed=true;
    }
    const player=activePlayers.find(value=>value.id===playerId);
    if(player?.strikeInteraction?.kind==='revive'){player.strikeInteraction=null;changed=true;}
    return changed;
  }

  function prepareStrikeReviveBeacon(target,now) {
    clearStrikeReviveClaim(target.id);
    const teammate=activePlayers.some(player=>!player.isBot&&player.alive&&player.id!==target.id);
    if(!teammate){target.strikeReviveBeacon=null;return null;}
    const safe=target.strikeLastSafe||{x:target.x,y:target.y,
      height:target.groundHeight??target.height??0,groundHeight:target.groundHeight??target.height??0,
      angle:target.angle||0,zone:target.zone,sectorId:target.sectorId};
    target.strikeReviveBeacon={...safe,createdAt:now,holdMs:2000,progress:0};
    return target.strikeReviveBeacon;
  }

  function strikePlayerCanRevive(player,target,aim={}) {
    const beacon=target?.strikeReviveBeacon;
    if(!player?.alive||player.isBot||!target||target.alive||target.isBot||!beacon||player.id===target.id)return false;
    const dx=beacon.x-player.x,dy=beacon.y-player.y,distance=Math.hypot(dx,dy);
    if(distance>105||Math.abs((player.height||0)-beacon.height)>2.8)return false;
    const yaw=Number.isFinite(aim.angle)?aim.angle:player.angle;
    if(!Number.isFinite(yaw)||Math.abs(angleDelta(yaw,Math.atan2(dy,dx)))>.46)return false;
    const targetHeight=beacon.height+1.05;
    const targetPitch=Math.atan2(targetHeight-((player.height||0)+(player.eyeHeight||1.84)),
      Math.max(.001,distance*.05));
    if(Number.isFinite(aim.pitch)&&Math.abs(aim.pitch-targetPitch)>.46)return false;
    // The shell is a physical interaction target, not an through-wall prompt.
    // Reuse authoritative hitscan against the actual Strike geometry so a
    // nearby shutter, rail, or machine can interrupt the revive sightline.
    const proxy={id:`revive-shell:${target.id}`,alive:true,x:beacon.x,y:beacon.y,
      height:beacon.height,bodyHeight:2.1,bodyRadius:12};
    return traceShot(player,yaw,gameWalls,[proxy],()=>true,targetPitch,gameMap).targetId===proxy.id;
  }

  function reviveStrikePlayer(target,now) {
    const beacon=target.strikeReviveBeacon;if(!beacon)return false;
    const occupied=activePlayers.filter(player=>player.alive&&player.id!==target.id);
    const chosen=resolveStrikePlacement(beacon,candidate=>occupied.every(other=>
      Math.hypot(other.x-candidate.x,other.y-candidate.y)>(other.bodyRadius||MOVEMENT.radius)+MOVEMENT.radius+2),
    {radius:MOVEMENT.radius,bodyHeight:target.bodyHeight||2.2,maxDistance:56});
    if(!chosen)return false;
    const reviverId=beacon.reviverId,reviver=activePlayers.find(player=>player.id===reviverId);
    Object.assign(target,{x:chosen.x,y:chosen.y,height:chosen.height,groundHeight:chosen.height,
      alive:true,health:MAX_HEALTH,maxHealth:MAX_HEALTH,angle:beacon.angle||target.angle||0,
      zone:beacon.zone??beacon.sectorId,sectorId:beacon.sectorId??beacon.zone,
      ceilingHeight:beacon.ceilingHeight??gameMap.ceiling,jumpStartedAt:null,jumpBase:chosen.height,
      jumpVelocity:0,jumpInputSeq:null,jumpPlatformId:null,platformId:null,groundPlatformId:null,
      knockback:null,movementEpoch:(target.movementEpoch||0)+1,inputBudget:.25,inputBudgetAt:now,lastShotAt:0,
      shotgunShotsRemaining:WEAPONS.shotgun.shotsPerReload,shotgunReloadUntil:0,
      strikeReviveBeacon:null,strikeUnsupportedSince:null});
    target.strikeLastSafe={x:chosen.x,y:chosen.y,height:chosen.height,groundHeight:chosen.height,
      angle:target.angle,zone:target.zone,sectorId:target.sectorId,recordedAt:now};
    if(reviver?.strikeInteraction?.kind==='revive')reviver.strikeInteraction=null;
    io.emit('playerRevived',{id:target.id,x:target.x,y:target.y,height:target.height,
      health:target.health,maxHealth:target.maxHealth,serverNow:now});
    queueSnapshot();return true;
  }

  function advanceStrikeRevives(now) {
    if(gameMap.activity!=='strike')return false;
    let changed=false;
    for(const reviver of activePlayers.filter(player=>player.alive&&!player.isBot&&
      player.strikeInteraction?.kind==='revive')) {
      const interaction=reviver.strikeInteraction;
      const target=activePlayers.find(player=>player.id===interaction.targetId);
      if(!strikePlayerCanRevive(reviver,target,{angle:reviver.angle,pitch:interaction.pitch})||
        target.strikeReviveBeacon.reviverId!==reviver.id) {
        clearStrikeReviveClaim(reviver.id);changed=true;continue;
      }
      const holdMs=target.strikeReviveBeacon.holdMs||2000;
      const progress=Math.min(1,(now-interaction.startedAt)/holdMs);
      if(Math.abs(progress-(target.strikeReviveBeacon.progress||0))>=.04||progress>=1) {
        target.strikeReviveBeacon.progress=progress;changed=true;
      }
      if(progress>=1)reviveStrikePlayer(target,now);
    }
    if(changed)publishStrikeState();
    return changed;
  }

  function advanceStrikeFalls(now) {
    if(gameMap.activity!=='strike'||!strikePlayableSurfaces().length)return false;
    let changed=false;
    for(const player of activePlayers.filter(value=>value.alive&&!value.isBot)) {
      if(strikePlayerHasSupport(player)) {rememberStrikeSafePosition(player,now);continue;}
      player.strikeUnsupportedSince??=now;
      const safeHeight=player.strikeLastSafe?.height??player.height??0;
      const dropped=safeHeight-(player.height||0);
      const strandedOnImplicitBase=safeHeight<=1&&player.jumpStartedAt==null&&
        now-player.strikeUnsupportedSince>=250;
      if(dropped<2.75&&!strandedOnImplicitBase)continue;
      handlePlayerHit({targetId:player.id,kind:'strikeFall',origin:player.strikeLastSafe},
        Math.max(MAX_HEALTH,(player.health||MAX_HEALTH)+1));changed=true;
    }
    return changed;
  }

  function strikeHostilePlacementValid(bot) {
    if(!bot?.alive||!bot.isBot||bot.jumpStartedAt!=null)return true;
    const radius=bot.bodyRadius||20,bounds=gameMap.worldBounds||
      {minX:0,minY:0,maxX:gameMap.width,maxY:gameMap.height};
    if(bot.x<bounds.minX+radius||bot.x>bounds.maxX-radius||
      bot.y<bounds.minY+radius||bot.y>bounds.maxY-radius||!strikePlayerHasSupport(bot))return false;
    return canOccupy(bot.x,bot.y,(bot.height||0)+(bot.hoverOffset||0),solids(),radius,.001,
      bot.bodyHeight||2.2);
  }

  function resetRecoveredStrikeHostile(bot,position,now) {
    Object.assign(bot,{x:position.x,y:position.y,height:position.height,groundHeight:position.height,
      zone:position.zone??position.sectorId??bot.zone,sectorId:position.sectorId??position.zone??bot.sectorId,
      jumpStartedAt:null,jumpBase:position.height,jumpVelocity:0,jumpPlatformId:null,
      platformId:null,groundPlatformId:null,knockback:null,strikeInvalidSince:null});
    const state=bot.botState||(bot.botState={});
    Object.assign(state,{velocityX:0,velocityY:0,squadPath:null,pathIndex:0,pathGoal:null,
      squadRepathAt:0,pathRequestAt:0,navPath:null,navPathIndex:0,navPathNeedsRecalc:true,
      navForcePath:true,navProgressTargetIdx:null,navProgressCheckAt:null,navLastBlockedAt:null});
    bot.strikeLastValidPosition={x:bot.x,y:bot.y,height:bot.height,groundHeight:bot.height,
      zone:bot.zone,sectorId:bot.sectorId,recordedAt:now};
  }

  function advanceStrikeHostileIntegrity(now) {
    if(gameMap.activity!=='strike'||!strikePlayableSurfaces().length)return false;
    const encounter=gameMap.strikeEncounters?.[strikeState?.encounterIndex];
    if(!encounter)return false;
    let changed=false;
    for(const bot of activePlayers.filter(value=>value.alive&&value.isBot&&
      value.strikeEncounterId===encounter.id)) {
      if(bot.spawnReadyAt>now)continue;
      if(strikeHostilePlacementValid(bot)) {
        bot.strikeInvalidSince=null;
        bot.strikeLastValidPosition={x:bot.x,y:bot.y,height:bot.height||0,groundHeight:bot.height||0,
          zone:bot.zone,sectorId:bot.sectorId,recordedAt:now};
        continue;
      }
      bot.strikeInvalidSince??=now;
      if(now-bot.strikeInvalidSince<STRIKE_HOSTILE_RECOVERY_MS)continue;
      const occupied=activePlayers.filter(value=>value.alive&&value.id!==bot.id);
      const candidates=[bot.strikeLastValidPosition,bot.strikeHomeSpawn,
        ...strikeBotSpawns(encounter,Math.max(0,(bot.strikePhase||1)-1)),encounter.objectivePoint]
        .filter(Boolean);
      let recovered=null;
      for(const source of candidates) {
        recovered=resolveStrikePlacement(source,candidate=>
          canOccupy(candidate.x,candidate.y,candidate.height+(bot.hoverOffset||0),solids(),
            bot.bodyRadius||20,.001,bot.bodyHeight||2.2)&&
          occupied.every(other=>Math.hypot(other.x-candidate.x,other.y-candidate.y)>
            (other.bodyRadius||MOVEMENT.radius)+(bot.bodyRadius||20)+6),
        {radius:bot.bodyRadius||20,bodyHeight:bot.bodyHeight||2.2,maxDistance:92});
        if(recovered)break;
      }
      if(recovered)resetRecoveredStrikeHostile(bot,recovered,now);
      else {
        bot.alive=false;bot.health=0;bot.strikeInvalidSince=null;
        io.emit('playerKilled',bot.id,{kind:'strikeVoid',x:bot.x,y:bot.y,height:bot.height,serverNow:now});
      }
      changed=true;
    }
    if(changed){publishStrikeState();queueSnapshot();}
    return changed;
  }

  function reviveStrikePlayers(encounter,now,overrideSpawns) {
    const dead=activePlayers.filter(player=>!player.isBot&&!player.alive);
    if(!dead.length)return [];
    let spawns=strikeCheckpointSpawns(overrideSpawns||encounter);
    if(!spawns.length) {
      const anchor=activePlayers.find(player=>!player.isBot&&player.alive);
      spawns=anchor?[{x:anchor.x,y:anchor.y,height:anchor.groundHeight??anchor.height??0,
        zone:anchor.zone,sectorId:anchor.sectorId}]:gameMap.playerSpawns||[];
    }
    const revived=[],occupied=activePlayers.filter(player=>!player.isBot&&player.alive)
      .map(player=>({x:player.x,y:player.y}));
    for(let index=0;index<dead.length;index++) {
      const player=dead[index];let spawn=null,chosen=null;
      for(let offset=0;offset<spawns.length&&!chosen;offset++) {
        const authored=spawns[(index+offset)%spawns.length];
        chosen=resolveStrikePlacement(authored,candidate=>occupied.every(other=>
          Math.hypot(other.x-candidate.x,other.y-candidate.y)>=34),{radius:MOVEMENT.radius,maxDistance:92});
        if(chosen)spawn=authored;
      }
      if(!chosen)continue;
      const floor=chosen.height;
      const encounter=gameMap.strikeEncounters?.[strikeState?.encounterIndex];
      const facingTarget=encounter?.objectivePoint||encounter?.trigger;
      const facing=Number.isFinite(spawn.angle)?spawn.angle:
        facingTarget?Math.atan2((facingTarget.y+(facingTarget.height&&facingTarget.width?facingTarget.height/2:0))-chosen.y,
          (facingTarget.x+(facingTarget.width||0)/2)-chosen.x):player.angle||0;
      Object.assign(player,{x:chosen.x,y:chosen.y,height:floor,groundHeight:floor,alive:true,
        health:MAX_HEALTH,maxHealth:MAX_HEALTH,angle:facing,
        zone:spawn.zone??spawn.sectorId,sectorId:spawn.sectorId??spawn.zone,
        ceilingHeight:spawn.ceilingHeight??gameMap.ceiling,jumpStartedAt:null,jumpBase:floor,jumpVelocity:0,
        jumpInputSeq:null,jumpPlatformId:null,platformId:null,groundPlatformId:null,knockback:null,
        movementEpoch:(player.movementEpoch||0)+1,inputBudget:.25,inputBudgetAt:now,lastShotAt:0,
        shotgunShotsRemaining:WEAPONS.shotgun.shotsPerReload,shotgunReloadUntil:0,
        strikeReviveBeacon:null,strikeUnsupportedSince:null});
      player.strikeLastSafe={x:chosen.x,y:chosen.y,height:floor,groundHeight:floor,angle:facing,
        zone:player.zone,sectorId:player.sectorId,recordedAt:now};
      revived.push(player.id);occupied.push(chosen);
    }
    return revived;
  }

  function spawnStrikeGroup(encounter,descriptor,phaseIndex) {
    const {group,groupIndex,positions}=descriptor;
    const spawns=positions.map((spawn,slot)=>({...spawn,
      strikeSpawnGroup:group.id||`group-${groupIndex}`,strikeSpawnRole:group.role||'line',
      strikeSpawnGroupIndex:groupIndex,strikeSpawnSlot:slot,
      zone:spawn.zone??spawn.sectorId??encounter.zoneId??encounter.sectorId,
      sectorId:spawn.sectorId??spawn.zone??encounter.sectorId??encounter.zoneId}));
    gameMap.botSpawns=spawns;if(spawns[0])gameMap.botSpawn=spawns[0];
    const before=activePlayers.length;
    if(spawns.length)createBotsForCurrentMatch(spawns.length);
    const spawned=activePlayers.slice(before).filter(bot=>bot.isBot);
    for(const bot of spawned) {
      bot.strikeEncounterId=encounter.id;bot.strikePhase=phaseIndex+1;
      const authored=spawns[bot.squadSlot]||{};bot.boss=!!authored.boss;
      bot.strikeHomeSpawn={x:bot.x,y:bot.y,height:bot.height||0,groundHeight:bot.height||0,
        zone:bot.zone,sectorId:bot.sectorId};
      bot.strikeLastValidPosition={...bot.strikeHomeSpawn,recordedAt:Date.now()};
    }
    // Strike enemies are created after gameStarting, whereas normal PvE bots
    // already exist in that reliable identity packet. Publish the full static
    // identity once so compact 20 Hz frames can remain compact without making
    // newly staged enemies briefly render as anonymous/default characters.
    if(spawned.length)io.emit('playersAdded',spawned.map(playerSnapshot));
    applyStrikeAuthoredState(group.stateChanges?.start||group.onSpawn||group.arrivalState);
    const boss=spawned.find(bot=>bot.boss||bot.botType==='warden');
    if(boss) {
      boss.wardenPhase=1;boss.baseMoveScale=boss.moveScale;
      strikeState={...strikeState,bossId:boss.id,bossType:boss.botType,bossName:boss.displayName,
        bossEncounterPhase:phaseIndex+1,bossCombatPhase:1,bossPhase:1,
        bossHealth:boss.health,bossMaxHealth:boss.maxHealth};
      applyStrikePatch({flags:{bossActive:true,wardenActive:true},
        machinery:{core:{state:'warden-active',phase:phaseIndex+1,healthRatio:1}}});
      enterWardenPhase(boss,1,Date.now(),{initial:true});
    }
    return spawned.length;
  }

  function prepareStrikePhase(encounter,phaseIndex,now) {
    const descriptors=strikeGroupDescriptors(encounter,phaseIndex),pending=descriptors.map(value=>value.groupIndex);
    const phaseEnemyTotal=descriptors.reduce((sum,value)=>sum+value.positions.length,0);
    strikeState={...strikeState,pendingGroupIndexes:pending,spawnedGroupIndexes:[],phaseEnemyTotal,
      enemyCount:phaseEnemyTotal,activeEnemyCount:0,phaseStartedAt:now};
    spawnDueStrikeGroups(encounter,phaseIndex,now);
    return phaseEnemyTotal;
  }

  function spawnDueStrikeGroups(encounter,phaseIndex,now) {
    const descriptors=strikeGroupDescriptors(encounter,phaseIndex),pending=new Set(strikeState.pendingGroupIndexes||[]);
    if(!pending.size)return 0;
    let spawnedCount=0,alive=activePlayers.filter(player=>player.alive&&player.isBot&&
      (!player.strikeEncounterId||player.strikeEncounterId===encounter.id)).length;
    for(let descriptorIndex=0;descriptorIndex<descriptors.length;descriptorIndex++) {
      const descriptor=descriptors[descriptorIndex];
      if(!pending.has(descriptor.groupIndex))continue;
      const group=descriptor.group,delay=Math.max(0,Number(group.delayMs)||0);
      if(now<(strikeState.phaseStartedAt||now)+delay)continue;
      // Threshold groups reinforce the groups authored before them. Do not
      // let one jump ahead of a delayed opener simply because no bot has
      // spawned yet.
      if(descriptorIndex>0&&descriptors.slice(0,descriptorIndex)
        .some(value=>pending.has(value.groupIndex)))continue;
      if(Number.isFinite(group.afterRemaining)&&alive>Math.max(0,group.afterRemaining))continue;
      const count=spawnStrikeGroup(encounter,descriptor,phaseIndex);spawnedCount+=count;alive+=count;
      pending.delete(descriptor.groupIndex);
    }
    if(spawnedCount||pending.size!==(strikeState.pendingGroupIndexes||[]).length) {
      const spawned=[...(strikeState.spawnedGroupIndexes||[]),...descriptors.filter(value=>
        !pending.has(value.groupIndex)&&!(strikeState.spawnedGroupIndexes||[]).includes(value.groupIndex))
        .map(value=>value.groupIndex)];
      strikeState={...strikeState,pendingGroupIndexes:[...pending],spawnedGroupIndexes:spawned,
        activeEnemyCount:activePlayers.filter(player=>player.alive&&player.isBot&&
          (!player.strikeEncounterId||player.strikeEncounterId===encounter.id)).length};
      publishStrikeState();queueSnapshot();
    }
    return spawnedCount;
  }

  function removeStrikeBots() {
    for(let index=activePlayers.length-1;index>=0;index--)if(activePlayers[index].isBot)activePlayers.splice(index,1);
  }

  function strikeEncounterForBot(bot) {
    return gameMap.strikeEncounters?.find(encounter=>encounter.id===bot?.strikeEncounterId)||
      gameMap.strikeEncounters?.[strikeState?.encounterIndex];
  }

  function wardenPhaseDefinition(bot,phaseNumber=bot?.wardenPhase||1) {
    const phases=strikeEncounterForBot(bot)?.wardenPhases;
    return Array.isArray(phases)?phases[Math.max(0,phaseNumber-1)]||{}:{};
  }

  function wardenCarbineConfig(bot) {
    const authored=wardenPhaseDefinition(bot)?.carbine||{};
    return {...DREAD_COMBAT,
      chargeMs:Math.max(240,Math.min(1200,Number(authored.chargeMs)||DREAD_COMBAT.chargeMs)),
      shotIntervalMs:Math.max(80,Math.min(400,Number(authored.shotIntervalMs)||DREAD_COMBAT.shotIntervalMs)),
      burstShots:Math.max(2,Math.min(5,Math.floor(Number(authored.burstShots)||DREAD_COMBAT.burstShots))),
      recoveryMs:Math.max(350,Math.min(2200,Number(authored.recoveryMs)||DREAD_COMBAT.recoveryMs)),
      damage:Math.max(1,Math.min(18,Number(authored.damage)||DREAD_COMBAT.damage))};
  }

  function emitWardenAttackState(boss,payload) {
    if(!payload)return;
    const active=['start','sweep'].includes(payload.event),phase=wardenPhaseDefinition(boss);
    if(active) {
      applyStrikePatch({machinery:{
        core:{state:payload.event==='start'?'pressure-charge':'pressure-release',
          sourceId:payload.sourceId,combatPhase:boss.wardenPhase,startedAt:payload.startedAt},
        crown:{state:'overdrive',sourceId:payload.crownId,combatPhase:boss.wardenPhase},
      }});
    } else applyStrikeAuthoredState(phase.stateChanges||phase.machinery);
    strikeState={...strikeState,bossAttack:active?payload:null};
    io.emit('wardenAttack',payload);publishStrikeState();
  }

  function spawnWardenReinforcements(boss,phaseDefinition,now) {
    const reinforcement=phaseDefinition?.reinforcements;
    if(!reinforcement||boss.botState.wardenReinforcementsSpawned)return 0;
    boss.botState.wardenReinforcementsSpawned=true;
    const encounter=strikeEncounterForBot(boss),positions=collectStrikeSpawns(reinforcement).slice(0,3);
    if(!encounter||!positions.length)return 0;
    const group={...reinforcement,id:reinforcement.id||'warden-redguard',bots:positions};
    const count=spawnStrikeGroup(encounter,{group,positions,
      groupIndex:(encounter.spawnGroups?.length||0)+Math.max(1,boss.wardenPhase||1)},
    Math.max(0,(strikeState.encounterPhase||1)-1));
    strikeState={...strikeState,
      phaseEnemyTotal:(strikeState.phaseEnemyTotal||0)+count,
      totalEnemyCount:(strikeState.totalEnemyCount||0)+count,
      enemyCount:(strikeState.enemyCount||0)+count,
      activeEnemyCount:activePlayers.filter(player=>player.alive&&player.isBot).length,
      missionFlags:{...(strikeState.missionFlags||{}),wardenReinforcements:true},
      wardenReinforcementCount:count};
    io.emit('wardenReinforcements',{bossId:boss.id,count,groupId:group.id,serverNow:now});
    publishStrikeState();return count;
  }

  function enterWardenPhase(boss,phaseNumber,now,{initial=false}={}) {
    const definition=wardenPhaseDefinition(boss,phaseNumber),state=boss.botState||(boss.botState={});
    if(!initial)cancelWardenPressure(boss,now,payload=>emitWardenAttackState(boss,payload));
    boss.dreadAttack=null;boss.wardenPhase=phaseNumber;
    boss.moveScale=(boss.baseMoveScale??boss.moveScale??1)*
      Math.max(.75,Math.min(1.5,Number(definition.moveScale)||1));
    state.dreadReadyAt=Math.max(state.dreadReadyAt||0,now+Math.max(0,Number(definition.entryDelayMs)||0));
    state.wardenPressureReadyAt=now+Math.max(0,Number(definition.pressure?.entryDelayMs)||0);
    state.wardenReinforcementsSpawned=false;
    applyStrikeAuthoredState(definition.stateChanges||definition.machinery);
    if(phaseNumber===3)spawnWardenReinforcements(boss,definition,now);
  }

  function wardenPressureHasLineOfSight(boss,player,origin) {
    const distance=Math.hypot(player.x-origin.x,player.y-origin.y);
    if(distance<1e-6)return true;
    const emitter={id:`${boss.id}:pressure`,x:origin.x,y:origin.y,height:origin.height,
      eyeHeight:Math.min(1.8,(boss.eyeHeight||2.65)*.58),alive:true};
    const yaw=Math.atan2(player.y-origin.y,player.x-origin.x);
    const pitch=Math.atan2((player.height||0)+1.1-origin.height-emitter.eyeHeight,distance*.05);
    return traceShot(emitter,yaw,gameWalls,[player],target=>target.id===player.id,pitch,gameMap).targetId===player.id;
  }

  function tickWardenCombat(boss,target,humans,now) {
    const definition=wardenPhaseDefinition(boss),visible=!!target;
    return tickWardenPressure(boss,target,humans,definition,now,{visible,
      canHit:(player,origin)=>wardenPressureHasLineOfSight(boss,player,origin),
      impact:(player,damage,knockback,origin,angle)=>{
        handlePlayerHit({targetId:player.id,shooterId:boss.id,kind:'wardenPressure',origin},damage);
        if(!player.alive)return;
        player.movementEpoch=(player.movementEpoch||0)+1;
        addKnockbackImpulse(player,Math.cos(angle)*knockback,Math.sin(angle)*knockback,now,
          'wardenPressure',{deceleration:520,maxSpeed:420});
      },
      emit:payload=>emitWardenAttackState(boss,payload),
    });
  }

  function updateStrikeBossState(boss,now) {
    if(!strikeState||!boss)return;
    const ratio=Math.max(0,Math.min(1,(boss.health||0)/Math.max(1,boss.maxHealth||1))),defeated=ratio<=0;
    const encounter=strikeEncounterForBot(boss),phases=encounter?.wardenPhases;
    const combatPhase=defeated?Math.min(3,phases?.length||3):phaseForHealth(phases,ratio);
    const phaseChanged=combatPhase!==(strikeState.bossCombatPhase||1);
    if(phaseChanged&&!defeated) {
      enterWardenPhase(boss,combatPhase,now);
      const authored=(encounter?.wardenPhases||encounter?.bossPhases)?.[combatPhase-1];
      if(!authored)applyStrikeAuthoredState(encounter?.stateChanges?.[`wardenPhase${combatPhase}`]);
    }
    if(defeated)cancelWardenPressure(boss,now,payload=>emitWardenAttackState(boss,payload),'defeated');
    const coreState=defeated?'rupture':boss.wardenAttack?.phase==='charge'?'pressure-charge':
      boss.wardenAttack?.phase==='sweep'?'pressure-release':combatPhase===1?'warden-guarded':
        combatPhase===2?'warden-venting':'warden-enraged';
    strikeState={...strikeState,bossId:boss.id,bossType:boss.botType,bossName:boss.displayName,
      bossHealth:boss.health,bossMaxHealth:boss.maxHealth,bossDefeated:defeated,
      bossCombatPhase:combatPhase,bossPhase:combatPhase,
      missionFlags:{...(strikeState.missionFlags||{}),bossActive:!defeated,wardenActive:!defeated,
        wardenPhase:combatPhase,...(defeated?{wardenDefeated:true}:{})},
      machineryState:{...(strikeState.machineryState||{}),core:{state:coreState,
        encounterPhase:boss.strikePhase,combatPhase,healthRatio:ratio,hitAt:now}}};
    const event={id:boss.id,health:boss.health,maxHealth:boss.maxHealth,healthRatio:ratio,
      defeated,phase:combatPhase,encounterPhase:boss.strikePhase,phaseChanged,serverNow:now};
    io.emit('strikeBossState',event);
    if(defeated||now-(strikeState.bossPublishedAt||0)>=100) {
      strikeState={...strikeState,bossPublishedAt:now};publishStrikeState();
    }
  }

  function grantStrikeReward(reward) {
    const coins=Math.max(0,Math.floor(Number(reward?.coins)||0));
    if(!coins)return {coins:0,recipients:[]};
    const recipients=[];
    for(const player of activePlayers) {
      if(player.isBot||!player.accountUsername)continue;
      const user=usersByUsername.get(player.accountUsername);if(!user)continue;
      ensureUserCurrencies(user);user.currencies.Coins=(Number(user.currencies.Coins)||0)+coins;
      recipients.push(player.id);io.to(player.id).emit('coinsUpdated',{coins:user.currencies.Coins});
    }
    if(recipients.length)saveUsers();return {coins,recipients};
  }

  function beginStrikeEncounter(now) {
    const encounter=gameMap.strikeEncounters?.[strikeState?.encounterIndex];
    if(!encounter||strikeState.phase!=='travel')return false;
    pveEncounterActive=false;applyStrikeStage(encounter,'staging');
    const phaseCount=strikePhaseCount(encounter),safeArrivalMs=strikeSafeArrivalMs(encounter);
    const totalEnemyCount=Array.from({length:phaseCount},(_,index)=>strikeBotSpawns(encounter,index).length)
      .reduce((sum,value)=>sum+value,0);
    strikeState={...strikeState,phase:'staging',objective:encounter.arrivalObjective||
      strikePhaseObjective(encounter,0,phaseCount),encounterPhase:1,phaseCount,stagedAt:now,
      safeUntil:now+safeArrivalMs,startedAt:now,defeatedEnemyCount:0,totalEnemyCount};
    gameMap.objective=strikeState.objective;
    prepareStrikePhase(encounter,0,now);
    if(safeArrivalMs===0)return activateStrikeEncounter(now);
    publishStrikeState();queueSnapshot();return true;
  }

  function activateStrikeEncounter(now) {
    if(gameMap.activity!=='strike'||strikeState?.phase!=='staging')return false;
    const encounter=gameMap.strikeEncounters?.[strikeState.encounterIndex];if(!encounter)return false;
    pveEncounterActive=true;applyStrikeStage(encounter,'combat');
    strikeState={...strikeState,phase:'combat',objective:strikePhaseObjective(encounter,
      Math.max(0,(strikeState.encounterPhase||1)-1),strikeState.phaseCount||strikePhaseCount(encounter)),
      activatedAt:now,startedAt:now};
    gameMap.objective=strikeState.objective;publishStrikeState();queueSnapshot();return true;
  }

  function beginStrikeIntermission(now) {
    const encounter=gameMap.strikeEncounters?.[strikeState?.encounterIndex];
    const phaseCount=strikePhaseCount(encounter),current=strikeState?.encounterPhase||1;
    if(!encounter||strikeState?.phase!=='combat'||current>=phaseCount)return false;
    const phase=strikePhaseDefinition(encounter,current-1);applyStrikeAuthoredState(phase.onComplete||phase.completionState);
    applyStrikeStage(encounter,'intermission');removeStrikeBots();squadOrders.clear();
    guardianProjectiles.length=0;pveEncounterActive=false;
    const next=current+1,intermissionMs=Number.isFinite(encounter.intermissionMs)?
      Math.max(0,encounter.intermissionMs):STRIKE_INTERMISSION_MS;
    const checkpoint=encounter.intermissionSpawns?.[next-2]||phase.checkpointSpawns;
    const revivedIds=checkpoint||encounter.reviveOnIntermission===true?
      reviveStrikePlayers(encounter,now,checkpoint||encounter.checkpointSpawns):[];
    strikeState={...strikeState,phase:'intermission',encounterPhase:next,phaseCount,
      objective:encounter.intermissionObjectives?.[next-2]||`REINFORCEMENTS INBOUND · PHASE ${next}/${phaseCount}`,
      defeatedEnemyCount:(strikeState.defeatedEnemyCount||0)+(strikeState.phaseEnemyTotal||0),enemyCount:0,
      revivedIds,intermissionUntil:now+intermissionMs,startedAt:now};
    gameMap.objective=strikeState.objective;publishStrikeState();queueSnapshot();return true;
  }

  function beginNextStrikePhase(now) {
    if(strikeState?.phase!=='intermission')return false;
    const encounter=gameMap.strikeEncounters?.[strikeState.encounterIndex];if(!encounter)return false;
    const phaseIndex=Math.max(0,(strikeState.encounterPhase||1)-1),phaseCount=strikePhaseCount(encounter);
    applyStrikeAuthoredState(strikePhaseDefinition(encounter,phaseIndex).onStart||
      strikePhaseDefinition(encounter,phaseIndex).arrivalState);
    applyStrikeEncounterPhaseState(encounter,phaseIndex+1);
    strikeState={...strikeState,phase:'combat',phaseCount,objective:strikePhaseObjective(encounter,
      phaseIndex,phaseCount),activatedAt:now,startedAt:now};
    prepareStrikePhase(encounter,phaseIndex,now);pveEncounterActive=true;
    gameMap.objective=strikeState.objective;publishStrikeState();queueSnapshot();return true;
  }

  function beginStrikeObjective(now) {
    const encounter=gameMap.strikeEncounters?.[strikeState?.encounterIndex],objectives=strikeObjectives(encounter);
    if(!encounter||!objectives.length)return false;
    removeStrikeBots();squadOrders.clear();pveEncounterActive=false;applyStrikeStage(encounter,'cleared');
    const objective=objectives[0];applyStrikeAuthoredState(objective.onStart||objective.arrivalState);
    const objectiveMaxHealth=objective.destructible?
      Math.max(1,Number(objective.destructible.maxHealth)||1):null;
    strikeState={...strikeState,phase:'objective',objectiveIndex:0,objectiveId:objective.id,
      objective:objective.objective||objective.label||encounter.interactionObjective||'Operate the machinery',
      objectiveKind:objective.destructible?'destructible':objective.interaction?'interaction':'hold',
      objectiveHealth:objectiveMaxHealth,objectiveMaxHealth,
      objectiveHoldStartedAt:null,objectiveProgress:0,interactionPlayerId:null,enemyCount:0,
      defeatedEnemyCount:(strikeState.defeatedEnemyCount||0)+(strikeState.phaseEnemyTotal||0),startedAt:now};
    gameMap.objective=strikeState.objective;publishStrikeState();queueSnapshot();return true;
  }

  function completeStrikeObjective(now) {
    if(strikeState?.phase!=='objective')return false;
    const encounter=gameMap.strikeEncounters?.[strikeState.encounterIndex],objectives=strikeObjectives(encounter);
    const index=strikeState.objectiveIndex||0,objective=objectives[index];if(!objective)return false;
    for(const player of activePlayers)player.strikeInteraction=null;
    applyStrikeAuthoredState(objective.stateChanges?.complete||objective.onComplete||objective.completionState);
    applyStrikePatch({opens:objective.opens,closes:objective.closes,machinery:objective.machinery,
      flags:objective.flags,solidStates:objective.solidStates});
    const next=index+1;
    if(next>=objectives.length)return completeStrikeEncounter(now,true);
    const following=objectives[next];applyStrikeAuthoredState(following.onStart||following.arrivalState);
    const followingMaxHealth=following.destructible?
      Math.max(1,Number(following.destructible.maxHealth)||1):null;
    strikeState={...strikeState,objectiveIndex:next,objectiveId:following.id,
      objective:following.objective||following.label||'Operate the machinery',objectiveHoldStartedAt:null,
      objectiveKind:following.destructible?'destructible':following.interaction?'interaction':'hold',
      objectiveHealth:followingMaxHealth,objectiveMaxHealth:followingMaxHealth,
      objectiveProgress:0,interactionPlayerId:null,startedAt:now};
    gameMap.objective=strikeState.objective;publishStrikeState();queueSnapshot();return true;
  }

  function clearStrikeCombatPhase(now) {
    const encounter=gameMap.strikeEncounters?.[strikeState?.encounterIndex];
    if(!encounter||strikeState?.phase!=='combat')return false;
    if((strikeState.encounterPhase||1)<strikePhaseCount(encounter))return beginStrikeIntermission(now);
    return strikeObjectives(encounter).length?beginStrikeObjective(now):completeStrikeEncounter(now);
  }

  function completeStrikeEncounter(now,objectiveAlreadyCounted=false) {
    if(gameMap.activity!=='strike'||!['combat','objective'].includes(strikeState?.phase))return false;
    const encounter=gameMap.strikeEncounters?.[strikeState.encounterIndex];if(!encounter)return false;
    removeStrikeBots();squadOrders.clear();grenades.length=0;guardianProjectiles.length=0;
    if(encounter.opens)setStrikeDoors(encounter.opens,true);
    applyStrikePatch({machinery:encounter.machinery,flags:encounter.flags,solidStates:encounter.solidStates});
    applyStrikeStage(encounter,'complete');
    const revivedIds=reviveStrikePlayers(encounter,now),nextIndex=strikeState.encounterIndex+1;
    const checkpointId=encounter.checkpointId||encounter.checkpointSpawns?.id||encounter.id;
    const defeatedEnemyCount=(strikeState.defeatedEnemyCount||0)+
      (objectiveAlreadyCounted?0:(strikeState.phaseEnemyTotal||0));
    const carry={...strikeCarry(strikeState),checkpointIndex:strikeState.encounterIndex,checkpointId};
    gameMap.botSpawns=[];pveEncounterActive=false;
    if(nextIndex>=(gameMap.strikeEncounters?.length||0)) {
      const reward=grantStrikeReward(encounter.reward||gameMap.reward);
      strikeState={...strikeState,phase:'complete',objective:encounter.completionObjective||
        gameMap.completionObjective||'The Red Vault is secure',complete:true,result:'victory',completedAt:now,
        startedAt:now,...carry,revivedIds,enemyCount:0,defeatedEnemyCount,reward};
      gameMap.objective=strikeState.objective;publishStrikeState();queueSnapshot();
      io.emit('strikeComplete',{...strikeState,strikeId:gameMap.strikeId,serverNow:now});
      scheduleGameOver({name:gameMap.name||'The Red Vault',team:'players',strike:true,result:'victory'});
      return true;
    }
    strikeState={...strikeTravelState(nextIndex,now,carry),revivedIds,enemyCount:0};
    gameMap.objective=strikeState.objective;
    // Consecutive encounters can share the same physical platform. Requiring
    // players to rediscover an invisible trigger after the preceding console
    // already placed them inside it creates a progression lock. Authored
    // auto-start handoffs stage the next fight immediately and visibly.
    const nextEncounter=gameMap.strikeEncounters?.[nextIndex];
    if(nextEncounter?.autoStart)return beginStrikeEncounter(now);
    publishStrikeState();queueSnapshot();return true;
  }

  function strikeSectorContains(sector,actor) {
    const bounds=sector?.bounds||sector;if(!bounds)return false;
    const floorMin=sector.floorMin??bounds.bottom??-Infinity,floorMax=sector.floorMax??bounds.top??Infinity;
    return actor.x>=bounds.x&&actor.x<=bounds.x+bounds.width&&actor.y>=bounds.y&&
      actor.y<=bounds.y+bounds.height&&(actor.height||0)>=floorMin-.35&&(actor.height||0)<=floorMax+.35;
  }

  function refreshStrikeActorZones() {
    const sectors=gameMap.strikeSectors||[];if(!sectors.length)return;
    for(const actor of activePlayers) {
      const current=sectors.find(sector=>sector.id===(actor.zone??actor.sectorId));
      const sector=current&&strikeSectorContains(current,actor)?current:sectors.find(value=>strikeSectorContains(value,actor));
      if(sector){actor.zone=sector.id;actor.sectorId=sector.id;}
    }
  }

  function advanceStrikeObjective(now,humans) {
    const encounter=gameMap.strikeEncounters?.[strikeState.encounterIndex],
      objective=strikeObjectives(encounter)[strikeState.objectiveIndex||0];
    if(!objective)return completeStrikeEncounter(now,true);
    // Destructible objectives advance only through authoritative weapon rays.
    // Merely standing in their old console volume must never complete them.
    if(objective.requiresDestruction)return false;
    if(objective.requiresInteraction) {
      const operator=humans.find(player=>player.id===strikeState.interactionPlayerId&&
        player.strikeInteraction?.objectiveId===objective.id);
      if(!operator||!strikePlayerCanInteract(operator,objective,
        {...operator.strikeInteraction,angle:operator.angle})) {
        if(operator)operator.strikeInteraction=null;
        if(strikeState.objectiveHoldStartedAt!=null||strikeState.interactionPlayerId!=null) {
          strikeState={...strikeState,objectiveHoldStartedAt:null,objectiveProgress:0,
            interactionPlayerId:null};publishStrikeState();
        }
        return false;
      }
      const holdMs=Math.max(250,Number(objective.holdMs)||2000);
      const started=strikeState.objectiveHoldStartedAt??operator.strikeInteraction.startedAt??now;
      const progress=Math.min(1,(now-started)/holdMs);
      const shouldPublish=strikeState.objectiveHoldStartedAt==null||now-(strikeState.objectivePublishedAt||0)>=100;
      strikeState={...strikeState,objectiveHoldStartedAt:started,objectiveProgress:progress,
        interactionPlayerId:operator.id,objectivePublishedAt:shouldPublish?now:strikeState.objectivePublishedAt};
      if(progress>=1)return completeStrikeObjective(now);
      if(shouldPublish)publishStrikeState();
      return false;
    }
    const trigger=objective.trigger||objective.volume;
    const present=trigger?(objective.requiresAll===true?humans.every(player=>strikeAnyVolumeContains(trigger,player)):
      humans.some(player=>strikeAnyVolumeContains(trigger,player))):true;
    if(!present) {
      if(strikeState.objectiveHoldStartedAt!=null) {
        strikeState={...strikeState,objectiveHoldStartedAt:null,objectiveProgress:0};publishStrikeState();
      }
      return false;
    }
    const holdMs=Math.max(0,Number(objective.holdMs??objective.durationMs)||0);
    if(holdMs===0)return completeStrikeObjective(now);
    const started=strikeState.objectiveHoldStartedAt??now,progress=Math.min(1,(now-started)/holdMs);
    const shouldPublish=strikeState.objectiveHoldStartedAt==null||now-(strikeState.objectivePublishedAt||0)>=250;
    strikeState={...strikeState,objectiveHoldStartedAt:started,objectiveProgress:progress,
      objectivePublishedAt:shouldPublish?now:strikeState.objectivePublishedAt};
    if(progress>=1)return completeStrikeObjective(now);
    if(shouldPublish)publishStrikeState();return false;
  }

  function angleDelta(a,b) {return Math.atan2(Math.sin(a-b),Math.cos(a-b));}

  function strikePlayerCanInteract(player,objective,aim={}) {
    const interaction=objective?.interaction;if(!player?.alive||!interaction)return false;
    if(objective.trigger&&!strikeAnyVolumeContains(objective.trigger,player))return false;
    const dx=interaction.x-player.x,dy=interaction.y-player.y,distance=Math.hypot(dx,dy);
    if(distance>Math.max(30,Number(interaction.range)||110))return false;
    const yaw=Number.isFinite(aim.angle)?aim.angle:player.angle;
    if(!Number.isFinite(yaw)||Math.abs(angleDelta(yaw,Math.atan2(dy,dx)))>
      Math.max(.12,Number(interaction.yawTolerance)||.42))return false;
    const targetPitch=Math.atan2(interaction.height-((player.height||0)+(player.eyeHeight||1.84)),
      Math.max(.001,distance*.05));
    const aimPitch=Number(aim.pitch);
    if(Number.isFinite(aimPitch)&&Math.abs(aimPitch-targetPitch)>
      Math.max(.12,Number(interaction.pitchTolerance)||.38))return false;
    if(Number.isFinite(interaction.normalAngle)) {
      const approach=Math.cos(interaction.normalAngle)*(player.x-interaction.x)+
        Math.sin(interaction.normalAngle)*(player.y-interaction.y);
      if(approach< -8)return false;
    }
    return true;
  }

  function handleStrikeInteractionStart(socket,aim) {
    if(gameMap.activity!=='strike'||!aim||
      !Number.isFinite(aim.angle)||!Number.isFinite(aim.pitch))return false;
    const player=activePlayers.find(value=>value.id===socket.id&&!value.isBot);
    if(!player||Math.abs(angleDelta(aim.angle,player.angle))>.2)return false;
    if(aim.kind==='revive'&&typeof aim.targetId==='string') {
      const target=activePlayers.find(value=>value.id===aim.targetId&&!value.isBot);
      if(!strikePlayerCanRevive(player,target,aim))return false;
      const beacon=target.strikeReviveBeacon;
      if(beacon.reviverId&&beacon.reviverId!==player.id)return false;
      const now=Date.now();beacon.reviverId=player.id;beacon.progress=0;
      player.strikeInteraction={kind:'revive',targetId:target.id,startedAt:now,
        angle:aim.angle,pitch:aim.pitch};
      publishStrikeState();return true;
    }
    if(strikeState?.phase!=='objective')return false;
    const encounter=gameMap.strikeEncounters?.[strikeState.encounterIndex];
    const objective=strikeObjectives(encounter)[strikeState.objectiveIndex||0];
    if(!objective?.requiresInteraction||!strikePlayerCanInteract(player,objective,aim))return false;
    if(strikeState.interactionPlayerId&&strikeState.interactionPlayerId!==player.id)return false;
    const now=Date.now();player.strikeInteraction={kind:'objective',objectiveId:objective.id,startedAt:now,
      angle:aim.angle,pitch:aim.pitch};
    strikeState={...strikeState,interactionPlayerId:player.id,objectiveHoldStartedAt:now,
      objectiveProgress:0,objectivePublishedAt:now};
    publishStrikeState();return true;
  }

  function cancelStrikeInteraction(playerId) {
    const player=activePlayers.find(value=>value.id===playerId);
    if(player?.strikeInteraction?.kind==='revive') {
      const changed=clearStrikeReviveClaim(playerId);
      if(changed)publishStrikeState();
      return changed;
    }
    if(player)player.strikeInteraction=null;
    if(strikeState?.phase!=='objective'||strikeState.interactionPlayerId!==playerId)return false;
    strikeState={...strikeState,interactionPlayerId:null,objectiveHoldStartedAt:null,objectiveProgress:0};
    publishStrikeState();return true;
  }

  function strikeHazardActive(hazard,now) {
    const cycle=Math.max(1,Number(hazard.cycleMs)||1),start=Math.max(0,Number(hazard.activeStart)||0),
      end=Math.max(start,Number(hazard.activeEnd)||cycle),offset=Number(hazard.phaseOffset)||0;
    const origin=strikeState?.activatedAt??strikeState?.startedAt??now;
    const position=((now-origin+offset)%cycle+cycle)%cycle;
    return {active:position>=start&&position<end,position,cycle};
  }

  function advanceStrikeHazards(now) {
    if(gameMap.activity!=='strike'||!strikeState)return;
    const encounter=gameMap.strikeEncounters?.[strikeState.encounterIndex];
    const enabled=['combat','objective'].includes(strikeState.phase);
    const status=[];
    for(const hazard of gameMap.hazards||[]) {
      const belongs=!hazard.encounterId||hazard.encounterId===encounter?.id;
      const sample=enabled&&belongs?strikeHazardActive(hazard,now):{active:false,position:0,cycle:Number(hazard.cycleMs)||1};
      status.push({id:hazard.id,active:sample.active,cycleProgress:sample.position/sample.cycle});
      const previous=strikeHazardTickAt.get(hazard.id)??now;
      strikeHazardTickAt.set(hazard.id,now);
      if(!sample.active)continue;
      // Integrate authored DPS at a bounded step. A delayed server frame may
      // not turn an environmental pulse into an accidental one-shot.
      const seconds=Math.max(0,Math.min(150,now-previous))/1000;
      if(!seconds)continue;
      const damage=Math.max(0,Number(hazard.damagePerSecond)||0)*seconds;
      if(!damage)continue;
      const volume=hazard.volume||hazard.trigger||hazard.bounds;
      const origin=volume?{x:volume.x+volume.width/2,y:volume.y+volume.height/2,
        height:volume.bottom??volume.minHeight??0}:undefined;
      for(const player of activePlayers)if(player.alive&&!player.isBot&&strikeAnyVolumeContains(volume,player))
        handlePlayerHit({targetId:player.id,kind:hazard.type||'strikeHazard',origin},damage);
    }
    const signature=status.map(value=>`${value.id}:${value.active?1:0}`).join('|');
    const changed=signature!==strikeHazardSignature;
    if(changed) {
      strikeHazardSignature=signature;
      const activeHazardIds=status.filter(value=>value.active).map(value=>value.id);
      strikeState={...strikeState,activeHazardIds};
      publishStrikeState();
    }
    // Four compact updates per second are enough for a smooth pre-pulse
    // warning without turning environmental machinery into frame traffic.
    if(changed||now-strikeHazardPublishedAt>=250) {
      strikeHazardPublishedAt=now;
      io.emit('strikeHazardState',{hazards:status,
        activeHazardIds:strikeState.activeHazardIds||[],serverNow:now});
    }
  }

  function advanceStrike(now) {
    if(gameMap.activity!=='strike'||!strikeState||strikeState.complete)return;
    advanceStrikeRevives(now);
    refreshStrikeActorZones();
    const humans=activePlayers.filter(player=>player.alive&&!player.isBot);
    if(!humans.length){maybeTriggerGameOver();return;}
    const encounter=gameMap.strikeEncounters?.[strikeState.encounterIndex];if(!encounter)return;
    if(['staging','combat'].includes(strikeState.phase))spawnDueStrikeGroups(encounter,
      Math.max(0,(strikeState.encounterPhase||1)-1),now);
    if(strikeState.phase==='travel'&&humans.some(player=>strikeAnyVolumeContains(encounter.triggers||encounter.trigger,player)))
      beginStrikeEncounter(now);
    else if(strikeState.phase==='staging'&&(now>=(strikeState.safeUntil||0)||
      !humans.some(player=>strikeAnyVolumeContains(encounter.safeArrival??encounter.trigger,player))))
      activateStrikeEncounter(now);
    else if(strikeState.phase==='intermission'&&now>=(strikeState.intermissionUntil||0))beginNextStrikePhase(now);
    else if(strikeState.phase==='combat') {
      // A stale bot from an earlier authored encounter must never hold the
      // current room hostage. Untagged bots are retained for compatibility;
      // all Strike reinforcements created here carry strikeEncounterId.
      const aliveBots=activePlayers.filter(player=>player.alive&&player.isBot&&
        (!player.strikeEncounterId||player.strikeEncounterId===encounter.id)).length;
      const countChanged=strikeState.activeEnemyCount!==aliveBots;
      const trackLast=aliveBots===1&&now-(strikeState.hostileGuidancePublishedAt||0)>=500;
      strikeState={...strikeState,activeEnemyCount:aliveBots,
        ...(trackLast?{hostileGuidancePublishedAt:now}:{})};
      if(countChanged||trackLast)publishStrikeState();
      const survived=encounter.type==='survive'&&Number.isFinite(encounter.durationMs)&&
        now>=(strikeState.activatedAt||strikeState.startedAt||now)+encounter.durationMs;
      if(survived){removeStrikeBots();clearStrikeCombatPhase(now);}
      else if(!aliveBots&&!(strikeState.pendingGroupIndexes||[]).length)clearStrikeCombatPhase(now);
    }
    else if(strikeState.phase==='objective')advanceStrikeObjective(now,humans);
  }

  function startElevatorRide(now) {
    const humans=activePlayers.filter(p=>!p.isBot&&p.alive);
    if(gameMap.mode!=='pve'||gameMap.activity==='strike'||!['combat','ready'].includes(floorState.phase)||!humans.length||
      activePlayers.some(p=>p.isBot&&p.alive)||!humans.every(p=>inElevator(p,gameMap)))return false;
    floorState={phase:'riding',floor:gameMap.floor,startedAt:now};
    grenades.length=0;guardianProjectiles.length=0;pickups.length=0;queueSnapshot();
    for(const p of activePlayers)p.grenadeChargeAt=null;
    for(const p of humans) {
      p.jumpStartedAt=null;p.height=0;p.groundHeight=0;p.knockback=null;
      p.platformId=null;p.groundPlatformId=null;p.movementEpoch=(p.movementEpoch||0)+1;
    }
    updateExitDoor(gameMap,floorState,now);publishFloorState();return true;
  }

  function promoteLatePveJoiners(now) {
    if(!waitingPlayers.length)return 0;
    const queued=waitingPlayers.splice(0,waitingPlayers.length);
    for(let index=0;index<queued.length;index++) {
      const slots=Array.from({length:12},(_,offset)=>floorSpawn(gameMap,false,index+offset));
      const spawn=slots.find(candidate=>activePlayers.every(other=>other.isBot||!other.alive||
        Math.hypot(other.x-candidate.x,other.y-candidate.y)>=32))||slots[0];
      const player=activateHumanPlayer(queued[index],spawn,now);
      player.ceilingHeight=gameMap.arrivalElevator?.ceiling||gameMap.elevator?.ceiling||gameMap.ceiling;
      activePlayers.push(player);
      matchParticipantIds.add(player.id);
    }
    // Scale only future waves to the enlarged fireteam. The wave they joined
    // during was deliberately left untouched.
    const humanCount=activePlayers.filter(player=>!player.isBot&&!player.debugCloneOf).length;
    floorBotCount=Math.min(BOT_CONFIG.maxPerMatch,Math.max(floorBotCount,4,humanCount*2));
    io.to('waiting').emit('updateWaitingList',waitingPlayers);
    return queued.length;
  }

  function advanceFloor(now) {
    updateExitDoor(gameMap,floorState,now);
    const humans = activePlayers.filter(p => !p.isBot && p.alive);
    if (!humans.length) { maybeTriggerGameOver(); return; }
    if (floorState.phase === 'ready' && now-floorState.startedAt>=LIFT_TIMING.open && humans.every(p => inElevator(p, gameMap))) {
      startElevatorRide(now);
    } else if (floorState.phase === 'riding' && now-floorState.startedAt >= LIFT_TIMING.close+LIFT_TIMING.travel) {
      const previousExit=gameMap.elevator;
      const next = createPveMap(undefined, gameMap.floor+1,recentTerrain);
      recentTerrain=[...recentTerrain.slice(-1),next.map.composition];
      gameMap = next.map;
      pveEncounterActive=false;
      // Preserve cabin-local position and view across the hidden half-turn.
      for(const p of humans) {
        p.x=gameMap.arrivalElevator.x+previousExit.width-(p.x-previousExit.x);
        p.y=gameMap.arrivalElevator.y+previousExit.height-(p.y-previousExit.y);
        p.angle+=Math.PI;p.movementEpoch=(p.movementEpoch||0)+1;
        p.platformId=null;p.groundPlatformId=null;p.ceilingHeight=gameMap.arrivalElevator.ceiling;
      }
      // Eliminated teammates sit out only the current floor. Revive after the
      // successful transfer, never during combat or an all-player defeat.
      for(const p of activePlayers.filter(p=>!p.isBot&&!p.alive)) {
        const slots=Array.from({length:12},(_,i)=>floorSpawn(gameMap,false,i));
        const spawn=slots.find(s=>activePlayers.every(other=>other.isBot||!other.alive||
          Math.hypot(other.x-s.x,other.y-s.y)>=32))||slots[0];
        Object.assign(p,spawn,{alive:true,health:MAX_HEALTH,maxHealth:MAX_HEALTH,angle:0,height:0,groundHeight:0,
          ceilingHeight:gameMap.arrivalElevator.ceiling,jumpStartedAt:null,jumpBase:0,jumpVelocity:0,
          jumpInputSeq:null,jumpPlatformId:null,platformId:null,groundPlatformId:null,knockback:null,
          movementEpoch:(p.movementEpoch||0)+1,inputBudget:0.25,inputBudgetAt:now,lastShotAt:0,
          shotgunShotsRemaining:WEAPONS.shotgun.shotsPerReload,shotgunReloadUntil:0});
      }
      promoteLatePveJoiners(now);
      gameMap.platformEpoch=now;
      for(const p of activePlayers)if(!p.isBot)p.grenades=3;
      gameWalls.splice(0,gameWalls.length,...next.walls);
      for(let i=activePlayers.length-1;i>=0;i--) if(activePlayers[i].isBot)activePlayers.splice(i,1);
      squadOrders.clear(); wallLayoutVersion++; invalidateCachedNavGrid();
      navigation.configure(gameMap,gameWalls);
      clearActiveBullets(activeBullets);
      guardianProjectiles.length=0;
      createBotsForCurrentMatch(floorBotCount);
      floorState = {phase:'opening',floor:gameMap.floor,startedAt:now};
      io.emit('floorStarting',{players:activePlayers.map(playerSnapshot),walls:gameWalls,map:gameMap,
        state:{...floorState,serverNow:now}});
    } else if (floorState.phase === 'opening' && now-floorState.startedAt >= LIFT_TIMING.open) {
      floorState = {phase:'combat',floor:gameMap.floor,startedAt:now};publishFloorState();
    }
  }

  function runBotsTick() {
    if (!gameInProgress.status || gameOverTimeout) return;
    if (!Array.isArray(activePlayers) || activePlayers.length === 0) return;
    const jumpNow = Date.now();
    navigation.beginTick();
    if (cooperative()) {
      regeneratePlayers(activePlayers, Math.max(0, (jumpNow - lastRegenAt) / 1000));
      lastRegenAt = jumpNow;
      if(gameMap.activity==='strike'){advanceStrike(jumpNow);advanceStrikeHazards(jumpNow);}
      else {
        advanceFloor(jumpNow);
        if (riding()) { publishSnapshot(); return; }
        if(!pveEncounterActive&&floorState.phase==='combat'&&
          activePlayers.some(player=>player.alive&&!player.isBot&&!inArrivalStaging(player)))activatePveEncounter();
      }
    }
    let jumping = false;
    updateCargoLifts(gameMap,activePlayers,jumpNow);
    if(collectPickups(pickups,activePlayers,gameMap,gameWalls,jumpNow))queueSnapshot();
    for (const player of activePlayers) {
      advanceKnockback(player,jumpNow,gameMap,solids());
      if (advanceJump(player, jumpNow)) jumping = true;
    }
    if(gameMap.activity==='strike') {
      advanceStrikeFalls(jumpNow);
      advanceStrikeHostileIntegrity(jumpNow);
    }

    const bots = activePlayers.filter((p) => p && p.isBot && p.alive);
    if(grenades.length) {
      // Publish motion even in an otherwise idle PvP match, including the
      // empty grenade list after the last explosion.
      queueSnapshot();
      for(let i=grenades.length-1;i>=0;i--) {
        const g=grenades[i];stepGrenade(g,jumpNow,gameMap,gameWalls);
        if(jumpNow<g.expiresAt)continue;
        grenades.splice(i,1);io.emit('grenadeExploded',{id:g.id,x:g.x,y:g.y,height:g.height});
        const owner=activePlayers.find(p=>p.id===g.ownerId);
        for(const target of activePlayers) {
          if(!target.alive||target.id===g.ownerId||!canDamage(owner||{isBot:false},target))continue;
          const damage=blastDamage(g,target,gameMap,gameWalls);
          if(damage>0)handlePlayerHit({targetId:target.id,shooterId:g.ownerId,kind:'grenade',origin:g},damage);
        }
      }
    }
    if(guardianProjectiles.length) {
      queueSnapshot();
      for(let i=guardianProjectiles.length-1;i>=0;i--) {
        const projectile=guardianProjectiles[i];
        if(!stepGuardianProjectile(projectile,jumpNow,gameMap,gameWalls,activePlayers))continue;
        guardianProjectiles.splice(i,1);
        io.emit('guardianExplosion',{id:projectile.id,x:projectile.x,y:projectile.y,height:projectile.height});
        const owner=activePlayers.find(p=>p.id===projectile.ownerId);
        for(const target of activePlayers) {
          if(!target.alive||target.isBot)continue;
          const damage=guardianBlastDamage(projectile,target,gameMap,gameWalls);
          if(damage<=0)continue;
          handlePlayerHit({targetId:target.id,shooterId:owner?.id,kind:'guardianBurst',origin:projectile},damage);
          if(target.alive) {
            const angle=Math.atan2(target.y-projectile.y,target.x-projectile.x);
            const strength=guardianKnockbackSpeed(damage);
            target.movementEpoch=(target.movementEpoch||0)+1;
            addKnockbackImpulse(target,Math.cos(angle)*strength,Math.sin(angle)*strength,jumpNow,'guardianBurst',{
              deceleration:GUARDIAN_COMBAT.knockbackDeceleration,
              maxSpeed:GUARDIAN_COMBAT.knockbackMaxSpeed,
            });
          }
        }
      }
    }
    if (bots.length === 0) {if(snapshotDirty||jumping||cooperative())publishSnapshot();return;}

    const snapshotPlayers = activePlayers.slice();
    const now = Date.now();
    let anyBotMoved = false;

    for (const bot of bots) {
      // Keep newly announced Strike reinforcements inert while clients show
      // their arrival column. They cannot move, acquire targets, or fire until
      // the same server timestamp that ends their materialization.
      if(bot.spawnReadyAt>now)continue;
      const action = cooperative() ? computeSquadAction(bot, bots, now) : computeScriptedBotAction(bot, snapshotPlayers, gameWalls);
      const moved = applyBotAction(bot, action, now);
      if (moved) {
        anyBotMoved = true;
      }
    }

    if (anyBotMoved||snapshotDirty||jumping||cooperative())publishSnapshot();
  }

  const BOT_TICK_MS = 50;
  const botTimer = setInterval(()=>{
    const start=performance.now();runBotsTick();lastTickMs=performance.now()-start;
  }, BOT_TICK_MS);

  return {
    waitingPlayers,
    activePlayers,
    gameWalls,
    gameInProgress,
    get gameMap() { return gameMap; },
    get floorState() { return floorState; },
    get strikeState() { return strikeState; },
    get encounterActive() { return pveEncounterActive; },
    connectSocket,
    registerSocketHandlers,
    handleJoin,
    queueLatePveJoin,
    latePveJoinState,
    handleStartGame,
    handleDisconnect,
    rebuildNavigation() { navigation.configure(gameMap,gameWalls); },
    runBotsTick,
    close() {
      navigation.close();
      clearInterval(botTimer);
      if (gameOverTimeout) clearTimeout(gameOverTimeout);
    },
  };
}

module.exports = { createGameServer,killCoinReward,PVP_SPAWN_SHIELD_MS };
