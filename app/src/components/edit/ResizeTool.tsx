import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// 仕様書 §3.6: 情報を減らす操作 — サイズ変更（縮小のみ）
// アスペクト比は固定。解像度（ピクセル数）のみ均一に縮小する

interface ResizeToolProps {
  effectiveWidth: number;
  effectiveHeight: number;
  onApply: (size: { width: number; height: number }) => void;
  onCancel: () => void;
}

const SCALE_PRESETS = [
  { label: '75%', scale: 0.75 },
  { label: '50%', scale: 0.5 },
  { label: '25%', scale: 0.25 },
];

export default function ResizeTool({ effectiveWidth, effectiveHeight, onApply, onCancel }: ResizeToolProps) {
  const insets = useSafeAreaInsets();
  const [selectedScale, setSelectedScale] = useState<number | null>(null);

  const handleApply = () => {
    if (selectedScale == null) return;
    onApply({
      width: Math.round(effectiveWidth * selectedScale),
      height: Math.round(effectiveHeight * selectedScale),
    });
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onCancel} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.cancelText}>キャンセル</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleApply} disabled={selectedScale == null} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={[styles.applyText, selectedScale == null && styles.applyTextDisabled]}>適用</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <Text style={styles.currentSize}>
          現在の解像度: {effectiveWidth} x {effectiveHeight} px
        </Text>

        <View style={styles.presetList}>
          {SCALE_PRESETS.map((p) => {
            const w = Math.round(effectiveWidth * p.scale);
            const h = Math.round(effectiveHeight * p.scale);
            const isSelected = selectedScale === p.scale;
            return (
              <TouchableOpacity
                key={p.label}
                style={[styles.presetItem, isSelected && styles.presetItemActive]}
                onPress={() => setSelectedScale(isSelected ? null : p.scale)}
              >
                <Text style={[styles.presetLabel, isSelected && styles.presetLabelActive]}>
                  {p.label}
                </Text>
                <Text style={[styles.presetDimensions, isSelected && styles.presetDimensionsActive]}>
                  {w} x {h} px
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, height: 48,
  },
  cancelText: { color: '#fff', fontSize: 16 },
  applyText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  applyTextDisabled: { color: '#555' },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  currentSize: { color: '#888', fontSize: 14, textAlign: 'center', marginBottom: 32 },
  presetList: { gap: 12 },
  presetItem: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#1a1a1a', borderRadius: 12,
    paddingVertical: 16, paddingHorizontal: 20,
  },
  presetItemActive: { backgroundColor: '#fff' },
  presetLabel: { color: '#fff', fontSize: 17, fontWeight: '600' },
  presetLabelActive: { color: '#000' },
  presetDimensions: { color: '#666', fontSize: 14 },
  presetDimensionsActive: { color: '#444' },
});
