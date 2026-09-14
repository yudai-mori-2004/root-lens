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

function safePath(root, relativePath) {
  assert(typeof relativePath === "string" && relativePath.length > 0, "ファイルのパスが不正です");
  assert(!path.isAbsolute(relativePath) && !relativePath.split(/[\\/]/).includes(".."),
    `証跡一式の外を参照しています: ${relativePath}`);
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relativePath);
  assert(resolved.startsWith(`${resolvedRoot}${path.sep}`), `証跡一式の外を参照しています: ${relativePath}`);
  return resolved;
}

function agreementRecord(value, kind) {
  return {
    record_id: value.record_id,
    kind,
    document_version: value.document_version,
    template_sha256: value.template_sha256,
    signed_pdf_sha256: value.signed_pdf_sha256,
    authentication_method: value.authentication_method,
    signed_at: value.signed_at,
  };
}

async function verifyFile(root, file, expectedBytes) {
  const filename = safePath(root, file.path);
  const info = await stat(filename);
  assert(info.isFile() && (expectedBytes === undefined || info.size === expectedBytes),
    `ファイルのサイズが一致しません: ${file.path}`);
  assert(sha256(await readFile(filename)) === file.sha256, `ファイルが変更されています: ${file.path}`);
}

async function verifyEvidence(evidencePath) {
  const absoluteEvidencePath = path.resolve(evidencePath);
  const root = path.dirname(absoluteEvidencePath);
  const evidence = JSON.parse(await readFile(absoluteEvidencePath, "utf8"));
  assert(evidence.schema === "io.rootlens.evidence.v2", "未対応の証跡形式です");

  const files = [...evidence.unit.files].sort((a, b) => a.path.localeCompare(b.path));
  assert(files.length > 0 && new Set(files.map((file) => file.path)).size === files.length,
    "承認対象ファイルの一覧が不正です");
  for (const file of files) await verifyFile(root, file, file.bytes);
  assert(sha256(canonicalJson({ unit_id: evidence.unit.unit_id, files })) === evidence.unit.files_sha256,
    "承認対象ファイル一式のSHA-256が一致しません");

  const site = evidence.agreements.site;
  const staff = evidence.agreements.staff;
  await verifyFile(root, { path: site.path, sha256: site.signed_pdf_sha256 });
  for (const record of staff.records) {
    await verifyFile(root, { path: record.path, sha256: record.signed_pdf_sha256 });
  }
  const snapshot = [agreementRecord(site, "site_agreement"),
    ...staff.records.map((record) => agreementRecord(record, "staff_consent"))]
    .sort((a, b) => a.record_id.localeCompare(b.record_id));
  assert(sha256(canonicalJson(snapshot)) === staff.snapshot_sha256,
    "同意記録の集合が変更されています");

  const approval = evidence.approval;
  const approvalRecord = { ...approval };
  delete approvalRecord.approval_record_sha256;
  assert(sha256(canonicalJson(approvalRecord)) === approval.approval_record_sha256,
    "承認記録が変更されています");
  assert(sha256(canonicalJson(approval.approval_subject)) === approval.approval_subject_sha256,
    "承認対象が変更されています");
  assert(approval.approval_method === "sms_authenticated_clickwrap"
    && approval.approver.authentication_method === "sms_otp"
    && approval.approver.person_id === approval.approval_subject.person_id,
  "SMS認証済みの承認者と承認対象が一致しません");
  assert(approval.approval_subject.unit_id === evidence.unit.unit_id
    && approval.approval_subject.site_id === evidence.unit.site_id
    && approval.approval_subject.files_sha256 === evidence.unit.files_sha256
    && approval.approval_subject.consent_snapshot_id === staff.snapshot_id
    && approval.approval_subject.consent_snapshot_sha256 === staff.snapshot_sha256,
  "承認対象と証跡の内容が一致しません");
  return evidence;
}

function evidencePathFrom(argv) {
  assert(argv.length === 1, "使い方: npm run verify:evidence -- <証跡ディレクトリ|rootlens-evidence.json>");
  const target = path.resolve(argv[0]);
  return path.extname(target).toLowerCase() === ".json" ? target : path.join(target, "rootlens-evidence.json");
}

try {
  const evidence = await verifyEvidence(evidencePathFrom(process.argv.slice(2)));
  console.log(`検証完了: ${evidence.evidence_id}`);
  console.log(`撮影単位: ${evidence.unit.unit_id}`);
  console.log(`承認対象ファイル: ${evidence.unit.files.length}件`);
} catch (error) {
  console.error(error instanceof Error ? error.message : "証跡を検証できませんでした");
  process.exitCode = 1;
}
