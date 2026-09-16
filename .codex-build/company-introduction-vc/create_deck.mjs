/* Hallmark · pre-emit critique: P5 H5 E4 S5 R4 V5 */
/* Hallmark · genre: editorial · macrostructure: Visual Narrative + Gantt · theme: RootLens technical report · enrichment: editable diagrams and real field photos */
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Presentation, PresentationFile } from "@oai/artifact-tool";

const workspaceDir = "/Users/forest/WebCreations/root-lens";
const SKILL_DIR = "/Users/forest/.codex/plugins/cache/openai-primary-runtime/presentations/26.909.12148/skills/presentations";
const TMP_DIR = path.join(workspaceDir, ".codex-build/company-introduction-vc");
const FINAL_PPTX = path.join(workspaceDir, "output/presentations/会社紹介（VC向け）.pptx");
const RUNTIME_PYTHON = "/Users/forest/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3";

const { finalizePresentation } = await import(pathToFileURL(
  path.join(SKILL_DIR, "container_tools/artifact_tool_utils.mjs"),
).href);

await fs.mkdir(TMP_DIR, { recursive: true });
await fs.mkdir(path.dirname(FINAL_PPTX), { recursive: true });

const deck = Presentation.create({ slideSize: { width: 1280, height: 720 } });
const sans = "Hiragino Sans";
const C = {
  bg: "#F4F6F7",
  paper: "#FFFFFF",
  ink: "#15191B",
  muted: "#58646A",
  line: "#AAB6BC",
  pale: "#E6ECEF",
  blue: "#315C78",
  blue2: "#DCE8EF",
  dark: "#25333A",
  green: "#476B5B",
};

function rect(slide, x, y, w, h, fill, lineFill = "none", lineWidth = 0) {
  return slide.shapes.add({
    geometry: "rect",
    position: { left: x, top: y, width: w, height: h },
    fill,
    line: { fill: lineFill, width: lineWidth },
  });
}

function dashedRect(slide, x, y, w, h, color, segment = 12, gap = 8, thickness = 2) {
  for (let dx = 0; dx < w; dx += segment + gap) {
    const sw = Math.min(segment, w - dx);
    rect(slide, x + dx, y, sw, thickness, color);
    rect(slide, x + dx, y + h - thickness, sw, thickness, color);
  }
  for (let dy = 0; dy < h; dy += segment + gap) {
    const sh = Math.min(segment, h - dy);
    rect(slide, x, y + dy, thickness, sh, color);
    rect(slide, x + w - thickness, y + dy, thickness, sh, color);
  }
}

function triangle(slide, x, y, w, h, color, rotation = 0) {
  return slide.shapes.add({
    geometry: "triangle",
    position: { left: x, top: y, width: w, height: h, rotation },
    fill: color,
    line: { fill: color, width: 0 },
  });
}

function arrowRight(slide, x, y, length, color = C.blue, thickness = 3) {
  rect(slide, x, y, length - 15, thickness, color);
  triangle(slide, x + length - 18, y - 7, 18, 17, color, 90);
}

function arrowLeft(slide, x, y, length, color = C.blue, thickness = 3) {
  rect(slide, x + 15, y, length - 15, thickness, color);
  triangle(slide, x, y - 7, 18, 17, color, 270);
}

function arrowDown(slide, x, y, length, color = C.blue, thickness = 3) {
  rect(slide, x, y, thickness, length - 15, color);
  triangle(slide, x - 7, y + length - 18, 17, 18, color, 180);
}

function arrowUp(slide, x, y, length, color = C.blue, thickness = 3) {
  rect(slide, x, y + 15, thickness, length - 15, color);
  triangle(slide, x - 7, y, 17, 18, color, 0);
}

function diagramBox(slide, label, x, y, w, h, opts = {}) {
  if (opts.dashed) dashedRect(slide, x, y, w, h, opts.line ?? C.blue, 10, 7, 2);
  else rect(slide, x, y, w, h, opts.fill ?? C.paper, opts.line ?? C.blue, opts.lineWidth ?? 2);
  text(slide, label, x + 14, y + 12, w - 28, h - 24, {
    size: opts.size ?? 20,
    bold: opts.bold ?? true,
    color: opts.color ?? C.ink,
    align: opts.align ?? "center",
    vAlign: "middle",
  });
}

function addGantt(slide, periods, rows, footer) {
  const left = 76;
  const labelW = 245;
  const gridX = left + labelW;
  const gridW = 1110 - labelW;
  const colW = gridW / periods.length;
  const top = 190;
  const headerH = 50;
  const rowH = footer ? 72 : 82;

  rect(slide, left, top, labelW, headerH, C.dark);
  text(slide, "領域", left + 14, top + 13, labelW - 28, 25, { size: 16, bold: true, color: C.paper });
  periods.forEach((p, i) => {
    rect(slide, gridX + i * colW, top, colW, headerH, C.dark, C.bg, 1);
    text(slide, p, gridX + i * colW, top + 13, colW, 25, { size: 16, bold: true, color: C.paper, align: "center" });
  });

  rows.forEach((r, idx) => {
    const y = top + headerH + idx * rowH;
    rect(slide, left, y, labelW, rowH, C.paper, C.line, 1);
    text(slide, r.label, left + 14, y + 22, labelW - 28, 34, { size: 17, bold: true, color: C.blue, vAlign: "middle" });
    periods.forEach((_, i) => rect(slide, gridX + i * colW, y, colW, rowH, C.paper, C.line, 1));
    const bx = gridX + r.start * colW + 10;
    const bw = (r.end - r.start + 1) * colW - 20;
    rect(slide, bx, y + 17, bw, 48, r.muted ? C.pale : C.blue2, r.muted ? C.line : C.blue, 2);
    text(slide, r.text, bx + 10, y + 8, bw - 20, 66, { size: r.size ?? 14, bold: !r.muted, color: r.muted ? C.muted : C.ink, align: "center", vAlign: "middle" });
  });
  if (footer) text(slide, footer, 76, 625, 1110, 42, { size: 17, bold: true, color: C.blue, align: "center", vAlign: "middle" });
}

const outlookAreas = [
  "撮影規模・撮影先",
  "データ販売",
  "撮影デバイス・知財",
  "ロボット企業・大学",
  "契約・法務",
  "ロボットの導入・開発",
];

function addOutlookGantt(slide, periods, entries, footer) {
  const left = 76;
  const labelW = 245;
  const gridX = left + labelW;
  const gridW = 1110 - labelW;
  const colW = gridW / periods.length;
  const top = 180;
  const headerH = 46;
  const rowH = 61;
  const byArea = new Map(entries.map((entry) => [entry.label, entry.items]));

  rect(slide, left, top, labelW, headerH, C.dark);
  text(slide, "領域", left + 14, top + 11, labelW - 28, 25, { size: 16, bold: true, color: C.paper });
  periods.forEach((period, i) => {
    rect(slide, gridX + i * colW, top, colW, headerH, C.dark, C.bg, 1);
    text(slide, period, gridX + i * colW, top + 11, colW, 25, { size: 16, bold: true, color: C.paper, align: "center" });
  });

  outlookAreas.forEach((label, rowIndex) => {
    const y = top + headerH + rowIndex * rowH;
    rect(slide, left, y, labelW, rowH, C.paper, C.line, 1);
    text(slide, label, left + 14, y + 15, labelW - 28, 32, { size: 15, bold: true, color: C.blue, vAlign: "middle" });
    periods.forEach((_, i) => rect(slide, gridX + i * colW, y, colW, rowH, C.paper, C.line, 1));
    for (const item of byArea.get(label) ?? []) {
      const bx = gridX + item.start * colW + 8;
      const bw = (item.end - item.start + 1) * colW - 16;
      rect(slide, bx, y + 9, bw, 43, item.muted ? C.pale : C.blue2, item.muted ? C.line : C.blue, 2);
      text(slide, item.text, bx + 8, y + 5, bw - 16, 51, { size: item.size ?? 12, bold: !item.muted, color: item.muted ? C.muted : C.ink, align: "center", vAlign: "middle" });
    }
  });
  if (footer) text(slide, footer, 76, 620, 1110, 36, { size: 16, bold: true, color: C.blue, align: "center", vAlign: "middle" });
}

