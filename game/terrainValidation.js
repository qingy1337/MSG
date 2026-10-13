const {NavigationGraph}=require('./navigation');

// Ground connectivity is checked during placement. Validate the additional
// vertical route network with the same body/headroom/stair rules bots use.
// Moving lifts are deliberately unavailable: no area may depend on lift timing.
function raisedTerrainConnected(map,walls) {
  const decks=map.terrain.filter(s=>s.walkable);
  if(!decks.length)return true;
  const terrain=map.terrain.filter(s=>s.kind!=='exitDoor');
  const graph=new NavigationGraph({...map,terrain},walls);
  const e=map.arrivalElevator||map.elevator;
  const start={x:e.x+80,y:e.y+110,height:0};
  for(const deck of decks) {
    let target=null;
    for(let y=deck.y+24;y<deck.y+deck.height-20&&!target;y+=24)
      for(let x=deck.x+24;x<deck.x+deck.width-20&&!target;x+=24) {
        const id=graph.nearest({x,y,height:deck.top});
        if(id>=0&&Math.abs(graph.heights[id]-deck.top)<0.01)target=graph.point(id);
      }
    if(!target||!graph.find(start,target).length)return false;
  }
  for(const spawn of map.upperBotSpawns||[])if(!graph.find(start,spawn).length)return false;
  return true;
}
module.exports={raisedTerrainConnected};
