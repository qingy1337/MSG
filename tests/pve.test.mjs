import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import maps from '../public/arenaMap.js';
import floors from '../public/floors.js';
import movement from '../public/movement.js';
import inputMovement from '../public/inputMovement.js';
import combat from '../game/hitscan.js';
import server from '../game/gameServer.js';
import awareness from '../game/botAwareness.js';
import reactions from '../game/enemyReactions.js';
import {updateCharacterMotion} from '../public/characterMotion.mjs';
import { createTerrainModel } from '../public/pveEnvironment.mjs';
import {createTempleEnvironment} from '../public/templeEnvironment.mjs';
import {createSpaceEnvironment} from '../public/spaceEnvironment.mjs';
import {createAirportEnvironment} from '../public/airportEnvironment.mjs';
import { createElevatorModel } from '../public/elevator.mjs';
const { createPveMap, moveOnTerrain, groundHeight, canOccupy, regeneratePlayers } = maps;
const { startJump, advanceJump } = movement;
const { traceShot } = combat;

test('enemy hit reactions scale force by weapon and throttle rapid minigun stacking',()=>{
  const source={id:'p',x:100,y:200,angle:0};
  const make=(botType='soldier',maxHealth=100)=>({id:botType,isBot:true,alive:true,botType,
    x:200,y:200,health:maxHealth,maxHealth,botState:{}});
  const minigun=make();
  reactions.recordEnemyHit(minigun,source,'miniGun',4,1000);
  const first=minigun.knockback;
  reactions.recordEnemyHit(minigun,source,'miniGun',4,1010);
  assert.equal(minigun.knockback,first,'rapid minigun rounds share one tiny impulse');
  const pistol=make(),sniper=make(),ogre=make('ogre',360);
  reactions.recordEnemyHit(pistol,source,'pistol',10.5,1000);
  reactions.recordEnemyHit(sniper,source,'sniper',90,1000);
  reactions.recordEnemyHit(ogre,source,'sniper',90,1000);
  assert.ok(Math.hypot(first.vx,first.vy)<Math.hypot(pistol.knockback.vx,pistol.knockback.vy));
  assert.ok(Math.hypot(pistol.knockback.vx,pistol.knockback.vy)<Math.hypot(sniper.knockback.vx,sniper.knockback.vy));
  assert.ok(Math.hypot(ogre.knockback.vx,ogre.knockback.vy)<Math.hypot(pistol.knockback.vx,pistol.knockback.vy),
    'the Ogre mass heavily resists even a sniper impact');
});

test('impact velocity is residual, additive, accelerated and does not lock movement',()=>{
  const map={width:1000,height:600,terrain:[],ceiling:7.5};
  const player={alive:true,x:300,y:300,height:0,groundHeight:0};
  maps.addKnockbackImpulse(player,100,0,1000,'guardianBurst');
  maps.advanceKnockback(player,1050,map,[]);
  const residual=player.knockback.vx,afterFirst=player.x;
  assert.ok(residual>0&&residual<100);assert.equal(player.knockback.ax,-maps.IMPACT_MOTION.deceleration);
  maps.addKnockbackImpulse(player,80,0,1050,'guardianBurst');
  assert.ok(Math.abs(player.knockback.vx-(residual+80))<1e-9,'the second hit adds to remaining velocity');
  const beforeInput=player.x;
  inputMovement.applyMovementInput(player,{dx:-1,dy:0,dt:.05,jump:false},map,[],1050);
  assert.ok(player.x<beforeInput,'players retain directional control while momentum remains');
  maps.advanceKnockback(player,2000,map,[]);
  assert.ok(player.x>afterFirst,'stacked residual velocity still carries the player');
  assert.equal(player.knockback,null);
});

test('recent burst damage scares enemies into a type-specific retreat and attack pause',()=>{
  const bot={id:'soldier-1',isBot:true,alive:true,botType:'soldier',x:300,y:200,
    health:100,maxHealth:100,botState:{}};
  const source={id:'p',x:100,y:200};
  assert.equal(reactions.recordEnemyHit(bot,source,'pistol',10.5,1000).fear,null);
  assert.equal(reactions.recordEnemyHit(bot,source,'pistol',10.5,1100).fear,null);
  const result=reactions.recordEnemyHit(bot,source,'pistol',10.5,1200);
  assert.ok(result.fearStarted&&result.fear.amount>=0.2);
  const goal=reactions.fearRetreatGoal(bot,1100);
  assert.ok(goal.x>bot.x&&Math.abs(goal.y-bot.y)>0,'retreats away while fanning out from allies');
  assert.equal(reactions.enemyCanAttack(bot,1100),false);
  assert.equal(reactions.currentEnemyFear(bot,result.fear.until+1),null);

  const dread={...bot,id:'dread-1',botType:'dread',health:220,maxHealth:220,knockback:null,botState:{}};
  assert.equal(reactions.recordEnemyHit(dread,source,'autoRifle',55,2000).fear,null,
    'Dread Troopers require a larger burst before retreating');
  assert.ok(reactions.recordEnemyHit(dread,source,'autoRifle',10,2050).fearStarted);
});

test('server hits physically push surviving bots and route frightened bots away from the shooter',t=>{
  let tick,now=100000;
  t.mock.method(global,'setInterval',fn=>{tick=fn;return 0;});
  t.mock.method(Date,'now',()=>now);
  const {game,handlers}=fixture(1);
  try {
    game.gameWalls.length=0;game.gameMap.terrain.length=0;
    const player=game.activePlayers.find(p=>!p.isBot),bots=game.activePlayers.filter(p=>p.isBot),bot=bots[0];
    bots.slice(1).forEach(other=>{other.alive=false;});
    Object.assign(player,{x:100,y:300,height:0,weapon:'pistol',lastShotAt:0});
    Object.assign(bot,{x:260,y:300,height:0,groundHeight:0,angle:Math.PI,health:80,maxHealth:80});
    handlers.shoot({angle:0});
    assert.ok(bot.knockback?.vx>0,'the authoritative hit pushes away from its source');
    now+=100;handlers.shoot({angle:0});
    assert.ok(bot.botState.fear&&bot.botState.fearAttackUntil>now);
    const before=bot.x;now+=50;tick();
    assert.ok(bot.x>before,'knockback and retreat carry the frightened bot away');
    assert.equal(bot.botState.mode,'retreat');
  } finally {game.close();}
});

