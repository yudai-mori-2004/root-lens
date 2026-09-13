BEGIN;

CREATE TABLE "organizations" (
  "id" text PRIMARY KEY,
  "status" text NOT NULL DEFAULT 'active',
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE "sites" (
  "id" text PRIMARY KEY,
  "organization_id" text NOT NULL REFERENCES "organizations"("id"),
  "name" text NOT NULL,
  "shared_drive_id" text NOT NULL,
  "root_folder_id" text NOT NULL,
  "site_agreements_folder_id" text NOT NULL,
  "staff_consents_folder_id" text NOT NULL,
  "approved_data_folder_id" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending_agreement',
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE "people" (
  "id" text PRIMARY KEY,
  "organization_id" text NOT NULL REFERENCES "organizations"("id"),
  "site_id" text NOT NULL REFERENCES "sites"("id"),
  "role" text NOT NULL,
  "status" text NOT NULL DEFAULT 'active',
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "people_site_idx" ON "people"("site_id");
CREATE TABLE "agreement_records" (
  "id" text PRIMARY KEY,
  "site_id" text NOT NULL REFERENCES "sites"("id"),
  "person_id" text REFERENCES "people"("id"),
  "kind" text NOT NULL,
  "document_version" text NOT NULL,
  "template_sha256" text NOT NULL,
  "docuseal_submission_id" bigint NOT NULL,
  "signed_pdf_file_id" text,
  "signed_pdf_sha256" text,
  "certificate_file_id" text,
  "certificate_sha256" text,
  "signed_at" timestamptz,
  "status" text NOT NULL DEFAULT 'pending',
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "agreement_docuseal_submission_idx" ON "agreement_records"("docuseal_submission_id");
CREATE INDEX "agreement_site_kind_status_idx" ON "agreement_records"("site_id", "kind", "status");
CREATE UNIQUE INDEX "agreement_active_site_idx" ON "agreement_records"("site_id")
  WHERE "kind" = 'site_agreement' AND "status" = 'active';
CREATE UNIQUE INDEX "agreement_active_staff_idx" ON "agreement_records"("person_id")
  WHERE "kind" = 'staff_consent' AND "status" = 'active';
CREATE TABLE "drive_connections" (
  "site_id" text PRIMARY KEY REFERENCES "sites"("id"),
  "encrypted_refresh_token" text NOT NULL,
  "google_account_subject" text NOT NULL,
  "connected_at" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE "drive_oauth_requests" (
  "id" text PRIMARY KEY,
  "site_id" text NOT NULL REFERENCES "sites"("id"),
  "state_sha256" text NOT NULL UNIQUE,
  "expires_at" timestamptz NOT NULL,
  "used_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE "operator_invites" (
  "id" text PRIMARY KEY,
  "person_id" text NOT NULL REFERENCES "people"("id"),
  "email_sha256" text NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "accepted_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "operator_invites_email_idx" ON "operator_invites"("email_sha256");
CREATE TABLE "operator_identities" (
  "id" text PRIMARY KEY,
  "provider" text NOT NULL,
  "provider_subject" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "operator_identity_provider_idx" ON "operator_identities"("provider", "provider_subject");
CREATE TABLE "operator_memberships" (
  "identity_id" text NOT NULL REFERENCES "operator_identities"("id"),
  "person_id" text NOT NULL REFERENCES "people"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "operator_membership_identity_person_idx" ON "operator_memberships"("identity_id", "person_id");
CREATE UNIQUE INDEX "operator_membership_person_idx" ON "operator_memberships"("person_id");
CREATE TABLE "desktop_login_requests" (
  "id" text PRIMARY KEY,
  "state_sha256" text NOT NULL UNIQUE,
  "client_state" text NOT NULL,
  "code_challenge" text NOT NULL,
  "redirect_uri" text NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "completed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE "desktop_authorization_codes" (
  "id" text PRIMARY KEY,
  "code_sha256" text NOT NULL UNIQUE,
  "identity_id" text NOT NULL REFERENCES "operator_identities"("id"),
  "code_challenge" text NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "used_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE "desktop_sessions" (
  "id" text PRIMARY KEY,
  "identity_id" text NOT NULL REFERENCES "operator_identities"("id"),
  "token_sha256" text NOT NULL UNIQUE,
  "expires_at" timestamptz NOT NULL,
  "revoked_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "desktop_sessions_identity_idx" ON "desktop_sessions"("identity_id");
CREATE TABLE "drive_upload_attempts" (
  "id" text PRIMARY KEY,
  "site_id" text NOT NULL REFERENCES "sites"("id"),
  "person_id" text NOT NULL REFERENCES "people"("id"),
  "unit_id" text NOT NULL,
  "source_manifest_sha256" text NOT NULL,
  "folder_id" text NOT NULL,
  "status" text NOT NULL DEFAULT 'uploading',
  "completed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "drive_upload_site_unit_idx" ON "drive_upload_attempts"("site_id", "unit_id");
CREATE TABLE "drive_upload_files" (
  "id" text PRIMARY KEY,
  "attempt_id" text NOT NULL REFERENCES "drive_upload_attempts"("id"),
  "path" text NOT NULL,
  "bytes" bigint NOT NULL,
  "sha256" text NOT NULL,
  "drive_file_id" text NOT NULL,
  "verified_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "drive_upload_file_path_idx" ON "drive_upload_files"("attempt_id", "path");
CREATE TABLE "passkey_credentials" (
  "id" text PRIMARY KEY,
  "person_id" text NOT NULL REFERENCES "people"("id"),
  "public_key" text NOT NULL,
  "counter" bigint NOT NULL DEFAULT 0,
  "transports" jsonb NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "passkey_person_idx" ON "passkey_credentials"("person_id");
CREATE TABLE "passkey_registrations" (
  "id" text PRIMARY KEY,
  "token_sha256" text NOT NULL UNIQUE,
  "person_id" text NOT NULL REFERENCES "people"("id"),
  "challenge" text,
  "expires_at" timestamptz NOT NULL,
  "completed" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE "consent_snapshots" (
  "id" text PRIMARY KEY,
  "site_id" text NOT NULL REFERENCES "sites"("id"),
  "snapshot_sha256" text NOT NULL,
  "records" jsonb NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE "approval_signatures" (
  "id" text PRIMARY KEY,
  "token_sha256" text NOT NULL UNIQUE,
  "site_id" text NOT NULL REFERENCES "sites"("id"),
  "person_id" text NOT NULL REFERENCES "people"("id"),
  "unit_id" text NOT NULL,
  "source_manifest_sha256" text NOT NULL,
  "source_files" jsonb NOT NULL,
  "consent_snapshot_id" text NOT NULL REFERENCES "consent_snapshots"("id"),
  "statement_version" text NOT NULL,
  "challenge" text,
  "expires_at" timestamptz NOT NULL,
  "completed" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "approval_signature_unit_idx" ON "approval_signatures"("site_id", "unit_id");
CREATE TABLE "approval_events" (
  "id" text PRIMARY KEY,
  "signature_id" text NOT NULL UNIQUE REFERENCES "approval_signatures"("id"),
  "site_id" text NOT NULL REFERENCES "sites"("id"),
  "unit_id" text NOT NULL,
  "source_manifest_sha256" text NOT NULL,
  "person_id" text NOT NULL REFERENCES "people"("id"),
  "credential_id" text NOT NULL REFERENCES "passkey_credentials"("id"),
  "signed_payload_sha256" text NOT NULL,
  "assertion_sha256" text NOT NULL,
  "receipt" jsonb NOT NULL,
  "approved_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "approval_event_site_unit_idx" ON "approval_events"("site_id", "unit_id");
ALTER TABLE "drive_upload_attempts"
  ADD COLUMN "approval_event_id" text NOT NULL UNIQUE REFERENCES "approval_events"("id");

CREATE TABLE "evidence_bundles" (
  "id" text PRIMARY KEY,
  "upload_attempt_id" text NOT NULL REFERENCES "drive_upload_attempts"("id"),
  "approval_event_id" text NOT NULL REFERENCES "approval_events"("id"),
  "unit_id" text NOT NULL,
  "delivery_manifest_sha256" text NOT NULL,
  "payload_sha256" text NOT NULL,
  "algorithm" text NOT NULL,
  "key_id" text NOT NULL,
  "signature" text NOT NULL,
  "evidence" jsonb NOT NULL,
  "provided_at" timestamptz NOT NULL,
  "issued_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "evidence_unit_idx" ON "evidence_bundles"("unit_id");
CREATE INDEX "evidence_approval_idx" ON "evidence_bundles"("approval_event_id");

COMMIT;
