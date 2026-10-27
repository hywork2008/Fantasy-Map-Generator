# 河口都市の水際城壁・橋進入路の修正（2026-10-27）

Nobraで海と河川が連続している水際に町の城壁が残り、橋から岸沿いに道を延ばして岸辺に門を置く問題を修正した。比較元は `8ed0d8c7c1d803075f84a6f44bcd696259056ba9`。

## 形状の修正

- FMGが `coastConstrained` としている、川と海の両方に接する都市で `Wall coast = Open` の場合、河川の測量岸と海岸を同じ開放水際として扱う。岸から24m以内で岸に並走する町の城壁区間を、生成途中の城壁ステージから取り除く。陸側の壁が岸へ直角に突き当たって終わる部分は維持する。手動・ロック済みの壁や独立した城の防壁、明示的な海岸城壁設定は対象外。
- 橋と接続道は、都市メッシュの境界で切り分ける前に全体を計画する。橋の法線方向に陸側の進入直線を確保し、その手前を陸上の曲線で接続する。曲線は道路幅を含む領域を測量水面に照らして確認する。Nobraの2本はそれぞれ40mの進入直線を持つ。
- 市街地の道路も、その陸側の接続点を使う。従来の「元のFMG放射線が岸に当たった点」と「CEが選んだ橋脚」の間を岸沿いに無理につなぐ形を解消する。
- 生成後の道路終点・交差点補正が、この進入直線を動かして橋軸から外すことを防ぐ。FMGが測量済みの固定橋の座標は変更しない。

[変更前後の画像](raw/ce-estuary-approaches-20261027/comparison.png)を、CEの実際のスタイルを付けたChromium描画で確認した。水際の町の城壁と岸辺の門がなくなり、2本の橋へ陸側から接続する。城壁・門準備・街路・街区のプレビューステージも生成に成功した。

## 品質と性能

Nobraでは、外部道路未接続 **1件 → 0件**、門接続不成立による候補破棄 **2件 → 0件**。町の門は測量河岸・海岸から24m超離れ、両橋の進入直線は完成後も橋軸と同一直線上に残る。住宅不足0、建物の水面重複0を回帰テストで確認した。

Nobra・Obern・Jilesca・Sesenevaを固定入力・固定シードで各2回確認した。8回とも生成成功、交差検証エラー0、橋の角度上限超過0。同一都市の2回のfingerprintはすべて一致した。

以下は、他のテストや型検査を並走させずに再計測した `generationMs` の都市別平均。直前版は[前回の比較](ce-waterfront-generation-20261027.md)の記録値。

| 都市 | 直前版 秒 | 今回 秒 | 候補破棄 | 外部道路未接続 |
| --- | ---: | ---: | ---: | ---: |
| Seseneva | 3.430 | 3.364 | 0 → 0 | 0 → 0 |
| Nobra | 4.939 | 6.468 | 2 → 0 | 1 → 0 |
| Obern | 2.607 | 2.618 | 0 → 0 | 0 → 0 |
| Jilesca | 2.467 | 2.766 | 0 → 0 | 0 → 0 |

**Nobraは直前版より遅い。** 岸辺の門を廃止した経路・二重城壁を保持した市街地では、住宅面積の実測補正が1回必要となり、初期fabricが1回から2回になった。初回性能改善前の9.00秒よりは短いが、今回の形状修正を追加の高速化としては扱わない。次に進める作業は、二重城壁と陸側進入路が消費する面積を初期予約へ織り込み、この追加の面積補正を省くこと。

## 検証と保存

関連する10ファイルのVitestで **51成功・1スキップ**。全件テストは実行していない。

- `frameRoads.test.ts`、`site/importedRoads.test.ts`、`surveyedRiverWalls.test.ts`
- `nidyiaWaterfront.test.ts`、`frameRoadJunction.test.ts`、`roadEndpoints.test.ts`
- `fmgHandoffGeneration.test.ts`、`generate.gothengsfeld.test.ts`
- `generation/previews.test.ts`、`regionalRoadGates.test.ts`

道路の接続点が変わるため、Ablosのテストを特定の頂点IDではなく、描画される街路との接続・水面を通過しないことの検証へ更新した。以前は接続不能だったVilealandのfar-shore入口は接続可能になり、その接続を検証するよう更新した。Nobraでは水際の壁の再出現、岸辺の門、橋進入直線の変形、道路未接続を検出するテストを追加した。

`npx tsc --noEmit --pretty false`、変更TSファイルのBiome、`git diff --check` は成功。

- [都市別比較CSV](ce-estuary-approaches-20261027.comparison.csv)
- [全量出力のSHA-256一覧](ce-estuary-approaches-20261027.sha256.csv)
- 固定入力は[前回の20都市入力](ce-waterfront-generation-20261027.inputs.csv)から `7,13,93,396` を使用。
- 全量JSONL・SVG・変更前のNobra文書・比較画像はGit管理外の `docs/analytics/raw/ce-estuary-approaches-20261027/` に保存。`after-final.jsonl` が最終の性能計測。SVG付きの先行計測 `after.jsonl` は並走テストの負荷を含むため、性能比較には使わない。

```sh
node --import tsx scripts/benchmarkFmgCities.mjs \
  docs/analytics/ce-waterfront-generation-20261027.inputs.csv \
  docs/analytics/raw/ce-estuary-approaches-20261027/recheck.jsonl \
  --burg 13,93,396,7 --repeat 2 --jobs 1
```

## 住宅面積予約の追加改善

Nobraの追加生成を省く初期予約の改善を実施した。結果と適用範囲は[河口都市の住宅面積予約](ce-estuary-housing-20261027.md)を参照。上の値は改善前の記録として保持する。
