import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Presentation, PresentationFile } from "@oai/artifact-tool";

const workspaceDir = "/Users/forest/WebCreations/root-lens";
const SKILL_DIR = "/Users/forest/.codex/plugins/cache/openai-primary-runtime/presentations/26.909.12148/skills/presentations";
const TMP_DIR = path.join(workspaceDir, ".codex-build/company-introduction-field-v2");
const FINAL_PPTX = process.env.FINAL_PPTX ?? path.join(workspaceDir, "output/presentations/会社紹介（現場向け）.pptx");
const RUNTIME_PYTHON = "/Users/forest/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3";
const ASSET_DIR = path.join(workspaceDir, "document/business/company-introductions/field/assets");

const { finalizePresentation } = await import(pathToFileURL(
  path.join(SKILL_DIR, "container_tools/artifact_tool_utils.mjs"),
).href);

await fs.mkdir(TMP_DIR, { recursive: true });
await fs.mkdir(path.dirname(FINAL_PPTX), { recursive: true });

const deck = Presentation.create({ slideSize: { width: 1280, height: 720 } });
const font = "Hiragino Sans";
const C = {
  bg: "#F4F3EF",
  paper: "#FFFFFF",
  ink: "#17252B",
  muted: "#647177",
  line: "#C7CFD2",
  blue: "#2E6178",
  blueSoft: "#DCE9EF",
  bluePale: "#EAF1F4",
  dark: "#23353D",
  orange: "#D67A4A",
  orangeSoft: "#F2E2D8",
  green: "#4E7661",
  greenSoft: "#E1EBE5",
  red: "#B84A3A",
};

function rect(slide, x, y, w, h, fill, lineFill = "none", lineWidth = 0, radius = 0) {
  return slide.shapes.add({
    geometry: radius ? "roundRect" : "rect",
    position: { left: x, top: y, width: w, height: h },
    fill,
    line: { fill: lineFill, width: lineWidth },
    radius,
  });
}

function circle(slide, x, y, d, fill, lineFill = "none", lineWidth = 0) {
  return slide.shapes.add({
    geometry: "ellipse",
    position: { left: x, top: y, width: d, height: d },
    fill,
    line: { fill: lineFill, width: lineWidth },
  });
}

function text(slide, value, x, y, w, h, opts = {}) {
  const shape = slide.shapes.add({
    geometry: "textbox",
    position: { left: x, top: y, width: w, height: h },
    fill: "none",
    line: { fill: "none", width: 0 },
  });
  shape.text = value;
  shape.text.style = {
    typeface: font,
    fontSize: (opts.size ?? 22) * 4 / 3,
    bold: opts.bold ?? false,
    color: opts.color ?? C.ink,
    alignment: opts.align ?? "left",
    verticalAlignment: opts.vAlign ?? "top",
    autoFit: "none",
  };
  return shape;
}

function image(slide, filename, x, y, w, h, fit = "cover", alt = "") {
  return fs.readFile(path.join(ASSET_DIR, filename)).then((blob) => slide.images.add({
    blob,
    contentType: filename.endsWith(".png") ? "image/png" : "image/jpeg",
    alt,
    fit,
    position: { left: x, top: y, width: w, height: h },
  }));
}

function localImage(slide, filename, x, y, w, h, fit = "cover", alt = "") {
  return fs.readFile(path.join(workspaceDir, filename)).then((blob) => slide.images.add({
    blob,
    contentType: filename.endsWith(".png") ? "image/png" : "image/jpeg",
    alt,
    fit,
    position: { left: x, top: y, width: w, height: h },
  }));
}

function title(slide, value, opts = {}) {
  text(slide, value, 64, 48, 1120, 64, { size: opts.size ?? 37, bold: true });
  rect(slide, 64, 132, 1152, 1, C.line);
}

function newSlide(titleValue, opts = {}) {
  const s = deck.slides.add();
  s.background.fill = opts.bg ?? C.bg;
  rect(s, 0, 0, 12, 720, opts.accent ?? C.blue);
  title(s, titleValue, opts);
  return s;
}

function note(slide, value) {
  slide.speakerNotes.textFrame.setText(value);
}

