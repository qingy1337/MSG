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
  ensureUserStats,
  saveUsers,
} = require("../lib/userStore");
const { WEAPONS, DEFAULT_WEAPON_KEY } = require('../public/weapons');

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
    if (typeof primaryWeapon !== 'string' || !WEAPONS[primaryWeapon] || WEAPONS[primaryWeapon].selectable === false) {
      return res.status(400).json({ error: 'Invalid primary weapon.' });
    }
    ensureUserLoadout(user);
    user.loadout.primaryWeapon = primaryWeapon;
    saveUsers();
    res.json({ ok: true, user: publicUser(user) });
  });

  return router;
}

module.exports = { createAuthRoutes };
