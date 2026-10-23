const {groundHeight,canOccupy,moveOnTerrain,rampStepAllowance,walkingHeight,
  horizontalClearance,ceilingHeightAt,withinPlayableFootprint}=require('../public/arenaMap');
const DIRECTIONS=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];

class Heap {
  constructor(){this.items=[];}
  push(node){const a=this.items;let i=a.length;a.push(node);while(i){const p=(i-1)>>1;if(a[p].f<=node.f)break;a[i]=a[p];i=p;}a[i]=node;}
  pop(){const a=this.items,first=a[0],last=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let c=i*2+1;if(c+1<a.length&&a[c+1].f<a[c].f)c++;if(a[c].f>=last.f)break;a[i]=a[c];i=c;}a[i]=last;}return first;}
}

function sectorBounds(sector) {
  const bounds=sector.bounds||sector;
  return {x:bounds.x||0,y:bounds.y||0,width:bounds.width||0,height:bounds.height||0,
    bottom:Number.isFinite(bounds.bottom)?bounds.bottom:Number.isFinite(sector.bottom)?sector.bottom:-Infinity,
    top:Number.isFinite(bounds.top)?bounds.top:Number.isFinite(sector.top)?sector.top:Infinity};
}

function belongsToSector(surface,id) {
  const assigned=surface.strikeSector??surface.sectorId;
  if(assigned==null)return true;
  return Array.isArray(assigned)?assigned.includes(id):assigned===id;
}

function endpointFor(link,side) {
  const key=side==='from'?'a':'b',declared=link[side];
  const point=link[key]||(declared&&typeof declared==='object'?declared:null)||link[`${side}Point`];
  const sector=typeof declared==='string'?declared:declared?.zone||declared?.sector||declared?.strikeSector||
    declared?.sectorId||link[`${side}Sector`]||point?.zone||point?.sector||point?.strikeSector||point?.sectorId;
  return point?{...point,sector}:null;
}

function axisSamples(min,max,size) {
  if(max<min)return [];
  if(max-min<1e-6)return[(min+max)/2];
  const count=Math.max(1,Math.ceil((max-min)/size));
  return Array.from({length:count+1},(_,index)=>min+(max-min)*index/count);
}

// Legacy arenas retain their dense two-layer lattice. Authored missions opt in
// to sparse bounded sectors, permitting many floors at the same XY without a
// world-sized three-dimensional grid.
class NavigationGraph {
  constructor(map,walls,ogre=false) {
    this.map=map;this.ogre=ogre;this.radius=ogre?30:16;this.bodyHeight=ogre?3.8:2.2;
    this.edgeCache=new Map();this.edgeChecks=0;this.bucketSize=128;this.buckets=new Map();
    // The cached graph describes eventual routes. Live movement and hitscan
    // still receive closed shutters until their encounter opens them.
    this.solids=[...(walls||[]),...(map.terrain||[])].map(surface=>surface.kind==='strikeDoor'?
      {...surface,nonSolid:true}:surface.dynamicId&&surface.kind==='ramp'&&surface.nonSolid?
      {...surface,nonSolid:false}:surface.kind==='lift'?{...surface,top:surface.maxTop}:
      surface.liftId?{...surface,bottom:0,top:map.ceiling}:surface);
    this.surfaces=this.solids.filter(surface=>!surface.nonSolid&&surface.kind!=='ceilingPanel'&&
      (surface.walkable||surface.platform===true||surface.kind==='ramp'||surface.kind==='heightfield'));
    this.indexSolids();
    this.sectorMode=Array.isArray(map.strikeSectors)&&map.strikeSectors.length>0;
    if(this.sectorMode)this.buildSectorGraph(map.strikeSectors,map.navLinks||[]);
    else this.buildLegacyGraph();
  }

