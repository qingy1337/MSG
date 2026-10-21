import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const KINTSUGI_GLOW_DURATION = 1;

export function heavyWeaponViewYOffset(skinKey) {
  // Seat Midas's integrated grip deeper into the first-person hand without
  // changing how the weapon sits on remote character models.
  return skinKey === 'miniGun_midas' ? -0.045 : 0;
}

export function heavyWeaponMuzzleYOffset(skinKey) {
  if (skinKey === 'sniper_calibrated') return 0.022;
  if (skinKey === 'sniper_kintsugi') return 0.01;
  return 0;
}

export function heavyWeaponViewScale(skinKey) {
  return 1;
}

export function heavyWeaponViewZ(skinKey) {
  return -0.32;
}

export function heavyWeaponMuzzleDepth(skinKey) {
  if (skinKey === 'miniGun_midas') return 1.234;
  if (skinKey === 'sniper_calibrated') return 1.1;
  if (skinKey === 'sniper_kintsugi') return 1.165;
  if (skinKey === 'sniper_flatpack') return 1.055;
  return 1;
}

function findKintsugiModel(root) {
  if (!root) return null;
  if (root.userData?.kintsugiGold) return root;
  if(Object.hasOwn(root.userData||{},'kintsugiModelCache'))return root.userData.kintsugiModelCache;
  let model = null;
  root.traverse?.(object => { if (!model && object.userData?.kintsugiGold) model = object; });
  if(root.userData)root.userData.kintsugiModelCache=model;
  return model;
}

export function triggerHeavyWeaponSkin(root, now = 0) {
  const model = findKintsugiModel(root);
  if (model) model.userData.kintsugiShotAt = now;
}

// Each repair curve gets two traveling energy packets, but they are rendered
// as one InstancedMesh. That keeps the molten flow readable without turning a
// premium skin into dozens of draw calls for every player carrying it.
export function attachKintsugiFlow(model, curves, radius = 0.006,
  {packetsPerCurve=2,haloScale=0}={}) {
  if (!model || !curves?.length) return null;
  const points=[];
  for(let index=0;index<curves.length;index++)for(let packet=0;packet<packetsPerCurve;packet++)points.push({
    curve:curves[index],phase:(index*0.173+packet/packetsPerCurve)%1,
    speed:0.16+(index%4)*0.018,size:packet?0.76:1,
  });
  const material=new THREE.MeshBasicMaterial({
    name:'Kintsugi flowing gold',color:'#ffd36b',transparent:true,opacity:0.82,
    depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,
  });
  const mesh=new THREE.InstancedMesh(new THREE.SphereGeometry(radius,8,6),material,points.length);
  mesh.name='kintsugi-flow';mesh.castShadow=false;mesh.receiveShadow=false;mesh.frustumCulled=false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);model.add(mesh);
  let halo=null,haloMaterial=null;
  if(haloScale>0) {
    haloMaterial=new THREE.MeshBasicMaterial({
      name:'Kintsugi flowing halo',color:'#ffb936',transparent:true,opacity:0.2,
      depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,
    });
    halo=new THREE.InstancedMesh(mesh.geometry,haloMaterial,points.length);
    halo.name='kintsugi-flow-halo';halo.castShadow=false;halo.receiveShadow=false;halo.frustumCulled=false;
    halo.instanceMatrix.setUsage(THREE.DynamicDrawUsage);model.add(halo);
  }
  const dummy=new THREE.Object3D();
  for(let index=0;index<points.length;index++) {
    const packet=points[index];dummy.position.copy(packet.curve.getPointAt(packet.phase));
    dummy.scale.setScalar(packet.size);dummy.updateMatrix();mesh.setMatrixAt(index,dummy.matrix);
    if(halo){dummy.scale.setScalar(packet.size*haloScale);dummy.updateMatrix();halo.setMatrixAt(index,dummy.matrix);}
  }
  mesh.instanceMatrix.needsUpdate=true;
  if(halo)halo.instanceMatrix.needsUpdate=true;
  model.userData.kintsugiFlow={mesh,material,halo,haloMaterial,haloScale,points,dummy,
    baseColor:new THREE.Color('#ffd36b'),hotColor:new THREE.Color('#fff7cf')};
  return mesh;
}

