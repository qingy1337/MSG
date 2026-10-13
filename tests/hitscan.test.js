const { test } = require('node:test');
const assert = require('node:assert/strict');
const { traceShot, tracePiercingShot } = require('../game/hitscan');
const { createGameServer } = require('../game/gameServer');
const { BOT_COMBAT, readyToShoot, recordShot } = require('../game/botCombat');
const { MOVEMENT, startJump, advanceJump } = require('../public/movement');
const {WEAPONS,DEFAULT_WEAPON_KEY,SECONDARY_WEAPON_KEY,WEAPON_SWITCH_MS}=require('../public/weapons');
const shooter = { id: 's', x: 100, y: 100, alive: true, health: 100, weapon: 'pistol' };
const target = { id: 't', x: 250, y: 100, alive: true, health: 100 };

test('instant ray hits nearest living character, regardless of array order', () => {
  const result = traceShot(shooter, 0, [], [{ ...target, id: 'far', x: 400 }, target, shooter]);
  assert.equal(result.targetId, 't'); assert.equal(result.endX, 230);
  assert.equal(traceShot(shooter, 0, [], [{ ...target, alive: false }]).hit, 'boundary');
});
test('cover stops a shot, including parallel and touching-edge rays', () => {
  const wall = { x: 180, y: 80, width: 20, height: 100 };
  assert.equal(traceShot(shooter, 0, [wall], [target]).hit, 'wall');
  assert.equal(traceShot(shooter, 0, [wall], [target]).endX, 180);
  assert.equal(traceShot({ ...shooter, y: 80 }, 0, [wall], []).hit, 'wall');
  assert.equal(traceShot(shooter, Math.PI / 2, [wall], []).endY, 600);
});
test('piercing rays hit every aligned enemy at full range but stop at world geometry',()=>{
  const enemies=Array.from({length:10},(_,i)=>({...target,id:`t${i}`,x:180+i*50}));
  const clear=tracePiercingShot({...shooter,weapon:'sniper'},0,[],enemies);
  assert.deepEqual(clear.targetIds,enemies.map(enemy=>enemy.id));
  assert.equal(clear.targetId,'t0');assert.equal(clear.endX,900);assert.equal(clear.hit,'boundary');
  const covered=tracePiercingShot({...shooter,weapon:'sniper'},0,
    [{x:400,y:80,width:20,height:40}],enemies);
  assert.deepEqual(covered.targetIds,enemies.slice(0,5).map(enemy=>enemy.id));
  assert.equal(covered.endX,400);assert.equal(covered.hit,'wall');
});
test('misses, reverse rays, overlaps, and allies resolve correctly', () => {
  assert.equal(traceShot(shooter, Math.PI, [], [target]).targetId, null);
  assert.ok(Math.abs(traceShot(shooter, Math.PI, [], []).endX) < 1e-8);
  assert.equal(traceShot(shooter, 0, [], [target], () => false).targetId, null);
  assert.equal(traceShot(shooter, 0, [], [{ ...target, x: 105 }]).endX, 100);
  assert.equal(traceShot(shooter, 0, [], [{ ...target, y: 121 }]).targetId, null);
});

test('first-person pitch can miss above targets, hit floors, or pass over cover', () => {
  assert.equal(traceShot(shooter, 0, [], [target], () => true, 0.4).targetId, null);
  const downward = traceShot(shooter, 0, [], [target], () => true, -0.7);
  assert.equal(downward.hit, 'floor');
  assert.ok(Math.abs(downward.endHeight) < 1e-8);
  const wall = { x: 180, y: 80, width: 20, height: 100 };
  assert.equal(traceShot(shooter, 0, [wall], [], () => true, 0.5).hit, 'boundary');
  assert.equal(traceShot(shooter, 0, [wall], [], () => true, 0).hit, 'wall');
  const upperBody = traceShot(shooter, 0, [], [{ ...target, x: 140 }], () => true, 0.15);
  assert.equal(upperBody.targetId, 't');
});

test('jump rises, falls, lands, and cannot be restarted in midair', () => {
  const player = { alive: true };
  assert.equal(startJump(player, 1000), true);
  advanceJump(player, 1200);
  assert.ok(player.height > 0);
  assert.equal(startJump(player, 1200), false);
  const peakTime = 1000 + MOVEMENT.jumpSpeed / MOVEMENT.gravity * 1000;
  advanceJump(player, peakTime);
  const peak = player.height;
  assert.ok(peak > 1.2 && peak < 1.3, 'jump is slightly higher than before');
  assert.ok(2 * MOVEMENT.jumpSpeed / MOVEMENT.gravity < 0.8, 'stronger gravity shortens airtime');
  // Check midway through the descent, independent of the tuned airtime.
  advanceJump(player, 1000 + 1.5 * MOVEMENT.jumpSpeed / MOVEMENT.gravity * 1000);
  assert.ok(player.height < peak && player.height > 0);
  advanceJump(player, 2000);
  assert.equal(player.height, 0);
  assert.equal(player.jumpStartedAt, null);
  assert.equal(startJump(player, 2000), true);
  assert.equal(startJump({ alive: false }, 2000), false);
});

