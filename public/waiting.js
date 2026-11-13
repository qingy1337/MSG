const socket = io({ autoConnect: false });

// DOM elements - screens
const homeScreen = document.getElementById("home-screen");
const lobbyScreen = document.getElementById("lobby-screen");
const gameScreen = document.getElementById("game-screen");
const shopScreen = document.getElementById("shop-screen");
const settingsScreen = document.getElementById("settings-screen");

// Simple screen state helper so only one main screen shows at a time
function setActiveScreen(target) {
  playerColorControl?.classList.toggle('hidden', target !== homeScreen);
  const screens = [homeScreen, lobbyScreen, gameScreen, shopScreen, settingsScreen];
  if (target && target !== shopScreen && target !== settingsScreen && screens.includes(target)) {
    lastNonShopScreen = target;
  }
  screens.forEach((el) => {
    if (!el) return;
    if (el === target) {
      el.classList.remove("hidden");
    } else {
      el.classList.add("hidden");
    }
  });

  if (coinsIndicatorEl) {
    const inGame = target === gameScreen;
    if (inGame) {
      coinsIndicatorEl.classList.add("coins-indicator-disabled");
    } else {
      coinsIndicatorEl.classList.remove("coins-indicator-disabled");
    }
  }
  document.body.classList.toggle('in-game', target === gameScreen);
  document.body.classList.toggle('in-shop', target === shopScreen);
  document.documentElement.classList.toggle('in-shop', target === shopScreen);
  document.body.classList.toggle('in-home', target === homeScreen);
  if (target !== homeScreen) loadoutUI.close();
  else loadoutUI.render();
}

window.returnToHome = function returnToHome() {
  currentLobby = null;
  setActiveScreen(homeScreen);
  if (socket.connected) socket.emit('lobby:list:request');
};

// DOM elements - lobby
const playBtn = document.getElementById("play-btn");
const startBtn = document.getElementById("start-btn");
const pvpModeRow = document.getElementById('pvp-mode-row');
const pvpModeButtons = document.querySelectorAll('[data-pvp-mode]');
const pvpTeamNote = document.getElementById('pvp-team-note');
pvpModeButtons.forEach(button=>button.addEventListener('click',()=>{
  if(currentLobby?.ownerId!==socket.id||button.dataset.pvpMode===currentLobby.pvpMode)return;
  emitLobbyAction('lobby:pvpMode',{pvpMode:button.dataset.pvpMode});
}));
const teamColumns = document.getElementById('team-columns');
const teamLobby = createTeamLobby(teamColumns,{
  document,teams:PVP_TEAMS,getLocalId:()=>socket.id,
  onTeamChange:team=>emitLobbyAction('lobby:team',{team}),
  weaponName:key=>WEAPONS[key]?.name||'Auto Rifle',
});
const leaveLobbyBtn = document.getElementById('leave-lobby-btn');
const startFloorRow = document.getElementById('pve-start-floor-row');
const startFloorInput = document.getElementById('pve-start-floor');
const pvpDebugRow = document.getElementById('pvp-debug-row');
const pvpDebugMap = document.getElementById('pvp-debug-map');
const pvpDebugDouble = document.getElementById('pvp-debug-double');
const waitingPlayersList = document.getElementById("waiting-players");
const homeUsernameEl = document.getElementById('home-username');
const loadoutPreviewCanvas = document.getElementById('loadout-weapon-preview');
const pvpLobbyListEl = document.getElementById('pvp-lobby-list');
const pveLobbyListEl = document.getElementById('pve-lobby-list');
const onlineLobbyCountEl = document.getElementById('online-lobby-count');
const lobbyStatusEl = document.getElementById('lobby-status');
const lobbyTitleEl = document.getElementById('lobby-title');
const lobbyCapacityEl = document.getElementById('lobby-capacity');
const lobbyLeaderNoteEl = document.getElementById('lobby-leader-note');
const lobbyActionStatusEl = document.getElementById('lobby-action-status');
const openArmoryBtn = document.getElementById('open-armory-btn');
const openSettingsBtn = document.getElementById('open-settings-btn');
const settingsBackBtn = document.getElementById('settings-back-btn');
const mouseSensitivitySlider = document.getElementById('mouse-sensitivity-slider');
const mouseSensitivityValue = document.getElementById('mouse-sensitivity-value');
const resetMouseSensitivityBtn = document.getElementById('reset-mouse-sensitivity-btn');
const modeChoices = Array.from(document.querySelectorAll('.mode-choice[data-mode]'));
const totalKillsValueEl = document.getElementById('total-kills-value');
const pveKillsValueEl = document.getElementById('pve-kills-value');
const pvpKillsValueEl = document.getElementById('pvp-kills-value');
const pveKillsBarEl = document.getElementById('pve-kills-bar');
const pvpKillsBarEl = document.getElementById('pvp-kills-bar');
const grenadesThrownValueEl = document.getElementById('grenades-thrown-value');
const weaponKillListEl = document.getElementById('weapon-kill-list');

// DOM elements - auth + header
const authOverlay = document.getElementById("auth-overlay");
const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");
const loginUsernameInput = document.getElementById("login-username");
const loginPasswordInput = document.getElementById("login-password");
const registerUsernameInput = document.getElementById("register-username");
const registerPasswordInput = document.getElementById("register-password");
const loginTabBtn = document.getElementById("tab-login");
const registerTabBtn = document.getElementById("tab-register");
const authErrorEl = document.getElementById("auth-error");
const userInfoEl = document.getElementById("user-info");
const userUsernameEl = document.getElementById("user-username");
const playerColorControl = document.getElementById('player-color-control');
const playerColorInput = document.getElementById('player-color');
const playerColorStatus = document.getElementById('player-color-status');
let savedPlayerColor = '#59daca';
let playerColorSave = Promise.resolve(true);

