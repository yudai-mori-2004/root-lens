BEGIN;

ALTER TABLE "people" DROP COLUMN "organization_id";
ALTER TABLE "sites" DROP COLUMN "organization_id";
DROP TABLE "organizations";

COMMIT;
