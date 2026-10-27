import {test} from 'node:test';
import assert from 'node:assert/strict';
import floors from '../public/floors.js';
import maps from '../public/arenaMap.js';
import pvpMaps from '../public/pvpMaps.js';
import movement from '../public/movement.js';
import combat from '../game/hitscan.js';
import server from '../game/gameServer.js';
import navigation from '../game/navigation.js';
import validation from '../game/terrainValidation.js';
import helpers from '../game/helpers.js';
import {createElevatorModel,poseElevator} from '../public/elevator.mjs';
const {generatePveFloor,generateScatterFloor,floorConnected,rectanglesOverlap,floorSpawn,LIFT_TIMING,elevatorSample,inElevator}=floors;

test('authored PvP maps, variants, spawns and raised routes pass validation',()=>{
  assert.deepEqual(pvpMaps.PVP_MAP_IDS,['foundry','courtyard','freight','vaultAnnex','tower','temple','orbital','airport','maze']);
  assert.equal(new Set(pvpMaps.PVP_MAP_IDS.map(id=>pvpMaps.PVP_MAPS[id].name)).size,9);
  for(const id of pvpMaps.PVP_MAP_IDS)for(let variant=0;variant<3;variant++) {
    const layout=maps.createPvpMap(variant,id),again=maps.createPvpMap(variant,id);
    assert.deepEqual(layout,again,`${id} seed ${variant} is deterministic`);
    const result=pvpMaps.validatePvpLayout(layout);
    assert.equal(result.valid,true,`${id}: ${result.errors.join(', ')}`);
    assert.ok(layout.map.spawns.length>=8);
    const solids=[...layout.walls,...layout.map.terrain];
    for(const spawn of layout.map.spawns)
      assert.ok(maps.canOccupy(spawn.x,spawn.y,spawn.height,solids),`${id} spawn is clear`);
    const graph=new navigation.NavigationGraph(layout.map,layout.walls);
    for(const deck of layout.map.terrain.filter(s=>s.walkable)) {
      const goal={x:deck.x+deck.width/2,y:deck.y+deck.height/2,height:deck.top};
      const lift=deck.liftServed&&layout.map.terrain.find(s=>s.kind==='lift'&&s.id===deck.liftServed);
      assert.ok(lift||graph.find(layout.map.spawns[0],goal).length,`${id} raised route is reachable`);
      if(lift)assert.equal(lift.maxTop,deck.top,`${id} lift reaches its raised route`);
    }
  }
});

test('Foundry is built around a connected industrial catwalk network',()=>{
  const {map,walls}=maps.createPvpMap(0,'foundry'),terrain=map.terrain;
  assert.ok(map.width<1300&&map.height<900&&map.ceiling>=13,'compact footprint with a tall interior');
  assert.ok(terrain.filter(s=>s.kind==='catwalk'&&s.walkable).length>=7,'multiple joined walkways and platforms');
  assert.ok(terrain.filter(s=>s.kind==='catwalk'&&s.bridge).length>=3,'bridge crossings');
  assert.ok(terrain.filter(s=>s.kind==='ramp'&&s.stairs).length>=5,'stairs connect both elevated tiers');
  assert.ok(terrain.filter(s=>s.kind==='rail'&&s.style==='industrial').length>=24,'guardrails mark the upper route');
  for(const kind of ['furnace','tank','pipe','conveyor','crane'])
    assert.ok(terrain.some(s=>s.kind===kind),`Foundry includes ${kind} machinery`);
  assert.ok(map.spawns.filter(s=>s.height===3).length>=4,'upper works can host firefights immediately');
  assert.ok(map.spawns.filter(s=>s.height===6).length>=2,'high wall walks can host firefights immediately');
  const graph=new navigation.NavigationGraph(map,walls),upper=map.spawns.filter(s=>s.height===3);
  for(const spawn of upper)assert.ok(graph.find(map.spawns[0],spawn).length,'each raised spawn has a ground route');
});

test('Foundry elevated spawns place players on the catwalk instead of beneath it',t=>{
  let connect,calls=0;
  t.mock.method(global,'setInterval',()=>0);
  // Seed zero selects Foundry; the next value rotates its spawn list to the
  // first reviewed upper spawn.
  t.mock.method(Math,'random',()=>calls++===0?0:0.75);
  const handlers={},io={on(_,fn){connect=fn;},emit(){},socketsLeave(){},to(){return this;}};
  const game=server.createGameServer(io);
  connect({id:'p0',on(name,fn){handlers[name]=fn;}});
  game.waitingPlayers.push({id:'p0',name:'Ground',weapon:'pistol'},{id:'p1',name:'Upper',weapon:'pistol'});
  try {
    handlers.startGame({enableBots:false});
    assert.equal(game.gameMap.id,'foundry');
    assert.ok(game.activePlayers.some(p=>p.height===3&&p.groundHeight===3));
  } finally {game.close();}
});

test('Vault Annex is an irregular, purpose-built Red Vault production complex',()=>{
  const {map,walls}=maps.createPvpMap(0,'vaultAnnex'),terrain=map.terrain;
  assert.equal(map.style,'redVault');
  assert.ok(map.palette.ambientIntensity>=2.5&&map.palette.sunIntensity>=3,
    'the annex uses normal readable arena lighting rather than strike darkness');
  assert.ok(map.palette.rimIntensity>=1.4&&map.palette.rimIntensity<=1.7,
    'a restrained red rim accents the room without washing out neutral lighting');
  assert.equal(map.floorRects.length,5,'joined wings replace the usual rectangular arena slab');
  assert.ok(map.floorPolygon.length>=16,'the collision perimeter follows the stepped architectural silhouette');
  const occupied=map.floorRects.reduce((area,rect)=>area+rect.width*rect.height,0);
  assert.ok(occupied/(map.width*map.height)<.7,'large exterior cutouts make the footprint genuinely non-rectangular');
  assert.equal(maps.withinPlayableFootprint(map,100*.78,100*.78,16),false,
    'concave exterior voids are not silently walkable');
  assert.equal(maps.withinPlayableFootprint(map,500*.78,500*.78,16),true);
  assert.equal(terrain.filter(s=>s.kind==='catwalk'&&s.bridge).length,1);
  assert.equal(terrain.filter(s=>s.kind==='ramp'&&s.stairs).length,0,
    'the strike-style inclines are structural slopes, not generic staircase blocks');
  assert.equal(terrain.filter(s=>s.kind==='ramp'&&s.style==='redVault'&&s.structureDepth===.72).length,2);
  assert.ok(terrain.filter(s=>s.kind==='rail'&&s.style==='redVault').length>=16);
  const galleries=terrain.filter(s=>s.kind==='catwalk'&&!s.bridge);
  assert.equal(galleries.length,2);
  assert.equal(galleries[0].height,galleries[1].height,
    'mirrored control galleries establish one clean architectural datum');
  const stairs=terrain.filter(s=>s.kind==='ramp'&&s.style==='redVault');
  assert.deepEqual([stairs[0].width,stairs[0].height,stairs[0].axis,stairs[0].reverse],
    [stairs[1].width,stairs[1].height,stairs[1].axis,stairs[1].reverse],
    'paired stairs use one consistent proportion and direction');
  assert.ok(stairs[0].height>stairs[0].width*1.8,'the stairs read as broad architectural runs');
  for(const kind of ['reactorCore','turbine','vaultConveyor','vaultColumn','ventStack','storageRack','consoleBank','crane'])
    assert.ok(terrain.some(s=>s.kind===kind),`Vault Annex includes ${kind}`);
  assert.equal(terrain.filter(s=>s.kind==='vaultConveyor').length,3,'processing and receiving have live conveyor lines');
  assert.equal(terrain.filter(s=>s.kind==='vaultColumn').length,6,'a deliberate pillar grid carries the upper works');
  assert.equal(terrain.filter(s=>s.kind==='vaultBarrier').length,2,
    'each variation changes one aligned cover bay instead of scattering props');
  assert.ok(terrain.filter(s=>s.kind==='ceilingPanel'&&s.nonSolid).length>=4,
    'bright ceiling baffles add detail without invisible collision');
  assert.ok(map.spawns.filter(s=>s.height===4).length>=5,'the command and processing galleries host active firefights');
  const graph=new navigation.NavigationGraph(map,walls),ground=map.spawns.find(s=>s.height===0);
  for(const spawn of map.spawns.filter(s=>s.height===4))
    assert.ok(graph.find(ground,spawn).length,'each upper spawn has a permanent stair route');
});