function text(slide, value, x, y, w, h, opts = {}) {
  const sh = slide.shapes.add({
    geometry: "textbox",
    position: { left: x, top: y, width: w, height: h, rotation: opts.rotation ?? 0 },
    fill: "none",
    line: { fill: "none", width: 0 },
  });
  sh.text = value;
  sh.text.style = {
    typeface: sans,
    fontSize: opts.size ?? 22,
    bold: opts.bold ?? false,
    color: opts.color ?? C.ink,
    alignment: opts.align ?? "left",
    verticalAlignment: opts.vAlign ?? "top",
    autoFit: "none",
  };
  return sh;
}

function baseSlide(section, titleValue, page, opts = {}) {
  const s = deck.slides.add();
  s.background.fill = C.bg;
  rect(s, 0, 0, 14, 720, C.blue);
  text(s, titleValue, 70, 61, 1120, 68, { size: opts.titleSize ?? 37, bold: true });
  rect(s, 70, 148, 1140, 1, C.line);
  text(s, String(page).padStart(2, "0"), 1120, 675, 90, 20, { size: 12, color: C.muted, align: "right" });
  return s;
}

function row(slide, y, number, heading, body, opts = {}) {
  text(slide, number, 76, y, 60, 32, { size: 16, bold: true, color: opts.color ?? C.blue });
  text(slide, heading, 155, y - 3, opts.headingWidth ?? 250, 40, { size: 22, bold: true });
  text(slide, body, opts.bodyX ?? 440, y - 3, opts.bodyWidth ?? 690, opts.bodyHeight ?? 66, { size: opts.bodySize ?? 21, color: opts.bodyColor ?? C.ink });
  if (opts.rule !== false) rect(slide, 76, y + (opts.ruleOffset ?? 83), 1110, 1, C.line);
}

function flatRow(slide, y, heading, body, opts = {}) {
  text(slide, heading, 76, y - 3, opts.headingWidth ?? 290, 40, { size: opts.headingSize ?? 22, bold: true, color: opts.headingColor ?? C.ink });
  text(slide, body, opts.bodyX ?? 400, y - 3, opts.bodyWidth ?? 780, opts.bodyHeight ?? 66, { size: opts.bodySize ?? 21, color: opts.bodyColor ?? C.ink });
  if (opts.rule !== false) rect(slide, 76, y + (opts.ruleOffset ?? 83), 1110, 1, C.line);
}

function addIndustryMap(slide, mode = "structure") {
  const plotX = 272;
  const plotW = 880;
  text(slide, "横幅：接続する現場の範囲", plotX, 177, plotW, 28, { size: 17, bold: true, color: C.blue, align: "center" });
  rect(slide, plotX, 211, plotW, 2, C.blue);
  rect(slide, plotX, 205, 2, 14, C.blue);
  rect(slide, plotX + plotW - 2, 205, 2, 14, C.blue);

  const rows = [
    { y: 242, label: "データ収集・加工" },
    { y: 314, label: "基盤モデル・\nシミュレーション" },
    { y: 386, label: "ハードウェア" },
    { y: 458, label: "現場統合" },
  ];
  rows.forEach((r, i) => {
    rect(slide, plotX, r.y, plotW, 58, C.paper, C.line, 1);
    text(slide, r.label, 76, r.y + (i === 1 ? 6 : 15), 148, i === 1 ? 48 : 34, { size: i === 1 ? 14 : 16, bold: true, color: C.muted, align: "right", vAlign: "middle" });
  });

  const verticalAxisX = 1158;
  rect(slide, verticalAxisX, rows[0].y, 2, rows[3].y + 58 - rows[0].y, C.blue);
  rect(slide, verticalAxisX - 6, rows[0].y, 14, 2, C.blue);
  rect(slide, verticalAxisX - 6, rows[3].y + 56, 14, 2, C.blue);
  text(slide, "縦幅：担うレイヤーの範囲", 1100, 392, 180, 30, { size: 13, bold: true, color: C.blue, align: "center", rotation: 90 });

  const fieldY = 552;
  text(slide, "現場", 76, fieldY + 10, 148, 30, { size: 17, bold: true, color: C.muted, align: "right" });
  rect(slide, plotX, fieldY, plotW, 52, C.dark);
  text(slide, "飲食　　小売　　製造　　物流　　建築　　医療　　その他の現場", plotX, fieldY + 13, plotW, 28, { size: 16, bold: true, color: C.paper, align: "center" });

  if (mode === "structure") {
    const verticalX = plotX + 42;
    const verticalW = 215;
    const horizontalX = verticalX;
    const horizontalW = plotW - 84;
    const horizontalCompanies = [
      "DeepReach / BuildAI",
      "PI / SkilledAI / NVIDIA",
      "Unitree",
      "HIVE Robotics / Formic",
    ];
    rows.forEach((r, i) => {
      rect(slide, horizontalX, r.y, horizontalW, 58, C.blue2, C.blue, 2);
      if (i === 0) {
        text(slide, "水平統合型　　一つのレイヤーで、多数の現場を占める", horizontalX + verticalW + 22, r.y + 7, horizontalW - verticalW - 40, 23, { size: 15, bold: true, color: C.blue, align: "center" });
        text(slide, horizontalCompanies[i], horizontalX + verticalW + 22, r.y + 31, horizontalW - verticalW - 40, 20, { size: 13, bold: true, color: C.muted, align: "center" });
      } else {
        text(slide, horizontalCompanies[i], horizontalX + verticalW + 22, r.y + 16, horizontalW - verticalW - 40, 26, { size: 15, bold: true, color: C.blue, align: "center" });
      }
    });

    rect(slide, verticalX, rows[0].y, verticalW, rows[3].y + 58 - rows[0].y, C.blue2, C.blue, 2);
    text(slide, "垂直統合型", verticalX + 18, 270, verticalW - 36, 28, { size: 18, bold: true, color: C.blue, align: "center" });
    text(slide, "特定の現場を\n複数レイヤーで担う", verticalX + 18, 329, verticalW - 36, 58, { size: 17, bold: true, align: "center" });
    text(slide, "1X\nSunday Robotics\nATOM", verticalX + 18, 427, verticalW - 36, 68, { size: 13, bold: true, color: C.muted, align: "center" });
  } else {
    const loopX = plotX + 42;
    const loopW = 250;
    dashedRect(slide, loopX, rows[0].y, loopW, 58, C.blue);
    rect(slide, loopX, rows[1].y, loopW, rows[3].y + 58 - rows[1].y, C.blue2, C.blue, 2);
    text(slide, "モデル開発", loopX + 20, rows[1].y + 16, loopW - 40, 26, { size: 17, bold: true, color: C.blue, align: "center" });
    text(slide, "ハードウェア開発", loopX + 20, rows[2].y + 16, loopW - 40, 26, { size: 17, bold: true, color: C.blue, align: "center" });
    text(slide, "現場統合", loopX + 20, rows[3].y + 16, loopW - 40, 26, { size: 17, bold: true, color: C.blue, align: "center" });

    const returnX = loopX + loopW + 34;
    rect(slide, loopX + loopW, rows[1].y + 28, 36, 2, C.blue);
    rect(slide, returnX, rows[1].y + 28, 2, rows[3].y - rows[1].y, C.blue);
    rect(slide, loopX + loopW, rows[3].y + 28, 36, 2, C.blue);
    text(slide, "現場で得たデータを戻す", returnX + 18, 363, 230, 28, { size: 15, bold: true, color: C.blue });
    text(slide, "現場で稼働", loopX + 318, rows[3].y + 16, 150, 26, { size: 15, bold: true, color: C.muted });
  }
}

