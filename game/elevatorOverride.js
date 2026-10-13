const {rayBox,traceShot}=require('./hitscan');
const {inElevator}=require('../public/floors');

function hitsElevatorOverride(player,angle,pitch,map,walls) {
  if(map.mode!=='pve'||!inElevator(player,map))return false;
  const e=map.elevator,west=e.facing==='west';
  // Matches the rear-wall button's cabin-local model, with a modest hit margin.
  const box={x:west?e.x+e.width-14:e.x+10,y:e.y+e.height/2-4,width:4,height:8,bottom:1.28,top:1.60};
  const hit=rayBox(player.x,player.y,Math.cos(angle),Math.sin(angle),box,(player.height||0)+1.84,Math.tan(pitch)*.05);
  if(!Number.isFinite(hit))return false;
  const shot=traceShot(player,angle,walls,[],()=>false,pitch,map);
  return hit<=Math.hypot(shot.endX-player.x,shot.endY-player.y)+1e-6;
}
module.exports={hitsElevatorOverride};