test('Tower has three stair-connected heights and two out-of-phase cargo lifts',()=>{
  const {map,walls}=maps.createPvpMap(0,'tower'),decks=map.terrain.filter(s=>s.walkable);
  assert.equal(map.width,828);assert.equal(map.height,828);assert.equal(map.ceiling,15.5);
  assert.deepEqual([...new Set(decks.map(s=>s.top))].sort((a,b)=>a-b),[3,6,9]);
  assert.ok(map.terrain.filter(s=>s.kind==='ramp'&&s.stairs).length>=4);
  assert.ok(map.terrain.filter(s=>s.kind==='rail').length>=30);
  assert.ok(map.spawns.some(s=>s.height===9));
  const graph=new navigation.NavigationGraph(map,walls);
  for(const deck of decks) {
    const goal={x:deck.x+deck.width/2,y:deck.y+deck.height/2,height:deck.top};
    assert.ok(graph.find(map.spawns[0],goal).length,'stairs provide a permanent route to every deck');
  }
  const lifts=map.terrain.filter(s=>s.kind==='lift');assert.equal(lifts.length,2);
  for(const lift of lifts)for(const deck of decks) {
    const overlapX=Math.min(lift.x+lift.width,deck.x+deck.width)-Math.max(lift.x,deck.x);
    const overlapY=Math.min(lift.y+lift.height,deck.y+deck.height)-Math.max(lift.y,deck.y);
    assert.ok(overlapX<=1e-6||overlapY<=1e-6,`${lift.id} has a clear shaft through fixed floors`);
  }
  maps.updateCargoLifts(map,[],100000);
  assert.deepEqual(lifts.map(s=>s.top),[6,0]);
  maps.updateCargoLifts(map,[],104000);
  assert.deepEqual(lifts.map(s=>s.top),[0,9]);
});

test('Overgrown Temple is a grassy two-layer sanctuary with reachable decks and tunnels',()=>{
  const {map,walls}=maps.createPvpMap(0,'temple'),terrain=map.terrain;
  assert.equal(map.style,'temple');assert.equal(map.roof,false);
  assert.equal(map.palette.groundStyle,'grass','the arena floor uses its grass shader instead of the shared tile grid');
  assert.ok(map.width<1150&&map.height<900,'compact close-to-medium-range footprint');
  for(const kind of ['templeTree','templePool','waterfall','templeAltar','templePillar','templeRoot','templePath','templeCourt','ruinWall'])
    assert.ok(terrain.some(s=>s.kind===kind),`Temple includes ${kind}`);
  const terraces=terrain.filter(s=>s.kind==='ruinDeck'&&s.walkable);
  assert.equal(terraces.length,4);assert.ok(terraces.every(s=>s.top===3&&s.bottom>=2.6));
  const terraceCoverage=terraces.reduce((sum,s)=>sum+s.width*s.height,0)/(map.width*map.height);
  assert.ok(terraceCoverage>.29,'the raised sanctuary occupies a substantial region of the arena');
  const tree=terrain.find(s=>s.kind==='templeTree');
  assert.ok(tree.collisionRadius<Math.min(tree.width,tree.height)*.25,
    'the big tree collides with its trunk rather than its canopy and roots');
  const treeEdge={x:tree.x+tree.width/2+tree.collisionRadius+16.1,y:tree.y+tree.height/2};
  assert.ok(maps.canOccupy(treeEdge.x,treeEdge.y,0,[tree]),'players can move closely and smoothly around the trunk');
  assert.equal(terrain.filter(s=>s.kind==='templePath').length,4,'stone paving identifies all four covered passages');
  for(const deck of terraces)assert.ok(walls.some(w=>w.top<deck.bottom&&
    Math.min(w.x+w.width,deck.x+deck.width)>Math.max(w.x,deck.x)&&
    Math.min(w.y+w.height,deck.y+deck.height)>Math.max(w.y,deck.y)),
  'the elevated sanctuary is supported by playable tunnel walls');
  assert.ok(terrain.filter(s=>s.kind==='ramp'&&s.style==='temple').length>=2);
  assert.ok(map.spawns.filter(s=>s.height>0).length>=4,'both terraces can begin with active firefights');
  const northCenter=map.spawns.find(s=>Math.abs(s.x-map.width/2)<1&&s.y<map.height*.12);
  assert.equal(northCenter?.height,3,'the enlarged north terrace never spawns a player beneath its roof');
  const jumpables=terrain.filter(s=>s.kind==='templeStep');
  const jumpApex=movement.MOVEMENT.jumpSpeed**2/(2*movement.MOVEMENT.gravity);
  assert.equal(jumpables.length,6,'broken column drums create multiple ground-level jump routes');
  assert.ok(jumpables.every(s=>s.top<=jumpApex&&s.collisionShape==='circle'),
    'every broken column has a reachable top and a collider matching its round geometry');
  const watchLift=terrain.find(s=>s.kind==='lift'&&s.id==='temple-watch-lift');
  const watchDecks=terrain.filter(s=>s.kind==='templeTowerDeck');
  const watchPillars=terrain.filter(s=>s.kind==='templeTowerPillar');
  assert.ok(watchLift&&watchLift.maxTop>=7,'the side watchtower is genuinely tall');
  assert.equal(terrain.filter(s=>s.liftId===watchLift.id).length,0,'the moving watch lift has no attached fences');
  assert.equal(watchDecks.length,4,'the firing deck forms a ring around its lift shaft');
  assert.equal(watchPillars.length,4,'four tall masonry piers establish the tower silhouette');
  assert.ok(watchDecks.every(deck=>deck.bottom>6.8&&deck.top===watchLift.maxTop&&deck.liftServed===watchLift.id));
  for(const deck of watchDecks) {
    const overlapX=Math.min(deck.x+deck.width,watchLift.x+watchLift.width)-Math.max(deck.x,watchLift.x);
    const overlapY=Math.min(deck.y+deck.height,watchLift.y+watchLift.height)-Math.max(deck.y,watchLift.y);
    assert.ok(overlapX<=1e-6||overlapY<=1e-6,'fixed tower deck never crosses the moving shaft');
  }
  assert.ok(map.spawns.some(s=>s.height===watchLift.maxTop&&
    watchDecks.some(deck=>s.x>=deck.x&&s.x<=deck.x+deck.width&&s.y>=deck.y&&s.y<=deck.y+deck.height)),
  'the firing deck participates in combat rather than remaining decorative');
  const graph=new navigation.NavigationGraph(map,walls);
  for(const terrace of terraces) {
    const goal={x:terrace.x+terrace.width/2,y:terrace.y+terrace.height/2,height:terrace.top};
    assert.ok(graph.find(map.spawns[0],goal).length,'every terrace has a permanent stair route');
  }
  // Walk the S-bend from the western grass approach, beneath the sanctuary,
  // and out into the sacred court. Every interior point has a real low roof.
  const scale=map.width/1300,route=[[250,510],[350,510],[380,420],[450,420],[480,450],[550,450]]
    .map(([x,y])=>({x:x*scale,y:y*scale}));
  const player={...route[0],height:0},solids=[...walls,...terrain];
  assert.ok(maps.canOccupy(player.x,player.y,0,solids));
  for(const point of route.slice(1))assert.ok(maps.moveOnTerrain(player,point.x,point.y,map,solids,0),'tunnel bend is walkable');
  assert.equal(player.ceilingHeight,map.ceiling,'route emerges from the undercroft into the open court');
});

