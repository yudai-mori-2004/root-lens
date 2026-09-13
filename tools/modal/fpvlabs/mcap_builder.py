"""Raw-session anonymization and ROS 2 MCAP assembly.

This module owns the deterministic transformation from one verified local session
directory to one delivery MCAP. Cloud storage, database lookup, and job dispatch
remain in ``fpvlabs.py``.
"""

from __future__ import annotations

import io
import json
import os
import tarfile
import time

from anonymization import (
    EGOBLUR_RESIZE,
    EGOBLUR_SCORE_THRESHOLD,
    FACE_BLUR_MIN_CONFIDENCE,
    NG_MARKER_CORROBORATE_S,
    NG_MARKER_DICT,
    _apply_zone_blur,
    _make_face_backend,
    detect_ng_marker_zones,
)
from mcap_schema import (
    _McapOut,
    _camera_info_msg,
    _flatten_metadata,
    _point_cloud2_msg,
    _rot_to_quat,
    _stamp,
    _tracking_msg,
)

PIPELINE_VERSION = "fpvlabs-7"  # MCAP の processing_info に記録される変換パイプラインの版。 変換の挙動を変えたら上げる。

# ─── MCAP 組み立て本体 (= ストリーミング。 フレームをメモリに溜めない) ──


def build_mcap(session_dir: str, out_path: str, blur: bool = True,
               face_detector: str = "egoblur", jpeg_quality: int = 80) -> dict:
    """raw セッションを ROS2 スキーマの納品 MCAP に組み立てる (時系列インターリーブ)。

    blur=True (既定) のとき、 RGB 各フレームに顔ぼかしを適用する。 face_detector で検出器を選ぶ
    ("egoblur" = 既定、 GPU / "mediapipe" = CPU fallback)。 blur=False で完全に無効化。
    """
    import base64

    import cv2
    import numpy as np

    t0 = time.time()

    meta = json.load(open(os.path.join(session_dir, "metadata.json")))
    cam = meta["camera"]

    # per-frame 行 (= pose / tracking / intrinsics / timestamp)。 1 行 ~1KB なので全読みで問題ない。
    # 新収録は frames.jsonl、 旧収録は realtime_handpose.jsonl (= 同一スキーマの旧名)。
    frames_path = os.path.join(session_dir, "frames.jsonl")
    if not os.path.exists(frames_path):
        frames_path = os.path.join(session_dir, "realtime_handpose.jsonl")
    frames_meta: list[dict] = []
    with open(frames_path) as f:
        for line in f:
            line = line.strip()
            if line:
                frames_meta.append(json.loads(line))
    if not frames_meta:
        raise RuntimeError(f"{os.path.basename(frames_path)} is empty")

    def _load_rows(name: str) -> list[dict]:
        path = os.path.join(session_dir, name)
        if not os.path.exists(path):
            return []
        rows = []
        with open(path) as f:
            for line in f:
                line = line.strip()
                if line:
                    rows.append(json.loads(line))
        return rows

    imu_rows = _load_rows("imu.jsonl")
    arkit_rows = _load_rows("arkit_imu.jsonl")          # 全 ARFrame: 姿勢由来の角速度 + tracking
    metrics_rows = _load_rows("device_metrics.jsonl")   # 全 ARFrame: 電池・熱・メモリ

    # 顔ぼかし (= blur=True のときだけ初期化)。 既定は EgoBlur (GPU)。
    face_backend = _make_face_backend(face_detector) if blur else None

    # 撮影禁止マーカーの検出プリパス (CPU)。 顔ぼかしとは独立で、 --no-blur でも必ず適用する
    # (= 店側プライバシーの装置なので落とせない)。 実効 fps は frames.jsonl の実測から。
    dur_s = (int(frames_meta[-1]["timestamp_ns"]) - int(frames_meta[0]["timestamp_ns"])) / 1e9
    eff_fps = (len(frames_meta) - 1) / dur_s if dur_s > 0 else 30.0
    ng_schedule = detect_ng_marker_zones(
        os.path.join(session_dir, "rgb.mp4"),
        corroborate_frames=max(1, int(round(NG_MARKER_CORROBORATE_S * eff_fps))),
    )

    stats = {"rgb": 0, "depth": 0, "confidence": 0, "pose": 0, "imu": 0, "tracking": 0,
             "arkit_imu": 0, "metrics": 0, "point_cloud_msgs": 0, "trajectory": 0,
             "mesh_vertices": 0}

    first_ts = int(frames_meta[0]["timestamp_ns"])
    last_ts = int(frames_meta[-1]["timestamp_ns"])

    # depth.tar の逐次イテレータ (idx 昇順。 同一 idx は depth → confidence の順に並ぶ)
    def _depth_entries():
        tar_path = os.path.join(session_dir, "depth.tar")
        if not os.path.exists(tar_path):
            return
        with tarfile.open(tar_path) as tar:
            for member in tar:
                if not member.isfile() or not member.name.endswith(".png"):
                    continue
                idx = int(os.path.splitext(os.path.basename(member.name))[0])
                kind = "confidence" if member.name.startswith("confidence/") else "depth"
                yield idx, kind, tar.extractfile(member).read()

    def _pc_entries():
        path = os.path.join(session_dir, "pointcloud.jsonl")
        if not os.path.exists(path):
            return
        with open(path) as f:
            for line in f:
                line = line.strip()
                if line:
                    yield json.loads(line)

    with open(out_path, "wb") as out_f:
        out = _McapOut(out_f)
        write = out.write

        # ── 処理来歴 (= どの設定で作った MCAP か) ──
        blur_meta = {"detector": None, "threshold": None, "resize": None}
        if blur:
            blur_meta["detector"] = face_detector
            if face_detector == "egoblur":
                blur_meta["threshold"] = EGOBLUR_SCORE_THRESHOLD
                blur_meta["resize"] = EGOBLUR_RESIZE
            elif face_detector == "mediapipe":
                blur_meta["threshold"] = FACE_BLUR_MIN_CONFIDENCE
        write("/rootlens/processing_info", {"data": json.dumps({
            "pipeline_version": PIPELINE_VERSION,
            "blur": blur,
            "blur_detector": blur_meta["detector"],
            "blur_threshold": blur_meta["threshold"],
            "blur_resize": blur_meta["resize"],
            "jpeg_quality": jpeg_quality,
            "rgb_source": "h264_reencode",
            "ng_marker_dict": NG_MARKER_DICT,
            "ng_marker_zone_frames": len(ng_schedule),
            "source": "rootlens raw session",
            "device_model": meta.get("device_model"),
            "app_version": meta.get("app_version"),
            "axes": "ARKit-native (pose: ARKit world; imu: CoreMotion device axes, specific force m/s^2 per REP 145)",
        })}, first_ts)

        # ── camera↔IMU 外部パラメータ (収録側 metadata に推定値がある場合のみ) ──
        ext = meta.get("camera_imu_extrinsic")
        if isinstance(ext, dict) and ext.get("rotation_matrix_3x3") is not None:
            rot = ext["rotation_matrix_3x3"]
            if len(rot) == 9 and not isinstance(rot[0], (list, tuple)):
                rot = [rot[0:3], rot[3:6], rot[6:9]]
            trans = ext.get("translation_xyz_m") or [0.0, 0.0, 0.0]
            write("/device/camera_imu_extrinsics", {"transforms": [{
                "header": {"stamp": _stamp(first_ts), "frame_id": "camera_link"},
                "child_frame_id": "imu_frame",
                "transform": {
                    "translation": {"x": float(trans[0]), "y": float(trans[1]), "z": float(trans[2])},
                    "rotation": _rot_to_quat(rot),
                },
            }]}, first_ts)

        # ── IMU 固有値 (収録側 metadata にある場合のみ) ──
        ii = meta.get("imu_intrinsics")
        if isinstance(ii, dict):
            write("/device/imu/intrinsics", {
                "header": {"stamp": _stamp(first_ts), "frame_id": "imu_frame"},
                "accel_noise_density": float(ii.get("accel_noise_density", 0.0)),
                "gyro_noise_density": float(ii.get("gyro_noise_density", 0.0)),
                "accel_bias_random_walk": float(ii.get("accel_bias_random_walk", 0.0)),
                "gyro_bias_random_walk": float(ii.get("gyro_bias_random_walk", 0.0)),
                "accel_bias": {"x": 0.0, "y": 0.0, "z": 0.0},
                "gyro_bias": {"x": 0.0, "y": 0.0, "z": 0.0},
                "sample_rate_hz": int(ii.get("sample_rate_hz", 0)),
                "source": str(ii.get("source", "")),
            }, first_ts)
        if arkit_rows:
            a_first = int(arkit_rows[0]["timestamp_ns"])
            a_last = int(arkit_rows[-1]["timestamp_ns"])
            n = len(arkit_rows)
            arkit_rate = int(round((n - 1) * 1e9 / (a_last - a_first))) if n > 1 and a_last > a_first else 0
            write("/arkit/imu/intrinsics", {
                "header": {"stamp": _stamp(a_first), "frame_id": "camera_link"},
                # VIO 姿勢の差分由来。 加速度は持たないので accel 側は NaN。
                "accel_noise_density": float("nan"),
                "gyro_noise_density": 5.0e-5,
                "accel_bias_random_walk": float("nan"),
                "gyro_bias_random_walk": 1.0e-6,
                "accel_bias": {"x": 0.0, "y": 0.0, "z": 0.0},
                "gyro_bias": {"x": 0.0, "y": 0.0, "z": 0.0},
                "sample_rate_hz": arkit_rate,
                "source": "arkit_vio_derived",
            }, a_first)

        # ── 時系列カーソル群 (フレーム駆動ループが撮影時刻順に消化する) ──
        imu_i = 0
        arkit_i = 0
        metrics_i = 0
        no_estimate = [-1.0] + [0.0] * 8  # covariance 先頭 -1 = その量の推定なし

        def _flush_imu(upto_ts: int) -> None:
            nonlocal imu_i
            while imu_i < len(imu_rows) and int(imu_rows[imu_i]["timestamp_ns"]) <= upto_ts:
                row = imu_rows[imu_i]
                imu_i += 1
                ts = int(row["timestamp_ns"])
                acc = row.get("accel", {})
                gyr = row.get("gyro", {})
                att = (row.get("device_motion") or {}).get("attitude") or {}
                if att:
                    orientation = {"x": float(att.get("qx", 0.0)), "y": float(att.get("qy", 0.0)),
                                   "z": float(att.get("qz", 0.0)), "w": float(att.get("qw", 1.0))}
                    ori_cov = [0.0] * 9  # 全ゼロ = covariance 不明 (実測していない値は書かない)
                else:
                    orientation = {"x": 0.0, "y": 0.0, "z": 0.0, "w": 1.0}
                    ori_cov = no_estimate
                write("/device/imu", {
                    "header": {"stamp": _stamp(ts), "frame_id": "imu_frame"},
                    "orientation": orientation,
                    "orientation_covariance": ori_cov,
                    "angular_velocity": {"x": float(gyr.get("x", 0.0)), "y": float(gyr.get("y", 0.0)),
                                         "z": float(gyr.get("z", 0.0))},
                    "angular_velocity_covariance": [0.0] * 9,
                    # 比力 (REP 145: 静止時に鉛直上向き +g)。 CoreMotion の生値は
                    # その符号反転 (静止・画面上向きで z = -1g) なので、 g 単位 → m/s^2 の
                    # 換算と同時に符号を反す。
                    "linear_acceleration": {"x": -float(acc.get("x", 0.0)) * G_TO_MS2,
                                            "y": -float(acc.get("y", 0.0)) * G_TO_MS2,
                                            "z": -float(acc.get("z", 0.0)) * G_TO_MS2},
                    "linear_acceleration_covariance": [0.0] * 9,
                }, ts)
                stats["imu"] += 1

        def _flush_arkit(upto_ts: int, inclusive: bool) -> None:
            nonlocal arkit_i
            while arkit_i < len(arkit_rows):
                row = arkit_rows[arkit_i]
                ts = int(row["timestamp_ns"])
                if ts > upto_ts or (ts == upto_ts and not inclusive):
                    break
                arkit_i += 1
                write("/arkit/imu", {
                    "header": {"stamp": _stamp(ts), "frame_id": "camera_link"},
                    "orientation": {"x": float(row.get("qx", 0.0)), "y": float(row.get("qy", 0.0)),
                                    "z": float(row.get("qz", 0.0)), "w": float(row.get("qw", 1.0))},
                    "orientation_covariance": [0.0] * 9,  # 実測していない不確かさは「不明」宣言
                    "angular_velocity": {"x": float(row.get("wx", 0.0)), "y": float(row.get("wy", 0.0)),
                                         "z": float(row.get("wz", 0.0))},
                    "angular_velocity_covariance": [0.0] * 9,
                    "linear_acceleration": {"x": 0.0, "y": 0.0, "z": 0.0},
                    "linear_acceleration_covariance": no_estimate,  # 加速度は持たないストリーム
                }, ts)
                stats["arkit_imu"] += 1
                write("/camera/tracking_state",
                      _tracking_msg(ts, int(row.get("tracking_state", 2)),
                                    row.get("tracking_reason", "")), ts)
                stats["tracking"] += 1

        def _flush_metrics(upto_ts: int, inclusive: bool) -> None:
            nonlocal metrics_i
            while metrics_i < len(metrics_rows):
                row = metrics_rows[metrics_i]
                ts = int(row["timestamp_ns"])
                if ts > upto_ts or (ts == upto_ts and not inclusive):
                    break
                metrics_i += 1
                write("/device/metrics", {
                    "header": {"stamp": _stamp(ts), "frame_id": "device"},
                    "battery_level": float(row.get("battery_level", -1.0)),
                    "battery_state": int(row.get("battery_state", 0)),
                    "battery_state_str": str(row.get("battery_state_str", "")),
                    "cpu_usage": float(row.get("cpu_usage", 0.0)),
                    "memory_used_mb": float(row.get("memory_used_mb", 0.0)),
                    "memory_available_mb": float(row.get("memory_available_mb", 0.0)),
                    "thermal_state": int(row.get("thermal_state", 0)),
                    "thermal_state_str": str(row.get("thermal_state_str", "")),
                    "device_model": str(row.get("device_model", meta.get("device_model", ""))),
                }, ts)
                stats["metrics"] += 1

        # /trajectory は増分 Path: 書くたびにバッファを空にする
        traj_buf: list[dict] = []
        traj_last_ts: int | None = None
        prev_quat: dict | None = None

        depth_gen = _depth_entries()
        depth_next = next(depth_gen, None)
        pc_gen = _pc_entries()
        pc_next = next(pc_gen, None)
        depth_info_written = False

        def _write_frame(idx: int, out_rgb) -> None:
            """1 フレーム分のメッセージ群を撮影時刻順の定位置へ書く。"""
            nonlocal depth_next, pc_next, traj_last_ts, depth_info_written, prev_quat
            row = frames_meta[idx]
            ts = int(row["timestamp_ns"])

            # このフレームより過去の補助ストリームを先に流す
            _flush_arkit(ts, inclusive=False)
            _flush_metrics(ts, inclusive=False)

            # camera_info (per-frame。 OIS / AF で内部パラメータは毎フレーム動く)
            k9 = row.get("camera_intrinsics")
            if isinstance(k9, list) and len(k9) == 9:
                fx, cx, fy, cy = float(k9[0]), float(k9[2]), float(k9[4]), float(k9[5])
            else:
                fx, fy, cx, cy = cam["fx"], cam["fy"], cam["cx"], cam["cy"]
            write("/camera/camera_info",
                  _camera_info_msg(ts, cam["width"], cam["height"], fx, fy, cx, cy), ts)

            # pose + tf (+ 5 秒ごとの trajectory)
            t4 = row["camera_transform"]  # row-major 4x4 (ARKit world ← camera)
            pos = {"x": float(t4[0][3]), "y": float(t4[1][3]), "z": float(t4[2][3])}
            quat = _rot_to_quat([r[:3] for r in t4[:3]])
            # 半球連続化: q と -q は同一回転。 行列→四元数の分岐が行ごとに独立なので、
            # 前フレームと符号を揃えて列としての連続性を保証する (微分する利用者の罠を消す)。
            if prev_quat is not None and (quat["x"] * prev_quat["x"] + quat["y"] * prev_quat["y"]
                                          + quat["z"] * prev_quat["z"] + quat["w"] * prev_quat["w"]) < 0:
                quat = {k: -v for k, v in quat.items()}
            prev_quat = quat
            pose_msg = {"header": {"stamp": _stamp(ts), "frame_id": "world"},
                        "pose": {"position": pos, "orientation": quat}}
            write("/camera/pose", pose_msg, ts)
            stats["pose"] += 1
            write("/tf", {"transforms": [
                {"header": {"stamp": _stamp(ts), "frame_id": "world"},
                 "child_frame_id": "camera_link",
                 "transform": {"translation": pos, "rotation": quat}},
                {"header": {"stamp": _stamp(ts), "frame_id": "camera_link"},
                 "child_frame_id": "camera_optical_frame",
                 # ARKit カメラ軸 (x右, y上, z手前) → 光学フレーム (x右, y下, z前) の X 軸 180° 回転
                 "transform": {"translation": {"x": 0.0, "y": 0.0, "z": 0.0},
                               "rotation": {"x": 1.0, "y": 0.0, "z": 0.0, "w": 0.0}}},
            ]}, ts)
            traj_buf.append(pose_msg)
            if traj_last_ts is None or ts - traj_last_ts >= TRAJECTORY_INTERVAL_NS:
                write("/trajectory", {"header": {"stamp": _stamp(ts), "frame_id": "world"},
                                      "poses": traj_buf}, ts)
                stats["trajectory"] += 1
                traj_buf.clear()
                traj_last_ts = ts

            # point cloud (このフレームの VIO 特徴点スナップショット)
            while pc_next is not None and int(pc_next.get("frame_index", -1)) < idx:
                pc_next = next(pc_gen, None)
            while pc_next is not None and int(pc_next.get("frame_index", -1)) == idx:
                pts = np.frombuffer(base64.b64decode(pc_next["points_b64"]), dtype="<f4").reshape(-1, 3)
                write("/map/point_cloud", _point_cloud2_msg(ts, pts), ts)
                stats["point_cloud_msgs"] += 1
                pc_next = next(pc_gen, None)

            # depth (+ confidence)。 tar 側の欠番はそのまま欠けとして許容する。
            while depth_next is not None and depth_next[0] < idx:
                depth_next = next(depth_gen, None)
            while depth_next is not None and depth_next[0] == idx:
                _, kind, raw = depth_next
                depth_next = next(depth_gen, None)
                img = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_UNCHANGED)
                if img is None:
                    continue
                h, w = img.shape[:2]
                if kind == "depth":
                    if img.dtype != np.uint16:
                        continue
                    write("/camera/depth", {
                        "header": {"stamp": _stamp(ts), "frame_id": "camera_optical_frame"},
                        "height": int(h), "width": int(w),
                        "encoding": "16UC1", "is_bigendian": 0, "step": int(w * 2),
                        "data": np.ascontiguousarray(img).tobytes(),
                    }, ts)
                    stats["depth"] += 1
                    if not depth_info_written and "depth" in cam:
                        d = cam["depth"]
                        write("/camera/depth/camera_info",
                              _camera_info_msg(ts, d["width"], d["height"],
                                               d["fx"], d["fy"], d["cx"], d["cy"]), ts)
                        depth_info_written = True
                else:
                    if img.dtype != np.uint8:
                        continue
                    write("/camera/depth/confidence", {
                        "header": {"stamp": _stamp(ts), "frame_id": "camera_optical_frame"},
                        "height": int(h), "width": int(w),
                        "encoding": "mono8", "is_bigendian": 0, "step": int(w),
                        "data": np.ascontiguousarray(img).tobytes(),
                    }, ts)
                    stats["confidence"] += 1

            # rgb (ぼかし適用済みの RGB → JPEG)
            zones = ng_schedule.get(idx)
            if zones:
                out_rgb = _apply_zone_blur(out_rgb, zones)
            ok_enc, jpg = cv2.imencode(".jpg", cv2.cvtColor(out_rgb, cv2.COLOR_RGB2BGR),
                                       [int(cv2.IMWRITE_JPEG_QUALITY), jpeg_quality])
            if not ok_enc:
                raise RuntimeError(f"jpeg encode failed at frame {idx}")
            write("/camera/rgb/compressed", {
                "header": {"stamp": _stamp(ts), "frame_id": "camera_optical_frame"},
                "format": "jpeg",
                "data": jpg.tobytes(),
            }, ts)
            stats["rgb"] += 1

            # tracking: 全 ARFrame ストリームがあればそちらから (このフレーム自身の分を含める)。
            # 無い旧収録では frames 行 (= 書き込まれたフレームのみ) から。
            if arkit_rows:
                _flush_arkit(ts, inclusive=True)
            else:
                write("/camera/tracking_state",
                      _tracking_msg(ts, int(row.get("tracking_state", 2)),
                                    row.get("tracking_reason", "")), ts)
                stats["tracking"] += 1

            # IMU はこのフレームまでの分をまとめて (収録側も ARFrame ごとの一括書き)
            _flush_imu(ts)
            _flush_metrics(ts, inclusive=True)

        # ── mp4 デコード → (batch ぼかし) → フレーム駆動書き込み ──
        # RGB フレームのタイムスタンプは jsonl 行とのインデックス 1:1 対応が前提。
        # 範囲外 = 端末側で行と mp4 フレームがずれた不整合データなので、 捏造せず即失敗する。
        batch_size = face_backend.batch_size if face_backend is not None else 1
        cap = cv2.VideoCapture(os.path.join(session_dir, "rgb.mp4"))
        try:
            bgr_batch: list = []
            i_batch: list = []
            i = 0

            def _flush_rgb_batch() -> None:
                if not bgr_batch:
                    return
                if face_backend is not None:
                    rgb_batch = face_backend.blur_batch(bgr_batch)
                else:
                    rgb_batch = [cv2.cvtColor(b, cv2.COLOR_BGR2RGB) for b in bgr_batch]
                for idx, out_rgb in zip(i_batch, rgb_batch):
                    if idx >= len(frames_meta):
                        raise RuntimeError(
                            f"rgb.mp4 has more frames than pose rows in frames.jsonl "
                            f"(frame index {idx} >= {len(frames_meta)} rows); refusing to fabricate timestamps"
                        )
                    _write_frame(idx, out_rgb)

            while True:
                ok, bgr = cap.read()
                if not ok:
                    break
                bgr_batch.append(bgr)
                i_batch.append(i)
                i += 1
                if len(bgr_batch) >= batch_size:
                    _flush_rgb_batch()
                    bgr_batch = []
                    i_batch = []
            _flush_rgb_batch()
        finally:
            cap.release()

        # 検品: mp4 のフレーム数と pose 行数は端末側の設計で厳密に一致する。 ずれていたら
        # RGB のタイムスタンプ / pose 対応が壊れたデータなので、 納品せずここで止める。
        if i != len(frames_meta):
            raise RuntimeError(
                f"frame/pose count mismatch: rgb.mp4 decoded {i} frames but "
                f"frames.jsonl has {len(frames_meta)} rows; "
                f"RGB timestamps would be misaligned, aborting"
            )

        # 最終フレーム以降に残った補助ストリーム / IMU を流し切る
        _flush_arkit(1 << 62, inclusive=True)
        _flush_metrics(1 << 62, inclusive=True)
        _flush_imu(1 << 62)

        # ── /map/mesh + /map/mesh_cloud (= 全 ARMeshAnchor を統合した 1 Marker) ──
        mesh_path = os.path.join(session_dir, "mesh.jsonl")
        if os.path.exists(mesh_path):
            all_tri_pts = []
            all_world_verts = []
            with open(mesh_path) as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    row = json.loads(line)
                    verts = np.frombuffer(base64.b64decode(row["vertices_b64"]), dtype="<f4").reshape(-1, 3)
                    faces = np.frombuffer(base64.b64decode(row["faces_b64"]), dtype="<u4").reshape(-1, 3)
                    t4 = np.asarray(row["transform"], dtype=np.float64)  # row-major 4x4 (anchor → world)
                    world = (verts @ t4[:3, :3].T + t4[:3, 3]).astype("<f4")
                    all_world_verts.append(world)
                    all_tri_pts.append(world[faces.reshape(-1)])  # TRIANGLE_LIST 展開
            if all_tri_pts:
                tri = np.concatenate(all_tri_pts, axis=0)
                write("/map/mesh", {
                    "header": {"stamp": _stamp(last_ts), "frame_id": "world"},
                    "ns": "",
                    "id": 0,
                    "type": 11,   # TRIANGLE_LIST
                    "action": 0,  # ADD
                    "pose": {"position": {"x": 0.0, "y": 0.0, "z": 0.0},
                             "orientation": {"x": 0.0, "y": 0.0, "z": 0.0, "w": 1.0}},
                    "scale": {"x": 1.0, "y": 1.0, "z": 1.0},
                    "color": {"r": 1.0, "g": 1.0, "b": 1.0, "a": 1.0},
                    "lifetime": {"sec": 0, "nanosec": 0},
                    "frame_locked": False,
                    "points": [{"x": float(p[0]), "y": float(p[1]), "z": float(p[2])} for p in tri],
                    "colors": [],
                    "text": "",
                    "mesh_resource": "",
                    "mesh_use_embedded_materials": False,
                }, last_ts)
                merged = np.concatenate(all_world_verts, axis=0)
                write("/map/mesh_cloud", _point_cloud2_msg(last_ts, merged), last_ts)
                stats["mesh_vertices"] = int(merged.shape[0])

        # ── metadata.json 全体を dot-flatten で Metadata record に同梱 ──
        out.add_metadata("session_metadata", _flatten_metadata(meta))

        out.finish()

    detections_total = face_backend.detections_total if face_backend is not None else 0
    return {
        "stats": stats,
        "blur": blur,
        "faceDetector": face_detector if blur else None,
        "detectionsTotal": detections_total,
        "ngMarkerZoneFrames": len(ng_schedule),
        "durationMs": int((time.time() - t0) * 1000),
        "outputBytes": os.path.getsize(out_path),
        "jsonlFrames": len(frames_meta),
    }
