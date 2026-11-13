import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createAutoRifle } from './autoRifle.mjs';
import { createPistol } from './pistol.mjs';
import { createShotgun } from './shotgun.mjs';
import { createHeavyWeapon } from './heavyWeapons.mjs';
import { createMarioPipe } from './marioPipe.mjs';
import {createArmorFitting,fitCharacterArmor,armorStyle} from './armorModels.mjs';
import './armor.js';

function material(color, metalness = .65, roughness = .27) {
  return new THREE.MeshStandardMaterial({color,metalness,roughness});
}

function createStandardSniper(skinKey) {
  if (skinKey === 'sniper_mario') return createMarioPipe(1);
  if (['sniper_calibrated', 'sniper_flatpack', 'sniper_kintsugi'].includes(skinKey)) {
    return createHeavyWeapon('sniper', skinKey, 1);
  }
  const group = new THREE.Group();
  const skin = typeof WEAPON_SKINS !== 'undefined'
    ? WEAPON_SKINS.sniper?.find(entry => entry.key === skinKey)
    : null;
  const body = material(skin?.bulletColor || '#354854', 0.72, 0.24);
  const dark = material('#17242c', 0.55, 0.3);
  const glass = new THREE.MeshPhysicalMaterial({
    color: '#7fd4e0', emissive: '#153f48', emissiveIntensity: 0.35,
    metalness: 0.1, roughness: 0.08, transparent: true, opacity: 0.68,
  });
  const addBox = (w, h, d, x, y, z, mat, radius = 0.035) => {
    const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(radius, w / 3, h / 3, d / 3)), mat);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  };
  addBox(0.22, 0.2, 0.86, 0, 0, -0.46, body);
  addBox(0.13, 0.13, 0.55, 0, 0, -1.15, dark, 0.025);
  addBox(0.2, 0.16, 0.3, 0, -0.015, 0.12, body);
  const grip = addBox(0.13, 0.28, 0.13, 0, -0.2, -0.12, dark, 0.025);
  grip.rotation.x = -0.18;
  addBox(0.12, 0.1, 0.42, 0, 0.2, -0.5, dark, 0.025);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.047, 24), glass);
  lens.position.set(0, 0.2, -0.714);
  lens.rotation.y = Math.PI;
  group.add(lens);
  return group;
}

export function createLoadoutWeapon(weaponKey, skinKey) {
  if (weaponKey === 'shotgun') return createShotgun(skinKey, 1);
  if (weaponKey === 'autoRifle') return createAutoRifle(skinKey, 1);
  if (weaponKey === 'pistol') return createPistol(skinKey, 0.9);
  if (weaponKey === 'miniGun') return createHeavyWeapon('miniGun', skinKey, 1);
  if (weaponKey === 'sniper') return createStandardSniper(skinKey);
  return createAutoRifle(skinKey, 1);
}


// Fittings use character-space anchors. Add only the foundation belonging to
// that slot so the item preview is the same piece the character really wears.
export function createArmorDisplay(key) {
  const definition=globalThis.ARMOR.CATALOG[key];
  if(!definition)return new THREE.Group();
  const style=armorStyle(key), group=new THREE.Group();
  const shell=material(style.color,style.metalness??.35,style.roughness??.38), dark=material(style.dark,style.darkMetalness??.22,style.darkRoughness??.54);
  const box=(w,h,d,x,y,z,mat=dark,r=.06)=>{
    const mesh=new THREE.Mesh(new RoundedBoxGeometry(w,h,d,3,Math.min(r,w/3,h/3,d/3)),mat);
    mesh.position.set(x,y,z);group.add(mesh);return mesh;
  };
  if(definition.slot==='helmet') {
    group.add(createArmorFitting(key));
    const head=new THREE.Mesh(new THREE.SphereGeometry(.32,24,18),shell);
    head.position.set(0,1.84,0);head.scale.set(1,1.08,.95);group.add(head);
    const visor=material(style.visor||'#153540',.7,.18);
    box(.48,.18,.16,0,1.86,-.255,visor,.07);
  } else if(definition.slot==='chest') {
    group.add(createArmorFitting(key));
  } else if(definition.slot==='gauntlets') {
    for(const side of [-1,1]) {
      const fitting=createArmorFitting(key,side);fitting.position.x=side*.22;group.add(fitting);
      box(.18,.18,.40,side*.19,-.17,-.22,dark);
      box(.18,.19,.18,side*.15,-.2,-.51,shell);
    }
  } else {
    for(const side of [-1,1]) {const fitting=createArmorFitting(key);fitting.position.x=side*.20;group.add(fitting);}
  }
  // These materials may be unused for a slot. Don't retain them needlessly.
  const used=new Set();group.traverse(child=>{if(child.material)used.add(child.material);});
  if(!used.has(shell))shell.dispose();if(!used.has(dark))dark.dispose();
  return group;
}

