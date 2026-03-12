import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  Image,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList, MediaItem } from '../navigation/types';
import { useC2paCache, isTrustedAsset } from '../hooks/useC2paCache';

// 仕様書 §3.5 コンテンツ選択
// カメラギャラリーと端末ギャラリーの共通コンポーネント
// - C2PA署名付き → 選択可能、バッジ表示
// - C2PA署名なし → グレーアウト
// - 複数選択対応

type Nav = NativeStackNavigationProp<RootStackParamList>;

const NUM_COLUMNS = 3;
const SPACING = 2;
const SCREEN_WIDTH = Dimensions.get('window').width;
const ITEM_SIZE = (SCREEN_WIDTH - SPACING * (NUM_COLUMNS + 1)) / NUM_COLUMNS;

interface GalleryViewProps {
  /** 閉じるボタンのコールバック。指定時のみ表示 */
  onClose?: () => void;
}

export default function GalleryView({ onClose }: GalleryViewProps) {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = MediaLibrary.usePermissions();
  const [assets, setAssets] = useState<MediaLibrary.Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [endCursor, setEndCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);

  const c2paStatus = useC2paCache(assets);

  const loadAssets = useCallback(
    async (after?: string) => {
      if (!permission?.granted) return;
      const result = await MediaLibrary.getAssetsAsync({
        first: 60,
        after,
        mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
        sortBy: [MediaLibrary.SortBy.modificationTime],
      });
      if (after) {
        setAssets((prev) => [...prev, ...result.assets]);
      } else {
        setAssets(result.assets);
      }
      setEndCursor(result.endCursor);
      setHasMore(result.hasNextPage);
      setLoading(false);
    },
    [permission?.granted],
  );

  useFocusEffect(
    useCallback(() => {
      if (permission?.granted) {
        setLoading(true);
        setSelected([]);
        loadAssets();
      }
    }, [permission?.granted, loadAssets]),
  );

  const toggleSelect = (assetId: string) => {
    setSelected((prev) => {
      if (prev.includes(assetId)) {
        return prev.filter((id) => id !== assetId);
      }
      return [...prev, assetId];
    });
  };

  const handleShare = () => {
    const selectedAssets = selected
      .map((id) => assets.find((a) => a.id === id))
      .filter((a): a is MediaLibrary.Asset => a != null);
    const mediaItems: MediaItem[] = selectedAssets.map((a) => ({
      uri: a.uri,
      type: a.mediaType === 'video' ? 'video' as const : 'image' as const,
    }));
    if (mediaItems.length > 0) {
      navigation.navigate('Edit', { mediaItems });
      setSelected([]);
    }
  };

  const handleLoadMore = () => {
    if (hasMore && endCursor) {
      loadAssets(endCursor);
    }
  };

  // パーミッション未取得
  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <View style={[styles.centerContainer, onClose && { paddingTop: insets.top }]}>
        {onClose && (
          <TouchableOpacity style={[styles.closeBtn, { position: 'absolute', top: insets.top + 8, left: 12 }]} onPress={onClose}>
            <Ionicons name="close" size={28} color="#1a1a1a" />
          </TouchableOpacity>
        )}
        <Ionicons name="images-outline" size={64} color="#ccc" />
        <Text style={styles.permissionText}>
          端末のコンテンツにアクセスする許可が必要です
        </Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>許可する</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.centerContainer, onClose && { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#1a1a1a" />
      </View>
    );
  }

  return (
    <View style={[styles.container, onClose && { paddingTop: insets.top }]}>
      {/* ヘッダー / 選択バー */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {onClose && (
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Ionicons name="close" size={28} color="#1a1a1a" />
            </TouchableOpacity>
          )}
          <Text style={styles.headerTitle}>
            {selected.length > 0 ? `${selected.length}件選択中` : 'コンテンツを選択'}
          </Text>
        </View>

        {selected.length > 0 && (
          <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
            <Ionicons name="shield-checkmark" size={16} color="#fff" />
            <Text style={styles.shareButtonText}>本物証明をシェア</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={assets}
        numColumns={NUM_COLUMNS}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.grid}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        renderItem={({ item }) => {
          const selectionIndex = selected.indexOf(item.id);
          const isSelected = selectionIndex >= 0;
          const trusted = isTrustedAsset(c2paStatus, item.id);
          const selectable = trusted === true;
          const checking = trusted === null;

          return (
            <TouchableOpacity
              style={styles.gridItem}
              onPress={() => selectable && toggleSelect(item.id)}
              activeOpacity={selectable ? 0.7 : 1}
              disabled={!selectable}
            >
              <Image source={{ uri: item.uri }} style={styles.thumbnail} />
              {/* 動画バッジ */}
              {item.mediaType === 'video' && (
                <View style={styles.videoBadge}>
                  <Ionicons name="videocam" size={11} color="#fff" />
                  {item.duration > 0 && (
                    <Text style={styles.videoDuration}>
                      {Math.floor(item.duration / 60)}:{String(Math.floor(item.duration % 60)).padStart(2, '0')}
                    </Text>
                  )}
                </View>
              )}
              {/* 非選択可能: グレーアウト */}
              {!selectable && !checking && (
                <View style={styles.greyOverlay} />
              )}
              {/* チェック中 */}
              {checking && (
                <View style={styles.checkingOverlay}>
                  <ActivityIndicator size="small" color="#fff" />
                </View>
              )}
              {/* C2PA認証済みバッジ */}
              {selectable && (
                <View style={styles.c2paBadge}>
                  <Ionicons name="shield-checkmark" size={14} color="#fff" />
                </View>
              )}
              {/* 選択インジケーター */}
              {selectable && (
                <View
                  style={[
                    styles.selectIndicator,
                    isSelected && styles.selectIndicatorActive,
                  ]}
                >
                  {isSelected && (
                    <Text style={styles.selectNumber}>{selectionIndex + 1}</Text>
                  )}
                </View>
              )}
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  centerContainer: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  closeBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    gap: 6,
  },
  shareButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
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
  selectIndicator: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#fff',
    backgroundColor: 'rgba(0,0,0,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectIndicatorActive: {
    backgroundColor: '#1a1a1a',
    borderColor: '#1a1a1a',
  },
  selectNumber: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  greyOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 2,
  },
  checkingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  videoDuration: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  c2paBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: '#2e7d32',
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  permissionButton: {
    backgroundColor: '#1a1a1a',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 8,
  },
  permissionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
