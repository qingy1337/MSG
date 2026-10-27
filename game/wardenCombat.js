const TAU=Math.PI*2;

const WARDEN_PRESSURE_DEFAULTS=Object.freeze({
  kind:'forgePressureSweep',
  entryDelayMs:500,
  windupMs:1300,
  sweepMs:1100,
  cooldownMs:4800,
  radius:310,
  minRadius:48,
  arcWidth:.72,
  heightTolerance:7,
  damage:34,
  knockback:240,
  direction:1,
  sourceId:'red-vault-core',
  crownId:'vault-rotating-crown',
});

function finite(value,fallback,min=0) {
  return Number.isFinite(value)?Math.max(min,value):fallback;
}

function pressureConfig(source={}) {
  const result={...WARDEN_PRESSURE_DEFAULTS,...source};
  result.entryDelayMs=finite(result.entryDelayMs,WARDEN_PRESSURE_DEFAULTS.entryDelayMs);
  result.windupMs=finite(result.windupMs,WARDEN_PRESSURE_DEFAULTS.windupMs);
  result.sweepMs=finite(result.sweepMs,WARDEN_PRESSURE_DEFAULTS.sweepMs,1);
  result.cooldownMs=finite(result.cooldownMs,WARDEN_PRESSURE_DEFAULTS.cooldownMs);
  result.radius=finite(result.radius,WARDEN_PRESSURE_DEFAULTS.radius,1);
  result.minRadius=Math.min(result.radius,finite(result.minRadius,WARDEN_PRESSURE_DEFAULTS.minRadius));
  result.arcWidth=Math.min(Math.PI,finite(result.arcWidth,WARDEN_PRESSURE_DEFAULTS.arcWidth,.05));
  result.heightTolerance=finite(result.heightTolerance,WARDEN_PRESSURE_DEFAULTS.heightTolerance,.1);
  result.damage=finite(result.damage,WARDEN_PRESSURE_DEFAULTS.damage);
  result.knockback=finite(result.knockback,WARDEN_PRESSURE_DEFAULTS.knockback);
  result.direction=result.direction<0?-1:1;
  return result;
}

function phaseForHealth(phases,ratio) {
  const authored=Array.isArray(phases)&&phases.length?phases.slice(0,3):[
    {minHealthRatio:.66},{minHealthRatio:.33},{minHealthRatio:0},
  ];
  const clamped=Math.max(0,Math.min(1,Number(ratio)||0));
  for(let index=0;index<authored.length;index++) {
    const threshold=Number.isFinite(authored[index]?.minHealthRatio)?authored[index].minHealthRatio:
      Math.max(0,1-(index+1)/authored.length);
    if(clamped>threshold||index===authored.length-1)return index+1;
  }
  return authored.length;
}

function wrapPositive(angle) {
  return ((angle%TAU)+TAU)%TAU;
}

function crossedBySweep(angle,startAngle,fromProgress,toProgress,direction,arcWidth) {
  const relative=direction>0?wrapPositive(angle-startAngle):wrapPositive(startAngle-angle);
  const from=Math.max(0,Math.min(1,fromProgress))*TAU-arcWidth/2;
  const to=Math.max(0,Math.min(1,toProgress))*TAU+arcWidth/2;
  return [relative,relative+TAU].some(value=>value>=from&&value<=to);
}

function publicAttack(bot,attack,event,now,extra={}) {
  return {bossId:bot.id,event,kind:attack.kind,combatPhase:attack.combatPhase,
    attackPhase:attack.phase,startedAt:attack.startedAt,windupMs:attack.windupMs,
    sweepMs:attack.sweepMs,originX:attack.originX,originY:attack.originY,
    originHeight:attack.originHeight,radius:attack.radius,minRadius:attack.minRadius,
    startAngle:attack.startAngle,direction:attack.direction,arcWidth:attack.arcWidth,
    sourceId:attack.sourceId,crownId:attack.crownId,serverNow:now,...extra};
}

