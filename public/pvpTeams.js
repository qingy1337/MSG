(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else Object.assign(root,api);
})(globalThis,()=>{
  const PVP_TEAMS=Object.freeze({
    blue:Object.freeze({name:'Blue',color:'#4c9fff'}),
    red:Object.freeze({name:'Red',color:'#ef5b64'}),
  });
  function balancedPvpTeams(players) {
    return new Map(players.map((player,index)=>[player.id,index%2?'red':'blue']));
  }
  return {PVP_TEAMS,balancedPvpTeams};
});
