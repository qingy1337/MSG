// Shared world dimensions and solid heightfields (arena XY; elevation in metres).
const DEFAULT_MAP = Object.freeze({ mode: 'pvp', width: 900, height: 600, terrain: [] });

function sampleHeightfield(field,x,y) {
  if(!field?.values?.length||field.cols<2||field.rows<2)return 0;
  const u=Math.max(0,Math.min(field.cols-1,(x-field.x)/field.width*(field.cols-1)));
  const v=Math.max(0,Math.min(field.rows-1,(y-field.y)/field.height*(field.rows-1)));
  const x0=Math.floor(u),y0=Math.floor(v),x1=Math.min(field.cols-1,x0+1),y1=Math.min(field.rows-1,y0+1);
  const tx=u-x0,ty=v-y0,at=(cx,cy)=>field.values[cy*field.cols+cx]||0;
  const a=at(x0,y0),b=at(x1,y0),c=at(x0,y1),d=at(x1,y1);
  return (a*(1-tx)+b*tx)*(1-ty)+(c*(1-tx)+d*tx)*ty;
}

function surfaceHeight(solid, x, y) {
  if(solid.kind==='heightfield')return sampleHeightfield(solid,x,y);
  if(solid.kind==='rail') {
    // Sloped authored rails carry their vertical span in top-bottom. Using a
    // hard-coded metre left the upper 15 cm of Red Vault parapets visible but
    // intangible, while hitscan already respected the full authored height.
    const railHeight=Math.max(0,(solid.top??((solid.bottom||0)+1))-(solid.bottom||0));
    return bottomHeight(solid,x,y)+railHeight;
  }
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
  // Authored industrial ramps can carry a constant-depth structural casing.
  // Use its real sloped underside for bodies, headroom and shots rather than
  // an unrelated flat AABB bottom. Legacy arena ramps omit structureDepth and
  // retain their historical wedge collision.
  if(s.kind==='ramp'&&Number.isFinite(s.structureDepth))
    return walkingHeight(s,x,y)-Math.max(0,s.structureDepth);
  return s.bottom||0;
}

function polygonClearance(points,x,y) {
  if(!Array.isArray(points)||points.length<3)return Infinity;
  let inside=false,distance=Infinity;
  for(let index=0,previous=points.length-1;index<points.length;previous=index++) {
    const a=points[previous],b=points[index],vx=b.x-a.x,vy=b.y-a.y;
    const lengthSq=vx*vx+vy*vy;
    const t=lengthSq?Math.max(0,Math.min(1,((x-a.x)*vx+(y-a.y)*vy)/lengthSq)):0;
    distance=Math.min(distance,Math.hypot(x-(a.x+vx*t),y-(a.y+vy*t)));
    if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)inside=!inside;
  }
  return inside?-distance:distance;
}

