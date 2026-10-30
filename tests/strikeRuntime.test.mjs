import {test} from 'node:test';
import assert from 'node:assert/strict';
import server from '../game/gameServer.js';
import strikeMaps from '../public/strikeMap.js';
import lobbyModule from '../game/lobbyServer.js';
import wardenCombat from '../game/wardenCombat.js';

test('Warden targeted bursts warn before impact, can be dodged, and repeat by phase',()=>{
  const events=[],hits=[];
  const bot={id:'warden',wardenPhase:2,botState:{}},target={id:'player',x:100,y:0,height:0,alive:true};
  const definition={impact:{windupMs:900,intervalMs:350,count:2,cooldownMs:2200,
    radius:80,heightTolerance:5,damage:30,knockback:170}};
  const tick=now=>wardenCombat.tickWardenImpact(bot,target,[target],definition,now,{
    visible:true,canHit:()=>true,impact:(player,damage)=>hits.push({id:player.id,damage}),
    emit:event=>events.push(event)});
  assert.equal(tick(1000).active,true);
  assert.equal(events[0].event,'start');assert.equal(events[0].originX,100);
  target.x=220;
  tick(1899);assert.equal(hits.length,0);
  tick(1900);assert.equal(hits.length,0,'the first locked mark can be dodged');
  assert.equal(events.filter(event=>event.event==='start').length,2);
  assert.equal(events.at(-1).originX,220,'the second mark acquires a fresh position');
  tick(3150);
  assert.deepEqual(hits,[{id:'player',damage:30}]);
  assert.equal(bot.wardenImpact,null);
  assert.equal(bot.botState.wardenImpactReadyAt,5350);
});

function fakeIo() {
  const events=[];
  const channel={emit(name,...args){events.push({name,args});return this;},get volatile(){return this;}};
  return {events,on(){},emit:channel.emit.bind(channel),to(){return channel;},socketsLeave(){},
    get volatile(){return channel;}};
}

function player(id,weapon='sniper') {
  return {id,name:id,displayName:id,accountUsername:null,color:'#49cdb5',weapon,
    primaryWeapon:weapon,secondaryWeapon:'pistol',weaponSkinKey:null};
}

function compactStrike() {
  const door={id:'test-shutter',dynamicId:'test-shutter',kind:'strikeDoor',x:300,y:0,
    width:18,height:180,bottom:0,top:4};
  const encounters=[
    {id:'intake',act:1,sectorId:'west',objective:'Secure intake',
      trigger:{x:60,y:60,width:100,height:100,bottom:0,top:3},
      safeArrival:{x:60,y:60,width:100,height:100,bottom:0,top:3},
      checkpointSpawns:[{x:80,y:80,height:0,zone:'west'},{x:80,y:125,height:0,zone:'west'}],
      spawnGroups:[
        {id:'opening',delayMs:800,bots:[{x:210,y:80,height:0,zone:'west'},
          {x:210,y:130,height:0,zone:'west'}]},
        {id:'reinforcement',afterRemaining:1,bots:[{x:245,y:220,height:0,zone:'west'}]},
      ],
      postClearObjective:'Cycle the intake shutter',objectiveHoldMs:500,
      objectiveTrigger:{x:250,y:260,width:35,height:35,bottom:0,top:3},
      opens:['test-shutter'],machinery:{shutter:'open'},
      stateChanges:{staging:{shutter:'warning'},combat:{shutter:'sealed'},
        cleared:{shutter:'awaiting-cycle'},complete:{shutter:'open'}},
    },
    {id:'warden',act:2,sectorId:'east',objective:'Defeat the Warden',safeArrival:false,
      trigger:{x:340,y:60,width:100,height:100,bottom:0,top:3},
      checkpointSpawns:[{x:350,y:80,height:0,zone:'east'}],
      spawnGroups:[{bots:[{x:500,y:100,height:0,zone:'east',botType:'warden',boss:true,
        name:'DREAD WARDEN',health:200}]}],
      stateChanges:{combat:{core:'shielded'},wardenPhase2:{core:'venting'},
        wardenPhase3:{core:'exposed'},complete:{core:'collapsed'}},
      reward:{coins:0},
    },
  ];
  const map={id:'runtime-fixture',name:'Runtime fixture',mode:'strike',activity:'strike',
    strikeId:'runtime-fixture',width:640,height:360,ceiling:8,
    terrain:[{id:'fixture-deck',kind:'deck',x:0,y:0,width:640,height:360,bottom:-.5,top:0,
      walkable:true,platform:true}],walls:[door],
    worldBounds:{minX:0,minY:0,maxX:640,maxY:360},playerSpawns:[{x:35,y:35,height:0,zone:'west'}],
    botSpawn:{x:210,y:80,height:0,zone:'west'},encounters,strikeSectors:[
      {id:'west',bounds:{x:0,y:0,width:300,height:360,bottom:0,top:8}},
      {id:'east',bounds:{x:318,y:0,width:322,height:360,bottom:0,top:8}},
    ],routeGuides:[
      {id:'intake-route',x:45,y:45,height:0,kind:'arrow',encounterIndex:0,targetId:'intake'},
      {id:'intake-beacon',x:110,y:110,height:0,kind:'beacon',encounterIndex:0,targetId:'intake',label:'INTAKE'},
      {id:'intake-control',x:267.5,y:277.5,height:0,kind:'beacon',encounterIndex:0,
        targetId:'intake:objective',label:'CYCLE SHUTTER'},
      {id:'warden-beacon',x:390,y:110,height:0,kind:'beacon',encounterIndex:1,targetId:'warden',label:'WARDEN'},
    ],dynamicState:{'test-shutter':'closed'}};
  return {map,walls:map.walls};
}

