import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import maps from '../public/arenaMap.js';
import movement from '../public/movement.js';
import combat from '../game/hitscan.js';
import server from '../game/gameServer.js';
import {createTerrainModel,poseCargoLift} from '../public/pveEnvironment.mjs';
import {planAreaLighting,createAreaLighting} from '../public/areaLighting.mjs';
import {planAmbientZones,ambientZoneUniforms,applyAmbientZones} from '../public/ambientZones.mjs';

test('room ambient brightness is seeded, bounded, spatial, and leaves direct lights unchanged',()=>{
  const samples=[];
  for(let seed=0;seed<20;seed++) {
    const {map}=maps.createPveMap(seed*7919),plan=planAmbientZones(map);
    assert.deepEqual(plan,planAmbientZones(map));
    assert.ok(plan.zones.length>=2&&plan.zones.length<=9);
    for(const value of [plan.baseline,...plan.zones.map(z=>z.brightness)]) {
      assert.ok(value>=0.5&&value<=1);samples.push(value);
    }
    assert.ok(new Set(plan.zones.map(z=>z.brightness)).size>1);
    const uniforms=ambientZoneUniforms(plan);
    assert.equal(uniforms.zoneCount.value,plan.zones.length);
    const material=new THREE.MeshStandardMaterial(),mesh=new THREE.Mesh(new THREE.BoxGeometry(),material);
    applyAmbientZones(mesh,uniforms);
    const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,
      fragmentShader:THREE.ShaderLib.standard.fragmentShader};
    material.onBeforeCompile(shader);
    assert.ok(!/\S[^\n]*#(?:define|ifdef|ifndef|if|endif|include)\b/.test(shader.fragmentShader),
      'injected GLSL must not join a closing brace to a Three.js preprocessor directive');
    assert.ok(shader.vertexShader.includes('ambientWorld=(modelMatrix*vec4(transformed,1.0)).xyz;'));
    assert.ok(shader.fragmentShader.includes('irradiance*=ambientAt(ambientWorld.xz);'));
    assert.ok(shader.fragmentShader.includes('#include <lights_fragment_begin>'));
    assert.equal(shader.uniforms.zoneBaseline.value,plan.baseline);
    mesh.geometry.dispose();material.dispose();
  }
  assert.ok(Math.min(...samples)<0.55&&Math.max(...samples)>0.95,'uses the requested brightness range');
  assert.deepEqual(planAmbientZones({mode:'pvp'}),{baseline:1,zones:[]});
});

test('PvE lighting follows architecture with a fixed budget and clear ceiling fixtures',()=>{
  const kinds=new Set();let lanterns=0;
  for(let seed=0;seed<40;seed++) {
    const {map,walls}=maps.createPveMap(seed*7919),plan=planAreaLighting(map,walls);
    assert.deepEqual(plan,planAreaLighting(map,walls),'deterministic lighting');
    assert.ok(plan.length>=2&&plan.length<=6);
    const roles=new Set(map.zones.map(z=>z.role));
    assert.ok(plan.every(light=>roles.has(light.kind)),'every light belongs to a generated architectural zone');
    for(const p of plan) {
      kinds.add(p.kind);
      assert.ok(p.sourceHeight>p.height+2.2&&p.sourceHeight<map.ceiling);
      assert.ok(!walls.some(s=>s.top>=p.sourceHeight&&p.x>s.x&&p.x<s.x+s.width&&p.y>s.y&&p.y<s.y+s.height));
    }
    const group=createAreaLighting(plan,(x,y,h)=>new THREE.Vector3(x*0.05,h,y*0.05));
    const lights=group.children.filter(o=>o.isLight);
    assert.equal(lights.length,plan.length);
    assert.ok(lights.filter(light=>light.castShadow).length<=1,'only the main workspace light renders an extra shadow pass');
    for(const light of lights) {
      assert.equal(light.castShadow,!!plan[lights.indexOf(light)].castsShadow);
      assert.ok(light.shadow.mapSize.x<=512);
      assert.ok(group.children.includes(light.target));
      assert.ok(light.position.y>light.target.position.y);
    }
    group.traverse(o=>{o.geometry?.dispose();o.material?.dispose();o.shadow?.dispose();});
    const lantern=map.terrain.find(s=>s.kind==='grandLantern');
    if(lantern) {
      lanterns++;
      assert.ok(plan.some(area=>area.fixture==='lantern'&&area.kind===map.zones.find(z=>z.id===lantern.zone).role));
      const model=createTerrainModel(lantern),bounds=new THREE.Box3().setFromObject(model);
      assert.ok(Number.isFinite(bounds.min.x)&&bounds.max.y>bounds.min.y+2,'lantern is a substantial rendered landmark');
      model.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
    }
  }
  assert.ok(lanterns>=8,'lantern halls recur across seeds without appearing on every floor');
  for(const role of ['machine-hall','warehouse','reactor','processing','control','maintenance'])assert.ok(kinds.has(role));
  assert.deepEqual(planAreaLighting(maps.createPvpMap(731).map),[],'PvP lighting stays unchanged');
});

