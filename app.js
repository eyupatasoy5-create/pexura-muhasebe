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

// HELPER
const fmt = (n, curr='USD') => {
  let symbol = '$'; if(curr === 'TL') symbol = '₺'; if(curr === 'EUR') symbol = '€';
  return (Number(n||0)).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}) + " " + symbol;
};
const todayStr = ()=> new Date().toISOString().slice(0,10);
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    let icon = type === 'success' ? '✅' : '⚠️'; if(type === 'error') icon = '❌';
    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
}
window.openImageModal = (src) => { if (!src) return; document.getElementById('imgBigPreview').src = src; document.getElementById('modalImageView').classList.remove('hide'); }
window.closeImageModal = () => { document.getElementById('modalImageView').classList.add('hide'); }
function setAppView(mode) {
    if (mode === 'mobile') { document.body.classList.add('force-mobile'); document.body.classList.remove('force-desktop'); showToast("Mobil görünüm aktif.", "info"); } 
    else { document.body.classList.add('force-desktop'); document.body.classList.remove('force-mobile'); showToast("PC görünümü aktif.", "info"); }
}

// AUTH
async function register(){ const email = authEmail.value.trim(); const password = authPass.value.trim(); const { error } = await supa.auth.signUp({ email, password }); if(error) return showToast(error.message, "error"); showToast("Kayıt başarılı!", "success"); }
async function login(){ const email = authEmail.value.trim(); const password = authPass.value.trim(); const { error } = await supa.auth.signInWithPassword({ email, password }); if(error) return showToast(error.message, "error"); await loadSession(); }
async function logout(){ await supa.auth.signOut(); location.reload(); }
async function loadSession(){ const { data } = await supa.auth.getUser(); USER = data.user; if(USER){ const { data: roleData } = await supa.from('user_roles').select('role').eq('user_id', USER.id).single(); USER_ROLE = roleData ? roleData.role : 'personel'; authLoggedOut.classList.add("hide"); authLoggedIn.classList.remove("hide"); authUserMail.textContent = `${USER.email} (${USER_ROLE.toUpperCase()})`; applyRolePermissions(); await fetchAll(); } }
function applyRolePermissions(){ const adminTabs = ['dash', 'cariler', 'faturalar', 'kasa', 'gelirgider']; if(USER_ROLE === 'personel'){ adminTabs.forEach(id => { const btn = document.querySelector(`button[data-tab="${id}"]`); if(btn) btn.classList.add('hide'); }); document.querySelector(`button[data-tab="urunler"]`).click(); document.getElementById('uEkleCard').classList.add('hide'); } else { adminTabs.forEach(id => { const btn = document.querySelector(`button[data-tab="${id}"]`); if(btn) btn.classList.remove('hide'); }); document.getElementById('uEkleCard').classList.remove('hide'); document.querySelector(`button[data-tab="dash"]`).click(); } }
document.getElementById('btnRegister').onclick=register; document.getElementById('btnLogin').onclick=login; document.getElementById('btnLogout').onclick=logout;

// DATA FETCH
async function fetchAll(){ if(USER_ROLE === 'personel'){ await fetchUrunler(); } else { await Promise.all([fetchCariler(),fetchUrunler(),fetchHesaplar(),fetchHareketler(),fetchGG(),fetchFaturalar()]); await fetchTumKalemler(); } fillSelects(); renderAll(); }
async function fetchTumKalemler() { const { data } = await supa.from('fatura_kalemler').select('*'); TUM_KALEMLER = data || []; }

// DASHBOARD
function renderDash(){
    const currElem = document.getElementById('dashCurrencySelect'); const curr = currElem ? currElem.value : 'USD';
    const filteredUrun = URUNLER.filter(u => u.para_birimi === curr);
    let totalStockVal = 0; filteredUrun.forEach(u => { totalStockVal += (Number(u.stok_miktar) || 0) * (Number(u.satis_fiyat) || 0); });
    document.getElementById('dashStokDeger').innerHTML = `<span style="font-size:0.6em; color:#94a3b8">${filteredUrun.length} Çeşit</span><br>${fmt(totalStockVal, curr)}`;
    let totalSales = 0; FATURALAR.filter(f => f.tip === 'satis' && f.para_birimi === curr).forEach(f => { totalSales += Number(f.genel_toplam); });
    document.getElementById('dashToplamSatis').textContent = fmt(totalSales, curr);
    let income = 0; let expense = 0; HAREKETLER.forEach(h => { const hesap = HESAPLAR.find(x => x.id == h.hesap_id); if(hesap && hesap.para_birimi === curr) { if(h.tur === 'tahsilat') income += Number(h.tutar); if(h.tur === 'odeme') expense += Number(h.tutar); } }); GG.forEach(g => { if(g.tur === 'gelir') income += Number(g.tutar); if(g.tur === 'gider') expense += Number(g.tutar); });
    const balance = income - expense; document.getElementById('dashNakit').innerHTML = `<span style="color:${balance >= 0 ? '#4ade80' : '#ef4444'}">${fmt(balance, curr)}</span>`;
    const kritikListe = document.getElementById('dashKritikListe'); kritikListe.innerHTML = ""; URUNLER.forEach(u => { if(Number(u.stok_miktar) <= Number(u.min_stok)){ kritikListe.innerHTML += `<tr><td>${u.ad}</td><td><span style="color:red;font-weight:bold">${u.stok_miktar}</span></td><td>${u.min_stok}</td></tr>`; } });
    const combinedMoves = [ ...HAREKETLER.map(h => ({tarih: h.tarih, tur: h.tur, tutar: h.tutar, pb: HESAPLAR.find(x=>x.id==h.hesap_id)?.para_birimi || 'USD'})), ...GG.map(g => ({tarih: g.tarih, tur: g.tur, tutar: g.tutar, pb: 'USD'})) ];
    combinedMoves.sort((a,b) => new Date(b.tarih) - new Date(a.tarih));
    const sonHareketler = document.getElementById('dashSonHareketler'); sonHareketler.innerHTML = "";
    combinedMoves.slice(0, 5).forEach(m => { sonHareketler.innerHTML += `<tr><td>${m.tarih}</td><td><span class="tag">${m.tur}</span></td><td>${Number(m.tutar).toLocaleString('en-US')} ${m.pb === 'TL' ? '₺' : '$'}</td></tr>`; });
}
const dSel = document.getElementById('dashCurrencySelect'); if(dSel) dSel.onchange = renderDash;

// ACTIONS & PDF
async function logAction(tableName, actionType, recordId, oldData = null) { if(!USER) return; await supa.from('system_logs').insert({ user_id: USER.id, table_name: tableName, action_type: actionType, record_id: recordId, old_data: oldData }); }
function trFix(text) { if(!text) return ""; const map = { 'ğ': 'g', 'Ğ': 'G', 'ş': 's', 'Ş': 'S', 'ı': 'i', 'İ': 'I', 'ü': 'u', 'Ü': 'U', 'ö': 'o', 'Ö': 'O', 'ç': 'c', 'Ç': 'C' }; return text.toString().replace(/[ğĞşŞıİüÜöÖçÇ]/g, (letter) => map[letter]); }

