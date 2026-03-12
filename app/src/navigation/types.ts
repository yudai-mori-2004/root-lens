// ナビゲーション型定義

export interface MediaItem {
  uri: string;
  type: 'image' | 'video';
}

/** POST /api/v1/publish のレスポンス */
export interface PublishResult {
  shortId: string;
  pageUrl: string;
  contentHash: string;
  assetId: string;
  txSignature: string;
}

export type RootStackParamList = {
  Main: undefined;
  Camera: undefined;
  CameraGallery: undefined;
  Edit: { mediaItems: MediaItem[] };
  Publishing: { signedUris: string[] };
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
