// Horizontal speed uses arena units; vertical motion uses rendered world units.
// Slightly stronger takeoff preserves jump height while gravity speeds up landing.
const MOVEMENT = Object.freeze({ speed: 170, radius: 16, mouseSensitivity: 0.0011, jumpSpeed: 7.24, gravity: 21 });

function advanceJump(player, now) {
  if (player.jumpStartedAt == null) return false;
  const seconds = Math.max(0, (now - player.jumpStartedAt) / 1000);
  const velocity = player.jumpVelocity ?? MOVEMENT.jumpSpeed;
  const floor = player.groundHeight || 0;
  player.height = (player.jumpBase || 0) + velocity * seconds - 0.5 * MOVEMENT.gravity * seconds * seconds;
  const headroom=(player.ceilingHeight ?? Infinity)-2.2;
  if(player.height>headroom) {
    player.height=headroom;player.jumpBase=headroom;player.jumpVelocity=0;player.jumpStartedAt=now;
    return true;
  }
  if (player.height <= floor && seconds > 0 && velocity - MOVEMENT.gravity * seconds <= 0) {
    player.height = floor;
    player.jumpStartedAt = null;
    player.platformId = player.groundPlatformId || null;
  }
  return true;
}

function startJump(player, now) {
  advanceJump(player, now);
  if (!player.alive || player.jumpStartedAt != null) return false;
  player.jumpStartedAt = now;
  player.jumpPlatformId = player.platformId || null;
  player.platformId = null;
  player.jumpBase = player.height || 0;
  player.jumpVelocity = MOVEMENT.jumpSpeed;
  return true;
}

if (typeof module !== 'undefined' && module.exports) module.exports = { MOVEMENT, advanceJump, startJump };
