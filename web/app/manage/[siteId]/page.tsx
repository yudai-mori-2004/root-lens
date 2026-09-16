import SiteClient from "./SiteClient";
import { operatorPage } from "@/lib/operator-page";
import { managedSite } from "@/lib/operator-data";
import { notFound } from "next/navigation";
export default async function SitePage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const { identityId } = await operatorPage(`/manage/${siteId}`);
  const data = await managedSite(identityId, siteId);
  if (!data) notFound();
  return <SiteClient siteId={siteId} initialData={data} />;
}
