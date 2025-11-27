const SUPABASE_URL = "https://qzpozucwuwhyfbnwhjnm.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_bsEk84gkUDPR7gDHXjjlsw_k6nHSYua";

const supa = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let USER = null;
let USER_ROLE = 'personel';

// --- DÜZENLEME MODU DEĞİŞKENLERİ ---
let EDIT_CARI_ID = null;
let EDIT_URUN_ID = null;
let EDIT_GG_ID = null;
let EDIT_HAREKET_ID = null; // YENİ: Kasa Hareketi Düzenleme ID

// --- RESİM YÖNETİMİ İÇİN ---
let CURRENT_IMG_URL = null;
let IS_IMG_REMOVED = false;

let CARILER=[], URUNLER=[], HESAPLAR=[], HAREKETLER=[], GG=[], FATURALAR=[], TUM_KALEMLER=[];

// Para birimi formatlayıcı
const fmt = (n, curr='USD') => {
  let symbol = '$';
  if(curr === 'TL') symbol = '₺';
  if(curr === 'EUR') symbol = '€';
  return (Number(n||0)).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}) + " " + symbol;
};
const todayStr = ()=> new Date().toISOString().slice(0,10);

// --- WHATSAPP YARDIMCISI ---
function sendWhatsapp(phone, message) {
  if(!phone) return alert("Numara yok!");
  let cleanPhone = phone.replace(/[^0-9]/g, '');
  if(cleanPhone.startsWith('0')) cleanPhone = cleanPhone.substring(1);
  if(cleanPhone.length === 10) cleanPhone = '90' + cleanPhone;
  window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`, '_blank');
}

// --- AUTH ---
async function register(){
  const email = authEmail.value.trim(); const password = authPass.value.trim();
  const { error } = await supa.auth.signUp({ email, password });
  if(error) return alert(error.message); alert("Kayıt başarılı! Admin onayı bekleniyor.");
}
async function login(){
  const email = authEmail.value.trim(); const password = authPass.value.trim();
  const { error } = await supa.auth.signInWithPassword({ email, password });
  if(error) return alert(error.message); await loadSession();
}
async function logout(){ await supa.auth.signOut(); location.reload(); }
async function loadSession(){
  const { data } = await supa.auth.getUser(); USER = data.user;
  if(USER){
    const { data: roleData } = await supa.from('user_roles').select('role').eq('user_id', USER.id).single();
    USER_ROLE = roleData ? roleData.role : 'personel';
    authLoggedOut.classList.add("hide"); authLoggedIn.classList.remove("hide");
    authUserMail.textContent = `${USER.email} (${USER_ROLE.toUpperCase()})`;
    applyRolePermissions(); await fetchAll();
  }
}
function applyRolePermissions(){
  const adminTabs = ['dash', 'cariler', 'faturalar', 'kasa', 'gelirgider'];
  if(USER_ROLE === 'personel'){
    adminTabs.forEach(id => { const btn = document.querySelector(`button[data-tab="${id}"]`); if(btn) btn.classList.add('hide'); });
    document.querySelector(`button[data-tab="urunler"]`).click(); document.getElementById('uEkleCard').classList.add('hide');
  } else {
    adminTabs.forEach(id => { const btn = document.querySelector(`button[data-tab="${id}"]`); if(btn) btn.classList.remove('hide'); });
    document.getElementById('uEkleCard').classList.remove('hide'); document.querySelector(`button[data-tab="dash"]`).click();
  }
}
document.getElementById('btnRegister').onclick=register; document.getElementById('btnLogin').onclick=login; document.getElementById('btnLogout').onclick=logout;

async function fetchAll(){
  if(USER_ROLE === 'personel'){ await fetchUrunler(); }
  else { 
      await Promise.all([fetchCariler(),fetchUrunler(),fetchHesaplar(),fetchHareketler(),fetchGG(),fetchFaturalar()]); 
      await fetchTumKalemler();
  }
  fillSelects(); renderAll();
}
async function fetchTumKalemler() {
    const { data } = await supa.from('fatura_kalemler').select('*');
    TUM_KALEMLER = data || [];
}

// --- DASHBOARD ---
function renderDash(){
    const currElem = document.getElementById('dashCurrencySelect');
    const curr = currElem ? currElem.value : 'USD';
    const filteredUrun = URUNLER.filter(u => u.para_birimi === curr);
    let totalStockVal = 0;
    filteredUrun.forEach(u => { totalStockVal += (Number(u.stok_miktar) || 0) * (Number(u.satis_fiyat) || 0); });
    document.getElementById('dashStokDeger').innerHTML = `<span style="font-size:0.6em; color:#94a3b8">${filteredUrun.length} Çeşit</span><br>${fmt(totalStockVal, curr)}`;
    let totalSales = 0;
    FATURALAR.filter(f => f.tip === 'satis' && f.para_birimi === curr).forEach(f => { totalSales += Number(f.genel_toplam); });
    document.getElementById('dashToplamSatis').textContent = fmt(totalSales, curr);
    let income = 0; let expense = 0;
    HAREKETLER.forEach(h => {
        const hesap = HESAPLAR.find(x => x.id == h.hesap_id);
        if(hesap && hesap.para_birimi === curr) { if(h.tur === 'tahsilat') income += Number(h.tutar); if(h.tur === 'odeme') expense += Number(h.tutar); }
    });
    GG.forEach(g => { if(g.tur === 'gelir') income += Number(g.tutar); if(g.tur === 'gider') expense += Number(g.tutar); });
    const balance = income - expense;
    document.getElementById('dashNakit').innerHTML = `<span style="color:${balance >= 0 ? '#4ade80' : '#ef4444'}">${fmt(balance, curr)}</span>`;
    const kritikListe = document.getElementById('dashKritikListe'); kritikListe.innerHTML = "";
    URUNLER.forEach(u => { if(Number(u.stok_miktar) <= Number(u.min_stok)){ kritikListe.innerHTML += `<tr><td>${u.ad}</td><td><span style="color:red;font-weight:bold">${u.stok_miktar}</span></td><td>${u.min_stok}</td></tr>`; } });
    const combinedMoves = [ ...HAREKETLER.map(h => ({tarih: h.tarih, tur: h.tur, tutar: h.tutar, pb: HESAPLAR.find(x=>x.id==h.hesap_id)?.para_birimi || 'USD'})), ...GG.map(g => ({tarih: g.tarih, tur: g.tur, tutar: g.tutar, pb: 'USD'})) ];
    combinedMoves.sort((a,b) => new Date(b.tarih) - new Date(a.tarih));
    const sonHareketler = document.getElementById('dashSonHareketler'); sonHareketler.innerHTML = "";
    combinedMoves.slice(0, 5).forEach(m => { sonHareketler.innerHTML += `<tr><td>${m.tarih}</td><td><span class="tag">${m.tur}</span></td><td>${Number(m.tutar).toLocaleString('en-US')} ${m.pb === 'TL' ? '₺' : '$'}</td></tr>`; });
}
const dSel = document.getElementById('dashCurrencySelect'); if(dSel) dSel.onchange = renderDash;

// --- BACKUP & ROLLBACK ---
async function logAction(tableName, actionType, recordId, oldData = null) {
    if(!USER) return;
    await supa.from('system_logs').insert({ user_id: USER.id, table_name: tableName, action_type: actionType, record_id: recordId, old_data: oldData });
}
window.openTimeMachine = () => { document.getElementById('modalTimeMachine').classList.remove('hide'); const now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset()); document.getElementById('rollbackTime').value = now.toISOString().slice(0,16); };
window.executeRollback = async () => {
    const targetTimeStr = document.getElementById('rollbackTime').value; if(!targetTimeStr) return alert("Lütfen bir tarih seçin.");
    const targetTime = new Date(targetTimeStr).toISOString();
    if(!confirm(`⚠️ DİKKAT!\n\n${targetTimeStr} tarihinden sonra yapılan TÜM işlemler geri alınacak.\nDevam etmek istiyor musun?`)) return;
    const { data: logs, error } = await supa.from('system_logs').select('*').gt('created_at', targetTime).order('created_at', {ascending: false});
    if(error) return alert("Hata: " + error.message); if(!logs || logs.length === 0) return alert("Seçilen tarihten sonra işlem bulunamadı.");
    let count = 0;
    for (const log of logs) {
        try {
            if (log.action_type === 'INSERT') { await supa.from(log.table_name).delete().eq('id', log.record_id); } 
            else if (log.action_type === 'DELETE') { if(log.old_data) await supa.from(log.table_name).insert(log.old_data); }
            else if (log.action_type === 'UPDATE') { if(log.old_data) await supa.from(log.table_name).update(log.old_data).eq('id', log.record_id); }
            await supa.from('system_logs').delete().eq('id', log.id); count++;
        } catch (e) { console.error("Rollback hatası:", e); }
    }
    alert(`${count} işlem geri alındı.`); location.reload();
};
document.getElementById('backupBtn').onclick = async () => { if(!USER) return alert("Giriş yapın."); const backupData = { tarih: new Date().toISOString(), cariler: CARILER, urunler: URUNLER, faturalar: FATURALAR, hesaplar: HESAPLAR, hareketler: HAREKETLER, gelir_gider: GG }; const jsonStr = JSON.stringify(backupData, null, 2); const blob = new Blob([jsonStr], {type: "application/json"}); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `pexura_yedek_${todayStr()}.json`; a.click(); URL.revokeObjectURL(url); };
document.getElementById('restoreBtn').onclick = () => { document.getElementById('importFile').click(); };
document.getElementById('importFile').onchange = (e) => { const file = e.target.files[0]; if(!file) return; const reader = new FileReader(); reader.onload = async (evt) => { try { const data = JSON.parse(evt.target.result); if(!confirm("Verileri sisteme yüklemek istiyor musun?")) return; if(data.cariler) await supa.from('cariler').upsert(data.cariler.map(x=>{delete x.id; return {...x, user_id: USER.id}})); if(data.urunler) await supa.from('urunler').upsert(data.urunler.map(x=>{delete x.id; return {...x, user_id: USER.id}})); alert("Yükleme tamamlandı."); location.reload(); } catch(err) { alert("Hata: " + err.message); } }; reader.readAsText(file); };

// --- PDF ---
function trFix(text) {
    if(!text) return "";
    const map = { 'ğ': 'g', 'Ğ': 'G', 'ş': 's', 'Ş': 'S', 'ı': 'i', 'İ': 'I', 'ü': 'u', 'Ü': 'U', 'ö': 'o', 'Ö': 'O', 'ç': 'c', 'Ç': 'C' };
    return text.toString().replace(/[ğĞşŞıİüÜöÖçÇ]/g, (letter) => map[letter]);
}
async function createPDF(faturaId) {
    try {
        if (!window.jspdf) { alert("PDF kütüphanesi yüklenemedi."); return; }
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const { data: fatura, error: fError } = await supa.from('faturalar').select('*, cariler(ad)').eq('id', faturaId).single();
        if(fError || !fatura) throw new Error("Fatura verisi bulunamadı.");
        const { data: kalemler, error: kError } = await supa.from('fatura_kalemler').select('*, urunler(ad)').eq('fatura_id', faturaId);
        if(kError) throw new Error("Ürün listesi çekilemedi.");
        doc.setTextColor(59, 130, 246); doc.setFont("helvetica", "bold"); doc.setFontSize(24); doc.text("PEXURA TECH", 14, 20);
        doc.setTextColor(0, 0, 0); doc.setFontSize(14);
        const tipStr = fatura.tip === 'satis' ? 'SATIS FATURASI' : 'ALIS FATURASI';
        doc.text(trFix(tipStr), 14, 30);
        const durumText = fatura.odeme_durumu === 'Odendi' ? 'ODENDI' : 'ODENMEDI';
        doc.setFontSize(10);
        if (fatura.odeme_durumu === 'Odendi') { doc.setTextColor(0, 128, 0); } else { doc.setTextColor(255, 0, 0); }
        doc.text(`DURUM: ${durumText}`, 140, 30);
        doc.setTextColor(0,0,0);
        const cariAd = fatura.cariler ? fatura.cariler.ad : 'Bilinmiyor';
        doc.text(`Tarih: ${fatura.tarih}`, 14, 40); doc.text(`Fatura No: ${fatura.numara}`, 14, 45); doc.text(`Cari: ${trFix(cariAd)}`, 14, 50);
        const tableData = kalemler.map(k => [ trFix(k.urunler ? k.urunler.ad : 'Silinmis Urun'), k.miktar, fmt(k.birim_fiyat, fatura.para_birimi), fmt(k.satir_tutar, fatura.para_birimi) ]);
        doc.autoTable({ startY: 60, head: [['Urun', 'Miktar', 'Birim Fiyat', 'Tutar']], body: tableData, theme: 'grid', headStyles: { fillColor: [59, 130, 246] }, foot: [['', '', 'GENEL TOPLAM', fmt(fatura.genel_toplam, fatura.para_birimi)]] });
        doc.save(`Pexura_Fatura_${fatura.numara}.pdf`);
    } catch (err) { console.error(err); alert("PDF indirilemedi: " + err.message); }
}

// --- CARİLER ---
async function fetchCariler(){ const { data } = await supa.from("cariler").select("*").order("ad"); CARILER = data||[]; }
function resetCariForm() { EDIT_CARI_ID = null; cariAd.value = ""; cariTel.value = ""; cariMail.value = ""; cariAdres.value = ""; cariABorc.value = ""; cariAAlacak.value = ""; const btn = document.getElementById('cariEkleBtn'); btn.textContent = "Kaydet"; btn.classList.remove('warning'); }
document.getElementById('cariEkleBtn').onclick = async ()=>{
  if(!cariAd.value) return alert("Ad zorunlu");
  const payload = { user_id: USER.id, tur: cariTur.value, ad: cariAd.value, tel: cariTel.value, mail: cariMail.value, adres: cariAdres.value, acilis_borc: Number(cariABorc.value), acilis_alacak: Number(cariAAlacak.value) };
  let error;
  if(EDIT_CARI_ID) { const oldRec = CARILER.find(c => c.id == EDIT_CARI_ID); await logAction('cariler', 'UPDATE', EDIT_CARI_ID, oldRec); const res = await supa.from("cariler").update(payload).eq('id', EDIT_CARI_ID); error = res.error; } 
  else { const res = await supa.from("cariler").insert(payload).select().single(); error = res.error; if(res.data) await logAction('cariler', 'INSERT', res.data.id); }
  if(error) return alert(error.message); resetCariForm(); await fetchCariler(); fillSelects(); renderCariler();
};
function renderCariler(){
  cariListe.innerHTML="";
  CARILER.forEach(c=>{
    const tr=document.createElement("tr");
    tr.innerHTML=`<td>${c.ad}<br><small class="muted">${c.tel||'-'}</small></td><td><span class="tag">${c.tur}</span></td><td><button class="info" style="padding:4px 8px; font-size:11px;" onclick="openEkstre('${c.id}')">Ekstre</button><button class="warning" style="padding:4px 8px; font-size:11px;" data-edit="${c.id}">Düzenle</button><button class="danger" style="padding:4px 8px; font-size:11px;" data-del="${c.id}">Sil</button></td>`;
    cariListe.appendChild(tr);
  });
  cariListe.querySelectorAll("[data-del]").forEach(btn=>{ btn.onclick=async ()=>{ if(confirm("Sil?")){ const id = btn.dataset.del; const oldRec = CARILER.find(c => c.id == id); await logAction('cariler', 'DELETE', id, oldRec); await supa.from("cariler").delete().eq("id", id); await fetchCariler(); renderCariler(); }}; });
  cariListe.querySelectorAll("[data-edit]").forEach(btn=>{ btn.onclick=()=>{ const c = CARILER.find(x=>x.id==btn.dataset.edit); cariTur.value=c.tur; cariAd.value=c.ad; cariTel.value=c.tel; cariMail.value=c.mail; cariAdres.value=c.adres; cariABorc.value=c.acilis_borc; cariAAlacak.value=c.acilis_alacak; EDIT_CARI_ID = c.id; const b = document.getElementById('cariEkleBtn'); b.textContent="Güncelle"; b.classList.add('warning'); window.scrollTo(0,0); }});
}

// --- ÜRÜNLER ---
async function fetchUrunler(){ const { data } = await supa.from("urunler").select("*").order("ad"); URUNLER=data||[]; }
function resetUrunForm() { EDIT_URUN_ID = null; uKod.value=""; uAd.value=""; uBirim.value=""; uMin.value=""; uAlis.value=""; uSatis.value=""; uKdv.value="18"; uStokManuel.value=""; document.getElementById('uResimInput').value = ""; CURRENT_IMG_URL = null; IS_IMG_REMOVED = false; document.getElementById('uResimPreviewArea').classList.add('hide'); document.getElementById('uResimPreview').src = ""; const btn = document.getElementById('uKaydetBtn'); btn.textContent = "Kaydet"; btn.classList.remove('warning'); }
window.removeCurrentImage = () => { IS_IMG_REMOVED = true; document.getElementById('uResimPreviewArea').classList.add('hide'); };
document.getElementById('uKaydetBtn').onclick = async ()=>{
  if(!uAd.value) return alert("Ad zorunlu");
  let uploadedImageUrl = null; const fileInput = document.getElementById('uResimInput'); const file = fileInput.files[0];
  if(file) { const fileName = `urun_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '')}`; const { error } = await supa.storage.from('urun-resimleri').upload(fileName, file); if(error) return alert("Resim yükleme hatası: " + error.message); const { data: publicData } = supa.storage.from('urun-resimleri').getPublicUrl(fileName); uploadedImageUrl = publicData.publicUrl; }
  const payload={ user_id: USER.id, kod: uKod.value, ad: uAd.value, birim: uBirim.value, min_stok: Number(uMin.value), alis_fiyat: Number(uAlis.value), satis_fiyat: Number(uSatis.value), para_birimi: uPara.value, kdv_oran: Number(uKdv.value), stok_miktar: Number(uStokManuel.value) };
  if(uploadedImageUrl) { payload.resim_url = uploadedImageUrl; } else if (IS_IMG_REMOVED) { payload.resim_url = null; } 
  let error;
  if(EDIT_URUN_ID) { const oldRec = URUNLER.find(u => u.id == EDIT_URUN_ID); await logAction('urunler', 'UPDATE', EDIT_URUN_ID, oldRec); const res = await supa.from("urunler").update(payload).eq('id', EDIT_URUN_ID); error = res.error; } 
  else { const res = await supa.from("urunler").insert(payload).select().single(); error = res.error; if(res.data) await logAction('urunler', 'INSERT', res.data.id); }
  if(error) return alert(error.message); resetUrunForm(); await fetchUrunler(); fillSelects(); renderUrunler();
};
function renderUrunler(){ uListe.innerHTML=""; URUNLER.forEach(u=>{ const krit = Number(u.stok_miktar||0) <= Number(u.min_stok||0); const delBtn = USER_ROLE==='admin' ? `<button class="danger" data-del="${u.id}">Sil</button>` : ''; const editBtn = USER_ROLE==='admin' ? `<button class="warning" data-edit="${u.id}">Düzenle</button>` : ''; const imgHtml = u.resim_url ? `<img src="${u.resim_url}" class="urun-img">` : `<div style="width:90px;height:90px;background:#334155;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:11px;color:#94a3b8;border:1px dashed #475569;">Resim Yok</div>`; const tr=document.createElement("tr"); tr.innerHTML=`<td style="vertical-align: middle;">${imgHtml}</td><td style="vertical-align: middle;">${u.kod||""}</td><td style="vertical-align: middle;">${u.ad} ${krit?'<span class="tag" style="background:red;color:white">!</span>':""}</td><td style="vertical-align: middle;">${u.stok_miktar} ${u.birim||""}</td><td style="vertical-align: middle;">${fmt(u.satis_fiyat, u.para_birimi)}</td><td style="vertical-align: middle; display:flex; gap:5px; align-items:center; height:100px;">${editBtn}${delBtn}</td>`; uListe.appendChild(tr); }); if(USER_ROLE==='admin'){ uListe.querySelectorAll("[data-del]").forEach(btn=>{ btn.onclick=async ()=>{ if(confirm("Sil?")){ const id = btn.dataset.del; const oldRec = URUNLER.find(u => u.id == id); await logAction('urunler', 'DELETE', id, oldRec); await supa.from("urunler").delete().eq("id", id); await fetchUrunler(); renderUrunler(); } }; }); uListe.querySelectorAll("[data-edit]").forEach(btn=>{ btn.onclick=()=>{ const u = URUNLER.find(x=>x.id==btn.dataset.edit); uKod.value=u.kod||""; uAd.value=u.ad; uBirim.value=u.birim||""; uPara.value=u.para_birimi; uAlis.value=u.alis_fiyat; uSatis.value=u.satis_fiyat; uMin.value=u.min_stok; uStokManuel.value=u.stok_miktar; uKdv.value=u.kdv_oran; EDIT_URUN_ID = u.id; IS_IMG_REMOVED = false; CURRENT_IMG_URL = u.resim_url; if(u.resim_url) { document.getElementById('uResimPreviewArea').classList.remove('hide'); document.getElementById('uResimPreview').src = u.resim_url; } else { document.getElementById('uResimPreviewArea').classList.add('hide'); } const b = document.getElementById('uKaydetBtn'); b.textContent="Güncelle"; b.classList.add('warning'); window.scrollTo(0,0); alert("Ürün bilgileri yüklendi."); }}); } }

// --- FATURALAR ---
let FATURA_SATIRLAR=[];
async function fetchFaturalar(){ const { data }=await supa.from("faturalar").select("*, cariler(ad)").order("tarih",{ascending:false}); FATURALAR=data||[]; }
document.getElementById('kalemEkleBtn').onclick=()=>{
  const urun=URUNLER.find(u=>u.id===kUrun.value); if(!urun) return alert("Ürün seç");
  FATURA_SATIRLAR.push({ urun_id: urun.id, urun_ad: urun.ad, miktar: Number(kMiktar.value), birim_fiyat: Number(kFiyat.value), kdv_oran: Number(kKdv.value), satir_tutar: Number(kMiktar.value) * Number(kFiyat.value) });
  renderKalemler(); calcFaturaTotals();
};
function renderKalemler(){ kalemListe.innerHTML=""; FATURA_SATIRLAR.forEach((s,i)=>{ const tr=document.createElement("tr"); tr.innerHTML=`<td>${s.urun_ad}</td><td>${s.miktar}</td><td>${fmt(s.birim_fiyat)}</td><td>${fmt(s.satir_tutar)}</td><td><button class="danger" data-i="${i}">X</button></td>`; kalemListe.appendChild(tr); }); kalemListe.querySelectorAll("[data-i]").forEach(btn=>{ btn.onclick=()=>{ FATURA_SATIRLAR.splice(Number(btn.dataset.i),1); renderKalemler(); calcFaturaTotals(); }; }); }
function calcFaturaTotals(){ let top=0; FATURA_SATIRLAR.forEach(s=> top+=s.satir_tutar); fGenel.textContent = fmt(top); return top; }

document.getElementById('fKaydetBtn').onclick=async ()=>{
  if(FATURA_SATIRLAR.length===0) return alert("Kalem yok");
  const total = calcFaturaTotals(); const selectedCari = CARILER.find(c => c.id === fCari.value);
  const { data: inserted, error } = await supa.from("faturalar").insert({ user_id: USER.id, tip: fTip.value, cari_id: fCari.value, tarih: fTarih.value, numara: fNo.value, genel_toplam: total, para_birimi: fPara.value, odeme_durumu: fDurum.value }).select().single();
  if(error) return alert(error.message);
  await logAction('faturalar', 'INSERT', inserted.id);

  const kalemler = FATURA_SATIRLAR.map(s=>({ fatura_id: inserted.id, urun_id: s.urun_id, miktar: s.miktar, birim_fiyat: s.birim_fiyat, kdv_oran: s.kdv_oran, satir_tutar: s.satir_tutar }));
  await supa.from("fatura_kalemler").insert(kalemler);
  for(const s of FATURA_SATIRLAR){ const degisim = fTip.value==="satis" ? -s.miktar : +s.miktar; await supa.rpc("stok_guncelle", { p_urun_id: s.urun_id, p_degisim: degisim }); }
  if(fDurum.value === 'Odendi' && fTip.value === 'satis') {
      const kasa = HESAPLAR.find(h => h.tur === 'kasa') || HESAPLAR[0]; 
      if(kasa) { await supa.from('kasa_hareketler').insert({ user_id: USER.id, hesap_id: kasa.id, cari_id: fCari.value, tur: 'tahsilat', tutar: total, tarih: fTarih.value, aciklama: `Fatura No: ${fNo.value} Tahsilatı` }); }
  }
  if(fWhatsappCheck.checked && selectedCari && selectedCari.tel){ const msg = `Sayın ${selectedCari.ad}, ${fTarih.value} tarihli, ${fNo.value} numaralı faturanız (${fDurum.value === 'Odendi' ? 'Ödendi' : 'Ödenmedi'}) oluşturulmuştur. Toplam: ${fmt(total, fPara.value)}.`; if(confirm("Fatura kaydedildi. WhatsApp gönderilsin mi?")) sendWhatsapp(selectedCari.tel, msg); } else { alert("Fatura başarıyla kaydedildi."); }
  FATURA_SATIRLAR=[]; renderKalemler(); await fetchAll(); renderAll();
};

function renderFaturalar(){
  faturaListe.innerHTML="";
  FATURALAR.forEach(f=>{
    const tr=document.createElement("tr"); const cariAd = f.cariler ? f.cariler.ad : 'Silinmiş Cari';
    const durumHtml = f.odeme_durumu === 'Odendi' ? `<span class="tag odendi" style="cursor:pointer" title="Durum değiştirmek için tıkla" onclick="toggleFaturaDurum('${f.id}','Odenmedi')">Ödendi</span>` : `<span class="tag odenmedi" style="cursor:pointer" title="Durum değiştirmek için tıkla" onclick="toggleFaturaDurum('${f.id}','Odendi')">Ödenmedi</span>`;
    tr.innerHTML=`<td>${f.tarih}</td><td>${cariAd}</td><td>${durumHtml}</td><td>${fmt(f.genel_toplam, f.para_birimi)}</td><td style="display:flex; gap:5px;"><button class="primary" style="padding:4px 10px; font-size:11px;" data-pdf="${f.id}">PDF</button><button class="danger" style="padding:4px 10px; font-size:11px;" data-del="${f.id}">Sil</button></td>`;
    faturaListe.appendChild(tr);
  });
  faturaListe.querySelectorAll("[data-pdf]").forEach(btn=>{ btn.onclick = async () => { 
      const originalText = btn.textContent; btn.textContent = "İniyor..."; btn.disabled = true;
      await createPDF(btn.dataset.pdf); 
      btn.textContent = originalText; btn.disabled = false;
  }});
  faturaListe.querySelectorAll("[data-del]").forEach(btn=>{ btn.onclick = async () => { if(!confirm("Fatura silinsin mi?")) return; const id = btn.dataset.del; await supa.from("fatura_kalemler").delete().eq("fatura_id", id); await supa.from("faturalar").delete().eq("id", id); await logAction('faturalar', 'DELETE', id, {id:id}); alert("Silindi."); await fetchAll(); renderFaturalar(); }});
}
window.toggleFaturaDurum = async (id, yeniDurum) => {
    if(!confirm(`Faturayı "${yeniDurum}" olarak işaretleyip, kasaya ${yeniDurum==='Odendi' ? 'tahsilat eklemek' : 'tahsilatı silmek'} istiyor musun?`)) return;
    const fatura = FATURALAR.find(f => f.id == id); if(!fatura) return;
    const { error } = await supa.from('faturalar').update({ odeme_durumu: yeniDurum }).eq('id', id);
    if(error) return alert("Hata: " + error.message);
    if(yeniDurum === 'Odendi') {
        const kasa = HESAPLAR.find(h => h.tur === 'kasa') || HESAPLAR[0];
        if(kasa) { await supa.from('kasa_hareketler').insert({ user_id: USER.id, hesap_id: kasa.id, cari_id: fatura.cari_id, tur: 'tahsilat', tutar: fatura.genel_toplam, tarih: todayStr(), aciklama: `Fatura No: ${fatura.numara} Tahsilatı` }); }
    } else {
        const aciklama = `Fatura No: ${fatura.numara} Tahsilatı`;
        await supa.from('kasa_hareketler').delete().match({ cari_id: fatura.cari_id, aciklama: aciklama, tutar: fatura.genel_toplam });
    }
    await fetchAll(); renderFaturalar(); renderDash();
};

// --- KASA HESAPLARI VE HAREKETLERİ (DÜZENLEME EKLENDİ) ---
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
    await supa.from("kasa_hesaplar").insert({user_id: USER.id, ad: hAd.value, tur: hTur.value, acilis_bakiye: Number(hAc.value), para_birimi: hPara.value}); 
    await fetchHesaplar(); renderHesaplar(); 
};

document.getElementById('kEkleBtn').onclick = async ()=>{ 
    const payload = {
        user_id: USER.id, hesap_id: kHesap.value, tarih: kTarih.value, 
        tur: kTur.value, cari_id: kCari.value||null, 
        tutar: Number(kTutar.value), aciklama: kAciklama.value
    };

    let error;
    if(EDIT_HAREKET_ID) {
        // Güncelleme
        const res = await supa.from("kasa_hareketler").update(payload).eq('id', EDIT_HAREKET_ID);
        error = res.error;
    } else {
        // Yeni Ekleme
        const res = await supa.from("kasa_hareketler").insert(payload);
        error = res.error;
    }

    if(error) return alert(error.message);
    resetKasaForm();
    await fetchHareketler(); renderHareketler(); renderDash();
};

function renderHesaplar(){ hesapListe.innerHTML=""; HESAPLAR.forEach(h=>{ hesapListe.innerHTML+=`<tr><td>${h.ad}</td><td>${h.tur}</td><td>${h.para_birimi}</td></tr>`; }); }

function renderHareketler(){ 
    hareketListe.innerHTML=""; 
    HAREKETLER.forEach(h=>{ 
        const tr = document.createElement("tr");
        // Hareketi düzenle/sil butonlarıyla birlikte oluştur
        tr.innerHTML=`
            <td>${h.tarih}</td>
            <td><span class="tag">${h.tur}</span></td>
            <td>${fmt(h.tutar)}</td>
            <td>${h.aciklama || ''}</td>
            <td>
                <button class="warning" style="padding:4px 8px; font-size:11px;" data-edit="${h.id}">Düzenle</button>
                <button class="danger" style="padding:4px 8px; font-size:11px;" data-del="${h.id}">Sil</button>
            </td>
        `; 
        hareketListe.appendChild(tr); 
    }); 

    // Sil Butonları
    hareketListe.querySelectorAll("[data-del]").forEach(btn => {
        btn.onclick = async () => {
            if(!confirm("Bu hareketi silmek istiyor musun?")) return;
            await supa.from("kasa_hareketler").delete().eq("id", btn.dataset.del);
            await fetchHareketler(); renderHareketler(); renderDash();
        };
    });

    // Düzenle Butonları
    hareketListe.querySelectorAll("[data-edit]").forEach(btn => {
        btn.onclick = () => {
            const h = HAREKETLER.find(x => x.id == btn.dataset.edit);
            if(!h) return;
            
            // Formu doldur
            kHesap.value = h.hesap_id; kTur.value = h.tur; kTutar.value = h.tutar;
            kTarih.value = h.tarih; kAciklama.value = h.aciklama;
            if(h.cari_id) kCari.value = h.cari_id;

            // Modu güncelle
            EDIT_HAREKET_ID = h.id;
            const saveBtn = document.getElementById('kEkleBtn');
            saveBtn.textContent = "Hareketi Güncelle";
            saveBtn.classList.remove('success');
            saveBtn.classList.add('warning');
            
            // Sayfayı yukarı kaydır (mobilde görünmesi için)
            window.scrollTo(0,0);
        };
    });
}

// --- GELİR GİDER ---
async function fetchGG(){ const { data }=await supa.from("gelir_gider").select("*").order("tarih",{ascending:false}); GG=data||[]; }
function resetGGForm() { EDIT_GG_ID = null; ggKat.value=""; ggTutar.value=""; ggAc.value=""; const btn=document.getElementById('ggEkleBtn'); btn.textContent = "Ekle"; btn.classList.remove('warning'); }
document.getElementById('ggEkleBtn').onclick = async ()=>{ const payload = {user_id: USER.id, tarih: ggTarih.value, tur: ggTur.value, kategori: ggKat.value, tutar: Number(ggTutar.value), aciklama: ggAc.value}; let error; if(EDIT_GG_ID) { const res = await supa.from("gelir_gider").update(payload).eq('id', EDIT_GG_ID); error = res.error; } else { const res = await supa.from("gelir_gider").insert(payload); error = res.error; } if(error) return alert(error.message); resetGGForm(); await fetchGG(); renderGG(); renderDash(); };
function renderGG(){ ggListe.innerHTML=""; GG.forEach(g=>{ const tr = document.createElement("tr"); tr.innerHTML=`<td>${g.tarih}</td><td>${g.tur}</td><td>${fmt(g.tutar)}</td><td>${g.aciklama||''}</td><td><button class="warning" style="padding:4px;font-size:10px" data-edit="${g.id}">Düzenle</button><button class="danger" style="padding:4px;font-size:10px" data-del="${g.id}">Sil</button></td>`; ggListe.appendChild(tr); }); ggListe.querySelectorAll("[data-del]").forEach(b=>{ b.onclick=async()=>{ if(confirm("Sil?")) { await supa.from("gelir_gider").delete().eq("id", b.dataset.del); await fetchGG(); renderGG(); renderDash(); }}}); ggListe.querySelectorAll("[data-edit]").forEach(b=>{ b.onclick=()=>{ const g = GG.find(x=>x.id==b.dataset.edit); ggTur.value=g.tur; ggKat.value=g.kategori; ggTutar.value=g.tutar; ggAc.value=g.aciklama; ggTarih.value=g.tarih; EDIT_GG_ID = g.id; const btn = document.getElementById('ggEkleBtn'); btn.textContent = "Güncelle"; btn.classList.add('warning'); window.scrollTo(0,0); }}); }

function fillSelects(){ fCari.innerHTML = `<option value="">Seç</option>` + CARILER.map(c=>`<option value="${c.id}">${c.ad}</option>`).join(""); kUrun.innerHTML = `<option value="">Seç</option>` + URUNLER.map(u=>`<option value="${u.id}" data-price="${u.satis_fiyat}">${u.ad}</option>`).join(""); kUrun.onchange=()=>{ const opt=kUrun.selectedOptions[0]; if(opt) kFiyat.value=opt.dataset.price; }; kHesap.innerHTML = HESAPLAR.map(h=>`<option value="${h.id}">${h.ad} (${h.para_birimi})</option>`).join(""); kCari.innerHTML = `<option value="">Cari Yok</option>` + CARILER.map(c=>`<option value="${c.id}">${c.ad}</option>`).join(""); }
function renderAll(){ renderCariler(); renderUrunler(); renderHesaplar(); renderHareketler(); renderGG(); renderFaturalar(); renderDash(); }
document.querySelectorAll(".navbtn").forEach(b=>{ b.onclick=()=>{ document.querySelectorAll(".navbtn").forEach(x=>x.classList.remove("active")); b.classList.add("active"); document.querySelectorAll(".tab").forEach(t=>t.classList.add("hide")); document.getElementById("tab-"+b.dataset.tab).classList.remove("hide"); };});
fTarih.value=todayStr(); loadSession();

// --- EKSTRE MODAL ---
window.openEkstre = async (cariId) => {
    const modal = document.getElementById('modalEkstre');
    const cari = CARILER.find(c => c.id == cariId);
    if(!cari) return;
    document.getElementById('ekstreBaslik').textContent = `${cari.ad} - Ekstre Detayı`;
    const tbodyUrun = document.getElementById('ekstreUrunler');
    const tbodyOdeme = document.getElementById('ekstreOdemeler');
    tbodyUrun.innerHTML = "<tr><td colspan='5'>Yükleniyor...</td></tr>"; tbodyOdeme.innerHTML = "";
    modal.classList.remove('hide');

    const carininFaturalari = FATURALAR.filter(f => f.cari_id == cariId);
    const faturaIds = carininFaturalari.map(f => f.id);
    let satilanUrunler = [];
    if(faturaIds.length > 0) { 
        const { data } = await supa.from('fatura_kalemler').select('*, urunler(ad), faturalar(tarih, para_birimi)').in('fatura_id', faturaIds).order('id', {ascending: false}); 
        satilanUrunler = data || []; 
    }
    const odemeler = HAREKETLER.filter(h => h.cari_id == cariId);

    let toplamAlim = 0; let toplamOdeme = 0; let aktifParaBirimi = 'USD';
    tbodyUrun.innerHTML = "";
    satilanUrunler.forEach(item => {
        const tarih = item.faturalar ? item.faturalar.tarih : '-';
        const urunAd = item.urunler ? item.urunler.ad : 'Silinmiş Ürün';
        const pb = item.faturalar ? item.faturalar.para_birimi : 'USD';
        aktifParaBirimi = pb; 
        toplamAlim += Number(item.satir_tutar);
        tbodyUrun.innerHTML += `<tr><td>${tarih}</td><td>${urunAd}</td><td>${item.miktar}</td><td>${fmt(item.birim_fiyat, pb)}</td><td>${fmt(item.satir_tutar, pb)}</td></tr>`;
    });
    tbodyOdeme.innerHTML = "";
    odemeler.forEach(h => {
        const hesap = HESAPLAR.find(x => x.id == h.hesap_id);
        const pb = hesap ? hesap.para_birimi : 'USD';
        if(hesap) aktifParaBirimi = pb;
        toplamOdeme += Number(h.tutar);
        tbodyOdeme.innerHTML += `<tr><td>${h.tarih}</td><td><span class="tag">${h.tur}</span></td><td>${fmt(h.tutar, pb)}</td></tr>`;
    });
    document.getElementById('ekstreAlim').textContent = fmt(toplamAlim, aktifParaBirimi);
    document.getElementById('ekstreOdeme').textContent = fmt(toplamOdeme, aktifParaBirimi);
    document.getElementById('ekstreBakiye').textContent = fmt(toplamAlim - toplamOdeme, aktifParaBirimi);
};
window.closeEkstre = () => { document.getElementById('modalEkstre').classList.add('hide'); };

// --- GELİŞMİŞ ARAMA ---
function globalSearch() {
    const query = document.getElementById('searchInput').value.toLocaleLowerCase('tr-TR').trim();
    if (!query) return alert("Lütfen aranacak bir kelime girin.");
    const modal = document.getElementById('modalSearch');
    const tbodyCari = document.getElementById('searchResultCari');
    const tbodyUrun = document.getElementById('searchResultUrun');
    tbodyCari.innerHTML = ""; tbodyUrun.innerHTML = "";
    
    const foundCariler = CARILER.filter(c => (c.ad && c.ad.toLocaleLowerCase('tr-TR').includes(query)) || (c.tel && c.tel.includes(query)) || (c.adres && c.adres.toLocaleLowerCase('tr-TR').includes(query)) );
    if(foundCariler.length > 0) {
        foundCariler.forEach(c => {
            let totalSatis = 0;
            FATURALAR.filter(f => f.cari_id == c.id && f.tip === 'satis').forEach(f => totalSatis += Number(f.genel_toplam));
            let totalOdeme = 0;
            HAREKETLER.filter(h => h.cari_id == c.id && h.tur === 'tahsilat').forEach(h => totalOdeme += Number(h.tutar));
            const acilis = (Number(c.acilis_borc)||0) - (Number(c.acilis_alacak)||0);
            const guncelBakiye = acilis + totalSatis - totalOdeme; 

            tbodyCari.innerHTML += `<tr><td><strong>${c.ad}</strong><br><small>${c.mail || ''}</small></td><td>${c.tel || '-'}</td><td>${c.adres || '-'}</td><td style="color:${guncelBakiye >= 0 ? '#ef4444' : '#10b981'}">${fmt(guncelBakiye)}</td>
                <td>
                    <button class="info" style="padding:4px 8px; font-size:10px" onclick="document.getElementById('modalSearch').classList.add('hide'); openEkstre('${c.id}')">Ekstre</button>
                    <button class="warning" style="padding:4px 8px; font-size:10px" onclick="editCariFromSearch('${c.id}')">Düzenle</button>
                    <button class="danger" style="padding:4px 8px; font-size:10px" onclick="deleteCariFromSearch('${c.id}')">Sil</button>
                </td></tr>`;
        });
    } else { tbodyCari.innerHTML = "<tr><td colspan='5' style='text-align:center; color:#94a3b8;'>Eşleşen müşteri bulunamadı.</td></tr>"; }
    
    const foundCariIds = foundCariler.map(c => c.id);
    const relatedFaturas = FATURALAR.filter(f => foundCariIds.includes(f.cari_id) && f.tip === 'satis');
    const relatedFaturaIds = relatedFaturas.map(f => f.id);
    const relatedProductIds = TUM_KALEMLER.filter(k => relatedFaturaIds.includes(k.fatura_id)).map(k => k.urun_id);

    const foundUrunler = URUNLER.filter(u => 
        (u.ad && u.ad.toLocaleLowerCase('tr-TR').includes(query)) || 
        (u.kod && u.kod.toLocaleLowerCase('tr-TR').includes(query)) ||
        relatedProductIds.includes(u.id)
    );

    if(foundUrunler.length > 0) {
        foundUrunler.forEach(u => {
            const imgHtml = u.resim_url ? `<img src="${u.resim_url}" style="width:30px;height:30px;border-radius:4px;vertical-align:middle;margin-right:5px;">` : '';
            tbodyUrun.innerHTML += `<tr><td>${imgHtml} ${u.ad}</td><td>${u.kod || '-'}</td><td>${fmt(u.satis_fiyat, u.para_birimi)}</td><td>${u.stok_miktar} ${u.birim}</td>
                <td>
                    <button class="warning" style="padding:4px 8px; font-size:10px" onclick="editUrunFromSearch('${u.id}')">Düzenle</button>
                    <button class="danger" style="padding:4px 8px; font-size:10px" onclick="deleteUrunFromSearch('${u.id}')">Sil</button>
                </td></tr>`;
        });
    } else { tbodyUrun.innerHTML = "<tr><td colspan='5' style='text-align:center; color:#94a3b8;'>Eşleşen ürün bulunamadı.</td></tr>"; }
    modal.classList.remove('hide');
}
window.editCariFromSearch = (id) => { document.getElementById('modalSearch').classList.add('hide'); document.querySelector('button[data-tab="cariler"]').click(); const c = CARILER.find(x => x.id == id); if(c) { cariTur.value=c.tur; cariAd.value=c.ad; cariTel.value=c.tel; cariMail.value=c.mail; cariAdres.value=c.adres; cariABorc.value=c.acilis_borc; cariAAlacak.value=c.acilis_alacak; EDIT_CARI_ID = c.id; const b = document.getElementById('cariEkleBtn'); b.textContent="Güncelle"; b.classList.add('warning'); window.scrollTo(0,0); } };
window.deleteCariFromSearch = async (id) => { if(!confirm("Bu müşteriyi silmek istediğine emin misin?")) return; await supa.from("cariler").delete().eq("id", id); await fetchCariler(); renderCariler(); globalSearch(); };
window.editUrunFromSearch = (id) => { document.getElementById('modalSearch').classList.add('hide'); document.querySelector('button[data-tab="urunler"]').click(); const u = URUNLER.find(x => x.id == id); if(u) { uKod.value=u.kod||""; uAd.value=u.ad; uBirim.value=u.birim||""; uPara.value=u.para_birimi; uAlis.value=u.alis_fiyat; uSatis.value=u.satis_fiyat; uMin.value=u.min_stok; uStokManuel.value=u.stok_miktar; uKdv.value=u.kdv_oran; 
    EDIT_URUN_ID = u.id; IS_IMG_REMOVED = false; CURRENT_IMG_URL = u.resim_url;
    if(u.resim_url) { document.getElementById('uResimPreviewArea').classList.remove('hide'); document.getElementById('uResimPreview').src = u.resim_url; } else { document.getElementById('uResimPreviewArea').classList.add('hide'); }
    const b = document.getElementById('uKaydetBtn'); b.textContent="Güncelle"; b.classList.add('warning'); window.scrollTo(0,0); alert("Ürün bilgileri yüklendi."); } };
window.deleteUrunFromSearch = async (id) => { if(!confirm("Bu ürünü silmek istediğine emin misin?")) return; await supa.from("urunler").delete().eq("id", id); await fetchUrunler(); renderUrunler(); globalSearch(); };