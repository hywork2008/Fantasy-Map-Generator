# CE樹木のバイオーム・文化別選択監査

確認用画像は目視比較のための一時出力とし、永続保存・Git収録を行わない。画像ファイルの有無を完了条件にせず、以下の所見・条件・計測値・再現手順を記録として残す。既存スクリプトによる画像出力も確認後に削除する。

実施日：2026-10-29。対象：[作製計画](../plan/ce-forest-biome-tree-lod-tasks.md) F4-2／F4-3。

## 修正内容

樹種選択がバイオーム名の部分一致に依存し、海・ツンドラ・氷河・溶岩原でもシナノキへfallbackしていた。生成器とSVG／3Dも別々に判断していたため、古い森林計画や保存済み公園・墓地の候補があると立木が残った。標準29キーの植生方針を `landscapeVegetation.ts` に明示し、樹種選択・生成・両描画経路で共有した。

- `marine`／`tundra`／`glacier`／`lavaField` は無立木。森林領域による農地の取り込み、公園・空地・墓地の自動立木生成を止める。保存済み候補も描画しない。森林設定・手動上書き・保存済み植栽候補・メッシュは削除せず、バイオームを戻せば再利用できる。
- 公園の芝生・通路・草、墓地の区画・墓・境界、ツンドラ／氷河の岩や氷雪装飾は維持する。建物・ランドマークの固定モデル内部に含まれる樹木の形状変更は対象外。
- `temperateConiferousForest` は温度不明または3℃超でベイスギ、3℃以下でトウヒ／シラカバを選ぶ。`floodedForest` は20℃未満・温度不明でハンノキ、20℃以上でカポック。既存の地点seedによる混合を維持する。
- 墓地は文化ごとのpreferred樹種を共有セレクタへ渡し、既存の気候適応を維持する。中立条件では30文化の各植栽設定を保持し、SVGと3Dの判定を一致させた。イチイ・イトスギ・コノテガシワ・ボダイジュ・ヤナギを森林の主樹種へ一括転用しない。
- BVの関連バイオーム表示を、温度分岐を含む実際のCE森林選択へ合わせた。ギョリュウはxericShrubland、borealPeatlandはトウヒ／シラカバ。用途別5種には自然林としての関連表示を付けない。表示は植物学的な全分布を示すものではない。
- 森林計画のcache keyへ解決後の植生方針を含め、同じdocumentのバイオーム変更でも無立木判定を更新する。簡略樹形も解決後の樹種から選び、カスタム表示名に含まれるtaiga等では変えない。

モデルの形状、4品質factory、作者、CE採用版は今回変更していない。

## カスタム入力と優先順位

1. 明示された標準バイオームキーの完全一致を優先する（大文字小文字は区別しない）。既知キーがあれば矛盾するタグより優先する。
2. カスタム／未知キーではタグを使う。marineを最優先し、標準キーに一致するタグ、その後の一般タグを解決する。forest＋coldは寒帯林、desert＋coldは寒冷砂漠、forestを伴わないsnowは無立木。表示名やキー内の断片は解釈しない。
3. タグで解決できなければ生成descriptorのclimate.biomeKeyを使う。
4. 未解決なら用途側のpreferredを保持する。未知・未指定という理由だけでは無立木にも寒帯林にもしない。grasslandもpreferredを保持する。

温度は生成descriptorのtemperatureCを優先し、なければbuildingAppearanceContextを使う。既存の森林設定の有効化条件を変える変更ではなく、草原・砂漠の全域を新たに森林化する処理は追加していない。自然林・人工植栽の密度と場所の適合はF2-3等に残す。

## 固定監査

[意味的監査JSON](ce-tree-biome-policy-20261029.json) に固定seed `flora-matrix-v1`、29バイオーム×7温度条件×64地点（12,992地点照会）の樹種内訳と、29バイオーム×30埋葬文化（870例）の描画対象樹種を保存した。温度条件は未指定・−5・3・3.01・19.99・20・30℃。文化別表は温度未指定で採取し、全温度との直積ではない。JSON内に監査スクリプトと関連ソースのSHA-256を記録した。

