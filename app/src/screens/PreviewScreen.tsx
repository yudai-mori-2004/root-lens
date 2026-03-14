import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Share,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../navigation/types';
import { config } from '../config';
import { colors, typography, spacing, radii } from '../theme';
import { t } from '../i18n';

// 仕様書 §3.7 公開ページプレビュー
// 公開済みギャラリーから選択した際に、公開ページをWebViewで表示

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'Preview'>;

export default function PreviewScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const shortId = route.params.contentIds[0];
  const pageUrl = `${config.serverUrl}/p/${shortId}`;

  const handleShare = async () => {
    try {
      await Share.share({ message: pageUrl });
    } catch (_) {}
  };

  const handleCopyLink = () => {
    Clipboard.setStringAsync(pageUrl);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* ヘッダー */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="close" size={28} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('preview.title')}</Text>
        <View style={styles.headerButton} />
      </View>

      {/* 公開ページ WebView */}
      <WebView
        source={{ uri: pageUrl }}
        style={styles.webview}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.webviewLoading}>
            <ActivityIndicator size="small" color={colors.textHint} />
          </View>
        )}
      />

      {/* 共有アクション */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.sharePrimaryButton} onPress={handleShare}>
          <Ionicons name="share-outline" size={20} color={colors.white} />
          <Text style={styles.sharePrimaryText}>{t('preview.share')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.shareLinkButton} onPress={handleCopyLink}>
          <Ionicons name="link-outline" size={18} color={colors.accent} />
          <Text style={styles.shareLinkText}>{t('preview.copyLink')}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    height: 52,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    ...typography.title,
    color: colors.textPrimary,
  },
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
  // 共有アクション
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    paddingBottom: spacing.xl,
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
});
