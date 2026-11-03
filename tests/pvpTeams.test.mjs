import {test} from 'node:test';
import assert from 'node:assert/strict';
import server from '../game/gameServer.js';
import maps from '../public/arenaMap.js';
import pvpMaps from '../public/pvpMaps.js';
import teams from '../public/pvpTeams.js';
import spawns from '../game/pvpTeamSpawns.js';
import {resolveViewPlayer} from '../public/arena3d.js';

test('every PvP map has collision-safe, separated team spawns at full capacity',()=>{
  const roster=Array.from({length:8},(_,i)=>({id:`p${i}`})),assignments=teams.balancedPvpTeams(roster);
  for(const id of pvpMaps.PVP_MAP_IDS)for(const seed of [11,29,47]) {
    const {map,walls}=maps.createPvpMap(seed,id);
    const plan=spawns.pvpTeamSpawns(map,walls,roster,assignments);
    assert.ok(plan,`${id} seed ${seed} fits both teams`);
    const placed=[...plan.values()];
    for(let i=0;i<placed.length;i++) {
      const p=placed[i];
      assert.ok(maps.canOccupy(p.x,p.y,p.height||0,[...walls,...map.terrain],16,.001,2.2),id);
      for(const other of placed.slice(i+1))assert.ok(Math.hypot(p.x-other.x,p.y-other.y)>=40,id);
    }
  }
});

function match(t) {
  let now=100000;
  t.mock.method(global,'setInterval',()=>0);t.mock.method(Date,'now',()=>now);
  const events=[],io={emit(name,data){events.push({name,data});},to(){return this;},socketsLeave(){}};
  const game=server.createGameServer(io,{attachConnections:false,manageRooms:false});
  const sockets=Array.from({length:4},(_,i)=>{
    const handlers={},socket={id:`p${i}`,user:{username:`team-test-${i}`},on(name,fn){handlers[name]=fn;},handlers,emit(){}};
    game.registerSocketHandlers(socket,{lobby:false,disconnect:false});
    game.handleJoin(socket,{weapon:'sniper'});return socket;
  });
  game.handleStartGame(sockets[0],{pvpMode:'teams'});
  assert.equal(game.gameInProgress.status,true);
  game.gameWalls.length=0;game.gameMap.terrain=[];
  now+=7000;
  game.activePlayers.forEach(p=>Object.assign(p,{height:0,groundHeight:0,spawnShieldUntil:0,
    x:100,y:400,health:101,angle:0}));
  t.after(()=>game.close());
  return {game,sockets,events,advance(ms){now+=ms;},player(i){return game.activePlayers.find(p=>p.id===`p${i}`);}};
}

test('piercing shots spare teammates and the whole surviving team wins',t=>{
  const m=match(t),{game,sockets,events}=m;
  Object.assign(m.player(0),{x:100,y:100});
  Object.assign(m.player(2),{x:180,y:100});
  Object.assign(m.player(1),{x:260,y:100});
  Object.assign(m.player(3),{x:340,y:100});
  sockets[0].handlers.shoot({angle:0,pitch:0});
  assert.equal(m.player(2).health,101);
  assert.equal(m.player(1).health,11);assert.equal(m.player(3).health,11);
  assert.ok(!events.some(e=>e.name==='gameOver'));
  m.advance(2000);sockets[0].handlers.shoot({angle:0,pitch:0});
  const result=events.find(e=>e.name==='gameOver')?.data;
  assert.equal(result?.team,'blue');assert.equal(result?.name,'Blue team');
  assert.equal(game.activePlayers.filter(p=>p.alive).length,2);
});

test('grenades spare teammates even after their thrower disconnects',t=>{
  const m=match(t),{game,sockets}=m;
  Object.assign(m.player(0),{x:100,y:250});
  Object.assign(m.player(2),{x:200,y:250});
  Object.assign(m.player(1),{x:200,y:250,health:1000});
  Object.assign(m.player(3),{x:700,y:450});
  sockets[0].handlers.grenadeCharge();sockets[0].handlers.throwGrenade({angle:0,pitch:0});
  game.handleDisconnect(sockets[0]);
  m.advance(3000);game.runBotsTick();
  assert.equal(m.player(2).health,101);
  assert.ok(m.player(1).health<1000);
});

test('losing every opponent to disconnection awards the surviving team victory',t=>{
  const {game,sockets,events}=match(t);
  game.handleDisconnect(sockets[1]);
  assert.ok(!events.some(e=>e.name==='gameOver'));
  game.handleDisconnect(sockets[3]);
  assert.equal(events.find(e=>e.name==='gameOver')?.data.team,'blue');
});

test('team spectators follow allies rather than reveal enemies',()=>{
  const local={id:'local',team:'blue',alive:false};
  const enemy={id:'enemy',team:'red',alive:true},ally={id:'ally',team:'blue',alive:true};
  assert.equal(resolveViewPlayer([local,enemy,ally],local.id),ally);
  assert.equal(resolveViewPlayer([local,enemy],local.id),null);
});
