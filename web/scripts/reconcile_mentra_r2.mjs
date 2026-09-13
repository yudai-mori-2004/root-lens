// Compare Mentra DB rows with complete R2 raw prefixes.
// Dry-run is the default. --execute removes only stale DB rows; it never deletes R2 data.
import { config } from "dotenv";
import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import postgres from "postgres";

config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

const execute = process.argv.includes("--execute");
const requiredEnvironment = [
  "DATABASE_URL",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
];
for (const name of requiredEnvironment) {
  if (!process.env[name]) throw new Error(`missing required environment variable: ${name}`);
}

const bucket = process.env.R2_BUCKET_RAW_MENTRA ?? "rootlens-raw-mentra";
if (execute && bucket !== "rootlens-raw-mentra") {
  throw new Error(`refusing unexpected production bucket: ${bucket}`);
}

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});
const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
const requiredFiles = new Set(["frames.jsonl", "imu.jsonl", "metadata.json", "rgb.mp4"]);
const keyPattern = /^raw\/(unit_[a-z0-9][a-z0-9_-]{0,63}_\d{8}T\d{9}Z_[0-9A-HJKMNP-TV-Z]{8})\/([^/]+)$/;

async function listR2Prefixes() {
  const filesByUnit = new Map();
  let continuationToken;
  do {
    const page = await r2.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: "raw/",
      ContinuationToken: continuationToken,
    }));
    for (const object of page.Contents ?? []) {
      const match = object.Key?.match(keyPattern);
      if (!match) continue;
      const files = filesByUnit.get(match[1]) ?? new Set();
      files.add(match[2]);
      filesByUnit.set(match[1], files);
    }
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);
  return filesByUnit;
}

try {
  const [filesByUnit, rows] = await Promise.all([
    listR2Prefixes(),
    sql`
      select unit_id, created_at, video_bytes
      from clips
      where recording_config = 'mentra'
      order by created_at asc
    `,
  ]);

  const completeR2 = new Set();
  const partialR2 = [];
  for (const [unitId, files] of filesByUnit) {
    const missing = [...requiredFiles].filter((name) => !files.has(name));
    if (missing.length === 0) completeR2.add(unitId);
    else partialR2.push({ unitId, files: [...files].sort(), missing });
  }

  const dbUnitIds = new Set(rows.map((row) => row.unit_id));
  const staleDb = rows
    .filter((row) => !completeR2.has(row.unit_id))
    .map((row) => ({
      unitId: row.unit_id,
      createdAt: row.created_at,
      videoBytes: Number(row.video_bytes ?? 0),
      r2Files: [...(filesByUnit.get(row.unit_id) ?? [])].sort(),
    }));
  const r2WithoutDb = [...completeR2].filter((unitId) => !dbUnitIds.has(unitId)).sort();

  console.log(JSON.stringify({
    mode: execute ? "execute" : "dry-run",
    bucket,
    dbMentraRows: rows.length,
    completeR2Prefixes: completeR2.size,
    staleDbRows: staleDb,
    partialR2Prefixes: partialR2,
    completeR2WithoutDb: r2WithoutDb,
  }, null, 2));

  if (execute && staleDb.length > 0) {
    const deleted = [];
    await sql.begin(async (transaction) => {
      for (const { unitId } of staleDb) {
        const result = await transaction`
          delete from clips
          where unit_id = ${unitId} and recording_config = 'mentra'
          returning unit_id
        `;
        if (result[0]?.unit_id) deleted.push(result[0].unit_id);
      }
    });
    if (deleted.length !== staleDb.length) {
      throw new Error(`DB reconciliation mismatch: expected ${staleDb.length}, deleted ${deleted.length}`);
    }
    console.log(JSON.stringify({ verified: true, deletedStaleDbRows: deleted }, null, 2));
  }
} finally {
  await sql.end();
}