function note(slide, value) {
  slide.speakerNotes.textFrame.setText(value);
}

function paragraph(slide, value, x, y, w, h, opts = {}) {
  return text(slide, value, x, y, w, h, {
    size: opts.size ?? 20,
    color: opts.color ?? C.ink,
    bold: opts.bold ?? false,
    align: opts.align ?? "left",
    vAlign: opts.vAlign ?? "top",
  });
}

function sectionBlock(slide, label, body, y, opts = {}) {
  text(slide, label, 76, y, opts.labelWidth ?? 310, opts.labelHeight ?? 36, { size: opts.labelSize ?? 20, bold: true, color: opts.labelColor ?? C.blue });
  paragraph(slide, body, opts.bodyX ?? 390, y - 2, opts.bodyWidth ?? 795, opts.bodyHeight ?? 86, { size: opts.bodySize ?? 19, color: opts.bodyColor ?? C.ink });
  if (opts.rule !== false) rect(slide, 76, y + (opts.ruleOffset ?? 105), 1110, 1, C.line);
}

// 1. Cover
{
  const s = deck.slides.add();
  s.background.fill = C.bg;
  rect(s, 0, 0, 14, 720, C.blue);
  text(s, "RootLens", 70, 123, 480, 65, { size: 44, bold: true });
  text(s, "現場データ収集から始める\nフィジカルAIプレーヤー", 70, 267, 1040, 170, { size: 54, bold: true });
  rect(s, 70, 522, 1140, 1, C.line);
  text(s, "会社紹介資料", 70, 550, 280, 30, { size: 18, color: C.muted });
  text(s, "2026.09", 1060, 550, 150, 30, { size: 18, color: C.muted, align: "right" });
  note(s, "私たちは、現場データ収集から始めるフィジカルAIプレーヤーになる企業です。");
}

// 2. Industry map
{
  const s = baseSlide("INDUSTRY", "フィジカルAI業界の構造", 2);
  addIndustryMap(s, "structure");
  note(s, "図の横幅は、その企業が接続している現場の範囲を表します。垂直統合型は特定の現場に絞るため横幅が短く、複数の技術レイヤーを自社で担うため縦に長くなります。水平統合型は一つの技術レイヤーを担いながら、多数の業種・現場へ接続するため横に広くなります。現場と直接接触するのは、一番下の現場統合層と、一番上流の現場データ収集層です。");
}

// 3. Vertical and horizontal integration
{
  const s = baseSlide("INDUSTRY", "垂直統合型と水平統合型", 3);
  text(s, "垂直統合型", 76, 202, 480, 36, { size: 22, bold: true, color: C.blue });
  paragraph(s, "特定の業種・タスクに絞り、決め打ちで\n現場で実際に動くロボットを作る。\n\n完全な自律運用が難しい場合は、遠隔操作で働くレベルから商用化する企業もあれば、自律運用の幅を地道に広げる企業もある。", 76, 250, 500, 215, { size: 18 });
  text(s, "代表例", 76, 490, 100, 26, { size: 15, bold: true, color: C.muted });
  text(s, "1X / Sunday Robotics", 76, 525, 360, 34, { size: 20, bold: true, color: C.blue });
  rect(s, 627, 205, 1, 405, C.line);
  text(s, "水平統合型", 680, 202, 480, 36, { size: 22, bold: true, color: C.blue });
  paragraph(s, "垂直統合型のバリューチェーンを分解するイメージであり、現在多くのレイヤーが存在する。データ収集・加工、基盤モデル・シミュレーション、ハードウェア、現場統合が、それぞれ独立した事業として広がっている。", 680, 250, 490, 175, { size: 20 });
  paragraph(s, "実際には、垂直統合と水平展開の両方の性質を持つ企業もある。", 680, 470, 490, 70, { size: 18, color: C.muted });
  note(s, "現在、多くのフィジカルAI企業はロボットと現場を垂直統合する形で研究開発を進めています。特定の業種・タスクに絞り、完全な自律運用が難しい場合は遠隔操作での商用化から始める企業もあれば、自律運用の幅を地道に広げる企業もあります。代表例は1XとSunday Roboticsです。\n\n一方、水平統合型は、そのバリューチェーンをレイヤーごとに分解した企業群です。");
}

// 4. Horizontal layers
{
  const s = baseSlide("INDUSTRY", "水平統合型に存在するレイヤー", 4);
  text(s, "企業例", 965, 165, 220, 25, { size: 14, bold: true, color: C.muted });
  sectionBlock(s, "データ収集層", "人間の作業データ、遠隔操作による収集、合成データ、生データの加工。収集に特化したデバイス開発も広がりはじめている。", 190, { labelWidth: 235, bodyX: 330, bodyWidth: 600, bodySize: 17, ruleOffset: 98 });
  text(s, "DeepReach / BuildAI", 965, 211, 220, 30, { size: 15, bold: true, color: C.blue });
  sectionBlock(s, "基盤モデル・\nシミュレーション", "現実世界を仮想環境に再現し、必要な実データ量を抑えながらモデル開発を進める。", 300, { labelWidth: 235, labelHeight: 55, labelSize: 18, bodyX: 330, bodyWidth: 600, bodySize: 17, ruleOffset: 108 });
  text(s, "PI / SkilledAI / NVIDIA", 965, 321, 220, 45, { size: 15, bold: true, color: C.blue });
  sectionBlock(s, "ハードウェア開発層", "特に中国系企業が、安価なロボットを提供する面で強い。", 420, { labelWidth: 235, labelSize: 18, bodyX: 330, bodyWidth: 600, bodySize: 17, ruleOffset: 78 });
  text(s, "Unitree", 965, 441, 220, 30, { size: 15, bold: true, color: C.blue });
  sectionBlock(s, "現場統合層", "既存のロボットやモデルを利用し、現場への導入と運用調整を優先する。", 510, { labelWidth: 235, bodyX: 330, bodyWidth: 600, bodySize: 17, ruleOffset: 82, rule: false });
  text(s, "HIVE Robotics / Formic", 965, 531, 220, 45, { size: 15, bold: true, color: C.blue });
  note(s, "データ収集層には、人間の作業データ、テレオペレーション、合成データ、生データの加工があり、DeepReachやBuildAIが挙げられます。基盤モデル・シミュレーション層にはPI、SkilledAI、NVIDIAがあります。ハードウェア開発層ではUnitreeが強く、現場統合層ではHIVE RoboticsやFormicが、既存のロボットやモデルを使った現場への導入を進めています。");
}

