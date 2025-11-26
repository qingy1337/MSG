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
let firingInterval = null;
let lastShotAt = 0;
let matchConfig = {
  mode: "standard",
  botFriendlyFire: false,
  botTargetBots: false,
};

// Constants
const PLAYER_RADIUS = 20;
const WEAPON_LENGTH = 30;
const BULLET_RADIUS = 5;
const PLAYER_SPEED = 5;
const BULLET_SPEED = 10;

// Initialize game
function initGame(gamePlayers, gameWalls, matchSettings = {}) {
  players = gamePlayers;
  walls = gameWalls;
  matchConfig = {
    mode: matchSettings.mode || "standard",
    botFriendlyFire: !!matchSettings.botFriendlyFire,
    botTargetBots: !!matchSettings.botTargetBots,
  };
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
  canvas.addEventListener("mousedown", handleMouseDown);
  window.addEventListener("mouseup", handleMouseUp);
  canvas.addEventListener("mouseleave", handleMouseUp);

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
  // Always advance bullets so spectators see live action.
  // Only process local movement/controls if we have a living local player.
  if (localPlayer && localPlayer.alive) {
    // Player movement
    let dx = 0;
    let dy = 0;

    if (keys["w"] || keys["ArrowUp"]) dy -= PLAYER_SPEED;
    if (keys["s"] || keys["ArrowDown"]) dy += PLAYER_SPEED;
    if (keys["a"] || keys["ArrowLeft"]) dx -= PLAYER_SPEED;
    if (keys["d"] || keys["ArrowRight"]) dx += PLAYER_SPEED;

    if (dx !== 0 || dy !== 0) {
      // Normalize diagonal movement to prevent faster speed
      const magnitude = Math.sqrt(dx * dx + dy * dy);
      dx = (dx / magnitude) * PLAYER_SPEED;
      dy = (dy / magnitude) * PLAYER_SPEED;

      // Move player
      localPlayer.x += dx;
      localPlayer.y += dy;

      // Check for wall collisions and resolve them by pushing the player out
      for (const wall of walls) {
        // Find the closest point on the wall to the player's center
        const closestX = Math.max(
          wall.x,
          Math.min(localPlayer.x, wall.x + wall.width),
        );
        const closestY = Math.max(
          wall.y,
          Math.min(localPlayer.y, wall.y + wall.height),
        );

        // Calculate the distance between the player's center and the closest point
        const distX = localPlayer.x - closestX;
        const distY = localPlayer.y - closestY;
        const distance = Math.sqrt(distX * distX + distY * distY);

        // If the distance is less than the player's radius, there's a collision
        if (distance < PLAYER_RADIUS) {
          // Calculate the overlap between the player and the wall
          const overlap = PLAYER_RADIUS - distance;
          // Calculate the angle to push the player out of the wall
          const pushAngle = Math.atan2(distY, distX);

          // Move the player out of the wall
          localPlayer.x += Math.cos(pushAngle) * overlap;
          localPlayer.y += Math.sin(pushAngle) * overlap;
        }
      }

      // Enforce boundary constraints after collision resolution
      localPlayer.x = Math.max(
        PLAYER_RADIUS,
        Math.min(localPlayer.x, canvas.width - PLAYER_RADIUS),
      );
      localPlayer.y = Math.max(
        PLAYER_RADIUS,
        Math.min(localPlayer.y, canvas.height - PLAYER_RADIUS),
      );

      // Emit player position update
      socket.emit("playerUpdate", {
        x: localPlayer.x,
        y: localPlayer.y,
        angle: localPlayer.angle,
      });
    }
  }

  // Update bullets for all viewers (including spectators)
  updateBullets();
}

