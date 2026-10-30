import {test} from 'node:test';
import assert from 'node:assert/strict';
import navigation from '../game/navigation.js';
import arena from '../public/arenaMap.js';
import combat from '../game/hitscan.js';
import strike from '../public/strikeMap.js';
import movement from '../public/movement.js';
import * as THREE from 'three';
import {createRedVaultEnvironment} from '../public/strikeEnvironment.mjs';
import {createStrikeSpawnArrival,poseStrikeSpawnArrival,finiteMetricTree} from '../public/arena3d.js';
const strikeScale=2;
const scaled=point=>({...point,x:point.x*strikeScale,y:point.y*strikeScale,
  ...(Number.isFinite(point.height)?{height:point.height*strikeScale}:{})});

const floor=(id,sectorId,x,y,width,height,top)=>({id,kind:'floor',walkable:true,platform:true,
  sectorId,x,y,width,height,bottom:top-.2,top});

test('Red Vault doubles its physical footprint while keeping combat and lighting authored',()=>{
  const {map}=strike.createRedVaultMap();
  assert.deepEqual([map.width,map.height,map.ceiling],[5600,3800,140]);
  assert.ok(map.palette.ambientIntensity>=2.5&&map.palette.sunIntensity>=2.4);
  assert.ok(map.lightingZones.every(zone=>zone.ambient>=2.2));
  const finale=map.encounters.at(-1),command=map.strikeSectors.find(sector=>sector.id==='command');
  assert.ok(command.bounds.width>=1200&&command.bounds.height>=2000,'the boss arena has a large ring and well');
  const chamber=map.strikeSectors.find(sector=>sector.id==='boss-vault');
  assert.ok(chamber.bounds.width>=1800&&chamber.bounds.height>=1400,
    'the finale has a distinct large chamber beyond command');
  assert.equal(finale.sectorId,'boss-vault');
  assert.ok(map.dynamicState['vault-boss-gate']==='closed');
  assert.ok(map.encounters.find(encounter=>encounter.id==='command-breach').opens.includes('vault-boss-gate'));
  assert.deepEqual(finale.wardenPhases.map(phase=>phase.impact.count),[1,2,3]);
  assert.ok(map.encounters.every(encounter=>encounter.spawnGroups.some(group=>group.id?.includes('-reserve-'))),
    'each district has a visible reserve wave');
  for(const encounter of map.encounters) {
    const total=encounter.spawnGroups.reduce((count,group)=>count+group.bots.length,0);
    assert.ok(total>=17,`${encounter.id} should field a substantial multi-wave population`);
    if(['break-sorting-lock','gantry-overwatch','refinery-control','command-breach'].includes(encounter.id))continue;
    const opener=encounter.spawnGroups[0],reserve=encounter.spawnGroups.find(group=>
      group.id?.endsWith('reserve-1'));
    assert.ok(opener.bots.length>=10,`${encounter.id} should begin with a populated room`);
    assert.ok(reserve.afterRemaining+reserve.bots.length>=15,
      `${encounter.id} should reach a level-15-sized active fight`);
  }
});

test('Strike reinforcements materialize visibly before their body becomes active',()=>{
  const body=new THREE.MeshStandardMaterial({color:0x991d2b,opacity:.84,transparent:false,depthWrite:true});
  const arrival=createStrikeSpawnArrival(),record={spawnArrival:arrival,spawnRevealAt:11200,
    spawnMaterials:[{material:body,opacity:.84,transparent:false,depthWrite:true}],spawnRestored:false};
  assert.equal(poseStrikeSpawnArrival(record,10000),true);
  assert.equal(arrival.group.visible,true);
  assert.equal(body.opacity,0,'the warning column precedes the enemy silhouette');
  assert.ok(arrival.beam.material.opacity>0&&arrival.ring.material.opacity>0,
    'the arrival beam and floor ring are visibly announced');
  arrival.group.traverse(object=>{
    const values=object.geometry?.attributes?.position?.array||[];
    for(const value of values)assert.ok(Number.isFinite(value));
  });
  assert.equal(poseStrikeSpawnArrival(record,11201),false);
  assert.equal(arrival.group.visible,false);
  assert.equal(body.opacity,.84);assert.equal(body.transparent,false);assert.equal(body.depthWrite,true);
});

test('nested Strike render metrics accept structural records but reject non-finite geometry',()=>{
  assert.equal(finiteMetricTree({meshes:12,vertices:240,rampAssemblies:[
    {id:'ramp-a',length:8.2,surfaceA:[1,2,3],surfaceB:[4,5,6]},
  ]}),true);
  assert.equal(finiteMetricTree({meshes:12,rampAssemblies:[{id:'ramp-a',length:NaN}]}),false);
});

test('Assembly Gantry guidance describes the actual westward clear and its real access stair',()=>{
  const {map}=strike.createRedVaultMap();
  const encounter=map.encounters.find(value=>value.id==='gantry-overwatch');
  assert.equal(encounter.objective,'Clear the upper gantry');
  assert.equal(encounter.combatObjective,'Eliminate the gantry defenders');
  assert.equal(encounter.autoStart,true,'the controller hands directly into the gantry encounter');
  assert.ok(encounter.objectivePoint.x<encounter.trigger.x,
    'the combat waypoint leads west across the gantry instead of back to the east landing');
  const base=map.routeGuides.find(value=>value.id==='route-03-stair-base');
  const ramp=map.terrain.find(value=>value.id==='assembly-switchback');
  assert.equal(map.architecture.signs.find(value=>value.id==='assembly-gantry-wayfinding')?.text,
    'UPPER GANTRY  ↑');
  assert.ok(base&&arena.supportHeight(base.x,base.y,base.height,[...map.walls,...map.terrain],.001)!=null,
    'the east switchback has a supported lower-level route marker');
  assert.ok(base.x>=ramp.x&&base.x<=ramp.x+ramp.width&&base.y>=ramp.y&&base.y<=ramp.y+ramp.height);
});

test('Assembly Gantry defenders cannot spawn behind their own completion shutter',()=>{
  const {map,walls}=strike.createRedVaultMap();
  const encounter=map.encounters.find(value=>value.id==='gantry-overwatch');
  const shutter=walls.find(value=>value.id==='assembly-shutter');
  const playerSide=Math.sign(encounter.checkpointSpawns[0].x-(shutter.x+shutter.width/2));
  assert.equal(playerSide,1,'the fireteam approaches the shutter from the east gantry');
  for(const spawn of encounter.spawnGroups.flatMap(group=>group.bots))
    assert.equal(Math.sign(spawn.x-(shutter.x+shutter.width/2)),playerSide,
      `gantry defender at ${spawn.x},${spawn.y} is locked behind assembly-shutter`);
});

test('clearing the gantry exposes a real shuttered route into the live furnace',()=>{
  const {map,walls}=strike.createRedVaultMap();
  const route=[{x:1130,y:1000},{x:1095,y:1000},{x:1060,y:1000},
    {x:1000,y:1000},{x:970,y:970},{x:970,y:900}].map(scaled);
  const walk=solids=>{
    const actor={...scaled({x:1160,y:1000,height:12}),groundHeight:24,bodyHeight:2.2};
    return route.map((point,index)=>arena.moveOnTerrain(actor,point.x,point.y,map,solids,index*16));
  };
  const closed=[...walls,...map.terrain];
  assert.deepEqual(walk(closed),[true,true,true,false,false,false],
    'the visible shutter—not a hidden shell wall—must be the only closed-state blocker');
  const opened=[...walls.map(solid=>solid.id==='assembly-shutter'?{...solid,nonSolid:true}:solid),...map.terrain];
  assert.ok(walk(opened).every(Boolean),
    'opening assembly-shutter must provide a continuous capsule-safe route into the furnace gallery');
});