test('Terminal 7 lights each real processing zone without extra shadow maps',()=>{
  const {map,walls}=maps.createPvpMap(0,'airport'),plan=planAreaLighting(map,walls);
  assert.equal(plan.length,6);
  assert.deepEqual(plan.map(p=>p.kind),['airport-checkin','airport-security','airport-market',
    'airport-gates-west','airport-gates-east','airport-gallery']);
  assert.ok(plan.every(p=>p.color.startsWith('#')&&p.sourceHeight<map.ceiling&&p.castsShadow===false));
  const group=createAreaLighting(plan,(x,y,h)=>new THREE.Vector3(x*.05,h,y*.05));
  assert.equal(group.children.filter(o=>o.isLight).length,6);
  assert.equal(group.children.filter(o=>o.isLight&&o.castShadow).length,0);
  group.traverse(o=>{o.geometry?.dispose();o.material?.dispose();o.shadow?.dispose();});
});

const fixture=seed=>{
  let layout=maps.createPveMap(seed);
  for(let i=1;!layout.map.terrain.some(s=>s.kind==='lift');i++)layout=maps.createPveMap(seed+i*7919);
  const {map,walls}=layout;
  map.platformEpoch=100000;
  const lift=map.terrain.find(s=>s.kind==='lift'),deck=map.terrain.find(s=>s.walkable&&s.liftServed===lift.id);
  const center={x:lift.x+lift.width/2,y:lift.y+lift.height/2};
  const dx=center.x<deck.x?1:center.x>deck.x+deck.width?-1:0;
  const dy=center.y<deck.y?1:center.y>deck.y+deck.height?-1:0,len=Math.hypot(dx,dy);
  return {map,walls,lift,deck,center,v:{x:dx/len,y:dy/len},solids:[...walls,...map.terrain]};
};

test('cargo cycle is brisk, smoothly eased, and repeatable',()=>{
  const lift={maxTop:3};
  assert.deepEqual(maps.cargoLiftSample(lift,0),{height:0,phase:'boarding'});
  assert.equal(maps.cargoLiftSample(lift,1599).height,0);
  assert.equal(maps.cargoLiftSample(lift,2800).height,1.5);
  assert.equal(maps.cargoLiftSample(lift,4000).height,3);
  assert.equal(maps.cargoLiftSample(lift,5599).height,3);
  assert.equal(maps.cargoLiftSample(lift,6800).height,1.5);
  assert.equal(maps.cargoLiftSample(lift,8000).height,0);
  assert.ok(maps.cargoLiftSample(lift,1601).height<1e-8);
  assert.ok(3-maps.cargoLiftSample(lift,3999).height<1e-8);
  assert.deepEqual(maps.cargoLiftSample(lift,2800),maps.cargoLiftSample(lift,102800,100000));
});

