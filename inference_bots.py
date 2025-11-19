"""
Inference script for Shooting Bots.
Loads a trained RecurrentPPO model and generates a gameplay video using OpenCV.
"""

import argparse
import math
import random
import numpy as np
import cv2
from dataclasses import dataclass
from typing import List, Tuple

try:
    import gym
    from gym import spaces
except ImportError:
    raise ImportError("gym==0.26.2 is required.")

try:
    from sb3_contrib import RecurrentPPO
except ImportError:
    raise ImportError("sb3-contrib is required.")


# --- 1. Constants & Geometry (Copied from train_bots.py) ---

CANVAS_WIDTH = 900
CANVAS_HEIGHT = 600
PLAYER_RADIUS = 20
MAX_HEALTH = 100
BULLET_SPEED = 12.0
BULLET_RADIUS = 10.0
BULLET_LIFETIME = 50
ENV_STEP_MS = 50.0
WEAPON_DAMAGE = {"pistol": 20.0}

def weapon_cooldown_steps(weapon_key: str) -> int:
    return max(1, int(round(90 / ENV_STEP_MS)))

def wrap_angle(angle: float) -> float:
    return (angle + math.pi) % (2 * math.pi) - math.pi

def smallest_angle_diff(target: float, source: float) -> float:
    return wrap_angle(target - source)

@dataclass
class Bullet:
    x: float
    y: float
    vx: float
    vy: float
    owner_idx: int
    steps_alive: int = 0
    active: bool = True

@dataclass
class PlayerState:
    x: float
    y: float
    angle: float
    health: float
    weapon_key: str
    alive: bool = True
    cooldown_steps: int = 0
    vx: float = 0.0
    vy: float = 0.0

@dataclass
class Wall:
    x: float
    y: float
    width: float
    height: float

def is_point_inside_wall(px: float, py: float, wall: Wall) -> bool:
    return (wall.x <= px <= wall.x + wall.width and
            wall.y <= py <= wall.y + wall.height)

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
    walls: List[Wall] = []
    for _ in range(random.randint(4, 6)):
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
        if circle_collides_walls(x, y, PLAYER_RADIUS + 10, walls): continue
        valid = True
        for p in existing:
            if math.hypot(x - p.x, y - p.y) < 150: valid = False; break
        if valid: return x, y
    return 100.0, 100.0

def raycast_distance(x0, y0, angle, walls, max_dist):
    step = 25.0
    d = 0.0
    vx = math.cos(angle)
    vy = math.sin(angle)
    while d < max_dist:
        px = x0 + vx * d
        py = y0 + vy * d
        if not (0 <= px <= CANVAS_WIDTH and 0 <= py <= CANVAS_HEIGHT): return d
        for w in walls:
             if is_point_inside_wall(px, py, w): return d
        d += step
    return max_dist

# --- 2. Environment with Rendering ---

