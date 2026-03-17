// ナビゲーション型定義

export interface MediaItem {
  uri: string;
  type: 'image' | 'video';
}

/** 公開完了時の結果。contentHash は Title Protocol TEE が算出 (§2.1) */
export interface PublishResult {
  shortId: string;
  pageUrl: string;
  /** content_hash = SHA-256(Active Manifest の COSE 署名) — TEE が算出 */
  contentHash: string;
  /** Solana TX署名（delegateMint: true の場合） */
  txSignature: string;
}

export type RootStackParamList = {
  Main: undefined;
  Camera: undefined;
  CameraGallery: undefined;
  Edit: { mediaItems: MediaItem[] };
  Publishing: { signedUris: string[]; address: string; userId: string };
  Preview: { contentIds: string[] };
  Registration: { signedUris: string[] };
};

export type GalleryStackParamList = {
  Gallery: undefined;
  Settings: undefined;
};

export type TabParamList = {
  PublishedTab: undefined;
  CameraTab: undefined;
  DeviceGalleryTab: undefined;
};
