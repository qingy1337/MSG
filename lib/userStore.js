const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { DEFAULT_SKIN_BY_WEAPON } = require("./skins");

const DATA_DIR = path.join(__dirname, "..", "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const AUTH_SECRET = process.env.AUTH_SECRET || "change-me-dev-secret";

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const usersByUsername = new Map();
let nextUserId = 1;
let pendingSaveTimer = null;
const STAT_WEAPON_KEYS = Object.freeze(["autoRifle", "shotgun", "sniper", "miniGun", "pistol"]);

function ensureUserCurrencies(user) {
  if (!user.currencies || typeof user.currencies !== "object") {
    user.currencies = {};
  }
  if (typeof user.currencies.Coins !== "number") {
    user.currencies.Coins = 0;
  }
}

function ensureUserSkins(user) {
  if (!user) return;
  if (!user.skins || typeof user.skins !== "object") {
    user.skins = {};
  }
  if (!Array.isArray(user.skins.owned)) {
    user.skins.owned = [];
  }
  if (
    !user.skins.equippedByWeapon ||
    typeof user.skins.equippedByWeapon !== "object"
  ) {
    user.skins.equippedByWeapon = {};
  }

  // Guarantee that each weapon has its default skin owned and equipped.
  Object.keys(DEFAULT_SKIN_BY_WEAPON).forEach((weaponKey) => {
    const defaultSkinKey = DEFAULT_SKIN_BY_WEAPON[weaponKey];
    if (!defaultSkinKey) return;
    if (!user.skins.owned.includes(defaultSkinKey)) {
      user.skins.owned.push(defaultSkinKey);
    }
    if (!user.skins.equippedByWeapon[weaponKey]) {
      user.skins.equippedByWeapon[weaponKey] = defaultSkinKey;
    }
  });
}

function ensureUserLoadout(user) {
  if (!user) return;
  if (!user.loadout || typeof user.loadout !== "object") user.loadout = {};
  if (typeof user.loadout.primaryWeapon !== "string") {
    user.loadout.primaryWeapon = "autoRifle";
  }
}

function safeStat(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function ensureUserStats(user) {
  if (!user) return;
  if (!user.stats || typeof user.stats !== "object") user.stats = {};
  user.stats.pveKills = safeStat(user.stats.pveKills);
  user.stats.pvpKills = safeStat(user.stats.pvpKills);
  user.stats.grenadesThrown = safeStat(user.stats.grenadesThrown);
  if (!user.stats.weaponKills || typeof user.stats.weaponKills !== "object") {
    user.stats.weaponKills = {};
  }
  for (const key of STAT_WEAPON_KEYS) {
    user.stats.weaponKills[key] = safeStat(user.stats.weaponKills[key]);
  }
}

function publicStats(user) {
  ensureUserStats(user);
  return {
    pveKills: user.stats.pveKills,
    pvpKills: user.stats.pvpKills,
    grenadesThrown: user.stats.grenadesThrown,
    weaponKills: Object.fromEntries(STAT_WEAPON_KEYS.map(key => [key, user.stats.weaponKills[key]])),
  };
}

function recordUserKill(user, mode, weaponKey, { persist = true } = {}) {
  if (!user) return null;
  ensureUserStats(user);
  if (mode === "pve") user.stats.pveKills += 1;
  else if (mode === "pvp") user.stats.pvpKills += 1;
  if (STAT_WEAPON_KEYS.includes(weaponKey)) user.stats.weaponKills[weaponKey] += 1;
  if (persist) scheduleSaveUsers();
  return publicStats(user);
}

function recordGrenadeThrown(user, { persist = true } = {}) {
  if (!user) return null;
  ensureUserStats(user);
  user.stats.grenadesThrown += 1;
  if (persist) scheduleSaveUsers();
  return publicStats(user);
}

function loadUsers() {
  if (!fs.existsSync(USERS_FILE)) return;
  try {
    const raw = fs.readFileSync(USERS_FILE, "utf8");
    if (!raw) return;
    const data = JSON.parse(raw);
    if (Array.isArray(data)) {
      data.forEach((u) => {
        if (!u || !u.username) return;
        ensureUserCurrencies(u);
        ensureUserSkins(u);
        ensureUserLoadout(u);
        ensureUserStats(u);
        usersByUsername.set(u.username, u);
        if (typeof u.id === "number" && u.id >= nextUserId) {
          nextUserId = u.id + 1;
        }
      });
    }
  } catch (err) {
    console.error("Failed to load users:", err);
  }
}

function saveUsers() {
  if (pendingSaveTimer) {
    clearTimeout(pendingSaveTimer);
    pendingSaveTimer = null;
  }
  const arr = Array.from(usersByUsername.values());
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(arr, null, 2), "utf8");
  } catch (err) {
    console.error("Failed to save users:", err);
  }
}

