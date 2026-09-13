import { evidencePublicKey } from "@/lib/evidence";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!process.env.EVIDENCE_PUBLIC_KEY_ID || id !== process.env.EVIDENCE_PUBLIC_KEY_ID) {
    return Response.json({ error: "evidence key not found" }, { status: 404 });
  }
  const publicKey = await evidencePublicKey();
  return Response.json({ id, algorithm: "ECDSA_P256_SHA256", publicKey });
}
