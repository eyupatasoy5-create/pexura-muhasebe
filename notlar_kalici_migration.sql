-- PEXURA kalıcı kullanıcı notları
-- Supabase SQL Editor içinde bir kez çalıştırın.

create table if not exists public.kullanici_notlari (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Not',
  content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists kullanici_notlari_user_created_idx
  on public.kullanici_notlari (user_id, created_at desc);

alter table public.kullanici_notlari enable row level security;

drop policy if exists "Kullanici kendi notlarini gorebilir" on public.kullanici_notlari;
create policy "Kullanici kendi notlarini gorebilir"
  on public.kullanici_notlari for select
  using (auth.uid() = user_id);

drop policy if exists "Kullanici kendi notunu ekleyebilir" on public.kullanici_notlari;
create policy "Kullanici kendi notunu ekleyebilir"
  on public.kullanici_notlari for insert
  with check (auth.uid() = user_id);

drop policy if exists "Kullanici kendi notunu guncelleyebilir" on public.kullanici_notlari;
create policy "Kullanici kendi notunu guncelleyebilir"
  on public.kullanici_notlari for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Kullanici kendi notunu silebilir" on public.kullanici_notlari;
create policy "Kullanici kendi notunu silebilir"
  on public.kullanici_notlari for delete
  using (auth.uid() = user_id);
