import {test} from 'node:test';
import assert from 'node:assert/strict';
import nav from '../game/navigation.js';
import service from '../game/navigationService.js';
import snapshots from '../game/snapshots.js';
import server from '../game/gameServer.js';
import {SnapshotMotion} from '../public/snapshotMotion.mjs';
import {FrameBudget} from '../public/frameBudget.mjs';
const map={width:640,height:480,ceiling:7.5,terrain:[]};
test('adaptive resolution lowers sustained slow frames, recovers gradually, and stays bounded',()=>{
  const budget=new FrameBudget();assert.equal(budget.scale,1);
  for(let i=0;i<300;i++)budget.sample(33.3);
  assert.equal(budget.scale,0.65);
  for(let i=0;i<100;i++)budget.sample(16.67);
  assert.equal(budget.scale,0.65,'no immediate resolution oscillation');
  for(let i=0;i<2400;i++)budget.sample(16.67);
  assert.equal(budget.scale,1.25);
  assert.equal(budget.sample(NaN),false);assert.equal(budget.sample(10000),false);
});
test('performance probes return server timing and are rate limited',t=>{
  let connect,tick,now=100000;
  t.mock.method(global,'setInterval',fn=>{tick=fn;return null;});t.mock.method(Date,'now',()=>now);
  const handlers={},io={on(_,fn){connect=fn;},emit(){}};
  const game=server.createGameServer(io);connect({id:'p',on(n,fn){handlers[n]=fn;}});
  try {
    tick();let replies=0;
    const reply=data=>{replies++;assert.ok(Number.isFinite(data.tickMs)&&data.tickMs>=0);};
    handlers.networkProbe(reply);handlers.networkProbe(reply);assert.equal(replies,1);
    now+=1000;handlers.networkProbe(reply);assert.equal(replies,2);
  }finally{game.close();}
});

