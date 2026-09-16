import { authenticateOperator } from "@/lib/operator-browser";
import { managedSite } from "@/lib/operator-data";

export async function GET(request: Request, context: { params: Promise<{ siteId: string }> }) {
  const identityId = await authenticateOperator(request);
  const { siteId } = await context.params;
  const data = identityId ? await managedSite(identityId, siteId) : null;
  if (!data) return Response.json({ error: "この事業所を管理する権限がありません。" }, { status: 403 });
  return Response.json(data);
}
