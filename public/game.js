import { Arena3D,resolveViewPlayer } from './arena3d.js';
import { SnapshotMotion } from './snapshotMotion.mjs';
import { InputPrediction } from './inputPrediction.mjs';
import {createGrenadeHud} from './grenadeHud.mjs';
import {createMinigunSpoolHud} from './minigunSpoolHud.mjs';
const updateGrenadeHud=createGrenadeHud(document);
const updateMinigunSpool=createMinigunSpoolHud(document);
const inputPrediction=new InputPrediction();
let jumpRequested=false;
let grenadeChargeAt=null;
let minigunSpinAt=null,minigunReleasedAt=-Infinity;
function resetMinigunSpool(){minigunSpinAt=null;minigunReleasedAt=-Infinity;updateMinigunSpool();}
function cancelGrenade(){if(grenadeChargeAt!=null)socket.emit('grenadeCancel');grenadeChargeAt=null;
  updateGrenadeHud(resolveViewPlayer(players,socket.id)?.grenades??0);}
let lastProbeAt=-Infinity,lastMetricsAt=0,probeId=0,networkRtt=null,serverTickMs=null;
const snapshotMotion=new SnapshotMotion();
let lastSnapshotSequence=0;

const canvas = document.getElementById('game-canvas');
const playersAliveInfo = document.getElementById('players-alive');
const gameMessage = document.getElementById('game-message');
const killFeed=document.getElementById('kill-feed');
const killFeedTimers=new Map();
const pveWipe=document.getElementById('pve-wipe');
const pveWipeFloor=document.getElementById('pve-wipe-floor');
const retryFloorBtn=document.getElementById('retry-floor-btn');
const leaveWipeBtn=document.getElementById('leave-wipe-btn');
const crosshair=document.getElementById('crosshair');
const weaponStatus=document.getElementById('weapon-status');
const performanceInfo=document.getElementById('performance-info');
const strikeObjectiveHud=document.getElementById('strike-objective');
const strikeAct=document.getElementById('strike-act');
const strikePhase=document.getElementById('strike-phase');
const strikeObjectiveText=document.getElementById('strike-objective-text');
const strikeObjectiveFill=document.getElementById('strike-objective-fill');
const strikeRouteHud=strikeObjectiveHud?.querySelector('.strike-objective-route');
const strikeRouteArrow=document.getElementById('strike-route-arrow');
const strikeRouteLabel=document.getElementById('strike-route-label');
const strikeRouteDistance=document.getElementById('strike-route-distance');
const strikeInteractHud=document.getElementById('strike-interact');
const strikeInteractLabel=document.getElementById('strike-interact-label');
const minimapLegend=document.getElementById('minimap-legend');
const strikeBossHud=document.getElementById('strike-boss');
const strikeBossName=document.getElementById('strike-boss-name');
const strikeBossPhase=document.getElementById('strike-boss-phase');
const strikeBossTrack=strikeBossHud?.querySelector('.strike-boss-track');
const strikeBossFill=document.getElementById('strike-boss-fill');
let previousBloomRadius='',previousWeaponStatus='',previousWeaponStatusHidden=null;
let arena, players = [], walls = [], localPlayer;
let gameMap = DEFAULT_MAP, mapSolids = [];
let floorState = {phase:'combat',floor:1,startedAt:0}, floorClockOffset = 0;
let strikeState=null;
let strikeInteractHeld=false,strikeInteractStartedAt=null;
const isStrikeMap=(map=gameMap)=>map?.mode==='strike'||map?.activity==='strike';
const isCoopMap=(map=gameMap)=>map?.mode==='pve'||isStrikeMap(map);
const riding = () => gameMap.mode === 'pve' && !isStrikeMap() && ['riding','opening'].includes(floorState.phase);
const travelCabin=()=>riding()?(floorState.phase==='opening'?gameMap.arrivalElevator:gameMap.elevator):null;
let gameActive = false, frame = 0, previousTime = 0, lastShotAt = 0, lastUpdateAt = 0;
let firing = false, lastAutomaticAimAt = -Infinity, dirty = false, returnTimer, messageTimer;
const keys = new Set();
let pitch = 0;
function hydrateSpawnTiming(player) {
  if(player&&Number.isFinite(player.spawnReadyAt)&&!Number.isFinite(player.spawnRevealAt))
    player.spawnRevealAt=performance.now()+Math.max(0,player.spawnReadyAt-(Date.now()+floorClockOffset));
  if(player&&Number.isFinite(player.spawnShieldUntil)&&!Number.isFinite(player.spawnShieldEndsAt))
    player.spawnShieldEndsAt=performance.now()+Math.max(0,player.spawnShieldUntil-(Date.now()+floorClockOffset));
  return player;
}
const lookPrompt = document.getElementById('look-prompt');
const locked = () => document.pointerLockElement === canvas;
function clearKillFeed() {
  for(const timer of killFeedTimers.values())clearTimeout(timer);
  killFeedTimers.clear();
  killFeed?.replaceChildren();
  killFeed?.classList.add('hidden');
}
function addKillFeedEntry(kill,death) {
  if(!killFeed||!kill||!gameActive||gameMap.mode!=='pvp')return;
  const killer=String(kill.killerName||'Environment');
  const victim=String(kill.victimName||'Player');
  const weaponNames={autoRifle:'AUTO',miniGun:'MINIGUN',sniper:'SNIPER',pistol:'PISTOL',
    shotgun:'SHOTGUN',grenade:'GRENADE'};
  const entry=document.createElement('div');entry.className='kill-feed-entry';
  entry.setAttribute('aria-label',`${killer} eliminated ${victim}`);
  const name=document.createElement('strong');name.textContent=killer;
  if(kill.killerId===socket.id)name.classList.add('local');
  const weapon=document.createElement('span');weapon.className='kill-feed-weapon';
  weapon.textContent=weaponNames[death?.kind]||'›';
  const target=document.createElement('strong');target.textContent=victim;
  if(kill.victimId===socket.id)target.classList.add('local-victim');
  entry.append(name,weapon,target);
  killFeed.append(entry);
  killFeed.classList.remove('hidden');
  const timer=setTimeout(()=>{
    killFeedTimers.delete(entry);entry.remove();
    if(!killFeed.childElementCount)killFeed.classList.add('hidden');
  },6000);
  killFeedTimers.set(entry,timer);
  while(killFeed.childElementCount>4) {
    const oldest=killFeed.firstElementChild;
    clearTimeout(killFeedTimers.get(oldest));killFeedTimers.delete(oldest);oldest.remove();
  }
}
function updateArenaLabel(map) {
  const label=document.getElementById('arena-label');
  if(!label)return;
  const strike=isStrikeMap(map),encounters=map.strikeEncounters||map.encounters||[];
  const encounter=encounters[strikeState?.encounterIndex||0];
  const title=strike?(map.name||'THE RED VAULT').toUpperCase():
    map.mode==='pve'?`FLOOR / ${String(map.floor||1).padStart(2,'0')}`:(map.name||'ARENA').toUpperCase();
  const subtitle=document.createElement('span');
  subtitle.textContent=strike?`ACT ${encounter?.act||strikeState?.actId||1} · ${encounter?.title||'FREIGHT INTAKE'}`:
    map.mode==='pve'?'LIVE SECTOR':`PVP MAP${Number.isSafeInteger(map.variant)?` · VARIANT ${map.variant+1}`:''}`;
  label.replaceChildren(document.createTextNode(title),subtitle);
}