function wardenStrike() {
  const cover={id:'pressure-cover',x:300,y:205,width:20,height:130,bottom:0,top:4};
  const encounter={id:'warden-test',act:1,sectorId:'forge',objective:'Defeat the Warden',
    safeArrival:false,trigger:{x:40,y:40,width:620,height:320,bottom:0,top:4},
    checkpointSpawns:[{x:400,y:140,height:0,zone:'forge'},{x:400,y:270,height:0,zone:'forge'}],
    spawnGroups:[{bots:[{x:200,y:200,height:0,zone:'forge',botType:'warden',boss:true,
      name:'DREAD WARDEN',health:200,bodyRadius:26,bodyHeight:3.15,eyeHeight:2.65}]}],
    wardenPhases:[
      {id:'test-carbine',minHealthRatio:.66,moveScale:1,
        carbine:{chargeMs:240,shotIntervalMs:80,burstShots:3,recoveryMs:350,damage:4},
        stateChanges:{machinery:{core:{state:'guarded'},crown:{state:'tracking'}}}},
      {id:'test-pressure',minHealthRatio:.33,moveScale:1.1,
        carbine:{chargeMs:280,shotIntervalMs:100,burstShots:3,recoveryMs:500,damage:5},
        pressure:{kind:'forgePressureSweep',sourceId:'red-vault-core',
          crownId:'vault-rotating-crown',entryDelayMs:0,windupMs:100,sweepMs:200,
          cooldownMs:400,radius:300,minRadius:20,arcWidth:1,heightTolerance:5,
          damage:20,knockback:180},
        stateChanges:{machinery:{core:{state:'venting'},crown:{state:'spin'}}}},
      {id:'test-overdrive',minHealthRatio:0,moveScale:1.25,entryDelayMs:0,
        carbine:{chargeMs:240,shotIntervalMs:80,burstShots:4,recoveryMs:350,damage:6},
        pressure:{kind:'forgePressureSweep',sourceId:'red-vault-core',
          crownId:'vault-rotating-crown',entryDelayMs:500,windupMs:80,sweepMs:160,
          cooldownMs:300,radius:320,minRadius:20,arcWidth:1.1,heightTolerance:5,
          damage:24,knockback:220,direction:-1},
        // Four authored positions deliberately exercise the hard server cap of three.
        reinforcements:{id:'test-redguard',bots:[
          {x:520,y:60,height:0,zone:'forge',botType:'dread'},
          {x:620,y:190,height:0,zone:'forge',botType:'dread'},
          {x:520,y:350,height:0,zone:'forge',botType:'dread'},
          {x:650,y:340,height:0,zone:'forge',botType:'dread'},
        ]},stateChanges:{machinery:{core:{state:'enraged'},crown:{state:'overdrive'}}}},
    ],stateChanges:{combat:{core:'shielded'},complete:{core:'collapsed',crown:'stopped'}},
    reward:{coins:0}};
  const map={id:'warden-runtime-fixture',name:'Warden runtime fixture',mode:'strike',
    activity:'strike',strikeId:'warden-runtime-fixture',width:700,height:400,ceiling:8,
    terrain:[],walls:[cover],worldBounds:{minX:0,minY:0,maxX:700,maxY:400},
    playerSpawns:encounter.checkpointSpawns,botSpawn:encounter.spawnGroups[0].bots[0],
    encounters:[encounter],strikeSectors:[
      {id:'forge',bounds:{x:0,y:0,width:700,height:400,bottom:0,top:8}},
    ],dynamicState:{}};
  return {map,walls:map.walls};
}

function runtimeFixture(t,{authored=false,humans=2,mapFactory}={}) {
  let now=100_000,tick;
  t.mock.method(Date,'now',()=>now);
  t.mock.method(global,'setInterval',fn=>{tick=fn;return 1;});
  t.mock.method(global,'clearInterval',()=>{});
  const io=fakeIo();
  const game=server.createGameServer(io,{attachConnections:false,
    ...(authored?{}:{createStrikeMap:mapFactory||compactStrike})});
  for(let index=0;index<humans;index++)game.waitingPlayers.push(player(`p${index+1}`));
  game.handleStartGame({id:'p1',user:{username:'runtime-test'}},
    {enableBots:true,strikeId:authored?'red-vault':'runtime-fixture'});
  const handlers={};
  game.registerSocketHandlers({id:'p1',user:{username:'runtime-test'},on(name,fn){handlers[name]=fn;},
    off(){},emit(){}},{lobby:false,disconnect:false});
  return {game,io,handlers,tick:()=>tick(),now:()=>now,advance(ms){now+=ms;tick();},setNow(value){now=value;}};
}