| 標準キー | 解決方針 | 森林候補の樹種（全温度条件の和集合） |
| --- | --- | --- |
| `marine` | `none` | 無立木 |
| `hotDesert` | `palm` | `date_palm` |
| `coldDesert` | `desert` | `saxaul` |
| `savanna` | `savanna` | `date_palm`, `umbrella_thorn` |
| `grassland` | `preferred` | `garden_parkland` |
| `tropicalSeasonalForest` | `savanna` | `date_palm`, `umbrella_thorn` |
| `temperateDeciduousForest` | `temperate` | `garden_parkland`, `norway_spruce`, `silver_birch` |
| `tropicalRainforest` | `rainforest` | `kapok` |
| `temperateRainforest` | `cedar` | `western_red_cedar` |
| `taiga` | `boreal` | `norway_spruce`, `silver_birch` |
| `tundra` | `none` | 無立木 |
| `glacier` | `none` | 無立木 |
| `wetland` | `alder` | `black_alder` |
| `centralEuropeanGreatForest` | `temperate` | `garden_parkland`, `norway_spruce`, `silver_birch` |
| `mediterraneanWoodlandScrub` | `olive` | `olive` |
| `temperateConiferousForest` | `conifer` | `norway_spruce`, `silver_birch`, `western_red_cedar` |
| `montaneForest` | `fir` | `silver_fir` |
| `alpineTundra` | `rowan` | `rowan` |
| `mangrove` | `mangrove` | `red_mangrove` |
| `xericShrubland` | `xeric` | `date_palm`, `tamarisk` |
| `cloudForest` | `rainforest` | `kapok` |
| `heathMoorland` | `rowan` | `rowan` |
| `floodedForest` | `flooded` | `black_alder`, `kapok` |
| `coldSteppe` | `desert` | `saxaul` |
| `tropicalDryForest` | `savanna` | `date_palm`, `umbrella_thorn` |
| `borealPeatland` | `boreal` | `norway_spruce`, `silver_birch` |
| `volcanicBarrens` | `volcanic` | `canary_pine` |
| `lavaField` | `none` | 無立木 |
| `volcanicSoil` | `volcanic` | `canary_pine` |

## 描画確認

[Metal GPUの結果](ce-tree-biome-policy-20261029/results.json) はApple M4／ANGLE Metal、800×600、DPR 1、固定の96 m四方の古い森林計画と保存済み公園候補を入力した公開描画経路の確認。`createTownForest`（簡略化無効）、`collectOpenSpacePlan`／`createTownOpenSpaces`、`renderForestLayer` を通した。全CEのUI操作やフレーム性能を測定するハーネスではない。

| 条件 | 森林面積 m² | 森林立木 | 森林三角形 | 公園立木サイト | SVG立木 | 解放後geometry |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `temperateDeciduousForest` | 9216.0 | 93 | 7821186 | 1 | 52 | 0 |
| `marine` | 0 | 0 | 0 | 0 | 0 | 0 |
| `tundra` | 0 | 0 | 0 | 0 | 0 | 0 |
| `glacier` | 0 | 0 | 0 | 0 | 0 | 0 |
| `lavaField` | 0 | 0 | 0 | 0 | 0 | 0 |
| `custom:unknown` | 9216.0 | 93 | 7821186 | 1 | 52 | 0 |

コンソール／ページエラーは0件。一時的な画像で温帯林の立木と氷河の無立木を目視確認した。氷河画像は樹木レイヤー単独の空表示であり、氷河地表の完成画像ではない。照明は固定したが、都市全体の照明条件との同一性を受入条件にはしていない。

## テストと再現

関連Vitestは13ファイル244件が成功した。追加・修正したテストの対象を再実行し、最初に失敗した旧式墓地のfixtureは門位置を明示して解消した。成功件数は重複実行を加算していない。全件テストは実行していない。

- 生成：`landscapeVegetation.test.ts`、`forestPlan.test.ts`、`parkFabric.test.ts`、`cemeteryLayout.test.ts`、`cemeteryCulture.test.ts`、`cultureCemeteryIntegration.test.ts`
- SVG／共通計画：`forestSvg.test.ts`、`landscape.test.ts`、`openSpaceSites.test.ts`、`cityViewRendering.test.ts`
- 設定：`biomeControls.test.ts`
- 3D：`forestMeshes.test.ts`、`openSpaceMeshes.test.ts`

変更TypeScript 22ファイルの `npx biome check <変更ファイル>` は成功。型確認 `npx tsc --noEmit --pretty false` は既存の `src/city-editor/renderers/fogControls.ts(45,36)` のstringとEditorMessageKeyの不一致が残るため失敗し、今回の変更箇所のエラーはなかった。

```sh
node --import tsx scripts/auditCeTreeBiomes.mts
node --import tsx scripts/verifyCeTreelessBiomes.mts
```

上のスクリプトはそれぞれ監査JSON、描画結果JSONと確認用の一時画像を再生成する。関連テストは `npx vitest run <対象ファイル>` で実行する。

## 次の作業

F4-2／F4-3を完了とし、次はF5-1の混交林における予算判定を確認する。原点1地点だけで全体方針を決める処理、品質優先と予算内の樹種の混在、候補の復元を確認する。

F1-1の既存モデルの基準比較、F1-4／F2-3／F3-3の現地条件・水際・接地・自然林と植栽の適用範囲、F5の全CE性能と切替・保存・Undo/Redoの総合受入は未完了。今回の意味的監査だけで、全29バイオームと全20樹種の最終受入済みとはしない。ヤナギhighの37,292三角形という制作目安超過も、前段の記録どおり性能確認に残す。操作p95 33 msやGPU性能の達成は今回測定していない。