function updateStrikeHud() {
  const active=isStrikeMap()&&!!strikeState;
  strikeObjectiveHud?.classList.toggle('hidden',!active);
  if(!active){strikeBossHud?.classList.add('hidden');strikeRouteHud?.classList.add('hidden');return;}
  const encounters=gameMap.strikeEncounters||gameMap.encounters||[],index=Math.max(0,strikeState.encounterIndex||0);
  const encounter=encounters[index],act=encounter?.act||strikeState.actId||1;
  const actCount=Math.max(1,...encounters.map(value=>Number(value.act)||1));
  const phaseLabels={travel:'ADVANCE',staging:'CONTACT',combat:'ENGAGED',intermission:'REINFORCEMENTS',
    objective:'OPERATE',complete:'SECURED'};
  if(strikeAct)strikeAct.textContent=`ACT ${act} / ${actCount} · ${String(index+1).padStart(2,'0')} / ${String(Math.max(1,encounters.length)).padStart(2,'0')}`;
  if(strikePhase)strikePhase.textContent=strikeState.phase==='objective'&&strikeState.objectiveKind==='destructible'
    ?'DESTROY':phaseLabels[strikeState.phase]||String(strikeState.phase||'advance').toUpperCase();
  // Reliable spawn packets and regular snapshots already contain the live
  // roster. Prefer it over the lower-frequency mission aggregate so the HUD
  // count drops immediately when a defender dies.
  const liveHostiles=players.filter(player=>player.alive&&player.isBot&&
    (!player.strikeEncounterId||player.strikeEncounterId===encounter?.id)).length;
  if(strikeObjectiveText) {
    const objective=strikeState.objective||encounter?.objective||'Advance through the foundry';
    strikeObjectiveText.textContent=strikeState.phase==='combat'?
      `${objective} · ${liveHostiles} ${liveHostiles===1?'HOSTILE':'HOSTILES'}`:
      strikeState.phase==='objective'&&strikeState.objectiveKind==='destructible'?
        `${objective} · ${Math.ceil(Math.max(0,strikeState.objectiveHealth||0))} HP`:objective;
  }
  const beacon=strikeState.objectiveBeacon,hasRoute=!!beacon&&strikeState.phase!=='complete';
  strikeRouteHud?.classList.toggle('hidden',!hasRoute);
  if(hasRoute) {
    const dx=beacon.x-(localPlayer?.x??beacon.x),dy=beacon.y-(localPlayer?.y??beacon.y);
    const bearing=Math.atan2(dy,dx),facing=localPlayer?.angle||0;
    const turn=Math.atan2(Math.sin(bearing-facing),Math.cos(bearing-facing));
    const arrows=['↑','↗','→','↘','↓','↙','←','↖'];
    const direction=((Math.round(turn/(Math.PI/4))%8)+8)%8;
    const vertical=(beacon.height??0)-(localPlayer?.height??beacon.height??0);
    const metres=Math.hypot(dx*.05,dy*.05,vertical);
    const distance=metres>=100?Math.round(metres):metres>=10?Math.round(metres):metres.toFixed(1);
    const verbs={travel:'FOLLOW ROUTE',staging:'RALLY POINT',combat:beacon.kind==='hostile'?'LAST HOSTILE':'OBJECTIVE AREA',
      intermission:'HOLD POSITION',objective:strikeState.objectiveKind==='destructible'?'DESTROY TARGET':'INTERACT'};
    if(strikeRouteArrow)strikeRouteArrow.textContent=arrows[direction];
    if(strikeRouteLabel)strikeRouteLabel.textContent=`${verbs[strikeState.phase]||'OBJECTIVE'} · ${String(beacon.label||encounter?.title||'TARGET').toUpperCase()}`;
    if(strikeRouteDistance)strikeRouteDistance.textContent=`${distance} m${vertical>1.5?' ▲':vertical< -1.5?' ▼':''}`;
  }
  let local=.04;
  if(strikeState.phase==='staging')local=.12;
  else if(strikeState.phase==='combat') {
    const total=Math.max(1,strikeState.totalEnemyCount||strikeState.phaseEnemyTotal||strikeState.enemyCount||1);
    const defeated=Math.max(0,strikeState.defeatedEnemyCount||0);
    const activeEnemies=liveHostiles;
    local=.18+.62*Math.max(0,Math.min(1,(defeated+Math.max(0,total-activeEnemies-defeated))/total));
  } else if(strikeState.phase==='intermission')local=.72;
  else if(strikeState.phase==='objective')local=.82+.16*Math.max(0,Math.min(1,strikeState.objectiveProgress||0));
  else if(strikeState.phase==='complete')local=1;
  const overall=100*Math.max(0,Math.min(1,(index+local)/Math.max(1,encounters.length)));
  if(strikeObjectiveFill)strikeObjectiveFill.style.width=`${overall}%`;
  const bossVisible=!!strikeState.bossId&&!strikeState.bossDefeated&&strikeState.phase==='combat';
  strikeBossHud?.classList.toggle('hidden',!bossVisible);
  if(bossVisible) {
    const maximum=Math.max(1,strikeState.bossMaxHealth||1),health=Math.max(0,strikeState.bossHealth??maximum);
    const percent=100*Math.min(1,health/maximum);
    if(strikeBossName)strikeBossName.textContent=(strikeState.bossName||'DREAD WARDEN').toUpperCase();
    if(strikeBossPhase)strikeBossPhase.textContent=`PHASE ${strikeState.bossCombatPhase||strikeState.bossPhase||1}`;
    if(strikeBossFill)strikeBossFill.style.width=`${percent}%`;
    if(strikeBossTrack)strikeBossTrack.setAttribute('aria-valuenow',String(Math.round(percent)));
  }
  updateArenaLabel(gameMap);
}

