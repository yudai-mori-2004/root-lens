import React, { useState, useRef, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  PanResponder,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';

// 動画トリミングツール（時間方向）
// - タイムラインバー上でドラッグして開始/終了を指定
// - 左エリアドラッグ → 開始位置変更、右エリアドラッグ → 終了位置変更

const SCREEN_WIDTH = Dimensions.get('window').width;
const TIMELINE_PAD = 24;
const TIMELINE_W = SCREEN_WIDTH - TIMELINE_PAD * 2;
const TIMELINE_H = 56;
const MIN_DURATION_MS = 500;

interface TrimToolProps {
  videoUri: string;
  existingTrim?: { startMs: number; endMs: number };
  onApply: (trim: { startMs: number; endMs: number }) => void;
  onCancel: () => void;
}

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  const frac = Math.floor((ms % 1000) / 100);
  return `${m}:${String(s).padStart(2, '0')}.${frac}`;
}

export default function TrimTool({ videoUri, existingTrim, onApply, onCancel }: TrimToolProps) {
  const insets = useSafeAreaInsets();
  const videoRef = useRef<Video>(null);
  const [durationMs, setDurationMs] = useState(0);
  const [startMs, setStartMs] = useState(existingTrim?.startMs ?? 0);
  const [endMs, setEndMs] = useState(existingTrim?.endMs ?? 0);
  const [currentPosMs, setCurrentPosMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // 全てrefで参照（PanResponder内からのアクセス用）
  const startRef = useRef(startMs);
  startRef.current = startMs;
  const endRef = useRef(endMs);
  endRef.current = endMs;
  const durationRef = useRef(durationMs);
  durationRef.current = durationMs;

  const onVideoLoad = useCallback((status: AVPlaybackStatus) => {
    if (status.isLoaded && status.durationMillis) {
      const dur = status.durationMillis;
      setDurationMs(dur);
      if (!existingTrim) {
        setEndMs(dur);
      }
    }
  }, [existingTrim]);

  const onPlaybackUpdate = useCallback((status: AVPlaybackStatus) => {
    if (status.isLoaded) {
      setCurrentPosMs(status.positionMillis);
      // トリム範囲の制約: endを超えたらstartに戻して一時停止
      if (status.isPlaying && status.positionMillis >= endRef.current) {
        videoRef.current?.pauseAsync();
        videoRef.current?.setPositionAsync(startRef.current);
        setIsPlaying(false);
      }
      if (status.didJustFinish) {
        setIsPlaying(false);
        videoRef.current?.setPositionAsync(startRef.current);
      }
    }
  }, []);

  // ref経由でms↔X変換（PanResponder内で使う）
  const msToXRef = useCallback((ms: number) => {
    const dur = durationRef.current;
    if (dur <= 0) return 0;
    return (ms / dur) * TIMELINE_W;
  }, []);

  const xToMsRef = useCallback((x: number) => {
    const dur = durationRef.current;
    if (dur <= 0) return 0;
    return Math.round(Math.max(0, Math.min(x, TIMELINE_W)) / TIMELINE_W * dur);
  }, []);

  // タイムライン全体を1つのPanResponderで管理
  // タッチ位置が左半分→開始ハンドル、右半分→終了ハンドルを操作
  type DragTarget = 'start' | 'end' | null;
  const dragTarget = useRef<DragTarget>(null);
  const dragOriginX = useRef(0);
  const dragOriginMs = useRef(0);

  const timelinePan = useMemo(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const touchX = evt.nativeEvent.locationX;
        const startX = msToXRef(startRef.current);
        const endX = msToXRef(endRef.current);
        const midX = (startX + endX) / 2;

        // タッチ位置で開始/終了のどちらを操作するか判定
        if (touchX <= midX) {
          dragTarget.current = 'start';
          dragOriginMs.current = startRef.current;
        } else {
          dragTarget.current = 'end';
          dragOriginMs.current = endRef.current;
        }
        dragOriginX.current = touchX;
      },
      onPanResponderMove: (_, gesture) => {
        const target = dragTarget.current;
        if (!target) return;

        const newX = dragOriginX.current + gesture.dx;
        const newMs = xToMsRef(newX);

        if (target === 'start') {
          const maxStart = endRef.current - MIN_DURATION_MS;
          const clamped = Math.max(0, Math.min(newMs, maxStart));
          setStartMs(clamped);
        } else {
          const minEnd = startRef.current + MIN_DURATION_MS;
          const clamped = Math.min(durationRef.current, Math.max(newMs, minEnd));
          setEndMs(clamped);
        }
      },
      onPanResponderRelease: () => {
        const target = dragTarget.current;
        if (target === 'start') {
          videoRef.current?.setPositionAsync(startRef.current);
        } else if (target === 'end') {
          videoRef.current?.setPositionAsync(Math.max(0, endRef.current - 500));
        }
        dragTarget.current = null;
      },
    }),
  [msToXRef, xToMsRef]);

  // 再生/一時停止トグル（トリム範囲内で再生）
  const togglePlayPause = useCallback(async () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      await videoRef.current.pauseAsync();
      setIsPlaying(false);
    } else {
      const status = await videoRef.current.getStatusAsync();
      if (status.isLoaded && (status.positionMillis < startRef.current || status.positionMillis >= endRef.current - 100)) {
        await videoRef.current.setPositionAsync(startRef.current);
      }
      await videoRef.current.playAsync();
      setIsPlaying(true);
    }
  }, [isPlaying]);

  const handleApply = () => {
    onApply({ startMs, endMs });
  };

  // 表示用X座標計算（render内なのでstateから直接計算してOK）
  const toX = (ms: number) => durationMs > 0 ? (ms / durationMs) * TIMELINE_W : 0;
  const selectedDuration = endMs - startMs;
  const startX = toX(startMs);
  const endX = toX(endMs);
  const posX = toX(currentPosMs);

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onCancel} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.cancelText}>キャンセル</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>トリミング</Text>
        <TouchableOpacity onPress={handleApply} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.applyText}>適用</Text>
        </TouchableOpacity>
      </View>

      {/* 動画プレビュー（自前の再生コントロール） */}
      <View style={styles.videoArea}>
        <Video
          ref={videoRef}
          source={{ uri: videoUri }}
          style={styles.video}
          resizeMode={ResizeMode.CONTAIN}
          shouldPlay={false}
          isLooping={false}
          progressUpdateIntervalMillis={50}
          onLoad={onVideoLoad}
          onPlaybackStatusUpdate={onPlaybackUpdate}
        />
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={togglePlayPause}
        >
          {!isPlaying && (
            <View style={styles.playOverlay}>
              <View style={styles.playCircle}>
                <Text style={styles.playIcon}>▶</Text>
              </View>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* 時間表示 */}
      <View style={styles.timeRow}>
        <Text style={styles.timeText}>{formatTime(startMs)}</Text>
        <Text style={styles.durationText}>
          選択: {formatTime(selectedDuration)}
        </Text>
        <Text style={styles.timeText}>{formatTime(endMs)}</Text>
      </View>

      {/* タイムライン (1つのPanResponderで全体管理) */}
      <View style={styles.timelineOuter}>
        <View style={styles.timelineContainer} {...timelinePan.panHandlers}>
          {/* 背景 (非選択エリア) */}
          <View style={styles.timelineBar} />

          {/* 選択範囲 */}
          <View
            style={[
              styles.selectedRange,
              { left: startX, width: Math.max(0, endX - startX) },
            ]}
          />

          {/* 再生位置 */}
          {durationMs > 0 && (
            <View style={[styles.playhead, { left: posX - 1 }]} />
          )}

          {/* 開始ハンドル */}
          <View style={[styles.handle, { left: startX - 2 }]}>
            <View style={styles.handleLine} />
            <View style={styles.handleKnob} />
          </View>

          {/* 終了ハンドル */}
          <View style={[styles.handle, { left: endX - 2 }]}>
            <View style={styles.handleLine} />
            <View style={styles.handleKnob} />
          </View>
        </View>
      </View>

      {/* 全体時間 */}
      <Text style={styles.totalDuration}>
        全体: {formatTime(durationMs)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 48,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelText: { color: '#fff', fontSize: 16 },
  applyText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  videoArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  video: {
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
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playIcon: {
    color: '#fff',
    fontSize: 22,
    marginLeft: 3,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: TIMELINE_PAD,
    paddingVertical: 8,
  },
  timeText: {
    color: '#aaa',
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  durationText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  timelineOuter: {
    paddingHorizontal: TIMELINE_PAD,
    paddingVertical: 8,
  },
  timelineContainer: {
    height: TIMELINE_H,
    position: 'relative',
    justifyContent: 'center',
  },
  timelineBar: {
    height: 6,
    backgroundColor: '#333',
    borderRadius: 3,
  },
  selectedRange: {
    position: 'absolute',
    height: 6,
    backgroundColor: '#fff',
    borderRadius: 3,
    top: (TIMELINE_H - 6) / 2,
  },
  playhead: {
    position: 'absolute',
    width: 2,
    height: TIMELINE_H - 8,
    backgroundColor: '#e53935',
    borderRadius: 1,
    top: 4,
  },
  handle: {
    position: 'absolute',
    alignItems: 'center',
    top: 0,
    width: 4,
    height: TIMELINE_H,
  },
  handleLine: {
    width: 2,
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 1,
  },
  handleKnob: {
    position: 'absolute',
    top: (TIMELINE_H - 20) / 2,
    width: 14,
    height: 20,
    borderRadius: 4,
    backgroundColor: '#fff',
  },
  totalDuration: {
    color: '#666',
    fontSize: 12,
    textAlign: 'center',
    paddingBottom: 16,
    fontVariant: ['tabular-nums'],
  },
});
