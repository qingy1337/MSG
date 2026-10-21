import { test } from 'node:test';
import assert from 'node:assert/strict';
import {createMinigunSpoolHud,READY_FLASH_MS} from '../public/minigunSpoolHud.mjs';
import * as THREE from 'three';
import skins from '../public/skins.js';
import { createHeavyWeapon,heavyWeaponMuzzleDepth,heavyWeaponMuzzleYOffset,heavyWeaponViewScale,heavyWeaponViewYOffset,heavyWeaponViewZ,KINTSUGI_GLOW_DURATION,poseHeavyWeaponSkin,triggerHeavyWeaponSkin } from '../public/heavyWeapons.mjs';
import { createMuzzleFlash, triggerMuzzleFlash, updateMuzzleFlash } from '../public/muzzleFlash.mjs';

function dispose(group) {
  const materials = new Set();
  group.traverse(object => {
    if (!object.isMesh) return;
    assert.ok(object.geometry.getAttribute('position').array.every(Number.isFinite));
    object.geometry.dispose();
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
  });
  materials.forEach(material => material.dispose());
}

test('Calibrated sniper has purple rails, scope, and calibration marks in both views', () => {
  for (const length of [0.8, 1.35]) {
    const model = createHeavyWeapon('sniper', 'sniper_calibrated', length);
    for (const name of ['scope', 'scope-lens', 'adjustment-dial', 'calibration-mark', 'converging-tip']) assert.ok(model.getObjectByName(name));
    assert.equal(model.getObjectByName('purple-rail').material.color.getHexString(), '9241b5');
    model.updateMatrixWorld(true);
    const receiver = model.getObjectByName('receiver');
    assert.equal(receiver.geometry.type, 'LatheGeometry');
    const receiverBounds = new THREE.Box3().setFromObject(receiver);
    assert.ok(receiverBounds.max.x - receiverBounds.min.x < 0.105 * length, 'receiver is narrow, not boxy');
    const barrelBounds=new THREE.Box3().setFromObject(model.getObjectByName('precision-barrel'));
    assert.ok(Math.abs(receiverBounds.max.y-barrelBounds.max.y)<1e-6,
      'thin barrel stays flush with the top of the receiver');
    assert.ok(barrelBounds.min.y>receiverBounds.min.y,
      'receiver narrows only along the underside of the barrel');
    assert.equal(model.getObjectByName('rear-fin'), undefined);
    assert.ok(model.getObjectByName('receiver-trim'));
    const scopeBounds = new THREE.Box3().setFromObject(model.getObjectByName('scope'));
    assert.ok(scopeBounds.max.x - scopeBounds.min.x < 0.09 * length, 'scope stays slim');
    assert.ok(new THREE.Box3().setFromObject(model).max.y < 0.2 * length, 'scope stays low-profile');
    assert.ok(Math.abs(new THREE.Box3().setFromObject(model).min.z + 1.1 * length) < 1e-6);
    dispose(model);
  }
});

