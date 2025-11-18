"""
Demo script: have trained PPO bots battle each other and save a video.

Usage (after training with train_bots.py on your GPU machine):

  pip install "stable-baselines3[extra]" matplotlib imageio
  python demo_self_play_video.py --model bot_policy.zip --out bot_battle.mp4

This script:
  - Loads the PPO policy trained in train_bots.py.
  - Creates a small self-play arena where N bots all use the same policy.
  - Runs one episode and records frames using matplotlib.
  - Writes an MP4 (or GIF) via imageio.
"""

from __future__ import annotations

import argparse
import math
import random
from dataclasses import dataclass
from typing import List, Tuple

import numpy as np

try:
  from stable_baselines3 import PPO
except ImportError as exc:  # pragma: no cover - import hint only
  raise ImportError(
    "stable-baselines3 is required. Try: pip install 'stable-baselines3[extra]'"
  ) from exc

try:
  import matplotlib.pyplot as plt
except ImportError as exc:  # pragma: no cover - import hint only
  raise ImportError(
    "matplotlib is required for rendering. Try: pip install matplotlib"
  ) from exc

try:
  import imageio.v2 as imageio
except ImportError as exc:  # pragma: no cover - import hint only
  raise ImportError(
    "imageio is required for video writing. Try: pip install imageio[ffmpeg]"
  ) from exc

# Import shared geometry + constants from the training script
from train_bots import (  # type: ignore
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  PLAYER_RADIUS,
  MAX_HEALTH,
  WEAPONS,
  WEAPON_KEYS,
  PlayerState,
  Wall,
  weapon_cooldown_steps,
  weapon_damage,
  wrap_angle,
  smallest_angle_diff,
  generate_walls,
  circle_collides_walls,
  raycast_distance,
  line_intersects_any_wall,
  sample_spawn_position,
)


@dataclass
class BattleConfig:
  num_bots: int = 2
  max_steps: int = 600
  randomize_weapon: bool = True
  fixed_weapon: str | None = None
  fps: int = 20


