// Server-owned reactions to incoming damage. These stay in botState so the
// wire snapshot remains small; only the resulting movement is replicated.
const ENEMY_REACTIONS = Object.freeze({
  soldier: Object.freeze({ knockback: 1, fearThreshold: 0.22, fearDurationMs: 2200,
    retreatDistance: 260, retreatSpeed: 1.05, attackPause: 0.38 }),
  dread: Object.freeze({ knockback: 0.72, fearThreshold: 0.28, fearDurationMs: 1500,
    retreatDistance: 190, retreatSpeed: 0.96, attackPause: 0.25 }),
  ogre: Object.freeze({ knockback: 0.18, fearThreshold: 0.18, fearDurationMs: 900,
    retreatDistance: 105, retreatSpeed: 0.72, attackPause: 0.45 }),
});

const HIT_PROFILES = Object.freeze({
  miniGun: Object.freeze({ velocity: 7, duration: 65, staggerMs: 0, impulseCooldownMs: 100 }),
  autoRifle: Object.freeze({ velocity: 34, duration: 110, staggerMs: 35 }),
  pistol: Object.freeze({ velocity: 52, duration: 125, staggerMs: 55 }),
  sniper: Object.freeze({ velocity: 125, duration: 190, staggerMs: 130 }),
  shotgun: Object.freeze({ velocity: 30, damageVelocity: 0.7, duration: 175, staggerMs: 100 }),
  grenade: Object.freeze({ velocity: 90, damageVelocity: 0.55, duration: 240, staggerMs: 150 }),
  default: Object.freeze({ velocity: 42, duration: 110, staggerMs: 45 }),
});

const typeFor = bot => ENEMY_REACTIONS[bot?.botType] || ENEMY_REACTIONS.soldier;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

function applyHitPush(bot, source, weapon, damage, now) {
  if (!source || !Number.isFinite(source.x) || !Number.isFinite(source.y)) return;
  const profile = HIT_PROFILES[weapon] || HIT_PROFILES.default;
  const config = typeFor(bot);
  const state = bot.botState || (bot.botState = {});
  let dx = bot.x - source.x, dy = bot.y - source.y;
  let length = Math.hypot(dx, dy);
  if (length < 0.001) {
    const angle = Number.isFinite(source.angle) ? source.angle : 0;
    dx = Math.cos(angle); dy = Math.sin(angle); length = 1;
  }
  const velocity = Math.min(165, profile.velocity + (profile.damageVelocity || 0) * damage) * config.knockback;
  const existing = bot.knockback;
  // A rapid minigun stream must not stack into a comedy launch or erase a
  // stronger sniper/grenade shove. Replace only once the old impulse is weaker.
  const remaining = existing && now < existing.start + existing.duration
    ? Math.hypot(existing.vx, existing.vy) * (1 - (now - existing.start) / existing.duration)
    : 0;
  const throttled=profile.impulseCooldownMs&&state.lastHitPushWeapon===weapon&&
    now-(state.lastHitPushAt||0)<profile.impulseCooldownMs;
  if (!throttled && velocity > remaining + 0.001) {
    bot.knockback = { start: now, lastAt: now, duration: profile.duration,
      vx: dx / length * velocity, vy: dy / length * velocity, kind: 'hit' };
    state.lastHitPushAt=now;state.lastHitPushWeapon=weapon;
  }
  state.hitStaggerUntil = Math.max(state.hitStaggerUntil || 0,
    now + profile.staggerMs * Math.max(0.45, config.knockback));
}

function recordEnemyHit(bot, source, weapon, damage, now) {
  if (!bot?.isBot || !bot.alive || !(damage > 0)) return { fearStarted: false, fear: null };
  applyHitPush(bot, source, weapon, damage, now);
  const state = bot.botState || (bot.botState = {});
  const elapsed = Math.max(0, now - (state.damagePressureAt || now));
  // Recent damage has a 1.2 second half-life. Individual light hits are not
  // scary, while a genuine burst quickly crosses the type-specific threshold.
  state.damagePressure = (state.damagePressure || 0) * Math.pow(0.5, elapsed / 1200) + damage;
  state.damagePressureAt = now;
  const config = typeFor(bot);
  const maxHealth = Math.max(1, bot.maxHealth || bot.health || 80);
  const threshold = maxHealth * config.fearThreshold;
  if (state.damagePressure < threshold) return { fearStarted: false, fear: currentEnemyFear(bot, now) };

  const amount = clamp((state.damagePressure - threshold) / (maxHealth * 0.34), 0.2, 1);
  const duration = config.fearDurationMs * (0.7 + amount * 0.6);
  const previous = currentEnemyFear(bot, now);
  const fear = state.fear = {
    sourceX: Number.isFinite(source?.x) ? source.x : bot.x,
    sourceY: Number.isFinite(source?.y) ? source.y : bot.y,
    sourceId: source?.id,
    amount,
    until: Math.max(previous?.until || 0, now + duration),
  };
  state.fearAttackUntil = Math.max(state.fearAttackUntil || 0,
    now + duration * config.attackPause);
  if(!previous) { state.squadPath = null; state.squadRepathAt = 0; }
  return { fearStarted: !previous, fear };
}

function currentEnemyFear(bot, now) {
  const state = bot?.botState;
  if (!state?.fear) return null;
  if (now < state.fear.until) return state.fear;
  state.fear = null;
  return null;
}

function fearRetreatGoal(bot, now) {
  const fear = currentEnemyFear(bot, now);
  if (!fear) return null;
  const config = typeFor(bot);
  let dx = bot.x - fear.sourceX, dy = bot.y - fear.sourceY;
  let length = Math.hypot(dx, dy);
  if (length < 0.001) { dx = 1; dy = 0; length = 1; }
  // A small stable angle per bot fans a frightened group out instead of making
  // them overlap in one perfectly straight retreat line.
  const hash = [...String(bot.id || '')].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const offset = (hash % 2 ? 1 : -1) * 0.18;
  const cos = Math.cos(offset), sin = Math.sin(offset);
  const ux = dx / length, uy = dy / length;
  const distance = config.retreatDistance * (0.45 + fear.amount * 0.55);
  return { x: bot.x + (ux * cos - uy * sin) * distance,
    y: bot.y + (ux * sin + uy * cos) * distance,
    speed: config.retreatSpeed, amount: fear.amount };
}

function enemyCanAttack(bot, now) {
  return now >= (bot?.botState?.fearAttackUntil || 0);
}

module.exports = { ENEMY_REACTIONS, HIT_PROFILES, recordEnemyHit, currentEnemyFear,
  fearRetreatGoal, enemyCanAttack };