  indexSolids() {
    for(const surface of this.solids) {
      if(!Number.isFinite(surface.x)||!Number.isFinite(surface.y)||
        !Number.isFinite(surface.width)||!Number.isFinite(surface.height))continue;
      const minX=Math.floor(surface.x/this.bucketSize),maxX=Math.floor((surface.x+surface.width)/this.bucketSize);
      const minY=Math.floor(surface.y/this.bucketSize),maxY=Math.floor((surface.y+surface.height)/this.bucketSize);
      for(let by=minY;by<=maxY;by++)for(let bx=minX;bx<=maxX;bx++) {
        const key=`${bx},${by}`;
        if(!this.buckets.has(key))this.buckets.set(key,[]);
        this.buckets.get(key).push(surface);
      }
    }
  }

  near(a,b) {
    const found=new Set(),padding=this.radius+4;
    const minX=Math.floor((Math.min(a.x,b.x)-padding)/this.bucketSize);
    const maxX=Math.floor((Math.max(a.x,b.x)+padding)/this.bucketSize);
    const minY=Math.floor((Math.min(a.y,b.y)-padding)/this.bucketSize);
    const maxY=Math.floor((Math.max(a.y,b.y)+padding)/this.bucketSize);
    for(let by=minY;by<=maxY;by++)for(let bx=minX;bx<=maxX;bx++)
      for(const surface of this.buckets.get(`${bx},${by}`)||[])found.add(surface);
    return [...found];
  }

  clear(a,b) {
    const startHeight=a.height??groundHeight(a.x,a.y,this.surfaces);
    const actor={...a,height:startHeight,groundHeight:startHeight,
      botType:this.ogre?'ogre':'soldier',bodyHeight:this.bodyHeight};
    return moveOnTerrain(actor,b.x,b.y,this.map,this.near(a,b),0)&&actor.jumpStartedAt==null&&
      (b.height==null||Math.abs(actor.height-b.height)<.3)&&
      Math.hypot(actor.x-b.x,actor.y-b.y)<.1;
  }

  buildLegacyGraph() {
    this.size=16;this.cols=Math.ceil(this.map.width/16);this.rows=Math.ceil(this.map.height/16);
    this.cells=this.cols*this.rows;
    const count=this.cells*2;this.open=new Uint8Array(count);this.heights=new Float32Array(count);
    for(let id=0;id<count;id++) {
      const point=this.legacyPoint(id),upper=groundHeight(point.x,point.y,this.surfaces);
      const height=id<this.cells?upper:0;this.heights[id]=height;
      if(id>=this.cells&&upper===0)continue;
      const ramps=this.surfaces.filter(surface=>surface.kind==='ramp'&&point.x>=surface.x&&
        point.x<=surface.x+surface.width&&point.y>=surface.y&&point.y<=surface.y+surface.height);
      const allowance=ramps.length?ramps.reduce((value,surface)=>
        Math.max(value,rampStepAllowance(surface,this.radius)),.28):.001;
      this.open[id]=point.x>=this.radius&&point.y>=this.radius&&
        point.x<=this.map.width-this.radius&&point.y<=this.map.height-this.radius&&
        withinPlayableFootprint(this.map,point.x,point.y,this.radius)&&
        height+this.bodyHeight<=this.map.ceiling&&
        canOccupy(point.x,point.y,height,this.near(point,point),this.radius,allowance,this.bodyHeight)?1:0;
    }
  }

  legacyPoint(id) {
    const cell=id%this.cells;
    return{x:(cell%this.cols)*16+8,y:Math.floor(cell/this.cols)*16+8,height:this.heights?.[id]||0};
  }

