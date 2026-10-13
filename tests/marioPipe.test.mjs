import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createMarioPipe } from '../public/marioPipe.mjs';

test('Mario pipe retains original colors and dimensions in both weapon views', () => {
  for (const length of [0.8, 1.35]) {
    const pipe = createMarioPipe(length);
    const [body, collar, recess] = pipe.children;
    assert.equal(body.material.color.getHexString(), '42c947');
    assert.equal(collar.material.color.getHexString(), '2c962f');
    assert.equal(body.geometry.type, 'LatheGeometry');
    const bounds = new THREE.Box3().setFromObject(pipe);
    assert.ok(Math.abs(bounds.min.z + length) < 1e-6);
    assert.ok(Math.abs(bounds.max.z) < 1e-6);
    assert.ok(bounds.max.x > length * 0.19);
    assert.ok(recess.position.z > bounds.min.z, 'muzzle interior is recessed');
    pipe.traverse(object => {
      if (object.isMesh) {
        assert.equal(object.castShadow, true);
        object.geometry.dispose(); object.material.dispose();
      }
    });
  }
});
