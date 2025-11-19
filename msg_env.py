from dataclasses import dataclass

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
