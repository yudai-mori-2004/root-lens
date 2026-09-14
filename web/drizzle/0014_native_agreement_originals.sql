BEGIN;

DROP INDEX "agreement_provider_envelope_idx";
ALTER TABLE "agreement_records" DROP COLUMN "signature_provider";
ALTER TABLE "agreement_records" DROP COLUMN "provider_envelope_id";
ALTER TABLE "agreement_records" DROP COLUMN "certificate_file_id";
ALTER TABLE "agreement_records" DROP COLUMN "certificate_sha256";
ALTER TABLE "agreement_records" ADD COLUMN "acceptance_payload_sha256" text;
ALTER TABLE "agreement_records" ADD COLUMN "signer_identity_id" text REFERENCES "operator_identities"("id");
ALTER TABLE "agreement_records" ADD COLUMN "signer_name" text;
ALTER TABLE "agreement_records" ADD COLUMN "phone_last4" text;
ALTER TABLE "agreement_records" ADD COLUMN "authentication_method" text;
ALTER TABLE "agreement_records" ADD COLUMN "accepted_statement" text;
ALTER TABLE "agreement_records" ADD COLUMN "stored_at" timestamptz;
ALTER TABLE "agreement_records" ALTER COLUMN "acceptance_payload_sha256" SET NOT NULL;
ALTER TABLE "agreement_records" ALTER COLUMN "signer_identity_id" SET NOT NULL;
ALTER TABLE "agreement_records" ALTER COLUMN "signer_name" SET NOT NULL;
ALTER TABLE "agreement_records" ALTER COLUMN "phone_last4" SET NOT NULL;
ALTER TABLE "agreement_records" ALTER COLUMN "authentication_method" SET NOT NULL;
ALTER TABLE "agreement_records" ALTER COLUMN "accepted_statement" SET NOT NULL;
ALTER TABLE "agreement_records" ALTER COLUMN "signed_at" SET NOT NULL;
ALTER TABLE "agreement_records" ALTER COLUMN "status" SET DEFAULT 'processing';

UPDATE "sites" SET "status" = 'active';
ALTER TABLE "sites" ALTER COLUMN "status" SET DEFAULT 'active';

ALTER TABLE "evidence_bundles" DROP COLUMN "algorithm";
ALTER TABLE "evidence_bundles" DROP COLUMN "key_id";
ALTER TABLE "evidence_bundles" DROP COLUMN "signature";

COMMIT;
