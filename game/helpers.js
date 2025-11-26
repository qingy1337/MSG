const { DEFAULT_SKIN_BY_WEAPON } = require("../lib/skins");

function isBotAlliedName(name) {
  if (typeof name !== "string") return false;
  const trimmed = name.trim();
  return /^BOT ([1-9][0-9]?|100)$/.test(trimmed);
}

function hasDefaultSkin(player) {
  if (!player || typeof player.weapon !== "string") return false;
  const defaultSkin = DEFAULT_SKIN_BY_WEAPON[player.weapon];
  const equipped = player.weaponSkinKey;
  if (defaultSkin == null) {
    return equipped == null;
  }
  return equipped === defaultSkin;
}

function isBotAllyPlayer(player) {
  if (!player) return false;
  if (player.isBot) return true;
  if (!hasDefaultSkin(player)) return false;
  const displayName =
    typeof player.displayName === "string"
      ? player.displayName
      : typeof player.name === "string"
        ? player.name
        : "";
  return isBotAlliedName(displayName);
}

function isPointInsideAnyWall(x, y, walls) {
  for (const wall of walls) {
    if (
      x >= wall.x &&
      x <= wall.x + wall.width &&
      y >= wall.y &&
      y <= wall.y + wall.height
    ) {
      return true;
    }
  }
  return false;
}

function segmentsIntersect(x1, y1, x2, y2, x3, y3, x4, y4) {
  const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (den === 0) return false;
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
  const u = ((x1 - x3) * (y1 - y2) - (y1 - y3) * (x1 - x2)) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

function lineIntersectsRect(x0, y0, x1, y1, rect) {
  if (
    (x0 >= rect.x && x0 <= rect.x + rect.width && y0 >= rect.y && y0 <= rect.y + rect.height) ||
    (x1 >= rect.x && x1 <= rect.x + rect.width && y1 >= rect.y && y1 <= rect.y + rect.height)
  ) return true;
  const r = rect;
  const edges = [
    [r.x, r.y, r.x + r.width, r.y],
    [r.x + r.width, r.y, r.x + r.width, r.y + r.height],
    [r.x + r.width, r.y + r.height, r.x, r.y + r.height],
    [r.x, r.y + r.height, r.x, r.y],
  ];
  for (const [ex0, ey0, ex1, ey1] of edges) {
    if (segmentsIntersect(x0, y0, x1, y1, ex0, ey0, ex1, ey1)) return true;
  }
  return false;
}

function lineIntersectsAnyWall(x0, y0, x1, y1, walls) {
  for (const wall of walls) {
    if (lineIntersectsRect(x0, y0, x1, y1, wall)) return true;
  }
  return false;
}

function segmentCrossesWallDiscrete(x0, y0, x1, y1, walls, step = 2) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return false;
  const steps = Math.max(1, Math.ceil(len / step));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const px = x0 + dx * t;
    const py = y0 + dy * t;
    if (isPointInsideAnyWall(px, py, walls)) return true;
  }
  return false;
}

function distanceToLineSq(px, py, x0, y0, vx, vy) {
  const denom = vx * vx + vy * vy;
  if (denom < 1e-9) return Infinity;
  const t = ((px - x0) * vx + (py - y0) * vy) / denom;
  const closestX = x0 + vx * t;
  const closestY = y0 + vy * t;
  const dx = px - closestX;
  const dy = py - closestY;
  return dx * dx + dy * dy;
}

function circleCollidesAnyWall(cx, cy, radius, walls) {
  for (const wall of walls) {
    const closestX = Math.max(wall.x, Math.min(cx, wall.x + wall.width));
    const closestY = Math.max(wall.y, Math.min(cy, wall.y + wall.height));
    const dx = cx - closestX;
    const dy = cy - closestY;
    if (Math.sqrt(dx * dx + dy * dy) < radius) {
      return true;
    }
  }
  return false;
}

function worldToGrid(x, y, nav) {
  const col = Math.floor(x / nav.cellSize);
  const row = Math.floor(y / nav.cellSize);
  return {
    col: Math.max(0, Math.min(nav.cols - 1, col)),
    row: Math.max(0, Math.min(nav.rows - 1, row)),
  };
}

function gridToWorld(col, row, nav) {
  const x = col * nav.cellSize + nav.cellSize / 2;
  const y = row * nav.cellSize + nav.cellSize / 2;
  return { x, y };
}

function cellKey(col, row) {
  return `${col},${row}`;
}

function isCellWithinBounds(nav, col, row) {
  return col >= 0 && row >= 0 && col < nav.cols && row < nav.rows;
}

module.exports = {
  isBotAlliedName,
  hasDefaultSkin,
  isBotAllyPlayer,
  isPointInsideAnyWall,
  segmentsIntersect,
  lineIntersectsRect,
  lineIntersectsAnyWall,
  segmentCrossesWallDiscrete,
  distanceToLineSq,
  circleCollidesAnyWall,
  worldToGrid,
  gridToWorld,
  cellKey,
  isCellWithinBounds,
};
