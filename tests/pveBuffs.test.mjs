import {test} from 'node:test';
import assert from 'node:assert/strict';
import buffs from '../game/pveBuffs.js';
import server from '../game/gameServer.js';

test('room buffs roll at about ten percent with all four choices represented',()=>{
  const counts=new Map();
  for(let seed=0;seed<100000;seed++) {
    const value=buffs.rollPveBuff(seed,7);
    assert.ok(value===null||buffs.BUFFS.includes(value));
    counts.set(value,(counts.get(value)||0)+1);
    assert.equal(buffs.rollPveBuff(seed,7),value,'same room keeps its buff on retry');
  }
  const buffed=100000-(counts.get(null)||0);
  assert.ok(buffed>9700&&buffed<10300,`expected approximately ten percent, got ${buffed}`);
  for(const kind of buffs.BUFFS)assert.ok((counts.get(kind)||0)>2000,`${kind} can appear`);
});

test('rapid fire halves cooldown and leaves ordinary cooldowns alone',()=>{
  assert.equal(buffs.weaponCooldown(1100,'rapidFire'),550);
  assert.equal(buffs.weaponCooldown(75,'automaticPistol'),75);
  assert.equal(buffs.weaponCooldown(0,'rapidFire'),0);
});

function runningFloor(t,loadout={},enableBots=true,pvpPerks=false) {
  let now=100000,connect;
  t.mock.method(global,'setInterval',()=>0);
  t.mock.method(Date,'now',()=>now);
  if(!enableBots)t.mock.method(Math,'random',()=>29/0x100000000);
  const events=[],handlers={};
  const io={on(_,fn){connect=fn;},emit(name,data){events.push({name,data});},
    to(){return this;},socketsLeave(){}};
  const game=server.createGameServer(io);
  connect({id:'p0',on(name,fn){handlers[name]=fn;}});
  game.waitingPlayers.push({id:'p0',name:'Tester',weapon:'sniper',...loadout});
  if(!enableBots)game.waitingPlayers.push({id:"p1",name:"Opponent",weapon:"autoRifle"});
  handlers.startGame({enableBots,pvpPerks});
  return {game,handlers,events,player:game.activePlayers.find(value=>value.id==='p0'),
    advance(ms){now+=ms;}};
}

test('rapid fire and infinite grenades affect authoritative PvE actions',t=>{
  const {game,handlers,events,player,advance}=runningFloor(t);
  try {
    game.floorState.buff='rapidFire';
    handlers.shoot({angle:0,pitch:0});
    assert.equal(events.filter(value=>value.name==='shotFired').length,1);
    advance(549);handlers.shoot({angle:0,pitch:0});
    assert.equal(events.filter(value=>value.name==='shotFired').length,1);
    advance(1);handlers.shoot({angle:0,pitch:0});
    assert.equal(events.filter(value=>value.name==='shotFired').length,2);

    game.floorState.buff='infiniteGrenades';
    player.grenades=3;
    handlers.grenadeCharge();handlers.throwGrenade({angle:0,pitch:0});
    handlers.grenadeCharge();handlers.throwGrenade({angle:0,pitch:0});
    assert.equal(player.grenades,3);
    assert.equal(events.filter(value=>value.name==='grenadeThrown').length,2);
  } finally {game.close();}
});

test('automatic pistol is available only during its PvE room buff',t=>{
  const {game,handlers,player}=runningFloor(t);
  try {
    game.floorState.buff=null;
    player.weapon='pistol';
    handlers.automaticFireStart({angle:0,pitch:0});
    assert.equal(player.automaticFire,undefined);
    game.floorState.buff='automaticPistol';
    handlers.automaticFireStart({angle:0,pitch:0});
    assert.equal(player.automaticFire?.weapon,'pistol');
    handlers.automaticFireStop();
    assert.equal(player.automaticFire,null);
  } finally {game.close();}
});

