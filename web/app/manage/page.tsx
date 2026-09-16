import type { Metadata } from "next";
import ManageClient from "./ManageClient";
import { operatorPage } from "@/lib/operator-page";
import { managedSites } from "@/lib/operator-data";
import { operatorPhoneLast4 } from "@/lib/operator-identity";

export const metadata: Metadata = { title: "事業所管理", robots: { index: false, follow: false } };
export default async function ManagePage() {
  const { identityId, phoneLast4 } = await operatorPage("/manage");
  const [sites, phone] = await Promise.all([
    managedSites(identityId),
    phoneLast4 ? Promise.resolve(phoneLast4) : operatorPhoneLast4(identityId).catch(() => null),
  ]);
  return <ManageClient sites={sites} phoneLast4={phone} />;
}
