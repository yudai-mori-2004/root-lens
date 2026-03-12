# Task 06: TEE署名 + PKI構築 + サーバー + 公開ページ

## 目的

現在の自己署名証明書によるC2PA署名を、仕様書 §4 に基づく本番アーキテクチャに置き換える。
デバイスTEE内で署名鍵を生成し、サーバーがRoot CAとしてDevice Certificateを発行し、二層PKIチェーンによる本物証明を実現する。
公開ページ（rootlens.io）をデプロイし、閲覧者が証明書チェーンを検証できるようにする。

**仕様変更**: Device Certificateの有効期限を9999年から90日に変更し、短寿命証明書 + RFC 3161タイムスタンプ + CRLによるセキュリティモデルを採用する（§4.3.2, §4.5.3, §4.7 の更新が必要）。

## 仕様書参照

- §4.1 信頼モデル
- §4.2 暗号アルゴリズム（ES256）
- §4.3 PKI構造（Root CA + Device Certificate）— **有効期限を90日に変更**
- §4.4 証明書発行フロー — **再Attestation（証明書更新）フローを追加**
- §4.5 C2PAマニフェスト（COSE Sign1 + x5chain）— **RFC 3161タイムスタンプ必須化**
- §4.6 C2PA SDK統合（Signerトレイト → TEEコールバック）
- §4.7 鍵ライフサイクル管理 — **証明書更新 + CRL追加**
- §7 公開ページ（証明書チェーン検証 + CRLチェック）

## 参考資料

- `RATIONALE.md` — C2PAデバイス署名アプローチの業界調査と根拠

## 実装内容

### Phase 1: Root CA構築

#### 1a. Dev Root CA（ローカル開発用）
- opensslでP-256鍵ペア + 自己署名Root CA証明書を生成するスクリプト
- 仕様書 §4.3.1 のプロファイルに準拠（`pathLenConstraint:0`, `keyCertSign`）
- 出力: `certs/dev/root-ca.pem`, `certs/dev/root-ca-key.pem`
- **dev環境専用**: 本番ではAWS KMSに移行

#### 1b. Device Certificate発行スクリプト（開発用）
- CSRを受け取り、Dev Root CAで署名してDevice Certificateを生成
- §4.3.2 のプロファイルに準拠（`CA:FALSE`, `digitalSignature`, `id-kp-documentSigning`）
- **有効期限: 発行日 + 90日**（仕様変更: 旧仕様の9999年から変更）
- サーバーAPI完成前のローカルテスト用

### Phase 2: サーバー構築（Next.js API Routes）

#### 2a. プロジェクトセットアップ
- `server/` ディレクトリにNext.jsプロジェクト作成
- TypeScript + App Router

#### 2b. 証明書発行API
```
POST /api/v1/device-certificate
Content-Type: application/json
Body: { platform, csr, attestation }
```

サーバー側検証ロジック（§4.4.2）:

**Android**:
1. CSR署名検証（Proof of Possession）
2. Key Attestation チェーン検証（Google Root CAまで）
3. Attestation Extension解析:
   - `attestationSecurityLevel >= TRUSTED_ENVIRONMENT(1)`
   - `purpose` に `SIGN(2)` を含む
   - `attestationChallenge == SHA-256(CSR)`
   - パッケージ名一致
4. Play Integrity Token検証

**iOS**:
1. CSR署名検証
2. App Attest CBOR解析・証明書チェーン検証（Apple Root CAまで）
3. `rpIdHash`、`counter`、`aaguid`、`clientDataHash` 検証

**Dev Mode**: Platform Attestation検証をスキップするフラグ（実機テスト初期段階用）

#### 2c. Root CA鍵管理
- Dev環境: ファイルシステムから読み込み
- Prod環境: AWS KMS Sign API呼び出し（将来実装）

#### 2d. CRL（証明書失効リスト）エンドポイント
```
GET /api/v1/crl
```
- 失効したDevice CertificateのシリアルナンバーリストをDER形式で返却
- サーバー管理画面またはCLIで失効操作
- 公開ページの検証時にフェッチ
- Dev環境: 空リストを返却

