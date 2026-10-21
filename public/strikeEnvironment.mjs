import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const SCALE = .05;
const toWorld = (x, y, height = 0, out = new THREE.Vector3()) =>
  out.set((x - 450) * SCALE, height, (y - 300) * SCALE);

function material(color, metalness = .55, roughness = .4, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, metalness, roughness, ...extra });
}

function boxGeometry(width, height, depth, x, y, z, bevel = 0) {
  const geometry = bevel > 0
    ? new RoundedBoxGeometry(width, height, depth, 2, Math.min(bevel, width / 3, height / 3, depth / 3))
    : new THREE.BoxGeometry(width, height, depth);
  geometry.translate(x, y, z);
  return geometry;
}

function cylinderBetween(a, b, radius, radialSegments = 10) {
  const direction = new THREE.Vector3().subVectors(b, a);
  const geometry = new THREE.CylinderGeometry(radius, radius, direction.length(), radialSegments, 1, false);
  geometry.quaternion = undefined;
  const midpoint = new THREE.Vector3().addVectors(a, b).multiplyScalar(.5);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
  matrix.compose(midpoint, quaternion, new THREE.Vector3(1, 1, 1));
  geometry.applyMatrix4(matrix);
  return geometry;
}

function verticalCapsuleGeometries(ax, ay, bx, by, radius, bottom, top) {
  const a=toWorld(ax,ay,(bottom+top)/2),b=toWorld(bx,by,(bottom+top)/2);
  const dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz),height=top-bottom;
  const center=new THREE.Vector3((a.x+b.x)/2,(bottom+top)/2,(a.z+b.z)/2);
  // Recess the rectangular course a hair at its horizontal caps so its top
  // and underside do not coplanar-fight the two round end-cap discs.
  const body=new THREE.BoxGeometry(Math.max(.001,length),Math.max(.001,height-.03),radius*2);
  const matrix=new THREE.Matrix4().compose(center,
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),-Math.atan2(dz,dx)),
    new THREE.Vector3(1,1,1));
  body.applyMatrix4(matrix);
  const ends=[a,b].map(point=>{
    const cap=new THREE.CylinderGeometry(radius,radius,height,12);
    cap.translate(point.x,(bottom+top)/2,point.z);return cap;
  });
  return [body,...ends];
}

function rampGeometry(solid,includeTop=true,sideMode='all',includeBottom=true) {
  const x0 = (solid.x - 450) * SCALE, x1 = (solid.x + solid.width - 450) * SCALE;
  const z0 = (solid.y - 300) * SCALE, z1 = (solid.y + solid.height - 300) * SCALE;
  const low = solid.bottom, high = solid.top;
  const structureDepth = Number.isFinite(solid.structureDepth) ? solid.structureDepth : .48;
  let heights;
  if (solid.axis === 'y') heights = solid.reverse ? [high, low, low, high] : [low, high, high, low];
  else heights = solid.reverse ? [high, high, low, low] : [low, low, high, high];
  // Corner order: (x0,z0), (x0,z1), (x1,z1), (x1,z0).
  const positions = [
    x0, heights[0], z0, x0, heights[1], z1, x1, heights[2], z1, x1, heights[3], z0,
    x0, heights[0]-structureDepth, z0, x0, heights[1]-structureDepth, z1,
    x1, heights[2]-structureDepth, z1, x1, heights[3]-structureDepth, z0,
  ];
  const faceA=[0,4,5,0,5,1],faceB=[1,5,6,1,6,2],
    faceC=[2,6,7,2,7,3],faceD=[3,7,4,3,4,0];
  const routeEnds=solid.axis==='x'?[...faceA,...faceC]:[...faceB,...faceD];
  const lateralSides=solid.axis==='x'?[...faceB,...faceD]:[...faceA,...faceC];
  const sideIndices=sideMode==='all'?[...routeEnds,...lateralSides]:
    sideMode==='ends'?routeEnds:sideMode==='laterals'?lateralSides:[];
  const indices = [...(includeTop?[0, 1, 2, 0, 2, 3]:[]),
    ...(includeBottom?[4, 6, 5, 4, 7, 6]:[]),...sideIndices];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(16),2));
  geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  return geometry;
}

function rampSurfacePoint(solid,t,lateral=.5) {
  const x=solid.axis==='y'?solid.x+solid.width*lateral:solid.x+solid.width*t;
  const y=solid.axis==='y'?solid.y+solid.height*t:solid.y+solid.height*lateral;
  const fraction=solid.reverse?1-t:t;
  return toWorld(x,y,solid.bottom+(solid.top-solid.bottom)*fraction);
}

// A local X axis follows the incline, local Y is its upward normal and local
// Z crosses the deck. This lets every tread/channel remain parallel to the
// exact authoritative walk plane instead of floating as horizontal boxes.
function rampOrientedBox(solid,t0,t1,normalThickness,lateralWidth,normalOffset=0,lateralOffset=0) {
  const a=rampSurfacePoint(solid,t0),b=rampSurfacePoint(solid,t1);
  const forward=b.clone().sub(a),length=forward.length();forward.normalize();
  const lateral=solid.axis==='x'?new THREE.Vector3(0,0,1):new THREE.Vector3(-1,0,0);
  const normal=lateral.clone().cross(forward).normalize();
  const center=a.clone().add(b).multiplyScalar(.5)
    .addScaledVector(normal,normalOffset).addScaledVector(lateral,lateralOffset);
  const geometry=new THREE.BoxGeometry(length,normalThickness,lateralWidth);
  const matrix=new THREE.Matrix4().makeBasis(forward,normal,lateral);matrix.setPosition(center);
  geometry.applyMatrix4(matrix);return geometry;
}

function rampAssemblyGeometries(solid) {
  const a=rampSurfacePoint(solid,0),b=rampSurfacePoint(solid,1),length=a.distanceTo(b);
  const forward=b.clone().sub(a).normalize();
  const lateral=solid.axis==='x'?new THREE.Vector3(0,0,1):new THREE.Vector3(-1,0,0);
  const normal=lateral.clone().cross(forward).normalize();
  const width=(solid.axis==='y'?solid.width:solid.height)*SCALE;
  const depth=Number.isFinite(solid.structureDepth)?solid.structureDepth:.48;
  const edge=[],underframe=[],deckPlates=[],nosings=[];

  // Twin deep side channels and repeated cross-bearers form a believable
  // load path. They stay inside the closed structural casing and its exact
  // footprint, so none of this detail creates a ghost ledge or snag.
  const channelWidth=Math.min(.22,Math.max(.14,width*.055));
  const channelUnits=channelWidth/SCALE;
  // Exact deep edge stringers replace (rather than overlap) the casing's side
  // faces. Each is a real constant-depth ramp slice wholly inside the same
  // footprint and vertical collision envelope.
  if(solid.axis==='x') {
    edge.push(rampGeometry({...solid,height:channelUnits},true,'laterals',false));
    edge.push(rampGeometry({...solid,y:solid.y+solid.height-channelUnits,height:channelUnits},true,'laterals',false));
  } else {
    edge.push(rampGeometry({...solid,width:channelUnits},true,'laterals',false));
    edge.push(rampGeometry({...solid,x:solid.x+solid.width-channelUnits,width:channelUnits},true,'laterals',false));
  }

  const bearerThickness=Math.min(.2,depth*.28),bearerDrop=depth*.66*normal.y;
  const bearerCount=Math.max(3,Math.min(12,Math.floor(length/1.3)));
  for(let index=0;index<bearerCount;index++) {
    const t=.08+.84*(index/(bearerCount-1));
    const half=.12/Math.max(.001,length);
    underframe.push(rampOrientedBox(solid,Math.max(.02,t-half),Math.min(.98,t+half),
      bearerThickness,Math.max(.2,width-.1),-bearerDrop));
  }
  // Heavier headers at both deck seams make the landings read as supported,
  // while remaining fully inside the ramp collider.
  for(const t of [.035,.965]) {
    const half=.18/Math.max(.001,length);
    underframe.push(rampOrientedBox(solid,Math.max(.005,t-half),Math.min(.995,t+half),
      Math.min(.3,depth*.42),Math.max(.2,width-.06),-depth*.58*normal.y));
  }

  // The walk skin is built from abutting load plates rather than placing trim
  // on top of a second ramp face. Tiny open seams reveal the dark casing; no
  // surfaces overlap, and every visible plate/nosing top is the exact smooth
  // authoritative incline (never a decorative bump above player support).
  const plateCount=Math.max(4,Math.min(18,Math.round(length/.9)));
  const seam=.012/Math.max(.001,length),nosing=.075/Math.max(.001,length),thickness=.04;
  for(let index=0;index<plateCount;index++) {
    const start=index===0?0:index/plateCount+seam/2;
    const end=index===plateCount-1?1:(index+1)/plateCount-seam/2;
    const split=Math.min(end,start+nosing);
    if(split>start)nosings.push(rampOrientedBox(solid,start,split,thickness,
      Math.max(.2,width-channelWidth*2),-thickness/2));
    if(end>split)deckPlates.push(rampOrientedBox(solid,split,end,thickness,
      Math.max(.2,width-channelWidth*2),-thickness/2));
  }
  return {edge,underframe,deckPlates,nosings,metrics:{id:solid.id,length,width,depth,
    surfaceA:a.toArray(),surfaceB:b.toArray(),
    undersideA:[a.x,a.y-depth,a.z],undersideB:[b.x,b.y-depth,b.z],normalY:normal.y}};
}

function railPrismGeometry(rail,from=0,to=null,outset=0) {
  const railHeight=(rail.top??((rail.bottom||0)+1.15))-(rail.bottom||0);
  const upper=to==null?railHeight:to;
  const x0=(rail.x-450)*SCALE-outset,x1=(rail.x+rail.width-450)*SCALE+outset;
  const z0=(rail.y-300)*SCALE-outset,z1=(rail.y+rail.height-300)*SCALE+outset;
  const rise=rail.rise||0;
  let base;
  if(rail.axis==='y')base=rail.reverse?
    [rail.bottom+rise,rail.bottom,rail.bottom,rail.bottom+rise]:
    [rail.bottom,rail.bottom+rise,rail.bottom+rise,rail.bottom];
  else if(rail.axis==='x')base=rail.reverse?
    [rail.bottom+rise,rail.bottom+rise,rail.bottom,rail.bottom]:
    [rail.bottom,rail.bottom,rail.bottom+rise,rail.bottom+rise];
  else base=[rail.bottom,rail.bottom,rail.bottom,rail.bottom];
  const positions=[];
  for(const offset of [from,upper])positions.push(
    x0,base[0]+offset,z0,x0,base[1]+offset,z1,
    x1,base[2]+offset,z1,x1,base[3]+offset,z0);
  const indices=[0,1,2,0,2,3,4,6,5,4,7,6,
    0,4,5,0,5,1,1,5,6,1,6,2,2,6,7,2,7,3,3,7,4,3,4,0];
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(16),2));
  geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingSphere();
  return geometry;
}

function polygonPrismGeometry(points,bottom,top) {
  const count=points.length,positions=[];
  for(const height of [bottom,top])for(const point of points) {
    const p=toWorld(point.x,point.y,height);positions.push(p.x,p.y,p.z);
  }
  let area=0;
  for(let index=0;index<count;index++) {
    const a=points[index],b=points[(index+1)%count];area+=a.x*b.y-b.x*a.y;
  }
  const indices=[];
  // Map Y becomes world Z, reversing the usual 2-D winding when viewed from
  // above. Keep the top face outward and the underside inward explicitly.
  for(let index=1;index<count-1;index++) {
    if(area>=0)indices.push(count,count+index+1,count+index,0,index,index+1);
    else indices.push(count,count+index,count+index+1,0,index+1,index);
  }
  for(let index=0;index<count;index++) {
    const next=(index+1)%count,a=index,b=next,c=count+next,d=count+index;
    if(area>=0)indices.push(a,b,c,a,c,d);else indices.push(a,c,b,a,d,c);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  // Static batch members all carry a UV channel. Polygon decks use a flat
  // industrial material, but still provide the attribute so Three can merge
  // them with rectangular slabs in the same bounded draw call.
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(count*4),2));
  geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingSphere();
  return geometry;
}

