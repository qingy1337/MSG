const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.use(express.static(path.join(__dirname, "public")));

// Game state
const waitingPlayers = [];
const activePlayers = [];
const gameInProgress = { status: false };
const gameWalls = [];
const colors = [
  "#FF5733",
  "#33FF57",
  "#3357FF",
  "#F033FF",
  "#FF33A8",
  "#33FFF5",
  "#FFD733",
  "#8C33FF",
  "#FF8C33",
  "#33FFBD",
];

// Health and damage config
const MAX_HEALTH = 100;
const WEAPON_DAMAGE = {
  pistol: 25,     // ~4 shots to kill
  autoRifle: 12,  // ~8-9 shots to kill, balances high ROF
  sniper: 100,    // 1 shot to kill
};

io.on("connection", (socket) => {
  console.log("New connection:", socket.id);

  // Player joins waiting room
  socket.on("join", (payload) => {
    const playerColor = colors[Math.floor(Math.random() * colors.length)];
    let playerName = '';
    let weapon = 'pistol';

    if (typeof payload === 'string') {
      playerName = payload;
    } else if (payload && typeof payload === 'object') {
      playerName = String(payload.name || '');
      if (typeof payload.weapon === 'string') {
        const key = payload.weapon;
        // Allow-listed weapons for now (keep extensible by adding here)
        const allowed = new Set(['pistol', 'autoRifle', 'sniper']);
        weapon = allowed.has(key) ? key : 'pistol';
      }
    }

    playerName = playerName.substring(0, 10);

    const player = {
      id: socket.id,
      name: playerName,
      color: playerColor,
      weapon,
    };

    waitingPlayers.push(player);
    socket.join("waiting");

    io.to("waiting").emit("updateWaitingList", waitingPlayers);
    console.log(`${playerName} joined the waiting room with ${weapon}`);
  });

  // Start game
  socket.on("startGame", () => {
    if (waitingPlayers.length >= 2 && !gameInProgress.status) {
      gameInProgress.status = true;

      // Generate walls
      const walls = generateWalls();
      gameWalls.length = 0;
      gameWalls.push(...walls);

      // Move all waiting players to active game
      while (waitingPlayers.length > 0) {
        const player = waitingPlayers.pop();
        const spawnPosition = getValidSpawnPosition(walls);

        activePlayers.push({
          ...player,
          x: spawnPosition.x,
          y: spawnPosition.y,
          angle: 0,
          alive: true,
          health: MAX_HEALTH,
        });
      }

      // Notify all clients that game is starting
      io.emit("gameStarting", { players: activePlayers, walls: walls });

      // Move players from waiting room to game room
      io.socketsLeave("waiting");
      console.log("Game started with", activePlayers.length, "players");
    }
  });

  // Player movement update
  socket.on("playerUpdate", (data) => {
    const player = activePlayers.find((p) => p.id === socket.id);
    if (player && player.alive) {
      player.x = data.x;
      player.y = data.y;
      player.angle = data.angle;

      io.emit("gameState", activePlayers);
    }
  });

  // Player shoots
  socket.on("shoot", (bulletData) => {
    const player = activePlayers.find((p) => p.id === socket.id);
    if (player && player.alive) {
      // Guard against shooting through walls: ignore shots whose spawn point is inside a wall
      const bx = bulletData && typeof bulletData.x === 'number' ? bulletData.x : null;
      const by = bulletData && typeof bulletData.y === 'number' ? bulletData.y : null;
      if (bx == null || by == null) return;
      // Use both point-inside and robust discrete segment check from player -> muzzle tip
      if (
        isPointInsideAnyWall(bx, by, gameWalls) ||
        segmentCrossesWallDiscrete(player.x, player.y, bx, by, gameWalls, 2) ||
        lineIntersectsAnyWall(player.x, player.y, bx, by, gameWalls)
      ) {
        return; // do not emit invalid bullet
      }
      io.emit("newBullet", {
        ...bulletData,
        playerId: socket.id,
      });
    }
  });

  // Player hit
  socket.on("playerHit", (payload) => {
    // Backward compatibility: if payload is a string, treat as target only
    let targetId = typeof payload === 'string' ? payload : payload && payload.targetId;
    const shooterId = payload && payload.shooterId ? payload.shooterId : null;

    const target = activePlayers.find((p) => p.id === targetId);
    if (!target || !target.alive) return;

    // Determine damage from shooter's weapon; default to pistol damage
    let damage = WEAPON_DAMAGE.pistol;
    if (shooterId) {
      const shooter = activePlayers.find((p) => p.id === shooterId);
      if (shooter && typeof WEAPON_DAMAGE[shooter.weapon] === 'number') {
        damage = WEAPON_DAMAGE[shooter.weapon];
      }
    }

    target.health = Math.max(0, (target.health ?? MAX_HEALTH) - damage);
    if (target.health <= 0) {
      target.alive = false;
      io.emit("playerKilled", target.id);
    }

    // Broadcast updated state so clients can render health bars
    io.emit("gameState", activePlayers);

    // If only one alive remains, end game
    const alivePlayers = activePlayers.filter((p) => p.alive);
    if (alivePlayers.length === 1) {
      io.emit("gameOver", alivePlayers[0]);
      setTimeout(() => {
        resetGame();
      }, 5000);
    }
  });

  // Disconnect
  socket.on("disconnect", () => {
    // Remove from waiting list
    const waitingIndex = waitingPlayers.findIndex((p) => p.id === socket.id);
    if (waitingIndex !== -1) {
      waitingPlayers.splice(waitingIndex, 1);
      io.to("waiting").emit("updateWaitingList", waitingPlayers);
    }

    // Remove from active game
    const activeIndex = activePlayers.findIndex((p) => p.id === socket.id);
    if (activeIndex !== -1) {
      activePlayers.splice(activeIndex, 1);
      io.emit("playerLeft", socket.id);

      // Check if game is over
      const alivePlayers = activePlayers.filter((p) => p.alive);
      if (alivePlayers.length === 1 && gameInProgress.status) {
        io.emit("gameOver", alivePlayers[0]);
        setTimeout(() => {
          resetGame();
        }, 5000);
      }
    }

    console.log("Disconnected:", socket.id);
  });
});