test('all orientations allow boarding, riding, walking off, and returning by stairs',()=>{
  for(let seed=0;seed<24;seed++) {
    const {map,lift,deck,center,v,solids}=fixture(seed*7919);
    const p={x:center.x-v.x*84,y:center.y-v.y*84,height:0,alive:true};
    assert.ok(maps.moveOnTerrain(p,center.x,center.y,map,solids,100000),'clear ground boarding approach');
    for(let t=0;t<=4000;t+=50)maps.updateCargoLifts(map,[p],100000+t);
    assert.equal(p.height,lift.maxTop);
    assert.equal(p.jumpStartedAt,undefined);
    assert.ok(maps.moveOnTerrain(p,center.x+v.x*105,center.y+v.y*105,map,solids,104000),'flush upper exit');
    maps.updateCargoLifts(map,[p],106800);
    assert.equal(p.height,deck.top,'walking off detaches from descending platform');
    assert.equal(p.platformId,null);
    const stair=map.terrain.find(s=>s.stairs&&s.connector),vertical=stair.axis==='y';
    const high=stair.reverse?0:1,low=1-high;
    const point=t=>({x:stair.x+(vertical?stair.width/2:t*stair.width),y:stair.y+(vertical?t*stair.height:stair.height/2)});
    Object.assign(p,point(high),{height:deck.top,jumpStartedAt:null});
    const end=point(low+(low===0?-0.15:0.15));
    assert.ok(maps.moveOnTerrain(p,end.x,end.y,map,solids,106800));
    assert.equal(p.height,0);
    assert.equal(p.jumpStartedAt,null,'actual stair risers never trigger a fall');
  }
});

test('different client/server tick rates carry stationary passengers to identical heights',()=>{
  const a=fixture(27),b=fixture(27),pa={...a.center,height:0,alive:true},pb={...b.center,height:0,alive:true};
  for(let t=0;t<=28000;t+=10) {
    maps.updateCargoLifts(a.map,[pa],100000+t);
    if(t%50===0) {
      maps.updateCargoLifts(b.map,[pb],100000+t);
      assert.equal(pa.height,pb.height);
      assert.equal(pa.platformId,pb.platformId);
    }
  }
});

test('lift passengers can jump; raised shaft cannot be entered from underneath',()=>{
  const {map,lift,center,solids}=fixture(0),p={...center,height:0,alive:true};
  maps.updateCargoLifts(map,[p],105000);
  const takeoff=p.height;movement.startJump(p,105000);
  maps.updateCargoLifts(map,[p],105200);movement.advanceJump(p,105200);
  assert.equal(p.platformId,null);
  assert.ok(p.height>takeoff+0.5);
  assert.equal(maps.canOccupy(center.x,center.y,0,solids),false);
  for(let t=105250;t<=106500;t+=50){maps.updateCargoLifts(map,[p],t);movement.advanceJump(p,t);}
  assert.equal(p.jumpStartedAt,null);
  assert.ok(Math.abs(p.height-lift.top)<1e-8,'lands on moving surface, not stale takeoff height');
});

test('a passenger overlapping the landing is not pulled through it as the lift descends',()=>{
  const {map,lift,center,v,deck}=fixture(0),p={...center,height:0,alive:true};
  maps.updateCargoLifts(map,[p],104000);
  p.x+=v.x*52;p.y+=v.y*52;
  maps.updateCargoLifts(map,[p],106800);
  assert.equal(p.height,deck.top);
  assert.equal(p.platformId,null);
  assert.ok(lift.top<deck.top);
});

test('partial boarding uses the full player footprint so a rising deck does not clip through feet',()=>{
  const {map,lift,center,v}=fixture(0),p={x:center.x-v.x*70,y:center.y-v.y*70,height:0,alive:true};
  maps.updateCargoLifts(map,[p],102800);
  assert.equal(p.height,lift.top);
  assert.equal(p.platformId,lift.id);
});

