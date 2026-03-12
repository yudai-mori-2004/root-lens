-- 仕様書 §10.4 データベース設計
-- Task 07: 公開ページの最小限のテーブル

-- pages: 公開ページ単位のレコード
create table if not exists pages (
  id          uuid primary key default gen_random_uuid(),
  short_id    text unique not null,
  status      text not null default 'published',  -- published / hidden / deleted
  published_at timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- contents: ページに紐づく個別コンテンツ
create table if not exists contents (
  id                      uuid primary key default gen_random_uuid(),
  page_id                 uuid not null references pages(id),
  content_type            text not null default 'photo',  -- photo / video
  content_hash            text,
  title_protocol_asset_id text,
  thumbnail_url           text,
  ogp_image_url           text,
  device_label            text,
  shot_at                 timestamptz,
  created_at              timestamptz not null default now()
);

-- 検索用インデックス
create index if not exists idx_contents_content_hash on contents(content_hash);
create index if not exists idx_contents_page_id on contents(page_id);

-- RLS: anon は読み取りのみ、service_role は全操作
alter table pages enable row level security;
alter table contents enable row level security;

create policy "pages_read" on pages for select using (status = 'published');
create policy "contents_read" on contents for select
  using (exists (select 1 from pages where pages.id = contents.page_id and pages.status = 'published'));

-- service_role は RLS をバイパスするため、書き込み用ポリシーは不要