function centerOf(volume) {
  return {x:volume.x+volume.width/2,y:volume.y+volume.height/2,
    height:Number.isFinite(volume.bottom)?volume.bottom:Number.isFinite(volume.minHeight)?volume.minHeight:0};
}

function moveInto(actor,volume) {
  Object.assign(actor,centerOf(volume),{groundHeight:centerOf(volume).height});
}

function aimAtInteraction(actor,interaction) {
  const dx=interaction.x-actor.x,dy=interaction.y-actor.y,distance=Math.hypot(dx,dy);
  actor.angle=Math.atan2(dy,dx);
  return {angle:actor.angle,pitch:Math.atan2(interaction.height-
    ((actor.height||0)+(actor.eyeHeight||1.84)),Math.max(.001,distance*.05))};
}

test('Strike is a distinct lobby activity rather than an Endless PvE floor',()=>{
  assert.equal(lobbyModule.MODES.strike?.id,'strike');
  assert.equal(lobbyModule.MODES.pve?.id,'pve');
  assert.notEqual(lobbyModule.MODES.strike,lobbyModule.MODES.pve);
});

test('authoritative Strike runtime stages waves, revives checkpoints, operates gates, and completes',t=>{
  const fixture=runtimeFixture(t),{game,io}=fixture;
  try {
    const leader=game.activePlayers.find(value=>value.id==='p1');
    const teammate=game.activePlayers.find(value=>value.id==='p2');
    assert.equal(game.gameMap.activity,'strike');
    assert.equal(game.strikeState.phase,'travel');
    assert.equal(game.activePlayers.some(value=>value.isBot),false);
    assert.equal(game.strikeState.routeTargetId,'intake');
    assert.deepEqual(game.strikeState.activeRouteGuideIds,['intake-route','intake-beacon']);
    assert.equal(game.strikeState.objectiveBeacon?.id,'intake-beacon');
    assert.equal(game.strikeState.objectiveBeacon?.targetId,'intake');

    moveInto(leader,game.gameMap.encounters[0].trigger);fixture.tick();
    assert.equal(game.strikeState.phase,'staging');
    assert.equal(game.strikeState.machineryState.shutter,'warning');
    assert.equal(game.activePlayers.filter(value=>value.isBot&&value.alive).length,0);

    fixture.advance(900);
    assert.equal(game.strikeState.phase,'staging','safe arrival keeps the authored opening wave dormant');
    assert.equal(game.activePlayers.filter(value=>value.isBot&&value.alive).length,2,
      'the threshold reinforcement does not leapfrog its delayed opening wave');
    const added=io.events.find(event=>event.name==='playersAdded');
    assert.equal(added?.args[0]?.length,2,'deferred Strike spawns publish one reliable identity packet');
    assert.ok(added.args[0].every(bot=>bot.botType&&bot.weapon&&bot.bodyHeight),
      'the identity packet carries renderer-critical bot fields');
    assert.ok(game.activePlayers.filter(value=>value.isBot&&value.alive)
      .every(bot=>Math.cos(bot.angle)<0),
    'Strike defenders face the approaching fireteam instead of all facing map east');

    fixture.advance(901);
    assert.equal(game.strikeState.phase,'combat');
    assert.equal(game.strikeState.machineryState.shutter,'sealed');
    let living=game.activePlayers.filter(value=>value.isBot&&value.alive);
    living[0].alive=false;fixture.tick();
    living=game.activePlayers.filter(value=>value.isBot&&value.alive);
    assert.equal(living.length,2,'the reinforcement arrives when one opening-wave enemy remains');

    teammate.alive=false;teammate.health=0;
    for(const bot of game.activePlayers.filter(value=>value.isBot))bot.alive=false;
    fixture.tick();
    assert.equal(game.strikeState.phase,'objective');
    assert.equal(game.strikeState.objective,'Cycle the intake shutter');
    assert.equal(game.strikeState.machineryState.shutter,'awaiting-cycle');
    assert.equal(game.strikeState.routeTargetId,'intake:objective');
    assert.deepEqual(game.strikeState.activeRouteGuideIds,['intake-control']);
    assert.equal(game.strikeState.objectiveBeacon?.targetId,'intake:objective');
    assert.equal(game.strikeState.objectiveBeacon?.kind,'interaction');
    moveInto(leader,game.gameMap.encounters[0].objectiveTrigger);fixture.tick();
    assert.equal(game.strikeState.objectiveProgress,0);
    fixture.advance(500);
    assert.equal(game.strikeState.phase,'travel');
    assert.equal(game.strikeState.encounterId,'warden');
    assert.equal(teammate.alive,true,'an eliminated fireteam member revives at the authored checkpoint');
    assert.ok(game.strikeState.revivedIds.includes(teammate.id));
    assert.equal(game.strikeState.machineryState.shutter,'open');
    assert.ok(game.strikeState.openedIds.includes('test-shutter'));
    assert.equal(game.strikeState.openedAtById['test-shutter'],fixture.now());
    assert.equal(game.strikeState.routeTargetId,'warden');
    assert.deepEqual(game.strikeState.activeRouteGuideIds,['warden-beacon']);
    assert.equal(game.gameWalls.find(value=>value.id==='test-shutter').nonSolid,true);

    moveInto(leader,game.gameMap.encounters[1].trigger);fixture.tick();
    assert.equal(game.strikeState.phase,'combat');
    const boss=game.activePlayers.find(value=>value.botType==='warden');
    assert.ok(boss?.boss);assert.equal(boss.displayName,'DREAD WARDEN');
    assert.equal(game.strikeState.bossCombatPhase,1);
    // Exercise the server-owned boss reaction state directly through hitscan.
    Object.assign(leader,{weapon:'sniper',lastShotAt:0});fixture.setNow(fixture.now()+1_200);
    // A state update is emitted on authoritative damage. Three sniper hits
    // cross both health bands and the final one completes the Strike.
    const handlers={};
    game.registerSocketHandlers({id:leader.id,user:{username:'runtime-test'},on(name,fn){handlers[name]=fn;},
      off(){},emit(){}},{lobby:false,disconnect:false});
    const shootBoss=()=>{
      const current=game.activePlayers.find(value=>value.alive&&value.botType==='warden');
      Object.assign(leader,{x:current.x-80,y:current.y,height:current.height,groundHeight:current.height});
      handlers.shoot({angle:Math.atan2(current.y-leader.y,current.x-leader.x),pitch:0});
    };
    shootBoss();
    assert.equal(game.strikeState.bossCombatPhase,2);
    assert.equal(game.strikeState.machineryState.core.state,'warden-venting');
    fixture.setNow(fixture.now()+1_200);shootBoss();
    assert.equal(game.strikeState.bossCombatPhase,3);
    assert.equal(game.strikeState.machineryState.core.state,'warden-enraged');
    fixture.setNow(fixture.now()+1_200);shootBoss();
    assert.equal(game.strikeState.complete,true);
    assert.equal(game.strikeState.result,'victory');
    assert.equal(game.strikeState.machineryState.core,'collapsed');
    assert.ok(io.events.some(event=>event.name==='strikeComplete'));
    assert.ok(io.events.some(event=>event.name==='gameOver'&&event.args[0]?.strike===true));
  } finally {game.close();}
});