test('Flatpack sniper is a clean cardboard box profile in both views', () => {
  const skin = skins.WEAPON_SKINS.sniper.find(entry => entry.key === 'sniper_flatpack');
  assert.equal(skin.price, 2500);
  for (const length of [0.8, 1.35]) {
    const model = createHeavyWeapon('sniper', skin.key, length);
    const barrel = model.getObjectByName('cardboard-barrel');
    const sight = model.getObjectByName('cardboard-sight');
    assert.ok(barrel && sight);
    assert.equal(barrel.material.color.getHexString(), 'b77f43');
    assert.equal(sight.material.color.getHexString(), 'c79b62');
    model.updateMatrixWorld(true);
    const barrelBounds = new THREE.Box3().setFromObject(barrel);
    const sightBounds = new THREE.Box3().setFromObject(sight);
    assert.ok(barrelBounds.max.y - barrelBounds.min.y > barrelBounds.max.x - barrelBounds.min.x,
      'barrel is taller than it is wide');
    assert.ok(barrelBounds.max.y - barrelBounds.min.y > 0.115 * length,
      'barrel has a visibly taller profile');
    assert.ok(sightBounds.max.x - sightBounds.min.x < barrelBounds.max.x - barrelBounds.min.x,
      'sight is slightly narrower than the barrel');
    assert.ok(sightBounds.max.y - sightBounds.min.y < barrelBounds.max.y - barrelBounds.min.y,
      'sight is lower-profile than the barrel');
    assert.ok(Math.abs((sightBounds.max.x - sightBounds.min.x) - (sightBounds.max.y - sightBounds.min.y)) < 1e-6,
      'sight has a square front profile');
    assert.ok(Math.abs((sightBounds.max.x - sightBounds.min.x) - 0.06 * length) < 1e-6,
      'sight keeps its compact square size');
    assert.ok(sightBounds.max.y - sightBounds.min.y > 0.05 * length,
      'sight is tall enough to read clearly');
    assert.ok(sightBounds.min.z > -0.35 * length,
      'sight sits near the player over the rear receiver');
    assert.ok(barrelBounds.max.x - barrelBounds.min.x < 0.09 * length,
      'barrel stays notably slim');
    assert.equal(model.children.filter(child => child.name === 'cardboard-sight').length, 1,
      'sight remains one uninterrupted form');
    for (const name of ['sight-rear-cap', 'sight-front-cap']) {
      const cap = model.getObjectByName(name);
      assert.ok(cap, `${name} exists`);
      assert.equal(cap.geometry.type, 'ExtrudeGeometry');
      assert.equal(cap.material.color.getHexString(), '3f2919');
      const capBounds = new THREE.Box3().setFromObject(cap);
      assert.ok(capBounds.max.x < sightBounds.max.x && capBounds.min.x > sightBounds.min.x,
        `${name} leaves a cardboard rim`);
      assert.ok((capBounds.max.x - capBounds.min.x) / (sightBounds.max.x - sightBounds.min.x) > 0.85,
        `${name} fills the framed sight opening`);
      const protrusion = name === 'sight-rear-cap'
        ? capBounds.max.z - sightBounds.max.z
        : sightBounds.min.z - capBounds.min.z;
      assert.ok(protrusion <= 0.0006 * length, `${name} is recessed rather than attached outside`);
    }
    assert.equal(model.getObjectByName('packing-tape'), undefined);
    assert.ok(model.getObjectByName('folded-edge'));
    assert.ok(model.getObjectByName('cardboard-bore'));
    dispose(model);
  }
});

test('Kintsugi sniper has bold branching repairs with continuously flowing shot-reactive gold', () => {
  const skin = skins.WEAPON_SKINS.sniper.find(entry => entry.key === 'sniper_kintsugi');
  assert.equal(skin.price, 8000);
  assert.equal(skin.bulletColor, '#f2b94f');
  for (const length of [0.8, 1.35]) {
    const model = createHeavyWeapon('sniper', skin.key, length);
    for (const name of ['kintsugi-receiver', 'kintsugi-fore-end', 'kintsugi-stock', 'kintsugi-seam',
      'kintsugi-branch', 'kintsugi-scope', 'kintsugi-scope-lens', 'kintsugi-muzzle-ring']) {
      assert.ok(model.getObjectByName(name), `${name} exists`);
    }
    assert.equal(model.getObjectByName('kintsugi-receiver').material.color.getHexString(), '18191c');
    assert.equal(model.getObjectByName('kintsugi-seam').material.color.getHexString(), 'e3ad42');
    assert.ok(model.getObjectByName('kintsugi-seam').geometry.parameters.radius>=0.0075,
      'principal gold seams are physically bold rather than hairline-thin');
    assert.ok(model.getObjectByName('kintsugi-scope').position.z > -0.3,
      'scope sits rearward near the player instead of far down the barrel');
    assert.equal(model.children.filter(child => child.name === 'kintsugi-seam').length, 4,
      'four principal seams anchor the expanded branch network');
    assert.equal(model.children.filter(child => child.name === 'kintsugi-branch').length,6,
      'the large weapon keeps a restrained set of purposeful offshoots');
    const flow=model.getObjectByName('kintsugi-flow');
    assert.ok(flow?.isInstancedMesh&&flow.count>=30,'dense flow packets cover the sniper repair network');
    const halo=model.getObjectByName('kintsugi-flow-halo');
    assert.ok(halo?.isInstancedMesh&&halo.count===flow.count,
      'the sniper alone receives a batched additive flow halo');
    const gold = model.userData.kintsugiGold;
    poseHeavyWeaponSkin(model, 1);
    assert.equal(gold.emissiveIntensity, 0.24);
    const idleMatrix=Array.from(flow.instanceMatrix.array);
    poseHeavyWeaponSkin(model,1.2);
    assert.notDeepEqual(Array.from(flow.instanceMatrix.array),idleMatrix,'molten gold travels while idle');
    triggerHeavyWeaponSkin(model, 1);
    poseHeavyWeaponSkin(model, 1);
    assert.ok(gold.emissiveIntensity > 8, 'a shot sends a brilliant pulse through the gold');
    poseHeavyWeaponSkin(model, 1.5);
    assert.ok(gold.emissiveIntensity > 3, 'the gold remains visibly energized halfway through the fade');
    poseHeavyWeaponSkin(model, 1 + KINTSUGI_GLOW_DURATION);
    assert.ok(Math.abs(gold.emissiveIntensity - 0.24) < 0.001, 'the gold settles back to its restrained idle glow');
    // Additive energy extends beyond the shell by design; it is not part of
    // the ceramic weapon silhouette measured below.
    flow.visible=false;halo.visible=false;
    model.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(model);
    assert.ok(bounds.max.x - bounds.min.x < 0.18 * length, 'ceramic silhouette and its halo stay slim');
    assert.ok(bounds.max.z - bounds.min.z > 1.18 * length, 'silhouette remains recognizably long-range');
    dispose(model);
  }
  assert.equal(heavyWeaponMuzzleDepth(skin.key), 1.165);
  assert.equal(heavyWeaponMuzzleYOffset(skin.key), 0.01);
});

