const {DEFAULT_MAP,sampleHeightfield,surfaceHeight,authoredSupportAt}=require('../public/arenaMap');
function rayHeightfield(x,y,dx,dy,field,height,slope,carvedAt=()=>false) {
  let near=0,far=Infinity;
  for(const [origin,direction,min,max] of [[x,dx,field.x,field.x+field.width],[y,dy,field.y,field.y+field.height]]) {
    if(Math.abs(direction)<1e-9){if(origin<min||origin>max)return Infinity;continue;}
    const a=(min-origin)/direction,b=(max-origin)/direction;
    near=Math.max(near,Math.min(a,b));far=Math.min(far,Math.max(a,b));
  }
  const length=Math.hypot(dx,dy),limit=Math.abs(length-1)<1e-6?far:Math.min(far,1);
  if(!(near<=limit)||!Number.isFinite(limit))return Infinity;
  const topAt=t=>sampleHeightfield(field,x+dx*t,y+dy*t);
  const bottom=Number.isFinite(field.bottom)?field.bottom:-Infinity;
  const elevation=t=>height+slope*t;
  const occupied=t=>!carvedAt(t)&&elevation(t)>=bottom-1e-8&&elevation(t)<=topAt(t)+1e-8;
  if(occupied(near))return near;
  const cell=Math.min(field.width/(field.cols-1),field.height/(field.rows-1));
  const step=Math.max(1e-5,cell*.2/Math.max(length,1e-6));
  let previous=near;
  for(let t=Math.min(limit,near+step);t<=limit+1e-8;t=Math.min(limit,t+step)) {
    if(Number.isFinite(bottom)&&Math.abs(slope)>1e-9) {
      const underside=(bottom-height)/slope;
      if(underside>previous&&underside<=t&&underside>=near&&underside<=limit&&!carvedAt(underside)&&
        elevation(underside)<=topAt(underside)+1e-8)return underside;
    }
    // Entering either the sculpted top face or a finite underside is a hit.
    // Finite undersides are what allow a real tunnel below an exterior
    // heightfield without making every horizontal ray inside the tunnel hit at
    // its origin.
    if(occupied(t)) {
      let lo=previous,hi=t;
      for(let i=0;i<12;i++){const mid=(lo+hi)/2;if(occupied(mid))hi=mid;else lo=mid;}
      return hi;
    }
    const before=elevation(previous)-topAt(previous),after=elevation(t)-topAt(t);
    if(before>0&&after<=0) {
      let lo=previous,hi=t;
      for(let i=0;i<12;i++){const mid=(lo+hi)/2;
        if(elevation(mid)-topAt(mid)>0)lo=mid;else hi=mid;}
      if(elevation(hi)>=bottom-1e-8&&!carvedAt(hi))return hi;
    }
    if(t===limit)break;previous=t;
  }
  return Infinity;
}
function rayCylinder(x,y,dx,dy,wall,height,slope,cx,cy,radius) {
  const ox=x-cx,oy=y-cy,a=dx*dx+dy*dy,b=2*(ox*dx+oy*dy),c=ox*ox+oy*oy-radius*radius;
  let near=0,far=Infinity;
  if(a<1e-12) {if(c>0)return Infinity;}
  else {
    const discriminant=b*b-4*a*c;
    if(discriminant<0)return Infinity;
    const root=Math.sqrt(discriminant),one=(-b-root)/(2*a),two=(-b+root)/(2*a);
    near=Math.max(near,Math.min(one,two));far=Math.min(far,Math.max(one,two));
  }
  const bottom=wall.bottom??0,top=wall.top??3.1;
  if(Math.abs(slope)<1e-9) {if(height<bottom||height>top)return Infinity;}
  else {
    const one=(bottom-height)/slope,two=(top-height)/slope;
    near=Math.max(near,Math.min(one,two));far=Math.min(far,Math.max(one,two));
  }
  return near<=far&&far>=0?near:Infinity;
}
function rayCapsule(x,y,dx,dy,wall,height,slope,a,b,radius) {
  const vx=b.x-a.x,vy=b.y-a.y,length=Math.hypot(vx,vy);
  if(length<1e-8)return rayCylinder(x,y,dx,dy,wall,height,slope,a.x,a.y,radius);
  const ux=vx/length,uy=vy/length,px=-uy,py=ux;
  const ox=x-a.x,oy=y-a.y,localX=ox*ux+oy*uy,localY=ox*px+oy*py;
  const localDx=dx*ux+dy*uy,localDy=dx*px+dy*py;
  let near=0,far=Infinity;
  for(const [origin,direction,min,max] of [[localX,localDx,0,length],[localY,localDy,-radius,radius],
    [height,slope,wall.bottom??0,wall.top??3.1]]) {
    if(Math.abs(direction)<1e-9){if(origin<min||origin>max){near=Infinity;break;}}
    else{const one=(min-origin)/direction,two=(max-origin)/direction;near=Math.max(near,Math.min(one,two));far=Math.min(far,Math.max(one,two));if(near>far)break;}
  }
  const middle=near<=far&&far>=0?near:Infinity;
  return Math.min(middle,rayCylinder(x,y,dx,dy,wall,height,slope,a.x,a.y,radius),
    rayCylinder(x,y,dx,dy,wall,height,slope,b.x,b.y,radius));
}
function rayConvexPolygon(x,y,dx,dy,wall,height,slope) {
  const points=wall.collisionPolygon;
  if(!Array.isArray(points)||points.length<3)return Infinity;
  let signedArea=0;
  for(let index=0;index<points.length;index++) {
    const a=points[index],b=points[(index+1)%points.length];
    signedArea+=a.x*b.y-b.x*a.y;
  }
  const sign=signedArea>=0?1:-1;
  let near=0,far=Infinity;
  for(let index=0;index<points.length;index++) {
    const a=points[index],b=points[(index+1)%points.length],ex=b.x-a.x,ey=b.y-a.y;
    // For a consistently wound convex polygon, every interior point lies on
    // the same side of every edge. Clip the ray against those half-planes.
    const origin=sign*(ex*(y-a.y)-ey*(x-a.x));
    const rate=sign*(ex*dy-ey*dx);
    if(Math.abs(rate)<1e-9){if(origin<0)return Infinity;continue;}
    const crossing=-origin/rate;
    if(rate>0)near=Math.max(near,crossing);else far=Math.min(far,crossing);
    if(near>far)return Infinity;
  }
  const bottom=wall.bottom??0,top=wall.top??3.1;
  if(Math.abs(slope)<1e-9){if(height<bottom||height>top)return Infinity;}
  else {
    const one=(bottom-height)/slope,two=(top-height)/slope;
    near=Math.max(near,Math.min(one,two));far=Math.min(far,Math.max(one,two));
  }
  return near<=far&&far>=0?near:Infinity;
}
// Horizontal distances use arena units; vertical distances use metres.
function rayBox(x, y, dx, dy, wall, height = 1.84, slope = 0) {
  if(wall.kind==='heightfield')return rayHeightfield(x,y,dx,dy,wall,height,slope);
  if(wall.kind==='ramp'&&wall.stairs) {
    const vertical=wall.axis==='y',length=(vertical?wall.height:wall.width)/wall.steps;
    const bottom=wall.bottom||0,span=wall.top-bottom;
    let hit=Infinity;
    for(let i=0;i<wall.steps;i++) {
      const index=wall.reverse?wall.steps-1-i:i;
      hit=Math.min(hit,rayBox(x,y,dx,dy,{...wall,kind:'step',
        x:wall.x+(vertical?0:index*length),y:wall.y+(vertical?index*length:0),
        width:vertical?wall.width:length,height:vertical?length:wall.height,
        top:bottom+span*(i+1)/wall.steps},height,slope));
    }
    return hit;
  }
  const shape=wall.collisionShape||(
    wall.kind==='furnace'||wall.kind==='tank'?'circle':wall.kind==='pipe'?'capsule':null
  );
  if(shape==='polygon')return rayConvexPolygon(x,y,dx,dy,wall,height,slope);
  if(shape==='circle') {
    const radius=wall.collisionRadius??Math.min(wall.width,wall.height)*(wall.kind==='furnace'?0.4:0.42);
    return rayCylinder(x,y,dx,dy,wall,height,slope,wall.x+wall.width/2,wall.y+wall.height/2,radius);
  }
  if(shape==='capsule') {
    const alongX=wall.width>=wall.height,radius=wall.collisionRadius??Math.min(wall.width,wall.height)*0.36;
    const ax=wall.collisionA?.x??(alongX?wall.x+radius:wall.x+wall.width/2);
    const ay=wall.collisionA?.y??(alongX?wall.y+wall.height/2:wall.y+radius);
    const bx=wall.collisionB?.x??(alongX?wall.x+wall.width-radius:ax);
    const by=wall.collisionB?.y??(alongX?ay:wall.y+wall.height-radius);
    if(wall.collisionA||wall.collisionB)return rayCapsule(x,y,dx,dy,wall,height,slope,{x:ax,y:ay},{x:bx,y:by},radius);
    const middle=alongX?{...wall,collisionShape:'box',x:ax,y:ay-radius,width:Math.max(0,bx-ax),height:radius*2}:
      {...wall,collisionShape:'box',x:ax-radius,y:ay,width:radius*2,height:Math.max(0,by-ay)};
    return Math.min(rayBox(x,y,dx,dy,middle,height,slope),
      rayCylinder(x,y,dx,dy,wall,height,slope,ax,ay,radius),
      rayCylinder(x,y,dx,dy,wall,height,slope,bx,by,radius));
  }
  let near = 0;
  let far = Infinity;
  // Sloped guard rails store their low-end vertical interval in bottom/top
  // plus a rise.  Use the complete swept interval for broad-phase clipping;
  // the exact local rail faces are clipped just below.  Treating `top` as a
  // global cap made bullets pass through the visibly raised half of a rail
  // even though movement correctly collided with it.
  const rampStructureDepth=wall.kind==='ramp'&&Number.isFinite(wall.structureDepth)?
    Math.max(0,wall.structureDepth):null;
  const boxBottom=wall.kind==='rail'&&wall.axis?
    Math.min(wall.bottom??0,(wall.bottom??0)+(wall.rise||0)):
    rampStructureDepth!=null?Math.min(wall.bottom??0,wall.top??3.1)-rampStructureDepth:
    wall.bottom??0;
  const boxTop=wall.kind==='rail'&&wall.axis?
    Math.max(wall.top??3.1,(wall.top??3.1)+(wall.rise||0)):wall.top??3.1;
  for (const [origin, direction, min, max] of [
    [x, dx, wall.x, wall.x + wall.width],
    [y, dy, wall.y, wall.y + wall.height],
    [height, slope, boxBottom, boxTop],
  ]) {
    if (Math.abs(direction) < 1e-9) {
      if (origin < min || origin > max) return Infinity;
    } else {
      const a = (min - origin) / direction;
      const b = (max - origin) / direction;
      near = Math.max(near, Math.min(a, b));
      far = Math.min(far, Math.max(a, b));
      if (near > far) return Infinity;
    }
  }
  if (wall.kind === 'ramp') {
    // Clip the broad box against the actual sloped roof. Authored structural
    // ramps additionally have a parallel underside; shots below that visible
    // casing pass cleanly instead of striking a broad invisible wedge.
    const bottom=wall.bottom||0;
    const gradient = (wall.top-bottom) / (wall.axis === 'y' ? wall.height : wall.width) * (wall.reverse ? -1 : 1);
    const origin = wall.axis === 'y' ? y - wall.y : x - wall.x;
    const roof = (wall.reverse ? wall.top : bottom) + gradient * origin;
    const offset = height - roof;
    const direction = slope - gradient * (wall.axis === 'y' ? dy : dx);
    const planes=[[offset,direction]];
    if(rampStructureDepth!=null)
      planes.push([-offset-rampStructureDepth,-direction]);
    for(const [planeOffset,planeDirection] of planes) {
      if (Math.abs(planeDirection) < 1e-9) {
        if (planeOffset > 0) return Infinity;
      } else if (planeDirection < 0) near = Math.max(near, -planeOffset / planeDirection);
      else far = Math.min(far, -planeOffset / planeDirection);
      if (near > far) return Infinity;
    }
  }
  if(wall.kind==='rail'&&wall.axis) {
    const gradient=wall.rise/(wall.axis==='y'?wall.height:wall.width)*(wall.reverse?-1:1);
    const base=(wall.bottom||0)+(wall.reverse?wall.rise:0)+gradient*(wall.axis==='y'?y-wall.y:x-wall.x);
    const rate=slope-gradient*(wall.axis==='y'?dy:dx);
    const railHeight=(wall.top??((wall.bottom||0)+1))-(wall.bottom||0);
    // Clip against both faces of the sloping guard, not empty space below.
    // Use its authored height so the final visible 15 cm is neither shootable
    // nor intangible.
    for(const [offset,direction] of [[height-base-railHeight,rate],[base-height,-rate]]) {
      if(Math.abs(direction)<1e-9){if(offset>0)return Infinity;}
      else if(direction<0)near=Math.max(near,-offset/direction);
      else far=Math.min(far,-offset/direction);
    }
    if(near>far)return Infinity;
  }
  return far >= 0 ? near : Infinity;
}

