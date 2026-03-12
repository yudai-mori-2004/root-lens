// ナビゲーション型定義

export interface MediaItem {
  uri: string;
  type: 'image' | 'video';
}

export type RootStackParamList = {
  Main: undefined;
  Camera: undefined;
  CameraGallery: undefined;
  Edit: { mediaItems: MediaItem[] };
  Publishing: { mediaItems: MediaItem[] };
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