test('players brushing a lift rail can slide and escape instead of becoming trapped',()=>{
  const rail={kind:'rail',liftId:'cargo',x:100,y:100,width:6,height:100,bottom:0,top:1};
  const map={width:500,height:500,ceiling:7.5,terrain:[rail]};
  const p={x:112,y:150,height:0,alive:true};
  assert.equal(maps.canOccupy(p.x,p.y,0,[rail]),false,'fixture begins slightly inside the padded rail footprint');
  assert.ok(maps.moveOnTerrain(p,114,170,map,[rail],0),'tangential/outward movement is permitted');
  assert.ok(Math.abs(p.x-114)<1e-8);assert.ok(Math.abs(p.y-170)<1e-8);
  assert.equal(maps.moveOnTerrain(p,108,170,map,[rail],1),false,'moving deeper into the rail remains blocked');
  assert.ok(Math.abs(p.x-114)<1e-8);
});

test('round Foundry machinery uses its visible footprint instead of invisible box corners',()=>{
  const furnace={kind:'furnace',collisionShape:'circle',collisionRadius:72,x:100,y:100,width:180,height:180,top:4.65};
  const tank={kind:'tank',collisionShape:'circle',collisionRadius:52,x:350,y:100,width:125,height:125,top:3.15};
  assert.equal(maps.canOccupy(110,110,0,[furnace]),true,'furnace corner is visibly empty');
  assert.equal(maps.canOccupy(190,190,0,[furnace]),false,'furnace shell remains solid');
  assert.equal(maps.canOccupy(358,108,0,[tank]),true,'tank corner is visibly empty');
  assert.equal(maps.canOccupy(412.5,162.5,0,[tank]),false,'tank body remains solid');
  assert.equal(combat.rayBox(90,110,1,0,furnace,1.84),Infinity,'shots and sight also pass through empty corners');
  assert.ok(Number.isFinite(combat.rayBox(90,190,1,0,furnace,1.84)));
});

test('round terrain slides along a true tangent instead of jagged axis steps',()=>{
  const tree={kind:'templeTree',collisionShape:'circle',collisionRadius:24,x:100,y:100,width:100,height:100,top:8};
  const player={x:110,y:150,height:0,bodyHeight:2.2};
  const map={width:400,height:400,ceiling:12,terrain:[tree]};
  const moved=maps.moveOnTerrain(player,116,160,map,[tree],0);
  const center={x:150,y:150},distance=Math.hypot(player.x-center.x,player.y-center.y);
  assert.equal(moved,true);assert.ok(player.y>150,'inward diagonal movement advances along the circumference');
  assert.ok(Math.abs(distance-(tree.collisionRadius+16-.09))<.015,'the slide remains on the smooth circular boundary');
});

test('rectangular props glide around body-radius corners without weakening flat faces',()=>{
  const prop={kind:'generator',x:100,y:100,width:80,height:80,top:2};
  const map={width:400,height:400,ceiling:10,terrain:[prop]};
  const corner={x:80,y:84,height:0};
  assert.ok(maps.moveOnTerrain(corner,90,88,map,[prop],0));
  assert.ok(corner.x>80&&corner.y>84,'diagonal input advances tangentially instead of sticking');
  assert.ok(Math.abs(Math.hypot(corner.x-100,corner.y-100)-(16-.09))<.015);
  const face={x:84,y:140,height:0};
  assert.equal(maps.moveOnTerrain(face,90,140,map,[prop],0),false,'a direct move through the flat face stays blocked');
  assert.deepEqual({x:face.x,y:face.y},{x:84,y:140});
});

