// R2 オブジェクトキー / プレフィックス / 撮影構成マニフェストの命名関数。
// AWS SDK 依存ゼロ (= 純粋な文字列関数)。
//
// バケットは撮影構成ごとに分離する:
//   ultra_wide → R2_BUCKET_RAW        (= rootlens-raw、 超広角 RGB の raw)
//   arkit      → R2_BUCKET_RAW_ARKIT  (= depth / IMU / 6DoF ポーズ等 ARKit 由来 raw)
//   mentra     → R2_BUCKET_RAW_MENTRA (= Mentra RGB / per-frame timestamp / IMU)
//   iphone     → R2_BUCKET_RAW        (= rootlens-raw。iPhone 超広角 RGB / raw IMU)
// key prefix は各バケットとも raw/<unit_id>/ で対称。

// ─── raw (= 端末アップロード) ───────────────────────────────────────────

/// クリップ 1 件の raw プレフィックス。 端末アップロードのファイル群がこの配下に並ぶ。
export function rawSessionPrefix(unitId: string): string {
  return `raw/${unitId}/`;
}

/// 撮影構成 ID (= app/src/dataflow/recording-configs/ と 1:1)。
export type RecordingConfigId = "ultra_wide" | "arkit" | "mentra" | "iphone";

/// 撮影構成が出力するファイル名。 構成が増えたら固有ファイルを足す。
export type RawSessionFilename =
  | "rgb.mp4"
  | "frames.jsonl"            // per-frame の pose / intrinsics / tracking / hands (旧名 realtime_handpose.jsonl)
  | "realtime_handpose.jsonl" // 旧ビルド (= build 30 以前) 互換。 新規アップロードが frames.jsonl に揃ったら削除
  | "metadata.json"
  | "imu.jsonl"           // ARKit / Mentra / iPhone 構成
  | "depth.tar"           // ARKit + LiDAR (Pro) のみ optional
  | "pointcloud.jsonl"    // ARKit 構成のみ optional (= VIO 特徴点群)
  | "mesh.jsonl"          // ARKit + LiDAR (Pro) のみ optional (= シーン再構成メッシュ)
  | "arkit_imu.jsonl"     // ARKit 構成のみ optional (= 全 ARFrame の VIO 姿勢由来角速度 + tracking)
  | "device_metrics.jsonl"; // ARKit 構成のみ optional (= 全 ARFrame の 電池 / 熱 / CPU / メモリ)

/// 構成ごとのアップロードファイルマニフェスト (= 端末の config.outputFiles と対応する server 側 contract)。
/// 端末は presign に無い名前をアップロードしようとすると fail-loud する (= ズレ検出)。
export const RAW_SESSION_MANIFEST: Record<
  RecordingConfigId,
  { filename: RawSessionFilename; contentType: string; required: boolean }[]
> = {
  ultra_wide: [
    { filename: "rgb.mp4", contentType: "video/mp4", required: true },
    { filename: "realtime_handpose.jsonl", contentType: "application/x-ndjson", required: true },
    { filename: "metadata.json", contentType: "application/json", required: true },
  ],
  arkit: [
    { filename: "rgb.mp4", contentType: "video/mp4", required: true },
    { filename: "frames.jsonl", contentType: "application/x-ndjson", required: true },
    { filename: "realtime_handpose.jsonl", contentType: "application/x-ndjson", required: false },
    { filename: "imu.jsonl", contentType: "application/x-ndjson", required: true },
    { filename: "metadata.json", contentType: "application/json", required: true },
    { filename: "depth.tar", contentType: "application/x-tar", required: false },
    { filename: "pointcloud.jsonl", contentType: "application/x-ndjson", required: false },
    { filename: "mesh.jsonl", contentType: "application/x-ndjson", required: false },
    { filename: "arkit_imu.jsonl", contentType: "application/x-ndjson", required: false },
    { filename: "device_metrics.jsonl", contentType: "application/x-ndjson", required: false },
  ],
  mentra: [
    { filename: "rgb.mp4", contentType: "video/mp4", required: true },
    { filename: "frames.jsonl", contentType: "application/x-ndjson", required: true },
    { filename: "imu.jsonl", contentType: "application/x-ndjson", required: true },
    { filename: "metadata.json", contentType: "application/json", required: true },
  ],
  // Same delivered file contract as Mentra; only the capture implementation
  // and metadata schema differ.
  iphone: [
    { filename: "rgb.mp4", contentType: "video/mp4", required: true },
    { filename: "frames.jsonl", contentType: "application/x-ndjson", required: true },
    { filename: "imu.jsonl", contentType: "application/x-ndjson", required: true },
    { filename: "metadata.json", contentType: "application/json", required: true },
  ],
};

export function rawSessionFileKey(unitId: string, filename: RawSessionFilename): string {
  return `${rawSessionPrefix(unitId)}${filename}`;
}

/// raw MP4 の R2 キー。
export function rawMp4Key(unitId: string): string {
  return rawSessionFileKey(unitId, "rgb.mp4");
}
