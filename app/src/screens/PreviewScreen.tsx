import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Image,
  TouchableOpacity,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../navigation/types';
import { loadContents, type ContentItem } from '../store/contentStore';
import { colors, typography, spacing, radii } from '../theme';
import { t } from '../i18n';

// 仕様書 §3.7 公開ページプレビュー
// 公開済みギャラリーから選択した際に表示

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'Preview'>;

export default function PreviewScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { contentIds } = route.params;
  const [content, setContent] = useState<ContentItem | null>(null);

  useEffect(() => {
    loadContents().then((contents) => {
      const found = contents.find((c) => c.id === contentIds[0]);
      setContent(found || null);
    });
  }, [contentIds]);

  if (!content) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>{t('common.loading')}</Text>
      </View>
    );
  }

  const mockUrl = `https://rootlens.io/p/${content.id}`;

  const handleShare = async () => {
    try {
      await Share.share({ message: mockUrl });
    } catch (_) {}
  };

  const handleCopyLink = () => {
    // TODO: Clipboard copy
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

      {/* 画像 */}
      <View style={styles.imageContainer}>
        <Image source={{ uri: content.uri }} style={styles.image} />
      </View>

      {/* 証明ステータス（§3.1.3 本物証明の表示基準） */}
      <View style={styles.proofBar}>
        <Text style={styles.proofText}>Shot on RootLens</Text>
        {content.editedAt && (
          <Text style={styles.proofSub}> · Edited</Text>
        )}
      </View>

      {/* 共有アクション（大きなCTA） */}
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
  loadingText: {
    ...typography.body,
    color: colors.textHint,
    textAlign: 'center',
    marginTop: 100,
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
  imageContainer: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  image: {
    width: '100%',
    height: '100%',
    resizeMode: 'contain',
  },
  // 証明ステータス
  proofBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'baseline',
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  proofText: {
    ...typography.captionMedium,
    color: colors.textPrimary,
  },
  proofSub: {
    ...typography.caption,
    color: colors.textHint,
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
