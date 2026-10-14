// Procedural PvE architecture. Themes provide a visual vocabulary only; the
// footprint, rooms, adjacency graph, doors, elevations and connectors are all
// derived from the seed.
(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.generateProceduralPveFloor=api.generateProceduralPveFloor;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const THEMES={
    turbine:{name:'INDUSTRIAL WORKS',accent:'#f2a85e',roles:['machine-hall','assembly','maintenance','control','loading','junction'],
      palette:{sky:'#6f858e',wall:'#495f66',panel:'#899da0',cap:'#b7c6c5',glow:'#ffb15c',floorLow:'#28383d',floorHigh:'#526167',reflection:'#586a70',reflectionGlow:'#f3a44e'}},
    freight:{name:'FREIGHT COMPLEX',accent:'#7fc8dc',roles:['warehouse','sorting','maintenance','dispatch','loading','junction'],
      palette:{sky:'#71868c',wall:'#465d63',panel:'#81979b',cap:'#b6c8c8',glow:'#77d9e9',floorLow:'#29383c',floorHigh:'#4c6266',reflection:'#577076',reflectionGlow:'#64c9de'}},
    reactor:{name:'REACTOR COMPLEX',accent:'#72e5c0',roles:['reactor','coolant','generator-room','maintenance','control','junction'],
      palette:{sky:'#61777e',wall:'#40585e',panel:'#789397',cap:'#acc6c3',glow:'#62efc1',floorLow:'#22373a',floorHigh:'#46615f',reflection:'#506d69',reflectionGlow:'#57e5b9'}},
    processing:{name:'PROCESSING COMPLEX',accent:'#e58a67',roles:['processing','ventilation','assembly','maintenance','control','junction'],
      palette:{sky:'#697b84',wall:'#455861',panel:'#7c8e94',cap:'#b4c1c4',glow:'#ff936d',floorLow:'#27353c',floorHigh:'#4d5d64',reflection:'#586970',reflectionGlow:'#ed7d5b'}},
  };
  const PROP_POOLS={
    'machine-hall':['turbine','generator','conveyor','cover'],assembly:['conveyor','generator','cover','pillar'],
    maintenance:['pipe','generator','ventStack','cover'],control:['consoleBank','generator','cover'],
    loading:['storageRack','conveyor','cover'],junction:['cover','pillar','generator','consoleBank'],
    warehouse:['storageRack','storageRack','cover','generator'],sorting:['conveyor','storageRack','cover'],
    dispatch:['consoleBank','storageRack','cover'],reactor:['reactorCore','generator','consoleBank','cover'],
    coolant:['pipe','ventStack','generator','cover'],'generator-room':['generator','generator','pipe','cover'],
    processing:['conveyor','ventStack','generator','cover'],ventilation:['ventStack','pipe','generator','cover'],
  };
  const LIGHTING={control:'clean',dispatch:'clean',reactor:'reactor',coolant:'cool',maintenance:'cool',
    ventilation:'cool',loading:'amber',warehouse:'cool',sorting:'amber',processing:'warm',assembly:'warm',
    'machine-hall':'warm','generator-room':'warm',junction:'neutral'};
  const SIZE={
    turbine:[190,190,4.5],storageRack:[230,54,2.6],reactorCore:[190,190,6.2],consoleBank:[170,48,1.25],
    ventStack:[125,125,3.25],generator:[125,68,1.85],conveyor:[230,62,1.1],pipe:[180,54,1.05],
    cover:[86,42,1.15],pillar:[52,52,4.2],
  };
  const rng=seed=>{let state=seed>>>0;return()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};};
  const shuffle=(values,random)=>{for(let i=values.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[values[i],values[j]]=[values[j],values[i]];}return values;};
  const overlaps=(a,b,gap=0)=>a.x<b.x+b.width+gap&&a.x+a.width+gap>b.x&&a.y<b.y+b.height+gap&&a.y+a.height+gap>b.y;
  const overlaps3d=(a,b,gap=0)=>overlaps(a,b,gap)&&(a.bottom||0)<(b.top||0)-1e-6&&(b.bottom||0)<(a.top||0)-1e-6;
  const quantize=value=>Math.round(value/20)*20;

  // Same conservative body-width proof used by the authority, kept local so
  // browser and server compile the identical deterministic floor. Optional
  // interior walls can then be pruned instead of regenerating the whole map.
  function groundConnected(map,walls){
    const step=10,clearance=18,cols=map.width/step,rows=map.height/step;
    const solids=[...walls,...map.terrain].filter(s=>s.kind!=='exitDoor'&&s.kind!=='ramp'&&(s.bottom||0)<2.2);
    const free=new Uint8Array(cols*rows),seen=new Uint8Array(cols*rows);
    for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
      const x=col*step+step/2,y=row*step+step/2;
      if(x>=28&&x<=map.width-28&&y>=28&&y<=map.height-28)free[row*cols+col]=1;
    }
    for(const s of solids){
      const left=Math.max(0,Math.floor((s.x-clearance)/step)),right=Math.min(cols-1,Math.floor((s.x+s.width+clearance)/step));
      const first=Math.max(0,Math.floor((s.y-clearance)/step)),last=Math.min(rows-1,Math.floor((s.y+s.height+clearance)/step));
      for(let row=first;row<=last;row++)for(let col=left;col<=right;col++){
        const x=col*step+step/2,y=row*step+step/2,dx=x-Math.max(s.x,Math.min(x,s.x+s.width)),dy=y-Math.max(s.y,Math.min(y,s.y+s.height));
        if(dx*dx+dy*dy<clearance*clearance)free[row*cols+col]=0;
      }
    }
    const e=map.arrivalElevator||map.elevator,start=Math.floor((e.y+40)/step)*cols+Math.floor((e.x+40)/step);
    if(!free[start])return false;
    const queue=[start];seen[start]=1;
    for(let i=0;i<queue.length;i++){
      const at=queue[i],col=at%cols;
      for(const next of [col>0?at-1:-1,col<cols-1?at+1:-1,at-cols,at+cols])
        if(next>=0&&next<free.length&&free[next]&&!seen[next]){seen[next]=1;queue.push(next);}
    }
    return queue.length===free.reduce((sum,value)=>sum+value,0);
  }

  function splitRooms(root,target,random,portal){
    const rooms=[{...root,path:'r'}],splits=[];
    while(rooms.length<target){
      const candidates=rooms.map((room,index)=>({room,index,axes:[room.width>=600?'x':null,room.height>=600?'y':null].filter(Boolean)}))
        .filter(value=>value.axes.length);
      if(!candidates.length)break;
      // Do not repeatedly split only the largest room. Weighted random picks
      // leave occasional halls beside tighter support rooms.
      const total=candidates.reduce((sum,value)=>sum+Math.sqrt(value.room.width*value.room.height),0);
      let roll=random()*total,chosen=candidates[0];
      for(const value of candidates){roll-=Math.sqrt(value.room.width*value.room.height);if(roll<=0){chosen=value;break;}}
      const {room,index}=chosen;
      let axis;
      if(room.width/room.height>1.35&&chosen.axes.includes('x'))axis='x';
      else if(room.height/room.width>1.35&&chosen.axes.includes('y'))axis='y';
      else axis=chosen.axes[Math.floor(random()*chosen.axes.length)];
      const span=axis==='x'?room.width:room.height,min=285;
      let at=Math.max(min,Math.min(span-min,quantize(min+random()*(span-min*2))));
      // A BSP cut may never guillotine either elevator throat. The rooms are
      // otherwise unrestricted; this protects only the two actual entrances.
      if(axis==='y'&&(room.x===root.x||room.x+room.width===root.x+root.width)){
        const absolute=room.y+at;
        if(absolute>portal.y0&&absolute<portal.y1){
          const below=quantize(portal.y0-room.y-20),above=quantize(portal.y1-room.y+20);
          if(below>=min&&below<=span-min)at=below;
          else if(above>=min&&above<=span-min)at=above;
          else if(room.width>=600){axis='x';at=Math.max(min,Math.min(room.width-min,quantize(min+random()*(room.width-min*2))));}
        }
      }
      const first=axis==='x'?{x:room.x,y:room.y,width:at,height:room.height,path:room.path+'0'}:
        {x:room.x,y:room.y,width:room.width,height:at,path:room.path+'0'};
      const second=axis==='x'?{x:room.x+at,y:room.y,width:room.width-at,height:room.height,path:room.path+'1'}:
        {x:room.x,y:room.y+at,width:room.width,height:room.height-at,path:room.path+'1'};
      rooms.splice(index,1,first,second);splits.push({path:room.path,axis,ratio:+(at/span).toFixed(3)});
    }
    return {rooms,splits};
  }

  function sharedEdge(a,b){
    const epsilon=.01;
    if(Math.abs(a.x+a.width-b.x)<epsilon||Math.abs(b.x+b.width-a.x)<epsilon){
      const start=Math.max(a.y,b.y),end=Math.min(a.y+a.height,b.y+b.height);
      if(end-start>80)return {orientation:'x',at:Math.abs(a.x+a.width-b.x)<epsilon?b.x:a.x,start,end};
    }
    if(Math.abs(a.y+a.height-b.y)<epsilon||Math.abs(b.y+b.height-a.y)<epsilon){
      const start=Math.max(a.x,b.x),end=Math.min(a.x+a.width,b.x+b.width);
      if(end-start>80)return {orientation:'y',at:Math.abs(a.y+a.height-b.y)<epsilon?b.y:a.y,start,end};
    }
    return null;
  }

  function architectureGraph(zones,entry,exit,random){
    const adjacency=[];
    for(let i=0;i<zones.length;i++)for(let j=i+1;j<zones.length;j++){
      const boundary=sharedEdge(zones[i],zones[j]);
      if(boundary)adjacency.push({a:i,b:j,...boundary});
    }
    const selected=[],visited=new Set([entry]);
    while(visited.size<zones.length){
      const frontier=adjacency.filter(edge=>visited.has(edge.a)!==visited.has(edge.b));
      if(!frontier.length)throw new Error('BSP adjacency graph disconnected');
      const edge=frontier[Math.floor(random()*frontier.length)];selected.push(edge);
      visited.add(visited.has(edge.a)?edge.b:edge.a);
    }
    const treeDegree=new Array(zones.length).fill(0);for(const edge of selected){treeDegree[edge.a]++;treeDegree[edge.b]++;}
    const protectedLeaf=zones.map((zone,index)=>({zone,index})).filter(value=>value.index!==entry&&value.index!==exit&&treeDegree[value.index]===1)
      .sort((a,b)=>{
        const edgeA=selected.find(edge=>edge.a===a.index||edge.b===a.index),edgeB=selected.find(edge=>edge.a===b.index||edge.b===b.index);
        return (edgeB.end-edgeB.start)-(edgeA.end-edgeA.start)||b.zone.width*b.zone.height-a.zone.width*a.zone.height;
      })[0]?.index;
    const keys=new Set(selected.map(edge=>`${edge.a}:${edge.b}`));
    const extras=shuffle(adjacency.filter(edge=>!keys.has(`${edge.a}:${edge.b}`)&&edge.a!==protectedLeaf&&edge.b!==protectedLeaf),random);
    const extraCount=Math.min(extras.length,Math.max(1,Math.round(zones.length*(.16+random()*.2))));
    return {adjacency,connections:[...selected,...extras.slice(0,extraCount)],loopCount:extraCount,protectedLeaf};
  }

  function addCabin(walls,e){
    for(const s of [{x:0,y:0,width:10,height:220},{x:10,y:0,width:150,height:10},
      {x:10,y:210,width:150,height:10},{x:150,y:10,width:10,height:50},{x:150,y:160,width:10,height:50}])
      walls.push({...s,x:e.x+(e.facing==='west'?160-s.x-s.width:s.x),y:e.y+s.y,top:3.4,kind:'cabin'});
  }

  function sealElevatorSide(walls,e,width,height,left,ceiling){
    const x0=left?12:width-224,x1=left?224:width-12,back0=left?12:width-40,back1=left?40:width-12;
    walls.push({kind:'boundary',x:x0,y:12,width:x1-x0,height:e.y-12,top:ceiling});
    walls.push({kind:'boundary',x:x0,y:e.y+220,width:x1-x0,height:height-12-(e.y+220),top:ceiling});
    walls.push({kind:'boundary',x:back0,y:e.y,width:back1-back0,height:220,top:ceiling});
    const throatX=left?200:width-224;
    walls.push({kind:'boundary',x:throatX,y:e.y,width:24,height:60,top:ceiling});
    walls.push({kind:'boundary',x:throatX,y:e.y+160,width:24,height:60,top:ceiling});
  }

  function addWallSegment(walls,edge,start,end,top,extra={}){
    if(end-start<6)return;
    if(edge.orientation==='x')walls.push({x:edge.at-10,y:start,width:20,height:end-start,top,...extra});
    else walls.push({x:start,y:edge.at-10,width:end-start,height:20,top,...extra});
  }

  function generateProceduralPveFloor(seed=Math.floor(Math.random()*0x100000000),floor=1,recent=[]){
    const random=rng(seed),pick=n=>Math.floor(random()*n),themeNames=Object.keys(THEMES);
    const available=themeNames.filter(name=>!recent.slice(-2).includes(name));
    const composition=available[pick(available.length)]||themeNames[pick(themeNames.length)],theme=THEMES[composition];
    const width=quantize(1780+random()*420),height=quantize(1220+random()*340),ceiling=+(10.2+random()*2.4).toFixed(2);
    const arrivalElevator={x:40,y:quantize(height/2-110),width:160,height:220,ceiling:3.4};
    const elevator={...arrivalElevator,x:width-200,facing:'west'};
    const root={x:224,y:12,width:width-448,height:height-24};
    const target=2+pick(8),portal={y0:arrivalElevator.y+32,y1:arrivalElevator.y+188};
    const {rooms,splits}=splitRooms(root,target,random,portal);
    const left=rooms.map((room,index)=>({room,index})).filter(v=>v.room.x===root.x);
    const right=rooms.map((room,index)=>({room,index})).filter(v=>v.room.x+v.room.width===root.x+root.width);
    const elevatorY=arrivalElevator.y+110;
    const chooseDoorRoom=values=>values.sort((a,b)=>Math.abs(a.room.y+a.room.height/2-elevatorY)-Math.abs(b.room.y+b.room.height/2-elevatorY))[0].index;
    const entry=chooseDoorRoom(left),exit=chooseDoorRoom(right);
    const roles=shuffle([...theme.roles],random),zones=rooms.map((room,index)=>({...room,id:`zone-${index}`,
      role:index===entry?'arrival':index===exit?'exit':roles[index%roles.length],elevation:0}));
    const graph=architectureGraph(zones,entry,exit,random);
    const degree=new Array(zones.length).fill(0);for(const edge of graph.connections){degree[edge.a]++;degree[edge.b]++;}
    const elevation=+(2.75+random()*1.35).toFixed(2),wantsRaised=target>=3&&random()>.2;
    let raiseable=zones.map((zone,index)=>({zone,index})).filter(v=>v.index!==entry&&v.index!==exit&&
      v.zone.width>=360&&v.zone.height>=360&&degree[v.index]===1)
      .sort((a,b)=>b.zone.width*b.zone.height-a.zone.width*a.zone.height);
    if(!raiseable.length)raiseable=zones.map((zone,index)=>({zone,index})).filter(v=>v.index!==entry&&v.index!==exit&&
      v.zone.width>=360&&v.zone.height>=360).sort((a,b)=>degree[a.index]-degree[b.index]||b.zone.width*b.zone.height-a.zone.width*a.zone.height);
    const raised=[];
    if(wantsRaised&&raiseable.length){
      const primary=raiseable.find(value=>value.index===graph.protectedLeaf)||raiseable[0];raised.push(primary.index);
    }
    const multiTier=raised.length>0&&random()<.42;
    for(const index of raised)zones[index].elevation=elevation;
    for(const zone of zones){
      zone.ceiling=Math.min(ceiling-.1,Math.max(zone.elevation+6.45,+(7.6+random()*2.05).toFixed(2)));
      zone.lighting=zone.role==='arrival'?'cool':zone.role==='exit'?'green':LIGHTING[zone.role]||'neutral';
      zone.coverStyle=zone.role;
    }
    const map={mode:'pve',width,height,ceiling,floor,seed:seed>>>0,elevator,arrivalElevator,composition,
      botSpawn:{x:width-460,y:height/2},botSpawns:[],terrain:[],zones,pockets:zones,cutouts:[],
      landmark:{theme:composition,name:theme.name,accent:theme.accent},palette:theme.palette,
      features:{multiTier:false,wallCatwalks:0,secondaryWalls:0,fullHeightSecondaryWalls:0,
        architecturalMotifs:[],grandLantern:false}};
    const walls=[{x:0,y:0,width,height:12,top:ceiling},{x:0,y:height-12,width,height:12,top:ceiling},
      {x:0,y:12,width:12,height:height-24,top:ceiling},{x:width-12,y:12,width:12,height:height-24,top:ceiling}];
    addCabin(walls,arrivalElevator);addCabin(walls,elevator);
    sealElevatorSide(walls,arrivalElevator,width,height,true,ceiling);
    sealElevatorSide(walls,elevator,width,height,false,ceiling);
    const connected=new Map(graph.connections.map(edge=>[`${edge.a}:${edge.b}`,edge]));
    const connectors=[];let liftAdded=false;
    for(const edge of graph.adjacency){
      const connection=connected.get(`${edge.a}:${edge.b}`),a=zones[edge.a],b=zones[edge.b];
      const trim=10,start=edge.start+trim,end=edge.end-trim;
      const partitionTop=random()<.78?ceiling:Math.min(ceiling,Math.max(a.elevation,b.elevation)+3.7+random()*.7);
      if(!connection){addWallSegment(walls,edge,start,end,partitionTop,{partition:true});continue;}
      const different=Math.abs(a.elevation-b.elevation)>.1,canLift=different&&!liftAdded&&(end-start)>220;
      const gap=canLift?Math.min(290,end-start-12):different?150:118;
      const center=Math.max(start+gap/2,Math.min(end-gap/2,start+(end-start)*(.28+random()*.44)));
      addWallSegment(walls,edge,start,center-gap/2,partitionTop,{partition:true});
      addWallSegment(walls,edge,center+gap/2,end,partitionTop,{partition:true});
      const connector={a:edge.a,b:edge.b,orientation:edge.orientation,at:edge.at,center,gap};connectors.push(connector);
      if(different){
        const high=a.elevation>b.elevation?a:b,low=high===a?b:a,length=Math.min(205,
          edge.orientation==='x'?low.width-48:low.height-48),rampWidth=canLift?96:112;
        const rampCenter=canLift?center-gap*.25:center;
        if(edge.orientation==='x'){
          const highRight=high.x>low.x;
          map.terrain.push({kind:'ramp',x:highRight?edge.at+12-length:edge.at-12,y:rampCenter-rampWidth/2,
            width:length,height:rampWidth,bottom:0,top:elevation,axis:'x',reverse:!highRight,stairs:true,
            steps:Math.ceil(elevation/.18),accent:theme.accent,connector:true});
          if(canLift){
            const id=`cargo-${edge.a}-${edge.b}`,liftCenter=center+gap*.28;
            map.terrain.push({kind:'lift',id,x:highRight?edge.at-108:edge.at-12,y:liftCenter-44,width:120,height:88,
              bottom:0,top:0,maxTop:elevation,accent:theme.accent,connector:true});
            high.liftServed=id;liftAdded=true;
          }
        }else{
          const highBelow=high.y>low.y;
          map.terrain.push({kind:'ramp',x:rampCenter-rampWidth/2,y:highBelow?edge.at+12-length:edge.at-12,
            width:rampWidth,height:length,bottom:0,top:elevation,axis:'y',reverse:!highBelow,stairs:true,
            steps:Math.ceil(elevation/.18),accent:theme.accent,connector:true});
          if(canLift){
            const id=`cargo-${edge.a}-${edge.b}`,liftCenter=center+gap*.28;
            map.terrain.push({kind:'lift',id,x:liftCenter-44,y:highBelow?edge.at-108:edge.at-12,width:88,height:120,
              bottom:0,top:0,maxTop:elevation,accent:theme.accent,connector:true});
            high.liftServed=id;liftAdded=true;
          }
        }
      }
    }
    for(const zone of zones.filter(zone=>zone.elevation>0)){
      map.terrain.push({kind:'catwalk',x:zone.x+12,y:zone.y+12,width:zone.width-24,height:zone.height-24,
        bottom:zone.elevation-.28,top:zone.elevation,walkable:true,accent:theme.accent,liftServed:zone.liftServed,zone:zone.id});
    }
    const structuralSolid=s=>s.kind==='lift'?{...s,top:s.maxTop}:s;
    const rampLanding=(ramp,high)=>{
      const depth=112,pad=42,vertical=ramp.axis==='y',atEnd=high!==!!ramp.reverse;
      const end=vertical?(atEnd?ramp.y+ramp.height:ramp.y):(atEnd?ramp.x+ramp.width:ramp.x);
      if(vertical)return {x:ramp.x-pad,y:end-depth/2,width:ramp.width+pad*2,height:depth};
      return {x:end-depth/2,y:ramp.y-pad,width:depth,height:ramp.height+pad*2};
    };
    const structureClear=parts=>parts.every((part,index)=>
      !walls.some(wall=>overlaps3d(part,wall))&&
      !map.terrain.some(other=>overlaps3d(part,structuralSolid(other)))&&
      !map.terrain.some(other=>other.kind==='ramp'&&
        (overlaps(part,rampLanding(other,false))||overlaps(part,rampLanding(other,true))))&&
      parts.slice(0,index).every(other=>!overlaps3d(part,other)));
    const addWallCatwalk=(zone,base,top,tier=1)=>{
      if(top+2.45>=Math.min(ceiling,zone.ceiling))return false;
      const horizontalOptions=[];
      if(zone.width>=380&&zone.height>=385)horizontalOptions.push(true);
      if(zone.height>=380&&zone.width>=385)horizontalOptions.push(false);
      if(!horizontalOptions.length)return false;
      const horizontal=horizontalOptions[pick(horizontalOptions.length)],side=random()<.5,depth=104,rampLength=205;
      const along=horizontal?zone.width:zone.height,length=Math.min(along-48,Math.max(340,along*(.5+random()*.2)));
      const alongStart=(horizontal?zone.x:zone.y)+24+random()*Math.max(0,along-length-48);
      let deck,ramp,railAxis,railAt,center;
      if(horizontal){
        const y=side?zone.y+12:zone.y+zone.height-12-depth;
        deck={kind:'catwalk',x:alongStart,y,width:length,height:depth,bottom:top-.28,top,walkable:true,
          accent:theme.accent,zone:zone.id,wallSide:true,tier};center=deck.x+deck.width/2;
        ramp={kind:'ramp',x:center-48,y:side?deck.y+depth:deck.y-rampLength,width:96,height:rampLength,
          bottom:base,top,axis:'y',reverse:side,stairs:true,steps:Math.ceil((top-base)/.18),
          accent:theme.accent,zone:zone.id,wallSide:true,tier};
        railAxis='x';railAt=side?deck.y+depth-6:deck.y;
      }else{
        const x=side?zone.x+12:zone.x+zone.width-12-depth;
        deck={kind:'catwalk',x,y:alongStart,width:depth,height:length,bottom:top-.28,top,walkable:true,
          accent:theme.accent,zone:zone.id,wallSide:true,tier};center=deck.y+deck.height/2;
        ramp={kind:'ramp',x:side?deck.x+depth:deck.x-rampLength,y:center-48,width:rampLength,height:96,
          bottom:base,top,axis:'x',reverse:side,stairs:true,steps:Math.ceil((top-base)/.18),
          accent:theme.accent,zone:zone.id,wallSide:true,tier};
        railAxis='y';railAt=side?deck.x+depth-6:deck.x;
      }
      if(!structureClear([deck,ramp]))return false;
      map.terrain.push(deck,ramp);
      const gap=74;
      if(railAxis==='x')for(const [start,end] of [[deck.x,center-gap],[center+gap,deck.x+deck.width]])if(end-start>20)
        map.terrain.push({kind:'rail',x:start,y:railAt,width:end-start,height:6,bottom:top,top:top+1,
          accent:theme.accent,zone:zone.id,style:'industrial',wallSide:true,tier});
      if(railAxis==='y')for(const [start,end] of [[deck.y,center-gap],[center+gap,deck.y+deck.height]])if(end-start>20)
        map.terrain.push({kind:'rail',x:railAt,y:start,width:6,height:end-start,bottom:top,top:top+1,
          accent:theme.accent,zone:zone.id,style:'industrial',wallSide:true,tier});
      return true;
    };
    if(multiTier){
      const zone=zones[raised[0]],upper=+(zone.elevation+2.55+random()*.65).toFixed(2);
      for(let attempt=0;attempt<6&&!map.features.multiTier;attempt++)
        if(addWallCatwalk(zone,zone.elevation,upper,2))map.features.multiTier=true;
    }
    let desiredCatwalks=random()<.58?1+(random()<.24?1:0):0;
    const catwalkZones=shuffle(zones.filter(zone=>zone.elevation===0&&zone.role!=='arrival'),random);
    for(const zone of catwalkZones){
      if(desiredCatwalks<=0)break;
      let added=false;
      for(let attempt=0;attempt<3&&!added;attempt++)added=addWallCatwalk(zone,0,+(2.65+random()*.8).toFixed(2),1);
      if(added){desiredCatwalks--;map.features.wallCatwalks++;}
    }
    const lanternZones=[...zones].filter(zone=>zone.role!=='arrival').sort((a,b)=>b.width*b.height-a.width*a.height);
    if(lanternZones.length&&random()<(target<=4?.62:.28)){
      const zone=lanternZones[0],size=Math.min(210,Math.max(150,Math.min(zone.width,zone.height)*.32));
      const lantern={kind:'grandLantern',x:zone.x+zone.width/2-size/2,y:zone.y+zone.height/2-size/2,
        width:size,height:size,bottom:Math.max(zone.elevation+4.4,zone.ceiling-4.1),top:zone.ceiling-.18,
        accent:'#ffc66d',zone:zone.id,collisionShape:'circle',collisionRadius:size*.36,landmark:true};
      if(lantern.top-lantern.bottom>2.2&&structureClear([lantern])){
        map.terrain.push(lantern);zone.lighting='lantern';map.features.grandLantern=true;
        Object.assign(map.landmark,{kind:'grand-lantern',zone:zone.id,bounds:{x:lantern.x,y:lantern.y,width:size,height:size}});
      }
    }
    const circulation=new Map(zones.map((zone,index)=>{
      const hubX=zone.x+zone.width*(.36+random()*.28),hubY=zone.y+zone.height*(.36+random()*.28);
      const lanes=[
        {x:hubX-28,y:zone.y+20,width:56,height:zone.height-40},
        {x:zone.x+20,y:hubY-28,width:zone.width-40,height:56},
      ];
      for(const edge of connectors.filter(edge=>edge.a===index||edge.b===index)){
        if(edge.orientation==='x')lanes.push({x:Math.min(edge.at,hubX),y:edge.center-36,
          width:Math.abs(edge.at-hubX),height:72});
        else lanes.push({x:edge.center-36,y:Math.min(edge.at,hubY),width:72,
          height:Math.abs(edge.at-hubY)});
      }
      if(zone.liftServed){
        const lift=map.terrain.find(s=>s.kind==='lift'&&s.id===zone.liftServed),cx=lift.x+lift.width/2,cy=lift.y+lift.height/2;
        if(lift.width>lift.height)lanes.push({x:Math.min(cx,zone.x+zone.width/2),y:cy-38,
          width:Math.abs(cx-(zone.x+zone.width/2)),height:76});
        else lanes.push({x:cx-38,y:Math.min(cy,zone.y+zone.height/2),width:76,
          height:Math.abs(cy-(zone.y+zone.height/2))});
      }
      // Keep an actual body-width landing clear at both ends of every stair.
      // The old hub lanes could protect the route yet still permit a prop just
      // beyond the final tread, which made descending players snag on arrival.
      for(const ramp of map.terrain.filter(s=>s.kind==='ramp')){
        const lane={x:ramp.x-44,y:ramp.y-44,width:ramp.width+88,height:ramp.height+88};
        if(overlaps(lane,zone))lanes.push(lane);
      }
      return [zone.id,lanes];
    }));
    const interiorWallTop=zone=>random()<.3?zone.ceiling:
      Math.min(zone.ceiling,+(3.25+random()*1.65).toFixed(2));
    const canPlaceInteriorWall=(zone,candidate,pending=[])=>
      !walls.some(other=>overlaps(candidate,other,other.secondary?44:0))&&
      !pending.some(other=>overlaps(candidate,other))&&
      !map.terrain.some(other=>overlaps3d(candidate,structuralSolid(other)))&&
      !(circulation.get(zone.id)||[]).some(lane=>overlaps(candidate,lane,20));
    const commitInteriorWall=(zone,candidate,extra={})=>{
      const top=extra.top??interiorWallTop(zone);
      Object.assign(candidate,{top,partition:true,secondary:true,zone:zone.id,...extra});
      if(!canPlaceInteriorWall(zone,candidate))return false;
      walls.push(candidate);map.features.secondaryWalls++;
      if(top>=zone.ceiling-.05)map.features.fullHeightSecondaryWalls++;
      return true;
    };
    // Rooms receive a procedural architectural grammar before loose divider
    // walls. Each grammar is dimension-driven and randomized internally, so
    // it produces recognizable subspaces without selecting a room template.
    const addArchitecturalMotif=(zone,index)=>{
      if(zone.elevation>0||zone.width<285||zone.height<285)return false;
      // Elevator rooms may still gain recessed bays, but never a cross-room
      // spine/chicane that can combine with another wall to choke boarding.
      const motifs=['bays'];
      if(zone.role!=='arrival'&&zone.role!=='exit'&&zone.width>=380&&zone.height>=380)
        motifs.push('spine','chicane');
      const motif=motifs[pick(motifs.length)],candidates=[];
      if(motif==='spine'){
        // A long broken wall changes the room's sightline while preserving a
        // generous opening around the circulation hub.
        const horizontal=(zone.width/zone.height)>(.82+random()*.36);
        const lanes=circulation.get(zone.id)||[],verticalLane=lanes[0],horizontalLane=lanes[1];
        const hubX=verticalLane.x+verticalLane.width/2,hubY=horizontalLane.y+horizontalLane.height/2;
        const gap=112+random()*42;
        if(horizontal){
          const y=zone.y+zone.height*(hubY<zone.y+zone.height/2?.73+random()*.08:.19+random()*.08);
          for(const [start,end] of [[zone.x+30,hubX-gap/2],[hubX+gap/2,zone.x+zone.width-30]])
            if(end-start>74)candidates.push({x:start,y,width:end-start,height:20});
        }else{
          const x=zone.x+zone.width*(hubX<zone.x+zone.width/2?.73+random()*.08:.19+random()*.08);
          for(const [start,end] of [[zone.y+30,hubY-gap/2],[hubY+gap/2,zone.y+zone.height-30]])
            if(end-start>74)candidates.push({x,y:start,width:20,height:end-start});
        }
      }else if(motif==='bays'){
        // Repeated fins carve storage/maintenance alcoves out of one edge.
        const horizontalEdge=random()<.5,count=2+pick(3),side=random()<.5;
        const span=horizontalEdge?zone.width:zone.height,depth=Math.min(145,Math.max(82,(horizontalEdge?zone.height:zone.width)*(.18+random()*.08)));
        for(let i=0;i<count;i++){
          const along=(i+1)*span/(count+1);
          if(horizontalEdge)candidates.push({x:zone.x+along-10,y:side?zone.y+10:zone.y+zone.height-10-depth,width:20,height:depth});
          else candidates.push({x:side?zone.x+10:zone.x+zone.width-10-depth,y:zone.y+along-10,width:depth,height:20});
        }
      }else{
        // Opposed, offset dividers create a broad S-shaped combat route.
        const horizontal=zone.width>=zone.height,length=(horizontal?zone.width:zone.height)*(.28+random()*.11);
        if(horizontal){
          candidates.push({x:zone.x+28,y:zone.y+zone.height*(.28+random()*.08),width:length,height:20});
          candidates.push({x:zone.x+zone.width-28-length,y:zone.y+zone.height*(.64+random()*.08),width:length,height:20});
        }else{
          candidates.push({x:zone.x+zone.width*(.28+random()*.08),y:zone.y+28,width:20,height:length});
          candidates.push({x:zone.x+zone.width*(.64+random()*.08),y:zone.y+zone.height-28-length,width:20,height:length});
        }
      }
      let added=0;
      for(const candidate of candidates)if(commitInteriorWall(zone,candidate,{motif,architectural:true}))added++;
      if(added>=2){map.features.architecturalMotifs.push({zone:zone.id,kind:motif,walls:added});return true;}
      return false;
    };
    for(const [index,zone] of shuffle(zones.map((zone,index)=>[index,zone]),random)){
      const chance=zones.length<=3?.92:.68;
      if(random()<chance)addArchitecturalMotif(zone,index);
    }
    // Secondary walls grow inward from room edges and respect the generated
    // door-to-door circulation lanes. Large two-room halls receive several;
    // dense room networks receive fewer, shorter dividers.
    for(const zone of zones.filter(zone=>zone.elevation===0)){
      const desired=Math.min(5,Math.max(1,Math.round(zone.width*zone.height/(target<=3?135000:205000))));
      let placed=0;
      for(let attempt=0;attempt<desired*18&&placed<desired;attempt++){
        const vertical=random()<.5,maxLength=(vertical?zone.height:zone.width)*(.22+random()*.18);
        const length=Math.min(190,Math.max(90,maxLength)),fromStart=random()<.5;
        const candidate=vertical?{x:quantize(zone.x+zone.width*(.22+random()*.56)),y:fromStart?zone.y+10:zone.y+zone.height-10-length,width:20,height:length}:
          {x:fromStart?zone.x+10:zone.x+zone.width-10-length,y:quantize(zone.y+zone.height*(.22+random()*.56)),width:length,height:20};
        if(!commitInteriorWall(zone,candidate))continue;
        placed++;
      }
    }
    const solidList=()=>[...walls,...map.terrain];
    const place=(zone,kind,index)=>{
      let [pw,ph,objectHeight]=SIZE[kind],rotate=random()<.5;
      if(rotate)[pw,ph]=[ph,pw];
      const bottom=zone.elevation,availableW=zone.width-pw-104,availableH=zone.height-ph-104;
      if(availableW<=0||availableH<=0)return false;
      for(let attempt=0;attempt<30;attempt++){
        const candidate={kind,x:zone.x+52+random()*availableW,y:zone.y+52+random()*availableH,width:pw,height:ph,
          bottom,top:bottom+objectHeight,accent:theme.accent,zone:zone.id};
        if(candidate.top>zone.ceiling-.32)continue;
        if(kind==='turbine'||kind==='reactorCore'||kind==='ventStack'){
          candidate.collisionShape='circle';candidate.collisionRadius=Math.min(pw,ph)*(kind==='reactorCore'?.39:.36);
        }else if(kind==='pipe'){candidate.collisionShape='capsule';candidate.collisionRadius=Math.min(pw,ph)*.3;}
        if(!solidList().some(other=>overlaps3d(candidate,other.kind==='lift'?{...other,top:other.maxTop}:other,14))&&
          !(circulation.get(zone.id)||[]).some(lane=>overlaps(candidate,lane,4))){map.terrain.push(candidate);return true;}
      }
      return false;
    };
    for(const [index,zone] of zones.entries()){
      const pool=PROP_POOLS[zone.role]||PROP_POOLS.junction,count=(index===entry||index===exit?2:4)+pick(3)+
        Math.min(3,Math.floor(zone.width*zone.height/230000));
      let placed=0;
      for(let i=0;i<count;i++)if(place(zone,pool[(i+pick(pool.length))%pool.length],i))placed++;
      // Small generated rooms may reject their large theme prop. They still
      // receive compact cover so the room never becomes an empty box.
      for(let fallback=0;placed<2&&fallback<12;fallback++)if(place(zone,fallback%3?'cover':'pillar',count+fallback))placed++;
    }
    // Enclosed local soffits make ceiling height part of each generated room.
    // Their insets avoid structural walls and their bottoms define the room's
    // actual headroom for movement and projectiles.
    for(const zone of zones)if(zone.ceiling<ceiling-.28){
      map.terrain.push({kind:'ceilingPanel',x:zone.x+12,y:zone.y+12,width:zone.width-24,height:zone.height-24,
        // This is a full enclosed soffit, not a floating wafer. Filling the
        // volume up to the shared roof prevents taller neighbouring rooms and
        // upper catwalks from seeing an unfinished top surface or empty void.
        bottom:zone.ceiling,top:ceiling,accent:theme.accent,zone:zone.id});
    }
    const support=(x,y)=>map.terrain.reduce((value,s)=>s.walkable&&x>=s.x&&x<=s.x+s.width&&y>=s.y&&y<=s.y+s.height?Math.max(value,s.top):value,0);
    const clear=(x,y,foot)=>!solidList().some(s=>{
      const dx=Math.max(s.x-x,0,x-s.x-s.width),dy=Math.max(s.y-y,0,y-s.y-s.height);
      return Math.hypot(dx,dy)<38&&(s.top??3.1)>foot+.05&&(s.bottom||0)<foot+3.8-.001;
    });
    const candidates=[];
    for(const zone of zones){
      for(let y=zone.y+58;y<zone.y+zone.height-48;y+=64)for(let x=zone.x+58;x<zone.x+zone.width-48;x+=64){
        const foot=support(x,y),onLane=(circulation.get(zone.id)||[]).some(lane=>x>=lane.x&&x<=lane.x+lane.width&&y>=lane.y&&y<=lane.y+lane.height);
        if(Math.abs(foot-zone.elevation)<.35&&clear(x,y,foot)&&(zone.elevation===0||onLane))candidates.push({x,y,height:foot,zone:zone.id});
      }
      if(zone.elevation>0)for(const [dx,dy] of [[0,0],[-64,0],[64,0],[0,-64],[0,64]]){
        const x=zone.x+zone.width/2+dx,y=zone.y+zone.height/2+dy,foot=support(x,y);
        if(Math.abs(foot-zone.elevation)<.35&&clear(x,y,foot)&&!candidates.some(p=>p.x===x&&p.y===y))
          candidates.push({x,y,height:foot,zone:zone.id});
      }
    }
    for(const deck of map.terrain.filter(s=>s.walkable&&s.wallSide)){
      const alongX=deck.width>=deck.height;
      for(const t of [.25,.5,.75]){
        const x=alongX?deck.x+deck.width*t:deck.x+deck.width/2,y=alongX?deck.y+deck.height/2:deck.y+deck.height*t;
        if(clear(x,y,deck.top)&&!candidates.some(p=>Math.hypot(p.x-x,p.y-y)<52))
          candidates.push({x,y,height:deck.top,zone:deck.zone});
      }
    }
    const spawnCandidates=[];
    for(const candidate of candidates)if(spawnCandidates.every(other=>Math.hypot(candidate.x-other.x,candidate.y-other.y)>52))spawnCandidates.push(candidate);
    const grouped=new Map();for(const candidate of spawnCandidates){if(!grouped.has(candidate.zone))grouped.set(candidate.zone,[]);grouped.get(candidate.zone).push(candidate);}
    const squads=[...grouped.values()].map(group=>{
      const remaining=shuffle([...group],random),result=[];
      while(remaining.length>=3){const leader=remaining.shift();remaining.sort((a,b)=>Math.hypot(a.x-leader.x,a.y-leader.y)-Math.hypot(b.x-leader.x,b.y-leader.y));
        if(remaining.length>=2&&Math.hypot(remaining[1].x-leader.x,remaining[1].y-leader.y)<180)result.push([leader,...remaining.splice(0,2)]);}
      return result;
    });
    for(let round=0;map.botSpawns.length<30&&squads.some(group=>round<group.length);round++)for(const group of squads){
      if(group[round])map.botSpawns.push(...group[round].slice(0,30-map.botSpawns.length));
    }
    const used=new Set(map.botSpawns.map(point=>`${point.x}:${point.y}:${point.height}`));
    for(const candidate of shuffle([...spawnCandidates],random))if(map.botSpawns.length<30&&!used.has(`${candidate.x}:${candidate.y}:${candidate.height}`)){
      map.botSpawns.push(candidate);used.add(`${candidate.x}:${candidate.y}:${candidate.height}`);
    }
    if(!map.botSpawns.length){const zone=zones[exit]||zones[0];map.botSpawns.push({x:zone.x+zone.width/2,y:zone.y+zone.height/2,height:zone.elevation,zone:zone.id});}
    map.botSpawn={x:map.botSpawns[0].x,y:map.botSpawns[0].y};
    map.upperBotSpawns=map.botSpawns.filter(point=>point.height>0).slice(0,6);
    // Individually clear dividers can occasionally form a map-wide choke in
    // combination. Remove the fewest, newest optional walls needed to restore
    // complete body-width connectivity; structural room walls are immutable.
    while(!groundConnected(map,walls)){
      const optional=[];for(let index=walls.length-1;index>=0;index--)if(walls[index].secondary)optional.push(index);
      if(!optional.length)break;
      // Prefer the one wall whose removal repairs the plan outright. Falling
      // back to the newest wall handles the exceptionally rare multi-wall knot.
      const repair=optional.find(index=>groundConnected(map,walls.filter((_,at)=>at!==index)));
      walls.splice(repair??optional[0],1);
    }
    const survivingSecondary=walls.filter(wall=>wall.secondary);
    map.features.secondaryWalls=survivingSecondary.length;
    map.features.fullHeightSecondaryWalls=survivingSecondary.filter(wall=>{
      const zone=zones.find(value=>value.id===wall.zone);return zone&&wall.top>=zone.ceiling-.05;
    }).length;
    const motifCounts=new Map();
    for(const wall of survivingSecondary.filter(wall=>wall.motif)){
      const key=`${wall.zone}:${wall.motif}`;motifCounts.set(key,(motifCounts.get(key)||0)+1);
    }
    map.features.architecturalMotifs=[...motifCounts].filter(([,count])=>count>=2).map(([key,count])=>{
      const [zone,kind]=key.split(':');return {zone,kind,walls:count};
    });
    const graphEdges=graph.connections.map(edge=>[edge.a,edge.b]);
    const walkable=map.terrain.filter(s=>s.walkable);
    map.topology={zoneCount:zones.length,edgeCount:graphEdges.length,loopCount:graph.loopCount,raisedCount:raised.length,
      verticalLevels:[...new Set(walkable.map(s=>s.top))].sort((a,b)=>a-b),wallCatwalks:map.features.wallCatwalks,
      degreeSequence:[...degree].sort((a,b)=>a-b),splits,edges:graphEdges,
      signature:`${splits.map(s=>s.axis+s.ratio).join('|')}/${graphEdges.map(e=>e.join('-')).sort().join(',')}/${raised.sort((a,b)=>a-b).join(',')}`+
        `/v${[...new Set(walkable.map(s=>s.top))].sort((a,b)=>a-b).join('-')}`+
        `/c${map.features.wallCatwalks}/m${map.features.multiTier?1:0}/l${map.features.grandLantern?1:0}`+
        `/a${map.features.architecturalMotifs.map(value=>value.kind[0]).join('')}/w${map.features.secondaryWalls}`};
    map.connections=connectors;
    if(!map.landmark.bounds)map.landmark.bounds={...root};map.landmark.size=`${zones.length}-zone-network`;
    map.terrain.push({kind:'exitDoor',x:elevator.x,y:elevator.y+60,width:10,height:100,top:elevator.ceiling});
    return {map,walls};
  }
  return {generateProceduralPveFloor};
});
