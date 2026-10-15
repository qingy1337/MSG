import {test} from 'node:test';
import assert from 'node:assert/strict';
import difficulty from '../game/pveDifficulty.js';
import combat from '../game/guardianCombat.js';
import server from '../game/gameServer.js';
import {createGuardianModel,poseGuardian,createGuardianProjectile,createGuardianExplosion,poseGuardianExplosion} from '../public/guardian.mjs';

const {floorDifficulty}=difficulty;
const {GUARDIAN_COMBAT,tickGuardianBurst,launchGuardianProjectile,stepGuardianProjectile,guardianBlastDamage}=combat;

test('Guardians begin after floor 40 without replacing Dread Troopers or Ogres',t=>{
  assert.equal(floorDifficulty(40).guardians,undefined);
  assert.equal(floorDifficulty(41).guardians,1);
  assert.equal(floorDifficulty(48).guardians,2);
  assert.equal(floorDifficulty(55).guardians,3);
  let tick,connect; t.mock.method(global,'setInterval',fn=>{tick=fn;return 0;});
  const handlers={},io={on(_,fn){connect=fn;},emit(){},socketsLeave(){},to(){return this;}};
  const game=server.createGameServer(io);
  connect({id:'human',user:{username:'qing'},on(name,fn){handlers[name]=fn;}});
  game.waitingPlayers.push({id:'human',name:'Human',accountUsername:'qing',weapon:'autoRifle'});
  handlers.startGame({enableBots:true,startFloor:41});
  try {
    const bots=game.activePlayers.filter(player=>player.isBot);
    assert.equal(bots.length,11);assert.equal(bots.filter(bot=>bot.botType==='guardian').length,1);
    assert.equal(bots.filter(bot=>bot.botType==='ogre').length,4);
    assert.equal(bots.filter(bot=>bot.botType==='dread').length,6);
    const guardian=bots.find(bot=>bot.botType==='guardian');
    assert.equal(guardian.health,420);assert.equal(guardian.hoverOffset,1.1);assert.equal(guardian.bodyRadius,28);
  } finally {game.close();}
});

test('Guardian charge warns, emits a spaced three-orb burst and recovers',()=>{
  const bot={id:'g',x:100,y:100,angle:0,botState:{}},target={id:'p',x:350,y:100,height:0,alive:true};
  const shots=[];
  assert.equal(tickGuardianBurst(bot,target,true,true,0,(p,i)=>shots.push([p,i])),true);
  assert.equal(bot.guardianAttack.phase,'charge');assert.equal(shots.length,0);
  tickGuardianBurst(bot,target,true,true,GUARDIAN_COMBAT.chargeMs-1,()=>assert.fail());
  for(let i=0;i<3;i++)tickGuardianBurst(bot,target,true,true,
    GUARDIAN_COMBAT.chargeMs+i*GUARDIAN_COMBAT.shotIntervalMs,(p,n)=>shots.push([p,n]));
  assert.deepEqual(shots.map(shot=>shot[1]),[0,1,2]);assert.equal(bot.guardianAttack,null);
  assert.ok(bot.botState.guardianReadyAt>GUARDIAN_COMBAT.chargeMs+2*GUARDIAN_COMBAT.shotIntervalMs);
});

test('Guardian orbs arc into terrain, splash with fast falloff and respect cover',()=>{
  const map={width:900,height:600,ceiling:8,terrain:[],elevator:null,arrivalElevator:null};
  const bot={id:'g',x:100,y:300,height:0,hoverOffset:1.1,angle:0};
  const target={id:'p',x:360,y:300,height:0,bodyRadius:16,bodyHeight:2.2,alive:true};
  const orb=launchGuardianProjectile(bot,target,0,1);
  let impacted=false;
  for(let now=50;now<=orb.expiresAt&&!impacted;now+=50)impacted=stepGuardianProjectile(orb,now,map,[],[]);
  assert.equal(impacted,true);assert.ok(orb.x>300&&orb.x<430);assert.ok(orb.height<.35);
  assert.ok(guardianBlastDamage(orb,{...target,x:orb.x+10},map,[])>25);
  assert.ok(guardianBlastDamage(orb,{...target,x:orb.x+100},map,[])<8);
  assert.equal(guardianBlastDamage(orb,{...target,x:orb.x+80},map,[{x:orb.x+30,y:orb.y-20,width:10,height:40,bottom:0,top:4}]),0);
});

test('Guardian model, projectile and implosion pose with finite geometry',()=>{
  const model=createGuardianModel();poseGuardian(model,{phase:'charge',progress:.8},1.2);
  const projectile=createGuardianProjectile(),explosion=createGuardianExplosion();poseGuardianExplosion(explosion,.3);
  for(const root of [model.group,projectile.group,explosion])root.traverse(object=>{
    if(!object.geometry)return;
    const values=object.geometry.attributes.position.array;
    assert.ok([...values].every(Number.isFinite));
  });
  assert.ok(model.glow.emissiveIntensity>2.5);assert.ok(explosion.userData.rings[0].scale.x>1);
});
