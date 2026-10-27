const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
const path = require("path");

const { createAuthRoutes } = require("./routes/authRoutes");
const { createShopRoutes } = require("./routes/shopRoutes");
const { createLobbyServer } = require("./game/lobbyServer");

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
app.use("/vendor/rowdies", express.static(path.join(__dirname, "node_modules/@fontsource/rowdies")));
app.use("/vendor/manrope", express.static(path.join(__dirname, "node_modules/@fontsource/manrope")));
app.use(express.static(path.join(__dirname, "public")));

// Attach core features
const gameState = createLobbyServer(io);
app.use("/api", createAuthRoutes());
app.use(
  "/api/shop",
  createShopRoutes({ io, getActivePlayers: () => gameState.getActivePlayers() }),
);

const port = process.env.PORT === undefined ? 3001 : Number(process.env.PORT);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  throw new Error("PORT must be an integer between 0 and 65535");
}
server.listen(port, () => {
  console.log(`Server running on http://localhost:${server.address().port}`);
});