function playerHitDistance(shooter,player,dx,dy,height,slope) {
  const ox = shooter.x - player.x;
  const oy = shooter.y - player.y;
  const b = ox * dx + oy * dy;
  const radius = player.bodyRadius || 20;
  const c = ox * ox + oy * oy - radius * radius;
  const discriminant = b * b - c;
  if (discriminant < 0) return Infinity;
  const entry = -b - Math.sqrt(discriminant);
  const exit = -b + Math.sqrt(discriminant);
  if (exit < 0) return Infinity;
  // Intersect the horizontal cylinder interval with the character's height.
  const bottom = (player.height || 0)+(player.hoverOffset||0);
  const top = bottom + (player.bodyHeight || 2.2);
  if (Math.abs(slope) < 1e-9) return height < bottom || height > top ? Infinity : Math.max(0,entry);
  const vertical = [(bottom - height) / slope, (top - height) / slope].sort((a, b) => a - b);
  const t = Math.max(0, entry, vertical[0]);
  return t <= Math.min(exit,vertical[1]) ? t : Infinity;
}

function traceLine(shooter, angle, walls, players, canHit, pitch, map, piercing) {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const height = (shooter.eyeHeight ?? 1.84) + (shooter.height || 0);
  const slope = Math.tan(pitch) * 0.05;
  const bounds=map.worldBounds||{minX:0,minY:0,maxX:map.width,maxY:map.height};
  // Stop at the arena edge, including when the origin lies on an edge.
  let distance = Math.min(
    dx > 1e-9 ? (bounds.maxX-shooter.x)/dx : dx < -1e-9 ? (bounds.minX-shooter.x)/dx : Infinity,
    dy > 1e-9 ? (bounds.maxY-shooter.y)/dy : dy < -1e-9 ? (bounds.minY-shooter.y)/dy : Infinity,
  );
  let targetId = null;
  let hit = "boundary";
  if (slope < 0 && -height / slope < distance) { distance = -height / slope; hit = 'floor'; }
  // `ceiling` still provides a physics/rendering scale for roofless maps. It
  // only clips bullets when the map actually has a global roof; tunnels and
  // overhangs are represented by their own bottom/top solids below.
  if (slope > 0 && map.ceiling && map.roof!==false && (map.ceiling-height)/slope < distance) {
    distance = Math.max(0,(map.ceiling-height)/slope);hit='ceiling';
  }
  const cabinRoof=[map.elevator,map.arrivalElevator].filter(Boolean).map(e=>({...e,bottom:e.ceiling,top:e.ceiling+0.12}));
  const terrain=map.terrain||[],authoredLayer=authoredSupportAt(shooter.x,shooter.y,shooter.height||0,terrain);
  const carvingSurfaces=authoredLayer?terrain.filter(surface=>surface.kind!=='heightfield'):[];
  for (const wall of [...walls, ...map.terrain,...cabinRoof]) {
    if(wall.nonSolid)continue;
    // Explicit tunnel/interior floors carve a traversable layer beneath the
    // broad exterior heightfield. Their authored walls and ceilings become
    // the ray blockers inside that layer instead of an instant terrain hit.
    // The carve is evaluated along the ray, rather than skipping the whole
    // landscape: a shot leaving a tunnel still collides with the mountain.
    const carvedAt=authoredLayer&&wall.kind==='heightfield'&&
      height<surfaceHeight(wall,shooter.x,shooter.y)-1e-6?
      t=>authoredSupportAt(shooter.x+dx*t,shooter.y+dy*t,shooter.height||0,carvingSurfaces):null;
    const t=carvedAt?rayHeightfield(shooter.x,shooter.y,dx,dy,wall,height,slope,carvedAt):
      rayBox(shooter.x,shooter.y,dx,dy,wall,height,slope);
    if (t <= distance) { distance = t; hit = "wall"; }
  }
  const targets=[];
  for (const player of players) {
    if (!player.alive || player.id === shooter.id || !canHit(player)) continue;
    const t=playerHitDistance(shooter,player,dx,dy,height,slope);
    if(t>=distance)continue;
    if(piercing)targets.push({id:player.id,distance:t});
    else { distance = t; targetId = player.id; hit = "player"; }
  }
  if(piercing){targets.sort((a,b)=>a.distance-b.distance);targetId=targets[0]?.id||null;}
  return {
    playerId: shooter.id, x: shooter.x, y: shooter.y,
    endX: shooter.x + dx * distance, endY: shooter.y + dy * distance,
    angle, pitch, height, endHeight: height + slope * distance, targetId, hit,
    ...(piercing?{targetIds:targets.map(target=>target.id),piercing:true}:{}),
  };
}

function traceShot(shooter, angle, walls, players, canHit = () => true, pitch = 0, map = DEFAULT_MAP) {
  return traceLine(shooter,angle,walls,players,canHit,pitch,map,false);
}

// Sniper rounds damage every valid body before the first piece of world geometry.
// They still terminate on walls, terrain, floors, ceilings and map boundaries.
function tracePiercingShot(shooter, angle, walls, players, canHit = () => true, pitch = 0, map = DEFAULT_MAP) {
  return traceLine(shooter,angle,walls,players,canHit,pitch,map,true);
}

module.exports = { traceShot, tracePiercingShot, rayBox,rayHeightfield };
