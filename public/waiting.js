const socket = io();

// DOM elements
const loginScreen = document.getElementById("login-screen");
const weaponScreen = document.getElementById("weapon-screen");
const waitingScreen = document.getElementById("waiting-screen");
const gameScreen = document.getElementById("game-screen");
const nameInput = document.getElementById("name-input");
const joinBtn = document.getElementById("join-btn");
const startBtn = document.getElementById("start-btn");
const waitingPlayersList = document.getElementById("waiting-players");
const weaponOptionsEl = document.getElementById("weapon-options");
const weaponConfirmBtn = document.getElementById("weapon-confirm-btn");

// Player data
let playerName = "";
let selectedWeaponKey = (typeof DEFAULT_WEAPON_KEY !== 'undefined' ? DEFAULT_WEAPON_KEY : 'pistol');

// Event listeners
joinBtn.addEventListener("click", goToWeaponSelection);
startBtn.addEventListener("click", startGame);
nameInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") goToWeaponSelection();
});
weaponConfirmBtn.addEventListener("click", joinWaitingRoom);

// Join waiting room
function goToWeaponSelection() {
  playerName = nameInput.value.trim();
  if (!playerName) return;
  // Move to weapon selection step
  loginScreen.classList.add("hidden");
  weaponScreen.classList.remove("hidden");
  renderWeaponOptions();
}

// Join waiting room with selected weapon
function joinWaitingRoom() {
  if (!playerName) return;
  if (!selectedWeaponKey) selectedWeaponKey = 'pistol';
  socket.emit("join", { name: playerName, weapon: selectedWeaponKey });
  weaponScreen.classList.add("hidden");
  waitingScreen.classList.remove("hidden");
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
  waitingScreen.classList.add("hidden");
  gameScreen.classList.remove("hidden");

  // Initialize game
  initGame(gameData.players, gameData.walls);
});

socket.on("resetGame", () => {
  gameScreen.classList.add("hidden");
  loginScreen.classList.remove("hidden");
  weaponScreen.classList.add("hidden");
  nameInput.value = "";
});
