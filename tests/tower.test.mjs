import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import maps from '../public/arenaMap.js';
import movement from '../public/movement.js';
import pvp from '../public/pvpMaps.js';
import combat from '../game/hitscan.js';
import navigation from '../game/navigation.js';
import {createTerrainModel,poseCargoLift} from '../public/pveEnvironment.mjs';
import {createTowerEnvironment} from '../public/towerEnvironment.mjs';
import {planAreaLighting,createAreaLighting} from '../public/areaLighting.mjs';

const world=(x,y,height)=>new THREE.Vector3((x-450)*.05,height,(y-300)*.05);
const point=([x,y,height=0])=>({x,y,height});
const mirrored=p=>({...p,x:1120-p.x});
const dispose=group=>group.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
function walk(map,solids,points) {
  const player={...points[0],alive:true,groundHeight:points[0].height,jumpStartedAt:null};
  let now=1000;
  for(const goal of points.slice(1)) {
    const start={...player},steps=Math.ceil(Math.hypot(goal.x-start.x,goal.y-start.y)/2);
    for(let i=1;i<=steps;i++) {
      now+=12;
      const x=start.x+(goal.x-start.x)*i/steps,y=start.y+(goal.y-start.y)*i/steps;
      assert.ok(maps.moveOnTerrain(player,x,y,map,solids,now),`clear route at ${x},${y},${player.height}`);
      assert.ok(Math.hypot(player.x-x,player.y-y)<.03,'the route needs no corner collision correction');
    }
    assert.ok(Math.abs(player.height-goal.height)<.01,'arrives on the intended floor');
    assert.equal(player.jumpStartedAt,null,'no accidental fall at a stair or floor seam');
  }
}
const visible=(a,b,solids)=>!solids.some(s=>!s.nonSolid&&
  combat.rayBox(a.x,a.y,b.x-a.x,b.y-a.y,s,(a.height||0)+1.84,(b.height||0)-(a.height||0))<.999);

test('Tower has mirrored ground starts, two occupied floors and a through-route above them',()=>{
  for(let variant=0;variant<3;variant++) {
    const {map,walls}=maps.createPvpMap(variant,'tower');
    assert.equal(map.width,1120);assert.equal(map.height,1040);
    assert.ok(map.spawns.every(p=>p.height===0),'nobody starts above another player');
    const solids=[...walls,...map.terrain];
    for(const s of solids.filter(s=>!s.nonSolid))assert.ok(solids.some(other=>
      other.kind===s.kind&&other.x===map.width-s.x-s.width&&other.y===s.y&&
      other.width===s.width&&other.height===s.height&&(other.bottom||0)===(s.bottom||0)&&other.top===s.top&&
      (s.axis!=='x'||!!other.reverse===!s.reverse)),`mirrored ${s.kind||'wall'} at ${s.x},${s.y}`);
    for(const spawn of map.spawns)assert.ok(map.spawns.some(p=>p.x===map.width-spawn.x&&p.y===spawn.y));
    assert.ok(map.terrain.filter(s=>s.walkable&&s.top===5.2).reduce((sum,s)=>sum+s.width*s.height,0)>
      map.width*map.height*.5,'most elevated play takes place on substantial floors');
    const crossing=map.terrain.filter(s=>s.walkable&&s.top===8);
    assert.equal(crossing.length,1);assert.equal(crossing[0].bridge,true);
    const approaches=map.terrain.filter(s=>s.kind==='ramp'&&s.top===8);
    assert.equal(approaches.length,2);assert.notEqual(!!approaches[0].reverse,!!approaches[1].reverse);
    const graph=new navigation.NavigationGraph(map,walls);
    for(const goal of [[200,440,5.2],[920,440,5.2],[200,930,5.2],[920,930,5.2],[560,310,8]]) {
      const route=graph.find(map.spawns[0],point(goal));assert.ok(route.length,'permanent stairs reach both upper rooms');
      assert.ok(Math.abs(route.at(-1).height-goal[2])<.1,'navigation actually reaches the requested elevation');
    }
    assert.ok(pvp.pvpSightlineMetrics({map,walls}).p90<750);
  }
});

test('Tower switchbacks, upper circuit and sheltered lower bypass are smooth in both directions',()=>{
  const {map,walls}=maps.createPvpMap(0,'tower'),solids=[...walls,...map.terrain];
  const routes=[
    [[85,500,0],[85,800,2.6],[205,800,2.6],[205,525,5.2],[210,525,5.2],[210,310,5.2],[460,310,8],[560,310,8]],
    [[320,520,5.2],[320,920,5.2],[680,920,5.2],[800,920,5.2],[800,520,5.2]],
    [[300,650,0],[300,930,0],[820,930,0],[820,650,0]],
    [[300,780,0],[430,780,0],[430,850,0],[560,850,0],[560,930,0],[700,930,0]],
    [[280,310,0],[430,310,0],[430,680,0],[690,680,0],[690,310,0],[840,310,0]],
    // These edge routes used to clip the narrower door jambs / lift frame.
    [[330,250,0],[410,250,0]],
    [[330,700,0],[410,700,0]],
    [[500,850,0],[500,930,0]],
    [[300,210,5.2],[300,95,5.2]],
  ];
  for(const route of routes)for(const points of [route.map(point),route.map(point).map(mirrored)]) {
    walk(map,solids,points);walk(map,solids,[...points].reverse());
  }
});

