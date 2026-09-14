#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sortedFiles(files) {
  return [...files].sort((a, b) => a.path.localeCompare(b.path));
}

function safeDeliveryPath(root, relativePath) {
  assert(typeof relativePath === "string" && relativePath.length > 0, "納品ファイルのパスが不正です");
  assert(!path.isAbsolute(relativePath) && !relativePath.split(/[\\/]/).includes(".."),
    `納品ディレクトリ外のパスです: ${relativePath}`);
  const resolved = path.resolve(root, relativePath);
  assert(resolved.startsWith(`${path.resolve(root)}${path.sep}`), `納品ディレクトリ外のパスです: ${relativePath}`);
  return resolved;
}

function sourceManifest(unitId, files) {
  return {
    schema: "io.rootlens.source-manifest.v1",
    unit_id: unitId,
    files: [...files].sort((a, b) => a.name.localeCompare(b.name))
      .map(({ name, bytes, sha256: digest }) => ({ name, bytes, sha256: digest })),
  };
}

function consentSnapshot(evidence) {
  const record = (value, kind) => ({
    record_id: value.record_id,
    kind,
    document_version: value.document_version,
    template_sha256: value.template_sha256,
    signed_pdf_sha256: value.signed_pdf_sha256,
    authentication_method: value.authentication_method,
    signed_at: value.signed_at,
    status: value.status_at_approval,
  });
  return [
    record(evidence.agreements.site, "site_agreement"),
    ...evidence.agreements.staff_consent_snapshot.records
      .map((value) => record(value, "staff_consent")),
  ].sort((a, b) => a.record_id.localeCompare(b.record_id));
}

async function verifyEvidence(evidencePath) {
  const absoluteEvidencePath = path.resolve(evidencePath);
  const directory = path.dirname(absoluteEvidencePath);
  const evidence = JSON.parse(await readFile(absoluteEvidencePath, "utf8"));
  assert(evidence.schema === "io.rootlens.evidence.v1", "未対応の証跡形式です");

  const deliveryFiles = sortedFiles(evidence.delivery.files);
  assert(new Set(deliveryFiles.map((file) => file.path)).size === deliveryFiles.length,
    "納品ファイルのパスが重複しています");
  for (const file of deliveryFiles) {
    const filename = safeDeliveryPath(directory, file.path);
    const info = await stat(filename);
    assert(info.isFile() && info.size === file.size, `納品ファイルのサイズが一致しません: ${file.path}`);
    assert(sha256(await readFile(filename)) === file.sha256, `納品ファイルが変更されています: ${file.path}`);
  }
  assert(sha256(canonicalJson({ unit_id: evidence.source.unit_id, files: deliveryFiles }))
    === evidence.delivery.delivery_manifest_sha256, "納品manifestのSHA-256が一致しません");

  const approval = evidence.approval;
  const receipt = { ...approval };
  delete receipt.receipt_sha256;
  assert(sha256(canonicalJson(receipt)) === approval.receipt_sha256, "承認receiptが変更されています");
  assert(sha256(canonicalJson(approval.signed_payload)) === approval.signed_payload_sha256,
    "承認payloadが変更されています");
  assert(approval.signature_method === "sms_authenticated_clickwrap"
    && approval.signer.authentication_method === "sms_otp"
    && approval.signer.person_id === approval.signed_payload.person_id,
  "SMS認証済みの承認者と承認対象が一致しません");

  const sourceFiles = approval.signed_payload.source_files;
  assert(approval.signed_payload.unit_id === evidence.source.unit_id
    && approval.signed_payload.site_id === evidence.source.site_id
    && approval.signed_payload.source_manifest_sha256 === evidence.source.source_manifest_sha256,
  "承認対象とraw記録が一致しません");
  assert(canonicalJson(sourceFiles.map(({ name, bytes, sha256: digest }) => ({
    path: name, size: bytes, sha256: digest,
  })).sort((a, b) => a.path.localeCompare(b.path))) === canonicalJson(sortedFiles(evidence.source.files)),
  "承認対象のrawファイル一覧が一致しません");
  assert(sha256(JSON.stringify(sourceManifest(evidence.source.unit_id, sourceFiles)))
    === evidence.source.source_manifest_sha256, "raw manifestのSHA-256が一致しません");

  const snapshot = consentSnapshot(evidence);
  assert(sha256(canonicalJson(snapshot)) === evidence.agreements.staff_consent_snapshot.snapshot_sha256
    && evidence.agreements.staff_consent_snapshot.snapshot_sha256
      === approval.signed_payload.consent_snapshot_sha256
    && evidence.agreements.staff_consent_snapshot.snapshot_id
      === approval.signed_payload.consent_snapshot_id,
  "同意スナップショットと承認対象が一致しません");

  return evidence;
}

function argumentsFrom(argv) {
  assert(argv.length === 1, "使い方: npm run verify:evidence -- <納品ディレクトリ|rootlens-evidence.json>");
  const target = argv[0];
  const resolved = path.resolve(target);
  return {
    evidencePath: path.extname(resolved).toLowerCase() === ".json"
      ? resolved : path.join(resolved, "rootlens-evidence.json"),
  };
}

try {
  const options = argumentsFrom(process.argv.slice(2));
  const evidence = await verifyEvidence(options.evidencePath);
  console.log(`検証完了: ${evidence.evidence_id}`);
  console.log(`撮影単位: ${evidence.source.unit_id}`);
  console.log(`納品ファイル: ${evidence.delivery.files.length}件`);
} catch (error) {
  console.error(error instanceof Error ? error.message : "証跡を検証できませんでした");
  process.exitCode = 1;
}
