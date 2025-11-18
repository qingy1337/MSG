// Helpers for drawing weapon skins both in-game and in shop previews.
// --------------------------------------------------------------------
// Weapon shapes are used to define the visual appearance of a weapon skin.
// Each shape object in the `shapes` array defines a geometric element to draw.
// Below are examples of valid shape configurations:
//
// Line (a straight line from one point to another):
// {
//   type: "line",
//   fromX: 0, fromY: 0,
//   toX: 1, toY: 0,
//   lineWidth: 3,
//   color: "#111827"
// }
//
// Rectangle (centered at cx, cy with given width and height):
// {
//   type: "rect",
//   cx: 0.5, cy: 0,
//   width: 0.2, height: 0.1,
//   color: "#111827"
// }
//
// Circle (centered at cx, cy with a given radius):
// {
//   type: "circle",
//   cx: 0.5, cy: 0,
//   radius: 0.1,
//   color: "#111827"
// }
//
// Arbitrary quadrilateral using 4 corners:
// {
//   type: "rectcoord",
//   topLeftX: 0,     topLeftY: -0.05,
//   topRightX: 1,    topRightY: -0.05,
//   bottomRightX: 1, bottomRightY: 0.05,
//   bottomLeftX: 0,  bottomLeftY: 0.05,
//   color: "#111827"
// }
//
// All coordinates are relative to the weapon length and rotated by the weapon angle.
// Colors can be any valid CSS color string.
// --------------------------------------------------------------------

function getDefaultSkinKeyByWeapon() {
  const map = {};
  if (typeof WEAPON_SKINS === "undefined") return map;
  Object.keys(WEAPON_SKINS).forEach((weaponKey) => {
    const skins = WEAPON_SKINS[weaponKey] || [];
    const def = skins.find((s) => s && s.isDefault) || skins[0];
    if (def && def.key) {
      map[weaponKey] = def.key;
    }
  });
  return map;
}

const DEFAULT_SKIN_BY_WEAPON = getDefaultSkinKeyByWeapon();

function getSkinConfig(weaponKey, skinKey) {
  if (typeof WEAPON_SKINS === "undefined") return null;
  const list = WEAPON_SKINS[weaponKey];
  if (!Array.isArray(list) || list.length === 0) return null;
  if (skinKey) {
    const match = list.find((s) => s && s.key === skinKey);
    if (match) return match;
  }
  const fallback =
    list.find((s) => s && s.isDefault) || list[0];
  return fallback || null;
}

function getDefaultSkinKey(weaponKey) {
  return (
    (DEFAULT_SKIN_BY_WEAPON && DEFAULT_SKIN_BY_WEAPON[weaponKey]) || null
  );
}

function getBulletColorForWeaponSkin(weaponKey, skinKey) {
  const skin = getSkinConfig(weaponKey, skinKey);
  if (skin && typeof skin.bulletColor === "string") {
    return skin.bulletColor;
  }
  return "#000000";
}

function getBulletColorForPlayer(player) {
  if (!player) return "#000000";
  const weaponKey =
    player.weapon ||
    (typeof DEFAULT_WEAPON_KEY !== "undefined"
      ? DEFAULT_WEAPON_KEY
      : "pistol");
  const skinKey =
    player.weaponSkinKey || getDefaultSkinKey(weaponKey);
  return getBulletColorForWeaponSkin(weaponKey, skinKey);
}