test('damage alarms split nearby bots into approaches without live tracking or global alerts',()=>{
  const bots=Array.from({length:5},(_,i)=>({id:`b${i}`,isBot:true,alive:true,x:400+i*30,y:400,angle:0,botState:{}}));
  bots[4].x=1500;
  const source={id:'human',alive:true,x:200,y:400};
  awareness.alertNearbyBots(bots[0],source,bots,1000);
  const goals=bots.slice(0,3).map(b=>awareness.chooseIntent(b,null,null,1000));
  assert.equal(new Set(goals.map(g=>`${g.x},${g.y}`)).size,3);
  assert.equal(bots[4].botState.lastSeen,undefined);
  source.x=800;
  assert.equal(bots[1].botState.lastSeen.x,200,'reports copy the damage-time position');
  assert.equal(awareness.perceive(bots[1],[source],1100,()=>false),null);
  awareness.alertNearbyBots(bots[0],source,bots,1100);
  assert.equal(bots[1].botState.lastSeen.x,200,'automatic fire is throttled');
  bots[0].alive=false;
  awareness.alertNearbyBots(bots[0],source,bots,1150,true);
  assert.equal(bots[1].botState.lastSeen.x,800,'death broadcasts even during the hit cooldown');
  awareness.chooseIntent(bots[1],null,null,12000,()=>0.5);
  assert.equal(bots[1].botState.mode,'idle','alerts expire without new evidence');
});

test('server damage and lethal hits alert nearby allies across squad boundaries',t=>{
  t.mock.method(global,'setInterval',()=>0);
  let now=100000;t.mock.method(Date,'now',()=>now);
  const {game,handlers}=fixture(1);
  try {
    game.gameWalls.length=0;game.gameMap.terrain.length=0;
    const player=game.activePlayers.find(p=>!p.isBot),bots=game.activePlayers.filter(p=>p.isBot);
    Object.assign(player,{x:200,y:400,height:0,weapon:'pistol'});
    bots.forEach((b,i)=>Object.assign(b,{x:400,y:400+i*70,height:0,squad:i}));
    handlers.shoot({angle:0});
    assert.ok(bots[0].health<80);
    assert.equal(bots[1].botState.lastSeen.id,player.id);
    bots[0].health=1;now+=100;
    bots[1].botState.lastSeen=null;
    handlers.shoot({angle:0});
    assert.equal(bots[0].alive,false);
    assert.equal(bots[1].botState.lastSeen.seenAt,now);
  } finally {game.close();}
});

test('PvE sniper piercing damages every aligned bot without hurting aligned teammates',t=>{
  t.mock.method(global,'setInterval',()=>0);
  const {game,handlers}=fixture(2);
  try {
    game.gameWalls.length=0;game.gameMap.terrain.length=0;
    const shooter=game.activePlayers.find(p=>p.id==='p0');
    const ally=game.activePlayers.find(p=>p.id==='p1');
    const bots=game.activePlayers.filter(p=>p.isBot);
    Object.assign(shooter,{x:100,y:300,height:0,weapon:'sniper',lastShotAt:0});
    Object.assign(ally,{x:160,y:300,height:0,health:100});
    bots.forEach((bot,i)=>Object.assign(bot,{x:220+i*60,y:300,height:0,health:100,maxHealth:100}));
    handlers.shoot({angle:0,pitch:0});
    assert.equal(ally.health,100);
    assert.ok(bots.every(bot=>bot.health===10));
  } finally {game.close();}
});
const terrainFixture = () => ({map:{mode:'pve',width:1800,height:1200,terrain:[
  {kind:'tower',x:760,y:240,width:180,height:180,top:5.4},
  {kind:'ramp',x:400,y:285,width:360,height:90,top:5.4,axis:'x'},
  {kind:'ramp',x:940,y:285,width:360,height:90,top:5.4,axis:'x',reverse:true},
]}});

test('low boxes reject premature side entry and support edge landings without trapping the player',()=>{
  const box={kind:'cover',x:200,y:200,width:100,height:40,top:1.15};
  const map={width:900,height:600,terrain:[box]},solids=map.terrain;
  const p={x:180,y:220,height:1,alive:true,jumpStartedAt:1000,jumpBase:0,jumpVelocity:7.24};
  assert.equal(moveOnTerrain(p,190,220,map,solids,1250),false,'feet below top cannot enter the side');
  assert.ok(p.x<=184.1);
  p.height=1.2;
  assert.equal(moveOnTerrain(p,190,220,map,solids,1300),true);
  assert.equal(p.groundHeight,1.15,'footprint overlaps ledge even though centre is outside');
  advanceJump(p,1500);
  assert.equal(p.height,1.15);assert.equal(p.jumpStartedAt,null);
  assert.equal(moveOnTerrain(p,250,220,map,solids,1500),true);
  assert.equal(p.height,1.15);
  assert.equal(moveOnTerrain(p,312,220,map,solids,1600),true);
  assert.equal(p.height,1.15,'still supported at opposite edge');
  assert.equal(moveOnTerrain(p,320,220,map,solids,1650),true);
  assert.equal(p.groundHeight,0);assert.equal(p.jumpVelocity,0);
  advanceJump(p,2200);assert.equal(p.height,0);
  assert.equal(moveOnTerrain(p,330,250,map,solids,2200),true,'can walk freely after landing');
  // A corner outside the circular footprint must not create invisible support.
  const corner={x:180,y:180,height:1.15,alive:true};
  moveOnTerrain(corner,188,188,map,solids,3000);
  assert.equal(corner.groundHeight,0);
});

test('platform caps own their top plane and elevator strips are clear of the pocket wall',()=>{
  for(const kind of ['cover','tower']) {
    const model=createTerrainModel({kind,width:100,height:80,top:1.15});
    const cap=model.getObjectByName('platform-cap');
    const capBounds=new THREE.Box3().setFromObject(cap);
    const bodyBounds=new THREE.Box3().setFromObject(model.children[0]);
    assert.ok(Math.abs(capBounds.max.y-1.15)<1e-6);
    assert.ok(bodyBounds.max.y<capBounds.max.y-0.09,'no coplanar body/cap top faces');
    model.traverse(m=>{m.geometry?.dispose();m.material?.dispose();});
  }
  const elevator=createElevatorModel({width:160,height:220,ceiling:3.4});
  const strips=elevator.children.filter(m=>m.name==='door-light-strip');
  assert.equal(strips.length,2);
  for(const strip of strips) {
    const bounds=new THREE.Box3().setFromObject(strip);
    assert.ok(bounds.max.x<7.5-0.01,'whole light sits in front of cabin-facing pocket wall');
  }
  elevator.traverse(m=>{m.geometry?.dispose();m.material?.dispose();});
});

