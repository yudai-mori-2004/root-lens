import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import {
  desktopAuthorizationCodes, desktopLoginRequests, operatorIdentities,
  operatorInvites, operatorMemberships, people,
} from "@/db/schema";
import { emailSha256, randomToken } from "@/lib/desktop-auth-values";
import { sha256 } from "@/lib/encoding";
import { exchangeGoogleLoginCode, googleIdentity } from "@/lib/google-oauth";
import { issueOperatorCookie, OPERATOR_COOKIE } from "@/lib/operator-browser";

function resultPage(message: string, status = 400): Response {
  return new Response(message, { status, headers: { "content-type": "text/plain; charset=utf-8" } });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code");
  if (!state || !code) return resultPage("ログインを完了できませんでした。Desktopからやり直してください。");
  try {
    const [attempt] = await db.select().from(desktopLoginRequests).where(and(
      eq(desktopLoginRequests.stateSha256, sha256(state)),
      gt(desktopLoginRequests.expiresAt, new Date()),
      isNull(desktopLoginRequests.completedAt),
    )).limit(1);
    if (!attempt) throw new Error("login request expired");
    const tokens = await exchangeGoogleLoginCode(code);
    const google = await googleIdentity({ accessToken: tokens.access_token });
    const emailDigest = emailSha256(google.email);
    const authorizationCode = randomToken();

    const identityId = await db.transaction(async (transaction) => {
      let [identity] = await transaction.select().from(operatorIdentities).where(and(
        eq(operatorIdentities.provider, "google"),
        eq(operatorIdentities.providerSubject, google.subject),
      )).limit(1);
      const invites = await transaction.select({ id: operatorInvites.id, personId: operatorInvites.personId })
        .from(operatorInvites)
        .innerJoin(people, eq(people.id, operatorInvites.personId))
        .where(and(
          eq(operatorInvites.emailSha256, emailDigest),
          gt(operatorInvites.expiresAt, new Date()),
          isNull(operatorInvites.acceptedAt),
          eq(people.status, "active"),
          eq(people.role, "supervisor"),
        ));
      if (!identity && invites.length === 0) throw new Error("account is not invited");
      if (!identity) {
        await transaction.insert(operatorIdentities).values({
          id: `identity_${randomUUID()}`,
          provider: "google",
          providerSubject: google.subject,
        }).onConflictDoNothing();
        [identity] = await transaction.select().from(operatorIdentities).where(and(
          eq(operatorIdentities.provider, "google"),
          eq(operatorIdentities.providerSubject, google.subject),
        )).limit(1);
        if (!identity) throw new Error("identity could not be created");
      }
      for (const invite of invites) {
        await transaction.insert(operatorMemberships).values({
          identityId: identity.id,
          personId: invite.personId,
        }).onConflictDoNothing();
        await transaction.update(operatorInvites).set({ acceptedAt: new Date() })
          .where(and(eq(operatorInvites.id, invite.id), isNull(operatorInvites.acceptedAt)));
      }
      const memberships = await transaction.select({ personId: people.id }).from(operatorMemberships)
        .innerJoin(people, eq(people.id, operatorMemberships.personId))
        .where(and(
          eq(operatorMemberships.identityId, identity.id),
          eq(people.status, "active"),
          eq(people.role, "supervisor"),
        )).limit(1);
      if (memberships.length !== 1) throw new Error("account has no active membership");
      const won = await transaction.update(desktopLoginRequests).set({ completedAt: new Date() }).where(and(
        eq(desktopLoginRequests.id, attempt.id), isNull(desktopLoginRequests.completedAt),
      )).returning({ id: desktopLoginRequests.id });
      if (won.length !== 1) throw new Error("login request already used");
      await transaction.insert(desktopAuthorizationCodes).values({
        id: `code_${randomUUID()}`,
        codeSha256: sha256(authorizationCode),
        identityId: identity.id,
        codeChallenge: attempt.codeChallenge,
        expiresAt: new Date(Date.now() + 2 * 60_000),
      });
      return identity.id;
    });

    const redirect = new URL(attempt.redirectUri);
    redirect.searchParams.set("code", authorizationCode);
    redirect.searchParams.set("state", attempt.clientState);
    const response = NextResponse.redirect(redirect, 302);
    response.cookies.set(OPERATOR_COOKIE, issueOperatorCookie(identityId), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
    });
    return response;
  } catch {
    return resultPage("このGoogleアカウントではログインできません。招待されたアカウントを選んで、Desktopからやり直してください。", 403);
  }
}
