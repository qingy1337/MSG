# Blocks

## 3D arena

Run `npm install` and `npm start`, then open `http://localhost:3001`.
Sign in to reach the command deck. The authenticated username is also the in-game
name; there is no separate display-name prompt. The home screen shows the saved
primary loadout (with the pistol as its fixed secondary), the Armory, PvP and
Endless PvE launch choices, and live fireteams waiting for either mode.
Creating a fireteam makes that player its leader. Other players can join from the
browser, and only the leader can launch. Each fireteam owns an isolated server
simulation and Socket.IO room, so multiple PvP and PvE matches can run in parallel
without sharing players, projectiles, floor state, or lifecycle events.
Click the arena to capture the mouse. Move with WASD / arrow keys relative to your
view, look with the mouse, and click to fire (hold for automatic weapons).
Press Escape to release the mouse and access the reflection setting.
Press Space to jump (release before jumping again). Jumping follows gravity, with
server-tracked height for hit detection. PvE ramps lead onto elevated structures;
you can jump from platforms and fall back to the ground.
Movement speed and mouse sensitivity are tuned in `public/movement.js`.

PvP keeps its seeded 1800 × 1200 procedural scatter arena, including
scattered walls, landmarks, ramps, and a ceiling. Players spawn separately across
the arena and remain free-for-all, without regeneration or elevator progression.
Enable **Co-op PvE** for an endless sequence of seeded 1800 × 1200 indoor floors
(the same area as PvP). Open-ended, unequal architectural fragments and scattered
walls form irregular spaces around a column atrium, turbine hall, or freight depot.
Fragment count, shape, height, orientation, and position vary by seed, as do the
landmark's position and orientation. There is no fixed room graph, central hall,
room-label grid, or map-wide reserved street aisle. One to four substantial corner
cutouts produce asymmetric L-like, stepped, and cross-like playable outlines;
the minimap masks unused space and preserves room proportions. Bounds vary between
1800 × 1200, 2400 × 1200, 1800 × 1800, and 1800 × 2100. Cutouts block movement,
bot navigation, and shots. The generator chooses flat machinery courts, paired
terraces around a lower court, bridged terraces, freestanding overlooks, or an
upper district. It excludes the previous two compositions during a run. Wing
widths, depths, bridge spans, orientation, cover and wall density vary within
compositions. Not every floor has stairs or a cargo lift.
Overlook variants retain the workshop and upper yard (14 × 14, 20 × 18, or
26 × 22 rendered metres), furnished with elevated cover. District floors use a
60 × 22.5 metre upper district: 25% of the smallest map, touching two
outer walls in a north or south corner. It has two front-facing stair entrances,
a cargo lift, three upstairs bot spawn slots, machinery, and multiple cover positions.
The smaller freestanding variants keep their opposing stair entrances.
Actual stair risers and glass/metal safety railings connect each upper area to the
lower floor. Walking uses smooth slope collision; shots still hit the visible
individual treads. Landing transitions no longer trigger a brief fall, and bot
navigation accounts for body clearance on the top approach. Platform height
varies between 2.8, 3.2, and 3.8 metres, with clearance for jumping beneath the ceiling.
Taller variants have longer stairs. Placement can fall back to a smaller assembly
when the irregular outline cannot safely fit the large one. On 60% of non-district raised floors,
the first three bots spawn as a squad on the permanent upper deck; the others
remain downstairs. Spawn height is server-owned.
A ribbed cargo lift, marked **L** on the minimap, is an alternate route: it waits
3 seconds downstairs, rises smoothly for 4 seconds, waits 3 seconds upstairs, and
descends for 4 seconds. Walk aboard and off yourself. Shared server-clock physics
carries stationary riders and handles jumping and partial-footprint boarding;
the enclosed base prevents walking underneath the descending platform.
Bots navigate the permanent stairs rather than depend on the lift's timing.
PvE lighting follows those structures: warm overhead workspace lights, cool stair
approaches, softly contrasting passage lights, and a mint-lit elevator approach.
A readable ambient fill remains; up to six shadow-casting spotlights replace the
uniform ceiling-lamp grid. The custom ground shader receives matching occluded
light pools. Fixtures avoid ceiling-height walls and their shadow resources are
disposed when floors change. PvP keeps its original lighting.
Each PvE pocket, upper deck, staircase, and elevator also gets a seeded baseline
brightness between 50% and 100% of the previous ambient fill. Spatial blending
softens transitions over two metres; the ground, walls, props, and characters
share the same zones. Direct lamps and emissive details keep their brightness.
Themed trim provides landmarks for orientation. Floors retain their ceiling and
mix ceiling-height partitions with lower cover. Bridges have separate upper and
lower navigation nodes; underside headroom also limits jumping. Collision and hitscan account for actual stair treads, elevated
furniture bottoms, sloping guards, and moving platform heights.
Assemblies have non-intersecting 3D volumes (upper furniture rests on decks);
placement is accepted only if a
body-clearance-aware ground flood fill remains connected. A second validation pass
checks routes to every raised deck and upstairs spawn using the shared movement
graph, with lifts unavailable. Invalid vertical layouts are retried with a bounded
flat fallback. Spawn spaces, openings, and stair/lift landings stay clear.
PvE has separate arrival and exit cabins on opposite sides; PvP omits both.
All humans are teal teammates versus orange bot squads, with no friendly fire.
Living humans regenerate 5 HP/second, capped at 100. Squads spawn together and
initially mill around nearby. Detection requires a clear line of sight within a
120-degree field of view and 650 map units. Squad reports contain only copied
sightings, never live hidden positions. After losing sight, bots investigate the
last seen position, briefly search, then resume wandering; memories expire after
10 seconds. Movement eases in/out, with slower idle patrols and continuous
render-smoothed footsteps, arm motion, and body sway.
Leave the arrival cabin (**A** on the minimap), cross the room, and eliminate every
bot to open the opposite exit (**E**). A shared collider keeps it locked during
combat and its 1.2-second opening animation. Bring all
surviving humans fully inside to depart automatically. Doors close for 1.2 seconds,
the cabin rises with eased acceleration/deceleration for 3.6 seconds, then the next
floor loads behind closed doors before the arrival doors open for 1.2 seconds.
Cabin-local passenger positions and viewing angles are preserved across the hidden
transfer, including the cabins' opposite orientation. Mouse look and predicted
walking remain available while closing, travelling and opening; cabin-local
collision keeps riders inside. Jumping, shooting and grenades remain disabled
during travel. Cabin surfaces use fixed local shading, with a consistent overhead
fill for passengers behind closed doors, independent of each floor's lighting.
If departure stalls, shoot the amber button on the exit cabin's rear wall to
start closing immediately. The server requires a real unobstructed hit, every
living human aboard, and no surviving bots; the override cannot skip combat or
leave a living teammate behind. It can bypass the normal departure timer.
Survivors keep their health (including ongoing regeneration); eliminated players
spectate until the survivors reach the next floor, then respawn in its arrival cabin
with 100 HP and their existing equipment. A team wipe still ends the run.
Each floor adds one enemy (up to 24), 4 soldier HP (up to 160),
and 2.5% movement speed (up to +30%). From floor 5, one wave slot becomes a
360-HP Ogre; another Ogre joins every three floors, capped at four. Ogres are
large, slower armored mutants with hunched shoulders, oversized fists, asymmetric
metal armor, and recessed faces. A faceted purple chest crystal powers their laser,
brightening as they lean back and spread their arms; slams use a raised-fist wind-up
and crouched impact pose.
A thin purple aiming line warns of a 1.5-second laser charge, then a tracking
four-second beam deals 15 HP/second (60 total before regeneration). Both the
warning and beam follow the original target horizontally and vertically at up to
52 degrees/second; tracking pauses behind cover. Sidestep or take cover.
At close range, a one-second radius warning precedes a single
50-damage ground slam with an accelerating two-fist impact, three expanding
shockwave rings, and debris. Grounded victims are pushed outward over 450 ms
(up to 3.6 rendered metres), stopping at walls; server authority and client
prediction share the same decaying push. Leave the circle, jump, or get behind cover.
Engaged Ogres prioritize visible humans within the 105-unit slam radius, even when
aiming at someone else, interrupting laser charge/fire or bypassing laser recovery.
Slams retain their full one-second warning and have a one-second recovery after
the impact animation (2.9 seconds between starts). Lasers retain a 2.5-second
recovery. Attacks use server-owned collision/damage and cannot hit allies.
Ogre spawns validate their larger body clearance; overhead bars use max health.
Losing every human ends the run in defeat.
Bots keep their forgiving reaction delay, burst pauses, and inaccurate aim.