test('Strike falls create a safe-position shell that a teammate revives with a two-second hold',t=>{
  const fixture=runtimeFixture(t),{game,handlers}=fixture;
  try {
    const leader=game.activePlayers.find(value=>value.id==='p1');
    const teammate=game.activePlayers.find(value=>value.id==='p2');
    Object.assign(leader,{x:70,y:35,height:0,groundHeight:0,angle:Math.PI});
    Object.assign(teammate,{x:180,y:180,height:-4,groundHeight:-4,jumpStartedAt:fixture.now()-1000,
      jumpBase:0,jumpVelocity:0});
    fixture.tick();
    assert.equal(teammate.alive,false,'falling several metres below authored support is lethal');
    const beacon=game.strikeState.reviveBeacons.find(value=>value.playerId===teammate.id);
    assert.ok(beacon);assert.deepEqual({x:beacon.x,y:beacon.y,height:beacon.height},{x:35,y:35,height:0});
    const dx=beacon.x-leader.x,dy=beacon.y-leader.y,distance=Math.hypot(dx,dy);
    leader.angle=Math.atan2(dy,dx);
    const aim={kind:'revive',targetId:teammate.id,angle:leader.angle,
      pitch:Math.atan2(beacon.height+1.05-(leader.height+1.84),distance*.05)};
    assert.equal(handlers.strikeInteractStart(aim),true);
    assert.equal(game.strikeState.reviveBeacons[0].reviverId,leader.id);
    fixture.advance(1000);assert.ok(game.strikeState.reviveBeacons[0].progress>=.49);
    assert.equal(teammate.alive,false);
    fixture.advance(1001);
    assert.equal(teammate.alive,true);assert.equal(teammate.health,101);
    assert.equal(game.strikeState.reviveBeacons.length,0);
    assert.ok(fixture.io.events.some(event=>event.name==='playerRevived'&&event.args[0]?.id===teammate.id));
  } finally {game.close();}
});

