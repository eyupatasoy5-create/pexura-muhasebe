(function(root){
  'use strict';
  function num(v){ const n=Number(v); return Number.isFinite(n)?n:0; }
  // Bu uygulamada ürünler adetle satılır. Stok sayıları tam sayıdır; fiyatlar
  // ayrıca para hesaplarında iki ondalık hassasiyetle işlenmeye devam eder.
  function quantity(v){ return Math.round(num(v)); }
  function summary(total,grossSold,returns){
    const toplam=Math.max(0,quantity(total));
    const brut=Math.max(0,quantity(grossSold));
    const iade=Math.max(0,quantity(returns));
    const net=Math.max(0,quantity(brut-iade));
    return {toplam,brutSatilan:brut,iade,netSatilan:net,kalan:Math.max(0,quantity(toplam-net))};
  }
  function stockValue(quantity,unitCost){ return Math.round((num(quantity)*num(unitCost)+Number.EPSILON)*100)/100; }
  const api=Object.freeze({num,quantity,summary,stockValue});
  root.PexuraStockMath=api;
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
