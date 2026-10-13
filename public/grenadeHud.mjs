export function createGrenadeHud(document) {
  const hud=document.getElementById('grenade-hud');
  const icons=[...hud.querySelectorAll('.grenade-icon')];
  const track=document.getElementById('grenade-charge-track');
  const fill=document.getElementById('grenade-charge');
  let previousCount=-1;
  return (count,chargeMs=null)=>{
    const available=Math.max(0,Math.min(3,Math.floor(count||0)));
    if(available!==previousCount) {
      icons.forEach((icon,i)=>icon.classList.toggle('available',i<available));
      hud.setAttribute('aria-label',`${available} of 3 grenades available`);
      previousCount=available;
    }
    const percent=chargeMs==null?0:Math.min(100,Math.max(0,chargeMs/12));
    track.hidden=chargeMs==null;
    fill.style.height=`${percent}%`;
    track.setAttribute('aria-valuenow',String(Math.round(percent)));
  };
}
