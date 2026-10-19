const READY_FLASH_MS=140;

export function createMinigunSpoolHud(document) {
  const track=document.getElementById('minigun-spool-track');
  const fill=document.getElementById('minigun-spool-fill');
  let previousVisible=null,previousReady=null,previousPercent=-1;
  return (elapsedMs=null,durationMs=200)=>{
    const active=Number.isFinite(elapsedMs)&&elapsedMs>=0;
    const elapsed=active?elapsedMs:0;
    const percent=Math.min(100,Math.max(0,elapsed/Math.max(1,durationMs)*100));
    const ready=active&&elapsed>=durationMs;
    const visible=active&&elapsed<=durationMs+READY_FLASH_MS,rounded=Math.round(percent);
    if(previousVisible!==visible){previousVisible=visible;track.hidden=!visible;}
    if(previousReady!==ready){previousReady=ready;track.classList.toggle('ready',ready);}
    if(previousPercent!==rounded){previousPercent=rounded;fill.style.width=`${percent}%`;
      track.setAttribute('aria-valuenow',String(rounded));}
  };
}

export {READY_FLASH_MS};
