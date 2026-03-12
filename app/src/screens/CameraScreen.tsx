import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Image,
  TouchableOpacity,
  Animated,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import * as MediaLibrary from 'expo-media-library';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { signContent } from '../native/c2paBridge';

// 仕様書 §3.4 カメラ
// - 写真と動画の両方に対応（動画は後回しだがUI枠は用意）
// - 何枚でも連続撮影可能
// - 撮影した写真は端末フォトライブラリに保存

type Nav = NativeStackNavigationProp<RootStackParamList>;
type CameraMode = 'photo' | 'video';

export default function CameraScreen() {
  const navigation = useNavigation<Nav>();
  const cameraRef = useRef<CameraView>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const [mediaPermission, requestMediaPermission] = MediaLibrary.usePermissions();
  const [facing, setFacing] = useState<'front' | 'back'>('back');
  const [flash, setFlash] = useState<'off' | 'on'>('off');
  const [mode, setMode] = useState<CameraMode>('photo');
  const [capturing, setCapturing] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [signingCount, setSigningCount] = useState(0);
  // 動画録画状態
  const [recording, setRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const recordTimer = useRef<ReturnType<typeof setInterval>>();
  const shutterScale = useRef(new Animated.Value(1)).current;
  // 最新メディアのサムネイル
  const [lastAssetUri, setLastAssetUri] = useState<string | null>(null);

  // 最新メディアを取得（カメラが開いたとき・撮影後）
  const fetchLastAsset = useCallback(async () => {
    try {
      const result = await MediaLibrary.getAssetsAsync({
        first: 1,
        sortBy: [MediaLibrary.SortBy.modificationTime],
        mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
      });
      setLastAssetUri(result.assets[0]?.uri ?? null);
    } catch {
      // ignore
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchLastAsset();
    }, [fetchLastAsset]),
  );

  const allPermissionsGranted =
    cameraPermission?.granted && micPermission?.granted && mediaPermission?.granted;

  const requestAllPermissions = useCallback(async () => {
    await requestCameraPermission();
    await requestMicPermission();
    await requestMediaPermission();
  }, [requestCameraPermission, requestMicPermission, requestMediaPermission]);

  // 仕様書 §3.3: 撮影 → 即時C2PA署名 → デバイス保存
  // 署名はバックグラウンドで実行し、UIをブロックしない（連写対応）
  // NOTE: Hooksはearly returnより前に呼ぶ必要がある
  const signAndSave = useCallback(async (photoUri: string) => {
    setSigningCount((c) => c + 1);
    try {
      const signedPath = await signContent(photoUri);
      const signedUri = signedPath.startsWith('file://') ? signedPath : `file://${signedPath}`;
      await MediaLibrary.saveToLibraryAsync(signedUri);
      fetchLastAsset();
    } catch (e) {
      console.warn('C2PA署名エラー:', e);
      Alert.alert('署名エラー', 'C2PA署名に失敗しました。コンテンツは保存されませんでした。');
    } finally {
      setSigningCount((c) => c - 1);
    }
  }, [fetchLastAsset]);

  if (!cameraPermission || !micPermission || !mediaPermission) {
    return <View style={styles.container} />;
  }

  if (!allPermissionsGranted) {
    return (
      <View style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <TouchableOpacity
            style={styles.closeButtonTop}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          <View style={styles.permissionContainer}>
            <Ionicons name="camera-outline" size={64} color="#666" />
            <Text style={styles.permissionText}>
              カメラ・マイク・端末コンテンツへの{'\n'}アクセスを許可してください
            </Text>
            <TouchableOpacity
              style={styles.permissionButton}
              onPress={requestAllPermissions}
            >
              <Text style={styles.permissionButtonText}>許可する</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  const takePicture = async () => {
    if (!cameraRef.current || capturing || !cameraReady) return;
    setCapturing(true);

    Animated.sequence([
      Animated.timing(shutterScale, {
        toValue: 0.85,
        duration: 80,
        useNativeDriver: true,
      }),
      Animated.timing(shutterScale, {
        toValue: 1,
        duration: 80,
        useNativeDriver: true,
      }),
    ]).start();

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.9,
        skipProcessing: Platform.OS === 'android',
        shutterSound: false,
      });
      if (photo) {
        signAndSave(photo.uri);
      }
    } catch (e) {
      console.warn('撮影エラー:', e);
    } finally {
      setCapturing(false);
    }
  };

  // 動画録画開始/停止
  const toggleRecording = async () => {
    if (!cameraRef.current || !cameraReady) return;

    if (recording) {
      // 停止
      cameraRef.current.stopRecording();
      return;
    }

    // 開始
    setRecording(true);
    setRecordDuration(0);
    recordTimer.current = setInterval(() => {
      setRecordDuration((d) => d + 1);
    }, 1000);

    try {
      const video = await cameraRef.current.recordAsync();
      if (video) {
        // 動画もC2PA署名してから保存
        signAndSave(video.uri);
      }
    } catch (e) {
      console.warn('録画エラー:', e);
    } finally {
      setRecording(false);
      if (recordTimer.current) clearInterval(recordTimer.current);
      setRecordDuration(0);
    }
  };

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleShutter = () => {
    if (mode === 'photo') {
      takePicture();
    } else {
      toggleRecording();
    }
  };

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing={facing}
        flash={flash}
        mode={mode === 'video' ? 'video' : 'picture'}
        onCameraReady={() => setCameraReady(true)}
      >
        <SafeAreaView style={styles.overlay} edges={['top', 'bottom']}>
          {/* トップバー */}
          <View style={styles.topBar}>
            <TouchableOpacity
              style={styles.topButton}
              onPress={() => navigation.goBack()}
            >
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
            {/* 録画中タイマー（ヘッダー中央） */}
            {recording ? (
              <View style={styles.recordingIndicator}>
                <View style={styles.recordingDot} />
                <Text style={styles.recordingText}>{formatDuration(recordDuration)}</Text>
              </View>
            ) : (
              <View />
            )}
            <View style={styles.topRight}>
              <TouchableOpacity
                style={styles.topButton}
                onPress={() => setFlash(flash === 'off' ? 'on' : 'off')}
              >
                <Ionicons
                  name={flash === 'off' ? 'flash-off-outline' : 'flash-outline'}
                  size={24}
                  color="#fff"
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.topButton}
                onPress={() =>
                  setFacing(facing === 'back' ? 'front' : 'back')
                }
              >
                <Ionicons name="camera-reverse-outline" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>

          {/* 署名インジケーター */}
          {signingCount > 0 && !recording && (
            <View style={styles.signingIndicator}>
              <Text style={styles.signingText}>
                署名中... ({signingCount})
              </Text>
            </View>
          )}

          {/* ボトム */}
          <View style={styles.bottomArea}>
            {/* モード切替 */}
            <View style={styles.modeSelector}>
              <TouchableOpacity onPress={() => setMode('photo')}>
                <Text
                  style={[
                    styles.modeText,
                    mode === 'photo' && styles.modeTextActive,
                  ]}
                >
                  写真
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setMode('video')}>
                <Text
                  style={[
                    styles.modeText,
                    mode === 'video' && styles.modeTextActive,
                  ]}
                >
                  動画
                </Text>
              </TouchableOpacity>
            </View>

            {/* シャッター行: サムネ / シャッター / 空白 */}
            <View style={styles.shutterRow}>
              {/* 左: ギャラリーサムネ */}
              <TouchableOpacity
                style={styles.galleryThumb}
                onPress={() => navigation.navigate('CameraGallery')}
              >
                {lastAssetUri ? (
                  <Image source={{ uri: lastAssetUri }} style={styles.galleryThumbImage} />
                ) : (
                  <View style={styles.galleryThumbEmpty}>
                    <Ionicons name="images-outline" size={20} color="#aaa" />
                  </View>
                )}
              </TouchableOpacity>

              {/* 中央: シャッター */}
              <Animated.View style={{ transform: [{ scale: shutterScale }] }}>
                <TouchableOpacity
                  style={[
                    styles.shutterOuter,
                    !cameraReady && styles.shutterDisabled,
                    recording && styles.shutterRecording,
                  ]}
                  onPress={handleShutter}
                  activeOpacity={0.7}
                  disabled={!cameraReady}
                >
                  <View
                    style={[
                      styles.shutterInner,
                      mode === 'video' && styles.shutterInnerVideo,
                      recording && styles.shutterInnerStop,
                    ]}
                  />
                </TouchableOpacity>
              </Animated.View>

              {/* 右: バランス用の空白 */}
              <View style={styles.galleryThumb} />
            </View>
          </View>
        </SafeAreaView>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  safeArea: {
    flex: 1,
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    justifyContent: 'space-between',
  },
  // トップバー
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  topRight: {
    flexDirection: 'row',
    gap: 8,
  },
  topButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonTop: {
    position: 'absolute',
    top: 16,
    left: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  // パーミッション
  permissionContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  permissionText: {
    color: '#ccc',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
  permissionButton: {
    backgroundColor: '#fff',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 8,
    marginTop: 8,
  },
  permissionButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '600',
  },
  // ボトム
  bottomArea: {
    paddingBottom: 20,
  },
  modeSelector: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
    marginBottom: 24,
  },
  modeText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 15,
    fontWeight: '600',
  },
  modeTextActive: {
    color: '#fff',
  },
  shutterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 32,
  },
  galleryThumb: {
    width: 48,
    height: 48,
    borderRadius: 8,
    overflow: 'hidden',
  },
  galleryThumbImage: {
    width: 48,
    height: 48,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  galleryThumbEmpty: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterOuter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterDisabled: {
    opacity: 0.4,
  },
  shutterInner: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: '#fff',
  },
  shutterInnerVideo: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#e53935',
  },
  shutterRecording: {
    borderColor: '#e53935',
  },
  shutterInnerStop: {
    width: 24,
    height: 24,
    borderRadius: 4,
    backgroundColor: '#e53935',
  },
  recordingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 16,
    gap: 8,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#e53935',
  },
  recordingText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  signingIndicator: {
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 16,
  },
  signingText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
  },
});
