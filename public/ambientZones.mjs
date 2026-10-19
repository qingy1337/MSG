import * as THREE from 'three';

export function planAmbientZones(map) {
  if(map.mode!=='pve')return {baseline:1,zones:[]};
  let state=(map.seed^0x5a17b9d3)>>>0;
  const brightness=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return 0.5+state/4294967296*0.5;};
  const baseline=brightness();
  const areas=map.zones?.length?map.zones:[...(map.pockets||[]),...map.terrain.filter(s=>s.walkable||s.stairs),map.elevator].filter(Boolean);
  return {baseline,zones:areas.slice(0,12).map(s=>({x:s.x+s.width/2,y:s.y+s.height/2,
    width:s.width,height:s.height,brightness:brightness(),role:s.role}))};
}

export const ambientZoneGLSL=`
uniform float zoneBaseline;
uniform int zoneCount;
uniform vec4 zoneBounds[12];
uniform float zoneBrightness[12];
uniform bool ambientMapEnabled;
uniform sampler2D ambientMap;
uniform vec2 ambientMapOrigin;
uniform vec2 ambientMapInverseSize;
float ambientAt(vec2 p) {
  if(ambientMapEnabled) {
    vec2 uv=clamp((p-ambientMapOrigin)*ambientMapInverseSize,vec2(0.0),vec2(1.0));
    return texture2D(ambientMap,uv).r;
  }
  float sum=0.0,weight=0.0;
  for(int i=0;i<12;i++) {
    if(i>=zoneCount)break;
    vec2 outside=max(abs(p-zoneBounds[i].xy)-zoneBounds[i].zw,vec2(0.0));
    float w=1.0-smoothstep(0.0,2.0,length(outside));
    sum+=w*zoneBrightness[i];weight+=w;
  }
  return (sum+zoneBaseline*max(0.0,1.0-weight))/max(1.0,weight);
}`;

function sampleAmbient(plan,x,y) {
  let sum=0,weight=0;
  for(const zone of plan.zones) {
    const cx=(zone.x-450)*.05,cy=(zone.y-300)*.05,halfWidth=zone.width*.025,halfHeight=zone.height*.025;
    const outsideX=Math.max(Math.abs(x-cx)-halfWidth,0),outsideY=Math.max(Math.abs(y-cy)-halfHeight,0);
    const distance=Math.hypot(outsideX,outsideY),t=Math.max(0,Math.min(1,distance/2));
    const smooth=t*t*(3-2*t),influence=1-smooth;
    sum+=influence*zone.brightness;weight+=influence;
  }
  return (sum+plan.baseline*Math.max(0,1-weight))/Math.max(1,weight);
}

function createAmbientMap(plan,map,resolution=192) {
  if(!map||(!plan.zones.length&&plan.baseline===1))return null;
  const data=new Uint8Array(resolution*resolution),originX=-450*.05,originY=-300*.05;
  const width=Math.max(.001,map.width*.05),height=Math.max(.001,map.height*.05);
  for(let y=0;y<resolution;y++)for(let x=0;x<resolution;x++) {
    const wx=originX+(x+.5)/resolution*width,wy=originY+(y+.5)/resolution*height;
    data[y*resolution+x]=Math.round(Math.max(0,Math.min(1,sampleAmbient(plan,wx,wy)))*255);
  }
  const texture=new THREE.DataTexture(data,resolution,resolution,THREE.RedFormat,THREE.UnsignedByteType);
  texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=false;texture.needsUpdate=true;
  return {texture,origin:new THREE.Vector2(originX,originY),inverseSize:new THREE.Vector2(1/width,1/height)};
}

export function ambientZoneUniforms(plan,map) {
  const lookup=createAmbientMap(plan,map);
  return {
    zoneBaseline:{value:plan.baseline},zoneCount:{value:plan.zones.length},
    zoneBounds:{value:Array.from({length:12},(_,i)=>{
      const z=plan.zones[i];return z?new THREE.Vector4((z.x-450)*0.05,(z.y-300)*0.05,z.width*0.025,z.height*0.025):new THREE.Vector4();
    })},
    zoneBrightness:{value:Array.from({length:12},(_,i)=>plan.zones[i]?.brightness||1)},
    ambientMapEnabled:{value:!!lookup},ambientMap:{value:lookup?.texture||null},
    ambientMapOrigin:{value:lookup?.origin||new THREE.Vector2()},
    ambientMapInverseSize:{value:lookup?.inverseSize||new THREE.Vector2(1,1)},
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
