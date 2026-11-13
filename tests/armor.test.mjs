import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as THREE from 'three';
import armor from '../public/armor.js';
import items from '../lib/armor.js';
import movement from '../public/inputMovement.js';
import maps from '../public/arenaMap.js';
import {InputPrediction} from '../public/inputPrediction.mjs';
import {createArmorFitting} from '../public/armorModels.mjs';

const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'blocks-armor-'));
process.env.DATA_DIR=dataDir;
const {default:store}=await import('../lib/userStore.js');
const {default:server}=await import('../game/gameServer.js');
after(()=>{store.saveUsers();fs.rmSync(dataDir,{recursive:true,force:true});});

function purchaseSet(user,key,options) {
  for(const slot of armor.SLOTS)items.purchaseArmor(user,`${key}_${slot}`,options);
}

test('accounts start without free armor and purchased inventory survives reloads',()=>{
  const user={username:'buyer',currencies:{Coins:16000}};
  items.ensureUserArmor(user);
  assert.equal(user.armor.items.length,0);
  assert.deepEqual(items.publicArmor(user).stats,armor.effects(null,'pvp'));
  purchaseSet(user,'bastion',{random:()=>0});items.equipArmorSet(user,'bastion');
  const ids=user.armor.items.map(item=>item.id);
  for(let i=0;i<5;i++)items.ensureUserArmor(user);
  assert.equal(new Set(ids).size,4);
  assert.deepEqual(user.armor.items.map(item=>item.id),ids);
  assert.deepEqual(items.publicArmor(user).stats,{health:40,regen:.5,speed:0,charge:0,fireRate:0,airDash:false});
  const output=items.publicArmor(user);output.items[0].stats.health=500;output.equipped.helmet=null;
  assert.equal(user.armor.items[0].stats.health,10);
  assert.ok(user.armor.equipped.helmet);
  const restored=JSON.parse(JSON.stringify(user));items.ensureUserArmor(restored);
  assert.deepEqual(restored,user);
});

test('existing Bastion purchases receive fixed bonuses without changing ownership or other armor rolls',()=>{
  const user={currencies:{Coins:30000}};
  purchaseSet(user,'bastion');items.equipArmorSet(user,'bastion');
  const bastion=user.armor.items;
  for(const [index,item] of bastion.entries())item.stats={health:3+index,regen:.1+index*.03};
  const legacy=structuredClone(user),coins=user.currencies.Coins;
  const lifeline=items.makeItem('lifeline_helmet',{random:()=>.3}),oldLifeline=structuredClone(lifeline);
  user.armor.items.push(lifeline);
  assert.deepEqual(armor.statsForItems(legacy.armor.items),{health:40,regen:.5,speed:0,charge:0,fireRate:0,airDash:false},
    'shared rules recognize fixed bonuses even before old inventory is normalized');
  const result=items.publicArmor(user);
  assert.equal(user.currencies.Coins,coins);assert.deepEqual(user.armor.equipped,legacy.armor.equipped);
  for(const [index,item] of result.items.slice(0,4).entries()) {
    assert.equal(item.id,legacy.armor.items[index].id);assert.equal(item.acquiredAt,legacy.armor.items[index].acquiredAt);
    assert.deepEqual(item.stats,{health:10,regen:.125});
    const partial=armor.statsForItems(result.items.slice(0,index+1));
    assert.equal(partial.health,10*(index+1));assert.equal(partial.regen,.125*(index+1));
  }
  assert.deepEqual(user.armor.items.at(-1),oldLifeline,'other designs retain their purchased rolls');
  assert.equal(armor.formatStat('regen',.125),'0.125 HP/s');
  const restored=JSON.parse(JSON.stringify(user));items.ensureUserArmor(restored);
  assert.deepEqual(restored,user,'normalization is stable across repeated loads');
});