function syncStrikeCollision(state) {
  if(!isStrikeMap()||!state)return;
  const hoistState=state.machineryState?.hoist;
  if(hoistState!=null)for(const lift of gameMap.terrain||[])if(lift.kind==='lift') {
    const value=hoistState?.state??hoistState;
    const wasEnabled=lift.enabled!==false;
    lift.enabled=!['locked','disabled','offline'].includes(value);
    if(lift.enabled&&!wasEnabled)lift.phaseEpoch=Number.isFinite(state.serverNow)?state.serverNow:
      Date.now()+floorClockOffset;
    if(!lift.enabled)lift.top=lift.minTop??lift.top;
  }
  const opened=new Set(state.openedIds||[]);
  for(const solid of mapSolids) {
    if(solid.kind!=='strikeDoor'&&!solid.dynamicId)continue;
    solid.clientStrikeClosedState||=( {nonSolid:!!solid.nonSolid,open:!!solid.open,enabled:solid.enabled} );
    const matched=opened.has(solid.id)?solid.id:solid.dynamicId&&opened.has(solid.dynamicId)?solid.dynamicId:null;
    if(matched) {
      const activatingSurface=solid.id!==matched&&solid.dynamicId===matched;
      Object.assign(solid,activatingSurface?{nonSolid:false,open:true,enabled:true}:{nonSolid:true,open:true});
    } else Object.assign(solid,solid.clientStrikeClosedState);
  }
  const allowed=['x','y','width','height','bottom','top','maxTop','phaseOffset','nonSolid','open','active','enabled'];
  for(const [id,patch] of Object.entries(state.solidStates||{})) {
    const solid=mapSolids.find(value=>value.id===id);if(!solid||!patch||typeof patch!=='object')continue;
    for(const key of allowed)if(Object.hasOwn(patch,key))solid[key]=patch[key];
  }
}

function activeStrikeObjective() {
  if(!isStrikeMap()||strikeState?.phase!=='objective')return null;
  const encounter=(gameMap.strikeEncounters||gameMap.encounters||[])[strikeState.encounterIndex||0];
  if(!encounter)return null;
  const objective=Array.isArray(encounter.objectives)?encounter.objectives[strikeState.objectiveIndex||0]:null;
  const interaction=objective?.interaction||encounter.interaction;
  if(!interaction)return null;
  return {kind:'objective',encounter,objective,interaction,
    progress:strikeState?.objectiveProgress||0,occupiedBy:strikeState?.interactionPlayerId||null,
    trigger:objective?.trigger||objective?.volume||encounter.objectiveTrigger||encounter.completionTrigger};
}

function volumeContainsPlayer(source,player) {
  return (Array.isArray(source)?source:[source]).some(item=>{
    const volume=item?.bounds||item;
    if(!volume||![volume.x,volume.y,volume.width,volume.height].every(Number.isFinite))return false;
    const x0=Math.min(volume.x,volume.x+volume.width),x1=Math.max(volume.x,volume.x+volume.width);
    const y0=Math.min(volume.y,volume.y+volume.height),y1=Math.max(volume.y,volume.y+volume.height);
    const z=player.height||0,z0=volume.minHeight??volume.minZ??volume.bottom??-Infinity;
    const z1=volume.maxHeight??volume.maxZ??volume.top??Infinity;
    return player.x>=x0&&player.x<=x1&&player.y>=y0&&player.y<=y1&&
      z>=Math.min(z0,z1)&&z<=Math.max(z0,z1);
  });
}

function strikeInteractionCandidateAim(active) {
  const interaction=active?.interaction;
  if(!active||!localPlayer?.alive)return {active,eligible:false};
  const dx=interaction.x-localPlayer.x,dy=interaction.y-localPlayer.y,distance=Math.hypot(dx,dy);
  const targetYaw=Math.atan2(dy,dx),yawDelta=Math.atan2(Math.sin(localPlayer.angle-targetYaw),
    Math.cos(localPlayer.angle-targetYaw));
  const targetPitch=Math.atan2(interaction.height-((localPlayer.height||0)+(localPlayer.eyeHeight||1.84)),
    Math.max(.001,distance*.05));
  const approach=!Number.isFinite(interaction.normalAngle)||
    Math.cos(interaction.normalAngle)*(localPlayer.x-interaction.x)+
      Math.sin(interaction.normalAngle)*(localPlayer.y-interaction.y)>=-8;
  const eligible=(!active.trigger||volumeContainsPlayer(active.trigger,localPlayer))&&
    distance<=Math.max(30,Number(interaction.range)||110)&&approach&&
    Math.abs(yawDelta)<=Math.max(.12,Number(interaction.yawTolerance)||.42)&&
    Math.abs(pitch-targetPitch)<=Math.max(.12,Number(interaction.pitchTolerance)||.38);
  return {active,eligible,distance,targetYaw,targetPitch};
}

