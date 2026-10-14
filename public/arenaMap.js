// Shared world dimensions and solid heightfields (arena XY; elevation in metres).
const DEFAULT_MAP = Object.freeze({ mode: 'pvp', width: 900, height: 600, terrain: [] });

function surfaceHeight(solid, x, y) {
  if(solid.kind==='rail')return bottomHeight(solid,x,y)+1;
  if (solid.kind !== 'ramp') return solid.top ?? 3.1;
  const t = solid.axis === 'y' ? (y - solid.y) / solid.height : (x - solid.x) / solid.width;
  const fraction=Math.max(0, Math.min(1, solid.reverse ? 1 - t : t));
  const bottom=solid.bottom||0,span=solid.top-bottom;
  return bottom+span*(solid.stairs?Math.ceil(fraction*solid.steps-1e-8)/solid.steps:fraction);
}

// Walking uses a continuous slope over the treads. The renderer and ray tracer
// retain individual steps; feet/camera no longer snag on every discrete riser.
function walkingHeight(s, x, y) {
  return surfaceHeight(s.stairs ? {...s,stairs:false} : s,x,y);
}

function rampStepAllowance(s,radius=16) {
  const length=s.axis==='y'?s.height:s.width;
  return Math.max(.28,Math.abs(s.top-(s.bottom||0))/length*(radius+4)+.02);
}

function bottomHeight(s,x,y) {
  if(s.kind==='rail'&&s.axis) {
    const t=s.axis==='y'?(y-s.y)/s.height:(x-s.x)/s.width;
    return (s.bottom||0)+s.rise*Math.max(0,Math.min(1,s.reverse?1-t:t));
  }
  return s.bottom||0;
}

// Signed horizontal distance to the visible footprint of a solid. Most arena
// geometry is box-shaped, but industrial props are not: treating a round tank
// or a narrow pipe as its entire authoring rectangle creates invisible corners
// that catch players. A negative value is inside the footprint.
function horizontalClearance(s,x,y) {
  const shape=s.collisionShape||(
    s.kind==='furnace'||s.kind==='tank'?'circle':s.kind==='pipe'?'capsule':null
  );
  if(shape==='circle') {
    const cx=s.x+s.width/2,cy=s.y+s.height/2;
    const radius=s.collisionRadius??Math.min(s.width,s.height)*(s.kind==='furnace'?0.4:0.42);
    return Math.hypot(x-cx,y-cy)-radius;
  }
  if(shape==='capsule') {
    const alongX=s.width>=s.height,radius=s.collisionRadius??Math.min(s.width,s.height)*0.36;
    const ax=alongX?s.x+radius:s.x+s.width/2,ay=alongX?s.y+s.height/2:s.y+radius;
    const bx=alongX?s.x+s.width-radius:ax,by=alongX?ay:s.y+s.height-radius;
    const vx=bx-ax,vy=by-ay,lengthSq=vx*vx+vy*vy;
    const t=lengthSq?Math.max(0,Math.min(1,((x-ax)*vx+(y-ay)*vy)/lengthSq)):0;
    return Math.hypot(x-(ax+vx*t),y-(ay+vy*t))-radius;
  }
  // Lift rails keep their full visible thickness but have forgiving end caps.
  // This prevents two rails meeting at a landing from creating a tiny concave
  // pocket that a circular player collider cannot escape.
  const endInset=s.collisionEndInset??(s.kind==='rail'&&s.liftId?5:0);
  const alongX=s.width>=s.height;
  const minX=s.x+(alongX?endInset:0),maxX=s.x+s.width-(alongX?endInset:0);
  const minY=s.y+(alongX?0:endInset),maxY=s.y+s.height-(alongX?0:endInset);
  const dx=Math.max(minX-x,0,x-maxX),dy=Math.max(minY-y,0,y-maxY);
  if(dx||dy)return Math.hypot(dx,dy);
  return -Math.min(x-minX,maxX-x,y-minY,maxY-y);
}