playerColorInput?.addEventListener('input', () => {
  if (!currentUser) return;
  currentUser.loadout ||= {};
  currentUser.loadout.playerColor = playerColorInput.value;
  playerColorStatus.textContent = '';
  updateLoadoutSummary();
});
playerColorInput?.addEventListener('change', () => {
  playerColorSave = savePlayerColor();
});

async function savePlayerColor() {
  if (!currentUser) return false;
  const user = currentUser, playerColor = playerColorInput.value;
  playerColorInput.disabled = true;
  try {
    const response = await fetch('/api/loadout', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerColor }),
    });
    if (!response.ok) throw new Error('Color could not be saved');
    if (currentUser !== user) return false;
    savedPlayerColor = playerColor;
    user.loadout ||= {};
    user.loadout.playerColor = playerColor;
    updateLoadoutSummary();
    return true;
  } catch (error) {
    if (currentUser === user) {
      user.loadout.playerColor = savedPlayerColor;
      playerColorInput.value = savedPlayerColor;
      playerColorStatus.textContent = 'Couldn’t save color. Try again.';
      updateLoadoutSummary();
      // The current join attempt stops, but the restored saved color remains
      // usable on the next attempt even if the player leaves it unchanged.
      playerColorSave = Promise.resolve(true);
    }
    return false;
  } finally {
    playerColorInput.disabled = false;
  }
}
const logoutBtn = document.getElementById("logout-btn");
const coinsIndicatorEl = document.getElementById("coins-indicator");
const coinsValueEl = document.getElementById("coins-value");
const shopBackBtn = document.getElementById("shop-back-btn");
const shopStatusEl = document.getElementById("shop-status");
const shopContentEl = document.getElementById("shop-content");

// Player data
let selectedWeaponKey = (typeof DEFAULT_WEAPON_KEY !== 'undefined' ? DEFAULT_WEAPON_KEY : 'autoRifle');
let selectedMode = 'pvp';
let currentUser = null;
const loadoutUI = window.createLoadoutUI({
  root: document.getElementById('character-loadout'),
  getUser: () => currentUser,
  getPrimary: () => selectedWeaponKey,
  weapons: WEAPONS,
  skins: WEAPON_SKINS,
  onEquip: equipLoadoutItem,
  onPurchase: purchaseLoadoutItem,
});
let currentLobby = null;
let knownLobbies = [];
let lastNonShopScreen = homeScreen;
let shopSkins = [];
let shopSectionCollapseState = {};

if(pvpDebugMap) {
  const random=document.createElement('option');random.value='';random.textContent='Random map';pvpDebugMap.appendChild(random);
  for(const id of globalThis.PVP_MAP_IDS||[]) {
    const option=document.createElement('option');option.value=id;
    option.textContent=globalThis.PVP_MAPS?.[id]?.name||id;pvpDebugMap.appendChild(option);
  }
}

function setCoinsValue(coins) {
  const safeCoins = typeof coins === "number" ? coins : 0;
  if (coinsValueEl) {
    coinsValueEl.textContent = safeCoins;
  }
  if (coinsIndicatorEl) {
    coinsIndicatorEl.classList.remove("hidden");
  }
  if (currentUser) {
    if (!currentUser.currencies || typeof currentUser.currencies !== "object") {
      currentUser.currencies = {};
    }
    currentUser.currencies.Coins = safeCoins;
  }
}

// --- Auth helpers ---

function setAuthError(message) {
  if (!authErrorEl) return;
  if (!message) {
    authErrorEl.textContent = "";
    authErrorEl.classList.add("hidden");
  } else {
    authErrorEl.textContent = message;
    authErrorEl.classList.remove("hidden");
  }
}

function applyAuthenticatedState(user) {
  currentUser = user;
  if(pvpDebugDouble)pvpDebugDouble.checked=false;
  savedPlayerColor = user.loadout?.playerColor || '#59daca';
  playerColorInput.value = savedPlayerColor;
  playerColorStatus.textContent = '';
  playerColorSave = Promise.resolve(true);
  mouseSensitivitySettings.setUser(user.username);
  updateMouseSensitivityControls();
  if (typeof user?.loadout?.primaryWeapon === 'string' && WEAPONS[user.loadout.primaryWeapon] && WEAPONS[user.loadout.primaryWeapon].selectable !== false) {
    selectedWeaponKey = user.loadout.primaryWeapon;
  }
  if (userUsernameEl) {
    userUsernameEl.textContent = user.username;
  }
  if (homeUsernameEl) homeUsernameEl.textContent = user.username;
  if (userInfoEl) {
    userInfoEl.classList.remove("hidden");
  }
  const coins =
    user &&
    user.currencies &&
    typeof user.currencies.Coins === "number"
      ? user.currencies.Coins
      : 0;
  setCoinsValue(coins);
  if (authOverlay) {
    authOverlay.classList.add("hidden");
  }
  setAuthError("");
  if (!socket.connected) {
    socket.connect();
  }
  updateLoadoutSummary();
  renderCareerStats();
  setActiveScreen(homeScreen);
}

