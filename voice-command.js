(function(root, factory){
  const api = factory();
  if(typeof module === 'object' && module.exports) module.exports = api;
  else root.PexuraVoiceCommand = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  const STOP_WORDS = new Set(['musteri','musteriye','musterisine','icin','adet','tane','ekle','sat','satis','yap','fiyat','fiyattan','den','dan','ten','tan']);

  function normalize(value){
    return String(value || '')
      .toLocaleLowerCase('tr-TR')
      .replace(/[çÇ]/g,'c').replace(/[ğĞ]/g,'g').replace(/[ıİ]/g,'i')
      .replace(/[öÖ]/g,'o').replace(/[şŞ]/g,'s').replace(/[üÜ]/g,'u')
      .replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
  }

  function searchableTokens(value){
    return normalize(value).split(' ').filter(token => token && !STOP_WORDS.has(token));
  }

  function findBestEntity(text, items, fields){
    const haystack = ` ${normalize(text)} `;
    const ranked = (items || []).map(item => {
      const labels = fields.map(field => String(item?.[field] || '')).filter(Boolean);
      let score = 0;
      for(const label of labels){
        const normalizedLabel = normalize(label);
        if(!normalizedLabel) continue;
        if(haystack.includes(` ${normalizedLabel} `)) score = Math.max(score, 10 + normalizedLabel.length / 100);
        const tokens = searchableTokens(label);
        if(tokens.length){
          const matched = tokens.filter(token => haystack.includes(` ${token} `)).length;
          score = Math.max(score, matched / tokens.length);
        }
      }
      return { item, score };
    }).filter(entry => entry.score > 0).sort((a,b) => b.score - a.score);

    if(!ranked.length || ranked[0].score < .5) return { item:null, ambiguous:false };
    const ambiguous = ranked.length > 1 && Math.abs(ranked[0].score - ranked[1].score) < .001;
    return { item:ambiguous ? null : ranked[0].item, ambiguous };
  }

  function parseNumber(raw){
    const value = String(raw || '').replace(',', '.');
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : NaN;
  }

  function parseSaleCommand(text, customers, products){
    const raw = String(text || '').trim();
    if(!raw) return { ok:false, error:'Komut boş.' };
    const numbers = [...raw.matchAll(/\d+(?:[.,]\d+)?/g)].map(match => ({value:parseNumber(match[0]), index:match.index}));
    const quantityEntry = numbers.find(entry => Number.isInteger(entry.value) && entry.value > 0);
    const priceEntry = numbers.length > 1 ? numbers[numbers.length - 1] : null;
    if(!quantityEntry) return { ok:false, error:'Adet anlaşılamadı. Örnek: 15 adet.' };
    if(!priceEntry || priceEntry === quantityEntry || !(priceEntry.value > 0)) return { ok:false, error:'Fiyat anlaşılamadı. Örnek: 1,15’ten.' };

    const customerMatch = findBestEntity(raw, customers, ['ad','tel']);
    if(customerMatch.ambiguous) return { ok:false, error:'Birden fazla müşteri eşleşti. Müşteri adını daha açık söyleyin.' };
    if(!customerMatch.item) return { ok:false, error:'Müşteri bulunamadı.' };
    const productMatch = findBestEntity(raw, products, ['ad','kod']);
    if(productMatch.ambiguous) return { ok:false, error:'Birden fazla ürün eşleşti. Ürün adını daha açık söyleyin.' };
    if(!productMatch.item) return { ok:false, error:'Ürün bulunamadı.' };

    return {
      ok:true,
      customer:customerMatch.item,
      product:productMatch.item,
      quantity:quantityEntry.value,
      price:priceEntry.value,
      transcript:raw
    };
  }

  return { normalize, findBestEntity, parseSaleCommand };
});
