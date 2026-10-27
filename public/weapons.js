// Centralized weapon registry for easy extension
// Each weapon defines how it looks and fires
// Keys are used across client/server messages

const WEAPONS = {
  shotgun: {
    key: 'shotgun', name: 'Shotgun',
    description: 'Eight-pellet hitscan blast.',
    weaponLength: 44, bulletSpeed: 14, bulletRadius: 3,
    // Both loaded barrels may be fired back-to-back. The reload gate below is
    // still authoritative once the second shot has been spent.
    cooldownMs: 0, shotsPerReload: 2, reloadMs: 1580, automatic: false,
  },
  pistol: {
    key: 'pistol',
    name: 'Pistol',
    description: 'Single-shot sidearm.',
    selectable: false,
    weaponLength: 30,
    bulletSpeed: 11.5,
    bulletRadius: 5,
    cooldownMs: 75,
    bloom: {baseRadians:0,movingRadians:0.012,airborneRadians:0.022,settleMs:180},
    automatic: false,
  },
  autoRifle: {
    key: 'autoRifle',
    name: 'Auto-Rifle',
    description: 'Hold mouse to fire a stream.',
    weaponLength: 40,
    bulletSpeed: 12,
    bulletRadius: 4,
    // A dependable mid-range primary: less burst than the shotgun and less
    // close-range output than the minigun, but immediately ready and steady.
    cooldownMs: 80,
    bloom: {baseRadians:0,movingRadians:0.019,airborneRadians:0.032,settleMs:240},
    automatic: true,
  },
  miniGun: {
    key: 'miniGun',
    name: 'Mini-Gun',
    description: 'Weapon of math destruction',
    weaponLength: 20,
    bulletSpeed: 14,
    bulletRadius: 5,
    // Its close-range damage stays heavy, but it must spool before firing and
    // cannot turn a high-refresh display into a higher fire rate.
    spinUpMs: 200,
    triggerReleaseMs: 150,
    cooldownMs: 16,
    bloom: {baseRadians:0.018,movingRadians:0.042,airborneRadians:0.058,settleMs:280},
    automatic: true,
  },
  sniper: {
    key: 'sniper',
    name: 'Sniper',
    description: 'High-damage precision hitscan. Slow rate.',
    weaponLength: 50, // visibly longer than pistol/auto
    bulletSpeed: 16,  // faster bullets
    bulletRadius: 10, // ~2x size
    cooldownMs: 1100,
    bloom: {
      movingRadians: 0.05,
      airborneRadians: 0.09,
      settleMs: 420,
    },
    automatic: false,
  },
};

function weaponBloomRadians(weapon,player,now) {
  const bloom=WEAPONS[weapon]?.bloom;
  if(!player||!bloom)return 0;
  if(player.knockback||player.jumpStartedAt!=null||
    (player.height||0)>(player.groundHeight||0)+0.05)return bloom.airborneRadians;
  const elapsed=now-(player.lastMovementAt??-Infinity);
  const moving=Math.max(0,Math.min(1,1-elapsed/bloom.settleMs));
  const base=bloom.baseRadians||0;
  return base+(bloom.movingRadians-base)*moving;
}

const sniperBloomRadians=(player,now)=>weaponBloomRadians('sniper',player,now);

function spreadWeaponAim(angle,pitch,spread,random=Math.random) {
  if(!(spread>0))return {angle,pitch};
  const radius=spread*Math.sqrt(Math.max(0,Math.min(1,random())));
  const theta=random()*Math.PI*2;
  return {
    angle:angle+Math.cos(theta)*radius,
    pitch:Math.max(-1.35,Math.min(1.35,pitch+Math.sin(theta)*radius)),
  };
}
const spreadSniperAim=spreadWeaponAim;

function sniperBloomPixels(spread,height,fovDegrees=68) {
  const projection=Math.max(1,height)/(2*Math.tan(fovDegrees*Math.PI/360));
  return 7+Math.tan(Math.max(0,spread))*projection;
}

// The pistol is always carried as a secondary, so new players choose a primary.
const DEFAULT_WEAPON_KEY = 'autoRifle';
const SECONDARY_WEAPON_KEY = 'pistol';
const WEAPON_SWITCH_MS = 360;

// Node (server) export
if (typeof module !== "undefined" && module.exports) {
  module.exports = { WEAPONS, DEFAULT_WEAPON_KEY, SECONDARY_WEAPON_KEY, WEAPON_SWITCH_MS,
    weaponBloomRadians,spreadWeaponAim,sniperBloomRadians,spreadSniperAim,sniperBloomPixels };
}
