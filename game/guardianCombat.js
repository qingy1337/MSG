const {rayBox}=require('./hitscan');

const GUARDIAN_COMBAT=Object.freeze({
  chargeMs:900,
  burstShots:3,
  shotIntervalMs:260,
  recoveryMs:2600,
  projectileSpeed:285,
  gravity:260,
  maxDamage:30,
  blastRadius:120,
  // A close blast should throw a player clear of the impact, not merely
  // jitter them. Lower splash damage still produces a much smaller shove.
  knockbackBase:120,
  knockbackDamageScale:4,
  knockbackDeceleration:420,
  knockbackMaxSpeed:360,
});
const PROJECTILE_RADIUS=5;

function tickGuardianBurst(bot,target,visible,aligned,now,launch) {
  const state=bot.botState||(bot.botState={});
  let attack=bot.guardianAttack;
  if(attack&&attack.targetId!==target?.id&&attack.phase==='charge')attack=bot.guardianAttack=null;
  if(!attack) {
    if(!target||!visible||!aligned||now<(state.guardianReadyAt||0))return false;
    attack=bot.guardianAttack={phase:'charge',targetId:target.id,targetX:target.x,targetY:target.y,targetHeight:target.height||0,start:now,
      fireAt:now+GUARDIAN_COMBAT.chargeMs,nextShotAt:now+GUARDIAN_COMBAT.chargeMs,shots:0,progress:0};
    return true;
  }
  if(attack.phase==='charge') {
    if(!target||!visible){bot.guardianAttack=null;state.guardianReadyAt=now+500;return false;}
    attack.targetX=target.x;attack.targetY=target.y;attack.targetHeight=target.height||0;
    attack.progress=Math.min(1,(now-attack.start)/GUARDIAN_COMBAT.chargeMs);
    if(now<attack.fireAt)return true;
    attack.phase='burst';attack.progress=0;
  }
  while(attack.shots<GUARDIAN_COMBAT.burstShots&&now>=attack.nextShotAt) {
    const victim=target&&target.id===attack.targetId?target:{id:attack.targetId,x:attack.targetX,y:attack.targetY,height:attack.targetHeight,alive:true};
    launch(victim,attack.shots);
    attack.shots++;attack.progress=attack.shots/GUARDIAN_COMBAT.burstShots;
    attack.nextShotAt+=GUARDIAN_COMBAT.shotIntervalMs;
  }
  if(attack.shots>=GUARDIAN_COMBAT.burstShots) {
    bot.guardianAttack=null;state.guardianReadyAt=now+GUARDIAN_COMBAT.recoveryMs;
  }
  return true;
}

function launchGuardianProjectile(bot,target,now,id) {
  const x=bot.x+Math.cos(bot.angle||0)*22,y=bot.y+Math.sin(bot.angle||0)*22;
  const height=(bot.height||0)+(bot.hoverOffset||0)+1.25;
  const dx=target.x-x,dy=target.y-y,distance=Math.max(1,Math.hypot(dx,dy));
  const flight=Math.max(.42,Math.min(1.45,distance/GUARDIAN_COMBAT.projectileSpeed));
  const targetHeight=(target.height||0)+.18;
  const vz=((targetHeight-height)/.05+.5*GUARDIAN_COMBAT.gravity*flight*flight)/flight;
  return {id,ownerId:bot.id,x,y,height,vx:dx/flight,vy:dy/flight,vz,
    expiresAt:now+2600,updatedAt:now};
}

function geometry(map,walls) {
  return [...walls,...map.terrain,...[map.elevator,map.arrivalElevator].filter(Boolean)
    .map(e=>({...e,bottom:e.ceiling,top:e.ceiling+.12}))];
}

function expanded(s) {
  if(s.kind==='heightfield')return s;
  return {...s,x:s.x-PROJECTILE_RADIUS,y:s.y-PROJECTILE_RADIUS,
    width:s.width+PROJECTILE_RADIUS*2,height:s.height+PROJECTILE_RADIUS*2,
    bottom:(s.bottom??0)-PROJECTILE_RADIUS*.05,top:(s.top??3.1)+PROJECTILE_RADIUS*.05};
}

// Returns true on the first world/player impact. Substeps make a delayed
// server tick deterministic without allowing a fast orb to tunnel through a wall.
function stepGuardianProjectile(p,now,map,walls,targets=[]) {
  const end=Math.min(now,p.expiresAt),solids=geometry(map,walls).map(expanded);
  let remaining=Math.max(0,(end-p.updatedAt)/1000);
  while(remaining>1e-8) {
    const dt=Math.min(remaining,1/120);remaining-=dt;p.vz-=GUARDIAN_COMBAT.gravity*dt;
    const dx=p.vx*dt,dy=p.vy*dt,dz=p.vz*dt*.05;
    let fraction=1;
    for(const solid of solids) {
      const hit=rayBox(p.x,p.y,dx,dy,solid,p.height,dz);
      if(hit>=0&&hit<=fraction)fraction=Math.max(0,hit-1e-5);
    }
    if(p.x+dx<PROJECTILE_RADIUS||p.x+dx>map.width-PROJECTILE_RADIUS||
      p.y+dy<PROJECTILE_RADIUS||p.y+dy>map.height-PROJECTILE_RADIUS||
      p.height+dz<PROJECTILE_RADIUS*.05||p.height+dz>(map.ceiling??100)-PROJECTILE_RADIUS*.05)fraction=0;
    for(const target of targets) {
      if(!target.alive||target.isBot)continue;
      const tx=p.x+dx*fraction,ty=p.y+dy*fraction,th=p.height+dz*fraction;
      const bottom=(target.height||0)+(target.hoverOffset||0),top=bottom+(target.bodyHeight||2.2);
      if(Math.hypot(tx-target.x,ty-target.y)<(target.bodyRadius||20)+PROJECTILE_RADIUS&&th>=bottom&&th<=top)fraction=0;
    }
    p.x+=dx*fraction;p.y+=dy*fraction;p.height+=dz*fraction;
    if(fraction<1){p.updatedAt=end;return true;}
  }
  p.updatedAt=end;
  return now>=p.expiresAt;
}

function guardianBlastDamage(projectile,target,map,walls) {
  const bottom=(target.height||0)+(target.hoverOffset||0),top=bottom+(target.bodyHeight||2.2);
  const height=Math.max(bottom,Math.min(top,projectile.height));
  const distance=Math.max(0,Math.hypot(target.x-projectile.x,target.y-projectile.y,(height-projectile.height)/.05)-(target.bodyRadius||20));
  if(distance>=GUARDIAN_COMBAT.blastRadius)return 0;
  const aim=(bottom+top)*.5;
  if(geometry(map,walls).some(s=>rayBox(projectile.x,projectile.y,target.x-projectile.x,target.y-projectile.y,
    s,projectile.height,aim-projectile.height)<1))return 0;
  return GUARDIAN_COMBAT.maxDamage*Math.pow(1-distance/GUARDIAN_COMBAT.blastRadius,1.65);
}

function guardianKnockbackSpeed(damage) {
  const amount=Math.max(0,Math.min(GUARDIAN_COMBAT.maxDamage,Number(damage)||0));
  return GUARDIAN_COMBAT.knockbackBase+amount*GUARDIAN_COMBAT.knockbackDamageScale;
}

module.exports={GUARDIAN_COMBAT,tickGuardianBurst,launchGuardianProjectile,stepGuardianProjectile,guardianBlastDamage,guardianKnockbackSpeed};
