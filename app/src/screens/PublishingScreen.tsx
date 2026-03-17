import React, { useEffect, useState, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import * as VideoThumbnails from 'expo-video-thumbnails';
import * as Crypto from 'expo-crypto';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList, PublishResult } from '../navigation/types';
import { config } from '../config';
import { registerOnTitleProtocol } from '../services/titleProtocol';
import { colors, typography, spacing, radii, shadows } from '../theme';
import { t } from '../i18n';

// 仕様書 §2.4 公開パイプライン実行
// §6.1 パイプラインA: Title Protocol登録（クライアント側）
// §6.2 パイプラインB: R2直接アップロード + ページ作成
// 両パイプラインを並列実行

const DISPLAY_MAX_WIDTH = 1600;
const OGP_WIDTH = 1200;

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'Publishing'>;

type Phase = 'publishing' | 'done' | 'error';
type ProgressStep = 'signing' | 'uploading' | 'registering';

const STEP_KEYS: { key: ProgressStep; i18nKey: string }[] = [
  { key: 'signing', i18nKey: 'publishing.step.signing' },
  { key: 'uploading', i18nKey: 'publishing.step.uploading' },
  { key: 'registering', i18nKey: 'publishing.step.registering' },
];

/** ファイルパスからメディアタイプを推定 */
function detectMediaType(uri: string): 'image' | 'video' | 'audio' {
  const lower = uri.toLowerCase();
  if (lower.match(/\.(mp4|mov|m4v|avi|webm|mkv)$/)) return 'video';
  if (lower.match(/\.(mp3|wav|m4a|aac|ogg|flac)$/)) return 'audio';
  return 'image';
}

/** メディアタイプに応じたMIMEタイプ */
function mimeForUpload(mediaType: string, ext: string): string {
  if (mediaType === 'video') return `video/${ext === 'mov' ? 'quicktime' : ext}`;
  if (mediaType === 'audio') return `audio/${ext}`;
  return 'image/jpeg';
}