// 5. Feedback loop map
{
  const s = baseSlide("THESIS", "現場を含む「ループ」を持つ企業が勝つ", 5);
  addIndustryMap(s, "loop");
  note(s, "私の考えでは、モデル開発・ハードウェア開発・現場統合という3つの領域を自社のループとして持ち、実際に現場でロボットを稼働させている企業が主流になります。");
}

// 6. Loop explanation
{
  const s = baseSlide("THESIS", "データ収集は、将来この「ループ」の中に吸収される", 6);
  diagramBox(s, "モデル開発", 150, 220, 280, 82, { fill: C.blue2 });
  diagramBox(s, "ハードウェア開発", 790, 220, 280, 82, { fill: C.blue2 });
  diagramBox(s, "現場統合\nロボットが稼働", 790, 450, 280, 92, { fill: C.blue2 });
  diagramBox(s, "現場で得たデータ", 150, 450, 280, 92, { dashed: true, size: 19 });
  arrowRight(s, 445, 260, 330);
  arrowDown(s, 928, 317, 118);
  arrowLeft(s, 445, 496, 330);
  arrowUp(s, 288, 317, 118);
  text(s, "モデルを実機へ", 515, 225, 190, 26, { size: 15, color: C.muted, align: "center" });
  text(s, "稼働そのものが\nデータ収集になる", 520, 365, 180, 55, { size: 17, bold: true, color: C.blue, align: "center" });
  text(s, "現場稼働データが直接モデル改善", 76, 610, 1110, 36, { size: 20, bold: true, color: C.blue, align: "center" });
  note(s, "現在は独立したレイヤーとして存在するデータ収集も、現場へロボットが投入されれば、このループの中に吸収されると考えています。ロボットの稼働そのものがデータ収集になり、そのデータがモデル改善へ直結するためです。モデル、ハードウェア、現場統合を自社のループとして持つ企業ほど、改善速度が上がります。");
}

// 7. Why data collection
{
  const s = baseSlide("ENTRY", "データ収集を通じて、先に実現場ネットワークを構築することが有利", 7, { titleSize: 31 });
  text(s, "フィジカルAIは実現場のデータなしに成立しないからこそ、最上流のデータ収集層と最下流の現場統合が繋がる、この業界特有の構造がある", 76, 168, 1110, 42, { size: 16, bold: true, color: C.blue, align: "center", vAlign: "middle" });
  const lx = 385;
  const lw = 430;
  const layers = [
    ["データ収集・加工", 225, C.blue2, C.blue],
    ["基盤モデル・シミュレーション", 295, C.paper, C.line],
    ["ハードウェア", 365, C.paper, C.line],
    ["現場統合", 435, C.blue2, C.blue],
  ];
  layers.forEach(([label, y, fill, line]) => diagramBox(s, label, lx, y, lw, 58, { fill, line, size: 18 }));
  diagramBox(s, "現場", lx, 550, lw, 58, { fill: C.dark, line: C.dark, color: C.paper, size: 20 });
  arrowDown(s, lx + lw / 2, 503, 37, C.blue);
  rect(s, lx + lw, 254, 170, 3, C.blue);
  rect(s, lx + lw + 167, 254, 3, 325, C.blue);
  rect(s, lx + lw, 576, 170, 3, C.blue);
  triangle(s, lx + lw - 2, 569, 18, 17, C.blue, 270);
  text(s, "上流からも\n現場へ直接入る", 1005, 350, 170, 60, { size: 18, bold: true, color: C.blue, align: "center" });
  text(s, "上流のデータ収集と最下流の現場統合が、同じ現場と直接つながる", 76, 630, 1110, 30, { size: 18, bold: true, color: C.blue, align: "center" });
  note(s, "現場と直接の接点を持つレイヤーは2つあります。一つは現場統合層。ロボットを実際にその場所に導入して動かす企業なので、当然現場と繋がります。しかしもう一つ、一番上流の現場データ収集企業も、撮影のために現場に入り込む必要があるため、将来ロボットが使われる現場と直接の関係を築くことになります。");
}

// 8. Horizontal coverage
{
  const s = baseSlide("STRUCTURAL ADVANTAGE", "現場統合層は横に広げられないが、データ収集層なら今すぐ広げられる", 8, { titleSize: 31 });
  text(s, "業種をまたぐ技術的障壁がないのはデータ収集層だけである", 76, 168, 1110, 35, { size: 17, bold: true, color: C.blue, align: "center", vAlign: "middle" });
  text(s, "現場統合層", 90, 260, 500, 38, { size: 25, bold: true, color: C.ink });
  rect(s, 90, 310, 500, 2, C.line);
  rect(s, 90, 350, 8, 8, C.blue);
  paragraph(s, "業種・タスクごとに\n個別の技術開発が必要", 116, 333, 430, 82, { size: 23 });
  rect(s, 90, 465, 8, 8, C.blue);
  paragraph(s, "横展開している企業は\n現時点でゼロ", 116, 448, 430, 82, { size: 23, bold: true });

  rect(s, 640, 245, 1, 335, C.line);

  text(s, "データ収集層", 690, 260, 500, 38, { size: 25, bold: true, color: C.blue });
  rect(s, 690, 310, 500, 2, C.line);
  rect(s, 690, 350, 8, 8, C.blue);
  paragraph(s, "カメラを装着した人間の\n作業を撮影するだけ", 716, 333, 430, 82, { size: 23 });
  rect(s, 690, 465, 8, 8, C.blue);
  paragraph(s, "今の技術で\n複数業種に展開可能", 716, 448, 430, 82, { size: 23, bold: true });
  note(s, "現場統合はタスクごとに技術開発が必要ですが、人間の作業を撮影するデータ収集は、今の技術でも業種をまたいで広げられます。");
}