// Signed horizontal distance to the visible footprint of a solid. Most arena
// geometry is box-shaped, but industrial props are not: treating a round tank
// or a narrow pipe as its entire authoring rectangle creates invisible corners
// that catch players. A negative value is inside the footprint.
function horizontalClearance(s,x,y) {
  const shape=s.collisionShape||(
    s.kind==='furnace'||s.kind==='tank'?'circle':s.kind==='pipe'?'capsule':null
  );
  if(shape==='polygon')return polygonClearance(s.collisionPolygon,x,y);
  if(shape==='circle') {
    const cx=s.x+s.width/2,cy=s.y+s.height/2;
    const radius=s.collisionRadius??Math.min(s.width,s.height)*(s.kind==='furnace'?0.4:0.42);
    return Math.hypot(x-cx,y-cy)-radius;
  }
  if(shape==='capsule') {
    const alongX=s.width>=s.height,radius=s.collisionRadius??Math.min(s.width,s.height)*0.36;
    const ax=s.collisionA?.x??(alongX?s.x+radius:s.x+s.width/2);
    const ay=s.collisionA?.y??(alongX?s.y+s.height/2:s.y+radius);
    const bx=s.collisionB?.x??(alongX?s.x+s.width-radius:ax);
    const by=s.collisionB?.y??(alongX?ay:s.y+s.height-radius);
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
  if(s.kind==='heightfield')return null;
  const shape=s.collisionShape||(
    s.kind==='furnace'||s.kind==='tank'?'circle':s.kind==='pipe'?'capsule':null
  );
  // Polygon decks use their exact authored outline for support and blocking.
  // They are not props that should push a body toward an AABB corner.
  if(shape==='polygon')return null;
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
    const ax=s.collisionA?.x??(alongX?s.x+objectRadius:cx);
    const ay=s.collisionA?.y??(alongX?cy:s.y+objectRadius);
    const bx=s.collisionB?.x??(alongX?s.x+s.width-objectRadius:ax);
    const by=s.collisionB?.y??(alongX?ay:s.y+s.height-objectRadius);
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
  if(s.nonSolid)return false;
  if(s.kind==='heightfield') {
    // A normal landscape extends indefinitely downwards. Authored over/under
    // spaces can instead give the terrain a finite `bottom`, turning it into a
    // genuine overhead terrain shell with a playable tunnel underneath.
    const cx=Math.max(s.x,Math.min(x,s.x+s.width)),cy=Math.max(s.y,Math.min(y,s.y+s.height));
    if(horizontalClearance(s,x,y)>=radius-0.1)return false;
    const top=surfaceHeight(s,cx,cy),bottom=Number.isFinite(s.bottom)?s.bottom:-Infinity;
    return top>footHeight+stepAllowance&&bottom<footHeight+bodyHeight-0.001;
  }
  const cx=Math.max(s.x,Math.min(x,s.x+s.width)),cy=Math.max(s.y,Math.min(y,s.y+s.height));
  return horizontalClearance(s,x,y)<radius-0.1&&walkingHeight(s,cx,cy)>footHeight+stepAllowance&&
    bottomHeight(s,cx,cy)<footHeight+bodyHeight-0.001;
}

// Shared server-clock cycle: generous boarding pauses and zero end velocity.
function cargoLiftSample(lift,now,epoch=0) {
  const t=((now-epoch+(lift.phaseOffset||0))%14000+14000)%14000;
  const ease=x=>x*x*x*(x*(x*6-15)+10),low=lift.minTop??0,travel=lift.maxTop-low;
  if(t<3000)return {height:low,phase:'boarding'};
  if(t<7000)return {height:low+travel*ease((t-3000)/4000),phase:'rising'};
  if(t<10000)return {height:lift.maxTop,phase:'upper'};
  return {height:low+travel*(1-ease((t-10000)/4000)),phase:'descending'};
}

function updateCargoLifts(map,players,now) {
  for(const lift of map.terrain.filter(s=>s.kind==='lift')) {
    const previous=lift.top,next=lift.enabled===false?(lift.minTop??lift.top):
      cargoLiftSample(lift,now,lift.phaseEpoch??map.platformEpoch??0).height;
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
    for(const rail of map.terrain.filter(s=>s.liftId===lift.id)){
      rail.bottom=next+(rail.liftBottomOffset??0);
      rail.top=next+(rail.liftTopOffset??1);
    }
  }
}

function groundHeight(x, y, solids) {
  let height = 0;
  for (const s of solids) {
    if(s.kind==='ceilingPanel'||s.nonSolid)continue;
    if (horizontalClearance(s,x,y)<=0)
      height = Math.max(height, walkingHeight(s, x, y));
  }
  return height;
}

// Lowest overhead face above a body. This is deliberately separate from
// groundHeight so stacked walkable surfaces can share the same XY footprint.
function ceilingHeightAt(x,y,footHeight,solids,radius=0) {
  let ceiling=Infinity;
  for(const s of solids) {
    if(s.nonSolid)continue;
    const clearance=horizontalClearance(s,x,y);
    if(clearance>=Math.max(0,radius-.1))continue;
    const cx=Math.max(s.x,Math.min(x,s.x+s.width)),cy=Math.max(s.y,Math.min(y,s.y+s.height));
    const bottom=s.kind==='heightfield'?(Number.isFinite(s.bottom)?s.bottom:-Infinity):bottomHeight(s,cx,cy);
    if(bottom>footHeight+0.001)ceiling=Math.min(ceiling,bottom);
  }
  return ceiling;
}

// An explicitly authored floor carves a playable layer out of the otherwise
// solid volume beneath a heightfield. The floor still needs matching walls or
// an overhead shell; this only removes the old one-height-per-XY assumption.
function authoredSupportAt(x,y,footHeight,solids,allowance=0.001,radius=0) {
  return solids.some(s=>!s.nonSolid&&s.kind!=='heightfield'&&s.kind!=='ceilingPanel'&&
    (s.walkable||s.platform===true||s.kind==='ramp')&&
    horizontalClearance(s,x,y)<=Math.max(0,radius-.1)&&
    Math.abs(walkingHeight(s,x,y)-footHeight)<=Math.max(.08,allowance+.03));
}

function canOccupy(x, y, footHeight, solids, radius = 16, stepAllowance = 0.001, bodyHeight = 2.2) {
  // A round body can transfer onto an authored floor as soon as its footprint
  // overlaps the edge. Use the same radius-aware support footprint here as
  // supportHeight; otherwise a buried doorway presents an invisible strip of
  // heightfield collision until the player's centre somehow reaches the slab.
  const authoredLayer=authoredSupportAt(x,y,footHeight,solids,stepAllowance,radius);
  return !solids.some(s=>!(authoredLayer&&s.kind==='heightfield'&&surfaceHeight(s,x,y)>footHeight+stepAllowance)&&
    overlapsSolid(s,x,y,footHeight,radius,stepAllowance,bodyHeight));
}

// Most arenas are one rectangle, but authored rooms such as Terminal 7's
// recessed shops can form small, enclosed pockets beyond that rectangle. Only
// a pocket whose perpendicular span contains the player expands an axis; this
// never turns the entire outside edge into walkable space.
function movementBoundsAt(map,x,y,radius=16) {
  const world=map.worldBounds||{minX:0,maxX:map.width,minY:0,maxY:map.height};
  let minX=world.minX+radius,maxX=world.maxX-radius,
    minY=world.minY+radius,maxY=world.maxY-radius;
  for(const pocket of map.walkablePockets||[]) {
    if(y>=pocket.y+radius&&y<=pocket.y+pocket.height-radius) {
      minX=Math.min(minX,pocket.x+radius);
      maxX=Math.max(maxX,pocket.x+pocket.width-radius);
    }
    if(x>=pocket.x+radius&&x<=pocket.x+pocket.width-radius) {
      minY=Math.min(minY,pocket.y+radius);
      maxY=Math.max(maxY,pocket.y+pocket.height-radius);
    }
  }
  return {minX,maxX,minY,maxY};
}

// Landing support uses the same footprint as side collision. A character whose
// feet overlap a ledge must not fall through it just because its centre is outside.
function supportHeight(x, y, footHeight, solids, allowance = 0.001) {
  // An authored floor/ramp is the intended support for an interior layer.
  // While stepping along it, the climb allowance can also make the broad
  // landscape above the room look reachable. Prefer the explicit layer so a
  // tunnel stair cannot snap a character through its mountain ceiling.
  let authoredFloor=-Infinity,centeredRamp=-Infinity;
  const authoredTolerance=Math.max(.08,allowance+.03);
  for(const s of solids) {
    if(s.nonSolid||s.kind==='heightfield'||s.kind==='ceilingPanel'||
      !(s.walkable||s.platform===true||s.kind==='ramp')||horizontalClearance(s,x,y)>=15.9)continue;
    const height=walkingHeight(s,x,y);
    if(height<=footHeight+allowance&&Math.abs(height-footHeight)<=authoredTolerance) {
      authoredFloor=Math.max(authoredFloor,height);
      // A deck touching the edge of a staircase remains beneath the player's
      // circular footprint for almost one body radius. Once the player's
      // centre is over the incline, however, that rim contact must not hold
      // their feet above the visible stair/ramp surface. Remember the centred
      // ramp separately so it can own support throughout the seam.
      if(s.kind==='ramp'&&horizontalClearance(s,x,y)<=0)
        centeredRamp=Math.max(centeredRamp,height);
    }
  }
  let floor=0;
  for(const s of solids) {
    if(s.kind==='ceilingPanel'||s.nonSolid)continue;
    if(horizontalClearance(s,x,y)>=15.9)continue;
    const height=walkingHeight(s,x,y);
    if(s.kind==='heightfield'&&Number.isFinite(authoredFloor)&&height>authoredFloor+.03)continue;
    // The same rule applies to the top of an adjacent shell/prop. At a ramp
    // entering a roof aperture, the capsule rim can overlap the wall cap
    // before its centre reaches the last tread; treating that cap as support
    // snaps feet above the visible incline just like an overlapping deck.
    if(Number.isFinite(centeredRamp)&&s.kind!=='ramp'&&
      height>centeredRamp+.03&&height<=centeredRamp+authoredTolerance)
      continue;
    if(height<=footHeight+allowance)floor=Math.max(floor,height);
  }
  return floor;
}

// Substep both prediction and authority; steep sides cannot be climbed like ramps.
function moveOnTerrain(player, x, y, map, solids, now) {
  const radius=player.botType==='ogre'?30:player.botType==='guardian'?28:16;
  const limits=movementBoundsAt(map,x,y,radius);
  x=Math.max(limits.minX,Math.min(limits.maxX,x));
  y=Math.max(limits.minY,Math.min(limits.maxY,y));
  const dx = x - player.x, dy = y - player.y;
  // Broad-phase once for the whole short movement segment. Generated floors
  // contain dozens of distant solids; collision/support/headroom only need
  // geometry within the player's footprint along this segment.
  // Ordinary characters intentionally keep the slimmer movement capsule even
  // though their more forgiving hitscan body is wider. Only the two genuinely
  // large enemy silhouettes need a larger terrain collider.
  const minX=Math.min(player.x,x)-radius,maxX=Math.max(player.x,x)+radius;
  const minY=Math.min(player.y,y)-radius,maxY=Math.max(player.y,y)+radius;
  const nearby=solids.filter(s=>!s.nonSolid&&s.x<=maxX&&s.x+s.width>=minX&&s.y<=maxY&&s.y+s.height>=minY);
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 4));
  for (let i = 0; i < steps; i++) {
    let nx = player.x + dx / steps, ny = player.y + dy / steps;
    const grounded = player.jumpStartedAt == null;
    const foot=player.height || 0,collisionFoot=foot+(player.hoverOffset||0);
    const maxRampContact=Math.max(2.5,(player.bodyHeight||2.2)*.85);
    const rampContactAllowance=s=>Math.min(maxRampContact,rampStepAllowance(s,radius)+.08);
    // Only slopes get a stepping tolerance, never the vertical face of a box.
    const activeRamps=grounded?nearby.filter(s=>s.kind==='ramp' &&
      ((player.x>=s.x&&player.x<=s.x+s.width&&player.y>=s.y&&player.y<=s.y+s.height) ||
       (nx>=s.x&&nx<=s.x+s.width&&ny>=s.y&&ny<=s.y+s.height)) &&
      Math.min(Math.abs(walkingHeight(s,player.x,player.y)-foot),
        Math.abs(walkingHeight(s,nx,ny)-foot))<=rampContactAllowance(s)):[];
    const onRamp=activeRamps.length>0;
    // At the upper seam the player's leading edge touches the deck before
    // their centre reaches the final tread. Scale that legal step by the
    // staircase slope and body radius so tall generated stairs never snag.
    let allowance=onRamp?activeRamps.reduce((value,s)=>Math.max(value,rampStepAllowance(s,radius)),.28):0.001;
    const terrainSurface=nearby.find(s=>s.kind==='heightfield');
    if(grounded&&terrainSurface) {
      const currentTerrain=surfaceHeight(terrainSurface,player.x,player.y);
      const nextTerrain=surfaceHeight(terrainSurface,nx,ny),climb=nextTerrain-currentTerrain;
      // Smooth landscape slopes are walkable; true cliff faces remain solid.
      // Substeps are at most four arena units, making this a stable grade cap.
      if(climb<=.32)allowance=Math.max(allowance,Math.max(0,climb)+.015);
    }
    // Resolve round props and rectangular corners along their real tangent
    // before the general solid test. This removes jagged, sticky corner motion.
    for(const s of nearby) {
      if(!overlapsSolid(s,nx,ny,collisionFoot,radius,allowance,player.bodyHeight||2.2))continue;
      const projected=projectRoundedCollision(s,nx,ny,radius);
      if(projected){nx=projected.x;ny=projected.y;}
    }
    const floor = supportHeight(nx,ny,foot,nearby,allowance);
    if ((player.botType==='ogre'||player.botType==='guardian') && Math.max(collisionFoot,floor+(player.hoverOffset||0))+player.bodyHeight>(map.ceiling||Infinity)) return false;
    const testFoot=(grounded&&onRamp?Math.max(foot,floor):foot)+(player.hoverOffset||0);
    if (!canOccupy(nx, ny, testFoot, nearby,radius,allowance,player.bodyHeight||2.2)) {
      // Dynamic lift seams can occasionally leave a player a fraction inside a
      // rail. Permit tangential or outward movement, while still rejecting any
      // move that enters a new solid or increases the existing penetration.
      const escaping=nearby.every(s=>{
        if(!overlapsSolid(s,nx,ny,testFoot,radius,allowance,player.bodyHeight||2.2))return true;
        if(!overlapsSolid(s,player.x,player.y,collisionFoot,radius,allowance,player.bodyHeight||2.2))return false;
        return horizontalClearance(s,nx,ny)>=horizontalClearance(s,player.x,player.y)-1e-6;
      });
      if(!escaping)return false;
    }
    player.x = nx; player.y = ny;
    if (grounded) {
      const rampDescent=activeRamps.reduce((value,s)=>Math.max(value,rampContactAllowance(s)),.35);
      const drop=(player.height||0)-floor;
      const smoothDescent=(onRamp&&drop<=rampDescent)||(terrainSurface&&drop<=.35);
      if (floor < (player.height || 0) - 0.22 && !smoothDescent) {
        player.jumpBase = player.height || 0; player.jumpVelocity = 0; player.jumpStartedAt = now;
      } else player.height = floor;
    }
    player.groundHeight = floor;
    const platform=(map.terrain||[]).find(s=>s.kind==='lift'&&Math.abs(s.top-floor)<0.001&&
      Math.hypot(nx-Math.max(s.x,Math.min(nx,s.x+s.width)),ny-Math.max(s.y,Math.min(ny,s.y+s.height)))<15.9);
    player.groundPlatformId=platform?.id||null;
    const e=[map.arrivalElevator,map.elevator].find(e=>e&&nx>=e.x&&nx<=e.x+e.width&&ny>=e.y&&ny<=e.y+e.height);
    // The global ceiling remains the vertical simulation limit even when an
    // outdoor map has no rendered roof. Local authored undersides can lower it.
    const worldCeiling=e&&nx>=e.x&&nx<=e.x+e.width&&ny>=e.y&&ny<=e.y+e.height?e.ceiling:map.ceiling;
    player.ceilingHeight=Math.min(worldCeiling??Infinity,
      ceilingHeightAt(nx,ny,player.height||0,nearby,radius));
  }
  return true;
}

