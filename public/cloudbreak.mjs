import * as THREE from 'three';

export const CLOUDBREAK = 'pistol_cloudbreak';
export const CLOUD_MUZZLE_DEPTH = .975;
export const CLOUD_MUZZLE_HEIGHT = .018;

const enamel = (color, metalness, roughness) =>
  new THREE.MeshStandardMaterial({color, metalness, roughness});

// Draw in side elevation. X on the drawing is distance along the slide toward
// the muzzle. Using curves for the outlines keeps the relief legible at HUD size.
function outline(start, segments) {
  const shape = new THREE.Shape();
  shape.moveTo(...start);
  for (const segment of segments) {
    if (segment.length === 2) shape.lineTo(...segment);
    else shape.bezierCurveTo(...segment);
  }
  shape.closePath();
  return shape;
}

const receiver = outline([.015, .06], [
  [.019,.102, .065,.148, .139,.148], [.801,.148],
  [.858,.148, .907,.138, .932,.121],
  [.939,.121], [.939,-.046], [.916,-.070], [.79,-.070],
  [.68,-.058, .604,-.113, .483,-.116], [.14,-.103],
  [.062,-.103, .013,-.059, .015,.06],
]);
const grip = outline([.208,-.065], [
  [.427,-.067], [.407,-.119, .365,-.15, .351,-.201],
  [.299,-.405], [.29,-.44, .27,-.456, .232,-.451],
  [.116,-.425], [.098,-.416, .097,-.402, .106,-.375],
  [.184,-.163], [.2,-.118, .183,-.095, .163,-.087],
]);
const bow = outline([.309,-.267], [
  [.399,-.26, .463,-.225, .48,-.178], [.506,-.09], [.552,-.091],
  [.526,-.189], [.498,-.262, .422,-.29, .302,-.295],
]);

// A continuous bank, with a high, hooked crest and a long downwind tail.
// The second relief crosses the foot of the first and rolls back into itself.
const cloudBank = outline([.077,-.071], [
  [.119,-.058, .147,-.05, .17,-.026],
  [.163,.004, .198,.034, .235,.021],
  [.226,.073, .278,.11, .325,.094],
  [.361,.086, .375,.055, .355,.039],
  [.338,.025, .315,.036, .318,.052],
  [.295,.031, .324,.001, .358,.013],
  [.4,.027, .418,.071, .473,.057],
  [.504,.05, .514,.029, .514,.013],
  [.567,.037, .603,.007, .601,-.014],
  [.661,-.014, .746,.014, .857,.061],
  [.794,.011, .727,-.023, .642,-.054],
  [.534,-.096, .275,-.092, .077,-.071],
]);
const cloudFold = outline([.112,-.079], [
  [.221,-.071, .293,-.066, .347,-.04],
  [.386,-.021, .423,-.03, .426,-.047],
  [.431,-.065, .409,-.074, .396,-.066],
  [.42,-.088, .446,-.066, .462,-.046],
  [.489,-.01, .526,-.011, .538,-.03],
  [.572,-.014, .602,-.021, .615,-.035],
  [.693,-.039, .781,-.006, .877,.035],
  [.759,-.035, .686,-.067, .567,-.082],
  [.426,-.099, .248,-.095, .112,-.079],
]);
const highCloud = outline([.372,.091], [
  [.423,.115, .458,.119, .501,.113],
  [.554,.107, .578,.096, .626,.105],
  [.589,.089, .548,.095, .501,.102],
  [.455,.111, .412,.106, .372,.091],
]);

function relief(shape, depth, bevel) {
  return new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel,
    bevelSegments: 2, curveSegments: 9, steps: 1,
  });
}


function skyFinish(geometry) {
  const {position} = geometry.attributes;
  const colors = [];
  const horizon=new THREE.Color('#90b8d8'), middle=new THREE.Color('#427eaf');
  const zenith=new THREE.Color('#23477e'), result=new THREE.Color();
  for (let i=0; i<position.count; i++) {
    const h=THREE.MathUtils.clamp((position.getY(i)+.12)/.30,0,1);
    if (h < .42) result.lerpColors(horizon,middle,h/.42);
    else result.lerpColors(middle,zenith,(h-.42)/.58);
    colors.push(result.r,result.g,result.b);
  }
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
}

