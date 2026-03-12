#!/bin/bash
# Device Certificate 発行スクリプト（dev環境用）
# 仕様書 §4.3.2 Device Certificateプロファイルに準拠
#
# CSRを受け取り、Dev Root CAで署名して90日有効のDevice Certificateを発行する。
# 本番環境ではサーバーAPIが同等の処理を行う。
#
# Usage:
#   ./issue-device-cert.sh <csr.pem> [output-dir]
#
# 出力:
#   device-cert.pem    - Device Certificate（90日有効）
#   device-chain.pem   - 証明書チェーン（Device + Root CA）

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CSR_FILE="${1:?Usage: $0 <csr.pem> [output-dir]}"
OUT_DIR="${2:-$SCRIPT_DIR}"

ROOT_CA_CERT="$SCRIPT_DIR/root-ca.pem"
ROOT_CA_KEY="$SCRIPT_DIR/root-ca-key.pem"

if [ ! -f "$ROOT_CA_CERT" ] || [ ! -f "$ROOT_CA_KEY" ]; then
    echo "Error: Root CA not found. Run gen-root-ca.sh first."
    exit 1
fi

if [ ! -f "$CSR_FILE" ]; then
    echo "Error: CSR file not found: $CSR_FILE"
    exit 1
fi

mkdir -p "$OUT_DIR"

echo "=== Device Certificate を発行します ==="

# CSRの公開鍵からdevice_id_hashを計算（§4.3.2）
# device_id_hash = SHA-256(CSR公開鍵DER)の先頭16文字hex
PUBKEY_HASH=$(openssl req -in "$CSR_FILE" -pubkey -noout | \
  openssl ec -pubin -outform DER 2>/dev/null | \
  openssl dgst -sha256 -hex | awk '{print $2}' | cut -c1-16)

echo "device_id_hash: $PUBKEY_HASH"

# §4.3.2: CA:FALSE, digitalSignature, id-kp-documentSigning
# 有効期限: 90日（短寿命証明書モデル）
cat > "$OUT_DIR/_device.cnf" << EOF
[v3_device]
basicConstraints = critical,CA:FALSE
keyUsage = critical,digitalSignature
extendedKeyUsage = 1.3.6.1.5.5.7.3.36
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid:always
EOF

openssl x509 -req -in "$CSR_FILE" \
  -CA "$ROOT_CA_CERT" \
  -CAkey "$ROOT_CA_KEY" \
  -CAcreateserial \
  -sha256 -days 90 \
  -extfile "$OUT_DIR/_device.cnf" -extensions v3_device \
  -set_serial "0x$(openssl rand -hex 20)" \
  -out "$OUT_DIR/device-cert.pem" \
  2>/dev/null

# サーバーが設定するSubject DNを手動で指定できないため、
# opensslのx509 -reqはCSRのSubjectをそのまま使用する。
# 本番サーバーAPIではSubject CNを "RootLens Device <hash>" に上書きする。

# 証明書チェーン（Device + Root CA）
cat "$OUT_DIR/device-cert.pem" "$ROOT_CA_CERT" > "$OUT_DIR/device-chain.pem"

rm -f "$OUT_DIR/_device.cnf" "$SCRIPT_DIR/root-ca.srl"

echo ""
echo "=== Device Certificate 発行完了 ==="
echo "有効期限: 90日"
openssl x509 -in "$OUT_DIR/device-cert.pem" -subject -issuer -dates -noout
echo ""
echo "チェーン検証:"
openssl verify -CAfile "$ROOT_CA_CERT" "$OUT_DIR/device-cert.pem"