// Horizontal impact motion is velocity-based rather than a timed movement
// lock. Every hit adds an impulse to the velocity that is already present;
// constant opposing acceleration then bleeds that velocity away predictably.
const IMPACT_MOTION=Object.freeze({deceleration:650,maxSpeed:480,stopSpeed:1e-6});

function updateImpactAcceleration(k) {
  const speed=Math.hypot(k.vx||0,k.vy||0);
  if(speed<=IMPACT_MOTION.stopSpeed){k.ax=0;k.ay=0;return speed;}
  const deceleration=k.deceleration||IMPACT_MOTION.deceleration;
  k.ax=-(k.vx/speed)*deceleration;k.ay=-(k.vy/speed)*deceleration;
  return speed;
}

function addKnockbackImpulse(player,vx,vy,now,kind='impact',options={}) {
  if(!player?.alive||!Number.isFinite(vx)||!Number.isFinite(vy))return null;
  const k=player.knockback||(player.knockback={vx:0,vy:0,ax:0,ay:0,lastAt:now,kind});
  k.vx=(k.vx||0)+vx;k.vy=(k.vy||0)+vy;k.lastAt=now;k.kind=kind;
  k.deceleration=Number.isFinite(options.deceleration)&&options.deceleration>0?
    options.deceleration:IMPACT_MOTION.deceleration;
  k.maxSpeed=Number.isFinite(options.maxSpeed)&&options.maxSpeed>0?
    options.maxSpeed:IMPACT_MOTION.maxSpeed;
  const speed=Math.hypot(k.vx,k.vy);
  if(speed<=IMPACT_MOTION.stopSpeed){player.knockback=null;return null;}
  if(speed>k.maxSpeed) {
    const scale=k.maxSpeed/speed;k.vx*=scale;k.vy*=scale;
  }
  updateImpactAcceleration(k);
  return k;
}

