import * as THREE from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {poseHeavyWeaponSkin} from './heavyWeapons.mjs';
import {createLoadoutCharacter,disposeLoadoutModel,frameLoadoutCharacter} from './loadoutModels.mjs';

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
    // Bake soft studio reflections once so metallic armor reads correctly
    // while the character rotates, matching the item preview lighting.
    const pmrem=new THREE.PMREMGenerator(renderer),studio=new RoomEnvironment();
    const environment=pmrem.fromScene(studio,.04);
    scene.environment=environment.texture;scene.environmentIntensity=.4;
    studio.dispose();pmrem.dispose();
    window.addEventListener('pagehide',event=>{if(!event.persisted)environment.dispose();});
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
    let rotationTargetY = 0.08;
    let rotationTargetX = 0;
    let dragPointerId = null;
    let dragLastX = 0;
    let dragLastY = 0;
    let renderedWeapon = '';
    let renderedSkin = '';
    let renderedSecondarySkin = '';
    let renderedArmor = '';
    let modelRequest = 0;
    let lastFrame = 0;

    function fitCamera() {
      if (!model) return;
      const width = Math.max(1, canvas.clientWidth);
      const height = Math.max(1, canvas.clientHeight);
      frameLoadoutCharacter(camera, model, width, height);
    }

    async function setWeapon(weaponKey, skinKey, secondarySkinKey, playerColor = canvas.dataset.playerColor || '#59daca', armorAppearance = JSON.parse(canvas.dataset.armor || '{}')) {
      const armorSignature=JSON.stringify(armorAppearance);
      model?.userData.armor.color.set(playerColor);
      if (!weaponKey || (weaponKey === renderedWeapon && skinKey === renderedSkin &&
        secondarySkinKey === renderedSecondarySkin&&armorSignature===renderedArmor)) return;
      const request = ++modelRequest;
      renderedWeapon = weaponKey;
      renderedSkin = skinKey || '';
      renderedSecondarySkin = secondarySkinKey || '';
      renderedArmor=armorSignature;
      canvas.classList.add('is-loading');
      let nextModel;
      try {
        nextModel = await createLoadoutCharacter(weaponKey, skinKey, secondarySkinKey, playerColor,armorAppearance);
        nextModel.userData.armor.color.set(canvas.dataset.playerColor || playerColor);
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
        disposeLoadoutModel(nextModel);
        return;
      }
      if (model) {
        turntable.remove(model);
        disposeLoadoutModel(model);
      }
      model = nextModel;
      model.updateMatrixWorld(true);
      // Anchor on the body, so changing gun length cannot shift the whole
      // character sideways or move the feet between equipment selections.
      model.position.set(0, -1.08, 0);
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
      const { weaponKey, skinKey, secondarySkinKey, playerColor, armorAppearance } = event.detail || {};
      setWeapon(weaponKey, skinKey, secondarySkinKey, playerColor,armorAppearance);
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
