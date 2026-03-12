import { NativeModules, Platform } from 'react-native';
import { requireNativeModule } from 'expo-modules-core';

// 仕様書 §4.6.2 ネイティブモジュールIF
// React Native JS層にはTEE操作やC2PA構造の詳細を一切露出させない

// 仕様書 §4.5 C2PAマニフェスト読み取り結果
export interface C2paManifestInfo {
  has_manifest: boolean;
  /** 暗号検証に致命的失敗がないか (mismatch/failure系がなければtrue) */
  is_valid?: boolean;
  signer_common_name?: string;
  /** 署名者のOrganization。信頼リスト判定に使用 */
  signer_org?: string;
  claim_generator?: string;
  validation_status?: Array<{
    code: string;
    url?: string;
    explanation?: string;
  }>;
  error?: string;
}

export interface MaskRect {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
}

export interface VideoProcessOptions {
  cropX?: number;
  cropY?: number;
  cropW?: number;
  cropH?: number;
  outputW?: number;
  outputH?: number;
  startMs?: number;
  endMs?: number;
}

interface C2paBridgeInterface {
  signContent(imagePath: string): Promise<string>;
  readManifest(imagePath: string): Promise<string>;
  applyMasks(imagePath: string, masks: MaskRect[]): Promise<string>;
  processVideo(inputPath: string, optionsJson: string): Promise<string>;
  getVersion(): Promise<string>;
}

// Expo Modules API (iOS) or legacy NativeModules (Android)
let C2paBridge: C2paBridgeInterface | null = null;
try {
  C2paBridge = requireNativeModule('C2paBridge');
} catch {
  // Expo module not available, try legacy NativeModules (Android)
  C2paBridge = NativeModules.C2paBridge ?? null;
}

/**
 * C2PA署名を実行する
 * @param imagePath 入力画像のパス
 * @returns 署名済みファイルのパス
 */
export async function signContent(imagePath: string): Promise<string> {
  if (!C2paBridge) {
    throw new Error(
      `C2paBridge native module is not available on ${Platform.OS}`,
    );
  }
  return C2paBridge.signContent(imagePath);
}

/**
 * C2PAマニフェストを読み取る
 * 仕様書 §4.5 C2PAマニフェスト読み取り
 * @param imagePath 入力画像のパス
 * @returns マニフェスト情報
 */
export async function readManifest(imagePath: string): Promise<C2paManifestInfo> {
  if (!C2paBridge) {
    return { has_manifest: false, error: `C2paBridge not available on ${Platform.OS}` };
  }
  try {
    const json = await C2paBridge.readManifest(imagePath);
    return JSON.parse(json) as C2paManifestInfo;
  } catch (e) {
    return { has_manifest: false, error: String(e) };
  }
}

/**
 * 画像にマスク（黒塗り矩形）を描画する
 * @param imagePath 入力画像のパス
 * @param masks マスク矩形の配列（ピクセル座標）
 * @returns マスク適用済み画像のパス
 */
export async function applyMasks(imagePath: string, masks: MaskRect[]): Promise<string> {
  if (!C2paBridge) {
    throw new Error(`C2paBridge native module is not available on ${Platform.OS}`);
  }
  return C2paBridge.applyMasks(imagePath, masks);
}

/**
 * 動画にクロップ・リサイズ・トリムを適用する
 * @param inputPath 入力動画のパス
 * @param options 処理オプション（クロップ座標、出力サイズ、トリム範囲）
 * @returns 処理済み動画のパス
 */
export async function processVideo(inputPath: string, options: VideoProcessOptions): Promise<string> {
  if (!C2paBridge) {
    throw new Error(`C2paBridge native module is not available on ${Platform.OS}`);
  }
  return C2paBridge.processVideo(inputPath, JSON.stringify(options));
}

/**
 * c2pa-bridgeのバージョンを返す
 */
export async function getVersion(): Promise<string> {
  if (!C2paBridge) {
    return 'not available';
  }
  return C2paBridge.getVersion();
}