// 9. Competitive landscape
{
  const s = baseSlide("COMPETITION", "直接競合はまだいない。現場の取り合いが始まっていない", 9, { titleSize: 32 });
  const colX = [76, 276, 506];
  const colW = [200, 230, 680];
  [0, 1, 2].forEach((i) => rect(s, colX[i], 190, colW[i], 42, C.dark, C.bg, 1));
  text(s, "地域", 92, 201, 168, 24, { size: 15, bold: true, color: C.paper });
  text(s, "開拓状況", 292, 201, 198, 24, { size: 15, bold: true, color: C.paper });
  text(s, "現場との接続", 522, 201, 648, 24, { size: 15, bold: true, color: C.paper });
  const siteXs = [540, 635, 730, 825, 920, 1015];
  [["海外", "急速に進行中", 232, 5], ["日本", "ほぼ未開拓", 317, 1]].forEach(([region, status, y, filled]) => {
    [0, 1, 2].forEach((i) => rect(s, colX[i], y, colW[i], 85, C.paper, C.line, 1));
    text(s, region, 92, y + 27, 168, 30, { size: 20, bold: true, color: C.blue });
    text(s, status, 292, y + 29, 198, 28, { size: 17, color: C.ink });
    siteXs.forEach((x, i) => {
      rect(s, x, y + 17, 52, 52, i < filled ? C.blue : C.paper, i < filled ? C.blue : C.line, 2);
      text(s, "現場", x, y + 33, 52, 20, { size: 12, bold: true, color: i < filled ? C.paper : C.muted, align: "center" });
    });
  });

  text(s, "撮影先", 76, 435, 105, 26, { size: 17, bold: true, color: C.blue });
  paragraph(s, "海外のプレイヤーは現時点で日本の現場に来ておらず、同じ撮影先を取り合っていない。撮影先が複数社から一社を選ぶ段階に来て、初めて競合する。", 185, 427, 1000, 68, { size: 17 });
  rect(s, 76, 508, 1110, 1, C.line);
  text(s, "販売先", 76, 535, 105, 26, { size: 17, bold: true, color: C.blue });
  paragraph(s, "月間1,000時間ほどの収集規模に達して初めて商談の土俵に乗る。他社が大量のデータを持っていても、現場や作業が違えば新しいデータの需要はなくならない。", 185, 527, 1000, 68, { size: 17 });

  text(s, "今は同業者との取り合いより、空いている現場をどれだけ早く広く集めるかが重要", 76, 640, 1110, 30, { size: 18, bold: true, color: C.blue, align: "center" });
  note(s, "競合がいないというより、まだ直接競争が始まっていないという認識です。同じ現場の撮影で被り、一つの撮影先がRootLensか別の収集会社を選ぶ段階に来て、初めて競合します。海外のプレイヤーは現段階で日本の現場に来ておらず、今は単なる同業者です。撮影先A、B、Cを取り合っているのではなく、まだAとBしか取れていない状態です。\n\n販売先側では、月間1,000時間ほどの収集規模が商談の目安になります。他社が100万時間を持っていても、それ以上のデータが不要になるわけではありません。データには現場や作業の多様性が必要だからです。したがって、他社の数字を並べるより、空いている現場へ入り、販売できる収集規模まで拡大できるかを見る方が、現時点の競合リスクを正確に表します。");
}

// 10. Network
{
  const s = baseSlide("STRUCTURAL ADVANTAGE", "現場ネットワークは、時間とともに参入障壁になる", 10);
  text(s, "時間と現場数", 80, 596, 170, 28, { size: 16, bold: true, color: C.muted });
  arrowRight(s, 220, 608, 810, C.line, 2);
  const wall = [
    ["現場との関係", 250, 515, 700],
    ["撮影を続ける運用", 330, 445, 620],
    ["スタッフへの説明・合意", 410, 375, 540],
    ["業種ごとの法令・ルールへの対応", 490, 305, 460],
  ];
  wall.forEach(([label, x, y, w], i) => {
    rect(s, x, y, w, 58, i === 3 ? C.blue : C.blue2, C.blue, 2);
    text(s, label, x + 16, y + 17, w - 32, 26, { size: 17, bold: true, color: i === 3 ? C.paper : C.ink, align: "center" });
  });
  arrowUp(s, 1190, 310, 250, C.blue);
  text(s, "後発は関係と運用を\n一から積み直す", 970, 438, 195, 48, { size: 16, bold: true, color: C.blue, align: "right" });
  text(s, "データだけでなく、現場へ入り続けるための関係と運用が蓄積される", 76, 645, 1110, 30, { size: 18, bold: true, color: C.blue, align: "center" });
  note(s, "ロボット企業が現場を含むフィードバックループを作るには、現場ネットワークが必要です。多業種で合意やコンプライアンス対応を積み重ねること自体が参入障壁になります。");
}

// 11. Prior data
{
  const s = baseSlide("STRUCTURAL ADVANTAGE", "現場データを先に持つことで、ロボット導入まで進みやすくなる", 11, { titleSize: 33 });
  text(s, "第1段階", 90, 205, 260, 30, { size: 18, bold: true, color: C.blue, align: "center" });
  diagramBox(s, "現場データ収集", 90, 250, 260, 120, { fill: C.blue2, size: 23 });
  text(s, "人間の作業の流れを\n先に把握する", 90, 395, 260, 58, { size: 17, color: C.muted, align: "center" });
  arrowRight(s, 370, 307, 165);
  text(s, "蓄積", 415, 265, 70, 24, { size: 15, bold: true, color: C.blue, align: "center" });
  diagramBox(s, "現場データ\n現場ネットワーク\n現場の知見", 550, 230, 250, 160, { fill: C.paper, line: C.line, size: 20 });
  arrowRight(s, 820, 307, 165);
  text(s, "活用", 865, 265, 70, 24, { size: 15, bold: true, color: C.blue, align: "center" });
  text(s, "第2段階", 940, 205, 260, 30, { size: 18, bold: true, color: C.blue, align: "center" });
  diagramBox(s, "ロボットを\n現場へ導入", 940, 250, 260, 120, { fill: C.dark, line: C.dark, color: C.paper, size: 23 });
  text(s, "作業に合わせて導入・運用を調整", 940, 395, 260, 42, { size: 16, color: C.muted, align: "center" });
  rect(s, 90, 500, 1110, 1, C.line);
  text(s, "ロボット企業と協業し、自ら導入と運用調整を担うこともできる", 76, 555, 1110, 38, { size: 22, bold: true, color: C.blue, align: "center" });
  note(s, "現場データを先に持つことは、ロボット企業との協業だけでなく、自分たちがロボットを現場へ導入し、作業に合わせて運用を調整する側へ進むための布石になります。");
}

// 12. Direction
{
  const s = baseSlide("DIRECTION", "RootLensの方向性", 12);
  text(s, "第1段階", 76, 205, 170, 32, { size: 20, bold: true, color: C.blue });
  text(s, "現場データネットワークを広げる", 76, 255, 500, 46, { size: 29, bold: true });
  paragraph(s, "データ収集・販売による収益を確保する。現場との関係構築と、業種ごとの法令・ルールへの対応を通じて、後発が真似できない参入障壁を積み上げる。", 76, 325, 500, 135, { size: 21 });
  rect(s, 628, 205, 1, 355, C.line);
  text(s, "第2段階", 680, 205, 170, 32, { size: 20, bold: true, color: C.blue });
  text(s, "自らロボットの現場導入を担う", 680, 255, 500, 70, { size: 29, bold: true });
  paragraph(s, "まず既存ロボットを現場へ導入し、作業に合わせて運用を調整する。その後、現場データを使った動作モデルと実機の改良まで自社で担う。", 680, 345, 490, 145, { size: 21 });
  paragraph(s, "この方向性を一言で表したのが、「現場データ収集から始めるフィジカルAIプレーヤー」である。", 76, 585, 1100, 55, { size: 22, bold: true, color: C.blue });
  note(s, "私たちの構想は2段階です。まず現場データネットワークを広げます。次に、そのデータとネットワークを使い、既存ロボットの現場導入と運用調整を担います。さらに先では、現場データを使った動作モデルと実機の改良まで自社で行います。");
}

