BEGIN;

DROP INDEX "agreement_docuseal_submission_idx";
ALTER TABLE "agreement_records" RENAME COLUMN "docuseal_submission_id" TO "provider_envelope_id";
ALTER TABLE "agreement_records" ALTER COLUMN "provider_envelope_id" TYPE text USING "provider_envelope_id"::text;
ALTER TABLE "agreement_records" ADD COLUMN "signature_provider" text NOT NULL DEFAULT 'documenso';
ALTER TABLE "agreement_records" ALTER COLUMN "signature_provider" DROP DEFAULT;
CREATE UNIQUE INDEX "agreement_provider_envelope_idx"
  ON "agreement_records"("signature_provider", "provider_envelope_id");

COMMIT;
