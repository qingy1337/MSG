// Helpers for drawing weapon skins both in-game and in shop previews.

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
      ctx.strokeStyle = shape.color || "#111827";
      ctx.lineWidth =
        typeof shape.lineWidth === "number" ? shape.lineWidth : 3;
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
