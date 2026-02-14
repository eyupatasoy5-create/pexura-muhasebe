const SUPABASE_URL = "https://qzpozucwuwhyfbnwhjnm.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_bsEk84gkUDPR7gDHXjjlsw_k6nHSYua";

const supa = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let USER = null;
let USER_ROLE = 'personel';

let EDIT_CARI_ID = null;
let EDIT_URUN_ID = null;
let EDIT_GG_ID = null;
let EDIT_HAREKET_ID = null;
let EDIT_FATURA_ID = null;
let CURRENT_IMG_URL = null;
let IS_IMG_REMOVED = false;

let CARILER=[], URUNLER=[], HESAPLAR=[], HAREKETLER=[], GG=[], FATURALAR=[], TUM_KALEMLER=[];
let FATURA_SATIRLAR=[];

// --- Müşteri Paneli Sepet ---
let ACTIVE_CARI_ID = null;
let CP_SEPET = [];
let CP_HAREKETLER = [];

// Fatura ekranında "son kullanılan cariler" (localStorage)
const RECENT_CARI_KEY = "recentCariIds";

/* =========================================================
   HELPER + VALIDATION (madde 11)
========================================================= */
const fmt = (n, curr='USD') => {
  let symbol = '$'; if(curr === 'TL') symbol = '₺'; if(curr === 'EUR') symbol = '€';
  return (Number(n||0)).toLocaleString("tr-TR",{minimumFractionDigits:2,maximumFractionDigits:2}) + " " + symbol;
};
const todayStr = ()=> new Date().toISOString().slice(0,10);
const nowLocalDT = ()=>{
  const d=new Date();
  d.setMinutes(d.getMinutes()-d.getTimezoneOffset());
  return d.toISOString().slice(0,16);
};

function ymd(dateStrOrDate){
  const d = (dateStrOrDate instanceof Date) ? dateStrOrDate : new Date(dateStrOrDate);
  return new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().slice(0,10);
}

function getActiveCariler(){
  // aktif alanı yoksa hepsi aktif kabul edilir
  return (CARILER||[]).filter(c => c.aktif !== false);
}

function getRecentCariIds(){
  try{ return JSON.parse(localStorage.getItem(RECENT_CARI_KEY)||'[]') || []; }catch(e){ return []; }
}
function pushRecentCariId(id){
  if(!id) return;
  const arr = getRecentCariIds().filter(x => x !== id);
  arr.unshift(id);
  localStorage.setItem(RECENT_CARI_KEY, JSON.stringify(arr.slice(0,10)));
}

