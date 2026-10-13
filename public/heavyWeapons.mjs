import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export function heavyWeaponViewYOffset(skinKey) {
  // Seat Midas's integrated grip deeper into the first-person hand without
  // changing how the weapon sits on remote character models.
  return skinKey === 'miniGun_midas' ? -0.045 : 0;
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
  if (skinKey === 'sniper_flatpack') return 1.055;
  return 1;
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
    // Smooth oval receiver, narrowing continuously into the exposed barrel.
    const profile = [[0, 0], [0.04, 0], [0.052, 0.015], [0.057, 0.05],
      [0.057, 0.2], [0.051, 0.26], [0.041, 0.34], [0.035, 0.42], [0, 0.42]];
    const receiver = add(new THREE.LatheGeometry(profile.map(([r, z]) => new THREE.Vector2(r, z)), 24), black, 0, 0, 0, 'receiver');
    receiver.rotation.x = -Math.PI / 2; receiver.scale.x = 0.88;
    tube(0.035, 0.74, 0, 0, -0.69, black, 'precision-barrel');
    for (const side of [-1, 1]) {
      box(0.016, 0.027, 0.68, side * 0.06, 0, -0.64, accent, 'purple-rail');
      const tip = box(0.016, 0.027, 0.13, side * 0.047, 0, -1.015, accent, 'converging-tip');
      tip.rotation.y = -side * 0.2;
      const sweep = new THREE.CatmullRomCurve3([
        new THREE.Vector3(side * 0.045, 0, -0.08),
        new THREE.Vector3(side * 0.055, 0, -0.18),
        new THREE.Vector3(side * 0.06, 0, -0.3),
      ]);
      add(new THREE.TubeGeometry(sweep, 12, 0.009, 6, false), accent, 0, 0, 0, 'receiver-trim');
      for (let i = 0; i < 4; i++) box(0.006, 0.03, 0.007, side * 0.069, 0, -0.36 - i * 0.06, steel, 'calibration-mark');
    }
    box(0.035, 0.04, 0.12, 0, 0.073, -0.22, black, 'scope-mount');
    tube(0.038, 0.25, 0, 0.12, -0.24, black, 'scope');
    tube(0.042, 0.022, 0, 0.12, -0.36, accent, 'scope-ring');
    tube(0.032, 0.006, 0, 0.12, -0.112, mat('#528ba2', 0.7), 'scope-lens');
    box(0.035, 0.018, 0.035, 0, 0.162, -0.24, steel, 'adjustment-dial');
    tube(0.045, 0.05, 0, 0, -1.075, steel, 'muzzle');
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

    // Keep the fore-end joined to the receiver.  An earlier wide nose attached
    // by exposed barrel read as a plunger in first person; this taper overlaps
    // the receiver and contracts toward a compact muzzle instead.
    const noseProfile = new THREE.Shape();
    noseProfile.moveTo(0.56, -0.035);
    noseProfile.lineTo(1.075, -0.018);
    noseProfile.quadraticCurveTo(1.18, -0.014, 1.22, -0.005);
    noseProfile.lineTo(1.22, 0.092);
    noseProfile.quadraticCurveTo(1.18, 0.112, 1.1, 0.118);
    noseProfile.lineTo(0.59, 0.145);
    noseProfile.quadraticCurveTo(0.56, 0.112, 0.56, -0.035);
    noseProfile.closePath();
    extrudedProfile(noseProfile, 0.137, gold, 'midas-nose-shroud');

    // Thin mirrored blades add silver detail at the very front while following
    // the fore-end taper, so they read as inlays rather than bolted-on blocks.
    const frontAccentProfile = new THREE.Shape();
    frontAccentProfile.moveTo(0.78, 0.098);
    frontAccentProfile.lineTo(1.155, 0.073);
    frontAccentProfile.quadraticCurveTo(1.18, 0.079, 1.155, 0.096);
    frontAccentProfile.lineTo(0.8, 0.123);
    frontAccentProfile.quadraticCurveTo(0.775, 0.118, 0.78, 0.098);
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

    // A crisp chamfered tail replaces the bulbous rounded rear that made the
    // weapon read like a retro ray gun. Its upper silhouette stays unchanged.
    const stockProfile = new THREE.Shape();
    stockProfile.moveTo(-0.05, 0.07);
    stockProfile.lineTo(-0.03, 0.045);
    stockProfile.lineTo(0.22, 0.035);
    stockProfile.lineTo(0.275, 0.065);
    stockProfile.lineTo(0.245, 0.142);
    stockProfile.lineTo(0.025, 0.17);
    stockProfile.lineTo(-0.03, 0.155);
    stockProfile.lineTo(-0.05, 0.125);
    stockProfile.closePath();
    extrudedProfile(stockProfile, 0.125, gold, 'midas-stock');

    // Only the final barrel opening is exposed; the main barrel now lives
    // inside the continuous shell instead of becoming a skinny connector.
    tube(0.029, 0.08, 0, 0.04, -1.19, graphite, 'midas-barrel-core');
    box(0.106, 0.064, 0.018, 0, 0.04, -1.221, silver, 'midas-muzzle-cap');
    tube(0.029, 0.012, 0, 0.04, -1.234, graphite, 'midas-bore');

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
