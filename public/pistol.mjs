import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const PISTOL_MODEL_SCALE = 0.85;

// Compact details shared by the held pistol and other players' weapons.
export function createPistol(skinKey, length) {
  const group = new THREE.Group(); group.scale.setScalar(length * PISTOL_MODEL_SCALE);
  const blue = skinKey === 'pistol_basicBlue';
  const cyber = skinKey === 'pistol_cybernetic';
  const dragon = skinKey === 'pistol_pocket_dragon';
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
