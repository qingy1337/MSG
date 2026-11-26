import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

export const ASHES_AND_DUST = 'miniGun_ashes_and_dust';
export const ASH_MUZZLE_DEPTH = 1.36;
const rotorWidthScale = .875;
const barrelSpacing = .064;
export const ASH_BARREL_RADIUS = barrelSpacing * rotorWidthScale;
export const ASH_BARREL_COUNT = 5;

const tau = Math.PI * 2;
const makeMetal = (color, metalness, roughness) =>
  new THREE.MeshStandardMaterial({color, metalness, roughness});

function mesh(parent, name, geometry, material) {
  const part = new THREE.Mesh(geometry, material);
  part.name = name;
  part.castShadow = part.receiveShadow = true;
  parent.add(part);
  return part;
}

function triangles(points, colors) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  if (colors) geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

// Cross-section of the straight breech, followed by the taper into the barrel bearing.
const section = [[-.173,-.069],[-.111,-.14],[.094,-.14],[.155,-.069],
    [.155,.085],[.095,.151],[-.019,.168],[-.185,.002]];
const stations = [[-.145,1,0],[-.032,1,0],
    [.495,1,0],[.69,.80,-.018],[.79,.68,-.015]];

// The plate soles use the same plane as the top panel of the casting.
const roofSlope=(section[6][1]-section[5][1])/(section[6][0]-section[5][0]);
function roofHeight(depth,x) {
  const right=stations.findIndex(row=>row[0]>=depth);
  const [d0,s0,h0]=stations[right-1], [d1,s1,h1]=stations[right];
  const t=(depth-d0)/(d1-d0);
  const scale=THREE.MathUtils.lerp(s0,s1,t);
  return THREE.MathUtils.lerp(h0,h1,t)+scale*(section[5][1]-roofSlope*section[5][0])+roofSlope*x;
}

function loft(rings, cutFace, innerFace, capCorner=0, scoredFace) {
  const points=[], colors=[];
  const face=(a,b,c,tint)=>{
    points.push(...a,...b,...c);
    const color=new THREE.Color(tint);
    for(let i=0;i<3;i++)colors.push(...color.toArray());
  };
  const outside='#394552';
  for(let i=0;i<rings.length-1;i++){
    const a=rings[i],b=rings[i+1];
    for(let j=0;j<a.length;j++){
      const n=(j+1)%a.length;
      // The two inward faces expose a thin warm mineral stratum under the
      // chipped rim. This edge is part of the shelf, so it ends at the break.
      // Press two small slanted scores into the flat panel above the far
      // cheek. The bevel and its dark bed replace part of the casting face.
      if(j===scoredFace && (i===3||i===4)) {
        const surround=[a[j],b[j],b[n],a[n]];
        const panelPoint=(u,v)=>a[j].map((value,k)=>value+
          u*(b[j][k]-value)+v*(a[n][k]-value));
        const border=[[.61,.55],[.73,.55],[.42,.92],[.30,.92]].map(([u,v])=>panelPoint(u,v));
        const bed=border.map(([x,y,z])=>[x-.004,y,z]);
        for(let k=0;k<4;k++) {
          const next=(k+1)%4;
          face(surround[k],surround[next],border[k],outside);
          face(surround[next],border[next],border[k],outside);
          face(border[k],border[next],bed[k],'#74645b');
          face(border[next],bed[next],bed[k],'#74645b');
        }
        face(bed[0],bed[1],bed[2],'#222c36');face(bed[0],bed[2],bed[3],'#222c36');
        continue;
      }
      const tint=j===cutFace?'#82513f':j===innerFace?'#262b34':outside;
      face(a[j],b[j],a[n],tint);face(a[n],b[j],b[n],tint);
    }
  }
  const front=rings.at(-1);
  if(cutFace!==undefined)for(let j=1;j<front.length-1;j++)
    face(front[capCorner],front[(capCorner+j+1)%front.length],front[(capCorner+j)%front.length],'#494853');
  return triangles(points,colors);
}

