import type { Point, RegionLabel, RegionSettlement } from "../types";

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function intersects(a: BoundingBox, b: BoundingBox): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;
}

/**
 * 集落ラベルの最適なオフセット位置を計算し、重なりを回避する
 */
export function resolveSettlementLabelPlacements(
  settlements: RegionSettlement[],
  existingLabels: RegionLabel[] = []
): Array<{ settlementId: string; offset: Point }> {
  const placedBoxes: BoundingBox[] = [];

  // 既存の地域ラベルのバウンディングボックスを登録
  for (const l of existingLabels) {
    const estWidth = l.text.length * (l.fontSizePt * 0.6);
    const estHeight = l.fontSizePt * 1.2;
    placedBoxes.push({
      minX: l.position[0] - estWidth / 2,
      minY: l.position[1] - estHeight / 2,
      maxX: l.position[0] + estWidth / 2,
      maxY: l.position[1] + estHeight / 2
    });
  }

  const results: Array<{ settlementId: string; offset: Point }> = [];

  // 候補オフセット（下、上、右、左）
  const candidateOffsets: Point[] = [
    [0, 14], // 下（標準）
    [0, -14], // 上
    [16, 4], // 右
    [-16, 4] // 左
  ];

  for (const s of settlements) {
    const estWidth = s.name.length * 7;
    const estHeight = 12;

    let bestOffset = candidateOffsets[0];
    let minOverlaps = Infinity;

    for (const offset of candidateOffsets) {
      const box: BoundingBox = {
        minX: s.position[0] + offset[0] - estWidth / 2,
        minY: s.position[1] + offset[1] - estHeight / 2,
        maxX: s.position[0] + offset[0] + estWidth / 2,
        maxY: s.position[1] + offset[1] + estHeight / 2
      };

      let overlaps = 0;
      for (const placed of placedBoxes) {
        if (intersects(box, placed)) {
          overlaps++;
        }
      }

      if (overlaps < minOverlaps) {
        minOverlaps = overlaps;
        bestOffset = offset;
        if (overlaps === 0) break;
      }
    }

    results.push({ settlementId: s.id, offset: bestOffset });

    // 確定したボックスを追加
    placedBoxes.push({
      minX: s.position[0] + bestOffset[0] - estWidth / 2,
      minY: s.position[1] + bestOffset[1] - estHeight / 2,
      maxX: s.position[0] + bestOffset[0] + estWidth / 2,
      maxY: s.position[1] + bestOffset[1] + estHeight / 2
    });
  }

  return results;
}
