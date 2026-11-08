import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {createTowerTerrain} from './towerEnvironment.mjs';

// Local origin is the southwest footprint corner; geometry matches arenaMap.js.
export function createTerrainModel(s) {
  const tower=createTowerTerrain(s);if(tower)return tower;
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
  const beam = (from,to,radius,mat,segments=9,radius2=radius) => {
    const a=new THREE.Vector3(...from),b=new THREE.Vector3(...to),direction=b.clone().sub(a);
    const mesh=add(new THREE.CylinderGeometry(radius2,radius,direction.length(),segments),mat,
      (a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());return mesh;
  };
  // Some detailed props use several authoritative collision primitives rather
  // than one oversized authoring box. Their visible geometry is supplied by
  // the matching non-solid terrain item, so these pieces intentionally render
  // no duplicate blocks.
  if(s.collisionOnly){group.name=`collision-${s.scannerPart||s.kind}`;return group;}
  if(s.kind==='grandLantern') {
    const iron=material('#2d3437',0.82),brass=material('#b7833f',0.72),rim=material('#e4b45f',0.58);
    const glow=new THREE.MeshStandardMaterial({color:'#ffd58a',emissive:'#ff9f32',emissiveIntensity:2.3,
      roughness:.28,metalness:.08,transparent:true,opacity:.82});
    const cx=w/2,cz=d/2,r=Math.min(w,d)*.31,bodyBottom=.22,bodyTop=Math.min(h-.75,2.15),bodyMid=(bodyBottom+bodyTop)/2;
    // A ceiling-suspended landmark rather than another floor prop: long chain,
    // broad canopy, luminous core and a readable iron cage from across a hall.
    beam([cx,h,cz],[cx,bodyTop+.34,cz],.08,iron,10,.055);
    for(const y of [h-.18,h-.42])add(new THREE.TorusGeometry(.24,.055,7,18),y===h-.18?brass:iron,cx,y,cz).rotation.x=Math.PI/2;
    add(new THREE.CylinderGeometry(r*.28,r*.44,.28,12),brass,cx,bodyTop+.2,cz);
    add(new THREE.CylinderGeometry(r*.62,r*.78,bodyTop-bodyBottom,16),glow,cx,bodyMid,cz);
    for(const y of [bodyBottom,bodyBottom+(bodyTop-bodyBottom)*.5,bodyTop])
      add(new THREE.TorusGeometry(r,.075,7,24),y===bodyBottom||y===bodyTop?rim:brass,cx,y,cz).rotation.x=Math.PI/2;
    for(let i=0;i<10;i++){
      const a=i*Math.PI/5,x=cx+Math.cos(a)*r,z=cz+Math.sin(a)*r;
      beam([x,bodyBottom,z],[x,bodyTop,z],.055,iron,7,.038);
      beam([x,bodyTop,z],[cx,bodyTop+.22,cz],.045,brass,7,.025);
    }
    add(new THREE.CylinderGeometry(r*.75,r,.24,16),iron,cx,bodyBottom-.08,cz);
    const halo=add(new THREE.TorusGeometry(r*.72,.035,6,32),glow,cx,bodyMid,cz);halo.rotation.x=Math.PI/2;
  } else if(s.kind==='ceilingPanel') {
    const frame=material('#3b4d51',.72);
    const panel=material('#74878a',.48);
    const light=material(s.accent||'#d9b978',0.34);
    box(w,h,d,w/2,h/2,d/2,frame);
    const alongX=w>=d,count=Math.max(2,Math.min(8,Math.floor((alongX?w:d)/2.5)));
    for(let i=0;i<count;i++){
      const t=(i+.5)/count;
      box(alongX?0.08:w-.18,0.035,alongX?d-.18:0.08,
        alongX?w*t:w/2,-.025,alongX?d/2:d*t,i%3===1?light:panel);
    }
  } else if(s.kind==='lift') {
    const temple=s.style==='temple';
    const liftCore=temple?material('#4b5147',0.38):dark;
    const liftDeck=temple?material('#918e70',0.18):trim;
    const liftRib=temple?material('#b28b47',0.62):stone;
    const piston=box(w-0.12,1,d-0.12,w/2,0.5,d/2,liftCore);
    const deck=box(w,0.16,d,w/2,-0.08,d/2,liftDeck);
    const ribs=[];
    for(let i=1;i<=12;i++)ribs.push(box(w-0.08,0.035,d-0.08,w/2,0,d/2,i%3===0?liftDeck:liftRib));
    for(let x=0.3;x<w;x+=0.5)box(0.18,0.015,d-0.2,x,0.012,d/2,liftCore).userData.onDeck=true;
    if(temple) {
      // Bronze corner locks and a carved centre tile make this feel like an
      // ancient counterweighted platform rather than imported factory gear.
      for(const [x,z] of [[.14,.14],[w-.14,.14],[.14,d-.14],[w-.14,d-.14]])
        add(new THREE.CylinderGeometry(.075,.09,.08,8),liftRib,x,.02,z);
      const seal=add(new THREE.TorusGeometry(Math.min(w,d)*.2,.035,6,16),liftRib,w/2,.025,d/2);
      seal.rotation.x=Math.PI/2;seal.userData.onDeck=true;
    }
    // Ribbed telescoping safety skirt encloses the moving mechanism.
    group.userData={piston,deck,ribs};
    poseCargoLift(group,s.top);
  } else if(s.kind==='rail') {
    const base=(x,z)=>s.axis?(s.bottom||0)+s.rise*(s.reverse?1-(s.axis==='y'?z/d:x/w):(s.axis==='y'?z/d:x/w)):(s.liftId?0:s.bottom||0);
    if(s.style==='tower') {
      const steel=material('#465b66',.72),edge=material('#d5dfdd',.62),
        amber=material('#d6a45d',.48);
      const glass=new THREE.MeshStandardMaterial({color:'#a9c4c9',metalness:.24,roughness:.22,
        transparent:true,opacity:.48,depthWrite:false,side:THREE.DoubleSide});
      const alongX=w>d,length=alongX?w:d,rise=s.axis?(s.reverse?-s.rise:s.rise):0;
      const center=base(w/2,d/2),slope=Math.atan2(rise,length);
      const incline=mesh=>{if(s.axis){if(alongX)mesh.rotation.z=slope;else mesh.rotation.x=-slope;}return mesh;};
      // Insets account for the rotated glass height on steep stair flights.
      // Without this the panel tips extend past the authored rail footprint.
      const span=Math.max(.12,Math.hypot(length,rise)-.48);
      incline(box(alongX?span:.10,.12,alongX?.10:span,w/2,center+.92,d/2,edge));
      incline(box(alongX?span-.04:.055,.52,alongX?.055:span-.04,
        w/2,center+.54,d/2,glass));
      incline(box(alongX?span:.11,.13,alongX?.11:span,w/2,center+.10,d/2,steel));
      const bays=Math.max(1,Math.ceil(length/2.6));
      for(let i=0;i<=bays;i++) {
        const t=i/bays,at=.08+(length-.16)*t,x=alongX?at:w/2,z=alongX?d/2:at,y=base(x,z);
        box(.095,.94,.095,x,y+.47,z,steel);
        box(.13,.055,.13,x,y+.92,z,amber);
      }
      group.name=s.axis?'tower-stair-guard':'tower-gallery-guard';return group;
    }
    if(s.style==='foundry') {
      const alongX=w>d,length=alongX?w:d,rise=s.axis?(s.reverse?-s.rise:s.rise):0;
      const steel=material('#56696a',.72),cap=material('#cba276',.62),
        kick=material('#83918b',.62);
      const sloped=Math.hypot(length,rise),endInset=.12,
        memberLength=sloped*Math.max(.2,length-endInset*2)/length,centerBase=base(w/2,d/2);
      const members=[
        box(alongX?memberLength:.14,.14,alongX?.14:memberLength,w/2,centerBase+.95,d/2,cap),
        box(alongX?memberLength:.065,.065,alongX?.065:memberLength,w/2,centerBase+.53,d/2,steel),
        box(alongX?memberLength:.11,.17,alongX?.11:memberLength,w/2,centerBase+.13,d/2,kick),
      ];
      for(const part of members) {
        if(alongX)part.rotation.z=Math.atan2(rise,length);
        else part.rotation.x=-Math.atan2(rise,length);
      }
      const bays=Math.max(1,Math.ceil(length/2.35));
      for(let i=0;i<=bays;i++) {
        const at=endInset+(length-endInset*2)*i/bays,x=alongX?at:w/2,
          z=alongX?d/2:at,y=base(x,z);
        box(.12,.91,.12,x,y+.455,z,steel);
        box(.17,.11,.17,x,y+.77,z,cap);
        if(i===bays)continue;
        const next=endInset+(length-endInset*2)*(i+1)/bays,
          nx=alongX?next:w/2,nz=alongX?d/2:next;
        // Diagonal steel struts turn the open spans into fabricated trusses.
        // They follow the real stair slope and remain inside the rail collider.
        beam([x,y+.24,z],[nx,base(nx,nz)+.72,nz],.027,steel,7,.027);
      }
      group.name=s.axis?'foundry-stair-guard':'foundry-platform-guard';return group;
    }
    if(s.style==='candy') {
      const alongX=w>d,length=alongX?w:d,minor=alongX?d:w;
      const shell=material('#973d38',.78),
        inset=material('#c2664d',.66),edge=material('#f0d9b5',.82);
      const glow=new THREE.MeshStandardMaterial({color:'#d7825a',
        emissive:'#e05b43',emissiveIntensity:.55,
        roughness:.3,metalness:.4,toneMapped:false});
      const centerBase=base(w/2,d/2),railHeight=Math.max(.4,h),rise=s.axis?(s.reverse?-s.rise:s.rise):0,
        span=Math.max(.12,Math.hypot(length,rise)-.18);
      const follow=mesh=>{if(!s.axis)return mesh;if(alongX)mesh.rotation.z=Math.atan2(rise,length);
        else mesh.rotation.x=-Math.atan2(rise,length);return mesh;};
      // A restrained four-part assembly: dark curb, one neutral infill,
      // hairline red datum, and a silver cap. Sparse supports keep long runs
      // reading as a single manufactured object rather than stacked trim.
      follow(box(alongX?span:minor,.18,alongX?minor:span,
        w/2,centerBase+.09,d/2,shell,.015));
      follow(box(alongX?span-.06:minor-.02,.46,
        alongX?minor-.02:span-.06,w/2,centerBase+.39,d/2,inset,.012));
      follow(box(alongX?span-.10:minor,.035,
        alongX?minor:span-.10,w/2,centerBase+.58,d/2,glow,.006));
      follow(box(alongX?span:minor,.12,
        alongX?minor:span,w/2,centerBase+railHeight-.06,d/2,edge,.018));
      for(let i=0,n=Math.max(1,Math.ceil(length/2.6));i<=n;i++) {
        const t=i/n,at=.05+(length-.10)*t,x=alongX?at:w/2,z=alongX?d/2:at;
        box(alongX?.09:minor,railHeight-.08,alongX?minor:.09,
          x,base(x,z)+(railHeight-.08)/2,z,edge,.012);
      }
      group.name='candy-gallery-guard';return group;
    }
    if(s.style==='temple') {
      const alongX=w>d,length=alongX?w:d,minor=alongX?d:w;
      const parapet=material(s.liftId?'#7f6841':'#596052',s.liftId ? .58 : .16);
      const edge=material(s.liftId?'#c19a50':'#a69c73',s.liftId ? .72 : .32);
      if(s.liftId) {
        // Slender bronze rails travel with the lift and leave the landing side
        // open; their visible footprint matches the forgiving rail collider.
        const count=Math.max(2,Math.ceil(length/1.25));
        for(let i=0;i<=count;i++) {
          const t=i/count,x=alongX?length*t:w/2,z=alongX?d/2:length*t;
          box(.075,.92,.075,x,base(x,z)+.46,z,parapet);
        }
        for(const y of [.18,.82])box(alongX?length:.075,.075,alongX?.075:length,
          w/2,base(w/2,d/2)+y,d/2,edge);
      } else {
        const bronze=material('#6f6242',.62),moss=material('#647558',.06);
        const railHeight=Math.max(.82,h),centerBase=base(w/2,d/2);
        // One continuous, architectural balustrade replaces the old row of
        // disconnected crenellation blocks. A broad stone sill anchors two
        // bronze rails, with only a few substantial capped supports.
        box(alongX?length:minor,.22,alongX?minor:length,
          w/2,centerBase+.11,d/2,parapet);
        for(const y of [.48,railHeight-.09])
          box(alongX?length:minor+.015,.095,alongX?minor+.015:length,
            w/2,centerBase+y,d/2,y>.7?edge:bronze);
        const bays=Math.max(1,Math.ceil(length/2.35));
        for(let i=0;i<=bays;i++) {
          const t=i/bays,x=alongX?length*t:w/2,z=alongX?d/2:length*t;
          box(alongX?.18:minor+.02,railHeight-.16,alongX?minor+.02:.18,
            x,base(x,z)+(railHeight-.16)/2,z,parapet);
          box(alongX?.25:minor+.08,.12,alongX?minor+.08:.25,
            x,base(x,z)+railHeight-.03,z,edge);
        }
        // A narrow inset growth line ties the railing back into the overgrown
        // sanctuary without breaking its clean silhouette.
        box(alongX?Math.max(.1,length-.16):minor+.025,.035,
          alongX?minor+.025:Math.max(.1,length-.16),w/2,centerBase+.235,d/2,moss);
      }
      group.name=s.liftId?'temple-lift-guard':'temple-tower-balustrade';
      return group;
    }
    if(s.style==='orbital') {
      const alongX=w>d,length=alongX?w:d;
      const ceramic=material('#e8edf1',0.62),frame=material('#697681',0.82);
      const glass=new THREE.MeshPhysicalMaterial({color:'#bcecf2',transparent:true,opacity:.28,
        roughness:.08,metalness:.12,depthWrite:false,side:THREE.DoubleSide});
      const cyan=new THREE.MeshStandardMaterial({color:'#9af5ff',emissive:'#3ddcec',emissiveIntensity:2.1,
        roughness:.22,metalness:.25,toneMapped:false});
      // A low ceramic curb prevents the glass from looking like it floats.
      box(alongX?length:.12,.18,alongX?.12:length,w/2,base(w/2,d/2)+.09,d/2,ceramic);
      const pane=box(alongX?length-.12:.025,.58,alongX?.025:length-.12,w/2,base(w/2,d/2)+.48,d/2,glass);
      pane.castShadow=false;
      for(let i=0,n=Math.max(1,Math.ceil(length/1.8));i<=n;i++) {
        const t=i/n,x=alongX?length*t:w/2,z=alongX?d/2:length*t;
        box(.065,.86,.065,x,base(x,z)+.43,z,frame);
      }
      box(alongX?length:.075,.075,alongX?.075:length,w/2,base(w/2,d/2)+.88,d/2,frame);
      box(alongX?length-.1:.035,.035,alongX?.035:length-.1,w/2,base(w/2,d/2)+.21,d/2,cyan);
      return group;
    }
    if(s.style==='airport') {
      const alongX=w>d,length=alongX?w:d;
      const curb=material('#e8e5dd',.12),frame=material('#5e6b74',.68);
      const pane=new THREE.MeshPhysicalMaterial({color:'#a9c8d4',transparent:true,opacity:.27,
        roughness:.08,metalness:.06,depthWrite:false,side:THREE.DoubleSide});
      const rise=s.axis?(s.reverse?-s.rise:s.rise):0;
      const pitch=Math.atan2(rise,length),slopedLength=Math.hypot(length,rise);
      const followPitch=mesh=>{
        if(!s.axis)return mesh;
        if(alongX)mesh.rotation.z=pitch;else mesh.rotation.x=-pitch;
        return mesh;
      };
      followPitch(box(alongX?slopedLength:.13,.18,alongX?.13:slopedLength,
        w/2,base(w/2,d/2)+.09,d/2,curb));
      const glass=followPitch(box(alongX?slopedLength-.09:.025,.58,alongX?.025:slopedLength-.09,
        w/2,base(w/2,d/2)+.48,d/2,pane));glass.castShadow=false;
      for(let i=0,n=Math.max(1,Math.ceil(length/1.45));i<=n;i++) {
        const t=i/n,x=alongX?length*t:w/2,z=alongX?d/2:length*t;
        box(.055,.93,.055,x,base(x,z)+.465,z,frame);
      }
      const handrail=followPitch(box(alongX?slopedLength:.075,.075,alongX?.075:slopedLength,
        w/2,base(w/2,d/2)+.91,d/2,frame));
      if(s.axis)handrail.name='terminal-stair-handrail';
      return group;
    }
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
    const handrail=box(alongX?Math.hypot(length,rise):0.10,0.10,alongX?0.10:Math.hypot(length,rise),w/2,base(w/2,d/2)+1,d/2,trim);
    if(alongX)handrail.rotation.z=Math.atan2(rise,length);else handrail.rotation.x=-Math.atan2(rise,length);
  } else if (s.kind === 'ramp' && s.stairs) {
    if(s.style==='candy') {
      const frame=material('#9e5546',.64),tread=material('#d7a376',.34),
        edge=material('#f0d8b8',.58),vertical=s.axis==='y',length=vertical?d:w,
        stepLength=length/s.steps;
      for(let i=0;i<s.steps;i++) {
        const rise=h*(i+1)/s.steps,t=s.reverse?s.steps-1-i:i;
        const x=vertical?w/2:(t+.5)*stepLength,z=vertical?(t+.5)*stepLength:d/2;
        const bodyHeight=rise-.016;
        add(new THREE.BoxGeometry(vertical?w:stepLength,bodyHeight,vertical?stepLength:d),
          frame,x,bodyHeight/2,z);
        add(new THREE.BoxGeometry(vertical?w-.035:stepLength-.018,.016,
          vertical?stepLength-.018:d-.035),tread,x,rise-.008,z);
        const front=(s.reverse?1:-1)*stepLength*.45;
        box(vertical?w-.12:.045,.018,vertical?.045:d-.12,
          vertical?w/2:x+front,rise-.012,vertical?z+front:d/2,edge);
      }
      group.name='candy-enclosed-stair';return group;
    }
    const stairBody=s.style==='temple'?material('#596553'):s.style==='orbital'?material('#7b8792',.72):
      s.style==='airport'?material('#727e84',.56):s.style==='foundry'?material('#3e4d50',.7):
      s.style==='tower'?material('#637d7f',.64):dark;
    const stairTop=s.style==='temple'?material('#9a9b79'):s.style==='orbital'?material('#e8edf1',.56):
      s.style==='airport'?material('#e9e5dc',.16):s.style==='foundry'?material('#aeb7ad',.58):
      s.style==='tower'?material('#d9e5df',.52):trim;
    const moss=s.style==='temple'?material('#63804b',0.02):null;
    const vertical=s.axis==='y',length=vertical?d:w;
    for(let i=0;i<s.steps;i++) {
      const rise=h*(i+1)/s.steps,t=s.reverse?s.steps-1-i:i;
      const x=vertical?w/2:(t+0.5)*length/s.steps,z=vertical?(t+0.5)*length/s.steps:d/2;
      box(vertical?w:length/s.steps,rise,vertical?length/s.steps:d,x,rise/2,z,stairBody);
      box(vertical?w-0.08:length/s.steps-0.04,0.018,vertical?length/s.steps-0.04:d-0.08,x,rise+0.012,z,stairTop);
      if(s.style==='tower') {
        const nosing=material(i%4===0?'#d7a660':'#657c84',.5);
        box(vertical?w-.18:.045,.025,vertical?.045:d-.18,
          vertical?w/2:(s.reverse?x-length/s.steps*.4:x+length/s.steps*.4),rise+.027,
          vertical?(s.reverse?z-length/s.steps*.4:z+length/s.steps*.4):d/2,nosing);
      }
      if(moss&&i%4===1)box(vertical?w*0.28:length/s.steps-0.05,0.022,
        vertical?length/s.steps-0.05:d*0.24,vertical?w*0.7:x,rise+0.026,vertical?z:d*0.72,moss);
    }
  } else if(s.kind==='ramp'&&s.style==='candy') {
    const shell=material('#9e5546',.78),
      edge=material('#eed9b9',.84),grate=material('#c47755',.84);
    const red=material('#dc4b3f',.76),
      black=material('#416f6d',.9),depth=s.structureDepth??.72;
    const point=(t,lateral=.5)=>new THREE.Vector3(s.axis==='y'?w*lateral:w*t,
      h*(s.reverse?1-t:t),s.axis==='y'?d*t:d*lateral);
    const forward=point(1).sub(point(0)).normalize();
    const lateral=s.axis==='x'?new THREE.Vector3(0,0,1):new THREE.Vector3(-1,0,0);
    const normal=lateral.clone().cross(forward).normalize();
    const oriented=(t0,t1,thickness,lateralWidth,offset=0,lateralOffset=0,mat=grate)=>{
      const a=point(t0),b=point(t1),direction=b.clone().sub(a),length=direction.length();
      const center=a.add(b).multiplyScalar(.5).addScaledVector(normal,offset).addScaledVector(lateral,lateralOffset);
      const geometry=new THREE.BoxGeometry(length,thickness,lateralWidth);
      const matrix=new THREE.Matrix4().makeBasis(forward,normal,lateral);matrix.setPosition(center);
      geometry.applyMatrix4(matrix);return add(geometry,mat,0,0,0);
    };
    const top=[point(0,0),point(0,1),point(1,1),point(1,0)],bottom=top.map(value=>
      value.clone().addScaledVector(normal,-depth));
    const casing=new THREE.BufferGeometry(),positions=[...top,...bottom].flatMap(value=>value.toArray());
    casing.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    casing.setIndex([4,6,5,4,7,6,0,5,1,0,4,5,1,6,2,1,5,6,2,7,3,2,6,7,3,4,0,3,7,4]);
    casing.computeVertexNormals();add(casing,shell,0,0,0);
    const crossWidth=s.axis==='y'?w:d,channel=Math.min(.22,Math.max(.14,crossWidth*.055));
    for(const side of [-1,1])oriented(0,1,depth,channel,-depth/2,side*(crossWidth-channel)/2,edge);
    const bearers=Math.max(4,Math.min(12,Math.floor(point(0).distanceTo(point(1))/1.25)));
    for(let i=0;i<bearers;i++) {
      const t=.07+.86*i/(bearers-1),half=.11/Math.max(.001,point(0).distanceTo(point(1)));
      oriented(Math.max(.01,t-half),Math.min(.99,t+half),Math.min(.2,depth*.3),crossWidth-channel*2,
        -depth*.62,0,black);
    }
    const plates=Math.max(6,Math.min(18,Math.round(point(0).distanceTo(point(1))/.82)));
    for(let i=0;i<plates;i++) {
      const start=i/plates,end=(i+1)/plates,seam=.006,split=Math.min(end,start+.075/Math.max(.1,point(0).distanceTo(point(1))));
      oriented(start+seam,split,.04,crossWidth-channel*2,-.02,0,red);
      oriented(split,end-seam,.04,crossWidth-channel*2,-.02,0,grate);
    }
    for(const t of [.025,.975])oriented(Math.max(0,t-.018),Math.min(1,t+.018),Math.min(.28,depth*.42),
      crossWidth-.05,-depth*.55,0,edge);
    group.name='candy-industrial-stair';
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
  } else if(s.kind==='templePath') {
    const earth=material('#3d4937',0.01),slab=material('#78806a',0.02),moss=material('#557344',0.01);
    box(w,0.026,d,w/2,0.013,d/2,earth);
    const alongX=w>=d,length=alongX?w:d,count=Math.max(3,Math.ceil(length/1.65));
    for(let i=0;i<count;i++) {
      const t=(i+.5)/count;
      box(alongX?length/count-.055:w-.10,0.018,alongX?d-.10:length/count-.055,
        alongX?length*t:w/2,0.075,alongX?d/2:length*t,i===1||i===count-2?moss:slab);
    }
  } else if(s.kind==='templeCourt') {
    const earth=material('#344431',0.01),stoneField=material('#747b68',0.02);
    const axial=material('#929078',0.02),joint=material('#465445',0.01),moss=material('#527044',0.01);
    box(w,.026,d,w/2,.013,d/2,earth);
    // Large ordered paving bays give the approach scale. Wide joints and two
    // drainage lines are architectural details, not loose decorative props.
    const columns=3,rows=6,pad=.13,gap=.055,bayW=(w-pad*2-gap*(columns-1))/columns;
    const bayD=(d-pad*2-gap*(rows-1))/rows;
    for(let row=0;row<rows;row++)for(let column=0;column<columns;column++) {
      const x=pad+bayW/2+column*(bayW+gap),z=pad+bayD/2+row*(bayD+gap);
      box(bayW,.022,bayD,x,.075,z,column===1?axial:stoneField);
    }
    for(const x of [pad*.55,w-pad*.55])box(.075,.029,d-pad*.8,x,.083,d/2,joint);
    box(w*.22,.026,d*.12,w*.17,.09,d*.17,moss);
    box(w*.18,.026,d*.16,w*.78,.09,d*.79,moss);
  } else if(s.kind==='ruinDeck') {
    const core=material('#535e4f',0.03),slab=material('#898b70',0.02),moss=material('#587746',0.01);
    const vine=material('#385e36',0.01),leaf=material('#66884e',0.01);
    box(w,Math.max(.12,h-.10),d,w/2,Math.max(.12,h-.10)/2,d/2,core);
    // Broad continuous surfaces and perimeter bands make each wing read as
    // one monumental roof instead of a row of little floating slabs.
    const alongX=w>=d;
    box(w-.10,.075,d-.10,w/2,h-.045,d/2,slab);
    box(alongX?w-.18:.15,.12,alongX?.15:d-.18,w/2,h-.14,d/2,dark);
    for(const sign of [-1,1])box(alongX?w-.16:.11,.15,alongX?.11:d-.16,
      alongX?w/2:w/2+sign*(w/2-.085),h-.19,alongX?d/2+sign*(d/2-.085):d/2,stone);
    for(let t=.12;t<.95;t+=.24)box(alongX?.16:w-.12,.10,alongX?d-.12:.16,
      alongX?w*t:w/2,-.035,alongX?d/2:d*t,dark);
    box(alongX?w*.38:w*.12,.026,alongX?d*.12:d*.38,
      alongX?w*.66:w*.18,h+.018,alongX?d*.18:d*.66,moss);
    // Growth hangs from the roof itself, keeping decoration visually attached
    // and non-colliding instead of scattering separate flush props around it.
    for(let i=0;i<4;i++) {
      const t=.16+i*.22,x=alongX?w*t:.06,z=alongX?.06:d*t,drop=.34+(i%3)*.18;
      beam([x,.02,z],[x+(i%2?.05:-.04),-drop,z],.018,vine,6,.011);
      const l=add(new THREE.SphereGeometry(.075,6,4),leaf,x+(i%2?.07:-.06),-drop*.7,z);
      l.scale.set(1,.3,.55);l.rotation.z=i%2?.5:-.5;
    }
  } else if(s.kind==='ruinWall') {
    const core=material('#596354',0.02),blocks=material('#858770',0.02),moss=material('#557746',0.01);
    box(w,h-.08,d,w/2,(h-.08)/2,d/2,core);
    const alongX=w>=d,length=alongX?w:d,bays=Math.max(1,Math.ceil(length/2.8));
    // Restrained pilasters and one carved band match the undercroft walls.
    // They live on the two exterior faces; the previous almost-full-depth
    // inserts left hidden surfaces 10 mm behind the core and flashed through.
    for(let i=0;i<=bays;i++) {
      const t=Math.min(1,i/bays),along=.14+(length-.28)*t;
      for(const side of [-1,1])box(alongX?.16:.08,h-.28,alongX?.08:.16,
        alongX?along:w/2+side*(w/2+.03),(h-.28)/2,
        alongX?d/2+side*(d/2+.03):along,blocks);
    }
    // The horizontal band deliberately projects farther than the pilasters;
    // crossing trim must never share their exact façade plane.
    for(const side of [-1,1])box(alongX?w-.10:.12,.13,alongX?.12:d-.10,
      alongX?w/2:w/2+side*(w/2+.05),h*.62,
      alongX?d/2+side*(d/2+.05):d/2,blocks);
    box(w+.035,.12,d+.035,w/2,h-.07,d/2,blocks);
    box(Math.max(.08,w-.08),.055,Math.max(.08,d-.08),w/2,h+.01,d/2,moss);
  } else if(s.kind==='ruinPlatform') {
    const ruin=material('#626b58',0.04),face=material('#8d9074',0.02),moss=material('#597946',0.01);
    box(w,h-0.10,d,w/2,(h-0.10)/2,d/2,ruin);
    // Uneven slab courses and recessed corner stones make the terrace feel
    // assembled from ancient masonry while preserving its clean collider.
    const alongX=w>=d,count=Math.max(4,Math.floor((alongX?w:d)/1.15));
    for(let i=0;i<count;i++) {
      const t=(i+0.5)/count;
      box(alongX?w/count-0.055:w-0.10,0.11,alongX?d-0.08:d/count-0.055,
        alongX?w*t:w/2,h-0.055,alongX?d/2:d*t,i%3===1?stone:face);
    }
    for(const [x,z] of [[0.16,0.16],[w-0.16,0.16],[0.16,d-0.16],[w-0.16,d-0.16]])
      box(0.28,h-0.28,0.28,x,(h-0.28)/2,z,dark);
    box(w*0.56,0.025,d*0.13,w*0.58,h+0.012,d*0.13,moss);
    box(w*0.22,0.028,d*0.18,w*0.16,h+0.014,d*0.76,moss);
  } else if(s.kind==='templeStep') {
    const drum=material('#777b67',0.025),cut=material('#a09a78',0.02),moss=material('#567646',0.01);
    const radius=Math.min(w,d)*.43;
    // Broad broken column drums: visibly climbable, flat on top, and confined
    // to the circular collider so their corners never catch the player.
    add(new THREE.CylinderGeometry(radius*1.04,radius*1.1,Math.min(.16,h),12),cut,w/2,Math.min(.08,h/2),d/2);
    add(new THREE.CylinderGeometry(radius*.91,radius,h-Math.min(.22,h*.3),12),drum,
      w/2,Math.min(.14,h*.2)+(h-Math.min(.22,h*.3))/2,d/2);
    add(new THREE.CylinderGeometry(radius*1.02,radius*.92,Math.min(.14,h*.24),12),cut,
      w/2,h-Math.min(.07,h*.12),d/2);
    const growth=add(new THREE.CircleGeometry(radius*.48,12),moss,w*.58,h+.006,d*.46);
    growth.rotation.x=-Math.PI/2;
  } else if(s.kind==='templeTowerDeck') {
    const core=material('#505a4d',0.035),slab=material('#888970',0.02),moss=material('#557445',0.01);
    box(w,Math.max(.12,h-.07),d,w/2,Math.max(.12,h-.07)/2,d/2,core);
    box(w-.05,.085,d-.05,w/2,h-.043,d/2,slab);
    const alongX=w>=d,length=alongX?w:d;
    for(let at=.45;at<length-.2;at+=.85)box(alongX?.13:w-.12,.22,alongX?d-.12:.13,
      alongX?at:w/2,-.08,alongX?d/2:at,core);
    box(alongX?w*.38:w*.22,.024,alongX?d*.2:d*.38,
      alongX?w*.68:w*.25,h+.012,alongX?d*.25:d*.66,moss);
  } else if(s.kind==='templeTowerPillar') {
    const baseStone=material('#596255',0.025),shaft=material('#747866',0.025),carved=material('#989477',0.02);
    const moss=material('#4e7041',0.01),radius=Math.min(w,d)*.38;
    box(w,.32,d,w/2,.16,d/2,baseStone);
    // Stacked, subtly tapered courses keep the tall supports monumental while
    // their collision remains one predictable square footprint.
    const courses=Math.max(4,Math.ceil(h/1.25));
    for(let i=0;i<courses;i++) {
      const bottom=.28+(h-.58)*i/courses,top=.28+(h-.58)*(i+1)/courses;
      const inset=.04+(i%3)*.018;
      box(w-inset*2,top-bottom-.025,d-inset*2,w/2,(bottom+top)/2,d/2,i%3===1?shaft:baseStone,.035);
    }
    add(new THREE.CylinderGeometry(radius*1.02,radius*.88,.18,8),carved,w/2,h-.25,d/2);
    box(w,.24,d,w/2,h-.12,d/2,carved);
    box(w*.62,.035,d*.42,w*.58,h+.012,d*.45,moss);
  } else if(s.kind==='templeTree') {
    const bark=material('#59452f',0.02),barkLight=material('#796143',0.01);
    const moss=material('#557642',0.01),leaves=material('#315f3c',0.01),sunLeaves=material('#5d8748',0.01);
    const cx=w/2,cz=d/2,trunk=Math.min(w,d)*0.23;
    add(new THREE.CylinderGeometry(trunk*0.72,trunk,h*0.72,11),bark,cx,h*0.36,cz);
    // Buttress roots stay inside the authored circular footprint.
    for(let i=0;i<7;i++) {
      const a=i*Math.PI*2/7,r=Math.min(w,d)*0.27;
      beam([cx,h*0.24,cz],[cx+Math.cos(a)*r,0.10,cz+Math.sin(a)*r],trunk*0.28,barkLight,8,trunk*0.08);
    }
    for(let i=0;i<6;i++) {
      const a=i*Math.PI*2/6+0.35,end=[cx+Math.cos(a)*Math.min(w,d)*0.38,h*0.73+(i%2)*0.38,cz+Math.sin(a)*Math.min(w,d)*0.38];
      beam([cx,h*0.48,cz],end,trunk*0.32,bark,9,trunk*0.15);
      const crown=add(new THREE.IcosahedronGeometry(Math.min(w,d)*(i%2?0.22:0.27),1),i%2?sunLeaves:leaves,
        end[0],end[1]+0.42,end[2]);crown.scale.set(1.25,0.8,1.05);crown.rotation.y=a;
    }
    const crown=add(new THREE.IcosahedronGeometry(Math.min(w,d)*0.34,2),leaves,cx,h*0.88,cz);
    crown.scale.set(1.2,0.72,1.08);
    for(let i=0;i<5;i++) {
      const a=i*1.87;beam([cx+Math.cos(a)*trunk*.9,0.03,cz+Math.sin(a)*trunk*.9],
        [cx+Math.cos(a)*trunk*1.25,h*.45,cz+Math.sin(a)*trunk*1.25],0.035,moss,6,0.018);
    }
  } else if(s.kind==='templePillar') {
    const ruin=material('#747b68',0.03),moss=material('#5d7a49',0.01),radius=Math.min(w,d)*0.38;
    add(new THREE.CylinderGeometry(radius*1.18,radius*1.28,0.22,10),dark,w/2,0.11,d/2);
    add(new THREE.CylinderGeometry(radius*0.84,radius,h-0.36,10),ruin,w/2,(h-0.36)/2+0.22,d/2);
    add(new THREE.CylinderGeometry(radius*1.03,radius*0.87,0.20,10),stone,w/2,h-0.24,d/2);
    for(const y of [h*.28,h*.62])add(new THREE.TorusGeometry(radius*.91,0.045,5,10),dark,w/2,y,d/2).rotation.x=Math.PI/2;
    box(radius*0.9,0.035,radius*0.55,w*.58,h-0.11,d*.42,moss);
  } else if(s.kind==='templeRoot') {
    const bark=material('#5f4932',0.01),moss=material('#66834c',0.01),alongX=w>=d;
    const start=alongX?[0.08,h*.34,d*.52]:[w*.52,h*.34,0.08];
    const end=alongX?[w-0.08,h*.24,d*.46]:[w*.46,h*.24,d-0.08];
    beam(start,end,Math.min(w,d)*.31,bark,9,Math.min(w,d)*.20);
    for(const t of [.22,.52,.78]) {
      const x=alongX?w*t:w*(t%0.4+.25),z=alongX?d*(t%0.35+.3):d*t;
      beam([x,h*.28,z],[x+(alongX?0:(t-.5)*w*.5),0.02,z+(alongX?(t-.5)*d*.5:0)],
        Math.min(w,d)*.12,bark,7,0.025);
    }
    beam([...(alongX?[w*.18,h*.56,d*.48]:[w*.48,h*.56,d*.18])],
      [...(alongX?[w*.78,h*.43,d*.48]:[w*.48,h*.43,d*.78])],0.035,moss,6,0.018);
  } else if(s.kind==='templeAltar') {
    const ruin=material('#737965',0.03),carved=material('#aaa47f',0.04),moss=material('#567543',0.01);
    box(w,Math.min(h*.28,.28),d,w/2,Math.min(h*.14,.14),d/2,dark);
    box(w*.82,h*.5,d*.78,w/2,h*.4,d/2,ruin);
    box(w*.64,h*.22,d*.60,w/2,h*.78,d/2,carved);
    for(const x of [w*.25,w*.5,w*.75])box(0.055,h*.28,0.035,x,h*.46,-0.012,dark);
    const light=material('#9fc278',0.03);light.emissive.set('#608840');light.emissiveIntensity=.42;
    const bowl=add(new THREE.CylinderGeometry(Math.min(w,d)*.14,Math.min(w,d)*.20,.15,12),light,w/2,h+.01,d/2);
    bowl.scale.y=.45;box(w*.28,.025,d*.16,w*.7,h+.025,d*.3,moss);
  } else if(s.kind==='templePool') {
    const water=new THREE.MeshPhysicalMaterial({color:'#4b8f84',transparent:true,opacity:.74,roughness:.16,
      metalness:.05,transmission:.08,clearcoat:.7,clearcoatRoughness:.18,depthWrite:false});
    const bed=material('#526e62',0.02),edge=material('#7f856f',0.02);
    // The old bed ended exactly at world Y=0, sharing the grass plane and
    // flashing like a turquoise carpet. Give bed, water and rim three explicit
    // depth layers, all clear of the arena floor and one another.
    const bedMesh=box(w-.22,.022,d-.22,w/2,.058,d/2,bed);bedMesh.name='temple-pool-bed';
    const waterMesh=box(w-.25,.016,d-.25,w/2,.091,d/2,water);waterMesh.name='temple-pool-water';
    const rimY=.0875,rimHeight=.075,rim=.12;
    for(const z of [rim/2,d-rim/2]) {
      const piece=box(w,rimHeight,rim,w/2,rimY,z,edge);piece.name='temple-pool-rim';
    }
    for(const x of [rim/2,w-rim/2]) {
      const piece=box(rim,rimHeight,Math.max(.08,d-rim*2),x,rimY,d/2,edge);piece.name='temple-pool-rim';
    }
    for(let x=.35;x<w;x+=1.3)for(let z=.3;z<d;z+=1.1)
      add(new THREE.CylinderGeometry(.08+(x%1)*.035,.08+(x%1)*.035,.018,8),edge,x,.098,z);
  } else if(s.kind==='waterfall') {
    const rock=material('#56645b',0.02),moss=material('#4d7347',0.01);
    const water=new THREE.MeshPhysicalMaterial({color:'#79c4ba',transparent:true,opacity:.72,roughness:.1,
      transmission:.18,clearcoat:1,emissive:'#315e59',emissiveIntensity:.18});
    box(w,h,d,w/2,h/2,d/2,rock);
    const alongX=w>=d;
    for(const side of [.12,.88])box(alongX?w*.76:w*.22,h*.9,alongX?d*.22:d*.76,
      alongX?w/2:w*side,h*.47,alongX?d*side:d/2,moss);
    box(alongX?w*.7:.035,h*.86,alongX?.035:d*.7,alongX?w/2:-.04,h*.48,alongX?-.04:d/2,water);
    for(let i=0;i<7;i++) {
      const foam=add(new THREE.IcosahedronGeometry(.10+(i%3)*.025,1),water,
        alongX?w*(.25+i*.08):.05,.10+(i%2)*.06,alongX?.05:d*(.25+i*.08));foam.scale.y=.35;
    }
  } else if(s.kind==='templeVine') {
    const vine=material('#42683d',0.01),leaf=material('#68904f',0.01),alongX=w>=d,length=alongX?w:d;
    for(let i=0;i<Math.max(3,Math.floor(length/.65));i++) {
      const t=(i+.4)/(Math.max(3,Math.floor(length/.65))),drop=h*(.45+.45*((i*7)%5)/4);
      const x=alongX?w*t:w/2,z=alongX?d/2:d*t;
      beam([x,h,z],[x+(i%2?.08:-.08),h-drop,z],.025,vine,6,.014);
      for(const f of [.35,.68]) {
        const l=add(new THREE.SphereGeometry(.10,6,4),leaf,x+(i%2?.11:-.11),h-drop*f,z);
        l.scale.set(1,.32,.6);l.rotation.z=i%2?.55:-.55;
      }
    }
  } else if(s.kind==='turbine') {
    const shell=material('#52656a',0.78),steel=material('#91a0a1',0.84),black=material('#263238',0.7);
    const hot=material(s.accent||'#f0a35a',0.32);hot.emissive.set(s.accent||'#f0a35a');hot.emissiveIntensity=1.45;
    const cx=w/2,cz=d/2,r=Math.min(w,d)*.29,length=w*.72;
    // A supported horizontal rotor fills the hall like real plant machinery;
    // every visible part stays inside the circular authored collider.
    for(const x of [w*.18,w*.82]) {
      box(.34,h*.62,.48,x,h*.31,cz,black);
      box(.52,.18,.68,x,.09,cz,steel);
    }
    const rotor=add(new THREE.CylinderGeometry(r,r,length,20),shell,cx,h*.56,cz);rotor.rotation.z=Math.PI/2;
    for(const x of [w*.24,w*.38,w*.62,w*.76]) {
      const ring=add(new THREE.TorusGeometry(r+.035,.075,7,22),x===w*.38||x===w*.62?hot:steel,x,h*.56,cz);
      ring.rotation.y=Math.PI/2;
    }
    const hub=add(new THREE.CylinderGeometry(r*.42,r*.42,w*.12,16),hot,cx,h*.56,cz);hub.rotation.z=Math.PI/2;
    for(let i=0;i<8;i++) {
      const a=i*Math.PI/4;
      beam([cx,h*.56,cz],[cx,h*.56+Math.cos(a)*r*.78,cz+Math.sin(a)*r*.78],.045,black,6,.025);
    }
  } else if(s.kind==='storageRack') {
    const frame=material('#4d5d62',0.78),shelf=material(s.accent||'#78bed0',0.62);
    const crate=material('#927553',0.08),crateDark=material('#645344',0.12);
    for(const x of [.13,w-.13])for(const z of [.10,d-.10])box(.16,h,.16,x,h/2,z,frame);
    const levels=3;
    for(let i=0;i<=levels;i++) {
      const y=.08+(h-.16)*i/levels;
      box(w,.09,d,w/2,y,d/2,i===levels?shelf:frame);
      if(i<levels)for(let slot=0;slot<3;slot++) {
        const bw=w/3-.13,bh=(h-.25)/levels*.58;
        box(bw,bh,d*.68,(slot+.5)*w/3,y+.10+bh/2,d/2,(slot+i)%3===0?crateDark:crate,.035);
        box(bw*.72,.025,d*.70,(slot+.5)*w/3,y+.10+bh*.72,d/2,shelf,.008);
      }
    }
  } else if(s.kind==='candyPier') {
    const enamel=material('#e9d8b9',.24),steel=material('#426b69',.65),terra=material('#b45d48',.4);
    box(w-.06,h-.30,d-.06,w/2,h/2,d/2,enamel);
    box(w,.18,d,w/2,.09,d/2,steel);
    box(w,.18,d,w/2,h-.09,d/2,terra);
    group.name='candy-gallery-support';return group;
  } else if(s.kind==='candyQualityBench') {
    const enamel=material('#ead7b7',.34),teal=material('#4c7776',.6),steel=material('#a8bbb1',.72),
      dark=material('#354746',.45),coral=material('#be5546',.4);
    box(w-.02,h-.34,d-.02,w/2,(h-.34)/2,d/2,enamel);
    box(w-.06,.16,d-.06,w/2,.08,d/2,teal);
    box(w,.14,d,w/2,h-.27,d/2,steel);
    for(const z of [.018,d-.018]) {
      box(w-.22,.10,.035,w/2,h-.53,z,teal);
      for(const x of [w*.25,w*.75]) {
        box(.12,.30,.045,x,h*.47,z,teal);
        box(w*.31,.018,.04,x,h*.28,z,dark);
      }
    }
    // Three shallow sample cassettes sit inside the machine's silhouette.
    for(let i=0;i<3;i++) {
      const x=w*(.22+i*.28);
      box(w*.19,.14,d*.48,x,h-.12,d/2,teal);
      box(w*.15,.035,d*.36,x,h-.032,d/2,i===1?coral:enamel);
    }
    group.name='candy-quality-bench';return group;
  } else if(s.kind==='candyIngredientBank') {
    const enamel=material('#e9d2ae',.32),steel=material('#527573',.72),
      coral=material('#b95144',.52),dark=material('#384f51',.68);
    box(w-.02,.42,d-.02,w/2,.21,d/2,steel);
    const sections=3,pitch=(w-.48)/sections;
    for(let i=0;i<sections;i++) {
      const x=.24+pitch*(i+.5),r=Math.min(pitch*.34,d*.29);
      add(new THREE.CylinderGeometry(r*.82,r,h-1.1,16),enamel,x,(h-1.1)/2+.42,d/2);
      add(new THREE.ConeGeometry(r*.84,.68,16),coral,x,h-.34,d/2);
      box(pitch-.15,.16,d*.58,x,.62,d/2,dark);
      box(pitch*.46,.14,.04,x,h*.70,d-.055,steel);
      box(pitch*.24,.10,.045,x,h*.70,d-.028,coral);
    }
    group.name='candy-ingredient-bank';return group;
  } else if(s.kind==='candyCooker') {
    const enamel=material('#e8d1ad',.34),coral=material('#b94d40',.55),
      steel=material('#496f6f',.75),dark=material('#304a4d',.7);
    const amber=new THREE.MeshStandardMaterial({color:'#ef9860',emissive:'#c94b2e',
      emissiveIntensity:.8,roughness:.36,metalness:.18});
    const cx=w/2,cz=d/2,r=Math.min(w,d)*.39;
    add(new THREE.CylinderGeometry(r*.98,r*1.06,.55,24),dark,cx,.28,cz);
    add(new THREE.CylinderGeometry(r*.88,r*.94,h*.57,28),enamel,cx,h*.57/2+.55,cz);
    for(const y of [.72,h*.30,h*.58])
      add(new THREE.TorusGeometry(r*.91,.09,8,28),y===h*.30?steel:coral,cx,y,cz).rotation.x=Math.PI/2;
    add(new THREE.ConeGeometry(r*.87,h*.16,28),coral,cx,h*.68,cz);
    add(new THREE.CylinderGeometry(r*.42,r*.50,h*.17,20),steel,cx,h*.84,cz);
    add(new THREE.CylinderGeometry(r*.48,r*.48,.25,20),dark,cx,h-.13,cz);
    // A protected level glass makes the vessel readable from the floor.
    const tube=add(new THREE.CylinderGeometry(.18,.18,h*.43,12),amber,
      cx+r*.67,h*.38,cz+r*.64);tube.castShadow=false;
    for(const y of [h*.18,h*.39,h*.59])box(.34,.07,.12,cx+r*.67,y,cz+r*.82,steel);
    const stirrer=new THREE.Group();stirrer.position.set(cx,h*.72,cz);group.add(stirrer);
    for(let i=0;i<3;i++) {
      const arm=new THREE.Mesh(new RoundedBoxGeometry(r*.68,.09,.15,2,.04),steel);
      arm.position.set(Math.cos(i*Math.PI*2/3)*r*.22,.03,Math.sin(i*Math.PI*2/3)*r*.22);
      arm.rotation.y=i*Math.PI*2/3;stirrer.add(arm);
    }
    group.userData.update=time=>{stirrer.rotation.y=time*.42;};
    group.name='candy-syrup-cooker';return group;
  } else if(s.kind==='candyDepositor') {
    const steel=material('#517675',.7),enamel=material('#ead5b2',.34),
      coral=material('#bc5042',.5),dark=material('#364e51',.66),
      candy=[material('#ed925d',.1),material('#82beb0',.1),material('#e4b45f',.1)];
    box(w-.02,.54,d-.02,w/2,.27,d/2,dark);
    box(w-.12,.12,d*.56,w/2,.64,d*.50,steel);
    for(let i=0;i<11;i++)for(let row=0;row<2;row++)
      box(.20,.09,.17,.46+i*(w-.92)/10,.74,d*.32+row*d*.23,candy[(i+row)%3]);
    for(const x of [.28,w-.28])box(.28,h-.55,.38,x,(h-.55)/2+.55,d*.72,enamel);
    const head=new THREE.Group();head.position.set(w/2,h*.72,d*.42);group.add(head);
    const beamMesh=new THREE.Mesh(new RoundedBoxGeometry(w-.70,.48,d*.56,2,.10),coral);
    head.add(beamMesh);
    for(let i=0;i<10;i++) {
      const x=(i-4.5)*(w-.95)/10;
      const nozzle=new THREE.Mesh(new THREE.CylinderGeometry(.045,.075,.44,8),steel);
      nozzle.position.set(x,-.43,0);head.add(nozzle);
    }
    box(w-.54,.15,.15,w/2,h-.10,d*.78,enamel);
    group.userData.update=time=>{head.position.y=h*.72+Math.sin(time*2.6)*.055;};
    group.name='candy-mould-depositor';return group;
  } else if(s.kind==='candyCoolingHousing') {
    const enamel=material('#e7d5bc',.32),steel=material('#456d70',.72),
      dark=material('#324b51',.65),coral=material('#c35e4b',.4);
    const glass=new THREE.MeshStandardMaterial({color:'#88b9b5',metalness:.24,roughness:.22,
      emissive:'#244f53',emissiveIntensity:.25});
    box(w-.02,h-.02,d-.10,w/2,h/2,d/2,enamel);
    for(const z of [.04,d-.04]) {
      const outer=z<d/2?-.005:.005;
      box(w-.32,h*.43,.05,w/2,h*.51,z,glass);
      for(let i=1;i<9;i++)box(.07,h*.48,.06,w*i/9,h*.52,z+outer,steel);
      box(w-.24,.13,.065,w/2,h*.22,z+outer,coral);
    }
    for(let i=1;i<8;i++) {
      const x=w*i/8;
      box(.10,.08,d-.12,x,h-.055,d/2,steel);
      box(.31,.04,d*.47,x,h-.01,d/2,dark);
    }
    // The inlet mouths line up with both powered feed belts. The openings
    // are too low for an actor, so the housing remains one honest solid.
    for(const x of [.025,w-.025]) {
      box(.045,.63,2.48,x,1.23,2.4,dark);
      box(.05,.09,2.60,x,1.58,2.4,coral);
    }
    box(2.72,.63,.05,w/2,1.23,d-.025,dark);
    box(2.84,.09,.055,w/2,1.58,d-.022,coral);
    group.name='candy-cooling-enclosure';return group;
  } else if(s.kind==='candyControlBooth') {
    const enamel=material('#ead7b7',.3),steel=material('#4c7776',.67),
      dark=material('#314a4d',.62),screen=material('#7bc6b5',.14),
      coral=material('#be5546',.48);
    box(w-.02,h-.02,d-.10,w/2,h/2,d/2,enamel);
    for(const z of [.04,d-.04]) {
      const outer=z<d/2?-.005:.005;
      box(w-.24,h*.48,.055,w/2,h*.58,z,dark);
      for(let i=1;i<5;i++)box(.075,h*.54,.065,w*i/5,h*.59,z+outer,steel);
      box(w*.22,.14,.065,w*.23,h*.64,z+outer,screen);
      box(w*.14,.14,.065,w*.56,h*.64,z+outer,screen);
    }
    box(w-.12,.16,d-.12,w/2,h-.08,d/2,coral);
    group.name='candy-line-control-booth';return group;
  } else if(s.kind==='candyMouldRack') {
    const steel=material('#496c6e',.72),enamel=material('#e7d2b1',.3),
      trays=[material('#d37856',.16),material('#84b6a7',.14)];
    box(w-.02,.22,d-.02,w/2,.11,d/2,steel);
    for(const x of [.10,w-.10])for(const z of [.10,d-.10])
      box(.19,h-.22,.19,x,(h-.22)/2+.22,z,steel);
    for(let i=0;i<4;i++) {
      const y=.52+i*(h-.75)/3;
      box(w-.15,.09,d-.15,w/2,y,d/2,enamel);
      for(let j=0;j<6;j++)box((w-.45)/7,.12,d*.48,.28+j*(w-.56)/6,y+.11,d/2,trays[(i+j)%2]);
    }
    group.name='candy-mould-rack';return group;
  } else if(s.kind==='candyPipeRiser') {
    const steel=material('#497777',.72),coral=material('#bd5448',.54),r=Math.min(w,d)*.145;
    add(new THREE.CylinderGeometry(r,r,h-.10,12),steel,w/2,h/2,d/2);
    for(const y of [.12,h*.5,h-.12])
      add(new THREE.TorusGeometry(r+.018,.035,7,16),coral,w/2,y,d/2).rotation.x=Math.PI/2;
    group.name='candy-process-riser';return group;
  } else if(s.kind==='candyDockFacade') {
    const dark=material('#405c5e',.56),enamel=material('#e6d2b0',.3),coral=material('#ba5547',.45);
    box(w-.01,h-.02,d-.02,w/2,h/2,d/2,dark);
    for(let i=1;i<13;i++)box(w-.005,.055,d-.07,w/2,h*i/13,d/2,enamel);
    box(w-.005,.22,d-.04,w/2,h-.13,d/2,coral);
    group.name='candy-receiving-shutter';return group;
  } else if(s.kind==='candyRoofTruss') {
    const steel=material('#5b7775',.68),ivory=material('#ead4b3',.3),
      coral=material('#bc5849',.48),bays=Math.max(3,Math.round(w/2.8));
    for(const z of [.10,d-.10]) {
      box(w-.02,.17,.13,w/2,.12,z,steel);
      box(w-.02,.15,.12,w/2,h-.10,z,ivory);
      for(let i=0;i<bays;i++) {
        const x0=.12+(w-.24)*i/bays,x1=.12+(w-.24)*(i+1)/bays;
        beam([x0,.17,z],[x1,h-.17,z],.055,steel,7,.04);
        if(i%2===0)box(.13,h-.28,.13,x0,h/2,z,coral);
      }
    }
    group.name='candy-roof-truss';return group;
  } else if(s.kind==='candyZoneSign') {
    const dark=material('#3b5758',.62),ivory=material('#f0d8b4',.28),
      accent=material(s.station==='cool'?'#75b8b2':s.station==='pack'?'#d59b69':'#c45b48',.28);
    box(w-.04,h-.02,d-.04,w/2,h/2,d/2,dark);
    const alongX=w>d,long=alongX?w:d;
    for(const side of [-1,1]) {
      const face=alongX?(side<0?.017:d-.017):(side<0?.017:w-.017);
      box(alongX?long*.70:.025,.16,alongX?.025:long*.70,
        alongX?w/2:face,h*.7,alongX?face:d/2,ivory);
      box(alongX?long*.32:.029,.23,alongX?.029:long*.32,
        alongX?w*.34:face,h*.4,alongX?face:d*.34,accent);
      box(alongX?long*.22:.029,.23,alongX?.029:long*.22,
        alongX?w*.72:face,h*.4,alongX?face:d*.72,accent);
    }
    group.name='candy-process-wayfinding';return group;
  } else if(s.kind==='candyTunnelRoof') {
    const enamel=material('#e4c6a4',.28),rib=material('#9f5146',.52),
      inset=material('#457674',.46);
    const lamp=new THREE.MeshStandardMaterial({color:'#f6c99c',emissive:'#ee8658',
      emissiveIntensity:.65,roughness:.5,metalness:.12});
    // The pale enamel underside and transverse duct ribs belong to one solid
    // overhead slab. Every visible part remains inside its collision volume.
    box(w,h-.04,d,w/2,(h+.04)/2,d/2,enamel);
    for(let x=1.7;x<w-1;x+=3.6) {
      box(.12,.045,d-.12,x,.027,d/2,rib);
      box(.035,.04,d-.46,x+.16,.025,d/2,inset);
    }
    for(const z of [.22,d-.22])box(w-.24,.045,.11,w/2,.027,z,lamp);
    group.name='candy-service-tunnel-roof';return group;
  } else if(s.kind==='candyMixingFloor'||s.kind==='candyGallery') {
    const apron=s.kind==='candyMixingFloor';
    const foundation=material('#ad5a46',.38),edge=material('#f0d6ae',.32),
      deck=material(apron?'#cb7654':'#d59768',.28),rib=material('#427574',.42),red=material('#dd4b40',.36);
    if(s.seamless) {
      add(new THREE.BoxGeometry(w,h-.065,d),edge,w/2,(h-.065)/2,d/2);
      add(new THREE.BoxGeometry(w,.065,d),deck,w/2,h-.0325,d/2);
      box(w-.08,.13,.045,w/2,.14,d+.015,rib);
      box(w-.10,.035,.055,w/2,.24,d+.018,red);
      group.name=apron?'candy-mixing-floor':'candy-packing-gallery';return group;
    }
    box(w-.12,Math.max(.04,h-.04),d-.12,w/2,Math.max(.04,h-.04)/2,d/2,foundation);
    box(w-.055,.07,d-.055,w/2,h-.035,d/2,deck);
    const alongX=w>=d,long=alongX?w:d;
    for(let t=.85;t<long-.45;t+=1.65) {
      box(alongX?.024:w-.25,.012,alongX?d-.25:.024,
        alongX?t:w/2,h+.006,alongX?d/2:t,edge);
    }
    if(apron) {
      // Panelled foundation walls are the actual sides of the cargo trench.
      // Their red and cream fields are attached to the solid dock, not props.
      for(const side of [.028,d-.028]) {
        box(w-.20,h*.46,.045,w/2,h*.52,side,edge);
        box(w-.26,.105,.055,w/2,h*.23,side,red);
      }
      for(const side of [.028,w-.028]) {
        box(.045,h*.46,d-.20,side,h*.52,d/2,edge);
        box(.055,.105,d-.26,side,h*.23,d/2,red);
      }
    } else {
      if(alongX)for(const z of [.07,d-.07]) {
        box(w-.06,.16,.085,w/2,.13,z,rib);
        box(w-.12,.065,.075,w/2,h-.07,z,red);
      } else for(const x of [.07,w-.07]) {
        box(.085,.16,d-.06,x,.13,d/2,rib);
        box(.075,.065,d-.12,x,h-.07,d/2,red);
      }
    }
    group.name=apron?'candy-mixing-floor':'candy-packing-gallery';return group;
  } else if(s.kind==='candyPress') {
    const red=material('#bd3d37',.55),deep=material('#703530',.67),
      cream=material('#ecd6b6',.42),teal=material('#477674',.62);
    const lamp=new THREE.MeshStandardMaterial({color:'#e8684e',emissive:'#f34238',
      emissiveIntensity:1.3,roughness:.25,metalness:.18,toneMapped:false});
    const face=d*.76;
    box(w-.02,h-.04,d*.70,w/2,h/2,d*.35,deep);
    box(w-.30,h-.40,d*.20,w/2,h/2,face,red);
    for(const x of [.20,w-.20]) {
      box(.27,h-.16,d*.24,x,h/2,face,cream);
      box(.08,h-.34,d*.27,x,h/2,face,teal);
    }
    for(const y of [.24,h-.24])box(w-.10,.26,d*.24,w/2,y,face,cream);
    for(let i=1;i<7;i++) {
      const x=w*i/7;
      box(.085,h-.68,d*.24,x,h/2,face,deep);
      box(.095,.15,d*.25,x,h*.18,face,teal);
    }
    const rollerZ=d*.66,rollerR=Math.min(.28,d*.18);
    for(const y of [h*.43,h*.60]) {
      const roller=add(new THREE.CylinderGeometry(rollerR,rollerR,w*.59,18),cream,w/2,y,rollerZ);
      roller.rotation.z=Math.PI/2;
      for(const x of [w*.205,w*.795]) {
        const bearing=add(new THREE.TorusGeometry(rollerR+.035,.055,7,20),teal,x,y,rollerZ);
        bearing.rotation.y=Math.PI/2;
      }
    }
    for(let i=0;i<8;i++) {
      const x=w*(i+.5)/8;
      const mold=add(new THREE.SphereGeometry(.12,10,8),i%2?teal:cream,x,h*.52,d*.90);
      mold.scale.z=.42;
    }
    for(const x of [w*.16,w*.84])for(const y of [h*.25,h*.8]) {
      const light=box(.22,.06,.035,x,y,d*.91,lamp);light.castShadow=false;
    }
    group.name='candy-rotary-sugar-press';return group;
  } else if(s.kind==='candyPiston') {
    const red=material('#ac443a',.6),cream=material('#ead4b0',.47),steel=material('#537b78',.72);
    const cx=w/2,cz=d/2,r=Math.min(w,d)*.36;
    add(new THREE.CylinderGeometry(r*.95,r*1.08,.34,16),red,cx,.17,cz);
    add(new THREE.CylinderGeometry(r*.64,r*.75,h-.72,16),cream,cx,h/2,cz);
    add(new THREE.CylinderGeometry(r*.42,r*.42,h*.56,16),steel,cx,h*.53,cz);
    for(const y of [.6,h*.35,h*.72,h-.3]) {
      const ring=add(new THREE.TorusGeometry(r*.76,.075,7,20),red,cx,y,cz);
      ring.rotation.x=Math.PI/2;
    }
    add(new THREE.CylinderGeometry(r*.9,r*.9,.3,16),red,cx,h-.15,cz);
    group.name='candy-press-actuator';return group;
  } else if(s.kind==='candyVat') {
    const shell=material('#f0d9b7',.32),rim=material('#c35c50',.48),
      mint=material('#69a9a0',.4),syrup=material('#8f4d70',.18);
    const cx=w/2,cz=d/2,r=Math.min(w,d)*.36;
    add(new THREE.CylinderGeometry(r*.94,r,.28,20),rim,cx,.14,cz);
    add(new THREE.CylinderGeometry(r*.82,r*.9,h-.47,20),shell,cx,(h-.47)/2+.25,cz);
    for(const y of [.45,h*.48,h-.24]) {
      const hoop=add(new THREE.TorusGeometry(r*.84,.06,7,24),y===h*.48?mint:rim,cx,y,cz);
      hoop.rotation.x=Math.PI/2;
    }
    add(new THREE.CylinderGeometry(r*.69,r*.69,.055,20),syrup,cx,h-.55,cz);
    const lip=add(new THREE.TorusGeometry(r*.79,.09,8,24),rim,cx,h-.12,cz);
    lip.rotation.x=Math.PI/2;
    const mixer=new THREE.Group();mixer.position.set(cx,h-.35,cz);group.add(mixer);
    const stem=new THREE.Mesh(new THREE.CylinderGeometry(.08,.08,.35,10),mint);
    stem.position.y=.09;mixer.add(stem);
    for(let i=0;i<3;i++) {
      const blade=new THREE.Mesh(new RoundedBoxGeometry(r*.58,.055,.13,2,.025),mint);
      blade.position.set(Math.cos(i*Math.PI*2/3)*r*.28,.06,Math.sin(i*Math.PI*2/3)*r*.28);
      blade.rotation.y=-i*Math.PI*2/3;mixer.add(blade);
    }
    group.userData.update=time=>{mixer.rotation.y=time*.65;};
    group.name='candy-syrup-mixer';return group;
  } else if(s.kind==='candySupplyTank') {
    const shell=material('#e9d0ac',.42),band=material('#9f5145',.58),
      valve=material('#4c7775',.68),cx=w/2,cz=d/2,r=Math.min(w,d)*.34;
    add(new THREE.CylinderGeometry(r,r*.92,h-.18,16),shell,cx,(h-.18)/2,cz);
    for(const y of [.20,h*.48,h-.14])
      add(new THREE.TorusGeometry(r,.055,6,20),band,cx,y,cz).rotation.x=Math.PI/2;
    add(new THREE.CylinderGeometry(.20,.20,.16,12),valve,cx,h-.08,cz);
    box(.18,.54,.10,cx,.90,cz+r+.04,valve);
    group.name='candy-ingredient-reservoir';return group;
  } else if(s.kind==='candyTemperingDrum') {
    const base=material('#a55143',.54),frame=material('#f0d9b6',.56),
      steel=material('#4b7775',.68),coral=material('#dc7154',.18),
      cream=material('#f4d29a',.12),mint=material('#76ada2',.14);
    const glass=new THREE.MeshPhysicalMaterial({color:'#a6d8ce',metalness:.12,roughness:.13,
      transparent:true,opacity:.32,depthWrite:false,side:THREE.DoubleSide});
    const cx=w/2,cz=d/2,cy=h*.58,r=Math.min(d*.42,h*.36),length=w-.44;
    box(w-.04,.64,d-.04,cx,.32,cz,base);
    for(const x of [.88,w-.88])box(.44,.72,d*.46,x,1.0,cz,frame);
    const drum=add(new THREE.CylinderGeometry(r,r,length,24,1,true),glass,cx,cy,cz);
    drum.rotation.z=Math.PI/2;drum.castShadow=false;drum.name='candy-tempering-inspection-glass';
    for(const x of [.32,w-.32]) {
      const cap=add(new THREE.CylinderGeometry(r,r,.18,24),base,x,cy,cz);
      cap.rotation.z=Math.PI/2;
      const ring=add(new THREE.TorusGeometry(r+.025,.075,8,24),frame,x,cy,cz);
      ring.rotation.y=Math.PI/2;
    }
    for(const x of [w*.28,w*.5,w*.72]) {
      const band=add(new THREE.TorusGeometry(r+.018,.045,6,24),steel,x,cy,cz);
      band.rotation.y=Math.PI/2;
    }
    for(const x of [.17,w-.17]) {
      const fitting=add(new THREE.CylinderGeometry(.15,.15,.34,12),steel,x,h-.18,cz);
      fitting.rotation.z=Math.PI/2;
    }
    if(s.factoryLine)for(const x of [.8,w-.8])
      add(new THREE.CylinderGeometry(.30,.30,.22,16),steel,x,4.07,cz-.25);
    const rotor=new THREE.Group();rotor.position.set(cx,cy,cz);
    rotor.name='candy-tempering-contents';group.add(rotor);
    const shaft=new THREE.Mesh(new THREE.CylinderGeometry(.14,.14,length-.25,12),steel);
    shaft.rotation.z=Math.PI/2;rotor.add(shaft);
    for(let i=0;i<12;i++) {
      const angle=i*Math.PI*.72,x=(i-5.5)*(length-.65)/12,
        sweet=new THREE.Mesh(new THREE.SphereGeometry(.20,10,8),[coral,cream,mint][i%3]);
      sweet.position.set(x,Math.cos(angle)*r*.62,Math.sin(angle)*r*.62);
      sweet.scale.set(1.25,.78,.78);rotor.add(sweet);
    }
    group.userData.update=time=>{rotor.rotation.x=time*.38;};
    group.name='candy-tempering-drum';return group;
  } else if(s.kind==='candyWallHandrail') {
    const ivory=material('#f0d9b6',.58),teal=material('#4f7d79',.58),
      alongX=w>=d,length=alongX?w:d,cx=w/2,cz=d/2;
    for(const [height,mat] of [[.48,teal],[.96,ivory]]) {
      const bar=add(new THREE.CylinderGeometry(.055,.055,length-.12,8),mat,cx,height,cz);
      if(alongX)bar.rotation.z=Math.PI/2;else bar.rotation.x=Math.PI/2;
    }
    const count=Math.max(2,Math.ceil(length/2.4));
    for(let i=0;i<=count;i++) {
      const at=.07+(length-.14)*i/count;
      box(alongX?.085:Math.min(.085,w-.02),.91,
        alongX?Math.min(.085,d-.02):.085,
        alongX?at:cx,.455,alongX?cz:at,ivory);
    }
    group.name='candy-wall-maintenance-rail';return group;
  } else if(s.kind==='candyControl') {
    const red=material('#b7473c',.48),cream=material('#e9d4b5',.35),teal=material('#3c7274',.48);
    const screen=new THREE.MeshStandardMaterial({color:'#80d8ce',emissive:'#2caaa9',
      emissiveIntensity:1.0,roughness:.2,metalness:.18});
    box(w-.02,h-.05,d-.02,w/2,(h-.05)/2,d/2,red);
    box(w-.09,.09,d-.09,w/2,h-.045,d/2,cream);
    box(w*.64,.028,d*.52,w/2,h-.018,d*.47,screen);
    for(let i=0;i<5;i++)box(.07,.02,.07,w*(.16+i*.17),h-.005,d*.83,i===4?red:teal);
    group.name='candy-mixing-control';return group;
  } else if(s.kind==='candyProcessPipe') {
    const syrup=s.line==='syrup',body=material(syrup?'#568884':'#c95c47',.48),
      collar=material('#f0d7b0',.68),dark=material('#71463c',.62);
    const alongX=s.axis==='x',length=alongX?w:d,cx=w/2,cz=d/2,y=h*.52;
    const run=add(new THREE.CylinderGeometry(.105,.105,Math.max(.1,length-.08),12),body,cx,y,cz);
    if(alongX)run.rotation.z=Math.PI/2;else run.rotation.x=Math.PI/2;
    for(const t of [.16,length/2,length-.16]) {
      const x=alongX?t:cx,z=alongX?cz:t;
      const ring=add(new THREE.TorusGeometry(.117,.026,6,12),collar,x,y,z);
      if(alongX)ring.rotation.y=Math.PI/2;
      box(alongX?.17:.06,.12,alongX?.06:.17,x,Math.min(h-.03,y+.19),z,dark);
    }
    group.name=syrup?'candy-mixer-feed':'candy-press-discharge';return group;
  } else if(s.kind==='candyHopper') {
    const body=material('#ce654d',.52),rim=material('#f0d7b0',.65),dark=material('#74453b',.64);
    const cx=w/2,cz=d/2;
    add(new THREE.CylinderGeometry(.20,.20,Math.max(.1,h-2.5),12),body,cx,(h+2.5)/2,cz);
    add(new THREE.CylinderGeometry(.34,.16,.66,12),body,cx,2.18,cz);
    add(new THREE.CylinderGeometry(.24,.24,.12,12),dark,cx,1.82,cz);
    for(const y of [2.52,h-.16])add(new THREE.TorusGeometry(.22,.035,6,12),rim,cx,y,cz).rotation.x=Math.PI/2;
    group.name='candy-press-output-hopper';return group;
  } else if(s.kind==='candyTransfer') {
    const frame=material('#a24b3e',.56),track=material('#527c78',.46),
      candy=material('#efd2a2',.2);
    // The floor channel curves the cooling belt's westward flow into the
    // eastward packing belt. It is low and decorative, so it cannot snag feet.
    box(w-.04,.07,d-.04,w/2,.035,d/2,track);
    for(const x of [.08,w-.08])box(.08,.16,d-.10,x,.10,d/2,frame);
    for(let i=0;i<5;i++)box(w*.34,.035,.16,w/2,.09,.28+i*(d-.56)/4,candy);
    group.name='candy-belt-turnaround';return group;
  } else if(s.kind==='candyWrapper') {
    const frame=material('#b74f42',.58),edge=material('#f1d9b5',.56),
      roller=material('#507e79',.67);
    if(s.axis==='y') {
      // This wrapper spans a north/south belt. The side posts and head match
      // the authored compound collider, including the overhead jump stop.
      for(const x of [.22,w-.22]) {
        box(.34,h-.25,.90,x,(h-.25)/2,d/2,frame);
        box(.34,.14,.90,x,.07,d/2,roller);
      }
      box(w,.25,.90,w/2,h-.125,d/2,edge);
      for(const z of [d/2-.22,d/2+.22]) {
        const spool=add(new THREE.CylinderGeometry(.15,.15,w-.6,16),roller,w/2,h-.42,z);
        spool.rotation.z=Math.PI/2;
      }
      box(w*.42,.07,.91,w/2,h-.12,d/2,frame);
      group.name='candy-wrapper';return group;
    }
    // The wrapper straddles the final belt; its open middle is deliberate.
    for(const z of [.14,d-.14]) {
      box(.18,h-.10,.18,w*.52,(h-.10)/2,z,frame);
      box(w*.64,.12,.20,w*.52,h-.09,z,edge);
    }
    box(w*.68,.18,d-.18,w*.52,h-.12,d/2,frame);
    for(const z of [d*.36,d*.64]) {
      const spool=add(new THREE.CylinderGeometry(.20,.20,w*.52,12),roller,w*.52,h*.69,z);
      spool.rotation.z=Math.PI/2;
      for(const x of [w*.25,w*.79])add(new THREE.TorusGeometry(.21,.035,6,12),edge,x,h*.69,z).rotation.y=Math.PI/2;
    }
    group.name='candy-wrapper';return group;
  } else if(s.kind==='candyDispatch') {
    const body=material('#945146',.48),shelf=material('#f0d7b0',.34),
      carton=material('#d47958',.18),band=material('#517c76',.48);
    // A single solid shipping rack matches its full authored collision box.
    box(w-.02,h-.02,d-.02,w/2,h/2,d/2,body);
    for(let tier=0;tier<3;tier++) {
      const y=.42+tier*.68;
      box(w-.10,.09,d-.10,w/2,y,d/2,shelf);
      for(let slot=0;slot<2;slot++) {
        const x=w*(slot+.5)/2;
        box(w*.38,.42,d*.58,x,y+.27,d*.52,carton);
        box(w*.07,.44,d*.60,x,y+.27,d*.52,band);
      }
    }
    group.name='candy-packed-dispatch';return group;
  } else if(s.kind==='candyCrate') {
    const red=material('#bf5d48',.39),cream=material('#e9d1ad',.31),teal=material('#4d7774',.44);
    box(w-.02,h-.04,d-.02,w/2,(h-.04)/2,d/2,red);
    box(w-.08,.07,d-.08,w/2,h-.035,d/2,cream);
    for(const x of [.12,w-.12])box(.11,h-.13,d-.09,x,h*.51,d/2,teal);
    for(const z of [.11,d-.11])box(w-.13,.08,.08,w/2,h*.47,z,cream);
    group.name='candy-wrapped-carton';return group;
  } else if(s.kind==='candyTrack') {
    const teal=material('#426f70',.35),red=material('#d34b3e',.3);
    for(const x of [w*.22,w*.78])box(.065,.025,d-.12,x,.045,d/2,teal);
    for(let z=.45;z<d-.3;z+=.58)box(w*.68,.015,.055,w/2,.052,z,red);
    group.name='candy-belt-floor-guides';return group;
  } else if(s.kind==='candyLight') {
    const red=material('#b84b3d',.47),cream=material('#f2dfbd',.22);
    const glow=new THREE.MeshBasicMaterial({color:'#fff1cc'});
    box(w-.02,h-.02,d-.02,w/2,h/2,d/2,red);
    box(w-.12,.065,d-.10,w/2,.08,d/2,cream);
    box(w-.22,.035,d-.19,w/2,.035,d/2,glow);
    for(let i=1,n=Math.max(2,Math.ceil(w/2));i<n;i++)
      box(.075,h-.05,d-.05,w*i/n,h/2,d/2,cream);
    group.name='candy-ceiling-light';return group;
  } else if(s.kind==='reactorCore') {
    const base=material('#33464b',0.82),shell=material('#718488',0.78),rib=material('#9cafaf',0.86);
    const energy=material(s.accent||'#65e6bd',0.22);energy.emissive.set(s.accent||'#65e6bd');energy.emissiveIntensity=2.1;
    const cx=w/2,cz=d/2,r=Math.min(w,d)*.34;
    add(new THREE.CylinderGeometry(r*1.22,r*1.32,.28,24),base,cx,.14,cz);
    add(new THREE.CylinderGeometry(r*.63,r*.78,h-.54,20),energy,cx,h/2,cz);
    for(const y of [.52,h*.34,h*.64,h-.34]) {
      add(new THREE.TorusGeometry(r*.92,.10,7,28),y===h*.34||y===h*.64?energy:rib,cx,y,cz).rotation.x=Math.PI/2;
    }
    for(let i=0;i<8;i++) {
      const a=i*Math.PI/4,x=cx+Math.cos(a)*r,z=cz+Math.sin(a)*r;
      beam([x,.24,z],[x,h-.30,z],.09,shell,8,.055);
      beam([x,h-.30,z],[cx+Math.cos(a)*r*.64,h-.10,cz+Math.sin(a)*r*.64],.07,rib,8,.045);
    }
    add(new THREE.CylinderGeometry(r*.76,r*.98,.30,24),shell,cx,h-.15,cz);
  } else if(s.kind==='consoleBank') {
    const body=material('#3b4d52',0.72),edge=material(s.accent||'#7fd5d6',0.65);
    const screen=material('#7de2d8',0.18);screen.emissive.set(s.accent||'#50bdb6');screen.emissiveIntensity=1.25;
    box(w,h*.62,d,w/2,h*.31,d/2,body);
    const top=box(w*.94,.14,d*.82,w/2,h*.68,d*.48,edge);top.rotation.x=-.18;
    const display=box(w*.74,.035,d*.42,w/2,h*.73,d*.40,screen,.012);display.rotation.x=-.18;
    for(let i=0;i<4;i++)box(w*.11,.025,d*.10,w*(.25+i*.16),h*.77,d*.66,i%2?screen:edge,.006);
    box(w*.92,.08,.10,w/2,h-.04,d*.13,edge,.018);
  } else if(s.kind==='ventStack') {
    const base=material('#35464b',0.82),shell=material('#687b80',0.8),edge=material(s.accent||'#e18b68',0.68);
    const cx=w/2,cz=d/2,r=Math.min(w,d)*.36;
    add(new THREE.CylinderGeometry(r*1.12,r*1.18,.24,18),base,cx,.12,cz);
    add(new THREE.CylinderGeometry(r*.92,r,h-.42,18),shell,cx,(h-.42)/2+.24,cz);
    for(const y of [.58,h*.52,h-.42])add(new THREE.TorusGeometry(r*.96,.07,6,20),edge,cx,y,cz).rotation.x=Math.PI/2;
    add(new THREE.CylinderGeometry(r*.88,r*.88,.16,18),base,cx,h-.18,cz);
    add(new THREE.CylinderGeometry(r*.62,r*.72,.08,18),edge,cx,h-.04,cz);
    for(let i=0;i<8;i++) {
      const a=i*Math.PI/4;
      beam([cx,h-.08,cz],[cx+Math.cos(a)*r*.72,h-.08,cz+Math.sin(a)*r*.72],.045,edge,6,.018);
    }
  } else if(s.kind==='airportCarpet') {
    const carpetColors={'gate-a':'#315a70','gate-b':'#3d6476','gate-c':'#2f5669',entry:'#526167'};
    const carpet=material(carpetColors[s.zone]||'#3b6276',.02),thread=material(s.zone==='entry'?'#899397':'#7c9aab',.01);
    // Collision remains exactly at floor height, but the visible pile sits
    // 18 mm above the terrazzo. Rendering the old carpet cap at y=0 made it
    // coplanar with the arena floor and produced severe z-fighting.
    const pile=.018;
    box(w,pile,d,w/2,h+pile/2,d/2,carpet);
    const alongX=w>=d,length=alongX?w:d;
    if(s.zone==='entry') {
      for(let at=.28;at<length;at+=.34)
        box(alongX?.018:w-.12,.006,alongX?d-.12:.018,alongX?at:w/2,h+pile+.003,alongX?d/2:at,thread);
    } else {
      // A restrained woven grid reads as fitted gate-area carpet instead of
      // one flat color swatch pasted across the entire concourse.
      for(let at=.45;at<length;at+=1.15)
        box(alongX?.025:w-.12,.006,alongX?d-.12:.025,alongX?at:w/2,h+pile+.003,alongX?d/2:at,thread);
      const cross=alongX?d:w;
      for(let at=.55;at<cross;at+=1.45)
        box(alongX?w-.12:.018,.006,alongX?.018:d-.12,alongX?w/2:at,h+pile+.004,alongX?at:d/2,thread);
    }
  } else if(s.kind==='airportAtrium') {
    const curb=material('#d8d5cc',.22),bed=material('#263f3a',.03),water=material('#4b8996',.08);
    const leaf=material('#47755c',.02),lightLeaf=material('#6b9a73',.01),stoneChip=material('#a9aaa2',.08);
    // The court sits a few centimetres above the shared floor so none of its
    // broad surfaces are coplanar. Glazed gameplay walls keep this decorative
    // garden inaccessible while preserving the hollow-terminal sightline.
    box(w,.025,d,w/2,h+.012,d/2,bed);
    box(w*.54,.018,d*.34,w/2,h+.030,d/2,water);
    for(const side of [-1,1]) {
      box(w*.86,.34,.34,w/2,h+.17,d/2+side*d*.37,curb);
      for(let i=0;i<9;i++) {
        const x=w*(.12+i*.095),z=d/2+side*d*.37;
        beam([x,h+.30,z],[x+(i%2?.10:-.08),h+.88+(i%3)*.13,z+side*.05],.035,leaf,7,.018);
        const crown=add(new THREE.SphereGeometry(.16+(i%3)*.025,9,6),i%2?lightLeaf:leaf,
          x+(i%2?.10:-.08),h+.92+(i%3)*.13,z+side*.05);
        crown.scale.set(1.45,.72,1.0);
      }
    }
    for(let i=0;i<7;i++) {
      const x=w*(.20+i*.10),z=d/2+(i%2?.38:-.38);
      add(new THREE.DodecahedronGeometry(.10+(i%3)*.025,0),stoneChip,x,h+.09,z);
    }
    const bridge=box(w*.20,.08,d*.40,w/2,h+.12,d/2,curb);bridge.name='terminal-atrium-bridge';
    group.name='terminal-central-atrium';
  } else if(s.kind==='airportMarketIsland') {
    const stone=material('#d8d4c8',.16),wood=material('#9a724c',.28),soil=material('#33443b',.03);
    const leaf=material('#3f7359',.02),lightLeaf=material('#6b9670',.02),metal=material('#64737a',.72);
    // One continuous plinth makes the capsule collider visually honest. Seats
    // and planting flank the central screen without filling the walking lanes.
    box(w,.28,d*.78,w/2,.14,d/2,stone,.14);
    for(const side of [-1,1]) {
      const z=d/2+side*d*.31;
      box(w*.72,.14,.52,w/2,.36,z,wood,.12);
      for(let x=w*.18;x<w*.83;x+=1.25)box(.055,.22,.46,x,.24,z,metal,.015);
    }
    for(const x of [w*.12,w*.88]) {
      add(new THREE.CylinderGeometry(d*.28,d*.31,.42,20),stone,x,.39,d/2);
      add(new THREE.CylinderGeometry(d*.245,d*.245,.08,20),soil,x,.64,d/2);
      for(let i=0;i<13;i++) {
        const a=i*2.4,reach=d*(.08+(i%4)*.025),stemH=.58+(i%5)*.13;
        beam([x,.62,d/2],[x+Math.cos(a)*reach,.62+stemH,d/2+Math.sin(a)*reach],.035,leaf,7,.02);
        const crown=add(new THREE.SphereGeometry(.14+(i%3)*.025,9,6),i%2?lightLeaf:leaf,
          x+Math.cos(a)*reach,.66+stemH,d/2+Math.sin(a)*reach);
        crown.scale.set(1.55,.62,1);
      }
    }
    group.name='terminal-market-island';
  } else if(s.kind==='airportMarketScreen') {
    const base=material('#67706b',.22),frame=material('#526a70',.58),panel=material('#376e73',.16);
    const inset=material('#7fa6a2',.28),leaf=material('#558467',.04);
    const light=new THREE.MeshStandardMaterial({color:'#d6f8e9',emissive:'#75dbba',emissiveIntensity:1.1,
      roughness:.35,metalness:.06,toneMapped:false});
    // The base descends to floor level through the existing market plinth.
    // Above it, one continuous planted acoustic screen is the island's clear
    // visual and physical sightline break, replacing three loose tables.
    const foundation=s.bottom||0;
    box(w,foundation+.08,d,w/2,-foundation/2+.04,d/2,base);
    box(w-.10,h-.08,d*.72,w/2,h/2+.02,d/2,panel);
    box(w,.12,d,w/2,h-.03,d/2,frame);
    const bays=6;
    for(let i=1;i<bays;i++)box(.045,h-.18,d*.84,w*i/bays,h/2+.02,d/2,frame);
    for(let i=0;i<bays;i++) {
      const cx=w*(i+.5)/bays;
      box(w/bays-.20,.20,.035,cx,.25,-.015,inset);
      box(w/bays-.20,.11,.035,cx,h-.29,-.015,light);
      for(let stem=0;stem<3;stem++) {
        const sx=cx+(stem-1)*(w/bays)*.19;
        beam([sx,.11,d+.02],[sx+(stem-1)*.045,.55+(i%2)*.10,d+.02],.026,leaf,6,.014);
      }
    }
    group.name='terminal-market-screen';
  } else if(s.kind==='airportShopRoof') {
    const colors={coffee:'#49382f',bakery:'#77504b',books:'#304f68',travel:'#34434d',
      restaurant:'#713f35',noodles:'#6c352f'};
    const shell=material(colors[s.shop]||'#46545d',.30);
    const light=new THREE.MeshStandardMaterial({color:'#fff2d8',emissive:'#ffd28a',emissiveIntensity:1.05,
      roughness:.3,metalness:.05,toneMapped:false});
    box(w,h,d,w/2,h/2,d/2,shell);
    for(const x of [w*.24,w*.5,w*.76])box(.28,.025,.12,x,-.012,d*.5,light,.012);
  } else if(s.kind==='airportShop') {
    const schemes={
      coffee:['#49382f','#d5a253','#fff0d1'],bakery:['#77504b','#e79175','#fff1dc'],
      books:['#304f68','#62a0bb','#e7f4ef'],travel:['#34434d','#d1a957','#eef8fa'],
      restaurant:['#713f35','#db7653','#ffe5b0'],
      noodles:['#6c352f','#d86d4e','#ffe0a2'],
    };
    const [bodyColor,accentColor,lightColor]=schemes[s.shop]||schemes.travel;
    const body=material(bodyColor,.28),accent=material(accentColor,.42),floor=material('#d9d2c4',.08);
    const signGlow=new THREE.MeshStandardMaterial({color:lightColor,emissive:accentColor,emissiveIntensity:1.25,
      roughness:.28,metalness:.08,toneMapped:false});
    const shopH=(s.shopHeight||3.15)-(s.bottom||0),floorY=h+.014;
    // Integrated terminal shops share the arena floor mesh. Drawing another
    // raised slab across the old perimeter made that obsolete boundary show
    // up as a hard line through every shop. Standalone shops can still opt in
    // to their own floor when used by another environment.
    if(!s.integratedFloor) {
      const shopFloor=box(w-.05,.028,d-.05,w/2,floorY,d/2,floor);
      shopFloor.name='terminal-shop-floor';
    }
    const horizontal=s.front==='north'||s.front==='south',positive=s.front==='south'||s.front==='east';
    const length=horizontal?w:d,fx=horizontal?w/2:(positive?w+.035:-.035),
      fz=horizontal?(positive?d+.035:-.035):d/2;
    const faceBox=(lengthSize,heightSize,depthSize,y,mat,radius=.025,offset=0)=>{
      const outward=positive?1:-1;
      return horizontal?
        box(lengthSize,heightSize,depthSize,fx,y,fz+outward*offset,mat,radius):
        box(depthSize,heightSize,lengthSize,fx+outward*offset,y,fz,mat,radius);
    };
    faceBox(length*.90,.54,.12,shopH-.50,accent,.05,.08);
    faceBox(length*.62,.11,.15,shopH-.50,signGlow,.018,.15);
    faceBox(length*.88,.13,.72,shopH-.93,body,.035,.34);
    // A full-width opening remains below the fascia. Slim edge columns frame
    // the recess but stay aligned with the authored side-wall colliders.
    for(const along of [-length*.46,length*.46]) {
      if(horizontal)box(.13,shopH-.90,.13,fx+along,(shopH-.90)/2,fz,accent,.028);
      else box(.13,shopH-.90,.13,fx,(shopH-.90)/2,fz+along,accent,.028);
    }
    for(let i=0;i<3;i++) {
      const along=-length*.27+i*length*.27;
      add(new THREE.CylinderGeometry(.10,.13,.035,12),signGlow,
        horizontal?fx+along:w*(.18+i*.32),shopH-.17,horizontal?d*(.38+i%2*.24):fz+along);
    }
    // A recessed feature wall and pendant pool give the shop interior depth
    // when viewed from the concourse. Everything is offset from the authored
    // collision walls, avoiding the coplanar flashing that plagued old maps.
    const backX=horizontal?w/2:(s.front==='west'?w-.10:.10);
    const backZ=horizontal?(s.front==='north'?d-.10:.10):d/2;
    const feature=horizontal?
      box(w*.62,1.12,.045,backX,1.45,backZ,body,.025):
      box(.045,1.12,d*.62,backX,1.45,backZ,body,.025);
    feature.name=`terminal-shop-feature-${s.shop}`;
    const towardFront=s.front==='north'||s.front==='west'?-1:1;
    const wallArt=(along,y,artW,artH,artMaterial)=>{
      return horizontal?
        box(artW,artH,.035,w/2+along,y,backZ+towardFront*.045,artMaterial,.018):
        box(.035,artH,artW,backX+towardFront*.045,y,d/2+along,artMaterial,.018);
    };
    const ink=material('#202b30',.45),paper=material('#f4e8cf',.08);
    if(s.shop==='coffee') {
      for(let i=0;i<3;i++) {
        wallArt((i-1)*length*.17,1.53,length*.13,.66,ink);
        for(let line=0;line<4;line++)wallArt((i-1)*length*.17,1.69-line*.12,length*.085,.018,line===0?accent:paper);
      }
    } else if(s.shop==='books') {
      const posterColors=[material('#d96555',.12),material('#e4b34f',.12),material('#57a0a9',.12),paper];
      for(let i=0;i<7;i++)wallArt((i-3)*length*.075,1.48,length*.052,.76,posterColors[i%posterColors.length]);
    } else if(s.shop==='restaurant') {
      for(let i=0;i<3;i++) {
        wallArt((i-1)*length*.18,1.50,length*.14,.72,ink);
        const plate=add(new THREE.TorusGeometry(.13,.025,6,16),i===1?signGlow:paper,
          horizontal?w/2+(i-1)*length*.18:backX+(towardFront*.07),1.5,
          horizontal?backZ+towardFront*.07:d/2+(i-1)*length*.18);
        if(!horizontal)plate.rotation.y=Math.PI/2;
      }
    } else if(s.shop==='travel') {
      wallArt(0,1.48,length*.52,.78,material('#d7e2db',.08));
      for(let i=0;i<5;i++) {
        const line=wallArt((i-2)*length*.075,1.50+(i%2)*.13,length*.12,.026,i%2?accent:ink);
        line.rotation[horizontal?'z':'x']=(i-2)*.12;
      }
      for(const along of [-length*.18,0,length*.19])wallArt(along,1.42,.07,.07,signGlow);
    }
    for(let i=0;i<3;i++) {
      const along=-length*.25+i*length*.25;
      const lampX=horizontal?fx+along:w*.48;
      const lampZ=horizontal?d*.48:fz+along;
      box(.025,.58,.025,lampX,shopH-.47,lampZ,accent,.006);
      const lamp=add(new THREE.CylinderGeometry(.18,.32,.20,12),signGlow,lampX,shopH-.82,lampZ);
      lamp.name='terminal-shop-pendant';
    }

    // Each tenant owns a distinct geometric mark rather than sharing the same
    // generic ring. The symbols are deliberately simple enough to remain crisp
    // at first-person distance without texture atlases or runtime text.
    const outward=positive?1:-1,iconAlong=-length*.27,iconY=shopH-.50;
    const placeIcon=(geometry,along,y=iconY,depth=.17)=>{
      const mesh=add(geometry,signGlow,horizontal?fx+along:fx+outward*depth,y,
        horizontal?fz+outward*depth:fz+along);
      if(!horizontal)mesh.rotation.y=Math.PI/2;
      return mesh;
    };
    if(s.shop==='coffee') {
      placeIcon(new THREE.TorusGeometry(.19,.055,7,18),iconAlong);
      placeIcon(new THREE.TorusGeometry(.095,.035,6,14),iconAlong+.20);
      for(const offset of [-.08,.08])placeIcon(new THREE.CapsuleGeometry(.018,.16,3,6),iconAlong+offset,iconY+.27);
    } else if(s.shop==='books') {
      for(let i=0;i<3;i++)placeIcon(new RoundedBoxGeometry(.42-i*.05,.075,.07,2,.018),iconAlong+(i-1)*.025,iconY+(i-1)*.12);
    } else if(s.shop==='bakery') {
      for(const offset of [-.16,0,.16])placeIcon(new THREE.TorusGeometry(.105,.038,6,14,Math.PI*1.3),iconAlong+offset,iconY+(offset===0?.07:0));
    } else if(s.shop==='travel') {
      placeIcon(new RoundedBoxGeometry(.42,.34,.07,3,.07),iconAlong);
      placeIcon(new THREE.TorusGeometry(.105,.026,6,14,Math.PI),iconAlong,iconY+.22);
    } else if(s.shop==='restaurant') {
      placeIcon(new THREE.TorusGeometry(.20,.035,7,20),iconAlong);
      for(const offset of [-.28,.28])placeIcon(new THREE.CapsuleGeometry(.018,.38,3,6),iconAlong+offset,iconY);
    } else {
      placeIcon(new THREE.CylinderGeometry(.22,.14,.15,16),iconAlong,iconY-.05);
      for(const offset of [-.07,.07]) {
        const stick=placeIcon(new THREE.CapsuleGeometry(.015,.46,3,6),iconAlong+offset,iconY+.18);
        stick.rotation.z=offset<0?-.15:.15;
      }
    }
    group.name=`terminal-shop-${s.shop}`;
  } else if(s.kind==='airportShopFixture') {
    const schemes={coffee:['#49382f','#d5a253'],bakery:['#77504b','#e79175'],books:['#304f68','#62a0bb'],
      travel:['#34434d','#d1a957'],restaurant:['#713f35','#db7653'],noodles:['#6c352f','#d86d4e']};
    const [bodyColor,accentColor]=schemes[s.shop]||schemes.travel;
    const body=material(bodyColor,.30),accent=material(accentColor,.38),pale=material('#eee7d9',.10),metal=material('#7d898e',.72);
    const glow=new THREE.MeshStandardMaterial({color:'#fff0cf',emissive:accentColor,emissiveIntensity:1.15,
      roughness:.25,metalness:.06,toneMapped:false});
    if(s.fixture==='table') {
      const r=Math.min(w,d)*.42;
      add(new THREE.CylinderGeometry(r,r,.12,18),pale,w/2,h-.08,d/2);
      add(new THREE.CylinderGeometry(.09,.15,h-.14,12),metal,w/2,(h-.14)/2,d/2);
      for(let i=0;i<3;i++) {
        const a=i*Math.PI*2/3,x=w/2+Math.cos(a)*r*1.55,z=d/2+Math.sin(a)*r*1.55;
        add(new THREE.CylinderGeometry(.13,.13,.08,12),accent,x,.48,z);
        box(.07,.44,.07,x,.22,z,metal);
      }
      if(s.shop==='coffee')for(const offset of [-.13,.13]) {
        const cup=add(new THREE.CylinderGeometry(.065,.055,.14,9),pale,w/2+offset,h+.04,d/2);
        cup.name='terminal-coffee-cup';
      }
      if(s.shop==='restaurant') {
        add(new THREE.CylinderGeometry(.15,.15,.025,16),pale,w/2,h+.005,d/2);
        for(const offset of [-.11,.11])add(new THREE.SphereGeometry(.045,8,5),accent,w/2+offset,h+.04,d/2);
        box(.035,.22,.035,w/2,h+.12,d/2,accent,.008);
        add(new THREE.SphereGeometry(.09,9,6),glow,w/2,h+.26,d/2).scale.set(1.4,.72,1);
      }
    } else if(s.fixture==='shelf') {
      box(w,h,d,w/2,h/2,d/2,body);
      for(const y of [.32,.72,1.12,1.52].filter(y=>y<h-.08)) {
        box(w-.10,.055,d+.06,w/2,y,d/2,accent);
        const books=Math.max(4,Math.floor(w/.28));
        for(let i=0;i<books;i++)box(Math.min(.15,w/books*.55),.23,.10,w*(i+.5)/books,y+.14,d*.22,
          i%3===0?accent:i%3===1?pale:material('#a85f4b',.12),.012);
      }
    } else if(s.fixture==='display'||s.fixture==='island') {
      box(w,h*.55,d,w/2,h*.275,d/2,body);
      box(w+.08,.10,d+.08,w/2,h*.58,d/2,accent);
      if(s.shop==='travel')for(let i=0;i<3;i++) {
        const x=w*(.22+i*.28);
        box(w*.18,h*.35,d*.55,x,h*.80,d/2,i%2?accent:pale,.07);
        box(.06,.14,.06,x,h*.99,d/2,metal);
      } else for(let i=0;i<5;i++)
        add(new THREE.SphereGeometry(.10+(i%2)*.03,10,7),i%2?accent:pale,w*(.16+i*.17),h*.72,d/2);
    } else {
      box(w,h-.10,d,w/2,(h-.10)/2,d/2,body);
      box(w+.06,.12,d+.06,w/2,h-.06,d/2,pale);
      const glass=new THREE.MeshPhysicalMaterial({color:'#c4e1e5',transparent:true,opacity:.34,roughness:.08,
        metalness:.05,depthWrite:false,side:THREE.DoubleSide});
      box(w*.84,.36,.035,w/2,h*.62,-.025,glass,.012);
      if(s.shop==='coffee') {
        box(w*.32,.42,d*.58,w*.55,h+.21,d/2,metal,.055);
        box(w*.24,.12,d*.46,w*.55,h+.47,d/2,accent,.025);
        for(const x of [w*.18,w*.34,w*.76]) {
          const cup=add(new THREE.CylinderGeometry(.10,.085,.22,10),pale,x,h+.13,d*.25);
          cup.name='terminal-coffee-cup';
        }
      } else if(s.shop==='restaurant') {
        for(let i=0;i<4;i++) {
          add(new THREE.CylinderGeometry(.14,.14,.025,16),pale,w*(.17+i*.22),h+.015,d*.28);
          add(new THREE.SphereGeometry(.055+(i%2)*.018,8,5),i%2?accent:glow,w*(.17+i*.22),h+.06,d*.28);
        }
        for(let i=0;i<3;i++)box(w*.22,.28,.035,w*(.2+i*.3),h+.54,d+.03,i===1?glow:accent,.025);
      } else if(s.shop==='bakery')for(let i=0;i<6;i++)
        add(new THREE.SphereGeometry(.11+(i%2)*.025,10,7),i%2?accent:pale,w*(.12+i*.15),h+.10,d*.26);
      else if(s.shop==='noodles')for(const x of [w*.25,w*.50,w*.75]) {
        add(new THREE.CylinderGeometry(.12,.16,.10,12),accent,x,h+.08,d*.28);
        beam([x,h+.13,d*.28],[x+.08,h+.32,d*.28],.018,metal,6,.009);
      }
    }
    group.name=`terminal-shop-fixture-${s.shop}-${s.fixture}`;
  } else if(s.kind==='airportDeck') {
    const fascia=material('#65727a',.68),slab=material('#e8e5dd',.18),carpet=material('#345e76',.02);
    box(w,h,d,w/2,h/2,d/2,slab);
    box(w-.05,.045,d-.05,w/2,h+.018,d/2,s.wing==='airline-lounge'?carpet:slab);
    const alongX=w>=d;
    for(const side of [.075,(alongX?d:w)-.075])box(alongX?w-.05:.13,.20,alongX?.13:d-.05,
      alongX?w/2:side,.03,alongX?side:d/2,fascia);
    for(let at=.65;at<(alongX?w:d)-.3;at+=1.35)
      box(alongX?.045:w-.18,.018,alongX?d-.18:.045,alongX?at:w/2,h+.05,alongX?d/2:at,fascia);
  } else if(s.kind==='airportCheckin') {
    const cabinet=material('#d6d5ce',.22),counter=material('#f6f4ee',.1),edge=material('#52616b',.72);
    const belt=material('#303a40',.84);
    const screen=new THREE.MeshStandardMaterial({color:'#a7d7e8',emissive:'#2c789d',emissiveIntensity:.8,
      roughness:.24,metalness:.16,toneMapped:false});
    // A continuous recessed plinth preserves the exact collider footprint;
    // individual desks above it stop a long check-in island from reading as
    // one crude rectangular obstacle.
    box(w,.24,d,w/2,.12,d/2,edge,.035);
    box(w-.25,.10,.16,w/2,.29,d+.04,edge,.025);
    const stations=Math.max(2,Math.floor(w/2.2));
    for(let i=0;i<stations;i++) {
      const bay=w/stations,x=w*(i+.5)/stations,bayWidth=bay-.16;
      box(bayWidth,h-.38,d*.82,x,(h-.38)/2+.24,d*.48,cabinet,.055);
      box(bayWidth+.03,.14,d*.86,x,h-.12,d*.48,counter,.035);
      box(bayWidth*.54,.055,d*.32,x,h-.015,d*.70,belt,.012);
      for(let roll=-1;roll<=1;roll++)box(bayWidth*.12,.018,d*.28,x+roll*bayWidth*.15,h+.02,d*.70,edge,.006);
      box(.08,.52,.08,x,h+.24,d*.28,edge,.018);
      const display=box(.62,.40,.055,x,h+.5,d*.28,screen,.035);display.rotation.x=-.12;
      box(Math.max(.45,bayWidth-.14),.035,d*.25,x,h+.04,d*.24,edge,.008);
    }
  } else if(s.kind==='airportScanner') {
    const shell=material('#d9dde0',.52),edge=material('#596872',.72),belt=material('#2f3b43',.8);
    const scan=new THREE.MeshStandardMaterial({color:'#a9e9fb',emissive:'#3ca5ca',emissiveIntensity:1.35,
      roughness:.2,metalness:.15,transparent:true,opacity:.38,depthWrite:false,
      side:THREE.DoubleSide,toneMapped:false});
    const archX=w*.30,archW=w*.50;
    box(archW*.18,h,d*.72,archX-archW*.40,h/2,d/2,shell);
    box(archW*.18,h,d*.72,archX+archW*.40,h/2,d/2,shell);
    box(archW,h*.07,d*.72,archX,h*.965,d/2,shell);
    box(archW*.62,h*.60,.035,archX,h*.50,d*.12,scan,.015);
    box(w*.38,.58,d*.62,w*.80,.29,d/2,edge);
    box(w*.38,.09,d*.52,w*.80,.61,d/2,belt,.018);
    for(const x of [w*.62,w*.98])box(.10,.58,.10,x,.29,d/2,edge);
  } else if(s.kind==='airportFlightBoard') {
    const frame=material('#4b5962',.74),screen=material('#17242d',.78),white=material('#dbe8ed',.18);
    const cyan=new THREE.MeshStandardMaterial({color:'#8dddf1',emissive:'#3898bb',emissiveIntensity:1.1,
      roughness:.24,metalness:.18,toneMapped:false});
    if(s.wallMounted) {
      const panelH=s.displayHeight||2,panelBottom=s.mountBottom||2.6,depth=.12;
      box(w,panelH,depth,w/2,panelBottom+panelH/2,depth/2,frame,.045);
      box(w-.12,panelH-.14,.035,w/2,panelBottom+panelH/2,-.012,screen,.018);
      for(let row=0;row<7;row++) {
        const y=panelBottom+.28+row*(panelH-.52)/6;
        box(w*.16,.035,.018,w*.18,y,-.035,row%3===0?cyan:white,.005);
        box(w*.43,.026,.018,w*.56,y,-.035,white,.005);
        box(w*.13,.028,.018,w*.86,y,-.035,row%2?cyan:white,.005);
      }
      group.name='terminal-wall-flight-board';
    } else {
      box(w,h,d,w/2,h/2,d/2,frame);
      box(w+.04,h*.66,d*.58,w/2,h*.57,-.02,screen,.035);
      for(let row=0;row<7;row++) {
        const y=h*.32+row*h*.072;
        box(w*.18,.035,.02,w*.2,y,-.06,row%3===0?cyan:white,.005);
        box(w*.42,.026,.02,w*.57,y,-.06,white,.005);
        box(w*.13,.028,.02,w*.85,y,-.06,row%2?cyan:white,.005);
      }
    }
  } else if(s.kind==='airportSeats') {
    const frame=material('#59666e',.76),seat=material(s.bottom?'#55788a':'#496d80',.15),pad=material('#8da4ad',.08);
    const alongX=w>=d,length=alongX?w:d,count=Math.max(2,Math.floor(length/.85));
    for(let i=0;i<count;i++) {
      const at=length*(i+.5)/count,x=alongX?at:w/2,z=alongX?d/2:at;
      box(alongX?length/count-.07:d*.48,.12,alongX?d*.48:length/count-.07,x,h*.46,z,seat,.045);
      const back=box(alongX?length/count-.08:.11,.48,alongX?.11:length/count-.08,
        alongX?x:d*.23,h*.68,alongX?d*.24:z,seat,.04);back.rotation[alongX?'x':'z']=-.12;
      box(alongX?length/count-.16:d*.35,.035,alongX?d*.34:length/count-.16,x,h*.53,z,pad,.012);
    }
    box(alongX?length-.15:.10,.10,alongX?.10:length-.15,w/2,h*.34,d/2,frame,.025);
    for(let at=.3;at<length;at+=1.4)box(.09,h*.40,.09,alongX?at:w/2,h*.2,alongX?d/2:at,frame,.018);
  } else if(s.kind==='airportGateDesk') {
    const body=material('#d7d8d3',.28),top=material('#f5f2e9',.12),edge=material('#4e626f',.72);
    const screen=new THREE.MeshStandardMaterial({color:'#a7deee',emissive:'#397c9b',emissiveIntensity:.75,
      roughness:.24,metalness:.15,toneMapped:false});
    box(w,h-.14,d,w/2,(h-.14)/2,d/2,body);
    box(w,.14,d,w/2,h-.07,d/2,top);
    box(w*.7,.10,.05,w/2,h*.34,-.025,edge,.012);
    for(const x of [w*.28,w*.72]) {
      box(.055,.32,.055,x,h+.14,d*.52,edge,.012);
      const monitor=box(.48,.3,.04,x,h+.34,d*.52,screen,.025);monitor.rotation.x=-.12;
    }
  } else if(s.kind==='airportPlanter') {
    const pot=material('#d7d2c7',.18),soil=material('#453a2e',.01),leaf=material('#4d755d',.01),light=material('#6d9474',.01);
    const cx=w/2,cz=d/2,r=Math.min(w,d)*.42;
    add(new THREE.CylinderGeometry(r*.82,r,h*.48,20),pot,cx,h*.24,cz);
    add(new THREE.CylinderGeometry(r*.77,r*.77,.08,20),soil,cx,h*.5,cz);
    for(let i=0;i<11;i++) {
      const a=i*2.4,stemH=h*(.42+(i%4)*.08),radius=.10+(i%3)*.025;
      const stem=beam([cx,h*.48,cz],[cx+Math.cos(a)*r*.55,h*.48+stemH,cz+Math.sin(a)*r*.55],.035,leaf,7,.02);
      const crown=add(new THREE.SphereGeometry(radius,9,6),i%2?light:leaf,
        cx+Math.cos(a)*r*.58,h*.5+stemH,cz+Math.sin(a)*r*.58);crown.scale.set(1.8,.55,1);
    }
  } else if(s.kind==='airportBaggage') {
    const frame=material('#53616a',.82),belt=material('#252f35',.88),roller=material('#9aa4a8',.68);
    const alongX=w>=d,length=alongX?w:d;
    box(w,.20,d,w/2,.10,d/2,frame);
    box(w-.14,.11,d-.14,w/2,h-.12,d/2,belt,.025);
    const count=Math.max(5,Math.floor(length/.52));
    for(let i=0;i<count;i++) {
      const at=length*(i+.5)/count;
      const roll=add(new THREE.CylinderGeometry(.065,.065,(alongX?d:w)-.18,9),roller,
        alongX?at:w/2,h-.04,alongX?d/2:at);
      roll.name='terminal-baggage-roller';
      if(alongX)roll.rotation.x=Math.PI/2;else roll.rotation.z=Math.PI/2;
    }
    for(const side of [.07,(alongX?d:w)-.07])box(alongX?w:.12,.18,alongX?.12:d,
      alongX?w/2:side,h-.09,alongX?side:d/2,frame,.025);
    // A few restrained bags make the belt read immediately without clutter.
    for(let i=0;i<3;i++) {
      const bag=box(.48,.32,.34,w*(.24+i*.24),h+.15,d*(.38+(i%2)*.24),
        i%2?material('#99584b',.65):material('#455d78',.65),.07);
      bag.name='terminal-baggage-case';
    }
    group.name='terminal-baggage-belt';
  } else if(s.kind==='airportLuggageCart') {
    const frame=material('#6b777d',.78),bagA=material('#334a61',.72),bagB=material('#a2634f',.75);
    box(w,.12,d,w/2,.28,d/2,frame,.025);
    for(const x of [.16,w-.16])for(const z of [.14,d-.14])
      add(new THREE.CylinderGeometry(.10,.10,.08,10),dark,x,.10,z).rotation.z=Math.PI/2;
    box(.08,h*.75,.08,.12,h*.55,d*.18,frame,.018);box(.08,h*.75,.08,.12,h*.55,d*.82,frame,.018);
    box(.08,.08,d*.64,.12,h*.91,d/2,frame,.018);
    for(let i=0;i<3;i++)box(w*.22,h*.42,d*.55,w*(.42+i*.21),h*.48,d/2,i%2?bagA:bagB,.075);
  } else if(s.kind==='airportKiosk') {
    const shell=material('#e3e1da',.28),edge=material('#5b6870',.72);
    const screen=new THREE.MeshStandardMaterial({color:'#a4dff0',emissive:'#347f9e',emissiveIntensity:1.0,
      roughness:.22,metalness:.15,toneMapped:false});
    const cx=w/2,cz=d/2,r=Math.min(w,d)*.33;
    add(new THREE.CylinderGeometry(r*.9,r,h*.18,18),edge,cx,h*.09,cz);
    add(new THREE.CylinderGeometry(r*.72,r*.82,h*.58,18),shell,cx,h*.43,cz);
    const display=box(w*.52,h*.30,.045,cx,h*.72,-.025,screen,.045);display.rotation.x=-.18;
    box(w*.42,.07,d*.22,cx,h*.88,d*.27,edge,.018);
  } else if(s.kind==='orbitalTunnelRoof') {
    const ceramic=material('#e6ebef',.48),frame=material('#6d7984',.82),inner=material('#323b45',.68);
    const light=new THREE.MeshStandardMaterial({color:'#b9f7ff',emissive:'#48ddeb',emissiveIntensity:2.4,
      roughness:.2,metalness:.25,toneMapped:false});
    box(w,h,d,w/2,h/2,d/2,ceramic);
    box(w-.12,.055,d-.12,w/2,-.015,d/2,inner);
    const alongX=w>=d,length=alongX?w:d,count=Math.max(4,Math.ceil(length/1.7));
    for(let i=0;i<=count;i++) {
      const at=length*i/count;
      box(alongX?.08:w-.06,.13,alongX?d-.06:.08,alongX?at:w/2,h-.02,alongX?d/2:at,frame);
    }
    for(const side of [.18,(alongX?d:w)-.18])
      box(alongX?w-.28:.055,.035,alongX?.055:d-.28,
        alongX?w/2:side,-.055,alongX?side:d/2,light);
  } else if(s.kind==='orbitalDeck') {
    const shell=material('#dbe1e6',.58),edge=material('#66727e',.84),surface=material('#f1f4f6',.42);
    const light=new THREE.MeshStandardMaterial({color:'#9bf5ff',emissive:'#42d9e8',emissiveIntensity:1.9,
      roughness:.2,metalness:.22,toneMapped:false});
    box(w,h-.055,d,w/2,(h-.055)/2,d/2,shell);
    box(w-.07,.055,d-.07,w/2,h-.027,d/2,surface);
    const alongX=w>=d,length=alongX?w:d;
    for(let at=.55;at<length-.2;at+=1.15)
      box(alongX?.035:w-.14,.02,alongX?d-.14:.035,alongX?at:w/2,h+.012,alongX?d/2:at,edge);
    for(const side of [.11,(alongX?d:w)-.11])
      box(alongX?w-.08:.10,.17,alongX?.10:d-.08,
        alongX?w/2:side,-.05,alongX?side:d/2,edge);
    box(alongX?w*.46:.045,.026,alongX?.045:d*.46,w/2,h+.022,d/2,light);
  } else if(s.kind==='orbitalCore') {
    const base=material('#58636e',.84),shell=material('#e4e9ed',.62),ring=material('#8a969f',.86);
    const energy=new THREE.MeshStandardMaterial({color:'#abf7ff',emissive:'#48ddec',emissiveIntensity:2.8,
      roughness:.15,metalness:.16,toneMapped:false});
    const cx=w/2,cz=d/2,r=Math.min(w,d)*.34;
    add(new THREE.CylinderGeometry(r*1.16,r*1.24,.28,24),base,cx,.14,cz);
    add(new THREE.CylinderGeometry(r*.67,r*.75,h-.52,24),energy,cx,h/2,cz);
    for(let i=0;i<6;i++) {
      const a=i*Math.PI/3,x=cx+Math.cos(a)*r,z=cz+Math.sin(a)*r;
      beam([x,.25,z],[x,h-.3,z],.085,shell,9,.055);
    }
    for(const y of [.48,h*.52,h-.32])add(new THREE.TorusGeometry(r*.98,.07,7,28),y===h*.52?energy:ring,cx,y,cz).rotation.x=Math.PI/2;
    add(new THREE.CylinderGeometry(r*.84,r*1.02,.26,24),shell,cx,h-.13,cz);
  } else if(s.kind==='orbitalPod') {
    const shell=material('#e3e8ec',.58),edge=material('#687581',.82),joint=material('#aab4bc',.7);
    const glass=new THREE.MeshPhysicalMaterial({color:'#7696ad',transparent:true,opacity:.56,roughness:.1,
      metalness:.18,depthWrite:false});
    box(w,h-.18,d,w/2,(h-.18)/2,d/2,shell);
    box(w-.16,.16,d-.16,w/2,h-.08,d/2,joint);
    const alongX=w>=d;
    for(const side of [-1,1])box(alongX?w*.46:.028,h*.42,alongX?.028:d*.46,
      alongX?w/2:w/2+side*(w/2+.018),h*.56,alongX?d/2+side*(d/2+.018):d/2,glass,.025);
    for(let at=.42;at<(alongX?w:d)-.2;at+=.8)box(alongX?.06:w-.1,h-.35,alongX?d-.1:.06,
      alongX?at:w/2,(h-.35)/2,alongX?d/2:at,edge);
  } else if(s.kind==='orbitalAntenna') {
    const base=material('#68737d',.86),shell=material('#e3e8ec',.62),dish=material('#cfd7dd',.74);
    const signal=new THREE.MeshStandardMaterial({color:'#a7f5ff',emissive:'#3bd7e9',emissiveIntensity:2.2,
      roughness:.18,metalness:.2,toneMapped:false});
    const cx=w/2,cz=d/2,r=Math.min(w,d)*.34;
    add(new THREE.CylinderGeometry(r*1.15,r*1.25,.3,20),base,cx,.15,cz);
    add(new THREE.CylinderGeometry(r*.36,r*.48,h*.55,16),shell,cx,h*.31,cz);
    const bowl=add(new THREE.SphereGeometry(r,24,10,0,Math.PI*2,0,Math.PI*.36),dish,cx,h*.72,cz);
    bowl.scale.y=.34;bowl.rotation.z=-.5;
    beam([cx,h*.7,cz],[cx+r*.52,h*.92,cz],.055,base,9,.035);
    add(new THREE.SphereGeometry(.11,12,8),signal,cx+r*.58,h*.95,cz);
    add(new THREE.TorusGeometry(r*.82,.055,7,28),signal,cx,h*.72,cz).rotation.x=Math.PI/2;
  } else if(s.kind==='orbitalSupport') {
    const spine=material('#596570',.86),shell=material('#dce2e7',.6),joint=material('#8b97a1',.78);
    box(w,h,d,w/2,h/2,d/2,spine);
    box(w+.035,.24,d+.035,w/2,.12,d/2,joint);
    box(w+.035,.24,d+.035,w/2,h-.12,d/2,joint);
    for(const side of [-1,1])box(.055,h-.5,d*.42,w/2+side*(w/2+.018),h/2,d/2,shell,.015);
    for(let y=.55;y<h-.35;y+=.82)box(w+.025,.075,d+.025,w/2,y,d/2,joint,.015);
  } else if(s.kind==='orbitalCrate') {
    const shell=material('#cbd3d9',.7),edge=material('#66727e',.86);
    const light=new THREE.MeshStandardMaterial({color:'#adf7ff',emissive:'#45dbe9',emissiveIntensity:1.8,
      roughness:.22,metalness:.2,toneMapped:false});
    box(w,h,d,w/2,h/2,d/2,shell);
    for(const x of [.11,w-.11])for(const z of [.11,d-.11])box(.16,h-.08,.16,x,h/2,z,edge);
    box(w*.56,.035,.025,w/2,h*.68,-.018,light,.008);
    box(w*.35,.04,d*.36,w*.66,h+.018,d*.52,edge,.01);
  } else if(s.kind==='towerColumn') {
    const shell=material('#415763',.7),edge=material('#cfdbd9',.54),accent=material('#d2a15b',.55);
    box(w-.015,h,d-.015,w/2,h/2,d/2,shell);
    for(let y=2.8;y<h-.4;y+=3.1)box(w-.025,.10,d-.025,w/2,y,d/2,edge);
    for(const x of [.12,w-.12])for(const z of [.12,d-.12])
      box(.12,h-.24,.12,x,h/2,z,edge);
    for(const z of [.11,d-.11])box(w*.45,.035,.025,w/2,h*.72,z,accent);
    group.name='tower-structural-column';return group;
  } else if(s.kind==='towerCore') {
    const shell=material('#30444f',.77),alloy=material('#7d949b',.68),
      pale=material('#dce5e0',.48),accent=material('#d4a25b',.56);
    const energy=new THREE.MeshStandardMaterial({color:'#8fdae4',emissive:'#59c9db',
      emissiveIntensity:1.8,metalness:.25,roughness:.27,toneMapped:false});
    const cx=w/2,cz=d/2,r=Math.min(w,d)*.39;
    const cylinder=(radiusTop,radiusBottom,height,y,mat,sides=12)=>
      add(new THREE.CylinderGeometry(radiusTop,radiusBottom,height,sides),mat,cx,y,cz);
    cylinder(r,r,.48,.24,shell);
    cylinder(r*.8,r*.9,h-.9,h/2+.05,alloy);
    cylinder(r*.73,r*.73,h-.82,h/2+.06,shell);
    cylinder(r*.67,r*.67,h*.53,h*.55,energy,16);
    cylinder(r*.93,r*.93,.32,h-.16,pale);
    for(const y of [1.2,h*.27,h*.76,h-.72]) {
      cylinder(r*.9,r*.9,.15,y,accent);
    }
    for(let i=0;i<8;i++) {
      const a=i*Math.PI/4,x=cx+Math.cos(a)*r*.83,z=cz+Math.sin(a)*r*.83;
      const spine=box(.14,h-.9,.14,x,h/2,z,pale);
      spine.rotation.y=-a;
    }
    const ring=add(new THREE.TorusGeometry(r*.65,.06,8,32),accent,cx,h*.58,cz);
    ring.rotation.x=Math.PI/2;
    group.userData.update=time=>{
      ring.rotation.z=time*.28;
      energy.emissiveIntensity=1.5+.38*Math.sin(time*1.7);
    };
    group.name='tower-power-core';return group;
  } else if(s.kind==='towerConsole'||s.kind==='towerPowerBank') {
    const console=s.kind==='towerConsole',shell=material('#3c505a',.68),
      face=material('#82999c',.58),edge=material('#d4dfd9',.48),accent=material('#d3a15f',.55);
    const display=new THREE.MeshStandardMaterial({color:'#6bb7c1',emissive:'#3e9dab',
      emissiveIntensity:.95,metalness:.18,roughness:.3});
    box(w-.02,h-.05,d-.02,w/2,(h-.05)/2,d/2,shell);
    box(w-.08,.055,d-.08,w/2,h-.027,d/2,edge);
    if(console) {
      box(w*.57,.026,d*.48,w/2,h+.014,d*.52,display);
      for(const x of [w*.13,w*.87])box(.055,h*.72,.055,x,h*.45,d*.5,accent);
      box(w*.48,.045,.025,w/2,h*.48,.035,face);
    } else {
      for(let i=0,n=Math.max(2,Math.ceil(w/1.1));i<n;i++) {
        const x=w*(i+.5)/n;
        box(.07,h*.66,.035,x,h*.52,.045,face);
        box(.08,.07,.04,x,h*.24,.02,accent);
      }
      box(w*.6,.025,d*.36,w/2,h+.014,d*.52,accent);
    }
    group.name=console?'tower-command-console':'tower-power-bank';return group;
  } else if(s.kind==='towerCeilingTruss') {
    const steel=material('#50646d',.7),pale=material('#aabec0',.5),accent=material('#d5a15a',.55);
    box(w,.22,d,w/2,h-.11,d/2,steel);
    for(let i=0,n=Math.max(2,Math.ceil(w/3.1));i<=n;i++) {
      const x=.10+(w-.20)*i/n;
      box(.12,h-.26,d-.06,x,(h-.26)/2,d/2,pale);
      box(.14,.07,d-.06,x,.18,d/2,accent);
    }
    group.name='tower-ceiling-truss';return group;
  } else if(s.kind==='catwalk') {
    if(s.style==='tower') {
      const frame=material('#697f82',.72),deck=material('#d5e2dc',.48),
        pale=material('#f0eee4',.4),amber=material('#ddb16e',.55);
      box(w-.02,h,d-.02,w/2,h/2,d/2,frame);
      box(w-.08,.025,d-.08,w/2,h+.013,d/2,deck);
      const alongX=w>=d,length=alongX?w:d,count=Math.max(2,Math.ceil(length/2.7));
      for(let i=1;i<count;i++) {
        const at=length*i/count;
        box(alongX?.022:w-.24,.012,alongX?d-.24:.022,
          alongX?at:w/2,h+.029,alongX?d/2:at,frame);
      }
      if(alongX)for(const z of [.11,d-.11]) {
        box(w-.08,.055,.085,w/2,h+.052,z,pale);
        box(w-.22,.018,.018,w/2,h+.088,z,amber);
      } else for(const x of [.11,w-.11]) {
        box(.085,.055,d-.08,x,h+.052,d/2,pale);
        box(.018,.018,d-.22,x,h+.088,d/2,amber);
      }
      group.name=s.bridge?'tower-bridge':'tower-gallery';return group;
    }
    if(s.style==='foundry') {
      const frame=material('#586b6e',.7),deck=material('#b4c0b8',.54),edge=material('#d5ad7d',.56);
      box(w,h,d,w/2,h/2,d/2,frame);
      // One continuous deck plate replaces the repeated orange grate bars.
      // The plate is inset, so its edge cannot flicker against the frame.
      box(w-.06,.028,d-.06,w/2,h+.014,d/2,deck);
      const alongX=w>=d;
      if(alongX)for(const z of [.10,d-.10])
        box(w-.08,.06,.08,w/2,h+.045,z,edge);
      else for(const x of [.10,w-.10])
        box(.08,.06,d-.08,x,h+.045,d/2,edge);
      group.name=s.bridge?'foundry-gantry':'foundry-control-deck';return group;
    }
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
  } else if(s.kind==='foundryEnclosure') {
    const lower=material('#81978a',.48),upper=material('#bdcbb6',.48),
      frame=material('#ddb784',.58),glass=new THREE.MeshPhysicalMaterial({
        color:'#c3e0d3',metalness:.12,roughness:.18,transparent:true,opacity:.46,
        depthWrite:false,side:THREE.DoubleSide});
    const alongX=w>=d,length=alongX?w:d;
    box(w-.035,2.5,d-.035,w/2,1.25,d/2,lower);
    box(w-.035,1.9,d-.035,w/2,3.45,d/2,glass);
    box(w-.035,h-4.4,d-.035,w/2,(h+4.4)/2,d/2,upper);
    for(const y of [2.5,4.4])box(w,.075,d,w/2,y,d/2,frame);
    for(let i=1,n=Math.max(2,Math.ceil(length/3.3));i<n;i++) {
      const at=length*i/n;
      box(alongX?.07:w,1.9,alongX?d:.07,alongX?at:w/2,3.45,alongX?d/2:at,frame);
    }
    group.name='foundry-glazed-furnace-wall';
  } else if(s.kind==='foundryPillar') {
    const steel=material('#a0b3a4',.48),foot=material('#718a7e',.58),
      cap=material('#dfc596',.45),cx=w/2,cz=d/2,r=Math.min(w,d)*.48;
    add(new THREE.CylinderGeometry(r*.88,r*.94,h-.34,16),steel,cx,h/2,cz);
    add(new THREE.CylinderGeometry(r,r,.17,16),foot,cx,.085,cz);
    add(new THREE.CylinderGeometry(r,r,.17,16),cap,cx,h-.085,cz);
    group.name='foundry-structural-pillar';
  } else if(s.kind==='foundryBulkhead') {
    const shell=material('#aabbab',.38),base=material('#758d80',.52),
      cap=material('#dfbf8f',.48),alongX=w>=d;
    // A smooth uninterrupted body with just a flush kick and cap. Earlier
    // panel/rib blocks made every corridor feel busy and protruded visually.
    box(alongX?w-.025:w-.10,h-.10,alongX?d-.10:d-.025,
      w/2,(h-.10)/2,d/2,shell);
    box(w-.025,.16,d-.025,
      w/2,.10,d/2,base);
    box(w-.025,.10,d-.025,
      w/2,h-.05,d/2,cap);
    group.name='foundry-service-bulkhead';
  } else if(s.kind==='foundryPortal') {
    const steel=material('#6d847c',.58),rim=material('#d4b489',.55),
      signal=new THREE.MeshStandardMaterial({color:'#ffca79',emissive:'#f18b35',
        emissiveIntensity:1.9,roughness:.3,metalness:.12,toneMapped:false});
    const alongX=w>=d;
    box(alongX?w-.016:w-.10,h-.16,alongX?d-.10:d-.016,
      w/2,(h-.16)/2,d/2,steel);
    box(alongX?w-.06:.09,.18,alongX?.09:d-.06,w/2,h-.09,d/2,rim);
    box(alongX?w*.42:.035,.08,alongX?.035:d*.42,
      alongX?w/2:.03,.24,alongX?.03:d/2,signal);
    group.name='foundry-lit-door-header';
  } else if(s.kind==='foundryServiceTrunk') {
    const casing=material('#81988d',.58),tube=material('#c49e77',.62),
      clamp=material('#bcc7b9',.58);
    box(w-.03,.13,d-.03,w/2,h-.07,d/2,casing);
    for(const z of [d*.33,d*.67]) {
      const pipe=add(new THREE.CylinderGeometry(.12,.12,w-.10,12),tube,w/2,h*.54,z);
      pipe.rotation.z=Math.PI/2;
    }
    for(let x=.45;x<w-.25;x+=3) {
      box(.10,h-.22,d-.08,x,h/2,d/2,clamp);
      box(.22,.08,d-.03,x,.13,d/2,casing);
    }
    group.name='foundry-overhead-service-trunk';
  } else if(s.kind==='foundryValveStation') {
    const shell=material('#53686a',.7),rim=material('#c4a276',.6),
      wheel=material('#aa5142',.48),dial=material('#efe5c9',.22);
    const alongX=w>=d,cx=w/2,cz=d/2;
    box(alongX?w-.03:w-.48,h-.03,alongX?d-.48:d-.03,cx,h/2,cz,shell);
    box(alongX?w-.14:.08,.12,alongX?.08:d-.14,cx,h*.75,alongX?.035:cz,rim);
    for(const offset of [-.26,.26]) {
      const x=alongX?cx+offset:Math.max(.12,w*.17),z=alongX?Math.max(.12,d*.17):cz+offset;
      const gauge=add(new THREE.CylinderGeometry(.12,.12,.04,14),dial,x,h*.78,z);
      if(alongX)gauge.rotation.x=Math.PI/2;else gauge.rotation.z=Math.PI/2;
    }
    const ring=add(new THREE.TorusGeometry(.33,.055,8,20),wheel,
      alongX?cx:.12,h*.43,alongX?.12:cz);
    if(!alongX)ring.rotation.y=Math.PI/2;
    for(let i=0;i<4;i++) {
      const a=i*Math.PI/2;
      const spoke=add(new THREE.BoxGeometry(.045,.52,.045),wheel,
        alongX?cx:.12,h*.43,alongX?.12:cz);
      if(alongX)spoke.rotation.z=a;
      else spoke.rotation.x=a;
    }
    group.name='foundry-coolant-valve-station';
  } else if(s.kind==='foundryLantern') {
    const bracket=material('#344648',.74),rim=material('#c89b60',.58),
      glow=new THREE.MeshStandardMaterial({color:'#ffca82',emissive:'#ff8d37',
        emissiveIntensity:2.7,roughness:.28,metalness:.08,toneMapped:false});
    box(w*.44,.18,d*.85,w/2,.23,d/2,bracket);
    box(w*.84,.11,d*.82,w/2,.5,d/2,rim);
    box(w*.62,Math.max(.24,h-.75),d*.60,w/2,h/2,d/2,glow);
    box(w*.88,.13,d*.82,w/2,h-.22,d/2,rim);
    for(const x of [w*.12,w*.88])box(.07,Math.max(.24,h-.48),.07,x,h/2,d/2,bracket);
    group.name='foundry-wall-lantern';
  } else if(s.kind==='foundryTurbine') {
    const shell=material('#53686b',.72),rim=material('#c5ad86',.62),
      darkSteel=material('#28383c',.8),rotorMat=material('#d9e4dc',.68);
    const radius=Math.min(w,d)*.34,cx=w/2,cz=d/2;
    add(new THREE.CylinderGeometry(radius*1.03,radius*1.08,.26,20),darkSteel,cx,.13,cz);
    add(new THREE.CylinderGeometry(radius*.82,radius*.87,h-.47,20),shell,cx,h/2,cz);
    for(const y of [.4,h-.38])
      add(new THREE.TorusGeometry(radius*.89,.065,7,24),rim,cx,y,cz).rotation.x=Math.PI/2;
    const rotor=new THREE.Group();rotor.position.set(cx,h-.16,cz);group.add(rotor);
    for(let i=0;i<6;i++) {
      const blade=new THREE.Mesh(new THREE.BoxGeometry(radius*.72,.045,.13),rotorMat);
      blade.position.x=radius*.35;
      const pivot=new THREE.Group();pivot.rotation.y=i*Math.PI/3;pivot.add(blade);rotor.add(pivot);
    }
    const hub=new THREE.Mesh(new THREE.CylinderGeometry(.13,.13,.12,16),rim);
    hub.position.y=.04;rotor.add(hub);
    group.userData.update=time=>{rotor.rotation.y=time*.55+(s.x+s.y)*.002;};
    group.name='foundry-cooling-turbine';
  } else if(s.kind==='foundryDuct') {
    const casing=material('#697c7d',.7),edge=material('#bdc6ba',.54),copper=material('#c99a68',.64);
    const alongX=w>=d,length=alongX?w:d;
    box(w,.54,d, w/2,.85,d/2,casing);
    for(let i=1,n=Math.max(2,Math.ceil(length/3));i<n;i++) {
      const at=length*i/n;
      box(alongX?.09:w-.10,.60,alongX?d-.10:.09,
        alongX?at:w/2,.85,alongX?d/2:at,edge);
    }
    for(const t of [.14,.86]) {
      const x=alongX?w*t:w/2,z=alongX?d/2:d*t;
      box(.12,Math.max(.1,h-1.1),.12,x,(h+1.1)/2,z,casing);
      box(.38,.12,.38,x,h-.06,z,copper);
    }
    box(alongX?w-.16:.10,.07,alongX?.10:d-.16,w/2,.48,d/2,copper);
    const hoodX=s.hoodEnd==='west'?.88:w-.88;
    add(new THREE.CylinderGeometry(.48,.72,.56,12),casing,hoodX,.35,d/2);
    add(new THREE.CylinderGeometry(.56,.56,.025,12),material('#253234',.72),hoodX,.065,d/2);
    add(new THREE.TorusGeometry(.66,.055,7,18),copper,hoodX,.055,d/2).rotation.x=Math.PI/2;
    group.name='foundry-ceiling-extraction';
  } else if(s.kind==='foundryToolRack') {
    const shell=material('#65787a',.7),door=material('#a9b8b0',.5),edge=material('#d1a978',.58);
    const red=material('#b64e41',.54),gauge=material('#e9dfc8',.16);
    box(w-.22,h,d,w/2,h/2,d/2,shell);
    const count=3;
    const west=s.face==='west',faceX=west?.07:w-.07,handleX=west?faceX-.012:faceX+.012;
    for(let i=0;i<count;i++) {
      const z=d*(i+.5)/count;
      box(.045,h-.32,d/count-.12,faceX,h/2,z,door);
      box(.045,.38,.055,handleX,h*.53,z+d/count*.29,edge);
      box(.045,.045,d/count-.25,handleX,h*.82,z,edge);
    }
    for(const z of [d*.3,d*.7]) {
      const cylinder=add(new THREE.CylinderGeometry(.17,.17,h*.46,12),red,
        west?.18:w-.18,h*.37,z);
      cylinder.castShadow=false;
      add(new THREE.CylinderGeometry(.075,.075,.09,10),edge,west?.18:w-.18,h*.65,z);
    }
    const dial=add(new THREE.CylinderGeometry(.14,.14,.04,16),gauge,
      west?.055:w-.055,h*.78,d/2);
    dial.rotation.z=Math.PI/2;
    box(w-.12,.09,d-.12,w/2,h-.025,d/2,edge);
    group.name='foundry-cooling-service-station';
  } else if(s.kind==='foundryConsole') {
    const shell=material('#53666a',.72),face=material('#b4c1b8',.52),edge=material('#d1a471',.58);
    const screen=new THREE.MeshStandardMaterial({color:'#a8d2c6',emissive:'#2b8f7d',
      emissiveIntensity:.65,roughness:.28,metalness:.24});
    box(w,h,d,w/2,h/2,d/2,shell);
    box(w-.16,.055,d-.16,w/2,h+.02,d/2,face);
    box(w*.52,.025,d*.42,w*.52,h+.055,d*.46,screen);
    for(const x of [w*.18,w*.82])
      add(new THREE.CylinderGeometry(.055,.055,.026,10),edge,x,h+.057,d*.65);
    box(w-.14,.055,.045,w/2,h*.28,.02,edge);
    group.name='foundry-control-console';
  } else if(s.kind==='foundryLadle') {
    const iron=material('#303d40',.82),rim=material('#a98560',.68),cable=material('#747f7c',.76);
    const molten=new THREE.MeshStandardMaterial({color:'#ffb35a',emissive:'#ff5e21',
      emissiveIntensity:2.35,roughness:.36,metalness:.08,toneMapped:false});
    const cx=w/2,cz=d/2,r=Math.min(w,d)*.31;
    // The suspended vessel is above player height. Its actual geometry stays
    // entirely within the decorative, non-colliding volume.
    add(new THREE.CylinderGeometry(r*.82,r*.63,1.25,20),iron,cx,1.35,cz);
    add(new THREE.CylinderGeometry(r*.73,r*.73,.055,20),molten,cx,2.01,cz);
    add(new THREE.TorusGeometry(r*.82,.10,8,24),rim,cx,2.06,cz).rotation.x=Math.PI/2;
    add(new THREE.TorusGeometry(r*.69,.065,8,24),rim,cx,.77,cz).rotation.x=Math.PI/2;
    for(const side of [-1,1]) {
      const x=cx+side*r*.75;
      beam([x,1.74,cz],[x,h-.06,cz],.065,cable,9,.055);
      box(.18,.26,.22,x,1.75,cz,rim);
    }
    const spoutX=cx+r*1.35;
    beam([cx+r*.75,1.89,cz],[spoutX,1.74,cz],.13,rim,10,.10);
    const pour=beam([spoutX,.16,cz],[spoutX,1.75,cz],.065,molten,10,.045);
    pour.castShadow=false;
    box(.74,.16,.74,cx,h-.08,cz,iron);
    group.name='foundry-suspended-ladle';
  } else if(s.kind==='foundryCastingLine') {
    const frame=material('#4a5c60',.76),bed=material('#303a3d',.76),edge=material('#caa174',.58);
    const hot=new THREE.MeshStandardMaterial({color:'#ffb75b',emissive:'#fa5e24',
      emissiveIntensity:2.1,metalness:.12,roughness:.34,toneMapped:false});
    box(w,h,d,w/2,h/2,d/2,frame);
    box(w-.18,.065,d-.22,w/2,h-.04,d/2,bed);
    for(const z of [.10,d-.10])box(w-.08,.11,.11,w/2,h-.045,z,edge);
    const slugs=[];
    for(let i=0;i<5;i++) {
      const slug=box(.36,.025,d*.54,.3+i*(w-.6)/5,h+.004,d/2,hot);
      slug.name='foundry-hot-ingot';slug.castShadow=false;slugs.push(slug);
    }
    group.userData.update=time=>{
      const travel=time*.26;
      for(let i=0;i<slugs.length;i++)slugs[i].position.x=.3+(w-.6)*((i/slugs.length+travel)%1);
      hot.emissiveIntensity=1.85+.35*Math.sin(time*4);
    };
    group.name='foundry-hot-casting-line';
  } else if(s.kind==='foundryPress') {
    const shell=material('#425155',.74),inset=material('#899590',.68),copper=material('#b88359',.72);
    const low=material('#263337',.82);
    box(w,h,d-.08,w/2,h/2,d/2,shell);
    box(w-.16,.12,d-.16,w/2,h-.02,d/2,inset);
    // A recessed stamping face and two hydraulic rods read as machinery,
    // while every solid component stays within the authoritative footprint.
    box(w*.68,h*.42,.035,w/2,h*.52,.025,low);
    for(const x of [w*.24,w*.76])
      box(.12,h*.58,.035,x,h*.56,.023,copper);
    box(w*.74,.10,.035,w/2,h*.22,.023,copper);
    const ram=box(w*.50,.14,.07,w/2,h*.55,.006,copper);
    ram.name='foundry-press-ram';ram.castShadow=false;
    const phase=(s.x+s.y)*.013;
    group.userData.update=time=>{ram.position.y=h*(.52+.11*Math.sin(time*2.2+phase));};
    group.name='foundry-stamping-press';
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
    if(s.style==='foundry') {
      const outer=new THREE.MeshBasicMaterial({color:'#ff6926',transparent:true,opacity:.86,
        depthWrite:false,side:THREE.DoubleSide});
      const inner=new THREE.MeshBasicMaterial({color:'#ffd16c',transparent:true,opacity:.92,
        depthWrite:false,side:THREE.DoubleSide});
      const flames=[];
      for(let i=0;i<9;i++) {
        const angle=i*Math.PI*2/9,spread=i===8?0:radius*(.22+.25*(i%3)/2),
          size=i===8?.78:.48+(i%3)*.10;
        const flame=add(new THREE.ConeGeometry(.13+(i%3)*.035,size,6),i%3===0?inner:outer,
          w/2+Math.cos(angle)*spread,h+.16,d/2+Math.sin(angle)*spread);
        flame.name='foundry-furnace-flame';flame.castShadow=false;flame.receiveShadow=false;
        flame.userData={phase:i*1.63,baseY:h+.16};flames.push(flame);
      }
      group.userData.update=time=>{
        hot.emissiveIntensity=1.8+.4*Math.sin(time*6);
        for(const flame of flames) {
          const flicker=Math.sin(time*7.3+flame.userData.phase);
          flame.scale.y=.78+.24*flicker;
          flame.position.y=flame.userData.baseY+.045*flicker;
          flame.rotation.y=time*.45+flame.userData.phase;
        }
      };
      group.name='foundry-burning-furnace';
    }
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
  } else if(s.kind==='candyConveyor') {
    const candy=s.style==='candy';
    const frame=material(candy?'#a34d3f':'#211e21',candy?.36:.84),
      steel=material(candy?'#ead4ad':'#aaa6a0',candy?.22:.9),belt=material(candy?'#477976':'#29272c',.45);
    const red=new THREE.MeshStandardMaterial({color:candy?'#d84e3f':'#560811',emissive:candy?'#e76445':'#ff1737',emissiveIntensity:candy?1.25:2.5,
      metalness:.45,roughness:.28,toneMapped:false});
    const alongX=w>=d,length=alongX?w:d,cross=alongX?d:w;
    box(w,.22,d,w/2,.11,d/2,frame);
    box(alongX?length-.22:cross-.22,.055,alongX?cross-.22:length-.22,w/2,h-.15,d/2,belt,.012);
    const rollers=Math.max(5,Math.floor(length/.48)),dummy=new THREE.Object3D();
    const rollerGeometry=new THREE.CylinderGeometry(.085,.085,cross-.18,10);
    const rollerInstances=new THREE.InstancedMesh(rollerGeometry,steel,rollers);
    rollerInstances.name='candy-conveyor-rollers';
    rollerInstances.castShadow=true;rollerInstances.receiveShadow=true;
    for(let i=0;i<rollers;i++) {
      const t=(i+.5)/rollers;
      dummy.position.set(alongX?length*t:w/2,h-.08,alongX?d/2:length*t);
      dummy.rotation.set(alongX?Math.PI/2:0,0,alongX?0:Math.PI/2);dummy.updateMatrix();
      rollerInstances.setMatrixAt(i,dummy.matrix);
    }
    rollerInstances.instanceMatrix.setUsage(THREE.StaticDrawUsage);rollerInstances.computeBoundingSphere();
    group.add(rollerInstances);
    const markerCount=10,markerGeometry=new RoundedBoxGeometry(alongX?.16:cross-.28,.025,
      alongX?cross-.28:.16,2,.006);
    const markerInstances=new THREE.InstancedMesh(markerGeometry,red,markerCount);
    markerInstances.name='candy-conveyor-markers';markerInstances.castShadow=false;markerInstances.receiveShadow=true;
    markerInstances.instanceMatrix.setUsage(THREE.DynamicDrawUsage);group.add(markerInstances);
    const sweetCount=8,sweets=candy?new THREE.InstancedMesh(
      new RoundedBoxGeometry(.24,.12,.19,2,.055),
      new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.34,metalness:.05}),sweetCount):null;
    if(sweets) {
      sweets.name='candy-conveyor-sweets';sweets.castShadow=false;sweets.receiveShadow=true;
      sweets.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      const colors=['#f26b91','#fff0cc','#88d7bd','#f7b06f'];
      for(let i=0;i<sweetCount;i++)sweets.setColorAt(i,new THREE.Color(colors[i%colors.length]));
      group.add(sweets);
    }
    for(const side of [0.11,cross-.11])box(alongX?length:.18,.28,alongX?.18:length,
      alongX?w/2:side,h-.14,alongX?side:d/2,frame,.018);
    group.name='candy-moving-belt';
    group.userData.update=time=>{
      const travel=((time*(s.speed||.65)*(s.direction===-1?-1:1))%1+1)%1;
      for(let i=0;i<markerCount;i++) {
        const t=((i+.5)/markerCount+travel)%1;
        dummy.position.set(alongX?length*t:w/2,h-.012,alongX?d/2:length*t);
        dummy.rotation.set(0,0,0);dummy.updateMatrix();markerInstances.setMatrixAt(i,dummy.matrix);
      }
      markerInstances.instanceMatrix.needsUpdate=true;
      if(sweets) {
        for(let i=0;i<sweetCount;i++) {
          const t=((i+.5)/sweetCount+travel)%1;
          dummy.position.set(alongX?length*t:w/2,h+.075,alongX?d/2:length*t);
          dummy.rotation.set(0,(i%3-1)*.12,0);dummy.updateMatrix();sweets.setMatrixAt(i,dummy.matrix);
        }
        sweets.instanceMatrix.needsUpdate=true;
      }
    };
    group.userData.update(0);markerInstances.computeBoundingSphere();sweets?.computeBoundingSphere();
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
        alongX?w/2:side,h-0.13,alongX?side:d/2,trim);
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
