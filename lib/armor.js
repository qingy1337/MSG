const crypto=require('crypto');
const {SLOTS,SETS,CATALOG,equippedItems,appearance,statsForItems}=require('../public/armor');

function makeItem(key,{random=Math.random}={}) {
  const definition=CATALOG[key];
  if(!definition)throw new Error('Unknown armor design.');
  const stats=Object.fromEntries(Object.entries(definition.ranges).map(([stat,[low,high]])=>{
    if(low===high)return [stat,low];
    const roll=Math.max(0,Math.min(1,random()));
    const value=low+(high-low)*roll;
    return [stat,stat==='health'?Math.round(value):Math.round(value*100)/100];
  }));
  return {id:crypto.randomUUID(),key,stats,acquiredAt:Date.now()};
}

function ensureUserArmor(user) {
  if(!user)return;
  if(!user.armor||typeof user.armor!=='object'||Array.isArray(user.armor)) {
    user.armor={items:[],equipped:{}};
  }
  const armor=user.armor;
  if(!Array.isArray(armor.items))armor.items=[];
  // Free starter placeholders from the development draft are not purchased
  // gear. Keep any genuinely acquired pieces and existing valid selections.
  const seen=new Set();
  armor.items=armor.items.filter(item=>{
    if(!item||item.starter||typeof item.id!=='string'||!CATALOG[item.key]||seen.has(item.id))return false;
    // Fixed designs also update previously purchased rolls, preserving the
    // owned item and equipped slot. Other designs keep their original rolls.
    for(const [stat,[low,high]] of Object.entries(CATALOG[item.key].ranges))if(low===high) {
      if(!item.stats||typeof item.stats!=='object'||Array.isArray(item.stats))item.stats={};
      item.stats[stat]=low;
    }
    if(item.key.startsWith('vector_'))delete item.stats.charge;
    seen.add(item.id);return true;
  });
  if(!armor.equipped||typeof armor.equipped!=='object')armor.equipped={};
  let exotic=false;
  for(const slot of SLOTS) {
    const item=armor.items.find(value=>value.id===armor.equipped[slot]&&CATALOG[value.key].slot===slot);
    if(!item||CATALOG[item.key].rarity==='exotic'&&exotic)armor.equipped[slot]=null;
    else if(CATALOG[item.key].rarity==='exotic')exotic=true;
  }
  delete armor.dropsSinceExotic;
}

function publicArmor(user) {
  ensureUserArmor(user);
  const {items,equipped}=user.armor;
  return {items:items.map(item=>({...item,stats:{...item.stats}})),equipped:{...equipped},ownedSets:ownedSets(user),
    stats:statsForItems(equippedItems(user.armor))};
}

function equipArmor(user,slot,itemId) {
  ensureUserArmor(user);
  if(!SLOTS.includes(slot))throw new Error('Choose an armor slot.');
  if(itemId!==null) {
    const item=user.armor.items.find(value=>value.id===itemId);
    if(!item||CATALOG[item.key].slot!==slot)throw new Error('You do not own that piece for this slot.');
    if(CATALOG[item.key].rarity==='exotic'&&equippedItems(user.armor).some(other=>
      CATALOG[other.key].slot!==slot&&CATALOG[other.key].rarity==='exotic'))throw new Error('Equip one exotic at a time.');
  }
  user.armor.equipped[slot]=itemId;
}

function armorLoadout(user) {
  if(!user)return {armorAppearance:{},armorStats:statsForItems([])};
  ensureUserArmor(user);
  const items=equippedItems(user.armor);
  return {armorAppearance:appearance(items),armorStats:statsForItems(items)};
}

function ownedSets(user) {
  const keys=new Set(user.armor.items.map(item=>item.key));
  return [...Object.keys(SETS).filter(set=>SLOTS.every(slot=>keys.has(`${set}_${slot}`))),
    ...(keys.has('slipstream_boots')?['slipstream']:[])];
}

function purchaseArmor(user,key,{random=Math.random}={}) {
  ensureUserArmor(user);
  const definition=typeof key==='string'&&Object.hasOwn(CATALOG,key)?CATALOG[key]:null;
  if(!definition)throw new Error('Armor piece not found.');
  if(user.armor.items.some(item=>item.key===key))return {alreadyOwned:true};
  const coins=user.currencies?.Coins;
  if(!Number.isFinite(coins)||coins<definition.price)throw new Error('Not enough Coins.');
  // Grant exactly the selected design. Retries and older set purchases are
  // recognized per item, so neither can charge or roll the same piece twice.
  const piece=makeItem(key,{random});
  user.currencies.Coins=coins-definition.price;
  user.armor.items.push(piece);
  return {alreadyOwned:false};
}

function equipArmorSet(user,key) {
  ensureUserArmor(user);
  if(typeof key!=='string'||!ownedSets(user).includes(key))throw new Error('You do not own this armor set.');
  const keys=key==='slipstream'?['slipstream_boots']:SLOTS.map(slot=>`${key}_${slot}`);
  for(const itemKey of keys) {
    const item=user.armor.items.find(item=>item.key===itemKey);
    equipArmor(user,CATALOG[itemKey].slot,item.id);
  }
}

module.exports={ensureUserArmor,publicArmor,equipArmor,armorLoadout,purchaseArmor,equipArmorSet,makeItem};