test('Orbital Station is open to space with two distinct floors, opposite stairs and unrailed bridges',()=>{
  const {map,walls}=maps.createPvpMap(0,'orbital'),terrain=map.terrain;
  assert.equal(map.style,'orbital');assert.equal(map.roof,false);
  assert.equal(map.palette.wall,'#d7dde3');assert.equal(map.palette.floorHigh,'#edf1f4');
  assert.ok(map.ceiling>=14,'the open station keeps a tall unrestricted sky volume');
  assert.ok(walls.filter(w=>w.kind==='boundary').every(w=>w.top<1.5),
    'low perimeter structure leaves the starfield visible instead of forming an outdoor box');
  const tunnels=terrain.filter(s=>s.kind==='orbitalTunnelRoof');
  assert.equal(tunnels.length,2);
  assert.ok(tunnels.every(s=>!s.walkable&&s.bottom>=2.7&&s.top===3),
    'both tunnels have genuine low ceilings without introducing an accidental third floor');
  const decks=terrain.filter(s=>s.kind==='orbitalDeck'&&s.walkable);
  assert.equal(decks.length,7);assert.ok(decks.every(s=>s.top===4.5&&s.bottom===4.22));
  assert.equal(decks.filter(s=>s.bridge).length,3,'three narrow bridges join distinct upper-floor wings');
  const stairs=terrain.filter(s=>s.kind==='ramp'&&s.style==='orbital');
  assert.equal(stairs.length,2);assert.ok(stairs.every(s=>s.axis==='y'&&s.top===4.5));
  assert.deepEqual(stairs.map(s=>!!s.reverse).sort(),[false,true],
    'west and east stairs descend in opposing north/south directions');
  assert.equal(terrain.filter(s=>s.kind==='rail').length,0,'the exposed bridges deliberately have no railings');
  assert.ok(terrain.filter(s=>s.kind==='orbitalSupport').length>=6,'upper floors have visible structural supports');
  for(const kind of ['orbitalCore','orbitalAntenna','orbitalPod','orbitalCrate','orbitalSupport'])
    assert.ok(terrain.some(s=>s.kind===kind),`station includes ${kind}`);
  const crates=terrain.filter(s=>s.kind==='orbitalCrate'),jumpApex=movement.MOVEMENT.jumpSpeed**2/(2*movement.MOVEMENT.gravity);
  assert.ok(crates.length>=3&&crates.every(s=>s.jumpable&&s.top<=jumpApex-.3),
    'every orbital crate leaves a forgiving portion of the jump arc for climbing onto it');
  const crate=crates[0],jumper={x:crate.x-18,y:crate.y+crate.height/2,height:crate.top+.12,
    groundHeight:0,jumpStartedAt:1,bodyHeight:2.2};
  assert.ok(maps.moveOnTerrain(jumper,crate.x+crate.width/2,jumper.y,map,[...walls,...terrain],100),
    'an ordinary airborne player can cross the crate edge');
  assert.equal(jumper.groundHeight,crate.top,'the crate top becomes the landing surface');

  // Walk deep into the first tunnel. Collision/headroom must recognize the
  // overhead shell rather than treating it as decorative rooftop geometry.
  const tunnel=tunnels[0],solids=[...walls,...terrain];
  const player={x:tunnel.x+30,y:tunnel.y+tunnel.height/2,height:0,bodyHeight:2.2};
  assert.ok(maps.canOccupy(player.x,player.y,0,solids));
  assert.ok(maps.moveOnTerrain(player,tunnel.x+tunnel.width-35,player.y,map,solids,0));
  assert.equal(player.ceilingHeight,tunnel.bottom);

  const graph=new navigation.NavigationGraph(map,walls);
  for(const surface of terrain.filter(s=>s.walkable)) {
    const goal={x:surface.x+surface.width/2,y:surface.y+surface.height/2,height:surface.top};
    assert.ok(graph.find(map.spawns[0],goal).length,'every upper wing and bridge has a permanent stair route');
  }
  assert.ok(map.spawns.some(s=>s.height===0&&tunnels.some(t=>s.x>t.x&&s.x<t.x+t.width&&s.y>t.y&&s.y<t.y+t.height)),
    'ground spawns can begin inside the tunnels');
  assert.ok(map.spawns.filter(s=>s.height===4.5).length>=5,'the second floor participates in combat');
  assert.deepEqual([...new Set(map.spawns.map(s=>s.height))].sort((a,b)=>a-b),[0,4.5],
    'spawns reinforce the two-floor combat structure');
});

test('Terminal 7 is a connected full-scale departures terminal with processing, market, gates and mezzanine',()=>{
  const {map,walls}=maps.createPvpMap(0,'airport'),terrain=map.terrain,solids=[...walls,...terrain];
  assert.equal(map.name,'Terminal 7');assert.equal(map.style,'airport');
  assert.equal(map.palette.groundStyle,'airport');
  assert.ok(map.width>=1300&&map.height>=900,'terminal has a genuinely roomy international-airport footprint');
  assert.ok(map.ceiling>=10.5,'the enlarged departure hall also gains vertical breathing room');
  for(const kind of ['airportCheckin','airportScanner','airportSeats','airportGateDesk',
    'airportLuggageCart','airportFlightBoard','airportKiosk','airportPlanter','airportShop','airportShopRoof',
    'airportShopFixture','airportMarketIsland'])
    assert.ok(terrain.some(s=>s.kind===kind),`terminal includes ${kind}`);
  assert.deepEqual([...new Set(terrain.filter(s=>s.kind==='airportShop').map(s=>s.shop))].sort(),
    ['books','coffee','restaurant','travel'],'the marketplace has four distinct perimeter tenants');
  for(const shop of terrain.filter(s=>s.kind==='airportShop')) {
    assert.equal(shop.top,0,'shop floor marker does not fill its walkable interior with collision');
    const enclosure=walls.filter(w=>w.airportWall==='shop'&&w.shop===shop.shop);
    assert.equal(enclosure.length,3,`${shop.shop} has two side returns and its own terminating back wall`);
    assert.equal(enclosure.filter(w=>w.shopBack).length,1,`${shop.shop} is a self-contained room`);
    assert.ok(shop.front==='east'||shop.front==='west','shops are recessed into the long perimeter walls');
    assert.ok(Math.abs(shop.width-237.6)<1e-6&&Math.abs(shop.height-149.6)<1e-6,
      'moving the store through the shell does not change its original dimensions');
    assert.ok(shop.x<0||shop.x+shop.width>map.width,`${shop.shop} extends beyond the main terminal footprint`);
    const entry={x:shop.x+shop.width/2,y:shop.y+shop.height/2,height:0};
    if(shop.front==='north')entry.y=shop.y+12;
    if(shop.front==='south')entry.y=shop.y+shop.height-12;
    if(shop.front==='west')entry.x=shop.x+12;
    if(shop.front==='east')entry.x=shop.x+shop.width-12;
    assert.ok(maps.canOccupy(entry.x,entry.y,0,solids),`${shop.shop} has a physically open, walkable entrance`);
  }
  assert.equal(map.walkablePockets.length,4,'movement expands only inside the four enclosed stores');
  const shopOverheads=walls.filter(w=>w.airportWall==='shop-overhead');
  assert.equal(shopOverheads.length,4,'the terminal shell remains continuous above all four shop openings');
  assert.ok(shopOverheads.every(w=>Math.abs(w.bottom-3.4)<1e-6&&w.top===map.ceiling),
    'shop openings stop at the storefront roof instead of erasing the wall up to the terminal ceiling');
  for(const side of ['west','east']) {
    const shops=terrain.filter(s=>s.kind==='airportShop'&&(side==='west'?s.x<0:s.x+s.width>map.width));
    assert.ok(shops.some(shop=>{
      const x=side==='west'?-8:map.width+8;
      for(let y=shop.y+20;y<shop.y+shop.height-20;y+=4)
        if(maps.canOccupy(x,y,0,solids))return true;
      return false;
    }),`a player can stand beyond the main ${side} wall inside a store`);
  }
  const checkinY=Math.max(...terrain.filter(s=>s.kind==='airportCheckin').map(s=>s.y));
  const securityY=Math.max(...terrain.filter(s=>s.kind==='airportScanner').map(s=>s.y));
  const gateY=Math.max(...terrain.filter(s=>s.kind==='airportGateDesk'&&!s.bottom).map(s=>s.y));
  assert.ok(checkinY>securityY&&securityY>gateY,'departures flow coherently from check-in through security to gates');
  const scanners=terrain.filter(s=>s.kind==='airportScanner'),scannerColliders=terrain.filter(s=>s.kind==='airportScannerCollider');
  assert.equal(scanners.length,4,'security has four full-scale screening lanes');
  assert.equal(scannerColliders.length,17,'scanner collision includes uprights, arch heads, belts and the shared header');
  for(const scanner of scanners) {
    assert.equal(scanner.nonSolid,true,'the scanner authoring rectangle is visual only');
    const cy=scanner.y+scanner.height/2;
    assert.ok(maps.canOccupy(scanner.x+scanner.width*.30,cy,0,solids),
      'the blue scanner field is a genuinely walkable opening');
    assert.equal(maps.canOccupy(scanner.x+scanner.width*.10,cy,0,solids),false,
      'the visible white scanner upright remains solid');
    assert.equal(maps.canOccupy(scanner.x+scanner.width*.80,cy,0,solids),false,
      'the visible baggage belt remains solid');
    assert.ok(Number.isFinite(combat.rayBox(scanner.x+scanner.width*.30,scanner.y-10,0,1,
      scannerColliders.find(s=>s.scannerPart==='arch-head'&&s.x>=scanner.x&&s.x<scanner.x+scanner.width),2.3,0)),
    'a shot angled through the top of a screening arch hits its visible crossbar');
  }
  const securityHeader=scannerColliders.find(s=>s.scannerPart==='shared-header');
  assert.ok(Number.isFinite(combat.rayBox(scanners[1].x+30,securityHeader.y-10,0,1,
    securityHeader,3.28,0)),
    'the common steel screening header blocks elevated shots');
  const carpets=terrain.filter(s=>s.kind==='airportCarpet');
  const carpetCoverage=carpets.reduce((sum,s)=>sum+s.width*s.height,0)/(map.width*map.height);
  assert.ok(carpets.length>=5&&carpetCoverage<.20,
    'carpet is confined to gate lounges and entrance mats rather than color-blocking whole concourses');
  assert.ok(walls.filter(s=>s.airportWall==='glass').length>=4,'gate bays and security use aligned glazed partitions');
  const market=terrain.find(s=>s.kind==='airportMarketIsland');
  assert.ok(market.width>map.width*.25&&market.height>map.height*.08,
    'the market court is a substantial social landmark rather than a loose prop cluster');
  const screen=terrain.find(s=>s.kind==='airportMarketScreen');
  assert.ok(screen&&Math.abs(screen.bottom-market.top)<1e-6&&screen.top>3,
    'the market has one integrated, standing-height sightline break');
  assert.equal(terrain.filter(s=>s.kind==='airportKiosk').length,1,
    'the market keeps a single information kiosk instead of scattered ones');
  assert.equal(walls.filter(s=>s.zone==='retail-windbreak').length,0,
    'loose glass windbreaks no longer clutter the shop frontages');
  const sightlines=pvpMaps.pvpSightlineMetrics({map,walls});
  assert.ok(sightlines.visibleRatio<.55&&sightlines.p90<800,
    'the terminal keeps varied fights without the old cross-hall shooting lanes');
  const galleryPanel=walls.find(s=>s.zone==='gallery-screen'&&s.width>s.height);
  assert.ok(galleryPanel,'the overlook has solid cover at some upper-floor angles');
  const screenWalls=walls.filter(s=>s.zone==='gallery-screen');
  assert.equal(screenWalls.length,4);
  const longScreens=screenWalls.filter(s=>s.width>s.height).sort((a,b)=>a.x-b.x);
  const sideScreens=screenWalls.filter(s=>s.height>s.width).sort((a,b)=>a.x-b.x);
  assert.ok(Math.abs(longScreens[0].x-(sideScreens[0].x+sideScreens[0].width))<1e-6,
    'the west gallery screen meets its side return without a gap');
  assert.ok(Math.abs(longScreens[1].x+longScreens[1].width-sideScreens[1].x)<1e-6,
    'the east gallery screen meets its side return without a gap');
  assert.ok(sideScreens.every(s=>Math.abs(s.y-longScreens[0].y)<1e-6&&
    terrain.some(rail=>rail.kind==='rail'&&rail.style==='airport'&&
      Math.abs(rail.y-(s.y+s.height))<1e-6)),
  'both returns run continuously from the upper bridge to the lower bridge rail');
  const galleryShotLength=map.height*200/1250;
  assert.ok(combat.rayBox(galleryPanel.x+galleryPanel.width/2,map.height*380/1250,
    0,1,galleryPanel,5.94,0)<galleryShotLength,
  'a gallery screen blocks an eye-level shot from one upper route to the other');
  const decks=terrain.filter(s=>s.kind==='airportDeck'&&s.walkable),stairs=terrain.filter(s=>s.kind==='ramp'&&s.style==='airport');
  assert.equal(decks.length,4);assert.equal(stairs.length,2);
  assert.equal(terrain.filter(s=>s.kind==='rail'&&s.style==='airport'&&s.axis).length,0,
    'stair flights stay open instead of being squeezed between glass walls');
  const galleryScreens=walls.filter(w=>w.airportWall==='glass'&&w.zone==='gallery-support');
  assert.equal(galleryScreens.length,2,'the displaced glass becomes two aligned supports beneath the upper platforms');
  assert.equal(walls.filter(w=>w.zone==='security').length,0,
    'no tall glass partition remains beside either terminal staircase');
  for(const [index,stair] of stairs.entries()) {
    const support=galleryScreens[index],stairCenter=stair.x+stair.width/2;
    assert.ok(support.width<support.height,'support runs parallel to the north-south stair axis');
    assert.ok(Math.abs(support.x+support.width/2-stairCenter)<1e-6,'support continues the stair centre line');
    assert.ok(Math.abs(support.y+support.height-stair.y)<1e-6,'support stops where the stair flight begins');
    assert.equal(support.top,3.84,'support meets the underside of the upper platform');
  }
  assert.ok(decks.every(s=>s.top===4.1&&s.bottom===3.84));
  const graph=new navigation.NavigationGraph(map,walls);
  for(const deck of decks) {
    const goal={x:deck.x+deck.width/2,y:deck.y+deck.height/2,height:deck.top};
    assert.ok(graph.find(map.spawns[0],goal).length,'both terminal staircases connect to the full mezzanine');
  }
  const publicSpawn=map.spawns.find(s=>s.height===0&&s.y<map.height*.7);
  const landsideSpawn=map.spawns.find(s=>s.height===0&&s.y>map.height*.75);
  assert.ok(publicSpawn&&landsideSpawn&&graph.find(publicSpawn,landsideSpawn).length,
    'the gate hall, market, security, and landside hall belong to one circulation graph');
  assert.ok(map.spawns.filter(s=>s.height===4.1).length>=6,'upstairs combat has dedicated spawns around the gallery circuit');
  for(const spawn of map.spawns)assert.ok(maps.canOccupy(spawn.x,spawn.y,spawn.height,solids));
});

