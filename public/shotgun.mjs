import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';

const CHAMBER_BURST_DURATION=0.26;

export function createShotgun(skinKey, length) {
  // Keep the original numeric-only call working for older clients/tests.
  if(typeof skinKey==='number') { length=skinKey;skinKey='shotgun_default'; }
  const silver=skinKey==='shotgun_silverline';
  const bubbleTrouble=skinKey==='shotgun_bubble_trouble';
  const group=new THREE.Group();group.scale.setScalar(length);group.userData.skinKey=skinKey;
  const mat=(color,metalness=0.15,roughness=0.48)=>new THREE.MeshStandardMaterial({color,metalness,roughness});
  const polished=silver?new THREE.MeshPhysicalMaterial({
    // A fully metallic surface needs an environment map and otherwise reflects
    // the scene's black environment. Retain enough diffuse response to stay
    // visibly silver beneath the game's room and first-person lights.
    color:'#9aa5aa',metalness:0.68,roughness:0.17,clearcoat:0.9,clearcoatRoughness:0.055,
    emissive:'#20272a',emissiveIntensity:0.035,
  }):null;
  const steel=polished||mat('#384650',0.75);
  const furniture=silver?mat('#879399',0.6,0.18):mat('#895637');
  const dark=mat(silver?'#20282d':'#17212a',silver?0.78:0.15,silver?0.22:0.48);
  const accent=mat(silver?'#c4cdd1':'#dfae70',silver?0.62:0.6,silver?0.13:0.48);
  const add=(geometry,material,x,y,z,name)=>{
    const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);mesh.name=name;
    mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);return mesh;
  };
  const box=(w,h,d,x,y,z,m,name)=>add(new RoundedBoxGeometry(w,h,d,2,Math.min(0.025,w/4,h/4,d/4)),m,x,y,z,name);
  const softBox=(w,h,d,x,y,z,m,name)=>add(
    new RoundedBoxGeometry(w,h,d,7,Math.min(0.048,w*0.32,h*0.42,d*0.32)),m,x,y,z,name);
  const stadiumTaper=(backWidth,backHeight,frontWidth,frontHeight,depth,x,y,z,material,name)=>{
    // A stadium is a wide rectangle capped by an exact semicircle on each
    // side. Keeping those caps through the taper gives Silverline its broad,
    // double-barrel silhouette without turning the whole body into an oval.
    const width=Math.max(backWidth,frontWidth),height=Math.max(backHeight,frontHeight),radius=height/2;
    const left=-width/2,right=width/2,bottom=-height/2,top=height/2;
    const shape=new THREE.Shape();
    shape.moveTo(left+radius,bottom);shape.lineTo(right-radius,bottom);
    shape.absarc(right-radius,0,radius,-Math.PI/2,Math.PI/2,false);
    shape.lineTo(left+radius,top);
    shape.absarc(left+radius,0,radius,Math.PI/2,Math.PI*1.5,false);
    const bevel=Math.min(0.004,depth*0.025);
    const geometry=new THREE.ExtrudeGeometry(shape,{depth,steps:1,curveSegments:12,bevelEnabled:true,
      bevelSegments:3,bevelSize:bevel,bevelThickness:bevel});
    geometry.translate(0,0,-depth/2);
    const position=geometry.attributes.position;
    for(let i=0;i<position.count;i++) {
      const t=THREE.MathUtils.clamp((depth/2-position.getZ(i))/depth,0,1);
      position.setX(i,position.getX(i)*THREE.MathUtils.lerp(backWidth,frontWidth,t)/width);
      position.setY(i,position.getY(i)*THREE.MathUtils.lerp(backHeight,frontHeight,t)/height);
    }
    position.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
    return add(geometry,material,x,y,z,name);
  };
  const roundedRect=(w,h,d,r,x,y,z,material,name)=>{
    const shape=new THREE.Shape(),left=-w/2,right=w/2,bottom=-h/2,top=h/2;
    shape.moveTo(left+r,bottom);shape.lineTo(right-r,bottom);shape.quadraticCurveTo(right,bottom,right,bottom+r);
    shape.lineTo(right,top-r);shape.quadraticCurveTo(right,top,right-r,top);shape.lineTo(left+r,top);
    shape.quadraticCurveTo(left,top,left,top-r);shape.lineTo(left,bottom+r);shape.quadraticCurveTo(left,bottom,left+r,bottom);
    const bevel=Math.min(0.003,d*0.18);
    const geometry=new THREE.ExtrudeGeometry(shape,{depth:d,steps:1,curveSegments:8,bevelEnabled:true,
      bevelSegments:3,bevelSize:bevel,bevelThickness:bevel});
    geometry.translate(0,0,-d/2);geometry.computeVertexNormals();
    return add(geometry,material,x,y,z,name);
  };
  const roundedFrame=(w,h,d,r,innerWidth,innerHeight,innerRadius,x,y,z,material,name)=>{
    const left=-w/2,right=w/2,bottom=-h/2,top=h/2;
    const shape=new THREE.Shape();
    shape.moveTo(left+r,bottom);shape.lineTo(right-r,bottom);shape.quadraticCurveTo(right,bottom,right,bottom+r);
    shape.lineTo(right,top-r);shape.quadraticCurveTo(right,top,right-r,top);shape.lineTo(left+r,top);
    shape.quadraticCurveTo(left,top,left,top-r);shape.lineTo(left,bottom+r);shape.quadraticCurveTo(left,bottom,left+r,bottom);
    const il=-innerWidth/2,ir=innerWidth/2,ib=-innerHeight/2,it=innerHeight/2;
    const hole=new THREE.Path();
    // Wind the inner contour in the opposite direction so the center is truly
    // open when viewed directly from behind.
    hole.moveTo(il+innerRadius,ib);hole.quadraticCurveTo(il,ib,il,ib+innerRadius);
    hole.lineTo(il,it-innerRadius);hole.quadraticCurveTo(il,it,il+innerRadius,it);hole.lineTo(ir-innerRadius,it);
    hole.quadraticCurveTo(ir,it,ir,it-innerRadius);hole.lineTo(ir,ib+innerRadius);
    hole.quadraticCurveTo(ir,ib,ir-innerRadius,ib);hole.lineTo(il+innerRadius,ib);
    shape.holes.push(hole);
    const bevel=Math.min(0.004,d*0.15);
    const geometry=new THREE.ExtrudeGeometry(shape,{depth:d,steps:1,curveSegments:10,bevelEnabled:true,
      bevelSegments:3,bevelSize:bevel,bevelThickness:bevel});
    geometry.translate(0,0,-d/2);geometry.computeVertexNormals();
    return add(geometry,material,x,y,z,name);
  };
  const moldedPanel=(radius,depth,x,y,z,centerAngle,arc,material,name,edgeName=`${name}-seam`)=>{
    // CylinderGeometry is built along Y. Rotate it into the barrel axis to
    // create a true curved armor skin instead of a rounded box floating beside
    // a round chamber. Thin end bands and edge rails give the shell thickness.
    const start=centerAngle-arc/2;
    const shell=add(new THREE.CylinderGeometry(radius,radius,depth,18,1,true,
      start+Math.PI/2,arc),material,x,y,z,name);
    shell.rotation.x=Math.PI/2;
    shell.userData.molded=true;
    for(const end of [-1,1]) {
      const cap=add(new THREE.TorusGeometry(radius,0.0045,5,18,arc),material,
        x,y,z+end*depth/2,`${name}-end-cap`);
      cap.rotation.z=start;
    }
    for(const angle of [start,start+arc]) {
      const rail=add(new THREE.CylinderGeometry(0.0045,0.0045,depth,6),material,
        x+Math.cos(angle)*radius,y+Math.sin(angle)*radius,z,edgeName);
      rail.rotation.x=Math.PI/2;
    }
    return shell;
  };
  if(bubbleTrouble) {
    const pearl=new THREE.MeshPhysicalMaterial({color:'#7896a2',metalness:0.56,roughness:0.15,
      clearcoat:1,clearcoatRoughness:0.04,emissive:'#10242c',emissiveIntensity:0.035});
    const chassis=new THREE.MeshPhysicalMaterial({color:'#071f30',metalness:0.58,roughness:0.14,
      clearcoat:1,clearcoatRoughness:0.035,emissive:'#03101b',emissiveIntensity:0.08});
    const navy=mat('#061426',0.62,0.17);
    const aquaGlow=new THREE.MeshStandardMaterial({color:'#27f2ed',emissive:'#00aeba',emissiveIntensity:1.05,
      metalness:0.18,roughness:0.2});
    const violetGlow=new THREE.MeshStandardMaterial({color:'#b84df4',emissive:'#721bb0',emissiveIntensity:1.05,
      metalness:0.18,roughness:0.2});
    const aquaGlass=new THREE.MeshPhysicalMaterial({color:'#007d95',transparent:true,opacity:0.58,depthWrite:false,
      metalness:0.08,roughness:0.06,clearcoat:1,clearcoatRoughness:0.025,emissive:'#00596a',emissiveIntensity:0.13});
    const violetGlass=new THREE.MeshPhysicalMaterial({color:'#58209d',transparent:true,opacity:0.58,depthWrite:false,
      metalness:0.08,roughness:0.06,clearcoat:1,clearcoatRoughness:0.025,emissive:'#35105b',emissiveIntensity:0.13});
    const aquaArmor=new THREE.MeshPhysicalMaterial({color:'#009cae',emissive:'#005665',emissiveIntensity:0.28,
      metalness:0.5,roughness:0.16,clearcoat:0.9,clearcoatRoughness:0.08});
    const violetArmor=new THREE.MeshPhysicalMaterial({color:'#7430bb',emissive:'#3d1268',emissiveIntensity:0.3,
      metalness:0.5,roughness:0.16,clearcoat:0.9,clearcoatRoughness:0.08});

    stadiumTaper(0.245,0.15,0.19,0.116,0.38,0,-0.022,-0.24,chassis,'receiver');
    softBox(0.19,0.047,0.31,0,-0.086,-0.25,navy,'receiver-inset');
    // Tiny recessed portholes keep the dark chassis thematic without covering
    // it in another competing accent color.
    for(const side of [-1,1])for(const [z,halfWidth] of [[-0.16,0.1145],[-0.24,0.109],[-0.32,0.103]]) {
      const dimple=add(new THREE.CircleGeometry(0.0085,14),navy,
        side*(halfWidth+0.002),-0.022,z,'bubble-dimple');
      dimple.rotation.y=side*Math.PI/2;
      const rim=add(new THREE.TorusGeometry(0.009,0.0018,5,14),pearl,
        side*(halfWidth+0.0025),-0.022,z,'bubble-dimple-rim');
      rim.rotation.y=side*Math.PI/2;
    }
    const chamberDepth=0.65;
    for(const [index,side] of [-1,1].entries()) {
      const glass=index===0?aquaGlass:violetGlass,glow=index===0?aquaGlow:violetGlow;
      const chamber=add(new THREE.CylinderGeometry(0.056,0.056,chamberDepth,24,1,true),glass,
        side*0.062,-0.012,-0.68,'bubble-chamber');
      chamber.rotation.x=Math.PI/2;chamber.renderOrder=2;
      Object.assign(chamber.userData,{barrelIndex:index,baseOpacity:glass.opacity,
        baseEmissiveIntensity:glass.emissiveIntensity,baseEmissive:glass.emissive.clone(),
        baseColor:glass.color.clone(),burstEmissive:new THREE.Color(index===0?'#00ffff':'#d038ff'),
        burstColor:new THREE.Color(index===0?'#21dce2':'#b54ce0')});
      const coilPoints=Array.from({length:41},(_,i)=>{
        // One relaxed stream is legible through the glass; the former
        // four-turn coil fought visually with all the drifting bubbles.
        const t=i/40,turn=t*Math.PI*2.5+index*Math.PI;
        return new THREE.Vector3(Math.cos(turn)*0.021,Math.sin(turn)*0.021,0.3-t*0.6);
      });
      const core=add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coilPoints),48,0.0045,6,false),glow,
        side*0.062,-0.012,-0.68,'energy-core');
      Object.assign(core.userData,{phase:index*Math.PI,direction:side,barrelIndex:index});

      // Reusable additive meshes provide the per-shot reactor surge without
      // allocating particles at fire rate or involving the server.
      const burstMaterial=new THREE.MeshBasicMaterial({color:index===0?'#2fffff':'#d23fff',transparent:true,
        opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false});
      const burst=add(new THREE.SphereGeometry(0.041,12,8),burstMaterial,
        side*0.062,-0.012,-0.4,'chamber-energy-burst');
      burst.visible=false;burst.renderOrder=4;
      Object.assign(burst.userData,{barrelIndex:index,burstAt:-Infinity});
      const ringMaterial=burstMaterial.clone();
      ringMaterial.color.set(index===0?'#70ffff':'#ee76ff');
      const burstRing=add(new THREE.TorusGeometry(0.039,0.008,6,18),ringMaterial,
        side*0.062,-0.012,-0.4,'chamber-energy-ring');
      burstRing.visible=false;burstRing.renderOrder=4;
      Object.assign(burstRing.userData,{barrelIndex:index,burstAt:-Infinity});
      const hotMaterial=burstMaterial.clone();
      hotMaterial.color.set(index===0?'#e9ffff':'#ffeaff');
      const hotCore=add(new THREE.SphereGeometry(0.018,10,7),hotMaterial,
        side*0.062,-0.012,-0.4,'chamber-energy-hot-core');
      hotCore.visible=false;hotCore.renderOrder=5;
      Object.assign(hotCore.userData,{barrelIndex:index,burstAt:-Infinity});
      const washMaterial=burstMaterial.clone();
      washMaterial.color.set(index===0?'#00ffff':'#c02fff');
      const wash=add(new THREE.CylinderGeometry(0.051,0.051,0.6,18,1,true),washMaterial,
        side*0.062,-0.012,-0.69,'chamber-energy-wash');
      wash.rotation.x=Math.PI/2;wash.visible=false;wash.renderOrder=3;
      Object.assign(wash.userData,{barrelIndex:index,burstAt:-Infinity});
      const armor=index===0?aquaArmor:violetArmor;
      add(new THREE.TorusGeometry(0.057,0.009,8,24),armor,
        side*0.062,-0.012,-0.37,'reactor-interface-collar');
      add(new THREE.TorusGeometry(0.057,0.008,8,24),pearl,
        side*0.062,-0.012,-0.995,'chamber-collar');
      // The chroma armor is molded around the circular glass, leaving broad
      // windows visible rather than looking like flat plates glued on top.
      moldedPanel(0.067,0.52,side*0.062,-0.012,-0.69,side<0?Math.PI:0,2.16,
        armor,'chroma-shroud','chamber-guard');
      // The receiver repeats the same wraparound language on its rounded side
      // caps, visually blending the chambers into the action behind them.
      moldedPanel(0.081,0.255,side*0.0475,-0.022,-0.235,side<0?Math.PI:0,1.46,
        armor,'receiver-chroma-panel');
      for(let i=0;i<5;i++) {
        const radius=0.0065+(i%3)*0.0023;
        const bubbleMaterial=new THREE.MeshBasicMaterial({color:index===0?'#69f8ff':'#d38cff',transparent:true,
          opacity:0.82,depthWrite:false});
        const sphere=add(new THREE.SphereGeometry(radius,10,7),bubbleMaterial,
          side*0.062+(i%2?0.012:-0.011),0.012+(i%3)*0.008,-0.405-i*0.126,'floating-bubble');
        Object.assign(sphere.userData,{baseX:sphere.position.x,baseY:sphere.position.y,baseZ:sphere.position.z,
          phase:i*1.37+index*0.71,side,barrelIndex:index,baseOpacity:bubbleMaterial.opacity});
        sphere.renderOrder=3;
      }
      const bore=add(new THREE.CircleGeometry(0.03,24),navy,side*0.062,-0.012,-1.014,'muzzle-bore');
      bore.rotation.y=Math.PI;
      add(new THREE.TorusGeometry(0.035,0.008,8,24),armor,side*0.062,-0.012,-1.012,'barrel-rim');
    }
    softBox(0.15,0.018,0.052,0,0.055,-0.415,navy,'reactor-bridge');
    // Two restrained pressure windows summarize the whole skin at a glance:
    // cyan system on the left, violet system on the right.
    for(const [side,glow] of [[-1,aquaGlow],[1,violetGlow]]) {
      const port=add(new THREE.TorusGeometry(0.021,0.004,6,18),pearl,
        side*0.038,0.066,-0.255,'reactor-port');
      port.rotation.x=Math.PI/2;
      const window=add(new THREE.CircleGeometry(0.017,18),glow,
        side*0.038,0.067,-0.255,'status-light');
      window.rotation.x=-Math.PI/2;
    }

    const pump=new THREE.Group();pump.name='pump';group.add(pump);
    const pumpPanel=softBox(0.17,0.044,0.285,0,-0.086,-0.63,navy,'pump-inset');pump.attach(pumpPanel);
    for(const [side,material] of [[-1,aquaArmor],[1,violetArmor]]) {
      const wing=softBox(0.071,0.056,0.255,side*0.054,-0.095,-0.63,material,'pump-wing');
      pump.attach(wing);
    }
    for(const [side,material,phase] of [[-1,aquaGlow,0],[1,violetGlow,0.5]]) {
      const trim=softBox(0.012,0.018,0.59,side*0.122,0.006,-0.67,material,'reactor-trim');
      Object.assign(trim.userData,{phase,
        colorA:new THREE.Color(side<0?'#009cab':'#7430b7'),
        colorB:new THREE.Color(side<0?'#25d7d7':'#a64bdf')});
      const rail=softBox(0.035,0.035,0.3,side*0.067,-0.034,0.073,
        side<0?aquaArmor:violetArmor,'stock-rail');rail.rotation.x=-0.08;
    }
    roundedFrame(0.185,0.145,0.038,0.05,0.105,0.066,0.022,0,-0.045,0.232,chassis,'rear-handle-loop');
    const grip=softBox(0.084,0.18,0.07,0,-0.155,0.235,navy,'rear-handle');grip.rotation.x=-0.28;
    softBox(0.09,0.034,0.076,0,-0.237,0.26,pearl,'rear-handle-heel').rotation.x=-0.28;
    softBox(0.062,0.016,0.69,0,0.063,-0.55,pearl,'pearl-sight-rib');
    softBox(0.012,0.052,0.1,0.112,-0.005,-0.225,navy,'ejection-port');
    softBox(0.025,0.033,0.03,0,0.072,-0.975,pearl,'front-bead');
    group.userData.pump=pump;
    return group;
  }
  if(silver) {
    // Silverline's wider shell encloses two side-by-side barrels. Its broad
    // faces stay flat while both sides terminate in clean semicircular caps.
    stadiumTaper(0.25,0.145,0.225,0.13,0.38,0,-0.025,-0.24,steel,'receiver');
    stadiumTaper(0.225,0.13,0.17,0.098,0.64,0,-0.012,-0.69,steel,'barrel-shroud');

    const pump=new THREE.Group();pump.name='pump';group.add(pump);
    const pumpPanel=softBox(0.195,0.038,0.3,0,-0.083,-0.62,furniture,'pump-inset');pump.attach(pumpPanel);

    // A slim open stock keeps the rear silhouette airy instead of forming a
    // second large block behind the action.
    for(const side of [-1,1]) {
      const rail=softBox(0.038,0.038,0.29,side*0.068,-0.035,0.075,steel,'stock-rail');
      rail.rotation.x=-0.08;
      softBox(0.01,0.045,0.44,side*0.121,-0.025,-0.37,dark,'silver-seam');
    }
    // The rear is a hollow, camera-facing handle instead of a solid blunt
    // plate, so the negative space remains obvious in first person.
    roundedFrame(0.19,0.15,0.04,0.052,0.108,0.068,0.023,0,-0.045,0.232,dark,'rear-handle-loop');
    const rearHandle=softBox(0.086,0.18,0.07,0,-0.158,0.238,dark,'rear-handle');
    rearHandle.rotation.x=-0.28;
    const handleHeel=softBox(0.092,0.035,0.077,0,-0.239,0.263,furniture,'rear-handle-heel');
    handleHeel.rotation.x=-0.28;
    const handleMount=softBox(0.105,0.045,0.09,0,-0.08,0.225,steel,'rear-handle-mount');
    handleMount.rotation.x=-0.16;
    softBox(0.055,0.016,0.72,0,0.058,-0.54,accent,'silver-sight-rib');
    softBox(0.012,0.055,0.105,0.111,-0.008,-0.225,dark,'ejection-port');
    softBox(0.062,0.027,0.05,0,0.083,-0.35,dark,'silver-rear-sight');
    softBox(0.025,0.035,0.032,0,0.07,-0.96,accent,'front-bead');

    // The muzzle repeats that exact stadium outline, then exposes two distinct
    // barrel mouths instead of disguising them behind one opening.
    roundedRect(0.17,0.098,0.02,0.049,0,-0.012,-1.001,accent,'silver-muzzle-ring');
    roundedRect(0.15,0.078,0.012,0.039,0,-0.012,-1.013,dark,'muzzle-recess');
    for(const side of [-1,1]) {
      const rim=add(new THREE.RingGeometry(0.027,0.034,24),accent,side*0.043,-0.012,-1.021,'barrel-rim');
      rim.rotation.y=Math.PI;
      const bore=add(new THREE.CircleGeometry(0.027,24),dark,side*0.043,-0.012,-1.023,'muzzle-bore');
      bore.rotation.y=Math.PI;
    }
    group.userData.pump=pump;
    return group;
  }

  box(0.19,0.2,0.32,0,-0.04,-0.22,steel,'receiver');
  const stock=box(0.15,0.2,0.28,0,-0.08,0.06,furniture,'stock');stock.rotation.x=-0.15;
  box(0.16,0.22,0.035,0,-0.06,0.2,dark,'butt-pad');
  for(const [y,r,start,end,name] of [[0,0.047,-0.35,-1,'barrel'],[-0.105,0.037,-0.34,-0.91,'magazine-tube']]) {
    const tube=add(new THREE.CylinderGeometry(r,r,start-end,12),steel,0,y,(start+end)/2,name);
    tube.rotation.x=Math.PI/2;
  }
  const pump=new THREE.Group();pump.name='pump';group.add(pump);
  const grip=box(0.17,0.135,0.28,0,-0.10,-0.60,furniture,'pump-grip');pump.attach(grip);
  for(let i=0;i<6;i++) {
    const rib=box(0.18,0.145,0.015,0,-0.1,-0.48-i*0.045,dark,'pump-rib');pump.attach(rib);
  }
  box(0.014,0.07,0.11,0.101,-0.01,-0.23,dark,'ejection-port');
  box(0.03,0.04,0.04,0,0.06,-0.94,accent,'front-bead');
  const bore=add(new THREE.CircleGeometry(0.037,12),dark,0,0,-1.002,'muzzle-bore');bore.rotation.y=Math.PI;
  group.userData.pump=pump;
  return group;
}