test('armor is sold per slot at its catalog price and keeps its purchased stats',()=>{
  for(const slot of armor.SLOTS) {
    assert.equal(armor.CATALOG[`bastion_${slot}`].price,4000);
    assert.equal(armor.CATALOG[`lifeline_${slot}`].price,3000);
    assert.equal(armor.CATALOG[`vector_${slot}`].price,3750);
  }
  assert.equal(armor.CATALOG.slipstream_boots.price,20000);
  for(const definition of Object.values(armor.CATALOG))for(const roll of [0,.5,1]) {
    const item=items.makeItem(definition.key,{random:()=>roll});
    for(const [key,[low,high]] of Object.entries(definition.ranges))assert.ok(item.stats[key]>=low&&item.stats[key]<=high);
  }
  const user={currencies:{Coins:3999}};items.ensureUserArmor(user);
  assert.throws(()=>items.purchaseArmor(user,'bastion_helmet'),/Coins/);
  assert.equal(user.currencies.Coins,3999);assert.equal(user.armor.items.length,0);
  user.currencies.Coins=24000;items.purchaseArmor(user,'bastion_helmet');
  assert.equal(user.currencies.Coins,20000);assert.equal(user.armor.items.length,1);
  assert.equal(user.armor.items[0].key,'bastion_helmet');assert.deepEqual(items.publicArmor(user).ownedSets,[]);
  assert.throws(()=>items.equipArmorSet(user,'bastion'),/do not own/);
  const previous=JSON.stringify(user.armor.items);
  assert.equal(items.purchaseArmor(user,'bastion_helmet').alreadyOwned,true);
  assert.equal(user.currencies.Coins,20000);assert.equal(JSON.stringify(user.armor.items),previous);
  items.purchaseArmor(user,'slipstream_boots');items.equipArmorSet(user,'slipstream');
  assert.equal(user.currencies.Coins,0);assert.equal(items.publicArmor(user).stats.airDash,true);
  for(const key of ['bastion','lifeline','vector','slipstream','__proto__',null,['bastion_helmet'],{}])
    assert.throws(()=>items.purchaseArmor(user,key),/piece not found/);
});

test('previously owned sets and Slipstream never require buying their pieces again',()=>{
  const user={currencies:{Coins:10000},armor:{items:armor.SLOTS.map(slot=>items.makeItem(`lifeline_${slot}`,{random:()=>.3})),equipped:{}}};
  user.armor.items.push(items.makeItem('slipstream_boots',{random:()=>.6}));
  items.equipArmorSet(user,'lifeline');items.equipArmorSet(user,'slipstream');
  const before=JSON.stringify(user);
  for(const piece of user.armor.items)assert.equal(items.purchaseArmor(user,piece.key).alreadyOwned,true);
  assert.equal(JSON.stringify(user),before,'no charge, duplicate, stat reroll, or equipment change');
  assert.deepEqual(items.publicArmor(user).ownedSets,['lifeline','slipstream']);
});

test('equipping requires an owned item in the right slot and stats are capped',()=>{
  const user={username:'equip'};items.ensureUserArmor(user);
  const helmet=items.makeItem('bastion_helmet');user.armor.items.push(helmet);
  assert.throws(()=>items.equipArmor(user,'boots',helmet.id),/own/);
  assert.throws(()=>items.equipArmor(user,'boots','foreign-id'),/own/);
  assert.throws(()=>items.equipArmor(user,'__proto__',null),/slot/);
  const recovery=armor.SLOTS.map(slot=>items.makeItem(`lifeline_${slot}`,{random:()=>1}));
  user.armor.items.push(...recovery);
  for(const item of recovery)items.equipArmor(user,armor.CATALOG[item.key].slot,item.id);
  assert.equal(items.publicArmor(user).stats.regen,2.5,'full Lifeline reaches the regeneration cap');
  assert.equal(armor.statsForItems([...recovery,...recovery]).health,12,'a slot cannot stack twice');
  const stats=items.publicArmor(user).stats;
  assert.deepEqual(armor.effects({...stats,speed:1000,airDash:true},'pvp'),{health:0,regen:0,speed:0,charge:0,fireRate:0,airDash:false});
  items.equipArmor(user,'helmet',null);assert.equal(items.armorLoadout(user).armorAppearance.helmet,undefined);
});

test('Vector guarantees five percent speed per piece, including previously purchased rolls',()=>{
  const user={currencies:{Coins:5000},armor:{items:[{id:'old-vector',key:'vector_chest',
    stats:{speed:1.6,charge:5.1},acquiredAt:123}],equipped:{chest:'old-vector'}}};
  for(let i=0;i<3;i++)items.ensureUserArmor(user);
  assert.deepEqual(user.armor.items[0],{id:'old-vector',key:'vector_chest',
    stats:{speed:5,fireRate:2},acquiredAt:123});
  assert.equal(user.currencies.Coins,5000);assert.equal(user.armor.equipped.chest,'old-vector');
  for(const roll of [0,.5,1]) {
    const pieces=armor.SLOTS.map(slot=>items.makeItem(`vector_${slot}`,{random:()=>roll}));
    assert.ok(pieces.every(piece=>piece.stats.speed===5));
    assert.equal(armor.statsForItems(pieces).speed,20);
    assert.equal(armor.statsForItems(pieces).fireRate,8);
    assert.equal(armor.statsForItems(pieces).charge,0);
    const p={alive:true,x:200,y:200,height:0,groundHeight:0,armorStats:armor.statsForItems(pieces)};
    movement.applyMovementInput(p,{dx:1,dy:0,dt:.05},{width:1000,height:1000,ceiling:10,mode:'pve',terrain:[]},[],1000);
    assert.ok(Math.abs(p.x-210.2)<1e-9,'the full set moves at 120% of the normal speed');
  }
});