function resetGame() {
  activePlayers.length = 0;
  gameWalls.length = 0;
  gameInProgress.status = false;
  io.emit("resetGame");
  console.log("Game reset");
}

function getValidSpawnPosition(walls) {
  const PLAYER_RADIUS = 20;
  const CANVAS_WIDTH = 900;
  const CANVAS_HEIGHT = 600;

  let x, y;
  let validPosition = false;

  // Try up to 100 times to find a valid position
  for (let attempt = 0; attempt < 100; attempt++) {
    x = Math.random() * (CANVAS_WIDTH - 2 * PLAYER_RADIUS) + PLAYER_RADIUS;
    y = Math.random() * (CANVAS_HEIGHT - 2 * PLAYER_RADIUS) + PLAYER_RADIUS;

    validPosition = true;

    // Check wall collisions
    for (const wall of walls) {
      // Find closest point on wall to the potential spawn position
      const closestX = Math.max(wall.x, Math.min(x, wall.x + wall.width));
      const closestY = Math.max(wall.y, Math.min(y, wall.y + wall.height));

      // Calculate distance between spawn position and closest point
      const distX = x - closestX;
      const distY = y - closestY;
      const distance = Math.sqrt(distX * distX + distY * distY);

      // Check collision
      if (distance < PLAYER_RADIUS) {
        validPosition = false;
        break;
      }
    }

    if (validPosition) break;
  }

  return { x, y };
}

