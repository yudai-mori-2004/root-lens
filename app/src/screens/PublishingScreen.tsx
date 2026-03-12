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
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList, PublishResult } from '../navigation/types';
import { config } from '../config';
import { registerOnTitleProtocol } from '../services/titleProtocol';

// 仕様書 §2.4 公開パイプライン実行
// §6.1 パイプラインA: Title Protocol登録（クライアント側）
// §6.2 パイプラインB: R2保存 + ページ生成（サーバー側）
// 両パイプラインを並列実行

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'Publishing'>;

type Phase = 'uploading' | 'registering' | 'done' | 'error';

export default function PublishingScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { signedUris } = route.params;

  const [phase, setPhase] = useState<Phase>('uploading');
  const [result, setResult] = useState<PublishResult | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const publishingRef = useRef(false);

  const publish = async () => {
    if (publishingRef.current) return;
    publishingRef.current = true;
    setPhase('uploading');
    setErrorMessage('');

    try {
      const uri = signedUris[0];
      const fileUri = uri.startsWith('file://') ? uri : `file://${uri}`;

      // ファイルをバイナリとして読み取り（Title Protocol SDK用）
      const fileBase64 = await FileSystem.readAsStringAsync(
        fileUri,
        { encoding: FileSystem.EncodingType.Base64 },
      );
      const binaryStr = atob(fileBase64);
      const content = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        content[i] = binaryStr.charCodeAt(i);
      }

      setPhase('registering');

      // §6: パイプラインA + B を並列実行
      const [tpResult, uploadResponse] = await Promise.all([
        // パイプラインA: Title Protocol登録（クライアント側 SDK）
        registerOnTitleProtocol(content),

        // パイプラインB: 画像保存 + ページ作成（サーバー側）
        FileSystem.uploadAsync(config.publishUrl, fileUri, {
          httpMethod: 'POST',
          uploadType: FileSystem.FileSystemUploadType.MULTIPART,
          fieldName: 'content',
          mimeType: 'image/jpeg',
        }),
      ]);

      // パイプラインBのレスポンス確認
      if (uploadResponse.status !== 200) {
        const body = JSON.parse(uploadResponse.body);
        throw new Error(body.error || `Server error: ${uploadResponse.status}`);
      }

      const serverData = JSON.parse(uploadResponse.body);

      // 両パイプラインの結果を統合
      const data: PublishResult = {
        shortId: serverData.shortId,
        pageUrl: serverData.pageUrl,
        contentHash: tpResult.contentHash,
        assetId: tpResult.assetId,
        txSignature: tpResult.txSignature,
      };

      // サーバーにTP登録結果を送信してページレコードを更新
      await fetch(`${config.serverUrl}/api/v1/pages/${serverData.shortId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contentHash: tpResult.contentHash,
          assetId: tpResult.assetId,
        }),
      });

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
    Alert.alert('コピーしました', result.pageUrl);
  };

  const handleShare = async () => {
    if (!result) return;
    try {
      await Share.share({ message: result.pageUrl });
    } catch (_) {}
  };

  // --- ローディング ---
  if (phase === 'uploading' || phase === 'registering') {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1a1a1a" />
        <Text style={styles.loadingTitle}>
          {phase === 'uploading' ? 'アップロード中...' : '本物証明を登録中...'}
        </Text>
        <Text style={styles.loadingSubtitle}>
          {phase === 'uploading'
            ? 'コンテンツをサーバーに送信しています'
            : 'Title Protocolに記録しています'}
        </Text>
      </SafeAreaView>
    );
  }

  // --- エラー ---
  if (phase === 'error') {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <Ionicons name="alert-circle-outline" size={48} color="#d32f2f" />
        <Text style={styles.loadingTitle}>登録に失敗しました</Text>
        <Text style={styles.errorText}>{errorMessage}</Text>
        <View style={styles.errorActions}>
          <TouchableOpacity style={styles.retryButton} onPress={publish}>
            <Text style={styles.retryButtonText}>リトライ</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelButton} onPress={handleDone}>
            <Text style={styles.cancelButtonText}>戻る</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // --- 完了: WebViewで公開ページ表示 ---
  return (
    <SafeAreaView style={styles.container}>
      {/* ヘッダー */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>公開ページ</Text>
        <TouchableOpacity style={styles.doneButton} onPress={handleDone}>
          <Text style={styles.doneButtonText}>完了</Text>
        </TouchableOpacity>
      </View>

      {/* 共有バー */}
      <View style={styles.shareBar}>
        <TouchableOpacity style={styles.shareButton} onPress={handleCopyLink}>
          <Ionicons name="link-outline" size={20} color="#1a1a1a" />
          <Text style={styles.shareButtonText}>リンクをコピー</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
          <Ionicons name="share-outline" size={20} color="#1a1a1a" />
          <Text style={styles.shareButtonText}>共有</Text>
        </TouchableOpacity>
      </View>

      {/* 公開ページ WebView */}
      <WebView
        source={{ uri: result!.pageUrl }}
        style={styles.webview}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.webviewLoading}>
            <ActivityIndicator size="small" color="#999" />
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  // ローディング
  loadingContainer: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: 24,
  },
  loadingTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  loadingSubtitle: {
    fontSize: 14,
    color: '#999',
  },
  // エラー
  errorText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
  errorActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  retryButton: {
    backgroundColor: '#1a1a1a',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  cancelButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 15,
    fontWeight: '500',
  },
  // ヘッダー
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  doneButton: {
    backgroundColor: '#1a1a1a',
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 20,
  },
  doneButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  // 共有バー
  shareBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  shareButtonText: {
    fontSize: 13,
    color: '#1a1a1a',
    fontWeight: '500',
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
