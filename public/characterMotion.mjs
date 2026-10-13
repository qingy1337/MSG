// Render-rate smoothing keeps a 20 Hz network snapshot from stopping the gait
// on every intervening frame. Phase follows rendered distance, not packet count.
export function updateCharacterMotion(c, player, dt) {
  dt=Math.max(0,Math.min(dt,0.1));
  c.angle??=player.angle;c.speed??=0;c.phase??=0;
  const blend=1-Math.exp(-18*dt),oldX=c.x,oldY=c.y;
  if(Math.hypot(player.x-c.x,player.y-c.y)>250){c.x=player.x;c.y=player.y;c.speed=0;}
  else {c.x+=(player.x-c.x)*blend;c.y+=(player.y-c.y)*blend;}
  const distance=Math.hypot(c.x-oldX,c.y-oldY);
  const speed=distance>250?0:distance/Math.max(dt,0.001);
  c.speed+=(speed-c.speed)*(1-Math.exp(-10*dt));
  c.angle+=Math.atan2(Math.sin(player.angle-c.angle),Math.cos(player.angle-c.angle))*blend;
  const forward=(c.x-oldX)*Math.cos(c.angle)+(c.y-oldY)*Math.sin(c.angle);
  c.phase+=(distance>250?0:distance)*0.10*(forward<0?-1:1);
  const weight=Math.min(1,c.speed/90)*(player.jumpStartedAt?0:1);
  return {stride:Math.sin(c.phase)*0.55*weight,
    bob:Math.abs(Math.sin(c.phase))*0.035*weight,
    sway:Math.sin(c.phase)*0.018*weight};
}