function poseParts(model) {
  if(model.userData.shotgunPoseParts)return model.userData.shotgunPoseParts;
  const named=name=>model.getObjectsByProperty('name',name);
  return model.userData.shotgunPoseParts={
    pump:model.getObjectByName('pump'),
    bursts:named('chamber-energy-burst'),rings:named('chamber-energy-ring'),
    hotCores:named('chamber-energy-hot-core'),washes:named('chamber-energy-wash'),
    bubbles:named('floating-bubble'),energyCores:named('energy-core'),
    chambers:named('bubble-chamber'),trims:named('reactor-trim'),
  };
}

export function poseShotgun(model,elapsed,time=elapsed) {
  const parts=poseParts(model),pump=parts.pump;
  if(pump)pump.position.z=elapsed>0.16&&elapsed<0.7?0.14*Math.sin((elapsed-0.16)/0.54*Math.PI):0;
  const burstLevel=[0,0];
  for(const burst of parts.bursts) {
    const age=time-(burst.userData.burstAt??-Infinity);
    const active=age>=0&&age<CHAMBER_BURST_DURATION;
    burst.visible=active;
    if(!active){burst.material.opacity=0;continue;}
    const t=age/CHAMBER_BURST_DURATION,eased=1-(1-t)**3;
    const level=t<0.22?1:((1-t)/0.78)**0.85;
    burstLevel[burst.userData.barrelIndex]=level;
    burst.position.z=THREE.MathUtils.lerp(-0.4,-0.982,eased);
    burst.scale.set(0.78+0.82*t,0.78+0.82*t,1.45+1.9*t);
    burst.material.opacity=Math.min(1,1.18*level);
  }
  for(const ring of parts.rings) {
    const age=time-(ring.userData.burstAt??-Infinity);
    const active=age>=0&&age<CHAMBER_BURST_DURATION;
    ring.visible=active;
    if(!active){ring.material.opacity=0;continue;}
    const t=age/CHAMBER_BURST_DURATION,eased=1-(1-t)**3;
    ring.position.z=THREE.MathUtils.lerp(-0.4,-0.987,eased);
    ring.scale.setScalar(0.65+1.8*t);
    ring.material.opacity=0.95*(1-t)**1.22;
  }
  for(const core of parts.hotCores) {
    const age=time-(core.userData.burstAt??-Infinity);
    const active=age>=0&&age<CHAMBER_BURST_DURATION;
    core.visible=active;
    if(!active){core.material.opacity=0;continue;}
    const t=age/CHAMBER_BURST_DURATION,eased=1-(1-t)**3;
    core.position.z=THREE.MathUtils.lerp(-0.4,-0.989,eased);
    core.scale.set(0.65+0.35*t,0.65+0.35*t,1.4+2*t);
    core.material.opacity=(1-t)**0.72;
  }
  for(const wash of parts.washes) {
    const age=time-(wash.userData.burstAt??-Infinity);
    const active=age>=0&&age<CHAMBER_BURST_DURATION;
    wash.visible=active;
    if(!active){wash.material.opacity=0;continue;}
    const t=age/CHAMBER_BURST_DURATION;
    wash.scale.set(1+Math.sin(Math.PI*t)*0.18,1,1+Math.sin(Math.PI*t)*0.18);
    wash.material.opacity=0.9*(1-t)**1.05;
  }
  for(const bubble of parts.bubbles) {
    const phase=bubble.userData.phase||0;
    bubble.position.x=bubble.userData.baseX+Math.sin(time*1.25+phase*1.4)*0.0045;
    bubble.position.y=bubble.userData.baseY+Math.sin(time*1.9+phase)*0.009;
    bubble.position.z=bubble.userData.baseZ+Math.sin(time*0.85+phase*1.7)*0.018;
    const surge=burstLevel[bubble.userData.barrelIndex]||0;
    bubble.scale.setScalar((0.88+0.18*Math.sin(time*2.3+phase))*(1+surge*0.32));
    bubble.material.opacity=Math.min(1,(bubble.userData.baseOpacity||0.82)+surge*0.18);
  }
  for(const core of parts.energyCores) {
    core.rotation.z=time*0.7*(core.userData.direction||1)+(core.userData.phase||0);
    const surge=burstLevel[core.userData.barrelIndex]||0;
    core.material.emissiveIntensity=0.85+0.35*(0.5+0.5*Math.sin(time*2.4+(core.userData.phase||0)))+surge*5.2;
  }
  for(const chamber of parts.chambers) {
    const surge=burstLevel[chamber.userData.barrelIndex]||0;
    chamber.material.opacity=Math.min(0.82,chamber.userData.baseOpacity+surge*0.24);
    chamber.material.color.copy(chamber.userData.baseColor).lerp(chamber.userData.burstColor,surge*0.82);
    chamber.material.emissive.copy(chamber.userData.baseEmissive).lerp(chamber.userData.burstEmissive,
      Math.min(1,surge*1.5));
    chamber.material.emissiveIntensity=chamber.userData.baseEmissiveIntensity+surge*8.5;
  }
  for(const trim of parts.trims) {
    const blend=0.5+0.5*Math.sin(time*1.35+(trim.userData.phase||0)*Math.PI*2);
    trim.material.color.copy(trim.userData.colorA).lerp(trim.userData.colorB,blend);
    trim.material.emissive.copy(trim.material.color).multiplyScalar(0.55);
  }
}

export function triggerShotgunChamber(model,barrelIndex,time) {
  if(!model||!Number.isFinite(time))return false;
  const selected=Math.abs(Math.trunc(Number(barrelIndex)||0))%2;
  let triggered=false;
  const parts=poseParts(model);
  for(const effects of [parts.bursts,parts.rings,parts.hotCores,parts.washes]) {
    for(const effect of effects) {
      if(effect.userData.barrelIndex!==selected)continue;
      effect.userData.burstAt=time;effect.visible=true;triggered=true;
    }
  }
  return triggered;
}

export function shotgunMuzzleStyle(skinKey,barrelIndex=0) {
  if(skinKey!=='shotgun_bubble_trouble')return null;
  const right=Math.abs(Math.trunc(barrelIndex))%2===1;
  return {barrel:right?1:-1,color:right?'#ce70ff':'#5ff7ff'};
}

export function shotgunPelletColor(skinKey,barrelIndex,hit=false) {
  return shotgunMuzzleStyle(skinKey,barrelIndex)?.color||(hit?'#ffce8c':'#9dfff3');
}
