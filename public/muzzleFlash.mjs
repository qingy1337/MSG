import * as THREE from 'three';

export function muzzleFlashScaleForWeapon(weapon) {
  if(weapon==='shotgun')return 1.65;
  if(weapon==='sniper')return 1.5;
  return 1;
}

// Reused per gun: no per-round allocation, even at minigun fire rates.
export function createMuzzleFlash(size) {
  const flash = new THREE.Group(); flash.visible = false;
  Object.assign(flash.userData, { time: 0, duration: 0.075, size });
  const material = new THREE.MeshBasicMaterial({ color: '#ffb348', transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(size, 0), material);
  core.scale.set(0.65, 0.65, 1.7); core.position.z = -size; flash.add(core);
  for (let i = 0; i < 6; i++) {
    const spark = new THREE.Mesh(new THREE.ConeGeometry(size * 0.22, size * 1.7, 4), material);
    const angle = i * Math.PI / 2;
    spark.position.set(Math.cos(angle) * size * 0.6, Math.sin(angle) * size * 0.6, -size * 0.5);
    spark.rotation.z = angle - Math.PI / 2; flash.add(spark);
  }
  return flash;
}

export function triggerMuzzleFlash(flash, random = Math.random, color = null) {
  if (!flash) return;
  const size = flash.userData.size;
  flash.userData.duration = 0.06 + random() * 0.03;
  flash.userData.time = flash.userData.duration; flash.visible = true;
  flash.rotation.z = random() * Math.PI * 2;
  flash.scale.setScalar(0.8);
  const core = flash.children[0];
  core.scale.set(0.4 + random() * 0.5, 0.4 + random() * 0.5, 0.9 + random() * 1.5);
  core.position.set((random() - 0.5) * size * 0.2, (random() - 0.5) * size * 0.2, -size);
  core.rotation.set(random(), random(), random() * Math.PI);
  if(color)core.material.color.set(color);
  else core.material.color.setHSL(0.07 + random() * 0.07, 0.9, 0.6 + random() * 0.16);
  core.material.opacity = 1;
  const sparkCount = 2 + Math.floor(random() * 5);
  for (let i = 1; i < flash.children.length; i++) {
    const spark = flash.children[i];
    spark.visible = i <= sparkCount;
    const angle = random() * Math.PI * 2, radius = size * (0.3 + random() * 0.55);
    spark.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, -size * (0.3 + random() * 0.8));
    spark.rotation.set((random() - 0.5) * 0.9, 0, angle - Math.PI / 2);
    spark.scale.set(0.5 + random() * 0.7, 0.4 + random() * 1.1, 0.5 + random() * 0.6);
    spark.userData.driftX = Math.cos(angle) * size * 5;
    spark.userData.driftY = Math.sin(angle) * size * 5;
  }
}

export function updateMuzzleFlash(flash, dt) {
  if(!flash.visible&&flash.userData.time<=0)return;
  flash.userData.time = Math.max(0, flash.userData.time - dt);
  flash.visible = flash.userData.time > 0;
  const remaining = flash.userData.time / flash.userData.duration;
  flash.children[0].material.opacity = remaining * remaining;
  flash.scale.setScalar(0.8 + (1 - remaining) * 0.4);
  if (flash.visible) for (let i = 1; i < flash.children.length; i++) {
    const spark = flash.children[i];
    spark.position.x += spark.userData.driftX * dt;
    spark.position.y += spark.userData.driftY * dt;
  }
}
