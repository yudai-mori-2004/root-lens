import fs from "node:fs/promises";
import JSZip from "jszip";

const [sourcePath, outputPath] = process.argv.slice(2);
if (!sourcePath || !outputPath || sourcePath === outputPath) {
  throw new Error("Usage: fix_video_click_relationship.mjs SOURCE_PPTX OUTPUT_PPTX");
}
const zip = await JSZip.loadAsync(await fs.readFile(sourcePath));
const slidePath = "ppt/slides/slide15.xml";
const relsPath = "ppt/slides/_rels/slide15.xml.rels";
let slide = await zip.file(slidePath).async("string");
const rels = await zip.file(relsPath).async("string");
const videoRel = rels.match(/<Relationship[^>]*Type="[^"]*\/video"[^>]*Id="([^"]+)"/)?.[1]
  ?? rels.match(/<Relationship[^>]*Id="([^"]+)"[^>]*Type="[^"]*\/video"/)?.[1];
if (!videoRel) throw new Error("Video relationship missing on slide 15");
const before = slide;
slide = slide.replace(/(<a:hlinkClick\b[^>]*\br:id=")("[^>]*action="ppaction:\/\/media")/, `$1${videoRel}$2`);
if (slide === before) throw new Error("Expected an empty video click relationship");
zip.file(slidePath, slide);
await fs.writeFile(outputPath, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } }));
console.log(outputPath);
