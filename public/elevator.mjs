import * as THREE from 'three';

export function createElevatorModel(e) {
  const group=new THREE.Group(), doors=[];
  // Fixed cabin-local shading: random room fill, spotlights, shadows and the
  // hidden half-turn into the next floor must not relight these surfaces.
  const cabinMaterial=color=>new THREE.MeshBasicMaterial({color,vertexColors:true,toneMapped:false});
  const metal=cabinMaterial('#8eaaa9');
  const dark=cabinMaterial('#253c45');
  const warm=cabinMaterial('#dbcab0');
  const light=new THREE.MeshBasicMaterial({color:'#eafff4',toneMapped:false});
  const w=e.width*0.05,d=e.height*0.05,h=e.ceiling;
  function box(a,b,c,x,y,z,mat=metal) {
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(a,b,c),mat);
    const positions=mesh.geometry.attributes.position,normals=mesh.geometry.attributes.normal;
    const colors=new Float32Array(positions.count*3);
    for(let i=0;i<positions.count;i++) {
      const shade=.68+.20*Math.max(0,Math.min(1,(positions.getY(i)+y)/h))+.08*Math.abs(normals.getY(i))+.04*Math.abs(normals.getX(i));
      colors.set([shade,shade,shade],i*3);
    }
    mesh.geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
    mesh.position.set(x,y,z);group.add(mesh);return mesh;
  }
  box(w,0.10,d,w/2,-0.035,d/2,dark);
  box(w,0.12,d,w/2,h+0.06,d/2,warm);
  box(0.5,h,d,0.25,h/2,d/2,warm);
  for(const z of [0.25,d-0.25])box(w-0.5,h,0.5,(w+0.5)/2,h/2,z,warm);
  for(const z of [1.75,d-1.75])box(0.5,h,2.5,w-0.25,h/2,z,dark);
  box(0.5,h-2.75,5,w-0.25,(h+2.75)/2,d/2,dark);
  // Brushed door panels slide fully into matching side pockets.
  for(const sign of [-1,1]) {
    const panel=box(0.14,2.75,2.5,w-0.15,1.375,d/2+sign*1.25);
    panel.userData={closedZ:panel.position.z,sign};doors.push(panel);
  }
  // Mount on the cabin-facing side, with a gap from the pocket wall. The old
  // rear face lay exactly on that wall and fought it in the depth buffer.
  for(const z of [3,8]) {
    const strip=box(0.04,2.8,0.08,w-0.54,1.4,z,light);
    strip.name='door-light-strip';
  }
  box(w-1,0.025,0.15,w/2,0.025,d/2,dark);
  box(0.06,0.07,d-1.4,0.62,1.05,d/2,metal);
  for(const z of [0.62,d-0.62])box(w-1.4,0.07,0.06,w/2,1.05,z,metal);
  box(w-1.8,0.035,0.5,w/2,h-0.025,d/2,light);
  // Cabin control panel and illuminated up-arrow above the doors.
  box(0.06,0.5,0.32,0.53,1.45,d/2, dark);
  const button=box(0.12,0.22,0.22,0.60,1.44,d/2,new THREE.MeshBasicMaterial({color:'#ffb85c',toneMapped:false}));
  button.name='emergency-override-button';
  group.userData={doors,button};
  if(typeof document!=='undefined') {
    const canvas=document.createElement('canvas');canvas.width=256;canvas.height=96;
    const texture=new THREE.CanvasTexture(canvas);
    const displayMaterial=new THREE.MeshBasicMaterial({map:texture,toneMapped:false});
    for(const side of [-1,1]) {
      const display=new THREE.Mesh(new THREE.PlaneGeometry(0.95,0.36),displayMaterial);
      display.position.set(w+(side<0?-0.54:0.03),3.05,d/2);
      display.rotation.y=side*Math.PI/2;group.add(display);
    }
    group.userData.display={canvas,texture,label:null};
  }
  return group;
}

export function poseElevator(model, sample) {
  model.position.y=sample.rise;
  for(const door of model.userData.doors)
    door.position.z=door.userData.closedZ+door.userData.sign*2.5*sample.door;
}

export function elevatorDisplay(model,label) {
  const display=model.userData.display;
  if(!display||display.label===label)return;
  display.label=label;
  const ctx=display.canvas.getContext('2d');
  ctx.fillStyle='#10272b';ctx.fillRect(0,0,256,96);
  ctx.fillStyle='#b5ffe1';ctx.font='bold 48px monospace';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillText(label,128,48);display.texture.needsUpdate=true;
}