function applyLoggedOutState() {
  currentUser = null;
  loadoutUI.clear();
  mouseSensitivitySettings.setUser(null);
  currentLobby = null;
  if(startFloorInput)startFloorInput.value='1';
  if(pvpDebugMap)pvpDebugMap.value='';
  if(pvpDebugDouble)pvpDebugDouble.checked=false;
  if (userInfoEl) {
    userInfoEl.classList.add("hidden");
  }
  if (coinsIndicatorEl) {
    coinsIndicatorEl.classList.add("hidden");
  }
  if (authOverlay) {
    authOverlay.classList.remove("hidden");
  }
  setAuthError("");
  if (socket.connected) {
    socket.disconnect();
  }
}

async function bootstrapAuth() {
  try {
    const res = await fetch("/api/me", {
      credentials: "include",
    });
    if (!res.ok) {
      applyLoggedOutState();
      return;
    }
    const data = await res.json();
    applyAuthenticatedState(data);
  } catch (err) {
    console.error("Failed to bootstrap auth:", err);
    applyLoggedOutState();
  }
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  const username = loginUsernameInput.value.trim();
  const password = loginPasswordInput.value;
  if (!username || !password) {
    setAuthError("Username and password are required.");
    return;
  }
  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setAuthError(body.error || "Login failed.");
      return;
    }
    const data = await res.json();
    applyAuthenticatedState(data);
  } catch (err) {
    console.error("Login failed:", err);
    setAuthError("Unable to reach server. Try again.");
  }
}

async function handleRegisterSubmit(event) {
  event.preventDefault();
  const username = registerUsernameInput.value.trim();
  const password = registerPasswordInput.value;
  if (!username || !password) {
    setAuthError("Username and password are required.");
    return;
  }
  try {
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setAuthError(body.error || "Registration failed.");
      return;
    }
    const data = await res.json();
    applyAuthenticatedState(data);
  } catch (err) {
    console.error("Register failed:", err);
    setAuthError("Unable to reach server. Try again.");
  }
}

async function handleLogoutClick() {
  try {
    await fetch("/api/logout", {
      method: "POST",
      credentials: "include",
    });
  } catch (err) {
    console.error("Logout request failed:", err);
  } finally {
    applyLoggedOutState();
  }
}

function showLoginTab() {
  if (!loginForm || !registerForm) return;
  loginForm.classList.remove("hidden");
  registerForm.classList.add("hidden");
  if (loginTabBtn) loginTabBtn.classList.add("active");
  if (registerTabBtn) registerTabBtn.classList.remove("active");
  setAuthError("");
}

function showRegisterTab() {
  if (!loginForm || !registerForm) return;
  loginForm.classList.add("hidden");
  registerForm.classList.remove("hidden");
  if (loginTabBtn) loginTabBtn.classList.remove("active");
  if (registerTabBtn) registerTabBtn.classList.add("active");
  setAuthError("");
}

// Event listeners
function updateMouseSensitivityControls() {
  const percent = mouseSensitivitySettings.getPercent();
  if (mouseSensitivitySlider) mouseSensitivitySlider.value = String(percent);
  if (mouseSensitivityValue) mouseSensitivityValue.value = `${percent}%`;
}

if (playBtn) playBtn.addEventListener('click', createFireteam);
if (startBtn) {
  startBtn.addEventListener("click", startGame);
}
if(pvpDebugDouble) {
  pvpDebugDouble.addEventListener('change',updateStartButtonState);
}
if (leaveLobbyBtn) leaveLobbyBtn.addEventListener('click', leaveFireteam);
if (openArmoryBtn) openArmoryBtn.addEventListener('click', openShop);
if (openSettingsBtn) openSettingsBtn.addEventListener('click', () => {
  updateMouseSensitivityControls();
  setActiveScreen(settingsScreen);
});
if (settingsBackBtn) settingsBackBtn.addEventListener('click', () => setActiveScreen(homeScreen));
if (mouseSensitivitySlider) mouseSensitivitySlider.addEventListener('input', () => {
  mouseSensitivitySettings.setPercent(mouseSensitivitySlider.value);
  updateMouseSensitivityControls();
});
if (resetMouseSensitivityBtn) resetMouseSensitivityBtn.addEventListener('click', () => {
  mouseSensitivitySettings.setPercent(100);
  updateMouseSensitivityControls();
});
modeChoices.forEach(button => button.addEventListener('click', () => {
  selectedMode = button.dataset.mode || 'pvp';
  modeChoices.forEach(choice => choice.classList.toggle('active', choice === button));
}));
if (loginForm) {
  loginForm.addEventListener("submit", handleLoginSubmit);
}
if (registerForm) {
  registerForm.addEventListener("submit", handleRegisterSubmit);
}
if (logoutBtn) {
  logoutBtn.addEventListener("click", handleLogoutClick);
}
if (loginTabBtn) {
  loginTabBtn.addEventListener("click", showLoginTab);
}
if (registerTabBtn) {
  registerTabBtn.addEventListener("click", showRegisterTab);
}

if (coinsIndicatorEl) {
  coinsIndicatorEl.addEventListener("click", () => {
    if (!currentUser) {
      applyLoggedOutState();
      return;
    }
    const inGame =
      gameScreen && !gameScreen.classList.contains("hidden");
    if (inGame) {
      return;
    }
    openShop();
  });
}

if (shopBackBtn) {
  shopBackBtn.addEventListener("click", () => {
    const target = lastNonShopScreen || homeScreen;
    setActiveScreen(target);
  });
}

bootstrapAuth();

socket.on("authError", (payload) => {
  if (!payload || !payload.message) return;
  setAuthError(payload.message);
  applyLoggedOutState();
});