// 13. Two-sided market
{
  const s = baseSlide("BUSINESS", "事業構造と両面市場", 13);
  text(s, "撮影先", 91, 203, 220, 30, { size: 18, bold: true, color: C.blue });
  text(s, "RootLens", 531, 203, 220, 30, { size: 18, bold: true, color: C.blue });
  text(s, "販売先", 955, 203, 220, 30, { size: 18, bold: true, color: C.blue });
  rect(s, 76, 252, 270, 198, C.paper, C.line, 1);
  text(s, "現場", 106, 283, 210, 40, { size: 29, bold: true, align: "center" });
  text(s, "作業データを撮影\nスタッフ・店舗の合意", 106, 347, 210, 64, { size: 19, color: C.muted, align: "center" });
  rect(s, 505, 252, 270, 198, C.dark);
  text(s, "収集・管理", 535, 283, 210, 40, { size: 24, bold: true, color: C.paper, align: "center" });
  text(s, "現場運用\nデータ品質\n販売までの運用", 535, 341, 210, 82, { size: 18, color: C.pale, align: "center" });
  rect(s, 934, 252, 270, 198, C.paper, C.line, 1);
  text(s, "データ購入企業", 964, 283, 210, 40, { size: 26, bold: true, align: "center" });
  text(s, "モデル開発企業\nデータ加工企業\nロボット企業", 964, 341, 210, 82, { size: 18, color: C.muted, align: "center" });
  rect(s, 346, 351, 159, 2, C.blue);
  rect(s, 775, 351, 159, 2, C.blue);
  text(s, "売上の50%を還元", 337, 371, 176, 26, { size: 15, bold: true, color: C.blue, align: "center" });
  text(s, "データを販売", 783, 371, 142, 26, { size: 15, bold: true, color: C.blue, align: "center" });
  rect(s, 76, 504, 1128, 1, C.line);
  paragraph(s, "撮影先と販売先という2種類の市場を開拓する必要があり、両面を同時に開拓することは簡単ではない。現段階では、若干現場開拓が先行している。", 76, 545, 1110, 80, { size: 23, bold: true });
  note(s, "撮影先と販売先の両面を開拓する必要があります。現在は若干現場開拓が先行しています。");
}

// 14. Field activity
{
  const s = baseSlide("ACTIVITY", "これまでの活動実績｜現場開拓", 14);
  sectionBlock(s, "現場への訪問", "30件ほどの現場へ訪問。そこで出会ったベーカリー経営者の許可のもと、店舗で実際にデータ収集をテストした。", 190, { bodySize: 18, ruleOffset: 85 });
  sectionBlock(s, "ベーカリーでの収集", "スタッフから逐一フィードバックを受け、撮影機材を改善。合計50時間ほどのデータを収集した。", 285, { bodySize: 18, ruleOffset: 85 });
  sectionBlock(s, "飲食店への打診", "SNSのDMを通じて複数の飲食店に連絡し、神戸の一社と合意の手続きを進めている。", 380, { bodySize: 18, ruleOffset: 85 });
  sectionBlock(s, "小売店への打診", "大崎の紹介で関西のとみづやと接触し、撮影協力について9月17日に直接説明する予定。", 475, { bodySize: 18, ruleOffset: 85 });
  text(s, "ロボット企業への訪問", 76, 585, 280, 30, { size: 18, bold: true, color: C.blue });
  paragraph(s, "DENSO WAVEを直接訪問し、産業ロボット領域での協働の可能性を探る。", 390, 583, 790, 45, { size: 18 });
  note(s, "飛び込み営業からベーカリーでの実撮影へ進み、カフェチェーン、スーパーマーケットへ現場開拓を広げています。");
}

// 15. Buyer activity
{
  const s = baseSlide("ACTIVITY", "これまでの活動実績｜販売先開拓", 15);
  text(s, "販売先は確保できる段階にある。収集規模の拡大が課題になる", 76, 158, 1110, 34, { size: 18, bold: true, color: C.blue });

  text(s, "海外", 90, 210, 500, 38, { size: 25, bold: true, color: C.ink });
  rect(s, 90, 260, 500, 2, C.line);
  rect(s, 90, 305, 8, 8, C.blue);
  paragraph(s, "8社とサンプルのやり取りまで到達", 116, 288, 430, 55, { size: 21, bold: true });
  rect(s, 90, 405, 8, 8, C.blue);
  paragraph(s, "合意に至るのが難しいのは、収集規模がまだ小さく、\n先方での優先度が上がらないため", 116, 385, 440, 90, { size: 20 });

  rect(s, 640, 195, 1, 380, C.line);

  text(s, "国内｜Nextremer", 690, 210, 500, 38, { size: 25, bold: true, color: C.blue });
  rect(s, 690, 260, 500, 2, C.line);
  rect(s, 690, 300, 8, 8, C.blue);
  paragraph(s, "販売手数料なしの売上分配。\n当社は現場開拓とデータ収集に専念できる", 716, 282, 450, 75, { size: 19, bold: true, color: C.blue });
  rect(s, 690, 390, 8, 8, C.blue);
  paragraph(s, "データの加工・販売サービスに掲載予定。\n現場合意の手順を共同で構築中", 716, 372, 450, 72, { size: 18 });
  rect(s, 690, 480, 8, 8, C.blue);
  paragraph(s, "作業内容などの情報を付けたデータとして\n高単価の販売先にも提案できる", 716, 462, 450, 72, { size: 18 });
  note(s, "海外8社とは、ベーカリーで収集したサンプルデータのやり取りまで進みました。ただ、私たちの収集規模は世界的にはまだ小さいため、先方での優先度が上がりにくく、合意に至るのが難しい状態です。収集規模を拡大することで、継続的な検討対象になれると考えています。\n\n国内ではNextremerと、現場合意、加工、販売を含む運用フローを擦り合わせています。手数料なしのレベニューシェアなので、私たちは現場開拓とデータ収集に注力できます。Nextremerは私たちよりロボット実装に近い下流へアプローチできるため、高度なアノテーション付きデータを求める販売先へ届き、より高い単価を狙えます。");
}

// 16. Team
{
  const s = baseSlide("TEAM", "チーム体制", 16);
  const teamMember = (name, role, body, y, showRule = true) => {
    text(s, name, 76, y, 270, 28, { size: 19, bold: true, color: C.blue });
    text(s, role, 76, y + 34, 270, 22, { size: 13, bold: true, color: C.muted });
    paragraph(s, body, 370, y - 2, 815, 82, { size: 16 });
    if (showRule) rect(s, 76, y + 90, 1110, 1, C.line);
  };
  teamMember("森雄大", "共同創業者", "大阪大学基礎工学部卒業後、本事業を立ち上げ。現場開拓、販売先開拓、撮影デバイスの設計・開発、事業全体の推進を担う。", 185);
  teamMember("河野瞭人", "共同創業者", "神戸大学大学院システム情報学研究科で、シミュレーション上で学習した二足歩行を実機へ移す研究に取り組む。事業ではシミュレーション領域を担う。", 285);
  teamMember("川島健二", "現場パートナー", "箕面デニッシュ合同会社でベーカリーを経営。店舗での撮影に協力し、スタッフからのフィードバックと継続収集を通じて、撮影機材と現場運用の改善を支える。", 385);
  teamMember("大崎操", "事業支援", "三菱UFJ銀行を経て、関西スーパーマーケットで常務取締役・管理本部長を務めた。会社立ち上げ、契約・合意書、小売・製造のネットワークを使った現場開拓を支援。", 485, false);
  note(s, "現在4名で活動しています。共同創業者2名に加え、ベーカリーで撮影と運用改善を支える川島健二さん、経営管理・法務・業界ネットワークを支援する大崎操さんが参画しています。\n\n公開情報：\n河野瞭人 https://akitozizi818.github.io/portfolio/\n神戸大学卒業研究発表会プログラム https://www.csi.kobe-u.ac.jp/current_students/kyougaku/file/Bprogram20250217.pdf\n関西スーパーマーケットIR https://www.kansaisuper.co.jp/wp-content/uploads/2021/12/irinfo_536.pdf\n箕面デニッシュ合同会社 https://info.gbiz.go.jp/hojin/ichiran?hojinBango=5120903005558");
}

