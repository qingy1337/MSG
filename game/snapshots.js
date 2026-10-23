// Explicit wire contract. Never serialize bot brains, account identifiers, or paths.
const FIELDS=['id','name','displayName','color','weapon','weaponSkinKey','primaryWeapon','primaryWeaponSkinKey','secondaryWeapon','secondaryWeaponSkinKey','weaponSwapUntil','spawnShieldUntil','x','y','angle','alive','health','maxHealth',
  'isBot','team','botType','botRank','strikeEncounterId','wardenPhase','spawnReadyAt','bodyHeight','hoverOffset','height','groundHeight','ceilingHeight','jumpStartedAt','jumpBase','jumpVelocity','jumpInputSeq','jumpPlatformId','groundPlatformId','platformId','lastProcessedInput','movementEpoch','shotgunShotsRemaining','shotgunReloadUntil','grenades'];
// Static identity/loadout data is sent by gameStarting/floorStarting. At 20 Hz,
// repeating names, colors, teams and both loadout slots for every bot wastes a
// large fraction of later-floor bandwidth.
const FRAME_FIELDS=['id','x','y','angle','alive','health','isBot',
  'wardenPhase','height','groundHeight','ceilingHeight','jumpStartedAt','jumpBase','jumpVelocity','jumpInputSeq',
  'jumpPlatformId','groundPlatformId','platformId','lastProcessedInput','movementEpoch',
  'shotgunShotsRemaining','shotgunReloadUntil','grenades'];
function copyState(player,fields){const result={};for(const key of fields)if(player[key]!==undefined)result[key]=player[key];
  // Frames are merged client-side, so the end of residual impact motion must
  // be explicit or an old velocity can be resurrected by retained state.
  if(player.knockback!==undefined)result.knockback=player.knockback?{...player.knockback}:null;
  // Send an explicit null after an Ogre attack ends. Compact frames are merged
  // into the previous client state, so omitting this field would leave the old
  // beam rendered while the Ogre walks away from its final traced endpoint.
  if(player.ogreAttack!==undefined)result.ogreAttack=player.ogreAttack?
    {...player.ogreAttack,beam:player.ogreAttack.beam?{...player.ogreAttack.beam}:undefined}:null;
  if(player.dreadAttack!==undefined)result.dreadAttack=player.dreadAttack?{...player.dreadAttack}:null;
  if(player.wardenAttack!==undefined)result.wardenAttack=player.wardenAttack?{...player.wardenAttack}:null;
  if(player.guardianAttack!==undefined)result.guardianAttack=player.guardianAttack?{...player.guardianAttack}:null;
  return result;
}
function playerSnapshot(player){return copyState(player,FIELDS);}
function playerFrame(player){return copyState(player,FRAME_FIELDS);}
module.exports={playerSnapshot,playerFrame};