export function disposeLoadoutModel(object) {
  const geometries=new Set(),materials=new Set();
  object?.traverse(child=>{
    if(child.geometry&&!child.userData?.preserveGeometry)geometries.add(child.geometry);
    for(const mat of Array.isArray(child.material)?child.material:[child.material])if(mat)materials.add(mat);
  });
  geometries.forEach(geometry=>geometry.dispose());materials.forEach(mat=>mat.dispose());
}

export function visibleModelBounds(object) {
  object.updateMatrixWorld(true);
  const bounds=new THREE.Box3();
  object.traverseVisible(child=>{
    if(!child.geometry)return;
    if(!child.geometry.boundingBox)child.geometry.computeBoundingBox();
    bounds.union(child.geometry.boundingBox.clone().applyMatrix4(child.matrixWorld));
  });
  return bounds;
}

export function createLoadoutCharacter(weaponKey, skinKey, secondarySkinKey, playerColor, armorAppearance) {
  const group = new THREE.Group();
  const armor = material(playerColor, 0.45, 0.32);
  const undersuit = material('#182a35', 0.1, 0.65);
  const white = material('#d9e4de', 0.4, 0.35);
  const visor = new THREE.MeshStandardMaterial({
    color: 0x122b35,
    metalness: 0.8,
    roughness: 0.12,
    emissive: 0x185c6a,
    emissiveIntensity: 0.5,
  });
  const add = (geometry, mat, x, y, z, name, parent = group) => {
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.position.set(x, y, z);
    mesh.name = name;
    parent.add(mesh);
    return mesh;
  };
  const box = (w, h, d, x, y, z, mat, name, radius = 0.08, parent = group) => add(
    new RoundedBoxGeometry(w, h, d, 4, Math.min(radius, w / 3, h / 3, d / 3)),
    mat, x, y, z, name, parent,
  );
  const torso=box(0.72, 0.65, 0.52, 0, 1.19, 0, armor, 'body', 0.17);
  const chest=box(0.42, 0.31, 0.1, 0, 1.27, -0.28, white, 'chest-plate');
  const backPanel=box(0.46, 0.57, 0.25, 0, 1.18, 0.34, undersuit, 'back-panel');

  const helmet = add(new THREE.SphereGeometry(0.32, 24, 18), white, 0, 1.84, 0, 'helmet');
  helmet.scale.set(1, 1.08, 0.95);
  const faceVisor=box(0.48, 0.18, 0.16, 0, 1.86, -0.255, visor, 'visor', 0.07);

  const legs=[],arms=[];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.name = side < 0 ? 'left-leg' : 'right-leg';
    leg.position.set(side * 0.22, 0.88, 0);
    group.add(leg);
    legs.push(leg);
    box(0.27, 0.64, 0.3, 0, -0.34, 0, undersuit, 'leg', 0.08, leg);
    box(0.29, 0.23, 0.18, 0, -0.36, -0.12, armor, 'knee-pad', 0.08, leg);
    box(0.31, 0.19, 0.44, 0, -0.77, -0.07, white, 'boot', 0.08, leg);

    const arm = new THREE.Group();
    arm.name = side < 0 ? 'left-arm' : 'right-arm';
    arm.position.set(side * 0.47, 1.42, 0);
    group.add(arm);
    arms.push(arm);
    box(0.25, 0.3, 0.33, 0, 0, 0, armor, 'shoulder', 0.08, arm);
    box(0.2, 0.22, 0.57, -side * 0.04, -0.2, -0.23, undersuit, 'arm', 0.08, arm);
    box(0.18, 0.19, 0.18, -side * 0.07, -0.2, -0.51, white, 'hand', 0.08, arm);
  }
  fitCharacterArmor(group,{helmet,visor:faceVisor,torso,backPanel,chest,legs,arms},armorAppearance);

  // Match the third-person in-game relationship: the model origin sits
  // above and slightly inside the hand, while a separate grip passes
  // through the palm. Previously the receiver itself was centered inside
  // each hand and every weapon was substantially undersized.
  const primaryMount = new THREE.Group();
  primaryMount.name = 'held-primary';
  primaryMount.position.set(-0.27, 1.34, -0.45);
  group.add(primaryMount);
  const primary = createLoadoutWeapon(weaponKey, skinKey);
  const sniperScale = ['sniper_mario', 'sniper_calibrated', 'sniper_flatpack', 'sniper_kintsugi'].includes(skinKey) ? 1.35 : 1.05;
  const primaryScale = ({ shotgun: 1.05, autoRifle: 0.95, miniGun: 0.72, sniper: sniperScale })[weaponKey] || 0.95;
  primary.scale.multiplyScalar(primaryScale);
  primaryMount.add(primary);
  box(0.13, 0.23, 0.16, 0, -0.16, -0.12, undersuit, 'primary-grip', 0.035, primaryMount);

  const pistolMount = new THREE.Group();
  pistolMount.name = 'held-pistol';
  pistolMount.position.set(0.27, 1.34, -0.45);
  group.add(pistolMount);
  const pistol = createLoadoutWeapon('pistol', secondarySkinKey);
  // createLoadoutWeapon builds pistols at 0.9; scaling by 2/3 reproduces the
  // gameplay model's 0.6 base size (including its global 0.85 treatment).
  pistol.scale.multiplyScalar(2 / 3);
  pistolMount.add(pistol);
  box(0.13, 0.23, 0.16, 0, -0.16, -0.12, undersuit, 'pistol-grip', 0.035, pistolMount);

  const shadow = add(new THREE.CircleGeometry(0.68, 40), new THREE.MeshBasicMaterial({
    color: '#49625e', transparent: true, opacity: 0.14, depthWrite: false,
  }), 0, 0.006, 0, 'floor-shadow');
  shadow.rotation.x = -Math.PI / 2;
  group.userData = { helmet, armor, primary: primaryMount, pistol: pistolMount };
  return group;
}