// Spiral bands converge on a dark polar eye. Color the surface once so the
// whole weather system can turn as a single mesh in every lighting environment.
function hurricane() {
  const geometry=new THREE.SphereGeometry(1,64,20,0,Math.PI*2,0,Math.PI/2);
  const position=geometry.attributes.position, colors=[];
  const ocean=new THREE.Color('#112759'), rain=new THREE.Color('#397fae');
  const ice=new THREE.Color('#cefff3'), eyewall=new THREE.Color('#f6e8be'), tint=new THREE.Color();
  for(let i=0;i<position.count;i++) {
    const x=position.getX(i), y=position.getY(i), z=position.getZ(i);
    const latitude=Math.acos(THREE.MathUtils.clamp(y,-1,1)), azimuth=Math.atan2(z,x);
    const curl=3*azimuth+9*latitude+.46*Math.sin(6*x-8*z)+.24*Math.sin(17*x+8*y+5*z);
    const bank=(.5+.5*Math.cos(curl))**3;
    const streak=(.5+.5*Math.cos(curl*2+latitude*3))**5;
    const aperture=THREE.MathUtils.smoothstep(latitude,.14,.32);
    tint.copy(ocean).lerp(rain,.42*aperture).lerp(ice,(bank*.82+streak*.16)*aperture)
      .lerp(eyewall,.86*Math.exp(-((latitude-.29)**2)/.005));
    colors.push(...tint.toArray());
  }
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  return geometry;
}