export function poseHeavyWeaponSkin(root, now = 0) {
  const model = findKintsugiModel(root);
  if (!model) return;
  const age = Math.max(0, now - (model.userData.kintsugiShotAt ?? -10));
  const progress = THREE.MathUtils.clamp(age / KINTSUGI_GLOW_DURATION, 0, 1);
  // Stay brilliant long enough to read during recoil, then ease naturally
  // back into the restrained molten-gold idle finish over a full second.
  const pulse = Math.pow(1 - progress, 1.35);
  model.userData.kintsugiGold.emissiveIntensity = model.userData.kintsugiBaseGlow + pulse * 8.8;
  const flow=model.userData.kintsugiFlow;
  if(flow) {
    const idle=0.5+0.5*Math.sin(now*5.2);
    for(let index=0;index<flow.points.length;index++) {
      const packet=flow.points[index],travel=(packet.phase+now*packet.speed)%1;
      flow.dummy.position.copy(packet.curve.getPointAt(travel));
      const shimmer=0.82+0.18*Math.sin(now*8.5+index*1.7);
      flow.dummy.scale.setScalar(packet.size*(shimmer+pulse*0.9));
      flow.dummy.updateMatrix();flow.mesh.setMatrixAt(index,flow.dummy.matrix);
      if(flow.halo) {
        flow.dummy.scale.setScalar(packet.size*(shimmer+pulse*0.9)*flow.haloScale);
        flow.dummy.updateMatrix();flow.halo.setMatrixAt(index,flow.dummy.matrix);
      }
    }
    flow.mesh.instanceMatrix.needsUpdate=true;
    if(flow.halo)flow.halo.instanceMatrix.needsUpdate=true;
    flow.material.opacity=Math.min(1,0.7+idle*0.18+pulse*0.28);
    flow.material.color.copy(flow.baseColor).lerp(flow.hotColor,pulse*0.82);
    if(flow.haloMaterial) {
      flow.haloMaterial.opacity=Math.min(0.6,0.13+idle*0.06+pulse*0.4);
      flow.haloMaterial.color.copy(flow.baseColor).lerp(flow.hotColor,0.25+pulse*0.75);
    }
  }
}