  legacyNearest(point,requireAccess=true) {
    const cx=Math.floor(point.x/16),cy=Math.floor(point.y/16);
    for(let radius=0;radius<=8;radius++)for(let y=cy-radius;y<=cy+radius;y++)
      for(let x=cx-radius;x<=cx+radius;x++) {
        if(radius&&Math.abs(x-cx)!==radius&&Math.abs(y-cy)!==radius)continue;
        if(x<0||y<0||x>=this.cols||y>=this.rows)continue;
        const candidates=[y*this.cols+x,y*this.cols+x+this.cells].sort((a,b)=>
          Math.abs(this.heights[a]-(point.height||0))-Math.abs(this.heights[b]-(point.height||0)));
        for(const id of candidates)if(this.open[id]&&(!requireAccess||this.clear(point,this.legacyPoint(id))))return id;
      }
    return -1;
  }

  legacyEdge(id,next) {
    const key=`legacy:${id}:${next}`;
    if(!this.edgeCache.has(key)) {
      this.edgeChecks++;
      this.edgeCache.set(key,this.clear(this.legacyPoint(id),this.legacyPoint(next)));
    }
    return this.edgeCache.get(key);
  }

  findLegacy(start,goal) {
    const from=this.legacyNearest(start),to=this.legacyNearest(goal,false);
    if(from<0||to<0)return[];
    const count=this.open.length,costs=new Float64Array(count).fill(Infinity);
    const parents=new Int32Array(count).fill(-1),closed=new Uint8Array(count),heap=new Heap();
    const goalPoint=this.legacyPoint(to),heuristic=id=>{
      const point=this.legacyPoint(id);return Math.hypot(point.x-goalPoint.x,point.y-goalPoint.y)/16;
    };
    costs[from]=0;heap.push({id:from,f:heuristic(from)});
    while(heap.items.length) {
      const {id}=heap.pop();if(closed[id])continue;closed[id]=1;
      if(id===to) {
        const path=[];for(let cursor=id;cursor!==-1;cursor=parents[cursor])path.push(this.legacyPoint(cursor));
        path.reverse();return this.smooth(path);
      }
      const cell=id%this.cells,x=cell%this.cols,y=Math.floor(cell/this.cols);
      for(let direction=0;direction<8;direction++)for(let layer=0;layer<2;layer++) {
        const [dx,dy]=DIRECTIONS[direction],nx=x+dx,ny=y+dy;
        if(nx<0||ny<0||nx>=this.cols||ny>=this.rows)continue;
        const next=layer*this.cells+ny*this.cols+nx;
        if(!this.open[next]||closed[next])continue;
        const candidate=costs[id]+(dx&&dy?Math.SQRT2:1);
        if(candidate>=costs[next]||!this.legacyEdge(id,next))continue;
        parents[next]=id;costs[next]=candidate;heap.push({id:next,f:candidate+heuristic(next)});
      }
    }
    return[];
  }

  sectorFloorHeights(sector,x,y,solids) {
    const bounds=sectorBounds(sector),target=Number.isFinite(sector.floorHeight)?sector.floorHeight:
      Number.isFinite(sector.elevation)?sector.elevation:null;
    const min=Number.isFinite(sector.floorMin)?sector.floorMin:bounds.bottom-.35;
    const max=Number.isFinite(sector.floorMax)?sector.floorMax:bounds.top-this.bodyHeight;
    const candidates=[];
    for(const surface of solids) {
      if(!this.surfaces.includes(surface)||!belongsToSector(surface,sector.id)||
        horizontalClearance(surface,x,y)>0)continue;
      const height=walkingHeight(surface,x,y);
      if(height>=min-1e-6&&height<=max+1e-6)candidates.push({height,
        assigned:(surface.strikeSector??surface.sectorId)!=null});
    }
    if(!candidates.length)return sector.virtualFloor&&target!=null?[target]:[];
    const authored=candidates.filter(candidate=>candidate.assigned);
    const selected=authored.length?authored:candidates;
    selected.sort((a,b)=>a.height-b.height);
    const unique=[];
    for(const candidate of selected)
      if(!unique.some(value=>Math.abs(value.height-candidate.height)<.08))unique.push(candidate);
    if(target!=null)unique.sort((a,b)=>Math.abs(a.height-target)-Math.abs(b.height-target));
    return(target!=null?unique.slice(0,1):unique).map(candidate=>candidate.height);
  }