// Core shape renderer for a given weapon + skin.
function drawWeaponShapes(
  ctx,
  originX,
  originY,
  angle,
  weaponLength,
  weaponKey,
  skinKey,
) {
  if (!ctx) return;

  const length =
    typeof weaponLength === "number" && weaponLength > 0
      ? weaponLength
      : 30;

  const skin = getSkinConfig(
    weaponKey,
    skinKey || getDefaultSkinKey(weaponKey),
  );

  const shapes =
    skin && Array.isArray(skin.shapes) && skin.shapes.length > 0
      ? skin.shapes
      : [
          {
            type: "line",
            fromX: 0,
            fromY: 0,
            toX: 1,
            toY: 0,
            lineWidth: 3,
            color: "#111827",
          },
        ];

  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  function localToWorld(x, y) {
    return [
      originX + x * cos - y * sin,
      originY + x * sin + y * cos,
    ];
  }

  shapes.forEach((shape) => {
    if (!shape || typeof shape.type !== "string") return;
    if (shape.type === "line") {
      const fromX = (shape.fromX || 0) * length;
      const fromY = (shape.fromY || 0) * length;
      const toX = (shape.toX || 0) * length;
      const toY = (shape.toY || 0) * length;
      const [wx0, wy0] = localToWorld(fromX, fromY);
      const [wx1, wy1] = localToWorld(toX, toY);
      ctx.save();
      const lineWidth =
        typeof shape.lineWidth === "number" ? shape.lineWidth : 3;

      if (shape.outlineColor) {
        const outlineWidth =
          typeof shape.outlineWidth === "number"
            ? shape.outlineWidth
            : lineWidth + 1;
        ctx.strokeStyle = shape.outlineColor;
        ctx.lineWidth = outlineWidth;
        ctx.beginPath();
        ctx.moveTo(wx0, wy0);
        ctx.lineTo(wx1, wy1);
        ctx.stroke();
      }

      ctx.strokeStyle = shape.color || "#111827";
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      ctx.moveTo(wx0, wy0);
      ctx.lineTo(wx1, wy1);
      ctx.stroke();
      ctx.restore();
    } else if (shape.type === "rect") {
      const cx = (shape.cx || 0) * length;
      const cy = (shape.cy || 0) * length;
      const w = (shape.width || 0.2) * length;
      const h = (shape.height || 0.1) * length;
      const halfW = w / 2;
      const halfH = h / 2;
      const cornersLocal = [
        [cx - halfW, cy - halfH],
        [cx + halfW, cy - halfH],
        [cx + halfW, cy + halfH],
        [cx - halfW, cy + halfH],
      ];
      ctx.save();
      ctx.fillStyle = shape.color || "#111827";
      ctx.beginPath();
      cornersLocal.forEach(([lx, ly], idx) => {
        const [wx, wy] = localToWorld(lx, ly);
        if (idx === 0) ctx.moveTo(wx, wy);
        else ctx.lineTo(wx, wy);
      });
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    } else if (shape.type === "circle") {
      const cx = (shape.cx || 0) * length;
      const cy = (shape.cy || 0) * length;
      const radius =
        typeof shape.radius === "number"
          ? shape.radius * length
          : 0.1 * length;
      const [wx, wy] = localToWorld(cx, cy);
      ctx.save();
      ctx.fillStyle = shape.color || "#111827";
      ctx.beginPath();
      ctx.arc(wx, wy, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else if (shape.type === "rectcoord") {
      const tlx = (shape.topLeftX || 0) * length;
      const tly = (shape.topLeftY || 0) * length;
      const trx = (shape.topRightX || 0) * length;
      const tryY = (shape.topRightY || 0) * length;
      const blx = (shape.bottomLeftX || 0) * length;
      const bly = (shape.bottomLeftY || 0) * length;
      const brx = (shape.bottomRightX || 0) * length;
      const bry = (shape.bottomRightY || 0) * length;
      const cornersLocal = [
        [tlx, tly],
        [trx, tryY],
        [brx, bry],
        [blx, bly],
      ];
      ctx.save();
      ctx.fillStyle = shape.color || "#111827";
      ctx.beginPath();
      cornersLocal.forEach(([lx, ly], idx) => {
        const [wx, wy] = localToWorld(lx, ly);
        if (idx === 0) ctx.moveTo(wx, wy);
        else ctx.lineTo(wx, wy);
      });
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  });
}

// Draw the weapon for an in-game player.
function drawPlayerWeapon(ctx, player) {
  if (!ctx || !player) return;
  const weaponKey =
    player.weapon ||
    (typeof DEFAULT_WEAPON_KEY !== "undefined"
      ? DEFAULT_WEAPON_KEY
      : "pistol");
  const cfg =
    (typeof WEAPONS !== "undefined" && WEAPONS[weaponKey]) ||
    (typeof WEAPONS !== "undefined" && WEAPONS.pistol) || {
      weaponLength: 30,
    };
  const len =
    typeof cfg.weaponLength === "number" ? cfg.weaponLength : 30;
  drawWeaponShapes(
    ctx,
    player.x,
    player.y,
    player.angle || 0,
    len,
    weaponKey,
    player.weaponSkinKey || getDefaultSkinKey(weaponKey),
  );
}

// Draw a small horizontal preview of a weapon skin into a canvas.
function drawWeaponSkinPreview(canvas, weaponKey, skinKey) {
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvas.clientWidth || canvas.width || 140;
  const cssHeight = canvas.clientHeight || canvas.height || 70;

  canvas.width = cssWidth * dpr;
  canvas.height = cssHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.clearRect(0, 0, cssWidth, cssHeight);

  // Center the weapon horizontally and slightly below center vertically.
  ctx.save();
  ctx.translate(cssWidth / 2, cssHeight / 2 + 4);

  const cfg =
    (typeof WEAPONS !== "undefined" &&
      WEAPONS[weaponKey || "pistol"]) ||
    (typeof WEAPONS !== "undefined" && WEAPONS.pistol) || {
      weaponLength: 30,
    };
  const weaponLength =
    typeof cfg.weaponLength === "number" ? cfg.weaponLength : 30;
  const maxLength = cssWidth * 0.65;
  const previewLength = Math.min(weaponLength, maxLength);

  drawWeaponShapes(
    ctx,
    0,
    0,
    0,
    previewLength,
    weaponKey || "pistol",
    skinKey,
  );

  ctx.restore();
}

// --- Shop weapon mini-preview ("little game canvas") ---
// This runs a tiny local animation inside a given canvas so players
// can see how the weapon + bullet color feel without starting a match.

function stopWeaponSkinMiniPreview(canvas) {
  if (!canvas || !canvas.__weaponPreview) return;
  const preview = canvas.__weaponPreview;
  if (preview.active && typeof preview.stop === "function") {
    preview.stop();
  }
  preview.active = false;
}

function startWeaponSkinMiniPreview(canvas, weaponKey, skinKey) {
  if (!canvas || !canvas.getContext) return;

  // If a preview is already running, restart it fresh.
  if (canvas.__weaponPreview && canvas.__weaponPreview.active) {
    stopWeaponSkinMiniPreview(canvas);
  }

  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvas.clientWidth || canvas.width || 140;
  const cssHeight = canvas.clientHeight || canvas.height || 70;

  canvas.width = cssWidth * dpr;
  canvas.height = cssHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const cfg =
    (typeof WEAPONS !== "undefined" &&
      WEAPONS[weaponKey || "pistol"]) ||
    (typeof WEAPONS !== "undefined" && WEAPONS.pistol) || {
      weaponLength: 30,
      bulletSpeed: 10,
      bulletRadius: 4,
      cooldownMs: 200,
    };

  const weaponLength =
    typeof cfg.weaponLength === "number" ? cfg.weaponLength : 30;
  const bulletSpeed =
    typeof cfg.bulletSpeed === "number" ? cfg.bulletSpeed : 10;
  const bulletRadius =
    typeof cfg.bulletRadius === "number" ? cfg.bulletRadius : 4;
  const cooldownMs =
    typeof cfg.cooldownMs === "number" ? cfg.cooldownMs : 200;

  const state = {
    angle: 0,
    targetAngle: 0,
    bullets: [],
    lastFireAt: 0,
    hasMouse: false,
    running: true,
  };

  function handleMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const dx = mx - cssWidth / 2;
    const dy = my - cssHeight * 0.7;
    state.targetAngle = Math.atan2(dy, dx);
    state.hasMouse = true;
  }

  function handleMouseLeave() {
    state.hasMouse = false;
  }

  function handleMouseDown() {
    fire();
  }

  function fire() {
    const now = performance.now();
    if (now - state.lastFireAt < cooldownMs) return;
    state.lastFireAt = now;

    const barrelLength = Math.min(weaponLength, cssWidth * 0.55);
    const originX = cssWidth / 2;
    const originY = cssHeight * 0.7;

    const tipX = originX + Math.cos(state.angle) * barrelLength;
    const tipY = originY + Math.sin(state.angle) * barrelLength;

    const color =
      typeof getBulletColorForWeaponSkin === "function"
        ? getBulletColorForWeaponSkin(weaponKey, skinKey)
        : "#000000";

    state.bullets.push({
      x: tipX,
      y: tipY,
      angle: state.angle,
      color,
    });
  }

  canvas.addEventListener("mousemove", handleMouseMove);
  canvas.addEventListener("mouseleave", handleMouseLeave);
  canvas.addEventListener("mousedown", handleMouseDown);

  const preview = {
    active: true,
    stop() {
      state.running = false;
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
      canvas.removeEventListener("mousedown", handleMouseDown);
    },
  };

  canvas.__weaponPreview = preview;

  function step() {
    if (!preview.active || !state.running) return;

    // Stop if the canvas is no longer in the document.
    if (!document.body.contains(canvas)) {
      stopWeaponSkinMiniPreview(canvas);
      return;
    }

    const now = performance.now();

    // If the mouse isn't over the canvas, gently sway the aim.
    if (!state.hasMouse) {
      const t = now / 1000;
      state.targetAngle = Math.sin(t * 1.3) * 0.4;
    }

    // Smoothly move current angle toward target.
    const lerpFactor = 0.18;
    const delta = state.targetAngle - state.angle;
    state.angle += delta * lerpFactor;

    // Auto-fire occasionally when idle so the bullets are visible.
    if (!state.hasMouse && now - state.lastFireAt > cooldownMs + 250) {
      fire();
    }

    // Advance bullets.
    state.bullets.forEach((b) => {
      b.x += Math.cos(b.angle) * bulletSpeed * 0.5;
      b.y += Math.sin(b.angle) * bulletSpeed * 0.5;
    });
    state.bullets = state.bullets.filter(
      (b) =>
        b.x > -40 &&
        b.x < cssWidth + 40 &&
        b.y > -40 &&
        b.y < cssHeight + 40,
    );

    // Draw background.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    ctx.fillStyle = "#e5e7eb";
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    const groundY = cssHeight * 0.7;

    // Ground line.
    ctx.strokeStyle = "rgba(148, 163, 184, 0.9)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, groundY + 8);
    ctx.lineTo(cssWidth, groundY + 8);
    ctx.stroke();

    // Bullets.
    state.bullets.forEach((b) => {
      ctx.fillStyle = b.color || "#000000";
      ctx.beginPath();
      ctx.arc(b.x, b.y, bulletRadius, 0, Math.PI * 2);
      ctx.fill();
    });

    // Weapon.
    const barrelLength = Math.min(weaponLength, cssWidth * 0.55);
    drawWeaponShapes(
      ctx,
      cssWidth / 2,
      groundY,
      state.angle,
      barrelLength,
      weaponKey || "pistol",
      skinKey,
    );

    // Simple muzzle flash shortly after firing.
    if (now - state.lastFireAt < 120) {
      const tipX =
        cssWidth / 2 + Math.cos(state.angle) * barrelLength;
      const tipY =
        groundY + Math.sin(state.angle) * barrelLength;
      ctx.fillStyle = "rgba(252, 211, 77, 0.9)";
      ctx.beginPath();
      ctx.arc(tipX, tipY, bulletRadius + 2, 0, Math.PI * 2);
      ctx.fill();
    }

    requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}