async function generateAndSharePDF(fatura, mode = 'download') {
    try {
        if (!window.jspdf) { showToast("PDF kütüphanesi eksik.", "error"); return; }
        const { jsPDF } = window.jspdf; const doc = new jsPDF();
        const { data: kalemler } = await supa.from('fatura_kalemler').select('*, urunler(ad)').eq('fatura_id', fatura.id);
        const { data: cari } = await supa.from('cariler').select('ad, tel').eq('id', fatura.cari_id).single();
        const cariAd = cari ? cari.ad : 'Bilinmiyor'; const cariTel = cari ? cari.tel : '';

        doc.setTextColor(59, 130, 246); doc.setFont("helvetica", "bold"); doc.setFontSize(24); doc.text("PEXURA TECH", 14, 20);
        doc.setTextColor(0, 0, 0); doc.setFontSize(14); doc.text(trFix(fatura.tip === 'satis' ? 'SATIS FATURASI' : 'ALIS FATURASI'), 14, 30);
        doc.setFontSize(10);
        if (fatura.odeme_durumu === 'Odendi') { doc.setTextColor(0, 128, 0); } else { doc.setTextColor(255, 0, 0); }
        doc.text(`DURUM: ${fatura.odeme_durumu === 'Odendi' ? 'ODENDI' : 'ODENMEDI'}`, 140, 30);
        doc.setTextColor(0,0,0); doc.text(`Tarih: ${fatura.tarih}`, 14, 40); doc.text(`Fatura No: ${fatura.numara}`, 14, 45); doc.text(`Cari: ${trFix(cariAd)}`, 14, 50);
      
        const tableData = (kalemler || []).map(k => [ trFix(k.urunler ? k.urunler.ad : 'Silinmis Urun'), k.miktar, fmt(k.birim_fiyat, fatura.para_birimi), fmt(k.satir_tutar, fatura.para_birimi) ]);
        doc.autoTable({ startY: 60, head: [['Urun', 'Miktar', 'Birim Fiyat', 'Tutar']], body: tableData, theme: 'grid', headStyles: { fillColor: [59, 130, 246] }, foot: [['', '', 'GENEL TOPLAM', fmt(fatura.genel_toplam, fatura.para_birimi)]] });
        const fileName = `Pexura_Fatura_${fatura.numara}.pdf`;
        
        if (mode === 'download') { doc.save(fileName); } 
        else if (mode === 'whatsapp') {
            doc.save(fileName);
            if (cariTel) {
                let cleanPhone = cariTel.replace(/[^0-9]/g, '');
                if(cleanPhone.startsWith('0')) cleanPhone = cleanPhone.substring(1);
                if(cleanPhone.length === 10) cleanPhone = '90' + cleanPhone;
                window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent("Sayın " + cariAd + ", faturanız ektedir.")}`, '_blank');
            } else { showToast("Müşteri telefonu yok.", "warning"); }
        }
    } catch (err) { console.error(err); showToast("PDF Hatası: " + err.message, "error"); }
}

// --- CARİLER ---
async function fetchCariler(){ const { data } = await supa.from("cariler").select("*").order("ad"); CARILER = data||[]; }
function resetCariForm() { EDIT_CARI_ID = null; cariAd.value = ""; cariTel.value = ""; cariMail.value = ""; cariAdres.value = ""; cariABorc.value = ""; cariAAlacak.value = ""; const btn = document.getElementById('cariEkleBtn'); btn.textContent = "Kaydet"; btn.classList.remove('warning'); }
document.getElementById('cariEkleBtn').onclick = async ()=>{
  if(!cariAd.value) return showToast("Ad zorunlu", "warning");
  const payload = { user_id: USER.id, tur: cariTur.value, ad: cariAd.value, tel: cariTel.value, mail: cariMail.value, adres: cariAdres.value, acilis_borc: Number(cariABorc.value), acilis_alacak: Number(cariAAlacak.value) };
  let error;
  if(EDIT_CARI_ID) { const oldRec = CARILER.find(c => c.id == EDIT_CARI_ID); await logAction('cariler', 'UPDATE', EDIT_CARI_ID, oldRec); const res = await supa.from("cariler").update(payload).eq('id', EDIT_CARI_ID); error = res.error; if(!error) showToast("Müşteri güncellendi", "success"); } 
  else { const res = await supa.from("cariler").insert(payload).select().single(); error = res.error; if(res.data) await logAction('cariler', 'INSERT', res.data.id); if(!error) showToast("Müşteri eklendi", "success"); }
  if(error) return showToast(error.message, "error"); resetCariForm(); await fetchCariler(); fillSelects(); renderCariler();
};
function renderCariler(){
  cariListe.innerHTML="";
  CARILER.forEach(c=>{
    const tr=document.createElement("tr");
    tr.innerHTML=`<td onclick="openCariPanel('${c.id}')" style="cursor:pointer;"><span style="font-weight:bold; font-size:16px; color:#60a5fa;">${c.ad}</span><br><small class="muted">${c.tel||'-'}</small></td><td><span class="tag">${c.tur}</span></td><td><div class="btn-group"><button class="info" onclick="openEkstre('${c.id}')">Ekstre</button><button class="warning" onclick="editCari('${c.id}')">Düzenle</button><button class="danger" data-del="${c.id}">Sil</button></div></td>`;
    cariListe.appendChild(tr);
  });
  cariListe.querySelectorAll("[data-del]").forEach(btn=>{ btn.onclick=async ()=>{ if(confirm("Sil?")){ const id = btn.dataset.del; const oldRec = CARILER.find(c => c.id == id); await logAction('cariler', 'DELETE', id, oldRec); await supa.from("cariler").delete().eq("id", id); await fetchCariler(); renderCariler(); showToast("Silindi", "success"); }}; });
}
window.editCari = (id) => { const c = CARILER.find(x => x.id == id); if(c) { cariTur.value=c.tur; cariAd.value=c.ad; cariTel.value=c.tel; cariMail.value=c.mail; cariAdres.value=c.adres; cariABorc.value=c.acilis_borc; cariAAlacak.value=c.acilis_alacak; EDIT_CARI_ID = c.id; document.getElementById('cariEkleBtn').textContent="Güncelle"; document.getElementById('cariEkleBtn').classList.add('warning'); document.querySelector('button[data-tab="cariler"]').click(); window.scrollTo(0,0); } };

// --- ÜRÜNLER ---
async function fetchUrunler(){ const { data } = await supa.from("urunler").select("*").order("ad"); URUNLER=data||[]; }
function resetUrunForm() { EDIT_URUN_ID = null; uKod.value=""; uAd.value=""; uBirim.value=""; uMin.value=""; uAlis.value=""; uSatis.value=""; uKdv.value="0"; uStokManuel.value=""; document.getElementById('uResimInput').value = ""; CURRENT_IMG_URL = null; IS_IMG_REMOVED = false; document.getElementById('uResimPreviewArea').classList.add('hide'); document.getElementById('uResimPreview').src = ""; const btn = document.getElementById('uKaydetBtn'); btn.textContent = "Kaydet"; btn.classList.remove('warning'); }
window.removeCurrentImage = () => { IS_IMG_REMOVED = true; document.getElementById('uResimPreviewArea').classList.add('hide'); };
document.getElementById('uKaydetBtn').onclick = async ()=>{
  if(!uAd.value) return showToast("Ad zorunlu", "warning");
  let uploadedImageUrl = null; const fileInput = document.getElementById('uResimInput'); const file = fileInput.files[0];
  if(file) { const fileName = `urun_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '')}`; const { error } = await supa.storage.from('urun-resimleri').upload(fileName, file); if(error) return showToast(error.message, "error"); const { data: publicData } = supa.storage.from('urun-resimleri').getPublicUrl(fileName); uploadedImageUrl = publicData.publicUrl; }
  const payload={ user_id: USER.id, kod: uKod.value, ad: uAd.value, birim: uBirim.value, min_stok: Number(uMin.value), alis_fiyat: Number(uAlis.value), satis_fiyat: Number(uSatis.value), para_birimi: uPara.value, kdv_oran: Number(uKdv.value), stok_miktar: Number(uStokManuel.value) };
  if(uploadedImageUrl) { payload.resim_url = uploadedImageUrl; } else if (IS_IMG_REMOVED) { payload.resim_url = null; } 
  let error;
  if(EDIT_URUN_ID) { const oldRec = URUNLER.find(u => u.id == EDIT_URUN_ID); await logAction('urunler', 'UPDATE', EDIT_URUN_ID, oldRec); const res = await supa.from("urunler").update(payload).eq('id', EDIT_URUN_ID); error = res.error; if(!error) showToast("Ürün güncellendi", "success"); } 
  else { const res = await supa.from("urunler").insert(payload).select().single(); error = res.error; if(res.data) await logAction('urunler', 'INSERT', res.data.id); if(!error) showToast("Ürün eklendi", "success"); }
  if(error) return showToast(error.message, "error"); resetUrunForm(); await fetchUrunler(); fillSelects(); renderUrunler();
};
function renderUrunler(){ uListe.innerHTML=""; URUNLER.forEach(u=>{ const krit = Number(u.stok_miktar||0) <= Number(u.min_stok||0); const delBtn = USER_ROLE==='admin' ? `<button class="danger" data-del="${u.id}">Sil</button>` : ''; const editBtn = USER_ROLE==='admin' ? `<button class="warning" data-edit="${u.id}">Düzenle</button>` : ''; const imgHtml = u.resim_url ? `<img src="${u.resim_url}" class="urun-img" onclick="openImageModal('${u.resim_url}')">` : `<div style="width:250px;height:250px;background:#334155;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:14px;color:#94a3b8;border:3px dashed #475569;text-align:center;">Resim<br>Yok</div>`; const tr=document.createElement("tr"); tr.innerHTML=`<td style="padding: 20px;">${imgHtml}</td><td style="font-size:16px;">${u.kod||""}</td><td style="font-weight:bold;font-size:18px;">${u.ad} ${krit?'<br><span class="tag" style="background:red;color:white;margin-top:5px">KRİTİK</span>':""}</td><td style="font-size:16px;">${u.stok_miktar} ${u.birim||""}</td><td style="font-size:18px;color:#4ade80;font-weight:bold;">${fmt(u.satis_fiyat, u.para_birimi)}</td><td><div style="display:flex;gap:10px;align-items:center;height:250px;">${editBtn}${delBtn}</div></td>`; uListe.appendChild(tr); }); if(USER_ROLE==='admin'){ uListe.querySelectorAll("[data-del]").forEach(btn=>{ btn.onclick=async ()=>{ if(confirm("Sil?")){ const id = btn.dataset.del; const oldRec = URUNLER.find(u => u.id == id); await logAction('urunler', 'DELETE', id, oldRec); await supa.from("urunler").delete().eq("id", id); await fetchUrunler(); renderUrunler(); showToast("Ürün silindi", "success"); } }; }); uListe.querySelectorAll("[data-edit]").forEach(btn=>{ btn.onclick=()=>{ const u = URUNLER.find(x=>x.id==btn.dataset.edit); uKod.value=u.kod||""; uAd.value=u.ad; uBirim.value=u.birim||""; uPara.value=u.para_birimi; uAlis.value=u.alis_fiyat; uSatis.value=u.satis_fiyat; uMin.value=u.min_stok; uStokManuel.value=u.stok_miktar; uKdv.value=u.kdv_oran; EDIT_URUN_ID = u.id; IS_IMG_REMOVED = false; CURRENT_IMG_URL = u.resim_url; if(u.resim_url) { document.getElementById('uResimPreviewArea').classList.remove('hide'); document.getElementById('uResimPreview').src = u.resim_url; } else { document.getElementById('uResimPreviewArea').classList.add('hide'); } const b = document.getElementById('uKaydetBtn'); b.textContent="Güncelle"; b.classList.add('warning'); window.scrollTo(0,0); showToast("Ürün bilgileri yüklendi", "info"); }}); } }

// --- FATURALAR ---
let FATURA_SATIRLAR=[];
async function fetchFaturalar(){ const { data }=await supa.from("faturalar").select("*, cariler(ad)").order("tarih",{ascending:false}); FATURALAR=data||[]; }
document.getElementById('kalemEkleBtn').onclick=()=>{
  const urun=URUNLER.find(u=>u.id===kUrun.value); if(!urun) return showToast("Ürün seç", "warning");
  FATURA_SATIRLAR.push({ urun_id: urun.id, urun_ad: urun.ad, miktar: Number(kMiktar.value), birim_fiyat: Number(kFiyat.value), kdv_oran: Number(kKdv.value), satir_tutar: Number(kMiktar.value) * Number(kFiyat.value) });
  renderKalemler(); calcFaturaTotals();
};
function renderKalemler(){ kalemListe.innerHTML=""; FATURA_SATIRLAR.forEach((s,i)=>{ const tr=document.createElement("tr"); tr.innerHTML=`<td>${s.urun_ad}</td><td>${s.miktar}</td><td>${fmt(s.birim_fiyat)}</td><td>${fmt(s.satir_tutar)}</td><td><button class="danger" data-i="${i}">X</button></td>`; kalemListe.appendChild(tr); }); kalemListe.querySelectorAll("[data-i]").forEach(btn=>{ btn.onclick=()=>{ FATURA_SATIRLAR.splice(Number(btn.dataset.i),1); renderKalemler(); calcFaturaTotals(); }; }); }
function calcFaturaTotals(){ let top=0; FATURA_SATIRLAR.forEach(s=> top+=s.satir_tutar); fGenel.textContent = fmt(top); return top; }
function resetFaturaForm() { EDIT_FATURA_ID = null; FATURA_SATIRLAR = []; fNo.value = ""; fCari.value = ""; fTarih.value = todayStr(); fDurum.value = "Odenmedi"; fGenel.textContent = "0"; document.getElementById('fKaydetBtn').textContent = "FATURAYI ONAYLA"; document.getElementById('fKaydetBtn').classList.remove('warning'); renderKalemler(); }
window.editFatura = async (id) => {
    const fatura = FATURALAR.find(f => f.id == id); if (!fatura) return showToast("Fatura bulunamadı!", "error");
    const { data: kalemler, error } = await supa.from('fatura_kalemler').select('*, urunler(ad)').eq('fatura_id', id); if(error) return showToast("Kalemler çekilemedi!", "error");
    fTip.value = fatura.tip; fPara.value = fatura.para_birimi; fNo.value = fatura.numara; fTarih.value = fatura.tarih; fDurum.value = fatura.odeme_durumu; fCari.value = fatura.cari_id;
    FATURA_SATIRLAR = kalemler.map(k => ({ urun_id: k.urun_id, urun_ad: k.urunler ? k.urunler.ad : "Bilinmeyen Ürün", miktar: k.miktar, birim_fiyat: k.birim_fiyat, kdv_oran: k.kdv_oran, satir_tutar: k.satir_tutar }));
    renderKalemler(); calcFaturaTotals(); EDIT_FATURA_ID = fatura.id; const btn = document.getElementById('fKaydetBtn'); btn.textContent = "FATURAYI GÜNCELLE"; btn.classList.add('warning');
    document.querySelector(`button[data-tab="faturalar"]`).click(); window.scrollTo(0, 0); showToast("Düzenleme modu aktif.", "info");
};
document.getElementById('fKaydetBtn').onclick=async ()=>{
  if(FATURA_SATIRLAR.length===0) return showToast("Kalem yok", "warning");
  const total = calcFaturaTotals(); const selectedCari = CARILER.find(c => c.id === fCari.value);
  if (EDIT_FATURA_ID) {
      const { data: eskiKalemler } = await supa.from('fatura_kalemler').select('*').eq('fatura_id', EDIT_FATURA_ID);
      for(const k of eskiKalemler) { const iadeDegisim = fTip.value === "satis" ? k.miktar : -k.miktar; await supa.rpc("stok_guncelle", { p_urun_id: k.urun_id, p_degisim: iadeDegisim }); }
      await supa.from('fatura_kalemler').delete().eq('fatura_id', EDIT_FATURA_ID);
      const eskiFatura = FATURALAR.find(f => f.id == EDIT_FATURA_ID);
      await supa.from('kasa_hareketler').delete().match({ aciklama: `Fatura No: ${eskiFatura.numara} Tahsilatı` });
      await supa.from('faturalar').update({ tip: fTip.value, cari_id: fCari.value, tarih: fTarih.value, numara: fNo.value, genel_toplam: total, para_birimi: fPara.value, odeme_durumu: fDurum.value }).eq('id', EDIT_FATURA_ID);
      const kalemler = FATURA_SATIRLAR.map(s=>({ fatura_id: EDIT_FATURA_ID, urun_id: s.urun_id, miktar: s.miktar, birim_fiyat: s.birim_fiyat, kdv_oran: s.kdv_oran, satir_tutar: s.satir_tutar }));
      await supa.from("fatura_kalemler").insert(kalemler);
      for(const s of FATURA_SATIRLAR){ const degisim = fTip.value==="satis" ? -s.miktar : +s.miktar; await supa.rpc("stok_guncelle", { p_urun_id: s.urun_id, p_degisim: degisim }); }
      if(fDurum.value === 'Odendi' && fTip.value === 'satis') { const kasa = HESAPLAR.find(h => h.tur === 'kasa') || HESAPLAR[0]; if(kasa) { await supa.from('kasa_hareketler').insert({ user_id: USER.id, hesap_id: kasa.id, cari_id: fCari.value, tur: 'tahsilat', tutar: total, tarih: fTarih.value, aciklama: `Fatura No: ${fNo.value} Tahsilatı` }); } }
      showToast("Fatura güncellendi.", "success"); resetFaturaForm();
  } else {
      const { data: inserted, error } = await supa.from("faturalar").insert({ user_id: USER.id, tip: fTip.value, cari_id: fCari.value, tarih: fTarih.value, numara: fNo.value, genel_toplam: total, para_birimi: fPara.value, odeme_durumu: fDurum.value }).select().single();
      if(error) return showToast(error.message, "error");
      await logAction('faturalar', 'INSERT', inserted.id);
      const kalemler = FATURA_SATIRLAR.map(s=>({ fatura_id: inserted.id, urun_id: s.urun_id, miktar: s.miktar, birim_fiyat: s.birim_fiyat, kdv_oran: s.kdv_oran, satir_tutar: s.satir_tutar }));
      await supa.from("fatura_kalemler").insert(kalemler);
      for(const s of FATURA_SATIRLAR){ const degisim = fTip.value==="satis" ? -s.miktar : +s.miktar; await supa.rpc("stok_guncelle", { p_urun_id: s.urun_id, p_degisim: degisim }); }
      if(fDurum.value === 'Odendi' && fTip.value === 'satis') { const kasa = HESAPLAR.find(h => h.tur === 'kasa') || HESAPLAR[0]; if(kasa) { await supa.from('kasa_hareketler').insert({ user_id: USER.id, hesap_id: kasa.id, cari_id: fCari.value, tur: 'tahsilat', tutar: total, tarih: fTarih.value, aciklama: `Fatura No: ${fNo.value} Tahsilatı` }); } }
      if(fWhatsappCheck.checked && selectedCari && selectedCari.tel){ if(confirm("WhatsApp ile PDF göndermek istiyor musunuz?")) { inserted.cariler = { ad: selectedCari.ad, tel: selectedCari.tel }; await generateAndSharePDF(inserted, 'whatsapp'); } else { showToast("Fatura kaydedildi.", "success"); } } else { showToast("Fatura kaydedildi.", "success"); }
      resetFaturaForm();
  }
  await fetchAll(); renderAll();
};
function renderFaturalar(){
  faturaListe.innerHTML="";
  FATURALAR.forEach(f=>{
    const tr=document.createElement("tr"); const cariAd = f.cariler ? f.cariler.ad : 'Silinmiş Cari';
    const durumHtml = f.odeme_durumu === 'Odendi' ? `<span class="tag odendi" style="cursor:pointer" title="Değiştir" onclick="toggleFaturaDurum('${f.id}','Odenmedi')">Ödendi</span>` : `<span class="tag odenmedi" style="cursor:pointer" title="Değiştir" onclick="toggleFaturaDurum('${f.id}','Odendi')">Ödenmedi</span>`;
    tr.innerHTML=`<td>${f.tarih}</td><td>${cariAd}</td><td>${durumHtml}</td><td>${fmt(f.genel_toplam, f.para_birimi)}</td><td><div class="btn-group"><button class="primary" data-pdf="${f.id}">PDF</button><button class="info" onclick="openEkstre('${f.cari_id}')">Ekstre</button><button class="warning" onclick="editFatura('${f.id}')">Düzenle</button><button class="danger" data-del="${f.id}">Sil</button></div></td>`;
    faturaListe.appendChild(tr);
  });
  faturaListe.querySelectorAll("[data-pdf]").forEach(btn=>{ btn.onclick = async () => { const originalText = btn.textContent; btn.textContent = "İniyor..."; btn.disabled = true; try { await generateAndSharePDF({id: btn.dataset.pdf}, 'download'); } catch(e) { showToast(e, "error"); } finally { btn.textContent = originalText; btn.disabled = false; } } });
  faturaListe.querySelectorAll("[data-del]").forEach(btn=>{ btn.onclick = async () => { if(!confirm("Fatura silinsin mi?")) return; const id = btn.dataset.del; await supa.from("fatura_kalemler").delete().eq("fatura_id", id); await supa.from("faturalar").delete().eq("id", id); await logAction('faturalar', 'DELETE', id, {id:id}); showToast("Silindi.", "success"); await fetchAll(); renderFaturalar(); }});
}
window.toggleFaturaDurum = async (id, yeniDurum) => {
    if(!confirm(`Durumu "${yeniDurum}" olarak değiştirip kasayı güncellemek istiyor musun?`)) return;
    const fatura = FATURALAR.find(f => f.id == id); if(!fatura) return;
    const { error } = await supa.from('faturalar').update({ odeme_durumu: yeniDurum }).eq('id', id);
    if(error) return showToast(error.message, "error");
    if(yeniDurum === 'Odendi') { const kasa = HESAPLAR.find(h => h.tur === 'kasa') || HESAPLAR[0]; if(kasa) { await supa.from('kasa_hareketler').insert({ user_id: USER.id, hesap_id: kasa.id, cari_id: fatura.cari_id, tur: 'tahsilat', tutar: fatura.genel_toplam, tarih: todayStr(), aciklama: `Fatura No: ${fatura.numara} Tahsilatı` }); } } 
    else { await supa.from('kasa_hareketler').delete().match({ cari_id: fatura.cari_id, aciklama: `Fatura No: ${fatura.numara} Tahsilatı`, tutar: fatura.genel_toplam }); }
    await fetchAll(); renderFaturalar(); renderDash(); showToast("Durum güncellendi.", "success");
};

// --- KASA & HAREKETLER ---
async function fetchHesaplar(){ const { data } = await supa.from("kasa_hesaplar").select("*"); HESAPLAR=data||[]; }
async function fetchHareketler(){ const { data }=await supa.from("kasa_hareketler").select("*").order("tarih",{ascending:false}); HAREKETLER=data||[]; }
function resetKasaForm() { EDIT_HAREKET_ID = null; kTutar.value = ""; kAciklama.value = ""; kTarih.value = todayStr(); const btn = document.getElementById('kEkleBtn'); btn.textContent = "İşlemi Kaydet"; btn.classList.remove('warning'); btn.classList.add('success'); }
document.getElementById('hEkleBtn').onclick = async ()=>{ await supa.from("kasa_hesaplar").insert({user_id: USER.id, ad: hAd.value, tur: hTur.value, acilis_bakiye: Number(hAc.value), para_birimi: hPara.value}); await fetchHesaplar(); renderHesaplar(); };
document.getElementById('kEkleBtn').onclick = async ()=>{ 
    const payload = { user_id: USER.id, hesap_id: kHesap.value, tarih: kTarih.value, tur: kTur.value, cari_id: kCari.value||null, tutar: Number(kTutar.value), aciklama: kAciklama.value };
    let error; if(EDIT_HAREKET_ID) { const res = await supa.from("kasa_hareketler").update(payload).eq('id', EDIT_HAREKET_ID); error = res.error; } else { const res = await supa.from("kasa_hareketler").insert(payload); error = res.error; }
    if(error) return showToast(error.message, "error"); resetKasaForm(); await fetchHareketler(); renderHareketler(); renderDash(); showToast("İşlem kaydedildi.", "success");
};
function renderHesaplar(){ hesapListe.innerHTML=""; HESAPLAR.forEach(h=>{ hesapListe.innerHTML+=`<tr><td>${h.ad}</td><td>${h.tur}</td><td>${h.para_birimi}</td></tr>`; }); }
function renderHareketler(){ 
    hareketListe.innerHTML=""; 
    HAREKETLER.forEach(h=>{ 
        const tr = document.createElement("tr");
        tr.innerHTML=`<td>${h.tarih}</td><td><span class="tag">${h.tur}</span></td><td>${fmt(h.tutar)}</td><td>${h.aciklama || ''}</td><td><button class="warning" style="padding:4px 8px; font-size:11px;" data-edit="${h.id}">Düzenle</button><button class="danger" style="padding:4px 8px; font-size:11px;" data-del="${h.id}">Sil</button></td>`; 
        hareketListe.appendChild(tr); 
    }); 
    hareketListe.querySelectorAll("[data-del]").forEach(btn => { btn.onclick = async () => { if(!confirm("Bu hareketi silmek istiyor musun?")) return; await supa.from("kasa_hareketler").delete().eq("id", btn.dataset.del); await fetchHareketler(); renderHareketler(); renderDash(); showToast("Silindi.", "success"); }; });
    hareketListe.querySelectorAll("[data-edit]").forEach(btn => { btn.onclick = () => { const h = HAREKETLER.find(x => x.id == btn.dataset.edit); if(!h) return; kHesap.value = h.hesap_id; kTur.value = h.tur; kTutar.value = h.tutar; kTarih.value = h.tarih; kAciklama.value = h.aciklama; if(h.cari_id) kCari.value = h.cari_id; EDIT_HAREKET_ID = h.id; const saveBtn = document.getElementById('kEkleBtn'); saveBtn.textContent = "Hareketi Güncelle"; saveBtn.classList.remove('success'); saveBtn.classList.add('warning'); window.scrollTo(0,0); }; });
}

// --- GELİR GİDER ---
async function fetchGG(){ const { data }=await supa.from("gelir_gider").select("*").order("tarih",{ascending:false}); GG=data||[]; }
function resetGGForm() { EDIT_GG_ID = null; ggKat.value=""; ggTutar.value=""; ggAc.value=""; const btn=document.getElementById('ggEkleBtn'); btn.textContent = "Ekle"; btn.classList.remove('warning'); }
document.getElementById('ggEkleBtn').onclick = async ()=>{ const payload = {user_id: USER.id, tarih: ggTarih.value, tur: ggTur.value, kategori: ggKat.value, tutar: Number(ggTutar.value), aciklama: ggAc.value}; let error; if(EDIT_GG_ID) { const res = await supa.from("gelir_gider").update(payload).eq('id', EDIT_GG_ID); error = res.error; } else { const res = await supa.from("gelir_gider").insert(payload); error = res.error; } if(error) return showToast(error.message, "error"); resetGGForm(); await fetchGG(); renderGG(); renderDash(); showToast("Kaydedildi.", "success"); };
function renderGG(){ ggListe.innerHTML=""; GG.forEach(g=>{ const tr = document.createElement("tr"); tr.innerHTML=`<td>${g.tarih}</td><td>${g.tur}</td><td>${fmt(g.tutar)}</td><td>${g.aciklama||''}</td><td><div class="btn-group"><button class="warning" style="padding:4px;font-size:10px" data-edit="${g.id}">Düzenle</button><button class="danger" style="padding:4px;font-size:10px" data-del="${g.id}">Sil</button></div></td>`; ggListe.appendChild(tr); }); ggListe.querySelectorAll("[data-del]").forEach(b=>{ b.onclick=async()=>{ if(confirm("Sil?")) { await supa.from("gelir_gider").delete().eq("id", b.dataset.del); await fetchGG(); renderGG(); renderDash(); showToast("Silindi.", "success"); }}}); ggListe.querySelectorAll("[data-edit]").forEach(b=>{ b.onclick=()=>{ const g = GG.find(x=>x.id==b.dataset.edit); ggTur.value=g.tur; ggKat.value=g.kategori; ggTutar.value=g.tutar; ggAc.value=g.aciklama; ggTarih.value=g.tarih; EDIT_GG_ID = g.id; const btn = document.getElementById('ggEkleBtn'); btn.textContent = "Güncelle"; btn.classList.add('warning'); window.scrollTo(0,0); }}); }
function fillSelects(){ fCari.innerHTML = `<option value="">Seç</option>` + CARILER.map(c=>`<option value="${c.id}">${c.ad}</option>`).join(""); kUrun.innerHTML = `<option value="">Seç</option>` + URUNLER.map(u=>`<option value="${u.id}" data-price="${u.satis_fiyat}">${u.ad}</option>`).join(""); kUrun.onchange=()=>{ const opt=kUrun.selectedOptions[0]; if(opt) kFiyat.value=opt.dataset.price; }; kHesap.innerHTML = HESAPLAR.map(h=>`<option value="${h.id}">${h.ad} (${h.para_birimi})</option>`).join(""); kCari.innerHTML = `<option value="">Cari Yok</option>` + CARILER.map(c=>`<option value="${c.id}">${c.ad}</option>`).join(""); }
function renderAll(){ renderCariler(); renderUrunler(); renderHesaplar(); renderHareketler(); renderGG(); renderFaturalar(); renderDash(); }

// NAVIGASYON (TAB GECISLERI)
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

fTarih.value=todayStr(); loadSession();
document.getElementById('kKdv').value = "0"; document.getElementById('uKdv').value = "0";
// --- BACKUP SCHEDULE ---
setInterval(() => { const now = new Date(); if (now.getDay() === 0 && now.getHours() === 9 && now.getMinutes() <= 1) { const last = localStorage.getItem('PexuraAutoBackup'); const today = now.toDateString(); if (last !== today) { document.getElementById('backupBtn').click(); localStorage.setItem('PexuraAutoBackup', today); } } }, 60000);
window.openTimeMachine = () => { document.getElementById('modalTimeMachine').classList.remove('hide'); const now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset()); document.getElementById('rollbackTime').value = now.toISOString().slice(0,16); };
window.executeRollback = async () => {
    const targetTimeStr = document.getElementById('rollbackTime').value; if(!targetTimeStr) return showToast("Tarih seçin.", "warning");
    const targetTime = new Date(targetTimeStr).toISOString();
    if(!confirm(`⚠️ ${targetTimeStr} tarihinden sonraki işlemler geri alınacak.\nOnaylıyor musun?`)) return;
    const { data: logs, error } = await supa.from('system_logs').select('*').gt('created_at', targetTime).order('created_at', {ascending: false});
    if(error) return showToast("Hata: " + error.message, "error"); if(!logs || logs.length === 0) return showToast("Geri alınacak işlem yok.", "info");
    let count = 0;
    for (const log of logs) {
        try {
            if (log.action_type === 'INSERT') { await supa.from(log.table_name).delete().eq('id', log.record_id); } 
            else if (log.action_type === 'DELETE') { if(log.old_data) await supa.from(log.table_name).insert(log.old_data); }
            else if (log.action_type === 'UPDATE') { if(log.old_data) await supa.from(log.table_name).update(log.old_data).eq('id', log.record_id); }
            await supa.from('system_logs').delete().eq('id', log.id); count++;
        } catch (e) { console.error("Rollback hatası:", e); }
    }
    showToast(`${count} işlem geri alındı.`, "success"); setTimeout(() => location.reload(), 1500);
};

// --- YENİ MÜŞTERİ PANELİ ---
let ACTIVE_CARI_ID = null;
window.openCariPanel = async (id) => {
    ACTIVE_CARI_ID = id;
    const cari = CARILER.find(c => c.id == id);
    if(!cari) return;
    document.getElementById('modalCariPanel').classList.remove('hide');
    document.getElementById('cpBaslik').textContent = cari.ad;
    const urunSelect = document.getElementById('cpUrunSelect');
    urunSelect.innerHTML = `<option value="">Ürün Seçiniz...</option>` + URUNLER.map(u=>`<option value="${u.id}" data-fiyat="${u.satis_fiyat}" data-stok="${u.stok_miktar}" data-birim="${u.para_birimi}">${u.ad}</option>`).join("");
    const kasaSelect = document.getElementById('cpKasaSelect');
    kasaSelect.innerHTML = HESAPLAR.map(h=>`<option value="${h.id}">${h.ad} (${h.para_birimi})</option>`).join("");
    document.getElementById('cpUrunFiyat').value = "";
    document.getElementById('cpUrunAdet').value = "1";
    document.getElementById('cpFinansTutar').value = "";
    document.getElementById('cpFinansAciklama').value = "";
    document.getElementById('cpToplamTutar').textContent = "0.00";
    setCpFinansTur('tahsilat');
    await cpVerileriGuncelle();
};
window.cpUrunSecildi = () => {
    const sel = document.getElementById('cpUrunSelect');
    const opt = sel.selectedOptions[0];
    if(opt && opt.value) {
        document.getElementById('cpUrunFiyat').value = opt.dataset.fiyat;
        document.getElementById('cpStokDurum').textContent = `Stok: ${opt.dataset.stok} | PB: ${opt.dataset.birim}`;
        cpTutarHesapla();
    }
};
document.getElementById('cpUrunAdet').oninput = cpTutarHesapla;
document.getElementById('cpUrunFiyat').oninput = cpTutarHesapla;
function cpTutarHesapla() {
    const adet = Number(document.getElementById('cpUrunAdet').value) || 0;
    const fiyat = Number(document.getElementById('cpUrunFiyat').value) || 0;
    document.getElementById('cpToplamTutar').textContent = fmt(adet * fiyat);
}
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
window.cpSatisYap = async () => {
    if(!ACTIVE_CARI_ID) return;
    const uId = document.getElementById('cpUrunSelect').value;
    const adet = Number(document.getElementById('cpUrunAdet').value);
    const fiyat = Number(document.getElementById('cpUrunFiyat').value);
    if(!uId || adet <= 0) return showToast("Ürün ve miktar seçmelisin", "warning");
    const urun = URUNLER.find(u => u.id == uId);
    const tutar = adet * fiyat;
    const { data: fatura, error } = await supa.from("faturalar").insert({ user_id: USER.id, tip: 'satis', cari_id: ACTIVE_CARI_ID, tarih: new Date().toISOString().slice(0,10), numara: 'HIZLI-' + Date.now().toString().slice(-6), genel_toplam: tutar, para_birimi: urun.para_birimi, odeme_durumu: 'Odenmedi' }).select().single();
    if(error) return showToast(error.message, "error");
    await supa.from("fatura_kalemler").insert({ fatura_id: fatura.id, urun_id: uId, miktar: adet, birim_fiyat: fiyat, kdv_oran: urun.kdv_oran || 0, satir_tutar: tutar });
    await supa.rpc("stok_guncelle", { p_urun_id: uId, p_degisim: -adet });
    showToast("Satış yapıldı, stok düştü.", "success");
    await fetchUrunler(); await cpVerileriGuncelle();
    document.getElementById('cpUrunSelect').value = ""; document.getElementById('cpUrunAdet').value = "1"; document.getElementById('cpToplamTutar').textContent = "0.00";
};
window.cpFinansIsle = async () => {
    if(!ACTIVE_CARI_ID) return;
    const tur = document.getElementById('cpFinansTur').value;
    const tutar = Number(document.getElementById('cpFinansTutar').value);
    const kasaId = document.getElementById('cpKasaSelect').value;
    const aciklama = document.getElementById('cpFinansAciklama').value;
    if(tutar <= 0) return showToast("Geçerli bir tutar girin", "warning");
    const { error } = await supa.from('kasa_hareketler').insert({ user_id: USER.id, hesap_id: kasaId, cari_id: ACTIVE_CARI_ID, tur: tur, tutar: tutar, tarih: new Date().toISOString().slice(0,10), aciklama: aciklama || "Hızlı Panel İşlemi" });
    if(error) return showToast(error.message, "error");
    showToast("Finansal işlem kaydedildi.", "success");
    document.getElementById('cpFinansTutar').value = "";
    await cpVerileriGuncelle(); await fetchHareketler(); renderDash();
};
async function cpVerileriGuncelle() {
    if(!ACTIVE_CARI_ID) return;
    let borc = 0; let alacak = 0;
    FATURALAR.filter(f => f.cari_id == ACTIVE_CARI_ID && f.tip == 'satis').forEach(f => borc += Number(f.genel_toplam));
    HAREKETLER.filter(h => h.cari_id == ACTIVE_CARI_ID && h.tur == 'tahsilat').forEach(h => alacak += Number(h.tutar));
    const cari = CARILER.find(c => c.id == ACTIVE_CARI_ID);
    if(cari) { borc += Number(cari.acilis_borc || 0); alacak += Number(cari.acilis_alacak || 0); }
    const bakiye = borc - alacak;
    const bakiyeEl = document.getElementById('cpBakiye');
    bakiyeEl.textContent = fmt(bakiye);
    bakiyeEl.style.color = bakiye > 0 ? '#ef4444' : '#4ade80';
    const liste = document.getElementById('cpGecmisListe'); liste.innerHTML = "";
    let moves = [];
    FATURALAR.filter(f => f.cari_id == ACTIVE_CARI_ID).forEach(f => moves.push({tarih: f.tarih, tur: f.tip === 'satis' ? 'Fatura (Borç)' : 'Fatura (Alacak)', tutar: f.genel_toplam}));
    HAREKETLER.filter(h => h.cari_id == ACTIVE_CARI_ID).forEach(h => moves.push({tarih: h.tarih, tur: h.tur === 'tahsilat' ? 'Ödeme Yaptı' : 'Ödeme Aldı', tutar: h.tutar}));
    moves.sort((a,b) => new Date(b.tarih) - new Date(a.tarih));
    moves.slice(0,5).forEach(m => { liste.innerHTML += `<tr><td>${m.tarih}</td><td>${m.tur}</td><td>${fmt(m.tutar)}</td></tr>`; });
}

// --- GELİŞMİŞ TÜRKÇE/MAIL ARAMA ---
window.globalSearch = () => {
    const input = document.getElementById('searchInput');
    const query = input.value.toLocaleLowerCase('tr').trim();
    if (!query) return showToast("Arama yapmak için bir kelime yazın.", "warning");
    const matchedCariler = CARILER.filter(c => (c.ad && c.ad.toLocaleLowerCase('tr').includes(query)) || (c.tel && c.tel.includes(query)) || (c.mail && c.mail.toLocaleLowerCase('tr').includes(query)) || (c.adres && c.adres.toLocaleLowerCase('tr').includes(query)));
    const matchedUrunler = URUNLER.filter(u => (u.ad && u.ad.toLocaleLowerCase('tr').includes(query)) || (u.kod && u.kod.toLocaleLowerCase('tr').includes(query)));
    const cariBody = document.getElementById('searchResultCari'); cariBody.innerHTML = "";
    if (matchedCariler.length === 0) { cariBody.innerHTML = "<tr><td colspan='5' style='text-align:center; color:#94a3b8;'>Eşleşen müşteri bulunamadı.</td></tr>"; } 
    else { matchedCariler.forEach(c => { cariBody.innerHTML += `<tr><td onclick="document.getElementById('modalSearch').classList.add('hide'); openCariPanel('${c.id}')" style="cursor:pointer; color:#60a5fa; font-weight:bold;">${c.ad}</td><td>${c.tel}</td><td>${c.adres ? c.adres.slice(0, 20) : '-'}</td><td>${fmt(hesaplaBakiye(c.id))}</td><td><button class="info" style="font-size:11px;" onclick="document.getElementById('modalSearch').classList.add('hide'); openEkstre('${c.id}')">Ekstre</button></td></tr>`; }); }
    const urunBody = document.getElementById('searchResultUrun'); urunBody.innerHTML = "";
    if (matchedUrunler.length === 0) { urunBody.innerHTML = "<tr><td colspan='5' style='text-align:center; color:#94a3b8;'>Eşleşen ürün bulunamadı.</td></tr>"; } 
    else { matchedUrunler.forEach(u => { urunBody.innerHTML += `<tr><td>${u.ad}</td><td>${u.kod}</td><td style="color:#4ade80">${fmt(u.satis_fiyat, u.para_birimi)}</td><td>${u.stok_miktar}</td><td><button class="warning" style="font-size:11px;" onclick="document.getElementById('modalSearch').classList.add('hide'); jumpToUrunEdit('${u.id}')">Git</button></td></tr>`; }); }
    document.getElementById('modalSearch').classList.remove('hide');
};

// --- GELİŞMİŞ EKSTRE ---
window.openEkstre = async (cariId) => {
    const cari = CARILER.find(c => c.id == cariId); if(!cari) return;
    document.getElementById('ekstreBaslik').innerHTML = `${cari.ad} <span style="font-size:14px; color:#94a3b8">Ekstresi</span>`;
    const musteriFaturalari = FATURALAR.filter(f => f.cari_id == cariId);
    const faturaIds = musteriFaturalari.map(f => f.id);
    const { data: kalemler } = await supa.from('fatura_kalemler').select('*, faturalar(tarih, numara, tip), urunler(ad)').in('fatura_id', faturaIds).order('id', {ascending:false});
    const tblUrunler = document.getElementById('ekstreUrunler'); tblUrunler.innerHTML = "";
    if(kalemler && kalemler.length > 0) { kalemler.forEach(k => { if(!k.faturalar) return; const isIade = k.faturalar.tip === 'alis'; const islemTuru = isIade ? '(İADE/ALIŞ)' : ''; tblUrunler.innerHTML += `<tr><td>${k.faturalar.tarih}</td><td>${k.urunler ? k.urunler.ad : 'Silinmiş Ürün'} <small style="color:#f59e0b">${islemTuru}</small></td><td>${k.miktar}</td><td>${fmt(k.birim_fiyat)}</td><td>${fmt(k.satir_tutar)}</td><td><button class="warning" style="padding:4px 8px; font-size:11px;" onclick="closeEkstre(); editFatura('${k.fatura_id}')">Düzenle</button></td></tr>`; }); } else { tblUrunler.innerHTML = "<tr><td colspan='6' style='text-align:center'>Ürün hareketi yok.</td></tr>"; }
    const odemeler = HAREKETLER.filter(h => h.cari_id == cariId);
    const tblOdemeler = document.getElementById('ekstreOdemeler'); tblOdemeler.innerHTML = "";
    if(odemeler.length > 0) { odemeler.forEach(h => { const renk = h.tur === 'tahsilat' ? '#4ade80' : '#ef4444'; const etiket = h.tur === 'tahsilat' ? 'Ödeme Yaptı (Giriş)' : 'Ödeme Aldı (Çıkış)'; tblOdemeler.innerHTML += `<tr><td>${h.tarih}</td><td><span style="color:${renk}">${etiket}</span><br><small>${h.aciklama||''}</small></td><td style="font-weight:bold">${fmt(h.tutar)}</td><td><button class="warning" style="padding:4px 8px; font-size:11px;" onclick="closeEkstre(); jumpToHareketEdit('${h.id}')">Düzenle</button></td></tr>`; }); } else { tblOdemeler.innerHTML = "<tr><td colspan='4' style='text-align:center'>Finansal hareket yok.</td></tr>"; }
    let toplamSatis = 0; musteriFaturalari.filter(f => f.tip === 'satis').forEach(f => toplamSatis += Number(f.genel_toplam));
    let toplamOdeme = 0; odemeler.filter(h => h.tur === 'tahsilat').forEach(h => toplamOdeme += Number(h.tutar));
    const acilisBorc = Number(cari.acilis_borc || 0); const acilisAlacak = Number(cari.acilis_alacak || 0);
    const genelToplamBorc = toplamSatis + acilisBorc; const genelToplamOdeme = toplamOdeme + acilisAlacak; const bakiye = genelToplamBorc - genelToplamOdeme;
    document.getElementById('ekstreAlim').textContent = fmt(genelToplamBorc); document.getElementById('ekstreOdeme').textContent = fmt(genelToplamOdeme);
    const bakElem = document.getElementById('ekstreBakiye'); bakElem.textContent = fmt(bakiye); bakElem.style.color = bakiye > 0 ? '#ef4444' : (bakiye < 0 ? '#4ade80' : '#e2e8f0');
    document.getElementById('modalEkstre').classList.remove('hide');
};
function hesaplaBakiye(cariId) {
    let borc = 0; let alacak = 0;
    FATURALAR.filter(f => f.cari_id == cariId && f.tip == 'satis').forEach(f => borc += Number(f.genel_toplam));
    HAREKETLER.filter(h => h.cari_id == cariId && h.tur == 'tahsilat').forEach(h => alacak += Number(h.tutar));
    const cari = CARILER.find(c => c.id == cariId); if(cari) { borc += Number(cari.acilis_borc||0); alacak += Number(cari.acilis_alacak||0); }
    return borc - alacak;
}
window.closeEkstre = () => document.getElementById('modalEkstre').classList.add('hide');
window.jumpToUrunEdit = (id) => { document.querySelector('button[data-tab="urunler"]').click(); setTimeout(() => { const btn = document.querySelector(`button[data-edit="${id}"]`); if(btn) btn.click(); }, 300); };
window.jumpToHareketEdit = (id) => { document.querySelector('button[data-tab="kasa"]').click(); setTimeout(() => { const btn = document.querySelector(`button[data-edit="${id}"]`); if(btn) { btn.click(); showToast("İşlem açıldı.", "info"); } }, 500); };

// --- İŞLEM GEÇMİŞİ & SİLME MERKEZİ ---
window.renderHistory = () => {
    const tbody = document.getElementById('historyList'); if(!tbody) return;
    tbody.innerHTML = "";
    const searchTerm = document.getElementById('historySearch') ? document.getElementById('historySearch').value.toLocaleLowerCase('tr') : "";
    let allEvents = [];
    FATURALAR.forEach(f => { const cari = CARILER.find(c => c.id == f.cari_id); allEvents.push({ id: f.id, type: 'fatura', date: f.tarih, label: f.tip === 'satis' ? 'Satış Faturası' : 'Alış Faturası', desc: cari ? cari.ad : 'Silinmiş Cari', amount: f.genel_toplam, currency: f.para_birimi, color: f.tip === 'satis' ? '#60a5fa' : '#f59e0b' }); });
    HAREKETLER.forEach(h => { const hesap = HESAPLAR.find(x => x.id == h.hesap_id); const cari = h.cari_id ? CARILER.find(c => c.id == h.cari_id) : null; allEvents.push({ id: h.id, type: 'hareket', date: h.tarih, label: h.tur === 'tahsilat' ? 'Tahsilat (Kasa)' : 'Ödeme (Kasa)', desc: (cari ? cari.ad + ' - ' : '') + (h.aciklama || ''), amount: h.tutar, currency: hesap ? hesap.para_birimi : 'USD', color: h.tur === 'tahsilat' ? '#4ade80' : '#ef4444' }); });
    GG.forEach(g => { allEvents.push({ id: g.id, type: 'gg', date: g.tarih, label: g.tur === 'gelir' ? 'Gelir Ekleme' : 'Gider Ekleme', desc: `${g.kategori} - ${g.aciklama}`, amount: g.tutar, currency: 'USD', color: g.tur === 'gelir' ? '#4ade80' : '#ef4444' }); });
    allEvents.sort((a, b) => new Date(b.date) - new Date(a.date));
    allEvents.filter(e => e.label.toLocaleLowerCase('tr').includes(searchTerm) || e.desc.toLocaleLowerCase('tr').includes(searchTerm)).forEach(e => {
        tbody.innerHTML += `<tr><td>${e.date}</td><td><span class="tag" style="background:${e.color}20; color:${e.color}; border:1px solid ${e.color}">${e.label}</span></td><td>${e.desc}</td><td style="font-weight:bold; color:${e.color}">${fmt(e.amount, e.currency)}</td><td><button class="warning" style="margin-right:5px;" onclick="jumpToEdit('${e.type}', '${e.id}')">Düzenle</button><button class="danger" onclick="deleteHistoryItem('${e.type}', '${e.id}')">Sil</button></td></tr>`;
    });
};
window.jumpToEdit = (type, id) => {
    if (type === 'fatura') { editFatura(id); } 
    else if (type === 'hareket') { document.querySelector('button[data-tab="kasa"]').click(); setTimeout(() => { const btn = document.querySelector(`button[data-edit="${id}"]`); if(btn) { btn.click(); showToast("Kasa işlemi düzenlemeye açıldı.", "info"); } }, 300); } 
    else if (type === 'gg') { document.querySelector('button[data-tab="gelirgider"]').click(); setTimeout(() => { const btn = document.querySelector(`button[data-edit="${id}"]`); if(btn) { btn.click(); showToast("Gelir/Gider düzenlemeye açıldı.", "info"); } }, 300); }
};
window.deleteHistoryItem = async (type, id) => {
    if(!confirm("Bu işlemi silmek ve stokları geri almak istediğine emin misin? (Geri alınamaz)")) return;
    if(type === 'fatura') {
        const { data: fatura } = await supa.from('faturalar').select('tip').eq('id', id).single();
        const { data: kalemler } = await supa.from('fatura_kalemler').select('*').eq('fatura_id', id);
        if (fatura && kalemler) {
            for (const k of kalemler) {
                // Satis siliniyorsa stok artmalı (+), Alis siliniyorsa stok azalmalı (-)
                const degisim = fatura.tip === 'satis' ? k.miktar : -k.miktar;
                await supa.rpc('stok_guncelle', { p_urun_id: k.urun_id, p_degisim: degisim });
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
    await fetchAll(); renderHistory();
};
window.clearAllHistory = async () => {
    const onay1 = confirm("⚠️ DİKKAT: Tüm işlem geçmişini (Faturalar, Satışlar, Kasa Hareketleri, Gelir/Gider) silmek üzeresin!");
    if(!onay1) return;
    const onay2 = confirm("🚨 EMİN MİSİN? Müşteriler ve Ürünler kalacak, ancak tüm para trafiği sıfırlanacak. Bu işlem geri alınamaz!");
    if(!onay2) return;
    showToast("Geçmiş temizleniyor...", "info");
    await supa.from('fatura_kalemler').delete().neq('id', 0);
    await supa.from('kasa_hareketler').delete().neq('id', 0);
    await supa.from('gelir_gider').delete().neq('id', 0);
    await supa.from('faturalar').delete().neq('id', 0);
    showToast("Tüm geçmiş temizlendi.", "success");
    setTimeout(() => location.reload(), 1500);
};

// --- YEDEKLEME ---
document.getElementById('backupBtn').onclick = async () => {
    if(!confirm("Tüm verilerin yedeği bilgisayarına indirilsin mi?")) return;
    const { data: c } = await supa.from('cariler').select('*');
    const { data: u } = await supa.from('urunler').select('*');
    const { data: h } = await supa.from('kasa_hesaplar').select('*');
    const { data: kh } = await supa.from('kasa_hareketler').select('*');
    const { data: f } = await supa.from('faturalar').select('*');
    const { data: fk } = await supa.from('fatura_kalemler').select('*');
    const { data: gg } = await supa.from('gelir_gider').select('*');
    const backupData = { timestamp: new Date().toISOString(), cariler: c || [], urunler: u || [], hesaplar: h || [], hareketler: kh || [], faturalar: f || [], kalemler: fk || [], gelir_gider: gg || [] };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData));
    const downloadAnchorNode = document.createElement('a'); downloadAnchorNode.setAttribute("href", dataStr); downloadAnchorNode.setAttribute("download", "Pexura_Yedek_" + new Date().toISOString().slice(0,10) + ".json"); document.body.appendChild(downloadAnchorNode); downloadAnchorNode.click(); downloadAnchorNode.remove();
    showToast("Yedek başarıyla indirildi.", "success");
};
document.getElementById('restoreBtn').onclick = () => { document.getElementById('importFile').click(); };
document.getElementById('importFile').onchange = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    if(!confirm("⚠️ DİKKAT: Bu yedeği yüklerseniz MEVCUT TÜM VERİLER SİLİNECEK ve yedeğin üzerine yazılacaktır.\n\nOnaylıyor musunuz?")) { e.target.value = ""; return; }
    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const data = JSON.parse(event.target.result);
            showToast("Veriler yükleniyor...", "info");
            await supa.from('fatura_kalemler').delete().neq('id', 0); await supa.from('kasa_hareketler').delete().neq('id', 0); await supa.from('gelir_gider').delete().neq('id', 0); await supa.from('faturalar').delete().neq('id', 0); await supa.from('urunler').delete().neq('id', 0); await supa.from('cariler').delete().neq('id', 0); await supa.from('kasa_hesaplar').delete().neq('id', 0);
            if(data.hesaplar.length) await supa.from('kasa_hesaplar').insert(data.hesaplar); if(data.cariler.length) await supa.from('cariler').insert(data.cariler); if(data.urunler.length) await supa.from('urunler').insert(data.urunler); if(data.faturalar.length) await supa.from('faturalar').insert(data.faturalar); if(data.gelir_gider.length) await supa.from('gelir_gider').insert(data.gelir_gider); if(data.hareketler.length) await supa.from('kasa_hareketler').insert(data.hareketler); if(data.kalemler.length) await supa.from('fatura_kalemler').insert(data.kalemler);
            showToast("Yedek yüklendi! Sayfa yenileniyor...", "success"); setTimeout(() => location.reload(), 2000);
        } catch (err) { console.error(err); showToast("Yedek dosyası bozuk: " + err.message, "error"); }
    };
    reader.readAsText(file);
};