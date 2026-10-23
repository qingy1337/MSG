import {test} from 'node:test';
import assert from 'node:assert/strict';
import server from '../game/gameServer.js';
import movement from '../public/inputMovement.js';
import {InputPrediction} from '../public/inputPrediction.mjs';
import maps from '../public/arenaMap.js';
import jumpPhysics from '../public/movement.js';
const {applyMovementInput}=movement;

test('Vault Annex conveyors carry grounded players in their visible direction',()=>{
  const {map,walls}=maps.createPvpMap(0,'vaultAnnex'),solids=[...walls,...map.terrain];
  const belts=map.terrain.filter(s=>s.kind==='vaultConveyor');
  assert.equal(belts.length,3);
  for(const [index,belt] of belts.entries()) {
    const player={alive:true,x:belt.x+belt.width/2,y:belt.y+belt.height/2,
      height:belt.top,groundHeight:belt.top,jumpStartedAt:null,bodyHeight:2.2};
    const before={x:player.x,y:player.y},dt=.05;
    applyMovementInput(player,{seq:index+1,dx:0,dy:0,dt,epoch:0},map,solids,1000);
    const alongX=belt.width>=belt.height,direction=belt.direction===-1?-1:1;
    assert.ok(Math.abs(player[alongX?'x':'y']-before[alongX?'x':'y']-
      (alongX?belt.width:belt.height)*belt.speed*direction*dt)<1e-6);
    assert.equal(player[alongX?'y':'x'],before[alongX?'y':'x']);

    const airborne={...player,x:before.x,y:before.y,height:belt.top+.4,groundHeight:belt.top,
      jumpStartedAt:900,jumpBase:belt.top,jumpVelocity:7.24};
    applyMovementInput(airborne,{seq:index+20,dx:0,dy:0,dt,epoch:0},map,solids,1000);
    assert.equal(airborne.x,before.x);assert.equal(airborne.y,before.y,
      'jumping detaches from conveyor transport');
  }
});

test('real server acknowledgments preserve movement at 0–500 ms RTT, jitter and snapshot loss',t=>{
  let now=100000,tick;
  t.mock.method(global,'setInterval',fn=>{tick=fn;return null;});t.mock.method(Date,'now',()=>now);
  for(const rtt of [0,100,150,200,300,500])for(const wall of [false,true]) {
    now=100000;let connect,client,live=false,upAt=0,downAt=0,emitted=0,maxCorrection=0,maxVerticalCorrection=0;
    const prediction=new InputPrediction();prediction.reset(now);
    const queue=[],handlers={};
    const enqueue=(fn,down=false)=>{
      const jitter=rtt?Math.sin(now*0.013)*30:0;
      const at=Math.max(now+Math.max(0,rtt/2+jitter),down?downAt:upAt);
      if(down)downAt=at;else upAt=at;queue.push({at,fn});
    };
    let game;
    const io={on(_,fn){connect=fn;},emit(name,data,meta){if(live&&name==='gameState'&&++emitted%5){
      const authoritative=data.find(p=>p.id==='p');
      enqueue(()=>{
        const before=client.x,beforeHeight=client.height,predicted=client;client={...authoritative};
        prediction.reconcile(client,predicted,meta.serverNow,(p,input,time)=>applyMovementInput(p,input,game.gameMap,game.gameWalls,time));
        maxCorrection=Math.max(maxCorrection,Math.abs(client.x-before));
        maxVerticalCorrection=Math.max(maxVerticalCorrection,Math.abs(client.height-beforeHeight));
      },true);
    }},socketsLeave(){},to(){return this;}};
    game=server.createGameServer(io);connect({id:'p',on(n,fn){handlers[n]=fn;}});
    game.waitingPlayers.push({id:'p',name:'Remote',weapon:'pistol'});handlers.startGame({enableBots:true});
    try {
      game.gameWalls.length=0;game.gameMap.terrain.length=0;
      if(wall)game.gameWalls.push({x:750,y:0,width:24,height:1200,top:7.5});
      for(const p of game.activePlayers)if(p.isBot)p.alive=false;
      const p=game.activePlayers.find(p=>p.id==='p');Object.assign(p,{x:400,y:400,height:0,groundHeight:0});
      client={...p};const ideal={...p};live=true;
      for(let elapsed=10;elapsed<=6000;elapsed+=10){
        now=100000+elapsed;prediction.time+=10;
        const dx=elapsed>4000?-1:1;
        const input=prediction.record(dx,0,0.01,elapsed===1010||elapsed===3010,0);
        applyMovementInput(client,input,game.gameMap,game.gameWalls,prediction.time);
        applyMovementInput(ideal,input,game.gameMap,game.gameWalls,now);
        if(elapsed%40===0){const inputs=prediction.outgoing();enqueue(()=>handlers.playerUpdate({inputs,angle:0}));}
        for(let i=0;i<queue.length;){if(queue[i].at<=now){const e=queue.splice(i,1)[0];e.fn();}else i++;}
        if(elapsed%50===0)tick();
        assert.ok(Math.abs(client.x-ideal.x)<0.001,`RTT ${rtt}, wall ${wall}, time ${elapsed}: prediction must match uninterrupted input`);
      }
      assert.ok(maxCorrection<0.001,`no backward snaps at RTT ${rtt}`);
      assert.ok(maxVerticalCorrection<0.025,`no jump height snaps at RTT ${rtt}: ${maxVerticalCorrection}`);
      assert.ok(prediction.pending.length<100,'acknowledged history gets discarded');
    }finally{game.close();}
  }
});

