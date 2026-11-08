import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';

// Tower's visible architecture follows the gameplay solids. Small face trim
// stands clear of the shell; floors and treads end exactly at their support height.
function kit() {
  const mat=(color,metalness=.25,roughness=.56)=>new THREE.MeshStandardMaterial({color,metalness,roughness});
  const alloy=mat('#94acbd',.58,.40),blue=mat('#355f8e',.42,.48),
    panel=mat('#5b7fa3',.32,.56),frame=mat('#293f5a',.72,.42),
    copper=mat('#d77d43',.55,.43),deck=mat('#8b9399',.48,.58),
    concrete=mat('#9a968b',.04,.9),rubber=mat('#283a50',.1,.8);
  const light=new THREE.MeshBasicMaterial({color:'#dcecff'});
  const opal=new THREE.MeshStandardMaterial({color:'#83bdde',emissive:'#589ec2',emissiveIntensity:.32,roughness:.45});
  const add=(parent,g,m,x,y,z,name)=>{
    const mesh=new THREE.Mesh(g,m);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;
    if(name)mesh.name=name;parent.add(mesh);return mesh;
  };
  const box=(p,w,h,d,x,y,z,m=alloy,name,round=0)=>add(p,
    round?new RoundedBoxGeometry(w,h,d,1,Math.min(round,w/4,h/4,d/4)):new THREE.BoxGeometry(w,h,d),m,x,y,z,name);
  const cylinder=(p,r,h,x,y,z,m=frame,sides=24)=>add(p,new THREE.CylinderGeometry(r,r,h,sides),m,x,y,z);
  const beam=(p,a,b,r,m=frame)=>{
    const from=new THREE.Vector3(...a),to=new THREE.Vector3(...b),delta=to.clone().sub(from);
    const mesh=add(p,new THREE.CylinderGeometry(r,r,delta.length(),10),m,
      (a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());return mesh;
  };
  return {alloy,blue,panel,frame,copper,deck,concrete,rubber,light,opal,add,box,cylinder,beam};
}
const world=(x,y,h=0)=>new THREE.Vector3((x-450)*.05,h,(y-300)*.05);

export function createTowerEnvironment(map,walls) {
  const root=new THREE.Group();root.name='tower-station-architecture';
  const {alloy,blue,panel,frame,copper,concrete,light,opal,box,add,beam}=kit();
  for(const wall of walls) {
    const bottom=wall.bottom||0,height=(wall.top??3.1)-bottom,
      w=wall.width*.05,d=wall.height*.05,alongX=w>=d,len=alongX?w:d,thickness=alongX?d:w;
    const group=new THREE.Group();group.name='tower-wall-assembly';root.add(group);
    group.position.copy(world(wall.x+wall.width/2,wall.y+wall.height/2,bottom));
    const structural=wall.towerFinish==='concrete';
    box(group,w,height,d,0,height/2,0,structural||wall.kind==='boundary'?concrete:panel,'tower-wall-solid');
    const face=(sign,length,h,depth,at,y,out,material,name)=>box(group,
      alongX?length:depth,h,alongX?depth:length,
      alongX?at:sign*(thickness/2+out),y,alongX?sign*(thickness/2+out):at,material,name);
    for(const sign of [-1,1]) {
      // Full-height steel cassettes replace the cream plaster / green dado
      // treatment. Structural seams run vertically, with no continuous gold stripe.
      const panelHeight=Math.min(wall.kind==='boundary'?8.8:height-.38,height-.38);
      if(!structural&&panelHeight>.35&&len>.65) {
        const bays=Math.max(1,Math.ceil(len/4.8)),pitch=len/bays;
        for(let i=0;i<bays;i++) {
          const at=-len/2+(i+.5)*pitch;
          face(sign,pitch-.16,panelHeight,.025,at,panelHeight/2+.19,.025,blue,'tower-steel-cassette');
          face(sign,.045,panelHeight-.10,.018,at-pitch/2+.07,panelHeight/2+.19,.052,frame);
          if(pitch>1.1&&height>2.4)
            face(sign,.25,.08,.012,at+pitch*.26,Math.min(2.7,height-.45),.048,copper,'tower-service-tab');
        }
      }
      face(sign,len-.04,Math.min(.14,height*.2),.065,0,Math.min(.07,height*.1),.045,frame);
      if(height>3.6) {
        face(sign,len-.06,.12,.085,0,height-.12,.055,frame);
        for(const at of [-len/2+.08,len/2-.08])
          face(sign,.09,height-.12,.065,at,height/2,.045,frame,'tower-reveal');
      }
      if(wall.kind==='boundary'&&height>14&&len>8) {
        const bays=Math.max(1,Math.floor(len/6.6)),pitch=(len-.8)/bays,
          point=(along,y)=>[alongX?along:sign*(thickness/2+.085),y,alongX?sign*(thickness/2+.085):along];
        for(let i=0;i<bays;i++) {
          const left=-len/2+.4+i*pitch,right=left+pitch;
          beam(group,point(left+.14,9.5),point(right-.14,12.8),.055,frame);
          beam(group,point(left+.14,12.8),point(right-.14,9.5),.055,frame);
        }
      }
      if(wall.kind==='boundary'&&height>14&&len>8) {
        const count=Math.max(1,Math.floor(len/6.6)),pitch=(len-.9)/count;
        for(let i=0;i<count;i++) {
          const at=-len/2+.45+(i+.5)*pitch,span=pitch-.5;
          face(sign,span,2.15,.06,at,14.55,.055,frame,'tower-clerestory-frame');
          face(sign,span-.13,1.98,.025,at,14.55,.10,opal,'tower-clerestory');
          for(const fraction of [-.25,0,.25])
            face(sign,.045,1.98,.025,at+span*fraction,14.55,.127,alloy);
        }
      }
    }
  }

  // Recessed lights mark the widened ground portals without consuming any
  // of their clear opening or adding another free-standing prop.
  for(const x of [360,740])for(const y of [310,770]) {
    const p=world(x,y,4.05),direction=x===360?-1:1;
    box(root,.08,.08,y===310?7.8:8.8,p.x+direction*.10,p.y,p.z,light,'tower-portal-light');
  }
  // Station numbers are small physical enamel badges, not floating UI labels.
  const segments={0:[0,1,2,3,4,5],1:[1,2],2:[0,1,6,4,3]};
  const digit=(group,value,offset)=>{
    const positions=[[0,.54,.5,.07],[.27,.28,.07,.48],[.27,-.28,.07,.48],
      [0,-.54,.5,.07],[-.27,-.28,.07,.48],[-.27,.28,.07,.48],[0,0,.5,.07]];
    for(const id of segments[value]){const [x,y,w,h]=positions[id];box(group,w,h,.035,x+offset,y,.13,alloy);}
  };
  for(const [x,n] of [[359,1],[761,2]]) {
    const badge=new THREE.Group();badge.name='tower-control-hall-number';
    badge.position.copy(world(x,405,7.8));badge.rotation.y=x<560?-Math.PI/2:Math.PI/2;
    root.add(badge);box(badge,1.85,1.65,.14,0,0,0,blue,null,.07);digit(badge,0,-.43);digit(badge,n,.43);
  }
  // Lift guide channels and a fixed drive housing attach to each shaft.
  for(const x of [150,860]) {
    const drive=new THREE.Group();drive.name='tower-lift-drive';drive.position.copy(world(x,65));root.add(drive);
    for(const dx of [.12,5.38]) {
      box(drive,.16,9.45,.16,dx,4.725,.07,frame);
      box(drive,.045,9.15,.035,dx,4.6,.17,copper);
    }
    box(drive,5.45,.8,.72,2.75,9.65,.32,blue,null,.08);
    box(drive,3.5,.08,.035,2.75,9.65,.70,light);
  }

  // Generator risers join a continuous overhead circuit through the turbine.
  // These pipes are above every reachable/jumpable surface, so they cannot
  // create unexpected movement collision in a fighting route.
  for(const [a,b] of [[[560,195,14],[560,520,14]],[[560,520,14],[560,770,14]]]) {
    const one=world(...a),two=world(...b);beam(root,one.toArray(),two.toArray(),.23,copper);
  }
  for(const y of [300,700]) {
    const p=world(560,y,16.25);
    box(root,15.7,.28,.58,p.x,p.y,p.z,frame,'tower-overhead-light');
    box(root,14.8,.035,.35,p.x,p.y-.17,p.z,light);
    for(const dx of [-6.4,6.4])beam(root,[p.x+dx,p.y+.14,p.z],[p.x+dx,16.8,p.z],.045,frame);
  }
  for(const x of [190,930])for(const y of [460,920]) {
    const p=world(x,y,4.65);
    box(root,4.4,.15,.6,p.x,p.y,p.z,frame,'tower-service-light');
    box(root,4.1,.13,.36,p.x,4.785,p.z,frame);
    box(root,4.08,.035,.4,p.x,p.y-.09,p.z,light);
  }
  // A continuous cable tray supplies the switchgear in each service hall.
  // Branches end on the actual cabinets; everything remains above jump headroom.
  for(const mirror of [false,true]) {
    const x=mirror?800:320,p=world(x,520,4.59);
    box(root,.34,.09,50.8,p.x,p.y,p.z,frame,'tower-service-cable-tray');
    for(const y of [110,310,510,710,910]) {
      const mount=world(x,y,4.65);
      box(root,.50,.045,.10,mount.x,mount.y,mount.z,frame);
      for(const side of [-1,1])box(root,.045,.20,.10,mount.x+side*.21,4.75,mount.z,frame);
    }
    for(const offset of [-.095,.095]) {
      const a=world(x,12,4.65),b=world(x,1028,4.65);
      beam(root,[a.x+offset,a.y,a.z],[b.x+offset,b.y,b.z],.025,copper);
    }
    for(const [cabinetX,y] of [[100,356],[80,952]]) {
      const endX=mirror?1120-cabinetX:cabinetX,a=world(x,y,4.65),b=world(endX,y,4.65),c=world(endX,y,2.8);
      beam(root,a.toArray(),b.toArray(),.045,frame);beam(root,b.toArray(),c.toArray(),.045,frame);
    }
    // Analogue load gauges sit beside, rather than over, the cabinet doors.
    const instruments=new THREE.Group();instruments.name='tower-load-instruments';
    instruments.position.copy(world(mirror?935:185,389,2.95));instruments.rotation.y=Math.PI;root.add(instruments);
    box(instruments,1.8,1.4,.12,0,0,.07,blue,null,.06);
    for(const dx of [-.43,.43]) {
      add(instruments,new THREE.CircleGeometry(.34,32),alloy,dx,.2,.14);
      add(instruments,new THREE.TorusGeometry(.35,.025,6,32),copper,dx,.2,.155);
      for(let i=0;i<7;i++) {
        const angle=-Math.PI*.75+i*Math.PI/4,
          tick=box(instruments,.025,.055,.012,dx+Math.sin(angle)*.27,.2+Math.cos(angle)*.27,.16,frame);
        tick.rotation.z=-angle;
      }
      const angle=dx<0?-.55:.8,needle=box(instruments,.025,.25,.02,
        dx+Math.sin(angle)*.125,.2+Math.cos(angle)*.125,.18,blue);needle.rotation.z=-angle;
    }
    box(instruments,1.4,.14,.025,0,-.43,.15,frame);
    for(let i=0;i<6;i++)box(instruments,.12,.06,.018,-.48+i*.192,-.43,.177,i<4?copper:panel);
  }
  for(const y of [879,901]) {
    const p=world(560,y,4.05);
    box(root,7.5,.08,.06,p.x,p.y,p.z,light,'tower-rear-passage-light');
  }
  // The ceiling has real aligned ribs, centred on the two machine bays.
  for(const y of [110,520,930]) {
    const p=world(560,y,16.65);
    box(root,54.75,.3,.2,p.x,p.y,p.z,panel);
  }
  return root;
}

export function createTowerTerrain(s) {
  const themed=s.style==='tower';
  if(!(themed&&['catwalk','ramp','rail','lift'].includes(s.kind))&&
    !['towerGenerator','towerSwitchgear','towerRiser'].includes(s.kind)&&
    !(s.kind==='towerCore'&&s.redesigned))return null;
  const group=new THREE.Group(),w=s.width*.05,d=s.height*.05,h=s.top-(s.bottom||0);
  const {alloy,blue,panel,frame,copper,deck,concrete,rubber,light,opal,add,box,cylinder,beam}=kit();
  if(s.kind==='catwalk') {
    // Adjacent slabs share a genuinely continuous flat finish, with no raised
    // edging or decorative stripes across walking seams.
    const finish=Math.min(.04,h*.2);
    box(group,w,h-finish,d,w/2,(h-finish)/2,d/2,deck,'tower-floor-structure');
    box(group,w,finish,d,w/2,h-finish/2,d/2,deck,'tower-walking-surface');
    group.name=s.bridge?'tower-overhead-crossing':'tower-control-floor';
  } else if(s.kind==='ramp') {
    const alongY=s.axis==='y',length=alongY?d:w,step=length/s.steps;
    for(let i=0;i<s.steps;i++) {
      const index=s.reverse?s.steps-1-i:i,rise=h*(i+1)/s.steps,
        x=alongY?w/2:(index+.5)*step,z=alongY?(index+.5)*step:d/2;
      box(group,alongY?w:step,rise-.022,alongY?step:d,x,(rise-.022)/2,z,deck);
      box(group,alongY?w:step,.022,alongY?step:d,x,rise-.011,z,deck,'tower-stair-tread');
      const front=(s.reverse?1:-1)*(step/2-.035);
      box(group,alongY?w-.14:.035,.008,alongY?.035:d-.14,
        alongY?x:x+front,rise-.004,alongY?z+front:z,i%4===0?copper:frame);
    }
    group.name='tower-switchback-stair';
  } else if(s.kind==='rail') {
    const alongX=w>d,length=alongX?w:d,low=s.bottom||0,
      base=t=>low+(s.axis?(s.rise||0)*(s.reverse?1-t:t):0),
      at=(t,dy)=>[alongX?length*t:w/2,base(t)+dy,alongX?d/2:length*t];
    const glass=new THREE.MeshStandardMaterial({color:'#7fb6d3',roughness:.24,metalness:.15,
      transparent:true,opacity:.38,depthWrite:false,side:THREE.DoubleSide});
    const inset=.10/length;
    beam(group,at(inset,.94),at(1-inset,.94),.055,alloy);
    beam(group,at(inset,.14),at(1-inset,.14),.045,frame);
    const points=[at(inset,.25),at(1-inset,.25),at(1-inset,.79),at(inset,.79)],g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(points.flat(),3));g.setIndex([0,1,2,0,2,3]);g.computeVertexNormals();
    add(group,g,glass,0,0,0,'tower-glass-guard');
    const bays=Math.max(1,Math.ceil(length/2.4));
    for(let i=0;i<=bays;i++) {
      const t=inset+(1-2*inset)*i/bays,p=at(t,.48);
      box(group,.085,.96,.085,...p,frame);const cap=at(t,.91);box(group,.10,.045,.10,...cap,copper);
    }
    group.name=s.axis?'tower-stair-guard':'tower-gallery-guard';
  } else if(s.kind==='lift') {
    const piston=box(group,w-.12,1,d-.12,w/2,.5,d/2,frame),
      platform=box(group,w,.16,d,w/2,-.08,d/2,blue,'tower-lift-platform'),ribs=[];
    for(let i=0;i<8;i++)ribs.push(box(group,w-.08,.035,d-.08,w/2,0,d/2,i%2?frame:panel));
    const top=box(group,w-.18,.016,d-.18,w/2,.012,d/2,deck);top.userData.onDeck=true;
    for(const x of [.14,w-.14]) {
      const strip=box(group,.065,.016,d-.30,x,.012,d/2,copper);strip.userData.onDeck=true;
    }
    piston.scale.y=.001;piston.position.y=0;ribs.forEach(r=>r.visible=false);
    group.userData={piston,deck:platform,ribs};group.name='tower-counterweight-lift';
  } else if(s.kind==='towerRiser') {
    cylinder(group,Math.min(w,d)/2-.025,h,w/2,h/2,d/2,frame,16);
    for(let y=.1;y<h;y+=2.8)cylinder(group,Math.min(w,d)/2,.12,w/2,y,d/2,copper,16);
    group.name='tower-generator-riser';
  } else if(s.kind==='towerSwitchgear') {
    box(group,w-.08,h,d-.08,w/2,h/2,d/2,frame,'tower-switchgear-shell',.05);
    box(group,w-.04,.16,d-.04,w/2,h-.08,d/2,alloy);
    const alongX=w>=d,span=alongX?w:d,bays=Math.max(2,Math.round(span/1.1));
    for(const side of [-1,1])for(let i=0;i<bays;i++) {
      const at=(i+.5)*span/bays,panelWidth=span/bays-.12;
      box(group,alongX?panelWidth:.025,h-.55,alongX?.025:panelWidth,
        alongX?at:(side<0?.015:w-.015),h/2,alongX?(side<0?.015:d-.015):at,copper);
      for(let row=0;row<3;row++)box(group,alongX?panelWidth*.6:.015,.025,alongX?.015:panelWidth*.6,
        alongX?at:(side<0?-.009:w+.009),.45+row*.13,alongX?(side<0?-.009:d+.009):at,frame);
      box(group,alongX?.14:.02,.09,alongX?.02:.14,
        alongX?at:(side<0?-.009:w+.009),h-.5,alongX?(side<0?-.009:d+.009):at,copper);
    }
    group.name='tower-switchgear-bank';
  } else if(s.kind==='towerGenerator') {
    box(group,w,.26,d,w/2,.13,d/2,frame);
    box(group,w-.08,h-.38,d-.08,w/2,(h-.38)/2+.26,d/2,blue,'tower-generator-housing',.12);
    box(group,w-.12,.12,d-.12,w/2,h-.06,d/2,alloy);
    for(const z of [.015,d-.015]) {
      box(group,w-.5,1.55,.025,w/2,1.55,z,panel);
      for(let i=0;i<11;i++)box(group,.045,1.25,.035,.5+(w-1)*i/10,1.6,z+(z<d/2?-.030:.030),frame);
      box(group,1.2,.15,.04,w*.25,2.55,z+(z<d/2?-.030:.030),copper);
    }
    for(const x of [.2,w-.2])box(group,.14,h-.3,d-.20,x,h/2+.1,d/2,alloy);
    group.name='tower-generator-housing';
  } else if(s.kind==='towerCore') {
    const cx=w/2,cz=d/2,r=(s.collisionRadius||80)*.05;
    const energy=new THREE.MeshStandardMaterial({color:'#a1dcff',emissive:'#419ad2',
      emissiveIntensity:.9,metalness:.25,roughness:.32});
    // Separate shell courses own separate height intervals. Bands never
    // share a cylindrical surface with an underlying full-height cylinder.
    for(const [bottom,top,material] of [[0,.5,frame],[.5,.79,alloy],[.79,1.01,blue],
      [1.01,1.09,copper],[1.09,5.91,blue],[5.91,5.99,copper],[5.99,6.36,blue],
      [6.36,6.64,alloy],[13.11,13.39,alloy],[13.39,13.46,blue],
      [13.46,13.54,copper],[13.54,h-.28,blue],[h-.28,h,alloy]])
      cylinder(group,r,top-bottom,cx,(bottom+top)/2,cz,material,40);
    cylinder(group,r*.89,6.47,cx,9.875,cz,energy,40);
    // Curved armour segments leave tall luminous inspection slots between
    // continuous structural ribs. The outside silhouette matches the collider.
    for(let i=0;i<8;i++) {
      const angle=i*Math.PI/4;
      const shell=new THREE.CylinderGeometry(r,r,6.47,10,1,true,angle+.10,Math.PI/4-.20);
      add(group,shell,copper,cx,9.875,cz);
      const px=cx+Math.sin(angle)*r*.987,pz=cz+Math.cos(angle)*r*.987;
      const rib=box(group,.14,14.5,.09,px,7.75,pz,copper);rib.rotation.y=angle;
      const plate=box(group,.58,3.2,.04,cx+Math.sin(angle)*(r+.025),3.55,
        cz+Math.cos(angle)*(r+.025),panel);plate.rotation.y=angle;
    }
    const rotor=new THREE.Group();rotor.name='tower-turbine-rotor';rotor.position.set(cx,11.3,cz);group.add(rotor);
    for(let i=0;i<12;i++) {
      const angle=i*Math.PI/6,blade=box(rotor,.13,4.6,.42,
        Math.sin(angle)*r*.87,0,Math.cos(angle)*r*.87,frame);blade.rotation.y=angle+.35;
    }
    group.userData.update=time=>{rotor.rotation.y=time*.32;energy.emissiveIntensity=.85+.12*Math.sin(time*.8);};
    group.name='tower-power-core';
  }
  return group;
}
