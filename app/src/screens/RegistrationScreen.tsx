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

// 仕様書 §3.7 登録準備画面
// - 署名済みコンテンツのサマリー表示
// - 「登録する」ボタン（現時点ではプレースホルダー）
// - プロトコル登録は次タスク以降で実装

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'Registration'>;

const SCREEN_WIDTH = Dimensions.get('window').width;
const THUMB_SIZE = (SCREEN_WIDTH - 48 - 8) / 3;

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

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* ヘッダー */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Ionicons name="arrow-back" size={22} color="#1a1a1a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>登録準備</Text>
        <View style={styles.backButton} />
      </View>

      {/* サマリー */}
      <View style={styles.content}>
        <View style={styles.summaryCard}>
          <Ionicons name="shield-checkmark" size={40} color="#2e7d32" />
          <Text style={styles.summaryTitle}>
            {signedUris.length}枚のコンテンツが署名済み
          </Text>
          <Text style={styles.summaryText}>
            すべてのコンテンツにC2PA署名が付与されています。{'\n'}
            登録するとTitle Protocolに記録されます。
          </Text>
        </View>

        {/* サムネイル一覧 */}
        <FlatList
          data={signedUris}
          horizontal
          keyExtractor={(_, i) => i.toString()}
          contentContainerStyle={styles.thumbnailList}
          showsHorizontalScrollIndicator={false}
          renderItem={({ item }) => (
            <Image
              source={{ uri: item.startsWith('file://') ? item : `file://${item}` }}
              style={styles.thumbnail}
            />
          )}
        />
      </View>

      {/* 登録ボタン */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.registerButton} onPress={handleRegister}>
          <Ionicons name="cloud-upload-outline" size={20} color="#fff" />
          <Text style={styles.registerButtonText}>登録する</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  summaryCard: {
    alignItems: 'center',
    gap: 12,
    marginBottom: 32,
  },
  summaryTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
    textAlign: 'center',
  },
  summaryText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
  thumbnailList: {
    gap: 8,
  },
  thumbnail: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  footer: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  registerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1a1a',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  registerButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
