import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {attachKintsugiFlow} from './heavyWeapons.mjs';

export const PISTOL_MODEL_SCALE = 0.85;

// Compact details shared by the held pistol and other players' weapons.
export function createPistol(skinKey, length) {
  const group = new THREE.Group(); group.scale.setScalar(length * PISTOL_MODEL_SCALE);
  const blue = skinKey === 'pistol_basicBlue';
  const cyber = skinKey === 'pistol_cybernetic';
  const dragon = skinKey === 'pistol_pocket_dragon';
  const kintsugi = skinKey === 'pistol_kintsugi';
  const material = (color, metalness = 0.45, roughness = 0.4) =>
    new THREE.MeshStandardMaterial({ color, metalness, roughness });
  const lacquer = dragon ? new THREE.MeshPhysicalMaterial({
    color:'#a8171d',metalness:0.34,roughness:0.22,clearcoat:0.8,clearcoatRoughness:0.16,
  }) : null;
  const slide = dragon ? lacquer : material(blue ? '#287cc4' : '#111827');
  const dark = material(dragon ? '#4c090d' : '#18232d', dragon ? 0.35 : 0.15, dragon ? 0.42 : 0.65);
  const steel = material(dragon ? '#d99a24' : '#788a98', dragon ? 0.82 : 0.7, dragon ? 0.2 : 0.3);
  const accent = material(dragon ? '#f5c84b' : cyber ? '#38bdf8' : blue ? '#22c55e' : '#a4b5bf', 0.72, 0.22);
  if (cyber) { accent.emissive.set('#0ea5e9'); accent.emissiveIntensity = 0.45; }
  const add = (geometry, mat, x, y, z, name) => {
    const mesh = new THREE.Mesh(geometry, mat); mesh.position.set(x, y, z);
    mesh.name = name; mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); return mesh;
  };
  const box = (w, h, d, x, y, z, mat, name) => add(
    new RoundedBoxGeometry(w, h, d, 2, Math.min(0.025, w / 4, h / 4, d / 4)), mat, x, y, z, name);
  const tube = (points, radius, mat, name) => add(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(...point))), 18, radius, 5, false),
    mat, 0, 0, 0, name);
  if (kintsugi) {
    addKintsugiPistol(group, {add, box, tube});
    return group;
  }
  box(0.33, 0.28, 0.94, 0, 0.04, -0.48, slide, 'slide');
  box(0.28, 0.10, 0.72, 0, -0.14, -0.4, dark, 'lower-frame');
  box(0.14, 0.018, 0.2, 0.055, 0.19, -0.38, steel, 'ejection-port');
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) box(0.012, 0.17, 0.02, side * 0.17, 0.05, -0.1 - i * 0.065, dark, 'slide-serration');
    if (blue) box(0.014, 0.024, 0.52, side * 0.17, 0.03, -0.6, accent, 'green-inlay');
    if (cyber) {
      const rail = box(0.045, 0.045, 0.82, side * 0.14, 0.205, -0.48, accent, 'converging-rail');
      rail.rotation.y = -side * 0.18;
      const node = add(new THREE.SphereGeometry(0.065, 12, 8), accent, side * 0.18, 0.06, -0.08, 'energy-node');
      node.scale.x = 0.25;
    }
    if (dragon) {
      // Flowing gold filigree stays almost flush with the lacquer so it reads
      // clearly without making the compact pistol silhouette noisy.
      tube([
        [side * 0.171, 0.125, -0.13], [side * 0.174, 0.15, -0.3],
        [side * 0.174, 0.025, -0.47], [side * 0.174, 0.12, -0.66],
        [side * 0.171, 0.075, -0.8],
      ], 0.011, accent, 'dragon-filigree');
      tube([
        [side * 0.171, -0.015, -0.18], [side * 0.174, 0.055, -0.3],
        [side * 0.174, -0.04, -0.43], [side * 0.171, 0.015, -0.58],
      ], 0.007, steel, 'dragon-filigree');
      for (let i = 0; i < 3; i++) {
        const scale = add(new THREE.SphereGeometry(0.04, 8, 5), accent,
          side * 0.173, 0.08 + (i % 2) * 0.035, -0.31 - i * 0.14, 'dragon-scale');
        scale.scale.set(0.14, 0.52, 1);
      }
    }
  }
  box(0.10, 0.05, 0.045, 0, 0.21, -0.11, dark, 'rear-sight');
  box(0.035, 0.04, 0.045, 0, 0.205, -0.85, accent, 'front-sight');
  const muzzle = add(new THREE.TorusGeometry(0.085, 0.022, 6, 16), steel, 0, 0.04, -0.96, 'muzzle-ring');
  const bore = add(new THREE.CircleGeometry(0.066, 16), dark, 0, 0.04, -0.957, 'muzzle-bore');
  bore.rotation.y = Math.PI;
  if (dragon) addDragonHead(group, {add,box,tube,red:slide,dark,gold:accent,bronze:steel});
  return group;
}

