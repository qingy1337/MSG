// Seeded scatter generation: validate routes instead of reserving a street grid.
const LIFT_TIMING = Object.freeze({ close: 1200, travel: 3600, open: 1200, rise: 10 });
function floorRandom(seed) {
  let state = seed >>> 0;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}
function rectanglesOverlap(a, b, gap = 0) {
  return a.x < b.x+b.width+gap && a.x+a.width+gap > b.x && a.y < b.y+b.height+gap && a.y+a.height+gap > b.y;
}
function inElevator(player, map) {
  const e = map.elevator;
  // Cabin walls/door collider are 10 units thick. Match canOccupy's 16-unit
  // player radius and 0.1 collision tolerance, including wall-hugging riders.
  const inset=10+16-0.1-1e-6;
  return !!e && player.x >= e.x+inset && player.x <= e.x+e.width-inset &&
    player.y >= e.y+inset && player.y <= e.y+e.height-inset && (player.height || 0) < 0.1;
}
function elevatorSample(state, now) {
  const ease = t => { t=Math.max(0,Math.min(1,t)); return t*t*t*(t*(t*6-15)+10); };
  const elapsed = Math.max(0, now-state.startedAt);
  if (state.phase === 'riding') return {
    door: 1-ease(elapsed/LIFT_TIMING.close),
    rise: LIFT_TIMING.rise*ease((elapsed-LIFT_TIMING.close)/LIFT_TIMING.travel),
  };
  if (state.phase === 'opening') return { door:ease(elapsed/LIFT_TIMING.open), rise:0 };
  return {door:1,rise:0};
}
function floorSpawn(map, bot, index) {
  if (bot && map.botSpawns?.length) return {...map.botSpawns[index%map.botSpawns.length]};
  if (bot && map.upperBotSpawns && index<map.upperBotSpawns.length) return {...map.upperBotSpawns[index]};
  if (bot) return { x:map.botSpawn.x+(index%3)*55, y:map.botSpawn.y+Math.floor(index/3)*55 };
  if(map.playerSpawns?.length)return {...map.playerSpawns[index%map.playerSpawns.length]};
  const e=map.arrivalElevator||map.elevator;
  return { x:e.x+40+(index%3)*40, y:e.y+40+Math.floor(index/3)*40 };
}

// Shared door collider state: rendering, prediction, hitscan and authority agree.
function updateExitDoor(map,state,now) {
  const door=map.terrain.find(s=>s.kind==='exitDoor');
  if(!door)return;
  const open=state.phase==='ready' && now-state.startedAt>=LIFT_TIMING.open;
  door.bottom=open?map.ceiling:0;door.top=open?map.ceiling:map.elevator.ceiling;
}

function floorConnected(map, walls) {
  const step=10, clearance=18, cols=map.width/step, rows=map.height/step, solids=[...walls,...map.terrain].filter(s=>
    s.kind!=='exitDoor'&&s.kind!=='ramp'&&(s.bottom||0)<2.2);
  const free=new Uint8Array(cols*rows), seen=new Uint8Array(cols*rows);
  // Rasterise just each obstacle's neighbourhood instead of comparing every
  // map cell against every wall. At 10-unit spacing, 18-unit clearance also
  // leaves a safe continuous path for the 16-radius body between neighbours.
  for(let row=0;row<rows;row++) for(let col=0;col<cols;col++) {
    const x=col*step+step/2,y=row*step+step/2;
    if(x<28||x>map.width-28||y<28||y>map.height-28) continue;
    free[row*cols+col]=1;
  }
  for(const s of solids) {
    const left=Math.max(0,Math.floor((s.x-clearance)/step));
    const right=Math.min(cols-1,Math.floor((s.x+s.width+clearance)/step));
    const first=Math.max(0,Math.floor((s.y-clearance)/step));
    const last=Math.min(rows-1,Math.floor((s.y+s.height+clearance)/step));
    for(let row=first;row<=last;row++)for(let col=left;col<=right;col++) {
      const x=col*step+step/2,y=row*step+step/2;
      const dx=x-Math.max(s.x,Math.min(x,s.x+s.width));
      const dy=y-Math.max(s.y,Math.min(y,s.y+s.height));
      if(dx*dx+dy*dy<clearance*clearance)free[row*cols+col]=0;
    }
  }
  const total=free.reduce((sum,value)=>sum+value,0);
  const spawn=floorSpawn(map,false,0), start=Math.floor(spawn.y/step)*cols+Math.floor(spawn.x/step);
  if(!free[start]) return false;
  const queue=[start];seen[start]=1;
  for(let i=0;i<queue.length;i++) {
    const index=queue[i],col=index%cols;
    for(const next of [col>0?index-1:-1,col<cols-1?index+1:-1,index-cols,index+cols])
      if(next>=0&&next<free.length&&free[next]&&!seen[next]){seen[next]=1;queue.push(next);}
  }
  return queue.length===total;
}