class SelfPlayArena:
  """
  Lightweight self-play arena:
    - All players are controlled by the same PPO policy.
    - Physics / geometry mirror train_bots.ShootingBotEnv.
    - No gym dependency; we just step the world manually.
  """

  def __init__(self, cfg: BattleConfig) -> None:
    assert 2 <= cfg.num_bots <= 5, "Supports between 2 and 5 bots."
    self.cfg = cfg
    self.players: List[PlayerState] = []
    self.walls: List[Wall] = []
    self.step_count: int = 0

    # Movement / shooting parameters (mirrors ShootingBotEnv)
    self.move_speed = 5.0
    self.turn_speed = 0.2
    self.aim_cone_rad = 0.3

  def reset(self, *, seed: int | None = None) -> None:
    if seed is not None:
      random.seed(seed)
      np.random.seed(seed)

    self.step_count = 0
    self.walls = generate_walls()
    self.players = []

    for _ in range(self.cfg.num_bots):
      x, y = sample_spawn_position(self.walls, self.players)
      angle = random.uniform(-math.pi, math.pi)
      if self.cfg.fixed_weapon is not None:
        weapon_key = self.cfg.fixed_weapon
      elif self.cfg.randomize_weapon:
        weapon_key = random.choice(WEAPON_KEYS)
      else:
        weapon_key = "autoRifle"
      self.players.append(
        PlayerState(
          x=x,
          y=y,
          angle=angle,
          health=float(MAX_HEALTH),
          weapon_key=weapon_key,
          alive=True,
          cooldown_steps=0,
        )
      )

  # --- RL observation + action helpers ---

  @staticmethod
  def _build_obs_for_agent(
      players: List[PlayerState],
      walls: List[Wall],
      agent_index: int,
  ) -> np.ndarray:
    """
    Build observation for one agent, matching train_bots.ShootingBotEnv._get_obs.
    """
    agent = players[agent_index]

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
      d = raycast_distance(agent.x, agent.y, theta, walls, max_dist)
      d_norm = (d / max_dist) * 2.0 - 1.0
      ray_feats.append(d_norm)

    # Other players (up to 4)
    other_feats: List[float] = []
    max_others = 4
    others: List[PlayerState] = []
    for idx, other in enumerate(players):
      if idx == agent_index:
        continue
      others.append(other)
      if len(others) >= max_others:
        break

    for other in others:
      alive_flag = 1.0 if other.alive else 0.0
      dx = other.x - agent.x
      dy = other.y - agent.y
      dist = math.hypot(dx, dy)
      rel_x = (dx / CANVAS_WIDTH) * 2.0
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

  @staticmethod
  def _decode_action(
      action: int,
      n_move: int = 3,
      n_strafe: int = 3,
      n_turn: int = 3,
      n_shoot: int = 2,
  ) -> Tuple[int, int, int, int]:
    """
    Map discrete index -> (move, strafe, turn, shoot).
    Mirrors ShootingBotEnv._decode_action.
    """
    a = int(action)
    shoot = a % n_shoot
    a //= n_shoot
    turn = a % n_turn
    a //= n_turn
    strafe = a % n_strafe
    a //= n_strafe
    move = a % n_move
    return move, strafe, turn, shoot

  def _apply_movement(
      self, idx: int, move_idx: int, strafe_idx: int, turn_idx: int
  ) -> None:
    player = self.players[idx]
    if not player.alive:
      return

    angle = player.angle

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

    new_x = player.x + dx
    new_y = player.y + dy

    # Bounds clamp
    new_x = max(PLAYER_RADIUS, min(new_x, CANVAS_WIDTH - PLAYER_RADIUS))
    new_y = max(PLAYER_RADIUS, min(new_y, CANVAS_HEIGHT - PLAYER_RADIUS))

    # Wall collision: simple "try move, revert if collides"
    if not circle_collides_walls(new_x, new_y, PLAYER_RADIUS, self.walls):
      player.x = new_x
      player.y = new_y

    player.angle = angle

  def _fire_weapon(self, shooter_idx: int) -> None:
    """
    Perform a hitscan shot from shooter. Mutates health / alive / cooldown.
    Mirrors ShootingBotEnv._fire_weapon, but without reward shaping.
    """
    shooter = self.players[shooter_idx]
    if not shooter.alive:
      return
    if shooter.cooldown_steps > 0:
      return

    weapon_key = shooter.weapon_key
    dmg = weapon_damage(weapon_key)
    max_range = WEAPONS[weapon_key]["range"]

    x0, y0 = shooter.x, shooter.y
    x1 = x0 + math.cos(shooter.angle) * max_range
    y1 = y0 + math.sin(shooter.angle) * max_range

    hit_any = False

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

      if target.health <= 0 and target.alive:
        target.alive = False

    if hit_any:
      shooter.cooldown_steps = weapon_cooldown_steps(weapon_key)

  def step(self, actions: List[int]) -> bool:
    """
    Apply one step for all bots.

    Returns:
      done (bool): True if battle finished (one or zero bots alive or max_steps).
    """
    assert len(actions) == len(self.players)

    self.step_count += 1

    # Update cooldowns
    for player in self.players:
      if player.cooldown_steps > 0:
        player.cooldown_steps -= 1

    decoded = [self._decode_action(a) for a in actions]

    # Movement phase
    for idx, (move_idx, strafe_idx, turn_idx, _shoot_flag) in enumerate(decoded):
      self._apply_movement(idx, move_idx, strafe_idx, turn_idx)

    # Shooting phase
    for idx, (_move_idx, _strafe_idx, _turn_idx, shoot_flag) in enumerate(decoded):
      if shoot_flag == 1:
        self._fire_weapon(idx)

    alive_indices = [i for i, p in enumerate(self.players) if p.alive]
    if len(alive_indices) <= 1:
      return True
    if self.step_count >= self.cfg.max_steps:
      return True
    return False


