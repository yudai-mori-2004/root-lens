/**
 * CRL（証明書失効リスト）管理
 * 仕様書 §4.7 鍵ライフサイクル管理
 *
 * Dev環境: インメモリ管理
 * Prod環境: データベース（Supabase）に永続化
 */

// 失効した証明書のシリアル番号セット
const revokedSerials = new Set<string>();

export function revokeCertificate(serialHex: string): void {
  revokedSerials.add(serialHex.toLowerCase());
}

export function isRevoked(serialHex: string): boolean {
  return revokedSerials.has(serialHex.toLowerCase());
}

export function getRevokedSerials(): string[] {
  return Array.from(revokedSerials);
}
