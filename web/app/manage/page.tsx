import type { Metadata } from "next";
import ManageClient from "./ManageClient";
import { operatorPage } from "@/lib/operator-page";
import { managedSites } from "@/lib/operator-data";

export const metadata: Metadata = { title: "事業所管理", robots: { index: false, follow: false } };
export default async function ManagePage() {
  const { identityId, phoneLast4 } = await operatorPage("/manage");
  const sites = await managedSites(identityId);
  return <ManageClient sites={sites} phoneLast4={phoneLast4} />;
}