test('Tower upper crossing cannot watch spawns, stair entries or the lower bypass, even when jumping',()=>{
  const {map,walls}=maps.createPvpMap(0,'tower'),solids=[...walls,...map.terrain];
  const protectedPoints=[...map.spawns,...[[85,500],[85,600],[300,650],[300,800],[430,930],[700,930],
    [820,650],[1035,500]].map(point)];
  const jumpHeight=movement.MOVEMENT.jumpSpeed**2/(2*movement.MOVEMENT.gravity);
  for(const height of [8,8+jumpHeight])for(let y=270;y<=350;y+=20)for(let x=460;x<=660;x+=20)
    for(const target of protectedPoints)assert.equal(visible({x,y,height},target,solids),false,
      `crossing at ${x},${y},${height} cannot shoot protected ground at ${target.x},${target.y}`);
  // Actual ground combat still connects to the open bay; protection is not
  // achieved by sealing the whole arena behind unshootable glass.
  assert.ok(visible(point([430,310]),point([430,680]),solids));
  assert.ok(visible(point([460,310,8]),point([660,310,8]),solids),'crossing is contestable from both ends');
  for(let x=420;x<=700;x+=40) {
    const target=point([x,950]);
    for(const source of [point([500,310,8]),point([400,800,5.2]),point([720,800,5.2])])
      assert.equal(visible(source,target,solids),false,'rear hall has real overhead and frontal protection');
  }
});

test('Tower lifts have clear shafts, smooth landings, and no moving railings',()=>{
  const {map,walls}=maps.createPvpMap(0,'tower'),lifts=map.terrain.filter(s=>s.kind==='lift');
  assert.equal(lifts.length,2);assert.ok(lifts.every(s=>s.maxTop===5.2));
  assert.ok(map.terrain.filter(s=>s.kind==='rail').every(s=>!s.liftId));
  const solids=[...walls,...map.terrain];
  for(const lift of lifts) {
    for(const surface of solids.filter(s=>s!==lift&&!s.nonSolid)) {
      const overlapX=Math.min(lift.x+lift.width,surface.x+surface.width)-Math.max(lift.x,surface.x),
        overlapY=Math.min(lift.y+lift.height,surface.y+surface.height)-Math.max(lift.y,surface.y);
      assert.ok(overlapX<=0||overlapY<=0,'no structure intersects the swept shaft');
    }
    for(const height of [0,5.2]) {
      lift.top=height;const x=lift.x+lift.width/2,points=[[x,220,height],[x,120,height]].map(point);
      walk(map,solids,points);walk(map,solids,[...points].reverse());
      const model=createTerrainModel(lift);poseCargoLift(model,height);
      assert.ok(Math.abs(model.userData.deck.position.y+.08-height)<1e-8);dispose(model);
    }
    lift.top=0;
  }
  maps.updateCargoLifts(map,[],100000);assert.deepEqual(lifts.map(s=>s.top),[5.2,0]);
  maps.updateCargoLifts(map,[],104000);assert.deepEqual(lifts.map(s=>s.top),[0,5.2]);
});

test('Tower architecture and walking surfaces match their authoritative geometry',()=>{
  const {map,walls}=maps.createPvpMap(0,'tower'),architecture=createTowerEnvironment(map,walls);
  const assemblies=architecture.children.filter(o=>o.name==='tower-wall-assembly');
  assert.equal(assemblies.length,walls.length);architecture.updateMatrixWorld(true);
  for(const [i,wall] of walls.entries()) {
    const bounds=new THREE.Box3().setFromObject(assemblies[i].getObjectByName('tower-wall-solid')),
      min=world(wall.x,wall.y,wall.bottom||0),max=world(wall.x+wall.width,wall.y+wall.height,wall.top);
    assert.ok(bounds.min.distanceTo(min)<1e-5&&bounds.max.distanceTo(max)<1e-5,'visible wall shell matches movement and hitscan');
  }
  dispose(architecture);
  for(const s of map.terrain) {
    const model=createTerrainModel(s),bounds=new THREE.Box3().setFromObject(model);
    assert.ok([...bounds.min.toArray(),...bounds.max.toArray()].every(Number.isFinite));
    assert.ok(bounds.min.x>=-.041&&bounds.max.x<=s.width*.05+.041&&
      bounds.min.z>=-.041&&bounds.max.z<=s.height*.05+.041,`${s.kind} fits its collider`);
    if(s.kind==='catwalk'||s.kind==='ramp') {
      assert.ok(Math.abs(bounds.max.y+s.bottom-s.top)<1e-5||
        (!s.bottom&&Math.abs(bounds.max.y-s.top)<1e-5),'visible walking height equals physical support');
      assert.ok(bounds.min.y>=-1e-6);
    }
    dispose(model);
  }
});

