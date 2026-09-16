import pptxgen from "pptxgenjs";
import fs from "node:fs/promises";

const p = new pptxgen();
p.layout = "LAYOUT_WIDE";
const s = p.addSlide();
const poster = await fs.readFile("/Users/forest/WebCreations/root-lens/document/business/company-introductions/field/assets/bakery-iphone-pro-poster.jpg");
s.addMedia({
  type: "video",
  path: "/Users/forest/WebCreations/root-lens/document/business/company-introductions/field/assets/bakery-iphone-pro-demo.mp4",
  cover: `data:image/jpeg;base64,${poster.toString("base64")}`,
  x: 1,
  y: 1,
  w: 10,
  h: 4,
});
await p.writeFile({ fileName: "/Users/forest/WebCreations/root-lens/.codex-build/company-introduction-field-v2/video-probe.pptx" });
