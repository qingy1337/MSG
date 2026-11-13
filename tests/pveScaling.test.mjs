import {test} from 'node:test';
import assert from 'node:assert/strict';
import server from '../game/gameServer.js';
import maps from '../public/arenaMap.js';
import floors from '../public/floors.js';

function start(humans,floor=1) {
  const handlers={},events=[];
  const io={emit(name,data){events.push({name,data});},to(){return this;},socketsLeave(){}};
  const game=server.createGameServer(io,{attachConnections:false,manageRooms:false});
  const leader={id:'p0',user:{username:'qing'},on(name,fn){handlers[name]=fn;},off(){}};
  game.registerSocketHandlers(leader);
  for(let index=0;index<humans;index++)game.waitingPlayers.push({id:`p${index}`,name:`Player ${index}`,
    weapon:'autoRifle',primaryWeapon:'autoRifle',secondaryWeapon:'pistol'});
  game.handleStartGame(leader,{enableBots:true,startFloor:floor});
  return {game,handlers,events};
}

const bots=game=>game.activePlayers.filter(player=>player.isBot);
function composition(game) {
  const counts={soldier:0,ogre:0,dread:0,guardian:0};
  for(const bot of bots(game))counts[bot.botType]++;
  return counts;
}

test('PvE multiplies every enemy type by deployed fireteam size, preserving solo stats',t=>{
  t.mock.method(global,'setInterval',()=>null);
  let seed=42;
  t.mock.method(Math,'random',()=>seed/0x100000000);
  const waves=[
    [1,{soldier:4,ogre:0,dread:0,guardian:0}],
    [5,{soldier:7,ogre:1,dread:0,guardian:0}],
    [20,{soldier:19,ogre:4,dread:0,guardian:0}],
    [21,{soldier:16,ogre:4,dread:3,guardian:0}],
    [41,{soldier:15,ogre:4,dread:3,guardian:1}],
    [55,{soldier:13,ogre:4,dread:3,guardian:3}],
    [60,{soldier:13,ogre:4,dread:3,guardian:3}],
  ];
  for(const layoutSeed of [7,42,731])for(const [floor,solo] of waves) {
    seed=layoutSeed;
    const soloStats=new Map();
    for(const size of [1,2,3,4]) {
      const {game}=start(size,floor);
      try {
        const label=`floor ${floor}, ${size} players, seed ${layoutSeed}`;
        assert.deepEqual(composition(game),Object.fromEntries(Object.entries(solo).map(([type,count])=>[type,count*size])),label);
        const solids=[...game.gameWalls,...game.gameMap.terrain];
        for(const bot of bots(game)) {
          const stats={health:bot.health,maxHealth:bot.maxHealth,moveScale:bot.moveScale,weapon:bot.weapon,rank:bot.botRank};
          if(size===1)soloStats.set(bot.botType,stats);
          assert.deepEqual(stats,soloStats.get(bot.botType),`${label}: ${bot.botType} stats`);
          assert.ok(maps.canOccupy(bot.x,bot.y,bot.height+(bot.hoverOffset||0),solids,bot.bodyRadius,.001,bot.bodyHeight),
            `${label}: ${bot.botType} has body clearance`);
          assert.ok(bots(game).every(other=>other===bot||
            Math.hypot(other.x-bot.x,other.y-bot.y)>other.bodyRadius+bot.bodyRadius+8),`${label}: no stacked spawns`);
        }
      } finally {game.close();}
    }
  }
});

test('late joining, deaths, departures and retry scale only newly started PvE floors',t=>{
  let now=100000;
  t.mock.method(global,'setInterval',()=>null);
  t.mock.method(Date,'now',()=>now);
  t.mock.method(Math,'random',()=>42/0x100000000);
  const {game,handlers}=start(2,41);
  try {
    const originalBots=bots(game).map(bot=>bot.id);
    const late={id:'late',user:{username:'late'},emit(){}};
    assert.ok(game.queueLatePveJoin(late,{weapon:'sniper'}));
    assert.deepEqual(bots(game).map(bot=>bot.id),originalBots,'joining does not enlarge a live encounter');
    const teammate=game.activePlayers.find(player=>player.id==='p1');
    teammate.alive=false;teammate.health=0;
    assert.deepEqual(bots(game).map(bot=>bot.id),originalBots,'death does not shrink a live encounter');
    for(const bot of bots(game))bot.alive=false;
    const leader=game.activePlayers.find(player=>player.id==='p0'),exit=game.gameMap.elevator;
    Object.assign(leader,{x:exit.x+exit.width/2,y:exit.y+exit.height/2});
    game.floorState.phase='ready';game.floorState.startedAt=now-floors.LIFT_TIMING.open;
    game.runBotsTick();assert.equal(game.floorState.phase,'riding');
    now+=floors.LIFT_TIMING.close+floors.LIFT_TIMING.travel;game.runBotsTick();
    assert.equal(game.gameMap.floor,42);
    assert.equal(teammate.alive,true);
    assert.deepEqual(composition(game),{soldier:45,ogre:12,dread:9,guardian:3},'revived and newly deployed teammates both count');
    const expandedBots=bots(game).map(bot=>bot.id);
    game.handleDisconnect(late);
    assert.deepEqual(bots(game).map(bot=>bot.id),expandedBots,'leaving does not remove live enemies');
    for(const player of game.activePlayers)if(!player.isBot){player.alive=false;player.health=0;}
    game.runBotsTick();assert.equal(game.floorState.phase,'wiped');
    const seed=game.gameMap.seed;
    handlers.retryFloor();
    assert.equal(game.gameMap.seed,seed);
    assert.deepEqual(composition(game),{soldier:30,ogre:8,dread:6,guardian:2},'retry uses the remaining two-player team');
    game.handleDisconnect({id:'p1'});
    leader.alive=false;leader.health=0;game.runBotsTick();handlers.retryFloor();
    assert.deepEqual(composition(game),{soldier:15,ogre:4,dread:3,guardian:1},'a solo retry returns to the original solo roster');
  } finally {game.close();}
});
