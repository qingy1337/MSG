import './armor.js';

export function createDashHud(document) {
  const hud=document.getElementById('dash-hud'),label=document.getElementById('dash-hud-label'),fill=document.getElementById('dash-hud-fill');
  const key=document.getElementById('armor-hud-key');
  let previousText='',previousPercent=-1,previousActive=false;
  return (player,mode,now)=>{
    const dash=player?.armorStats?.airDash,refill=player?.armorStats?.grenadeRefill;
    const available=player?.alive&&mode==='pve'&&(dash||refill);
    hud.hidden=!available;if(!available)return;
    if(key)key.textContent=dash?'SHIFT':'↻';
    const active=dash&&(player.dashRemaining||0)>0;
    if(active!==previousActive){hud.classList.toggle('is-dashing',active);previousActive=active;}
    const duration=dash?globalThis.ARMOR.DASH.cooldownMs:globalThis.ARMOR.GRENADE_REFILL_MS;
    const deadline=dash?(player.dashReadyAt||0):(player.grenadeRefillAt||now+duration);
    const remaining=Math.max(0,deadline-now);
    const text=refill?`Grenade refill · ${Math.ceil(remaining/1000)}s`:remaining>0?`Air dash · ${(remaining/1000).toFixed(1)}s`:
      player.dashUsedInAir?'Land to recharge':'Air dash';
    const percent=Math.round(Math.max(0,Math.min(1,1-remaining/duration))*100);
    if(text!==previousText){label.textContent=text;previousText=text;}
    if(percent!==previousPercent){fill.style.width=`${percent}%`;previousPercent=percent;}
  };
}
