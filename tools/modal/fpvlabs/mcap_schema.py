"""ROS 2 schemas and encoding helpers used by RootLens delivery MCAP files."""

from __future__ import annotations

import json

# ─── ROS2 スキーマ (= .msg 全文。 登録順ごと固定) ───────────────────────
#
# スキーマ本文が MCAP に埋め込まれる正本。 型参照は ROS2 正式の 3 部形式 (pkg/msg/Type)。
# エンコーダ (mcap_ros2 の serialize_dynamic) は 2 部形式しか解釈しないため、
# _McapOut が "/msg/" を落とした等価テキストからエンコーダを生成する (本文は無改変で登録)。

_HEADER_TIME_DEP = """================================================================================
MSG: std_msgs/msg/Header
builtin_interfaces/msg/Time stamp
string frame_id
================================================================================
MSG: builtin_interfaces/msg/Time
int32 sec
uint32 nanosec"""

_POSE_DEP = """================================================================================
MSG: geometry_msgs/msg/Pose
geometry_msgs/msg/Point position
geometry_msgs/msg/Quaternion orientation
================================================================================
MSG: geometry_msgs/msg/Point
float64 x
float64 y
float64 z
================================================================================
MSG: geometry_msgs/msg/Quaternion
float64 x
float64 y
float64 z
float64 w"""

_VEC3_DEP = """================================================================================
MSG: geometry_msgs/msg/Vector3
float64 x
float64 y
float64 z"""

# 登録順が schema id (1 始まり) を決める。 順序は納品先ツールの既存ファイルと揃えて固定。
SCHEMAS: list[tuple[str, str]] = [
    ("geometry_msgs/msg/PoseStamped", f"""std_msgs/msg/Header header
geometry_msgs/msg/Pose pose
{_HEADER_TIME_DEP}
{_POSE_DEP}"""),
    ("sensor_msgs/msg/Imu", f"""std_msgs/msg/Header header
geometry_msgs/msg/Quaternion orientation
float64[9] orientation_covariance
geometry_msgs/msg/Vector3 angular_velocity
float64[9] angular_velocity_covariance
geometry_msgs/msg/Vector3 linear_acceleration
float64[9] linear_acceleration_covariance
{_HEADER_TIME_DEP}
================================================================================
MSG: geometry_msgs/msg/Quaternion
float64 x
float64 y
float64 z
float64 w
{_VEC3_DEP}"""),
    ("sensor_msgs/msg/Image", f"""std_msgs/msg/Header header
uint32 height
uint32 width
string encoding
uint8 is_bigendian
uint32 step
uint8[] data
{_HEADER_TIME_DEP}"""),
    ("sensor_msgs/msg/CompressedImage", f"""std_msgs/msg/Header header
string format
uint8[] data
{_HEADER_TIME_DEP}"""),
    ("sensor_msgs/msg/PointCloud2", f"""std_msgs/msg/Header header
uint32 height
uint32 width
sensor_msgs/msg/PointField[] fields
bool is_bigendian
uint32 point_step
uint32 row_step
uint8[] data
bool is_dense
{_HEADER_TIME_DEP}
================================================================================
MSG: sensor_msgs/msg/PointField
string name
uint32 offset
uint8 datatype
uint32 count"""),
    ("visualization_msgs/msg/Marker", f"""std_msgs/msg/Header header
string ns
int32 id
int32 type
int32 action
geometry_msgs/msg/Pose pose
geometry_msgs/msg/Vector3 scale
std_msgs/msg/ColorRGBA color
builtin_interfaces/msg/Duration lifetime
bool frame_locked
geometry_msgs/msg/Point[] points
std_msgs/msg/ColorRGBA[] colors
string text
string mesh_resource
bool mesh_use_embedded_materials
{_HEADER_TIME_DEP}
{_POSE_DEP}
{_VEC3_DEP}
================================================================================
MSG: std_msgs/msg/ColorRGBA
float32 r
float32 g
float32 b
float32 a
================================================================================
MSG: builtin_interfaces/msg/Duration
int32 sec
uint32 nanosec"""),
    ("sensor_msgs/msg/CameraInfo", f"""std_msgs/msg/Header header
uint32 height
uint32 width
string distortion_model
float64[] d
float64[9] k
float64[9] r
float64[12] p
uint32 binning_x
uint32 binning_y
sensor_msgs/msg/RegionOfInterest roi
{_HEADER_TIME_DEP}
================================================================================
MSG: sensor_msgs/msg/RegionOfInterest
uint32 x_offset
uint32 y_offset
uint32 height
uint32 width
bool do_rectify"""),
    ("tf2_msgs/msg/TFMessage", f"""geometry_msgs/msg/TransformStamped[] transforms
================================================================================
MSG: geometry_msgs/msg/TransformStamped
std_msgs/msg/Header header
string child_frame_id
geometry_msgs/msg/Transform transform
{_HEADER_TIME_DEP}
================================================================================
MSG: geometry_msgs/msg/Transform
geometry_msgs/msg/Vector3 translation
geometry_msgs/msg/Quaternion rotation
{_VEC3_DEP}
================================================================================
MSG: geometry_msgs/msg/Quaternion
float64 x
float64 y
float64 z
float64 w"""),
    ("nav_msgs/msg/Path", f"""std_msgs/msg/Header header
geometry_msgs/msg/PoseStamped[] poses
{_HEADER_TIME_DEP}
================================================================================
MSG: geometry_msgs/msg/PoseStamped
std_msgs/msg/Header header
geometry_msgs/msg/Pose pose
{_POSE_DEP}"""),
    ("rootlens/msg/TrackingState", f"""std_msgs/msg/Header header
uint8 state
uint8 reason
string state_str
string reason_str
{_HEADER_TIME_DEP}"""),
    ("rootlens/msg/DeviceMetrics", f"""std_msgs/msg/Header header
float32 battery_level
uint8 battery_state
string battery_state_str
float32 cpu_usage
float64 memory_used_mb
float64 memory_available_mb
uint8 thermal_state
string thermal_state_str
string device_model
{_HEADER_TIME_DEP}"""),
    ("rootlens/msg/ImuIntrinsics", f"""std_msgs/msg/Header header
float64 accel_noise_density
float64 gyro_noise_density
float64 accel_bias_random_walk
float64 gyro_bias_random_walk
geometry_msgs/msg/Vector3 accel_bias
geometry_msgs/msg/Vector3 gyro_bias
uint32 sample_rate_hz
string source
{_HEADER_TIME_DEP}
{_VEC3_DEP}"""),
    ("std_msgs/msg/String", "string data"),
]

