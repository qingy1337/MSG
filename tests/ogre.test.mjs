import {test} from 'node:test';
import assert from 'node:assert/strict';
import difficulty from '../game/pveDifficulty.js';
import dreadCombat from '../game/dreadCombat.js';
import combat from '../game/hitscan.js';
import {createOgreModel,poseOgre} from '../public/ogre.mjs';
import * as THREE from 'three';
import maps from '../public/arenaMap.js';
import server from '../game/gameServer.js';
const {floorDifficulty,tickOgre}=difficulty;
const {DREAD_COMBAT,tickDreadCarbine,recordDreadShot}=dreadCombat;
const map={width:1800,height:1200,terrain:[],ceiling:7.5};
const setup=(x=400)=>({bot:{id:'ogre',botType:'ogre',x:100,y:100,height:0,alive:true,isBot:true,botState:{}},
  target:{id:'human',x,y:100,height:0,alive:true}});
test('difficulty rises gently, then floor 21 starts a bounded ten-enemy elite phase',()=>{
  assert.deepEqual(floorDifficulty(1),{count:4,health:80,speed:1,ogres:0});
  assert.equal(floorDifficulty(4).ogres,0);assert.equal(floorDifficulty(5).ogres,1);
  assert.equal(floorDifficulty(8).ogres,2);
  assert.deepEqual(floorDifficulty(20),{count:23,health:156,speed:1.3,ogres:4});
  assert.deepEqual(floorDifficulty(21),{count:10,health:220,speed:1.3,ogres:4});
  assert.deepEqual(floorDifficulty(37),{count:10,health:300,speed:1.3,ogres:4});
  assert.deepEqual(floorDifficulty(1000),{count:13,health:300,speed:1.3,ogres:4,guardians:3});
});
test('Dread carbine telegraphs, fires three spaced shots, recovers and cancels behind cover',()=>{
  const bot={id:'dread',botType:'dread',botState:{}},target={id:'human'};
  assert.equal(tickDreadCarbine(bot,target,true,true,1000),false);
  assert.deepEqual({phase:bot.dreadAttack.phase,targetId:bot.dreadAttack.targetId,fireAt:bot.dreadAttack.fireAt},
    {phase:'charge',targetId:'human',fireAt:1000+DREAD_COMBAT.chargeMs});
  assert.equal(tickDreadCarbine(bot,target,true,true,1549),false);
  assert.ok(bot.dreadAttack.progress>.99);
  let now=1550;
  for(let shot=1;shot<=3;shot++) {
    assert.equal(tickDreadCarbine(bot,target,true,true,now),true);
    recordDreadShot(bot,now);
    if(shot<3){assert.equal(bot.dreadAttack.shots,shot);now+=DREAD_COMBAT.shotIntervalMs;}
  }
  assert.equal(bot.dreadAttack,null);assert.equal(bot.botState.dreadReadyAt,now+DREAD_COMBAT.recoveryMs);
  assert.equal(tickDreadCarbine(bot,target,true,true,now+500),false,'recovery prevents an immediate charge');
  assert.equal(tickDreadCarbine(bot,target,true,true,now+DREAD_COMBAT.recoveryMs),false);
  assert.ok(bot.dreadAttack);assert.equal(tickDreadCarbine(bot,target,false,true,now+DREAD_COMBAT.recoveryMs+10),false);
  assert.equal(bot.dreadAttack,null,'cover cancels the warning and pending burst');
});
test('floor 21 server fields ten enemies and applies the Dread carbine as a 27-damage burst',t=>{
  let tick,connect,now=100000;
  t.mock.method(global,'setInterval',fn=>{tick=fn;return 0;});t.mock.method(Date,'now',()=>now);
  const handlers={},events=[],io={on(_,fn){connect=fn;},emit(name,data){events.push({name,data});},socketsLeave(){},to(){return this;}};
  const game=server.createGameServer(io);
  connect({id:'human',user:{username:'qing'},on(name,fn){handlers[name]=fn;}});
  game.waitingPlayers.push({id:'human',name:'Human',accountUsername:'qing',weapon:'autoRifle'});
  handlers.startGame({enableBots:true,startFloor:21});
  try {
    const human=game.activePlayers.find(p=>!p.isBot),bots=game.activePlayers.filter(p=>p.isBot);
    const dread=bots.find(p=>p.botType==='dread');
    assert.equal(bots.length,10);assert.equal(bots.filter(p=>p.botType==='ogre').length,4);
    assert.equal(bots.filter(p=>p.botType==='dread').length,6);
    handlers.shoot({angle:Math.PI}); // Explicitly begin this focused combat scenario.
    bots.filter(p=>p!==dread).forEach(p=>p.alive=false);
    game.gameWalls.length=0;game.gameMap.terrain.length=0;
    Object.assign(human,{x:350,y:300,height:0,health:101,maxHealth:101});
    Object.assign(dread,{x:150,y:300,height:0,groundHeight:0,angle:0,health:10000,
      botState:{lastShotAt:0,nextAimAt:Infinity,aimOffset:0}});
    tick();assert.equal(dread.dreadAttack.phase,'charge');assert.equal(human.health,101);
    for(const elapsed of [550,750,950]){now=100000+elapsed;tick();}
    assert.equal(events.filter(e=>e.name==='shotFired'&&e.data.playerId===dread.id).length,3);
    assert.equal(human.health,76,'three 9-damage hits, with one HP regenerated between later hits');
    assert.equal(dread.dreadAttack,null);
  } finally {game.close();}
});
test('laser winds up, deals 60 over four seconds, then cools down',()=>{
  for(const step of [50,100,200]) {
    const {bot,target}=setup();let total=0;
    const tick=now=>tickOgre(bot,target,[target],[],map,now,(_,n)=>total+=n);
    tick(0);tick(1499);assert.equal(total,0);
    for(let now=1500;now<=5500;now+=step)tick(now);
    assert.ok(Math.abs(total-60)<1e-8);assert.equal(bot.ogreAttack,null);
    tick(6000);assert.equal(bot.ogreAttack,null);
  }
  const {bot,target}=setup();let total=0;
  tickOgre(bot,target,[target],[],map,0,()=>{});
  target.y=300;
  tickOgre(bot,target,[target],[],map,2000,(_,n)=>total+=n);
  assert.equal(total,0,'a sudden sidestep outpaces the limited tracking speed');
});
test('laser tracks its original visible target horizontally and vertically during charge and fire',()=>{
  const {bot,target}=setup();
  const tick=now=>tickOgre(bot,target,[target],[],map,now,()=>{});
  tick(0);target.y=200;target.height=1;
  tick(50);
  assert.ok(bot.ogreAttack.angle>0&&bot.ogreAttack.angle<=0.045+1e-9);
  for(let now=100;now<=1500;now+=50)tick(now);
  assert.ok(Math.abs(bot.ogreAttack.angle-Math.atan2(100,300))<1e-9);
  assert.ok(Math.abs(bot.ogreAttack.pitch-Math.atan2(-0.7,Math.hypot(300,100)*0.05))<1e-9);
  target.y=250;
  for(let now=1550;now<=2000;now+=50)tick(now);
  assert.equal(bot.ogreAttack.phase,'fire');
  assert.equal(bot.ogreAttack.beam.targetId,target.id);
  assert.ok(Math.abs(bot.ogreAttack.angle-Math.atan2(150,300))<1e-9);
});
test('nearby humans interrupt laser charge or fire with a fully telegraphed slam',()=>{
  for(const interruptAt of [500,2000]) {
    const {bot,target}=setup();const close={...target,id:'close',x:205};let total=0;
    tickOgre(bot,target,[target],[],map,0,()=>{});
    tickOgre(bot,target,[target,close],[],map,interruptAt,(_,n)=>total+=n);
    assert.equal(bot.ogreAttack.kind,'slam');assert.equal(bot.ogreAttack.targetId,close.id);
    assert.equal(bot.ogreAttack.start,interruptAt);assert.equal(bot.ogreAttack.progress,0);
    assert.equal(bot.ogreAttack.beam,undefined);assert.equal(total,0,'interrupt does not deal instant damage');
    tickOgre(bot,target,[target,close],[],map,interruptAt+999,(_,n)=>total+=n);
    assert.equal(total,0);
    tickOgre(bot,target,[target,close],[],map,interruptAt+1000,(_,n)=>total+=n);
    assert.equal(total,50);
  }
});
test('slam bypasses laser recovery, repeats after one-second recovery, and cannot restart mid-animation',()=>{
  const {bot,target}=setup(200);let hits=0;
  bot.botState.ogreReadyAt=8000;
  const tick=now=>tickOgre(bot,target,[target],[],map,now,()=>hits++);
  tick(0);assert.equal(bot.ogreAttack.kind,'slam');
  tick(500);assert.equal(bot.ogreAttack.start,0);
  tick(1000);tick(1900);assert.equal(hits,1);assert.equal(bot.ogreAttack,null);
  tick(2899);assert.equal(bot.ogreAttack,null);
  tick(2900);assert.equal(bot.ogreAttack.kind,'slam');assert.equal(bot.ogreAttack.start,2900);
  tick(3900);assert.equal(hits,2);
});
test('melee interrupts respect cover, floors and engagement, while jumping still avoids damage',()=>{
  for(const blocked of ['wall','floor','dead','bot']) {
    const {bot,target}=setup(),close={...target,id:'close',x:175};
    tickOgre(bot,target,[target],[],map,0,()=>{});
    const walls=blocked==='wall'?[{x:135,y:50,width:10,height:100,top:5}]:[];
    if(blocked==='floor')close.height=3;
    if(blocked==='dead')close.alive=false;
    if(blocked==='bot')close.isBot=true;
    tickOgre(bot,target,[target,close],walls,map,500,()=>{});
    assert.equal(bot.ogreAttack.kind,'laser',blocked);
  }
  const {bot,target}=setup(175);
  assert.equal(tickOgre(bot,null,[target],[],map,0,()=>{}),false,'unaware Ogres do not magically detect humans');
  Object.assign(target,{height:1.2,groundHeight:0,jumpStartedAt:0});
  tickOgre(bot,target,[target],[],map,0,()=>{});assert.equal(bot.ogreAttack.kind,'slam');
  tickOgre(bot,target,[target],[],map,1000,()=>assert.fail('jump must still dodge the slam'));
});
test('tracking freezes behind cover or on death and never switches to another player mid-beam',()=>{
  const {bot,target}=setup();
  tickOgre(bot,target,[target],[],map,0,()=>{});
  const initial=bot.ogreAttack.angle,initialPitch=bot.ogreAttack.pitch;
  target.y=200;target.height=1;
  const wall={x:200,y:0,width:20,height:400,top:7};
  for(let now=50;now<=1600;now+=50)tickOgre(bot,null,[target],[wall],map,now,()=>assert.fail('cover must block damage'));
  assert.equal(bot.ogreAttack.angle,initial);assert.equal(bot.ogreAttack.pitch,initialPitch);
  assert.equal(bot.ogreAttack.beam.hit,'wall');
  target.alive=false;
  const other={...target,id:'other',alive:true,y:300};
  tickOgre(bot,other,[target,other],[],map,1650,()=>{});
  assert.equal(bot.ogreAttack.angle,initial);
  target.alive=true;
  tickOgre(bot,target,[target],[],map,1700,()=>{});
  assert.ok(bot.ogreAttack.angle>initial,'tracking resumes when the original target is visible again');
});
test('cover blocks laser and slam; slam is one 50-damage hit and jumping avoids it',()=>{
  for(const kind of ['laser','slam']) {
    const {bot,target}=setup(kind==='laser'?400:175);let total=0;
    const walls=[{x:135,y:50,width:10,height:100,top:5}];
    tickOgre(bot,target,[target],walls,map,0,()=>{});
    tickOgre(bot,target,[target],walls,map,2000,(_,n)=>total+=n);
    assert.equal(total,0);
  }
  for(const height of [0,1]) {
    const {bot,target}=setup(175);let total=0;
    const tick=now=>tickOgre(bot,target,[target],[],map,now,(_,n)=>total+=n);
    tick(0);tick(999);assert.equal(total,0);target.height=height;
    tick(1000);tick(1200);tick(1550);assert.equal(total,height?0:50);
  }
});
test('no target means no attack; big bodies are hittable above normal player height',()=>{
  const {bot,target}=setup();assert.equal(tickOgre(bot,null,[target],[],map,0,()=>{}),false);
  const ogre={...target,bodyHeight:3.8,bodyRadius:30};
  assert.equal(combat.traceShot({...bot,eyeHeight:3.3},0,[],[ogre],()=>true,0,map).targetId,ogre.id);
  assert.equal(combat.traceShot({...bot,eyeHeight:3.3},0,[],[target],()=>true,0,map).targetId,null);
});
test('slam knockback decays consistently, stops at walls, and spares jumping targets',()=>{
  for(const step of [10,50,90]) {
    const {bot,target}=setup(175);
    tickOgre(bot,target,[target],[],map,0,()=>{});
    tickOgre(bot,target,[target],[],map,1000,()=>{});
    assert.ok(target.knockback.vx>0);
    for(let now=1000+step;now<1450;now+=step)maps.advanceKnockback(target,now,map,[]);
    maps.advanceKnockback(target,1450,map,[]);
    assert.ok(Math.abs(target.x-247)<1e-8);assert.equal(target.knockback,null);
  }
  const {bot,target}=setup(175);
  tickOgre(bot,target,[target],[],map,0,()=>{});
  tickOgre(bot,target,[target],[],map,1000,()=>{});
  const wall={x:220,y:0,width:20,height:400,top:5};
  maps.advanceKnockback(target,1450,map,[wall]);
  assert.ok(target.x>175&&target.x<=204.1,'push cannot tunnel through a wall');
  const jumping=setup(175);
  tickOgre(jumping.bot,jumping.target,[jumping.target],[],map,0,()=>{});
  jumping.target.height=1;
  tickOgre(jumping.bot,jumping.target,[jumping.target],[],map,1000,()=>{});
  assert.equal(jumping.target.knockback,undefined);
});
test('server applies slam knockback and rejects stale client positions during the push',t=>{
  let now=100000,tick,connect;
  t.mock.method(global,'setInterval',fn=>{tick=fn;return 0;});t.mock.method(Date,'now',()=>now);
  const handlers={},io={on(_,fn){connect=fn;},emit(){},socketsLeave(){},to(){return this;}};
  const game=server.createGameServer(io);connect({id:'p0',on(name,fn){handlers[name]=fn;}});
  game.waitingPlayers.push({id:'p0',name:'Player',weapon:'pistol'});handlers.startGame({enableBots:true});
  try {
    handlers.shoot({angle:Math.PI}); // Explicitly begin this focused combat scenario.
    game.gameWalls.length=0;game.gameMap.terrain.length=0;
    const player=game.activePlayers.find(p=>!p.isBot),bots=game.activePlayers.filter(p=>p.isBot);
    bots.slice(1).forEach(p=>p.alive=false);
    Object.assign(player,{x:400,y:300,height:0,groundHeight:0});
    Object.assign(bots[0],{botType:'ogre',x:325,y:300,height:0,groundHeight:0,angle:0,botState:{}});
    tick();now+=1000;tick();assert.ok(player.knockback);
    now+=50;tick();const pushedX=player.x;assert.ok(pushedX>400);
    handlers.playerUpdate({x:400,y:300,angle:0.2});assert.equal(player.x,pushedX);
  } finally {game.close();}
});
test('slam drives fists to ground, emits expanding waves, then resets effects',()=>{
  const m=createOgreModel();
  poseOgre(m,{kind:'slam',phase:'charge',progress:0.75},()=>{});
  assert.ok(m.arms.every(a=>a.rotation.x<-2.5));
  poseOgre(m,{kind:'slam',phase:'fire',progress:0},()=>{});
  m.group.updateMatrixWorld(true);
  // Fist mesh is the rounded skin block centred 1.4 metres below the shoulder.
  const fist=m.arms[0].children.find(c=>c.position.y===-1.4&&c.geometry?.type==='RoundedBoxGeometry');
  const bounds=new THREE.Box3().setFromObject(fist);
  assert.ok(bounds.min.y>-0.2&&bounds.min.y<0.15,'fist makes ground contact');
  const early=m.waves[0].scale.x;
  poseOgre(m,{kind:'slam',phase:'fire',progress:0.4},()=>{});
  assert.ok(m.waves.every(w=>w.visible));assert.ok(m.waves[0].scale.x>early);
  assert.ok(m.debris.some(d=>d.visible&&d.position.y>0.2));
  poseOgre(m,null,()=>{});assert.equal(m.effects.visible,false);
  m.group.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
});
test('Ogre geometry and both telegraphs pose without browser rendering',()=>{
  const model=createOgreModel();const bounds=new THREE.Box3().setFromObject(model.group);
  assert.ok(bounds.max.y>=3.7);assert.equal(model.arms.length,2);
  assert.ok(bounds.max.y<=3.85,'standing silhouette fits its gameplay height');
  assert.equal(model.crystal.name,'chest-crystal');
  assert.equal(model.crystal.geometry.type,'OctahedronGeometry');
  assert.notEqual(model.arms[0].children.length,model.arms[1].children.length,'asymmetric armor');
  let triangles=0;
  model.group.traverse(m=>{
    if(!m.geometry)return;
    const positions=m.geometry.attributes.position.array;
    assert.ok(positions.every(Number.isFinite),'finite mesh positions');
    triangles+=(m.geometry.index?.count||m.geometry.attributes.position.count)/3;
  });
  assert.ok(triangles<20000,'bounded geometry budget for multi-Ogre waves');
  poseOgre(model,{kind:'slam',phase:'charge',progress:0.9},()=>{});
  assert.equal(model.ring.visible,true);assert.ok(model.arms[0].rotation.x<-2);
  poseOgre(model,{kind:'laser',phase:'fire',progress:0.5,beam:{x:0,y:0,height:2.8,endX:200,endY:0,endHeight:1}},(x,y,h)=>new THREE.Vector3(x*.05,h,y*.05));
  assert.equal(model.beam.visible,true);assert.ok(model.beam.scale.y>10);
  assert.equal(model.glow.emissiveIntensity,3.8);
  const beamStart=new THREE.Vector3(0,-0.5,0).applyMatrix4(model.beam.updateMatrix()||model.beam.matrix);
  assert.ok(beamStart.distanceTo(model.charge.position)<1e-8,'beam begins at the chest crystal');
  poseOgre(model,null,()=>{});assert.equal(model.effects.visible,false);
  assert.equal(model.glow.emissiveIntensity,0.8);
  assert.equal(model.torso.rotation.x,0);
  model.group.traverse(m=>{m.geometry?.dispose();m.material?.dispose();});
});
