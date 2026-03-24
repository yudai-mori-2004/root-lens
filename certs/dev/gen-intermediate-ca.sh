#!/bin/bash
# プラットフォーム別 Intermediate CA 生成スクリプト（dev環境用）
# 仕様書 §4.3 PKI構造（3層: Root CA → Intermediate CA → Device Certificate）
#
# Apple/Google のAttestation機構は根本的に異なるため、
# 一方のプラットフォームで不正が発覚した場合に他方に波及しないよう暗号的に分離する。
#
# Usage:
#   ./gen-intermediate-ca.sh ios [output-dir]
#   ./gen-intermediate-ca.sh android [output-dir]
#
# 出力:
#   ios-intermediate-ca.pem       - iOS Intermediate CA証明書
#   ios-intermediate-ca-key.pem   - iOS Intermediate CA秘密鍵
#   (android-* も同様)

set -euo pipefail

PLATFORM="${1:?Usage: $0 <ios|android> [output-dir]}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUT_DIR="${2:-$SCRIPT_DIR}"

ROOT_CA_CERT="$SCRIPT_DIR/root-ca.pem"
ROOT_CA_KEY="$SCRIPT_DIR/root-ca-key.pem"

if [ ! -f "$ROOT_CA_CERT" ] || [ ! -f "$ROOT_CA_KEY" ]; then
    echo "Error: Root CA not found. Run gen-root-ca.sh first."
    exit 1
fi

if [ "$PLATFORM" != "ios" ] && [ "$PLATFORM" != "android" ]; then
    echo "Error: Platform must be 'ios' or 'android'"
    exit 1
fi

mkdir -p "$OUT_DIR"

CERT_FILE="$OUT_DIR/${PLATFORM}-intermediate-ca.pem"
KEY_FILE="$OUT_DIR/${PLATFORM}-intermediate-ca-key.pem"

# 既存チェック
if [ -f "$CERT_FILE" ] && [ -f "$KEY_FILE" ]; then
    echo "$PLATFORM Intermediate CA は既に存在します。再生成する場合は削除してください。"
    openssl x509 -in "$CERT_FILE" -subject -dates -noout
    exit 0
fi

echo "=== $PLATFORM Intermediate CA を生成します ==="

# プラットフォーム名（CN用）
if [ "$PLATFORM" = "ios" ]; then
    CA_CN="RootLens Dev iOS CA"
else
    CA_CN="RootLens Dev Android CA"
fi

# Intermediate CA 鍵生成
openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:prime256v1 -out "$KEY_FILE"

# CSR作成
cat > "$OUT_DIR/_intermediate.cnf" << EOF
[req]
distinguished_name = req_dn
prompt = no

[req_dn]
CN = ${CA_CN}
O = RootLens Dev
C = JP
EOF

openssl req -new -key "$KEY_FILE" \
  -config "$OUT_DIR/_intermediate.cnf" \
  -out "$OUT_DIR/_intermediate.csr"

# Root CAで署名: pathLenConstraint:0, keyCertSign + cRLSign
# 有効期間: 5年 (1825日)
cat > "$OUT_DIR/_intermediate_ext.cnf" << 'EOF'
[v3_intermediate]
basicConstraints = critical,CA:TRUE,pathlen:0
keyUsage = critical,keyCertSign,cRLSign
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid:always
EOF

openssl x509 -req -in "$OUT_DIR/_intermediate.csr" \
  -CA "$ROOT_CA_CERT" \
  -CAkey "$ROOT_CA_KEY" \
  -sha256 -days 1825 \
  -extfile "$OUT_DIR/_intermediate_ext.cnf" -extensions v3_intermediate \
  -set_serial "0x$(openssl rand -hex 20)" \
  -out "$CERT_FILE" \
  2>/dev/null

rm -f "$OUT_DIR/_intermediate.cnf" "$OUT_DIR/_intermediate.csr" "$OUT_DIR/_intermediate_ext.cnf" "$SCRIPT_DIR/root-ca.srl"

echo ""
echo "=== $PLATFORM Intermediate CA 生成完了 ==="
openssl x509 -in "$CERT_FILE" -subject -issuer -dates -noout
echo ""
echo "チェーン検証:"
openssl verify -CAfile "$ROOT_CA_CERT" "$CERT_FILE"
echo ""
echo "フィンガープリント (SHA-256):"
openssl x509 -in "$CERT_FILE" -outform DER | openssl dgst -sha256 -hex | awk '{print $2}'