test('every PvP map is compact and stays inside the shared sightline budget',()=>{
  for(const id of pvpMaps.PVP_MAP_IDS)for(let variant=0;variant<3;variant++) {
    const layout=maps.createPvpMap(variant,id),metrics=pvpMaps.pvpSightlineMetrics(layout);
    const sizeLimit=id==='airport'?[1600,1120]:[1520,1040];
    assert.ok(layout.map.width<=sizeLimit[0]&&layout.map.height<=sizeLimit[1],`${id} has a compact combat footprint`);
    assert.ok(metrics.p90<=820,`${id} p90 sightline ${metrics.p90.toFixed(0)} exceeds the budget`);
    assert.ok(metrics.max<=1450,`${id} maximum sightline ${metrics.max.toFixed(0)} exceeds the budget`);
  }
});

test('PvP seeded rotation can exclude the previous map',()=>{
  for(let seed=0;seed<32;seed++) {
    const first=maps.createPvpMap(seed);
    const next=maps.createPvpMap(seed,undefined,first.map.id);
    assert.notEqual(next.map.id,first.map.id);
  }
});

test('boarding includes legal wall-hugging positions but excludes the doorway and airborne riders',()=>{
  const {map,walls}=generatePveFloor(0);
  floors.updateExitDoor(map,{phase:'ready',startedAt:0},2000);
  const solids=[...walls,...map.terrain];
  for(const e of [map.arrivalElevator,map.elevator]) {
    const cabinMap={...map,elevator:e};
    for(const inset of [25.900001,26,27,28])for(const [x,y] of [
      [e.x+inset,e.y+110],[e.x+e.width-inset,e.y+110],
      [e.x+80,e.y+inset],[e.x+80,e.y+e.height-inset],
      [e.x+inset,e.y+inset],[e.x+e.width-inset,e.y+e.height-inset],
    ]) {
      const p={x,y,height:0};
      assert.ok(maps.canOccupy(x,y,0,solids),'position is legal in the actual cabin');
      assert.ok(inElevator(p,cabinMap),'every legal wall-hugging rider counts');
      assert.equal(inElevator({...p,height:0.5},cabinMap),false);
    }
    const doorway={x:e.facing==='west'?e.x+20:e.x+e.width-20,y:e.y+110,height:0};
    assert.equal(inElevator(doorway,cabinMap),false,'body must clear the closing door');
  }
});

