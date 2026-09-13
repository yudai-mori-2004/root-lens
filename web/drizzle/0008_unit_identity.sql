BEGIN;
ALTER TABLE "clips" RENAME COLUMN "content_hash" TO "unit_id";
ALTER TABLE "clips" RENAME COLUMN "content_size" TO "video_bytes";
ALTER TABLE "consent_events" RENAME COLUMN "doc_content_hash" TO "doc_sha256";
ALTER TABLE "consent_events" RENAME COLUMN "summary_hash" TO "summary_sha256";
-- The previous upload path was never used operationally. Its rows cannot meet
-- the new full-file integrity contract, so do not relabel them as valid units.
DELETE FROM "clips";
ALTER TABLE "clips" ALTER COLUMN "recorded_at" SET NOT NULL;
ALTER TABLE "clips" ALTER COLUMN "video_bytes" SET NOT NULL;
ALTER TABLE "clips" ADD COLUMN "source_manifest_sha256" text NOT NULL;
ALTER TABLE "clips" ADD COLUMN "source_files" jsonb NOT NULL;
ALTER TABLE "clips" ADD CONSTRAINT "clips_unit_id_format" CHECK (
  "unit_id" ~ '^unit_[a-z0-9][a-z0-9_-]{0,63}_[0-9]{8}T[0-9]{9}Z_[0-9A-HJKMNP-TV-Z]{8}$'
);
ALTER TABLE "clips" ADD CONSTRAINT "clips_source_manifest_sha256_format" CHECK (
  "source_manifest_sha256" ~ '^[0-9a-f]{64}$'
);
CREATE TABLE "upload_units" (
  "unit_id" text PRIMARY KEY NOT NULL,
  "account_id" uuid NOT NULL,
  "recording_config" text NOT NULL,
  "recorded_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "upload_units_unit_id_format" CHECK (
    "unit_id" ~ '^unit_[a-z0-9][a-z0-9_-]{0,63}_[0-9]{8}T[0-9]{9}Z_[0-9A-HJKMNP-TV-Z]{8}$'
  ),
  CONSTRAINT "upload_units_recording_config" CHECK (
    "recording_config" IN ('ultra_wide', 'arkit', 'mentra', 'iphone')
  )
);
CREATE INDEX "upload_units_account_id_idx" ON "upload_units" USING btree ("account_id");
COMMIT;
