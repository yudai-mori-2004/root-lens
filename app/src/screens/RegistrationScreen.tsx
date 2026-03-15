import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Image,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { usePrivy } from '@privy-io/expo';
import { useLogin } from '@privy-io/expo/ui';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../navigation/types';
import { colors, typography, spacing, radii } from '../theme';
import { t } from '../i18n';
import { setAuthState } from '../hooks/useAuth';

// 仕様書 §3.7 登録準備画面
// §2.4: 公開時にのみログインを求める

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'Registration'>;

const SCREEN_WIDTH = Dimensions.get('window').width;

export default function RegistrationScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const insets = useSafeAreaInsets();
  const { signedUris } = route.params;
  const { isAuthenticated } = usePrivy();
  const { login } = useLogin();
  const [loggingIn, setLoggingIn] = useState(false);

  const handleRegister = async () => {
    // 仕様書 §2.4: 未ログインならここでログインを求める
    if (!isAuthenticated) {
      setLoggingIn(true);
      try {
        const session = await login({ loginMethods: ['google', 'email'] });
        if (session?.user) {
          const solanaAccount = session.user.linkedAccounts?.find(
            (a: any) => a.type === 'wallet' && a.chainType === 'solana'
          );
          if (solanaAccount?.address) {
            setAuthState(solanaAccount.address);
          }
        }
      } catch (e: any) {
        // 「already logged in」はエラーではなく、既にログイン済み→先に進む
        const msg = e?.message || String(e);
        if (msg.toLowerCase().includes('already logged in') || msg.toLowerCase().includes('already_logged_in')) {
          console.log('[Registration] already logged in, proceeding');
        } else {
          console.error('[Registration] login failed:', e);
          setLoggingIn(false);
          return;
        }
      }
      setLoggingIn(false);
    }
    navigation.navigate('Publishing', { signedUris });
  };

  const handleBack = () => {
    navigation.goBack();
  };

  const previewPad = spacing.xl;
  const previewWidth = SCREEN_WIDTH - previewPad * 2;
  const multiThumbSize = (previewWidth - spacing.sm * 2) / 3;

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

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

        <Text style={styles.caption}>
          {t('registration.summaryTitle', { count: signedUris.length })}
        </Text>
        <Text style={styles.subCaption}>
          {t('registration.summaryText')}
        </Text>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.publishButton, loggingIn && styles.publishButtonDisabled]}
          onPress={handleRegister}
          disabled={loggingIn}
        >
          {loggingIn ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Text style={styles.publishButtonText}>{t('registration.button')}</Text>
          )}
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
  heroImage: {
    borderRadius: radii.md,
    backgroundColor: colors.surfaceAlt,
  },
  multiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  multiThumb: {
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceAlt,
  },
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
  publishButtonDisabled: {
    opacity: 0.6,
  },
  publishButtonText: {
    color: colors.white,
    ...typography.title,
  },
});
