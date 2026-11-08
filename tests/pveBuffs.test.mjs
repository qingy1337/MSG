import {test} from 'node:test';
import assert from 'node:assert/strict';
import buffs from '../game/pveBuffs.js';
import server from '../game/gameServer.js';

test('room buffs roll at about five percent with all four choices represented',()=>{
  const counts=new Map();
  for(let seed=0;seed<100000;seed++) {
    const value=buffs.rollPveBuff(seed,7);
    assert.ok(value===null||buffs.BUFFS.includes(value));
    counts.set(value,(counts.get(value)||0)+1);
    assert.equal(buffs.rollPveBuff(seed,7),value,'same room keeps its buff on retry');
  }
  const buffed=100000-(counts.get(null)||0);
  assert.ok(buffed>4700&&buffed<5300,`expected approximately five percent, got ${buffed}`);
  for(const kind of buffs.BUFFS)assert.ok((counts.get(kind)||0)>1000,`${kind} can appear`);
});

test('rapid fire halves cooldown and leaves ordinary cooldowns alone',()=>{
  assert.equal(buffs.weaponCooldown(1100,'rapidFire'),550);
  assert.equal(buffs.weaponCooldown(75,'automaticPistol'),75);
  assert.equal(buffs.weaponCooldown(0,'rapidFire'),0);
});

function runningFloor(t) {
  let now=100000,connect;
  t.mock.method(global,'setInterval',()=>0);
  t.mock.method(Date,'now',()=>now);
  const events=[],handlers={};
  const io={on(_,fn){connect=fn;},emit(name,data){events.push({name,data});},
    to(){return this;},socketsLeave(){}};
  const game=server.createGameServer(io);
  connect({id:'p0',on(name,fn){handlers[name]=fn;}});
  game.waitingPlayers.push({id:'p0',name:'Tester',weapon:'sniper'});
  handlers.startGame({enableBots:true});
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