function cancelWardenPressure(bot,now,emit=()=>{},reason='phase-change') {
  const attack=bot?.wardenAttack;if(!attack)return false;
  emit(publicAttack(bot,attack,'cancel',now,{reason}));
  bot.wardenAttack=null;
  const state=bot.botState||(bot.botState={});
  state.wardenPressureHits=null;state.wardenSweepProgress=0;
  return true;
}

function cancelWardenImpact(bot,now,emit=()=>{},reason='phase-change') {
  const attack=bot?.wardenImpact;if(!attack)return false;
  emit({bossId:bot.id,event:'cancel',kind:'forgeTargetBurst',reason,serverNow:now});
  bot.wardenImpact=null;return true;
}

// Each marked blast locks a position before detonation. The target can dodge,
// teammates can see the same warning, and solid cover blocks the splash.
function tickWardenImpact(bot,target,players,phaseDefinition,now,callbacks={}) {
  const config=phaseDefinition?.impact,state=bot.botState||(bot.botState={});
  if(!config)return {active:false,suppressFire:false};
  const windupMs=Math.max(650,Number(config.windupMs)||1400);
  const intervalMs=Math.max(350,Number(config.intervalMs)||650);
  const cooldownMs=Math.max(1800,Number(config.cooldownMs)||4900);
  const count=Math.max(1,Math.min(3,Number(config.count)||1));
  const radius=Math.max(40,Number(config.radius)||130);
  const emit=callbacks.emit||(()=>{});
  let attack=bot.wardenImpact;
  if(!attack) {
    if(!target||callbacks.visible===false||now<(state.wardenImpactReadyAt||0))
      return {active:false,suppressFire:false};
    attack=bot.wardenImpact={kind:'forgeTargetBurst',phase:'charge',combatPhase:bot.wardenPhase||1,
      index:0,count,originX:target.x,originY:target.y,originHeight:target.height||0,
      startedAt:now,activeAt:now+windupMs,windupMs,radius};
    bot.dreadAttack=null;
    emit({bossId:bot.id,event:'start',kind:attack.kind,attackPhase:'charge',combatPhase:attack.combatPhase,
      originX:attack.originX,originY:attack.originY,originHeight:attack.originHeight,
      radius,windupMs,startedAt:now,serverNow:now});
  }
  if(now<attack.activeAt)return {active:true,suppressFire:true,lockMovement:true};
  const origin={x:attack.originX,y:attack.originY,height:attack.originHeight};
  for(const player of players||[]) {
    if(!player?.alive||player.isBot||
      Math.hypot(player.x-origin.x,player.y-origin.y)>radius||
      Math.abs((player.height||0)-origin.height)>(Number(config.heightTolerance)||6))continue;
    if(callbacks.canHit&&!callbacks.canHit(player,origin))continue;
    callbacks.impact?.(player,Number(config.damage)||24,Number(config.knockback)||170,origin);
  }
  emit({bossId:bot.id,event:'impact',kind:attack.kind,originX:origin.x,originY:origin.y,
    originHeight:origin.height,radius,serverNow:now});
  attack.index++;
  const next=(players||[]).filter(player=>player?.alive&&!player.isBot)
    .sort((a,b)=>Math.hypot(a.x-bot.x,a.y-bot.y)-Math.hypot(b.x-bot.x,b.y-bot.y))[0];
  if(attack.index<count&&next) {
    Object.assign(attack,{originX:next.x,originY:next.y,originHeight:next.height||0,
      startedAt:now,activeAt:now+intervalMs+windupMs});
    emit({bossId:bot.id,event:'start',kind:attack.kind,attackPhase:'charge',combatPhase:attack.combatPhase,
      originX:attack.originX,originY:attack.originY,originHeight:attack.originHeight,
      radius,windupMs:intervalMs+windupMs,startedAt:now,serverNow:now});
    return {active:true,suppressFire:true,lockMovement:true};
  }
  bot.wardenImpact=null;state.wardenImpactReadyAt=now+cooldownMs;
  return {active:false,suppressFire:true,lockMovement:false};
}

