import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';

// One architectural kit follows the authoritative walls, including their
// door and observation openings. All trim projects less than 15 cm from a
// solid face; none of it adds an invisible obstacle to the floor plan.
export function createCandyEnvironment(map,walls) {
  const root=new THREE.Group();root.name='candy-factory-architecture';
  const material=(color,metalness=.15,roughness=.64)=>
    new THREE.MeshStandardMaterial({color,metalness,roughness});
  const plaster=material('#e9d8b9',.06,.86),enamel=material('#b9d0bc',.22,.39),
    grout=material('#8ba99a',.13,.68),ivory=material('#f1dcbb',.25,.43),
    terra=material('#b45d48',.25,.58),teal=material('#426b69',.65,.41),
    charcoal=material('#354746',.35,.6);
  const opal=new THREE.MeshStandardMaterial({color:'#b9ded3',emissive:'#bdd7c7',
    emissiveIntensity:.24,roughness:.4,metalness:.08});
  const add=(parent,geometry,mat,x,y,z,name)=>{
    const mesh=new THREE.Mesh(geometry,mat);mesh.position.set(x,y,z);
    mesh.castShadow=true;mesh.receiveShadow=true;if(name)mesh.name=name;
    parent.add(mesh);return mesh;
  };
  const box=(parent,w,h,d,x,y,z,mat,name,round=0)=>add(parent,
    round?new RoundedBoxGeometry(w,h,d,1,Math.min(round,w/4,h/4,d/4)):
      new THREE.BoxGeometry(w,h,d),mat,x,y,z,name);
  const world=(x,y,z)=>new THREE.Vector3((x-450)*.05,z,(y-300)*.05);

  for(const wall of walls) {
    if(wall.kind==='cabin')continue;
    const bottom=wall.bottom||0,top=wall.top||3.1,w=wall.width*.05,d=wall.height*.05,
      height=top-bottom,alongX=w>=d,length=alongX?w:d,thickness=alongX?d:w;
    const assembly=new THREE.Group();assembly.name='candy-wall-assembly';
    assembly.position.copy(world(wall.x+wall.width/2,wall.y+wall.height/2,bottom));
    root.add(assembly);
    // Flat masonry owns the top plane. No cap is stacked flush against it.
    box(assembly,w,height,d,0,height/2,0,plaster,'candy-wall-solid');
    const face=(sign,span,high,depth,along,y,offset,mat,name)=>
      box(assembly,alongX?span:depth,high,alongX?depth:span,
        alongX?along:sign*(thickness/2+offset),y,
        alongX?sign*(thickness/2+offset):along,mat,name);
    for(const sign of [-1,1]) {
      if(bottom===0) {
        // Washable glazed tiles below a thin terracotta chair rail. Large
        // calm plaster fields above keep the ceiling height legible.
        face(sign,length-.08,2.04,.035,0,1.13,.034,enamel,'candy-tile-dado');
        face(sign,length-.05,.20,.065,0,.10,.045,teal,'candy-wall-plinth');
        for(let y=.68;y<2.12;y+=.78)
          face(sign,length-.10,.012,.006,0,y,.055,grout);
        for(let x=-length/2+1.05;x<length/2-.2;x+=2.1)
          face(sign,.012,2.0,.006,x,1.13,.055,grout);
        face(sign,length-.06,.11,.09,0,2.205,.06,terra,'candy-dado-border');
        face(sign,length-.06,.035,.10,0,2.282,.065,ivory);
      } else {
        face(sign,length-.08,.18,.075,0,.12,.055,teal,'candy-header-soffit');
      }
      if(height>6) {
        face(sign,length-.06,.24,.11,0,height-.24,.075,terra,'candy-cornice');
        face(sign,length-.08,.06,.13,0,height-.40,.08,ivory);
        // A few structural piers replace the old dense full-height stripes.
        const count=Math.max(1,Math.ceil(length/7));
        for(let i=0;i<=count;i++) {
          const x=-length/2+.17+(length-.34)*i/count;
          face(sign,.24,height-.6,.11,x,height/2,.065,ivory,'candy-wall-pilaster');
          face(sign,.34,.20,.14,x,height-.53,.08,terra);
        }
      }
      if(wall.kind==='boundary'&&height>10&&length>5) {
        const bays=Math.max(1,Math.floor(length/5.8)),pitch=(length-.9)/bays;
        for(let i=0;i<bays;i++) {
          const x=-length/2+.45+pitch*(i+.5),span=pitch-.40;
          face(sign,span,2.8,.045,x,height-2.15,.055,teal,'candy-clerestory-frame');
          face(sign,span-.16,2.56,.022,x,height-2.15,.095,opal,'candy-clerestory-glass');
          face(sign,span-.17,.055,.022,x,height-2.15,.118,ivory);
          for(const offset of [-.24,.24])
            face(sign,.055,2.56,.022,x+span*offset,height-2.15,.118,ivory);
        }
      }
    }
  }

  // A large mechanical batch dial gives the cooking end an identifiable
  // silhouette. It is attached to the wall, above the cooker.
  const dial=new THREE.Group();dial.name='candy-batch-clock';
  dial.position.copy(world(540,22,9.55));root.add(dial);
  const disk=add(dial,new THREE.CylinderGeometry(1.8,1.8,.16,48),ivory,0,0,.18);
  disk.rotation.x=Math.PI/2;
  add(dial,new THREE.TorusGeometry(1.84,.09,8,48),teal,0,0,.22);
  add(dial,new THREE.TorusGeometry(1.62,.025,6,48),terra,0,0,.28);
  for(let i=0;i<12;i++) {
    const angle=i*Math.PI/6,r=1.45;
    const tick=box(dial,.055,i%3===0?.23:.13,.035,Math.sin(angle)*r,
      Math.cos(angle)*r,.29,teal);tick.rotation.z=-angle;
  }
  for(const [length,angle,mat] of [[1.14,-Math.PI/3,teal],[.78,Math.PI/3,terra]]) {
    const hand=box(dial,.085,length,.05,Math.sin(angle)*length/2,
      Math.cos(angle)*length/2,.34,mat);hand.rotation.z=-angle;
  }
  add(dial,new THREE.SphereGeometry(.12,12,8),terra,0,0,.36);
  const emblem=new THREE.Group();
  emblem.position.copy(world(540,763,6.2));emblem.rotation.y=Math.PI;root.add(emblem);
  box(emblem,5.1,1.25,.20,0,0,.15,teal,'candy-house-emblem',.12);
  box(emblem,1.55,.65,.12,0,0,.28,ivory,null,.16);
  for(const side of [-1,1]) {
    const wrap=add(emblem,new THREE.ConeGeometry(.43,.55,3),terra,side*1.03,0,.28);
    wrap.rotation.z=side*Math.PI/2;wrap.scale.z=.18;
  }
  // Closed inspection glazing at the shipping wall echoes the upper windows
  // and has its wall collider directly behind it.
  for(const x of [347,733]) {
    const p=world(x,763,4.3);
    box(root,5.6,2.0,.06,p.x,p.y,p.z-.06,teal,'candy-shipping-window');
    box(root,5.36,1.78,.035,p.x,p.y,p.z-.112,opal);
    for(const dx of [-1.75,0,1.75])box(root,.055,1.8,.04,p.x+dx,p.y,p.z-.15,ivory);
    box(root,5.5,.10,.16,p.x,p.y-.98,p.z-.12,terra);
  }
  return root;
}
