import {test} from 'node:test';
import assert from 'node:assert/strict';
import lobbyUI from '../public/teamLobby.js';
import teams from '../public/pvpTeams.js';

// Exercise the DOM event handlers without launching a browser.
class Element {
  constructor(tag,document) {
    this.tagName=tag;this.document=document;this.children=[];this.dataset={};this.listeners={};this.attributes={};
    this.className='';
    this.classList={
      add:name=>{this.className=[...new Set([...this.className.split(' '),name])].join(' ').trim();},
      remove:name=>{this.className=this.className.split(' ').filter(value=>value!==name).join(' ');},
    };
  }
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=children;}
  setAttribute(key,value){this.attributes[key]=value;}
  addEventListener(name,fn){this.listeners[name]=fn;}
  contains(node){return node===this||this.children.some(child=>child.contains(node));}
  matches(selector){return selector.startsWith('.')?this.className.split(' ').includes(selector.slice(1)):
    selector==='[data-self="true"]'&&this.dataset.self==='true';}
  querySelectorAll(selector){return this.children.flatMap(child=>[
    ...(child.matches(selector)?[child]:[]),...child.querySelectorAll(selector)]);}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  focus(){this.document.activeElement=this;}
  fire(name,extra={}) {
    const event={prevented:false,preventDefault(){this.prevented=true;},...extra};
    this.listeners[name]?.(event);return event;
  }
}
function setup(extraPlayers=[]) {
  const document={activeElement:null,createElement(tag){return new Element(tag,this);}};
  const container=document.createElement('div'),changes=[];
  const lobby={status:'open',players:[{id:'self',username:'Me',team:'blue',weapon:'sniper'},
    {id:'other',username:'Other',team:'red',weapon:'sniper'},...extraPlayers]};
  const ui=lobbyUI.createTeamLobby(container,{document,teams:teams.PVP_TEAMS,getLocalId:()=> 'self',
    onTeamChange:team=>changes.push(team),weaponName:()=> 'Sniper'});
  ui.render(lobby);
  return {container,changes,ui,lobby,
    blue:container.children[0],red:container.children[1],
    self:container.querySelector('[data-self="true"]'),
    other:container.querySelectorAll('.team-player-card').find(card=>card.dataset.playerId==='other')};
}
test('team cards are static and Join buttons switch only your own team',()=>{
  const f=setup();
  assert.equal(f.self.draggable,false);assert.equal(f.other.draggable,false);
  assert.equal(f.blue.querySelector('.team-join').disabled,true);
  f.blue.querySelector('.team-join').fire('click');assert.deepEqual(f.changes,[]);
  f.red.querySelector('.team-join').fire('click');assert.deepEqual(f.changes,['red']);
});
test('full teams and locked lobbies reject button moves',()=>{
  const f=setup(Array.from({length:3},(_,i)=>({id:`full-${i}`,username:`Full ${i}`,team:'red'})));
  assert.equal(f.red.querySelector('.team-join').disabled,true);
  f.red.querySelector('.team-join').fire('click');assert.deepEqual(f.changes,[]);
  f.ui.render({...f.lobby,status:'active'});
  assert.ok(f.container.querySelectorAll('.team-join').every(button=>button.disabled));
});
test('switching teams preserves keyboard focus on an available Join button',()=>{
  const f=setup();f.red.querySelector('.team-join').focus();
  f.ui.render({...f.lobby,players:f.lobby.players.map(player=>({...player,team:player.id==='self'?'red':player.team}))});
  assert.equal(f.container.document.activeElement,f.container.children[0].querySelector('.team-join'));
  assert.equal(f.container.document.activeElement.disabled,false);
});