// 17. Device evolution
{
  const s = baseSlide("DEVICE", "撮影デバイスの進化", 17);
  const files = [
    { path: "document/business/assets/photo_satokaede.jpg", type: "image/jpeg", phase: "初回", title: "ヘルメット", note: "スマートフォンを頭部へ固定" },
    { path: "document/business/assets/device_rootcap.jpg", type: "image/jpeg", phase: "次に", title: "RootCap", note: "3Dモデルからマウントを設計" },
    { path: "document/business/assets/device_rootglass.jpg", type: "image/jpeg", phase: "現在", title: "RootGlass", note: "見た目と長時間装着の負担を低減" },
  ];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const x = 76 + i * 377;
    const blob = await fs.readFile(path.join(workspaceDir, f.path));
    s.images.add({ blob, contentType: f.type, alt: f.title, fit: "cover", position: { left: x, top: 195, width: 340, height: 235 }, crop: i === 0 ? { left: 0, top: 0, right: 0, bottom: 0.28 } : { left: 0, top: 0, right: 0, bottom: 0 } });
    text(s, f.phase, x, 454, 62, 26, { size: 15, bold: true, color: C.blue });
    text(s, f.title, x + 68, 452, 272, 31, { size: 20, bold: true });
    text(s, f.note, x + 68, 492, 272, 50, { size: 16, color: C.muted });
  }
  rect(s, 76, 560, 1094, 1, C.line);
  paragraph(s, "ベーカリーでスマートグラスを試すと、「これならつけてもいい」と言うスタッフが増えた。軽く見た目に違和感が少ないこと、熱・バッテリーを含め長時間装着できることは、想定以上に現場の許可を左右する。", 76, 585, 1110, 75, { size: 19, bold: true });
  note(s, "初期のスマートフォンヘッドマウントから、3Dモデルをゼロから設計した帽子型、スマートグラスへ進化させました。ベーカリーで試すと『これならつけてもいい』という反応が増え、軽さや見た目の違和感が現場の許可を想定以上に左右すると分かりました。\n\n専用の軽量撮影デバイスを試験的に購入し、負担の少ない形状で熱とバッテリーの問題を解決する撮影デバイスの開発も始めています。");
}

// 18. Unit economics
{
  const s = baseSlide("ECONOMICS", "1時間あたりの収支｜前提", 18);
  const values = [
    ["項目", "前提", "数値"],
    ["販売単価", "1時間あたり1,600円（下限）", "1,600円"],
    ["平均販売回数", "同一データを1回だけ販売", "平均1回（悲観シナリオ）"],
    ["現場還元", "売上の50%", "800円"],
    ["会社の取り分", "1,600円 − 800円", "800円"],
    ["デバイス費", "8万円/台を10か月で割る", "約73円/時間"],
    ["デバイス費を引いた後", "800円 − 約73円", "約727円/時間"],
  ];
  const table = s.tables.add({ rows: values.length, columns: 3, left: 76, top: 190, width: 1110, height: 385, columnWidths: [330, 450, 330], values });
  table.borders.assign({ style: "solid", fill: C.line, width: 1 });
  for (let r = 0; r < values.length; r++) for (let c = 0; c < 3; c++) {
    const cell = table.getCell(r, c);
    cell.fill = r === 0 ? C.dark : r === 2 || r === 6 ? C.blue2 : C.paper;
    cell.text.style = { typeface: sans, fontSize: r === 0 ? 16 : 17, bold: r === 0 || r === 2 || r === 6, color: r === 0 ? C.paper : C.ink };
  }
  paragraph(s, "1台あたり月間稼働：1日5時間 × 22営業日 ＝ 110時間/月", 76, 610, 1110, 40, { size: 18 });
  note(s, "販売単価は1,600円/hを下限とし、売上の50%を現場へ還元します。この試算は同一データを平均1回だけ販売する悲観シナリオです。複数のバイヤーへの販売は含めず、デバイス償却後は1時間あたり約727円です。");
}

// 19. Scale economics
{
  const s = baseSlide("ECONOMICS", "収集規模別の収支", 19);
  const values = [
    ["月間収集時間", "500時間", "1,000時間", "10,000時間"],
    ["平均販売回数", "1回", "1回", "1回"],
    ["必要デバイス", "5台", "10台", "91台"],
    ["データ販売額", "80万円", "160万円", "1,600万円"],
    ["会社取り分", "40万円", "80万円", "800万円"],
    ["1か月分のデバイス費", "4万円", "8万円", "72.8万円"],
    ["デバイス費を引いた後", "36万円", "72万円", "727.2万円"],
    ["デバイス購入費", "40万円", "80万円", "728万円"],
  ];
  const table = s.tables.add({ rows: values.length, columns: 4, left: 76, top: 180, width: 1110, height: 390, columnWidths: [340, 240, 240, 290], values });
  table.borders.assign({ style: "solid", fill: C.line, width: 1 });
  for (let r = 0; r < values.length; r++) for (let c = 0; c < 4; c++) {
    const cell = table.getCell(r, c);
    cell.fill = r === 0 ? C.dark : r === 1 || r === 6 ? C.blue2 : C.paper;
    cell.text.style = { typeface: sans, fontSize: r === 0 ? 15 : 16, bold: r === 0 || c === 0 || r === 1 || r === 6, color: r === 0 ? C.paper : C.ink };
  }
  paragraph(s, "月10,000時間を12か月継続：会社取り分9,600万円、デバイス費を引いた後は約8,726万円。", 76, 588, 1110, 35, { size: 18, bold: true });
  paragraph(s, "データは在庫として積み上がり、過去に収集した分も売り続けられる。平均2回販売なら会社取り分は月1,600万円、3回なら月2,400万円になる。", 76, 628, 1110, 48, { size: 17, bold: true, color: C.blue });
  note(s, "表は同一データを平均1回だけ販売する悲観シナリオです。月10,000時間を1年間続けると、12万時間のデータ資産が残ります。同一データを平均2回販売できれば月間の会社取り分は1,600万円、3回なら2,400万円です。\n\nデータは在庫として積み上がり、過去に収集した分も売り続けられます。月ごとの売上だけでなく、累積データ資産の価値がこの事業の重要な性質です。\n\n原本のVC向け試算では、月10,000時間時に現場開拓・運用を4〜6人、人件費を月150〜250万円程度と置くと、営業利益は年6,000万円前後です。ここは実際の獲得サイクルと現場運用を通じて検証します。");
}

