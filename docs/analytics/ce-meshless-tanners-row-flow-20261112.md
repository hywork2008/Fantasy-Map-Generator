# メッシュなしCE なめし職人の河岸 FMGの川の向きと範囲

実施日: 2026-11-12
計画: [メッシュなしCEのなめし職人の河岸と給水・排水](../plan/ce-meshless-tanners-row.md)（T2・T3の残り）
全量: [ce-meshless-tanners-row-flow-20261112.json](ce-meshless-tanners-row-flow-20261112.json)（T3と同じ11件）
前の記録: [T3](ce-meshless-tanners-row-t3-20261112.md)

## 1. 原因

FMGの川を岸線の起点に使う時に、2つの問題があった。

- **川のパスが一部しかない**: 測量済みの水面（`fixedCrossings`）を持つFMGの川では、メッシュなしの `fmg-river:*` パスは渡河点の短い証人（witness、1本の3次曲線）だけで、川の全体ではない。gondreでは、証人が町の中心の近くで終わり、その下流の岸が取れなかった。
- **パスの向きが流れの向きとは限らない**: 証人の点の順序は流れの向きと一致する保証がない。mesh CEでは `riverFlowsFromDescriptor`（FMGの標高から下流を決める）で向きをそろえているが、メッシュなしでは使っていなかった。

## 2. 変更（`facilityLots.ts` `riverCourses`）

- 川岸の起点に使う川の線は、次の2つを合わせたものにする。
  - 描かれた川のパス。FMGの証人は、記述子の川が標高で向きを決められた場合（`basis` が `fmgElevation`・`localElevation`）に、その向きへそろえる。
  - 記述子の川の線そのもの（`riverFlowsFromDescriptor`）。
- 重なる区間の工房は、置いた敷地との重なりで後の方が外れる。その中から、工房が最も多く立つ区間が選ばれる。
- 計測（`tanneryT0.cli.test.ts`）の流れの向きと町の下流の判定も、同じ線を使うように直した。

記述子の線だけに置き換える案も試したが、FMGの記述子の線は数点しかない粗い折れ線で、測量した水面から40 m以上離れる所がある。そのため、gothengsfeldが14軒から2軒に、myosiasosが28軒から0軒に減った。両方を合わせる形にした。

## 3. 結果

| ケース | 配置（T3→今回） | 未配置 | 群 |
|---|---|---|---|
| gondre | 0 → **9** | frame 5 | 1 |
| gothengsfeld | 14 → 14 | 0 | 1 |
| myosiasos | 28 → 28 | 0 | 2 |
| archiagu | 5 → 5 | river 43 | 1 |
| 合成7件 | 変化なし | | |

- gondreは、町の南の河口沿いに9軒が1列に並ぶ。残り5軒は地図の枠で切れた分（問題にしない）。
- archiaguは変わらない。この町の川は幅2 mの小川で、FMGの川の源が町のすぐ外にある。描かれた線と水面がずれる原因は、今回は特定していない。

## 4. 試験

- `npx vitest run src/city-editor/generators/vector/generation src/city-editor/renderers/vector/renderData.test.ts`: 32ファイル中31成功・1スキップ。