function scoreRows(slide, rows, x, y, labelW = 185, gap = 56) {
  rows.forEach(([label, score], i) => {
    const yy = y + i * gap;
    const scoreColor = score <= 2 ? C.red : C.blue;
    text(slide, label, x, yy, labelW, 32, { size: 20, bold: true });
    for (let n = 0; n < 5; n++) {
      circle(slide, x + labelW + n * 30, yy + 1, 20, n < score ? scoreColor : C.paper, n < score ? scoreColor : C.line, 1);
    }
    text(slide, String(score), x + labelW + 158, yy - 1, 32, 32, { size: 20, bold: true, color: scoreColor, align: "right" });
  });
}

function labelChip(slide, value, x, y, w, color = C.blue) {
  rect(slide, x, y, w, 34, color, color, 0, 10);
  text(slide, value, x + 10, y + 4, w - 20, 26, { size: 20, bold: true, color: C.paper, align: "center" });
}

// 01 Cover
{
  const s = deck.slides.add();
  s.background.fill = C.bg;
  await image(s, "cover-work-illustration.png", 0, 0, 1280, 720, "cover", "現場の仕事を描いたイラスト");
  rect(s, 0, 0, 12, 720, C.blue);
  text(s, "RootLens", 66, 78, 430, 52, { size: 35, bold: true });
  text(s, "現場の仕事を、\nAIとロボットの学習データへ", 66, 194, 650, 160, { size: 35, bold: true });
  text(s, "撮影協力をご検討の\n店舗・事業所の皆さまへ", 70, 407, 480, 74, { size: 22, color: C.blue, bold: true });
  rect(s, 70, 568, 520, 1, C.line);
  text(s, "contact@rootlens.io", 70, 589, 360, 31, { size: 20, color: C.muted });
  text(s, "2026.09", 70, 630, 180, 30, { size: 20, color: C.muted });
  note(s, "本日は、RootLensが何をしているのか、現場の皆さまに何をお願いしたいのか、撮影データをどう扱うのかをご説明します。\n\n画像：説明用に生成した編集イラスト。");
}

// 02 Company
{
  const s = newSlide("RootLensはどんな企業？");
  text(s, "領域", 74, 177, 140, 34, { size: 20, bold: true, color: C.muted });
  text(s, "ロボティクス・フィジカルAI", 238, 170, 790, 48, { size: 31, bold: true, color: C.blue });
  rect(s, 72, 252, 1136, 1, C.line);
  text(s, "事業内容", 74, 289, 180, 36, { size: 22, bold: true, color: C.muted });
  rect(s, 74, 354, 12, 12, C.orange);
  text(s, "現場から多種多様な「人の作業」のデータを撮影、加工、販売", 110, 341, 1000, 44, { size: 25, bold: true });
  rect(s, 74, 433, 12, 12, C.green);
  text(s, "現場で撮影に用いる機材の開発", 110, 420, 850, 44, { size: 25, bold: true });
  rect(s, 72, 524, 1136, 92, C.dark);
  text(s, "飲食・小売などの現場と、フィジカルAIをつなぐ企業", 102, 545, 1050, 43, { size: 28, bold: true, color: C.paper });
  note(s, "RootLensは、ロボティクス・フィジカルAIの領域で事業を行っています。現場で人が行っている多種多様な作業を撮影し、AIが学習に利用できる形へ加工して販売します。同時に、現場で撮影するための機材も開発しています。飲食や小売などの現場と、フィジカルAIをつなぐ企業です。");
}

// 03 Physical AI
{
  const s = newSlide("ロボティクス・フィジカルAIとは？");
  text(s, "現実世界で作業するロボット", 70, 166, 500, 50, { size: 20, bold: true });
  text(s, "物理世界でどう動くかを\n判断するAI", 690, 160, 500, 72, { size: 20, bold: true, align: "right" });
  await image(s, "physical-ai-illustration.png", 64, 226, 1152, 334, "cover", "ロボットとAIの脳を描いたイラスト");
  text(s, "ロボットとAIを組み合わせ、周囲の状況に応じて自ら動くロボットの開発が進んでいる。", 86, 598, 1100, 62, { size: 20, bold: true, color: C.blue, align: "center" });
  note(s, "ロボティクス・フィジカルAIでは、現実世界で作業するロボットと、物理世界でどう動くかを判断するAIを組み合わせます。目指しているのは、状況に応じてロボットが自ら動き、作業できる状態です。\n\n画像：説明用に生成した編集イラスト。");
}

