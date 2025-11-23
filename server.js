const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
const path = require("path");

const { createAuthRoutes } = require("./routes/authRoutes");
const { createShopRoutes } = require("./routes/shopRoutes");
const { createGameServer } = require("./game/gameServer");

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Attach core features
const gameState = createGameServer(io);
app.use("/api", createAuthRoutes());
app.use(
  "/api/shop",
  createShopRoutes({ io, activePlayers: gameState.activePlayers }),
);

server.listen(3001, () => {
  console.log("Server running on http://localhost:3001");
});
