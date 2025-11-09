const socket = io();

// DOM elements
const loginScreen = document.getElementById("login-screen");
const waitingScreen = document.getElementById("waiting-screen");
const gameScreen = document.getElementById("game-screen");
const nameInput = document.getElementById("name-input");
const joinBtn = document.getElementById("join-btn");
const startBtn = document.getElementById("start-btn");
const waitingPlayersList = document.getElementById("waiting-players");

// Player data
let playerName = "";

// Event listeners
joinBtn.addEventListener("click", joinWaitingRoom);
startBtn.addEventListener("click", startGame);
nameInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") joinWaitingRoom();
});

// Join waiting room
function joinWaitingRoom() {
  playerName = nameInput.value.trim();

  if (playerName) {
    socket.emit("join", playerName);
    loginScreen.classList.add("hidden");
    waitingScreen.classList.remove("hidden");
  }
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
  nameInput.value = "";
});
