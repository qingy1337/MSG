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

# --- Training ---
def main():
    # STAGE 0
    print("--- STAGE 0: Training with RecurrentPPO & Projectiles ---")

    env = ShootingBotEnv(num_opponents=1, difficulty="easy", bullet_radius=10.0)

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
