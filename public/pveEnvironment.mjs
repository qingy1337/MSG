import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Local origin is the southwest footprint corner; geometry matches arenaMap.js.
export function createTerrainModel(s) {
  const group = new THREE.Group();
  const w = s.width * 0.05, d = s.height * 0.05, h = s.top-(s.bottom||0);
  const material = (color, metalness = 0.15) => new THREE.MeshStandardMaterial({ color, metalness, roughness: 0.7 });
  const stone = material('#a5b6b2'), dark = material('#526e70'), trim = material(s.accent || '#e7c98c');
  const add = (geometry, mat, x, y, z) => {
    const mesh = new THREE.Mesh(geometry, mat); mesh.position.set(x, y, z);
    mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); return mesh;
  };
  const box = (bw, bh, bd, x, y, z, mat = stone) =>
    add(new RoundedBoxGeometry(bw, bh, bd, 2, Math.min(0.07, bw/4, bh/4, bd/4)), mat, x,y,z);
  if(s.kind==='lift') {
    const piston=box(w-0.12,1,d-0.12,w/2,0.5,d/2,dark);
    const deck=box(w,0.16,d,w/2,-0.08,d/2,trim);
    const ribs=[];
    for(let i=1;i<=12;i++)ribs.push(box(w-0.08,0.035,d-0.08,w/2,0,d/2,i%3===0?trim:stone));
    for(let x=0.3;x<w;x+=0.5)box(0.18,0.015,d-0.2,x,0.012,d/2,dark).userData.onDeck=true;
    // Ribbed telescoping safety skirt encloses the moving mechanism.
    group.userData={piston,deck,ribs};
    poseCargoLift(group,s.top);
  } else if(s.kind==='rail') {
    const base=(x,z)=>s.axis?(s.bottom||0)+s.rise*(s.reverse?1-(s.axis==='y'?z/d:x/w):(s.axis==='y'?z/d:x/w)):(s.liftId?0:s.bottom||0);
    if(s.style==='industrial') {
      const alongX=w>d,length=alongX?w:d;
      for(let i=0,n=Math.max(1,Math.ceil(length/1.5));i<=n;i++) {
        const t=i/n,x=alongX?length*t:w/2,z=alongX?d/2:length*t;
        box(0.085,1.02,0.085,x,base(x,z)+0.51,z,dark);
      }
      const rise=s.axis?(s.reverse?-s.rise:s.rise):0;
      for(const offset of [0.52,0.98]) {
        const beam=box(alongX?Math.hypot(length,rise):0.085,0.085,alongX?0.085:Math.hypot(length,rise),
          w/2,base(w/2,d/2)+offset,d/2,offset>0.8?trim:stone);
        if(alongX)beam.rotation.z=Math.atan2(rise,length);else beam.rotation.x=-Math.atan2(rise,length);
      }
      return group;
    }
    const pane=new THREE.MeshStandardMaterial({color:'#82afbc',transparent:true,opacity:0.5,roughness:0.28,metalness:0.15});
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute([
      0,base(0,0),0,w,base(w,0),0,w,base(w,d),d,0,base(0,d),d,
      0,base(0,0)+1,0,w,base(w,0)+1,0,w,base(w,d)+1,d,0,base(0,d)+1,d,
    ],3));
    g.setIndex([0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7]);
    g.computeVertexNormals();add(g,pane,0,0,0);
    const alongX=w>d,length=alongX?w:d;
    for(let i=0,n=Math.max(1,Math.ceil(length/1.5));i<=n;i++) {
      const t=i/n,x=alongX?length*t:w/2,z=alongX?d/2:length*t;
      box(0.09,1.04,0.09,x,base(x,z)+0.5,z,dark);
    }
    const rise=s.axis?(s.reverse?-s.rise:s.rise):0;
    const beam=box(alongX?Math.hypot(length,rise):0.10,0.10,alongX?0.10:Math.hypot(length,rise),w/2,base(w/2,d/2)+1,d/2,trim);
    if(alongX)beam.rotation.z=Math.atan2(rise,length);else beam.rotation.x=-Math.atan2(rise,length);
  } else if (s.kind === 'ramp' && s.stairs) {
    const vertical=s.axis==='y',length=vertical?d:w;
    for(let i=0;i<s.steps;i++) {
      const rise=h*(i+1)/s.steps,t=s.reverse?s.steps-1-i:i;
      const x=vertical?w/2:(t+0.5)*length/s.steps,z=vertical?(t+0.5)*length/s.steps:d/2;
      box(vertical?w:length/s.steps,rise,vertical?length/s.steps:d,x,rise/2,z,dark);
      box(vertical?w-0.08:length/s.steps-0.04,0.018,vertical?length/s.steps-0.04:d-0.08,x,rise+0.012,z,trim);
    }
  } else if (s.kind === 'ramp') {
    const roof = (x,z) => h * (s.reverse ? 1 - (s.axis === 'y' ? z/d : x/w) : (s.axis === 'y' ? z/d : x/w));
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([
      0,0,0, w,0,0, w,0,d, 0,0,d,
      0,roof(0,0),0, w,roof(w,0),0, w,roof(w,d),d, 0,roof(0,d),d,
    ], 3));
    geometry.setIndex([0,1,2,0,2,3, 4,6,5,4,7,6, 0,5,1,0,4,5,
      1,6,2,1,5,6, 2,7,3,2,6,7, 3,4,0,3,7,4]);
    geometry.computeVertexNormals(); add(geometry, dark,0,0,0);
    const length = s.axis === 'y' ? d : w;
    const rise = (s.reverse ? -1 : 1) * h;
    // Shallow anti-slip treads follow the slope, without floating stair blocks.
    for (let t = 0.03; t < 0.99; t += 0.045) {
      const x = s.axis === 'y' ? w/2 : w*t, z = s.axis === 'y' ? d*t : d/2;
      const tread = box(s.axis === 'y' ? w-0.12 : 0.045, 0.018,
        s.axis === 'y' ? 0.045 : d-0.12, x,roof(x,z)+0.012,z,trim);
      if (s.axis === 'y') tread.rotation.x = Math.atan2(rise,length);
      else tread.rotation.z = Math.atan2(rise,length);
    }
  } else if(s.kind==='catwalk') {
    const steel=material('#38484c',0.65),grate=material(s.accent||'#d99149',0.55);
    box(w,h,d,w/2,h/2,d/2,steel);
    const alongX=w>=d,length=alongX?w:d,count=Math.max(3,Math.ceil(length/1.1));
    for(let i=1;i<count;i++) {
      const at=length*i/count;
      box(alongX?0.035:w-0.08,0.018,alongX?d-0.08:0.035,
        alongX?at:w/2,h+0.012,alongX?d/2:at,grate);
    }
    // Deep edge channels make the deck read as a supported steel walkway,
    // rather than another floating platform slab.
    if(alongX)for(const z of [0.10,d-0.10])box(w-0.08,0.18,0.14,w/2,-0.06,z,dark);
    else for(const x of [0.10,w-0.10])box(0.14,0.18,d-0.08,x,-0.06,d/2,dark);
  } else if(s.kind==='furnace') {
    const shell=material('#465154',0.72),hot=material('#ffb347',0.25);
    hot.emissive.set('#ff4d12');hot.emissiveIntensity=1.8;
    const radius=Math.min(w,d)*0.36;
    add(new THREE.CylinderGeometry(radius*1.08,radius*1.08,0.30,20),dark,w/2,0.15,d/2);
    add(new THREE.CylinderGeometry(radius*0.86,radius,h-0.45,16),shell,w/2,(h-0.45)/2+0.30,d/2);
    for(const y of [0.65,h*0.52,h-0.30])
      add(new THREE.TorusGeometry(radius*0.92,0.08,6,24),trim,w/2,y,d/2).rotation.x=Math.PI/2;
    add(new THREE.CylinderGeometry(radius*0.68,radius*0.68,0.055,20),hot,w/2,h-0.12,d/2);
    for(const x of [w/2-radius*0.58,w/2+radius*0.58])
      box(0.24,h-0.45,0.24,x,(h-0.45)/2+0.25,d/2,dark);
  } else if(s.kind==='tank') {
    const shell=material('#6e7d7e',0.82);
    const radius=Math.min(w,d)*0.38;
    add(new THREE.CylinderGeometry(radius*1.08,radius*1.08,0.24,20),dark,w/2,0.12,d/2);
    add(new THREE.CylinderGeometry(radius,radius,h-0.30,18),shell,w/2,(h-0.30)/2+0.24,d/2);
    for(const y of [0.55,h-0.38])
      add(new THREE.TorusGeometry(radius+0.035,0.065,6,24),trim,w/2,y,d/2).rotation.x=Math.PI/2;
    box(0.18,0.42,0.18,w/2,h+0.10,d/2,trim);
  } else if(s.kind==='pipe') {
    const pipeMat=material('#718185',0.85),alongX=w>=d,length=alongX?w-0.24:d-0.24,radius=Math.min(w,d)*0.28;
    // Small saddles support the tube without turning its empty rectangular
    // corners into visible-but-inaccurate collision geometry.
    for(const t of [0.18,0.82])box(alongX?0.28:radius*1.7,0.16,alongX?radius*1.7:0.28,
      alongX?w*t:w/2,0.08,alongX?d/2:d*t,dark);
    const tube=add(new THREE.CylinderGeometry(radius,radius,length,14),pipeMat,w/2,h*0.62,d/2);
    if(alongX)tube.rotation.z=Math.PI/2;else tube.rotation.x=Math.PI/2;
    for(const t of [0.16,0.5,0.84]) {
      const ring=add(new THREE.TorusGeometry(radius+0.025,0.055,6,18),trim,
        alongX?w*t:w/2,h*0.62,alongX?d/2:d*t);
      if(alongX)ring.rotation.y=Math.PI/2;else ring.rotation.x=Math.PI/2;
    }
  } else if(s.kind==='conveyor') {
    const frame=material('#45575a',0.75),roller=material('#879496',0.85),alongX=w>=d,length=alongX?w:d;
    box(w,0.20,d,w/2,0.10,d/2,frame);
    const count=Math.max(4,Math.floor(length/0.55));
    for(let i=0;i<count;i++) {
      const t=(i+0.5)/count;
      const roll=add(new THREE.CylinderGeometry(0.10,0.10,(alongX?d:w)-0.14,10),roller,
        alongX?w*t:w/2,h-0.20,alongX?d/2:d*t);
      if(alongX)roll.rotation.x=Math.PI/2;else roll.rotation.z=Math.PI/2;
    }
    for(const side of [0.12,(alongX?d:w)-0.12])
      box(alongX?w-0.1:0.16,0.26,alongX?0.16:d-0.1,
        alongX?w/2:side,h-0.18,alongX?side:d/2,trim);
  } else if(s.kind==='crane') {
    const crane=material(s.accent||'#e9a34e',0.72),black=material('#30383a',0.8);
    box(w,h,d,w/2,h/2,d/2,crane);
    for(let x=0.35;x<w-0.2;x+=0.75)box(0.22,h+0.08,d-0.08,x,h/2,d/2,black);
    const trolley=box(0.9,0.32,d+0.32,w*0.58,-0.22,d/2,black);
    trolley.name='crane-trolley';
    box(0.06,1.8,0.06,w*0.58,-1.25,d/2,black);
    const hook=add(new THREE.TorusGeometry(0.16,0.045,6,14,Math.PI*1.45),black,w*0.58,-2.16,d/2);
    hook.rotation.z=Math.PI;
  } else if (s.kind === 'pillar' || s.kind === 'generator') {
    // Solid bevelled silhouettes keep the render and rectangular collider in
    // agreement. All trim sits inside the footprint and clear of other faces.
    box(w,h-0.20,d,w/2,(h-0.20)/2,d/2,dark);
    box(w,0.20,d,w/2,h-0.10,d/2,trim);
    if(s.kind==='pillar') {
      for(const y of [0.18,h*0.45,h-0.34])
        box(w+0.012,0.14,d+0.012,w/2,y,d/2,stone);
      for(const x of [0.16,w-0.16])
        box(0.07,h-0.9,0.025,x,h/2,-0.018,trim);
    } else {
      const glow=material('#85d9ce');
      glow.emissive.set('#258b83');glow.emissiveIntensity=0.45;
      for(const z of [-0.018,d+0.018]) {
        for(let x=0.3;x<w-0.2;x+=0.32)
          box(0.10,h*0.45,0.025,x,h*0.45,z,stone);
        box(w-0.4,0.08,0.025,w/2,h-0.4,z,glow);
      }
      for(let x=0.5;x<w-0.3;x+=0.8)
        box(0.4,0.015,d-0.4,x,h+0.012,d/2,dark);
    }
  } else if (s.kind === 'tree') {
    const bark = material('#76583e'), leaves = material('#4b8156'), lightLeaves = material('#76a466');
    add(new THREE.CylinderGeometry(0.32,0.5,h,8),bark,w/2,h/2,d/2);
    for (let i=0;i<5;i++) {
      const a=i*2.4, r=i===0?0:0.9;
      const crown=add(new THREE.IcosahedronGeometry(i===0?1.7:1.35,1),i%2?lightLeaves:leaves,
        w/2+Math.cos(a)*r,h+0.9+(i%2)*0.6,d/2+Math.sin(a)*r);
      crown.scale.y=1.15; crown.rotation.y=a;
    }
  } else {
    // The cap owns the top surface; the body stops below it. Previously both
    // meshes ended at exactly h and their coplanar faces flickered (z-fighting).
    box(w,h-0.10,d,w/2,(h-0.10)/2,d/2,s.kind==='cover'?dark:stone);
    const cap=box(w,0.10,d,w/2,h-0.05,d/2,trim);
    cap.name='platform-cap';
    if (s.kind==='cover') {
      for (const x of [w*0.18,w*0.82]) box(0.09,h-0.16,d+0.015,x,h/2,d/2,trim);
    } else {
      // Inset pilasters, belt course, and roof inlays keep the silhouette clean.
      box(w+0.015,0.16,d+0.015,w/2,h*0.3,d/2,dark);
      for (const x of [0.13,w-0.13]) for (const z of [0.13,d-0.13])
        box(0.24,h-0.12,0.24,x,h/2,z,dark);
      for (let x=0.5;x<w;x+=1) box(0.025,0.012,d-0.3,x,h+0.007,d/2,dark);
      if (s.kind==='tower') {
        const ring = add(new THREE.TorusGeometry(Math.min(w,d)*0.28,0.025,6,48),trim,w/2,h+0.018,d/2);
        ring.rotation.x=-Math.PI/2;
      }
    }
  }
  // Only geometry, not lights: no extra per-frame lighting/shadow passes.
  return group;
}

export function poseCargoLift(model,height) {
  const {piston,deck,ribs}=model.userData;
  piston.scale.y=Math.max(0.001,height-0.16);piston.position.y=Math.max(0,height-0.16)/2;
  deck.position.y=height-0.08;
  for(let i=0;i<ribs.length;i++){ribs[i].visible=height>0.35;ribs[i].position.y=(height-0.18)*(i+0.5)/ribs.length;}
  for(const child of model.children)if(child.userData.onDeck)child.position.y=height+0.012;
}