// Tarih formatı: GG.AA.YYYY SS:DD (PDF ve listelerde)
function formatDateTR(dt){
  const d = new Date(dt);
  if(!dt || isNaN(d.getTime())) return String(dt||'');
  const pad = (n)=> String(n).padStart(2,'0');
  return `${pad(d.getDate())}.${pad(d.getMonth()+1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}


// Tarih formatı: GG.AA.YYYY SS:DD (madde 1)
const formatTRDateTime = (v)=>{
  if(!v) return "";
  try{
    // v: "YYYY-MM-DD" veya "YYYY-MM-DDTHH:MM" gibi
    const s = String(v).trim().replace(" ", "T");
    const d = new Date(s);
    if(!Number.isFinite(d.getTime())) return String(v);
    const pad=(n)=> String(n).padStart(2,'0');
    const dd=pad(d.getDate()), mm=pad(d.getMonth()+1), yy=d.getFullYear();
    const hh=pad(d.getHours()), mi=pad(d.getMinutes());
    return `${dd}.${mm}.${yy} ${hh}:${mi}`;
  }catch(e){
    return String(v);
  }
};


function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if(!container){ alert(message); return; }
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  let icon = type === 'success' ? '✅' : '⚠️'; if(type === 'error') icon = '❌';
  toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
}

const toNum = (v)=> {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
// Kâr hesap (alış, satış, miktar)
const calcLineProfit = (alis, satis, miktar)=> (toNum(satis) - toNum(alis)) * toNum(miktar);
const isPosNum = (v)=> toNum(v) > 0;
const isEmail = (s)=> !!String(s||"").match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
const cleanPhoneTR = (s)=>{
  let p = String(s||"").replace(/[^0-9]/g,'');
  if(p.startsWith('0')) p = p.slice(1);
  if(p.length===10) p='90'+p;
  return p;
};

window.openImageModal = (src) => { if (!src) return; document.getElementById('imgBigPreview').src = src; document.getElementById('modalImageView').classList.remove('hide'); }
window.closeImageModal = () => { document.getElementById('modalImageView').classList.add('hide'); }

function setAppView(mode) {
  if (mode === 'mobile') { document.body.classList.add('force-mobile'); document.body.classList.remove('force-desktop'); showToast("Mobil görünüm aktif.", "info"); } 
  else { document.body.classList.add('force-desktop'); document.body.classList.remove('force-mobile'); showToast("PC görünümü aktif.", "info"); }
}

/* =========================================================
   STOK GÜNCELLEME + STOK LOG (madde 3)
========================================================= */
async function logStockMove({urunId, degisim, tur="manual", kaynak=null, kaynak_id=null, aciklama=null}){
  try{
    await supa.from("stok_hareketleri").insert({
      user_id: USER?.id || null,
      urun_id: urunId,
      tur,
      miktar_degisim: degisim,
      kaynak,
      kaynak_id,
      aciklama
    });
  }catch(e){
    console.warn("stok_hareketleri log yazılamadı:", e?.message||e);
  }
}

async function applyStockChange(urunId, degisim, meta={}){
  try{
    // önce RPC dene
    const { error } = await supa.rpc("stok_guncelle", { p_urun_id: urunId, p_degisim: degisim });
    if(error){
      console.warn("stok_guncelle RPC çalışmadı, direkt update:", error);
      const urun = URUNLER.find(u=>u.id==urunId);
      const cur = Number(urun?.stok_miktar||0);
      const yeni = cur + Number(degisim||0);
      const res2 = await supa.from("urunler").update({ stok_miktar: yeni }).eq("id", urunId);
      if(res2.error) throw res2.error;
    }

    // stok hareket logu
    await logStockMove({urunId, degisim, ...meta});

    // yeniden ürün çekip kritik stok bildirimi (madde 12)
    const u = URUNLER.find(x=>x.id==urunId);
    if(u){
      const yeniStok = Number(u.stok_miktar||0) + Number(degisim||0);
      if(yeniStok <= Number(u.min_stok||0)){
        showToast(`"${u.ad}" kritik stok seviyesinde: ${yeniStok}`, "warning");
      }
    }

  } catch(e){
    console.error("Stok güncelleme hatası:", e);
    showToast("Stok güncellenemedi: " + (e?.message||e), "error");
  }
}

/* =========================================================
   AUTH
========================================================= */
async function register(){
  const email = authEmail.value.trim();
  const password = authPass.value.trim();
  if(!isEmail(email)) return showToast("Geçerli e-posta girin.","warning");
  if(String(password).length<6) return showToast("Şifre en az 6 karakter olmalı.","warning");
  const { error } = await supa.auth.signUp({ email, password });
  if(error) return showToast(error.message, "error");
  showToast("Kayıt başarılı!", "success");
}
async function login(){
  const email = authEmail.value.trim();
  const password = authPass.value.trim();
  const { error } = await supa.auth.signInWithPassword({ email, password });
  if(error) return showToast(error.message, "error");
  await loadSession();
}
async function logout(){ await supa.auth.signOut(); location.reload(); }

async function loadSession(){
  const { data } = await supa.auth.getUser();
  USER = data.user;
  if(USER){
    const { data: roleData } = await supa.from('user_roles').select('role').eq('user_id', USER.id).single();
    USER_ROLE = roleData ? roleData.role : 'personel';

    authLoggedOut.classList.add("hide");
    authLoggedIn.classList.remove("hide");
    authUserMail.textContent = `${USER.email} (${USER_ROLE.toUpperCase()})`;

    applyRolePermissions();
    await fetchAll();
  }
}
function applyRolePermissions(){
  const adminTabs = ['dash', 'cariler', 'faturalar', 'kasa', 'gelirgider','gecmis'];
  if(USER_ROLE === 'personel'){
    adminTabs.forEach(id => {
      const btn = document.querySelector(`button[data-tab="${id}"]`);
      if(btn) btn.classList.add('hide');
    });
    document.querySelector(`button[data-tab="urunler"]`).click();
    document.getElementById('uEkleCard').classList.add('hide');
  } else {
    adminTabs.forEach(id => {
      const btn = document.querySelector(`button[data-tab="${id}"]`);
      if(btn) btn.classList.remove('hide');
    });
    document.getElementById('uEkleCard').classList.remove('hide');
    document.querySelector(`button[data-tab="dash"]`).click();
  }
}
document.getElementById('btnRegister').onclick=register;
document.getElementById('btnLogin').onclick=login;
document.getElementById('btnLogout').onclick=logout;

/* =========================================================
   DATA FETCH
========================================================= */
async function fetchAll(){
  if(USER_ROLE === 'personel'){
    await fetchUrunler();
  } else {
    await Promise.all([
      fetchCariler(),
      fetchUrunler(),
      fetchHesaplar(),
      fetchHareketler(),
      fetchGG(),
      fetchFaturalar()
    ]);
    await fetchTumKalemler();
  }
  fillSelects();
  renderAll();
  runStartupAlerts(); // madde 12
}

async function fetchTumKalemler() {
  const { data } = await supa.from('fatura_kalemler').select('*');
  TUM_KALEMLER = data || [];
}

/* =========================================================
   DASHBOARD + AGING (madde 7) + ALERTS (madde 12)
========================================================= */
function calcAgingBuckets(curr='USD'){
  const buckets = {b0_30:0, b31_60:0, b61p:0};

  CARILER.forEach(c=>{
    // müşteri satış borcu
    const satislar = FATURALAR.filter(f=>f.cari_id==c.id && normalizeTip(f.tip)==='satis' && f.para_birimi===curr);
    const tahsilatlar = HAREKETLER.filter(h=>h.cari_id==c.id && h.tur==='tahsilat' && (HESAPLAR.find(x=>x.id==h.hesap_id)?.para_birimi||curr)===curr);

    let borcTop = satislar.reduce((a,f)=>a+toNum(f.genel_toplam),0) + toNum(c.acilis_borc);
    let alacakTop = tahsilatlar.reduce((a,h)=>a+toNum(h.tutar),0) + toNum(c.acilis_alacak);

    let net = borcTop - alacakTop;
    if(net<=0) return;

    // yaşlandırma: satış faturalarını tarihe göre sırala, ödeme FIFO dağıt (basit)
    let kalanOdeme = alacakTop;
    const sorted = satislar.slice().sort((a,b)=>new Date(a.tarih)-new Date(b.tarih));
    for(const f of sorted){
      let tut = toNum(f.genel_toplam);
      if(kalanOdeme>0){
        const use = Math.min(kalanOdeme, tut);
        tut -= use;
        kalanOdeme -= use;
      }
      if(tut<=0) continue;

      const gun = Math.floor((Date.now() - new Date(f.tarih).getTime())/86400000);
      if(gun<=30) buckets.b0_30 += tut;
      else if(gun<=60) buckets.b31_60 += tut;
      else buckets.b61p += tut;
    }
  });

  return buckets;
}

// Dashboard: Satış & Kâr işlem listesi (Fatura Bazlı)
function renderDashSatisKarListesi(curr='USD'){
  const tbody = document.getElementById('dashSatisKarListe');
  const elTopSatis = document.getElementById('dashSatisKarToplamSatis');
  const elTopKar = document.getElementById('dashSatisKarToplamKar');
  const elTopKarYuzde = document.getElementById('dashSatisKarToplamKarYuzde');
  if(!tbody || !elTopSatis || !elTopKar) return;

  // Kalemleri fatura_id'ye göre indexle
  const kalemByFatura = new Map();
  for(const k of (TUM_KALEMLER||[])){
    const fid = k.fatura_id;
    if(!fid) continue;
    if(!kalemByFatura.has(fid)) kalemByFatura.set(fid, []);
    kalemByFatura.get(fid).push(k);
  }

  // Carileri id -> record map
  const cariById = new Map((CARILER||[]).map(c=>[c.id, c]));

  const satisFaturalar = (FATURALAR||[])
    .filter(f => normalizeTip(f.tip)==='satis' && (f.para_birimi||'USD') === curr)
    .slice()
    .sort((a,b)=> new Date(b.tarih) - new Date(a.tarih));

  tbody.innerHTML = '';
  let topSatis = 0;
  let topKar = 0;

  satisFaturalar.slice(0, 50).forEach(f=>{
    const kalemler = kalemByFatura.get(f.id) || [];
    let satis = 0;
    let kar = 0;
    for(const fk of kalemler){
      const miktar = toNum(fk.miktar);
      const bf = toNum(fk.birim_fiyat);
      const alisSnap = toNum(fk.alis_fiyat_snapshot);
      satis += miktar * bf;
      kar += (miktar * bf) - (miktar * alisSnap);
    }

    topSatis += satis;
    topKar += kar;

    const cari = cariById.get(f.cari_id);
    const musteri = (cari && (cari.ad || cari.unvan || cari.isim || cari.name)) || '-';
    const karYuzde = satis > 0 ? (kar / satis) * 100 : 0;

    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    tr.onclick = ()=> openFaturaDetayModal(f.id);

    tr.innerHTML = `
      <td>${formatTRDateTime(f.tarih)}</td>
      <td>
        ${f.numara || '-'}<br>
        <small style="opacity:.75;">
          <a href="javascript:void(0)" onclick="event.stopPropagation(); openEkstre('${f.cari_id}')" style="color:#60a5fa; text-decoration:none;">
            ${musteri}
          </a>
        </small>
      </td>
      <td style="text-align:right;">${fmt(satis, curr)}</td>
      <td style="text-align:right; font-weight:700; color:${kar>=0?'#4ade80':'#ef4444'};">${fmt(kar, curr)}</td>
      <td style="text-align:right;">${karYuzde.toFixed(2)}%</td>
    `;
    tbody.appendChild(tr);
  });

  elTopSatis.textContent = fmt(topSatis, curr);
  elTopKar.textContent = fmt(topKar, curr);
  if(elTopKarYuzde){
    const pct = topSatis > 0 ? (topKar / topSatis) * 100 : 0;
    elTopKarYuzde.textContent = pct.toFixed(2) + '%';
  }
}


function renderDash(){
  const currElem = document.getElementById('dashCurrencySelect');
  const curr = currElem ? currElem.value : 'USD';

  const filteredUrun = URUNLER.filter(u => u.para_birimi === curr);
  let totalStockVal = 0;
  filteredUrun.forEach(u => { totalStockVal += (Number(u.stok_miktar) || 0) * (Number(u.satis_fiyat) || 0); });
  document.getElementById('dashStokDeger').innerHTML =
    `<span style="font-size:0.6em; color:#94a3b8">${filteredUrun.length} Çeşit</span><br>${fmt(totalStockVal, curr)}`;

  let totalSales = 0;
  FATURALAR
    .filter(f => normalizeTip(f.tip)==='satis' && f.para_birimi === curr)
    .forEach(f => { totalSales += Number(f.genel_toplam); });
  document.getElementById('dashToplamSatis').textContent = fmt(totalSales, curr);

  let income = 0; let expense = 0;
  HAREKETLER.forEach(h => {
    const hesap = HESAPLAR.find(x => x.id == h.hesap_id);
    if(hesap && hesap.para_birimi === curr) {
      if(h.tur === 'tahsilat') income += Number(h.tutar);
      if(h.tur === 'odeme') expense += Number(h.tutar);
    }
  });
  GG.forEach(g => {
    if(g.tur === 'gelir') income += Number(g.tutar);
    if(g.tur === 'gider') expense += Number(g.tutar);
  });
  const balance = income - expense;
  document.getElementById('dashNakit').innerHTML =
    `<span style="color:${balance >= 0 ? '#4ade80' : '#ef4444'}">${fmt(balance, curr)}</span>`;

  const kritikListe = document.getElementById('dashKritikListe');
  kritikListe.innerHTML = "";
  URUNLER.forEach(u => {
    if(Number(u.stok_miktar) <= Number(u.min_stok)){
      kritikListe.innerHTML += `<tr><td>${u.ad}</td><td><span style="color:red;font-weight:bold">${u.stok_miktar}</span></td><td>${u.min_stok}</td></tr>`;
    }
  });

  // Son işlemler
  const combinedMoves = [
    ...HAREKETLER.map(h => ({
      tarih: h.tarih,
      tur: h.tur,
      tutar: h.tutar,
      pb: HESAPLAR.find(x=>x.id==h.hesap_id)?.para_birimi || 'USD'
    })),
    ...GG.map(g => ({tarih: g.tarih, tur: g.tur, tutar: g.tutar, pb: 'USD'}))
  ];
  combinedMoves.sort((a,b) => new Date(b.tarih) - new Date(a.tarih));
  const sonHareketler = document.getElementById('dashSonHareketler');
  sonHareketler.innerHTML = "";
  combinedMoves.slice(0, 5).forEach(m => {
    sonHareketler.innerHTML += `<tr><td>${formatTRDateTime(m.tarih)}</td><td><span class="tag">${m.tur}</span></td><td>${Number(m.tutar).toLocaleString('tr-TR')} ${m.pb === 'TL' ? '₺' : (m.pb==='EUR'?'€':'$')}</td></tr>`;
  });

  // Son Ödemeler
  const dashOdemeler = document.getElementById("dashOdemeler");
  if(dashOdemeler){
    dashOdemeler.innerHTML="";
    HAREKETLER
      .filter(h => h.tur==='tahsilat')
      .slice(0,10)
      .forEach(h=>{
        const cari = CARILER.find(c=>c.id==h.cari_id);
        dashOdemeler.innerHTML += `<tr><td>${formatTRDateTime(h.tarih)}</td><td>${cari?.ad||'-'}</td><td>${fmt(h.tutar, HESAPLAR.find(x=>x.id==h.hesap_id)?.para_birimi||'USD')}</td></tr>`;
      });
  }

  // Satış & Kâr İşlem Listesi (Fatura Bazlı)
  renderDashSatisKarListesi(curr);

  // Bugün / Bu Ay panosu
  const todayYMD = ymd(new Date());
  const nowD = new Date();
  const mStart = new Date(nowD.getFullYear(), nowD.getMonth(), 1);
  const mEnd = new Date(nowD.getFullYear(), nowD.getMonth()+1, 1);
  const mStartY = ymd(mStart);
  const mEndY = ymd(mEnd);

  const monthSalesInvoices = FATURALAR.filter(f => normalizeTip(f.tip)==='satis' && f.para_birimi===curr && ymd(f.tarih) >= mStartY && ymd(f.tarih) < mEndY);
  const monthSales = monthSalesInvoices.reduce((sum,f)=> sum + toNum(f.genel_toplam), 0);

  const todaySales = FATURALAR.filter(f => normalizeTip(f.tip)==='satis' && f.para_birimi===curr && ymd(f.tarih)===todayYMD)
    .reduce((sum,f)=> sum + toNum(f.genel_toplam), 0);

  // kasa hareketleri
  const todayIncome = HAREKETLER.filter(h => h.tur==='tahsilat' && ymd(h.tarih)===todayYMD)
    .filter(h => (HESAPLAR.find(x=>x.id==h.hesap_id)?.para_birimi || curr)===curr)
    .reduce((sum,h)=> sum + toNum(h.tutar), 0);
  const todayExpense = HAREKETLER.filter(h => h.tur==='odeme' && ymd(h.tarih)===todayYMD)
    .filter(h => (HESAPLAR.find(x=>x.id==h.hesap_id)?.para_birimi || curr)===curr)
    .reduce((sum,h)=> sum + toNum(h.tutar), 0);

  // Gelir-gider (para birimi kolonu yoksa, seçili para birimi ile gösteriyoruz)
  const monthGider = GG.filter(g => g.tur==='gider' && ymd(g.tarih) >= mStartY && ymd(g.tarih) < mEndY)
    .reduce((sum,g)=> sum + toNum(g.tutar), 0);

  // Ay kâr: fatura_kalemler snapshotlarından hesapla
  const kalemByFatura = {};
  (TUM_KALEMLER||[]).forEach(k=>{ (kalemByFatura[k.fatura_id] ||= []).push(k); });
  const monthProfit = monthSalesInvoices.reduce((sum,f)=>{
    const ks = kalemByFatura[f.id] || [];
    const p = ks.reduce((s,k)=> s + (toNum(k.miktar) * (toNum(k.birim_fiyat) - toNum(k.alis_fiyat_snapshot))), 0);
    return sum + p;
  }, 0);
  const monthNetProfit = monthProfit - monthGider;

  const eBS = document.getElementById('dashBugunSatis');
  const eBT = document.getElementById('dashBugunTahsilat');
  const eBO = document.getElementById('dashBugunOdeme');
  if(eBS) eBS.textContent = fmt(todaySales, curr);
  if(eBT) eBT.textContent = fmt(todayIncome, curr);
  if(eBO) eBO.textContent = fmt(todayExpense, curr);

  const eAS = document.getElementById('dashAySatis');
  const eAG = document.getElementById('dashAyGider');
  const eAK = document.getElementById('dashAyNetKar');
  if(eAS) eAS.textContent = fmt(monthSales, curr);
  if(eAG) eAG.textContent = fmt(monthGider, curr);
  if(eAK) eAK.innerHTML = `<span style="color:${monthNetProfit>=0?'#4ade80':'#ef4444'}">${fmt(monthNetProfit, curr)}</span>`;

  // En borçlu 5 cari (seçili para birimi)
  const topBorclu = (CARILER||[])
    .filter(c=> c.aktif!==false)
    .map(c=>{
      const map = getCariBakiyeMap(c);
      return { id:c.id, ad:c.ad, bakiye: toNum(map[curr]||0) };
    })
    .filter(x=> x.bakiye > 0)
    .sort((a,b)=> b.bakiye - a.bakiye)
    .slice(0,5);
  const tList = document.getElementById('dashTopBorcluList');
  if(tList){
    tList.innerHTML = topBorclu.length
      ? topBorclu.map(x=>`<li>${x.ad}<span class="muted">${fmt(x.bakiye, curr)}</span></li>`).join('')
      : `<li class="muted">Borçlu cari yok.</li>`;
  }

  // Son İadeler
  const dashIadeler = document.getElementById("dashIadeler");
  if(dashIadeler){
    dashIadeler.innerHTML="";
    FATURALAR
      .filter(f => normalizeTip(f.tip)==='iade')
      .slice(0,10)
      .forEach(f=>{
        const cari = CARILER.find(c=>c.id==f.cari_id);
        dashIadeler.innerHTML += `<tr><td>${formatTRDateTime(f.tarih)}</td><td>${cari?.ad||'-'}</td><td>${fmt(f.genel_toplam,f.para_birimi)}</td></tr>`;
      });
  }

  // Aging buckets render (madde 7)
  const ag = calcAgingBuckets(curr);
  if(ag){
    const e0=document.getElementById("dashAging0_30");
    const e1=document.getElementById("dashAging31_60");
    const e2=document.getElementById("dashAging61p");
    if(e0) e0.textContent = fmt(ag.b0_30, curr);
    if(e1) e1.textContent = fmt(ag.b31_60, curr);
    if(e2) e2.textContent = fmt(ag.b61p, curr);

    if(ag.b61p>0){
      showToast(`60+ gün gecikmiş toplam borç: ${fmt(ag.b61p,curr)}`, "warning");
    }
  }
}

const dSel = document.getElementById('dashCurrencySelect');
if(dSel) dSel.onchange = renderDash;

/* =========================================================
   ACTIONS & PDF
========================================================= */
async function logAction(tableName, actionType, recordId, oldData = null) {
  if(!USER) return;
  await supa.from('system_logs').insert({
    user_id: USER.id,
    table_name: tableName,
    action_type: actionType,
    record_id: recordId,
    old_data: oldData
  });
}

function trFix(text) {
  if(!text) return "";
  const map = { 'ğ': 'g', 'Ğ': 'G', 'ş': 's', 'Ş': 'S', 'ı': 'i', 'İ': 'I', 'ü': 'u', 'Ü': 'U', 'ö': 'o', 'Ö': 'O', 'ç': 'c', 'Ç': 'C' };
  return text.toString().replace(/[ğĞşŞıİüÜöÖçÇ]/g, (letter) => map[letter]);
}

function addPdfHistory(fatura){
  const key="pdf_history";
  const old=JSON.parse(localStorage.getItem(key)||"[]");
  old.unshift({
    numara:fatura.numara,
    tarih:fatura.tarih,
    cari:fatura.cariler?.ad||"",
    tutar:fatura.genel_toplam,
    pb:fatura.para_birimi
  });
  localStorage.setItem(key, JSON.stringify(old.slice(0,30)));
  renderPdfHistory();
}
function renderPdfHistory(){
  const ul=document.getElementById("pdfHistoryList");
  if(!ul) return;
  const list=JSON.parse(localStorage.getItem("pdf_history")||"[]");
  ul.innerHTML = list.length? "" : "<li class='muted'>PDF oluşturulmadı.</li>";
  list.forEach(x=>{
    const li=document.createElement("li");
    li.textContent = `${formatDateTR(x.tarih)} - ${x.numara||"-"} - ${x.cari||"-"} - ${fmt(x.tutar,x.pb)}`;
    ul.appendChild(li);
  });
}

async function generateAndSharePDF(fatura, mode = 'download') {
  try {
    if (!window.jspdf) { showToast("PDF kütüphanesi eksik.", "error"); return; }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "mm", format: "a4" });

    // Kalemler
    const { data: kalemler } = await supa
      .from('fatura_kalemler')
      .select('*')
      .eq('fatura_id', fatura.id);

    // Cari bilgisi
    const { data: cari } = await supa
      .from('cariler')
      .select('ad, tel, acilis_borc, acilis_alacak')
      .eq('id', fatura.cari_id)
      .single();

    const cariAd = cari?.ad || 'Bilinmiyor';
    const cariTel = cari?.tel || '';

    // --- Güncel borç hesapla (DB'den, para birimi bazlı) ---
    let guncelBorc = 0;
    try {
      // Cari faturaları (aynı para birimi)
      const { data: cariFaturalar } = await supa
        .from('faturalar')
        .select('tip, genel_toplam, para_birimi')
        .eq('cari_id', fatura.cari_id)
        .eq('para_birimi', fatura.para_birimi);

      // Kasa hareketleri + hesap para birimi
      const { data: hareketler } = await supa
        .from('kasa_hareketler')
        .select('tur, tutar, hesap_id, cari_id')
        .eq('cari_id', fatura.cari_id);

      const { data: hesaplar } = await supa
        .from('kasa_hesaplar')
        .select('id, para_birimi');

      const hesapPB = new Map((hesaplar || []).map(h => [String(h.id), h.para_birimi]));

      let borc = 0;
      let alacak = 0;

      // faturalar: satis borca ekler, iade alacağa ekler (borçtan düşer)
      (cariFaturalar || []).forEach(ff => {
        const tip = normalizeTip(ff.tip);
        if (tip === 'satis') borc += toNum(ff.genel_toplam);
        if (tip === 'iade') alacak += toNum(ff.genel_toplam);
      });

      // tahsilat: alacağa eklenir (borçtan düşer) - sadece ilgili PB
      (hareketler || []).forEach(h => {
        if (h.tur !== 'tahsilat') return;
        const pb = hesapPB.get(String(h.hesap_id)) || null;
        if (pb && pb !== fatura.para_birimi) return;
        alacak += toNum(h.tutar);
      });

      // açılış
      borc += toNum(cari?.acilis_borc);
      alacak += toNum(cari?.acilis_alacak);

      guncelBorc = borc - alacak;
    } catch (e) {
      // DB hesabı olmazsa local fallback
      if (typeof hesaplaBakiye === "function") guncelBorc = hesaplaBakiye(fatura.cari_id);
    }

    // --- PDF Tasarım (ekran bozmadan, sadece PDF) ---
    doc.setTextColor(59, 130, 246);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(26);
    doc.text("PEXURA TECH", 14, 20);

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(14);
    doc.text(trFix(normalizeTip(fatura.tip) === 'satis' ? 'SATIS FATURASI' : 'IADE FATURASI'), 14, 30);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Tarih: ${formatDateTR(fatura.tarih)}`, 14, 40);
    doc.text(`Fatura No: ${fatura.numara || '-'}`, 14, 45);
    doc.text(`Cari: ${trFix(cariAd)}`, 14, 50);

    // Tablo (ekstra ürün = fatura kalemleri)
    const tableData = (kalemler || []).map(k => [
      trFix(k.urun_ad_snapshot || 'Silinmis Urun'),
      String(k.miktar || 0),
      fmt(k.birim_fiyat, fatura.para_birimi),
      fmt(k.satir_tutar, fatura.para_birimi)
    ]);

    const startY = 60;

    doc.autoTable({
      startY,
      head: [['Ürün', 'Miktar', 'Birim Fiyat', 'Tutar']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold' },
      styles: { fontSize: 10, cellPadding: 3 },
      columnStyles: {
        0: { cellWidth: 80 },
        1: { cellWidth: 20 },
        2: { cellWidth: 40 },
        3: { cellWidth: 40 }
      },
      foot: [['', '', 'GENEL TOPLAM', fmt(fatura.genel_toplam, fatura.para_birimi)]],
      footStyles: { fillColor: [16, 185, 129], textColor: 255, fontStyle: 'bold' }
    });

    // Güncel borç (GENEL TOPLAM altı)
    const yAfter = doc.lastAutoTable?.finalY || (startY + 20);
    const etiket = guncelBorc > 0 ? "Güncel Borç" : (guncelBorc < 0 ? "Güncel Alacak" : "Güncel Bakiye");
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.text(`${etiket}: ${fmt(guncelBorc, fatura.para_birimi)}`, 14, yAfter + 10);

    const fileName = `Pexura_Fatura_${fatura.numara || fatura.id}.pdf`;

    if (mode === 'download') {
      doc.save(fileName);
      addPdfHistory(fatura);
    } else if (mode === 'whatsapp') {
      doc.save(fileName);
      addPdfHistory(fatura);
      if (cariTel) {
        const cleanPhone = cleanPhoneTR(cariTel);
        window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent("Sayın " + cariAd + ", faturanız ektedir.")}`, '_blank');
      } else {
        showToast("Müşteri telefonu yok.", "warning");
      }
    }
  } catch (err) {
    console.error(err);
    showToast("PDF Hatası: " + (err?.message || err), "error");
  }
}

/* =========================================================
   TIP NORMALIZE
========================================================= */
function normalizeTip(tip){
  if(tip === "alis") return "iade";
  return tip;
}

/* =========================================================
   CARİLER
========================================================= */
async function fetchCariler(){ 
  const { data } = await supa.from("cariler").select("*").order("ad"); 
  CARILER = data||[]; 
}

function resetCariForm() {
  EDIT_CARI_ID = null;
  cariAd.value = ""; cariTel.value = ""; cariMail.value = ""; cariAdres.value = ""; cariABorc.value = ""; cariAAlacak.value = "";
  const btn = document.getElementById('cariEkleBtn');
  btn.textContent = "Kaydet";
  btn.classList.remove('warning');
}

document.getElementById('cariEkleBtn').onclick = async ()=>{
  if(!cariAd.value) return showToast("Ad zorunlu", "warning");
  if(cariMail.value && !isEmail(cariMail.value)) return showToast("Mail formatı hatalı","warning");

  const payload = {
    user_id: USER.id,
    tur: cariTur.value,
    ad: cariAd.value,
    tel: cariTel.value,
    mail: cariMail.value,
    adres: cariAdres.value,
    acilis_borc: toNum(cariABorc.value),
    acilis_alacak: toNum(cariAAlacak.value)
  };
  let error;
  if(EDIT_CARI_ID) {
    const oldRec = CARILER.find(c => c.id == EDIT_CARI_ID);
    await logAction('cariler', 'UPDATE', EDIT_CARI_ID, oldRec);
    const res = await supa.from("cariler").update(payload).eq('id', EDIT_CARI_ID);
    error = res.error;
    if(!error) showToast("Müşteri güncellendi", "success");
  } else {
    payload.aktif = true;
    const res = await supa.from("cariler").insert(payload).select().single();
    error = res.error;
    if(res.data) await logAction('cariler', 'INSERT', res.data.id);
    if(!error) showToast("Müşteri eklendi", "success");
  }
  if(error) return showToast(error.message, "error");

  resetCariForm();
  await fetchCariler();
  fillSelects();
  renderCariler();
};


function getCariBakiyeMap(c){
  // Pozitif = müşteri borçlu, negatif = alacaklı (biz borçluyuz)
  const map = {};
  // Açılış bakiyesi varsayılan TL kabul edilir
  const acilis = (toNum(c.acilis_borc) || 0) - (toNum(c.acilis_alacak) || 0);
  if(acilis) map["TL"] = (map["TL"] || 0) + acilis;

  FATURALAR.filter(f => f.cari_id === c.id).forEach(f=>{
    const cur = f.para_birimi || "TL";
    const kalan = (toNum(f.genel_toplam) || 0) - (toNum(f.odenen_tutar) || 0);
    if(!kalan) return;
    if(f.tip === "satis") map[cur] = (map[cur] || 0) + kalan;
    else if(f.tip === "iade") map[cur] = (map[cur] || 0) - kalan;
  });

  return map;
}

function bakiyeHtmlForCari(c){
  const map = getCariBakiyeMap(c);
  const entries = Object.entries(map).filter(([,v]) => Math.abs(v) > 0.000001);

  if(entries.length === 0) return `<span class="muted">0</span>`;

  // Aynı satırda küçük etiketler
  return entries.map(([cur,val])=>{
    const cls = val > 0 ? "danger" : "success"; // borç kırmızı, alacak yeşil
    const txt = `${Math.abs(val).toLocaleString("tr-TR")} ${cur}`;
    const sign = val > 0 ? "Borç" : "Alacak";
    return `<span class="tag ${cls}" title="${sign}">${txt}</span>`;
  }).join(" ");
}

function renderCariler(){
  cariListe.innerHTML="";
  const showPasif = !!document.getElementById('showPasifCariler')?.checked;
  const list = (CARILER||[])
    .filter(c => showPasif ? true : (c.aktif !== false))
    .slice()
    .sort((a,b)=> (a.aktif===false) - (b.aktif===false));

  list.forEach(c=>{
    const pasif = (c.aktif === false);
    const tr=document.createElement("tr");
    tr.innerHTML=`
      <td onclick="openCariPanel('${c.id}')" style="cursor:pointer;${pasif?'opacity:0.55;':''}">
        <span style="font-weight:bold; font-size:16px; color:#60a5fa;">${c.ad}</span><br>
        <small class="muted">${c.tel||'-'}</small>
      </td>
      <td>${bakiyeHtmlForCari(c)}</td>
      <td><span class="tag">${c.tur}</span>${pasif?` <span class="tag danger">pasif</span>`:''}</td>
      <td>
        <div class="btn-group">
          <button class="info" onclick="openEkstre('${c.id}')">Ekstre</button>
          <button class="warning" onclick="editCari('${c.id}')">Düzenle</button>
          <button class="danger" data-toggle="${c.id}" data-active="${pasif?0:1}">${pasif?'Aktifleştir':'Pasife Al'}</button>
        </div>
      </td>`;
    cariListe.appendChild(tr);
  });
  cariListe.querySelectorAll("[data-toggle]").forEach(btn=>{
    btn.onclick=async ()=>{
      const id = btn.dataset.toggle;
      const isActive = btn.dataset.active === '1';
      const next = !isActive; // true => aktifleştir, false => pasife al
      const msg = next ? "Cari aktifleştirilsin mi?" : "Cari pasife alınsın mı?";
      if(!confirm(msg)) return;
      const oldRec = CARILER.find(c => c.id == id);
      await logAction('cariler', next ? 'ACTIVATE' : 'DEACTIVATE', id, oldRec);
      const { error } = await supa.from("cariler").update({ aktif: next }).eq("id", id);
      if(error) return showToast(error.message, "error");
      await fetchCariler(); renderCariler(); fillSelects();
      showToast(next ? "Aktifleştirildi" : "Pasife alındı", "success");
    };
  });
}
window.editCari = (id) => {
  const c = CARILER.find(x => x.id == id);
  if(c) {
    cariTur.value=c.tur; cariAd.value=c.ad; cariTel.value=c.tel; cariMail.value=c.mail; cariAdres.value=c.adres; cariABorc.value=c.acilis_borc; cariAAlacak.value=c.acilis_alacak;
    EDIT_CARI_ID = c.id;
    document.getElementById('cariEkleBtn').textContent="Güncelle";
    document.getElementById('cariEkleBtn').classList.add('warning');
    document.querySelector('button[data-tab="cariler"]').click();
    window.scrollTo(0,0);
  }
};

/* =========================================================
   ÜRÜNLER
========================================================= */
async function fetchUrunler(){ 
  const { data } = await supa.from("urunler").select("*").order("ad"); 
  URUNLER=data||[]; 
}

function resetUrunForm() {
  EDIT_URUN_ID = null;
  uKod.value=""; uAd.value=""; uBirim.value=""; uMin.value=""; uAlis.value=""; uSatis.value=""; uKdv.value="0"; uStokManuel.value="";
  document.getElementById('uResimInput').value = "";
  CURRENT_IMG_URL = null; IS_IMG_REMOVED = false;
  document.getElementById('uResimPreviewArea').classList.add('hide');
  document.getElementById('uResimPreview').src = "";
  const btn = document.getElementById('uKaydetBtn'); btn.textContent = "Kaydet"; btn.classList.remove('warning');
}
window.removeCurrentImage = () => { IS_IMG_REMOVED = true; document.getElementById('uResimPreviewArea').classList.add('hide'); };

document.getElementById('uKaydetBtn').onclick = async ()=>{
  if(!uAd.value) return showToast("Ad zorunlu", "warning");
  if(toNum(uSatis.value)<0 || toNum(uAlis.value)<0) return showToast("Fiyat negatif olamaz","warning");

  let uploadedImageUrl = null;
  const fileInput = document.getElementById('uResimInput');
  const file = fileInput.files[0];
  if(file) {
    const fileName = `urun_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '')}`;
    const { error } = await supa.storage.from('urun-resimleri').upload(fileName, file);
    if(error) return showToast(error.message, "error");
    const { data: publicData } = supa.storage.from('urun-resimleri').getPublicUrl(fileName);
    uploadedImageUrl = publicData.publicUrl;
  }

  const payload={
    user_id: USER.id,
    kod: uKod.value,
    ad: uAd.value,
    birim: uBirim.value,
    min_stok: toNum(uMin.value),
    alis_fiyat: toNum(uAlis.value),
    satis_fiyat: toNum(uSatis.value),
    para_birimi: uPara.value,
    kdv_oran: toNum(uKdv.value),
    stok_miktar: toNum(uStokManuel.value)
  };

  if(uploadedImageUrl) payload.resim_url = uploadedImageUrl;
  else if (IS_IMG_REMOVED) payload.resim_url = null;

  let error;
  if(EDIT_URUN_ID) {
    const oldRec = URUNLER.find(u => u.id == EDIT_URUN_ID);
    await logAction('urunler', 'UPDATE', EDIT_URUN_ID, oldRec);
    const res = await supa.from("urunler").update(payload).eq('id', EDIT_URUN_ID);
    error = res.error;
    if(!error) showToast("Ürün güncellendi", "success");
  } else {
    const res = await supa.from("urunler").insert(payload).select().single();
    error = res.error;
    if(res.data) await logAction('urunler', 'INSERT', res.data.id);
    if(!error) showToast("Ürün eklendi", "success");
  }

  if(error) return showToast(error.message, "error");
  resetUrunForm(); await fetchUrunler(); fillSelects(); renderUrunler();
};

function renderUrunler(){
  uListe.innerHTML="";
  URUNLER.forEach(u=>{
    const krit = Number(u.stok_miktar||0) <= Number(u.min_stok||0);
    const delBtn = USER_ROLE==='admin' ? `<button class="danger" data-del="${u.id}">Sil</button>` : '';
    const editBtn = USER_ROLE==='admin' ? `<button class="warning" data-edit="${u.id}">Düzenle</button>` : '';
    const imgHtml = u.resim_url
      ? `<img src="${u.resim_url}" class="urun-img" onclick="openImageModal('${u.resim_url}')">`
      : `<div style="width:250px;height:250px;background:#334155;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:14px;color:#94a3b8;border:3px dashed #475569;text-align:center;">Resim<br>Yok</div>`;
    const tr=document.createElement("tr");
    tr.innerHTML=`
      <td style="padding: 20px;">${imgHtml}</td>
      <td style="font-size:16px;">${u.kod||""}</td>
      <td style="font-weight:bold;font-size:18px;">${u.ad} ${krit?'<br><span class="tag" style="background:red;color:white;margin-top:5px">KRİTİK</span>':""}</td>
      <td style="font-size:16px;">${u.stok_miktar} ${u.birim||""}</td>
      <td style="font-size:18px;color:#4ade80;font-weight:bold;">${fmt(u.satis_fiyat, u.para_birimi)}</td>
      <td><div style="display:flex;gap:10px;align-items:center;height:250px;">${editBtn}${delBtn}</div></td>`;
    uListe.appendChild(tr);
  });

  if(USER_ROLE==='admin'){
    uListe.querySelectorAll("[data-del]").forEach(btn=>{
      btn.onclick=async ()=>{
        if(confirm("Sil?")){
          const id = btn.dataset.del;
          const oldRec = URUNLER.find(u => u.id == id);
          await logAction('urunler', 'DELETE', id, oldRec);
          await supa.from("urunler").delete().eq("id", id);
          await fetchUrunler(); renderUrunler();
          showToast("Ürün silindi", "success");
        }
      };
    });

    uListe.querySelectorAll("[data-edit]").forEach(btn=>{
      btn.onclick=()=>{
        const u = URUNLER.find(x=>x.id==btn.dataset.edit);
        uKod.value=u.kod||""; uAd.value=u.ad; uBirim.value=u.birim||"";
        uPara.value=u.para_birimi; uAlis.value=u.alis_fiyat; uSatis.value=u.satis_fiyat;
        uMin.value=u.min_stok; uStokManuel.value=u.stok_miktar; uKdv.value=u.kdv_oran;
        EDIT_URUN_ID = u.id;

        IS_IMG_REMOVED = false; CURRENT_IMG_URL = u.resim_url;
        if(u.resim_url) {
          document.getElementById('uResimPreviewArea').classList.remove('hide');
          document.getElementById('uResimPreview').src = u.resim_url;
        } else {
          document.getElementById('uResimPreviewArea').classList.add('hide');
        }

        const b = document.getElementById('uKaydetBtn');
        b.textContent="Güncelle"; b.classList.add('warning');
        window.scrollTo(0,0);
        showToast("Ürün bilgileri yüklendi", "info");
      }
    });
  }
}

/* =========================================================
   FATURALAR (madde 2,6,10,11)
========================================================= */
async function fetchFaturalar(){
  const { data }=await supa.from("faturalar").select("*, cariler(ad,tel)").order("tarih",{ascending:false});
  FATURALAR=data||[];
}

// Otomatik fatura numarası (madde 6)
async function getAutoFaturaNo(){
  try{
    const { data, error } = await supa.rpc("next_fatura_numara");
    if(!error && data) return data;
  }catch(e){
    console.warn("RPC next_fatura_numara yok, local fallback", e);
  }
  // fallback local (aynı yıl içinde)
  const yil = new Date().getFullYear();
  const key = `fno_${yil}`;
  const last = Number(localStorage.getItem(key)||"0")+1;
  localStorage.setItem(key, String(last));
  return `${yil}-${String(last).padStart(6,'0')}`;
}

document.getElementById('kalemEkleBtn').onclick=()=>{
  const urun=URUNLER.find(u=>u.id===kUrun.value);
  if(!urun) return showToast("Ürün seç", "warning");

  const miktar=toNum(kMiktar.value);
  const fiyat=toNum(kFiyat.value);
  if(miktar<=0 || fiyat<0) return showToast("Miktar>0 ve fiyat>=0 olmalı","warning");

  // stok yetersiz kontrol
  if(normalizeTip(fTip.value)==='satis' && miktar>toNum(urun.stok_miktar)){
    return showToast(`Stok yetersiz! Mevcut: ${urun.stok_miktar}`, "error");
  }

  FATURA_SATIRLAR.push({
    urun_id: urun.id,
    urun_ad: urun.ad,
    urun_kod: urun.kod||"",
    miktar,
    birim_fiyat: fiyat,
    kdv_oran: toNum(kKdv.value),
    satir_tutar: miktar * fiyat,
    para_birimi: urun.para_birimi,
    alis_snapshot: urun.alis_fiyat,
    satis_snapshot: urun.satis_fiyat
  });
  renderKalemler(); calcFaturaTotals();
};

function renderKalemler(){
  kalemListe.innerHTML="";
  FATURA_SATIRLAR.forEach((s,i)=>{
    const kar = calcLineProfit(s.alis_snapshot, s.birim_fiyat, s.miktar);
    const tr=document.createElement("tr");
    tr.innerHTML=`
      <td>${s.urun_ad}</td>
      <td>${s.miktar}</td>
      <td>${fmt(s.alis_snapshot, fPara.value)}</td>
      <td>${fmt(s.birim_fiyat, fPara.value)}</td>
      <td>${fmt(s.satir_tutar, fPara.value)}</td>
      <td><span style="color:${kar>=0?'#4ade80':'#fca5a5'}; font-weight:700;">${fmt(kar, fPara.value)}</span></td>
      <td><button class="danger" data-i="${i}">X</button></td>`;
    kalemListe.appendChild(tr);
  });

  kalemListe.querySelectorAll("[data-i]").forEach(btn=>{
    btn.onclick=()=>{
      FATURA_SATIRLAR.splice(Number(btn.dataset.i),1);
      renderKalemler(); calcFaturaTotals();
    };
  });
}

function calcFaturaTotals(){
  let top=0;
  let karTop=0;
  FATURA_SATIRLAR.forEach(s=> {
    top += toNum(s.satir_tutar);
    karTop += (toNum(s.birim_fiyat) - toNum(s.alis_snapshot)) * toNum(s.miktar);
  });
  fGenel.textContent = fmt(top, fPara.value);

  // Düzeni bozmadan: Toplam'ın altına tek satır kâr bilgisi
  try{
    let karEl = document.getElementById('fKarLine');
    if(!karEl){
      const h3 = fGenel?.closest('h3');
      if(h3){
        h3.insertAdjacentHTML(
          'afterend',
          `<div id="fKarLine" style="text-align:right; margin-top:-8px; margin-bottom:10px; font-size:13px; color:#4ade80;">
            Toplam Kâr: <span id="fKarVal"></span>
          </div>`
        );
        karEl = document.getElementById('fKarVal');
      }
    }else{
      karEl = document.getElementById('fKarVal') || karEl;
    }
    if(karEl) karEl.textContent = fmt(karTop, fPara.value);
  }catch(e){}

  return top;
}

function resetFaturaForm() {
  EDIT_FATURA_ID = null;
  FATURA_SATIRLAR = [];
  fNo.value = "";
  fCari.value = "";
  fTarih.value = nowLocalDT();
  fGenel.textContent = "0";
  document.getElementById('fKaydetBtn').textContent = "FATURAYI ONAYLA";
  document.getElementById('fKaydetBtn').classList.remove('warning');
  renderKalemler();
}

window.editFatura = async (id) => {
  const fatura = FATURALAR.find(f => f.id == id);
  if (!fatura) return showToast("Fatura bulunamadı!", "error");

  const { data: kalemler, error } =
    await supa.from('fatura_kalemler')
      .select('*, urunler(ad,kod,alis_fiyat,satis_fiyat,para_birimi)')
      .eq('fatura_id', id);

  if(error) return showToast("Kalemler çekilemedi!", "error");

  fTip.value = normalizeTip(fatura.tip);
  fPara.value = fatura.para_birimi;
  fNo.value = fatura.numara || "";
  fTarih.value = (fatura.tarih||"").length>10 ? (fatura.tarih||"").slice(0,16) : nowLocalDT();
  fCari.value = fatura.cari_id;

  FATURA_SATIRLAR = kalemler.map(k => ({
    urun_id: k.urun_id,
    urun_ad: k.urun_ad_snapshot || k.urunler?.ad || "Bilinmeyen Ürün",
    urun_kod: k.urun_kod_snapshot || k.urunler?.kod || "",
    miktar: k.miktar,
    birim_fiyat: k.birim_fiyat,
    kdv_oran: k.kdv_oran,
    satir_tutar: k.satir_tutar,
    para_birimi: k.para_birimi_snapshot || k.urunler?.para_birimi,
    alis_snapshot: k.alis_fiyat_snapshot || k.urunler?.alis_fiyat,
    satis_snapshot: k.satis_fiyat_snapshot || k.urunler?.satis_fiyat
  }));

  renderKalemler(); calcFaturaTotals();

  EDIT_FATURA_ID = fatura.id;
  const btn = document.getElementById('fKaydetBtn');
  btn.textContent = "FATURAYI GÜNCELLE";
  btn.classList.add('warning');

  document.querySelector(`button[data-tab="faturalar"]`).click();
  window.scrollTo(0, 0);
  showToast("Düzenleme modu aktif.", "info");
};

document.getElementById('fKaydetBtn').onclick=async ()=>{
  if(FATURA_SATIRLAR.length===0) return showToast("Kalem yok", "warning");
  if(!fCari.value) return showToast("Cari seçmelisin.","warning");

  const total = calcFaturaTotals();
  const tipYeni = normalizeTip(fTip.value);

  // numara otomatik (madde 6)
  if(!fNo.value) fNo.value = await getAutoFaturaNo();

  if (EDIT_FATURA_ID) {
    const { data: eskiKalemler } = await supa.from('fatura_kalemler').select('*').eq('fatura_id', EDIT_FATURA_ID);
    const eskiFatura = FATURALAR.find(f => f.id == EDIT_FATURA_ID);
    const tipEski = normalizeTip(eskiFatura?.tip||"satis");

    for(const k of (eskiKalemler||[])) {
      const geriAl = (tipEski==="satis") ? +k.miktar : -k.miktar;
      await applyStockChange(k.urun_id, geriAl, {tur:"duzeltme", kaynak:"fatura", kaynak_id:EDIT_FATURA_ID, aciklama:"Fatura düzenleme geri alım"});
    }

    await supa.from('fatura_kalemler').delete().eq('fatura_id', EDIT_FATURA_ID);

    await supa.from('faturalar')
      .update({
        tip: tipYeni,
        cari_id: fCari.value,
        tarih: fTarih.value,
        numara: fNo.value,
        genel_toplam: total,
        para_birimi: fPara.value
      })
      .eq('id', EDIT_FATURA_ID);

    const kalemler = FATURA_SATIRLAR.map(s=>({
      fatura_id: EDIT_FATURA_ID,
      urun_id: s.urun_id,
      miktar: s.miktar,
      birim_fiyat: s.birim_fiyat,
      kdv_oran: s.kdv_oran,
      satir_tutar: s.satir_tutar,
      // snapshots (madde 2)
      urun_kod_snapshot: s.urun_kod,
      urun_ad_snapshot: s.urun_ad,
      alis_fiyat_snapshot: s.alis_snapshot,
      satis_fiyat_snapshot: s.satis_snapshot,
      para_birimi_snapshot: s.para_birimi
    }));
    await supa.from("fatura_kalemler").insert(kalemler);

    for(const s of FATURA_SATIRLAR){
      const degisim = (tipYeni==="satis") ? -s.miktar : +s.miktar;
      await applyStockChange(s.urun_id, degisim, {tur:tipYeni, kaynak:"fatura", kaynak_id:EDIT_FATURA_ID});
    }

    showToast("Fatura güncellendi.", "success");
    pushRecentCariId(fCari.value);
    renderRecentCariler();
    resetFaturaForm();
  } else {
    const { data: inserted, error } = await supa.from("faturalar").insert({
      user_id: USER.id,
      tip: tipYeni,
      cari_id: fCari.value,
      tarih: fTarih.value,
      numara: fNo.value,
      genel_toplam: total,
      para_birimi: fPara.value
    }).select().single();

    if(error) return showToast(error.message, "error");
    await logAction('faturalar', 'INSERT', inserted.id);

    // Son kullanılan cariler
    pushRecentCariId(fCari.value);
    renderRecentCariler();

    const kalemler = FATURA_SATIRLAR.map(s=>({
      fatura_id: inserted.id,
      urun_id: s.urun_id,
      miktar: s.miktar,
      birim_fiyat: s.birim_fiyat,
      kdv_oran: s.kdv_oran,
      satir_tutar: s.satir_tutar,
      // snapshots (madde 2)
      urun_kod_snapshot: s.urun_kod,
      urun_ad_snapshot: s.urun_ad,
      alis_fiyat_snapshot: s.alis_snapshot,
      satis_fiyat_snapshot: s.satis_snapshot,
      para_birimi_snapshot: s.para_birimi
    }));
    await supa.from("fatura_kalemler").insert(kalemler);

    for(const s of FATURA_SATIRLAR){
      const degisim = (tipYeni==="satis") ? -s.miktar : +s.miktar;
      await applyStockChange(s.urun_id, degisim, {tur:tipYeni, kaynak:"fatura", kaynak_id:inserted.id});
    }

    const selectedCari = CARILER.find(c => c.id === fCari.value);
    if(fWhatsappCheck.checked && selectedCari && selectedCari.tel){
      if(confirm("WhatsApp ile PDF göndermek istiyor musunuz?")) {
        inserted.cariler = { ad: selectedCari.ad, tel: selectedCari.tel };
        await generateAndSharePDF(inserted, 'whatsapp');
      } else {
        showToast("Fatura kaydedildi.", "success");
      }
    } else {
      showToast("Fatura kaydedildi.", "success");
    }

    resetFaturaForm();
  }
  await fetchAll(); renderAll();
};

// filtreli render (madde 10)
function getFaturaFilters(){
  const fCariF = document.getElementById("fFilterCari");
  const fTipF  = document.getElementById("fFilterTip");
  const fS     = document.getElementById("fFilterStart");
  const fE     = document.getElementById("fFilterEnd");
  const fQ     = document.getElementById("fFilterSearch");

  return {
    cari: fCariF?.value || "",
    tip: fTipF?.value || "",
    start: fS?.value || "",
    end: fE?.value || "",
    q: (fQ?.value||"").toLocaleLowerCase("tr")
  };
}

function renderFaturalar(){
  faturaListe.innerHTML="";

  const filters = getFaturaFilters();
  let list = FATURALAR.slice();

  if(filters.cari) list = list.filter(f=>f.cari_id==filters.cari);
  if(filters.tip)  list = list.filter(f=>normalizeTip(f.tip)==filters.tip);
  if(filters.start) list = list.filter(f=>new Date(f.tarih)>=new Date(filters.start));
  if(filters.end)   list = list.filter(f=>new Date(f.tarih)<=new Date(filters.end));
  if(filters.q){
    list = list.filter(f=>{
      const cariAd = f.cariler?.ad || "";
      return (cariAd.toLocaleLowerCase("tr").includes(filters.q) ||
              String(f.numara||"").toLocaleLowerCase("tr").includes(filters.q));
    });
  }

  list.forEach(f=>{
    const tr=document.createElement("tr");
    const cariAd = f.cariler ? f.cariler.ad : 'Silinmiş Cari';
    const tipText = normalizeTip(f.tip)==='satis' ? 'Satış' : 'İade';

    tr.innerHTML=`
      <td>${formatTRDateTime(f.tarih)}</td>
      <td>${cariAd}</td>
      <td><span class="tag">${tipText}</span></td>
      <td>${fmt(f.genel_toplam, f.para_birimi)}</td>
      <td>
        <div class="btn-group">
          <button class="primary" data-detay="${f.id}">Detay</button>
          <button class="info" data-pdf="${f.id}">PDF</button>
          <button class="warning" onclick="editFatura('${f.id}')">Düzenle</button>
          <button class="danger" data-del="${f.id}">Sil</button>
        </div>
      </td>`;
    faturaListe.appendChild(tr);

    const dtr=document.createElement("tr");
    dtr.className="detail-row hide";
    dtr.innerHTML=`<td colspan="5"><div id="detay-${f.id}">Yükleniyor...</div></td>`;
    faturaListe.appendChild(dtr);
  });

  faturaListe.querySelectorAll("[data-detay]").forEach(btn=>{
    btn.onclick = async ()=>{
      const id = btn.dataset.detay;
      const dRow = document.querySelector(`#detay-${id}`).parentElement.parentElement;
      dRow.classList.toggle("hide");

      const wrap=document.getElementById(`detay-${id}`);
      wrap.innerHTML="Yükleniyor...";

      const { data: kalemler } = await supa
        .from("fatura_kalemler")
        .select("*")
        .eq("fatura_id", id);

      if(!kalemler?.length){
        wrap.innerHTML="<i>Kalem yok</i>"; return;
      }

      wrap.innerHTML=`
        <table class="mini-table">
          <thead><tr><th>Ürün</th><th>Miktar</th><th>Fiyat</th><th>KDV%</th><th>Tutar</th></tr></thead>
          <tbody>
            ${kalemler.map(k=>`
              <tr>
                <td>${k.urun_ad_snapshot || k.urun_id}</td>
                <td>${k.miktar}</td>
                <td>${fmt(k.birim_fiyat, fPara.value)}</td>
                <td>${k.kdv_oran}</td>
                <td>${fmt(k.satir_tutar, fPara.value)}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      `;
    };
  });

  faturaListe.querySelectorAll("[data-pdf]").forEach(btn=>{
    btn.onclick = async () => {
      const f = FATURALAR.find(x=>x.id==btn.dataset.pdf);
      await generateAndSharePDF(f, 'download');
    };
  });

  faturaListe.querySelectorAll("[data-del]").forEach(btn=>{
    btn.onclick = async () => {
      if(!confirm("Fatura silinsin mi?")) return;
      const id = btn.dataset.del;
      await deleteHistoryItem('fatura', id);
      await fetchAll();
    };
  });
}

// filtre inputları varsa bağla
["fFilterCari","fFilterTip","fFilterStart","fFilterEnd","fFilterSearch"].forEach(id=>{
  const el=document.getElementById(id);
  if(el) el.oninput = renderFaturalar;
});

/* =========================================================
   KASA & HAREKETLER
========================================================= */
async function fetchHesaplar(){ const { data } = await supa.from("kasa_hesaplar").select("*"); HESAPLAR=data||[]; }
async function fetchHareketler(){ const { data }=await supa.from("kasa_hareketler").select("*").order("tarih",{ascending:false}); HAREKETLER=data||[]; }

function resetKasaForm() {
  EDIT_HAREKET_ID = null;
  kTutar.value = ""; kAciklama.value = ""; kTarih.value = todayStr();
  const btn = document.getElementById('kEkleBtn');
  btn.textContent = "İşlemi Kaydet";
  btn.classList.remove('warning');
  btn.classList.add('success');
}

document.getElementById('hEkleBtn').onclick = async ()=>{
  if(!hAd.value) return showToast("Hesap adı zorunlu","warning");
  await supa.from("kasa_hesaplar").insert({
    user_id: USER.id,
    ad: hAd.value,
    tur: hTur.value,
    acilis_bakiye: toNum(hAc.value),
    para_birimi: hPara.value
  });
  await fetchHesaplar(); renderHesaplar();
};

document.getElementById('kEkleBtn').onclick = async ()=>{
  if(!isPosNum(kTutar.value)) return showToast("Tutar > 0 olmalı","warning");

  const payload = {
    user_id: USER.id,
    hesap_id: kHesap.value,
    tarih: kTarih.value,
    tur: kTur.value,
    cari_id: kCari.value||null,
    tutar: toNum(kTutar.value),
    aciklama: kAciklama.value
  };
  let error;
  if(EDIT_HAREKET_ID){
    const res = await supa.from("kasa_hareketler").update(payload).eq('id', EDIT_HAREKET_ID);
    error = res.error;
  } else {
    const res = await supa.from("kasa_hareketler").insert(payload);
    error = res.error;
  }
  if(error) return showToast(error.message, "error");
  resetKasaForm(); await fetchHareketler();
  renderHareketler(); renderDash();
  showToast("İşlem kaydedildi.", "success");
};

function renderHesaplar(){
  hesapListe.innerHTML="";
  HESAPLAR.forEach(h=>{
    hesapListe.innerHTML+=`<tr><td>${h.ad}</td><td>${h.tur}</td><td>${h.para_birimi}</td></tr>`;
  });
}

function renderHareketler(){
  hareketListe.innerHTML="";
  HAREKETLER.forEach(h=>{
    const tr = document.createElement("tr");
    tr.innerHTML=`
      <td>${formatTRDateTime(h.tarih)}</td>
      <td><span class="tag">${h.tur}</span></td>
      <td>${fmt(h.tutar, HESAPLAR.find(x=>x.id==h.hesap_id)?.para_birimi||'USD')}</td>
      <td>${h.aciklama || ''}</td>
      <td>
        <button class="warning" style="padding:4px 8px; font-size:11px;" data-edit="${h.id}">Düzenle</button>
        <button class="danger" style="padding:4px 8px; font-size:11px;" data-del="${h.id}">Sil</button>
      </td>`;
    hareketListe.appendChild(tr);
  });

  hareketListe.querySelectorAll("[data-del]").forEach(btn => {
    btn.onclick = async () => {
      if(!confirm("Bu hareketi silmek istiyor musun?")) return;
      await supa.from("kasa_hareketler").delete().eq("id", btn.dataset.del);
      await fetchHareketler(); renderHareketler(); renderDash();
      showToast("Silindi.", "success");
    };
  });

  hareketListe.querySelectorAll("[data-edit]").forEach(btn => {
    btn.onclick = () => {
      const h = HAREKETLER.find(x => x.id == btn.dataset.edit);
      if(!h) return;
      kHesap.value = h.hesap_id; kTur.value = h.tur; kTutar.value = h.tutar;
      kTarih.value = h.tarih; kAciklama.value = h.aciklama;
      if(h.cari_id) kCari.value = h.cari_id;
      EDIT_HAREKET_ID = h.id;
      const saveBtn = document.getElementById('kEkleBtn');
      saveBtn.textContent = "Hareketi Güncelle";
      saveBtn.classList.remove('success');
      saveBtn.classList.add('warning');
      window.scrollTo(0,0);
    };
  });
}

/* =========================================================
   GELİR GİDER
========================================================= */
async function fetchGG(){ const { data }=await supa.from("gelir_gider").select("*").order("tarih",{ascending:false}); GG=data||[]; }

function resetGGForm() { EDIT_GG_ID = null; ggKat.value=""; ggTutar.value=""; ggAc.value=""; const btn=document.getElementById('ggEkleBtn'); btn.textContent = "Ekle"; btn.classList.remove('warning'); }

document.getElementById('ggEkleBtn').onclick = async ()=>{
  if(!ggKat.value) return showToast("Kategori zorunlu","warning");
  if(!isPosNum(ggTutar.value)) return showToast("Tutar > 0 olmalı","warning");

  const payload = {user_id: USER.id, tarih: ggTarih.value, tur: ggTur.value, kategori: ggKat.value, tutar: toNum(ggTutar.value), aciklama: ggAc.value};
  let error;
  if(EDIT_GG_ID){
    const res = await supa.from("gelir_gider").update(payload).eq('id', EDIT_GG_ID);
    error = res.error;
  } else {
    const res = await supa.from("gelir_gider").insert(payload);
    error = res.error;
  }
  if(error) return showToast(error.message, "error");
  resetGGForm(); await fetchGG(); renderGG(); renderDash();
  showToast("Kaydedildi.", "success");
};

function renderGG(){
  ggListe.innerHTML="";
  GG.forEach(g=>{
    const tr = document.createElement("tr");
    tr.innerHTML=`
      <td>${formatTRDateTime(g.tarih)}</td><td>${g.tur}</td><td>${fmt(g.tutar)}</td>
      <td>${g.aciklama||''}</td>
      <td>
        <div class="btn-group">
          <button class="warning" style="padding:4px;font-size:10px" data-edit="${g.id}">Düzenle</button>
          <button class="danger" style="padding:4px;font-size:10px" data-del="${g.id}">Sil</button>
        </div>
      </td>`;
    ggListe.appendChild(tr);
  });

  ggListe.querySelectorAll("[data-del]").forEach(b=>{
    b.onclick=async()=>{
      if(confirm("Sil?")) {
        await supa.from("gelir_gider").delete().eq('id', b.dataset.del);
        await fetchGG(); renderGG(); renderDash(); showToast("Silindi.", "success");
      }
    }
  });

  ggListe.querySelectorAll("[data-edit]").forEach(b=>{
    b.onclick=()=>{
      const g = GG.find(x=>x.id==b.dataset.edit);
      ggTur.value=g.tur; ggKat.value=g.kategori; ggTutar.value=g.tutar; ggAc.value=g.aciklama; ggTarih.value=g.tarih;
      EDIT_GG_ID = g.id;
      const btn = document.getElementById('ggEkleBtn');
      btn.textContent = "Güncelle"; btn.classList.add('warning');
      window.scrollTo(0,0);
    }
  });
}

/* =========================================================
   SELECTS & RENDER ALL
========================================================= */
function initFaturaCariQuickSearch(){
  const inp = document.getElementById('fCariSearch');
  const wrap = document.getElementById('recentCariWrap');
  if(inp && !inp._bound){
    inp._bound = true;
    inp.addEventListener('input', ()=>{
      renderFaturaCariOptions(inp.value);
    });
  }
  if(wrap){
    renderRecentCariler();
  }
}

function renderFaturaCariOptions(filterText=''){
  const sel = document.getElementById('fCari');
  if(!sel) return;
  const ft = (filterText||'').trim().toLowerCase();
  const active = getActiveCariler();
  const list = ft
    ? active.filter(c =>
        (c.ad||'').toLowerCase().includes(ft) ||
        (c.tel||'').toLowerCase().includes(ft)
      )
    : active;
  const current = sel.value;
  sel.innerHTML = `<option value="">Seç</option>` + list.map(c=>`<option value="${c.id}">${c.ad}${c.tel?` (${c.tel})`:''}</option>`).join('');
  if(current && list.some(c=>c.id===current)) sel.value = current;
}

function renderRecentCariler(){
  const wrap = document.getElementById('recentCariWrap');
  if(!wrap) return;
  const ids = getRecentCariIds();
  const active = getActiveCariler();
  const rec = ids.map(id => active.find(c=>c.id===id)).filter(Boolean);
  if(rec.length===0){
    wrap.innerHTML = `<span class="muted" style="font-size:12px;">Son kullanılan cariler burada görünecek.</span>`;
    return;
  }
  wrap.innerHTML = rec.map(c=>`<button type="button" data-cari="${c.id}">${c.ad}</button>`).join('');
  wrap.querySelectorAll('button[data-cari]').forEach(b=>{
    b.onclick = ()=>{
      const id = b.dataset.cari;
      const sel = document.getElementById('fCari');
      if(sel){ sel.value = id; }
      const inp = document.getElementById('fCariSearch');
      if(inp){ inp.value=''; renderFaturaCariOptions(''); }
    };
  });
}

function fillSelects(){
  const activeCariler = getActiveCariler();
  fCari.innerHTML = `<option value="">Seç</option>` + activeCariler.map(c=>`<option value="${c.id}">${c.ad}${c.tel?` (${c.tel})`:''}</option>`).join("");
  kUrun.innerHTML = `<option value="">Seç</option>` + URUNLER.map(u=>`<option value="${u.id}" data-price="${u.satis_fiyat}">${u.ad}</option>`).join("");
  kUrun.onchange=()=>{
    const opt=kUrun.selectedOptions[0];
    if(opt) kFiyat.value=opt.dataset.price;
  };

  kHesap.innerHTML = HESAPLAR.map(h=>`<option value="${h.id}">${h.ad} (${h.para_birimi})</option>`).join("");
  kCari.innerHTML = `<option value="">Cari Yok</option>` + activeCariler.map(c=>`<option value="${c.id}">${c.ad}</option>`).join("");

  // fatura filtre selectleri varsa doldur (madde 10)
  const fFilCari=document.getElementById("fFilterCari");
  if(fFilCari){
    fFilCari.innerHTML=`<option value="">Tümü</option>`+activeCariler.map(c=>`<option value="${c.id}">${c.ad}</option>`).join("");
  }

  // Fatura: hızlı cari arama + son kullanılanlar
  initFaturaCariQuickSearch();
}

function renderAll(){
  renderCariler();
  renderUrunler();
  renderHesaplar();
  renderHareketler();
  renderGG();
  renderFaturalar();
  renderDash();
  renderPdfHistory();
}

/* =========================================================
   NAV
========================================================= */
document.querySelectorAll(".navbtn").forEach(b => {
  b.onclick = () => {
    document.querySelectorAll(".navbtn").forEach(x => x.classList.remove("active"));
    b.classList.add("active");
    document.querySelectorAll(".tab").forEach(t => t.classList.add("hide"));
    const targetTab = document.getElementById("tab-" + b.dataset.tab);
    if(targetTab) targetTab.classList.remove("hide");
    if(b.dataset.tab === 'gecmis') renderHistory(); 
  };
});

// default dates
(() => {
  const _fT = document.getElementById('fTarih');
  const _kT = document.getElementById('kTarih');
  if(_fT) _fT.value = nowLocalDT();
  if(_kT) _kT.value = todayStr();
})();
document.getElementById('kKdv').value = "0";
document.getElementById('uKdv').value = "0";

/* =========================================================
   MÜŞTERİ PANELİ (SEPET + HAREKET)
========================================================= */
window.openCariPanel = async (id) => {
  ACTIVE_CARI_ID = id;
  const cari = CARILER.find(c => c.id == id);
  if(!cari) return;

  document.getElementById('modalCariPanel').classList.remove('hide');
  document.getElementById('cpBaslik').textContent = cari.ad;

  const urunSelect = document.getElementById('cpUrunSelect');
  urunSelect.innerHTML =
    `<option value="">Ürün Seçiniz...</option>` +
    URUNLER.map(u=>`<option value="${u.id}" data-fiyat="${u.satis_fiyat}" data-stok="${u.stok_miktar}" data-birim="${u.para_birimi}">${u.ad}</option>`).join("");

  const kasaSelect = document.getElementById('cpKasaSelect');
  kasaSelect.innerHTML = HESAPLAR.map(h=>`<option value="${h.id}">${h.ad} (${h.para_birimi})</option>`).join("");

  document.getElementById('cpUrunFiyat').value = "";
  document.getElementById('cpUrunAdet').value = "1";
  document.getElementById('cpSatirTutar').textContent = "0.00";
  document.getElementById('cpSepetToplam').textContent = "0.00";
  document.getElementById('cpFinansTutar').value = "";
  document.getElementById('cpFinansAciklama').value = "";
  setCpFinansTur('tahsilat');

  CP_SEPET = [];
  renderCpSepet();

  await cpVerileriGuncelle();
  await cpHareketleriGetir();
};

window.cpUrunSecildi = () => {
  const sel = document.getElementById('cpUrunSelect');
  const opt = sel.selectedOptions[0];
  if(opt && opt.value) {
    document.getElementById('cpUrunFiyat').value = opt.dataset.fiyat;
    document.getElementById('cpStokDurum').textContent = `Stok: ${opt.dataset.stok} | PB: ${opt.dataset.birim}`;
    cpSatirHesapla();
  }
};
document.getElementById('cpUrunAdet').oninput = cpSatirHesapla;
document.getElementById('cpUrunFiyat').oninput = cpSatirHesapla;

function cpSatirHesapla() {
  const adet = toNum(document.getElementById('cpUrunAdet').value);
  const fiyat = toNum(document.getElementById('cpUrunFiyat').value);
  document.getElementById('cpSatirTutar').textContent = fmt(adet * fiyat);
}

window.cpSepeteEkle = () => {
  const uId = document.getElementById("cpUrunSelect").value;
  const adet = toNum(document.getElementById("cpUrunAdet").value);
  const fiyat = toNum(document.getElementById("cpUrunFiyat").value);
  const urun = URUNLER.find(u=>u.id==uId);
  if(!urun || adet<=0) return showToast("Ürün ve adet seçmelisin","warning");

  // stok yetersiz kontrol (madde 11)
  if(adet > toNum(urun.stok_miktar)){
    return showToast(`Stok yetersiz! Mevcut: ${urun.stok_miktar}`, "error");
  }

  CP_SEPET.push({
    urun_id: urun.id,
    urun_ad: urun.ad,
    urun_kod: urun.kod||"",
    miktar: adet,
    birim_fiyat: fiyat,
    kdv_oran: urun.kdv_oran||0,
    satir_tutar: adet*fiyat,
    para_birimi: urun.para_birimi,
    alis_snapshot: urun.alis_fiyat,
    satis_snapshot: urun.satis_fiyat
  });

  renderCpSepet();
  document.getElementById("cpUrunSelect").value="";
  document.getElementById("cpUrunAdet").value="1";
  document.getElementById("cpUrunFiyat").value="";
  document.getElementById("cpSatirTutar").textContent="0.00";
};

window.cpSepetiTemizle = ()=>{
  CP_SEPET=[];
  renderCpSepet();
};

function renderCpSepet(){
  const body=document.getElementById("cpSepetBody");
  body.innerHTML="";
  let total=0;
  let karTop=0;
  CP_SEPET.forEach((s,i)=>{
    total += toNum(s.satir_tutar);
    const kar = calcLineProfit(s.alis_snapshot, s.birim_fiyat, s.miktar);
    karTop += kar;

    body.innerHTML += `
      <tr>
        <td>${s.urun_ad}</td>
        <td>${s.miktar}</td>
        <td>${fmt(s.birim_fiyat, s.para_birimi)}</td>
        <td>${fmt(s.satir_tutar, s.para_birimi)}</td>
        <td><span style="color:${kar>=0?'#4ade80':'#fca5a5'}; font-weight:700;">${fmt(kar, s.para_birimi)}</span></td>
        <td><button class="danger" onclick="cpSepetSil(${i})">X</button></td>
      </tr>`;
  });
  const pb = CP_SEPET[0]?.para_birimi || "USD";
  document.getElementById("cpSepetToplam").textContent = fmt(total, pb);

  const karEl=document.getElementById("cpKarToplam");
  if(karEl) karEl.textContent = fmt(karTop, pb);
}
window.cpSepetSil = (i)=>{
  CP_SEPET.splice(i,1);
  renderCpSepet();
};

window.cpSatisiTamamla = async ()=>{
  if(!ACTIVE_CARI_ID) return;
  if(CP_SEPET.length===0) return showToast("Sepet boş","warning");

  const pb = CP_SEPET[0].para_birimi || "USD";
  const total = CP_SEPET.reduce((a,b)=>a+b.satir_tutar,0);

  const numara = await getAutoFaturaNo();

  const { data: fatura, error } = await supa.from("faturalar").insert({
    user_id: USER.id,
    tip: "satis",
    cari_id: ACTIVE_CARI_ID,
    tarih: nowLocalDT(),
    numara,
    genel_toplam: total,
    para_birimi: pb
  }).select().single();
  if(error) return showToast(error.message,"error");

  const kalemler = CP_SEPET.map(s=>({
    fatura_id: fatura.id,
    urun_id: s.urun_id,
    miktar: s.miktar,
    birim_fiyat: s.birim_fiyat,
    kdv_oran: s.kdv_oran,
    satir_tutar: s.satir_tutar,
    // snapshots (madde 2)
    urun_kod_snapshot: s.urun_kod,
    urun_ad_snapshot: s.urun_ad,
    alis_fiyat_snapshot: s.alis_snapshot,
    satis_fiyat_snapshot: s.satis_snapshot,
    para_birimi_snapshot: s.para_birimi
  }));
  await supa.from("fatura_kalemler").insert(kalemler);

  for(const s of CP_SEPET){
    await applyStockChange(s.urun_id, -s.miktar, {tur:"satis", kaynak:"fatura", kaynak_id:fatura.id, aciklama:"Hızlı satış"});
  }

  showToast("Satış tamamlandı, fatura oluştu.","success");
  CP_SEPET=[]; renderCpSepet();

  await fetchAll(); renderAll();
  await cpVerileriGuncelle();
  await cpHareketleriGetir();
};

window.setCpFinansTur = (tur) => {
  document.getElementById('cpFinansTur').value = tur;
  if(tur === 'tahsilat') {
    document.getElementById('btnTahsilat').style.opacity = '1';
    document.getElementById('btnOdeme').style.opacity = '0.5';
  } else {
    document.getElementById('btnTahsilat').style.opacity = '0.5';
    document.getElementById('btnOdeme').style.opacity = '1';
  }
};

window.cpFinansIsle = async () => {
  if(!ACTIVE_CARI_ID) return;
  const tur = document.getElementById('cpFinansTur').value;
  const tutar = toNum(document.getElementById('cpFinansTutar').value);
  const kasaId = document.getElementById('cpKasaSelect').value;
  const aciklama = document.getElementById('cpFinansAciklama').value;
  if(tutar <= 0) return showToast("Geçerli bir tutar girin", "warning");

  const { error } = await supa.from('kasa_hareketler').insert({
    user_id: USER.id,
    hesap_id: kasaId,
    cari_id: ACTIVE_CARI_ID,
    tur: tur,
    tutar: tutar,
    tarih: todayStr(),
    aciklama: aciklama || "Müşteri Paneli İşlemi"
  });
  if(error) return showToast(error.message, "error");

  showToast("Finansal işlem kaydedildi.", "success");
  document.getElementById('cpFinansTutar').value = "";
  await fetchAll(); renderAll();
  await cpVerileriGuncelle(); await cpHareketleriGetir();
};

/* =========================================================
   Cari Panel Hareketler
========================================================= */
async function cpHareketleriGetir(){
  const fList = FATURALAR.filter(f=>f.cari_id==ACTIVE_CARI_ID).map(f=>({
    id:f.id,
    tarih:f.tarih,
    tur: normalizeTip(f.tip)==='satis' ? "Satış Faturası" : "İade Faturası",
    tutar: normalizeTip(f.tip)==='satis' ? +f.genel_toplam : -f.genel_toplam,
    aciklama: f.numara || "",
    kaynak:"fatura",
    pb:f.para_birimi
  }));
  const kList = HAREKETLER.filter(h=>h.cari_id==ACTIVE_CARI_ID).map(h=>({
    id:h.id,
    tarih:h.tarih,
    tur: h.tur==="tahsilat"?"Tahsilat":"Ödeme",
    tutar:+h.tutar,
    aciklama:h.aciklama||"",
    kaynak:"kasa",
    pb: HESAPLAR.find(x=>x.id==h.hesap_id)?.para_birimi||"USD"
  }));

  CP_HAREKETLER = [...fList,...kList].sort((a,b)=>new Date(b.tarih)-new Date(a.tarih));
  renderCpHareketler(CP_HAREKETLER);
}
function renderCpHareketler(list){
  const body=document.getElementById("cpHareketListe");
  body.innerHTML="";
  list.forEach(x=>{
    body.innerHTML += `
    <tr>
      <td>${formatTRDateTime(x.tarih)}</td>
      <td>${x.tur}</td>
      <td>${fmt(x.tutar,x.pb)}</td>
      <td>${x.aciklama||"-"}</td>
      <td>
        ${x.kaynak==="fatura"
          ? `<button class="warning" onclick="editFatura('${x.id}')">Düzenle</button>
             <button class="danger" onclick="deleteHistoryItem('fatura','${x.id}')">Sil</button>`
          : `<button class="warning" onclick="jumpToHareketEdit('${x.id}')">Düzenle</button>
             <button class="danger" onclick="deleteHistoryItem('hareket','${x.id}')">Sil</button>`
        }
      </td>
    </tr>`;
  });
}
window.cpHareketAraFiltre = ()=>{
  const q=(document.getElementById("cpHareketAra").value||"").toLocaleLowerCase("tr");
  const filt=CP_HAREKETLER.filter(x =>
    (x.tur||"").toLocaleLowerCase("tr").includes(q) ||
    (x.aciklama||"").toLocaleLowerCase("tr").includes(q)
  );
  renderCpHareketler(filt);
};

/* =========================================================
   Cari bakiye hesap (iade düşer)
========================================================= */
async function cpVerileriGuncelle() {
  if(!ACTIVE_CARI_ID) return;
  let borc = 0; let alacak = 0;

  FATURALAR
    .filter(f => f.cari_id == ACTIVE_CARI_ID)
    .forEach(f=>{
      const tip=normalizeTip(f.tip);
      if(tip==='satis') borc += toNum(f.genel_toplam);
      if(tip==='iade') alacak += toNum(f.genel_toplam); // iade müşterinin borcundan düşer
    });

  HAREKETLER
    .filter(h => h.cari_id == ACTIVE_CARI_ID && h.tur == 'tahsilat')
    .forEach(h => alacak += toNum(h.tutar));

  const cari = CARILER.find(c => c.id == ACTIVE_CARI_ID);
  if(cari) { borc += toNum(cari.acilis_borc); alacak += toNum(cari.acilis_alacak); }

  const bakiye = borc - alacak;
  const bakiyeEl = document.getElementById('cpBakiye');
  bakiyeEl.textContent = fmt(bakiye);
  bakiyeEl.style.color = bakiye > 0 ? '#ef4444' : '#4ade80';
}

/* =========================================================
   GLOBAL SEARCH (aynı)
========================================================= */
window.globalSearch = () => {
  const input = document.getElementById('searchInput');
  const query = input.value.toLocaleLowerCase('tr').trim();
  if (!query) return showToast("Arama yapmak için bir kelime yazın.", "warning");

  const matchedCariler = CARILER.filter(c =>
    (c.ad && c.ad.toLocaleLowerCase('tr').includes(query)) ||
    (c.tel && c.tel.includes(query)) ||
    (c.mail && c.mail.toLocaleLowerCase('tr').includes(query)) ||
    (c.adres && c.adres.toLocaleLowerCase('tr').includes(query))
  );
  const matchedUrunler = URUNLER.filter(u =>
    (u.ad && u.ad.toLocaleLowerCase('tr').includes(query)) ||
    (u.kod && u.kod.toLocaleLowerCase('tr').includes(query))
  );

  const cariBody = document.getElementById('searchResultCari'); cariBody.innerHTML = "";
  if (matchedCariler.length === 0) {
    cariBody.innerHTML = "<tr><td colspan='5' style='text-align:center; color:#94a3b8;'>Eşleşen müşteri bulunamadı.</td></tr>";
  } else {
    matchedCariler.forEach(c => {
      cariBody.innerHTML += `
        <tr>
          <td onclick="document.getElementById('modalSearch').classList.add('hide'); openCariPanel('${c.id}')" style="cursor:pointer; color:#60a5fa; font-weight:bold;">${c.ad}</td>
          <td>${c.tel}</td>
          <td>${c.adres ? c.adres.slice(0, 20) : '-'}</td>
          <td>${fmt(hesaplaBakiye(c.id))}</td>
          <td><button class="info" style="font-size:11px;" onclick="document.getElementById('modalSearch').classList.add('hide'); openEkstre('${c.id}')">Ekstre</button></td>
        </tr>`;
    });
  }

  const urunBody = document.getElementById('searchResultUrun'); urunBody.innerHTML = "";
  if (matchedUrunler.length === 0) {
    urunBody.innerHTML = "<tr><td colspan='5' style='text-align:center; color:#94a3b8;'>Eşleşen ürün bulunamadı.</td></tr>";
  } else {
    matchedUrunler.forEach(u => {
      urunBody.innerHTML += `
        <tr>
          <td>${u.ad}</td><td>${u.kod}</td>
          <td style="color:#4ade80">${fmt(u.satis_fiyat, u.para_birimi)}</td>
          <td>${u.stok_miktar}</td>
          <td><button class="warning" style="font-size:11px;" onclick="document.getElementById('modalSearch').classList.add('hide'); jumpToUrunEdit('${u.id}')">Git</button></td>
        </tr>`;
    });
  }

  document.getElementById('modalSearch').classList.remove('hide');
};

/* =========================================================
   EKSTRE (iade dahil)
========================================================= */
window.openEkstre = async (cariId) => {
  const cari = CARILER.find(c => c.id == cariId); if(!cari) return;
  document.getElementById('ekstreBaslik').innerHTML = `${cari.ad} <span style="font-size:14px; color:#94a3b8">Ekstresi</span>`;

  const musteriFaturalari = FATURALAR.filter(f => f.cari_id == cariId);
  const faturaIds = musteriFaturalari.map(f => f.id);

  const { data: kalemler } = await supa.from('fatura_kalemler')
    .select('*, faturalar(tarih, numara, tip), urunler(ad)')
    .in('fatura_id', faturaIds)
    .order('id', {ascending:false});

  const tblUrunler = document.getElementById('ekstreUrunler'); tblUrunler.innerHTML = "";
  if(kalemler && kalemler.length > 0) {
    kalemler.forEach(k => {
      if(!k.faturalar) return;
      const isIade = normalizeTip(k.faturalar.tip) === 'iade';
      const islemTuru = isIade ? '(İADE)' : '';
      tblUrunler.innerHTML += `
        <tr>
          <td>${formatTRDateTime(k.faturalar.tarih)}</td>
          <td>${k.urun_ad_snapshot || (k.urunler ? k.urunler.ad : 'Silinmiş Ürün')} <small style="color:#f59e0b">${islemTuru}</small></td>
          <td>${k.miktar}</td>
          <td>${fmt(k.birim_fiyat)}</td>
          <td>${fmt(k.satir_tutar)}</td>
          <td><button class="warning" style="padding:4px 8px; font-size:11px;" onclick="closeEkstre(); editFatura('${k.fatura_id}')">Düzenle</button></td>
        </tr>`;
    });
  } else {
    tblUrunler.innerHTML = "<tr><td colspan='6' style='text-align:center'>Ürün hareketi yok.</td></tr>";
  }

  const odemeler = HAREKETLER.filter(h => h.cari_id == cariId);
  const tblOdemeler = document.getElementById('ekstreOdemeler'); tblOdemeler.innerHTML = "";
  if(odemeler.length > 0) {
    odemeler.forEach(h => {
      const renk = h.tur === 'tahsilat' ? '#4ade80' : '#ef4444';
      const etiket = h.tur === 'tahsilat' ? 'Tahsilat (Giriş)' : 'Ödeme (Çıkış)';
      tblOdemeler.innerHTML += `
        <tr>
          <td>${formatTRDateTime(h.tarih)}</td>
          <td><span style="color:${renk}">${etiket}</span><br><small>${h.aciklama||''}</small></td>
          <td style="font-weight:bold">${fmt(h.tutar)}</td>
          <td><button class="warning" style="padding:4px 8px; font-size:11px;" onclick="closeEkstre(); jumpToHareketEdit('${h.id}')">Düzenle</button></td>
        </tr>`;
    });
  } else {
    tblOdemeler.innerHTML = "<tr><td colspan='4' style='text-align:center'>Finansal hareket yok.</td></tr>";
  }

  let toplamSatis = 0;
  let toplamIade  = 0;
  musteriFaturalari.forEach(f=>{
    if(normalizeTip(f.tip)==='satis') toplamSatis += toNum(f.genel_toplam);
    if(normalizeTip(f.tip)==='iade')  toplamIade  += toNum(f.genel_toplam);
  });

  let toplamOdeme = 0;
  odemeler.filter(h => h.tur === 'tahsilat').forEach(h => toplamOdeme += toNum(h.tutar));

  const acilisBorc = toNum(cari.acilis_borc);
  const acilisAlacak = toNum(cari.acilis_alacak);

  const genelToplamBorc = toplamSatis + acilisBorc;
  const genelToplamAlacak = toplamOdeme + acilisAlacak + toplamIade;
  const bakiye = genelToplamBorc - genelToplamAlacak;

  document.getElementById('ekstreAlim').textContent = fmt(genelToplamBorc);
  document.getElementById('ekstreOdeme').textContent = fmt(genelToplamAlacak);
  const bakElem = document.getElementById('ekstreBakiye');
  bakElem.textContent = fmt(bakiye);
  bakElem.style.color = bakiye > 0 ? '#ef4444' : (bakiye < 0 ? '#4ade80' : '#e2e8f0');

  document.getElementById('modalEkstre').classList.remove('hide');
};

function hesaplaBakiye(cariId) {
  let borc = 0; let alacak = 0;

  FATURALAR.filter(f => f.cari_id == cariId).forEach(f=>{
    if(normalizeTip(f.tip)==='satis') borc += toNum(f.genel_toplam);
    if(normalizeTip(f.tip)==='iade') alacak += toNum(f.genel_toplam);
  });

  HAREKETLER.filter(h => h.cari_id == cariId && h.tur == 'tahsilat').forEach(h => alacak += toNum(h.tutar));
  const cari = CARILER.find(c => c.id == cariId);
  if(cari) { borc += toNum(cari.acilis_borc); alacak += toNum(cari.acilis_alacak); }
  return borc - alacak;
}
window.closeEkstre = () => document.getElementById('modalEkstre').classList.add('hide');
window.jumpToUrunEdit = (id) => { document.querySelector('button[data-tab="urunler"]').click(); setTimeout(() => { const btn = document.querySelector(`button[data-edit="${id}"]`); if(btn) btn.click(); }, 300); };
window.jumpToHareketEdit = (id) => { document.querySelector('button[data-tab="kasa"]').click(); setTimeout(() => { const btn = document.querySelector(`button[data-edit="${id}"]`); if(btn) { btn.click(); showToast("İşlem açıldı.", "info"); } }, 500); };

/* =========================================================
   İŞLEM GEÇMİŞİ (stok geri al iade dahil)
========================================================= */
window.renderHistory = () => {
  const tbody = document.getElementById('historyList'); if(!tbody) return;
  tbody.innerHTML = "";
  const searchTerm = document.getElementById('historySearch') ? document.getElementById('historySearch').value.toLocaleLowerCase('tr') : "";
  let allEvents = [];

  FATURALAR.forEach(f => {
    const cari = CARILER.find(c => c.id == f.cari_id);
    allEvents.push({
      id: f.id,
      type: 'fatura',
      date: f.tarih,
      label: normalizeTip(f.tip) === 'satis' ? 'Satış Faturası' : 'İade Faturası',
      desc: cari ? cari.ad : 'Silinmiş Cari',
      amount: f.genel_toplam,
      currency: f.para_birimi,
      color: normalizeTip(f.tip) === 'satis' ? '#60a5fa' : '#f59e0b'
    });
  });

  HAREKETLER.forEach(h => {
    const hesap = HESAPLAR.find(x => x.id == h.hesap_id);
    const cari = h.cari_id ? CARILER.find(c => c.id == h.cari_id) : null;
    allEvents.push({
      id: h.id,
      type: 'hareket',
      date: h.tarih,
      label: h.tur === 'tahsilat' ? 'Tahsilat (Kasa)' : 'Ödeme (Kasa)',
      desc: (cari ? cari.ad + ' - ' : '') + (h.aciklama || ''),
      amount: h.tutar,
      currency: hesap ? hesap.para_birimi : 'USD',
      color: h.tur === 'tahsilat' ? '#4ade80' : '#ef4444'
    });
  });

  GG.forEach(g => {
    allEvents.push({
      id: g.id,
      type: 'gg',
      date: g.tarih,
      label: g.tur === 'gelir' ? 'Gelir Ekleme' : 'Gider Ekleme',
      desc: `${g.kategori} - ${g.aciklama}`,
      amount: g.tutar,
      currency: 'USD',
      color: g.tur === 'gelir' ? '#4ade80' : '#ef4444'
    });
  });

  allEvents.sort((a, b) => new Date(b.date) - new Date(a.date));
  allEvents
    .filter(e => e.label.toLocaleLowerCase('tr').includes(searchTerm) || e.desc.toLocaleLowerCase('tr').includes(searchTerm))
    .forEach(e => {
      tbody.innerHTML += `
        <tr>
          <td>${formatTRDateTime(e.date)}</td>
          <td><span class="tag" style="background:${e.color}20; color:${e.color}; border:1px solid ${e.color}">${e.label}</span></td>
          <td>${e.desc}</td>
          <td style="font-weight:bold; color:${e.color}">${fmt(e.amount, e.currency)}</td>
          <td>
            <button class="warning" style="margin-right:5px;" onclick="jumpToEdit('${e.type}', '${e.id}')">Düzenle</button>
            <button class="danger" onclick="deleteHistoryItem('${e.type}', '${e.id}')">Sil</button>
          </td>
        </tr>`;
  });
};

window.jumpToEdit = (type, id) => {
  if (type === 'fatura') { editFatura(id); } 
  else if (type === 'hareket') { window.jumpToHareketEdit(id); } 
  else if (type === 'gg') {
    document.querySelector('button[data-tab="gelirgider"]').click();
    setTimeout(() => {
      const btn = document.querySelector(`button[data-edit="${id}"]`);
      if(btn) { btn.click(); showToast("Gelir/Gider düzenlemeye açıldı.", "info"); }
    }, 300);
  }
};

window.deleteHistoryItem = async (type, id) => {
  if(!confirm("Bu işlemi silmek ve stokları geri almak istediğine emin misin? (Geri alınamaz)")) return;

  if(type === 'fatura') {
    const { data: fatura } = await supa.from('faturalar').select('tip').eq('id', id).single();
    const { data: kalemler } = await supa.from('fatura_kalemler').select('*').eq('fatura_id', id);

    const tip = normalizeTip(fatura?.tip||"satis");

    if (kalemler) {
      for (const k of kalemler) {
        const degisim = tip === 'satis' ? +k.miktar : -k.miktar;
        await applyStockChange(k.urun_id, degisim, {tur:"silme", kaynak:"fatura", kaynak_id:id, aciklama:"Fatura silindi geri alım"});
      }
    }

    await supa.from('fatura_kalemler').delete().eq('fatura_id', id);
    await supa.from('faturalar').delete().eq('id', id);

  } else if (type === 'hareket') {
    await supa.from('kasa_hareketler').delete().eq('id', id);

  } else if (type === 'gg') {
    await supa.from('gelir_gider').delete().eq('id', id);
  }

  showToast("İşlem silindi ve stoklar güncellendi.", "success");
  await fetchAll(); renderHistory(); renderAll();
};

/* =========================================================
   BACKUP / RESTORE / TIME MACHINE (basit sürüm)
   Not: GitHub Pages statik ortam için, hızlı çalışır "rollback" ve "temizle" eklendi.
========================================================= */
window.openTimeMachine = () => {
  const modal = document.getElementById('modalTimeMachine');
  const input = document.getElementById('rollbackTime');
  if(input && !input.value) input.value = nowLocalDT();
  if(modal) modal.classList.remove('hide');
};

async function _deleteAllFrom(table){
  // Supabase .delete() için filtre şart; id alanı olan tablolarda genel bir neq ile hepsini seçiyoruz
  return await supa.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
}

async function _deleteNewerThan(table, col, iso){
  // tarih kolonlarına göre kes
  return await supa.from(table).delete().gt(col, iso);
}

window.clearAllHistory = async () => {
  if(!confirm("TÜM işlemleri (fatura, kasa, gelir/gider, stok) tamamen silmek istediğine emin misin?")) return;
  if(!confirm("Bu işlem GERİ ALINAMAZ. Devam edilsin mi?")) return;

  try{
    // Bağımlı tablolardan başla
    await _deleteAllFrom('fatura_kalemler');
    await _deleteAllFrom('stok_hareketleri');
    await _deleteAllFrom('kasa_hareketler');
    await _deleteAllFrom('gelir_gider');
    await _deleteAllFrom('faturalar');
    // loglar varsa
    try{ await _deleteAllFrom('system_logs'); }catch(e){}

    showToast("Tüm geçmiş temizlendi.", "success");
    await fetchAll();
    renderAll();
    if(window.renderHistory) window.renderHistory();
  }catch(e){
    console.error(e);
    showToast(e?.message || "Geçmiş temizlenemedi.", "error");
  }
};

window.executeRollback = async () => {
  const input = document.getElementById('rollbackTime');
  const modal = document.getElementById('modalTimeMachine');
  const iso = input?.value ? new Date(input.value).toISOString() : null;
  if(!iso){ return showToast("Lütfen bir tarih/saat seç.", "error"); }

  if(!confirm("Seçilen tarihten SONRAKİ tüm işlemler silinecek. Devam edilsin mi?")) return;

  try{
    // tarih kolonlarına göre sil
    await _deleteNewerThan('fatura_kalemler','created_at', iso).catch(()=>{});
    await _deleteNewerThan('stok_hareketleri','tarih', iso);
    await _deleteNewerThan('kasa_hareketler','tarih', iso);
    await _deleteNewerThan('gelir_gider','tarih', iso);
    await _deleteNewerThan('faturalar','tarih', iso);

    showToast("Rollback tamamlandı.", "success");
    if(modal) modal.classList.add('hide');
    await fetchAll();
    renderAll();
    if(window.renderHistory) window.renderHistory();
  }catch(e){
    console.error(e);
    showToast(e?.message || "Rollback yapılamadı.", "error");
  }
};



/* =========================================================
   BACKUP / RESTORE (JSON export/import)
   - "Yedek Al" : Bellekteki verileri JSON indirir
   - "Yükle"    : JSON dosyasını okuyup Supabase'e UPSERT eder
========================================================= */

function _downloadTextFile(filename, text){
  const blob = new Blob([text], {type:"application/json;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 500);
}

function buildBackupPayload(){
  return {
    app: "pexura-muhasebe",
    version: 1,
    exported_at: new Date().toISOString(),
    user: USER ? { id: USER.id, email: USER.email, role: USER_ROLE } : null,
    tables: {
      cariler: CARILER || [],
      urunler: URUNLER || [],
      kasa_hesaplar: HESAPLAR || [],
      kasa_hareketler: HAREKETLER || [],
      gelir_gider: GG || [],
      faturalar: FATURALAR || [],
      fatura_kalemler: TUM_KALEMLER || [],
      stok_hareketleri: [] // opsiyonel; panelde ayrı liste yok, boş bırakıyoruz
    }
  };
}

async function doBackup(){
  try{
    if(!USER) return showToast("Yedek almak için önce giriş yap.", "warning");
    // en güncel veri için çek
    await fetchAll();
    const payload = buildBackupPayload();
    const stamp = new Date().toISOString().replace(/[:.]/g,'-');
    _downloadTextFile(`pexura-yedek-${stamp}.json`, JSON.stringify(payload, null, 2));
    showToast("Yedek indirildi.", "success");
  }catch(e){
    console.error(e);
    showToast(e?.message || "Yedek alınamadı.", "error");
  }
}

function _maybeAttachUserId(rows){
  // user_id kolonu beklenen tablolarda yoksa sorun olmaz; Supabase tarafında ignore eder
  if(!USER?.id) return rows;
  return (rows||[]).map(r=>{
    if(r && typeof r === 'object' && !Array.isArray(r)){
      if(!("user_id" in r)) return r;
      return { ...r, user_id: r.user_id || USER.id };
    }
    return r;
  });
}

async function upsertTable(table, rows){
  if(!rows || !rows.length) return;
  // user_id varsa doldur
  const prepared = _maybeAttachUserId(rows);

  // çoğu tabloda pk = id; upsert çakışma çözümü
  const { error } = await supa.from(table).upsert(prepared, { onConflict: "id" });
  if(error) throw error;
}

async function doRestoreFromJsonText(text){
  if(!USER) return showToast("Yüklemek için önce giriş yap.", "warning");

  let payload;
  try{
    payload = JSON.parse(text);
  }catch(e){
    return showToast("JSON okunamadı / dosya bozuk.", "error");
  }

  const tables = payload?.tables || payload;
  if(!tables || typeof tables !== "object"){
    return showToast("Yedek formatı tanınmadı.", "error");
  }

  if(!confirm("Yedek içeriği Supabase'e YAZILACAK (UPSERT). Devam edilsin mi?")) return;

  try{
    // Bağımlılık sırası önemli
    const order = [
      "cariler",
      "urunler",
      "kasa_hesaplar",
      "faturalar",
      "fatura_kalemler",
      "kasa_hareketler",
      "gelir_gider",
      "stok_hareketleri"
    ];

    for(const t of order){
      if(tables[t] && tables[t].length){
        showToast(`${t} yükleniyor...`, "info");
        await upsertTable(t, tables[t]);
      }
    }

    showToast("Yükleme tamamlandı.", "success");
    await fetchAll();
    renderAll();
    if(window.renderHistory) window.renderHistory();
  }catch(e){
    console.error(e);
    showToast(e?.message || "Yükleme başarısız.", "error");
  }
}

// UI bağla
(function bindBackupRestoreUI(){
  const backupBtn = document.getElementById("backupBtn");
  const restoreBtn = document.getElementById("restoreBtn");
  const importFile = document.getElementById("importFile");

  if(backupBtn) backupBtn.addEventListener("click", doBackup);

  if(restoreBtn && importFile){
    restoreBtn.addEventListener("click", ()=> importFile.click());
    importFile.addEventListener("change", async (ev)=>{
      const file = ev.target.files?.[0];
      if(!file) return;
      const text = await file.text();
      await doRestoreFromJsonText(text);
      ev.target.value = ""; // aynı dosyayı tekrar seçebilmek için
    });
  }
})();


/* =========================================================
   STARTUP ALERTS (madde 12)
========================================================= */
function runStartupAlerts(){
  // kritik stoklar
  const kritikler = URUNLER.filter(u=>toNum(u.stok_miktar)<=toNum(u.min_stok));
  if(kritikler.length){
    showToast(`${kritikler.length} ürün kritik stokta!`, "warning");
  }
}

// START
loadSession();

// UI events
document.getElementById('showPasifCariler')?.addEventListener('change', ()=>{
  try{ renderCariler(); }catch(e){}
});


// ==== Quick Cari Add (from Fatura screen) ====
window.openCariQuickModal = () => {
  if(!window.modalCariQuick) return showToast("Modal bulunamadı", "error");
  modalCariQuick.classList.remove("hide");
  if(window.qCariAd) qCariAd.value = "";
  if(window.qCariTel) qCariTel.value = "";
  if(window.qCariTur) qCariTur.value = "musteri";
  setTimeout(()=>{ if(window.qCariAd) qCariAd.focus(); }, 50);
};

window.closeCariQuickModal = () => {
  if(window.modalCariQuick) modalCariQuick.classList.add("hide");
};

window.saveCariQuickModal = async () => {
  const ad = (window.qCariAd?.value || "").trim();
  const tel = (window.qCariTel?.value || "").trim();
  const tur = (window.qCariTur?.value || "musteri").trim();

  if(!ad) return showToast("Müşteri adı boş olamaz", "error");

  const payload = {
    tur,
    ad,
    tel,
    aktif: true,
    mail: null,
    adres: null,
    acilis_borc: 0,
    acilis_alacak: 0
  };

  const res = await supa.from("cariler").insert(payload).select().single();
  if(res.error){
    console.error(res.error);
    return showToast(res.error.message || "Kayıt hatası", "error");
  }

  showToast("Müşteri eklendi", "success");
  closeCariQuickModal();

  await fetchCariler();
  fillSelects();
  renderCariler();

  // faturada otomatik seç
  if(window.fCari) fCari.value = res.data.id;
};


/* =========================================================
   DASHBOARD - Fatura Detay Modal (PDF + Tahsilat)
========================================================= */
let CURRENT_FATURA_DETAY_ID = null;

window.openFaturaDetayModal = async (faturaId) => {
  try{
    CURRENT_FATURA_DETAY_ID = faturaId;
    const modal = document.getElementById('modalFaturaDetay');
    if(!modal) return;

    // Data (local cache -> fallback to fetch)
    let f = FATURALAR.find(x => x.id == faturaId);
    if(!f){
      const { data, error } = await supa.from('faturalar').select('*').eq('id', faturaId).single();
      if(error) throw error;
      f = data;
    }
    const c = CARILER.find(x => x.id == f.cari_id) || null;

    // Kalemler
    let kalemler = (TUM_KALEMLER||[]).filter(k => k.fatura_id == faturaId);
    if(!kalemler.length){
      const { data } = await supa.from('fatura_kalemler').select('*').eq('fatura_id', faturaId);
      kalemler = data || [];
    }

    // DOM refs
    const elTitle = document.getElementById('faturaDetayBaslik');
    const elMeta  = document.getElementById('faturaDetayMeta');
    const elBody  = document.getElementById('faturaDetayKalemler');

    const elAra   = document.getElementById('faturaDetayAraToplam');
    const elKdv   = document.getElementById('faturaDetayKdvToplam');
    const elGenel = document.getElementById('faturaDetayGenelToplam');
    const elOdenen= document.getElementById('faturaDetayOdenen');
    const elKalan = document.getElementById('faturaDetayKalan');

    const pb = (f.para_birimi || 'TL');
    const araToplam = toNum(f.ara_toplam) || kalemler.reduce((a,k)=>a + (toNum(k.miktar)*toNum(k.birim_fiyat)),0);
    const kdvToplam = toNum(f.kdv_toplam) || kalemler.reduce((a,k)=>{
      const tut = toNum(k.miktar)*toNum(k.birim_fiyat);
      const oran = toNum(k.kdv_oran);
      return a + (oran ? (tut*oran/100) : 0);
    },0);
    const genelToplam = toNum(f.genel_toplam) || (araToplam + kdvToplam);
    const odenen = toNum(f.odenen_tutar) || 0;
    const kalan = Math.max(0, genelToplam - odenen);

    if(elTitle){
      const musteriAd = (c?.ad || c?.unvan || 'Müşteri');
      elTitle.textContent = `Fatura Detayı • ${f.numara || ''} • ${musteriAd}`;
    }
    if(elMeta){
      const musteriAd = (c?.ad || c?.unvan || '-');
      const tel = (c?.tel || '-');
      elMeta.innerHTML = `
        <div><b>Müşteri:</b> ${escapeHtml(musteriAd)} • <b>Tel:</b> ${escapeHtml(tel)}</div>
        <div><b>Tarih:</b> ${formatTRDateTime(f.tarih)} • <b>Para Birimi:</b> ${escapeHtml(pb)}</div>
      `;
    }

    if(elBody){
      elBody.innerHTML = '';
      kalemler.forEach(k => {
        const urunAd = k.urun_ad_snapshot || (URUNLER.find(u=>u.id==k.urun_id)?.ad) || '-';
        const miktar = toNum(k.miktar);
        const bf = toNum(k.birim_fiyat);
        const tutar = toNum(k.satir_tutar) || (miktar*bf);
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${escapeHtml(urunAd)}</td>
          <td style="text-align:right;">${miktar}</td>
          <td style="text-align:right;">${fmt(bf, pb)}</td>
          <td style="text-align:right;">${fmt(tutar, pb)}</td>
        `;
        elBody.appendChild(tr);
      });
    }

    if(elAra)   elAra.textContent   = fmt(araToplam, pb);
    if(elKdv)   elKdv.textContent   = fmt(kdvToplam, pb);
    if(elGenel) elGenel.textContent = fmt(genelToplam, pb);
    if(elOdenen)elOdenen.textContent= fmt(odenen, pb);
    if(elKalan) elKalan.textContent = fmt(kalan, pb);

    modal.classList.remove('hide');
  }catch(e){
    console.error(e);
    showToast(e?.message || "Fatura detayı açılamadı", "error");
  }
};

