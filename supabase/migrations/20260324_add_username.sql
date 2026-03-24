-- 仕様書 §7.1 URL構造 — /@{username} ルーティングに必要
-- §10.4 users テーブル拡張

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS username text;

-- ユニーク制約（NULL許容: 未設定のユーザーは重複しない）
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username
  ON public.users (username) WHERE username IS NOT NULL;