// 04 Field data needed for robot deployment
{
  const s = newSlide("ロボットを現場に導入するために必要なデータ");
  text(s, "現場ごとに環境や作業は異なる。ロボットがそこで働くには、\n現場の環境と作業を知るためのデータが要る。", 74, 166, 1110, 110, { size: 23, bold: true, color: C.blue });
  const items = [
    ["空間データ", "作業場所や周囲の配置"],
    ["作業データ", "何を、どの順番で行うか"],
    ["操作データ", "手や道具をどう使うか"],
  ];
  items.forEach(([heading, detail], i) => {
    const xx = 78 + i * 389;
    text(s, heading, xx, 308, 340, 60, { size: 27, bold: true, color: C.ink, align: "center" });
    rect(s, xx + 32, 384, 276, 4, i === 0 ? C.blue : i === 1 ? C.orange : C.green);
    text(s, detail, xx, 412, 340, 80, { size: 20, color: C.muted, align: "center" });
  });
  rect(s, 72, 537, 1110, 1, C.line);
  text(s, "人が働く様子を一人称視点で撮影し、\nロボット開発に使えるデータとして集める。", 74, 560, 1100, 101, { size: 26, bold: true, color: C.blue, align: "center" });
  note(s, "ここで対象にしているのは、現場で仕事をするロボットです。現場ごとに環境や作業が異なるため、ロボットがそこで働くには、現場の実際の様子を知るためのデータが要ります。作業場所や周囲の配置、何をどの順番で行うか、手や道具をどう使うか。私たちは、人が働く様子を一人称視点で撮影し、ロボット開発に使える形へ加工します。");
}

// 05 Origin
{
  const s = newSlide("私たちのビジネスモデルの起源", { accent: C.orange });
  await image(s, "india-egocentric-factory.jpeg", 64, 190, 520, 320, "cover", "インドの工場でヘッドカメラを装着する従業員");
  text(s, "2026年4月、インドの縫製工場で\n従業員がヘッドカメラをつけて\n作業する映像がSNSで拡散した。", 630, 184, 560, 132, { size: 21, bold: true });
  text(s, "人の作業を一人称視点で記録し、\nロボット学習に使う研究は、\n以前から続いていた。\n\nこの映像を見て、現場データ収集が\n事業として広がり始めていることを知った。\nこれが現在のビジネスモデルを考える\nきっかけになった。", 630, 344, 560, 294, { size: 20, color: C.blue });
  note(s, "2026年4月、インドの縫製工場で従業員がヘッドカメラを装着して作業する映像がSNSで拡散しました。これが、私たちが現在のビジネスモデルを考えるきっかけです。\n\n人の目線から作業を撮影したデータをロボット学習に利用する研究自体は、それ以前から続いていました。たとえば2024年のEgoMimicは、人の一人称視点データとロボットデータを合わせて学習し、人のデータを追加する効果を示しています。4月の映像を見て、研究だけでなく、実際の現場でデータを集める事業が広がり始めていることを知りました。\n\n出典：https://www.freepressjournal.in/tech/training-their-own-replacements-viral-video-shows-indian-factory-workers-wearing-head-cameras-for-ai-research-sparks-job-fears\n研究：https://egomimic.github.io/\n画像：https://sc0.blr1.cdn.digitaloceanspaces.com/book/213519-ulcdcitoba-1779184650.jpeg");
}

// 05 Required work
{
  const s = deck.slides.add();
  s.background.fill = C.bg;
  rect(s, 0, 0, 12, 720, C.blue);
  text(s, "Q.", 66, 48, 78, 64, { size: 32, bold: true, color: C.blue });
  text(s, "どんな作業のデータが必要なのか？", 150, 48, 1010, 64, { size: 32, bold: true });
  rect(s, 64, 132, 1152, 1, C.line);
  text(s, "A.", 70, 166, 74, 58, { size: 28, bold: true, color: C.blue });
  text(s, "人間が手で物を操作する作業全般", 150, 167, 1030, 58, { size: 28, bold: true, color: C.blue });
  await image(s, "manual-work-illustration.png", 64, 248, 1152, 280, "cover", "物流・製造・飲食・小売の手作業を描いたイラスト");
  text(s, "特に、将来的にロボットが人の代わりに働くことが期待されている業種では需要が高い。\n物流倉庫のピッキング、製造ラインの組立・検品、飲食店の調理・盛付、\n小売店の棚補充・陳列などが該当する。", 76, 560, 1125, 98, { size: 20, color: C.ink });
  note(s, "必要なのは、人間が手で物を操作する作業全般のデータです。特に、将来的にロボットが人の代わりに働くことが期待されている業種では需要が高くなっています。物流倉庫のピッキング、製造ラインでの組立や検品、飲食店での調理や盛付、小売店での棚補充や陳列などが具体例です。\n\n画像：説明用に生成した編集イラスト。");
}

