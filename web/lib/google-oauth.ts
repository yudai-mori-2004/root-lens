export type GoogleAccountSession = Readonly<{ accessToken: string }>;

function loginOauthConfig() {
  const clientId = process.env.GOOGLE_LOGIN_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_LOGIN_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_LOGIN_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) throw new Error("Google login OAuth is not configured");
  return { clientId, clientSecret, redirectUri };
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

export async function exchangeGoogleLoginCode(code: string): Promise<TokenResponse> {
  const { clientId, clientSecret, redirectUri } = loginOauthConfig();
  return tokenRequest(new URLSearchParams({
    code, client_id: clientId, client_secret: clientSecret,
    redirect_uri: redirectUri, grant_type: "authorization_code",
  }));
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
