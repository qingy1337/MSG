import {Color} from 'three';
const BASE=new Color(0x617344),FLASH=new Color(0xff6860),GLOW=new Color(0xff3020);
// Continuous phase: two pulses/sec initially, five near detonation.
export function poseGrenadeFuse(material,remainingMs) {
  const elapsed=Math.max(0,Math.min(3,3-remainingMs/1000));
  const pulse=remainingMs>0?Math.pow(Math.max(0,Math.sin(2*Math.PI*(2*elapsed+.5*elapsed*elapsed))),3):0;
  material.color.copy(BASE).lerp(FLASH,pulse);
  material.emissive.copy(GLOW);material.emissiveIntensity=.8*pulse;
}