#### 2e. 証明書更新API
```
POST /api/v1/device-certificate/renew
```
- 既存のDevice Certificateの有効期限が近い（残り14日以内）場合に呼び出し
- 同じTEE鍵のCSR + 新しいPlatform Attestationで再検証
- 新しい90日証明書を発行（同じ公開鍵、新しいシリアルナンバー）
- 旧証明書は失効させない（旧証明書で署名済みコンテンツの検証継続のため）

### Phase 3: ネイティブモジュールTEE統合

#### 3a. TEE鍵生成 + CSR作成
`generateDeviceCredentials()` の実装:

**Android (Kotlin)**:
- `KeyGenParameterSpec` で `secp256r1` + `setIsStrongBoxBacked(true)`（フォールバック: TEE）
- BouncyCastle `PKCS10CertificationRequestBuilder` でCSR作成
- Android Key Attestation実行（`setAttestationChallenge(SHA256(csrDer))`）
- Play Integrity API トークン取得

**iOS (Swift)**:
- `kSecAttrKeyTypeECSECPrimeRandom` + `kSecAttrKeySizeInBits: 256` + Secure Enclave
- ASN.1手組みまたは軽量ライブラリでCSR作成
- `DCAppAttestService.attestKey` 実行（`clientDataHash = SHA256(csrDer)`）

返り値: `{ csr: Base64, attestation: {...}, platform: "android"|"ios" }`

#### 3b. 証明書保存・取得・更新
- `storeDeviceCertificate(cert, rootCa)`: DERバイナリをKeychain/KeyStoreに保存
- `hasDeviceCertificate()`: 有効な証明書の存在確認
- `getDeviceCertificateExpiry()`: 有効期限を返す（更新判定用）
- 初回起動フロー: TEE鍵生成 → CSR作成 → サーバーに送信 → 証明書受領・保存
- 更新フロー: 残り14日以内 → 同じ鍵でCSR再作成 → 再Attestation → renew API → 新証明書保存

#### 3c. c2pa-rs Signerトレイト → TEEコールバック
現在のc2pa-rs署名はdev証明書の秘密鍵を直接使用している。これを:
1. c2pa-rsのSignerトレイトのカスタム実装を作成
2. 署名コールバック内で、FFI経由でネイティブモジュールを呼び出し
3. ネイティブモジュールがTEE API（Android KeyStore / iOS SecKey）でECDSA P-256署名を実行
4. 署名結果をc2pa-rsに返却
5. x5chainにDevice Certificate + Root CA Certificateを設定

### Phase 4: RFC 3161タイムスタンプ（TSA）

#### 4a. TSA連携（c2pa-rs）
- C2PA署名時にRFC 3161タイムスタンプを取得
- TSA: DigiCert等の既存の信頼されたTSAサービスを使用（自前構築しない）
- c2pa-rsの `TimeStampProvider` トレイトを実装
- COSE unprotectedヘッダーの `sigTst2` に添付

#### 4b. オフライン時の挙動
- ネットワーク未接続時: タイムスタンプなしで署名を実行
- タイムスタンプなしの署名は、90日の証明書有効期限内は検証可能
- 有効期限後はタイムスタンプがないため検証不可 → ユーザーにオフライン署名の制限を通知
- Title Protocol登録時（オンライン必須）にブロックチェーンタイムスタンプが代替となる（§4.5.3）

#### 4c. タイムスタンプと証明書有効期限の関係
```
署名時点: 2026-03-12
証明書有効期限: 2026-06-10（90日後）
タイムスタンプ: 2026-03-12 (DigiCert TSA)

検証時点: 2027-01-01（証明書は期限切れ）
→ タイムスタンプが「署名は2026-03-12に行われた」ことを証明
→ 2026-03-12時点で証明書は有効だった → 検証成功
```

### Phase 5: 公開ページ（rootlens.io）

