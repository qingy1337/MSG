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
  if (bot && map.upperBotSpawns && index<map.upperBotSpawns.length) return {...map.upperBotSpawns[index]};
  if (bot) return { x:map.botSpawn.x+(index%3)*55, y:map.botSpawn.y+Math.floor(index/3)*55 };
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
  const step=10, clearance=18, cols=map.width/step, rows=map.height/step, solids=[...walls,...map.terrain].filter(s=>s.kind!=='exitDoor'&&(s.bottom||0)<2.2);
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
// PvE grows open-ended architectural fragments around an off-centre landmark.
// The old scatter generator above remains the independent PvP layout.
function generatePveFloor(seed = Math.floor(Math.random()*0x100000000), floor = 1, recent = [], attempt = 0) {
  const random=floorRandom(seed),pick=n=>Math.floor(random()*n);
  const [width,height]=[[1800,1200],[2400,1200],[1800,1800],[1800,2100]][pick(4)];
  const arrivalElevator={x:40,y:height/2-110,width:160,height:220,ceiling:3.4};
  const elevator={...arrivalElevator,x:width-200,facing:'west'};
  const theme=['atrium','turbine','freight'][pick(3)];
  const names={atrium:'COLUMN ATRIUM',turbine:'TURBINE HALL',freight:'FREIGHT DEPOT'};
  const accent={atrium:'#70bcae',turbine:'#e0b46b',freight:'#86abd6'}[theme];
  const choices=['district','overlook','bridge','courtyard','flat'].filter(s=>!recent.slice(-2).includes(s));
  const composition=attempt>=3?'flat':choices[pick(choices.length)];
  const map={mode:'pve',width,height,ceiling:7.5,floor,seed:seed>>>0,elevator,arrivalElevator,composition,
    botSpawn:{x:width-460,y:height/2-100},terrain:[],pockets:[],cutouts:[],landmark:{theme,name:names[theme],accent}};
  const walls=[
    {x:0,y:0,width,height:12,top:7.5},{x:0,y:height-12,width,height:12,top:7.5},
    {x:0,y:12,width:12,height:height-24,top:7.5},{x:width-12,y:12,width:12,height:height-24,top:7.5},
  ];
  for(const e of [arrivalElevator,elevator])for(const s of [
    {x:0,y:0,width:10,height:220},{x:10,y:0,width:150,height:10},
    {x:10,y:210,width:150,height:10},{x:150,y:10,width:10,height:50},{x:150,y:160,width:10,height:50}])
    walls.push({...s,x:e.x+(e.facing==='west'?160-s.x-s.width:s.x),y:e.y+s.y,top:3.4,kind:'cabin'});
  const reserved=[... [arrivalElevator,elevator].map(e=>({x:e.x-48,y:e.y-28,width:256,height:276})),
    {x:map.botSpawn.x-32,y:map.botSpawn.y-32,width:174,height:229}];
  const district=composition==='district', districtSouth=random()<0.5;
  // Remove substantial corners from the playable footprint. These ceiling-high
  // volumes are shared by rendering, movement, navigation, and hitscan, so the
  // outline is a real boundary, not just a cosmetic floor mask.
  const corners=[0,1,2,3];
  for(let i=corners.length-1;i>0;i--){const j=pick(i+1);[corners[i],corners[j]]=[corners[j],corners[i]];}
  const availableCorners=district?corners.filter(c=>districtSouth?c<2:c>=2):corners;
  for(const corner of availableCorners.slice(0,1+pick(availableCorners.length))) {
    const width=300+pick(201),height=200+pick(161);
    const cut={x:corner%2?map.width-12-width:12,y:corner>=2?map.height-12-height:12,width,height,top:map.ceiling,kind:'boundary'};
    map.cutouts.push(cut);walls.push(cut);
  }
  function place(unit,landmark=false) {
    for(let attempt=0;attempt<80;attempt++) {
      const transpose=random()<0.5,mirror=random()<0.5;
      const originalWidth=Math.max(...unit.map(s=>s.x+s.width));
      const parts=unit.map(source=>{
        const s={...source};
        if(mirror){s.x=originalWidth-s.x-s.width;if(s.axis==='x')s.reverse=!s.reverse;}
        if(transpose){[s.x,s.y]=[s.y,s.x];[s.width,s.height]=[s.height,s.width];
          if(s.axis)s.axis=s.axis==='x'?'y':'x';}
        return s;
      });
      const width=Math.max(...parts.map(s=>s.x+s.width)),height=Math.max(...parts.map(s=>s.y+s.height));
      // A final safe anchor guarantees the main feature without a random retry loop.
      const x=landmark&&attempt===79?548:64+pick(map.width-width-128);
      const y=landmark&&attempt===79?220:64+pick(map.height-height-128);
      const bounds={x,y,width,height},apron=landmark?48:22;
      if(reserved.some(r=>rectanglesOverlap(bounds,r,apron))||[...walls,...map.terrain].some(r=>rectanglesOverlap(bounds,r,apron)))continue;
      const wc=walls.length,tc=map.terrain.length;
      for(const s of parts)(s.kind?map.terrain:walls).push({...s,x:s.x+x,y:s.y+y,...(s.kind?{accent}:{})});
      if(floorConnected(map,walls)) {
        reserved.push({x:x-apron,y:y-apron,width:width+2*apron,height:height+2*apron});
        return bounds;
      }
      walls.length=wc;map.terrain.length=tc;
    }
    return null;
  }
  const top=[2.8,3.2,3.8][pick(3)],steps=Math.ceil(top/0.18);
  const size=pick(3);
  const rail=(x,y,width,height,extra={})=>({kind:'rail',x,y,width,height,bottom:top,top:top+1,...extra});
  if(district) {
    // A genuine upper district: 25% of the whole map, flush with two outer
    // walls. Both stairways and the cargo lift open onto its exposed frontage.
    const districtParts=[
      {kind:'tower',walkable:true,x:12,y:12,width:1200,height:450,top},
      ...[330,980].flatMap(x=>[
        {kind:'ramp',stairs:true,steps,x,y:462,width:120,height:220,axis:'y',reverse:true,top},
        rail(x-6,462,6,220,{axis:'y',rise:top,reverse:true,bottom:0}),
        rail(x+120,462,6,220,{axis:'y',rise:top,reverse:true,bottom:0}),
      ]),
      {kind:'lift',id:'cargo',x:690,y:462,width:120,height:120,top:0,maxTop:top},
      rail(684,462,6,120,{liftId:'cargo',bottom:0,top:1}),
      rail(810,462,6,120,{liftId:'cargo',bottom:0,top:1}),
      ...[[12,312],[456,228],[816,158],[1106,106]].map(([x,width])=>rail(x,462,width,6)),
      rail(1212,12,6,450),
      {kind:'generator',x:90,y:80,width:140,height:64,bottom:top,top:top+1.6},
      {kind:'cover',x:470,y:110,width:180,height:32,bottom:top,top:top+1.1},
      {kind:'cover',x:850,y:80,width:36,height:150,bottom:top,top:top+1.5},
      {kind:'cover',x:150,y:340,width:100,height:40,bottom:top,top:top+1.1},
      {kind:'generator',x:720,y:330,width:110,height:55,bottom:top,top:top+1.2},
      {kind:'pillar',x:1070,y:320,width:44,height:44,bottom:top,top:top+2.1},
    ];
    for(const source of districtParts) {
      const s={...source,accent};
      if(districtSouth){s.y=map.height-s.y-s.height;if(s.axis==='y')s.reverse=!s.reverse;}
      map.terrain.push(s);
    }
    map.landmark.size='upper-district';
    map.landmark.bounds={x:12,y:districtSouth?map.height-682:12,width:1206,height:670};
    reserved.push({x:map.landmark.bounds.x-48,y:map.landmark.bounds.y-48,
      width:map.landmark.bounds.width+96,height:map.landmark.bounds.height+96});
    map.upperBotSpawns=[260,620,990].map(x=>({x,y:districtSouth?map.height-280:280,height:top}));
  }
  const parts=[
    {kind:'tower',walkable:true,x:200,y:210,width:280,height:280,top},
    {kind:'ramp',stairs:true,steps,x:20,y:300,width:180,height:100,axis:'x',top},
    {kind:'ramp',stairs:true,steps,x:480,y:300,width:180,height:100,axis:'x',reverse:true,top},
    // The lift always has stairs as an alternative. Its solid telescoping base
    // prevents entering underneath the moving deck and being crushed.
    {kind:'lift',id:'cargo',x:280,y:90,width:120,height:120,top:0,maxTop:top},
    rail(274,90,6,120,{liftId:'cargo',bottom:0,top:1}),
    rail(400,90,6,120,{liftId:'cargo',bottom:0,top:1}),
    rail(200,204,80,6),rail(400,204,80,6),rail(200,490,280,6),
    rail(194,210,6,84),rail(194,406,6,84),rail(480,210,6,84),rail(480,406,6,84),
    ...[294,400].flatMap(y=>[rail(20,y,180,6,{axis:'x',rise:top,bottom:0}),
      rail(480,y,180,6,{axis:'x',rise:top,reverse:true,bottom:0})]),
    // Furnishing has a real elevated bottom, so shots and movement agree.
    {kind:theme==='turbine'?'generator':'cover',x:225,y:235,width:48,height:42,bottom:top,top:top+1.1},
    {kind:theme==='atrium'?'pillar':'cover',x:410,y:430,width:42,height:42,bottom:top,top:top+(theme==='atrium'?2.1:0.9)},
  ];
  // Stretch the working area, not the steps, guard thickness, or cargo deck.
  // Keep the lift centred and the two stair approaches opposite each other.
  function expandedParts(size) {
    const extraX=[0,120,240][size],extraY=[0,80,160][size];
    const stairExtra=top>3.2?40:0;
    return parts.map(source=>{
      const s={...source};
      if(s.walkable){s.width+=extraX;s.height+=extraY;}
      else if(s.kind==='lift'||s.liftId){s.x+=extraX/2;}
      else if(s.stairs||s.axis){
        s.y+=extraY/2;s.width+=stairExtra;
        if(s.x===20)s.x-=stairExtra;else s.x+=extraX;
      } else if(s.kind==='rail') {
        if(s.y===204){
          s.width+=extraX/2;if(s.x===400)s.x+=extraX/2;
        } else if(s.y===490){s.y+=extraY;s.width+=extraX;}
        else {
          if(s.x===480)s.x+=extraX;
          s.height+=extraY/2;if(s.y===406)s.y+=extraY/2;
        }
      } else {
        if(s.x>340)s.x+=extraX;
        if(s.y>350)s.y+=extraY;
      }
      s.x+=stairExtra+20;
      return s;
    });
  }
  // Tight irregular outlines can fall back to a smaller complete assembly.
  for(let variant=size;composition==='overlook'&&variant>=0;variant--) {
    map.landmark.bounds=place(expandedParts(variant),true);
    if(map.landmark.bounds){map.landmark.size=['overlook','workshop','upper-yard'][variant];break;}
  }
  if(composition==='bridge'||composition==='courtyard') {
    // Parameterised wings around a lower court. A bridge can connect their
    // upper routes, while the ground route remains open underneath it.
    const wing=150+pick(4)*20,depth=260+pick(4)*40,gap=180+pick(3)*40;
    const rise=2.8,run=220;
    const assembly=[0,wing+gap].flatMap(x=>[
      {kind:'tower',walkable:true,x,y:0,width:wing,height:depth,top:rise},
      {kind:'ramp',stairs:true,steps:16,x:x+(wing-100)/2,y:depth,width:100,height:run,axis:'y',reverse:true,top:rise},
      {kind:'cover',x:x+20,y:20,width:60,height:30,bottom:rise,top:rise+1},
      {kind:'rail',x,y:-6,width:wing,height:6,bottom:rise,top:rise+1},
      ...[x-6,x+wing].flatMap(side=>[
        {kind:'rail',x:side,y:0,width:6,height:60,bottom:rise,top:rise+1},
        {kind:'rail',x:side,y:160,width:6,height:depth-160,bottom:rise,top:rise+1},
        ...(composition==='courtyard'?[{kind:'rail',x:side,y:60,width:6,height:100,bottom:rise,top:rise+1}]:[]),
      ]),
      ...[-6,100].map(offset=>({kind:'rail',x:x+(wing-100)/2+offset,y:depth,width:6,height:run,
        axis:'y',reverse:true,rise,bottom:0,top:rise+1})),
    ]);
    if(composition==='bridge')assembly.push(
      {kind:'tower',walkable:true,x:wing,y:60,width:gap,height:100,bottom:2.55,top:rise},
      ...[54,160].map(y=>({kind:'rail',x:wing+6,y,width:gap-12,height:6,bottom:rise,top:rise+1})),
    );
    map.landmark.bounds=place(assembly,true);
    map.landmark.size=composition;
  }
  if(composition==='flat') {
    map.landmark.size='machine-court';
    map.landmark.bounds=place([
      {kind:'generator',x:0,y:0,width:150,height:65,top:2.1},
      {kind:'generator',x:240,y:110,width:100,height:95,top:1.8},
      {kind:'pillar',x:30,y:210,width:44,height:44,top:map.ceiling-0.1},
    ]);
  }
  if(!district&&random()<0.6&&map.terrain.some(s=>s.walkable)) {
    const deck=map.terrain.find(s=>s.walkable);
    // A squad on the clear centre of the permanent deck, never on a moving lift.
    map.upperBotSpawns=Array.from({length:3},(_,i)=>({
      x:deck.x+deck.width/2+(i-1)*55,y:deck.y+deck.height/2,height:deck.top,
    }));
  }
  // Unequal broken enclosures define places without a repeated room graph.
  // Each has an open side and a second opening; heights mix shelter and sightlines.
  for(let i=0,count=3+pick(4);i<count;i++) {
    const width=230+pick(100),depth=160+pick(100),gap=100+pick(51),height=i===0||random()<0.35?map.ceiling:3.1+pick(3)*1.2;
    const split=40+pick(width-gap-64),shape=pick(3);
    const unit=[{x:0,y:0,width:split,height:24,top:height},
      {x:split+gap,y:0,width:width-split-gap,height:24,top:height},
      {x:0,y:24,width:24,height:depth-24,top:height}];
    if(shape===1)unit.push({x:24,y:depth-24,width:width*0.5,height:24,top:3.1});
    if(shape===2)unit.push({x:width-24,y:24,width:24,height:depth*0.4,top:height});
    const bounds=place(unit);
    if(bounds)map.pockets.push({...bounds,shape});
  }
  for(let i=0,count=Math.round((10+pick(6))*Math.sqrt(map.width*map.height/(1800*1200)));i<count;i++)place([{x:0,y:0,width:90+pick(190),height:24,top:i===0||random()<0.25?map.ceiling:3.1}]);
  for(let i=0,count=3+pick(3);i<count;i++)place([{kind:'cover',x:0,y:0,width:65+pick(50),height:40,top:1.15}]);
  if(typeof module!=='undefined'&&module.exports && !require('../game/terrainValidation').raisedTerrainConnected(map,walls)) {
    return generatePveFloor((seed+0x9e3779b9)>>>0,floor,recent,attempt+1);
  }
  // Doors are added after static connectivity validation: this gate is
  // intentionally locked until combat ends, not a permanently isolated room.
  map.terrain.push({kind:'exitDoor',x:elevator.x,y:elevator.y+60,width:10,height:100,top:elevator.ceiling});
  return {map,walls};
}
if(typeof module!=='undefined'&&module.exports)module.exports={LIFT_TIMING,floorRandom,rectanglesOverlap,inElevator,elevatorSample,floorSpawn,floorConnected,generateScatterFloor,generatePveFloor,updateExitDoor};
