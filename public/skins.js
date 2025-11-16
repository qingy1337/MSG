// Shared weapon skin definitions for client + server.
// In the browser this file exposes a global WEAPON_SKINS constant.
// In Node (server.js) it can be required and will export WEAPON_SKINS.

const WEAPON_SKINS = {
  pistol: [
    {
      key: "pistol_default",
      weaponKey: "pistol",
      name: "Default",
      description: "Plain black barrel. No-frills starter look.",
      price: 0,
      isDefault: true,
      bulletColor: "#111827",
      shapes: [
        {
          type: "line",
          fromX: 0,
          fromY: 0,
          toX: 1,
          toY: 0,
          lineWidth: 3,
          color: "#111827",
        },
      ],
    },
    {
      key: "pistol_basicBlue",
      weaponKey: "pistol",
      name: "Basic Blue",
      description: "Same profile, but the barrel is blue and the bullets glow green.",
      price: 40,
      isDefault: false,
      bulletColor: "#22c55e", // green
      shapes: [
        {
          type: "line",
          fromX: 0,
          fromY: 0,
          toX: 1,
          toY: 0,
          lineWidth: 3,
          color: "#22c55e", // blue barrel
        },
      ],
    },
  ],
  autoRifle: [
    {
      key: "autoRifle_default",
      weaponKey: "autoRifle",
      name: "Default",
      description: "Baseline auto-rifle profile.",
      price: 0,
      isDefault: true,
      bulletColor: "#111827",
      shapes: [
        {
          type: "line",
          fromX: 0,
          fromY: 0,
          toX: 1,
          toY: 0,
          lineWidth: 3,
          color: "#111827",
        },
      ],
    },
    {
      key: "autoRifle_cybernetic",
      weaponKey: "autoRifle",
      name: "Cybernetic",
      description: "Twin blue rails near the grip.",
      price: 75,
      isDefault: false,
      bulletColor: "#0ea5e9", // cyan-ish
      shapes: [
        // Core barrel
        {
          type: "line",
          fromX: 0,
          fromY: 0,
          toX: 1,
          toY: 0,
          lineWidth: 3,
          color: "#111827",
        },
        // Upper rail
        {
          type: "rect",
          cx: 0.22,
          cy: -0.18,
          width: 0.32,
          height: 0.11,
          color: "#38bdf8",
        },
        // Lower rail
        {
          type: "rect",
          cx: 0.22,
          cy: 0.18,
          width: 0.32,
          height: 0.11,
          color: "#38bdf8",
        },
      ],
    },
    {
      key: "autoRifle_christmas",
      weaponKey: "autoRifle",
      name: "Christmas",
      description: "Holidays are coming.",
      price: 150,
      isDefault: false,
      bulletColor: "#a60808", // red
      shapes: [
        // Core barrel
        {
          type: "line",
          fromX: 0,
          fromY: 0,
          toX: 1,
          toY: 0,
          lineWidth: 8,
          color: "#96150c",
        },
        // Upper rail
        {
          type: "line",
          fromX: 0.25,
          fromY: 0.05,
          toX: 0.75,
          toY: 0.05,
          lineWidth: 2.5,
          color: "#27c225",
        },
        // Upper rail
        {
          type: "line",
          fromX: 0.25,
          fromY: -0.05,
          toX: 0.75,
          toY: -0.05,
          lineWidth: 2.5,
          color: "#27c225",
        },
      ],
    },
  ],
  miniGun: [
    {
      key: "miniGun_default",
      weaponKey: "miniGun",
      name: "Default",
      description: "Simple multi-barrel silhouette.",
      price: 0,
      isDefault: true,
      bulletColor: "#111827",
      shapes: [
        {
          type: "line",
          fromX: 0,
          fromY: 0,
          toX: 1,
          toY: 0,
          lineWidth: 3,
          color: "#111827",
        },
      ],
    },
  ],
  sniper: [
    {
      key: "sniper_default",
      weaponKey: "sniper",
      name: "Default",
      description: "Long, clean barrel for precision shots.",
      price: 0,
      isDefault: true,
      bulletColor: "#111827",
      shapes: [
        {
          type: "line",
          fromX: 0,
          fromY: 0,
          toX: 1,
          toY: 0,
          lineWidth: 3,
          color: "#111827",
        },
        // Lower rail
        {
          type: "rect",
          cx: 0.22,
          cy: 0.18,
          width: 0.32,
          height: 0.11,
          color: "#38bdf8",
        },
      ],
    },
  ],
};

// Node (server) export
if (typeof module !== "undefined" && module.exports) {
  module.exports = { WEAPON_SKINS };
}
