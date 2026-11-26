import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import skins from '../public/skins.js';
import { createPistol, PISTOL_MODEL_SCALE } from '../public/pistol.mjs';
import {poseHeavyWeaponSkin,triggerHeavyWeaponSkin} from '../public/heavyWeapons.mjs';

test('every pistol skin has compact detail in both weapon views', () => {
  for (const skin of skins.WEAPON_SKINS.pistol) {
    for (const length of [0.36, 0.6]) {
      const pistol = createPistol(skin.key, length);
      const details = skin.key === 'pistol_cloudbreak'
        ? ['storm-filament', 'porcelain-cloudbank', 'muzzle-ring']
        : ['slide-serration', 'ejection-port', 'muzzle-ring'];
      for (const name of details) assert.ok(pistol.getObjectByName(name));
      if (skin.key === 'pistol_cloudbreak') {
        for (const motif of ['porcelain-cloudbank','cloud-shadow','high-cloud','setting-sun']) {
          const panels = pistol.children.filter(part => part.name === motif);
          const centers = panels.map(part => new THREE.Box3().setFromObject(part).getCenter(new THREE.Vector3()).x);
          assert.deepEqual(centers.map(Math.sign).sort(), [-1, 1], motif);
        }
      }
      if(skin.key!=='pistol_kintsugi')assert.ok(pistol.getObjectByName('front-sight'));
      if (skin.key === 'pistol_basicBlue') {
        assert.equal(pistol.getObjectByName('slide').material.color.getHexString(), '287cc4');
        assert.ok(pistol.getObjectByName('green-inlay'));
      }
      if (skin.key === 'pistol_cybernetic') {
        assert.equal(pistol.children.filter(c => c.name === 'converging-rail').length, 2);
        assert.ok(pistol.getObjectByName('energy-node'));
      }
      if (skin.key === 'pistol_pocket_dragon') {
        assert.equal(skin.price, 3000);
        assert.equal(pistol.getObjectByName('slide').material.color.getHexString(), 'a8171d');
        assert.equal(pistol.children.filter(c => c.name === 'dragon-eye').length, 2);
        assert.equal(pistol.children.filter(c => c.name === 'dragon-horn').length, 2);
        assert.equal(pistol.children.filter(c => c.name === 'dragon-whisker').length, 2);
        assert.ok(pistol.children.filter(c => c.name === 'dragon-filigree').length >= 4);
      }
      if (skin.key === 'pistol_kintsugi') {
        assert.equal(skin.price, 8000);
        assert.equal(pistol.name, 'kintsugi-pistol');
        assert.equal(pistol.getObjectByName('kintsugi-pistol-receiver').material.color.getHexString(), '18191c');
        assert.equal(pistol.getObjectByName('kintsugi-pistol-seam').material.color.getHexString(), 'e3ad42');
        assert.ok(pistol.getObjectByName('kintsugi-pistol-seam').geometry.parameters.radius>=0.012);
        assert.equal(pistol.children.filter(c => c.name === 'kintsugi-pistol-seam').length, 4);
        assert.equal(pistol.children.filter(c => c.name === 'kintsugi-pistol-branch').length,4,
          'the compact pistol uses a restrained branch network');
        assert.ok(pistol.getObjectByName('kintsugi-flow')?.isInstancedMesh);
        assert.ok(pistol.getObjectByName('kintsugi-trigger-bow'));
        assert.ok(pistol.getObjectByName('kintsugi-pistol-ridge'));
        const muzzle=pistol.getObjectByName('muzzle-ring');
        assert.ok(muzzle.geometry.parameters.radius+muzzle.geometry.parameters.tube>=0.12,
          'the gold muzzle ring frames the full ceramic nose');
        const topSeam=pistol.getObjectByName('kintsugi-pistol-top-seam');
        assert.ok(topSeam.geometry.parameters.radius>=0.011);
        const topBounds=new THREE.Box3().setFromObject(topSeam);
        assert.ok(topBounds.max.z-topBounds.min.z>length*PISTOL_MODEL_SCALE*0.75,
          'the gold top repair runs across most of the pistol');
        assert.equal(pistol.children.filter(c=>c.name==='kintsugi-pistol-top-branch').length,3,
          'the top repair forks into an asymmetrical ceramic fracture');
        assert.equal(pistol.getObjectByName('front-sight'),undefined,
          'the custom muzzle has no isolated front-sight block');
        assert.equal(pistol.getObjectByName('kintsugi-flow-halo'),undefined,
          'the compact pistol keeps its existing restrained flow treatment');
        assert.equal(pistol.userData.kintsugiGold.emissiveIntensity, 0.24);
      }
      const bounds = new THREE.Box3().setFromObject(pistol);
      const scaledLength=length*PISTOL_MODEL_SCALE;
      assert.ok(bounds.min.z > -scaledLength && bounds.min.z < -0.95 * scaledLength);
      const materials = new Set();
      pistol.traverse(object => {
        if (!object.isMesh) return;
        assert.ok(object.geometry.getAttribute('position').array.every(Number.isFinite));
        object.geometry.dispose(); materials.add(object.material);
      });
      materials.forEach(material => material.dispose());
    }
  }
});

