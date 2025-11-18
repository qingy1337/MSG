"""
Simple RL training script for shooter bots.

This implements a **single-agent** environment where:
  - One learning agent plays in a top‑down arena similar to your JS game.
  - Other players are simple scripted bots.
  - Walls are generated with roughly the same logic as `generateWalls()` in server.js.
  - Weapons (pistol/autoRifle/miniGun/sniper) are modeled with damage + cooldown.

The code uses:
  - gym (classic API) for the environment wrapper
  - stable-baselines3 PPO for training

You can run this on a GPU machine with:
  pip install "gym==0.26.2" "stable-baselines3>=2.0.0" torch

Then:
  python train_bots.py

This will produce a PPO policy file (bot_policy.zip).
You can later export that model to ONNX or another format for Node.js inference.
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass
from typing import List, Tuple

import numpy as np

try:
  import gym
  from gym import spaces
except ImportError as exc:  # pragma: no cover - import hint only
  raise ImportError(
    "gym is required. Try: pip install 'gym==0.26.2'"
  ) from exc

try:
  from stable_baselines3 import PPO
except ImportError as exc:  # pragma: no cover - import hint only
  raise ImportError(
    "stable-baselines3 is required. Try: pip install 'stable-baselines3[extra]'"
  ) from exc


# --- Shared game constants (mirrors server.js / public/game.js) ---

CANVAS_WIDTH = 900
CANVAS_HEIGHT = 600
PLAYER_RADIUS = 20
MAX_HEALTH = 100

# Roughly matching server.js WEAPON_DAMAGE
WEAPON_DAMAGE = {
  "pistol": 14.0,
  "autoRifle": 9.0,
  "sniper": 45.0,
  "miniGun": 2.5,
}

# Rough approximation of public/weapons.js (only fields we care about here)
WEAPONS = {
  "pistol": {
    "cooldown_ms": 90,
    "range": 900.0,
  },
  "autoRifle": {
    "cooldown_ms": 80,
    "range": 900.0,
  },
  "miniGun": {
    "cooldown_ms": 5,
    "range": 900.0,
  },
  "sniper": {
    "cooldown_ms": 800,
    "range": 900.0,
  },
}

WEAPON_KEYS: List[str] = list(WEAPONS.keys())

# Environment will step at ~20 Hz (50 ms per step)
ENV_STEP_MS = 50.0


def weapon_cooldown_steps(weapon_key: str) -> int:
  cfg = WEAPONS[weapon_key]
  ms = cfg["cooldown_ms"]
  steps = max(1, int(round(ms / ENV_STEP_MS)))
  return steps


def weapon_damage(weapon_key: str) -> float:
  return float(WEAPON_DAMAGE.get(weapon_key, 10.0)) * 2 # Account for double-shot registering.


def wrap_angle(angle: float) -> float:
  """Wrap angle to [-pi, pi]."""
  return (angle + math.pi) % (2 * math.pi) - math.pi


def smallest_angle_diff(target: float, source: float) -> float:
  return wrap_angle(target - source)


@dataclass
class PlayerState:
  x: float
  y: float
  angle: float
  health: float
  weapon_key: str
  alive: bool = True
  cooldown_steps: int = 0  # steps until next allowed shot


@dataclass
class Wall:
  x: float
  y: float
  width: float
  height: float


# --- Geometry helpers (port of server.js utilities) ---

def is_point_inside_wall(px: float, py: float, wall: Wall) -> bool:
  return (
      wall.x <= px <= wall.x + wall.width and
      wall.y <= py <= wall.y + wall.height
  )


def is_point_inside_any_wall(px: float, py: float, walls: List[Wall]) -> bool:
  for w in walls:
    if is_point_inside_wall(px, py, w):
      return True
  return False


def segments_intersect(x1: float, y1: float, x2: float, y2: float,
                       x3: float, y3: float, x4: float, y4: float) -> bool:
  den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
  if den == 0:
    return False
  t = ((x3 - x1) * (y3 - y4) - (y3 - y1) * (x3 - x4)) / den
  u = ((x3 - x1) * (y1 - y2) - (y3 - y1) * (x1 - x2)) / den
  return 0.0 <= t <= 1.0 and 0.0 <= u <= 1.0


def line_intersects_rect(x0: float, y0: float, x1: float, y1: float,
                         rect: Wall) -> bool:
  # Quick accept if endpoints are inside.
  if is_point_inside_wall(x0, y0, rect) or is_point_inside_wall(x1, y1, rect):
    return True
  r = rect
  edges = [
    (r.x, r.y, r.x + r.width, r.y),
    (r.x + r.width, r.y, r.x + r.width, r.y + r.height),
    (r.x + r.width, r.y + r.height, r.x, r.y + r.height),
    (r.x, r.y + r.height, r.x, r.y),
  ]
  for ex0, ey0, ex1, ey1 in edges:
    if segments_intersect(x0, y0, x1, y1, ex0, ey0, ex1, ey1):
      return True
  return False


def line_intersects_any_wall(x0: float, y0: float, x1: float, y1: float,
                             walls: List[Wall]) -> bool:
  for w in walls:
    if line_intersects_rect(x0, y0, x1, y1, w):
      return True
  return False


def circle_collides_walls(px: float, py: float, radius: float,
                          walls: List[Wall]) -> bool:
  """Circle-rectangle overlap, similar to client checkWallCollision."""
  for wall in walls:
    closest_x = max(wall.x, min(px, wall.x + wall.width))
    closest_y = max(wall.y, min(py, wall.y + wall.height))
    dx = px - closest_x
    dy = py - closest_y
    if math.hypot(dx, dy) < radius:
      return True
  return False


def generate_walls() -> List[Wall]:
  """
  Rough port of server.js generateWalls logic.
  Produces 4–6 non-overlapping axis-aligned rectangles.
  """
  MIN_WALL_LENGTH = 50
  MAX_WALL_LENGTH = 250
  MIN_WALL_THICKNESS = 15
  MAX_WALL_THICKNESS = 30
  NUM_WALLS = random.randint(4, 6)

  walls: List[Wall] = []

  GRID_SIZE = 30
  grid_cols = math.ceil(CANVAS_WIDTH / GRID_SIZE)
  grid_rows = math.ceil(CANVAS_HEIGHT / GRID_SIZE)
  occupied = set()

  def mark_occupied(x: float, y: float, w: float, h: float) -> None:
    start_col = int(x // GRID_SIZE)
    start_row = int(y // GRID_SIZE)
    end_col = int(math.ceil((x + w) / GRID_SIZE))
    end_row = int(math.ceil((y + h) / GRID_SIZE))
    for row in range(start_row, end_row):
      for col in range(start_col, end_col):
        if 0 <= row < grid_rows and 0 <= col < grid_cols:
          occupied.add((row, col))

  def check_overlap(x: float, y: float, w: float, h: float) -> bool:
    start_col = int(x // GRID_SIZE)
    start_row = int(y // GRID_SIZE)
    end_col = int(math.ceil((x + w) / GRID_SIZE))
    end_row = int(math.ceil((y + h) / GRID_SIZE))

    # Add one-cell padding to keep walls from being too close.
    padded_start_col = max(0, start_col - 1)
    padded_start_row = max(0, start_row - 1)
    padded_end_col = min(grid_cols, end_col + 1)
    padded_end_row = min(grid_rows, end_row + 1)

    for row in range(padded_start_row, padded_end_row):
      for col in range(padded_start_col, padded_end_col):
        if (row, col) in occupied:
          return True
    return False

  for _ in range(NUM_WALLS):
    attempts = 0
    while attempts < 50:
      attempts += 1
      is_horizontal = random.random() > 0.5
      if is_horizontal:
        w = random.randint(MIN_WALL_LENGTH, MAX_WALL_LENGTH)
        h = random.randint(MIN_WALL_THICKNESS, MAX_WALL_THICKNESS)
      else:
        w = random.randint(MIN_WALL_THICKNESS, MAX_WALL_THICKNESS)
        h = random.randint(MIN_WALL_LENGTH, MAX_WALL_LENGTH)
      x = random.randint(0, CANVAS_WIDTH - w)
      y = random.randint(0, CANVAS_HEIGHT - h)
      if not check_overlap(x, y, w, h):
        walls.append(Wall(x=x, y=y, width=w, height=h))
        mark_occupied(x, y, w, h)
        break

  return walls


def sample_spawn_position(
    walls: List[Wall], existing: List[PlayerState], min_spawn_dist: float = 150.0
) -> Tuple[float, float]:
  """
  Simple spawn sampler:
    - Not overlapping walls
    - At least min_spawn_dist from existing players
  """
  for _ in range(1000):
    x = random.uniform(PLAYER_RADIUS, CANVAS_WIDTH - PLAYER_RADIUS)
    y = random.uniform(PLAYER_RADIUS, CANVAS_HEIGHT - PLAYER_RADIUS)
    if circle_collides_walls(x, y, PLAYER_RADIUS, walls):
      continue
    ok = True
    for p in existing:
      if not p.alive:
        continue
      if math.hypot(x - p.x, y - p.y) < min_spawn_dist:
        ok = False
        break
    if ok:
      return x, y
  # Fallback: center
  return CANVAS_WIDTH / 2.0, CANVAS_HEIGHT / 2.0


def raycast_distance(
    x0: float, y0: float, angle: float, walls: List[Wall], max_dist: float
) -> float:
  """
  Approximate raycast to the nearest wall or arena boundary.
  Steps along the ray in small increments.
  Returns the traveled distance (<= max_dist).
  """
  step = 10.0
  dist = 0.0
  while dist < max_dist:
    px = x0 + math.cos(angle) * dist
    py = y0 + math.sin(angle) * dist
    # Outside arena
    if not (0.0 <= px <= CANVAS_WIDTH and 0.0 <= py <= CANVAS_HEIGHT):
      break
    if is_point_inside_any_wall(px, py, walls):
      break
    dist += step
  return min(dist, max_dist)


# --- Gym environment definition ---


class ShootingBotEnv(gym.Env):
  """
  Single-agent environment:
    - Agent 0 is controlled by the RL policy.
    - Other agents are simple scripted opponents.

  Observation:
    - 2: self position (x,y) normalized to [-1,1]
    - 2: cos(angle), sin(angle)
    - 1: self health (0..1 mapped to [-1,1])
    - 4: one-hot weapon type (pistol, autoRifle, miniGun, sniper)
    - 8: wall raycasts around the agent (forward-relative directions)
    - 4 * 7: for up to 4 other players:
        [alive_flag, rel_x, rel_y, distance, cos(rel_angle), sin(rel_angle), health]
  Total: 2 + 2 + 1 + 4 + 8 + 28 = 45

  Action (Discrete, 54 values):
    Encodes (move, strafe, turn, shoot) where each is:
      move   in {0: none, 1: forward, 2: backward}
      strafe in {0: none, 1: left,  2: right}
      turn   in {0: none, 1: left,  2: right}
      shoot  in {0: no,   1: yes}
    Combined as index in range(3 * 3 * 3 * 2).
  """

  metadata = {"render.modes": []}

  def __init__(
      self,
      num_opponents: int = 3,
      max_steps: int = 400,
      randomize_weapon: bool = True,
  ) -> None:
    super().__init__()
    assert 1 <= num_opponents <= 4, "Supported opponents: 1–4"
    self.num_opponents = num_opponents
    self.max_steps = max_steps
    self.randomize_weapon = randomize_weapon

    self.players: List[PlayerState] = []
    self.walls: List[Wall] = []
    self.step_count = 0

    # Observation / action spaces
    obs_dim = 45
    self.observation_space = spaces.Box(
      low=-1.0, high=1.0, shape=(obs_dim,), dtype=np.float32
    )

    self.n_move = 3
    self.n_strafe = 3
    self.n_turn = 3
    self.n_shoot = 2
    self.n_actions = self.n_move * self.n_strafe * self.n_turn * self.n_shoot
    self.action_space = spaces.Discrete(self.n_actions)

    # Movement tuning
    self.move_speed = 5.0  # roughly matches client
    self.turn_speed = 0.2  # radians per step

    # Shooting
    self.aim_cone_rad = 0.3  # target must be within +/-17 degrees

  # --- Gym API ---

  def reset(self, *, seed: int | None = None, options=None):
    if seed is not None:
      super().reset(seed=seed)
      random.seed(seed)
      np.random.seed(seed)

    self.step_count = 0
    self.walls = generate_walls()
    self.players = []

    # Create RL agent (index 0)
    if self.randomize_weapon:
      weapon_key = random.choice(WEAPON_KEYS)
    else:
      weapon_key = "pistol"

    x0, y0 = sample_spawn_position(self.walls, self.players)
    self.players.append(
      PlayerState(
        x=x0,
        y=y0,
        angle=random.uniform(-math.pi, math.pi),
        health=MAX_HEALTH,
        weapon_key=weapon_key,
        alive=True,
        cooldown_steps=0,
      )
    )

    # Create opponents
    for _ in range(self.num_opponents):
      wx = random.choice(WEAPON_KEYS)
      x, y = sample_spawn_position(self.walls, self.players)
      self.players.append(
        PlayerState(
          x=x,
          y=y,
          angle=random.uniform(-math.pi, math.pi),
          health=MAX_HEALTH,
          weapon_key=wx,
          alive=True,
          cooldown_steps=0,
        )
      )

    obs = self._get_obs()
    info = {}
    return obs, info

  def step(self, action: int):
    self.step_count += 1

    # Decode agent 0's action
    move_idx, strafe_idx, turn_idx, shoot_flag = self._decode_action(action)

    # Update all players' cooldown counters
    for p in self.players:
      if p.cooldown_steps > 0:
        p.cooldown_steps -= 1

    # Apply movement + turning for agent 0
    self._apply_movement(0, move_idx, strafe_idx, turn_idx)

    # Scripted opponents
    for idx in range(1, len(self.players)):
      self._step_opponent(idx)

    # Handle shooting
    reward = 0.0
    terminated = False
    truncated = False

    # Agent 0 shooting
    if shoot_flag == 1:
      reward += self._fire_weapon(shooter_idx=0)

    # Opponents shooting
    for idx in range(1, len(self.players)):
      reward += self._fire_weapon(shooter_idx=idx, credit_to_agent=False)

    # Step penalty to encourage faster wins / avoid stalling
    reward -= 0.001

    agent = self.players[0]
    # Episode termination conditions
    if not agent.alive:
      reward -= 1.0  # dying is bad
      terminated = True

    opponents_alive = any(p.alive for p in self.players[1:])
    if not opponents_alive:
      reward += 1.0  # win bonus
      terminated = True

    if self.step_count >= self.max_steps:
      truncated = True

    obs = self._get_obs()
    info = {}
    return obs, reward, terminated, truncated, info

  # --- Internal helpers ---

  def _decode_action(self, action: int) -> Tuple[int, int, int, int]:
    """Map discrete action -> (move, strafe, turn, shoot)."""
    a = int(action)
    shoot = a % self.n_shoot
    a //= self.n_shoot
    turn = a % self.n_turn
    a //= self.n_turn
    strafe = a % self.n_strafe
    a //= self.n_strafe
    move = a % self.n_move
    return move, strafe, turn, shoot

  def _apply_movement(
      self, idx: int, move_idx: int, strafe_idx: int, turn_idx: int
  ) -> None:
    p = self.players[idx]
    if not p.alive:
      return

    angle = p.angle

    # Turning
    if turn_idx == 1:
      angle += self.turn_speed
    elif turn_idx == 2:
      angle -= self.turn_speed
    angle = wrap_angle(angle)

    # Movement
    dx = 0.0
    dy = 0.0
    if move_idx == 1:  # forward
      dx += math.cos(angle) * self.move_speed
      dy += math.sin(angle) * self.move_speed
    elif move_idx == 2:  # backward
      dx -= math.cos(angle) * self.move_speed
      dy -= math.sin(angle) * self.move_speed

    if strafe_idx == 1:  # left
      dx += math.cos(angle + math.pi / 2.0) * self.move_speed
      dy += math.sin(angle + math.pi / 2.0) * self.move_speed
    elif strafe_idx == 2:  # right
      dx += math.cos(angle - math.pi / 2.0) * self.move_speed
      dy += math.sin(angle - math.pi / 2.0) * self.move_speed

    new_x = p.x + dx
    new_y = p.y + dy

    # Bounds clamp
    new_x = max(PLAYER_RADIUS, min(new_x, CANVAS_WIDTH - PLAYER_RADIUS))
    new_y = max(PLAYER_RADIUS, min(new_y, CANVAS_HEIGHT - PLAYER_RADIUS))

    # Wall collision: simple "try move, revert if collides"
    if not circle_collides_walls(new_x, new_y, PLAYER_RADIUS, self.walls):
      p.x = new_x
      p.y = new_y

    p.angle = angle

  def _step_opponent(self, idx: int) -> None:
    """Very simple scripted bot behavior."""
    p = self.players[idx]
    if not p.alive:
      return
    agent = self.players[0]
    if not agent.alive:
      return

    dx = agent.x - p.x
    dy = agent.y - p.y
    dist = math.hypot(dx, dy)
    desired_angle = math.atan2(dy, dx)
    diff = smallest_angle_diff(desired_angle, p.angle)

    # Turn towards the agent
    if diff > 0.05:
      turn_idx = 1  # left
    elif diff < -0.05:
      turn_idx = 2  # right
    else:
      turn_idx = 0

    # Simple distance-based movement
    if dist > 250:
      move_idx = 1  # forward
    elif dist < 150:
      move_idx = 2  # backward
    else:
      move_idx = 0

    # Occasional strafing
    if random.random() < 0.3:
      strafe_idx = random.choice([1, 2])
    else:
      strafe_idx = 0

    self._apply_movement(idx, move_idx, strafe_idx, turn_idx)

  def _fire_weapon(self, shooter_idx: int, credit_to_agent: bool = True) -> float:
    """
    Perform a hitscan shot from shooter.
    Returns reward contribution for the RL agent.
    """
    shooter = self.players[shooter_idx]
    if not shooter.alive:
      return 0.0
    if shooter.cooldown_steps > 0:
      return 0.0

    weapon_key = shooter.weapon_key
    dmg = weapon_damage(weapon_key)
    max_range = WEAPONS[weapon_key]["range"]

    # Start from player center (good enough for training)
    x0, y0 = shooter.x, shooter.y
    x1 = x0 + math.cos(shooter.angle) * max_range
    y1 = y0 + math.sin(shooter.angle) * max_range

    # Check line-of-sight to targets within an aim cone
    hit_any = False
    reward = 0.0

    for t_idx, target in enumerate(self.players):
      if t_idx == shooter_idx or not target.alive:
        continue

      dx = target.x - x0
      dy = target.y - y0
      dist = math.hypot(dx, dy)
      if dist <= 1e-6 or dist > max_range:
        continue

      angle_to_target = math.atan2(dy, dx)
      diff = abs(smallest_angle_diff(angle_to_target, shooter.angle))
      if diff > self.aim_cone_rad:
        continue

      # Check that the line does not cross walls
      if line_intersects_any_wall(x0, y0, target.x, target.y, self.walls):
        continue

      # Target is considered hit
      target.health -= dmg
      hit_any = True

      # Reward shaping for agent's hits
      if shooter_idx == 0 and credit_to_agent:
        # small reward for damage
        reward += 0.01 * (dmg / MAX_HEALTH)

      if target.health <= 0 and target.alive:
        target.alive = False
        if shooter_idx == 0 and credit_to_agent:
          reward += 0.2  # kill bonus

    if hit_any:
      shooter.cooldown_steps = weapon_cooldown_steps(weapon_key)

    return reward

  def _get_obs(self) -> np.ndarray:
    """
    Build observation for agent 0.
    See class docstring for layout.
    """
    agent = self.players[0]

    # Self features
    x_norm = (agent.x / CANVAS_WIDTH) * 2.0 - 1.0
    y_norm = (agent.y / CANVAS_HEIGHT) * 2.0 - 1.0
    health_norm = (agent.health / MAX_HEALTH) * 2.0 - 1.0
    cos_a = math.cos(agent.angle)
    sin_a = math.sin(agent.angle)

    # Weapon one-hot
    w_one_hot = [0.0, 0.0, 0.0, 0.0]
    if agent.weapon_key in WEAPON_KEYS:
      w_idx = WEAPON_KEYS.index(agent.weapon_key)
      w_one_hot[w_idx] = 1.0

    # Wall raycasts (8 directions around the agent)
    num_rays = 8
    max_dist = math.hypot(CANVAS_WIDTH, CANVAS_HEIGHT)
    ray_feats: List[float] = []
    for i in range(num_rays):
      rel_angle = (2.0 * math.pi * i) / num_rays
      theta = agent.angle + rel_angle
      d = raycast_distance(agent.x, agent.y, theta, self.walls, max_dist)
      d_norm = (d / max_dist) * 2.0 - 1.0
      ray_feats.append(d_norm)

    # Other players (up to 4)
    other_feats: List[float] = []
    max_others = 4
    others = self.players[1:1 + max_others]
    for other in others:
      alive_flag = 1.0 if other.alive else 0.0
      dx = other.x - agent.x
      dy = other.y - agent.y
      dist = math.hypot(dx, dy)
      rel_x = (dx / CANVAS_WIDTH) * 2.0  # can exceed [-1,1] slightly but usually in range
      rel_y = (dy / CANVAS_HEIGHT) * 2.0
      dist_norm = (dist / max_dist) * 2.0 - 1.0
      rel_angle = smallest_angle_diff(math.atan2(dy, dx), agent.angle)
      cos_rel = math.cos(rel_angle)
      sin_rel = math.sin(rel_angle)
      health_norm_other = (other.health / MAX_HEALTH) * 2.0 - 1.0
      other_feats.extend(
        [
          alive_flag,
          rel_x,
          rel_y,
          dist_norm,
          cos_rel,
          sin_rel,
          health_norm_other,
        ]
      )

    # Pad if fewer than max_others
    while len(other_feats) < max_others * 7:
      other_feats.extend([0.0] * 7)

    features = [
      x_norm,
      y_norm,
      cos_a,
      sin_a,
      health_norm,
      *w_one_hot,
      *ray_feats,
      *other_feats,
    ]

    assert len(features) == 45, f"Expected 45-dim obs, got {len(features)}"
    return np.array(features, dtype=np.float32)


# --- Training entry point ---


def main():
  """
  Train a PPO policy for the ShootingBotEnv.

  You can tweak num_timesteps / hyperparams as needed.
  To use GPU on your training machine, pass device=\"cuda\" to PPO.
  """
  env = ShootingBotEnv(num_opponents=3, max_steps=400, randomize_weapon=True)

  # You can adjust policy_kwargs or PPO hyperparameters as you refine the setup.
  model = PPO(
    "MlpPolicy",
    env,
    verbose=1,
    batch_size=2048,
    n_steps=4096,
    learning_rate=3e-4,
    gamma=0.99,
    gae_lambda=0.95,
    clip_range=0.2,
    ent_coef=0.01,
    n_epochs=10,
    device="auto",  # will use GPU if available
  )

  total_timesteps = 5_000_000
  model.learn(total_timesteps=total_timesteps)
  model.save("bot_policy")
  print("Training finished. Saved policy to bot_policy.zip")


if __name__ == "__main__":
  main()

