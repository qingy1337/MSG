const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

// This suite must never write rewards into the real player database.
const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'blocks-coins-'));
process.env.DATA_DIR=dataDir;
const {splitCoinReward}=require('../game/coinRewards');
const {usersByUsername}=require('../lib/userStore');
const {createGameServer}=require('../game/gameServer');

test('coin shares follow damage and preserve the whole bot reward',()=>{
  assert.deepEqual([...splitCoinReward(35,new Map([['alpha',10.5],['bravo',9.5]]))],
    [['alpha',18],['bravo',17]]);
  assert.deepEqual([...splitCoinReward(15,new Map([['alpha',50],['bravo',50]]))],
    [['alpha',8],['bravo',7]]);
  assert.deepEqual([...splitCoinReward(5,new Map([['alpha',10],['bravo',0]]))],
    [['alpha',5]]);
  assert.deepEqual([...splitCoinReward(5,new Map())],[]);
});

test('PvE death awards damage shares rather than all coins to the finisher',t=>{
  t.mock.method(global,'setInterval',()=>0);
  const handlers={},sockets={},updates=[];
  let connect;
  const io={on:(_,fn)=>{connect=fn;},emit(){},socketsLeave(){},
    to:id=>({emit:(name,data)=>updates.push({id,name,data})})};
  const game=createGameServer(io);
  for(const id of ['alpha','bravo']) {
    const user={username:id,currencies:{Coins:0}};
    usersByUsername.set(id,user);
    sockets[id]={id,user,on:(name,fn)=>{(handlers[id]||={})[name]=fn;}};
    connect(sockets[id]);
    game.waitingPlayers.push({id,name:id,displayName:id,accountUsername:id,weapon:'pistol'});
  }
  try {
    game.handleStartGame(sockets.alpha,{enableBots:true});
    assert.equal(game.gameMap.mode,'pve');
    game.gameWalls.length=0;game.gameMap.terrain.length=0;
    const bot=game.activePlayers.find(player=>player.isBot);
    for(const other of game.activePlayers.filter(player=>player.isBot&&player!==bot))other.alive=false;
    Object.assign(bot,{x:200,y:100,height:0,health:20,maxHealth:20,botType:'dread',botRank:'captain'});
    for(const id of ['alpha','bravo'])Object.assign(game.activePlayers.find(player=>player.id===id),
      {x:100,y:100,height:0,weapon:id==='alpha'?'pistol':'sniper',lastShotAt:0});
    handlers.alpha.shoot({angle:0});
    assert.equal(bot.health,9.5);
    handlers.bravo.shoot({angle:0});
    assert.equal(bot.health,0);
    assert.equal(usersByUsername.get('alpha').currencies.Coins,18);
    assert.equal(usersByUsername.get('bravo').currencies.Coins,17);
    assert.equal(usersByUsername.get('alpha').stats?.pveKills??0,0);
    assert.equal(usersByUsername.get('bravo').stats.pveKills,1);
    assert.equal(updates.filter(item=>item.name==='coinsUpdated').length,2);
  } finally {
    game.close();usersByUsername.clear();
    fs.rmSync(dataDir,{recursive:true,force:true});
  }
});
