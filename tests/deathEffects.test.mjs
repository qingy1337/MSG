import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import deaths from '../game/deathEffects.js';
import server from '../game/gameServer.js';
import weapons from '../public/weapons.js';
import {Arena3D,resolveViewPlayer,healthHudState,syncCharacterLabelVisibility,createPvpSpawnShieldOutline,
  createTerrainLabelOccluder,isCharacterLabelOccluded} from '../public/arena3d.js';
import {createCorpse,poseCorpse,createDeathRemains,poseDeathRemains,MAX_CORPSES,MAX_REMAINS} from '../public/deathEffects.mjs';

const map={width:900,height:900,terrain:[]},target={id:'bot',isBot:true,x:300,y:300,height:0,angle:0};
const world=(x,y,h)=>new THREE.Vector3((x-450)*.05,h,(y-300)*.05);
const source={x:200,y:300};
const descriptor=(kind='pistol',p=target,m=map,w=[])=>deaths.deathDescriptor(p,source,kind,m,w,()=>.4);
function renderer(t) {
  const element=()=>({style:{},append(){},remove(){this.removed=true;}});
  for(const [key,value] of Object.entries({document:{createElement:element},WEAPONS:weapons.WEAPONS,WEAPON_SKINS:{}})) {
    const previous=Object.getOwnPropertyDescriptor(globalThis,key);
    Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
    t.after(()=>previous?Object.defineProperty(globalThis,key,previous):delete globalThis[key]);
  }
  const arena=Object.create(Arena3D.prototype);
  Object.assign(arena,{stage:new THREE.Group(),characters:new Map(),labels:element(),mapConfig:map,
    corpses:[],remains:[],pickups:new Map(),grenades:new Map(),effects:[],deadIds:new Set(),camera:new THREE.PerspectiveCamera(),renderTime:0,deathShake:0});
  t.after(()=>arena.clearObject(arena.stage));return arena;
}

test('spectator view follows a living teammate and uses their loadout state',()=>{
  const dead={id:'local',alive:false,grenades:0,weapon:'pistol'};
  const bot={id:'bot',alive:true,isBot:true,grenades:0,weapon:'autoRifle'};
  const teammate={id:'teammate',alive:true,isBot:false,grenades:2,weapon:'sniper',weaponSkinKey:'sniper_kintsugi'};
  assert.equal(resolveViewPlayer([dead,bot,teammate],dead.id),teammate);
  assert.equal(resolveViewPlayer([{...dead,alive:true},bot,teammate],dead.id).id,dead.id);
  assert.equal(resolveViewPlayer([dead,bot],dead.id),null,'bots are never selected as the human spectator camera');
});

test('spectator health bar shows the viewed player and returns to local health on revival',()=>{
  const dead={id:'local',alive:false,health:0,maxHealth:101};
  const teammate={id:'teammate',name:'Operator',alive:true,health:37,maxHealth:150};
  const spectating=healthHudState(dead,teammate,'pve',1000);
  assert.equal(spectating.visible,true);
  assert.equal(spectating.text,'SPECTATING Operator · 37 / 150 HP');
  assert.equal(spectating.health/spectating.maxHealth,37/150);
  assert.equal(spectating.ariaLabel,"Operator's health");
  const revived=healthHudState({...dead,alive:true,health:101},teammate,'pve',1000);
  assert.equal(revived.text,'101 / 101 HP');
  assert.equal(revived.ariaLabel,'Your health');
  assert.equal(healthHudState(dead,null,'pve',1000).visible,false);
});

test('shots from the spectated player animate the first-person weapon',t=>{
  const arena=renderer(t);let flashes=0;
  Object.assign(arena,{localId:'dead',viewedId:'teammate',freeTracers:[],tracerPool:[],
    viewWeapon:new THREE.Group(),viewMuzzleFlash:{},viewMuzzleState:{},
    triggerWeaponFlash(){flashes++;}});
  arena.characters.set('teammate',{weaponKey:'pistol',weaponSkinKey:null,
    weapon:new THREE.Group(),muzzleFlash:{}});
  arena.shot({playerId:'teammate',x:100,y:100,height:1.84,endX:250,endY:100,endHeight:1.84});
  assert.equal(arena.weaponRecoil,.16);
  assert.equal(arena.viewShotAt,arena.renderTime);
  assert.equal(flashes,2,'the character and spectated view both receive the muzzle flash');
});