test('Kintsugi pistol gold flares on fire and settles to its ceramic-set idle glow', () => {
  const pistol=createPistol('pistol_kintsugi',0.36),gold=pistol.userData.kintsugiGold,
    flow=pistol.getObjectByName('kintsugi-flow');
  poseHeavyWeaponSkin(pistol,2);assert.equal(gold.emissiveIntensity,0.24);
  const idleMatrix=Array.from(flow.instanceMatrix.array);poseHeavyWeaponSkin(pistol,2.2);
  assert.notDeepEqual(Array.from(flow.instanceMatrix.array),idleMatrix,'gold keeps flowing without firing');
  triggerHeavyWeaponSkin(pistol,2);poseHeavyWeaponSkin(pistol,2);
  assert.ok(gold.emissiveIntensity>8,'the complete repair network lights together');
  poseHeavyWeaponSkin(pistol,3);assert.equal(gold.emissiveIntensity,0.24);
});

test('Cloudbreak lights its own storm glass on fire and settles when changing spectators', async () => {
  const {CLOUDBREAK,findCloudbreakParts,poseCloudbreak} = await import('../public/cloudbreak.mjs');
  assert.equal(skins.WEAPON_SKINS.pistol.find(skin => skin.key === CLOUDBREAK).price, 15000);
  const glass = findCloudbreakParts(createPistol(CLOUDBREAK,.36));
  const otherGlass = findCloudbreakParts(createPistol(CLOUDBREAK,.6));
  const idle = glass.filament.emissiveIntensity;
  poseCloudbreak(glass,1);
  const restingAngle=glass.eye.rotation.y;
  poseCloudbreak(glass,2);
  assert.notEqual(glass.eye.rotation.y,restingAngle);
  poseCloudbreak(glass,2.03,.03);
  assert.ok(glass.spin > 0 && otherGlass.spin === 0);
  assert.ok(glass.filament.emissiveIntensity > idle);
  assert.equal(otherGlass.filament.emissiveIntensity,idle);
  poseCloudbreak(glass,3,Infinity);
  assert.equal(glass.filament.emissiveIntensity,idle);
});

test('Cloudbreak changes its lightning fork per shot and the wind trails outlast the bolt', async () => {
  const {createMuzzleFlash, triggerMuzzleFlash, updateMuzzleFlash} = await import('../public/muzzleFlash.mjs');
  for (const size of [.045, .1]) {
    const flash = createMuzzleFlash(size, 'pistol_cloudbreak');
    triggerMuzzleFlash(flash, () => .2);
    const bend = flash.bolt.morphTargetInfluences[0];
    updateMuzzleFlash(flash, .12);
    assert.equal(flash.bolt.visible, false);
    assert.ok(flash.visible && flash.trails.material.opacity > 0);
    triggerMuzzleFlash(flash, () => .8);
    assert.ok(flash.bolt.visible);
    assert.notEqual(flash.bolt.morphTargetInfluences[0], bend);
    updateMuzzleFlash(flash, .4);
    assert.equal(flash.visible, false);
  }
});

test('Cloudbreak forks connect successive hit positions and release their pooled tracers',async()=>{
  const {Arena3D}=await import('../public/arena3d.js');
  const arena=Object.assign(Object.create(Arena3D.prototype),{
    effects:[],stage:new THREE.Group(),characters:new Map(),tracerPool:[],freeTracers:[]
  });
  const shot={playerId:'test',bulletId:11,x:280,y:300,height:1.84,endX:320,endY:312,endHeight:1.84,
    cloudbreakChain:[{x:380,y:330,height:1.1},{x:390,y:300,height:3.1}]};
  arena.shot(shot);
  assert.equal(arena.effects.length,3);
  let start=arena.effects[0].tracer.spark.position;
  for(const {tracer} of arena.effects.slice(1)) {
    const bolt=tracer.bolt;
    assert.ok(bolt.visible&&!tracer.line.visible);
    assert.ok(bolt.position.distanceTo(start)<1e-6);
    const pos=bolt.geometry.attributes.position;
    let tip=0;
    for(let i=1;i<pos.count;i++)if(pos.getZ(i)<pos.getZ(tip))tip=i;
    const point=bolt.localToWorld(new THREE.Vector3().fromBufferAttribute(pos,tip));
    assert.ok(point.distanceTo(tracer.spark.position)<1e-5,'the lightning ends on the enemy');
    start=tracer.spark.position;
  }
  for(const {tracer} of arena.effects)arena.releaseTracer(tracer);
  arena.effects.length=0;
  arena.shot({...shot,cloudbreakChain:undefined});
  const reused=arena.effects[0].tracer;
  assert.ok(reused.line.visible&&!reused.bolt.visible);
  arena.clearObject(arena.stage);
});