function fixture(humans = 2, pve = true) {
  let connection;
  const events = [], handlers = {};
  const io = { on(_, fn) { connection = fn; }, emit(name,data) { events.push({name,data}); },
    socketsLeave() {}, to() { return this; } };
  const game = server.createGameServer(io);
  connection({ id:'p0', on(name,fn) { handlers[name]=fn; } });
  for(let i=0;i<humans;i++) game.waitingPlayers.push({id:`p${i}`,name:`Player ${i}`,weapon:'pistol'});
  handlers.startGame({enableBots:pve});
  return {game,handlers,events};
}

test('PvE floors retain the expanded arena and non-overlapping landmarks', () => {
  const {map,walls}=createPveMap(731);
  assert.ok(map.width*map.height>=4*900*600);
  assert.ok(map.terrain.length>0);
  assert.ok(map.ceiling>6);
  for (const w of walls) for (const s of map.terrain) {
    const footprint=w.x<s.x+s.width&&w.x+w.width>s.x&&w.y<s.y+s.height&&w.y+w.height>s.y;
    const vertical=(w.bottom||0)<s.top-1e-8&&(s.bottom||0)<w.top-1e-8;
    assert.ok(!(footprint&&vertical),'landmarks may cross wall footprints only when vertically separated');
  }
});

test('PvP compacts the original scatter terrain independently of PvE rooms',()=>{
  const pve=createPveMap(731),pvp=maps.createPvpMap(731,'maze'),original=floors.generateScatterFloor(731);
  assert.equal(pvp.map.mode,'pvp');
  assert.equal(pvp.map.id,'maze');assert.equal(pvp.map.name,'The Maze');
  assert.notDeepEqual(pvp.map.terrain,pve.map.terrain);
  assert.equal(pvp.map.rooms,undefined);
  assert.ok(pve.map.pockets.length>=2);
  assert.equal(pvp.map.ceiling,original.map.ceiling);
  assert.ok(pve.map.ceiling>pvp.map.ceiling,'PvE grammars can use taller architectural volumes');
  assert.equal(pvp.map.elevator,undefined);
  assert.equal(pvp.map.floor,undefined);
  assert.deepEqual(pvp,maps.createPvpMap(731,'maze'));
  assert.equal(pvp.map.width,original.map.width*.72);assert.equal(pvp.map.height,original.map.height*.72);
  assert.equal(pvp.map.terrain.length,original.map.terrain.length,'The Maze keeps every scatter landmark');
  assert.equal(pvp.walls.length,original.walls.filter(w=>w.kind!=='cabin').length,'The Maze keeps every scatter wall');
  for(let i=0;i<pvp.map.terrain.length;i++) {
    assert.equal(pvp.map.terrain[i].x,original.map.terrain[i].x*.72);
    assert.equal(pvp.map.terrain[i].y,original.map.terrain[i].y*.72);
  }
});

test('PvP spawns safely across compact arenas, traverses ramps, and never regenerates',t=>{
  let tick,now=100000,seed=731;
  t.mock.method(global,'setInterval',fn=>{tick=fn;return 0;});t.mock.method(Date,'now',()=>now);
  t.mock.method(Math,'random',()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;});
  const {game,handlers,events}=fixture(4,false);
  try {
    const solids=[...game.gameWalls,...game.gameMap.terrain];
    assert.ok(game.activePlayers.every(p=>!p.isBot&&canOccupy(p.x,p.y,0,solids)));
    assert.equal(new Set(game.activePlayers.map(p=>p.team)).size,4);
    const xs=game.activePlayers.map(p=>p.x),ys=game.activePlayers.map(p=>p.y);
    assert.ok(Math.max(...xs)-Math.min(...xs)>game.gameMap.width*.25||
      Math.max(...ys)-Math.min(...ys)>game.gameMap.height*.25,'spawns use separated pockets');
    for(const p of game.activePlayers)assert.equal(p.ceilingHeight,game.gameMap.ceiling);
    const p=game.activePlayers.find(p=>p.id==='p0');p.health=50;
    now+=2000;tick();assert.equal(p.health,50);
    game.gameWalls.length=0;game.gameMap.terrain=terrainFixture().map.terrain;
    Object.assign(p,{x:390,y:330,height:0});
    handlers.playerUpdate({x:850,y:330,angle:0,height:999});
    assert.ok(Math.abs(p.x-Math.min(850,game.gameMap.width-16))<1e-6);
    assert.equal(p.height,5.4,'PvP uses authoritative terrain elevation');
    assert.equal(events.some(e=>e.name==='floorState'||e.name==='floorStarting'),false);
  } finally {game.close();}
});

test('ramps are climbable, join their decks, and do not permit climbing steep sides', () => {
  const {map}=terrainFixture(), solids=map.terrain;
  for (const ramp of solids.filter(s=>s.kind==='ramp')) {
    const vertical=ramp.axis==='y', length=vertical?ramp.height:ramp.width;
    const point=t=>({x:ramp.x+(vertical?ramp.width/2:t*length),y:ramp.y+(vertical?t*length:ramp.height/2)});
    const start=point(ramp.reverse?1.04:-0.04);
    const player={...start,height:0,alive:true};
    for(let i=0;i<=110;i++) {
      const t=(ramp.reverse?1.04:-0.04)+(ramp.reverse?-1:1)*i/100;
      const next=point(t);
      assert.equal(moveOnTerrain(player,next.x,next.y,map,solids,1000+i),true,`ramp at ${ramp.x},${ramp.y}, step ${i}`);
    }
    assert.ok(Math.abs(player.height-ramp.top)<1e-8);
  }
  const player={x:720,y:240,height:0,alive:true};
  moveOnTerrain(player,800,240,map,solids,1000);
  assert.ok(player.x<760,'cannot walk into tower side');
  assert.ok(player.height<0.3);
});

test('jumping from towers keeps elevation; stepping off falls and lands', () => {
  const {map}=terrainFixture(), solids=map.terrain;
  const p={x:850,y:330,height:5.4,groundHeight:5.4,alive:true};
  assert.equal(startJump(p,1000),true); advanceJump(p,1300); assert.ok(p.height>6.6);
  advanceJump(p,2000); assert.equal(p.height,5.4); assert.equal(p.jumpStartedAt,null);
  moveOnTerrain(p,850,450,map,solids,2100);
  assert.equal(p.jumpVelocity,0); assert.ok(p.height>5);
  advanceJump(p,3100); assert.equal(p.height,0); assert.equal(p.jumpStartedAt,null);
  assert.equal(groundHeight(850,330,solids),5.4);
});