test('wall-occluded character labels cannot be revived by a stale DOM write',()=>{
  const character={labelHidden:true,label:{hidden:false}};
  assert.equal(syncCharacterLabelVisibility(character,true),true);
  assert.equal(character.label.hidden,true);
  assert.equal(syncCharacterLabelVisibility(character,true),false);
  assert.equal(syncCharacterLabelVisibility(character,false),true);
  assert.equal(character.label.hidden,false);
});

test('nametags respect stairs from inside their bounding box without hiding clear side views',()=>{
  const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),ray=new THREE.Raycaster();
  ray.layers.set(1);
  for(const axis of ['x','y'])for(const reverse of [false,true])for(const bottom of [0,3]) {
    const stair={kind:'ramp',x:100,y:100,width:axis==='x'?200:80,height:axis==='y'?200:80,
      bottom,top:bottom+6,axis,reverse,stairs:true,steps:12};
    const proxy=createTerrainLabelOccluder(stair,material);proxy.updateMatrixWorld(true);
    const at=(along,across,height)=>{
      if(reverse)along=200-along;
      return world(100+(axis==='x'?along:across),100+(axis==='y'?along:across),bottom+height);
    };
    // Standing a quarter of the way up: above the real steps, but inside the
    // old full-height proxy. Its front faces missed the staircase ahead.
    const camera=at(50,40,3.34);
    assert.ok(new THREE.Box3().setFromObject(proxy).containsPoint(camera));
    assert.equal(isCharacterLabelOccluded(ray,[proxy],camera,at(230,40,1.1),at(230,40,2.4)),true);
    assert.equal(isCharacterLabelOccluded(ray,[proxy],camera,at(50,140,3.34),at(50,140,4.64)),false,
      'the empty space above the lower steps must not hide a visible player');
    assert.equal(isCharacterLabelOccluded(ray,[proxy],at(230,40,1.84),at(50,40,1.1),at(50,40,2.4)),true,
      'stairs also block sight from the far end');
    assert.equal(isCharacterLabelOccluded(ray,[proxy],at(-30,40,8),at(230,40,8),at(230,40,9.3)),false);
    if(bottom>0)assert.equal(isCharacterLabelOccluded(ray,[proxy],at(-30,40,-.6),
      at(230,40,-.6),at(230,40,-.3)),false,'raised flights leave space below them');
    proxy.geometry.dispose();
  }
  material.dispose();
});

test('sloped ramp occlusion preserves open space above and below its actual shell',()=>{
  const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),ray=new THREE.Raycaster();ray.layers.set(1);
  for(const axis of ['x','y'])for(const reverse of [false,true]) {
    const ramp={kind:'ramp',x:100,y:100,width:axis==='x'?200:80,height:axis==='y'?200:80,
      bottom:3,top:9,axis,reverse,structureDepth:.6};
    const proxy=createTerrainLabelOccluder(ramp,material);proxy.updateMatrixWorld(true);
    const at=(across,height)=>world(axis==='x'?200:100+across,axis==='y'?200:100+across,height);
    for(const [height,blocked] of [[5,false],[5.7,true],[6.3,false]])
      assert.equal(isCharacterLabelOccluded(ray,[proxy],at(-40,height),at(120,height),at(120,height)),blocked);
    proxy.geometry.dispose();
  }
  material.dispose();
});

test('a visible torso does not expose its nametag through an overhead landing',()=>{
  const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),ray=new THREE.Raycaster();ray.layers.set(1);
  const proxy=createTerrainLabelOccluder({kind:'catwalk',x:150,y:50,width:30,height:100,bottom:2,top:2.2},material);
  proxy.updateMatrixWorld(true);
  const camera=world(100,100,1.84),body=world(240,100,1.1),anchor=world(240,100,2.4);
  assert.equal(isCharacterLabelOccluded(ray,[proxy],camera,body,body),false,'torso is visible underneath');
  assert.equal(isCharacterLabelOccluded(ray,[proxy],camera,body,anchor),true,'the label itself is behind the slab');
  proxy.geometry.dispose();material.dispose();
});