test('minigun skins retain their themes while Midas is an original streamlined SMG', () => {
  for (const skin of skins.WEAPON_SKINS.miniGun) for (const length of [0.5, 0.72]) {
    const model = createHeavyWeapon('miniGun', skin.key, length);
    if(skin.key==='miniGun_midas') {
      assert.equal(skin.price,5000);
      assert.equal(model.userData.modelAsset,undefined,'Midas no longer loads third-party geometry');
      assert.equal(model.children.filter(c => c.name === 'rotary-barrel').length,0,
        'the SMG skin no longer pretends to be a six-barrel primitive model');
      for(const name of ['midas-receiver','midas-muzzle-cap','midas-muzzle-ring','midas-bore','midas-grip',
        'midas-forward-grip','midas-forward-grip-accent','midas-side-panel',
        'midas-scope-housing','midas-scope-lens','midas-scope-dot']) {
        assert.ok(model.getObjectByName(name),`${name} is part of the original Midas model`);
      }
      assert.equal(model.getObjectByName('midas-receiver').geometry.type,'ExtrudeGeometry');
      assert.equal(model.getObjectByName('midas-muzzle-cap').geometry.type,'CylinderGeometry');
      assert.equal(model.getObjectByName('midas-muzzle-ring').geometry.type,'CylinderGeometry');
      assert.equal(model.getObjectByName('midas-grip').geometry.type,'ExtrudeGeometry');
      assert.equal(model.getObjectByName('midas-scope-housing').geometry.type,'ExtrudeGeometry');
      assert.equal(model.getObjectByName('midas-scope-lens').geometry.type,'CircleGeometry');
      assert.equal(model.getObjectByName('midas-scope-lens').material.transparent,true);
      assert.equal(model.getObjectByName('midas-receiver').material.color.getHexString(),'f1c232');
      assert.equal(model.getObjectByName('midas-nose-shroud').material.color.getHexString(),'f1c232');
      assert.equal(model.getObjectByName('midas-side-panel').material.color.getHexString(),'171c22');
      const frontAccents=model.children.filter(child=>child.name==='midas-front-accent');
      assert.equal(frontAccents.length,2,'fore-end has mirrored silver inlays');
      assert.ok(frontAccents.every(accent=>accent.material.color.getHexString()==='bcc7cf'));
      const forwardGrip=model.getObjectByName('midas-forward-grip');
      const forwardGripInsets=model.children.filter(child=>child.name==='midas-forward-grip-inset');
      assert.equal(forwardGrip.material.color.getHexString(),'bcc7cf','forward grip uses the silver shell');
      assert.equal(forwardGripInsets.length,2,'forward grip has recessed panels on both sides');
      assert.ok(forwardGripInsets.every(inset=>inset.material.color.getHexString()==='171c22'));
      model.updateMatrixWorld(true);
      const bounds=new THREE.Box3().setFromObject(model);
      assert.ok(bounds.max.x-bounds.min.x<0.24*length,'gold SMG stays narrow instead of using the wide minigun drum');
      assert.ok(bounds.max.y-bounds.min.y<0.58*length,'gold SMG keeps a low, controlled vertical profile');
      const ringBounds=new THREE.Box3().setFromObject(model.getObjectByName('midas-scope-inner-ring'));
      const ringSize=ringBounds.getSize(new THREE.Vector3());
      assert.ok(Math.abs(ringSize.x-ringSize.y)<0.002*length,'reflex sight stays circular from the player view');
      const housingBounds=new THREE.Box3().setFromObject(model.getObjectByName('midas-scope-housing'));
      const lensBounds=new THREE.Box3().setFromObject(model.getObjectByName('midas-scope-lens'));
      assert.ok((lensBounds.max.x-lensBounds.min.x)/(housingBounds.max.x-housingBounds.min.x)>0.68,
        'transparent optic fills most of its thin housing');
      const receiverBounds=new THREE.Box3().setFromObject(model.getObjectByName('midas-receiver'));
      const stockBounds=new THREE.Box3().setFromObject(model.getObjectByName('midas-stock'));
      const noseBounds=new THREE.Box3().setFromObject(model.getObjectByName('midas-nose-shroud'));
      const muzzleBounds=new THREE.Box3().setFromObject(model.getObjectByName('midas-muzzle-cap'));
      const forwardGripBounds=new THREE.Box3().setFromObject(forwardGrip);
      const firingGripBounds=new THREE.Box3().setFromObject(model.getObjectByName('midas-grip'));
      assert.ok(receiverBounds.max.y>0.145*length,'receiver top remains at its taller height');
      assert.ok(receiverBounds.min.y>-0.05*length,'receiver height is trimmed only from the bottom');
      assert.ok(stockBounds.max.y<=receiverBounds.max.y+0.006*length,
        'rear stock flows into the receiver instead of rising into a hump');
      assert.ok(bounds.max.z-bounds.min.z>1.25*length,'SMG has a longer front-to-back silhouette');
      assert.ok(noseBounds.max.z>receiverBounds.min.z,'fore-end overlaps the receiver instead of hanging from an exposed barrel');
      assert.ok(noseBounds.max.x-noseBounds.min.x<=receiverBounds.max.x-receiverBounds.min.x,
        'fore-end does not flare wider than the receiver');
      assert.ok(muzzleBounds.max.x-muzzleBounds.min.x<noseBounds.max.x-noseBounds.min.x,
        'muzzle face contracts from the fore-end');
      assert.ok(forwardGripBounds.max.z<firingGripBounds.min.z,
        'the diagonal grip sits distinctly ahead of the firing hand');
      assert.ok(forwardGripBounds.max.y>receiverBounds.min.y,
        'the diagonal grip is visibly integrated into the receiver underside');
    } else {
      assert.equal(model.children.filter(c => c.name === 'rotary-barrel').length, 6);
      assert.equal(model.children.filter(c => c.name === 'barrel-bore').length, 6);
      assert.ok(model.getObjectByName('carry-handle'));
      if (skin.key === 'miniGun_infiniti') assert.equal(model.children.filter(c => c.name === 'infinity-loop').length, 4);
      if (skin.key === 'miniGun_poison') assert.equal(model.getObjectByName('poison-leaf').material.color.getHexString(), '23ad17');
    }
    dispose(model);
  }
});

