# pipeline-fpvlabs: raw セッション → (任意) 顔ぼかし → ROS2 スキーマの納品 MCAP。
#
# FPV Labs へのデータ受け渡し用。 rootlens-raw-arkit の raw/<unit_id>/ を読み、
# 任意で顔ぼかしを適用した上で (= --blur/--no-blur、 既定オン) ROS2 スキーマの MCAP を
# 時系列インターリーブで組み立て、 rootlens-fpvlabs バケットへ書く。
# 撮影者は写っている人全員の許可を取得済み (= ぼかしは追加保護)。
#
# 顔検出器は EgoBlur (Meta gen2 TorchScript、 arXiv:2308.13093) が既定。
# GPU で batch 推論、 短辺リサイズを効かせて 1 時間あたり数十円を狙う (詳細は EGOBLUR_* 定数)。
# 検出器の切替: --face-detector egoblur|mediapipe (mediapipe は CPU 動作の fallback)。
#
#   入力: raw/<unit_id>/{rgb.mp4, frames.jsonl, imu.jsonl, metadata.json[, depth.tar,
#         pointcloud.jsonl, mesh.jsonl, arkit_imu.jsonl, device_metrics.jsonl]}
#         (frames.jsonl は旧収録では realtime_handpose.jsonl。 どちらか必須。
#          arkit_imu / device_metrics は新収録のみ = 無いセッションではトピックが空になるだけ)
#   出力: <unit_id>/{session.mcap,delivery-manifest.json}
#
# チャンネルは CHANNELS の固定順で全て先行登録し (= データが無いトピックも登録だけは残る)、
# メッセージは撮影時刻順にインターリーブして書く。 トピック一覧と型は CHANNELS を参照。
# 主要な値の規約:
#   /camera/pose             ARKit world、 ARKit-native 軸のまま
#   /device/imu              比力 m/s^2 (REP 145: 静止時 +g)、 CoreMotion 軸、 covariance は全ゼロ = 不明
#   /camera/depth            16UC1 (mm)。 /camera/depth/confidence は mono8 0=low/1=med/2=high
#   /tf                      毎 pose: world→camera_link + camera_link→camera_optical_frame (180° X 回転)
#   /trajectory              5 秒ごとの増分 Path (書くたびにバッファを空にする)
#   /rootlens/processing_info std_msgs/String (JSON: ぼかし有無・モデル・検出閾値・pipeline version)
#
# 冪等性: 出力キーは unit_id から決定論的。 ローカル一時ファイルに全て書いてから
# 1 回の put_object / multipart で上書きする (= 半端な状態がバケットに残らない)。
# 設定を変えて再実行すれば同キーが新しい内容で置き換わり、 processing_info で判別できる。
#
# 事前セットアップ (Modal, 1 回だけ):
#   1. EgoBlur モデル jit を Modal Volume に置く:
#        modal volume create rootlens-egoblur
#        modal volume put rootlens-egoblur references/egoblur/ego_blur_face_gen2.jit /
#      jit は Meta EgoBlur の gen2 顔検出モデル (400MB)。 Modal image はビルド時に
#      https://github.com/facebookresearch/EgoBlur を clone するので、 gen2 ソースは自動で入る。
#
# 実行:
#   ローカル:  python tools/modal/fpvlabs/fpvlabs.py <unit_id>   (R2 creds は env で、 ぼかしオン)
#   Modal:    modal run --detach tools/modal/fpvlabs/fpvlabs.py --unit-id <unit_id>            (ぼかしオン)
#             modal run --detach tools/modal/fpvlabs/fpvlabs.py --unit-id <unit_id> --no-blur  (ぼかしオフ)
#             (--detach: クライアント切断やセッション終了でジョブを道連れにしない)
#   deploy:   modal deploy tools/modal/fpvlabs/fpvlabs.py

from __future__ import annotations

import datetime as dt
import hashlib
import io
import json
import os
import tarfile
import tempfile
import time

from anonymization import EGOBLUR_CODE_DIR, EGOBLUR_JIT_PATH
from mcap_builder import build_mcap


