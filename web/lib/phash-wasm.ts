/**
 * phash-v1.wasm をブラウザで実行するランナー。
 *
 * TEEのWasmRunnerと同じホスト関数をJS/Canvasで実装し、
 * DCT計算はWASM（TEEと同一バイナリ）が行う。
 * これにより pHash の完全一致が保証される。
 *
 * 将来的に wasm_source が GlobalConfig に入ったら、
 * そこからダウンロードする形に切り替える。
 */

// WASM バイナリのURL（public/wasm/ に配置）
// TODO: GlobalConfig.trusted_wasm_modules[].wasm_source から動的取得に変更
const PHASH_WASM_URL = "/wasm/phash-v1.wasm";

let wasmCache: ArrayBuffer | null = null;

async function loadWasm(): Promise<ArrayBuffer> {
  if (wasmCache) return wasmCache;
  const res = await fetch(PHASH_WASM_URL);
  if (!res.ok) throw new Error(`Failed to load phash WASM: ${res.status}`);
  wasmCache = await res.arrayBuffer();
  return wasmCache;
}

/**
 * 画像URLから4回転(0/90/180/270度)のpHashを全て計算する（phash-v1.wasm使用）。
 * TEEと完全に同一のバイナリでDCTを実行。
 * 回転考慮により:
 * - EXIF orientation差異を吸収
 * - 回転耐性の向上（pHashの弱点補強）
 */
export async function computePHashRotations(imageUrl: string): Promise<string[]> {
  const [wasmBuf, gray32_0] = await Promise.all([
    loadWasm(),
    loadAndResizeImage(imageUrl),
  ]);

  // 0/90/180/270度の32x32グレースケールを生成
  const rotations = [
    gray32_0,
    rotate90(gray32_0, 32),
    rotate180(gray32_0, 32),
    rotate270(gray32_0, 32),
  ];

  const hashes: string[] = [];
  for (const gray of rotations) {
    const hash = await runWasmPHash(wasmBuf, gray);
    hashes.push(hash);
  }
  return hashes;
}

/** 単一のpHash計算（後方互換） */
export async function computePHashWasm(imageUrl: string): Promise<string> {
  const hashes = await computePHashRotations(imageUrl);
  return hashes[0];
}

/** WASMでpHashを1回計算 */
async function runWasmPHash(wasmBuf: ArrayBuffer, gray32: Uint8Array): Promise<string> {
  let memory: WebAssembly.Memory;
  const decodedGray = gray32;

  const importObject = {
    env: {
      decode_content: (_paramsPtr: number, _paramsLen: number, metadataPtr: number): number => {
        const view = new DataView(memory.buffer);
        view.setUint32(metadataPtr, 32, true);
        view.setUint32(metadataPtr + 4, 32, true);
        view.setUint32(metadataPtr + 8, 1, true);
        return 0;
      },
      get_decoded_feature: (_specPtr: number, _specLen: number, outputPtr: number): number => {
        const dst = new Uint8Array(memory.buffer, outputPtr, 1024);
        dst.set(decodedGray);
        return 1024;
      },
      read_content_chunk: (_offset: number, _length: number, _bufPtr: number): number => 0,
      get_content_length: (): number => 0,
      get_extension_input: (_bufPtr: number, _bufLen: number): number => 0,
    },
  };

  const { instance } = await WebAssembly.instantiate(wasmBuf, importObject);
  memory = instance.exports.memory as WebAssembly.Memory;

  const process = instance.exports.process as () => number;
  const resultPtr = process();
  if (resultPtr === 0) throw new Error("phash WASM returned null");

  const view = new DataView(memory.buffer);
  const jsonLen = view.getUint32(resultPtr, true);
  const jsonBytes = new Uint8Array(memory.buffer, resultPtr + 4, jsonLen);
  const result = JSON.parse(new TextDecoder().decode(jsonBytes));

  if (result.error) throw new Error(`phash WASM error: ${result.error}`);
  return result.phash;
}

// --- 32x32 回転ユーティリティ ---

