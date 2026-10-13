import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Compact details shared by the held pistol and other players' weapons.
export function createPistol(skinKey, length) {
  const group = new THREE.Group(); group.scale.setScalar(length);
  const blue = skinKey === 'pistol_basicBlue';
  const cyber = skinKey === 'pistol_cybernetic';
  const material = (color, metalness = 0.45, roughness = 0.4) =>
    new THREE.MeshStandardMaterial({ color, metalness, roughness });
  const slide = material(blue ? '#287cc4' : '#111827');
  const dark = material('#18232d', 0.15, 0.65);
  const steel = material('#788a98', 0.7, 0.3);
  const accent = material(cyber ? '#38bdf8' : blue ? '#22c55e' : '#a4b5bf');
  if (cyber) { accent.emissive.set('#0ea5e9'); accent.emissiveIntensity = 0.45; }
  const add = (geometry, mat, x, y, z, name) => {
    const mesh = new THREE.Mesh(geometry, mat); mesh.position.set(x, y, z);
    mesh.name = name; mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); return mesh;
  };
  const box = (w, h, d, x, y, z, mat, name) => add(
    new RoundedBoxGeometry(w, h, d, 2, Math.min(0.025, w / 4, h / 4, d / 4)), mat, x, y, z, name);
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
  }
  box(0.10, 0.05, 0.045, 0, 0.21, -0.11, dark, 'rear-sight');
  box(0.035, 0.04, 0.045, 0, 0.205, -0.85, accent, 'front-sight');
  const muzzle = add(new THREE.TorusGeometry(0.085, 0.022, 6, 16), steel, 0, 0.04, -0.96, 'muzzle-ring');
  const bore = add(new THREE.CircleGeometry(0.066, 16), dark, 0, 0.04, -0.957, 'muzzle-bore');
  bore.rotation.y = Math.PI;
  return group;
}
