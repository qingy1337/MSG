import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import skins from '../public/skins.js';
import { createAutoRifle, poseAutoRifleSkin, triggerAutoRifleSkin } from '../public/autoRifle.mjs';

test('all auto-rifle skins have detailed models at both view scales', () => {
  const signature = {
    autoRifle_default: 'receiver-inset', autoRifle_poisonivy: 'coiled-vine',
    autoRifle_cybernetic: 'blue-rail', autoRifle_christmas: 'green-stripe',
    autoRifle_thunderbird: 'thunderbird-rear-feather',
  };
  for (const skin of skins.WEAPON_SKINS.autoRifle) {
    for (const length of [0.58, 0.95]) {
      const rifle = createAutoRifle(skin.key, length);
      assert.ok(rifle.getObjectByName(signature[skin.key]), skin.key);
      for (const name of skin.key === 'autoRifle_thunderbird'
        ? ['thunderbird-receiver','thunderbird-magazine','thunderbird-muzzle',
          'thunderbird-rear-feather','thunderbird-quill','thunderbird-sight-frame','thunderbird-sight-glass']
        : ['receiver', 'magazine', 'cooling-vent', 'iron-sight', 'muzzle']) assert.ok(rifle.getObjectByName(name));
      const bounds = new THREE.Box3().setFromObject(rifle);
      assert.ok(bounds.min.z < -0.98 * length && bounds.min.z > -1.01 * length);
      if (skin.key === 'autoRifle_poisonivy') assert.ok(rifle.getObjectByName('ivy-leaf'));
      if (skin.key === 'autoRifle_cybernetic') assert.equal(rifle.getObjectByName('blue-rail').material.color.getHexString(), '38bdf8');
      if (skin.key === 'autoRifle_christmas') assert.equal(rifle.getObjectByName('receiver').material.color.getHexString(), 'c41d12');
      if (skin.key === 'autoRifle_thunderbird') {
        assert.equal(skin.bulletColor,'#ffd84d');
        assert.equal(rifle.getObjectByName('thunderbird-quill').material.emissive.getHexString(),'ffd447');
        const panels=[],quills=[];
        rifle.traverse(object=>{
          if(object.name==='thunderbird-rear-feather')panels.push(object);
          if(object.name==='thunderbird-quill')quills.push(object);
        });
        assert.equal(panels.length,8,'four feather panels per side');
        assert.equal(quills.length,8);
        for(const panel of panels) {
          const panelSize=new THREE.Vector3();
          new THREE.Box3().setFromObject(panel).getSize(panelSize);
          assert.ok(panelSize.z>length*.25 && panelSize.y>length*.03,
            'feathers are broad panels that sweep back');
          assert.ok(panel.geometry.getAttribute('normal').array.every(Number.isFinite));
        }
        const pivots=rifle.userData.thunderbird.featherPivots;
        assert.equal(pivots.length,8);
        assert.ok(pivots.every(({pivot})=>pivot.rotation.y===0));
        assert.ok(rifle.userData.thunderbird.featherSpecs.every(spec=>spec.tip<spec.root));
        assert.equal(rifle.getObjectByName('thunderbird-spine'),undefined);
        assert.equal(rifle.getObjectByName('thunderbird-crest'),undefined);
        assert.equal(rifle.getObjectByName('thunderbird-rear-sight'),undefined);
        assert.equal(rifle.getObjectByName('thunderbird-front-sight'),undefined);
        assert.ok(rifle.getObjectByName('thunderbird-sight-base').position.z>-.25);
        assert.equal(rifle.getObjectByName('thunderbird-bolt'),undefined);
        const size=new THREE.Vector3();bounds.getSize(size);
        assert.ok(size.x<length*.22 && size.y<length*.49 && size.z>length*1.05,
          'Thunderbird keeps a long, slim silhouette');
        const bodySize=new THREE.Vector3();
        new THREE.Box3().setFromObject(rifle.getObjectByName('thunderbird-receiver')).getSize(bodySize);
        assert.ok(bodySize.y>length*.2,'height comes from the continuous receiver');
        poseAutoRifleSkin(rifle, 1);
        const glow=rifle.getObjectByName('thunderbird-quill').material;
        const idle=glow.emissiveIntensity;
        triggerAutoRifleSkin(rifle, 1);
        poseAutoRifleSkin(rifle,1);
        poseAutoRifleSkin(rifle,1+1/60);
        assert.ok(glow.emissiveIntensity>idle+1);
        for(let frame=2;frame<=9;frame++)poseAutoRifleSkin(rifle,1+frame/60);
        assert.ok(Math.abs(pivots[0].pivot.rotation.y)>.09,'feathers expand during fire');
        for(let frame=10;frame<=75;frame++)poseAutoRifleSkin(rifle,1+frame/60);
        assert.ok(Math.abs(pivots[0].pivot.rotation.y)<.02,'feathers settle after fire');
        assert.ok(Math.abs(glow.emissiveIntensity-idle)<0.01);
      }
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
