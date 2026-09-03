(function(root){
  'use strict';
  function num(v){ const n=Number(v); return Number.isFinite(n)?n:0; }
  function summary(total,grossSold,returns){
    const toplam=Math.max(0,num(total));
    const brut=Math.max(0,num(grossSold));
    const iade=Math.max(0,num(returns));
    const net=Math.max(0,brut-iade);
    return {toplam,brutSatilan:brut,iade,netSatilan:net,kalan:Math.max(0,toplam-net)};
  }
  function stockValue(quantity,unitCost){ return Math.round((num(quantity)*num(unitCost)+Number.EPSILON)*100)/100; }
  const api=Object.freeze({num,summary,stockValue});
  root.PexuraStockMath=api;
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