test('hitscan uses shooter and target jump heights', () => {
  const airborne = { ...shooter, height: 1.1 };
  assert.equal(traceShot(airborne, 0, [], [target]).targetId, null);
  assert.equal(traceShot(airborne, 0, [], [{ ...target, height: 1.1 }]).targetId, 't');
  const wall = { x: 180, y: 80, width: 20, height: 100 };
  assert.equal(traceShot(airborne, 0, [wall], []).hit, 'wall');
  assert.equal(traceShot({ ...shooter, height: 1.3 }, 0, [wall], []).hit, 'boundary');
  const down = traceShot(airborne, 0, [], [], () => true, -0.7);
  assert.equal(down.hit, 'floor');
  assert.ok(Math.abs(down.endHeight) < 1e-8);
});

test('server owns damage, origins, cooldowns, and invalid input rejection', () => {
  let connection;
  const events = [];
  const io = { on: (_, fn) => { connection = fn; }, emit: (name, data) => events.push({ name, data }), to() { return this; } };
  const game = createGameServer(io);
  const handlers = {};
  const socket = { id: 's', on: (name, fn) => { handlers[name] = fn; } };
  try {
    connection(socket);
    game.gameInProgress.status = true;
    game.activePlayers.push({ ...shooter }, { ...target });
    assert.equal(handlers.playerHit, undefined);
    handlers.shoot({ angle: NaN }); handlers.shoot({ angle: Infinity });
    assert.equal(events.length, 0);
    handlers.shoot({ angle: 0, x: 800, y: 500, damage: 9999 });
    assert.equal(game.activePlayers[1].health, 89.5);
    assert.equal(events.find(e => e.name === 'shotFired').data.x, 100);
    handlers.shoot({ angle: 0 });
    assert.equal(game.activePlayers[1].health, 89.5);
    game.activePlayers[0].lastShotAt = 0;
    game.activePlayers[0].weapon = 'miniGun';
    handlers.shoot({ angle: 0 });
    assert.equal(game.activePlayers[1].health, 87.5);
    game.activePlayers[0].weapon = 'pistol';
    game.activePlayers[1].health = 89.5;
    handlers.playerUpdate({ x: NaN, y: 100, angle: 0 });
    assert.equal(game.activePlayers[0].x, 100);
    game.activePlayers[0].lastShotAt = 0;
    game.gameWalls.push({ x: 180, y: 80, width: 20, height: 100 });
    handlers.shoot({ angle: 0 });
    assert.equal(game.activePlayers[1].health, 89.5);
    handlers.jump();
    const jumpStarted = game.activePlayers[0].jumpStartedAt;
    assert.ok(Number.isFinite(jumpStarted));
    handlers.jump();
    assert.equal(game.activePlayers[0].jumpStartedAt, jumpStarted);
    handlers.playerUpdate({ x: 100, y: 100, angle: 0, height: 999 });
    assert.notEqual(game.activePlayers[0].height, 999);
  } finally { game.close(); }
});

test('sniper pierces ten PvP opponents for 90 damage each and uses its shorter cooldown',t=>{
  let connection,now=100000;
  t.mock.method(global,'setInterval',()=>0);t.mock.method(Date,'now',()=>now);
  const events=[],handlers={};
  const io={on:(_,fn)=>{connection=fn;},emit:(name,data)=>events.push({name,data}),to(){return this;}};
  const game=createGameServer(io);
  connection({id:'s',on:(name,fn)=>{handlers[name]=fn;}});
  try {
    game.gameInProgress.status=true;
    const sniper={...shooter,weapon:'sniper'};
    const enemies=Array.from({length:10},(_,i)=>({...target,id:`enemy-${i}`,x:180+i*50}));
    game.activePlayers.push(sniper,...enemies);
    handlers.shoot({angle:0,pitch:0});
    assert.equal(WEAPONS.sniper.cooldownMs,1100);
    assert.ok(enemies.every(enemy=>enemy.health===10));
    assert.deepEqual(events.find(event=>event.name==='shotFired').data.targetIds,enemies.map(enemy=>enemy.id));
    now+=1099;handlers.shoot({angle:0,pitch:0});
    assert.ok(enemies.every(enemy=>enemy.health===10),'cannot fire one millisecond early');
    now+=1;handlers.shoot({angle:0,pitch:0});
    assert.ok(enemies.every(enemy=>enemy.health===0));
  } finally {game.close();}
});