function strikeInteractionAim() {
  if(!isStrikeMap()||!localPlayer?.alive)return {active:null,eligible:false};
  const revives=(strikeState?.reviveBeacons||[]).filter(beacon=>beacon?.playerId!==localPlayer.id)
    .map(beacon=>({kind:'revive',targetId:beacon.playerId,progress:beacon.progress||0,
      occupiedBy:beacon.reviverId||null,interaction:{x:beacon.x,y:beacon.y,
        height:(beacon.height||0)+1.05,range:105,holdMs:beacon.holdMs||2000,
        yawTolerance:.46,pitchTolerance:.46,label:`REVIVE ${beacon.name||'ALLY'}`}}))
    .map(strikeInteractionCandidateAim).filter(aim=>aim.eligible)
    .sort((a,b)=>a.distance-b.distance);
  if(revives.length)return revives[0];
  return strikeInteractionCandidateAim(activeStrikeObjective());
}

function cancelStrikeInteraction(notify=true) {
  if(strikeInteractHeld&&notify)socket.emit('strikeInteractCancel');
  strikeInteractHeld=false;strikeInteractStartedAt=null;
  strikeInteractHud?.classList.add('hidden');
}

function updateStrikeInteractionHud(now) {
  const aim=strikeInteractionAim(),interaction=aim.active?.interaction;
  if(!interaction) {cancelStrikeInteraction(strikeInteractHeld);return false;}
  const occupiedByOther=!!aim.active?.occupiedBy&&aim.active.occupiedBy!==socket.id;
  if(strikeInteractHeld&&(!aim.eligible||occupiedByOther||!localPlayer?.alive))cancelStrikeInteraction();
  const visible=aim.eligible||strikeInteractHeld||occupiedByOther&&
    aim.distance<=Math.max(30,Number(interaction.range)||110);
  strikeInteractHud?.classList.toggle('hidden',!visible);
  if(!visible)return false;
  const holdMs=Math.max(250,Number(interaction.holdMs)||2000);
  const predicted=strikeInteractHeld&&strikeInteractStartedAt!=null?(now-strikeInteractStartedAt)/holdMs:0;
  const progress=Math.max(0,Math.min(1,Math.max(aim.active?.progress||0,predicted)));
  strikeInteractHud?.style.setProperty('--interaction-progress',`${progress*360}deg`);
  strikeInteractHud?.setAttribute('aria-valuenow',String(Math.round(progress*100)));
  strikeInteractHud?.classList.toggle('active',strikeInteractHeld&&aim.eligible);
  strikeInteractHud?.classList.toggle('busy',occupiedByOther);
  if(strikeInteractLabel)strikeInteractLabel.textContent=occupiedByOther?'IN USE':
    strikeInteractHeld?String(interaction.label||'ACTIVATING').toUpperCase():
      `HOLD E · ${String(interaction.label||'ACTIVATE').toUpperCase()}`;
  return aim.eligible&&!occupiedByOther;
}

function releaseMouse() {
  cancelGrenade();
  cancelStrikeInteraction();
  resetMinigunSpool();
  stopAutomaticFire();
  firing = false; keys.clear();jumpRequested=false;
  if (locked()) document.exitPointerLock();
}

window.initGame = function initGame(gamePlayers, gameWalls, map = DEFAULT_MAP, serverNow) {
  stop(); clearTimeout(returnTimer); clearTimeout(messageTimer);
  pveWipe?.classList.add('hidden');
  if(Number.isFinite(serverNow))floorClockOffset=serverNow-Date.now();
  players = gamePlayers.map(hydrateSpawnTiming); walls = gameWalls; localPlayer = players.find(p => p.id === socket.id);
  snapshotMotion.clear();lastSnapshotSequence=0;
  inputPrediction.reset(Date.now());jumpRequested=false;
  gameMap = map; mapSolids = [...walls, ...map.terrain];
  if(minimapLegend)minimapLegend.textContent=isStrikeMap(map)?'YOU · OBJECTIVE':'YOU ONLY';
  strikeState=null;updateStrikeHud();
  cancelStrikeInteraction(false);
  updateArenaLabel(map);
  floorState = {phase:'combat',floor:map.floor || 1,startedAt:0};
  gameMessage.textContent = '';
  try {
    arena ||= new Arena3D(canvas); arena.build(walls, map);
    document.getElementById('render-error').classList.add('hidden');
  } catch (error) {
    const message = document.getElementById('render-error');
    const detail=error instanceof Error?error.message:String(error||'Unknown rendering error');
    const webglFailure=/webgl|webgl2|graphics context|gpu process/i.test(detail);
    message.textContent=webglFailure?
      'The 3D arena could not start. Enable WebGL 2 / hardware acceleration, then reload.':
      `The arena failed to load: ${detail}`;
    message.classList.remove('hidden'); console.error(error); return;
  }
  gameActive = true; pitch = 0; dirty = false; lastShotAt = -Infinity; lastUpdateAt = 0; previousTime = 0;
  lookPrompt.hidden = false;
  updateGameInfo(); frame = requestAnimationFrame(gameLoop);
};

function stop() {
  gameActive = false; releaseMouse(); cancelAnimationFrame(frame);
  clearKillFeed();
  pveWipe?.classList.add('hidden');
  strikeState=null;updateStrikeHud();
}

window.cancelPendingGameReturn = function cancelPendingGameReturn() {
  clearTimeout(returnTimer);
  returnTimer = null;
};

