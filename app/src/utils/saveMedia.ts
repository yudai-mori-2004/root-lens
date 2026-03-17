import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';

const ALBUM_NAME = 'RootLens';

/**
 * メディアをRootLensアルバムに保存する。
 * ファイル名: RL_YYYYMMDD_HHmmss_NNN.ext
 *
 * DCIM/RootLens/ に整理される（Android）。
 * iOSではアルバムとして表示される。
 */
export async function saveToRootLensAlbum(uri: string): Promise<MediaLibrary.Asset> {
  // ファイル名を生成
  const now = new Date();
  const ts = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    '_',
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('');
  const rand = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
  const ext = uri.match(/\.(\w+)$/)?.[1] || 'jpg';
  const filename = `RL_${ts}_${rand}.${ext}`;

  // 一時ファイルをリネーム（ファイル名を反映させるため）
  const destUri = `${FileSystem.cacheDirectory}${filename}`;
  await FileSystem.copyAsync({ from: uri, to: destUri });

  // アセット作成
  const asset = await MediaLibrary.createAssetAsync(destUri);

  // RootLensアルバムに追加（なければ作成）
  let album = await MediaLibrary.getAlbumAsync(ALBUM_NAME);
  if (album) {
    await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
  } else {
    album = await MediaLibrary.createAlbumAsync(ALBUM_NAME, asset, false);
  }

  // 一時ファイル削除
  await FileSystem.deleteAsync(destUri, { idempotent: true });

  return asset;
}
