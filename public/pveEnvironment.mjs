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
    const frame=material('#3b4d51',0.72),panel=material('#74878a',0.48),light=material(s.accent||'#d9b978',0.34);
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
    if(s.style==='temple') {
      const alongX=w>d,length=alongX?w:d;
      const parapet=material(s.liftId?'#7f6841':'#737866',s.liftId ? .58 : .04);
      const edge=material(s.liftId?'#c19a50':'#a19b79',s.liftId ? .72 : .03);
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
        // Low crenellated stonework gives the firing deck real cover while
        // retaining gaps between authored rail segments as shooting ports.
        box(alongX?length:.18,.42,alongX?.18:length,w/2,base(w/2,d/2)+.21,d/2,parapet);
        const merlons=Math.max(1,Math.floor(length/.72));
        for(let i=0;i<merlons;i++) {
          const t=(i+.5)/merlons,x=alongX?length*t:w/2,z=alongX?d/2:length*t;
          box(alongX?Math.min(.38,length/merlons*.62):.22,.56,
            alongX?.22:Math.min(.38,length/merlons*.62),x,base(x,z)+.7,z,edge);
        }
      }
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
    const beam=box(alongX?Math.hypot(length,rise):0.10,0.10,alongX?0.10:Math.hypot(length,rise),w/2,base(w/2,d/2)+1,d/2,trim);
    if(alongX)beam.rotation.z=Math.atan2(rise,length);else beam.rotation.x=-Math.atan2(rise,length);
  } else if (s.kind === 'ramp' && s.stairs) {
    const stairBody=s.style==='temple'?material('#596553'):s.style==='orbital'?material('#7b8792',.72):
      s.style==='airport'?material('#727e84',.56):dark;
    const stairTop=s.style==='temple'?material('#9a9b79'):s.style==='orbital'?material('#e8edf1',.56):
      s.style==='airport'?material('#e9e5dc',.16):trim;
    const moss=s.style==='temple'?material('#63804b',0.02):null;
    const vertical=s.axis==='y',length=vertical?d:w;
    for(let i=0;i<s.steps;i++) {
      const rise=h*(i+1)/s.steps,t=s.reverse?s.steps-1-i:i;
      const x=vertical?w/2:(t+0.5)*length/s.steps,z=vertical?(t+0.5)*length/s.steps:d/2;
      box(vertical?w:length/s.steps,rise,vertical?length/s.steps:d,x,rise/2,z,stairBody);
      box(vertical?w-0.08:length/s.steps-0.04,0.018,vertical?length/s.steps-0.04:d-0.08,x,rise+0.012,z,stairTop);
      if(moss&&i%4===1)box(vertical?w*0.28:length/s.steps-0.05,0.022,
        vertical?length/s.steps-0.05:d*0.24,vertical?w*0.7:x,rise+0.026,vertical?z:d*0.72,moss);
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
    const lamp=new THREE.MeshStandardMaterial({color:'#fff0cf',emissive:'#ffc969',emissiveIntensity:1.35,
      roughness:.28,metalness:.06,toneMapped:false});
    // One continuous plinth makes the capsule collider visually honest. Seats,
    // planting beds, tables, and charging rails are integrated into that base.
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
    for(const x of [w*.35,w*.50,w*.65]) {
      box(w*.11,.10,d*.42,x,.77,d/2,wood,.065);
      box(.11,.52,.11,x,.51,d/2,metal,.025);
      box(w*.075,.035,.12,x,.86,d*.29,metal,.012);
      for(const offset of [-.18,.18])
        add(new THREE.CylinderGeometry(.06,.075,.10,9),offset>0?lamp:material('#73a8b7',.18),x+offset,.91,d*.29);
    }
    group.name='terminal-market-island';
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
      roughness:.2,metalness:.15,toneMapped:false});
    const archX=w*.30,archW=w*.50;
    box(archW*.18,h,d*.72,archX-archW*.40,h/2,d/2,shell);
    box(archW*.18,h,d*.72,archX+archW*.40,h/2,d/2,shell);
    box(archW,h*.18,d*.72,archX,h*.91,d/2,shell);
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
