// API 認証。
//
// `Authorization: Bearer <supabase JWT>` を検証して account_id (= auth.users.id の uuid)
// を返す。 クライアント申告の id は一切信用しない (= 識別子は必ず検証済みトークンの sub)。

import { supabaseAdmin } from "./supabase";

function unauthorized(message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

export type AccountAuthentication =
  | { ok: true; accountId: string }
  | { ok: false; response: Response };

/** Bearer JWTを検証する。認証基盤自体の障害は通常の例外として呼び出し側へ伝える。 */
export async function authenticateAccount(req: Request): Promise<AccountAuthentication> {
  const auth = req.headers.get("authorization");
  if (!auth || !auth.startsWith("Bearer ")) {
    return { ok: false, response: unauthorized("Authorization: Bearer <token> required") };
  }
  const token = auth.slice("Bearer ".length).trim();

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) {
    return { ok: false, response: unauthorized("invalid or expired token") };
  }
  return { ok: true, accountId: data.user.id };
}