function subtractRect(rect,cut) {
  const x0=Math.max(rect.x,cut.x),y0=Math.max(rect.y,cut.y);
  const x1=Math.min(rect.x+rect.width,cut.x+cut.width),y1=Math.min(rect.y+rect.height,cut.y+cut.height);
  if(x1<=x0+.0001||y1<=y0+.0001)return [rect];
  const parts=[];
  if(x0>rect.x+.0001)parts.push({...rect,width:x0-rect.x});
  if(x1<rect.x+rect.width-.0001)parts.push({...rect,x:x1,width:rect.x+rect.width-x1});
  if(y0>rect.y+.0001)parts.push({x:x0,y:rect.y,width:x1-x0,height:y0-rect.y});
  if(y1<rect.y+rect.height-.0001)parts.push({x:x0,y:y1,width:x1-x0,
    height:rect.y+rect.height-y1});
  return parts.filter(part=>part.width>.0001&&part.height>.0001);
}

function claimRect(rect,coverage) {
  let visible=[rect];
  for(const claimed of coverage)visible=visible.flatMap(part=>subtractRect(part,claimed));
  coverage.push(rect);return visible;
}

function disposeTree(root) {
  const geometries = new Set(), materials = new Set();
  root.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.material) {
      const values = Array.isArray(object.material) ? object.material : [object.material];
      values.forEach(value => materials.add(value));
    }
  });
  geometries.forEach(value => value.dispose()); materials.forEach(value => value.dispose());
}

