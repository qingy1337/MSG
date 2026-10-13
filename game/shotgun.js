const {traceShot}=require('./hitscan');

// Fixed-density disk, rotated per blast. Clients supply aim only, never pellets
// or damage. Each pellet independently tests cover, elevation, and allies.
function traceShotgun(shooter,angle,pitch,walls,players,canHit,map,random=Math.random) {
  const phase=random()*Math.PI*2,pellets=[],damage=new Map();
  for(let i=0;i<8;i++) {
    const radius=i===0?0:0.085*Math.sqrt(i/7),theta=phase+i*2.399963229728653;
    const shot=traceShot(shooter,angle+Math.cos(theta)*radius,walls,players,canHit,
      Math.max(-1.45,Math.min(1.45,pitch+Math.sin(theta)*radius)),map);
    pellets.push(shot);
    if(shot.targetId) {
      const range=Math.hypot(shot.endX-shot.x,shot.endY-shot.y,(shot.endHeight-shot.height)/0.05);
      const amount=Math.max(1,12-Math.max(0,range-100)/30);
      damage.set(shot.targetId,(damage.get(shot.targetId)||0)+amount);
    }
  }
  return {pellets,damage};
}
module.exports={traceShotgun};
