import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';

const SCALE=.05;
const arena=(x,y,height=0)=>new THREE.Vector3((x-450)*SCALE,height,(y-300)*SCALE);

// Bespoke terminal shell and airside backdrop. Gameplay still uses the simple
// authored solids, but the player sees coherent airport architecture instead
// of the shared arena-wall treatment.
export function createAirportEnvironment(map,walls) {
  const group=new THREE.Group();
  const mat=(color,roughness=.62,metalness=.08)=>new THREE.MeshStandardMaterial({color,roughness,metalness});
  const plaster=mat('#eeeae1',.78,.02),warmWhite=mat('#fbfaf5',.58,.03);
  const steel=mat('#66737c',.35,.62),dark=mat('#26333c',.46,.48),service=mat('#b8c0c3',.73,.18);
  const blue=mat('#236b99',.42,.3),tarmac=mat('#454f55',.96,.02);
  const glass=new THREE.MeshPhysicalMaterial({color:'#a8c7d6',transparent:true,opacity:.24,roughness:.08,
    metalness:.06,depthWrite:false,side:THREE.DoubleSide});
  const glow=new THREE.MeshStandardMaterial({color:'#eefcff',emissive:'#d9f6ff',emissiveIntensity:1.4,
    roughness:.35,metalness:.03,toneMapped:false});
  const amber=new THREE.MeshStandardMaterial({color:'#ffe0a4',emissive:'#ffb64b',emissiveIntensity:1.15,
    roughness:.42,metalness:.05,toneMapped:false});
  const add=(geometry,material,x,y,z)=>{
    const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);
    mesh.castShadow=!material.transparent;mesh.receiveShadow=true;group.add(mesh);return mesh;
  };
  const box=(w,h,d,x,y,z,material=plaster,radius=.04)=>add(
    new RoundedBoxGeometry(w,h,d,2,Math.min(radius,w/4,h/4,d/4)),material,x,y,z);
  const beam=(from,to,radius,material=steel,segments=10)=>{
    const a=new THREE.Vector3(...from),b=new THREE.Vector3(...to),delta=b.clone().sub(a);
    const mesh=add(new THREE.CylinderGeometry(radius,radius,delta.length(),segments),material,
      (a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());return mesh;
  };
  const spanBox=(from,to,width,height,material=service)=>{
    const a=new THREE.Vector3(...from),b=new THREE.Vector3(...to),delta=b.clone().sub(a);
    const mesh=add(new RoundedBoxGeometry(width,height,delta.length(),2,Math.min(.08,width/5,height/5)),material,
      (a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),delta.normalize());return mesh;
  };
  const rect=s=>{
    const p=arena(s.x+s.width/2,s.y+s.height/2),bottom=s.bottom||0,top=s.top??3.1;
    return {x:p.x,z:p.z,w:s.width*SCALE,d:s.height*SCALE,bottom,top,h:top-bottom,horizontal:s.width>=s.height};
  };

  function glassPartition(s,exterior=false) {
    const r=rect(s),length=r.horizontal?r.w:r.d,depth=Math.max(.12,r.horizontal?r.d:r.w);
    const sill=exterior?.26:.16,head=exterior?.30:.18,paneBottom=r.bottom+sill;
    box(r.horizontal?length:depth,sill,r.horizontal?depth:length,r.x,r.bottom+sill/2,r.z,steel,.025);
    box(r.horizontal?length:depth,head,r.horizontal?depth:length,r.x,r.top-head/2,r.z,dark,.025);
    const paneHeight=Math.max(.2,r.h-sill-head);
    box(r.horizontal?length-.08:.028,paneHeight,r.horizontal?.028:length-.08,
      r.x,paneBottom+paneHeight/2,r.z,glass,.008);
    const bays=Math.max(1,Math.ceil(length/(exterior?1.65:1.35)));
    for(let i=0;i<=bays;i++) {
      const along=-length/2+length*i/bays;
      box(r.horizontal?.065:depth,r.h,r.horizontal?depth:.065,
        r.x+(r.horizontal?along:0),r.bottom+r.h/2,r.z+(r.horizontal?0:along),steel,.018);
    }
    if(!exterior)box(r.horizontal?length-.18:.035,.035,r.horizontal?.035:length-.18,
      r.x,r.bottom+.9,r.z,blue,.008);
  }

  function panelWall(s,isService=false) {
    const r=rect(s),length=r.horizontal?r.w:r.d,depth=Math.max(.16,r.horizontal?r.d:r.w);
    box(r.w,r.h,r.d,r.x,r.bottom+r.h/2,r.z,isService?service:plaster,.055);
    const bays=Math.max(1,Math.ceil(length/1.55));
    for(let i=1;i<bays;i++) {
      const along=-length/2+length*i/bays;
      box(r.horizontal?.035:depth+.015,r.h-.34,r.horizontal?depth+.015:.035,
        r.x+(r.horizontal?along:0),r.bottom+r.h/2,r.z+(r.horizontal?0:along),steel,.01);
    }
    box(r.horizontal?length-.12:depth+.025,.16,r.horizontal?depth+.025:length-.12,
      r.x,r.bottom+.12,r.z,dark,.018);
    box(r.horizontal?length-.16:depth+.035,.12,r.horizontal?depth+.035:length-.16,
      r.x,r.top-.11,r.z,isService?dark:blue,.015);
    if(isService)for(let i=0;i<bays;i+=2) {
      const along=-length/2+length*(i+.5)/bays;
      box(r.horizontal?Math.max(.18,length/bays-.18):.025,.045,r.horizontal?.025:Math.max(.18,length/bays-.18),
        r.x+(r.horizontal?along:(r.w/2+.02)),r.bottom+2.05,r.z+(r.horizontal?r.d/2+.02:along),amber,.006);
    }
  }

  // The north face is a real curtain wall overlooking the apron. Other edges
  // are solid terminal/service wings, with deliberately broad architectural bays.
  for(const s of walls) {
    if(s.kind==='cabin')continue;
    if(s.kind==='boundary') {
      if(s.y<1)glassPartition(s,true);else panelWall(s,s.y>map.height*.8);
    } else if(s.airportWall==='glass')glassPartition(s);
    else panelWall(s,s.airportWall==='service');
  }

  // High coffered ceiling: broad panels, acoustic timber bands and recessed
  // light slots establish a terminal scale without lowering local headroom.
  const center=arena(map.width/2,map.height/2),width=map.width*SCALE,depth=map.height*SCALE;
  box(width-.7,.22,depth-.7,center.x,map.ceiling-.10,center.z,warmWhite,.06);
  for(let x=center.x-width/2+.9;x<center.x+width/2-.5;x+=4.2) {
    box(.18,.34,depth-.9,x,map.ceiling-.25,center.z,steel,.025);
    box(.055,.045,depth-1.3,x+.42,map.ceiling-.39,center.z,glow,.008);
  }
  for(const zOffset of [-depth*.28,0,depth*.28]) {
    box(width-.9,.28,.16,center.x,map.ceiling-.25,center.z+zOffset,dark,.025);
    for(let x=center.x-width/2+1.3;x<center.x+width/2-1;x+=3.2)
      box(1.65,.04,.06,x,map.ceiling-.42,center.z+zOffset+.16,glow,.008);
  }
  // Warm timber strips soften the check-in hall, while the gate side retains
  // the cooler metal-and-glass language.
  const timber=mat('#9c7550',.72,.03);
  for(let z=center.z-10;z<center.z+14;z+=1.1)
    box(width*.25,.10,.28,center.x-width*.34,map.ceiling-.39,z,timber,.02);

  // Suspended wayfinding signs use icon-like geometric marks so they remain
  // crisp without runtime canvas textures or extra DOM work.
  const sign=(x,z,w,labelColor=amber)=>{
    box(w,1.0,.12,x,5.65,z,dark,.07);
    box(w-.16,.10,.016,x,5.98,z+.068,blue,.008);
    for(let i=0;i<4;i++)box(w*.12,.065,.018,x-w*.26+i*w*.17,5.58,z+.072,i===0?labelColor:warmWhite,.006);
    beam([x-w*.34,6.15,z],[x-w*.34,map.ceiling-.45,z],.025,steel,7);
    beam([x+w*.34,6.15,z],[x+w*.34,map.ceiling-.45,z],.025,steel,7);
  };
  sign(arena(405,320).x,arena(0,320).z,3.6);
  sign(arena(690,300).x,arena(0,300).z,3.9,glow);
  sign(arena(1190,230).x,arena(0,230).z,3.3);

  // Queue stanchions visually complete security but intentionally yield when
  // brushed; only the scanners themselves own gameplay collision.
  for(const y of [335,475,615])for(const x of [525,555,735,765]) {
    const p=arena(x,y);
    add(new THREE.CylinderGeometry(.07,.09,.88,10),steel,p.x,.44,p.z);
    add(new THREE.SphereGeometry(.10,10,7),dark,p.x,.92,p.z);
  }
  for(const y of [335,475,615]) {
    const a=arena(555,y),b=arena(735,y);
    beam([a.x,.82,a.z],[b.x,.82,b.z],.025,blue,7);
  }

  // Airside apron continues beyond the glazed facade and carries a complete
  // parked narrow-body silhouette, jet bridge, markings, and runway lights.
  const facadeZ=arena(0,0).z;
  const apron=new THREE.Mesh(new THREE.PlaneGeometry(width+34,25),tarmac);
  apron.rotation.x=-Math.PI/2;apron.position.set(center.x,-.025,facadeZ-12.45);apron.receiveShadow=true;group.add(apron);
  for(let x=center.x-width/2-10;x<center.x+width/2+10;x+=5.5)
    box(2.6,.025,.14,x,.006,facadeZ-17.2,mat('#d9d5bc',.8,.02),.005);
  for(let i=0;i<18;i++) {
    const x=center.x-width/2-5+i*4.3,z=facadeZ-22+(i%2)*.35;
    add(new THREE.CylinderGeometry(.045,.065,.08,8),i%3?amber:glow,x,.04,z);
  }

  const planeX=center.x+8.5,planeZ=facadeZ-10.5,airframe=mat('#e8ecee',.4,.34),airBlue=mat('#315f80',.38,.38);
  const fuselage=add(new THREE.CylinderGeometry(.92,.92,18,24),airframe,planeX,2.15,planeZ);
  fuselage.rotation.z=Math.PI/2;
  const nose=add(new THREE.SphereGeometry(.93,20,12),airframe,planeX+9,2.15,planeZ);nose.scale.x=1.45;
  box(8.8,.18,5.8,planeX-.8,2.04,planeZ,airframe,.08).rotation.y=-.05;
  box(4.8,.15,2.1,planeX-7.2,3.02,planeZ,airBlue,.05).rotation.z=-.18;
  box(.18,3.0,3.0,planeX-8.0,3.45,planeZ,airBlue,.06);
  for(let i=0;i<11;i++)for(const side of [-1,1])
    box(.30,.18,.025,planeX-5.8+i*1.05,2.48,planeZ+side*.91,dark,.025);
  for(const z of [planeZ-2.0,planeZ+2.0]) {
    const engine=add(new THREE.CylinderGeometry(.48,.56,1.9,18),dark,planeX-.2,1.35,z);
    engine.rotation.z=Math.PI/2;
    add(new THREE.CylinderGeometry(.31,.31,1.94,18),airBlue,planeX-.2,1.35,z).rotation.z=Math.PI/2;
  }
  // Articulated jet bridge visibly connects the terminal to the aircraft.
  const bridgeStart=arena(1220,0),bridgeEnd=new THREE.Vector3(planeX+3.8,2.9,planeZ+.9);
  const bridgeA=[bridgeStart.x,2.9,facadeZ-.12],bridgeB=[bridgeEnd.x,bridgeEnd.y,bridgeEnd.z];
  spanBox(bridgeA,bridgeB,1.62,1.55,warmWhite);
  spanBox([bridgeA[0],bridgeA[1]-.69,bridgeA[2]],[bridgeB[0],bridgeB[1]-.69,bridgeB[2]],1.72,.18,dark);
  const aVector=new THREE.Vector3(...bridgeA),bVector=new THREE.Vector3(...bridgeB);
  for(const t of [.12,.28,.44,.60,.76,.92]) {
    const p=aVector.clone().lerp(bVector,t);
    box(.42,.46,.035,p.x,p.y+.15,p.z+.82,glass,.015);
  }

  // Baggage doors, safety markings, and wall-mounted equipment finish the
  // otherwise easily neglected service side of the level.
  const southZ=arena(0,map.height).z;
  for(const xValue of [160,525,855,1190,1390]) {
    const p=arena(xValue,map.height);
    box(2.5,2.65,.08,p.x,1.33,southZ-.08,dark,.035);
    for(let y=.25;y<2.5;y+=.42)box(2.25,.055,.025,p.x,y,southZ-.135,service,.008);
    box(2.65,.12,.12,p.x,2.72,southZ-.1,amber,.012);
  }

  group.name='terminal-7-environment';
  return group;
}