# ─── R2 入出力 (= 決定論的キーへの上書きで冪等) ────────────────────────

SESSION_FILES = ["rgb.mp4", "frames.jsonl", "realtime_handpose.jsonl", "imu.jsonl", "metadata.json", "depth.tar", "pointcloud.jsonl", "mesh.jsonl", "arkit_imu.jsonl", "device_metrics.jsonl"]


def _r2_client():
    import boto3

    account_id = os.environ["R2_ACCOUNT_ID"]
    return boto3.client(
        "s3",
        endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )


def _clip_db_row(unit_id: str) -> dict:
    """clips に accounts (現場属性) を join して引く。 未登録クリップ
    (= POST /api/clips を通っていないアップロード) と、 accounts に行が無い
    アカウント (= テスト端末など納品対象外) はどちらも fail-loud。"""
    import psycopg2

    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    try:
        with conn.cursor() as cur:
            cur.execute(
                "select c.account_id, c.duration_ms, c.recorded_at, a.domain, a.site,"
                " c.source_manifest_sha256, c.source_files"
                " from clips c left join accounts a on a.id = c.account_id"
                " where c.unit_id = %s",
                (unit_id,),
            )
            row = cur.fetchone()
    finally:
        conn.close()
    if not row:
        raise RuntimeError(f"clip not registered in DB: {unit_id}")
    account_id, duration_ms, recorded_at, domain, site, source_manifest, source_files = row
    if domain is None:
        raise RuntimeError(
            f"account {account_id} has no accounts row; "
            f"insert (id, domain, site) before delivering its clips")
    if not isinstance(source_manifest, str) or len(source_manifest) != 64 or not isinstance(source_files, list):
        raise RuntimeError(f"clip has no valid source manifest: {unit_id}")
    return {"account_id": str(account_id), "duration_ms": duration_ms,
            "recorded_at": recorded_at, "domain": domain, "site": site,
            "source_manifest_sha256": source_manifest, "source_files": source_files}


