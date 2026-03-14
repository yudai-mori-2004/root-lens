// デザイントークン定義
// 仕様書 §3.1.1 UI表現の基本方針

// ── ブランドカラー ──
// インディゴ: 権威・確信・深み。「本物の証明」の重みを表現するアクセントカラー
export const colors = {
  // Brand
  accent: '#1E3A5F',        // ネイビーブルー — 紋章・証明の重厚さ
  accentLight: '#E8EEF4',   // ネイビーの淡い背景色
  accentDark: '#172E4A',    // pressed state

  // Neutral
  black: '#000000',
  white: '#FFFFFF',
  background: '#FFFFFF',
  surface: '#F7F7F7',       // カード・セクション背景
  surfaceAlt: '#F0F0F0',    // 画像プレースホルダー等

  // Text
  textPrimary: '#1A1A1A',
  textSecondary: '#666666',
  textHint: '#999999',
  textDisabled: '#BBBBBB',

  // Border
  border: '#E5E5E5',
  borderLight: '#F0F0F0',

  // Semantic
  success: '#2E7D32',
  successLight: '#E8F5E9',
  error: '#D32F2F',
  errorLight: '#FFEBEE',
  recording: '#E53935',

  // Overlay (dark on light)
  overlayLight: 'rgba(0,0,0,0.15)',
  overlayMedium: 'rgba(0,0,0,0.4)',
  overlayCrop: 'rgba(0,0,0,0.55)',
  overlayDark: 'rgba(0,0,0,0.6)',

  // Overlay (light on dark)
  overlayWhiteFaint: 'rgba(255,255,255,0.08)',
  overlayWhiteSubtle: 'rgba(255,255,255,0.1)',
  overlayWhite: 'rgba(255,255,255,0.15)',
  overlayWhiteGrid: 'rgba(255,255,255,0.25)',
  overlayWhiteMask: 'rgba(255,255,255,0.3)',
  overlayWhiteLine: 'rgba(255,255,255,0.4)',
  overlayWhiteHalf: 'rgba(255,255,255,0.5)',
  overlayWhiteFrame: 'rgba(255,255,255,0.7)',

  // Camera/Edit (dark UI)
  darkBg: '#000000',
  darkText: '#FFFFFF',
  darkTextSecondary: '#AAAAAA',
  darkTextDisabled: '#555555',
  darkSeparator: 'rgba(255,255,255,0.2)',
} as const;

// ── タイポグラフィ ──
export const typography = {
  heading: {
    fontSize: 20,
    fontWeight: '700' as const,
    lineHeight: 28,
  },
  title: {
    fontSize: 17,
    fontWeight: '600' as const,
    lineHeight: 24,
  },
  body: {
    fontSize: 15,
    fontWeight: '400' as const,
    lineHeight: 22,
  },
  bodyMedium: {
    fontSize: 15,
    fontWeight: '500' as const,
    lineHeight: 22,
  },
  caption: {
    fontSize: 13,
    fontWeight: '400' as const,
    lineHeight: 18,
  },
  captionMedium: {
    fontSize: 13,
    fontWeight: '600' as const,
    lineHeight: 18,
  },
  label: {
    fontSize: 11,
    fontWeight: '600' as const,
    lineHeight: 14,
  },
  small: {
    fontSize: 10,
    fontWeight: '600' as const,
    lineHeight: 14,
  },
} as const;

// ── スペーシング ──
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

// ── 形状 ──
export const radii = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 20,
  full: 9999,
} as const;

// ── ヘッダー共通 ──
export const headerStyle = {
  height: 52,
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  justifyContent: 'space-between' as const,
  paddingHorizontal: 16, // spacing.lg
  borderBottomWidth: 1,
  borderBottomColor: '#F0F0F0', // colors.borderLight
};

// Navigation header（NativeStack用）
export const navigationHeaderOptions = {
  headerStyle: {
    backgroundColor: '#FFFFFF', // colors.background
  },
  headerTintColor: '#1A1A1A', // colors.textPrimary
  headerTitleStyle: {
    fontWeight: '600' as const,
    fontSize: 17,
  },
  headerShadowVisible: false,
  headerBackTitleVisible: false,
};

// ── シャドウ ──
export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
} as const;
