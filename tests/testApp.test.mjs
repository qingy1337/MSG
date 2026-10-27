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
  const stored=JSON.parse(fs.readFileSync(path.join(dataDir,'users.json'),'utf8'));
  assert.deepEqual(stored.map(user=>user.username),['qing']);
});