// 06 Smartphone
{
  const s = newSlide("撮影機材の比較①", { accent: C.orange });
  text(s, "現場検証済み", 540, 76, 600, 44, { size: 20, bold: true, color: C.orange });
  await image(s, "smartphone-headmount.png", 62, 184, 535, 360, "contain", "スマートフォンとヘッドマウントの構成");
  text(s, "スマートフォン", 682, 169, 430, 52, { size: 32, bold: true, color: C.orange });
  scoreRows(s, [["軽さ",1],["快適性",2],["目立ちにくさ",1],["データ品質",5],["コスト",2]], 682, 238, 185, 58);
  rect(s, 670, 535, 520, 1, C.line);
  text(s, "収集するデータ", 682, 558, 300, 40, { size: 20, bold: true, color: C.muted });
  text(s, "映像　音声　機材の動き", 682, 603, 500, 48, { size: 20, bold: true, color: C.orange });
  note(s, "スマートフォンをヘッドマウントへ取り付ける方式です。映像、音声、機材の動きを高い品質で収集できます。一方、重量と目立ちやすさが現場での負担になります。\n\n3つの機材は販売用のカタログではなく、撮影方式を比較するために並べています。実際の撮影ではTOBI E2を使用する予定です。\n\n画像：説明用に生成した製品イメージ。");
}

// 07 RootGlass
{
  const s = newSlide("撮影機材の比較②");
  text(s, "現場検証済み", 540, 76, 600, 44, { size: 20, bold: true, color: C.blue });
  await localImage(s, "document/business/assets/device_rootglass.jpg", 62, 184, 535, 360, "contain", "RootGlass");
  text(s, "RootGlass", 682, 169, 430, 52, { size: 32, bold: true, color: C.blue });
  scoreRows(s, [["軽さ",5],["快適性",5],["目立ちにくさ",5],["データ品質",2],["コスト",3]], 682, 238, 185, 58);
  rect(s, 670, 535, 520, 1, C.line);
  text(s, "収集するデータ", 682, 558, 300, 40, { size: 20, bold: true, color: C.muted });
  text(s, "映像　音声　機材の動き", 682, 603, 500, 48, { size: 20, bold: true, color: C.blue });
  note(s, "RootGlassは、現場で長時間装着することを想定したメガネ型の撮影機材です。軽さ、快適性、目立ちにくさを重視しています。収集するのは、映像、音声、機材の動きです。\n\n3つの機材は撮影方式を比較するために並べています。RootGlassは現場で扱いやすい一方、データ品質が弱点です。実際の撮影ではTOBI E2を使用する予定です。\n\n画像：RootLens提供。");
}

// 08 Tobi E2
{
  const s = newSlide("撮影機材の比較③", { accent: C.green });
  text(s, "実際の撮影に使用予定", 540, 76, 600, 44, { size: 20, bold: true, color: C.green });
  await image(s, "tobi-e2-official.png", 74, 190, 525, 350, "contain", "TOBI E2公式製品写真");
  text(s, "TOBI E2", 682, 169, 430, 52, { size: 32, bold: true, color: C.green });
  scoreRows(s, [["軽さ",4],["快適性",4],["目立ちにくさ",2],["データ品質",5],["コスト",4]], 682, 238, 185, 58);
  rect(s, 670, 535, 520, 1, C.line);
  text(s, "収集・後処理で得るデータ", 682, 558, 500, 40, { size: 20, bold: true, color: C.muted });
  text(s, "映像　音声　機材の動き　深度", 682, 603, 500, 48, { size: 20, bold: true, color: C.green });
  note(s, "TOBI E2は、データ品質を重視した撮影機材です。RootGlassよりも目立ちますが、映像、音声、機材の動きを記録できます。深度は本体の直接記録ではなく、左右のカメラ映像から後処理で推定します。\n\n3つの方式を比較した上で、実際の撮影にはTOBI E2を使用する予定です。\n\n画像・仕様：TOBI公式製品ページ https://www.tobi.cn/product-e2.html");
}

