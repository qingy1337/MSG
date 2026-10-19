export function createGrenadeHud(document) {
  const hud=document.getElementById('grenade-hud');
  const icons=[...hud.querySelectorAll('.grenade-icon')];
  const track=document.getElementById('grenade-charge-track');
  const fill=document.getElementById('grenade-charge');
  let previousCount=-1,previousActive=null,previousPercent=-1;
  return (count,chargeMs=null)=>{
    const available=Math.max(0,Math.min(3,Math.floor(count||0)));
    if(available!==previousCount) {
      icons.forEach((icon,i)=>icon.classList.toggle('available',i<available));
      hud.setAttribute('aria-label',`${available} of 3 grenades available`);
      previousCount=available;
    }
    const percent=chargeMs==null?0:Math.min(100,Math.max(0,chargeMs/12));
    const active=chargeMs!=null,rounded=Math.round(percent);
    if(previousActive!==active){previousActive=active;track.hidden=!active;}
    if(previousPercent!==rounded){previousPercent=rounded;fill.style.height=`${percent}%`;
      track.setAttribute('aria-valuenow',String(rounded));}
  };
}
