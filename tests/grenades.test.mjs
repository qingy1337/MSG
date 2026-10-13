import {test} from 'node:test';
import assert from 'node:assert/strict';
import grenade from '../game/grenades.js';
import server from '../game/gameServer.js';
import {MeshStandardMaterial,Quaternion} from 'three';
import {poseGrenadeFuse} from '../public/grenadeFuse.mjs';
import {createGrenadeExplosion,poseGrenadeExplosion,EXPLOSION_DURATION} from '../public/grenadeExplosion.mjs';
import {createGrenadeHud} from '../public/grenadeHud.mjs';
const map={width:900,height:600,ceiling:8,terrain:[]};
const player={id:'p',x:100,y:250,height:0,alive:true,health:100,grenades:3};
test('grenade HUD fades spent icons, refills them, and fills charge vertically only while held',()=>{
  const icons=Array.from({length:3},()=>({classList:{toggle(name,on){this[name]=on;}}}));
  const element=()=>({style:{},setAttribute(name,value){this[name]=value;}});
  const hud=element(),track=element(),fill=element();hud.querySelectorAll=()=>icons;
  const elements={'grenade-hud':hud,'grenade-charge-track':track,'grenade-charge':fill};
  const update=createGrenadeHud({getElementById:id=>elements[id]});
  update(3);assert.ok(icons.every(i=>i.classList.available));assert.equal(track.hidden,true);
  update(2,600);assert.deepEqual(icons.map(i=>i.classList.available),[true,true,false]);
  assert.equal(fill.style.height,'50%');assert.equal(track.hidden,false);assert.equal(track['aria-valuenow'],'50');
  update(2,5000);assert.equal(fill.style.height,'100%');
  update(0);assert.ok(icons.every(i=>!i.classList.available));assert.equal(track.hidden,true);
  assert.equal(fill.style.height,'0%');assert.equal(hud['aria-label'],'0 of 3 grenades available');
  update(3);assert.ok(icons.every(i=>i.classList.available));
});
test('charge controls range, caps power, and fuse begins on release',()=>{
  const tap=grenade.throwGrenade(player,0,0,0,5000,1),full=grenade.throwGrenade(player,0,0,1200,5000,2);
  assert.equal(tap.expiresAt,8000);assert.ok(full.vx>tap.vx*4);
  assert.equal(tap.vx,110);assert.equal(full.vx,510);
  assert.equal(grenade.throwGrenade(player,0,0,90000,5000,3).vx,full.vx);
  grenade.stepGrenade(tap,8000,map,[]);grenade.stepGrenade(full,8000,map,[]);
  assert.ok(full.x>tap.x+100);assert.ok(tap.height>=.12);
});
test('grenades bounce off walls, floor, ceiling and raised terrain without tunneling',()=>{
  const wall={x:130,y:0,width:2,height:600,top:8};
  const g=grenade.throwGrenade(player,0,0,1200,0,1);
  grenade.stepGrenade(g,100,map,[wall]);assert.ok(g.vx<0);assert.ok(g.x<130);
  const floor={...g,x:300,y:250,height:.2,vx:0,vy:0,vz:-100,updatedAt:0};
  grenade.stepGrenade(floor,25,map,[]);assert.ok(floor.vz>0);assert.ok(floor.height>=.12);
  const roof={...floor,height:7.8,vz:100,updatedAt:0};
  grenade.stepGrenade(roof,25,map,[]);assert.ok(roof.vz<0);
  const deck={...floor,height:3.25,vz:-100,updatedAt:0};
  grenade.stepGrenade(deck,40,{...map,terrain:[{x:200,y:200,width:200,height:200,top:3,bottom:2.8}]},[]);
  assert.ok(deck.height>=3.12);assert.ok(deck.vz>0);
});
test('blast does 120 close, falls off quickly, stops at cover and has finite range',()=>{
  const g={x:100,y:250,height:.12};
  const damage=x=>grenade.blastDamage(g,{...player,x},map,[]);
  assert.equal(damage(130),120);assert.ok(damage(190)>40&&damage(190)<45);assert.equal(damage(280),0);
  assert.equal(grenade.blastDamage(g,{...player,x:190},map,[{x:140,y:200,width:10,height:100,top:3}]),0);
});
test('server owns inventory, charge time, fuse and damage',t=>{
  let now=100000,tick,connect;const handlers={},events=[];
  t.mock.method(Date,'now',()=>now);t.mock.method(global,'setInterval',fn=>{tick=fn;return 0;});
  const game=server.createGameServer({on(_,fn){connect=fn;},emit(name,data,meta){events.push({name,data,meta});},to(){return this;}});
  connect({id:'p',on(name,fn){handlers[name]=fn;}});
  try {
    game.gameInProgress.status=true;game.activePlayers.push({...player},{...player,id:'enemy',x:200,health:1000});
    handlers.throwGrenade({angle:0,pitch:0});assert.equal(game.activePlayers[0].grenades,3);
    handlers.grenadeCharge();handlers.throwGrenade({angle:NaN,pitch:0});assert.equal(game.activePlayers[0].grenades,3);
    for(let i=0;i<4;i++){handlers.grenadeCharge();handlers.throwGrenade({angle:0,pitch:0,charge:99999});}
    assert.equal(game.activePlayers[0].grenades,0);
    tick();
    assert.equal(events.find(e=>e.name==='gameState').meta.grenades[0].vx,110,'client cannot forge charge power');
    now+=2999;tick();assert.equal(events.filter(e=>e.name==='grenadeExploded').length,0);
    now++;tick();assert.equal(events.filter(e=>e.name==='grenadeExploded').length,3);
    assert.ok(game.activePlayers[1].health<1000);assert.equal(game.activePlayers[0].health,100);
    assert.equal(game.activePlayers[0].grenades,0,'PvP does not refill');
  }finally{game.close();}
});