window.closeFaturaDetayModal = () => {
  const modal = document.getElementById('modalFaturaDetay');
  if(modal) modal.classList.add('hide');
};

window.editFaturaFromDetay = async () => {
  if(!CURRENT_FATURA_DETAY_ID) return;
  window.closeFaturaDetayModal();
  // Fatura tabına geç
  const btn = document.querySelector('button[data-tab="faturalar"]');
  if(btn) btn.click();
  // edit
  if(window.editFatura) await window.editFatura(CURRENT_FATURA_DETAY_ID);
};

window.downloadFaturaPdfFromDetay = async () => {
  try{
    if(!CURRENT_FATURA_DETAY_ID) return;

    let f = FATURALAR.find(x => x.id == CURRENT_FATURA_DETAY_ID);
    if(!f){
      const { data, error } = await supa.from('faturalar').select('*').eq('id', CURRENT_FATURA_DETAY_ID).single();
      if(error) throw error;
      f = data;
    }
    const c = CARILER.find(x => x.id == f.cari_id) || null;

    let kalemler = (TUM_KALEMLER||[]).filter(k => k.fatura_id == CURRENT_FATURA_DETAY_ID);
    if(!kalemler.length){
      const { data } = await supa.from('fatura_kalemler').select('*').eq('fatura_id', CURRENT_FATURA_DETAY_ID);
      kalemler = data || [];
    }

    const pb = (f.para_birimi || 'TL');
    const araToplam = toNum(f.ara_toplam) || kalemler.reduce((a,k)=>a + (toNum(k.miktar)*toNum(k.birim_fiyat)),0);
    const kdvToplam = toNum(f.kdv_toplam) || 0;
    const genelToplam = toNum(f.genel_toplam) || (araToplam + kdvToplam);
    const odenen = toNum(f.odenen_tutar) || 0;
    const kalan = Math.max(0, genelToplam - odenen);

    const musteriAd = (c?.ad || c?.unvan || '');
    const tel = (c?.tel || '');

    const { jsPDF } = window.jspdf || {};
    if(!jsPDF) return showToast("PDF kütüphanesi yüklenemedi", "error");
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });

    doc.setFontSize(14);
    doc.text(`FATURA • ${f.numara || ''}`, 40, 50);

    doc.setFontSize(10);
    doc.text(`Müşteri: ${musteriAd}   Tel: ${tel}`, 40, 70);
    doc.text(`Tarih: ${formatTRDateTime(f.tarih)}   Para Birimi: ${pb}`, 40, 85);

    const body = kalemler.map(k => {
      const urunAd = k.urun_ad_snapshot || (URUNLER.find(u=>u.id==k.urun_id)?.ad) || '-';
      const miktar = toNum(k.miktar);
      const bf = toNum(k.birim_fiyat);
      const tutar = toNum(k.satir_tutar) || (miktar*bf);
      return [urunAd, String(miktar), fmt(bf, pb), fmt(tutar, pb)];
    });

    doc.autoTable({
      head: [['Ürün', 'Miktar', 'Birim Fiyat', 'Tutar']],
      body,
      startY: 105,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [30, 41, 59] }
    });

    const y = doc.lastAutoTable.finalY + 20;
    doc.setFontSize(10);
    doc.text(`Ara Toplam: ${fmt(araToplam, pb)}`, 380, y);
    doc.text(`KDV Toplam: ${fmt(kdvToplam, pb)}`, 380, y+14);
    doc.text(`Genel Toplam: ${fmt(genelToplam, pb)}`, 380, y+28);
    doc.text(`Ödenen: ${fmt(odenen, pb)}`, 380, y+42);
    doc.text(`Kalan: ${fmt(kalan, pb)}`, 380, y+56);

    doc.save(`Fatura-${f.numara || f.id}.pdf`);
    showToast("PDF indirildi.", "success");
  }catch(e){
    console.error(e);
    showToast(e?.message || "PDF oluşturulamadı", "error");
  }
};

