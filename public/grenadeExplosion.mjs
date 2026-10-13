import * as THREE from 'three';

export const EXPLOSION_DURATION=2.8;
// Soft procedural billboards: no downloaded textures or per-frame allocations.
const vertexShader=`varying vec2 vUv;
void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const fragmentShader=`varying vec2 vUv;
uniform float opacity,age,seed;uniform vec3 tint;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
void main(){vec2 p=vUv*2.-1.;
float n=.65*noise(p*3.5+seed+vec2(age*.35,-age*.6))+.35*noise(p*8.-seed);
float edge=1.-smoothstep(.3,.98,length(p)+(n-.5)*.32);
float a=edge*(.45+.55*n)*opacity;if(a<.005)discard;
gl_FragColor=vec4(tint*(.65+.5*n),a);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;
const HOT=new THREE.Color(0xffeead),FIRE=new THREE.Color(0xff6518),COAL=new THREE.Color(0x482d21);

export function createGrenadeExplosion(random=Math.random) {
  const group=new THREE.Group(),plane=new THREE.PlaneGeometry(1,1),chip=new THREE.IcosahedronGeometry(1,0);
  const puff=(kind,i)=>{
    const smoke=kind==='smoke',core=kind==='core';
    const material=new THREE.ShaderMaterial({vertexShader,fragmentShader,transparent:true,depthWrite:false,
      blending:smoke?THREE.NormalBlending:THREE.AdditiveBlending,
      uniforms:{opacity:{value:0},age:{value:0},seed:{value:random()*100},tint:{value:new THREE.Color(smoke?0x55534f:0xffeead)}}});
    const mesh=new THREE.Mesh(plane,material),angle=i*2.39996+random()*.6;
    mesh.userData={kind,delay:smoke?.07+random()*.15:0,
      life:core?.18:smoke?2.1+random()*.4:.4+random()*.25,
      size:core?2.5:smoke?1.3+random():.7+random()*.8,
      vx:Math.cos(angle)*(smoke?1.8:3.8),vz:Math.sin(angle)*(smoke?1.8:3.8),
      vy:smoke?1.2+random()*1.3:1+random()*3,spin:random()*Math.PI*2};
    group.add(mesh);
  };
  puff('core',0);
  for(let i=0;i<8;i++)puff('fire',i);
  for(let i=0;i<12;i++)puff('smoke',i);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(1,.018,4,48),new THREE.MeshBasicMaterial({color:0xffc786,transparent:true,depthWrite:false}));
  ring.userData.kind='ring';ring.rotation.x=Math.PI/2;group.add(ring);
  for(let i=0;i<20;i++) {
    const ember=i%3!==0,mesh=new THREE.Mesh(chip,new THREE.MeshBasicMaterial({color:ember?0xffa02e:0x49443c,transparent:true}));
    const angle=random()*Math.PI*2,speed=4+random()*9;
    mesh.userData={kind:'debris',vx:Math.cos(angle)*speed,vz:Math.sin(angle)*speed,
      vy:3+random()*8,size:.025+random()*.04,life:.5+random()*.6};group.add(mesh);
  }
  return group;
}

export function poseGrenadeExplosion(group,age,cameraQuaternion) {
  for(const mesh of group.children) {
    const d=mesh.userData,t=Math.max(0,age-(d.delay||0));
    if(d.kind==='ring') {
      mesh.visible=age<.28;mesh.scale.setScalar(.2+age*22);mesh.material.opacity=Math.max(0,1-age/.28);continue;
    }
    mesh.visible=age>=(d.delay||0)&&t<d.life;
    if(!mesh.visible)continue;
    const progress=t/d.life;
    if(d.kind==='debris') {
      mesh.position.set(d.vx*t,Math.max(0,d.vy*t-9*t*t),d.vz*t);
      mesh.scale.setScalar(d.size);mesh.rotation.set(t*12,t*9,t*6);
      mesh.material.opacity=Math.pow(1-progress,.5);continue;
    }
    const smoke=d.kind==='smoke',core=d.kind==='core';
    const travel=smoke?1-Math.exp(-t*1.8):(1-Math.exp(-t*6))*.5;
    mesh.position.set(d.vx*travel,d.vy*(smoke?t*.6:travel),d.vz*travel);
    mesh.quaternion.copy(cameraQuaternion);mesh.rotateZ(d.spin+t*.15);
    mesh.scale.setScalar(d.size*(core?1+progress*2:smoke?.5+t*1.6:1+progress*2));
    const u=mesh.material.uniforms;u.age.value=t;
    u.opacity.value=smoke?Math.min(1,t/.18)*Math.pow(1-progress,1.2)*.75:Math.pow(1-progress,1.5);
    if(!smoke)u.tint.value.copy(HOT).lerp(FIRE,Math.min(1,progress*3)).lerp(COAL,Math.max(0,(progress-.45)/.55));
  }
}