test('bounded Strike sectors preserve several authored elevations at overlapping XY',()=>{
  const terrain=[floor('lower','stack',100,100,600,320,0),floor('middle','stack',100,100,600,320,6),
    floor('upper','stack',100,100,600,320,12)];
  const map={activity:'strike',width:900,height:620,ceiling:20,terrain,
    strikeSectors:[{id:'stack',bounds:{x:100,y:100,width:600,height:320,bottom:0,top:16},navCellSize:48}]};
  const graph=new navigation.NavigationGraph(map,[]),center=graph.nodes.filter(node=>
    Math.abs(node.x-400)<30&&Math.abs(node.y-260)<30).map(node=>node.height).sort((a,b)=>a-b);
  assert.deepEqual(center,[0,6,12]);
  assert.deepEqual(graph.find({x:180,y:180,height:0,zone:'stack'},
    {x:620,y:340,height:12,zone:'stack'}),[],'overlapping floors are not vertical teleport links');
  assert.ok(graph.cells<1000,'bounded sectors do not allocate a world-scale 3D grid');
});

test('authored nav links join sectors only through a physically walkable incline',()=>{
  const lower=floor('lower-floor','lower',80,100,320,220,0);
  const upper=floor('upper-floor','upper',600,100,320,220,6);
  const ramp={id:'real-stair',kind:'ramp',walkable:true,platform:true,sectorId:['lower','upper'],
    x:400,y:130,width:200,height:160,bottom:0,top:6,axis:'x'};
  const base={activity:'strike',width:1000,height:500,ceiling:16,terrain:[lower,upper,ramp],
    strikeSectors:[
      {id:'lower',bounds:{x:60,y:80,width:500,height:260,bottom:0,top:10},navCellSize:40},
      {id:'upper',bounds:{x:440,y:80,width:500,height:260,bottom:0,top:12},navCellSize:40},
    ]};
  const physical={id:'lower-upper',from:'lower',to:'upper',
    a:{x:480,y:210,height:2.4},b:{x:520,y:210,height:3.6}};
  const graph=new navigation.NavigationGraph({...base,navLinks:[physical]},[]);
  assert.deepEqual(graph.invalidLinks,[]);
  const start={x:180,y:210,height:0,zone:'lower'},goal={x:820,y:210,height:6,zone:'upper'};
  const path=graph.find(start,goal);
  assert.ok(path.length,'the real incline connects both bounded sectors');
  for(let index=1;index<path.length;index++)assert.ok(graph.clear(path[index-1],path[index]));
  assert.ok(graph.find(goal,start).length,'the incline is bidirectional');

  const teleport={...physical,id:'teleport',a:{x:400,y:110,height:0},b:{x:600,y:110,height:6}};
  const invalid=new navigation.NavigationGraph({...base,navLinks:[teleport]},[]);
  assert.equal(invalid.invalidLinks[0]?.id,'teleport');
  assert.deepEqual(invalid.find(start,goal),[]);
});

test('eventual Strike shutters open the cached graph while live collision and hitscan remain authoritative',()=>{
  const terrain=[floor('west-floor','west',80,80,400,300,0),floor('east-floor','east',520,80,400,300,0)];
  const shutter={id:'freight-shutter',kind:'strikeDoor',x:480,y:80,width:40,height:300,bottom:0,top:6};
  const map={activity:'strike',width:1000,height:500,ceiling:12,terrain,
    strikeSectors:[
      {id:'west',bounds:{x:60,y:60,width:460,height:340,bottom:0,top:10},navCellSize:40},
      {id:'east',bounds:{x:480,y:60,width:460,height:340,bottom:0,top:10},navCellSize:40}],
    navLinks:[{id:'shutter-channel',from:'west',to:'east',a:{x:470,y:230,height:0},b:{x:530,y:230,height:0}}]};
  const graph=new navigation.NavigationGraph(map,[shutter]);
  assert.deepEqual(graph.invalidLinks,[]);
  assert.ok(graph.find({x:180,y:230,height:0,zone:'west'},
    {x:820,y:230,height:0,zone:'east'}).length,'eventual-open route is retained in the cached graph');

  const player={x:470,y:230,height:0,groundHeight:0,bodyHeight:2.2};
  assert.equal(arena.moveOnTerrain(player,530,230,map,[shutter,...terrain],0),false);
  const blocked=combat.traceShot({id:'s',x:470,y:230,height:0,eyeHeight:1.84,alive:true},0,
    [shutter],[],()=>true,0,map);
  assert.equal(blocked.hit,'wall');
  const opened={...shutter,nonSolid:true},moved={x:470,y:230,height:0,groundHeight:0,bodyHeight:2.2};
  assert.equal(arena.moveOnTerrain(moved,530,230,map,[opened,...terrain],0),true);
  assert.notEqual(combat.traceShot({id:'s',x:470,y:230,height:0,eyeHeight:1.84,alive:true},0,
    [opened],[],()=>true,0,map).hit,'wall');
});

test('legacy endless navigation remains on its dense two-layer grid',()=>{
  const map={activity:'endless',width:320,height:192,ceiling:8,
    terrain:[floor('legacy',undefined,0,0,320,192,0)]};
  const graph=new navigation.NavigationGraph(map,[]);
  assert.equal(graph.sectorMode,false);assert.equal(graph.size,16);
  assert.equal(graph.cells,20*12);assert.equal(graph.open.length,20*12*2);
  assert.ok(graph.find({x:40,y:40,height:0},{x:280,y:152,height:0}).length>1);
});

function eventualRedVaultSolids(map,walls) {
  const solids=[...walls,...map.terrain].map(solid=>solid.kind==='strikeDoor'?{...solid,nonSolid:true}:
    solid.dynamicId==='command-bridge'?{...solid,nonSolid:false}:solid);
  // The hoist's two landings are valid at different moments. Preserve its
  // live lower-state collider and add only a thin eventual upper deck for the
  // bounded topology audit; arbitrary intermediate motion is never treated
  // as a permanent navigation surface.
  for(const lift of map.terrain.filter(surface=>surface.kind==='lift'&&
    Number.isFinite(surface.maxTop)&&surface.maxTop>surface.top))
    solids.push({...lift,id:`${lift.id}:eventual-upper`,bottom:lift.maxTop-(lift.top-lift.bottom),
      top:lift.maxTop});
  return solids;
}

function bodyProfile(point) {
  if(Number.isFinite(point.bodyRadius)||Number.isFinite(point.bodyHeight))
    return{radius:point.bodyRadius??16,height:point.bodyHeight??2.2};
  if(point.botType==='ogre')return{radius:30,height:3.8};
  if(point.botType==='guardian')return{radius:28,height:3.4};
  return{radius:16,height:2.2};
}

function linkEndpoint(link,side) {
  const point=side==='from'?link.a:link.b;
  return{...point,zone:link[side]};
}

function assertWalked(actor,target,label) {
  assert.ok(actor.jumpStartedAt==null,`${label} unexpectedly became airborne`);
  assert.ok(Math.hypot(actor.x-target.x,actor.y-target.y)<.08,
    `${label} was deflected to (${actor.x.toFixed(2)}, ${actor.y.toFixed(2)})`);
  assert.ok(Math.abs(actor.height-target.height)<.08,
    `${label} ended at ${actor.height.toFixed(3)} instead of ${target.height.toFixed(3)}`);
}

