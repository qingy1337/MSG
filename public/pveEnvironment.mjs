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
    const stairBody=s.style==='temple'?material('#596553'):dark;
    const stairTop=s.style==='temple'?material('#9a9b79'):trim;
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
