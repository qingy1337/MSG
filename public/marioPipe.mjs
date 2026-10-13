import * as THREE from 'three';

// The original Mario Pipe skin: green shaft, broad muzzle lip, dark collar.
// Model runs from the grip at z=0 toward the muzzle along negative Z.
export function createMarioPipe(length) {
  const group = new THREE.Group();
  const green = new THREE.MeshStandardMaterial({ color: '#42c947', metalness: 0.15, roughness: 0.32 });
  const dark = new THREE.MeshStandardMaterial({ color: '#2c962f', metalness: 0.15, roughness: 0.4 });
  const interior = new THREE.MeshStandardMaterial({ color: '#103b13', roughness: 0.9 });
  const profile = [
    [0.085, 0], [0.11, 0], [0.12, 0.01], [0.12, 0.75],
    [0.19, 0.75], [0.2, 0.76], [0.2, 0.99], [0.19, 1],
    [0.095, 1], [0.085, 0.99], [0.085, 0],
  ].map(([r, y]) => new THREE.Vector2(r * length, y * length));
  const pipe = new THREE.Mesh(new THREE.LatheGeometry(profile, 32), green);
  pipe.rotation.x = -Math.PI / 2;
  group.add(pipe);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.201 * length, 0.201 * length, 0.05 * length, 32, 1, true), dark);
  band.rotation.x = -Math.PI / 2;
  band.position.z = -0.78 * length;
  group.add(band);
  // A recessed dark end keeps the muzzle visibly hollow, not a solid cap.
  const recess = new THREE.Mesh(new THREE.CircleGeometry(0.085 * length, 32), interior);
  recess.rotation.y = Math.PI;
  recess.position.z = -0.65 * length;
  group.add(recess);
  group.traverse(object => { if (object.isMesh) { object.castShadow = true; object.receiveShadow = true; } });
  return group;
}
