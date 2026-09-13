import { timingSafeEqual } from "node:crypto";

export function authenticateInternalRequest(request: Request): Response | null {
  const expected = process.env.ROOTLENS_INTERNAL_API_TOKEN;
  const authorization = request.headers.get("authorization");
  const actual = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!expected || actual.length !== expected.length
      || !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}
