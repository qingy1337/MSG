import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export function createOgreModel() {
  const group=new THREE.Group(), arms=[], legs=[];
  const skin=new THREE.MeshStandardMaterial({color:'#596354',roughness:0.92});
  const armor=new THREE.MeshStandardMaterial({color:'#343840',roughness:0.67,metalness:0.6});
  const edge=new THREE.MeshStandardMaterial({color:'#827866',roughness:0.58,metalness:0.65});
  const dark=new THREE.MeshStandardMaterial({color:'#191d20',roughness:0.95});
  const bone=new THREE.MeshStandardMaterial({color:'#d7c7a5',roughness:0.7});
  const glow=new THREE.MeshStandardMaterial({color:'#b786eb',emissive:'#7420d4',emissiveIntensity:0.8,metalness:0.25,roughness:0.25,flatShading:true});
  const lump=(parent,material,x,y,z,sx,sy,sz)=>{
    const mesh=new THREE.Mesh(new THREE.IcosahedronGeometry(1,2),material);
    mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
  };
  const plate=(parent,material,x,y,z,w,h,d)=>{
    const mesh=new THREE.Mesh(new RoundedBoxGeometry(w,h,d,1,Math.min(w,h,d)*0.15),material);
    mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
  };
  const torso=new THREE.Group();torso.position.y=2.5;group.add(torso);
  lump(torso,skin,0,-0.15,0.08,0.87,0.85,0.53);
  lump(torso,skin,0,0.57,0.25,0.97,0.55,0.57); // hunched trapezius/back
  lump(torso,skin,0,-0.88,0.05,0.52,0.45,0.40);
  plate(torso,dark,0,-0.82,-0.04,1.1,0.22,0.85);
  for(const side of [-1,1]) {
    const chest=plate(torso,armor,side*0.49,0.24,-0.42,0.48,0.65,0.22);
    chest.rotation.z=side*-0.18;
    for(let i=0;i<3;i++)plate(torso,i===1?edge:armor,side*0.32,-0.25-i*0.18,-0.41,0.48,0.13,0.13);
  }
  // A recessed metal socket surrounds a faceted, projecting chest crystal.
  const socket=new THREE.Mesh(new THREE.TorusGeometry(0.28,0.085,6,8),edge);
  socket.position.set(0,0.3,-0.59);torso.add(socket);
  plate(torso,dark,0,0.3,-0.53,0.6,0.65,0.10);
  const crystal=new THREE.Mesh(new THREE.OctahedronGeometry(1),glow);
  crystal.name='chest-crystal';crystal.position.set(0,0.3,-0.67);crystal.scale.set(0.23,0.38,0.22);torso.add(crystal);
  for(const side of [-1,1]) {
    const clamp=plate(torso,armor,side*0.27,0.3,-0.68,0.13,0.17,0.17);
    clamp.rotation.z=side*0.3;
  }
  // Small recessed head and a wide angular jaw, not a spherical helmet.
  lump(torso,skin,0,0.79,-0.37,0.38,0.43,0.35);
  plate(torso,skin,0,0.58,-0.56,0.64,0.30,0.38);
  plate(torso,dark,0,0.62,-0.762,0.44,0.055,0.035);
  plate(torso,skin,0,0.87,-0.72,0.16,0.22,0.13);
  for(const side of [-1,1]) {
    plate(torso,dark,side*0.19,0.91,-0.665,0.25,0.15,0.15);
    plate(torso,glow,side*0.19,0.91,-0.75,0.14,0.04,0.03);
    const brow=plate(torso,skin,side*0.2,1.015,-0.70,0.31,0.12,0.20);brow.rotation.z=side*0.15;
    const tusk=new THREE.Mesh(new THREE.ConeGeometry(0.07,side<0?0.27:0.19,6),bone);
    tusk.position.set(side*0.23,0.7,-0.81);tusk.rotation.z=side*-0.18;torso.add(tusk);
    const leg=new THREE.Group();leg.position.set(side*0.40,1.22,0.06);group.add(leg);legs.push(leg);
    lump(leg,skin,0,-0.33,0,0.33,0.56,0.35);
    plate(leg,side<0?armor:edge,0,-0.61,-0.26,0.43,0.42,0.18);
    plate(leg,armor,0,-1.04,-0.14,0.55,0.32,0.75);
    const arm=new THREE.Group();arm.position.set(side*0.94,0.51,0.06);torso.add(arm);arms.push(arm);
    lump(arm,skin,side*0.05,-0.23,0,0.38,0.57,0.37);
    lump(arm,skin,side*0.10,-0.83,-0.10,0.36,0.57,0.39);
    plate(arm,armor,side*0.1,-1.04,-0.1,0.71,0.24,0.74); // restraint cuff
    plate(arm,edge,side*0.45,-1.04,-0.1,0.11,0.14,0.22);
    plate(arm,skin,side*0.13,-1.40,-0.20,0.74,0.63,0.66);
    for(let i=0;i<4;i++)plate(arm,i%2?skin:edge,side*0.13+(i-1.5)*0.16,-1.40,-0.55,0.13,0.23,0.12);
    if(side<0) {
      const pauldron=plate(arm,armor,0,0.10,0,0.96,0.46,0.98);pauldron.rotation.z=-0.16;
      plate(arm,edge,-0.40,-0.10,-0.03,0.18,0.42,0.85);
      for(let i=0;i<3;i++)plate(arm,edge,-0.28+i*0.26,0.15,-0.51,0.07,0.07,0.045);
      const scar=plate(arm,dark,-0.1,0.19,-0.50,0.36,0.045,0.025);scar.rotation.z=0.5;
    } else {
      const strap=plate(arm,dark,0,-0.1,0,0.70,0.14,0.76);strap.rotation.z=-0.25;
      plate(arm,armor,0.2,-0.54,-0.38,0.4,0.42,0.12);
    }
  }
  const effects=new THREE.Group();group.add(effects);
  const ring=new THREE.Mesh(new THREE.RingGeometry(0.92,1,64),new THREE.MeshBasicMaterial({color:'#ce78ff',transparent:true,opacity:0.5,side:THREE.DoubleSide,depthWrite:false}));
  ring.rotation.x=-Math.PI/2;ring.position.y=0.06;effects.add(ring);
  const waves=Array.from({length:3},(_,i)=>{
    const wave=new THREE.Mesh(new THREE.RingGeometry(0.87,1,64),new THREE.MeshBasicMaterial({color:i?'#a77bd9':'#eee0ff',transparent:true,opacity:0,side:THREE.DoubleSide,depthWrite:false}));
    wave.rotation.x=-Math.PI/2;wave.position.y=0.08+i*0.025;effects.add(wave);return wave;
  });
  const debris=Array.from({length:12},(_,i)=>{
    const chip=new THREE.Mesh(new THREE.IcosahedronGeometry(0.08+(i%3)*0.025,0),edge);
    effects.add(chip);return chip;
  });
  const beam=new THREE.Mesh(new THREE.CylinderGeometry(1,1,1,12),new THREE.MeshBasicMaterial({color:'#a83dff',transparent:true,opacity:0.75,depthWrite:false}));
  const core=new THREE.Mesh(new THREE.CylinderGeometry(0.32,0.32,1,8),new THREE.MeshBasicMaterial({color:'#f1ccff'}));beam.add(core);effects.add(beam);
  const charge=lump(effects,glow,0,2.8,-0.7,0.1,0.1,0.1);
  effects.visible=false;
  return {group,torso,crystal,glow,arms,legs,effects,ring,waves,debris,beam,charge};
}