test('purchase API validates ownership and funds, ignores forged prices, and charges concurrent duplicates once',async t=>{
  const {default:express}=await import('express');
  const {default:routes}=await import('../routes/armorRoutes.js');
  const app=express();app.use(express.json());app.use('/api/armor',routes.createArmorRoutes());
  const listener=app.listen(0,'127.0.0.1');
  await new Promise(resolve=>listener.once('listening',resolve));
  t.after(()=>new Promise(resolve=>listener.close(resolve)));
  const user={username:'api-buyer',currencies:{Coins:11000}};store.usersByUsername.set(user.username,user);
  const cookie=`${store.AUTH_COOKIE_NAME}=${encodeURIComponent(store.signAuthToken({username:user.username}))}`;
  const url=`http://127.0.0.1:${listener.address().port}/api/armor`;
  const post=(route,body,authenticated=true)=>fetch(`${url}/${route}`,{method:'POST',headers:{'content-type':'application/json',...(authenticated?{cookie}:{})},body:JSON.stringify(body)});
  assert.equal((await post('purchase',{itemKey:'bastion_helmet'},false)).status,401);
  for(const body of [{itemKey:'not-an-item'},{itemKey:'bastion'},{itemKey:'__proto__'},
    {itemKey:['bastion_helmet']},{setKey:'bastion'},{setKey:'slipstream'}])
    assert.equal((await post('purchase',body)).status,400,'old bundle requests and invalid item keys cannot charge');
  assert.equal(user.currencies.Coins,11000);assert.equal(user.armor.items.length,0);
  assert.equal((await post('equip-set',{setKey:'bastion'})).status,400);
  const results=await Promise.all(Array.from({length:4},()=>post('purchase',{itemKey:'bastion_helmet',price:1,Coins:999999,quantity:4})));
  assert.ok(results.every(response=>response.status===200));
  assert.equal(user.currencies.Coins,7000);assert.equal(user.armor.items.length,1);
  assert.equal(user.armor.items[0].key,'bastion_helmet');assert.equal(user.armor.equipped.helmet,null);
  assert.equal((await post('purchase',{itemKey:'vector_boots'})).status,200);
  assert.equal(user.currencies.Coins,3250);
  assert.equal((await post('purchase',{itemKey:'lifeline_chest'})).status,200);
  assert.equal(user.currencies.Coins,250);
  assert.equal((await post('purchase',{itemKey:'bastion_chest'})).status,400);
  assert.equal(user.currencies.Coins,250);assert.equal(user.armor.items.length,3);
  for(const item of user.armor.items)assert.equal((await post('equip',{slot:armor.CATALOG[item.key].slot,itemId:item.id})).status,200);
  const disk=JSON.parse(fs.readFileSync(path.join(dataDir,'users.json'),'utf8')).find(saved=>saved.username===user.username);
  assert.equal(disk.currencies.Coins,250);assert.equal(disk.armor.items.length,3);
  assert.deepEqual(items.armorLoadout(disk).armorAppearance,{helmet:'bastion_helmet',chest:'lifeline_chest',boots:'vector_boots'});
  user.currencies.Coins=4000;
  const competing=await Promise.all(['bastion_boots','bastion_gauntlets'].map(itemKey=>post('purchase',{itemKey})));
  assert.deepEqual(competing.map(response=>response.status).sort(),[200,400]);
  assert.equal(user.currencies.Coins,0);assert.equal(user.armor.items.length,4,'simultaneous different purchases cannot overspend');
});