# 登録順が channel id (1 始まり) を決める。 データが無いトピックも登録は行う
# (= メッセージ 0 件のチャンネルとしてファイルに残る)。
CHANNELS: list[tuple[str, str]] = [
    ("/camera/pose", "geometry_msgs/msg/PoseStamped"),
    ("/device/imu", "sensor_msgs/msg/Imu"),
    ("/camera/depth", "sensor_msgs/msg/Image"),
    ("/camera/rgb/compressed", "sensor_msgs/msg/CompressedImage"),
    ("/map/point_cloud", "sensor_msgs/msg/PointCloud2"),
    ("/map/mesh", "visualization_msgs/msg/Marker"),
    ("/map/mesh_cloud", "sensor_msgs/msg/PointCloud2"),
    ("/camera/camera_info", "sensor_msgs/msg/CameraInfo"),
    ("/camera/depth/camera_info", "sensor_msgs/msg/CameraInfo"),
    ("/tf", "tf2_msgs/msg/TFMessage"),
    ("/device/camera_imu_extrinsics", "tf2_msgs/msg/TFMessage"),
    ("/trajectory", "nav_msgs/msg/Path"),
    ("/camera/tracking_state", "rootlens/msg/TrackingState"),
    ("/device/metrics", "rootlens/msg/DeviceMetrics"),
    ("/device/imu/intrinsics", "rootlens/msg/ImuIntrinsics"),
    ("/arkit/imu", "sensor_msgs/msg/Imu"),
    ("/arkit/imu/intrinsics", "rootlens/msg/ImuIntrinsics"),
    ("/camera/depth/confidence", "sensor_msgs/msg/Image"),
    ("/rootlens/processing_info", "std_msgs/msg/String"),
]