function scheduleSaveUsers(delay = 500) {
  if (pendingSaveTimer) return;
  pendingSaveTimer = setTimeout(() => {
    pendingSaveTimer = null;
    saveUsers();
  }, delay);
  pendingSaveTimer.unref?.();
}

function issueUserId() {
  return nextUserId++;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const iterations = 120000;
  const keylen = 32;
  const digest = "sha256";
  const hash = crypto
    .pbkdf2Sync(password, salt, iterations, keylen, digest)
    .toString("hex");
  return `${iterations}:${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || typeof stored !== "string") return false;
  const parts = stored.split(":");
  if (parts.length !== 3) return false;
  const [iterationsStr, salt, hashHex] = parts;
  const iterations = parseInt(iterationsStr, 10);
  if (!iterations || !salt || !hashHex) return false;
  const keylen = Buffer.from(hashHex, "hex").length;
  const digest = "sha256";
  const derived = crypto.pbkdf2Sync(
    password,
    salt,
    iterations,
    keylen,
    digest,
  );
  const expected = Buffer.from(hashHex, "hex");
  if (expected.length !== derived.length) return false;
  return crypto.timingSafeEqual(expected, derived);
}

function signAuthToken(payload) {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64");
  const sig = crypto
    .createHmac("sha256", AUTH_SECRET)
    .update(data)
    .digest("base64");
  return `${data}.${sig}`;
}

function verifyAuthToken(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [data, sig] = parts;
  let expectedSig;
  try {
    expectedSig = crypto
      .createHmac("sha256", AUTH_SECRET)
      .update(data)
      .digest("base64");
  } catch (err) {
    return null;
  }
  const bufSig = Buffer.from(sig);
  const bufExpected = Buffer.from(expectedSig);
  if (bufSig.length !== bufExpected.length) return null;
  if (!crypto.timingSafeEqual(bufSig, bufExpected)) return null;
  try {
    const json = Buffer.from(data, "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  const parts = header.split(";");
  for (const part of parts) {
    const [k, v] = part.split("=");
    if (!k) continue;
    const key = k.trim();
    const value = (v || "").trim();
    if (!key) continue;
    out[key] = decodeURIComponent(value);
  }
  return out;
}

function getUserFromCookieHeader(cookieHeader) {
  if (!cookieHeader) return null;
  const cookies = parseCookies(cookieHeader);
  const token = cookies.auth_token;
  if (!token) return null;
  const payload = verifyAuthToken(token);
  if (!payload || !payload.username) return null;
  const user = usersByUsername.get(payload.username);
  if (!user) return null;
  return user;
}

function getUserFromRequest(req) {
  return getUserFromCookieHeader(req.headers.cookie || "");
}

function publicUser(user) {
  if (!user) return null;
  ensureUserCurrencies(user);
  ensureUserSkins(user);
  ensureUserLoadout(user);
  ensureUserStats(user);
  return {
    id: user.id,
    username: user.username,
    currencies: user.currencies || {},
    skins: {
      owned: Array.isArray(user.skins && user.skins.owned)
        ? user.skins.owned.slice()
        : [],
      equippedByWeapon:
        (user.skins && user.skins.equippedByWeapon) || {},
    },
    loadout: { primaryWeapon: user.loadout.primaryWeapon },
    stats: publicStats(user),
  };
}

function requireUser(req, res) {
  const user = getUserFromRequest(req);
  if (!user) {
    res.status(401).json({ error: "Not authenticated." });
    return null;
  }
  ensureUserCurrencies(user);
  ensureUserSkins(user);
  ensureUserLoadout(user);
  ensureUserStats(user);
  return user;
}

loadUsers();

module.exports = {
  AUTH_SECRET,
  usersByUsername,
  ensureUserCurrencies,
  ensureUserSkins,
  ensureUserLoadout,
  ensureUserStats,
  publicStats,
  recordUserKill,
  recordGrenadeThrown,
  STAT_WEAPON_KEYS,
  loadUsers,
  saveUsers,
  scheduleSaveUsers,
  hashPassword,
  verifyPassword,
  signAuthToken,
  verifyAuthToken,
  parseCookies,
  getUserFromCookieHeader,
  getUserFromRequest,
  publicUser,
  requireUser,
  issueUserId,
};
