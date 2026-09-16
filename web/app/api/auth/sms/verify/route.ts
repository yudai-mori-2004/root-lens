import { NextResponse } from "next/server";
import { z } from "zod";
import { issueOperatorCookie, OPERATOR_COOKIE } from "@/lib/operator-browser";
import { verifySmsCode } from "@/lib/sms-auth";

const bodySchema = z.object({
  phone: z.string().regex(/^\+[1-9]\d{7,14}$/),
  code: z.string().regex(/^\d{6}$/),
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "確認コードを確認してください。" }, { status: 400 });
  try {
    const identity = await verifySmsCode(parsed.data.phone, parsed.data.code);
    const response = NextResponse.json({ authenticated: true });
    response.cookies.set(OPERATOR_COOKIE, issueOperatorCookie(identity.identityId, parsed.data.phone.slice(-4)), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
    });
    return response;
  } catch {
    return Response.json({ error: "確認コードが正しくないか、有効期限が切れています。" }, { status: 401 });
  }
}