// 10 Device development
{
  const s = newSlide("撮影機材の開発", { accent: C.green });
  rect(s, 74, 190, 525, 350, "#E5E8E8");
  rect(s, 105, 222, 463, 286, "#D8DDDE");
  text(s, "???", 105, 320, 463, 84, { size: 52, bold: true, color: C.muted, align: "center" });
  text(s, "???", 682, 169, 430, 52, { size: 32, bold: true, color: C.green });
  scoreRows(s, [["軽さ",4],["快適性",4],["目立ちにくさ",5],["データ品質",5],["コスト",4]], 682, 238, 185, 58);
  rect(s, 670, 535, 520, 1, C.line);
  text(s, "開発の目標", 682, 558, 300, 40, { size: 20, bold: true, color: C.muted });
  text(s, "データ品質を保ち、\n「目立たない快適なデバイス」を\n目標に開発も行っている", 682, 600, 500, 99, { size: 20, bold: true, color: C.green });
  note(s, "実際の撮影にはTOBI E2を使用する予定です。同時に、データ品質を保ちながら目立ちにくさを改善し、快適に使える撮影機材も開発しています。図の評価はTOBI E2を基準に、目立ちにくさを5にした開発目標を示しています。機材の外観や製品名はこれから決めていきます。");
}

// 09 Operation
{
  const s = newSlide("現場における運用");
  await image(s, "operation-tobi-illustration.png", 64, 178, 650, 442, "cover", "TOBI E2の装着からデータ提出までを描いたイラスト");
  text(s, "1.", 754, 170, 52, 40, { size: 20, bold: true, color: C.blue });
  text(s, "現場で働くスタッフが\n業務開始時に機材を装着する", 822, 170, 372, 78, { size: 20, bold: true });
  rect(s, 754, 264, 430, 1, C.line);
  text(s, "2.", 754, 288, 52, 40, { size: 20, bold: true, color: C.blue });
  text(s, "撮影開始ボタンを押す", 822, 288, 372, 48, { size: 20, bold: true });
  rect(s, 754, 358, 430, 1, C.line);
  text(s, "3.", 754, 382, 52, 40, { size: 20, bold: true, color: C.blue });
  text(s, "終了時は、撮影終了ボタンを\n押して外す", 822, 382, 372, 78, { size: 20, bold: true });
  rect(s, 754, 476, 430, 1, C.line);
  text(s, "4.", 754, 500, 52, 40, { size: 20, bold: true, color: C.blue });
  text(s, "PCで現場管理者が確認し、\n承認したデータを提出する", 822, 500, 372, 78, { size: 20, bold: true });
  note(s, "業務開始時にスタッフがTOBI E2を装着し、撮影開始ボタンを押します。その後は普段どおり業務を行います。終了時に撮影終了ボタンを押して機材を外し、PCに接続します。最後に現場管理者がデータを確認し、承認したものだけを提出します。\n\n画像：TOBI E2の形状を参照して生成した説明用イラスト。");
}

// 09 Privacy
{
  const s = newSlide("プライバシー・コンプライアンスについて");
  text(s, "スタッフの顔の映り込み", 72, 170, 440, 36, { size: 22, bold: true, color: C.blue });
  text(s, "・カメラは斜め下を向いているため、\n　人の顔は映りにくい\n・万が一映った場合、\n　ぼかし処理を適用する", 72, 219, 550, 122, { size: 20 });
  text(s, "書類・画面・名札の写り込み", 72, 370, 500, 36, { size: 22, bold: true, color: C.blue });
  text(s, "・映り込んだ場合、ぼかし処理を適用する", 72, 419, 550, 46, { size: 20 });
  text(s, "会話の混入", 72, 510, 440, 36, { size: 22, bold: true, color: C.blue });
  text(s, "・会話の除去処理を行う", 72, 559, 550, 46, { size: 20 });
  await image(s, "privacy-illustration.png", 660, 178, 536, 442, "cover", "プライバシー処理を描いたイラスト");
  note(s, "カメラは作業者の手元を撮影するために斜め下を向けます。そのため、周囲のスタッフの顔は基本的に映りづらくなっています。顔が映った場合はぼかし処理を適用します。\n\n書類、画面、名札が映り込んだ場合も、同じようにぼかし処理を行います。音声に会話が含まれていた場合は、会話の除去処理を行います。\n\n根拠：撮影協力に関する基本合意書 第5条、プライバシーポリシー第8条・第9条・第13条・第14条。\n画像：説明用に生成した編集イラスト。");
}