function breech() {
  const rings=stations.slice(0,2).map(([d])=>section.map(([x,y])=>[x,y,-d]));
  const sides=loft(rings);
  // Both halves meet at a shallow bevel on the back face. The line carries
  // the direction of the forward split through the solid rear casting.
  const corner=rings[0],heel=[.047,section[1][1],corner[0][2]];
  const capPoints=[],capColors=[];
  const facet=(a,b,c,color)=>{
    capPoints.push(...a,...b,...c);
    const tint=new THREE.Color(color);
    for(let i=0;i<3;i++)capColors.push(...tint.toArray());
  };
  for(const [perimeter,finish] of [
    [[corner[0],corner[1],heel,corner[6],corner[7]],'#33404e'],
    [[heel,corner[2],corner[3],corner[4],corner[5],corner[6]],'#3c4854'],
  ]){
    const center=new THREE.Vector3();
    for(const v of perimeter)center.add(new THREE.Vector3(...v));
    center.divideScalar(perimeter.length);
    const inset=perimeter.map(([x,y,z])=>[x*.92+center.x*.08,y*.92+center.y*.08,z-.007]);
    for(let j=0;j<perimeter.length;j++){
      const n=(j+1)%perimeter.length;
      facet(perimeter[j],perimeter[n],inset[j],'#57616a');
      facet(perimeter[n],inset[n],inset[j],'#57616a');
      if(j>0 && n)facet(inset[0],inset[j],inset[n],finish);
    }
  }
  const cap=triangles(capPoints,capColors);
  const geometry=mergeGeometries([sides,cap]);
  sides.dispose();cap.dispose();
  return geometry;
}

// The split begins as a hairline at the end of the straight breech. Follow
// the two original roof bevels down to their new cut edges. Taking more
// material from the near half naturally leaves a lower, shorter shelf.
function shelf(side) {
  // depth, inner edge of the near and far shelves (before nose taper)
  const cuts=[[-.032,-.019,-.019],[.062,-.071,-.009],[.157,-.126,.020],
    [.232,-.136,.044],[.345,-.144,.043],[.379,-.133,.044],
    [.495,-.128,.051],[.585,-.133,.032],[.646,-.151,.029],
    [.69,-.151,.011],[.79,-.151,-.004]];
  const near=side<0;
  const rings=(near?cuts.slice(0,9):cuts).map(([d,left,right])=>{
    const n=stations.findIndex(row=>row[0]>=d);
    const [d0,s0,h0]=stations[n-1], [d1,s1,h1]=stations[n];
    const t=(d-d0)/(d1-d0), scale=THREE.MathUtils.lerp(s0,s1,t), h=THREE.MathUtils.lerp(h0,h1,t);
    // The far casting overhangs the split only at its roof. Leave the wheel
    // cavity at its original width underneath the shallow return.
    const lip=right-.16*(right-left);
    const x=near?left:lip, top=near?x+.187:section[6][1]+roofSlope*(x-section[6][0]);
    const bottom=section[1][1], seam=top-.013;
    // Both cut faces run down from the lip; reverse the near face to retain
    // the same outward winding as the perimeter of the breech.
    const rim=near?[section[0],section[1],[x,bottom],[x,seam],[x,top],section[7]]:
      [[x,top],[x,seam],[right,top-.029],[right,bottom],section[2],section[3],section[4],section[5]];
    return rim.map(([u,v])=>[u*scale,v*scale+h,-d]);
  });
  return near?loft(rings,3,2):loft(rings,0,2,2,5);
}

