// Deliberately forgiving defaults for first-person hitscan combat.
const BOT_COMBAT = Object.freeze({
  reactionMs: 750,
  shotIntervalMs: 240,
  burstShots: 3,
  burstRestMs: 1100,
  aimSpread: 0.16,
  damageScale: 0.65,
  health: 80,
});

function readyToShoot(state, targetId, visible, now) {
  if (!visible) {
    state.combatTarget = null;
    state.readyAt = 0;
    state.burstShots = 0;
    return false;
  }
  if (state.combatTarget !== targetId) {
    state.combatTarget = targetId;
    state.readyAt = now + BOT_COMBAT.reactionMs;
    state.burstShots = 0;
  }
  return now >= state.readyAt && now >= (state.restUntil || 0) &&
    now - (state.lastShotAt ?? -Infinity) >= BOT_COMBAT.shotIntervalMs;
}

function recordShot(state, now) {
  state.lastShotAt = now;
  state.burstShots = (state.burstShots || 0) + 1;
  if (state.burstShots >= BOT_COMBAT.burstShots) {
    state.burstShots = 0;
    state.restUntil = now + BOT_COMBAT.burstRestMs;
  }
}

module.exports = { BOT_COMBAT, readyToShoot, recordShot };
