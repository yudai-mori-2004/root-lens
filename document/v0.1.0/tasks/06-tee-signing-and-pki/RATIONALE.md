# C2PAデバイス署名アプローチの根拠

## 調査目的

RootLensは「デバイスTEE内でC2PA署名鍵を生成し、独自Root CAでDevice Certificateを発行する」アプローチを採用する。このアプローチが業界で一般的でない理由と、それでも採用すべき根拠を調査した。

---

## 1. 業界の実装状況

### カメラメーカー（ハードウェアレベル署名）

| メーカー | 方式 | 信頼の起点 | CA |
|---------|------|-----------|-----|
| Leica M11-P | 専用セキュアチップ | センサー → チップ直結 | D-Trust（ドイツ政府系CA）|
| Nikon Z6 III | ファームウェアC2PA | カメラ内署名 | D-Trust |
| Google Pixel 10 | StrongBox (Titan M2) | Android Key Attestation | Google自社CA |
| Sony alpha 9 III | Imaging Edgeクラウド | サーバー側署名 | Sony CA |

**注目**: Nikon Z6 IIIは2025年8月にC2PAを追加したが、多重露光モードでAI生成画像に正規署名が付与できる脆弱性が発見され、**全証明書を失効**した。ハードウェアレベルでも完璧ではない。

### モバイルアプリ

| アプリ | 方式 | TEE使用 | CA |
|-------|------|---------|-----|
| Truepic | オンデバイス署名 + クラウド署名 | Snapdragon TEE（ファームウェア） | Truepic自社CA（Keyfactor EJBCA） |
| Numbers Protocol / Capture | オンデバイス署名 | 不明 | 自社CA |
| ProofMode (Guardian Project) | ローカル自己署名 | 不使用 | 自己署名証明書 |
| **RootLens（計画）** | **TEEオンデバイス署名** | **Secure Enclave / StrongBox** | **RootLens Root CA（AWS KMS）** |

### Google Pixel 10（2025年9月 — 最も関連性の高い先例）

- C2PA Conformance **Assurance Level 2**（最高レベル）を初めて達成
- StrongBox / Titan M2でP-256鍵を生成・保護
- Android Key Attestation + DICE + Remote Key Provisioningで検証
- **「1回使い捨て証明書」戦略**: 1つの鍵・証明書で1枚だけ署名し、破棄
- Google自社CAが端末の正当性を検証して証明書を発行

**→ RootLensのアーキテクチャ（TEE鍵生成 + サーバーCA発行）はPixel 10と本質的に同じパターン**

---

## 2. なぜ他のC2PAアプリがこのアプローチを採らないのか

### 技術的障壁（参入コストが高い）

1. **PKIインフラの構築**: CA運用にはKeyfactor EJBCA等のエンタープライズPKIか、AWS KMSとの統合が必要。Truepicはこのインフラだけで事業にしている
2. **Platform Attestation検証の複雑さ**: Android Key AttestationとiOS App Attestは全く異なるAPI・フォーマット。各プラットフォーム固有の検証ロジックが必要
3. **c2pa-rsとTEEの橋渡し**: c2pa-rsのSignerトレイトからプラットフォームネイティブのTEE APIへのコールバックは、Rust → FFI → Kotlin/Swiftの多層ブリッジが必要
4. **鍵ライフサイクル管理**: アプリ再インストール、端末リセット、証明書再発行のシナリオ設計

### 信頼モデルの制約

5. **C2PA Trust Listは2025年6月に始まったばかり**: 独自CAの署名は標準バリデーターで「発行者不明」と表示される
6. **ただし**: Truepic・Adobe・Microsoftの証明書も公的に信頼されていない（Hacker Factorの分析で2,500以上のC2PA署名画像が全て非信頼チェーン）

### クラウド署名の方が簡単

7. サーバー側で1つのHSM鍵で全コンテンツを署名すれば、デバイス固有のPKI不要
8. ただしクラウド署名は「撮影 → アップロード → 署名」の経路でチェーン・オブ・カストディの疑問が生じる

---

## 3. RootLensのアプローチが正しい理由

### 3.1 業界のリーダーが同じパターンを採用

Google Pixel 10は「TEE鍵生成 + サーバーCA発行 + オンデバイス署名」でC2PA最高水準を達成した。RootLensはこれをアプリレベルで再現する。

### 3.2 ES256は唯一の選択肢

