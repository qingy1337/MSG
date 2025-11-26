const socket = io({ autoConnect: false });

// DOM elements - screens
const loginScreen = document.getElementById("login-screen");
const weaponScreen = document.getElementById("weapon-screen");
const waitingScreen = document.getElementById("waiting-screen");
const gameScreen = document.getElementById("game-screen");
const shopScreen = document.getElementById("shop-screen");

// Simple screen state helper so only one main screen shows at a time
function setActiveScreen(target) {
  const screens = [loginScreen, weaponScreen, waitingScreen, gameScreen, shopScreen];
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
}

// DOM elements - lobby
const nameInput = document.getElementById("name-input");
const joinBtn = document.getElementById("join-btn");
const startBtn = document.getElementById("start-btn");
const enableBotsCheckbox = document.getElementById("enable-bots-toggle");
const waitingPlayersList = document.getElementById("waiting-players");
const weaponOptionsEl = document.getElementById("weapon-options");
const weaponConfirmBtn = document.getElementById("weapon-confirm-btn");
const botBattleCountInput = document.getElementById("bot-battle-count");
const startBotBattleBtn = document.getElementById("start-bot-battle-btn");
const openBotBattleBtn = document.getElementById("open-bot-battle-btn");

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
let displayName = "";
let selectedWeaponKey = (typeof DEFAULT_WEAPON_KEY !== 'undefined' ? DEFAULT_WEAPON_KEY : 'pistol');
let currentUser = null;
let lastNonShopScreen = loginScreen;
let shopSkins = [];
let shopSectionCollapseState = {};
let lastWaitingPlayersCount = 0;

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
  if (userUsernameEl) {
    userUsernameEl.textContent = user.username;
  }
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
}

function applyLoggedOutState() {
  currentUser = null;
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
if (joinBtn) {
  joinBtn.addEventListener("click", goToWeaponSelection);
}
if (startBtn) {
  startBtn.addEventListener("click", startGame);
}
if (enableBotsCheckbox) {
  enableBotsCheckbox.addEventListener("change", updateStartButtonState);
}
if (nameInput) {
  nameInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") goToWeaponSelection();
  });
}
if (weaponConfirmBtn) {
  weaponConfirmBtn.addEventListener("click", joinWaitingRoom);
}
if (startBotBattleBtn) {
  startBotBattleBtn.addEventListener("click", startBotBattle);
}
if (openBotBattleBtn) {
  openBotBattleBtn.addEventListener("click", () => {
    if (!currentUser) {
      applyLoggedOutState();
      return;
    }
    setActiveScreen(waitingScreen);
  });
}
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
    const target = lastNonShopScreen || loginScreen;
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

// Join waiting room
function goToWeaponSelection() {
  if (!currentUser) {
    applyLoggedOutState();
    return;
  }
  displayName = nameInput.value.trim();
  if (!displayName) return;
  // Move to weapon selection step
  setActiveScreen(weaponScreen);
  renderWeaponOptions();
}

// Join waiting room with selected weapon
function joinWaitingRoom() {
  if (!currentUser) {
    applyLoggedOutState();
    return;
  }
  if (!displayName) return;
  if (!selectedWeaponKey) selectedWeaponKey = 'pistol';
  socket.emit("join", { displayName, weapon: selectedWeaponKey });
  setActiveScreen(waitingScreen);
}

function renderWeaponOptions() {
  if (typeof WEAPONS === 'undefined') return;
  weaponOptionsEl.innerHTML = "";
  Object.keys(WEAPONS).forEach((key) => {
    const w = WEAPONS[key];
    const card = document.createElement('div');
    card.className = 'weapon-card' + (selectedWeaponKey === key ? ' selected' : '');
    card.setAttribute('data-key', key);
    card.innerHTML = `
      <h3>${w.name}</h3>
      <p>${w.description}</p>
    `;
    card.addEventListener('click', () => {
      selectedWeaponKey = key;
      // update selected
      Array.from(weaponOptionsEl.children).forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');
    });
    weaponOptionsEl.appendChild(card);
  });
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
  const enableBots =
    enableBotsCheckbox && enableBotsCheckbox.checked;
  socket.emit("startGame", { enableBots });
}

function startBotBattle() {
  if (!currentUser) {
    applyLoggedOutState();
    return;
  }
  const raw = botBattleCountInput ? parseInt(botBattleCountInput.value, 10) : 0;
  const clamped = Math.max(2, Math.min(10, Number.isFinite(raw) ? raw : 0));
  if (botBattleCountInput) {
    botBattleCountInput.value = clamped;
  }
  socket.emit("startBotBattle", { botCount: clamped });
}

function updateStartButtonState() {
  if (!startBtn) return;
  const humanCount = lastWaitingPlayersCount;
  const botsEnabled =
    enableBotsCheckbox && enableBotsCheckbox.checked;
  let canStart = humanCount >= 2;
  let label = "Start Game";

  if (!canStart && botsEnabled && humanCount >= 1) {
    canStart = true;
    label = "Start Game (with bots)";
  }

  if (canStart) {
    startBtn.disabled = false;
    startBtn.textContent = label;
  } else {
    startBtn.disabled = true;
    startBtn.textContent = "Start Game (Need at least 2 players)";
  }
}

// Socket event handlers
socket.on("updateWaitingList", (players) => {
  // Update waiting players list
  waitingPlayersList.innerHTML = "";

  players.forEach((player) => {
    const li = document.createElement("li");
    li.textContent = player.name;
    li.style.backgroundColor = player.color;
    waitingPlayersList.appendChild(li);
  });

  lastWaitingPlayersCount = Array.isArray(players) ? players.length : 0;
  updateStartButtonState();
});

socket.on("gameStarting", (gameData) => {
  setActiveScreen(gameScreen);

  // Initialize game
  initGame(gameData.players, gameData.walls, gameData.match || {});
});

socket.on("resetGame", () => {
  setActiveScreen(loginScreen);
  nameInput.value = "";
});