test('hitscan uses expanded boundaries and actual ramp slopes, tower roofs and elevation', () => {
  const {map}=terrainFixture();
  const shooter={id:'a',x:100,y:100,alive:true};
  assert.equal(traceShot(shooter,0,[],[],()=>true,0,map).endX,1800);
  const rampMap={...map,terrain:[{kind:'ramp',x:200,y:100,width:200,height:100,top:4,axis:'x'}]};
  const shot=traceShot({...shooter,y:150},0,[],[],()=>true,0,rampMap);
  assert.ok(Math.abs(shot.endX-292)<1e-8,'shot enters wedge at roof intersection, not bounding box');
  const above=traceShot({...shooter,y:150,height:4},0,[],[],()=>true,0,rampMap);
  assert.equal(above.hit,'boundary');
  const towerShot=traceShot({id:'a',x:850,y:330,height:5.4,alive:true},0,[],[],()=>true,-Math.PI/4,map);
  assert.equal(towerShot.hit,'wall'); assert.ok(Math.abs(towerShot.endHeight-5.4)<1e-8);
});

test('PvE regenerates exactly 5 HP/second, caps humans at 101, and does not heal bots or revive players', () => {
  const players=[{alive:true,health:40},{alive:true,health:99},{alive:true,isBot:true,health:40},{alive:false,health:0}];
  regeneratePlayers(players,2);
  assert.deepEqual(players.map(p=>p.health),[50,101,40,0]);
});

test('PvE teams, grouped safe spawns, idle awareness, and timed server regeneration', async () => {
  const {game,events}=fixture(4);
  try {
    assert.equal(game.gameMap.mode,'pve');
    const humans=game.activePlayers.filter(p=>!p.isBot), bots=game.activePlayers.filter(p=>p.isBot);
    assert.equal(bots.length,8,'bots still spawn with four human players');
    assert.ok(humans.every(p=>p.health===101&&p.maxHealth===101));
    assert.ok(humans.every(p=>p.team==='players')); assert.ok(bots.every(p=>p.team==='bots'));
    const solids=[...game.gameWalls,...game.gameMap.terrain];
    for(const p of game.activePlayers) assert.ok(canOccupy(p.x,p.y,p.height||0,solids));
    for(const b of bots) {
      const leader=bots.find(p=>p.squad===b.squad);
      if(game.gameMap.landmark.size==='upper-district'&&b.height>0)continue;
      assert.ok(Math.hypot(b.x-leader.x,b.y-leader.y)<200);
    }
    assert.ok(Math.hypot(humans[0].x-bots[0].x,humans[0].y-bots[0].y)>100);
    humans[0].health=50;
    await new Promise(resolve=>setTimeout(resolve,160));
    assert.ok(humans[0].health>50 && humans[0].health<52);
    assert.ok(bots.every(b=>!b.botState.squadTargetId),'no knowledge of unseen humans');
    assert.ok(bots.every(b=>b.botState.mode==='idle'));
    assert.equal(events.find(e=>e.name==='gameStarting').data.map.width,game.gameMap.width);
  } finally {game.close();}
});

test('PvE arrival staging stays dormant until players leave it or attack',t=>{
  let now=100000;const ticks=[];
  t.mock.method(global,'setInterval',fn=>{ticks.push(fn);return ticks.length;});
  t.mock.method(Date,'now',()=>now);
  const start=()=>{
    let connect;const handlers={},events=[];
    const io={on(_,fn){connect=fn;},emit(name,data){events.push({name,data});},socketsLeave(){},to(){return this;}};
    const game=server.createGameServer(io);connect({id:'p0',on(name,fn){handlers[name]=fn;}});
    game.waitingPlayers.push({id:'p0',name:'Player',weapon:'pistol'});handlers.startGame({enableBots:true});
    return {game,handlers,events,tick:ticks.at(-1)};
  };
  const staged=start();
  try {
    const player=staged.game.activePlayers.find(p=>!p.isBot),bots=staged.game.activePlayers.filter(p=>p.isBot);
    assert.equal(staged.game.encounterActive,false);
    for(let i=0;i<8;i++){now+=50;staged.tick();}
    assert.ok(bots.every(bot=>bot.botState.mode==='idle'&&!bot.botState.lastSeen));
    assert.equal(staged.events.some(event=>event.name==='shotFired'),false);
    const arrival=staged.game.gameMap.zones.find(zone=>zone.id===staged.game.gameMap.encounter.arrivalZoneId);
    Object.assign(player,{x:arrival.x+arrival.width/2,y:arrival.y+arrival.height/2});now+=50;staged.tick();
    assert.equal(staged.game.encounterActive,false,'the entire arrival room is a staging area');
    Object.assign(player,{x:arrival.x+arrival.width+20,y:arrival.y+arrival.height/2});now+=50;staged.tick();
    assert.equal(staged.game.encounterActive,true,'crossing the room boundary begins the encounter');
  } finally {staged.game.close();}
  const attacking=start();
  try {
    assert.equal(attacking.game.encounterActive,false);
    attacking.handlers.shoot({angle:0});
    assert.equal(attacking.game.encounterActive,true,'firing from staging wakes the floor immediately');
  } finally {attacking.game.close();}
});

test('server owns PvE elevation and rejects forged heights while accepting ramp travel', () => {
  const {game,handlers}=fixture(1);
  try {
    game.gameWalls.length=0;
    game.gameMap.terrain=terrainFixture().map.terrain;
    game.gameMap.ceiling=10;
    const p=game.activePlayers.find(p=>p.id==='p0');
    Object.assign(p,{x:390,y:330,height:0});
    handlers.playerUpdate({x:850,y:330,angle:0,height:999});
    assert.equal(p.x,850); assert.equal(p.height,5.4);
    handlers.jump(); advanceJump(p,p.jumpStartedAt+300); assert.ok(p.height>6.6 && p.height<7);
    Object.assign(p,{x:720,y:240,height:0,groundHeight:0,jumpStartedAt:null});
    handlers.playerUpdate({x:850,y:240,angle:0,height:999});
    assert.ok(p.x<760); assert.equal(p.height,0);
  } finally {game.close();}
});

