import React from 'react';
import { ActivityIndicator, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { Ionicons } from '@expo/vector-icons';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import TabNavigator from './src/navigation/TabNavigator';
import CameraScreen from './src/screens/CameraScreen';
import CameraGalleryScreen from './src/screens/CameraGalleryScreen';
import EditScreen from './src/screens/EditScreen';
import PublishingScreen from './src/screens/PublishingScreen';
import PreviewScreen from './src/screens/PreviewScreen';
import RegistrationScreen from './src/screens/RegistrationScreen';
import type { RootStackParamList } from './src/navigation/types';
import { useCertificateProvisioning } from './src/hooks/useCertificateProvisioning';
import { colors, typography, spacing, radii } from './src/theme';
import { t } from './src/i18n';

const RootStack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  const [fontsLoaded] = useFonts({
    ...Ionicons.font,
  });

  // 仕様書 §4.4: アプリ起動時に証明書プロビジョニング
  const cert = useCertificateProvisioning();

  if (!fontsLoaded) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  // 証明書の初回取得中はスプラッシュ表示
  if (cert.status === 'checking' || cert.status === 'provisioning') {
    return (
      <View style={styles.center}>
        <Text style={styles.logo}>RootLens</Text>
        <ActivityIndicator size="small" color={colors.textHint} style={{ marginTop: spacing.lg }} />
        <Text style={styles.statusText}>
          {cert.status === 'checking' ? t('app.checking') : t('app.provisioning')}
        </Text>
      </View>
    );
  }

  // エラー時はリトライUI
  if (cert.status === 'error') {
    return (
      <View style={styles.center}>
        <Text style={styles.logo}>RootLens</Text>
        <Text style={styles.errorText}>{t('app.provisionError')}</Text>
        <Text style={styles.errorDetail}>{cert.error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={cert.retry}>
          <Text style={styles.retryButtonText}>{t('app.retry')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ready / renewing — アプリ利用可能
  return (
    <SafeAreaProvider>
    <NavigationContainer>
      <RootStack.Navigator>
        <RootStack.Screen
          name="Main"
          component={TabNavigator}
          options={{ headerShown: false }}
        />
        <RootStack.Screen
          name="Camera"
          component={CameraScreen}
          options={{
            headerShown: false,
            presentation: 'fullScreenModal',
            animation: 'slide_from_bottom',
          }}
        />
        <RootStack.Screen
          name="CameraGallery"
          component={CameraGalleryScreen}
          options={{
            headerShown: false,
            presentation: 'fullScreenModal',
            animation: 'slide_from_bottom',
          }}
        />
        <RootStack.Screen
          name="Edit"
          component={EditScreen}
          options={{ headerShown: false, presentation: 'fullScreenModal' }}
        />
        <RootStack.Screen
          name="Publishing"
          component={PublishingScreen}
          options={{
            headerShown: false,
            presentation: 'fullScreenModal',
            gestureEnabled: false,
          }}
        />
        <RootStack.Screen
          name="Preview"
          component={PreviewScreen}
          options={{ headerShown: false, presentation: 'fullScreenModal' }}
        />
        <RootStack.Screen
          name="Registration"
          component={RegistrationScreen}
          options={{
            headerShown: false,
            presentation: 'fullScreenModal',
            gestureEnabled: false,
          }}
        />
      </RootStack.Navigator>
      <StatusBar style="auto" />
    </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  logo: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 1,
  },
  statusText: {
    marginTop: spacing.sm,
    ...typography.caption,
    color: colors.textHint,
  },
  errorText: {
    marginTop: spacing.xl,
    ...typography.bodyMedium,
    color: colors.error,
  },
  errorDetail: {
    marginTop: spacing.sm,
    ...typography.caption,
    color: colors.textHint,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  retryButton: {
    marginTop: spacing.xl,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
    backgroundColor: colors.accent,
    borderRadius: radii.md,
  },
  retryButtonText: {
    color: colors.white,
    ...typography.bodyMedium,
  },
});