def _sha256_file(path: str) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as source:
        for chunk in iter(lambda: source.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _verify_source_manifest(unit_id: str, directory: str, expected_files: list[dict], expected_hash: str) -> None:
    if (not expected_files or not isinstance(expected_hash, str)
            or len(expected_hash) != 64 or any(ch not in "0123456789abcdef" for ch in expected_hash)):
        raise RuntimeError(f"registered source manifest is invalid: {unit_id}")
    names = [item.get("name") for item in expected_files if isinstance(item, dict)]
    if len(names) != len(expected_files) or len(set(names)) != len(names):
        raise RuntimeError(f"registered source manifest has duplicate or invalid entries: {unit_id}")
    files = []
    for item in sorted(expected_files, key=lambda value: value.get("name", "")):
        name = item.get("name")
        path = os.path.join(directory, name) if isinstance(name, str) else ""
        digest = item.get("sha256")
        byte_count = item.get("bytes")
        if (not name or "/" in name or "\\" in name or name in {".", ".."}
                or not isinstance(byte_count, int) or isinstance(byte_count, bool) or byte_count <= 0
                or not isinstance(digest, str) or len(digest) != 64
                or any(ch not in "0123456789abcdef" for ch in digest)
                or not os.path.isfile(path) or os.path.getsize(path) != byte_count
                or _sha256_file(path) != digest):
            raise RuntimeError(f"source file does not match registered manifest: {name}")
        files.append({"name": name, "bytes": byte_count, "sha256": digest})
    payload = {"schema": "io.rootlens.source-manifest.v1", "unit_id": unit_id, "files": files}
    encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    if hashlib.sha256(encoded).hexdigest() != expected_hash:
        raise RuntimeError(f"source manifest does not match registered digest: {unit_id}")


def regenerate_manifest(s3, bucket: str, bucket_raw: str) -> int:
    """manifest.jsonl を DB + R2 の実状態からまるごと作り直す。 行の材料:
    <unit_id>/ の納品manifest + clips テーブル (domain / 尺 / 登録時刻)
    + raw metadata.json (fps / 解像度 / 端末)。 raw や DB 行が欠けたセッションも
    行自体は残して欠損フィールドを null にする (集計を止めない)。
    スキーマを変えるときは README-for-fpv.md の表と gen_manifest.py を同時に更新する。"""
    import psycopg2

    objects: dict[str, dict] = {}
    paginator = s3.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=bucket):
        for obj in page.get("Contents") or []:
            key = obj["Key"]
            if key.count("/") != 1:
                continue
            unit_id, name = key.split("/", 1)
            if name in {"session.mcap", "delivery-manifest.json"}:
                objects.setdefault(unit_id, {})[name] = obj
    sessions = {
        unit_id: value for unit_id, value in objects.items()
        if {"session.mcap", "delivery-manifest.json"}.issubset(value)
    }

    rows: dict[str, dict] = {}
    if sessions:
        conn = psycopg2.connect(os.environ["DATABASE_URL"])
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "select c.unit_id, c.duration_ms, c.created_at, c.recorded_at,"
                    " a.domain, a.site"
                    " from clips c left join accounts a on a.id = c.account_id"
                    " where c.unit_id = any(%s)",
                    (list(sessions),),
                )
                rows = {h: {"duration_ms": d, "created_at": c, "recorded_at": r,
                            "domain": dom, "site": site}
                        for h, d, c, r, dom, site in cur.fetchall()}
        finally:
            conn.close()

    entries = []
    for h, objects_for_unit in sessions.items():
        mcap_bytes = objects_for_unit["session.mcap"]["Size"]
        db_row = rows.get(h)
        try:
            body = s3.get_object(Bucket=bucket_raw, Key=f"raw/{h}/metadata.json")["Body"].read()
            meta = json.loads(body)
        except Exception:
            meta = {}
        camera = meta.get("camera") or {}
        settings = meta.get("capture_settings") or {}
        uploaded = db_row["created_at"] if db_row else None
        # recordedAt の正はunit発行時に固定したclips.recorded_at。
        recorded = db_row["recorded_at"] if db_row else None
        if recorded is not None:
            recorded = recorded.isoformat()
        delivery_head = s3.head_object(Bucket=bucket, Key=f"{h}/delivery-manifest.json")
        delivery_manifest_sha256 = (delivery_head.get("Metadata") or {}).get("delivery-manifest-sha256")
        entries.append({
            "unitId": h,
            "domain": db_row["domain"] if db_row else None,
            "site": db_row["site"] if db_row else None,
            "recordedAt": recorded,
            "uploadedAt": uploaded.isoformat() if uploaded else None,
            "durationSec": round((db_row["duration_ms"] or 0) / 1000.0, 3) if db_row else None,
            "fps": settings.get("recording_rate_hz"),
            "resolution": (f"{camera.get('width')}x{camera.get('height')}"
                           if camera.get("width") else None),
            "device": meta.get("device_model"),
            "osVersion": meta.get("os_version"),
            # 本番バケットには blur なしを置けない (process_session のガードで保証)。
            "blurred": True,
            "mcapBytes": mcap_bytes,
            "deliveryManifestSha256": delivery_manifest_sha256,
        })
    entries.sort(key=lambda e: (e.get("recordedAt") or "", e["unitId"]))
    lines = "".join(json.dumps(e, ensure_ascii=False, separators=(",", ":")) + "\n"
                    for e in entries)
    s3.put_object(Bucket=bucket, Key="manifest.jsonl", Body=lines.encode("utf-8"),
                  ContentType="application/x-ndjson")
    return len(entries)


