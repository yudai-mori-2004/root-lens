"""Face and restricted-area anonymization for FPV delivery video."""

from __future__ import annotations

import os

# ─── EgoBlur (既定) ──────────────────────────────────────────────
# Meta gen2 EgoBlur (arXiv:2308.13093)。 閾値 0.8 は運用実績値。
# Meta gen2 の per-camera calibrated 値は camera-rgb で 0.674 (Aria RGB 想定) だが、
# iPhone RGB での calibration が無いため保守側の 0.8 を採用する。
EGOBLUR_SCORE_THRESHOLD = 0.8
EGOBLUR_NMS_IOU = 0.3
EGOBLUR_SCALE_FACTOR = 1.15  # 検出 bbox を 15% 拡張してからぼかす (境界の取りこぼし対策)

# 短辺リサイズ。 EgoBlur 既定 1200 は精度重視。 480 まで落として ~6 倍高速化 (推論は O(HW))。
# エゴセントリックの実顔は近距離〜中距離で数百 px 出るので、 480 でも捕まえられる
# (実運用でもし取りこぼしが確認されたら 640 に戻す)。
EGOBLUR_RESIZE = 480
EGOBLUR_BATCH = 16  # GPU の VRAM 内で回るバッチ数。 A10G 24GB なら余裕。

# コンテナ内での配置 (image ビルドで clone / volume mount で jit を配置)
EGOBLUR_CODE_DIR = "/opt/egoblur"                     # git clone 先 (gen2/script/... が入る)
EGOBLUR_JIT_PATH = "/egoblur_model/ego_blur_face_gen2.jit"  # modal volume の mount 先

# ─── Mediapipe (fallback) ────────────────────────────────────────
# 家事映像で手や床を顔と誤検出しやすいので、 EgoBlur が使えない場合の緊急時のみ。
# min_detection_confidence は 0.9 まで上げて誤検出を潰す (実測で 0.9 なら誤爆ゼロ)。
FACE_BLUR_MIN_CONFIDENCE = 0.9

# ─── 撮影禁止マーカー (ArUco) ────────────────────────────────────
# 店側が「映したくない場所」 に貼る物理ステッカー。 検出とぼかしは納品パイプライン (= ここ) だけで
# 行い、 マーカー周囲の実寸ゾーンを塗りつぶす。 ArUco なのは同寸の QR よりセルが大きく、 数倍の
# 距離やモーションブラー越しでも検出できるため。 シートは tools/asset-gen/gen-ng-markers.py で
# 生成し、 原寸印刷が前提 (= マーカー実寸がゾーンの cm → px 換算の基準)。
NG_MARKER_DICT = "DICT_4X4_50"
NG_MARKER_SIZE_CM = 7.0      # 印刷したマーカー黒枠 1 辺の実寸 (= gen-ng-markers.py の出力と一致させる)
NG_MARKER_CORROBORATE_S = 3.0  # 単発ノイズ棄却の裏付け窓 (同一 id の別目撃がこの秒数以内に必要)
NG_MARKER_ZONE_SCALE = 1.15  # ゾーンを少し広げて適用 (境界の取りこぼし対策。 顔ぼかしと同率)
# id → ぼかしゾーン (シートの表記と 1:1 に保つ)。 circle はマーカー中心の半径 r_cm、
# rect はマーカー中心に置く w_cm × h_cm (貼った向きに追従)。
NG_MARKER_ZONES: dict[int, dict] = {
    0: {"shape": "circle", "r_cm": 25.0},
    1: {"shape": "circle", "r_cm": 50.0},
    2: {"shape": "circle", "r_cm": 100.0},
    10: {"shape": "rect", "w_cm": 40.0, "h_cm": 30.0},
    11: {"shape": "rect", "w_cm": 90.0, "h_cm": 60.0},
    12: {"shape": "rect", "w_cm": 180.0, "h_cm": 90.0},
}