test('Tower stair markings, cabinet lids and lift trim have a single visible top surface',()=>{
  const {map}=maps.createPvpMap(0,'tower'),ray=new THREE.Raycaster();
  const checkTop=(model,x,z,top,label)=>{
    ray.set(new THREE.Vector3(x,top+.08,z),new THREE.Vector3(0,-1,0));ray.far=.1;
    const hits=ray.intersectObject(model,true).filter(hit=>Math.abs(hit.point.y-top)<1e-5);
    assert.equal(hits.length,1,`${label}: overlapping top faces would flicker`);
  };
  for(const s of map.terrain.filter(s=>['ramp','towerSwitchgear','lift'].includes(s.kind))) {
    const model=createTerrainModel(s),w=s.width*.05,d=s.height*.05,h=s.top-(s.bottom||0);
    if(s.kind==='ramp') {
      model.updateMatrixWorld(true);
      const alongY=s.axis==='y',step=(alongY?d:w)/s.steps;
      for(let i=0;i<s.steps;i++)for(const across of [.321,.619]) {
        const index=s.reverse?s.steps-1-i:i,rise=h*(i+1)/s.steps;
        for(const along of [s.reverse?step-.035:.035,step*.473]) {
          const x=alongY?w*across:index*step+along,z=alongY?index*step+along:d*across;
          checkTop(model,x,z,rise,`${s.kind} at ${s.x},${s.y}, tread ${i}`);
        }
      }
    } else if(s.kind==='lift') {
      for(const height of [0,2.6,5.2]) {
        poseCargoLift(model,height);model.updateMatrixWorld(true);
        for(const x of [.14,w*.413,w-.14])
          checkTop(model,x,d*.391,height+.02,'lift finish throughout travel');
      }
    } else {
      model.updateMatrixWorld(true);
      for(const x of [.29,.63])for(const z of [.37,.71])
        checkTop(model,w*x,d*z,h,'switchgear lid');
    }
    dispose(model);
  }
});

test('Tower lights the sheltered ground rooms with a fixed symmetric lighting budget',()=>{
  const {map,walls}=maps.createPvpMap(0,'tower'),plan=planAreaLighting(map,walls);
  assert.equal(plan.length,6);
  assert.equal(plan.filter(p=>p.kind==='tower-service'&&p.sourceHeight<4.85).length,4);
  for(const light of plan) {
    assert.equal(light.castsShadow,false);assert.equal(light.fixture,'integrated');
    assert.ok(plan.some(p=>p.x===map.width-light.x&&p.y===light.y&&p.color===light.color&&p.intensity===light.intensity));
  }
  const group=createAreaLighting(plan,world);assert.equal(group.children.filter(o=>o.isLight).length,6);
  assert.equal(group.children.filter(o=>o.isMesh).length,0,'fixtures are integrated into the architecture');
  group.traverse(o=>o.shadow?.dispose());
});

test('Tower batches its architecture and keeps the turbine and cargo platforms animated without a browser',async()=>{
  const {Arena3D}=await import('../public/arena3d.js'),previousDocument=globalThis.document;
  try {
    globalThis.document={getElementById:()=>({checked:false})};
    const {map,walls}=maps.createPvpMap(0,'tower'),arena=Object.create(Arena3D.prototype);
    Object.assign(arena,{stage:new THREE.Group(),viewWeapon:new THREE.Group(),scene:new THREE.Scene(),
      camera:new THREE.PerspectiveCamera(),ambient:new THREE.HemisphereLight(),sun:new THREE.DirectionalLight(),
      rim:new THREE.DirectionalLight(),labels:{replaceChildren(){}},renderer:{shadowMap:{}},resize(){}});
    arena.scene.background=new THREE.Color();arena.scene.add(arena.stage);
    for(const key of ['characters','grenades','guardianProjectiles','wardenAttacks','pickups','weaponSwitchTimes'])arena[key]=new Map();
    arena.deadIds=new Set();arena.build(walls,map);
    let meshes=0,triangles=0;
    arena.stage.traverse(o=>{if(!o.isMesh||o.material.colorWrite===false||o.material.isShadowMaterial)return;
      meshes++;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3*(o.isInstancedMesh?o.count:1);});
    assert.ok(meshes<110,`bounded draw count: ${meshes}`);assert.ok(triangles<90000,`bounded triangles: ${triangles}`);
    assert.equal(arena.cargoModels.length,2);assert.equal(arena.animatedTerrain.length,1);
    const turbine=arena.animatedTerrain[0],rotor=turbine.getObjectByName('tower-turbine-rotor'),before=rotor.rotation.y;
    turbine.userData.update(4);assert.notEqual(rotor.rotation.y,before,'merging retains the moving rotor');
    dispose(arena.stage);
  } finally {if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;}
});