test('pistol is a permanent secondary and server-authoritative E swaps preserve both weapon skins',t=>{
  let now=100000,connection;
  t.mock.method(global,'setInterval',()=>0);t.mock.method(Date,'now',()=>now);
  const events=[],handlers={};
  const io={on:(_,fn)=>{connection=fn;},emit:(name,data)=>events.push({name,data}),to(){return this;}};
  const game=createGameServer(io);
  connection({id:'s',on:(name,fn)=>{handlers[name]=fn;}});
  try {
    assert.equal(WEAPONS.pistol.selectable,false);
    assert.equal(DEFAULT_WEAPON_KEY,'autoRifle');assert.equal(SECONDARY_WEAPON_KEY,'pistol');
    game.gameInProgress.status=true;
    const player={...shooter,weapon:'sniper',weaponSkinKey:'sniper_flatpack',primaryWeapon:'sniper',
      primaryWeaponSkinKey:'sniper_flatpack',secondaryWeapon:'pistol',secondaryWeaponSkinKey:'pistol_basicBlue'};
    game.activePlayers.push(player,{...target});
    handlers.switchWeapon();
    assert.equal(player.weapon,'pistol');assert.equal(player.weaponSkinKey,'pistol_basicBlue');
    assert.equal(player.weaponSwapUntil,now+WEAPON_SWITCH_MS);
    assert.deepEqual(events.find(e=>e.name==='weaponSwitched').data,
      {id:'s',weapon:'pistol',weaponSkinKey:'pistol_basicBlue',weaponSwapUntil:now+WEAPON_SWITCH_MS});
    handlers.shoot({angle:0});assert.equal(game.activePlayers[1].health,100,'cannot shoot through swap animation');
    handlers.switchWeapon();assert.equal(player.weapon,'pistol','cannot spam past the swap time');
    now+=WEAPON_SWITCH_MS;handlers.shoot({angle:0});assert.equal(game.activePlayers[1].health,89.5);
    handlers.switchWeapon();assert.equal(player.weapon,'sniper');assert.equal(player.weaponSkinKey,'sniper_flatpack');
  } finally {game.close();}
});

test('minigun buffs close/medium damage, preserves long-range falloff, and ignores client range', () => {
  let connection;
  const io = { on: (_, fn) => { connection = fn; }, emit() {}, to() { return this; } };
  const game = createGameServer(io), handlers = {};
  try {
    connection({ id: 's', on: (name, fn) => { handlers[name] = fn; } });
    game.gameInProgress.status = true;
    const attacker = { ...shooter, weapon: 'miniGun' }, victim = { ...target };
    game.activePlayers.push(attacker, victim);
    for (const [distance, damage] of [[40, 4], [50, 4], [100, 3], [150, 2], [200, 2], [275, 2], [362.5, 1.2], [450, 0.4], [550, 0.2], [575, 0.15], [650, 0.15]]) {
      victim.x = attacker.x + distance; victim.health = 100; attacker.lastShotAt = 0;
      handlers.shoot({ angle: 0, distance: 0, damage: 999, x: victim.x });
      assert.ok(Math.abs(victim.health - (100 - damage)) < 1e-9, `range ${distance}`);
    }
    attacker.weapon = 'pistol'; attacker.lastShotAt = 0; victim.health = 100;
    handlers.shoot({ angle: 0 });
    assert.equal(victim.health, 89.5, 'other weapons retain their damage');
  } finally { game.close(); }
});

test('slimmer movement collider fits a 34-unit gap but still rejects wall overlap', () => {
  let connection;
  const io = { on: (_, fn) => { connection = fn; }, emit() {}, to() { return this; } };
  const game = createGameServer(io), handlers = {};
  try {
    connection({ id: 's', on: (name, fn) => { handlers[name] = fn; } });
    game.gameInProgress.status = true;
    const player = { ...shooter, x: 117, y: 90 };
    game.activePlayers.push(player);
    game.gameWalls.push({ x: 60, y: 120, width: 40, height: 150 }, { x: 134, y: 120, width: 40, height: 150 });
    handlers.playerUpdate({ x: 117, y: 150, angle: 0 });
    assert.equal(player.y, 150, 'passes through gap narrower than old 40-unit diameter');
    handlers.playerUpdate({ x: 110, y: 160, angle: 0 });
    assert.equal(player.x, 117); assert.equal(player.y, 150);
    game.gameWalls.length = 0;
    handlers.playerUpdate({ x: 0, y: 600, angle: 0 });
    assert.equal(player.x, MOVEMENT.radius); assert.equal(player.y, 600 - MOVEMENT.radius);
  } finally { game.close(); }
});