function account(username,set='lifeline',exotic=false,quartermaster=false) {
  const user={username,loadout:{primaryWeapon:'sniper'}};items.ensureUserArmor(user);
  for(const slot of armor.SLOTS) {
    const item=items.makeItem(quartermaster&&slot==='helmet'?'quartermaster_helmet':exotic&&slot==='boots'?'slipstream_boots':`${set}_${slot}`,{random:()=>1});
    user.armor.items.push(item);items.equipArmor(user,slot,item.id);
  }
  store.usersByUsername.set(username,user);return user;
}
function match(t,{pve=true,floor=1,team=1,set='lifeline',exotic=false,quartermaster=false}={}) {
  let now=100000;
  t.mock.method(global,'setInterval',()=>0);t.mock.method(Date,'now',()=>now);
  const events=[],handlers={};
  const io={on(){},emit(name,data,meta){events.push({name,data,meta});},
    to(ids){return {emit(name,data,meta){events.push({name,data,meta,to:ids});}};},socketsLeave(){}};
  const game=server.createGameServer(io),users=[],sockets=[];
  for(let i=0;i<team;i++) {
    const user=account(i===0?'qing':`friend-${i}`,set,exotic,quartermaster);users.push(user);
    const socket={id:`p${i}`,user,on(name,fn){if(i===0)handlers[name]=fn;}};sockets.push(socket);
    game.registerSocketHandlers(socket);
    game.waitingPlayers.push({id:socket.id,name:user.username,accountUsername:user.username,weapon:'sniper',primaryWeapon:'sniper'});
  }
  game.handleStartGame(sockets[0],{enableBots:pve,startFloor:floor,debugDouble:!pve,pvpMap:'maze'});
  const humans=game.activePlayers.filter(p=>!p.isBot&&!p.debugCloneOf).sort((a,b)=>a.id.localeCompare(b.id));
  t.after(()=>game.close());
  return {game,handlers,events,users,humans,sockets,get now(){return now;},advance(ms){now+=ms;}};
}

test('Vector firing rate affects manual weapons, shotgun cycles and automatic scheduling in PvE',t=>{
  for(const rapid of [false,true]) {
    const f=match(t,{set:'vector'}),p=f.humans[0];
    f.game.gameWalls.length=0;f.game.gameMap.terrain.length=0;
    for(const bot of f.game.activePlayers.filter(player=>player.isBot))bot.alive=false;
    Object.assign(p,{x:300,y:300,height:0,groundHeight:0});
    f.game.floorState.buff=rapid?'rapidFire':null;
    const multiplier=1.08*(rapid?2:1);
    const shots=()=>f.events.reduce((count,event)=>count+(event.name==='shotFired'?1:event.name==='shotsFired'?event.data.length:0),0);
    for(const [weapon,base] of [['pistol',75],['sniper',1100]]) {
      p.weapon=weapon;p.lastShotAt=0;const before=shots();
      f.handlers.shoot({angle:0,pitch:0});assert.equal(shots(),before+1);
      f.advance(base/multiplier-1);f.handlers.shoot({angle:0,pitch:0});assert.equal(shots(),before+1);
      f.advance(1);f.handlers.shoot({angle:0,pitch:0});assert.equal(shots(),before+2);
    }
    p.weapon='shotgun';p.lastShotAt=0;
    f.handlers.shoot({angle:0,pitch:0});f.advance(200/multiplier);f.handlers.shoot({angle:0,pitch:0});
    assert.ok(Math.abs(p.shotgunReloadUntil-f.now-1000/multiplier)<.001);
    const before=shots();f.advance(1000/multiplier-1);f.handlers.shoot({angle:0,pitch:0});assert.equal(shots(),before);
    f.advance(1);f.handlers.shoot({angle:0,pitch:0});assert.equal(shots(),before+1);
    // Epoch-sized timestamps exercise precision in repeated fractional intervals.
    f.advance(1700000000000-f.now);
    for(const [weapon,base,spin] of [['autoRifle',80,0],['miniGun',18,225]]) {
      p.weapon=weapon;p.lastShotAt=0;p.miniGunSpinStartedAt=null;p.miniGunLastAttemptAt=null;
      const before=shots(),started=f.now;
      f.handlers.automaticFireStart({angle:0,pitch:0});
      for(let i=0;i<40;i++){f.advance(50);f.game.runBotsTick();}
      assert.equal(shots()-before,1+Math.floor((f.now-started-spin)/(base/multiplier)));
      f.handlers.automaticFireStop();
    }
  }
});

test('weapon timing shares the same armor multiplier with clients and ignores armor in PvP',()=>{
  const stats={fireRate:8};
  for(const base of [18,75,80,200,1000,1100]) {
    assert.equal(armor.weaponInterval(base,stats,'pve'),base/1.08);
    assert.equal(armor.weaponInterval(base,stats,'pve',true),base/1.08/2);
    assert.equal(armor.weaponInterval(base,stats,'pvp',true),base);
  }
});

test('Quartermaster costs 30,000, equips as a helmet, and shares the one-exotic limit',()=>{
  const user={currencies:{Coins:29999}};
  assert.throws(()=>items.purchaseArmor(user,'quartermaster_helmet'),/Coins/);
  user.currencies.Coins=50000;items.purchaseArmor(user,'quartermaster_helmet');
  assert.equal(user.currencies.Coins,20000);assert.equal(user.armor.items.length,1);
  const helmet=user.armor.items[0];items.equipArmor(user,'helmet',helmet.id);
  assert.equal(items.armorLoadout(user).armorStats.grenadeRefill,true);
  items.purchaseArmor(user,'slipstream_boots');
  assert.throws(()=>items.equipArmor(user,'boots',user.armor.items[1].id),/one exotic/);
  items.equipArmor(user,'helmet',null);items.equipArmor(user,'boots',user.armor.items[1].id);
  assert.throws(()=>items.equipArmor(user,'helmet',helmet.id),/one exotic/);
});

