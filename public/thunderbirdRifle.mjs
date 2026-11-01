import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Thunderbird is shaped as a swept wing wrapped around a compact rifle core.
// Forward is -Z, matching every other first-person weapon.
export function createThunderbirdRifle(length) {
  const group=new THREE.Group();
  group.name='thunderbird-rifle';
  group.scale.setScalar(length);
  const body=new THREE.MeshStandardMaterial({color:'#343d40',metalness:.42,roughness:.43});
  const deep=new THREE.MeshStandardMaterial({color:'#1b2428',metalness:.32,roughness:.55});
  const brass=new THREE.MeshStandardMaterial({color:'#b6a77e',metalness:.68,roughness:.32});
  const glass=new THREE.MeshBasicMaterial({color:'#ffe69b',transparent:true,opacity:.16,
    depthWrite:false,side:THREE.DoubleSide});
  const add=(geometry,material,name,x=0,y=0,z=0)=>{
    const mesh=new THREE.Mesh(geometry,material);mesh.name=name;mesh.position.set(x,y,z);
    mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);return mesh;
  };
  const box=(w,h,d,x,y,z,material,name,r=.01)=>add(
    new RoundedBoxGeometry(w,h,d,3,Math.min(r,w/4,h/4,d/4)),material,name,x,y,z);
  const profile=(points,width,material,name)=>{
    const shape=new THREE.Shape();shape.moveTo(points[0][0],points[0][1]);
    for(let i=1;i<points.length;i++)shape.lineTo(points[i][0],points[i][1]);
    shape.closePath();
    const geometry=new THREE.ExtrudeGeometry(shape,{depth:width,bevelEnabled:true,
      bevelSize:.006,bevelThickness:.006,bevelSegments:3});
    geometry.rotateY(Math.PI/2);
    return add(geometry,material,name,-width/2);
  };

  // The long, nearly level upper edge provides a calm silhouette behind the
  // flowing feathers. The stock and front shroud are part of this one shell.
  profile([[-.09,-.055],[-.05,.018],[.11,.083],[.24,.098],
    [.79,.098],[.87,.085],[.88,.073],[.88,-.052],[.73,-.085],[.34,-.096],
    [.1,-.08],[-.07,-.075]],.153,body,'thunderbird-receiver');
  profile([[.13,-.072],[.2,-.083],[.24,-.237],[.217,-.28],
    [.15,-.268],[.105,-.18]],.104,deep,'thunderbird-grip');
  const magazine=box(.096,.164,.128,0,-.152,-.423,body,'thunderbird-magazine',.017);
  magazine.rotation.x=-.18;

  // A shallow sight, carried close to the stock, leaves the upper shell clear.
  box(.087,.012,.086,0,.111,-.19,deep,'thunderbird-sight-base',.004);
  for(const side of [-1,1]) {
    box(.009,.054,.011,side*.039,.145,-.225,deep,'thunderbird-sight-frame',.003);
  }
  box(.087,.009,.011,0,.176,-.225,deep,'thunderbird-sight-bridge',.003);
  add(new THREE.PlaneGeometry(.067,.044),glass,'thunderbird-sight-glass',0,.146,-.218);

  // A level front housing ends in a compact exposed barrel.
  const barrel=add(new THREE.CylinderGeometry(.027,.027,.19,18),brass,
    'thunderbird-barrel',0,-.007,-.876);barrel.rotation.x=Math.PI/2;
  const muzzle=add(new THREE.CylinderGeometry(.039,.039,.064,18),deep,
    'thunderbird-muzzle',0,-.007,-.96);muzzle.rotation.x=Math.PI/2;
  const bore=add(new THREE.CircleGeometry(.021,18),deep,'thunderbird-bore',0,-.007,-.994);
  bore.rotation.y=Math.PI;

  // Each flank is one folded wing: clustered roots, overlapping shoulders,
  // and progressively shorter trailing feathers. All tips point to the stock.
  const featherGlow=[];
  const panelMetal=new THREE.MeshStandardMaterial({color:'#58666b',metalness:.65,roughness:.38,
    side:THREE.DoubleSide});
  const shoulderMetal=new THREE.MeshStandardMaterial({color:'#454a4f',metalness:.58,roughness:.4});
  const vaneMaterial=new THREE.MeshStandardMaterial({color:'#303c41',metalness:.45,
    roughness:.5,side:THREE.DoubleSide});
  const featherSpecs=[
    {root:.70,tip:.16,yRoot:.047,yTip:.092,half:.029,sideOffset:.089},
    {root:.72,tip:.26,yRoot:.019,yTip:.031,half:.028,sideOffset:.086},
    {root:.74,tip:.36,yRoot:-.009,yTip:-.025,half:.026,sideOffset:.083},
    {root:.76,tip:.46,yRoot:-.037,yTip:-.070,half:.024,sideOffset:.080},
  ];
  // A continuous shoulder grows out of the receiver and covers the roots.
  // Its thickness fades into the front housing instead of ending in a block.
  for(const side of [-1,1]) {
    const shoulder=new THREE.Shape();
    shoulder.moveTo(.64,.061);
    shoulder.bezierCurveTo(.71,.089,.79,.087,.815,.065);
    shoulder.quadraticCurveTo(.835,.025,.797,-.046);
    shoulder.quadraticCurveTo(.765,-.074,.714,-.059);
    shoulder.bezierCurveTo(.73,-.018,.711,.035,.64,.061);
    const geometry=new THREE.ExtrudeGeometry(shoulder,{depth:.004,
      bevelEnabled:true,bevelSize:.002,bevelThickness:.002,bevelSegments:2,curveSegments:16});
    geometry.rotateY(Math.PI/2);
    const vertices=geometry.getAttribute('position');
    for(let i=0;i<vertices.count;i++) {
      const d=-vertices.getZ(i),lift=.017*THREE.MathUtils.clamp((.82-d)/.12,0,1);
      vertices.setX(i,side*(.076+lift+vertices.getX(i)));
    }
    // Mirroring one flank reverses winding; restore its outward normals.
    if(side<0) {
      for(const attribute of Object.values(geometry.attributes)) {
        for(let i=0;i<attribute.count;i+=3) {
          for(let j=0;j<attribute.itemSize;j++) {
            const a=(i+1)*attribute.itemSize+j,b=(i+2)*attribute.itemSize+j;
            const value=attribute.array[a];attribute.array[a]=attribute.array[b];attribute.array[b]=value;
          }
        }
      }
    }
    geometry.computeVertexNormals();
    add(geometry,shoulderMetal,'thunderbird-wing-shoulder');
  }
  const featherPivots=[];
  const makePanel=(side,spec,index,moving=true)=>{
    const pivot=new THREE.Group();
    pivot.name=moving?'thunderbird-feather-pivot':'thunderbird-fixed-tail';
    pivot.position.set(side*spec.sideOffset,spec.yRoot,-spec.root);
    group.add(pivot);
    if(moving)featherPivots.push({pivot,side,index});
    else pivot.rotation.y=side*.028;
    const shape=new THREE.Shape(),span=spec.root-spec.tip;
    // An asymmetric airfoil outline: broad at the shoulder, a long sweeping
    // edge, and a soft oblique tip. The underside draws inward more sharply.
    shape.moveTo(spec.root,spec.yRoot+spec.half*.45);
    shape.bezierCurveTo(spec.root-span*.23,spec.yRoot+spec.half*1.4,
      spec.tip+span*.32,spec.yTip+spec.half*.62,
      spec.tip+.009,spec.yTip+.005);
    shape.quadraticCurveTo(spec.tip-.002,spec.yTip+.001,spec.tip+.007,spec.yTip-.006);
    shape.bezierCurveTo(spec.tip+span*.23,spec.yTip-spec.half*.72,
      spec.root-span*.30,spec.yRoot-spec.half*.82,
      spec.root,spec.yRoot-spec.half*.40);
    shape.closePath();
    const geometry=new THREE.ExtrudeGeometry(shape,{depth:.004,bevelEnabled:true,
      bevelThickness:.0008,bevelSize:.001,bevelSegments:2,curveSegments:20});
    geometry.rotateY(Math.PI/2);
    const position=geometry.getAttribute('position');
    for(let i=0;i<position.count;i++) {
      position.setX(i,position.getX(i)-.002);
      position.setY(i,position.getY(i)-pivot.position.y);
      position.setZ(i,position.getZ(i)-pivot.position.z);
    }
    position.needsUpdate=true;geometry.computeVertexNormals();
    const panel=new THREE.Mesh(geometry,panelMetal);
    panel.name=moving?'thunderbird-rear-feather':'thunderbird-tail-feather';
    panel.castShadow=true;panel.receiveShadow=true;
    pivot.add(panel);

    // Swept barb grooves give the vane a feather structure. Fit each groove
    // to the actual outline so neither the broad tails nor short feathers
    // acquire stray lines beyond their edges. All grooves share one mesh.
    const outline=shape.getPoints(40);
    const centerAt=u=>spec.yRoot+(spec.yTip-spec.yRoot)*u+Math.sin(u*Math.PI)*spec.half*.18;
    const edgeAt=(d,edge)=>{
      const intersections=[];
      for(let i=0;i<outline.length-1;i++) {
        const a=outline[i],b=outline[i+1];
        if((a.x<=d&&b.x>d)||(b.x<=d&&a.x>d))
          intersections.push(a.y+(b.y-a.y)*(d-a.x)/(b.x-a.x));
      }
      return edge>0?Math.max(...intersections):Math.min(...intersections);
    };
    const vanePositions=[],vaneIndices=[];
    for(const edge of [-1,1])for(let barb=0;barb<4;barb++) {
      const start=.20+barb*.15+(edge<0?.025:0),base=vanePositions.length/3;
      for(let step=0;step<=12;step++) {
        const t=step/12,u=start+.115*t,d=spec.root-span*u,center=centerAt(u);
        const available=Math.abs(edgeAt(d,edge)-center);
        const offset=.0032+(available*.85-.0032)*Math.sin(t*Math.PI/2);
        const y=center+edge*offset,width=.00015+.00045*Math.sin(t*Math.PI);
        for(const rim of [-1,1])vanePositions.push(side*.0033,
          y+rim*width-pivot.position.y,-d-pivot.position.z);
        if(step<12){const k=base+step*2;vaneIndices.push(k,k+1,k+2,k+1,k+3,k+2);}
      }
    }
    const vaneGeometry=new THREE.BufferGeometry();
    vaneGeometry.setAttribute('position',new THREE.Float32BufferAttribute(vanePositions,3));
    vaneGeometry.setIndex(vaneIndices);vaneGeometry.computeVertexNormals();
    const vanes=new THREE.Mesh(vaneGeometry,vaneMaterial);
    vanes.name='thunderbird-feather-barbs';
    vanes.castShadow=true;vanes.receiveShadow=true;pivot.add(vanes);

    // A tapered luminous ribbon follows each feather's sweep. It sits directly
    // over the metal face instead of reading as a round wire glued on top.
    const inlay=[],indices=[];
    for(let i=0;i<=32;i++) {
      const t=i/32,u=.10+t*.77,d=spec.root-span*u;
      const y=centerAt(u);
      const width=.0005+.0018*Math.sin(Math.PI*t)**.7;
      for(const edge of [-1,1])inlay.push(side*.0032,y+edge*width-pivot.position.y,-d-pivot.position.z);
      if(i<32){const k=i*2;indices.push(k,k+1,k+2,k+1,k+3,k+2);}
    }
    const inlayGeometry=new THREE.BufferGeometry();
    inlayGeometry.setAttribute('position',new THREE.Float32BufferAttribute(inlay,3));
    inlayGeometry.setIndex(indices);inlayGeometry.computeVertexNormals();
    const light=new THREE.MeshStandardMaterial({color:'#ffd34a',emissive:'#ffd447',
      emissiveIntensity:.45,metalness:.36,roughness:.34,side:THREE.DoubleSide});
    const quill=new THREE.Mesh(inlayGeometry,light);
    quill.name=moving?'thunderbird-quill':'thunderbird-tail-inlay';
    quill.castShadow=true;quill.receiveShadow=true;pivot.add(quill);
    featherGlow.push({material:light,index});
  };
  for(const side of [-1,1])
    featherSpecs.forEach((spec,index)=>makePanel(side,spec,index));
  // Two broad tail feathers nest underneath the moving wing and extend past
  // the stock toward the player. Their mounts never enter the fan animation.
  for(const side of [-1,1])makePanel(side,
    {root:.38,tip:-.13,yRoot:0,yTip:.115,half:.067,sideOffset:.078},0,false);
  group.userData.thunderbird={featherGlow,featherPivots,featherSpecs,
    shotAt:-10,lastPoseAt:null,openness:0};
  return group;
}