test('grenades share snapshots without starving PvE bot updates on a busy transport',t=>{
  let now=100000,tick,connect,writable=true,dropped=0;
  const handlers={},received=[],reliable=[];
  t.mock.method(Date,'now',()=>now);t.mock.method(global,'setInterval',fn=>{tick=fn;return 0;});
  const io={on(_,fn){connect=fn;},socketsLeave(){},to(){return this;},
    // Match Socket.IO: any send makes the transport busy until it drains;
    // volatile packets sent while busy are discarded, not queued.
    emit(name){reliable.push(name);writable=false;},
    volatile:{emit(name,data,meta){
      if(!writable){dropped++;return;}
      writable=false;received.push(structuredClone({name,data,meta}));
    }}};
  const game=server.createGameServer(io);
  connect({id:'p',on(name,fn){handlers[name]=fn;}});
  game.waitingPlayers.push({...player,weapon:'pistol'});handlers.startGame({enableBots:true});
  try {
    const human=game.activePlayers.find(p=>!p.isBot);human.health=10000;
    for(const bot of game.activePlayers.filter(p=>p.isBot))bot.botState.lastShotAt=now+100000;
    handlers.grenadeCharge();handlers.throwGrenade({angle:0,pitch:0});
    for(let i=0;i<59;i++){writable=true;now+=50;tick();}
    assert.equal(dropped,0);assert.equal(received.length,59);
    for(const packet of received){
      assert.equal(packet.name,'gameState');assert.ok(packet.data.some(p=>p.isBot));
      assert.equal(packet.meta.grenades.length,1);
      assert.equal(packet.meta.grenades[0].expiresAt,103000);
    }
    assert.equal(reliable.includes('grenadeState'),false);
    // Congestion can discard one whole frame; the next carries both states.
    writable=true;now+=50;tick(); // reliable explosion, snapshot may drop
    assert.ok(reliable.includes('grenadeExploded'));
    writable=true;now+=50;tick();
    assert.equal(received.at(-1).meta.grenades.length,0);
    assert.ok(received.at(-1).data.some(p=>p.isBot));
  }finally{game.close();}
});

