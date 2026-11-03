import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import skins from '../public/skins.js';
import { createAutoRifle, poseAutoRifleSkin, triggerAutoRifleSkin } from '../public/autoRifle.mjs';

test('Thunderbird fans in sequence and sustains its graduated spread during automatic fire',()=>{
  const rifle=createAutoRifle('autoRifle_thunderbird',1);
  const feathers=rifle.userData.thunderbird.featherPivots;
  const angles=()=>feathers.filter(f=>f.side===1).map(f=>Math.abs(f.pivot.rotation.y));
  const tails=[];
  rifle.traverse(o=>{if(o.name==='thunderbird-fixed-tail')tails.push([o,o.rotation.y]);});
  poseAutoRifleSkin(rifle,0);
  triggerAutoRifleSkin(rifle,0);
  for(let frame=1;frame<=480;frame++) {
    const now=frame/240;
    if(frame%20===0&&now<.75)triggerAutoRifleSkin(rifle,now);
    poseAutoRifleSkin(rifle,now);
    if(frame===5) {
      assert.ok(angles()[0]>0,'top opens first');
      assert.ok(angles().slice(1).every(a=>a===0),'lower feathers wait their turn');
    }
    if(frame===32) {
      assert.ok(angles()[1]>0,'second follows');
      assert.ok(angles().slice(2).every(a=>a===0));
    }
    if(frame===52) {
      assert.ok(angles()[2]>0,'third follows');
      assert.equal(angles()[3],0);
    }
    if(frame===168) {
      const a=angles();
      assert.ok(a[3]>.1,'automatic fire allows the bottom feather to open fully');
      assert.ok(a.every((angle,i)=>i===0||angle<a[i-1]),'spread decreases top to bottom');
      assert.ok(a[0]-a[1]<.025,'top feather stays close to the second feather');
      assert.ok(a[0]-a[1]>a[1]-a[2]&&a[1]-a[2]>a[2]-a[3],
        'differences become subtler toward the bottom');
    }
  }
  assert.ok(angles().every(a=>a<.01),'all feathers settle after firing ends');
  for(const [tail,angle] of tails)assert.equal(tail.rotation.y,angle,'rear feathers stay fixed');
  const materials=new Set();
  rifle.traverse(o=>{if(o.isMesh){o.geometry.dispose();materials.add(o.material);}});
  materials.forEach(material=>material.dispose());
});

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
        assert.equal(rifle.getObjectByName('thunderbird-quill').material.emissive.getHexString(),'ffcc00');
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
