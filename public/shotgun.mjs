import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';

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
  if(bubbleTrouble) {
    const pearl=new THREE.MeshPhysicalMaterial({color:'#9bb7bf',metalness:0.48,roughness:0.17,
      clearcoat:1,clearcoatRoughness:0.045,emissive:'#14272e',emissiveIntensity:0.025});
    const navy=mat('#07162b',0.58,0.19);
    const aquaGlow=new THREE.MeshStandardMaterial({color:'#25ecec',emissive:'#00aeba',emissiveIntensity:0.95,
      metalness:0.18,roughness:0.2});
    const violetGlow=new THREE.MeshStandardMaterial({color:'#c24eff',emissive:'#861bc4',emissiveIntensity:0.95,
      metalness:0.18,roughness:0.2});
    const aquaGlass=new THREE.MeshPhysicalMaterial({color:'#008fa8',transparent:true,opacity:0.54,depthWrite:false,
      metalness:0.08,roughness:0.08,clearcoat:1,clearcoatRoughness:0.03,emissive:'#00677b',emissiveIntensity:0.1});
    const violetGlass=new THREE.MeshPhysicalMaterial({color:'#6e21b8',transparent:true,opacity:0.54,depthWrite:false,
      metalness:0.08,roughness:0.08,clearcoat:1,clearcoatRoughness:0.03,emissive:'#471273',emissiveIntensity:0.1});
    const pinkTrim=new THREE.MeshStandardMaterial({color:'#ff3fbd',emissive:'#c51687',emissiveIntensity:0.72,
      metalness:0.45,roughness:0.16});
    const blueTrim=new THREE.MeshStandardMaterial({color:'#19d9ff',emissive:'#087da9',emissiveIntensity:0.72,
      metalness:0.45,roughness:0.16});
    const aquaArmor=new THREE.MeshPhysicalMaterial({color:'#00b8c8',emissive:'#006775',emissiveIntensity:0.3,
      metalness:0.5,roughness:0.16,clearcoat:0.9,clearcoatRoughness:0.08});
    const violetArmor=new THREE.MeshPhysicalMaterial({color:'#923de0',emissive:'#4c147d',emissiveIntensity:0.34,
      metalness:0.5,roughness:0.16,clearcoat:0.9,clearcoatRoughness:0.08});
    const yellowGlow=new THREE.MeshStandardMaterial({color:'#ffe45d',emissive:'#df8d00',emissiveIntensity:0.85,
      metalness:0.2,roughness:0.2});

    stadiumTaper(0.245,0.15,0.19,0.116,0.38,0,-0.022,-0.24,pearl,'receiver');
    softBox(0.19,0.047,0.31,0,-0.086,-0.25,navy,'receiver-inset');
    const chamberDepth=0.65;
    for(const [index,side] of [-1,1].entries()) {
      const glass=index===0?aquaGlass:violetGlass,glow=index===0?aquaGlow:violetGlow;
      const chamber=add(new THREE.CylinderGeometry(0.056,0.056,chamberDepth,24,1,true),glass,
        side*0.062,-0.012,-0.68,'bubble-chamber');
      chamber.rotation.x=Math.PI/2;chamber.renderOrder=2;
      const coilPoints=Array.from({length:41},(_,i)=>{
        const t=i/40,turn=t*Math.PI*8+index*Math.PI;
        return new THREE.Vector3(Math.cos(turn)*0.028,Math.sin(turn)*0.028,0.3-t*0.6);
      });
      const core=add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coilPoints),48,0.0045,6,false),glow,
        side*0.062,-0.012,-0.68,'energy-core');
      Object.assign(core.userData,{phase:index*Math.PI,direction:side});
      for(const z of [-0.37,-0.995])add(new THREE.TorusGeometry(0.057,0.008,8,24),pearl,
        side*0.062,-0.012,z,'chamber-collar');
      const armor=index===0?aquaArmor:violetArmor;
      // Broad colored pieces define the silhouette; the glass remains exposed
      // between them so this still reads as a pair of bubble chambers.
      for(const y of [-0.066,0.042])softBox(0.015,0.014,0.56,side*0.062,y,-0.68,armor,'chamber-guard');
      softBox(0.032,0.092,0.46,side*0.122,-0.012,-0.68,armor,'chroma-shroud');
      softBox(0.052,0.023,0.42,side*0.061,0.061,-0.66,armor,'chroma-top-panel');
      softBox(0.016,0.102,0.255,side*0.123,-0.018,-0.235,armor,'receiver-chroma-panel');
      for(let i=0;i<5;i++) {
        const radius=0.0065+(i%3)*0.0023;
        const bubbleMaterial=new THREE.MeshBasicMaterial({color:index===0?'#ddffff':'#ffe4ff',transparent:true,
          opacity:0.78,depthWrite:false});
        const sphere=add(new THREE.SphereGeometry(radius,10,7),bubbleMaterial,
          side*0.062+(i%2?0.012:-0.011),0.012+(i%3)*0.008,-0.405-i*0.126,'floating-bubble');
        Object.assign(sphere.userData,{baseX:sphere.position.x,baseY:sphere.position.y,baseZ:sphere.position.z,
          phase:i*1.37+index*0.71,side});
        sphere.renderOrder=3;
      }
      const bore=add(new THREE.CircleGeometry(0.03,24),navy,side*0.062,-0.012,-1.014,'muzzle-bore');
      bore.rotation.y=Math.PI;
      add(new THREE.TorusGeometry(0.035,0.008,8,24),armor,side*0.062,-0.012,-1.012,'barrel-rim');
    }
    softBox(0.15,0.018,0.052,0,0.055,-0.415,pinkTrim,'reactor-bridge');
    for(const [i,x] of [-0.03,0,0.03].entries())
      add(new THREE.SphereGeometry(0.008,10,7),i===0?blueTrim:i===1?yellowGlow:violetGlow,
        x,0.088,-0.255,'status-light');

    const pump=new THREE.Group();pump.name='pump';group.add(pump);
    const pumpPanel=softBox(0.17,0.044,0.285,0,-0.086,-0.63,navy,'pump-inset');pump.attach(pumpPanel);
    for(const [side,material] of [[-1,aquaArmor],[1,violetArmor]]) {
      const wing=softBox(0.071,0.056,0.255,side*0.054,-0.095,-0.63,material,'pump-wing');
      pump.attach(wing);
    }
    for(const [side,material,phase] of [[-1,pinkTrim,0],[1,blueTrim,0.5]]) {
      const trim=softBox(0.012,0.018,0.59,side*0.122,0.006,-0.67,material,'iridescent-trim');
      Object.assign(trim.userData,{phase,colorA:new THREE.Color('#ff3fbd'),colorB:new THREE.Color('#19d9ff')});
      const rail=softBox(0.035,0.035,0.3,side*0.067,-0.034,0.073,
        side<0?aquaArmor:violetArmor,'stock-rail');rail.rotation.x=-0.08;
    }
    roundedFrame(0.185,0.145,0.038,0.05,0.105,0.066,0.022,0,-0.045,0.232,pearl,'rear-handle-loop');
    const grip=softBox(0.084,0.18,0.07,0,-0.155,0.235,navy,'rear-handle');grip.rotation.x=-0.28;
    softBox(0.09,0.034,0.076,0,-0.237,0.26,pinkTrim,'rear-handle-heel').rotation.x=-0.28;
    softBox(0.052,0.014,0.69,0,0.063,-0.55,pearl,'pearl-sight-rib');
    softBox(0.012,0.052,0.1,0.112,-0.005,-0.225,navy,'ejection-port');
    softBox(0.025,0.033,0.03,0,0.072,-0.975,blueTrim,'front-bead');
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