test('lower room ceilings are enclosed soffits instead of exposed floating slabs',()=>{
  let floor;
  for(let seed=0;seed<20&&!floor;seed++){
    const candidate=maps.createPveMap(seed*7919);
    if(candidate.map.terrain.some(s=>s.kind==='ceilingPanel'))floor=candidate;
  }
  assert.ok(floor);
  const panels=floor.map.terrain.filter(s=>s.kind==='ceilingPanel');
  assert.ok(panels.length);
  for(const panel of panels){
    assert.equal(panel.top,floor.map.ceiling,'soffit fills upward to the shared roof');
    assert.ok(panel.bottom<panel.top-.28);
    const model=createTerrainModel(panel),bounds=new THREE.Box3().setFromObject(model);
    assert.ok(bounds.max.y-bounds.min.y>=panel.top-panel.bottom-.01,'visible fascia encloses the full ceiling step');
  }
});

test('stairs have real riser hits; elevated guards collide only at their actual height',()=>{
  const stairs={kind:'ramp',stairs:true,steps:15,axis:'x',x:0,y:0,width:180,height:100,top:3};
  assert.equal(combat.rayBox(-10,50,1,0,stairs,0.5),34);
  const rail={kind:'rail',x:0,y:0,width:100,height:6,bottom:3,top:4};
  assert.equal(maps.canOccupy(50,3,0,[rail]),true);
  assert.equal(maps.canOccupy(50,3,3,[rail]),false);
  assert.equal(combat.rayBox(50,-30,0,1,rail,1.84),Infinity);
  assert.equal(combat.rayBox(50,-30,0,1,rail,3.5),30);
  const slope={...rail,bottom:0,axis:'x',rise:3};
  assert.equal(combat.rayBox(50,-30,0,1,slope,0.5),Infinity);
  assert.equal(combat.rayBox(50,-30,0,1,slope,2),30);
  const upper={...stairs,bottom:3,top:6,steps:10,width:200};
  assert.equal(maps.surfaceHeight(upper,0,50),3);
  assert.equal(maps.surfaceHeight(upper,200,50),6);
  assert.equal(combat.rayBox(-10,50,1,0,upper,3.5),30,'elevated stair hits match their raised risers');
});

test('stair movement is smooth in both directions at client and server step sizes',()=>{
  for(const axis of ['x','y'])for(const reverse of [false,true])for(const stride of [2.72,8.5]) {
    const vertical=axis==='y',s={kind:'ramp',stairs:true,steps:22,axis,reverse,
      x:250,y:250,width:vertical?120:220,height:vertical?220:120,top:3.8};
    const deck={kind:'tower',walkable:true,x:vertical?250:reverse?100:470,
      y:vertical?(reverse?100:470):250,width:vertical?120:150,height:vertical?150:120,top:3.8};
    const solids=[s,deck],map={width:1000,height:1000,ceiling:7.5,terrain:solids};
    const point=t=>({x:250+(vertical?60:t*220),y:250+(vertical?t*220:60)});
    const low=reverse?1.12:-0.12,high=reverse?-0.12:1.12;
    const p={...point(low),height:0};
    for(const [start,end] of [[low,high],[high,low]]) {
      const n=Math.ceil(Math.abs(end-start)*220/stride);
      for(let i=1;i<=n;i++) {
        const next=point(start+(end-start)*i/n),previous=p.height;
        assert.ok(maps.moveOnTerrain(p,next.x,next.y,map,solids,i*50));
        // A frame can include the body-footprint landing transition plus its
        // remaining downhill travel; server frames cover more distance.
        assert.ok(Math.abs(p.height-previous)<=0.35+stride*s.top/220,'height change stays within landing and slope travel');
        assert.equal(p.jumpStartedAt,undefined,'descending stairs is not a fall');
      }
    }
    assert.equal(p.height,0);
    const side={x:vertical?225:360,y:vertical?360:225,height:0};
    assert.equal(maps.moveOnTerrain(side,vertical?310:360,vertical?360:310,map,solids,0),false,
      'smooth walking must not allow entering a steep staircase side');
  }
});

