import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createMarioPipe } from './marioPipe.mjs';
import { createAutoRifle } from './autoRifle.mjs';
import { createPistol, PISTOL_MODEL_SCALE } from './pistol.mjs';
import {createShotgun,poseShotgun,triggerShotgunChamber,shotgunMuzzleStyle,shotgunPelletColor} from './shotgun.mjs';
import {poseGrenadeFuse} from './grenadeFuse.mjs';
import {createGrenadeExplosion,poseGrenadeExplosion,EXPLOSION_DURATION} from './grenadeExplosion.mjs';
import { createHeavyWeapon, heavyWeaponMuzzleDepth, heavyWeaponMuzzleYOffset, heavyWeaponViewScale, heavyWeaponViewYOffset, heavyWeaponViewZ, poseHeavyWeaponSkin, triggerHeavyWeaponSkin } from './heavyWeapons.mjs';
import { createMuzzleFlash, muzzleFlashScaleForWeapon, triggerMuzzleFlash, updateMuzzleFlash } from './muzzleFlash.mjs';
import { createTerrainModel, poseCargoLift } from './pveEnvironment.mjs';
import {createTempleEnvironment} from './templeEnvironment.mjs';
import {createSpaceEnvironment} from './spaceEnvironment.mjs';
import {createAirportEnvironment} from './airportEnvironment.mjs';
import {createRedVaultEnvironment} from './strikeEnvironment.mjs';
import { createElevatorModel, poseElevator, elevatorDisplay } from './elevator.mjs';
import { updateCharacterMotion } from './characterMotion.mjs';
import { createOgreModel, poseOgre } from './ogre.mjs';
import {createGuardianModel,poseGuardian,createGuardianProjectile,createGuardianExplosion,poseGuardianExplosion} from './guardian.mjs';
import {MAX_CORPSES,MAX_REMAINS,createCorpse,poseCorpse,createDeathRemains,poseDeathRemains,createGrenadePickup} from './deathEffects.mjs';
import { FrameBudget } from './frameBudget.mjs';
import { planAreaLighting, createAreaLighting } from './areaLighting.mjs';
import { planAmbientZones, ambientZoneGLSL, ambientZoneUniforms, applyAmbientZones } from './ambientZones.mjs';
import {shotgunReticleDiameter} from './shotgunCrosshair.mjs';
import {areaOccluderIndex,shadowOccluderGrid} from './floorLighting.mjs';

const SCALE = 0.05;
const WALL_HEIGHT = 3.1;
const WEAPON_SWAP_SECONDS = 0.36;
const DAMAGE_FLASH_COLOR = new THREE.Color('#ff3030');
const SPAWN_SHIELD_BLUE='#42b8ff';
const world = (x, y, height = 0, target = new THREE.Vector3()) => target.set((x - 450) * SCALE, height, (y - 300) * SCALE);
const WARDEN_FINISHED_STATES=new Set(['complete','completed','done','ended','idle','cooldown','cancelled']);
const STRIKE_SPAWN_SECONDS=1.2;

export function createStrikeSpawnArrival() {
  const group=new THREE.Group();group.name='strike-enemy-arrival';
  const red=new THREE.MeshBasicMaterial({color:0xff334c,transparent:true,opacity:0,
    depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,side:THREE.DoubleSide});
  const hot=new THREE.MeshBasicMaterial({color:0xffb071,transparent:true,opacity:0,
    depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,side:THREE.DoubleSide});
  const beam=new THREE.Mesh(new THREE.CylinderGeometry(.16,.48,2.8,10,1,true),red);
  beam.name='strike-arrival-beam';beam.position.y=1.4;beam.renderOrder=4;group.add(beam);
  const ring=new THREE.Mesh(new THREE.RingGeometry(.32,.42,28),hot);
  ring.name='strike-arrival-ring';ring.rotation.x=-Math.PI/2;ring.position.y=.035;ring.renderOrder=5;group.add(ring);
  const crown=new THREE.Mesh(new THREE.TorusGeometry(.36,.035,6,24),red.clone());
  crown.name='strike-arrival-crown';crown.rotation.x=Math.PI/2;crown.position.y=2.55;crown.renderOrder=5;group.add(crown);
  return{group,beam,ring,crown,materials:[red,hot,crown.material]};
}

// An inverted, slightly expanded copy produces a true silhouette outline
// without adding an expensive full-screen post-processing pass. It is built
// once per PvP character and merely toggled during the opening shield window.
export function createPvpSpawnShieldOutline(source) {
  const material=new THREE.ShaderMaterial({
    uniforms:{color:{value:new THREE.Color(SPAWN_SHIELD_BLUE)},opacity:{value:.9},thickness:{value:.022}},
    vertexShader:`uniform float thickness;
      void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position+normal*thickness,1.0);}`,
    fragmentShader:`uniform vec3 color;uniform float opacity;
      void main(){gl_FragColor=vec4(color,opacity);}`,
    side:THREE.BackSide,transparent:true,depthWrite:false,toneMapped:false,
  });
  const outline=source.clone(true);outline.name='pvp-spawn-shield-outline';
  outline.traverse(object=>{
    if(object.isMesh){object.material=material;object.castShadow=false;object.receiveShadow=false;object.renderOrder=3;}
    else if(object.isLine||object.isPoints)object.visible=false;
  });
  outline.userData.shieldMaterial=material;return outline;
}

export function finiteMetricTree(value) {
  if(typeof value==='number')return Number.isFinite(value);
  if(Array.isArray(value))return value.every(finiteMetricTree);
  if(value&&typeof value==='object')return Object.values(value).every(finiteMetricTree);
  // Metric records include descriptive ids; only numeric leaves need a
  // finiteness check.
  return true;
}

function captureMaterialization(group,excluded) {
  const seen=new Set(),result=[];
  group.traverse(object=>{
    if(object===excluded||excluded?.getObjectById?.(object.id))return;
    const materials=Array.isArray(object.material)?object.material:[object.material];
    for(const material of materials)if(material&&!seen.has(material)) {
      seen.add(material);result.push({material,opacity:material.opacity??1,
        transparent:!!material.transparent,depthWrite:material.depthWrite!==false});
    }
  });
  return result;
}

export function poseStrikeSpawnArrival(record,nowMs) {
  if(!record.spawnArrival)return false;
  const end=record.spawnRevealAt,start=end-STRIKE_SPAWN_SECONDS*1000;
  const progress=Math.max(0,Math.min(1,(nowMs-start)/(end-start)));
  if(progress>=1) {
    if(!record.spawnRestored)for(const entry of record.spawnMaterials) {
      entry.material.opacity=entry.opacity;entry.material.transparent=entry.transparent;
      entry.material.depthWrite=entry.depthWrite;entry.material.needsUpdate=true;
    }
    record.spawnRestored=true;record.spawnArrival.group.visible=false;return false;
  }
  record.spawnRestored=false;record.spawnArrival.group.visible=true;
  const body=Math.max(0,Math.min(1,(progress-.24)/.62));
  const bodyEase=body*body*(3-2*body);
  for(const entry of record.spawnMaterials) {
    entry.material.transparent=true;entry.material.depthWrite=false;
    entry.material.opacity=entry.opacity*bodyEase;entry.material.needsUpdate=true;
  }
  const pulse=.5+.5*Math.sin(nowMs*.035),collapse=1-progress;
  record.spawnArrival.beam.material.opacity=.2+.28*collapse+.16*pulse;
  record.spawnArrival.beam.scale.set(.72+collapse*.75,1,.72+collapse*.75);
  record.spawnArrival.ring.material.opacity=.55+.35*pulse;
  record.spawnArrival.ring.scale.setScalar(.8+progress*2.2);
  record.spawnArrival.ring.rotation.z+=.035;
  record.spawnArrival.crown.material.opacity=.3+.5*collapse;
  record.spawnArrival.crown.position.y=2.55-progress*1.9;
  record.spawnArrival.crown.rotation.z-=.045;
  return true;
}

// The boss presentation is built once with a small, fixed mesh budget. The
// animation below only changes existing transforms/material values; pressure
// attacks never allocate particles, geometry or temporary scene objects.
export function createWardenPresentation() {
  const group=new THREE.Group();group.name='warden-presentation';group.visible=false;
  const pressureMaterial=new THREE.MeshBasicMaterial({color:0xff3b32,transparent:true,opacity:0,
    blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,toneMapped:false});
  const sweepMaterial=new THREE.MeshBasicMaterial({color:0xffd17b,transparent:true,opacity:0,
    blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,toneMapped:false});
  const overdriveMaterial=new THREE.MeshBasicMaterial({color:0xff263f,transparent:true,opacity:0,
    blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,toneMapped:false});
  const hotMaterial=new THREE.MeshStandardMaterial({color:0x4a050c,emissive:0xff384b,emissiveIntensity:0,
    metalness:.35,roughness:.22,transparent:true,opacity:0,depthWrite:false});

  const ground=new THREE.Group();ground.name='warden-pressure-field';ground.position.y=.035;group.add(ground);
  const pulseGeometry=new THREE.RingGeometry(.91,1.02,48);
  const pulseRings=[];
  for(let index=0;index<3;index++) {
    const ring=new THREE.Mesh(pulseGeometry,pressureMaterial.clone());
    ring.name=`warden-pressure-pulse-${index}`;ring.rotation.x=-Math.PI/2;ring.renderOrder=4;
    ground.add(ring);pulseRings.push(ring);
  }
  const boundary=new THREE.Mesh(new THREE.RingGeometry(4.05,4.24,64),pressureMaterial.clone());
  boundary.name='warden-pressure-boundary';boundary.rotation.x=-Math.PI/2;boundary.renderOrder=4;ground.add(boundary);
  const sweepPivot=new THREE.Group();sweepPivot.name='warden-pressure-sweep';ground.add(sweepPivot);
  const sweep=new THREE.Mesh(new THREE.RingGeometry(.66,4.22,48,1,-.36,.72),sweepMaterial);
  sweep.rotation.x=-Math.PI/2;sweep.renderOrder=5;sweepPivot.add(sweep);
  // The Warden begins in the four-metre-deep Vault well. Two vertical radial
  // curtains carry the same warning through the upper command floor instead
  // of letting that floor occlude the only telegraph players can see.
  const sweepWalls=[];
  for(const side of [-1,1]) {
    const pivot=new THREE.Group();sweepPivot.add(pivot);
    const wall=new THREE.Mesh(new THREE.PlaneGeometry(3.56,5.25),sweepMaterial.clone());
    wall.name=side<0?'warden-sweep-leading-edge':'warden-sweep-trailing-edge';
    wall.position.set(2.44,2.625,0);wall.renderOrder=5;pivot.add(wall);
    sweepWalls.push({pivot,wall,side});
  }

  const overdrive=new THREE.Group();overdrive.name='warden-overdrive';overdrive.visible=false;group.add(overdrive);
  const aura=new THREE.Mesh(new THREE.IcosahedronGeometry(.56,1),hotMaterial);
  aura.name='warden-overdrive-core';aura.position.set(0,1.43,-.34);aura.renderOrder=5;overdrive.add(aura);
  const bodyRings=[];
  for(const [index,height] of [1.04,1.52,2.05].entries()) {
    const ring=new THREE.Mesh(new THREE.TorusGeometry(.7+index*.13,.025+index*.006,6,28),overdriveMaterial.clone());
    ring.name=`warden-overdrive-ring-${index}`;ring.position.y=height;ring.rotation.x=Math.PI/2;
    ring.renderOrder=5;overdrive.add(ring);bodyRings.push(ring);
  }
  const spikes=[];
  for(let index=0;index<6;index++) {
    const angle=index*Math.PI/3,spike=new THREE.Mesh(new THREE.ConeGeometry(.075,.82,6),hotMaterial.clone());
    spike.name=`warden-overdrive-spike-${index}`;
    spike.position.set(Math.cos(angle)*.82,1.38,Math.sin(angle)*.82);
    spike.rotation.z=Math.cos(angle)*.16;spike.rotation.x=Math.sin(angle)*.16;
    spike.renderOrder=5;overdrive.add(spike);spikes.push(spike);
  }
  return{group,ground,pulseRings,boundary,sweepPivot,sweep,sweepWalls,overdrive,aura,bodyRings,spikes,
    phase:1,phaseChangedAt:0};
}

function wardenAttackProgress(attack,time) {
  const provided=Number(attack?.progress??attack?.chargeProgress??attack?.telegraphProgress??attack?.sweepProgress);
  if(Number.isFinite(provided))return Math.max(0,Math.min(1,provided));
  const sweeping=(attack?.attackPhase??attack?.phase)==='sweep';
  const duration=Math.max(120,Number(attack?.durationMs??attack?.chargeMs??
    (sweeping?attack?.sweepMs:attack?.windupMs))||1800)/1000;
  const started=Number(attack?.localReceivedAt);
  return Number.isFinite(started)?Math.max(0,Math.min(1,(time-started)/duration)):0;
}

