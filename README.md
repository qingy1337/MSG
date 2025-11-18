# MSG

## Bot training (Python RL)

You can train shooter bots in a Python environment that approximates the server game logic, then later export/use the policy for server-side inference.

Prereqs on your training machine:

- `python -m pip install "gym==0.26.2" "stable-baselines3[extra]" torch`

Train a PPO policy:

```bash
python train_bots.py
```

This will produce `bot_policy.zip` in the repo root.

## Bot self-play video demo

You can visualize trained bots fighting each other in the same style arena and generate a video.

Install extra deps:

```bash
python -m pip install matplotlib "imageio[ffmpeg]"
```

Run a self-play battle and save a video:

```bash
python demo_self_play_video.py --model bot_policy.zip --out bot_battle.mp4
```

Useful flags:

- `--num-bots` (default `2`, allowed `2–5`)
- `--max-steps` (default `600`)
- `--weapon` (`pistol|autoRifle|miniGun|sniper`, default random per bot)
- `--fps` (default `20`)
