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

let CARILER=[], URUNLER=[], HESAPLAR=[], HAREKETLER=[], GG=[], FATURALAR=[], TUM_KALEMLER=[], STOK_LOGS=[], SYSTEM_LOGS=[];
let FATURA_SATIRLAR=[];

// Ürün listesi arama/sıralama
let URUN_ARAMA = '';
let URUN_SORT = 'ad-asc';
let URUN_TITLE_COLOR = localStorage.getItem('urunTitleColor') || '#f8fafc';
let URUN_TITLE_SIZE = localStorage.getItem('urunTitleSize') || '18';

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
const nowLocalDTWithSeconds = ()=>{
  const d=new Date();
  d.setMinutes(d.getMinutes()-d.getTimezoneOffset());
  return d.toISOString().slice(0,19);
};
function parseAppDate(value){
  if(value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  const raw = String(value || '').trim();
  if(!raw) return null;

  if(/[zZ]$|[+-]\d{2}:\d{2}$/.test(raw)){
    const d = new Date(raw);
    return Number.isFinite(d.getTime()) ? d : null;
  }

  const tr = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if(tr){
    const d = new Date(
      Number(tr[3]),
      Number(tr[2]) - 1,
      Number(tr[1]),
      Number(tr[4] || 0),
      Number(tr[5] || 0),
      Number(tr[6] || 0)
    );
    return Number.isFinite(d.getTime()) ? d : null;
  }

  const isoLocal = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if(isoLocal){
    const d = new Date(
      Number(isoLocal[1]),
      Number(isoLocal[2]) - 1,
      Number(isoLocal[3]),
      Number(isoLocal[4] || 0),
      Number(isoLocal[5] || 0),
      Number(isoLocal[6] || 0)
    );
    return Number.isFinite(d.getTime()) ? d : null;
  }

  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d : null;
}

function appDateMs(value){
  const d = parseAppDate(value);
  return d ? d.getTime() : NaN;
}

function filterStartMs(value){
  const ms = appDateMs(value);
  return Number.isFinite(ms) ? ms : null;
}

function filterEndMs(value){
  const d = parseAppDate(value);
  if(!d) return null;
  const raw = String(value || '');
  if(/^\d{4}-\d{2}-\d{2}$/.test(raw)) d.setHours(23,59,59,999);
  else d.setSeconds(59,999);
  return d.getTime();
}

const getSortTimestamp = (v, fallback = '')=>{
  const primary = appDateMs(v);
  if(Number.isFinite(primary)) return primary;
  const secondary = appDateMs(fallback);
  if(Number.isFinite(secondary)) return secondary;
  return 0;
};
const compareByNewest = (a, b)=>{
  const diff = getSortTimestamp(b?.tarih || b?.date, b?.created_at) - getSortTimestamp(a?.tarih || a?.date, a?.created_at);
  if(diff !== 0) return diff;
  const bId = String(b?.id || '').localeCompare(String(a?.id || ''), 'tr', { numeric: true, sensitivity: 'base' });
  if(bId !== 0) return bId;
  return String(b?.numara || '').localeCompare(String(a?.numara || ''), 'tr', { numeric: true, sensitivity: 'base' });
};

function ymd(dateStrOrDate){
  const d = parseAppDate(dateStrOrDate);
  if(!d) return String(dateStrOrDate || '').slice(0,10);
  const pad = (n)=> String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
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
  const d = parseAppDate(dt);
  if(!d) return String(dt||'');
  const pad = (n)=> String(n).padStart(2,'0');
  return `${pad(d.getDate())}.${pad(d.getMonth()+1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}


// Tarih formatı: GG.AA.YYYY SS:DD (madde 1)
const formatTRDateTime = (v)=>{
  if(!v) return "";
  try{
    const d = parseAppDate(v);
    if(!d) return String(v);
    const pad=(n)=> String(n).padStart(2,'0');
    const dd=pad(d.getDate()), mm=pad(d.getMonth()+1), yy=d.getFullYear();
    const hh=pad(d.getHours()), mi=pad(d.getMinutes());
    return `${dd}.${mm}.${yy} ${hh}:${mi}`;
  }catch(e){
    return String(v);
  }
};

function toDateTimeInputValue(v){
  if(!v) return nowLocalDT();
  const d = parseAppDate(v);
  if(!d) return String(v).trim().replace(" ", "T").slice(0,16);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0,16);
}


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
  localStorage.setItem('pexuraViewMode', mode);
  if (mode === 'mobile') { document.body.classList.add('force-mobile'); document.body.classList.remove('force-desktop'); showToast("Mobil görünüm aktif.", "info"); } 
  else { document.body.classList.add('force-desktop'); document.body.classList.remove('force-mobile'); showToast("PC görünümü aktif.", "info"); }
  updateFab(document.querySelector('.navbtn.active')?.dataset.tab || 'dash');
}

/* =========================================================
   MOBILE UX: FAB (Floating Action Button)
========================================================= */
function isMobileUI(){
  return document.body.classList.contains('force-mobile') || window.matchMedia('(max-width: 768px)').matches;
}

function focusIfExists(id){
  const el = document.getElementById(id);
  if(!el) return false;
  el.focus({ preventScroll:false });
  return true;
}

function updateFab(tab){
  const fab = document.getElementById('fab');
  if(!fab) return;

  if(!isMobileUI() || !USER){
    fab.classList.add('hide');
    return;
  }

  const map = {
    faturalar: { text: '+', title: 'Yeni Fatura', action: ()=>{ window.scrollTo({top:0, behavior:'smooth'}); setTimeout(()=> focusIfExists('fCariSearch') || focusIfExists('fNo'), 250); } },
    cariler:   { text: '+', title: 'Yeni Cari',   action: ()=>{ window.scrollTo({top:0, behavior:'smooth'}); setTimeout(()=> focusIfExists('cariAd'), 250); } },
    urunler:   { text: '+', title: 'Yeni Ürün',   action: ()=>{ window.scrollTo({top:0, behavior:'smooth'}); setTimeout(()=> focusIfExists('uAd'), 250); } },
    kasa:      { text: '+', title: 'Yeni İşlem',  action: ()=>{ window.scrollTo({top:0, behavior:'smooth'}); setTimeout(()=> focusIfExists('kTutar') || focusIfExists('hAd'), 250); } },
    gelirgider:{ text: '+', title: 'Yeni Kayıt',  action: ()=>{ window.scrollTo({top:0, behavior:'smooth'}); setTimeout(()=> focusIfExists('ggKat') || focusIfExists('ggTutar'), 250); } },
  };

  const conf = map[tab];
  if(!conf){
    fab.classList.add('hide');
    return;
  }

  fab.textContent = conf.text;
  fab.title = conf.title;
  fab.setAttribute('aria-label', conf.title);
  fab.onclick = conf.action;
  fab.classList.remove('hide');
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

function getUrunById(urunId){
  return (URUNLER||[]).find(u => String(u.id) === String(urunId));
}

function getGroupedSaleMiktarlari(satirlar){
  const map = new Map();
  (satirlar||[]).forEach(s=>{
    const id = String(s.urun_id);
    map.set(id, toNum(map.get(id)) + toNum(s.miktar));
  });
  return map;
}

function validateSaleStock(satirlar, extraAvailable = {}){
  const grouped = getGroupedSaleMiktarlari(satirlar);
  for(const [urunId, miktar] of grouped.entries()){
    const urun = getUrunById(urunId);
    const mevcut = toNum(urun?.stok_miktar) + toNum(extraAvailable[urunId]);
    if(miktar > mevcut){
      showToast(`Stok yetersiz! ${urun?.ad || 'Ürün'} için mevcut: ${mevcut}, istenen: ${miktar}`, "error");
      return false;
    }
  }
  return true;
}

async function applyStockChange(urunId, degisim, meta={}){
  try{
    const urun = getUrunById(urunId);
    const cur = Number(urun?.stok_miktar||0);
    const yeniStokKontrol = cur + Number(degisim||0);
    if(yeniStokKontrol < 0){
      showToast(`Stok eksiye düşemez! ${urun?.ad || 'Ürün'} mevcut: ${cur}`, "error");
      return false;
    }

    // önce RPC dene
    const { error } = await supa.rpc("stok_guncelle", { p_urun_id: urunId, p_degisim: degisim });
    if(error){
      console.warn("stok_guncelle RPC çalışmadı, direkt update:", error);
      const res2 = await supa.from("urunler").update({ stok_miktar: yeniStokKontrol }).eq("id", urunId);
      if(res2.error) throw res2.error;
    }

    if(urun) urun.stok_miktar = yeniStokKontrol;

    // stok hareket logu
    await logStockMove({urunId, degisim, ...meta});

    // kritik stok bildirimi (madde 12)
    if(urun && yeniStokKontrol <= Number(urun.min_stok||0)){
      showToast(`"${urun.ad}" kritik stok seviyesinde: ${yeniStokKontrol}`, "warning");
    }
    return true;

  } catch(e){
    console.error("Stok güncelleme hatası:", e);
    showToast("Stok güncellenemedi: " + (e?.message||e), "error");
    return false;
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
async function forgotPassword(){
  showToast("Mail sıfırlama kapatıldı. Giriş yapamıyorsanız şifre Supabase panelinden yönetici tarafından değiştirilmelidir.", "warning");
}
const SECURITY_QUESTIONS = [
  "Doğduğun şehir?",
  "İlk okul öğretmeninin adı?",
  "İlk evcil hayvanının adı?",
  "Çocukluk lakabın?"
];
let ACTIVE_SECURITY_QUESTION_INDEX = 0;

function normalizeSecurityAnswer(v){
  return String(v || '').trim().toLocaleLowerCase('tr-TR');
}
async function hashSecurityAnswer(v){
  const data = new TextEncoder().encode(normalizeSecurityAnswer(v));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}
function getSecurityAnswers(){
  return USER?.user_metadata?.security_answers || [];
}
function hasSecurityAnswers(){
  const answers = getSecurityAnswers();
  return Array.isArray(answers) && SECURITY_QUESTIONS.every((_, i) => !!answers[i]);
}
function toggleSecuritySetup(show){
  const box = document.getElementById('securitySetupBox');
  if(!box) return;
  box.classList.toggle('hide', !show);
  if(show) document.getElementById('secAnswer0')?.focus();
  else SECURITY_QUESTIONS.forEach((_, i) => { const el = document.getElementById(`secAnswer${i}`); if(el) el.value = ''; });
}
async function saveSecurityAnswers(){
  if(!USER) return showToast("Önce giriş yapın.", "warning");
  const rawAnswers = SECURITY_QUESTIONS.map((_, i) => document.getElementById(`secAnswer${i}`)?.value || '');
  if(rawAnswers.some(a => normalizeSecurityAnswer(a).length < 2)){
    return showToast("Tüm gizli soru cevaplarını doldurun.", "warning");
  }

  const security_answers = [];
  for(const answer of rawAnswers){
    security_answers.push(await hashSecurityAnswer(answer));
  }

  const { data, error } = await supa.auth.updateUser({
    data: { ...(USER.user_metadata || {}), security_answers }
  });
  if(error) return showToast(error.message, "error");

  USER = data.user;
  toggleSecuritySetup(false);
  showToast("Gizli soru cevapları kaydedildi.", "success");
}
function startPasswordChange(){
  if(!USER) return showToast("Önce giriş yapın.", "warning");
  if(!hasSecurityAnswers()){
    showToast("Önce 4 gizli soru cevabını kaydedin.", "warning");
    toggleSecuritySetup(true);
    return;
  }

  ACTIVE_SECURITY_QUESTION_INDEX = Math.floor(Math.random() * SECURITY_QUESTIONS.length);
  const q = document.getElementById('changeSecurityQuestion');
  const a = document.getElementById('changeSecurityAnswer');
  if(q) q.textContent = SECURITY_QUESTIONS[ACTIVE_SECURITY_QUESTION_INDEX];
  if(a) a.value = '';
  toggleSecuritySetup(false);
  toggleChangePassword(true);
}
function toggleChangePassword(show){
  const box = document.getElementById('changePassBox');
  if(!box) return;
  box.classList.toggle('hide', !show);
  if(show){
    document.getElementById('changeSecurityAnswer')?.focus();
  } else {
    const answer = document.getElementById('changeSecurityAnswer');
    const pass1 = document.getElementById('newAuthPass');
    const pass2 = document.getElementById('newAuthPass2');
    if(answer) answer.value = '';
    if(pass1) pass1.value = '';
    if(pass2) pass2.value = '';
  }
}
async function changePassword(){
  if(!USER) return showToast("Şifre değiştirmek için önce giriş yapın.", "warning");

  const pass1 = document.getElementById('newAuthPass')?.value.trim() || '';
  const pass2 = document.getElementById('newAuthPass2')?.value.trim() || '';
  const answer = document.getElementById('changeSecurityAnswer')?.value || '';
  const answers = getSecurityAnswers();

  if(!hasSecurityAnswers()) return showToast("Gizli sorular ayarlanmadan şifre değiştirilemez.", "warning");
  if(await hashSecurityAnswer(answer) !== answers[ACTIVE_SECURITY_QUESTION_INDEX]){
    return showToast("Gizli soru cevabı yanlış.", "error");
  }
  if(pass1.length < 6) return showToast("Yeni şifre en az 6 karakter olmalı.", "warning");
  if(pass1 !== pass2) return showToast("Şifreler aynı değil.", "warning");

  const { error } = await supa.auth.updateUser({ password: pass1 });
  if(error) return showToast(error.message, "error");

  toggleChangePassword(false);
  showToast("Şifre başarıyla değiştirildi.", "success");
}

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
  const adminTabs = ['dash', 'cariler', 'faturalar', 'kasa', 'gelirgider','gecmis','notlar'];
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
document.getElementById('btnForgotPass')?.addEventListener('click', forgotPassword);
document.getElementById('btnShowChangePass')?.addEventListener('click', startPasswordChange);
document.getElementById('btnSecuritySetup')?.addEventListener('click', ()=>{ toggleChangePassword(false); toggleSecuritySetup(true); });
document.getElementById('btnSaveSecurityAnswers')?.addEventListener('click', saveSecurityAnswers);
document.getElementById('btnCancelSecuritySetup')?.addEventListener('click', ()=> toggleSecuritySetup(false));
document.getElementById('btnCancelChangePass')?.addEventListener('click', ()=> toggleChangePassword(false));
document.getElementById('btnChangePass')?.addEventListener('click', changePassword);

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
      fetchFaturalar(),
      fetchStokLoglari(),
      fetchSystemLogs()
    ]);
    await fetchTumKalemler();
  }
  fillSelects();
  generateMissingZReports();
  renderAll();
  runStartupAlerts(); // madde 12
}

async function fetchTumKalemler() {
  const { data } = await supa.from('fatura_kalemler').select('*');
  TUM_KALEMLER = data || [];
}

async function fetchStokLoglari(){
  try{
    const { data, error } = await supa.from('stok_hareketleri').select('*').order('tarih',{ascending:false});
    if(error) throw error;
    STOK_LOGS = data || [];
  }catch(e){
    STOK_LOGS = [];
    console.warn('stok_hareketleri okunamadi:', e?.message || e);
  }
}

async function fetchSystemLogs(){
  try{
    const { data, error } = await supa.from('system_logs').select('*').order('created_at',{ascending:false});
    if(error) throw error;
    SYSTEM_LOGS = data || [];
  }catch(e){
    SYSTEM_LOGS = [];
    console.warn('system_logs okunamadi:', e?.message || e);
  }
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
    const sorted = satislar.slice().sort((a,b)=>appDateMs(a.tarih)-appDateMs(b.tarih));
    for(const f of sorted){
      let tut = toNum(f.genel_toplam);
      if(kalanOdeme>0){
        const use = Math.min(kalanOdeme, tut);
        tut -= use;
        kalanOdeme -= use;
      }
      if(tut<=0) continue;

      const gun = Math.floor((Date.now() - appDateMs(f.tarih))/86400000);
      if(gun<=30) buckets.b0_30 += tut;
      else if(gun<=60) buckets.b31_60 += tut;
      else buckets.b61p += tut;
    }
  });

  return buckets;
}

function getCariOverdueInfo(c, curr = null, limitDays = 15){
  if(!c) return { overdue:false, days:0, amount:0, currency:curr || '' };
  const currencies = curr ? [curr] : Array.from(new Set([
    ...FATURALAR.filter(f => f.cari_id == c.id).map(f => f.para_birimi || 'TL'),
    ...HESAPLAR.map(h => h.para_birimi || 'TL'),
    'TL'
  ]));
  const hesapPB = new Map((HESAPLAR || []).map(h => [String(h.id), h.para_birimi || 'TL']));
  let worst = { overdue:false, days:0, amount:0, currency:curr || '' };

  currencies.forEach(pb => {
    const satislar = FATURALAR
      .filter(f => f.cari_id == c.id && normalizeTip(f.tip) === 'satis' && (f.para_birimi || 'TL') === pb)
      .slice()
      .sort((a,b)=> appDateMs(a.tarih) - appDateMs(b.tarih));
    if(!satislar.length && pb !== 'TL') return;

    const iadeTop = FATURALAR
      .filter(f => f.cari_id == c.id && normalizeTip(f.tip) === 'iade' && (f.para_birimi || 'TL') === pb)
      .reduce((sum,f)=> sum + toNum(f.genel_toplam), 0);
    const tahsilatTop = HAREKETLER
      .filter(h => h.cari_id == c.id && h.tur === 'tahsilat' && (hesapPB.get(String(h.hesap_id)) || h.para_birimi || 'TL') === pb)
      .reduce((sum,h)=> sum + toNum(h.tutar), 0);
    const acilisAlacak = pb === 'TL' ? toNum(c.acilis_alacak) : 0;
    const acilisBorc = pb === 'TL' ? toNum(c.acilis_borc) : 0;
    let kalanOdeme = tahsilatTop + iadeTop + acilisAlacak;

    if(acilisBorc > 0){
      const acilisTarih = c.created_at || c.tarih || new Date(0).toISOString();
      satislar.unshift({ tarih: acilisTarih, genel_toplam: acilisBorc, para_birimi: pb, tip: 'satis' });
    }

    for(const f of satislar){
      let kalan = toNum(f.genel_toplam);
      if(kalanOdeme > 0){
        const used = Math.min(kalanOdeme, kalan);
        kalan -= used;
        kalanOdeme -= used;
      }
      if(kalan <= 0) continue;
      const days = Math.floor((Date.now() - appDateMs(f.tarih)) / 86400000);
      if(days > limitDays && days > worst.days){
        worst = { overdue:true, days, amount:kalan, currency:pb };
      }
    }
  });

  return worst;
}

function overdueStarHtml(c, curr = null){
  const info = getCariOverdueInfo(c, curr, 15);
  if(!info.overdue) return '';
  return `<span class="overdue-star" title="15 gunden eski odenmemis borc: ${fmt(info.amount, info.currency)} (${info.days} gun)">★</span>`;
}

// Dashboard: Satış & Kâr işlem listesi (Fatura Bazlı) - compact + infinite scroll
function renderDashSatisKarListesi(curr='USD'){
  const tbody = document.getElementById('dashSatisKarListe');
  const scroller = document.getElementById('dashSatisKarScroll');
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
    .sort((a,b)=> appDateMs(b.tarih) - appDateMs(a.tarih));

  // Toplamları tüm kayıtlar üzerinden hesapla (liste kaç satır yüklense de aynı kalsın)
  let topSatis = 0;
  let topKar = 0;
  for(const f of satisFaturalar){
    const kalemler = kalemByFatura.get(f.id) || [];
    for(const fk of kalemler){
      const miktar = toNum(fk.miktar);
      const bf = toNum(fk.birim_fiyat);
      const alisSnap = toNum(fk.alis_fiyat_snapshot);
      topSatis += miktar * bf;
      topKar += (miktar * bf) - (miktar * alisSnap);
    }
  }
  elTopSatis.textContent = fmt(topSatis, curr);
  elTopKar.textContent = fmt(topKar, curr);
  if(elTopKarYuzde){
    const pct = topSatis > 0 ? (topKar / topSatis) * 100 : 0;
    elTopKarYuzde.textContent = pct.toFixed(2) + '%';
  }

  // Infinite scroll: ilk 5, sonra aşağı kaydırdıkça ekle
  const INITIAL = 5;
  const PAGE = 15;

  tbody.innerHTML = '';
  let loaded = 0;

  function appendRows(count){
    const slice = satisFaturalar.slice(loaded, loaded + count);
    for(const f of slice){
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

      const cari = cariById.get(f.cari_id);
      const musteri = (cari && (cari.ad || cari.unvan || cari.isim || cari.name)) || '-';
      const karYuzde = satis > 0 ? (kar / satis) * 100 : 0;

      const tr = document.createElement('tr');
      tr.style.cursor = 'pointer';
      tr.onclick = ()=> openFaturaDetayModal(f.id);

      tr.innerHTML = `
        <td data-label="Tarih">${formatTRDateTime(f.tarih)}</td>
        <td data-label="Fatura / Müşteri">
          ${f.numara || '-'}<br>
          <small style="opacity:.75;">
            <a href="javascript:void(0)" onclick="event.stopPropagation(); openEkstre('${f.cari_id}')" style="color:#60a5fa; text-decoration:none;">
              ${musteri}
            </a>
          </small>
        </td>
        <td data-label="Satış" style="text-align:right;">${fmt(satis, curr)}</td>
        <td data-label="Kâr" style="text-align:right; font-weight:700; color:${kar>=0?'#4ade80':'#ef4444'};">${fmt(kar, curr)}</td>
        <td data-label="Kâr %" style="text-align:right;">${karYuzde.toFixed(2)}%</td>
      `;
      tbody.appendChild(tr);
    }
    loaded += slice.length;
  }

  // reset scroll position
  if(scroller){ scroller.scrollTop = 0; }

  appendRows(INITIAL);

  // bağla (her render'da güncelle)
  const target = scroller || tbody.parentElement;
  if(target){
    target.onscroll = () => {
      const nearBottom = (target.scrollTop + target.clientHeight) >= (target.scrollHeight - 40);
      if(nearBottom && loaded < satisFaturalar.length){
        appendRows(PAGE);
      }
    };
  }
}


function renderDash(){
  const currElem = document.getElementById('dashCurrencySelect');
  const curr = currElem ? currElem.value : 'USD';

  const filteredUrun = URUNLER.filter(u => u.para_birimi === curr);
  let totalStockVal = 0;
  let totalCostVal = 0;
  filteredUrun.forEach(u => {
    totalStockVal += (Number(u.stok_miktar) || 0) * (Number(u.satis_fiyat) || 0);
    totalCostVal += (Number(u.stok_miktar) || 0) * (Number(u.alis_fiyat) || 0);
  });
  document.getElementById('dashStokDeger').innerHTML =
    `<span style="font-size:0.6em; color:#94a3b8">${filteredUrun.length} Çeşit</span><br>${fmt(totalStockVal, curr)}`;
  document.getElementById('dashUrunMaliyet').innerHTML =
    `<span style="font-size:0.6em; color:#94a3b8">${filteredUrun.length} Çeşit</span><br>${fmt(totalCostVal, curr)}`;

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
      kritikListe.innerHTML += `<tr><td data-label="Ürün">${u.ad}</td><td data-label="Mevcut"><span style="color:red;font-weight:bold">${u.stok_miktar}</span></td><td data-label="Min">${u.min_stok}</td></tr>`;
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
  combinedMoves.sort((a,b) => appDateMs(b.tarih) - appDateMs(a.tarih));
  const sonHareketler = document.getElementById('dashSonHareketler');
  sonHareketler.innerHTML = "";
  combinedMoves.slice(0, 5).forEach(m => {
    sonHareketler.innerHTML += `<tr><td data-label="Tarih">${formatTRDateTime(m.tarih)}</td><td data-label="Tür"><span class="tag">${m.tur}</span></td><td data-label="Tutar">${Number(m.tutar).toLocaleString('tr-TR')} ${m.pb === 'TL' ? '₺' : (m.pb==='EUR'?'€':'$')}</td></tr>`;
  });

  // Son Ödemeler
  const dashOdemeler = document.getElementById("dashOdemeler");
  if(dashOdemeler){
    dashOdemeler.innerHTML="";
    HAREKETLER
      .filter(h => h.tur==='tahsilat')
      .sort((a,b) => appDateMs(b.tarih) - appDateMs(a.tarih))
      .slice(0,10)
      .forEach(h=>{
        const cari = CARILER.find(c=>c.id==h.cari_id);
        dashOdemeler.innerHTML += `<tr><td data-label="Tarih">${formatTRDateTime(h.tarih)}</td><td data-label="Müşteri">${cari?.ad||'-'}</td><td data-label="Tutar">${fmt(h.tutar, HESAPLAR.find(x=>x.id==h.hesap_id)?.para_birimi||'USD')}</td></tr>`;
      });

    if(!dashOdemeler.innerHTML.trim()) {
      dashOdemeler.innerHTML = `<tr><td colspan="3" class="muted">Henüz tahsilat yok.</td></tr>`;
    }
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

  const eAS = document.getElementById('dashBuAySatis');
  const eAG = document.getElementById('dashBuAyGider');
  const eAK = document.getElementById('dashBuAyNetKar');
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
  const tList = document.getElementById('dashEnBorclu');
  if(tList){
    tList.innerHTML = topBorclu.length
      ? topBorclu.map(x=> {
          const cari = (CARILER||[]).find(c=>c.id==x.id) || {};
          return `<tr><td data-label="Cari">${overdueStarHtml(cari, curr)} ${x.ad || '-'}</td><td data-label="Bakiye" style="text-align:right; font-weight:700; color:#f87171;">${fmt(x.bakiye, curr)}</td><td data-label="Telefon">${cari.tel || '-'}</td></tr>`;
        }).join('')
      : `<tr><td colspan="3" class="muted">Borçlu cari bulunamadı.</td></tr>`;
  }

  // Son Satışlar
  const dashSonSatislar = document.getElementById("dashSonSatislar");
  if(dashSonSatislar){
    dashSonSatislar.innerHTML="";
    FATURALAR
      .filter(f => normalizeTip(f.tip)==='satis')
      .sort((a,b) => appDateMs(b.tarih) - appDateMs(a.tarih))
      .slice(0,10)
      .forEach(f=>{
        const cari = CARILER.find(c=>c.id==f.cari_id);
        dashSonSatislar.innerHTML += `<tr><td data-label="Tarih">${formatTRDateTime(f.tarih)}</td><td data-label="Müşteri">${cari?.ad||'-'}</td><td data-label="Tutar">${fmt(f.genel_toplam,f.para_birimi)}</td></tr>`;
      });

    if(!dashSonSatislar.innerHTML.trim()) {
      dashSonSatislar.innerHTML = `<tr><td colspan="3" class="muted">Henüz satış yok.</td></tr>`;
    }
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

    if(false && ag.b61p>0){
      showToast(`60+ gün gecikmiş toplam borç: ${fmt(ag.b61p,curr)}`, "warning");
    }
  }

  renderCalculationAudit();
  renderLatestZReport();
}

const dSel = document.getElementById('dashCurrencySelect');
if(dSel) dSel.onchange = renderDash;

/* =========================================================
   ACTIONS & PDF
========================================================= */
async function logAction(tableName, actionType, recordId, oldData = null) {
  if(!USER) return;
  try{
    await supa.from('system_logs').insert({
      user_id: USER.id,
      table_name: tableName,
      action_type: actionType,
      record_id: recordId,
      old_data: oldData
    });
  }catch(e){
    console.warn('system_logs yazilamadi:', e?.message || e);
  }
}

function trFix(text) {
  // PDFlerde Türkçe karakterleri bozma; font destekliyor.
  return safePdfText(text);
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
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });

    const { data: kalemler } = await supa
      .from('fatura_kalemler')
      .select('*')
      .eq('fatura_id', fatura.id);

    const { data: cari } = await supa
      .from('cariler')
      .select('ad, tel, acilis_borc, acilis_alacak')
      .eq('id', fatura.cari_id)
      .single();

    const cariAd = (cari?.ad || 'Bilinmiyor');
    const cariTel = (cari?.tel || '');
    const pb = (fatura.para_birimi || 'TL');
    const araToplam = toNum(fatura.ara_toplam) || (kalemler || []).reduce((a, k) => a + (toNum(k.miktar) * toNum(k.birim_fiyat)), 0);
    const kdvToplam = toNum(fatura.kdv_toplam) || 0;
    const genelToplam = toNum(fatura.genel_toplam) || (araToplam + kdvToplam);
    const odenen = toNum(fatura.odenen_tutar) || 0;
    const kalan = Math.max(0, genelToplam - odenen);

    let guncelBorc = 0;
    try {
      const { data: cariFaturalar } = await supa
        .from('faturalar')
        .select('tip, genel_toplam, para_birimi, odenen_tutar')
        .eq('cari_id', fatura.cari_id)
        .eq('para_birimi', pb);

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

      (cariFaturalar || []).forEach(ff => {
        const tip = normalizeTip(ff.tip);
        const ffKalan = Math.max(0, toNum(ff.genel_toplam) - toNum(ff.odenen_tutar));
        if (tip === 'satis') borc += ffKalan;
        if (tip === 'iade') alacak += ffKalan;
      });

      (hareketler || []).forEach(h => {
        const hpb = hesapPB.get(String(h.hesap_id)) || null;
        if (hpb && hpb !== pb) return;
        if (h.tur === 'tahsilat') alacak += toNum(h.tutar);
        if (h.tur === 'odeme') borc += toNum(h.tutar);
      });

      borc += toNum(cari?.acilis_borc);
      alacak += toNum(cari?.acilis_alacak);
      guncelBorc = borc - alacak;
    } catch (e) {
      if (typeof hesaplaBakiye === 'function') guncelBorc = hesaplaBakiye(fatura.cari_id);
    }

    const belgeBaslik = normalizeTip(fatura.tip) === 'satis' ? 'Satış Faturası' : 'İade Faturası';
    const pdfTarih = formatDateTR(fatura.tarih);

    addPexuraPdfBranding(doc, {
      title: belgeBaslik,
      subtitle: `Belge No: ${fatura.numara || fatura.id}`,
      footerLeft: `PEXURA TECH • Cari: ${safePdfText(cariAd)}`,
      footerRight: `Tarih: ${pdfTarih}`
    });

    doc.setTextColor(15, 23, 42);
    applyPdfFont(doc, 'bold');
    doc.setFontSize(15);
    doc.text(`${belgeBaslik} - ${fatura.numara || ''}`, 40, 62);

    doc.setDrawColor(203, 213, 225);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(40, 76, 515, 54, 10, 10, 'FD');
    applyPdfFont(doc, 'bold');
    doc.setFontSize(10);
    doc.text(`Müşteri: ${safePdfText(cariAd)}`, 58, 96);
    doc.text(`Telefon: ${safePdfText(cariTel || '-')}`, 336, 96);
    applyPdfFont(doc, 'normal');
    doc.text(`Tarih: ${pdfTarih}`, 58, 112);
    doc.text(`Para Birimi: ${pb}`, 336, 112);

    const tableData = (kalemler || []).map(k => [
      safePdfText(k.urun_ad_snapshot || 'Silinmiş Ürün'),
      String(k.miktar || 0),
      fmt(k.birim_fiyat, pb),
      fmt(k.satir_tutar, pb)
    ]);

    doc.autoTable({
      ...pdfAutoTableDefaults(9.5),
      startY: 140,
      tableWidth: 515,
      head: [['Ürün', 'Miktar', 'Birim Fiyat', 'Tutar']],
      body: tableData,
      columnStyles: {
        0: { cellWidth: 245 },
        1: { cellWidth: 70, halign: 'center' },
        2: { cellWidth: 100, halign: 'right' },
        3: { cellWidth: 100, halign: 'right' }
      }
    });

    const afterTableY = doc.lastAutoTable?.finalY || 170;
    const summaryY = afterTableY + 12;
    const summaryX = 314;
    const summaryW = 241;
    const summaryH = 90;

    doc.setDrawColor(203, 213, 225);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(summaryX, summaryY, summaryW, summaryH, 10, 10, 'FD');
    applyPdfFont(doc, 'bold');
    doc.setFontSize(9.8);
    doc.setTextColor(30, 41, 59);
    doc.text('Ara Toplam:', summaryX + 18, summaryY + 18);
    doc.text('KDV Toplam:', summaryX + 18, summaryY + 36);
    doc.text('Genel Toplam:', summaryX + 18, summaryY + 54);
    doc.text('Ödenen:', summaryX + 18, summaryY + 72);
    doc.text('Kalan:', summaryX + 18, summaryY + 90);
    applyPdfFont(doc, 'normal');
    doc.text(fmt(araToplam, pb), summaryX + summaryW - 18, summaryY + 18, { align: 'right' });
    doc.text(fmt(kdvToplam, pb), summaryX + summaryW - 18, summaryY + 36, { align: 'right' });
    doc.text(fmt(genelToplam, pb), summaryX + summaryW - 18, summaryY + 54, { align: 'right' });
    doc.text(fmt(odenen, pb), summaryX + summaryW - 18, summaryY + 72, { align: 'right' });
    doc.text(fmt(kalan, pb), summaryX + summaryW - 18, summaryY + 90, { align: 'right' });

    drawPdfNoteBox(doc, getTahsilatPdfNoteLines(), summaryY + summaryH + 14, {
      x: 40,
      w: 515,
      title: 'Notlar',
      minHeight: 136,
      titleSize: 11,
      textSize: 9.6,
      lineHeight: 12,
      paddingX: 16,
      titleY: 18,
      textY: 38
    });

    drawPdfSignature(doc, { signer: 'PEXURA TECH', title: 'Yetkili İmza', x: 430, y: 740 });

    const fileName = `Pexura_Fatura_${fatura.numara || fatura.id}.pdf`;
    doc.save(fileName);
    addPdfHistory(fatura);

    if (mode === 'whatsapp') {
      if (cariTel) {
        const cleanPhone = cleanPhoneTR(cariTel);
        window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent('Sayın ' + cariAd + ', faturanız ektedir.')}`, '_blank');
      } else {
        showToast('Müşteri telefonu yok.', 'warning');
      }
    }
  } catch (err) {
    console.error(err);
    showToast('PDF Hatası: ' + (err?.message || err), 'error');
  }
}

