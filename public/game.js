import { Arena3D } from './arena3d.js';
import { SnapshotMotion } from './snapshotMotion.mjs';
import { InputPrediction } from './inputPrediction.mjs';
import {createGrenadeHud} from './grenadeHud.mjs';
const updateGrenadeHud=createGrenadeHud(document);
const inputPrediction=new InputPrediction();
let jumpRequested=false;
let grenadeChargeAt=null;
function cancelGrenade(){if(grenadeChargeAt!=null)socket.emit('grenadeCancel');grenadeChargeAt=null;updateGrenadeHud(localPlayer?.grenades??0);}
let lastProbeAt=-Infinity,lastMetricsAt=0,probeId=0,networkRtt=null,serverTickMs=null;
const snapshotMotion=new SnapshotMotion();
let lastSnapshotSequence=0;

const canvas = document.getElementById('game-canvas');
const playersAliveInfo = document.getElementById('players-alive');
const gameMessage = document.getElementById('game-message');
let arena, players = [], walls = [], localPlayer;
let gameMap = DEFAULT_MAP, mapSolids = [];
let floorState = {phase:'combat',floor:1,startedAt:0}, floorClockOffset = 0;
const riding = () => gameMap.mode === 'pve' && ['riding','opening'].includes(floorState.phase);
const travelCabin=()=>riding()?(floorState.phase==='opening'?gameMap.arrivalElevator:gameMap.elevator):null;
let gameActive = false, frame = 0, previousTime = 0, lastShotAt = 0, lastUpdateAt = 0;
let firing = false, dirty = false, returnTimer, messageTimer;
const keys = new Set();
let pitch = 0;
const lookPrompt = document.getElementById('look-prompt');
const locked = () => document.pointerLockElement === canvas;
function updateArenaLabel(map) {
  const label=document.getElementById('arena-label');
  if(!label)return;
  const title=map.mode==='pve'?`FLOOR / ${String(map.floor||1).padStart(2,'0')}`:(map.name||'ARENA').toUpperCase();
  const subtitle=document.createElement('span');
  subtitle.textContent=map.mode==='pve'?'LIVE SECTOR':`PVP MAP${Number.isSafeInteger(map.variant)?` · VARIANT ${map.variant+1}`:''}`;
  label.replaceChildren(document.createTextNode(title),subtitle);
}
function releaseMouse() {
  cancelGrenade();
  firing = false; keys.clear();jumpRequested=false;
  if (locked()) document.exitPointerLock();
}

window.initGame = function initGame(gamePlayers, gameWalls, map = DEFAULT_MAP) {
  stop(); clearTimeout(returnTimer); clearTimeout(messageTimer);
  players = gamePlayers; walls = gameWalls; localPlayer = players.find(p => p.id === socket.id);
  snapshotMotion.clear();lastSnapshotSequence=0;
  inputPrediction.reset(Date.now());jumpRequested=false;
  gameMap = map; mapSolids = [...walls, ...map.terrain];
  updateArenaLabel(map);
  floorState = {phase:'combat',floor:map.floor || 1,startedAt:0};
  gameMessage.textContent = '';
  try {
    arena ||= new Arena3D(canvas); arena.build(walls, map);
    document.getElementById('render-error').classList.add('hidden');
  } catch (error) {
    const message = document.getElementById('render-error');
    message.textContent = 'The 3D arena could not start. Enable WebGL 2 / hardware acceleration, then reload.';
    message.classList.remove('hidden'); console.error(error); return;
  }
  gameActive = true; pitch = 0; dirty = false; lastShotAt = -Infinity; lastUpdateAt = 0; previousTime = 0;
  lookPrompt.hidden = false;
  updateGameInfo(); frame = requestAnimationFrame(gameLoop);
};