export function frameLoadoutCharacter(camera, model, width, height) {
  camera.aspect=width/height;
  const railSpace=width<560?160:224;
  const tanV=Math.tan(THREE.MathUtils.degToRad(camera.fov)/2);
  const tanH=tanV*Math.max(.18,(width-railSpace)/height)*.9;
  const target=new THREE.Vector3(0,.01,0),direction=new THREE.Vector3(2.1,.52,-5.2).normalize();
  const right=new THREE.Vector3().crossVectors(camera.up,direction).normalize();
  const up=new THREE.Vector3().crossVectors(direction,right).normalize();
  const point=new THREE.Vector3();
  model.updateWorldMatrix(true,true);
  let distance=1.25;
  // Fit each visible part, not the empty corners of the character's overall
  // bounding box. This keeps the body prominent while a long rifle clears the
  // slots. Runs only on equipment changes and resizing, never per frame.
  model.traverseVisible(child=>{
    if(!child.geometry)return;
    if(!child.geometry.boundingBox)child.geometry.computeBoundingBox();
    const bounds=child.geometry.boundingBox;
    for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]) {
      point.set(x,y,z).applyMatrix4(child.matrixWorld).sub(target);
      distance=Math.max(distance,point.dot(direction)+Math.max(Math.abs(point.dot(right))/tanH,Math.abs(point.dot(up))/(tanV*.84)));
    }
  });
  camera.position.copy(direction.multiplyScalar(distance).add(target));camera.lookAt(target);
  camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
}
