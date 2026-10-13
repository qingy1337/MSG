// Explicit wire contract. Never serialize bot brains, account identifiers, or paths.
const FIELDS=['id','name','displayName','color','weapon','weaponSkinKey','primaryWeapon','primaryWeaponSkinKey','secondaryWeapon','secondaryWeaponSkinKey','weaponSwapUntil','x','y','angle','alive','health','maxHealth',
  'isBot','team','botType','botRank','bodyHeight','height','groundHeight','ceilingHeight','jumpStartedAt','jumpBase','jumpVelocity','jumpInputSeq','jumpPlatformId','groundPlatformId','platformId','lastProcessedInput','movementEpoch','shotgunShotsRemaining','shotgunReloadUntil','grenades'];
// Static identity/loadout data is sent by gameStarting/floorStarting. At 20 Hz,
// repeating names, colors, teams and both loadout slots for every bot wastes a
// large fraction of later-floor bandwidth.
const FRAME_FIELDS=['id','weapon','weaponSkinKey','weaponSwapUntil','x','y','angle','alive','health','isBot',
  'height','groundHeight','ceilingHeight','jumpStartedAt','jumpBase','jumpVelocity','jumpInputSeq',
  'jumpPlatformId','groundPlatformId','platformId','lastProcessedInput','movementEpoch',
  'shotgunShotsRemaining','shotgunReloadUntil','grenades'];
function copyState(player,fields){const result={};for(const key of fields)if(player[key]!==undefined)result[key]=player[key];
  if(player.knockback)result.knockback={...player.knockback};
  if(player.ogreAttack)result.ogreAttack={...player.ogreAttack,beam:player.ogreAttack.beam?{...player.ogreAttack.beam}:undefined};
  if(player.dreadAttack!==undefined)result.dreadAttack=player.dreadAttack?{...player.dreadAttack}:null;
  return result;
}
function playerSnapshot(player){return copyState(player,FIELDS);}
function playerFrame(player){return copyState(player,FRAME_FIELDS);}
module.exports={playerSnapshot,playerFrame};
