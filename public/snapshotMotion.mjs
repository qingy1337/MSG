// Keep a small receive-time buffer for remote actors. Never delay local input,
// extrapolate through walls, or retain history across a floor change.
export class SnapshotMotion {
  constructor(delay=75){this.delay=delay;this.frames=[];}
  clear(){this.frames=[];}
  push(players,time){
    this.frames.push({time,players:new Map(players.map(p=>[p.id,{x:p.x,y:p.y,height:p.height||0,angle:p.angle}]))});
    if(this.frames.length>8)this.frames.shift();
  }
  sample(players,localId,now){
    if(!this.frames.length)return players;
    const time=now-this.delay;
    let a=this.frames[0],b=a;
    for(const frame of this.frames){if(frame.time<=time)a=frame;if(frame.time>=time){b=frame;break;}b=frame;}
    const t=a===b?0:Math.max(0,Math.min(1,(time-a.time)/(b.time-a.time)));
    return players.map(p=>{
      if(p.id===localId||!p.alive)return p;
      const from=a.players.get(p.id),to=b.players.get(p.id);
      if(!from||!to||Math.hypot(to.x-from.x,to.y-from.y)>250)return p;
      return {...p,x:from.x+(to.x-from.x)*t,y:from.y+(to.y-from.y)*t,height:from.height+(to.height-from.height)*t,
        angle:from.angle+Math.atan2(Math.sin(to.angle-from.angle),Math.cos(to.angle-from.angle))*t};
    });
  }
}
