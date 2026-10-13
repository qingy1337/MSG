import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import skins from '../public/skins.js';
import { createAutoRifle } from '../public/autoRifle.mjs';

test('all auto-rifle skins have detailed models at both view scales', () => {
  const signature = {
    autoRifle_default: 'receiver-inset', autoRifle_poisonivy: 'coiled-vine',
    autoRifle_cybernetic: 'blue-rail', autoRifle_christmas: 'green-stripe',
  };
  for (const skin of skins.WEAPON_SKINS.autoRifle) {
    for (const length of [0.58, 0.95]) {
      const rifle = createAutoRifle(skin.key, length);
      assert.ok(rifle.getObjectByName(signature[skin.key]), skin.key);
      for (const name of ['receiver', 'magazine', 'cooling-vent', 'iron-sight', 'muzzle']) assert.ok(rifle.getObjectByName(name));
      const bounds = new THREE.Box3().setFromObject(rifle);
      assert.ok(bounds.min.z < -0.98 * length && bounds.min.z > -1.01 * length);
      if (skin.key === 'autoRifle_poisonivy') assert.ok(rifle.getObjectByName('ivy-leaf'));
      if (skin.key === 'autoRifle_cybernetic') assert.equal(rifle.getObjectByName('blue-rail').material.color.getHexString(), '38bdf8');
      if (skin.key === 'autoRifle_christmas') assert.equal(rifle.getObjectByName('receiver').material.color.getHexString(), 'c41d12');
      const materials = new Set();
      rifle.traverse(object => {
        if (!object.isMesh) return;
        assert.equal(object.castShadow, true);
        assert.ok(object.geometry.getAttribute('position').array.every(Number.isFinite));
        object.geometry.dispose(); materials.add(object.material);
      });
      materials.forEach(material => material.dispose());
    }
  }
});