test('lift reconciliation samples current platform height before replay and never starts a false fall',()=>{
  const lift={kind:'lift',id:'cargo',x:100,y:100,width:120,height:120,top:0,maxTop:3.8};
  const map={width:500,height:500,ceiling:7.5,platformEpoch:100000,terrain:[lift]};
  const prediction=new InputPrediction();prediction.reset(103000);
  let player={id:'p',x:160,y:160,height:0,groundHeight:0,alive:true,platformId:'cargo',ceilingHeight:7.5};
  for(let now=103050;now<=112000;now+=50){
    maps.updateCargoLifts(map,[player],now);
    const expected=lift.top,before={...player};
    prediction.time=now;
    const input=prediction.record(0,0,0.05,false,0);
    const stale=maps.cargoLiftSample(lift,now-150,map.platformEpoch).height;
    const authoritative={...player,height:stale,groundHeight:stale,lastProcessedInput:input.seq-1};
    prediction.reconcile(authoritative,before,now-150,
      (p,i,time)=>applyMovementInput(p,i,map,[lift],time),
      p=>maps.updateCargoLifts(map,[p],now));
    player=authoritative;
    assert.equal(player.height,expected);
    assert.equal(player.jumpStartedAt,undefined,'snapshot must not detach rider into a fall');
    assert.equal(player.platformId,'cargo');
  }
});

test('jump continuity preserves elapsed phase but still accepts a changed ceiling or knockback',()=>{
  const prediction=new InputPrediction();prediction.reset(1200);
  const predicted={alive:true,height:1.028,jumpStartedAt:1000,jumpBase:0,jumpVelocity:7.24,jumpInputSeq:1,groundHeight:0,ceilingHeight:7.5};
  const authoritative={...predicted,height:0.6195,jumpStartedAt:1050};
  prediction.reconcile(authoritative,predicted,1100,()=>{});
  assert.equal(authoritative.height,predicted.height);
  assert.equal(prediction.time-authoritative.jumpStartedAt,200);
  jumpPhysics.advanceJump(authoritative,prediction.time+16);
  assert.ok(authoritative.height>predicted.height,'next frame continues rising without clock rewind');
  const ceiling={...predicted,height:0.8,ceilingHeight:3,jumpBase:0.8,jumpVelocity:0};
  prediction.reconcile(ceiling,predicted,1250,()=>{});assert.equal(ceiling.height,0.8);
  const knocked={...predicted,height:0,knockback:{start:1250},movementEpoch:1};
  prediction.reconcile(knocked,predicted,1250,()=>{});assert.equal(knocked.height,0);
});

