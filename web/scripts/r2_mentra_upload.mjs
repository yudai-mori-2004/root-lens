// Upload one complete Mentra capture to the raw R2 contract and verify every object.
// Usage: node scripts/r2_mentra_upload.mjs <clip-directory>
import { spawnSync } from "node:child_process";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: join(webRoot, ".env.local"), quiet: true });
config({ path: join(webRoot, ".env"), quiet: true });

const [, , clipDirectoryArg] = process.argv;

if (!clipDirectoryArg) {
  console.error("usage: node scripts/r2_mentra_upload.mjs <clip-directory>");
  process.exit(2);
}

const requiredEnvironment = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"];
for (const name of requiredEnvironment) {
  if (!process.env[name]) throw new Error(`missing required environment variable: ${name}`);
}

const bucket = process.env.R2_BUCKET_RAW_MENTRA ?? "rootlens-raw-mentra";
const endpoint = `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
const clipDirectory = resolve(clipDirectoryArg);
const uploadFiles = [
  ["frames.jsonl", "application/x-ndjson"],
  ["imu.jsonl", "application/x-ndjson"],
  ["rgb.mp4", "video/mp4"],
  ["metadata.json", "application/json"],
];

for (const [name] of uploadFiles) {
  const path = join(clipDirectory, name);
  if (!existsSync(path) || !statSync(path).isFile()) throw new Error(`missing capture file: ${path}`);
}

const metadata = JSON.parse(readFileSync(join(clipDirectory, "metadata.json"), "utf8"));
const unitId = metadata.unit_id;
if (!/^unit_[a-z0-9][a-z0-9_-]{0,63}_\d{8}T\d{9}Z_[0-9A-HJKMNP-TV-Z]{8}$/.test(unitId ?? "")) {
  throw new Error("metadata.json does not contain a valid unit_id");
}

const sha256File = async (path) => {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
};

const sourceFiles = [];
for (const [name] of uploadFiles) {
  const path = join(clipDirectory, name);
  sourceFiles.push({ name, bytes: statSync(path).size, sha256: await sha256File(path) });
}
sourceFiles.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
const sourceManifest = JSON.stringify({
  schema: "io.rootlens.source-manifest.v1",
  unit_id: unitId,
  files: sourceFiles,
});
const sourceManifestSha256 = createHash("sha256").update(sourceManifest).digest("hex");
console.log(`validated source manifest: ${sourceManifestSha256}`);

const r2 = new S3Client({
  region: "auto",
  endpoint,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const awsEnvironment = {
  ...process.env,
  AWS_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
  AWS_DEFAULT_REGION: "auto",
  AWS_REGION: "auto",
};

for (const [name, contentType] of uploadFiles) {
  const localPath = join(clipDirectory, name);
  const key = `raw/${unitId}/${name}`;
  const size = statSync(localPath).size;
  const sha256 = sourceFiles.find((file) => file.name === name).sha256;
  console.log(`uploading ${name} (${size} bytes) -> s3://${bucket}/${key}`);

  const result = spawnSync(
    "aws",
    [
      "s3",
      "cp",
      localPath,
      `s3://${bucket}/${key}`,
      "--endpoint-url",
      endpoint,
      "--content-type",
      contentType,
      "--metadata",
      `sha256=${sha256},source-manifest-sha256=${sourceManifestSha256}`,
      "--only-show-errors",
      "--no-progress",
    ],
    { env: awsEnvironment, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );

  if (result.status !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || `exit status ${result.status}`;
    throw new Error(`upload failed for ${name}: ${detail}`);
  }

  const head = await r2.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  if (head.ContentLength !== size) {
    throw new Error(`R2 size mismatch for ${name}: local=${size}, remote=${head.ContentLength}`);
  }
  if (head.ContentType !== contentType) {
    throw new Error(`R2 content type mismatch for ${name}: expected=${contentType}, remote=${head.ContentType}`);
  }
  if (head.Metadata?.sha256 !== sha256 || head.Metadata?.["source-manifest-sha256"] !== sourceManifestSha256) {
    throw new Error(`R2 integrity metadata mismatch for ${name}`);
  }
  console.log(`verified ${name}: ${head.ContentLength} bytes, ${head.ContentType}`);
}

console.log(`upload complete: s3://${bucket}/raw/${unitId}/`);