// The breech is cradled in one swept obsidian cheek on either side. Each
// section is fitted to the casting at that depth. The cleaved upper edge
// climbs sharply at the heel, then runs out into the bearing at the nose.
function cheek(side) {
  const profile=[
    // depth, lower edge, upper edge, relief
    [-.143,-.095,.080,.001],[-.134,-.095,.080,.015],
    [-.005,-.099,.091,.017],[.025,-.109,.090,.019],
    [.055,-.116,.080,.020],[.118,-.126,.046,.022],
    [.244,-.118,.008,.018],[.395,-.095,-.016,.018],
    [.495,-.077,-.018,.014],[.594,-.060,-.012,.011],
    [.690,-.042,.002,.008],[.761,-.016,.006,.001],
  ];
  const points=[],colors=[];
  const nearProfile=profile.filter(([d])=>d<.594);
  nearProfile.push([.594,-.060,-.012,.008],[.644,-.039,-.020,0]);
  const rings=(side<0?nearProfile:profile).map(([d,low,high,lift])=>{
    const right=stations.findIndex(row=>row[0]>=d);
    const [d0,s0,h0]=stations[right-1],[d1,s1,h1]=stations[right];
    const t=(d-d0)/(d1-d0), scale=THREE.MathUtils.lerp(s0,s1,t), base=THREE.MathUtils.lerp(h0,h1,t);
    const face=(y,offset)=>{
      const edges=side<0?[1,0,7,6]:[2,3,4,5];
      const through=edges.findIndex(index=>section[index][1]>=y);
      const a=section[edges[through-1]], b=section[edges[through]];
      const x=THREE.MathUtils.lerp(a[0],b[0],(y-a[1])/(b[1]-a[1]));
      return [scale*x+side*offset,scale*y+base,-d];
    };
    const band=(p,offset)=>face(THREE.MathUtils.lerp(low,high,p),offset);
    return [band(0,-.001),band(.12,lift*.67),band(.66,lift),
      band(.85,lift*.81),band(.90,lift*.79),band(1,-.001)];
  });
  const hues=['#202733','#343e4b','#45515d','#996c57','#59646e'];
  const uv=[],rear=rings[0][0][2],length=rear-rings.at(-1)[0][2];
  for(let i=1;i<rings.length;i++)for(let j=0;j<hues.length;j++){
    const a=rings[i-1],b=rings[i];
    const verts=side<0?[a[j],a[j+1],b[j],a[j+1],b[j+1],b[j]]:[a[j],b[j],a[j+1],a[j+1],b[j],b[j+1]];
    const color=new THREE.Color(hues[j]);
    for(const v of verts){
      points.push(...v);colors.push(...color.toArray());
      if(side<0)uv.push(.5*(rear-v[2])/length,j===3?.75:.25);
    }
  }
  const geometry=triangles(points,colors);
  if(side<0)geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  return geometry;
}

// One slab, including the dark glass underside, a broken clinker stratum
// around its edge, and a broad crown split into a few long fracture planes.
function basaltPlate(index,length) {
  const width=[.156,.112,.100][index];
  const corners=[[-.47,.05],[-.28,-.04],[.26,0],[.54,.15],[.59,.71],
    [.37,.90],[.22,.89],[.04,.98],[-.37,1],[-.59,.85],[-.55,.47]];
  // Hone the tips locally. The long sides still read as cleaved stone.
  const outline=[];
  for(let i=0;i<corners.length;i++){
    const prev=corners[(i+corners.length-1)%corners.length], tip=corners[i], next=corners[(i+1)%corners.length];
    for(const t of [0,.5,1]){
      const a=.12*(1-t)**2, b=.12*t*t;
      outline.push([tip[0]+a*(prev[0]-tip[0])+b*(next[0]-tip[0]),
        tip[1]+a*(prev[1]-tip[1])+b*(next[1]-tip[1])]);
    }
  }
  const points=[], colors=[];
  const facet=(a,b,c,hex)=>{
    const tint=new THREE.Color(hex);
    points.push(...a,...b,...c);
    for(let k=0;k<3;k++) colors.push(...tint.toArray());
  };
  const layers=[[.92,0],[1,.010],[1,.016],[.88,.026]];
  const rings=layers.map(([scale,y],layer)=>outline.map(([x,d])=>{
    const across=x*width*scale;
    const height=y+roofSlope*across+(layer===2?.002*Math.sin(d*9+x*4+index):0);
    return [across,height,-(d*scale+(1-scale)*.42)*length];
  }));
  const edgeTints=['#171b24','#7f3b31','#404855'];
  for(let level=0;level<3;level++) for(let j=0;j<outline.length;j++) {
    const n=(j+1)%outline.length, a=rings[level], b=rings[level+1];
    const tint=level===1 && Math.floor(j/3)%4===0?'#a76d53':edgeTints[level];
    facet(a[j],a[n],b[j],tint);facet(a[n],b[n],b[j],tint);
  }
  const top=rings[3], base=rings[0], crown=[-.012,.038,-length*.43];
  const planes=['#566170','#535f6f','#4d5867','#465260','#495463','#515b69',
    '#475361','#54606f','#4f5b69','#596471','#54616e'];
  for(let j=0;j<outline.length;j++){
    const n=(j+1)%outline.length;
    facet(top[j],top[n],crown,planes[(Math.floor(j/3)+index)%planes.length]);
    if(j>0 && n)facet(base[0],base[n],base[j],'#202a35');
  }
  return triangles(points,colors);
}

