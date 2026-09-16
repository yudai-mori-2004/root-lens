BEGIN;
ALTER TABLE "people" ADD COLUMN "job_title" text;
ALTER TABLE "people" ADD COLUMN "note" text;
COMMIT;
