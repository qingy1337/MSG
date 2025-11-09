// Game variables
const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");
const playersAliveInfo = document.getElementById("players-alive");
const gameMessage = document.getElementById("game-message");

let players = [];
let localPlayer = null;
let bullets = [];
let walls = [];
let keys = {};
let gameActive = false;

// Constants
const PLAYER_RADIUS = 20;
const WEAPON_LENGTH = 30;
const BULLET_RADIUS = 5;
const PLAYER_SPEED = 5;
const BULLET_SPEED = 10;

// Initialize game
function initGame(gamePlayers, gameWalls) {
  players = gamePlayers;
  walls = gameWalls;
  localPlayer = players.find((p) => p.id === socket.id);
  bullets = [];
  gameActive = true;

  // Set up keyboard controls
  window.addEventListener("keydown", (e) => {
    keys[e.key] = true;
  });
  window.addEventListener("keyup", (e) => {
    keys[e.key] = false;
  });

  // Set up mouse controls
  canvas.addEventListener("mousemove", handleMouseMove);
  canvas.addEventListener("click", handleMouseClick);

  // Start game loop
  gameLoop();

  // Update game info
  updateGameInfo();
}

// Game loop
function gameLoop() {
  if (!gameActive) return;

  update();
  render();
  requestAnimationFrame(gameLoop);
}

// Update game state
function update() {
  if (!localPlayer || !localPlayer.alive) return;

  // Player movement
  let dx = 0;
  let dy = 0;

  if (keys["w"] || keys["ArrowUp"]) dy -= PLAYER_SPEED;
  if (keys["s"] || keys["ArrowDown"]) dy += PLAYER_SPEED;
  if (keys["a"] || keys["ArrowLeft"]) dx -= PLAYER_SPEED;
  if (keys["d"] || keys["ArrowRight"]) dx += PLAYER_SPEED;

  if (dx !== 0 || dy !== 0) {
    // Try to move in both directions separately to implement sliding along walls
    let newX = localPlayer.x + dx;
    let newY = localPlayer.y + dy;

    // Check boundary constraints
    newX = Math.max(
      PLAYER_RADIUS,
      Math.min(newX, canvas.width - PLAYER_RADIUS),
    );
    newY = Math.max(
      PLAYER_RADIUS,
      Math.min(newY, canvas.height - PLAYER_RADIUS),
    );

    // Try to move in both directions separately
    let canMoveX = !checkWallCollision(newX, localPlayer.y, PLAYER_RADIUS);
    let canMoveY = !checkWallCollision(localPlayer.x, newY, PLAYER_RADIUS);

    if (canMoveX) localPlayer.x = newX;
    if (canMoveY) localPlayer.y = newY;

    // Emit player position update
    socket.emit("playerUpdate", {
      x: localPlayer.x,
      y: localPlayer.y,
      angle: localPlayer.angle,
    });
  }

  // Update bullets
  updateBullets();
}

// Update bullets
function updateBullets() {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const bullet = bullets[i];

    // Move bullet
    bullet.x += Math.cos(bullet.angle) * BULLET_SPEED;
    bullet.y += Math.sin(bullet.angle) * BULLET_SPEED;

    // Check if bullet is out of bounds
    if (
      bullet.x < 0 ||
      bullet.x > canvas.width ||
      bullet.y < 0 ||
      bullet.y > canvas.height
    ) {
      bullets.splice(i, 1);
      continue;
    }

    // Check wall collisions
    if (checkWallCollision(bullet.x, bullet.y, BULLET_RADIUS)) {
      bullets.splice(i, 1);
      continue;
    }

    // Check player collisions
    for (const player of players) {
      if (player.alive && player.id !== bullet.playerId) {
        const dx = player.x - bullet.x;
        const dy = player.y - bullet.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < PLAYER_RADIUS + BULLET_RADIUS) {
          // Player hit
          socket.emit("playerHit", player.id);
          bullets.splice(i, 1);
          break;
        }
      }
    }
  }
}