class _McapOut:
    """schema / channel を固定順で先行登録し、 通し番号 sequence 付きでメッセージを書く MCAP 出力。

    schema 本文は SCHEMAS の 3 部形式テキストをそのまま登録し、 CDR エンコーダは
    "/msg/" を落とした等価テキストから生成する (serialize_dynamic が 2 部形式のみ対応のため)。"""

    def __init__(self, f):
        from mcap.writer import Writer as McapWriter
        from mcap_ros2._dynamic import serialize_dynamic

        self._w = McapWriter(f, chunk_size=512 * 1024)
        self._w.start(profile="ros2", library=f"rootlens-fpvlabs/{PIPELINE_VERSION}")
        self._seq = 0
        self._encoders: dict[str, object] = {}
        schema_ids: dict[str, int] = {}
        for name, text in SCHEMAS:
            schema_ids[name] = self._w.register_schema(
                name=name, encoding="ros2msg", data=text.encode())
            pname = name.replace("/msg/", "/")
            self._encoders[name] = serialize_dynamic(pname, text.replace("/msg/", "/"))[pname]
        self._channels: dict[str, tuple[int, str]] = {}
        for topic, schema_name in CHANNELS:
            cid = self._w.register_channel(
                topic=topic, message_encoding="cdr", schema_id=schema_ids[schema_name])
            self._channels[topic] = (cid, schema_name)

    def write(self, topic: str, msg: dict, ts_ns: int) -> None:
        cid, schema_name = self._channels[topic]
        self._w.add_message(
            channel_id=cid, log_time=ts_ns, data=self._encoders[schema_name](msg),
            publish_time=ts_ns, sequence=self._seq)
        self._seq += 1

    def add_metadata(self, name: str, data: dict) -> None:
        self._w.add_metadata(name, data)

    def finish(self) -> None:
        self._w.finish()


_XYZC_FIELDS = [
    {"name": "x", "offset": 0, "datatype": 7, "count": 1},
    {"name": "y", "offset": 4, "datatype": 7, "count": 1},
    {"name": "z", "offset": 8, "datatype": 7, "count": 1},
    {"name": "confidence", "offset": 12, "datatype": 7, "count": 1},
]


def _point_cloud2_msg(ts_ns: int, xyz_f32, confidence: float = 1.0) -> dict:
    """xyz (N,3) float32 + 一律 confidence → x,y,z,confidence の PointCloud2 (point_step 16)。"""
    import numpy as np

    n = int(xyz_f32.shape[0])
    packed = np.empty((n, 4), dtype="<f4")
    packed[:, :3] = xyz_f32
    packed[:, 3] = confidence
    return {
        "header": {"stamp": _stamp(ts_ns), "frame_id": "world"},
        "height": 1,
        "width": n,
        "fields": _XYZC_FIELDS,
        "is_bigendian": False,
        "point_step": 16,
        "row_step": 16 * n,
        "data": np.ascontiguousarray(packed).tobytes(),
        "is_dense": True,
    }

TRACKING_STATE_STR = {0: "not_available", 1: "limited", 2: "normal"}
# 収録側の理由文字列 (ARKit enum 由来の camelCase) → 納品形式の (reason code, reason_str)。
TRACKING_REASONS = {
    "": (0, "none"),
    "unknown": (0, "none"),
    "initializing": (1, "initializing"),
    "excessiveMotion": (2, "excessive_motion"),
    "insufficientFeatures": (3, "insufficient_features"),
    "relocalizing": (4, "relocalizing"),
}


def _tracking_msg(ts_ns: int, state: int, raw_reason: str) -> dict:
    code, reason_str = TRACKING_REASONS.get(str(raw_reason), (0, "none"))
    if state != 1:
        code, reason_str = 0, "none"  # 理由は limited のときだけ意味を持つ
    return {
        "header": {"stamp": _stamp(ts_ns), "frame_id": "camera_link"},
        "state": int(state),
        "reason": code,
        "state_str": TRACKING_STATE_STR.get(int(state), str(state)),
        "reason_str": reason_str,
    }
