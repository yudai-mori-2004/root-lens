import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../navigation/types';

// 仕様書 §3.7 公開ページプレビュー
// 将来: Title Protocol登録 → ローディング → iframe(rootlens.io)
// 現時点: モックローディング → 仮ページ表示

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'Publishing'>;

export default function PublishingScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const [phase, setPhase] = useState<'loading' | 'done'>('loading');

  // モックの登録処理（2秒待機）
  useEffect(() => {
    const timer = setTimeout(() => {
      setPhase('done');
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  const handleDone = () => {
    // ホームに戻る
    navigation.popToTop();
  };

  if (phase === 'loading') {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1a1a1a" />
        <Text style={styles.loadingTitle}>本物証明を登録中...</Text>
        <Text style={styles.loadingSubtitle}>
          コンテンツの真正性を記録しています
        </Text>
      </SafeAreaView>
    );
  }

  // 完了: WebViewで仮ページ表示
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
        <TouchableOpacity style={styles.shareButton}>
          <Ionicons name="link-outline" size={20} color="#1a1a1a" />
          <Text style={styles.shareButtonText}>リンクをコピー</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.shareButton}>
          <Ionicons name="share-outline" size={20} color="#1a1a1a" />
          <Text style={styles.shareButtonText}>共有</Text>
        </TouchableOpacity>
      </View>

      {/* 仮の公開ページ（WebView） */}
      <WebView
        source={{
          html: `
            <!DOCTYPE html>
            <html>
            <head>
              <meta name="viewport" content="width=device-width, initial-scale=1">
              <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body {
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                  background: #fafafa;
                  color: #1a1a1a;
                  display: flex;
                  flex-direction: column;
                  align-items: center;
                  padding: 24px 16px;
                }
                .badge {
                  display: inline-flex;
                  align-items: center;
                  gap: 6px;
                  background: #1a1a1a;
                  color: #fff;
                  padding: 8px 16px;
                  border-radius: 24px;
                  font-size: 13px;
                  font-weight: 600;
                  margin-bottom: 24px;
                }
                .badge .dot {
                  width: 8px; height: 8px;
                  border-radius: 4px;
                  background: #4caf50;
                }
                .card {
                  background: #fff;
                  border-radius: 16px;
                  padding: 24px;
                  width: 100%;
                  max-width: 400px;
                  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
                }
                .card h2 { font-size: 16px; margin-bottom: 16px; }
                .row {
                  display: flex; justify-content: space-between;
                  padding: 10px 0;
                  border-bottom: 1px solid #f0f0f0;
                  font-size: 14px;
                }
                .row:last-child { border-bottom: none; }
                .label { color: #999; }
                .value { font-weight: 500; }
                .verified { color: #4caf50; }
                .footer {
                  margin-top: 24px;
                  font-size: 12px;
                  color: #999;
                  text-align: center;
                }
              </style>
            </head>
            <body>
              <div class="badge"><span class="dot"></span> Shot on RootLens</div>
              <div class="card">
                <h2>本物証明</h2>
                <div class="row">
                  <span class="label">ステータス</span>
                  <span class="value verified">検証済み</span>
                </div>
                <div class="row">
                  <span class="label">撮影元</span>
                  <span class="value">RootLens</span>
                </div>
                <div class="row">
                  <span class="label">登録日時</span>
                  <span class="value">${new Date().toLocaleDateString('ja-JP')}</span>
                </div>
                <div class="row">
                  <span class="label">ブラウザ検証</span>
                  <span class="value verified">完了</span>
                </div>
              </div>
              <p class="footer">
                このページはRootLensの仮プレビューです。<br>
                実際の公開ページはrootlens.ioでホストされます。
              </p>
            </body>
            </html>
          `,
        }}
        style={styles.webview}
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
});
