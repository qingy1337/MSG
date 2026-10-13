const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
const path = require("path");

const { createAuthRoutes } = require("./routes/authRoutes");
const { createShopRoutes } = require("./routes/shopRoutes");
const { createGameServer } = require("./game/gameServer");

const app = express();
const server = http.createServer(app);
const io = socketIO(server,{
  // State packets are repetitive JSON and compress extremely well. A modest
  // compression level trades spare server CPU for substantially less egress
  // and less queueing on slower clients.
  perMessageDeflate:{threshold:1024,zlibDeflateOptions:{level:3}},
});

app.use(express.json());
app.use("/vendor/three", express.static(path.join(__dirname, "node_modules/three/build")));
app.use("/vendor/three/addons", express.static(path.join(__dirname, "node_modules/three/examples/jsm")));
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
