import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { operatorIdentities } from "@/db/schema";
import { supabaseAdmin } from "./supabase";

export async function operatorPhoneLast4(identityId: string): Promise<string> {
  const [identity] = await db.select().from(operatorIdentities)
    .where(eq(operatorIdentities.id, identityId)).limit(1);
  if (!identity || identity.provider !== "supabase_sms") throw new Error("SMS login is required");
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(identity.providerSubject);
  if (error || !data.user.phone) throw new Error("SMS identity is unavailable");
  return data.user.phone.slice(-4);
}
