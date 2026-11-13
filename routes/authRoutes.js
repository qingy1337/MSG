const express = require("express");
const {
  AUTH_COOKIE_NAME,
  usersByUsername,
  issueUserId,
  hashPassword,
  verifyPassword,
  signAuthToken,
  getUserFromRequest,
  publicUser,
  ensureUserCurrencies,
  ensureUserSkins,
  ensureUserLoadout,
  normalizePlayerColor,
  ensureUserStats,
  saveUsers,
} = require("../lib/userStore");
const { WEAPONS, DEFAULT_WEAPON_KEY } = require('../public/weapons');
const {ensureUserArmor}=require('../lib/armor');
const {ALL_SKINS_BY_KEY}=require('../lib/skins');

function createAuthRoutes() {
  const router = express.Router();

  router.post("/register", (req, res) => {
    if (process.env.TEST_MODE === '1') {
      return res.status(403).json({ error: 'The test app has one admin account. Sign in as qing.' });
    }
    const { username, password } = req.body || {};
    const cleanUsername =
      typeof username === "string" ? username.trim().toLowerCase() : "";
    if (!cleanUsername || cleanUsername.length < 3 || cleanUsername.length > 24) {
      return res
        .status(400)
        .json({ error: "Username must be 3-24 characters long." });
    }
    if (typeof password !== "string" || password.length < 4) {
      return res
        .status(400)
        .json({ error: "Password must be at least 4 characters." });
    }
    if (usersByUsername.has(cleanUsername)) {
      return res.status(409).json({ error: "Username is already taken." });
    }

    const user = {
      id: issueUserId(),
      username: cleanUsername,
      passwordHash: hashPassword(password),
      currencies: {
        Coins: 0,
      },
      skins: {
        owned: [],
        equippedByWeapon: {},
      },
      loadout: { primaryWeapon: DEFAULT_WEAPON_KEY },
    };
    ensureUserCurrencies(user);
    ensureUserSkins(user);
    ensureUserStats(user);
    ensureUserArmor(user);
    usersByUsername.set(cleanUsername, user);
    saveUsers();

    const token = signAuthToken({ username: user.username });
    res
      .cookie(AUTH_COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: "lax",
        maxAge: 1000 * 60 * 60 * 24 * 365, // ~1 year
      })
      .json(publicUser(user));
  });

  router.post("/login", (req, res) => {
    const { username, password } = req.body || {};
    const cleanUsername =
      typeof username === "string" ? username.trim().toLowerCase() : "";
    if (!cleanUsername || typeof password !== "string") {
      return res.status(400).json({ error: "Username and password required." });
    }
    const user = usersByUsername.get(cleanUsername);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ error: "Invalid username or password." });
    }
    const token = signAuthToken({ username: user.username });
    res
      .cookie(AUTH_COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: "lax",
        maxAge: 1000 * 60 * 60 * 24 * 365,
      })
      .json(publicUser(user));
  });

  router.post("/logout", (req, res) => {
    res
      .clearCookie(AUTH_COOKIE_NAME, {
        httpOnly: true,
        sameSite: "lax",
      })
      .json({ ok: true });
  });

  router.get("/me", (req, res) => {
    const user = getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: "Not authenticated." });
    res.json(publicUser(user));
  });

  router.post('/loadout', (req, res) => {
    const user = getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated.' });
    const primaryWeapon = req.body?.primaryWeapon;
    const playerColor = req.body?.playerColor;
    const skinKey = req.body?.skinKey;
    if (primaryWeapon === undefined && playerColor === undefined && skinKey === undefined) {
      return res.status(400).json({ error: 'Choose equipment or a player color.' });
    }
    if (primaryWeapon !== undefined && (typeof primaryWeapon !== 'string' || !Object.hasOwn(WEAPONS, primaryWeapon) || WEAPONS[primaryWeapon].selectable === false)) {
      return res.status(400).json({ error: 'Invalid primary weapon.' });
    }
    if (playerColor !== undefined && !normalizePlayerColor(playerColor)) {
      return res.status(400).json({ error: 'Invalid player color.' });
    }
    let skin;
    if (skinKey !== undefined) {
      skin = typeof skinKey === 'string' && Object.hasOwn(ALL_SKINS_BY_KEY, skinKey) ? ALL_SKINS_BY_KEY[skinKey] : null;
      if (!skin) return res.status(400).json({ error: 'Skin not found.' });
      ensureUserSkins(user);
      if (!user.skins.owned.includes(skinKey)) return res.status(400).json({ error: 'You do not own this skin.' });
      if (primaryWeapon !== undefined && skin.weaponKey !== primaryWeapon) {
        return res.status(400).json({ error: 'Choose a skin for this weapon.' });
      }
    }
    // All validation precedes mutation: a primary + skin selection is atomic.
    ensureUserLoadout(user);
    if (primaryWeapon !== undefined) user.loadout.primaryWeapon = primaryWeapon;
    if (playerColor !== undefined) user.loadout.playerColor = normalizePlayerColor(playerColor);
    if (skin) user.skins.equippedByWeapon[skin.weaponKey] = skinKey;
    saveUsers();
    res.json({ ok: true, user: publicUser(user) });
  });

  return router;
}

module.exports = { createAuthRoutes };