iOS Secure EnclaveがP-256のみサポートするため、ES256以外の選択肢はない。C2PAの推奨アルゴリズムでもあり、エコシステムで最も広くテストされている。

### 3.3 Trust List非依存のバイパス

RootLensはTitle Protocolのオンチェーン検証を通じて信頼を確立する。公開ページはRootLens Root CAを直接知っており、C2PA Trust Listに載る必要がない。これは弱点ではなく、**信頼モデルの独立性**として設計された強み。

### 3.4 オンデバイス署名の構造的優位

クラウド署名と異なり、コンテンツがデバイスを離れることなく署名される。チェーン・オブ・カストディの問題が原理的に発生しない。

### 3.5 仕様の整合性

- 2層PKI（Root CA → Device Certificate）は`pathLenConstraint: 0`で下位発行を暗号的に防止
- challengeにCSRハッシュを使用（nonce管理不要、ネットワーク往復削減）
- Device Certificateに有効期限なし（過去の署名の永続的検証可能性）
- `id-kp-documentSigning` EKU（Trust List非登録CAに適切）

---

## 4. リスクと緩和策

| リスク | 深刻度 | 緩和策 |
|-------|--------|--------|
| iOS App Attestのレート制限（7日に1回） | 中 | 初回起動時に1回実行。再発行は稀 |
| iOS App AttestはAndroid Key Attestationより弱い保証 | 中 | C2PA Assurance Level 2はAndroidのみ。iOSは誠実にLevel 1として扱う |
| Root CA鍵の侵害は壊滅的 | 高 | AWS KMS（FIPS 140-2 Level 2）+ マルチリージョン複製。将来的にCloudHSM（Level 3）への移行を検討 |
| Device Certificateに失効メカニズムなし | 中 | 将来的にCRL/OCSPを追加可能。現時点ではDevice Certが永続的に有効でも実害は低い（攻撃にはTEE鍵の抽出が必要） |
| 標準バリデーターで「発行者不明」表示 | 低 | Title Protocol検証が独立しており依存しない。将来的にC2PA Conformance Program参加で解消 |

---

## 5. 他アプローチとの比較

| 観点 | RootLens | Truepic | ProofMode | クラウド署名 |
|------|----------|---------|-----------|------------|
| 署名場所 | デバイスTEE | デバイスTEE / クラウド | デバイス（TEEなし） | サーバーHSM |
| 鍵保護 | ハードウェア | ハードウェア | ソフトウェア | ハードウェア |
| Platform Attestation | あり | あり（Snapdragon） | なし | 不要 |
| チェーン・オブ・カストディ | 完全（デバイス内完結） | 完全 | 完全 | 疑問あり |
| 証明書戦略 | デバイスごと永続 | 日次ローテーション | 自己署名 | 共通鍵 |
| 検証インフラ | Title Protocol（オンチェーン） | Truepic独自 | なし | サーバー依存 |
| C2PA Trust List | 非登録（将来参加予定） | 非登録（エコシステム認知あり） | 非登録 | CA次第 |

---

## 6. 結論

RootLensのアプローチは：

1. **技術的に正しい** — Google Pixel 10が同じアーキテクチャパターンでC2PA最高水準を達成
2. **実装可能** — iOS Secure Enclave / Android StrongBoxの両方がES256をサポート
3. **信頼モデルが健全** — Title Protocolのオンチェーン検証によりC2PA Trust Listへの依存を回避
4. **業界で珍しい理由は技術力の問題** — PKIインフラ + Platform Attestation + TEE統合の参入障壁が高いだけであり、アプローチ自体が間違っているわけではない

**このアプローチで進めるべきである。**

---

## 出典

- Google Security Blog: Pixel and Android C2PA Content Credentials (2025/09)
- Truepic C2PA Signing / Hardware Integration / Enterprise C2PA
- Qualcomm + Truepic: Snapdragon 8 Elite Gen 5 Secure Media Library (2025/09)
- C2PA Technical Specification v2.2
- C2PA Conformance Program & Trust List (2025/06〜)
- Hacker Factor: C2PA and Untrusted Certificates
- Nikon Z6 III C2PA全証明書失効 (Digital Camera World / PetaPixel)
- C2PA Android SDK (StrongBoxSigner.kt)
- ProofMode / Guardian Project: Simple C2PA
- Apple App Attest Documentation
- C2PA Implementation Guidance
