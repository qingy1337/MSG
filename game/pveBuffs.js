const BUFFS=['infiniteGrenades','rapidFire','automaticPistol','doubleHealth'];

function rollPveBuff(seed,floor) {
  let value=(Number(seed)>>>0)^Math.imul(Number(floor)>>>0,0x9e3779b1);
  value^=value>>>16;value=Math.imul(value,0x7feb352d);
  value^=value>>>15;value=Math.imul(value,0x846ca68b);
  value^=value>>>16;
  value>>>=0;
  return value%10===0?BUFFS[Math.floor(value/10)%BUFFS.length]:null;
}

function weaponCooldown(base,buff,stats=null,mode='pve') {
  return require('../public/armor').weaponInterval(base,stats,mode,buff==='rapidFire');
}

module.exports={BUFFS,rollPveBuff,weaponCooldown};
