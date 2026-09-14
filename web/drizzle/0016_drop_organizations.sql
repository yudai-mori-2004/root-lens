BEGIN;

ALTER TABLE "people" ALTER COLUMN "organization_id" DROP NOT NULL;
ALTER TABLE "sites" ALTER COLUMN "organization_id" DROP NOT NULL;

COMMIT;