test('bots give newly visible players time to react', async () => {
  const events = [];
  const io = { on() {}, emit: (name, data) => events.push({ name, data }), to() { return this; } };
  const game = createGameServer(io);
  try {
    game.gameInProgress.status = true;
    game.activePlayers.push({ ...shooter, isBot: true, weapon: 'miniGun', botState: {} }, { ...target });
    await new Promise(resolve => setTimeout(resolve, 120));
    assert.equal(events.some(event => event.name === 'shotFired'), false);
    assert.equal(game.activePlayers[1].health, 100);
  } finally { game.close(); }
});

test('lobby joins are idempotent and finished-match cleanup is scoped to its participants', t => {
  let connection, resetMatch;
  t.mock.method(global, 'setInterval', () => 0);
  t.mock.method(global, 'setTimeout', fn => { resetMatch = fn; return 1; });
  const globalEvents = [], targetedEvents = [], handlers = {};
  const io = {
    on(_, fn) { connection = fn; },
    emit(name, data) { globalEvents.push({ name, data }); },
    to(target) {
      return { emit(name, data) { targetedEvents.push({ target, name, data }); } };
    },
    socketsLeave() {},
  };
  const game = createGameServer(io);
  const connect = id => {
    const socketHandlers = {};
    connection({
      id,
      user: { username: id, skins: { equippedByWeapon: {} }, currencies: {} },
      on(name, fn) { socketHandlers[name] = fn; },
      join() {},
    });
    handlers[id] = socketHandlers;
  };
  try {
    connect('p0'); connect('p1');
    handlers.p0.join({ displayName: 'First', weapon: 'autoRifle' });
    handlers.p0.join({ displayName: 'Updated', weapon: 'sniper' });
    assert.equal(game.waitingPlayers.length, 1);
    assert.equal(game.waitingPlayers[0].name, 'Updated');
    assert.equal(game.waitingPlayers[0].weapon, 'sniper');
    handlers.p1.join({ displayName: 'Second', weapon: 'autoRifle' });
    handlers.p0.startGame({ enableBots: false });

    game.gameWalls.length = 0;
    game.gameMap.terrain.length = 0;
    const winner = game.activePlayers.find(player => player.id === 'p0');
    const loser = game.activePlayers.find(player => player.id === 'p1');
    Object.assign(winner, { x: 100, y: 100, height: 0, angle: 0, lastShotAt: 0 });
    Object.assign(loser, { x: 200, y: 100, height: 0, health: 1 });
    handlers.p0.shoot({ angle: 0, pitch: 0 });

    const gameOver = targetedEvents.find(event => event.name === 'gameOver');
    assert.deepEqual(new Set(gameOver.target), new Set(['p0', 'p1']));
    assert.equal(globalEvents.some(event => event.name === 'gameOver'), false);

    connect('next-player');
    handlers['next-player'].join({ displayName: 'Next', weapon: 'autoRifle' });
    resetMatch();
    const reset = targetedEvents.find(event => event.name === 'resetGame');
    assert.deepEqual(new Set(reset.target), new Set(['p0', 'p1']));
    assert.equal(globalEvents.some(event => event.name === 'resetGame'), false);
    assert.equal(game.waitingPlayers.some(player => player.id === 'next-player'), true,
      'the next lobby survives cleanup of the previous match');
  } finally { game.close(); }
});

test('bot bursts have reaction delay, shot spacing, and recovery windows', () => {
  const state = {};
  assert.equal(readyToShoot(state, 'target', true, 0), false);
  assert.equal(readyToShoot(state, 'target', true, 749), false);
  assert.equal(readyToShoot(state, 'target', true, 750), true);
  recordShot(state, 750);
  assert.equal(readyToShoot(state, 'target', true, 989), false);
  assert.equal(readyToShoot(state, 'target', true, 990), true);
  recordShot(state, 990);
  assert.equal(readyToShoot(state, 'target', true, 1230), true);
  recordShot(state, 1230);
  assert.equal(readyToShoot(state, 'target', true, 2329), false);
  assert.equal(readyToShoot(state, 'target', true, 2330), true);
  assert.equal(readyToShoot(state, 'target', false, 2400), false);
  assert.equal(readyToShoot(state, 'target', true, 2500), false);
  assert.equal(readyToShoot(state, 'target', true, 3250), true);
  assert.equal(readyToShoot(state, 'other', true, 3300), false);
  assert.equal(state.readyAt, 3300 + BOT_COMBAT.reactionMs);
});