// Update bullets
function updateBullets() {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const bullet = bullets[i];
    const speed = typeof bullet.speed === 'number' ? bullet.speed : BULLET_SPEED;
    const bRadius = typeof bullet.radius === 'number' ? bullet.radius : BULLET_RADIUS;
    const shooter =
      bullet && bullet.playerId
        ? players.find((p) => p.id === bullet.playerId)
        : null;
    const shooterIsBot = !!(shooter && shooter.isBot);

    // Move bullet
    bullet.x += Math.cos(bullet.angle) * speed;
    bullet.y += Math.sin(bullet.angle) * speed;

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
    if (checkWallCollision(bullet.x, bullet.y, bRadius)) {
      bullets.splice(i, 1);
      continue;
    }

    // Check player collisions
    for (const player of players) {
      if (player.alive && player.id !== bullet.playerId) {
        if (shooterIsBot && player.isBot && !matchConfig.botFriendlyFire) {
          // Bot bullets pass through allied bots without dealing damage.
          continue;
        }

        const dx = player.x - bullet.x;
        const dy = player.y - bullet.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < PLAYER_RADIUS + bRadius) {
          // Player hit
          socket.emit("playerHit", {
            targetId: player.id,
            shooterId: bullet.playerId,
            bulletId: typeof bullet.bulletId === "number" ? bullet.bulletId : undefined,
          });
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

    // Draw player name (above health bar)
    ctx.fillStyle = "black";
    ctx.textAlign = "center";
    ctx.font = "14px Consolas";
    ctx.fillText(player.name, player.x, player.y - PLAYER_RADIUS - 18);

    // Draw health bar
    const maxHealth = 100; // mirror server MAX_HEALTH
    const health = Math.max(0, typeof player.health === 'number' ? player.health : maxHealth);
    const pct = Math.max(0, Math.min(1, health / maxHealth));
    const barWidth = 50;
    const barHeight = 6;
    const barX = player.x - barWidth / 2;
    const barY = player.y - PLAYER_RADIUS - 12;
    // Background
    ctx.fillStyle = "#e0e0e0";
    ctx.fillRect(barX, barY, barWidth, barHeight);
    // Border
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barWidth, barHeight);
    // Fill color based on percentage
    let color = "#4CAF50"; // green
    if (pct <= 0.3) color = "#F44336"; // red
    else if (pct <= 0.6) color = "#FFC107"; // amber
    ctx.fillStyle = color;
    ctx.fillRect(barX, barY, barWidth * pct, barHeight);

    // Draw weapon (skin-aware)
    if (typeof drawPlayerWeapon === "function") {
      drawPlayerWeapon(ctx, player);
    } else {
      // Fallback simple line if skin helpers are unavailable
      ctx.strokeStyle = "black";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(player.x, player.y);
      const weaponKey = player.weapon || (typeof DEFAULT_WEAPON_KEY !== 'undefined' ? DEFAULT_WEAPON_KEY : 'pistol');
      const cfg = (typeof WEAPONS !== 'undefined' && WEAPONS[weaponKey]) || (typeof WEAPONS !== 'undefined' && WEAPONS.pistol) || { weaponLength: WEAPON_LENGTH };
      const len = typeof cfg.weaponLength === 'number' ? cfg.weaponLength : WEAPON_LENGTH;
      ctx.lineTo(
        player.x + Math.cos(player.angle) * len,
        player.y + Math.sin(player.angle) * len,
      );
      ctx.stroke();
    }
  }

  // Draw bullets
  for (const bullet of bullets) {
    let fill = "black";
    if (typeof getBulletColorForPlayer === "function" && bullet.playerId) {
      const shooter = players.find((p) => p.id === bullet.playerId);
      if (shooter) {
        fill = getBulletColorForPlayer(shooter) || fill;
      }
    }
    ctx.fillStyle = fill;
    ctx.beginPath();
    const r = typeof bullet.radius === 'number' ? bullet.radius : BULLET_RADIUS;
    ctx.arc(bullet.x, bullet.y, r, 0, Math.PI * 2);
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

// Handle mouse down/up (shooting)
function handleMouseDown() {
  if (!localPlayer || !localPlayer.alive || !gameActive) return;
  attemptFire();
  const weaponKey = localPlayer.weapon || (typeof DEFAULT_WEAPON_KEY !== 'undefined' ? DEFAULT_WEAPON_KEY : 'pistol');
  const cfg = (typeof WEAPONS !== 'undefined' && WEAPONS[weaponKey]) || WEAPONS.pistol;
  if (cfg && cfg.automatic) {
    const interval = Math.max(50, cfg.cooldownMs || 100);
    clearInterval(firingInterval);
    firingInterval = setInterval(attemptFire, interval);
  }
}

function handleMouseUp() {
  if (firingInterval) {
    clearInterval(firingInterval);
    firingInterval = null;
  }
}

function attemptFire() {
  if (!localPlayer || !localPlayer.alive || !gameActive) return;
  const weaponKey = localPlayer.weapon || (typeof DEFAULT_WEAPON_KEY !== 'undefined' ? DEFAULT_WEAPON_KEY : 'pistol');
  const cfg = (typeof WEAPONS !== 'undefined' && WEAPONS[weaponKey]) || WEAPONS.pistol;
  const now = Date.now();
  const cooldown = cfg && typeof cfg.cooldownMs === 'number' ? cfg.cooldownMs : 0;
  if (cooldown > 0 && now - lastShotAt < cooldown) return;

  const weaponLength = cfg && typeof cfg.weaponLength === 'number' ? cfg.weaponLength : WEAPON_LENGTH;
  const bulletSpeed = cfg && typeof cfg.bulletSpeed === 'number' ? cfg.bulletSpeed : BULLET_SPEED;
  const bulletRadius = cfg && typeof cfg.bulletRadius === 'number' ? cfg.bulletRadius : BULLET_RADIUS;

  // Compute weapon tip position (spawn point)
  const tipX = localPlayer.x + Math.cos(localPlayer.angle) * weaponLength;
  const tipY = localPlayer.y + Math.sin(localPlayer.angle) * weaponLength;

  // Prevent firing if the barrel path crosses or starts inside any wall
  if (
    barrelPathHitsWallDiscrete(localPlayer.x, localPlayer.y, tipX, tipY, 2) ||
    barrelIntersectsAnyWall(localPlayer.x, localPlayer.y, tipX, tipY) ||
    isPointInsideAnyWall(tipX, tipY)
  ) {
    return;
  }

  const bulletData = {
    x: tipX,
    y: tipY,
    angle: localPlayer.angle,
    speed: bulletSpeed,
    radius: bulletRadius,
  };

  // Emit bullet to server
  socket.emit("shoot", bulletData);
  lastShotAt = now;
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

// Simple point-in-rectangle check for walls
function isPointInsideAnyWall(x, y) {
  for (const wall of walls) {
    if (
      x >= wall.x &&
      x <= wall.x + wall.width &&
      y >= wall.y &&
      y <= wall.y + wall.height
    ) {
      return true;
    }
  }
  return false;
}

// Check if the line segment from (x0,y0) to (x1,y1) intersects any wall
function barrelIntersectsAnyWall(x0, y0, x1, y1) {
  for (const wall of walls) {
    if (lineIntersectsRect(x0, y0, x1, y1, wall)) return true;
  }
  return false;
}

function lineIntersectsRect(x0, y0, x1, y1, rect) {
  // If either endpoint is inside, it's intersecting
  if (
    x0 >= rect.x && x0 <= rect.x + rect.width &&
    y0 >= rect.y && y0 <= rect.y + rect.height
  ) return true;
  if (
    x1 >= rect.x && x1 <= rect.x + rect.width &&
    y1 >= rect.y && y1 <= rect.y + rect.height
  ) return true;

  // Check segment against each rectangle edge
  const r = rect;
  const edges = [
    [r.x, r.y, r.x + r.width, r.y],
    [r.x + r.width, r.y, r.x + r.width, r.y + r.height],
    [r.x + r.width, r.y + r.height, r.x, r.y + r.height],
    [r.x, r.y + r.height, r.x, r.y],
  ];
  for (const [ex0, ey0, ex1, ey1] of edges) {
    if (segmentsIntersect(x0, y0, x1, y1, ex0, ey0, ex1, ey1)) return true;
  }
  return false;
}

function segmentsIntersect(x1, y1, x2, y2, x3, y3, x4, y4) {
  const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (den === 0) return false; // parallel lines
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
  const u = ((x1 - x3) * (y1 - y2) - (y1 - y3) * (x1 - x2)) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

// Robust discrete raycast along barrel path
function barrelPathHitsWallDiscrete(x0, y0, x1, y1, step = 2) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return false;
  const steps = Math.max(1, Math.ceil(len / step));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const px = x0 + dx * t;
    const py = y0 + dy * t;
    if (isPointInsideAnyWall(px, py)) return true;
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
    player.health = 0;
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
    if (typeof setActiveScreen === "function") {
      setActiveScreen(loginScreen);
    } else {
      gameScreen.classList.add("hidden");
      loginScreen.classList.remove("hidden");
      if (typeof waitingScreen !== "undefined" && waitingScreen) {
        waitingScreen.classList.add("hidden");
      }
      if (typeof weaponScreen !== "undefined" && weaponScreen) {
        weaponScreen.classList.add("hidden");
      }
    }
    nameInput.value = "";
    gameMessage.textContent = "";
  }, 5000);
});