// The wheel turns on the same longitudinal axis as the five barrels. Its
// three scoops wind around the dark drum, so passing embers are visible
// from above, from either side, and through the deep end of the split.
function emberWheel() {
  const points=[], colors=[], blur=[], indices=[];
  const palette=['#262932','#92402a','#f36723','#ffcc6b','#9d4123'].map(hex=>new THREE.Color(hex));
  for(let scoop=0;scoop<3;scoop++){
    const first=points.length/3;
    for(let i=0;i<=32;i++){
      const t=i/32, belly=Math.sin(Math.PI*t);
      const center=scoop*tau/3+1.65*t+.23*belly;
      for(let j=0;j<palette.length;j++){
        const u=j/(palette.length-1);
        const angle=center+(u-.5)*(.08+.82*belly);
        const radius=.065+.013*belly+.006*Math.sin(Math.PI*u)*belly;
        const x=radius*Math.cos(angle),y=radius*Math.sin(angle);
        points.push(x,y,-.201-.285*t);
        const trail=angle-.74*(1-u)*belly;
        blur.push(radius*Math.cos(trail)-x,radius*Math.sin(trail)-y,0);
        colors.push(...palette[j].toArray());
        const k=first+i*palette.length+j;
        if(i&&j)indices.push(k-6,k-1,k,k-6,k,k-5);
      }
    }
  }
  const geometry=triangles(points,colors);
  geometry.setIndex(indices);geometry.computeVertexNormals();
  geometry.morphTargetsRelative=true;
  geometry.morphAttributes.position=[new THREE.Float32BufferAttribute(blur,3)];
  return geometry;
}

function mountWheel(body,steel,liner) {
  const mechanism=new THREE.Group();
  mechanism.position.set(-.049,.052,0);
  body.add(mechanism);
  function spindle(name,radius,from,to,material){
    const part=mesh(mechanism,name,new THREE.CylinderGeometry(radius,radius,to-from,32),material);
    part.rotation.x=Math.PI/2;part.position.z=-(from+to)/2;
  }
  spindle('drive shaft',.024,-.040,.785,steel);
  spindle('wheel bed',.064,.195,.493,liner);
  spindle('rear journal',.069,.184,.203,steel);
  spindle('forward journal',.069,.485,.505,steel);
  const wheel=mesh(mechanism,'ember wheel',emberWheel(),
    new THREE.MeshBasicMaterial({vertexColors:true,toneMapped:false}));
  wheel.castShadow=false;
  // Heat reflected on the shaft-side rim gathers into a crescent at speed.
  const crescent=mesh(mechanism,'heat crescent',new THREE.RingGeometry(.057,.066,48,1,.32,4.4),
    new THREE.MeshBasicMaterial({color:'#ff8e32',transparent:true,opacity:0,depthWrite:false,
      blending:THREE.AdditiveBlending,toneMapped:false}));
  const arc=crescent.geometry.attributes.position, tints=[];
  for(let i=0;i<arc.count;i++){
    const t=(i%49)/48;
    const weight=Math.sin(Math.PI*t)**1.4*(i<49?.32:1);
    tints.push(weight,weight*.72,weight*.48);
  }
  crescent.geometry.setAttribute('color',new THREE.Float32BufferAttribute(tints,3));
  crescent.material.vertexColors=true;
  crescent.position.z=-.183;crescent.castShadow=false;
  return {wheel,crescent};
}

