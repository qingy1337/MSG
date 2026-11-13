import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import armor from '../public/armor.js';
import inventory from '../lib/armor.js';
import loadout from '../public/loadoutUi.js';
import {WEAPONS} from '../public/weapons.js';
import {WEAPON_SKINS} from '../public/skins.js';
import {createDashHud} from '../public/armorHud.mjs';

// Small eventful DOM: tests exercise the real UI handlers, including hover
// handoff, focus, pending saves and animation, without launching a browser.
class Element {
  constructor(tag,document) {
    this.tagName=tag.toUpperCase();this.ownerDocument=document;this.children=[];this.attributes={};this.handlers={};this.dataset={};this.hidden=false;this.className='';this._text='';
    this.style={setProperty(key,value){this[key]=value;}};
    this.classList={contains:name=>this.className.split(' ').includes(name),
      toggle:(name,on)=>{const values=new Set(this.className.split(' ').filter(Boolean));if(on??!values.has(name))values.add(name);else values.delete(name);this.className=[...values].join(' ');},
      add:(...names)=>names.forEach(name=>this.classList.toggle(name,true)),remove:(...names)=>names.forEach(name=>this.classList.toggle(name,false))};
  }
  set textContent(text){this.replaceChildren();this._text=String(text);}
  get textContent(){return this._text+this.children.map(child=>child.textContent).join('');}
  setAttribute(name,value){this.attributes[name]=String(value);}
  getAttribute(name){return this.attributes[name];}
  removeAttribute(name){delete this.attributes[name];}
  append(...nodes){for(const node of nodes){node.remove();node.parentElement=this;this.children.push(node);}}
  replaceChildren(...nodes){for(const child of this.children)child.parentElement=null;this.children=[];this._text='';this.append(...nodes);}
  remove(){if(this.parentElement){const parent=this.parentElement;parent.children=parent.children.filter(child=>child!==this);this.parentElement=null;}}
  contains(node){return this===node||this.children.some(child=>child.contains(node));}
  matches(selector){if(selector.startsWith('.'))return this.classList.contains(selector.slice(1));if(selector==='img[data-gear-key]')return this.tagName==='IMG'&&!!this.dataset.gearKey;return selector.toUpperCase()===this.tagName;}
  closest(selector){return selector.split(',').some(part=>this.matches(part.trim()))?this:this.parentElement?.closest(selector);}
  querySelectorAll(selector){return this.children.flatMap(child=>[...(child.matches(selector)?[child]:[]),...child.querySelectorAll(selector)]);}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  addEventListener(name,fn){(this.handlers[name]||=[]).push(fn);}
  dispatchEvent(event){event.target??=this;let result;for(const fn of this.handlers[event.type]||[])result=fn(event);if(event.bubbles)this.parentElement?.dispatchEvent(event);return result;}
  fire(type,properties={}){return this.dispatchEvent({type,target:this,preventDefault(){this.defaultPrevented=true;},...properties});}
  click(){if(!this.disabled)return this.fire('click');}
  focus(){this.ownerDocument.activeElement=this;this.fire('focus');this.fire('focusin',{bubbles:true});}
  cloneNode(deep){const clone=new Element(this.tagName,this.ownerDocument);clone.className=this.className;clone._text=this._text;clone.dataset={...this.dataset};if(deep)clone.append(...this.children.map(child=>child.cloneNode(true)));return clone;}
  animate(frames,options){this.ownerDocument.animations.push({frames,options});return {finished:Promise.resolve()};}
  get offsetParent(){return this.hidden?null:this.parentElement;}
  get offsetWidth(){return this.classList.contains('gear-picker')?316:this.classList.contains('gear-popover')?284:76;}
  get offsetHeight(){return this.classList.contains('gear-picker')?360:this.classList.contains('gear-popover')?400:76;}
  getBoundingClientRect(){const left=Number.parseFloat(this.style.left)|| (this.dataset.slot?(armor.SLOTS.includes(this.dataset.slot)?800:100):270),top=Number.parseFloat(this.style.top)||180;return {left,top,width:this.offsetWidth,height:this.offsetHeight,right:left+this.offsetWidth,bottom:top+this.offsetHeight};}
}
function dom() {
  const timers=new Map();let time=0,id=0;
  const document={nodes:new Map(),animations:[],handlers:{},activeElement:null};
  const win={innerWidth:1280,innerHeight:800,handlers:{},
    CustomEvent:class {constructor(type,props){this.type=type;Object.assign(this,props);}},
    setTimeout:(fn,delay)=>{timers.set(++id,{fn,at:time+delay});return id;},clearTimeout:id=>timers.delete(id),
    requestAnimationFrame:fn=>fn(),matchMedia:()=>({matches:false}),
    addEventListener(name,fn){this.handlers[name]=fn;},
  };
  document.defaultView=win;document.createElement=tag=>new Element(tag,document);document.createElementNS=(_,tag)=>document.createElement(tag);
  document.body=document.createElement('body');document.getElementById=id=>document.nodes.get(id);
  document.addEventListener=(name,fn)=>(document.handlers[name]||=[]).push(fn);
  document.fire=(type,props={})=>{const event={type,preventDefault(){},...props};for(const fn of document.handlers[type]||[])fn(event);};
  const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  for(const [,name] of html.matchAll(/\bid="([^"]+)"/g)){const node=document.createElement('div');node.id=name;document.nodes.set(name,node);}
  const get=id=>document.getElementById(id),root=get('character-loadout');document.body.append(root);
  root.append(get('loadout-weapons-rail'),get('loadout-armor-rail'),get('loadout-status'),get('loadout-statline'),get('gear-picker'),get('gear-popover'));
  get('loadout-weapons-rail').className=get('loadout-armor-rail').className='equipment-rail';
  get('gear-picker').className='gear-picker';get('gear-popover').className='gear-popover';
  get('gear-picker').hidden=get('gear-popover').hidden=true;
  get('gear-picker').append(get('gear-picker-title'),get('gear-picker-close'),get('gear-grid'));
  return {document,win,root,get,advance(ms){time+=ms;for(const [key,timer] of [...timers])if(timer.at<=time){timers.delete(key);timer.fn();}}};
}
function setup({coins=40000,owned=true}={}) {
  const env=dom(),user={username:'test',currencies:{Coins:coins},loadout:{primaryWeapon:'autoRifle'},skins:{owned:Object.values(WEAPON_SKINS).flat().map(s=>s.key),equippedByWeapon:{autoRifle:'autoRifle_default',pistol:'pistol_default'}}};
  inventory.ensureUserArmor(user);
  if(owned){
    for(const slot of armor.SLOTS) {
      inventory.purchaseArmor(user,`bastion_${slot}`,{random:()=>0});
      inventory.purchaseArmor(user,`vector_${slot}`,{random:()=>1});
    }
    inventory.equipArmorSet(user,'bastion');
  }
  let calls=0,purchases=0,reject=false,pending;
  const ui=loadout.createLoadoutUI({root:env.root,getUser:()=>user,getPrimary:()=>user.loadout.primaryWeapon,weapons:WEAPONS,skins:WEAPON_SKINS,
    onEquip:async item=>{calls++;if(pending)await pending;if(reject)throw new Error('Could not save. Try again.');
      if(item.kind==='weapon'){user.skins.equippedByWeapon[item.weaponKey]=item.key;if(item.slot==='primary')user.loadout.primaryWeapon=item.weaponKey;}
      else inventory.equipArmor(user,item.slot,item.kind==='none'?null:item.id);
    },onPurchase:async item=>{purchases++;inventory.purchaseArmor(user,item.key,{random:()=>1});},
  });ui.render();
  const slot=key=>env.root.querySelectorAll('.equipment-slot').find(node=>node.dataset.slot===key);
  const tiles=()=>env.get('gear-grid').querySelectorAll('.gear-tile');
  const tile=key=>tiles().find(node=>node.dataset.itemId===key);
  const open=key=>slot(key).parentElement.fire('pointerenter',{pointerType:'mouse'});
  const hover=button=>{button.fire('pointerenter',{pointerType:'mouse'});env.advance(66);};
  return {...env,user,ui,slot,tile,tiles,open,hover,calls:()=>calls,purchases:()=>purchases,reject:value=>reject=value,pending:value=>pending=value};
}

