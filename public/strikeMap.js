// The Red Vault is a fixed, authored Strike.  Arena coordinates are horizontal
// centimetre-ish units (the renderer uses 0.05 m per unit); vertical values are
// metres.  Nothing in this file is generated at runtime: every route, opening,
// encounter sightline and machine service space is deliberate.

const RED_VAULT_ID = 'red-vault';

function createRedVaultMap() {
  const walls = [];
  const terrain = [];
  const architecture = {
    columns: [], beams: [], rails: [], pipes: [], lights: [], signs: [],
    conveyors: [], machines: [], rampAssemblies: [], distantMassing: [],
  };
  const collisionById = new Map();
  const assetCollision = [];

  const remember = solid => {
    if (!solid.id) throw new Error('Every Red Vault solid needs an id');
    if (collisionById.has(solid.id)) throw new Error(`Duplicate Red Vault solid ${solid.id}`);
    collisionById.set(solid.id, solid);
    return solid;
  };
  const wall = (id, x, y, width, height, bottom, top, extra = {}) => {
    const solid = remember({ id, kind: extra.kind || 'wall', x, y, width, height,
      bottom, top, sectorId: extra.sectorId, ...extra });
    walls.push(solid); return solid;
  };
  const floor = (id, x, y, width, height, top, sectorId, extra = {}) => {
    const solid = remember({ id, kind: extra.kind || 'deck', x, y, width, height,
      bottom: top - (extra.thickness || .55), top, walkable: true, platform: true,
      sectorId, ...extra });
    terrain.push(solid); return solid;
  };
  const roof = (id, x, y, width, height, bottom, sectorId, extra = {}) => {
    const solid = remember({ id, kind: 'ceilingPanel', x, y, width, height,
      bottom, top: bottom + (extra.thickness || .6), sectorId, ...extra });
    terrain.push(solid); return solid;
  };
  const ramp = (id, x, y, width, height, bottom, top, axis, sectorId, extra = {}) => {
    // Red Vault inclines are structural bridge/stair assemblies, not a
    // zero-thickness plane.  `structureDepth` is shared by rendering,
    // movement and hitscan so the visible underside is a real surface rather
    // than cosmetic metal that bodies and bullets can clip through.
    const structureDepth = extra.structureDepth ?? .72;
    const solid = remember({ id, kind: 'ramp', x, y, width, height, bottom, top,
      axis, reverse: !!extra.reverse, stairs: false, walkable: true, platform: true,
      structureDepth, sectorId, industrial: extra.industrial || 'grated', ...extra });
    terrain.push(solid);
    architecture.rampAssemblies.push({ id: `${id}-assembly`, rampId: id,
      style: solid.industrial, structureDepth, collisionIds: [id] });
    assetCollision.push({ assetId: `${id}-assembly`, intent: 'surface', colliderIds: [id] });
    return solid;
  };
  const circle = (id, cx, cy, radius, bottom, top, sectorId, extra = {}) =>
    wall(id, cx - radius, cy - radius, radius * 2, radius * 2, bottom, top,
      { collisionShape: 'circle', collisionRadius: radius, sectorId, ...extra });
  const capsule = (id, ax, ay, bx, by, radius, bottom, top, sectorId, extra = {}) => {
    const minX = Math.min(ax, bx) - radius, minY = Math.min(ay, by) - radius;
    return wall(id, minX, minY, Math.abs(bx - ax) + radius * 2,
      Math.abs(by - ay) + radius * 2, bottom, top, {
        collisionShape: 'capsule', collisionRadius: radius,
        collisionA: { x: ax, y: ay }, collisionB: { x: bx, y: by }, sectorId, ...extra,
      });
  };
  const column = (id, x, y, radius, bottom, top, sectorId, style = 'girder') => {
    circle(id, x, y, radius, bottom, top, sectorId, { kind: 'column' });
    architecture.columns.push({ id, x, y, radius, bottom, top, style, collisionIds: [id] });
  };
  const beam = (id, ax, ay, bx, by, bottom, top, sectorId, style = 'truss', collision = false) => {
    architecture.beams.push({ id, ax, ay, bx, by, bottom, top, style,
      collisionIds: collision ? [id] : [], nonSolidReason: collision ? undefined : 'overhead structural member' });
    if (collision) capsule(id, ax, ay, bx, by, 10, bottom, top, sectorId, { kind: 'beam' });
  };
  const rail = (id, x, y, width, height, bottom, sectorId, extra = {}) => {
    const solid = wall(id, x, y, width, height, bottom, bottom + 1.15,
      { kind: 'rail', sectorId, collisionEndInset: 2, ...extra });
    architecture.rails.push({ id, x, y, width, height, bottom, top: bottom + 1.15,
      axis: extra.axis, rise: extra.rise, reverse: !!extra.reverse,
      style: extra.style || 'foundry', collisionIds: [id] });
    return solid;
  };
  const pipe = (id, ax, ay, bx, by, radius, bottom, top, sectorId, extra = {}) => {
    architecture.pipes.push({ id, ax, ay, bx, by, radius, bottom, top,
      color: extra.color, collisionIds: extra.nonSolid ? [] : [id],
      nonSolidReason: extra.nonSolid ? (extra.nonSolidReason || 'overhead pipe') : undefined });
    if (!extra.nonSolid) capsule(id, ax, ay, bx, by, radius, bottom, top, sectorId, { kind: 'pipe' });
  };
  const bind = (assetId, intent, colliderIds = [], nonSolidReason) =>
    assetCollision.push({ assetId, intent, colliderIds, ...(nonSolidReason ? { nonSolidReason } : {}) });
  const interaction = (id, x, y, height, normalAngle, label) => ({
    id, x, y, height, normalAngle, label, holdMs: 2000, range: 110,
    yawTolerance: .42, pitchTolerance: .38,
  });

  // -----------------------------------------------------------------------
  // DISTRICT 1 — FREIGHT INTAKE / RECEIVING APRON (0 m)
  // A compressed personnel lock releases into a tall freight hall.  The
  // offset loading bays and crane rails make the building read as logistics,
  // not as a rectangular combat arena.
  // -----------------------------------------------------------------------
  floor('freight-apron-floor', 150, 1210, 610, 520, 0, 'freight');
  floor('freight-sort-floor', 700, 1320, 190, 300, 0, 'freight');
  roof('freight-apron-roof', 130, 1190, 650, 560, 14, 'freight');
  roof('freight-sort-roof', 690, 1300, 220, 340, 9, 'freight');
  // Entrance airlock and outer shell, segmented around actual doors.
  wall('freight-west-a', 120, 1190, 34, 155, 0, 14, { sectorId: 'freight' });
  // Both receiving-bay apertures are behind the insertion point. They used
  // to expose the simulation's implicit height-zero plane outside the shell,
  // so a player could simply walk out of the authored building.
  wall('freight-entry-bulkhead', 120, 1345, 34, 110, 0, 14, { sectorId: 'freight' });
  wall('freight-west-b', 120, 1455, 34, 295, 0, 14, { sectorId: 'freight' });
  wall('freight-north', 120, 1190, 660, 34, 0, 14, { sectorId: 'freight' });
  wall('freight-south-a', 120, 1716, 245, 34, 0, 14, { sectorId: 'freight' });
  wall('freight-loading-bulkhead', 365, 1716, 110, 34, 0, 14, { sectorId: 'freight' });
  wall('freight-south-b', 475, 1716, 305, 34, 0, 14, { sectorId: 'freight' });
  wall('freight-east-a', 746, 1190, 34, 180, 0, 14, { sectorId: 'freight' });
  wall('freight-east-b', 746, 1580, 34, 170, 0, 14, { sectorId: 'freight' });
  wall('sort-north', 746, 1300, 164, 24, 0, 9, { sectorId: 'freight' });
  wall('sort-south', 746, 1616, 164, 24, 0, 9, { sectorId: 'freight' });
  wall('sort-east-a', 886, 1300, 24, 105, 0, 9, { sectorId: 'freight' });
  wall('sort-east-b', 886, 1535, 24, 105, 0, 9, { sectorId: 'freight' });
  // Blast shutter opens after the first encounter; the 130-unit aperture is
  // wider than a full player capsule with generous lateral clearance.
  wall('freight-shutter', 886, 1405, 24, 130, 0, 8.7,
    { kind: 'strikeDoor', dynamicId: 'freight-shutter', sectorId: 'freight' });

  for (const [i, x] of [225, 505, 720].entries()) {
    column(`freight-column-n-${i}`, x, 1260, 16, 0, 13.8, 'freight', 'riveted');
    column(`freight-column-s-${i}`, x, 1680, 16, 0, 13.8, 'freight', 'riveted');
  }
  beam('freight-crane-rail-n', 210, 1280, 720, 1280, 10.7, 11.2, 'freight', 'crane-rail');
  beam('freight-crane-rail-s', 210, 1660, 720, 1660, 10.7, 11.2, 'freight', 'crane-rail');
  architecture.machines.push({ id: 'freight-overhead-crane', type: 'overheadCrane',
    x: 420, y: 1470, span: 390, bottom: 10.5, top: 13.2,
    travel: { axis: 'x', min: 260, max: 660, period: 18000 },
    collisionIds: [], nonSolidReason: 'crane remains more than eight metres above players' });
  bind('freight-overhead-crane', 'decorative', [], 'animated overhead machinery outside body clearance');
  // Cargo is arranged as authored cover clusters, with real individual
  // footprints instead of one broad invisible box.
  const freightCargo = [
    ['cargo-a', 260, 1330, 86, 54, 0, 2.2], ['cargo-b', 350, 1350, 58, 82, 0, 1.4],
    ['cargo-c', 570, 1540, 105, 52, 0, 2.8], ['cargo-d', 620, 1360, 54, 78, 0, 1.8],
    ['cargo-e', 310, 1590, 74, 48, 0, 1.1],
  ];
  for (const c of freightCargo) wall(c[0], c[1], c[2], c[3], c[4], c[5], c[6],
    { kind: 'cargo', sectorId: 'freight' });
  architecture.machines.push({ id: 'freight-cargo-clusters', type: 'cargoCluster',
    pieces: freightCargo.map(c => ({ id: c[0] })), collisionIds: freightCargo.map(c => c[0]) });
  bind('freight-cargo-clusters', 'solid', freightCargo.map(c => c[0]));
  architecture.signs.push({ id: 'freight-sign', x: 155, y: 1270, bottom: 4.2,
    facing: 'east', text: 'RECEIVING / 07', color: '#ef3349' });
  architecture.lights.push({ id: 'freight-light', x: 450, y: 1470, height: 12.8,
    color: '#ffd8b3', intensity: 2.2, radius: 430 });

  // Compression ramp: container-scale walls hide the Assembly Canyon until
  // the final third of the climb.
  ramp('intake-to-assembly', 890, 1410, 250, 120, 0, 6, 'x', 'assembly-lower',
    { industrial: 'freight-ramp' });
  wall('intake-ramp-north', 870, 1375, 290, 24, 0, 9, { sectorId: 'assembly-lower' });
  wall('intake-ramp-south', 870, 1541, 290, 24, 0, 9, { sectorId: 'assembly-lower' });

  // -----------------------------------------------------------------------
  // DISTRICT 2 — WEAPON ASSEMBLY CANYON (6 m lower / 12 m gantry)
  // -----------------------------------------------------------------------
  floor('assembly-lower-floor', 1140, 1010, 730, 650, 6, 'assembly-lower');
  // The lower slab now reaches the inside face of the north shell. The old
  // 56-unit void strip was wide enough for a capsule to fall between a wall
  // that looked continuous and the rendered floor.
  floor('assembly-lower-north-sill', 1110, 954, 766, 56, 6, 'assembly-lower');
  roof('assembly-roof', 1070, 900, 860, 800, 32, 'assembly-upper');
  wall('assembly-south', 1080, 1648, 830, 34, 0, 32, { sectorId: 'assembly-lower' });
  wall('assembly-east-a', 1876, 950, 34, 310, 0, 32, { sectorId: 'assembly-lower' });
  wall('assembly-east-switchback-shell', 1876, 1260, 34, 190, 0, 32,
    { sectorId: 'assembly-lower' });
  wall('assembly-east-b', 1876, 1450, 34, 232, 0, 32, { sectorId: 'assembly-lower' });
  // The transfer gallery meets the upper gantry through the 100-unit opening
  // at its north end. The old unbroken shell sealed this opening, leaving the
  // assembly shutter open in a corridor the fireteam could never enter.
  wall('assembly-west-a', 1076, 1050, 34, 230, 0, 32, { sectorId: 'assembly-lower' });
  wall('assembly-west-mid', 1076, 1280, 34, 130, 0, 32, { sectorId: 'assembly-lower' });
  wall('assembly-west-b', 1076, 1530, 34, 152, 0, 32, { sectorId: 'assembly-lower' });
  wall('assembly-north-a', 1076, 920, 124, 34, 0, 32, { sectorId: 'assembly-upper' });
  wall('assembly-north-under-shaft', 1200, 920, 156, 34, 0, 18,
    { sectorId: 'assembly-upper' });
  wall('assembly-north-mid-under-shaft', 1356, 920, 184, 34, 0, 18,
    { sectorId: 'assembly-upper' });
  // The assembly shell continues below the forge shaft. Its 18 m cap blocks
  // the 12 m assembly layer while leaving the 20 m shaft service route real.
  wall('assembly-north-b', 1540, 920, 370, 34, 0, 18, { sectorId: 'assembly-upper' });
  // Lower conveyor lines are genuine composed machinery with capsule-safe
  // lanes around and between them.
  const conveyorDefs = [
    // Keep the authoritative top on the moving slats.  These used to be
    // 1.35 m colliders around a visually 0.88 m-high machine, which created
    // an invisible half-metre wall and put the cap above the jump apex.
    { id: 'assembly-conveyor-west', x: 1230, y: 1170, width: 105, height: 360, bottom: 6, top: 6.88 },
    { id: 'assembly-conveyor-east', x: 1500, y: 1110, width: 105, height: 390, bottom: 6, top: 6.88 },
  ];
  for (const c of conveyorDefs) {
    wall(c.id, c.x, c.y, c.width, c.height, c.bottom, c.top,
      { kind: 'conveyor', sectorId: 'assembly-lower' });
    architecture.conveyors.push({ ...c, direction: c.id.endsWith('west') ? 1 : -1,
      speed: c.id.endsWith('west') ? 1.1 : .82, collisionIds: [c.id] });
    bind(c.id, 'solid', [c.id]);
  }
  // Service plinths support the articulated arms; only the moving arms are
  // above body clearance and therefore intentionally non-solid.
  for (const [i, x, y, facing] of [
    [0, 1190, 1100, 1], [1, 1380, 1570, -1], [2, 1660, 1050, 1], [3, 1815, 1580, -1],
  ]) {
    circle(`assembly-arm-base-${i}`, x, y, 31, 6, 8.2, 'assembly-lower', { kind: 'machineBase' });
    architecture.machines.push({ id: `assembly-arm-${i}`, type: 'assemblyArm', x, y,
      bottom: 6, facing, phase: i * 1.7, collisionIds: [`assembly-arm-base-${i}`],
      nonSolidReason: 'anchored base is solid; articulated links are non-damaging overhead machinery' });
    bind(`assembly-arm-${i}`, 'solid', [`assembly-arm-base-${i}`],
      'articulated links are intentionally non-solid above the anchored base');
  }
  // Tall press frames define the canyon silhouette and stop fire accurately at
  // their legs; the open middle remains traversable and shootable.
  for (const [i, x] of [1160, 1430, 1720].entries()) {
    wall(`press-${i}-leg-n`, x, 1025, 26, 72, 6, 22, { kind: 'machineFrame', sectorId: 'assembly-lower' });
    wall(`press-${i}-leg-s`, x, 1575, 26, 72, 6, 22, { kind: 'machineFrame', sectorId: 'assembly-lower' });
    beam(`press-${i}-header`, x + 13, 1080, x + 13, 1590, 20.8, 22.2, 'assembly-lower', 'press-header');
    architecture.machines.push({ id: `assembly-press-${i}`, type: 'pressFrame', x,
      y: 1330, bottom: 6, top: 22, collisionIds: [`press-${i}-leg-n`, `press-${i}-leg-s`] });
    bind(`assembly-press-${i}`, 'solid', [`press-${i}-leg-n`, `press-${i}-leg-s`]);
  }
  // East switchback is the intentional ascent.  It ends at a broad landing,
  // never against a rail or wall cap.
  ramp('assembly-switchback', 1740, 1190, 110, 300, 6, 12, 'y', 'assembly-upper',
    { reverse: true, industrial: 'assembly-stair' });
  floor('assembly-east-landing', 1700, 1010, 170, 180, 12, 'assembly-upper');
  floor('assembly-upper-gantry', 1120, 950, 620, 105, 12, 'assembly-upper');
  floor('assembly-upper-overlook', 1080, 950, 120, 350, 12, 'assembly-upper');
  for (const [id, x, y, w, h] of [
    ['assembly-gantry-n', 1120, 938, 620, 10], ['assembly-gantry-s', 1200, 1057, 500, 10],
    ['assembly-overlook-w', 1068, 1050, 10, 250],
  ]) rail(id, x, y, w, h, 12, 'assembly-upper');
  rail('assembly-switchback-west-rail', 1736, 1190, 8, 300, 6, 'assembly-upper',
    { axis: 'y', rise: 6, reverse: true });
  rail('assembly-switchback-east-rail', 1846, 1190, 8, 300, 6, 'assembly-upper',
    { axis: 'y', rise: 6, reverse: true });
  rail('assembly-landing-west-rail', 1696, 1055, 8, 135, 12, 'assembly-upper');
  rail('assembly-landing-north-rail', 1740, 1006, 130, 8, 12, 'assembly-upper');
  rail('assembly-landing-south-west-rail', 1700, 1186, 40, 8, 12, 'assembly-upper');
  rail('assembly-landing-south-east-rail', 1850, 1186, 20, 8, 12, 'assembly-upper');
  rail('assembly-gantry-east-rail', 1736, 950, 8, 60, 12, 'assembly-upper');
  rail('assembly-overlook-east-rail', 1196, 1055, 8, 245, 12, 'assembly-upper');
  rail('assembly-overlook-south-rail', 1080, 1296, 120, 8, 12, 'assembly-upper');
  for (const [i, x] of [1140, 1390, 1680].entries()) column(`assembly-gantry-column-${i}`, x, 1010, 13, 6, 12,
    'assembly-upper', 'gantry');
  architecture.lights.push({ id: 'assembly-light-red', x: 1410, y: 1330, height: 27,
    color: '#ed233f', intensity: 3.1, radius: 560 });
  architecture.signs.push(
    { id: 'assembly-sign', x: 1111, y: 1590, bottom: 15,
      facing: 'east', text: 'ARMAMENT LINE / RED', color: '#ff304b' },
    { id: 'assembly-gantry-wayfinding', x: 1874, y: 1510, bottom: 9,
      facing: 'west', text: 'UPPER GANTRY  ↑', color: '#ffb15a' },
  );

  // Crooked transfer gallery between assembly and furnace; its corners block
  // the next reveal until the player commits to the upper route.
  floor('assembly-transfer-a', 930, 930, 230, 120, 12, 'assembly-upper');
  floor('assembly-transfer-b', 900, 780, 130, 250, 12, 'furnace');
  roof('assembly-transfer-roof-a', 910, 910, 260, 160, 18, 'assembly-upper');
  roof('assembly-transfer-roof-b', 880, 760, 170, 290, 18, 'furnace');
  // The north wall stops at the 100-unit turn throat; gallery B's east wall
  // stops at the same corner. Their overlap is wider than two player bodies.
  wall('transfer-a-n', 1030, 910, 140, 20, 12, 18, { sectorId: 'assembly-upper' });
  wall('transfer-a-s', 930, 1050, 150, 20, 12, 18, { sectorId: 'assembly-upper' });
  wall('transfer-b-w', 880, 760, 20, 290, 12, 18, { sectorId: 'furnace' });
  wall('transfer-b-e', 1030, 760, 20, 170, 12, 18, { sectorId: 'furnace' });
  rail('transfer-b-south-rail', 900, 1026, 30, 8, 12, 'furnace');
  wall('assembly-shutter', 1020, 930, 20, 120, 12, 17.8,
    { kind: 'strikeDoor', dynamicId: 'assembly-shutter', sectorId: 'assembly-upper' });

  // -----------------------------------------------------------------------
  // DISTRICT 3 — FURNACE / REFINERY (12 m / 20 m)
  // -----------------------------------------------------------------------
  floor('furnace-floor-west', 300, 350, 410, 620, 12, 'furnace');
  floor('furnace-floor-east', 810, 350, 380, 620, 12, 'furnace');
  floor('furnace-channel-bridge', 710, 780, 100, 105, 12, 'furnace');
  // The 100-unit gap between slabs is a true molten trench.  Its bottom is
  // visible at 5 m but isolated by curb collision so nobody falls into the
  // simulation's implicit ground plane.
  floor('furnace-trench-bed', 710, 350, 100, 620, 5, 'furnace', { nonPlayable: true });
  wall('furnace-curb-west-a', 696, 350, 14, 430, 12, 13.1, { sectorId: 'furnace' });
  wall('furnace-curb-west-b', 696, 885, 14, 85, 12, 13.1, { sectorId: 'furnace' });
  wall('furnace-curb-east-a', 810, 350, 14, 430, 12, 13.1, { sectorId: 'furnace' });
  wall('furnace-curb-east-b', 810, 885, 14, 85, 12, 13.1, { sectorId: 'furnace' });
  roof('furnace-roof', 260, 310, 970, 700, 30, 'furnace');
  wall('furnace-west', 260, 310, 34, 700, 0, 30, { sectorId: 'furnace' });
  wall('furnace-north', 260, 310, 970, 34, 0, 30, { sectorId: 'furnace' });
  wall('furnace-south-a', 260, 976, 610, 34, 0, 30, { sectorId: 'furnace' });
  // The crooked transfer gallery crosses above this portion of the furnace
  // shell.  It is a real load-bearing wall below the 12 m gallery, not an
  // invisible full-height wall through the playable passage.
  wall('furnace-south-b', 1030, 976, 200, 34, 0, 11.4, { sectorId: 'furnace' });
  wall('furnace-east-a', 1196, 310, 34, 270, 0, 30, { sectorId: 'furnace' });
  // The refinery door is eight metres above the furnace floor.  Its old
  // full-height aperture was consequently an unguarded drop out of the 12 m
  // room.  A structural sill seals the lower layer while preserving the
  // elevated 20 m doorway.
  wall('furnace-east-under-refinery', 1196, 580, 34, 140, 0, 19.35,
    { sectorId: 'furnace' });
  wall('furnace-east-b', 1196, 720, 34, 200, 0, 30, { sectorId: 'furnace' });
  wall('furnace-east-b-under-transfer', 1196, 920, 34, 90, 0, 11.4,
    { sectorId: 'furnace' });
  const furnaces = [
    ['furnace-stack-a', 390, 610, 72], ['furnace-stack-b', 430, 790, 64],
    ['furnace-stack-c', 1040, 470, 70], ['furnace-stack-d', 1030, 790, 66],
  ];
  for (const [id, x, y, r] of furnaces) {
    circle(id, x, y, r, 12, 27, 'furnace', { kind: 'furnace' });
    architecture.machines.push({ id, type: 'furnaceStack', x, y, radius: r,
      bottom: 12, top: 27, collisionIds: [id] }); bind(id, 'solid', [id]);
  }
  architecture.machines.push({ id: 'molten-trench', type: 'moltenChannel', x: 710, y: 350,
    width: 100, height: 620, bottom: 5.03, top: 5.08, collisionIds: [],
    nonSolidReason: 'recessed behind continuous physical curbs' });
  bind('molten-trench', 'decorative', [], 'recessed hazard surface isolated by curbs');
  // The bridge is the sole trench crossing.  Side rails make its two exposed
  // edges explicit instead of allowing the implicit height-zero plane to
  // catch a player who walks off the visible grating.
  rail('furnace-bridge-north-rail', 710, 776, 100, 8, 12, 'furnace');
  rail('furnace-bridge-south-rail', 710, 881, 100, 8, 12, 'furnace');
  const pressureVents=[{ id:'furnace-vent-plinth-west',x:600,y:620 },
    { id:'furnace-vent-plinth-east',x:920,y:660 }];
  for(const vent of pressureVents) {
    circle(`${vent.id}-base`,vent.x,vent.y,18.4,12,12.8,'furnace',{kind:'machineBase'});
    circle(`${vent.id}-throat`,vent.x,vent.y,12.4,12.8,13.22,'furnace',{kind:'machineBase'});
  }
  const pressureCollisionIds=pressureVents.flatMap(vent=>[`${vent.id}-base`,`${vent.id}-throat`]);
  architecture.machines.push({ id: 'furnace-pressure-cycle', type: 'pressureVents',
    vents: pressureVents.map(({x,y})=>({x,y})), bottom: 12,
    collisionIds: pressureCollisionIds,
    nonSolidReason: 'solid nozzle plinths; transient jets use authoritative hazard volumes' });
  bind('furnace-pressure-cycle','solid',pressureCollisionIds,
    'solid nozzle plinths; transient jets use authoritative hazard volumes');
  architecture.lights.push({ id: 'furnace-light', x: 750, y: 640, height: 22,
    color: '#ff491f', intensity: 4.6, radius: 520 });
  // Refinery ascent and upper service deck.  The ramp reverses the route back
  // east, producing the first large spatial fold.
  ramp('refinery-ascent', 350, 390, 290, 120, 12, 20, 'x', 'refinery',
    { industrial: 'refinery-stair' });
  floor('refinery-west-landing', 640, 360, 150, 180, 20, 'refinery');
  floor('refinery-service-deck', 640, 350, 560, 105, 20, 'refinery');
  floor('refinery-east-landing', 1110, 350, 160, 320, 20, 'refinery');
  // Start after the west landing; the old rail projected across that landing
  // and snagged the two centre lanes during the final ramp substeps.
  rail('refinery-deck-south', 790, 457, 310, 10, 20, 'refinery');
  rail('refinery-deck-north', 650, 338, 450, 10, 20, 'refinery');
  rail('refinery-ascent-north-rail', 350, 386, 290, 8, 12, 'refinery',
    { axis: 'x', rise: 8 });
  rail('refinery-ascent-south-rail', 350, 506, 290, 8, 12, 'refinery',
    { axis: 'x', rise: 8 });
  rail('refinery-west-landing-west-n', 636, 360, 8, 30, 20, 'refinery');
  rail('refinery-west-landing-west-s', 636, 510, 8, 30, 20, 'refinery');
  rail('refinery-west-landing-east', 786, 455, 8, 85, 20, 'refinery');
  rail('refinery-west-landing-south', 640, 536, 150, 8, 20, 'refinery');
  rail('refinery-service-west-north', 636, 350, 8, 40, 20, 'refinery');
  rail('refinery-east-landing-west', 1106, 455, 8, 215, 20, 'refinery');
  rail('refinery-east-landing-south', 1110, 666, 130, 8, 20, 'refinery');
  // A short sill carries the whole capsule through the shutter opening.  The
  // previous route relied on the two deck AABBs merely touching at the wall.
  floor('refinery-shaft-throat', 1196, 580, 74, 140, 20, 'refinery');
  // Keep the first structural post out of the refinery stair's upper landing.
  // Its old centre at (670,405) overlapped a full player capsule exiting the
  // ramp, turning the visible support into an unavoidable slalom pole.
  for (const [i, x, y] of [[0,750,525],[1,880,405],[2,1100,405]])
    column(`refinery-support-${i}`, x, y, 14, 12, 20, 'refinery', 'refinery');
  pipe('refinery-pipe-red', 650, 385, 1160, 385, 13, 23.5, 24.2, 'refinery',
    { nonSolid: true, color: '#b51f32' });
  pipe('refinery-pipe-low', 830, 520, 1080, 520, 18, 12, 13.15, 'furnace', { color: '#4d5961' });
  wall('refinery-shutter', 1196, 580, 34, 140, 20, 27,
    { kind: 'strikeDoor', dynamicId: 'refinery-shutter', sectorId: 'refinery' });

  // -----------------------------------------------------------------------
  // DISTRICT 4 — VERTICAL FORGE SHAFT (20 / 26 / 30 / 36 m)
  // -----------------------------------------------------------------------
  // Exact octagonal support.  The previous rectangular deck existed outside
  // the chamfered shell at all four corners, creating invisible walkable
  // ledges that ended in open world space.
  floor('shaft-base', 1235, 285, 704, 760, 20, 'shaft-base', {
    collisionShape: 'polygon',
    collisionPolygon: [
      { x: 1235, y: 420 }, { x: 1370, y: 285 }, { x: 1800, y: 285 },
      { x: 1939, y: 420 }, { x: 1939, y: 890 }, { x: 1800, y: 1045 },
      { x: 1370, y: 1045 }, { x: 1235, y: 890 },
    ],
  });
  roof('shaft-crown-roof', 1210, 260, 760, 800, 55, 'shaft-crown');
  // Stepped/octagonal shell: each chamfer is represented by short capsule
  // legs, avoiding one oversized rectangular collider around the shaft.
  // The shaft is carried by the 18–20 m transfer structure below it.  Its
  // shell deliberately begins at that transfer datum so it never becomes an
  // invisible wall through the lower assembly and furnace routes that fold
  // underneath the shaft in plan view.
  wall('shaft-west-a', 1210, 420, 34, 160, 18, 55, { sectorId: 'shaft-base' });
  wall('shaft-west-b', 1210, 720, 34, 170, 18, 55, { sectorId: 'shaft-base' });
  wall('shaft-east', 1930, 420, 34, 470, 18, 55, { sectorId: 'shaft-base' });
  wall('shaft-north', 1370, 260, 430, 34, 18, 55, { sectorId: 'shaft-crown' });
  wall('shaft-south', 1370, 1026, 430, 34, 18, 55, { sectorId: 'shaft-base' });
  capsule('shaft-chamfer-nw', 1235, 420, 1370, 285, 17, 18, 55, 'shaft-base', { kind: 'shaftWall' });
  // The crown bridge exits through the upper half of the north-east chamfer.
  // Keep the lower shaft airtight, but terminate the upper member before the
  // 110-unit bridge throat so the visible bridge is actually boardable.
  capsule('shaft-chamfer-ne-lower', 1800, 285, 1939, 420, 17, 18, 35.4,
    'shaft-base', { kind: 'shaftWall' });
  capsule('shaft-chamfer-ne-upper', 1800, 285, 1825, 310, 17, 35.4, 55,
    'shaft-crown', { kind: 'shaftWall' });
  capsule('shaft-chamfer-sw', 1235, 890, 1370, 1045, 17, 18, 55, 'shaft-base', { kind: 'shaftWall' });
  capsule('shaft-chamfer-se', 1800, 1045, 1939, 890, 17, 18, 55, 'shaft-base', { kind: 'shaftWall' });
  // The anchored rotor column is the solid part of this assembly. Its exact
  // 3.4 m visual radius remains solid through the shaft, while the wider
  // rotating cage is deliberately non-damaging machinery rather than one
  // oversized invisible cylinder around all of its open bays.
  circle('forge-rotor-base', 1600, 655, 68, 20, 49, 'shaft-base', { kind: 'machineBase' });
  architecture.machines.push({ id: 'forge-rotor', type: 'forgeRotor', x: 1600, y: 655,
    radius: 105, bottom: 20, top: 49, collisionIds: ['forge-rotor-base'],
    nonSolidReason: 'central column is exact-solid; the open rotating cage is non-damaging machinery' });
  bind('forge-rotor', 'solid', ['forge-rotor-base'],
    'central column is exact-solid; the open rotating cage is non-damaging machinery');
  // Permanent asymmetric maintenance ascent, designed as work platforms on
  // the actual shaft frame rather than a generic freestanding staircase.
  ramp('shaft-ramp-east', 1680, 700, 100, 270, 20, 26, 'y', 'shaft-mid',
    { reverse: true, industrial: 'shaft-ramp' });
  floor('shaft-east-service', 1680, 500, 220, 200, 26, 'shaft-mid');
  ramp('shaft-ramp-north', 1480, 400, 320, 100, 26, 30, 'x', 'shaft-mid',
    { reverse: true, industrial: 'shaft-ramp' });
  // A real turning landing joins the east service platform to the low end of
  // the north ramp.  Guarding that ramp end directly made the authored stair
  // technically safe but physically unboardable.
  floor('shaft-north-ramp-landing', 1800, 400, 100, 100, 26, 'shaft-mid');
  floor('shaft-west-service', 1280, 400, 200, 500, 30, 'shaft-mid');
  ramp('shaft-ramp-west', 1310, 400, 100, 300, 30, 36, 'y', 'shaft-crown',
    { reverse: true, industrial: 'shaft-ramp' });
  floor('shaft-crown-deck', 1255, 285, 660, 115, 36, 'shaft-crown', {
    collisionShape: 'polygon',
    collisionPolygon: [
      { x: 1370, y: 285 }, { x: 1800, y: 285 },
      { x: 1915, y: 400 }, { x: 1255, y: 400 },
    ],
  });
  floor('shaft-bridge-landing', 1800, 310, 130, 110, 36, 'shaft-crown');
  // Rails terminate before each landing throat.
  rail('shaft-ramp-east-west-rail', 1676, 700, 8, 270, 20, 'shaft-mid',
    { axis: 'y', rise: 6, reverse: true });
  rail('shaft-ramp-east-rail', 1776, 700, 8, 270, 20, 'shaft-mid',
    { axis: 'y', rise: 6, reverse: true });
  rail('shaft-east-service-north-rail', 1800, 496, 100, 8, 26, 'shaft-mid');
  rail('shaft-east-service-south-rail', 1780, 696, 120, 8, 26, 'shaft-mid');
  rail('shaft-east-service-west-rail', 1676, 500, 8, 200, 26, 'shaft-mid');
  rail('shaft-ramp-north-rail', 1480, 388, 320, 8, 26, 'shaft-mid',
    { axis: 'x', rise: 4, reverse: true });
  rail('shaft-ramp-north-south-rail', 1480, 496, 320, 8, 26, 'shaft-mid',
    { axis: 'x', rise: 4, reverse: true });
  rail('shaft-north-ramp-landing-north-rail', 1800, 396, 100, 8, 26, 'shaft-mid');
  rail('shaft-north-ramp-landing-east-rail', 1896, 400, 8, 100, 26, 'shaft-mid');
  rail('shaft-west-service-west-rail', 1268, 400, 8, 500, 30, 'shaft-mid');
  rail('shaft-west-service-east-rail', 1476, 500, 8, 200, 30, 'shaft-mid');
  rail('shaft-west-service-north-rail', 1280, 396, 200, 8, 30, 'shaft-mid');
  rail('shaft-ramp-west-west-rail', 1306, 400, 8, 300, 30, 'shaft-crown',
    { axis: 'y', rise: 6, reverse: true });
  rail('shaft-ramp-west-east-rail', 1406, 400, 8, 300, 30, 'shaft-crown',
    { axis: 'y', rise: 6, reverse: true });
  rail('shaft-crown-rail', 1410, 402, 410, 10, 36, 'shaft-crown');
  rail('shaft-bridge-landing-north-rail', 1825, 306, 105, 8, 36, 'shaft-crown');
  rail('shaft-bridge-landing-south-rail', 1800, 416, 130, 8, 36, 'shaft-crown');
  // The hoist's upper stop previously opened onto empty shaft volume.  This
  // permanent dock provides exact 30 m support without boxing in the cage.
  floor('hoist-upper-dock', 1450, 835, 125, 65, 30, 'shaft-mid');
  rail('hoist-upper-dock-east-rail', 1571, 835, 8, 65, 30, 'shaft-mid');
  rail('hoist-upper-dock-south-rail', 1450, 896, 125, 8, 30, 'shaft-mid');
  // Bespoke freight hoist: existing lift kinematics provide exact authoritative
  // vertical support, but the renderer builds a counterweighted foundry cage.
  const hoist = remember({ id: 'forge-freight-hoist', kind: 'lift', x: 1450, y: 720,
    width: 125, height: 115, bottom: 19.45, top: 20, minTop: 20, maxTop: 30,
    walkable: true, platform: true, sectorId: 'shaft-base', phaseOffset: 1800,
    bespoke: 'counterweight-hoist' });
  terrain.push(hoist);
  // Leave a full capsule-width circulation gap between the west guide and
  // the bottom of shaft-ramp-west. The old guide began at y=695, nearly
  // touching the stair's east parapet and forcing players approaching from
  // the hoist side to circle around the entire landing.
  wall('hoist-rail-west', 1428, 755, 14, 105, 20, 52,
    { kind: 'hoistRail', sectorId: 'shaft-base' });
  wall('hoist-rail-east', 1583, 695, 14, 165, 20, 52,
    { kind: 'hoistRail', sectorId: 'shaft-base' });
  const hoistPosts = [
    ['hoist-cage-post-nw', 1450, 720], ['hoist-cage-post-ne', 1567, 720],
    ['hoist-cage-post-sw', 1450, 827], ['hoist-cage-post-se', 1567, 827],
  ];
  for(const [id,x,y] of hoistPosts) {
    const post=remember({id,kind:'liftCage',x,y,width:8,height:8,bottom:20,top:23.6,
      liftId:hoist.id,liftBottomOffset:0,liftTopOffset:3.6,sectorId:'shaft-base'});
    terrain.push(post);
  }
  const hoistCanopy=remember({id:'hoist-cage-canopy',kind:'liftCageRoof',x:1450,y:720,
    width:125,height:115,bottom:23.6,top:23.9,liftId:hoist.id,
    liftBottomOffset:3.6,liftTopOffset:3.9,sectorId:'shaft-base'});
  terrain.push(hoistCanopy);
  architecture.machines.push({ id: 'forge-hoist-system', type: 'freightHoist',
    liftId: hoist.id, x: 1450, y: 720, width: 125, height: 115,
    bottom: 20, top: 52, counterweightX: 1605,
    collisionIds: ['forge-freight-hoist', 'hoist-rail-west', 'hoist-rail-east',
      ...hoistPosts.map(value=>value[0]),'hoist-cage-canopy'] });
  bind('forge-hoist-system', 'surface', ['forge-freight-hoist', 'hoist-rail-west', 'hoist-rail-east',
    ...hoistPosts.map(value=>value[0]),'hoist-cage-canopy']);
  // Shaft rings and cable runs sell scale but remain beyond reach.
  for (const h of [24, 32, 40, 48])
    architecture.beams.push({ id: `shaft-ring-${h}`, type: 'shaftRing', x: 1600, y: 655,
      radius: 310, bottom: h, top: h + .7, collisionIds: [], nonSolidReason: 'outside playable shaft perimeter' });
  architecture.lights.push({ id: 'shaft-light', x: 1600, y: 655, height: 46,
    color: '#ff263f', intensity: 4.3, radius: 680 });

  // Articulated bridge begins vertical and lowers after the shaft encounter.
  const bridge = ramp('command-bridge-deck', 1930, 310, 280, 110, 36, 42, 'x',
    ['shaft-crown', 'command'],
    { industrial: 'hinged-bridge', dynamicId: 'command-bridge', nonSolid: true });
  wall('command-bridge-raised', 1928, 310, 24, 110, 36, 48,
    { kind: 'strikeDoor', dynamicId: 'command-bridge-raised', sectorId: 'shaft-crown' });
  // Dynamic rails share the bridge's authoritative state.  They remain
  // non-solid while the bridge is raised, then become sloped side collision
  // exactly when its deck is activated.
  wall('command-bridge-rail-north', 1930, 306, 280, 8, 36, 37.15, {
    kind: 'rail', axis: 'x', rise: 6, dynamicId: 'command-bridge', nonSolid: true,
    sectorId: ['shaft-crown', 'command'], collisionEndInset: 2,
  });
  wall('command-bridge-rail-south', 1930, 416, 280, 8, 36, 37.15, {
    kind: 'rail', axis: 'x', rise: 6, dynamicId: 'command-bridge', nonSolid: true,
    sectorId: ['shaft-crown', 'command'], collisionEndInset: 2,
  });
  architecture.machines.push({ id: 'command-hinged-bridge', type: 'hingedBridge',
    x: 1930, y: 310, width: 280, height: 110, bottom: 36, top: 42,
    collisionIds: [bridge.id, 'command-bridge-raised', 'command-bridge-rail-north',
      'command-bridge-rail-south'] });
  bind('command-hinged-bridge', 'surface', [bridge.id, 'command-bridge-raised',
    'command-bridge-rail-north', 'command-bridge-rail-south']);

  // -----------------------------------------------------------------------
  // DISTRICT 5 — COMMAND FOUNDRY / THE RED VAULT (42 / 48 m)
  // -----------------------------------------------------------------------
  // Main floor is an authored ring around a real lower crucible well.
  floor('command-floor-west', 2210, 230, 110, 900, 42, 'command');
  floor('command-floor-east', 2580, 230, 130, 900, 42, 'command');
  floor('command-floor-north', 2320, 230, 260, 330, 42, 'command');
  floor('command-floor-south', 2320, 900, 260, 230, 42, 'command');
  // Narrow service bridges bypass the two balcony ramps. Without these, each
  // stair would span an entire circulation spine and turn the apparent ring
  // into disconnected cul-de-sacs at the lower elevation.
  floor('command-west-ramp-bypass', 2320, 560, 70, 110, 42, 'command');
  floor('command-east-ramp-bypass', 2510, 700, 70, 200, 42, 'command');
  floor('vault-well-floor', 2320, 560, 260, 340, 38, 'vault-well');
  ramp('vault-well-ramp', 2320, 760, 105, 140, 38, 42, 'y', 'command',
    { industrial: 'vault-ramp' });
  // The command ring overlaps the well in XY but is four metres higher.  The
  // simulation otherwise lets a 38 m capsule walk beneath those elevated
  // slabs and eventually fall onto implicit ground.  These retaining faces
  // are exactly the visible vertical walls of the well; the south-west gap is
  // the authored ramp exit.
  wall('vault-well-retaining-west', 2312, 560, 8, 340, 38, 42,
    { sectorId: 'vault-well' });
  wall('vault-well-retaining-east', 2580, 560, 8, 340, 38, 42,
    { sectorId: 'vault-well' });
  wall('vault-well-retaining-north', 2320, 552, 260, 8, 38, 42,
    { sectorId: 'vault-well' });
  wall('vault-well-retaining-south', 2425, 900, 155, 8, 38, 42,
    { sectorId: 'vault-well' });
  wall('vault-well-retaining-south-ramp', 2320, 900, 105, 8, 38, 42,
    { sectorId: 'vault-well' });
  rail('vault-ring-west-inner-rail', 2316, 670, 8, 90, 42, 'command');
  rail('vault-ring-west-ramp-rail', 2316, 760, 8, 140, 42, 'command');
  rail('vault-ring-east-inner-rail', 2576, 560, 8, 140, 42, 'command');
  rail('vault-ring-north-inner-rail', 2390, 556, 190, 8, 42, 'command');
  rail('vault-ring-south-inner-rail', 2425, 896, 85, 8, 42, 'command');
  rail('command-west-bypass-south-rail', 2320, 666, 70, 8, 42, 'command');
  rail('command-east-bypass-north-rail', 2510, 696, 70, 8, 42, 'command');
  rail('vault-well-ramp-east-rail', 2421, 760, 8, 140, 38, 'command',
    { axis: 'y', rise: 4 });
  roof('command-roof', 2150, 190, 600, 980, 55, 'command');
  wall('command-west-a', 2150, 190, 34, 120, 20, 55, { sectorId: 'command' });
  wall('command-west-b', 2150, 420, 34, 750, 20, 55, { sectorId: 'command' });
  wall('command-east', 2716, 190, 34, 980, 20, 55, { sectorId: 'command' });
  wall('command-north', 2150, 190, 600, 34, 20, 55, { sectorId: 'command' });
  wall('command-south', 2150, 1136, 600, 34, 20, 55, { sectorId: 'command' });
  // This shutter gates the Vault interior, not the command bridge entrance.
  // Placing it on the west shell left the freshly lowered bridge facing a
  // solid wall and stranded the fireteam outside its own encounter.
  // Gate the deeper command ring between the two stair flights. The former
  // y=552 placement cut directly through command-ramp-north.
  wall('command-breach-shutter', 2184, 680, 532, 18, 38, 49,
    { kind: 'strikeDoor', dynamicId: 'command-breach-shutter', sectorId: 'command' });
  // Upper command balconies sit on visible columns and are served by two
  // opposed ramps, creating recovery loops instead of sniper balconies with
  // no architectural reason to exist.
  floor('command-balcony-north', 2230, 240, 420, 115, 48, 'command-upper');
  floor('command-balcony-south', 2260, 1005, 440, 115, 48, 'command-upper');
  ramp('command-ramp-north', 2230, 355, 90, 260, 42, 48, 'y', 'command-upper',
    { reverse: true, industrial: 'command-stair' });
  ramp('command-ramp-south', 2580, 745, 120, 260, 42, 48, 'y', 'command-upper',
    { industrial: 'command-stair' });
  // Balcony supports flank the stair mouths instead of occupying their final
  // tread. The former (2280,330) and (2600,1030) posts blocked both exits.
  for (const [i, x, y] of [[0,2520,300],[1,2600,330],[2,2280,1030],[3,2420,1080]])
    column(`command-balcony-column-${i}`, x, y, 15, 42, 48, 'command-upper', 'command');
  rail('command-balcony-n-rail', 2320, 358, 310, 10, 48, 'command-upper');
  rail('command-balcony-s-rail', 2270, 992, 310, 10, 48, 'command-upper');
  rail('command-balcony-north-north-rail', 2230, 236, 420, 8, 48, 'command-upper');
  rail('command-balcony-north-west-rail', 2222, 240, 8, 115, 48, 'command-upper');
  rail('command-balcony-north-east-rail', 2646, 240, 8, 115, 48, 'command-upper');
  rail('command-balcony-south-south-rail', 2260, 1116, 440, 8, 48, 'command-upper');
  rail('command-balcony-south-west-rail', 2256, 1005, 8, 115, 48, 'command-upper');
  rail('command-balcony-south-east-rail', 2696, 1005, 8, 115, 48, 'command-upper');
  rail('command-ramp-north-west-rail', 2226, 355, 4, 260, 42, 'command-upper',
    { axis: 'y', rise: 6, reverse: true });
  rail('command-ramp-north-east-rail', 2320, 355, 4, 260, 42, 'command-upper',
    { axis: 'y', rise: 6, reverse: true });
  rail('command-ramp-south-west-rail', 2576, 745, 8, 260, 42, 'command-upper',
    { axis: 'y', rise: 6 });
  rail('command-ramp-south-east-rail', 2696, 745, 8, 260, 42, 'command-upper',
    { axis: 'y', rise: 6 });
  rail('command-west-bypass-rail', 2382, 575, 8, 80, 42, 'command');
  rail('command-east-bypass-rail', 2510, 715, 8, 170, 42, 'command');
  // Command consoles create phase-friendly cover with chamfered capsule
  // footprints; the central core is circular in both render and physics.
  const consoles = [
    // The two broad cross-decks carry the consoles; the narrower west/east
    // circulation spines stay fully capsule-safe so both halves of the ring
    // remain genuine recovery routes throughout the boss fight.
    ['command-console-a', 2360, 500, 2430, 530], ['command-console-b', 2490, 500, 2560, 530],
    ['command-console-c', 2360, 990, 2430, 1020], ['command-console-d', 2490, 990, 2560, 1020],
  ];
  for (const [id, ax, ay, bx, by] of consoles) {
    capsule(id, ax, ay, bx, by, 22, 42, 43.5, 'command', { kind: 'console' });
    architecture.machines.push({ id, type: 'commandConsole', ax, ay, bx, by,
      bottom: 42, top: 43.5, collisionIds: [id] }); bind(id, 'solid', [id]);
  }
  circle('red-vault-core-base', 2450, 660, 54, 38, 53, 'vault-well', { kind: 'reactorCore' });
  architecture.machines.push({ id: 'red-vault-core', type: 'vaultCore', x: 2450, y: 660,
    radius: 54, bottom: 38, top: 53, collisionIds: ['red-vault-core-base'],
    nonSolidReason: 'core column is exact-solid; suspended energy rings remain non-damaging' });
  bind('red-vault-core', 'solid', ['red-vault-core-base'],
    'core column is exact-solid; suspended energy rings remain non-damaging');
  // Four deep recovery pockets are deliberately off-axis from spawn doors.
  for (const [i, x, y, w, h] of [
    [0, 2190, 430, 42, 120], [1, 2665, 430, 42, 120],
    [2, 2190, 885, 42, 120], [3, 2580, 1080, 120, 42],
  ]) wall(`vault-cover-${i}`, x, y, w, h, 42, 45.1, { kind: 'cover', sectorId: 'command' });
  architecture.machines.push({ id: 'vault-rotating-crown', type: 'rotatingCrown', x: 2450, y: 660,
    radius: 165, bottom: 49, top: 53, collisionIds: [], nonSolidReason: 'rotates above body and projectile lanes' });
  bind('vault-rotating-crown', 'decorative', [], 'overhead rotating machinery');
  architecture.lights.push({ id: 'vault-light', x: 2450, y: 660, height: 51,
    color: '#ff1938', intensity: 5.2, radius: 620 });
  architecture.signs.push({ id: 'vault-sign', x: 2190, y: 260, bottom: 50,
    facing: 'east', text: 'THE RED VAULT', color: '#ff203b' });

  // Distant, unreachable foundry stacks and bridgework provide parallax
  // through shaft/furnace apertures without expanding gameplay collision.
  architecture.distantMassing.push(
    { id: 'distant-smelter-a', x: 70, y: 220, width: 150, height: 700, bottom: 0, top: 46 },
    { id: 'distant-smelter-b', x: 2020, y: 1260, width: 520, height: 300, bottom: 0, top: 38 },
    { id: 'distant-stack-field', x: 300, y: 60, width: 800, height: 170, bottom: 0, top: 52 },
  );
  for (const mass of architecture.distantMassing)
    bind(mass.id, 'decorative', [], 'sealed behind facility shell and outside world bounds');

  // Shells and authored surface groups bind their visible architecture to the
  // same IDs used by movement and hitscan.  Tests require every registry
  // collider to exist and every substantial render asset to appear here.
  bind('freight-shell', 'surface', ['freight-apron-floor', 'freight-sort-floor', 'freight-apron-roof',
    'freight-sort-roof', 'freight-west-a', 'freight-entry-bulkhead', 'freight-west-b', 'freight-north',
    'freight-south-a', 'freight-loading-bulkhead', 'freight-south-b', 'freight-east-a',
    'freight-east-b', 'sort-north', 'sort-south', 'sort-east-a', 'sort-east-b']);
  bind('assembly-shell', 'surface', ['assembly-lower-floor', 'assembly-lower-north-sill', 'assembly-roof',
    'assembly-south', 'assembly-east-a', 'assembly-east-b', 'assembly-west-a', 'assembly-west-mid',
    'assembly-west-b', 'assembly-north-a', 'assembly-north-under-shaft',
    'assembly-north-mid-under-shaft', 'assembly-north-b', 'assembly-east-switchback-shell']);
  bind('assembly-gantry', 'surface', ['assembly-switchback', 'assembly-east-landing',
    'assembly-upper-gantry', 'assembly-upper-overlook']);
  bind('furnace-shell', 'surface', ['furnace-floor-west', 'furnace-floor-east', 'furnace-channel-bridge',
    'furnace-roof', 'furnace-west', 'furnace-north', 'furnace-south-a', 'furnace-south-b',
    'furnace-east-a', 'furnace-east-under-refinery', 'furnace-east-b',
    'furnace-east-b-under-transfer']);
  bind('refinery-service-route', 'surface', ['refinery-ascent', 'refinery-west-landing',
    'refinery-service-deck', 'refinery-east-landing', 'refinery-shaft-throat']);
  bind('shaft-shell', 'surface', ['shaft-base', 'shaft-crown-roof', 'shaft-west-a','shaft-west-b', 'shaft-east',
    'shaft-north', 'shaft-south', 'shaft-chamfer-nw', 'shaft-chamfer-ne-lower',
    'shaft-chamfer-ne-upper', 'shaft-chamfer-sw', 'shaft-chamfer-se']);
  bind('shaft-service-route', 'surface', ['shaft-ramp-east', 'shaft-east-service', 'shaft-ramp-north',
    'shaft-north-ramp-landing', 'shaft-west-service', 'shaft-ramp-west', 'shaft-crown-deck',
    'shaft-bridge-landing', 'hoist-upper-dock']);
  bind('command-shell', 'surface', ['command-floor-west', 'command-floor-east', 'command-floor-north',
    'command-floor-south', 'command-west-ramp-bypass', 'command-east-ramp-bypass',
    'vault-well-floor', 'vault-well-ramp', 'vault-well-retaining-west',
    'vault-well-retaining-east', 'vault-well-retaining-north', 'vault-well-retaining-south',
    'vault-well-retaining-south-ramp',
    'command-roof', 'command-west-a',
    'command-west-b', 'command-east', 'command-north', 'command-south']);
  bind('command-balconies', 'surface', ['command-balcony-north', 'command-balcony-south',
    'command-ramp-north', 'command-ramp-south']);

  const strikeSectors = [
    { id: 'freight', bounds: { x: 110, y: 1180, width: 810, height: 580, bottom: 0, top: 14.5 }, floorMin: 0, floorMax: .1, navCellSize: 26 },
    { id: 'assembly-lower', bounds: { x: 850, y: 900, width: 1080, height: 800, bottom: 0, top: 32 }, floorMin: 0, floorMax: 7.5, navCellSize: 26 },
    { id: 'assembly-upper', bounds: { x: 880, y: 780, width: 1050, height: 550, bottom: 9, top: 32 }, floorMin: 11.8, floorMax: 12.2, navCellSize: 24 },
    { id: 'furnace', bounds: { x: 250, y: 300, width: 990, height: 720, bottom: 4, top: 30.5 }, floorMin: 11.8, floorMax: 13.2, navCellSize: 26 },
    { id: 'refinery', bounds: { x: 300, y: 300, width: 950, height: 480, bottom: 17, top: 30.5 }, floorMin: 19.8, floorMax: 20.2, navCellSize: 24 },
    { id: 'shaft-base', bounds: { x: 1200, y: 250, width: 780, height: 820, bottom: 18, top: 55.5 }, floorMin: 19.8, floorMax: 21, navCellSize: 24 },
    { id: 'shaft-mid', bounds: { x: 1240, y: 280, width: 720, height: 730, bottom: 23, top: 55.5 }, floorMin: 25.8, floorMax: 30.2, navCellSize: 22 },
    { id: 'shaft-crown', bounds: { x: 1240, y: 250, width: 1000, height: 520, bottom: 29, top: 55.5 }, floorMin: 29.8, floorMax: 42.2, navCellSize: 22 },
    { id: 'command', bounds: { x: 2130, y: 170, width: 640, height: 1020, bottom: 35, top: 55.5 }, floorMin: 37.8, floorMax: 43.2, navCellSize: 24 },
    { id: 'command-upper', bounds: { x: 2170, y: 200, width: 570, height: 950, bottom: 41, top: 55.5 }, floorMin: 47.8, floorMax: 48.2, navCellSize: 22 },
    { id: 'vault-well', bounds: { x: 2310, y: 540, width: 280, height: 370, bottom: 35, top: 55.5 }, floorMin: 37.8, floorMax: 42.2, navCellSize: 18 },
  ];

  const navLinks = [
    { id: 'link-freight-assembly', from: 'freight', to: 'assembly-lower',
      a: { x: 906, y: 1470, height: .384 }, b: { x: 1124, y: 1470, height: 5.616 }, mode: 'walk', colliderId: 'intake-to-assembly' },
    { id: 'link-assembly-upper', from: 'assembly-lower', to: 'assembly-upper',
      a: { x: 1830, y: 1474, height: 6.32 }, b: { x: 1830, y: 1206, height: 11.68 }, mode: 'stairs', colliderId: 'assembly-switchback' },
    { id: 'link-assembly-furnace', from: 'assembly-upper', to: 'furnace',
      a: { x: 970, y: 970, height: 12 }, b: { x: 970, y: 900, height: 12 }, mode: 'walk' },
    { id: 'link-furnace-refinery', from: 'furnace', to: 'refinery',
      a: { x: 366, y: 415, height: 12.4413793103 }, b: { x: 624, y: 415, height: 19.5586206897 }, mode: 'stairs', colliderId: 'refinery-ascent' },
    { id: 'link-refinery-shaft', from: 'refinery', to: 'shaft-base',
      a: { x: 1170, y: 650, height: 20 }, b: { x: 1260, y: 650, height: 20 }, mode: 'walk' },
    { id: 'link-shaft-east', from: 'shaft-base', to: 'shaft-mid',
      a: { x: 1730, y: 956, height: 20.3111111111 }, b: { x: 1730, y: 680, height: 26 }, mode: 'stairs', colliderId: 'shaft-ramp-east' },
    { id: 'link-shaft-north', from: 'shaft-mid', to: 'shaft-mid',
      a: { x: 1784, y: 450, height: 26.2 }, b: { x: 1496, y: 450, height: 29.8 }, mode: 'stairs', colliderId: 'shaft-ramp-north' },
    { id: 'link-shaft-west', from: 'shaft-mid', to: 'shaft-crown',
      a: { x: 1330, y: 684, height: 30.32 }, b: { x: 1330, y: 416, height: 35.68 }, mode: 'stairs', colliderId: 'shaft-ramp-west' },
    { id: 'link-hoist', from: 'shaft-base', to: 'shaft-mid',
      a: { x: 1510, y: 780, height: 20 }, b: { x: 1510, y: 780, height: 30 }, mode: 'lift', dynamicId: 'forge-freight-hoist', playerOnly: true },
    { id: 'link-command-bridge', from: 'shaft-crown', to: 'command',
      a: { x: 1946, y: 330, height: 36.3428571429 }, b: { x: 2194, y: 330, height: 41.6571428571 }, mode: 'bridge', dynamicId: 'command-bridge', colliderId: 'command-bridge-deck' },
    { id: 'link-command-upper-n', from: 'command', to: 'command-upper',
      a: { x: 2260, y: 599, height: 42.3692307692 }, b: { x: 2260, y: 371, height: 47.6307692308 }, mode: 'stairs', colliderId: 'command-ramp-north' },
    { id: 'link-command-upper-s', from: 'command', to: 'command-upper',
      a: { x: 2640, y: 761, height: 42.3692307692 }, b: { x: 2640, y: 989, height: 47.6307692308 }, mode: 'stairs', colliderId: 'command-ramp-south' },
    { id: 'link-vault-well', from: 'command', to: 'vault-well',
      a: { x: 2393.5, y: 884, height: 41.5428571429 }, b: { x: 2393.5, y: 776, height: 38.4571428571 }, mode: 'stairs', colliderId: 'vault-well-ramp' },
  ];

  const bot = (x, y, height, zone, extra = {}) => ({ x, y, height, zone, ...extra });
  const encounters = [
    { id: 'secure-receiving', order: 0, act: 1, title: 'FREIGHT INTAKE',
      objective: 'Secure Receiving Seven', sectorId: 'freight', type: 'clear',
      objectivePoint: bot(500, 1490, 0, 'freight'),
      trigger: { x: 180, y: 1260, width: 500, height: 400, bottom: 0, top: 5 },
      safeArrival: { x: 150, y: 1360, width: 150, height: 200, bottom: 0, top: 4 },
      checkpointSpawns: [bot(205, 1400, 0, 'freight'), bot(205, 1460, 0, 'freight'), bot(205, 1520, 0, 'freight')],
      spawnGroups: [
        { delayMs: 800, bots: [bot(610, 1320, 0, 'freight'), bot(640, 1620, 0, 'freight'), bot(470, 1490, 0, 'freight')] },
        { afterRemaining: 1, bots: [bot(720, 1370, 0, 'freight'), bot(700, 1570, 0, 'freight')] },
      ], opens: ['freight-shutter'], machinery: { crane: 'unload' } },
    { id: 'break-sorting-lock', order: 1, act: 1, title: 'SORTING LOCK',
      objective: 'Break the sorting lock', sectorId: 'freight', type: 'breach',
      objectivePoint: bot(820, 1470, 0, 'freight'),
      trigger: { x: 720, y: 1320, width: 240, height: 320, bottom: 0, top: 8 },
      checkpointSpawns: [bot(760, 1460, 0, 'freight'), bot(720, 1510, 0, 'freight')],
      spawnGroups: [{ delayMs: 500, bots: [bot(1080, 1450, 4.56, 'assembly-lower'), bot(1190, 1555, 6, 'assembly-lower'), bot(1190, 1320, 6, 'assembly-lower')] }],
      postClearObjective: 'Cycle the freight crane',
      objectiveTrigger: { x: 805, y: 1335, width: 70, height: 62, bottom: 0, top: 3 },
      interaction: interaction('freight-crane-control',840,1327,1.55,Math.PI/2,'CYCLE CRANE'),
      opens: [], machinery: { crane: 'drop-cover', conveyors: true },
      stateChanges: { staging: { crane: 'idle' }, combat: { crane: 'tracking' },
        cleared: { crane: 'awaiting-cycle' }, complete: { crane: 'drop-cover', conveyors: 'online' } } },
    { id: 'assembly-canyon', order: 2, act: 2, title: 'WEAPON ASSEMBLY',
      objective: 'Shut down the armament line', sectorId: 'assembly-lower', type: 'clear',
      objectivePoint: bot(1680, 1360, 6, 'assembly-lower'),
      trigger: { x: 1130, y: 1080, width: 690, height: 520, bottom: 5.7, top: 10 },
      checkpointSpawns: [bot(1160, 1470, 6, 'assembly-lower'), bot(1160, 1525, 6, 'assembly-lower')],
      spawnGroups: [
        { delayMs: 900, bots: [bot(1350, 1100, 6, 'assembly-lower'), bot(1670, 1550, 6, 'assembly-lower'), bot(1680, 1360, 6, 'assembly-lower'), bot(1250, 980, 12, 'assembly-upper')] },
        { afterRemaining: 2, bots: [bot(1300, 980, 12, 'assembly-upper', { botType: 'dread' }), bot(1770, 1120, 12, 'assembly-upper')] },
      ], postClearObjective: 'Destroy the armament power reactor',
      objectiveTrigger: { x: 1780, y: 1080, width: 65, height: 70, bottom: 12, top: 15 },
      destructible: {
        id: 'assembly-line-reactor', type: 'wallReactor', label: 'POWER REACTOR',
        x: 1873, y: 1115, height: 13.55, normalAngle: Math.PI, maxHealth: 180,
        // The unit projects from the west face of the assembly shell. Its
        // authoritative hitbox ends just before the wall, so a ray must hit
        // the visible reactor before it reaches ordinary world geometry.
        hitbox: { x: 1854, y: 1087, width: 21, height: 56, bottom: 12.42, top: 14.72 },
      },
      opens: [], machinery: { conveyors: false, arms: 'hostile-stop' },
      stateChanges: { combat: { conveyors: 'overdrive', arms: 'cycling' },
        cleared: { conveyors: 'braking', arms: 'park', lineReactor: 'exposed' },
        complete: { conveyors: 'stopped', arms: 'park', lineReactor: 'destroyed' } } },
    { id: 'gantry-overwatch', order: 3, act: 2, title: 'ASSEMBLY GANTRY',
      // The previous line-controller interaction already leaves the fireteam
      // on the east landing. This encounter is a westward clear across the
      // gantry—not another unexplained instruction to somehow get upstairs.
      objective: 'Clear the upper gantry', combatObjective: 'Eliminate the gantry defenders',
      arrivalObjective: 'Push west across the upper gantry',
      sectorId: 'assembly-upper', type: 'clear', autoStart: true,
      objectivePoint: bot(1450, 1000, 12, 'assembly-upper'),
      trigger: { x: 1680, y: 1020, width: 190, height: 240, bottom: 11.6, top: 16 },
      checkpointSpawns: [bot(1770, 1120, 12, 'assembly-upper'), bot(1820, 1120, 12, 'assembly-upper')],
      // Keep every defender east of assembly-shutter. The shutter is this
      // encounter's completion reward, so spawning a defender at x=1000 in
      // the west transfer gallery trapped it behind the door it had to die
      // to open and left the HUD permanently reporting one hostile.
      spawnGroups: [{ delayMs: 550, bots: [bot(1450, 1000, 12, 'assembly-upper'), bot(1160, 1240, 12, 'assembly-upper'), bot(1280, 1000, 12, 'assembly-upper')] }],
      opens: ['assembly-shutter'], machinery: { arms: 'park' } },
    { id: 'cross-furnace', order: 4, act: 3, title: 'PRIMARY FURNACE',
      objective: 'Cross the live furnace', sectorId: 'furnace', type: 'hazard-clear',
      objectivePoint: bot(950, 700, 12, 'furnace'),
      trigger: { x: 870, y: 760, width: 300, height: 210, bottom: 11.5, top: 17 },
      checkpointSpawns: [bot(1090, 890, 12, 'furnace'), bot(1140, 890, 12, 'furnace')],
      spawnGroups: [
        { delayMs: 700, bots: [bot(950, 600, 12, 'furnace'), bot(560, 900, 12, 'furnace'), bot(500, 610, 12, 'furnace')] },
        { afterRemaining: 1, bots: [bot(680, 820, 12, 'furnace'), bot(855, 450, 12, 'furnace', { botType: 'ogre' })] },
      ], opens: [], machinery: { furnaceCycle: true } },
    { id: 'refinery-control', order: 5, act: 3, title: 'REFINERY CONTROL',
      objective: 'Vent the pressure manifold', sectorId: 'refinery', type: 'survive', durationMs: 28000,
      objectivePoint: bot(960, 405, 20, 'refinery'),
      trigger: { x: 620, y: 340, width: 500, height: 180, bottom: 19.5, top: 24 },
      checkpointSpawns: [bot(740, 405, 20, 'refinery'), bot(790, 405, 20, 'refinery')],
      spawnGroups: [
        { delayMs: 400, bots: [bot(1110, 400, 20, 'refinery'), bot(930, 410, 20, 'refinery'), bot(845, 570, 12, 'furnace')] },
        { delayMs: 11500, bots: [bot(1160, 620, 20, 'refinery'), bot(600, 485, 18.8965517241, 'refinery')] },
      ], postClearObjective: 'Open the pressure manifold',
      objectiveTrigger: { x: 1100, y: 365, width: 66, height: 70, bottom: 20, top: 23 },
      interaction: interaction('refinery-manifold-control',1133,348,21.55,Math.PI/2,'OPEN MANIFOLD'),
      opens: ['refinery-shutter'], machinery: { pressure: 'venting' },
      stateChanges: { combat: { pressure: 'critical' }, cleared: { pressure: 'awaiting-vent' },
        complete: { pressure: 'vented', 'refinery-shutter': 'open' } } },
    { id: 'shaft-base', order: 6, act: 4, title: 'FORGE SHAFT',
      objective: 'Seize the freight hoist', sectorId: 'shaft-base', type: 'clear',
      objectivePoint: bot(1810, 800, 20, 'shaft-base'),
      trigger: { x: 1250, y: 420, width: 650, height: 570, bottom: 19.5, top: 25 },
      checkpointSpawns: [bot(1285, 500, 20, 'shaft-base'), bot(1285, 570, 20, 'shaft-base')],
      spawnGroups: [
        { delayMs: 700, bots: [bot(1810, 900, 20, 'shaft-base'), bot(1810, 570, 20, 'shaft-base'), bot(1420, 900, 20, 'shaft-base')] },
        { afterRemaining: 1, bots: [bot(1760, 600, 26, 'shaft-mid'), bot(1350, 700, 30, 'shaft-mid', { botType: 'dread' })] },
      ], postClearObjective: 'Prime the counterweight hoist',
      objectiveTrigger: { x: 1350, y: 735, width: 65, height: 80, bottom: 20, top: 23 },
      interaction: interaction('forge-hoist-control',1425,775,21.55,Math.PI,'PRIME HOIST'),
      opens: [], machinery: { hoist: 'enabled', rotor: 'accelerate' },
      stateChanges: { combat: { hoist: 'locked', rotor: 'accelerate' },
        cleared: { hoist: 'awaiting-prime', rotor: 'steady' }, complete: { hoist: 'enabled', rotor: 'steady' } } },
    { id: 'shaft-ascent', order: 7, act: 4, title: 'VERTICAL FORGE',
      objective: 'Climb through the forge crown', sectorId: 'shaft-mid', type: 'clear',
      objectivePoint: bot(1600, 350, 36, 'shaft-crown'),
      triggers: [
        { x: 1680, y: 470, width: 230, height: 260, bottom: 25.5, top: 31 },
        { x: 1270, y: 390, width: 230, height: 520, bottom: 29.5, top: 37 },
      ], checkpointSpawns: [bot(1740, 610, 26, 'shaft-mid'), bot(1380, 780, 30, 'shaft-mid')],
      spawnGroups: [
        { delayMs: 400, bots: [bot(1760, 550, 26, 'shaft-mid'), bot(1400, 820, 30, 'shaft-mid'), bot(1450, 350, 36, 'shaft-crown')] },
        { afterRemaining: 1, bots: [bot(1650, 350, 36, 'shaft-crown', { botType: 'guardian' }), bot(1770, 350, 36, 'shaft-crown')] },
      ], postClearObjective: 'Lower the command bridge',
      objectiveTrigger: { x: 1760, y: 315, width: 72, height: 70, bottom: 36, top: 39 },
      interaction: interaction('command-bridge-control',1796,310,37.55,Math.PI/2,'LOWER BRIDGE'),
      opens: ['command-bridge', 'command-bridge-raised'], machinery: { bridge: 'lower', rotor: 'brake' },
      stateChanges: { combat: { bridge: 'raised', rotor: 'overdrive' },
        cleared: { bridge: 'awaiting-release', rotor: 'brake' }, complete: { bridge: 'lowered', rotor: 'brake' } } },
    { id: 'command-breach', order: 8, act: 5, title: 'COMMAND FOUNDRY',
      objective: 'Breach command foundry', sectorId: 'command', type: 'breach',
      objectivePoint: bot(2500, 430, 42, 'command'),
      trigger: { x: 1950, y: 285, width: 280, height: 180, bottom: 35.5, top: 43 },
      checkpointSpawns: [bot(1720, 350, 36, 'shaft-crown'), bot(1780, 350, 36, 'shaft-crown')],
      spawnGroups: [{ delayMs: 600, bots: [bot(2340, 460, 42, 'command'), bot(2620, 460, 42, 'command'), bot(2430, 280, 48, 'command-upper')] }],
      postClearObjective: 'Override the Vault blast shutter',
      objectiveTrigger: { x: 2390, y: 240, width: 120, height: 110, bottom: 42, top: 45 },
      interaction: interaction('vault-shutter-control',2450,227,43.55,Math.PI/2,'OVERRIDE SHUTTER'),
      opens: ['command-breach-shutter'], machinery: { bridge: 'locked', shutters: 'breach' },
      stateChanges: { combat: { shutters: 'sealed' }, cleared: { shutters: 'awaiting-override' },
        complete: { shutters: 'open', core: 'awakening' } } },
    { id: 'red-vault-finale', order: 9, act: 5, title: 'THE RED VAULT',
      objective: 'Destroy the Vault command guard', sectorId: 'command', type: 'finale',
      objectivePoint: bot(2500, 1080, 42, 'command'),
      trigger: { x: 2220, y: 420, width: 460, height: 600, bottom: 37.5, top: 51 },
      checkpointSpawns: [bot(2230, 660, 42, 'command'), bot(2230, 730, 42, 'command'), bot(2290, 730, 42, 'command')],
      spawnGroups: [
        { phase: 1, delayMs: 900, bots: [bot(2670, 600, 42, 'command', { botType: 'dread' }), bot(2560, 920, 42, 'command'), bot(2400, 1060, 48, 'command-upper')] },
        { phase: 2, afterRemaining: 1, bots: [bot(2300, 280, 48, 'command-upper', { botType: 'guardian' }), bot(2500, 1060, 48, 'command-upper', { botType: 'dread' }), bot(2450, 820, 38, 'vault-well')] },
        { phase: 3, afterRemaining: 1, bots: [
          bot(2500, 820, 38, 'vault-well', { botType: 'warden', boss: true, name: 'DREAD WARDEN', health: 1150, bodyRadius: 26, bodyHeight: 3.15, eyeHeight: 2.65 })
        ] },
      ],
      // These are health phases inside the Warden wave, not additional global
      // encounter phases. The authority clamps cadence/counts; the IDs let the
      // environment bind every telegraph to existing forge machinery.
      wardenPhases: [
        { id: 'redline-carbine', minHealthRatio: .66, moveScale: 1,
          carbine: { chargeMs: 520, shotIntervalMs: 165, burstShots: 3, recoveryMs: 980, damage: 10 },
          stateChanges: { machinery: {
            core: { state: 'warden-guarded', sourceId: 'red-vault-core' },
            crown: { state: 'tracking', sourceId: 'vault-rotating-crown' },
          } } },
        { id: 'core-pressure', minHealthRatio: .33, moveScale: 1.08, entryDelayMs: 420,
          carbine: { chargeMs: 470, shotIntervalMs: 145, burstShots: 3, recoveryMs: 900, damage: 11 },
          pressure: { kind: 'forgePressureSweep', sourceId: 'red-vault-core', crownId: 'vault-rotating-crown',
            entryDelayMs: 650, windupMs: 1350, sweepMs: 1150, cooldownMs: 5200,
            radius: 325, minRadius: 58, arcWidth: .78, heightTolerance: 7, damage: 34, knockback: 245 },
          stateChanges: { machinery: {
            core: { state: 'warden-venting', sourceId: 'red-vault-core' },
            crown: { state: 'spin', sourceId: 'vault-rotating-crown' },
          } } },
        { id: 'foundry-overdrive', minHealthRatio: 0, moveScale: 1.2, entryDelayMs: 260,
          carbine: { chargeMs: 330, shotIntervalMs: 105, burstShots: 4, recoveryMs: 580, damage: 12 },
          pressure: { kind: 'forgePressureSweep', sourceId: 'red-vault-core', crownId: 'vault-rotating-crown',
            entryDelayMs: 420, windupMs: 900, sweepMs: 900, cooldownMs: 3900,
            radius: 350, minRadius: 48, arcWidth: .9, heightTolerance: 7, damage: 40, knockback: 300,
            direction: -1 },
          reinforcements: { id: 'warden-redguard', bots: [
            bot(2260, 700, 42, 'command', { botType: 'dread' }),
            bot(2640, 700, 42, 'command', { botType: 'dread' }),
          ] },
          stateChanges: { machinery: {
            core: { state: 'warden-enraged', sourceId: 'red-vault-core' },
            crown: { state: 'overdrive', sourceId: 'vault-rotating-crown' },
          } } },
      ], opens: [], machinery: { core: 'overload', crown: 'spin' },
      stateChanges: { combat: { core: 'shielded', crown: 'tracking' },
        phase2: { core: 'venting', crown: 'spin' }, phase3: { core: 'exposed', crown: 'overdrive' },
        complete: { core: 'collapsed', crown: 'stopped' } }, reward: { coins: 350 } },
  ];

  // A compact, authored wayfinding language follows the actual circulation
  // route instead of drawing a magic line through walls.  Guides are visual
  // only: the server selects the current targetId and the renderer preallocates
  // these bounded markers without adding collision or per-frame geometry.
  const routeGuides = [
    { id:'route-00-entry', x:270, y:1460, height:0, angle:0, sectorId:'freight', kind:'arrow', encounterIndex:0, targetId:'secure-receiving', label:'RECEIVING 07' },
    { id:'route-00-floor', x:390, y:1470, height:0, angle:0, sectorId:'freight', kind:'strip', encounterIndex:0, targetId:'secure-receiving' },
    { id:'route-00-beacon', x:500, y:1490, height:0, sectorId:'freight', kind:'beacon', encounterIndex:0, targetId:'secure-receiving', label:'SECURE RECEIVING' },

    { id:'route-01-entry', x:620, y:1490, height:0, angle:0, sectorId:'freight', kind:'arrow', encounterIndex:1, targetId:'break-sorting-lock', label:'SORTING LOCK' },
    { id:'route-01-floor', x:750, y:1470, height:0, angle:0, sectorId:'freight', kind:'strip', encounterIndex:1, targetId:'break-sorting-lock' },
    { id:'route-01-beacon', x:820, y:1470, height:0, sectorId:'freight', kind:'beacon', encounterIndex:1, targetId:'break-sorting-lock', label:'BREAK THE LOCK' },
    { id:'route-01-objective-arrow', x:820, y:1460, height:0, angle:-Math.PI/2, sectorId:'freight', kind:'arrow', encounterIndex:1, targetId:'break-sorting-lock:objective' },
    { id:'route-01-objective', x:840, y:1366, height:0, sectorId:'freight', kind:'beacon', encounterIndex:1, targetId:'break-sorting-lock:objective', label:'CYCLE CRANE' },

    { id:'route-02-ramp-low', x:930, y:1470, height:1, angle:0, sectorId:'assembly-lower', kind:'arrow', encounterIndex:2, targetId:'assembly-canyon', label:'ARMAMENT LINE' },
    { id:'route-02-ramp-high', x:1080, y:1470, height:4.56, angle:0, sectorId:'assembly-lower', kind:'strip', encounterIndex:2, targetId:'assembly-canyon' },
    { id:'route-02-floor', x:1210, y:1470, height:6, angle:0, sectorId:'assembly-lower', kind:'arrow', encounterIndex:2, targetId:'assembly-canyon' },
    { id:'route-02-beacon', x:1680, y:1360, height:6, sectorId:'assembly-lower', kind:'beacon', encounterIndex:2, targetId:'assembly-canyon', label:'SHUT DOWN LINE' },
    { id:'route-02-objective-arrow', x:1720, y:1360, height:6, angle:-Math.PI/2, sectorId:'assembly-lower', kind:'arrow', encounterIndex:2, targetId:'assembly-canyon:objective' },
    { id:'route-02-objective-strip', x:1810, y:1290, height:10, angle:-Math.PI/2, sectorId:'assembly-upper', kind:'strip', encounterIndex:2, targetId:'assembly-canyon:objective' },
    { id:'route-02-objective', x:1848, y:1115, height:12, sectorId:'assembly-upper', kind:'beacon', encounterIndex:2, targetId:'assembly-canyon:objective', label:'POWER REACTOR' },

    { id:'route-03-stair-base', x:1800, y:1450, height:6.8, angle:-Math.PI/2, sectorId:'assembly-lower', kind:'arrow', encounterIndex:3, targetId:'gantry-overwatch', label:'EAST SWITCHBACK' },
    { id:'route-03-stair', x:1810, y:1240, height:11, angle:-Math.PI/2, sectorId:'assembly-upper', kind:'arrow', encounterIndex:3, targetId:'gantry-overwatch', label:'UPPER GANTRY' },
    { id:'route-03-floor', x:1670, y:1000, height:12, angle:Math.PI, sectorId:'assembly-upper', kind:'strip', encounterIndex:3, targetId:'gantry-overwatch' },
    { id:'route-03-beacon', x:1450, y:1000, height:12, sectorId:'assembly-upper', kind:'beacon', encounterIndex:3, targetId:'gantry-overwatch', label:'CLEAR GANTRY' },

    { id:'route-04-west-a', x:1500, y:1000, height:12, angle:Math.PI, sectorId:'assembly-upper', kind:'arrow', encounterIndex:4, targetId:'cross-furnace', label:'PRIMARY FURNACE' },
    { id:'route-04-west-b', x:1180, y:1000, height:12, angle:Math.PI, sectorId:'assembly-upper', kind:'strip', encounterIndex:4, targetId:'cross-furnace' },
    { id:'route-04-turn', x:970, y:970, height:12, angle:-Math.PI/2, sectorId:'furnace', kind:'arrow', encounterIndex:4, targetId:'cross-furnace' },
    { id:'route-04-gallery', x:970, y:850, height:12, angle:-Math.PI/2, sectorId:'furnace', kind:'strip', encounterIndex:4, targetId:'cross-furnace' },
    { id:'route-04-beacon', x:950, y:700, height:12, sectorId:'furnace', kind:'beacon', encounterIndex:4, targetId:'cross-furnace', label:'CROSS LIVE FURNACE' },

    { id:'route-05-west', x:760, y:820, height:12, angle:-2.25, sectorId:'furnace', kind:'arrow', encounterIndex:5, targetId:'refinery-control', label:'REFINERY CONTROL' },
    { id:'route-05-ramp-low', x:390, y:415, height:13.10344827586207, angle:0, sectorId:'furnace', kind:'arrow', encounterIndex:5, targetId:'refinery-control' },
    { id:'route-05-ramp-high', x:520, y:415, height:16.7, angle:0, sectorId:'refinery', kind:'strip', encounterIndex:5, targetId:'refinery-control' },
    { id:'route-05-beacon', x:960, y:405, height:20, sectorId:'refinery', kind:'beacon', encounterIndex:5, targetId:'refinery-control', label:'VENT MANIFOLD' },
    { id:'route-05-objective-arrow', x:1010, y:385, height:20, angle:0, sectorId:'refinery', kind:'arrow', encounterIndex:5, targetId:'refinery-control:objective' },
    { id:'route-05-objective', x:1133, y:400, height:20, sectorId:'refinery', kind:'beacon', encounterIndex:5, targetId:'refinery-control:objective', label:'OPEN MANIFOLD' },

    { id:'route-06-shutter', x:1150, y:560, height:20, angle:1.2, sectorId:'refinery', kind:'arrow', encounterIndex:6, targetId:'shaft-base', label:'FORGE SHAFT' },
    { id:'route-06-threshold', x:1180, y:650, height:20, angle:0, sectorId:'refinery', kind:'strip', encounterIndex:6, targetId:'shaft-base' },
    { id:'route-06-floor', x:1430, y:650, height:20, angle:.55, sectorId:'shaft-base', kind:'arrow', encounterIndex:6, targetId:'shaft-base' },
    { id:'route-06-beacon', x:1810, y:800, height:20, sectorId:'shaft-base', kind:'beacon', encounterIndex:6, targetId:'shaft-base', label:'SEIZE THE HOIST' },
    { id:'route-06-objective-arrow', x:1650, y:800, height:20, angle:Math.PI, sectorId:'shaft-base', kind:'arrow', encounterIndex:6, targetId:'shaft-base:objective' },
    { id:'route-06-objective-strip', x:1400, y:790, height:20, angle:Math.PI, sectorId:'shaft-base', kind:'strip', encounterIndex:6, targetId:'shaft-base:objective' },
    { id:'route-06-objective', x:1382, y:775, height:20, sectorId:'shaft-base', kind:'beacon', encounterIndex:6, targetId:'shaft-base:objective', label:'PRIME COUNTERWEIGHT' },

    { id:'route-07-hoist-low', x:1400, y:780, height:20, angle:0, sectorId:'shaft-base', kind:'arrow', encounterIndex:7, targetId:'shaft-ascent', label:'ASCEND' },
    { id:'route-07-hoist-high', x:1490, y:870, height:30, sectorId:'shaft-mid', kind:'beacon', encounterIndex:7, targetId:'shaft-ascent', label:'UPPER DOCK' },
    { id:'route-07-west', x:1450, y:650, height:30, angle:Math.PI, sectorId:'shaft-mid', kind:'strip', encounterIndex:7, targetId:'shaft-ascent' },
    { id:'route-07-ramp', x:1330, y:540, height:33.2, angle:-Math.PI/2, sectorId:'shaft-mid', kind:'arrow', encounterIndex:7, targetId:'shaft-ascent' },
    { id:'route-07-beacon', x:1600, y:350, height:36, sectorId:'shaft-crown', kind:'beacon', encounterIndex:7, targetId:'shaft-ascent', label:'FORGE CROWN' },
    { id:'route-07-objective-arrow', x:1680, y:350, height:36, angle:0, sectorId:'shaft-crown', kind:'arrow', encounterIndex:7, targetId:'shaft-ascent:objective' },
    { id:'route-07-objective', x:1796, y:350, height:36, sectorId:'shaft-crown', kind:'beacon', encounterIndex:7, targetId:'shaft-ascent:objective', label:'LOWER BRIDGE' },

    { id:'route-08-bridge-a', x:1900, y:350, height:36, angle:0, sectorId:'shaft-crown', kind:'arrow', encounterIndex:8, targetId:'command-breach', label:'COMMAND FOUNDRY' },
    { id:'route-08-bridge-b', x:2200, y:320, height:42, angle:0, sectorId:'command', kind:'strip', encounterIndex:8, targetId:'command-breach' },
    { id:'route-08-threshold', x:2300, y:300, height:42, angle:0, sectorId:'command', kind:'arrow', encounterIndex:8, targetId:'command-breach' },
    { id:'route-08-beacon', x:2500, y:430, height:42, sectorId:'command', kind:'beacon', encounterIndex:8, targetId:'command-breach', label:'BREACH COMMAND' },
    { id:'route-08-objective-arrow', x:2450, y:330, height:42, angle:-Math.PI/2, sectorId:'command', kind:'arrow', encounterIndex:8, targetId:'command-breach:objective' },
    { id:'route-08-objective', x:2450, y:280, height:42, sectorId:'command', kind:'beacon', encounterIndex:8, targetId:'command-breach:objective', label:'OVERRIDE SHUTTER' },

    { id:'route-09-south-a', x:2340, y:540, height:42, angle:Math.PI/2, sectorId:'command', kind:'arrow', encounterIndex:9, targetId:'red-vault-finale', label:'THE RED VAULT' },
    { id:'route-09-south-b', x:2250, y:700, height:42, angle:Math.PI/2, sectorId:'command', kind:'strip', encounterIndex:9, targetId:'red-vault-finale' },
    { id:'route-09-turn', x:2350, y:920, height:42, angle:0, sectorId:'command', kind:'arrow', encounterIndex:9, targetId:'red-vault-finale' },
    { id:'route-09-beacon', x:2500, y:1080, height:42, sectorId:'command', kind:'beacon', encounterIndex:9, targetId:'red-vault-finale', label:'DESTROY THE WARDEN' },
  ];

  architecture.signs.push(
    { id:'furnace-route-sign', x:1018, y:900, bottom:15, facing:'west', text:'FURNACE / 03', color:'#ff5538' },
    { id:'refinery-route-sign', x:1188, y:555, bottom:24, facing:'west', text:'PRESSURE / 03', color:'#ff8b4a' },
    { id:'shaft-route-sign', x:1245, y:620, bottom:25, facing:'east', text:'FORGE SHAFT / 04', color:'#ef3349' },
    { id:'command-route-sign', x:2185, y:450, bottom:46, facing:'east', text:'COMMAND / 05', color:'#ff304b' },
  );

  const hazards = [
    { id: 'furnace-vent-west', type: 'furnacePulse', volume: { x: 565, y: 570, width: 70, height: 105, bottom: 12, top: 15 },
      cycleMs: 7200, activeStart: 3600, activeEnd: 5050, damagePerSecond: 28, encounterId: 'cross-furnace' },
    { id: 'furnace-vent-east', type: 'furnacePulse', volume: { x: 885, y: 610, width: 70, height: 105, bottom: 12, top: 15 },
      cycleMs: 7200, phaseOffset: 1850, activeStart: 3600, activeEnd: 5050, damagePerSecond: 28, encounterId: 'cross-furnace' },
  ];

  const playerSpawns = [
    bot(205, 1400, 0, 'freight'), bot(205, 1460, 0, 'freight'),
    bot(205, 1520, 0, 'freight'), bot(265, 1460, 0, 'freight'),
  ];
  const checkpointSpawns = encounters.map(e => e.checkpointSpawns);

  // Registry entries for individually-authored structural lists.
  for (const item of [...architecture.columns, ...architecture.rails, ...architecture.pipes])
    bind(item.id, item.collisionIds?.length ? 'solid' : 'decorative', item.collisionIds || [], item.nonSolidReason);
  for (const item of architecture.beams)
    if (!assetCollision.some(binding => binding.assetId === item.id))
      bind(item.id, item.collisionIds?.length ? 'solid' : 'decorative', item.collisionIds || [], item.nonSolidReason);
  // Any remaining directly-rendered structural collider receives an explicit
  // one-to-one binding. This is intentionally exhaustive: a new substantial
  // wall, curb, shutter or floor cannot silently become an unregistered ghost.
  const alreadyBound=new Set(assetCollision.flatMap(binding=>binding.colliderIds||[]));
  for(const solid of [...walls,...terrain])if(!alreadyBound.has(solid.id)) {
    bind(`structure:${solid.id}`,solid.walkable||solid.kind==='ramp'?'surface':'solid',[solid.id]);
    alreadyBound.add(solid.id);
  }

  const map = {
    id: RED_VAULT_ID,
    name: 'The Red Vault',
    description: 'Break a Dread armament foundry from its freight decks to the command core.',
    mode: 'strike', style: 'redVault', fixed: true, seed: 0x52455641,
    width: 2800, height: 1900, ceiling: 56, roof: false,
    worldBounds: { minX: 105, minY: 165, maxX: 2760, maxY: 1765 },
    walls, terrain, architecture, assetCollision, strikeSectors, navLinks, routeGuides,
    encounters, hazards, playerSpawns, checkpointSpawns,
    botSpawn: encounters[0].spawnGroups[0].bots[0],
    platformEpoch: 0,
    dynamicState: {
      'freight-shutter': 'closed', 'assembly-shutter': 'closed',
      'refinery-shutter': 'closed', 'command-bridge': 'closed',
      'command-bridge-raised': 'closed', 'command-breach-shutter': 'closed',
    },
    initialMissionState: { machinery: { crane: 'idle', conveyors: 'online', arms: 'park',
      pressure: 'stable', rotor: 'steady', hoist: 'locked', bridge: 'raised',
      core: 'dormant', crown: 'stopped' } },
    palette: {
      sky: '#171216', ambient: '#aeb7bb', ground: '#49343a', sun: '#ffe0c5', rim: '#ff334c',
      wall: '#302a2e', panel: '#85898c', cap: '#b8b0a9', glow: '#ff2944',
      floorLow: '#242326', floorHigh: '#50494c', reflection: '#4b4144', reflectionGlow: '#f12a45',
      ambientIntensity: 1.78, sunIntensity: 1.18, rimIntensity: 2.65,
    },
    lightingZones: [
      { id: 'freight', x: 120, y: 1180, width: 800, height: 580, ambient: 1.88, fog: '#413137', color: '#ffd0ad' },
      { id: 'assembly', x: 850, y: 880, width: 1080, height: 830, ambient: 1.58, fog: '#2d171e', color: '#ff4056' },
      { id: 'furnace', x: 240, y: 280, width: 1010, height: 750, ambient: 1.68, fog: '#4b1d12', color: '#ff6436' },
      { id: 'shaft', x: 1200, y: 240, width: 800, height: 840, ambient: 1.42, fog: '#211319', color: '#ff3a50' },
      { id: 'command', x: 2120, y: 160, width: 660, height: 1040, ambient: 1.52, fog: '#38121b', color: '#ff3048' },
    ],
  };
  return { map, walls };
}

if (typeof module !== 'undefined' && module.exports)
  module.exports = { RED_VAULT_ID, createRedVaultMap };
if (typeof globalThis !== 'undefined')
  Object.assign(globalThis, { RED_VAULT_ID, createRedVaultMap });
