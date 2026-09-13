import {
  pgTable, text, integer, bigint, timestamp, index, uniqueIndex, jsonb, uuid, boolean,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// v0.1.4の撮影APIは clips / upload_units / consent_events / accounts を使う。
// 現場の署名・承認フローは organizations 以下のテーブルで、協力先所有のDriveにある原本と
// RootLensが保持する索引、Desktopの所属、撮影ロットの承認、納品証跡を結び付ける。
// 銀行口座や署名済み文書の本体はこのDBに保存しない。

export const clips = pgTable(
  "clips",
  {
    // ── 識別・所有 ───────────────────────────────────────────────────
    /// 撮影単位の不透明な識別子。R2 raw キーと1:1 (= raw/<unit_id>/*)。
    unitId: text("unit_id").primaryKey(),

    /// 撮影アカウント (= auth.users.id)。 検証済み JWT の sub からのみ書かれる。
    accountId: uuid("account_id").notNull(),

    /// このクリップのアップロード同意イベント (= consent_events.id)。 クリップ ⇔ 同意証跡の結合。
    consentEventId: text("consent_event_id"),

    /// 行作成時刻 (= 登録 ≒ アップロード完了時刻)。
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),

    /// 録画開始時刻。unit_id発行時に固定し、created_atとは別に持つ。
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),

    // ── 撮影ファクト (端末申告) ───────────────────────────────────────
    /// 採用された撮影構成 ID (= 'ultra_wide' | 'arkit' | 'iphone')。
    recordingConfig: text("recording_config").notNull(),

    /// 録画尺 (ms)。 端末申告。 現場 × 月の録画時間集計 (= 撮影協力費の明細) の元。
    durationMs: integer("duration_ms"),

    /// rgb.mp4 (= raw、 blur 無し) のバイト数。
    videoBytes: bigint("video_bytes", { mode: "number" }).notNull(),

    /// 送信対象となった全rawファイルの完全性。ファイル名順に正規化した
    /// source manifestのSHA-256と、そのファイル一覧を保存する。
    sourceManifestSha256: text("source_manifest_sha256").notNull(),
    sourceFiles: jsonb("source_files").notNull(),

    /// 撮影端末の機種 (= utsname machine、 例 "iPhone15,2")。 来歴用。
    deviceModel: text("device_model"),
  },
  (t) => [
    // GET /api/clips (= account 別一覧) と明細集計 (account × 月) 用。
    index("clips_account_id_idx").on(t.accountId),
  ],
);

export type Clip = typeof clips.$inferSelect;
export type NewClip = typeof clips.$inferInsert;

/// Upload reservation created when the server issues a unit id. It prevents a
/// caller from obtaining R2 write URLs for another account's recording unit.
export const uploadUnits = pgTable(
  "upload_units",
  {
    unitId: text("unit_id").primaryKey(),
    accountId: uuid("account_id").notNull(),
    recordingConfig: text("recording_config").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("upload_units_account_id_idx").on(t.accountId),
    index("upload_units_created_at_idx").on(t.createdAt),
  ],
);

export type UploadUnit = typeof uploadUnits.$inferSelect;

/// 撮影アカウントの現場属性 (= 納品 manifest の domain / site の正)。 id は auth.users.id。
/// site は "bakery-01" のような匿名コードのみ (実世界との対応は台帳側に置く)。
/// 行が無いアカウント (テスト端末など) のクリップは納品パイプラインが実行前に拒否する。
export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey(),
  domain: text("domain").notNull(),
  site: text("site").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Account = typeof accounts.$inferSelect;

/// 同意イベントログ (= document/legal/consent-log-spec/ja.md が正典。
/// task 13 での差分: subject の識別子を pubkey から account_id (uuid) に置換)。
///
/// append-only: 同意・再同意・撤回のたびに 1 行追記する。 UPDATE / DELETE は行わない
/// (= 同意の有効性を後から立証する証跡。 撤回も event_type='withdrawal' の追記で表現)。
/// 層化同意の証跡として、 同意対象の正本 (doc) と画面に見せた要約 (summary) の
/// 両方の版 + SHA-256 を残す。
export const consentEvents = pgTable(
  "consent_events",
  {
    /// evt_<uuid> (= server 生成)
    id: text("id").primaryKey(),
    /// 'consent' | 'reconsent' | 'withdrawal'
    eventType: text("event_type").notNull(),
    /// 同意者のアカウント (= auth.users.id。 検証済み JWT の sub)
    accountId: uuid("account_id").notNull(),
    /// 端末申告の同意時刻 (UTC)
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),

    /// 同意対象の正本 (= 'terms-of-service' 等)
    docSlug: text("doc_slug").notNull(),
    docVersion: text("doc_version").notNull(),
    /// 正本全文 (raw md) の SHA-256 hex
    docSha256: text("doc_sha256").notNull(),
    /// 画面に表示した層1要約の版
    summaryVersion: text("summary_version").notNull(),
    /// 表示した要約文言 (locale 別) の SHA-256 hex
    summarySha256: text("summary_sha256").notNull(),

    /// 同意スコープ (= ['collection','ai_training_use','license_sale','cross_border'])
    scopes: jsonb("scopes").notNull(),
    /// 各チェック項目の真偽 (= { location_permission, no_third_party, terms_agreed })
    checkboxResults: jsonb("checkbox_results").notNull(),

    /// 表示言語 ('ja' | 'en')
    locale: text("locale").notNull(),
    /// 取得方式 (= 'clickwrap')
    consentMethod: text("consent_method").notNull(),
    appVersion: text("app_version"),
    device: text("device"),
    /// 相関情報 (= 対象クリップの local id / 撮影時刻 等。 個人データは入れない)
    context: jsonb("context"),

    /// server 受領時刻
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("consent_events_account_idx").on(t.accountId),
    index("consent_events_occurred_idx").on(t.occurredAt),
  ],
);