def process_session(unit_id: str, blur: bool = True,
                    face_detector: str = "egoblur", jpeg_quality: int = 80,
                    target_bucket: str | None = None) -> dict:
    """raw/<unit_id>/ を取得し、納品MCAPとmanifestを<target_bucket>/<unit_id>/へ保存する。

    blur=False で顔ぼかしを無効化 (= raw の生映像そのまま)。
    target_bucket が None のときは環境変数 R2_BUCKET_FPVLABS (既定 rootlens-fpvlabs = 本番) を使う。
    検証時は本番以外の書ける R2 バケットを指定すること。"""
    s3 = _r2_client()
    bucket_raw = os.environ.get("R2_BUCKET_RAW_ARKIT", "rootlens-raw-arkit")
    bucket_out = target_bucket or os.environ.get("R2_BUCKET_FPVLABS", "rootlens-fpvlabs")

    # 本番の納品バケットにはぼかし無しを置かない (= manifest の blurred: true を構造的に保証)。
    if not blur and bucket_out == os.environ.get("R2_BUCKET_FPVLABS", "rootlens-fpvlabs"):
        raise RuntimeError("refusing --no-blur into the production delivery bucket; use --target-bucket")

    # DB 照合とドメイン解決は GPU を回す前に済ませる (未登録 / 属性未設定で即死させる)。
    db_row = _clip_db_row(unit_id)

    with tempfile.TemporaryDirectory() as tmp:
        session_dir = os.path.join(tmp, "session")
        os.makedirs(session_dir)
        if any(not isinstance(item, dict) for item in db_row["source_files"]):
            raise RuntimeError(f"registered source manifest contains invalid entries: {unit_id}")
        source_names = {item.get("name") for item in db_row["source_files"]}
        if not source_names or not source_names.issubset(set(SESSION_FILES)):
            raise RuntimeError(f"registered source manifest contains unsupported files: {unit_id}")
        for name in sorted(source_names):
            key = f"raw/{unit_id}/{name}"
            dest = os.path.join(session_dir, name)
            try:
                s3.download_file(bucket_raw, key, dest)
            except Exception:
                raise RuntimeError(f"required input missing: {key}")
        _verify_source_manifest(unit_id, session_dir, db_row["source_files"],
                                db_row["source_manifest_sha256"])
        if not os.path.exists(os.path.join(session_dir, "frames.jsonl")) and \
           not os.path.exists(os.path.join(session_dir, "realtime_handpose.jsonl")):
            raise RuntimeError(f"required input missing: raw/{unit_id}/frames.jsonl (or legacy realtime_handpose.jsonl)")

        out_path = os.path.join(tmp, "session.mcap")
        result = build_mcap(session_dir, out_path, blur=blur,
                            face_detector=face_detector, jpeg_quality=jpeg_quality)

        delivery_file = {"path": "session.mcap", "bytes": os.path.getsize(out_path),
                         "sha256": _sha256_file(out_path)}
        out_key = f"{unit_id}/session.mcap"
        s3.upload_file(
            out_path,
            bucket_out,
            out_key,
            ExtraArgs={
                "ContentType": "application/octet-stream",
                "Metadata": {
                    "sha256": delivery_file["sha256"],
                    "source-manifest-sha256": db_row["source_manifest_sha256"],
                },
            },
        )
        delivery = {"schema": "io.rootlens.delivery-manifest.v1", "unit_id": unit_id,
                    "source_manifest_sha256": db_row["source_manifest_sha256"],
                    "files": [delivery_file]}
        delivery_bytes = json.dumps(delivery, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        delivery_hash = hashlib.sha256(delivery_bytes).hexdigest()
        s3.put_object(Bucket=bucket_out, Key=f"{unit_id}/delivery-manifest.json",
                      Body=delivery_bytes, ContentType="application/json",
                      Metadata={"delivery-manifest-sha256": delivery_hash})
        result["outputKey"] = f"{bucket_out}/{out_key}"
        result["deliveryManifestSha256"] = delivery_hash

        # manifest を DB + R2 の実状態から再生成 (方式は冒頭の manifest セクションのコメント参照)。
        result["manifestEntries"] = regenerate_manifest(s3, bucket_out, bucket_raw)
        result["domain"] = db_row["domain"]
        return result


# ─── Modal wiring ──────────────────────────────────────────────────────

try:
    import modal

    # EgoBlur repo を build 時に clone (gen2/script/... と detectron2 vendored 版が入る)。
    # commit を pin して再現性を確保。 jit モデル (400MB) は build に混ぜず、
    # 別途 modal volume `rootlens-egoblur` にユーザが 1 回 put する (docstring 参照)。
    EGOBLUR_COMMIT = "75144e14916223313beb6593b631e32ca149d840"

    image = (
        modal.Image.debian_slim(python_version="3.11")
        .apt_install(
            "libgl1", "libglib2.0-0",           # opencv / mediapipe が要求
            "libegl1", "libgles2",
            "git",                               # EgoBlur clone 用
        )
        .pip_install(
            # 共通
            "numpy==1.26.4", "opencv-python-headless==4.11.0.86", "boto3==1.43.93",
            "psycopg2-binary==2.9.13",  # clips テーブル照合 (ドメイン解決) 用
            "mcap==1.4.0", "mcap-ros2-support==0.5.7",
            # mediapipe backend (fallback)
            "mediapipe==0.10.21",
            # egoblur backend (Meta gen2)。 torch は CUDA 版 (Modal image が cuda 対応)。
            "torch==2.9.1", "torchvision==0.24.1", "tqdm==4.70.1",
            "moviepy==1.0.3",  # egoblur package の import 時に必要
        )
        .run_commands(
            f"git init {EGOBLUR_CODE_DIR}",
            f"git -C {EGOBLUR_CODE_DIR} remote add origin https://github.com/facebookresearch/EgoBlur",
            f"git -C {EGOBLUR_CODE_DIR} fetch --depth 1 origin {EGOBLUR_COMMIT}",
            f"git -C {EGOBLUR_CODE_DIR} checkout --detach FETCH_HEAD",
        )
        .add_local_python_source("anonymization", "mcap_builder", "mcap_schema")
    )

    # EgoBlur jit を置く persistent volume。 事前に:
    #   modal volume create rootlens-egoblur
    #   modal volume put rootlens-egoblur references/egoblur/ego_blur_face_gen2.jit /
    egoblur_volume = modal.Volume.from_name("rootlens-egoblur", create_if_missing=True)

    app = modal.App("rootlens-fpvlabs")

    @app.function(
        image=image,
        gpu="L4",                                # egoblur 推論用。 L4 は A10G より 25% 安く、
                                                 # FasterRCNN gen2 の処理には十分。
        timeout=7200,                            # 60 分クリップまで余裕を持たせる
        memory=16384,
        cpu=4.0,
        volumes={"/egoblur_model": egoblur_volume},
        secrets=[
            modal.Secret.from_name("r2-creds"),
            modal.Secret.from_name("supabase-db"),  # DATABASE_URL (clips 照合用)
        ],
    )
    def fpvlabs_process(unit_id: str, blur: bool = True,
                        face_detector: str = "egoblur", jpeg_quality: int = 80,
                        target_bucket: str = "") -> dict:
        return process_session(unit_id, blur=blur,
                               face_detector=face_detector, jpeg_quality=jpeg_quality,
                               target_bucket=target_bucket or None)

    @app.local_entrypoint()
    def main(unit_id: str, blur: bool = True,
             face_detector: str = "egoblur", jpeg_quality: int = 80,
             target_bucket: str = ""):
        # ぼかし切替:   --blur (既定) / --no-blur
        # 検出器切替:   --face-detector egoblur (既定) / mediapipe (CPU fallback)
        # 出力先切替:   --target-bucket <bucket>  (空 = 既定 rootlens-fpvlabs = 本番)
        #              検証やチューニングは自分専用の別バケットを指定して本番に触れないようにする。
        print(json.dumps(
            fpvlabs_process.remote(unit_id, blur, face_detector, jpeg_quality, target_bucket),
            indent=2,
        ))

except ImportError:
    modal = None  # ローカル実行 (= python fpvlabs.py <unit_id>) では modal 不要


if __name__ == "__main__" and (modal is None or os.environ.get("FPVLABS_LOCAL")):
    import sys

    print(json.dumps(process_session(sys.argv[1]), indent=2))
