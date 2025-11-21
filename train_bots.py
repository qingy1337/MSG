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

def evaluate_agent(model, env, n_episodes: int = 50) -> float:
    wins = 0
    for _ in range(n_episodes):
        obs, _ = env.reset()
        done = False
        truncated = False
        while not (done or truncated):
            action, _ = model.predict(obs, deterministic=True)
            obs, _, done, truncated, _ = env.step(action)
        if env.players[0].alive:
            wins += 1
    return wins / n_episodes

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
        n_steps=2048,
        batch_size=256,
        ent_coef=0.05,
        gamma=0.99,
        n_epochs=10,
        policy_kwargs={
            "lstm_hidden_size": 256,
            "n_lstm_layers": 2,
            "net_arch": [256, 256],
        }
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

    model.learn(total_timesteps=10_000_000, callback=WandbCallback())

    # Quick eval gate to avoid advancing with a weak policy
    eval_env = ShootingBotEnv(num_opponents=1, difficulty="easy", bullet_radius=10.0, mode="eval")
    win_rate = evaluate_agent(model, eval_env, n_episodes=50)
    extra_rounds = 0
    while win_rate < 0.70 and extra_rounds < 3:
        print(f"Win rate too low ({win_rate:.1%}), training 1M more steps...")
        model.learn(total_timesteps=1_000_000, callback=WandbCallback())
        win_rate = evaluate_agent(model, eval_env, n_episodes=50)
        extra_rounds += 1

    model.save("bot_projectile_stage0")

    print("--- STAGE 1: 1v2 vs Easy Bot ---")
    env = ShootingBotEnv(num_opponents=2, difficulty="easy", bullet_radius=10.0)

    model.set_env(env)
    model.learn(total_timesteps=3_000_000, callback=WandbCallback())
    model.save("bot_projectile_stage1")

    print("--- STAGE 2: 1v3 vs Easy Bot ---")
    env = ShootingBotEnv(num_opponents=3, difficulty="easy", bullet_radius=10.0)

    model.set_env(env)
    model.learn(total_timesteps=5_000_000, callback=WandbCallback())
    model.save("bot_projectile_stage2")

    print("--- STAGE 3: 1v2 vs Hard Bot ---")
    env = ShootingBotEnv(num_opponents=2, difficulty="hard")

    model.set_env(env)
    model.learn(total_timesteps=5_000_000, callback=WandbCallback())
    model.save("bot_projectile_stage3")

    print("--- STAGE 4: 1v3 vs Hard Bots ---")
    env = ShootingBotEnv(num_opponents=3, difficulty="hard")

    # Load previous weights
    model.set_env(env)
    model.learn(total_timesteps=5_000_000, callback=WandbCallback())
    model.save("bot_projectile_final")
    print("Training Complete.")

if __name__ == "__main__":
    main()
