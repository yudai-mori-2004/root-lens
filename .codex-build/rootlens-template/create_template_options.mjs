import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Presentation, PresentationFile } from "@oai/artifact-tool";

const workspaceDir = "/Users/forest/WebCreations/root-lens";
const SKILL_DIR = "/Users/forest/.codex/plugins/cache/openai-primary-runtime/presentations/26.909.12148/skills/presentations";
const TMP_DIR = path.join(workspaceDir, ".codex-build/rootlens-template");
const FINAL_PPTX = path.join(workspaceDir, "output/presentations/rootlens-template-options-v1.pptx");
const RUNTIME_PYTHON = "/Users/forest/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3";

const { finalizePresentation } = await import(pathToFileURL(
  path.join(SKILL_DIR, "container_tools/artifact_tool_utils.mjs"),
).href);

await fs.mkdir(TMP_DIR, { recursive: true });
await fs.mkdir(path.dirname(FINAL_PPTX), { recursive: true });

const deck = Presentation.create({ slideSize: { width: 1280, height: 720 } });
const sans = "Hiragino Sans";
const mincho = "Hiragino Mincho ProN";
const W = 1280;
const H = 720;

function addBox(slide, x, y, w, h, fill, lineFill = "none", lineWidth = 0) {
  return slide.shapes.add({
    geometry: "rect",
    position: { left: x, top: y, width: w, height: h },
    fill,
    line: { fill: lineFill, width: lineWidth },
  });
}

function addText(slide, text, x, y, w, h, opts = {}) {
  const shape = slide.shapes.add({
    geometry: "textbox",
    position: { left: x, top: y, width: w, height: h },
    fill: "none",
    line: { fill: "none", width: 0 },
  });
  shape.text = text;
  shape.text.style = {
    typeface: opts.typeface ?? sans,
    fontSize: opts.fontSize ?? 24,
    bold: opts.bold ?? false,
    italic: opts.italic ?? false,
    color: opts.color ?? "#171717",
    alignment: opts.alignment ?? "left",
    verticalAlignment: opts.verticalAlignment ?? "top",
    autoFit: "none",
  };
  return shape;
}

function addLabel(slide, text, x, y, color) {
  return addText(slide, text, x, y, 330, 26, {
    fontSize: 12,
    bold: true,
    color,
  });
}

const title = "現場データ収集から始める\nフィジカルAI企業";
const bodyA = "現場統合では、業種やタスクごとにロボットの動作を作り込む必要がある。";
const bodyB = "現場データ収集は、人間の作業を撮影することで、現在の技術でも複数業種へ入れる。";
const bodyC = "撮影を通じて、将来ロボットが導入される現場との関係と、既存ワークフローのデータが蓄積する。";

// A1: technical memorandum cover
{
  const s = deck.slides.add();
  s.background.fill = "#F4F6F7";
  addBox(s, 0, 0, 14, H, "#315C78");
  addLabel(s, "DESIGN A  TECHNICAL MEMORANDUM", 70, 62, "#315C78");
  addText(s, "RootLens", 70, 132, 430, 60, { fontSize: 42, bold: true });
  addText(s, title, 70, 255, 920, 180, { fontSize: 54, bold: true });
  addBox(s, 70, 510, 1140, 1, "#9CAAB2");
  addText(s, "会社紹介資料", 70, 538, 250, 32, { fontSize: 18, color: "#4D5960" });
  addText(s, "2026.09", 1060, 538, 150, 32, { fontSize: 18, color: "#4D5960", alignment: "right" });
  addText(s, "A", 1130, 612, 80, 54, { fontSize: 50, bold: true, color: "#315C78", alignment: "right" });
}

// A2: technical memorandum content
{
  const s = deck.slides.add();
  s.background.fill = "#F4F6F7";
  addBox(s, 0, 0, 14, H, "#315C78");
  addLabel(s, "ROOTLENS  /  THINKING", 70, 45, "#315C78");
  addText(s, "なぜ現場データ収集から始めるのか", 70, 88, 1080, 70, { fontSize: 36, bold: true });
  addBox(s, 70, 167, 1140, 1, "#AAB5BB");
  addText(s, "現場統合", 70, 213, 280, 40, { fontSize: 20, bold: true, color: "#315C78" });
  addText(s, bodyA, 70, 263, 455, 110, { fontSize: 24 });
  addText(s, "現場データ収集", 650, 213, 300, 40, { fontSize: 20, bold: true, color: "#315C78" });
  addText(s, bodyB, 650, 263, 485, 110, { fontSize: 24 });
  addBox(s, 70, 416, 1140, 1, "#AAB5BB");
  addText(s, "現在考えていること", 70, 451, 300, 36, { fontSize: 18, bold: true, color: "#315C78" });
  addText(s, bodyC, 70, 505, 1040, 105, { fontSize: 29, bold: true });
  addText(s, "02", 1130, 650, 80, 24, { fontSize: 14, color: "#59666D", alignment: "right" });
}