  addSectorNode(point,sector,gridKey=null) {
    const id=this.nodes.length,node={id,x:point.x,y:point.y,height:point.height,
      sector:sector.id,zone:sector.id};
    this.nodes.push(node);this.adjacency.push(new Set());
    if(!this.nodesBySector.has(sector.id))this.nodesBySector.set(sector.id,[]);
    this.nodesBySector.get(sector.id).push(id);
    if(gridKey) {
      if(!this.gridNodes.has(gridKey))this.gridNodes.set(gridKey,[]);
      this.gridNodes.get(gridKey).push(id);
    }
    return id;
  }

  connectCandidates(one,two) {
    if(one===two)return;
    this.adjacency[one].add(two);this.adjacency[two].add(one);
  }

  validSectorPoint(sector,x,y,height,near) {
    const ramps=near.filter(surface=>surface.kind==='ramp'&&belongsToSector(surface,sector.id)&&
      horizontalClearance(surface,x,y)<=0&&Math.abs(walkingHeight(surface,x,y)-height)<.3);
    const allowance=ramps.reduce((value,surface)=>Math.max(value,rampStepAllowance(surface,this.radius)),.001);
    return canOccupy(x,y,height,near,this.radius,allowance,this.bodyHeight)&&
      ceilingHeightAt(x,y,height,near,this.radius)>=height+this.bodyHeight-.001;
  }

  buildSectorGraph(sectors,links) {
    this.size=0;this.sectors=sectors;this.sectorById=new Map(sectors.map(sector=>[sector.id,sector]));
    this.nodes=[];this.adjacency=[];this.nodesBySector=new Map();this.gridNodes=new Map();
    this.invalidLinks=[];this.dynamicLinks=[];this.explicitEdges=new Set();this.sectorSizes=new Map();
    for(const sector of sectors) {
      if(!sector?.id||this.nodesBySector.has(sector.id))continue;
      const bounds=sectorBounds(sector),size=Math.max(8,sector.navCellSize||48);
      this.sectorSizes.set(sector.id,size);this.nodesBySector.set(sector.id,[]);
      const xs=axisSamples(bounds.x+this.radius,bounds.x+bounds.width-this.radius,size);
      const ys=axisSamples(bounds.y+this.radius,bounds.y+bounds.height-this.radius,size);
      for(let iy=0;iy<ys.length;iy++)for(let ix=0;ix<xs.length;ix++) {
        const x=xs[ix],y=ys[iy],near=this.near({x,y},{x,y});
        for(const height of this.sectorFloorHeights(sector,x,y,near)) {
          if(!this.validSectorPoint(sector,x,y,height,near))continue;
          this.addSectorNode({x,y,height},sector,`${sector.id}:${ix}:${iy}`);
        }
      }
      for(let iy=0;iy<ys.length;iy++)for(let ix=0;ix<xs.length;ix++) {
        const here=this.gridNodes.get(`${sector.id}:${ix}:${iy}`)||[];
        for(const [dx,dy] of [[1,0],[0,1],[1,1],[-1,1]]) {
          const there=this.gridNodes.get(`${sector.id}:${ix+dx}:${iy+dy}`)||[];
          for(const one of here)for(const two of there)this.connectCandidates(one,two);
        }
      }
    }
    for(const link of links)this.addNavLink(link);
    this.cells=this.nodes.length;this.open=new Uint8Array(this.cells).fill(1);
    this.heights=Float32Array.from(this.nodes.map(node=>node.height));
  }

