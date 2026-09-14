import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { operatorIdentities } from "@/db/schema";

function publicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase SMS authentication is not configured");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function sendSmsCode(phone: string) {
  const { error } = await publicClient().auth.signInWithOtp({ phone, options: { shouldCreateUser: true } });
  if (error) throw error;
}

export async function verifySmsCode(phone: string, token: string) {
  const { data, error } = await publicClient().auth.verifyOtp({ phone, token, type: "sms" });
  if (error || !data.user?.id || !data.user.phone) throw error ?? new Error("SMS identity is incomplete");
  let [identity] = await db.select().from(operatorIdentities).where(and(
    eq(operatorIdentities.provider, "supabase_sms"),
    eq(operatorIdentities.providerSubject, data.user.id),
  )).limit(1);
  if (!identity) {
    await db.insert(operatorIdentities).values({
      id: `identity_${randomUUID()}`,
      provider: "supabase_sms",
      providerSubject: data.user.id,
    }).onConflictDoNothing();
    [identity] = await db.select().from(operatorIdentities).where(and(
      eq(operatorIdentities.provider, "supabase_sms"),
      eq(operatorIdentities.providerSubject, data.user.id),
    )).limit(1);
  }
  if (!identity) throw new Error("SMS identity could not be stored");
  return { identityId: identity.id, phoneLast4: data.user.phone.slice(-4) };
}