test('jumping on rising and descending lifts stays continuous under delayed server snapshots',t=>{
  let now=100000,tick;t.mock.method(global,'setInterval',fn=>{tick=fn;return null;});t.mock.method(Date,'now',()=>now);
  for(const start of [104500,111000])for(const rtt of [0,150,300]) {
    now=start;let connect,client,clientMap,live=false,maxSnap=0,airFrames=0,worst;
    const queue=[],handlers={},prediction=new InputPrediction();prediction.reset(now);
    let game;
    const io={on(_,fn){connect=fn;},emit(name,data,meta){if(live&&name==='gameState'){
      const state=data.find(p=>p.id==='p');queue.push({at:now+rtt/2,fn(){
        const previous=client;client={...state};
        prediction.reconcile(client,previous,meta.serverNow,
          (p,i,time)=>applyMovementInput(p,i,clientMap,clientMap.terrain,time),
          p=>maps.updateCargoLifts(clientMap,[p],now));
        const snap=Math.abs(client.height-previous.height);
        if(snap>maxSnap){maxSnap=snap;worst=structuredClone({now,previous,client});}
      }});
    }},socketsLeave(){},to(){return this;}};
    game=server.createGameServer(io);connect({id:'p',on(n,fn){handlers[n]=fn;}});
    game.waitingPlayers.push({id:'p',name:'Lift jumper',weapon:'pistol'});handlers.startGame({enableBots:true});
    try {
      game.gameWalls.length=0;
      game.gameMap.terrain=[{kind:'lift',id:'cargo',x:300,y:300,width:120,height:120,top:0,maxTop:3.8}];
      game.gameMap.platformEpoch=100000;delete game.gameMap.elevator;
      for(const p of game.activePlayers)if(p.isBot)p.alive=false;
      const player=game.activePlayers.find(p=>p.id==='p');Object.assign(player,{x:360,y:360,height:0,groundHeight:0,platformId:'cargo',ceilingHeight:7.5});
      maps.updateCargoLifts(game.gameMap,[player],now);client={...player};clientMap=structuredClone(game.gameMap);live=true;
      for(let elapsed=10;elapsed<=2200;elapsed+=10){
        now=start+elapsed;prediction.time+=10;maps.updateCargoLifts(clientMap,[client],now);
        const input=prediction.record(0,0,0.01,elapsed===200,0);
        applyMovementInput(client,input,clientMap,clientMap.terrain,prediction.time);
        if(client.jumpStartedAt!=null)airFrames++;
        if(elapsed%40===0){const inputs=prediction.outgoing();queue.push({at:now+rtt/2,fn(){handlers.playerUpdate({inputs,angle:0});}});}
        for(let i=0;i<queue.length;){if(queue[i].at<=now){const event=queue.splice(i,1)[0];event.fn();}else i++;}
        if(elapsed%50===0)tick();
      }
      assert.ok(airFrames>20,'actually leaves platform');
      assert.ok(maxSnap<0.04,`lift ${start}, RTT ${rtt}: vertical correction ${maxSnap}, ${JSON.stringify(worst)}`);
      assert.equal(client.jumpStartedAt,null,'lands and resumes riding');
      assert.ok(Math.abs(client.height-clientMap.terrain[0].top)<0.04);
    }finally{game.close();}
  }
});

test('lift jumps detach immediately, reattach on contact, and clear lift support when leaving',()=>{
  const lift={kind:'lift',id:'cargo',x:100,y:100,width:120,height:120,top:0,maxTop:3.8};
  const map={width:600,height:600,ceiling:7.5,platformEpoch:100000,terrain:[lift]};
  const p={x:160,y:160,height:0,groundHeight:0,platformId:'cargo',alive:true,ceilingHeight:7.5};
  maps.updateCargoLifts(map,[p],105000);
  jumpPhysics.startJump(p,105000);assert.equal(p.platformId,null);
  for(let now=105010;now<=106000;now+=10){maps.updateCargoLifts(map,[p],now);jumpPhysics.advanceJump(p,now);}
  assert.equal(p.jumpStartedAt,null);assert.equal(p.platformId,'cargo');
  maps.updateCargoLifts(map,[p],106050);assert.equal(p.height,lift.top);
  jumpPhysics.startJump(p,106050);
  maps.updateCargoLifts(map,[p],106250);jumpPhysics.advanceJump(p,106250);
  assert.ok(maps.moveOnTerrain(p,260,160,map,[lift],106250));
  assert.equal(p.groundPlatformId,null);
  for(let now=106260;now<=107600;now+=10){maps.updateCargoLifts(map,[p],now);jumpPhysics.advanceJump(p,now);}
  assert.equal(p.platformId,null);assert.equal(p.height,0,'leaving the lift lands on the real ground');
});