PvE navigation runs in a worker thread, not the networking/simulation thread.
Each floor/body profile caches its grid and directed movement connections, using
a spatial collision index and heap-based A*. Route smoothing has bounded lookahead.
At most two path requests are in flight; replanning is staggered and bots follow
their current route while waiting. Old-floor results are discarded, and workers
are terminated when the game resets or the server closes. Moving lifts remain
excluded from bot routes; permanent stairs and larger Ogre clearance are respected.
The server sends at most one compact state snapshot per 50 ms tick, excluding AI
paths, private memory, and account identifiers. Combat events remain immediate;
state snapshots may be dropped under backpressure instead of queued indefinitely.
Remote actors use a bounded 75 ms interpolation buffer, with no extrapolation
through walls; local input prediction is not delayed. Buffers reset on floor changes.
Local movement uses sequenced direction/duration inputs rather than absolute
positions. Snapshots acknowledge the last processed command; clients rebase to
the authoritative position and replay only unacknowledged inputs with shared
collision/jump logic. This replaces the fixed 30-unit reconciliation threshold
that caused remote players to rubber-band at higher RTT. Knockback and elevator
transitions invalidate old movement through an epoch marker. Server input duration,
batch size, and movement-time budgets are bounded; duplicate inputs are ignored.
Jump commands carry an identity so reconciliation preserves the elapsed phase of
the same predicted jump instead of resetting its clock on each snapshot. Changed
ground/ceiling constraints and knockback still take precedence. Lift riders are
aligned to the current platform sample before input replay, avoiding false falls
when a delayed rider snapshot meets the platform's newer collider.
Jump takeoff clears the rider attachment immediately. Landing support tracks the
actual lift beneath the player's feet and reattaches on contact, rather than
waiting for a later height match that a moving platform can miss. Leaving the
platform clears that support so subsequent ground landings cannot reattach remotely.
The headless prediction tests simulate 0–500 ms RTT, jitter, dropped snapshots,
direction changes, and walls. Restart the server and refresh all clients together
when updating the movement protocol.
Run `npm run test:performance` for navigation/network/interpolation regressions,
`npm run benchmark:bots` for 4/12/24-bot pursuit loads, and
`npm run benchmark:bots -- --ogres` for a 24-enemy wave with four attacking Ogres.
These are headless local simulation/payload measurements, not real network RTT or
browser rendering benchmarks. The Ogre benchmark restores target health each tick
so the test lasts the full six seconds, and rejects runs that end early.
Client rendering starts at 1× pixel density and adapts between 0.65× and 1.25×
under sustained frame load (capped by device pixel density). Shadow maps update at
20 Hz rather than every display frame; health-label occlusion checks are cached
for 120–150 ms and skipped offscreen. Lighting and gameplay are unchanged.
The performance readout separates measured client FPS, application round-trip
ping, server tick processing time, and the current resolution scale. Ping probes
run every two seconds with a timeout; these readings diagnose client GPU/CPU
load separately from network delay and server stalls.