function rotate90(src: Uint8Array, size: number): Uint8Array {
  const dst = new Uint8Array(size * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      dst[x * size + (size - 1 - y)] = src[y * size + x];
  return dst;
}

function rotate180(src: Uint8Array, size: number): Uint8Array {
  const dst = new Uint8Array(size * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      dst[(size - 1 - y) * size + (size - 1 - x)] = src[y * size + x];
  return dst;
}

function rotate270(src: Uint8Array, size: number): Uint8Array {
  const dst = new Uint8Array(size * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      dst[(size - 1 - x) * size + y] = src[y * size + x];
  return dst;
}

/**
 * 画像をロード → グレースケール変換 → Triangle(bilinear)補間で32x32リサイズ。
 * Rust image crate の to_luma8() + resize(Triangle) と同一の処理順序・アルゴリズム。
 *
 * 処理順序が重要:
 * 1. まずフルサイズでグレースケール変換（Rust: to_luma8()）
 * 2. グレースケール画像を32x32にTriangle補間でリサイズ
 * Canvas.drawImage は RGB でリサイズしてからグレースケールにするため結果が異なる。
 */
async function loadAndResizeImage(url: string): Promise<Uint8Array> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = "anonymous";
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    el.src = url;
  });

  // 1. フルサイズでピクセルデータ取得
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  const fullData = ctx.getImageData(0, 0, img.naturalWidth, img.naturalHeight);
  const pixels = fullData.data;
  const srcW = img.naturalWidth;
  const srcH = img.naturalHeight;

  // 2. フルサイズでグレースケール変換（Rust image crate to_luma8 と同等: Rec.601）
  const grayFull = new Float64Array(srcW * srcH);
  for (let i = 0; i < srcW * srcH; i++) {
    const r = pixels[i * 4];
    const g = pixels[i * 4 + 1];
    const b = pixels[i * 4 + 2];
    grayFull[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  // 3. Triangle (bilinear) 補間で 32x32 にリサイズ
  const gray32 = triangleResize(grayFull, srcW, srcH, 32, 32);
  return gray32;
}

/**
 * Triangle (bilinear) 補間リサイズ。
 * Rust image crate の FilterType::Triangle と同等。
 * 分離型（水平→垂直）で実装。
 */
function triangleResize(
  src: Float64Array, srcW: number, srcH: number,
  dstW: number, dstH: number,
): Uint8Array {
  // 水平リサイズ
  const tmp = new Float64Array(dstW * srcH);
  const xRatio = srcW / dstW;
  for (let y = 0; y < srcH; y++) {
    for (let x = 0; x < dstW; x++) {
      const center = (x + 0.5) * xRatio - 0.5;
      const left = Math.floor(center - xRatio);
      const right = Math.ceil(center + xRatio);
      let sum = 0, weightSum = 0;
      for (let sx = Math.max(0, left); sx <= Math.min(srcW - 1, right); sx++) {
        const dist = Math.abs(sx - center);
        const w = Math.max(0, 1 - dist / xRatio);
        if (w > 0) {
          sum += src[y * srcW + sx] * w;
          weightSum += w;
        }
      }
      tmp[y * dstW + x] = weightSum > 0 ? sum / weightSum : 0;
    }
  }

  // 垂直リサイズ
  const result = new Uint8Array(dstW * dstH);
  const yRatio = srcH / dstH;
  for (let x = 0; x < dstW; x++) {
    for (let y = 0; y < dstH; y++) {
      const center = (y + 0.5) * yRatio - 0.5;
      const top = Math.floor(center - yRatio);
      const bottom = Math.ceil(center + yRatio);
      let sum = 0, weightSum = 0;
      for (let sy = Math.max(0, top); sy <= Math.min(srcH - 1, bottom); sy++) {
        const dist = Math.abs(sy - center);
        const w = Math.max(0, 1 - dist / yRatio);
        if (w > 0) {
          sum += tmp[sy * dstW + x] * w;
          weightSum += w;
        }
      }
      result[y * dstW + x] = Math.max(0, Math.min(255, Math.round(weightSum > 0 ? sum / weightSum : 0)));
    }
  }

  return result;
}
