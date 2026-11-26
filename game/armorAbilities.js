const {effects,GRENADE_REFILL_MS}=require('../public/armor');

function advanceArmorAbilities(players,rules,now) {
  let changed=false;
  for(const player of players) {
    if(player.isBot||!player.alive||!effects(player.armorStats,rules).grenadeRefill)continue;
    if(!Number.isFinite(player.grenadeRefillAt)) {
      player.grenadeRefillAt=now+GRENADE_REFILL_MS;
      changed=true;
    }
    if(now<player.grenadeRefillAt)continue;
    player.grenades=3;
    // Keep the original cadence across floors and delayed server ticks.
    // Missed intervals refill once rather than stacking extra grenades.
    player.grenadeRefillAt+=(Math.floor((now-player.grenadeRefillAt)/GRENADE_REFILL_MS)+1)*GRENADE_REFILL_MS;
    changed=true;
  }
  return changed;
}

module.exports={advanceArmorAbilities};
