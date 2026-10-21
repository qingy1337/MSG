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
      for (const name of ['slide-serration', 'ejection-port', 'muzzle-ring']) assert.ok(pistol.getObjectByName(name));
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