G_TO_MS2 = 9.80665
TRAJECTORY_INTERVAL_NS = 5_000_000_000  # /trajectory の増分書き出し間隔


def _stamp(ts_ns: int) -> dict:
    return {"sec": int(ts_ns // 1_000_000_000), "nanosec": int(ts_ns % 1_000_000_000)}


def _flatten_metadata(meta: dict) -> dict:
    """metadata.json を dot 区切り 1 段の str→str に潰す (MCAP Metadata record 用)。"""
    flat: dict[str, str] = {}

    def rec(prefix: str, v) -> None:
        if isinstance(v, dict):
            for k, vv in v.items():
                rec(f"{prefix}.{k}" if prefix else str(k), vv)
        elif isinstance(v, (list, tuple)):
            flat[prefix] = json.dumps(v, ensure_ascii=False)
        elif isinstance(v, bool):
            flat[prefix] = "true" if v else "false"
        elif v is None:
            flat[prefix] = ""
        else:
            flat[prefix] = str(v)

    rec("", meta)
    return flat


def _rot_to_quat(r) -> dict:
    """row-major 3x3 → quaternion dict (x,y,z,w)。"""
    import numpy as np

    R = np.asarray(r, dtype=np.float64)
    tr = R[0, 0] + R[1, 1] + R[2, 2]
    if tr > 0:
        s = 0.5 / np.sqrt(tr + 1.0)
        w = 0.25 / s
        x = (R[2, 1] - R[1, 2]) * s
        y = (R[0, 2] - R[2, 0]) * s
        z = (R[1, 0] - R[0, 1]) * s
    elif R[0, 0] > R[1, 1] and R[0, 0] > R[2, 2]:
        s = 2.0 * np.sqrt(1.0 + R[0, 0] - R[1, 1] - R[2, 2])
        w = (R[2, 1] - R[1, 2]) / s
        x = 0.25 * s
        y = (R[0, 1] + R[1, 0]) / s
        z = (R[0, 2] + R[2, 0]) / s
    elif R[1, 1] > R[2, 2]:
        s = 2.0 * np.sqrt(1.0 + R[1, 1] - R[0, 0] - R[2, 2])
        w = (R[0, 2] - R[2, 0]) / s
        x = (R[0, 1] + R[1, 0]) / s
        y = 0.25 * s
        z = (R[1, 2] + R[2, 1]) / s
    else:
        s = 2.0 * np.sqrt(1.0 + R[2, 2] - R[0, 0] - R[1, 1])
        w = (R[1, 0] - R[0, 1]) / s
        x = (R[0, 2] + R[2, 0]) / s
        y = (R[1, 2] + R[2, 1]) / s
        z = 0.25 * s
    # 端末側の姿勢は float32 精度で生成される。 CDR は float64 フィールドだが、 値の
    # 量子化粒度を収録経路と揃えるため float32 に丸めてから昇格する。
    return {"x": float(np.float32(x)), "y": float(np.float32(y)),
            "z": float(np.float32(z)), "w": float(np.float32(w))}


def _camera_info_msg(ts_ns: int, width: int, height: int, fx: float, fy: float, cx: float, cy: float) -> dict:
    k = [fx, 0.0, cx, 0.0, fy, cy, 0.0, 0.0, 1.0]
    return {
        "header": {"stamp": _stamp(ts_ns), "frame_id": "camera_optical_frame"},
        "height": int(height),
        "width": int(width),
        "distortion_model": "plumb_bob",
        "d": [],
        "k": k,
        "r": [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0],
        "p": [fx, 0.0, cx, 0.0, 0.0, fy, cy, 0.0, 0.0, 0.0, 1.0, 0.0],
        "binning_x": 0,
        "binning_y": 0,
        "roi": {"x_offset": 0, "y_offset": 0, "height": 0, "width": 0, "do_rectify": False},
    }


# ─── 顔ぼかし backend (= EgoBlur GPU / mediapipe CPU) ─────────────
