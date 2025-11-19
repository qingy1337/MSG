"""
Inference script for Shooting Bots.
Loads a trained RecurrentPPO model and generates a gameplay video using OpenCV.
"""

import argparse
import math
import random
import numpy as np
import cv2
from msg_env import *
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
    env = ShootingBotEnv(num_opponents=args.opponents, difficulty=args.difficulty, bullet_radius=10.0, mode = "inference")

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
