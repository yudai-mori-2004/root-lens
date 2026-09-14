import { authenticateOperator } from "@/lib/operator-browser";

export async function GET(request: Request) {
  const identityId = await authenticateOperator(request);
  return identityId
    ? Response.json({ authenticated: true })
    : Response.json({ authenticated: false }, { status: 401 });
}