// Render game
function render() {
  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // Clear canvas and set background to white
  ctx.fillStyle = "white"; // Set fill color to white
  ctx.fillRect(0, 0, canvas.width, canvas.height); // Fill the entire canvas

  // Draw walls
  ctx.fillStyle = "#666";
  for (const wall of walls) {
    ctx.fillRect(wall.x, wall.y, wall.width, wall.height);
  }

  // Draw players
  for (const player of players) {
    if (!player.alive) continue;

    // Draw player circle
    ctx.fillStyle = player.color;
    ctx.beginPath();
    ctx.arc(player.x, player.y, PLAYER_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    // Draw player name
    ctx.fillStyle = "black";
    ctx.textAlign = "center";
    ctx.font = "14px Consolas";
    ctx.fillText(player.name, player.x, player.y - PLAYER_RADIUS - 10);

    // Draw weapon
    ctx.strokeStyle = "black";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(player.x, player.y);
    ctx.lineTo(
      player.x + Math.cos(player.angle) * WEAPON_LENGTH,
      player.y + Math.sin(player.angle) * WEAPON_LENGTH,
    );
    ctx.stroke();
  }

  // Draw bullets
  ctx.fillStyle = "black";
  for (const bullet of bullets) {
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, BULLET_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  }

  // Indicate if player is spectating
  if (localPlayer && !localPlayer.alive) {
    ctx.fillStyle = "rgba(255, 0, 0, 0.3)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "white";
    ctx.font = "24px Arial";
    ctx.textAlign = "center";
    ctx.fillText("You were eliminated! Spectating...", canvas.width / 2, 30);
  }
}

// Handle mouse movement
function handleMouseMove(e) {
  if (!localPlayer || !localPlayer.alive || !gameActive) return;

  const rect = canvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  // Calculate angle between player and mouse
  const dx = mouseX - localPlayer.x;
  const dy = mouseY - localPlayer.y;
  const angle = Math.atan2(dy, dx);

  localPlayer.angle = angle;

  // Emit player rotation update
  socket.emit("playerUpdate", {
    x: localPlayer.x,
    y: localPlayer.y,
    angle: localPlayer.angle,
  });
}

// Handle mouse click (shooting)
function handleMouseClick(e) {
  if (!localPlayer || !localPlayer.alive || !gameActive) return;

  const bulletData = {
    x: localPlayer.x + Math.cos(localPlayer.angle) * WEAPON_LENGTH,
    y: localPlayer.y + Math.sin(localPlayer.angle) * WEAPON_LENGTH,
    angle: localPlayer.angle,
  };

  // Emit bullet to server
  socket.emit("shoot", bulletData);
}

// Check wall collision
function checkWallCollision(x, y, radius) {
  for (const wall of walls) {
    // Find closest point on wall to the circle
    const closestX = Math.max(wall.x, Math.min(x, wall.x + wall.width));
    const closestY = Math.max(wall.y, Math.min(y, wall.y + wall.height));

    // Calculate distance between circle center and closest point
    const distX = x - closestX;
    const distY = y - closestY;
    const distance = Math.sqrt(distX * distX + distY * distY);

    // Check collision
    if (distance < radius) {
      return true;
    }
  }
  return false;
}

// Update game info
function updateGameInfo() {
  const alivePlayers = players.filter((p) => p.alive);
  playersAliveInfo.textContent = `Players Alive: ${alivePlayers.length}/${players.length}`;
}

// Socket event handlers
socket.on("gameState", (updatedPlayers) => {
  players = updatedPlayers;
  updateGameInfo();
});

socket.on("newBullet", (bulletData) => {
  bullets.push(bulletData);
});

socket.on("playerKilled", (playerId) => {
  const player = players.find((p) => p.id === playerId);
  if (player) {
    player.alive = false;
    updateGameInfo();

    if (playerId === socket.id) {
      gameMessage.textContent = "You were eliminated!";
    } else {
      gameMessage.textContent = `${player.name} was eliminated!`;
    }

    setTimeout(() => {
      gameMessage.textContent = "";
    }, 3000);
  }
});

socket.on("playerLeft", (playerId) => {
  const playerIndex = players.findIndex((p) => p.id === playerId);
  if (playerIndex !== -1) {
    const playerName = players[playerIndex].name;
    players.splice(playerIndex, 1);
    updateGameInfo();

    gameMessage.textContent = `${playerName} left the game`;
    setTimeout(() => {
      gameMessage.textContent = "";
    }, 3000);
  }
});

socket.on("gameOver", (winner) => {
  gameActive = false;
  gameMessage.textContent = `Game Over! ${winner.name} wins!`;

  setTimeout(() => {
    gameScreen.classList.add("hidden");
    loginScreen.classList.remove("hidden");
    nameInput.value = "";
    gameMessage.textContent = "";
  }, 5000);
});
