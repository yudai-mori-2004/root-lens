import { randomUUID } from "node:crypto";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { agreementRecords, people, sites } from "@/db/schema";
import { DocuSealClient } from "@/lib/docuseal";
import { authenticateInternalRequest } from "@/lib/internal-auth";

const bodySchema = z.object({
  siteId: z.string().min(1),
  kind: z.enum(["site_agreement", "staff_consent"]),
  documentVersion: z.string().min(1).max(100),
  templateSha256: z.string().regex(/^[0-9a-f]{64}$/),
  templateId: z.number().int().positive(),
  personId: z.string().min(1).optional(),
  submitters: z.array(z.object({
    name: z.string().min(1).max(200),
    email: z.string().email(),
    role: z.string().min(1).max(100),
  })).min(1).max(4),
});

export async function POST(request: Request) {
  const unauthorized = authenticateInternalRequest(request);
  if (unauthorized) return unauthorized;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid signing request" }, { status: 400 });
  const input = parsed.data;
  const [site] = await db.select().from(sites).where(eq(sites.id, input.siteId)).limit(1);
  if (!site) return Response.json({ error: "site not found" }, { status: 404 });

  let personId = input.personId ?? null;
  if (input.kind === "staff_consent") {
    if (personId) {
      const [person] = await db.select({ id: people.id }).from(people).where(and(
        eq(people.id, personId),
        eq(people.organizationId, site.organizationId),
        eq(people.siteId, site.id),
        eq(people.role, "staff"),
        eq(people.status, "active"),
      )).limit(1);
      if (!person) return Response.json({ error: "staff member not found at this site" }, { status: 404 });
    } else {
      personId = `person_${randomUUID()}`;
      await db.insert(people).values({
        id: personId,
        organizationId: site.organizationId,
        siteId: site.id,
        role: "staff",
      });
    }
  }
  const agreementRecordId = `agr_${randomUUID()}`;
  const docuseal = new DocuSealClient();
  const submission = await docuseal.createSubmission(
    input.templateId,
    input.submitters.map((signer) => ({ ...signer, externalId: agreementRecordId })),
    `${process.env.PUBLIC_WEB_ORIGIN ?? "https://www.rootlens.io"}/signing/complete`,
  );
  await db.insert(agreementRecords).values({
    id: agreementRecordId,
    siteId: site.id,
    personId,
    kind: input.kind,
    documentVersion: input.documentVersion,
    templateSha256: input.templateSha256,
    docusealSubmissionId: submission.submissionId,
  });
  return Response.json({ agreementRecordId, signingUrls: submission.signingUrls }, { status: 201 });
}
