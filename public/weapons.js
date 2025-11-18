// Centralized weapon registry for easy extension
// Each weapon defines how it looks and fires
// Keys are used across client/server messages

const WEAPONS = {
  pistol: {
    key: 'pistol',
    name: 'Pistol',
    description: 'Single-shot sidearm.',
    weaponLength: 30,
    bulletSpeed: 11.5,
    bulletRadius: 5,
    cooldownMs: 90,
    automatic: false,
  },
  autoRifle: {
    key: 'autoRifle',
    name: 'Auto-Rifle',
    description: 'Hold mouse to fire a stream.',
    weaponLength: 40,
    bulletSpeed: 12,
    bulletRadius: 4,
    cooldownMs: 90, // ~10 shots/second
    automatic: true,
  },
  miniGun: {
    key: 'miniGun',
    name: 'Mini-Gun',
    description: 'Weapon of math destruction',
    weaponLength: 20,
    bulletSpeed: 14,
    bulletRadius: 5,
    cooldownMs: 5, // ~10 shots/second
    automatic: true,
  },
  sniper: {
    key: 'sniper',
    name: 'Sniper',
    description: 'Big, fast bullets. Slow rate.',
    weaponLength: 50, // visibly longer than pistol/auto
    bulletSpeed: 16,  // faster bullets
    bulletRadius: 10, // ~2x size
    cooldownMs: 800,
    automatic: false,
  },
};

const DEFAULT_WEAPON_KEY = 'pistol';
