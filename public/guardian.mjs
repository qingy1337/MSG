import * as THREE from 'three';

const shellMaterial=()=>new THREE.MeshStandardMaterial({color:0x08090d,metalness:.82,roughness:.2});
const glowMaterial=()=>new THREE.MeshStandardMaterial({color:0x241038,emissive:0xa33cff,
  emissiveIntensity:2.8,metalness:.35,roughness:.14,toneMapped:false});

export function createGuardianModel() {
  const group=new THREE.Group(),shell=shellMaterial(),glow=glowMaterial();
  const core=new THREE.Mesh(new THREE.IcosahedronGeometry(.72,2),glow);core.scale.set(1,.9,1);group.add(core);
  const armor=new THREE.Group();group.add(armor);
  // Broken overlapping plates leave a luminous equatorial seam instead of a
  // featureless ball. The missing front wedge exposes the aiming eye.
  for(let i=0;i<8;i++) {
    const plate=new THREE.Mesh(new THREE.SphereGeometry(1.08,18,10,i*Math.PI/4+.055,Math.PI/4-.11,.26,Math.PI-.52),shell);
    plate.scale.set(1,0.88,1);plate.castShadow=true;plate.receiveShadow=true;armor.add(plate);
  }
  const eye=new THREE.Mesh(new THREE.RingGeometry(.24,.38,28),glow);eye.position.set(0,0,-1.01);group.add(eye);
  const lens=new THREE.Mesh(new THREE.CircleGeometry(.22,28),new THREE.MeshBasicMaterial({color:0xe1b6ff,toneMapped:false}));
  lens.position.set(0,0,-1.018);group.add(lens);
  const orbit=new THREE.Group();group.add(orbit);
  for(let i=0;i<3;i++) {
    const panel=new THREE.Mesh(new THREE.BoxGeometry(.42,.1,.22),shell);
    const a=i*Math.PI*2/3;panel.position.set(Math.cos(a)*1.28,(i-1)*.18,Math.sin(a)*1.28);panel.rotation.y=-a;
    panel.castShadow=true;orbit.add(panel);
    const light=new THREE.Mesh(new THREE.BoxGeometry(.25,.025,.12),glow);light.position.y=.063;panel.add(light);
  }
  const shadow=new THREE.Mesh(new THREE.CircleGeometry(.72,24),new THREE.MeshBasicMaterial({color:0x08040f,transparent:true,opacity:.28,depthWrite:false}));
  shadow.rotation.x=-Math.PI/2;shadow.position.y=-1.82;group.add(shadow);
  group.scale.setScalar(1.28);
  return {group,core,armor,eye,lens,orbit,glow,shadow};
}

export function poseGuardian(model,attack,time) {
  model.group.position.y=Math.sin(time*2.1)*.1;
  model.group.rotation.z=Math.sin(time*.8)*.035;
  model.armor.rotation.y=time*.16;model.orbit.rotation.y=-time*.72;
  const charge=attack?.phase==='charge'?(attack.progress||0):attack?.phase==='burst'?.65:0;
  model.core.scale.setScalar(1+charge*.18);
  model.glow.emissiveIntensity=2.5+charge*5+Math.sin(time*8)*.25;
  model.eye.scale.setScalar(1+charge*.16);model.lens.scale.setScalar(1+charge*.2);
}

export function createGuardianProjectile() {
  const group=new THREE.Group(),material=new THREE.MeshBasicMaterial({color:0xb44cff,toneMapped:false});
  const core=new THREE.Mesh(new THREE.IcosahedronGeometry(.13,1),material);group.add(core);
  const halo=new THREE.Mesh(new THREE.SphereGeometry(.23,10,8),new THREE.MeshBasicMaterial({color:0x7826cf,transparent:true,opacity:.28,
    blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false}));group.add(halo);
  return {group,core,halo};
}

export function createGuardianExplosion() {
  const group=new THREE.Group(),rings=[];
  for(let i=0;i<3;i++) {
    const ring=new THREE.Mesh(new THREE.RingGeometry(.12,.2,28),new THREE.MeshBasicMaterial({color:i?0x8a32d7:0xe2b5ff,
      transparent:true,opacity:1,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}));
    ring.rotation.set(i===0?-Math.PI/2:i===1?0:Math.PI/2,0,0);group.add(ring);rings.push(ring);
  }
  const core=new THREE.Mesh(new THREE.IcosahedronGeometry(.3,1),new THREE.MeshBasicMaterial({color:0xf2d8ff,transparent:true,
    opacity:1,depthWrite:false,toneMapped:false}));group.add(core);
  group.userData={rings,core};return group;
}

export function poseGuardianExplosion(group,t) {
  const p=Math.min(1,t/.65),ease=1-Math.pow(1-p,3);
  group.userData.rings.forEach((ring,i)=>{ring.scale.setScalar(1+ease*(4.5+i*1.4));ring.material.opacity=(1-p)*(.9-i*.12);});
  group.userData.core.scale.setScalar(1+p*3);group.userData.core.material.opacity=Math.pow(1-p,2);
}