test('six overlaid slots open appropriate inventories and hover previews without equipping',()=>{
  const e=setup();assert.equal(e.root.querySelectorAll('.equipment-slot').length,6);
  e.open('primary');assert.equal(e.get('gear-picker').hidden,false);
  assert.equal(e.slot('primary').getAttribute('aria-expanded'),'true');
  assert.ok(e.tiles().length>10);assert.ok(e.tiles().every(button=>!button.dataset.itemId.startsWith('pistol')));
  e.hover(e.tile('sniper_kintsugi'));
  assert.match(e.get('gear-popover').textContent,/Kintsugi/);assert.match(e.get('gear-popover').textContent,/Charcoal ceramic/);
  assert.equal(e.get('gear-popover').querySelector('img').dataset.gearKey,'sniper_kintsugi');
  assert.equal(e.calls(),0);assert.equal(e.user.loadout.primaryWeapon,'autoRifle');
  e.open('sidearm');assert.ok(e.tiles().every(button=>button.dataset.itemId.startsWith('pistol')));
});

test('owned armor compares stats, animates only into the equipped slot, and retains saved gear on failure',async()=>{
  const e=setup(),vector=e.user.armor.items.find(item=>item.key==='vector_helmet');
  e.open('helmet');e.hover(e.tile(vector.id));
  assert.ok(e.get('gear-popover').querySelector('.better'));assert.ok(e.get('gear-popover').querySelector('.worse'));
  await e.tile(vector.id).click();assert.equal(e.user.armor.equipped.helmet,vector.id);
  assert.equal(e.slot('helmet').dataset.itemId,vector.id);
  assert.equal(e.document.animations.length,1,'only the selected item travels into the equipped slot');
  assert.equal(e.document.animations[0].options.duration,320);
  assert.equal(e.document.body.querySelectorAll('.gear-swap-ghost').length,0);
  e.reject(true);await e.tile('none:helmet').click();
  assert.equal(e.user.armor.equipped.helmet,vector.id);assert.match(e.get('loadout-status').textContent,/Could not save/);
  e.reject(false);await e.tile('none:helmet').click();assert.equal(e.user.armor.equipped.helmet,null);
});

