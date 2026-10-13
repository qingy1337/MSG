import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createMarioPipe } from './marioPipe.mjs';
import { createAutoRifle } from './autoRifle.mjs';
import { createPistol } from './pistol.mjs';
import {createShotgun,poseShotgun,shotgunMuzzleStyle,shotgunPelletColor} from './shotgun.mjs';
import {poseGrenadeFuse} from './grenadeFuse.mjs';
import {createGrenadeExplosion,poseGrenadeExplosion,EXPLOSION_DURATION} from './grenadeExplosion.mjs';
import { createHeavyWeapon, heavyWeaponMuzzleDepth, heavyWeaponViewScale, heavyWeaponViewYOffset, heavyWeaponViewZ } from './heavyWeapons.mjs';
import { createMuzzleFlash, muzzleFlashScaleForWeapon, triggerMuzzleFlash, updateMuzzleFlash } from './muzzleFlash.mjs';
import { createTerrainModel, poseCargoLift } from './pveEnvironment.mjs';
import { createElevatorModel, poseElevator, elevatorDisplay } from './elevator.mjs';
import { updateCharacterMotion } from './characterMotion.mjs';
import { createOgreModel, poseOgre } from './ogre.mjs';
import {MAX_CORPSES,MAX_REMAINS,createCorpse,poseCorpse,createDeathRemains,poseDeathRemains,createGrenadePickup} from './deathEffects.mjs';
import { FrameBudget } from './frameBudget.mjs';
import { planAreaLighting, createAreaLighting } from './areaLighting.mjs';
import { planAmbientZones, ambientZoneGLSL, ambientZoneUniforms, applyAmbientZones } from './ambientZones.mjs';
import {shotgunReticleDiameter} from './shotgunCrosshair.mjs';

const SCALE = 0.05;
const WALL_HEIGHT = 3.1;
const WEAPON_SWAP_SECONDS = 0.36;
const DAMAGE_FLASH_COLOR = new THREE.Color('#ff3030');
const world = (x, y, height = 0) => new THREE.Vector3((x - 450) * SCALE, height, (y - 300) * SCALE);

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

