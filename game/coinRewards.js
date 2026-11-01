// Coins remain whole numbers. Largest remainders preserve the full reward
// while keeping each player's share as close as possible to their real damage.
function splitCoinReward(reward, damageByAccount) {
  const coins=Math.max(0,Math.floor(Number(reward)||0));
  const entries=[...(damageByAccount||new Map())]
    .filter(([account,damage])=>typeof account==='string'&&account&&Number.isFinite(damage)&&damage>0)
    .sort(([a],[b])=>a.localeCompare(b));
  const total=entries.reduce((sum,[,damage])=>sum+damage,0);
  if(!coins||!total)return new Map();
  const shares=entries.map(([account,damage])=>{
    const exact=coins*damage/total,whole=Math.floor(exact);
    return {account,whole,remainder:exact-whole};
  });
  let left=coins-shares.reduce((sum,share)=>sum+share.whole,0);
  const ranked=[...shares].sort((a,b)=>b.remainder-a.remainder||a.account.localeCompare(b.account));
  for(let i=0;i<left;i++)ranked[i].whole++;
  return new Map(shares.map(({account,whole})=>[account,whole]));
}

module.exports={splitCoinReward};
