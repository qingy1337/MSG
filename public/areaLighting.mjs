import * as THREE from 'three';

// Architectural anchors, not a random grid. Six local lights is a fixed budget.
export function planAreaLighting(map,walls=[]) {
  if(map.mode!=='pve'||!map.ceiling)return [];
  const lights=[],ceiling=map.ceiling-0.32;
  const add=(kind,x,y,height,color,intensity,radius)=>{
    if(map.cutouts?.some(c=>x>=c.x&&x<=c.x+c.width&&y>=c.y&&y<=c.y+c.height))return;
    // Don't put a fixture inside a ceiling-height partition. Include housing clearance.
    if(walls.some(s=>(s.top||3.1)>ceiling-0.05&&x+40>s.x&&x-40<s.x+s.width&&y+10>s.y&&y-10<s.y+s.height))return;
    lights.push({kind,x,y,height,sourceHeight:ceiling,color,intensity,radius});
  };
  const deck=map.terrain.find(s=>s.walkable);
  if(deck)add('workspace',deck.x+deck.width/2,deck.y+deck.height/2,deck.top,
    '#fff0d3',95,Math.max(deck.width,deck.height)*0.035);
  for(const stair of map.terrain.filter(s=>s.stairs).slice(0,2)) {
    const t=stair.reverse?0.8:0.2;
    add('stairs',stair.x+(stair.axis==='x'?stair.width*t:stair.width/2),
      stair.y+(stair.axis==='y'?stair.height*t:stair.height/2),stair.top*0.2,'#d1e9ff',75,5.5);
  }
  for(const [i,pocket] of (map.pockets||[]).slice(0,2).entries()) {
    add('passage',pocket.x+pocket.width/2,pocket.y+pocket.height/2,0,
      i===0?'#ffd6a0':'#b9dcf0',65,6);
  }
  if(map.elevator)add('entrance',map.elevator.facing==='west'?map.elevator.x-65:map.elevator.x+map.elevator.width+65,
    map.elevator.y+map.elevator.height/2,0,'#d8ffe9',70,5);
  return lights.slice(0,6);
}

export function createAreaLighting(plan,world) {
  const group=new THREE.Group();
  for(const area of plan) {
    const gap=area.sourceHeight-area.height;
    const light=new THREE.SpotLight(area.color,area.intensity,gap+area.radius+4,
      Math.min(1.3,Math.atan2(area.radius,gap)),0.65,1.3);
    light.position.copy(world(area.x,area.y,area.sourceHeight));
    light.target.position.copy(world(area.x,area.y,area.height));
    // The floor shader already occludes every light pool against walls. Keep a
    // single architectural shadow caster for characters rather than rendering
    // the room into as many as six extra shadow maps.
    light.castShadow=area.kind==='workspace';
    light.shadow.mapSize.set(512,512);
    light.shadow.normalBias=0.035;light.shadow.bias=-0.0001;
    light.shadow.camera.near=0.1;
    group.add(light,light.target);
    const housing=new THREE.Mesh(new THREE.BoxGeometry(area.kind==='workspace'?3.8:1.5,0.14,0.65),
      new THREE.MeshStandardMaterial({color:'#34444b',roughness:0.65,metalness:0.4}));
    housing.position.copy(light.position);housing.position.y+=0.08;
    group.add(housing);
    const diffuser=new THREE.Mesh(new THREE.BoxGeometry(area.kind==='workspace'?3.5:1.3,0.035,0.5),
      new THREE.MeshBasicMaterial({color:area.color}));
    diffuser.position.copy(light.position);diffuser.position.y-=0.01;group.add(diffuser);
  }
  return group;
}