#### 5a. 基本構造
- `server/` 内のNext.jsプロジェクトに公開ページを含める
- ルート: `/:shortId` でコンテンツページを表示
- OGP対応（SNS共有時のプレビュー）

#### 5b. クライアントサイドC2PA検証（§7.4の部分実装）
- C2PA JUMBFの読み取り・パース
- 証明書チェーン検証: Device Certificate → Root CA
- **CRLチェック**: サーバーの `/api/v1/crl` を参照し、失効証明書でないことを確認
- **タイムスタンプ検証**: RFC 3161タイムスタンプを検証し、署名時点で証明書が有効だったことを確認
- 署名の暗号検証（ES256）
- 結果の表示: 「Shot on RootLens」/ 「Shot on [Hardware]」
- **Phase 1では**: Title Protocol連携なしの単体検証。R2/Arweave連携は後続タスク

#### 5c. デプロイ
- Vercel（Next.js最適）またはCloudflare Pages
- rootlens.ioドメイン設定

### Phase 6: 起動フロー + 証明書更新の統合

#### 6a. 初回起動
- アプリ起動時に `hasDeviceCertificate()` を確認
- 未取得: バックグラウンドで `generateDeviceCredentials()` → サーバーAPI → `storeDeviceCertificate()`
- 取得済み: そのまま撮影可能
- 証明書取得失敗時: リトライ + ユーザーへの通知（「この端末では本物証明を利用できません」）
- ネットワーク未接続時: 撮影は許可するが署名はdev証明書で暫定署名（§10.2 オフライン対応）

#### 6b. 証明書自動更新
- アプリ起動時に `getDeviceCertificateExpiry()` を確認
- 残り14日以内: バックグラウンドで再Attestation → renew API → 新証明書保存
- 更新成功: 新証明書で以降の署名を実行
- 更新失敗: 現在の証明書が有効な間は引き続き使用。期限切れ後は撮影不可
- ユーザー通知: 更新失敗が続く場合のみ表示（通常はサイレント）

## スコープ外（後続タスク）

- AWS KMS本番Root CA構築（Dev Root CAで機能検証を優先）
- Title Protocol連携（cNFT登録、Solana/Arweave）
- Privy認証統合
- R2/Supabaseストレージ
- pHash検証
- Trustless TEE検証パイプライン（Phase 2アーキテクチャ）
- C2PA Trust List / Conformance Program参加

## ディレクトリ変更

### 新規
- `certs/dev/` — Dev Root CA証明書・鍵 + 生成スクリプト
- `server/` — Next.jsサーバー（証明書発行API + 公開ページ）
- `server/app/api/v1/device-certificate/route.ts` — 証明書発行エンドポイント
- `server/app/api/v1/device-certificate/renew/route.ts` — 証明書更新エンドポイント
- `server/app/api/v1/crl/route.ts` — CRLエンドポイント
- `server/app/[shortId]/page.tsx` — 公開ページ

### 変更（主要）
- `native/c2pa-bridge/src/lib.rs` — Signerトレイトカスタム実装（TEEコールバック）+ x5chain設定
- `app/android/.../C2paBridgeModule.kt` — TEE鍵生成 + CSR作成 + Key Attestation + TEE署名コールバック
- `app/modules/c2pa-bridge/ios/C2paBridgeModule.swift` — Secure Enclave鍵生成 + CSR + App Attest + TEE署名コールバック
- `app/src/native/c2paBridge.ts` — generateDeviceCredentials / storeDeviceCertificate / hasDeviceCertificate 追加
- `app/src/screens/` — 初回起動時の証明書取得フロー統合

## 完了条件

### PKI + TEE
- [x] Dev Root CA証明書が生成でき、§4.3.1プロファイルに準拠している
- [x] サーバーの証明書発行APIがCSRを受け取り、90日有効のDevice Certificateを発行する
- [x] Android実機でStrongBox/TEE内にP-256鍵が生成される
- [x] 生成された鍵でCSRが作成され、サーバーに送信される
- [x] サーバーから返却されたDevice CertificateがKeyStoreに保存される
- [x] C2PA署名がTEE内の秘密鍵で実行される（dev証明書の直接署名を置換）
- [x] 署名済みC2PAマニフェストのx5chainにDevice Certificate + Root CA Certificateが含まれる