/* =========================================================
   TIP NORMALIZE
========================================================= */
function normalizeTip(tip){
  if(tip === "alis") return "iade";
  return tip;
}


function drawPexuraLogo(doc, x, y) {
  doc.setFillColor(37, 99, 235);
  doc.roundedRect(x - 8, y - 10, 18, 20, 6, 6, 'F');
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(x - 2, y - 6.5, 5.2, 13, 2.4, 2.4, 'F');
  doc.circle(x + 3.2, y - 3.6, 4.8, 'F');
  doc.setFillColor(37, 99, 235);
  doc.circle(x + 4, y - 3.6, 2.2, 'F');
  doc.roundedRect(x + 0.6, y + 0.8, 3.2, 5.6, 1.6, 1.6, 'F');
}


function drawPdfInfoRows(doc, rows, opts = {}) {
  const labelX = opts.labelX || 40;
  const valueX = opts.valueX || 180;
  const startY = opts.startY || 70;
  const rowGap = opts.rowGap || 18;
  const labelWidth = opts.labelWidth || 105;
  const valueWidth = opts.valueWidth || 310;
  const lineH = opts.lineH || 12;
  let y = startY;

  rows.forEach(([label, value]) => {
    const labelText = `${safePdfText(label)}:`;
    const valueText = safePdfText(value);
    const labelLines = doc.splitTextToSize(labelText, labelWidth);
    const valueLines = doc.splitTextToSize(valueText, valueWidth);
    const blockLines = Math.max(labelLines.length, valueLines.length);

    applyPdfFont(doc, 'bold');
    doc.setTextColor(30, 41, 59);
    if (doc.setCharSpace) doc.setCharSpace(0);
    doc.text(labelLines, labelX, y, { lineHeightFactor: 1.15 });

    applyPdfFont(doc, 'normal');
    doc.setTextColor(15, 23, 42);
    if (doc.setCharSpace) doc.setCharSpace(0);
    doc.text(valueLines, valueX, y, { lineHeightFactor: 1.15 });

    y += Math.max(rowGap, blockLines * lineH + 6);
  });

  return y;
}