test('Midas sits naturally in the first-person hand without shifting other heavy weapons', () => {
  assert.equal(heavyWeaponViewYOffset('miniGun_midas'),-0.045);
  assert.equal(heavyWeaponViewYOffset('miniGun_default'),0);
  assert.equal(heavyWeaponViewYOffset('sniper_calibrated'),0);
  assert.equal(heavyWeaponMuzzleYOffset('sniper_calibrated'),0.022);
  assert.equal(heavyWeaponMuzzleYOffset('miniGun_default'),0);
  assert.equal(heavyWeaponViewScale('miniGun_midas'),1);
  assert.equal(heavyWeaponViewScale('miniGun_default'),1);
  assert.equal(heavyWeaponViewZ('miniGun_midas'),-0.32);
  assert.equal(heavyWeaponViewZ('miniGun_default'),-0.32);
  assert.equal(heavyWeaponMuzzleDepth('miniGun_midas'),1.234);
  assert.equal(heavyWeaponMuzzleDepth('miniGun_default'),1);
  const viewModel=createHeavyWeapon('miniGun','miniGun_midas',0.5);
  viewModel.scale.setScalar(0.5*heavyWeaponViewScale('miniGun_midas'));
  viewModel.position.set(0.23,-0.2+heavyWeaponViewYOffset('miniGun_midas'),heavyWeaponViewZ('miniGun_midas'));
  viewModel.updateMatrixWorld(true);
  const gripBounds=new THREE.Box3().setFromObject(viewModel.getObjectByName('midas-grip'));
  assert.ok(gripBounds.min.y<-.34&&gripBounds.max.y>-.34,'grip passes through the hand vertically');
  assert.ok(gripBounds.min.z<-.285&&gripBounds.max.z>-.455,'grip overlaps the hand in depth');
  const bounds=new THREE.Box3().setFromObject(viewModel);
  assert.ok(bounds.max.z<-.29&&bounds.max.z>-.34,'full-size rear uses the standard first-person weapon depth');
  const flashDepth=-0.32-0.5*heavyWeaponMuzzleDepth('miniGun_midas');
  assert.ok(Math.abs(bounds.min.z-flashDepth)<0.015,'longer muzzle remains aligned with its first-person flash');
  dispose(viewModel);
});