// Live coin updates from the server (e.g., on kills)
socket.on("coinsUpdated", (payload) => {
  if (!payload || typeof payload.coins !== "number") return;
  const coins = payload.coins;
  setCoinsValue(coins);
});

socket.on('statsUpdated', stats => {
  if (!currentUser || !stats || typeof stats !== 'object') return;
  currentUser.stats = stats;
  renderCareerStats();
});

function setLobbyStatus(message, isError = false) {
  if (lobbyStatusEl) {
    lobbyStatusEl.textContent = message || '';
    lobbyStatusEl.classList.toggle('error', !!message && isError);
  }
  if (lobbyActionStatusEl) {
    lobbyActionStatusEl.textContent = message || '';
    lobbyActionStatusEl.classList.toggle('error', !!message && isError);
  }
}

function emitLobbyAction(event, payload, onSuccess) {
  if (!currentUser) return applyLoggedOutState();
  setLobbyStatus('Contacting network…');
  socket.timeout(4000).emit(event, payload || {}, (error, result) => {
    if (error) return setLobbyStatus('The server did not respond. Try again.', true);
    if (!result?.ok) return setLobbyStatus(result?.error || 'That action could not be completed.', true);
    setLobbyStatus('');
    onSuccess?.(result);
  });
}

async function createFireteam() {
  if (!await playerColorSave) return;
  window.cancelPendingGameReturn?.();
  emitLobbyAction('lobby:create', { mode: selectedMode, weapon: selectedWeaponKey }, result => {
    if(pvpDebugDouble)pvpDebugDouble.checked=false;
    currentLobby = result.lobby;
    renderCurrentLobby();
    setActiveScreen(lobbyScreen);
  });
}

async function joinFireteam(lobbyId) {
  if (!await playerColorSave) return;
  window.cancelPendingGameReturn?.();
  emitLobbyAction('lobby:join', { lobbyId, weapon: selectedWeaponKey }, result => {
    currentLobby = result.lobby;
    if(result.lateJoin) {
      setActiveScreen(gameScreen);
      window.initLatePveJoin?.(result.lateJoin);
      return;
    }
    renderCurrentLobby();
    setActiveScreen(lobbyScreen);
  });
}

function leaveFireteam() {
  emitLobbyAction('lobby:leave', {}, () => {
    currentLobby = null;
    setActiveScreen(homeScreen);
    socket.emit('lobby:list:request');
  });
}