test('only authenticated qing starting from the lobby can select a PvE floor',t=>{
  t.mock.method(global,'setInterval',()=>0);
  for(const scenario of [
    {user:'qing',floor:5,expected:5},
    {user:'qing',floor:30,expected:30},
    {user:'someone',floor:5,expected:1},
    {floor:5,expected:1},
    {user:'qing',floor:5,outsider:true,expected:1},
    {user:'qing',floor:0,expected:1},
    {user:'qing',floor:2.5,expected:1},
    {user:'qing',floor:'5',expected:1},
    {user:'qing',floor:Infinity,expected:1},
    {user:'qing',floor:5,pvp:true,expected:1},
  ]) {
    let connect;const handlers={},events=[];
    const io={on(_,fn){connect=fn;},emit(name,data){events.push({name,data});},socketsLeave(){},to(){return this;}};
    const game=server.createGameServer(io);
    // socket.user is trusted server authentication; names/payload claims are not.
    connect({id:'p0',user:scenario.user?{username:scenario.user}:undefined,on(name,fn){handlers[name]=fn;}});
    game.waitingPlayers.push({id:scenario.outsider?'other':'p0',name:'qing',accountUsername:'qing',weapon:'pistol'},
      {id:'p1',name:'Teammate',weapon:'pistol'});
    try {
      handlers.startGame({enableBots:!scenario.pvp,startFloor:scenario.floor,username:'qing'});
      assert.equal(game.floorState.floor,scenario.expected);
      if(!scenario.pvp) {
        assert.equal(game.gameMap.floor,scenario.expected);
        const bots=game.activePlayers.filter(p=>p.isBot);
        assert.equal(bots.length,Math.min(24,4+Math.min(scenario.expected,20)-1));
        assert.equal(bots.filter(p=>p.botType==='ogre').length,scenario.expected<5?0:Math.min(4,1+Math.floor((scenario.expected-5)/3)));
        if(scenario.expected>20) {
          const dreads=bots.filter(p=>p.botType==='dread');
          assert.equal(dreads.length,3);assert.equal(dreads.filter(p=>p.botRank==='captain').length,3);
          assert.ok(dreads.every(p=>p.color.startsWith('#')&&!p.color.toLowerCase().includes('purple')));
          assert.ok(dreads.filter(p=>p.botRank==='captain').every(p=>p.health===Math.min(300,220+(scenario.expected-21)*5)+40));
        }
        assert.equal(events.find(e=>e.name==='floorState').data.floor,scenario.expected);
      } else assert.equal(game.gameMap.mode,'pvp');
    } finally {game.close();}
  }
});

test('authenticated qing can select every PvP map and spawn one matching debug clone',t=>{
  t.mock.method(global,'setInterval',()=>0);
  for(const mapId of pvpMaps.PVP_MAP_IDS) {
    let connect;const handlers={},events=[];
    const io={on(_,fn){connect=fn;},emit(name,data){events.push({name,data});},socketsLeave(){},to(){return this;}};
    const game=server.createGameServer(io);
    connect({id:'qing-socket',user:{username:'qing'},on(name,fn){handlers[name]=fn;}});
    game.waitingPlayers.push({id:'qing-socket',name:'qing',displayName:'qing',accountUsername:'qing',
      color:'#abc123',weapon:'sniper',weaponSkinKey:'sniper_flatpack',primaryWeapon:'sniper',
      primaryWeaponSkinKey:'sniper_flatpack',secondaryWeapon:'pistol',secondaryWeaponSkinKey:'pistol_default'});
    try {
      handlers.startGame({enableBots:false,pvpMap:mapId,debugDouble:true});
      assert.equal(game.gameMap.id,mapId);
      assert.equal(game.activePlayers.length,2);
      const owner=game.activePlayers.find(p=>p.id==='qing-socket');
      const clone=game.activePlayers.find(p=>p.debugCloneOf==='qing-socket');
      assert.ok(owner&&clone);assert.equal(clone.isBot,undefined);
      for(const key of ['color','weapon','weaponSkinKey','primaryWeapon','primaryWeaponSkinKey',
        'secondaryWeapon','secondaryWeaponSkinKey','accountUsername','maxHealth'])
        assert.equal(clone[key],owner[key],`${mapId} clone preserves ${key}`);
      assert.ok(Math.hypot(clone.x-owner.x,clone.y-owner.y)>100,'clone uses a separate reviewed spawn');
      assert.equal(events.find(e=>e.name==='gameStarting').data.players.length,2);
    } finally {game.close();}
  }

  // Payload claims alone cannot enable the privileged solo/debug path.
  let connect;const handlers={};
  const io={on(_,fn){connect=fn;},emit(){},socketsLeave(){},to(){return this;}};
  const game=server.createGameServer(io);
  connect({id:'other',user:{username:'someone'},on(name,fn){handlers[name]=fn;}});
  game.waitingPlayers.push({id:'other',name:'qing',accountUsername:'qing',weapon:'pistol'},
    {id:'friend',name:'Friend',accountUsername:'friend',weapon:'pistol'});
  try {
    handlers.startGame({enableBots:false,pvpMap:'temple',debugDouble:true,username:'qing'});
    assert.equal(game.activePlayers.length,2);assert.ok(game.activePlayers.every(p=>!p.debugCloneOf));
  } finally {game.close();}
});

test('leaving a solo PvP debug match removes its clone and immediately frees the next match',t=>{
  t.mock.method(global,'setInterval',()=>0);
  let connect;const handlers=new Map(),events=[];
  const io={on(_,fn){connect=fn;},emit(name,data){events.push({name,data});},socketsLeave(){},to(){return this;}};
  const game=server.createGameServer(io);
  const addSocket=id=>{
    const registered={};handlers.set(id,registered);
    connect({id,user:{username:'qing'},join(){},on(name,fn){registered[name]=fn;}});
    return registered;
  };
  try {
    const first=addSocket('qing-old');
    game.waitingPlayers.push({id:'qing-old',name:'qing',accountUsername:'qing',weapon:'autoRifle'});
    first.startGame({enableBots:false,pvpMap:'tower',debugDouble:true});
    assert.equal(game.activePlayers.length,2);
    first.disconnect();
    assert.equal(game.activePlayers.length,0);
    assert.equal(game.gameInProgress.status,false,'empty debug match resets instead of remaining locked');
    assert.ok(events.filter(event=>event.name==='playerLeft').some(event=>String(event.data).startsWith('debug-clone:')));

    const second=addSocket('qing-new');
    game.waitingPlayers.push({id:'qing-new',name:'qing',accountUsername:'qing',weapon:'autoRifle'});
    second.startGame({enableBots:false,pvpMap:'foundry',debugDouble:true});
    assert.equal(game.gameInProgress.status,true);
    assert.equal(game.activePlayers.length,2);
    assert.ok(game.activePlayers.some(player=>player.debugCloneOf==='qing-new'));
  } finally {game.close();}
});

test('BSP architecture, graph topology and opposing elevators vary without recent theme repeats',()=>{
  const shapes=new Set(),styles=new Set(),topologies=new Set(),degrees=new Set(),roomCounts=new Set(),recent=[];
  const features={lantern:0,multiTier:0,wallCatwalk:0,flat:0,loops:0,motif:0,fullHeightWalls:0};
  for(let floor=1;floor<=64;floor++) {
    const {map,walls}=generatePveFloor(floor*7919,floor,recent);
    assert.ok(!recent.slice(-2).includes(map.composition));recent.push(map.composition);
    shapes.add(`${map.width}/${map.height}`);styles.add(map.composition);topologies.add(map.topology.signature);
    degrees.add(map.topology.degreeSequence.join(','));roomCounts.add(map.zones.length);
    features.lantern+=map.features.grandLantern;features.multiTier+=map.features.multiTier;
    features.wallCatwalk+=map.features.wallCatwalks>0;features.flat+=map.terrain.every(s=>!s.walkable);
    features.loops+=map.topology.loopCount>0;
    features.motif+=map.features.architecturalMotifs.length>0;
    features.fullHeightWalls+=map.features.fullHeightSecondaryWalls;
    assert.ok(map.zones.length>=2&&map.zones.length<=9);
    assert.equal(map.topology.zoneCount,map.zones.length);
    assert.ok(map.topology.edgeCount>=map.zones.length-1,'generated room graph spans every zone');
    assert.ok(map.topology.loopCount>=0,'compact two-zone plans may be intentionally linear');
    const raised=map.zones.filter(z=>z.elevation>0).length;
    assert.ok(raised===0||raised===1,'elevation is optional instead of stamped onto every floor');
    assert.equal(map.terrain.filter(s=>s.kind==='lift').length,raised);
    assert.ok(map.features.secondaryWalls>=5,'rooms receive locally generated partitions');
    assert.ok(map.arrivalElevator.x<map.width/4&&map.elevator.x>map.width*0.75);
    assert.equal(inElevator(floorSpawn(map,false,0),map),false);
    assert.ok(floorConnected(map,walls));
    assert.ok(validation.raisedTerrainConnected(map,walls));
  }
  assert.ok(shapes.size>=40);assert.equal(topologies.size,64);assert.ok(degrees.size>=25);
  assert.deepEqual([...roomCounts].sort(),[2,3,4,5,6,7,8,9]);
  assert.ok(features.lantern>=10&&features.multiTier>=3&&features.wallCatwalk>=15);
  assert.ok(features.motif>=35&&features.fullHeightWalls>=80,'wall grammars and ceiling-height dividers recur across seeds');
  assert.ok(features.flat>=3&&features.loops>=30,'vertical and graph cadence both vary');
  assert.deepEqual([...styles].sort(),['freight','processing','reactor','turbine']);
});