function update(dt, now) {
  if (!localPlayer?.alive || !gameActive) return;
  inputPrediction.time+=dt*1000;
  advanceJump(localPlayer, inputPrediction.time);
  advanceKnockback(localPlayer,Date.now()+floorClockOffset,gameMap,mapSolids);
  if (!locked()) return;
  const right = Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft'));
  const forward = Number(keys.has('w') || keys.has('arrowup')) - Number(keys.has('s') || keys.has('arrowdown'));
  let dx = Math.cos(localPlayer.angle) * forward - Math.sin(localPlayer.angle) * right;
  let dy = Math.sin(localPlayer.angle) * forward + Math.cos(localPlayer.angle) * right;
  const magnitude = Math.max(1,Math.hypot(dx,dy));
  if(dt>0){
    const input=inputPrediction.record(dx/magnitude,dy/magnitude,dt,jumpRequested,localPlayer.movementEpoch||0);
    applyMovementInput(localPlayer,input,gameMap,mapSolids,inputPrediction.time,travelCabin());
    jumpRequested=false;dirty=true;
  }
  if (dirty && now - lastUpdateAt >= 33) sendPosition(now);
}

function sendPosition(now) {
  socket.emit('playerUpdate', { inputs:inputPrediction.outgoing(), angle: localPlayer.angle });
  lastUpdateAt = now; dirty = false;
}

function attemptFire(now = performance.now()) {
  if (!gameActive || !localPlayer?.alive || !locked() || riding()) return;
  const cfg = WEAPONS[localPlayer.weapon] || WEAPONS.pistol;
  if(Date.now()+floorClockOffset<(localPlayer.weaponSwapUntil||0))return;
  if(localPlayer.weapon==='shotgun'&&Date.now()+floorClockOffset<(localPlayer.shotgunReloadUntil||0))return;
  if (now - lastShotAt < cfg.cooldownMs) return;
  sendPosition(now); socket.emit('shoot', { angle: localPlayer.angle, pitch }); lastShotAt = now;
}

function stopAutomaticFire() {
  if(firing)socket.emit('automaticFireStop');
}

function updateAutomaticAim(now=performance.now()) {
  if(!firing||!WEAPONS[localPlayer?.weapon]?.automatic||now-lastAutomaticAimAt<30)return;
  lastAutomaticAimAt=now;
  socket.emit('automaticFireAim',{angle:localPlayer.angle,pitch});
}

function gameLoop(now) {
  if(previousTime)arena.recordFrame(now-previousTime);
  const dt = previousTime ? Math.min((now - previousTime) / 1000, 0.05) : 0;
  previousTime = now;
  if(!riding())updateCargoLifts(gameMap,players,Date.now()+floorClockOffset);
  updateExitDoor(gameMap,floorState,Date.now()+floorClockOffset);
  update(dt, now);
  arena.animateElevator(floorState, Date.now()+floorClockOffset);
  const renderedPlayers=snapshotMotion.sample(players,socket.id,now);
  const viewed=resolveViewPlayer(renderedPlayers,socket.id);
  const bloom=viewed?.alive?weaponBloomRadians(viewed.weapon,viewed,inputPrediction.time):0;
  const bloomPixels=sniperBloomPixels(bloom,canvas.clientHeight||600);
  const bloomRadius=`${bloomPixels.toFixed(2)}px`;
  if(previousBloomRadius!==bloomRadius){previousBloomRadius=bloomRadius;
    crosshair.style.setProperty('--sniper-bloom-radius',bloomRadius);}
  arena.setMinigunTriggerHeld(firing&&localPlayer?.alive&&localPlayer.weapon==='miniGun');
  arena.render(renderedPlayers, socket.id, dt, pitch);
  const canInteract=updateStrikeInteractionHud(now);
  updateGrenadeHud(viewed?.grenades??0,grenadeChargeAt==null||!localPlayer?.alive?null:performance.now()-grenadeChargeAt);
  updateMinigunSpool(firing&&localPlayer?.alive&&localPlayer.weapon==='miniGun'&&minigunSpinAt!=null?
    performance.now()-minigunSpinAt:null,WEAPONS.miniGun.spinUpMs);
  const statusHidden=!viewed?.alive;
  if(previousWeaponStatusHidden!==statusHidden){previousWeaponStatusHidden=statusHidden;weaponStatus.hidden=statusHidden;}
  if(!statusHidden) {
    const otherWeapon=localPlayer?.alive?(localPlayer.weapon==='pistol'?localPlayer.primaryWeapon:'pistol'):null;
    const swapHint=localPlayer?.alive?(canInteract?' · E: INTERACT':otherWeapon&&WEAPONS[otherWeapon]?` · E: ${WEAPONS[otherWeapon].name}`:''):'';
    const reloadLeft=(viewed.shotgunReloadUntil||0)-(Date.now()+floorClockOffset);
    const ammo=viewed.shotgunShotsRemaining===0&&reloadLeft<=0?2:(viewed.shotgunShotsRemaining??2);
    const statusText=viewed.weapon==='shotgun'?
      (reloadLeft>0?`Reloading · ${(reloadLeft/1000).toFixed(1)}s${swapHint}`:`Shotgun · ${ammo}/2${swapHint}`):
      `${WEAPONS[viewed.weapon]?.name||'Weapon'}${swapHint}`;
    if(previousWeaponStatus!==statusText){previousWeaponStatus=statusText;weaponStatus.textContent=statusText;}
  }
  if(now-lastProbeAt>=2000){
    lastProbeAt=now;const id=++probeId,sent=performance.now();
    socket.timeout(2000).emit('networkProbe',(error,data)=>{
      if(id!==probeId)return;
      networkRtt=error?null:performance.now()-sent;serverTickMs=error?null:data.tickMs;
    });
  }
  if(now-lastMetricsAt>=500){
    lastMetricsAt=now;
    performanceInfo.textContent=
      `${Math.round(1000/arena.frameBudget.average)} FPS · Ping ${networkRtt==null?'…':Math.round(networkRtt)+' ms'} · Server ${serverTickMs==null?'…':serverTickMs.toFixed(1)+' ms'} · Render ${Math.round(arena.frameBudget.scale*100)}%`;
  }
  frame = requestAnimationFrame(gameLoop);
}

