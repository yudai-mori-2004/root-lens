-- contents テーブルにメディア本体URL（動画・音声等）を追加
ALTER TABLE contents ADD COLUMN IF NOT EXISTS media_url text NOT NULL DEFAULT '';
