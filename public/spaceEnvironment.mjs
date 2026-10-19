import * as THREE from 'three';

// A lightweight, deterministic deep-space backdrop. It belongs to the stage
// so rebuilding a match also disposes it; no textures or network assets are
// required and the stars cost a single draw call.
export function createSpaceEnvironment() {
  const group=new THREE.Group();group.name='orbital-space-environment';
  const count=900,positions=new Float32Array(count*3),colors=new Float32Array(count*3);
  const golden=Math.PI*(3-Math.sqrt(5));
  for(let i=0;i<count;i++) {
    const y=1-2*(i+.5)/count,r=Math.sqrt(1-y*y),angle=i*golden;
    const radius=92+(i%11)*.42;
    positions[i*3]=Math.cos(angle)*r*radius;
    positions[i*3+1]=y*radius;
    positions[i*3+2]=Math.sin(angle)*r*radius;
    const warmth=i%17===0?0.78:i%13===0?0.88:1;
    colors[i*3]=warmth;colors[i*3+1]=Math.min(1,warmth+.1);colors[i*3+2]=1;
  }
  const starsGeometry=new THREE.BufferGeometry();
  starsGeometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
  starsGeometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
  const stars=new THREE.Points(starsGeometry,new THREE.PointsMaterial({
    size:1.35,sizeAttenuation:false,vertexColors:true,transparent:true,opacity:.92,
    depthWrite:false,fog:false,toneMapped:false,
  }));
  stars.name='orbital-starfield';stars.frustumCulled=false;group.add(stars);

  const planet=new THREE.Mesh(new THREE.SphereGeometry(13.5,40,28),new THREE.MeshStandardMaterial({
    color:'#7188b5',roughness:.94,metalness:0,emissive:'#111c35',emissiveIntensity:.18,
  }));
  planet.name='orbital-planet';planet.position.set(-47,18,-72);group.add(planet);
  const atmosphere=new THREE.Mesh(new THREE.SphereGeometry(14.15,40,28),new THREE.MeshBasicMaterial({
    color:'#8edcff',transparent:true,opacity:.13,side:THREE.BackSide,depthWrite:false,
  }));
  atmosphere.name='orbital-atmosphere';atmosphere.position.copy(planet.position);group.add(atmosphere);

  const moon=new THREE.Mesh(new THREE.SphereGeometry(2.3,20,14),new THREE.MeshStandardMaterial({
    color:'#aeb5bd',roughness:1,metalness:0,
  }));
  moon.name='orbital-moon';moon.position.set(41,26,-78);group.add(moon);
  return group;
}
