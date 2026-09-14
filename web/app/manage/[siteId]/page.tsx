import SiteClient from "./SiteClient";
export default async function SitePage({ params }: { params: Promise<{ siteId: string }> }) {
  return <SiteClient siteId={(await params).siteId} />;
}