function getTahsilatPdfNoteLines() {
  return [
    'Alisverisimiz Sadece Kredi Karti ve Nakit Iledir.',
    "Odemeleri Lutfen Asagidaki IBAN'a Gonderiniz.",
    'Gonderdikten Sonra Bilgi Vermeyi Unutmayiniz.',
    '',
    'Hasan Atasoy',
    'TR17 0001 0004 8893 2779 6550 01',
    'Ziraat Bankasi'
  ];
}

function measurePdfNoteBox(doc, text, opts = {}) {
  const x = opts.x || 40;
  const w = opts.w || 515;
  const paddingX = opts.paddingX || 14;
  const textY = opts.textY || 42;
  const lineHeight = opts.lineHeight || 13.2;
  const rawLines = Array.isArray(text) ? text : [safePdfText(text)];
  const lines = [];
  rawLines.forEach(line => {
    const normalized = String(line || '');
    if (!normalized) {
      lines.push('');
    } else {
      lines.push(...doc.splitTextToSize(normalized, w - (paddingX * 2)));
    }
  });
  const height = Math.max(opts.minHeight || 138, textY + lines.length * lineHeight + 12);
  return { x, w, lines, height };
}

function drawPdfNoteBox(doc, text, y, opts = {}) {
  const metrics = measurePdfNoteBox(doc, text, opts);
  const x = metrics.x;
  const w = metrics.w;
  const lines = metrics.lines;
  const h = metrics.height;
  const title = opts.title || 'Notlar';
  const paddingX = opts.paddingX || 14;
  const titleY = opts.titleY || 20;
  const textY = opts.textY || 42;
  const titleSize = opts.titleSize || 11.5;
  const textSize = opts.textSize || 10.5;

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(x, y, w, h, 8, 8, 'FD');
  applyPdfFont(doc, 'bold');
  doc.setFontSize(titleSize);
  doc.setTextColor(15, 23, 42);
  doc.text(title, x + paddingX, y + titleY);
  applyPdfFont(doc, 'normal');
  doc.setFontSize(textSize);
  doc.setTextColor(15, 23, 42);
  doc.text(lines, x + paddingX, y + textY, { lineHeightFactor: 1.25, maxWidth: w - (paddingX * 2) });
  return y + h;
}

function drawPdfSignature(doc, opts = {}) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const x = opts.x || pageW - 180;
  const y = opts.y || pageH - 88;
  const signer = opts.signer || 'PEXURA TECH';
  const title = opts.title || 'Yetkili İmza';

  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.8);
  doc.line(x, y, x + 120, y);
  applyPdfFont(doc, 'normal');
  doc.setFontSize(13);
  doc.setTextColor(37, 99, 235);
  doc.text(signer, x + 60, y - 8, { align: 'center' });
  applyPdfFont(doc, 'bold');
  doc.setFontSize(10);
  doc.setTextColor(30, 41, 59);
  doc.text(signer, x + 60, y + 16, { align: 'center' });
  applyPdfFont(doc, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(title, x + 60, y + 30, { align: 'center' });
}

