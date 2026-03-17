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

export default function PublishingScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { signedUris, address } = route.params;

  const [phase, setPhase] = useState<Phase>('publishing');
  const [currentStep, setCurrentStep] = useState<ProgressStep>('signing');
  const [result, setResult] = useState<PublishResult | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const publishingRef = useRef(false);

  const publish = async () => {
    if (publishingRef.current) return;
    publishingRef.current = true;
    setPhase('publishing');
    setCurrentStep('signing');
    setErrorMessage('');

    try {
      const uri = signedUris[0];
      const fileUri = uri.startsWith('file://') ? uri : `file://${uri}`;

      // 仕様書 §6.1, §6.2: ファイルをバイナリとして読み取り（Title Protocol SDK用）
      const fileBase64 = await FileSystem.readAsStringAsync(
        fileUri,
        { encoding: FileSystem.EncodingType.Base64 },
      );
      const binaryStr = atob(fileBase64);
      const content = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        content[i] = binaryStr.charCodeAt(i);
      }

      // R2キーはcontent_hashと独立 — content_hashはTEEが算出するため事前に取得不可
      const fileId = Crypto.randomUUID();

      setCurrentStep('uploading');

      // パイプラインA (§6.1) と パイプラインB (§6.2) を並列実行
      const [tpResult, r2Urls] = await Promise.all([
        // パイプラインA: Title Protocol登録（SDK → TEE → cNFTミント）
        // content_hash = SHA-256(Active Manifest の COSE 署名) を TEE が算出
        registerOnTitleProtocol(content),

        // パイプラインB: 表示用画像をリサイズ → R2に直接アップロード
        (async () => {
          const [displayResult, ogpResult] = await Promise.all([
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

          const [displayUrlRes, ogpUrlRes] = await Promise.all([
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
          ]);

          if (!displayUrlRes.ok || !ogpUrlRes.ok) {
            throw new Error('presigned URL の取得に失敗しました');
          }

          const displayUrlData = await displayUrlRes.json();
          const ogpUrlData = await ogpUrlRes.json();

          await Promise.all([
            FileSystem.uploadAsync(displayUrlData.uploadUrl, displayResult.uri, {
              httpMethod: 'PUT',
              headers: { 'Content-Type': 'image/jpeg' },
              uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
            }),
            FileSystem.uploadAsync(ogpUrlData.uploadUrl, ogpResult.uri, {
              httpMethod: 'PUT',
              headers: { 'Content-Type': 'image/jpeg' },
              uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
            }),
          ]);

          return {
            displayPublicUrl: displayUrlData.publicUrl as string,
            ogpPublicUrl: ogpUrlData.publicUrl as string,
          };
        })(),
      ]);

      setCurrentStep('registering');

      // 両パイプライン完了後、TP の content_hash + R2 URL でページ作成
      // content_hash が公開ページからオンチェーンデータへの唯一のキー
      // addressはRegistrationScreenから明示的に渡される（非同期競合なし）
      const publishRes = await fetch(config.publishUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contentHash: tpResult.contentHash,
          thumbnailUrl: r2Urls.displayPublicUrl,
          ogpImageUrl: r2Urls.ogpPublicUrl,
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
        contentHash: tpResult.contentHash,
        txSignature: tpResult.txSignature,
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

      {/* 共有バー（大きなCTA） */}
      <View style={styles.shareBar}>
        <TouchableOpacity style={styles.sharePrimaryButton} onPress={handleShare}>
          <Ionicons name="share-outline" size={20} color={colors.white} />
          <Text style={styles.sharePrimaryText}>{t('publishing.share')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.shareLinkButton} onPress={handleCopyLink}>
          <Ionicons name="link-outline" size={18} color={colors.accent} />
          <Text style={styles.shareLinkText}>{t('publishing.copyLink')}</Text>
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
