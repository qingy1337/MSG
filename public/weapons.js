// Centralized weapon registry for easy extension
// Each weapon defines how it looks and fires
// Keys are used across client/server messages

const WEAPONS = {
  shotgun: {
    key: 'shotgun', name: 'Shotgun',
    description: 'Eight-pellet hitscan blast.',
    weaponLength: 44, bulletSpeed: 14, bulletRadius: 3,
    cooldownMs: 180, shotsPerReload: 2, reloadMs: 1400, automatic: false,
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
    automatic: false,
  },
  autoRifle: {
    key: 'autoRifle',
    name: 'Auto-Rifle',
    description: 'Hold mouse to fire a stream.',
    weaponLength: 40,
    bulletSpeed: 12,
    bulletRadius: 4,
    cooldownMs: 70,
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

function sniperBloomRadians(player, now) {
  const bloom=WEAPONS.sniper.bloom;
  if(!player)return 0;
  if(player.knockback||player.jumpStartedAt!=null||
    (player.height||0)>(player.groundHeight||0)+0.05)return bloom.airborneRadians;
  const elapsed=now-(player.lastMovementAt??-Infinity);
  return bloom.movingRadians*Math.max(0,Math.min(1,1-elapsed/bloom.settleMs));
}

function spreadSniperAim(angle,pitch,spread,random=Math.random) {
  if(!(spread>0))return {angle,pitch};
  const radius=spread*Math.sqrt(Math.max(0,Math.min(1,random())));
  const theta=random()*Math.PI*2;
  return {
    angle:angle+Math.cos(theta)*radius,
    pitch:Math.max(-1.35,Math.min(1.35,pitch+Math.sin(theta)*radius)),
  };
}

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
    sniperBloomRadians,spreadSniperAim,sniperBloomPixels };
}
