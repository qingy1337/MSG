(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else Object.assign(root,api);
})(globalThis,()=>{
  function createTeamLobby(container,{document,teams,getLocalId,onTeamChange,weaponName}) {
    let currentLobby=null;
    function canJoin(team) {
      const self=currentLobby?.players.find(player=>player.id===getLocalId());
      return currentLobby?.status==='open'&&self&&self.team!==team&&
        currentLobby.players.filter(player=>player.team===team).length<4;
    }
    function join(team) {if(canJoin(team))onTeamChange(team);}
    function element(tag,className,text) {
      const el=document.createElement(tag);el.className=className;
      if(text!==undefined)el.textContent=text;
      return el;
    }
    function render(lobby) {
      const hadFocus=container.contains(document.activeElement);
      currentLobby=lobby;container.replaceChildren();
      for(const [id,team] of Object.entries(teams)) {
        const members=lobby.players.filter(player=>player.team===id);
        const self=members.some(player=>player.id===getLocalId());
        const column=element('section','team-column');column.dataset.team=id;
        column.setAttribute('aria-label',`${team.name} team`);
        const heading=element('div','team-column-heading');
        heading.append(element('h3','',team.name),element('span','team-count',`${members.length} / 4`));
        const roster=element('ul','team-roster');
        for(const player of members) {
          const own=player.id===getLocalId();
          const card=element('li','team-player-card');card.dataset.playerId=player.id;
          card.draggable=false;
          const copy=element('div','team-player-copy');
          const name=element('strong','',player.username);
          copy.append(name,element('small','',weaponName(player.weapon)));
          card.append(copy);
          if(own) {
            card.dataset.self='true';
            card.setAttribute('aria-label',`${player.username}, you`);
            card.append(element('span','team-you','You'));
          }
          roster.append(card);
        }
        if(!members.length)roster.append(element('li','team-empty','No players yet'));
        const action=element('button','team-join',self?'Your team':members.length>=4?'Team full':`Join ${team.name}`);
        action.type='button';action.disabled=!canJoin(id);
        action.addEventListener('click',()=>join(id));
        column.append(heading,roster,action);
        container.append(column);
      }
      if(hadFocus)[...container.querySelectorAll('.team-join')].find(button=>!button.disabled)?.focus();
    }
    return {render};
  }
  return {createTeamLobby};
});