  anchorFor(endpoint,linkId,side) {
    if(!endpoint?.sector||!this.sectorById.has(endpoint.sector))return{error:`${side}-sector-missing`};
    const sector=this.sectorById.get(endpoint.sector),height=endpoint.height??endpoint.top;
    if(!Number.isFinite(endpoint.x)||!Number.isFinite(endpoint.y)||!Number.isFinite(height))
      return{error:`${side}-point-invalid`};
    const existing=(this.nodesBySector.get(sector.id)||[]).map(id=>this.nodes[id]).find(node=>
      Math.hypot(node.x-endpoint.x,node.y-endpoint.y)<.1&&Math.abs(node.height-height)<.08);
    if(existing)return{id:existing.id};
    const near=this.near(endpoint,endpoint);
    if(!this.validSectorPoint(sector,endpoint.x,endpoint.y,height,near))return{error:`${side}-blocked`};
    const id=this.addSectorNode({x:endpoint.x,y:endpoint.y,height},sector);
    const limit=Math.max(72,(this.sectorSizes.get(sector.id)||48)*2.1);
    const candidates=(this.nodesBySector.get(sector.id)||[]).filter(candidate=>candidate!==id)
      .map(candidate=>({id:candidate,node:this.nodes[candidate]}))
      .filter(candidate=>Math.hypot(candidate.node.x-endpoint.x,candidate.node.y-endpoint.y)<=limit)
      .sort((a,b)=>Math.hypot(a.node.x-endpoint.x,a.node.y-endpoint.y)-
        Math.hypot(b.node.x-endpoint.x,b.node.y-endpoint.y)).slice(0,24);
    for(const candidate of candidates)this.connectCandidates(id,candidate.id);
    if(!candidates.length)return{error:`${side}-isolated`,id};
    return{id};
  }

  addNavLink(link) {
    // Player-operated hoists are tested against their two dock states, but
    // bots deliberately use the permanent maintenance ascent. Keeping the
    // hoist out of the static graph prevents a vertical teleport whenever the
    // platform happens to be at the other landing.
    if(link.mode==='lift'){this.dynamicLinks.push(link);return;}
    const from=endpointFor(link,'from'),to=endpointFor(link,'to');
    const a=this.anchorFor(from,link.id,'from'),b=this.anchorFor(to,link.id,'to');
    if(a.error||b.error){this.invalidLinks.push({id:link.id,reason:a.error||b.error});return;}
    // Links describe real apertures, ramps, and catwalk seams. Reject vertical
    // teleports: player-only hoists must never become magical bot routes.
    if(!this.clear(from,to)||(link.bidirectional!==false&&!this.clear(to,from))) {
      this.invalidLinks.push({id:link.id,reason:'not-physically-walkable'});return;
    }
    this.connectCandidates(a.id,b.id);this.explicitEdges.add(`${a.id}:${b.id}`);
    if(link.bidirectional!==false)this.explicitEdges.add(`${b.id}:${a.id}`);
    else this.adjacency[b.id].delete(a.id);
  }

  point(id) {return this.sectorMode?this.nodes[id]:this.legacyPoint(id);}

  distanceToSector(point,sector) {
    const bounds=sectorBounds(sector),cx=Math.max(bounds.x,Math.min(point.x,bounds.x+bounds.width));
    const cy=Math.max(bounds.y,Math.min(point.y,bounds.y+bounds.height));
    const cz=Math.max(bounds.bottom,Math.min(point.height??0,bounds.top));
    return Math.hypot(point.x-cx,point.y-cy,((point.height??0)-cz)*20);
  }

  sectorsForPoint(point) {
    const named=point.zone??point.sector??point.strikeSector??point.sectorId;
    if(named&&this.sectorById.has(named))return[this.sectorById.get(named)];
    const height=point.height??0;
    const containing=this.sectors.filter(sector=>{const bounds=sectorBounds(sector);
      return point.x>=bounds.x-.1&&point.x<=bounds.x+bounds.width+.1&&
        point.y>=bounds.y-.1&&point.y<=bounds.y+bounds.height+.1&&
        height>=bounds.bottom-.35&&height<=bounds.top+.35;});
    if(containing.length)return containing;
    return[...this.sectors].sort((a,b)=>this.distanceToSector(point,a)-this.distanceToSector(point,b)).slice(0,2);
  }

