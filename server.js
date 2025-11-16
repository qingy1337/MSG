const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// --- Simple persistent user store + auth ---

const DATA_DIR = path.join(__dirname, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const AUTH_SECRET = process.env.AUTH_SECRET || "change-me-dev-secret";

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const usersByUsername = new Map();
let nextUserId = 1;

function loadUsers() {
  if (!fs.existsSync(USERS_FILE)) return;
  try {
    const raw = fs.readFileSync(USERS_FILE, "utf8");
    if (!raw) return;
    const data = JSON.parse(raw);
    if (Array.isArray(data)) {
      data.forEach((u) => {
        if (!u || !u.username) return;
        usersByUsername.set(u.username, u);
        if (typeof u.id === "number" && u.id >= nextUserId) {
          nextUserId = u.id + 1;
        }
      });
    }
  } catch (err) {
    console.error("Failed to load users:", err);
  }
}

function saveUsers() {
  const arr = Array.from(usersByUsername.values());
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(arr, null, 2), "utf8");
  } catch (err) {
    console.error("Failed to save users:", err);
  }
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const iterations = 120000;
  const keylen = 32;
  const digest = "sha256";
  const hash = crypto
    .pbkdf2Sync(password, salt, iterations, keylen, digest)
    .toString("hex");
  return `${iterations}:${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || typeof stored !== "string") return false;
  const parts = stored.split(":");
  if (parts.length !== 3) return false;
  const [iterationsStr, salt, hashHex] = parts;
  const iterations = parseInt(iterationsStr, 10);
  if (!iterations || !salt || !hashHex) return false;
  const keylen = Buffer.from(hashHex, "hex").length;
  const digest = "sha256";
  const derived = crypto.pbkdf2Sync(
    password,
    salt,
    iterations,
    keylen,
    digest,
  );
  const expected = Buffer.from(hashHex, "hex");
  if (expected.length !== derived.length) return false;
  return crypto.timingSafeEqual(expected, derived);
}

function signAuthToken(payload) {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64");
  const sig = crypto
    .createHmac("sha256", AUTH_SECRET)
    .update(data)
    .digest("base64");
  return `${data}.${sig}`;
}

function verifyAuthToken(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [data, sig] = parts;
  let expectedSig;
  try {
    expectedSig = crypto
      .createHmac("sha256", AUTH_SECRET)
      .update(data)
      .digest("base64");
  } catch (err) {
    return null;
  }
  const bufSig = Buffer.from(sig);
  const bufExpected = Buffer.from(expectedSig);
  if (bufSig.length !== bufExpected.length) return null;
  if (!crypto.timingSafeEqual(bufSig, bufExpected)) return null;
  try {
    const json = Buffer.from(data, "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  const parts = header.split(";");
  for (const part of parts) {
    const [k, v] = part.split("=");
    if (!k) continue;
    const key = k.trim();
    const value = (v || "").trim();
    if (!key) continue;
    out[key] = decodeURIComponent(value);
  }
  return out;
}

function getUserFromCookieHeader(cookieHeader) {
  if (!cookieHeader) return null;
  const cookies = parseCookies(cookieHeader);
  const token = cookies.auth_token;
  if (!token) return null;
  const payload = verifyAuthToken(token);
  if (!payload || !payload.username) return null;
  const user = usersByUsername.get(payload.username);
  if (!user) return null;
  return user;
}

function getUserFromRequest(req) {
  return getUserFromCookieHeader(req.headers.cookie || "");
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    currencies: user.currencies || {},
  };
}

loadUsers();

// --- Auth routes ---

app.post("/api/register", (req, res) => {
  const { username, password } = req.body || {};
  const cleanUsername =
    typeof username === "string" ? username.trim().toLowerCase() : "";
  if (!cleanUsername || cleanUsername.length < 3 || cleanUsername.length > 24) {
    return res
      .status(400)
      .json({ error: "Username must be 3-24 characters long." });
  }
  if (typeof password !== "string" || password.length < 4) {
    return res
      .status(400)
      .json({ error: "Password must be at least 4 characters." });
  }
  if (usersByUsername.has(cleanUsername)) {
    return res.status(409).json({ error: "Username is already taken." });
  }

  const user = {
    id: nextUserId++,
    username: cleanUsername,
    passwordHash: hashPassword(password),
    // Currency store is extensible; start with Coins for this task.
    currencies: {
      Coins: 0,
    },
  };
  usersByUsername.set(cleanUsername, user);
  saveUsers();

  const token = signAuthToken({ username: user.username });
  res
    .cookie("auth_token", token, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24 * 365, // ~1 year
    })
    .json(publicUser(user));
});

app.post("/api/login", (req, res) => {
  const { username, password } = req.body || {};
  const cleanUsername =
    typeof username === "string" ? username.trim().toLowerCase() : "";
  if (!cleanUsername || typeof password !== "string") {
    return res.status(400).json({ error: "Username and password required." });
  }
  const user = usersByUsername.get(cleanUsername);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ error: "Invalid username or password." });
  }
  const token = signAuthToken({ username: user.username });
  res
    .cookie("auth_token", token, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24 * 365,
    })
    .json(publicUser(user));
});

app.post("/api/logout", (req, res) => {
  res
    .clearCookie("auth_token", {
      httpOnly: true,
      sameSite: "lax",
    })
    .json({ ok: true });
});

app.get("/api/me", (req, res) => {
  const user = getUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Not authenticated." });
  res.json(publicUser(user));
});

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
  pistol: 14,   // ~4 shots to kill
  autoRifle: 9, // ~8-9 shots to kill, balances high ROF
  sniper: 100,  // 1 shot
  miniGun: 2.5,
};

io.on("connection", (socket) => {
  const cookieHeader =
    (socket.handshake && socket.handshake.headers && socket.handshake.headers.cookie) ||
    (socket.request && socket.request.headers && socket.request.headers.cookie) ||
    "";
  const user = getUserFromCookieHeader(cookieHeader);
  if (user) {
    socket.user = user;
  }

  console.log(
    "New connection:",
    socket.id,
    socket.user ? `as ${socket.user.username}` : "(unauthenticated)",
  );

  // Player joins waiting room
  socket.on("join", (payload) => {
    if (!socket.user) {
      socket.emit("authError", {
        message: "You must be logged in to join the game.",
      });
      return;
    }

    const playerColor = colors[Math.floor(Math.random() * colors.length)];
    let displayName = "";
    let weapon = 'pistol';

    if (typeof payload === 'string') {
      // Backwards compatibility if older client sends plain string
      displayName = payload;
    } else if (payload && typeof payload === 'object') {
      // Support both legacy "name" and new "displayName" field
      displayName = String(
        payload.displayName || payload.name || '',
      );
      if (typeof payload.weapon === 'string') {
        const key = payload.weapon;
        // Allow-listed weapons for now (keep extensible by adding here)
        const allowed = new Set([...Object.keys(WEAPON_DAMAGE)]);
        weapon = allowed.has(key) ? key : 'pistol';
      }
    }

    displayName = displayName.substring(0, 16);
    if (!displayName) {
      displayName = socket.user.username;
    }

    const player = {
      id: socket.id,
      // Keep name for rendering, but do not treat it as account username.
      name: displayName,
      displayName,
      accountUsername: socket.user.username,
      color: playerColor,
      weapon,
    };

    waitingPlayers.push(player);
    socket.join("waiting");

    io.to("waiting").emit("updateWaitingList", waitingPlayers);
    console.log(
      `${socket.user.username} joined the waiting room as "${displayName}" with ${weapon}`,
    );
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
        // Space out spawns and ensure no direct LOS to existing players
        const spawnPosition = getValidSpawnPosition(walls, activePlayers);

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

    // let damage = 1;

    target.health = Math.max(0, (target.health ?? MAX_HEALTH) - damage);
    if (target.health <= 0) {
      target.alive = false;
      io.emit("playerKilled", target.id);

      // Award coins to the shooter for a kill
      if (shooterId) {
        const shooter = activePlayers.find((p) => p.id === shooterId);
        if (shooter && shooter.accountUsername) {
          const accountUser = usersByUsername.get(shooter.accountUsername);
          if (accountUser) {
            if (!accountUser.currencies || typeof accountUser.currencies !== "object") {
              accountUser.currencies = {};
            }
            const currentCoins =
              typeof accountUser.currencies.Coins === "number"
                ? accountUser.currencies.Coins
                : 0;
            const newCoins = currentCoins + 5;
            accountUser.currencies.Coins = newCoins;
            saveUsers();

            // Notify the shooter so their UI can update immediately
            io.to(shooterId).emit("coinsUpdated", { coins: newCoins });
          }
        }
      }
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

function getValidSpawnPosition(walls, existingPlayers = []) {
  const PLAYER_RADIUS = 20;
  const CANVAS_WIDTH = 900;
  const CANVAS_HEIGHT = 600;
  const MIN_SPAWN_DISTANCE = 150; // keep players spaced to avoid instant kills
  const MAX_ATTEMPTS = 1000; // generous to accommodate stricter constraints

  // Helper: circle-rect overlap
  function overlapsAnyWall(px, py) {
    for (const wall of walls) {
      const closestX = Math.max(wall.x, Math.min(px, wall.x + wall.width));
      const closestY = Math.max(wall.y, Math.min(py, wall.y + wall.height));
      const dx = px - closestX;
      const dy = py - closestY;
      if (Math.sqrt(dx * dx + dy * dy) < PLAYER_RADIUS) return true;
    }
    return false;
  }

  // Evaluate candidate with respect to existing players
  function candidateIsValid(cx, cy) {
    // Not inside or overlapping walls
    if (overlapsAnyWall(cx, cy)) return false;

    for (const p of existingPlayers) {
      if (!p || !p.alive) continue;
      // Keep a minimum spacing
      const dx = cx - p.x;
      const dy = cy - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < MIN_SPAWN_DISTANCE) return false;
      // Require at least one wall blocking direct LOS
      const blocked = lineIntersectsAnyWall(cx, cy, p.x, p.y, walls);
      if (!blocked) return false;
    }
    return true;
  }

  // Try random sampling; also track best fallback
  let best = null;
  let bestScore = -Infinity;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const x = Math.random() * (CANVAS_WIDTH - 2 * PLAYER_RADIUS) + PLAYER_RADIUS;
    const y = Math.random() * (CANVAS_HEIGHT - 2 * PLAYER_RADIUS) + PLAYER_RADIUS;

    if (candidateIsValid(x, y)) {
      return { x, y };
    }

    // Fallback scoring: maximize number of blocked LOS, then maximize min distance
    let blockedCount = 0;
    let minDist = Infinity;
    for (const p of existingPlayers) {
      if (!p || !p.alive) continue;
      const dx = x - p.x;
      const dy = y - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < minDist) minDist = dist;
      if (lineIntersectsAnyWall(x, y, p.x, p.y, walls)) blockedCount++;
    }
    const score = blockedCount * 10000 + (isFinite(minDist) ? minDist : 0);
    if (score > bestScore && !overlapsAnyWall(x, y)) {
      bestScore = score;
      best = { x, y };
    }
  }

  // If strict constraints fail, use the best-scoring safe spot (still not overlapping walls)
  if (best) return best;

  // As a last resort, place anywhere not overlapping walls
  for (let attempt = 0; attempt < 200; attempt++) {
    const x = Math.random() * (CANVAS_WIDTH - 2 * PLAYER_RADIUS) + PLAYER_RADIUS;
    const y = Math.random() * (CANVAS_HEIGHT - 2 * PLAYER_RADIUS) + PLAYER_RADIUS;
    if (!overlapsAnyWall(x, y)) return { x, y };
  }

  // Extremely unlikely fallback
  return { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 };
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