test('locked armor previews for free and purchases only the selected slot without auto-equipping',async()=>{
  const e=setup({owned:false,coins:12000});e.open('helmet');
  await e.tile('bastion_helmet').click();assert.equal(e.purchases(),0);assert.equal(e.user.currencies.Coins,12000);
  assert.match(e.get('gear-popover').querySelector('.gear-item-stats').textContent,/0\.125 HP\/s/);
  assert.doesNotMatch(e.get('gear-popover').querySelector('.gear-item-stats').textContent,/–/,'fixed bonuses are not displayed as a range');
  assert.match(e.get('gear-popover').querySelector('.gear-item-note').textContent,/Fixed stat bonuses/);
  const action=e.get('gear-popover').querySelector('.gear-item-action');assert.equal(action.textContent,'Buy 4,000 Coins');
  await action.click();assert.equal(e.purchases(),1);assert.equal(e.user.armor.items.length,1);assert.equal(e.user.currencies.Coins,8000);
  assert.equal(e.user.armor.items[0].key,'bastion_helmet');
  assert.equal(e.get('loadout-status').textContent,'Bastion Helmet unlocked');
  assert.equal(e.user.armor.equipped.helmet,null);
  assert.equal(e.get('gear-popover').querySelector('.gear-item-action').textContent,'Equip');
  await e.get('gear-popover').querySelector('.gear-item-action').click();assert.ok(e.user.armor.equipped.helmet);
  e.open('chest');await e.tile('bastion_chest').click();
  assert.equal(e.get('gear-popover').querySelector('.gear-item-action').textContent,'Buy 4,000 Coins','another slot remains locked');
  await e.get('gear-popover').querySelector('.gear-item-action').click();
  assert.equal(e.user.armor.items.length,2);assert.equal(e.user.currencies.Coins,4000);
  assert.equal(e.user.armor.equipped.chest,null);
  e.open('boots');await e.tile('lifeline_boots').click();
  assert.equal(e.get('gear-popover').querySelector('.gear-item-action').textContent,'Buy 3,000 Coins');
  await e.tile('vector_boots').click();
  assert.equal(e.get('gear-popover').querySelector('.gear-item-action').textContent,'Buy 3,750 Coins');
  await e.tile('slipstream_boots').click();
  assert.equal(e.get('gear-popover').querySelector('.gear-item-action').textContent,'Buy 20,000 Coins');
  assert.equal(e.get('gear-popover').querySelector('.gear-item-action').disabled,true);
  assert.match(e.get('gear-popover').textContent,/16,000 more Coins/);
});

test('pending equip is serialized and the displayed slot changes only when the server confirms',async()=>{
  const e=setup();let resolve;e.pending(new Promise(done=>resolve=done));e.open('primary');
  const operation=e.tile('sniper_kintsugi').click();
  await e.tile('shotgun_silverline').click();assert.equal(e.calls(),1);
  assert.equal(e.user.loadout.primaryWeapon,'autoRifle');assert.equal(e.slot('primary').dataset.itemId,'autoRifle_default');
  e.get('gear-picker').fire('pointerleave');e.advance(81);
  assert.equal(e.get('gear-picker').hidden,true,'pending save does not hold the hover grid open');
  resolve();await operation;
  assert.equal(e.get('gear-picker').hidden,true,'save completion does not reopen the grid');
  assert.equal(e.user.loadout.primaryWeapon,'sniper');assert.equal(e.user.skins.equippedByWeapon.sniper,'sniper_kintsugi');
  assert.equal(e.slot('primary').dataset.itemId,'sniper_kintsugi');
});