test('Quartermaster refills at exactly 30 seconds, caps at three, and preserves cadence across floors',t=>{
  const f=match(t,{quartermaster:true}),p=f.humans[0],start=f.now;
  const initial=f.events.find(event=>event.name==='gameStarting').data.players.find(player=>player.id===p.id);
  assert.equal(initial.grenadeRefillAt,start+30000);p.grenades=0;
  f.advance(29999);f.game.runBotsTick();assert.equal(p.grenades,0);
  f.advance(1);f.game.runBotsTick();assert.equal(p.grenades,3);assert.equal(p.grenadeRefillAt,start+60000);
  const frame=f.events.filter(event=>event.name==='gameState').at(-1).data.find(player=>player.id===p.id);
  assert.equal(frame.grenades,3);assert.equal(frame.grenadeRefillAt,start+60000);
  p.grenades=1;f.advance(75000);f.game.runBotsTick();
  assert.equal(p.grenades,3);assert.equal(p.grenadeRefillAt,start+120000,'late ticks keep the original cadence');
  f.game.activePlayers.filter(player=>player.isBot).forEach(bot=>{bot.alive=false;});
  const deadline=p.grenadeRefillAt;
  f.game.floorState.phase='riding';f.game.floorState.startedAt=f.now-100000;f.game.runBotsTick();
  assert.equal(f.game.gameMap.floor,2);assert.equal(p.grenadeRefillAt,deadline);
  p.grenades=0;p.alive=false;p.health=0;f.advance(30000);f.game.runBotsTick();
  assert.equal(p.grenades,0,'a dead operative is not refilled');
  f.handlers.retryFloor();assert.equal(p.grenadeRefillAt,f.now+30000,'retry starts a fresh timer');
});

test('Quartermaster appearance and countdown do not grant refills in PvP',t=>{
  const f=match(t,{pve:false,quartermaster:true}),p=f.humans[0];
  assert.equal(p.armorAppearance.helmet,'quartermaster_helmet');
  assert.equal(p.armorStats.grenadeRefill,undefined);assert.equal(p.grenadeRefillAt,undefined);
  p.grenades=0;f.advance(120000);f.game.runBotsTick();assert.equal(p.grenades,0);
});

test('Bastion and Lifeline supply their fixed health and regeneration only in PvE',t=>{
  for(const [set,health,regeneration] of [['bastion',141,5.5],['lifeline',113,7.5]])for(const pve of [true,false]) {
    const f=match(t,{pve,set}),p=f.humans[0];
    assert.equal(p.maxHealth,pve?health*(f.game.floorState.buff==='doubleHealth'?2:1):101);
    p.health=90;f.advance(1000);f.game.runBotsTick();
    assert.equal(p.health,pve?90+regeneration:90,'regeneration includes the exact fixed bonus and remains disabled in PvP');
  }
});

test('PvP sends equipped appearances but normal health, movement, and grenade charging',t=>{
  const f=match(t,{pve:false,set:'vector',exotic:true}),p=f.humans[0];
  assert.equal(p.health,101);assert.equal(p.maxHealth,101);
  assert.equal(p.armorAppearance.boots,'slipstream_boots');
  assert.deepEqual(p.armorStats,armor.effects(null,'pvp'));
  const start=f.events.find(event=>event.name==='gameStarting').data.players.find(player=>player.id===p.id);
  assert.deepEqual(start.armorAppearance,p.armorAppearance);assert.equal(start.armorStats.airDash,false);
  f.game.gameWalls.length=0;f.game.gameMap.terrain.length=0;
  Object.assign(p,{x:300,y:300,height:0,groundHeight:0});
  f.handlers.playerUpdate({angle:0,inputs:[{seq:1,epoch:0,dx:1,dy:0,dt:.05,dash:true,armorStats:{speed:999,airDash:true}}]});
  assert.ok(Math.abs(p.x-308.5)<1e-8);assert.equal(p.dashRemaining,0);
  f.handlers.grenadeCharge();f.advance(350);f.handlers.throwGrenade({angle:0,pitch:0,charge:999999});
  assert.equal(f.events.find(event=>event.name==='grenadeThrown').data.vx,310);
});