function buildCloudbreak() {
  const group = new THREE.Group();
  group.name = 'Cloudbreak';


  const blue = new THREE.MeshPhysicalMaterial({
    color: '#245799', metalness: .24, roughness: .29, clearcoat: .52, clearcoatRoughness: .2,
  });
  const pearl = new THREE.MeshPhysicalMaterial({
    color: '#e1f1f6', metalness: .19, roughness: .28, iridescence: .32, iridescenceIOR: 1.32,
  });
  const shade = enamel('#829fc9', .34, .34);
  const brass = enamel('#e9b979', .64, .29);
  const navy = enamel('#203650', .43, .32);
  const mesh = (name, geometry, material, parent = group) => {
    const part = new THREE.Mesh(geometry, material);
    part.name = name;
    part.castShadow = part.receiveShadow = true;
    parent.add(part);
    return part;
  };
  function profile(name, shape, material, width, bevel, center = 0) {
    const geometry = relief(shape, width, bevel);
    geometry.translate(0, 0, -width / 2);
    geometry.rotateY(Math.PI / 2);
    geometry.translate(center, 0, 0);
    return mesh(name, geometry, material);
  }
  const sky = blue.clone();
  sky.color.set(0xffffff);
  sky.vertexColors = true;
  const slide = profile('enamel-slide', receiver, sky, .246, .022);
  skyFinish(slide.geometry);
  // Three shallow flutes follow the curved stern directly below the storm glass.
  // Sample the cast surface so their ends stay seated through the bevel.
  slide.updateMatrixWorld();
  const sternRay = new THREE.Raycaster();
  const ridgePoints = [], ridgeIndices = [];
  for (let row=0; row<3; row++) {
    const first = ridgePoints.length/3;
    for (let i=0; i<=20; i++) {
      const t=i/20, x=(2*t-1)*(.095-row*.018);
      const width=.0032*Math.sin(Math.PI*t);
      for (const edge of [-1,1]) {
        const y=.028-row*.019-.014*(1-(2*t-1)**2)+edge*width;
        sternRay.set(new THREE.Vector3(x,y,.1),new THREE.Vector3(0,0,-1));
        const hit=sternRay.intersectObject(slide,false)[0];
        ridgePoints.push(x,y,(hit?.point.z ?? 0)+.0018);
      }
      if (i) {
        const j=first+2*i;
        ridgeIndices.push(j-2,j,j-1, j,j+1,j-1);
      }
    }
  }
  const ridges=new THREE.BufferGeometry();
  ridges.setAttribute('position',new THREE.Float32BufferAttribute(ridgePoints,3));
  ridges.setIndex(ridgeIndices);
  ridges.computeVertexNormals();
  mesh('stern-fluting',ridges,shade);
  profile('storm-grip', grip, navy, .18, .018);
  profile('swept-trigger-bow', bow, shade, .062, .006);
  const trigger = outline([.401,-.099], [
    [.428,-.099], [.431,-.154, .411,-.187, .382,-.202],
    [.394,-.17, .404,-.145, .401,-.099],
  ]);
  profile('trigger', trigger, brass, .029, .003);
  const gripInset = outline([.197,-.152], [
    [.312,-.144], [.277,-.23, .253,-.325, .248,-.376],
    [.221,-.401, .181,-.389, .142,-.381], [.197,-.152],
  ]);
  for (const side of [-1, 1]) {
    profile('grip-inlay', gripInset, blue, .006, .004, side*.108);
    const sun = mesh('setting-sun',new THREE.CylinderGeometry(.039,.039,.004,36),brass);
    sun.rotation.z = Math.PI/2;
    sun.position.set(side*.147,.06,-.504);
    profile('high-cloud',highCloud,shade,.003,.001,side*.1455);
    profile('porcelain-cloudbank',cloudBank,pearl,.008,.003,side*.147);
    profile('cloud-shadow',cloudFold,shade,.008,.002,side*.157);
  }

  // The weather sits under one long skylight. Both shoulders of the slide
  // carry an uninterrupted edge from the player's hand to the front sight.
  const chamber = new THREE.Group();
  chamber.name = 'storm-glass';
  group.add(chamber);
  const topRay = new THREE.Raycaster();
  function slideHeight(depth) {
    topRay.set(new THREE.Vector3(0,.32,-depth), new THREE.Vector3(0,-1,0));
    return topRay.intersectObject(slide,false)[0].point.y;
  }
  const sections = [[.073,.014],[.098,.05],[.146,.081],[.216,.098],
    [.316,.096],[.414,.081],[.527,.065],[.643,.048],[.724,.027],[.762,.005]];
  function pane(name, crossSection, material, facets) {
    const points = [], indices = [], colors = [];
    for (const [depth,width] of sections) {
      const top = slideHeight(depth);
      for (const [offset, rise] of crossSection) {
        const k = points.length/3;
        points.push(offset*width, top+rise*width, -depth);
        if (facets) colors.push(...facets[k % crossSection.length].toArray());
        if (k >= crossSection.length && k % crossSection.length) {
          const prev=k-crossSection.length;
          indices.push(prev-1,prev,k, prev-1,k,k-1);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
    geometry.setIndex(indices);
    if (facets) geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    geometry.computeVertexNormals();
    return mesh(name,geometry,material,chamber);
  }
  pane('lens-setting',[[-1,-.04],[-.94,.07],[.94,.07],[1,-.04]],shade);
  pane('sapphire-bed',[[-.89,.075],[-.68,.10],[.68,.10],[.89,.075]],enamel('#102b50',.4,.22));

  const eyeMount=new THREE.Group();
  eyeMount.position.set(0,slideHeight(.284)+.009,-.284);
  eyeMount.scale.set(.064,.014,.118);
  chamber.add(eyeMount);
  const eyeFinish=new THREE.MeshStandardMaterial({
    vertexColors:true,roughness:.36,metalness:.14,emissive:'#347696',emissiveIntensity:.19,
  });
  mesh('hurricane-eye',hurricane(),eyeFinish,eyeMount);

  const crystal = new THREE.MeshPhysicalMaterial({
    vertexColors:true,metalness:.18,roughness:.16,clearcoat:.9,
    transparent:true,opacity:.38,depthWrite:false,flatShading:true,
  });
  const facets = ['#305f94','#b5d9ed','#335084','#497799','#143555'].map(hex=>new THREE.Color(hex));
  pane('cut-storm-glass',[[-.89,.08],[-.68,.34],[.43,.36],[.73,.25],[.89,.08]],crystal,facets);

  const filament = new THREE.MeshStandardMaterial({
    color:'#b9e6fb',emissive:'#77cfff',emissiveIntensity:.32,metalness:.22,roughness:.27,
  });
  function discharge(name, path, radius) {
    const curve = new THREE.CurvePath();
    const points = path.map(([x,depth])=>{
      const next = sections.findIndex(([d])=>d>=depth);
      const [d0,w0]=sections[next-1], [d1,w1]=sections[next];
      const width=THREE.MathUtils.lerp(w0,w1,(depth-d0)/(d1-d0));
      return new THREE.Vector3(x,slideHeight(depth)+.20*width,-depth);
    });
    for (let i=1;i<points.length;i++) curve.add(new THREE.LineCurve3(points[i-1],points[i]));
    mesh(name,new THREE.TubeGeometry(curve,32,radius,5,false),filament,chamber);
  }
  discharge('storm-filament',[[-.014,.383],[.018,.427],[-.008,.448],[.019,.446],
    [-.003,.499],[.011,.54],[-.007,.564],[.005,.641]],.0027);
  discharge('storm-branch',[[-.003,.499],[-.027,.518],[-.020,.531],[-.035,.547]],.0015);

  // A clipped enamel face surrounds a shallow socket. The brass is a fine
  // edge inside that socket, so it never projects past the slide in profile.
  const face = outline([-.112,.14], [
    [.112,.14], [.128,.122], [.128,-.048], [.11,-.065],
    [-.11,-.065], [-.128,-.048], [-.128,.122],
  ]);
  const aperture = new THREE.Path();
  aperture.absarc(0,.018,.057,0,Math.PI*2,true);
  face.holes.push(aperture);
  const cap = mesh('muzzle-face', relief(face,.021,.002), blue);
  cap.rotation.y = Math.PI;
  cap.position.z = -.951;
  const lip = mesh('muzzle-ring',new THREE.RingGeometry(.049,.058,36),brass);
  lip.rotation.y = Math.PI;
  lip.position.set(0,.018,-.964);
  const recess = mesh('muzzle-recess',new THREE.CircleGeometry(.055,36),navy);
  recess.rotation.y = Math.PI;
  recess.position.set(0,.018,-.9625);
  const post = profile('front-sight',outline([.802,.147], [
    [.821,.186], [.843,.186], [.863,.142],
  ]),brass,.025,.003);
  post.receiveShadow=false;
  return group;
}

// The arena batches and disposes the meshes it receives on weapon switches.
// Keep the original sculpture off-scene and give each mount its own resources.
let sculpture;
export function createCloudbreak(scale) {
  sculpture ??= buildCloudbreak();
  const model = sculpture.clone(true);
  const finishes = new Map();
  model.traverse(part => {
    if (!part.isMesh) return;
    part.geometry = part.geometry.clone();
    if (!finishes.has(part.material)) finishes.set(part.material, part.material.clone());
    part.material = finishes.get(part.material);
  });
  model.scale.setScalar(scale);
  return model;
}

export function findCloudbreakParts(weapon) {
  const eye=weapon.getObjectByName('hurricane-eye');
  if(!eye)return null;
  return {eye, spin:0, lastTime:null,
    filament:weapon.getObjectByName('storm-filament').material};
}

export function poseCloudbreak(parts, time, shotAge = Infinity) {
  const pulse=shotAge>=0 && shotAge<.32 ? (1-shotAge/.32)**2 : 0;
  // Integrate just the additional burst rotation. Rapidity of fire can
  // change mid-room, and a second shot must never rewind the hurricane.
  const dt=parts.lastTime===null ? 0 : Math.max(0,time-parts.lastTime);
  parts.lastTime=time;
  if(shotAge>=0 && Number.isFinite(shotAge)) {
    const start=THREE.MathUtils.clamp((shotAge-dt)/.32,0,1);
    const end=Math.min(shotAge/.32,1);
    parts.spin+=1.65*((1-start)**3-(1-end)**3);
  }
  parts.eye.rotation.y=time*.72+parts.spin;
  parts.eye.material.emissiveIntensity=.19+.92*pulse;
  parts.filament.emissiveIntensity=.32+5*pulse;
}