class ShootingBotEnv(gym.Env):
    def __init__(self, num_opponents: int = 1, max_steps: int = 800, difficulty: str = "easy", bullet_radius: float = 5.0):
        super().__init__()
        self.num_opponents = num_opponents
        self.max_steps = max_steps
        self.difficulty = difficulty
        self.bullet_radius = bullet_radius

        self.observation_space = spaces.Box(low=-1.0, high=1.0, shape=(64,), dtype=np.float32)
        self.action_space = spaces.Discrete(54)

        self.players: List[PlayerState] = []
        self.bullets: List[Bullet] = []
        self.walls: List[Wall] = []
        self.step_count = 0

        self.move_speed = 5.0
        self.turn_speed = 0.15

    def reset(self, *, seed=None, options=None):
        if seed is not None:
            random.seed(seed)
            np.random.seed(seed)

        self.step_count = 0
        self.walls = generate_walls()
        self.players = []
        self.bullets = []

        # Spawn Agent
        ax, ay = sample_spawn_position(self.walls, [])
        self.players.append(PlayerState(ax, ay, 0, MAX_HEALTH, "pistol"))

        # Spawn Opponents
        for _ in range(self.num_opponents):
            ox, oy = sample_spawn_position(self.walls, self.players)
            self.players.append(PlayerState(ox, oy, random.uniform(-3,3), MAX_HEALTH, "pistol"))

        return self._get_obs(), {}

    def step(self, action):
        self.step_count += 1
        agent = self.players[0]

        move, strafe, turn, shoot = self._decode_action(action)
        agent.vx, agent.vy = 0, 0
        self._apply_movement(0, move, strafe, turn)

        if shoot == 1 and agent.alive:
            self._fire_weapon(0)

        for i in range(1, len(self.players)):
            self._step_opponent(i)

        self._update_bullets()

        terminated = False
        if not agent.alive:
            terminated = True

        opponents_alive = sum(1 for p in self.players[1:] if p.alive)
        if opponents_alive == 0:
            terminated = True

        truncated = (self.step_count >= self.max_steps)

        # In inference, we don't care much about reward, just return 0
        return self._get_obs(), 0.0, terminated, truncated, {}

    # --- Render Method Added for Inference ---
    def render(self):
        """
        Renders the current state to a numpy array (H, W, 3) using OpenCV.
        """
        # Create black canvas
        canvas = np.zeros((CANVAS_HEIGHT, CANVAS_WIDTH, 3), dtype=np.uint8)

        # 1. Draw Walls (Gray)
        for w in self.walls:
            cv2.rectangle(canvas,
                          (int(w.x), int(w.y)),
                          (int(w.x + w.width), int(w.y + w.height)),
                          (100, 100, 100), -1)

        # 2. Draw Bullets (Yellow)
        for b in self.bullets:
            if not b.active: continue
            cv2.circle(canvas, (int(b.x), int(b.y)), int(self.bullet_radius), (0, 255, 255), -1)

        # 3. Draw Players
        for i, p in enumerate(self.players):
            if not p.alive: continue

            # Color: Green for Agent (0), Red for Enemy (>0)
            color = (0, 255, 0) if i == 0 else (0, 0, 255)

            # Draw Body
            cv2.circle(canvas, (int(p.x), int(p.y)), PLAYER_RADIUS, color, -1)

            # Draw Direction Line (White)
            end_x = int(p.x + math.cos(p.angle) * (PLAYER_RADIUS + 10))
            end_y = int(p.y + math.sin(p.angle) * (PLAYER_RADIUS + 10))
            cv2.line(canvas, (int(p.x), int(p.y)), (end_x, end_y), (255, 255, 255), 2)

            # Draw Health Bar above player
            bar_len = 30
            hp_pct = max(0, p.health / MAX_HEALTH)
            # Background bar (red)
            cv2.rectangle(canvas, (int(p.x - 15), int(p.y - 30)), (int(p.x + 15), int(p.y - 25)), (0, 0, 100), -1)
            # Health (green)
            cv2.rectangle(canvas, (int(p.x - 15), int(p.y - 30)), (int(p.x - 15 + bar_len*hp_pct), int(p.y - 25)), (0, 255, 0), -1)

        return canvas

    # --- Internal Physics Logic (Same as training) ---
    def _update_bullets(self):
        for b in self.bullets:
            if not b.active: continue
            b.x += b.vx; b.y += b.vy; b.steps_alive += 1
            if b.steps_alive > BULLET_LIFETIME: b.active = False; continue
            if not (0 <= b.x <= CANVAS_WIDTH and 0 <= b.y <= CANVAS_HEIGHT): b.active = False; continue

            for w in self.walls:
                if is_point_inside_wall(b.x, b.y, w): b.active = False; break
            if not b.active: continue

            for idx, p in enumerate(self.players):
                if not p.alive: continue
                if idx == b.owner_idx: continue
                if math.hypot(p.x - b.x, p.y - b.y) < (PLAYER_RADIUS + self.bullet_radius):
                    p.health -= WEAPON_DAMAGE["pistol"]
                    b.active = False
                    if p.health <= 0: p.alive = False
                    break
        self.bullets = [b for b in self.bullets if b.active]

    def _fire_weapon(self, idx: int):
        p = self.players[idx]
        if p.cooldown_steps > 0:
            p.cooldown_steps -= 1
            return

        vx = math.cos(p.angle) * BULLET_SPEED
        vy = math.sin(p.angle) * BULLET_SPEED
        start_x = p.x + math.cos(p.angle) * (PLAYER_RADIUS + 2)
        start_y = p.y + math.sin(p.angle) * (PLAYER_RADIUS + 2)
        self.bullets.append(Bullet(start_x, start_y, vx, vy, idx))
        p.cooldown_steps = weapon_cooldown_steps("pistol")

    def _step_opponent(self, idx):
        bot = self.players[idx]
        if bot.cooldown_steps > 0: bot.cooldown_steps -= 1
        target = self.players[0]
        if not bot.alive or not target.alive: return

        dx = target.x - bot.x
        dy = target.y - bot.y
        dist = math.hypot(dx, dy)
        desired_angle = math.atan2(dy, dx)

        # Simple bot logic
        move, strafe, should_shoot = 0, 0, False
        diff = smallest_angle_diff(desired_angle, bot.angle)

        if self.difficulty == "static": return

        if dist > 250: move = 1 # Forward
        elif dist < 150: move = 2 # Back

        turn = 0
        if diff > 0.1: turn = 1
        elif diff < -0.1: turn = 2

        # Shoot if aimed
        if abs(diff) < 0.3 and dist < 600:
             self._fire_weapon(idx)

        self._apply_movement(idx, move, strafe, turn)

    def _apply_movement(self, idx, move, strafe, turn):
        p = self.players[idx]
        if not p.alive: return

        if turn == 1: p.angle = wrap_angle(p.angle + self.turn_speed)
        elif turn == 2: p.angle = wrap_angle(p.angle - self.turn_speed)

        dx, dy = 0.0, 0.0
        if move == 1: dx += math.cos(p.angle) * self.move_speed; dy += math.sin(p.angle) * self.move_speed
        elif move == 2: dx -= math.cos(p.angle) * self.move_speed; dy -= math.sin(p.angle) * self.move_speed

        if strafe == 1: dx += math.cos(p.angle + math.pi/2) * self.move_speed; dy += math.sin(p.angle + math.pi/2) * self.move_speed
        elif strafe == 2: dx += math.cos(p.angle - math.pi/2) * self.move_speed; dy += math.sin(p.angle - math.pi/2) * self.move_speed

        p.vx, p.vy = dx, dy
        nx, ny = p.x + dx, p.y + dy
        nx = max(PLAYER_RADIUS, min(nx, CANVAS_WIDTH - PLAYER_RADIUS))
        ny = max(PLAYER_RADIUS, min(ny, CANVAS_HEIGHT - PLAYER_RADIUS))

        if not circle_collides_walls(nx, ny, PLAYER_RADIUS, self.walls):
            p.x, p.y = nx, ny

    def _decode_action(self, action):
        a = int(action)
        shoot = a % 2; a //= 2
        turn = a % 3; a //= 3
        strafe = a % 3; a //= 3
        move = a % 3
        return move, strafe, turn, shoot

    def _get_obs(self):
        agent = self.players[0]
        # Self (8)
        self_feats = [
            (agent.x / CANVAS_WIDTH) * 2 - 1, (agent.y / CANVAS_HEIGHT) * 2 - 1,
            math.cos(agent.angle), math.sin(agent.angle),
            (agent.health / MAX_HEALTH) * 2 - 1,
            agent.vx / self.move_speed, agent.vy / self.move_speed,
            agent.cooldown_steps / 20.0
        ]
        # Rays (8)
        max_dist = math.hypot(CANVAS_WIDTH, CANVAS_HEIGHT)
        ray_feats = []
        for i in range(8):
            theta = agent.angle + (2*math.pi*i)/8
            d = raycast_distance(agent.x, agent.y, theta, self.walls, max_dist)
            ray_feats.append((d/max_dist)*2 - 1)
        # Enemies (4 * 7)
        enemies = [(not p.alive, math.hypot(p.x-agent.x, p.y-agent.y), p) for i, p in enumerate(self.players) if i != 0]
        enemies.sort(key=lambda x: (x[0], x[1]))
        enemy_feats = []
        for _, dist, p in enemies[:4]:
            dx = p.x - agent.x; dy = p.y - agent.y
            rel_ang = smallest_angle_diff(math.atan2(dy, dx), agent.angle)
            enemy_feats.extend([1.0 if p.alive else 0.0, (dx/CANVAS_WIDTH)*2, (dy/CANVAS_HEIGHT)*2, (dist/max_dist)*2-1, math.cos(rel_ang), math.sin(rel_ang), (p.health/MAX_HEALTH)*2-1])
        while len(enemy_feats) < 28: enemy_feats.extend([0.0]*7)
        # Bullets (5 * 4)
        dangerous_bullets = []
        for b in self.bullets:
            if b.owner_idx == 0: continue
            if math.hypot(b.x - agent.x, b.y - agent.y) < 400: dangerous_bullets.append((math.hypot(b.x - agent.x, b.y - agent.y), b))
        dangerous_bullets.sort(key=lambda x: x[0])
        bullet_feats = []
        for dist, b in dangerous_bullets[:5]:
            bullet_feats.extend([(b.x-agent.x)/CANVAS_WIDTH*2, (b.y-agent.y)/CANVAS_HEIGHT*2, b.vx/BULLET_SPEED, b.vy/BULLET_SPEED])
        while len(bullet_feats) < 20: bullet_feats.extend([0.0]*4)
        return np.concatenate([self_feats, ray_feats, enemy_feats, bullet_feats], dtype=np.float32)