// One reflection bounce against wall volumes per floor pixel. The reflection
// proxies preserve collision footprints; bevels and characters are rasterized.
function floorMaterial(walls, areas = [], pve = false, zoneUniforms, palette = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...zoneUniforms,
      wallCount: { value: Math.min(64, walls.length) },
      wallMin: { value: Array.from({ length: 64 }, (_, i) => walls[i] ? world(walls[i].x, walls[i].y,walls[i].bottom||0) : new THREE.Vector3()) },
      wallMax: { value: Array.from({ length: 64 }, (_, i) => walls[i] ? world(walls[i].x + walls[i].width, walls[i].y + walls[i].height, walls[i].top ?? WALL_HEIGHT) : new THREE.Vector3()) },
      reflections: { value: true },
      areaCount: {value:areas.length},
      areaPosition: {value:Array.from({length:6},(_,i)=>areas[i]?world(areas[i].x,areas[i].y,areas[i].sourceHeight):new THREE.Vector3())},
      areaColor: {value:Array.from({length:6},(_,i)=>new THREE.Color(areas[i]?.color||'#000000'))},
      areaRadius: {value:Array.from({length:6},(_,i)=>areas[i]?.radius||1)},
      ambientFloor: {value:pve?0.83:1},
      floorLow:{value:new THREE.Color(palette.floorLow||'#303f47')},
      floorHigh:{value:new THREE.Color(palette.floorHigh||'#4d6166')},
      reflectionBase:{value:new THREE.Color(palette.reflection||'#526b73')},
      reflectionGlow:{value:new THREE.Color(palette.reflectionGlow||'#2ed9e3')},
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
      uniform vec3 floorLow; uniform vec3 floorHigh; uniform vec3 reflectionBase; uniform vec3 reflectionGlow;
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
        float shadow = 1.0;
        vec3 lightDir = normalize(vec3(-0.5,1.0,-0.35));
        for (int i=0; i<64; i++) { if(i>=wallCount) break;
          if(traceBox(point+vec3(0.0,0.02,0.0), lightDir, wallMin[i],wallMax[i])<1000.0) shadow=0.72;
        }
        base *= shadow * ambientFloor * ambientAt(point.xz);
        for(int a=0;a<6;a++) {
          if(a>=areaCount)break;
          float pool=1.0-smoothstep(areaRadius[a]*0.2,areaRadius[a],distance(point.xz,areaPosition[a].xz));
          if(pool>0.01) {
            vec3 delta=areaPosition[a]-point;float reach=length(delta);bool blocked=false;
            for(int i=0;i<64;i++) {if(i>=wallCount)break;
              if(traceBox(point+vec3(0.,0.03,0.),normalize(delta),wallMin[i],wallMax[i])<reach){blocked=true;break;}
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
            base=mix(base,reflected,fresnel*exp(-nearest*0.08));
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
    this.camera = new THREE.PerspectiveCamera(68, 1, 0.04, 180);
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
    this.scene.add(sun);
    this.scene.add(sun.target);
    const rim = new THREE.DirectionalLight(0x48baff, 2);
    this.rim=rim;
    rim.position.set(20, 12, 15);
    this.scene.add(rim);
    this.stage = new THREE.Group(); this.scene.add(this.stage);
    this.characters = new Map(); this.effects = [];
    this.grenades=new Map();
    this.corpses=[];this.remains=[];this.pickups=new Map();this.deadIds=new Set();this.deathShake=0;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.layers.set(1);
    this.labels = document.getElementById('health-labels');
    this.map = document.getElementById('minimap').getContext('2d');
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

  box(parent, w, h, d, x, y, z, material, radius = 0.08) {
    const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(radius, w / 3, h / 3, d / 3)), material);
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
    this.clearObject(this.stage); this.characters.clear(); this.effects = [];
    this.grenades.clear();
    this.corpses=[];this.remains=[];this.pickups.clear();this.deadIds.clear();this.deathShake=0;
    this.clearObject(this.viewWeapon); this.viewWeaponKey = null; this.weaponRecoil = 0;this.weaponSwitchTimes.clear();
    this.viewMuzzleFlash = null;
    this.wallOccluders = [];
    this.labels.replaceChildren(); this.walls = walls;
    this.mapConfig = map;
    this.minimapCache=null;
    const pve=map.mode==='pve',areas=planAreaLighting(map,walls);
    const palette=map.palette||{};
    this.zoneUniforms=ambientZoneUniforms(planAmbientZones(map));
    this.scene.background.set(palette.sky||'#9ebbc9');
    this.ambient.color.set(palette.ambient||'#e3f3ff');
    this.ambient.groundColor.set(palette.ground||'#73878b');
    this.sun.color.set(palette.sun||'#ffe7c4');
    this.rim.color.set(palette.rim||palette.glow||'#48baff');
    this.ambient.intensity=pve?1.9:3.2;
    this.sun.intensity=pve?1.5:3.5;
    this.rim.intensity=pve?0.65:2;
    this.cargoModels=[];
    this.liftRise=0;this.liftSway=0;this.elevatorModel=null;this.arrivalModel=null;
    const width = map.width*SCALE, depth = map.height*SCALE;
    const center = world(map.width/2,map.height/2);
    this.sun.target.position.copy(center);
    this.sun.position.copy(center).add(new THREE.Vector3(-30,55,-25));
    const extent = Math.max(width,depth)*0.7;
    Object.assign(this.sun.shadow.camera,{left:-extent,right:extent,top:extent,bottom:-extent,far:180});
    this.sun.shadow.camera.updateProjectionMatrix();
    this.reflectionSolids=[...walls,...map.terrain.filter(s => s.kind !== 'ramp' && s.kind !== 'tree' && s.kind !== 'exitDoor')];
    this.floor = floorMaterial(this.reflectionSolids,areas,pve,this.zoneUniforms,palette);
    this.viewFootHeight=null;
    this.floor.uniforms.reflections.value = document.getElementById('raytracing-toggle').checked;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), this.floor);
    floor.position.copy(center);
    floor.rotation.x = -Math.PI / 2; this.stage.add(floor);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), new THREE.ShadowMaterial({ opacity: 0.20 }));
    shadow.position.copy(center);
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.008; shadow.receiveShadow = true; this.stage.add(shadow);
    const dark = this.material(palette.wall||'#526d79', 0.5);
    const panel = this.material(palette.panel||'#9db5b8', 0.35, 0.32);
    const cap = this.material(palette.cap||'#bdd0cf', 0.5, 0.3);
    const glowColor=palette.glow||'#69e8df';
    const glow = new THREE.MeshStandardMaterial({ color: glowColor, emissive: glowColor, emissiveIntensity: 1.5 });
    this.box(this.stage, width+0.5, 0.45, depth+0.5, center.x, -0.26, center.z, dark, 0.15);
    const wallGeometry={body:[],cap:[],panel:[],glow:[]};
    for (const wall of walls) {
      if(wall.kind==='cabin') continue;
      const wallCenter=world(wall.x+wall.width/2,wall.y+wall.height/2);
      const w = wall.width * SCALE, d = wall.height * SCALE;
      const wallHeight=wall.top ?? WALL_HEIGHT;
      wallGeometry.body.push(roundedGeometry(w,wallHeight,d,wallCenter.x,wallHeight/2,wallCenter.z,0.15));
      wallGeometry.cap.push(roundedGeometry(w-0.06,0.24,d-0.06,wallCenter.x,0.18,wallCenter.z));
      wallGeometry.cap.push(roundedGeometry(w-0.02,0.22,d-0.02,wallCenter.x,wallHeight-0.12,wallCenter.z));
      const horizontal = w > d, length = horizontal ? w : d;
      const count = Math.max(1, Math.floor(length / 1.7));
      for (let i = 0; i < count; i++) {
        const along = (i + 0.5) * length / count - length / 2;
        for (const sign of [-1, 1]) {
          // Keep the entire 0.10-deep panel outside the wall, including its
          // rounded edges. The old inset left only 0.005 protruding, so the
          // bevels intersected the wall face and flickered as the view moved.
          const face = sign * ((horizontal ? d : w) / 2 + 0.06);
          wallGeometry.panel.push(roundedGeometry(horizontal ? length / count - 0.12 : 0.10, wallHeight - 1,
            horizontal ? 0.10 : length / count - 0.12,
            wallCenter.x+(horizontal ? along : face),wallHeight/2,
            wallCenter.z+(horizontal ? face : along),0.045));
        }
      }
      // Surface-mounted light strips remain visible outside the wall body.
      for (const sign of [-1, 1]) {
        wallGeometry.glow.push(roundedGeometry(horizontal ? w - 0.22 : 0.018, 0.055,
          horizontal ? 0.018 : d - 0.22,
          wallCenter.x+(horizontal ? 0 : sign*w/2),wallHeight-0.32,
          wallCenter.z+(horizontal ? sign*d/2 : 0),0.005));
      }
    }
    const wallBody=mergedMesh(wallGeometry.body,dark,{castShadow:true});
    const wallCaps=mergedMesh(wallGeometry.cap,cap);
    const wallPanels=mergedMesh(wallGeometry.panel,panel);
    const wallGlow=mergedMesh(wallGeometry.glow,glow,{receiveShadow:false});
    for(const mesh of [wallBody,wallCaps,wallPanels,wallGlow])if(mesh)this.stage.add(mesh);
    if(wallBody){wallBody.layers.enable(1);this.wallOccluders.push(wallBody);}
    const terrainBatches=new Map();
    const occluderMaterial=new THREE.MeshBasicMaterial({colorWrite:false,depthWrite:false});
    for (const solid of map.terrain) {
      if(solid.kind==='exitDoor')continue;
      const model = createTerrainModel(solid);
      const position=world(solid.x,solid.y,solid.kind==='rail'?0:solid.bottom||0);
      if(solid.kind==='lift'||solid.liftId) {
        model.position.copy(position);this.stage.add(model);this.cargoModels.push({solid,model});
        model.traverse(mesh=>{if(mesh.isMesh){mesh.layers.enable(1);this.wallOccluders.push(mesh);}});
      } else {
        collectStaticModel(model,position,terrainBatches);
        if(solid.kind!=='tree') {
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
    if(map.ceiling) {
      const ceilingMat=this.material('#b5c7c6',0.12,0.8);
      this.box(this.stage,width,0.2,depth,center.x,map.ceiling+0.1,center.z,ceilingMat);
      // Broad emissive luminaires and inset beams; no costly per-fixture lights.
      for(let x=240;!pve&&x<map.width;x+=300) for(let y=180;y<map.height;y+=300) {
        const p=world(x,y,map.ceiling-0.08);
        const lamp=new THREE.MeshBasicMaterial({color:'#f6ffed'});
        this.box(this.stage,4,0.07,0.7,p.x,p.y,p.z,lamp);
      }
      for(let y=120;y<map.height;y+=360) {
        const p=world(map.width/2,y,map.ceiling-0.15);
        this.box(this.stage,width,0.3,0.22,p.x,p.y,p.z,panel);
      }
    }
    this.areaLights=createAreaLighting(areas,world);
    this.areaLights.traverse(o=>{if(o.isLight)o.userData.roomIntensity=o.intensity;});
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
    for (const z of [-depth/2, depth/2]) this.box(this.stage, width, 0.05, 0.08, center.x, 0.035, center.z+z, glow, 0.01);
    for (const x of [-width/2, width/2]) this.box(this.stage, 0.08, 0.05, depth, center.x+x, 0.035, center.z, glow, 0.01);
    if(pve)applyAmbientZones(this.stage,this.zoneUniforms);
    // Establish static matrixWorld values once. The renderer handles moving
    // actors; forcing the entire room dirty every frame was redundant.
    this.scene.updateMatrixWorld(true);
    this.renderer.shadowMap.needsUpdate=true;
    this.resize();
  }

  createCharacter(player, localId) {
    const group = new THREE.Group();
    const dread=player.botType==='dread',captain=dread&&player.botRank==='captain';
    const armor = this.material(dread?(captain?'#d52836':'#8e1724'):(player.color || '#59daca'), dread?0.7:0.45, dread?0.24:0.32);
    const undersuit = this.material(dread?'#17090d':'#182a35', dread?0.55:0.1, dread?0.42:0.65);
    const white = this.material(dread?'#382329':'#d9e4de', dread?0.72:0.4, dread?0.28:0.35);
    const visor = new THREE.MeshStandardMaterial({ color: dread?0x260408:0x122b35, metalness: 0.8, roughness: 0.12,
      emissive:dread?0xff102c:0x185c6a, emissiveIntensity:dread?(captain?2.5:1.7):0.5 });
    this.box(group, 0.72, 0.65, 0.52, 0, 1.19, 0, armor, 0.17);
    this.box(group, 0.42, 0.31, 0.10, 0, 1.27, -0.28, white);
    this.box(group, 0.46, 0.57, 0.25, 0, 1.18, 0.34, undersuit);
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 12), white);
    helmet.position.y = 1.84; helmet.scale.set(1, 1.08, 0.95); helmet.castShadow = true; group.add(helmet);
    this.box(group, 0.48, 0.18, 0.16, 0, 1.86, -0.255, visor, 0.07);
    const legs = [], arms=[];
    for (const side of [-1, 1]) {
      const leg = new THREE.Group(); leg.position.set(side * 0.22, 0.88, 0); group.add(leg);
      this.box(leg, 0.27, 0.64, 0.3, 0, -0.34, 0, undersuit);
      this.box(leg, 0.29, 0.23, 0.18, 0, -0.36, -0.12, armor);
      this.box(leg, 0.31, 0.19, 0.44, 0, -0.77, -0.07, white); legs.push(leg);
      const arm=new THREE.Group();arm.position.set(side*0.47,1.42,0);group.add(arm);arms.push(arm);
      this.box(arm, 0.25, 0.3, 0.33, 0, 0, 0, armor);
      this.box(arm, 0.20, 0.22, 0.57, -side*0.04, -0.2, -0.23, undersuit);
      this.box(arm, 0.18, 0.19, 0.18, -side*0.07, -0.2, -0.51, white);
    }
    let dreadCore=null,dreadTelegraph=null;
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
    }
    const weapon = new THREE.Group(); group.add(weapon);
    const skin = WEAPON_SKINS[player.weapon]?.find(s => s.key === player.weaponSkinKey);
    const marioPipe = player.weapon === 'sniper' && skin?.key === 'sniper_mario';
    const length = ({ pistol: 0.6, autoRifle: 0.95, miniGun: 0.72, sniper: 1.35, shotgun: 1.05 })[player.weapon] || 0.6;
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
    } else if (player.weapon === 'miniGun' || ['sniper_calibrated','sniper_flatpack'].includes(skin?.key)) {
      const model = createHeavyWeapon(player.weapon, skin?.key, length); model.position.set(0.27, 1.34, -0.45); weapon.add(model);
    } else {
      const weaponMaterial = this.material(skin?.bulletColor || '#334653', 0.75, 0.22);
      this.box(weapon, 0.24, 0.23, length, 0.27, 1.34, -0.45 - length / 2, weaponMaterial, 0.04);
    }
    this.box(weapon, 0.13, 0.23, 0.16, 0.27, 1.18, -0.57, undersuit, 0.02);
    if (player.weapon === 'sniper' && !marioPipe && !['sniper_calibrated','sniper_flatpack'].includes(skin?.key)) this.box(weapon, 0.16, 0.15, 0.35, 0.27, 1.52, -0.85, visor, 0.05);
    if (player.id === localId) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.86, 0.91, 48), new THREE.MeshBasicMaterial({ color: 0x77ffda, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.025; group.add(ring);
    }
    let ogreModel=null;
    if(player.botType==='ogre') {
      this.clearObject(group);ogreModel=createOgreModel();group.add(ogreModel.group);
      legs.splice(0,legs.length,...ogreModel.legs);arms.splice(0,arms.length,...ogreModel.arms);
    }
    // A character can contain dozens of cosmetic meshes. Only the largest
    // silhouette pieces need to render into shadow maps.
    limitShadowCasters(group,player.botType==='ogre'?10:8);
    const label = document.createElement('div'); label.className = 'character-health';
    const name = document.createElement('span'); name.textContent = player.name;
    const value = document.createElement('strong');
    const bar = document.createElement('i'); const fill = document.createElement('b'); bar.append(fill);
    label.append(name, value, bar); this.labels.append(label); this.stage.add(group);
    if(this.mapConfig.mode==='pve')applyAmbientZones(group,this.zoneUniforms);
    const record = { group, legs, arms, weapon, ogreModel, dread, dreadCore, dreadTelegraph, label, value, fill, x: player.x, y: player.y, phase: 0, recoil: 0,
      weaponKey:player.weapon,weaponSwitchAt:this.weaponSwitchTimes?.get(player.id)??-Infinity,
      weaponSkinKey:skin?.key,muzzleBaseX:0.27,muzzleBarrelOffset:length*0.062,
      health: player.health ?? player.maxHealth ?? 101, damageFlash: 0, flashMaterials: this.captureFlashMaterials(group) };
    record.muzzleFlash = createMuzzleFlash(0.1*muzzleFlashScaleForWeapon(player.weapon));
    record.muzzleFlash.position.set(0.27, 1.34, -0.45 - length * heavyWeaponMuzzleDepth(skin?.key));
    if(dread)record.muzzleFlash.position.set(.27,1.37,-1.72);
    if (player.weapon === 'miniGun'&&skin?.key!=='miniGun_midas') record.muzzleFlash.position.x += length * 0.125;
    record.muzzleBaseX=record.muzzleFlash.position.x;
    (ogreModel?group:weapon).add(record.muzzleFlash);
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
    this.clearObject(this.viewWeapon); this.viewWeaponKey = key;
    const skin = WEAPON_SKINS[player.weapon]?.find(s => s.key === player.weaponSkinKey);
    const marioPipe = player.weapon === 'sniper' && skin?.key === 'sniper_mario';
    const grip = this.material('#182a35', 0.15, 0.65);
    const glove = this.material('#c6d6d5', 0.25, 0.4);
    const length = ({ pistol: 0.36, autoRifle: 0.58, miniGun: 0.5, sniper: 0.8, shotgun: 0.68 })[player.weapon] || 0.36;
    if(player.weapon==='shotgun') {
      const model=createShotgun(skin?.key,length);model.position.set(0.23,-0.2,-0.32);this.viewWeapon.add(model);
    } else if (marioPipe) {
      const pipe = createMarioPipe(length); pipe.position.set(0.23, -0.2, -0.32); this.viewWeapon.add(pipe);
    } else if (player.weapon === 'autoRifle') {
      const rifle = createAutoRifle(skin?.key, length); rifle.position.set(0.23, -0.2, -0.32); this.viewWeapon.add(rifle);
    } else if (player.weapon === 'pistol') {
      const pistol = createPistol(skin?.key, length); pistol.position.set(0.23, -0.2, -0.32); this.viewWeapon.add(pistol);
    } else if (player.weapon === 'miniGun' || ['sniper_calibrated','sniper_flatpack'].includes(skin?.key)) {
      const model = createHeavyWeapon(player.weapon, skin?.key, length);
      model.scale.setScalar(length * heavyWeaponViewScale(skin?.key));
      model.position.set(0.23, -0.2 + heavyWeaponViewYOffset(skin?.key), heavyWeaponViewZ(skin?.key));
      this.viewWeapon.add(model);
    } else {
      const metal = this.material(skin?.bulletColor || '#354854', 0.7, 0.25);
      this.box(this.viewWeapon, 0.12, 0.14, length, 0.23, -0.2, -0.32 - length / 2, metal, 0.025);
    }
    this.box(this.viewWeapon, 0.09, 0.22, 0.13, 0.23, -0.31, -0.43, grip, 0.025);
    this.box(this.viewWeapon, 0.12, 0.14, 0.17, 0.23, -0.31, -0.37, glove, 0.035);
    this.box(this.viewWeapon, 0.14, 0.15, 0.38, 0.23, -0.36, -0.15, grip, 0.045);
    if (player.weapon !== 'pistol') {
      this.box(this.viewWeapon, 0.13, 0.13, 0.17, 0.16, -0.29, -0.66, glove, 0.035);
      this.box(this.viewWeapon, 0.14, 0.15, 0.43, 0.10, -0.37, -0.39, grip, 0.035);
    }
    if (player.weapon === 'sniper' && !marioPipe && !['sniper_calibrated','sniper_flatpack'].includes(skin?.key)) this.box(this.viewWeapon, 0.08, 0.08, 0.28, 0.23, -0.09, -0.61, grip, 0.025);
    this.viewFlashMaterials = this.captureFlashMaterials(this.viewWeapon);
    this.viewMuzzleFlash = createMuzzleFlash(0.045*muzzleFlashScaleForWeapon(player.weapon));
    this.viewMuzzleFlash.position.set(0.23, -0.2 + heavyWeaponViewYOffset(skin?.key), -0.32 - length * heavyWeaponMuzzleDepth(skin?.key));
    if (player.weapon === 'miniGun'&&skin?.key!=='miniGun_midas') this.viewMuzzleFlash.position.x += length * 0.125;
    this.viewMuzzleState={weaponSkinKey:skin?.key,muzzleBaseX:this.viewMuzzleFlash.position.x,muzzleBarrelOffset:length*0.062};
    this.viewWeapon.add(this.viewMuzzleFlash);
  }

  triggerWeaponFlash(flash,state,shot) {
    const style=shotgunMuzzleStyle(state?.weaponSkinKey,shot.shotgunBarrel);
    flash.position.x=(state?.muzzleBaseX??flash.position.x)+(style?.barrel||0)*(state?.muzzleBarrelOffset||0);
    triggerMuzzleFlash(flash,Math.random,state?.dread?'#ff263f':style?.color);
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

  shot(shot) {
    const character = this.characters.get(shot.playerId);
    const dread=character?.dread;
    const skinKey=shot.weaponSkinKey||character?.weaponSkinKey||
      (shot.playerId===this.localId?this.viewMuzzleState?.weaponSkinKey:null);
    const barrelStyle=shotgunMuzzleStyle(skinKey,shot.shotgunBarrel);
    for(const pellet of shot.pellets||[shot]) {
    const start = world(pellet.x, pellet.y, pellet.height ?? 1.84), end = world(pellet.endX, pellet.endY, pellet.endHeight ?? 1.84);
    const pelletColor=dread?0xff253d:shotgunPelletColor(skinKey,shot.shotgunBarrel,pellet.hit==='player');
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([start, end]), new THREE.LineBasicMaterial({ color: pelletColor, transparent: true, opacity: 0.9 }));
    const spark = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 0), new THREE.MeshBasicMaterial({ color:dread?0xff4053:(barrelStyle?.color||0xffdfaa), transparent: true }));
    spark.position.copy(end);
    const group = new THREE.Group(); group.add(line, spark); this.stage.add(group);
    this.effects.push({ group, time: 0.11 });
    }
    if (character) { character.recoil = shot.pellets?0.22:0.13;character.shotAt=this.renderTime;
      this.triggerWeaponFlash(character.muzzleFlash,character,shot); }
    if (shot.playerId === this.localId) { this.weaponRecoil = shot.pellets?0.2:0.1;this.viewShotAt=this.renderTime;
      this.triggerWeaponFlash(this.viewMuzzleFlash,this.viewMuzzleState,shot); }
  }

  animateElevator(state, now) {
    if(!this.elevatorModel)return;
    const sample=elevatorSample(state,now);
    this.liftRise=sample.rise;
    const rideT=Math.max(0,Math.min(1,(now-state.startedAt-LIFT_TIMING.close)/LIFT_TIMING.travel));
    this.liftSway=state.phase==='riding'?0.018*Math.sin(2*Math.PI*rideT)*Math.sin(Math.PI*rideT):0;
    const exitSample=this.arrivalModel ? state.phase==='ready'?
      elevatorSample({phase:'opening',startedAt:state.startedAt},now):state.phase==='riding'?sample:{door:0,rise:0}:sample;
    poseElevator(this.elevatorModel,exitSample);
    if(this.arrivalModel) {
      poseElevator(this.arrivalModel,state.phase==='opening'?sample:{door:1,rise:0});
      elevatorDisplay(this.arrivalModel,`IN ${state.floor}`);
    }
    // Blend actors to a fixed overhead fill while doors close, and reverse it
    // as they open. At transfer both cabins have exactly the same light state.
    const cabinFill=['riding','opening'].includes(state.phase)?1-sample.door:0;
    const pve=this.mapConfig.mode==='pve';
    this.ambient.intensity=(pve?1.9:3.2)*(1-cabinFill)+3*cabinFill;
    this.sun.intensity=(pve?1.5:3.5)*(1-cabinFill);
    this.rim.intensity=(pve?.65:2)*(1-cabinFill);
    this.areaLights?.traverse(o=>{if(o.isLight)o.intensity=o.userData.roomIntensity*(1-cabinFill);});
    elevatorDisplay(this.elevatorModel,state.phase==='riding'?`↑ ${state.floor+1}`:state.phase==='ready'?'EXIT':'LOCK');
    // A closed cabin is an intentional loading boundary. Hide the old floor
    // during the ride so its ceiling cannot pass through the passenger cabin.
    const characterGroups=new Set([...this.characters.values()].map(c=>c.group));
    for(const child of this.stage.children) {
      if(child===this.elevatorModel)continue;
      if(!characterGroups.has(child))child.visible=state.phase!=='riding'||sample.door>0;
    }
  }

  render(players, localId, dt, pitch = 0) {
    this.renderTime+=dt;this.shadowElapsed+=dt;
    // Ten shadow updates per second remain visually smooth while halving the
    // most expensive multi-pass work.
    if(this.shadowElapsed>=0.1){this.renderer.shadowMap.needsUpdate=true;this.shadowElapsed%=0.1;}
    for(const {solid,model} of this.cargoModels||[]) {
      if(solid.kind==='lift')poseCargoLift(model,solid.top);
      else model.position.y=solid.bottom;
      const index=this.reflectionSolids.indexOf(solid);
      if(index>=0&&index<64){this.floor.uniforms.wallMax.value[index].y=solid.top;this.floor.uniforms.wallMin.value[index].y=solid.bottom||0;}
    }
    this.localId = localId;
    const local = players.find(p => p.id === localId);
    const viewed = local?.alive ? local : players.find(p => p.alive);
    if (viewed) {
      const viewPitch = viewed.id === localId ? pitch : 0;
      const foot=viewed.height||0;
      // Ease the view over small stair risers; jumps and large corrections stay immediate.
      this.viewFootHeight=this.viewedId===viewed.id&&viewed.jumpStartedAt==null&&this.viewFootHeight!=null&&Math.abs(foot-this.viewFootHeight)<0.35?
        this.viewFootHeight+(foot-this.viewFootHeight)*(1-Math.exp(-24*dt)):foot;
      this.viewedId=viewed.id;
      this.camera.position.copy(world(viewed.x, viewed.y, 1.84 + this.viewFootHeight + (this.liftRise || 0) + (this.liftSway || 0)));
      this.camera.lookAt(this.camera.position.clone().add(new THREE.Vector3(
        Math.cos(viewed.angle) * Math.cos(viewPitch), Math.sin(viewPitch), Math.sin(viewed.angle) * Math.cos(viewPitch))));
      this.deathShake*=Math.exp(-9*dt);
      this.camera.position.y+=Math.sin(this.renderTime*65)*this.deathShake;
      this.camera.updateMatrixWorld();
    }
    const localMaxHealth=local?.maxHealth??101;
    const localHealth = local?.alive ? Math.max(0, Math.min(localMaxHealth, local.health ?? localMaxHealth)) : 0;
    document.getElementById('local-health-text').textContent = local?.alive ? `${Math.ceil(localHealth)} / ${localMaxHealth} HP` : `SPECTATING${viewed ? ' / ' + viewed.name : ''}`;
    const healthBar = document.getElementById('local-health-bar');
    healthBar.hidden = !local?.alive;
    healthBar.setAttribute('aria-valuemax',String(localMaxHealth));
    healthBar.setAttribute('aria-valuenow', String(localHealth));
    const healthFill = document.getElementById('local-health-fill');
    const localPercent=100*localHealth/localMaxHealth;
    healthFill.style.width = `${localPercent}%`;
    healthFill.style.backgroundColor = localPercent < 30 ? '#ff7878' : localPercent < 60 ? '#ffd48b' : '#7bf0c4';
    const crosshair=document.getElementById('crosshair');
    crosshair.hidden=!local?.alive;
    crosshair.classList.toggle('shotgun',!!local?.alive&&local.weapon==='shotgun');
    const activeIds = new Set(players.map(p => p.id));
    for (const [id, c] of this.characters) if (!activeIds.has(id)) {
      this.stage.remove(c.group); this.clearObject(c.group); c.label.remove(); this.characters.delete(id);
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
      const currentHealth = player.health ?? player.maxHealth ?? 101;
      c.damageFlash = currentHealth < c.health ? 0.22 : Math.max(0, c.damageFlash - dt);
      c.health = currentHealth;
      this.applyDamageFlash(c.flashMaterials, c.damageFlash);
      updateMuzzleFlash(c.muzzleFlash, dt);
      if(player.weapon==='shotgun')poseShotgun(c.weapon,this.renderTime-(c.shotAt??-10),this.renderTime);
      c.group.visible = !!player.alive && player.id !== viewed?.id; c.label.hidden = !c.group.visible;
      if (!player.alive) continue;
      const motion=updateCharacterMotion(c,player,dt);
      c.legs.forEach((leg,i)=>{leg.rotation.x=motion.stride*(i?-1:1)*(c.ogreModel?0.7:1);});
      c.arms.forEach((arm,i)=>{arm.rotation.x=motion.stride*(i?1:-1)*(c.ogreModel?0.35:0.12);});
      const elevation=(player.height || 0)+(!player.isBot?(this.liftRise || 0):0);
      c.group.position.copy(world(c.x,c.y,elevation+motion.bob));c.group.rotation.y=-c.angle-Math.PI/2;
      c.group.rotation.z=motion.sway;
      if(c.ogreModel)poseOgre(c.ogreModel,player.ogreAttack,world);
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
      c.recoil = Math.max(0, c.recoil - dt); c.weapon.position.z = c.recoil;
      const remoteSwap=Math.max(0,Math.min(1,(this.renderTime-c.weaponSwitchAt)/WEAPON_SWAP_SECONDS));
      c.weapon.position.y=-0.22*Math.sin(Math.PI*remoteSwap);
      c.weapon.rotation.x=0.25*Math.sin(Math.PI*remoteSwap);
      const anchor = world(c.x,c.y,(player.bodyHeight||2.2)+0.2+elevation+motion.bob);
      const p = anchor.clone().project(this.camera);
      const direction = world(player.x, player.y, 1.5 + elevation).sub(this.camera.position);
      const inView=c.group.visible&&p.z>=-1&&p.z<=1&&Math.abs(p.x)<=1&&Math.abs(p.y)<=1;
      if(inView&&this.renderTime>=(c.nextLabelCheck||0)){
        this.raycaster.set(this.camera.position, direction.clone().normalize());
        this.raycaster.far=direction.length();
        c.labelOccluded=this.raycaster.intersectObjects(this.wallOccluders,false).length>0;
        c.nextLabelCheck=this.renderTime+0.12+(Number(player.id.replace(/\D/g,''))%4||0)*0.01;
      }
      if(!inView)c.nextLabelCheck=0;
      c.label.hidden=!inView||c.labelOccluded;
      c.label.style.left = `${(p.x * 0.5 + 0.5) * 100}%`; c.label.style.top = `${(-p.y * 0.5 + 0.5) * 100}%`;
      const health = Math.max(0, player.health ?? player.maxHealth ?? 101), percent=100*health/(player.maxHealth||101);
      c.value.textContent = Math.ceil(health); c.fill.style.width = `${Math.min(100,percent)}%`;
      c.fill.style.background = player.botType==='dread'?'#ef3048':percent < 30 ? '#ff7878' : percent < 60 ? '#ffd48b' : '#7bf0c4';
    }
    this.updateDeathEffects(dt);
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const fx = this.effects[i]; fx.time -= dt;
      if (fx.time <= 0) { this.stage.remove(fx.group); this.clearObject(fx.group); this.effects.splice(i, 1); }
      else if(fx.explosion)poseGrenadeExplosion(fx.group,fx.duration-fx.time,this.camera.quaternion);
      else fx.group.children.forEach(child => {
        child.material.opacity = fx.time / (fx.duration||.11);
      });
    }
    for(const item of this.grenades.values()) {
      poseGrenadeFuse(item.body.material,item.fuseDeadline-performance.now());
      item.group.position.lerp(item.target,1-Math.exp(-35*dt));
      if(item.moving){item.group.rotation.x+=dt*7;item.group.rotation.z+=dt*4;}
    }
    this.drawMinimap(local); this.renderer.render(this.scene, this.camera);
    if (local?.alive) {
      this.buildViewWeapon(local);
      if(local.weapon==='shotgun')poseShotgun(this.viewWeapon,this.renderTime-(this.viewShotAt??-10),this.renderTime);
      updateMuzzleFlash(this.viewMuzzleFlash, dt);
      this.applyDamageFlash(this.viewFlashMaterials, this.characters.get(localId)?.damageFlash || 0);
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

  drawMinimap(player) {
    const ctx = this.map;
    if(!this.minimapCache) {
      const canvas=document.createElement('canvas');canvas.width=180;canvas.height=120;
      const base=canvas.getContext('2d');
      const sx=Math.min(180/this.mapConfig.width,120/this.mapConfig.height),sy=sx;
      const ox=(180-this.mapConfig.width*sx)/2,oy=(120-this.mapConfig.height*sy)/2;
      base.fillStyle='#0b1a24';base.fillRect(0,0,180,120);base.fillStyle='#55727e';
      base.save();base.translate(ox,oy);
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
        base.fillStyle=s.kind==='lift'?'#f3c35d':s.kind==='ramp'?'#c3a974':s.kind==='tree'?'#60965e':'#7b9498';
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