function bores() {
  const tubes=[], lips=[], depths=[], sleeves=[];
  // Turned steps at the roots and recessed grooves at the tips give the
  // five barrels a legible silhouette even when the whole cluster is dark.
  const barrelSection=[[.029,.815],[.035,.850],[.036,.901],[.030,.915],
    [.030,1.19],[.035,1.202],[.035,1.288],[.031,1.295],
    [.031,1.307],[.036,1.312],[.036,1.353],[.032,ASH_MUZZLE_DEPTH]];
  for(let i=0;i<ASH_BARREL_COUNT;i++){
    const a=tau*i/ASH_BARREL_COUNT, x=barrelSpacing*Math.cos(a), y=barrelSpacing*Math.sin(a);
    const tube=new THREE.LatheGeometry(barrelSection.slice().reverse().map(([r,d])=>new THREE.Vector2(r,-d)),20);
    tube.rotateX(Math.PI/2);tube.translate(x,y,0);tubes.push(tube);
    const sleeve=new THREE.CylinderGeometry(.033,.035,.047,20,1,true);
    sleeve.rotateX(Math.PI/2);sleeve.translate(x,y,-.964);sleeves.push(sleeve);
    const lip=new THREE.RingGeometry(.023,.032,20);
    lip.rotateY(Math.PI);lip.translate(x,y,-ASH_MUZZLE_DEPTH);lips.push(lip);
    const bore=new THREE.CircleGeometry(.03,18);
    bore.rotateY(Math.PI);bore.translate(x,y,-ASH_MUZZLE_DEPTH+.015);depths.push(bore);
  }
  return [tubes,lips,depths,sleeves].map(parts=>{
    const merged=mergeGeometries(parts);
    parts.forEach(part=>part.dispose());
    return merged;
  });
}

// Only the copper ridge samples the upper row. Sliding this two-texel
// boundary lights the existing facets continuously from breech to muzzle.
function ridgeChargeMask() {
  // The lower row leaves the cheek dark. The copper ridge samples the upper
  // row, where shifting the white-to-black boundary advances the charge.
  const black=[0,0,0,255],white=[255,255,255,255];
  const mask=new THREE.DataTexture(new Uint8Array([...black,...black,...white,...black]),2,2);
  mask.offset.x=.501;
  mask.needsUpdate=true;
  return mask;
}

const movement = new WeakMap();

