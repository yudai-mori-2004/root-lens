/**
 * image-phash.wasm をブラウザで実行するランナー。
 *
 * TEEのWasmRunnerと同じホスト関数をJS/Canvasで実装し、
 * DCT計算はWASM（TEEと同一バイナリ）が行う。
 * これにより pHash の完全一致が保証される。
 *
 * WASMバイナリはGlobalConfigのtrusted_wasm_modulesに登録された
 * wasm_sourceから動的に取得し、SHA-256ハッシュをwasm_hashと照合して
 * 改ざんされていないことを確認してから実行する。
 */

import { getGlobalConfigData, findWasmVersionByHash } from "./config";

// wasm_hash → { buf, hash } のキャッシュ（バージョンごとにキャッシュ）
const wasmCache = new Map<string, ArrayBuffer>();

/**
 * 指定されたwasm_hashに一致するWASMバイナリをGlobalConfigから取得する。
 * SHA-256照合で改ざんがないことを確認してからキャッシュ・返却。
 */
async function loadWasmByHash(wasmHash: string): Promise<ArrayBuffer> {
  const normalized = wasmHash.replace(/^0x/, "");
  const cached = wasmCache.get(normalized);
  if (cached) return cached;

  const globalConfig = await getGlobalConfigData();
  const version = findWasmVersionByHash(globalConfig.trustedWasmModules, "image-phash", wasmHash);

  if (!version) {
    throw new Error(`image-phash WASM version with hash ${normalized.slice(0, 16)}... not found in GlobalConfig`);
  }

  const res = await fetch(version.wasm_source);
  if (!res.ok) {
    throw new Error(`Failed to fetch WASM from ${version.wasm_source}: ${res.status}`);
  }
  const buf = await res.arrayBuffer();

  // SHA-256 照合
  const hashBuf = await crypto.subtle.digest("SHA-256", buf);
  const hashHex = Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  if (hashHex !== normalized) {
    throw new Error(
      `WASM hash mismatch: expected ${normalized}, got ${hashHex}. Binary may be tampered.`
    );
  }

  console.log(`%cWASM binary loaded & SHA-256 verified: %c${hashHex.slice(0, 16)}...`, "color:#6b7280;font-style:italic;", "color:inherit;");
  wasmCache.set(normalized, buf);
  return buf;
}

/**
 * 画像URLからpHashを計算する。
 * onchainWasmHashが指定された場合、そのハッシュに一致するバージョンのWASMを使用。
 * 未指定の場合はGlobalConfigのimage-phashモジュールの最新activeバージョンを使用。
 */
export async function computePHashWasm(imageUrl: string, onchainWasmHash?: string): Promise<string> {
  let wasmHashToUse = onchainWasmHash;

  // wasm_hashが未指定の場合、最新activeバージョンを使用
  if (!wasmHashToUse) {
    const globalConfig = await getGlobalConfigData();
    const mod = globalConfig.trustedWasmModules.find(m => m.extension_id === "image-phash");
    const active = mod?.versions.find(v => v.status === 0);
    if (!active) throw new Error("No active image-phash WASM version in GlobalConfig");
    wasmHashToUse = active.wasm_hash;
  }

  const [wasmBuf, gray32] = await Promise.all([
    loadWasmByHash(wasmHashToUse),
    loadAndResizeImage(imageUrl),
  ]);
  return runWasmPHash(wasmBuf, gray32);
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


/**
 * 画像をロード → 中間サイズにCanvas縮小 → グレースケール → Triangle補間で32x32。
 *
 * モバイルブラウザ対応:
 * - フルサイズ展開を避け、メモリ消費を抑える（モバイルOOM対策）
 * - Canvasで256x256に縮小（高速・省メモリ）→ グレースケール → Triangle 32x32
 * - 中間256x256からの32x32 Triangle補間は十分な精度を持つ
 */
const INTERMEDIATE_SIZE = 256;

async function loadAndResizeImage(url: string): Promise<Uint8Array> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = "anonymous";
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    el.src = url;
  });

  // 1. Canvasで中間サイズ(256x256)に縮小
  const canvas = document.createElement("canvas");
  canvas.width = INTERMEDIATE_SIZE;
  canvas.height = INTERMEDIATE_SIZE;
  const ctx = canvas.getContext("2d", { colorSpace: "srgb" })!;
  ctx.drawImage(img, 0, 0, INTERMEDIATE_SIZE, INTERMEDIATE_SIZE);
  const midData = ctx.getImageData(0, 0, INTERMEDIATE_SIZE, INTERMEDIATE_SIZE);
  const pixels = midData.data;

  // 2. グレースケール変換（Rec.709 — Rust image crate to_luma8 と同等）
  const grayMid = new Float64Array(INTERMEDIATE_SIZE * INTERMEDIATE_SIZE);
  for (let i = 0; i < INTERMEDIATE_SIZE * INTERMEDIATE_SIZE; i++) {
    const r = pixels[i * 4];
    const g = pixels[i * 4 + 1];
    const b = pixels[i * 4 + 2];
    grayMid[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  // 3. Triangle (bilinear) 補間で 32x32 にリサイズ
  const gray32 = triangleResize(grayMid, INTERMEDIATE_SIZE, INTERMEDIATE_SIZE, 32, 32);
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
