BEGIN;

ALTER TABLE "operator_invites" ADD COLUMN "acceptance_record_id" text;
ALTER TABLE "operator_invites" ADD COLUMN "acceptance_file_id" text;
ALTER TABLE "operator_invites" ADD COLUMN "acceptance_started_at" timestamptz;
ALTER TABLE "operator_invites" ADD COLUMN "acceptance_identity_id" text;
ALTER TABLE "operator_invites" ADD COLUMN "acceptance_phone_last4" text;
ALTER TABLE "operator_invites" ADD COLUMN "acceptance_signer_name" text;
ALTER TABLE "operator_invites" ADD COLUMN "processing_owner" text;
ALTER TABLE "operator_invites" ADD COLUMN "processing_started_at" timestamptz;

CREATE TABLE "site_registration_attempts" (
  "request_id" text PRIMARY KEY,
  "identity_id" text NOT NULL REFERENCES "operator_identities"("id"),
  "site_id" text NOT NULL,
  "person_id" text NOT NULL,
  "site_name" text NOT NULL,
  "signer_name" text NOT NULL,
  "phone_last4" text NOT NULL,
  "accepted_at" timestamptz NOT NULL,
  "root_folder_id" text NOT NULL,
  "site_agreements_folder_id" text NOT NULL,
  "staff_consents_folder_id" text NOT NULL,
  "approved_data_folder_id" text NOT NULL,
  "site_agreement_id" text NOT NULL,
  "site_agreement_file_id" text NOT NULL,
  "staff_consent_id" text NOT NULL,
  "staff_consent_file_id" text NOT NULL,
  "processing_owner" text,
  "processing_started_at" timestamptz,
  "completed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX "site_registration_site_idx" ON "site_registration_attempts"("site_id");

COMMIT;
