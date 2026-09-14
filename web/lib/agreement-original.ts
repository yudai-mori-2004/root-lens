import { readFile } from "node:fs/promises";
import { join } from "node:path";
import PDFDocument from "pdfkit";
import { agreementTemplates, type AgreementKind } from "@/content/agreementTemplates.generated";

export type AgreementSigner = Readonly<{
  name: string;
  phoneLast4: string;
  identityId: string;
}>;

export type AgreementOriginalInput = Readonly<{
  agreementId: string;
  kind: AgreementKind;
  siteId: string;
  siteName: string;
  signer: AgreementSigner;
  acceptedAt: Date;
  acceptedStatement: string;
}>;

function plainMarkdown(line: string): string {
  return line.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1");
}

function agreementBody(kind: AgreementKind, body: string, siteName: string): string {
  const withSiteName = kind === "site_agreement"
    ? body.replace("［　　　　　　　　　　　　　　］", `［${siteName}］`)
    : body;
  if (kind === "site_agreement") return withSiteName.split("\n---\n", 1)[0].trimEnd();
  return withSiteName
    .replace(/^- \[ \] /gm, "- ")
    .replace(/\n\| 項目 \| 記入欄 \|\n\|---\|---\|\n(?:\|.*\|\n){4}/, "\n");
}

export async function createAgreementPdf(input: AgreementOriginalInput): Promise<Uint8Array> {
  const font = await readFile(join(process.cwd(), "assets/fonts/NotoSansCJKjp-Regular.otf"));
  const template = agreementTemplates[input.kind];
  const document = new PDFDocument({
    size: "A4",
    margins: { top: 50, right: 54, bottom: 50, left: 54 },
    info: { Title: template.title, Author: "RootLens", CreationDate: input.acceptedAt, ModDate: input.acceptedAt },
  });
  document.registerFont("NotoSansJP", font).font("NotoSansJP");
  const chunks: Buffer[] = [];
  document.on("data", (chunk: Buffer) => chunks.push(chunk));
  const completed = new Promise<Uint8Array>((resolve, reject) => {
    document.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks))));
    document.on("error", reject);
  });

  const body = agreementBody(input.kind, template.body, input.siteName);
  for (const rawLine of body.split("\n")) {
    const line = plainMarkdown(rawLine.trim());
    if (!line || line === "---") { document.moveDown(0.55); continue; }
    if (line.startsWith("# ")) {
      document.fontSize(18).text(line.slice(2), { align: "center" }).moveDown(0.8);
    } else if (line.startsWith("## ")) {
      document.fontSize(12).text(line.slice(3)).moveDown(0.35);
    } else if (/^[-*]\s+/.test(line)) {
      document.fontSize(9.5).text(`・${line.replace(/^[-*]\s+/, "")}`, { indent: 12 }).moveDown(0.2);
    } else if (/^\d+\.\s+/.test(line)) {
      document.fontSize(9.5).text(line, { indent: 8 }).moveDown(0.2);
    } else if (line.startsWith("|")) {
      if (!/^\|?[-| :]+\|?$/.test(line)) document.fontSize(8.5).text(line.replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim()).join("　｜　"));
    } else {
      document.fontSize(9.5).text(line, { lineGap: 3 }).moveDown(0.4);
    }
  }

  document.addPage();
  document.fontSize(16).text("同意記録").moveDown(1);
  const rows = [
    ["同意者", input.signer.name],
    ["事業所", input.siteName],
    ["認証方法", "SMSワンタイムパスワード"],
    ["電話番号", `*******${input.signer.phoneLast4}`],
    ["同意日時", input.acceptedAt.toISOString()],
    ["同意文言", input.acceptedStatement],
    ["文書版", template.version],
    ["合意記録ID", input.agreementId],
  ];
  for (const [label, value] of rows) {
    document.fontSize(9).fillColor("#555").text(label);
    document.fontSize(10).fillColor("#111").text(value).moveDown(0.65);
  }
  document.fontSize(8).fillColor("#555").moveDown(1)
    .text("この記録は、SMS認証後に表示された文書を確認し、同意操作が行われたことをRootLensが記録したものです。");

  document.end();
  return completed;
}