test('server rejects forged durations, limits input spam, ignores duplicates and preserves knockback epochs',t=>{
  let connect,now=100000;t.mock.method(global,'setInterval',()=>null);t.mock.method(Date,'now',()=>now);
  const handlers={},io={on(_,fn){connect=fn;},emit(){},socketsLeave(){},to(){return this;}};
  const game=server.createGameServer(io);connect({id:'p',on(n,fn){handlers[n]=fn;}});
  game.waitingPlayers.push({id:'p',name:'P',weapon:'pistol'});handlers.startGame({enableBots:true});
  try{
    game.gameWalls.length=0;game.gameMap.terrain.length=0;
    const p=game.activePlayers.find(p=>p.id==='p');Object.assign(p,{x:400,y:400,height:0,groundHeight:0});
    const command=(seq,dt=0.05,epoch=0)=>({seq,dt,epoch,dx:1,dy:0,jump:false});
    handlers.playerUpdate({angle:0,inputs:[command(1,5)]});assert.equal(p.x,400);
    handlers.playerUpdate({angle:0,inputs:Array.from({length:32},(_,i)=>command(i+1))});
    assert.ok(p.x<=442.50001,'cannot move 1.6 seconds worth in a single instant');
    const x=p.x;handlers.playerUpdate({angle:0,inputs:[command(32)]});assert.equal(p.x,x);
    p.movementEpoch=1;maps.addKnockbackImpulse(p,320,0,now,'test');
    handlers.playerUpdate({angle:0,inputs:[command(33)]});assert.equal(p.lastProcessedInput,33);assert.equal(p.x,x);
    now+=100;
    handlers.playerUpdate({angle:0,inputs:[command(34)]});assert.equal(p.x,x,'pre-impact packets remain invalid');
    handlers.playerUpdate({angle:0,inputs:[command(35,0.05,1)]});assert.ok(p.x>x,'current input works during residual velocity');
    const authoritativeX=p.x;
    handlers.playerUpdate({angle:0,x:900,y:400});assert.equal(p.x,authoritativeX,'cannot switch back to absolute positions to bypass input validation');
  }finally{game.close();}
});

test('prediction discards pre-impact input, then permits control during residual velocity',()=>{
  const prediction=new InputPrediction(),before={alive:true,x:10,movementEpoch:0};
  prediction.record(1,0,0.05,false,0);
  const after={alive:true,x:80,movementEpoch:1,lastProcessedInput:0,knockback:{start:100}};
  prediction.reconcile(after,before,100,()=>assert.fail('old movement must not be replayed'));
  assert.equal(after.x,80);assert.equal(prediction.pending.length,0);
  prediction.record(1,0,0.05,false,1);
  let replayed=0;
  prediction.reconcile({...after,lastProcessedInput:0},after,150,()=>replayed++);
  assert.equal(replayed,1,'fresh directional input coexists with residual knockback');
  for(let i=0;i<1000;i++)prediction.record(1,0,0.01,false,1);
  assert.equal(prediction.pending.length,240);assert.equal(prediction.outgoing().length,32);
  prediction.reset(500);assert.equal(prediction.pending.length,0);
});

test('shared inputs support stairs and jumping without accepting client-supplied height',()=>{
  const map={width:1000,height:600,ceiling:7.5,terrain:[]};
  const solids=[{kind:'ramp',stairs:true,steps:17,axis:'x',x:200,y:200,width:220,height:120,top:3},
    {kind:'tower',walkable:true,x:420,y:200,width:250,height:120,top:3}];
  const p={x:175,y:260,height:0,groundHeight:0,alive:true};
  for(let i=1;i<=45;i++)applyMovementInput(p,{dx:1,dy:0,dt:0.05,height:999},map,solids,i*50);
  assert.equal(p.height,3);
  applyMovementInput(p,{dx:0,dy:0,dt:0.01,jump:true},map,solids,2300);
  applyMovementInput(p,{dx:0,dy:0,dt:0.05},map,solids,2500);
  assert.ok(p.height>3&&p.height<5);
});