test('exit collision stays locked during combat and opens only after the clearance animation',()=>{
  const {map,walls}=generatePveFloor(0),e=map.elevator,solids=[...walls,...map.terrain];
  const start={x:e.x-25,y:e.y+110,height:0};
  for(const phase of ['combat','opening','riding']) {
    floors.updateExitDoor(map,{phase,startedAt:1000},5000);
    assert.equal(maps.moveOnTerrain({...start},e.x+50,start.y,map,solids,5000),false);
  }
  floors.updateExitDoor(map,{phase:'ready',startedAt:1000},2199);
  assert.equal(maps.moveOnTerrain({...start},e.x+50,start.y,map,solids,2199),false);
  floors.updateExitDoor(map,{phase:'ready',startedAt:1000},2200);
  assert.equal(maps.moveOnTerrain({...start},e.x+50,start.y,map,solids,2200),true);
});

test('bridge routes remain distinct above and below, with headroom enforced when jumping',()=>{
  const {map,walls}=generatePveFloor(23757),bridge=map.terrain.find(s=>s.walkable&&s.bottom>0);
  assert.ok(bridge);
  const p={x:bridge.x+bridge.width/2,y:bridge.y+bridge.height/2,height:0,alive:true};
  const solids=[...walls,...map.terrain];
  assert.ok(maps.moveOnTerrain(p,p.x,p.y,map,solids,1000));
  assert.equal(p.ceilingHeight,bridge.bottom);
  movement.startJump(p,1000);movement.advanceJump(p,1100);
  assert.ok(p.height+2.2<=bridge.bottom+1e-8);
  const graph=new navigation.NavigationGraph(map,walls);
  const under={x:p.x,y:p.y,height:0},over={...under,height:bridge.top};
  const a=graph.nearest(under),b=graph.nearest(over);
  assert.notEqual(a,b);assert.equal(graph.heights[a],0);
  assert.ok(Math.abs(graph.heights[b]-bridge.top)<1e-6);
  const path=graph.find(under,over);
  assert.ok(path.length>3,'must use a staircase, not jump between stacked graph nodes');
  for(let i=1;i<path.length;i++)assert.ok(graph.clear(path[i-1],path[i]));
  const broken={...map,terrain:map.terrain.filter(s=>s.kind!=='ramp')};
  assert.equal(validation.raisedTerrainConnected(broken,walls),false,'unreachable upper routes are rejected');
});

for(const generate of [generateScatterFloor,generatePveFloor])test(`${generate.name}: 100 seeded floors are reproducible, varied, non-overlapping, bounded, and fully connected`,()=>{
  const signatures=new Set();
  const crossedAisles=new Set();
  const themes=new Set();
  const zoneCounts=new Set(),rampAxes=new Set();
  const topologies=new Set(),degreeSequences=new Set(),propCounts=new Set();
  const deckAreas=new Set(),deckHeights=new Set(),upperSpawns=new Set();
  const featureCounts={lantern:0,multiTier:0,wallCatwalk:0,flat:0,loops:0,motif:0,fullHeightWalls:0};
  const motifKinds=new Set();
  for(let seed=0;seed<100;seed++) {
    const {map,walls}=generate(seed*7919,3),solids=[...walls,...map.terrain];
    assert.ok(floorConnected(map,walls),`connected seed ${seed}`);
    signatures.add(JSON.stringify(solids));
    const ramps=map.terrain.filter(s=>s.kind==='ramp');
    if(generate===generateScatterFloor) {
    assert.ok(ramps.length>=1&&ramps.length<=2,'only one or two raised overlooks');
    assert.ok(map.terrain.some(s=>s.kind==='pillar'),'column courtyard');
    assert.ok(map.terrain.some(s=>s.kind==='generator'),'machinery island');
    assert.ok(walls.length>=27&&walls.length<=34,'moderate scattered wall density');
    assert.ok(map.terrain.filter(s=>s.kind==='cover').length<=5,'limited loose cover plus landmark cover');
    } else {
      assert.ok(validation.raisedTerrainConnected(map,walls),`raised routes connected seed ${seed}`);
      themes.add(map.landmark.theme);
      assert.equal(map.rooms,undefined,'there is no selected room template');
      assert.equal(map.doorways,undefined,'connections are compiled from shared BSP boundaries');
      assert.deepEqual(map.pockets,map.zones,'lighting regions mirror generated zones');
      assert.ok(map.zones.length>=2&&map.zones.length<=9);
      assert.equal(map.topology.zoneCount,map.zones.length);
      assert.ok(map.topology.edgeCount>=map.zones.length-1);
      assert.ok(map.topology.loopCount>=0);
      assert.equal(map.terrain.filter(s=>s.kind==='lift').length,map.topology.raisedCount);
      assert.ok(map.features.secondaryWalls>=5,'natural secondary walls break up room interiors');
      featureCounts.lantern+=map.features.grandLantern;featureCounts.multiTier+=map.features.multiTier;
      featureCounts.wallCatwalk+=map.features.wallCatwalks>0;
      featureCounts.flat+=map.terrain.every(s=>!s.walkable);featureCounts.loops+=map.topology.loopCount>0;
      featureCounts.motif+=map.features.architecturalMotifs.length>0;
      featureCounts.fullHeightWalls+=map.features.fullHeightSecondaryWalls;
      for(const motif of map.features.architecturalMotifs)motifKinds.add(motif.kind);
      const decks=map.terrain.filter(s=>s.walkable);
      for(const value of decks){deckAreas.add(value.width*value.height);deckHeights.add(value.top);}
      upperSpawns.add(map.upperBotSpawns.length>0);
      if(map.upperBotSpawns)for(const p of map.upperBotSpawns) {
        assert.equal(maps.groundHeight(p.x,p.y,map.terrain),p.height);
      }
      zoneCounts.add(map.zones.length);
      if(ramps.length)rampAxes.add(ramps[0].axis);
      assert.equal(map.botSpawns.length,30,'later waves have unique slots across generated rooms');
      assert.ok(new Set(map.botSpawns.map(p=>p.zone)).size>=Math.min(2,map.encounter.validSpawnZones),
        'bots occupy multiple non-arrival architectural zones when the plan permits');
      assert.ok(map.encounter.validSpawnCount>=30,'the final architecture has enough validated enemy slots');
      assert.ok(map.botSpawns.every(p=>p.zone!==map.encounter.arrivalZoneId),
        'the complete arrival room remains enemy-free');
      const entry=map.encounter.entryPoint,sightSolids=[...walls,...map.terrain.filter(s=>(s.bottom||0)<1.7&&
        (s.top||0)>1.15&&s.kind!=='ramp'&&s.kind!=='lift')];
      for(const spawn of map.botSpawns) {
        assert.ok(Math.hypot(spawn.x-entry.x,spawn.y-entry.y)>=map.encounter.spawnClearance,
          'enemy slots preserve the entry clearance distance');
        assert.equal(helpers.lineIntersectsAnyWall(entry.x,entry.y,spawn.x,spawn.y,sightSolids),true,
          'enemy slots cannot look directly into the arrival elevator throat');
      }
      const propCount=map.terrain.filter(s=>['generator','cover','pipe','conveyor','pillar','turbine','storageRack',
        'reactorCore','consoleBank','ventStack'].includes(s.kind)).length;
      assert.ok(propCount>=7,'generated rooms are furnished rather than left as open boxes');propCounts.add(propCount);
      topologies.add(map.topology.signature);degreeSequences.add(map.topology.degreeSequence.join(','));
    }
    for(const w of walls.slice(9)) {
      for(const x of [650,1070])if(w.x<x&&w.x+w.width>x)crossedAisles.add(`x${x}`);
      for(const y of [390,750])if(w.y<y&&w.y+w.height>y)crossedAisles.add(`y${y}`);
    }
    for(let i=0;i<solids.length;i++) {
      const s=solids[i];
      assert.ok(s.width>0&&s.height>0&&(s.top>0||s.kind==='lift')&&s.top<=map.ceiling);
      assert.ok(s.x>=0&&s.y>=0&&s.x+s.width<=map.width&&s.y+s.height<=map.height);
      for(let j=0;j<i;j++) {
        const other=solids[j],verticalOverlap=(s.bottom||0)<other.top-1e-8&&(other.bottom||0)<s.top-1e-8;
        assert.equal(rectanglesOverlap(s,other)&&verticalOverlap,false,`3D overlap seed ${seed}: ${i}/${j}`);
      }
    }
    for(let i=0;i<10;i++) for(const bot of [false,true]) {
      const p=floorSpawn(map,bot,i);assert.ok(maps.canOccupy(p.x,p.y,p.height||0,solids));
      if(!bot)assert.ok(inElevator(p,{...map,elevator:map.arrivalElevator||map.elevator}));
    }
    for(const ramp of map.terrain.filter(s=>s.kind==='ramp')) {
      const vertical=ramp.axis==='y',length=vertical?ramp.height:ramp.width;
      const point=t=>({x:ramp.x+(vertical?ramp.width/2:t*length),y:ramp.y+(vertical?t*length:ramp.height/2)});
      const p={...point(ramp.reverse?1.04:-0.04),alive:true,height:ramp.bottom||0};
      for(let k=0;k<=108;k++) {
        const t=(ramp.reverse?1.04:-0.04)+(ramp.reverse?-1:1)*k/100,next=point(t);
        assert.ok(maps.moveOnTerrain(p,next.x,next.y,map,solids,1000+k),`climb seed ${seed}`);
      }
      assert.ok(Math.abs(p.height-ramp.top)<1e-6,'ramp meets deck flush');
      assert.ok(p.height+2.2+1.3<map.ceiling,'headroom even while jumping');
    }
  }
  assert.equal(signatures.size,100);
  if(generate===generateScatterFloor)assert.equal(crossedAisles.size,4,'old bay aisles are no longer reserved');
  else {
    assert.equal(themes.size,4,'all architectural themes generated');
    assert.ok(deckAreas.size>=80,'raised rooms and catwalks emerge at strongly varied scales');
    assert.ok(deckHeights.size>=60,'raised-room and catwalk elevations vary continuously');
    assert.deepEqual([...upperSpawns].sort(),[false,true],'some floors stay grounded while others station enemies upstairs');
    assert.deepEqual([...zoneCounts].sort(),[2,3,4,5,6,7,8,9],'floor cadence spans intimate halls through room networks');
    assert.equal(rampAxes.size,2,'overlook orientation varies');
    assert.equal(topologies.size,100,'every seed produces a distinct architectural topology');
    assert.ok(degreeSequences.size>=20,'room graph shapes vary beyond coordinate jitter');
    assert.ok(propCounts.size>=8,'furnishing density responds to generated room sizes');
    assert.ok(featureCounts.lantern>=25,'grand lantern halls recur without becoming a template');
    assert.ok(featureCounts.multiTier>=7,'some floors escalate through multiple vertical levels');
    assert.ok(featureCounts.wallCatwalk>=30,'wall-side catwalks appear occasionally');
    assert.ok(featureCounts.motif>=55&&featureCounts.fullHeightWalls>=200,'interior architecture is dense and vertically varied');
    assert.deepEqual([...motifKinds].sort(),['bays','chicane','spine'],'all wall grammars appear across the seed sweep');
    assert.ok(featureCounts.flat>=10&&featureCounts.loops>=50,'flat/vertical and linear/looped plans both occur');
  }
  assert.deepEqual(generate(42,2),generate(42,2));
});

