"""
Advanced RL training script with Projectile Physics and Recurrent PPO.
"""

from __future__ import annotations

import math
import random
import wandb
import cv2
from msg_env import *
from typing import List, Tuple
from stable_baselines3.common.vec_env import DummyVecEnv, VecVideoRecorder
from wandb.integration.sb3 import WandbCallback
import numpy as np

try:
    import gym
    from gym import spaces
except ImportError as exc:
    raise ImportError("gym==0.26.2 is required.") from exc

try:
    # We use RecurrentPPO because memory is vital for tracking bullet trajectories
    # and predicting enemy movement (leading shots).
    from sb3_contrib import RecurrentPPO
except ImportError as exc:
    raise ImportError("sb3-contrib is required. pip install sb3-contrib") from exc


def weapon_cooldown_steps(weapon_key: str) -> int:
    # approx 2 steps cooldown
    return max(1, int(round(WEAPONS["pistol"]["cooldown_ms"] / ENV_STEP_MS)))

def wrap_angle(angle: float) -> float:
    return (angle + math.pi) % (2 * math.pi) - math.pi

def smallest_angle_diff(target: float, source: float) -> float:
    return wrap_angle(target - source)

# --- Geometry ---

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
    # Simplified raycast for walls
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

# --- Training ---
def main():
    # STAGE 0
    print("--- STAGE 0: Training with RecurrentPPO & Projectiles ---")

    env = ShootingBotEnv(num_opponents=2, difficulty="easy", bullet_radius=10.0)

    # RecurrentPPO automatically handles the LSTM hidden states
    model = RecurrentPPO(
        "MlpLstmPolicy",
        env,
        verbose=1,
        learning_rate=3e-4,
        n_steps=1024,
        batch_size=128,
        ent_coef=0.02,
        gamma=0.99,
        policy_kwargs={"lstm_hidden_size": 128, "n_lstm_layers": 1}
    )

    config = {
        "policy": "RecurrentPPO",
        "physics": "Projectiles",
        "env_name": "MSG-Projectiles",
    }
    wandb.init(
        project="MSG-RL-Projectiles",
        config=config,
        sync_tensorboard=True,
        monitor_gym=True,
        save_code=True,
    )

    model.learn(total_timesteps=500_000, callback=WandbCallback())
    model.save("bot_projectile_stage0")

    # STAGE 1: Train vs 1 Easy Bot
    print("--- STAGE 1: 1v1 vs Easy Bot ---")
    env = ShootingBotEnv(num_opponents=2, difficulty="easy", bullet_radius=10.0)

    model.set_env(env)
    model.learn(total_timesteps=1_000_000, callback=WandbCallback())
    model.save("bot_projectile_stage1")

    # STAGE 2: Train vs 2 Easy Bot
    print("--- STAGE 2: 1v2 vs Easy Bot ---")
    env = ShootingBotEnv(num_opponents=3, difficulty="easy", bullet_radius=10.0)

    model.set_env(env)
    model.learn(total_timesteps=1_000_000, callback=WandbCallback())
    model.save("bot_projectile_stage2")

    # STAGE 3: Train vs 3 Easy Bot
    print("--- STAGE 3: 1v3 vs Easy Bot ---")
    env = ShootingBotEnv(num_opponents=2, difficulty="hard")

    model.set_env(env)
    model.learn(total_timesteps=1_000_000, callback=WandbCallback())
    model.save("bot_projectile_stage3")

    # STAGE 4: Train vs 3 Hard Bots
    print("--- STAGE 4: 1v3 vs Hard Bots ---")
    env = ShootingBotEnv(num_opponents=3, difficulty="hard")

    # Load previous weights
    model.set_env(env)
    model.learn(total_timesteps=2_000_000, callback=WandbCallback())
    model.save("bot_projectile_final")
    print("Training Complete.")

if __name__ == "__main__":
    main()
