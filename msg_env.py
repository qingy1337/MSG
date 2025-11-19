from dataclasses import dataclass
import random
import math
import numpy as np
import gym
import wandb
import cv2
from gym import spaces
from typing import List, Tuple

# --- Constants ---

CANVAS_WIDTH = 900
CANVAS_HEIGHT = 600
PLAYER_RADIUS = 20
MAX_HEALTH = 100

# Physics
BULLET_SPEED = 12.0
BULLET_RADIUS = 10.0
BULLET_LIFETIME = 500 # Steps before bullet disappears

WEAPON_DAMAGE = {"pistol": 20.0}
WEAPONS = {"pistol": {"cooldown_ms": 90, "range": BULLET_LIFETIME * BULLET_SPEED}}
WEAPON_KEYS: List[str] = list(WEAPONS.keys())

COOLDOWN_SCALE = 1.0
ENV_STEP_MS = 50.0


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
    # We track velocity for observation purposes (optional but helpful for leading shots)
    vx: float = 0.0
    vy: float = 0.0

@dataclass
class Wall:
    x: float
    y: float
    width: float
    height: float


def weapon_cooldown_steps(weapon_key: str) -> int:
    return max(1, int(round(90 / ENV_STEP_MS)))

def wrap_angle(angle: float) -> float:
    return (angle + math.pi) % (2 * math.pi) - math.pi

def smallest_angle_diff(target: float, source: float) -> float:
    return wrap_angle(target - source)

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

# --- Environment ---

