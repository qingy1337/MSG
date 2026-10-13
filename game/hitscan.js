const { DEFAULT_MAP } = require('../public/arenaMap');
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
// Horizontal distances use arena units; vertical distances use metres.
function rayBox(x, y, dx, dy, wall, height = 1.84, slope = 0) {
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
  if(shape==='circle') {
    const radius=wall.collisionRadius??Math.min(wall.width,wall.height)*(wall.kind==='furnace'?0.4:0.42);
    return rayCylinder(x,y,dx,dy,wall,height,slope,wall.x+wall.width/2,wall.y+wall.height/2,radius);
  }
  if(shape==='capsule') {
    const alongX=wall.width>=wall.height,radius=wall.collisionRadius??Math.min(wall.width,wall.height)*0.36;
    const ax=alongX?wall.x+radius:wall.x+wall.width/2,ay=alongX?wall.y+wall.height/2:wall.y+radius;
    const bx=alongX?wall.x+wall.width-radius:ax,by=alongX?ay:wall.y+wall.height-radius;
    const middle=alongX?{...wall,collisionShape:'box',x:ax,y:ay-radius,width:Math.max(0,bx-ax),height:radius*2}:
      {...wall,collisionShape:'box',x:ax-radius,y:ay,width:radius*2,height:Math.max(0,by-ay)};
    return Math.min(rayBox(x,y,dx,dy,middle,height,slope),
      rayCylinder(x,y,dx,dy,wall,height,slope,ax,ay,radius),
      rayCylinder(x,y,dx,dy,wall,height,slope,bx,by,radius));
  }
  let near = 0;
  let far = Infinity;
  for (const [origin, direction, min, max] of [
    [x, dx, wall.x, wall.x + wall.width],
    [y, dy, wall.y, wall.y + wall.height],
    [height, slope, wall.bottom ?? 0, wall.top ?? 3.1],
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
    // Clip the bounding box against the actual sloped roof of the solid wedge.
    const bottom=wall.bottom||0;
    const gradient = (wall.top-bottom) / (wall.axis === 'y' ? wall.height : wall.width) * (wall.reverse ? -1 : 1);
    const origin = wall.axis === 'y' ? y - wall.y : x - wall.x;
    const roof = (wall.reverse ? wall.top : bottom) + gradient * origin;
    const offset = height - roof;
    const direction = slope - gradient * (wall.axis === 'y' ? dy : dx);
    if (Math.abs(direction) < 1e-9) { if (offset > 0) return Infinity; }
    else if (direction < 0) near = Math.max(near, -offset / direction);
    else far = Math.min(far, -offset / direction);
    if (near > far) return Infinity;
  }
  if(wall.kind==='rail'&&wall.axis) {
    const gradient=wall.rise/(wall.axis==='y'?wall.height:wall.width)*(wall.reverse?-1:1);
    const base=(wall.bottom||0)+(wall.reverse?wall.rise:0)+gradient*(wall.axis==='y'?y-wall.y:x-wall.x);
    const rate=slope-gradient*(wall.axis==='y'?dy:dx);
    // Clip against both faces of the sloping glass guard, not empty space below.
    for(const [offset,direction] of [[height-base-1,rate],[base-height,-rate]]) {
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
  const bottom = player.height || 0;
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
  // Stop at the arena edge, including when the origin lies on an edge.
  let distance = Math.min(
    dx > 1e-9 ? (map.width - shooter.x) / dx : dx < -1e-9 ? -shooter.x / dx : Infinity,
    dy > 1e-9 ? (map.height - shooter.y) / dy : dy < -1e-9 ? -shooter.y / dy : Infinity,
  );
  let targetId = null;
  let hit = "boundary";
  if (slope < 0 && -height / slope < distance) { distance = -height / slope; hit = 'floor'; }
  if (slope > 0 && map.ceiling && (map.ceiling-height)/slope < distance) {
    distance = Math.max(0,(map.ceiling-height)/slope);hit='ceiling';
  }
  const cabinRoof=[map.elevator,map.arrivalElevator].filter(Boolean).map(e=>({...e,bottom:e.ceiling,top:e.ceiling+0.12}));
  for (const wall of [...walls, ...map.terrain,...cabinRoof]) {
    const t = rayBox(shooter.x, shooter.y, dx, dy, wall, height, slope);
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

module.exports = { traceShot, tracePiercingShot, rayBox };
