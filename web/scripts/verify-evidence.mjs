#!/usr/bin/env node

import { createHash, verify as verifySignature } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";

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
    certificate_sha256: value.signature_certificate_sha256,
    signed_at: value.signed_at,
    status: value.status_at_approval,
  });
  return [
    record(evidence.agreements.site, "site_agreement"),
    ...evidence.agreements.staff_consent_snapshot.records
      .map((value) => record(value, "staff_consent")),
  ].sort((a, b) => a.record_id.localeCompare(b.record_id));
}

async function publicKeyFor(evidence, suppliedPath) {
  if (suppliedPath) return readFile(suppliedPath, "utf8");
  const verificationUrl = new URL(evidence.verification.url);
  const keyUrl = new URL(`/api/v1/evidence-keys/${encodeURIComponent(evidence.attestation.key_id)}`,
    verificationUrl.origin);
  const response = await fetch(keyUrl, { redirect: "error" });
  assert(response.ok, `検証用公開鍵を取得できませんでした (${response.status})`);
  const body = await response.json();
  assert(body.id === evidence.attestation.key_id && body.algorithm === "ECDSA_P256_SHA256"
    && typeof body.publicKey === "string", "検証用公開鍵の応答が証跡と一致しません");
  return body.publicKey;
}

async function verifyEvidence(evidencePath, suppliedPublicKeyPath) {
  const absoluteEvidencePath = path.resolve(evidencePath);
  const directory = path.dirname(absoluteEvidencePath);
  const evidence = JSON.parse(await readFile(absoluteEvidencePath, "utf8"));
  assert(evidence.schema === "io.rootlens.evidence.v1", "未対応の証跡形式です");
  assert(evidence.attestation?.algorithm === "ECDSA_P256_SHA256", "未対応の証跡署名です");

  const payload = { ...evidence };
  delete payload.attestation;
  const canonicalPayload = canonicalJson(payload);
  assert(sha256(canonicalPayload) === evidence.attestation.payload_sha256,
    "証跡payloadのSHA-256が一致しません");
  const publicKey = await publicKeyFor(evidence, suppliedPublicKeyPath);
  assert(verifySignature("sha256", Buffer.from(canonicalPayload), publicKey,
    Buffer.from(evidence.attestation.signature, "base64url")), "RootLensの証跡署名を検証できません");

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
  assert(Buffer.from(approval.signed_payload_sha256, "hex").toString("base64url")
    === approval.webauthn.challenge, "承認payloadとWebAuthn challengeが一致しません");
  assert(sha256(canonicalJson(approval.webauthn.assertion)) === approval.webauthn.assertion_sha256,
    "WebAuthn assertionが変更されています");

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

  const webauthn = await verifyAuthenticationResponse({
    response: approval.webauthn.assertion,
    expectedChallenge: approval.webauthn.challenge,
    expectedOrigin: approval.webauthn.origin,
    expectedRPID: approval.webauthn.rp_id,
    requireUserVerification: true,
    credential: {
      id: approval.webauthn.credential_id,
      publicKey: Buffer.from(approval.webauthn.credential_public_key, "base64url"),
      counter: approval.webauthn.credential_counter_before,
    },
  });
  assert(webauthn.verified
    && webauthn.authenticationInfo.newCounter === approval.webauthn.credential_counter_after,
  "現場監督者のパスキー署名を検証できません");
  return evidence;
}

function argumentsFrom(argv) {
  let target;
  let publicKey;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--public-key") {
      publicKey = argv[index + 1];
      index += 1;
    } else if (!target) {
      target = argv[index];
    } else {
      throw new Error(`不明な引数です: ${argv[index]}`);
    }
  }
  assert(target, "使い方: npm run verify:evidence -- <納品ディレクトリ|rootlens-evidence.json> [--public-key 公開鍵.pem]");
  const resolved = path.resolve(target);
  return {
    evidencePath: path.extname(resolved).toLowerCase() === ".json"
      ? resolved : path.join(resolved, "rootlens-evidence.json"),
    publicKeyPath: publicKey ? path.resolve(publicKey) : undefined,
  };
}

try {
  const options = argumentsFrom(process.argv.slice(2));
  const evidence = await verifyEvidence(options.evidencePath, options.publicKeyPath);
  console.log(`検証完了: ${evidence.evidence_id}`);
  console.log(`撮影単位: ${evidence.source.unit_id}`);
  console.log(`納品ファイル: ${evidence.delivery.files.length}件`);
} catch (error) {
  console.error(error instanceof Error ? error.message : "証跡を検証できませんでした");
  process.exitCode = 1;
}
