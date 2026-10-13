(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else Object.assign(root,api);
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const CEILING=7.5,EDGE=12;
  const boundary=(width,height,ceiling=CEILING)=>[
    {kind:'boundary',x:0,y:0,width,height:EDGE,top:ceiling},
    {kind:'boundary',x:0,y:height-EDGE,width,height:EDGE,top:ceiling},
    {kind:'boundary',x:0,y:EDGE,width:EDGE,height:height-EDGE*2,top:ceiling},
    {kind:'boundary',x:width-EDGE,y:EDGE,width:EDGE,height:height-EDGE*2,top:ceiling},
  ];
  const wall=(x,y,width,height,top=3.1)=>({x,y,width,height,top});
  const terrain=(kind,x,y,width,height,top,extra={})=>({kind,x,y,width,height,top,...extra});

  const definitions={
    foundry:{
      id:'foundry',name:'Foundry',description:'Furnaces, crane works, and a connected network of high catwalks.',
      width:1800,height:1250,accent:'#f0a55a',
      palette:{sky:'#82969c',wall:'#4f6268',panel:'#a08f79',cap:'#cab897',glow:'#ffad59',
        floorLow:'#303a3d',floorHigh:'#526064',reflection:'#6b7878',reflectionGlow:'#f0a55a'},
      walls:[
        wall(260,690,24,300),wall(1516,690,24,300),
        wall(500,1040,260,24),wall(1040,1040,260,24),
        wall(520,570,180,24),wall(1100,570,180,24),
        wall(710,610,100,24),wall(990,610,100,24),
      ],
      terrain:[
        // The upper works form one continuous combat route. Their raised
        // undersides preserve a second set of lanes at ground level.
        terrain('catwalk',180,150,330,250,3,{bottom:2.75,walkable:true}),
        terrain('catwalk',510,235,225,85,3,{bottom:2.75,walkable:true,bridge:true}),
        terrain('catwalk',735,110,330,330,3,{bottom:2.75,walkable:true}),
        terrain('catwalk',1065,235,225,85,3,{bottom:2.75,walkable:true,bridge:true}),
        terrain('catwalk',1290,150,330,250,3,{bottom:2.75,walkable:true}),
        terrain('catwalk',855,440,90,260,3,{bottom:2.75,walkable:true,bridge:true}),
        terrain('catwalk',750,700,300,110,3,{bottom:2.75,walkable:true}),
        terrain('ramp',260,400,110,230,3,{axis:'y',reverse:true,stairs:true,steps:17}),
        terrain('ramp',1430,400,110,230,3,{axis:'y',reverse:true,stairs:true,steps:17}),
        terrain('ramp',780,810,110,210,3,{axis:'y',reverse:true,stairs:true,steps:16}),

        // Industrial guardrails clearly communicate the walkable route while
        // openings at stairs and bridge joins keep the network flowing.
        terrain('rail',180,143,330,7,4,{style:'industrial',bottom:3}),
        terrain('rail',173,150,7,250,4,{style:'industrial',bottom:3}),
        terrain('rail',180,400,80,7,4,{style:'industrial',bottom:3}),terrain('rail',370,400,140,7,4,{style:'industrial',bottom:3}),
        terrain('rail',253,400,7,230,1,{style:'industrial',axis:'y',rise:3,reverse:true}),
        terrain('rail',370,400,7,230,1,{style:'industrial',axis:'y',rise:3,reverse:true}),
        terrain('rail',510,228,218,7,4,{style:'industrial',bottom:3}),terrain('rail',510,320,218,7,4,{style:'industrial',bottom:3}),
        terrain('rail',735,103,330,7,4,{style:'industrial',bottom:3}),
        terrain('rail',728,110,7,125,4,{style:'industrial',bottom:3}),terrain('rail',728,320,7,120,4,{style:'industrial',bottom:3}),
        terrain('rail',1065,110,7,125,4,{style:'industrial',bottom:3}),terrain('rail',1065,320,7,120,4,{style:'industrial',bottom:3}),
        terrain('rail',735,440,113,7,4,{style:'industrial',bottom:3}),terrain('rail',952,440,113,7,4,{style:'industrial',bottom:3}),
        terrain('rail',1072,228,218,7,4,{style:'industrial',bottom:3}),terrain('rail',1072,320,218,7,4,{style:'industrial',bottom:3}),
        terrain('rail',1290,143,330,7,4,{style:'industrial',bottom:3}),
        terrain('rail',1620,150,7,250,4,{style:'industrial',bottom:3}),
        terrain('rail',1290,400,140,7,4,{style:'industrial',bottom:3}),terrain('rail',1540,400,80,7,4,{style:'industrial',bottom:3}),
        terrain('rail',1423,400,7,230,1,{style:'industrial',axis:'y',rise:3,reverse:true}),
        terrain('rail',1540,400,7,230,1,{style:'industrial',axis:'y',rise:3,reverse:true}),
        terrain('rail',848,440,7,260,4,{style:'industrial',bottom:3}),terrain('rail',945,440,7,260,4,{style:'industrial',bottom:3}),
        terrain('rail',750,693,98,7,4,{style:'industrial',bottom:3}),terrain('rail',952,693,98,7,4,{style:'industrial',bottom:3}),
        terrain('rail',743,700,7,110,4,{style:'industrial',bottom:3}),terrain('rail',1050,700,7,110,4,{style:'industrial',bottom:3}),
        terrain('rail',750,810,30,7,4,{style:'industrial',bottom:3}),terrain('rail',890,810,160,7,4,{style:'industrial',bottom:3}),
        terrain('rail',773,810,7,210,1,{style:'industrial',axis:'y',rise:3,reverse:true}),
        terrain('rail',890,810,7,210,1,{style:'industrial',axis:'y',rise:3,reverse:true}),

        // Recognisable foundry landmarks make the lower floor more than cover:
        // paired smelters, process tanks, pipe runs, a conveyor and bridge crane.
        terrain('furnace',520,760,180,180,4.65,{collisionShape:'circle',collisionRadius:72}),
        terrain('furnace',1100,760,180,180,4.65,{collisionShape:'circle',collisionRadius:72}),
        terrain('tank',325,1020,125,125,3.15,{collisionShape:'circle',collisionRadius:52}),
        terrain('tank',1350,1020,125,125,3.15,{collisionShape:'circle',collisionRadius:52}),
        terrain('pipe',395,535,105,48,1.05,{collisionShape:'capsule',collisionRadius:17}),
        terrain('pipe',1300,535,105,48,1.05,{collisionShape:'capsule',collisionRadius:17}),
        terrain('conveyor',1120,455,290,72,1.15),
        terrain('generator',390,675,105,65,1.85),terrain('generator',1305,675,105,65,1.85),
        terrain('crane',500,500,800,38,6.35,{bottom:5.35}),
      ],
      variants:[
        [terrain('cover',585,1085,110,42,1.15),terrain('cover',1105,1085,110,42,1.15),
          terrain('pipe',805,1120,190,44,0.95,{collisionShape:'capsule',collisionRadius:16})],
        [terrain('conveyor',700,1080,400,68,1.05),terrain('cover',90,760,105,42,1.15),
          terrain('cover',1605,760,105,42,1.15)],
        [terrain('tank',70,920,105,105,2.75,{collisionShape:'circle',collisionRadius:44}),
          terrain('tank',1625,920,105,105,2.75,{collisionShape:'circle',collisionRadius:44}),
          terrain('cover',845,1075,110,42,1.15)],
      ],
      spawns:[
        [80,80],[560,70],[1240,70],[1720,80],[80,625],[1720,625],
        [80,1170],[500,1170],[1300,1170],[1720,1170],
        [280,260,3],[900,200,3],[1520,260,3],[980,755,3],
      ],
    },
    courtyard:{
      id:'courtyard',name:'Courtyard',description:'A broad garden court between two raised galleries.',
      width:1500,height:1300,accent:'#8fd19d',
      palette:{sky:'#b4ced0',wall:'#627b77',panel:'#9fb6a8',cap:'#d0d8b8',glow:'#72e6ba',
        floorLow:'#344744',floorHigh:'#61736a',reflection:'#66827b',reflectionGlow:'#72e6ba'},
      walls:[
        wall(120,220,270,24),wall(390,120,24,220),wall(1110,220,270,24),wall(1086,120,24,220),
        wall(120,1056,270,24),wall(390,960,24,216),wall(1110,1056,270,24),wall(1086,960,24,216),
        wall(565,165,370,24),wall(565,1111,370,24),
      ],
      terrain:[
        terrain('tower',140,500,220,300,2.6,{walkable:true}),
        terrain('ramp',360,600,170,100,2.6,{axis:'x',reverse:true,stairs:true,steps:15}),
        terrain('tower',1140,500,220,300,2.6,{walkable:true}),
        terrain('ramp',970,600,170,100,2.6,{axis:'x',stairs:true,steps:15}),
        terrain('pillar',690,590,120,120,5.9),
        terrain('tree',490,410,38,38,2.8),terrain('tree',972,410,38,38,2.8),
        terrain('tree',490,852,38,38,2.8),terrain('tree',972,852,38,38,2.8),
        terrain('cover',580,485,105,35,1.05),terrain('cover',815,780,105,35,1.05),
      ],
      variants:[
        [terrain('cover',580,790,105,35,1.05),terrain('cover',815,475,105,35,1.05)],
        [terrain('cover',630,355,45,115,1.1),terrain('cover',825,830,45,115,1.1)],
        [terrain('pillar',545,625,38,38,3.8),terrain('pillar',917,625,38,38,3.8)],
      ],
      spawns:[
        [80,80],[350,80],[750,80],[1150,80],[1420,80],[80,390],[1420,390],
        [80,910],[1420,910],[80,1220],[350,1220],[750,1220],[1150,1220],[1420,1220],
      ],
    },
    freight:{
      id:'freight',name:'Freight Terminal',description:'A long cargo hall with a raised loading dock.',
      width:1900,height:1000,accent:'#77b8ee',
      palette:{sky:'#91aabd',wall:'#4e6577',panel:'#829db0',cap:'#c3d1d7',glow:'#66c8ff',
        floorLow:'#293a46',floorHigh:'#506674',reflection:'#617b8a',reflectionGlow:'#66c8ff'},
      walls:[
        wall(300,150,24,280),wall(300,570,24,280),wall(1576,150,24,280),wall(1576,570,24,280),
        wall(500,245,300,24),wall(1100,245,300,24),wall(500,731,300,24),wall(1100,731,300,24),
        wall(380,455,140,24),wall(1380,455,140,24),
      ],
      terrain:[
        terrain('tower',700,400,500,200,2.2,{walkable:true}),
        terrain('ramp',520,450,180,100,2.2,{axis:'x',stairs:true,steps:13}),
        terrain('ramp',1200,450,180,100,2.2,{axis:'x',reverse:true,stairs:true,steps:13}),
        terrain('generator',735,435,120,70,3.55,{bottom:2.2}),
        terrain('generator',1045,495,120,70,3.55,{bottom:2.2}),
        terrain('cover',375,310,115,48,1.3),terrain('cover',1410,642,115,48,1.3),
        terrain('generator',150,455,115,90,1.9),terrain('generator',1635,455,115,90,1.9),
      ],
      variants:[
        [terrain('cover',540,330,130,42,1.2),terrain('cover',1230,628,130,42,1.2)],
        [terrain('cover',410,620,55,130,1.25),terrain('cover',1435,250,55,130,1.25)],
        [terrain('generator',850,135,90,65,1.6),terrain('generator',960,800,90,65,1.6)],
      ],
      spawns:[
        [80,80],[430,80],[950,80],[1470,80],[1820,80],[80,500],[1820,500],
        [80,920],[430,920],[950,920],[1470,920],[1820,920],
      ],
    },
    tower:{
      id:'tower',name:'Tower',description:'A compact vertical arena of wall walks, switchback stairs, and cargo lifts.',
      width:900,height:900,ceiling:15.5,accent:'#ffd166',
      palette:{sky:'#70818e',wall:'#3e4c57',panel:'#71818c',cap:'#c4a96c',glow:'#ffd166',
        floorLow:'#263038',floorHigh:'#46535b',reflection:'#53616a',reflectionGlow:'#ffd166'},
      walls:[],
      terrain:[
        // Level one wraps the north wall and can be reached from either side.
        terrain('catwalk',12,70,318,180,3,{bottom:2.75,walkable:true}),
        terrain('catwalk',330,120,240,70,3,{bottom:2.75,walkable:true,bridge:true}),
        terrain('catwalk',570,70,318,180,3,{bottom:2.75,walkable:true}),
        terrain('ramp',100,250,100,210,3,{axis:'y',reverse:true,stairs:true,steps:18}),

        // A floor-to-floor switchback climbs from level one into the southern
        // wall walk, with a second long staircase rising directly from below.
        terrain('ramp',700,250,100,250,6,{bottom:3,axis:'y',stairs:true,steps:20}),
        terrain('catwalk',600,500,288,150,6,{bottom:5.75,walkable:true}),
        terrain('catwalk',500,580,100,70,6,{bottom:5.75,walkable:true,bridge:true}),
        terrain('catwalk',300,580,200,170,6,{bottom:5.75,walkable:true}),
        // The west cargo platform itself bridges this 90-unit opening at the
        // upper stop. Keeping the shaft clear prevents its deck entering a
        // fixed floor during travel.
        terrain('catwalk',12,600,198,150,6,{bottom:5.75,walkable:true}),
        terrain('catwalk',210,600,90,43,6,{bottom:5.75,walkable:true,bridge:true}),
        terrain('ramp',12,390,70,210,6,{axis:'y',stairs:true,steps:28}),

        // The nine-metre command walk hangs in the middle of the shaft, with
        // open sightlines down onto both lower circulation loops.
        terrain('ramp',360,400,100,180,9,{bottom:6,axis:'y',reverse:true,stairs:true,steps:20}),
        terrain('catwalk',280,240,260,160,9,{bottom:8.75,walkable:true}),

        // Moving shortcuts serve level two and the command walk. Three-sided
        // moving rails leave the landing-facing edge open at the top.
        terrain('lift',210,650,90,90,0,{id:'tower-lift-west',maxTop:6}),
        terrain('rail',210,643,90,7,1,{style:'industrial',liftId:'tower-lift-west'}),
        terrain('rail',210,740,90,7,1,{style:'industrial',liftId:'tower-lift-west'}),
        terrain('rail',203,650,7,90,1,{style:'industrial',liftId:'tower-lift-west'}),
        terrain('lift',540,335,90,90,0,{id:'tower-lift-core',maxTop:9,phaseOffset:7000}),
        terrain('rail',540,328,90,7,1,{style:'industrial',liftId:'tower-lift-core'}),
        terrain('rail',540,425,90,7,1,{style:'industrial',liftId:'tower-lift-core'}),
        terrain('rail',630,335,7,90,1,{style:'industrial',liftId:'tower-lift-core'}),

        // Fixed guardrails outline the exposed paths while deliberately
        // leaving openings at every stair, bridge, and lift landing.
        terrain('rail',12,63,318,7,4,{style:'industrial',bottom:3}),
        terrain('rail',12,250,88,7,4,{style:'industrial',bottom:3}),terrain('rail',200,250,130,7,4,{style:'industrial',bottom:3}),
        terrain('rail',323,70,7,50,4,{style:'industrial',bottom:3}),terrain('rail',323,190,7,60,4,{style:'industrial',bottom:3}),
        terrain('rail',330,113,233,7,4,{style:'industrial',bottom:3}),terrain('rail',330,190,233,7,4,{style:'industrial',bottom:3}),
        terrain('rail',570,63,318,7,4,{style:'industrial',bottom:3}),terrain('rail',807,250,81,7,4,{style:'industrial',bottom:3}),
        terrain('rail',563,70,7,50,4,{style:'industrial',bottom:3}),terrain('rail',563,190,7,60,4,{style:'industrial',bottom:3}),
        terrain('rail',93,250,7,210,1,{style:'industrial',axis:'y',rise:3,reverse:true}),
        terrain('rail',200,250,7,210,1,{style:'industrial',axis:'y',rise:3,reverse:true}),
        terrain('rail',693,250,7,250,4,{style:'industrial',bottom:3,axis:'y',rise:3}),
        terrain('rail',800,250,7,250,4,{style:'industrial',bottom:3,axis:'y',rise:3}),
        terrain('rail',600,493,100,7,7,{style:'industrial',bottom:6}),terrain('rail',800,493,88,7,7,{style:'industrial',bottom:6}),
        terrain('rail',600,650,288,7,7,{style:'industrial',bottom:6}),terrain('rail',593,500,7,80,7,{style:'industrial',bottom:6}),
        terrain('rail',500,573,93,7,7,{style:'industrial',bottom:6}),terrain('rail',500,650,100,7,7,{style:'industrial',bottom:6}),
        terrain('rail',300,573,53,7,7,{style:'industrial',bottom:6}),terrain('rail',467,573,33,7,7,{style:'industrial',bottom:6}),
        terrain('rail',300,750,200,7,7,{style:'industrial',bottom:6}),
        terrain('rail',293,580,7,13,7,{style:'industrial',bottom:6}),terrain('rail',293,740,7,10,7,{style:'industrial',bottom:6}),
        terrain('rail',203,643,7,7,7,{style:'industrial',bottom:6}),terrain('rail',203,740,7,10,7,{style:'industrial',bottom:6}),
        terrain('rail',82,593,218,7,7,{style:'industrial',bottom:6}),terrain('rail',12,750,198,7,7,{style:'industrial',bottom:6}),
        terrain('rail',82,390,7,210,1,{style:'industrial',axis:'y',rise:6}),
        terrain('rail',353,400,7,180,7,{style:'industrial',bottom:6,axis:'y',rise:3,reverse:true}),
        terrain('rail',460,400,7,180,7,{style:'industrial',bottom:6,axis:'y',rise:3,reverse:true}),
        terrain('rail',280,233,260,7,10,{style:'industrial',bottom:9}),
        terrain('rail',280,400,80,7,10,{style:'industrial',bottom:9}),terrain('rail',460,400,80,7,10,{style:'industrial',bottom:9}),
        terrain('rail',540,240,7,88,10,{style:'industrial',bottom:9}),

        terrain('pillar',240,290,40,40,14.5),terrain('pillar',430,760,40,40,14.5),
        terrain('generator',390,12,120,50,2),terrain('pipe',720,790,120,42,0.95,{collisionShape:'capsule',collisionRadius:15}),
      ],
      variants:[
        [terrain('cover',310,810,100,40,1.1),terrain('cover',490,810,100,40,1.1)],
        [terrain('tank',700,700,80,80,2.5,{collisionShape:'circle',collisionRadius:34}),
          terrain('pipe',90,800,150,42,0.95,{collisionShape:'capsule',collisionRadius:15})],
        [terrain('conveyor',320,820,260,50,1.05),terrain('cover',760,540,65,36,1.05)],
      ],
      spawns:[
        [120,520],[650,850],[845,450],
        [220,150,3],[680,150,3],[450,155,3],
        [700,575,6],[400,680,6],[120,680,6],
        [330,320,9],[500,320,9],
      ],
    },
    maze:{
      id:'maze',name:'The Maze',description:'The original arena, rebuilt with a new scatter every match.',procedural:true,
      palette:{sky:'#9ebbc9',wall:'#526d79',panel:'#9db5b8',cap:'#bdd0cf',glow:'#69e8df',
        floorLow:'#303f47',floorHigh:'#4d6166',reflection:'#526b73',reflectionGlow:'#2ed9e3'},
    },
  };
  const PVP_MAP_IDS=Object.freeze(Object.keys(definitions));
  const PVP_MAPS=Object.freeze(Object.fromEntries(Object.entries(definitions).map(([id,map])=>[id,Object.freeze({
    id,name:map.name,description:map.description,procedural:!!map.procedural,
  })])));

  function collides(x,y,solid,radius=17) {
    if((solid.bottom||0)>=2.2||solid.kind==='ramp')return false;
    const cx=Math.max(solid.x,Math.min(x,solid.x+solid.width));
    const cy=Math.max(solid.y,Math.min(y,solid.y+solid.height));
    return Math.hypot(x-cx,y-cy)<radius-0.1;
  }

  function validatePvpLayout(layout) {
    const {map,walls}=layout,errors=[];
    if(!map||map.mode!=='pvp')errors.push('mode must be pvp');
    if(!PVP_MAPS[map?.id])errors.push('unknown map id');
    if(!Number.isFinite(map?.width)||!Number.isFinite(map?.height)||map.width<600||map.height<600)
      errors.push('invalid map dimensions');
    const solids=[...(walls||[]),...(map?.terrain||[])];
    for(const [index,s] of solids.entries()) {
      if(![s.x,s.y,s.width,s.height,s.top??3.1].every(Number.isFinite)||s.width<=0||s.height<=0)
        errors.push(`invalid solid ${index}`);
      else if(s.x<0||s.y<0||s.x+s.width>map.width||s.y+s.height>map.height)
        errors.push(`out-of-bounds solid ${index}`);
      if(s.kind==='lift'?(s.top||0)<0:(s.bottom||0)>=(s.top??3.1))errors.push(`inverted solid ${index}`);
    }
    const seen=new Set();
    for(const [index,s] of solids.entries()) {
      const key=[s.x,s.y,s.width,s.height,s.bottom||0,s.top??3.1].join('/');
      if(seen.has(key))errors.push(`duplicate solid ${index}`);seen.add(key);
    }
    for(let i=0;i<solids.length;i++)for(let j=i+1;j<solids.length;j++) {
      const a=solids[i],b=solids[j];
      const overlapX=Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x);
      const overlapY=Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y);
      const overlapZ=Math.min(a.top??3.1,b.top??3.1)-Math.max(a.bottom||0,b.bottom||0);
      if(overlapX>0.001&&overlapY>0.001&&overlapZ>0.001)errors.push(`overlapping solids ${i}/${j}`);
    }
    if(!Array.isArray(map?.spawns)||map.spawns.length<8)errors.push('at least eight spawns are required');
    for(const [index,p] of (map?.spawns||[]).entries()) {
      if(!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<20||p.y<20||p.x>map.width-20||p.y>map.height-20)
        errors.push(`invalid spawn ${index}`);
      else if(solids.some(s=>collides(p.x,p.y,s)))errors.push(`blocked spawn ${index}`);
    }
    // Ground-level flood fill catches accidental sealed regions before an
    // authored layout enters rotation. Ramps are traversable and upper decks
    // are separately exercised by movement/navigation tests.
    if(map?.spawns?.length&&!errors.some(e=>e.startsWith('invalid spawn')||e.startsWith('blocked spawn'))) {
      const step=10,cols=Math.floor(map.width/step),rows=Math.floor(map.height/step),open=new Uint8Array(cols*rows);
      for(let row=0;row<rows;row++)for(let col=0;col<cols;col++) {
        const x=col*step+step/2,y=row*step+step/2;
        open[row*cols+col]=solids.some(s=>collides(x,y,s))?0:1;
      }
      const cell=p=>Math.max(0,Math.min(rows-1,Math.floor(p.y/step)))*cols+
        Math.max(0,Math.min(cols-1,Math.floor(p.x/step)));
      const nearestOpen=p=>{
        const origin=cell(p),cx=origin%cols,cy=Math.floor(origin/cols);
        for(let radius=0;radius<=3;radius++)for(let y=cy-radius;y<=cy+radius;y++)for(let x=cx-radius;x<=cx+radius;x++) {
          if(x<0||y<0||x>=cols||y>=rows||(radius&&Math.abs(x-cx)!==radius&&Math.abs(y-cy)!==radius))continue;
          const at=y*cols+x;if(open[at])return at;
        }
        return -1;
      };
      const start=nearestOpen(map.spawns[0]),seenCells=new Uint8Array(open.length),queue=[];
      if(open[start]){queue.push(start);seenCells[start]=1;}
      for(let i=0;i<queue.length;i++) {
        const at=queue[i],x=at%cols;
        for(const next of [x?at-1:-1,x<cols-1?at+1:-1,at-cols,at+cols])
          if(next>=0&&next<open.length&&open[next]&&!seenCells[next]){seenCells[next]=1;queue.push(next);}
      }
      for(const [index,p] of map.spawns.entries())if(!seenCells[nearestOpen(p)])errors.push(`unreachable spawn ${index}`);
    }
    return {valid:errors.length===0,errors};
  }

  function derivePvpSpawns(map,walls,count=12) {
    const solids=[...walls,...map.terrain],candidates=[];
    for(let y=50;y<=map.height-50;y+=50)for(let x=50;x<=map.width-50;x+=50)
      if(!solids.some(s=>collides(x,y,s,20)))candidates.push({x,y,height:0});
    // Farthest-point sampling spreads fallback spawns across an irregular
    // procedural footprint instead of clustering them in the first open area.
    const selected=[];
    while(selected.length<count&&candidates.length) {
      let best=0,bestScore=-Infinity;
      for(let i=0;i<candidates.length;i++) {
        const p=candidates[i];
        const separation=selected.length?Math.min(...selected.map(other=>Math.hypot(p.x-other.x,p.y-other.y))):
          Math.hypot(p.x-map.width/2,p.y-map.height/2);
        const edge=Math.min(p.x,p.y,map.width-p.x,map.height-p.y);
        const score=separation-edge*0.08;
        if(score>bestScore){bestScore=score;best=i;}
      }
      selected.push(candidates.splice(best,1)[0]);
    }
    return selected;
  }

  function buildAuthoredPvpMap(id,seed=0) {
    const source=definitions[id];
    if(!source||source.procedural)throw new Error(`Unknown authored PvP map: ${id}`);
    const variant=Math.abs(seed>>>0)%source.variants.length;
    const accent=source.accent;
    const map={mode:'pvp',id:source.id,name:source.name,description:source.description,
      width:source.width,height:source.height,ceiling:source.ceiling||CEILING,seed:seed>>>0,variant,
      palette:{...source.palette},spawns:source.spawns.map(([x,y,height=0])=>({x,y,height})),
      terrain:[...source.terrain,...source.variants[variant]].map(s=>({...s,accent:s.accent||accent})),
    };
    const layout={map,walls:[...boundary(source.width,source.height,source.ceiling||CEILING),...source.walls].map(s=>({...s}))};
    const result=validatePvpLayout(layout);
    if(!result.valid)throw new Error(`${source.name} failed validation: ${result.errors.join(', ')}`);
    return layout;
  }

  return {PVP_MAPS,PVP_MAP_IDS,buildAuthoredPvpMap,derivePvpSpawns,validatePvpLayout};
});