export function poseWardenPresentation(model,phase,attack,time,healthRatio=1) {
  if(!model)return;
  const defeated=healthRatio<=0||attack?.defeated===true;
  model.group.visible=!defeated&&phase>=2;
  if(!model.group.visible)return;
  if(model.phase!==phase){model.phase=phase;model.phaseChangedAt=time;}
  const state=String(attack?.state??attack?.attackPhase??attack?.phase??'').toLowerCase();
  const explicit=!!attack&&attack.active!==false&&!WARDEN_FINISHED_STATES.has(state);
  const progress=wardenAttackProgress(attack,time);
  const transition=Math.max(0,1-Math.max(0,time-model.phaseChangedAt)/1.15);
  const pressure=phase===2,overdrive=phase>=3;
  const radiusUnits=Number(attack?.radius??attack?.outerRadius??attack?.range);
  // Warden character geometry is scaled to 1.34 for its boss silhouette; undo
  // that parent scale so the warning edge still matches the server radius.
  const radius=Number.isFinite(radiusUnits)?Math.max(3.2,Math.min(16,radiusUnits*SCALE/1.34)):4.25;
  const urgency=explicit?Math.max(.18,progress):.18;
  model.ground.visible=pressure||explicit;
  model.boundary.scale.setScalar(radius/4.24);
  model.boundary.material.opacity=(explicit?.48:.13)+transition*.28;
  for(let index=0;index<model.pulseRings.length;index++) {
    const ring=model.pulseRings[index],cycle=(time*(explicit?1.25:.42)+index/model.pulseRings.length)%1;
    ring.scale.setScalar(radius*(.23+cycle*.75));
    ring.material.opacity=(explicit?.52:.12)*(1-cycle)*(1-cycle)+transition*.18;
  }
  const attackPhase=attack?.attackPhase??attack?.phase;
  const startAngle=Number(attack?.startAngle),direction=Number(attack?.direction)<0?-1:1;
  const liveAngle=Number(attack?.sweepAngle??attack?.angle);
  const authoredAngle=Number.isFinite(liveAngle)?liveAngle:Number.isFinite(startAngle)?
    startAngle+(attackPhase==='sweep'?direction*Math.PI*2*progress:0):NaN;
  const parentYaw=model.group.parent?.rotation.y||0;
  model.sweepPivot.rotation.y=Number.isFinite(authoredAngle)?-authoredAngle-parentYaw:time*(explicit?2.15:.62);
  model.sweepPivot.scale.set(radius/4.22,1,radius/4.22);
  model.sweep.material.opacity=(explicit?.72:.18)+urgency*.16+transition*.18;
  const arcWidth=Math.max(.18,Math.min(Math.PI,Number(attack?.arcWidth)||.72));
  const sweeping=attackPhase==='sweep';
  for(const edge of model.sweepWalls) {
    edge.pivot.rotation.y=edge.side*arcWidth/2;
    edge.wall.material.opacity=explicit ? (sweeping ? 0.56 : 0.24) : 0.07;
  }

  model.overdrive.visible=overdrive;
  if(!overdrive)return;
  const pulse=.5+.5*Math.sin(time*10.5),surge=.72+transition*.75;
  model.aura.scale.setScalar(1.05+pulse*.24+transition*.35);
  model.aura.material.opacity=.2+pulse*.14+transition*.2;
  model.aura.material.emissiveIntensity=4.6+pulse*4+transition*5;
  for(let index=0;index<model.bodyRings.length;index++) {
    const ring=model.bodyRings[index],direction=index%2?1:-1;
    ring.rotation.y=time*(1.4+index*.38)*direction;
    ring.rotation.z=time*.35*direction;
    ring.scale.setScalar(surge+pulse*.12+index*.06);
    ring.material.opacity=.38+pulse*.22+transition*.24;
  }
  for(let index=0;index<model.spikes.length;index++) {
    const spike=model.spikes[index],wave=.5+.5*Math.sin(time*9+index*1.23);
    spike.position.y=1.25+wave*.42;spike.scale.y=.72+wave*.7+transition*.35;
    spike.material.opacity=.3+wave*.5;spike.material.emissiveIntensity=3.8+wave*4.5;
  }
}

export function arenaFloorRectangles(map) {
  const rectangles=Array.isArray(map.floorRects)&&map.floorRects.length?
    map.floorRects.map((rect,index)=>({...rect,main:index===0})):
    [{x:0,y:0,width:map.width,height:map.height,main:true}];
  const add=(x,y,width,height)=>{if(width>0&&height>0)rectangles.push({x,y,width,height});};
  for(const pocket of map.walkablePockets||[]) {
    const right=pocket.x+pocket.width,far=pocket.y+pocket.height;
    if(pocket.x<0)add(pocket.x,pocket.y,Math.min(-pocket.x,pocket.width),pocket.height);
    if(right>map.width)add(Math.max(map.width,pocket.x),pocket.y,right-Math.max(map.width,pocket.x),pocket.height);
    const clippedX=Math.max(0,pocket.x),clippedRight=Math.min(map.width,right);
    if(pocket.y<0)add(clippedX,pocket.y,clippedRight-clippedX,Math.min(-pocket.y,pocket.height));
    if(far>map.height)add(clippedX,Math.max(map.height,pocket.y),clippedRight-clippedX,far-Math.max(map.height,pocket.y));
  }
  return rectangles;
}

