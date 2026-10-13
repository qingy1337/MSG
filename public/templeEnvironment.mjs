import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';

const SCALE=.05;
const arena=(x,y,height=0)=>new THREE.Vector3((x-450)*SCALE,height,(y-300)*SCALE);

// Bespoke visual architecture for Overgrown Temple. Gameplay continues to use
// the simple authored solids, but none of those collision boxes are rendered.
export function createTempleEnvironment(map,walls) {
  const group=new THREE.Group();
  const material=(color,roughness=.86)=>new THREE.MeshStandardMaterial({color,roughness,metalness:.01});
  const stone=material('#66705f'),stoneLight=material('#8d9075'),stoneDark=material('#414c43');
  const moss=material('#4c7040',.98),bark=material('#493a29',.96);
  const leaf=material('#285638',.94),leafLight=material('#4f7c43',.94);
  const add=(geometry,mat,x,y,z)=>{
    const mesh=new THREE.Mesh(geometry,mat);mesh.position.set(x,y,z);
    mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);return mesh;
  };
  const box=(w,h,d,x,y,z,mat=stone,radius=.045)=>add(
    new RoundedBoxGeometry(w,h,d,2,Math.min(radius,w/4,h/4,d/4)),mat,x,y,z);
  const worldRect=solid=>{
    const p=arena(solid.x+solid.width/2,solid.y+solid.height/2);
    return {x:p.x,z:p.z,w:solid.width*SCALE,d:solid.height*SCALE,h:solid.top??3.1};
  };
  const seedValue=(n,salt=0)=>{
    const value=Math.sin((n+1)*91.731+salt*17.113+(map.seed||0)*.000013)*43758.5453;
    return value-Math.floor(value);
  };

  function masonryWall(solid) {
    const {x,z,w,d,h}=worldRect(solid),horizontal=w>=d,length=horizontal?w:d;
    // Large uninterrupted masses, recessed panels, and a continuous cornice
    // give the tunnels one deliberate architectural language. The old tiny
    // block veneer made every wall look noisy and visibly assembled.
    box(Math.max(.04,w-.025),h-.12,Math.max(.04,d-.025),x,(h-.12)/2,z,stone,.055);
    const bays=Math.max(1,Math.ceil(length/2.7)),endPadding=Math.min(.16,length*.12);
    const pitch=(length-endPadding*2)/bays,face=(horizontal?d:w)/2+.018;
    for(const sign of [-1,1]) {
      for(let i=0;i<=bays;i++) {
        const along=-length/2+endPadding+pitch*i;
        box(horizontal?.18:.085,h-.34,horizontal?.085:.18,
          x+(horizontal?along:sign*face),h*.49,z+(horizontal?sign*face:along),stoneDark,.025);
      }
      for(let i=0;i<bays;i++) {
        const along=-length/2+endPadding+(i+.5)*pitch,panelLength=Math.max(.12,pitch-.22);
        box(horizontal?panelLength:.055,h*.34,horizontal?.055:panelLength,
          x+(horizontal?along:sign*(face+.012)),h*.43,z+(horizontal?sign*(face+.012):along),stoneLight,.018);
      }
      box(horizontal?length-.36:.10,.12,horizontal?.10:length-.36,
        x+(horizontal?0:sign*(face+.028)),h*.73,z+(horizontal?sign*(face+.028):0),stoneDark,.018);
    }
    box(Math.max(.04,w-.015),.16,Math.max(.04,d-.015),x,h-.04,z,stoneLight,.035);
    box(Math.max(.05,w-.12),.032,Math.max(.05,d-.12),x,h+.057,z,moss,.012);
  }

  function jungleCliff(solid,wallIndex) {
    const {x,z,w,d}=worldRect(solid),horizontal=w>=d,length=horizontal?w:d;
    const segments=Math.max(6,Math.ceil(length/2.4)),thickness=Math.max(.48,horizontal?d:w);
    const positions=[],indices=[];
    for(let i=0;i<=segments;i++) {
      const along=-length/2+length*i/segments;
      const top=2.7+seedValue(i,wallIndex)*1.35+Math.sin(i*1.7+wallIndex)*.22;
      const inset=.06+seedValue(i,wallIndex+40)*.12;
      if(horizontal)positions.push(
        along,0,-(thickness/2-inset), along,top,-thickness/2,
        along,0,thickness/2-inset, along,top-.18,thickness/2);
      else positions.push(
        -(thickness/2-inset),0,along, -thickness/2,top,along,
        thickness/2-inset,0,along, thickness/2,top-.18,along);
    }
    const end=segments*4;
    indices.push(0,1,3,0,3,2, end,end+3,end+1,end,end+2,end+3);
    for(let i=0;i<segments;i++) {
      const a=i*4,b=a+4;
      indices.push(a,b+1,a+1,a,b,b+1, a+2,a+3,b+3,a+2,b+3,b+2,
        a+1,b+1,b+3,a+1,b+3,a+3, a,b+2,b,a,b+2,a+2);
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);
    geometry.computeVertexNormals();add(geometry,stoneDark,x,0,z);
    const count=Math.max(4,Math.ceil(length/4.0));
    for(let i=0;i<count;i++) {
      const t=(i+.5)/count,along=-length/2+t*length;
      if(i%2===0) {
        const trunkX=x+(horizontal?along:0),trunkZ=z+(horizontal?0:along),trunkH=3.8+seedValue(i,72)*2.3;
        add(new THREE.CylinderGeometry(.13,.23,trunkH,10),bark,trunkX,trunkH/2+2.0,trunkZ);
        for(let crown=0;crown<3;crown++) {
          const a=crown*2.1+seedValue(i,crown)*.8;
          const foliage=add(new THREE.IcosahedronGeometry(.82+seedValue(i,crown+90)*.28,2),
            crown%2?leafLight:leaf,trunkX+Math.cos(a)*.38,trunkH+1.7+crown*.25,trunkZ+Math.sin(a)*.38);
          foliage.scale.set(1.15,.82,1.05);
        }
      }
    }
  }

  // Four monumental openings identify the covered undercroft from every side.
  function gateArch(x,y,axis='x',width=80,height=2.48) {
    const c=arena(x,y),span=width*SCALE,alongX=axis==='x',depth=.54,column=.38;
    const archRadius=span*.42,archTube=.16;
    const spring=Math.max(.72,height-archRadius-archTube-.05);
    for(const sign of [-1,1])box(alongX?column:depth,spring,alongX?depth:column,
      c.x+(alongX?sign*archRadius:0),spring/2,
      c.z+(alongX?0:sign*archRadius),stoneLight,.07);
    const arch=add(new THREE.TorusGeometry(archRadius,archTube,8,32,Math.PI),stoneLight,c.x,spring,c.z);
    if(!alongX)arch.rotation.y=Math.PI/2;
    box(alongX?.28:.48,.30,alongX?.48:.28,c.x,height-.18,c.z,stoneDark,.045);
    box(alongX?archRadius*1.1:.20,.03,alongX?.20:archRadius*1.1,c.x,height-.015,c.z,moss,.012);
  }

  // The playable sanctuary is one precinct of a much larger ruin. This
  // stepped northern monument sits behind the boundary cliff, providing a
  // strong skyline, believable destination, and several layers of depth.
  function monumentalBackdrop() {
    const c=arena(map.width/2,-100),backStone=material('#515b4d'),recess=material('#202a25');
    const tiers=[
      [28,1.25,9,0.63,0],
      [23.5,1.45,7.3,1.78,-.45],
      [18.5,1.65,5.7,3.22,-.82],
      [13.5,1.75,4.3,4.70,-1.12],
    ];
    for(const [w,h,d,y,z] of tiers) {
      box(w,h,d,c.x,y,c.z+z,backStone,.12);
      box(w-.55,.15,d+.12,c.x,y+h*.48,c.z+z,stoneLight,.045);
      box(w*.42,.035,d*.18,c.x-w*.18,y+h*.58,c.z+z+d*.32,moss,.012);
    }
    // A broad central stair visually connects the distant temple to the
    // playable processional axis, even though the cliff keeps it out of play.
    for(let i=0;i<13;i++) {
      const h=.22+i*.37;
      box(5.4,h,.48,c.x,h/2,c.z+5.05-i*.43,i%4===0?stoneLight:stone,.025);
    }
    box(8.4,3.6,3.2,c.x,7.05,c.z-1.38,stone,.10);
    box(4.1,2.55,.16,c.x,6.75,c.z+.27,recess,.035);
    for(const sign of [-1,1])for(const offset of [1.25,3.1]) {
      const column=add(new THREE.CylinderGeometry(.28,.34,3.25,12),stoneLight,
        c.x+sign*offset,6.92,c.z+.42);
      column.rotation.y=.12*sign;
      box(.78,.20,.72,c.x+sign*offset,8.55,c.z+.42,stoneDark,.035);
    }
    box(9.7,.55,3.8,c.x,9.10,c.z-1.28,stoneDark,.10);
    box(7.9,.18,4.15,c.x,9.45,c.z-1.20,stoneLight,.055);
    // Forest silhouettes break the stepped mass into the surrounding canopy.
    for(let i=0;i<8;i++) {
      const sign=i<4?-1:1,index=i%4,trunkX=c.x+sign*(8.5+index*2.35),trunkH=5.8+seedValue(i,130)*3.5;
      add(new THREE.CylinderGeometry(.17,.30,trunkH,9),bark,trunkX,trunkH/2+1.2,c.z-1.4-index*.35);
      const crown=add(new THREE.IcosahedronGeometry(1.2+seedValue(i,170)*.4,2),i%2?leafLight:leaf,
        trunkX,trunkH+1.0,c.z-1.4-index*.35);
      crown.scale.set(1.25,.82,1.05);
    }
  }

  walls.forEach((solid,index)=>solid.kind==='boundary'?jungleCliff(solid,index):masonryWall(solid));
  const scale=map.width/1300;
  gateArch(280*scale,510*scale,'y',80*scale);
  gateArch(1020*scale,510*scale,'y',80*scale);
  gateArch(650*scale,180*scale,'x',80*scale);
  gateArch(650*scale,620*scale,'x',80*scale);
  monumentalBackdrop();

  group.name='overgrown-temple-environment';
  return group;
}