function sweepRamp(ramp,map,solids,lane,reverse) {
  // Start and finish a full player radius plus clearance beyond the authored
  // ramp.  A ramp can be perfectly clear over t=[0,1] while its parapet,
  // landing cap, neighbouring machine or adjoining wall still snags the
  // capsule during the actual deck-to-slope transition.
  const length=ramp.axis==='y'?ramp.height:ramp.width,extension=24;
  const distance=length+extension*2,steps=Math.ceil(distance/2);
  const point=index=>{let t=(-extension+distance*index/steps)/length;
    if(reverse)t=1-t;
    const x=ramp.axis==='y'?ramp.x+ramp.width*lane:ramp.x+ramp.width*t;
    const y=ramp.axis==='y'?ramp.y+ramp.height*t:ramp.y+ramp.height*lane;
    return{x,y,height:arena.walkingHeight(ramp,x,y)};};
  const first=point(0),allowance=arena.rampStepAllowance(ramp,16);
  if(!arena.canOccupy(first.x,first.y,first.height,solids,16,allowance,2.2))return false;
  const actor={...first,groundHeight:first.height,bodyHeight:2.2};
  for(let index=1;index<=steps;index++) {
    const next=point(index);
    if(!arena.canOccupy(next.x,next.y,next.height,solids,16,allowance,2.2)||
      !arena.moveOnTerrain(actor,next.x,next.y,map,solids,index*16)||actor.jumpStartedAt!=null||
      Math.hypot(actor.x-next.x,actor.y-next.y)>.05||Math.abs(actor.height-next.height)>.08)return false;
  }
  return true;
}

test('every Red Vault authored point is exactly supported and capsule-clear',()=>{
  const {map,walls}=strike.createRedVaultMap(),solids=[...walls,...map.terrain],points=[];
  map.playerSpawns.forEach((point,index)=>points.push([`player-${index}`,point]));
  for(const encounter of map.encounters) {
    if(encounter.objectivePoint)points.push([`${encounter.id}:objective`,encounter.objectivePoint]);
    encounter.checkpointSpawns.forEach((point,index)=>points.push([`${encounter.id}:checkpoint-${index}`,point]));
    encounter.spawnGroups.flatMap(group=>group.bots).forEach((point,index)=>
      points.push([`${encounter.id}:bot-${index}`,point]));
  }
  const failures=[];
  for(const [label,point] of points) {
    const profile=bodyProfile(point),support=arena.supportHeight(point.x,point.y,point.height,solids,.001);
    if(Math.abs(support-point.height)>.08||
      !arena.canOccupy(point.x,point.y,point.height,solids,profile.radius,.001,profile.height))
      failures.push(`${label}(support=${support.toFixed(3)}, authored=${point.height})`);
  }
  assert.deepEqual(failures,[]);
});

test('every usable Red Vault ramp lane is capsule-safe in both directions across both deck seams',()=>{
  const {map,walls}=strike.createRedVaultMap(),solids=eventualRedVaultSolids(map,walls);
  const failures=[];
  for(const ramp of map.terrain.filter(surface=>surface.kind==='ramp')) {
    // Twenty percent is the first capsule-safe centre line inside an 8-unit
    // parapet on the narrowest authored ramp. Sampling through eighty percent
    // catches props, end caps and landing rails that clip only one side of an
    // otherwise apparently traversable stair.
    for(const lane of [.2,.35,.5,.65,.8])for(const reverse of [false,true])
      if(!sweepRamp(ramp,map,solids,lane,reverse))
        failures.push(`${ramp.id}@${lane}:${reverse?'reverse':'forward'}`);
  }
  assert.deepEqual(failures,[]);
});

test('every Red Vault incline has a substantial exact structural casing for movement and shots',()=>{
  const {map}=strike.createRedVaultMap(),ramps=map.terrain.filter(surface=>surface.kind==='ramp');
  assert.equal(ramps.length,12,'the audit must include every authored incline and hinged bridge');
  const failures=[];
  for(const ramp of ramps) {
    if(!Number.isFinite(ramp.structureDepth)||ramp.structureDepth<.6)
      failures.push(`${ramp.id}:thin-${ramp.structureDepth}`);
    for(const t of [.08,.5,.92]) {
      const x=ramp.axis==='y'?ramp.x+ramp.width/2:ramp.x+ramp.width*t;
      const y=ramp.axis==='y'?ramp.y+ramp.height*t:ramp.y+ramp.height/2;
      const top=arena.walkingHeight(ramp,x,y),bottom=arena.bottomHeight(ramp,x,y);
      if(Math.abs((top-bottom)-ramp.structureDepth)>1e-8)
        failures.push(`${ramp.id}@${t}:underside`);
    }
    const x=ramp.x+ramp.width/2,y=ramp.y+ramp.height/2;
    const top=arena.walkingHeight(ramp,x,y),bottom=arena.bottomHeight(ramp,x,y);
    const origin=ramp.axis==='x'?{x,y:ramp.y-40,dx:0,dy:1}:
      {x:ramp.x-40,y,dx:1,dy:0};
    if(!Number.isFinite(combat.rayBox(origin.x,origin.y,origin.dx,origin.dy,ramp,
      (top+bottom)/2,0)))failures.push(`${ramp.id}:mid-body-shot-misses`);
    if(Number.isFinite(combat.rayBox(origin.x,origin.y,origin.dx,origin.dy,ramp,
      bottom-.04,0)))failures.push(`${ramp.id}:ghost-collision-below-visible-underside`);
    if(Number.isFinite(combat.rayBox(origin.x,origin.y,origin.dx,origin.dy,ramp,
      top+.04,0)))failures.push(`${ramp.id}:collision-above-visible-top`);
  }
  assert.deepEqual(failures,[]);
});

test('Red Vault visible walkable surfaces and authoritative support never diverge',()=>{
  const {map,walls}=strike.createRedVaultMap(),solids=eventualRedVaultSolids(map,walls);
  const failures=[],untested=[];
  for(const surface of map.terrain.filter(item=>item.walkable&&!item.nonPlayable&&item.kind!=='lift')) {
    const inset=surface.kind==='ramp'?18:16;
    const minX=surface.x+Math.min(inset,surface.width/2),maxX=surface.x+surface.width-Math.min(inset,surface.width/2);
    const minY=surface.y+Math.min(inset,surface.height/2),maxY=surface.y+surface.height-Math.min(inset,surface.height/2);
    const nx=Math.max(1,Math.ceil(Math.max(0,maxX-minX)/16));
    const ny=Math.max(1,Math.ceil(Math.max(0,maxY-minY)/16));
    let tested=0;
    for(let iy=0;iy<=ny;iy++)for(let ix=0;ix<=nx;ix++) {
      const x=minX+(maxX-minX)*ix/nx,y=minY+(maxY-minY)*iy/ny;
      if(surface.collisionShape==='polygon'&&arena.horizontalClearance(surface,x,y)>0)continue;
      const height=arena.walkingHeight(surface,x,y);
      const allowance=surface.kind==='ramp'?arena.rampStepAllowance(surface,16):.001;
      if(!arena.canOccupy(x,y,height,solids,16,allowance,2.2))continue;
      tested++;
      const support=arena.supportHeight(x,y,height,solids,allowance);
      if(Math.abs(support-height)>.08)
        failures.push(`${surface.id}@${x.toFixed(1)},${y.toFixed(1)} rendered=${height.toFixed(3)} support=${support.toFixed(3)}`);
    }
    if(!tested)untested.push(surface.id);
  }
  assert.deepEqual(untested,[],'every visible walkable surface needs capsule-clear samples');
  assert.deepEqual(failures,[],'visible deck/ramp tops must equal physical support within 8 cm');
});

function outlineEdges(surface) {
  const points=surface.collisionShape==='polygon'?surface.collisionPolygon:[
    {x:surface.x,y:surface.y},{x:surface.x+surface.width,y:surface.y},
    {x:surface.x+surface.width,y:surface.y+surface.height},{x:surface.x,y:surface.y+surface.height},
  ];
  const centroid=points.reduce((value,point)=>({x:value.x+point.x/points.length,
    y:value.y+point.y/points.length}),{x:0,y:0});
  return points.map((a,index)=>{
    const b=points[(index+1)%points.length],dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
    let inwardX=-dy/length,inwardY=dx/length;
    const midX=(a.x+b.x)/2,midY=(a.y+b.y)/2;
    if((centroid.x-midX)*inwardX+(centroid.y-midY)*inwardY<0) {
      inwardX=-inwardX;inwardY=-inwardY;
    }
    return{a,b,dx,dy,length,inwardX,inwardY};
  });
}