export function createHeavyWeapon(weapon, skinKey, length) {
  const group = new THREE.Group(); group.scale.setScalar(length);
  const mat = (color, metalness = 0.5) => new THREE.MeshStandardMaterial({ color, metalness, roughness: 0.38 });
  const black = mat('#151e28'), steel = mat('#bac3d1', 0.75);
  const poison = skinKey === 'miniGun_poison', infiniti = skinKey === 'miniGun_infiniti';
  const midas = skinKey === 'miniGun_midas';
  const accent = weapon === 'sniper' || poison ? mat(poison ? '#23ad17' : '#9241b5') : steel;
  const add = (geometry, material, x, y, z, name) => {
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); mesh.name = name;
    mesh.castShadow = mesh.receiveShadow = true; group.add(mesh); return mesh;
  };
  const box = (w, h, d, x, y, z, material, name) => add(new RoundedBoxGeometry(w, h, d, 2, Math.min(0.02, w / 4, h / 4, d / 4)), material, x, y, z, name);
  const tube = (radius, depth, x, y, z, material, name) => {
    const mesh = add(new THREE.CylinderGeometry(radius, radius, depth, 16), material, x, y, z, name);
    mesh.rotation.x = Math.PI / 2; return mesh;
  };
  if (weapon === 'sniper') {
    if (skinKey === 'sniper_kintsugi') {
      const ceramic = new THREE.MeshPhysicalMaterial({
        name: 'Kintsugi charcoal ceramic', color: '#18191c', metalness: 0.08, roughness: 0.2,
        clearcoat: 0.82, clearcoatRoughness: 0.12,
      });
      const ceramicEdge = new THREE.MeshPhysicalMaterial({
        name: 'Kintsugi raised ceramic', color: '#29272b', metalness: 0.12, roughness: 0.24,
        clearcoat: 0.68, clearcoatRoughness: 0.15,
      });
      const dark = mat('#08090b', 0.35);
      dark.roughness = 0.24;
      const gold = new THREE.MeshStandardMaterial({
        name: 'Kintsugi molten gold', color: '#e3ad42', metalness: 0.88, roughness: 0.16,
        emissive: '#9c5000', emissiveIntensity: 0.24,
      });
      const lens = new THREE.MeshPhysicalMaterial({
        name: 'Kintsugi amber lens', color: '#ffcb55', emissive: '#b75b00', emissiveIntensity: 0.7,
        metalness: 0.08, roughness: 0.06, transparent: true, opacity: 0.72,
        clearcoat: 1, clearcoatRoughness: 0.02,
      });
      const flowCurves=[];
      const seam = (points, x, name = 'kintsugi-seam', radius = name==='kintsugi-seam'?0.0075:0.006) => {
        const curve = new THREE.CatmullRomCurve3(points.map(([y, z]) => new THREE.Vector3(x, y, z)));
        flowCurves.push(curve);
        return add(new THREE.TubeGeometry(curve, Math.max(8, points.length * 5), radius, 7, false), gold, 0, 0, 0, name);
      };

      // A single calm ceramic silhouette, split into fitted panels rather than
      // a default rifle covered in decoration.
      box(0.15, 0.145, 0.56, 0, 0.006, -0.34, ceramic, 'kintsugi-receiver');
      box(0.12, 0.118, 0.59, 0, 0.01, -0.855, ceramic, 'kintsugi-fore-end');
      box(0.145, 0.13, 0.23, 0, -0.002, 0.045, ceramicEdge, 'kintsugi-stock');
      box(0.128, 0.018, 0.88, 0, 0.083, -0.52, ceramicEdge, 'kintsugi-ridge');
      const grip = box(0.105, 0.245, 0.12, 0, -0.16, -0.12, dark, 'kintsugi-grip');
      grip.rotation.x = -0.16;
      box(0.109, 0.022, 0.09, 0, -0.275, -0.097, gold, 'kintsugi-grip-cap');

      // Gold joint lines read as repaired ceramic without turning the weapon
      // into a gold-striped skin.
      box(0.154, 0.151, 0.014, 0, 0.006, -0.615, gold, 'kintsugi-joint');
      tube(0.064, 0.026, 0, 0.01, -1.151, gold, 'kintsugi-muzzle-ring');
      tube(0.049, 0.032, 0, 0.01, -1.17, dark, 'kintsugi-bore');
      for (const side of [-1, 1]) {
        const x = side * 0.077;
        seam([[0.053, -0.1], [0.025, -0.22], [0.052, -0.34], [-0.02, -0.47], [0.012, -0.6]], x);
        seam([[0.025, -0.22], [-0.026, -0.27], [-0.052, -0.31]], x, 'kintsugi-branch');
        seam([[0.035, 0.115], [-0.018, 0.07], [0.036, 0.012], [-0.015, -0.07]],
          side*0.074,'kintsugi-branch',0.0064);
        const foreX = side * 0.062;
        seam([[0.02, -0.63], [-0.018, -0.75], [0.035, -0.86], [-0.025, -0.99], [0.01, -1.13]], foreX);
        seam([[0.035, -0.86], [0.057, -0.9], [0.058, -0.96]], foreX, 'kintsugi-branch');
      }
      const topCrack = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.045, 0.086, -0.21), new THREE.Vector3(0.018, 0.087, -0.31),
        new THREE.Vector3(-0.028, 0.087, -0.43), new THREE.Vector3(0.038, 0.087, -0.55),
      ]);
      flowCurves.push(topCrack);
      add(new THREE.TubeGeometry(topCrack, 20, 0.007, 7, false), gold, 0, 0, 0, 'kintsugi-top-seam');
      // Compact ceramic optic, visually seated into the upper ridge.
      box(0.052, 0.045, 0.12, 0, 0.111, -0.2, dark, 'kintsugi-scope-mount');
      tube(0.044, 0.3, 0, 0.157, -0.24, ceramic, 'kintsugi-scope');
      tube(0.049, 0.018, 0, 0.157, -0.382, gold, 'kintsugi-scope-ring');
      tube(0.049, 0.018, 0, 0.157, -0.098, gold, 'kintsugi-scope-ring');
      tube(0.035, 0.006, 0, 0.157, -0.393, lens, 'kintsugi-scope-lens');
      box(0.032, 0.018, 0.035, 0, 0.207, -0.24, gold, 'kintsugi-scope-dial');

      group.name = 'kintsugi-sniper';
      group.userData.muzzleDepth = 1.165;
      group.userData.kintsugiGold = gold;
      group.userData.kintsugiBaseGlow = 0.24;
      group.userData.kintsugiShotAt = -10;
      attachKintsugiFlow(group,flowCurves,0.0065,{packetsPerCurve:3,haloScale:1.8});
      return group;
    }
    if (skinKey === 'sniper_flatpack') {
      const cardboard = mat('#b77f43', 0.02);
      const lightCardboard = mat('#c79b62', 0.01);
      const cutEdge = mat('#654225', 0.01);
      const darkCardboard = mat('#3f2919', 0.01);

      // One extremely slim folded sleeve: taller than wide without looking chunky.
      box(0.076, 0.118, 1.04, 0, 0, -0.52, cardboard, 'cardboard-barrel');
      box(0.078, 0.008, 0.91, 0, 0.0595, -0.535, lightCardboard, 'folded-edge');
      box(0.078, 0.12, 0.016, 0, 0, -1.044, cutEdge, 'cardboard-muzzle');
      box(0.043, 0.07, 0.007, 0, 0, -1.053, black, 'cardboard-bore');

      // Same width as the sleeve, raised and pulled back over the receiver.
      box(0.06, 0.06, 0.27, 0, 0.103, -0.2, lightCardboard, 'cardboard-sight');
      const roundedSightCap = (z, name) => {
        const w = 0.052, h = 0.052, r = 0.009, depth = 0.003;
        const shape = new THREE.Shape();
        shape.moveTo(-w / 2 + r, -h / 2);
        shape.lineTo(w / 2 - r, -h / 2); shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
        shape.lineTo(w / 2, h / 2 - r); shape.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
        shape.lineTo(-w / 2 + r, h / 2); shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
        shape.lineTo(-w / 2, -h / 2 + r); shape.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
        const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
        geometry.translate(0, 0, -depth / 2);
        return add(geometry, darkCardboard, 0, 0.103, z, name);
      };
      // Sink almost the entire insert into each end, exposing only its face.
      roundedSightCap(-0.066, 'sight-rear-cap');
      roundedSightCap(-0.334, 'sight-front-cap');

      // The stock follows the same narrow center line instead of flaring outward.
      box(0.08, 0.09, 0.25, 0, -0.004, 0.125, cardboard, 'cardboard-stock');
      const grip = box(0.064, 0.16, 0.085, 0, -0.13, 0.045, cutEdge, 'cardboard-grip');
      grip.rotation.x = -0.17;
      group.userData.muzzleDepth = 1.055;
      return group;
    }
    // The slim barrel shares the receiver's upper line. All of the narrowing
    // therefore happens underneath instead of pinching inward symmetrically.
    const barrelY=0.022;
    const profile = [[0, 0], [0.04, 0], [0.052, 0.015], [0.057, 0.05],
      [0.057, 0.2], [0.051, 0.26], [0.041, 0.34], [0.035, 0.42], [0, 0.42]];
    const receiver = add(new THREE.LatheGeometry(profile.map(([r, z]) => new THREE.Vector2(r, z)), 24), black, 0, 0, 0, 'receiver');
    receiver.rotation.x = -Math.PI / 2; receiver.scale.x = 0.88;
    tube(0.035, 0.74, 0, barrelY, -0.69, black, 'precision-barrel');
    for (const side of [-1, 1]) {
      box(0.016, 0.027, 0.68, side * 0.06, barrelY, -0.64, accent, 'purple-rail');
      const tip = box(0.016, 0.027, 0.13, side * 0.047, barrelY, -1.015, accent, 'converging-tip');
      tip.rotation.y = -side * 0.2;
      const sweep = new THREE.CatmullRomCurve3([
        new THREE.Vector3(side * 0.045, 0.008, -0.08),
        new THREE.Vector3(side * 0.055, 0.017, -0.18),
        new THREE.Vector3(side * 0.06, barrelY, -0.3),
      ]);
      add(new THREE.TubeGeometry(sweep, 12, 0.009, 6, false), accent, 0, 0, 0, 'receiver-trim');
      for (let i = 0; i < 4; i++) box(0.006, 0.03, 0.007, side * 0.069, barrelY, -0.36 - i * 0.06, steel, 'calibration-mark');
    }
    box(0.035, 0.04, 0.12, 0, 0.073, -0.22, black, 'scope-mount');
    tube(0.038, 0.25, 0, 0.12, -0.24, black, 'scope');
    tube(0.042, 0.022, 0, 0.12, -0.36, accent, 'scope-ring');
    tube(0.032, 0.006, 0, 0.12, -0.112, mat('#528ba2', 0.7), 'scope-lens');
    box(0.035, 0.018, 0.035, 0, 0.162, -0.24, steel, 'adjustment-dial');
    tube(0.045, 0.05, 0, barrelY, -1.075, steel, 'muzzle');
  } else if(midas) {
    const gold = new THREE.MeshPhysicalMaterial({
      name: 'Midas gold', color: '#f1c232', metalness: 0.82, roughness: 0.19,
      clearcoat: 1, clearcoatRoughness: 0.05, emissive: '#5a4000', emissiveIntensity: 0.12,
    });
    const brightGold = new THREE.MeshPhysicalMaterial({
      name: 'Midas highlight', color: '#ffe28a', metalness: 0.78, roughness: 0.14,
      clearcoat: 1, clearcoatRoughness: 0.04,
    });
    const silver = new THREE.MeshPhysicalMaterial({
      name: 'Midas silver', color: '#bcc7cf', metalness: 0.78, roughness: 0.2,
      clearcoat: 0.86, clearcoatRoughness: 0.07,
    });
    const graphite = new THREE.MeshStandardMaterial({ color: '#171c22', metalness: 0.58, roughness: 0.29 });
    const lens = new THREE.MeshPhysicalMaterial({
      color: '#83d8ec', emissive: '#174f62', emissiveIntensity: 0.5,
      metalness: 0.08, roughness: 0.08, transparent: true, opacity: 0.46,
      depthWrite: false, side: THREE.DoubleSide,
    });

    const extrudedProfile = (shape, width, material, name, x = 0) => {
      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: width, bevelEnabled: true, bevelSegments: 3,
        bevelSize: Math.min(0.009, width * 0.12), bevelThickness: Math.min(0.007, width * 0.1),
        curveSegments: 12,
      });
      geometry.translate(0, 0, -width / 2);
      geometry.rotateY(Math.PI / 2);
      return add(geometry, material, x, 0, 0, name);
    };

    // Keep the fore-end joined to the receiver, but hold a straight rectangular
    // silhouette through nearly its full length.  Only the short muzzle stack
    // beyond it becomes round, instead of making the whole weapon one taper.
    const noseProfile = new THREE.Shape();
    noseProfile.moveTo(0.56, -0.035);
    noseProfile.lineTo(1.125, -0.035);
    noseProfile.quadraticCurveTo(1.155, -0.035, 1.155, -0.005);
    noseProfile.lineTo(1.155, 0.115);
    noseProfile.quadraticCurveTo(1.155, 0.145, 1.125, 0.145);
    noseProfile.lineTo(0.59, 0.145);
    noseProfile.quadraticCurveTo(0.56, 0.112, 0.56, -0.035);
    noseProfile.closePath();
    extrudedProfile(noseProfile, 0.137, gold, 'midas-nose-shroud');

    // Straight mirrored inlays reinforce the rectangular main body.
    const frontAccentProfile = new THREE.Shape();
    frontAccentProfile.moveTo(0.78, 0.102);
    frontAccentProfile.lineTo(1.108, 0.102);
    frontAccentProfile.quadraticCurveTo(1.125, 0.102, 1.125, 0.115);
    frontAccentProfile.quadraticCurveTo(1.125, 0.128, 1.108, 0.128);
    frontAccentProfile.lineTo(0.78, 0.128);
    frontAccentProfile.quadraticCurveTo(0.765, 0.115, 0.78, 0.102);
    frontAccentProfile.closePath();
    for (const side of [-1, 1]) {
      extrudedProfile(frontAccentProfile, 0.008, silver, 'midas-front-accent', side * 0.071);
    }

    const receiverProfile = new THREE.Shape();
    receiverProfile.moveTo(0.08, -0.035);
    receiverProfile.lineTo(0.61, -0.035);
    receiverProfile.quadraticCurveTo(0.69, -0.005, 0.65, 0.1);
    receiverProfile.lineTo(0.56, 0.148);
    receiverProfile.lineTo(0.18, 0.145);
    receiverProfile.quadraticCurveTo(0.08, 0.108, 0.08, -0.035);
    receiverProfile.closePath();
    extrudedProfile(receiverProfile, 0.145, gold, 'midas-receiver');

    // A crisp chamfered tail replaces the bulbous rounded rear. Keep its top
    // aligned with the receiver instead of arching upward behind the sight.
    const stockProfile = new THREE.Shape();
    stockProfile.moveTo(-0.05, 0.07);
    stockProfile.lineTo(-0.03, 0.045);
    stockProfile.lineTo(0.22, 0.035);
    stockProfile.lineTo(0.275, 0.065);
    stockProfile.lineTo(0.245, 0.142);
    stockProfile.lineTo(0.025, 0.145);
    stockProfile.lineTo(-0.03, 0.142);
    stockProfile.lineTo(-0.05, 0.125);
    stockProfile.closePath();
    extrudedProfile(stockProfile, 0.125, gold, 'midas-stock');

    // A compact sequence of circular pieces begins only after the rectangular
    // shell ends: silver collar, gold locking ring, then the dark barrel mouth.
    tube(0.047, 0.034, 0, 0.04, -1.165, silver, 'midas-muzzle-cap');
    tube(0.04, 0.025, 0, 0.04, -1.192, brightGold, 'midas-muzzle-ring');
    tube(0.03, 0.04, 0, 0.04, -1.216, graphite, 'midas-barrel-core');
    tube(0.026, 0.012, 0, 0.04, -1.238, graphite, 'midas-bore');

    // Original tapered side insets echo the model's layered mechanical center
    // without retaining any of its exact surface geometry.
    const panelProfile = new THREE.Shape();
    panelProfile.moveTo(0.22, -0.015);
    panelProfile.lineTo(0.5, -0.012);
    panelProfile.lineTo(0.56, 0.005);
    panelProfile.lineTo(0.5, 0.082);
    panelProfile.lineTo(0.27, 0.088);
    panelProfile.quadraticCurveTo(0.2, 0.04, 0.22, -0.015);
    panelProfile.closePath();
    for (const side of [-1, 1]) {
      extrudedProfile(panelProfile, 0.011, graphite, 'midas-side-panel', side * 0.079);
      box(0.012, 0.014, 0.18, side * 0.086, 0.105, -0.37, brightGold, 'midas-side-ridge');
    }
    box(0.078, 0.016, 0.29, 0, 0.16, -0.38, silver, 'midas-top-rail');

    // A second, rear-swept grip anchors the front half of the weapon.  Its
    // upper edge disappears into the fore-end and its lower end leans back
    // toward the firing hand, matching the useful silhouette of the Immortal
    // reference without copying its surface geometry.
    const forwardGripProfile = new THREE.Shape();
    forwardGripProfile.moveTo(0.545, -0.027);
    forwardGripProfile.lineTo(0.682, -0.021);
    forwardGripProfile.lineTo(0.598, -0.205);
    forwardGripProfile.quadraticCurveTo(0.582, -0.235, 0.548, -0.229);
    forwardGripProfile.lineTo(0.493, -0.184);
    forwardGripProfile.closePath();
    extrudedProfile(forwardGripProfile, 0.09, silver, 'midas-forward-grip');

    const forwardGripInset = new THREE.Shape();
    forwardGripInset.moveTo(0.566, -0.051);
    forwardGripInset.lineTo(0.646, -0.047);
    forwardGripInset.lineTo(0.582, -0.188);
    forwardGripInset.quadraticCurveTo(0.574, -0.204, 0.557, -0.2);
    forwardGripInset.lineTo(0.522, -0.171);
    forwardGripInset.closePath();
    for (const side of [-1, 1]) {
      extrudedProfile(forwardGripInset, 0.007, graphite, 'midas-forward-grip-inset', side * 0.049);
    }
    const forwardGripAccent = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, -0.045, -0.654),
      new THREE.Vector3(0, -0.11, -0.625),
      new THREE.Vector3(0, -0.19, -0.575),
    ]);
    add(new THREE.TubeGeometry(forwardGripAccent, 10, 0.005, 7, false), brightGold, 0, 0, 0, 'midas-forward-grip-accent');

    // The grip and curved lower brace occupy the same broad locations visible
    // in the extracted projection, while using an original simplified contour.
    const gripProfile = new THREE.Shape();
    gripProfile.moveTo(0.035, -0.045);
    gripProfile.lineTo(0.16, -0.052);
    gripProfile.quadraticCurveTo(0.15, -0.18, 0.13, -0.275);
    gripProfile.quadraticCurveTo(0.08, -0.295, 0.04, -0.27);
    gripProfile.lineTo(0.018, -0.13);
    gripProfile.quadraticCurveTo(0.018, -0.075, 0.035, -0.045);
    gripProfile.closePath();
    extrudedProfile(gripProfile, 0.1, graphite, 'midas-grip');
    box(0.104, 0.145, 0.02, 0, -0.195, -0.032, gold, 'midas-grip-spine');

    const lowerBrace = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, -0.035, -0.53),
      new THREE.Vector3(0, -0.09, -0.44),
      new THREE.Vector3(0, -0.125, -0.32),
      new THREE.Vector3(0, -0.095, -0.2),
    ]);
    add(new THREE.TubeGeometry(lowerBrace, 18, 0.012, 9, false), brightGold, 0, 0, 0, 'midas-lower-brace');
    const braceInset = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, -0.04, -0.51),
      new THREE.Vector3(0, -0.082, -0.43),
      new THREE.Vector3(0, -0.11, -0.33),
      new THREE.Vector3(0, -0.088, -0.225),
    ]);
    add(new THREE.TubeGeometry(braceInset, 16, 0.006, 8, false), graphite, 0, 0, 0, 'midas-brace-inset');

    // A low arched hood—rather than a freestanding ring—frames the circular
    // optic just above the receiver/stock junction.
    box(0.07, 0.018, 0.1, 0, 0.175, -0.235, graphite, 'midas-scope-base');
    const sightWidth = 0.086, sightHeight = 0.084;
    const sightShape = new THREE.Shape();
    sightShape.moveTo(-sightWidth / 2, -sightHeight / 2);
    sightShape.lineTo(sightWidth / 2, -sightHeight / 2);
    sightShape.lineTo(sightWidth / 2, -0.004);
    sightShape.quadraticCurveTo(sightWidth * 0.43, sightHeight * 0.48, 0, sightHeight / 2);
    sightShape.quadraticCurveTo(-sightWidth * 0.43, sightHeight * 0.48, -sightWidth / 2, -0.004);
    sightShape.closePath();
    const aperture = new THREE.Path();
    aperture.absarc(0, 0.002, 0.035, 0, Math.PI * 2, true);
    sightShape.holes.push(aperture);
    const sightGeometry = new THREE.ExtrudeGeometry(sightShape, {
      depth: 0.022, bevelEnabled: true, bevelSegments: 2, bevelSize: 0.0035, bevelThickness: 0.003,
      curveSegments: 16,
    });
    sightGeometry.translate(0, 0, -0.011);
    add(sightGeometry, silver, 0, 0.225, -0.235, 'midas-scope-housing');
    add(new THREE.TorusGeometry(0.035, 0.0015, 8, 32), graphite, 0, 0.227, -0.221, 'midas-scope-inner-ring');
    add(new THREE.CircleGeometry(0.0335, 32), lens, 0, 0.227, -0.222, 'midas-scope-lens');
    add(new THREE.CircleGeometry(0.0032, 16), new THREE.MeshBasicMaterial({ color: '#d8fbff', transparent: true, opacity: 0.9, side: THREE.DoubleSide }), 0, 0.227, -0.219, 'midas-scope-dot');

    group.userData.muzzleDepth = 1.049;
    return group;
  } else {
    tube(0.22, 0.3, 0, 0, -0.18, infiniti ? steel : black, 'motor-housing');
    for (let i = 0; i < 6; i++) {
      const angle = i * Math.PI / 3, x = Math.cos(angle) * 0.125, y = Math.sin(angle) * 0.125;
      tube(0.044, 0.69, x, y, -0.635, steel, 'rotary-barrel');
      tube(0.028, 0.006, x, y, -0.983, black, 'barrel-bore');
    }
    for (const z of [-0.36, -0.85]) add(new THREE.TorusGeometry(0.165, 0.035, 6, 24), accent, 0, 0, z, 'barrel-collar');
    box(0.12, 0.055, 0.3, 0, 0.26, -0.18, black, 'carry-handle');
    for (const z of [-0.07, -0.29]) box(0.05, 0.09, 0.045, 0, 0.21, z, black, 'handle-support');
    if (infiniti) {
      // Paired silver loops echo the original connected-circle skin.
      for (const side of [-1, 1]) for (const z of [-0.1, -0.25]) {
        const loop = add(new THREE.TorusGeometry(0.075, 0.018, 6, 16), steel, side * 0.224, 0, z, 'infinity-loop');
        loop.rotation.y = Math.PI / 2;
      }
    }
    if (poison) for (const side of [-1, 1]) {
      const leaf = add(new THREE.OctahedronGeometry(1), accent, side * 0.22, 0, -0.18, 'poison-leaf');
      leaf.scale.set(0.025, 0.13, 0.21);
      box(0.012, 0.013, 0.28, side * 0.25, 0, -0.18, steel, 'leaf-vein');
    }
  }
  return group;
}
