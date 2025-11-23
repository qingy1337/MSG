const express = require("express");
const {
  usersByUsername,
  issueUserId,
  hashPassword,
  verifyPassword,
  signAuthToken,
  getUserFromRequest,
  publicUser,
  ensureUserCurrencies,
  ensureUserSkins,
  saveUsers,
} = require("../lib/userStore");

function createAuthRoutes() {
  const router = express.Router();

  router.post("/register", (req, res) => {
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
    };
    ensureUserCurrencies(user);
    ensureUserSkins(user);
    usersByUsername.set(cleanUsername, user);
    saveUsers();

    const token = signAuthToken({ username: user.username });
    res
      .cookie("auth_token", token, {
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
      .cookie("auth_token", token, {
        httpOnly: true,
        sameSite: "lax",
        maxAge: 1000 * 60 * 60 * 24 * 365,
      })
      .json(publicUser(user));
  });

  router.post("/logout", (req, res) => {
    res
      .clearCookie("auth_token", {
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

  return router;
}

module.exports = { createAuthRoutes };
