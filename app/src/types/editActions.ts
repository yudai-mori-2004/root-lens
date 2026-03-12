// 仕様書 §3.6 編集画面
// 編集操作はアクション履歴として保持し、プレビューは動的レンダリング
// 最終保存時のみ実画像を生成する

export type EditAction =
  | { type: 'crop'; originX: number; originY: number; width: number; height: number }
  | { type: 'mask'; x: number; y: number; w: number; h: number; rotation: number }
  | { type: 'resize'; width: number; height: number }
  | { type: 'trim'; startMs: number; endMs: number };

export interface EditState {
  originalUri: string;
  originalWidth: number;
  originalHeight: number;
  actions: EditAction[];
  currentIndex: number; // -1 = no actions applied, else last applied action index
}

/** プレビュー用の算出結果 */
export interface PreviewTransform {
  /** 元画像から切り出す領域 (ピクセル座標) */
  sourceRegion: { x: number; y: number; w: number; h: number };
  /** 最終的な論理サイズ (リサイズ適用後) */
  effectiveSize: { w: number; h: number };
  /** マスク (effectiveSize座標系) */
  masks: Array<{ x: number; y: number; w: number; h: number; rotation: number }>;
}

/**
 * アクション履歴からプレビュー描画に必要な情報を算出する
 *
 * 座標変換の考え方:
 * - crop: sourceRegionを絞る。後続アクションの座標系はcrop後のサイズ基準
 * - resize: effectiveSizeを変更。後続アクションの座標系はresize後のサイズ基準
 * - mask: そのまま記録。座標はその時点のeffectiveSize基準
 */
export function computePreviewTransform(
  originalWidth: number,
  originalHeight: number,
  actions: EditAction[],
  currentIndex: number,
): PreviewTransform {
  // 元画像からの累積クロップ領域
  let srcX = 0;
  let srcY = 0;
  let srcW = originalWidth;
  let srcH = originalHeight;

  // 現在の論理キャンバスサイズ
  let canvasW = originalWidth;
  let canvasH = originalHeight;

  // マスク (最終的なeffectiveSize座標系に変換済み)
  const masks: PreviewTransform['masks'] = [];

  // 後でmask座標を最終effectiveSize空間に変換するため、
  // 各maskが追加された時点でのcanvasサイズを記録する
  interface PendingMask {
    x: number; y: number; w: number; h: number; rotation: number;
    // この時点での元画像→canvas変換情報
    srcX: number; srcY: number; srcW: number; srcH: number;
    canvasW: number; canvasH: number;
  }
  const pendingMasks: PendingMask[] = [];

  const activeActions = actions.slice(0, currentIndex + 1);

  for (const action of activeActions) {
    switch (action.type) {
      case 'crop': {
        // action座標は現在のcanvas空間基準
        // 元画像空間に変換
        const scaleX = srcW / canvasW;
        const scaleY = srcH / canvasH;
        srcX += action.originX * scaleX;
        srcY += action.originY * scaleY;
        srcW = action.width * scaleX;
        srcH = action.height * scaleY;
        canvasW = action.width;
        canvasH = action.height;
        break;
      }
      case 'resize': {
        canvasW = action.width;
        canvasH = action.height;
        break;
      }
      case 'mask': {
        pendingMasks.push({
          x: action.x, y: action.y, w: action.w, h: action.h, rotation: action.rotation,
          srcX, srcY, srcW, srcH, canvasW, canvasH,
        });
        break;
      }
    }
  }

  // pendingMasksを最終effectiveSize座標系に変換
  for (const pm of pendingMasks) {
    // mask座標はpm.canvasW x pm.canvasH空間内
    // 最終canvasはcanvasW x canvasH空間
    // mask時点の元画像領域: pm.srcX, pm.srcY, pm.srcW, pm.srcH
    // 最終の元画像領域: srcX, srcY, srcW, srcH

    // mask座標を元画像ピクセルに変換
    const mScaleX = pm.srcW / pm.canvasW;
    const mScaleY = pm.srcH / pm.canvasH;
    const absX = pm.srcX + pm.x * mScaleX;
    const absY = pm.srcY + pm.y * mScaleY;
    const absW = pm.w * mScaleX;
    const absH = pm.h * mScaleY;

    // 元画像ピクセルから最終canvas座標に変換
    const fScaleX = canvasW / srcW;
    const fScaleY = canvasH / srcH;
    masks.push({
      x: (absX - srcX) * fScaleX,
      y: (absY - srcY) * fScaleY,
      w: absW * fScaleX,
      h: absH * fScaleY,
      rotation: pm.rotation,
    });
  }

  return {
    sourceRegion: { x: srcX, y: srcY, w: srcW, h: srcH },
    effectiveSize: { w: canvasW, h: canvasH },
    masks,
  };
}

/**
 * 現在のアクション適用後の論理サイズを返す
 * ツールに現在のサイズを渡すために使用
 */
export function getEffectiveSize(
  originalWidth: number,
  originalHeight: number,
  actions: EditAction[],
  currentIndex: number,
): { w: number; h: number } {
  let w = originalWidth;
  let h = originalHeight;
  const active = actions.slice(0, currentIndex + 1);
  for (const action of active) {
    if (action.type === 'crop') {
      w = action.width;
      h = action.height;
    } else if (action.type === 'resize') {
      w = action.width;
      h = action.height;
    }
  }
  return { w, h };
}
