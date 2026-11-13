import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import * as THREE from 'three';
import {WEAPON_SKINS} from '../public/skins.js';
import armor from '../public/armor.js';
import {createLoadoutWeapon,createArmorDisplay,createLoadoutCharacter,disposeLoadoutModel,visibleModelBounds,frameLoadoutCharacter} from '../public/loadoutModels.mjs';

const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'blocks-loadout-'));
process.env.DATA_DIR=dataDir;
const {default:store}=await import('../lib/userStore.js');
const {default:routes}=await import('../routes/authRoutes.js');
after(()=>{store.saveUsers();fs.rmSync(dataDir,{recursive:true,force:true});});

test('weapon + finish save atomically; locked/mismatched equipment cannot partially change the account',async t=>{
  const app=express();app.use(express.json());app.use('/api',routes.createAuthRoutes());
  const listener=app.listen(0,'127.0.0.1');await new Promise(resolve=>listener.once('listening',resolve));
  t.after(()=>new Promise(resolve=>listener.close(resolve)));
  const user={id:'loadout-test',username:'loadout-test',currencies:{Coins:20000}};
  store.publicUser(user);user.skins.owned.push('sniper_kintsugi','pistol_pocket_dragon');store.usersByUsername.set(user.username,user);
  const cookie=`${store.AUTH_COOKIE_NAME}=${encodeURIComponent(store.signAuthToken({username:user.username}))}`;
  const url=`http://127.0.0.1:${listener.address().port}/api/loadout`;
  const post=(body,auth=true)=>fetch(url,{method:'POST',headers:{'content-type':'application/json',...(auth?{cookie}:{})},body:JSON.stringify(body)});
  assert.equal((await post({primaryWeapon:'sniper',skinKey:'sniper_kintsugi'},false)).status,401);
  const before=JSON.stringify(user);
  for(const body of [
    {primaryWeapon:'sniper',skinKey:'sniper_flatpack'},
    {primaryWeapon:'sniper',skinKey:'pistol_pocket_dragon'},
    {primaryWeapon:'pistol',skinKey:'pistol_default'},
    {primaryWeapon:'sniper',skinKey:'__proto__'},
    {primaryWeapon:'sniper',skinKey:[]},
    {primaryWeapon:'sniper',skinKey:'sniper_kintsugi',playerColor:'not-a-color'},
  ]){assert.equal((await post(body)).status,400);assert.equal(JSON.stringify(user),before);}
  const response=await post({primaryWeapon:'sniper',skinKey:'sniper_kintsugi'});assert.equal(response.status,200);
  const payload=await response.json();assert.equal(payload.user.loadout.primaryWeapon,'sniper');assert.equal(payload.user.skins.equippedByWeapon.sniper,'sniper_kintsugi');
  assert.equal((await post({skinKey:'pistol_pocket_dragon'})).status,200);
  assert.equal(user.loadout.primaryWeapon,'sniper','sidearm changes never replace the primary');assert.equal(user.skins.equippedByWeapon.pistol,'pistol_pocket_dragon');
  assert.equal((await post({playerColor:'#abcdef'})).status,200);assert.equal(user.loadout.playerColor,'#abcdef');assert.equal(user.currencies.Coins,20000);
  const saved=JSON.parse(fs.readFileSync(path.join(dataDir,'users.json'),'utf8'));
  assert.ok(JSON.stringify(saved).includes('sniper_kintsugi'),'loadout persists to the isolated account store');
});

test('all item thumbnails have finite, complete geometry using the same weapon factories as the character',()=>{
  globalThis.WEAPON_SKINS=WEAPON_SKINS;
  const definitions=Object.entries(WEAPON_SKINS).flatMap(([weapon,skins])=>skins.map(skin=>({key:skin.key,build:()=>createLoadoutWeapon(weapon,skin.key)})));
  definitions.push(...Object.keys(armor.CATALOG).map(key=>({key,build:()=>createArmorDisplay(key)})));
  for(const {key,build} of definitions) {
    const model=build(),bounds=visibleModelBounds(model),size=bounds.getSize(new THREE.Vector3());
    assert.ok(!bounds.isEmpty(),key);assert.ok([size.x,size.y,size.z].every(value=>Number.isFinite(value)&&value>0&&value<5),key);
    let triangles=0;
    model.traverse(child=>{if(!child.geometry)return;const positions=child.geometry.attributes.position;assert.ok(positions.array.every(Number.isFinite),key);triangles+= (child.geometry.index?.count || positions.count)/3;});
    assert.ok(triangles>20,key);disposeLoadoutModel(model);
  }
});

test('armor previews include the helmet shell and paired boots/gauntlets, not floating fittings',()=>{
  for(const set of Object.keys(armor.SETS)) {
    const helmet=createArmorDisplay(`${set}_helmet`),bounds=visibleModelBounds(helmet);
    assert.ok(bounds.max.y-bounds.min.y>.65);assert.ok(helmet.children.some(child=>child.geometry?.type==='SphereGeometry'));
    disposeLoadoutModel(helmet);
    for(const slot of ['boots','gauntlets']) {
      const model=createArmorDisplay(`${set}_${slot}`);
      const fittings=model.children.filter(child=>child.name===`armor-${set}_${slot}`);
      assert.equal(fittings.length,2);assert.ok(fittings[0].position.x<0&&fittings[1].position.x>0);disposeLoadoutModel(model);
    }
  }
});


test('character framing keeps long weapons clear of the overlaid equipment rails at desktop and mobile sizes',()=>{
  for(const [weapon,skin] of [['sniper','sniper_kintsugi'],['miniGun','miniGun_crimson_guard'],['shotgun','shotgun_bubble_trouble']]) {
    const model=createLoadoutCharacter(weapon,skin,'pistol_pocket_dragon','#59daca',{});model.position.y=-1.08;
    const camera=new THREE.PerspectiveCamera(30,1,.01,30);
    for(const [width,height] of [[1100,650],[720,480],[340,430]]) {
      frameLoadoutCharacter(camera,model,width,height);
      const safeX=(width-(width<560?160:224))/width,projected=new THREE.Vector3();
      model.traverseVisible(child=>{
        const positions=child.geometry?.attributes.position;if(!positions)return;
        for(let i=0;i<positions.count;i++) {
          projected.fromBufferAttribute(positions,i).applyMatrix4(child.matrixWorld).project(camera);
          assert.ok(Math.abs(projected.x)<=safeX+.001,`${skin} clips a side slot at ${width}px`);
          assert.ok(Math.abs(projected.y)<=.85,`${skin} clips the character stage`);
        }
      });
    }
    disposeLoadoutModel(model);
  }
});
