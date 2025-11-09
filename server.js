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

io.on("connection", (socket) => {
  console.log("New connection:", socket.id);

  // Player joins waiting room
  socket.on("join", (name) => {
    const playerColor = colors[Math.floor(Math.random() * colors.length)];
    const playerName = name.substring(0, 10);
    const player = {
      id: socket.id,
      name: playerName,
      color: playerColor,
    };

    waitingPlayers.push(player);
    socket.join("waiting");

    io.to("waiting").emit("updateWaitingList", waitingPlayers);
    console.log(`${playerName} joined the waiting room`);
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
      io.emit("newBullet", {
        ...bulletData,
        playerId: socket.id,
      });
    }
  });

  // Player hit
  socket.on("playerHit", (playerId) => {
    const player = activePlayers.find((p) => p.id === playerId);
    if (player && player.alive) {
      player.alive = false;
      io.emit("playerKilled", playerId);

      // Check if game is over (only one player left)
      const alivePlayers = activePlayers.filter((p) => p.alive);
      if (alivePlayers.length === 1) {
        io.emit("gameOver", alivePlayers[0]);
        setTimeout(() => {
          resetGame();
        }, 5000);
      }
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

server.listen(3001, () => {
  console.log("Server running on http://localhost:3001");
});