test('unaware squads mill near spawn instead of chasing unseen humans across the map', t => {
  let tick, now=100000, seed=731;
  t.mock.method(global,'setInterval',fn=>{tick=fn;return 0;});
  t.mock.method(Date,'now',()=>now);
  t.mock.method(Math,'random',()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;});
  const {game,events}=fixture(1);
  try {
    const human=game.activePlayers.find(p=>!p.isBot);
    const e=game.gameMap.arrivalElevator;
    Object.assign(human,{x:e.x+80,y:e.y+110,height:0});
    game.gameWalls.push({x:204,y:0,width:20,height:game.gameMap.height,top:game.gameMap.ceiling});
    for(let i=0;i<600;i++) {human.health=100;now+=50;tick();}
    assert.equal(events.some(e=>e.name==='shotFired'),false);
    assert.ok(game.activePlayers.filter(p=>p.isBot).every(b=>Math.hypot(b.x-b.botState.home.x,b.y-b.botState.home.y)<220),'unaware bots stay near their own patrol area, including elevated spawns');
    assert.ok(game.activePlayers.filter(p=>p.isBot).some(b=>Math.hypot(b.x-b.botState.home.x,b.y-b.botState.home.y)>20),'bots actually wander');
  } finally {game.close();}
});

test('perception requires FOV and sight; hidden positions never overwrite remembered sightings',()=>{
  const bot={x:300,y:300,angle:0,botState:{}},p={id:'p',x:500,y:300,alive:true};
  assert.equal(awareness.perceive(bot,[p],1000,()=>false),null,'wall blocks detection');
  p.x=100;assert.equal(awareness.perceive(bot,[p],1000,()=>true),null,'cannot see behind');
  p.x=1100;assert.equal(awareness.perceive(bot,[p],1000,()=>true),null,'limited vision distance');
  p.x=500;assert.equal(awareness.perceive(bot,[p],1100,()=>true),p);
  awareness.chooseIntent(bot,p,null,1100);
  p.x=750;p.y=600;
  assert.equal(awareness.perceive(bot,[p],1200,()=>false),null);
  assert.deepEqual(awareness.chooseIntent(bot,null,null,1200),{x:500,y:300});
  assert.equal(bot.botState.mode,'investigate');
  const ally={x:200,y:300,angle:Math.PI,botState:{}};
  assert.deepEqual(awareness.chooseIntent(ally,null,bot.botState.lastSeen,1200),{x:500,y:300},'squad reports are snapshots');
  assert.equal(ally.botState.mode,'investigate','a report is not visual contact');
  Object.assign(bot,{x:500,y:300});awareness.chooseIntent(bot,null,null,2000);
  assert.equal(bot.botState.mode,'search');
  awareness.chooseIntent(bot,null,null,4300,()=>0.5);assert.equal(bot.botState.mode,'idle');
  awareness.chooseIntent(ally,null,null,12000,()=>0.5);assert.equal(ally.botState.mode,'idle','old reports expire');
});

test('server bots attack visible players, then investigate cover without tracking or shooting through it',async t=>{
  let tick,now=100000;
  t.mock.method(global,'setInterval',fn=>{tick=fn;return 0;});t.mock.method(Date,'now',()=>now);
  const {game,handlers,events}=fixture(1);
  try {
    handlers.shoot({angle:Math.PI}); // Explicitly begin this focused combat scenario.
    events.length=0;
    game.gameWalls.length=0;game.gameMap.terrain.length=0;
    game.gameWalls.push({x:450,y:0,width:24,height:440,top:7.5});
    game.rebuildNavigation();
    const p=game.activePlayers.find(p=>!p.isBot),bots=game.activePlayers.filter(p=>p.isBot),b=bots[0];
    for(const other of bots.slice(1))other.alive=false;
    Object.assign(b,{x:300,y:450,angle:0,height:0,groundHeight:0});Object.assign(p,{x:600,y:450});
    let largestStep=0;
    for(let i=0;i<35;i++){const x=b.x,y=b.y;p.health=100;now+=50;tick();largestStep=Math.max(largestStep,Math.hypot(b.x-x,b.y-y));}
    assert.ok(events.some(e=>e.name==='shotFired'),'visible target attacked after reaction time');
    assert.ok(largestStep<=6.66,'movement respects combat speed below player speed');
    const memory={...b.botState.lastSeen},shots=events.filter(e=>e.name==='shotFired').length;
    Object.assign(p,{x:800,y:100});
    for(let i=0;i<15;i++){now+=50;tick();}
    assert.deepEqual(b.botState.lastSeen,memory,'memory stays at the last visible edge, not hidden coordinates');
    assert.equal(b.botState.mode,'investigate');
    assert.equal(events.filter(e=>e.name==='shotFired').length,shots,'no firing at occluded target');
    p.x=1700;
    let furthestX=b.x;
    for(let i=0;i<140;i++){now+=50;tick();await new Promise(resolve=>setTimeout(resolve,5));furthestX=Math.max(furthestX,b.x);}
    assert.ok(furthestX>490,'investigates around the wall corner without getting stuck');
    assert.equal(events.filter(e=>e.name==='shotFired').length,shots,'does not acquire unseen distant player');
  } finally {game.close();}
});

test('walking animation stays continuous between snapshots and eases to a stop',()=>{
  const c={x:0,y:0,phase:0},p={x:0,y:0,angle:0};
  let active=0;
  for(let frame=0;frame<120;frame++) {
    if(frame%3===0)p.x+=5;
    const previous=c.x,motion=updateCharacterMotion(c,p,1/60);
    assert.ok(c.x>=previous&&c.x<=p.x);
    if(frame>15&&Math.abs(motion.stride)>0.1)active++;
  }
  assert.ok(active>60,'legs keep swinging between packets');
  for(let i=0;i<180;i++)updateCharacterMotion(c,p,1/60);
  assert.ok(c.speed<0.01,'no skating gait after stopping');
  c.angle=Math.PI-0.01;p.angle=-Math.PI+0.01;
  const before=c.angle;updateCharacterMotion(c,p,1/60);
  assert.ok(Math.abs(c.angle-before)<0.02,'heading takes shortest turn across angle wrap');
});

test('friendly fire is off and eliminating the last bot unlocks the elevator without ending the run', () => {
  const {game,handlers,events}=fixture();
  try {
    game.gameWalls.length=0;
    game.gameMap.terrain.length=0; // Random scenery must not block this combat-only fixture.
    const a=game.activePlayers.find(p=>p.id==='p0'), ally=game.activePlayers.find(p=>p.id==='p1');
    Object.assign(a,{x:100,y:100}); Object.assign(ally,{x:150,y:100});
    const bots=game.activePlayers.filter(p=>p.isBot);
    for(const b of bots) b.alive=false;
    Object.assign(bots[0],{x:250,y:100,height:0,groundHeight:0,alive:true,health:1});
    handlers.shoot({angle:0});
    assert.equal(ally.health,101);
    assert.equal(bots[0].alive,false);
    assert.equal(events.some(e=>e.name==='gameOver'),false);
    assert.equal(game.floorState.phase,'ready');
  } finally {game.close();}
});