function addKintsugiPistol(group, {add, box, tube}) {
  const ceramic = new THREE.MeshPhysicalMaterial({
    name:'Kintsugi charcoal ceramic',color:'#18191c',metalness:0.08,roughness:0.2,
    clearcoat:0.82,clearcoatRoughness:0.12,
  });
  const raised = new THREE.MeshPhysicalMaterial({
    name:'Kintsugi raised ceramic',color:'#29272b',metalness:0.12,roughness:0.24,
    clearcoat:0.68,clearcoatRoughness:0.15,
  });
  const dark = new THREE.MeshStandardMaterial({
    name:'Kintsugi dark fittings',color:'#08090b',metalness:0.35,roughness:0.24,
  });
  const gold = new THREE.MeshStandardMaterial({
    name:'Kintsugi molten gold',color:'#e3ad42',metalness:0.88,roughness:0.16,
    emissive:'#9c5000',emissiveIntensity:0.24,
  });
  const amber = new THREE.MeshStandardMaterial({
    name:'Kintsugi amber sight',color:'#ffcb55',metalness:0.45,roughness:0.14,
    emissive:'#b75b00',emissiveIntensity:0.65,
  });
  const flowCurves=[];
  const seam=(points,radius=0.012,name='kintsugi-pistol-seam')=>{
    const curve=new THREE.CatmullRomCurve3(points.map(point=>new THREE.Vector3(...point)));
    flowCurves.push(curve);
    return add(new THREE.TubeGeometry(curve,Math.max(10,points.length*5),radius,7,false),gold,0,0,0,name);
  };

  // A purpose-built ceramic dueling-pistol silhouette: stepped receiver,
  // narrow nose and integrated chassis instead of a recolored stock slide.
  box(0.305,0.295,0.58,0,0.045,-0.39,ceramic,'kintsugi-pistol-receiver');
  box(0.268,0.242,0.38,0,0.025,-0.79,ceramic,'kintsugi-pistol-nose');
  box(0.282,0.252,0.2,0,0.03,-0.085,raised,'kintsugi-pistol-tail');
  box(0.224,0.035,0.69,0,0.205,-0.43,raised,'kintsugi-pistol-ridge');
  box(0.232,0.102,0.58,0,-0.145,-0.39,dark,'kintsugi-pistol-chassis');
  box(0.246,0.052,0.16,0,-0.208,-0.075,gold,'kintsugi-pistol-grip-joint');

  // Raised side shells create a shallow waist, so its profile remains unique
  // even when it is small in another player's hand.
  for (const side of [-1,1]) {
    const panel=box(0.025,0.19,0.46,side*0.157,0.035,-0.4,raised,'kintsugi-side-panel');
    panel.rotation.z=side*0.035;
    for(let index=0;index<3;index++) {
      const serration=box(0.012,0.145,0.018,side*0.148,0.045,-0.115-index*0.052,dark,'slide-serration');
      serration.rotation.z=side*0.08;
    }
    const x=side*0.171;
    seam([[x,0.105,-0.11],[x,0.045,-0.23],[x,0.105,-0.36],[x,-0.015,-0.5],[x,0.035,-0.62]]);
    seam([[x,0.045,-0.23],[x,-0.035,-0.285],[x,-0.055,-0.35]],
      0.0085,'kintsugi-pistol-branch');
    seam([[side*0.15,0.075,-0.03],[side*0.15,0.015,-0.09],[side*0.15,0.07,-0.17]],
      0.0085,'kintsugi-pistol-tail-seam');
    const noseX=side*0.145;
    seam([[noseX,0.03,-0.62],[noseX,-0.025,-0.72],[noseX,0.05,-0.82],[noseX,-0.01,-0.94]]);
    seam([[noseX,0.05,-0.82],[noseX,0.095,-0.86],[noseX,0.085,-0.915]],
      0.0085,'kintsugi-pistol-branch');
  }

  // The open ceramic trigger bow nests over the shared character hand rather
  // than being a flat painted mark on the receiver.
  const triggerBow=add(new THREE.TorusGeometry(0.092,0.017,7,22),raised,0,-0.235,-0.16,'kintsugi-trigger-bow');
  triggerBow.rotation.y=Math.PI/2;triggerBow.scale.y=0.78;
  const trigger=box(0.025,0.105,0.028,0,-0.22,-0.19,gold,'kintsugi-trigger');
  trigger.rotation.x=-0.24;

  box(0.132,0.018,0.19,0.056,0.211,-0.39,dark,'ejection-port');
  for(const side of [-1,1])box(0.055,0.052,0.05,side*0.077,0.242,-0.115,raised,'kintsugi-rear-sight');
  // Frame the full ceramic nose instead of leaving a small gold loop floating
  // around the bore. The outer edge now nearly meets the nose silhouette.
  const muzzle=add(new THREE.TorusGeometry(0.103,0.0195,8,24),gold,0,0.025,-0.971,'muzzle-ring');
  muzzle.rotation.z=Math.PI/4;
  const bore=add(new THREE.CircleGeometry(0.06,18),dark,0,0.025,-0.973,'muzzle-bore');
  bore.rotation.y=Math.PI;

  // An irregular ceramic fracture crosses the upper spine, then forks at
  // three stress points. Uneven spacing and direction keep it from reading as
  // a decorative sine wave while concentrating the extra gold on top.
  const topCrack=new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.052,0.224,-0.1),new THREE.Vector3(0.018,0.225,-0.19),
    new THREE.Vector3(0.006,0.225,-0.285),new THREE.Vector3(0.073,0.224,-0.365),
    new THREE.Vector3(-0.016,0.225,-0.465),new THREE.Vector3(-0.058,0.224,-0.57),
    new THREE.Vector3(0.009,0.222,-0.675),new THREE.Vector3(-0.032,0.204,-0.755),
    new THREE.Vector3(0.022,0.151,-0.835),new THREE.Vector3(-0.014,0.15,-0.94),
  ]);
  flowCurves.push(topCrack);
  add(new THREE.TubeGeometry(topCrack,40,0.011,7,false),gold,0,0,0,'kintsugi-pistol-top-seam');
  const topFork=(points)=>seam(points,0.0075,'kintsugi-pistol-top-branch');
  topFork([
    [0.006,0.225,-0.285],[-0.052,0.226,-0.326],[-0.098,0.225,-0.405],
  ]);
  topFork([
    [-0.016,0.225,-0.465],[0.052,0.226,-0.512],[0.092,0.225,-0.595],
  ]);
  topFork([
    [0.022,0.151,-0.835],[0.072,0.152,-0.865],[0.103,0.151,-0.918],
  ]);
  group.name='kintsugi-pistol';
  group.userData.kintsugiGold=gold;
  group.userData.kintsugiBaseGlow=0.24;
  group.userData.kintsugiShotAt=-10;
  attachKintsugiFlow(group,flowCurves,0.009);
}