def _apply_elliptical_blur(rgb, boxes_xyxy, scale_factor: float):
    """EgoBlur gen2 demo と同じ楕円 blur を bbox 群に対して合成。 boxes は元解像度 XYXY。"""
    import cv2
    import numpy as np
    if not len(boxes_xyxy):
        return rgb
    h, w = rgb.shape[:2]
    out = rgb.copy()
    mask = np.zeros((h, w), np.uint8)
    ksize = (max(1, h // 2), max(1, w // 2))
    for x1, y1, x2, y2 in boxes_xyxy:
        cx = (x1 + x2) * 0.5
        cy = (y1 + y2) * 0.5
        bw = (x2 - x1) * scale_factor
        bh = (y2 - y1) * scale_factor
        x1i = max(0, int(round(cx - bw * 0.5)))
        y1i = max(0, int(round(cy - bh * 0.5)))
        x2i = min(w, int(round(cx + bw * 0.5)))
        y2i = min(h, int(round(cy + bh * 0.5)))
        if x2i <= x1i or y2i <= y1i:
            continue
        out[y1i:y2i, x1i:x2i] = cv2.blur(out[y1i:y2i, x1i:x2i], ksize)
        cv2.ellipse(mask, (((x1i + x2i) // 2, (y1i + y2i) // 2),
                          (x2i - x1i, y2i - y1i), 0), 255, -1)
    inv = cv2.bitwise_not(mask)
    bg = cv2.bitwise_and(rgb, rgb, mask=inv)
    fg = cv2.bitwise_and(out, out, mask=mask)
    return cv2.add(bg, fg)


class EgoBlurBackend:
    """Meta EgoBlur gen2 (TorchScript) 経由の顔検出 → ぼかし。 GPU 前提。 batch 推論対応。

    gen2 の EgoblurDetector を直接叩く (公式 demo と同じ経路。 上位ラッパーは
    detectron2 の名前空間衝突があり使わない)。
    """

    NAME = "egoblur"

    def __init__(self, jit_path: str, code_dir: str, device: str,
                 score_threshold: float, nms_iou: float, resize: int,
                 batch: int, scale_factor: float):
        import sys
        # gen2 パッケージを path に (= `import gen2.script.*` を解決)
        if code_dir not in sys.path:
            sys.path.insert(0, code_dir)
        # gen2/script も path に (= jit の scripted 名 `detectron2.*` を bare で解決)
        script_dir = os.path.join(code_dir, "gen2", "script")
        if os.path.isdir(script_dir) and script_dir not in sys.path:
            sys.path.insert(0, script_dir)

        from gen2.script.detectron2.export.torchscript_patch import patch_instances
        from gen2.script.predictor import (
            EgoblurDetector, ClassID, PATCH_INSTANCES_FIELDS,
        )
        self._patch_instances = patch_instances
        self._patch_fields = PATCH_INSTANCES_FIELDS
        self._scale_factor = scale_factor
        self._batch = batch
        self.detector = EgoblurDetector(
            model_path=jit_path, device=device, detection_class=ClassID.FACE,
            score_threshold=score_threshold, nms_iou_threshold=nms_iou,
            resize_aug={"min_size_test": resize, "max_size_test": resize},
            image_format="BGR", use_gpu_resize=(device == "cuda"),
        )
        self.batch_size = batch
        self.detections_total = 0

    def blur_batch(self, bgr_frames):
        """bgr_frames: list of HxWx3 uint8 BGR。 検出+ぼかし後の RGB list を返す (同順)。"""
        import cv2
        import numpy as np
        import torch
        if not bgr_frames:
            return []
        tensors = [torch.from_numpy(np.transpose(f, (2, 0, 1))) for f in bgr_frames]
        batched = torch.stack(tensors)
        with self._patch_instances(fields=self._patch_fields):
            boxes_per_frame = self.detector.run(batched)  # score_threshold で絞り込み済
        outs = []
        for bgr, boxes in zip(bgr_frames, boxes_per_frame):
            self.detections_total += len(boxes)
            rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
            outs.append(_apply_elliptical_blur(rgb, boxes, self._scale_factor))
        return outs


class MediapipeBackend:
    """CPU 動作の fallback。 EgoBlur が使えないときだけ。 batch 非対応 (1 枚ずつ)。"""

    NAME = "mediapipe"

    def __init__(self, min_confidence: float):
        import mediapipe as mp
        # model_selection=1 = full-range モデル (数 m 先の顔まで対象)。
        self._detector = mp.solutions.face_detection.FaceDetection(
            model_selection=1, min_detection_confidence=min_confidence)
        self._scale_factor = EGOBLUR_SCALE_FACTOR
        self.batch_size = 1
        self.detections_total = 0

    def blur_batch(self, bgr_frames):
        import cv2
        outs = []
        for bgr in bgr_frames:
            rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
            h, w = rgb.shape[:2]
            result = self._detector.process(rgb)
            boxes = []
            for det in (result.detections or []):
                rb = det.location_data.relative_bounding_box
                x1 = rb.xmin * w
                y1 = rb.ymin * h
                boxes.append((x1, y1, x1 + rb.width * w, y1 + rb.height * h))
            self.detections_total += len(boxes)
            outs.append(_apply_elliptical_blur(rgb, boxes, self._scale_factor))
        return outs


def _make_face_backend(face_detector: str):
    """face_detector 名 → backend インスタンス。 build_mcap 内で 1 回だけ呼ぶ。"""
    if face_detector == "egoblur":
        import torch
        device = "cuda" if torch.cuda.is_available() else "cpu"
        return EgoBlurBackend(
            jit_path=EGOBLUR_JIT_PATH, code_dir=EGOBLUR_CODE_DIR, device=device,
            score_threshold=EGOBLUR_SCORE_THRESHOLD, nms_iou=EGOBLUR_NMS_IOU,
            resize=EGOBLUR_RESIZE, batch=EGOBLUR_BATCH,
            scale_factor=EGOBLUR_SCALE_FACTOR,
        )
    if face_detector == "mediapipe":
        return MediapipeBackend(min_confidence=FACE_BLUR_MIN_CONFIDENCE)
    raise ValueError(f"unknown face_detector: {face_detector}")


# ─── 撮影禁止マーカー (= 検出プリパス + ゾーンぼかし) ─────────────────


def _ng_zone_from_corners(corners, zone_def):
    """ArUco の 4 隅 (4,2) から画面上のぼかしゾーンを作る。

    マーカーの上辺・左辺ベクトルを「面上の 1cm」 としたアフィン写像 (rect = 平行四辺形、
    circle = 楕円)。 ゾーンは最大 ±15 マーカー幅の外挿なので、 数ピクセルの角の差分から
    推定する射影 (遠近) 成分はノイズ増幅が大きく、 線形写像だけで貼る。"""
    import numpy as np

    c = np.asarray(corners, dtype=np.float32).reshape(4, 2)
    side_px = float(np.mean([np.linalg.norm(c[k] - c[(k + 1) % 4]) for k in range(4)]))
    if side_px <= 1.0:
        return None
    center = c.mean(axis=0)

    # ── ゾーンの面上オフセット (cm、 マーカー中心原点、 余裕率込み) ──
    if zone_def["shape"] == "circle":
        ts = np.linspace(0.0, 2.0 * np.pi, 32, endpoint=False)
        offs = np.stack([np.cos(ts), np.sin(ts)], axis=1) * (zone_def["r_cm"] * NG_MARKER_ZONE_SCALE)
    else:
        hw = zone_def["w_cm"] / 2.0 * NG_MARKER_ZONE_SCALE
        hh = zone_def["h_cm"] / 2.0 * NG_MARKER_ZONE_SCALE
        offs = np.array([[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]], dtype=np.float32)

    U = (c[1] - c[0]) / NG_MARKER_SIZE_CM  # 面上 1cm → px (上辺方向)
    V = (c[3] - c[0]) / NG_MARKER_SIZE_CM
    if zone_def["shape"] != "circle":
        # 紙の微妙な傾き (吊り下げ・検出ノイズ) でゾーンが斜めになると不自然なので、
        # ±20° 以内は画像軸にスナップ。 円は面内回転に不変なのでスナップ不要。
        ang = float(np.degrees(np.arctan2(U[1], U[0])))
        snapped = round(ang / 90.0) * 90.0
        if abs(ang - snapped) <= 20.0:
            rad = np.radians(snapped)
            U = np.array([np.cos(rad), np.sin(rad)], dtype=np.float32) * float(np.linalg.norm(U))
            V = np.array([-np.sin(rad), np.cos(rad)], dtype=np.float32) * float(np.linalg.norm(V))
    pts = center + np.outer(offs[:, 0], U) + np.outer(offs[:, 1], V)
    return ("poly", pts.astype(np.int32))


def detect_ng_marker_zones(video_path: str, corroborate_frames: int) -> dict[int, list]:
    """rgb.mp4 を 1 パス走査して撮影禁止マーカーを検出し、 フレーム番号 → ぼかしゾーン一覧の
    予定表を返す。 ゾーンを塗るのは実際にマーカーを目撃したフレームだけ (= カメラが動く
    一人称映像では、 目撃時点のジオメトリを時間方向に延長しても正しい画面位置にならない)。
    孤立した単発目撃はノイズとして捨てる (下のコメント参照)。
    マーカーが 1 つも映っていないセッションでは空 dict (= 後段の挙動は従来と同一)。"""
    import cv2
    import numpy as np  # noqa: F401  (cv2.aruco が内部で要求)

    aruco = cv2.aruco
    dictionary = aruco.getPredefinedDictionary(getattr(aruco, NG_MARKER_DICT))
    if hasattr(aruco, "ArucoDetector"):
        detector = aruco.ArucoDetector(dictionary, aruco.DetectorParameters())
        detect = detector.detectMarkers
    else:  # opencv < 4.7 の旧 API
        params = aruco.DetectorParameters_create()
        detect = lambda gray: aruco.detectMarkers(gray, dictionary, parameters=params)  # noqa: E731

    sightings: dict[int, list] = {}  # marker id → [(frame_idx, zone), ...] (frame 昇順)
    cap = cv2.VideoCapture(video_path)
    try:
        i = 0
        while True:
            ok, bgr = cap.read()
            if not ok:
                break
            corners, ids, _ = detect(cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY))
            if ids is not None:
                for c, mid in zip(corners, ids.reshape(-1).tolist()):
                    zone_def = NG_MARKER_ZONES.get(int(mid))
                    if zone_def is None:
                        continue
                    zone = _ng_zone_from_corners(c, zone_def)
                    if zone is not None:
                        sightings.setdefault(int(mid), []).append((i, zone))
            i += 1
    finally:
        cap.release()

    # 単発の孤立目撃はノイズとして捨てる。 環境中の高コントラストな模様が偶発的に
    # カタログ id へ復号されることがあり、 それは孤立フレームにしかならない。 物理的に
    # 貼られたステッカーは連続フレームの目撃列になるので、 同一 id の別の目撃が
    # corroborate_frames 以内に 1 つも無い目撃はゾーン化しない。
    for mid in list(sightings):
        seen = sightings[mid]
        kept = [s for k, s in enumerate(seen)
                if (k > 0 and s[0] - seen[k - 1][0] <= corroborate_frames)
                or (k + 1 < len(seen) and seen[k + 1][0] - s[0] <= corroborate_frames)]
        if kept:
            sightings[mid] = kept
        else:
            del sightings[mid]
        if len(kept) != len(seen):
            print(f"[ng] id={mid}: dropped {len(seen) - len(kept)} isolated sighting(s) as noise", flush=True)

    # 残った目撃列をクラスタ単位でログに出す (= どの時間帯に何が映ったか後から追える)。
    for mid, seen in sightings.items():
        clusters: list[list[int]] = []
        for f, _ in seen:
            if clusters and f - clusters[-1][1] <= corroborate_frames:
                clusters[-1][1] = f
            else:
                clusters.append([f, f])
        spans = ", ".join(f"{a}..{b}" for a, b in clusters)
        print(f"[ng] id={mid}: {len(seen)} sightings in {len(clusters)} cluster(s): frames {spans}", flush=True)

    # 目撃列 → 予定表: 目撃したフレームにそのままゾーンを載せる。
    schedule: dict[int, list] = {}
    for seen in sightings.values():
        for f, zone in seen:
            schedule.setdefault(f, []).append(zone)
    return schedule


def _apply_zone_blur(rgb, zones):
    """マーカーゾーンを顔ぼかし (EgoBlur 適用部) と同じ強いブラーで塗りつぶす
    (rgb: HxWx3、 色空間は不問)。"""
    import cv2
    import numpy as np

    h, w = rgb.shape[:2]
    mask = np.zeros((h, w), np.uint8)
    for zone in zones:
        cv2.fillConvexPoly(mask, zone[1], 255)
    if not mask.any():
        return rgb
    blurred = cv2.blur(rgb, (max(1, h // 2), max(1, w // 2)))
    out = rgb.copy()
    out[mask > 0] = blurred[mask > 0]
    return out