function exactAuthoredSupport(x,y,height,solids) {
  return solids.some(surface=>!surface.nonSolid&&!surface.nonPlayable&&
    surface.kind!=='ceilingPanel'&&(surface.walkable||surface.platform===true||surface.kind==='ramp')&&
    arena.horizontalClearance(surface,x,y)<=.01&&
    Math.abs(arena.walkingHeight(surface,x,y)-height)<=.08);
}

test('bounded Red Vault perimeter flood finds no reachable implicit-ground or void leaks',()=>{
  const {map,walls}=strike.createRedVaultMap(),solids=eventualRedVaultSolids(map,walls);
  const failures=[];let probes=0;
  for(const surface of solids.filter(item=>item.walkable&&!item.nonPlayable&&
    item.kind!=='lift'&&item.kind!=='heightfield')) {
    const allowance=surface.kind==='ramp'?arena.rampStepAllowance(surface,16):.001;
    for(const edge of outlineEdges(surface)) {
      // Endpoints are owned by the neighbouring edge. Keeping one capsule
      // radius away from each corner avoids double-counting the same join.
      const margin=Math.min(24,edge.length*.25),span=Math.max(0,edge.length-margin*2);
      const count=Math.max(1,Math.ceil(span/52));
      for(let index=0;index<count;index++) {
        const along=edge.length<=margin*2?.5:(margin+span*(index+.5)/count)/edge.length;
        const boundaryX=edge.a.x+edge.dx*along,boundaryY=edge.a.y+edge.dy*along;
        let start=null;
        for(const depth of [24,32,40,48]) {
          const x=boundaryX+edge.inwardX*depth,y=boundaryY+edge.inwardY*depth;
          if(arena.horizontalClearance(surface,x,y)>.01)continue;
          const height=arena.walkingHeight(surface,x,y);
          if(Math.abs(arena.supportHeight(x,y,height,solids,allowance)-height)<=.08&&
            arena.canOccupy(x,y,height,solids,16,allowance,2.2)) {start={x,y,height};break;}
        }
        if(!start)continue;
        probes++;
        const target={x:boundaryX-edge.inwardX*26,y:boundaryY-edge.inwardY*26};
        const actor={...start,groundHeight:start.height,bodyHeight:2.2};
        arena.moveOnTerrain(actor,target.x,target.y,map,solids,100);
        const outward=(actor.x-boundaryX)*-edge.inwardX+(actor.y-boundaryY)*-edge.inwardY;
        if(outward<18)continue; // a matching wall, curb or rail stopped the body
        if(actor.jumpStartedAt!=null||!exactAuthoredSupport(actor.x,actor.y,actor.height,solids))
          failures.push(`${surface.id}@${boundaryX.toFixed(1)},${boundaryY.toFixed(1)}`);
      }
    }
  }
  assert.ok(probes>=350,`perimeter audit sampled only ${probes} reachable edges`);
  assert.deepEqual(failures,[],`${probes} bounded perimeter probes must end on authored support or a guard`);
});

test('Red Vault critical layered boundaries remain physically sealed and bridgeable',()=>{
  const {map,walls}=strike.createRedVaultMap(),solids=eventualRedVaultSolids(map,walls);
  assert.ok(!exactAuthoredSupport(2500,600,40,solids),
    'the rectangular north-west corner outside the octagonal shaft must not be walkable');

  const crown={...scaled({x:1750,y:350,height:36}),groundHeight:72,bodyHeight:2.2};
  for(const target of [{x:1835,y:350},{x:1900,y:350},{x:1946,y:350}].map(scaled))
    assert.ok(arena.moveOnTerrain(crown,target.x,target.y,map,solids,100));
  assert.ok(crown.jumpStartedAt==null&&crown.x>3890,
    'the split north-east chamfer must leave a real capsule-safe bridge throat');

  for(const [label,start,target] of [
    ['furnace bridge',{x:760,y:820,height:12},{x:760,y:740}],
    ['lower vault well',{x:2360,y:600,height:38},{x:2360,y:520}],
    ['upper command ring',{x:2450,y:530,height:42},{x:2450,y:590}],
  ]) {
    const from=scaled(start),to=scaled(target);
    const actor={...from,groundHeight:from.height,bodyHeight:2.2};
    arena.moveOnTerrain(actor,to.x,to.y,map,solids,100);
    assert.ok(Math.hypot(actor.x-to.x,actor.y-to.y)>8&&actor.jumpStartedAt==null,
      `${label} needs a visible physical no-fall boundary`);
  }
});

test('lowering the command bridge opens a physical route before the deeper Vault shutter',()=>{
  const {map,walls}=strike.createRedVaultMap();
  const solids=[...walls.map(solid=>solid.id==='command-bridge-raised'?{...solid,nonSolid:true}:solid),
    ...map.terrain.map(solid=>solid.dynamicId==='command-bridge'?{...solid,nonSolid:false}:solid)];
  const actor={...scaled({x:1900,y:350,height:36}),groundHeight:72,bodyHeight:2.2};
  for(let x=1910;x<=2240;x+=10)assert.ok(arena.moveOnTerrain(actor,x*2,700,map,solids,100+x));
  assert.ok(actor.x>=4478&&Math.abs(actor.height-84)<.12,
    'the lowered bridge must reach command floor instead of a wall at its far landing');
  assert.notEqual(solids.find(solid=>solid.id==='command-breach-shutter').nonSolid,true,
    'the later Vault shutter remains a distinct interior objective');
});

test('structural posts leave the refinery and command stair mouths capsule-clear',()=>{
  const {map,walls}=strike.createRedVaultMap(),solids=eventualRedVaultSolids(map,walls);
  for(const route of [
    {label:'refinery ascent',start:{x:365,y:450,height:12.41},end:{x:680,y:450,height:20}},
    {label:'north command stair',start:{x:2275,y:600,height:42.35},end:{x:2275,y:325,height:48}},
    {label:'south command stair',start:{x:2640,y:760,height:42.35},end:{x:2640,y:1035,height:48}},
  ]) {
    const start=scaled(route.start),end=scaled(route.end);
    const actor={...start,groundHeight:start.height,bodyHeight:2.2};
    const steps=70;
    for(let index=1;index<=steps;index++) {
      const t=index/steps,x=start.x+(end.x-start.x)*t;
      const y=start.y+(end.y-start.y)*t;
      arena.moveOnTerrain(actor,x,y,map,solids,index*20);
    }
    assert.ok(Math.hypot(actor.x-end.x,actor.y-end.y)<1,
      `${route.label} is still obstructed by a support or rail post`);
  }
});

test('the forge hoist guide leaves a full natural approach into the west stair',()=>{
  const {map,walls}=strike.createRedVaultMap(),solids=[...walls,...map.terrain];
  const actor={...scaled({x:1465,y:725,height:30}),groundHeight:60,bodyHeight:2.2};
  for(let x=1455;x>=1360;x-=5)
    assert.ok(arena.moveOnTerrain(actor,x*2,1450,map,solids,100+(1465-x)),
      `the hoist-side approach is blocked at x=${x}`);
  for(let y=720;y>=684;y-=4)
    assert.ok(arena.moveOnTerrain(actor,2720,y*2,map,solids,300+(725-y)),
      `the stair mouth is blocked at y=${y}`);
  assertWalked(actor,scaled({x:1360,y:684,height:30.32}),'forge west-stair approach');
  const westGuide=walls.find(solid=>solid.id==='hoist-rail-west');
  assert.ok(westGuide.y>=1500,'the thick hoist guide must begin beyond the stair circulation throat');
});

