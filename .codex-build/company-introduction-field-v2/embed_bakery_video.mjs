import fs from "node:fs/promises";
import JSZip from "jszip";

const [sourcePath, outputPath] = process.argv.slice(2);
if (!sourcePath || !outputPath || sourcePath === outputPath) {
  throw new Error("Usage: embed_bakery_video.mjs SOURCE_PPTX OUTPUT_PPTX");
}

const videoPath = "/Users/forest/WebCreations/root-lens/document/business/company-introductions/field/assets/bakery-iphone-pro-demo.mp4";
const timingReferencePath = "/Users/forest/WebCreations/root-lens/output/presentations/会社紹介（現場向け）.pptx";
const zip = await JSZip.loadAsync(await fs.readFile(sourcePath));
const slidePath = "ppt/slides/slide15.xml";
const relsPath = "ppt/slides/_rels/slide15.xml.rels";
let slide = await zip.file(slidePath).async("string");
let rels = await zip.file(relsPath).async("string");
let types = await zip.file("[Content_Types].xml").async("string");

const pics = [...slide.matchAll(/<p:pic>[\s\S]*?<\/p:pic>/g)];
if (pics.length !== 2) throw new Error(`Expected helmet photo and video poster on slide 15, found ${pics.length}`);
const uncroppedPhoto = pics[0][0];
const croppedPhoto = uncroppedPhoto.replace(
  /<a:srcRect[^>]*\/>/,
  '<a:srcRect l="0" t="0" r="0" b="53000" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" />',
);
if (croppedPhoto === uncroppedPhoto) throw new Error("Helmet photo crop could not be set");
slide = slide.replace(uncroppedPhoto, croppedPhoto);
let pic = pics[1][0];
if (!/<p:nvPr\s*\/>/.test(pic)) throw new Error("Unexpected video poster metadata on slide 15");
const pictureId = pic.match(/<p:cNvPr id="(\d+)"/)?.[1];
if (!pictureId) throw new Error("Video poster shape ID missing");

const videoRel = "RrootlensBakeryVideo15";
const mediaRel = "RrootlensBakeryMedia15";
if (rels.includes(videoRel) || rels.includes(mediaRel)) throw new Error("Video relationship already exists");

pic = pic.replace(
  /<p:cNvPr id="(\d+)" name=""\s*\/>/,
  (_match, id) => `<p:cNvPr id="${id}" name="iPhone Pro bakery demo" descr="ベーカリーのカメラ映像とLiDAR深度の撮影サンプル"><a:hlinkClick xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="${videoRel}" action="ppaction://media"/></p:cNvPr>`,
);
pic = pic.replace(
  /<p:nvPr\s*\/>/,
  `<p:nvPr><a:videoFile xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:link="${videoRel}"/><p:extLst><p:ext uri="{DAA4B4D4-6D71-4841-9C94-3DE7FCFB9230}"><p14:media xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="${mediaRel}"/></p:ext></p:extLst></p:nvPr>`,
);
slide = slide.replace(pics[1][0], pic);
const timingReference = await JSZip.loadAsync(await fs.readFile(timingReferencePath));
const timingSlide = await timingReference.file("ppt/slides/slide16.xml")?.async("string") ?? "";
const previousTimingSlide = await timingReference.file(slidePath)?.async("string") ?? "";
const timing = timingSlide.match(/<p:timing>[\s\S]*?<\/p:timing>/)?.[0]
  ?? previousTimingSlide.match(/<p:timing>[\s\S]*?<\/p:timing>/)?.[0];
if (!timing) throw new Error("Click-to-play timing missing from reference deck");
slide = slide.replace("</p:sld>", `${timing.replace(/spid="\d+"/g, `spid="${pictureId}"`)}</p:sld>`);
rels = rels.replace(
  "</Relationships>",
  `<Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/video" Target="/ppt/media/bakery-iphone-pro-demo.mp4" Id="${videoRel}" /><Relationship Type="http://schemas.microsoft.com/office/2007/relationships/media" Target="/ppt/media/bakery-iphone-pro-demo.mp4" Id="${mediaRel}" /></Relationships>`,
);
if (!types.includes('Extension="mp4"')) {
  types = types.replace("</Types>", '<Default Extension="mp4" ContentType="video/mp4" /></Types>');
}

zip.file(slidePath, slide);
zip.file(relsPath, rels);
zip.file("[Content_Types].xml", types);
zip.file("ppt/media/bakery-iphone-pro-demo.mp4", await fs.readFile(videoPath));
await fs.writeFile(outputPath, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } }));
console.log(outputPath);