class ShootingBotEnv(gym.Env):
    def __init__(self, num_opponents: int = 1, max_steps: int = 800, difficulty: str = "easy", bullet_radius: float = 5.0, mode: str = "train"):
        super().__init__()
        self.num_opponents = num_opponents
        self.max_steps = max_steps
        self.difficulty = difficulty

        # Obs Space:
        # Self (8): x, y, cos, sin, hp, vx, vy, cooldown
        # Raycasts (8): distances
        # Enemies (4 * 7): alive, rel_x, rel_y, dist, cos_rel, sin_rel, hp
        # Bullets (5 * 4): rel_x, rel_y, vx, vy (Nearest 5 bullets)
        # Total: 8 + 8 + 28 + 20 = 64
        self.observation_space = spaces.Box(low=-1.0, high=1.0, shape=(64,), dtype=np.float32)
        self.action_space = spaces.Discrete(54)

        self.players: List[PlayerState] = []
        self.bullets: List[Bullet] = []
        self.walls: List[Wall] = []
        self.step_count = 0

        self.bullet_radius = bullet_radius

        self.move_speed = 5.0
        self.turn_speed = 0.15
        self.mode = mode

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

        # Update weapon cooldowns for all players
        for p in self.players:
            if p.cooldown_steps > 0:
                p.cooldown_steps -= 1

        # 1. Decode and Apply Agent Action
        move, strafe, turn, shoot = self._decode_action(action)

        # Reset velocities for obs (recalculated in apply_movement)
        agent.vx, agent.vy = 0, 0
        self._apply_movement(0, move, strafe, turn)

        if shoot == 1 and agent.alive:
            self._fire_weapon(0)

        # 2. Move Opponents
        for i in range(1, len(self.players)):
            self._step_opponent(i)

        # 3. Update Physics (Bullets)
        bullet_hits_damage = self._update_bullets()

        # 4. Rewards
        reward = 0.0
        reward_components = {}

        # Survival Reward
        if agent.alive:
            reward -= 0.005
        reward_components["survival"] = -0.005 if agent.alive else 0.0

        # Damage Dealt Reward (Delayed!)
        damage_reward = bullet_hits_damage * 0.2
        reward += damage_reward
        reward_components["damage_dealt"] = damage_reward

        # Orientation Reward (Aim at enemy)
        orientation_reward = self._orientation_reward() * 0.01
        reward += orientation_reward
        reward_components["orientation"] = orientation_reward

        # Proximity Reward (encourage closing distance to enemies)
        proximity_reward = 0.0
        if agent.alive:
            proximity_reward = self._proximity_reward() * 0.01
            reward += proximity_reward
        reward_components["proximity"] = proximity_reward

        # Death Penalty
        terminated = False
        if not agent.alive:
            reward -= 10.0
            reward_components["death_penalty"] = -10.0
            terminated = True
        else:
            reward_components["death_penalty"] = 0.0

        # Win Reward
        opponents_alive = sum(1 for p in self.players[1:] if p.alive)
        win_reward = 0.0
        time_bonus = 0.0
        if opponents_alive == 0:
            win_reward = 20.0 # Big bonus for winning
            time_bonus = (self.max_steps - self.step_count) * 0.01
            reward_components["win"] = win_reward
            reward_components["time_bonus"] = time_bonus

            reward += win_reward + time_bonus
            terminated = True

        truncated = (self.step_count >= self.max_steps)

        if self.mode == "train":
            # Log reward components to wandb
            wandb.log(reward_components, commit=True)

        return self._get_obs(), reward, terminated, truncated, {}

    def _update_bullets(self) -> float:
        """
        Moves all bullets, checks collisions.
        Returns damage dealt BY THE AGENT this step.
        """
        damage_dealt_by_agent = 0.0

        for b in self.bullets:
            if not b.active: continue

            # Move
            b.x += b.vx
            b.y += b.vy
            b.steps_alive += 1

            # Expire
            if b.steps_alive > BULLET_LIFETIME:
                b.active = False
                continue

            # Wall Collisions (Simplified Point check)
            if not (0 <= b.x <= CANVAS_WIDTH and 0 <= b.y <= CANVAS_HEIGHT):
                b.active = False; continue

            hit_wall = False
            for w in self.walls:
                if is_point_inside_wall(b.x, b.y, w):
                    hit_wall = True; break
            if hit_wall:
                b.active = False; continue

            # Player Collisions
            for idx, p in enumerate(self.players):
                if not p.alive: continue
                if idx == b.owner_idx: continue # Don't hit self

                # Circle-Circle collision (bullet radius + player radius)
                dist = math.hypot(p.x - b.x, p.y - b.y)
                if dist < (PLAYER_RADIUS + self.bullet_radius):
                    p.health -= WEAPON_DAMAGE["pistol"]
                    b.active = False # Destroy bullet

                    if p.health <= 0:
                        p.alive = False

                    # Record damage if agent owns this bullet
                    if b.owner_idx == 0:
                        damage_dealt_by_agent += WEAPON_DAMAGE["pistol"]
                    break

        # Clean up inactive list
        self.bullets = [b for b in self.bullets if b.active]
        return damage_dealt_by_agent

    def _fire_weapon(self, idx: int):
        p = self.players[idx]
        if p.cooldown_steps > 0: return

        # Spawn Bullet
        vx = math.cos(p.angle) * BULLET_SPEED
        vy = math.sin(p.angle) * BULLET_SPEED

        # Start bullet at edge of player radius so we don't hit ourselves immediately
        start_x = p.x + math.cos(p.angle) * (PLAYER_RADIUS + 2)
        start_y = p.y + math.sin(p.angle) * (PLAYER_RADIUS + 2)

        b = Bullet(start_x, start_y, vx, vy, idx)
        self.bullets.append(b)

        p.cooldown_steps = weapon_cooldown_steps("pistol")

        # Make enemies (non-agent players) shoot half as fast
        # by giving them double the cooldown compared to the agent.
        if idx != 0:
            p.cooldown_steps *= COOLDOWN_SCALE

    def _step_opponent(self, idx):
        bot = self.players[idx]
        target = self.players[0]
        if not bot.alive or not target.alive: return

        dx = target.x - bot.x
        dy = target.y - bot.y
        dist = math.hypot(dx, dy)
        desired_angle = math.atan2(dy, dx)

        if self.difficulty == "static":
            return
        elif self.difficulty == "easy":
            aim_error = random.uniform(-0.5, 0.5)
            diff = smallest_angle_diff(desired_angle + aim_error, bot.angle)
            if dist > 300: move = 1
            elif dist < 100: move = 2
            else: move = 0
            strafe = 0
            if random.random() < 0.1: strafe = random.choice([1,2])
            should_shoot = (abs(diff) < 0.5 and dist < 500 and random.random() < 0.05)
        else: # hard
            aim_error = random.uniform(-0.1, 0.1)
            diff = smallest_angle_diff(desired_angle + aim_error, bot.angle)
            if dist > 250: move = 1
            elif dist < 150: move = 2
            else: move = 0
            strafe = 0
            if random.random() < 0.2: strafe = random.choice([1,2])
            should_shoot = (abs(diff) < 0.3 and dist < 600)

        turn = 0
        if diff > 0.1: turn = 1
        elif diff < -0.1: turn = 2

        self._apply_movement(idx, move, strafe, turn)
        if should_shoot:
            self._fire_weapon(idx)

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

        # Update tracking velocity
        p.vx, p.vy = dx, dy

        nx, ny = p.x + dx, p.y + dy
        nx = max(PLAYER_RADIUS, min(nx, CANVAS_WIDTH - PLAYER_RADIUS))
        ny = max(PLAYER_RADIUS, min(ny, CANVAS_HEIGHT - PLAYER_RADIUS))

        if not circle_collides_walls(nx, ny, PLAYER_RADIUS, self.walls):
            p.x, p.y = nx, ny

    def _orientation_reward(self) -> float:
        # Small reward for keeping crosshair on opponent
        agent = self.players[0]
        best_align = 0.0
        for p in self.players[1:]:
            if not p.alive: continue
            ang = math.atan2(p.y - agent.y, p.x - agent.x)
            diff = abs(smallest_angle_diff(ang, agent.angle))
            if diff < 0.5:
                best_align = max(best_align, (0.5 - diff) * 2.0)
        return best_align

    def _proximity_reward(self) -> float:
        """
        Returns a value in [0, 1] that is larger
        when the agent is closer to the nearest living enemy.
        """
        agent = self.players[0]
        distances = [
            math.hypot(p.x - agent.x, p.y - agent.y)
            for p in self.players[1:]
            if p.alive
        ]
        if not distances:
            return 0.0

        min_dist = min(distances)
        max_reward_dist = 400.0  # within this distance we give shaped reward
        if min_dist >= max_reward_dist:
            return 0.0

        # Closer enemies give higher reward, normalized to [0, 1]
        return (max_reward_dist - min_dist) / max_reward_dist

    def _decode_action(self, action):
        a = int(action)
        shoot = a % 2; a //= 2
        turn = a % 3; a //= 3
        strafe = a % 3; a //= 3
        move = a % 3
        return move, strafe, turn, shoot

    def _get_obs(self):
        agent = self.players[0]

        # 1. Self Stats (8)
        self_feats = [
            (agent.x / CANVAS_WIDTH) * 2 - 1,
            (agent.y / CANVAS_HEIGHT) * 2 - 1,
            math.cos(agent.angle), math.sin(agent.angle),
            (agent.health / MAX_HEALTH) * 2 - 1,
            agent.vx / self.move_speed,
            agent.vy / self.move_speed,
            agent.cooldown_steps / 20.0
        ]

        # 2. Wall Rays (8)
        max_dist = math.hypot(CANVAS_WIDTH, CANVAS_HEIGHT)
        ray_feats = []
        for i in range(8):
            theta = agent.angle + (2*math.pi*i)/8
            d = raycast_distance(agent.x, agent.y, theta, self.walls, max_dist)
            ray_feats.append((d/max_dist)*2 - 1)

        # 3. Enemies (4 * 7)
        # Sort by ALIVE then DISTANCE
        enemies = [(not p.alive, math.hypot(p.x-agent.x, p.y-agent.y), p)
                   for i, p in enumerate(self.players) if i != 0]
        enemies.sort(key=lambda x: (x[0], x[1]))

        enemy_feats = []
        for _, dist, p in enemies[:4]:
            dx = p.x - agent.x
            dy = p.y - agent.y
            rel_ang = smallest_angle_diff(math.atan2(dy, dx), agent.angle)
            enemy_feats.extend([
                1.0 if p.alive else 0.0,
                (dx / CANVAS_WIDTH) * 2,
                (dy / CANVAS_HEIGHT) * 2,
                (dist / max_dist) * 2 - 1,
                math.cos(rel_ang),
                math.sin(rel_ang),
                (p.health / MAX_HEALTH) * 2 - 1
            ])
        # Pad
        while len(enemy_feats) < 28: enemy_feats.extend([0.0]*7)

        # 4. Bullets (5 * 4) - NEW!
        # Find dangerous bullets (those belonging to enemies)
        dangerous_bullets = []
        for b in self.bullets:
            if b.owner_idx == 0: continue # Ignore own bullets
            dx = b.x - agent.x
            dy = b.y - agent.y
            dist = math.hypot(dx, dy)
            if dist < 400: # Only care about nearby bullets
                dangerous_bullets.append((dist, b))

        dangerous_bullets.sort(key=lambda x: x[0])

        bullet_feats = []
        for dist, b in dangerous_bullets[:5]:
            dx = b.x - agent.x
            dy = b.y - agent.y
            # Relative Position
            bullet_feats.extend([
                (dx / CANVAS_WIDTH) * 2,
                (dy / CANVAS_HEIGHT) * 2,
                # Relative Velocity (so agent can tell if bullet is coming AT them)
                b.vx / BULLET_SPEED,
                b.vy / BULLET_SPEED
            ])

        while len(bullet_feats) < 20: bullet_feats.extend([0.0]*4)

        return np.concatenate([self_feats, ray_feats, enemy_feats, bullet_feats], dtype=np.float32)

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