def render_frame(
    arena: SelfPlayArena,
    step_idx: int,
    fig_ax_cache: dict,
) -> np.ndarray:
  """
  Render current arena state to an RGB numpy array using matplotlib.
  """
  if "fig" not in fig_ax_cache:
    fig, ax = plt.subplots(figsize=(9, 6), dpi=100)
    fig_ax_cache["fig"] = fig
    fig_ax_cache["ax"] = ax
  else:
    fig = fig_ax_cache["fig"]
    ax = fig_ax_cache["ax"]

  ax.clear()
  ax.set_xlim(0, CANVAS_WIDTH)
  ax.set_ylim(0, CANVAS_HEIGHT)
  ax.set_aspect("equal")
  ax.set_facecolor((0.05, 0.05, 0.08))
  ax.set_xticks([])
  ax.set_yticks([])

  # Draw walls
  for wall in arena.walls:
    rect = plt.Rectangle(
      (wall.x, wall.y),
      wall.width,
      wall.height,
      color="dimgray",
    )
    ax.add_patch(rect)

  # Draw players
  colors = ["tab:blue", "tab:red", "tab:green", "tab:orange", "tab:purple"]
  for idx, player in enumerate(arena.players):
    color = colors[idx % len(colors)]
    alpha = 1.0 if player.alive else 0.2

    circ = plt.Circle(
      (player.x, player.y),
      PLAYER_RADIUS,
      color=color,
      alpha=alpha,
      linewidth=1.5,
      ec="black",
    )
    ax.add_patch(circ)

    # Facing direction
    nose_x = player.x + math.cos(player.angle) * PLAYER_RADIUS
    nose_y = player.y + math.sin(player.angle) * PLAYER_RADIUS
    ax.plot([player.x, nose_x], [player.y, nose_y], color="white", linewidth=1.0)

    # Health bar
    health_frac = max(0.0, min(1.0, player.health / MAX_HEALTH))
    bar_width = 30.0
    bar_height = 4.0
    bar_x = player.x - bar_width / 2.0
    bar_y = player.y + PLAYER_RADIUS + 6.0
    ax.add_patch(
      plt.Rectangle(
        (bar_x, bar_y),
        bar_width,
        bar_height,
        color="black",
        alpha=0.6,
      )
    )
    ax.add_patch(
      plt.Rectangle(
        (bar_x, bar_y),
        bar_width * health_frac,
        bar_height,
        color="limegreen",
        alpha=0.9,
      )
    )

  ax.set_title(f"Bot self-play battle — step {step_idx}", color="white")

  fig.canvas.draw()
  canvas = fig.canvas
  width, height = canvas.get_width_height()
  if hasattr(canvas, "tostring_rgb"):
    buf = canvas.tostring_rgb()
    image = np.frombuffer(buf, dtype=np.uint8).reshape(height, width, 3)
  else:
    # Fallback for backends that only expose ARGB
    buf = canvas.tostring_argb()
    argb = np.frombuffer(buf, dtype=np.uint8).reshape(height, width, 4)
    # Drop alpha and reorder ARGB -> RGB
    image = argb[:, :, 1:4]
  return image


def run_battle_video(
    model_path: str,
    output_path: str,
    num_bots: int = 2,
    max_steps: int = 600,
    seed: int | None = 123,
    weapon: str | None = None,
    fps: int = 20,
) -> None:
  """
  Run one self-play battle and save it as a video.
  """
  cfg = BattleConfig(
    num_bots=num_bots,
    max_steps=max_steps,
    randomize_weapon=weapon is None,
    fixed_weapon=weapon,
    fps=fps,
  )
  arena = SelfPlayArena(cfg)
  arena.reset(seed=seed)

  model = PPO.load(model_path, device="auto")

  fig_ax_cache: dict = {}

  writer = imageio.get_writer(output_path, fps=fps)
  try:
    step_idx = 0
    while True:
      # Collect observations and actions for all bots
      actions: List[int] = []
      for agent_index, player in enumerate(arena.players):
        if not player.alive:
          # Dead bots just stand still and don't shoot
          actions.append(0)
          continue
        obs = SelfPlayArena._build_obs_for_agent(
          arena.players, arena.walls, agent_index
        )
        action, _ = model.predict(obs, deterministic=True)
        actions.append(int(action))

      done = arena.step(actions)

      frame = render_frame(arena, step_idx, fig_ax_cache)
      writer.append_data(frame)

      step_idx += 1
      if done:
        break
  finally:
    writer.close()

  print(f"Saved self-play video to {output_path}")


def _parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(
    description="Run a self-play battle between PPO bots and save a video."
  )
  parser.add_argument(
    "--model",
    type=str,
    default="bot_policy.zip",
    help="Path to trained PPO model (bot_policy.zip from train_bots.py).",
  )
  parser.add_argument(
    "--out",
    type=str,
    default="bot_battle.mp4",
    help="Output video path (e.g. bot_battle.mp4 or bot_battle.gif).",
  )
  parser.add_argument(
    "--num-bots",
    type=int,
    default=2,
    help="Number of bots (2–5) that share the same policy.",
  )
  parser.add_argument(
    "--max-steps",
    type=int,
    default=600,
    help="Maximum number of simulation steps.",
  )
  parser.add_argument(
    "--weapon",
    type=str,
    default=None,
    choices=[None, "pistol", "autoRifle", "miniGun", "sniper"],
    help="If set, force all bots to use this weapon. Default: random per bot.",
  )
  parser.add_argument(
    "--fps",
    type=int,
    default=20,
    help="Frames per second for output video.",
  )
  return parser.parse_args()


def main() -> None:
  args = _parse_args()

  weapon = args.weapon
  # argparse passes None as string if choices include None; handle that.
  if isinstance(weapon, str) and weapon.lower() == "none":
    weapon = None

  run_battle_video(
    model_path=args.model,
    output_path=args.out,
    num_bots=args.num_bots,
    max_steps=args.max_steps,
    weapon=weapon,
    fps=args.fps,
  )


if __name__ == "__main__":
  main()
