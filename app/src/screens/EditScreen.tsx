import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Image,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList, MediaItem } from '../navigation/types';
import { signContent, applyMasks as nativeApplyMasks, processVideo } from '../native/c2paBridge';
import { saveToRootLensAlbum } from '../utils/saveMedia';
import { saveDraft, clearDraft } from '../store/draftStore';
import CropTool from '../components/edit/CropTool';
import MaskTool from '../components/edit/MaskTool';
import ResizeTool from '../components/edit/ResizeTool';
import TrimTool from '../components/edit/TrimTool';
import type { EditAction, EditState } from '../types/editActions';
import { computePreviewTransform, getEffectiveSize } from '../types/editActions';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { colors, typography, spacing, radii } from '../theme';
import { t } from '../i18n';
import VideoSeekBar from '../components/VideoSeekBar';

// 仕様書 §3.6 編集画面
// - 編集操作はアクション履歴として保持
// - プレビューは動的レンダリング（中間画像ファイルを作らない）
// - 保存/登録時のみ最終画像を生成 → 本物証明付与
// - 画像・動画の両方に対応

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'Edit'>;
type ActiveTool = null | 'crop' | 'mask' | 'resize' | 'trim';

export default function EditScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const insets = useSafeAreaInsets();
  const { mediaItems } = route.params;

  const [pageIndex, setPageIndex] = useState(0);
  const totalPages = mediaItems.length;
  const [signing, setSigning] = useState(false);
  const [activeTool, setActiveTool] = useState<ActiveTool>(null);

  const currentMediaType = mediaItems[pageIndex].type;
  const currentIsVideo = currentMediaType === 'video';

  // 各ページの元メディアサイズ
  const [imageSizes, setImageSizes] = useState<Array<{ w: number; h: number } | null>>(
    mediaItems.map(() => null),
  );

  // 元メディアサイズを取得
  useEffect(() => {
    mediaItems.forEach((item, i) => {
      if (item.type === 'video') return; // 動画はonReadyForDisplayで取得
      Image.getSize(item.uri, (w, h) => {
        setImageSizes(prev => {
          const next = [...prev];
          next[i] = { w, h };
          return next;
        });
      });
    });
  }, [mediaItems]);

  // 動画サイズ取得コールバック
  const onVideoReadyForDisplay = useCallback((event: { naturalSize: { width: number; height: number; orientation: string } }) => {
    const { width: w, height: h } = event.naturalSize;
    if (w > 0 && h > 0) {
      setImageSizes(prev => {
        if (prev[pageIndex]?.w === w && prev[pageIndex]?.h === h) return prev;
        const next = [...prev];
        next[pageIndex] = { w, h };
        return next;
      });
    }
  }, [pageIndex]);

  // アクション履歴ベースの編集状態
  const [editStates, setEditStates] = useState<EditState[]>(
    mediaItems.map((item) => ({
      originalUri: item.uri,
      originalWidth: 0,
      originalHeight: 0,
      actions: [],
      currentIndex: -1,
    })),
  );

  // imageSizesが取得されたらeditStatesに反映
  useEffect(() => {
    setEditStates(prev => prev.map((state, i) => {
      const size = imageSizes[i];
      if (size && (state.originalWidth !== size.w || state.originalHeight !== size.h)) {
        return { ...state, originalWidth: size.w, originalHeight: size.h };
      }
      return state;
    }));
  }, [imageSizes]);

  const currentEdit = editStates[pageIndex];
  const canUndo = currentEdit.currentIndex >= 0;
  const canRedo = currentEdit.currentIndex < currentEdit.actions.length - 1;

  // プレビュー計算
  const preview = useMemo(() => {
    if (!currentEdit.originalWidth || !currentEdit.originalHeight) return null;
    return computePreviewTransform(
      currentEdit.originalWidth,
      currentEdit.originalHeight,
      currentEdit.actions,
      currentEdit.currentIndex,
    );
  }, [currentEdit]);

  const effectiveSize = useMemo(() => {
    if (!currentEdit.originalWidth) return null;
    return getEffectiveSize(
      currentEdit.originalWidth,
      currentEdit.originalHeight,
      currentEdit.actions,
      currentEdit.currentIndex,
    );
  }, [currentEdit]);

  // プレビューコンテナサイズ（onLayoutで取得）
  const [previewContainerSize, setPreviewContainerSize] = useState<{ w: number; h: number } | null>(null);
  const onPreviewLayout = useCallback((e: any) => {
    const { width, height } = e.nativeEvent.layout;
    setPreviewContainerSize({ w: width, h: height });
  }, []);

  // ドラフト自動保存 (500msデバウンス)
  const draftSaveTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current);
    draftSaveTimer.current = setTimeout(() => {
      saveDraft({
        mediaItems,
        editStates: editStates.map((s) => ({
          actions: s.actions,
          currentIndex: s.currentIndex,
        })),
        pageIndex,
        savedAt: Date.now(),
      });
    }, 500);
    return () => {
      if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current);
    };
  }, [editStates, pageIndex, mediaItems]);

  // アクション追加
  const pushAction = useCallback(
    (action: EditAction) => {
      setEditStates(prev => {
        const next = [...prev];
        const state = { ...next[pageIndex] };
        // redo履歴を破棄して新アクション追加
        state.actions = [...state.actions.slice(0, state.currentIndex + 1), action];
        state.currentIndex = state.actions.length - 1;
        next[pageIndex] = state;
        return next;
      });
    },
    [pageIndex],
  );

  const handleUndo = () => {
    setEditStates(prev => {
      const next = [...prev];
      const state = { ...next[pageIndex] };
      if (state.currentIndex >= 0) {
        state.currentIndex -= 1;
        next[pageIndex] = state;
      }
      return next;
    });
  };

  const handleRedo = () => {
    setEditStates(prev => {
      const next = [...prev];
      const state = { ...next[pageIndex] };
      if (state.currentIndex < state.actions.length - 1) {
        state.currentIndex += 1;
        next[pageIndex] = state;
      }
      return next;
    });
  };

  // ---- Tool callbacks ----

  const handleCropApply = (crop: { originX: number; originY: number; width: number; height: number }) => {
    pushAction({ type: 'crop', ...crop });
    setActiveTool(null);
  };

  const handleMaskApply = (masks: Array<{ x: number; y: number; w: number; h: number; rotation: number }>, replaceAll: boolean) => {
    if (replaceAll) {
      // 既存マスク変更あり → 全マスクアクションを置換
      setEditStates(prev => {
        const next = [...prev];
        const state = { ...next[pageIndex] };
        const activeActions = state.actions.slice(0, state.currentIndex + 1);
        const nonMaskActions = activeActions.filter(a => a.type !== 'mask');
        const maskActions: EditAction[] = masks.map(m => ({ type: 'mask' as const, ...m }));
        state.actions = [...nonMaskActions, ...maskActions];
        state.currentIndex = state.actions.length - 1;
        next[pageIndex] = state;
        return next;
      });
    } else {
      // 新規マスクのみ追加
      for (const m of masks) {
        pushAction({ type: 'mask', ...m });
      }
    }
    setActiveTool(null);
  };

  const handleResizeApply = (size: { width: number; height: number }) => {
    pushAction({ type: 'resize', ...size });
    setActiveTool(null);
  };

  const handleTrimApply = (trim: { startMs: number; endMs: number }) => {
    pushAction({ type: 'trim', ...trim });
    setActiveTool(null);
  };

  // 既存のトリムアクションを探す
  const existingTrim = useMemo(() => {
    const activeActions = currentEdit.actions.slice(0, currentEdit.currentIndex + 1);
    const trimAction = [...activeActions].reverse().find(a => a.type === 'trim');
    if (trimAction?.type === 'trim') {
      return { startMs: trimAction.startMs, endMs: trimAction.endMs };
    }
    return undefined;
  }, [currentEdit]);

  // ---- 動画再生制御 ----
  const videoRef = useRef<Video>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [videoPosMs, setVideoPosMs] = useState(0);
  const [videoDurMs, setVideoDurMs] = useState(0);
  const videoSeekingRef = useRef(false);
  const existingTrimRef = useRef(existingTrim);
  existingTrimRef.current = existingTrim;

  // ページ/ツール切り替え時に再生停止
  useEffect(() => {
    setIsPlaying(false);
    videoRef.current?.pauseAsync();
  }, [pageIndex, activeTool]);

  // トリム適用時にトリム開始位置にシーク
  useEffect(() => {
    if (currentIsVideo && videoRef.current && existingTrim) {
      videoRef.current.setPositionAsync(existingTrim.startMs);
    }
  }, [existingTrim?.startMs, existingTrim?.endMs, currentIsVideo]);

  // 再生/一時停止トグル（トリム範囲を考慮）
  const togglePlayPause = useCallback(async () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      await videoRef.current.pauseAsync();
      setIsPlaying(false);
    } else {
      const trim = existingTrimRef.current;
      if (trim) {
        const status = await videoRef.current.getStatusAsync();
        if (status.isLoaded && (status.positionMillis < trim.startMs || status.positionMillis >= trim.endMs - 100)) {
          await videoRef.current.setPositionAsync(trim.startMs);
        }
      }
      await videoRef.current.playAsync();
      setIsPlaying(true);
    }
  }, [isPlaying]);

  // 動画再生位置の監視（トリム範囲の制約 + シークバー用）
  const onVideoPlaybackUpdate = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    if (!videoSeekingRef.current) setVideoPosMs(status.positionMillis);
    if (status.durationMillis) setVideoDurMs(status.durationMillis);
    const trim = existingTrimRef.current;
    if (trim && status.isPlaying && status.positionMillis >= trim.endMs) {
      videoRef.current?.pauseAsync();
      videoRef.current?.setPositionAsync(trim.startMs);
      setIsPlaying(false);
    }
    if (status.didJustFinish) {
      setIsPlaying(false);
      if (trim) {
        videoRef.current?.setPositionAsync(trim.startMs);
      }
    }
  }, []);

  // ---- 最終メディア生成 ----
  // 画像: アクション履歴を適用して最終画像を生成（クロップ・リサイズ・マスク）
  // 動画: ネイティブAPI（Media3 Transformer / AVFoundation）でクロップ・リサイズ・トリムを適用
  const generateFinalMedia = async (state: EditState, item: MediaItem): Promise<string> => {
    const activeActions = state.actions.slice(0, state.currentIndex + 1);
    if (activeActions.length === 0) return state.originalUri;

    // ---- 動画 ----
    if (item.type === 'video') {
      return generateFinalVideo(state, activeActions);
    }

    // ---- 画像 ----
    let currentUri = state.originalUri;
    const saveOptions = { compress: 0.95, format: ImageManipulator.SaveFormat.JPEG };

    const pendingManipulations: ImageManipulator.Action[] = [];
    const pendingMasks: Array<{ x: number; y: number; w: number; h: number; rotation: number }> = [];

    const flushManipulations = async () => {
      if (pendingManipulations.length === 0) return;
      const result = await ImageManipulator.manipulateAsync(
        currentUri, pendingManipulations, saveOptions,
      );
      currentUri = result.uri;
      pendingManipulations.length = 0;
    };

    const flushMasks = async () => {
      if (pendingMasks.length === 0) return;
      await flushManipulations();
      currentUri = await nativeApplyMasks(currentUri, [...pendingMasks]);
      pendingMasks.length = 0;
    };

    for (const action of activeActions) {
      switch (action.type) {
        case 'crop':
          await flushMasks();
          await flushManipulations();
          pendingManipulations.push({
            crop: { originX: action.originX, originY: action.originY, width: action.width, height: action.height },
          });
          break;
        case 'resize':
          await flushMasks();
          pendingManipulations.push({
            resize: { width: action.width, height: action.height },
          });
          break;
        case 'mask':
          await flushManipulations();
          pendingMasks.push({ x: action.x, y: action.y, w: action.w, h: action.h, rotation: action.rotation });
          break;
      }
    }

    await flushMasks();
    await flushManipulations();
    return currentUri;
  };

  // 動画の最終書き出し（ネイティブAPIでクロップ・リサイズ・トリムを適用）
  const generateFinalVideo = async (state: EditState, activeActions: EditAction[]): Promise<string> => {
    // アクション履歴からパラメータを算出
    let srcX = 0, srcY = 0, srcW = state.originalWidth, srcH = state.originalHeight;
    let outW = state.originalWidth, outH = state.originalHeight;
    let trimStartMs: number | undefined;
    let trimEndMs: number | undefined;

    for (const action of activeActions) {
      switch (action.type) {
        case 'crop': {
          const scaleX = srcW / outW;
          const scaleY = srcH / outH;
          srcX += action.originX * scaleX;
          srcY += action.originY * scaleY;
          srcW = action.width * scaleX;
          srcH = action.height * scaleY;
          outW = action.width;
          outH = action.height;
          break;
        }
        case 'resize':
          outW = action.width;
          outH = action.height;
          break;
        case 'trim':
          trimStartMs = action.startMs;
          trimEndMs = action.endMs;
          break;
      }
    }

    const hasCrop = srcX !== 0 || srcY !== 0 ||
      Math.round(srcW) !== state.originalWidth || Math.round(srcH) !== state.originalHeight;
    const hasResize = outW !== Math.round(srcW) || outH !== Math.round(srcH);
    const hasTrim = trimStartMs !== undefined || trimEndMs !== undefined;

    if (!hasCrop && !hasResize && !hasTrim) {
      return state.originalUri;
    }

    // ネイティブprocessVideoに渡すオプション
    const options: Record<string, number> = {};
    if (hasCrop) {
      options.cropX = Math.round(srcX);
      options.cropY = Math.round(srcY);
      options.cropW = Math.round(srcW);
      options.cropH = Math.round(srcH);
    }
    if (hasResize) {
      options.outputW = Math.round(outW / 2) * 2;
      options.outputH = Math.round(outH / 2) * 2;
    }
    if (trimStartMs !== undefined) options.startMs = trimStartMs;
    if (trimEndMs !== undefined) options.endMs = trimEndMs;

    const outputPath = await processVideo(state.originalUri, options);
    return outputPath.startsWith('file://') ? outputPath : `file://${outputPath}`;
  };

  // ---- Actions ----

  const handleDownload = async () => {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('common.error'), t('edit.savePermissionError'));
      return;
    }
    setSigning(true);
    try {
      const finalUri = await generateFinalMedia(currentEdit, mediaItems[pageIndex]);
      const signedPath = await signContent(finalUri);
      const signedUri = signedPath.startsWith('file://') ? signedPath : `file://${signedPath}`;
      await saveToRootLensAlbum(signedUri);
      Alert.alert(t('edit.saveSuccessTitle'), t('edit.saveSuccess'));
    } catch (e: any) {
      Alert.alert(t('common.error'), t('common.saveFailed', { message: e?.message || String(e) }));
    } finally {
      setSigning(false);
    }
  };

  const handleRegister = async () => {
    setSigning(true);
    try {
      const signedUris: string[] = [];
      for (let i = 0; i < editStates.length; i++) {
        const item = mediaItems[i];
        const state = editStates[i];
        const finalUri = await generateFinalMedia(state, item);
        const signedPath = await signContent(finalUri);
        const signedUri = signedPath.startsWith('file://') ? signedPath : `file://${signedPath}`;
        const ext = item.type === 'video' ? 'mov' : 'jpg';
        const tempDest = `${FileSystem.cacheDirectory}registration_${Date.now()}_${i}.${ext}`;
        await FileSystem.copyAsync({ from: signedUri, to: tempDest });
        signedUris.push(tempDest);
      }
      await clearDraft();
      navigation.replace('Registration', { signedUris });
    } catch (e) {
      Alert.alert(t('edit.signErrorTitle'), t('edit.signError'));
    } finally {
      setSigning(false);
    }
  };

  // ---- Tool screens ----
  if (activeTool === 'crop') {
    return (
      <CropTool
        imageUri={currentEdit.originalUri}
        mediaType={currentMediaType}
        sourceRegion={preview?.sourceRegion}
        onApply={handleCropApply}
        onCancel={() => setActiveTool(null)}
      />
    );
  }

  if (activeTool === 'mask') {
    return (
      <MaskTool
        imageUri={currentEdit.originalUri}
        sourceRegion={preview?.sourceRegion}
        existingMasks={preview?.masks ?? []}
        onApply={handleMaskApply}
        onCancel={() => setActiveTool(null)}
      />
    );
  }

  if (activeTool === 'resize') {
    return (
      <ResizeTool
        effectiveWidth={effectiveSize?.w ?? 0}
        effectiveHeight={effectiveSize?.h ?? 0}
        onApply={handleResizeApply}
        onCancel={() => setActiveTool(null)}
      />
    );
  }

  if (activeTool === 'trim') {
    return (
      <TrimTool
        videoUri={currentEdit.originalUri}
        existingTrim={existingTrim}
        onApply={handleTrimApply}
        onCancel={() => setActiveTool(null)}
      />
    );
  }

  // ---- プレビュー描画 ----
  const renderPreview = () => {
    // 解像度変更の検知（クロップ・リサイズで元と変わった場合のみ表示）
    const sizeChanged = effectiveSize && currentEdit.originalWidth > 0 &&
      (effectiveSize.w !== currentEdit.originalWidth || effectiveSize.h !== currentEdit.originalHeight);

    // 動画ページ: クロップ・トリムを動的に反映したプレビュー
    if (currentIsVideo) {
      // サイズ未取得時: Videoを表示してサイズ取得を待つ
      if (!preview || !currentEdit.originalWidth || !previewContainerSize) {
        return (
          <View style={styles.imageArea} onLayout={onPreviewLayout}>
            <Video
              ref={videoRef}
              source={{ uri: currentEdit.originalUri }}
              style={styles.videoPreview}
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay={false}
              onReadyForDisplay={onVideoReadyForDisplay}
            />
          </View>
        );
      }

      // 動的プレビュー: クロップ・リサイズを反映した動画表示
      const { sourceRegion: sr, effectiveSize: es } = preview;
      const cw = previewContainerSize.w;
      const ch = previewContainerSize.h;
      const fitScale = Math.min(cw / es.w, ch / es.h);
      const displayW = es.w * fitScale;
      const displayH = es.h * fitScale;
      const scaleX = displayW / sr.w;
      const scaleY = displayH / sr.h;
      const fullVidW = currentEdit.originalWidth * scaleX;
      const fullVidH = currentEdit.originalHeight * scaleY;

      return (
        <View style={styles.imageArea} onLayout={onPreviewLayout}>
          <View style={{ width: displayW, height: displayH, overflow: 'hidden', borderRadius: 2 }}>
            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
              <Video
                ref={videoRef}
                source={{ uri: currentEdit.originalUri }}
                style={{
                  position: 'absolute',
                  width: fullVidW,
                  height: fullVidH,
                  left: -sr.x * scaleX,
                  top: -sr.y * scaleY,
                }}
                resizeMode={ResizeMode.STRETCH}
                shouldPlay={false}
                isLooping={false}
                onPlaybackStatusUpdate={onVideoPlaybackUpdate}
                onReadyForDisplay={onVideoReadyForDisplay}
              />
            </View>
            {/* タップで再生/一時停止 */}
            <TouchableOpacity
              style={StyleSheet.absoluteFill}
              activeOpacity={1}
              onPress={togglePlayPause}
            >
              {!isPlaying && videoPosMs === 0 && (
                <View style={styles.playOverlay}>
                  <View style={styles.playCircle}>
                    <Ionicons name="play" size={28} color={colors.darkText} />
                  </View>
                </View>
              )}
            </TouchableOpacity>
            {/* シークバー */}
            {videoDurMs > 0 && (
              <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
                <VideoSeekBar
                  posMs={videoPosMs} durMs={videoDurMs} playing={isPlaying}
                  onTogglePlay={togglePlayPause}
                  onSeek={(ms) => { videoRef.current?.setPositionAsync(ms); setVideoPosMs(ms); }}
                  onSeekStart={() => { videoSeekingRef.current = true; }}
                  onSeekEnd={() => { videoSeekingRef.current = false; }}
                />
              </View>
            )}
          </View>
          {sizeChanged && effectiveSize && (
            <View style={styles.resolutionBadge} pointerEvents="none">
              <Text style={styles.resolutionText}>{effectiveSize.w}×{effectiveSize.h}</Text>
            </View>
          )}
        </View>
      );
    }

    if (!preview || !currentEdit.originalWidth || !previewContainerSize) {
      return (
        <View style={styles.imageArea} onLayout={onPreviewLayout}>
          <ActivityIndicator size="large" color={colors.darkText} style={styles.loading} />
        </View>
      );
    }

    const { sourceRegion: sr, effectiveSize: es, masks: previewMasks } = preview;
    const cw = previewContainerSize.w;
    const ch = previewContainerSize.h;

    // effectiveSizeのアスペクト比でコンテナにフィット
    const fitScale = Math.min(cw / es.w, ch / es.h);
    const displayW = es.w * fitScale;
    const displayH = es.h * fitScale;

    // sourceRegion → display領域へのスケール
    const scaleX = displayW / sr.w;
    const scaleY = displayH / sr.h;

    // 元画像全体をsourceRegion部分がdisplay領域に収まるよう配置
    const fullImgW = currentEdit.originalWidth * scaleX;
    const fullImgH = currentEdit.originalHeight * scaleY;

    // mask座標 (effectiveSize空間) → display空間
    const maskScaleX = displayW / es.w;
    const maskScaleY = displayH / es.h;

    return (
      <View style={styles.imageArea} onLayout={onPreviewLayout}>
        {/* display領域: effectiveSizeアスペクト比、overflow:hiddenでクリップ */}
        <View style={{ width: displayW, height: displayH, overflow: 'hidden' }}>
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <Image
              source={{ uri: currentEdit.originalUri }}
              style={{
                position: 'absolute',
                width: fullImgW,
                height: fullImgH,
                left: -sr.x * scaleX,
                top: -sr.y * scaleY,
              }}
            />
          </View>

          {/* マスクオーバーレイ (display領域内に配置) */}
          {previewMasks.map((m, i) => (
            <View
              key={i}
              style={[
                styles.maskOverlay,
                {
                  left: m.x * maskScaleX,
                  top: m.y * maskScaleY,
                  width: m.w * maskScaleX,
                  height: m.h * maskScaleY,
                  transform: [{ rotate: `${m.rotation}deg` }],
                },
              ]}
            />
          ))}
        </View>
        {sizeChanged && effectiveSize && (
          <View style={styles.resolutionBadge} pointerEvents="none">
            <Text style={styles.resolutionText}>{effectiveSize.w}×{effectiveSize.h}</Text>
          </View>
        )}
      </View>
    );
  };

  // ---- Normal view ----
  return (
    <GestureHandlerRootView style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* ヘッダー */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="close" size={26} color={colors.darkText} />
        </TouchableOpacity>

        {totalPages > 1 ? (
          <View style={styles.pageNav}>
            <TouchableOpacity
              onPress={() => setPageIndex(Math.max(0, pageIndex - 1))}
              disabled={pageIndex === 0}
              hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
            >
              <Ionicons name="chevron-back" size={20} color={pageIndex === 0 ? colors.darkTextDisabled : colors.darkText} />
            </TouchableOpacity>
            <Text style={styles.pageText}>{pageIndex + 1} / {totalPages}</Text>
            <TouchableOpacity
              onPress={() => setPageIndex(Math.min(totalPages - 1, pageIndex + 1))}
              disabled={pageIndex === totalPages - 1}
              hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
            >
              <Ionicons name="chevron-forward" size={20} color={pageIndex === totalPages - 1 ? colors.darkTextDisabled : colors.darkText} />
            </TouchableOpacity>
          </View>
        ) : (
          <View />
        )}

        <TouchableOpacity
          style={[styles.registerChip, signing && styles.registerChipDisabled]}
          onPress={handleRegister}
          disabled={signing}
        >
          {signing ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <>
              <Ionicons name="arrow-up-circle" size={14} color={colors.white} />
              <Text style={styles.registerChipText}>{t('edit.share', { count: totalPages })}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* プレビュー */}
      {renderPreview()}

      {/* ツールバー（ラベル付き） */}
      <View style={styles.toolbar}>
        <TouchableOpacity style={styles.toolBtn} onPress={handleUndo} disabled={!canUndo}>
          <Ionicons name="arrow-undo" size={20} color={canUndo ? colors.darkText : colors.darkTextDisabled} />
          <Text style={[styles.toolLabel, !canUndo && styles.toolLabelDisabled]}>{t('edit.undo')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.toolBtn} onPress={handleRedo} disabled={!canRedo}>
          <Ionicons name="arrow-redo" size={20} color={canRedo ? colors.darkText : colors.darkTextDisabled} />
          <Text style={[styles.toolLabel, !canRedo && styles.toolLabelDisabled]}>{t('edit.redo')}</Text>
        </TouchableOpacity>

        <View style={styles.toolSep} />

        {/* トリミング（動画専用・先頭） */}
        {currentIsVideo && (
          <TouchableOpacity
            style={styles.toolBtn}
            onPress={() => setActiveTool('trim')}
          >
            <Ionicons name="cut-outline" size={20} color={colors.darkText} />
            <Text style={styles.toolLabel}>{t('edit.trim')}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.toolBtn}
          onPress={() => setActiveTool('crop')}
          disabled={!effectiveSize}
        >
          <Ionicons name="crop-outline" size={20} color={effectiveSize ? colors.darkText : colors.darkTextDisabled} />
          <Text style={[styles.toolLabel, !effectiveSize && styles.toolLabelDisabled]}>{t('edit.crop')}</Text>
        </TouchableOpacity>
        {/* マスクは画像専用 */}
        {!currentIsVideo && (
          <TouchableOpacity
            style={styles.toolBtn}
            onPress={() => setActiveTool('mask')}
            disabled={!effectiveSize}
          >
            <Ionicons name="eye-off-outline" size={20} color={effectiveSize ? colors.darkText : colors.darkTextDisabled} />
            <Text style={[styles.toolLabel, !effectiveSize && styles.toolLabelDisabled]}>{t('edit.mask')}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.toolBtn}
          onPress={() => setActiveTool('resize')}
          disabled={!effectiveSize}
        >
          <Ionicons name="resize-outline" size={20} color={effectiveSize ? colors.darkText : colors.darkTextDisabled} />
          <Text style={[styles.toolLabel, !effectiveSize && styles.toolLabelDisabled]}>{t('edit.resize')}</Text>
        </TouchableOpacity>

        <View style={styles.toolSep} />

        <TouchableOpacity
          style={[styles.toolBtn, signing && { opacity: 0.4 }]}
          onPress={handleDownload}
          disabled={signing}
        >
          <Ionicons name="download-outline" size={20} color={colors.darkText} />
          <Text style={styles.toolLabel}>{t('edit.save')}</Text>
        </TouchableOpacity>
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.darkBg,
  },
  loading: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    height: 52,
  },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  pageText: {
    color: colors.darkText,
    ...typography.bodyMedium,
    fontVariant: ['tabular-nums'],
    minWidth: 36,
    textAlign: 'center',
  },
  registerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: spacing.sm,
    borderRadius: radii.lg,
    backgroundColor: colors.accent,
    gap: spacing.xs,
  },
  registerChipDisabled: {
    opacity: 0.5,
  },
  registerChipText: {
    color: colors.white,
    ...typography.captionMedium,
  },
  imageArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  maskOverlay: {
    position: 'absolute',
    backgroundColor: colors.darkBg,
  },
  videoPreview: {
    width: '100%',
    height: '100%',
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.overlayMedium,
    justifyContent: 'center',
    alignItems: 'center',
    paddingLeft: 3,
  },
  resolutionBadge: {
    position: 'absolute',
    bottom: spacing.sm,
    alignSelf: 'center',
    backgroundColor: colors.overlayMedium,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.sm,
  },
  resolutionText: {
    color: colors.overlayWhiteFrame,
    ...typography.label,
    fontVariant: ['tabular-nums'],
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 56,
    gap: 0,
  },
  toolBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    minWidth: 48,
  },
  toolLabel: {
    color: colors.darkText,
    fontSize: 9,
    fontWeight: '500',
    marginTop: 2,
    opacity: 0.8,
  },
  toolLabelDisabled: {
    color: colors.darkTextDisabled,
  },
  toolSep: {
    width: 1,
    height: 24,
    backgroundColor: colors.darkSeparator,
    marginHorizontal: spacing.xs,
  },
});