async function loadoutRequest(path, body) {
  if (!currentUser) throw new Error('Sign in to change equipment.');
  const username = currentUser.username;
  const response = await fetch(path, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Could not save equipment. Try again.');
  if (currentUser?.username !== username) throw new Error('Your account changed. Please try again.');
  return data;
}

async function equipLoadoutItem(item) {
  if (item.kind === 'weapon') {
    // Save the weapon and finish together, so a failed request cannot leave
    // the character displaying a combination the account didn't equip.
    const data = await loadoutRequest('/api/loadout', {
      skinKey: item.key,
      ...(item.slot === 'primary' ? { primaryWeapon: item.weaponKey } : {}),
    });
    currentUser.skins = data.user.skins;
    if (item.slot === 'primary') {
      selectedWeaponKey = data.user.loadout.primaryWeapon;
      currentUser.loadout = { ...currentUser.loadout, primaryWeapon: selectedWeaponKey };
      if (currentLobby) emitLobbyAction('lobby:loadout', { weapon: selectedWeaponKey });
    }
  } else {
    const data = await loadoutRequest('/api/armor/equip', { slot: item.slot, itemId: item.kind === 'none' ? null : item.id });
    currentUser.armor = data.armor;
  }
  updateLoadoutSummary(false);
}

async function purchaseLoadoutItem(item) {
  const data = await loadoutRequest(item.kind === 'weapon' ? '/api/shop/purchase' : '/api/armor/purchase',
    item.kind === 'weapon' ? { skinKey: item.key } : { itemKey: item.key });
  if (data.user) currentUser.skins = data.user.skins;
  if (data.armor) currentUser.armor = data.armor;
  const currencies = data.currencies || data.user?.currencies;
  if (currencies) setCoinsValue(currencies.Coins);
  updateLoadoutSummary(false);
}

function equippedSkinName(weaponKey) {
  const equipped = currentUser?.skins?.equippedByWeapon?.[weaponKey];
  const list = typeof WEAPON_SKINS !== 'undefined' ? (WEAPON_SKINS[weaponKey] || []) : [];
  return list.find(skin => skin.key === equipped)?.name || 'Standard issue';
}

function equippedSkinKey(weaponKey) {
  const list = typeof WEAPON_SKINS !== 'undefined' ? (WEAPON_SKINS[weaponKey] || []) : [];
  const equipped = currentUser?.skins?.equippedByWeapon?.[weaponKey];
  if (list.some(skin => skin.key === equipped)) return equipped;
  return list.find(skin => skin.isDefault)?.key || list[0]?.key || '';
}

function statCount(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function renderCareerStats() {
  const stats = currentUser?.stats || {};
  const pveKills = statCount(stats.pveKills);
  const pvpKills = statCount(stats.pvpKills);
  const totalKills = pveKills + pvpKills;
  const format = value => new Intl.NumberFormat().format(value);
  if (totalKillsValueEl) totalKillsValueEl.textContent = format(totalKills);
  if (pveKillsValueEl) pveKillsValueEl.textContent = format(pveKills);
  if (pvpKillsValueEl) pvpKillsValueEl.textContent = format(pvpKills);
  if (grenadesThrownValueEl) grenadesThrownValueEl.textContent = format(statCount(stats.grenadesThrown));
  const pveShare = totalKills ? pveKills / totalKills * 100 : 0;
  const pvpShare = totalKills ? pvpKills / totalKills * 100 : 0;
  if (pveKillsBarEl) pveKillsBarEl.style.width = `${pveShare}%`;
  if (pvpKillsBarEl) pvpKillsBarEl.style.width = `${pvpShare}%`;

  if (!weaponKillListEl || typeof WEAPONS === 'undefined') return;
  const weaponKills = stats.weaponKills || {};
  const keys = ['autoRifle', 'shotgun', 'sniper', 'miniGun', 'pistol'];
  const peak = Math.max(1, ...keys.map(key => statCount(weaponKills[key])));
  weaponKillListEl.replaceChildren();
  for (const key of keys) {
    const count = statCount(weaponKills[key]);
    const row = document.createElement('div');
    row.className = 'weapon-kill-row';
    if (key === selectedWeaponKey || key === 'pistol') row.classList.add('equipped');
    const name = document.createElement('span');
    name.textContent = WEAPONS[key]?.name || key;
    const track = document.createElement('i');
    const fill = document.createElement('b');
    fill.style.width = `${count ? Math.max(4, count / peak * 100) : 0}%`;
    track.appendChild(fill);
    const value = document.createElement('strong');
    value.textContent = format(count);
    row.setAttribute('aria-label', `${name.textContent}: ${format(count)} kills`);
    row.append(name, track, value);
    weaponKillListEl.appendChild(row);
  }
}

function updateLoadoutSummary(renderEquipment = true) {
  const weapon = WEAPONS?.[selectedWeaponKey];
  if (!weapon) return;
  if (loadoutPreviewCanvas) {
    const skinKey = equippedSkinKey(selectedWeaponKey);
    const secondarySkinKey = equippedSkinKey('pistol');
    loadoutPreviewCanvas.dataset.weaponKey = selectedWeaponKey;
    loadoutPreviewCanvas.dataset.skinKey = skinKey;
    loadoutPreviewCanvas.dataset.secondarySkinKey = secondarySkinKey;
    const playerColor = currentUser?.loadout?.playerColor || '#59daca';
    const armorAppearance=loadoutUI.appearance();
    loadoutPreviewCanvas.dataset.armor=JSON.stringify(armorAppearance);
    loadoutPreviewCanvas.dataset.playerColor = playerColor;
    loadoutPreviewCanvas.setAttribute('aria-label', `Operator holding ${weapon.name} with ${equippedSkinName(selectedWeaponKey)} skin and Pistol with ${equippedSkinName('pistol')} skin`);
    loadoutPreviewCanvas.dispatchEvent(new CustomEvent('loadout-preview:update', {
      detail: { weaponKey: selectedWeaponKey, skinKey, secondarySkinKey, playerColor, armorAppearance },
    }));
  }
  renderCareerStats();
  if (renderEquipment) loadoutUI.render();
}

// --- Shop UI ---

function setShopStatus(message) {
  if (!shopStatusEl) return;
  if (!message) {
    shopStatusEl.textContent = "";
  } else {
    shopStatusEl.textContent = message;
  }
}

async function openShop() {
  setActiveScreen(shopScreen);
  setShopStatus("Loading skins...");
  if (shopContentEl) {
    shopContentEl.innerHTML = "";
  }
  try {
    const res = await fetch("/api/shop/skins", {
      credentials: "include",
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setShopStatus(body.error || "Failed to load shop.");
      return;
    }
    const data = await res.json();
    shopSkins = Array.isArray(data.skins) ? data.skins : [];
    if (data.currencies && typeof data.currencies.Coins === "number") {
      setCoinsValue(data.currencies.Coins);
    }
    renderShop();
    if (shopSkins.length === 0) {
      setShopStatus("No skins available yet.");
    } else {
      setShopStatus("");
    }
  } catch (err) {
    console.error("Failed to load shop:", err);
    setShopStatus("Unable to reach server. Try again.");
  }
}

function renderShop() {
  if (!shopContentEl) return;
  shopContentEl.innerHTML = "";
  if (typeof WEAPONS === "undefined") return;

  const byWeapon = {};
  shopSkins.forEach((skin) => {
    if (!skin || !skin.weaponKey) return;
    if (!byWeapon[skin.weaponKey]) {
      byWeapon[skin.weaponKey] = [];
    }
    byWeapon[skin.weaponKey].push(skin);
  });

  Object.keys(WEAPONS).forEach((weaponKey) => {
    const skinsForWeapon = byWeapon[weaponKey];
    if (!skinsForWeapon || skinsForWeapon.length === 0) return;
    const weaponCfg = WEAPONS[weaponKey];

    const section = document.createElement("section");
    section.className = "shop-weapon-section";

    // Header with title/description and a collapse toggle
    const header = document.createElement("div");
    header.className = "shop-weapon-header";

    const headerMain = document.createElement("div");
    headerMain.className = "shop-weapon-header-main";

    const titleSpan = document.createElement("div");
    titleSpan.className = "shop-weapon-title";
    titleSpan.textContent = weaponCfg.name || weaponKey;

    const subtitleP = document.createElement("p");
    subtitleP.className = "shop-weapon-subtitle";
    subtitleP.textContent = weaponCfg.description || "";

    headerMain.appendChild(titleSpan);
    headerMain.appendChild(subtitleP);

    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "shop-weapon-toggle";
    toggleBtn.setAttribute("aria-label", "Toggle skins");

    const toggleIcon = document.createElement("span");
    toggleIcon.textContent = "▾";
    toggleBtn.appendChild(toggleIcon);

    header.appendChild(headerMain);
    header.appendChild(toggleBtn);
    section.appendChild(header);

    const body = document.createElement("div");
    body.className = "shop-weapon-body collapsed";

    const grid = document.createElement("div");
    grid.className = "shop-grid";

    skinsForWeapon
      .slice()
      .sort((a, b) => {
        const priceA = typeof a.price === "number" ? a.price : 0;
        const priceB = typeof b.price === "number" ? b.price : 0;
        if (a.isDefault && !b.isDefault) return -1;
        if (!a.isDefault && b.isDefault) return 1;
        if (priceA !== priceB) return priceA - priceB;
        return a.name.localeCompare(b.name);
      })
      .forEach((skin) => {
        grid.appendChild(createSkinCard(weaponKey, skin));
      });

    body.appendChild(grid);
    section.appendChild(body);

    let collapsed = true;
    if (
      shopSectionCollapseState &&
      Object.prototype.hasOwnProperty.call(shopSectionCollapseState, weaponKey)
    ) {
      collapsed = !!shopSectionCollapseState[weaponKey];
    }

    function setCollapsed(next) {
      collapsed = next;
      if (shopSectionCollapseState) {
        shopSectionCollapseState[weaponKey] = collapsed;
      }
      if (collapsed) {
        body.classList.add("collapsed");
        toggleBtn.setAttribute("aria-expanded", "false");
        toggleIcon.textContent = "▸";
        // Stop any running mini-previews when the section is closed.
        if (typeof stopWeaponSkinMiniPreview === "function") {
          const canvases = body.querySelectorAll("canvas");
          canvases.forEach((c) => {
            stopWeaponSkinMiniPreview(c);
          });
        }
      } else {
        body.classList.remove("collapsed");
        toggleBtn.setAttribute("aria-expanded", "true");
        toggleIcon.textContent = "▾";
        // When we first show this section, some previews may have been
        // drawn while hidden (zero width), which can distort them.
        // Re-draw all static previews now that layout is stable.
        if (typeof drawWeaponSkinPreview === "function") {
          const canvases = body.querySelectorAll("canvas");
          // Use a frame tick so clientWidth/clientHeight are up to date.
          requestAnimationFrame(() => {
            canvases.forEach((c) => {
              // Skip canvases that currently have an active mini-preview.
              if (c.__weaponPreview && c.__weaponPreview.active) return;
              const wKey = c.dataset.weaponKey || weaponKey;
              const sKey = c.dataset.skinKey || "";
              drawWeaponSkinPreview(c, wKey, sKey);
            });
          });
        }
      }
    }

    setCollapsed(collapsed);

    toggleBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      setCollapsed(!collapsed);
    });

    headerMain.addEventListener("click", () => {
      setCollapsed(!collapsed);
    });

    shopContentEl.appendChild(section);
  });
}

function createSkinCard(weaponKey, skin) {
  const card = document.createElement("div");
  card.className = "shop-card";
  if (skin.owned) {
    card.classList.add("badge-owned");
  }
  if (skin.equipped) {
    card.classList.add("badge-equipped");
  }

  const headerRow = document.createElement("div");
  headerRow.className = "shop-card-header-row";

  const title = document.createElement("div");
  title.className = "shop-card-title";
  title.textContent = skin.name;

  const pill = document.createElement("div");
  pill.className = "shop-card-pill";
  pill.textContent = skin.isDefault ? "Default" : "Skin";

  headerRow.appendChild(title);
  headerRow.appendChild(pill);
  card.appendChild(headerRow);

  if (skin.description) {
    const desc = document.createElement("p");
    desc.className = "shop-card-description";
    desc.textContent = skin.description;
    card.appendChild(desc);
  }

  const previewWrapper = document.createElement("div");
  previewWrapper.className = "shop-card-preview";
  const canvas = document.createElement("canvas");
  // Remember which weapon/skin this canvas represents so we can
  // re-draw it later when its section is expanded.
  canvas.dataset.weaponKey = weaponKey;
  canvas.dataset.skinKey = skin.key;
  previewWrapper.appendChild(canvas);
  card.appendChild(previewWrapper);

  // Clicking anywhere in the preview box toggles a tiny
  // interactive "mini game" preview for this weapon skin.
  previewWrapper.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!canvas) return;
    const hasActivePreview =
      canvas.__weaponPreview && canvas.__weaponPreview.active;
    if (hasActivePreview) {
      if (typeof stopWeaponSkinMiniPreview === "function") {
        stopWeaponSkinMiniPreview(canvas);
      }
      if (typeof drawWeaponSkinPreview === "function") {
        drawWeaponSkinPreview(canvas, weaponKey, skin.key);
      }
    } else {
      if (typeof startWeaponSkinMiniPreview === "function") {
        startWeaponSkinMiniPreview(canvas, weaponKey, skin.key);
      }
    }
  });

  // Defer preview drawing to next tick so layout has size
  requestAnimationFrame(() => {
    if (typeof drawWeaponSkinPreview === "function") {
      drawWeaponSkinPreview(canvas, weaponKey, skin.key);
    }
  });

  const footer = document.createElement("div");
  footer.className = "shop-card-footer";

  const priceDiv = document.createElement("div");
  priceDiv.className = "shop-price";
  if (skin.price && skin.price > 0 && !skin.owned) {
    const coin = document.createElement("span");
    coin.className = "coin-icon";
    const label = document.createElement("span");
    label.className = "shop-price-label";
    label.textContent = `${skin.price} Coins`;
    priceDiv.appendChild(coin);
    priceDiv.appendChild(label);
  } else if (skin.isDefault) {
    const label = document.createElement("span");
    label.className = "shop-price-label";
    label.textContent = "Owned (starter)";
    priceDiv.appendChild(label);
  } else if (skin.owned) {
    const label = document.createElement("span");
    label.className = "shop-price-label";
    label.textContent = "Owned";
    priceDiv.appendChild(label);
  } else {
    const label = document.createElement("span");
    label.className = "shop-price-label";
    label.textContent = "Free";
    priceDiv.appendChild(label);
  }

  footer.appendChild(priceDiv);

  const actionBtn = document.createElement("button");
  actionBtn.className = "btn btn-primary btn-xs";

  function updateButtonState() {
    const coins =
      currentUser &&
      currentUser.currencies &&
      typeof currentUser.currencies.Coins === "number"
        ? currentUser.currencies.Coins
        : 0;
    if (skin.equipped) {
      actionBtn.textContent = "Equipped";
      actionBtn.disabled = true;
    } else if (skin.owned) {
      actionBtn.textContent = "Equip";
      actionBtn.disabled = false;
    } else if (skin.price && skin.price > 0 && coins < skin.price) {
      actionBtn.textContent = "Not enough Coins";
      actionBtn.disabled = true;
    } else {
      actionBtn.textContent =
        skin.price && skin.price > 0
          ? `Buy for ${skin.price}`
          : "Unlock";
      actionBtn.disabled = false;
    }
  }

  updateButtonState();

  actionBtn.addEventListener("click", async () => {
    if (!currentUser) {
      applyLoggedOutState();
      return;
    }
    if (skin.owned && !skin.equipped) {
      await equipSkin(skin.key);
    } else if (!skin.owned) {
      await purchaseSkin(skin.key);
    }
  });

  footer.appendChild(actionBtn);
  card.appendChild(footer);

  return card;
}