  sectorCandidates(point,requireAccess,accessFromNode=false) {
    const ids=this.sectorsForPoint(point).flatMap(sector=>this.nodesBySector.get(sector.id)||[]);
    return ids.map(id=>({id,node:this.nodes[id]})).sort((a,b)=>{
      const score=candidate=>Math.hypot(candidate.x-point.x,candidate.y-point.y)+
        Math.abs(candidate.height-(point.height??0))*20;
      return score(a.node)-score(b.node);
    }).filter(candidate=>!requireAccess||
      (accessFromNode?this.clear(candidate.node,point):this.clear(point,candidate.node)));
  }

  nearest(point,requireAccess=true,accessFromNode=false) {
    if(!this.sectorMode)return this.legacyNearest(point,requireAccess);
    return this.sectorCandidates(point,requireAccess,accessFromNode)[0]?.id??-1;
  }

  sectorEdge(id,next) {
    const key=`sector:${id}:${next}`;
    if(this.explicitEdges.has(`${id}:${next}`))return true;
    if(!this.edgeCache.has(key)) {
      this.edgeChecks++;
      this.edgeCache.set(key,this.clear(this.nodes[id],this.nodes[next]));
    }
    return this.edgeCache.get(key);
  }

  smooth(path) {
    if(path.length<3)return path;
    const result=[];let index=0;
    while(index<path.length) {
      result.push(path[index]);let next=index+1;
      for(let candidate=Math.min(path.length-1,index+8);candidate>index+1;candidate--) {
        const sameSector=!this.sectorMode||path[index].sector===path[candidate].sector;
        if(sameSector&&this.clear(path[index],path[candidate])){next=candidate;break;}
      }
      index=next;
    }
    return result;
  }

  findSector(start,goal) {
    const starts=this.sectorCandidates(start,true,false).slice(0,8);
    const goals=this.sectorCandidates(goal,true,true).slice(0,8);
    if(!starts.length||!goals.length)return[];
    const goalSet=new Set(goals.map(candidate=>candidate.id)),count=this.nodes.length;
    const costs=new Float64Array(count).fill(Infinity),parents=new Int32Array(count).fill(-1);
    const closed=new Uint8Array(count),heap=new Heap();
    const heuristic=id=>{const node=this.nodes[id];let best=Infinity;
      for(const candidate of goals)best=Math.min(best,Math.hypot(node.x-candidate.node.x,node.y-candidate.node.y)+
        Math.abs(node.height-candidate.node.height)*20);
      return best/Math.max(8,this.sectorSizes.get(node.sector)||48);
    };
    for(const candidate of starts){costs[candidate.id]=0;heap.push({id:candidate.id,f:heuristic(candidate.id)});}
    while(heap.items.length) {
      const {id}=heap.pop();if(closed[id])continue;closed[id]=1;
      if(goalSet.has(id)) {
        const path=[];for(let cursor=id;cursor!==-1;cursor=parents[cursor])path.push(this.nodes[cursor]);
        path.reverse();return this.smooth(path);
      }
      for(const next of this.adjacency[id]) {
        if(closed[next]||!this.sectorEdge(id,next))continue;
        const a=this.nodes[id],b=this.nodes[next];
        const distance=Math.hypot(a.x-b.x,a.y-b.y)+Math.abs(a.height-b.height)*20;
        const candidate=costs[id]+distance;
        if(candidate>=costs[next])continue;
        parents[next]=id;costs[next]=candidate;heap.push({id:next,f:candidate+heuristic(next)});
      }
    }
    return[];
  }

  find(start,goal) {return this.sectorMode?this.findSector(start,goal):this.findLegacy(start,goal);}
}

module.exports={NavigationGraph,sectorBounds,belongsToSector};