test('PvP spawn protection uses a thin reusable blue silhouette',()=>{
  const body=new THREE.Group();
  body.add(new THREE.Mesh(new THREE.BoxGeometry(.7,1.8,.45),new THREE.MeshStandardMaterial({color:'#777'})));
  const outline=createPvpSpawnShieldOutline(body);
  assert.equal(outline.name,'pvp-spawn-shield-outline');
  assert.equal(outline.children.length,1);
  const mesh=outline.children[0],shield=outline.userData.shieldMaterial;
  assert.equal(mesh.material,shield);assert.equal(shield.side,THREE.BackSide);
  assert.equal(shield.depthWrite,false);assert.equal(shield.uniforms.thickness.value,.022);
  assert.equal(`#${shield.uniforms.color.value.getHexString()}`,'#42b8ff');
  body.traverse(object=>{object.geometry?.dispose();object.material?.dispose();});
  outline.traverse(object=>object.geometry?.dispose());shield.dispose();
});

test('death force follows the source, stronger weapons throw farther, and walls/upper floors stop placement',()=>{
  const pistol=descriptor(),shotgun=descriptor('shotgun'),blast=descriptor('grenade');
  assert.ok(pistol.endX<shotgun.endX&&shotgun.endX<blast.endX);
  assert.equal(blast.angle,0);assert.equal(blast.endY,target.y);
  const wall={x:350,y:200,width:8,height:200,top:5};
  assert.ok(descriptor('grenade',target,map,[wall]).endX<wall.x-24);
  const deck={x:200,y:200,width:400,height:400,bottom:2.8,top:3};
  const upper=descriptor('grenade',{...target,height:3},{...map,terrain:[deck]});
  assert.equal(upper.ground,3);
  assert.equal(descriptor('pistol',target,{...map,terrain:[deck]}).ground,0,'underpasses do not snap bodies up');
  const left=deaths.deathDescriptor(target,{x:400,y:300},'grenade',map,[],()=>.9);
  assert.ok(left.endX<target.x);assert.equal(left.variant,2);assert.ok(left.lifetime>=8&&left.lifetime<=12);
});

test('pickup chance, expiry, caps, cover, elevation and living human ownership are authoritative',()=>{
  const d=descriptor();
  assert.equal(deaths.makeDeathPickup(target,d,1,0,()=>.9),null);
  assert.equal(deaths.makeDeathPickup({...target,isBot:false},d,1,0,()=>0),null);
  const item=deaths.makeDeathPickup(target,d,1,0,()=>0);
  const p={...target,isBot:false,alive:true,x:item.x,y:item.y,grenades:2};
  const items=[item];
  assert.equal(deaths.collectPickups(items,[p],map,[],1700),false);
  assert.equal(deaths.collectPickups(items,[{...p,alive:false},{...p,isBot:true},{...p,grenades:3},{...p,height:3}],map,[],2000),false);
  assert.equal(deaths.collectPickups(items,[{...p,x:item.x-30}],map,[{x:item.x-15,y:200,width:3,height:200,top:3}],2000),false);
  assert.equal(deaths.collectPickups(items,[p],map,[],2000),true);assert.equal(p.grenades,3);assert.equal(items.length,0);
  const expired=[{...item}];assert.equal(deaths.collectPickups(expired,[],map,[],25000),true);assert.equal(expired.length,0);
  const liftItems=[{...item,platformId:'lift'}];
  deaths.collectPickups(liftItems,[],{...map,terrain:[{kind:'lift',id:'lift',top:4}]},[],2000);
  assert.equal(liftItems[0].height,4);
  assert.ok(deaths.makeDeathPickup(target,{...d,ogre:true},2,0,()=>.99),'Ogres always drop one grenade');
});

test('real character models collapse, darken Ogre crystals, dissolve and land above raised support',t=>{
  const arena=renderer(t);
  for(const ogre of [false,true])for(let variant=0;variant<3;variant++) {
    const p={...target,id:`${ogre}-${variant}`,weapon:'pistol',botType:ogre?'ogre':'soldier'};
    const c=arena.createCharacter(p,null),d={...descriptor('grenade',p),variant,ground:3,height:3};
    const corpse=createCorpse(c,d);arena.stage.add(corpse.group);
    let impacts=0;
    for(let i=0;i<120;i++){const result=poseCorpse(corpse,1/60,world);impacts+=Number(result.impact);}
    assert.equal(impacts,1);assert.equal(c.label.removed,true);assert.equal(c.muzzleFlash.visible,false);
    c.group.updateWorldMatrix(true,true);
    const box=new THREE.Box3();c.group.traverseVisible(o=>{if(o.isMesh)box.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld));});
    assert.ok(box.min.y>=3.03&&box.min.y<3.04,`body rests on deck: ${box.min.y}`);
    if(ogre){assert.equal(c.ogreModel.effects.visible,false);assert.equal(c.ogreModel.glow.emissiveIntensity,0);assert.ok(c.ogreModel.deathCracks);}
    assert.ok(poseCorpse(corpse,20,world).done);
    for(const material of corpse.materials)assert.equal(material.opacity,0);
    corpse.group.traverse(o=>assert.ok(o.position.toArray().every(Number.isFinite)));
  }
});