async function purchaseSkin(skinKey) {
  setShopStatus("Purchasing skin...");
  try {
    const res = await fetch("/api/shop/purchase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ skinKey }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setShopStatus(data.error || "Purchase failed.");
      return;
    }
    if (data.user && data.user.currencies && typeof data.user.currencies.Coins === "number") {
      currentUser = {
        ...(currentUser || {}),
        currencies: data.user.currencies,
        skins: data.user.skins || currentUser?.skins,
      };
      updateLoadoutSummary();
      setCoinsValue(data.user.currencies.Coins);
    }
    // Refresh shop state
    await openShop();
    setShopStatus("Skin purchased.");
  } catch (err) {
    console.error("Purchase failed:", err);
    setShopStatus("Unable to reach server. Try again.");
  }
}

async function equipSkin(skinKey) {
  setShopStatus("Equipping skin...");
  try {
    const res = await fetch("/api/shop/equip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ skinKey }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setShopStatus(data.error || "Equip failed.");
      return;
    }
    if (data.user) {
      // Keep currentUser in sync on skins + currencies
      currentUser = {
        ...(currentUser || {}),
        currencies: data.user.currencies || (currentUser && currentUser.currencies) || {},
        skins: data.user.skins || (currentUser && currentUser.skins) || {},
        username: data.user.username || (currentUser && currentUser.username),
        id: data.user.id || (currentUser && currentUser.id),
      };
      if (data.user.currencies && typeof data.user.currencies.Coins === "number") {
        setCoinsValue(data.user.currencies.Coins);
      }
      updateLoadoutSummary();
    }
    // Refresh shop UI to reflect equipped state
    await openShop();
    setShopStatus("Skin equipped.");
  } catch (err) {
    console.error("Equip failed:", err);
    setShopStatus("Unable to reach server. Try again.");
  }
}

