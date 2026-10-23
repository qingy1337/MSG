const socket = io({ autoConnect: false });

// DOM elements - screens
const homeScreen = document.getElementById("home-screen");
const lobbyScreen = document.getElementById("lobby-screen");
const gameScreen = document.getElementById("game-screen");
const shopScreen = document.getElementById("shop-screen");

// Simple screen state helper so only one main screen shows at a time
function setActiveScreen(target) {
  const screens = [homeScreen, lobbyScreen, gameScreen, shopScreen];
  if (target && target !== shopScreen && screens.includes(target)) {
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
  if (target !== homeScreen && loadoutDrawerLayer && !loadoutDrawerLayer.classList.contains('hidden')) {
    loadoutDrawerLayer.classList.add('hidden');
    document.body.classList.remove('loadout-open');
  }
}

window.returnToHome = function returnToHome() {
  currentLobby = null;
  setActiveScreen(homeScreen);
  if (socket.connected) socket.emit('lobby:list:request');
};

// DOM elements - lobby
const playBtn = document.getElementById("play-btn");
const startBtn = document.getElementById("start-btn");
const leaveLobbyBtn = document.getElementById('leave-lobby-btn');
const startFloorRow = document.getElementById('pve-start-floor-row');
const startFloorInput = document.getElementById('pve-start-floor');
const pvpDebugRow = document.getElementById('pvp-debug-row');
const pvpDebugMap = document.getElementById('pvp-debug-map');
const pvpDebugDouble = document.getElementById('pvp-debug-double');
const waitingPlayersList = document.getElementById("waiting-players");
const weaponOptionsEl = document.getElementById("weapon-options");
const homeUsernameEl = document.getElementById('home-username');
const selectedWeaponNameEl = document.getElementById('selected-weapon-name');
const selectedWeaponDescriptionEl = document.getElementById('selected-weapon-description');
const selectedSkinNameEl = document.getElementById('selected-skin-name');
const secondarySkinNameEl = document.getElementById('secondary-skin-name');
const loadoutPreviewCanvas = document.getElementById('loadout-weapon-preview');
const changeLoadoutBtn = document.getElementById('change-loadout-btn');
const loadoutDrawerLayer = document.getElementById('loadout-drawer-layer');
const loadoutDrawerDismiss = document.getElementById('loadout-drawer-dismiss');
const closeLoadoutBtn = document.getElementById('close-loadout-btn');
const doneLoadoutBtn = document.getElementById('done-loadout-btn');
const pvpLobbyListEl = document.getElementById('pvp-lobby-list');
const pveLobbyListEl = document.getElementById('pve-lobby-list');
const strikeLobbyListEl = document.getElementById('strike-lobby-list');
const onlineLobbyCountEl = document.getElementById('online-lobby-count');
const lobbyStatusEl = document.getElementById('lobby-status');
const lobbyTitleEl = document.getElementById('lobby-title');
const lobbyCapacityEl = document.getElementById('lobby-capacity');
const lobbyLeaderNoteEl = document.getElementById('lobby-leader-note');
const lobbyActionStatusEl = document.getElementById('lobby-action-status');
const openArmoryBtn = document.getElementById('open-armory-btn');
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
  renderWeaponOptions();
  renderCareerStats();
  setActiveScreen(homeScreen);
}

function applyLoggedOutState() {
  currentUser = null;
  currentLobby = null;
  if(startFloorInput)startFloorInput.value='1';
  if(pvpDebugMap)pvpDebugMap.value='';
  if(pvpDebugDouble)pvpDebugDouble.checked=true;
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
if (playBtn) playBtn.addEventListener('click', createFireteam);
if (startBtn) {
  startBtn.addEventListener("click", startGame);
}
if(pvpDebugDouble) {
  pvpDebugDouble.addEventListener('change',updateStartButtonState);
}
if (leaveLobbyBtn) leaveLobbyBtn.addEventListener('click', leaveFireteam);
if (openArmoryBtn) openArmoryBtn.addEventListener('click', openShop);
if (changeLoadoutBtn) changeLoadoutBtn.addEventListener('click', openLoadoutDrawer);
if (loadoutDrawerDismiss) loadoutDrawerDismiss.addEventListener('click', closeLoadoutDrawer);
if (closeLoadoutBtn) closeLoadoutBtn.addEventListener('click', closeLoadoutDrawer);
if (doneLoadoutBtn) doneLoadoutBtn.addEventListener('click', closeLoadoutDrawer);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && loadoutDrawerLayer && !loadoutDrawerLayer.classList.contains('hidden')) {
    closeLoadoutDrawer();
  }
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

function createFireteam() {
  window.cancelPendingGameReturn?.();
  emitLobbyAction('lobby:create', { mode: selectedMode, weapon: selectedWeaponKey }, result => {
    currentLobby = result.lobby;
    renderCurrentLobby();
    setActiveScreen(lobbyScreen);
  });
}

