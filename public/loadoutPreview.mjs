import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createAutoRifle } from './autoRifle.mjs';
import { createPistol } from './pistol.mjs';
import { createShotgun } from './shotgun.mjs';
import { createHeavyWeapon,poseHeavyWeaponSkin } from './heavyWeapons.mjs';
import { createMarioPipe } from './marioPipe.mjs';

const canvas = document.getElementById('loadout-weapon-preview');

if (canvas) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  } catch (error) {
    console.warn('Loadout weapon preview is unavailable:', error);
    canvas.classList.add('preview-unavailable');
  }

  if (renderer) {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 30);
    const turntable = new THREE.Group();
    scene.add(turntable);

    scene.add(new THREE.HemisphereLight(0xf6ffff, 0x68827f, 2.8));
    const keyLight = new THREE.DirectionalLight(0xfff0cf, 5.2);
    keyLight.position.set(-3, 5, 4);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x54e2ca, 3.1);
    rimLight.position.set(4, 1, -5);
    scene.add(rimLight);

    let model = null;
    let modelRadius = 1;
    let modelHeight = 0.5;
    let rotationTargetY = 0.08;
    let rotationTargetX = 0;
    let dragPointerId = null;
    let dragLastX = 0;
    let dragLastY = 0;
    let renderedWeapon = '';
    let renderedSkin = '';
    let renderedSecondarySkin = '';
    let modelRequest = 0;
    let lastFrame = 0;

    function material(color, metalness = 0.65, roughness = 0.27) {
      return new THREE.MeshStandardMaterial({ color, metalness, roughness });
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

    function createModel(weaponKey, skinKey) {
      if (weaponKey === 'shotgun') return createShotgun(skinKey, 1);
      if (weaponKey === 'autoRifle') return createAutoRifle(skinKey, 1);
      if (weaponKey === 'pistol') return createPistol(skinKey, 0.9);
      if (weaponKey === 'miniGun') return createHeavyWeapon('miniGun', skinKey, 1);
      if (weaponKey === 'sniper') return createStandardSniper(skinKey);
      return createAutoRifle(skinKey, 1);
    }

    function createLoadoutCharacter(weaponKey, skinKey, secondarySkinKey) {
      const group = new THREE.Group();
      const armor = material('#59daca', 0.45, 0.32);
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
      box(0.72, 0.65, 0.52, 0, 1.19, 0, armor, 'body', 0.17);
      box(0.42, 0.31, 0.1, 0, 1.27, -0.28, white, 'chest-plate');
      box(0.46, 0.57, 0.25, 0, 1.18, 0.34, undersuit, 'back-panel');

      const helmet = add(new THREE.SphereGeometry(0.32, 24, 18), white, 0, 1.84, 0, 'helmet');
      helmet.scale.set(1, 1.08, 0.95);
      box(0.48, 0.18, 0.16, 0, 1.86, -0.255, visor, 'visor', 0.07);

      for (const side of [-1, 1]) {
        const leg = new THREE.Group();
        leg.name = side < 0 ? 'left-leg' : 'right-leg';
        leg.position.set(side * 0.22, 0.88, 0);
        group.add(leg);
        box(0.27, 0.64, 0.3, 0, -0.34, 0, undersuit, 'leg', 0.08, leg);
        box(0.29, 0.23, 0.18, 0, -0.36, -0.12, armor, 'knee-pad', 0.08, leg);
        box(0.31, 0.19, 0.44, 0, -0.77, -0.07, white, 'boot', 0.08, leg);

        const arm = new THREE.Group();
        arm.name = side < 0 ? 'left-arm' : 'right-arm';
        arm.position.set(side * 0.47, 1.42, 0);
        group.add(arm);
        box(0.25, 0.3, 0.33, 0, 0, 0, armor, 'shoulder', 0.08, arm);
        box(0.2, 0.22, 0.57, -side * 0.04, -0.2, -0.23, undersuit, 'arm', 0.08, arm);
        box(0.18, 0.19, 0.18, -side * 0.07, -0.2, -0.51, white, 'hand', 0.08, arm);
      }

      // Match the third-person in-game relationship: the model origin sits
      // above and slightly inside the hand, while a separate grip passes
      // through the palm. Previously the receiver itself was centered inside
      // each hand and every weapon was substantially undersized.
      const primaryMount = new THREE.Group();
      primaryMount.name = 'held-primary';
      primaryMount.position.set(-0.27, 1.34, -0.45);
      group.add(primaryMount);
      const primary = createModel(weaponKey, skinKey);
      const sniperScale = ['sniper_mario', 'sniper_calibrated', 'sniper_flatpack', 'sniper_kintsugi'].includes(skinKey) ? 1.35 : 1.05;
      const primaryScale = ({ shotgun: 1.05, autoRifle: 0.95, miniGun: 0.72, sniper: sniperScale })[weaponKey] || 0.95;
      primary.scale.multiplyScalar(primaryScale);
      primaryMount.add(primary);
      box(0.13, 0.23, 0.16, 0, -0.16, -0.12, undersuit, 'primary-grip', 0.035, primaryMount);

      const pistolMount = new THREE.Group();
      pistolMount.name = 'held-pistol';
      pistolMount.position.set(0.27, 1.34, -0.45);
      group.add(pistolMount);
      const pistol = createModel('pistol', secondarySkinKey);
      // createModel builds pistols at 0.9; scaling by 2/3 reproduces the
      // gameplay model's 0.6 base size (including its global 0.85 treatment).
      pistol.scale.multiplyScalar(2 / 3);
      pistolMount.add(pistol);
      box(0.13, 0.23, 0.16, 0, -0.16, -0.12, undersuit, 'pistol-grip', 0.035, pistolMount);

      const shadow = add(new THREE.CircleGeometry(0.68, 40), new THREE.MeshBasicMaterial({
        color: '#49625e', transparent: true, opacity: 0.14, depthWrite: false,
      }), 0, 0.006, 0, 'floor-shadow');
      shadow.rotation.x = -Math.PI / 2;
      group.userData = { helmet, primary: primaryMount, pistol: pistolMount };
      return group;
    }

    function disposeModel(object) {
      object?.traverse(child => {
        if (!child.userData?.preserveGeometry) child.geometry?.dispose?.();
        if (Array.isArray(child.material)) child.material.forEach(entry => entry?.dispose?.());
        else child.material?.dispose?.();
      });
    }

    function fitCamera() {
      if (!model) return;
      const width = Math.max(1, canvas.clientWidth);
      const height = Math.max(1, canvas.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();

      const verticalFov = THREE.MathUtils.degToRad(camera.fov);
      const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
      const horizontalDistance = modelRadius / Math.max(0.12, Math.tan(horizontalFov / 2));
      const verticalDistance = (modelHeight * 0.7) / Math.max(0.12, Math.tan(verticalFov / 2));
      const distance = Math.max(horizontalDistance, verticalDistance, 1.25) * 1.18;
      const direction = new THREE.Vector3(2.7, 0.52, -5.2).normalize();
      camera.position.copy(direction.multiplyScalar(distance));
      camera.lookAt(0, 0.01, 0);
    }

    async function setWeapon(weaponKey, skinKey, secondarySkinKey) {
      if (!weaponKey || (weaponKey === renderedWeapon && skinKey === renderedSkin &&
        secondarySkinKey === renderedSecondarySkin)) return;
      const request = ++modelRequest;
      renderedWeapon = weaponKey;
      renderedSkin = skinKey || '';
      renderedSecondarySkin = secondarySkinKey || '';
      canvas.classList.add('is-loading');
      let nextModel;
      try {
        nextModel = await createLoadoutCharacter(weaponKey, skinKey, secondarySkinKey);
      } catch (error) {
        if (request === modelRequest) {
          renderedWeapon = '';
          renderedSkin = '';
          renderedSecondarySkin = '';
          canvas.classList.remove('is-loading');
        }
        console.warn('Loadout preview could not be created:', error);
        return;
      }
      if (request !== modelRequest) {
        disposeModel(nextModel);
        return;
      }
      if (model) {
        turntable.remove(model);
        disposeModel(model);
      }
      model = nextModel;
      model.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(model);
      const center = bounds.getCenter(new THREE.Vector3());
      model.position.sub(center);
      model.userData.baseY = model.position.y;
      model.updateMatrixWorld(true);
      const centeredBounds = new THREE.Box3().setFromObject(model);
      const size = centeredBounds.getSize(new THREE.Vector3());
      modelRadius = Math.max(size.x, size.z) * 0.55;
      modelHeight = size.y;
      turntable.add(model);
      fitCamera();
      canvas.classList.remove('is-loading');
    }

    function resize() {
      const width = Math.max(1, Math.round(canvas.clientWidth));
      const height = Math.max(1, Math.round(canvas.clientHeight));
      renderer.setSize(width, height, false);
      fitCamera();
    }

    canvas.addEventListener('loadout-preview:update', event => {
      const { weaponKey, skinKey, secondarySkinKey } = event.detail || {};
      setWeapon(weaponKey, skinKey, secondarySkinKey);
    });
    canvas.addEventListener('pointerdown', event => {
      if (event.button !== 0 && event.pointerType === 'mouse') return;
      dragPointerId = event.pointerId;
      dragLastX = event.clientX;
      dragLastY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
      canvas.classList.add('is-dragging');
      event.preventDefault();
    });
    canvas.addEventListener('pointermove', event => {
      if (event.pointerId !== dragPointerId) return;
      const deltaX = event.clientX - dragLastX;
      const deltaY = event.clientY - dragLastY;
      dragLastX = event.clientX;
      dragLastY = event.clientY;
      rotationTargetY += deltaX * 0.012;
      rotationTargetX = THREE.MathUtils.clamp(rotationTargetX + deltaY * 0.004, -0.1, 0.1);
      event.preventDefault();
    });
    const finishDrag = event => {
      if (event.pointerId !== dragPointerId) return;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      dragPointerId = null;
      canvas.classList.remove('is-dragging');
    };
    canvas.addEventListener('pointerup', finishDrag);
    canvas.addEventListener('pointercancel', finishDrag);

    new ResizeObserver(resize).observe(canvas);
    resize();
    setWeapon(canvas.dataset.weaponKey || 'autoRifle', canvas.dataset.skinKey || '',
      canvas.dataset.secondarySkinKey || 'pistol_default');

    function frame(time) {
      requestAnimationFrame(frame);
      if (!canvas.offsetParent || time - lastFrame < 32) return;
      lastFrame = time;
      turntable.rotation.y += (rotationTargetY - turntable.rotation.y) * 0.16;
      turntable.rotation.x += (rotationTargetX - turntable.rotation.x) * 0.16;
      if(model) {
        poseHeavyWeaponSkin(model.userData.primary,time/1000);
        poseHeavyWeaponSkin(model.userData.pistol,time/1000);
      }
      renderer.render(scene, camera);
    }
    requestAnimationFrame(frame);
  }
}
