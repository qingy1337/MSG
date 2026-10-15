const READY_FLASH_MS=140;

export function createMinigunSpoolHud(document) {
  const track=document.getElementById('minigun-spool-track');
  const fill=document.getElementById('minigun-spool-fill');
  return (elapsedMs=null,durationMs=200)=>{
    const active=Number.isFinite(elapsedMs)&&elapsedMs>=0;
    const elapsed=active?elapsedMs:0;
    const percent=Math.min(100,Math.max(0,elapsed/Math.max(1,durationMs)*100));
    const ready=active&&elapsed>=durationMs;
    track.hidden=!active||elapsed>durationMs+READY_FLASH_MS;
    track.classList.toggle('ready',ready);
    fill.style.width=`${percent}%`;
    track.setAttribute('aria-valuenow',String(Math.round(percent)));
  };
}

export {READY_FLASH_MS};