export function poseOgre(model,attack,world) {
  model.effects.visible=!!attack;
  model.torso.rotation.x=0;model.torso.position.y=2.5;
  model.arms.forEach((a,i)=>{a.rotation.z=(i?1:-1)*0.08;});
  model.glow.emissiveIntensity=0.8;
  model.waves.forEach(w=>w.visible=false);model.debris.forEach(d=>d.visible=false);
  if(!attack)return;
  const charging=attack.phase==='charge',p=attack.progress;
  model.ring.visible=attack.kind==='slam';model.beam.visible=attack.kind==='laser'&&!!attack.beam;
  model.charge.visible=attack.kind==='laser';
  model.charge.scale.setScalar(charging?0.1+p*0.35:0.25);
  if(attack.kind==='slam') {
    // Lift, hold, then accelerate both fists down during the last 220 ms.
    // Contact coincides with the server's damage/knockback timestamp.
    const raised=Math.min(1,p/0.65),strike=Math.pow(Math.max(0,(p-0.78)/0.22),3);
    const recover=charging?0:Math.max(0,(p-0.25)/0.75);
    model.arms.forEach(a=>a.rotation.x=charging?-2.7*raised*(1-strike)-0.25*strike:-0.25*(1-recover));
    model.torso.rotation.x=charging?0.12*raised*(1-strike)-0.30*strike:-0.30*(1-recover);
    model.torso.position.y=charging?2.5-0.08*raised-1.32*strike:1.1+1.4*recover;
    model.ring.visible=charging;
    model.ring.scale.setScalar(5.25);
    model.ring.material.opacity=0.2+0.4*p;
    if(!charging) {
      model.waves.forEach((wave,i)=>{
        const t=(p-i*0.13)/(1-i*0.13);
        wave.visible=t>=0&&t<1;
        wave.scale.setScalar(0.25+5*Math.sqrt(Math.max(0,t)));
        wave.material.opacity=(1-Math.max(0,t))*(i?0.55:0.9);
      });
      model.debris.forEach((chip,i)=>{
        const angle=i*Math.PI*2/12,radius=0.65+p*(2.2+(i%3)*0.4);
        chip.visible=p<0.8;
        chip.position.set(Math.cos(angle)*radius,0.09+Math.sin(Math.min(1,p/0.8)*Math.PI)*(0.4+(i%3)*0.18),Math.sin(angle)*radius);
        chip.rotation.set(p*8+i,p*5,i+p*6);chip.scale.setScalar(1-p);
      });
    }
  } else {
    model.arms.forEach((a,i)=>{a.rotation.x=-0.25;a.rotation.z=(i?1:-1)*(0.12+0.30*(charging?p:1));});
    model.torso.rotation.x=charging?0.12*p:0.12;
    model.glow.emissiveIntensity=charging?0.8+p*3:3.8;
    const b=attack.beam;if(!b)return;
    model.group.updateWorldMatrix(true,false);
    const start=model.group.worldToLocal(model.crystal.getWorldPosition(new THREE.Vector3()));
    model.charge.position.copy(start);
    const end=model.group.worldToLocal(world(b.endX,b.endY,b.endHeight));
    const delta=end.clone().sub(start);
    model.beam.position.copy(start).add(end).multiplyScalar(0.5);
    model.beam.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.clone().normalize());
    model.beam.scale.set(charging?0.025:0.14,Math.max(0.001,delta.length()),charging?0.025:0.14);
    model.beam.material.opacity=charging?0.3:0.8;
  }
}
