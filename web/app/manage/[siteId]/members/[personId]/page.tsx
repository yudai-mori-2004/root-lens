import ProfileClient from "./ProfileClient";

export default async function ProfilePage({ params }: { params: Promise<{ siteId: string; personId: string }> }) {
  const { siteId, personId } = await params;
  return <ProfileClient siteId={siteId} personId={personId} />;
}
