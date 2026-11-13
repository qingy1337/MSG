import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import './armor.js';

const armor=globalThis.ARMOR;

export function armorStyle(key) {
  const definition=armor.CATALOG[key];
  return {...armor.SETS[definition?.set],...definition?.appearance};
}

export function createSlipstreamWake() {
  const group=new THREE.Group();group.name='slipstream-wake';group.visible=false;
  const material=new THREE.MeshBasicMaterial({color:'#9ce8f3',transparent:true,opacity:.55,
    depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false});
  for(const side of [-1,1]) {
    const plume=new THREE.Mesh(new THREE.ConeGeometry(.07,.8,8),material);
    plume.rotation.x=Math.PI/2;plume.position.set(side*.22,.26,.54);group.add(plume);
  }
  return group;
}

// The same fittings dress the home preview and live avatars. Parts are mounted
// to existing animated limbs; their proportions never alter gameplay hitboxes.
export function createArmorFitting(key,side=1) {
  const definition=armor.CATALOG[key];
  if(!definition)return new THREE.Group();
  const style=armorStyle(key),exotic=definition.rarity==='exotic';
  const reinforced=key==='bastion_chest';
  const vectorChest=key==='vector_chest';
  const group=new THREE.Group();group.name=`armor-${key}`;
  const shell=new THREE.MeshStandardMaterial({color:definition.appearance?.color||(exotic?'#d7eeee':style.color),metalness:style.metalness??.35,roughness:style.roughness??.38});
  const trim=new THREE.MeshStandardMaterial({color:reinforced?'#d6ad50':style.accent,metalness:reinforced ? .82 : style.trimMetalness??.55,roughness:reinforced ? .27 : style.trimRoughness??.32});
  const dark=new THREE.MeshStandardMaterial({color:style.dark,metalness:style.darkMetalness??.22,roughness:style.darkRoughness??.54});
  const add=(geometry,mat,x,y,z)=>{
    const mesh=new THREE.Mesh(geometry,mat);mesh.position.set(x,y,z);group.add(mesh);return mesh;
  };
  const box=(w,h,d,x,y,z,mat=shell,r=.04)=>add(new RoundedBoxGeometry(w,h,d,2,Math.min(r,w/3,h/3,d/3)),mat,x,y,z);
  const set=definition.set;
  if(definition.slot==='chest') {
    group.scale.set(reinforced ? .97 : .94,1,reinforced ? 1 : .92);
    // The armor has its own cut: broad planar faces, clipped shoulders and
    // angular waist flanks. A single chamfer catches light along each edge;
    // it doesn't reuse the soft rounded box of the unarmored character.
    const outline=new THREE.Shape();
    [[-.235,1.505],[.235,1.505],[.345,1.405],[.345,1.125],
      [.25,.905],[-.25,.905],[-.345,1.125],[-.345,1.405]]
      .forEach(([x,y],i)=>i?outline.lineTo(x,y):outline.moveTo(x,y));
    outline.closePath();
    const hull=new THREE.ExtrudeGeometry(outline,{depth:.49,bevelEnabled:true,
      bevelSize:.018,bevelThickness:.02,bevelSegments:1,steps:1});
    hull.translate(0,0,-.245);
    add(hull,shell,0,0,0);
    // The lower undersuit meets the shell inside its rounded waist edge.
    box(.43,.065,.38,0,.882,0,dark,.025);
    // Keep panelwork seated against the broad front/back armor faces. Its
    // shallow extrusion exposes a real beveled plate edge above each seam.
    const panel=(points,mat,lift=.006,back=false,openings=[])=>{
      const shape=new THREE.Shape();
      points.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));shape.closePath();
      for(const contour of openings) {
        const hole=new THREE.Path();
        contour.forEach(([x,y],i)=>i?hole.lineTo(x,y):hole.moveTo(x,y));hole.closePath();shape.holes.push(hole);
      }
      const geometry=new THREE.ExtrudeGeometry(shape,{depth:.018,bevelEnabled:true,
        bevelSize:.005,bevelThickness:.003,bevelSegments:1,steps:1});
      const p=geometry.attributes.position;
      for(let i=0;i<p.count;i++) {
        p.setZ(i,(back?1:-1)*(.265+lift+p.getZ(i)));
      }
      if(!back) {
        // Reflecting extrusion depth reverses its triangle winding.
        for(let i=0;i<p.count;i+=3)for(const attribute of Object.values(geometry.attributes)) {
          for(let component=0;component<attribute.itemSize;component++) {
            const a=(i+1)*attribute.itemSize+component,b=(i+2)*attribute.itemSize+component;
            const value=attribute.array[a];attribute.array[a]=attribute.array[b];attribute.array[b]=value;
          }
        }
      }
      geometry.computeVertexNormals();add(geometry,mat,0,0,0);
    };
    const inset=(points,back=false,openings=[])=>{
      panel(points,vectorChest?shell:dark,.001,back);
      const center=points.reduce(([x,y],[px,py])=>[x+px/points.length,y+py/points.length],[0,0]);
      const shrink=(sx,sy)=>points.map(([x,y])=>[center[0]+(x-center[0])*sx,center[1]+(y-center[1])*sy]);
      if(reinforced) {
        // Gold is the beveled edge beneath the porcelain panel, so the wider
        // accent follows the plate's thickness instead of lying on its face.
        panel(shrink(.96,.94),trim,.009,back);
        panel(shrink(.81,.81),shell,.020,back);
      } else if(openings.length) {
        // Actual apertures in the outer plate reveal a continuous cyan liner
        // beneath it. The bevels give each window a visible material thickness.
        panel(shrink(.94,.90),trim,.005,back);
        panel(shrink(.96,.94),shell,.016,back,openings);
      } else panel(shrink(.96,.94),shell,.008,back);
    };
    const mirror=(points,side)=>points.map(([x,y])=>[x*side,y]);
    if(set==='bastion') {
      for(const s of [-1,1]) {
        inset(mirror([[.025,1.425],[.19,1.425],[.275,1.35],[.245,1.245],[.075,1.225],[.025,1.26]],s));
        panel(mirror([[.215,1.391],[.229,1.377],[.197,1.276],[.183,1.279]],s),trim,.025);
        inset(mirror([[.025,1.16],[.23,1.18],[.245,1.11],[.17,1.055],[.025,1.065]],s));
        for(const y of [1.12,1.17,1.22])box(.018,.023,.145,s*.36,y,.025,dark,.004);
      }
      box(.045,.10,.065,0,1.31,-.284,dark,.006);
      box(.034,.065,.018,0,1.31,-.322,trim,.004);
      inset([[-.20,1.41],[.20,1.41],[.24,1.30],[.17,1.10],[-.17,1.10],[-.24,1.30]],true);
      for(const y of [1.22,1.27,1.32])panel([[-.12,y],[.12,y],[.12,y+.014],[-.12,y+.014]],dark,.025,true);
      panel([[-.045,1.36],[.045,1.36],[.045,1.38],[-.045,1.38]],trim,.026,true);
    } else if(set==='lifeline') {
      inset([[-.115,1.43],[.115,1.43],[.155,1.33],[.12,1.16],[-.12,1.16],[-.155,1.33]]);
      for(const s of [-1,1]) {
        panel(mirror([[.17,1.365],[.24,1.33],[.265,1.16],[.21,1.105],[.16,1.17]],s),dark,.003);
        panel(mirror([[.185,1.33],[.222,1.31],[.242,1.18],[.213,1.146],[.181,1.18]],s),trim,.012);
        for(const y of [1.205,1.25])panel(mirror([[.18,y],[.245,y-.01],[.246,y+.003],[.182,y+.014]],s),shell,.03);
      }
      // A single recessed medical emblem avoids stacked crossing rectangles.
      const emblem=new THREE.Shape();
      const points=[[-.025,-.09],[.025,-.09],[.025,-.025],[.09,-.025],[.09,.025],
        [.025,.025],[.025,.09],[-.025,.09],[-.025,.025],[-.09,.025],[-.09,-.025],[-.025,-.025]];
      points.forEach(([x,y],i)=>i?emblem.lineTo(x,y):emblem.moveTo(x,y));emblem.closePath();
      add(new THREE.ExtrudeGeometry(emblem,{depth:.012,bevelEnabled:true,bevelThickness:.002,
        bevelSize:.003,bevelSegments:1,steps:1}),trim,0,1.30,-.307);
      inset([[-.18,1.425],[.18,1.425],[.23,1.32],[.19,1.08],[-.19,1.08],[-.23,1.32]],true);
      for(const s of [-1,1]) {
        panel(mirror([[.05,1.35],[.125,1.35],[.125,1.17],[.05,1.17]],s),trim,.025,true);
        for(const y of [1.21,1.27])panel(mirror([[.044,y],[.133,y],[.133,y+.015],[.044,y+.015]],s),dark,.04,true);
      }
      panel([[-.055,1.07],[.055,1.07],[.07,1.11],[-.07,1.11]],trim,.01);
    } else {
      for(const s of [-1,1]) {
        inset(mirror([[.022,1.405],[.21,1.44],[.27,1.33],[.15,1.25],[.022,1.30]],s),false,
          [mirror([[.065,1.352],[.197,1.392],[.222,1.35],[.154,1.30],[.065,1.33]],s)]);
        panel(mirror([[.255,1.235],[.23,1.125],[.06,1.065],[.045,1.096],[.195,1.165],[.212,1.25]],s),shell,.006);
        panel(mirror([[.23,1.22],[.211,1.137],[.085,1.09],[.082,1.105],[.195,1.15],[.211,1.222]],s),trim,.019);
        box(.014,.13,.175,s*.365,1.165,.025,trim,.003);
        for(const y of [1.12,1.165,1.21])box(.017,.019,.16,s*.374,y,.025,dark,.004);
        inset(mirror([[.025,1.41],[.185,1.41],[.22,1.30],[.10,1.12],[.025,1.14]],s),true,
          [mirror([[.06,1.35],[.14,1.365],[.168,1.30],[.105,1.19],[.06,1.205]],s)]);
      }
      panel([[-.022,1.15],[.022,1.15],[.022,1.39],[-.022,1.39]],shell,.02,true);
    }
  } else if(key==='quartermaster_helmet') {
    // A fitted ordnance helmet: curved crown, inset visor surround and paired
    // canisters embedded in side cradles. All three views share this geometry.
    const crown=add(new THREE.SphereGeometry(.333,28,12,0,Math.PI*2,0,.94),shell,0,1.84,0);
    crown.scale.set(1.02,1.08,.97);
    const outline=(w,h,r)=>{
      const path=new THREE.Shape();
      path.moveTo(-w/2+r,-h/2);path.lineTo(w/2-r,-h/2);
      path.quadraticCurveTo(w/2,-h/2,w/2,-h/2+r);path.lineTo(w/2,h/2-r);
      path.quadraticCurveTo(w/2,h/2,w/2-r,h/2);path.lineTo(-w/2+r,h/2);
      path.quadraticCurveTo(-w/2,h/2,-w/2,h/2-r);path.lineTo(-w/2,-h/2+r);
      path.quadraticCurveTo(-w/2,-h/2,-w/2+r,-h/2);return path;
    };
    const surround=outline(.555,.245,.085);
    surround.holes.push(new THREE.Path(outline(.485,.175,.06).getPoints(32).reverse()));
    add(new THREE.ExtrudeGeometry(surround,{depth:.025,bevelEnabled:true,bevelThickness:.004,
      bevelSize:.004,bevelSegments:2,steps:1,curveSegments:8}),trim,0,1.86,-.351);
    for(const s of [-1,1]) {
      const cradle=box(.115,.275,.20,s*.268,1.79,.075,dark,.04);cradle.rotation.z=-s*.12;
      const cheek=box(.09,.095,.19,s*.215,1.675,-.145,shell,.035);cheek.rotation.z=-s*.25;
      add(new THREE.CylinderGeometry(.052,.052,.225,16),shell,s*.313,1.83,.12);
      for(const y of [1.72,1.94])add(new THREE.CylinderGeometry(.058,.058,.035,16),trim,s*.313,y,.12);
      box(.027,.105,.026,s*.313,1.83,.181,trim,.009);
      box(.075,.032,.03,s*.313,1.975,.12,dark,.01);
    }
    const dial=add(new THREE.CylinderGeometry(.085,.085,.035,24),dark,0,1.84,.314);dial.rotation.x=Math.PI/2;
    add(new THREE.TorusGeometry(.085,.012,6,24),trim,0,1.84,.336);
    box(.012,.062,.012,0,1.861,.338,trim,.004);
    box(.045,.012,.012,.017,1.836,.338,trim,.004);
  } else if(definition.slot==='helmet') {
    // Keep the familiar spherical head and unobstructed visor. These ear and
    // lower cheek fittings follow its curve instead of adding a second helmet.
    for(const s of [-1,1]) {
      box(.075,.18,.18,s*.295,1.84,.015,shell,.035);
      box(.025,.08,.10,s*.336,1.84,-.005,trim,.018);
      const jaw=box(.09,.10,.19,s*.20,1.64,-.12,dark,.03);jaw.rotation.z=s*-.25;
    }
    box(.18,.10,.045,0,1.80,.301,trim,.025);
    if(set==='lifeline')box(.075,.17,.04,0,1.82,.327,trim,.02);
  } else if(definition.slot==='gauntlets') {
    box(.27,.27,.35,0,.005,0,shell,.07);
    box(.23,.09,.25,0,.12,-.01,trim,.03);
    box(.225,.175,.31,-side*.04,-.17,-.27,shell,.045);
    box(.12,.028,.20,-side*.04,-.071,-.27,dark,.012);
    if(set==='bastion')for(const z of [-.21,-.30])box(.13,.02,.035,-side*.04,-.05,z,trim,.009);
    else if(set==='lifeline')box(.055,.026,.13,-side*.04,-.05,-.27,trim,.012);
    else {
      const line=box(.04,.026,.17,-side*.04,-.05,-.27,trim,.01);line.rotation.y=-side*.3;
    }
  } else if(definition.slot==='boots') {
    box(.305,.155,.43,0,-.787,-.07,dark,.045);
    box(.30,.13,.30,0,-.718,-.12,shell,.045);
    box(.285,.25,.27,0,-.58,.005,shell,.055);
    box(.20,.04,.025,0,-.52,-.141,trim,.012);
    if(exotic) {
      for(const s of [-1,1]) {
        const fin=box(.055,.20,.23,s*.15,-.57,.09,trim,.025);fin.rotation.x=-.22;
      }
      const nozzle=add(new THREE.CylinderGeometry(.065,.08,.065,12),dark,0,-.61,.17);
      nozzle.rotation.x=Math.PI/2;
      const inset=add(new THREE.CircleGeometry(.044,12),trim,0,-.61,.205);
      inset.rotation.y=0;
    } else if(set==='bastion')box(.23,.07,.05,0,-.72,-.277,trim,.02);
    else if(set==='lifeline')box(.075,.14,.035,0,-.59,-.145,trim,.02);
  }
  // Batch rigid details per material within a fitting. These add no lights,
  // physics shapes, per-frame updates, or work to the enemy crowd renderer.
  group.updateMatrixWorld(true);
  const byMaterial=new Map();
  for(const child of [...group.children]) {
    const geometries=byMaterial.get(child.material)||[];
    if(child.geometry.index) {
      const original=child.geometry;child.geometry=original.toNonIndexed();original.dispose();
    }
    child.geometry.applyMatrix4(child.matrix);geometries.push(child.geometry);
    byMaterial.set(child.material,geometries);group.remove(child);
  }
  for(const [material,geometries] of byMaterial) {
    const geometry=mergeGeometries(geometries,false);
    geometries.forEach(value=>value.dispose());
    const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
  }
  for(const material of [shell,trim,dark])if(!byMaterial.has(material))material.dispose();
  return group;
}

export function fitCharacterArmor(group,{helmet,visor,torso,backPanel,chest,legs,arms},appearance={}) {
  const remove=mesh=>{if(!mesh)return;mesh.removeFromParent();mesh.geometry.dispose();};
  for(const slot of armor.SLOTS) {
    const key=appearance[slot],definition=armor.CATALOG[key];
    if(!definition||definition.slot!==slot)continue;
    if(slot==='helmet') {
      const style=armorStyle(key);
      helmet.material=new THREE.MeshStandardMaterial({color:style.color,metalness:style.metalness??.35,roughness:style.roughness??.38});
      if(visor&&style.visor)visor.material=new THREE.MeshStandardMaterial({color:style.visor,metalness:.7,roughness:.18});
      group.add(createArmorFitting(key));
    } else if(slot==='chest') {
      remove(chest);remove(torso);remove(backPanel);group.add(createArmorFitting(key));
    } else if(slot==='gauntlets') {
      arms.forEach((arm,index)=>{remove(arm.children[0]);arm.add(createArmorFitting(key,index===0?-1:1));});
    } else {
      legs.forEach(leg=>{remove(leg.children[2]);leg.add(createArmorFitting(key));});
    }
  }
}
