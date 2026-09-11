-- PEXURA v46: stok kartı, tedarikçi mal kabul, sayım, mutabakat,
-- ters kayıt ve otomatik yedek. Supabase SQL Editor'de bir kez çalıştırın.

alter table public.stok_hareketleri add column if not exists stok_sonrasi numeric;
alter table public.stok_hareketleri add column if not exists tedarikci_id uuid;
alter table public.stok_hareketleri add column if not exists birim_maliyet numeric;
alter table public.stok_hareketleri add column if not exists geri_alindi boolean not null default false;
alter table public.stok_hareketleri add column if not exists geri_alma_hareket_id uuid;

create table if not exists public.stok_sayim_oturumlari(
  id uuid primary key default gen_random_uuid(), user_id uuid not null,
  ad text not null, tarih date not null, urun_id uuid not null,
  sayilan_adet numeric not null check(sayilan_adet>=0), notlar text,
  created_at timestamptz not null default now()
);
alter table public.stok_sayim_oturumlari enable row level security;
drop policy if exists stok_sayim_owner on public.stok_sayim_oturumlari;
create policy stok_sayim_owner on public.stok_sayim_oturumlari for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());

create table if not exists public.kasa_mutabakatlari(
  id uuid primary key default gen_random_uuid(), user_id uuid not null,
  hesap_id uuid not null, tarih timestamptz not null,
  sistem_bakiye numeric not null, sayilan_bakiye numeric not null,
  fark numeric not null, notlar text, created_at timestamptz not null default now()
);
alter table public.kasa_mutabakatlari enable row level security;
drop policy if exists kasa_mutabakat_owner on public.kasa_mutabakatlari;
create policy kasa_mutabakat_owner on public.kasa_mutabakatlari for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());

create table if not exists public.app_yedekler(
  id uuid primary key default gen_random_uuid(), user_id uuid not null,
  tur text not null check(tur in ('otomatik','manuel')),
  icerik jsonb not null, created_at timestamptz not null default now()
);
alter table public.app_yedekler enable row level security;
drop policy if exists app_yedek_owner on public.app_yedekler;
create policy app_yedek_owner on public.app_yedekler for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());

create or replace function public.record_stock_transaction(
  p_product_id uuid,p_mode text,p_quantity numeric,p_reason text,
  p_note text default null,p_tarih timestamptz default now(),
  p_supplier_id uuid default null,p_unit_cost numeric default null
) returns numeric language plpgsql security invoker set search_path=public as $fn$
declare v_old numeric; v_new numeric; v_delta numeric;
begin
  if p_mode not in ('giris','cikis','sayim') then raise exception 'Geçersiz stok işlem türü'; end if;
  if p_quantity is null or p_quantity<0 or p_quantity<>trunc(p_quantity) then raise exception 'Stok adedi tam sayı olmalıdır'; end if;
  if p_mode<>'sayim' and p_quantity=0 then raise exception 'Miktar sıfırdan büyük olmalıdır'; end if;
  if nullif(btrim(coalesce(p_reason,'')),'') is null or p_tarih is null then raise exception 'Neden ve tarih zorunludur'; end if;
  if p_unit_cost is not null and p_unit_cost<0 then raise exception 'Birim maliyet negatif olamaz'; end if;
  select coalesce(stok_miktar,0) into v_old from public.urunler where id=p_product_id for update;
  if not found then raise exception 'Ürün bulunamadı'; end if;
  v_new:=case p_mode when 'giris' then v_old+p_quantity when 'cikis' then v_old-p_quantity else p_quantity end;
  if v_new<0 then raise exception 'Stok eksiye düşemez. Mevcut: %',v_old; end if;
  v_delta:=v_new-v_old;
  update public.urunler set stok_miktar=v_new,toplam_stok=v_new,
    alis_fiyat=case when p_mode='giris' and p_unit_cost is not null then p_unit_cost else alis_fiyat end
  where id=p_product_id;
  insert into public.stok_hareketleri(urun_id,miktar_degisim,tur,kaynak,kaynak_id,aciklama,user_id,tarih,stok_sonrasi,tedarikci_id,birim_maliyet)
  values(p_product_id,v_delta,p_mode,'manuel',p_product_id,concat(btrim(p_reason),case when nullif(btrim(coalesce(p_note,'')),'') is not null then ' - '||btrim(p_note) else '' end),auth.uid(),p_tarih,v_new,p_supplier_id,p_unit_cost);
  return v_new;
end; $fn$;
grant execute on function public.record_stock_transaction(uuid,text,numeric,text,text,timestamptz,uuid,numeric) to authenticated;

create or replace function public.reverse_stock_transaction(p_movement_id uuid,p_reason text)
returns uuid language plpgsql security invoker set search_path=public as $fn$
declare m public.stok_hareketleri%rowtype; v_new numeric; v_reverse uuid;
begin
  select * into m from public.stok_hareketleri where id=p_movement_id for update;
  if not found then raise exception 'Stok hareketi bulunamadı'; end if;
  if m.kaynak<>'manuel' then raise exception 'Yalnızca manuel stok hareketi geri alınabilir'; end if;
  if m.geri_alindi then raise exception 'Bu hareket zaten geri alınmış'; end if;
  select coalesce(stok_miktar,0)-coalesce(m.miktar_degisim,0) into v_new from public.urunler where id=m.urun_id for update;
  if v_new<0 then raise exception 'Geri alma stoğu eksiye düşürür'; end if;
  update public.urunler set stok_miktar=v_new,toplam_stok=v_new where id=m.urun_id;
  insert into public.stok_hareketleri(urun_id,miktar_degisim,tur,kaynak,kaynak_id,aciklama,user_id,tarih,stok_sonrasi)
  values(m.urun_id,-m.miktar_degisim,'geri_alma','manuel',m.id,concat('Geri alma: ',coalesce(p_reason,'-')),auth.uid(),now(),v_new) returning id into v_reverse;
  update public.stok_hareketleri set geri_alindi=true,geri_alma_hareket_id=v_reverse where id=m.id;
  return v_reverse;
end; $fn$;
grant execute on function public.reverse_stock_transaction(uuid,text) to authenticated;

alter table public.kasa_hareketler add column if not exists geri_alindi boolean not null default false;
alter table public.kasa_hareketler add column if not exists geri_alma_hareket_id uuid;

create or replace function public.reverse_cash_transaction(p_movement_id uuid,p_reason text)
returns uuid language plpgsql security invoker set search_path=public as $fn$
declare m public.kasa_hareketler%rowtype; v_reverse uuid; v_type text;
begin
  select * into m from public.kasa_hareketler where id=p_movement_id for update;
  if not found then raise exception 'Kasa hareketi bulunamadı'; end if;
  if m.geri_alindi then raise exception 'Bu hareket zaten geri alınmış'; end if;
  if lower(coalesce(m.aciklama,'')) like 'geri alma:%' then raise exception 'Geri alma kaydı tekrar geri alınamaz'; end if;
  v_type:=case when m.tur='tahsilat' then 'odeme' else 'tahsilat' end;
  insert into public.kasa_hareketler(user_id,hesap_id,tarih,tur,cari_id,tutar,aciklama)
  values(auth.uid(),m.hesap_id,now(),v_type,m.cari_id,m.tutar,concat('Geri alma: ',coalesce(p_reason,'-')))
  returning id into v_reverse;
  update public.kasa_hareketler set geri_alindi=true,geri_alma_hareket_id=v_reverse where id=m.id;
  return v_reverse;
end; $fn$;
grant execute on function public.reverse_cash_transaction(uuid,text) to authenticated;