test('connectivity validation rejects sealed areas and body-width choke points',()=>{
  const map={width:400,height:400,terrain:[],elevator:{x:40,y:40}};
  assert.equal(floorConnected(map,[]),true);
  assert.equal(floorConnected(map,[{x:180,y:0,width:24,height:400}]),false);
  const opening=gap=>[{x:180,y:0,width:24,height:200-gap/2},
    {x:180,y:200+gap/2,width:24,height:200-gap/2}];
  assert.equal(floorConnected(map,opening(28)),false);
  assert.equal(floorConnected(map,opening(100)),true);
  assert.equal(floorConnected(map,[{x:180,y:100,width:24,height:200}]),true);
});

test('lift doors close before motion; eased travel stops before new doors open',()=>{
  const state={phase:'riding',startedAt:1000,floor:1};
  assert.deepEqual(elevatorSample(state,1000),{door:1,rise:0});
  assert.equal(elevatorSample(state,1600).door,0.5);
  assert.equal(elevatorSample(state,2200).door,0);
  assert.equal(elevatorSample(state,2200).rise,0);
  const end=1000+LIFT_TIMING.close+LIFT_TIMING.travel;
  assert.equal(elevatorSample(state,end).rise,LIFT_TIMING.rise);
  assert.ok(elevatorSample(state,2201).rise<0.00001,'gentle acceleration');
  assert.ok(LIFT_TIMING.rise-elevatorSample(state,end-1).rise<0.00001,'gentle deceleration');
  const opening={phase:'opening',startedAt:end};
  assert.equal(elevatorSample(opening,end).door,0);
  assert.equal(elevatorSample(opening,end+1200).door,1);
  const model=createElevatorModel(generatePveFloor(1).map.elevator);
  poseElevator(model,{door:0,rise:5});assert.equal(model.position.y,5);
  for(const panel of model.userData.doors)assert.equal(panel.position.z,panel.userData.closedZ);
  poseElevator(model,{door:1,rise:0});
  for(const panel of model.userData.doors)assert.equal(Math.abs(panel.position.z-panel.userData.closedZ),2.5);
  model.traverse(m=>{m.geometry?.dispose();m.material?.dispose();});
});

test('ceilings stop upward shots and jumping heads, including the elevator cabin',()=>{
  const {map}=generatePveFloor(4),p={id:'p',...map.botSpawns.find(point=>point.height===0),alive:true};
  const roofHit=combat.traceShot(p,0,[],[],()=>true,1.2,map);
  assert.ok(['ceiling','wall'].includes(roofHit.hit));
  assert.ok(roofHit.endHeight<=map.ceiling);
  const cabin={...p,...floorSpawn(map,false,0),ceilingHeight:map.elevator.ceiling};
  const hit=combat.traceShot(cabin,0,[],[],()=>true,1.2,map);
  assert.ok(Math.abs(hit.endHeight-map.elevator.ceiling)<1e-8);
  movement.startJump(cabin,1000);movement.advanceJump(cabin,1345);
  assert.ok(cabin.height+2.2<=map.elevator.ceiling+1e-8);
});

test('PvE revives eliminated teammates after a clear and retries the identical floor after a wipe',t=>{
  let now=100000,tick,connect;
  t.mock.method(global,'setInterval',fn=>{tick=fn;return 0;});
  t.mock.method(Date,'now',()=>now);
  const events=[],handlers={};
  const io={on(_,fn){connect=fn;},emit(name,data){events.push({name,data});},socketsLeave(){},to(){return this;}};
  const game=server.createGameServer(io);
  connect({id:'p0',on(name,fn){handlers[name]=fn;}});
  game.waitingPlayers.push({id:'p0',name:'Survivor',weapon:'sniper'},
    {id:'p1',name:'Teammate',weapon:'pistol',weaponSkinKey:'custom-skin'});
  handlers.startGame({enableBots:true});
  try {
    const survivor=game.activePlayers.find(p=>p.id==='p0'),dead=game.activePlayers.find(p=>p.id==='p1');
    assert.equal(survivor.grenades,3);assert.equal(dead.grenades,3);
    survivor.grenades=0;dead.grenades=1;
    Object.assign(dead,{alive:false,health:0,height:3,groundHeight:3,jumpStartedAt:now,
      jumpVelocity:7,platformId:'old-lift',groundPlatformId:'old-lift',knockback:{start:now},movementEpoch:4});
    game.gameWalls.length=0;game.gameMap.terrain.length=0;
    const bots=game.activePlayers.filter(p=>p.isBot);bots.forEach(b=>b.alive=false);
    Object.assign(bots[0],{alive:true,health:1,x:400,y:100,height:0});
    Object.assign(survivor,{x:250,y:100,height:0});handlers.shoot({angle:0});
    assert.equal(game.floorState.phase,'ready');assert.equal(dead.alive,false);
    const e=game.gameMap.elevator;Object.assign(survivor,{x:e.x+80,y:e.y+110});
    now+=LIFT_TIMING.open;tick();assert.equal(game.floorState.phase,'riding');
    assert.equal(dead.alive,false,'no early revive and dead players do not need to board');
    now+=LIFT_TIMING.close+LIFT_TIMING.travel;tick();
    assert.equal(game.gameMap.floor,2);assert.equal(dead.alive,true);assert.equal(dead.health,101);assert.equal(dead.maxHealth,101);
    assert.equal(survivor.grenades,3);assert.equal(dead.grenades,3);
    assert.ok(inElevator(dead,{...game.gameMap,elevator:game.gameMap.arrivalElevator}));
    assert.equal(dead.height,0);assert.equal(dead.groundHeight,0);
    for(const key of ['jumpStartedAt','platformId','groundPlatformId','knockback'])assert.equal(dead[key],null);
    assert.equal(dead.movementEpoch,5);assert.equal(dead.weapon,'pistol');assert.equal(dead.weaponSkinKey,'custom-skin');
    const snapshot=events.find(e=>e.name==='floorStarting').data.players.find(p=>p.id===dead.id);
    assert.equal(snapshot.alive,true);assert.equal(snapshot.health,101);assert.equal(snapshot.maxHealth,101);
    now+=LIFT_TIMING.open;tick();
    const lostFloor=game.gameMap.floor,lostSeed=game.gameMap.seed;
    survivor.alive=false;survivor.health=0;dead.alive=false;dead.health=0;
    tick();assert.equal(game.floorState.phase,'wiped');
    assert.equal(events.some(e=>e.name==='gameOver'),false);
    assert.equal(dead.alive,false,'team wipe does not revive anyone before retry');
    assert.equal(events.filter(e=>e.name==='floorStarting').length,1);
    handlers.retryFloor();
    assert.equal(game.gameInProgress.status,true);
    assert.equal(game.gameMap.floor,lostFloor);assert.equal(game.gameMap.seed,lostSeed);
    assert.equal(game.floorState.phase,'opening');
    assert.equal(survivor.alive,true);assert.equal(dead.alive,true);
    assert.equal(survivor.health,101);assert.equal(dead.health,101);
    assert.equal(survivor.grenades,3);assert.equal(dead.grenades,3);
    assert.equal(game.activePlayers.filter(p=>p.isBot&&p.alive).length>0,true);
    assert.equal(events.filter(e=>e.name==='floorStarting').length,2);
    assert.equal(inElevator(survivor,{...game.gameMap,elevator:game.gameMap.arrivalElevator}),true);
    handlers.retryFloor();assert.equal(events.filter(e=>e.name==='floorStarting').length,2,
      'duplicate retry packets cannot start another floor');
  } finally {game.close();}
});