window.addTahsilatFromDetay = async () => {
  try{
    if(!CURRENT_FATURA_DETAY_ID) return;

    let f = FATURALAR.find(x => x.id == CURRENT_FATURA_DETAY_ID);
    if(!f){
      const { data, error } = await supa.from('faturalar').select('*').eq('id', CURRENT_FATURA_DETAY_ID).single();
      if(error) throw error;
      f = data;
    }

    const pb = (f.para_birimi || 'TL');
    const genelToplam = toNum(f.genel_toplam) || 0;
    const odenen = toNum(f.odenen_tutar) || 0;
    const kalan = Math.max(0, genelToplam - odenen);

    if(kalan <= 0){
      return showToast("Bu faturanın kalan borcu yok.", "info");
    }

    // hesap seçimi
    const uygunHesaplar = (HESAPLAR||[]).filter(h => (h.para_birimi || 'TL') === pb);
    if(!uygunHesaplar.length){
      return showToast(`Para birimi ${pb} olan kasa hesabı bulunamadı. (Kasa > Hesaplar)`, "warning");
    }

    const listText = uygunHesaplar.map((h,i)=> `${i+1}) ${h.ad || h.isim || h.id}`).join('\n');
    const idxStr = prompt(`Tahsilat hangi kasa hesabına eklensin?\n\n${listText}\n\nSeçim (1-${uygunHesaplar.length}):`, "1");
    if(idxStr === null) return;
    const idx = Number(idxStr) - 1;
    const hesap = uygunHesaplar[idx];
    if(!hesap) return showToast("Geçersiz hesap seçimi", "error");

    const tutarStr = prompt(`Tahsilat tutarı (${pb})\nKalan: ${fmt(kalan,pb)}\n`, String(kalan));
    if(tutarStr === null) return;
    const tutar = toNum(tutarStr);
    if(!(tutar > 0)) return showToast("Geçerli bir tutar girin", "warning");
    if(tutar > kalan && !confirm("Tutar kalan borçtan büyük. Devam edilsin mi?")) return;

    // 1) kasa hareketi
    const { error: e1 } = await supa.from('kasa_hareketler').insert({
      user_id: USER.id,
      hesap_id: hesap.id,
      cari_id: f.cari_id,
      tur: 'tahsilat',
      tutar,
      tarih: nowLocalDT(),
      aciklama: `Fatura tahsilatı: ${f.numara || f.id}`
    });
    if(e1) throw e1;

    // 2) faturada odenen güncelle
    const yeniOdenen = odenen + tutar;
    const dur = (yeniOdenen >= genelToplam) ? 'odendi' : 'kismi';
    const { error: e2 } = await supa.from('faturalar').update({
      odenen_tutar: yeniOdenen,
      odeme_durumu: dur
    }).eq('id', f.id);
    if(e2) throw e2;

    showToast("Tahsilat eklendi.", "success");
    await fetchAll();
    // modalı yenile
    await window.openFaturaDetayModal(f.id);
    // dashboard yenile
    renderDash();
  }catch(e){
    console.error(e);
    showToast(e?.message || "Tahsilat eklenemedi", "error");
  }
};

// Basic HTML escape for modal meta
function escapeHtml(str){
  return String(str ?? '').replace(/[&<>"']/g, (m)=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[m]));
}

