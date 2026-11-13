// Shared catalog and capped rules. Fixed stats and inventory rolls are server-owned.
(function(root,factory){
  const armor=factory();
  root.ARMOR=armor;
  if(typeof module==='object'&&module.exports)module.exports=armor;
})(globalThis,()=>{
  const SLOTS=Object.freeze(['helmet','chest','gauntlets','boots']);
  const SLOT_NAMES=Object.freeze({helmet:'Helmet',chest:'Chest',gauntlets:'Gauntlets',boots:'Boots'});
  const STATS=Object.freeze({
    health:{name:'Health',unit:' HP',cap:40},
    regen:{name:'Regeneration',unit:' HP/s',cap:2.5},
    speed:{name:'Movement',unit:'%',cap:20},
    fireRate:{name:'Firing rate',unit:'%',cap:8},
    charge:{name:'Grenade charge',unit:'%',cap:30},
  });
  const SETS=Object.freeze({
    bastion:{name:'Bastion',role:'Protection',pricePerPiece:4000,color:'#d8d7ca',accent:'#b15d36',dark:'#38464b',
      description:'Porcelain plates, copper fasteners, and a reinforced silhouette.',ranges:{health:[10,10],regen:[.125,.125]}},
    lifeline:{name:'Lifeline',role:'Recovery',pricePerPiece:3000,color:'#367c6c',accent:'#e4eee5',dark:'#203e3b',
      description:'Jade field armor with ivory inserts and compact recovery packs.',ranges:{health:[3,3],regen:[.625,.625]}},
    vector:{name:'Vector',role:'Mobility',pricePerPiece:3750,color:'#426796',accent:'#79d5df',dark:'#1d293e',visor:'#c4efff',
      metalness:.7,roughness:.3,trimMetalness:.2,trimRoughness:.34,darkMetalness:.75,darkRoughness:.4,
      description:'Satin cobalt alloy with clean beveled plates revealing a cyan inner layer.',ranges:{speed:[5,5],fireRate:[2,2]}},
  });
  const CATALOG=Object.create(null);
  for(const [setKey,set] of Object.entries(SETS))for(const slot of SLOTS) {
    const key=`${setKey}_${slot}`;
    CATALOG[key]={key,set:setKey,slot,name:`${set.name} ${SLOT_NAMES[slot]}`,rarity:'rare',
      description:set.description,ranges:set.ranges,price:set.pricePerPiece};
  }
  CATALOG.bastion_chest.description='Thick porcelain armor with gold-edged interlocking plates and reinforced ribs.';
  CATALOG.slipstream_boots={key:'slipstream_boots',set:'vector',slot:'boots',name:'Slipstream',rarity:'exotic',
    description:'Press Shift in the air to dash in your movement direction. Four-second cooldown. One dash per jump.',
    ranges:{speed:[1.5,2.5],charge:[5,8]},ability:'airDash',price:20000};
  CATALOG.quartermaster_helmet={key:'quartermaster_helmet',set:'bastion',slot:'helmet',name:'Quartermaster',rarity:'exotic',
    description:'Fully refills your grenades every 30 seconds in PvE. One exotic at a time.',
    appearance:{color:'#b8bdc4',accent:'#b9975e',dark:'#282c33',visor:'#23313d',metalness:.7,roughness:.3},
    ranges:{},ability:'grenadeRefill',price:30000};
  for(const value of Object.values(CATALOG))Object.freeze(value);
  Object.freeze(CATALOG);
  const DASH=Object.freeze({duration:.18,coastDuration:.45,speed:440,cooldownMs:4000});
  const GRENADE_REFILL_MS=30000;
  function statsForItems(items=[]) {
    const total={health:0,regen:0,speed:0,charge:0,fireRate:0,airDash:false};
    const used=new Set();let exotic=false;
    for(const item of items) {
      const definition=CATALOG[item?.key];
      if(!definition||used.has(definition.slot)||definition.rarity==='exotic'&&exotic)continue;
      used.add(definition.slot);
      if(definition.rarity==='exotic')exotic=true;
      for(const [stat,[low,high]] of Object.entries(definition.ranges)) {
        const value=item.stats?.[stat];
        if(low===high)total[stat]+=low;
        else if(Number.isFinite(value))total[stat]+=Math.min(high,Math.max(low,value));
      }
      if(definition.ability==='airDash')total.airDash=true;
      if(definition.ability==='grenadeRefill')total.grenadeRefill=true;
    }
    for(const key of Object.keys(STATS))total[key]=Math.round(Math.min(STATS[key].cap,total[key])*1000)/1000;
    return total;
  }
  function equippedItems(armor) {
    return SLOTS.map(slot=>(armor?.items||[]).find(item=>item.id===armor?.equipped?.[slot]&&CATALOG[item.key]?.slot===slot)).filter(Boolean);
  }
  function appearance(items=[]) {
    return Object.fromEntries(items.filter(item=>CATALOG[item?.key]).map(item=>[CATALOG[item.key].slot,item.key]));
  }
  function effects(stats,mode) {
    if(mode!=='pve')return {health:0,regen:0,speed:0,charge:0,fireRate:0,airDash:false};
    const result={airDash:stats?.airDash===true};
    if(stats?.grenadeRefill===true)result.grenadeRefill=true;
    for(const [key,info] of Object.entries(STATS))result[key]=Number.isFinite(stats?.[key])?Math.max(0,Math.min(info.cap,stats[key])):0;
    return result;
  }
  const formatStat=(key,value)=>`${Number(value.toFixed(3))}${STATS[key].unit}`;
  function weaponInterval(base,stats,mode,rapidFire=false) {
    return base/(1+effects(stats,mode).fireRate/100)/(mode==='pve'&&rapidFire?2:1);
  }
  return {SLOTS,SLOT_NAMES,STATS,SETS,CATALOG,DASH,GRENADE_REFILL_MS,statsForItems,equippedItems,appearance,effects,formatStat,weaponInterval};
});