export function createAshesAndDust(length) {
  const model=new THREE.Group();
  model.name='Ashes & Dust';
  model.scale.setScalar(length);
  const steel=makeMetal('#37414d',.53,.4);
  const glass=makeMetal('#1c202b',.42,.19);
  glass.side=THREE.DoubleSide;
  const stone=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.68,metalness:.08});
  const body=new THREE.Group();
  body.scale.set(.70,.665,1.02);
  body.position.z=-.041;
  model.add(body);
  const basalt=makeMetal('#ffffff',.32,.50);
  basalt.vertexColors=true;
  mesh(body,'basalt chassis',breech(),basalt);
  mesh(body,'lower basalt shelf',shelf(-1),basalt);
  mesh(body,'upper basalt shelf',shelf(1),basalt);
  const cutGlass=new THREE.MeshPhysicalMaterial({
    vertexColors:true,metalness:.27,roughness:.31,clearcoat:.48,clearcoatRoughness:.23,
  });
  const nearGlass=cutGlass.clone(),ridgeMask=ridgeChargeMask();
  nearGlass.emissiveMap=ridgeMask;
  nearGlass.emissive.setHex(0xea9454);
  nearGlass.addEventListener('dispose',()=>ridgeMask.dispose());
  mesh(body,'obsidian cheek',cheek(-1),nearGlass);
  mesh(body,'obsidian cheek',cheek(1),cutGlass);
  const {wheel,crescent}=mountWheel(body,steel,glass);
  const plates=[.025,.267,.509].map((depth,i)=>{
    const length=i===2?.221:.229;
    const x=[.061,.075,.066][i];
    const hinge=new THREE.Group();
    const seat=roofHeight(depth,x);
    hinge.position.set(x,seat+.004,-depth);
    body.add(hinge);
    const slab=basaltPlate(i,length);
    if(i===2) {
      // The nose falls away. Pitch the closed slab along its roof so the
      // tip sits down with the heel when the mechanism settles.
      const nose=stations.at(-1)[0];
      slab.rotateX(Math.atan2(roofHeight(nose,x)-seat,nose-depth));
    }
    mesh(hinge,'basalt plate '+(i+1),slab,stone);
    const pin=mesh(body,'vent hinge',new THREE.CylinderGeometry(.009,.009,.060,12),glass);
    pin.rotation.z=Math.atan(roofSlope)-Math.PI/2;
    pin.position.copy(hinge.position);
    return hinge;
  });
  const rotor=new THREE.Group();
  rotor.scale.set(rotorWidthScale,rotorWidthScale,1);
  rotor.name='ash-rotating-barrels';model.add(rotor);
  const [tubes,lips,depths,sleeves]=bores();
  mesh(rotor,'annealed sleeves',sleeves,makeMetal('#695657',.67,.37));
  mesh(rotor,'stepped barrels',tubes,makeMetal('#424550',.67,.34));
  mesh(rotor,'tempered mouths',lips,makeMetal('#988178',.71,.32));
  mesh(rotor,'recessed bores',depths,glass);
  const bearingProfile=[[0,-.869],[.104,-.869],[.104,-.836],[.098,-.816],[.081,-.789],[0,-.789]];
  const bearing=new THREE.LatheGeometry(bearingProfile.map(([r,z])=>new THREE.Vector2(r,z)),24);
  bearing.rotateX(Math.PI/2);
  bearing.scale(rotorWidthScale,rotorWidthScale,1);
  mesh(model,'front bearing',bearing,glass);
  // A narrow hoop encloses the cluster, leaving the five mouths distinct.
  const hoop=mesh(rotor,'muzzle ferrule',new THREE.CylinderGeometry(.102,.101,.030,30,1,true),steel);
  hoop.rotation.x=Math.PI/2;hoop.position.z=-1.174;
  const rim=new THREE.RingGeometry(.093,.102,30);
  rim.rotateY(Math.PI);rim.translate(0,0,-1.189);
  mesh(rotor,'ferrule rim',rim,steel);

  // A continuous undercut gives both hands an anchor below the heat.
  const shoe=new THREE.Shape();
  shoe.moveTo(-.05,-.052);shoe.lineTo(.15,-.065);shoe.lineTo(.11,-.295);
  shoe.quadraticCurveTo(.055,-.329,-.017,-.285);shoe.lineTo(.024,-.16);shoe.closePath();
  const grip=new THREE.ExtrudeGeometry(shoe,{depth:.108,bevelThickness:.012,bevelSize:.012,bevelSegments:2});
  grip.translate(0,0,-.054);grip.rotateY(Math.PI/2);
  mesh(model,'rear grip',grip,glass);
  const rest=new THREE.Shape();
  rest.moveTo(.34,-.055);rest.lineTo(.72,-.052);rest.lineTo(.84,-.086);
  rest.lineTo(1.00,-.110);rest.quadraticCurveTo(.94,-.136,.72,-.149);
  rest.lineTo(.57,-.205);rest.quadraticCurveTo(.51,-.226,.47,-.185);
  rest.lineTo(.41,-.126);rest.closePath();
  const foregrip=new THREE.ExtrudeGeometry(rest,{depth:.13,bevelThickness:.012,bevelSize:.012,bevelSegments:2});
  foregrip.translate(0,0,-.065);foregrip.rotateY(Math.PI/2);
  mesh(model,'underslung palm rest',foregrip,glass);

  const ashGroup=new THREE.Group();
  body.add(ashGroup);
  const flakes=[0,1].map(i=>{
    const geometry=triangles([-.014,-.004,0,.012,-.008,0,.007,.009,.004,
      -.014,-.004,0,.007,.009,.004,-.008,.008,0,
      .007,.009,.004,.012,-.008,0,-.014,-.004,0,-.008,.008,0,.007,.009,.004,-.014,-.004,0],
      ['#c8beb2','#b6afa6','#e1d6cb','#c8beb2','#e1d6cb','#b9b6b1',
        '#a55436','#e89450','#79382c','#854832','#a55436','#79382c'].flatMap(c=>new THREE.Color(c).toArray()));
    const flake=mesh(ashGroup,'ash flake '+i,geometry,stone);
    flake.visible=flake.castShadow=flake.receiveShadow=false;
    return flake;
  });
  movement.set(model,{ridgeMask,wheel,crescent,plates,rotor,flakes,speed:0,angle:0,heldFor:0,ashAge:Infinity});
  poseAshesAndDust(model,0,false);
  return model;
}

