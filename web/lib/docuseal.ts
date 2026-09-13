type Submitter = {
  name: string;
  email: string;
  role: string;
  externalId: string;
};

type DocuSealSubmitter = {
  id: number;
  submission_id: number;
  slug: string;
  external_id?: string | null;
  status?: string;
  completed_at?: string | null;
  documents?: Array<{ name: string; url: string }>;
};

export type DocuSealSubmission = {
  id: number;
  status: string;
  completed_at?: string | null;
  audit_log_url?: string | null;
  combined_document_url?: string | null;
  submitters: DocuSealSubmitter[];
  documents?: Array<{ name: string; url: string }>;
};

export class DocuSealClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor() {
    const origin = (process.env.DOCUSEAL_URL ?? "https://sign.rootlens.io").replace(/\/$/, "");
    this.baseUrl = origin.endsWith("/api") ? origin : `${origin}/api`;
    this.apiKey = process.env.DOCUSEAL_API_KEY ?? "";
    if (!this.apiKey) throw new Error("DOCUSEAL_API_KEY is not set");
  }

  private async send(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("X-Auth-Token", this.apiKey);
    if (init.body) headers.set("content-type", "application/json");
    const response = await fetch(this.baseUrl + path, { ...init, headers, redirect: "error" });
    if (!response.ok) throw new Error(`DocuSeal request failed (${response.status})`);
    return response;
  }

  async createSubmission(templateId: number, submitters: Submitter[], redirectUrl: string) {
    const result = await this.send("/submissions", {
      method: "POST",
      body: JSON.stringify({
        template_id: templateId,
        send_email: true,
        completed_redirect_url: redirectUrl,
        submitters: submitters.map((submitter) => ({
          name: submitter.name,
          email: submitter.email,
          role: submitter.role,
          external_id: submitter.externalId,
          require_email_2fa: true,
        })),
      }),
    }).then((response) => response.json()) as DocuSealSubmitter[];
    if (!Array.isArray(result) || result.length !== submitters.length
        || result.some((item) => !Number.isInteger(item.id) || !Number.isInteger(item.submission_id) || !item.slug)) {
      throw new Error("DocuSeal returned an invalid submission");
    }
    return {
      submissionId: result[0].submission_id,
      signingUrls: result.map((item) => `${this.baseUrl.replace(/\/api$/, "")}/s/${item.slug}`),
    };
  }

  async submission(id: number): Promise<DocuSealSubmission> {
    const value = await this.send(`/submissions/${id}`).then((response) => response.json()) as DocuSealSubmission;
    if (value.id !== id || !Array.isArray(value.submitters)) throw new Error("DocuSeal returned an invalid submission");
    return value;
  }

  async download(url: string): Promise<Uint8Array> {
    const allowedOrigin = new URL(this.baseUrl).origin;
    const target = new URL(url);
    if (target.protocol !== "https:" || target.origin !== allowedOrigin) throw new Error("DocuSeal returned an untrusted document URL");
    const response = await fetch(target, { headers: { "X-Auth-Token": this.apiKey }, redirect: "error" });
    if (!response.ok) throw new Error(`Could not download DocuSeal document (${response.status})`);
    return new Uint8Array(await response.arrayBuffer());
  }
}
