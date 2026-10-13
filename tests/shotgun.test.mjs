import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import shotgun from '../game/shotgun.js';
import server from '../game/gameServer.js';
import weapons from '../public/weapons.js';
import skins from '../lib/skins.js';
import {createShotgun,poseShotgun,shotgunMuzzleStyle,shotgunPelletColor} from '../public/shotgun.mjs';
import {muzzleFlashScaleForWeapon} from '../public/muzzleFlash.mjs';
import {SHOTGUN_SPREAD_RADIANS,shotgunReticleDiameter} from '../public/shotgunCrosshair.mjs';

const shooter={id:'s',x:100,y:250,height:0,alive:true,weapon:'shotgun',weaponSkinKey:'shotgun_bubble_trouble'};
const target={id:'t',x:160,y:250,height:0,alive:true,health:200};
const map={width:1800,height:1200,ceiling:7.5,terrain:[]};
test('shotgun reticle ring projects the authoritative pellet cone at the camera FOV',()=>{
  assert.equal(SHOTGUN_SPREAD_RADIANS,0.085);
  const diameter=shotgunReticleDiameter(900,68);
  assert.ok(diameter>113&&diameter<114);
  assert.equal(shotgunReticleDiameter(450,68),diameter/2,'reticle scales with viewport height');
  assert.equal(shotgunReticleDiameter(0,68),0);
});

test('shotgun pellets spread, respect walls and friendly filtering, and lose damage at range',()=>{
  const fire=(players,walls=[],allow=()=>true)=>shotgun.traceShotgun(shooter,0,0,walls,players,allow,map,()=>0);
  const close=fire([target]);assert.equal(close.pellets.length,8);assert.equal(close.damage.get('t'),96);
  assert.equal(new Set(close.pellets.map(p=>`${p.angle}/${p.pitch}`)).size,8);
  const far=fire([{...target,x:500}]);assert.ok((far.damage.get('t')||0)<20);
  assert.equal(fire([target],[{x:130,y:0,width:10,height:1200,top:7.5}]).damage.size,0);
  assert.equal(fire([target],[],()=>false).damage.size,0);
  const elevated=fire([{...target,height:4}]);assert.equal(elevated.damage.size,0);
  const split=fire([{...target,id:'left',x:240,y:232},{...target,id:'right',x:240,y:268}]);
  assert.equal(split.damage.size,2,'a spread can hit multiple enemies');
});

test('server owns shotgun pellets, damage and the single-trigger cooldown',t=>{
  let now=100000;
  t.mock.method(global,'setInterval',()=>0);t.mock.method(Date,'now',()=>now);
  let connect;const handlers={},events=[];
  const game=server.createGameServer({on(_,fn){connect=fn;},emit(name,data){events.push({name,data});},to(){return this;}});
  connect({id:'s',on(name,fn){handlers[name]=fn;}});
  try {
    game.gameInProgress.status=true;
    game.activePlayers.push({...shooter},{...target});
    handlers.shoot({angle:0,damage:999,pellets:999});
    assert.equal(game.activePlayers[1].health,104);
    assert.equal(events.filter(e=>e.name==='shotFired').length,1);
    assert.equal(events.find(e=>e.name==='shotFired').data.pellets.length,8);
    assert.equal(events.find(e=>e.name==='shotFired').data.shotgunBarrel,0);
    assert.equal(events.find(e=>e.name==='shotFired').data.weaponSkinKey,'shotgun_bubble_trouble');
    handlers.shoot({angle:0});assert.equal(game.activePlayers[1].health,104);
    now+=179;handlers.shoot({angle:0});assert.equal(game.activePlayers[1].health,104);
    now++;handlers.shoot({angle:0});assert.equal(game.activePlayers[1].health,8);
    assert.equal(events.filter(e=>e.name==='shotFired').at(-1).data.shotgunBarrel,1);
    assert.equal(game.activePlayers[0].shotgunShotsRemaining,0);
    now+=1399;
    handlers.shoot({angle:0,shotgunShotsRemaining:2,shotgunReloadUntil:0});
    assert.equal(events.filter(e=>e.name==='shotFired').length,2,'cannot bypass the reload');
    game.gameWalls.push({x:130,y:0,width:10,height:600,top:7.5});
    now++;handlers.shoot({angle:0});assert.equal(game.activePlayers[1].health,8);
    assert.equal(game.activePlayers[0].shotgunShotsRemaining,1);
    now+=180;handlers.shoot({angle:0});
    assert.equal(game.activePlayers[0].shotgunShotsRemaining,0);
    assert.equal(events.filter(e=>e.name==='shotFired').length,4,'next reload gives another two shots');
  } finally {game.close();}
});

