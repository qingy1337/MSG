const socket = io({ autoConnect: false });

// DOM elements - screens
const loginScreen = document.getElementById("login-screen");
const weaponScreen = document.getElementById("weapon-screen");
const waitingScreen = document.getElementById("waiting-screen");
const gameScreen = document.getElementById("game-screen");

// Simple screen state helper so only one main screen shows at a time
function setActiveScreen(target) {
  const screens = [loginScreen, weaponScreen, waitingScreen, gameScreen];
  screens.forEach((el) => {
    if (!el) return;
    if (el === target) {
      el.classList.remove("hidden");
    } else {
      el.classList.add("hidden");
    }
  });
}

// DOM elements - lobby
const nameInput = document.getElementById("name-input");
const joinBtn = document.getElementById("join-btn");
const startBtn = document.getElementById("start-btn");
const waitingPlayersList = document.getElementById("waiting-players");
const weaponOptionsEl = document.getElementById("weapon-options");
const weaponConfirmBtn = document.getElementById("weapon-confirm-btn");

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

// Player data
let displayName = "";
let selectedWeaponKey = (typeof DEFAULT_WEAPON_KEY !== 'undefined' ? DEFAULT_WEAPON_KEY : 'pistol');
let currentUser = null;

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
  if (coinsValueEl) {
    coinsValueEl.textContent = coins;
  }
  if (coinsIndicatorEl) {
    coinsIndicatorEl.classList.remove("hidden");
  }
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
if (nameInput) {
  nameInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") goToWeaponSelection();
  });
}
if (weaponConfirmBtn) {
  weaponConfirmBtn.addEventListener("click", joinWaitingRoom);
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

bootstrapAuth();

socket.on("authError", (payload) => {
  if (!payload || !payload.message) return;
  setAuthError(payload.message);
  applyLoggedOutState();
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

// Start game
function startGame() {
  socket.emit("startGame");
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

  // Enable or disable start button
  if (players.length >= 2) {
    startBtn.disabled = false;
    startBtn.textContent = "Start Game";
  } else {
    startBtn.disabled = true;
    startBtn.textContent = "Start Game (Need at least 2 players)";
  }
});

socket.on("gameStarting", (gameData) => {
  setActiveScreen(gameScreen);

  // Initialize game
  initGame(gameData.players, gameData.walls);
});

socket.on("resetGame", () => {
  setActiveScreen(loginScreen);
  nameInput.value = "";
});
