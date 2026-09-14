type Signer = {
  templateRecipientId: number;
  name: string;
  email: string;
};

type DocumensoRecipient = {
  id: number;
  name: string;
  email: string;
  signingUrl: string;
};

export type DocumensoEnvelope = {
  id: string;
  externalId: string | null;
  status: string;
  completedAt: string | null;
  envelopeItems: Array<{ id: string; title: string }>;
};

export class DocumensoClient {
  private readonly baseUrl: string;
  private readonly apiToken: string;

  constructor() {
    const origin = (process.env.DOCUMENSO_URL ?? "https://sign.rootlens.io").replace(/\/$/, "");
    const url = new URL(origin);
    if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
      throw new Error("DOCUMENSO_URL must use HTTPS");
    }
    this.baseUrl = origin.endsWith("/api/v2") ? origin : `${origin}/api/v2`;
    this.apiToken = process.env.DOCUMENSO_API_TOKEN ?? "";
    if (!this.apiToken) throw new Error("DOCUMENSO_API_TOKEN is not set");
  }

  private async send(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("Authorization", this.apiToken);
    const response = await fetch(this.baseUrl + path, { ...init, headers, redirect: "error" });
    if (!response.ok) throw new Error(`Documenso request failed (${response.status})`);
    return response;
  }

  async createEnvelope(templateEnvelopeId: string, signers: Signer[], externalId: string, redirectUrl: string) {
    const body = new FormData();
    body.set("payload", JSON.stringify({
      envelopeId: templateEnvelopeId,
      externalId,
      distributeDocument: true,
      recipients: signers.map((signer) => ({
        id: signer.templateRecipientId,
        name: signer.name,
        email: signer.email,
      })),
      override: { redirectUrl },
    }));
    const value = await this.send("/envelope/use", { method: "POST", body })
      .then((response) => response.json()) as { id?: unknown; recipients?: unknown };
    const recipients = value.recipients as DocumensoRecipient[] | undefined;
    if (typeof value.id !== "string" || !value.id || !Array.isArray(recipients)
      || recipients.length !== signers.length
      || recipients.some((recipient) => !Number.isInteger(recipient.id) || !recipient.signingUrl)) {
      throw new Error("Documenso returned an invalid envelope");
    }
    return { envelopeId: value.id, signingUrls: recipients.map((recipient) => recipient.signingUrl) };
  }

  async envelope(id: string): Promise<DocumensoEnvelope> {
    const value = await this.send(`/envelope/${encodeURIComponent(id)}`)
      .then((response) => response.json()) as DocumensoEnvelope;
    if (value.id !== id || !Array.isArray(value.envelopeItems)) {
      throw new Error("Documenso returned an invalid envelope");
    }
    return value;
  }

  async downloadSignedPdf(envelopeItemId: string): Promise<Uint8Array> {
    return this.download(`/envelope/item/${encodeURIComponent(envelopeItemId)}/download?version=signed`);
  }

  async downloadCertificate(envelopeId: string): Promise<Uint8Array> {
    return this.download(`/envelope/${encodeURIComponent(envelopeId)}/certificate/download`);
  }

  private async download(path: string): Promise<Uint8Array> {
    const response = await this.send(path, { headers: { Accept: "application/pdf" } });
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/pdf")) {
      throw new Error("Documenso returned a non-PDF artifact");
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    const pdfHeader = [0x25, 0x50, 0x44, 0x46, 0x2d];
    if (bytes.length < pdfHeader.length || pdfHeader.some((value, index) => bytes[index] !== value)) {
      throw new Error("Documenso returned an invalid PDF artifact");
    }
    return bytes;
  }
}