test('Afterburn banks actual damage, waits for a new spin, and expires while holstered',t=>{
  const skin='miniGun_ashes_and_dust';
  const {game,handlers,player,events,advance}=runningFloor(t,{
    weapon:'miniGun',weaponSkinKey:skin,primaryWeapon:'miniGun',primaryWeaponSkinKey:skin
  });
  try {
    const aim={angle:0,pitch:0};
    assert.equal(player.ashCharge,0);
    assert.equal(events.find(e=>e.name==='gameStarting').data.players.find(p=>p.id===player.id).ashCharge,0);
    game.floorState.buff=null;
    game.gameWalls.length=0;
    game.gameMap.terrain=[];
    const enemy=game.activePlayers.find(p=>p.isBot);
    game.activePlayers.splice(0,game.activePlayers.length,player,enemy);
    const align=()=>{
      Object.assign(player,{x:300,y:300,height:0,groundHeight:0});
      Object.assign(enemy,{x:335,y:300,height:0,groundHeight:0,knockback:null});
    };
    align();
    enemy.health=1000;
    const enemyInput={};
    game.connectSocket({id:enemy.id,on(name,fn){enemyInput[name]=fn;}});
    enemy.weapon='pistol';
    const before=player.health;
    enemyInput.shoot({angle:Math.PI});
    assert.ok(before>player.health);
    assert.ok(Math.abs(player.ashCharge-4*(before-player.health)/500)<1e-8);
    const incoming=player.ashCharge;
    handlers.automaticFireStart(aim);
    advance(225);game.runBotsTick();
    assert.equal(enemy.health,996);
    assert.ok(Math.abs(player.ashCharge-incoming-4/500)<1e-8);
    player.ashCharge=.999;
    align();advance(18);game.runBotsTick();
    assert.equal(player.ashCharge,1);
    align();advance(18);game.runBotsTick();
    assert.equal(player.ashUntil,0,'continuing the old burst keeps the charge banked');
    handlers.automaticFireStop();
    handlers.automaticFireStart(aim);advance(160);handlers.automaticFireStop();
    assert.equal(player.ashCharge,1,'an interrupted spin spends nothing');
    handlers.automaticFireStart(aim);
    align();advance(225);
    const normal=enemy.health;
    game.runBotsTick();
    assert.equal(normal-enemy.health,6);
    assert.equal(player.ashCharge,0);
    assert.equal(player.ashUntil,Date.now()+10000);
    assert.ok(events.filter(e=>e.name==='shotsFired').flatMap(e=>e.data).some(s=>s.ashEmpowered));
    assert.equal(events.filter(e=>e.name==='gameState').at(-1).data.find(p=>p.id===player.id).ashUntil,player.ashUntil);
    align();enemy.x=500;
    advance(18);game.runBotsTick();
    assert.equal(normal-enemy.health,9,'the next round hits for 3 at medium range');
    handlers.automaticFireStop();handlers.switchWeapon();
    advance(400);align();
    const beforePistol=enemy.health;
    handlers.shoot(aim);
    assert.equal(beforePistol-enemy.health,10.5);
    assert.equal(player.ashCharge,0);
    game.activePlayers.splice(0,game.activePlayers.length,player);
    player.health=10;
    advance(4600);game.runBotsTick();
    assert.equal(player.health,40,'5 seconds of ordinary and bonus regeneration');
    advance(6000);game.runBotsTick();
    assert.ok(Math.abs(player.health-74.982)<1e-6,'only the remaining 4.982 seconds earn bonus regeneration');
    game.activePlayers.push(enemy);align();
    handlers.shoot(aim);
    assert.ok(Math.abs(player.ashCharge-10.5/500)<1e-8,'the holstered weapon can charge again');
  } finally {game.close();}
});

test('the Ashes & Dust skin grants no charge or empowered rounds in PvP',t=>{
  const {game,handlers,player,advance,events}=runningFloor(t,{
    weapon:'miniGun',weaponSkinKey:'miniGun_ashes_and_dust'
  },false);
  try {
    const enemy=game.activePlayers.find(p=>p!==player);
    advance(6100);
    Object.assign(player,{x:300,y:300,height:0,groundHeight:0});
    Object.assign(enemy,{x:335,y:300,height:0,groundHeight:0});
    game.gameWalls.length=0;game.gameMap.terrain=[];
    const aim={angle:0,pitch:0,ashCharge:1,ashEmpowered:true};
    handlers.automaticFireStart(aim);
    advance(225);game.runBotsTick();
    assert.equal(enemy.health,97);
    assert.equal(player.ashCharge,undefined);
    assert.equal(events.filter(e=>e.name==='shotsFired').at(-1).data[0].ashEmpowered,undefined);
  } finally {game.close();}
});

test('Afterburn charges from PvP opponents and grants damage and healing in perk matches',t=>{
  const {game,handlers,player,advance,events}=runningFloor(t,{
    weapon:'miniGun',weaponSkinKey:'miniGun_ashes_and_dust'
  },false,true);
  t.after(()=>game.close());
  const enemy=game.activePlayers.find(p=>p!==player),enemyInput={};
  game.connectSocket({id:enemy.id,on(name,fn){enemyInput[name]=fn;}});
  game.gameWalls.length=0;game.gameMap.terrain=[];
  Object.assign(player,{x:300,y:300,height:0,groundHeight:0});
  Object.assign(enemy,{x:335,y:300,height:0,groundHeight:0,weapon:'pistol'});
  const aim={angle:0,pitch:0};
  enemyInput.shoot({angle:Math.PI,pitch:0});
  assert.equal(player.ashCharge,0,'the spawn shield prevents charge');
  advance(6100);
  enemyInput.shoot({angle:Math.PI,pitch:0});
  assert.equal(player.ashCharge,4*10.5/500);
  handlers.automaticFireStart(aim);advance(225);game.runBotsTick();
  assert.equal(enemy.health,97);
  assert.ok(Math.abs(player.ashCharge-(4*10.5+4)/500)<1e-8);
  handlers.automaticFireStop();player.ashCharge=1;
  handlers.automaticFireStart(aim);advance(225);game.runBotsTick();
  assert.equal(enemy.health,91);
  assert.equal(player.ashCharge,0);
  assert.ok(events.filter(e=>e.name==='shotsFired').at(-1).data[0].ashEmpowered);
  handlers.automaticFireStop();
  const before=player.health;
  advance(12000);game.runBotsTick();
  assert.equal(player.health,before+10,'only the ten seconds of Afterburn grant healing');
});