// 20. Other costs
{
  const s = baseSlide("ECONOMICS", "デバイス費以外にかかる費用", 20);
  sectionBlock(s, "データ保存・転送費", "映像は1時間あたり5〜15GB。月500時間で2.5〜7.5TB、月10,000時間で50〜150TB。Nextremerへ格納し、自社負担を抑える。", 185, { bodySize: 16, ruleOffset: 88 });
  sectionBlock(s, "現場開拓・維持の人件費", "飛び込み営業、契約、機材の配布・回収、スタッフへの説明、トラブル対応、データチェック。現在は創業メンバーが対応している。", 285, { bodySize: 17, ruleOffset: 95 });
  sectionBlock(s, "デバイス破損・紛失", "長時間使う消耗品的な性質がある。8〜10か月の償却期間は、実際の使用状況に応じて見直す必要がある。", 395, { bodySize: 17, ruleOffset: 88 });
  sectionBlock(s, "契約・法務", "現段階では大崎が対応しているが、規模拡大時には法務チームや外部弁護士のコストが発生する。", 495, { bodySize: 17, ruleOffset: 88, rule: false });
  note(s, "デバイス費以外には、ストレージ、現場運用の人件費、破損・紛失、法務のコストがあります。本命は現場開拓と維持の人件費です。飛び込み営業、契約、配布・回収、スタッフへの説明、トラブル対応、データチェックが、収集時間に対してどこまでリニアに増えるかがユニットエコノミクスの分岐点になります。\n\n川島さんのベーカリーでは、一度契約した現場が継続的にデータを出し続けるかを、収集時間の推移から検証しています。");
}

// 21. Bottlenecks
{
  const s = baseSlide("ECONOMICS", "月10,000時間まで広げる際の課題", 21);
  sectionBlock(s, "現場開拓のスピード", "30店舗を確保する営業リソース。1店舗目から2店舗目へ進むにつれ、獲得サイクルが短縮していくか。", 205, { bodySize: 20, ruleOffset: 100 });
  sectionBlock(s, "現場運用の負担", "30店舗へデバイスを配布・回収し、トラブルへ対応する運用体制。店舗数 × 定期訪問になると、人件費が膨らむ。", 325, { bodySize: 20, ruleOffset: 100 });
  sectionBlock(s, "買い手側の受け入れ規模", "月10,000時間を継続的に売り切れる販路を、Nextremer、海外、国内需要の組み合わせで確保できるか。", 445, { bodySize: 20, ruleOffset: 100 });
  note(s, "月10,000時間へ拡大する際のボトルネックは、現場開拓、現場運用、買い手側の受け入れ規模です。");
}

// 22. 2026 Q4
{
  const s = baseSlide("OUTLOOK", "今後の見通し｜2026 Q4", 22);
  addOutlookGantt(s, ["10月", "11月", "12月"], [
    { label: "撮影規模・撮影先", items: [
      { start: 0, end: 0, text: "月500時間" },
      { start: 1, end: 1, text: "月500時間\n現場の課題を確認" },
      { start: 2, end: 2, text: "月1,000時間\n飲食・小売へ拡大" },
    ] },
    { label: "データ販売", items: [{ start: 0, end: 2, text: "Nextremerと合意し格納開始\n海外販売先へ再打診" }] },
    { label: "撮影デバイス・知財", items: [{ start: 0, end: 2, text: "設計で協働できる企業へ打診" }] },
    { label: "契約・法務", items: [{ start: 1, end: 1, text: "合意フローと\nデータ取扱いを確認" }] },
  ]);
  note(s, "2026年Q4は、10月に500時間、12月に1,000時間を目標とし、現場運用と販売先の条件を確認します。");
}

// 23. 2027
{
  const s = baseSlide("OUTLOOK", "今後の見通し｜2027", 23);
  addOutlookGantt(s, ["Q1", "Q2", "Q3", "Q4"], [
    { label: "撮影規模・撮影先", items: [
      { start: 0, end: 0, text: "宿泊・改装・清掃へ拡大" },
      { start: 1, end: 3, text: "介護・医療を含む撮影先の拡大" },
    ] },
    { label: "撮影デバイス・知財", items: [
      { start: 0, end: 0, text: "撮影デバイス開発" },
      { start: 1, end: 1, text: "意匠・特許を出願" },
    ] },
    { label: "ロボット企業・大学", items: [
      { start: 1, end: 1, text: "機密性の高い\n現場データの活用を検討", size: 11 },
      { start: 2, end: 2, text: "企業・政府へ\nデータ収集を提案", size: 11 },
      { start: 3, end: 3, text: "大学とロボット学習・\n現場再現の研究を開始", size: 10 },
    ] },
  ]);
  note(s, "2027年は撮影先とデバイスを拡大します。Q1は宿泊・リフォーム・清掃とデバイスの意匠・特許、Q2は介護・医療とプライバシー性の高いデータの活用、Q3は国内の垂直統合型ロボティクス企業や政府プロジェクトへの打診、Q4は国内大学とAIモデル開発・Real2Simの研究開発へ進む流れです。");
}

// 24. 2028
{
  const s = baseSlide("OUTLOOK", "今後の見通し｜2028", 24);
  addOutlookGantt(s, ["Q1", "Q2", "Q3", "Q4"], [
    { label: "撮影規模・撮影先", items: [
      { start: 0, end: 1, text: "撮影先と実証に使える現場を拡大" },
      { start: 2, end: 3, text: "蓄積データから、ロボットを\n導入しやすい業種と現場を絞る", size: 11 },
    ] },
    { label: "ロボット企業・大学", items: [{ start: 0, end: 1, text: "企業・大学へ実証や研究に使う現場を紹介" }] },
    { label: "ロボットの導入・開発", items: [{ start: 2, end: 3, text: "既存ロボットを現場へ導入し\n作業に合わせて運用を調整" }] },
  ], "2028年は既存ロボットの導入から始め、自社でのモデル・実機開発はまだ行わない");
  note(s, "2028年前半は、ロボット企業と実証実験を行える現場を繋ぎ、大学との研究にも現場を提供します。後半は、蓄積したデータと経験からロボットを導入しやすい業種と現場を絞り、既存ロボットを実際に導入します。この段階では自社でロボットを開発するのではなく、現場の作業に合わせた導入と運用調整から始めます。");
}

// 25. 2029
{
  const s = baseSlide("OUTLOOK", "今後の見通し｜2029", 25);
  addOutlookGantt(s, ["Q1", "Q2", "Q3", "Q4"], [
    { label: "撮影規模・撮影先", items: [{ start: 0, end: 3, text: "ロボット導入先と、各現場の作業データを増やす" }] },
    { label: "ロボットの導入・開発", items: [{ start: 0, end: 3, text: "既存ロボットの導入を拡大し、現場データを使った\n動作モデルと実機の改良に自社で着手" }] },
  ], "2029年から、ロボットの動作モデルと実機の開発を自社の事業へ加える");
  note(s, "セクション3で述べた第2段階への移行です。2028年に始めた既存ロボットの現場導入を広げながら、現場で得た作業データをロボットの動作モデル改善へ使います。実機についても、現場で見つかった課題を設計と改良へ戻します。2029年からは、導入と運用調整だけでなく、動作モデルと実機の開発も自社の事業へ加える構想です。");
}

const candidatePath = path.join(TMP_DIR, "candidate.pptx");
await (await PresentationFile.exportPptx(deck)).save(candidatePath);

const result = await finalizePresentation({
  explicitTotalSlideCount: 25,
  requiredNativeTableOwnerSlides: [18, 19],
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
    "--require-native-table-slide", "18",
    "--require-native-table-slide", "19",
  ],
  fontPolicy: { basis: "design", families: [sans] },
  verifyArtifactToolImport: true,
  receiptPath: path.join(TMP_DIR, "会社紹介（VC向け）.validation.json"),
});

console.log(JSON.stringify({ finalPath: FINAL_PPTX, result }, null, 2));
