const {rayBox}=require('./hitscan');
const {supportHeight}=require('../public/arenaMap');

// One small reliable death descriptor, never a networked ragdoll.
function deathDescriptor(target,source,kind,map,walls,random=Math.random) {
  const angle=source?Math.atan2(target.y-source.y,target.x-source.x):(target.angle||0);
  const dx=Math.cos(angle),dy=Math.sin(angle),solids=[...walls,...map.terrain].filter(s=>!s.nonSolid);
  const guardian=target.botType==='guardian';
  const height=(target.height||0)+(target.hoverOffset||0)+(guardian?(target.bodyHeight||2.6)/2:0),ogre=target.botType==='ogre';
  let distance=ogre?8:kind==='grenade'?65:kind==='shotgun'?34:10;
  const radius=ogre?35:24;
  for(const solid of solids)distance=Math.min(distance,Math.max(0,rayBox(target.x,target.y,dx,dy,
    {...solid,x:solid.x-radius,y:solid.y-radius,width:solid.width+radius*2,height:solid.height+radius*2},height+.4)-2));
  const bounds=map.worldBounds||{minX:0,minY:0,maxX:map.width,maxY:map.height};
  const endX=Math.max(bounds.minX+radius,Math.min(bounds.maxX-radius,target.x+dx*distance));
  const endY=Math.max(bounds.minY+radius,Math.min(bounds.maxY-radius,target.y+dy*distance));
  const ground=supportHeight(endX,endY,height,solids);
  return {x:target.x,y:target.y,height,endX,endY,ground,angle,kind,ogre,
    variant:Math.floor(random()*3),lifetime:8+random()*4,
    platformId:map.terrain.find(s=>s.kind==='lift'&&Math.abs(s.top-ground)<.03&&
      endX>=s.x&&endX<=s.x+s.width&&endY>=s.y&&endY<=s.y+s.height)?.id||null};
}

function makeDeathPickup(target,death,id,now,random=Math.random) {
  if(!target.isBot||(!death.ogre&&random()>=.22))return null;
  return {id,kind:'grenade',x:death.endX,y:death.endY,height:death.ground,
    platformId:death.platformId,availableAt:now+1800,expiresAt:now+25000};
}

function collectPickups(pickups,players,map,walls,now) {
  let changed=false;
  for(let i=pickups.length-1;i>=0;i--) {
    const item=pickups[i];
    const lift=map.terrain.find(s=>s.id===item.platformId&&s.kind==='lift');
    if(lift)item.height=lift.top;
    if(now>=item.expiresAt){pickups.splice(i,1);changed=true;continue;}
    if(now<item.availableAt)continue;
    for(const p of players) {
      if(!p.alive||p.isBot||!(p.grenades<3)||Math.abs((p.height||0)-item.height)>.65)continue;
      const distance=Math.hypot(item.x-p.x,item.y-p.y);
      if(distance>32)continue;
      const dx=(item.x-p.x)/(distance||1),dy=(item.y-p.y)/(distance||1);
      if([...walls,...map.terrain].some(s=>rayBox(p.x,p.y,dx,dy,s,item.height+.35)<distance))continue;
      p.grenades++;pickups.splice(i,1);changed=true;break;
    }
  }
  return changed;
}
module.exports={deathDescriptor,makeDeathPickup,collectPickups};
