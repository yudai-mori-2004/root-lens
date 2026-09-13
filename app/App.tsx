import 'react-native-get-random-values';
import 'fast-text-encoding';

import React, { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { NotoSansJP_300Light } from '@expo-google-fonts/noto-sans-jp/300Light';
import { NotoSansJP_400Regular } from '@expo-google-fonts/noto-sans-jp/400Regular';
import { NotoSansJP_500Medium } from '@expo-google-fonts/noto-sans-jp/500Medium';
import { NotoSansJP_700Bold } from '@expo-google-fonts/noto-sans-jp/700Bold';
import { NotoSansJP_900Black } from '@expo-google-fonts/noto-sans-jp/900Black';
import { JetBrainsMono_400Regular } from '@expo-google-fonts/jetbrains-mono/400Regular';
import { JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono/500Medium';
import { Anton_400Regular } from '@expo-google-fonts/anton/400Regular';
import { DotGothic16_400Regular } from '@expo-google-fonts/dotgothic16/400Regular';

import { RootNavigator } from './src/app/RootNavigator';
import { DevSandboxScreen } from './src/devsandbox/DevSandboxScreen';
import { AuthGate } from './src/services/auth';
import { colors } from './src/theme';
import { USE_DEV_SANDBOX } from './src/env';
import {
  initClipPersistence,
  retryClipPersistence,
  subscribeClipPersistenceErrors,
} from './src/clips/persistence';
import { recoverOrphanRecordings } from './src/dataflow';
import { initLocale } from './src/i18n';

// 起点は既定で本番 UI (RootNavigator)。 EXPO_PUBLIC_USE_SANDBOX=1 の時だけ dataflow sandbox を起点にする。
// (= dataflow 層の単体検証ハーネス。 本番フローはこれと同じ dataflow を呼ぶ別の Layer-3 消費者)

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.paper,
    card: colors.paper,
    border: colors.border,
    primary: colors.ink,
    text: colors.ink,
  },
};

// 発行 QR (io.rootlens.app://login?id=..&pw=..) をどの画面にいても Login に届ける。
// 資格情報の取り出しは LoginScreen 側の Linking.useURL が行う (= ここは画面遷移だけ)。
const linking = {
  prefixes: ['io.rootlens.app://'],
  config: { screens: { Login: 'login' } },
};

export default function App() {
  // 画面の向きは RootNavigator の native-stack `orientation` オプションが screen 単位で管理する
  // (= タブ portrait、 撮影だけ landscape)。 expo-screen-orientation の lockAsync は
  // react-native-screens に上書きされ効かないので、 ここでは扱わない。
  const [localeReady, setLocaleReady] = React.useState(false);
  const [clipStorageError, setClipStorageError] = React.useState<string | null>(null);
  const initializeClips = React.useCallback(async () => {
    try {
      await initClipPersistence();
      const recovered = await recoverOrphanRecordings();
      if (recovered > 0) console.log(`[clips] 未登録の録画を ${recovered} 本回収しました`);
      setClipStorageError(null);
    } catch (error) {
      console.error('[clips] initialization failed:', error);
      setClipStorageError(error instanceof Error ? error.message : String(error));
    }
  }, []);
  useEffect(() => {
    // クリップ永続化 (= Layer 2 アダプタ) を起動: 保存済みクリップを hydrate + 以降の変更を persist。
    // hydrate 後に孤児録画 (= 電池切れ / クラッシュ / kill で台帳登録前に死んだ録画) を回収する。
    const unsubscribe = subscribeClipPersistenceErrors((error) => setClipStorageError(error.message));
    void initializeClips();
    // 保存済み locale を hydrate してから描画 (= 既定 locale のちらつきを防ぐ)。
    initLocale().finally(() => setLocaleReady(true));
    return unsubscribe;
  }, [initializeClips]);

  const [fontsLoaded] = useFonts({
    NotoSansJP_300Light,
    NotoSansJP_400Regular,
    NotoSansJP_500Medium,
    NotoSansJP_700Bold,
    NotoSansJP_900Black,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
    DotGothic16_400Regular,
    Anton_400Regular,
  });

  if (!fontsLoaded || !localeReady) {
    return (
      <View style={[styles.center, { backgroundColor: colors.paper }]}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }

  if (clipStorageError) {
    return (
      <View style={styles.center}>
        <Text style={styles.storageTitle}>録画一覧を保存できません</Text>
        <Text style={styles.storageBody}>撮影を始める前に、もう一度お試しください。</Text>
        <Pressable
          style={styles.retryButton}
          onPress={() => {
            void retryClipPersistence()
              .then(initializeClips)
              .catch((error) => setClipStorageError(error instanceof Error ? error.message : String(error)));
          }}
        >
          <Text style={styles.retryLabel}>再試行</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <AuthGate>
        {USE_DEV_SANDBOX ? (
          <>
            <DevSandboxScreen />
            <StatusBar style="light" />
          </>
        ) : (
          <NavigationContainer theme={navTheme} linking={linking}>
            <RootNavigator />
            <StatusBar style="light" />
          </NavigationContainer>
        )}
      </AuthGate>
    </SafeAreaProvider>
  );
}

// initialRouteForApp は廃止 (= RootNavigator が AuthGate の useAuth() で判定する)。

const styles = StyleSheet.create({
  center: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: 24, gap: 12, backgroundColor: colors.paper,
  },
  storageTitle: { color: colors.ink, fontSize: 20, fontWeight: '700' },
  storageBody: { color: colors.ink, fontSize: 15 },
  retryButton: { backgroundColor: colors.ink, paddingHorizontal: 20, paddingVertical: 12 },
  retryLabel: { color: colors.paper, fontWeight: '700' },
});