test('PvE bonuses survive retries, combine with room health buffs, and cannot be changed mid-run',t=>{
  const f=match(t,{exotic:true}),p=f.humans[0],bonuses=items.publicArmor(f.users[0]).stats;
  assert.deepEqual(p.armorStats,bonuses);
  const multiplier=f.game.floorState.buff==='doubleHealth'?2:1;
  assert.equal(p.maxHealth,(101+bonuses.health)*multiplier);assert.equal(p.health,p.maxHealth);
  p.health=10;f.advance(200);f.game.runBotsTick();
  assert.ok(Math.abs(p.health-(10+(5+bonuses.regen)*.2))<1e-6);
  const oldBoot=p.armorAppearance.boots;
  items.equipArmor(f.users[0],'boots',null);
  p.dashRemaining=.1;p.dashCoastRemaining=.3;
  f.game.floorState.phase='wiped';f.handlers.retryFloor();
  assert.equal(p.armorAppearance.boots,oldBoot);assert.deepEqual(p.armorStats,bonuses);
  assert.equal(p.health,p.maxHealth,'retry restores armor-adjusted full health');
  assert.equal(p.dashRemaining,0);assert.equal(p.dashCoastRemaining,0,'retry clears residual dash momentum');
  f.game.floorState.phase='combat';f.game.floorState.buff=null;
  f.handlers.grenadeCharge();f.advance(350);f.handlers.throwGrenade({angle:0,pitch:0});
  const grenade=f.events.find(event=>event.name==='grenadeThrown').data;
  assert.equal(grenade.vx,110+200*(1+bonuses.charge/100));
});

test('floor clears award no free armor; purchased gear survives death, floor transfer, and late joining',t=>{
  const f=match(t,{floor:5,team:2}),p=f.humans[0],downed=f.humans[1];
  const before=f.users.map(user=>user.armor.items.length);
  const queued=account('queued');const queuedCount=queued.armor.items.length;
  f.game.waitingPlayers.push({id:'queued',name:'queued',accountUsername:'queued',weapon:'pistol'});
  const bots=f.game.activePlayers.filter(p=>p.isBot);
  bots.forEach(bot=>{bot.alive=false;});
  const last=bots[0];Object.assign(last,{alive:true,health:1,x:600,y:400,height:0,groundHeight:0});
  Object.assign(p,{x:400,y:400,height:0,groundHeight:0});downed.alive=false;downed.health=0;
  f.game.gameWalls.length=0;f.game.gameMap.terrain.length=0;
  f.handlers.shoot({angle:0,pitch:0});
  assert.equal(f.game.floorState.phase,'ready',JSON.stringify({last:last.health,shots:f.events.filter(event=>event.name==='shotFired')}));
  assert.equal(f.events.filter(event=>event.name==='armorReward').length,0);
  for(const [i,user] of f.users.entries())assert.equal(user.armor.items.length,before[i]);
  assert.equal(queued.armor.items.length,queuedCount);
  p.dashCoastRemaining=.3;
  f.game.floorState.phase='riding';f.game.floorState.startedAt=f.now-100000;f.game.runBotsTick();
  assert.equal(f.game.gameMap.floor,6);
  assert.equal(downed.alive,true);assert.ok(downed.health>101);
  assert.ok(f.game.activePlayers.some(player=>player.id==='queued'&&player.armorStats.health>0));
  assert.equal(queued.armor.items.length,queuedCount);
  assert.equal(p.dashCoastRemaining,0,'floor transfer clears the previous room momentum');
});

test('air dash is time-based, directional, collision-safe, and unavailable to grounded or PvP players',()=>{
  const map={width:1000,height:1000,ceiling:10,mode:'pve',terrain:[]};
  const player=()=>({alive:true,x:200,y:400,height:1,groundHeight:0,ceilingHeight:10,
    angle:0,jumpStartedAt:1000,jumpBase:0,jumpVelocity:7.24,armorStats:{airDash:true}});
  const wall={x:250,y:0,width:8,height:1000,top:10};
  for(const fps of [30,60,144]) {
    const p=player();let now=1100;
    for(let i=0;i<Math.round(.3*fps);i++) {
      now+=1000/fps;movement.applyMovementInput(p,{dx:1,dy:0,dt:1/fps,dash:i===0},map,[wall],now);
      assert.ok(p.x<=wall.x-16+.001,'dash never tunnels through a wall');
    }
    assert.equal(p.dashRemaining,0);assert.equal(p.dashUsedInAir,true);
  }
  const p=player();
  movement.applyMovementInput(p,{dx:0,dy:-1,dt:.05,dash:true},map,[],1150);
  assert.ok(Math.abs(p.y-378)<1e-8);assert.equal(p.x,200);
  const ready=p.dashReadyAt;
  movement.applyMovementInput(p,{dx:0,dy:-1,dt:.05,dash:true},map,[],1200);
  assert.equal(p.dashReadyAt,ready,'held or repeated input does not restart the dash');
  const grounded={...player(),height:0,jumpStartedAt:null};
  movement.applyMovementInput(grounded,{dx:0,dy:0,dt:.05,dash:true},map,[],1150);
  assert.equal(grounded.dashRemaining,0);assert.equal(grounded.dashReadyAt,undefined);
  const pvp=player();movement.applyMovementInput(pvp,{dx:1,dy:0,dt:.05,dash:true},{...map,mode:'pvp'},[],1150);
  assert.ok(Math.abs(pvp.x-208.5)<1e-8);assert.equal(pvp.dashRemaining,0);
});

