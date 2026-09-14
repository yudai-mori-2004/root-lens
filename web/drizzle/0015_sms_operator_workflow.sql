BEGIN;

ALTER TABLE "people" ADD COLUMN "name" text NOT NULL DEFAULT '';
ALTER TABLE "people" ALTER COLUMN "name" DROP DEFAULT;

DELETE FROM "operator_invites";
DROP INDEX IF EXISTS "operator_invites_email_idx";
ALTER TABLE "operator_invites" DROP COLUMN "email_sha256";
ALTER TABLE "operator_invites" ADD COLUMN "token_sha256" text NOT NULL;
CREATE UNIQUE INDEX "operator_invites_token_idx" ON "operator_invites" ("token_sha256");
CREATE INDEX "operator_invites_person_idx" ON "operator_invites" ("person_id");

ALTER TABLE "approval_events" DROP COLUMN "credential_id";
ALTER TABLE "approval_events" RENAME COLUMN "signed_payload_sha256" TO "approval_payload_sha256";
ALTER TABLE "approval_events" DROP COLUMN "assertion_sha256";
ALTER TABLE "approval_events" ADD COLUMN "identity_id" text REFERENCES "operator_identities"("id");
ALTER TABLE "approval_events" ADD COLUMN "authentication_method" text;
UPDATE "approval_events" SET "identity_id" = "operator_memberships"."identity_id", "authentication_method" = 'webauthn'
FROM "operator_memberships" WHERE "operator_memberships"."person_id" = "approval_events"."person_id";
ALTER TABLE "approval_events" ALTER COLUMN "identity_id" SET NOT NULL;
ALTER TABLE "approval_events" ALTER COLUMN "authentication_method" SET NOT NULL;
ALTER TABLE "approval_signatures" DROP COLUMN "challenge";
DROP TABLE "passkey_registrations";
DROP TABLE "passkey_credentials";

COMMIT;