// Push a point to the smooth surface of an obstacle. The player body is round,
// so even a rectangular prop has a rounded Minkowski corner at body radius.
// Projecting onto that real contact surface prevents both movement axes from
// being cancelled at a corner, which otherwise makes props feel sticky.
function projectRoundedCollision(s,x,y,radius) {
  const shape=s.collisionShape||(
    s.kind==='furnace'||s.kind==='tank'?'circle':s.kind==='pipe'?'capsule':null
  );
  if(shape!=='circle'&&shape!=='capsule') {
    const closestX=Math.max(s.x,Math.min(x,s.x+s.width));
    const closestY=Math.max(s.y,Math.min(y,s.y+s.height));
    let dx=x-closestX,dy=y-closestY,distance=Math.hypot(dx,dy);
    const safe=radius-0.09;
    if(distance>=safe)return null;
    // Straight faces already slide correctly through axis-separated input and
    // the escape rule below. Only resolve true corners here; pushing a player
    // away from a flat face would create an unnatural outward snap.
    if(Math.abs(dx)<1e-6||Math.abs(dy)<1e-6)return null;
    return {x:closestX+dx/distance*safe,y:closestY+dy/distance*safe};
  }
  const objectRadius=s.collisionRadius??Math.min(s.width,s.height)*(
    s.kind==='furnace'?0.4:shape==='capsule'?0.36:0.42);
  let cx=s.x+s.width/2,cy=s.y+s.height/2;
  if(shape==='capsule') {
    const alongX=s.width>=s.height;
    const ax=alongX?s.x+objectRadius:cx,ay=alongX?cy:s.y+objectRadius;
    const bx=alongX?s.x+s.width-objectRadius:ax,by=alongX?ay:s.y+s.height-objectRadius;
    const vx=bx-ax,vy=by-ay,lengthSq=vx*vx+vy*vy;
    const t=lengthSq?Math.max(0,Math.min(1,((x-ax)*vx+(y-ay)*vy)/lengthSq)):0;
    cx=ax+vx*t;cy=ay+vy*t;
  }
  let dx=x-cx,dy=y-cy,distance=Math.hypot(dx,dy);
  // The extra hundredth keeps the projected point outside the strict generic
  // overlap comparison despite cross-engine floating-point rounding.
  const safe=objectRadius+radius-0.09;
  if(distance>=safe)return null;
  if(distance<1e-6){dx=1;dy=0;distance=1;}
  return {x:cx+dx/distance*safe,y:cy+dy/distance*safe};
}

function overlapsSolid(s,x,y,footHeight,radius,stepAllowance,bodyHeight) {
  const cx=Math.max(s.x,Math.min(x,s.x+s.width)),cy=Math.max(s.y,Math.min(y,s.y+s.height));
  return horizontalClearance(s,x,y)<radius-0.1&&walkingHeight(s,cx,cy)>footHeight+stepAllowance&&
    bottomHeight(s,cx,cy)<footHeight+bodyHeight-0.001;
}

// Shared server-clock cycle: generous boarding pauses and zero end velocity.
function cargoLiftSample(lift,now,epoch=0) {
  const t=((now-epoch+(lift.phaseOffset||0))%14000+14000)%14000;
  const ease=x=>x*x*x*(x*(x*6-15)+10);
  if(t<3000)return {height:0,phase:'boarding'};
  if(t<7000)return {height:lift.maxTop*ease((t-3000)/4000),phase:'rising'};
  if(t<10000)return {height:lift.maxTop,phase:'upper'};
  return {height:lift.maxTop*(1-ease((t-10000)/4000)),phase:'descending'};
}

function updateCargoLifts(map,players,now) {
  for(const lift of map.terrain.filter(s=>s.kind==='lift')) {
    const previous=lift.top,next=cargoLiftSample(lift,now,map.platformEpoch||0).height;
    for(const p of players) {
      if(!p.alive)continue;
      const cx=Math.max(lift.x,Math.min(p.x,lift.x+lift.width)),cy=Math.max(lift.y,Math.min(p.y,lift.y+lift.height));
      const on=Math.hypot(p.x-cx,p.y-cy)<15.9;
      if(p.jumpStartedAt==null&&on&&(p.platformId===lift.id||Math.abs((p.height||0)-previous)<0.025)) {
        const landing=supportHeight(p.x,p.y,p.height||0,map.terrain.filter(s=>s!==lift&&!s.liftId));
        if(landing>next+0.001&&landing>=previous-0.001) {
          p.height=landing;p.groundHeight=landing;p.platformId=null;p.groundPlatformId=null;
        } else {p.height=next;p.groundHeight=next;p.platformId=lift.id;p.groundPlatformId=lift.id;}
      } else {
        if(p.platformId===lift.id)p.platformId=null;
        // Airborne passengers land on the current deck, never its old height.
        if(on&&p.jumpStartedAt!=null){p.groundHeight=next;p.groundPlatformId=lift.id;}
        else if(!on&&p.groundPlatformId===lift.id)p.groundPlatformId=null;
      }
    }
    lift.top=next;
    for(const rail of map.terrain.filter(s=>s.liftId===lift.id)){rail.bottom=next;rail.top=next+1;}
  }
}

function groundHeight(x, y, solids) {
  let height = 0;
  for (const s of solids) {
    if(s.kind==='ceilingPanel')continue;
    if (horizontalClearance(s,x,y)<=0)
      height = Math.max(height, walkingHeight(s, x, y));
  }
  return height;
}

function canOccupy(x, y, footHeight, solids, radius = 16, stepAllowance = 0.001, bodyHeight = 2.2) {
  return !solids.some(s=>overlapsSolid(s,x,y,footHeight,radius,stepAllowance,bodyHeight));
}