test('both command stairs remain completely traversable while the Vault shutter is closed',()=>{
  const {map,walls}=strike.createRedVaultMap(),solids=[...walls,...map.terrain];
  for(const route of [
    {label:'north command stair',start:{x:2275,y:635,height:42},end:{x:2275,y:335,height:48}},
    {label:'south command stair',start:{x:2640,y:725,height:42},end:{x:2640,y:1025,height:48}},
  ]) {
    const start=scaled(route.start),end=scaled(route.end);
    const actor={...start,groundHeight:start.height,bodyHeight:2.2};
    for(let index=1;index<=100;index++) {
      const t=index/100;
      assert.ok(arena.moveOnTerrain(actor,start.x+(end.x-start.x)*t,
        start.y+(end.y-start.y)*t,map,solids,index*16),
      `${route.label} is obstructed at ${(t*100).toFixed(0)}%`);
    }
    assertWalked(actor,end,route.label);
  }
  const shutter=walls.find(solid=>solid.id==='command-breach-shutter');
  assert.ok(shutter.y>=1300&&shutter.y+shutter.height<=1440,
    'the closed shutter belongs between the stair flights, never across either flight');
});

test('Red Vault substantial render assets and gameplay solids share one explicit collision registry',()=>{
  const {map,walls}=strike.createRedVaultMap(),solids=[...walls,...map.terrain];
  const ids=new Set(solids.map(solid=>solid.id)),bindings=map.assetCollision;
  const byAsset=new Map(bindings.map(binding=>[binding.assetId,binding]));
  assert.equal(byAsset.size,bindings.length,'render asset IDs must be unique');
  for(const binding of bindings) {
    assert.ok(['solid','surface','decorative','trigger'].includes(binding.intent),
      `${binding.assetId} lacks an explicit collision intent`);
    for(const colliderId of binding.colliderIds||[])assert.ok(ids.has(colliderId),
      `${binding.assetId} references missing collider ${colliderId}`);
    if(!(binding.colliderIds||[]).length)assert.ok(binding.nonSolidReason,
      `${binding.assetId} has no collider and no non-solid reason`);
  }
  const bound=new Set(bindings.flatMap(binding=>binding.colliderIds||[]));
  const unbound=solids.filter(solid=>!bound.has(solid.id)).map(solid=>solid.id);
  assert.deepEqual(unbound,[],'every gameplay solid needs a visible asset binding');
  for(const collection of ['columns','beams','rails','pipes','conveyors','machines','rampAssemblies','distantMassing'])
    for(const asset of map.architecture[collection]||[])assert.ok(byAsset.has(asset.id),
      `${collection}:${asset.id} lacks a registry classification`);
});

test('Red Vault rail render definitions exactly mirror their authoritative colliders',()=>{
  const {map,walls}=strike.createRedVaultMap(),byId=new Map([...walls,...map.terrain].map(solid=>[solid.id,solid]));
  const failures=[];
  for(const visual of map.architecture.rails) {
    const collider=byId.get(visual.id);
    if(!collider||collider.kind!=='rail') {failures.push(`${visual.id}:missing-rail-collider`);continue;}
    for(const key of ['x','y','width','height','bottom','top'])
      if(Math.abs((visual[key]??NaN)-(collider[key]??NaN))>1e-9)
        failures.push(`${visual.id}:${key}`);
    for(const key of ['axis','rise'])if(visual[key]!==collider[key])
      failures.push(`${visual.id}:${key}`);
    if(!!visual.reverse!==!!collider.reverse)failures.push(`${visual.id}:reverse`);
    // Check both endpoints, not just the common centre: this catches a rail
    // rendered flat while its collision follows an inclined stair.
    if(collider.axis) {
      const a=collider.axis==='x'?{x:collider.x,y:collider.y+collider.height/2}:
        {x:collider.x+collider.width/2,y:collider.y};
      const b=collider.axis==='x'?{x:collider.x+collider.width,y:a.y}:
        {x:a.x,y:collider.y+collider.height};
      const visualBase=(point)=>visual.bottom+(visual.rise||0)*
        (visual.reverse?1-(visual.axis==='x'?(point.x-visual.x)/visual.width:
          (point.y-visual.y)/visual.height):(visual.axis==='x'?(point.x-visual.x)/visual.width:
          (point.y-visual.y)/visual.height));
      if(Math.abs(visualBase(a)-arena.bottomHeight(collider,a.x,a.y))>.001||
        Math.abs(visualBase(b)-arena.bottomHeight(collider,b.x,b.y))>.001)
        failures.push(`${visual.id}:slope-endpoints`);
    }
  }
  assert.ok(map.architecture.rails.length>=60,'audit must cover the full authored guard network');
  assert.deepEqual(failures,[]);
});

test('Red Vault conveyors have visible, jumpable tops with no invisible collision cap',()=>{
  const {map,walls}=strike.createRedVaultMap(),solids=[...walls,...map.terrain];
  const root=createRedVaultEnvironment(map);
  try {
    root.updateMatrixWorld(true);
    const jumpApex=movement.MOVEMENT.jumpSpeed**2/(2*movement.MOVEMENT.gravity);
    for(const conveyor of map.architecture.conveyors) {
      const collider=walls.find(solid=>solid.id===conveyor.id);
      assert.ok(collider,`${conveyor.id} is missing its authoritative collider`);
      assert.ok(collider.top-collider.bottom<jumpApex-.25,
        `${conveyor.id} must leave a forgiving portion of the jump arc`);

      const visibleTop=new THREE.Box3();
      for(const child of root.getObjectByName(conveyor.id).children)
        if(child.name.endsWith('-frame')||child.name.endsWith('-belt')||child.name.endsWith('-slat'))
          visibleTop.union(new THREE.Box3().setFromObject(child));
      assert.ok(Math.abs(visibleTop.max.y-collider.top)<.015,
        `${conveyor.id} render top and collision top diverge`);

      const player={x:collider.x-16.5,y:collider.y+collider.height/2,height:collider.bottom,
        groundHeight:collider.bottom,bodyHeight:2.2,jumpStartedAt:0,jumpBase:collider.bottom,
        jumpVelocity:movement.MOVEMENT.jumpSpeed,alive:true};
      const peakMs=movement.MOVEMENT.jumpSpeed/movement.MOVEMENT.gravity*1000;
      movement.advanceJump(player,peakMs);
      assert.ok(arena.moveOnTerrain(player,collider.x+18,player.y,map,solids,peakMs),
        `${conveyor.id} rejects a normal jump onto its belt`);
      assert.equal(player.groundHeight,collider.top);
      movement.advanceJump(player,600);
      assert.equal(player.jumpStartedAt,null);
      assert.equal(player.height,collider.top);
    }
  } finally {root.userData.dispose();}
});

test('Red Vault hoist has authoritative moving cage collision at both landings',()=>{
  const {map,walls}=strike.createRedVaultMap(),lift=map.terrain.find(surface=>surface.kind==='lift');
  assert.ok(lift);
  const cageRails=map.terrain.filter(surface=>surface.liftId===lift.id);
  assert.ok(cageRails.length>=2,'visible cage posts need moving collision rails');
  for(const top of [lift.minTop,lift.maxTop]) {
    lift.top=top;
    for(const rail of cageRails) {
      rail.bottom=top+(rail.liftBottomOffset??0);
      rail.top=top+(rail.liftTopOffset??1);
    }
    const center={x:lift.x+lift.width/2,y:lift.y+lift.height/2};
    assert.ok(Math.abs(arena.supportHeight(center.x,center.y,top,map.terrain)-top)<.03);
    assert.ok(arena.canOccupy(center.x,center.y,top,map.terrain,16,.001,2.2));

    // The south opening is the permanent boarding side at both stops. This
    // checks the complete cage/shaft/deck composition, not only its centre.
    const solids=[...walls,...map.terrain],dock={x:2980,y:1750,height:top};
    assert.ok(Math.abs(arena.supportHeight(dock.x,dock.y,top,solids,.001)-top)<.03,
      `hoist ${top} m dock has no matching support`);
    assert.ok(arena.canOccupy(dock.x,dock.y,top,solids,16,.001,2.2),
      `hoist ${top} m dock is capsule-blocked`);
    const passenger={...dock,groundHeight:top,bodyHeight:2.2};
    assert.ok(arena.moveOnTerrain(passenger,2980,1560,map,solids,100));
    assertWalked(passenger,{x:2980,y:1560,height:top},`hoist ${top} m boarding`);
    assert.equal(passenger.groundPlatformId,lift.id);
    assert.ok(arena.moveOnTerrain(passenger,dock.x,dock.y,map,solids,200));
    assertWalked(passenger,dock,`hoist ${top} m exit`);
  }
});