// The sweep performs at most one bounded player pass per server tick and at
// most one LOS/damage resolution per player per attack. Internal hit tracking
// stays off the wire; clients receive the compact telegraph on transitions and
// the current angle/progress through ordinary actor frames.
function tickWardenPressure(bot,target,players,phaseDefinition,now,callbacks={}) {
  const source=phaseDefinition?.pressure;
  if(!source)return {active:false,suppressFire:false,lockMovement:false};
  const config=pressureConfig(source),state=bot.botState||(bot.botState={});
  const emit=callbacks.emit||(()=>{}),combatPhase=bot.wardenPhase||1;
  let attack=bot.wardenAttack;
  if(attack&&attack.combatPhase!==combatPhase) {
    cancelWardenPressure(bot,now,emit);attack=null;
  }
  if(!attack) {
    if(!target||callbacks.visible===false||now<(state.wardenPressureReadyAt||0))
      return {active:false,suppressFire:false,lockMovement:false};
    const aim=Math.atan2(target.y-bot.y,target.x-bot.x);
    attack=bot.wardenAttack={kind:config.kind,phase:'charge',combatPhase,startedAt:now,
      activeAt:now+config.windupMs,endAt:now+config.windupMs+config.sweepMs,
      windupMs:config.windupMs,sweepMs:config.sweepMs,originX:bot.x,originY:bot.y,
      originHeight:bot.height||0,radius:config.radius,minRadius:config.minRadius,
      startAngle:aim,direction:config.direction,arcWidth:config.arcWidth,
      angle:aim,progress:0,sourceId:config.sourceId,crownId:config.crownId};
    state.wardenPressureHits=new Set();state.wardenSweepProgress=0;
    bot.dreadAttack=null;
    emit(publicAttack(bot,attack,'start',now));
    return {active:true,suppressFire:true,lockMovement:true,aimAngle:aim};
  }

  if(now<attack.activeAt) {
    attack.phase='charge';attack.progress=Math.max(0,Math.min(1,
      (now-attack.startedAt)/Math.max(1,attack.windupMs)));
    return {active:true,suppressFire:true,lockMovement:true,aimAngle:attack.startAngle};
  }

  if(attack.phase!=='sweep') {
    attack.phase='sweep';attack.progress=0;
    emit(publicAttack(bot,attack,'sweep',now));
  }
  const previous=state.wardenSweepProgress||0;
  const progress=Math.max(previous,Math.min(1,(now-attack.activeAt)/Math.max(1,attack.sweepMs)));
  attack.progress=progress;
  attack.angle=attack.startAngle+attack.direction*TAU*progress;
  const hitIds=state.wardenPressureHits instanceof Set?state.wardenPressureHits:
    (state.wardenPressureHits=new Set());
  const origin={x:attack.originX,y:attack.originY,height:attack.originHeight};
  for(const player of players||[]) {
    if(!player?.alive||player.isBot||hitIds.has(player.id))continue;
    const dx=player.x-origin.x,dy=player.y-origin.y,distance=Math.hypot(dx,dy);
    if(distance<attack.minRadius||distance>attack.radius||
      Math.abs((player.height||0)-origin.height)>config.heightTolerance)continue;
    const angle=Math.atan2(dy,dx);
    if(!crossedBySweep(angle,attack.startAngle,previous,progress,attack.direction,attack.arcWidth))continue;
    if(callbacks.canHit&&!callbacks.canHit(player,origin))continue;
    hitIds.add(player.id);
    callbacks.impact?.(player,config.damage,config.knockback,origin,angle);
  }
  state.wardenSweepProgress=progress;
  if(progress>=1||now>=attack.endAt) {
    emit(publicAttack(bot,attack,'end',now,{hitCount:hitIds.size}));
    bot.wardenAttack=null;state.wardenPressureHits=null;state.wardenSweepProgress=0;
    state.wardenPressureReadyAt=now+config.cooldownMs;
    return {active:false,suppressFire:true,lockMovement:false,aimAngle:attack.angle};
  }
  return {active:true,suppressFire:true,lockMovement:true,aimAngle:attack.angle};
}

module.exports={WARDEN_PRESSURE_DEFAULTS,pressureConfig,phaseForHealth,crossedBySweep,
  tickWardenPressure,cancelWardenPressure,tickWardenImpact,cancelWardenImpact};
