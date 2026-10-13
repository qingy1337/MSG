import * as THREE from 'three';

export const MAX_CORPSES=12,MAX_REMAINS=20;
const clamp=x=>Math.max(0,Math.min(1,x));
const ease=x=>{x=clamp(x);return x*x*(3-2*x);};

export function createCorpse(character,death) {
  const group=new THREE.Group(),model=character.group;
  group.add(model);model.position.set(0,0,0);model.rotation.set(0,0,0);model.visible=true;
  character.label.remove();character.muzzleFlash.visible=false;
  if(character.dreadTelegraph)character.dreadTelegraph.visible=false;
  character.legs.forEach(l=>l.rotation.set(0,0,0));
  character.arms.forEach(a=>a.rotation.set(0,0,0));
  // Let the gun tumble beside the body; a rigid attached barrel would prop
  // a prone corpse implausibly high above the floor.
  let droppedWeapon=null;
  if(!character.ogreModel) {
    droppedWeapon=new THREE.Group();group.add(droppedWeapon);droppedWeapon.add(character.weapon);
    character.weapon.position.set(-.27,-1.34,.7);
    character.weapon.rotation.set(0,0,0);
  }
  if(character.ogreModel) {
    const ogre=character.ogreModel;ogre.effects.visible=false;
    ogre.torso.rotation.set(0,0,0);ogre.torso.position.y=2.5;
    const points=[];
    for(const [ax,ay,bx,by] of [[0,.78,-.12,.28],[-.12,.28,.13,-.05],[.13,-.05,-.16,-.63],[-.12,.28,-.55,.1],[.13,-.05,.5,-.22]]) {
      for(const [x,y] of [[ax,ay],[bx,by]])points.push(new THREE.Vector3(x,y,-(1-Math.abs(x)-Math.abs(y))-.035));
    }
    const cracks=new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({color:'#eed2ff',toneMapped:false}));
    ogre.crystal.add(cracks);ogre.deathCracks=cracks;
  }
  const materials=new Set();
  group.traverse(o=>{if(o.isMesh){o.castShadow=false;for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}});
  for(const m of materials){m.userData.deathOpacity=m.opacity;m.alphaHash=true;m.needsUpdate=true;}
  const corpse={group,model,character,death,materials,droppedWeapon,age:0,impacted:false};
  // Once-only final-pose bounds keep the collapsed mesh above its support plane.
  poseBody(corpse,1);model.updateMatrixWorld(true);
  const bounds=new THREE.Box3();
  model.traverseVisible(o=>{if(o.isMesh){o.geometry.computeBoundingBox();bounds.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld));}});
  corpse.restOffset=-bounds.min.y+.035;
  poseBody(corpse,0);
  return corpse;
}

function poseBody(c,p) {
  const {model,character,death}=c,ogre=character.ogreModel;
  model.rotation.set(-Math.PI/2*p,0,(death.variant-1)*.2*Math.sin(p*Math.PI));
  character.legs.forEach((l,i)=>{l.rotation.x=(death.variant===1?.65:.22)*p;l.rotation.z=(i?1:-1)*.16*p;});
  character.arms.forEach((a,i)=>{a.rotation.x=(death.variant===2?-.8:.25)*p;a.rotation.z=(i?1:-1)*(.35+p*.35);});
  if(ogre){ogre.torso.position.y=2.5-.6*Math.sin(p*Math.PI);ogre.torso.rotation.x=-.12*Math.sin(p*Math.PI);}
}

export function poseCorpse(c,dt,world,supportHeight=c.death.ground) {
  c.age+=dt;
  const d=c.death,ogre=c.character.ogreModel,duration=d.ogre?1.65:.65;
  const t=clamp(c.age/duration);
  // Ogre pauses on its knees before a fast, heavy face-first impact.
  const p=d.ogre?(t<.58?.32*ease(t/.58):.32+.68*Math.pow(clamp((t-.58)/.42),2)):ease(t);
  poseBody(c,p);
  const slide=1-Math.pow(1-t,3);
  if(c.droppedWeapon) {
    c.droppedWeapon.position.set(.27+.48*slide,1.34*(1-slide)+.19*slide-c.restOffset*p,-.7+.6*slide);
    c.droppedWeapon.rotation.set(0,.5*slide,Math.PI/2*slide);
  }
  c.group.position.copy(world(d.x+(d.endX-d.x)*slide,d.y+(d.endY-d.y)*slide,
    d.height+(supportHeight-d.height)*ease(t)+c.restOffset*p+
    (!d.ogre&&d.kind==='grenade'?.65*Math.sin(t*Math.PI):0)));
  c.group.rotation.y=-d.angle-Math.PI/2+(d.variant-1)*.22;
  if(ogre){
    ogre.glow.emissiveIntensity=t<.85?(1-t)*(.5+2*Math.abs(Math.sin(c.age*34))):0;
    ogre.deathCracks.material.color.set(t<.85?'#eed2ff':'#251d2e');
    if(t>=.85)ogre.glow.color.set('#44384e');
  }
  const opacity=clamp((d.lifetime-c.age)/1.5);
  for(const m of c.materials)m.opacity=m.userData.deathOpacity*opacity;
  if(ogre)ogre.deathCracks.visible=opacity>.5;
  const impact=!c.impacted&&t===1;
  if(impact)c.impacted=true;
  return {impact,done:c.age>=d.lifetime};
}