test('shotgun has a selectable registry entry, free default skin and detailed models at both scales',()=>{
  assert.equal(weapons.WEAPONS.shotgun.automatic,false);
  assert.equal(weapons.WEAPONS.shotgun.cooldownMs,180);
  assert.equal(weapons.WEAPONS.shotgun.reloadMs,1400);
  assert.equal(weapons.WEAPONS.shotgun.description,'Eight-pellet hitscan blast.');
  assert.equal(skins.DEFAULT_SKIN_BY_WEAPON.shotgun,'shotgun_default');
  assert.equal(skins.ALL_SKINS_BY_KEY.shotgun_silverline.price,2000);
  assert.equal(skins.ALL_SKINS_BY_KEY.shotgun_bubble_trouble.price,4000);
  assert.equal(muzzleFlashScaleForWeapon('shotgun'),1.65);
  assert.equal(muzzleFlashScaleForWeapon('pistol'),1);
  for(const skin of skins.WEAPON_SKINS.shotgun) for(const length of [0.68,1.05]) {
      const model=createShotgun(skin.key,length);
      for(const name of ['receiver','pump','ejection-port','muzzle-bore'])assert.ok(model.getObjectByName(name));
      const bounds=new THREE.Box3().setFromObject(model);assert.ok(bounds.min.z<=-length&&bounds.min.z>=-length*1.025);
      model.traverse(m=>{if(m.geometry)assert.ok([...m.geometry.attributes.position.array].every(Number.isFinite));});
      poseShotgun(model,0.43);assert.ok(model.getObjectByName('pump').position.z>0.13);
      poseShotgun(model,0.85);assert.equal(model.getObjectByName('pump').position.z,0);
      if(skin.key==='shotgun_silverline') {
        assert.ok(model.getObjectByName('silver-sight-rib'));
        assert.ok(model.getObjectByName('silver-muzzle-ring'));
        const shroud=model.getObjectByName('barrel-shroud');
        assert.ok(shroud);
        assert.equal(shroud.geometry.type,'ExtrudeGeometry','main shell has flat faces and semicircular side caps');
        const shroudBounds=new THREE.Box3().setFromObject(shroud);
        assert.ok(shroudBounds.max.x-shroudBounds.min.x>length*0.21,'double-barrel body has a wider silhouette');
        assert.equal(model.getObjectByName('barrel'),undefined);
        assert.equal(model.getObjectByName('magazine-tube'),undefined,'stacked tubes are replaced by one enclosed shroud');
        assert.ok(model.getObjectByName('pump-inset'));
        assert.equal(model.getObjectByName('pump-inset').geometry.type,'RoundedBoxGeometry');
        assert.equal(model.getObjectByName('silver-muzzle-ring').geometry.type,'ExtrudeGeometry');
        assert.equal(model.getObjectsByProperty('name','muzzle-bore').length,2,'silver muzzle visibly contains two barrels');
        assert.equal(model.getObjectsByProperty('name','barrel-rim').length,2);
        assert.equal(model.getObjectsByProperty('name','pump-rib').length,0,'silver pump is one smooth inset, not segmented ribs');
        assert.equal(model.getObjectsByProperty('name','stock-rail').length,2);
        const rearHandle=model.getObjectByName('rear-handle');
        const rearLoop=model.getObjectByName('rear-handle-loop');
        assert.ok(rearHandle,'a swept grip breaks up the camera-facing stock end');
        assert.ok(rearLoop,'the formerly blunt rear plate is an open handle loop');
        assert.equal(rearLoop.geometry.type,'ExtrudeGeometry');
        assert.equal(rearLoop.geometry.parameters.shapes.holes.length,1,'the rear loop has visible negative space');
        assert.ok(rearHandle.position.y<rearLoop.position.y);
        assert.ok(rearHandle.position.z>=rearLoop.position.z,'the grip is not hidden behind the rear loop');
        assert.ok(rearHandle.rotation.x<0);
        const finish=model.getObjectByName('receiver').material;
        assert.ok(finish.metalness>=0.6&&finish.metalness<0.75,'silver remains reflective without turning black absent an environment map');
        assert.ok(finish.roughness<0.2);
        assert.ok(finish.color.r>0.25&&finish.color.r<0.5,'finish is mid-silver rather than white');
        assert.ok(finish.emissiveIntensity>0,'dark rooms retain a subtle silver base');
      } else if(skin.key==='shotgun_bubble_trouble') {
        assert.equal(model.getObjectsByProperty('name','bubble-chamber').length,2);
        assert.equal(model.getObjectsByProperty('name','energy-core').length,2);
        assert.equal(model.getObjectsByProperty('name','floating-bubble').length,10);
        assert.equal(model.getObjectsByProperty('name','muzzle-bore').length,2);
        assert.equal(model.getObjectsByProperty('name','iridescent-trim').length,2);
        assert.equal(model.getObjectsByProperty('name','chamber-guard').length,4);
        assert.equal(model.getObjectsByProperty('name','chroma-shroud').length,2);
        assert.equal(model.getObjectsByProperty('name','chroma-top-panel').length,2);
        assert.equal(model.getObjectsByProperty('name','receiver-chroma-panel').length,2);
        assert.equal(model.getObjectsByProperty('name','pump-wing').length,2);
        assert.equal(model.getObjectsByProperty('name','status-light').length,3);
        assert.ok(model.getObjectByName('reactor-bridge'));
        const chambers=model.getObjectsByProperty('name','bubble-chamber');
        assert.ok(chambers.every(chamber=>chamber.material.transparent&&!chamber.material.depthWrite));
        assert.deepEqual(chambers.map(chamber=>chamber.material.color.getHexString()),['008fa8','6e21b8']);
        assert.ok(chambers.every(chamber=>chamber.material.opacity>=0.5),'saturated glass resists washed-out room lighting');
        assert.equal(model.getObjectByName('receiver').material.color.getHexString(),'9bb7bf');
        const floating=model.getObjectByName('floating-bubble'),before=floating.position.clone();
        const core=model.getObjectByName('energy-core'),coreRotation=core.rotation.z;
        poseShotgun(model,1,2.1);
        assert.ok(floating.position.distanceTo(before)>0,'bubbles drift inside their chambers');
        assert.equal(core.geometry.type,'TubeGeometry','colored energy cores spiral through the glass');
        assert.notEqual(core.rotation.z,coreRotation,'energy spirals counter-rotate inside the chambers');
        assert.deepEqual(model.getObjectsByProperty('name','chroma-shroud').map(part=>part.material.color.getHexString()),
          ['00b8c8','923de0']);
        assert.deepEqual(shotgunMuzzleStyle(skin.key,0),{barrel:-1,color:'#5ff7ff'});
        assert.deepEqual(shotgunMuzzleStyle(skin.key,1),{barrel:1,color:'#ce70ff'});
      } else {
        for(const name of ['barrel','magazine-tube','stock'])assert.ok(model.getObjectByName(name));
      }
      model.traverse(m=>{m.geometry?.dispose();m.material?.dispose();});
    }
});

