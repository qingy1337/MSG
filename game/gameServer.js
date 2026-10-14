const { WEAPONS, DEFAULT_WEAPON_KEY, SECONDARY_WEAPON_KEY, WEAPON_SWITCH_MS } = require("../public/weapons");
const { traceShot, tracePiercingShot } = require("./hitscan");
const {traceShotgun}=require('./shotgun');
const {hitsElevatorOverride}=require('./elevatorOverride');
const {throwGrenade,stepGrenade,blastDamage}=require('./grenades');
const {deathDescriptor,makeDeathPickup,collectPickups}=require('./deathEffects');
const { floorDifficulty, tickOgre } = require('./pveDifficulty');
const { advanceKnockback } = require('../public/arenaMap');
const {NavigationService}=require('./navigationService');
const {playerSnapshot,playerFrame}=require('./snapshots');
const {applyMovementInput}=require('../public/inputMovement');
const { BOT_COMBAT, readyToShoot, recordShot } = require("./botCombat");
const { DREAD_COMBAT, tickDreadCarbine, recordDreadShot } = require('./dreadCombat');
const { perceive, chooseIntent, angleDelta, alertNearbyBots } = require('./botAwareness');
const { recordEnemyHit, currentEnemyFear, fearRetreatGoal, enemyCanAttack } = require('./enemyReactions');
const { MOVEMENT, advanceJump, startJump } = require("../public/movement");
const { DEFAULT_MAP, createPveMap, createPvpMap, moveOnTerrain, regeneratePlayers, updateCargoLifts, groundHeight, canOccupy } = require('../public/arenaMap');
const {PVP_MAPS}=require('../public/pvpMaps');
const { LIFT_TIMING, inElevator, floorSpawn, updateExitDoor } = require('../public/floors');
const {
  usersByUsername,
  getUserFromCookieHeader,
  ensureUserCurrencies,
  ensureUserSkins,
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

function createGameServer(io) {
  let lastTickMs=0;
  const navigation=new NavigationService();
  let snapshotDirty=false,snapshotSequence=0;
  const queueSnapshot=()=>{snapshotDirty=true;};
  function publishSnapshot(){
    // One replaceable packet for all moving entities. A separate reliable
    // grenade packet here makes the transport busy and drops this snapshot.
    const humanRooms=activePlayers.filter(player=>!player.isBot&&!player.debugCloneOf).map(player=>player.id);
    const channel=humanRooms.length&&typeof io.to==='function'?io.to(humanRooms):io;
    (channel.volatile||channel).emit('gameState',activePlayers.map(playerFrame),{
      serverNow:Date.now(),sequence:++snapshotSequence,
      grenades:grenades.map(({id,x,y,height,vx,vy,vz,expiresAt})=>({id,x,y,height,vx,vy,vz,expiresAt})),
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
  let floorBotCount = 0;
  let recentTerrain=[];
  let lastPvpMapId=null;
  const riding = () => gameMap.mode === 'pve' && ['riding','opening'].includes(floorState.phase);
  const travelCabin=()=>riding()?(floorState.phase==='opening'?gameMap.arrivalElevator:gameMap.elevator):null;
  function publishFloorState() { io.emit('floorState', { ...floorState, serverNow: Date.now() }); }
  let lastRegenAt = 0;
  const squadOrders = new Map();
  const solids = () => [...gameWalls, ...gameMap.terrain];
  const canDamage = (a, b) => gameMap.mode === 'pve' ? !!a.isBot !== !!b.isBot : !(a.isBot && isBotAllyPlayer(b));
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
  const pickups=[];
  let nextPickupId=1;
  let nextGrenadeId=1;
  // Existing navigation helpers accept a projectile list. Hitscan leaves it empty.
  const activeBullets = [];
  let gameOverTimeout = null;
  let cachedNavGrid = null;
  let wallLayoutVersion = 0;

  io.on("connection", (socket) => {
    hydrateSocketUser(socket);
    console.log(
      "New connection:",
      socket.id,
      socket.user ? `as ${socket.user.username}` : "(unauthenticated)",
    );
    registerSocketHandlers(socket);
  });

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

  function registerSocketHandlers(socket) {
    let lastProbeAt=-Infinity;
    socket.on('networkProbe',reply=>{
      if(typeof reply!=='function'||Date.now()-lastProbeAt<1000)return;
      lastProbeAt=Date.now();reply({tickMs:lastTickMs});
    });
    socket.on("join", (payload) => handleJoin(socket, payload));
    socket.on("startGame", (options) => handleStartGame(socket, options));
    socket.on("playerUpdate", (data) => handlePlayerUpdate(socket, data));
    socket.on("shoot", (bulletData) => handleShoot(socket, bulletData));
    socket.on("switchWeapon", () => handleSwitchWeapon(socket));
    socket.on('grenadeCharge',()=>{
      const p=activePlayers.find(p=>p.id===socket.id);
      if(gameInProgress.status&&!gameOverTimeout&&!riding()&&p?.alive&&p.grenades>0&&p.grenadeChargeAt==null)p.grenadeChargeAt=Date.now();
    });
    socket.on('grenadeCancel',()=>{const p=activePlayers.find(p=>p.id===socket.id);if(p)p.grenadeChargeAt=null;});
    socket.on('throwGrenade',data=>{
      const p=activePlayers.find(p=>p.id===socket.id),started=p?.grenadeChargeAt;
      if(p)p.grenadeChargeAt=null;
      if(!gameInProgress.status||gameOverTimeout||riding()||!p?.alive||!(p.grenades>0)||started==null||
        !data||!Number.isFinite(data.angle)||!Number.isFinite(data.pitch)||Math.abs(data.pitch)>1.35)return;
      const now=Date.now();updateCargoLifts(gameMap,activePlayers,now);advanceJump(p,now);
      p.grenades--;
      const g=throwGrenade(p,data.angle,data.pitch,now-started,now,nextGrenadeId++);
      grenades.push(g);
      // Creation must reach every client even if replaceable motion snapshots
      // are dropped. One lifecycle event per throw, not reliable per-tick traffic.
      const {id,x,y,height,vx,vy,vz,expiresAt}=g;
      io.emit('grenadeThrown',{id,x,y,height,vx,vy,vz,expiresAt,serverNow:now});
      queueSnapshot();
    });
    socket.on("jump", () => {
      if (!gameInProgress.status || gameOverTimeout || riding()) return;
      const player = activePlayers.find(p => p.id === socket.id);
      updateCargoLifts(gameMap,activePlayers,Date.now());
      if (player && startJump(player, Date.now())) queueSnapshot();
    });
    socket.on("disconnect", () => handleDisconnect(socket));
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
    socket.join("waiting");

    io.to("waiting").emit("updateWaitingList", waitingPlayers);
    console.log(
      `${socket.user.username} joined the waiting room as "${displayName}" with ${weapon}`,
    );
  }

  function handleStartGame(socket, options) {
    if (gameInProgress.status) return;

    const config = options && typeof options === "object" ? options : {};
    const enableBots = !!config.enableBots;
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

    gameInProgress.status = true;
    matchParticipantIds.clear();
    clearActiveBullets(activeBullets);

    const layout = enableBots ? createPveMap(undefined,startFloor) :
      createPvpMap(undefined,selectedPvpMap,selectedPvpMap?undefined:lastPvpMapId);
    if(!enableBots)lastPvpMapId=layout.map.id;
    recentTerrain=enableBots?[layout.map.composition]:[];
    gameMap = layout.map;
    gameMap.platformEpoch=Date.now();
    const walls = layout.walls;
    BOT_CONFIG.canvasWidth = gameMap.width;
    BOT_CONFIG.canvasHeight = gameMap.height;
    lastRegenAt = Date.now(); squadOrders.clear();
    floorState = { phase: 'combat', floor: startFloor, startedAt: Date.now() };
    floorBotCount = botCount;
    wallLayoutVersion += 1;
    invalidateCachedNavGrid();
    gameWalls.length = 0;
    gameWalls.push(...walls);
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
        height: enableBots ? 0 : (spawnPosition.height || 0),
        groundHeight: enableBots ? 0 : (spawnPosition.height || 0),
        ceilingHeight: enableBots ? gameMap.elevator.ceiling : gameMap.ceiling,
      };
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

    if (botCount > 0) {
      createBotsForCurrentMatch(botCount);
    }

    io.emit("gameStarting", { players: activePlayers.map(playerSnapshot), walls, map: gameMap });
    if(enableBots) publishFloorState();
    io.socketsLeave("waiting");
    console.log(
      "Game started with",
      activePlayers.length,
      "players",
      botCount > 0 ? `(including ${botCount} bot${botCount > 1 ? "s" : ""})` : "",
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
        if(player.knockback||input.epoch!==(player.movementEpoch||0))continue;
        const dt=Math.min(input.dt,player.inputBudget);player.inputBudget-=dt;
        if(dt>0)applyMovementInput(player,{...input,dt,jump:input.jump===true},gameMap,solids(),now,travelCabin());
      }
      queueSnapshot();return;
    }
    if (!gameInProgress.status || gameOverTimeout || riding() || !data ||
        ![data.x, data.y, data.angle].every(Number.isFinite)) return;
    const player = activePlayers.find((p) => p.id === socket.id);
    if (player && player.alive) {
      if(player.usesMovementInputs)return;
      if(player.knockback){player.angle=data.angle;return;}
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
      player.angle = data.angle;

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
    player.weaponSwapUntil=now+WEAPON_SWITCH_MS;
    io.emit('weaponSwitched',{id:player.id,weapon:player.weapon,weaponSkinKey:player.weaponSkinKey,
      weaponSwapUntil:player.weaponSwapUntil});
    queueSnapshot();return true;
  }

  function fireHitscan(player, angle, pitch = 0) {
    if (!gameInProgress.status || gameOverTimeout || riding() || !player || !player.alive) return false;
    const now = Date.now();
    if(now<(player.weaponSwapUntil||0))return false;
    const cooldown = (WEAPONS[player.weapon] || WEAPONS.pistol).cooldownMs;
    if (now - (player.lastShotAt || 0) < cooldown) return false;
    if(player.weapon==='shotgun') {
      if(now<(player.shotgunReloadUntil||0))return false;
      if(player.shotgunShotsRemaining==null||player.shotgunShotsRemaining===0)
        player.shotgunShotsRemaining=WEAPONS.shotgun.shotsPerReload;
      player.shotgunShotsRemaining--;
      player.shotgunReloadUntil=player.shotgunShotsRemaining===0?now+WEAPONS.shotgun.reloadMs:0;
      queueSnapshot();
    }
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
      const shotgunBarrel=WEAPONS.shotgun.shotsPerReload-1-player.shotgunShotsRemaining;
      io.emit('shotFired',{...pellets[0],pellets,shotgunBarrel,weaponSkinKey:player.weaponSkinKey,
        bulletId:nextBulletId++});
      for(const [targetId,amount] of damage)handlePlayerHit({targetId,shooterId:player.id},
        amount*(player.isBot?BOT_COMBAT.damageScale:1));
      return true;
    }
    const trace=player.weapon==='sniper'?tracePiercingShot:traceShot;
    const shot = trace(player, angle, gameWalls, activePlayers,
      target => canDamage(player, target), pitch, gameMap);
    shot.bulletId = nextBulletId++;
    io.emit("shotFired", shot);
    for(const targetId of shot.targetIds||(shot.targetId?[shot.targetId]:[]))
      handlePlayerHit({ targetId, shooterId: player.id });
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
    if (specialDamage !== undefined) damage = specialDamage;

    target.health = Math.max(0, (target.health ?? MAX_HEALTH) - damage);
    if(target.isBot && target.health>0 && damage>0) {
      const source=payload?.origin||shooter;
      const reaction=recordEnemyHit(target,source,payload?.kind||shooter?.weapon||'pistol',damage,now);
      // Heavy Ogres can be driven out of a charged laser, but an already
      // committed ground slam still lands. Their resistance keeps this rare.
      if(reaction.fearStarted&&target.botType==='ogre'&&target.ogreAttack?.kind==='laser') {
        target.ogreAttack=null;
        target.botState.ogreReadyAt=Math.max(target.botState.ogreReadyAt||0,now+700);
      }
    }
    if(gameMap.mode==='pve' && target.isBot && damage>0) {
      alertNearbyBots(target,shooter,activePlayers.filter(p=>p!==target || target.health>0),now,target.health<=0);
    }
    if (target.health <= 0) {
      target.alive = false;
      const death=deathDescriptor(target,payload?.origin||shooter,payload?.kind||shooter?.weapon||'pistol',gameMap,gameWalls);
      io.emit("playerKilled", target.id,death);
      if(gameMap.mode==='pve') {
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

        if (!sameAccountKill && !(gameMap.mode !== 'pve' && shooterNamedAsBot && killedBot)) {
          const accountUser = usersByUsername.get(shooterUsername);
          if (accountUser) {
            if (!accountUser.currencies || typeof accountUser.currencies !== "object") {
              accountUser.currencies = {};
            }
            const currentCoins =
              typeof accountUser.currencies.Coins === "number"
                ? accountUser.currencies.Coins
                : 0;
            const newCoins = currentCoins + 5;
            accountUser.currencies.Coins = newCoins;
            saveUsers();

            io.to(shooter.id).emit("coinsUpdated", { coins: newCoins });
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

    const activeIndex = activePlayers.findIndex((p) => p.id === socket.id);
    if (activeIndex !== -1) {
      activePlayers.splice(activeIndex, 1);
      io.emit("playerLeft", socket.id);
      for(let i=activePlayers.length-1;i>=0;i--)if(activePlayers[i].debugCloneOf===socket.id) {
        io.emit('playerLeft',activePlayers[i].id);activePlayers.splice(i,1);
      }
      maybeTriggerGameOver();
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

    displayName = displayName.substring(0, 16);
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
    if (gameMap.mode === 'pve') {
      if (!alivePlayers.some(p => !p.isBot)) scheduleGameOver({ name: 'Bots', team: 'bots' });
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
    gameMap = DEFAULT_MAP; squadOrders.clear(); lastRegenAt = 0;
    floorState = {phase:'combat',floor:1,startedAt:0}; floorBotCount = 0;
    // Reset bullet bookkeeping between matches
    clearActiveBullets(activeBullets);
    nextBulletId = 1;
    if (recipients.length > 0) io.to(recipients).emit("resetGame");
    matchParticipantIds.clear();
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
    const elevated=gameMap.mode==='pve';
    // Bots use the permanent stairs, never plan a path through a timed lift.
    if(elevated)walls=walls.map(s=>s.kind==='lift'?{...s,top:s.maxTop}:s.liftId?{...s,bottom:0,top:gameMap.ceiling}:s);
    const surfaces=elevated?walls.filter(s=>s.walkable||s.kind==='ramp'):[];
    const radius = BOT_CONFIG.playerRadius;
    const cellSize = gameMap.mode === 'pve' ? 16 : Math.max(4, Math.floor(radius / 2));
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
    if(gameMap.mode === 'pve') return floorSpawn(gameMap,bot,index);
    // Reserved, obstacle-free staging areas. Formation slots are spaced apart.
    const cols = 3;
    return { x: (bot ? 1600 : 90) + (index % cols) * 55,
      y: 480 + Math.floor(index / cols) * 55 };
  }

  function createBotsForCurrentMatch(count) {
    const difficulty = floorDifficulty(gameMap.floor, count);
    const elite = gameMap.mode === 'pve' && gameMap.floor > 20;
    const numBots = Math.max(
      0,
      gameMap.mode === 'pve' ? difficulty.count : Math.min(count || 0, BOT_CONFIG.maxPerMatch),
    );
    if (numBots === 0) return;

    for (let i = 0; i < numBots; i++) {
      const botId = `bot-${nextBotId++}`;
      const color =
        colors[(activePlayers.length + i) % colors.length] || "#888888";
      const ogre = gameMap.mode === 'pve' && i >= numBots-difficulty.ogres;
      const dread = elite && !ogre;
      const captain = dread && i < 2;
      let spawn = gameMap.mode === 'pve' ? getTeamSpawn(true, i) : getValidSpawnPosition(gameWalls, activePlayers);
      // Expanded waves use validated ground slots, including room for Ogre bodies.
      if(gameMap.mode==='pve') {
        const radius=ogre?30:20;
        const safe=p=>p.x>radius&&p.x<gameMap.width-radius&&p.y>radius&&p.y<gameMap.height-radius&&
          ![gameMap.arrivalElevator,gameMap.elevator].filter(Boolean).some(e=>p.x>e.x-radius&&p.x<e.x+e.width+radius&&p.y>e.y-radius&&p.y<e.y+e.height+radius)&&
          (!ogre||!(p.height>0))&&canOccupy(p.x,p.y,p.height||0,solids(),radius,0.001,ogre?3.8:2.2)&&
          activePlayers.every(other=>Math.hypot(other.x-p.x,other.y-p.y)>(other.bodyRadius||20)+radius+8);
        if(!safe(spawn)) {
          const candidates=[];
          for(let y=60;y<gameMap.height-50;y+=55)for(let x=60;x<gameMap.width-50;x+=55){
            const p={x,y,height:0};if(safe(p)&&Math.hypot(x-gameMap.elevator.x,y-gameMap.elevator.y)>350)candidates.push(p);
          }
          candidates.sort((a,b)=>Math.hypot(a.x-gameMap.botSpawn.x,a.y-gameMap.botSpawn.y)-Math.hypot(b.x-gameMap.botSpawn.x,b.y-gameMap.botSpawn.y));
          if(!candidates.length)continue;
          spawn=candidates[0];
        }
      }
      const bot = {
        id: botId,
        name: ogre ? 'OGRE' : captain ? `DREAD CAPTAIN ${i + 1}` : dread ? `DREAD TROOPER ${i + 1}` : `BOT ${i + 1}`,
        displayName: ogre ? 'OGRE' : captain ? `DREAD CAPTAIN ${i + 1}` : dread ? `DREAD TROOPER ${i + 1}` : `BOT ${i + 1}`,
        accountUsername: null,
        color: dread ? (captain?'#e6323f':'#991d2b') : gameMap.mode === 'pve' ? '#df8153' : color,
        weapon: BOT_CONFIG.weaponKey,
        weaponSkinKey:
          DEFAULT_SKIN_BY_WEAPON[BOT_CONFIG.weaponKey] || null,
        x: spawn.x,
        y: spawn.y,
        angle: 0,
        alive: true,
        health: ogre ? 360 : gameMap.mode==='pve' ? difficulty.health+(captain?40:0) : BOT_COMBAT.health,
        maxHealth: ogre ? 360 : gameMap.mode==='pve' ? difficulty.health+(captain?40:0) : BOT_COMBAT.health,
        botType: ogre ? 'ogre' : dread ? 'dread' : 'soldier',
        botRank: captain ? 'captain' : undefined,
        bodyRadius: ogre ? 30 : 20, bodyHeight: ogre ? 3.8 : 2.2,
        eyeHeight: ogre ? 2.8 : 1.84,
        moveScale: gameMap.mode==='pve' ? difficulty.speed*(ogre?0.7:1) : 1,
        isBot: true,
        team: 'bots', squad: Math.floor(i / 3), squadSlot: i % 3,
        height: spawn.height || 0, groundHeight: spawn.height || 0,
        botState: {
          lastShotAt: 0,
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
    const target=perceive(bot,humans,now,p=>{
      const distance=Math.hypot(p.x-bot.x,p.y-bot.y);
      const pitch=Math.atan2((p.height||0)+1.4-(bot.height||0)-(bot.eyeHeight||1.84),distance*0.05);
      return traceShot(bot,Math.atan2(p.y-bot.y,p.x-bot.x),gameWalls,[p],()=>true,pitch,gameMap).targetId===p.id;
    });
    if(target)squadOrders.set(bot.squad,{...state.lastSeen});
    const fear=currentEnemyFear(bot,now);
    if(bot.botType==='ogre' && (!fear||bot.ogreAttack?.kind==='slam') && tickOgre(bot,target,activePlayers,gameWalls,gameMap,now,
      (targetId,amount)=>handlePlayerHit({targetId,shooterId:bot.id},amount))) {
      state.velocityX=0;state.velocityY=0;
      return {moveX:0,moveY:0,speed:0,aimAngle:bot.ogreAttack?.angle??bot.angle,shoot:false};
    }
    let goal=chooseIntent(bot,target,squadOrders.get(bot.squad),now);
    // Dread squads press closer than ordinary soldiers instead of hovering at
    // the standard rifle distance. Captains lead the push.
    if(target&&bot.botType==='dread') {
      const distance=Math.hypot(goal.x-target.x,goal.y-target.y),desired=bot.botRank==='captain'?150:175;
      if(distance>1){goal.x=target.x+(goal.x-target.x)*desired/distance;goal.y=target.y+(goal.y-target.y)*desired/distance;}
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
      const requestedGoal={...goal,height:retreat?(bot.height||0):target?.height??state.lastSeen?.height??bot.height??0},requestedState=state;
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
    const shoot=bot.botType==='dread'?
      tickDreadCarbine(bot,target,inRange&&canAttack,aligned,now):
      bot.botType!=='ogre'&&readyToShoot(state,target?.id,inRange&&aligned&&canAttack,now);
    const speed=retreat?.speed??(state.mode==='idle'?0.52:state.mode==='combat'?0.95:1);
    return { moveX, moveY, speed, aimAngle:facing,shoot };
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
    if(gameMap.mode==='pve') {
      const state=bot.botState,len=Math.max(1,Math.hypot(mx,my)),speed=action.speed??1;
      state.velocityX=(state.velocityX||0)+(mx/len*speed-(state.velocityX||0))*0.38;
      state.velocityY=(state.velocityY||0)+(my/len*speed-(state.velocityY||0))*0.38;
      mx=state.velocityX;my=state.velocityY;
    }
    const length = Math.sqrt(mx * mx + my * my);

    if (length > 0.001 && gameMap.mode === 'pve') {
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
      const turnStep=gameMap.mode==='pve' ? (bot.botType==='ogre'?0.16:0.24) : 0.12;
      bot.angle += Math.max(-turnStep, Math.min(turnStep, difference));
    }

    if (action.shoot) {
      const botState = bot.botState || (bot.botState = {});
      const interval=bot.botType==='dread'?DREAD_COMBAT.shotIntervalMs:BOT_COMBAT.shotIntervalMs;
      if (now - (botState.lastShotAt || 0) >= interval) {
        if (fireBulletFromBot(bot)) {
          if(bot.botType==='dread')recordDreadShot(bot,now);
          else recordShot(botState, now);
        }
      }
    }

    return moved;
  }

  function startElevatorRide(now) {
    const humans=activePlayers.filter(p=>!p.isBot&&p.alive);
    if(gameMap.mode!=='pve'||!['combat','ready'].includes(floorState.phase)||!humans.length||
      activePlayers.some(p=>p.isBot&&p.alive)||!humans.every(p=>inElevator(p,gameMap)))return false;
    floorState={phase:'riding',floor:gameMap.floor,startedAt:now};
    grenades.length=0;pickups.length=0;queueSnapshot();
    for(const p of activePlayers)p.grenadeChargeAt=null;
    for(const p of humans) {
      p.jumpStartedAt=null;p.height=0;p.groundHeight=0;p.knockback=null;
      p.platformId=null;p.groundPlatformId=null;p.movementEpoch=(p.movementEpoch||0)+1;
    }
    updateExitDoor(gameMap,floorState,now);publishFloorState();return true;
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
      gameMap.platformEpoch=now;
      for(const p of activePlayers)if(!p.isBot)p.grenades=3;
      gameWalls.splice(0,gameWalls.length,...next.walls);
      for(let i=activePlayers.length-1;i>=0;i--) if(activePlayers[i].isBot)activePlayers.splice(i,1);
      squadOrders.clear(); wallLayoutVersion++; invalidateCachedNavGrid();
      navigation.configure(gameMap,gameWalls);
      clearActiveBullets(activeBullets);
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
    if (gameMap.mode === 'pve') {
      regeneratePlayers(activePlayers, Math.max(0, (jumpNow - lastRegenAt) / 1000));
      lastRegenAt = jumpNow;
      advanceFloor(jumpNow);
      if (riding()) { publishSnapshot(); return; }
    }
    let jumping = false;
    updateCargoLifts(gameMap,activePlayers,jumpNow);
    if(collectPickups(pickups,activePlayers,gameMap,gameWalls,jumpNow))queueSnapshot();
    for (const player of activePlayers) {
      advanceKnockback(player,jumpNow,gameMap,solids());
      if (advanceJump(player, jumpNow)) jumping = true;
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
    if (bots.length === 0) {if(snapshotDirty||jumping||gameMap.mode==='pve')publishSnapshot();return;}

    const snapshotPlayers = activePlayers.slice();
    const now = Date.now();
    let anyBotMoved = false;

    for (const bot of bots) {
      const action = gameMap.mode === 'pve' ? computeSquadAction(bot, bots, now) : computeScriptedBotAction(bot, snapshotPlayers, gameWalls);
      const moved = applyBotAction(bot, action, now);
      if (moved) {
        anyBotMoved = true;
      }
    }

    if (anyBotMoved||snapshotDirty||jumping||gameMap.mode==='pve')publishSnapshot();
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
    rebuildNavigation() { navigation.configure(gameMap,gameWalls); },
    close() {
      navigation.close();
      clearInterval(botTimer);
      if (gameOverTimeout) clearTimeout(gameOverTimeout);
    },
  };
}

module.exports = { createGameServer };