// Start game
function startGame() {
  if (!currentLobby) return;
  const options={};
  if(currentLobby.mode==='pve'&&currentUser?.username==='qing') {
    const floor=Number(startFloorInput.value);
    startFloorInput.setCustomValidity(Number.isSafeInteger(floor)&&floor>=1?'':'Enter a positive whole-number floor.');
    if(!startFloorInput.reportValidity())return;
    options.startFloor=floor;
  }
  if(currentLobby.mode==='pvp'&&currentUser?.username==='qing') {
    if(pvpDebugMap?.value)options.pvpMap=pvpDebugMap.value;
    options.debugDouble=!!pvpDebugDouble?.checked;
  }
  emitLobbyAction('lobby:start', options);
}

function updateStartButtonState() {
  const isOwner = currentLobby?.ownerId === socket.id;
  const isPve = currentLobby?.mode === 'pve';
  const isCoop = isPve;
  startFloorRow?.classList.toggle('hidden',currentUser?.username!=='qing'||!isPve||!isOwner);
  pvpDebugRow?.classList.toggle('hidden',currentUser?.username!=='qing'||currentLobby?.mode!=='pvp'||!isOwner);
  if (!startBtn) return;
  const humanCount = currentLobby?.players?.length || 0;
  const debugReady = currentLobby?.mode==='pvp'&&currentUser?.username==='qing'&&pvpDebugDouble?.checked&&humanCount>=1;
  const hasBothTeams=currentLobby?.pvpMode!=='teams'||debugReady||
    new Set(currentLobby.players.map(player=>player.team)).size===2;
  const canStart = isOwner && hasBothTeams && (isCoop ? humanCount >= 1 : humanCount >= 2 || debugReady);
  startBtn.disabled = !canStart;
  if (lobbyLeaderNoteEl) {
    lobbyLeaderNoteEl.textContent = isOwner
      ? (canStart ? 'You are the fireteam leader. Launch when ready.' : !hasBothTeams?
        'Both teams need at least one player.' : 'Invite another player or wait for someone to join.')
      : `Waiting for ${currentLobby?.ownerName || 'the leader'} to launch.`;
  }
}