function joinFireteam(lobbyId) {
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

function renderWeaponOptions() {
  if (typeof WEAPONS === 'undefined' || !weaponOptionsEl) return;
  weaponOptionsEl.innerHTML = "";
  const primaryKeys=Object.keys(WEAPONS).filter(key=>WEAPONS[key].selectable!==false);
  if(!primaryKeys.includes(selectedWeaponKey))selectedWeaponKey=primaryKeys[0]||'autoRifle';
  primaryKeys.forEach((key) => {
    const w = WEAPONS[key];
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'weapon-card' + (selectedWeaponKey === key ? ' selected' : '');
    card.setAttribute('data-key', key);
    card.setAttribute('aria-pressed', selectedWeaponKey === key ? 'true' : 'false');
    const copy = document.createElement('span');
    copy.className = 'loadout-option-copy';
    const name = document.createElement('strong');
    name.className = 'loadout-option-name';
    name.textContent = w.name;
    const description = document.createElement('small');
    description.textContent = w.description || '';
    copy.append(name, description);
    const check = document.createElement('i');
    check.className = 'loadout-option-check';
    check.setAttribute('aria-hidden', 'true');
    card.append(copy, check);
    card.addEventListener('click', () => {
      selectedWeaponKey = key;
      Array.from(weaponOptionsEl.children).forEach((c) => {
        c.classList.remove('selected');
        c.setAttribute('aria-pressed', 'false');
      });
      card.classList.add('selected');
      card.setAttribute('aria-pressed', 'true');
      updateLoadoutSummary();
      savePrimaryLoadout(selectedWeaponKey);
      if (currentLobby) emitLobbyAction('lobby:loadout', { weapon: selectedWeaponKey });
    });
    weaponOptionsEl.appendChild(card);
  });
  updateLoadoutSummary();
}

function openLoadoutDrawer() {
  if (!loadoutDrawerLayer) return;
  loadoutDrawerLayer.classList.remove('hidden');
  document.body.classList.add('loadout-open');
  const selected = weaponOptionsEl?.querySelector('.weapon-card.selected');
  requestAnimationFrame(() => (selected || closeLoadoutBtn)?.focus());
}

function closeLoadoutDrawer() {
  if (!loadoutDrawerLayer) return;
  loadoutDrawerLayer.classList.add('hidden');
  document.body.classList.remove('loadout-open');
  changeLoadoutBtn?.focus();
}

async function savePrimaryLoadout(primaryWeapon) {
  if (!currentUser) return;
  if (!currentUser.loadout) currentUser.loadout = {};
  currentUser.loadout.primaryWeapon = primaryWeapon;
  try {
    const res = await fetch('/api/loadout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ primaryWeapon }),
    });
    if (!res.ok) throw new Error('Loadout save rejected');
  } catch (error) {
    console.error('Failed to save loadout:', error);
    setLobbyStatus('Loadout selected locally; account sync failed.', true);
  }
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

function updateLoadoutSummary() {
  const weapon = WEAPONS?.[selectedWeaponKey];
  if (!weapon) return;
  if (selectedWeaponNameEl) selectedWeaponNameEl.textContent = weapon.name;
  if (selectedWeaponDescriptionEl) selectedWeaponDescriptionEl.textContent = weapon.description || '';
  if (selectedSkinNameEl) selectedSkinNameEl.textContent = equippedSkinName(selectedWeaponKey);
  if (secondarySkinNameEl) secondarySkinNameEl.textContent = equippedSkinName('pistol');
  if (loadoutPreviewCanvas) {
    const skinKey = equippedSkinKey(selectedWeaponKey);
    const secondarySkinKey = equippedSkinKey('pistol');
    loadoutPreviewCanvas.dataset.weaponKey = selectedWeaponKey;
    loadoutPreviewCanvas.dataset.skinKey = skinKey;
    loadoutPreviewCanvas.dataset.secondarySkinKey = secondarySkinKey;
    loadoutPreviewCanvas.setAttribute('aria-label', `Operator holding ${weapon.name} with ${equippedSkinName(selectedWeaponKey)} skin and Pistol with ${equippedSkinName('pistol')} skin`);
    loadoutPreviewCanvas.dispatchEvent(new CustomEvent('loadout-preview:update', {
      detail: { weaponKey: selectedWeaponKey, skinKey, secondarySkinKey },
    }));
  }
  renderCareerStats();
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
      };
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
  const isCoop = isPve || currentLobby?.mode === 'strike';
  startFloorRow?.classList.toggle('hidden',currentUser?.username!=='qing'||!isPve||!isOwner);
  pvpDebugRow?.classList.toggle('hidden',currentUser?.username!=='qing'||currentLobby?.mode!=='pvp'||!isOwner);
  if (!startBtn) return;
  const humanCount = currentLobby?.players?.length || 0;
  const debugReady = currentLobby?.mode==='pvp'&&currentUser?.username==='qing'&&pvpDebugDouble?.checked&&humanCount>=1;
  const canStart = isOwner && (isCoop ? humanCount >= 1 : humanCount >= 2 || debugReady);
  startBtn.disabled = !canStart;
  if (lobbyLeaderNoteEl) {
    lobbyLeaderNoteEl.textContent = isOwner
      ? (canStart ? 'You are the fireteam leader. Launch when ready.' : 'Invite another player or wait for someone to join.')
      : `Waiting for ${currentLobby?.ownerName || 'the leader'} to launch.`;
  }
}

function renderCurrentLobby() {
  if (!currentLobby || !waitingPlayersList) return;
  lobbyTitleEl.textContent = currentLobby.name;
  lobbyCapacityEl.textContent = `${currentLobby.players.length} / ${currentLobby.maxPlayers} OPERATIVES`;
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
  renderMode('strike', strikeLobbyListEl);
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