// Landing support uses the same footprint as side collision. A character whose
// feet overlap a ledge must not fall through it just because its centre is outside.
function supportHeight(x, y, footHeight, solids, allowance = 0.001) {
  let floor=0;
  for(const s of solids) {
    if(s.kind==='ceilingPanel')continue;
    if(horizontalClearance(s,x,y)>=15.9)continue;
    const height=walkingHeight(s,x,y);
    if(height<=footHeight+allowance)floor=Math.max(floor,height);
  }
  return floor;
}

// Substep both prediction and authority; steep sides cannot be climbed like ramps.
function moveOnTerrain(player, x, y, map, solids, now) {
  x = Math.max(16, Math.min(map.width - 16, x));
  y = Math.max(16, Math.min(map.height - 16, y));
  const dx = x - player.x, dy = y - player.y;
  // Broad-phase once for the whole short movement segment. Generated floors
  // contain dozens of distant solids; collision/support/headroom only need
  // geometry within the player's footprint along this segment.
  const radius=player.botType==='ogre'?30:16;
  const minX=Math.min(player.x,x)-radius,maxX=Math.max(player.x,x)+radius;
  const minY=Math.min(player.y,y)-radius,maxY=Math.max(player.y,y)+radius;
  const nearby=solids.filter(s=>s.x<=maxX&&s.x+s.width>=minX&&s.y<=maxY&&s.y+s.height>=minY);
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 4));
  for (let i = 0; i < steps; i++) {
    let nx = player.x + dx / steps, ny = player.y + dy / steps;
    const grounded = player.jumpStartedAt == null;
    const foot=player.height || 0;
    // Only slopes get a stepping tolerance, never the vertical face of a box.
    const activeRamps=grounded?nearby.filter(s=>s.kind==='ramp' &&
      ((player.x>=s.x&&player.x<=s.x+s.width&&player.y>=s.y&&player.y<=s.y+s.height) ||
       (nx>=s.x&&nx<=s.x+s.width&&ny>=s.y&&ny<=s.y+s.height)) &&
      Math.abs(walkingHeight(s,player.x,player.y)-foot)<0.43):[];
    const onRamp=activeRamps.length>0;
    // At the upper seam the player's leading edge touches the deck before
    // their centre reaches the final tread. Scale that legal step by the
    // staircase slope and body radius so tall generated stairs never snag.
    const allowance=onRamp?activeRamps.reduce((value,s)=>Math.max(value,rampStepAllowance(s,radius)),.28):0.001;
    // Resolve round props and rectangular corners along their real tangent
    // before the general solid test. This removes jagged, sticky corner motion.
    for(const s of nearby) {
      if(!overlapsSolid(s,nx,ny,foot,radius,allowance,player.bodyHeight||2.2))continue;
      const projected=projectRoundedCollision(s,nx,ny,radius);
      if(projected){nx=projected.x;ny=projected.y;}
    }
    const floor = supportHeight(nx,ny,foot,nearby,allowance);
    if (player.botType==='ogre' && Math.max(foot,floor)+player.bodyHeight>(map.ceiling||Infinity)) return false;
    const collisionFoot=grounded&&onRamp?Math.max(foot,floor):foot;
    if (!canOccupy(nx, ny, collisionFoot, nearby,radius,allowance,player.bodyHeight||2.2)) {
      // Dynamic lift seams can occasionally leave a player a fraction inside a
      // rail. Permit tangential or outward movement, while still rejecting any
      // move that enters a new solid or increases the existing penetration.
      const escaping=nearby.every(s=>{
        if(!overlapsSolid(s,nx,ny,collisionFoot,radius,allowance,player.bodyHeight||2.2))return true;
        if(!overlapsSolid(s,player.x,player.y,foot,radius,allowance,player.bodyHeight||2.2))return false;
        return horizontalClearance(s,nx,ny)>=horizontalClearance(s,player.x,player.y)-1e-6;
      });
      if(!escaping)return false;
    }
    player.x = nx; player.y = ny;
    if (grounded) {
      const stairDescent=onRamp && (player.height||0)-floor<=0.35;
      if (floor < (player.height || 0) - 0.22 && !stairDescent) {
        player.jumpBase = player.height || 0; player.jumpVelocity = 0; player.jumpStartedAt = now;
      } else player.height = floor;
    }
    player.groundHeight = floor;
    const platform=(map.terrain||[]).find(s=>s.kind==='lift'&&Math.abs(s.top-floor)<0.001&&
      Math.hypot(nx-Math.max(s.x,Math.min(nx,s.x+s.width)),ny-Math.max(s.y,Math.min(ny,s.y+s.height)))<15.9);
    player.groundPlatformId=platform?.id||null;
    const e=[map.arrivalElevator,map.elevator].find(e=>e&&nx>=e.x&&nx<=e.x+e.width&&ny>=e.y&&ny<=e.y+e.height);
    player.ceilingHeight=e&&nx>=e.x&&nx<=e.x+e.width&&ny>=e.y&&ny<=e.y+e.height?e.ceiling:map.ceiling;
    for(const s of nearby) {
      const bottom=bottomHeight(s,nx,ny);
      if(bottom<(player.height||0)+(player.bodyHeight||2.2)-0.001)continue;
      const cx=Math.max(s.x,Math.min(nx,s.x+s.width)),cy=Math.max(s.y,Math.min(ny,s.y+s.height));
      if(Math.hypot(nx-cx,ny-cy)<15.9)player.ceilingHeight=Math.min(player.ceilingHeight??Infinity,bottom);
    }
  }
  return true;
}