export type ConsentEvent = typeof consentEvents.$inferSelect;
export type NewConsentEvent = typeof consentEvents.$inferInsert;

export const organizations = pgTable("organizations", {
  id: text("id").primaryKey(),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sites = pgTable("sites", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  name: text("name").notNull(),
  sharedDriveId: text("shared_drive_id").notNull(),
  rootFolderId: text("root_folder_id").notNull(),
  siteAgreementsFolderId: text("site_agreements_folder_id").notNull(),
  staffConsentsFolderId: text("staff_consents_folder_id").notNull(),
  approvedDataFolderId: text("approved_data_folder_id").notNull(),
  status: text("status").notNull().default("pending_agreement"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const people = pgTable("people", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  siteId: text("site_id").notNull().references(() => sites.id),
  role: text("role").notNull(),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("people_site_idx").on(table.siteId)]);

export const agreementRecords = pgTable("agreement_records", {
  id: text("id").primaryKey(),
  siteId: text("site_id").notNull().references(() => sites.id),
  personId: text("person_id").references(() => people.id),
  kind: text("kind").notNull(),
  documentVersion: text("document_version").notNull(),
  templateSha256: text("template_sha256").notNull(),
  docusealSubmissionId: bigint("docuseal_submission_id", { mode: "number" }).notNull(),
  signedPdfFileId: text("signed_pdf_file_id"),
  signedPdfSha256: text("signed_pdf_sha256"),
  certificateFileId: text("certificate_file_id"),
  certificateSha256: text("certificate_sha256"),
  signedAt: timestamp("signed_at", { withTimezone: true }),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("agreement_docuseal_submission_idx").on(table.docusealSubmissionId),
  index("agreement_site_kind_status_idx").on(table.siteId, table.kind, table.status),
  uniqueIndex("agreement_active_site_idx").on(table.siteId)
    .where(sql`${table.kind} = 'site_agreement' AND ${table.status} = 'active'`),
  uniqueIndex("agreement_active_staff_idx").on(table.personId)
    .where(sql`${table.kind} = 'staff_consent' AND ${table.status} = 'active'`),
]);

export const driveConnections = pgTable("drive_connections", {
  siteId: text("site_id").primaryKey().references(() => sites.id),
  encryptedRefreshToken: text("encrypted_refresh_token").notNull(),
  googleAccountSubject: text("google_account_subject").notNull(),
  connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
});

export const driveOAuthRequests = pgTable("drive_oauth_requests", {
  id: text("id").primaryKey(),
  siteId: text("site_id").notNull().references(() => sites.id),
  stateSha256: text("state_sha256").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const operatorInvites = pgTable("operator_invites", {
  id: text("id").primaryKey(),
  personId: text("person_id").notNull().references(() => people.id),
  emailSha256: text("email_sha256").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("operator_invites_email_idx").on(table.emailSha256)]);

export const operatorIdentities = pgTable("operator_identities", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  providerSubject: text("provider_subject").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("operator_identity_provider_idx").on(table.provider, table.providerSubject)]);

export const operatorMemberships = pgTable("operator_memberships", {
  identityId: text("identity_id").notNull().references(() => operatorIdentities.id),
  personId: text("person_id").notNull().references(() => people.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("operator_membership_identity_person_idx").on(table.identityId, table.personId),
  uniqueIndex("operator_membership_person_idx").on(table.personId),
]);

export const desktopLoginRequests = pgTable("desktop_login_requests", {
  id: text("id").primaryKey(),
  stateSha256: text("state_sha256").notNull().unique(),
  clientState: text("client_state").notNull(),
  codeChallenge: text("code_challenge").notNull(),
  redirectUri: text("redirect_uri").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const desktopAuthorizationCodes = pgTable("desktop_authorization_codes", {
  id: text("id").primaryKey(),
  codeSha256: text("code_sha256").notNull().unique(),
  identityId: text("identity_id").notNull().references(() => operatorIdentities.id),
  codeChallenge: text("code_challenge").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const desktopSessions = pgTable("desktop_sessions", {
  id: text("id").primaryKey(),
  identityId: text("identity_id").notNull().references(() => operatorIdentities.id),
  tokenSha256: text("token_sha256").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("desktop_sessions_identity_idx").on(table.identityId)]);

export const driveUploadAttempts = pgTable("drive_upload_attempts", {
  id: text("id").primaryKey(),
  siteId: text("site_id").notNull().references(() => sites.id),
  personId: text("person_id").notNull().references(() => people.id),
  unitId: text("unit_id").notNull(),
  sourceManifestSha256: text("source_manifest_sha256").notNull(),
  approvalEventId: text("approval_event_id").notNull().unique().references(() => approvalEvents.id),
  folderId: text("folder_id").notNull(),
  status: text("status").notNull().default("uploading"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("drive_upload_site_unit_idx").on(table.siteId, table.unitId)]);

export const driveUploadFiles = pgTable("drive_upload_files", {
  id: text("id").primaryKey(),
  attemptId: text("attempt_id").notNull().references(() => driveUploadAttempts.id),
  path: text("path").notNull(),
  bytes: bigint("bytes", { mode: "number" }).notNull(),
  sha256: text("sha256").notNull(),
  driveFileId: text("drive_file_id").notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("drive_upload_file_path_idx").on(table.attemptId, table.path)]);

export const passkeyCredentials = pgTable("passkey_credentials", {
  id: text("id").primaryKey(),
  personId: text("person_id").notNull().references(() => people.id),
  publicKey: text("public_key").notNull(),
  counter: bigint("counter", { mode: "number" }).notNull().default(0),
  transports: jsonb("transports").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("passkey_person_idx").on(table.personId)]);

export const passkeyRegistrations = pgTable("passkey_registrations", {
  id: text("id").primaryKey(),
  tokenSha256: text("token_sha256").notNull().unique(),
  personId: text("person_id").notNull().references(() => people.id),
  challenge: text("challenge"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  completed: boolean("completed").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const consentSnapshots = pgTable("consent_snapshots", {
  id: text("id").primaryKey(),
  siteId: text("site_id").notNull().references(() => sites.id),
  snapshotSha256: text("snapshot_sha256").notNull(),
  records: jsonb("records").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const approvalSignatures = pgTable("approval_signatures", {
  id: text("id").primaryKey(),
  tokenSha256: text("token_sha256").notNull().unique(),
  siteId: text("site_id").notNull().references(() => sites.id),
  personId: text("person_id").notNull().references(() => people.id),
  unitId: text("unit_id").notNull(),
  sourceManifestSha256: text("source_manifest_sha256").notNull(),
  sourceFiles: jsonb("source_files").notNull(),
  consentSnapshotId: text("consent_snapshot_id").notNull().references(() => consentSnapshots.id),
  statementVersion: text("statement_version").notNull(),
  challenge: text("challenge"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  completed: boolean("completed").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("approval_signature_unit_idx").on(table.siteId, table.unitId)]);

export const approvalEvents = pgTable("approval_events", {
  id: text("id").primaryKey(),
  signatureId: text("signature_id").notNull().unique().references(() => approvalSignatures.id),
  siteId: text("site_id").notNull().references(() => sites.id),
  unitId: text("unit_id").notNull(),
  sourceManifestSha256: text("source_manifest_sha256").notNull(),
  personId: text("person_id").notNull().references(() => people.id),
  credentialId: text("credential_id").notNull().references(() => passkeyCredentials.id),
  signedPayloadSha256: text("signed_payload_sha256").notNull(),
  assertionSha256: text("assertion_sha256").notNull(),
  receipt: jsonb("receipt").notNull(),
  approvedAt: timestamp("approved_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("approval_event_site_unit_idx").on(table.siteId, table.unitId)]);

export const evidenceBundles = pgTable("evidence_bundles", {
  id: text("id").primaryKey(),
  uploadAttemptId: text("upload_attempt_id").notNull().references(() => driveUploadAttempts.id),
  approvalEventId: text("approval_event_id").notNull().references(() => approvalEvents.id),
  unitId: text("unit_id").notNull(),
  deliveryManifestSha256: text("delivery_manifest_sha256").notNull(),
  payloadSha256: text("payload_sha256").notNull(),
  algorithm: text("algorithm").notNull(),
  keyId: text("key_id").notNull(),
  signature: text("signature").notNull(),
  evidence: jsonb("evidence").notNull(),
  providedAt: timestamp("provided_at", { withTimezone: true }).notNull(),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("evidence_unit_idx").on(table.unitId),
  index("evidence_approval_idx").on(table.approvalEventId),
]);
