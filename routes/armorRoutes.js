const express=require('express');
const {requireUser,saveUsers}=require('../lib/userStore');
const {publicArmor,equipArmor,purchaseArmor,equipArmorSet}=require('../lib/armor');

function createArmorRoutes() {
  const router=express.Router();
  router.get('/',(req,res)=>{
    const user=requireUser(req,res);if(!user)return;
    res.json(publicArmor(user));
  });
  router.post('/equip',(req,res)=>{
    const user=requireUser(req,res);if(!user)return;
    try {equipArmor(user,req.body?.slot,req.body?.itemId);}
    catch(error){return res.status(400).json({error:error.message});}
    saveUsers();
    // Match loadouts are snapshots. Editing the account never refreshes health
    // or changes an ability in an already-running match.
    res.json({armor:publicArmor(user)});
  });
  router.post('/purchase',(req,res)=>{
    const user=requireUser(req,res);if(!user)return;
    try {
      const result=purchaseArmor(user,req.body?.itemKey);
      saveUsers();res.json({...result,armor:publicArmor(user),currencies:{...user.currencies}});
    } catch(error){res.status(400).json({error:error.message});}
  });
  router.post('/equip-set',(req,res)=>{
    const user=requireUser(req,res);if(!user)return;
    try {equipArmorSet(user,req.body?.setKey);}
    catch(error){return res.status(400).json({error:error.message});}
    saveUsers();res.json({armor:publicArmor(user)});
  });
  return router;
}
module.exports={createArmorRoutes};
