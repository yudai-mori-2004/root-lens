BEGIN;

ALTER TABLE "approval_signatures" RENAME TO "approval_requests";
ALTER TABLE "approval_requests" RENAME COLUMN "source_manifest_sha256" TO "files_sha256";
ALTER TABLE "approval_requests" RENAME COLUMN "source_files" TO "files";
ALTER INDEX IF EXISTS "approval_signature_unit_idx" RENAME TO "approval_request_unit_idx";

ALTER TABLE "approval_events" RENAME COLUMN "signature_id" TO "request_id";
ALTER TABLE "approval_events" RENAME COLUMN "source_manifest_sha256" TO "files_sha256";
ALTER TABLE "approval_events" RENAME COLUMN "approval_payload_sha256" TO "approval_subject_sha256";

ALTER TABLE "drive_upload_attempts" RENAME COLUMN "source_manifest_sha256" TO "files_sha256";

ALTER TABLE "evidence_bundles" RENAME COLUMN "delivery_manifest_sha256" TO "files_sha256";
ALTER TABLE "evidence_bundles" DROP COLUMN "provided_at";

COMMIT;