function cloudbreakRoom(t,pve=true,pvpPerks=false) {
  const room=runningFloor(t,{weapon:'miniGun',primaryWeapon:'miniGun',secondaryWeaponSkinKey:'pistol_cloudbreak'},pve,pvpPerks);
  const {game,player,handlers,advance,events}=room;
  t.after(()=>game.close());
  game.floorState.buff=null;
  game.gameWalls.length=0;
  game.gameMap.terrain=[];
  Object.assign(player,{x:300,y:300,height:0,groundHeight:0});
  const template=game.activePlayers.find(p=>p!==player);
  const targets=[300,346,426,506].map((y,i)=>({...template,id:'target'+i,x:390,y,
    alive:true,isBot:pve,health:80,maxHealth:80,height:0,groundHeight:0,botState:{}}));
  game.activePlayers.splice(0,game.activePlayers.length,player,...targets);
  handlers.switchWeapon();
  advance(6100);
  const shoot=()=>{
    handlers.shoot({angle:0,pitch:0,cloudbreakChain:[{id:targets[3].id}]});
    return events.filter(e=>e.name==='shotFired').at(-1).data;
  };
  return {...room,targets,shoot};
}

test('Cloudbreak chains every close pistol hit through two distinct nearby hostiles, even on a killing hit',t=>{
  const {game,player,targets,shoot,advance}=cloudbreakRoom(t);
  const ally={...player,id:'ally',x:390,y:325};
  const arriving={...targets[0],id:'arriving',x:390,y:330,spawnReadyAt:Date.now()+3000};
  game.activePlayers.push(ally,arriving);
  for(let i=0;i<2;i++) {
    if(i)targets[0].health=1;
    const shot=shoot();
    assert.equal(shot.targetId,targets[0].id);
    assert.deepEqual(shot.cloudbreakChain.map(hit=>hit.id),[targets[1].id,targets[2].id]);
    assert.deepEqual(targets.map(p=>p.health),[i?0:69.5,80-7*(i+1),80-4*(i+1),80]);
    advance(400);
  }
  assert.equal(ally.health,player.health);
  assert.equal(arriving.health,80);
});

test('walls, jump distance, trigger range and the equipped skin constrain Cloudbreak',t=>{
  const {game,player,targets,shoot,advance}=cloudbreakRoom(t);
  game.gameWalls.push({x:340,y:322,width:100,height:6,top:4});
  assert.equal(shoot().cloudbreakChain,undefined);
  game.gameWalls.length=0;
  player.x=120;
  advance(500);
  assert.equal(shoot().cloudbreakChain,undefined);
  player.x=300;
  targets[1].y=410;
  advance(500);
  assert.equal(shoot().cloudbreakChain,undefined);
  targets[1].y=346;
  player.weaponSkinKey='pistol_default';
  advance(500);
  assert.equal(shoot().cloudbreakChain,undefined);
  assert.deepEqual(targets.slice(1).map(target=>target.health),[80,80,80]);
});

test('Cloudbreak shoots ordinary single-target rounds in PvP',t=>{
  const {targets,shoot}=cloudbreakRoom(t,false);
  const shot=shoot();
  assert.equal(shot.targetId,targets[0].id);
  assert.equal(shot.cloudbreakChain,undefined);
  assert.deepEqual(targets.map(p=>p.health),[69.5,80,80,80]);
});

test('Cloudbreak in perk-enabled team PvP skips the shooter, teammates and shielded opponents',t=>{
  const {game,player,targets,shoot}=cloudbreakRoom(t,false,true);
  game.gameMap.pvpMode='teams';
  player.team='blue';
  targets.forEach(target=>{target.team='red';});
  game.activePlayers.push({...player,id:'ally',x:390,y:323});
  game.activePlayers.push({...targets[0],id:'shielded',y:330,spawnShieldUntil:Date.now()+1000});
  const shot=shoot();
  assert.equal(shot.targetId,targets[0].id);
  assert.deepEqual(shot.cloudbreakChain?.map(hit=>hit.id),[targets[1].id,targets[2].id]);
  assert.deepEqual(targets.map(p=>p.health),[69.5,73,76,80]);
  assert.equal(player.health,101);
  assert.equal(game.activePlayers.find(target=>target.id==='ally').health,101);
  assert.equal(game.activePlayers.find(target=>target.id==='shielded').health,80);
});