test('fuse flashes red between normal-body intervals and stops after detonation',()=>{
  const material=new MeshStandardMaterial();
  poseGrenadeFuse(material,3000);assert.equal(material.color.getHex(),0x617344);
  const peakElapsed=-2+Math.sqrt(4.5);
  poseGrenadeFuse(material,3000-peakElapsed*1000);
  assert.equal(material.color.getHex(),0xff6860);assert.ok(material.emissiveIntensity>.79);
  poseGrenadeFuse(material,2700);assert.equal(material.color.getHex(),0x617344);
  poseGrenadeFuse(material,0);assert.equal(material.emissiveIntensity,0);
  material.dispose();
});

test('explosion has a brief violent burst, outward debris and lingering rising smoke',()=>{
  const group=createGrenadeExplosion(()=>.5),view=new Quaternion();
  const smoke=group.children.filter(m=>m.userData.kind==='smoke');
  const fire=group.children.filter(m=>m.userData.kind==='fire');
  assert.equal(smoke.length,12);assert.equal(fire.length,8);assert.ok(group.children.length<50);
  poseGrenadeExplosion(group,.1,view);
  assert.ok(fire.every(m=>m.visible));assert.ok(group.children.find(m=>m.userData.kind==='core').visible);
  poseGrenadeExplosion(group,.5,view);const earlyY=smoke[0].position.y,earlyScale=smoke[0].scale.x;
  poseGrenadeExplosion(group,1.4,view);
  assert.ok(fire.every(m=>!m.visible));assert.ok(smoke.every(m=>m.visible));
  assert.ok(smoke[0].position.y>earlyY);assert.ok(smoke[0].scale.x>earlyScale);
  assert.ok(smoke.every(m=>m.material.uniforms.opacity.value>0));
  for(const child of group.children){
    assert.ok([...child.position.toArray(),...child.scale.toArray()].every(Number.isFinite));
    assert.ok([...child.geometry.attributes.position.array].every(Number.isFinite));
  }
  poseGrenadeExplosion(group,EXPLOSION_DURATION,view);assert.ok(group.children.every(m=>!m.visible));
  new Set(group.children.map(m=>m.geometry)).forEach(g=>g.dispose());group.children.forEach(m=>m.material.dispose());
});

test('idle PvP still broadcasts grenade motion and removes exploded grenades',t=>{
  let now=100000,tick,connect;const handlers={},frames=[];
  t.mock.method(Date,'now',()=>now);t.mock.method(global,'setInterval',fn=>{tick=fn;return 0;});
  const game=server.createGameServer({on(_,fn){connect=fn;},emit(name,data,meta){if(name==='gameState')frames.push(meta);},to(){return this;}});
  connect({id:'p',on(name,fn){handlers[name]=fn;}});
  try {
    game.gameInProgress.status=true;
    game.activePlayers.push({...player},{...player,id:'other',x:800,y:500});
    handlers.grenadeCharge();handlers.throwGrenade({angle:0,pitch:0});
    for(let i=0;i<60;i++){now+=50;tick();}
    assert.equal(frames.length,60);
    assert.ok(frames.slice(0,-1).every(f=>f.grenades.length===1));
    assert.equal(frames.at(-1).grenades.length,0);
  }finally{game.close();}
});

test('PvE explosions spare teammates and damage bots',t=>{
  let now=100000,tick,connect;const handlers={};
  t.mock.method(Date,'now',()=>now);t.mock.method(global,'setInterval',fn=>{tick=fn;return 0;});
  const game=server.createGameServer({on(_,fn){connect=fn;},emit(){},to(){return this;},socketsLeave(){}});
  connect({id:'p',on(name,fn){handlers[name]=fn;}});
  game.waitingPlayers.push({...player,weapon:'pistol'});
  handlers.startGame({enableBots:true});
  try {
    game.gameWalls.length=0;game.gameMap.terrain.length=0;
    const human=game.activePlayers.find(p=>p.id==='p');Object.assign(human,{x:100,y:250,height:0});
    game.activePlayers.splice(1);
    const ally={...player,id:'ally',x:200},bot={...player,id:'bot',isBot:true,x:200,health:1000};
    game.activePlayers.push(ally,bot);
    handlers.grenadeCharge();handlers.throwGrenade({angle:0,pitch:0});
    now+=3000;tick();assert.equal(ally.health,101);assert.equal(human.health,101);assert.ok(bot.health<1000);
  }finally{game.close();}
});