test('a solo Strike fall ends the run instead of leaving the player on implicit ground',t=>{
  const fixture=runtimeFixture(t,{humans:1}),{game,io}=fixture;
  try {
    const player=game.activePlayers.find(value=>!value.isBot);
    Object.assign(player,{x:180,y:180,height:-4,groundHeight:-4,jumpStartedAt:fixture.now()-1000,
      jumpBase:0,jumpVelocity:0});
    fixture.tick();
    assert.equal(player.alive,false);assert.equal(game.strikeState.reviveBeacons.length,0);
    assert.ok(io.events.some(event=>event.name==='gameOver'&&event.args[0]?.team==='bots'));
  } finally {game.close();}
});

test('a Strike hostile that falls off authored support is recovered instead of becoming a phantom count',t=>{
  const mapFactory=()=>{
    const layout=compactStrike(),encounter=layout.map.encounters[0];
    encounter.safeArrival=false;
    encounter.spawnGroups=[{bots:[{x:210,y:80,height:0,zone:'west'}]}];
    layout.map.encounters=[encounter];
    return layout;
  };
  const fixture=runtimeFixture(t,{humans:1,mapFactory}),{game}=fixture;
  try {
    const human=game.activePlayers.find(value=>!value.isBot);
    moveInto(human,game.gameMap.encounters[0].trigger);fixture.tick();
    assert.equal(game.strikeState.phase,'combat');
    fixture.advance(1_201);
    const hostile=game.activePlayers.find(value=>value.alive&&value.isBot);
    assert.ok(hostile?.strikeLastValidPosition);
    const valid={...hostile.strikeLastValidPosition};
    Object.assign(hostile,{x:180,y:180,height:-4,groundHeight:-4,jumpStartedAt:null});
    fixture.tick();
    assert.equal(hostile.alive,true,'a transient bad sample is not killed immediately');
    fixture.advance(501);
    assert.equal(hostile.alive,true,'a recoverable defender remains part of the encounter');
    assert.ok(Math.hypot(hostile.x-valid.x,hostile.y-valid.y)<95&&Math.abs(hostile.height-valid.height)<.1,
      'the defender returns to its most recent valid authored layer');
    assert.equal(game.strikeState.activeEnemyCount,1);
    assert.equal(game.strikeState.objectiveBeacon?.kind,'hostile');
    assert.equal(game.strikeState.objectiveBeacon?.label,'LAST HOSTILE');
    assert.ok(Math.hypot(game.strikeState.objectiveBeacon.x-hostile.x,
      game.strikeState.objectiveBeacon.y-hostile.y)<10,'the final-hostile locator follows the recovered body');
  } finally {game.close();}
});

