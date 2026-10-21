// Identical horizontal movement and jump commands on the server and client.
function applyMovementInput(player,input,map,solids,now,cabin=null) {
  const movement=typeof module!=='undefined'&&module.exports?require('./movement'):{MOVEMENT,advanceJump,startJump};
  const terrain=typeof module!=='undefined'&&module.exports?require('./arenaMap'):{moveOnTerrain,canOccupy};
  if(!player.alive)return;
  const startX=player.x,startY=player.y;
  if(cabin) {
    // Travel is cabin-local: room terrain underneath the moving elevator must
    // not collide with riders. The closed cabin still confines their bodies.
    const length=Math.max(1,Math.hypot(input.dx,input.dy)),inset=10+movement.MOVEMENT.radius;
    player.x=Math.max(cabin.x+inset,Math.min(cabin.x+cabin.width-inset,player.x+input.dx/length*movement.MOVEMENT.speed*input.dt));
    player.y=Math.max(cabin.y+inset,Math.min(cabin.y+cabin.height-inset,player.y+input.dy/length*movement.MOVEMENT.speed*input.dt));
    player.height=0;player.groundHeight=0;player.jumpStartedAt=null;player.ceilingHeight=cabin.ceiling;
    player.platformId=null;player.groundPlatformId=null;
    if(Math.hypot(player.x-startX,player.y-startY)>0.01)player.lastMovementAt=now;
    return;
  }
  movement.advanceJump(player,now);
  if(input.jump&&movement.startJump(player,now)){player.jumpInputSeq=input.seq;player.lastMovementAt=now;}
  const length=Math.max(1,Math.hypot(input.dx,input.dy));
  const dx=input.dx/length*movement.MOVEMENT.speed*input.dt,dy=input.dy/length*movement.MOVEMENT.speed*input.dt;
  const steps=Math.max(1,Math.ceil(Math.max(Math.abs(dx),Math.abs(dy))/4));
  for(let i=0;i<steps;i++) {
    if(map.ceiling){
      terrain.moveOnTerrain(player,player.x+dx/steps,player.y,map,solids,now);
      terrain.moveOnTerrain(player,player.x,player.y+dy/steps,map,solids,now);
    }else{
      const radius=movement.MOVEMENT.radius,x=Math.max(radius,Math.min(map.width-radius,player.x+dx/steps));
      const y=Math.max(radius,Math.min(map.height-radius,player.y+dy/steps));
      if(terrain.canOccupy(x,player.y,0,solids,radius))player.x=x;
      if(terrain.canOccupy(player.x,y,0,solids,radius))player.y=y;
    }
  }
  if(Math.hypot(player.x-startX,player.y-startY)>0.01)player.lastMovementAt=now;
}
if(typeof module!=='undefined'&&module.exports)module.exports={applyMovementInput};