test('an empty PvE fireteam resets immediately; ordinary PvP stays free-for-all', () => {
  const pve=fixture(1);
  try {
    pve.handlers.disconnect();
    assert.equal(pve.game.gameInProgress.status,false);
    assert.equal(pve.events.some(e=>e.name==='gameOver'),false);
    assert.ok(pve.events.some(e=>e.name==='resetGame'));
  }
  finally {pve.game.close();}
  const pvp=fixture(2,false);
  try {
    assert.ok(pvp.game.gameMap.width>=750); assert.ok(pvp.game.gameMap.terrain.length>0);
    assert.ok(pvp.game.gameMap.id&&pvp.game.gameMap.name);
    assert.equal(pvp.game.gameMap.elevator,undefined);
    pvp.game.gameWalls.length=0;
    pvp.game.gameMap.terrain.length=0;
    Object.assign(pvp.game.activePlayers.find(p=>p.id==='p0'),{x:100,y:100,height:0});
    const victim=pvp.game.activePlayers.find(p=>p.id==='p1');
    Object.assign(victim,{x:200,y:100,height:0,spawnShieldUntil:0});
    pvp.handlers.shoot({angle:0}); assert.equal(victim.health,90.5);
  } finally {pvp.game.close();}
});

test('every terrain model has finite geometry and ramp/deck bounds match physics', () => {
  const {map}=createPveMap(731);
  for(const s of map.terrain) {
    const model=createTerrainModel(s), bounds=new THREE.Box3().setFromObject(model);
    assert.ok([bounds.min.x,bounds.min.y,bounds.min.z,bounds.max.x,bounds.max.y,bounds.max.z].every(Number.isFinite));
    assert.ok(bounds.max.y+(s.kind==='rail'?0:s.bottom||0)>=s.top-0.001);
    if(s.kind==='ramp') {
      assert.ok(Math.abs(bounds.max.x-s.width*0.05)<0.02);
      assert.ok(Math.abs(bounds.max.z-s.height*0.05)<0.02);
    }
    model.traverse(m=>{m.geometry?.dispose();m.material?.dispose();});
  }
});

test('authored PvP machinery, catwalks, tunnels and lifts render finite geometry',()=>{
  for(const id of ['foundry','vaultAnnex','tower','orbital','airport'])for(const s of maps.createPvpMap(0,id).map.terrain) {
    const model=createTerrainModel(s);
    if(s.collisionOnly) {
      assert.equal(model.children.length,0,`${id} ${s.kind} stays an invisible geometry-matched collision primitive`);
      continue;
    }
    const bounds=new THREE.Box3().setFromObject(model);
    for(const value of [...bounds.min.toArray(),...bounds.max.toArray()])
      assert.ok(Number.isFinite(value),`${id} ${s.kind} has finite bounds`);
    assert.ok(model.children.length>0,`${id} ${s.kind} has visible geometry`);
  }
});

test('Overgrown Temple tower uses cohesive balustrades instead of loose crenellations',()=>{
  const {map}=maps.createPvpMap(0,'temple'),rails=map.terrain.filter(s=>s.kind==='rail'&&s.style==='temple');
  assert.equal(rails.length,7);
  for(const rail of rails) {
    const model=createTerrainModel(rail),bounds=new THREE.Box3().setFromObject(model);
    assert.equal(model.name,'temple-tower-balustrade');
    assert.ok([...bounds.min.toArray(),...bounds.max.toArray()].every(Number.isFinite));
    assert.ok(model.children.length>=7,'sill, twin rails and capped supports form one guard');
    model.traverse(object=>{object.geometry?.dispose();object.material?.dispose();});
  }
});

test('Vault Annex renders structural stairs, live conveyors, columns, guards, and galleries',()=>{
  const {map}=maps.createPvpMap(0,'vaultAnnex');
  const fixtures=[
    ...map.terrain.filter(s=>s.kind==='ramp'),
    ...map.terrain.filter(s=>s.kind==='rail').slice(0,2),
    ...map.terrain.filter(s=>s.kind==='catwalk').slice(0,2),
  ];
  assert.ok(fixtures.every(s=>s.style==='redVault'));
  const models=fixtures.map(createTerrainModel);
  assert.ok(models.some(model=>model.name==='red-vault-stair'));
  assert.ok(models.some(model=>model.name==='red-vault-guard'));
  assert.ok(models.some(model=>model.name==='red-vault-gallery'));
  const colors=new Set();
  for(const model of models)model.traverse(object=>{
    const materials=Array.isArray(object.material)?object.material:[object.material];
    for(const value of materials)if(value?.color)colors.add(`#${value.color.getHexString()}`);
  });
  assert.ok(colors.has('#a92739')||colors.has('#842030'),
    'the architecture itself contains structural red rather than relying on room tint');
  assert.ok((colors.has('#959c9e')||colors.has('#9da4a6'))&&colors.has('#292d30'),
    'silver edge channels and near-black shells match the Red Vault material language');
  const conveyors=map.terrain.filter(s=>s.kind==='vaultConveyor').map(createTerrainModel);
  assert.equal(conveyors.length,3);
  for(const conveyor of conveyors) {
    assert.equal(conveyor.name,'red-vault-moving-conveyor');
    assert.equal(typeof conveyor.userData.update,'function');
    const markers=conveyor.getObjectByName('red-vault-conveyor-markers');
    const rollers=conveyor.getObjectByName('red-vault-conveyor-rollers');
    assert.ok(markers?.isInstancedMesh&&markers.count===10);
    assert.ok(rollers?.isInstancedMesh&&rollers.count>=5);
    const before=Array.from(markers.instanceMatrix.array);
    conveyor.userData.update(1);
    assert.notDeepEqual(Array.from(markers.instanceMatrix.array),before,
      'instanced emissive belt markers visibly travel along the conveyor');
    assert.ok(conveyor.children.length<=6,'one belt stays within a small dynamic draw-call budget');
  }
  const columns=map.terrain.filter(s=>s.kind==='vaultColumn').map(createTerrainModel);
  assert.equal(columns.length,6);
  assert.ok(columns.every(column=>column.name==='red-vault-column'));
  const barriers=map.terrain.filter(s=>s.kind==='vaultBarrier').map(createTerrainModel);
  assert.equal(barriers.length,2);
  assert.ok(barriers.every(barrier=>barrier.name==='red-vault-barrier'));
  for(const model of models)model.traverse(object=>{object.geometry?.dispose();object.material?.dispose();});
  for(const model of [...conveyors,...columns,...barriers])model.traverse(object=>{object.geometry?.dispose();object.material?.dispose();});
});

