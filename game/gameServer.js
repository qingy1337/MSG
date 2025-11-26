const { WEAPONS } = require("../public/weapons");
const {
  usersByUsername,
  getUserFromCookieHeader,
  ensureUserCurrencies,
  ensureUserSkins,
  saveUsers,
} = require("../lib/userStore");
const { DEFAULT_SKIN_BY_WEAPON } = require("../lib/skins");

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

const MAX_HEALTH = 100;
const WEAPON_DAMAGE = {
  pistol: 22.5,     // 1000 / 100 * 22.5  = 225
  autoRifle: 15.75, // 1000 / 70  * 15.75 = 225
  sniper: 90,       // 1000 / 800 * 90    = 112.5
  miniGun: 2.25,    // 1000 / 10  * 2.25  = 225
};

const DEFAULT_BULLET_RADIUS = 5;
const DEFAULT_BULLET_SPEED = 10;
const BULLET_MAX_LIFETIME_MS = 4000;

function createGameServer(io) {
  function isBotAlliedName(name) {
    if (typeof name !== "string") return false;
    const trimmed = name.trim();
    // Matches "BOT 1" through "BOT 100" with no leading zeroes.
    return /^BOT ([1-9][0-9]?|100)$/.test(trimmed);
  }

  function isBotAllyPlayer(player) {
    if (!player) return false;
    if (player.isBot) return true;
    if (!hasDefaultSkin(player)) return false;
    const displayName =
      typeof player.displayName === "string"
        ? player.displayName
        : typeof player.name === "string"
          ? player.name
          : "";
    return isBotAlliedName(displayName);
  }

  function hasDefaultSkin(player) {
    if (!player || typeof player.weapon !== "string") return false;
    const defaultSkin = DEFAULT_SKIN_BY_WEAPON[player.weapon];
    const equipped = player.weaponSkinKey;
    if (defaultSkin == null) {
      return equipped == null;
    }
    return equipped === defaultSkin;
  }

  // Game state
  const waitingPlayers = [];
  const activePlayers = [];
  const gameInProgress = { status: false };
  const gameWalls = [];
  // Simple server-side bot config (step 0: scripted bots)
  const BOT_CONFIG = {
    // When bots are enabled, try to roughly fill up to this many total players.
    targetTotalPlayers: 2,
    maxPerMatch: 10,
    // Tuned so bots feel closer to human speed (~300 units/sec at 20 ticks/sec).
    moveSpeedPerTick: 11,
    weaponKey: "miniGun",
    playerRadius: 20,
    canvasWidth: 900,
    canvasHeight: 600,
    aimInaccuracy: 0.0,
  };
  let nextBotId = 1;

  // Bullet bookkeeping so each bullet only ever applies damage once.
  let nextBulletId = 1;
  const processedBulletHits = new Set();
  const activeBullets = [];
  let gameOverTimeout = null;
  let cachedNavGrid = null;
  let wallLayoutVersion = 0;

  io.on("connection", (socket) => {
    const cookieHeader =
      (socket.handshake && socket.handshake.headers && socket.handshake.headers.cookie) ||
      (socket.request && socket.request.headers && socket.request.headers.cookie) ||
      "";
    const user = getUserFromCookieHeader(cookieHeader);
    if (user) {
      socket.user = user;
      ensureUserCurrencies(socket.user);
      ensureUserSkins(socket.user);
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
        weaponSkinKey:
          (socket.user &&
            socket.user.skins &&
            socket.user.skins.equippedByWeapon &&
            socket.user.skins.equippedByWeapon[weapon]) ||
          DEFAULT_SKIN_BY_WEAPON[weapon] ||
          null,
      };

      waitingPlayers.push(player);
      socket.join("waiting");

      io.to("waiting").emit("updateWaitingList", waitingPlayers);
      console.log(
        `${socket.user.username} joined the waiting room as "${displayName}" with ${weapon}`,
      );
    });

    // Start game
    socket.on("startGame", (options) => {
      if (gameInProgress.status) return;

      const config =
        options && typeof options === "object" ? options : {};
      const enableBots = !!config.enableBots;

      const humanCount = waitingPlayers.length;
      let botCount = 0;
      if (enableBots) {
        const targetPlayers = BOT_CONFIG.targetTotalPlayers;
        const maxBots = BOT_CONFIG.maxPerMatch;
        const missing = Math.max(0, targetPlayers - humanCount);
        botCount = Math.min(maxBots, missing);
        // If there is exactly one human, ensure at least one bot so the game can start.
        if (humanCount === 1 && botCount === 0 && maxBots > 0) {
          botCount = 1;
        }
      }

      const totalPlayers = humanCount + botCount;
      if (totalPlayers < 2) {
        return;
      }

      gameInProgress.status = true;
      clearActiveBullets(activeBullets);

      // Generate walls
      const walls = generateWalls();
      wallLayoutVersion += 1;
      invalidateCachedNavGrid();
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

      // Add simple scripted bots if requested
      if (botCount > 0) {
        createBotsForCurrentMatch(botCount);
      }

      // Notify all clients that game is starting
      io.emit("gameStarting", { players: activePlayers, walls: walls });

      // Move players from waiting room to game room
      io.socketsLeave("waiting");
      console.log(
        "Game started with",
        activePlayers.length,
        "players",
        botCount > 0 ? `(including ${botCount} bot${botCount > 1 ? "s" : ""})` : "",
      );
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
        const bullet = {
          ...bulletData,
          bulletId: nextBulletId++,
          playerId: socket.id,
        };
        io.emit("newBullet", bullet);
        trackActiveBullet(bullet, player, activeBullets);
      }
    });

    // Player hit
    socket.on("playerHit", (payload) => {
      const now = Date.now();
      // Backward compatibility: if payload is a string, treat as target only
      let targetId = typeof payload === 'string' ? payload : payload && payload.targetId;
      const shooterId = payload && payload.shooterId ? payload.shooterId : null;
      const bulletId =
        payload && typeof payload.bulletId === "number"
          ? payload.bulletId
          : null;

      const target = activePlayers.find((p) => p.id === targetId);
      if (!target || !target.alive) return;

      const shooter = shooterId
        ? activePlayers.find((p) => p.id === shooterId)
        : null;

      if (shooter && shooter.isBot && isBotAllyPlayer(target)) {
        // Bot bullets should not damage other bots or bot-allied names.
        return;
      }

      // If we've already processed a hit for this bullet, ignore duplicates
      if (bulletId != null) {
        if (processedBulletHits.has(bulletId)) {
          removeActiveBullet(bulletId, activeBullets);
          return;
        }
        processedBulletHits.add(bulletId);
        removeActiveBullet(bulletId, activeBullets);
      }

      if (shooter && shooter.isBot) {
        const shooterState =
          shooter.botState && typeof shooter.botState === "object"
            ? shooter.botState
            : (shooter.botState = {});
        shooterState.lastDamageDealtAt = now;
      }

      if (target && target.isBot) {
        const targetState =
          target.botState && typeof target.botState === "object"
            ? target.botState
            : (target.botState = {});
        targetState.lastDamageTakenAt = now;
      }

      // Determine damage from shooter's weapon; default to pistol damage
      let damage = WEAPON_DAMAGE.pistol;
      if (shooter && typeof WEAPON_DAMAGE[shooter.weapon] === 'number') {
        damage = WEAPON_DAMAGE[shooter.weapon];
      }

      target.health = Math.max(0, (target.health ?? MAX_HEALTH) - damage);
      if (target.health <= 0) {
        target.alive = false;
        io.emit("playerKilled", target.id);

        // Award coins to the shooter for a kill
        if (shooter && shooter.accountUsername) {
          const shooterUsername = shooter.accountUsername;
          const targetUsername = target && target.accountUsername;
          // Prevent farming coins by eliminating a player tied to the same account
          const sameAccountKill =
            typeof targetUsername === "string" && shooterUsername === targetUsername;
          const shooterNamedAsBot = isBotAlliedName(shooter.displayName || shooter.name);
          const killedBot = !!(target && target.isBot);

          if (!sameAccountKill && !(shooterNamedAsBot && killedBot)) {
            const accountUser = usersByUsername.get(shooterUsername);
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
              io.to(shooter.id).emit("coinsUpdated", { coins: newCoins });
            }
          } else {
            console.log(
              `Skipping coin reward: ${shooterUsername} eliminated same-account player.`,
            );
          }
        }
      }

      // Broadcast updated state so clients can render health bars
      io.emit("gameState", activePlayers);

      // End the game if a winner is decided or only bots remain
      maybeTriggerGameOver();
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
        maybeTriggerGameOver();
      }

      console.log("Disconnected:", socket.id);
    });
  });

  function scheduleGameOver(winner) {
    if (gameOverTimeout) return;
    io.emit("gameOver", winner);
    gameOverTimeout = setTimeout(() => {
      resetGame();
    }, 5000);
  }

  function maybeTriggerGameOver() {
    if (!gameInProgress.status || gameOverTimeout) return;

    const alivePlayers = activePlayers.filter((p) => p.alive);
    if (alivePlayers.length === 0) return;

    const aliveHumans = alivePlayers.filter((p) => !p.isBot);
    if (aliveHumans.length === 0) {
      scheduleGameOver({ name: "Bots" });
      return;
    }

    if (alivePlayers.length === 1) {
      scheduleGameOver(alivePlayers[0]);
    }
  }

  function resetGame() {
    if (gameOverTimeout) {
      clearTimeout(gameOverTimeout);
      gameOverTimeout = null;
    }
    activePlayers.length = 0;
    gameWalls.length = 0;
    gameInProgress.status = false;
    nextBotId = 1;
    // Reset bullet bookkeeping between matches
    clearActiveBullets(activeBullets);
    nextBulletId = 1;
    processedBulletHits.clear();
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
    const MIN_WALL_LENGTH = 80;
    const MAX_WALL_LENGTH = 260;
    const MIN_WALL_THICKNESS = 18;
    const MAX_WALL_THICKNESS = 36;
    const NUM_WALLS = Math.floor(Math.random() * 5) + 8; // 8-12 walls

    const walls = [];

    // Generate walls
    for (let i = 0; i < NUM_WALLS; i++) {
      const isHorizontal = Math.random() > 0.5;
      const length =
        Math.floor(Math.random() * (MAX_WALL_LENGTH - MIN_WALL_LENGTH)) +
        MIN_WALL_LENGTH;
      const thickness =
        Math.floor(Math.random() * (MAX_WALL_THICKNESS - MIN_WALL_THICKNESS)) +
        MIN_WALL_THICKNESS;
      const width = isHorizontal ? length : thickness;
      const height = isHorizontal ? thickness : length;

      // No overlap checks: intersections are allowed to make layouts feel denser.
      const x = Math.floor(Math.random() * (CANVAS_WIDTH - width));
      const y = Math.floor(Math.random() * (CANVAS_HEIGHT - height));

      walls.push({ x, y, width, height });
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
    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
    const u = ((x1 - x3) * (y1 - y2) - (y1 - y3) * (x1 - x2)) / den;
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

  function distanceToLineSq(px, py, x0, y0, vx, vy) {
    const denom = vx * vx + vy * vy;
    if (denom < 1e-9) return Infinity;
    const t = ((px - x0) * vx + (py - y0) * vy) / denom;
    const closestX = x0 + vx * t;
    const closestY = y0 + vy * t;
    const dx = px - closestX;
    const dy = py - closestY;
    return dx * dx + dy * dy;
  }

  function invalidateCachedNavGrid() {
    cachedNavGrid = null;
  }

  function getNavGrid(walls) {
    if (
      cachedNavGrid &&
      cachedNavGrid.version === wallLayoutVersion &&
      cachedNavGrid.walkable &&
      cachedNavGrid.walkable.length > 0
    ) {
      return cachedNavGrid;
    }
    cachedNavGrid = buildNavGrid(walls);
    cachedNavGrid.version = wallLayoutVersion;
    return cachedNavGrid;
  }

  function buildNavGrid(walls) {
    const radius = BOT_CONFIG.playerRadius;
    const cellSize = Math.max(4, Math.floor(radius / 2));
    const width = BOT_CONFIG.canvasWidth;
    const height = BOT_CONFIG.canvasHeight;
    const cols = Math.ceil(width / cellSize);
    const rows = Math.ceil(height / cellSize);
    const walkable = new Array(rows);

    for (let r = 0; r < rows; r++) {
      walkable[r] = new Array(cols);
      for (let c = 0; c < cols; c++) {
        const wx = c * cellSize + cellSize / 2;
        const wy = r * cellSize + cellSize / 2;
        const insideBounds =
          wx >= radius &&
          wx <= width - radius &&
          wy >= radius &&
          wy <= height - radius;
        const blocked =
          !insideBounds ||
          circleCollidesAnyWall(wx, wy, radius, walls);
        walkable[r][c] = !blocked;
      }
    }

    return {
      cellSize,
      cols,
      rows,
      walkable,
      radius,
      width,
      height,
      walls,
      version: wallLayoutVersion,
    };
  }

  function worldToGrid(x, y, nav) {
    const col = Math.floor(x / nav.cellSize);
    const row = Math.floor(y / nav.cellSize);
    return {
      col: Math.max(0, Math.min(nav.cols - 1, col)),
      row: Math.max(0, Math.min(nav.rows - 1, row)),
    };
  }

  function gridToWorld(col, row, nav) {
    const x = col * nav.cellSize + nav.cellSize / 2;
    const y = row * nav.cellSize + nav.cellSize / 2;
    return { x, y };
  }

  function cellKey(col, row) {
    return `${col},${row}`;
  }

  function isCellWithinBounds(nav, col, row) {
    return col >= 0 && row >= 0 && col < nav.cols && row < nav.rows;
  }

  function collidesWithBulletsForPath(x, y, radius, bullets) {
    if (!bullets || bullets.length === 0) return false;
    for (const b of bullets) {
      if (!b || typeof b.x !== "number" || typeof b.y !== "number") continue;
      const avoidRadius = BOT_CONFIG.playerRadius;
      const dx = x - b.x;
      const dy = y - b.y;
      if (dx * dx + dy * dy < (avoidRadius + radius) * (avoidRadius + radius)) {
        return true;
      }
    }
    return false;
  }

  function isCellClear(nav, col, row, bullets) {
    if (!isCellWithinBounds(nav, col, row)) return false;
    if (!nav.walkable[row] || !nav.walkable[row][col]) return false;
    const pos = gridToWorld(col, row, nav);
    return !collidesWithBulletsForPath(pos.x, pos.y, nav.radius, bullets);
  }

  function findNearestClearCell(nav, startCol, startRow, bullets, maxRing = 3) {
    if (isCellClear(nav, startCol, startRow, bullets)) {
      return { col: startCol, row: startRow };
    }
    for (let ring = 1; ring <= maxRing; ring++) {
      for (let dr = -ring; dr <= ring; dr++) {
        for (let dc = -ring; dc <= ring; dc++) {
          if (Math.abs(dc) !== ring && Math.abs(dr) !== ring) continue;
          const col = startCol + dc;
          const row = startRow + dr;
          if (isCellClear(nav, col, row, bullets)) {
            return { col, row };
          }
        }
      }
    }
    return null;
  }

  function directPathClear(ax, ay, bx, by, nav, bullets) {
    const dx = bx - ax;
    const dy = by - ay;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1e-3) return true;
    const step = Math.max(4, nav.radius * 0.5);
    const steps = Math.max(1, Math.ceil(dist / step));

    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const px = ax + dx * t;
      const py = ay + dy * t;
      if (isPositionBlockedForPath(px, py, nav, bullets)) {
        return false;
      }
    }

    return true;
  }

  function isPositionBlockedForPath(x, y, nav, bullets) {
    const radius = nav.radius;
    if (
      x < radius ||
      x > nav.width - radius ||
      y < radius ||
      y > nav.height - radius
    ) {
      return true;
    }
    if (circleCollidesAnyWall(x, y, radius, nav.walls)) return true;
    if (collidesWithBulletsForPath(x, y, radius, bullets)) return true;
    return false;
  }

  function isTouchingBoundary(x, y, radius, width, height, margin = 1) {
    return (
      x <= radius + margin ||
      x >= width - radius - margin ||
      y <= radius + margin ||
      y >= height - radius - margin
    );
  }

  function smoothPath(points, nav, bullets) {
    if (!points || points.length <= 2) return points || [];
    const smoothed = [points[0]];
    let anchor = 0;
    while (anchor < points.length - 1) {
      let next = anchor + 1;
      for (let i = points.length - 1; i > anchor; i--) {
        if (
          directPathClear(
            points[anchor].x,
            points[anchor].y,
            points[i].x,
            points[i].y,
            nav,
            bullets,
          )
        ) {
          next = i;
          break;
        }
      }
      smoothed.push(points[next]);
      anchor = next;
    }
    return smoothed;
  }

  function findPath(nav, startPos, goalPos, bullets) {
    if (!nav || !startPos || !goalPos) return null;
    const startCell = worldToGrid(startPos.x, startPos.y, nav);
    const goalCell = worldToGrid(goalPos.x, goalPos.y, nav);
    const validStart = isCellClear(nav, startCell.col, startCell.row, bullets)
      ? startCell
      : findNearestClearCell(nav, startCell.col, startCell.row, bullets);
    const validGoal = isCellClear(nav, goalCell.col, goalCell.row, bullets)
      ? goalCell
      : findNearestClearCell(nav, goalCell.col, goalCell.row, bullets);
    if (!validStart || !validGoal) return null;

    const startKey = cellKey(validStart.col, validStart.row);
    const goalKey = cellKey(validGoal.col, validGoal.row);
    const cameFrom = {};
    const gScore = { [startKey]: 0 };
    const fScore = {
      [startKey]: Math.hypot(
        validGoal.col - validStart.col,
        validGoal.row - validStart.row,
      ),
    };

    const open = [
      {
        key: startKey,
        f: fScore[startKey],
        col: validStart.col,
        row: validStart.row,
      },
    ];
    const openSet = new Set([startKey]);

    const directions = [
      { dc: 1, dr: 0, cost: 1 },
      { dc: -1, dr: 0, cost: 1 },
      { dc: 0, dr: 1, cost: 1 },
      { dc: 0, dr: -1, cost: 1 },
      { dc: 1, dr: 1, cost: Math.SQRT2 },
      { dc: -1, dr: 1, cost: Math.SQRT2 },
      { dc: 1, dr: -1, cost: Math.SQRT2 },
      { dc: -1, dr: -1, cost: Math.SQRT2 },
    ];

    while (open.length > 0) {
      let bestIdx = 0;
      for (let i = 1; i < open.length; i++) {
        if (open[i].f < open[bestIdx].f) {
          bestIdx = i;
        }
      }
      const current = open.splice(bestIdx, 1)[0];
      openSet.delete(current.key);

      if (current.key === goalKey) {
        const rawPath = reconstructPath(cameFrom, current.key, nav);
        return smoothPath(rawPath, nav, bullets);
      }

      for (const dir of directions) {
        const nCol = current.col + dir.dc;
        const nRow = current.row + dir.dr;
        if (!isCellWithinBounds(nav, nCol, nRow)) continue;
        if (!isCellClear(nav, nCol, nRow, bullets)) continue;
        if (dir.dc !== 0 && dir.dr !== 0) {
          if (
            !isCellClear(nav, current.col + dir.dc, current.row, bullets) ||
            !isCellClear(nav, current.col, current.row + dir.dr, bullets)
          ) {
            continue;
          }
        }

        const neighborKey = cellKey(nCol, nRow);
        const tentativeG = (gScore[current.key] ?? Infinity) + dir.cost;
        if (tentativeG >= (gScore[neighborKey] ?? Infinity)) continue;

        cameFrom[neighborKey] = current.key;
        gScore[neighborKey] = tentativeG;
        fScore[neighborKey] =
          tentativeG +
          Math.hypot(validGoal.col - nCol, validGoal.row - nRow);

        if (!openSet.has(neighborKey)) {
          open.push({ key: neighborKey, f: fScore[neighborKey], col: nCol, row: nRow });
          openSet.add(neighborKey);
        } else {
          const existing = open.find((n) => n.key === neighborKey);
          if (existing) {
            existing.f = fScore[neighborKey];
          }
        }
      }
    }

    return null;
  }

  function reconstructPath(cameFrom, currentKey, nav) {
    const path = [];
    let key = currentKey;
    while (key) {
      const [c, r] = key.split(",").map((v) => parseInt(v, 10));
      path.push(gridToWorld(c, r, nav));
      key = cameFrom[key];
    }
    return path.reverse();
  }

  function computePathMovement(bot, botState, target, hasLineOfSight, now, walls, bullets) {
    if (!bot || !target) return null;
    const radius = BOT_CONFIG.playerRadius;
    const PATH_RECALC_TRAVEL = radius * 2.5;
    const PATH_RETRY_MS = 350;
    const STUCK_WINDOW_MS = 900;
    const STUCK_MIN_MOVEMENT = 12;
    const TOUCH_MARGIN = 1.5;

    if (hasLineOfSight) {
      botState.navPath = null;
      botState.navPathIndex = 0;
      botState.navPathNeedsRecalc = false;
      botState.navForcePath = false;
      return null;
    }

    const nav = getNavGrid(walls);

    if (typeof botState.navStuckSampleTime !== "number") {
      botState.navStuckSampleTime = now;
      botState.navStuckSampleX = bot.x;
      botState.navStuckSampleY = bot.y;
    } else if (now - botState.navStuckSampleTime >= STUCK_WINDOW_MS) {
      const dxSample = bot.x - botState.navStuckSampleX;
      const dySample = bot.y - botState.navStuckSampleY;
      const movedLittle =
        dxSample * dxSample + dySample * dySample <
        STUCK_MIN_MOVEMENT * STUCK_MIN_MOVEMENT;
      const touchingWall = circleCollidesAnyWall(
        bot.x,
        bot.y,
        radius + TOUCH_MARGIN,
        walls,
      );
      const touchingBounds = isTouchingBoundary(
        bot.x,
        bot.y,
        radius,
        BOT_CONFIG.canvasWidth,
        BOT_CONFIG.canvasHeight,
        TOUCH_MARGIN,
      );
      if (movedLittle && (touchingWall || touchingBounds)) {
        botState.navForcePath = true;
      }
      botState.navStuckSampleTime = now;
      botState.navStuckSampleX = bot.x;
      botState.navStuckSampleY = bot.y;
    }

    const pathActive =
      Array.isArray(botState.navPath) &&
      botState.navPath.length > 0 &&
      typeof botState.navPathIndex === "number" &&
      botState.navPathIndex < botState.navPath.length;
    const traveledSinceCalc =
      typeof botState.navLastCalcX === "number" && typeof botState.navLastCalcY === "number"
        ? Math.hypot(bot.x - botState.navLastCalcX, bot.y - botState.navLastCalcY)
        : 0;

    if (pathActive && traveledSinceCalc >= PATH_RECALC_TRAVEL) {
      botState.navPathNeedsRecalc = true;
    }

    let shouldComputePath = false;
    if (pathActive) {
      shouldComputePath = !!botState.navPathNeedsRecalc;
    } else {
      shouldComputePath = !!botState.navForcePath || !!botState.navPathNeedsRecalc;
    }

    if (shouldComputePath && now - (botState.navLastFailAt || 0) >= PATH_RETRY_MS) {
      const path = findPath(nav, { x: bot.x, y: bot.y }, { x: target.x, y: target.y }, bullets);
      if (path && path.length > 0) {
        botState.navPath = path;
        botState.navPathIndex = path.length > 1 ? 1 : 0;
        botState.navPathNeedsRecalc = false;
        botState.navForcePath = false;
        botState.navLastCalcAt = now;
        botState.navLastCalcX = bot.x;
        botState.navLastCalcY = bot.y;
        botState.navLastFailAt = null;
      } else {
        botState.navPath = null;
        botState.navPathIndex = 0;
        botState.navLastFailAt = now;
      }
    }

    const stillActive =
      Array.isArray(botState.navPath) &&
      botState.navPath.length > 0 &&
      !hasLineOfSight;

    if (!stillActive) {
      return null;
    }

    let idx = Math.max(
      0,
      Math.min(
        typeof botState.navPathIndex === "number" ? botState.navPathIndex : 0,
        botState.navPath.length - 1,
      ),
    );
    const reachDist = radius * 0.6;
    while (idx < botState.navPath.length) {
      const wp = botState.navPath[idx];
      const dx = wp.x - bot.x;
      const dy = wp.y - bot.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < reachDist) {
        idx += 1;
        continue;
      }
      if (!directPathClear(bot.x, bot.y, wp.x, wp.y, nav, bullets)) {
        botState.navPathNeedsRecalc = true;
        break;
      }
      botState.navPathIndex = idx;
      return {
        moveX: dx / (dist || 1e-6),
        moveY: dy / (dist || 1e-6),
        active: true,
      };
    }
    botState.navPath = null;
    botState.navPathIndex = 0;
    return null;
  }

  function trackActiveBullet(bulletData, shooter, bullets) {
    if (
      !bulletData ||
      typeof bulletData.x !== "number" ||
      typeof bulletData.y !== "number" ||
      typeof bulletData.angle !== "number" ||
      typeof bulletData.bulletId !== "number"
    ) {
      return;
    }

    const shooterWeapon =
      shooter && shooter.weapon && WEAPONS[shooter.weapon]
        ? WEAPONS[shooter.weapon]
        : null;
    const speed =
      typeof bulletData.speed === "number"
        ? bulletData.speed
        : shooterWeapon && typeof shooterWeapon.bulletSpeed === "number"
          ? shooterWeapon.bulletSpeed
          : DEFAULT_BULLET_SPEED;
    const radius =
      typeof bulletData.radius === "number"
        ? bulletData.radius
        : shooterWeapon && typeof shooterWeapon.bulletRadius === "number"
          ? shooterWeapon.bulletRadius
          : DEFAULT_BULLET_RADIUS;

    const createdAt = Date.now();
    const speedPerSec = speed * 60; // client bullets move per frame (~60 fps)
    const vx = Math.cos(bulletData.angle) * speedPerSec;
    const vy = Math.sin(bulletData.angle) * speedPerSec;

    bullets.push({
      id: bulletData.bulletId,
      playerId: bulletData.playerId || (shooter && shooter.id) || null,
      shooterIsBot: !!(shooter && shooter.isBot),
      x: bulletData.x,
      y: bulletData.y,
      angle: bulletData.angle,
      radius,
      speedPerSec,
      vx,
      vy,
      createdAt,
      lastUpdatedAt: createdAt,
    });
  }

  function removeActiveBullet(bulletId, bullets) {
    if (bulletId == null) return;
    const idx = bullets.findIndex((b) => b && b.id === bulletId);
    if (idx !== -1) {
      bullets.splice(idx, 1);
    }
  }

  function clearActiveBullets(bullets) {
    bullets.length = 0;
  }

  function advanceActiveBullets(now, walls) {
    for (let i = activeBullets.length - 1; i >= 0; i--) {
      const b = activeBullets[i];
      if (!b) {
        activeBullets.splice(i, 1);
        continue;
      }

      const dtMs =
        typeof b.lastUpdatedAt === "number"
          ? Math.max(0, Math.min(200, now - b.lastUpdatedAt))
          : 0;
      const dtSec = dtMs / 1000;
      const prevX = b.x;
      const prevY = b.y;
      b.x += b.vx * dtSec;
      b.y += b.vy * dtSec;
      b.lastUpdatedAt = now;

      const agedOut =
        typeof b.createdAt === "number" && now - b.createdAt > BULLET_MAX_LIFETIME_MS;
      const outOfBounds =
        b.x < -b.radius ||
        b.x > BOT_CONFIG.canvasWidth + b.radius ||
        b.y < -b.radius ||
        b.y > BOT_CONFIG.canvasHeight + b.radius;
      const hitWall =
        circleCollidesAnyWall(b.x, b.y, b.radius, walls) ||
        segmentCrossesWallDiscrete(prevX, prevY, b.x, b.y, walls, 2);

      if (agedOut || outOfBounds || hitWall) {
        activeBullets.splice(i, 1);
      }
    }
  }

  function findIncomingBulletThreat(bot, bullets, walls) {
    if (!bot || !bullets || bullets.length === 0) return null;
    const botRadius = BOT_CONFIG.playerRadius;
    const maxLookaheadSec = 1.5;
    let best = null;

    for (const b of bullets) {
      if (!b || b.shooterIsBot) continue;
      if (
        typeof b.x !== "number" ||
        typeof b.y !== "number" ||
        typeof b.vx !== "number" ||
        typeof b.vy !== "number"
      ) {
        continue;
      }

      const relX = b.x - bot.x;
      const relY = b.y - bot.y;
      const vDotV = b.vx * b.vx + b.vy * b.vy;
      if (vDotV < 1e-9) continue;

      const radiusSum = (typeof b.radius === "number" ? b.radius : DEFAULT_BULLET_RADIUS) + botRadius;
      const bCoef = 2 * (relX * b.vx + relY * b.vy);
      const c = relX * relX + relY * relY - radiusSum * radiusSum;
      const disc = bCoef * bCoef - 4 * vDotV * c;
      if (disc < 0) continue;
      const sqrtDisc = Math.sqrt(disc);
      const t1 = (-bCoef - sqrtDisc) / (2 * vDotV);
      const t2 = (-bCoef + sqrtDisc) / (2 * vDotV);
      const times = [t1, t2].filter((t) => t >= 0 && Number.isFinite(t));
      if (times.length === 0) continue;
      const tHit = Math.min(...times);
      if (tHit > maxLookaheadSec) continue;
      // rel dot v < 0 means bullet is moving toward the bot
      if (bCoef >= 0) continue;

      const hitX = b.x + b.vx * tHit;
      const hitY = b.y + b.vy * tHit;
      if (
        segmentCrossesWallDiscrete(b.x, b.y, hitX, hitY, walls, 2) ||
        lineIntersectsAnyWall(b.x, b.y, hitX, hitY, walls)
      ) {
        continue;
      }

      const incomingAngle = Math.atan2(b.vy, b.vx);
      if (!best || tHit < best.timeToImpact) {
        best = {
          bullet: b,
          timeToImpact: tHit,
          hitX,
          hitY,
          incomingAngle,
        };
      }
    }

    return best;
  }

  // --- Simple server-side bots (step 0) ---

  function createBotsForCurrentMatch(count) {
    const numBots = Math.max(
      0,
      Math.min(count || 0, BOT_CONFIG.maxPerMatch),
    );
    if (numBots === 0) return;

    const radius = BOT_CONFIG.playerRadius;
    const canvasWidth = BOT_CONFIG.canvasWidth;
    const canvasHeight = BOT_CONFIG.canvasHeight;
    let spawnX = radius + 20;
    let spawnY = canvasHeight - radius - 20;
    spawnX = Math.max(radius, Math.min(spawnX, canvasWidth - radius));
    spawnY = Math.max(radius, Math.min(spawnY, canvasHeight - radius));
    if (circleCollidesAnyWall(spawnX, spawnY, radius, gameWalls)) {
      const fallback = getValidSpawnPosition(gameWalls, activePlayers);
      spawnX = fallback.x;
      spawnY = fallback.y;
    }

    for (let i = 0; i < numBots; i++) {
      const botId = `bot-${nextBotId++}`;
      const color =
        colors[(activePlayers.length + i) % colors.length] || "#888888";
      const spawn = { x: spawnX, y: spawnY };
      const bot = {
        id: botId,
        name: `BOT ${i + 1}`,
        displayName: `BOT ${i + 1}`,
        accountUsername: null,
        color,
        weapon: BOT_CONFIG.weaponKey,
        weaponSkinKey:
          DEFAULT_SKIN_BY_WEAPON[BOT_CONFIG.weaponKey] || null,
        x: spawn.x,
        y: spawn.y,
        angle: 0,
        alive: true,
        health: MAX_HEALTH,
        isBot: true,
        botState: {
          lastShotAt: 0,
        },
      };
      activePlayers.push(bot);
    }
  }

  function computeLeadAim(
    shooterX,
    shooterY,
    targetX,
    targetY,
    targetVelX,
    targetVelY,
    bulletSpeedPerSec,
    maxLeadSeconds = 1.2,
  ) {
    if (!isFinite(bulletSpeedPerSec) || bulletSpeedPerSec <= 0) {
      return null;
    }

    const rx = targetX - shooterX;
    const ry = targetY - shooterY;
    const a =
      targetVelX * targetVelX +
      targetVelY * targetVelY -
      bulletSpeedPerSec * bulletSpeedPerSec;
    const b = 2 * (rx * targetVelX + ry * targetVelY);
    const c = rx * rx + ry * ry;

    let t = null;

    if (Math.abs(a) < 1e-6) {
      if (Math.abs(b) > 1e-6) {
        t = -c / b;
      }
    } else {
      const disc = b * b - 4 * a * c;
      if (disc >= 0) {
        const sqrtDisc = Math.sqrt(disc);
        const t1 = (-b - sqrtDisc) / (2 * a);
        const t2 = (-b + sqrtDisc) / (2 * a);
        const candidates = [t1, t2].filter(
          (val) => val > 0 && Number.isFinite(val),
        );
        if (candidates.length > 0) {
          t = Math.min(...candidates);
        }
      }
    }

    if (typeof t !== "number" || t <= 0 || !isFinite(t)) {
      return null;
    }

    const leadTime = Math.min(t, maxLeadSeconds);
    const aimX = targetX + targetVelX * leadTime;
    const aimY = targetY + targetVelY * leadTime;

    return {
      aimX,
      aimY,
      angle: Math.atan2(aimY - shooterY, aimX - shooterX),
      leadTime,
    };
  }

  function computeScriptedBotAction(bot, players, walls) {
    if (!bot || !bot.alive) {
      return {
        moveX: 0,
        moveY: 0,
        aimAngle: bot ? bot.angle || 0 : 0,
        shoot: false,
      };
    }

    const now = Date.now();
    const botState =
      bot.botState && typeof bot.botState === "object"
        ? bot.botState
        : (bot.botState = {});
    const prevHealth =
      typeof botState.lastHealth === "number" ? botState.lastHealth : bot.health;
    const tookDamage = bot.health < prevHealth;
    botState.lastHealth = bot.health;
    if (tookDamage) {
      botState.lastDamageTakenAt = now;
    }

    // Persistent strafe direction (flips when strafing is getting punished)
    if (typeof botState.strafeDir !== "number" || botState.strafeDir === 0) {
      botState.strafeDir = Math.random() < 0.5 ? -1 : 1;
    }

    // Occasionally flip strafe direction just to stay unpredictable.
    const STRAFE_DRIFT_INTERVAL_MS = 20000;
    const lastStrafeDriftCheck =
      typeof botState.lastStrafeDriftCheck === "number"
        ? botState.lastStrafeDriftCheck
        : 0;
    if (now - lastStrafeDriftCheck >= STRAFE_DRIFT_INTERVAL_MS) {
      botState.lastStrafeDriftCheck = now;
      if (Math.random() < 0.5) {
        botState.strafeDir = -botState.strafeDir;
      }
    }

    const STRAFE_DAMAGE_CHAIN_MS = 10000;
    if (
      typeof botState.lastDamageStrafeTime === "number" &&
      now - botState.lastDamageStrafeTime > STRAFE_DAMAGE_CHAIN_MS
    ) {
      botState.damageStrafeChain = 0;
    }

    let target = null;
    let closestDistSq = Infinity;
    for (const p of players) {
      // Bots should only target real players, never other bots (including themselves).
      if (!p || !p.alive || p.id === bot.id || p.isBot) continue;
      const dx = p.x - bot.x;
      const dy = p.y - bot.y;
      const distSq = dx * dx + dy * dy;
      if (distSq < closestDistSq) {
        closestDistSq = distSq;
        target = p;
      }
    }

    if (!target) {
      botState.lastMoveMode = "idle";
      botState.lastStrafeDirUsed = null;
      return {
        moveX: 0,
        moveY: 0,
        aimAngle: bot.angle || 0,
        shoot: false,
      };
    }

    const isDodgingActive =
      typeof botState.dodgeUntil === "number" &&
      now < botState.dodgeUntil &&
      typeof botState.dodgeDirX === "number" &&
      typeof botState.dodgeDirY === "number";
    if (
      !isDodgingActive &&
      typeof botState.dodgeUntil === "number" &&
      now >= botState.dodgeUntil
    ) {
      botState.dodgeUntil = null;
      botState.dodgeDirX = 0;
      botState.dodgeDirY = 0;
    }

    const dx = target.x - bot.x;
    const dy = target.y - bot.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1e-6;
    const dirX = dx / dist;
    const dirY = dy / dist;

    // If we're taking repeated damage while strafing in the same direction,
    // either flip our strafe direction *or* commit to a short forward charge
    // through the bullet stream.
    if (
      tookDamage &&
      botState.lastMoveMode === "strafe" &&
      typeof botState.lastStrafeDirUsed === "number"
    ) {
      const lastDamageDir =
        typeof botState.lastDamageStrafeDir === "number"
          ? botState.lastDamageStrafeDir
          : null;
      const lastDamageTime =
        typeof botState.lastDamageStrafeTime === "number"
          ? botState.lastDamageStrafeTime
          : 0;

      if (
        lastDamageDir === botState.lastStrafeDirUsed &&
        now - lastDamageTime <= STRAFE_DAMAGE_CHAIN_MS
      ) {
        botState.damageStrafeChain =
          typeof botState.damageStrafeChain === "number"
            ? botState.damageStrafeChain + 1
            : 1;
      } else {
        botState.damageStrafeChain = 1;
      }

      botState.lastDamageStrafeDir = botState.lastStrafeDirUsed;
      botState.lastDamageStrafeTime = now;

      const STRAFE_FLIP_COOLDOWN_MS = 500;
      const lastFlipAt =
        typeof botState.lastStrafeFlipAt === "number"
          ? botState.lastStrafeFlipAt
          : 0;
      if (
        botState.damageStrafeChain >= 1 &&
        now - lastFlipAt >= STRAFE_FLIP_COOLDOWN_MS
      ) {
        const commitCharge = Math.random() < 0.5;
        const currentDir =
          typeof botState.strafeDir === "number" && botState.strafeDir !== 0
            ? botState.strafeDir
            : 1;

        if (commitCharge) {
          const CHARGE_DURATION_MS = 900;
          botState.strafeChargeUntil = now + CHARGE_DURATION_MS;
          botState.strafeChargeDirX = dirX;
          botState.strafeChargeDirY = dirY;
        } else {
          botState.strafeDir = -currentDir;
        }

        botState.lastStrafeFlipAt = now;
        botState.damageStrafeChain = 0;
      }
    } else if (tookDamage) {
      botState.damageStrafeChain = 0;
      botState.lastDamageStrafeDir = null;
    }

    const chargeActive =
      typeof botState.strafeChargeUntil === "number" &&
      now < botState.strafeChargeUntil &&
      typeof botState.strafeChargeDirX === "number" &&
      typeof botState.strafeChargeDirY === "number";
    if (
      !chargeActive &&
      typeof botState.strafeChargeUntil === "number" &&
      now >= botState.strafeChargeUntil
    ) {
      botState.strafeChargeUntil = null;
      botState.strafeChargeDirX = 0;
      botState.strafeChargeDirY = 0;
    }

    const weaponCfg = WEAPONS[BOT_CONFIG.weaponKey] || {};
    const bulletSpeed =
      typeof weaponCfg.bulletSpeed === "number" ? weaponCfg.bulletSpeed : 10;
    const bulletSpeedPerSec = bulletSpeed * 60; // approximate client frame rate

    const targetMemory =
      botState.targetMemory && typeof botState.targetMemory === "object"
        ? botState.targetMemory
        : (botState.targetMemory = {});
    const lastSeen = targetMemory[target.id];
    let targetVelX = 0;
    let targetVelY = 0;
    if (lastSeen && typeof lastSeen.time === "number") {
      const dt = (now - lastSeen.time) / 1000;
      if (dt > 0.0001) {
        targetVelX = (target.x - lastSeen.x) / dt;
        targetVelY = (target.y - lastSeen.y) / dt;
      }
    }
    targetMemory[target.id] = { x: target.x, y: target.y, time: now };
    for (const key of Object.keys(targetMemory)) {
      if (key !== target.id) {
        delete targetMemory[key];
      }
    }

    const lead = computeLeadAim(
      bot.x,
      bot.y,
      target.x,
      target.y,
      targetVelX,
      targetVelY,
      bulletSpeedPerSec,
    );
    let aimTargetX = target.x;
    let aimTargetY = target.y;
    let aimAngle = Math.atan2(dy, dx);
    if (lead && typeof lead.angle === "number") {
      aimTargetX = lead.aimX;
      aimTargetY = lead.aimY;
      aimAngle = lead.angle;
    }

    // Add some randomness to the aim
    const inaccuracy =
      (Math.random() - 0.5) * 2 * BOT_CONFIG.aimInaccuracy;
    aimAngle += inaccuracy;

    const moveTargetX = target.x;
    const moveTargetY = target.y;
    const moveDx = moveTargetX - bot.x;
    const moveDy = moveTargetY - bot.y;
    const moveDist = Math.sqrt(moveDx * moveDx + moveDy * moveDy) || 1e-6;
    const moveDirX = moveDx / moveDist;
    const moveDirY = moveDy / moveDist;

    const desiredDistance = 220;
    const distanceBand = 40;
    let moveX = 0;
    let moveY = 0;
    let moveMode = "idle";
    let strafeDirUsed = null;

    if (chargeActive) {
      moveX = botState.strafeChargeDirX || dirX;
      moveY = botState.strafeChargeDirY || dirY;
      moveMode = "charge";
    } else if (moveDist > desiredDistance + distanceBand) {
      // Close in
      moveX = moveDirX;
      moveY = moveDirY;
      moveMode = "chase";
    } else if (moveDist < desiredDistance - distanceBand) {
      // Back up
      moveX = -moveDirX;
      moveY = -moveDirY;
      moveMode = "retreat";
    } else {
      // Strafe sideways around the target
      moveX = -moveDirY * botState.strafeDir;
      moveY = moveDirX * botState.strafeDir;
      moveMode = "strafe";
      strafeDirUsed = botState.strafeDir;
    }

    const hasLineOfSight = !lineIntersectsAnyWall(
      bot.x,
      bot.y,
      aimTargetX,
      aimTargetY,
      walls,
    );
    const targetIsBotAlly = isBotAllyPlayer(target);
    const shouldShoot = !targetIsBotAlly && hasLineOfSight && dist < 550;

    const pathMove = computePathMovement(
      bot,
      botState,
      target,
      hasLineOfSight,
      now,
      walls,
      activeBullets,
    );
    const pathFollowing = !!(pathMove && pathMove.active);
    const navigationFocused = pathFollowing || !!botState.navForcePath;
    const pathRecentlyBlocked =
      !hasLineOfSight &&
      botState.navForcePath &&
      (!botState.navPath || botState.navPath.length === 0) &&
      typeof botState.navLastFailAt === "number" &&
      now - botState.navLastFailAt < 800;

    if (pathMove && pathMove.active) {
      moveX = pathMove.moveX;
      moveY = pathMove.moveY;
      moveMode = "path";
      strafeDirUsed = null;
    } else if (pathRecentlyBlocked) {
      const sidestepDir = Math.random() < 0.5 ? -1 : 1;
      moveX = -moveDirY * sidestepDir;
      moveY = moveDirX * sidestepDir;
      moveMode = "pathBlocked";
      strafeDirUsed = null;
    }

    // Detect when we're trying to peek past a wall (line of sight blocked) and
    // repeatedly bouncing off bullet dodges. In that case, temporarily ignore
    // bullet-dodge logic so the bot can push through the bullet stream.
    const lineBlockedToTarget = lineIntersectsAnyWall(
      bot.x,
      bot.y,
      target.x,
      target.y,
      walls,
    );
    const pushActive =
      !navigationFocused &&
      typeof botState.pushThroughUntil === "number" &&
      now < botState.pushThroughUntil &&
      botState.pushThroughForTargetId === target.id;
    let pushingThrough = !navigationFocused && !!pushActive;
    if (pushingThrough && !lineBlockedToTarget) {
      botState.pushThroughUntil = null;
      botState.pushThroughForTargetId = null;
      botState.peekThreatCount = 0;
      pushingThrough = false;
    }

    // Dodge incoming bullets from human players by strafing perpendicular to the shot.
    const threat = findIncomingBulletThreat(bot, activeBullets, walls);
    const DODGE_DURATION_MS = 650;
    let dodging = isDodgingActive;

    const peekThreatEligible = !navigationFocused && threat && lineBlockedToTarget;
    if (peekThreatEligible) {
      const lastThreatAt =
        typeof botState.lastPeekThreatAt === "number"
          ? botState.lastPeekThreatAt
          : 0;
      if (now - lastThreatAt <= 1400) {
        botState.peekThreatCount =
          typeof botState.peekThreatCount === "number"
            ? botState.peekThreatCount + 1
            : 1;
      } else {
        botState.peekThreatCount = 1;
      }
      botState.lastPeekThreatAt = now;
      if (
        botState.peekThreatCount >= 2 &&
        (!pushingThrough ||
          !botState.peekMode ||
          typeof botState.peekModeUntil !== "number" ||
          now >= botState.peekModeUntil)
      ) {
        const decidePush = Math.random() < 0.5 ? "push" : "fallback";
        botState.peekMode = decidePush;
        botState.peekModeTargetId = target.id;
        botState.peekModeUntil = now + 1200;

        if (decidePush === "push") {
          botState.pushThroughUntil = now + 900;
          botState.pushThroughForTargetId = target.id;
          pushingThrough = true;
          botState.peekFallbackX = 0;
          botState.peekFallbackY = 0;
        } else {
          const options = [
            { x: -dirX, y: -dirY }, // back off
            { x: -dirY, y: dirX },  // strafe left
            { x: dirY, y: -dirX },  // strafe right
          ];
          const chosen =
            options[Math.floor(Math.random() * options.length)] || options[0];
          botState.peekFallbackX = chosen.x;
          botState.peekFallbackY = chosen.y;
          botState.pushThroughUntil = null;
          botState.pushThroughForTargetId = null;
          pushingThrough = false;
        }
      }
    } else if (!threat) {
      botState.peekThreatCount = 0;
      botState.peekMode = null;
      botState.peekModeUntil = null;
      botState.peekModeTargetId = null;
    }

    if (
      !dodging &&
      !pushingThrough &&
      threat &&
      threat.bullet &&
      threat.bullet.id !== botState.lastDodgedBulletId
    ) {
      const incoming = threat.incomingAngle;
      const left = { x: -Math.sin(incoming), y: Math.cos(incoming) };
      const right = { x: Math.sin(incoming), y: -Math.cos(incoming) };

      function scoreDodge(dir) {
        const step = BOT_CONFIG.moveSpeedPerTick * 3;
        const radius = BOT_CONFIG.playerRadius;
        const width = BOT_CONFIG.canvasWidth;
        const height = BOT_CONFIG.canvasHeight;
        let tx = bot.x + dir.x * step;
        let ty = bot.y + dir.y * step;
        tx = Math.max(radius, Math.min(tx, width - radius));
        ty = Math.max(radius, Math.min(ty, height - radius));
        if (circleCollidesAnyWall(tx, ty, radius, walls)) {
          return -Infinity;
        }
        const distToPathSq = distanceToLineSq(
          tx,
          ty,
          threat.bullet.x,
          threat.bullet.y,
          threat.bullet.vx,
          threat.bullet.vy,
        );
        const dxHit = tx - threat.hitX;
        const dyHit = ty - threat.hitY;
        const distFromHitSq = dxHit * dxHit + dyHit * dyHit;
        return distToPathSq * 0.7 + distFromHitSq * 0.3;
      }

      const scoreLeft = scoreDodge(left);
      const scoreRight = scoreDodge(right);

      if (scoreLeft > -Infinity || scoreRight > -Infinity) {
        let chosen = null;
        if (scoreLeft >= scoreRight) {
          chosen = left;
        } else {
          chosen = right;
        }
        if (chosen) {
          moveX = chosen.x;
          moveY = chosen.y;
          moveMode = "dodge";
          botState.dodgeDirX = chosen.x;
          botState.dodgeDirY = chosen.y;
          botState.dodgeUntil = now + DODGE_DURATION_MS;
          botState.lastDodgedBulletId = threat.bullet.id;
          botState.navPathNeedsRecalc = true;
          dodging = true;
        }
      }
    } else if (dodging) {
      moveX = botState.dodgeDirX;
      moveY = botState.dodgeDirY;
      moveMode = "dodge";
    }

    if (
      !navigationFocused &&
      botState.peekMode === "push" &&
      typeof botState.peekModeUntil === "number" &&
      now < botState.peekModeUntil &&
      botState.peekModeTargetId === target.id
    ) {
      pushingThrough = true;
    }

    const fallbackPeekActive =
      !navigationFocused &&
      botState.peekMode === "fallback" &&
      typeof botState.peekModeUntil === "number" &&
      now < botState.peekModeUntil &&
      botState.peekModeTargetId === target.id;

    if (fallbackPeekActive) {
      moveX =
        typeof botState.peekFallbackX === "number"
          ? botState.peekFallbackX
          : -dirX;
      moveY =
        typeof botState.peekFallbackY === "number"
          ? botState.peekFallbackY
          : -dirY;
      dodging = false; // commit to the fallback choice
      moveMode = "peekFallback";
      strafeDirUsed = null;
    }

    if (!dodging && !fallbackPeekActive) {
      // Occasionally pause movement so bots don't orbit forever in stalemates.
      const PAUSE_INTERVAL_MS = 20000; // roughly "once every 20 seconds"
      const MIN_PAUSE_MS = 800;
      const MAX_PAUSE_MS = 1600;
      const allowRandomPause = !navigationFocused;

      if (typeof botState.pauseUntil === "number") {
        if (!allowRandomPause) {
          botState.pauseUntil = null;
        } else if (now < botState.pauseUntil) {
          // Currently paused: stop movement but still allow aiming/shooting.
          moveX = 0;
          moveY = 0;
          moveMode = "pause";
          strafeDirUsed = null;
        } else {
          // Pause expired.
          botState.pauseUntil = null;
        }
      } else if (allowRandomPause) {
        const lastDecision =
          typeof botState.lastPauseDecisionAt === "number"
            ? botState.lastPauseDecisionAt
            : 0;
        if (now - lastDecision >= PAUSE_INTERVAL_MS) {
          botState.lastPauseDecisionAt = now;
          // Randomize whether we actually pause at this interval boundary.
          if (Math.random() < 0.6) {
            const duration =
              MIN_PAUSE_MS + Math.random() * (MAX_PAUSE_MS - MIN_PAUSE_MS);
            botState.pauseUntil = now + duration;
            moveX = 0;
            moveY = 0;
            moveMode = "pause";
            strafeDirUsed = null;
          }
        }
      }
    }

    const moveLengthSq = moveX * moveX + moveY * moveY;
    if (moveLengthSq < 1e-5 && moveMode !== "pause") {
      moveMode = "idle";
      strafeDirUsed = null;
    }

    botState.lastMoveMode = moveMode;
    botState.lastStrafeDirUsed = moveMode === "strafe" ? strafeDirUsed : null;

    return { moveX, moveY, aimAngle, shoot: shouldShoot };
  }

  function circleCollidesAnyWall(cx, cy, radius, walls) {
    for (const wall of walls) {
      const closestX = Math.max(wall.x, Math.min(cx, wall.x + wall.width));
      const closestY = Math.max(wall.y, Math.min(cy, wall.y + wall.height));
      const dx = cx - closestX;
      const dy = cy - closestY;
      if (Math.sqrt(dx * dx + dy * dy) < radius) {
        return true;
      }
    }
    return false;
  }

  function fireBulletFromBot(bot) {
    if (!bot || !bot.alive) return false;
    const weaponCfg = WEAPONS[BOT_CONFIG.weaponKey] || {};
    const weaponLength =
      typeof weaponCfg.weaponLength === "number"
        ? weaponCfg.weaponLength
        : 30;
    const bulletSpeed =
      typeof weaponCfg.bulletSpeed === "number" ? weaponCfg.bulletSpeed : null;
    const bulletRadius =
      typeof weaponCfg.bulletRadius === "number" ? weaponCfg.bulletRadius : null;
    const tipX = bot.x + Math.cos(bot.angle) * weaponLength;
    const tipY = bot.y + Math.sin(bot.angle) * weaponLength;

    if (
      isPointInsideAnyWall(tipX, tipY, gameWalls) ||
      segmentCrossesWallDiscrete(bot.x, bot.y, tipX, tipY, gameWalls, 2) ||
      lineIntersectsAnyWall(bot.x, bot.y, tipX, tipY, gameWalls)
    ) {
      return false;
    }

    const bullet = {
      bulletId: nextBulletId++,
      x: tipX,
      y: tipY,
      angle: bot.angle,
      playerId: bot.id,
      speed: bulletSpeed ?? undefined,
      radius: bulletRadius ?? undefined,
    };

    io.emit("newBullet", bullet);
    trackActiveBullet(bullet, bot, activeBullets);
    return true;
  }

  function applyBotAction(bot, action, now) {
    if (!bot || !bot.alive || !action) return false;

    const radius = BOT_CONFIG.playerRadius;
    const width = BOT_CONFIG.canvasWidth;
    const height = BOT_CONFIG.canvasHeight;
    const moveSpeed = BOT_CONFIG.moveSpeedPerTick;

    let moved = false;

    const mx = action.moveX || 0;
    const my = action.moveY || 0;
    const length = Math.sqrt(mx * mx + my * my);

    if (length > 0.001) {
      const dirX = mx / length;
      const dirY = my / length;
      bot.x += dirX * moveSpeed;
      bot.y += dirY * moveSpeed;
      moved = true;

      // Resolve wall collisions by pushing the bot out
      for (const wall of gameWalls) {
        const closestX = Math.max(
          wall.x,
          Math.min(bot.x, wall.x + wall.width)
        );
        const closestY = Math.max(
          wall.y,
          Math.min(bot.y, wall.y + wall.height)
        );
        const distX = bot.x - closestX;
        const distY = bot.y - closestY;
        const distance = Math.sqrt(distX * distX + distY * distY);

        if (distance < radius) {
          const overlap = radius - distance;
          const pushAngle = Math.atan2(distY, distX);
          bot.x += Math.cos(pushAngle) * overlap;
          bot.y += Math.sin(pushAngle) * overlap;
        }
      }

      // Clamp to arena bounds after collision resolution
      bot.x = Math.max(radius, Math.min(bot.x, width - radius));
      bot.y = Math.max(radius, Math.min(bot.y, height - radius));
    }

    if (typeof action.aimAngle === "number") {
      bot.angle = action.aimAngle;
    }

    if (action.shoot) {
      const botState = bot.botState || (bot.botState = {});
      const lastShotAt =
        typeof botState.lastShotAt === "number" ? botState.lastShotAt : 0;
      if (now - lastShotAt >= WEAPONS[BOT_CONFIG.weaponKey].cooldownMs * (2 - 1)) {
        if (fireBulletFromBot(bot)) {
          botState.lastShotAt = now;
        }
      }
    }

    return moved;
  }

  function runBotsTick() {
    if (!gameInProgress.status) return;
    if (!Array.isArray(activePlayers) || activePlayers.length === 0) return;

    const bots = activePlayers.filter((p) => p && p.isBot && p.alive);
    if (bots.length === 0) return;

    const snapshotPlayers = activePlayers.slice();
    const now = Date.now();
    advanceActiveBullets(now, gameWalls);
    let anyBotMoved = false;

    for (const bot of bots) {
      const action = computeScriptedBotAction(bot, snapshotPlayers, gameWalls);
      const moved = applyBotAction(bot, action, now);
      if (moved) {
        anyBotMoved = true;
      }
    }

    if (anyBotMoved) {
      io.emit("gameState", activePlayers);
    }
  }

  const BOT_TICK_MS = 50;
  setInterval(runBotsTick, BOT_TICK_MS);

  return {
    waitingPlayers,
    activePlayers,
    gameWalls,
    gameInProgress,
  };
}

module.exports = { createGameServer };