window.addEventListener('keydown', e => {
  if (!gameActive || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  const key = e.key.toLowerCase();
  if(key==='e'&&locked()) {
    e.preventDefault();
    const aim=strikeInteractionAim();
    if(aim.eligible) {
      if(!e.repeat&&!strikeInteractHeld&&!aim.active?.occupiedBy) {
        stopAutomaticFire();firing=false;resetMinigunSpool();sendPosition(performance.now());
        strikeInteractHeld=true;strikeInteractStartedAt=performance.now();
        socket.emit('strikeInteractStart',{kind:aim.active.kind,targetId:aim.active.targetId,
          angle:localPlayer.angle,pitch});
      }
    } else if(!e.repeat&&localPlayer?.alive&&localPlayer.primaryWeapon) {
      stopAutomaticFire();firing=false;resetMinigunSpool();socket.emit('switchWeapon');
    }
    return;
  }
  if(key==='q'&&locked()) {
    e.preventDefault();
    if(!e.repeat&&!riding()&&localPlayer?.alive&&localPlayer.grenades>0&&grenadeChargeAt==null){grenadeChargeAt=performance.now();socket.emit('grenadeCharge');}
    return;
  }
  if (e.code === 'Space' && locked()) {
    e.preventDefault();
    if (!riding() && !e.repeat && localPlayer?.alive && localPlayer.jumpStartedAt==null)jumpRequested=true;
    return;
  }
  if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
    e.preventDefault(); keys.add(key);
  }
});
window.addEventListener('keyup', e => {
  keys.delete(e.key.toLowerCase());
  if(e.key.toLowerCase()==='e'&&strikeInteractHeld)cancelStrikeInteraction();
  if(e.key.toLowerCase()==='q'&&grenadeChargeAt!=null){
    if(gameActive&&locked()&&localPlayer?.alive&&!riding()){sendPosition(performance.now());socket.emit('throwGrenade',{angle:localPlayer.angle,pitch});grenadeChargeAt=null;}
    else cancelGrenade();
  }
});
window.addEventListener('blur', releaseMouse);
document.addEventListener('visibilitychange', () => { if (document.hidden) { cancelGrenade();cancelStrikeInteraction();resetMinigunSpool();keys.clear();stopAutomaticFire();firing = false; } });
document.addEventListener('mousemove', e => {
  if (!locked() || !gameActive || !localPlayer?.alive) return;
  localPlayer.angle += e.movementX * MOVEMENT.mouseSensitivity;
  pitch = Math.max(-1.35, Math.min(1.35, pitch - e.movementY * MOVEMENT.mouseSensitivity));
  dirty = true;
  updateAutomaticAim();
});
document.addEventListener('pointerlockchange', () => {
  cancelGrenade();
  if(!locked())cancelStrikeInteraction();
  if(!locked())resetMinigunSpool();
  stopAutomaticFire();firing = false;keys.clear();
  lookPrompt.hidden = locked() || !gameActive || !localPlayer?.alive;
});
document.addEventListener('pointerlockerror', () => {
  lookPrompt.textContent = 'Mouse capture unavailable · Click to retry'; lookPrompt.hidden = false;
});
canvas.addEventListener('pointerdown', e => {
  if (e.button !== 0 || !gameActive || !localPlayer?.alive) return;
  if (!locked()) {
    const request = canvas.requestPointerLock?.();
    request?.catch(() => { lookPrompt.textContent = 'Mouse capture unavailable · Click to retry'; });
    return;
  }
  const now=performance.now();
  if(localPlayer.weapon==='miniGun'&&
    (minigunSpinAt==null||now-minigunReleasedAt>WEAPONS.miniGun.triggerReleaseMs))minigunSpinAt=now;
  firing = true;
  if(WEAPONS[localPlayer.weapon]?.automatic){
    sendPosition(now);
    socket.emit('automaticFireStart',{angle:localPlayer.angle,pitch});
    lastAutomaticAimAt=now;
  } else attemptFire(now);
});
window.addEventListener('pointerup', () => {
  if(firing&&localPlayer?.weapon==='miniGun')minigunReleasedAt=performance.now();
  stopAutomaticFire();firing = false;
});
document.getElementById('raytracing-toggle').addEventListener('change', e => {
  if (arena?.floor) arena.floor.uniforms.reflections.value = e.target.checked;
});

function updateGameInfo() {
  if (isStrikeMap()) {
    const alive=players.filter(player=>player.alive&&!player.isBot).length;
    const encounter=(gameMap.strikeEncounters||gameMap.encounters||[])[strikeState?.encounterIndex||0];
    const hostiles=players.filter(player=>player.alive&&player.isBot&&
      (!player.strikeEncounterId||player.strikeEncounterId===encounter?.id)).length;
    const objectiveHint=strikeState?.phase==='objective'?
      strikeState.objectiveKind==='destructible'?' · DESTROY TARGET':' · INTERACT':'';
    playersAliveInfo.textContent = `${alive} FIRETEAM ACTIVE · ${hostiles} HOSTILES${objectiveHint}`;
    updateStrikeHud();
    return;
  }
  if (gameMap.mode === 'pve') {
    playersAliveInfo.textContent = `FLOOR ${gameMap.floor} · ${players.filter(p => p.alive && !p.isBot).length} PLAYERS · ${players.filter(p => p.alive && p.isBot).length} BOTS · +5 HP/s`;
    return;
  }
  playersAliveInfo.textContent = `${players.filter(p => p.alive).length} / ${players.length} OPERATORS ALIVE`;
}