test('Terminal 7 has a finite bespoke shell, runway, aircraft and jet bridge',()=>{
  const {map,walls}=maps.createPvpMap(0,'airport'),model=createAirportEnvironment(map,walls);
  assert.equal(model.name,'terminal-7-environment');
  let meshes=0,transparent=0,emissive=0;
  model.traverse(object=>{
    if(!object.isMesh)return;meshes++;
    const positions=object.geometry?.getAttribute?.('position');
    if(positions)assert.ok(Array.from(positions.array).every(Number.isFinite));
    const materials=Array.isArray(object.material)?object.material:[object.material];
    transparent+=materials.some(m=>m?.transparent)?1:0;
    emissive+=materials.some(m=>m?.emissiveIntensity>0)?1:0;
  });
  assert.ok(meshes>100,'terminal shell includes architectural and airside detail');
  assert.ok(transparent>4,'curtain walls use real transparent glazing');
  assert.ok(emissive>10,'signage, ceiling fixtures, and runway lights are luminous');
  assert.equal(model.getObjectByName('terminal-aircraft-fuselage')?.geometry?.type,'LatheGeometry',
    'aircraft uses one smooth tapered fuselage rather than joined primitive blocks');
  const named=name=>{const found=[];model.traverse(o=>{if(o.name===name)found.push(o);});return found;};
  assert.equal(named('terminal-aircraft-wing').length,2);
  assert.equal(named('terminal-aircraft-engine').length,2);
  assert.equal(named('terminal-aircraft-wheel').length,3);
  assert.ok(model.getObjectByName('terminal-jet-bridge'),'jet bridge meets the forward aircraft door');
  assert.ok(model.getObjectByName('terminal-aircraft-radome'),'the main aircraft has an identifiable forward radome');
  assert.equal(model.children.filter(o=>o.name==='terminal-roof-shell').length,5,
    'five curved canopy bays replace the former flat ceiling slab');
  assert.equal(model.children.filter(o=>o.name==='terminal-skylight').length,4,
    'curved skylight ribbons sit between canopy bays');
  assert.equal(named('terminal-entrance-vestibule').length,2,
    'two detailed passenger vestibules replace the old row of loading doors');
  assert.equal(named('terminal-service-door').length,1,'one restrained industrial door serves the western staff route');
  assert.equal(named('terminal-gate-portal').length,3,'each gate lounge terminates in a boarding portal');
  assert.equal(named('terminal-checkin-canopy').length,2,'each check-in island has a coherent overhead identity band');
  assert.equal(named('terminal-security-header').length,1,'screening lanes share one architectural threshold');
  assert.equal(named('terminal-market-art').length,3,'the marketplace has one coordinated suspended art installation');
  assert.equal(named('terminal-wayfinding').length,3,'wayfinding appears only at the three major processing thresholds');
  assert.equal(named('terminal-gallery-screen').length,4,
    'the four connected mezzanine returns use the same airport wall finish');
  model.traverse(object=>{object.geometry?.dispose();object.material?.dispose();});
});

test('Terminal 7 carpet renders above the terrazzo without adding a collision step',()=>{
  const carpet=maps.createPvpMap(0,'airport').map.terrain.find(s=>s.kind==='airportCarpet');
  const model=createTerrainModel(carpet),bounds=new THREE.Box3().setFromObject(model);
  assert.equal(carpet.top,0,'carpet does not alter the authoritative walking surface');
  assert.ok(bounds.max.y+(carpet.bottom||0)>=.018,
    'visible carpet pile is separated from the floor instead of being coplanar');
  assert.ok(bounds.min.y+(carpet.bottom||0)>=-1e-6,'carpet geometry does not sink through the floor');
  model.traverse(object=>{object.geometry?.dispose();object.material?.dispose();});
});

test('Terminal 7 market court and lively wall-integrated shops have detailed finite models',()=>{
  const {map}=maps.createPvpMap(0,'airport'),terrain=map.terrain;
  const market=createTerrainModel(terrain.find(s=>s.kind==='airportMarketIsland'));
  assert.equal(market.name,'terminal-market-island');
  const marketBounds=new THREE.Box3().setFromObject(market);
  assert.ok([marketBounds.min,marketBounds.max].flatMap(v=>v.toArray()).every(Number.isFinite));
  const screenSolid=terrain.find(s=>s.kind==='airportMarketScreen');
  const screen=createTerrainModel(screenSolid),screenBounds=new THREE.Box3().setFromObject(screen);
  assert.equal(screen.name,'terminal-market-screen');
  assert.ok(Math.abs(screenBounds.min.y+screenSolid.bottom)<.01,
    'the planted screen visibly meets the floor despite stacking on the market collider');
  assert.ok(screenBounds.max.y+screenSolid.bottom<=screenSolid.top+.05,
    'the screen model stays inside its authoritative collision height');
  for(const shop of terrain.filter(s=>s.kind==='airportShop')) {
    const model=createTerrainModel(shop),bounds=new THREE.Box3().setFromObject(model);
    assert.equal(model.name,`terminal-shop-${shop.shop}`);
    assert.equal(model.getObjectsByProperty('name','terminal-shop-pendant').length,3,
      `${shop.shop} has a complete pendant-lighting scheme`);
    assert.ok(model.getObjectByName(`terminal-shop-feature-${shop.shop}`),`${shop.shop} has a recessed art/menu wall`);
    assert.equal(model.getObjectByName('terminal-shop-floor'),undefined,
      `${shop.shop} uses the continuous terminal floor instead of drawing a seam across the old boundary`);
    assert.ok([bounds.min,bounds.max].flatMap(v=>v.toArray()).every(Number.isFinite));
    model.traverse(object=>{object.geometry?.dispose();object.material?.dispose();});
  }
  assert.equal(terrain.filter(s=>s.kind==='airportShopRoof').length,4,'each walk-in shop has a real low ceiling');
  const fixtures=terrain.filter(s=>s.kind==='airportShopFixture');
  assert.ok(fixtures.length>=12,'shop interiors contain counters, shelves, displays, tables and merchandise');
  for(const fixture of fixtures) {
    const model=createTerrainModel(fixture),bounds=new THREE.Box3().setFromObject(model);
    assert.ok([bounds.min,bounds.max].flatMap(v=>v.toArray()).every(Number.isFinite));
    if(fixture.shop==='coffee'&&fixture.fixture==='counter')
      assert.equal(model.getObjectsByProperty('name','terminal-coffee-cup').length,3);
    model.traverse(object=>{object.geometry?.dispose();object.material?.dispose();});
  }
  market.traverse(object=>{object.geometry?.dispose();object.material?.dispose();});
  screen.traverse(object=>{object.geometry?.dispose();object.material?.dispose();});
});