test('only Bubble Trouble overrides alternating shotgun muzzle colors',()=>{
  assert.equal(shotgunMuzzleStyle('shotgun_default',0),null);
  assert.equal(shotgunMuzzleStyle('shotgun_silverline',1),null);
  assert.deepEqual(shotgunMuzzleStyle('shotgun_bubble_trouble',2),{barrel:-1,color:'#5ff7ff'});
  assert.equal(shotgunPelletColor('shotgun_bubble_trouble',0,false),'#5ff7ff');
  assert.equal(shotgunPelletColor('shotgun_bubble_trouble',1,true),'#ce70ff');
  assert.equal(shotgunPelletColor('shotgun_default',0,false),'#9dfff3');
  assert.equal(shotgunPelletColor('shotgun_default',0,true),'#ffce8c');
});

test('joining with the shotgun preserves the selection and assigns its default skin',t=>{
  t.mock.method(global,'setInterval',()=>0);
  let connect;const handlers={};
  const game=server.createGameServer({on(_,fn){connect=fn;},emit(){},to(){return this;}});
  connect({id:'s',user:{username:'shotgun-test'},on(name,fn){handlers[name]=fn;},join(){}});
  try {
    handlers.join({displayName:'Tester',weapon:'shotgun'});
    assert.equal(game.waitingPlayers[0].weapon,'shotgun');
    assert.equal(game.waitingPlayers[0].weaponSkinKey,'shotgun_default');
    assert.equal(game.waitingPlayers[0].primaryWeapon,'shotgun');
    assert.equal(game.waitingPlayers[0].primaryWeaponSkinKey,'shotgun_default');
    assert.equal(game.waitingPlayers[0].secondaryWeapon,'pistol');
    assert.equal(game.waitingPlayers[0].secondaryWeaponSkinKey,'pistol_default');
  } finally {game.close();}
});
