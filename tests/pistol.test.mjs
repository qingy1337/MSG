import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import skins from '../public/skins.js';
import { createPistol, PISTOL_MODEL_SCALE } from '../public/pistol.mjs';

test('every pistol skin has compact detail in both weapon views', () => {
  for (const skin of skins.WEAPON_SKINS.pistol) {
    for (const length of [0.36, 0.6]) {
      const pistol = createPistol(skin.key, length);
      for (const name of ['slide-serration', 'ejection-port', 'front-sight', 'muzzle-ring']) assert.ok(pistol.getObjectByName(name));
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