test('dash momentum coasts smoothly after the burst, with equal distance at different frame rates',()=>{
  const map={width:2000,height:2000,ceiling:10,mode:'pve',terrain:[]};
  const player=()=>({alive:true,x:200,y:400,height:1,groundHeight:0,ceilingHeight:10,
    angle:0,jumpStartedAt:1000,jumpBase:0,jumpVelocity:7.24,armorStats:{airDash:true}});
  for(const fps of [30,60,144])for(const moving of [false,true]) {
    const p=player();let elapsed=0;
    while(elapsed<1-1e-10) {
      const dt=Math.min(1/fps,1-elapsed),first=elapsed===0;elapsed+=dt;
      movement.applyMovementInput(p,{dx:moving?1:0,dy:0,dt,dash:first},map,[],1150+elapsed*1000);
    }
    // The 0.18s burst is followed by 0.45s of linear velocity decay, then walking.
    const expected=moving?279.35:178.2;
    assert.ok(Math.abs(p.x-200-expected)<1e-6,`${fps} FPS, moving=${moving}: consistent coast distance`);
    assert.equal(p.dashCoastRemaining,0);
  }
  const p=player();
  for(let i=0;i<18;i++)movement.applyMovementInput(p,{dx:1,dy:0,dt:.01,dash:i===0},map,[],1150+i*10);
  assert.ok(p.dashRemaining<1e-8);
  let previousSpeed=440;
  for(let i=0;i<45;i++) {
    const before=p.x;
    movement.applyMovementInput(p,{dx:1,dy:0,dt:.01},map,[],1330+i*10);
    const speed=(p.x-before)/.01;
    assert.ok(speed<previousSpeed&&previousSpeed-speed<6.1,'speed eases down without an abrupt cutoff');
    previousSpeed=speed;
  }
  assert.ok(previousSpeed>170&&previousSpeed<174,'coast ends at normal movement speed');
  const steering={...player(),dashX:1,dashY:0,dashRemaining:0,dashCoastRemaining:.3};
  movement.applyMovementInput(steering,{dx:0,dy:1,dt:.05},map,[],1300);
  assert.ok(steering.x>200&&steering.y>400,'coasting retains momentum while accepting a new direction');
});

test('dash coast respects walls and clears on contact, inside elevators, and outside PvE',()=>{
  const map={width:1000,height:1000,ceiling:10,mode:'pve',terrain:[]};
  const player=()=>({alive:true,x:200,y:400,height:1,groundHeight:0,ceilingHeight:10,
    angle:0,jumpStartedAt:1000,jumpBase:0,jumpVelocity:7.24,armorStats:{airDash:true},
    dashRemaining:0,dashCoastRemaining:.45,dashX:1,dashY:0});
  const wall={x:240,y:0,width:2,height:1000,top:10},p=player();
  for(let i=0;i<3;i++)movement.applyMovementInput(p,{dx:0,dy:0,dt:.05},map,[wall],1200+i*50);
  assert.ok(p.x<=wall.x-16+.001);assert.equal(p.dashCoastRemaining,0);
  const stoppedX=p.x;
  movement.applyMovementInput(p,{dx:0,dy:0,dt:.05},map,[],1350);
  assert.equal(p.x,stoppedX,'blocked momentum cannot return after clearing the obstacle');
  const diagonal={...player(),dashX:Math.SQRT1_2,dashY:Math.SQRT1_2};
  for(let i=0;i<3;i++)movement.applyMovementInput(diagonal,{dx:0,dy:0,dt:.05},map,[wall],1200+i*50);
  assert.ok(diagonal.y>430&&diagonal.x<=wall.x-16+.001,'diagonal coast slides along the wall');
  assert.equal(diagonal.dashX,0);assert.ok(diagonal.dashY>0);
  for(const scenario of ['pvp','unequipped','cabin']) {
    const p=player(),world={...map,mode:scenario==='pvp'?'pvp':'pve'};
    if(scenario==='unequipped')p.armorStats={};
    const cabin=scenario==='cabin'?{x:100,y:300,width:200,height:200,ceiling:5}:null;
    movement.applyMovementInput(p,{dx:0,dy:0,dt:.05},world,[],1200,cabin);
    assert.equal(p.x,200,scenario);assert.equal(p.dashCoastRemaining,0,scenario);
  }
});

