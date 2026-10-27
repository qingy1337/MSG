const crypto = require('crypto');
const path = require('path');
const {ALL_SKINS_BY_KEY,DEFAULT_SKIN_BY_WEAPON} = require('../lib/skins');

// Keep the preview's account state and browser login separate from the main
// app, even when both instances run on different ports of the same hostname.
process.env.PORT ||= '3002';
process.env.DATA_DIR ||= path.join(__dirname, '..', 'data', 'test');
process.env.AUTH_COOKIE_NAME ||= 'auth_token_test';
process.env.AUTH_SECRET ||= crypto.randomBytes(32).toString('hex');
process.env.TEST_MODE = '1';

if (path.resolve(process.env.DATA_DIR) === path.join(__dirname, '..', 'data')) {
  throw new Error('The test app needs its own DATA_DIR, separate from the main app.');
}
if (process.env.AUTH_COOKIE_NAME === 'auth_token') {
  throw new Error('The test app needs its own AUTH_COOKIE_NAME.');
}
const password = process.env.TEST_ADMIN_PASSWORD;
if (!password || password.length < 8) {
  throw new Error('Set TEST_ADMIN_PASSWORD to at least 8 characters before starting the test app.');
}

const store = require('../lib/userStore');
const username = 'qing';
const admin = store.usersByUsername.get(username) || {
  id: store.issueUserId(),username,currencies:{Coins:0},stats:{},loadout:{primaryWeapon:'autoRifle'},skins:{},
};
admin.passwordHash = store.hashPassword(password);
admin.skins = {
  owned:Object.keys(ALL_SKINS_BY_KEY),
  equippedByWeapon:{...DEFAULT_SKIN_BY_WEAPON,...admin.skins?.equippedByWeapon},
};
store.ensureUserCurrencies(admin);
store.ensureUserLoadout(admin);
store.ensureUserStats(admin);
store.usersByUsername.clear();
store.usersByUsername.set(username,admin);
store.saveUsers();

require('../server');
