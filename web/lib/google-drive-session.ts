import { GoogleAuth } from "google-auth-library";
import type { GoogleAccountSession } from "./google-oauth";

let auth: GoogleAuth | undefined;

function driveAuth(): GoogleAuth {
  if (auth) return auth;
  const encoded = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON_BASE64;
  if (!encoded) throw new Error("Google Drive service account is not configured");
  const credentials = JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) as {
    client_email?: unknown;
    private_key?: unknown;
  };
  if (typeof credentials.client_email !== "string" || typeof credentials.private_key !== "string") {
    throw new Error("Google Drive service account credentials are invalid");
  }
  auth = new GoogleAuth({
    credentials: {
      client_email: credentials.client_email,
      private_key: credentials.private_key,
    },
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
  return auth;
}

export async function googleDriveSession(): Promise<GoogleAccountSession> {
  const client = await driveAuth().getClient();
  const accessToken = await client.getAccessToken();
  if (!accessToken.token) throw new Error("Google Drive access token is unavailable");
  return { accessToken: accessToken.token };
}
