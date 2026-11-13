// Identical horizontal movement and jump commands on the server and client.
function applyMovementInput(player,input,map,solids,now,cabin=null) {
  const movement=typeof module!=='undefined'&&module.exports?require('./movement'):{MOVEMENT,advanceJump,startJump};
  const terrain=typeof module!=='undefined'&&module.exports?require('./arenaMap'):{moveOnTerrain,canOccupy,advanceConveyor};
  const armor=typeof module!=='undefined'&&module.exports?require('./armor'):ARMOR;
  if(!player.alive)return;
  const bonuses=armor.effects(player.armorStats,map.mode);
  const speed=movement.MOVEMENT.speed*(1+bonuses.speed/100);
  const startX=player.x,startY=player.y;
  if(cabin) {
    // Travel is cabin-local: room terrain underneath the moving elevator must
    // not collide with riders. The closed cabin still confines their bodies.
    const length=Math.max(1,Math.hypot(input.dx,input.dy)),inset=10+movement.MOVEMENT.radius;
    player.x=Math.max(cabin.x+inset,Math.min(cabin.x+cabin.width-inset,player.x+input.dx/length*movement.MOVEMENT.speed*input.dt));
    player.y=Math.max(cabin.y+inset,Math.min(cabin.y+cabin.height-inset,player.y+input.dy/length*movement.MOVEMENT.speed*input.dt));
    player.height=0;player.groundHeight=0;player.jumpStartedAt=null;player.ceilingHeight=cabin.ceiling;
    player.platformId=null;player.groundPlatformId=null;
    player.dashRemaining=0;player.dashCoastRemaining=0;
    if(Math.hypot(player.x-startX,player.y-startY)>0.01)player.lastMovementAt=now;
    return;
  }
  movement.advanceJump(player,now);
  if(input.jump&&movement.startJump(player,now)){player.jumpInputSeq=input.seq;player.lastMovementAt=now;}
  const airborne=player.jumpStartedAt!=null&&(player.height||0)>(player.groundHeight||0)+.03;
  if(!airborne&&player.jumpStartedAt==null)player.dashUsedInAir=false;
  if(!bonuses.airDash){player.dashRemaining=0;player.dashCoastRemaining=0;}
  if(input.dash===true&&bonuses.airDash&&airborne&&!player.dashUsedInAir&&now>=(player.dashReadyAt||0)) {
    const direction=Math.hypot(input.dx,input.dy);
    player.dashX=direction>0?input.dx/direction:Math.cos(player.angle||0);
    player.dashY=direction>0?input.dy/direction:Math.sin(player.angle||0);
    player.dashRemaining=armor.DASH.duration;
    player.dashCoastRemaining=armor.DASH.coastDuration;
    player.dashReadyAt=now+armor.DASH.cooldownMs;
    player.dashUsedInAir=true;
  }
  const length=Math.max(1,Math.hypot(input.dx,input.dy));
  // Integrate by acknowledged input duration, like walking. Short collision
  // substeps prevent a fast dash from crossing a thin wall or stair riser.
  const dashTime=Math.min(input.dt,Math.max(0,player.dashRemaining||0));
  const walkTime=input.dt-dashTime;
  const coastRemaining=Math.max(0,player.dashCoastRemaining||0);
  const coastTime=Math.min(walkTime,coastRemaining);
  // Integrate the fading dash velocity exactly, even when a command straddles
  // the burst/coast boundary. Input gradually regains full steering as the
  // coast fades; releasing movement still preserves forward momentum.
  const coastWeight=coastTime*(coastRemaining-coastTime*.5)/armor.DASH.coastDuration;
  const dx=input.dx/length*speed*(walkTime-coastWeight)+(player.dashX||0)*armor.DASH.speed*(dashTime+coastWeight);
  const dy=input.dy/length*speed*(walkTime-coastWeight)+(player.dashY||0)*armor.DASH.speed*(dashTime+coastWeight);
  player.dashRemaining=Math.max(0,(player.dashRemaining||0)-dashTime);
  player.dashCoastRemaining=Math.max(0,coastRemaining-coastTime);
  const steps=Math.max(1,Math.ceil(Math.max(Math.abs(dx),Math.abs(dy))/4));
  let blockedX=false,blockedY=false;
  for(let i=0;i<steps;i++) {
    if(Math.abs(dx)>1e-9) {
      const targetX=player.x+dx/steps;
      if(map.ceiling)terrain.moveOnTerrain(player,targetX,player.y,map,solids,now);
      else {
        const radius=movement.MOVEMENT.radius,x=Math.max(radius,Math.min(map.width-radius,targetX));
        if(terrain.canOccupy(x,player.y,0,solids,radius))player.x=x;
      }
      if(Math.abs(player.x-targetX)>.001)blockedX=true;
    }
    if(Math.abs(dy)>1e-9) {
      const targetY=player.y+dy/steps;
      if(map.ceiling)terrain.moveOnTerrain(player,player.x,targetY,map,solids,now);
      else {
        const radius=movement.MOVEMENT.radius,y=Math.max(radius,Math.min(map.height-radius,targetY));
        if(terrain.canOccupy(player.x,y,0,solids,radius))player.y=y;
      }
      if(Math.abs(player.y-targetY)>.001)blockedY=true;
    }
  }
  // Contact consumes momentum into that surface, while a diagonal dash can
  // still slide along it. Never retain a push that reappears past a wall edge.
  if(blockedX)player.dashX=0;
  if(blockedY)player.dashY=0;
  if((blockedX||blockedY)&&Math.hypot(player.dashX||0,player.dashY||0)<1e-9) {
    player.dashRemaining=0;player.dashCoastRemaining=0;
  }
  // Environmental transport is part of the same predicted input as walking.
  // Even a zero-direction input therefore carries an idle rider, while a jump
  // detaches immediately and walking can naturally oppose the belt.
  if(map.ceiling)terrain.advanceConveyor(player,map,solids,input.dt,now);
  if(Math.hypot(player.x-startX,player.y-startY)>0.01)player.lastMovementAt=now;
}
if(typeof module!=='undefined'&&module.exports)module.exports={applyMovementInput};
