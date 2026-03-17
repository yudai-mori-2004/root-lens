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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import * as MediaLibrary from 'expo-media-library';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { signContent } from '../native/c2paBridge';
import { saveToRootLensAlbum } from '../utils/saveMedia';
import { colors, typography, spacing, radii } from '../theme';
import { t } from '../i18n';
import { loadCameraSettings, type CameraSettings } from '../store/cameraSettings';

// 仕様書 §3.4 カメラ

type Nav = NativeStackNavigationProp<RootStackParamList>;
type CameraMode = 'photo' | 'video';
type FlashMode = 'off' | 'on' | 'auto';
type TimerMode = 0 | 3 | 10;

const FLASH_CYCLE: FlashMode[] = ['off', 'on', 'auto'];
const FLASH_ICONS: Record<FlashMode, string> = {
  off: 'flash-off-outline',
  on: 'flash-outline',
  auto: 'flash-outline',
};
const FLASH_LABELS: Record<FlashMode, string> = {
  off: 'OFF',
  on: 'ON',
  auto: 'AUTO',
};

export default function CameraScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const [mediaPermission, requestMediaPermission] = MediaLibrary.usePermissions();
  const [facing, setFacing] = useState<'front' | 'back'>('back');
  const [flash, setFlash] = useState<FlashMode>('off');
  const [mode, setMode] = useState<CameraMode>('photo');
  const [capturing, setCapturing] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [signingCount, setSigningCount] = useState(0);
  const [zoom, setZoom] = useState(0);

  // 新機能
  const [showGrid, setShowGrid] = useState(false);
  const [timer, setTimer] = useState<TimerMode>(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [mirror, setMirror] = useState(false);
  const [shutterSound, setShutterSound] = useState(false);

  // 動画録画状態
  const [recording, setRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const recordTimer = useRef<ReturnType<typeof setInterval>>();
  const shutterScale = useRef(new Animated.Value(1)).current;
  const [lastAssetUri, setLastAssetUri] = useState<string | null>(null);

  // 設定読み込み（カメラが開くたびに最新を取得）
  useFocusEffect(
    useCallback(() => {
      loadCameraSettings().then((s) => {
        setShowGrid(s.grid);
        setMirror(s.mirror);
        setShutterSound(s.shutterSound);
      });
    }, []),
  );

  // ピンチズーム
  const lastPinchDistance = useRef<number | null>(null);
  const handleTouchMove = useCallback((e: any) => {
    if (e.nativeEvent.touches.length === 2) {
      const [t1, t2] = e.nativeEvent.touches;
      const dist = Math.hypot(t1.pageX - t2.pageX, t1.pageY - t2.pageY);
      if (lastPinchDistance.current !== null) {
        const delta = (dist - lastPinchDistance.current) * 0.002;
        setZoom((z) => Math.min(1, Math.max(0, z + delta)));
      }
      lastPinchDistance.current = dist;
    }
  }, []);
  const handleTouchEnd = useCallback(() => { lastPinchDistance.current = null; }, []);

  const fetchLastAsset = useCallback(async () => {
    try {
      const result = await MediaLibrary.getAssetsAsync({
        first: 1,
        sortBy: [MediaLibrary.SortBy.modificationTime],
        mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
      });
      setLastAssetUri(result.assets[0]?.uri ?? null);
    } catch {}
  }, []);

  useFocusEffect(useCallback(() => { fetchLastAsset(); }, [fetchLastAsset]));

  const allPermissionsGranted =
    cameraPermission?.granted && micPermission?.granted && mediaPermission?.granted;

  const requestAllPermissions = useCallback(async () => {
    await requestCameraPermission();
    await requestMicPermission();
    await requestMediaPermission();
  }, [requestCameraPermission, requestMicPermission, requestMediaPermission]);

  const signAndSave = useCallback(async (photoUri: string) => {
    setSigningCount((c) => c + 1);
    try {
      const signedPath = await signContent(photoUri);
      const signedUri = signedPath.startsWith('file://') ? signedPath : `file://${signedPath}`;
      await saveToRootLensAlbum(signedUri);
      fetchLastAsset();
    } catch (e) {
      console.warn('本物証明エラー:', e);
      Alert.alert(t('camera.signErrorTitle'), t('camera.signError'));
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
            <Ionicons name="close" size={28} color={colors.darkText} />
          </TouchableOpacity>
          <View style={styles.permissionContainer}>
            <Ionicons name="camera-outline" size={64} color={colors.textSecondary} />
            <Text style={styles.permissionText}>{t('camera.permissionMessage')}</Text>
            <TouchableOpacity style={styles.permissionButton} onPress={requestAllPermissions}>
              <Text style={styles.permissionButtonText}>{t('camera.permissionButton')}</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  const doCapture = async () => {
    if (!cameraRef.current || capturing || !cameraReady) return;
    setCapturing(true);

    Animated.sequence([
      Animated.timing(shutterScale, { toValue: 0.85, duration: 80, useNativeDriver: true }),
      Animated.timing(shutterScale, { toValue: 1, duration: 80, useNativeDriver: true }),
    ]).start();

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.9,
        skipProcessing: Platform.OS === 'android',
        shutterSound: shutterSound,
      });
      if (photo) signAndSave(photo.uri);
    } catch (e) {
      console.warn('撮影エラー:', e);
    } finally {
      setCapturing(false);
    }
  };

  const takePicture = () => {
    if (timer === 0) {
      doCapture();
      return;
    }
    // タイマー撮影
    let remaining = timer;
    setCountdown(remaining);
    const interval = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(interval);
        setCountdown(null);
        doCapture();
      } else {
        setCountdown(remaining);
      }
    }, 1000);
  };

  const toggleRecording = async () => {
    if (!cameraRef.current || !cameraReady) return;
    if (recording) { cameraRef.current.stopRecording(); return; }

    setRecording(true);
    setRecordDuration(0);
    recordTimer.current = setInterval(() => setRecordDuration((d) => d + 1), 1000);

    try {
      const video = await cameraRef.current.recordAsync();
      if (video) signAndSave(video.uri);
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
    if (mode === 'photo') takePicture();
    else toggleRecording();
  };

  const cycleFlash = () => {
    const idx = FLASH_CYCLE.indexOf(flash);
    setFlash(FLASH_CYCLE[(idx + 1) % FLASH_CYCLE.length]);
  };

  const cycleTimer = () => {
    const cycle: TimerMode[] = [0, 3, 10];
    const idx = cycle.indexOf(timer);
    setTimer(cycle[(idx + 1) % cycle.length]);
  };

  return (
    <View style={styles.container}>
      {/* トップバー */}
      <View style={[styles.topBar, { paddingTop: insets.top }]}>
        <TouchableOpacity style={styles.topButton} onPress={() => navigation.goBack()}>
          <Ionicons name="close" size={28} color={colors.darkText} />
        </TouchableOpacity>

        {recording ? (
          <View style={styles.recordingIndicator}>
            <View style={styles.recordingDot} />
            <Text style={styles.recordingText}>{formatDuration(recordDuration)}</Text>
          </View>
        ) : (
          <View style={styles.topCenter}>
            {/* フラッシュ */}
            <TouchableOpacity style={styles.topChip} onPress={cycleFlash}>
              <Ionicons name={FLASH_ICONS[flash] as any} size={16} color={flash === 'off' ? colors.darkTextSecondary : colors.darkText} />
              <Text style={[styles.topChipText, flash === 'off' && styles.topChipTextDim]}>{FLASH_LABELS[flash]}</Text>
            </TouchableOpacity>

            {/* タイマー */}
            <TouchableOpacity style={styles.topChip} onPress={cycleTimer}>
              <Ionicons name="timer-outline" size={16} color={timer === 0 ? colors.darkTextSecondary : colors.darkText} />
              <Text style={[styles.topChipText, timer === 0 && styles.topChipTextDim]}>
                {timer === 0 ? t('camera.timerOff') : `${timer}s`}
              </Text>
            </TouchableOpacity>

            {/* グリッド */}
            <TouchableOpacity style={styles.topChip} onPress={() => setShowGrid(!showGrid)}>
              <Ionicons name="grid-outline" size={16} color={showGrid ? colors.darkText : colors.darkTextSecondary} />
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity style={styles.topButton} onPress={() => setFacing(facing === 'back' ? 'front' : 'back')}>
          <Ionicons name="camera-reverse-outline" size={24} color={colors.darkText} />
        </TouchableOpacity>
      </View>

      {/* カメラプレビュー */}
      <View
        style={styles.cameraContainer}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing={facing}
          flash={flash}
          zoom={zoom}
          mirror={facing === 'front' ? mirror : false}
          mode={mode === 'video' ? 'video' : 'picture'}
          onCameraReady={() => setCameraReady(true)}
        />

        {/* グリッドオーバーレイ */}
        {showGrid && (
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <View style={[styles.gridLine, styles.gridH, { top: '33.33%' }]} />
            <View style={[styles.gridLine, styles.gridH, { top: '66.66%' }]} />
            <View style={[styles.gridLine, styles.gridV, { left: '33.33%' }]} />
            <View style={[styles.gridLine, styles.gridV, { left: '66.66%' }]} />
          </View>
        )}

        {/* カウントダウン */}
        {countdown !== null && (
          <View style={styles.countdownOverlay}>
            <Text style={styles.countdownText}>{countdown}</Text>
          </View>
        )}

        {/* 署名インジケーター */}
        {signingCount > 0 && !recording && (
          <View style={styles.signingIndicator}>
            <Ionicons name="checkmark-circle" size={14} color={colors.accent} />
            <Text style={styles.signingText}>{t('camera.signing')} ({signingCount})</Text>
          </View>
        )}

        {/* ズームレベル */}
        {zoom > 0.01 && (
          <View style={styles.zoomBadge}>
            <Text style={styles.zoomText}>{(1 + zoom * 9).toFixed(1)}x</Text>
          </View>
        )}
      </View>

      {/* ボトム */}
      <View style={[styles.bottomArea, { paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.modeSelector}>
          <TouchableOpacity style={styles.modeButton} onPress={() => setMode('photo')}>
            <Text style={[styles.modeText, mode === 'photo' && styles.modeTextActive]}>{t('camera.photo')}</Text>
            {mode === 'photo' && <View style={styles.modeIndicator} />}
          </TouchableOpacity>
          <TouchableOpacity style={styles.modeButton} onPress={() => setMode('video')}>
            <Text style={[styles.modeText, mode === 'video' && styles.modeTextActive]}>{t('camera.video')}</Text>
            {mode === 'video' && <View style={styles.modeIndicator} />}
          </TouchableOpacity>
        </View>

        <View style={styles.shutterRow}>
          <TouchableOpacity style={styles.galleryThumb} onPress={() => navigation.navigate('CameraGallery')}>
            {lastAssetUri ? (
              <Image source={{ uri: lastAssetUri }} style={styles.galleryThumbImage} />
            ) : (
              <View style={styles.galleryThumbEmpty}>
                <Ionicons name="images-outline" size={20} color={colors.darkTextSecondary} />
              </View>
            )}
          </TouchableOpacity>

          <Animated.View style={{ transform: [{ scale: shutterScale }] }}>
            <TouchableOpacity
              style={[
                styles.shutterOuter,
                !cameraReady && styles.shutterDisabled,
                recording && styles.shutterRecording,
              ]}
              onPress={handleShutter}
              activeOpacity={0.7}
              disabled={!cameraReady || countdown !== null}
            >
              <View style={[
                styles.shutterInner,
                mode === 'video' && styles.shutterInnerVideo,
                recording && styles.shutterInnerStop,
              ]} />
            </TouchableOpacity>
          </Animated.View>

          <View style={styles.galleryThumb} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.darkBg },
  safeArea: { flex: 1 },
  cameraContainer: { flex: 1, overflow: 'hidden' },
  camera: { flex: 1 },
  // トップバー
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    backgroundColor: colors.darkBg,
  },
  topCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  topButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.sm,
  },
  topChipText: {
    color: colors.darkText,
    fontSize: 11,
    fontWeight: '600',
  },
  topChipTextDim: {
    color: colors.darkTextSecondary,
  },
  closeButtonTop: {
    position: 'absolute',
    top: spacing.lg,
    left: spacing.lg,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.overlayMedium,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  // パーミッション
  permissionContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
    gap: spacing.lg,
  },
  permissionText: { color: colors.textHint, ...typography.body, textAlign: 'center' },
  permissionButton: {
    backgroundColor: colors.accent,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xxl,
    borderRadius: radii.md,
    marginTop: spacing.sm,
  },
  permissionButtonText: { color: colors.white, ...typography.title },
  // グリッド
  gridLine: { position: 'absolute', backgroundColor: colors.overlayWhiteGrid },
  gridH: { left: 0, right: 0, height: StyleSheet.hairlineWidth },
  gridV: { top: 0, bottom: 0, width: StyleSheet.hairlineWidth },
  // カウントダウン
  countdownOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countdownText: {
    fontSize: 72,
    fontWeight: '200',
    color: colors.darkText,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  // ズームバッジ
  zoomBadge: {
    position: 'absolute',
    top: spacing.sm,
    alignSelf: 'center',
    backgroundColor: colors.overlayDark,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
  },
  zoomText: {
    color: colors.darkText,
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  // 署名インジケーター
  signingIndicator: {
    position: 'absolute',
    bottom: spacing.sm,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.overlayDark,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
    gap: spacing.xs,
  },
  signingText: { color: colors.darkText, ...typography.captionMedium },
  // ボトム
  bottomArea: { paddingTop: spacing.lg, backgroundColor: colors.darkBg },
  modeSelector: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xl, marginBottom: spacing.xl },
  modeButton: { alignItems: 'center', gap: spacing.xs },
  modeText: { color: colors.overlayWhiteHalf, ...typography.bodyMedium },
  modeTextActive: { color: colors.darkText },
  modeIndicator: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.darkText },
  shutterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: spacing.xxl },
  galleryThumb: { width: 48, height: 48, borderRadius: radii.sm, overflow: 'hidden' },
  galleryThumbImage: { width: 48, height: 48, borderRadius: radii.sm, borderWidth: 2, borderColor: colors.overlayWhiteHalf },
  galleryThumbEmpty: { width: 48, height: 48, borderRadius: radii.sm, backgroundColor: colors.overlayWhite, alignItems: 'center', justifyContent: 'center' },
  shutterOuter: { width: 80, height: 80, borderRadius: 40, borderWidth: 4, borderColor: colors.darkText, alignItems: 'center', justifyContent: 'center' },
  shutterDisabled: { opacity: 0.4 },
  shutterInner: { width: 66, height: 66, borderRadius: 33, backgroundColor: colors.darkText },
  shutterInnerVideo: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.recording },
  shutterRecording: { borderColor: colors.recording },
  shutterInnerStop: { width: 24, height: 24, borderRadius: 4, backgroundColor: colors.recording },
  recordingIndicator: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.overlayDark, paddingVertical: spacing.sm, paddingHorizontal: 14, borderRadius: radii.lg, gap: spacing.sm },
  recordingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.recording },
  recordingText: { color: colors.darkText, ...typography.bodyMedium, fontVariant: ['tabular-nums'] },
});