test('hover handoff stays open; leaving, outside clicks and Escape dismiss predictably',()=>{
  const e=setup();e.open('helmet');
  e.slot('helmet').parentElement.fire('pointerleave');e.advance(40);e.get('gear-picker').fire('pointerenter');e.advance(300);
  assert.equal(e.get('gear-picker').hidden,false);
  e.get('gear-picker').fire('pointerleave');e.advance(81);assert.equal(e.get('gear-picker').hidden,true);
  e.open('primary');e.document.fire('pointerdown',{target:e.document.body});assert.equal(e.get('gear-picker').hidden,true);
  e.document.fire('keydown',{key:'Tab'});e.slot('sidearm').focus();assert.equal(e.get('gear-picker').hidden,false);
  e.document.fire('keydown',{key:'Escape'});assert.equal(e.get('gear-picker').hidden,true);assert.equal(e.document.activeElement,e.slot('sidearm'));
});

test('touch previews before equipping and keyboard arrows navigate the squares',async()=>{
  const e=setup();e.open('sidearm');const dragon=e.tile('pistol_pocket_dragon');
  dragon.fire('pointerdown',{pointerType:'touch'});await dragon.click();assert.equal(e.calls(),0);
  await e.get('gear-popover').querySelector('.gear-item-action').click();assert.equal(e.user.skins.equippedByWeapon.pistol,'pistol_pocket_dragon');
  e.open('primary');e.tiles()[0].fire('keydown',{key:'ArrowDown'});assert.equal(e.document.activeElement,e.tiles()[4]);
  e.tiles()[4].fire('keydown',{key:'Enter'});await e.tiles()[4].click();assert.equal(e.calls(),2);
});

test('details are clamped inside a narrow viewport and reduced motion skips the flight',async()=>{
  const e=setup();e.win.innerWidth=390;e.win.innerHeight=640;e.win.matchMedia=()=>({matches:true});
  e.open('primary');e.hover(e.tile('shotgun_silverline'));
  for(const id of ['gear-picker','gear-popover']){const rect=e.get(id).getBoundingClientRect();assert.ok(rect.left>=12);assert.ok(rect.right<=378);assert.ok(rect.top>=12);assert.ok(rect.bottom<=628);}
  await e.tile('shotgun_silverline').click();assert.equal(e.document.animations.length,0);assert.equal(e.user.loadout.primaryWeapon,'shotgun');
});

test('dash HUD remains PvE-only and shows its cooldown',()=>{
  const {document,get}=dom(),update=createDashHud(document);
  const player={alive:true,armorStats:{airDash:true},dashReadyAt:7000,dashRemaining:.1};
  update(player,'pve',4000);assert.equal(get('dash-hud').hidden,false);assert.equal(get('dash-hud-fill').style.width,'25%');assert.match(get('dash-hud-label').textContent,/3.0s/);
  update({...player,dashRemaining:0},'pve',7000);assert.equal(get('dash-hud-label').textContent,'Air dash');
  update(player,'pvp',4000);assert.equal(get('dash-hud').hidden,true);
});

test('Quartermaster appears in the helmet grid with its price and a PvE refill countdown',async()=>{
  const e=setup({owned:false,coins:30000});e.open('helmet');await e.tile('quartermaster_helmet').click();
  assert.equal(e.get('gear-popover').querySelector('.gear-item-action').textContent,'Buy 30,000 Coins');
  await e.get('gear-popover').querySelector('.gear-item-action').click();
  await e.get('gear-popover').querySelector('.gear-item-action').click();
  assert.equal(e.user.currencies.Coins,0);assert.match(e.get('loadout-statline').textContent,/refill every 30s/);
  const update=createDashHud(e.document),player={alive:true,armorStats:{grenadeRefill:true},grenadeRefillAt:65000};
  update(player,'pve',50000);assert.equal(e.get('dash-hud').hidden,false);
  assert.equal(e.get('dash-hud-label').textContent,'Grenade refill · 15s');
  assert.equal(e.get('dash-hud-fill').style.width,'50%');assert.equal(e.get('armor-hud-key').textContent,'↻');
  update(player,'pvp',35000);assert.equal(e.get('dash-hud').hidden,true);
});