The first-person 3D renderer adds a held weapon, crosshair, beveled panel walls, armored animated characters,
overhead health bars, and a top-left minimap containing walls and only your position.
Hitscan follows horizontal and vertical aim and is resolved on the server for humans
and bots, stopping at the first wall, floor, or character. Enemy health labels are
hidden behind cover. After elimination, the camera follows a surviving character.

Deaths use three directional collapse variations, stronger shotgun/grenade throws,
and non-blocking corpses that dissolve after 8–12 seconds. Ogres kneel and crash
down as their crystal cracks, flickers and goes dark, with nearby camera shake,
dust and armor fragments. Explosive kills leave scorch marks. Effects are local,
with no ragdoll simulation or corpse updates over the network: at most 12 bodies
and 20 sets of remains, cleared on floor changes. Corpse displacement stops at
cover and keeps the correct supporting floor, including cargo lifts.
In PvE, soldiers have a 22% chance to drop a grenade; Ogres always drop one.
Walk near it to collect after the collapse (1.8 seconds); inventory caps at three.
Drops expire after 25 seconds, are capped at 16, and cannot be collected through
cover or from another elevation. The server owns drops and collection, broadcasting
them in existing snapshots. Guns still have unlimited reserve ammunition.

The shotgun is a selectable semi-automatic pump gun with a free Field Pump skin and a
polished, minimal Silverline skin available in the shop.

Grenades: tap Q for a short toss, or hold up to 1.2 seconds and release for a
longer throw. The server simulates wall/ground bounces and a three-second fuse
starting on release. Throws have about 22% more launch speed (110–510 units/sec).
Blasts deal up to 120 damage, with quadratic falloff to zero
at 150 units from the target's body; cover blocks damage. They only hurt enemies.
Everyone starts with three; PvE refills them on every new floor, PvP does not.
Three bottom-left grenade icons show inventory (lit or faded); a slightly translucent
vertical bar left of the crosshair fills upward while charging a throw.
Explosions use a sharp flash, layered fireball, fast shock ring, debris and
soft procedural smoke that rises and fades over 2.8 seconds. At most six blast
effects coexist, without shadow-casting lights. Each throw reliably announces its
spawn to every client; motion stays in replaceable game snapshots, and explosions
are reliable. Missing a motion packet no longer means missing the grenade spawn.
Each trigger pull fires eight server-owned hitscan pellets. Two shots can fire
180 ms apart, followed by an automatic 1.4-second reload. The HUD shows remaining
shots and the reload countdown; ammo and reload timing are server-owned. Damage is
up to 12 damage per pellet (96 total), falling to 2 at 400 arena units and a
minimum of 1 beyond that. Spread also reduces distant hit counts. Every pellet
checks walls, elevation, and friendly-fire rules independently. Both held models
include a walnut pump/stock, magazine tube, barrel and sights; the pump cycles
after firing, with a single recoil/muzzle flash and eight pellet tracers.

Rendering requires WebGL 2. A custom floor shader traces rays against wall volumes
for one-bounce reflections and hard wall shadows, alongside conventional dynamic
shadow maps and physically based materials. This is hybrid rendering, not full-scene
path tracing: characters and fine wall details are not included in reflections.
The reflections checkbox enables that optional pass. Assets are served
locally, including Three.js; no CDN is needed during play.

Checks: `npm test` runs Node tests for combat, PvE rules, 100 seeded layouts,
terrain traversal, elevator timing and multi-floor transitions, and procedural
models, without launching Chrome or touching saved user data.

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
