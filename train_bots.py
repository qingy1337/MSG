"""
Improved RL training script for shooter bots with Curriculum Learning.
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass
from typing import List, Tuple, Optional

import numpy as np

try:
    import gym
    from gym import spaces
except ImportError as exc:
    raise ImportError("gym==0.26.2 is required.") from exc

try:
    from stable_baselines3 import PPO
except ImportError as exc:
    raise ImportError("stable-baselines3 is required.") from exc


# --- Shared game constants ---

CANVAS_WIDTH = 900
CANVAS_HEIGHT = 600
PLAYER_RADIUS = 20
MAX_HEALTH = 100

WEAPON_DAMAGE = {
    "pistol": 15.0,      # Buffed slightly for training signal
    "autoRifle": 10.0,
    "sniper": 50.0,
    "miniGun": 3.0,
}

WEAPONS = {
    "pistol": {"cooldown_ms": 90, "range": 600.0},   # Reduced range to encourage engagement
    "autoRifle": {"cooldown_ms": 80, "range": 600.0},
    "miniGun": {"cooldown_ms": 5, "range": 550.0},
    "sniper": {"cooldown_ms": 800, "range": 1000.0},
}

WEAPON_KEYS: List[str] = list(WEAPONS.keys())
ENV_STEP_MS = 50.0

def weapon_cooldown_steps(weapon_key: str) -> int:
    cfg = WEAPONS[weapon_key]
    return max(1, int(round(cfg["cooldown_ms"] / ENV_STEP_MS)))

def weapon_damage(weapon_key: str) -> float:
    return float(WEAPON_DAMAGE.get(weapon_key, 10.0))

def wrap_angle(angle: float) -> float:
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
    cooldown_steps: int = 0

@dataclass
class Wall:
    x: float
    y: float
    width: float
    height: float

# --- Robust Geometry ---

def is_point_inside_wall(px: float, py: float, wall: Wall) -> bool:
    # Use a small epsilon to treat "on the edge" as inside to prevent skimming
    margin = 1.0
    return (wall.x - margin <= px <= wall.x + wall.width + margin and
            wall.y - margin <= py <= wall.y + wall.height + margin)

def is_point_inside_any_wall(px: float, py: float, walls: List[Wall]) -> bool:
    for w in walls:
        if is_point_inside_wall(px, py, w):
            return True
    return False

def segments_intersect(x1, y1, x2, y2, x3, y3, x4, y4) -> bool:
    """
    Robust line segment intersection. Returns True if segments overlap.
    """
    # 1. Quick AABB rejection
    if (max(x1, x2) < min(x3, x4) or min(x1, x2) > max(x3, x4) or
        max(y1, y2) < min(y3, y4) or min(y1, y2) > max(y3, y4)):
        return False

    denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1)
    if abs(denom) < 1e-9:
        # Parallel lines - we treat them as non-intersecting for raycasting
        # unless they are collinear, but for this game, ignoring parallel overlap is fine
        return False

    ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom
    ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom

    # Check if intersection is within segment bounds (with epsilon)
    epsilon = 1e-5
    return (-epsilon <= ua <= 1.0 + epsilon) and (-epsilon <= ub <= 1.0 + epsilon)

def line_intersects_rect(x0: float, y0: float, x1: float, y1: float, rect: Wall) -> bool:
    # If endpoints are inside, it intersects
    if is_point_inside_wall(x0, y0, rect) or is_point_inside_wall(x1, y1, rect):
        return True

    # Check intersection with the 4 edges
    edges = [
        (rect.x, rect.y, rect.x + rect.width, rect.y), # Top
        (rect.x + rect.width, rect.y, rect.x + rect.width, rect.y + rect.height), # Right
        (rect.x + rect.width, rect.y + rect.height, rect.x, rect.y + rect.height), # Bottom
        (rect.x, rect.y + rect.height, rect.x, rect.y), # Left
    ]
    for ex0, ey0, ex1, ey1 in edges:
        if segments_intersect(x0, y0, x1, y1, ex0, ey0, ex1, ey1):
            return True
    return False

def line_intersects_any_wall(x0: float, y0: float, x1: float, y1: float, walls: List[Wall]) -> bool:
    for w in walls:
        if line_intersects_rect(x0, y0, x1, y1, w):
            return True
    return False

def circle_collides_walls(px: float, py: float, radius: float, walls: List[Wall]) -> bool:
    for wall in walls:
        closest_x = max(wall.x, min(px, wall.x + wall.width))
        closest_y = max(wall.y, min(py, wall.y + wall.height))
        dx = px - closest_x
        dy = py - closest_y
        if math.hypot(dx, dy) < radius:
            return True
    return False

def generate_walls() -> List[Wall]:
    # (Same generation logic as before, omitted for brevity but included in execution)
    walls: List[Wall] = []
    for _ in range(random.randint(4, 6)):
        # Simple randomized walls that don't overlap spawn logic handled later
        w = random.randint(50, 250)
        h = random.randint(20, 40)
        if random.random() > 0.5: w, h = h, w
        x = random.randint(50, CANVAS_WIDTH - 50 - int(w))
        y = random.randint(50, CANVAS_HEIGHT - 50 - int(h))
        walls.append(Wall(x, y, w, h))
    return walls

def sample_spawn_position(walls: List[Wall], existing: List[PlayerState]) -> Tuple[float, float]:
    for _ in range(100):
        x = random.uniform(40, CANVAS_WIDTH - 40)
        y = random.uniform(40, CANVAS_HEIGHT - 40)
        if circle_collides_walls(x, y, PLAYER_RADIUS + 5, walls): continue

        valid = True
        for p in existing:
            if math.hypot(x - p.x, y - p.y) < 100: valid = False; break
        if valid: return x, y
    return 100.0, 100.0

def raycast_distance(x0, y0, angle, walls, max_dist):
    # Optimized raycast
    step = 20.0
    d = 0.0
    vx = math.cos(angle)
    vy = math.sin(angle)
    while d < max_dist:
        px = x0 + vx * d
        py = y0 + vy * d
        if not (0 <= px <= CANVAS_WIDTH and 0 <= py <= CANVAS_HEIGHT): return d
        if is_point_inside_any_wall(px, py, walls): return d
        d += step
    return max_dist


# --- Gym Environment ---

class ShootingBotEnv(gym.Env):
    def __init__(self,
                 num_opponents: int = 1,
                 max_steps: int = 600,
                 difficulty: str = "easy"):
        super().__init__()
        self.num_opponents = num_opponents
        self.max_steps = max_steps

        # Difficulty: "static", "easy", "hard"
        self.difficulty = difficulty

        self.observation_space = spaces.Box(low=-1.0, high=1.0, shape=(45,), dtype=np.float32)
        # Action: Move(3) * Strafe(3) * Turn(3) * Shoot(2) = 54
        self.action_space = spaces.Discrete(54)

        self.players = []
        self.walls = []
        self.step_count = 0

        # Physics
        self.move_speed = 5.0
        self.turn_speed = 0.15 # Slightly slower turning for stability
        self.aim_cone = 0.3

    def reset(self, *, seed=None, options=None):
        if seed is not None:
            random.seed(seed)
            np.random.seed(seed)

        self.step_count = 0
        self.walls = generate_walls()
        self.players = []

        # 1. Add Agent
        ax, ay = sample_spawn_position(self.walls, [])
        self.players.append(PlayerState(ax, ay, 0, MAX_HEALTH, "autoRifle"))

        # 2. Add Opponents
        for _ in range(self.num_opponents):
            ox, oy = sample_spawn_position(self.walls, self.players)
            # Opponents get random weapons
            w = random.choice(WEAPON_KEYS)
            self.players.append(PlayerState(ox, oy, random.uniform(-3,3), MAX_HEALTH, w))

        return self._get_obs(), {}

    def step(self, action):
        self.step_count += 1

        # 1. Decode & Apply Agent Action
        move, strafe, turn, shoot = self._decode_action(action)

        # Update cooldowns
        for p in self.players:
            if p.cooldown_steps > 0: p.cooldown_steps -= 1

        self._apply_movement(0, move, strafe, turn)

        # 2. Opponent Logic (Based on difficulty)
        for i in range(1, len(self.players)):
            self._step_opponent(i)

        # 3. Shooting & Rewards
        reward = 0.0

        # Small reward for facing an opponent (Shaping)
        reward += self._orientation_reward() * 0.05

        # Agent shoots
        if shoot == 1:
            dmg_dealt = self._fire_weapon(0, is_agent=True)
            if dmg_dealt > 0:
                # Big reward for hitting!
                reward += (dmg_dealt / 10.0)
            else:
                # Tiny penalty for wasting ammo? (Optional, helps prevent spamming)
                pass

        # Opponents shoot
        for i in range(1, len(self.players)):
            if self.players[i].alive:
                # Fire logic is handled inside _step_opponent usually,
                # but here we do it explicitly if they decided to shoot.
                # For simplicity, let's say they try to shoot if they have LOS.
                pass # Handled in _step_opponent via direct call or flag

        # Step penalty (time pressure)
        reward -= 0.001

        # Termination
        agent = self.players[0]
        terminated = False

        if not agent.alive:
            reward -= 1.0
            terminated = True

        opponents_alive = sum(1 for p in self.players[1:] if p.alive)
        if opponents_alive == 0:
            reward += 2.0 # Big win bonus
            terminated = True

        truncated = (self.step_count >= self.max_steps)

        return self._get_obs(), reward, terminated, truncated, {}

    def _orientation_reward(self) -> float:
        """Return 1.0 if aiming perfectly at nearest enemy, else less."""
        agent = self.players[0]
        if not agent.alive: return 0.0

        best_align = -1.0
        for p in self.players[1:]:
            if not p.alive: continue
            dx = p.x - agent.x
            dy = p.y - agent.y
            target_ang = math.atan2(dy, dx)
            diff = abs(smallest_angle_diff(target_ang, agent.angle))
            # diff is 0..pi. Normalize to 1..-1
            align = (math.pi - diff) / math.pi
            if align > best_align: best_align = align

        return max(0.0, best_align)

    def _step_opponent(self, idx):
        """Heuristic bot logic based on difficulty."""
        bot = self.players[idx]
        target = self.players[0]
        if not bot.alive or not target.alive: return

        # Distance/Angle to player
        dx = target.x - bot.x
        dy = target.y - bot.y
        dist = math.hypot(dx, dy)
        desired_angle = math.atan2(dy, dx)

        # --- Difficulty Logic ---

        if self.difficulty == "static":
            # Just stand there (Target Practice)
            return

        elif self.difficulty == "easy":
            # Sloppy Aim
            aim_error = random.uniform(-0.5, 0.5)
            diff = smallest_angle_diff(desired_angle + aim_error, bot.angle)

            # Move slowly / randomly
            if dist > 300: move = 1 # Forward
            elif dist < 100: move = 2 # Back
            else: move = 0

            strafe = 0
            if random.random() < 0.1: strafe = random.choice([1,2])

            # Shoot infrequently
            should_shoot = (abs(diff) < 0.5 and dist < 500 and random.random() < 0.05)

        else: # "hard"
            # Good Aim
            aim_error = random.uniform(-0.1, 0.1)
            diff = smallest_angle_diff(desired_angle + aim_error, bot.angle)

            # Aggressive movement
            if dist > 250: move = 1
            elif dist < 150: move = 2
            else: move = 0

            strafe = 0
            if random.random() < 0.2: strafe = random.choice([1,2])

            # Shoot as soon as aimed
            should_shoot = (abs(diff) < 0.3 and dist < 600)

        # Apply Turn
        turn = 0
        if diff > 0.1: turn = 1 # Left
        elif diff < -0.1: turn = 2 # Right

        self._apply_movement(idx, move, strafe, turn)

        if should_shoot:
            self._fire_weapon(idx, is_agent=False)

    def _fire_weapon(self, shooter_idx, is_agent=False) -> float:
        shooter = self.players[shooter_idx]
        if shooter.cooldown_steps > 0: return 0.0

        weapon = WEAPONS[shooter.weapon_key]
        dmg = weapon_damage(shooter.weapon_key)

        # Raycast
        x0, y0 = shooter.x, shooter.y
        angle = shooter.angle

        hit_dmg = 0.0

        # Sort targets by distance so we hit the closest one first
        potential_targets = []
        for i, p in enumerate(self.players):
            if i == shooter_idx or not p.alive: continue
            dist = math.hypot(p.x - x0, p.y - y0)
            potential_targets.append((dist, p, i))

        potential_targets.sort(key=lambda x: x[0])

        shot_fired = False

        for dist, target, t_idx in potential_targets:
            if dist > weapon["range"]: continue

            # Angle Check
            angle_to = math.atan2(target.y - y0, target.x - x0)
            if abs(smallest_angle_diff(angle_to, angle)) > self.aim_cone:
                continue

            # Wall Check
            if line_intersects_any_wall(x0, y0, target.x, target.y, self.walls):
                continue

            # Hit!
            target.health -= dmg
            hit_dmg = dmg
            shot_fired = True

            if target.health <= 0:
                target.alive = False

            # Only hit the first target
            break

        if shot_fired or is_agent: # Agent triggers cooldown even on miss
            shooter.cooldown_steps = weapon_cooldown_steps(shooter.weapon_key)

        return hit_dmg

    def _decode_action(self, action):
        a = int(action)
        shoot = a % 2; a //= 2
        turn = a % 3; a //= 3
        strafe = a % 3; a //= 3
        move = a % 3
        return move, strafe, turn, shoot

    def _apply_movement(self, idx, move, strafe, turn):
        p = self.players[idx]
        if not p.alive: return

        if turn == 1: p.angle = wrap_angle(p.angle + self.turn_speed)
        elif turn == 2: p.angle = wrap_angle(p.angle - self.turn_speed)

        dx, dy = 0.0, 0.0
        if move == 1:
            dx += math.cos(p.angle) * self.move_speed
            dy += math.sin(p.angle) * self.move_speed
        elif move == 2:
            dx -= math.cos(p.angle) * self.move_speed
            dy -= math.sin(p.angle) * self.move_speed

        if strafe == 1:
            dx += math.cos(p.angle + math.pi/2) * self.move_speed
            dy += math.sin(p.angle + math.pi/2) * self.move_speed
        elif strafe == 2:
            dx += math.cos(p.angle - math.pi/2) * self.move_speed
            dy += math.sin(p.angle - math.pi/2) * self.move_speed

        nx, ny = p.x + dx, p.y + dy
        nx = max(PLAYER_RADIUS, min(nx, CANVAS_WIDTH - PLAYER_RADIUS))
        ny = max(PLAYER_RADIUS, min(ny, CANVAS_HEIGHT - PLAYER_RADIUS))

        if not circle_collides_walls(nx, ny, PLAYER_RADIUS, self.walls):
            p.x, p.y = nx, ny

    def _get_obs(self):
        # (Same observation logic as your original script)
        # Just copy-paste the _get_obs method from your original code here
        # Or rely on the fact that I'm reusing the structure.
        # For brevity in this response, I am assuming you keep your _get_obs.
        # ...

        # RE-INSERT YOUR ORIGINAL _get_obs METHOD HERE

        agent = self.players[0]
        x_norm = (agent.x / CANVAS_WIDTH) * 2.0 - 1.0
        y_norm = (agent.y / CANVAS_HEIGHT) * 2.0 - 1.0
        health_norm = (agent.health / MAX_HEALTH) * 2.0 - 1.0
        cos_a = math.cos(agent.angle)
        sin_a = math.sin(agent.angle)

        w_one_hot = [0.0]*4
        if agent.weapon_key in WEAPON_KEYS:
            w_one_hot[WEAPON_KEYS.index(agent.weapon_key)] = 1.0

        # Rays
        ray_feats = []
        max_dist = math.hypot(CANVAS_WIDTH, CANVAS_HEIGHT)
        for i in range(8):
            theta = agent.angle + (2*math.pi*i)/8
            d = raycast_distance(agent.x, agent.y, theta, self.walls, max_dist)
            ray_feats.append((d/max_dist)*2.0 - 1.0)

        # Enemies
        other_feats = []
        others = self.players[1:5]
        for o in others:
            alive = 1.0 if o.alive else 0.0
            dx = o.x - agent.x
            dy = o.y - agent.y
            dist = math.hypot(dx, dy)
            rel_angle = smallest_angle_diff(math.atan2(dy, dx), agent.angle)
            other_feats.extend([
                alive,
                (dx/CANVAS_WIDTH)*2, (dy/CANVAS_HEIGHT)*2,
                (dist/max_dist)*2-1,
                math.cos(rel_angle), math.sin(rel_angle),
                (o.health/MAX_HEALTH)*2-1
            ])
        while len(other_feats) < 4*7: other_feats.extend([0.0]*7)

        return np.array([x_norm, y_norm, cos_a, sin_a, health_norm, *w_one_hot, *ray_feats, *other_feats], dtype=np.float32)

# --- Curriculum Training ---

def main():
    # STAGE 1: Train vs 1 Easy Bot (Learn to aim and shoot)
    print("--- STAGE 1: 1v1 vs Easy Bot ---")
    env_easy = ShootingBotEnv(num_opponents=1, difficulty="easy")

    model = PPO(
        "MlpPolicy",
        env_easy,
        verbose=1,
        learning_rate=3e-4,
        n_steps=2048,
        batch_size=64,
        ent_coef=0.01
    )

    # Train for 500k steps (should master aiming quickly)
    model.learn(total_timesteps=500_000)
    model.save("bot_stage1")

    # STAGE 2: Train vs 3 Hard Bots (Learn to survive/kite)
    print("--- STAGE 2: 1v3 vs Hard Bots ---")
    env_hard = ShootingBotEnv(num_opponents=3, difficulty="hard")

    # Load previous weights
    model.set_env(env_hard)

    # Train for 2M steps
    model.learn(total_timesteps=2_000_000)
    model.save("bot_final")
    print("Training Complete.")

if __name__ == "__main__":
    main()
