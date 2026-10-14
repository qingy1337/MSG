(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else Object.assign(root,api);
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const CEILING=7.5,EDGE=12;
  const boundary=(width,height,ceiling=CEILING,edge=EDGE)=>[
    {kind:'boundary',x:0,y:0,width,height:edge,top:ceiling},
    {kind:'boundary',x:0,y:height-edge,width,height:edge,top:ceiling},
    {kind:'boundary',x:0,y:edge,width:edge,height:height-edge*2,top:ceiling},
    {kind:'boundary',x:width-edge,y:edge,width:edge,height:height-edge*2,top:ceiling},
  ];
  const wall=(x,y,width,height,top=3.1)=>({x,y,width,height,top});
  const terrain=(kind,x,y,width,height,top,extra={})=>({kind,x,y,width,height,top,...extra});

  const definitions={
    foundry:{
      id:'foundry',name:'Foundry',description:'A tall, close-quarters smelter threaded with wall walks and stacked platforms.',
      width:1800,height:1250,ceiling:13.5,scale:0.68,accent:'#f0a55a',
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

        // A second combat tier grows out from the north wall. The stairs begin
        // on the existing three-metre works, so every high perch has a real,
        // permanent route rather than depending on a lift or a lucky jump.
        terrain('catwalk',12,20,500,70,6,{bottom:5.75,walkable:true}),
        terrain('catwalk',650,20,500,70,6,{bottom:5.75,walkable:true}),
        terrain('catwalk',1288,20,500,70,6,{bottom:5.75,walkable:true}),
        terrain('catwalk',512,20,138,70,6,{bottom:5.75,walkable:true,bridge:true}),
        terrain('catwalk',1150,20,138,70,6,{bottom:5.75,walkable:true,bridge:true}),
        terrain('ramp',270,90,100,260,6,{bottom:3,axis:'y',reverse:true,stairs:true,steps:26}),
        terrain('ramp',1430,90,100,260,6,{bottom:3,axis:'y',reverse:true,stairs:true,steps:26}),

        // Guardrails hug the arena wall and the exposed inner lip. Integrated
        // control housings interrupt what would otherwise be one dominant
        // sniper lane across the entire upper floor.
        terrain('rail',12,90,251,7,7,{style:'industrial',bottom:6}),
        terrain('rail',377,90,135,7,7,{style:'industrial',bottom:6}),
        terrain('rail',650,90,500,7,7,{style:'industrial',bottom:6}),
        terrain('rail',1288,90,135,7,7,{style:'industrial',bottom:6}),
        terrain('rail',1537,90,251,7,7,{style:'industrial',bottom:6}),
        terrain('rail',512,13,138,7,7,{style:'industrial',bottom:6}),
        terrain('rail',512,90,138,7,7,{style:'industrial',bottom:6}),
        terrain('rail',1150,13,138,7,7,{style:'industrial',bottom:6}),
        terrain('rail',1150,90,138,7,7,{style:'industrial',bottom:6}),
        terrain('rail',263,90,7,260,4,{style:'industrial',bottom:3,axis:'y',rise:3,reverse:true}),
        terrain('rail',370,90,7,260,4,{style:'industrial',bottom:3,axis:'y',rise:3,reverse:true}),
        terrain('rail',1423,90,7,260,4,{style:'industrial',bottom:3,axis:'y',rise:3,reverse:true}),
        terrain('rail',1530,90,7,260,4,{style:'industrial',bottom:3,axis:'y',rise:3,reverse:true}),
        terrain('generator',720,20,85,10,8.55,{bottom:6}),
        terrain('generator',1060,20,85,10,8.55,{bottom:6}),

        // Industrial guardrails clearly communicate the walkable route while
        // openings at stairs and bridge joins keep the network flowing.
        terrain('rail',180,143,83,7,4,{style:'industrial',bottom:3}),terrain('rail',377,143,133,7,4,{style:'industrial',bottom:3}),
        terrain('rail',173,150,7,250,4,{style:'industrial',bottom:3}),
        terrain('rail',180,400,83,7,4,{style:'industrial',bottom:3}),terrain('rail',377,400,133,7,4,{style:'industrial',bottom:3}),
        terrain('rail',253,400,7,230,1,{style:'industrial',axis:'y',rise:3,reverse:true}),
        terrain('rail',370,400,7,230,1,{style:'industrial',axis:'y',rise:3,reverse:true}),
        terrain('rail',510,228,218,7,4,{style:'industrial',bottom:3}),terrain('rail',510,320,218,7,4,{style:'industrial',bottom:3}),
        terrain('rail',735,103,330,7,4,{style:'industrial',bottom:3}),
        terrain('rail',728,110,7,125,4,{style:'industrial',bottom:3}),terrain('rail',728,320,7,120,4,{style:'industrial',bottom:3}),
        terrain('rail',1065,110,7,125,4,{style:'industrial',bottom:3}),terrain('rail',1065,320,7,120,4,{style:'industrial',bottom:3}),
        terrain('rail',735,440,113,7,4,{style:'industrial',bottom:3}),terrain('rail',952,440,113,7,4,{style:'industrial',bottom:3}),
        terrain('rail',1072,228,218,7,4,{style:'industrial',bottom:3}),terrain('rail',1072,320,218,7,4,{style:'industrial',bottom:3}),
        terrain('rail',1290,143,133,7,4,{style:'industrial',bottom:3}),terrain('rail',1537,143,83,7,4,{style:'industrial',bottom:3}),
        terrain('rail',1620,150,7,250,4,{style:'industrial',bottom:3}),
        terrain('rail',1290,400,133,7,4,{style:'industrial',bottom:3}),terrain('rail',1537,400,83,7,4,{style:'industrial',bottom:3}),
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
        [210,260,3],[900,200,3],[1350,260,3],[980,755,3],
        [300,55,6],[900,55,6],
      ],
    },
    courtyard:{
      id:'courtyard',name:'Courtyard',description:'A broad garden court between two raised galleries.',
      width:1500,height:1300,scale:0.8,accent:'#8fd19d',
      palette:{sky:'#b4ced0',wall:'#627b77',panel:'#9fb6a8',cap:'#d0d8b8',glow:'#72e6ba',
        floorLow:'#344744',floorHigh:'#61736a',reflection:'#66827b',reflectionGlow:'#72e6ba'},
      walls:[
        wall(120,220,270,24),wall(390,120,24,220),wall(1110,220,270,24),wall(1086,120,24,220),
        wall(120,1056,270,24),wall(390,960,24,216),wall(1110,1056,270,24),wall(1086,960,24,216),
        wall(565,165,370,24),wall(565,1111,370,24),
        // Offset garden walls split the broad central court into short fights
        // while leaving several wraparound flanks.
        wall(545,360,24,170,4.4),wall(930,770,24,170,4.4),
        wall(565,895,175,24,4.4),wall(760,381,175,24,4.4),
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
      width:1900,height:1000,scale:0.8,accent:'#77b8ee',
      palette:{sky:'#91aabd',wall:'#4e6577',panel:'#829db0',cap:'#c3d1d7',glow:'#66c8ff',
        floorLow:'#293a46',floorHigh:'#506674',reflection:'#617b8a',reflectionGlow:'#66c8ff'},
      walls:[
        wall(300,150,24,280),wall(300,570,24,280),wall(1576,150,24,280),wall(1576,570,24,280),
        wall(500,245,300,24),wall(1100,245,300,24),wall(500,731,300,24),wall(1100,731,300,24),
        wall(380,455,140,24),wall(1380,455,140,24),
        // Staggered container bulkheads cut the terminal's old end-to-end
        // firing lanes and form two close maintenance routes around the dock.
        wall(1020,55,28,270,5.4),wall(875,675,28,270,5.4),
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
      width:900,height:900,ceiling:15.5,scale:0.92,accent:'#ffd166',
      palette:{sky:'#70818e',wall:'#3e4c57',panel:'#71818c',cap:'#c4a96c',glow:'#ffd166',
        floorLow:'#263038',floorHigh:'#46535b',reflection:'#53616a',reflectionGlow:'#ffd166'},
      // A tall service core prevents the entire shaft from being one open
      // sniper sightline, without touching any stair, bridge, or lift route.
      walls:[wall(410,250,70,130,8.5)],
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
    temple:{
      id:'temple',name:'Overgrown Temple',
      description:'A layered jungle sanctuary with jumpable ruins, a lift-served watchtower, and tunnels beneath the upper court.',
      width:1300,height:1050,ceiling:12,roof:false,scale:0.84,style:'temple',accent:'#8eae5b',
      palette:{sky:'#92b9a7',wall:'#626b55',panel:'#889078',cap:'#a8a783',glow:'#789f4b',groundStyle:'grass',
        floorLow:'#263f27',floorHigh:'#66834b',reflection:'#465c49',reflectionGlow:'#78a965',
        ambient:'#dce8c8',ground:'#718165',sun:'#ffe3a6',rim:'#8fcf9a',
        ambientIntensity:2.65,sunIntensity:4.15,rimIntensity:1.15},
      walls:[
        // These low walls support the raised sanctuary. Because their tops
        // stop below the deck underside, all four wings are playable tunnels.
        // Outer shell: a doorway on every face keeps the undercroft permeable.
        wall(280,180,24,290,2.48),wall(280,550,24,70,2.48),
        wall(996,180,24,290,2.48),wall(996,550,24,70,2.48),
        wall(304,180,306,24,2.48),wall(690,180,306,24,2.48),
        wall(304,596,306,24,2.48),wall(690,596,306,24,2.48),

        // Inner courtyard shell. Offset openings make the tunnels bend instead
        // of becoming four straight sniper tubes.
        wall(506,310,24,120,2.48),wall(506,470,24,20,2.48),
        wall(770,310,24,120,2.48),
        wall(590,286,32,24,2.48),wall(682,286,88,24,2.48),
        wall(530,490,132,24,2.48),wall(722,490,48,24,2.48),

        // Staggered partitions turn the covered wings into actual passages,
        // while retaining several loops and never creating a dead-end camp.
        wall(400,204,24,176,2.42),wall(400,440,24,156,2.42),
        wall(876,204,24,176,2.42),wall(876,440,24,156,2.42),

        // A ruined southern forecourt makes the sanctuary part of a larger
        // complex. Broken wall runs form gates and cover without sealing the
        // grassy water gardens or the central processional route.
        wall(280,690,24,150,2.9),wall(280,880,24,145,2.9),
        wall(996,690,24,150,2.9),wall(996,880,24,145,2.9),
        wall(304,900,210,24,2.9),wall(786,900,210,24,2.9),
      ],
      terrain:[
        // One connected sanctuary ring. These thin stone decks are the roofs
        // of the tunnel network, not solid blocks, so both layers remain live.
        terrain('ruinDeck',280,80,250,610,3,{bottom:2.62,walkable:true}),
        terrain('ruinDeck',770,80,250,610,3,{bottom:2.62,walkable:true}),
        terrain('ruinDeck',530,80,240,230,3,{bottom:2.62,walkable:true,bridge:true}),
        terrain('ruinDeck',530,490,240,200,3,{bottom:2.62,walkable:true,bridge:true}),
        terrain('ramp',60,340,220,120,3,{axis:'x',stairs:true,steps:20,style:'temple'}),
        terrain('ramp',1020,340,220,120,3,{axis:'x',reverse:true,stairs:true,steps:20,style:'temple'}),

        // The approach is a complete architectural space, rather than empty
        // lawn around a central gameplay prop: paved court, axial causeway,
        // and paired reflecting gardens all lead into the raised sanctuary.
        terrain('templeCourt',420,690,460,340,0,{bottom:-0.035}),
        terrain('templePool',70,740,190,110,0,{bottom:-0.035}),
        terrain('templePool',1040,740,190,110,0,{bottom:-0.035}),

        // Stone paving visibly identifies the undercroft routes against the
        // surrounding grass. Its surface is raised clear of the grass plane,
        // eliminating the coplanar flicker from the previous treatment.
        terrain('templePath',304,204,202,392,0,{bottom:-0.035}),
        terrain('templePath',794,204,202,392,0,{bottom:-0.035}),
        terrain('templePath',530,204,240,82,0,{bottom:-0.035}),
        terrain('templePath',530,514,240,82,0,{bottom:-0.035}),

        // The open sacred court binds the upper and lower routes together.
        terrain('templePool',550,310,200,180,0,{bottom:-0.035}),
        // Only the broad trunk is solid. The canopy and decorative roots no
        // longer create an oversized invisible circle around the tree.
        terrain('templeTree',595,330,110,135,8.4,{collisionShape:'circle',collisionRadius:24}),
        terrain('waterfall',530,286,60,24,2.48),
        terrain('templeRoot',705,400,65,35,0.58,{collisionShape:'capsule',collisionRadius:14}),

        // Purposeful landmarks: a paired gate, an upper shrine, and continuous
        // hanging growth around the sanctuary rather than random loose props.
        terrain('templePillar',545,690,58,58,4.8,{collisionShape:'circle',collisionRadius:24}),
        terrain('templePillar',697,690,58,58,4.8,{collisionShape:'circle',collisionRadius:24}),
        terrain('templeAltar',595,525,110,60,4.25,{bottom:3.02}),

        // Broken column drums make the forecourt itself vertically playable.
        // Every top is below the 1.25 m jump apex, with broad circular landing
        // surfaces instead of the old tall boxes that only acted as blockers.
        terrain('templeStep',360,680,64,64,.55,{collisionShape:'circle',collisionRadius:29}),
        terrain('templeStep',430,640,70,70,.82,{collisionShape:'circle',collisionRadius:32}),
        terrain('templeStep',405,830,64,64,1.1,{collisionShape:'circle',collisionRadius:29}),
        terrain('templeStep',876,680,64,64,.55,{collisionShape:'circle',collisionRadius:29}),
        terrain('templeStep',800,640,64,64,.82,{collisionShape:'circle',collisionRadius:29}),
        terrain('templeStep',831,830,64,64,1.1,{collisionShape:'circle',collisionRadius:29}),

        // A tall open watchtower occupies a real side precinct. Four masonry
        // piers support a ring-shaped firing deck while preserving a completely
        // clear shaft for the lift through its centre.
        terrain('templeTowerPillar',70,850,30,30,6.9),
        terrain('templeTowerPillar',230,850,30,30,6.9),
        terrain('templeTowerPillar',70,990,30,30,6.9),
        terrain('templeTowerPillar',230,990,30,30,6.9),
        terrain('templeTowerDeck',70,850,190,50,7.2,{bottom:6.92,walkable:true,liftServed:'temple-watch-lift'}),
        terrain('templeTowerDeck',70,900,55,80,7.2,{bottom:6.92,walkable:true,liftServed:'temple-watch-lift'}),
        terrain('templeTowerDeck',205,900,55,80,7.2,{bottom:6.92,walkable:true,liftServed:'temple-watch-lift'}),
        terrain('templeTowerDeck',125,980,80,40,7.2,{bottom:6.92,walkable:true,liftServed:'temple-watch-lift'}),
        terrain('lift',125,900,80,80,0,{id:'temple-watch-lift',maxTop:7.2,style:'temple',phaseOffset:3500}),
        // Three moving rails make the lift safe without closing its southern
        // landing edge. The top parapet is broken into firing apertures.
        terrain('rail',125,893,80,7,1,{style:'temple',liftId:'temple-watch-lift'}),
        terrain('rail',118,900,7,80,1,{style:'temple',liftId:'temple-watch-lift'}),
        terrain('rail',205,900,7,80,1,{style:'temple',liftId:'temple-watch-lift'}),
        terrain('rail',70,843,60,7,8.2,{style:'temple',bottom:7.2}),
        terrain('rail',200,843,60,7,8.2,{style:'temple',bottom:7.2}),
        terrain('rail',63,850,7,60,8.2,{style:'temple',bottom:7.2}),
        terrain('rail',63,950,7,70,8.2,{style:'temple',bottom:7.2}),
        terrain('rail',260,850,7,60,8.2,{style:'temple',bottom:7.2}),
        terrain('rail',260,950,7,70,8.2,{style:'temple',bottom:7.2}),
        terrain('rail',125,1020,80,7,8.2,{style:'temple',bottom:7.2}),

        // Upper masonry follows the sanctuary footprint and gives the skyline
        // a recognizable stepped-temple silhouette.
        terrain('ruinWall',304,204,135,22,6.2,{bottom:3.02}),
        terrain('ruinWall',475,204,100,22,4.45,{bottom:3.02}),
        terrain('ruinWall',725,204,100,22,4.45,{bottom:3.02}),
        terrain('ruinWall',861,204,135,22,6.2,{bottom:3.02}),
        terrain('ruinWall',304,226,22,110,5.2,{bottom:3.02}),
        terrain('ruinWall',304,484,22,112,4.6,{bottom:3.02}),
        terrain('ruinWall',974,226,22,110,5.2,{bottom:3.02}),
        terrain('ruinWall',974,484,22,112,4.6,{bottom:3.02}),
      ],
      variants:[
        [terrain('ruinWall',350,585,92,20,4.15,{bottom:3.02}),
          terrain('ruinWall',858,585,92,20,4.15,{bottom:3.02})],
        [terrain('templeRoot',305,760,155,42,0.68,{collisionShape:'capsule',collisionRadius:17}),
          terrain('templeRoot',840,760,155,42,0.68,{collisionShape:'capsule',collisionRadius:17})],
        [terrain('templeAltar',590,760,120,62,1.2),
          terrain('ruinWall',592,596,116,20,4.25,{bottom:3.02})],
      ],
      spawns:[
        [70,90],[650,90,3],[1230,90],[80,710],[1220,710],[165,995,7.2],[650,960],[1210,980],
        [360,260,3],[470,540,3],[830,260,3],[930,540,3],
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

  function collides(x,y,solid,radius=17,footHeight=0) {
    if((solid.bottom||0)>=footHeight+2.2||(solid.top??3.1)<=footHeight+0.001||solid.kind==='ramp')return false;
    const cx=Math.max(solid.x,Math.min(x,solid.x+solid.width));
    const cy=Math.max(solid.y,Math.min(y,solid.y+solid.height));
    return Math.hypot(x-cx,y-cy)<radius-0.1;
  }

  // Deterministic ground-level sightline audit. This is intentionally cheap
  // enough to run whenever a layout is built, so later variants cannot quietly
  // turn the arenas back into mostly cross-map sniper lanes.
  function pvpSightlineMetrics(layout) {
    const {map}=layout,solids=[...(layout.walls||[]),...(map?.terrain||[])];
    const points=[];
    for(let row=1;row<7;row++)for(let col=1;col<9;col++) {
      const p={x:map.width*col/9,y:map.height*row/7};
      if(!solids.some(s=>collides(p.x,p.y,s,20)))points.push(p);
    }
    const blocks=(a,b,s)=>{
      if((s.bottom||0)>1.84||(s.top??3.1)<1.84||s.kind==='ramp')return false;
      const dx=b.x-a.x,dy=b.y-a.y;let near=0.001,far=0.999;
      for(const [origin,direction,min,max] of [[a.x,dx,s.x,s.x+s.width],[a.y,dy,s.y,s.y+s.height]]) {
        if(Math.abs(direction)<1e-9){if(origin<min||origin>max)return false;continue;}
        const one=(min-origin)/direction,two=(max-origin)/direction;
        near=Math.max(near,Math.min(one,two));far=Math.min(far,Math.max(one,two));
        if(near>far)return false;
      }
      return true;
    };
    const visible=[];let pairs=0;
    for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++) {
      const a=points[i],b=points[j];pairs++;
      if(!solids.some(s=>blocks(a,b,s)))visible.push(Math.hypot(b.x-a.x,b.y-a.y));
    }
    visible.sort((a,b)=>a-b);
    const percentile=p=>visible.length?visible[Math.floor((visible.length-1)*p)]:0;
    return {samples:points.length,pairs,visible:visible.length,visibleRatio:pairs?visible.length/pairs:0,
      median:percentile(.5),p90:percentile(.9),max:visible.at(-1)||0};
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
      if(overlapX>0.001&&overlapY>0.001&&overlapZ>0.001)
        errors.push(`overlapping solids ${i}/${j} (${a.kind||'wall'}/${b.kind||'wall'})`);
    }
    if(!Array.isArray(map?.spawns)||map.spawns.length<8)errors.push('at least eight spawns are required');
    for(const [index,p] of (map?.spawns||[]).entries()) {
      if(!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<20||p.y<20||p.x>map.width-20||p.y>map.height-20)
        errors.push(`invalid spawn ${index}`);
      else if(solids.some(s=>collides(p.x,p.y,s,17,p.height||0)))errors.push(`blocked spawn ${index}`);
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
      for(const [index,p] of map.spawns.entries())if(!(p.height>0)&&!seenCells[nearestOpen(p)])
        errors.push(`unreachable spawn ${index}`);
    }
    const sightlines=pvpSightlineMetrics(layout);
    if(sightlines.p90>820)errors.push(`excessive sightline p90 ${Math.round(sightlines.p90)}`);
    if(sightlines.max>1450)errors.push(`excessive maximum sightline ${Math.round(sightlines.max)}`);
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
    const accent=source.accent,scale=source.scale||1;
    const resize=s=>({...s,x:s.x*scale,y:s.y*scale,width:s.width*scale,height:s.height*scale,
      ...(Number.isFinite(s.collisionRadius)?{collisionRadius:s.collisionRadius*scale}:{}),
      ...(Number.isFinite(s.collisionEndInset)?{collisionEndInset:s.collisionEndInset*scale}:{})});
    const width=source.width*scale,height=source.height*scale;
    const map={mode:'pvp',id:source.id,name:source.name,description:source.description,
      width,height,ceiling:source.ceiling||CEILING,roof:source.roof!==false,style:source.style,
      seed:seed>>>0,variant,
      palette:{...source.palette},spawns:source.spawns.map(([x,y,height=0])=>({x:x*scale,y:y*scale,height})),
      terrain:[...source.terrain,...source.variants[variant]].map(s=>resize({...s,accent:s.accent||accent})),
    };
    const layout={map,walls:[...boundary(width,height,source.ceiling||CEILING,EDGE*scale),...source.walls.map(resize)]};
    const result=validatePvpLayout(layout);
    if(!result.valid)throw new Error(`${source.name} failed validation: ${result.errors.join(', ')}`);
    return layout;
  }

  return {PVP_MAPS,PVP_MAP_IDS,buildAuthoredPvpMap,derivePvpSpawns,validatePvpLayout,pvpSightlineMetrics};
});
