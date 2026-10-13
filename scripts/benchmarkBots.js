// Headless server benchmark. No sockets, accounts, browser, or production state.
const {performance}=require('node:perf_hooks');
const {createGameServer}=require('../game/gameServer');
const {canOccupy}=require('../public/arenaMap');
const realInterval=global.setInterval,realNow=Date.now,realRandom=Math.random;
async function run(count,ogres=false){
  let tick,connect,now=100000,seed=731,bytes=0,emits=0,attacks=0;
  Math.random=()=>((seed=(1664525*seed+1013904223)>>>0)/4294967296);
  global.setInterval=fn=>{tick=fn;return null;};Date.now=()=>now;
  const handlers={},io={on(_,fn){connect=fn;},emit(name,data){if(name==='gameState'){emits++;bytes+=Buffer.byteLength(JSON.stringify(data));}},socketsLeave(){},to(){return this;}};
  const game=createGameServer(io);connect({id:'p',on(n,fn){handlers[n]=fn;}});
  game.waitingPlayers.push({id:'p',name:'Profiler',weapon:'pistol'});handlers.startGame({enableBots:true});
  try{
    const human=game.activePlayers.find(p=>!p.isBot),base=game.activePlayers.find(p=>p.isBot),solids=[...game.gameWalls,...game.gameMap.terrain];
    human.health=100000;
    const candidates=[];for(let y=350;y<1000;y+=65)for(let x=1200;x<1750;x+=65)if(canOccupy(x,y,0,solids))candidates.push({x,y});
    while(game.activePlayers.filter(p=>p.isBot).length<count){const i=game.activePlayers.length,b=structuredClone(base);
      Object.assign(b,{id:'bench-'+i,botState:{},squad:Math.floor(i/3),height:0,groundHeight:0},candidates[i%candidates.length]);game.activePlayers.push(b);
    }
    if(ogres){
      Object.assign(human,{x:game.gameMap.botSpawn.x+55,y:game.gameMap.botSpawn.y+80,height:0,groundHeight:0});
      game.activePlayers.filter(p=>p.isBot).slice(-4).forEach((b,i)=>{
        Object.assign(b,{botType:'ogre',bodyHeight:3.8,bodyRadius:30,eyeHeight:2.8,health:360,maxHealth:360,
          x:game.gameMap.botSpawn.x+(i%2)*110,y:game.gameMap.botSpawn.y+(i<2?0:165)});
        b.angle=Math.atan2(human.y-b.y,human.x-b.x);
      });
    }
    const times=[],loopDelays=[];let paths=0;bytes=0;emits=0;
    for(let i=0;i<120;i++){
      now+=50;
      human.health=100;human.alive=true;
      for(const b of game.activePlayers.filter(p=>p.isBot))b.botState.lastSeen={id:human.id,x:human.x,y:human.y,height:human.height||0,seenAt:now};
      const start=performance.now();tick();times.push(performance.now()-start);
      if(!game.gameInProgress.status||!human.alive)throw new Error('Benchmark match ended; timings would be invalid');
      attacks+=game.activePlayers.filter(p=>p.ogreAttack).length;
      await new Promise(resolve=>setTimeout(resolve,Math.max(0,50-(performance.now()-start))));
      loopDelays.push(Math.max(0,performance.now()-start-50));
    }
    paths=game.activePlayers.filter(p=>p.botState?.squadPath?.length).length;
    if(emits!==120)throw new Error(`Expected 120 active snapshots, got ${emits}`);
    times.sort((a,b)=>a-b);loopDelays.sort((a,b)=>a-b);
    console.log(JSON.stringify({bots:count,ogres:ogres?4:0,attackSnapshots:attacks,ticks:120,p50ms:+times[60].toFixed(2),p95ms:+times[114].toFixed(2),maxMs:+times[119].toFixed(2),over50ms:times.filter(t=>t>50).length,
      maxLoopDelayMs:+loopDelays[119].toFixed(2),stateBroadcasts:emits,kilobytesPerSimSecond:+(bytes/6/1024).toFixed(1),botsWithWorkerPaths:paths}));
  }finally{game.close();}
}
(async()=>{try{if(process.argv.includes('--ogres'))await run(24,true);else for(const count of [4,12,24])await run(count);}finally{global.setInterval=realInterval;Date.now=realNow;Math.random=realRandom;}})().catch(e=>{console.error(e);process.exitCode=1;});