// 10 Q&A
{
  const s = deck.slides.add();
  s.background.fill = C.bg;
  rect(s, 0, 0, 12, 720, C.blue);
  text(s, "Q1.", 72, 50, 90, 45, { size: 24, bold: true, color: C.blue });
  text(s, "合意や契約は必要？", 170, 50, 956, 45, { size: 24, bold: true });
  text(s, "A1.", 72, 120, 90, 42, { size: 20, bold: true, color: C.blue });
  text(s, "必要です。撮影を始める前に、現場および撮影に関わるすべてのスタッフから同意を得ます。", 170, 120, 1016, 63, { size: 20 });
  rect(s, 72, 211, 1110, 1, C.line);
  text(s, "Q2.", 72, 238, 90, 45, { size: 24, bold: true, color: C.blue });
  text(s, "提出前に動画を確認できる？", 170, 238, 956, 45, { size: 24, bold: true });
  text(s, "A2.", 72, 308, 90, 42, { size: 20, bold: true, color: C.blue });
  text(s, "できます。動画を確認し、現場管理者が承認したもののみ、当社が取り扱います。", 170, 308, 1016, 63, { size: 20 });
  rect(s, 72, 399, 1110, 1, C.line);
  text(s, "Q3.", 72, 426, 90, 45, { size: 24, bold: true, color: C.blue });
  text(s, "後から動画を消せる？", 170, 426, 956, 45, { size: 24, bold: true });
  text(s, "A3.", 72, 496, 90, 42, { size: 20, bold: true, color: C.blue });
  text(s, "承認後、データの加工を経て販売が始まるまで、約2週間あります。\nこの間は、データを削除できます。\n販売開始後も、新たな販売はいつでも停止できます。\nただし、すでに販売したデータの完全な消去は保証できません。", 170, 496, 1016, 168, { size: 20 });
  note(s, "撮影は、現場との契約と、撮影に関わるスタッフ全員の同意を得た上で行います。撮影した動画は提出前に確認でき、現場管理者が承認した動画のみ当社が取り扱います。\n\n承認後のデータが加工され、販売が始まるまでには約2週間の猶予を設けます。その期間中は削除できます。販売開始後も販売を停止できます。ただし、一度販売されたデータについては、販売先から完全に消去されることを保証できません。\n\n根拠：撮影協力に関する基本合意書 第4条・第5条・第7条、撮影参加に関する説明・同意書『参加の中止と削除』。");
}

// 11 Revenue share
{
  const s = newSlide("収益配分について", { accent: C.green });
  text(s, "現場への還元には、レベニューシェア方式を採用します。", 72, 178, 1110, 64, { size: 25, bold: true, color: C.green });
  rect(s, 72, 263, 1110, 1, C.line);
  text(s, "現時点では、当社がデータを加工・販売して得た収益の\n50%を現場に還元する想定です。", 72, 303, 1110, 108, { size: 24, bold: true });
  rect(s, 72, 436, 1110, 1, C.line);
  text(s, "1時間の撮影につき、500〜800円ほどの還元を見込んでいます。", 72, 475, 1110, 66, { size: 24, bold: true, color: C.blue });
  text(s, "割合や金額は、販売状況や需要・供給に応じて見直します。", 72, 580, 1110, 52, { size: 20, color: C.muted });
  note(s, "収益配分にはレベニューシェア方式を採用します。当社が撮影データを加工・販売し、その販売収益に応じて現場へ還元します。現時点では、当社が得た収益の50%を現場に還元する想定です。1時間の撮影あたりでは500円から800円ほどの還元を見込んでいます。割合や金額は、販売状況や需要・供給に応じて見直します。実際の条件は、撮影を始める前に提示します。");
}

