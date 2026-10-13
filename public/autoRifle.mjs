import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// One model shared by first-person and character weapons. Forward is -Z.
export function createAutoRifle(skinKey, length) {
  const group = new THREE.Group();
  group.scale.setScalar(length);
  const ivy = skinKey === 'autoRifle_poisonivy';
  const cyber = skinKey === 'autoRifle_cybernetic';
  const christmas = skinKey === 'autoRifle_christmas';
  const material = (color, metalness = 0.45, roughness = 0.4) =>
    new THREE.MeshStandardMaterial({ color, metalness, roughness });
  const body = material(christmas ? '#c41d12' : '#111827');
  const steel = material('#667581', 0.7, 0.3);
  const rubber = material('#0b0f14', 0.05, 0.8);
  const accent = material(ivy ? '#22c55e' : cyber ? '#38bdf8' : christmas ? '#27c225' : '#8999a6');
  if (cyber) { accent.emissive.set('#0ea5e9'); accent.emissiveIntensity = 0.7; }
  const add = (geometry, mat, x, y, z, name) => {
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.position.set(x, y, z); mesh.name = name;
    mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); return mesh;
  };
  const box = (w, h, d, x, y, z, mat, name) => add(
    new RoundedBoxGeometry(w, h, d, 2, Math.min(0.018, w / 4, h / 4, d / 4)), mat, x, y, z, name);
  const cylinder = (radius, depth, z, mat, name) => {
    const mesh = add(new THREE.CylinderGeometry(radius, radius, depth, 16), mat, 0, 0, z, name);
    mesh.rotation.x = Math.PI / 2; return mesh;
  };
  box(0.21, 0.22, 0.38, 0, 0, -0.22, body, 'receiver');
  box(0.18, 0.18, 0.35, 0, 0, -0.57, body, 'handguard');
  box(0.16, 0.18, 0.16, 0, -0.025, 0.045, rubber, 'stock');
  const magazine = box(0.11, 0.23, 0.15, 0, -0.19, -0.32, body, 'magazine');
  magazine.rotation.x = -0.15;
  cylinder(0.043, 0.2, -0.81, steel, 'barrel');
  cylinder(0.06, 0.09, -0.945, rubber, 'muzzle');
  const bore = add(new THREE.CircleGeometry(0.033, 16), rubber, 0, 0, -0.991, 'bore');
  bore.rotation.y = Math.PI;
  box(0.065, 0.035, 0.56, 0, 0.125, -0.36, steel, 'top-rail');
  for (const z of [-0.12, -0.67]) box(0.055, 0.065, 0.025, 0, 0.17, z, rubber, 'iron-sight');
  for (const side of [-1, 1]) {
    box(0.014, 0.075, 0.18, side * 0.11, 0, -0.2, steel, 'receiver-inset');
    for (let i = 0; i < 4; i++) {
      box(0.013, 0.04, 0.027, side * 0.095, 0.025, -0.46 - i * 0.065, rubber, 'cooling-vent');
    }
    if (cyber) {
      box(0.045, 0.06, 0.34, side * 0.135, 0.055, -0.24, accent, 'blue-rail');
      for (let i = 0; i < 3; i++) box(0.012, 0.032, 0.025, side * 0.116, -0.065, -0.15 - i * 0.05, accent, 'charge-indicator');
    }
    if (christmas) {
      box(0.014, 0.032, 0.66, side * 0.112, 0.035, -0.39, accent, 'green-stripe');
    }
  }
  if (christmas) {
    const gold = material('#efc45d', 0.65, 0.3);
    for (const z of [-0.46, -0.7]) box(0.19, 0.19, 0.035, 0, 0, z, accent, 'holiday-band');
    box(0.125, 0.055, 0.022, 0, -0.18, -0.405, gold, 'gold-magazine-trim');
  }
  if (ivy) {
    const leafMaterial = material('#34d399', 0.05, 0.65);
    const stemMaterial = material('#065f46', 0.05, 0.7);
    for (let vine = 0; vine < 2; vine++) {
      const points = [];
      for (let i = 0; i <= 48; i++) {
        const t = i / 48, angle = t * Math.PI * 5 + vine * Math.PI;
        points.push(new THREE.Vector3(Math.cos(angle) * 0.135, Math.sin(angle) * 0.14, -0.07 - t * 0.68));
      }
      add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 48, 0.012, 5, false), accent, 0, 0, 0, 'coiled-vine');
    }
    for (let i = 0; i < 6; i++) {
      const side = i % 2 ? -1 : 1;
      const leaf = add(new THREE.SphereGeometry(1, 8, 6), leafMaterial, side * 0.14, 0.09, -0.15 - i * 0.095, 'ivy-leaf');
      leaf.scale.set(0.07, 0.014, 0.11); leaf.rotation.z = side * 0.45; leaf.rotation.y = side * 0.55;
      const vein = box(0.009, 0.009, 0.12, side * 0.14, 0.105, -0.15 - i * 0.095, stemMaterial, 'leaf-vein');
      vein.rotation.y = side * 0.55;
    }
  }
  // Dispose unused accent material for the unadorned default model.
  if (!ivy && !cyber && !christmas) accent.dispose();
  return group;
}