### タイムスタンプ + CRL
- [x] C2PA署名にRFC 3161タイムスタンプが付与される（オンライン時）
- [x] CRLエンドポイントが失効証明書リストを返す
- [x] 証明書更新APIが新しい90日証明書を発行する

### 公開ページ
- [x] 公開ページでC2PA証明書チェーン + タイムスタンプ + CRLが検証・表示される
- [ ] rootlens.ioにデプロイされ、外部からアクセス可能（デプロイは後続タスク）

### アプリ統合
- [x] アプリ初回起動時にバックグラウンドで証明書取得が完了する
- [x] 証明書の残り有効期限が14日以内で自動更新が実行される

## 技術的メモ

### iOS Secure Enclaveの制約
- P-256（secp256r1）のみサポート — ES256が唯一のクロスプラットフォーム選択肢
- App Attestのレート制限あり — 初回 + 90日ごとの更新で十分収まる
- C2PA Assurance Level 2はAndroidのみ達成可能（iOSはLevel 1）

### CSR作成の実装選択肢
- **Android**: BouncyCastle `PKCS10CertificationRequestBuilder`（既にAndroidに含まれる）
- **iOS**: SwiftASN1ライブラリ、またはDER手組み（依存最小化）

### c2pa-rsのSignerトレイト
```rust
pub trait Signer: Send + Sync {
    fn sign(&self, data: &[u8]) -> Result<Vec<u8>>;
    fn alg(&self) -> SigningAlg;
    fn certs(&self) -> Result<Vec<Vec<u8>>>;
    fn reserve_size(&self) -> usize;
}
```
- `sign()`: ハッシュされた`data`をFFI経由でネイティブモジュールに渡し、TEEで署名
- `certs()`: Device Certificate + Root CA CertificateのDERバイナリを返す
- `alg()`: `SigningAlg::Es256`

### Platform Attestation検証のDev Modeについて
開発初期段階ではAttestation検証をスキップするdevフラグを設ける。理由:
1. Key Attestationの検証ロジック実装は複雑で、PKI基盤と独立にテスト可能
2. エミュレータでの開発時にAttestationが取得できない
3. 段階的にAttestationロジックを追加・テスト可能

本番リリース前に必ずdevフラグを無効化する。

### セキュリティモデル: 短寿命証明書 + TSA + CRL

仕様書 §4.3.2 の有効期限 `9999-12-31` を **90日** に変更する。

**変更の動機**: 永続証明書 + 失効メカニズムなしでは、Root化端末による不正署名が発覚しても対処不可能。

**3層の防御**:

| 層 | 機能 | 対処する脅威 |
|----|------|------------|
| CRL | 特定デバイスの証明書を即時失効 | 不正が発覚した個別デバイス |
| 短寿命証明書 (90日) | 定期的な再Attestationを強制 | 事後的にRoot化された端末 |
| RFC 3161タイムスタンプ | 署名時点の証明書有効性を証明 | 短寿命証明書による過去コンテンツの無効化を防止 |

**過去コンテンツの保護**: タイムスタンプにより「この署名は証明書有効期間内に行われた」ことが第三者（TSA）によって証明される。証明書が期限切れになっても、署名時に有効だった事実は変わらないため、検証は成功する。

**仕様書の更新箇所**:
- §4.3.2: `Not After: 9999-12-31` → `Not After: 発行日 + 90日`
- §4.3.2: 有効期限なしの理由説明を削除し、短寿命+TSAの理由に置換
- §4.4: 証明書更新フロー（renewエンドポイント）を追加
- §4.5.3: タイムスタンプを「推奨」から「必須（オフライン時を除く）」に強化
- §4.7: Device Certificate行に「更新: 90日ごとに再Attestation + 再発行」を追加、CRL管理を追加
