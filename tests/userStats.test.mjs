import { test } from 'node:test';
import assert from 'node:assert/strict';
import userStore from '../lib/userStore.js';

test('player colors migrate and are validated before being exposed publicly',()=>{
  const user={username:'color-test'};
  assert.equal(userStore.publicUser(user).loadout.playerColor,'#59daca');
  user.loadout.playerColor='#E078AB';
  assert.equal(userStore.publicUser(user).loadout.playerColor,'#e078ab');
  for(const invalid of [null,3,'red','#abc','#00000000','url(test)']) {
    assert.equal(userStore.normalizePlayerColor(invalid),null);
  }
});

test('career stats migrate safely and separate modes, weapons, and grenade throws', () => {
  const user = {
    stats: {
      pveKills: -8,
      pvpKills: 2,
      grenadesThrown: 'many',
      weaponKills: { sniper: 4, pistol: -1 },
    },
  };

  userStore.ensureUserStats(user);
  assert.deepEqual(userStore.publicStats(user), {
    pveKills: 0,
    pvpKills: 2,
    grenadesThrown: 0,
    weaponKills: { autoRifle: 0, shotgun: 0, sniper: 4, miniGun: 0, pistol: 0 },
  });

  userStore.recordUserKill(user, 'pve', 'autoRifle', { persist: false });
  userStore.recordUserKill(user, 'pvp', 'grenade', { persist: false });
  userStore.recordGrenadeThrown(user, { persist: false });
  assert.deepEqual(userStore.publicStats(user), {
    pveKills: 1,
    pvpKills: 3,
    grenadesThrown: 1,
    weaponKills: { autoRifle: 1, shotgun: 0, sniper: 4, miniGun: 0, pistol: 0 },
  });
});
