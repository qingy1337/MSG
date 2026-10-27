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
  const pointInPolygon=(points,x,y)=>{
    let inside=false;
    for(let i=0,j=points.length-1;i<points.length;j=i++) {
      const a=points[i],b=points[j];
      if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)inside=!inside;
    }
    return inside;
  };
  const insideFootprint=(map,x,y)=>!map.floorPolygon||pointInPolygon(map.floorPolygon,x,y);
  const airportScanner=(x,y)=>[
    terrain('airportScanner',x,y,125,58,2.4,{nonSolid:true}),
    terrain('airportScannerCollider',x+7,y+8,11,42,2.4,{collisionOnly:true,scannerPart:'arch-left'}),
    terrain('airportScannerCollider',x+57,y+8,11,42,2.4,{collisionOnly:true,scannerPart:'arch-right'}),
    terrain('airportScannerCollider',x+18,y+8,39,42,2.4,{bottom:2.232,collisionOnly:true,scannerPart:'arch-head'}),
    terrain('airportScannerCollider',x+76,y+11,48,36,.68,{collisionOnly:true,scannerPart:'belt'}),
  ];

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
    vaultAnnex:{
      id:'vaultAnnex',name:'Vault Annex',
      description:'A bright Red Vault reactor annex with stacked control galleries, twin bridges, and heavy machinery.',
      width:1400,height:1000,ceiling:11.8,scale:.78,style:'redVault',accent:'#ef3347',
      palette:{sky:'#92999d',wall:'#34383b',panel:'#686d70',cap:'#aeb3b4',glow:'#e63147',
        floorLow:'#383b3d',floorHigh:'#55595b',reflection:'#505456',reflectionGlow:'#d83346',
        ambient:'#fff5e8',ground:'#7e8587',sun:'#fff4df',rim:'#e95867',
        ambientIntensity:2.95,sunIntensity:3.35,rimIntensity:1.55},
      // A deliberate cruciform shell: one broad reactor hall and four aligned
      // service wings. The footprint remains non-rectangular without looking
      // like unrelated rooms were bolted onto one another.
      floorRects:[
        {x:180,y:140,width:1040,height:720},
        {x:60,y:300,width:120,height:400},
        {x:1220,y:300,width:120,height:400},
        {x:500,y:40,width:400,height:100},
        {x:440,y:860,width:520,height:140},
      ],
      floorPolygon:[
        {x:500,y:40},{x:900,y:40},{x:900,y:140},{x:1220,y:140},
        {x:1220,y:300},{x:1340,y:300},{x:1340,y:700},{x:1220,y:700},
        {x:1220,y:860},{x:960,y:860},{x:960,y:1000},{x:440,y:1000},
        {x:440,y:860},{x:180,y:860},{x:180,y:700},{x:60,y:700},
        {x:60,y:300},{x:180,y:300},{x:180,y:140},{x:500,y:140},
      ],
      perimeter:[
        {...wall(500,40,400,16,11.8),kind:'boundary'},
        {...wall(884,56,16,84,11.8),kind:'boundary'},
        {...wall(900,124,320,16,11.8),kind:'boundary'},
        {...wall(1204,140,16,160,11.8),kind:'boundary'},
        {...wall(1220,300,120,16,11.8),kind:'boundary'},
        {...wall(1324,316,16,368,11.8),kind:'boundary'},
        {...wall(1220,684,120,16,11.8),kind:'boundary'},
        {...wall(1204,700,16,144,11.8),kind:'boundary'},
        {...wall(960,844,260,16,11.8),kind:'boundary'},
        {...wall(944,860,16,124,11.8),kind:'boundary'},
        {...wall(440,984,520,16,11.8),kind:'boundary'},
        {...wall(440,860,16,124,11.8),kind:'boundary'},
        {...wall(180,844,260,16,11.8),kind:'boundary'},
        {...wall(164,700,16,160,11.8),kind:'boundary'},
        {...wall(60,684,120,16,11.8),kind:'boundary'},
        {...wall(60,316,16,368,11.8),kind:'boundary'},
        {...wall(60,300,120,16,11.8),kind:'boundary'},
        {...wall(164,140,16,160,11.8),kind:'boundary'},
        {...wall(180,124,320,16,11.8),kind:'boundary'},
        {...wall(500,56,16,84,11.8),kind:'boundary'},
      ],
      walls:[
        // Three aligned structural thresholds divide storage, reactor, and
        // shipping without fragmenting the central combat circulation.
        wall(560,520,80,24,4.6),wall(760,520,80,24,4.6),
        wall(520,820,120,24,5.2),wall(760,820,120,24,5.2),
      ],
      terrain:[
        // One legible upper control spine: paired rooms, a broad inspection
        // bridge, and symmetric inward stairs. Large uninterrupted surfaces
        // replace the old patchwork of differently sized platforms.
        terrain('catwalk',180,180,300,320,4,{bottom:3.75,walkable:true,style:'redVault',vaultZone:'west-control'}),
        terrain('catwalk',480,180,440,100,4,{bottom:3.75,walkable:true,bridge:true,style:'redVault',vaultZone:'inspection'}),
        terrain('catwalk',920,180,284,320,4,{bottom:3.75,walkable:true,style:'redVault',vaultZone:'east-control'}),
        terrain('ramp',300,500,120,220,4,{axis:'y',reverse:true,walkable:true,platform:true,
          structureDepth:.72,style:'redVault',industrial:'command-stair'}),
        terrain('ramp',980,500,120,220,4,{axis:'y',reverse:true,walkable:true,platform:true,
          structureDepth:.72,style:'redVault',industrial:'processing-stair'}),

        // Guards form long continuous lines with intentional openings only at
        // the bridge and stair mouths.
        terrain('rail',180,180,7,320,5.15,{style:'redVault',bottom:4}),
        terrain('rail',180,173,300,7,5.15,{style:'redVault',bottom:4}),
        terrain('rail',180,500,120,7,5.15,{style:'redVault',bottom:4}),
        terrain('rail',420,500,60,7,5.15,{style:'redVault',bottom:4}),
        terrain('rail',480,287,7,93,5.15,{style:'redVault',bottom:4}),
        terrain('rail',480,173,440,7,5.15,{style:'redVault',bottom:4}),
        terrain('rail',480,280,440,7,5.15,{style:'redVault',bottom:4}),
        terrain('rail',913,287,7,93,5.15,{style:'redVault',bottom:4}),
        terrain('rail',920,173,284,7,5.15,{style:'redVault',bottom:4}),
        terrain('rail',920,500,60,7,5.15,{style:'redVault',bottom:4}),
        terrain('rail',1100,500,104,7,5.15,{style:'redVault',bottom:4}),
        terrain('rail',1197,180,7,320,5.15,{style:'redVault',bottom:4}),
        terrain('rail',293,500,7,220,1.15,{style:'redVault',bottom:0,axis:'y',rise:4,reverse:true}),
        terrain('rail',420,500,7,220,1.15,{style:'redVault',bottom:0,axis:'y',rise:4,reverse:true}),
        terrain('rail',973,500,7,220,1.15,{style:'redVault',bottom:0,axis:'y',rise:4,reverse:true}),
        terrain('rail',1100,500,7,220,1.15,{style:'redVault',bottom:0,axis:'y',rise:4,reverse:true}),

        // Each machine belongs to an obvious bay. Nothing sits at an arbitrary
        // angle or floats alone in the circulation space.
        terrain('reactorCore',620,580,160,160,6.2,{collisionShape:'circle',collisionRadius:62}),
        terrain('turbine',550,195,300,70,2.72,{collisionShape:'capsule',collisionRadius:25}),
        terrain('vaultConveyor',1250,380,55,240,1.18,{speed:.52,direction:1}),
        terrain('vaultConveyor',550,880,300,45,1.15,{speed:.68,direction:1}),
        terrain('vaultConveyor',550,935,300,40,1.15,{speed:.58,direction:-1}),
        terrain('storageRack',196,600,90,62,2.72),
        terrain('storageRack',1114,600,90,62,2.72),
        terrain('consoleBank',230,250,190,58,5.25,{bottom:4}),
        terrain('consoleBank',980,250,190,58,5.25,{bottom:4}),
        terrain('ventStack',190,400,82,82,3.05,{collisionShape:'circle',collisionRadius:32}),
        terrain('ventStack',1122,400,82,82,3.05,{collisionShape:'circle',collisionRadius:32}),

        // Six columns land on two exact structural axes instead of wandering
        // around the room as individual decorative props.
        terrain('vaultColumn',500,300,44,44,10.9,{collisionShape:'circle',collisionRadius:17}),
        terrain('vaultColumn',856,300,44,44,10.9,{collisionShape:'circle',collisionRadius:17}),
        terrain('vaultColumn',500,520,44,44,10.9,{collisionShape:'circle',collisionRadius:17}),
        terrain('vaultColumn',856,520,44,44,10.9,{collisionShape:'circle',collisionRadius:17}),
        terrain('vaultColumn',500,735,44,44,10.9,{collisionShape:'circle',collisionRadius:17}),
        terrain('vaultColumn',856,735,44,44,10.9,{collisionShape:'circle',collisionRadius:17}),
        terrain('crane',450,575,500,34,9.6,{bottom:8.65}),

        terrain('ceilingPanel',520,55,360,44,11.72,{bottom:11.28,nonSolid:true,style:'redVault'}),
        terrain('ceilingPanel',240,160,360,44,11.72,{bottom:11.28,nonSolid:true,style:'redVault'}),
        terrain('ceilingPanel',800,160,360,44,11.72,{bottom:11.28,nonSolid:true,style:'redVault'}),
        terrain('ceilingPanel',260,800,360,44,11.72,{bottom:11.28,nonSolid:true,style:'redVault'}),
        terrain('ceilingPanel',780,800,360,44,11.72,{bottom:11.28,nonSolid:true,style:'redVault'}),
        terrain('ceilingPanel',470,950,460,32,11.72,{bottom:11.28,nonSolid:true,style:'redVault'}),
      ],
      variants:[
        [terrain('vaultBarrier',550,340,110,38,1.15),terrain('vaultBarrier',740,340,110,38,1.15)],
        [terrain('vaultBarrier',550,410,110,38,1.15),terrain('vaultBarrier',740,410,110,38,1.15)],
        [terrain('vaultBarrier',550,470,110,38,1.15),terrain('vaultBarrier',740,470,110,38,1.15)],
      ],
      spawns:[
        [600,90],[800,90],[110,420],[110,600],[1290,340],[1150,760],
        [500,920],[900,920],[530,600],[870,600],[700,820],
        [260,430,4],[440,340,4],[600,230,4],[800,230,4],[980,430,4],[1140,340,4],
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
        terrain('lift',540,335,90,90,0,{id:'tower-lift-core',maxTop:9,phaseOffset:4000}),
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
        terrain('lift',125,900,80,80,0,{id:'temple-watch-lift',maxTop:7.2,style:'temple',phaseOffset:2000}),
        // The watch lift is deliberately open-sided. The surrounding tower
        // deck keeps its masonry parapet, but the moving platform has no cage.
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
    orbital:{
      id:'orbital',name:'Orbital Station',
      description:'A two-storey research station with enclosed transit tunnels and exposed bridges beneath the stars.',
      width:1400,height:1000,ceiling:14,roof:false,boundaryTop:1.45,scale:0.76,style:'orbital',accent:'#65dff2',
      palette:{sky:'#02050d',wall:'#d7dde3',panel:'#7c8792',cap:'#f4f6f8',glow:'#62ddeb',
        floorLow:'#aeb7c0',floorHigh:'#edf1f4',reflection:'#d6dde2',reflectionGlow:'#8deaf3',
        ambient:'#f4f7ff',ground:'#5e6874',sun:'#ffffff',rim:'#76dcff',
        ambientIntensity:2.75,sunIntensity:4.25,rimIntensity:2.6},
      walls:[
        // Each upper wing sits over a real lower-floor transit tunnel.
        wall(90,50,500,24,3.25),wall(90,206,500,24,3.25),
        wall(700,770,500,24,3.25),wall(700,926,500,24,3.25),
        // Offset pressure partitions keep the exposed deck close-range without
        // reducing the station to another rectangular maze.
        wall(120,520,280,24,3.5),wall(1050,400,240,24,3.5),
        wall(160,700,250,24,3.5),wall(1120,270,24,120,3.8),
      ],
      terrain:[
        terrain('orbitalTunnelRoof',90,74,500,132,3,{bottom:2.7}),
        terrain('orbitalTunnelRoof',700,794,500,132,3,{bottom:2.7}),

        // The second floor is a real architectural layer, 4.5 metres above
        // the lower station. Three narrow, unrailed bridges tie its wings to
        // the large central research floor.
        terrain('orbitalDeck',180,50,250,180,4.5,{bottom:4.22,walkable:true,wing:'astronomy'}),
        terrain('orbitalDeck',500,240,400,520,4.5,{bottom:4.22,walkable:true,wing:'operations'}),
        terrain('orbitalDeck',950,770,250,180,4.5,{bottom:4.22,walkable:true,wing:'habitation'}),
        terrain('orbitalDeck',1040,100,220,160,4.5,{bottom:4.22,walkable:true,wing:'communications'}),
        terrain('orbitalDeck',430,120,70,170,4.5,{bottom:4.22,walkable:true,bridge:true}),
        terrain('orbitalDeck',900,700,50,170,4.5,{bottom:4.22,walkable:true,bridge:true}),
        terrain('orbitalDeck',900,190,140,80,4.5,{bottom:4.22,walkable:true,bridge:true}),

        // One stair descends south from the astronomy wing; the opposite-side
        // stair descends east from habitation, producing a true circulation loop.
        terrain('ramp',260,230,100,250,4.5,{axis:'y',reverse:true,stairs:true,steps:24,style:'orbital'}),
        terrain('ramp',1040,520,100,250,4.5,{axis:'y',stairs:true,steps:24,style:'orbital'}),

        // Supports make the upper storey feel engineered rather than floated.
        terrain('orbitalSupport',500,240,30,30,4.22),terrain('orbitalSupport',870,240,30,30,4.22),
        terrain('orbitalSupport',500,730,30,30,4.22),terrain('orbitalSupport',870,730,30,30,4.22),
        terrain('orbitalSupport',1040,100,28,28,4.22),terrain('orbitalSupport',1232,232,28,28,4.22),

        // Every part of both floors gets a distinct landmark and callout.
        terrain('orbitalAntenna',235,75,120,120,9.2,{bottom:4.5,collisionShape:'circle',collisionRadius:42}),
        terrain('orbitalCore',640,380,110,100,8,{bottom:4.5,collisionShape:'circle',collisionRadius:43}),
        terrain('orbitalPod',700,600,150,90,6.7,{bottom:4.5}),
        terrain('orbitalPod',980,815,150,90,6.7,{bottom:4.5}),
        terrain('orbitalCore',1100,135,85,85,7.2,{bottom:4.5,collisionShape:'circle',collisionRadius:32}),
        terrain('orbitalPod',80,350,160,100,2.25),
        terrain('orbitalPod',1200,500,165,100,2.25),
        // These are deliberately waist-high jump-up cover. The old 1.2 m
        // shells sat almost exactly at the player's 1.25 m jump apex, making
        // a successful landing depend on hitting the box at one precise frame.
        terrain('orbitalCrate',470,835,95,58,.82,{jumpable:true}),
        terrain('orbitalCrate',900,520,105,62,.88,{jumpable:true}),
      ],
      variants:[
        [terrain('orbitalCrate',400,400,105,58,.86,{jumpable:true}),terrain('orbitalCrate',1160,630,95,58,.8,{jumpable:true})],
        [terrain('orbitalPod',390,575,135,88,2.05),terrain('orbitalCrate',970,320,105,58,.84,{jumpable:true})],
        [terrain('orbitalAntenna',340,800,105,105,3.7,{collisionShape:'circle',collisionRadius:38}),
          terrain('orbitalCrate',970,300,100,60,.86,{jumpable:true})],
      ],
      spawns:[
        [50,60],[700,70],[1350,60],[60,470],[1340,470],[60,940],[600,940],[1350,960],
        [260,140],[850,860],[560,600],[900,350],
        [390,100,4.5],[560,300,4.5],[820,720,4.5],[1180,790,4.5],[1220,220,4.5],[465,200,4.5],
      ],
    },
    airport:{
      id:'airport',name:'Terminal 7',
      description:'A full-scale departures terminal with three gates, a lively airside market, security, check-in, and an upper lounge circuit.',
      width:1800,height:1250,ceiling:11.4,scale:.88,style:'airport',accent:'#3f82b7',
      // Retail rooms punch through the east/west shell while the public hall
      // keeps its original footprint. These pockets are deliberately narrow:
      // they extend movement only inside a completed shop, never into an
      // unbounded strip outside the terminal.
      worldBounds:{minX:-188,maxX:1988,minY:0,maxY:1250},
      sideOpenings:[[350,520],[550,720]],
      walkablePockets:[
        {x:-188,y:350,width:270,height:170},{x:-188,y:550,width:270,height:170},
        {x:1718,y:350,width:270,height:170},{x:1718,y:550,width:270,height:170},
      ],
      palette:{sky:'#7894aa',wall:'#e7e4dd',panel:'#82909a',cap:'#f8f6f0',glow:'#54a9cf',groundStyle:'airport',
        floorLow:'#aeb3b4',floorHigh:'#e7e2d8',reflection:'#9da8ad',reflectionGlow:'#cde8ef',
        ambient:'#d9eeff',ground:'#758b98',sun:'#dceeff',rim:'#56bce9',
        ambientIntensity:2.85,sunIntensity:3.25,rimIntensity:2.35},
      walls:[
        // Gate separators grow from the curtain wall but stop before the main
        // concourse, creating three recognisable boarding rooms without traps.
        {...wall(595,20,20,255,3.25),airportWall:'glass',zone:'gate'},
        {...wall(1185,20,20,255,3.25),airportWall:'glass',zone:'gate'},

        // Four tenants are recessed into the east and west perimeter. The
        // boundary is their back wall; these short returns are their only
        // authored side walls, leaving each entire frontage genuinely open.
        {...wall(-188,350,270,20,3.4),airportWall:'shop',shop:'coffee'},
        {...wall(-188,500,270,20,3.4),airportWall:'shop',shop:'coffee'},
        {...wall(-188,370,20,130,3.4),airportWall:'shop',shop:'coffee',shopBack:true},
        {...wall(-188,550,270,20,3.4),airportWall:'shop',shop:'books'},
        {...wall(-188,700,270,20,3.4),airportWall:'shop',shop:'books'},
        {...wall(-188,570,20,130,3.4),airportWall:'shop',shop:'books',shopBack:true},
        {...wall(1718,350,270,20,3.4),airportWall:'shop',shop:'restaurant'},
        {...wall(1718,500,270,20,3.4),airportWall:'shop',shop:'restaurant'},
        {...wall(1968,370,20,130,3.4),airportWall:'shop',shop:'restaurant',shopBack:true},
        {...wall(1718,550,270,20,3.4),airportWall:'shop',shop:'travel'},
        {...wall(1718,700,270,20,3.4),airportWall:'shop',shop:'travel'},
        {...wall(1968,570,20,130,3.4),airportWall:'shop',shop:'travel',shopBack:true},

        // The storefronts cut through only the occupied level of the terminal
        // shell. Keep the upper wall continuous over every opening instead of
        // leaving four ceiling-height holes above the low shop roofs.
        ...[[350,170],[550,170]].flatMap(([y,height])=>[
          {...wall(0,y,12,height,11.4),bottom:3.4,airportWall:'shop-overhead'},
          {...wall(1788,y,12,height,11.4),bottom:3.4,airportWall:'shop-overhead'},
        ]),

        // The retail front stays open. Former freestanding glass windbreaks
        // cluttered its approaches without giving either side a useful route.

        // Gate holdrooms have two broad, offset concourse thresholds. These
        // solid service walls end before the galleries and leave generous
        // openings to turn through instead of an exposed runway-length view.
        {...wall(265,275,330,27,5.4),airportWall:'service',zone:'gate-threshold'},
        {...wall(1205,275,330,27,5.4),airportWall:'service',zone:'gate-threshold'},
        // Two broad piers carry the overlook and interrupt the hall's old
        // side-to-side shooting lane. Their tops meet the deck underside.
        {...wall(700,320,32,70,3.84),airportWall:'service',zone:'gallery-pier'},
        {...wall(1068,320,32,70,3.84),airportWall:'service',zone:'gallery-pier'},
        // Each gallery screen turns the corner into one continuous return:
        // the long wall meets the side wall at the upper bridge, and the side
        // wall finishes at the lower bridge rail. Open sections still give the
        // elevated route useful firing positions.
        {...wall(490,415,230,7,6.35),bottom:4.1,airportWall:'service',zone:'gallery-screen'},
        {...wall(1080,415,230,7,6.35),bottom:4.1,airportWall:'service',zone:'gallery-screen'},
        {...wall(483,415,7,128,6.35),bottom:4.1,airportWall:'service',zone:'gallery-screen'},
        {...wall(1310,415,7,128,6.35),bottom:4.1,airportWall:'service',zone:'gallery-screen'},

        // The screening hall has two side service bays. The public route stays
        // broad through the middle and both flanks stay open to circulation.
        {...wall(12,742,260,28,5.4),airportWall:'service',zone:'security-wing'},
        {...wall(1528,742,260,28,5.4),airportWall:'service',zone:'security-wing'},
        {...wall(12,900,350,24,5.4),airportWall:'service',zone:'checkin-wing'},
        {...wall(1438,900,350,24,5.4),airportWall:'service',zone:'checkin-wing'},

        // Continue each stair's centre line beneath its upper landing. These
        // read as glazed structural/security spines supporting the mezzanine,
        // while ending exactly where the stair begins so its approach remains
        // completely unobstructed.
        {...wall(397.5,470,20,150,3.84),airportWall:'glass',zone:'gallery-support'},
        {...wall(1382.5,470,20,150,3.84),airportWall:'glass',zone:'gallery-support'},
      ],
      terrain:[
        // Only the three waiting rooms and two entrance vestibules are carpeted;
        // the rest is one continuous, full-scale terrazzo circulation floor.
        terrain('airportCarpet',35,35,540,245,0,{bottom:-.035,zone:'gate-a'}),
        terrain('airportCarpet',630,35,540,245,0,{bottom:-.035,zone:'gate-b'}),
        terrain('airportCarpet',1225,35,540,245,0,{bottom:-.035,zone:'gate-c'}),
        terrain('airportCarpet',300,1175,250,55,0,{bottom:-.035,zone:'entry'}),
        terrain('airportCarpet',1250,1175,250,55,0,{bottom:-.035,zone:'entry'}),

        // Each gate is a complete repeated bay: portal, podium, ordered seating,
        // charging counter, and planting. This is airport furniture, not cover
        // scattered into empty space.
        terrain('airportGateDesk',115,105,155,58,1.2,{gate:'A1'}),
        terrain('airportGateDesk',710,105,155,58,1.2,{gate:'A2'}),
        terrain('airportGateDesk',1305,105,155,58,1.2,{gate:'A3'}),
        terrain('airportSeats',125,190,330,52,.9,{collisionShape:'capsule',collisionRadius:22}),
        terrain('airportSeats',720,190,330,52,.9,{collisionShape:'capsule',collisionRadius:22}),
        terrain('airportSeats',1315,190,330,52,.9,{collisionShape:'capsule',collisionRadius:22}),
        terrain('airportPlanter',505,175,62,62,1.45,{collisionShape:'circle',collisionRadius:27}),
        terrain('airportPlanter',1100,175,62,62,1.45,{collisionShape:'circle',collisionRadius:27}),
        terrain('airportPlanter',1695,175,62,62,1.45,{collisionShape:'circle',collisionRadius:27}),

        // Four full-depth, wall-integrated shops form the marketplace edges.
        // Their floors are non-blocking; exact fixtures provide honest cover.
        terrain('airportShop',-188,350,270,170,0,{bottom:-.035,shopHeight:3.4,shop:'coffee',front:'east',integratedFloor:true}),
        terrain('airportShop',-188,550,270,170,0,{bottom:-.035,shopHeight:3.4,shop:'books',front:'east',integratedFloor:true}),
        terrain('airportShop',1718,350,270,170,0,{bottom:-.035,shopHeight:3.4,shop:'restaurant',front:'west',integratedFloor:true}),
        terrain('airportShop',1718,550,270,170,0,{bottom:-.035,shopHeight:3.4,shop:'travel',front:'west',integratedFloor:true}),
        terrain('airportShopRoof',-168,370,230,130,3.4,{bottom:3.24,shop:'coffee'}),
        terrain('airportShopRoof',-168,570,230,130,3.4,{bottom:3.24,shop:'books'}),
        terrain('airportShopRoof',1738,370,230,130,3.4,{bottom:3.24,shop:'restaurant'}),
        terrain('airportShopRoof',1738,570,230,130,3.4,{bottom:3.24,shop:'travel'}),
        terrain('airportShopFixture',-155,385,42,100,1.18,{fixture:'counter',shop:'coffee'}),
        terrain('airportShopFixture',-70,380,46,46,.82,{fixture:'table',shop:'coffee',collisionShape:'circle',collisionRadius:20}),
        terrain('airportShopFixture',2,445,46,46,.82,{fixture:'table',shop:'coffee',collisionShape:'circle',collisionRadius:20}),
        terrain('airportShopFixture',-158,580,32,112,1.9,{fixture:'shelf',shop:'books'}),
        terrain('airportShopFixture',-105,580,32,112,1.9,{fixture:'shelf',shop:'books'}),
        terrain('airportShopFixture',-25,600,72,48,.92,{fixture:'display',shop:'books'}),
        terrain('airportShopFixture',1913,382,42,105,1.2,{fixture:'counter',shop:'restaurant'}),
        terrain('airportShopFixture',1820,380,48,48,.82,{fixture:'table',shop:'restaurant',collisionShape:'circle',collisionRadius:21}),
        terrain('airportShopFixture',1750,445,48,48,.82,{fixture:'table',shop:'restaurant',collisionShape:'circle',collisionRadius:21}),
        terrain('airportShopFixture',1925,580,32,112,1.8,{fixture:'shelf',shop:'travel'}),
        terrain('airportShopFixture',1835,595,62,78,1.0,{fixture:'island',shop:'travel'}),
        terrain('airportShopFixture',1750,650,50,48,.92,{fixture:'display',shop:'travel'}),

        // The market court is one designed social island with planting,
        // integrated seating, a privacy screen, and a suspended sculpture.
        terrain('airportMarketIsland',590,445,620,155,1.18,{collisionShape:'capsule',collisionRadius:68}),
        terrain('airportMarketScreen',790,510,220,28,3.45,{bottom:1.18}),
        terrain('airportKiosk',485,625,58,58,1.55,{collisionShape:'circle',collisionRadius:24}),

        // A real upper programme wraps the market: lounge and restaurant
        // galleries, an apron overlook, and one broad bridge. The two permanent
        // stairs keep all elevated combat independent of moving machinery.
        terrain('airportDeck',250,320,240,300,4.1,{bottom:3.84,walkable:true,wing:'restaurant-gallery'}),
        terrain('airportDeck',490,320,820,95,4.1,{bottom:3.84,walkable:true,bridge:true,wing:'apron-overlook'}),
        terrain('airportDeck',1310,320,240,300,4.1,{bottom:3.84,walkable:true,wing:'airline-lounge'}),
        terrain('airportDeck',490,550,820,70,4.1,{bottom:3.84,walkable:true,bridge:true,wing:'market-bridge'}),
        terrain('ramp',350,620,115,210,4.1,{axis:'y',reverse:true,stairs:true,steps:22,style:'airport'}),
        terrain('ramp',1335,620,115,210,4.1,{axis:'y',reverse:true,stairs:true,steps:22,style:'airport'}),
        terrain('rail',250,313,1300,7,5.1,{style:'airport',bottom:4.1}),
        terrain('rail',243,320,7,300,5.1,{style:'airport',bottom:4.1}),
        terrain('rail',1550,320,7,300,5.1,{style:'airport',bottom:4.1}),
        terrain('rail',720,415,360,7,5.1,{style:'airport',bottom:4.1}),
        terrain('rail',490,543,820,7,5.1,{style:'airport',bottom:4.1}),
        terrain('rail',250,620,80,7,5.1,{style:'airport',bottom:4.1}),
        terrain('rail',490,620,820,7,5.1,{style:'airport',bottom:4.1}),
        terrain('rail',1470,620,80,7,5.1,{style:'airport',bottom:4.1}),
        terrain('airportSeats',270,370,175,48,4.95,{bottom:4.1,collisionShape:'capsule',collisionRadius:20}),
        terrain('airportShopFixture',270,500,155,34,5.28,{bottom:4.1,fixture:'counter',shop:'restaurant'}),
        terrain('airportSeats',1340,380,175,48,4.95,{bottom:4.1,collisionShape:'capsule',collisionRadius:20}),
        terrain('airportPlanter',1430,520,58,58,5.45,{bottom:4.1,collisionShape:'circle',collisionRadius:25}),

        // The processing sequence is deliberately linear and correctly scaled:
        // four screening lanes, two six-position airline islands, then doors.
        ...airportScanner(505,810),
        ...airportScanner(725,810),
        ...airportScanner(945,810),
        ...airportScanner(1165,810),
        // The visible shared security header is solid at its actual height.
        terrain('airportScannerCollider',498.75,834.2272727273,797.5,9.5454545454,3.54,
          {bottom:3.02,collisionOnly:true,scannerPart:'shared-header'}),
        terrain('airportCheckin',245,1035,520,62,1.22,{row:'A'}),
        terrain('airportCheckin',1035,1035,520,62,1.22,{row:'B'}),
        // Small staffed bag-drop belts bring back the intimate bit of airport
        // machinery without interrupting either passenger entrance route.
        terrain('airportBaggage',545,1118,190,48,1.05),
        terrain('airportBaggage',1065,1118,190,48,1.05),
        // Departures information belongs on the landside wall opposite the
        // apron glazing, not as two enormous black obstacles in the room.
        terrain('airportFlightBoard',585,1230,300,8,0,{bottom:-.035,wallMounted:true,mountBottom:2.65,displayHeight:2.0}),
        terrain('airportFlightBoard',915,1230,300,8,0,{bottom:-.035,wallMounted:true,mountBottom:2.65,displayHeight:2.0}),
        terrain('airportLuggageCart',95,1090,110,50,.9,{collisionShape:'capsule',collisionRadius:18}),
      ],
      variants:[
        [terrain('airportPlanter',865,945,70,70,1.5,{collisionShape:'circle',collisionRadius:30})],
        [terrain('airportSeats',805,940,190,50,.9,{collisionShape:'capsule',collisionRadius:21})],
        [terrain('airportKiosk',870,940,60,60,1.55,{collisionShape:'circle',collisionRadius:25})],
      ],
      spawns:[
        [70,75],[900,75],[1730,75],[80,300],[900,290],[1720,300],
        [350,430],[1450,430],[500,730],[1300,730],
        [120,960],[1680,960],[80,1180],[900,1180],[1720,1180],
        [300,450,4.1],[590,360,4.1],[1210,360,4.1],[1490,345,4.1],
        [350,575,4.1],[1385,575,4.1],
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
    if(solid.nonSolid)return false;
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
      if(insideFootprint(map,p.x,p.y)&&!solids.some(s=>collides(p.x,p.y,s,20)))points.push(p);
    }
    const blocks=(a,b,s)=>{
      if(s.nonSolid)return false;
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
    const world=map?.worldBounds||{minX:0,minY:0,maxX:map?.width,maxY:map?.height};
    for(const [index,s] of solids.entries()) {
      if(![s.x,s.y,s.width,s.height,s.top??3.1].every(Number.isFinite)||s.width<=0||s.height<=0)
        errors.push(`invalid solid ${index}`);
      else if(s.x<world.minX||s.y<world.minY||s.x+s.width>world.maxX||s.y+s.height>world.maxY)
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
      if(a.nonSolid||b.nonSolid)continue;
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
      else if(!insideFootprint(map,p.x,p.y))errors.push(`spawn outside footprint ${index}`);
      else if(solids.some(s=>collides(p.x,p.y,s,17,p.height||0)))errors.push(`blocked spawn ${index}`);
    }
    // Ground-level flood fill catches accidental sealed regions before an
    // authored layout enters rotation. Ramps are traversable and upper decks
    // are separately exercised by movement/navigation tests.
    if(map?.spawns?.length&&!errors.some(e=>e.startsWith('invalid spawn')||e.startsWith('blocked spawn'))) {
      const step=10,cols=Math.floor(map.width/step),rows=Math.floor(map.height/step),open=new Uint8Array(cols*rows);
      for(let row=0;row<rows;row++)for(let col=0;col<cols;col++) {
        const x=col*step+step/2,y=row*step+step/2;
        open[row*cols+col]=!insideFootprint(map,x,y)||solids.some(s=>collides(x,y,s))?0:1;
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
    if(source.floorRects)map.floorRects=source.floorRects.map(resize);
    if(source.floorPolygon)map.floorPolygon=source.floorPolygon.map(point=>({x:point.x*scale,y:point.y*scale}));
    if(source.worldBounds)map.worldBounds={minX:source.worldBounds.minX*scale,minY:source.worldBounds.minY*scale,
      maxX:source.worldBounds.maxX*scale,maxY:source.worldBounds.maxY*scale};
    if(source.walkablePockets)map.walkablePockets=source.walkablePockets.map(resize);
    const boundaryHeight=source.boundaryTop??source.ceiling??CEILING;
    let perimeter=source.perimeter?source.perimeter.map(resize):boundary(width,height,boundaryHeight,EDGE*scale);
    if(source.sideOpenings?.length) {
      const edge=EDGE*scale,openings=source.sideOpenings.map(([start,end])=>[start*scale,end*scale]);
      const side=x=>{
        const segments=[];let cursor=edge;
        for(const [start,end] of openings) {
          if(start>cursor)segments.push({kind:'boundary',x,y:cursor,width:edge,height:start-cursor,top:boundaryHeight});
          cursor=Math.max(cursor,end);
        }
        if(cursor<height-edge)segments.push({kind:'boundary',x,y:cursor,width:edge,height:height-edge-cursor,top:boundaryHeight});
        return segments;
      };
      perimeter=[
        {kind:'boundary',x:0,y:0,width,height:edge,top:boundaryHeight},
        {kind:'boundary',x:0,y:height-edge,width,height:edge,top:boundaryHeight},
        ...side(0),...side(width-edge),
      ];
    }
    const layout={map,walls:[...perimeter,...source.walls.map(resize)]};
    const result=validatePvpLayout(layout);
    if(!result.valid)throw new Error(`${source.name} failed validation: ${result.errors.join(', ')}`);
    return layout;
  }

  return {PVP_MAPS,PVP_MAP_IDS,buildAuthoredPvpMap,derivePvpSpawns,validatePvpLayout,pvpSightlineMetrics};
});
