import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Box3} from 'three';
import server from '../game/gameServer.js';
import override from '../game/elevatorOverride.js';
import inputs from '../public/inputMovement.js';
import floors from '../public/floors.js';
import {createElevatorModel,poseElevator} from '../public/elevator.mjs';
import {applyAmbientZones,ambientZoneUniforms} from '../public/ambientZones.mjs';

const cabin={x:100,y:100,width:160,height:220,ceiling:3.4,facing:'west'};
const aim=(p,e)=>{
  const x=e.facing==='west'?e.x+e.width-12:e.x+12,y=e.y+e.height/2;
  return {angle:Math.atan2(y-p.y,x-p.x),pitch:Math.atan2(1.44-1.84,Math.hypot(x-p.x,y-p.y)*.05)};
};

test('cabin travel accepts walking, ignores outside terrain and confines the full body',()=>{
  const p={alive:true,x:180,y:210,height:0},map={ceiling:8};
  const blockers=[{x:100,y:100,width:160,height:220,top:20}];
  inputs.applyMovementInput(p,{dx:1,dy:0,dt:.05,jump:true},map,blockers,1000,cabin);
  assert.equal(p.x,188.5);assert.equal(p.height,0);assert.equal(p.jumpStartedAt,null);
  for(let i=0;i<100;i++)inputs.applyMovementInput(p,{dx:1,dy:1,dt:.05},map,blockers,1000+i*50,cabin);
  assert.equal(p.x,234);assert.equal(p.y,294);
  for(let i=0;i<100;i++)inputs.applyMovementInput(p,{dx:-1,dy:-1,dt:.05},map,blockers,6000+i*50,cabin);
  assert.equal(p.x,126);assert.equal(p.y,126);
});

test('override ray matches both cabin orientations, rejects misses and obstruction',()=>{
  for(const facing of ['east','west']) {
    const e={...cabin,facing},map={mode:'pve',width:900,height:600,ceiling:8,terrain:[],elevator:e};
    const p={x:180,y:210,height:0},shot=aim(p,e);
    assert.ok(override.hitsElevatorOverride(p,shot.angle,shot.pitch,map,[]));
    assert.equal(override.hitsElevatorOverride(p,shot.angle,0,map,[]),false);
    const block={x:facing==='west'?210:140,y:190,width:5,height:40,top:3};
    assert.equal(override.hitsElevatorOverride(p,shot.angle,shot.pitch,map,[block]),false);
    assert.equal(override.hitsElevatorOverride({...p,x:400},shot.angle,shot.pitch,map,[]),false);
    const model=createElevatorModel(e),button=model.userData.button;
    const box=new Box3().setFromObject(button);
    assert.ok(box.min.x>=.5&&box.max.x<=.7);assert.ok(box.min.y>=1.28&&box.max.y<=1.6);
    model.traverse(m=>{m.geometry?.dispose();m.material?.dispose();});
  }
});

test('closed cabin surfaces have fixed local shading, unaffected by room ambient zones',()=>{
  const model=createElevatorModel(cabin);
  applyAmbientZones(model,ambientZoneUniforms({baseline:.5,zones:[]}));
  model.traverse(m=>{
    if(!m.isMesh)return;
    assert.ok(m.material.isMeshBasicMaterial);assert.equal(m.material.toneMapped,false);
    assert.equal(m.material.userData.ambientZones,undefined);
    assert.ok([...m.geometry.attributes.color.array].every(Number.isFinite));
  });
  const colors=[...model.children[0].geometry.attributes.color.array];
  poseElevator(model,{door:0,rise:10});model.rotation.y=Math.PI;
  assert.deepEqual([...model.children[0].geometry.attributes.color.array],colors);
  model.traverse(m=>{m.geometry?.dispose();m.material?.dispose();});
});

test('server override requires clearance and all survivors, then allows bounded travel movement across transfer',t=>{
  let now=100000,tick,connect;const handlers={},events=[];
  t.mock.method(Date,'now',()=>now);t.mock.method(global,'setInterval',fn=>{tick=fn;return 0;});
  const game=server.createGameServer({on(_,fn){connect=fn;},emit(name,data){events.push({name,data});},to(){return this;},socketsLeave(){}});
  connect({id:'p',on(name,fn){handlers[name]=fn;}});
  game.waitingPlayers.push({id:'p',weapon:'pistol'},{id:'ally',weapon:'pistol'});
  handlers.startGame({enableBots:true});
  try {
    const p=game.activePlayers.find(p=>p.id==='p'),ally=game.activePlayers.find(p=>p.id==='ally'),e=game.gameMap.elevator;
    Object.assign(p,{x:e.x+80,y:e.y+110,height:0});Object.assign(ally,{x:e.x+80,y:e.y+50,height:0});
    const shoot=()=>{p.lastShotAt=0;handlers.shoot(aim(p,e));};
    shoot();assert.equal(game.floorState.phase,'combat','living enemies prevent override');
    for(const bot of game.activePlayers.filter(p=>p.isBot))bot.alive=false;
    game.floorState.phase='ready';game.floorState.startedAt=now;
    ally.x=e.x-80;shoot();assert.equal(game.floorState.phase,'ready','cannot abandon a survivor');
    ally.x=e.x+80;
    const blocker={x:e.x+110,y:e.y+90,width:5,height:40,top:3};game.gameWalls.push(blocker);
    shoot();assert.equal(game.floorState.phase,'ready','button cannot be shot through cover');game.gameWalls.pop();
    shoot();assert.equal(game.floorState.phase,'riding','override does not wait for normal opening timer');
    const started=game.floorState.startedAt,oldX=p.x;
    now+=50;
    handlers.playerUpdate({angle:p.angle,inputs:[{seq:1,epoch:p.movementEpoch,dt:.05,dx:-1,dy:0,jump:false}]});
    assert.equal(p.x,oldX-8.5,'authoritative movement works while riding');
    const before={x:p.x,y:p.y};
    handlers.playerUpdate({angle:p.angle,inputs:[{seq:2,epoch:p.movementEpoch-1,dt:.05,dx:1,dy:0,jump:false}]});
    assert.equal(p.x,before.x,'old floor/phase inputs cannot replay');
    now=started+floors.LIFT_TIMING.close+floors.LIFT_TIMING.travel;tick();
    assert.equal(game.floorState.phase,'opening');const arrival=game.gameMap.arrivalElevator;
    assert.equal(p.x,arrival.x+e.width-(before.x-e.x));
    assert.equal(p.y,arrival.y+e.height-(before.y-e.y));
    const arrivedX=p.x;now+=50;
    handlers.playerUpdate({angle:p.angle,inputs:[{seq:3,epoch:p.movementEpoch,dt:.05,dx:1,dy:0,jump:false}]});
    assert.equal(p.x,arrivedX+8.5,'movement also works while arrival doors open');
    assert.ok(floors.inElevator(p,{elevator:arrival}));
  }finally{game.close();}
});