test('Red Vault shutters block bodies and shots until their authoritative open state',()=>{
  const {map,walls}=strike.createRedVaultMap();
  for(const door of walls.filter(solid=>solid.kind==='strikeDoor')) {
    const vertical=door.width<=door.height,foot=door.bottom;
    const center={x:door.x+door.width/2,y:door.y+door.height/2};
    assert.equal(arena.canOccupy(center.x,center.y,foot,[door],16,.001,2.2),false,
      `${door.id} does not block a capsule while closed`);
    assert.equal(arena.canOccupy(center.x,center.y,foot,[{...door,nonSolid:true}],16,.001,2.2),true,
      `${door.id} still blocks a capsule while open`);
    const start=vertical?{x:door.x-50,y:center.y}:{x:center.x,y:door.y-50};
    const angle=vertical?0:Math.PI/2;
    const localMap={width:map.width,height:map.height,roof:false,terrain:[],worldBounds:map.worldBounds};
    const shooter={id:'probe',...start,height:foot,eyeHeight:Math.min(1.1,(door.top-door.bottom)/2),alive:true};
    assert.equal(combat.traceShot(shooter,angle,[door],[],()=>true,0,localMap).hit,'wall',
      `${door.id} does not stop a closed-state shot`);
    assert.notEqual(combat.traceShot(shooter,angle,[{...door,nonSolid:true}],[],()=>true,0,localMap).hit,'wall',
      `${door.id} still stops an open-state shot`);
  }
});

test('Red Vault local ceilings block bodies and upward or angled fire',()=>{
  const {map}=strike.createRedVaultMap();
  for(const roof of map.terrain.filter(surface=>surface.kind==='ceilingPanel')) {
    const x=roof.x+roof.width/2,y=roof.y+roof.height/2,foot=roof.bottom-4;
    assert.ok(Math.abs(arena.ceilingHeightAt(x,y,foot,[roof],16)-roof.bottom)<1e-6,
      `${roof.id} does not expose its visible underside to movement`);
    assert.equal(arena.canOccupy(x,y,roof.bottom-1,[roof],16,.001,2.2),false,
      `${roof.id} permits a capsule through its underside`);
    assert.ok(Number.isFinite(combat.rayBox(x,y,1,0,roof,roof.bottom-2,Math.tan(1.35)*.05)),
      `${roof.id} does not stop angled upward fire`);
  }
});

test('every substantial Red Vault collider blocks both movement and hitscan on its visible footprint',()=>{
  const {map,walls}=strike.createRedVaultMap();
  const failures=[];
  for(const solid of [...walls,...map.terrain]) {
    if(solid.nonSolid||solid.walkable||solid.kind==='ceilingPanel'||solid.kind==='heightfield'||solid.kind==='lift')continue;
    const x=solid.collisionA&&solid.collisionB?(solid.collisionA.x+solid.collisionB.x)/2:solid.x+solid.width/2;
    const y=solid.collisionA&&solid.collisionB?(solid.collisionA.y+solid.collisionB.y)/2:solid.y+solid.height/2;
    const bottom=arena.bottomHeight(solid,x,y),top=arena.walkingHeight(solid,x,y);
    if(top<=bottom+.001)continue;
    if(arena.canOccupy(x,y,bottom,[solid],16,.001,2.2))failures.push(`${solid.id}:movement`);
    const originX=solid.x-50,originY=y,hit=combat.rayBox(originX,originY,1,0,solid,(bottom+top)/2,0);
    if(!Number.isFinite(hit))failures.push(`${solid.id}:hitscan`);
  }
  assert.deepEqual(failures,[]);
});

test('Red Vault bounded navigation validates every physical link and authored endpoint',()=>{
  const {map,walls}=strike.createRedVaultMap(),graph=new navigation.NavigationGraph(map,walls);
  assert.deepEqual(graph.invalidLinks,[]);
  assert.ok(graph.cells<6000,`bounded mission graph grew to ${graph.cells} nodes`);
  const failures=[];
  for(const link of map.navLinks.filter(item=>item.mode!=='lift')) {
    const a=linkEndpoint(link,'from'),b=linkEndpoint(link,'to');
    for(const [side,point] of [['a',a],['b',b]]) {
      const support=arena.supportHeight(point.x,point.y,point.height,graph.solids,.001);
      if(Math.abs(support-point.height)>.08||!arena.canOccupy(point.x,point.y,point.height,graph.solids,16,.001,2.2))
        failures.push(`${link.id}:${side}-support`);
    }
    if(!graph.clear(a,b)||link.bidirectional!==false&&!graph.clear(b,a))failures.push(`${link.id}:physical-sweep`);
  }
  const sectors=new Set(map.strikeSectors.map(sector=>sector.id));
  for(const encounter of map.encounters) {
    if(!encounter.objectivePoint){failures.push(`${encounter.id}:missing-objectivePoint`);continue;}
    if(!sectors.has(encounter.objectivePoint.zone))failures.push(`${encounter.id}:objective-zone`);
    const objectiveSupport=arena.supportHeight(encounter.objectivePoint.x,encounter.objectivePoint.y,
      encounter.objectivePoint.height,graph.solids,.001);
    if(Math.abs(objectiveSupport-encounter.objectivePoint.height)>.08||
      !arena.canOccupy(encounter.objectivePoint.x,encounter.objectivePoint.y,
        encounter.objectivePoint.height,graph.solids,16,.001,2.2))
      failures.push(`${encounter.id}:objective-blocked`);
    for(const spawn of [...encounter.checkpointSpawns,...encounter.spawnGroups.flatMap(group=>group.bots)])
      if(!sectors.has(spawn.zone))failures.push(`${encounter.id}:spawn-zone`);
  }
  for(const guide of map.routeGuides||[]) {
    const support=arena.supportHeight(guide.x,guide.y,guide.height,graph.solids,.001);
    if(Math.abs(support-guide.height)>.08||
      !arena.canOccupy(guide.x,guide.y,guide.height,graph.solids,16,.001,2.2))
      failures.push(`${guide.id}:route-guide-off-surface`);
  }
  assert.deepEqual(graph.dynamicLinks.map(link=>link.id),['link-hoist']);
  assert.deepEqual(failures,[]);
});

test('Strike gantry defenders can route to the east landing through the actual press gap',()=>{
  const {map,walls}=strike.createRedVaultMap();
  const graph=new navigation.NavigationGraph(map,walls);
  const encounter=map.encounters.find(value=>value.id==='gantry-overwatch');
  const defender=encounter.spawnGroups[0].bots[0],landing=encounter.checkpointSpawns[0];
  const route=graph.find(defender,landing);
  assert.ok(route.length>2,'the gantry and landing must be one walkable area');
  assert.deepEqual(route[0],defender);
  assert.deepEqual(route.at(-1),landing,'a Strike route must reach the requested position');
  for(let index=1;index<route.length;index++)
    assert.ok(graph.clear(route[index-1],route[index]),`blocked route segment ${index}`);
});