// 15 Bakery filming verification
{
  const s = newSlide("実際の撮影検証", { accent: C.orange });
  text(s, "ベーカリー：サトウカエデ", 74, 151, 830, 53, { size: 28, bold: true, color: C.orange });
  await localImage(s, "document/business/assets/photo_satokaede.jpg", 995, 143, 186, 117, "cover", "ベーカリーの作業者がヘルメット型の撮影機材を着けて作業している写真");
  await image(s, "bakery-iphone-pro-poster.jpg", 92, 270, 1096, 411, "contain", "ベーカリーでiPhone Proにより撮影したカメラ映像とLiDAR深度の動画ポスター");
  note(s, "ベーカリー『サトウカエデ』での撮影検証です。右上の写真は、作業者がヘルメット型の撮影機材を装着して、実際のベーカリー業務を行っている様子です。下の動画は、LPで公開しているiPhone Pro撮影サンプルから、14分49秒以降の18秒間を抜粋しました。左が一人称視点のカメラ映像、右が同時に記録したLiDAR深度です。スライド上の映像をクリックすると、インターネット接続なしで再生できます。\n\n写真：RootLens提供、document/business/assets/photo_satokaede.jpg\n元の公開サンプル：https://rootlens.io/sample\n映像・深度：https://pub-494b37dbfc9645299042fcf51236d1fc.r2.dev/lp-sample/24aa0d6f/");
}

// 16 Team
{
  const s = newSlide("チーム", { accent: C.blue });
  const members = [
    ["森雄大", "共同創業", "販売先開拓・撮影機材の開発"],
    ["河野瞭人", "共同創業", "シミュレーション領域・現場開拓"],
    ["川島健二", "現場パートナー", "箕面デニッシュ合同会社／ベーカリーでの撮影・運用改善"],
    ["大崎操", "事業支援", "契約・合意書、現場開拓の支援"],
  ];
  members.forEach(([name, role, work], i) => {
    const yy = 176 + i * 120;
    text(s, name, 74, yy, 250, 46, { size: 27, bold: true, color: C.blue });
    text(s, role, 74, yy + 45, 250, 38, { size: 20, color: C.muted });
    text(s, work, 365, yy + 8, 800, 75, { size: 22 });
    if (i < members.length - 1) rect(s, 72, yy + 103, 1108, 1, C.line);
  });
  note(s, "現在は、森雄大と河野瞭人の共同創業の2名を中心に進めています。森が販売先開拓と撮影機材の開発、河野がシミュレーション領域と現場開拓を担います。川島健二さんがベーカリーの現場で撮影と運用改善を支え、大崎操さんが契約・合意書や現場開拓を支援しています。川島さんの所属する箕面デニッシュ合同会社は、本人とは別の法人です。");
}

// 17 Closing
{
  const s = deck.slides.add();
  s.background.fill = C.bg;
  rect(s, 0, 0, 12, 720, C.green);
  text(s, "RootLens", 65, 48, 450, 62, { size: 37, bold: true, color: C.green });
  await image(s, "field-to-robot-loop.png", 64, 130, 1152, 409, "contain", "現場データがロボット開発に使われ、利益が現場へ戻る循環のイラスト");
  text(s, "現場のデータをロボットに、\nデータの販売利益を現場に。\nこの新しい循環を構築する企業です。", 74, 552, 1100, 140, { size: 26, bold: true, color: C.green, align: "center" });
  note(s, "現場のデータをロボットに、データの販売利益を現場に。この新しい循環を構築する企業です。\n\n画像：説明用に生成した編集イラスト。");
}

const candidatePath = path.join(TMP_DIR, "candidate.pptx");
await (await PresentationFile.exportPptx(deck)).save(candidatePath);

const result = await finalizePresentation({
  explicitTotalSlideCount: 17,
  requiredNativeTableOwnerSlides: [],
  requiredNativeChartOwnerSlides: [],
  workspaceDir,
  candidatePath,
  finalPath: FINAL_PPTX,
  pythonExecutable: RUNTIME_PYTHON,
  integrityValidatorPath: path.join(SKILL_DIR, "container_tools/inspect_presentation_package_integrity.py"),
  layoutValidatorPath: path.join(SKILL_DIR, "container_tools/inspect_presentation_layout_geometry.py"),
  layoutArgs: ["--expected-slide-size-emu", "12192000,6858000", "--validate-heading-fit"],
  fontPolicy: { basis: "design", families: [font] },
  verifyArtifactToolImport: true,
  receiptPath: path.join(TMP_DIR, `${path.basename(FINAL_PPTX)}.validation.json`),
});

console.log(JSON.stringify({ finalPath: FINAL_PPTX, result }, null, 2));
