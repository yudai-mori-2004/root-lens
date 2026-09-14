BEGIN;

DROP TABLE "drive_oauth_requests";
DROP TABLE "drive_connections";

CREATE TABLE "drive_connections" (
  "id" text PRIMARY KEY,
  "encrypted_refresh_token" text NOT NULL,
  "google_account_subject" text NOT NULL,
  "connected_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "drive_oauth_requests" (
  "id" text PRIMARY KEY,
  "state_sha256" text NOT NULL UNIQUE,
  "expires_at" timestamptz NOT NULL,
  "used_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

COMMIT;