test('Dread Troopers use red threat armor, an exclusive carbine and a disposable charge beam',t=>{
  const arena=renderer(t),player={...target,id:'dread',name:'DREAD CAPTAIN',weapon:'autoRifle',
    weaponSkinKey:null,botType:'dread',botRank:'captain',health:260,maxHealth:260};
  const c=arena.createCharacter(player,null);
  assert.equal(c.dread,true);assert.ok(c.group.getObjectByName('dread-core'));
  assert.ok(c.group.getObjectByName('dread-charge-beam'));
  let carbineVertices=0;c.weapon.traverse(object=>{carbineVertices+=object.geometry?.attributes?.position?.count||0;});
  assert.ok(carbineVertices>=150,'batched bot-exclusive carbine retains its visible geometry');
  assert.ok(c.dreadCore.material.emissive.r>c.dreadCore.material.emissive.b*2,'Dread energy language is red, not Ogre purple');
  c.dreadTelegraph.visible=true;
  const corpse=createCorpse(c,{...descriptor('pistol',player),ground:0,height:0});
  assert.equal(c.dreadTelegraph.visible,false);arena.stage.add(corpse.group);
});

test('remains contain dust, blast scars and Ogre armor chips with finite lifetimes',()=>{
  const group=createDeathRemains({...descriptor(),ogre:true},()=>.4),q=new THREE.Quaternion();
  assert.equal(group.userData.chips.length,8);assert.equal(group.userData.dust.length,7);
  assert.equal(poseDeathRemains(group,.5,q),false);
  assert.ok(group.userData.chips.some(c=>c.mesh.position.y>.09));
  poseDeathRemains(group,2,q);assert.ok(group.userData.dust.every(d=>!d.mesh.visible));
  assert.equal(poseDeathRemains(group,10,q),true);assert.equal(group.userData.mark.material.opacity,0);
  Arena3D.prototype.clearObject(group);
});

test('renderer caps bodies/remains, ignores duplicate death events, and disposes collected pickups',t=>{
  const arena=renderer(t);
  for(let i=0;i<MAX_REMAINS+5;i++) {
    const p={...target,id:`bot${i}`,weapon:'pistol'};
    arena.characterDeath(p,descriptor('grenade'));arena.characterDeath(p,descriptor('grenade'));
    assert.ok(arena.corpses.length<=MAX_CORPSES);
    arena.updateDeathEffects(.7);
    assert.ok(arena.remains.length<=MAX_REMAINS);
  }
  assert.equal(arena.characters.size,0);
  arena.setPickups([{id:1,kind:'grenade',x:300,y:300,height:3}]);arena.updateDeathEffects(.01);
  const mesh=arena.pickups.get(1).group;assert.ok(mesh.position.y>3);
  arena.setPickups([]);assert.equal(mesh.parent,null);assert.equal(mesh.children.length,0);
  arena.updateDeathEffects(30);assert.equal(arena.corpses.length,0);assert.equal(arena.remains.length,0);
});

