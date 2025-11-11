// Centralized weapon registry for easy extension
// Each weapon defines how it looks and fires
// Keys are used across client/server messages

const WEAPONS = {
  pistol: {
    key: 'pistol',
    name: 'Pistol',
    description: 'Single-shot sidearm. Balanced default.',
    weaponLength: 30,
    bulletSpeed: 10,
    bulletRadius: 5,
    cooldownMs: 0,
    automatic: false,
  },
  autoRifle: {
    key: 'autoRifle',
    name: 'Auto-Rifle',
    description: 'Hold mouse to fire a stream.',
    weaponLength: 40,
    bulletSpeed: 12,
    bulletRadius: 6,
    cooldownMs: 80, // ~10 shots/second
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