test('Terminal 7 puts departures boards on the landside wall and restores compact bag-drop belts',()=>{
  const {map}=maps.createPvpMap(0,'airport');
  const boards=map.terrain.filter(s=>s.kind==='airportFlightBoard');
  assert.equal(boards.length,2);
  for(const board of boards) {
    assert.equal(board.wallMounted,true);
    assert.ok(board.y+board.height>map.height-15,'departures board is mounted against the wall opposite the apron');
    assert.ok(board.top<=0,'wall display has no floor-standing collision volume');
    const model=createTerrainModel(board);
    assert.equal(model.name,'terminal-wall-flight-board');
    const bounds=new THREE.Box3().setFromObject(model);
    assert.ok(bounds.min.y>2.5&&bounds.max.y<4.75,'board reads as a wall display rather than a black floor box');
    model.traverse(object=>{object.geometry?.dispose();object.material?.dispose();});
  }
  const belts=map.terrain.filter(s=>s.kind==='airportBaggage');
  assert.equal(belts.length,2,'both check-in islands have a small baggage roller area');
  for(const belt of belts) {
    const model=createTerrainModel(belt);
    assert.equal(model.name,'terminal-baggage-belt');
    assert.ok(model.getObjectsByProperty('name','terminal-baggage-roller').length>=5);
    assert.equal(model.getObjectsByProperty('name','terminal-baggage-case').length,3);
    model.traverse(object=>{object.geometry?.dispose();object.material?.dispose();});
  }
});

test('Terminal 7 keeps stair flights open and landing balustrades clear of both openings',()=>{
  const {map}=maps.createPvpMap(0,'airport');
  const stairs=map.terrain.filter(s=>s.kind==='ramp'&&s.stairs);
  const rails=map.terrain.filter(s=>s.kind==='rail'&&s.style==='airport');
  assert.equal(stairs.length,2);
  assert.equal(rails.filter(item=>item.axis).length,0,'glass walls no longer run along either side of the stair flights');
  for(const stair of stairs) {
    const landingY=stair.reverse?stair.y:stair.y+stair.height;
    const landingRails=rails.filter(rail=>
      rail.width>rail.height&&landingY>=rail.y-0.001&&landingY<=rail.y+rail.height+0.001);
    assert.ok(landingRails.length>=2,'each stair landing is guarded on both sides');
    const clearance=15;
    for(const rail of landingRails) {
      const overlapsOpening=rail.x+rail.width>stair.x-clearance&&
        rail.x<stair.x+stair.width+clearance;
      assert.equal(overlapsOpening,false,'rail end posts and collision padding stay outside the stair path');
    }
  }
});

test('Orbital Station has a finite single-draw starfield and distant planetary backdrop',()=>{
  const model=createSpaceEnvironment();
  assert.equal(model.name,'orbital-space-environment');
  const stars=model.getObjectByName('orbital-starfield');
  const planet=model.getObjectByName('orbital-planet');
  const atmosphere=model.getObjectByName('orbital-atmosphere');
  assert.ok(stars?.isPoints&&planet?.isMesh&&atmosphere?.isMesh);
  assert.equal(stars.geometry.getAttribute('position').count,900);
  model.traverse(object=>{
    const positions=object.geometry?.getAttribute?.('position');
    if(positions)assert.ok(Array.from(positions.array).every(Number.isFinite));
    object.geometry?.dispose();object.material?.dispose();
  });
});

test('Temple pools keep bed, water, and rim on separate depth layers',()=>{
  const pool=maps.createPvpMap(0,'temple').map.terrain.find(s=>s.kind==='templePool');
  const model=createTerrainModel(pool),bed=model.getObjectByName('temple-pool-bed');
  const water=model.getObjectByName('temple-pool-water');
  const rims=model.children.filter(child=>child.name==='temple-pool-rim');
  assert.ok(bed&&water);assert.equal(rims.length,4);
  model.updateMatrixWorld(true);
  const bedBounds=new THREE.Box3().setFromObject(bed),waterBounds=new THREE.Box3().setFromObject(water);
  const floorInModel=-(pool.bottom||0);
  assert.ok(bedBounds.min.y>floorInModel+.01,'pool bed is visibly clear of the grass plane');
  assert.ok(waterBounds.min.y>bedBounds.max.y+.01,'water cannot fight with the pool bed');
  assert.equal(water.material.depthWrite,false,'transparent water does not corrupt later depth sorting');
  model.traverse(m=>{m.geometry?.dispose();m.material?.dispose();});
});

test('Overgrown Temple replaces generic wall boxes with one finite bespoke environment',()=>{
  const {map,walls}=maps.createPvpMap(0,'temple'),model=createTempleEnvironment(map,walls);
  assert.equal(model.name,'overgrown-temple-environment');
  let meshes=0,foliage=0,arches=0,cliffs=0;
  model.traverse(object=>{
    if(!object.isMesh)return;meshes++;
    const position=object.geometry.attributes.position;
    assert.ok(position&&Array.from(position.array).every(Number.isFinite));
    if(object.geometry.type==='IcosahedronGeometry')foliage++;
    if(object.geometry.type==='TorusGeometry')arches++;
    if(object.geometry.type==='BufferGeometry')cliffs++;
  });
  assert.ok(meshes>70,'custom masonry, arches, cliffs and forest are present');
  assert.equal(arches,4,'each undercroft entrance has a true curved arch');
  assert.ok(cliffs>=4,'the jungle perimeter uses continuous custom cliff faces');
  assert.ok(foliage>=12,'the perimeter remains visibly overgrown without noisy prop spam');
  model.traverse(object=>{object.geometry?.dispose();object.material?.dispose();});
});

test('all PvE themes render finite terrain',()=>{
  const themes=new Set();
  for(let seed=0;seed<40&&themes.size<4;seed++) {
    const {map}=createPveMap(seed*7919);
    if(themes.has(map.landmark.theme))continue;
    themes.add(map.landmark.theme);
    for(const s of map.terrain) {
      const model=createTerrainModel(s),bounds=new THREE.Box3().setFromObject(model);
      assert.ok([bounds.min.x,bounds.min.y,bounds.min.z,bounds.max.x,bounds.max.y,bounds.max.z].every(Number.isFinite));
      assert.ok(bounds.max.y<map.ceiling);
      model.traverse(m=>{m.geometry?.dispose();m.material?.dispose();});
    }
  }
  assert.deepEqual([...themes].sort(),['freight','processing','reactor','turbine']);
});