test('the Warden runs authored carbine, LOS pressure, and bounded overdrive phases',t=>{
  // A centered random stream removes aim spread and makes every authoritative
  // shot/telegraph assertion independent of test-run ordering.
  t.mock.method(Math,'random',()=>.5);
  const fixture=runtimeFixture(t,{humans:2,mapFactory:wardenStrike}),{game,io}=fixture;
  try {
    const leader=game.activePlayers.find(value=>value.id==='p1');
    const covered=game.activePlayers.find(value=>value.id==='p2');
    Object.assign(leader,{x:400,y:140,height:0,groundHeight:0});
    Object.assign(covered,{x:400,y:270,height:0,groundHeight:0});
    fixture.tick();
    assert.equal(game.strikeState.phase,'combat');
    const boss=game.activePlayers.find(value=>value.botType==='warden');
    assert.ok(boss?.boss);assert.equal(boss.wardenPhase,1);
    assert.ok(boss.spawnReadyAt>fixture.now(),'Strike enemies announce a materialization window');
    const announced=io.events.filter(event=>event.name==='playersAdded').flatMap(event=>event.args[0]||[])
      .find(value=>value.id===boss.id);
    assert.equal(announced?.spawnReadyAt,boss.spawnReadyAt,
      'the reliable identity packet carries the authoritative reveal timestamp');
    const arrivalPosition={x:boss.x,y:boss.y};
    fixture.tick();
    assert.equal(boss.dreadAttack,null,'a materializing enemy cannot begin an attack');
    assert.deepEqual({x:boss.x,y:boss.y},arrivalPosition,'a materializing enemy remains stationary');
    fixture.setNow(boss.spawnReadyAt+1);

    // Phase one has a distinct three-round carbine cadence and authored damage.
    boss.angle=Math.atan2(leader.y-boss.y,leader.x-boss.x);
    boss.botState.dreadReadyAt=0;boss.dreadAttack=null;
    const shotsBefore=io.events.filter(event=>event.name==='shotFired').length;
    fixture.tick();
    assert.equal(boss.dreadAttack?.phase,'charge');
    assert.equal(boss.dreadAttack?.burstShots,3);
    const healthBefore=leader.health;
    fixture.advance(240);fixture.advance(80);fixture.advance(80);
    const carbineShots=io.events.slice(shotsBefore).filter(event=>
      event.name==='shotFired'&&event.args[0]?.playerId===boss.id);
    assert.equal(carbineShots.length,3,'phase one fires exactly its authored three-round burst');
    assert.equal(boss.dreadAttack,null);
    assert.ok(healthBefore-leader.health>11&&healthBefore-leader.health<12,
      'three authored 4-damage hits land, with only bounded PvE regeneration between them');

    const handlers={};
    game.registerSocketHandlers({id:leader.id,user:{username:'warden-test'},
      on(name,fn){handlers[name]=fn;},off(){},emit(){}},{lobby:false,disconnect:false});
    const shootBoss=()=>{
      Object.assign(leader,{weapon:'sniper',lastShotAt:0,x:boss.x+75,y:boss.y,
        height:boss.height,groundHeight:boss.height,knockback:null});
      handlers.shoot({angle:Math.atan2(boss.y-leader.y,boss.x-leader.x),pitch:0});
    };

    fixture.setNow(fixture.now()+1_200);shootBoss();
    assert.equal(boss.health,110);assert.equal(boss.wardenPhase,2);
    assert.equal(game.strikeState.bossCombatPhase,2);
    assert.equal(game.strikeState.machineryState.core.state,'warden-venting');

    // Both players are inside the initial sweep arc, but only one has real
    // geometry LOS. The wall-shielded player must never take pressure damage.
    Object.assign(boss,{x:200,y:200,height:0,groundHeight:0,knockback:null});
    Object.assign(leader,{x:400,y:140,height:0,groundHeight:0,health:101,knockback:null});
    Object.assign(covered,{x:400,y:270,height:0,groundHeight:0,health:101,knockback:null});
    boss.angle=Math.atan2(leader.y-boss.y,leader.x-boss.x);
    Object.assign(boss.botState,{fear:null,fearAttackUntil:0});
    fixture.tick();
    assert.equal(boss.wardenAttack?.phase,'charge');
    assert.equal(leader.health,101,'the telegraph windup is safe');
    const startEvent=io.events.find(event=>event.name==='wardenAttack'&&event.args[0]?.event==='start');
    assert.deepEqual({sourceId:startEvent?.args[0]?.sourceId,crownId:startEvent?.args[0]?.crownId,
      attackPhase:startEvent?.args[0]?.attackPhase},
    {sourceId:'red-vault-core',crownId:'vault-rotating-crown',attackPhase:'charge'});
    assert.equal(game.strikeState.bossAttack?.event,'start');

    fixture.advance(100);
    assert.equal(boss.wardenAttack?.phase,'sweep');
    assert.equal(leader.health,81,'the authoritative pressure hit applies its exact authored damage');
    assert.equal(covered.health,101,'real wall geometry blocks pressure damage');
    assert.ok(Math.abs(Math.hypot(leader.knockback?.vx||0,leader.knockback?.vy||0)-180)<1e-6,
      'the exposed player receives the authored residual impulse');
    const movementEpoch=leader.movementEpoch,impactHealth=leader.health;
    fixture.tick();
    assert.equal(leader.health,impactHealth,'one sweep cannot damage the same player twice');
    assert.equal(leader.movementEpoch,movementEpoch,'one sweep cannot stack duplicate impulses');
    const liveFrame=io.events.filter(event=>event.name==='gameState').at(-1)?.args[0]
      ?.find(actor=>actor.id===boss.id);
    assert.equal(liveFrame?.wardenAttack?.phase,'sweep',
      'ordinary frames carry authoritative live sweep angle/progress');

    fixture.advance(200);
    assert.ok(leader.health>=impactHealth&&leader.health<=impactHealth+1.001,
      'the completed sweep adds no second damage hit');
    assert.equal(covered.health,101);
    assert.equal(boss.wardenAttack,null);assert.equal(game.strikeState.bossAttack,null);
    const endEvent=io.events.find(event=>event.name==='wardenAttack'&&event.args[0]?.event==='end');
    assert.equal(endEvent?.args[0]?.hitCount,1);
    const endedFrame=io.events.filter(event=>event.name==='gameState').at(-1)?.args[0]
      ?.find(actor=>actor.id===boss.id);
    assert.ok(Object.hasOwn(endedFrame,'wardenAttack'));
    assert.equal(endedFrame.wardenAttack,null,'compact frames explicitly clear the finished sweep');

    fixture.setNow(fixture.now()+1_200);shootBoss();
    assert.equal(boss.health,20);assert.equal(boss.wardenPhase,3);
    assert.equal(game.strikeState.bossCombatPhase,3);
    assert.equal(game.strikeState.machineryState.core.state,'warden-enraged');
    assert.equal(game.strikeState.machineryState.crown.state,'overdrive');
    assert.ok(Math.abs(boss.moveScale-1.4)<1e-9);
    const redguard=game.activePlayers.filter(value=>value.alive&&value.botType==='dread');
    assert.equal(redguard.length,3,'phase-three reinforcements obey the hard cap');
    assert.equal(game.strikeState.wardenReinforcementCount,3);
    assert.equal(game.strikeState.phaseEnemyTotal,4);
    assert.equal(io.events.filter(event=>event.name==='wardenReinforcements').length,1);

    Object.assign(boss,{knockback:null,angle:Math.atan2(leader.y-boss.y,leader.x-boss.x)});
    Object.assign(boss.botState,{fear:null,fearAttackUntil:0,dreadReadyAt:0});
    boss.dreadAttack=null;fixture.tick();
    assert.equal(boss.dreadAttack?.burstShots,4,'overdrive switches to its faster four-round carbine');
    fixture.tick();
    assert.equal(game.activePlayers.filter(value=>value.alive&&value.botType==='dread').length,3);
    assert.equal(io.events.filter(event=>event.name==='wardenReinforcements').length,1,
      'ordinary ticks never duplicate the bounded reinforcement cycle');
  } finally {game.close();}
});

