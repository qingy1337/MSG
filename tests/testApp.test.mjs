import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import skins from '../lib/skins.js';

const root=fileURLToPath(new URL('../',import.meta.url));

test('test instance isolates its admin account, cookie, and unlocked skins',async t=>{
  const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'blocks-test-app-'));
  const child=spawn(process.execPath,['scripts/startTest.js'],{
    cwd:root,env:{...process.env,PORT:'0',DATA_DIR:dataDir,AUTH_COOKIE_NAME:'auth_token_test',
      AUTH_SECRET:'test-only-secret',TEST_ADMIN_PASSWORD:'test-admin-password'},
    stdio:['ignore','pipe','pipe'],
  });
  t.after(()=>{child.kill();fs.rmSync(dataDir,{recursive:true,force:true});});
  let output='';
  const port=await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error(`Test server did not start: ${output}`)),10000);
    child.stdout.on('data',chunk=>{
      output+=chunk.toString();
      const match=output.match(/Server running on http:\/\/localhost:(\d+)/);
      if(match){clearTimeout(timeout);resolve(Number(match[1]));}
    });
    child.stderr.on('data',chunk=>{output+=chunk.toString();});
    child.once('exit',code=>{clearTimeout(timeout);reject(new Error(`Test server exited ${code}: ${output}`));});
  });
  const base=`http://127.0.0.1:${port}`;
  const register=await fetch(`${base}/api/register`,{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({username:'someone',password:'password123'})});
  assert.equal(register.status,403);
  const login=await fetch(`${base}/api/login`,{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({username:'qing',password:'test-admin-password'})});
  assert.equal(login.status,200);
  const cookie=login.headers.get('set-cookie');
  assert.match(cookie,/^auth_token_test=/);
  const shop=await fetch(`${base}/api/shop/skins`,{headers:{cookie}});
  assert.equal(shop.status,200);
  const {skins:available}=await shop.json();
  assert.equal(available.length,Object.keys(skins.ALL_SKINS_BY_KEY).length);
  assert.ok(available.every(skin=>skin.owned));
  const updateColor=(body,headers={cookie})=>fetch(`${base}/api/loadout`,{
    method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await updateColor({playerColor:'#e078ab'},{})).status,401);
  assert.equal((await updateColor({playerColor:'red'})).status,400);
  const before=await (await fetch(`${base}/api/me`,{headers:{cookie}})).json();
  const changed=await updateColor({playerColor:'#E078AB'});
  assert.equal(changed.status,200);
  const changedUser=(await changed.json()).user;
  assert.equal(changedUser.loadout.playerColor,'#e078ab');
  assert.equal(changedUser.loadout.primaryWeapon,before.loadout.primaryWeapon);
  assert.equal((await updateColor({primaryWeapon:'sniper'})).status,200);
  const me=await (await fetch(`${base}/api/me`,{headers:{cookie}})).json();
  assert.equal(me.loadout.playerColor,'#e078ab','changing weapons preserves color');
  assert.equal(me.loadout.primaryWeapon,'sniper');
  const stored=JSON.parse(fs.readFileSync(path.join(dataDir,'users.json'),'utf8'));
  assert.deepEqual(stored.map(user=>user.username),['qing']);
  assert.equal(stored[0].loadout.playerColor,'#e078ab','color is persisted to the account');
});