# --- 3. Main Inference Logic ---

def main():
    parser = argparse.ArgumentParser(description="Run inference on trained ShootingBot model and generate video.")
    parser.add_argument("--model", type=str, required=True, help="Path to the .zip model file.")
    parser.add_argument("--output", type=str, default="inference_output.mp4", help="Output video filename.")
    parser.add_argument("--steps", type=int, default=1500, help="Number of steps to record.")
    parser.add_argument("--difficulty", type=str, default="hard", choices=["static", "easy", "hard"], help="Opponent difficulty.")
    parser.add_argument("--opponents", type=int, default=3, help="Number of opponents.")

    args = parser.parse_args()

    print(f"Loading model from: {args.model}")
    try:
        model = RecurrentPPO.load(args.model)
    except Exception as e:
        print(f"Error loading model: {e}")
        return

    print(f"Initializing Environment (Mode: {args.difficulty}, Opponents: {args.opponents})...")
    env = ShootingBotEnv(num_opponents=args.opponents, difficulty=args.difficulty, bullet_radius=10.0)

    # Video Writer Setup
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    fps = 20.0 # 50ms per step -> 20 FPS
    out = cv2.VideoWriter(args.output, fourcc, fps, (CANVAS_WIDTH, CANVAS_HEIGHT))

    obs, _ = env.reset()

    # Recurrent Model State Initialization
    # We need to track the LSTM states manually for predict()
    lstm_states = None
    num_envs = 1
    episode_starts = np.ones((num_envs,), dtype=bool)

    print("Starting inference...")
    for step in range(args.steps):
        # Predict action
        # deterministic=True usually results in less jittery movement for trained models
        action, lstm_states = model.predict(obs, state=lstm_states, episode_start=episode_starts, deterministic=True)

        # Step environment
        obs, reward, terminated, truncated, info = env.step(action)

        # Render frame
        frame = env.render()

        # Write to video
        out.write(frame)

        # Update episode start flag (crucial for LSTM to reset if agent dies)
        done = terminated or truncated
        episode_starts[0] = done

        if done:
            obs, _ = env.reset()
            # Reset LSTM state if desired, or let RecurrentPPO handle it via episode_starts
            # Usually episode_starts=True handles internal reset, but we can also clear lstm_states if we want a hard reset
            lstm_states = None
            print(f"Episode finished at step {step}. Resetting.")

    out.release()
    print(f"Inference complete. Video saved to {args.output}")

if __name__ == "__main__":
    main()
