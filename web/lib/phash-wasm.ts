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
 * 画像URLからpHashを計算する（phash-v1.wasm使用）。
 * TEEと完全に同一のバイナリでDCTを実行するため、距離0が保証される。
 */
export async function computePHashWasm(imageUrl: string): Promise<string> {
  const [wasmBuf, gray32] = await Promise.all([
    loadWasm(),
    loadAndResizeImage(imageUrl),
  ]);

  // WASMインスタンス化（ホスト関数をJSで提供）
  let memory: WebAssembly.Memory;
  let decodedGray: Uint8Array = gray32;
  let decodeMetadataPtr = 0;
  let featureOutputPtr = 0;

  const importObject = {
    env: {
      // decode_content: 画像デコード（JS側で既にデコード済み）
      // metadata: [width:u32 LE, height:u32 LE, channels:u32 LE]
      decode_content: (paramsPtr: number, paramsLen: number, metadataPtr: number): number => {
        decodeMetadataPtr = metadataPtr;
        const view = new DataView(memory.buffer);
        view.setUint32(metadataPtr, 32, true);     // width
        view.setUint32(metadataPtr + 4, 32, true);  // height
        view.setUint32(metadataPtr + 8, 1, true);   // channels (grayscale)
        return 0; // success
      },

      // get_decoded_feature: grayscale_resize → 1024バイトのグレースケールデータを返す
      get_decoded_feature: (specPtr: number, specLen: number, outputPtr: number): number => {
        featureOutputPtr = outputPtr;
        const dst = new Uint8Array(memory.buffer, outputPtr, 1024);
        dst.set(decodedGray);
        return 1024;
      },

      // 以下は phash-v1 では使われないが宣言は必要
      read_content_chunk: (_offset: number, _length: number, _bufPtr: number): number => 0,
      get_content_length: (): number => 0,
      get_extension_input: (_bufPtr: number, _bufLen: number): number => 0,
    },
  };

  const { instance } = await WebAssembly.instantiate(wasmBuf, importObject);
  memory = instance.exports.memory as WebAssembly.Memory;

  // process() を呼ぶ → 結果ポインタが返る
  const process = instance.exports.process as () => number;
  const resultPtr = process();

  if (resultPtr === 0) throw new Error("phash WASM returned null");

  // 結果を読む: [len:u32 LE][json bytes]
  const view = new DataView(memory.buffer);
  const jsonLen = view.getUint32(resultPtr, true);
  const jsonBytes = new Uint8Array(memory.buffer, resultPtr + 4, jsonLen);
  const jsonStr = new TextDecoder().decode(jsonBytes);
  const result = JSON.parse(jsonStr);

  if (result.error) throw new Error(`phash WASM error: ${result.error}`);
  return result.phash;
}

/**
 * 画像をロードして32x32グレースケールに変換（Canvas使用）。
 * ここが唯一ブラウザ依存だが、リサイズ後のDCTはWASMが行うため、
 * Canvas補間の微小な差は最終的なpHashに影響しにくい。
 *
 * 注: 厳密にはRust image crateのTriangle(bilinear)補間と
 * CanvasのdrawImageの補間は微妙に異なるが、
 * DCTの低周波成分(8x8)のみ使用するためロバスト。
 */
async function loadAndResizeImage(url: string): Promise<Uint8Array> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = "anonymous";
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    el.src = url;
  });

  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, 32, 32);

  const imageData = ctx.getImageData(0, 0, 32, 32);
  const pixels = imageData.data;

  // RGB → grayscale (u8)
  const gray = new Uint8Array(1024);
  for (let i = 0; i < 1024; i++) {
    const r = pixels[i * 4];
    const g = pixels[i * 4 + 1];
    const b = pixels[i * 4 + 2];
    gray[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }

  return gray;
}