test('all ten authored Red Vault encounters and all three finale phases advance server-side',t=>{
  const fixture=runtimeFixture(t,{authored:true,humans:1}),{game,handlers}=fixture;
  try {
    const human=game.activePlayers.find(value=>!value.isBot);
    const finale=game.gameMap.encounters.find(value=>value.id==='red-vault-finale');
    assert.equal(finale?.wardenPhases?.length,3);
    assert.equal(finale.spawnGroups.filter(group=>group.phase===3)[0]?.bots?.length,1,
      'the encounter wave owns one boss; its health phases own bounded additions');
    assert.equal(finale.wardenPhases[0].carbine.burstShots,3);
    assert.equal(finale.wardenPhases[1].pressure.sourceId,'vault-boss-heart');
    assert.equal(finale.wardenPhases[2].pressure.direction,-1);
    assert.ok(finale.wardenPhases[2].reinforcements.bots.length<=3);
    const encountered=[],firstCombatPass=new Set();let interactionCancelTested=false,guard=0;
    while(!game.strikeState.complete&&guard++<180) {
      const encounter=game.gameMap.encounters[game.strikeState.encounterIndex];
      assert.ok(encounter,`encounter ${game.strikeState.encounterIndex} exists`);
      if(encountered.at(-1)!==encounter.id)encountered.push(encounter.id);
      if(game.strikeState.phase==='travel') {
        moveInto(human,(encounter.triggers||[encounter.trigger])[0]);fixture.tick();
      } else if(game.strikeState.phase==='staging') {
        fixture.advance(12_000);
      } else if(game.strikeState.phase==='combat') {
        const pending=game.strikeState.pendingGroupIndexes||[];
        const alive=game.activePlayers.filter(value=>value.isBot&&value.alive);
        const phaseKey=`${game.strikeState.encounterIndex}:${game.strikeState.encounterPhase}`;
        if(!firstCombatPass.has(phaseKey)) {
          firstCombatPass.add(phaseKey);
          const expected=(game.strikeState.spawnedGroupIndexes||[]).reduce((sum,index)=>
            sum+(encounter.spawnGroups[index]?.bots?.length||0),0);
          assert.equal(alive.length,expected,`${encounter.id} phase ${game.strikeState.encounterPhase} spawns every authored bot`);
          assert.ok(alive.every(bot=>Number.isFinite(bot.health)&&bot.health>0&&bot.maxHealth===bot.health),
            `${encounter.id} initializes finite authoritative enemy health`);
          for(const bot of alive) {
            const restored={soldier:100,dread:220,ogre:360,guardian:420,warden:1150};
            assert.equal(bot.maxHealth,restored[bot.botType],
              `${encounter.id} uses the earlier enemy health so difficulty comes from numbers`);
          }
        }
        assert.equal(alive.length+(pending.length?1:0)>0,true,
          `${encounter.id} has an active or scheduled authored wave`);
        if(pending.length) {
          const threshold=Math.min(...pending.map(index=>Number(encounter.spawnGroups[index]?.afterRemaining))
            .filter(Number.isFinite));
          const keep=Number.isFinite(threshold)?threshold:0;
          for(const bot of alive.slice(keep))bot.alive=false;
          fixture.tick();
          const remainingPending=new Set(game.strikeState.pendingGroupIndexes||[]);
          const arrived=pending.filter(index=>!remainingPending.has(index)).reduce((sum,index)=>
            sum+(encounter.spawnGroups[index]?.bots?.length||0),0);
          assert.equal(game.activePlayers.filter(value=>value.isBot&&value.alive).length,keep+arrived,
            `${encounter.id} reinforcement group spawns at its authored threshold`);
        } else {
          if(encounter.type==='survive')fixture.advance(encounter.durationMs+1);
          else {
            if(encounter.id==='gantry-overwatch') {
              const template=alive[0];
              game.activePlayers.push({...template,id:'stale-assembly-bot',alive:true,
                strikeEncounterId:'assembly-canyon',botState:{...template.botState}});
            }
            for(const bot of alive)bot.alive=false;fixture.tick();
            if(encounter.id==='gantry-overwatch') {
              assert.equal(game.strikeState.encounterId,'cross-furnace',
                'a stale enemy record from the prior room cannot hold the cleared gantry hostage');
              assert.equal(game.activePlayers.some(value=>value.id==='stale-assembly-bot'),false);
            }
          }
        }
      } else if(game.strikeState.phase==='intermission') {
        fixture.advance(1_201);
      } else if(game.strikeState.phase==='objective') {
        const completingId=encounter.id;
        moveInto(human,encounter.objectiveTrigger||encounter.completionTrigger);fixture.tick();
        if(game.strikeState.phase==='objective'&&encounter.destructible) {
          assert.equal(game.strikeState.objectiveKind,'destructible');
          assert.equal(game.strikeState.objectiveHealth,encounter.destructible.maxHealth);
          const aim=aimAtInteraction(human,encounter.destructible);
          assert.equal(handlers.strikeInteractStart(aim),false,
            'the reactor cannot be completed through the old E interaction path');
          Object.assign(human,{weapon:'sniper',lastShotAt:0});
          handlers.shoot(aim);
          assert.equal(game.strikeState.objectiveHealth,90,
            'the first authoritative sniper ray removes exactly 90 reactor health');
          assert.equal(game.strikeState.phase,'objective','a damaged reactor remains alive');
          fixture.advance(1_101);handlers.shoot(aim);
          assert.equal(game.strikeState.objectiveHealth,undefined,
            'destroying the reactor clears transient objective health on encounter handoff');
          assert.equal(fixture.io.events.filter(event=>event.name==='strikeObjectiveDestroyed'&&
            event.args[0]?.id===encounter.destructible.id).length,1,
          'reactor destruction emits one reliable explosion event');
        } else if(game.strikeState.phase==='objective'&&encounter.interaction) {
          assert.equal(game.strikeState.objectiveProgress,0,
            `${encounter.id} cannot operate merely by standing beside its control`);
          const aim=aimAtInteraction(human,encounter.interaction);
          handlers.strikeInteractStart(aim);
          assert.equal(game.strikeState.interactionPlayerId,human.id);
          if(!interactionCancelTested) {
            fixture.advance(800);
            assert.ok(game.strikeState.objectiveProgress>.35&&game.strikeState.objectiveProgress<.45,
              'the authoritative two-second hold reports incremental progress');
            handlers.strikeInteractCancel();
            assert.equal(game.strikeState.objectiveProgress,0,'releasing E cancels and resets the operation');
            handlers.strikeInteractStart(aim);interactionCancelTested=true;
          }
          fixture.advance(encounter.interaction.holdMs+1);
        } else if(game.strikeState.phase==='objective')fixture.advance(encounter.objectiveHoldMs||1);
        if(completingId==='assembly-canyon') {
          assert.equal(game.strikeState.encounterId,'gantry-overwatch');
          assert.equal(game.strikeState.phase,'staging',
            'the line controller directly stages the gantry fight without an invisible capture trigger');
        }
      } else assert.fail(`unexpected Strike phase ${game.strikeState.phase}`);

      if(encounter.id==='red-vault-finale'&&game.strikeState.phase==='combat'&&
        game.strikeState.encounterPhase===3) {
        const boss=game.activePlayers.find(value=>value.alive&&value.botType==='warden');
        assert.ok(boss?.boss,'phase three owns the actual Warden boss');
        assert.equal(boss.displayName,'DREAD WARDEN');
        assert.equal(boss.maxHealth,1150);
      }
    }
    assert.ok(guard<180,`the authored Strike cannot deadlock at ${game.strikeState.encounterId} / ${game.strikeState.phase}; phase ${game.strikeState.encounterPhase}, pending ${game.strikeState.pendingGroupIndexes}, alive ${game.activePlayers.filter(value=>value.isBot&&value.alive).length}`);
    assert.deepEqual(encountered,game.gameMap.encounters.map(value=>value.id));
    assert.equal(game.strikeState.complete,true);
    assert.equal(game.strikeState.checkpointIndex,9);
    for(const id of ['freight-shutter','assembly-shutter','refinery-shutter','command-bridge',
      'command-bridge-raised','command-breach-shutter','vault-boss-gate'])assert.ok(game.strikeState.openedIds.includes(id),id);
    assert.equal(game.strikeState.machineryState.core,'collapsed');
    assert.equal(game.strikeState.machineryState.crown,'stopped');
  } finally {game.close();}
});

test('starting Endless PvE still owns floor state and never creates Strike state',t=>{
  let tick;
  t.mock.method(global,'setInterval',fn=>{tick=fn;return 1;});
  t.mock.method(global,'clearInterval',()=>{});
  const game=server.createGameServer(fakeIo(),{attachConnections:false});
  try {
    game.waitingPlayers.push(player('p1','pistol'));
    game.handleStartGame({id:'p1',user:{username:'endless-test'}},{enableBots:true});
    assert.equal(game.gameMap.mode,'pve');
    assert.equal(game.strikeState,null);
    assert.equal(game.floorState.floor,1);
    assert.ok(game.activePlayers.some(value=>value.isBot));
    tick();assert.notEqual(game.floorState.phase,undefined);
  } finally {game.close();}
});
