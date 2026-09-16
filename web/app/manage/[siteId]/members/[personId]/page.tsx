import ProfileClient from "./ProfileClient";
import { operatorPage } from "@/lib/operator-page";
import { managedSite } from "@/lib/operator-data";
import { notFound } from "next/navigation";

export default async function ProfilePage({ params }: { params: Promise<{ siteId: string; personId: string }> }) {
  const { siteId, personId } = await params;
  const { identityId } = await operatorPage(`/manage/${siteId}/members/${personId}`);
  const data = await managedSite(identityId, siteId);
  if (!data || !data.members.some((member) => member.id === personId)) notFound();
  return <ProfileClient siteId={siteId} personId={personId} initialData={data} />;
}
