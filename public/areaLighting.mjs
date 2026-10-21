import * as THREE from 'three';

// Architectural anchors, not a random grid. Six local lights is a fixed budget.
export function planAreaLighting(map,walls=[]) {
  if(map.style==='airport') {
    const roofAt=ratio=>map.ceiling-.40-1.28*(ratio*2-1)**2;
    // Six shadow-free architectural pools follow the rebuilt terminal's real
    // functions: processing, the warm market, two gate rooms, and the gallery.
    return [
      {kind:'airport-checkin',x:map.width*.50,y:map.height*.86,height:0,sourceHeight:roofAt(.50),
        color:'#bde8ff',intensity:82,radius:10.5,castsShadow:false},
      {kind:'airport-security',x:map.width*.50,y:map.height*.66,height:0,sourceHeight:roofAt(.50),
        color:'#8fd4ff',intensity:92,radius:9.5,castsShadow:false},
      {kind:'airport-market',x:map.width*.50,y:map.height*.43,height:0,sourceHeight:roofAt(.50),
        color:'#ffd49a',intensity:104,radius:12.5,castsShadow:false},
      {kind:'airport-gates-west',x:map.width*.25,y:map.height*.17,height:0,sourceHeight:roofAt(.25),
        color:'#d8f3ff',intensity:86,radius:11.5,castsShadow:false},
      {kind:'airport-gates-east',x:map.width*.75,y:map.height*.17,height:0,sourceHeight:roofAt(.75),
        color:'#d8f3ff',intensity:86,radius:11.5,castsShadow:false},
      {kind:'airport-gallery',x:map.width*.50,y:map.height*.33,height:4.1,sourceHeight:roofAt(.50),
        color:'#ffe7bd',intensity:78,radius:10,castsShadow:false},
    ];
  }
  if(map.mode!=='pve'||!map.ceiling)return [];
  const lights=[],ceiling=map.ceiling-0.32;
  const add=(kind,x,y,height,color,intensity,radius,sourceHeight=ceiling)=>{
    if(map.cutouts?.some(c=>x>=c.x&&x<=c.x+c.width&&y>=c.y&&y<=c.y+c.height))return;
    // Don't put a fixture inside a ceiling-height partition. Include housing clearance.
    if(walls.some(s=>(s.top||3.1)>sourceHeight-0.05&&x+40>s.x&&x-40<s.x+s.width&&y+10>s.y&&y-10<s.y+s.height))return;
    const area={kind,x,y,height,sourceHeight,color,intensity,radius};lights.push(area);return area;
  };
  if(map.zones?.length) {
    const colors={cool:'#c5e7ff',warm:'#ffd19a',clean:'#e7fff8',green:'#a6ffd1',amber:'#ffc378',
      reactor:'#78ffd0',red:'#ff957c',shaft:'#ffb07d',neutral:'#d8e8e8'};
    const priorities=['hall','pit','warehouse','lower','upper','bypass','control','shaft','service','arrival','exit','dispatch'];
    const ordered=[...map.zones].sort((a,b)=>priorities.indexOf(a.id)-priorities.indexOf(b.id));
    for(const z of ordered) {
      if(lights.length>=6)break;
      const localCeiling=Math.min(ceiling,(z.ceiling||map.ceiling)-.18);
      if(localCeiling<=z.elevation+2.25)continue;
      const lantern=map.terrain?.find(s=>s.kind==='grandLantern'&&s.zone===z.id);
      const area=add(z.role,lantern?lantern.x+lantern.width/2:z.x+z.width/2,
        lantern?lantern.y+lantern.height/2:z.y+z.height/2,z.elevation,
        lantern?'#ffc66d':colors[z.lighting]||colors.neutral,lantern?118:z.id==='hall'||z.id==='pit'?105:78,
        lantern?Math.max(9,Math.min(15,Math.max(z.width,z.height)*.03)):Math.max(5,Math.min(12,Math.max(z.width,z.height)*.027)),
        lantern?Math.min(localCeiling,lantern.bottom+.45):localCeiling);
      if(area&&lantern)area.fixture='lantern';
    }
    if(lights[0])lights[0].castsShadow=true;
    return lights;
  }
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
    light.castShadow=area.castsShadow??area.kind==='workspace';
    light.shadow.mapSize.set(512,512);
    light.shadow.normalBias=0.035;light.shadow.bias=-0.0001;
    light.shadow.camera.near=0.1;
    group.add(light,light.target);
    if(area.fixture==='lantern')continue;
    const housing=new THREE.Mesh(new THREE.BoxGeometry(area.castsShadow||area.kind==='workspace'?3.8:1.5,0.14,0.65),
      new THREE.MeshStandardMaterial({color:'#34444b',roughness:0.65,metalness:0.4}));
    housing.position.copy(light.position);housing.position.y+=0.08;
    group.add(housing);
    const diffuser=new THREE.Mesh(new THREE.BoxGeometry(area.castsShadow||area.kind==='workspace'?3.5:1.3,0.035,0.5),
      new THREE.MeshBasicMaterial({color:area.color}));
    diffuser.position.copy(light.position);diffuser.position.y-=0.01;group.add(diffuser);
  }
  return group;
}
