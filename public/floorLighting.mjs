import * as THREE from 'three';

// A floor light can only be blocked by solids inside the light pool's XY
// bounds. Preserve the exact ray/box test while keeping unrelated rooms out of
// the fragment shader's inner loop.
export function areaOccluderIndex(solids, areas, scale = 0.05, limit = 64) {
  const offsets = new Int32Array(6), counts = new Int32Array(6), indices = [];
  const visible = solids.slice(0, limit);
  for (let areaIndex = 0; areaIndex < Math.min(6, areas.length); areaIndex++) {
    const area = areas[areaIndex], radius = area.radius / scale;
    offsets[areaIndex] = indices.length;
    for (let solidIndex = 0; solidIndex < visible.length; solidIndex++) {
      const solid = visible[solidIndex];
      if (solid.x > area.x + radius || solid.x + solid.width < area.x - radius ||
        solid.y > area.y + radius || solid.y + solid.height < area.y - radius) continue;
      indices.push(solidIndex);
      counts[areaIndex]++;
    }
  }
  return { offsets, counts, indices: Int32Array.from(indices.length ? indices : [0]) };
}

// Spatial index for the fixed sun ray used by the floor shader. A wall only
// appears in cells touched by its projected floor shadow. The ray test itself
// remains unchanged, so this is culling rather than baked/approximate lighting.
export function shadowOccluderGrid(solids,map,scale=.05,limit=64,cols=32,rows=24) {
  const visible=solids.slice(0,limit),cells=Array.from({length:cols*rows},()=>[]);
  for(let index=0;index<visible.length;index++) {
    const solid=visible[index],lift=solid.liftId&&visible.find(item=>item.kind==='lift'&&item.id===solid.liftId);
    const dynamicTop=lift?(lift.maxTop??lift.top??0)+((solid.top??1)-(solid.bottom||0)):undefined;
    const bottom=(solid.bottom||0)-.02,top=(dynamicTop??solid.maxTop??solid.top??3.1)-.02;
    const offsetX0=Math.min(.5*bottom,.5*top)/scale,offsetX1=Math.max(.5*bottom,.5*top)/scale;
    const offsetY0=Math.min(.35*bottom,.35*top)/scale,offsetY1=Math.max(.35*bottom,.35*top)/scale;
    const minX=solid.x+offsetX0,maxX=solid.x+solid.width+offsetX1;
    const minY=solid.y+offsetY0,maxY=solid.y+solid.height+offsetY1;
    const fromX=Math.max(0,Math.floor(minX/map.width*cols)),toX=Math.min(cols-1,Math.floor(maxX/map.width*cols));
    const fromY=Math.max(0,Math.floor(minY/map.height*rows)),toY=Math.min(rows-1,Math.floor(maxY/map.height*rows));
    for(let y=fromY;y<=toY;y++)for(let x=fromX;x<=toX;x++)cells[y*cols+x].push(index);
  }
  const slots=Math.max(1,...cells.map(cell=>cell.length)),data=new Uint8Array(cols*rows*slots);
  for(let slot=0;slot<slots;slot++)for(let cell=0;cell<cells.length;cell++)
    data[slot*cells.length+cell]=(cells[cell][slot]??-1)+1;
  const texture=new THREE.DataTexture(data,cols,rows*slots,THREE.RedFormat,THREE.UnsignedByteType);
  texture.minFilter=texture.magFilter=THREE.NearestFilter;texture.generateMipmaps=false;texture.needsUpdate=true;
  return {texture,cols,rows,slots,cells};
}
