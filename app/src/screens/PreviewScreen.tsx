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
        <Text style={styles.loadingText}>読み込み中...</Text>
      </View>
    );
  }

  const mockUrl = `https://rootlens.io/p/${content.id}`;

  const handleShare = async () => {
    try {
      await Share.share({ message: mockUrl });
    } catch (_) {}
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* ヘッダー */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="close" size={28} color="#1a1a1a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>プレビュー</Text>
        <TouchableOpacity onPress={handleShare}>
          <Ionicons name="share-outline" size={24} color="#1a1a1a" />
        </TouchableOpacity>
      </View>

      {/* 画像 */}
      <View style={styles.imageContainer}>
        <Image source={{ uri: content.uri }} style={styles.image} />
      </View>

      {/* 証明バッジ */}
      <View style={styles.badgeContainer}>
        <View style={styles.badge}>
          <Ionicons name="shield-checkmark" size={16} color="#4caf50" />
          <Text style={styles.badgeText}>Shot on RootLens</Text>
        </View>
        {content.editedAt && (
          <Text style={styles.editedText}>Edited on RootLens</Text>
        )}
      </View>

      {/* アクション */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionButton}>
          <Ionicons name="link-outline" size={22} color="#1a1a1a" />
          <Text style={styles.actionLabel}>リンクをコピー</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={handleShare}>
          <Ionicons name="share-social-outline" size={22} color="#1a1a1a" />
          <Text style={styles.actionLabel}>共有</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  loadingText: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
    marginTop: 100,
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
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  imageContainer: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  image: {
    width: '100%',
    height: '100%',
    resizeMode: 'contain',
  },
  badgeContainer: {
    alignItems: 'center',
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  badgeText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  editedText: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 32,
    paddingVertical: 16,
    paddingBottom: 24,
  },
  actionButton: {
    alignItems: 'center',
    gap: 4,
  },
  actionLabel: {
    fontSize: 12,
    color: '#666',
  },
});
