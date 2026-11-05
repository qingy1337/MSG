(function(root,factory){
  const settings=factory();
  Object.assign(root,settings);
  if(typeof module==='object'&&module.exports)module.exports=settings;
})(globalThis,()=>({GRENADE_FULL_CHARGE_MS:700}));