function advanceKnockback(player,now,map,solids) {
  const k=player.knockback;
  if(!k)return false;
  if(!player.alive){player.knockback=null;return false;}
  const speed=updateImpactAcceleration(k);
  if(speed<=IMPACT_MOTION.stopSpeed){player.knockback=null;return false;}
  const elapsed=Math.max(0,(now-(k.lastAt??now))/1000);
  if(elapsed<=0)return true;
  const deceleration=k.deceleration||IMPACT_MOTION.deceleration;
  const activeTime=Math.min(elapsed,speed/deceleration);
  const distance=speed*activeTime-.5*deceleration*activeTime*activeTime;
  const ux=k.vx/speed,uy=k.vy/speed;
  const targetX=player.x+ux*distance;
  moveOnTerrain(player,targetX,player.y,map,solids,now);
  const blockedX=Math.abs(player.x-targetX)>0.001;
  const targetY=player.y+uy*distance;
  moveOnTerrain(player,player.x,targetY,map,solids,now);
  const blockedY=Math.abs(player.y-targetY)>0.001;
  const remaining=Math.max(0,speed-deceleration*activeTime);
  k.vx=blockedX?0:ux*remaining;k.vy=blockedY?0:uy*remaining;
  k.lastAt=now;
  if(updateImpactAcceleration(k)<=IMPACT_MOTION.stopSpeed)player.knockback=null;
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
  module.exports = { DEFAULT_MAP, IMPACT_MOTION, sampleHeightfield, surfaceHeight, walkingHeight, bottomHeight, rampStepAllowance, horizontalClearance, cargoLiftSample, updateCargoLifts, groundHeight, ceilingHeightAt, authoredSupportAt, supportHeight, canOccupy, movementBoundsAt, moveOnTerrain, addKnockbackImpulse, advanceKnockback, createPveMap, createPvpMap, regeneratePlayers };
