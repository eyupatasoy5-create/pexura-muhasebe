-- PEXURA v45: stok hareketlerini satış/iade geçmişinden ayırır.
-- Supabase SQL Editor'de bir kez çalıştırın.

alter table public.stok_hareketleri
  add column if not exists tarih timestamptz;

update public.stok_hareketleri
set tarih = created_at
where tarih is null;

alter table public.stok_hareketleri
  alter column tarih set default now();

-- Bu fonksiyon fiziksel stok için tek yazma noktasıdır.
-- Giriş/çıkış miktar, sayım ise sayılan nihai adettir.
create or replace function public.record_stock_transaction(
  p_product_id uuid,
  p_mode text,
  p_quantity numeric,
  p_reason text,
  p_note text default null,
  p_tarih timestamptz default now()
) returns numeric
language plpgsql security invoker set search_path=public as $$
declare
  v_old numeric;
  v_new numeric;
  v_delta numeric;
begin
  if p_mode not in ('giris','cikis','sayim') then
    raise exception 'Geçersiz stok işlem türü';
  end if;
  if p_quantity is null or p_quantity < 0 or p_quantity <> trunc(p_quantity) then
    raise exception 'Stok adedi negatif olmayan tam sayı olmalıdır';
  end if;
  if p_mode <> 'sayim' and p_quantity = 0 then
    raise exception 'Miktar sıfırdan büyük olmalıdır';
  end if;
  if nullif(btrim(coalesce(p_reason,'')),'') is null then
    raise exception 'Stok hareketi nedeni zorunludur';
  end if;
  if p_tarih is null then
    raise exception 'Hareket tarihi zorunludur';
  end if;

  select coalesce(stok_miktar,0) into v_old
  from public.urunler where id=p_product_id for update;
  if not found then raise exception 'Ürün bulunamadı'; end if;

  v_new := case p_mode
    when 'giris' then v_old + p_quantity
    when 'cikis' then v_old - p_quantity
    else p_quantity
  end;
  if v_new < 0 then
    raise exception 'Stok eksiye düşemez. Mevcut: %, istenen çıkış: %', v_old, p_quantity;
  end if;
  v_delta := v_new-v_old;

  -- toplam_stok artık tarihsel satış hesabı olarak kullanılmaz; varsa mevcutla eşit tutulur.
  update public.urunler
  set stok_miktar=v_new, toplam_stok=v_new
  where id=p_product_id;

  insert into public.stok_hareketleri
    (urun_id,miktar_degisim,tur,kaynak,kaynak_id,aciklama,user_id,tarih)
  values
    (p_product_id,v_delta,p_mode,'manuel',p_product_id,
     concat(btrim(p_reason),case when nullif(btrim(coalesce(p_note,'')),'') is not null then ' - '||btrim(p_note) else '' end),
     auth.uid(),p_tarih);
  return v_new;
end; $$;

grant execute on function public.record_stock_transaction(uuid,text,numeric,text,text,timestamptz) to authenticated;

-- Eski toplu stok ekranı da aynı fiziksel stok kuralını kullanmaya devam eder.
create or replace function public.adjust_stock_transaction(p_product_id uuid,p_mode text,p_quantity numeric,p_reason text,p_note text default null)
returns numeric language plpgsql security invoker set search_path=public as $$
declare v_old numeric; v_new numeric; v_delta numeric;
begin
  if p_mode not in ('giris','cikis','sayim') then raise exception 'Geçersiz stok işlem türü'; end if;
  if p_quantity is null or p_quantity < 0 or p_quantity <> trunc(p_quantity) then raise exception 'Stok adedi tam sayı olmalıdır'; end if;
  if p_mode <> 'sayim' and p_quantity = 0 then raise exception 'Miktar sıfırdan büyük olmalıdır'; end if;
  if nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'Stok hareketi nedeni zorunludur'; end if;
  select coalesce(stok_miktar,0) into v_old from public.urunler where id=p_product_id for update;
  if not found then raise exception 'Ürün bulunamadı'; end if;
  v_new:=case p_mode when 'giris' then v_old+p_quantity when 'cikis' then v_old-p_quantity else p_quantity end;
  if v_new<0 then raise exception 'Stok eksiye düşemez. Mevcut: %',v_old; end if;
  v_delta:=v_new-v_old;
  update public.urunler set stok_miktar=v_new,toplam_stok=v_new where id=p_product_id;
  insert into public.stok_hareketleri(urun_id,miktar_degisim,tur,kaynak,kaynak_id,aciklama,user_id,tarih)
  values(p_product_id,v_delta,p_mode,'manuel',p_product_id,concat(btrim(p_reason),case when nullif(btrim(coalesce(p_note,'')),'') is not null then ' - '||btrim(p_note) else '' end),auth.uid(),now());
  return v_new;
end; $$;
