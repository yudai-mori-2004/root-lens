#!/bin/bash
# Dev Root CA 生成スクリプト
# 仕様書 §4.3.1 Root CA証明書プロファイルに準拠
#
# 本番環境ではAWS KMSを使用。このスクリプトはdev環境専用。
#
# 出力:
#   root-ca.pem       - Root CA証明書
#   root-ca-key.pem   - Root CA秘密鍵（dev環境のみ。本番ではKMS内に閉じ込める）

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUT_DIR="${1:-$SCRIPT_DIR}"
mkdir -p "$OUT_DIR"

echo "=== Dev Root CA を生成します ==="
echo "出力先: $OUT_DIR"

# 既存のRoot CAがある場合はスキップ
if [ -f "$OUT_DIR/root-ca.pem" ] && [ -f "$OUT_DIR/root-ca-key.pem" ]; then
    echo "Root CAは既に存在します。再生成する場合は既存ファイルを削除してください。"
    openssl x509 -in "$OUT_DIR/root-ca.pem" -subject -dates -noout
    exit 0
fi

# §4.3.1: CN=RootLens Root CA, ES256 (P-256)
# pathLenConstraint:0, keyUsage: keyCertSign
cat > "$OUT_DIR/_root-ca.cnf" << 'EOF'
[req]
distinguished_name = req_dn
x509_extensions = v3_ca
prompt = no

[req_dn]
CN = RootLens Dev Root CA
O = RootLens Dev
C = JP

[v3_ca]
basicConstraints = critical,CA:TRUE,pathlen:0
keyUsage = critical,keyCertSign
subjectKeyIdentifier = hash
EOF

# PKCS#8形式で出力（WebCrypto APIとの互換性のため）
openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:prime256v1 -out "$OUT_DIR/root-ca-key.pem"
openssl req -new -x509 -key "$OUT_DIR/root-ca-key.pem" \
  -config "$OUT_DIR/_root-ca.cnf" \
  -sha256 -days 7300 \
  -out "$OUT_DIR/root-ca.pem"

rm -f "$OUT_DIR/_root-ca.cnf"

echo ""
echo "=== Root CA 生成完了 ==="
openssl x509 -in "$OUT_DIR/root-ca.pem" -subject -issuer -dates -noout
echo ""
echo "検証:"
openssl x509 -in "$OUT_DIR/root-ca.pem" -text -noout | grep -A2 "Basic Constraints"