function addDragonHead(group, {add, box, tube, red, dark, gold, bronze}) {
  const fire = new THREE.MeshStandardMaterial({
    color:'#ffca45',emissive:'#ff6a00',emissiveIntensity:1.15,metalness:0.25,roughness:0.24,
  });
  const ivory = new THREE.MeshStandardMaterial({color:'#ffe6af',metalness:0.05,roughness:0.38});

  // The front of the slide becomes the dragon's snout instead of receiving a
  // separate ornament. Broad cheeks frame the existing functional bore.
  for (const side of [-1, 1]) {
    const cheek = add(new THREE.SphereGeometry(0.1, 12, 8), red,
      side * 0.1, 0.045, -0.875, 'dragon-cheek');
    cheek.scale.set(1.05, 0.78, 0.8);

    const brow = box(0.105, 0.045, 0.16, side * 0.095, 0.158, -0.84, gold, 'dragon-brow');
    brow.rotation.z = side * 0.2;
    brow.rotation.y = side * 0.08;
    const eye = add(new THREE.SphereGeometry(0.026, 10, 6), fire,
      side * 0.115, 0.132, -0.917, 'dragon-eye');
    eye.scale.z = 0.35;

    // Traditional sweeping horns form a crown and double as an expressive
    // front-sight silhouette from the player's view.
    const horn = add(new THREE.ConeGeometry(0.027, 0.17, 7), ivory,
      side * 0.125, 0.245, -0.79, 'dragon-horn');
    horn.rotation.z = -side * 0.43;
    horn.rotation.x = -0.46;

    const fang = add(new THREE.ConeGeometry(0.018, 0.09, 7), ivory,
      side * 0.095, -0.045, -0.927, 'dragon-fang');
    fang.rotation.x = Math.PI;

    tube([
      [side * 0.13, 0.065, -0.92], [side * 0.205, 0.055, -0.9],
      [side * 0.225, 0.105, -0.83], [side * 0.19, 0.13, -0.76],
    ], 0.008, bronze, 'dragon-whisker');
  }
  box(0.24, 0.034, 0.13, 0, -0.052, -0.885, gold, 'dragon-jaw');
  const nose = box(0.19, 0.07, 0.065, 0, 0.075, -0.925, red, 'dragon-snout');
  nose.rotation.x = -0.08;
  for (const side of [-1, 1]) add(new THREE.SphereGeometry(0.012, 8, 5), dark,
    side * 0.05, 0.088, -0.962, 'dragon-nostril').scale.z = 0.3;

  // A small gold roof-like rear sight balances the elaborate muzzle while
  // preserving an open, usable sight channel.
  for (const side of [-1, 1]) {
    const fin = box(0.055, 0.04, 0.13, side * 0.07, 0.225, -0.13, gold, 'dragon-rear-fin');
    fin.rotation.z = -side * 0.18;
  }
}