export default function PublishingScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { signedUris, address } = route.params;

  const [phase, setPhase] = useState<Phase>('publishing');
  const [currentStep, setCurrentStep] = useState<ProgressStep>('signing');
  const [result, setResult] = useState<PublishResult | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const publishingRef = useRef(false);

  // サムネイル生成（メディアタイプ別）
  const generateThumbnails = async (fileUri: string, mediaType: string) => {
    if (mediaType === 'image') {
      const [display, ogp] = await Promise.all([
        ImageManipulator.manipulateAsync(
          fileUri,
          [{ resize: { width: DISPLAY_MAX_WIDTH } }],
          { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG },
        ),
        ImageManipulator.manipulateAsync(
          fileUri,
          [{ resize: { width: OGP_WIDTH } }],
          { compress: 0.80, format: ImageManipulator.SaveFormat.JPEG },
        ),
      ]);
      return { displayUri: display.uri, ogpUri: ogp.uri };
    }

    if (mediaType === 'video') {
      // 動画: 先頭フレームを抽出してサムネイルに使用
      const thumb = await VideoThumbnails.getThumbnailAsync(fileUri, { time: 0 });
      const [display, ogp] = await Promise.all([
        ImageManipulator.manipulateAsync(
          thumb.uri,
          [{ resize: { width: DISPLAY_MAX_WIDTH } }],
          { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG },
        ),
        ImageManipulator.manipulateAsync(
          thumb.uri,
          [{ resize: { width: OGP_WIDTH } }],
          { compress: 0.80, format: ImageManipulator.SaveFormat.JPEG },
        ),
      ]);
      return { displayUri: display.uri, ogpUri: ogp.uri };
    }

    // audio等: サムネイルなし（プレースホルダー）
    return { displayUri: null, ogpUri: null };
  };

  // 1件分のTP登録 + R2アップロードを実行
  const processOneContent = async (uri: string) => {
    const fileUri = uri.startsWith('file://') ? uri : `file://${uri}`;
    const mediaType = detectMediaType(uri);
    const ext = uri.match(/\.(\w+)$/)?.[1] || 'jpg';

    // バイナリ読み取り（Title Protocol SDK用）
    const fileBase64 = await FileSystem.readAsStringAsync(
      fileUri,
      { encoding: FileSystem.EncodingType.Base64 },
    );
    const binaryStr = atob(fileBase64);
    const content = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      content[i] = binaryStr.charCodeAt(i);
    }

    const fileId = Crypto.randomUUID();

    // パイプラインA (TP登録) と パイプラインB (R2アップロード) を並列実行
    const [tpResult, r2Urls] = await Promise.all([
      registerOnTitleProtocol(content),

      (async () => {
        // サムネイル生成
        const thumbs = await generateThumbnails(fileUri, mediaType);

        // presigned URL取得: サムネイル + OGP + (動画の場合) 本体
        const urlRequests: Promise<Response>[] = [];

        if (thumbs.displayUri) {
          urlRequests.push(
            fetch(config.uploadUrlEndpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ fileId, contentType: 'image/jpeg', kind: 'content' }),
            }),
            fetch(config.uploadUrlEndpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ fileId, contentType: 'image/jpeg', kind: 'ogp' }),
            }),
          );
        }

        // 動画・音声: 元ファイル本体もアップロード
        if (mediaType !== 'image') {
          urlRequests.push(
            fetch(config.uploadUrlEndpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ fileId, contentType: mimeForUpload(mediaType, ext), kind: 'media' }),
            }),
          );
        }

        const urlResponses = await Promise.all(urlRequests);
        if (urlResponses.some(r => !r.ok)) {
          throw new Error('presigned URL の取得に失敗しました');
        }

        const urlData = await Promise.all(urlResponses.map(r => r.json()));

        // アップロード実行
        const uploads: Promise<any>[] = [];
        let displayPublicUrl = '';
        let ogpPublicUrl = '';
        let mediaPublicUrl = '';
        let idx = 0;

        if (thumbs.displayUri && thumbs.ogpUri) {
          displayPublicUrl = urlData[idx].publicUrl;
          uploads.push(FileSystem.uploadAsync(urlData[idx].uploadUrl, thumbs.displayUri, {
            httpMethod: 'PUT',
            headers: { 'Content-Type': 'image/jpeg' },
            uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
          }));
          idx++;

          ogpPublicUrl = urlData[idx].publicUrl;
          uploads.push(FileSystem.uploadAsync(urlData[idx].uploadUrl, thumbs.ogpUri, {
            httpMethod: 'PUT',
            headers: { 'Content-Type': 'image/jpeg' },
            uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
          }));
          idx++;
        }

        if (mediaType !== 'image') {
          mediaPublicUrl = urlData[idx].publicUrl;
          uploads.push(FileSystem.uploadAsync(urlData[idx].uploadUrl, fileUri, {
            httpMethod: 'PUT',
            headers: { 'Content-Type': mimeForUpload(mediaType, ext) },
            uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
          }));
        }

        await Promise.all(uploads);

        return {
          displayPublicUrl: displayPublicUrl || mediaPublicUrl,
          ogpPublicUrl: ogpPublicUrl || displayPublicUrl || mediaPublicUrl,
          mediaUrl: mediaPublicUrl || '',
        };
      })(),
    ]);

    return {
      contentHash: tpResult.contentHash,
      txSignature: tpResult.txSignature,
      thumbnailUrl: r2Urls.displayPublicUrl,
      ogpImageUrl: r2Urls.ogpPublicUrl,
      mediaUrl: r2Urls.mediaUrl,
      mediaType,
    };
  };

  const publish = async () => {
    if (publishingRef.current) return;
    publishingRef.current = true;
    setPhase('publishing');
    setCurrentStep('signing');
    setErrorMessage('');

    try {
      setCurrentStep('uploading');

      // 全コンテンツを順次処理（TEEノードの負荷を考慮）
      const results: Awaited<ReturnType<typeof processOneContent>>[] = [];
      for (const uri of signedUris) {
        results.push(await processOneContent(uri));
      }

      setCurrentStep('registering');

      // 全コンテンツのメタデータを一括でサーバーに送信
      const publishRes = await fetch(config.publishUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: results.map(r => ({
            contentHash: r.contentHash,
            thumbnailUrl: r.thumbnailUrl,
            ogpImageUrl: r.ogpImageUrl,
            mediaUrl: r.mediaUrl,
            mediaType: r.mediaType,
          })),
          address: address || undefined,
        }),
      });

      if (!publishRes.ok) {
        const errBody = await publishRes.text();
        throw new Error(`ページ作成に失敗: ${errBody}`);
      }

      const serverData = await publishRes.json();

      const data: PublishResult = {
        shortId: serverData.shortId,
        pageUrl: serverData.pageUrl,
      };

      setResult(data);
      setPhase('done');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      setErrorMessage(msg);
      setPhase('error');
    } finally {
      publishingRef.current = false;
    }
  };

  useEffect(() => {
    publish();
  }, []);

  const handleDone = () => {
    navigation.popToTop();
  };

  const handleCopyLink = async () => {
    if (!result) return;
    await Clipboard.setStringAsync(result.pageUrl);
    Alert.alert(t('publishing.copied'), result.pageUrl);
  };

  const handleShare = async () => {
    if (!result) return;
    try {
      await Share.share({ message: result.pageUrl });
    } catch (_) {}
  };

  // --- ローディング ---
  // デザイン方針: 下寄せ。ステップリストが主体。スピナーは控えめに。
  if (phase === 'publishing') {
    const currentStepIndex = STEP_KEYS.findIndex(s => s.key === currentStep);

    return (
      <SafeAreaView style={styles.loadingContainer}>
        <View style={styles.loadingSpacer} />
        <View style={styles.loadingBottom}>
          <Text style={styles.loadingTitle}>{t('publishing.loading')}</Text>
          <View style={styles.stepsContainer}>
            {STEP_KEYS.map((step, i) => {
              const isActive = i === currentStepIndex;
              const isDone = i < currentStepIndex;
              return (
                <View key={step.key} style={styles.stepRow}>
                  {isDone ? (
                    <Ionicons name="checkmark" size={16} color={colors.accent} />
                  ) : isActive ? (
                    <ActivityIndicator size="small" color={colors.accent} />
                  ) : (
                    <View style={styles.stepDotPending} />
                  )}
                  <Text style={[
                    styles.stepLabel,
                    isActive && styles.stepLabelActive,
                    isDone && styles.stepLabelDone,
                  ]}>
                    {t(step.i18nKey)}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // --- エラー ---
  // デザイン方針: 下寄せ。エラーメッセージ+アクション。
  if (phase === 'error') {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <View style={styles.loadingSpacer} />
        <View style={styles.errorBottom}>
          <Text style={styles.errorTitle}>{t('publishing.errorTitle')}</Text>
          <Text style={styles.errorText}>{errorMessage}</Text>
          <View style={styles.errorActions}>
            <TouchableOpacity style={styles.retryButton} onPress={publish}>
              <Text style={styles.retryButtonText}>{t('publishing.retry')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelButton} onPress={handleDone}>
              <Text style={styles.cancelButtonText}>{t('publishing.back')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // --- 完了: WebViewで公開ページ表示 ---
  return (
    <SafeAreaView style={styles.container}>
      {/* ヘッダー */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('publishing.doneTitle')}</Text>
        <TouchableOpacity style={styles.doneButton} onPress={handleDone}>
          <Text style={styles.doneButtonText}>{t('publishing.done')}</Text>
        </TouchableOpacity>
      </View>

      {/* 共有バー */}
      <View style={styles.shareBar}>
        <TouchableOpacity style={styles.sharePrimaryButton} onPress={handleShare}>
          <Ionicons name="share-outline" size={20} color={colors.white} />
          <Text style={styles.sharePrimaryText}>{t('publishing.share')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.shareLinkButton} onPress={handleCopyLink}>
          <Ionicons name="link-outline" size={18} color={colors.accent} />
          <Text style={styles.shareLinkText}>{t('publishing.copyLink')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.moreButton}
          onPress={() => {
            Alert.alert(
              t('menu.deleteConfirm'),
              t('menu.deleteConfirmMessage'),
              [
                { text: t('menu.cancel'), style: 'cancel' },
                {
                  text: t('menu.delete'),
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await fetch(`${config.serverUrl}/api/v1/pages/${result!.shortId}`, { method: 'DELETE' });
                      Alert.alert(t('menu.deleted'));
                      handleDone();
                    } catch {}
                  },
                },
              ],
            );
          }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="ellipsis-vertical" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* 公開ページ WebView */}
      <WebView
        source={{ uri: result!.pageUrl }}
        style={styles.webview}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.webviewLoading}>
            <ActivityIndicator size="small" color={colors.textHint} />
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  // ローディング — 下寄せ
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingSpacer: {
    flex: 1,
  },
  loadingBottom: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.xl,
  },
  loadingTitle: {
    ...typography.heading,
    color: colors.textPrimary,
  },
  // プログレスステップ
  stepsContainer: {
    gap: spacing.lg,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 24,
  },
  stepDotPending: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.surfaceAlt,
  },
  stepLabel: {
    ...typography.body,
    color: colors.textHint,
  },
  stepLabelActive: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  stepLabelDone: {
    color: colors.textSecondary,
  },
  // エラー — 下寄せ
  errorBottom: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  errorTitle: {
    ...typography.heading,
    color: colors.textPrimary,
  },
  errorText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  errorActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  retryButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.md,
  },
  retryButtonText: {
    color: colors.white,
    ...typography.bodyMedium,
  },
  cancelButton: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelButtonText: {
    color: colors.textSecondary,
    ...typography.bodyMedium,
  },
  // ヘッダー
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    height: 52,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  headerTitle: {
    ...typography.title,
    color: colors.textPrimary,
  },
  doneButton: {
    backgroundColor: colors.accent,
    paddingVertical: spacing.sm,
    paddingHorizontal: 18,
    borderRadius: radii.xl,
  },
  doneButtonText: {
    color: colors.white,
    ...typography.captionMedium,
  },
  // 共有バー
  shareBar: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  sharePrimaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.accent,
  },
  sharePrimaryText: {
    color: colors.white,
    ...typography.bodyMedium,
  },
  shareLinkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.accent,
  },
  shareLinkText: {
    color: colors.accent,
    ...typography.captionMedium,
  },
  moreButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  // WebView
  webview: {
    flex: 1,
  },
  webviewLoading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
