const { WEAPON_SKINS } = require("../public/skins");

// Build lookup tables for skins so the rest of the server can do quick checks.
const ALL_SKINS_BY_KEY = {};
const DEFAULT_SKIN_BY_WEAPON = {};

if (WEAPON_SKINS && typeof WEAPON_SKINS === "object") {
  for (const weaponKey of Object.keys(WEAPON_SKINS)) {
    const list = WEAPON_SKINS[weaponKey] || [];
    let defaultForWeapon = null;
    for (const skin of list) {
      if (!skin || !skin.key) continue;
      ALL_SKINS_BY_KEY[skin.key] = skin;
      if (!defaultForWeapon && skin.isDefault) {
        defaultForWeapon = skin;
      }
    }
    if (!defaultForWeapon && list.length > 0) {
      defaultForWeapon = list[0];
    }
    if (defaultForWeapon && defaultForWeapon.key) {
      DEFAULT_SKIN_BY_WEAPON[weaponKey] = defaultForWeapon.key;
    }
  }
}

module.exports = {
  WEAPON_SKINS,
  ALL_SKINS_BY_KEY,
  DEFAULT_SKIN_BY_WEAPON,
};