function stop() {
  gameActive = false; releaseMouse(); cancelAnimationFrame(frame);
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
  if (firing && WEAPONS[localPlayer.weapon]?.automatic) attemptFire(now);
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

function gameLoop(now) {
  if(previousTime)arena.recordFrame(now-previousTime);
  const dt = previousTime ? Math.min((now - previousTime) / 1000, 0.05) : 0;
  previousTime = now;
  if(!riding())updateCargoLifts(gameMap,players,Date.now()+floorClockOffset);
  updateExitDoor(gameMap,floorState,Date.now()+floorClockOffset);
  update(dt, now);
  arena.animateElevator(floorState, Date.now()+floorClockOffset);
  arena.render(snapshotMotion.sample(players,socket.id,now), socket.id, dt, pitch);
  updateGrenadeHud(localPlayer?.grenades??0,grenadeChargeAt==null||!localPlayer?.alive?null:performance.now()-grenadeChargeAt);
  const shotgunStatus=document.getElementById('weapon-status');
  shotgunStatus.hidden=!localPlayer?.alive;
  if(!shotgunStatus.hidden) {
    const otherWeapon=localPlayer.weapon==='pistol'?localPlayer.primaryWeapon:'pistol';
    const swapHint=otherWeapon&&WEAPONS[otherWeapon]?` · E: ${WEAPONS[otherWeapon].name}`:'';
    const reloadLeft=(localPlayer.shotgunReloadUntil||0)-(Date.now()+floorClockOffset);
    const ammo=localPlayer.shotgunShotsRemaining===0&&reloadLeft<=0?2:(localPlayer.shotgunShotsRemaining??2);
    shotgunStatus.textContent=localPlayer.weapon==='shotgun'?
      (reloadLeft>0?`Reloading · ${(reloadLeft/1000).toFixed(1)}s${swapHint}`:`Shotgun · ${ammo}/2${swapHint}`):
      `${WEAPONS[localPlayer.weapon]?.name||'Weapon'}${swapHint}`;
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
    document.getElementById('performance-info').textContent=
      `${Math.round(1000/arena.frameBudget.average)} FPS · Ping ${networkRtt==null?'…':Math.round(networkRtt)+' ms'} · Server ${serverTickMs==null?'…':serverTickMs.toFixed(1)+' ms'} · Render ${Math.round(arena.frameBudget.scale*100)}%`;
  }
  frame = requestAnimationFrame(gameLoop);
}

window.addEventListener('keydown', e => {
  if (!gameActive || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  const key = e.key.toLowerCase();
  if(key==='e'&&locked()) {
    e.preventDefault();
    if(!e.repeat&&localPlayer?.alive&&localPlayer.primaryWeapon){firing=false;socket.emit('switchWeapon');}
    return;
  }
  if(key==='q'&&locked()) {
    e.preventDefault();
    if(!e.repeat&&!riding()&&localPlayer?.alive&&localPlayer.grenades>0&&grenadeChargeAt==null){grenadeChargeAt=performance.now();socket.emit('grenadeCharge');}
    return;
  }
  if (e.code === 'Space' && locked()) {
    e.preventDefault();
    if (!riding() && !e.repeat && localPlayer?.alive && localPlayer.jumpStartedAt==null && !localPlayer.knockback)jumpRequested=true;
    return;
  }
  if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
    e.preventDefault(); keys.add(key);
  }
});
window.addEventListener('keyup', e => {
  keys.delete(e.key.toLowerCase());
  if(e.key.toLowerCase()==='q'&&grenadeChargeAt!=null){
    if(gameActive&&locked()&&localPlayer?.alive&&!riding()){sendPosition(performance.now());socket.emit('throwGrenade',{angle:localPlayer.angle,pitch});grenadeChargeAt=null;}
    else cancelGrenade();
  }
});
window.addEventListener('blur', releaseMouse);
document.addEventListener('visibilitychange', () => { if (document.hidden) { cancelGrenade();keys.clear(); firing = false; } });
document.addEventListener('mousemove', e => {
  if (!locked() || !gameActive || !localPlayer?.alive) return;
  localPlayer.angle += e.movementX * MOVEMENT.mouseSensitivity;
  pitch = Math.max(-1.35, Math.min(1.35, pitch - e.movementY * MOVEMENT.mouseSensitivity));
  dirty = true;
});
document.addEventListener('pointerlockchange', () => {
  cancelGrenade();
  firing = false; keys.clear();
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
  firing = true; attemptFire();
});
window.addEventListener('pointerup', () => { firing = false; });
document.getElementById('raytracing-toggle').addEventListener('change', e => {
  if (arena?.floor) arena.floor.uniforms.reflections.value = e.target.checked;
});

function updateGameInfo() {
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
  if(arena&&gameActive)arena.setPickups(meta?.pickups||[]);
  // High-frequency frames contain only changing fields. Identity, cosmetics,
  // teams and body configuration came from the reliable floor-start packet.
  const previousById=new Map(players.map(player=>[player.id,player]));
  updated=updated.map(frame=>Object.assign({},previousById.get(frame.id)||{},frame));
  snapshotMotion.push(updated,performance.now());
  // Rebase to the acknowledged input, then replay only outstanding commands.
  const predicted = localPlayer; players = updated; localPlayer = players.find(p => p.id === socket.id);
  if (gameActive && predicted?.alive && localPlayer?.alive) {
    localPlayer.angle = predicted.angle;
    inputPrediction.reconcile(localPlayer,predicted,meta?.serverNow??Date.now()+floorClockOffset,
      (player,input,time)=>applyMovementInput(player,input,gameMap,mapSolids,time,travelCabin()),
      player=>{if(!riding())updateCargoLifts(gameMap,[player],Date.now()+floorClockOffset);});
  }
  updateGameInfo();
});
socket.on('shotFired', shot => { if (arena && gameActive) arena.shot(shot); });
socket.on('weaponSwitched',data=>{
  const player=players.find(p=>p.id===data?.id);
  if(!player)return;
  Object.assign(player,{weapon:data.weapon,weaponSkinKey:data.weaponSkinKey,weaponSwapUntil:data.weaponSwapUntil});
  if(player===localPlayer)firing=false;
  if(arena&&gameActive)arena.weaponSwitched(data.id);
});
socket.on('grenadeExploded',data=>{if(arena&&gameActive)arena.grenadeExplosion(data);});
socket.on('grenadeThrown',data=>{if(arena&&gameActive)arena.setGrenades([data],data.serverNow,false);});
function applyFloorState(state) {
  cancelGrenade();
  floorState=state;floorClockOffset=state.serverNow-Date.now();
  clearTimeout(messageTimer);
  if(riding()){firing=false;dirty=false;jumpRequested=false;inputPrediction.reset(state.serverNow);}
  updateExitDoor(gameMap,state,Date.now()+floorClockOffset);
  gameMessage.textContent=state.phase==='ready'?'Floor clear · Exit elevator unlocked (E on minimap)':
    state.phase==='riding'?`Ascending to floor ${state.floor+1}…`:
    state.phase==='opening'?`Floor ${state.floor} · Doors opening`:localPlayer?.alive?'':eliminatedMessage();
  updateGameInfo();
}
socket.on('floorState',applyFloorState);
socket.on('floorStarting',data=>{
  const angle=localPlayer?.angle,wasAlive=localPlayer?.alive;
  players=data.players;walls=data.walls;gameMap=data.map;mapSolids=[...walls,...gameMap.terrain];
  updateArenaLabel(gameMap);
  localPlayer=players.find(p=>p.id===socket.id);
  if(localPlayer&&wasAlive&&Number.isFinite(angle))localPlayer.angle=angle+Math.PI;
  if(localPlayer?.alive&&!wasAlive){pitch=0;firing=false;keys.clear();}
  arena.build(walls,gameMap);
  snapshotMotion.clear();
  inputPrediction.reset(data.state.serverNow);jumpRequested=false;
  applyFloorState(data.state);
  arena.animateElevator(floorState,Date.now()+floorClockOffset);
  lookPrompt.textContent='Click to resume';
  lookPrompt.hidden=locked()||!localPlayer?.alive;
});
function eliminatedMessage() {
  return gameMap.mode==='pve'?'Spectating · You’ll respawn next floor if your team survives':'You were eliminated · Spectating';
}
socket.on('playerKilled', (id,death) => {
  const player = players.find(p => p.id === id); if (!player) return;
  if(arena&&gameActive)arena.characterDeath(player,death);
  player.alive = false; player.health = 0; updateGameInfo();
  if (id === socket.id) { releaseMouse(); lookPrompt.hidden = true; }
  gameMessage.textContent = id === socket.id ? eliminatedMessage() : `${player.name} was eliminated`;
  clearTimeout(messageTimer);
  if (id !== socket.id) messageTimer = setTimeout(() => { gameMessage.textContent = localPlayer?.alive ? '' : eliminatedMessage(); }, 3000);
});
socket.on('playerLeft', id => { players = players.filter(p => p.id !== id); updateGameInfo(); });
socket.on('gameOver', winner => {
  // Match lifecycle events are scoped server-side as well, but this guard
  // protects a newly joined lobby from any stale/in-flight result packet.
  if (!gameActive) return;
  gameActive = false; releaseMouse(); lookPrompt.hidden = true; clearTimeout(messageTimer);
  gameMessage.textContent = `Game over · ${winner.name} wins!`; clearTimeout(returnTimer);
  returnTimer = setTimeout(() => {
    returnTimer = null;
    if (!waitingScreen.classList.contains('hidden') || !weaponScreen.classList.contains('hidden')) return;
    stop(); setActiveScreen(loginScreen); nameInput.value = '';
  }, 5000);
});
socket.on('resetGame', stop);
socket.on('disconnect', () => { stop(); gameMessage.textContent = 'Connection lost. Reconnect to join another match.'; });
