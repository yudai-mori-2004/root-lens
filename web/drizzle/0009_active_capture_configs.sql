BEGIN;
DELETE FROM "upload_units" WHERE "recording_config" = 'mentra';
ALTER TABLE "upload_units" DROP CONSTRAINT "upload_units_recording_config";
ALTER TABLE "upload_units" ADD CONSTRAINT "upload_units_recording_config" CHECK (
  "recording_config" IN ('ultra_wide', 'arkit', 'iphone')
);
ALTER TABLE "clips" ADD CONSTRAINT "clips_recording_config" CHECK (
  "recording_config" IN ('ultra_wide', 'arkit', 'iphone')
);
CREATE INDEX "upload_units_created_at_idx" ON "upload_units" USING btree ("created_at");
COMMIT;