export function poseAshesAndDust(model,dt,held,charge,remaining=0) {
  const state=movement.get(model);
  if(!state)return;
  const level=Number.isFinite(charge)?THREE.MathUtils.clamp(remaining>0?remaining:charge,0,1):0;
  state.ridgeMask.offset.x=.501-.502*level;
  dt=Math.max(0,dt);
  const target=held?1:0, rate=held?10:4.8;
  const old=state.speed;
  const decay=Math.exp(-rate*dt);
  state.speed=target+(old-target)*decay;
  if(!held && state.speed<.001)state.speed=0;
  state.angle=(state.angle+36*(target*dt+(old-target)*(1-decay)/rate))%tau;
  state.rotor.rotation.z=-state.angle;
  state.wheel.rotation.z=state.angle;
  state.wheel.morphTargetInfluences[0]=THREE.MathUtils.smoothstep(state.speed,.42,.96);
  state.crescent.visible=state.speed>.25;
  state.crescent.material.opacity=THREE.MathUtils.smoothstep(state.speed,.25,.98)*.95;
  state.wheel.material.color.setRGB(.64+state.speed*.56,.55+state.speed*.60,.47+state.speed*.53);
  state.plates.forEach((plate,i)=>{
    plate.rotation.x=(.084+i*.019)*THREE.MathUtils.smoothstep(state.speed,.1+i*.15,.65+i*.16);
  });
  if(!held && state.heldFor>=.65)state.ashAge=0;
  state.heldFor=held?state.heldFor+dt:0;
  state.ashAge+=dt;
  state.flakes.forEach((flake,i)=>{
    const t=state.ashAge-i*.13;
    flake.visible=t>=0 && t<.64;
    if(!flake.visible)return;
    flake.position.set(-.047-.15*t-.020*Math.sin(9*t+i),.137+.45*t-.24*t*t,-.28-i*.11+.10*t);
    flake.rotation.set(.5+8*t,i+2*t,4*t+i);
    flake.scale.setScalar((1-THREE.MathUtils.smoothstep(t,.40,.64))*(1-i*.23));
  });
}
