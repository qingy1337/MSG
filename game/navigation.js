const {groundHeight,canOccupy,moveOnTerrain,rampStepAllowance}=require('../public/arenaMap');
const DIRECTIONS=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];

class Heap {
  constructor(){this.items=[];}
  push(node){const a=this.items;let i=a.length;a.push(node);while(i){const p=(i-1)>>1;if(a[p].f<=node.f)break;a[i]=a[p];i=p;}a[i]=node;}
  pop(){const a=this.items,first=a[0],last=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let c=i*2+1;if(c+1<a.length&&a[c+1].f<a[c].f)c++;if(a[c].f>=last.f)break;a[i]=a[c];i=c;}a[i]=last;}return first;}
}

// One static graph per floor/body profile, owned exclusively by the worker.
// Lifts are sealed for planning: bots use the permanent stair routes.
class NavigationGraph {
  constructor(map,walls,ogre=false) {
    this.map=map;this.ogre=ogre;this.radius=ogre?30:16;this.bodyHeight=ogre?3.8:2.2;
    this.size=16;this.cols=Math.ceil(map.width/16);this.rows=Math.ceil(map.height/16);
    this.solids=[...walls,...map.terrain].map(s=>s.kind==='lift'?{...s,top:s.maxTop}:s.liftId?{...s,bottom:0,top:map.ceiling}:s);
    this.surfaces=this.solids.filter(s=>s.walkable||s.kind==='ramp');
    this.cells=this.cols*this.rows;
    const n=this.cells*2;this.open=new Uint8Array(n);this.heights=new Float32Array(n);
    this.edgeCache=new Map();
    this.edgeChecks=0;
    // Broad phase: local collision queries don't scan every wall on the floor.
    this.buckets=new Map();this.bucketSize=128;
    for(const s of this.solids)for(let y=Math.floor(s.y/128);y<=Math.floor((s.y+s.height)/128);y++)
      for(let x=Math.floor(s.x/128);x<=Math.floor((s.x+s.width)/128);x++){
        const key=`${x},${y}`;if(!this.buckets.has(key))this.buckets.set(key,[]);this.buckets.get(key).push(s);
      }
    for(let id=0;id<n;id++){
      const p=this.point(id),upper=groundHeight(p.x,p.y,this.surfaces),height=id<this.cells?upper:0;this.heights[id]=height;
      if(id>=this.cells&&upper===0)continue;
      const ramps=this.surfaces.filter(s=>s.kind==='ramp'&&p.x>=s.x&&p.x<=s.x+s.width&&p.y>=s.y&&p.y<=s.y+s.height);
      const allowance=ramps.length?ramps.reduce((value,s)=>Math.max(value,rampStepAllowance(s,this.radius)),.28):0.001;
      this.open[id]=p.x>=this.radius&&p.y>=this.radius&&p.x<=map.width-this.radius&&p.y<=map.height-this.radius&&
        height+this.bodyHeight<=map.ceiling&&canOccupy(p.x,p.y,height,this.near(p,p),this.radius,allowance,this.bodyHeight)?1:0;
    }
  }
  point(id){const cell=id%this.cells;return {x:(cell%this.cols)*16+8,y:Math.floor(cell/this.cols)*16+8,height:this.heights?.[id]||0};}
  near(a,b){const found=new Set(),r=this.radius+4;
    for(let y=Math.floor((Math.min(a.y,b.y)-r)/128);y<=Math.floor((Math.max(a.y,b.y)+r)/128);y++)
      for(let x=Math.floor((Math.min(a.x,b.x)-r)/128);x<=Math.floor((Math.max(a.x,b.x)+r)/128);x++)
        for(const s of this.buckets.get(`${x},${y}`)||[])found.add(s);
    return [...found];
  }
  clear(a,b){const p={...a,height:a.height??groundHeight(a.x,a.y,this.surfaces),botType:this.ogre?'ogre':'soldier',bodyHeight:this.bodyHeight};
    return moveOnTerrain(p,b.x,b.y,this.map,this.near(a,b),0)&&p.jumpStartedAt==null&&
      (b.height==null||Math.abs(p.height-b.height)<0.3);
  }
  nearest(p,requireAccess=true){const cx=Math.floor(p.x/16),cy=Math.floor(p.y/16);
    for(let r=0;r<=8;r++)for(let y=cy-r;y<=cy+r;y++)for(let x=cx-r;x<=cx+r;x++){
      if(r&&Math.abs(x-cx)!==r&&Math.abs(y-cy)!==r)continue;
      if(x<0||y<0||x>=this.cols||y>=this.rows)continue;
      const candidates=[y*this.cols+x,y*this.cols+x+this.cells].sort((a,b)=>Math.abs(this.heights[a]-(p.height||0))-Math.abs(this.heights[b]-(p.height||0)));
      for(const id of candidates)if(this.open[id]&&(!requireAccess||this.clear(p,this.point(id))))return id;
    }return -1;
  }
  edge(id,d,next){const key=id*this.open.length+next;
    if(!this.edgeCache.has(key)){this.edgeChecks++;this.edgeCache.set(key,this.clear(this.point(id),this.point(next)));}
    return this.edgeCache.get(key);
  }
  find(start,goal){const from=this.nearest(start),to=this.nearest(goal,false);if(from<0||to<0)return [];
    const n=this.open.length,g=new Float64Array(n).fill(Infinity),parent=new Int32Array(n).fill(-1),closed=new Uint8Array(n),heap=new Heap();
    const goalPoint=this.point(to),heuristic=id=>{const p=this.point(id);return Math.hypot(p.x-goalPoint.x,p.y-goalPoint.y)/16;};
    g[from]=0;heap.push({id:from,f:heuristic(from)});
    while(heap.items.length){const {id}=heap.pop();if(closed[id])continue;closed[id]=1;
      if(id===to){const path=[];for(let p=id;p!==-1;p=parent[p])path.push(this.point(p));path.reverse();
        const result=[];let i=0;
        // Bounded lookahead smoothing; never O(path length squared).
        while(i<path.length){result.push(path[i]);let next=i+1;
          for(let j=Math.min(path.length-1,i+8);j>i+1;j--)if(this.clear(path[i],path[j])){next=j;break;}i=next;
        }return result;
      }
      const cell=id%this.cells,x=cell%this.cols,y=Math.floor(cell/this.cols);
      for(let d=0;d<8;d++)for(let layer=0;layer<2;layer++){const [dx,dy]=DIRECTIONS[d],nx=x+dx,ny=y+dy,next=layer*this.cells+ny*this.cols+nx;
        if(nx<0||ny<0||nx>=this.cols||ny>=this.rows||!this.open[next]||closed[next])continue;
        const cost=g[id]+(dx&&dy?Math.SQRT2:1);if(cost>=g[next]||!this.edge(id,d,next))continue;
        parent[next]=id;g[next]=cost;heap.push({id:next,f:cost+heuristic(next)});
      }
    }return [];
  }
}
module.exports={NavigationGraph};
