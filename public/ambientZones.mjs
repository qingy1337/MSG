import * as THREE from 'three';

export function planAmbientZones(map) {
  if(map.mode!=='pve')return {baseline:1,zones:[]};
  let state=(map.seed^0x5a17b9d3)>>>0;
  const brightness=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return 0.5+state/4294967296*0.5;};
  const baseline=brightness();
  const areas=[...(map.pockets||[]),...map.terrain.filter(s=>s.walkable||s.stairs),map.elevator].filter(Boolean);
  return {baseline,zones:areas.slice(0,12).map(s=>({x:s.x+s.width/2,y:s.y+s.height/2,
    width:s.width,height:s.height,brightness:brightness()}))};
}

export const ambientZoneGLSL=`
uniform float zoneBaseline;
uniform int zoneCount;
uniform vec4 zoneBounds[12];
uniform float zoneBrightness[12];
float ambientAt(vec2 p) {
  float sum=0.0,weight=0.0;
  for(int i=0;i<12;i++) {
    if(i>=zoneCount)break;
    vec2 outside=max(abs(p-zoneBounds[i].xy)-zoneBounds[i].zw,vec2(0.0));
    float w=1.0-smoothstep(0.0,2.0,length(outside));
    sum+=w*zoneBrightness[i];weight+=w;
  }
  return (sum+zoneBaseline*max(0.0,1.0-weight))/max(1.0,weight);
}`;

export function ambientZoneUniforms(plan) {
  return {
    zoneBaseline:{value:plan.baseline},zoneCount:{value:plan.zones.length},
    zoneBounds:{value:Array.from({length:12},(_,i)=>{
      const z=plan.zones[i];return z?new THREE.Vector4((z.x-450)*0.05,(z.y-300)*0.05,z.width*0.025,z.height*0.025):new THREE.Vector4();
    })},
    zoneBrightness:{value:Array.from({length:12},(_,i)=>plan.zones[i]?.brightness||1)},
  };
}

// Scale only indirect fill: lamps, direct shadows, and emissive details stay intact.
export function applyAmbientZones(group,uniforms) {
  group.traverse(object=>{
    for(const material of (Array.isArray(object.material)?object.material:[object.material])) {
      if(!material?.isMeshStandardMaterial||material.userData.ambientZones)continue;
      material.userData.ambientZones=true;
      material.onBeforeCompile=shader=>{
        Object.assign(shader.uniforms,uniforms);
        shader.vertexShader='varying vec3 ambientWorld;\n'+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',
          '#include <project_vertex>\nambientWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
        shader.fragmentShader='varying vec3 ambientWorld;\n'+ambientZoneGLSL+'\n'+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_begin>',
          '#include <lights_fragment_begin>\n#if defined(RE_IndirectDiffuse)\nirradiance*=ambientAt(ambientWorld.xz);\n#endif');
      };
      material.customProgramCacheKey=()=> 'spatial-ambient-v1';
      material.needsUpdate=true;
    }
  });
}