// B1: field record cover
{
  const s = deck.slides.add();
  s.background.fill = "#EEE9DE";
  const photo = await fs.readFile(path.join(workspaceDir, "document/business/assets/device_rootcap.jpg"));
  s.images.add({
    blob: photo,
    contentType: "image/jpeg",
    alt: "RootLensの試作撮影デバイス",
    fit: "cover",
    position: { left: 760, top: 0, width: 520, height: 720 },
    crop: { left: 0.08, top: 0, right: 0.14, bottom: 0 },
  });
  addLabel(s, "DESIGN B  FIELD RECORD", 64, 57, "#B4512C");
  addText(s, "RootLens", 64, 118, 400, 62, { fontSize: 40, bold: true });
  addText(s, title, 64, 245, 620, 190, { fontSize: 48, bold: true, typeface: mincho });
  addBox(s, 64, 517, 620, 2, "#B4512C");
  addText(s, "現場で作り、現場で確かめたことから話す", 64, 545, 610, 45, { fontSize: 21 });
  addText(s, "試作撮影デバイス", 972, 665, 250, 24, { fontSize: 14, color: "#FFFFFF", alignment: "right" });
}

// B2: field record content
{
  const s = deck.slides.add();
  s.background.fill = "#EEE9DE";
  addLabel(s, "ROOTLENS  /  FIELD NOTE 01", 64, 44, "#B4512C");
  addText(s, "なぜ現場データ収集から始めるのか", 64, 91, 1090, 68, { fontSize: 36, bold: true, typeface: mincho });
  addBox(s, 64, 172, 1152, 1, "#AA9F8B");
  addText(s, "事実", 64, 215, 120, 32, { fontSize: 17, bold: true, color: "#B4512C" });
  addText(s, bodyA + "\n\n" + bodyB, 64, 263, 710, 205, { fontSize: 26 });
  addText(s, "現在の考え", 838, 215, 220, 32, { fontSize: 17, bold: true, color: "#B4512C" });
  addText(s, bodyC, 838, 263, 330, 240, { fontSize: 28, bold: true, typeface: mincho });
  addBox(s, 64, 578, 1152, 1, "#AA9F8B");
  addText(s, "事実と考えを分け、どちらも同じ強さで飾らず置く", 64, 605, 720, 34, { fontSize: 18, color: "#5F594D" });
  addText(s, "04", 1135, 648, 80, 24, { fontSize: 14, color: "#5F594D", alignment: "right" });
}

// C1: pure monochrome cover
{
  const s = deck.slides.add();
  s.background.fill = "#0C0C0C";
  addLabel(s, "DESIGN C  MONOCHROME", 64, 60, "#AFAFAF");
  addText(s, "RootLens", 64, 125, 430, 60, { fontSize: 42, bold: true, color: "#FFFFFF" });
  addText(s, title, 64, 250, 1070, 190, { fontSize: 58, bold: true, color: "#FFFFFF" });
  addBox(s, 64, 517, 1152, 1, "#686868");
  addText(s, "Company overview", 64, 546, 300, 32, { fontSize: 17, color: "#BDBDBD" });
  addText(s, "2026.09", 1050, 546, 165, 32, { fontSize: 17, color: "#BDBDBD", alignment: "right" });
}

// C2: pure monochrome content
{
  const s = deck.slides.add();
  s.background.fill = "#FFFFFF";
  addBox(s, 0, 0, W, 48, "#0C0C0C");
  addText(s, "ROOTLENS", 64, 14, 220, 22, { fontSize: 13, bold: true, color: "#FFFFFF" });
  addText(s, "06", 1130, 14, 86, 22, { fontSize: 13, color: "#FFFFFF", alignment: "right" });
  addText(s, "なぜ現場データ収集から始めるのか", 64, 95, 1080, 70, { fontSize: 37, bold: true });
  addBox(s, 64, 180, 1152, 3, "#0C0C0C");
  addText(s, "01", 64, 226, 70, 35, { fontSize: 20, bold: true });
  addText(s, bodyA, 150, 226, 990, 75, { fontSize: 25 });
  addBox(s, 64, 325, 1152, 1, "#B8B8B8");
  addText(s, "02", 64, 366, 70, 35, { fontSize: 20, bold: true });
  addText(s, bodyB, 150, 366, 990, 75, { fontSize: 25 });
  addBox(s, 64, 465, 1152, 1, "#B8B8B8");
  addText(s, "考え", 64, 514, 70, 35, { fontSize: 18, bold: true });
  addText(s, bodyC, 150, 514, 990, 100, { fontSize: 29, bold: true });
}

const candidatePath = path.join(TMP_DIR, "candidate.pptx");
await (await PresentationFile.exportPptx(deck)).save(candidatePath);

const result = await finalizePresentation({
  explicitTotalSlideCount: 6,
  requiredNativeTableOwnerSlides: [],
  requiredNativeChartOwnerSlides: [],
  workspaceDir,
  candidatePath,
  finalPath: FINAL_PPTX,
  pythonExecutable: RUNTIME_PYTHON,
  integrityValidatorPath: path.join(SKILL_DIR, "container_tools/inspect_presentation_package_integrity.py"),
  layoutValidatorPath: path.join(SKILL_DIR, "container_tools/inspect_presentation_layout_geometry.py"),
  layoutArgs: [
    "--expected-slide-size-emu", "12192000,6858000",
    "--validate-heading-fit",
  ],
  fontPolicy: { basis: "design", families: [sans, mincho] },
  verifyArtifactToolImport: true,
  receiptPath: path.join(TMP_DIR, "rootlens-template-options-v1.validation.json"),
});

console.log(JSON.stringify({ finalPath: FINAL_PPTX, result }, null, 2));
