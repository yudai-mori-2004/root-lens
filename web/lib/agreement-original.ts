import { readFile } from "node:fs/promises";
import { join } from "node:path";
import PDFDocument from "pdfkit";
import { agreementTemplates, type AgreementKind } from "@/content/agreementTemplates.generated";
import { agreementBodyForSite } from "@/lib/agreement-body";

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

const PAGE_MARGIN = 70.9;
const FONT_SIZE = 10.5;
const LINE_HEIGHT = 18;
const LINE_GAP = 1.18;

function agreementLine(document: PDFKit.PDFDocument, text: string, options: PDFKit.Mixins.TextOptions = {}) {
  document.fontSize(FONT_SIZE).fillColor("#000");
  const width = document.page.width - document.page.margins.left - document.page.margins.right - (options.indent ?? 0);
  const height = document.heightOfString(text, { width, lineGap: LINE_GAP });
  if (document.y + height + 2 > document.page.height - document.page.margins.bottom) document.addPage();
  document.text(text, {
    lineGap: LINE_GAP,
    ...options,
  });
}

export async function createAgreementPdf(input: AgreementOriginalInput): Promise<Uint8Array> {
  const font = await readFile(join(process.cwd(), "assets/fonts/YuMincho-Regular.ttf"));
  const template = agreementTemplates[input.kind];
  const document = new PDFDocument({
    size: "A4",
    margins: { top: PAGE_MARGIN, right: PAGE_MARGIN, bottom: PAGE_MARGIN, left: PAGE_MARGIN },
    info: { Title: template.title, Author: "RootLens", CreationDate: input.acceptedAt, ModDate: input.acceptedAt },
  });
  document.registerFont("YuMincho", font).font("YuMincho");
  const chunks: Buffer[] = [];
  document.on("data", (chunk: Buffer) => chunks.push(chunk));
  const completed = new Promise<Uint8Array>((resolve, reject) => {
    document.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks))));
    document.on("error", reject);
  });

  const body = agreementBodyForSite(template.body, input.siteName);
  for (const rawLine of body.split("\n")) {
    const line = plainMarkdown(rawLine.trim());
    if (!line || line === "---") {
      document.y += input.kind === "site_agreement" ? 4 : LINE_HEIGHT;
      continue;
    }
    if (line.startsWith("# ")) {
      agreementLine(document, line.slice(2), { align: "center" });
    } else if (line.startsWith("## ")) {
      agreementLine(document, line.slice(3));
    } else if (/^\s{2,}\d+\.\s+/.test(rawLine)) {
      const nested = line.replace(/^(\d+)\.\s+/, "　($1) ");
      agreementLine(document, nested, { indent: FONT_SIZE });
    } else if (/^[-*]\s+/.test(line)) {
      agreementLine(document, `・${line.replace(/^[-*]\s+/, "")}`, { indent: FONT_SIZE });
    } else if (/^\d+\.\s+/.test(line)) {
      agreementLine(document, line.replace(/^(\d+)\.\s+/, "$1　"), { indent: FONT_SIZE });
    } else if (line.startsWith("|")) {
      if (!/^\|?[-| :]+\|?$/.test(line)) {
        agreementLine(document, line.replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim()).join("　｜　"));
      }
    } else {
      agreementLine(document, line, { indent: FONT_SIZE });
    }
  }

  document.addPage();
  const pageWidth = document.page.width - document.page.margins.left - document.page.margins.right;
  const left = document.page.margins.left;
  const titleTop = document.y;
  document.fillColor("#000").strokeColor("#000").lineWidth(0.8);
  document.moveTo(left, titleTop).lineTo(left + pageWidth, titleTop).stroke();
  document.fontSize(FONT_SIZE).text("同意記録", left, titleTop + 9, { width: pageWidth, align: "center" });
  const tableTop = titleTop + 36;
  document.moveTo(left, tableTop).lineTo(left + pageWidth, tableTop).stroke();
  const rows = [
    ["同意者", input.signer.name],
    ["事業所", input.siteName],
    ["認証方法", "SMS認証"],
    ["電話番号", `*******${input.signer.phoneLast4}`],
    ["同意日時", japaneseDateTime(input.acceptedAt)],
    ["書式版", documentVersion(template.version)],
    ["記録ID", input.agreementId],
  ];
  const labelWidth = 105;
  const rowHeight = 27;
  let rowTop = tableTop;
  for (const [label, value] of rows) {
    document.fontSize(FONT_SIZE).fillColor("#000").text(label, left + 8, rowTop + 7, {
      width: labelWidth - 18,
      lineBreak: false,
    });
    document.text(value, left + labelWidth + 8, rowTop + 7, {
      width: pageWidth - labelWidth - 18,
      lineBreak: false,
    });
    rowTop += rowHeight;
    document.moveTo(left, rowTop).lineTo(left + pageWidth, rowTop).stroke();
  }
  document.rect(left, tableTop, pageWidth, rows.length * rowHeight).stroke();
  document.moveTo(left + labelWidth, tableTop)
    .lineTo(left + labelWidth, tableTop + rows.length * rowHeight).stroke();
  document.fontSize(FONT_SIZE).fillColor("#000").text(
    "この記録は、上記の者がSMS認証を経て本文書の全内容を確認し、同意操作を行ったことを、乙がRootLens上で記録したものです。",
    left,
    rowTop + 22,
    { width: pageWidth, lineGap: LINE_GAP },
  );

  document.end();
  return completed;
}