function addPexuraPdfBranding(doc, opts = {}) {
  const pageCount = doc.getNumberOfPages();
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const title = opts.title || 'BELGE';
  const subtitle = opts.subtitle || '';
  const footerLeft = opts.footerLeft || 'PEXURA TECH';
  const footerRight = opts.footerRight || `Oluşturma: ${formatTRDateTime(new Date())}`;

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(59, 130, 246);
    doc.setLineWidth(0.9);
    doc.line(20, 34, pageW - 20, 34);
    doc.line(20, pageH - 28, pageW - 20, pageH - 28);

    drawPexuraLogo(doc, 34, 19);

    doc.setTextColor(37, 99, 235);
    applyPdfFont(doc, 'bold');
    doc.setFontSize(18);
    doc.text('PEXURA TECH', 48, 24);

    doc.setTextColor(15, 23, 42);
    applyPdfFont(doc, 'bold');
    doc.setFontSize(12);
    doc.text(title, pageW - 20, 22, { align: 'right' });

    if (subtitle) {
      applyPdfFont(doc, 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(subtitle, pageW - 20, 32, { align: 'right' });
    }

    applyPdfFont(doc, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(String(footerLeft), 20, pageH - 14);
    doc.text(String(footerRight), pageW - 20, pageH - 14, { align: 'right' });
  }
}

function safePdfText(val) {
  return String(val == null ? '-' : val)
    .replace(/\s+/g, ' ')
    .trim() || '-';
}


function applyPdfFont(doc, style = 'normal') {
  try {
    if (window.ensurePdfTurkishFont) window.ensurePdfTurkishFont(doc);
    // Bazı PDF görüntüleyiciler gömülü bold fontta Türkçe karakterleri bozabiliyor.
    // Bu yüzden tüm PDFlerde aynı Türkçe destekli normal font kullanılır; vurgu renk/kalın alanla verilir.
    doc.setFont('DejaVuSans', 'normal');
  } catch (e) {
    doc.setFont('helvetica', 'normal');
  }
  if (doc.setCharSpace) doc.setCharSpace(0);
}

function pdfAutoTableDefaults(fontSize = 9) {
  return {
    theme: 'grid',
    margin: { left: 40, right: 40 },
    styles: {
      font: 'DejaVuSans',
      fontStyle: 'normal',
      fontSize,
      textColor: [15, 23, 42],
      lineColor: [226, 232, 240],
      lineWidth: 0.4,
      cellPadding: { top: 6, right: 6, bottom: 6, left: 6 },
      overflow: 'linebreak',
      valign: 'middle'
    },
    headStyles: {
      font: 'DejaVuSans',
      fontStyle: 'normal',
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      lineColor: [30, 41, 59],
      lineWidth: 0.4,
      halign: 'center'
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    didParseCell: (data) => {
      data.cell.styles.font = 'DejaVuSans';
      data.cell.styles.fontStyle = 'normal';
    }
  };
}


function toTitleCaseTr(str) {
  return String(str || '')
    .toLocaleLowerCase('tr-TR')
    .split(/\s+/)
    .map(s => s ? s.charAt(0).toLocaleUpperCase('tr-TR') + s.slice(1) : s)
    .join(' ')
    .trim();
}

function getPlainHareketAciklama(h) {
  const raw = String(h?.aciklama || '').trim();
  if (!raw) return '-';
  const notMatch = raw.match(/(?:^|•)\s*Not:\s*(.+)$/i);
  if (notMatch && notMatch[1]) return toTitleCaseTr(notMatch[1].trim());
  if (raw.includes('•')) return toTitleCaseTr(raw.split('•')[0].trim());
  return toTitleCaseTr(raw);
}

function getPdfDisplayDate(v) {
  const pad = (n) => String(n).padStart(2, '0');
  const formatTR = (dateObj) => {
    try {
      const parts = new Intl.DateTimeFormat('tr-TR', {
        timeZone: 'Europe/Istanbul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }).formatToParts(dateObj);
      const get = (type) => parts.find(p => p.type === type)?.value || '00';
      return `${get('day')}.${get('month')}.${get('year')} ${get('hour')}:${get('minute')}`;
    } catch (e) {
      return formatTRDateTime(dateObj);
    }
  };

  const now = new Date();
  if (!v) return formatTR(now);
  try {
    const s = String(v).trim().replace(' ', 'T');
    const d = new Date(s);
    if (!Number.isFinite(d.getTime())) return formatTR(now);
    const trNow = new Date();
    d.setHours(trNow.getHours(), trNow.getMinutes(), 0, 0);
    return formatTR(d);
  } catch (e) {
    return formatTR(now);
  }
}

window.downloadCariPanelKasaPdf = async (hareketId) => {
  try {
    const h = HAREKETLER.find(x => String(x.id) === String(hareketId));
    if (!h) return showToast('İşlem bulunamadı.', 'error');
    if (!window.jspdf) return showToast('PDF kütüphanesi eksik.', 'error');

    const cari = CARILER.find(c => String(c.id) === String(h.cari_id)) || {};
    const hesap = HESAPLAR.find(k => String(k.id) === String(h.hesap_id)) || {};
    const pb = hesap.para_birimi || 'USD';
    const tutar = toNum(h.tutar);
    const mevcutBakiye = hesaplaBakiye(h.cari_id);
    const oncekiBorc = h.tur === 'tahsilat' ? mevcutBakiye + tutar : mevcutBakiye - tutar;
    const belgeTipi = h.tur === 'tahsilat' ? 'Tahsilat Makbuzu' : 'Ödeme Makbuzu';
    const pdfTarih = getPdfDisplayDate(h.tarih || new Date());

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    addPexuraPdfBranding(doc, {
      title: belgeTipi,
      subtitle: `Belge No: HKT-${h.id}`,
      footerLeft: `PEXURA TECH • Cari: ${safePdfText(cari.ad || '-')}`,
      footerRight: `Tarih: ${pdfTarih}`
    });

    doc.setTextColor(15, 23, 42);
    applyPdfFont(doc, 'bold');
    doc.setFontSize(15);
    doc.text(belgeTipi, 40, 62);

    doc.setDrawColor(203, 213, 225);
    doc.setFillColor(255, 255, 255);
    const aciklamaPdf = getPlainHareketAciklama(h);
    const infoRows = [
      ['Müşteri', toTitleCaseTr(cari.ad || '-')],
      ['Telefon', cari.tel || '-'],
      ['Tarih', pdfTarih],
      ['Kasa / Banka', toTitleCaseTr(hesap.ad || '-')],
      ['İşlem Türü', h.tur === 'tahsilat' ? 'Tahsilat (Para Alındı)' : 'Ödeme (Para Verildi)'],
      ['İşlem Tutarı', fmt(tutar, pb)],
      ['İşlem Öncesi Bakiye', fmt(oncekiBorc, pb)],
      ['İşlem Sonrası Kalan', fmt(mevcutBakiye, pb)],
      ['Açıklama', aciklamaPdf]
    ];

    applyPdfFont(doc, 'normal');
    doc.setFontSize(9);
    const infoBoxY = 76;
    const infoBoxH = 236;
    doc.roundedRect(40, infoBoxY, 515, infoBoxH, 10, 10, 'FD');
    let y = drawPdfInfoRows(doc, infoRows, {
      labelX: 58,
      valueX: 212,
      startY: 98,
      rowGap: 22,
      labelWidth: 128,
      valueWidth: 250,
      lineH: 13
    });

    const noteY = Math.max(y + 14, infoBoxY + infoBoxH + 16);
    drawPdfNoteBox(doc, getTahsilatPdfNoteLines(), noteY, { title: 'Notlar' });

    drawPdfSignature(doc, { signer: 'Pexura Tech', title: 'Yetkili İmza' });

    const fileName = `${h.tur === 'tahsilat' ? 'Pexura_Tahsilat' : 'Pexura_Odeme'}_${h.id}.pdf`;
    doc.save(fileName);
    showToast('İşlem PDF indirildi.', 'success');
  } catch (e) {
    console.error(e);
    showToast(e?.message || 'İşlem PDF oluşturulamadı', 'error');
  }
};

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

  // Açılış bakiyesi (şu an tek alan olduğu için TL varsayımı)
  const acilis = (toNum(c.acilis_borc) || 0) - (toNum(c.acilis_alacak) || 0);
  if(acilis) map["TL"] = (map["TL"] || 0) + acilis;

  // Faturalar: kalan tutar borç/alacak yönünü belirler
  FATURALAR.filter(f => f.cari_id === c.id).forEach(f=>{
    const cur = f.para_birimi || "TL";
    const kalan = (toNum(f.genel_toplam) || 0) - (toNum(f.odenen_tutar) || 0);
    if(!kalan) return;
    if(normalizeTip(f.tip) === "satis") map[cur] = (map[cur] || 0) + kalan;
    else if(normalizeTip(f.tip) === "iade") map[cur] = (map[cur] || 0) - kalan;
  });

  // Kasa hareketleri: tahsilat borcu düşürür, ödeme (tedarikçiye) bizim borcumuzu düşürür → bakiye artar
  // Para birimi, bağlı kasa hesabının para biriminden alınır (yoksa hareketin para_birimi / TL)
  const hesapPB = new Map((HESAPLAR || []).map(h => [String(h.id), h.para_birimi || "TL"]));

  (HAREKETLER || []).filter(h => h.cari_id === c.id).forEach(h=>{
    const pb = hesapPB.get(String(h.hesap_id)) || h.para_birimi || "TL";
    const tutar = toNum(h.tutar) || 0;
    if(!tutar) return;

    const tur = (h.tur || "").toLowerCase();
    if(tur === "tahsilat") {
      // müşteri ödedi → borç azalır
      map[pb] = (map[pb] || 0) - tutar;
    } else if(tur === "odeme") {
      // biz ödedik → biz borçtan düşer → bakiye artar
      map[pb] = (map[pb] || 0) + tutar;
    }
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
  const isMobile = window.matchMedia("(max-width: 640px)").matches;
  const showPasif = !!document.getElementById('showPasifCariler')?.checked;
  const list = (CARILER||[])
    .filter(c => showPasif ? true : (c.aktif !== false))
    .slice()
    .sort((a,b)=> (a.aktif===false) - (b.aktif===false));

  list.forEach(c=>{
    const pasif = (c.aktif === false);
    const tr=document.createElement("tr");
    tr.innerHTML=`
      <td data-label="Müşteri" onclick="openCariPanel('${c.id}')" style="cursor:pointer;${pasif?'opacity:0.55;':''}">
        <span style="font-weight:bold; font-size:16px; color:#60a5fa;">${overdueStarHtml(c)} ${c.ad}</span><br>
        <small class="muted">${c.tel||'-'}</small>${isMobile?`<div class="mobile-bakiye"><span class="muted">Bakiye:</span> ${bakiyeHtmlForCari(c)}</div>`:""}
      </td>
      <td data-label="Bakiye">${bakiyeHtmlForCari(c)}</td>
      <td data-label="Tür"><span class="tag">${c.tur}</span>${pasif?` <span class="tag danger">pasif</span>`:''}</td>
      <td data-label="İşlem">
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

const URUN_SAYI_DUZELTME_KEY = 'urunSayiDuzeltmeleri_v4';

function getUrunSayiDuzeltmeleri(){
  try{ return JSON.parse(localStorage.getItem(URUN_SAYI_DUZELTME_KEY) || '{}') || {}; }catch(e){ return {}; }
}

function getUrunSayiDuzeltme(urunId){
  return getUrunSayiDuzeltmeleri()[String(urunId)] || null;
}

function setUrunSayiDuzeltme(urunId, data){
  const all = getUrunSayiDuzeltmeleri();
  const toplam_stok = Math.max(0, toNum(data.toplam_stok) || (toNum(data.satilan) + toNum(data.kalan)));
  let satilan = Math.max(0, toNum(data.satilan));
  const iade = Math.max(0, toNum(data.iade));
  let kalan = Math.max(0, toNum(data.kalan));
  // Ana kilit: Kalan stok, belirlenen toplam stoktan büyük kaydedilemez.
  if(kalan > toplam_stok) kalan = toplam_stok;
  satilan = Math.max(0, toplam_stok - kalan);
  all[String(urunId)] = { satilan, iade, kalan, toplam_stok, updated_at: nowLocalDTWithSeconds() };
  localStorage.setItem(URUN_SAYI_DUZELTME_KEY, JSON.stringify(all));
}

function clearUrunSayiDuzeltme(urunId){
  const all = getUrunSayiDuzeltmeleri();
  delete all[String(urunId)];
  localStorage.setItem(URUN_SAYI_DUZELTME_KEY, JSON.stringify(all));
}

function getUrunGercekSatisIadeOzet(urunId){
  const faturaMap = new Map((FATURALAR||[]).map(f => [String(f.id), f]));
  let satilan = 0;
  let iade = 0;
  (TUM_KALEMLER||[]).forEach(k=>{
    if(String(k.urun_id) !== String(urunId)) return;
    const f = faturaMap.get(String(k.fatura_id));
    const tip = normalizeTip(f?.tip || 'satis');
    const miktar = toNum(k.miktar);
    if(tip === 'iade') iade += miktar;
    else satilan += miktar;
  });
  return { satilan, iade, netSatilan: satilan - iade };
}

// Ürün bazlı gerçek kâr: liste fiyatından değil, müşteriye kesilen fatura kalemlerindeki
// gerçek birim fiyatlardan hesaplanır. İade faturaları kârdan düşülür.
function getUrunFaturaKari(urunId){
  const faturaMap = new Map((FATURALAR||[]).map(f => [String(f.id), f]));
  let kar = 0;
  (TUM_KALEMLER||[]).forEach(k=>{
    if(String(k.urun_id) !== String(urunId)) return;
    const f = faturaMap.get(String(k.fatura_id));
    const tip = normalizeTip(f?.tip || 'satis');
    const miktar = toNum(k.miktar);
    const gercekSatisFiyati = toNum(k.birim_fiyat);
    const alisFiyati = toNum(k.alis_fiyat_snapshot);
    const satirKar = (gercekSatisFiyati - alisFiyati) * miktar;
    kar += (tip === 'iade') ? -satirKar : satirKar;
  });
  return kar;
}

function getUrunSatisIadeOzet(urunId){
  const u = URUNLER.find(x => String(x.id) === String(urunId));
  const real = getUrunGercekSatisIadeOzet(urunId);
  const manual = getUrunSayiDuzeltme(urunId);
  if(manual){
    const toplamLimit = Math.max(0, toNum(manual.toplam_stok) || (toNum(manual.satilan) + toNum(manual.kalan)));
    let satilan = Math.max(0, toNum(manual.satilan));
    let iade = Math.max(0, toNum(manual.iade));
    let kalan = Math.max(0, toNum(manual.kalan));
    // Güvenlik kilidi: Kalan hiçbir koşulda toplam stok limitini geçemez.
    if(kalan > toplamLimit) kalan = toplamLimit;
    if(satilan + kalan !== toplamLimit) satilan = Math.max(0, toplamLimit - kalan);
    return { toplam_stok: toplamLimit, satilan, iade, kalan, netSatilan: satilan, manual:true };
  }
  const kalan = Math.max(0, toNum(u?.stok_miktar));
  const satilanNet = Math.max(0, real.satilan - real.iade);
  const toplam_stok = Math.max(0, satilanNet + kalan);
  return { toplam_stok, satilan: satilanNet, iade: real.iade, kalan, netSatilan: satilanNet };
}

function validateUrunSayilari(data){
  const satilan = toNum(data.satilan);
  const iade = toNum(data.iade);
  const kalan = toNum(data.kalan);
  if(satilan < 0) return { ok:false, msg:'Satılan negatif olamaz' };
  if(iade < 0) return { ok:false, msg:'İade negatif olamaz' };
  if(kalan < 0) return { ok:false, msg:'Kalan negatif olamaz' };
  if(toNum(data.toplam_stok) && kalan > toNum(data.toplam_stok)) return { ok:false, msg:`Kalan stok toplam stoktan fazla olamaz. En fazla: ${toNum(data.toplam_stok)}` };
  if(!Number.isFinite(satilan) || !Number.isFinite(iade) || !Number.isFinite(kalan)) return { ok:false, msg:'Geçerli bir sayı girin' };
  return { ok:true };
}

async function applyUrunSayiDuzeltme(urunId, yeni){
  const u = URUNLER.find(x => String(x.id) === String(urunId));
  if(!u) return showToast('Ürün bulunamadı', 'error');
  const toplam_stok = Math.max(0, toNum(yeni.toplam_stok) || (toNum(yeni.satilan) + toNum(yeni.kalan)));
  const duzgun = {
    satilan: Math.max(0, toNum(yeni.satilan)),
    iade: Math.max(0, toNum(yeni.iade)),
    kalan: Math.min(toplam_stok, Math.max(0, toNum(yeni.kalan))),
    toplam_stok
  };
  duzgun.satilan = Math.max(0, toplam_stok - duzgun.kalan);
  const kontrol = validateUrunSayilari(duzgun);
  if(!kontrol.ok) return showToast(kontrol.msg, 'warning');
  const oldRec = {...u, sayi_duzeltme_eski: getUrunSayiDuzeltme(urunId)};
  await logAction('urunler', 'COUNT_ADJUST', urunId, oldRec);
  const { error } = await supa.from('urunler').update({ stok_miktar: duzgun.kalan }).eq('id', urunId);
  if(error) return showToast(error.message, 'error');
  const degisim = duzgun.kalan - toNum(u.stok_miktar);
  if(degisim !== 0){
    await logStockMove({urunId, degisim, tur:'manual', kaynak:'urunler', kaynak_id:urunId, aciklama:'Ürün listesinden satılan/iade/kalan düzeltme'});
  }
  setUrunSayiDuzeltme(urunId, duzgun);
  await fetchUrunler(); fillSelects(); renderUrunler();
  showToast('Sayılar güncellendi', 'success');
}

async function updateUrunSayiAlani(urunId, field){
  const u = URUNLER.find(x => String(x.id) === String(urunId));
  if(!u) return showToast('Ürün bulunamadı', 'error');

  const mevcut = getUrunSatisIadeOzet(urunId);
  const labelMap = { satilan:'SATILAN', iade:'İADE', kalan:'KALAN' };
  const toplamStok = Math.max(0, toNum(mevcut.satilan) + toNum(mevcut.kalan));

  const val = prompt(
    `${u.ad} için ${labelMap[field]} sayısını girin.
` +
    `Mevcut: Satılan ${mevcut.satilan} / İade ${mevcut.iade} / Kalan ${mevcut.kalan}
` +
    `Kural: Satılan artarsa hem iadeden hem kalandan düşer, satılan düşerse kalan artar. ` +
    `İade artarsa kalan artar. Kalan hiçbir zaman toplam stok (${toplamStok}) üstüne çıkamaz.`,
    String(mevcut[field])
  );
  if(val === null) return;

  const girilen = Math.max(0, toNum(val));
  if(!Number.isFinite(girilen)) return showToast('Geçerli bir sayı girin', 'warning');

  const yeni = {
    satilan: Math.max(0, toNum(mevcut.satilan)),
    iade: Math.max(0, toNum(mevcut.iade)),
    kalan: Math.max(0, toNum(mevcut.kalan)),
    toplam_stok: toplamStok
  };

  if(field === 'satilan'){
    // Yeni mantık: Satılan artarsa hem KALAN'dan hem de varsa İADE'den düşer.
    // Satılan düşerse KALAN geri artar. Kalan hiçbir zaman toplam stok üstüne çıkamaz.
    const eskiSatilan = Math.max(0, toNum(yeni.satilan));
    const fark = girilen - eskiSatilan;
    if(girilen > toplamStok) return showToast(`Satılan toplam stoktan fazla olamaz. En fazla: ${toplamStok}`, 'warning');
    if(fark > 0 && fark > yeni.kalan) return showToast(`Satılan bu kadar artırılamaz. Kalan stok: ${yeni.kalan}`, 'warning');
    yeni.satilan = girilen;
    if(fark > 0){
      yeni.kalan = Math.max(0, yeni.kalan - fark);
      yeni.iade = Math.max(0, yeni.iade - fark);
    }else if(fark < 0){
      yeni.kalan = Math.min(toplamStok, yeni.kalan + Math.abs(fark));
    }
  } else if(field === 'iade'){
    // İade değişimi direkt SATILAN'dan düşer/geri ekler, KALAN'ı ters yönde ayarlar.
    // Örnek: Satılan 10, İade 0, Kalan 5 iken iade 2 yapılırsa => Satılan 8, İade 2, Kalan 7.
    // İade azaltılırsa da satılan artar, kalan azalır. Stok toplamı sabit kalır.
    const eskiIade = Math.max(0, toNum(yeni.iade));
    const fark = girilen - eskiIade;
    if(fark > yeni.satilan) return showToast(`İade bu kadar artırılamaz. Satılan en fazla ${yeni.satilan} adet azaltılabilir.`, 'warning');
    if(fark < 0 && Math.abs(fark) > yeni.kalan) return showToast(`İade bu kadar düşürülemez. Kalan stok eksiye düşer.`, 'warning');
    yeni.iade = girilen;
    yeni.satilan = Math.max(0, yeni.satilan - fark);
    yeni.kalan = Math.min(toplamStok, Math.max(0, yeni.kalan + fark));
  } else if(field === 'kalan'){
    // Kalan elle değişirse satılan ters yönde ayarlanır; kalan toplam stok üstüne çıkamaz.
    if(girilen > toplamStok) return showToast(`Kalan stok toplam stoktan fazla olamaz. En fazla: ${toplamStok}`, 'warning');
    yeni.kalan = girilen;
    yeni.satilan = toplamStok - girilen;
  }

  if(yeni.kalan < 0) return showToast('Kalan stok eksiye düşemez', 'warning');
  if(yeni.kalan > toplamStok) return showToast(`Kalan stok toplam stoktan fazla olamaz. En fazla: ${toplamStok}`, 'warning');

  await applyUrunSayiDuzeltme(urunId, yeni);
}

function getFilteredSortedUrunler(){
  const q = String(URUN_ARAMA || '').trim().toLocaleLowerCase('tr-TR');
  let liste = [...(URUNLER||[])];

  if(q){
    liste = liste.filter(u => [u.ad, u.kod, u.birim, u.para_birimi].some(v => String(v||'').toLocaleLowerCase('tr-TR').includes(q)));
  }

  liste.sort((a,b)=>{
    if(URUN_SORT === 'kod-asc') return String(a.kod||'').localeCompare(String(b.kod||''), 'tr', { numeric:true, sensitivity:'base' });
    if(URUN_SORT === 'kod-desc') return String(b.kod||'').localeCompare(String(a.kod||''), 'tr', { numeric:true, sensitivity:'base' });
    if(URUN_SORT === 'stok-asc') return toNum(a.stok_miktar) - toNum(b.stok_miktar);
    if(URUN_SORT === 'stok-desc') return toNum(b.stok_miktar) - toNum(a.stok_miktar);
    if(URUN_SORT === 'ad-desc') return String(b.ad||'').localeCompare(String(a.ad||''), 'tr', { numeric:true, sensitivity:'base' });
    return String(a.ad||'').localeCompare(String(b.ad||''), 'tr', { numeric:true, sensitivity:'base' });
  });

  return liste;
}

function renderUrunler(){
  uListe.innerHTML="";
  const liste = getFilteredSortedUrunler();
  const sonucEl = document.getElementById('urunSonucSayisi');
  if(sonucEl) sonucEl.textContent = `${liste.length} ürün gösteriliyor`;

  if(liste.length === 0){
    const tr=document.createElement("tr");
    tr.innerHTML = `<td colspan="6" style="text-align:center;padding:28px;color:#94a3b8;">Aramanıza uygun ürün bulunamadı.</td>`;
    uListe.appendChild(tr);
    return;
  }

  liste.forEach(u=>{
    const krit = Number(u.stok_miktar||0) <= Number(u.min_stok||0);
    const ozet = getUrunSatisIadeOzet(u.id);
    const kalan = toNum(u.stok_miktar);
    const urunKar = getUrunFaturaKari(u.id);
    const delBtn = USER_ROLE==='admin' ? `<button class="danger" data-del="${u.id}">Sil</button>` : '';
    const editBtn = USER_ROLE==='admin' ? `<button class="warning" data-edit="${u.id}">Düzenle</button>` : '';
    const imgHtml = u.resim_url
      ? `<img src="${u.resim_url}" class="urun-img" onclick="openImageModal('${u.resim_url}')">`
      : `<div class="urun-img-placeholder">Resim<br>Yok</div>`;
    const tr=document.createElement("tr");
    tr.className = 'urun-row';
    tr.innerHTML=`
      <td data-label="Resim" class="urun-img-cell">${imgHtml}</td>
      <td data-label="Kod" class="urun-kod">${u.kod||"-"}</td>
      <td data-label="Ürün / Satılan - İade - Kalan" class="urun-ad-cell">
        <div class="urun-info-box">
          <div class="urun-ad-title">${u.ad||'-'} ${krit?'<span class="tag critical-tag">KRİTİK</span>':""}</div>
          <div class="urun-stock-summary">
            <span class="count-card"><small>Satılan</small><b>${ozet.satilan}</b>${USER_ROLE==='admin' ? `<button class="count-pencil" title="Satılanı düzenle" data-count-field="satilan" data-count-id="${u.id}">✎</button>` : ''}</span>
            <span class="count-card"><small>İade</small><b>${ozet.iade}</b>${USER_ROLE==='admin' ? `<button class="count-pencil" title="İadeyi düzenle" data-count-field="iade" data-count-id="${u.id}">✎</button>` : ''}</span>
            <span class="count-card"><small>Kalan</small><b>${ozet.kalan}</b><em>${u.birim||''}</em>${USER_ROLE==='admin' ? `<button class="count-pencil" title="Kalanı düzenle" data-count-field="kalan" data-count-id="${u.id}">✎</button>` : ''}</span>
            <span class="urun-price-box alis"><small>Alış</small><b>${fmt(u.alis_fiyat, u.para_birimi)}</b></span>
            <span class="urun-price-box satis"><small>Satış</small><b>${fmt(u.satis_fiyat, u.para_birimi)}</b></span>
            <span class="urun-price-box kar"><small>Kâr</small><b>${fmt(urunKar, u.para_birimi)}</b></span>
          </div>
          ${USER_ROLE==='admin' ? `<div class="urun-row-actions"><button class="secondary" data-count-clear="${u.id}">Sayı Sil</button>${editBtn}${delBtn}</div>` : ''}
        </div>
      </td>
      <td data-label="İşlem" class="urun-actions"></td>`;
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

    uListe.querySelectorAll('[data-count-field]').forEach(btn=>{
      btn.onclick=async ()=> updateUrunSayiAlani(btn.dataset.countId, btn.dataset.countField);
    });

    uListe.querySelectorAll("[data-count-clear]").forEach(btn=>{
      btn.onclick=async ()=>{
        const id = btn.dataset.countClear;
        const u = URUNLER.find(x => String(x.id) === String(id));
        if(!u) return;
        if(!getUrunSayiDuzeltme(id)) return showToast("Silinecek sayı düzeltmesi yok", "info");
        if(!confirm(`${u.ad} için manuel satılan/iade/kalan düzeltmesi silinsin mi?`)) return;
        const oldRec = {...u, sayi_duzeltme_eski: getUrunSayiDuzeltme(id)};
        await logAction('urunler', 'COUNT_ADJUST_CLEAR', id, oldRec);
        clearUrunSayiDuzeltme(id);
        renderUrunler();
        showToast("Manuel sayı düzeltmesi silindi", "success");
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
      };
    });
  }
}

function initUrunListeControls(){
  const search = document.getElementById('urunSearchInput');
  const sort = document.getElementById('urunSortSelect');
  const clear = document.getElementById('urunSearchClear');
  const titleColor = document.getElementById('urunTitleColor');
  const titleSize = document.getElementById('urunTitleSize');
  const titleSettingsBtn = document.getElementById('urunTitleSettingsBtn');
  const titleSettingsPanel = document.getElementById('urunTitleSettingsPanel');
  document.documentElement.style.setProperty('--urun-title-color', URUN_TITLE_COLOR);
  document.documentElement.style.setProperty('--urun-title-size', `${URUN_TITLE_SIZE}px`);
  if(titleColor) titleColor.value = URUN_TITLE_COLOR;
  if(titleSize) titleSize.value = URUN_TITLE_SIZE;
  if(search && !search.dataset.bound){
    search.dataset.bound = '1';
    search.addEventListener('input', ()=>{ URUN_ARAMA = search.value; renderUrunler(); });
    search.addEventListener('keypress', (e)=>{ if(e.key === 'Enter'){ URUN_ARAMA = search.value; renderUrunler(); } });
  }
  if(sort && !sort.dataset.bound){
    sort.dataset.bound = '1';
    sort.addEventListener('change', ()=>{ URUN_SORT = sort.value; renderUrunler(); });
  }
  if(clear && !clear.dataset.bound){
    clear.dataset.bound = '1';
    clear.addEventListener('click', ()=>{
      URUN_ARAMA = '';
      if(search) search.value = '';
      renderUrunler();
    });
  }
  if(titleSettingsBtn && titleSettingsPanel && !titleSettingsBtn.dataset.bound){
    titleSettingsBtn.dataset.bound = '1';
    titleSettingsBtn.addEventListener('click', ()=>{
      titleSettingsPanel.classList.toggle('hide');
    });
  }
  if(titleColor && !titleColor.dataset.bound){
    titleColor.dataset.bound = '1';
    titleColor.addEventListener('input', ()=>{
      URUN_TITLE_COLOR = titleColor.value || '#f8fafc';
      localStorage.setItem('urunTitleColor', URUN_TITLE_COLOR);
      document.documentElement.style.setProperty('--urun-title-color', URUN_TITLE_COLOR);
    });
  }
  if(titleSize && !titleSize.dataset.bound){
    titleSize.dataset.bound = '1';
    titleSize.addEventListener('change', ()=>{
      URUN_TITLE_SIZE = titleSize.value || '18';
      localStorage.setItem('urunTitleSize', URUN_TITLE_SIZE);
      document.documentElement.style.setProperty('--urun-title-size', `${URUN_TITLE_SIZE}px`);
    });
  }
}

setTimeout(initUrunListeControls, 0);

/* =========================================================
   FATURALAR (madde 2,6,10,11)
========================================================= */
async function fetchFaturalar(){
  const { data }=await supa.from("faturalar").select("*, cariler(ad,tel)").order("tarih",{ascending:false});
  FATURALAR=(data||[]).sort(compareByNewest);
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

  // stok yetersiz kontrol: aynı üründen sepette varsa toplamı da hesaba kat
  if(normalizeTip(fTip.value)==='satis'){
    const sepetteki = FATURA_SATIRLAR
      .filter(s => String(s.urun_id) === String(urun.id))
      .reduce((t,s)=>t+toNum(s.miktar), 0);
    if((sepetteki + miktar) > toNum(urun.stok_miktar)){
      return showToast(`Stok yetersiz! Mevcut: ${urun.stok_miktar}, sepette: ${sepetteki}`, "error");
    }
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
      <td data-label="Ürün">${s.urun_ad}</td>
      <td data-label="Miktar">${s.miktar}</td>
      <td data-label="Alış">${fmt(s.alis_snapshot, fPara.value)}</td>
      <td data-label="Satış">${fmt(s.birim_fiyat, fPara.value)}</td>
      <td data-label="Tutar">${fmt(s.satir_tutar, fPara.value)}</td>
      <td data-label="Kâr"><span style="color:${kar>=0?'#4ade80':'#fca5a5'}; font-weight:700;">${fmt(kar, fPara.value)}</span></td>
      <td data-label="İşlem"><button class="danger" data-i="${i}">X</button></td>`;
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

  // Programın hiçbir yerinde satış stoku aşmasın.
  let extraAvailableForEdit = {};
  if(EDIT_FATURA_ID){
    const eskiFaturaKontrol = FATURALAR.find(f => f.id == EDIT_FATURA_ID);
    if(normalizeTip(eskiFaturaKontrol?.tip || 'satis') === 'satis'){
      const { data: eskiKalemKontrol } = await supa.from('fatura_kalemler').select('*').eq('fatura_id', EDIT_FATURA_ID);
      (eskiKalemKontrol||[]).forEach(k=>{
        const id = String(k.urun_id);
        extraAvailableForEdit[id] = toNum(extraAvailableForEdit[id]) + toNum(k.miktar);
      });
    }
  }
  if(tipYeni === 'satis' && !validateSaleStock(FATURA_SATIRLAR, extraAvailableForEdit)) return;

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
  let list = FATURALAR.slice().sort(compareByNewest);

  if(filters.cari) list = list.filter(f=>f.cari_id==filters.cari);
  if(filters.tip)  list = list.filter(f=>normalizeTip(f.tip)==filters.tip);
  if(filters.start) list = list.filter(f=>appDateMs(f.tarih)>=filterStartMs(filters.start));
  if(filters.end)   list = list.filter(f=>appDateMs(f.tarih)<=filterEndMs(filters.end));
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
      <td data-label="Tarih">${formatTRDateTime(f.tarih)}</td>
      <td data-label="Müşteri">${cariAd}</td>
      <td data-label="Tip"><span class="tag">${tipText}</span></td>
      <td data-label="Toplam">${fmt(f.genel_toplam, f.para_birimi)}</td>
      <td data-label="İşlem">
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
async function fetchHareketler(){ const { data }=await supa.from("kasa_hareketler").select("*").order("tarih",{ascending:false}); HAREKETLER=(data||[]).sort(compareByNewest); }

function calcKartKomisyon(tutar, odemeTipi, oran){
  const brut = toNum(tutar);
  const pct = toNum(oran);
  const komisyon = brut > 0 && pct > 0 ? Number((brut * pct / 100).toFixed(2)) : 0;
  return {
    odemeTipi: odemeTipi || 'nakit',
    oran: pct,
    brut,
    komisyon,
    net: Number((brut - komisyon).toFixed(2))
  };
}

function renderKomisyonOzet({tutarId, tipId, oranId, boxId, hesapId, turId}){
  const box = document.getElementById(boxId);
  if(!box) return;
  const tur = turId ? document.getElementById(turId)?.value : 'tahsilat';
  const hesap = HESAPLAR.find(h => String(h.id) === String(document.getElementById(hesapId)?.value));
  const curr = hesap?.para_birimi || 'USD';
  const info = calcKartKomisyon(
    document.getElementById(tutarId)?.value,
    document.getElementById(tipId)?.value,
    document.getElementById(oranId)?.value
  );

  if(tur !== 'tahsilat' || info.brut <= 0 || info.oran <= 0){
    box.classList.add('hide');
    box.innerHTML = '';
    return;
  }

  box.classList.remove('hide');
  box.innerHTML = `
    <div>Brüt tahsilat: <b>${fmt(info.brut, curr)}</b></div>
    <div>Kesinti/komisyon: <b>${fmt(info.komisyon, curr)}</b> (%${info.oran})</div>
    <div>Kasaya/Banka hesabına net geçen: <b>${fmt(info.net, curr)}</b></div>
  `;
}

async function createKartKomisyonGider({info, tarih, cariId, aciklama, kaynak}){
  if(!info || info.komisyon <= 0) return null;
  const cari = CARILER.find(c => String(c.id) === String(cariId));
  const cariText = cari?.ad ? ` - ${cari.ad}` : '';
  const base = (aciklama || kaynak || 'Tahsilat').trim();
  const odemeTipiText = info.odemeTipi === 'kart' ? 'Kredi kartı' : 'Nakit/Havale';
  const giderAciklama = `${base}${cariText} | ${odemeTipiText} komisyonu %${info.oran} | Brüt ${info.brut} | Net ${info.net}`;

  const { error } = await supa.from("gelir_gider").insert({
    user_id: USER.id,
    tarih: tarih || nowLocalDTWithSeconds(),
    tur: "gider",
    kategori: info.odemeTipi === 'kart' ? "Kredi Kartı Komisyonu" : "Nakit/Havale Komisyonu",
    tutar: info.komisyon,
    aciklama: giderAciklama
  });

  if(error) throw error;
  return info;
}

function resetKasaForm() {
  EDIT_HAREKET_ID = null;
  kTutar.value = ""; kAciklama.value = ""; kTarih.value = nowLocalDT();
  if(window.kOdemeTipi) kOdemeTipi.value = "nakit";
  if(window.kKomisyonOran) kKomisyonOran.value = "0";
  renderKomisyonOzet({tutarId:'kTutar', tipId:'kOdemeTipi', oranId:'kKomisyonOran', boxId:'kKomisyonOzet', hesapId:'kHesap', turId:'kTur'});
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
  const komisyonInfo = calcKartKomisyon(
    kTutar.value,
    document.getElementById('kOdemeTipi')?.value,
    document.getElementById('kKomisyonOran')?.value
  );

  const payload = {
    user_id: USER.id,
    hesap_id: kHesap.value,
    tarih: kTarih.value || nowLocalDTWithSeconds(),
    tur: kTur.value,
    cari_id: kCari.value||null,
    tutar: toNum(kTutar.value),
    aciklama: komisyonInfo.komisyon > 0 && kTur.value === 'tahsilat'
      ? `${kAciklama.value || 'Tahsilat'} | ${komisyonInfo.odemeTipi === 'kart' ? 'Kredi kartı' : 'Nakit/Havale'} komisyonu: %${komisyonInfo.oran}, kesinti ${komisyonInfo.komisyon}, net ${komisyonInfo.net}`
      : kAciklama.value
  };
  let error;
  if(EDIT_HAREKET_ID){
    const res = await supa.from("kasa_hareketler").update(payload).eq('id', EDIT_HAREKET_ID);
    error = res.error;
  } else {
    const res = await supa.from("kasa_hareketler").insert(payload);
    error = res.error;
    if(!error && kTur.value === 'tahsilat'){
      try{
        await createKartKomisyonGider({
          info: komisyonInfo,
          tarih: kTarih.value || nowLocalDTWithSeconds(),
          cariId: kCari.value,
          aciklama: kAciklama.value,
          kaynak: 'Kasa tahsilatı'
        });
      }catch(e){
        error = e;
      }
    }
  }
  if(error) return showToast(error.message, "error");
  resetKasaForm(); await fetchHareketler(); await fetchGG();
  renderHareketler(); renderGG(); renderDash();
  showToast(komisyonInfo.komisyon > 0 && kTur.value === 'tahsilat' ? "Tahsilat ve komisyon gideri kaydedildi." : "İşlem kaydedildi.", "success");
};

function renderHesaplar(){
  hesapListe.innerHTML="";
  HESAPLAR.forEach(h=>{
    hesapListe.innerHTML+=`<tr><td>${h.ad}</td><td>${h.tur}</td><td>${h.para_birimi}</td></tr>`;
  });
}

function renderHareketler(){
  hareketListe.innerHTML="";
  const q = (document.getElementById('hareketSearch')?.value || '').toLocaleLowerCase('tr').trim();
  const start = document.getElementById('hareketStart')?.value;
  const end = document.getElementById('hareketEnd')?.value;
  const startMs = filterStartMs(start);
  const endMs = filterEndMs(end);
  const filtered = (HAREKETLER || []).filter(h => {
    const hMs = appDateMs(h.tarih || h.created_at);
    if(startMs && Number.isFinite(hMs) && hMs < startMs) return false;
    if(endMs && Number.isFinite(hMs) && hMs > endMs) return false;
    if(!q) return true;
    const hesap = HESAPLAR.find(x=>x.id==h.hesap_id);
    const cari = h.cari_id ? CARILER.find(c=>c.id==h.cari_id) : null;
    const haystack = `${h.tur || ''} ${h.tutar || ''} ${h.aciklama || ''} ${hesap?.ad || ''} ${cari?.ad || ''} ${formatTRDateTime(h.tarih)}`.toLocaleLowerCase('tr');
    return haystack.includes(q);
  }).sort(compareByNewest);
  filtered.forEach(h=>{
    const cari = h.cari_id ? CARILER.find(c => String(c.id) === String(h.cari_id)) : null;
    const tr = document.createElement("tr");
    tr.innerHTML=`
      <td data-label="Tarih">${formatTRDateTime(h.tarih)}</td>
      <td data-label="Tür"><span class="tag">${h.tur}</span></td>
      <td data-label="Ad Soyad">${cari?.ad || '-'}</td>
      <td data-label="Tutar">${fmt(h.tutar, HESAPLAR.find(x=>x.id==h.hesap_id)?.para_birimi||'USD')}</td>
      <td data-label="Açıklama">${h.aciklama || ''}</td>
      <td data-label="İşlem">
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
      kTarih.value = toDateTimeInputValue(h.tarih); kAciklama.value = h.aciklama;
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

window.clearHareketFilters = () => {
  ['hareketSearch','hareketStart','hareketEnd'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.value = '';
  });
  renderHareketler();
};

/* =========================================================
   GELİR GİDER
========================================================= */
async function fetchGG(){ const { data }=await supa.from("gelir_gider").select("*").order("tarih",{ascending:false}); GG=data||[]; }

function resetGGForm() { EDIT_GG_ID = null; ggKat.value=""; ggTutar.value=""; ggAc.value=""; ggTarih.value = nowLocalDT(); const btn=document.getElementById('ggEkleBtn'); btn.textContent = "Ekle"; btn.classList.remove('warning'); }

document.getElementById('ggEkleBtn').onclick = async ()=>{
  if(!ggKat.value) return showToast("Kategori zorunlu","warning");
  if(!isPosNum(ggTutar.value)) return showToast("Tutar > 0 olmalı","warning");

  const payload = {user_id: USER.id, tarih: ggTarih.value || nowLocalDTWithSeconds(), tur: ggTur.value, kategori: ggKat.value, tutar: toNum(ggTutar.value), aciklama: ggAc.value};
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
  const selectedTur = (document.getElementById('ggFilterTur')?.value || '').trim();
  const q = (document.getElementById('ggFilterSearch')?.value || '').toLocaleLowerCase('tr').trim();
  const start = document.getElementById('ggFilterStart')?.value;
  const end = document.getElementById('ggFilterEnd')?.value;
  const startMs = filterStartMs(start);
  const endMs = filterEndMs(end);
  const filtered = (GG || []).filter(g => {
    if(selectedTur && g.tur !== selectedTur) return false;
    const gMs = appDateMs(g.tarih || g.created_at);
    if(startMs && Number.isFinite(gMs) && gMs < startMs) return false;
    if(endMs && Number.isFinite(gMs) && gMs > endMs) return false;
    const haystack = `${g.tur || ''} ${g.kategori || ''} ${g.aciklama || ''} ${g.tutar || ''} ${formatTRDateTime(g.tarih)}`.toLocaleLowerCase('tr');
    return !q || haystack.includes(q);
  }).sort(compareByNewest);
  const summary = document.getElementById('ggFilterSummary');
  if(summary){
    const gelirTop = filtered.filter(g => g.tur === 'gelir').reduce((a,g)=>a+toNum(g.tutar),0);
    const giderTop = filtered.filter(g => g.tur === 'gider').reduce((a,g)=>a+toNum(g.tutar),0);
    summary.innerHTML = `
      <span class="tag">Kayit: ${filtered.length}</span>
      <span class="tag success">Gelir: ${fmt(gelirTop)}</span>
      <span class="tag danger">Gider: ${fmt(giderTop)}</span>
      <span class="tag">Net: ${fmt(gelirTop - giderTop)}</span>
    `;
  }
  filtered.forEach(g=>{
    const tr = document.createElement("tr");
    tr.innerHTML=`
      <td data-label="Tarih">${formatTRDateTime(g.tarih)}</td>
      <td data-label="Tür">${g.tur}</td>
      <td data-label="Tutar">${fmt(g.tutar)}</td>
      <td data-label="Açıklama">${g.aciklama||''}</td>
      <td data-label="İşlem">
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
      ggTur.value=g.tur; ggKat.value=g.kategori; ggTutar.value=g.tutar; ggAc.value=g.aciklama; ggTarih.value=toDateTimeInputValue(g.tarih);
      EDIT_GG_ID = g.id;
      const btn = document.getElementById('ggEkleBtn');
      btn.textContent = "Güncelle"; btn.classList.add('warning');
      window.scrollTo(0,0);
    }
  });
}

window.clearGGFilters = () => {
  ['ggFilterTur','ggFilterSearch','ggFilterStart','ggFilterEnd'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.value = '';
  });
  renderGG();
};

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
  initUrunListeControls();
  renderCariler();
  renderUrunler();
  renderHesaplar();
  renderHareketler();
  renderGG();
  renderFaturalar();
  renderDash();
  if(window.renderHistory) window.renderHistory();
  renderNotes();
  renderZReports();
  renderPdfHistory();
  applyResponsiveTableLabels();
}

const NOTES_KEY = 'pexura_notes';
const Z_REPORTS_KEY = 'pexura_z_reports';

function readLocalJson(key, fallback){
  try{ return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }catch(e){ return fallback; }
}

function writeLocalJson(key, value){
  localStorage.setItem(key, JSON.stringify(value));
}

window.saveNote = () => {
  const title = (document.getElementById('noteTitle')?.value || '').trim();
  const text = (document.getElementById('noteText')?.value || '').trim();
  if(!title && !text) return showToast("Not bos olamaz.", "warning");
  const notes = readLocalJson(NOTES_KEY, []);
  notes.unshift({ id: crypto.randomUUID(), title: title || 'Not', text, created_at: new Date().toISOString() });
  writeLocalJson(NOTES_KEY, notes);
  document.getElementById('noteTitle').value = '';
  document.getElementById('noteText').value = '';
  renderNotes();
  showToast("Not kaydedildi.", "success");
};

window.deleteNote = (id) => {
  if(!confirm("Not silinsin mi?")) return;
  const notes = readLocalJson(NOTES_KEY, []).filter(n => n.id !== id);
  writeLocalJson(NOTES_KEY, notes);
  renderNotes();
};

function renderNotes(){
  const box = document.getElementById('notesList');
  if(!box) return;
  const notes = readLocalJson(NOTES_KEY, []);
  if(!notes.length){
    box.innerHTML = `<div class="muted">Henuz not yok.</div>`;
    return;
  }
  box.innerHTML = notes.map(n => `
    <div class="note-item">
      <div class="note-head">
        <strong>${escapeHtml(n.title || 'Not')}</strong>
        <button class="danger" type="button" onclick="deleteNote('${n.id}')">Sil</button>
      </div>
      <div class="muted">${formatTRDateTime(n.created_at)}</div>
      <p>${escapeHtml(n.text || '').replace(/\n/g, '<br>')}</p>
    </div>
  `).join('');
}

function addCurrency(map, curr, amount){
  const key = curr || 'TL';
  map[key] = Number(((map[key] || 0) + toNum(amount)).toFixed(2));
}

function formatCurrencyMap(map){
  const entries = Object.entries(map || {}).filter(([,v]) => Math.abs(toNum(v)) > 0.000001);
  if(!entries.length) return '0';
  return entries.map(([cur,val]) => fmt(val, cur)).join(' | ');
}

function buildZReport(dateStr){
  const report = {
    id: dateStr,
    date: dateStr,
    created_at: new Date().toISOString(),
    satis: {},
    tahsilat: {},
    odeme: {},
    gelir: {},
    gider: {},
    net: {}
  };

  FATURALAR.filter(f => normalizeTip(f.tip)==='satis' && ymd(f.tarih) === dateStr)
    .forEach(f => addCurrency(report.satis, f.para_birimi || 'TL', f.genel_toplam));
  HAREKETLER.filter(h => ymd(h.tarih) === dateStr).forEach(h => {
    const pb = HESAPLAR.find(x=>x.id==h.hesap_id)?.para_birimi || h.para_birimi || 'TL';
    if(h.tur === 'tahsilat') addCurrency(report.tahsilat, pb, h.tutar);
    if(h.tur === 'odeme') addCurrency(report.odeme, pb, h.tutar);
  });
  GG.filter(g => ymd(g.tarih) === dateStr).forEach(g => {
    if(g.tur === 'gelir') addCurrency(report.gelir, 'TL', g.tutar);
    if(g.tur === 'gider') addCurrency(report.gider, 'TL', g.tutar);
  });

  const currencies = new Set([
    ...Object.keys(report.tahsilat),
    ...Object.keys(report.odeme),
    ...Object.keys(report.gelir),
    ...Object.keys(report.gider)
  ]);
  currencies.forEach(cur => {
    report.net[cur] = toNum(report.tahsilat[cur]) + toNum(report.gelir[cur]) - toNum(report.odeme[cur]) - toNum(report.gider[cur]);
  });
  return report;
}

function upsertZReport(dateStr){
  const reports = readLocalJson(Z_REPORTS_KEY, []);
  const report = buildZReport(dateStr);
  const next = [report, ...reports.filter(r => r.date !== dateStr)]
    .sort((a,b)=> appDateMs(b.date) - appDateMs(a.date))
    .slice(0, 400);
  writeLocalJson(Z_REPORTS_KEY, next);
  renderZReports();
  renderLatestZReport();
  return report;
}

function generateMissingZReports(){
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const yesterday = ymd(d);
  const reports = readLocalJson(Z_REPORTS_KEY, []);
  if(!reports.some(r => r.date === yesterday)) upsertZReport(yesterday);
}

window.manualZReport = () => {
  const date = document.getElementById('zReportDate')?.value || todayStr();
  upsertZReport(date);
  showToast("Z raporu olusturuldu.", "success");
};

window.deleteZReport = (date) => {
  if(!confirm("Z raporu silinsin mi?")) return;
  writeLocalJson(Z_REPORTS_KEY, readLocalJson(Z_REPORTS_KEY, []).filter(r => r.date !== date));
  renderZReports();
  renderLatestZReport();
};

function renderZReports(){
  const body = document.getElementById('zReportList');
  if(!body) return;
  const reports = readLocalJson(Z_REPORTS_KEY, []);
  body.innerHTML = reports.length ? reports.map(r => `
    <tr>
      <td data-label="Tarih">${formatDateTR(r.date).slice(0,10)}</td>
      <td data-label="Satis">${formatCurrencyMap(r.satis)}</td>
      <td data-label="Tahsilat">${formatCurrencyMap(r.tahsilat)}</td>
      <td data-label="Odeme">${formatCurrencyMap(r.odeme)}</td>
      <td data-label="Gider">${formatCurrencyMap(r.gider)}</td>
      <td data-label="Net">${formatCurrencyMap(r.net)}</td>
      <td data-label="Islem"><button class="danger" onclick="deleteZReport('${r.date}')">Sil</button></td>
    </tr>
  `).join('') : `<tr><td colspan="7" class="muted">Z raporu yok.</td></tr>`;
}

function renderLatestZReport(){
  const box = document.getElementById('dashZRaporOzet');
  const dateInput = document.getElementById('zReportDate');
  if(dateInput && !dateInput.value) dateInput.value = todayStr();
  if(!box) return;
  const reports = readLocalJson(Z_REPORTS_KEY, []);
  if(!reports.length){
    box.innerHTML = `<div class="muted">Henuz Z raporu yok.</div>`;
    return;
  }
  const r = reports[0];
  box.innerHTML = `
    <div><b>Son rapor:</b> ${r.date}</div>
    <div><b>Satis:</b> ${formatCurrencyMap(r.satis)}</div>
    <div><b>Tahsilat:</b> ${formatCurrencyMap(r.tahsilat)}</div>
    <div><b>Net:</b> ${formatCurrencyMap(r.net)}</div>
  `;
}

function getCalculationIssues(){
  const issues = [];
  const kalemByFatura = {};
  (TUM_KALEMLER || []).forEach(k => { (kalemByFatura[k.fatura_id] ||= []).push(k); });
  (FATURALAR || []).forEach(f => {
    const sum = (kalemByFatura[f.id] || []).reduce((a,k)=> a + (toNum(k.satir_tutar) || (toNum(k.miktar) * toNum(k.birim_fiyat))), 0);
    if((kalemByFatura[f.id] || []).length && Math.abs(sum - toNum(f.ara_toplam || f.genel_toplam)) > 0.1){
      issues.push(`Fatura ${f.numara || f.id}: kalem toplami kontrol edilmeli.`);
    }
  });
  (URUNLER || []).filter(u => toNum(u.stok_miktar) < 0).forEach(u => issues.push(`${u.ad}: stok negatif.`));
  (CARILER || []).forEach(c => {
    const map = getCariBakiyeMap(c);
    Object.entries(map).forEach(([cur,val]) => {
      if(!Number.isFinite(toNum(val))) issues.push(`${c.ad}: ${cur} bakiye okunamadi.`);
    });
  });
  return issues.slice(0, 8);
}

function renderCalculationAudit(){
  const box = document.getElementById('dashHesapKontrol');
  if(!box) return;
  const issues = getCalculationIssues();
  if(!issues.length){
    box.innerHTML = `<div class="audit-ok">Hesap kontrolu temiz. Fatura, stok ve cari bakiye hesaplari normal gorunuyor.</div>`;
    return;
  }
  box.innerHTML = `<ul>${issues.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`;
}

/* =========================================================
   NAV
========================================================= */
function applyResponsiveTableLabels(){
  document.querySelectorAll('table.responsive-table').forEach(table => {
    const headers = Array.from(table.querySelectorAll('thead th')).map(th => th.textContent.trim().replace(/\s+/g, ' '));
    if(!headers.length) return;

    table.querySelectorAll('tbody tr').forEach(row => {
      Array.from(row.children).forEach((cell, idx) => {
        if(cell.tagName !== 'TD' || cell.getAttribute('data-label')) return;
        const label = headers[idx] || '';
        if(label) cell.setAttribute('data-label', label);
      });
    });
  });
}

function setupMobileShell(){
  const setVh = () => document.documentElement.style.setProperty('--app-vh', `${window.innerHeight * 0.01}px`);
  setVh();
  window.addEventListener('resize', setVh);
  let labelTimer = null;
  const scheduleTableLabels = () => {
    clearTimeout(labelTimer);
    labelTimer = setTimeout(applyResponsiveTableLabels, 80);
  };
  const mainEl = document.querySelector('main');
  if(mainEl) new MutationObserver(scheduleTableLabels).observe(mainEl, { childList: true, subtree: true });

  const savedViewMode = localStorage.getItem('pexuraViewMode');
  if(savedViewMode === 'mobile') document.body.classList.add('force-mobile');
  if(savedViewMode === 'pc') document.body.classList.add('force-desktop');

  document.querySelectorAll(".navbtn").forEach(btn => {
    if(btn.querySelector('.nav-ico')) return;
    const raw = btn.textContent.trim();
    const parts = raw.split(/\s+/);
    const icon = parts.shift() || '';
    const label = parts.join(' ') || raw;
    btn.innerHTML = `<span class="nav-ico">${icon}</span><span class="nav-lbl">${label}</span>`;
    btn.setAttribute('aria-label', label);
  });
}

setupMobileShell();

document.querySelectorAll(".navbtn").forEach(b => {
  b.onclick = () => {
    document.querySelectorAll(".navbtn").forEach(x => x.classList.remove("active"));
    b.classList.add("active");
    document.querySelectorAll(".tab").forEach(t => t.classList.add("hide"));
    const targetTab = document.getElementById("tab-" + b.dataset.tab);
    if(targetTab) targetTab.classList.remove("hide");
    if(b.dataset.tab === 'gecmis') renderHistory(); 

    // mobile FAB
    updateFab(b.dataset.tab);
    if(isMobileUI()){
      b.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };
});

// default dates
(() => {
  const _fT = document.getElementById('fTarih');
  const _kT = document.getElementById('kTarih');
  const _ggT = document.getElementById('ggTarih');
  if(_fT) _fT.value = nowLocalDT();
  if(_kT) _kT.value = nowLocalDT();
  if(_ggT) _ggT.value = nowLocalDT();
  const _kKomisyon = document.getElementById('kKomisyonOran');
  const _cpKomisyon = document.getElementById('cpKomisyonOran');
  if(_kKomisyon) _kKomisyon.value = "0";
  if(_cpKomisyon) _cpKomisyon.value = "0";
})();
['kTutar','kOdemeTipi','kKomisyonOran','kHesap','kTur'].forEach(id => {
  const el = document.getElementById(id);
  if(!el) return;
  const refresh = () => renderKomisyonOzet({tutarId:'kTutar', tipId:'kOdemeTipi', oranId:'kKomisyonOran', boxId:'kKomisyonOzet', hesapId:'kHesap', turId:'kTur'});
  el.addEventListener('input', refresh);
  el.addEventListener('change', refresh);
});
['hareketSearch','ggFilterSearch'].forEach(id => {
  const el = document.getElementById(id);
  if(!el) return;
  el.addEventListener('keydown', (ev) => {
    if(ev.key !== 'Enter') return;
    ev.preventDefault();
    if(id === 'hareketSearch') renderHareketler();
    if(id === 'ggFilterSearch') renderGG();
  });
});
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

  const cpTipEl = document.getElementById('cpIslemTipi');
  if(cpTipEl) cpTipEl.value = 'satis';
  cpIslemTipiDegisti();
  document.getElementById('cpUrunFiyat').value = "";
  document.getElementById('cpUrunAdet').value = "1";
  document.getElementById('cpSatirTutar').textContent = "0.00";
  document.getElementById('cpSepetToplam').textContent = "0.00";
  document.getElementById('cpFinansTutar').value = "";
  document.getElementById('cpFinansAciklama').value = "";
  if(document.getElementById('cpKomisyonOran')) document.getElementById('cpKomisyonOran').value = "0";
  setCpFinansTur('tahsilat');
  const refreshCpFinance = () => {
    cpTahsilatOzetGuncelle();
    renderKomisyonOzet({tutarId:'cpFinansTutar', tipId:'cpOdemeTipi', oranId:'cpKomisyonOran', boxId:'cpKomisyonOzet', hesapId:'cpKasaSelect', turId:'cpFinansTur'});
  };
  ['cpFinansTutar','cpOdemeTipi','cpKomisyonOran','cpKasaSelect'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.oninput = refreshCpFinance;
    if(el) el.onchange = refreshCpFinance;
  });

  CP_SEPET = [];
  renderCpSepet();

  await cpVerileriGuncelle();
  refreshCpFinance();
  await cpHareketleriGetir();
};


window.cpIslemTipiDegisti = () => {
  const tip = document.getElementById('cpIslemTipi')?.value || 'satis';
  const title = document.querySelector('#modalCariPanel h3');
  const btn = document.getElementById('cpSatisBtn');
  if(btn){
    btn.textContent = tip === 'iade' ? 'İADEYİ TAMAMLA (İADE FATURASI OLUŞTUR)' : 'SATIŞI TAMAMLA (FATURA OLUŞTUR)';
    btn.className = tip === 'iade' ? 'warning' : 'success';
    btn.style.width = '100%';
    btn.style.marginTop = '12px';
  }
  const stok = document.getElementById('cpStokDurum');
  if(stok && tip === 'iade') stok.textContent = 'İade modunda stok geri eklenecek.';
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

  const islemTipi = document.getElementById('cpIslemTipi')?.value || 'satis';

  // Satışta stok düşeceği için kontrol et; iadede stok geri eklenecek.
  if(islemTipi === 'satis'){
    const sepetteki = CP_SEPET
      .filter(s => String(s.urun_id) === String(urun.id) && (s.tip || 'satis') === 'satis')
      .reduce((t,s)=>t+toNum(s.miktar), 0);
    if((sepetteki + adet) > toNum(urun.stok_miktar)){
      return showToast(`Stok yetersiz! Mevcut: ${urun.stok_miktar}, sepette: ${sepetteki}`, "error");
    }
  }

  CP_SEPET.push({
    tip: islemTipi,
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
        <td>${s.urun_ad}<br><small style="color:${s.tip==='iade'?'#f59e0b':'#94a3b8'}">${s.tip==='iade'?'İade':'Satış'}</small></td>
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

  const tip = document.getElementById('cpIslemTipi')?.value || CP_SEPET[0]?.tip || 'satis';
  if(CP_SEPET.some(s => (s.tip || tip) !== tip)) return showToast("Aynı sepet içinde satış ve iade karıştırılamaz.", "warning");

  if(tip === 'satis' && !validateSaleStock(CP_SEPET.filter(s => (s.tip || 'satis') === 'satis'))) return;

  const pb = CP_SEPET[0].para_birimi || "USD";
  const total = CP_SEPET.reduce((a,b)=>a+b.satir_tutar,0);
  const oncekiBakiye = hesaplaBakiye(ACTIVE_CARI_ID);

  const numara = await getAutoFaturaNo();

  const { data: fatura, error } = await supa.from("faturalar").insert({
    user_id: USER.id,
    tip: tip,
    cari_id: ACTIVE_CARI_ID,
    tarih: nowLocalDTWithSeconds(),
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
    const degisim = tip === 'iade' ? s.miktar : -s.miktar;
    await applyStockChange(s.urun_id, degisim, {tur:tip, kaynak:"fatura", kaynak_id:fatura.id, aciklama: tip === 'iade' ? "Müşteri iadesi" : "Hızlı satış"});
  }

  const yeniBakiye = tip === 'iade' ? oncekiBakiye - total : oncekiBakiye + total;
  showToast(`${tip === 'iade' ? 'İade' : 'Satış'} tamamlandı. Yeni borç: ${fmt(yeniBakiye, pb)}`,"success");
  CP_SEPET=[]; renderCpSepet();
  cpIslemTipiDegisti();

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
  renderKomisyonOzet({tutarId:'cpFinansTutar', tipId:'cpOdemeTipi', oranId:'cpKomisyonOran', boxId:'cpKomisyonOzet', hesapId:'cpKasaSelect', turId:'cpFinansTur'});
  cpTahsilatOzetGuncelle();
};

window.cpFinansIsle = async () => {
  if(!ACTIVE_CARI_ID) return;
  const tur = document.getElementById('cpFinansTur').value;
  const tutar = toNum(document.getElementById('cpFinansTutar').value);
  const kasaId = document.getElementById('cpKasaSelect').value;
  const aciklama = document.getElementById('cpFinansAciklama').value;
  const komisyonInfo = calcKartKomisyon(
    tutar,
    document.getElementById('cpOdemeTipi')?.value,
    document.getElementById('cpKomisyonOran')?.value
  );
  if(tutar <= 0) return showToast("Geçerli bir tutar girin", "warning");

  const cari = CARILER.find(c => c.id == ACTIVE_CARI_ID);
  const hesap = HESAPLAR.find(h => h.id == kasaId);
  const mevcutBakiye = hesaplaBakiye(ACTIVE_CARI_ID);
  const yeniBakiye = tur === 'tahsilat' ? mevcutBakiye - tutar : mevcutBakiye + tutar;
  const kayitAciklamaBase = (aciklama || '').trim() || (tur === 'tahsilat' ? 'Tahsilat' : 'Odeme');
  const kayitAciklama = komisyonInfo.komisyon > 0 && tur === 'tahsilat'
    ? `${kayitAciklamaBase} | ${komisyonInfo.odemeTipi === 'kart' ? 'Kredi kartı' : 'Nakit/Havale'} komisyonu: %${komisyonInfo.oran}, kesinti ${komisyonInfo.komisyon}, net ${komisyonInfo.net}`
    : kayitAciklamaBase;

  const { error } = await supa.from('kasa_hareketler').insert({
    user_id: USER.id,
    hesap_id: kasaId,
    cari_id: ACTIVE_CARI_ID,
    tur: tur,
    tutar: tutar,
    tarih: nowLocalDTWithSeconds(),
    aciklama: kayitAciklama
  });
  if(error) return showToast(error.message, "error");

  if(tur === 'tahsilat'){
    try{
      await createKartKomisyonGider({
        info: komisyonInfo,
        tarih: nowLocalDTWithSeconds(),
        cariId: ACTIVE_CARI_ID,
        aciklama: kayitAciklamaBase,
        kaynak: 'Cari panel tahsilatı'
      });
    }catch(e){
      return showToast(e.message || "Komisyon gideri kaydedilemedi", "error");
    }
  }

  showToast(
    komisyonInfo.komisyon > 0 && tur === 'tahsilat'
      ? `Tahsilat kaydedildi, komisyon gider yazıldı. Kalan borç: ${fmt(yeniBakiye, hesap?.para_birimi || 'USD')}`
      : `İşlem kaydedildi. Kalan borç: ${fmt(yeniBakiye, hesap?.para_birimi || 'USD')}`,
    "success"
  );
  document.getElementById('cpFinansTutar').value = "";
  document.getElementById('cpFinansAciklama').value = "";
  if(document.getElementById('cpOdemeTipi')) document.getElementById('cpOdemeTipi').value = "nakit";
  if(document.getElementById('cpKomisyonOran')) document.getElementById('cpKomisyonOran').value = "0";
  renderKomisyonOzet({tutarId:'cpFinansTutar', tipId:'cpOdemeTipi', oranId:'cpKomisyonOran', boxId:'cpKomisyonOzet', hesapId:'cpKasaSelect', turId:'cpFinansTur'});
  await fetchAll(); renderAll();
  await cpVerileriGuncelle();
  cpTahsilatOzetGuncelle();
  await cpHareketleriGetir();
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
    aciklama: `${normalizeTip(f.tip)==='satis' ? 'Satış faturası oluşturuldu' : 'İade faturası oluşturuldu'} • No: ${f.numara || '-'} • ${normalizeTip(f.tip)==='satis' ? 'Cari borca eklendi' : 'Cari borçtan düşüldü'}`,
    kaynak:"fatura",
    pb:f.para_birimi,
    rawTur: normalizeTip(f.tip),
    numara: f.numara || ''
  }));
  const kList = HAREKETLER.filter(h=>h.cari_id==ACTIVE_CARI_ID).map(h=>({
    id:h.id,
    tarih:h.tarih,
    tur: h.tur==="tahsilat"?"Tahsilat":"Ödeme",
    tutar:+h.tutar,
    aciklama:h.aciklama||"",
    kaynak:"kasa",
    pb: HESAPLAR.find(x=>x.id==h.hesap_id)?.para_birimi||"USD",
    rawTur: h.tur
  }));

  CP_HAREKETLER = [...fList,...kList].sort(compareByNewest);
  renderCpHareketler(CP_HAREKETLER);
}
function renderCpHareketler(list){
  const body=document.getElementById("cpHareketListe");
  body.innerHTML="";
  list.forEach(x=>{
    const detayHtml = x.aciklama || '-';
    body.innerHTML += `
    <tr>
      <td>${formatTRDateTime(x.tarih)}</td>
      <td><span class="tag">${x.tur}</span></td>
      <td>${fmt(x.tutar,x.pb)}</td>
      <td style="max-width:420px; white-space:normal; line-height:1.5;">${detayHtml}</td>
      <td>
        ${x.kaynak==="fatura"
          ? `<button class="info" onclick="downloadCariPanelFaturaPdf('${x.id}')">PDF</button>
             <button class="warning" onclick="editFatura('${x.id}')">Düzenle</button>
             <button class="danger" onclick="deleteHistoryItem('fatura','${x.id}')">Sil</button>`
          : `<button class="info" onclick="downloadCariPanelKasaPdf('${x.id}')">PDF</button>
             <button class="warning" onclick="jumpToHareketEdit('${x.id}')">Düzenle</button>
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

function getCariBorcuDetay(cariId) {
  let borc = 0; let alacak = 0;

  FATURALAR.filter(f => f.cari_id == cariId).forEach(f=>{
    if(normalizeTip(f.tip)==='satis') borc += toNum(f.genel_toplam);
    if(normalizeTip(f.tip)==='iade') alacak += toNum(f.genel_toplam);
  });

  HAREKETLER.filter(h => h.cari_id == cariId && h.tur == 'tahsilat').forEach(h => alacak += toNum(h.tutar));
  HAREKETLER.filter(h => h.cari_id == cariId && h.tur == 'odeme').forEach(h => borc += toNum(h.tutar));
  const cari = CARILER.find(c => c.id == cariId);
  if(cari) { borc += toNum(cari.acilis_borc); alacak += toNum(cari.acilis_alacak); }

  const bakiye = borc - alacak;
  return { borc, alacak, bakiye };
}

function cpTahsilatOzetGuncelle() {
  const mevcutEl = document.getElementById('cpMevcutBorc');
  const kalanEl = document.getElementById('cpKalanBorc');
  const box = document.getElementById('cpTahsilatOzet');
  const turEl = document.getElementById('cpFinansTur');
  const tutarEl = document.getElementById('cpFinansTutar');
  if(!mevcutEl || !kalanEl || !box || !ACTIVE_CARI_ID || !turEl || !tutarEl) return;

  const detay = getCariBorcuDetay(ACTIVE_CARI_ID);
  const islemTutari = toNum(tutarEl.value);
  const tur = turEl.value;
  let sonrakiBakiye = detay.bakiye;
  if(tur === 'tahsilat') sonrakiBakiye = detay.bakiye - islemTutari;
  else if(tur === 'odeme') sonrakiBakiye = detay.bakiye + islemTutari;

  mevcutEl.textContent = fmt(detay.bakiye);
  kalanEl.textContent = fmt(sonrakiBakiye);
  kalanEl.style.color = sonrakiBakiye > 0 ? '#fca5a5' : (sonrakiBakiye < 0 ? '#4ade80' : '#e2e8f0');
  box.style.display = 'block';
}


window.downloadCariEkstrePdf = async (cariId) => {
  try{
    if(!cariId) return showToast('Müşteri seçilmedi.', 'warning');
    if(!window.jspdf) return showToast('PDF kütüphanesi eksik.', 'error');
    const cari = CARILER.find(c => String(c.id) === String(cariId));
    if(!cari) return showToast('Müşteri bulunamadı.', 'error');

    const faturas = (FATURALAR||[]).filter(f => String(f.cari_id) === String(cariId)).slice().sort((a,b)=> appDateMs(a.tarih) - appDateMs(b.tarih));
    const faturaIds = faturas.map(f => f.id);
    let kalemler = (TUM_KALEMLER||[]).filter(k => faturaIds.some(id => String(id) === String(k.fatura_id)));
    if(faturaIds.length && kalemler.length === 0){
      const { data, error } = await supa.from('fatura_kalemler').select('*').in('fatura_id', faturaIds);
      if(error) throw error;
      kalemler = data || [];
    }
    const kalemByFatura = new Map();
    kalemler.forEach(k => {
      const fid = String(k.fatura_id);
      if(!kalemByFatura.has(fid)) kalemByFatura.set(fid, []);
      kalemByFatura.get(fid).push(k);
    });

    const hareketler = (HAREKETLER||[]).filter(h => String(h.cari_id) === String(cariId));
    const bakiyeMap = getCariBakiyeMap(cari);
    const bakiyeText = Object.entries(bakiyeMap)
      .filter(([,v]) => Math.abs(toNum(v)) > 0.000001)
      .map(([cur,val]) => `${val > 0 ? 'Borç' : 'Alacak'}: ${fmt(Math.abs(val), cur)}`)
      .join(' | ') || '0';

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });

    addPexuraPdfBranding(doc, {
      title: 'Müşteri Ekstresi',
      subtitle: `Müşteri: ${safePdfText(cari.ad || '-')}`,
      footerLeft: `PEXURA TECH • ${safePdfText(cari.ad || '-')}`,
      footerRight: `Oluşturma: ${formatTRDateTime(new Date())}`
    });

    applyPdfFont(doc, 'bold');
    doc.setFontSize(15);
    doc.setTextColor(15, 23, 42);
    doc.text('Müşteri Ekstresi', 40, 62);

    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(40, 74, 515, 64, 10, 10, 'FD');
    applyPdfFont(doc, 'normal');
    doc.setFontSize(10);
    doc.setTextColor(30, 41, 59);
    doc.text(`Müşteri: ${safePdfText(cari.ad || '-')}`, 56, 94);
    doc.text(`Telefon: ${safePdfText(cari.tel || '-')}`, 300, 94);
    doc.text(`Adres: ${safePdfText(cari.adres || '-')}`, 56, 110, { maxWidth: 220 });
    applyPdfFont(doc, 'bold');
    doc.text(`Toplam Bakiye: ${bakiyeText}`, 56, 128);

    const rows = [];
    faturas.forEach(f => {
      const pb = f.para_birimi || 'TL';
      const isIade = normalizeTip(f.tip) === 'iade';
      const ks = kalemByFatura.get(String(f.id)) || [];
      if(ks.length){
        ks.forEach(k => {
          const miktar = toNum(k.miktar);
          const bf = toNum(k.birim_fiyat);
          const tutar = toNum(k.satir_tutar) || (miktar * bf);
          const urunAd = k.urun_ad_snapshot || URUNLER.find(u=>String(u.id)===String(k.urun_id))?.ad || '-';
          rows.push([
            formatTRDateTime(f.tarih),
            isIade ? 'İade' : 'Satış',
            urunAd,
            String(miktar),
            fmt(bf, pb),
            isIade ? '-' + fmt(tutar, pb) : fmt(tutar, pb),
            f.numara || '-'
          ]);
        });
      } else {
        rows.push([formatTRDateTime(f.tarih), isIade ? 'İade' : 'Satış', 'Fatura toplamı', '-', '-', (isIade ? '-' : '') + fmt(f.genel_toplam, pb), f.numara || '-']);
      }
    });

    hareketler.forEach(h => {
      const hesap = HESAPLAR.find(x => String(x.id) === String(h.hesap_id));
      const pb = hesap?.para_birimi || h.para_birimi || 'TL';
      rows.push([
        formatTRDateTime(h.tarih),
        h.tur === 'tahsilat' ? 'Tahsilat' : 'Ödeme',
        getPlainHareketAciklama(h),
        '-',
        '-',
        h.tur === 'tahsilat' ? '-' + fmt(h.tutar, pb) : fmt(h.tutar, pb),
        '-'
      ]);
    });

    rows.sort((a,b)=>{
      const pa = String(a[0]).split(' ')[0].split('.').reverse().join('-') + ' ' + (String(a[0]).split(' ')[1]||'00:00');
      const pb = String(b[0]).split(' ')[0].split('.').reverse().join('-') + ' ' + (String(b[0]).split(' ')[1]||'00:00');
      return appDateMs(pa) - appDateMs(pb);
    });

    doc.autoTable({
      ...pdfAutoTableDefaults(7.8),
      head: [['Tarih', 'Tür', 'Ürün / Açıklama', 'Miktar', 'Birim', 'Tutar', 'No']],
      body: rows.length ? rows : [['-', '-', 'Hareket yok', '-', '-', '-', '-']],
      startY: 156,
      tableWidth: 515,
      columnStyles: {
        0: { cellWidth: 70 },
        1: { cellWidth: 55 },
        2: { cellWidth: 175 },
        3: { halign: 'right', cellWidth: 42 },
        4: { halign: 'right', cellWidth: 62 },
        5: { halign: 'right', cellWidth: 66 },
        6: { cellWidth: 45 }
      }
    });

    let y = (doc.lastAutoTable?.finalY || 148) + 18;
    if(y > 720){ doc.addPage(); y = 56; }
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(330, y, 225, 42, 10, 10, 'FD');
    applyPdfFont(doc, 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text('Toplam Borç / Bakiye', 346, y + 18);
    applyPdfFont(doc, 'normal');
    doc.setFontSize(9);
    doc.text(bakiyeText, 346, y + 34, { maxWidth: 190 });

    // Müşteri ekstresi PDF alt not alanı
    let noteY = y + 58;
    const noteMetrics = measurePdfNoteBox(doc, getTahsilatPdfNoteLines(), {
      x: 40,
      w: 515,
      minHeight: 126,
      titleSize: 11,
      textSize: 9.5,
      lineHeight: 12,
      paddingX: 16,
      titleY: 18,
      textY: 38
    });
    if(noteY + noteMetrics.height > 770){
      doc.addPage();
      noteY = 56;
    }
    drawPdfNoteBox(doc, getTahsilatPdfNoteLines(), noteY, {
      x: 40,
      w: 515,
      title: 'Notlar',
      minHeight: 126,
      titleSize: 11,
      textSize: 9.5,
      lineHeight: 12,
      paddingX: 16,
      titleY: 18,
      textY: 38
    });

    addPexuraPdfBranding(doc, { title: 'Müşteri Ekstresi', subtitle: `Müşteri: ${safePdfText(cari.ad || '-')}` });
    doc.save(`Musteri-Ekstre-${safePdfText(cari.ad || cari.id)}.pdf`);
    showToast('Müşteri ekstre PDF indirildi.', 'success');
  }catch(e){
    console.error(e);
    showToast(e?.message || 'Müşteri ekstre PDF oluşturulamadı', 'error');
  }
};

window.downloadCariPanelFaturaPdf = async (faturaId) => {
  CURRENT_FATURA_DETAY_ID = faturaId;
  await window.downloadFaturaPdfFromDetay();
};

/* =========================================================
   Cari bakiye hesap (iade düşer)
========================================================= */
async function cpVerileriGuncelle() {
  if(!ACTIVE_CARI_ID) return;
  const cari = CARILER.find(c => c.id == ACTIVE_CARI_ID);
  const { bakiye } = getCariBorcuDetay(ACTIVE_CARI_ID);
  const bakiyeEl = document.getElementById('cpBakiye');
  if(cari){
    bakiyeEl.innerHTML = bakiyeHtmlForCari(cari);
  } else {
    bakiyeEl.textContent = fmt(bakiye);
  }
  bakiyeEl.style.color = bakiye > 0 ? '#ef4444' : (bakiye < 0 ? '#4ade80' : '#e2e8f0');
  cpTahsilatOzetGuncelle();
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

  const musteriFaturalari = FATURALAR.filter(f => f.cari_id == cariId).slice().sort(compareByNewest);
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

  const odemeler = HAREKETLER.filter(h => h.cari_id == cariId).slice().sort(compareByNewest);
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
  return getCariBorcuDetay(cariId).bakiye;
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

  (STOK_LOGS || []).forEach(s => {
    const urun = URUNLER.find(u => u.id == s.urun_id);
    allEvents.push({
      id: s.id,
      type: 'stok',
      date: s.tarih || s.created_at,
      label: 'Stok Logu',
      desc: `${urun?.ad || s.urun_ad_snapshot || 'Urun'} - ${s.tur || ''} - ${s.aciklama || ''}`,
      amount: s.miktar || s.degisim || 0,
      currency: '',
      color: '#f59e0b'
    });
  });

  (SYSTEM_LOGS || []).forEach(l => {
    allEvents.push({
      id: l.id,
      type: 'log',
      date: l.created_at || l.tarih,
      label: 'Sistem Logu',
      desc: `${l.table_name || '-'} - ${l.action_type || '-'} - Kayit: ${l.record_id || '-'}`,
      amount: 0,
      currency: '',
      color: '#a78bfa'
    });
  });

  allEvents.sort((a, b) => appDateMs(b.date) - appDateMs(a.date));
  allEvents
    .filter(e => String(e.label || '').toLocaleLowerCase('tr').includes(searchTerm) || String(e.desc || '').toLocaleLowerCase('tr').includes(searchTerm))
    .forEach(e => {
      tbody.innerHTML += `
        <tr>
          <td>${formatTRDateTime(e.date)}</td>
          <td><span class="tag" style="background:${e.color}20; color:${e.color}; border:1px solid ${e.color}">${e.label}</span></td>
          <td>${e.desc}</td>
          <td style="font-weight:bold; color:${e.color}">${fmt(e.amount, e.currency)}</td>
          <td>
            ${e.type === 'log' || e.type === 'stok'
              ? '<span class="muted">Kayit</span>'
              : `<button class="warning" style="margin-right:5px;" onclick="jumpToEdit('${e.type}', '${e.id}')">Düzenle</button>
                 <button class="danger" onclick="deleteHistoryItem('${e.type}', '${e.id}')">Sil</button>`}
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
  if(type === 'log' || type === 'stok') return showToast("Log kayitlari buradan silinmez.", "warning");
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
  if(false && kritikler.length){
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

    addPexuraPdfBranding(doc, {
      title: normalizeTip(f.tip) === 'iade' ? 'İade Faturası' : 'Satış Faturası',
      subtitle: `Belge No: ${f.numara || f.id}`,
      footerLeft: `PEXURA TECH • Müşteri: ${safePdfText(musteriAd || '-')}` ,
      footerRight: `Tarih: ${formatTRDateTime(f.tarih)}`
    });

    doc.setFontSize(15);
    applyPdfFont(doc, 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(`${normalizeTip(f.tip) === 'iade' ? 'İade Faturası' : 'Satış Faturası'} - ${f.numara || ''}`, 40, 62);

    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(40, 74, 515, 42, 10, 10, 'FD');
    applyPdfFont(doc, 'normal');
    doc.setFontSize(10);
    doc.text(`Müşteri: ${safePdfText(musteriAd || '-')}`, 56, 92);
    doc.text(`Telefon: ${safePdfText(tel || '-')}`, 300, 92);
    doc.text(`Tarih: ${formatTRDateTime(f.tarih)}`, 56, 106);
    doc.text(`Para Birimi: ${pb}`, 300, 106);

    const body = kalemler.map(k => {
      const urunAd = k.urun_ad_snapshot || (URUNLER.find(u=>u.id==k.urun_id)?.ad) || '-';
      const miktar = toNum(k.miktar);
      const bf = toNum(k.birim_fiyat);
      const tutar = toNum(k.satir_tutar) || (miktar*bf);
      return [urunAd, String(miktar), fmt(bf, pb), fmt(tutar, pb)];
    });

    doc.autoTable({
      ...pdfAutoTableDefaults(9),
      head: [['Ürün', 'Miktar', 'Birim Fiyat', 'Tutar']],
      body,
      startY: 124,
      tableWidth: 515,
      columnStyles: {
        0: { cellWidth: 245 },
        1: { cellWidth: 70, halign: 'center' },
        2: { cellWidth: 100, halign: 'right' },
        3: { cellWidth: 100, halign: 'right' }
      }
    });

    const y = doc.lastAutoTable.finalY + 20;
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(330, y - 14, 225, 80, 10, 10, 'FD');
    doc.setFontSize(10);
    applyPdfFont(doc, 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text('Ara Toplam:', 346, y);
    doc.text('KDV Toplam:', 346, y+14);
    doc.text('Genel Toplam:', 346, y+28);
    doc.text('Ödenen:', 346, y+42);
    doc.text('Kalan:', 346, y+56);
    applyPdfFont(doc, 'normal');
    doc.text(`${fmt(araToplam, pb)}`, 540, y, { align: 'right' });
    doc.text(`${fmt(kdvToplam, pb)}`, 540, y+14, { align: 'right' });
    doc.text(`${fmt(genelToplam, pb)}`, 540, y+28, { align: 'right' });
    doc.text(`${fmt(odenen, pb)}`, 540, y+42, { align: 'right' });
    doc.text(`${fmt(kalan, pb)}`, 540, y+56, { align: 'right' });

    drawPdfNoteBox(doc, getTahsilatPdfNoteLines(), y + 78, { x: 40, w: 515, title: 'Notlar' });
    drawPdfSignature(doc, { signer: 'PEXURA TECH', title: 'Yetkili İmza' });

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
    const komisyonOranStr = prompt("Kesinti/komisyon oranı (%)\nNakit, havale veya kart için komisyon yoksa boş bırakın ya da 0 yazın:", "");
    if(komisyonOranStr === null) return;
    const komisyonInfo = calcKartKomisyon(tutar, 'nakit', komisyonOranStr);

    // 1) kasa hareketi
    const { error: e1 } = await supa.from('kasa_hareketler').insert({
      user_id: USER.id,
      hesap_id: hesap.id,
      cari_id: f.cari_id,
      tur: 'tahsilat',
      tutar,
      tarih: nowLocalDTWithSeconds(),
      aciklama: komisyonInfo.komisyon > 0
        ? `Fatura tahsilatı: ${f.numara || f.id} | Komisyon: %${komisyonInfo.oran}, kesinti ${komisyonInfo.komisyon}, net ${komisyonInfo.net}`
        : `Fatura tahsilatı: ${f.numara || f.id}`
    });
    if(e1) throw e1;

    await createKartKomisyonGider({
      info: komisyonInfo,
      tarih: nowLocalDTWithSeconds(),
      cariId: f.cari_id,
      aciklama: `Fatura tahsilatı: ${f.numara || f.id}`,
      kaynak: 'Fatura tahsilatı'
    });

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