test('late PvE reinforcements spectate the current fight and spawn in the next arrival elevator',t=>{
  let now=100000;
  t.mock.method(global,'setInterval',()=>0);
  t.mock.method(Date,'now',()=>now);
  const events=[];
  const io={emit(name,data){events.push({name,data});},to(){return this;},socketsLeave(){}};
  const game=server.createGameServer(io,{attachConnections:false,manageRooms:false});
  const leader={id:'leader',user:{username:'leader'}};
  game.waitingPlayers.push({id:'leader',name:'Leader',displayName:'Leader',weapon:'sniper',
    primaryWeapon:'sniper',secondaryWeapon:'pistol'});
  game.handleStartGame(leader,{enableBots:true});
  try {
    const lateSocket={id:'late',user:{username:'late',currencies:{Coins:0},
      skins:{owned:[],equippedByWeapon:{shotgun:'shotgun_silver'}}},emit(){}};
    const lateState=game.queueLatePveJoin(lateSocket,{displayName:'late',weapon:'shotgun'});
    assert.equal(lateState.spawnFloor,2);
    assert.equal(game.activePlayers.some(player=>player.id==='late'),false);
    assert.equal(game.waitingPlayers.some(player=>player.id==='late'),true);

    for(const bot of game.activePlayers.filter(player=>player.isBot))bot.alive=false;
    const survivor=game.activePlayers.find(player=>player.id==='leader');
    const exit=game.gameMap.elevator;
    Object.assign(survivor,{x:exit.x+exit.width/2,y:exit.y+exit.height/2});
    game.floorState.phase='ready';game.floorState.startedAt=now-LIFT_TIMING.open;
    game.runBotsTick();
    assert.equal(game.floorState.phase,'riding',
      'queued reinforcements do not prevent current survivors from boarding');
    assert.equal(game.activePlayers.some(player=>player.id==='late'),false,
      'reinforcement remains out of combat for the whole current floor');

    now+=LIFT_TIMING.close+LIFT_TIMING.travel;
    game.runBotsTick();
    const reinforcement=game.activePlayers.find(player=>player.id==='late');
    assert.ok(reinforcement?.alive);
    assert.equal(reinforcement.health,101);assert.equal(reinforcement.grenades,3);
    assert.equal(reinforcement.primaryWeapon,'shotgun');
    assert.equal(reinforcement.primaryWeaponSkinKey,'shotgun_silver');
    assert.ok(inElevator(reinforcement,{...game.gameMap,elevator:game.gameMap.arrivalElevator}));
    assert.equal(game.waitingPlayers.length,0);
    const floorStart=events.find(event=>event.name==='floorStarting');
    assert.ok(floorStart?.data.players.some(player=>player.id==='late'&&player.alive),
      'the reliable next-floor packet introduces the reinforcement to every client');
  } finally {game.close();}
});

test('elevator transitions preserve health and scale waves through the Ogre floor',t=>{
  let now=100000,tick,connect;
  t.mock.method(global,'setInterval',fn=>{tick=fn;return 0;});t.mock.method(Date,'now',()=>now);
  const events=[],handlers={};
  const io={on(_,fn){connect=fn;},emit(name,data){events.push({name,data});},socketsLeave(){},to(){return this;}};
  const game=server.createGameServer(io);
  connect({id:'p0',on(name,fn){handlers[name]=fn;}});
  game.waitingPlayers.push({id:'p0',name:'A',weapon:'sniper'},{id:'p1',name:'B',weapon:'pistol'});
  handlers.startGame({enableBots:true});
  try {
    const bots=()=>game.activePlayers.filter(p=>p.isBot),humans=game.activePlayers.filter(p=>!p.isBot);
    const count=bots().length,health=bots()[0].health;
    for(let floor=1;floor<=5;floor++) {
      const shooter=humans.find(p=>p.id==='p0'),ally=humans.find(p=>p.id==='p1');
      game.gameWalls.length=0;game.gameMap.terrain.length=0;
      Object.assign(shooter,{x:250,y:100,height:0,lastShotAt:0});Object.assign(ally,{x:250,y:200});
      for(const b of bots())b.alive=false;
      Object.assign(bots()[0],{x:400,y:100,height:0,groundHeight:0,alive:true,health:1});
      handlers.shoot({angle:0});assert.equal(game.floorState.phase,'ready');
      // Both players hug walls: the old 28-unit boarding inset waited forever.
      const exitSpawn=i=>{const e=game.gameMap.elevator;return i===0?
        {x:e.x+e.width-26,y:e.y+110}:{x:e.x+80,y:e.y+26};};
      Object.assign(shooter,floorSpawn(game.gameMap,false,0));tick();
      assert.equal(game.floorState.phase,'ready','arrival elevator cannot advance the floor');
      now+=LIFT_TIMING.open;
      Object.assign(shooter,exitSpawn(0));tick();
      assert.equal(game.floorState.phase,'ready','must wait for the other living human');
      Object.assign(ally,exitSpawn(1));shooter.health=50;tick();
      assert.equal(game.floorState.phase,'riding');
      const oldX=shooter.x;
      const oldY=shooter.y,oldAngle=shooter.angle,oldExit={...game.gameMap.elevator};
      const shotsBefore=events.filter(e=>e.name==='shotFired').length;shooter.lastShotAt=0;
      handlers.playerUpdate({x:700,y:700,angle:0});handlers.jump();handlers.shoot({angle:0});
      assert.equal(events.filter(e=>e.name==='shotFired').length,shotsBefore);
      assert.equal(shooter.x,oldX);assert.equal(shooter.jumpStartedAt,null);
      now+=LIFT_TIMING.close+LIFT_TIMING.travel-1;tick();assert.equal(game.gameMap.floor,floor);
      now++;tick();assert.equal(game.gameMap.floor,floor+1);assert.equal(game.floorState.phase,'opening');
      assert.equal(bots().length,count+floor);
      assert.ok(bots().filter(b=>b.botType!=='ogre').every(b=>b.health===health+floor*4&&b.moveScale===1+floor*0.025));
      assert.equal(bots().filter(b=>b.botType==='ogre').length,floor>=4?1:0);
      for(const b of bots())assert.ok(maps.canOccupy(b.x,b.y,b.height,[...game.gameWalls,...game.gameMap.terrain],b.bodyRadius,0.001,b.bodyHeight));
      assert.ok(inElevator(shooter,{...game.gameMap,elevator:game.gameMap.arrivalElevator}),'passenger transferred into new arrival cabin while doors are closed');
      assert.equal(shooter.x-game.gameMap.arrivalElevator.x,oldExit.width-(oldX-oldExit.x));
      assert.equal(shooter.y-game.gameMap.arrivalElevator.y,oldExit.height-(oldY-oldExit.y));
      assert.equal(shooter.angle,oldAngle+Math.PI,'view turns with the cabin, not relative to its doors');
      assert.ok(Math.abs(shooter.health-74)<1e-8,'health carries over with 5 HP/s regeneration');
      now+=LIFT_TIMING.open;tick();assert.equal(game.floorState.phase,'combat');
      assert.ok(Math.abs(shooter.health-80)<1e-8);
    }
    assert.equal(events.filter(e=>e.name==='floorStarting').length,5);
    assert.equal(events.some(e=>e.name==='gameOver'),false);
  } finally {game.close();}
});
