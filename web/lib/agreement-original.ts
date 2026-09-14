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

function japaneseDateTime(value: Date): string {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}年${part("month")}月${part("day")}日 ${part("hour")}:${part("minute")}（日本時間）`;
}

function documentVersion(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return `${value}版`;
  return `${Number(match[1])}年${Number(match[2])}月${Number(match[3])}日版`;
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
    ["認証方法", "SMS認証"],
    ["電話番号", `*******${input.signer.phoneLast4}`],
    ["同意日時", japaneseDateTime(input.acceptedAt)],
    ["書式版", documentVersion(template.version)],
    ["記録ID", input.agreementId],
  ];
  for (const [label, value] of rows) {
    document.fontSize(9).fillColor("#555").text(label);
    document.fontSize(10).fillColor("#111").text(value).moveDown(0.65);
  }
  document.fontSize(8).fillColor("#555").moveDown(1)
    .text("この記録は、上記の者がSMS認証を経て本文書の全内容を確認し、同意操作を行ったことをRootLensが記録したものです。");

  document.end();
  return completed;
}