test('dash commands replay through prediction and cannot be replayed twice after acknowledgment',()=>{
  const map={width:1000,height:1000,ceiling:10,mode:'pve',terrain:[]};
  const prediction=new InputPrediction();prediction.reset(1100);
  const authority={alive:true,x:200,y:400,angle:0,height:1,groundHeight:0,ceilingHeight:10,
    jumpStartedAt:1000,jumpBase:0,jumpVelocity:7.24,armorStats:{airDash:true},lastProcessedInput:0};
  const local={...authority};
  const command=prediction.record(1,0,.05,false,0,true);prediction.time+=50;
  movement.applyMovementInput(local,command,map,[],prediction.time);
  const replay={...authority};prediction.reconcile(replay,local,1100,(p,input,now)=>movement.applyMovementInput(p,input,map,[],now));
  assert.equal(replay.x,local.x);assert.equal(replay.dashRemaining,local.dashRemaining);
  replay.lastProcessedInput=command.seq;
  prediction.reconcile(replay,local,1150,(p,input,now)=>movement.applyMovementInput(p,input,map,[],now));
  assert.equal(replay.x,local.x);assert.equal(prediction.pending.length,0);
});

test('air-dash prediction stays continuous through real server snapshots at 150–300 ms RTT',t=>{
  for(const rtt of [150,300]) {
    const f=match(t,{set:'vector',exotic:true}),p=f.humans[0],game=f.game;
    game.gameWalls.length=0;game.gameMap.terrain.length=0;
    game.activePlayers.filter(player=>player.isBot).forEach(bot=>{bot.alive=false;});
    Object.assign(p,{x:300,y:400,height:0,groundHeight:0,ceilingHeight:10});
    let client={...p};const ideal={...p},prediction=new InputPrediction(),queue=[];
    prediction.reset(f.now);
    const inputs=(target,input,now)=>movement.applyMovementInput(target,input,game.gameMap,[],now);
    let consumed=f.events.length,maxCorrection=0;
    for(let elapsed=10;elapsed<=1600;elapsed+=10) {
      f.advance(10);prediction.time+=10;
      const input=prediction.record(1,0,.01,elapsed===200,0,elapsed===320);
      inputs(client,input,prediction.time);inputs(ideal,input,f.now);
      if(elapsed%40===0) {
        const batch=prediction.outgoing();
        queue.push({at:f.now+rtt/2,run:()=>f.handlers.playerUpdate({angle:0,inputs:batch})});
      }
      for(let i=0;i<queue.length;) {
        if(queue[i].at<=f.now)queue.splice(i,1)[0].run();else i++;
      }
      if(elapsed%50===0) {
        game.runBotsTick();
        for(const event of f.events.slice(consumed))if(event.name==='gameState') {
          const state=event.data.find(player=>player.id===p.id),serverNow=event.meta.serverNow;
          queue.push({at:f.now+rtt/2,run:()=>{
            const previous=client;client={...client,...state};
            prediction.reconcile(client,previous,serverNow,inputs);
            maxCorrection=Math.max(maxCorrection,Math.abs(client.x-previous.x));
          }});
        }
        consumed=f.events.length;
      }
      assert.ok(Math.abs(client.x-ideal.x)<1e-6,`continuous predicted travel at ${rtt} ms, t=${elapsed}`);
    }
    assert.ok(maxCorrection<1e-6,`no backward dash corrections at ${rtt} ms RTT`);
    game.close();
  }
});

test('every armor fitting has finite geometry, stays compact, and batches to at most three draws',()=>{
  for(const definition of Object.values(armor.CATALOG)) {
    const group=createArmorFitting(definition.key),bounds=new THREE.Box3().setFromObject(group);
    assert.ok(!bounds.isEmpty());
    assert.ok(bounds.max.x-bounds.min.x<.8,`${definition.key} remains fitted to the base character`);
    assert.ok(group.children.length<=3);
    let triangles=0;
    group.traverse(object=>{if(!object.isMesh)return;
      const positions=object.geometry.attributes.position.array;
      assert.ok([...positions].every(Number.isFinite));
      triangles+=(object.geometry.index?.count||positions.length/3)/3;
      object.geometry.dispose();object.material.dispose();
    });
    assert.ok(triangles<15000,`${definition.key} geometry stays bounded`);
  }
});
