const angleDelta = (a,b) => Math.atan2(Math.sin(a-b),Math.cos(a-b));

// Perception and discrete damage reports may observe enemy positions. Navigation receives
// a copied observation, never a reference that follows an occluded player.
function perceive(bot, humans, now, lineOfSight) {
  const visible=humans.filter(p=>p.alive && !p.isBot &&
    Math.hypot(p.x-bot.x,p.y-bot.y)<650 &&
    Math.abs(angleDelta(Math.atan2(p.y-bot.y,p.x-bot.x),bot.angle))<Math.PI/3 &&
    lineOfSight(p));
  visible.sort((a,b)=>Math.hypot(a.x-bot.x,a.y-bot.y)-Math.hypot(b.x-bot.x,b.y-bot.y));
  const target=visible.find(p=>p.id===bot.botState.lastSeen?.id)||visible[0];
  if(target)bot.botState.lastSeen={id:target.id,x:target.x,y:target.y,height:target.height||0,seenAt:now};
  return target || null;
}

function chooseIntent(bot, target, report, now, random=Math.random) {
  const state=bot.botState;
  if(report && report.seenAt>(state.reportSeenAt??-Infinity)) {
    state.reportSeenAt=report.seenAt;
    if(now-report.seenAt<10000 && report.seenAt>(state.lastSeen?.seenAt??-Infinity)) {
      state.lastSeen={...report};state.searchUntil=null;
    }
  }
  if(target) {
    state.mode='combat';state.searchUntil=null;state.squadTargetId=target.id;
    if(state.response?.id===target.id && now<state.response.until) return responseGoal(state,target);
    const bearing=Math.atan2(bot.y-target.y,bot.x-target.x);
    return {x:target.x+Math.cos(bearing)*230,y:target.y+Math.sin(bearing)*230};
  }
  const memory=state.lastSeen;
  if(memory && now-memory.seenAt<10000) {
    state.squadTargetId=memory.id;
    if(state.response?.id===memory.id && now<state.response.until && !state.response.arrived) {
      const goal=responseGoal(state,memory);
      if(Math.hypot(goal.x-bot.x,goal.y-bot.y)>28) {
        state.mode='investigate';return goal;
      }
      state.response.arrived=true;
    }
    if(Math.hypot(memory.x-bot.x,memory.y-bot.y)>28 && !state.searchUntil) {
      state.mode='investigate';return {x:memory.x,y:memory.y};
    }
    state.searchUntil??=now+2200;
    if(now<state.searchUntil){state.mode='search';return {x:bot.x,y:bot.y};}
  }
  state.lastSeen=null;state.squadTargetId=null;state.searchUntil=null;state.mode='idle';
  state.home??={x:bot.x,y:bot.y};
  if(!state.wanderGoal || now>=state.wanderUntil) {
    const angle=random()*Math.PI*2,radius=50+random()*130;
    const bounds=state.homeBounds;
    const x=state.home.x+Math.cos(angle)*radius,y=state.home.y+Math.sin(angle)*radius;
    state.wanderGoal=bounds?{
      x:Math.max(bounds.minX,Math.min(bounds.maxX,x)),
      y:Math.max(bounds.minY,Math.min(bounds.maxY,y)),
    }:{x,y};
    state.wanderUntil=now+3500+random()*3000;
    state.pauseUntil=now+400+random()*1000;
  }
  return now<state.pauseUntil?{x:bot.x,y:bot.y}:state.wanderGoal;
}

function responseGoal(state, source) {
  const {bearing,offset}=state.response;
  return {x:source.x+Math.cos(bearing+offset)*155,y:source.y+Math.sin(bearing+offset)*155};
}

// Local, event-driven alarm: no recursive squad broadcast or live target tracking.
// Keep roles stable under automatic fire; a death always gets a fresh broadcast.
function alertNearbyBots(victim, source, bots, now, killed=false) {
  if(!source || source.isBot)return;
  const victimState=victim.botState||(victim.botState={});
  if(!killed && now<(victimState.nextAlarmAt||0))return;
  victimState.nextAlarmAt=now+800;
  const nearby=bots.filter(b=>b.isBot&&b.alive&&
    Math.hypot(b.x-victim.x,b.y-victim.y,((b.height||0)-(victim.height||0))*20)<=520)
    .sort((a,b)=>String(a.id).localeCompare(String(b.id)));
  const bearing=Math.atan2(victim.y-source.y,victim.x-source.x);
  nearby.forEach((bot,index)=>{
    const state=bot.botState||(bot.botState={});
    state.lastSeen={id:source.id,x:source.x,y:source.y,height:source.height||0,seenAt:now};
    if(state.response?.id!==source.id || now>=state.response.until) {
      state.response={id:source.id,bearing,offset:[0,-1.15,1.15][index%3],until:now+10000};
      state.squadPath=null;state.squadRepathAt=0;
    }
    state.response.until=now+10000;state.response.arrived=false;
    state.searchUntil=null;state.pauseUntil=0;state.mode='investigate';
  });
}
module.exports={perceive,chooseIntent,angleDelta,alertNearbyBots};
