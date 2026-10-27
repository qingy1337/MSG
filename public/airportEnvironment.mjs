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
  const shellPanel=mat('#dce5e2',.82,.02),servicePanel=mat('#d2dedf',.73,.05);
  const shellBase=mat('#697a80',.62,.16),shopBase=mat('#39464d',.63,.20);
  const glass=new THREE.MeshPhysicalMaterial({color:'#a8c7d6',transparent:true,opacity:.24,roughness:.08,
    metalness:.06,depthWrite:false,side:THREE.DoubleSide});
  const glow=new THREE.MeshStandardMaterial({color:'#e5f8ff',emissive:'#83d9ff',emissiveIntensity:1.9,
    roughness:.35,metalness:.03,toneMapped:false});
  const amber=new THREE.MeshStandardMaterial({color:'#ffe0a4',emissive:'#ffb64b',emissiveIntensity:1.15,
    roughness:.42,metalness:.05,toneMapped:false});
  const shopWall={coffee:mat('#59433a',.46,.12),bakery:mat('#815953',.48,.10),
    books:mat('#38566d',.42,.18),travel:mat('#46545d',.40,.22),restaurant:mat('#713f35',.46,.12),
    noodles:mat('#743d36',.46,.10)};
  const shopTrim={coffee:mat('#c79a51',.34,.40),bakery:mat('#dc856d',.38,.22),
    books:mat('#70a9bc',.35,.24),travel:mat('#c7a654',.34,.44),restaurant:mat('#db7653',.38,.24),
    noodles:mat('#ce684e',.38,.24)};
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
    const bays=Math.max(1,Math.ceil(length/(exterior?2.1:2.35)));
    for(let i=0;i<=bays;i++) {
      const along=-length/2+length*i/bays;
      box(r.horizontal?.065:depth,r.h,r.horizontal?depth:.065,
        r.x+(r.horizontal?along:0),r.bottom+r.h/2,r.z+(r.horizontal?0:along),steel,.018);
    }
    if(!exterior)box(r.horizontal?length-.18:.035,.035,r.horizontal?.035:length-.18,
      r.x,r.bottom+.9,r.z,blue,.008);
  }

  function panelWall(s) {
    const r=rect(s),length=r.horizontal?r.w:r.d,depth=Math.max(.16,r.horizontal?r.d:r.w);
    const tenant=s.airportWall==='shop',isService=s.airportWall==='service';
    const wallMaterial=tenant?(shopWall[s.shop]||plaster):isService?service:plaster;
    const accent=tenant?(shopTrim[s.shop]||blue):blue;
    const body=box(r.w,r.h,r.d,r.x,r.bottom+r.h/2,r.z,wallMaterial,.025);
    body.name=tenant?'terminal-shop-wall':isService?'terminal-service-wall':'terminal-shell-wall';
    // All applied detail sits just beyond the visible wall face. Thin flush
    // panels previously flickered against the wall and made its collision
    // silhouette look unrelated to the model.
    const face=(along,y,panelLength,panelHeight,material,thickness=.025)=>{
      for(const side of [-1,1]) {
        const offset=side*(depth/2+thickness/2+.008);
        box(r.horizontal?panelLength:thickness,panelHeight,r.horizontal?thickness:panelLength,
          r.x+(r.horizontal?along:offset),y,r.z+(r.horizontal?offset:along),material,.008);
      }
    };
    if(tenant) {
      // The shop's color belongs to its self-contained room. A dark plinth
      // and restrained metal fascia tie it into the public concourse.
      face(0,r.bottom+.23,length-.04,.46,shopBase,.035);
      face(0,r.top-.12,length-.06,.16,accent,.03);
      return;
    }
    if(isService) {
      // Gate and screening partitions are one calm material family, with
      // broad acoustic bays and a low durable base instead of metal ribs.
      face(0,r.bottom+.29,length-.04,.58,shellBase,.035);
      const bays=Math.max(1,Math.ceil(length/3.2)),bayLength=length/bays;
      for(let i=0;i<bays;i++) {
        const along=-length/2+bayLength*(i+.5);
        face(along,r.bottom+(r.h+.25)/2,bayLength-.18,r.h-.91,servicePanel,.022);
      }
      face(0,r.top-.25,length-.10,.07,blue,.028);
      // The coping wraps over the body instead of sharing its top and side
      // planes. Coplanar caps were responsible for the flashing wall edges.
      box(r.w+.025,.14,r.d+.025,r.x,r.top-.055,r.z,warmWhite,.012);
      return;
    }
    // The terminal shell has a grounded stone base, a clear shop-height datum,
    // and large upper acoustic bays. Their scale follows the building rather
    // than making every wall segment look like a separate prop.
    if(r.bottom<.6)face(0,r.bottom+.37,length-.04,.74,shellBase,.04);
    const panelBottom=Math.max(r.bottom+.26,4.05),panelTop=r.top-1.02;
    if(panelTop>panelBottom+.5) {
      const bays=Math.max(1,Math.ceil(length/4.4)),bayLength=length/bays;
      for(let i=0;i<bays;i++) {
        const along=-length/2+bayLength*(i+.5);
        face(along,(panelBottom+panelTop)/2,bayLength-.15,panelTop-panelBottom,shellPanel,.026);
      }
    }
    if(r.bottom<3.4&&r.top>3.4)face(0,3.4,length-.10,.075,blue,.028);
    box(r.w+.025,.15,r.d+.025,r.x,r.top-.06,r.z,warmWhite,.012);
  }

  function galleryScreen(s) {
    const r=rect(s),alongX=r.horizontal,length=alongX?r.w:r.d,depth=alongX?r.d:r.w;
    const shell=mat('#d9e4e5',.64,.08),acoustic=mat('#afc4c8',.59,.10),edge=mat('#eef0ec',.43,.12);
    // Flat-ended bodies meet at the authored right-angle joints. A calm
    // continuous base and cap make the two returns read as mezzanine
    // architecture instead of separate decorated obstacles.
    const body=box(r.w,r.h,r.d,r.x,r.bottom+r.h/2,r.z,shell,.005);
    body.name='terminal-gallery-screen';
    box(r.w+.025,.16,r.d+.025,r.x,r.bottom+.065,r.z,steel,.008);
    box(r.w+.025,.16,r.d+.025,r.x,r.top-.065,r.z,edge,.008);
    const bays=Math.max(1,Math.ceil(length/2.7));
    for(const side of [-1,1]) {
      for(let i=0;i<bays;i++) {
        const along=-length/2+length*(i+.5)/bays;
        box(alongX?length/bays-.11:.022,r.h-.50,alongX?.022:length/bays-.11,
          r.x+(alongX?along:side*(depth/2+.012)),r.bottom+r.h/2,
          r.z+(alongX?side*(depth/2+.012):along),acoustic,.008);
      }
      box(alongX?length-.10:.025,.035,alongX?.025:length-.10,
        r.x+(alongX?0:side*(depth/2+.019)),r.bottom+.82,
        r.z+(alongX?side*(depth/2+.019):0),blue,.008);
    }
  }

  // The north face is a real curtain wall overlooking the apron. Other edges
  // are solid terminal/service wings, with deliberately broad architectural bays.
  for(const s of walls) {
    if(s.kind==='cabin')continue;
    if(s.kind==='boundary') {
      if(s.y<1)glassPartition(s,true);else panelWall(s);
    } else if(s.zone==='gallery-screen')galleryScreen(s);
    else if(s.airportWall==='glass')glassPartition(s);
    else panelWall(s);
  }

  // A continuous arched canopy replaces the old flat slab and repetitive beam
  // grid. Five broad acoustic shells are separated by glazed daylight ribbons;
  // slender curved ribs express how the terminal roof is actually supported.
  const center=arena(map.width/2,map.height/2),width=map.width*SCALE,depth=map.height*SCALE;
  const roofMaterial=warmWhite.clone();roofMaterial.side=THREE.DoubleSide;
  const roofGlass=new THREE.MeshPhysicalMaterial({color:'#9fcce0',transparent:true,opacity:.36,
    roughness:.12,metalness:.08,depthWrite:false,side:THREE.DoubleSide});
  const roofHeight=t=>map.ceiling-.22-1.28*t*t;
  const roofStrip=(z,stripDepth,material=roofMaterial)=>{
    const segments=20,positions=[],indices=[];
    for(let row=0;row<2;row++)for(let i=0;i<=segments;i++) {
      const t=-1+2*i/segments;
      positions.push(center.x+t*(width-.7)/2,roofHeight(t),z+(row-.5)*stripDepth);
    }
    for(let i=0;i<segments;i++) {
      const a=i,b=i+1,c=segments+1+i,d=c+1;
      indices.push(a,c,b,b,c,d);
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const shell=add(geometry,material,0,0,0);
    shell.name=material===roofGlass?'terminal-skylight':'terminal-roof-shell';
  };
  const curvedRib=z=>{
    for(let i=0;i<20;i++) {
      const a=-1+2*i/20,b=-1+2*(i+1)/20;
      beam([center.x+a*(width-.7)/2,roofHeight(a)-.08,z],
        [center.x+b*(width-.7)/2,roofHeight(b)-.08,z],.045,steel,7);
    }
  };
  const skylightGap=.62,stripDepth=(depth-1.0-skylightGap*4)/5;
  const roofStart=center.z-depth/2+.5;
  for(let strip=0;strip<5;strip++) {
    const z=roofStart+stripDepth/2+strip*(stripDepth+skylightGap);
    roofStrip(z,stripDepth);
    curvedRib(z-stripDepth/2);curvedRib(z+stripDepth/2);
    for(const t of [-.56,0,.56]) {
      const x=center.x+t*(width-.7)/2;
      box(.075,.045,stripDepth*.72,x,roofHeight(t)-.16,z,glow,.008);
    }
    if(strip<4) {
      const gapZ=z+stripDepth/2+skylightGap/2;
      roofStrip(gapZ,skylightGap-.08,roofGlass);
    }
  }

  const site=(u,v,height=0)=>arena(map.width*u,map.height*v,height);
  const airportTerrain=map.terrain||[];

  // Each check-in island owns one measured canopy aligned from its actual
  // collider. Six luminous station plaques and two end supports create the
  // repeated rhythm of a real airline processing hall.
  for(const [rowIndex,island] of airportTerrain.filter(s=>s.kind==='airportCheckin').entries()) {
    const r=rect(island),identity=rowIndex?amber:blue;
    const canopy=box(r.w+.28,.24,r.d+1.72,r.x,3.25,r.z,dark,.055);
    canopy.name='terminal-checkin-canopy';
    box(r.w-.18,.09,.14,r.x,3.02,r.z-r.d/2-.85,identity,.012);
    for(let station=0;station<6;station++) {
      const x=r.x-r.w*.41+station*r.w*.164;
      box(r.w*.12,.32,.07,x,3.03,r.z-r.d/2-.92,warmWhite,.024);
      box(r.w*.055,.052,.024,x,3.03,r.z-r.d/2-.965,station%2?glow:identity,.006);
      box(.055,.04,r.d+1.15,x,3.06,r.z,identity,.007);
    }
    for(const x of [r.x-r.w/2+.12,r.x+r.w/2-.12])
      box(.16,3.13,.16,x,1.565,r.z+r.d/2+.65,steel,.024);
  }

  // Four screening lanes pass under one unmistakable threshold. Architecture
  // follows the authored scanners, so future proportion changes stay aligned.
  const scanners=airportTerrain.filter(s=>s.kind==='airportScanner').map(rect);
  if(scanners.length) {
    const left=Math.min(...scanners.map(r=>r.x-r.w/2)),right=Math.max(...scanners.map(r=>r.x+r.w/2));
    const z=scanners.reduce((sum,r)=>sum+r.z,0)/scanners.length;
    const securityHeader=box(right-left+.55,.52,.42,(left+right)/2,3.28,z,dark,.055);
    securityHeader.name='terminal-security-header';
    box(right-left+.16,.075,.028,(left+right)/2,3.12,z+.23,glow,.008);
    // The actual scanner arches below provide the lane framing. Extra posts
    // and crosspieces here had no gameplay solids, so shots passed through
    // apparently solid steel. Keep only the shared header with its own solid.
  }

  // Three boarding portals are dimensioned from the gate desks and repeated
  // against the retained curtain wall. Nothing here is placed in arbitrary
  // source coordinates—the previous scaling mismatch was a major visual flaw.
  const northFacadeZ=site(0,0).z;
  for(const [index,desk] of airportTerrain.filter(s=>s.kind==='airportGateDesk'&&!(s.bottom>0)).entries()) {
    const r=rect(desk),portalWidth=4.9,pz=northFacadeZ+.20;
    const portal=box(.34,4.65,.34,r.x-portalWidth/2,2.33,pz,dark,.055);
    portal.name='terminal-gate-portal';
    box(.34,4.65,.34,r.x+portalWidth/2,2.33,pz,dark,.055);
    box(portalWidth,.34,.34,r.x,4.49,pz,dark,.055);
    box(portalWidth-.45,3.92,.10,r.x,1.98,pz+.21,glass,.022);
    box(.12,3.74,.18,r.x,1.91,pz+.26,steel,.014);
    box(portalWidth-.58,.15,.23,r.x,.12,pz+.27,steel,.018);
    box(portalWidth-.42,.14,.27,r.x,4.34,pz+.27,index===1?amber:blue,.018);
    box(.82,.62,.10,r.x-portalWidth*.31,3.82,pz+.43,warmWhite,.035);
    box(.10,.38,.04,r.x-portalWidth*.36,3.82,pz+.495,dark,.008);
    for(let bar=0;bar<=index;bar++)box(.09,.32,.04,r.x-portalWidth*.25+bar*.14,3.82,pz+.495,blue,.008);
    for(const offset of [-1.32,1.32]) {
      const post=add(new THREE.CylinderGeometry(.055,.075,.88,9),steel,r.x+offset,.44,pz+2.25);
      post.name='terminal-gate-queue';
      add(new THREE.SphereGeometry(.085,9,6),dark,r.x+offset,.92,pz+2.25);
    }
    beam([r.x-1.32,.80,pz+2.25],[r.x+1.32,.80,pz+2.25],.022,index===1?amber:blue,7);
  }

  // A kinetic suspended artwork gives the marketplace a memorable heart. Its
  // coloured fins, luminous rings, and long suspension cables live safely
  // above both the ground court and four-metre gallery circulation.
  const market=airportTerrain.find(s=>s.kind==='airportMarketIsland');
  if(market) {
    const r=rect(market),artY=7.25;
    for(const offset of [-2.6,0,2.6])beam([r.x+offset,map.ceiling-.38,r.z],[r.x+offset,artY+.65,r.z],.025,steel,7);
    const colors=[mat('#ef6f55',.34,.28),mat('#e7b858',.34,.32),mat('#4fa6b8',.32,.34)];
    for(let i=0;i<3;i++) {
      const ring=add(new THREE.TorusGeometry(1.45+i*.42,.075,8,36),i===1?glow:colors[i],r.x,artY+i*.28,r.z);
      ring.rotation.set(Math.PI/2+i*.18,i*.35,0);ring.name='terminal-market-art';
      for(let fin=0;fin<7;fin++) {
        const a=fin*Math.PI*2/7+i*.31;
        const blade=box(.12,.72,.42,r.x+Math.cos(a)*(1.0+i*.34),artY-.15+i*.25,
          r.z+Math.sin(a)*(1.0+i*.34),colors[(fin+i)%3],.035);
        blade.rotation.y=-a;blade.rotation.z=(fin%2?1:-1)*.22;
      }
    }
  }

  // Restrained wayfinding: three large signs, each aligned with a genuine
  // processing threshold. Geometric marks stay crisp without texture text.
  const sign=(p,w,labelColor=amber)=>{
    const board=box(w,1.0,.12,p.x,5.80,p.z,dark,.07);board.name='terminal-wayfinding';
    box(w-.16,.10,.016,p.x,6.13,p.z+.068,blue,.008);
    for(let i=0;i<4;i++)box(w*.12,.065,.018,p.x-w*.26+i*w*.17,5.73,p.z+.072,i===0?labelColor:warmWhite,.006);
    beam([p.x-w*.34,6.3,p.z],[p.x-w*.34,map.ceiling-.45,p.z],.025,steel,7);
    beam([p.x+w*.34,6.3,p.z],[p.x+w*.34,map.ceiling-.45,p.z],.025,steel,7);
  };
  sign(site(.50,.87),4.4);sign(site(.50,.66),4.8,glow);sign(site(.50,.25),4.2);


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

  const planeX=center.x+8.5,planeZ=facadeZ-10.8;
  const airframe=mat('#e8ecee',.34,.31),airBlue=mat('#285e82',.34,.42),airGold=mat('#c69d54',.43,.38);
  const rubber=mat('#171d21',.88,.05),windowMat=mat('#102836',.17,.5),alloy=mat('#aab5ba',.3,.62);
  const aircraft=new THREE.Group();aircraft.position.set(planeX,0,planeZ);aircraft.rotation.y=-.11;group.add(aircraft);
  const planeAdd=(geometry,material,x,y,z)=>{
    const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;
    aircraft.add(mesh);return mesh;
  };
  const planeBox=(w,h,d,x,y,z,material=airframe,radius=.04)=>planeAdd(
    new RoundedBoxGeometry(w,h,d,2,Math.min(radius,w/4,h/4,d/4)),material,x,y,z);
  const planeBeam=(from,to,radius,material=alloy,segments=8)=>{
    const a=new THREE.Vector3(...from),b=new THREE.Vector3(...to),delta=b.clone().sub(a);
    const mesh=planeAdd(new THREE.CylinderGeometry(radius,radius,delta.length(),segments),material,
      (a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());return mesh;
  };
  const planeSpan=(from,to,width,height,material=alloy)=>{
    const a=new THREE.Vector3(...from),b=new THREE.Vector3(...to),delta=b.clone().sub(a);
    const mesh=planeAdd(new RoundedBoxGeometry(width,height,delta.length(),2,Math.min(.06,width/5,height/5)),material,
      (a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),delta.normalize());return mesh;
  };
  // A continuous lathed fuselage carries a closed tail cone, constant cabin,
  // long cockpit transition, and unmistakably closed forward radome.
  const profile=[[-9.55,0],[-8.8,.38],[-7.7,.76],[-6.4,.91],[5.7,.96],[7.0,.87],
    [8.15,.66],[8.85,.36],[9.55,0]].map(([along,radius])=>new THREE.Vector2(radius,along));
  const fuselage=planeAdd(new THREE.LatheGeometry(profile,36),airframe,0,2.3,0);
  fuselage.rotation.z=-Math.PI/2;fuselage.name='terminal-aircraft-fuselage';

  const trianglePrism=(points,thickness,material,y)=>{
    const positions=[];for(const [x,z] of points)positions.push(x,thickness/2,z);
    for(const [x,z] of points)positions.push(x,-thickness/2,z);
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setIndex([0,1,2,3,5,4,0,3,4,0,4,1,1,4,5,1,5,2,2,5,3,2,3,0]);
    geometry.computeVertexNormals();return planeAdd(geometry,material,0,y,0);
  };
  const verticalTail=(points,thickness,material)=>{
    const positions=[];for(const [x,y] of points)positions.push(x,y,thickness/2);
    for(const [x,y] of points)positions.push(x,y,-thickness/2);
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setIndex([0,2,1,3,4,5,0,1,4,0,4,3,1,2,5,1,5,4,2,0,3,2,3,5]);
    geometry.computeVertexNormals();return planeAdd(geometry,material,0,0,0);
  };
  const wingMat=airframe.clone();wingMat.side=THREE.DoubleSide;
  trianglePrism([[2.4,.55],[-3.9,.68],[-1.9,7.5]],.15,wingMat,2.16).name='terminal-aircraft-wing';
  trianglePrism([[2.4,-.55],[-3.9,-.68],[-1.9,-7.5]],.15,wingMat,2.16).name='terminal-aircraft-wing';
  const tailMat=airBlue.clone();tailMat.side=THREE.DoubleSide;
  trianglePrism([[-6.6,.48],[-8.8,.52],[-7.55,3.15]],.12,tailMat,2.72);
  trianglePrism([[-6.6,-.48],[-8.8,-.52],[-7.55,-3.15]],.12,tailMat,2.72);
  verticalTail([[-8.7,2.43],[-5.9,2.52],[-7.8,5.25]],.16,tailMat);

  // Passenger windows and doors follow the broad cabin. Four swept cockpit
  // panes wrap around the forward taper so the direction reads immediately.
  for(let i=0;i<12;i++)for(const side of [-1,1])
    planeBox(.34,.23,.035,-5.65+i*.91,2.58,side*.935,windowMat,.055);
  for(const x of [-5.95,5.65])for(const side of [-1,1])
    planeBox(.58,1.05,.04,x,2.25,side*.945,airBlue,.09);
  for(const side of [-1,1])for(const x of [7.45,8.02]) {
    const cockpit=planeBox(.62,.34,.045,x,2.62,side*(x>7.8?.53:.70),windowMat,.08);
    cockpit.rotation.y=side*(x>7.8?.48:.28);
  }
  const radomeSeam=planeAdd(new THREE.TorusGeometry(.37,.018,6,28),alloy,8.82,2.3,0);
  radomeSeam.rotation.y=Math.PI/2;radomeSeam.name='terminal-aircraft-radome';
  for(const side of [-1,1])planeBox(11.7,.10,.028,-.35,2.20,side*.965,airGold,.018);

  // Tapered nacelles, intake lips, visible fans, pylons, and landing gear make
  // the aircraft hold up when viewed closely through the curtain wall.
  for(const side of [-1,1]) {
    const z=side*3.15;
    planeSpan([-.65,2.13,side*2.35],[-.35,1.55,z],.18,.20,alloy);
    const nacelle=planeAdd(new THREE.CylinderGeometry(.58,.47,2.25,24),airBlue,-.15,1.32,z);
    nacelle.rotation.z=-Math.PI/2;nacelle.name='terminal-aircraft-engine';
    const intake=planeAdd(new THREE.TorusGeometry(.57,.085,8,28),alloy,.99,1.32,z);intake.rotation.y=Math.PI/2;
    const fan=planeAdd(new THREE.CircleGeometry(.47,24),rubber,1.015,1.32,z);fan.rotation.y=Math.PI/2;
    for(let blade=0;blade<10;blade++) {
      const a=blade*Math.PI/5;
      planeBeam([1.03,1.32,z],[1.035,1.32+Math.cos(a)*.38,z+Math.sin(a)*.38],.018,alloy,5);
    }
  }
  for(const [x,z] of [[-2.1,-1.15],[-2.1,1.15],[6.4,0]]) {
    planeBeam([x,1.65,z],[x,.43,z],.045,alloy,8);
    const wheel=planeAdd(new THREE.CylinderGeometry(.24,.24,.17,14),rubber,x,.27,z);
    wheel.rotation.x=Math.PI/2;wheel.name='terminal-aircraft-wheel';
    planeAdd(new THREE.CylinderGeometry(.10,.10,.18,12),alloy,x,.27,z).rotation.x=Math.PI/2;
  }
  // Articulated jet bridge visibly connects the terminal to the aircraft.
  aircraft.updateMatrixWorld(true);
  const bridgeStart=site(.68,0),bridgeEnd=aircraft.localToWorld(new THREE.Vector3(5.55,2.9,.98));
  const bridgeA=[bridgeStart.x,2.9,facadeZ-.12],bridgeB=[bridgeEnd.x,bridgeEnd.y,bridgeEnd.z];
  const bridgeShell=spanBox(bridgeA,bridgeB,1.62,1.55,warmWhite);bridgeShell.name='terminal-jet-bridge';
  spanBox([bridgeA[0],bridgeA[1]-.69,bridgeA[2]],[bridgeB[0],bridgeB[1]-.69,bridgeB[2]],1.72,.18,dark);
  const aVector=new THREE.Vector3(...bridgeA),bVector=new THREE.Vector3(...bridgeB);
  const bridgeDirection=bVector.clone().sub(aVector).setY(0).normalize();
  const bridgeNormal=new THREE.Vector3(-bridgeDirection.z,0,bridgeDirection.x);
  const windowAngle=Math.atan2(bridgeNormal.x,bridgeNormal.z);
  for(const t of [.12,.28,.44,.60,.76,.92]) {
    const p=aVector.clone().lerp(bVector,t).addScaledVector(bridgeNormal,.82);
    const window=box(.42,.46,.035,p.x,p.y+.15,p.z,glass,.015);window.rotation.y=windowAngle;
  }

  // A functioning apron beyond the glass: stand lead-in markings, service
  // traffic, baggage dollies, light masts, a remote concourse, control tower,
  // runway, and a second aircraft create several layers of visible activity.
  const yellow=mat('#e5c95c',.62,.06),roadWhite=mat('#d9e0df',.68,.04);
  for(let z=facadeZ-2;z>facadeZ-20;z-=1.7)
    box(.14,.018,.92,planeX+9.8,.004,z,yellow,.004);
  for(const offset of [-5.8,5.8]) {
    box(.10,.019,16,planeX+offset,.005,facadeZ-10.8,roadWhite,.004).rotation.y=.02*offset;
    for(const end of [-1,1])box(2.2,.019,.10,planeX+offset,.006,facadeZ-10.8+end*7.8,yellow,.004);
  }

  const localBox=(parent,w,h,d,x,y,z,material,radius=.03)=>{
    const mesh=new THREE.Mesh(new RoundedBoxGeometry(w,h,d,2,Math.min(radius,w/4,h/4,d/4)),material);
    mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
  };
  const serviceVehicle=(x,z,color,yaw=0,scale=1)=>{
    const vehicle=new THREE.Group();vehicle.position.set(x,0,z);vehicle.rotation.y=yaw;vehicle.scale.setScalar(scale);group.add(vehicle);
    const paint=mat(color,.48,.26);
    localBox(vehicle,2.25,.62,1.02,0,.55,0,paint,.10);
    localBox(vehicle,.82,.72,.94,.62,1.03,0,warmWhite,.10);
    localBox(vehicle,.68,.34,.025,.72,1.08,.485,windowMat,.055);
    for(const wx of [-.72,.72])for(const wz of [-.49,.49]) {
      const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.22,.22,.16,12),rubber);
      wheel.position.set(wx,.25,wz);wheel.rotation.x=Math.PI/2;vehicle.add(wheel);
    }
    return vehicle;
  };
  serviceVehicle(center.x-width*.29,facadeZ-7.2,'#e1b74f',-.18,.82);
  serviceVehicle(center.x-width*.19,facadeZ-15.8,'#4c87a8',.12,.72);
  serviceVehicle(center.x+width*.40,facadeZ-18.0,'#d8dadd',-.08,.9);

  const baggageTrain=(x,z,yaw=0)=>{
    const train=new THREE.Group();train.position.set(x,0,z);train.rotation.y=yaw;group.add(train);
    for(let cart=0;cart<4;cart++) {
      const cx=(cart-1.5)*1.55;
      localBox(train,1.25,.12,.72,cx,.28,0,steel,.025);
      localBox(train,.82,.55,.58,cx,.61,0,cart%2?airBlue:mat('#9b604b',.7,.08),.08);
      for(const wz of [-.34,.34]) {
        const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.12,.12,.10,10),rubber);
        wheel.position.set(cx,.16,wz);wheel.rotation.x=Math.PI/2;train.add(wheel);
      }
      if(cart<3)localBox(train,.30,.045,.045,cx+.77,.27,0,alloy,.01);
    }
  };
  baggageTrain(center.x-width*.35,facadeZ-12.2,.08);
  baggageTrain(center.x+width*.30,facadeZ-6.0,-.12);

  for(const x of [center.x-width*.43,center.x-width*.08,center.x+width*.28,center.x+width*.48]) {
    beam([x,0,facadeZ-21],[x,7.2,facadeZ-21],.075,steel,9);
    box(1.7,.13,.28,x,7.2,facadeZ-21,dark,.025);
    for(const offset of [-.55,0,.55])box(.34,.055,.20,x+offset,7.12,facadeZ-20.84,glow,.012);
  }

  const runwayMaterial=mat('#303a40',.98,.02);
  const runway=new THREE.Mesh(new THREE.PlaneGeometry(width+48,12),runwayMaterial);
  runway.rotation.x=-Math.PI/2;runway.position.set(center.x,-.035,facadeZ-30);runway.receiveShadow=true;group.add(runway);
  for(let x=center.x-width/2-18;x<center.x+width/2+18;x+=6.2)
    box(3.0,.022,.16,x,-.005,facadeZ-30,roadWhite,.003);
  for(const side of [-1,1])for(let x=center.x-width/2-20;x<center.x+width/2+20;x+=3.1)
    add(new THREE.CylinderGeometry(.035,.05,.06,7),side>0?amber:glow,x,.01,facadeZ-30+side*5.2);

  // Distant concourse and tower provide a believable airport horizon rather
  // than allowing the scene background to begin immediately after the runway.
  box(width*.72,4.8,2.6,center.x-width*.12,2.4,facadeZ-38,service,.12);
  box(width*.70,.75,2.9,center.x-width*.12,5.0,facadeZ-38,dark,.10);
  for(let x=center.x-width*.46;x<center.x+width*.23;x+=2.3)
    box(1.25,1.55,.035,x,3.15,facadeZ-36.68,glass,.035);
  const towerX=center.x+width*.39;
  add(new THREE.CylinderGeometry(.45,.68,7.2,14),service,towerX,3.6,facadeZ-37);
  add(new THREE.CylinderGeometry(1.5,1.22,1.25,12),windowMat,towerX,7.45,facadeZ-37);
  add(new THREE.CylinderGeometry(1.68,1.68,.18,14),dark,towerX,8.12,facadeZ-37);
  beam([towerX,8.2,facadeZ-37],[towerX,10.2,facadeZ-37],.035,steel,7);
  add(new THREE.SphereGeometry(.10,9,6),amber,towerX,10.28,facadeZ-37);

  // A second, lower-detail aircraft is deliberately farther away; its shape
  // and scale add depth without competing with the gate aircraft.
  const remote=new THREE.Group();remote.position.set(center.x-width*.30,1.25,facadeZ-28.2);remote.rotation.y=.20;group.add(remote);
  const remoteProfile=[[-5.8,0],[-5.1,.34],[-4.2,.56],[3.7,.58],[5.0,.34],[5.7,0]]
    .map(([along,radius])=>new THREE.Vector2(radius,along));
  const remoteBody=new THREE.Mesh(new THREE.LatheGeometry(remoteProfile,20),warmWhite);
  remoteBody.rotation.z=-Math.PI/2;remoteBody.castShadow=true;remote.add(remoteBody);
  localBox(remote,5.4,.10,5.2,-.45,-.04,0,warmWhite,.035).rotation.y=-.08;
  localBox(remote,.12,1.65,1.9,-4.7,.85,0,airBlue,.035);
  for(let i=0;i<7;i++)for(const side of [-1,1])localBox(remote,.22,.13,.025,-3+i*.78,.2,side*.57,windowMat,.025);

  // The landside wall now ends in real arrival vestibules rather than five
  // loading-bay doors. Deep reveals, paired automatic leaves, transoms,
  // sensors, bollards, and entrance mats establish the public front door.
  const southZ=site(0,1).z;
  for(const u of [.235,.765]) {
    const p=site(u,1),portalWidth=7.8;
    const vestibule=box(.46,4.25,.44,p.x-portalWidth/2,2.13,southZ-.15,dark,.065);
    vestibule.name='terminal-entrance-vestibule';
    box(.46,4.25,.44,p.x+portalWidth/2,2.13,southZ-.15,dark,.065);
    box(portalWidth,.46,.44,p.x,4.02,southZ-.15,dark,.065);
    box(portalWidth-.48,3.48,.12,p.x,1.78,southZ-.42,glass,.025);
    for(const x of [p.x-portalWidth*.25,p.x,p.x+portalWidth*.25])
      box(.11,3.30,.20,x,1.70,southZ-.48,steel,.016);
    box(portalWidth-.5,.13,.28,p.x,.13,southZ-.50,steel,.018);
    box(portalWidth-.42,.17,.31,p.x,3.67,southZ-.50,glow,.018);
    box(1.1,.15,.22,p.x,3.94,southZ-.52,dark,.025);
    add(new THREE.SphereGeometry(.08,10,7),amber,p.x,3.94,southZ-.66).name='terminal-door-sensor';
    box(portalWidth-1.0,.028,2.15,p.x,.016,southZ-1.35,mat('#59676d',.96,.02),.008);
    for(const side of [-1,1]) {
      add(new THREE.CylinderGeometry(.09,.12,.82,10),steel,p.x+side*(portalWidth/2+.48),.41,southZ-.88);
      box(.20,.08,.20,p.x+side*(portalWidth/2+.48),.84,southZ-.88,blue,.025);
    }
  }

  // One industrial opening remains where it belongs: beside the western
  // baggage room. Its visual language is deliberately different from the
  // glazed passenger entrances.
  const serviceDoor=site(.085,1);
  const loading=box(5.6,3.05,.16,serviceDoor.x,1.53,southZ-.16,dark,.04);
  loading.name='terminal-service-door';
  for(let y=.28;y<2.86;y+=.38)box(5.15,.06,.04,serviceDoor.x,y,southZ-.27,service,.008);
  for(const side of [-1,1])box(.13,3.18,.26,serviceDoor.x+side*2.86,1.59,southZ-.22,amber,.018);
  box(5.85,.14,.27,serviceDoor.x,3.18,southZ-.22,dark,.02);

  // Repeated wall bays and linear lights give the landside elevation a
  // measured structural cadence. They are surface-mounted on the existing
  // boundary, so visual and physical geometry remain in agreement.
  for(const u of [.02,.18,.31,.42,.58,.69,.82,.98]) {
    const p=site(u,1);
    box(.32,5.25,.34,p.x,2.63,southZ-.18,steel,.045).name='terminal-wall-bay';
    box(.54,.16,.48,p.x,5.22,southZ-.22,dark,.025);
  }
  for(const [a,b] of [[.18,.31],[.31,.39],[.43,.49],[.51,.57],[.61,.69],[.82,.98]]) {
    const pa=site(a,1),pb=site(b,1);
    box(Math.max(.5,pb.x-pa.x-.35),.075,.20,(pa.x+pb.x)/2,4.72,southZ-.44,glow,.012);
  }

  group.name='terminal-7-environment';
  return group;
}