test('Strike bots pursue a reachable sighting when their preferred firing position is blocked',()=>{
  const {map,walls}=strike.createRedVaultMap(),graph=new navigation.NavigationGraph(map,walls);
  const encounter=map.encounters.find(value=>value.id==='secure-receiving');
  const defender=encounter.spawnGroups[0].bots[0],player=encounter.checkpointSpawns[0];
  const distance=Math.hypot(defender.x-player.x,defender.y-player.y);
  const preferred={x:player.x+(defender.x-player.x)*230/distance,
    y:player.y+(defender.y-player.y)*230/distance,height:player.height,zone:player.zone};
  assert.deepEqual(graph.find(defender,preferred),[],
    'this real Strike firing position is blocked by architecture');
  const route=graph.findWithFallback(defender,preferred,player);
  assert.ok(route.length>1,'the bot should still be able to advance');
  assert.deepEqual(route.at(-1),player);
  for(let index=1;index<route.length;index++)
    assert.ok(graph.clear(route[index-1],route[index]),`blocked fallback route segment ${index}`);
});

test('Red Vault renderer stays finite, bounded, and reacts to authored machinery state',()=>{
  const {map}=strike.createRedVaultMap(),root=createRedVaultEnvironment(map);
  try {
    const interactions=map.encounters.filter(encounter=>encounter.interaction);
    assert.equal(interactions.length,5,'five objectives retain physical hold-E wall controls');
    for(const encounter of interactions) {
      assert.equal(encounter.interaction.holdMs,2000,`${encounter.id} uses the full two-second hold`);
      assert.ok(root.getObjectByName(`${encounter.interaction.id}-panel`),
        `${encounter.interaction.id} must render at its authoritative aim point`);
    }
    const reactorEncounter=map.encounters.find(encounter=>encounter.id==='assembly-canyon');
    const reactor=reactorEncounter.destructible;
    assert.equal(reactor.maxHealth,180);
    assert.equal(reactorEncounter.interaction,undefined,'the power reactor replaces the old E console');
    assert.ok(root.getObjectByName(`${reactor.id}-reactor`),'the wall reactor has a dedicated physical model');
    assert.ok(root.getObjectByName(`${reactor.id}-core`),'the shootable target has a readable energy core');
    root.userData.setMissionState({encounterIndex:2,phase:'objective',objectiveKind:'destructible',
      objectiveHealth:90,objectiveMaxHealth:180,machineryState:{lineReactor:'exposed'}});
    root.userData.hitDestructible(reactor.id,{bulletId:4,strikeTargetDamage:90});
    root.userData.update(.1,{x:3624,y:2230,height:24},new THREE.Scene());
    assert.equal(root.getObjectByName(`${reactor.id}-impact-flash`).visible,true,
      'authoritative reactor hits produce a bright local impact response');
    const healthFill=root.getObjectByName(`${reactor.id}-health-fill`);
    assert.ok(Math.abs(healthFill.scale.x-.5)<.001,
      'the physical reactor readout mirrors its remaining health');
    assert.ok(map.palette.ambientIntensity>=1.6,'facility baseline must keep floor edges readable');
    assert.ok(map.lightingZones.every(zone=>zone.ambient>=1.35),
      'district contrast must not return any playable act to near-black');
    const metrics=root.userData.metrics();
    assert.equal(finiteMetricTree(metrics),true,
      'the same nested metric record checked during Arena3D startup must be accepted');
    const labelOccluders=root.userData.occluders;
    assert.ok(!labelOccluders.includes(root.getObjectByName('red-vault-shell')),
      'crowded-room health labels must not raycast the merged visual shell');
    assert.ok(labelOccluders.reduce((count,mesh)=>count+mesh.geometry.attributes.position.count,0)<10_000,
      'authoritative wall proxies keep repeated label rays inexpensive');
    assert.ok(metrics.meshes>20&&metrics.meshes<600,`unexpected mesh count ${metrics.meshes}`);
    assert.ok(metrics.vertices>1_000&&metrics.vertices<1_100_000,
      `unexpected vertex count ${metrics.vertices}`);
    assert.ok(metrics.lights<=6,'the fixed facility must keep bounded local lights');
    assert.equal(metrics.collisionBindings,map.assetCollision.length);
    root.userData.setMissionState({encounterIndex:2,phase:'objective',objectiveKind:'destructible',
      objectiveHealth:90,objectiveMaxHealth:180,machineryState:{lineReactor:'exposed'},
      reviveBeacons:[{playerId:'downed-ally',name:'ALLY',x:1000,y:2980,height:0,progress:.5}]});
    root.userData.update(.2,{x:1000,y:2900,height:0},new THREE.Scene());
    const reviveShell=root.getObjectByName('strike-revive-downed-ally');
    assert.ok(reviveShell?.visible,'a downed Strike ally has a visible blue shell marker');
    reviveShell.traverse(object=>{
      for(const value of object.position.toArray())assert.ok(Number.isFinite(value),`${object.name} position`);
      const values=object.geometry?.attributes?.position?.array||[];
      for(const value of values)assert.ok(Number.isFinite(value),`${object.name} geometry`);
    });
    root.userData.setMissionState({encounterIndex:2,phase:'objective',reviveBeacons:[]});
    assert.equal(reviveShell.visible,false,'the shell marker disappears immediately after revival');
    const rampMetrics=new Map(metrics.rampAssemblies.map(value=>[value.id,value]));
    const ramps=map.terrain.filter(surface=>surface.kind==='ramp');
    assert.equal(rampMetrics.size,ramps.length,'every incline needs one rendered structural assembly');
    for(const ramp of ramps) {
      const rendered=rampMetrics.get(ramp.id);
      assert.ok(rendered,`${ramp.id} has no rendered stair/ramp assembly`);
      assert.ok(Math.abs(rendered.depth-ramp.structureDepth)<1e-9,
        `${ramp.id} render/collision casing depth diverges`);
      const startHeight=ramp.reverse?ramp.top:ramp.bottom,endHeight=ramp.reverse?ramp.bottom:ramp.top;
      assert.ok(Math.abs(rendered.surfaceA[1]-startHeight)<1e-9&&
        Math.abs(rendered.surfaceB[1]-endHeight)<1e-9,`${ramp.id} visible top endpoints diverge`);
      assert.ok(Math.abs(rendered.undersideA[1]-(startHeight-ramp.structureDepth))<1e-9&&
        Math.abs(rendered.undersideB[1]-(endHeight-ramp.structureDepth))<1e-9,
      `${ramp.id} visible underside diverges`);
    }
    root.traverse(object=>{
      for(const value of object.position.toArray())assert.ok(Number.isFinite(value),`${object.name} position`);
      const positions=object.geometry?.attributes?.position?.array;
      if(positions)for(const value of positions)assert.ok(Number.isFinite(value),`${object.name} geometry`);
    });
    root.updateMatrixWorld(true);
    const boundsOf=(...names)=>{
      const bounds=new THREE.Box3();
      for(const name of names)bounds.union(new THREE.Box3().setFromObject(root.getObjectByName(name)));
      return bounds;
    };
    const near=(actual,expected,label)=>assert.ok(Math.abs(actual-expected)<.08,
      `${label}: rendered ${actual.toFixed(3)}, collider ${expected.toFixed(3)}`);
    const console=map.architecture.machines.find(machine=>machine.id==='command-console-a');
    const consoleBounds=boundsOf('command-console-a-base-0','command-console-a-base-1','command-console-a-base-2');
    near(consoleBounds.min.y,console.bottom,'console underside');near(consoleBounds.max.y,console.top,'console top');
    near(consoleBounds.min.x,(Math.min(console.ax,console.bx)-22-450)*.05,'console west cap');
    near(consoleBounds.max.x,(Math.max(console.ax,console.bx)+22-450)*.05,'console east cap');
    const rotorCollider=map.walls.find(solid=>solid.id==='forge-rotor-base');
    const rotorBounds=boundsOf('forge-rotor-column');
    near((rotorBounds.max.x-rotorBounds.min.x)/2,rotorCollider.collisionRadius*.05,'rotor radius');
    near(rotorBounds.min.y,rotorCollider.bottom,'rotor underside');near(rotorBounds.max.y,rotorCollider.top,'rotor top');
    const coreCollider=map.walls.find(solid=>solid.id==='red-vault-core-base');
    const coreBounds=boundsOf('red-vault-core-column');
    near((coreBounds.max.z-coreBounds.min.z)/2,coreCollider.collisionRadius*.05,'vault core radius');
    near(coreBounds.min.y,coreCollider.bottom,'vault core underside');near(coreBounds.max.y,coreCollider.top,'vault core top');
    const lowestCoreRing=[];root.traverse(object=>{
      if(object.name==='red-vault-core-ring')lowestCoreRing.push(new THREE.Box3().setFromObject(object).min.y);
    });
    assert.ok(Math.min(...lowestCoreRing)>44.3,
      'non-solid reactor rings remain above full player clearance on the 42 m routes');
    const ventBase=map.walls.find(solid=>solid.id==='furnace-vent-plinth-west-base');
    const ventBounds=boundsOf('pressure-vent-0-pedestal');
    near((ventBounds.max.x-ventBounds.min.x)/2,ventBase.collisionRadius*.05,'pressure plinth radius');
    near(ventBounds.min.y,ventBase.bottom,'pressure plinth underside');near(ventBounds.max.y,ventBase.top,'pressure plinth top');
    const lift=map.terrain.find(surface=>surface.id==='forge-freight-hoist');
    const postDef=map.terrain.find(surface=>surface.id==='hoist-cage-post-nw');
    const canopyDef=map.terrain.find(surface=>surface.id==='hoist-cage-canopy');
    const postBounds=boundsOf(postDef.id),deckBounds=boundsOf('forge-hoist-deck'),
      canopyBounds=boundsOf('forge-hoist-canopy');
    near(postBounds.max.x-postBounds.min.x,postDef.width*.05,'hoist post width');
    near(postBounds.max.z-postBounds.min.z,postDef.height*.05,'hoist post depth');
    near(postBounds.min.y,lift.top+postDef.liftBottomOffset,'hoist post bottom');
    near(postBounds.max.y,lift.top+postDef.liftTopOffset,'hoist post top');
    near(deckBounds.min.y,lift.bottom,'hoist deck underside');near(deckBounds.max.y,lift.top,'hoist deck support');
    near(canopyBounds.min.y,lift.top+canopyDef.liftBottomOffset,'hoist canopy underside');
    near(canopyBounds.max.y,lift.top+canopyDef.liftTopOffset,'hoist canopy top');

    const scene=new THREE.Scene(),bridge=root.getObjectByName('command-hinged-bridge');
    const raised=bridge.rotation.z;
    const warning=root.getObjectByName('pressure-vent-0-warning');
    root.userData.setMissionState({machineryState:{core:{state:'warden-venting'}},
      hazards:[{id:'furnace-vent-west',active:false,cycleProgress:.44}],
      activeHazardIds:[],hazardServerNow:Date.now()});
    root.userData.update(.5,{x:1200,y:1240,height:24},scene);
    assert.ok(warning.material.emissiveIntensity>.5,
      'the furnace fixture visibly warns before its authoritative damage pulse');
    const activeGuide=map.routeGuides.find(guide=>guide.id==='route-04-west-a');
    const openedAt=Date.now();
    root.userData.setMissionState({encounterIndex:4,phase:'travel',
      openedIds:['command-bridge','freight-shutter'],openedAtById:{'freight-shutter':openedAt},
      activeRouteGuideIds:[activeGuide.id],objectiveBeacon:{x:1200,y:1240,height:24,label:'LIVE FURNACE'},
      machineryState:{bridge:'lowered',
      arms:'cycling',rotor:'overdrive',core:{state:'exposed'}},activeHazardIds:['furnace-vent-west'],
      hazards:[{id:'furnace-vent-west',active:true,cycleProgress:.55}],hazardServerNow:Date.now()});
    const shutter=root.getObjectByName('freight-shutter');
    root.userData.update(.516,{x:1200,y:1240,height:24},scene);
    assert.ok(shutter.position.y>0&&shutter.position.y<map.walls.find(solid=>solid.id==='freight-shutter').top,
      'an unlocked shutter begins a quick eased garage-door travel instead of snapping fully open');
    root.updateMatrixWorld(true);
    const freightDoor=map.walls.find(solid=>solid.id==='freight-shutter');
    const shutterFrameBounds=boundsOf('freight-shutter-route-frame');
    const shutterSlabBounds=boundsOf('freight-shutter-slab');
    assert.ok(shutterFrameBounds.min.x<shutterSlabBounds.min.x-.15&&
      shutterFrameBounds.max.x>shutterSlabBounds.max.x+.15,
    'the bright shutter frame projects clearly beyond the slab and shell faces');
    near(shutterFrameBounds.min.z,(freightDoor.y-300)*.05,'freight frame north aperture edge');
    near(shutterFrameBounds.max.z,(freightDoor.y+freightDoor.height-300)*.05,'freight frame south aperture edge');
    for(let time=1;time<=2;time+=.05)root.userData.update(time,{x:1200,y:1240,height:24},scene);
    assert.notEqual(bridge.rotation.z,raised,'the command bridge visual follows its open collider state');
    root.updateMatrixWorld(true);
    const bridgeRail=map.walls.find(solid=>solid.id==='command-bridge-rail-north');
    // Precise vertex bounds avoid the conservative AABB-of-a-rotated-local-AABB
    // expansion that would falsely report a sheared guard as too wide.
    const bridgeRailPanelBounds=new THREE.Box3().setFromObject(root.getObjectByName(bridgeRail.id),true);
    const bridgeRailFullBounds=boundsOf(bridgeRail.id,`${bridgeRail.id}-cap`,`${bridgeRail.id}-warning`);
    near(bridgeRailPanelBounds.min.x,(bridgeRail.x-450)*.05,'lowered bridge rail west face');
    near(bridgeRailPanelBounds.max.x,(bridgeRail.x+bridgeRail.width-450)*.05,'lowered bridge rail east face');
    near(bridgeRailPanelBounds.min.z,(bridgeRail.y-300)*.05,'lowered bridge rail north face');
    near(bridgeRailPanelBounds.max.z,(bridgeRail.y+bridgeRail.height-300)*.05,'lowered bridge rail south face');
    near(bridgeRailPanelBounds.min.y,bridgeRail.bottom,'lowered bridge rail low base');
    near(bridgeRailFullBounds.max.y,bridgeRail.top+bridgeRail.rise,'lowered bridge rail high cap');
    assert.equal(root.getObjectByName('pressure-vent-0-jet').visible,true,
      'an active authoritative furnace volume has a visible jet');
    assert.ok(scene.fog?.isFogExp2,'authored districts drive local fog transitions');
    assert.equal(root.userData.getLighting()?.id,'furnace',
      'the environment exports its active district lighting baseline');
    assert.equal(activeGuide.kind,'arrow');
    assert.equal(root.getObjectByName(activeGuide.id),undefined,
      'route metadata remains authoritative without painting tutorial arrows on the floor');
    const beacon=root.getObjectByName('red-vault-objective-beacon');
    assert.equal(beacon.visible,true,'the authoritative objective has a visible world beacon');
    near(beacon.position.y,24.045,'objective beacon floor placement');
    assert.ok(root.getObjectByName('freight-shutter-route-frame').material.emissiveIntensity>7,
      'a newly opened shutter receives emphatic lit jambs');
  } finally {root.userData.dispose();}
});