socket.on('gameState', (updated,meta) => {
  if(meta?.sequence&&meta.sequence<=lastSnapshotSequence)return;
  if(meta?.sequence)lastSnapshotSequence=meta.sequence;
  if(arena&&gameActive)arena.setGrenades(meta?.grenades||[],meta?.serverNow);
  if(arena&&gameActive)arena.setGuardianProjectiles(meta?.guardianProjectiles||[],meta?.serverNow);
  if(arena&&gameActive)arena.setPickups(meta?.pickups||[]);
  // High-frequency frames contain only changing fields. Identity, cosmetics,
  // teams and body configuration came from the reliable floor-start packet.
  const previousById=new Map(players.map(player=>[player.id,player]));
  updated=updated.map(frame=>Object.assign({},previousById.get(frame.id)||{},frame));
  snapshotMotion.push(updated,performance.now());
  // Rebase to the acknowledged input, then replay only outstanding commands.
  const predicted = localPlayer; players = updated; localPlayer = players.find(p => p.id === socket.id);
  if(predicted&&!predicted.alive&&localPlayer?.alive) {
    pitch=0;firing=false;keys.clear();jumpRequested=false;resetMinigunSpool();
    inputPrediction.reset(meta?.serverNow??Date.now()+floorClockOffset);
    gameMessage.textContent='';
    lookPrompt.textContent='Click to resume';lookPrompt.hidden=locked();
  }
  if (gameActive && predicted?.alive && localPlayer?.alive) {
    localPlayer.angle = predicted.angle;
    inputPrediction.reconcile(localPlayer,predicted,meta?.serverNow??Date.now()+floorClockOffset,
      (player,input,time)=>applyMovementInput(player,input,gameMap,mapSolids,time,travelCabin()),
      player=>{if(!riding())updateCargoLifts(gameMap,[player],Date.now()+floorClockOffset);});
  }
  updateGameInfo();
});
socket.on('healthChanged',updates=>{
  if(!gameActive||!Array.isArray(updates))return;
  const byId=new Map(players.map(player=>[player.id,player]));
  for(const update of updates){
    const player=byId.get(update?.id);
    if(!player||!Number.isFinite(update.health))continue;
    player.health=update.health;
    if(Number.isFinite(update.maxHealth))player.maxHealth=update.maxHealth;
  }
});
socket.on('playersAdded',added=>{
  if(!gameActive||!Array.isArray(added)||!added.length)return;
  const previous=new Map(players.map(player=>[player.id,player]));
  for(const identity of added) {
    if(!identity?.id)continue;
    hydrateSpawnTiming(identity);
    previous.set(identity.id,Object.assign({},previous.get(identity.id)||{},identity));
  }
  players=[...previous.values()];
  localPlayer=players.find(player=>player.id===socket.id);
  updateGameInfo();
});
socket.on('strikeState',state=>{
  if(!isStrikeMap()||!state)return;
  strikeState={...(strikeState||{}),...state};
  if(Number.isFinite(state.serverNow))floorClockOffset=state.serverNow-Date.now();
  syncStrikeCollision(strikeState);
  arena?.setMissionState(strikeState);
  updateStrikeHud();updateGameInfo();
});
socket.on('strikeBossState',state=>{
  if(!isStrikeMap()||!state)return;
  strikeState={...(strikeState||{}),bossId:state.id,bossHealth:state.health,bossMaxHealth:state.maxHealth,
    bossCombatPhase:state.phase,bossPhase:state.phase,bossDefeated:!!state.defeated,
    ...(state.wardenAttack?{wardenAttack:state.wardenAttack}:{}),
    ...((state.bossAttack||state.attack)?{bossAttack:state.bossAttack||state.attack}:{})};
  arena?.setMissionState(strikeState);
  if(state.wardenAttack||state.bossAttack||state.attack)arena?.setWardenAttack?.(state);
  updateStrikeHud();
});
socket.on('wardenAttack',state=>{
  if(!isStrikeMap()||!state)return;
  arena?.setWardenAttack?.(state);
});
socket.on('strikeHazardState',state=>{
  if(!isStrikeMap()||!state)return;
  strikeState={...(strikeState||{}),activeHazardIds:state.activeHazardIds||[],
    hazards:Array.isArray(state.hazards)?state.hazards:(strikeState?.hazards||[]),
    hazardServerNow:Number.isFinite(state.serverNow)?state.serverNow:Date.now()+floorClockOffset};
  arena?.setMissionState(strikeState);
});
socket.on('strikeComplete',state=>{
  if(!isStrikeMap()||!state)return;
  strikeState={...(strikeState||{}),...state,phase:'complete',complete:true};
  arena?.setMissionState(strikeState);updateStrikeHud();
  const coins=state.reward?.coins||0;
  gameMessage.textContent=`THE RED VAULT SECURED${coins?` · +${coins} COINS`:''}`;
});
socket.on('shotFired', shot => { if (arena && gameActive) arena.shot(shot); });
socket.on('shotsFired',shots=>{
  if(!arena||!gameActive||!Array.isArray(shots))return;
  for(const shot of shots)arena.shot(shot);
});
socket.on('weaponSwitched',data=>{
  const player=players.find(p=>p.id===data?.id);
  if(!player)return;
  Object.assign(player,{weapon:data.weapon,weaponSkinKey:data.weaponSkinKey,weaponSwapUntil:data.weaponSwapUntil});
  if(player===localPlayer){firing=false;resetMinigunSpool();}
  if(arena&&gameActive)arena.weaponSwitched(data.id);
});
socket.on('grenadeExploded',data=>{if(arena&&gameActive)arena.grenadeExplosion(data);});
socket.on('strikeObjectiveDestroyed',data=>{if(arena&&gameActive)arena.strikeReactorExplosion(data);});
socket.on('grenadeThrown',data=>{if(arena&&gameActive)arena.setGrenades([data],data.serverNow,false);});
socket.on('guardianProjectile',data=>{if(arena&&gameActive)arena.setGuardianProjectiles([data],data.serverNow,false);});
socket.on('guardianExplosion',data=>{if(arena&&gameActive)arena.guardianExplosion(data);});
function applyFloorState(state) {
  cancelGrenade();
  floorState=state;floorClockOffset=state.serverNow-Date.now();
  clearTimeout(messageTimer);
  if(riding()){firing=false;resetMinigunSpool();dirty=false;jumpRequested=false;inputPrediction.reset(state.serverNow);}
  updateExitDoor(gameMap,state,Date.now()+floorClockOffset);
  gameMessage.textContent=state.phase==='ready'?'Floor clear · Exit elevator unlocked (E on minimap)':
    state.phase==='riding'?`Ascending to floor ${state.floor+1}…`:
    state.phase==='opening'?`Floor ${state.floor} · Doors opening`:localPlayer?.alive?'':eliminatedMessage();
  updateGameInfo();
}
window.initLatePveJoin=function initLatePveJoin(data) {
  if(!data?.map||!Array.isArray(data.players)||!Array.isArray(data.walls))return;
  window.initGame(data.players,data.walls,data.map,data.state?.serverNow);
  if(data.state)applyFloorState(data.state);
  gameMessage.textContent=`Fireteam joined · Deploying on floor ${data.spawnFloor||((data.map.floor||1)+1)}`;
  lookPrompt.hidden=true;
};
socket.on('floorState',applyFloorState);
socket.on('floorStarting',data=>{
  pveWipe?.classList.add('hidden');
  if(retryFloorBtn){retryFloorBtn.disabled=false;retryFloorBtn.textContent='Retry floor';}
  const angle=localPlayer?.angle,wasAlive=localPlayer?.alive;
  players=data.players.map(hydrateSpawnTiming);walls=data.walls;gameMap=data.map;mapSolids=[...walls,...gameMap.terrain];
  updateArenaLabel(gameMap);
  localPlayer=players.find(p=>p.id===socket.id);
  if(localPlayer&&wasAlive&&Number.isFinite(angle))localPlayer.angle=angle+Math.PI;
  if(localPlayer?.alive&&!wasAlive){pitch=0;firing=false;resetMinigunSpool();keys.clear();gameMessage.textContent='';}
  arena.build(walls,gameMap);
  snapshotMotion.clear();
  inputPrediction.reset(data.state.serverNow);jumpRequested=false;
  applyFloorState(data.state);
  arena.animateElevator(floorState,Date.now()+floorClockOffset);
  lookPrompt.textContent='Click to resume';
  lookPrompt.hidden=locked()||!localPlayer?.alive;
});
function eliminatedMessage() {
  return isStrikeMap()?'Downed · A teammate can revive your shell with E':
    gameMap.mode==='pve'?'Spectating · You’ll respawn next floor if your team survives':'You were eliminated · Spectating';
}
socket.on('playerKilled', (id,death,kill) => {
  if(kill?.victimId===id)addKillFeedEntry(kill,death);
  const player = players.find(p => p.id === id); if (!player) return;
  if(arena&&gameActive)arena.characterDeath(player,death);
  player.alive = false; player.health = 0; updateGameInfo();
  if (id === socket.id) { releaseMouse(); lookPrompt.hidden = true; }
  gameMessage.textContent = id === socket.id ? eliminatedMessage() : `${player.name} was eliminated`;
  clearTimeout(messageTimer);
  if (id !== socket.id) messageTimer = setTimeout(() => { gameMessage.textContent = localPlayer?.alive ? '' : eliminatedMessage(); }, 3000);
});
socket.on('playerRevived', data => {
  const player=players.find(value=>value.id===data?.id);if(!player)return;
  Object.assign(player,data,{alive:true});
  if(data.id===socket.id) {
    pitch=0;firing=false;keys.clear();jumpRequested=false;resetMinigunSpool();
    inputPrediction.reset(data.serverNow??Date.now()+floorClockOffset);
    gameMessage.textContent='';lookPrompt.textContent='Click to resume';lookPrompt.hidden=locked();
  }
  updateGameInfo();
});
socket.on('playerLeft', id => { players = players.filter(p => p.id !== id); updateGameInfo(); });
socket.on('gameOver', winner => {
  // Match lifecycle events are scoped server-side as well, but this guard
  // protects a newly joined lobby from any stale/in-flight result packet.
  if (!gameActive) return;
  gameActive = false; releaseMouse(); lookPrompt.hidden = true; clearTimeout(messageTimer);
  const strikeVictory=isStrikeMap()&&winner?.strike;
  gameMessage.textContent = strikeVictory?`STRIKE COMPLETE · ${(winner.name||gameMap.name||'THE RED VAULT').toUpperCase()}`:
    `Game over · ${winner.name} wins!`; clearTimeout(returnTimer);
  returnTimer = setTimeout(() => {
    returnTimer = null;
    stop(); window.returnToHome?.();
  }, 5000);
});
socket.on('floorState',state=>{
  if(!gameActive||gameMap.mode!=='pve'||state?.phase!=='wiped')return;
  releaseMouse();lookPrompt.hidden=true;clearTimeout(messageTimer);
  gameMessage.textContent='';
  if(pveWipeFloor)pveWipeFloor.textContent=`Floor ${state.floor||gameMap.floor||1} is ready for another attempt.`;
  pveWipe?.classList.remove('hidden');
});
retryFloorBtn?.addEventListener('click',()=>{
  retryFloorBtn.disabled=true;
  retryFloorBtn.textContent='Restarting…';
  socket.emit('retryFloor',result=>{
    if(result?.ok)return;
    retryFloorBtn.disabled=false;
    retryFloorBtn.textContent='Retry floor';
  });
});
leaveWipeBtn?.addEventListener('click',()=>{
  socket.emit('lobby:leave',{},result=>{
    if(!result?.ok)return;
    stop();window.returnToHome?.();
  });
});
socket.on('resetGame', stop);
socket.on('disconnect', () => { stop(); gameMessage.textContent = 'Connection lost. Reconnect to join another match.'; });
