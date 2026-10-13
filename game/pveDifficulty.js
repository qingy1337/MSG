const { traceShot } = require('./hitscan');

function floorDifficulty(floor, baseCount = 4) {
  const level = Math.max(1, Math.floor(floor || 1));
  // Floor 21 begins the elite phase. Smaller, fixed-size waves avoid turning
  // later floors into a network/CPU stress test; individual enemies become
  // tougher instead. Health keeps climbing for a while so progression does
  // not simply stop at the old floor-20 ceiling.
  if (level > 20) return { count: 10,
    health: Math.min(300, 220 + (level - 21) * 5),
    speed: 1.3,
    ogres: 4 };
  return { count: Math.min(24, baseCount + level - 1),
    health: Math.min(160, 80 + (level - 1) * 4),
    speed: Math.min(1.3, 1 + (level - 1) * 0.025),
    ogres: level < 5 ? 0 : Math.min(4, 1 + Math.floor((level - 5) / 3)) };
}

// Server-owned attacks: the laser follows its visible target, never through cover. Damage is
// integrated over the active interval, independent of the tick frequency.
function tickOgre(bot, target, players, walls, map, now, damage) {
  const state = bot.botState;
  let attack = bot.ogreAttack;
  // Once engaged, react to any nearby visible human, not only the laser's
  // original target. Melee can interrupt the beam or bypass its long recovery.
  // Keep its own cooldown so interrupts cannot create back-to-back impacts.
  let slamTarget=null,nearest=105;
  if((target||attack)&&attack?.kind!=='slam'&&now>=(state.slamReadyAt||0)) {
    for(const p of players) {
      if(!p.alive||p.isBot)continue;
      const distance=Math.hypot(p.x-bot.x,p.y-bot.y);
      const floor=p.jumpStartedAt!=null?(p.groundHeight??p.height??0):(p.height||0);
      if(distance>nearest||Math.abs(floor-(bot.height||0))>=1)continue;
      const pitch=Math.atan2((p.height||0)+.4-(bot.height||0)-.4,distance*.05);
      if(traceShot({...bot,eyeHeight:.4},Math.atan2(p.y-bot.y,p.x-bot.x),walls,[p],()=>true,pitch,map).targetId!==p.id)continue;
      slamTarget=p;nearest=distance;
    }
  }
  if (slamTarget || (!attack && target && now >= (state.ogreReadyAt || 0))) {
    const slam=!!slamTarget, victim=slamTarget||target;
    attack = bot.ogreAttack = { kind: slam ? 'slam' : 'laser', start: now,
      targetId: victim.id,
      windup: slam ? 1000 : 1500, duration: slam ? 900 : 4000,
      angle: Math.atan2(victim.y-bot.y,victim.x-bot.x),
      pitch: Math.atan2((victim.height||0)+1.1-(bot.height||0)-2.8,Math.hypot(victim.x-bot.x,victim.y-bot.y)*0.05),
      phase: 'charge', progress: 0 };
    if(slam)state.slamReadyAt=now+attack.windup+attack.duration+1000;
    state.ogreTickAt = now;
  }
  if (!attack) return false;
  const activeAt = attack.start + attack.windup, end = activeAt + attack.duration;
  attack.phase = now < activeAt ? 'charge' : 'fire';
  attack.progress = Math.min(1,Math.max(0,(now-(now<activeAt?attack.start:activeAt))/(now<activeAt?attack.windup:attack.duration)));
  const emitter = {...bot, eyeHeight: 2.8};
  if (attack.kind === 'laser') {
    const tracked=players.find(p=>p.id===attack.targetId && p.alive && !p.isBot);
    if(tracked) {
      const distance=Math.hypot(tracked.x-bot.x,tracked.y-bot.y);
      const yaw=Math.atan2(tracked.y-bot.y,tracked.x-bot.x);
      const pitch=Math.atan2((tracked.height||0)+1.1-(bot.height||0)-2.8,distance*0.05);
      const visible=distance<=650 && traceShot(emitter,yaw,walls,[tracked],()=>true,pitch,map).targetId===tracked.id;
      if(visible) {
        // About 52 degrees/second: follows running/jumping targets but cannot
        // instantly snap around. Cap catch-up after a delayed server tick.
        const turn=0.9*Math.min(0.1,Math.max(0,(now-state.ogreTickAt)/1000));
        const delta=Math.atan2(Math.sin(yaw-attack.angle),Math.cos(yaw-attack.angle));
        attack.angle+=Math.max(-turn,Math.min(turn,delta));
        attack.pitch+=Math.max(-turn,Math.min(turn,pitch-attack.pitch));
      }
    }
    attack.beam = traceShot(emitter,attack.angle,walls,players,p=>!p.isBot,attack.pitch,map);
    const seconds = Math.max(0,Math.min(now,end)-Math.max(state.ogreTickAt,activeAt))/1000;
    if (seconds && attack.beam.targetId) damage(attack.beam.targetId,15*seconds);
  } else if (now >= activeAt && !attack.impacted) {
    attack.impacted = true;
    for (const p of players) {
      if (!p.alive || p.isBot || Math.hypot(p.x-bot.x,p.y-bot.y)>105 || Math.abs((p.height||0)-(bot.height||0))>0.7) continue;
      const distance=Math.hypot(p.x-bot.x,p.y-bot.y);
      const shot=traceShot({...bot,eyeHeight:0.4},Math.atan2(p.y-bot.y,p.x-bot.x),walls,[p],()=>true,
        Math.atan2((p.height||0)+0.4-(bot.height||0)-0.4,distance*0.05),map);
      if(shot.targetId===p.id) {
        damage(p.id,50);
        if(p.alive) {
          p.movementEpoch=(p.movementEpoch||0)+1;
          const angle=distance>0.01?Math.atan2(p.y-bot.y,p.x-bot.x):attack.angle;
          p.knockback={start:now,lastAt:now,duration:450,vx:Math.cos(angle)*320,vy:Math.sin(angle)*320};
        }
      }
    }
  }
  state.ogreTickAt = now;
  if(now>=end){
    bot.ogreAttack=null;
    state.ogreReadyAt=now+(attack.kind==='slam'?1000:2500);
    if(attack.kind==='slam')state.slamReadyAt=Math.max(state.slamReadyAt||0,now+1000);
  }
  return true;
}
module.exports = { floorDifficulty, tickOgre };