test('cached worker graph routes around walls and reuses directional edges',()=>{
  const graph=new nav.NavigationGraph(map,[{x:280,y:0,width:24,height:300,top:7.5}]);
  const start={x:100,y:100,height:0},goal={x:500,y:100},path=graph.find(start,goal);
  assert.ok(path.length>2);assert.ok(path.some(p=>p.y>316));
  for(let i=1;i<path.length;i++)assert.ok(graph.clear(path[i-1],path[i]));
  const checks=graph.edgeChecks;assert.deepEqual(graph.find(start,goal),path);assert.equal(graph.edgeChecks,checks);
  const sealed=new nav.NavigationGraph(map,[{x:280,y:0,width:24,height:480,top:7.5}]);
  assert.deepEqual(sealed.find(start,goal),[]);
});
test('worker graph uses stairs but rejects elevated vertical sides and cargo shafts',()=>{
  const terrain=[{kind:'tower',walkable:true,x:320,y:160,width:200,height:180,top:3},
    {kind:'ramp',stairs:true,steps:17,axis:'x',x:100,y:200,width:220,height:100,top:3},
    {kind:'lift',x:440,y:340,width:80,height:80,top:0,maxTop:3}];
  const graph=new nav.NavigationGraph({...map,terrain},[]);
  const start={x:70,y:250,height:0},path=graph.find(start,{x:400,y:250});
  assert.ok(path.length);assert.ok(path.some(p=>p.x>130&&p.x<320));
  for(let i=1;i<path.length;i++)assert.ok(graph.clear(path[i-1],path[i]));
  assert.equal(graph.clear({x:400,y:100,height:0},{x:400,y:250}),false);
  assert.equal(graph.clear({x:480,y:440,height:0},{x:480,y:370}),false);
});
test('navigation service bounds work, drops old floor results and closes workers',async()=>{
  const s=new service.NavigationService();s.configure(map,[]);
  try {
    let stale=false;
    assert.equal(s.request({id:'a',x:100,y:100},{x:500,y:100},()=>{stale=true;}),true);
    assert.equal(s.request({id:'a',x:100,y:100},{x:500,y:100},()=>{}),false);
    s.configure(map,[]);s.beginTick();
    const path=await new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(new Error('worker timed out')),5000);
      s.request({id:'b',x:100,y:100},{x:500,y:100},p=>{clearTimeout(timeout);resolve(p);});
      s.request({id:'c',x:100,y:150},{x:500,y:150},()=>{});
      assert.equal(s.request({id:'d',x:100,y:200},{x:500,y:200},()=>{}),false);
    });
    assert.ok(path.length);assert.equal(stale,false);
  } finally{s.close();}assert.equal(s.worker,null);assert.equal(s.pending.size,0);
});
test('snapshots omit private AI state and retain independent combat/movement data',()=>{
  const p={id:'a',x:10,y:20,height:3,health:50,botState:{squadPath:Array(1000).fill({x:1,y:1})},accountUsername:'secret',
    knockback:{start:1,vx:2},ogreAttack:{kind:'laser',beam:{endX:200}},
    dreadAttack:{phase:'charge',targetId:'human',progress:.5}};
  const out=snapshots.playerSnapshot(p);
  assert.equal(out.botState,undefined);assert.equal(out.accountUsername,undefined);
  assert.equal(out.height,3);p.ogreAttack.beam.endX=400;assert.equal(out.ogreAttack.beam.endX,200);
  p.dreadAttack.progress=1;assert.equal(out.dreadAttack.progress,.5);
  assert.ok(JSON.stringify(out).length<JSON.stringify(p).length/10);
  const frame=snapshots.playerFrame({...p,name:'Static name',color:'#fff',team:'bots'});
  assert.equal(frame.name,undefined);assert.equal(frame.color,undefined);assert.equal(frame.team,undefined);
  assert.equal(frame.id,'a');assert.equal(frame.height,3);assert.equal(frame.health,50);
});
test('many movement/damage updates produce at most one state snapshot per tick',t=>{
  let tick,connect,now=100000;
  t.mock.method(global,'setInterval',fn=>{tick=fn;return null;});t.mock.method(Date,'now',()=>now);
  const events=[],handlers={},io={on(_,fn){connect=fn;},emit(name,data,meta){events.push({name,data,meta});},socketsLeave(){},to(){return this;}};
  const game=server.createGameServer(io);connect({id:'p',on(n,fn){handlers[n]=fn;}});
  game.waitingPlayers.push({id:'p',name:'P',weapon:'miniGun'});handlers.startGame({enableBots:true});
  try {
    game.gameWalls.length=0;game.gameMap.terrain.length=0;
    const human=game.activePlayers.find(p=>!p.isBot),bot=game.activePlayers.find(p=>p.isBot);
    Object.assign(human,{x:300,y:300,height:0});Object.assign(bot,{x:400,y:300,height:0,health:10000});
    for(let i=0;i<20;i++){now+=11;handlers.playerUpdate({x:300,y:300,angle:0});handlers.shoot({angle:0});}
    assert.equal(events.filter(e=>e.name==='gameState').length,0);
    tick();const states=events.filter(e=>e.name==='gameState');assert.equal(states.length,1);
    assert.ok(states[0].data.every(p=>!('botState' in p)));assert.ok(states[0].meta.sequence>0);
  }finally{game.close();}
});
test('remote interpolation handles gaps, yaw wrapping, teleports, and resets without delaying local input',()=>{
  const motion=new SnapshotMotion(75),a={id:'a',alive:true,x:0,y:0,height:0,angle:3.1},local={...a,id:'local'};
  motion.push([a,local],100);const b={...a,x:10,height:1,angle:-3.1};motion.push([b,local],150);
  const rendered=motion.sample([b,local],'local',200);
  assert.equal(rendered[0].x,5);assert.equal(rendered[0].height,0.5);assert.ok(Math.abs(rendered[0].angle-Math.PI)<0.001);
  assert.equal(rendered[1],local);assert.equal(motion.sample([b],'local',1000)[0].x,10,'no extrapolation on packet loss');
  const teleport={...b,x:800};motion.push([teleport],200);assert.equal(motion.sample([teleport],'local',250)[0].x,800);
  for(let i=0;i<100;i++)motion.push([b],250+i*50);assert.equal(motion.frames.length,8);
  motion.clear();assert.equal(motion.frames.length,0);
});