test('rendered cargo platform surface follows collision height throughout a cycle',()=>{
  const {lift}=fixture(0),model=createTerrainModel(lift);
  for(const height of [0,0.2,1.6,lift.maxTop]) {
    poseCargoLift(model,height);
    const bounds=new THREE.Box3().setFromObject(model.userData.deck);
    assert.ok(Math.abs(bounds.max.y-height)<1e-5);
    assert.ok(model.userData.piston.scale.y>0);
  }
  model.traverse(m=>{m.geometry?.dispose();m.material?.dispose();});
});

test('server carries stationary humans without accepting a client-supplied height',t=>{
  t.mock.method(Math,'random',()=>2*7919/0x100000000); // A vertical shaft with a cargo lift.
  let tick,connect,now=100000;
  t.mock.method(global,'setInterval',fn=>{tick=fn;return 0;});t.mock.method(Date,'now',()=>now);
  const handlers={},io={on(_,fn){connect=fn;},emit(){},socketsLeave(){},to(){return this;}};
  const game=server.createGameServer(io);connect({id:'p0',on(name,fn){handlers[name]=fn;}});
  game.waitingPlayers.push({id:'p0',name:'Rider',weapon:'pistol'});handlers.startGame({enableBots:true});
  try {
    const lift=game.gameMap.terrain.find(s=>s.kind==='lift'),p=game.activePlayers.find(p=>!p.isBot);
    Object.assign(p,{x:lift.x+lift.width/2,y:lift.y+lift.height/2,height:0});
    now+=4000;tick();assert.equal(p.height,lift.maxTop);
    handlers.playerUpdate({x:p.x,y:p.y,angle:0,height:100});assert.equal(p.height,lift.maxTop);
    now+=4000;tick();assert.equal(p.height,0);
  } finally {game.close();}
});

test('bots navigate onto the permanent stairs to engage an elevated player',t=>{
  t.mock.method(Math,'random',()=>2*7919/0x100000000); // A raised district with permanent stairs.
  let tick,connect,now=100000;
  t.mock.method(global,'setInterval',fn=>{tick=fn;return 0;});t.mock.method(Date,'now',()=>now);
  const handlers={},io={on(_,fn){connect=fn;},emit(){},socketsLeave(){},to(){return this;}};
  const game=server.createGameServer(io);connect({id:'p0',on(name,fn){handlers[name]=fn;}});
  game.waitingPlayers.push({id:'p0',name:'Upstairs',weapon:'pistol'});handlers.startGame({enableBots:true});
  try {
    const stair=game.gameMap.terrain.find(s=>s.stairs&&s.connector);
    const deck=game.gameMap.terrain.find(s=>s.walkable&&s.liftServed);
    const p=game.activePlayers.find(p=>!p.isBot),bots=game.activePlayers.filter(p=>p.isBot),b=bots[0];
    bots.slice(1).forEach(p=>p.alive=false);
    Object.assign(p,{x:deck.x+deck.width/2,y:deck.y+deck.height/2,height:deck.top});
    const t=stair.reverse?1.12:-0.12;
    Object.assign(b,{x:stair.x+(stair.axis==='y'?stair.width/2:t*stair.width),
      y:stair.y+(stair.axis==='y'?t*stair.height:stair.height/2),height:0,groundHeight:0,botState:{}});
    b.angle=Math.atan2(p.y-b.y,p.x-b.x);
    // Taller staircases may hide the upper floor until climbed. Give the bot
    // a legitimate remembered sighting so this tests navigation, not x-ray sight.
    b.botState.lastSeen={id:p.id,x:p.x,y:p.y,height:p.height,seenAt:now};
    let peak=0;
    for(let i=0;i<100;i++){now+=50;tick();peak=Math.max(peak,b.height||0);}
    assert.ok(peak>0.5,'pathfinding must use stair elevation, not treat the entire upper area as a wall');
  } finally {game.close();}
});
