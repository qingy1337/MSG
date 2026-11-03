const {canOccupy}=require('../public/arenaMap');
const {derivePvpSpawns}=require('../public/pvpMaps');
const {MOVEMENT}=require('../public/movement');

// Start each team around opposite reviewed spawn pockets. Every allocated
// position keeps its authored elevation and enough clearance for a player.
function pvpTeamSpawns(map,walls,players,teams) {
  const solids=[...walls,...(map.terrain||[])];
  let candidates=[...(map.spawns||[])];
  if(candidates.length<players.length)
    candidates.push(...derivePvpSpawns(map,walls,24));
  candidates=candidates.filter(p=>canOccupy(p.x,p.y,p.height||0,solids,MOVEMENT.radius,.001,2.2));
  let anchors=null,furthest=-1;
  for(const a of candidates)for(const b of candidates) {
    const distance=Math.hypot(a.x-b.x,a.y-b.y);
    if(distance>furthest){furthest=distance;anchors={blue:a,red:b};}
  }
  if(!anchors)return null;
  const result=new Map(),placed=[];
  const roster=['blue','red'].map(team=>players.filter(p=>teams.get(p.id)===team));
  for(let index=0;index<Math.max(...roster.map(list=>list.length));index++) {
    for(const list of roster) {
      const player=list[index];if(!player)continue;
      const anchor=anchors[teams.get(player.id)];
      const available=candidates.filter(p=>placed.every(other=>
        Math.hypot(p.x-other.x,p.y-other.y)>=MOVEMENT.radius*2+8));
      available.sort((a,b)=>Math.hypot(a.x-anchor.x,a.y-anchor.y)-Math.hypot(b.x-anchor.x,b.y-anchor.y));
      if(!available.length)return null;
      const spawn={...available[0]};result.set(player.id,spawn);placed.push(spawn);
    }
  }
  return result;
}
module.exports={pvpTeamSpawns};
