import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  Image,
  TouchableOpacity,
  FlatList,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../navigation/types';
import { colors, typography, spacing, radii, shadows } from '../theme';
import { t } from '../i18n';

// 仕様書 §3.7 登録準備画面
// §3.1.2: 技術用語をUIに表示しない
// デザイン方針: 写真が主役。テキストは添え物。

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'Registration'>;

const SCREEN_WIDTH = Dimensions.get('window').width;

export default function RegistrationScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const insets = useSafeAreaInsets();
  const { signedUris } = route.params;

  const handleRegister = () => {
    // 仕様書 §2.4: 公開パイプライン実行
    navigation.navigate('Publishing', { signedUris });
  };

  const handleBack = () => {
    navigation.goBack();
  };

  // 写真プレビューのサイズ計算
  const previewPad = spacing.xl;
  const previewWidth = SCREEN_WIDTH - previewPad * 2;
  const multiThumbSize = (previewWidth - spacing.sm * 2) / 3;

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* ヘッダー — 最小限 */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* 写真を大きく見せる */}
      <View style={styles.content}>
        {signedUris.length === 1 ? (
          <Image
            source={{ uri: signedUris[0].startsWith('file://') ? signedUris[0] : `file://${signedUris[0]}` }}
            style={[styles.heroImage, { width: previewWidth, height: previewWidth * 1.1 }]}
          />
        ) : (
          <View style={[styles.multiGrid, { width: previewWidth }]}>
            {signedUris.slice(0, 6).map((uri, i) => (
              <Image
                key={i}
                source={{ uri: uri.startsWith('file://') ? uri : `file://${uri}` }}
                style={[styles.multiThumb, { width: multiThumbSize, height: multiThumbSize }]}
              />
            ))}
          </View>
        )}

        {/* テキストは写真の下に控えめに */}
        <Text style={styles.caption}>
          {t('registration.summaryTitle', { count: signedUris.length })}
        </Text>
        <Text style={styles.subCaption}>
          {t('registration.summaryText')}
        </Text>
      </View>

      {/* 公開ボタン */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.publishButton} onPress={handleRegister}>
          <Text style={styles.publishButtonText}>{t('registration.button')}</Text>
        </TouchableOpacity>
      </View>
    </View>
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
    paddingHorizontal: spacing.lg,
    height: 52,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: radii.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // 1枚: 大きなプレビュー
  heroImage: {
    borderRadius: radii.md,
    backgroundColor: colors.surfaceAlt,
  },
  // 複数枚: グリッド
  multiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  multiThumb: {
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceAlt,
  },
  // テキストは控えめ
  caption: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
  subCaption: {
    ...typography.caption,
    color: colors.textHint,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  // フッター
  footer: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
  },
  publishButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    paddingVertical: 16,
    borderRadius: radii.md,
  },
  publishButtonText: {
    color: colors.white,
    ...typography.title,
  },
});
