import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export type GoogleAccountSession = Readonly<{ accessToken: string }>;

function driveOauthConfig() {
  const clientId = process.env.GOOGLE_DRIVE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_DRIVE_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) throw new Error("Google Drive OAuth is not configured");
  return { clientId, clientSecret, redirectUri };
}

function loginOauthConfig() {
  const clientId = process.env.GOOGLE_LOGIN_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_LOGIN_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_LOGIN_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) throw new Error("Google login OAuth is not configured");
  return { clientId, clientSecret, redirectUri };
}

function tokenKey(): Buffer {
  const encoded = process.env.DRIVE_TOKEN_ENCRYPTION_KEY;
  const key = encoded ? Buffer.from(encoded, "base64") : Buffer.alloc(0);
  if (key.length !== 32) throw new Error("DRIVE_TOKEN_ENCRYPTION_KEY must be 32 bytes in base64");
  return key;
}

export function googleAuthorizationUrl(state: string): string {
  const { clientId, redirectUri } = driveOauthConfig();
  const query = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: "openid email https://www.googleapis.com/auth/drive",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${query}`;
}

export function googleLoginAuthorizationUrl(state: string): string {
  const { clientId, redirectUri } = loginOauthConfig();
  const query = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${query}`;
}

type TokenResponse = { access_token: string; refresh_token?: string; id_token?: string };

async function tokenRequest(parameters: URLSearchParams): Promise<TokenResponse> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: parameters,
  });
  if (!response.ok) throw new Error("Google OAuth token exchange failed");
  return response.json() as Promise<TokenResponse>;
}

export async function exchangeGoogleCode(code: string): Promise<TokenResponse> {
  const { clientId, clientSecret, redirectUri } = driveOauthConfig();
  return tokenRequest(new URLSearchParams({
    code, client_id: clientId, client_secret: clientSecret,
    redirect_uri: redirectUri, grant_type: "authorization_code",
  }));
}

export async function exchangeGoogleLoginCode(code: string): Promise<TokenResponse> {
  const { clientId, clientSecret, redirectUri } = loginOauthConfig();
  return tokenRequest(new URLSearchParams({
    code, client_id: clientId, client_secret: clientSecret,
    redirect_uri: redirectUri, grant_type: "authorization_code",
  }));
}

export async function googleSession(encryptedRefreshToken: string): Promise<GoogleAccountSession> {
  const { clientId, clientSecret } = driveOauthConfig();
  const refreshToken = decryptRefreshToken(encryptedRefreshToken);
  const tokens = await tokenRequest(new URLSearchParams({
    refresh_token: refreshToken, client_id: clientId,
    client_secret: clientSecret, grant_type: "refresh_token",
  }));
  return { accessToken: tokens.access_token };
}

export async function googleAccountSubject(session: GoogleAccountSession): Promise<string> {
  return (await googleIdentity(session)).subject;
}

export async function googleIdentity(session: GoogleAccountSession): Promise<{
  subject: string;
  email: string;
}> {
  const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { authorization: `Bearer ${session.accessToken}` },
  });
  if (!response.ok) throw new Error("Could not identify Google account");
  const value = await response.json() as { sub?: unknown; email?: unknown; email_verified?: unknown };
  if (typeof value.sub !== "string" || !value.sub || typeof value.email !== "string"
      || !value.email || value.email_verified !== true) {
    throw new Error("Google account identity is incomplete");
  }
  return { subject: value.sub, email: value.email };
}

export function encryptRefreshToken(refreshToken: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", tokenKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(refreshToken, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString("base64url")).join(".");
}

export function decryptRefreshToken(value: string): string {
  const parts = value.split(".").map((part) => Buffer.from(part, "base64url"));
  if (parts.length !== 3 || parts[0].length !== 12 || parts[1].length !== 16) throw new Error("Invalid stored Drive token");
  const decipher = createDecipheriv("aes-256-gcm", tokenKey(), parts[0]);
  decipher.setAuthTag(parts[1]);
  return Buffer.concat([decipher.update(parts[2]), decipher.final()]).toString("utf8");
}