export function poseShotgun(model,elapsed,time=elapsed) {
  const pump=model.getObjectByName('pump');
  if(pump)pump.position.z=elapsed>0.16&&elapsed<0.7?0.14*Math.sin((elapsed-0.16)/0.54*Math.PI):0;
  for(const bubble of model.getObjectsByProperty('name','floating-bubble')) {
    const phase=bubble.userData.phase||0;
    bubble.position.x=bubble.userData.baseX+Math.sin(time*1.25+phase*1.4)*0.0045;
    bubble.position.y=bubble.userData.baseY+Math.sin(time*1.9+phase)*0.009;
    bubble.position.z=bubble.userData.baseZ+Math.sin(time*0.85+phase*1.7)*0.018;
    bubble.scale.setScalar(0.88+0.18*Math.sin(time*2.3+phase));
  }
  for(const core of model.getObjectsByProperty('name','energy-core')) {
    core.rotation.z=time*0.7*(core.userData.direction||1)+(core.userData.phase||0);
    core.material.emissiveIntensity=0.85+0.35*(0.5+0.5*Math.sin(time*2.4+(core.userData.phase||0)));
  }
  for(const trim of model.getObjectsByProperty('name','iridescent-trim')) {
    const blend=0.5+0.5*Math.sin(time*1.35+(trim.userData.phase||0)*Math.PI*2);
    trim.material.color.copy(trim.userData.colorA).lerp(trim.userData.colorB,blend);
    trim.material.emissive.copy(trim.material.color).multiplyScalar(0.55);
  }
}

export function shotgunMuzzleStyle(skinKey,barrelIndex=0) {
  if(skinKey!=='shotgun_bubble_trouble')return null;
  const right=Math.abs(Math.trunc(barrelIndex))%2===1;
  return {barrel:right?1:-1,color:right?'#ce70ff':'#5ff7ff'};
}

export function shotgunPelletColor(skinKey,barrelIndex,hit=false) {
  return shotgunMuzzleStyle(skinKey,barrelIndex)?.color||(hit?'#ffce8c':'#9dfff3');
}