test('server emits one reliable death descriptor and includes collectible drops in existing snapshots',t=>{
  let now=100000,tick,connect;const handlers={},events=[];
  t.mock.method(Date,'now',()=>now);t.mock.method(global,'setInterval',fn=>{tick=fn;return 0;});
  const game=server.createGameServer({on(_,fn){connect=fn;},emit(name,data,meta){events.push({name,data,meta:structuredClone(meta)});},to(){return this;},socketsLeave(){}});
  connect({id:'p',on(name,fn){handlers[name]=fn;}});
  game.waitingPlayers.push({id:'p',weapon:'pistol'});handlers.startGame({enableBots:true});
  try {
    game.gameWalls.length=0;game.gameMap.terrain.length=0;
    const p=game.activePlayers.find(p=>!p.isBot),bots=game.activePlayers.filter(p=>p.isBot),b=bots[0];
    Object.assign(p,{x:200,y:300,height:0,grenades:2});
    for(const bot of bots){Object.assign(bot,{x:800,y:800,height:0});bot.botState.lastShotAt=now+99999;}
    Object.assign(b,{x:300,y:300,health:1,botType:'ogre'});
    handlers.shoot({angle:0,pitch:0});
    const killed=events.filter(e=>e.name==='playerKilled');assert.equal(killed.length,1);assert.equal(killed[0].data,b.id);
    assert.equal(killed[0].meta.ogre,true);assert.equal(killed[0].meta.kind,'pistol');assert.equal(b.alive,false);
    tick();const packet=events.filter(e=>e.name==='gameState').at(-1);
    assert.equal(packet.meta.pickups.length,1);assert.equal(packet.meta.pickups[0].kind,'grenade');
    Object.assign(p,{x:packet.meta.pickups[0].x,y:packet.meta.pickups[0].y});
    now+=1800;tick();assert.equal(p.grenades,3);
    assert.equal(events.filter(e=>e.name==='gameState').at(-1).meta.pickups.length,0);
    assert.equal(events.filter(e=>e.name==='playerKilled').length,1);
  }finally{game.close();}
});

test('PvP death event includes authoritative killer and victim names for the kill feed',t=>{
  let connect;const handlers={},events=[];
  t.mock.method(global,'setInterval',()=>0);
  const game=server.createGameServer({on(_,fn){connect=fn;},
    emit(name,...args){events.push({name,args});},to(){return this;},socketsLeave(){}});
  connect({id:'killer',on(name,fn){handlers[name]=fn;}});
  game.waitingPlayers.push({id:'killer',name:'Alpha',weapon:'pistol'},
    {id:'victim',name:'Beta',weapon:'pistol'});
  handlers.startGame({});
  try {
    game.gameWalls.length=0;game.gameMap.terrain.length=0;
    const killer=game.activePlayers.find(player=>player.id==='killer');
    const victim=game.activePlayers.find(player=>player.id==='victim');
    Object.assign(killer,{x:200,y:200,height:0,spawnShieldUntil:0});
    Object.assign(victim,{x:280,y:200,height:0,health:1,spawnShieldUntil:0});
    handlers.shoot({angle:0,pitch:0});
    const death=events.find(event=>event.name==='playerKilled');
    assert.ok(death,'a lethal PvP shot emits a reliable death event');
    assert.deepEqual(death.args[2],{
      killerId:'killer',killerName:'Alpha',victimId:'victim',victimName:'Beta',
    });
  } finally {game.close();}
});

test('PvP peers render reliable grenade spawns even when all volatile snapshots are dropped',t=>{
  let now=100000,tick,connect;const sockets=new Map(),reliable=[];
  const peers=[renderer(t),renderer(t)];
  t.mock.method(Date,'now',()=>now);t.mock.method(global,'setInterval',fn=>{tick=fn;return 0;});
  const game=server.createGameServer({on(_,fn){connect=fn;},to(){return this;},
    volatile:{emit(){}}, // Both clients miss every replaceable packet.
    emit(name,data){
      reliable.push(name);
      if(name==='grenadeThrown')for(const peer of peers)peer.setGrenades([data],data.serverNow,false);
      if(name==='grenadeExploded')for(const peer of peers)peer.grenadeExplosion(data);
    }});
  for(const id of ['p','other']){const handlers={};sockets.set(id,handlers);connect({id,on(name,fn){handlers[name]=fn;}});}
  game.gameInProgress.status=true;
  game.activePlayers.push({id:'p',x:100,y:200,height:0,alive:true,health:1000,grenades:3},
    {id:'other',x:700,y:400,height:0,alive:true,health:1000,grenades:3});
  try {
    const p=sockets.get('p'),other=sockets.get('other');
    p.grenadeCharge();p.throwGrenade({angle:0,pitch:0});
    for(const peer of peers){assert.equal(peer.grenades.size,1);assert.ok(peer.grenades.get(1).group.parent===peer.stage);}
    other.grenadeCharge();other.throwGrenade({angle:Math.PI,pitch:0});
    for(const peer of peers)assert.equal(peer.grenades.size,2,'spawning another grenade does not erase the first');
    for(let i=0;i<59;i++){now+=50;tick();}
    assert.equal(reliable.filter(n=>n==='grenadeThrown').length,2,'no reliable per-tick grenade stream');
    now+=50;tick();
    for(const peer of peers){assert.equal(peer.grenades.size,0);assert.equal(peer.effects.length,2);}
  }finally{game.close();}
});