// Analytic dust/fragments: no collision bodies, lights, or per-frame allocations.
export function createDeathRemains(death,random=Math.random) {
  const group=new THREE.Group(),dust=[],chips=[];
  const mark=new THREE.Mesh(new THREE.CircleGeometry(death.ogre?1.7:1.15,24),
    new THREE.MeshBasicMaterial({color:'#171819',transparent:true,opacity:.46,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1}));
  const pos=mark.geometry.attributes.position;
  for(let i=1;i<pos.count;i++){const size=.8+random()*.2;pos.setXY(i,pos.getX(i)*size,pos.getY(i)*size);}
  mark.rotation.x=-Math.PI/2;mark.position.y=.025;group.add(mark);
  const dustGeometry=new THREE.PlaneGeometry(1,1);
  for(let i=0;i<7;i++) {
    const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{fade:{value:0}},
      vertexShader:'varying vec2 v; void main(){v=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:'varying vec2 v; uniform float fade; void main(){float r=length(v-.5)*2.; float a=pow(max(0.,1.-r*r),2.);gl_FragColor=vec4(.36,.33,.31,a*fade);}' });
    const mesh=new THREE.Mesh(dustGeometry,material);group.add(mesh);
    dust.push({mesh,angle:i*Math.PI*2/7,speed:.8+random()});
  }
  if(death.ogre) {
    const geometry=new THREE.IcosahedronGeometry(.15,0);
    for(let i=0;i<8;i++) {
      const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:i<3?'#755388':'#50555c',roughness:.8,metalness:.5}));
      mesh.scale.set(1.2,.4,.8);group.add(mesh);
      chips.push({mesh,angle:i*Math.PI/4,speed:.5+random()*.9});
    }
  }
  group.userData={dust,chips,mark,age:0};return group;
}

export function poseDeathRemains(group,dt,cameraQuaternion) {
  const data=group.userData,t=data.age+=dt,fade=clamp((12-t)/2);
  data.mark.material.opacity=.46*fade;
  for(const {mesh,angle,speed} of data.dust) {
    mesh.visible=t<1.8;if(!mesh.visible)continue;
    mesh.position.set(Math.cos(angle)*t*speed,.15+t*.45,Math.sin(angle)*t*speed);
    mesh.quaternion.copy(cameraQuaternion);mesh.scale.setScalar(.6+t*1.6);
    mesh.material.uniforms.fade.value=.35*(1-t/1.8);
  }
  for(const {mesh,angle,speed} of data.chips) {
    const travel=Math.min(t,1),r=travel*speed;
    mesh.position.set(Math.cos(angle)*r,.09+Math.max(0,2*travel-2*travel*travel),Math.sin(angle)*r);
    mesh.rotation.set(travel*7+angle,angle,travel*4);mesh.scale.set(1.2*fade,.4*fade,.8*fade);
  }
  return t>=12;
}

export function createGrenadePickup() {
  const group=new THREE.Group();
  const body=new THREE.Mesh(new THREE.IcosahedronGeometry(.18,1),new THREE.MeshStandardMaterial({color:'#96ba62',roughness:.6,metalness:.4,emissive:'#335216',emissiveIntensity:.5}));
  const cap=new THREE.Mesh(new THREE.BoxGeometry(.14,.09,.1),new THREE.MeshStandardMaterial({color:'#b8c7ad',metalness:.7,roughness:.4}));
  cap.position.y=.2;group.add(body,cap);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(.1,.018,4,12),new THREE.MeshBasicMaterial({color:'#d4efa6'}));
  ring.position.set(.1,.23,0);group.add(ring);return group;
}
