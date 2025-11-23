const express = require("express");
const {
  requireUser,
  publicUser,
  ensureUserSkins,
  ensureUserCurrencies,
  saveUsers,
} = require("../lib/userStore");
const { ALL_SKINS_BY_KEY, WEAPON_SKINS } = require("../lib/skins");

function createShopRoutes({ io, activePlayers }) {
  const router = express.Router();

  router.get("/skins", (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;

    const responseSkins = [];
    Object.keys(WEAPON_SKINS || {}).forEach((weaponKey) => {
      const list = WEAPON_SKINS[weaponKey] || [];
      list.forEach((skin) => {
        if (!skin || !skin.key) return;
        const owned =
          Array.isArray(user.skins.owned) &&
          user.skins.owned.includes(skin.key);
        const equipped =
          user.skins.equippedByWeapon[weaponKey] === skin.key;
        responseSkins.push({
          key: skin.key,
          weaponKey,
          name: skin.name,
          description: skin.description,
          price: typeof skin.price === "number" ? skin.price : 0,
          isDefault: !!skin.isDefault,
          owned,
          equipped,
        });
      });
    });

    res.json({
      skins: responseSkins,
      currencies: user.currencies || {},
    });
  });

  router.post("/purchase", (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;

    const { skinKey } = req.body || {};
    if (!skinKey || typeof skinKey !== "string") {
      return res
        .status(400)
        .json({ error: "skinKey is required." });
    }
    const skin = ALL_SKINS_BY_KEY[skinKey];
    if (!skin) {
      return res.status(404).json({ error: "Skin not found." });
    }

    ensureUserSkins(user);
    ensureUserCurrencies(user);

    if (
      Array.isArray(user.skins.owned) &&
      user.skins.owned.includes(skinKey)
    ) {
      return res.json({
        ok: true,
        alreadyOwned: true,
        user: publicUser(user),
      });
    }

    const price =
      typeof skin.price === "number" && skin.price > 0
        ? skin.price
        : 0;
    if (price > 0) {
      const currentCoins =
        typeof user.currencies.Coins === "number"
          ? user.currencies.Coins
          : 0;
      if (currentCoins < price) {
        return res
          .status(400)
          .json({ error: "Not enough Coins." });
      }
      user.currencies.Coins = currentCoins - price;
    }

    if (!Array.isArray(user.skins.owned)) {
      user.skins.owned = [];
    }
    user.skins.owned.push(skinKey);
    saveUsers();

    res.json({
      ok: true,
      skinKey,
      user: publicUser(user),
    });
  });

  router.post("/equip", (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;

    const { skinKey } = req.body || {};
    if (!skinKey || typeof skinKey !== "string") {
      return res
        .status(400)
        .json({ error: "skinKey is required." });
    }
    const skin = ALL_SKINS_BY_KEY[skinKey];
    if (!skin || !skin.weaponKey) {
      return res.status(404).json({ error: "Skin not found." });
    }

    ensureUserSkins(user);

    if (
      !Array.isArray(user.skins.owned) ||
      !user.skins.owned.includes(skinKey)
    ) {
      return res
        .status(400)
        .json({ error: "You do not own this skin." });
    }

    const weaponKey = skin.weaponKey;
    if (
      !user.skins.equippedByWeapon ||
      typeof user.skins.equippedByWeapon !== "object"
    ) {
      user.skins.equippedByWeapon = {};
    }
    user.skins.equippedByWeapon[weaponKey] = skinKey;

    // If this player is currently active in a match, update their weaponSkinKey.
    activePlayers.forEach((p) => {
      if (
        p &&
        p.accountUsername === user.username &&
        p.weapon === weaponKey
      ) {
        p.weaponSkinKey = skinKey;
      }
    });
    if (activePlayers.length > 0) {
      io.emit("gameState", activePlayers);
    }

    saveUsers();
    res.json({
      ok: true,
      skinKey,
      weaponKey,
      user: publicUser(user),
    });
  });

  return router;
}

module.exports = { createShopRoutes };