export function createRedVaultEnvironment(map) {
  const group = new THREE.Group();
  group.name = 'red-vault-environment';
  const occluders = [];
  const dynamic = new Map();
  const animated = [];
  const staticBatches = new Map();
  const lightObjects = [];
  const routeVisuals=[];
  const interactionPanels=new Map();
  const destructibles=new Map();
  const reviveVisuals=new Map();
  const rampAssemblyMetrics=[];
  const deckTopCoverage=new Map(),ceilingCoverage=new Map(),wallTrimCoverage=new Map();
  let objectiveBeacon=null;
  let missionState = { machinery: {}, solidStates: {}, phase: 'staging', encounterIndex: 0 };
  let currentLightingZone=null;
  const hazardStateById = new Map();
  const lightingZones = (map.lightingZones || []).map(zone => ({...zone,
    renderFogColor: new THREE.Color(zone.fog)}));

  const materials = {
    shell: material('#211e21', .72, .34),
    shellInset: material('#353238', .68, .31),
    edge: material('#8c8c88', .82, .23),
    deck: material('#39383b', .75, .42),
    deckEdge: material('#b1aaa2', .7, .28),
    black: material('#0d1014', .86, .25),
    red: material('#891626', .78, .25),
    brightRed: material('#d52a3d', .7, .22),
    warm: material('#8d4d2d', .63, .38),
    brass: material('#9e6d37', .82, .25),
    glass: material('#5e8491', .4, .13, { transparent: true, opacity: .34, depthWrite: false }),
    grate: material('#55565a', .83, .38),
    redGlow: material('#2b0308', .35, .25, { emissive: '#ff1737', emissiveIntensity: 4.2 }),
    orangeGlow: material('#3b0c02', .3, .3, { emissive: '#ff4a16', emissiveIntensity: 5.6 }),
    whiteGlow: material('#dce7e3', .2, .25, { emissive: '#ffe6d5', emissiveIntensity: 2.4 }),
    darkGlow: material('#120206', .35, .28, { emissive: '#8e071c', emissiveIntensity: 2.1 }),
    reviveShell: material('#dbe8ec', .62, .2, { emissive: '#538fb0', emissiveIntensity: .8 }),
  };

  const addBatch = (key, geometry, mat = materials[key], options = {}) => {
    if (!staticBatches.has(key)) staticBatches.set(key, { material: mat, geometries: [], ...options });
    // Three's primitive helpers mix indexed and non-indexed buffers. Static
    // merging requires one representation; normalize once during construction
    // instead of letting a single rounded/cylindrical shell drop the mission.
    if(geometry.index) {
      const expanded=geometry.toNonIndexed();geometry.dispose();geometry=expanded;
    }
    staticBatches.get(key).geometries.push(geometry);
  };
  const addMesh = (geometry, mat, name, options = {}) => {
    const mesh = new THREE.Mesh(geometry, mat); mesh.name = name;
    mesh.castShadow = !!options.castShadow; mesh.receiveShadow = options.receiveShadow !== false;
    if (options.occluder) { mesh.layers.enable(1); occluders.push(mesh); }
    (options.parent || group).add(mesh); return mesh;
  };
  const addWorldBox = (key, x, y, width, depth, bottom, top, bevel = 0) => {
    const p = toWorld(x + width / 2, y + depth / 2, (bottom + top) / 2);
    addBatch(key, boxGeometry(width * SCALE, Math.max(.025, top - bottom), depth * SCALE,
      p.x, p.y, p.z, bevel));
  };

  // ---------------------------------------------------------------------
  // Architectural shell. Main collision bodies are rendered as joined steel
  // courses with deliberately offset ribs, ledges and reveals—not as exposed
  // debug boxes. Top surfaces remain mathematically identical to support.
  // ---------------------------------------------------------------------
  const specialWallKinds = new Set(['column', 'rail', 'pipe', 'cargo', 'conveyor', 'machineBase',
    'furnace', 'console', 'reactorCore', 'hoistRail', 'machineFrame', 'strikeDoor']);
  for (const solid of map.walls) {
    if (specialWallKinds.has(solid.kind)) continue;
    if (solid.collisionShape === 'capsule') {
      for(const geometry of verticalCapsuleGeometries(solid.collisionA.x,solid.collisionA.y,
        solid.collisionB.x,solid.collisionB.y,solid.collisionRadius*SCALE,solid.bottom,solid.top))
        addBatch('shell',geometry);
      continue;
    }
    addWorldBox(solid.kind === 'cover' ? 'red' : 'shell', solid.x, solid.y, solid.width,
      solid.height, solid.bottom, solid.top, .04);
    // Vertical ribs sit outside the collision face, creating real panel depth
    // without putting a flush coplanar sheet over the wall.
    const longX = solid.width >= solid.height;
    const count = Math.max(1, Math.floor((longX ? solid.width : solid.height) / 180));
    for (let i = 0; i <= count; i++) {
      const t = (i + .5) / (count + 1);
      const x = longX ? solid.x + solid.width * t : solid.x + solid.width / 2;
      const y = longX ? solid.y + solid.height / 2 : solid.y + solid.height * t;
      const p = toWorld(x, y, (solid.bottom + solid.top) / 2);
      const w = longX ? .12 : solid.width * SCALE + .08;
      const d = longX ? solid.height * SCALE + .08 : .12;
      addBatch('shellInset', boxGeometry(w, Math.max(.4, solid.top - solid.bottom - .7), d,
        p.x, p.y, p.z, .025));
    }
    const trimWidth=Math.max(.08/SCALE,solid.width+(longX?.04:.12)/SCALE);
    const trimDepth=Math.max(.08/SCALE,solid.height+(longX?.12:.04)/SCALE);
    const trimRect={x:solid.x+(solid.width-trimWidth)/2,y:solid.y+(solid.height-trimDepth)/2,
      width:trimWidth,height:trimDepth};
    const trimKey=solid.top.toFixed(4),claimed=wallTrimCoverage.get(trimKey)||[];
    wallTrimCoverage.set(trimKey,claimed);
    for(const part of claimRect(trimRect,claimed)) {
      const trimP=toWorld(part.x+part.width/2,part.y+part.height/2,solid.top-.25);
      addBatch('edge',boxGeometry(part.width*SCALE,.16,part.height*SCALE,
        trimP.x,trimP.y,trimP.z,.025));
    }
  }

  for (const solid of map.terrain) {
    // Lift-attached cage members are rendered once in the moving hoist
    // hierarchy below. Baking them here as static deck boxes would leave a
    // duplicate cage at the lower stop and create coplanar flashing.
    if (solid.kind === 'lift' || solid.liftId || solid.dynamicId === 'command-bridge') continue;
    if (solid.kind === 'ramp') {
      // Side/underside casing has no duplicate top face; the assembly's
      // segmented load plates below are the only rendered walking skin.
      addBatch('grate', rampGeometry(solid,false,'ends'));
      const assembly=rampAssemblyGeometries(solid);
      assembly.edge.forEach(geometry=>addBatch('edge',geometry));
      assembly.underframe.forEach(geometry=>addBatch('black',geometry));
      assembly.deckPlates.forEach(geometry=>addBatch('grate',geometry));
      assembly.nosings.forEach(geometry=>addBatch('deckEdge',geometry));
      rampAssemblyMetrics.push(assembly.metrics);
      continue;
    }
    if (solid.kind === 'ceilingPanel') {
      const ceilingKey=`${solid.bottom.toFixed(4)}:${solid.top.toFixed(4)}`;
      const claimed=ceilingCoverage.get(ceilingKey)||[];ceilingCoverage.set(ceilingKey,claimed);
      for(const part of claimRect(solid,claimed))
        addWorldBox('shell',part.x,part.y,part.width,part.height,solid.bottom,solid.top);
      // Deep roof beams clarify that each ceiling belongs to its room.
      const longX = solid.width > solid.height;
      const count = Math.max(2, Math.floor((longX ? solid.width : solid.height) / 260));
      for (let i = 1; i < count; i++) {
        const x = longX ? solid.x + solid.width * i / count : solid.x + solid.width / 2;
        const y = longX ? solid.y + solid.height / 2 : solid.y + solid.height * i / count;
        // Beam depth is contained inside the authoritative roof slab. From
        // below it reads as a recessed seam, never as visible ghost geometry.
        const p = toWorld(x, y, solid.bottom + .29);
        addBatch('black', boxGeometry(longX ? .22 : solid.width * SCALE, .55,
          longX ? solid.height * SCALE : .22, p.x, p.y, p.z, .03));
      }
      continue;
    }
    if(solid.collisionShape==='polygon'&&solid.collisionPolygon?.length>=3) {
      addBatch(solid.nonPlayable?'black':'deck',
        polygonPrismGeometry(solid.collisionPolygon,solid.bottom,solid.top));
      for(let index=0;index<solid.collisionPolygon.length;index++) {
        const a=solid.collisionPolygon[index],b=solid.collisionPolygon[(index+1)%solid.collisionPolygon.length];
        addBatch('deckEdge',cylinderBetween(toWorld(a.x,a.y,solid.top-.22),
          toWorld(b.x,b.y,solid.top-.22),.07,7));
      }
      continue;
    }
    // Walkable slab: the mesh top is exactly solid.top. All trim is below it.
    const skin=Math.min(.04,Math.max(.012,(solid.top-solid.bottom)*.35));
    addWorldBox(solid.nonPlayable ? 'black' : 'deck', solid.x, solid.y, solid.width,
      solid.height, solid.bottom, solid.top-skin);
    const deckKey=solid.top.toFixed(4),claimed=deckTopCoverage.get(deckKey)||[];
    deckTopCoverage.set(deckKey,claimed);
    for(const part of claimRect(solid,claimed))addWorldBox(solid.nonPlayable?'black':'deck',
      part.x,part.y,part.width,part.height,solid.top-skin,solid.top);
    const edgeP = toWorld(solid.x + solid.width / 2, solid.y + solid.height / 2, solid.top - .22);
    addBatch('deckEdge', boxGeometry(solid.width * SCALE + .06, .18, solid.height * SCALE + .06,
      edgeP.x, edgeP.y, edgeP.z, .025));
  }

  // Structural columns and rails use round/composite profiles that match their
  // circle or narrow-box collision footprints.
  for (const c of map.architecture.columns) {
    const p = toWorld(c.x, c.y, (c.bottom + c.top) / 2);
    const outer = new THREE.CylinderGeometry(c.radius * SCALE, c.radius * SCALE,
      c.top - c.bottom, c.style === 'command' ? 12 : 8);
    outer.translate(p.x, p.y, p.z); addBatch(c.style === 'command' ? 'red' : 'edge', outer);
    const collarBottom = toWorld(c.x, c.y, c.bottom + .15);
    const collarTop = toWorld(c.x, c.y, c.top - .15);
    for (const q of [collarBottom, collarTop]) {
      // Keep the band proud by only two centimetres; a broad decorative foot
      // would let the camera visibly enter metal before the round collider.
      const collarRadius=c.radius*SCALE+.035;
      const collar = new THREE.CylinderGeometry(collarRadius,collarRadius,.25,10);
      collar.translate(q.x, q.y, q.z); addBatch('black', collar);
    }
  }
  for (const r of map.architecture.rails) {
    const longX = r.width >= r.height;
    const length = (longX ? r.width : r.height) * SCALE;
    const count = Math.max(2, Math.floor(length / 1.6));
    const rise = r.rise || 0;
    const railHeight=(r.top??((r.bottom||0)+1.15))-(r.bottom||0);
    const minor=Math.min(r.width,r.height)*SCALE;
    // The old renderer drew a 7 cm handrail inside a 40–50 cm collision box,
    // leaving a broad invisible snag on either side.  These dark infill
    // panels occupy the exact authored prism. Slightly proud cap/toe frames
    // (12 mm) make the rail read as a composed foundry guard without changing
    // its gameplay silhouette in any perceptible way.
    const toeTop=Math.min(.22,railHeight),capBottom=Math.max(toeTop,railHeight-.2);
    if(capBottom>toeTop+.001)addBatch('shellInset',railPrismGeometry(r,toeTop,capBottom));
    addBatch('edge',railPrismGeometry(r,0,toeTop,.028));
    if(railHeight>capBottom+.001)addBatch('edge',railPrismGeometry(r,capBottom,railHeight,.028));
    for (let i = 0; i <= count; i++) {
      const t = i / count, f = r.reverse ? 1 - t : t;
      const x = longX ? r.x + r.width * t : r.x + r.width / 2;
      const y = longX ? r.y + r.height / 2 : r.y + r.height * t;
      const p = toWorld(x, y, r.bottom + rise * f + railHeight/2);
      addBatch('edge', boxGeometry(longX ? .14 : minor+.05, Math.max(.08,railHeight-.03),
        longX ? minor+.05 : .14, p.x, p.y, p.z, .015));
    }
    const a = toWorld(longX ? r.x : r.x + r.width / 2, longX ? r.y + r.height / 2 : r.y,
      r.bottom + (r.reverse ? rise : 0) + railHeight-.06);
    const b = toWorld(longX ? r.x + r.width : r.x + r.width / 2,
      longX ? r.y + r.height / 2 : r.y + r.height,
      r.bottom + (r.reverse ? 0 : rise) + railHeight-.06);
    addBatch('edge', cylinderBetween(a, b, .06, 8));
  }
  for (const p of map.architecture.pipes) {
    const a = toWorld(p.ax, p.ay, p.bottom + (p.top - p.bottom) / 2);
    const b = toWorld(p.bx, p.by, p.bottom + (p.top - p.bottom) / 2);
    const key = p.color === '#b51f32' ? 'red' : 'shellInset';
    const pipeGeometry=cylinderBetween(a,b,p.radius*SCALE,12),mid=(p.bottom+p.top)/2;
    const verticalScale=(p.top-p.bottom)/Math.max(.001,p.radius*SCALE*2);
    pipeGeometry.translate(0,-mid,0);pipeGeometry.scale(1,verticalScale,1);pipeGeometry.translate(0,mid,0);
    addBatch(key,pipeGeometry);
    for (const t of [.12, .5, .88]) {
      const q = a.clone().lerp(b, t);
      const ring = new THREE.TorusGeometry(p.radius*SCALE+.035,.045,6,12);
      ring.rotateY(Math.atan2(b.x - a.x, b.z - a.z));ring.scale(1,verticalScale,1);
      ring.translate(q.x, q.y, q.z);
      addBatch('edge', ring);
    }
  }

  // Diagonal and overhead trusses.
  for (const b of map.architecture.beams) {
    if (b.type === 'shaftRing') continue;
    const a = toWorld(b.ax, b.ay, (b.bottom + b.top) / 2);
    const c = toWorld(b.bx, b.by, (b.bottom + b.top) / 2);
    addBatch(b.style === 'crane-rail' ? 'black' : 'edge', cylinderBetween(a, c, b.style === 'press-header' ? .13 : .09, 8));
    if (b.style === 'truss' || b.style === 'crane-rail') {
      for (let i = 0; i < 8; i++) {
        const t0 = i / 8, t1 = (i + 1) / 8;
        const q0 = a.clone().lerp(c, t0); q0.y += i % 2 ? .35 : -.35;
        const q1 = a.clone().lerp(c, t1); q1.y += i % 2 ? -.35 : .35;
        addBatch('shellInset', cylinderBetween(q0, q1, .045, 6));
      }
    }
  }

  // Flush batches now; dynamic machines remain separate and bounded.
  for (const [key, batch] of staticBatches) {
    if (!batch.geometries.length) continue;
    const geometry = batch.geometries.length === 1 ? batch.geometries[0] : mergeGeometries(batch.geometries, false);
    if (!geometry) throw new Error(`Unable to merge Red Vault batch ${key}`);
    if (batch.geometries.length > 1) batch.geometries.forEach(item => item.dispose());
    addMesh(geometry, batch.material, `red-vault-${key}`, {
      castShadow: ['shell', 'edge', 'red'].includes(key), occluder: key === 'shell',
    });
  }

  // Dynamic blast shutters are layered armored slabs with independent teeth;
  // their visible opening animation follows the authoritative solid state.
  for (const door of map.walls.filter(s => s.kind === 'strikeDoor')) {
    const assembly = new THREE.Group(); assembly.name = door.dynamicId;
    const p = toWorld(door.x + door.width / 2, door.y + door.height / 2, (door.bottom + door.top) / 2);
    const body = addMesh(new RoundedBoxGeometry(door.width * SCALE, door.top - door.bottom,
      door.height * SCALE, 2, .06), materials.red, `${door.dynamicId}-slab`, { parent: assembly, castShadow: true, occluder: true });
    body.position.copy(p);
    for (let i = -2; i <= 2; i++) {
      const rib = addMesh(new THREE.BoxGeometry(door.width * SCALE + .18, .12, door.height * SCALE + .14),
        materials.edge, `${door.dynamicId}-rib`, { parent: assembly });
      rib.position.set(p.x, p.y + i * Math.max(.3, (door.top - door.bottom) / 5), p.z);
    }
    group.add(assembly);
    // The luminous jamb remains in place after the shutter retracts, turning
    // every newly opened passage into a conspicuous route landmark.
    const vertical=door.width<=door.height,frameMaterial=new THREE.MeshStandardMaterial({
      color:0x5e111c,emissive:0xff263f,emissiveIntensity:.55,metalness:.35,roughness:.32});
    const cx=door.x+door.width/2,cy=door.y+door.height/2,bar=.16;
    const jambInset=bar/(2*SCALE),frameOutset=.36;
    const frameParts=[];
    if(vertical) {
      // Jambs occupy the aperture edge instead of lying over the adjacent
      // shell. Their face projects 18 cm beyond the wall/door skin, so the
      // bright emissive outline cannot depth-fight either surface.
      for(const y of [door.y+jambInset,door.y+door.height-jambInset]) {
        const p=toWorld(cx,y,(door.bottom+door.top)/2);
        frameParts.push(boxGeometry(door.width*SCALE+frameOutset,door.top-door.bottom,bar,p.x,p.y,p.z,.025));
      }
      const p=toWorld(cx,cy,door.top-bar/2);
      frameParts.push(boxGeometry(door.width*SCALE+frameOutset,bar,
        Math.max(bar,door.height*SCALE-bar*2),p.x,p.y,p.z,.025));
    } else {
      for(const x of [door.x+jambInset,door.x+door.width-jambInset]) {
        const p=toWorld(x,cy,(door.bottom+door.top)/2);
        frameParts.push(boxGeometry(bar,door.top-door.bottom,door.height*SCALE+frameOutset,p.x,p.y,p.z,.025));
      }
      const p=toWorld(cx,cy,door.top-bar/2);
      frameParts.push(boxGeometry(Math.max(bar,door.width*SCALE-bar*2),bar,
        door.height*SCALE+frameOutset,p.x,p.y,p.z,.025));
    }
    const frameGeometry=mergeGeometries(frameParts.map(geometry=>{
      const result=geometry.index?geometry.toNonIndexed():geometry;if(result!==geometry)geometry.dispose();return result;
    }),false);
    frameParts.forEach(geometry=>{if(geometry!==frameGeometry)geometry.dispose();});
    const gateway=addMesh(frameGeometry,frameMaterial,`${door.dynamicId}-route-frame`,
      {receiveShadow:false});
    dynamic.set(door.dynamicId,{type:'door',assembly,body,gateway,frameMaterial,baseY:0,
      closedY:0,openY:door.top-door.bottom+.8,progress:door.nonSolid?1:0});
  }

  // Authored floor chevrons are sparse navigational language, not decoration:
  // inactive legs stay dim while the current handoff pulses at full value.
  for(const guide of map.routeGuides||[]) {
    // Direction is communicated by the world-space HUD beacon and physical
    // facility signage. Painted chevrons made the authored space look like a
    // tutorial course, so route data remains authoritative without rendering
    // literal arrows onto the floor.
    if(guide.kind==='arrow')continue;
    let geometry;
    if(guide.kind==='strip') {
      // Long interrupted strips bridge the visual gap between decision-point
      // chevrons without painting a continuous arcade-game trail.
      geometry=new THREE.PlaneGeometry(1.8,.16);geometry.rotateX(-Math.PI/2);
    } else if(guide.kind==='beacon') {
      geometry=new THREE.RingGeometry(.34,.51,20);geometry.rotateX(-Math.PI/2);
    } else {
      const shape=new THREE.Shape();
      shape.moveTo(-.82,-.16);shape.lineTo(.18,-.16);shape.lineTo(.18,-.42);
      shape.lineTo(.92,0);shape.lineTo(.18,.42);shape.lineTo(.18,.16);
      shape.lineTo(-.82,.16);shape.closePath();
      geometry=new THREE.ShapeGeometry(shape);geometry.rotateX(-Math.PI/2);
    }
    const guideMaterial=new THREE.MeshBasicMaterial({color:0x8b1d2d,transparent:true,opacity:.18,
      blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false,side:THREE.DoubleSide});
    const mesh=addMesh(geometry,guideMaterial,guide.id,{receiveShadow:false});
    mesh.position.copy(toWorld(guide.x,guide.y,(guide.height??0)+.06));
    const ramp=(map.terrain||[]).find(surface=>surface.kind==='ramp'&&guide.x>=surface.x&&
      guide.x<=surface.x+surface.width&&guide.y>=surface.y&&guide.y<=surface.y+surface.height);
    if(ramp) {
      // Decals on steep foundry ramps use the same continuous plane as the
      // renderer/support code. A horizontal quad would cut into the ramp at
      // one end and float at the other, making the guidance itself flicker.
      const rise=(ramp.top-ramp.bottom)*(ramp.reverse?-1:1);
      const gx=ramp.axis==='x'?rise/(ramp.width*SCALE):0;
      const gz=ramp.axis==='y'?rise/(ramp.height*SCALE):0;
      const normal=new THREE.Vector3(-gx,1,-gz).normalize();
      const forward=new THREE.Vector3(Math.cos(guide.angle||0),0,Math.sin(guide.angle||0));
      forward.addScaledVector(normal,-forward.dot(normal)).normalize();
      const across=new THREE.Vector3().crossVectors(forward,normal).normalize();
      const basis=new THREE.Matrix4().makeBasis(forward,normal,across);
      mesh.quaternion.setFromRotationMatrix(basis);
    } else mesh.rotation.y=-(guide.angle||0);
    mesh.scale.set(guide.scale||1,guide.scale||1,guide.scale||1);
    mesh.renderOrder=3;routeVisuals.push({guide,mesh,material:guideMaterial});
  }

  // One reusable world-space objective marker follows authoritative mission
  // state. It is tall enough to read across machinery, but never affects
  // collision or enemy visibility.
  {
    const root=new THREE.Group();root.name='red-vault-objective-beacon';root.visible=false;
    const beamMaterial=new THREE.MeshBasicMaterial({color:0xff3c4f,transparent:true,opacity:.18,
      blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false});
    const beam=addMesh(new THREE.CylinderGeometry(.055,.2,5.2,8,1,true),beamMaterial,
      'red-vault-objective-beam',{parent:root,receiveShadow:false});beam.position.y=2.6;
    const ringMaterial=new THREE.MeshBasicMaterial({color:0xff775e,transparent:true,opacity:.92,
      blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false});
    const ring=addMesh(new THREE.TorusGeometry(.68,.065,7,24),ringMaterial,
      'red-vault-objective-ring',{parent:root,receiveShadow:false});ring.rotation.x=Math.PI/2;ring.position.y=.08;
    const pointer=addMesh(new THREE.ConeGeometry(.24,.48,6),ringMaterial,
      'red-vault-objective-pointer',{parent:root,receiveShadow:false});pointer.position.y=3.9;pointer.rotation.z=Math.PI;
    group.add(root);objectiveBeacon={root,beam,ring,pointer,beamMaterial,ringMaterial};
  }

  // Mission controls are real wall-mounted objects at the authoritative aim
  // points. They deliberately add no collision: each sits within its wall or
  // door-jamb envelope, so walking past one cannot create a decorative snag.
  for(const encounter of map.strikeEncounters||map.encounters||[]) {
    const definitions=Array.isArray(encounter.objectives)?encounter.objectives:
      encounter.interaction?[{interaction:encounter.interaction}]:[];
    for(const definition of definitions) {
      const control=definition?.interaction;if(!control?.id||interactionPanels.has(control.id))continue;
      const root=new THREE.Group();root.name=`${control.id}-panel`;
      root.position.copy(toWorld(control.x,control.y,control.height));
      root.rotation.y=Math.PI/2-(control.normalAngle||0);
      const back=addMesh(new RoundedBoxGeometry(1.02,1.42,.18,3,.07),materials.black,
        `${control.id}-backplate`,{parent:root,castShadow:true});back.position.z=-.035;
      const casing=addMesh(new RoundedBoxGeometry(.84,1.2,.16,3,.065),materials.edge,
        `${control.id}-casing`,{parent:root,castShadow:true});casing.position.z=.075;
      const screenMaterial=material('#26080d',.31,.2,{emissive:'#c51f35',emissiveIntensity:1.25});
      const screen=addMesh(new RoundedBoxGeometry(.61,.58,.055,3,.045),screenMaterial,
        `${control.id}-screen`,{parent:root,receiveShadow:false});screen.position.set(0,.2,.185);
      const fillMaterial=material('#ff8a51',.2,.15,{emissive:'#ff3a2e',emissiveIntensity:5.8});
      const fill=addMesh(new RoundedBoxGeometry(.49,.4,.018,2,.02),fillMaterial,
        `${control.id}-progress`,{parent:root,receiveShadow:false});fill.position.set(0,.2,.22);
      fill.scale.y=.025;fill.visible=false;
      const dialMaterial=material('#50111b',.38,.21,{emissive:'#ff4051',emissiveIntensity:2.2});
      const dial=addMesh(new THREE.TorusGeometry(.19,.047,7,20),dialMaterial,
        `${control.id}-dial`,{parent:root,receiveShadow:false});dial.position.set(0,-.36,.22);
      const statusParts=[];
      for(const x of [-.29,0,.29]) {
        const bulb=new THREE.SphereGeometry(.055,8,6);bulb.translate(x,.55,.22);statusParts.push(bulb);
      }
      const statusMaterial=material('#160609',.3,.2,{emissive:'#721020',emissiveIntensity:.45});
      const statusGeometry=mergeGeometries(statusParts,false);statusParts.forEach(part=>part.dispose());
      const status=addMesh(statusGeometry,statusMaterial,`${control.id}-status`,
        {parent:root,receiveShadow:false});
      group.add(root);interactionPanels.set(control.id,
        {encounter,root,screen,screenMaterial,fill,fillMaterial,dial,dialMaterial,status,statusMaterial});
    }
  }

  // Shootable mission machinery is visually and semantically distinct from
  // an E console. The reactor projects from the wall up to its authoritative
  // ray hitbox, while remaining inside the shell's existing body collision.
  for(const encounter of map.strikeEncounters||map.encounters||[]) {
    const definitions=Array.isArray(encounter.objectives)?encounter.objectives:
      encounter.destructible?[{destructible:encounter.destructible}]:[];
    for(const definition of definitions) {
      const target=definition?.destructible;
      if(!target?.id||destructibles.has(target.id))continue;
      const root=new THREE.Group();root.name=`${target.id}-reactor`;
      root.position.copy(toWorld(target.x,target.y,target.height));
      root.rotation.y=Math.PI/2-(target.normalAngle||0);
      // These two stationary black fixtures share one draw call. Keeping the
      // health trough physically proud of the backplate also prevents the
      // fill from fighting the wall-facing surface as it shrinks.
      const backGeometry=new RoundedBoxGeometry(2.62,2.42,.2,3,.07);
      backGeometry.translate(0,0,-.03);
      const healthTrackGeometry=new RoundedBoxGeometry(2.2,.18,.07,2,.025);
      healthTrackGeometry.translate(0,-1.08,.43);
      const fixtureGeometry=mergeGeometries([backGeometry,healthTrackGeometry],false);
      backGeometry.dispose();healthTrackGeometry.dispose();
      addMesh(fixtureGeometry,materials.black,`${target.id}-backplate`,{parent:root,castShadow:true});
      const intact=new THREE.Group();intact.name=`${target.id}-intact`;root.add(intact);
      const frameParts=[];
      for(const x of [-1.08,1.08]) {
        frameParts.push(boxGeometry(.22,2.08,.56,x,0,.24,.065));
      }
      for(const y of [-.94,.94]) {
        frameParts.push(boxGeometry(2.12,.2,.54,0,y,.25,.06));
      }
      const frameGeometry=mergeGeometries(frameParts,false);frameParts.forEach(part=>part.dispose());
      addMesh(frameGeometry,materials.edge,`${target.id}-frame`,{parent:intact,castShadow:true});
      const chamberMaterial=material('#60120d',.32,.18,{emissive:'#ff351d',emissiveIntensity:5.8});
      const chamber=addMesh(new THREE.CylinderGeometry(.47,.47,1.48,18),chamberMaterial,
        `${target.id}-core`,{parent:intact,receiveShadow:false});chamber.position.z=.48;
      const glassMaterial=new THREE.MeshPhysicalMaterial({color:'#ffb06b',metalness:.08,roughness:.12,
        transparent:true,opacity:.42,transmission:.18,emissive:'#ff431d',emissiveIntensity:1.4,
        depthWrite:false});
      const glass=addMesh(new THREE.CylinderGeometry(.61,.61,1.62,20,1,true),glassMaterial,
        `${target.id}-containment`,{parent:intact,receiveShadow:false});glass.position.z=.47;
      const ringParts=[];
      for(const y of [-.7,0,.7]) {
        const ring=new THREE.TorusGeometry(.67,.065,7,22);ring.rotateX(Math.PI/2);ring.translate(0,y,.47);
        ringParts.push(ring);
      }
      const ringGeometry=mergeGeometries(ringParts,false);ringParts.forEach(part=>part.dispose());
      addMesh(ringGeometry,materials.brass,`${target.id}-containment-rings`,{parent:intact});
      const healthMaterial=material('#ff532d',.28,.18,{emissive:'#ff351d',emissiveIntensity:4.4});
      const healthFill=addMesh(new RoundedBoxGeometry(2.04,.1,.075,2,.02),healthMaterial,
        `${target.id}-health-fill`,{parent:intact,receiveShadow:false});healthFill.position.set(0,-1.08,.47);
      const flashMaterial=new THREE.MeshBasicMaterial({color:'#fff2c2',transparent:true,opacity:0,
        blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false});
      const flash=addMesh(new THREE.IcosahedronGeometry(.83,1),flashMaterial,
        `${target.id}-impact-flash`,{parent:intact,receiveShadow:false});flash.position.z=.7;flash.visible=false;
      const wreck=new THREE.Group();wreck.name=`${target.id}-wreck`;wreck.visible=false;root.add(wreck);
      const wreckParts=[];
      for(const [x,y,angle] of [[-.72,.55,-.45],[.68,.48,.52],[-.58,-.5,.65],[.7,-.58,-.58]]) {
        const shard=new RoundedBoxGeometry(.18,.86,.26,2,.035);shard.rotateZ(angle);shard.translate(x,y,.16);
        wreckParts.push(shard);
      }
      const deadCore=new THREE.CylinderGeometry(.43,.48,.7,12);deadCore.rotateZ(.2);deadCore.translate(.08,-.3,.28);
      wreckParts.push(deadCore);
      const wreckMergeParts=wreckParts.map(geometry=>{
        const result=geometry.index?geometry.toNonIndexed():geometry;
        if(result!==geometry)geometry.dispose();return result;
      });
      const wreckGeometry=mergeGeometries(wreckMergeParts,false);wreckMergeParts.forEach(part=>part.dispose());
      addMesh(wreckGeometry,materials.black,`${target.id}-wreckage`,{parent:wreck,castShadow:true});
      group.add(root);destructibles.set(target.id,{encounter,target,root,intact,wreck,chamberMaterial,
        glassMaterial,healthFill,healthMaterial,flash,flashMaterial,hitFlash:0,hitSeed:0});
    }
  }

  // Cargo cover.
  for (const cargo of map.walls.filter(s => s.kind === 'cargo')) {
    const p = toWorld(cargo.x + cargo.width / 2, cargo.y + cargo.height / 2, (cargo.bottom + cargo.top) / 2);
    const crate = new THREE.Group(); crate.position.copy(p); crate.name = cargo.id;
    addMesh(new RoundedBoxGeometry(cargo.width * SCALE, cargo.top - cargo.bottom,
      cargo.height * SCALE, 2, .08), materials.shellInset, `${cargo.id}-case`, { parent: crate, castShadow: true });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const corner = addMesh(new THREE.BoxGeometry(.09, cargo.top - cargo.bottom + .06, .09), materials.brass,
        `${cargo.id}-corner`, { parent: crate });
      corner.position.set(sx * (cargo.width * SCALE / 2 - .05), 0, sz * (cargo.height * SCALE / 2 - .05));
    }
    const stencil = addMesh(new THREE.PlaneGeometry(Math.min(1.1, cargo.width * SCALE * .55), .18), materials.redGlow,
      `${cargo.id}-stencil`, { parent: crate, receiveShadow: false });
    stencil.position.set(0, .1, -cargo.height * SCALE / 2 - .035); stencil.rotation.y = Math.PI;
    group.add(crate);
  }

  // Conveyors: rigid collision frame, animated belt slats and weapon blanks.
  for (const conveyor of map.architecture.conveyors) {
    const root = new THREE.Group(); root.name = conveyor.id;
    const p = toWorld(conveyor.x + conveyor.width / 2, conveyor.y + conveyor.height / 2, conveyor.bottom);
    root.position.copy(p);
    const alongY = conveyor.height >= conveyor.width;
    const frameW = conveyor.width * SCALE, frameD = conveyor.height * SCALE;
    const standHeight = conveyor.top - conveyor.bottom;
    const slatThickness = .035, beltThickness = .11;
    const frameHeight = Math.max(.32, standHeight - .16);
    const slatY = standHeight - slatThickness / 2;
    const beltY = slatY - slatThickness / 2 - .01 - beltThickness / 2;
    const frame = addMesh(new RoundedBoxGeometry(frameW, frameHeight, frameD, 2, .09), materials.black,
      `${conveyor.id}-frame`, { parent: root, castShadow: true }); frame.position.y = frameHeight / 2;
    const belt = addMesh(new THREE.BoxGeometry(frameW - .18, beltThickness, frameD - .18), materials.shellInset,
      `${conveyor.id}-belt`, { parent: root }); belt.position.y = beltY;
    const slats = [];
    for (let i = 0; i < 12; i++) {
      const slat = addMesh(new THREE.BoxGeometry(alongY ? frameW - .12 : .045, slatThickness,
        alongY ? .045 : frameD - .12), i % 3 ? materials.edge : materials.red,
      `${conveyor.id}-slat`, { parent: root, receiveShadow: false });
      slat.position.y = slatY; slats.push(slat);
    }
    const blank = addMesh(new THREE.CapsuleGeometry(.12, .72, 3, 8), materials.brightRed,
      `${conveyor.id}-weapon-blank`, { parent: root });
    blank.rotation.z = Math.PI / 2; blank.position.y = 1.02;
    group.add(root); animated.push({ type: 'conveyor', root, conveyor, slats, blank, alongY });
  }

  // Articulated arms are proper joint hierarchies with anchored bases.
  for (const arm of map.architecture.machines.filter(m => m.type === 'assemblyArm')) {
    const root = new THREE.Group(); root.name = arm.id; root.position.copy(toWorld(arm.x, arm.y, arm.bottom));
    // The plinth is exactly the authored 2.2 m collider. Articulated links
    // begin just above body clearance, so the stationary collision never
    // creates an invisible cap and the moving arm never ghosts through a body.
    const base = addMesh(new THREE.CylinderGeometry(1.55, 1.55, 2.2, 12), materials.black,
      `${arm.id}-base`, { parent: root, castShadow: true }); base.position.y = 1.1;
    const shoulder = new THREE.Group(); shoulder.position.y = 2.2; root.add(shoulder);
    const pivot = addMesh(new THREE.CylinderGeometry(.37, .37, .58, 12), materials.red,
      `${arm.id}-shoulder`, { parent: shoulder }); pivot.rotation.z = Math.PI / 2;
    const upper = addMesh(new RoundedBoxGeometry(.38, 2.5, .42, 2, .09), materials.edge,
      `${arm.id}-upper`, { parent: shoulder }); upper.position.y = 1.22;
    const elbow = new THREE.Group(); elbow.position.y = 2.35; shoulder.add(elbow);
    const fore = addMesh(new RoundedBoxGeometry(.32, 2.0, .34, 2, .075), materials.red,
      `${arm.id}-forearm`, { parent: elbow }); fore.position.y = .9;
    const tool = addMesh(new THREE.CylinderGeometry(.28, .14, .65, 8), materials.redGlow,
      `${arm.id}-welder`, { parent: elbow, receiveShadow: false }); tool.position.y = 1.95;
    group.add(root); animated.push({ type: 'arm', root, shoulder, elbow, tool, phase: arm.phase, facing: arm.facing });
  }

  // Press frames use their two exact collision legs and open traversable bays.
  for (const press of map.architecture.machines.filter(m => m.type === 'pressFrame')) {
    const root = new THREE.Group(); root.name = press.id;
    for (const id of press.collisionIds) {
      const leg = map.walls.find(s => s.id === id); if (!leg) continue;
      const p = toWorld(leg.x + leg.width / 2, leg.y + leg.height / 2, (leg.bottom + leg.top) / 2);
      const mesh = addMesh(new RoundedBoxGeometry(leg.width * SCALE, leg.top - leg.bottom,
        leg.height * SCALE, 2, .05), materials.red, `${id}-visual`, { parent: root, castShadow: true });
      mesh.position.copy(p);
      for (let h = leg.bottom + 2; h < leg.top - 1; h += 3.2) {
        const brace = addMesh(new THREE.BoxGeometry(leg.width * SCALE + .08, .16, leg.height * SCALE + .08),
          materials.edge, `${id}-brace`, { parent: root }); brace.position.copy(toWorld(leg.x + leg.width / 2, leg.y + leg.height / 2, h));
      }
    }
    const x = press.x + 13, header = addMesh(new RoundedBoxGeometry(2.25, 1.45, 25.5, 2, .08),
      materials.black, `${press.id}-header`, { parent: root, castShadow: true });
    header.position.copy(toWorld(x, press.y, press.top - .7));
    const ram = addMesh(new THREE.CylinderGeometry(.42, .7, 4.8, 12), materials.edge,
      `${press.id}-ram`, { parent: root }); ram.position.copy(toWorld(x, press.y, press.top - 4));
    group.add(root); animated.push({ type: 'press', ram, phase: press.x * .01 });
  }

  // Furnace stacks and the recessed molten channel.
  for (const furnace of map.architecture.machines.filter(m => m.type === 'furnaceStack')) {
    const root = new THREE.Group(); root.name = furnace.id; root.position.copy(toWorld(furnace.x, furnace.y, furnace.bottom));
    const body = addMesh(new THREE.CylinderGeometry(furnace.radius * SCALE, furnace.radius * SCALE,
      furnace.top - furnace.bottom, 14), materials.shellInset, `${furnace.id}-body`, { parent: root, castShadow: true });
    body.position.y = (furnace.top - furnace.bottom) / 2;
    for (let h = 1.2; h < furnace.top - furnace.bottom; h += 2.3) {
      const stackRadius=furnace.radius*SCALE,bandRadius=.08;
      const band = addMesh(new THREE.TorusGeometry(stackRadius+.015,bandRadius,6,14), materials.brass,
        `${furnace.id}-band`, { parent: root }); band.rotation.x = Math.PI / 2; band.position.y = h;
    }
    const mouth = addMesh(new THREE.CylinderGeometry(furnace.radius * SCALE * .72, furnace.radius * SCALE * .72,
      .12, 14), materials.orangeGlow, `${furnace.id}-mouth`, { parent: root, receiveShadow: false });
    mouth.position.y = .5; mouth.rotation.x = Math.PI / 2; mouth.position.z = furnace.radius * SCALE * 1.08;
    group.add(root); animated.push({ type: 'furnace', root, mouth, phase: furnace.x * .02 });
  }
  const molten = map.architecture.machines.find(m => m.type === 'moltenChannel');
  if (molten) {
    const p = toWorld(molten.x + molten.width / 2, molten.y + molten.height / 2, molten.top);
    const surface = addMesh(new THREE.PlaneGeometry(molten.width * SCALE - .1, molten.height * SCALE - .1),
      materials.orangeGlow, 'molten-channel-surface', { receiveShadow: false });
    surface.rotation.x = -Math.PI / 2; surface.position.copy(p); surface.position.y += .04;
    animated.push({ type: 'molten', surface });
  }

  // Pressure-cycle fixtures are the readable source of the authoritative
  // furnace pulse volumes. A persistent warning collar precedes a short,
  // violent white-hot jet; all geometry/materials are allocated once here.
  const pressureDef = map.architecture.machines.find(m => m.type === 'pressureVents');
  if (pressureDef) pressureDef.vents.forEach((vent, index) => {
    const root = new THREE.Group(); root.name = `pressure-vent-${index}`;
    root.position.copy(toWorld(vent.x, vent.y, pressureDef.bottom));
    const pedestal = addMesh(new THREE.CylinderGeometry(.7, .92, .8, 12), materials.black,
      `${root.name}-pedestal`, { parent: root, castShadow: true }); pedestal.position.y = .4;
    const throat = addMesh(new THREE.CylinderGeometry(.5, .62, .42, 12), materials.brass,
      `${root.name}-throat`, { parent: root }); throat.position.y = 1;
    const warningMaterial = materials.redGlow.clone(); warningMaterial.emissiveIntensity = .5;
    const warning = addMesh(new THREE.TorusGeometry(.72, .08, 7, 18), warningMaterial,
      `${root.name}-warning`, { parent: root, receiveShadow: false });
    warning.rotation.x = Math.PI / 2; warning.position.y = 1.22;
    const jetMaterial = new THREE.MeshBasicMaterial({ color: '#fff1c7', transparent: true,
      opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const jet = addMesh(new THREE.ConeGeometry(1.15, 4.8, 14, 1, true), jetMaterial,
      `${root.name}-jet`, { parent: root, receiveShadow: false }); jet.position.y = 3.55;
    const heatMaterial = new THREE.MeshBasicMaterial({ color: '#ff4b19', transparent: true,
      opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const heat = addMesh(new THREE.SphereGeometry(1.28, 10, 7), heatMaterial,
      `${root.name}-heat-volume`, { parent: root, receiveShadow: false }); heat.position.y = 2.55;
    group.add(root);
    animated.push({ type: 'pressureVent', root, warning, jet, heat,
      hazard: map.hazards?.[index], phase: index * 2.31 });
  });

  // Forge shaft rotor, concentric structural rings and moving emissive vanes.
  const rotorDef = map.architecture.machines.find(m => m.type === 'forgeRotor');
  if (rotorDef) {
    const root = new THREE.Group(); root.name = rotorDef.id; root.position.copy(toWorld(rotorDef.x, rotorDef.y, rotorDef.bottom));
    const core = addMesh(new THREE.CylinderGeometry(3.4, 3.4, rotorDef.top - rotorDef.bottom, 16), materials.black,
      'forge-rotor-column', { parent: root, castShadow: true }); core.position.y = (rotorDef.top - rotorDef.bottom) / 2;
    const cage = new THREE.Group(); root.add(cage);
    for (const h of [4, 10, 16, 22]) {
      const ring = addMesh(new THREE.TorusGeometry(4.9, .22, 8, 28), h % 8 ? materials.red : materials.edge,
        'forge-rotor-ring', { parent: cage }); ring.rotation.x = Math.PI / 2; ring.position.y = h;
      for (let i = 0; i < 6; i++) {
        const angle = i * Math.PI / 3;
        const vane = addMesh(new RoundedBoxGeometry(3.3, .25, .52, 2, .05), materials.redGlow,
          'forge-rotor-vane', { parent: cage, receiveShadow: false });
        vane.position.set(Math.cos(angle) * 3.0, h, Math.sin(angle) * 3.0); vane.rotation.y = -angle;
      }
    }
    group.add(root); animated.push({ type: 'rotor', root, cage });
  }
  for (const ringDef of map.architecture.beams.filter(b => b.type === 'shaftRing')) {
    const p = toWorld(ringDef.x, ringDef.y, ringDef.bottom);
    const ring = addMesh(new THREE.TorusGeometry(ringDef.radius * SCALE, .18, 7, 32), materials.edge,
      ringDef.id, { castShadow: true }); ring.position.copy(p); ring.rotation.x = Math.PI / 2;
  }

  // Counterweighted freight hoist. The lift deck's top is always exactly the
  // authoritative `kind: lift` top; cage members begin above that surface.
  const hoistDef = map.architecture.machines.find(m => m.type === 'freightHoist');
  if (hoistDef) {
    const lift = map.terrain.find(s => s.id === hoistDef.liftId);
    const root = new THREE.Group(); root.name = hoistDef.id;
    const cage = new THREE.Group(); cage.name = 'forge-hoist-cage'; root.add(cage);
    cage.position.copy(toWorld(lift.x+lift.width/2,lift.y+lift.height/2,lift.top));
    const deckThickness=lift.top-lift.bottom;
    // At either dock the moving deck is physically flush with its landing.
    // A deterministic depth bias keeps that necessary alignment stable
    // without lifting the visible surface above authoritative foot height.
    const hoistDeckMaterial=materials.grate.clone();
    hoistDeckMaterial.polygonOffset=true;hoistDeckMaterial.polygonOffsetFactor=-1;
    hoistDeckMaterial.polygonOffsetUnits=-1;
    const deck = addMesh(new RoundedBoxGeometry(lift.width*SCALE,deckThickness,lift.height*SCALE,2,.04),
      hoistDeckMaterial,'forge-hoist-deck',{parent:cage,castShadow:true});
    deck.position.y=-deckThickness/2;
    const cageMembers=map.terrain.filter(surface=>surface.liftId===lift.id);
    for(const member of cageMembers.filter(surface=>surface.kind==='liftCage')) {
      const post=addMesh(new THREE.BoxGeometry(member.width*SCALE,
        member.liftTopOffset-member.liftBottomOffset,member.height*SCALE),materials.edge,
      member.id,{parent:cage});
      post.position.set((member.x+member.width/2-(lift.x+lift.width/2))*SCALE,
        (member.liftBottomOffset+member.liftTopOffset)/2,
        (member.y+member.height/2-(lift.y+lift.height/2))*SCALE);
    }
    const canopyDef=cageMembers.find(surface=>surface.kind==='liftCageRoof');
    const canopy=addMesh(new RoundedBoxGeometry(canopyDef.width*SCALE,
      canopyDef.liftTopOffset-canopyDef.liftBottomOffset,canopyDef.height*SCALE,2,.035),
    materials.red,'forge-hoist-canopy',{parent:cage});
    canopy.position.set((canopyDef.x+canopyDef.width/2-(lift.x+lift.width/2))*SCALE,
      (canopyDef.liftBottomOffset+canopyDef.liftTopOffset)/2,
      (canopyDef.y+canopyDef.height/2-(lift.y+lift.height/2))*SCALE);
    const counter = addMesh(new RoundedBoxGeometry(1.6, 4.2, 2.2, 2, .08), materials.black,
      'forge-hoist-counterweight', { parent: root, castShadow: true });
    counter.position.copy(toWorld(hoistDef.counterweightX, lift.y + lift.height / 2, lift.maxTop + 4));
    for (const rail of map.walls.filter(s => hoistDef.collisionIds.includes(s.id) && s.kind === 'hoistRail')) {
      const p = toWorld(rail.x + rail.width / 2, rail.y + rail.height / 2, (rail.bottom + rail.top) / 2);
      const mesh = addMesh(new THREE.BoxGeometry(rail.width * SCALE, rail.top - rail.bottom,
        rail.height * SCALE), materials.edge, rail.id, { parent: root, castShadow: true }); mesh.position.copy(p);
    }
    group.add(root); animated.push({ type: 'hoist', root, cage, counter, lift, hoistDef });
  }

  // Hinged bridge visual. Closed = vertical at shaft lip; lowered = exact ramp.
  const bridgeDef = map.architecture.machines.find(m => m.type === 'hingedBridge');
  if (bridgeDef) {
    const root = new THREE.Group(); root.name = bridgeDef.id;
    const hinge = toWorld(bridgeDef.x, bridgeDef.y + bridgeDef.height / 2, bridgeDef.bottom);
    root.position.copy(hinge);
    const run = bridgeDef.width * SCALE, rise = bridgeDef.top - bridgeDef.bottom;
    const length = Math.hypot(run,rise), width = bridgeDef.height * SCALE;
    const loweredAngle=Math.atan2(rise,run);
    const bridgeSolid=map.terrain.find(surface=>surface.id==='command-bridge-deck');
    const finalTransform=new THREE.Matrix4().compose(hinge,
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),loweredAngle),
      new THREE.Vector3(1,1,1));
    const toBridgeLocal=finalTransform.clone().invert();
    // Bake the exact lowered world geometry back into hinge-local space. When
    // the animated root reaches loweredAngle the visible top, underside and
    // footprint are bit-for-bit aligned with the authoritative ramp.
    const deckGeometry=rampGeometry(bridgeSolid,false,'ends');deckGeometry.applyMatrix4(toBridgeLocal);
    addMesh(deckGeometry,materials.grate,'command-bridge-visual',
      {parent:root,castShadow:true,occluder:true});
    const assembly=rampAssemblyGeometries(bridgeSolid);
    rampAssemblyMetrics.push(assembly.metrics);
    for(const [geometries,mat,prefix] of [[assembly.edge,materials.edge,'channel'],
      [assembly.underframe,materials.black,'bearer'],
      [assembly.deckPlates,materials.grate,'deck-plate'],[assembly.nosings,materials.deckEdge,'nosing']]) {
      geometries.forEach(geometry=>geometry.applyMatrix4(toBridgeLocal));
      const merged=geometries.length===1?geometries[0]:mergeGeometries(geometries,false);
      if(!merged)throw new Error(`Unable to merge command bridge ${prefix}`);
      if(geometries.length>1)geometries.forEach(geometry=>geometry.dispose());
      addMesh(merged,mat,`command-bridge-${prefix}-assembly`,{parent:root});
    }
    // The old child boxes leaned with the bridge, so their visible tops were
    // about nine arena units outside world-vertical rail collision. These
    // pre-sheared prisms become exact sloped-base, vertical guards when down.
    for (const id of ['command-bridge-rail-north','command-bridge-rail-south']) {
      const rail=map.walls.find(solid=>solid.id===id);
      const lowerPanel=railPrismGeometry(rail,0,.46);lowerPanel.applyMatrix4(toBridgeLocal);
      const upperPanel=railPrismGeometry(rail,.57,.95);upperPanel.applyMatrix4(toBridgeLocal);
      const panels=mergeGeometries([lowerPanel,upperPanel],false);lowerPanel.dispose();upperPanel.dispose();
      addMesh(panels,materials.shellInset,id,{parent:root,castShadow:true,occluder:true});
      const cap=railPrismGeometry(rail,.95,1.15,.028);cap.applyMatrix4(toBridgeLocal);
      addMesh(cap,materials.edge,`${id}-cap`,{parent:root});
      const stripe=railPrismGeometry(rail,.46,.57,.032);stripe.applyMatrix4(toBridgeLocal);
      addMesh(stripe,materials.redGlow,`${id}-warning`,{parent:root,receiveShadow:false});
    }
    const pin = addMesh(new THREE.CylinderGeometry(.38, .38, width + .6, 12), materials.brass,
      'command-bridge-hinge', { parent: root }); pin.rotation.x = Math.PI / 2;
    root.rotation.z=Math.PI/2;
    group.add(root); dynamic.set('command-bridge', { type: 'bridge', root, progress: 0,loweredAngle });
  }

  // Command consoles and vault machinery.
  for (const consoleDef of map.architecture.machines.filter(m => m.type === 'commandConsole')) {
    const a = toWorld(consoleDef.ax, consoleDef.ay, consoleDef.bottom);
    const b = toWorld(consoleDef.bx, consoleDef.by, consoleDef.bottom);
    const root = new THREE.Group(); root.name = consoleDef.id;
    // The movement/hitscan footprint is a 22-unit capsule. Render that same
    // extruded rounded plan shape, including its end radii; a horizontal
    // cylinder would leave invisible semicircular blockers at both ends.
    verticalCapsuleGeometries(consoleDef.ax,consoleDef.ay,consoleDef.bx,consoleDef.by,
      22*SCALE,consoleDef.bottom,consoleDef.top).forEach((geometry,index)=>
      addMesh(geometry,materials.black,`${consoleDef.id}-base-${index}`,
        { parent: root, castShadow: true }));
    const screenPos = a.clone().lerp(b, .5); screenPos.y = consoleDef.top + .08;
    const screen = addMesh(new RoundedBoxGeometry(2.4, .12, .9, 2, .04), materials.redGlow,
      `${consoleDef.id}-screen`, { parent: root, receiveShadow: false }); screen.position.copy(screenPos); screen.rotation.x = -.18;
    group.add(root);
  }
  const vaultDef = map.architecture.machines.find(m => m.type === 'vaultCore');
  if (vaultDef) {
    const root = new THREE.Group(); root.name = vaultDef.id; root.position.copy(toWorld(vaultDef.x, vaultDef.y, vaultDef.bottom));
    const core = addMesh(new THREE.CylinderGeometry(vaultDef.radius*SCALE,
      vaultDef.radius*SCALE,vaultDef.top-vaultDef.bottom,18),materials.black,
    'red-vault-core-column', { parent: root, castShadow: true }); core.position.y = (vaultDef.top - vaultDef.bottom) / 2;
    const energy = addMesh(new THREE.IcosahedronGeometry(1.75, 2), materials.redGlow,
      'red-vault-heart', { parent: root, receiveShadow: false }); energy.position.y = 8.1;
    const rings = new THREE.Group(); rings.position.y = 8.1; root.add(rings);
    for (const [i, radius] of [2.5, 3.6, 4.8].entries()) {
      const ring = addMesh(new THREE.TorusGeometry(radius, .13 + i * .03, 8, 30), i === 1 ? materials.brass : materials.brightRed,
        'red-vault-core-ring', { parent: rings });
      // Keep physical-looking rings above player clearance. Their subtle
      // cant still reads as articulated machinery without ghosting through
      // the 42 m boss routes below.
      ring.rotation.x=Math.PI/2;
    }
    group.add(root); animated.push({ type: 'vaultCore', root, core, energy, rings });
  }
  const crownDef = map.architecture.machines.find(m => m.type === 'rotatingCrown');
  if (crownDef) {
    const root = new THREE.Group(); root.name = crownDef.id; root.position.copy(toWorld(crownDef.x, crownDef.y, crownDef.bottom));
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4;
      const arm = addMesh(new RoundedBoxGeometry(6.5, .42, .58, 2, .07), i % 2 ? materials.red : materials.edge,
        'vault-crown-arm', { parent: root, castShadow: true });
      arm.position.set(Math.cos(angle) * 3.2, 0, Math.sin(angle) * 3.2); arm.rotation.y = -angle;
    }
    group.add(root); animated.push({ type: 'crown', root });
  }

  // Text signage uses canvas textures; only a handful exist and are disposed
  // with the environment.
  for (const sign of map.architecture.signs) {
    let texture=null,mat=materials.redGlow;
    if(typeof document!=='undefined') {
      const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 96;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#09090b'; ctx.fillRect(0, 0, 512, 96);
      ctx.fillStyle = sign.color; ctx.fillRect(0, 0, 12, 96);
      ctx.font = '700 36px sans-serif'; ctx.fillStyle = '#f2eae5'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(sign.text, 270, 50);
      texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
      mat = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
    }
    const plane = addMesh(new THREE.PlaneGeometry(6.4, 1.2), mat, sign.id, { receiveShadow: false });
    plane.position.copy(toWorld(sign.x, sign.y, sign.bottom));
    plane.rotation.y = sign.facing === 'east' ? Math.PI / 2 : sign.facing === 'west' ? -Math.PI / 2 : 0;
    // Signs sit visibly proud of their mounting wall. Keeping their plane on
    // the exact structural face caused depth fighting on long sight-lines.
    if(sign.facing==='east')plane.position.x+=.04;
    else if(sign.facing==='west')plane.position.x-=.04;
    else if(sign.facing==='south')plane.position.z+=.04;
    else plane.position.z-=.04;
    if(texture)plane.userData.ownedTextures = [texture];
  }

  // Luminaires provide visible sources. Only five bounded non-shadowed point
  // lights are used for the whole Strike; emissive strips carry the rest.
  for (const light of map.architecture.lights.slice(0, 5)) {
    const p = toWorld(light.x, light.y, light.height);
    const lamp = addMesh(new THREE.CylinderGeometry(.22, .22, 3.2, 8), materials.whiteGlow,
      `${light.id}-fixture`, { receiveShadow: false }); lamp.position.copy(p); lamp.rotation.z = Math.PI / 2;
    const source = new THREE.PointLight(light.color, light.intensity, light.radius * SCALE, 1.7);
    source.position.copy(p); source.castShadow = false; source.userData.baseIntensity = light.intensity;
    lightObjects.push(source); group.add(source);
  }

  // Out-of-reach massing is silhouette-driven and intentionally darker than
  // gameplay architecture. It lives behind sealed shells, never as ghost cover.
  for (const mass of map.architecture.distantMassing) {
    const p = toWorld(mass.x + mass.width / 2, mass.y + mass.height / 2, mass.bottom);
    const root = new THREE.Group(); root.name = mass.id; root.position.copy(p);
    const body = addMesh(new THREE.BoxGeometry(mass.width * SCALE, mass.top - mass.bottom,
      mass.height * SCALE), materials.black, `${mass.id}-body`, { parent: root });
    body.position.y = (mass.top - mass.bottom) / 2;
    const stacks = Math.max(2, Math.floor(mass.width / 180));
    for (let i = 0; i < stacks; i++) {
      const stack = addMesh(new THREE.CylinderGeometry(.55, .8, mass.top * .8, 8), materials.shell,
        `${mass.id}-stack`, { parent: root });
      stack.position.set((i - (stacks - 1) / 2) * mass.width * SCALE / stacks,
        mass.top * .6, (i % 2 ? -.2 : .2) * mass.height * SCALE);
      const beacon = addMesh(new THREE.CylinderGeometry(.58, .58, .1, 8), materials.darkGlow,
        `${mass.id}-beacon`, { parent: root, receiveShadow: false }); beacon.position.copy(stack.position); beacon.position.y += mass.top * .4;
    }
    group.add(root);
  }

  // Sparse atmospheric embers are one points draw, not hundreds of meshes.
  const emberCount = 220, positions = new Float32Array(emberCount * 3);
  for (let i = 0; i < emberCount; i++) {
    const seed = (i * 16807 % 2147483647) / 2147483647;
    positions[i * 3] = 5 + seed * 110;
    positions[i * 3 + 1] = 8 + ((i * 48271 % 2147483647) / 2147483647) * 44;
    positions[i * 3 + 2] = -5 + ((i * 69621 % 2147483647) / 2147483647) * 90;
  }
  const emberGeometry = new THREE.BufferGeometry(); emberGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const embers = new THREE.Points(emberGeometry, new THREE.PointsMaterial({ color: '#ff4a2a', size: .055,
    transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false }));
  embers.name = 'red-vault-embers'; group.add(embers);

  function normalizedState(value, fallback) {
    if(value==null)return fallback;
    if(typeof value==='object')return value.state??value.mode??value.value??fallback;
    return value;
  }
  function stateValue(key, fallback) {
    return normalizedState(missionState?.machineryState?.[key] ?? missionState?.machinery?.[key] ??
      missionState?.stateChanges?.[key],fallback);
  }
  function isOpen(key) {
    const state = missionState?.solidStates?.[key] ?? missionState?.dynamicState?.[key] ?? map.dynamicState?.[key];
    return state === 'open' || state === true || missionState?.openedIds?.includes?.(key) ||
      (key === 'command-bridge' && stateValue('bridge', '') === 'lowered');
  }
  function createReviveVisual(beacon) {
    const root=new THREE.Group();root.name=`strike-revive-${beacon.playerId}`;
    const glowMaterial=new THREE.MeshBasicMaterial({color:0x56cfff,transparent:true,opacity:.72,
      blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false});
    const beamMaterial=glowMaterial.clone();beamMaterial.opacity=.18;
    const beam=addMesh(new THREE.CylinderGeometry(.13,.42,3.8,12,1,true),beamMaterial,
      'revive-beacon-beam',{parent:root,receiveShadow:false});beam.position.y=1.8;
    const aura=addMesh(new THREE.SphereGeometry(.78,12,8),glowMaterial,'revive-beacon-aura',
      {parent:root,receiveShadow:false});aura.position.y=1.25;
    const ring=addMesh(new THREE.TorusGeometry(.92,.055,8,28),glowMaterial.clone(),
      'revive-beacon-ring',{parent:root,receiveShadow:false});ring.position.y=1.25;ring.rotation.x=Math.PI/2;
    const shell=new THREE.Group();shell.name='revive-shell';shell.position.y=1.25;root.add(shell);
    const core=addMesh(new THREE.SphereGeometry(.22,10,8),glowMaterial.clone(),'revive-shell-core',
      {parent:shell,receiveShadow:false});
    for(let i=0;i<4;i++) {
      const fin=addMesh(new RoundedBoxGeometry(.42,.18,.34,2,.055),materials.reviveShell,
        'revive-shell-fin',{parent:shell});
      const angle=i*Math.PI/2;fin.position.set(Math.cos(angle)*.38,Math.sin(angle)*.38,0);
      fin.rotation.z=angle;
    }
    group.add(root);
    return {root,beam,aura,ring,shell,glowMaterial,beamMaterial,beacon};
  }
  function syncReviveVisuals(beacons=[]) {
    const active=new Set();
    for(const beacon of beacons) {
      if(!beacon?.playerId||![beacon.x,beacon.y,beacon.height].every(Number.isFinite))continue;
      active.add(beacon.playerId);
      let visual=reviveVisuals.get(beacon.playerId);
      if(!visual){visual=createReviveVisual(beacon);reviveVisuals.set(beacon.playerId,visual);}
      visual.beacon=beacon;visual.root.visible=true;
      visual.root.position.copy(toWorld(beacon.x,beacon.y,beacon.height+.08));
      visual.baseY=visual.root.position.y;
    }
    for(const [id,visual] of reviveVisuals)if(!active.has(id))visual.root.visible=false;
  }
  function setMissionState(next) {
    missionState = next || missionState;
    syncReviveVisuals(missionState?.reviveBeacons||[]);
    if(Array.isArray(missionState.hazards)) {
      hazardStateById.clear();
      for(const state of missionState.hazards)if(state?.id)hazardStateById.set(state.id,state);
    }
  }

  function hitDestructible(id,shot={}) {
    const reactor=destructibles.get(id);if(!reactor||reactor.wreck.visible)return false;
    reactor.hitFlash=.16;
    reactor.hitSeed=(Number(shot.bulletId)||0)*.731+(Number(shot.strikeTargetDamage)||0);
    return true;
  }

  function update(time, viewed, scene) {
    const dt = Math.min(.05, update.previous == null ? 0 : time - update.previous); update.previous = time;
    const wallNow=Date.now();
    const encounter=(map.strikeEncounters||map.encounters||[])[missionState?.encounterIndex||0];
    for(const visual of reviveVisuals.values())if(visual.root.visible) {
      const progress=Math.max(0,Math.min(1,visual.beacon.progress||0));
      const pulse=.82+.18*Math.sin(time*6.8+(visual.beacon.playerId?.length||0));
      visual.root.position.y=visual.baseY+Math.sin(time*2.7)*.11;
      visual.aura.scale.setScalar(.9+pulse*.16+progress*.22);
      visual.aura.material.opacity=.28+pulse*.24+progress*.2;
      visual.ring.rotation.z+=dt*(1.15+progress*2.4);
      visual.ring.scale.setScalar(.92+progress*.2);
      visual.ring.material.opacity=.55+progress*.4;
      visual.shell.rotation.y+=dt*(.8+progress*1.8);
      visual.beamMaterial.opacity=.12+pulse*.1+progress*.12;
    }
    for (const [key,item] of dynamic) {
      const open = isOpen(key);
      const operating=missionState?.phase==='objective'&&encounter?.opens?.includes?.(key);
      // The console completes first; only then does the full assembly move.
      // A quick critically eased travel reads as a powered garage shutter,
      // rather than creeping open during the hold or teleporting when its
      // authoritative collider becomes non-solid.
      const target=open?1:0,travelRate=item.type==='door'?13:8.5;
      item.progress+=(target-item.progress)*(1-Math.exp(-travelRate*dt));
      if(Math.abs(target-item.progress)<.001)item.progress=target;
      const eased = item.progress * item.progress * (3 - 2 * item.progress);
      if (item.type === 'door') item.assembly.position.y = eased * item.openY;
      else if (item.type === 'bridge') item.root.rotation.z = item.loweredAngle +
        (1 - eased) * (Math.PI / 2 - item.loweredAngle);
      if(item.frameMaterial) {
        const pulse=.5+.5*Math.sin(time*5.5);
        const openedAt=missionState?.openedAtById?.[key];
        const justOpened=Number.isFinite(openedAt)&&wallNow-openedAt<6500;
        item.frameMaterial.emissiveIntensity=open
          ? (justOpened?7.6+pulse*4.2:4.8+pulse*2.4)
          : operating?2.4+pulse*2.2:.55;
        item.frameMaterial.color.setHex(open?(justOpened?0xff8367:0xff344a):operating?0xbd273c:0x5e111c);
      }
    }
    const encounterIndex=Math.max(0,missionState?.encounterIndex||0);
    const activeEncounter=(map.strikeEncounters||map.encounters||[])[encounterIndex];
    const activePhase=missionState?.phase||'travel';
    const objectiveDefinition=Array.isArray(activeEncounter?.objectives)?
      activeEncounter.objectives[missionState?.objectiveIndex||0]:null;
    const activeControl=(objectiveDefinition?.interaction||activeEncounter?.interaction)?.id;
    const activeDestructible=(objectiveDefinition?.destructible||activeEncounter?.destructible)?.id;
    for(const [id,panel] of interactionPanels) {
      const panelIndex=(map.strikeEncounters||map.encounters||[]).indexOf(panel.encounter);
      const active=activePhase==='objective'&&panelIndex===encounterIndex&&id===activeControl;
      const complete=panelIndex<encounterIndex||activePhase==='complete';
      const progress=active?Math.max(0,Math.min(1,missionState?.objectiveProgress||0)):complete?1:0;
      const pulse=.5+.5*Math.sin(time*(active?8:3)+panelIndex);
      panel.screenMaterial.color.setHex(complete?0x173229:active?0x541018:0x23070c);
      panel.screenMaterial.emissive.setHex(complete?0x4effb4:active?0xff273e:0x7b1020);
      panel.screenMaterial.emissiveIntensity=complete?2.2:active?3.2+pulse*2.5:.55;
      panel.fill.visible=active||complete;
      panel.fill.scale.y=Math.max(.025,progress);
      panel.fill.position.y=.2-.2*(1-progress);
      panel.fillMaterial.emissive.setHex(complete?0x42ffba:0xff3a2e);
      panel.dial.rotation.z=progress*Math.PI*1.8;
      panel.dialMaterial.emissiveIntensity=active?2.7+pulse*3:complete?1.8:.45;
      panel.statusMaterial.emissive.setHex(complete?0x44ffc1:0xff344b);
      panel.statusMaterial.emissiveIntensity=complete?4.2:active?1.5+pulse*4:.35;
    }
    for(const [id,reactor] of destructibles) {
      const reactorIndex=(map.strikeEncounters||map.encounters||[]).indexOf(reactor.encounter);
      const active=activePhase==='objective'&&reactorIndex===encounterIndex&&id===activeDestructible;
      const destroyed=reactorIndex<encounterIndex||activePhase==='complete'||
        active&&Number.isFinite(missionState?.objectiveHealth)&&missionState.objectiveHealth<=0||
        stateValue('lineReactor','')==='destroyed';
      const maximum=Math.max(1,Number(reactor.target.maxHealth)||1);
      const health=active&&Number.isFinite(missionState?.objectiveHealth)?missionState.objectiveHealth:
        destroyed?0:maximum;
      const ratio=Math.max(0,Math.min(1,health/maximum));
      reactor.intact.visible=!destroyed;reactor.wreck.visible=destroyed;
      reactor.hitFlash=Math.max(0,reactor.hitFlash-dt);
      const hit=reactor.hitFlash>0,pulse=.5+.5*Math.sin(time*(active?9:3.4)+reactorIndex);
      reactor.intact.position.x=hit?Math.sin(time*85+reactor.hitSeed)*.035*reactor.hitFlash/.16:0;
      reactor.intact.position.y=hit?Math.cos(time*71+reactor.hitSeed)*.02*reactor.hitFlash/.16:0;
      reactor.chamberMaterial.color.setHex(active?0x8a160c:0x54100b);
      reactor.chamberMaterial.emissiveIntensity=active?4.2+ratio*3.8+pulse*1.7:1.1+pulse*.45;
      reactor.glassMaterial.emissiveIntensity=active?1.4+ratio*1.8+pulse*.6:.45;
      reactor.healthFill.visible=!destroyed&&ratio>.001;
      reactor.healthFill.scale.x=Math.max(.001,ratio);
      reactor.healthFill.position.x=-1.02*(1-ratio);
      reactor.healthMaterial.color.setHex(ratio>.3?0xff532d:0xff2018);
      reactor.healthMaterial.emissive.setHex(ratio>.3?0xff351d:0xff0808);
      reactor.healthMaterial.emissiveIntensity=active?3.5+pulse*2:.6;
      reactor.flash.visible=hit&&!destroyed;
      reactor.flashMaterial.opacity=hit?Math.min(.92,reactor.hitFlash*5.6):0;
      reactor.flash.scale.setScalar(1+(1-reactor.hitFlash/.16)*.45);
    }
    const authoritativeGuideIds=Array.isArray(missionState?.activeRouteGuideIds)
      ? new Set(missionState.activeRouteGuideIds) : null;
    for(const item of routeVisuals) {
      const guideIndex=Number.isFinite(item.guide.encounterIndex)?item.guide.encounterIndex:
        (item.guide.encounterId?(map.strikeEncounters||map.encounters||[])
          .findIndex(encounter=>encounter.id===item.guide.encounterId):encounterIndex);
      const phases=Array.isArray(item.guide.phases)?item.guide.phases:
        item.guide.phase?[item.guide.phase]:null;
      // Prefer the authoritative guide selection: it understands which door or
      // machinery transition has actually opened. The encounter/phase match is
      // retained for old snapshots and local previews.
      const active=authoritativeGuideIds
        ? authoritativeGuideIds.has(item.guide.id)
        : guideIndex===encounterIndex&&(!phases||phases.includes(activePhase));
      const pulse=.78+.22*Math.sin(time*6+guideIndex*.8);
      item.material.opacity = active ? .88 * pulse : .14;
      item.material.color.setHex(active?0xff5360:0x731523);
      const scale=(item.guide.scale||1)*(active?1+.06*pulse:1);
      item.mesh.scale.setScalar(scale);
    }
    if(objectiveBeacon) {
      let target=missionState?.objectiveBeacon||null;
      if(!target&&activePhase==='objective') {
        const objectives=Array.isArray(activeEncounter?.objectives)?activeEncounter.objectives:null;
        target=objectives?.[missionState?.objectiveIndex||0]?.interaction||activeEncounter?.interaction||
          objectives?.[missionState?.objectiveIndex||0]?.trigger||activeEncounter?.objectiveTrigger||
          activeEncounter?.completionTrigger||activeEncounter?.objectivePoint;
      } else if(!target&&activePhase==='travel') {
        target=(activeEncounter?.triggers||[])[0]||activeEncounter?.trigger||activeEncounter?.objectivePoint;
      } else if(!target) target=activeEncounter?.objectivePoint||activeEncounter?.trigger;
      objectiveBeacon.root.visible=!!target&&activePhase!=='complete';
      if(target&&objectiveBeacon.root.visible) {
        const x=target.x+(target.width||0)/2;
        const y=target.y+(target.height&&target.width?target.height/2:0);
        const height=target.height&&target.width
          ? (target.bottom??target.minHeight??0) : (target.height??target.bottom??0);
        objectiveBeacon.root.position.copy(toWorld(x,y,height+.045));
        const pulse=.86+.14*Math.sin(time*5.2);
        objectiveBeacon.ring.scale.setScalar(pulse);
        objectiveBeacon.ring.rotation.z+=dt*.85;
        objectiveBeacon.pointer.position.y=3.9+.16*Math.sin(time*3.7);
        objectiveBeacon.beamMaterial.opacity = activePhase === 'combat' ? .09 : .15 + .06 * pulse;
        objectiveBeacon.ringMaterial.opacity = activePhase === 'combat' ? .58 : .88;
      }
    }
    for (const item of animated) {
      if (item.type === 'conveyor') {
        const active = stateValue('conveyors', 'online') !== 'stopped';
        const speed = active ? item.conveyor.speed : 0;
        const span = (item.alongY ? item.conveyor.height : item.conveyor.width) * SCALE - .5;
        item.slats.forEach((slat, i) => {
          const offset = ((i / item.slats.length + time * speed * .15 * item.conveyor.direction) % 1 + 1) % 1;
          if (item.alongY) slat.position.z = (offset - .5) * span; else slat.position.x = (offset - .5) * span;
        });
        const travel = ((time * speed * .12) % 1 + 1) % 1 - .5;
        if (item.alongY) item.blank.position.z = travel * span; else item.blank.position.x = travel * span;
      } else if (item.type === 'arm') {
        const mode = stateValue('arms', 'cycling'), active = mode !== 'park';
        const cycle = active ? Math.sin(time * 1.2 + item.phase) : .25 * item.facing;
        item.shoulder.rotation.z = cycle * .55 * item.facing;
        item.elbow.rotation.z = -.55 - cycle * .42; item.tool.material.emissiveIntensity = active ? 3 + Math.sin(time * 17 + item.phase) : .2;
      } else if (item.type === 'press') {
        const p = (Math.sin(time * .9 + item.phase) + 1) / 2;
        item.ram.position.y += ((13 + p * 4) - item.ram.position.y) * Math.min(1, dt * 4);
      } else if (item.type === 'furnace') {
        item.mouth.material.emissiveIntensity = 4.5 + Math.sin(time * 7 + item.phase) * 1.2;
      } else if (item.type === 'molten') {
        item.surface.material.emissiveIntensity = 4.7 + Math.sin(time * 2.8) * .8;
      } else if (item.type === 'pressureVent') {
        const status=hazardStateById.get(item.hazard?.id);
        const elapsed=Math.max(0,wallNow-(missionState?.hazardServerNow??wallNow));
        const cycle=Math.max(1,item.hazard?.cycleMs||1);
        const progress=((status?.cycleProgress||0)+elapsed/cycle)%1;
        const start=(item.hazard?.activeStart||0)/cycle;
        const warningWindow=.95/cycle*1000;
        const until=(start-progress+1)%1;
        const active=!!status?.active||missionState?.activeHazardIds?.includes?.(item.hazard?.id);
        const warningStrength=active?1:Math.max(0,1-until/Math.max(.001,warningWindow));
        item.warning.material.emissiveIntensity=.35+warningStrength*(4.5+1.2*Math.sin(time*19+item.phase));
        item.warning.scale.setScalar(1+warningStrength*.22);
        item.jet.visible=item.heat.visible=active;
        if(active) {
          const violent=.82+.18*Math.sin(time*37+item.phase);
          item.jet.material.opacity=.78+.18*Math.sin(time*43+item.phase);
          item.jet.scale.set(.82+violent*.32,violent, .82+violent*.32);
          item.heat.material.opacity=.22+.12*Math.sin(time*31+item.phase);
          item.heat.scale.set(1.05+violent*.25,1.45+violent*.5,1.05+violent*.25);
        } else {item.jet.material.opacity=0;item.heat.material.opacity=0;}
      } else if (item.type === 'rotor') {
        const mode = stateValue('rotor', 'steady');
        item.cage.rotation.y += dt * (mode === 'overdrive' ? 2.8 : mode === 'brake' ? .15 : 1.1);
      } else if (item.type === 'hoist') {
        item.cage.position.copy(toWorld(item.lift.x + item.lift.width / 2,
          item.lift.y + item.lift.height / 2, item.lift.top));
        item.counter.position.y = item.lift.maxTop + item.lift.minTop - item.lift.top + 4;
      } else if (item.type === 'vaultCore') {
        const mode = stateValue('core', 'shielded');
        const speed = mode === 'exposed' || mode === 'overload' ? 2.8 : mode === 'collapsed' ? .08 : .8;
        item.rings.rotation.y += dt * speed; item.rings.rotation.x += dt * speed * .31;
        const pulse = mode === 'collapsed' ? .15 : 1 + Math.sin(time * (mode === 'exposed' ? 11 : 4)) * .16;
        item.energy.scale.setScalar(pulse); item.energy.material.emissiveIntensity = mode === 'collapsed' ? .15 : 4.2 * pulse;
      } else if (item.type === 'crown') {
        const mode = stateValue('crown', 'tracking');
        item.root.rotation.y += dt * (mode === 'overdrive' ? 3.2 : mode === 'stopped' ? 0 : .75);
      }
    }
    // Crane travels only over the freight hall and visibly lowers cargo during
    // its objective, giving the interaction a spatial consequence.
    const crane = group.getObjectByName('freight-overhead-crane');
    if (crane) {
      const mode=stateValue('crane','idle'),moving=!['idle','locked'].includes(mode);
      const targetX=crane.userData.baseX+(moving?Math.sin(time*.22)*8:0);
      crane.position.x+=(targetX-crane.position.x)*Math.min(1,dt*2.4);
      const drop=(mode==='drop-cover'||mode==='unload')?1:(mode==='awaiting-cycle'?.55:0);
      crane.userData.trolley.position.z=Math.sin(time*.31)*3.4*(moving?1:0);
      crane.userData.cable.scale.y=1+drop*.5;
      crane.userData.cable.position.y=-3.5-drop*1.35;
      crane.userData.hook.position.y=-6.25-drop*2.7;
    }
    embers.position.y = (time * .35) % 5;
    // Local palette transition. Fog never obscures the player's current room;
    // it closes distant interior massing and strengthens compression/release.
    if (viewed && scene) {
      const zone = lightingZones.find(z => viewed.x >= z.x && viewed.x <= z.x + z.width &&
        viewed.y >= z.y && viewed.y <= z.y + z.height);
      if (zone) {
        currentLightingZone=zone;
        scene.fog ||= new THREE.FogExp2(zone.fog, .0045);
        scene.fog.color.lerp(zone.renderFogColor, 1 - Math.exp(-2 * dt));
        scene.fog.density += (.0045 - scene.fog.density) * (1 - Math.exp(-2 * dt));
      }
    }
  }

  // The crane is kept separate after all static batches so it can animate as
  // one hierarchy with no per-frame geometry rebuild.
  const craneDef = map.architecture.machines.find(m => m.type === 'overheadCrane');
  if (craneDef) {
    const crane = new THREE.Group(); crane.name = craneDef.id;
    const p = toWorld(craneDef.x, craneDef.y, craneDef.bottom); crane.position.copy(p);
    const bridge = addMesh(new RoundedBoxGeometry(craneDef.span * SCALE, .7, .7, 2, .08), materials.brass,
      'freight-crane-bridge', { parent: crane, castShadow: true });
    const trolley = addMesh(new RoundedBoxGeometry(1.8, .9, 1.4, 2, .08), materials.red,
      'freight-crane-trolley', { parent: crane }); trolley.position.y = -.55;
    const cable = addMesh(new THREE.CylinderGeometry(.035, .035, 5.5, 6), materials.black,
      'freight-crane-cable', { parent: crane }); cable.position.y = -3.5;
    const hook = addMesh(new THREE.TorusGeometry(.32, .09, 6, 12, Math.PI * 1.55), materials.edge,
      'freight-crane-hook', { parent: crane }); hook.position.y = -6.25;
    crane.userData.baseX=p.x;crane.userData.trolley=trolley;
    crane.userData.cable=cable;crane.userData.hook=hook;
    group.add(crane); animated.push({ type: 'crane', crane, trolley, cable, hook });
  }

  group.userData.redVault = true;
  group.userData.occluders = occluders;
  group.userData.setMissionState = setMissionState;
  group.userData.hitDestructible = hitDestructible;
  group.userData.update = update;
  group.userData.getLighting = () => currentLightingZone;
  group.userData.dispose = () => disposeTree(group);
  group.userData.metrics = () => {
    let meshes = 0, vertices = 0, lights = 0;
    group.traverse(object => {
      if (object.isMesh || object.isPoints) { meshes++; vertices += object.geometry?.attributes?.position?.count || 0; }
      if (object.isLight) lights++;
    });
    return { meshes, vertices, lights, collisionBindings: map.assetCollision.length,
      rampAssemblies: rampAssemblyMetrics.map(metric=>({...metric})) };
  };
  return group;
}