function arenaFloorGeometry(rectangles,height=0) {
  const positions=[],normals=[],indices=[];
  for(const rect of rectangles) {
    const offset=positions.length/3,x0=(rect.x-450)*SCALE,x1=(rect.x+rect.width-450)*SCALE;
    const z0=(rect.y-300)*SCALE,z1=(rect.y+rect.height-300)*SCALE;
    positions.push(x0,height,z0,x0,height,z1,x1,height,z1,x1,height,z0);
    normals.push(0,1,0,0,1,0,0,1,0,0,1,0);
    indices.push(offset,offset+1,offset+2,offset,offset+2,offset+3);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  geometry.setIndex(indices);geometry.computeBoundingSphere();
  return geometry;
}

function roundedGeometry(w,h,d,x,y,z,radius=0.08) {
  const geometry=new RoundedBoxGeometry(w,h,d,2,Math.min(radius,w/3,h/3,d/3));
  geometry.translate(x,y,z);
  return geometry;
}

// Generated rooms used to spend one draw call per decorative wall panel.
// Merge each static material layer while preserving rounded geometry.
function mergedMesh(geometries,material,{castShadow=false,receiveShadow=true}={}) {
  if(!geometries.length)return null;
  const geometry=geometries.length===1?geometries[0]:mergeGeometries(geometries,false);
  if(geometries.length>1)geometries.forEach(item=>item.dispose());
  if(!geometry)throw new Error('Unable to batch static arena geometry');
  const mesh=new THREE.Mesh(geometry,material);
  mesh.castShadow=castShadow;mesh.receiveShadow=receiveShadow;
  return mesh;
}

function materialBatchKey(material,geometry) {
  const attributes=Object.keys(geometry.attributes).sort().join(',');
  return [material.type,material.color?.getHexString(),material.emissive?.getHexString(),
    material.emissiveIntensity,material.metalness,material.roughness,material.transparent,
    material.opacity,material.side,material.depthWrite,geometry.index?1:0,attributes].join('|');
}

function collectStaticModel(model,position,batches) {
  model.position.copy(position);model.updateMatrixWorld(true);
  model.traverse(object=>{
    if(!object.isMesh||Array.isArray(object.material))return;
    const geometry=object.geometry.clone();geometry.applyMatrix4(object.matrixWorld);
    const key=materialBatchKey(object.material,geometry);
    let batch=batches.get(key);
    if(!batch){batch={material:object.material,geometries:[],castShadow:false,receiveShadow:false};batches.set(key,batch);}
    else if(object.material!==batch.material)object.material.dispose();
    batch.geometries.push(geometry);batch.castShadow ||= object.castShadow;batch.receiveShadow ||= object.receiveShadow;
    object.geometry.dispose();
  });
}

function limitShadowCasters(group,limit=8) {
  const candidates=[];
  group.updateMatrixWorld(true);
  group.traverse(object=>{
    if(!object.isMesh)return;
    object.castShadow=false;
    if(!object.material?.isMeshStandardMaterial)return;
    object.geometry.computeBoundingBox();
    const size=new THREE.Vector3();object.geometry.boundingBox.getSize(size);
    const scale=new THREE.Vector3();object.getWorldScale(scale);
    candidates.push({object,volume:size.x*size.y*size.z*Math.abs(scale.x*scale.y*scale.z)});
  });
  candidates.sort((a,b)=>b.volume-a.volume);
  for(const {object} of candidates.slice(0,limit))object.castShadow=true;
}

// Keep the cached value and the actual DOM state in agreement. Other actor
// visibility changes must not be able to leave an occluded label visible just
// because its cached state already says "hidden".
export function syncCharacterLabelVisibility(character,hidden) {
  if(character.labelHidden===hidden&&character.label.hidden===hidden)return false;
  character.labelHidden=hidden;
  character.label.hidden=hidden;
  return true;
}

// Merge rigid pieces that share a parent and material. Their parent still
// animates exactly as before, but an Ogre torso made from many armor plates no
// longer costs one draw call per plate.
function mergeRigidMeshes(parent,excluded=new Set()) {
  parent.updateMatrixWorld(true);
  const batches=new Map();
  for(const child of [...parent.children]) {
    if(!child.isMesh||child.children.length||excluded.has(child)||Array.isArray(child.material))continue;
    const signature=`${child.material.uuid}|${child.geometry.index?1:0}|${Object.keys(child.geometry.attributes).sort().join(',')}`;
    if(!batches.has(signature))batches.set(signature,{material:child.material,meshes:[]});
    batches.get(signature).meshes.push(child);
  }
  for(const {material,meshes} of batches.values()) {
    if(meshes.length<2)continue;
    const geometries=meshes.map(mesh=>{mesh.updateMatrix();const geometry=mesh.geometry.clone();geometry.applyMatrix4(mesh.matrix);return geometry;});
    const geometry=mergeGeometries(geometries,false);geometries.forEach(item=>item.dispose());
    if(!geometry)continue;
    const merged=new THREE.Mesh(geometry,material);
    merged.castShadow=meshes.some(mesh=>mesh.castShadow);merged.receiveShadow=meshes.some(mesh=>mesh.receiveShadow);
    for(const mesh of meshes){parent.remove(mesh);mesh.geometry.dispose();}
    parent.add(merged);
  }
}

// One reflection bounce against wall volumes per floor pixel. The reflection
// proxies preserve collision footprints; bevels and characters are rasterized.
function floorMaterial(walls, areas = [], pve = false, zoneUniforms, palette = {},mapConfig={width:900,height:600}) {
  const areaOccluders=areaOccluderIndex(walls,areas,SCALE);
  const areaIndexCount=areaOccluders.indices.length;
  const shadowGrid=shadowOccluderGrid(walls,mapConfig,SCALE);
  return new THREE.ShaderMaterial({
    uniforms: {
      ...zoneUniforms,
      wallCount: { value: Math.min(64, walls.length) },
      wallMin: { value: Array.from({ length: 64 }, (_, i) => walls[i] ? world(walls[i].x, walls[i].y,walls[i].bottom||0) : new THREE.Vector3()) },
      wallMax: { value: Array.from({ length: 64 }, (_, i) => walls[i] ? world(walls[i].x + walls[i].width, walls[i].y + walls[i].height, walls[i].top ?? WALL_HEIGHT) : new THREE.Vector3()) },
      reflections: { value: false },
      areaCount: {value:areas.length},
      areaPosition: {value:Array.from({length:6},(_,i)=>areas[i]?world(areas[i].x,areas[i].y,areas[i].sourceHeight):new THREE.Vector3())},
      areaColor: {value:Array.from({length:6},(_,i)=>new THREE.Color(areas[i]?.color||'#000000'))},
      areaRadius: {value:Array.from({length:6},(_,i)=>areas[i]?.radius||1)},
      areaWallOffset:{value:areaOccluders.offsets},
      areaWallCount:{value:areaOccluders.counts},
      areaWallIndices:{value:areaOccluders.indices},
      shadowWallIndexMap:{value:shadowGrid.texture},
      shadowGridSize:{value:new THREE.Vector4(shadowGrid.cols,shadowGrid.rows,shadowGrid.slots,shadowGrid.rows*shadowGrid.slots)},
      shadowMapOrigin:{value:new THREE.Vector2(-450*SCALE,-300*SCALE)},
      shadowMapInverseSize:{value:new THREE.Vector2(1/(mapConfig.width*SCALE),1/(mapConfig.height*SCALE))},
      ambientFloor: {value:pve?0.83:1},
      floorLow:{value:new THREE.Color(palette.floorLow||'#303f47')},
      floorHigh:{value:new THREE.Color(palette.floorHigh||'#4d6166')},
      reflectionBase:{value:new THREE.Color(palette.reflection||'#526b73')},
      reflectionGlow:{value:new THREE.Color(palette.reflectionGlow||'#2ed9e3')},
      groundStyle:{value:palette.groundStyle==='grass'?1:palette.groundStyle==='airport'?2:0},
    },
    vertexShader: `varying vec3 point;
      void main() { vec4 p = modelMatrix * vec4(position, 1.0); point = p.xyz;
        gl_Position = projectionMatrix * viewMatrix * p; }`,
    fragmentShader: `
      ${ambientZoneGLSL}
      uniform int wallCount; uniform vec3 wallMin[64]; uniform vec3 wallMax[64];
      uniform bool reflections; varying vec3 point;
      uniform int areaCount; uniform vec3 areaPosition[6]; uniform vec3 areaColor[6];
      uniform float areaRadius[6]; uniform float ambientFloor;
      uniform int areaWallOffset[6]; uniform int areaWallCount[6];
      uniform int areaWallIndices[${areaIndexCount}];
      uniform sampler2D shadowWallIndexMap; uniform vec4 shadowGridSize;
      uniform vec2 shadowMapOrigin; uniform vec2 shadowMapInverseSize;
      uniform vec3 floorLow; uniform vec3 floorHigh; uniform vec3 reflectionBase; uniform vec3 reflectionGlow;
      uniform float groundStyle;
      float traceBox(vec3 o, vec3 d, vec3 lo, vec3 hi) {
        vec3 safeD = mix(vec3(0.00001), d, step(vec3(0.00001), abs(d)));
        vec3 a = (lo-o)/safeD, b = (hi-o)/safeD;
        vec3 mn = min(a,b), mx = max(a,b);
        float entry = max(max(mn.x,mn.y),mn.z), leave = min(min(mx.x,mx.y),mx.z);
        return leave >= max(entry,0.0) ? max(entry,0.0) : 10000.0;
      }
      void main() {
        vec2 grid = abs(fract(point.xz / 2.5 - 0.5) - 0.5) / max(fwidth(point.xz / 2.5), vec2(0.001));
        float seam = 1.0 - min(min(grid.x,grid.y),1.0);
        vec3 base = mix(floorLow,floorHigh,seam*0.48);
        if(groundStyle>1.5) {
          // Large polished terrazzo tiles with fine aggregate and restrained
          // grout. This remains a single draw call across the whole terminal.
          vec2 tile=abs(fract(point.xz/1.55)-.5);
          float grout=1.-smoothstep(.455,.49,max(tile.x,tile.y));
          vec2 speckCell=floor(point.xz*22.0);
          float speck=fract(sin(dot(speckCell,vec2(12.9898,78.233)))*43758.5453);
          float aggregate=smoothstep(.91,.985,speck)*.12-smoothstep(.03,.09,speck)*.055;
          base=mix(floorHigh,floorLow,grout*.52)+aggregate;
        } else if(groundStyle>0.5) {
          // Layered organic frequencies avoid the flat checker/noise look of
          // arena turf while retaining a single inexpensive ground draw call.
          float broad=sin(point.x*.19+sin(point.z*.11)*1.7)*sin(point.z*.16-point.x*.07);
          float middle=sin(point.x*.83+point.z*.37)*sin(point.z*.71-point.x*.29);
          vec2 cell=floor(point.xz*7.0);
          float blade=fract(sin(dot(cell,vec2(12.9898,78.233)))*43758.5453);
          float growth=clamp(.40+broad*.19+middle*.07+blade*.09,0.,1.);
          base=mix(floorLow,floorHigh,growth);
          base*=.94+.06*smoothstep(.35,.9,blade);
        }
        float shadow = 1.0;
        vec3 lightDir = normalize(vec3(-0.5,1.0,-0.35));
        vec2 shadowCell=clamp(floor((point.xz-shadowMapOrigin)*shadowMapInverseSize*shadowGridSize.xy),vec2(0.0),shadowGridSize.xy-1.0);
        for (int candidate=0; candidate<${shadowGrid.slots}; candidate++) {
          vec2 shadowUv=vec2((shadowCell.x+0.5)/shadowGridSize.x,
            (shadowCell.y+float(candidate)*shadowGridSize.y+0.5)/shadowGridSize.w);
          int i=int(floor(texture2D(shadowWallIndexMap,shadowUv).r*255.0+0.5))-1;
          if(i<0)continue;
          if(traceBox(point+vec3(0.0,0.02,0.0), lightDir, wallMin[i],wallMax[i])<1000.0) shadow=0.72;
        }
        base *= shadow * ambientFloor * ambientAt(point.xz);
        for(int a=0;a<6;a++) {
          if(a>=areaCount)break;
          float pool=1.0-smoothstep(areaRadius[a]*0.2,areaRadius[a],distance(point.xz,areaPosition[a].xz));
          if(pool>0.01) {
            vec3 delta=areaPosition[a]-point;float reach=length(delta);bool blocked=false;
            for(int j=0;j<64;j++) {if(j>=areaWallCount[a])break;
              int i=areaWallIndices[areaWallOffset[a]+j];
              if(traceBox(point+vec3(0.,0.03,0.),delta/reach,wallMin[i],wallMax[i])<reach){blocked=true;break;}
            }
            if(!blocked)base+=areaColor[a]*pool*0.16;
          }
        }
        if (reflections) {
          vec3 ray = reflect(normalize(point-cameraPosition),vec3(0.0,1.0,0.0));
          float nearest=10000.0; int found=-1;
          for(int i=0;i<64;i++){ if(i>=wallCount)break;
            float t=traceBox(point+vec3(0.0,0.01,0.0),ray,wallMin[i],wallMax[i]);
            if(t<nearest){nearest=t;found=i;}
          }
          if(found>=0){
            vec3 p=point+ray*nearest;
            float trim=1.0-smoothstep(0.015,0.09,abs(p.y-${WALL_HEIGHT - 0.32}));
            vec3 reflected=mix(reflectionBase,reflectionGlow,trim);
            float fresnel=0.10+0.32*pow(1.0-max(dot(normalize(cameraPosition-point),vec3(0.,1.,0.)),0.0),3.0);
            float reflectionAmount=(groundStyle>0.5&&groundStyle<1.5)?.12:1.;
            base=mix(base,reflected,fresnel*exp(-nearest*0.08)*reflectionAmount);
          }
        }
        gl_FragColor=vec4(base,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

export class Arena3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.frameBudget=new FrameBudget();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.frameBudget.scale));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    this.shadowElapsed=0;this.renderTime=0;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.4;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#9ebbc9');
    // The weapon has its own close-range camera, so the world camera does not
    // need a 4 cm near plane. A tighter depth range prevents grazing wall
    // faces and façade trim from fighting in the depth buffer.
    this.camera = new THREE.PerspectiveCamera(68, 1, 0.10, 140);
    this.viewScene = new THREE.Scene();
    this.viewCamera = new THREE.PerspectiveCamera(65, 1, 0.01, 10);
    this.viewScene.add(new THREE.HemisphereLight(0xe3f3ff, 0x73878b, 3));
    const weaponLight = new THREE.DirectionalLight(0xffe7c4, 3);
    weaponLight.position.set(-2, 4, 1); this.viewScene.add(weaponLight);
    this.viewWeapon = new THREE.Group(); this.viewScene.add(this.viewWeapon);
    this.viewWeaponKey = null; this.weaponRecoil = 0;this.weaponSwitchTimes=new Map();
    this.ambient=new THREE.HemisphereLight(0xe3f3ff, 0x73878b, 3.2);
    this.scene.add(this.ambient);
    const sun = new THREE.DirectionalLight(0xffe7c4, 3.5);
    this.sun = sun;
    sun.position.set(-20, 40, -15);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 28, bottom: -28, near: 1, far: 100 });
    sun.shadow.normalBias = 0.04;
    sun.shadow.autoUpdate = false;
    this.scene.add(sun);
    this.scene.add(sun.target);
    const rim = new THREE.DirectionalLight(0x48baff, 2);
    this.rim=rim;
    rim.position.set(20, 12, 15);
    this.scene.add(rim);
    this.stage = new THREE.Group(); this.scene.add(this.stage);
    this.characters = new Map(); this.effects = [];
    this.tracerPool=[];this.freeTracers=[];
    this.grenades=new Map();
    this.guardianProjectiles=new Map();
    this.wardenAttacks=new Map();
    this.corpses=[];this.remains=[];this.pickups=new Map();this.deadIds=new Set();this.deathShake=0;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.layers.set(1);
    this.temp={cameraLook:new THREE.Vector3(),character:new THREE.Vector3(),anchor:new THREE.Vector3(),
      projected:new THREE.Vector3(),direction:new THREE.Vector3()};
    this.activeIds=new Set();
    this.labels = document.getElementById('health-labels');
    this.map = document.getElementById('minimap').getContext('2d');
    const strikeWaypoint=document.getElementById('strike-world-waypoint');
    this.ui={healthText:document.getElementById('local-health-text'),healthBar:document.getElementById('local-health-bar'),
      healthFill:document.getElementById('local-health-fill'),crosshair:document.getElementById('crosshair'),
      strikeWaypoint,strikeWaypointLabel:strikeWaypoint?.querySelector('strong'),
      strikeWaypointDistance:strikeWaypoint?.querySelector('span')};
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement);
  }

  resize() {
    const { width, height } = this.canvas.parentElement.getBoundingClientRect();
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.viewCamera.aspect = this.camera.aspect;
    this.viewCamera.updateProjectionMatrix();
    document.getElementById('crosshair')?.style.setProperty(
      '--shotgun-reticle-size',`${shotgunReticleDiameter(height,this.camera.fov).toFixed(2)}px`);
  }

  recordFrame(ms) {
    if(this.frameBudget.sample(ms)){
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,this.frameBudget.scale));
      this.resize();
    }
  }

  material(color, metalness = 0.35, roughness = 0.4) {
    return new THREE.MeshStandardMaterial({ color, metalness, roughness });
  }

  box(parent, w, h, d, x, y, z, material, radius = 0.08, segments = 2) {
    const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, segments, Math.min(radius, w / 3, h / 3, d / 3)), material);
    mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true;
    parent.add(mesh); return mesh;
  }

  clearObject(group) {
    const geometries = new Set(), materials = new Set();
    group.traverse(object => {
      object.shadow?.dispose();
      object.userData.ownedTextures?.forEach(texture=>texture.dispose());
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) materials.add(object.material);
    });
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); group.clear();
  }

  build(walls, map = { width: 900, height: 600, terrain: [] }) {
    this.elevatorModel?.userData.display?.texture.dispose();
    this.arrivalModel?.userData.display?.texture.dispose();
    this.zoneUniforms?.ambientMap?.value?.dispose();
    this.floor?.uniforms?.shadowWallIndexMap?.value?.dispose();
    this.clearObject(this.stage); this.characters.clear(); this.effects = [];
    this.tracerPool=[];this.freeTracers=[];
    this.grenades.clear();
    this.guardianProjectiles.clear();
    this.wardenAttacks.clear();
    this.corpses=[];this.remains=[];this.pickups.clear();this.deadIds.clear();this.deathShake=0;
    this.clearObject(this.viewWeapon); this.viewWeaponKey = null; this.weaponRecoil = 0;this.weaponSwitchTimes.clear();
    this.viewMuzzleFlash = null;
    this.wallOccluders = [];
    this.labels.replaceChildren(); this.walls = walls;
    this.mapConfig = map;
    this.minimapCache=null;
    const pve=map.mode==='pve',strike=map.mode==='strike'||map.activity==='strike';
    const palette=map.palette||{};
    const temple=map.style==='temple',orbital=map.style==='orbital',airport=map.style==='airport',
      redVault=map.style==='redVault';
    const areas=strike?[]:planAreaLighting(map,walls);
    this.zoneUniforms=ambientZoneUniforms(planAmbientZones(map),map);
    this.scene.background.set(palette.sky||'#9ebbc9');
    this.scene.fog=null;
    this.camera.far=strike?230:140;this.camera.updateProjectionMatrix();
    this.ambient.color.set(palette.ambient||'#e3f3ff');
    this.ambient.groundColor.set(palette.ground||'#73878b');
    this.sun.color.set(palette.sun||'#ffe7c4');
    this.rim.color.set(palette.rim||palette.glow||'#48baff');
    this.ambient.intensity=palette.ambientIntensity??(pve?1.9:3.2);
    this.sun.intensity=palette.sunIntensity??(pve?1.5:3.5);
    this.rim.intensity=palette.rimIntensity??(pve?0.65:2);
    this.cargoModels=[];this.animatedTerrain=[];this.strikeEnvironment=null;this.strikeMissionState=null;
    this.liftRise=0;this.liftSway=0;this.elevatorModel=null;this.arrivalModel=null;
    const width = map.width*SCALE, depth = map.height*SCALE;
    const center = world(map.width/2,map.height/2);
    this.sun.target.position.copy(center);
    this.sun.position.copy(center).add(new THREE.Vector3(-30,55,-25));
    const extent = Math.max(width,depth)*0.7;
    Object.assign(this.sun.shadow.camera,{left:-extent,right:extent,top:extent,bottom:-extent,far:180});
    this.sun.shadow.camera.updateProjectionMatrix();
    this.reflectionSolids=strike?[]:[...walls,...map.terrain.filter(s => !s.nonSolid&&s.kind !== 'heightfield'&&s.kind !== 'ramp' && s.kind !== 'tree' && s.kind !== 'exitDoor')];
    this.floor = floorMaterial(this.reflectionSolids,areas,pve,this.zoneUniforms,palette,map);
    this.viewFootHeight=null;
    this.floor.uniforms.reflections.value = document.getElementById('raytracing-toggle').checked;
    // The arena and every recessed room are rendered in one floor draw. Using
    // separate coplanar planes exposed their shared raster edge as a line at
    // each shop entrance even though their material and height matched.
    const floorRectangles=arenaFloorRectangles(map),floorGeometry=arenaFloorGeometry(floorRectangles);
    if(!strike) {
      const floor = new THREE.Mesh(floorGeometry, this.floor);
      floor.name='arena-floor';this.stage.add(floor);
      const shadowMaterial=new THREE.ShadowMaterial({opacity:0.20,depthWrite:false});
      shadowMaterial.polygonOffset=true;shadowMaterial.polygonOffsetFactor=-1;shadowMaterial.polygonOffsetUnits=-1;
      const shadow = new THREE.Mesh(arenaFloorGeometry(floorRectangles,.006),shadowMaterial);
      shadow.receiveShadow = true;shadow.name='arena-floor-shadow';this.stage.add(shadow);
    } else floorGeometry.dispose();
    if(orbital) {
      const space=createSpaceEnvironment();space.position.copy(center);this.stage.add(space);
    }
    const dark = this.material(palette.wall||'#526d79', 0.5);
    const panel = this.material(palette.panel||'#9db5b8', 0.35, 0.32);
    const cap = this.material(palette.cap||'#bdd0cf', 0.5, 0.3);
    const glowColor=palette.glow||'#69e8df';
    const glow = new THREE.MeshStandardMaterial({ color: glowColor, emissive: glowColor,
      emissiveIntensity:temple?0.08:1.5,roughness:temple?0.92:0.4 });
    const vaultRed=redVault?this.material('#891626',.78,.25):null,
      vaultBlack=redVault?this.material('#151319',.86,.28):null;
    if(!strike) {
      for(const rectangle of floorRectangles) {
        const p=world(rectangle.x+rectangle.width/2,rectangle.y+rectangle.height/2);
        this.box(this.stage,rectangle.width*SCALE+.05,.45,rectangle.height*SCALE+.05,p.x,-.26,p.z,dark,.08);
      }
    }
    const wallGeometry={body:[],cap:[],panel:[],glow:[],red:[],black:[]};
    for (const wall of strike?[]:walls) {
      // Temple collision is deliberately invisible; a dedicated architectural
      // model below replaces the shared arena wall language completely.
      if(wall.kind==='cabin'||temple||airport) continue;
      const wallCenter=world(wall.x+wall.width/2,wall.y+wall.height/2);
      const w = wall.width * SCALE, d = wall.height * SCALE;
      const wallBottom=wall.bottom||0,wallTop=wall.top??WALL_HEIGHT,wallHeight=wallTop-wallBottom;
      wallGeometry.body.push(roundedGeometry(w,wallHeight,d,wallCenter.x,wallBottom+wallHeight/2,wallCenter.z,0.15));
      wallGeometry.cap.push(roundedGeometry(w-0.06,0.24,d-0.06,wallCenter.x,wallBottom+0.18,wallCenter.z));
      wallGeometry.cap.push(roundedGeometry(w-0.02,0.22,d-0.02,wallCenter.x,wallTop-0.12,wallCenter.z));
      const horizontal = w > d, length = horizontal ? w : d;
      const count = Math.max(1, Math.floor(length / 1.7));
      for (let i = 0; i < count; i++) {
        const along = (i + 0.5) * length / count - length / 2;
        for (const sign of [-1, 1]) {
          // Keep the entire 0.10-deep panel outside the wall, including its
          // rounded edges. The old inset left only 0.005 protruding, so the
          // bevels intersected the wall face and flickered as the view moved.
          const face = sign * ((horizontal ? d : w) / 2 + 0.06);
          const panelGeometry=roundedGeometry(horizontal ? length / count - 0.12 : temple?0.07:0.10,
            temple?Math.max(.35,wallHeight*.33):wallHeight-1,
            horizontal ? temple?0.07:0.10 : length / count - 0.12,
            wallCenter.x+(horizontal ? along : face),temple?wallBottom+wallHeight*.43:wallBottom+wallHeight/2,
            wallCenter.z+(horizontal ? face : along),temple?0.025:0.045);
          (redVault?(i%4===1?wallGeometry.red:i%4===3?wallGeometry.black:wallGeometry.panel):
            wallGeometry.panel).push(panelGeometry);
        }
      }
      if(temple) {
        // Moss sits on top of the ancient masonry. Keeping it in its own
        // shallow batch creates a soft organic edge without extra lights.
        wallGeometry.glow.push(roundedGeometry(Math.max(.02,w-.13),0.035,Math.max(.02,d-.13),
          wallCenter.x,wallHeight+.025,wallCenter.z,0.012));
      } else {
        // Surface-mounted light strips remain visible outside the wall body.
        for (const sign of [-1, 1]) {
          wallGeometry.glow.push(roundedGeometry(horizontal ? w - 0.22 : 0.018, 0.055,
            horizontal ? 0.018 : d - 0.22,
            wallCenter.x+(horizontal ? 0 : sign*w/2),wallTop-0.32,
            wallCenter.z+(horizontal ? sign*d/2 : 0),0.005));
        }
      }
    }
    const wallBody=mergedMesh(wallGeometry.body,dark,{castShadow:true});
    const wallCaps=mergedMesh(wallGeometry.cap,cap);
    const wallPanels=mergedMesh(wallGeometry.panel,panel);
    const wallGlow=mergedMesh(wallGeometry.glow,glow,{receiveShadow:false});
    const wallRed=mergedMesh(wallGeometry.red,vaultRed),wallBlack=mergedMesh(wallGeometry.black,vaultBlack);
    for(const mesh of [wallBody,wallCaps,wallPanels,wallRed,wallBlack,wallGlow])if(mesh)this.stage.add(mesh);
    if(wallBody){wallBody.layers.enable(1);this.wallOccluders.push(wallBody);}
    const terrainBatches=new Map();
    const occluderMaterial=new THREE.MeshBasicMaterial({colorWrite:false,depthWrite:false});
    if(temple) {
      collectStaticModel(createTempleEnvironment(map,walls),new THREE.Vector3(),terrainBatches);
      // Keep label/health-bar occlusion aligned to authoritative collision even
      // though the visible temple uses arches, blockwork, cliffs and foliage.
      for(const solid of walls) {
        if(solid.kind==='cabin')continue;
        const bottom=solid.bottom||0,top=solid.top??WALL_HEIGHT;
        const proxy=new THREE.Mesh(new THREE.BoxGeometry(solid.width*SCALE,Math.max(.02,top-bottom),solid.height*SCALE),occluderMaterial);
        proxy.position.copy(world(solid.x+solid.width/2,solid.y+solid.height/2,(top+bottom)/2));
        proxy.layers.set(1);this.stage.add(proxy);this.wallOccluders.push(proxy);
      }
    }
    if(airport) {
      collectStaticModel(createAirportEnvironment(map,walls),new THREE.Vector3(),terrainBatches);
      // The visual shell uses glass, wall bays, and service doors while these
      // invisible boxes keep labels and health bars occluded by authoritative
      // gameplay geometry.
      for(const solid of walls) {
        if(solid.kind==='cabin')continue;
        const bottom=solid.bottom||0,top=solid.top??WALL_HEIGHT;
        const proxy=new THREE.Mesh(new THREE.BoxGeometry(solid.width*SCALE,Math.max(.02,top-bottom),solid.height*SCALE),occluderMaterial);
        proxy.position.copy(world(solid.x+solid.width/2,solid.y+solid.height/2,(top+bottom)/2));
        proxy.layers.set(1);this.stage.add(proxy);this.wallOccluders.push(proxy);
      }
    }
    for (const solid of strike?[]:map.terrain) {
      if(solid.kind==='exitDoor'||solid.kind==='heightfield'||solid.collisionOnly)continue;
      const model = createTerrainModel(solid);
      const position=world(solid.x,solid.y,solid.kind==='rail'?0:solid.bottom||0);
      if(solid.kind==='vaultConveyor') {
        model.position.copy(position);this.stage.add(model);this.animatedTerrain.push(model);
        model.traverse(mesh=>{if(mesh.isMesh){mesh.layers.enable(1);this.wallOccluders.push(mesh);}});
      } else if(solid.kind==='lift'||solid.liftId) {
        model.position.copy(position);this.stage.add(model);this.cargoModels.push({solid,model});
        model.traverse(mesh=>{if(mesh.isMesh){mesh.layers.enable(1);this.wallOccluders.push(mesh);}});
      } else {
        collectStaticModel(model,position,terrainBatches);
        if(!solid.nonSolid&&!['tree','templeTree','templePool'].includes(solid.kind)) {
          const bottom=solid.bottom||0,top=solid.top??WALL_HEIGHT;
          const proxy=new THREE.Mesh(new THREE.BoxGeometry(solid.width*SCALE,Math.max(0.02,top-bottom),solid.height*SCALE),occluderMaterial);
          proxy.position.copy(world(solid.x+solid.width/2,solid.y+solid.height/2,(top+bottom)/2));
          proxy.layers.set(1);this.stage.add(proxy);this.wallOccluders.push(proxy);
        }
      }
    }
    for(const batch of terrainBatches.values()) {
      const mesh=mergedMesh(batch.geometries,batch.material,{castShadow:batch.castShadow,receiveShadow:batch.receiveShadow});
      if(mesh)this.stage.add(mesh);
    }
    if(map.ceiling&&map.roof!==false&&!strike) {
      const ceilingMat=this.material(redVault?'#27252a':'#b5c7c6',redVault ? .72 : .12,redVault ? .36 : .8);
      for(const rectangle of floorRectangles) {
        const p=world(rectangle.x+rectangle.width/2,rectangle.y+rectangle.height/2);
        this.box(this.stage,rectangle.width*SCALE,0.2,rectangle.height*SCALE,p.x,map.ceiling+0.1,p.z,ceilingMat);
      }
      // Broad emissive luminaires and inset beams; no costly per-fixture lights.
      const whiteLamp=new THREE.MeshBasicMaterial({color:'#f6ffed'});
      const redLamp=new THREE.MeshBasicMaterial({color:'#ff314a'});
      for(let x=240;!pve&&x<map.width;x+=300) for(let y=180;y<map.height;y+=300) {
        if(map.floorRects&&!map.floorRects.some(rect=>x>=rect.x&&x<=rect.x+rect.width&&y>=rect.y&&y<=rect.y+rect.height))continue;
        const p=world(x,y,map.ceiling-0.08);
        const lamp=redVault&&((Math.floor(x/300)+Math.floor(y/300))%3===0)?redLamp:whiteLamp;
        this.box(this.stage,4,0.07,0.7,p.x,p.y,p.z,lamp);
      }
      for(let y=120;!map.floorRects&&y<map.height;y+=360) {
        const p=world(map.width/2,y,map.ceiling-0.15);
        this.box(this.stage,width,0.3,0.22,p.x,p.y,p.z,panel);
      }
    }
    if(strike) {
      this.strikeEnvironment=createRedVaultEnvironment(map);
      this.stage.add(this.strikeEnvironment);
      for(const mesh of this.strikeEnvironment.userData.occluders||[])this.wallOccluders.push(mesh);
      const metrics=this.strikeEnvironment.userData.metrics?.();
      if(metrics&&!finiteMetricTree(metrics))throw new Error('Non-finite Red Vault render metrics');
    }
    this.areaLights=createAreaLighting(areas,world);
    this.areaLightObjects=[];
    this.areaLights.traverse(o=>{if(o.isLight){o.userData.roomIntensity=o.intensity;this.areaLightObjects.push(o);
      if(o.castShadow)o.shadow.autoUpdate=false;}});
    this.stage.add(this.areaLights);
    if(map.elevator) {
      this.elevatorModel=createElevatorModel(map.elevator);
      this.elevatorModel.position.copy(world(map.elevator.x,map.elevator.y));
      if(map.elevator.facing==='west') {
        this.elevatorModel.rotation.y=Math.PI;
        this.elevatorModel.position.copy(world(map.elevator.x+map.elevator.width,map.elevator.y+map.elevator.height));
      }
      this.stage.add(this.elevatorModel);
      this.elevatorModel.traverse(m=>{if(m.isMesh){m.layers.enable(1);this.wallOccluders.push(m);}});
      poseElevator(this.elevatorModel,{door:map.arrivalElevator?0:1,rise:0});
    }
    if(map.arrivalElevator) {
      this.arrivalModel=createElevatorModel(map.arrivalElevator);
      this.arrivalModel.position.copy(world(map.arrivalElevator.x,map.arrivalElevator.y));
      this.stage.add(this.arrivalModel);
      this.arrivalModel.traverse(m=>{if(m.isMesh){m.layers.enable(1);this.wallOccluders.push(m);}});
      poseElevator(this.arrivalModel,{door:1,rise:0});
    }
    if(!strike&&!map.floorPolygon) {
      for (const z of [-depth/2, depth/2]) this.box(this.stage, width, 0.05, 0.08, center.x, 0.035, center.z+z, glow, 0.01);
      for (const x of [-width/2, width/2]) this.box(this.stage, 0.08, 0.05, depth, center.x+x, 0.035, center.z, glow, 0.01);
    }
    if(pve)applyAmbientZones(this.stage,this.zoneUniforms);
    // Establish static matrixWorld values once. The renderer handles moving
    // actors; forcing the entire room dirty every frame was redundant.
    this.scene.updateMatrixWorld(true);
    this.shadowDirty=true;this.sun.shadow.needsUpdate=true;
    for(const light of this.areaLightObjects)if(light.castShadow)light.shadow.needsUpdate=true;
    this.renderer.shadowMap.needsUpdate=true;
    this.elevatorCabinFill=null;this.stageRideVisible=null;this.elevatorPose=null;
    this.resize();
  }

  createCharacter(player, localId) {
    const group = new THREE.Group();
    const warden=player.botType==='warden';
    const dread=player.botType==='dread'||warden,captain=dread&&(player.botRank==='captain'||warden);
    const armor = this.material(dread?(captain?'#d52836':'#8e1724'):(player.color || '#59daca'), dread?0.7:0.45, dread?0.24:0.32);
    const undersuit = this.material(dread?'#17090d':'#182a35', dread?0.55:0.1, dread?0.42:0.65);
    const white = this.material(dread?'#382329':'#d9e4de', dread?0.72:0.4, dread?0.28:0.35);
    const visor = new THREE.MeshStandardMaterial({ color: dread?0x260408:0x122b35, metalness: 0.8, roughness: 0.12,
      emissive:dread?0xff102c:0x185c6a, emissiveIntensity:dread?(captain?2.5:1.7):0.5 });
    // Spend the extra bevel geometry on player avatars. PvE soldier crowds
    // keep the original mesh density so the cosmetic pass does not tax later floors.
    const smoothBody=!player.isBot;
    const bodySegments=smoothBody?4:2;
    this.box(group, 0.72, 0.65, 0.52, 0, 1.19, 0, armor, 0.17, bodySegments);
    this.box(group, 0.42, 0.31, 0.10, 0, 1.27, -0.28, white, 0.08, bodySegments);
    this.box(group, 0.46, 0.57, 0.25, 0, 1.18, 0.34, undersuit, 0.08, bodySegments);
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.32, smoothBody?24:16, smoothBody?18:12), white);
    helmet.position.y = 1.84; helmet.scale.set(1, 1.08, 0.95); helmet.castShadow = true; group.add(helmet);
    this.box(group, 0.48, 0.18, 0.16, 0, 1.86, -0.255, visor, 0.07, bodySegments);
    const legs = [], arms=[];
    for (const side of [-1, 1]) {
      const leg = new THREE.Group(); leg.position.set(side * 0.22, 0.88, 0); group.add(leg);
      this.box(leg, 0.27, 0.64, 0.3, 0, -0.34, 0, undersuit, 0.08, bodySegments);
      this.box(leg, 0.29, 0.23, 0.18, 0, -0.36, -0.12, armor, 0.08, bodySegments);
      this.box(leg, 0.31, 0.19, 0.44, 0, -0.77, -0.07, white, 0.08, bodySegments); legs.push(leg);
      const arm=new THREE.Group();arm.position.set(side*0.47,1.42,0);group.add(arm);arms.push(arm);
      this.box(arm, 0.25, 0.3, 0.33, 0, 0, 0, armor, 0.08, bodySegments);
      this.box(arm, 0.20, 0.22, 0.57, -side*0.04, -0.2, -0.23, undersuit, 0.08, bodySegments);
      this.box(arm, 0.18, 0.19, 0.18, -side*0.07, -0.2, -0.51, white, 0.08, bodySegments);
    }
    let dreadCore=null,dreadTelegraph=null,wardenPresentation=null;
    if(dread) {
      // A sharper, top-heavy silhouette reads immediately as a new enemy even
      // through smoke or at the far side of a room. Red belongs to Dreads;
      // Ogre crystals remain the game's purple threat language.
      for(const side of [-1,1]) {
        this.box(group,captain?0.39:0.34,0.19,0.48,side*0.49,1.55,0,armor,0.045);
        this.box(group,0.08,0.3,0.16,side*0.29,1.86,-0.02,armor,0.025);
      }
      this.box(group,0.54,0.18,0.16,0,1.48,-0.29,white,0.035);
      this.box(group,0.36,0.12,0.14,0,2.12,0,armor,0.03);
      const coreMaterial=new THREE.MeshStandardMaterial({color:0x3a050b,emissive:captain?0xff3048:0xe0142d,
        emissiveIntensity:captain?2.8:1.9,metalness:.55,roughness:.18});
      dreadCore=new THREE.Mesh(new THREE.OctahedronGeometry(captain?.105:.085,0),coreMaterial);
      dreadCore.name='dread-core';dreadCore.position.set(0,1.43,-.34);group.add(dreadCore);
      const positions=new Float32Array(6);
      dreadTelegraph=new THREE.Line(new THREE.BufferGeometry().setAttribute('position',new THREE.BufferAttribute(positions,3)),
        new THREE.LineBasicMaterial({color:captain?0xff4558:0xff1d38,transparent:true,opacity:.8,
          blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false}));
      dreadTelegraph.name='dread-charge-beam';dreadTelegraph.visible=false;dreadTelegraph.frustumCulled=false;group.add(dreadTelegraph);
      if(warden) {
        // The Warden is not a scaled captain. A split crown, broad floating
        // gorget and asymmetric forge shield give it a readable boss outline
        // from both command balconies and the lower crucible well.
        for(const side of [-1,1]) {
          const horn=new THREE.Mesh(new THREE.ConeGeometry(.13,.78,7),armor);
          horn.position.set(side*.28,2.42,.03);horn.rotation.z=side*.34;horn.castShadow=true;group.add(horn);
          this.box(group,.23,.92,.18,side*.56,1.66,.08,white,.055);
        }
        const gorget=new THREE.Mesh(new THREE.TorusGeometry(.57,.105,8,20,Math.PI*1.55),armor);
        gorget.position.set(0,1.62,.12);gorget.rotation.set(Math.PI/2,0,.78);group.add(gorget);
        this.box(group,.16,1.18,.7,-.68,1.28,.04,armor,.065);
        const bossHalo=new THREE.Mesh(new THREE.TorusGeometry(.48,.045,7,24),coreMaterial);
        bossHalo.name='warden-halo';bossHalo.position.set(0,2.16,.21);bossHalo.rotation.x=Math.PI/2;group.add(bossHalo);
        wardenPresentation=createWardenPresentation();group.add(wardenPresentation.group);
        group.scale.setScalar(1.34);
      }
    }
    const weapon = new THREE.Group(); group.add(weapon);
    const skin = WEAPON_SKINS[player.weapon]?.find(s => s.key === player.weaponSkinKey);
    const marioPipe = player.weapon === 'sniper' && skin?.key === 'sniper_mario';
    const length = ({ pistol: 0.6, autoRifle: 0.95, miniGun: 0.72, sniper: 1.35, shotgun: 1.05 })[player.weapon] || 0.6;
    const muzzleLength=player.weapon==='pistol'?length*PISTOL_MODEL_SCALE:length;
    if(dread) {
      const gunmetal=this.material('#17191d',.88,.2),redMetal=this.material(captain?'#e02b3a':'#8e1521',.74,.2);
      const energy=new THREE.MeshStandardMaterial({color:0x33070c,emissive:captain?0xff344b:0xe4112c,
        emissiveIntensity:2.2,metalness:.45,roughness:.18});
      this.box(weapon,.3,.27,.7,.27,1.35,-.83,gunmetal,.065);
      this.box(weapon,.25,.21,.52,.27,1.37,-1.24,redMetal,.055);
      this.box(weapon,.12,.11,.27,.27,1.37,-1.58,gunmetal,.04);
      this.box(weapon,.22,.22,.34,.27,1.34,-.42,white,.055);
      this.box(weapon,.18,.06,.68,.27,1.515,-.92,energy,.025);
      this.box(weapon,.08,.14,.22,.27,1.6,-.83,gunmetal,.025);
      this.box(weapon,.18,.31,.22,.27,1.08,-.82,redMetal,.035);
    } else if(player.weapon==='shotgun') {
      const model=createShotgun(skin?.key,length);model.position.set(0.27,1.34,-0.45);weapon.add(model);
    } else if (marioPipe) {
      const pipe = createMarioPipe(length); pipe.position.set(0.27, 1.34, -0.45); weapon.add(pipe);
    } else if (player.weapon === 'autoRifle') {
      const rifle = createAutoRifle(skin?.key, length); rifle.position.set(0.27, 1.34, -0.45); weapon.add(rifle);
    } else if (player.weapon === 'pistol') {
      const pistol = createPistol(skin?.key, length); pistol.position.set(0.27, 1.34, -0.45); weapon.add(pistol);
    } else if (player.weapon === 'miniGun' || ['sniper_calibrated','sniper_flatpack','sniper_kintsugi'].includes(skin?.key)) {
      const model = createHeavyWeapon(player.weapon, skin?.key, length); model.position.set(0.27, 1.34, -0.45); weapon.add(model);
    } else {
      const weaponMaterial = this.material(skin?.bulletColor || '#334653', 0.75, 0.22);
      this.box(weapon, 0.24, 0.23, length, 0.27, 1.34, -0.45 - length / 2, weaponMaterial, 0.04);
    }
    if(dread)mergeRigidMeshes(weapon);
    else if(player.weapon!=='shotgun')for(const child of [...weapon.children])if(child.isGroup)mergeRigidMeshes(child);
    this.box(weapon, 0.13, 0.23, 0.16, 0.27, 1.18, -0.57, undersuit, 0.02);
    if (player.weapon === 'sniper' && !marioPipe && !['sniper_calibrated','sniper_flatpack','sniper_kintsugi'].includes(skin?.key)) this.box(weapon, 0.16, 0.15, 0.35, 0.27, 1.52, -0.85, visor, 0.05);
    mergeRigidMeshes(weapon);
    if (player.id === localId) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.86, 0.91, 48), new THREE.MeshBasicMaterial({ color: 0x77ffda, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.025; group.add(ring);
    }
    let ogreModel=null;
    if(player.botType==='ogre') {
      this.clearObject(group);ogreModel=createOgreModel();group.add(ogreModel.group);
      legs.splice(0,legs.length,...ogreModel.legs);arms.splice(0,arms.length,...ogreModel.arms);
      mergeRigidMeshes(ogreModel.torso,new Set([ogreModel.crystal]));
      for(const limb of [...ogreModel.legs,...ogreModel.arms])mergeRigidMeshes(limb);
    }
    let guardianModel=null;
    if(player.botType==='guardian') {
      this.clearObject(group);guardianModel=createGuardianModel();group.add(guardianModel.group);
      legs.length=0;arms.length=0;
      mergeRigidMeshes(guardianModel.armor);
    }
    if(!ogreModel&&!guardianModel)mergeRigidMeshes(group,new Set([dreadCore]));
    // A character can contain dozens of cosmetic meshes. Only the largest
    // silhouette pieces need to render into shadow maps.
    limitShadowCasters(group,player.botType==='ogre'?10:player.botType==='guardian'?6:warden?12:8);
    let spawnShieldOutline=null;
    if(this.mapConfig.mode==='pvp'&&Number.isFinite(player.spawnShieldUntil)) {
      spawnShieldOutline=createPvpSpawnShieldOutline(group);spawnShieldOutline.visible=false;group.add(spawnShieldOutline);
    }
    let spawnArrival=null,spawnMaterials=[];
    if(player.isBot&&(this.mapConfig.mode==='strike'||this.mapConfig.activity==='strike')&&
      Number.isFinite(player.spawnRevealAt)&&player.spawnRevealAt>performance.now()-250) {
      // Capture the actual character before attaching the additive arrival
      // meshes, so only the body fades in while its warning column stays vivid.
      spawnMaterials=captureMaterialization(group);
      spawnArrival=createStrikeSpawnArrival();group.add(spawnArrival.group);
    }
    const label = document.createElement('div'); label.className = 'character-health';
    const name = document.createElement('span'); name.textContent = player.name;
    const value = document.createElement('strong');
    const bar = document.createElement('i'); const fill = document.createElement('b'); bar.append(fill);
    label.append(name, value, bar); this.labels.append(label); this.stage.add(group);
    if(this.mapConfig.mode==='pve')applyAmbientZones(group,this.zoneUniforms);
    const record = { group, legs, arms, weapon, ogreModel, guardianModel, dread, warden, wardenPresentation,
      dreadCore, dreadTelegraph, label, value, fill, x: player.x, y: player.y, phase: 0, recoil: 0,
      weaponKey:player.weapon,weaponSwitchAt:this.weaponSwitchTimes?.get(player.id)??-Infinity,
      weaponSkinKey:skin?.key,muzzleBaseX:0.27,muzzleBarrelOffset:length*0.062,
      health: player.health ?? player.maxHealth ?? 101, damageFlash: 0, flashMaterials: this.captureFlashMaterials(group),
      spawnArrival,spawnMaterials,spawnRevealAt:player.spawnRevealAt,spawnRestored:false,spawnShieldOutline };
    record.muzzleFlash = createMuzzleFlash(0.1*muzzleFlashScaleForWeapon(player.weapon));
    record.muzzleFlash.position.set(0.27, 1.34 + length * heavyWeaponMuzzleYOffset(skin?.key),
      -0.45 - muzzleLength * heavyWeaponMuzzleDepth(skin?.key));
    if(dread)record.muzzleFlash.position.set(.27,1.37,-1.72);
    if (player.weapon === 'miniGun'&&skin?.key!=='miniGun_midas') record.muzzleFlash.position.x += length * 0.125;
    record.muzzleBaseX=record.muzzleFlash.position.x;
    (ogreModel||guardianModel?group:weapon).add(record.muzzleFlash);
    this.characters.set(player.id, record); return record;
  }

  captureFlashMaterials(group) {
    const materials = new Set();
    group.traverse(object => { if (object.material?.color) materials.add(object.material); });
    return [...materials].map(material => ({ material, color: material.color.clone(),
      emissive: material.emissive?.clone(), intensity: material.emissiveIntensity }));
  }

  applyDamageFlash(materials, time) {
    const strength = Math.min(1, time / 0.12);
    for (const base of materials) {
      base.material.color.copy(base.color).lerp(DAMAGE_FLASH_COLOR, strength * 0.85);
      if (base.emissive) {
        base.material.emissive.copy(base.emissive).lerp(DAMAGE_FLASH_COLOR, strength);
        base.material.emissiveIntensity = base.intensity * (1 - strength) + 0.4 * strength;
      }
    }
  }

  buildViewWeapon(player) {
    const key = `${player.weapon}:${player.weaponSkinKey}`;
    if (this.viewWeaponKey === key) return;
    this.clearObject(this.viewWeapon);delete this.viewWeapon.userData.kintsugiModelCache;
    delete this.viewWeapon.userData.shotgunPoseParts;this.viewWeaponKey = key;
    const skin = WEAPON_SKINS[player.weapon]?.find(s => s.key === player.weaponSkinKey);
    const marioPipe = player.weapon === 'sniper' && skin?.key === 'sniper_mario';
    const grip = this.material('#182a35', 0.15, 0.65);
    const glove = this.material('#c6d6d5', 0.25, 0.4);
    const length = ({ pistol: 0.36, autoRifle: 0.58, miniGun: 0.5, sniper: 0.8, shotgun: 0.68 })[player.weapon] || 0.36;
    const muzzleLength=player.weapon==='pistol'?length*PISTOL_MODEL_SCALE:length;
    if(player.weapon==='shotgun') {
      const model=createShotgun(skin?.key,length);model.position.set(0.23,-0.2,-0.32);this.viewWeapon.add(model);
    } else if (marioPipe) {
      const pipe = createMarioPipe(length); pipe.position.set(0.23, -0.2, -0.32); this.viewWeapon.add(pipe);
    } else if (player.weapon === 'autoRifle') {
      const rifle = createAutoRifle(skin?.key, length); rifle.position.set(0.23, -0.2, -0.32); this.viewWeapon.add(rifle);
    } else if (player.weapon === 'pistol') {
      const pistol = createPistol(skin?.key, length); pistol.position.set(0.23, -0.2, -0.32); this.viewWeapon.add(pistol);
    } else if (player.weapon === 'miniGun' || ['sniper_calibrated','sniper_flatpack','sniper_kintsugi'].includes(skin?.key)) {
      const model = createHeavyWeapon(player.weapon, skin?.key, length);
      model.scale.setScalar(length * heavyWeaponViewScale(skin?.key));
      model.position.set(0.23, -0.2 + heavyWeaponViewYOffset(skin?.key), heavyWeaponViewZ(skin?.key));
      this.viewWeapon.add(model);
    } else {
      const metal = this.material(skin?.bulletColor || '#354854', 0.7, 0.25);
      this.box(this.viewWeapon, 0.12, 0.14, length, 0.23, -0.2, -0.32 - length / 2, metal, 0.025);
    }
    if(player.weapon!=='shotgun')for(const child of [...this.viewWeapon.children])if(child.isGroup)mergeRigidMeshes(child);
    this.box(this.viewWeapon, 0.09, 0.22, 0.13, 0.23, -0.31, -0.43, grip, 0.025);
    this.box(this.viewWeapon, 0.12, 0.14, 0.17, 0.23, -0.31, -0.37, glove, 0.035);
    this.box(this.viewWeapon, 0.14, 0.15, 0.38, 0.23, -0.36, -0.15, grip, 0.045);
    if (player.weapon !== 'pistol') {
      this.box(this.viewWeapon, 0.13, 0.13, 0.17, 0.16, -0.29, -0.66, glove, 0.035);
      this.box(this.viewWeapon, 0.14, 0.15, 0.43, 0.10, -0.37, -0.39, grip, 0.035);
    }
    if (player.weapon === 'sniper' && !marioPipe && !['sniper_calibrated','sniper_flatpack','sniper_kintsugi'].includes(skin?.key)) this.box(this.viewWeapon, 0.08, 0.08, 0.28, 0.23, -0.09, -0.61, grip, 0.025);
    mergeRigidMeshes(this.viewWeapon);
    this.viewFlashMaterials = this.captureFlashMaterials(this.viewWeapon);
    this.viewMuzzleFlash = createMuzzleFlash(0.045*muzzleFlashScaleForWeapon(player.weapon));
    this.viewMuzzleFlash.position.set(0.23,
      -0.2 + heavyWeaponViewYOffset(skin?.key) + length * heavyWeaponMuzzleYOffset(skin?.key),
      -0.32 - muzzleLength * heavyWeaponMuzzleDepth(skin?.key));
    if (player.weapon === 'miniGun'&&skin?.key!=='miniGun_midas') this.viewMuzzleFlash.position.x += length * 0.125;
    this.viewMuzzleState={weaponSkinKey:skin?.key,muzzleBaseX:this.viewMuzzleFlash.position.x,muzzleBarrelOffset:length*0.062};
    this.viewWeapon.add(this.viewMuzzleFlash);
  }

  triggerWeaponFlash(flash,state,shot) {
    const style=shotgunMuzzleStyle(state?.weaponSkinKey,shot.shotgunBarrel);
    flash.position.x=(state?.muzzleBaseX??flash.position.x)+(style?.barrel||0)*(state?.muzzleBarrelOffset||0);
    const skinColor=state?.weaponSkinKey==='pistol_pocket_dragon'?'#ff8426':
      ['sniper_kintsugi','pistol_kintsugi'].includes(state?.weaponSkinKey)?'#ffc857':null;
    triggerMuzzleFlash(flash,Math.random,state?.dread?'#ff263f':style?.color||skinColor);
  }

  weaponSwitched(playerId) {
    this.weaponSwitchTimes||=new Map();
    this.weaponSwitchTimes.set(playerId,this.renderTime);
    const character=this.characters.get(playerId);
    if(character)character.weaponSwitchAt=this.renderTime;
  }

  characterDeath(player,death) {
    if(!death||this.deadIds.has(player.id))return;
    this.deadIds.add(player.id);
    const c=this.characters.get(player.id)||this.createCharacter(player,null);
    this.applyDamageFlash(c.flashMaterials,0);
    this.characters.delete(player.id);
    const corpse=createCorpse(c,death);this.stage.add(corpse.group);this.corpses.push(corpse);
    if(this.corpses.length>MAX_CORPSES){const old=this.corpses.shift();this.stage.remove(old.group);this.clearObject(old.group);}
  }

  setPickups(states) {
    const ids=new Set(states.map(s=>s.id));
    for(const [id,item] of this.pickups)if(!ids.has(id)) {
      this.stage.remove(item.group);this.clearObject(item.group);this.pickups.delete(id);
    }
    for(const state of states) {
      let item=this.pickups.get(state.id);
      if(!item){item={group:createGrenadePickup()};this.pickups.set(state.id,item);this.stage.add(item.group);}
      item.state=state;
    }
  }

  updateDeathEffects(dt) {
    for(let i=this.corpses.length-1;i>=0;i--) {
      const c=this.corpses[i],lift=this.mapConfig.terrain.find(s=>s.id===c.death.platformId&&s.kind==='lift');
      const result=poseCorpse(c,dt,world,lift?.top??c.death.ground);
      if(result.impact&&(c.death.ogre||c.death.kind==='grenade')) {
        const group=createDeathRemains(c.death);
        group.position.copy(world(c.death.endX,c.death.endY,lift?.top??c.death.ground));
        group.userData.platformId=c.death.platformId;
        this.stage.add(group);this.remains.push(group);
        if(this.remains.length>MAX_REMAINS){const old=this.remains.shift();this.stage.remove(old);this.clearObject(old);}
        if(c.death.ogre){
          const distance=this.camera.position.distanceTo(group.position);
          this.deathShake=Math.max(this.deathShake,.075*Math.max(0,1-distance/12));
        }
      }
      if(result.done){this.stage.remove(c.group);this.clearObject(c.group);this.corpses.splice(i,1);}
    }
    for(let i=this.remains.length-1;i>=0;i--){
      const group=this.remains[i],lift=this.mapConfig.terrain.find(s=>s.id===group.userData.platformId&&s.kind==='lift');
      if(lift)group.position.y=lift.top;
      if(poseDeathRemains(group,dt,this.camera.quaternion)){this.stage.remove(group);this.clearObject(group);this.remains.splice(i,1);}
    }
    for(const {group,state} of this.pickups.values()) {
      group.position.copy(world(state.x,state.y,state.height+.5+Math.sin(this.renderTime*3+state.id)*.07));
      group.rotation.y=this.renderTime*1.4;
    }
  }

  setGrenades(states,serverNow=Date.now(),replace=true) {
    const ids=new Set(states.map(g=>g.id));
    for(const [id,item] of this.grenades)if(replace&&!ids.has(id)) {
      this.stage.remove(item.group);this.clearObject(item.group);this.grenades.delete(id);
    }
    for(const state of states) {
      let item=this.grenades.get(state.id);
      if(!item) {
        const group=new THREE.Group();
        const body=new THREE.Mesh(new THREE.IcosahedronGeometry(.12,1),new THREE.MeshStandardMaterial({color:0x617344,roughness:.75,metalness:.3}));
        body.scale.y=1.25;group.add(body);
        const cap=new THREE.Mesh(new THREE.BoxGeometry(.08,.065,.08),new THREE.MeshStandardMaterial({color:0x333b39}));
        cap.position.y=.13;group.add(cap);
        const fuse=new THREE.Mesh(new THREE.SphereGeometry(.035,6,4),new THREE.MeshBasicMaterial({color:0xff5d25}));
        fuse.position.set(.045,.15,0);group.add(fuse);
        group.position.copy(world(state.x,state.y,state.height));this.stage.add(group);
        item={group,body,target:group.position.clone()};this.grenades.set(state.id,item);
      }
      item.target.copy(world(state.x,state.y,state.height));item.moving=Math.hypot(state.vx,state.vy,state.vz)>15;
      item.fuseDeadline=performance.now()+Math.max(0,(state.expiresAt??serverNow)-serverNow);
    }
  }

  setGuardianProjectiles(states,serverNow=Date.now(),replace=true) {
    const ids=new Set(states.map(state=>state.id));
    for(const [id,item] of this.guardianProjectiles)if(replace&&!ids.has(id)) {
      this.stage.remove(item.model.group);this.clearObject(item.model.group);this.guardianProjectiles.delete(id);
    }
    for(const state of states) {
      let item=this.guardianProjectiles.get(state.id);
      if(!item) {
        const model=createGuardianProjectile();model.group.position.copy(world(state.x,state.y,state.height));
        this.stage.add(model.group);item={model,target:model.group.position.clone(),phase:0};this.guardianProjectiles.set(state.id,item);
      }
      item.target.copy(world(state.x,state.y,state.height));
      item.deadline=performance.now()+Math.max(0,(state.expiresAt??serverNow)-serverNow);
    }
  }

  guardianExplosion(state) {
    const item=this.guardianProjectiles.get(state.id);
    if(item){this.stage.remove(item.model.group);this.clearObject(item.model.group);this.guardianProjectiles.delete(state.id);}
    const group=createGuardianExplosion();group.position.copy(world(state.x,state.y,state.height));this.stage.add(group);
    this.effects.push({group,time:.65,duration:.65,guardianExplosion:true});
  }

  grenadeExplosion(state) {
    const item=this.grenades.get(state.id);
    if(item){this.stage.remove(item.group);this.clearObject(item.group);this.grenades.delete(state.id);}
    // Bound simultaneous smoke effects when an entire squad throws together.
    const existing=this.effects.filter(fx=>fx.explosion);
    if(existing.length>=6){const oldest=existing[0];this.stage.remove(oldest.group);this.clearObject(oldest.group);this.effects.splice(this.effects.indexOf(oldest),1);}
    const group=createGrenadeExplosion();group.position.copy(world(state.x,state.y,state.height));
    poseGrenadeExplosion(group,0,this.camera.quaternion);
    this.stage.add(group);this.effects.push({group,time:EXPLOSION_DURATION,duration:EXPLOSION_DURATION,explosion:true});
  }

  strikeReactorExplosion(state) {
    const existing=this.effects.filter(fx=>fx.explosion);
    if(existing.length>=6){const oldest=existing[0];this.stage.remove(oldest.group);this.clearObject(oldest.group);this.effects.splice(this.effects.indexOf(oldest),1);}
    const group=createGrenadeExplosion();group.position.copy(world(state.x,state.y,state.height));
    group.scale.setScalar(1.28);poseGrenadeExplosion(group,0,this.camera.quaternion);
    this.stage.add(group);this.effects.push({group,time:EXPLOSION_DURATION,duration:EXPLOSION_DURATION,explosion:true});
  }

  acquireTracer() {
    let item=this.freeTracers.pop();
    if(item)return item;
    const positions=new Float32Array(6);
    const geometry=new THREE.BufferGeometry();
    const attribute=new THREE.BufferAttribute(positions,3);attribute.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position',attribute);
    const lineMaterial=new THREE.LineBasicMaterial({transparent:true,opacity:.9});
    const line=new THREE.Line(geometry,lineMaterial);
    const sparkMaterial=new THREE.MeshBasicMaterial({transparent:true});
    const spark=new THREE.Mesh(new THREE.IcosahedronGeometry(.13,0),sparkMaterial);
    const group=new THREE.Group();group.add(line,spark);group.visible=false;this.stage.add(group);
    item={group,line,spark};this.tracerPool.push(item);return item;
  }

  releaseTracer(item) {
    item.group.visible=false;
    if(!this.freeTracers.includes(item))this.freeTracers.push(item);
  }

  shot(shot) {
    const character = this.characters.get(shot.playerId);
    const dread=character?.dread;
    const skinKey=shot.weaponSkinKey||character?.weaponSkinKey||
      (shot.playerId===this.localId?this.viewMuzzleState?.weaponSkinKey:null);
    const barrelStyle=shotgunMuzzleStyle(skinKey,shot.shotgunBarrel);
    for(const pellet of shot.pellets||[shot]) {
    const start = world(pellet.x, pellet.y, pellet.height ?? 1.84), end = world(pellet.endX, pellet.endY, pellet.endHeight ?? 1.84);
    const pelletColor=dread?0xff253d:['sniper_kintsugi','pistol_kintsugi'].includes(skinKey)?0xf2b94f:
      shotgunPelletColor(skinKey,shot.shotgunBarrel,pellet.hit==='player');
    const tracer=this.acquireTracer(),positions=tracer.line.geometry.attributes.position;
    positions.setXYZ(0,start.x,start.y,start.z);positions.setXYZ(1,end.x,end.y,end.z);positions.needsUpdate=true;
    tracer.line.material.color.setHex(pelletColor);tracer.line.material.opacity=.9;
    tracer.spark.material.color.set(dread?0xff4053:(barrelStyle?.color||0xffdfaa));tracer.spark.material.opacity=1;
    tracer.spark.position.copy(end);tracer.group.visible=true;
    this.effects.push({group:tracer.group,time:.11,duration:.11,tracer});
    }
    if(shot.strikeTargetId)this.strikeEnvironment?.userData?.hitDestructible?.(shot.strikeTargetId,shot);
    const pistolShot=character?.weaponKey==='pistol'||
      (shot.playerId===this.localId&&this.viewWeaponKey?.startsWith('pistol:'));
    if (character) { character.recoil = shot.pellets?Math.min(0.4,(character.recoil||0)+0.22):pistolShot?0.18:0.13;character.shotAt=this.renderTime;
      if(shot.pellets)triggerShotgunChamber(character.weapon,shot.shotgunBarrel,this.renderTime);
      triggerHeavyWeaponSkin(character.weapon,this.renderTime);
      this.triggerWeaponFlash(character.muzzleFlash,character,shot); }
    if (shot.playerId === this.localId) { this.weaponRecoil = shot.pellets?Math.min(0.36,(this.weaponRecoil||0)+0.2):pistolShot?0.16:0.1;this.viewShotAt=this.renderTime;
      if(shot.pellets)triggerShotgunChamber(this.viewWeapon,shot.shotgunBarrel,this.renderTime);
      triggerHeavyWeaponSkin(this.viewWeapon,this.renderTime);
      this.triggerWeaponFlash(this.viewMuzzleFlash,this.viewMuzzleState,shot); }
  }

  setMissionState(state) {
    this.strikeMissionState=state||null;
    this.strikeEnvironment?.userData?.setMissionState?.(state);
    const nested=state?.wardenAttack??state?.bossAttack??state?.bossState?.wardenAttack??state?.bossState?.attack;
    if(nested)this.setWardenAttack({...nested,id:nested.id??state?.bossId??state?.bossState?.id});
    if(state?.bossDefeated||state?.bossState?.defeated) {
      const id=state?.bossId??state?.bossState?.id;if(id!=null)this.wardenAttacks.delete(id);
    }
  }

  updateStrikeWorldWaypoint(viewed) {
    const marker=this.ui.strikeWaypoint,target=this.strikeMissionState?.objectiveBeacon;
    const active=marker&&viewed&&target&&this.strikeMissionState?.phase!=='complete'&&
      (this.mapConfig.mode==='strike'||this.mapConfig.activity==='strike');
    marker?.classList.toggle('hidden',!active);
    if(!active)return;
    const targetHeight=Number(target.height??target.bottom??0)+2.7;
    const targetWorld=world(target.x,target.y,targetHeight,this.temp.waypointWorld||=
      new THREE.Vector3());
    const cameraSpace=(this.temp.waypointCamera||=new THREE.Vector3()).copy(targetWorld)
      .applyMatrix4(this.camera.matrixWorldInverse);
    const projected=this.temp.projected.copy(targetWorld).project(this.camera);
    let nx=projected.x,ny=projected.y;
    if(!Number.isFinite(nx)||!Number.isFinite(ny)){nx=0;ny=.72;}
    const behind=cameraSpace.z>=-.05;
    if(behind){nx=-nx;ny=-ny;if(Math.abs(nx)+Math.abs(ny)<.05)ny=.8;}
    const limitX=.78,limitY=.72;
    const offscreen=behind||Math.abs(nx)>limitX||Math.abs(ny)>limitY||projected.z<-1||projected.z>1;
    if(offscreen) {
      const scale=Math.min(limitX/Math.max(.001,Math.abs(nx)),limitY/Math.max(.001,Math.abs(ny)));
      nx*=scale;ny*=scale;
    }
    const x=(nx*.5+.5)*this.canvas.clientWidth,y=(-ny*.5+.5)*this.canvas.clientHeight;
    marker.style.transform=`translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) translate(-50%,-50%)`;
    marker.classList.toggle('offscreen',offscreen);
    if(offscreen) {
      const angle=Math.atan2(-ny,nx)*180/Math.PI+45;
      marker.style.setProperty('--waypoint-angle',`${angle.toFixed(1)}deg`);
    }
    const dx=(target.x-viewed.x)*SCALE,dz=(target.y-viewed.y)*SCALE,
      dy=Number(target.height??0)-(viewed.height||0),distance=Math.hypot(dx,dz,dy);
    const label=this.ui.strikeWaypointLabel,readout=this.ui.strikeWaypointDistance;
    const labelText=String(target.label||this.strikeMissionState.objective||'OBJECTIVE').toUpperCase();
    const distanceText=`${distance>=10?Math.round(distance):distance.toFixed(1)} m${dy>1.5?' ▲':dy< -1.5?' ▼':''}`;
    if(label?.textContent!==labelText)label.textContent=labelText;
    if(readout?.textContent!==distanceText)readout.textContent=distanceText;
  }

  setWardenAttack(event) {
    const attack=event?.wardenAttack??event?.bossAttack??event?.attack??event;
    const id=attack?.id??attack?.bossId??event?.id??event?.bossId??this.strikeMissionState?.bossId;
    if(id==null||!attack)return;
    const state=String(attack.state??attack.attackPhase??attack.phase??'').toLowerCase();
    const transition=String(attack.event??'').toLowerCase();
    if(attack.active===false||attack.cancelled||attack.complete||WARDEN_FINISHED_STATES.has(state)||
      transition==='end'||transition==='cancel') {
      this.wardenAttacks.delete(id);return;
    }
    this.wardenAttacks.set(id,{...attack,id,phase:attack.attackPhase??attack.phase,
      localReceivedAt:performance.now()/1000});
  }

  animateElevator(state, now) {
    if(!this.elevatorModel)return;
    const sample=elevatorSample(state,now);
    this.liftRise=sample.rise;
    const rideT=Math.max(0,Math.min(1,(now-state.startedAt-LIFT_TIMING.close)/LIFT_TIMING.travel));
    this.liftSway=state.phase==='riding'?0.018*Math.sin(2*Math.PI*rideT)*Math.sin(Math.PI*rideT):0;
    const exitSample=this.arrivalModel ? state.phase==='ready'?
      elevatorSample({phase:'opening',startedAt:state.startedAt},now):state.phase==='riding'?sample:{door:0,rise:0}:sample;
    const previousPose=this.elevatorPose;
    if(!previousPose||Math.abs(previousPose.door-sample.door)>1e-4||Math.abs(previousPose.rise-sample.rise)>1e-4||
      Math.abs(previousPose.exitDoor-exitSample.door)>1e-4||Math.abs(previousPose.exitRise-exitSample.rise)>1e-4){
      this.elevatorPose={door:sample.door,rise:sample.rise,exitDoor:exitSample.door,exitRise:exitSample.rise};this.shadowDirty=true;
    }
    poseElevator(this.elevatorModel,exitSample);
    if(this.arrivalModel) {
      poseElevator(this.arrivalModel,state.phase==='opening'?sample:{door:1,rise:0});
      elevatorDisplay(this.arrivalModel,`IN ${state.floor}`);
    }
    // Blend actors to a fixed overhead fill while doors close, and reverse it
    // as they open. At transfer both cabins have exactly the same light state.
    const cabinFill=['riding','opening'].includes(state.phase)?1-sample.door:0;
    const pve=this.mapConfig.mode==='pve';
    const palette=this.mapConfig.palette||{};
    if(this.elevatorCabinFill!==cabinFill) {
      this.elevatorCabinFill=cabinFill;
      this.ambient.intensity=(palette.ambientIntensity??(pve?1.9:3.2))*(1-cabinFill)+3*cabinFill;
      this.sun.intensity=(palette.sunIntensity??(pve?1.5:3.5))*(1-cabinFill);
      this.rim.intensity=(palette.rimIntensity??(pve?.65:2))*(1-cabinFill);
      for(const light of this.areaLightObjects||[])light.intensity=light.userData.roomIntensity*(1-cabinFill);
    }
    elevatorDisplay(this.elevatorModel,state.phase==='riding'?`↑ ${state.floor+1}`:state.phase==='ready'?'EXIT':'LOCK');
    // A closed cabin is an intentional loading boundary. Hide the old floor
    // during the ride so its ceiling cannot pass through the passenger cabin.
    const stageVisible=state.phase!=='riding'||sample.door>0;
    if(this.stageRideVisible!==stageVisible) {
      this.stageRideVisible=stageVisible;
      const characterGroups=new Set([...this.characters.values()].map(c=>c.group));
      for(const child of this.stage.children) {
        if(child===this.elevatorModel)continue;
        if(!characterGroups.has(child))child.visible=stageVisible;
      }
    }
  }

  render(players, localId, dt, pitch = 0) {
    this.renderTime+=dt;this.shadowElapsed+=dt;
    // Ten shadow updates per second remain visually smooth while halving the
    // most expensive multi-pass work.
    if(this.shadowElapsed>=0.1){
      if(this.shadowDirty){
        this.sun.shadow.needsUpdate=true;
        for(const light of this.areaLightObjects||[])if(light.castShadow)light.shadow.needsUpdate=true;
        this.renderer.shadowMap.needsUpdate=true;this.shadowDirty=false;
      }
      this.shadowElapsed%=0.1;
    }
    for(const {solid,model} of this.cargoModels||[]) {
      const previousY=model.position.y;
      if(solid.kind==='lift')poseCargoLift(model,solid.top);
      else model.position.y=solid.bottom;
      if(Math.abs(model.position.y-previousY)>1e-5)this.shadowDirty=true;
      const index=this.reflectionSolids.indexOf(solid);
      if(index>=0&&index<64){this.floor.uniforms.wallMax.value[index].y=solid.top;this.floor.uniforms.wallMin.value[index].y=solid.bottom||0;}
    }
    for(const model of this.animatedTerrain||[])model.userData.update?.(this.renderTime);
    this.localId = localId;
    const local = players.find(p => p.id === localId);
    const viewed = local?.alive ? local : players.find(p => p.alive);
    this.strikeEnvironment?.userData?.update?.(this.renderTime,viewed,this.scene);
    const strikeLighting=this.strikeEnvironment?.userData?.getLighting?.();
    if(strikeLighting&&Number.isFinite(strikeLighting.ambient)) {
      // Districts retain their warm/cool contrast, but never fall back to the
      // near-black baseline that made routes and floor edges unreadable.
      const target=Math.max(1.35,strikeLighting.ambient);
      this.ambient.intensity+=(target-this.ambient.intensity)*(1-Math.exp(-3.2*dt));
    }
    if (viewed) {
      const viewPitch = viewed.id === localId ? pitch : 0;
      const foot=viewed.height||0;
      // Ease the view over small stair risers; jumps and large corrections stay immediate.
      this.viewFootHeight=this.viewedId===viewed.id&&viewed.jumpStartedAt==null&&this.viewFootHeight!=null&&Math.abs(foot-this.viewFootHeight)<0.35?
        this.viewFootHeight+(foot-this.viewFootHeight)*(1-Math.exp(-24*dt)):foot;
      this.viewedId=viewed.id;
      this.camera.position.copy(world(viewed.x, viewed.y, 1.84 + this.viewFootHeight + (this.liftRise || 0) + (this.liftSway || 0),this.temp.cameraLook));
      this.temp.cameraLook.set(Math.cos(viewed.angle)*Math.cos(viewPitch),Math.sin(viewPitch),Math.sin(viewed.angle)*Math.cos(viewPitch)).add(this.camera.position);
      this.camera.lookAt(this.temp.cameraLook);
      this.deathShake*=Math.exp(-9*dt);
      this.camera.position.y+=Math.sin(this.renderTime*65)*this.deathShake;
      this.camera.updateMatrixWorld();
    }
    this.updateStrikeWorldWaypoint(viewed);
    const localMaxHealth=local?.maxHealth??101;
    const localHealth = local?.alive ? Math.max(0, Math.min(localMaxHealth, local.health ?? localMaxHealth)) : 0;
    const localShielded=this.mapConfig.mode==='pvp'&&local?.alive&&
      Number.isFinite(local.spawnShieldEndsAt)&&performance.now()<local.spawnShieldEndsAt;
    const healthText=local?.alive?`${Math.ceil(localHealth)} / ${localMaxHealth} HP`:`SPECTATING${viewed?' / '+viewed.name:''}`;
    if(this.ui.healthText.textContent!==healthText)this.ui.healthText.textContent=healthText;
    const healthBar=this.ui.healthBar;
    if(healthBar.hidden===!!local?.alive)healthBar.hidden=!local?.alive;
    const maxText=String(localMaxHealth),healthTextValue=String(localHealth);
    if(healthBar.getAttribute('aria-valuemax')!==maxText)healthBar.setAttribute('aria-valuemax',maxText);
    if(healthBar.getAttribute('aria-valuenow')!==healthTextValue)healthBar.setAttribute('aria-valuenow',healthTextValue);
    const healthFill=this.ui.healthFill;
    const localPercent=100*localHealth/localMaxHealth;
    const localWidth=`${localPercent}%`,localColor=localShielded?SPAWN_SHIELD_BLUE:
      localPercent<30?'#ff7878':localPercent<60?'#ffd48b':'#7bf0c4';
    healthBar.classList.toggle('spawn-shielded',localShielded);
    if(this.ui.healthWidth!==localWidth){this.ui.healthWidth=localWidth;healthFill.style.width=localWidth;}
    if(this.ui.healthColor!==localColor){this.ui.healthColor=localColor;healthFill.style.backgroundColor=localColor;}
    const crosshair=this.ui.crosshair,crosshairKey=local?.alive?local.weapon:'dead';
    if(this.crosshairKey!==crosshairKey){this.crosshairKey=crosshairKey;crosshair.hidden=!local?.alive;
      crosshair.classList.toggle('shotgun',!!local?.alive&&local.weapon==='shotgun');
      crosshair.classList.toggle('sniper',!!local?.alive&&local.weapon==='sniper');}
    this.activeIds.clear();for(const player of players)this.activeIds.add(player.id);
    for (const [id, c] of this.characters) if (!this.activeIds.has(id)) {
      this.stage.remove(c.group); this.clearObject(c.group); c.label.remove(); this.characters.delete(id);this.wardenAttacks.delete(id);
    }
    for (const player of players) {
      if(!player.alive){
        const stale=this.characters.get(player.id);
        if(stale){stale.group.visible=false;stale.label.hidden=true;}
        continue;
      }
      this.deadIds.delete(player.id);
      let c=this.characters.get(player.id);
      if(c&&(c.weaponKey!==player.weapon||c.weaponSkinKey!==player.weaponSkinKey)) {
        this.stage.remove(c.group);this.clearObject(c.group);c.label.remove();this.characters.delete(player.id);c=null;
      }
      c=c||this.createCharacter(player, localId);
      const shielded=this.mapConfig.mode==='pvp'&&Number.isFinite(player.spawnShieldEndsAt)&&
        performance.now()<player.spawnShieldEndsAt;
      if(c.spawnShieldOutline) {
        c.spawnShieldOutline.visible=shielded;
        if(shielded)c.spawnShieldOutline.userData.shieldMaterial.uniforms.opacity.value=
          .82+.1*Math.sin(this.renderTime*9);
      }
      if(c.shielded!==shielded){c.shielded=shielded;c.label.classList.toggle('spawn-shielded',shielded);}
      const currentHealth = player.health ?? player.maxHealth ?? 101;
      const previousFlash=c.damageFlash;
      c.damageFlash = currentHealth < c.health ? 0.22 : Math.max(0, c.damageFlash - dt);
      c.health = currentHealth;
      if(c.damageFlash>0||previousFlash>0)this.applyDamageFlash(c.flashMaterials,c.damageFlash);
      const materializing=poseStrikeSpawnArrival(c,performance.now());
      updateMuzzleFlash(c.muzzleFlash, dt);
      if(player.weapon==='shotgun')poseShotgun(c.weapon,this.renderTime-(c.shotAt??-10),this.renderTime);
      poseHeavyWeaponSkin(c.weapon,this.renderTime);
      c.group.visible = !!player.alive && player.id !== viewed?.id;
      if (!player.alive) continue;
      const motion=updateCharacterMotion(c,player,dt);
      c.legs.forEach((leg,i)=>{leg.rotation.x=motion.stride*(i?-1:1)*(c.ogreModel?0.7:1);});
      c.arms.forEach((arm,i)=>{arm.rotation.x=motion.stride*(i?1:-1)*(c.ogreModel?0.35:0.12);});
      const physicalBase=(player.height||0)+(player.hoverOffset||0)+(!player.isBot?(this.liftRise||0):0);
      const elevation=physicalBase+(c.guardianModel?(player.bodyHeight||2.6)/2:0);
      const characterPosition=world(c.x,c.y,elevation+motion.bob,this.temp.character),characterRotation=-c.angle-Math.PI/2;
      if(c.group.position.distanceToSquared(characterPosition)>1e-7||Math.abs(c.group.rotation.y-characterRotation)>1e-5||
        c.ogreModel&&player.ogreAttack||c.guardianModel||c.recoil>0)this.shadowDirty=true;
      c.group.position.copy(characterPosition);c.group.rotation.y=characterRotation;
      c.group.rotation.z=motion.sway;
      if(c.ogreModel)poseOgre(c.ogreModel,player.ogreAttack,world);
      if(c.guardianModel)poseGuardian(c.guardianModel,player.guardianAttack,this.renderTime+Number(player.id.replace(/\D/g,''))*.37);
      if(c.dreadTelegraph) {
        const attack=player.dreadAttack,target=attack&&players.find(p=>p.id===attack.targetId&&p.alive);
        c.dreadTelegraph.visible=!!target&&attack.phase==='charge';
        if(c.dreadTelegraph.visible) {
          c.group.updateMatrixWorld(true);
          const end=c.group.worldToLocal(world(target.x,target.y,(target.height||0)+1.25));
          const positions=c.dreadTelegraph.geometry.attributes.position;
          positions.setXYZ(0,.27,1.37,-1.72);positions.setXYZ(1,end.x,end.y,end.z);positions.needsUpdate=true;
          c.dreadTelegraph.material.opacity=.42+.38*Math.sin(this.renderTime*32)**2;
        }
        if(c.dreadCore) {
          const charge=attack?.phase==='charge'?(attack.progress||0):0;
          c.dreadCore.material.emissiveIntensity=(player.botRank==='captain'?2.8:1.9)+charge*3;
          c.dreadCore.scale.setScalar(1+charge*.25);
        }
      }
      if(c.wardenPresentation) {
        const bossState=this.strikeMissionState?.bossState||this.strikeMissionState?.wardenState;
        const matchesBoss=!this.strikeMissionState?.bossId||this.strikeMissionState.bossId===player.id||
          bossState?.id===player.id;
        const bossPhase=matchesBoss?(bossState?.combatPhase??bossState?.phase??
          this.strikeMissionState?.bossCombatPhase??this.strikeMissionState?.bossPhase):undefined;
        const phase=Math.max(1,Math.min(3,Number(player.wardenPhase??bossPhase??1)||1));
        const healthRatio=Math.max(0,Math.min(1,currentHealth/Math.max(1,player.maxHealth||
          this.strikeMissionState?.bossMaxHealth||currentHealth)));
        const attack=player.wardenAttack??this.wardenAttacks.get(player.id)??
          (matchesBoss?(bossState?.wardenAttack??bossState?.attack??this.strikeMissionState?.wardenAttack??
            this.strikeMissionState?.bossAttack):null);
        poseWardenPresentation(c.wardenPresentation,phase,attack,this.renderTime,healthRatio);
        if(c.dreadCore&&phase>=3) {
          const pulse=.5+.5*Math.sin(this.renderTime*11);
          c.dreadCore.material.emissiveIntensity=6.5+pulse*4.5;
          c.dreadCore.scale.setScalar(1.22+pulse*.18);
        }
      }
      c.recoil = Math.max(0, c.recoil - dt); c.weapon.position.z = c.recoil;
      const remoteSwap=Math.max(0,Math.min(1,(this.renderTime-c.weaponSwitchAt)/WEAPON_SWAP_SECONDS));
      c.weapon.position.y=-0.22*Math.sin(Math.PI*remoteSwap);
      c.weapon.rotation.x=0.25*Math.sin(Math.PI*remoteSwap);
      const anchor=world(c.x,c.y,(player.bodyHeight||2.2)+0.2+physicalBase+motion.bob,this.temp.anchor);
      const p=this.temp.projected.copy(anchor).project(this.camera);
      const direction=world(player.x,player.y,physicalBase+(player.bodyHeight||2.2)*.5,this.temp.direction).sub(this.camera.position);
      const inView=c.group.visible&&p.z>=-1&&p.z<=1&&Math.abs(p.x)<=1&&Math.abs(p.y)<=1;
      if(inView&&this.renderTime>=(c.nextLabelCheck||0)){
        const rayDistance=direction.length();
        this.raycaster.set(this.camera.position,direction.multiplyScalar(1/Math.max(.0001,rayDistance)));
        this.raycaster.far=rayDistance;
        c.labelOccluded=this.raycaster.intersectObjects(this.wallOccluders,false).length>0;
        c.nextLabelCheck=this.renderTime+0.12+(Number(player.id.replace(/\D/g,''))%4||0)*0.01;
      }
      if(!inView)c.nextLabelCheck=0;
      const labelHidden=materializing||!inView||c.labelOccluded;
      syncCharacterLabelVisibility(c,labelHidden);
      if(!labelHidden) {
        const labelX=(p.x*.5+.5)*this.canvas.clientWidth,labelY=(-p.y*.5+.5)*this.canvas.clientHeight;
        if(Math.abs(labelX-(c.labelX??Infinity))>.2||Math.abs(labelY-(c.labelY??Infinity))>.2){
          c.labelX=labelX;c.labelY=labelY;c.label.style.transform=`translate3d(${labelX}px,${labelY}px,0) translate(-50%,-100%)`;
        }
      }
      const health = Math.max(0, player.health ?? player.maxHealth ?? 101), percent=100*health/(player.maxHealth||101);
      const value=String(Math.ceil(health)),width=`${Math.min(100,percent)}%`;
      const color=shielded?SPAWN_SHIELD_BLUE:player.botType==='guardian'?'#a950ef':player.botType==='warden'?'#ffb02e':
        player.botType==='dread'?'#ef3048':percent<30?'#ff7878':percent<60?'#ffd48b':'#7bf0c4';
      if(c.labelValue!==value){c.labelValue=value;c.value.textContent=value;}
      if(c.fillWidth!==width){c.fillWidth=width;c.fill.style.width=width;}
      if(c.fillColor!==color){c.fillColor=color;c.fill.style.background=color;}
    }
    this.updateDeathEffects(dt);
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const fx = this.effects[i]; fx.time -= dt;
      if (fx.time <= 0) {
        if(fx.tracer)this.releaseTracer(fx.tracer);
        else {this.stage.remove(fx.group);this.clearObject(fx.group);}
        this.effects.splice(i, 1);
      }
      else if(fx.explosion)poseGrenadeExplosion(fx.group,fx.duration-fx.time,this.camera.quaternion);
      else if(fx.guardianExplosion)poseGuardianExplosion(fx.group,fx.duration-fx.time);
      else fx.group.children.forEach(child => {
        child.material.opacity = fx.time / (fx.duration||.11);
      });
    }
    for(const item of this.grenades.values()) {
      poseGrenadeFuse(item.body.material,item.fuseDeadline-performance.now());
      item.group.position.lerp(item.target,1-Math.exp(-35*dt));
      if(item.moving){item.group.rotation.x+=dt*7;item.group.rotation.z+=dt*4;}
    }
    for(const item of this.guardianProjectiles.values()) {
      item.model.group.position.lerp(item.target,1-Math.exp(-30*dt));item.phase+=dt;
      item.model.group.rotation.x+=dt*5;item.model.group.rotation.y+=dt*8;
      const pulse=1+Math.sin(item.phase*18)*.12;item.model.halo.scale.setScalar(pulse);
    }
    this.drawMinimap(local); this.renderer.render(this.scene, this.camera);
    if (local?.alive) {
      this.buildViewWeapon(local);
      if(local.weapon==='shotgun')poseShotgun(this.viewWeapon,this.renderTime-(this.viewShotAt??-10),this.renderTime);
      updateMuzzleFlash(this.viewMuzzleFlash, dt);
      const viewFlash=this.characters.get(localId)?.damageFlash||0;
      if(viewFlash>0||this.viewDamageFlash>0)this.applyDamageFlash(this.viewFlashMaterials,viewFlash);
      this.viewDamageFlash=viewFlash;
      // Damage flashing restores every captured material to its base emissive
      // value, so animated skin lighting must be applied after that reset.
      poseHeavyWeaponSkin(this.viewWeapon,this.renderTime);
      this.weaponRecoil = Math.max(0, this.weaponRecoil - dt);
      const switchAt=this.weaponSwitchTimes?.get(localId)??-Infinity;
      const swap=Math.max(0,Math.min(1,(this.renderTime-switchAt)/WEAPON_SWAP_SECONDS));
      const swapArc=Math.sin(Math.PI*swap);
      this.viewWeapon.position.y=-0.42*swapArc;
      this.viewWeapon.position.z = this.weaponRecoil * 0.6+0.12*swapArc;
      this.viewWeapon.rotation.x = this.weaponRecoil * 0.4;
      this.viewWeapon.rotation.z=0.28*swapArc;
      this.renderer.autoClear = false;
      this.renderer.clearDepth();
      this.renderer.render(this.viewScene, this.viewCamera);
      this.renderer.autoClear = true;
    }
  }

  drawStrikeMinimap(player) {
    const ctx=this.map,width=180,height=120,sectors=this.mapConfig.strikeSectors||[],foot=player?.height||0;
    const candidates=sectors.filter(sector=>{const b=sector.bounds||sector;
      return player&&player.x>=b.x&&player.x<=b.x+b.width&&player.y>=b.y&&player.y<=b.y+b.height&&
        foot>=(b.bottom??-Infinity)-.45&&foot<=(b.top??Infinity)+.45;});
    // Inclines legitimately sit between a sector's nominal floor bands. Rank
    // every 2D-containing sector by vertical distance instead of falling all
    // the way back to Freight while the player is halfway up a stair.
    const sector=candidates.sort((a,b)=>{
      const score=sector=>{const bounds=sector.bounds||sector,min=sector.floorMin??bounds.bottom??-Infinity,
        max=sector.floorMax??bounds.top??Infinity,vertical=foot<min?min-foot:foot>max?foot-max:0;
        return vertical*1e6+bounds.width*bounds.height;};
      return score(a)-score(b);
    })[0]||sectors.find(sector=>sector.id===this.minimapCache?.sectorId)||sectors[0];
    if(!sector){ctx.clearRect(0,0,width,height);return;}
    const bounds=sector.bounds||sector,pad=24,minX=bounds.x-pad,minY=bounds.y-pad,
      spanX=bounds.width+pad*2,spanY=bounds.height+pad*2;
    const scale=Math.min((width-8)/spanX,(height-8)/spanY),ox=(width-spanX*scale)/2-minX*scale,
      oy=(height-spanY*scale)/2-minY*scale;
    const assigned=solid=>{const id=solid.strikeSector??solid.sectorId;
      return id==null||Array.isArray(id)?id==null||id.includes(sector.id):id===sector.id;};
    const levelVisible=solid=>{
      const bottom=solid.bottom??0,top=solid.top??3.1;
      if(solid.walkable||solid.platform||solid.kind==='ramp')return assigned(solid)&&foot>=bottom-1.1&&foot<=top+1.1;
      return bottom<foot+2.05&&top>foot+.1;
    };
    const stateKey=`${sector.id}:${Math.round(foot*2)}:${(this.strikeMissionState?.openedIds||[]).join(',')}`;
    if(this.minimapCache?.key!==stateKey) {
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
      const base=canvas.getContext('2d');base.fillStyle='#100c11';base.fillRect(0,0,width,height);
      base.save();base.translate(ox,oy);
      for(const solid of this.mapConfig.terrain||[])if(!solid.nonPlayable&&levelVisible(solid)) {
        base.fillStyle=solid.kind==='ramp'?'#86644c':solid.kind==='lift'?'#c54c4e':'#3b3b40';
        base.fillRect(solid.x*scale,solid.y*scale,Math.max(1.2,solid.width*scale),Math.max(1.2,solid.height*scale));
      }
      for(const solid of this.walls||[])if(!solid.nonSolid&&levelVisible(solid)) {
        base.fillStyle=solid.kind==='strikeDoor'?'#d35358':'#7f343d';
        base.fillRect(solid.x*scale,solid.y*scale,Math.max(1,solid.width*scale),Math.max(1,solid.height*scale));
      }
      base.restore();this.minimapCache={key:stateKey,canvas,sx:scale,sy:scale,ox,oy,sectorId:sector.id};
    }
    const cache=this.minimapCache;ctx.clearRect(0,0,width,height);ctx.drawImage(cache.canvas,0,0);
    const encounter=(this.mapConfig.strikeEncounters||this.mapConfig.encounters||[])[this.strikeMissionState?.encounterIndex||0];
    const target=this.strikeMissionState?.objectiveBeacon||
      (this.strikeMissionState?.phase==='objective'?(encounter?.objectiveTrigger||encounter?.interaction?.trigger):
        encounter?.objectivePoint||encounter?.trigger);
    const activeGuides=new Set(this.strikeMissionState?.activeRouteGuideIds||[]);
    if(activeGuides.size) {
      ctx.save();ctx.fillStyle='#ff565d';ctx.globalAlpha=.72;
      for(const guide of this.mapConfig.routeGuides||[])if(activeGuides.has(guide.id)) {
        const gx=guide.x*cache.sx+cache.ox,gy=guide.y*cache.sy+cache.oy;
        if(gx<3||gx>width-3||gy<3||gy>height-3)continue;
        ctx.save();ctx.translate(gx,gy);ctx.rotate(guide.angle||0);
        ctx.beginPath();ctx.moveTo(3,0);ctx.lineTo(-2.5,-2);ctx.lineTo(-1,0);ctx.lineTo(-2.5,2);
        ctx.closePath();ctx.fill();ctx.restore();
      }
      ctx.restore();
    }
    if(target) {
      const tx=(target.x+(target.width||0)/2)*cache.sx+cache.ox,
        ty=(target.y+(target.width?target.height||0:0)/2)*cache.sy+cache.oy;
      const inset=7,cx=Math.max(inset,Math.min(width-inset,tx)),cy=Math.max(inset,Math.min(height-inset,ty));
      const offscreen=Math.abs(cx-tx)>.01||Math.abs(cy-ty)>.01;
      ctx.save();ctx.translate(cx,cy);
      if(offscreen) {
        const angle=Math.atan2(ty-cy,tx-cx);ctx.rotate(angle);ctx.fillStyle='#ff6a62';
        ctx.beginPath();ctx.moveTo(6,0);ctx.lineTo(-4,-4);ctx.lineTo(-2,0);ctx.lineTo(-4,4);ctx.closePath();ctx.fill();
      } else {
        ctx.rotate(Math.PI/4);ctx.strokeStyle='#ff8b72';ctx.lineWidth=2;
        ctx.strokeRect(-4,-4,8,8);
      }
      ctx.restore();
    }
    if(!player)return;
    ctx.save();ctx.translate(cache.ox+player.x*cache.sx,cache.oy+player.y*cache.sy);ctx.rotate(player.angle);
    ctx.fillStyle=player.alive?'#f2f1e8':'#92979a';ctx.beginPath();ctx.moveTo(5,0);ctx.lineTo(-3,-3);
    ctx.lineTo(-2,0);ctx.lineTo(-3,3);ctx.closePath();ctx.fill();ctx.restore();
  }

  drawMinimap(player) {
    if(this.mapConfig.mode==='strike'||this.mapConfig.activity==='strike')return this.drawStrikeMinimap(player);
    const ctx = this.map;
    if(!this.minimapCache) {
      const canvas=document.createElement('canvas');canvas.width=180;canvas.height=120;
      const base=canvas.getContext('2d');
      const bounds=this.mapConfig.worldBounds||{minX:0,minY:0,maxX:this.mapConfig.width,maxY:this.mapConfig.height};
      const worldWidth=bounds.maxX-bounds.minX,worldHeight=bounds.maxY-bounds.minY;
      const sx=Math.min(180/worldWidth,120/worldHeight),sy=sx;
      const ox=(180-worldWidth*sx)/2-bounds.minX*sx,oy=(120-worldHeight*sy)/2-bounds.minY*sy;
      base.fillStyle='#0b1a24';base.fillRect(0,0,180,120);
      base.save();base.translate(ox,oy);
      if(this.mapConfig.floorRects) {
        base.fillStyle='#263b43';
        for(const rect of this.mapConfig.floorRects)
          base.fillRect(rect.x*sx,rect.y*sy,rect.width*sx,rect.height*sy);
      }
      base.fillStyle='#55727e';
      for(const w of this.walls)base.fillRect(w.x*sx,w.y*sy,w.width*sx,w.height*sy);
      for(const c of this.mapConfig.cutouts||[]) {
        const left=c.x===12,top=c.y===12,x=left?0:c.x,y=top?0:c.y;
        const right=left?c.x+c.width:this.mapConfig.width,bottom=top?c.y+c.height:this.mapConfig.height;
        base.fillStyle='#02070b';base.fillRect(x*sx,y*sy,(right-x)*sx,(bottom-y)*sy);
        base.strokeStyle='#55727e';base.lineWidth=1;base.beginPath();
        const edgeX=left?right:x,edgeY=top?bottom:y;
        base.moveTo(edgeX*sx,(top?0:this.mapConfig.height)*sy);base.lineTo(edgeX*sx,edgeY*sy);
        base.lineTo((left?0:this.mapConfig.width)*sx,edgeY*sy);base.stroke();
      }
      for(const s of this.mapConfig.terrain) {
        if(s.kind==='heightfield'||s.collisionOnly)continue;
        base.fillStyle=s.kind==='lift'?'#f3c35d':s.kind==='ramp'?'#c3a974':
          (s.kind==='tree'||s.kind==='templeTree'||s.kind==='templeRoot')?'#60965e':
          s.kind==='templePool'?'#438b88':s.kind==='waterfall'?'#70bdb6':'#7b9498';
        base.fillRect(s.x*sx,s.y*sy,Math.max(2,s.width*sx),Math.max(2,s.height*sy));
      }
      for(const s of this.mapConfig.terrain.filter(s=>s.kind==='lift')) {
        base.fillStyle='#14252b';base.font='bold 9px sans-serif';base.fillText('L',s.x*sx+3,s.y*sy+9);
      }
      for(const e of [this.mapConfig.arrivalElevator,this.mapConfig.elevator].filter(Boolean)) {
        base.fillStyle='#f4d78c';base.fillRect(e.x*sx,e.y*sy,e.width*sx,e.height*sy);
        base.fillStyle='#14252b';base.font='bold 10px sans-serif';base.fillText(e===this.mapConfig.arrivalElevator?'A':'E',e.x*sx+4,e.y*sy+14);
      }
      base.restore();this.minimapCache={canvas,sx,sy,ox,oy};
    }
    const {canvas,sx,sy,ox,oy}=this.minimapCache;
    ctx.clearRect(0,0,180,120);ctx.drawImage(canvas,0,0);
    // Only one player enters this renderer; enemy locations cannot be drawn.
    if(!player)return;
    ctx.save();ctx.translate(ox+player.x*sx,oy+player.y*sy);ctx.rotate(player.angle);
    ctx.fillStyle = player.alive ? '#8affd9' : '#a1acb1';
    ctx.beginPath();ctx.moveTo(5,0);ctx.lineTo(-3,-3);ctx.lineTo(-2,0);ctx.lineTo(-3,3);ctx.closePath();ctx.fill();ctx.restore();
  }
}