test('small muzzle flashes trigger, fade, retrigger, and expire without allocating new meshes', () => {
  for (const size of [0.045, 0.1]) {
    const flash = createMuzzleFlash(size), children = [...flash.children];
    assert.equal(flash.visible, false);
    triggerMuzzleFlash(flash); updateMuzzleFlash(flash, 0.016);
    assert.equal(flash.visible, true);
    updateMuzzleFlash(flash, 0.04);
    assert.ok(flash.children[0].material.opacity < 1);
    for (let i = 0; i < 100; i++) { triggerMuzzleFlash(flash); updateMuzzleFlash(flash, 0.01); }
    assert.deepEqual(flash.children, children);
    updateMuzzleFlash(flash, 0.1);
    assert.equal(flash.visible, false);
    assert.equal(flash.children[0].material.opacity, 0);
    dispose(flash);
  }
});

test('each muzzle burst varies shape, spark count, tint, and timing, then expands and fades', () => {
  const flash = createMuzzleFlash(0.045);
  triggerMuzzleFlash(flash, () => 0.1);
  const first = {
    scale: flash.children[0].scale.toArray(), color: flash.children[0].material.color.getHex(),
    sparks: flash.children.slice(1).filter(s => s.visible).length, duration: flash.userData.duration,
  };
  triggerMuzzleFlash(flash, () => 0.9);
  assert.notDeepEqual(flash.children[0].scale.toArray(), first.scale);
  assert.notEqual(flash.children[0].material.color.getHex(), first.color);
  assert.notEqual(flash.children.slice(1).filter(s => s.visible).length, first.sparks);
  assert.notEqual(flash.userData.duration, first.duration);
  const startScale = flash.scale.x, startPosition = flash.children[1].position.clone();
  updateMuzzleFlash(flash, 0.016);
  assert.ok(flash.scale.x > startScale);
  assert.ok(flash.children[0].material.opacity < 1);
  assert.ok(flash.children[1].position.distanceTo(startPosition) > 0);
  dispose(flash);
});

test('premium weapon flashes can override the randomized fire color',()=>{
  const flash=createMuzzleFlash(0.045);
  triggerMuzzleFlash(flash,()=>0.4,'#5ff7ff');
  assert.equal(flash.children[0].material.color.getHexString(),'5ff7ff');
  triggerMuzzleFlash(flash,()=>0.7,'#ce70ff');
  assert.equal(flash.children[0].material.color.getHexString(),'ce70ff');
  dispose(flash);
});

test('minigun spool HUD fills beneath the crosshair, flashes ready, then clears',()=>{
  const makeElement=()=>({
    hidden:false,style:{},attributes:{},classes:new Set(),
    setAttribute(name,value){this.attributes[name]=value;},
    classList:{toggle(){}},
  });
  const track=makeElement(),fill=makeElement();
  track.classList={toggle(name,on){on?track.classes.add(name):track.classes.delete(name);}};
  const update=createMinigunSpoolHud({getElementById:id=>id==='minigun-spool-track'?track:fill});
  update(null,200);
  assert.equal(track.hidden,true);assert.equal(fill.style.width,'0%');
  update(100,200);
  assert.equal(track.hidden,false);assert.equal(fill.style.width,'50%');
  assert.equal(track.attributes['aria-valuenow'],'50');assert.equal(track.classes.has('ready'),false);
  update(200,200);
  assert.equal(fill.style.width,'100%');assert.equal(track.classes.has('ready'),true);
  update(200+READY_FLASH_MS+1,200);
  assert.equal(track.hidden,true);
});