function advanceKnockback(player,now,map,solids) {
  const k=player.knockback;
  if(!k)return false;
  if(!player.alive){player.knockback=null;return false;}
  const duration=k.duration/1000;
  const a=Math.max(0,Math.min(duration,(k.lastAt-k.start)/1000));
  const b=Math.max(a,Math.min(duration,(now-k.start)/1000));
  const travel=(b-a)-(b*b-a*a)/(2*duration);
  moveOnTerrain(player,player.x+k.vx*travel,player.y,map,solids,now);
  moveOnTerrain(player,player.x,player.y+k.vy*travel,map,solids,now);
  k.lastAt=now;
  if(now>=k.start+k.duration)player.knockback=null;
  return true;
}

function createPveMap(seed, floor = 1, recent = []) {
  const generate = typeof module !== 'undefined' && module.exports ? require('./floors').generatePveFloor : generatePveFloor;
  return generate(typeof seed === 'number' ? seed : undefined, floor, recent);
}

function createPvpMap(seed, mapId, excludeId) {
  const maps = typeof module !== 'undefined' && module.exports ? require('./pvpMaps') : globalThis;
  const resolvedSeed=typeof seed==='number'?seed>>>0:Math.floor(Math.random()*0x100000000)>>>0;
  const available=maps.PVP_MAP_IDS.filter(id=>id!==excludeId);
  const selected=maps.PVP_MAPS[mapId]?mapId:available[resolvedSeed%available.length];
  if(selected!=='maze')return maps.buildAuthoredPvpMap(selected,resolvedSeed);
  const generate = typeof module !== 'undefined' && module.exports ? require('./floors').generateScatterFloor : generateScatterFloor;
  const {map,walls}=generate(resolvedSeed);
  // PvE's original scatter canvas is deliberately huge. Compact the same
  // deterministic arrangement for PvP so its random walls become meaningful
  // cover instead of tiny islands in a sniper field.
  const scale=0.72,resize=s=>({...s,x:s.x*scale,y:s.y*scale,width:s.width*scale,height:s.height*scale,
    ...(Number.isFinite(s.collisionRadius)?{collisionRadius:s.collisionRadius*scale}:{}),
    ...(Number.isFinite(s.collisionEndInset)?{collisionEndInset:s.collisionEndInset*scale}:{})});
  map.width*=scale;map.height*=scale;map.terrain=map.terrain.map(resize);
  // Same scatter/landmarks, but a single free-for-all arena, not a floor run.
  map.mode='pvp';
  map.id='maze';map.name=maps.PVP_MAPS.maze.name;map.description=maps.PVP_MAPS.maze.description;
  map.palette={sky:'#9ebbc9',wall:'#526d79',panel:'#9db5b8',cap:'#bdd0cf',glow:'#69e8df',
    floorLow:'#303f47',floorHigh:'#4d6166',reflection:'#526b73',reflectionGlow:'#2ed9e3'};
  delete map.elevator;delete map.botSpawn;delete map.floor;
  const pvpWalls=walls.filter(w=>w.kind!=='cabin').map(resize);
  map.spawns=maps.derivePvpSpawns(map,pvpWalls);
  const layout={map,walls:pvpWalls},result=maps.validatePvpLayout(layout);
  if(!result.valid)throw new Error(`${map.name} failed validation: ${result.errors.join(', ')}`);
  return layout;
}

function regeneratePlayers(players, seconds) {
  for (const p of players) if (p.alive && !p.isBot)
    p.health = Math.min(p.maxHealth ?? 101, p.health + 5 * seconds);
}

if (typeof module !== 'undefined' && module.exports)
  module.exports = { DEFAULT_MAP, surfaceHeight, bottomHeight, rampStepAllowance, horizontalClearance, cargoLiftSample, updateCargoLifts, groundHeight, supportHeight, canOccupy, moveOnTerrain, advanceKnockback, createPveMap, createPvpMap, regeneratePlayers };
