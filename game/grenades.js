const {rayBox}=require('./hitscan');
const R=2.4; // 12 cm, in horizontal arena units
function throwGrenade(player,angle,pitch,charge,now,id) {
  const speed=110+400*Math.min(1,Math.max(0,charge/1200));
  return {id,ownerId:player.id,x:player.x,y:player.y,height:(player.height||0)+1.65,
    vx:Math.cos(angle)*Math.cos(pitch)*speed,vy:Math.sin(angle)*Math.cos(pitch)*speed,
    vz:Math.sin(pitch)*speed+65,expiresAt:now+3000,updatedAt:now};
}
function geometry(map,walls) {
  return [...walls,...map.terrain,...[map.elevator,map.arrivalElevator].filter(Boolean)
    .map(e=>({...e,bottom:e.ceiling,top:e.ceiling+.12}))];
}
function stepGrenade(g,now,map,walls) {
  const end=Math.min(now,g.expiresAt),solids=geometry(map,walls).map(s=>({...s,
    x:s.x-R,y:s.y-R,width:s.width+2*R,height:s.height+2*R,
    bottom:(s.bottom??0)-R*.05,top:(s.top??3.1)+R*.05}));
  let remaining=Math.max(0,(end-g.updatedAt)/1000);
  while(remaining>1e-8) {
    const dt=Math.min(remaining,1/120);remaining-=dt;g.vz-=360*dt;
    for(const [axis,velocity] of [['x','vx'],['y','vy'],['height','vz']]) {
      const delta=g[velocity]*dt*(axis==='height'?.05:1);
      if(!delta)continue;
      let fraction=1;
      for(const box of solids) {
        if(g.x+Math.max(0,axis==='x'?delta:0)<box.x||g.x+Math.min(0,axis==='x'?delta:0)>box.x+box.width||
          g.y+Math.max(0,axis==='y'?delta:0)<box.y||g.y+Math.min(0,axis==='y'?delta:0)>box.y+box.height)continue;
        const hit=rayBox(g.x,g.y,axis==='x'?delta:0,axis==='y'?delta:0,box,g.height,axis==='height'?delta:0);
        if(hit>=0&&hit<=fraction)fraction=Math.max(0,hit-1e-5);
      }
      const lo=axis==='height'?R*.05:R;
      const hi=axis==='height'?(map.ceiling??100)-R*.05:map[axis==='x'?'width':'height']-R;
      const next=g[axis]+delta*fraction;
      g[axis]=Math.max(lo,Math.min(hi,next));
      if(fraction<1||next<lo||next>hi) {
        g[velocity]*=-.48;
        if(axis==='height') {g.vx*=.78;g.vy*=.78;if(Math.abs(g.vz)<12)g.vz=0;}
      }
    }
  }
  g.updatedAt=end;
}
function blastDamage(g,target,map,walls) {
  const height=Math.max(target.height||0,Math.min((target.height||0)+(target.bodyHeight||2.2),g.height));
  const distance=Math.max(0,Math.hypot(target.x-g.x,target.y-g.y,(height-g.height)/.05)-(target.bodyRadius||20));
  if(distance>=150)return 0;
  // A torso visibility check prevents damage through walls and upper decks.
  const aim=(target.height||0)+(target.bodyHeight||2.2)*.5;
  if(geometry(map,walls).some(s=>rayBox(g.x,g.y,target.x-g.x,target.y-g.y,s,g.height,aim-g.height)<1))return 0;
  return 120*Math.pow(1-Math.max(0,distance-15)/135,2);
}
module.exports={throwGrenade,stepGrenade,blastDamage};
