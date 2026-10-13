const DREAD_COMBAT = Object.freeze({
  chargeMs: 550,
  shotIntervalMs: 170,
  burstShots: 3,
  recoveryMs: 1050,
  damage: 9,
});

// Dread Troopers expose this tiny state machine to clients so their otherwise
// instant hitscan burst has a clear, red warning beam and audible-looking
// charge window. Losing line of sight cancels the attack before it can fire.
function tickDreadCarbine(bot, target, visible, aligned, now) {
  const state=bot.botState||(bot.botState={});
  let attack=bot.dreadAttack;
  if(!target||!visible) {
    if(attack)bot.dreadAttack=null;
    return false;
  }
  if(attack?.targetId!==target.id) {bot.dreadAttack=null;attack=null;}
  if(!attack) {
    if(!aligned||now<(state.dreadReadyAt||0))return false;
    attack=bot.dreadAttack={phase:'charge',targetId:target.id,start:now,
      fireAt:now+DREAD_COMBAT.chargeMs,nextShotAt:now+DREAD_COMBAT.chargeMs,shots:0,progress:0};
    return false;
  }
  if(attack.phase==='charge') {
    attack.progress=Math.min(1,(now-attack.start)/DREAD_COMBAT.chargeMs);
    if(now<attack.fireAt)return false;
    attack.phase='burst';attack.progress=0;
  }
  return aligned&&attack.shots<DREAD_COMBAT.burstShots&&now>=attack.nextShotAt;
}

function recordDreadShot(bot,now) {
  const attack=bot.dreadAttack;
  if(!attack)return;
  attack.shots++;
  attack.progress=attack.shots/DREAD_COMBAT.burstShots;
  attack.nextShotAt=now+DREAD_COMBAT.shotIntervalMs;
  if(attack.shots>=DREAD_COMBAT.burstShots) {
    bot.dreadAttack=null;
    bot.botState.dreadReadyAt=now+DREAD_COMBAT.recoveryMs;
  }
}

module.exports={DREAD_COMBAT,tickDreadCarbine,recordDreadShot};