function generateWalls() {
  const CANVAS_WIDTH = 900;
  const CANVAS_HEIGHT = 600;
  const MIN_WALL_LENGTH = 50;
  const MAX_WALL_LENGTH = 250;
  const MIN_WALL_THICKNESS = 15;
  const MAX_WALL_THICKNESS = 30;
  const NUM_WALLS = Math.floor(Math.random() * 3) + 4; // 4-6 walls

  const walls = [];
  const occupiedSpace = new Set(); // Track grid cells that are occupied

  // Divide the canvas into a grid for checking overlap
  const GRID_SIZE = 30;
  const GRID_COLS = Math.ceil(CANVAS_WIDTH / GRID_SIZE);
  const GRID_ROWS = Math.ceil(CANVAS_HEIGHT / GRID_SIZE);

  // Function to mark grid cells as occupied
  function markOccupied(x, y, width, height) {
    const startCol = Math.floor(x / GRID_SIZE);
    const startRow = Math.floor(y / GRID_SIZE);
    const endCol = Math.ceil((x + width) / GRID_SIZE);
    const endRow = Math.ceil((y + height) / GRID_SIZE);

    for (let row = startRow; row < endRow; row++) {
      for (let col = startCol; col < endCol; col++) {
        if (row >= 0 && row < GRID_ROWS && col >= 0 && col < GRID_COLS) {
          occupiedSpace.add(`${row},${col}`);
        }
      }
    }
  }

  // Function to check if a wall overlaps with existing walls
  function checkOverlap(x, y, width, height) {
    const startCol = Math.floor(x / GRID_SIZE);
    const startRow = Math.floor(y / GRID_SIZE);
    const endCol = Math.ceil((x + width) / GRID_SIZE);
    const endRow = Math.ceil((y + height) / GRID_SIZE);

    // Add padding to avoid walls being too close
    const paddedStartCol = Math.max(0, startCol - 1);
    const paddedStartRow = Math.max(0, startRow - 1);
    const paddedEndCol = Math.min(GRID_COLS, endCol + 1);
    const paddedEndRow = Math.min(GRID_ROWS, endRow + 1);

    for (let row = paddedStartRow; row < paddedEndRow; row++) {
      for (let col = paddedStartCol; col < paddedEndCol; col++) {
        if (occupiedSpace.has(`${row},${col}`)) {
          return true; // Overlap detected
        }
      }
    }
    return false;
  }

  // Generate walls
  for (let i = 0; i < NUM_WALLS; i++) {
    let attempts = 0;
    let validWall = false;
    let wall;

    while (!validWall && attempts < 50) {
      attempts++;

      // Decide if this is a horizontal or vertical wall
      const isHorizontal = Math.random() > 0.5;

      if (isHorizontal) {
        const width =
          Math.floor(Math.random() * (MAX_WALL_LENGTH - MIN_WALL_LENGTH)) +
          MIN_WALL_LENGTH;
        const height =
          Math.floor(
            Math.random() * (MAX_WALL_THICKNESS - MIN_WALL_THICKNESS),
          ) + MIN_WALL_THICKNESS;
        const x = Math.floor(Math.random() * (CANVAS_WIDTH - width));
        const y = Math.floor(Math.random() * (CANVAS_HEIGHT - height));

        wall = { x, y, width, height };
      } else {
        const width =
          Math.floor(
            Math.random() * (MAX_WALL_THICKNESS - MIN_WALL_THICKNESS),
          ) + MIN_WALL_THICKNESS;
        const height =
          Math.floor(Math.random() * (MAX_WALL_LENGTH - MIN_WALL_LENGTH)) +
          MIN_WALL_LENGTH;
        const x = Math.floor(Math.random() * (CANVAS_WIDTH - width));
        const y = Math.floor(Math.random() * (CANVAS_HEIGHT - height));

        wall = { x, y, width, height };
      }

      // Check if the wall is valid (not overlapping)
      if (!checkOverlap(wall.x, wall.y, wall.width, wall.height)) {
        validWall = true;
        markOccupied(wall.x, wall.y, wall.width, wall.height);
        walls.push(wall);
      }
    }
  }

  return walls;
}

// Utility: check if a point lies inside any wall rectangle
function isPointInsideAnyWall(x, y, walls) {
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

// Utility: line-rectangle intersection against any wall
function lineIntersectsAnyWall(x0, y0, x1, y1, walls) {
  for (const wall of walls) {
    if (lineIntersectsRect(x0, y0, x1, y1, wall)) return true;
  }
  return false;
}

function lineIntersectsRect(x0, y0, x1, y1, rect) {
  if (
    (x0 >= rect.x && x0 <= rect.x + rect.width && y0 >= rect.y && y0 <= rect.y + rect.height) ||
    (x1 >= rect.x && x1 <= rect.x + rect.width && y1 >= rect.y && y1 <= rect.y + rect.height)
  ) return true;
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
  if (den === 0) return false;
  const t = ((x3 - x1) * (y3 - y4) - (y3 - y1) * (x3 - x4)) / den;
  const u = ((x3 - x1) * (y1 - y2) - (y3 - y1) * (x1 - x2)) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

// Robust discrete raycast along the path
function segmentCrossesWallDiscrete(x0, y0, x1, y1, walls, step = 2) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return false;
  const steps = Math.max(1, Math.ceil(len / step));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const px = x0 + dx * t;
    const py = y0 + dy * t;
    if (isPointInsideAnyWall(px, py, walls)) return true;
  }
  return false;
}

server.listen(3001, () => {
  console.log("Server running on http://localhost:3001");
});