function generateScatterFloor(seed = Math.floor(Math.random()*0x100000000), floor = 1) {
  const random=floorRandom(seed), pick=n=>Math.floor(random()*n);
  const elevator={x:40,y:490,width:160,height:220,ceiling:3.4};
  const map={mode:'pve',width:1800,height:1200,ceiling:7.5,floor,seed:seed>>>0,elevator,
    botSpawn:{x:1600,y:180+pick(600)},terrain:[]};
  const walls=[
    {x:0,y:0,width:1800,height:12,top:7.5}, {x:0,y:1188,width:1800,height:12,top:7.5},
    {x:0,y:12,width:12,height:1176,top:7.5}, {x:1788,y:12,width:12,height:1176,top:7.5},
  ];
  // Cabin structure is physics geometry, drawn separately with moving doors.
  for(const s of [{x:40,y:490,width:10,height:220},{x:50,y:490,width:150,height:10},
    {x:50,y:700,width:150,height:10},{x:190,y:500,width:10,height:50},{x:190,y:650,width:10,height:50}])
    walls.push({...s,top:3.4,kind:'cabin'});
  // Only protect actual spawn space and the cabin threshold, not map-wide aisles.
  const reserved=[{x:28,y:478,width:216,height:244},
    {x:map.botSpawn.x-32,y:map.botSpawn.y-32,width:174,height:229}];
  function place(unit, attempts=60) {
    const unitWidth=Math.max(...unit.map(s=>s.x+s.width));
    for(let attempt=0;attempt<attempts;attempt++) {
      const vertical=random()<0.5, reverse=random()<0.5;
      const parts=unit.map(source=>{
        const s={...source};
        if(reverse){s.x=unitWidth-s.x-s.width;if(s.kind==='ramp')s.reverse=!s.reverse;}
        if(vertical){[s.x,s.y]=[s.y,s.x];[s.width,s.height]=[s.height,s.width];if(s.kind==='ramp')s.axis='y';}
        return s;
      });
      const width=Math.max(...parts.map(s=>s.x+s.width)),height=Math.max(...parts.map(s=>s.y+s.height));
      const x=52+pick(map.width-width-104),y=52+pick(map.height-height-104);
      // Leave a short landing at ramp toes; ordinary walls need no such apron.
      const apron=unit.some(s=>s.kind==='ramp')?28:0;
      const bounds={x:x-apron,y:y-apron,width:width+2*apron,height:height+2*apron};
      const solids=[...walls,...map.terrain];
      if(reserved.some(r=>rectanglesOverlap(bounds,r,12))||solids.some(r=>rectanglesOverlap(bounds,r,12)))continue;
      for(const s of parts){s.x+=x;s.y+=y;}
      const wallCount=walls.length,terrainCount=map.terrain.length;
      for(const s of parts)(s.kind?map.terrain:walls).push(s);
      // Roll back the entire assembly if it isolates any walkable ground.
      // Every accepted layout stays playable, so no destructive final cleanup.
      if(floorConnected(map,walls)){reserved.push(bounds);return true;}
      walls.length=wallCount;map.terrain.length=terrainCount;
    }
    return false;
  }
  // One or two raised overlooks, down from roughly five per floor.
  const overlooks=1+pick(2);
  for(let i=0;i<overlooks;i++) {
    const top=2.2+pick(4)*0.2;
    place([{kind:'tower',x:180,y:0,width:110,height:120,top},
      {kind:'ramp',x:0,y:20,width:180,height:80,top,axis:'x'}]);
  }
  // Recognisable but open-ended landmarks: L-shaped cover, a column court,
  // and machinery islands. All collision is the same geometry as rendering.
  const landmarks=[
    [{x:0,y:0,width:220,height:24,top:3.1},
      {x:0,y:24,width:24,height:150,top:3.1},
      {kind:'cover',x:110,y:100,width:80,height:40,top:1.15}],
    [0,1,2,3].map(i=>({kind:'pillar',x:(i%2)*150,y:Math.floor(i/2)*150,width:48,height:48,top:5.6})),
    [{kind:'generator',x:0,y:0,width:140,height:64,top:2.1},
      {kind:'cover',x:30,y:132,width:80,height:40,top:1.15}],
  ];
  for(const unit of landmarks)place(unit);
  // PvP-style independent horizontal/vertical walls, scattered across the floor.
  for(let i=0;i<23;i++)place([{x:0,y:0,width:90+pick(190),height:24,top:3.1}],25);
  for(let i=0;i<3;i++)place([{kind:'cover',x:0,y:0,width:65+pick(65),height:40,top:1.15}],25);
  return {map,walls};
}
// PvE architecture is compiled by proceduralPve.js; this file keeps the
// shared spawn, connectivity and elevator contracts used by client/server.
const proceduralPve=typeof module!=='undefined'&&module.exports?require('./proceduralPve.js'):
  {generateProceduralPveFloor:globalThis.generateProceduralPveFloor};
function generatePveFloor(seed = Math.floor(Math.random()*0x100000000), floor = 1, recent = [], attempt = 0) {
  const layout=proceduralPve.generateProceduralPveFloor(seed,floor,recent);
  // Generated doorway topology is normally valid by construction. Keep one
  // cheap authority-side proof and regenerate from a deterministic next seed
  // if furnishing ever narrows a connector too far.
  if(!floorConnected(layout.map,layout.walls)&&attempt<8)
    return generatePveFloor((seed+0x9e3779b9)>>>0,floor,recent,attempt+1);
  return layout;
}
if(typeof module!=='undefined'&&module.exports)module.exports={LIFT_TIMING,floorRandom,rectanglesOverlap,inElevator,elevatorSample,floorSpawn,floorConnected,generateScatterFloor,generatePveFloor,updateExitDoor};
