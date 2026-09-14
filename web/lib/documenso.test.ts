import { afterEach, describe, expect, it, vi } from "vitest";
import { DocumensoClient } from "./documenso";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function client() {
  vi.stubEnv("DOCUMENSO_URL", "https://sign.rootlens.io");
  vi.stubEnv("DOCUMENSO_API_TOKEN", "api_test");
  return new DocumensoClient();
}

describe("DocumensoClient", () => {
  it("creates and distributes an envelope from a template envelope", async () => {
    const fetch = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      expect(new Headers(init?.headers).get("Authorization")).toBe("api_test");
      const body = init?.body as FormData;
      expect(JSON.parse(String(body.get("payload")))).toEqual({
        envelopeId: "template_envelope",
        externalId: "agr_123",
        distributeDocument: true,
        recipients: [{ id: 7, name: "Signer", email: "signer@example.com" }],
        override: { redirectUrl: "https://www.rootlens.io/signing/complete" },
      });
      return Response.json({
        id: "envelope_123",
        recipients: [{ id: 12, name: "Signer", email: "signer@example.com", signingUrl: "https://sign.rootlens.io/sign/token" }],
      });
    });
    vi.stubGlobal("fetch", fetch);

    await expect(client().createEnvelope(
      "template_envelope",
      [{ templateRecipientId: 7, name: "Signer", email: "signer@example.com" }],
      "agr_123",
      "https://www.rootlens.io/signing/complete",
    )).resolves.toEqual({
      envelopeId: "envelope_123",
      signingUrls: ["https://sign.rootlens.io/sign/token"],
    });
    expect(fetch).toHaveBeenCalledWith("https://sign.rootlens.io/api/v2/envelope/use", expect.anything());
  });

  it("fetches the completed envelope and downloads its signed artifacts", async () => {
    const fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/envelope/envelope_123")) {
        return Response.json({
          id: "envelope_123",
          externalId: "agr_123",
          status: "COMPLETED",
          completedAt: "2026-09-14T00:00:00.000Z",
          envelopeItems: [{ id: "item_123", title: "Agreement" }],
        });
      }
      return new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]), {
        headers: { "content-type": "application/pdf" },
      });
    });
    vi.stubGlobal("fetch", fetch);
    const documenso = client();

    await expect(documenso.envelope("envelope_123")).resolves.toMatchObject({ status: "COMPLETED" });
    await expect(documenso.downloadSignedPdf("item_123")).resolves.toHaveLength(5);
    await expect(documenso.downloadCertificate("envelope_123")).resolves.toHaveLength(5);
    expect(fetch).toHaveBeenCalledWith(
      "https://sign.rootlens.io/api/v2/envelope/item/item_123/download?version=signed",
      expect.anything(),
    );
    expect(fetch).toHaveBeenCalledWith(
      "https://sign.rootlens.io/api/v2/envelope/envelope_123/certificate/download",
      expect.anything(),
    );
  });

  it("rejects a response that claims to be a PDF but has different bytes", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not a pdf", {
      headers: { "content-type": "application/pdf" },
    })));

    await expect(client().downloadCertificate("envelope_123"))
      .rejects.toThrow("Documenso returned an invalid PDF artifact");
  });

  it("rejects malformed provider responses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ id: "envelope_123", recipients: [] })));
    await expect(client().createEnvelope(
      "template_envelope",
      [{ templateRecipientId: 7, name: "Signer", email: "signer@example.com" }],
      "agr_123",
      "https://www.rootlens.io/signing/complete",
    )).rejects.toThrow("invalid envelope");
  });
});
