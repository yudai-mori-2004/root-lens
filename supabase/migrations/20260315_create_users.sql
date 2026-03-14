-- users テーブル
-- プロフィール情報 + 公開ページでの帰属表示に使用
-- address は Solana ウォレットアドレス（Privy 経由で取得）

create table if not exists public.users (
  id           uuid primary key default gen_random_uuid(),
  address      text unique not null,               -- Solana アドレス（一意キー）
  display_name text not null default '',
  bio          text not null default '',
  avatar_url   text,                                -- 将来用（本物写真アイコン等）
  device_name  text not null default '',            -- 端末名（公開ページ表示用）
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- pages に user_id を追加
alter table public.pages
  add column if not exists user_id uuid references public.users(id);

-- インデックス
create index if not exists idx_users_address on public.users(address);
create index if not exists idx_pages_user_id on public.pages(user_id);

-- RLS: users テーブル
alter table public.users enable row level security;

-- 誰でも公開プロフィールを読める
create policy "users_select_public" on public.users
  for select using (true);

-- 本人のみ更新可能（service_role 経由で認証済みアドレスを検証）
-- アプリからの更新は service_role API 経由で行うため、ここでは最低限のポリシー
create policy "users_insert_service" on public.users
  for insert with check (true);

create policy "users_update_service" on public.users
  for update using (true);

-- updated_at を自動更新するトリガー
create or replace function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger users_updated_at
  before update on public.users
  for each row execute function public.update_updated_at();
