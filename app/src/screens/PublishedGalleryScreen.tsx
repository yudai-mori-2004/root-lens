import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  Image,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { loadContents, type ContentItem } from '../store/contentStore';
import type { RootStackParamList } from '../navigation/types';

// 仕様書 §3.3 公開済みギャラリー（ホーム画面）
// - 3列グリッドレイアウト
// - 公開済みコンテンツと、編集途中のドラフトが並ぶ
// - ドラフトにはバッジが表示される
// - コンテンツが0件の場合は、撮影・ギャラリーへの誘導UIを表示する

type Nav = NativeStackNavigationProp<RootStackParamList>;

const NUM_COLUMNS = 3;
const SPACING = 2;
const SCREEN_WIDTH = Dimensions.get('window').width;
const ITEM_SIZE = (SCREEN_WIDTH - SPACING * (NUM_COLUMNS + 1)) / NUM_COLUMNS;

export default function PublishedGalleryScreen() {
  const navigation = useNavigation<Nav>();
  const [contents, setContents] = useState<ContentItem[]>([]);

  useFocusEffect(
    useCallback(() => {
      loadContents().then(setContents);
    }, []),
  );

  if (contents.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="shield-checkmark-outline" size={56} color="#ccc" />
        <Text style={styles.emptyTitle}>本物を、証明しよう</Text>
        <Text style={styles.emptyDescription}>
          あなたが撮影した本物のコンテンツに{'\n'}改ざん不可能な証明を付けて、SNSでシェアできます
        </Text>
        <Text style={styles.emptyHint}>
          カメラで撮影するか、ギャラリーからコンテンツを選択
        </Text>
      </View>
    );
  }

  const handlePress = (item: ContentItem) => {
    if (item.status === 'draft') {
      navigation.navigate('Edit', { mediaItems: [{ uri: item.uri, type: 'image' as const }] });
    } else {
      navigation.navigate('Preview', { contentIds: [item.id] });
    }
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={contents}
        numColumns={NUM_COLUMNS}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.grid}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.gridItem}
            onPress={() => handlePress(item)}
          >
            <Image source={{ uri: item.uri }} style={styles.thumbnail} />
            {item.status === 'draft' && (
              <View style={styles.draftBadge}>
                <Text style={styles.draftBadgeText}>下書き</Text>
              </View>
            )}
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  grid: {
    padding: SPACING,
  },
  gridItem: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    margin: SPACING / 2,
    position: 'relative',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
    borderRadius: 2,
  },
  draftBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  draftBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
    textAlign: 'center',
  },
  emptyDescription: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
  },
  emptyHint: {
    fontSize: 13,
    color: '#bbb',
    textAlign: 'center',
    marginTop: 8,
  },
});
