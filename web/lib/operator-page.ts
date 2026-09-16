import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { operatorIdentityId, operatorPhoneHint } from "@/lib/operator-browser";

export async function operatorPage(next: string) {
  const request = new Request("https://rootlens.io", { headers: { cookie: (await headers()).get("cookie") ?? "" } });
  const identityId = operatorIdentityId(request);
  if (!identityId) redirect(`/login?next=${encodeURIComponent(next)}`);
  return { identityId, phoneLast4: operatorPhoneHint(request) };
}