function renderCurrentLobby() {
  if (!currentLobby || !waitingPlayersList) return;
  lobbyTitleEl.textContent = currentLobby.name;
  lobbyCapacityEl.textContent = `${currentLobby.players.length} / ${currentLobby.maxPlayers} OPERATIVES`;
  pvpModeRow.classList.toggle('hidden',currentLobby.mode!=='pvp');
  pvpModeButtons.forEach(button=>{
    button.setAttribute('aria-pressed',String(button.dataset.pvpMode===(currentLobby.pvpMode||'ffa')));
    button.disabled=currentLobby.ownerId!==socket.id;
  });
  const teamMode=currentLobby.mode==='pvp'&&currentLobby.pvpMode==='teams';
  pvpTeamNote.textContent=teamMode?'Choose your team. Last team standing wins.':
    'Every player for themselves. The leader chooses the match type.';
  waitingPlayersList.classList.toggle('hidden',teamMode);
  document.getElementById('roster-title').classList.toggle('hidden',teamMode);
  teamColumns.classList.toggle('hidden',!teamMode);
  if(teamMode) {
    teamLobby.render(currentLobby);updateStartButtonState();return;
  }
  waitingPlayersList.replaceChildren();
  currentLobby.players.forEach((player, index) => {
    const li = document.createElement('li');
    const identity = document.createElement('div');
    identity.className = 'roster-identity';
    identity.innerHTML = `<span>${String(index + 1).padStart(2,'0')}</span><strong></strong>`;
    identity.querySelector('strong').textContent = player.username;
    const weapon = document.createElement('small');
    weapon.textContent = WEAPONS[player.weapon]?.name || 'Auto Rifle';
    li.append(identity, weapon);
    if (player.id === currentLobby.ownerId) li.dataset.leader = 'true';
    waitingPlayersList.appendChild(li);
  });
  updateStartButtonState();
}

function renderLobbyBrowser() {
  const canJoinLobby = lobby => {
    if (typeof lobby.joinable === 'boolean') return lobby.joinable;
    const supportsJoining = lobby.status === 'open' ||
      (lobby.mode === 'pve' && lobby.status === 'active');
    const visiblePlayers = Array.isArray(lobby.players) ? lobby.players.length : 0;
    return supportsJoining && visiblePlayers < Number(lobby.maxPlayers || 0);
  };
  const available = knownLobbies.filter(canJoinLobby);
  if (onlineLobbyCountEl) onlineLobbyCountEl.textContent = `${available.length} JOINABLE`;
  const renderMode = (mode, container) => {
    if (!container) return;
    container.replaceChildren();
    const lobbies = knownLobbies.filter(lobby => lobby.mode === mode);
    if (!lobbies.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-lobbies';
      empty.innerHTML = `<strong>No fireteams waiting</strong><span>Create one and take point.</span>`;
      container.appendChild(empty);
      return;
    }
    lobbies.forEach(lobby => {
      const card = document.createElement('article');
      const canJoin = canJoinLobby(lobby);
      const lateJoin=lobby.mode==='pve'&&lobby.status==='active'&&canJoin;
      card.className = `lobby-card ${lobby.status}${lateJoin?' late-join':''}`;
      const copy = document.createElement('div');
      copy.className = 'lobby-card-copy';
      const names = lobby.players.map(player => player.username).join(', ');
      copy.innerHTML = `<strong></strong><span></span><small></small>`;
      copy.querySelector('strong').textContent = lobby.name;
      copy.querySelector('span').textContent = names || 'Empty';
      copy.querySelector('small').textContent = lateJoin?
        `FLOOR ${lobby.floor||1} · DEPLOY NEXT FLOOR`:
        lobby.status === 'active' ? 'MATCH IN PROGRESS' : `${lobby.players.length} / ${lobby.maxPlayers} READY`;
      if(lobby.mode==='pvp')copy.querySelector('small').textContent+=
        lobby.pvpMode==='teams'?' · TEAMS':' · FREE-FOR-ALL';
      const action = document.createElement('button');
      action.className = 'lobby-join';
      action.textContent = lateJoin ? 'JOIN NEXT' : lobby.status === 'active' ? 'LIVE' : 'JOIN';
      action.disabled = !canJoin;
      action.addEventListener('click', () => joinFireteam(lobby.id));
      card.append(copy, action);
      container.appendChild(card);
    });
  };
  renderMode('pvp', pvpLobbyListEl);
  renderMode('pve', pveLobbyListEl);
}

// Socket event handlers
socket.on('lobby:list', lobbies => {
  knownLobbies = Array.isArray(lobbies) ? lobbies : [];
  renderLobbyBrowser();
});

socket.on('lobby:state', lobby => {
  if (!lobby || !currentLobby || lobby.id !== currentLobby.id) return;
  currentLobby = lobby;
  renderCurrentLobby();
});

// Backward-compatible engine notification; authoritative lobby state follows it.
socket.on("updateWaitingList", () => {});

socket.on("gameStarting", (gameData) => {
  setActiveScreen(gameScreen);

  // Initialize game
  initGame(gameData.players, gameData.walls, gameData.map, gameData.serverNow);
});

socket.on("resetGame", () => {
  currentLobby = null;
  setActiveScreen(homeScreen);
  socket.emit('lobby:list:request');
});
