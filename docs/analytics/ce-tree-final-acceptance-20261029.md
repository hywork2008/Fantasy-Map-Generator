# CE樹木LOD：F5-6最終照合と残課題

2026-10-29。[計画](../plan/ce-forest-biome-tree-lod-tasks.md) の最終照合を実施した。標準29バイオームの割当・無立木の受入は完了。20樹種80品質は実装済みだが、T01・T02の見た目の切替とT04の採用版の不一致を残すため、全樹種の受入完了とはしない。F5-6の台帳更新・残課題整理と、モデル自体の受入を区別する。

## 現在の採用モデル

[最終棚卸しJSON](ce-tree-final-inventory-20261029.json) は現在の採用版ID・作者・実寸の外接範囲・三角形・材質・source buffer bytesとソースSHA-256を80品質分記録する。計測は各モデルのCPU構築1回で、GPU時間・GPUメモリではない。過去の棚卸しを上書きしていない。

| ID | 樹種 | low / medium / high / ultra 三角形 | CE・BV最終判定 |
| --- | --- | ---: | --- |
| T01 | `garden_parkland` | 153 / 1,888 / 21,626 / 84,098 | 保留：密度・輪郭の切替 |
| T02 | `sacred_yew` | 167 / 1,827 / 14,484 / 33,428 | 保留：密度・輪郭の切替 |
| T03 | `norway_spruce` | 244 / 1,529 / 6,521 / 21,749 | 受入（下記の条件内） |
| T04 | `silver_birch` | 424 / 1,248 / 13,160 / 51,320 | 保留：Opus採用との不一致 |
| T05 | `date_palm` | 452 / 2,455 / 4,224 / 6,816 | 受入（下記の条件内） |
| T06 | `umbrella_thorn` | 349 / 1,887 / 6,448 / 14,660 | 受入（下記の条件内） |
| T07 | `saxaul` | 392 / 1,582 / 4,220 / 6,332 | 受入（下記の条件内） |
| T08 | `kapok` | 484 / 2,025 / 19,556 / 36,752 | 受入（下記の条件内） |
| T09 | `western_red_cedar` | 432 / 2,719 / 14,850 / 26,122 | 受入（下記の条件内） |
| T10 | `black_alder` | 381 / 2,021 / 12,764 / 23,600 | 受入（下記の条件内） |
| T11 | `olive` | 253 / 1,337 / 9,149 / 25,091 | 受入（下記の条件内） |
| T12 | `silver_fir` | 416 / 2,962 / 16,664 / 104,596 | 受入（下記の条件内） |
| T13 | `red_mangrove` | 468 / 2,799 / 17,960 / 24,848 | 受入（下記の条件内） |
| T14 | `tamarisk` | 475 / 2,689 / 6,340 / 8,020 | 受入（下記の条件内） |
| T15 | `rowan` | 496 / 2,482 / 14,632 / 26,140 | 受入（下記の条件内） |
| T16 | `canary_pine` | 484 / 2,480 / 15,690 / 35,214 | 受入（下記の条件内） |
| T17 | `mediterranean_cypress` | 339 / 1,688 / 5,192 / 9,092 | 受入（下記の条件内） |
| T18 | `oriental_evergreen` | 297 / 2,205 / 9,820 / 15,676 | 受入（下記の条件内） |
| T19 | `sacred_bodhi_and_fig` | 356 / 1,559 / 15,423 / 42,618 | 受入（下記の条件内） |
| T20 | `peaceful_willow` | 392 / 1,970 / 37,292 / 75,452 | 受入（下記の条件内） |

lowは全20種500以下、mediumは全20種3,000以下。品質を下げると三角形数は厳密に減る。highの25,000三角形・source 3 MiB目安を超えるのはヤナギだけで、37,292三角形・4,027,536 bytes。木部18,212三角形はultraの骨格を保持したもの。ultraは全20種120,000三角形・source 13 MiB以内。目安は森林全体の上限とは異なる。

トウヒは全品質Opus plate、シナノキ・イチイのmediumはOpus、シラカバは全品質Codex、その他の追加16種はlow～highがCodex、ultraが既存Opus。シナノキ・イチイの他品質はCodex。競合版を持たない品質は登録版の暗黙採用で、CE_ADOPTIONの明示指定とは区別する。詳細な版IDはJSONを正とし、今回作者・採用表を変更していない。

## 根拠と受入範囲

- 形状・BV比較：既存の[温帯・寒帯](ce-tree-lod-f0-boreal-20261029.md)、[ベイスギ・モミ](ce-tree-lod-cedar-fir-20261029.md)、[乾燥地](ce-tree-lod-arid-20261029.md)、[乾燥地追加](ce-tree-lod-dryland-20261029.md)、[熱帯](ce-tree-lod-tropical-20261029.md)、[水辺・高地](ce-tree-lod-upland-20261029.md)、[用途別](ce-tree-lod-garden-20261029.md)の所見と再現入力を参照する。mediumは指定の[房の作り方](../plan/tree-medium-canopy-lobes.md)に基づく。房は個別葉より不透明に見え、全品質の透け方が一致するという判定ではない。
- 割当・適用：[29バイオーム・30文化](ce-tree-biome-policy-20261029.md)、[温帯・寒帯54条件](ce-tree-temperate-biomes-20261029.md)、[乾燥地54条件](ce-tree-dry-biomes-20261029.md)、[熱帯・水辺等72条件](ce-tree-wet-upland-biomes-20261029.md)。明示された陸域の森林・用途別植栽を対象とし、森林領域そのものの自動推定を意味しない。
- 描画・資源：[混交林予算](ce-forest-mixed-budget-20261029.md)、[品質等108条件](ce-forest-quality-matrix-20261029.md)、[保存・Undo/Redo](ce-tree-persistence-20261029.md)。quality-firstとチャンク最低予算による例外を、厳密な全域の上限保証として扱わない。
- 都市全体：[固定3都市48条件](ce-tree-city-performance-20261029.md)の操作p95は最大27.6 ms。ただしその入力・機種・DPR 1の記録で、後続の接地修正前の計測である。全樹種・別GPU・高DPRの保証へ拡張しない。
- 接地：F3-3でnative y=0を地表基準とし、地下の根を持ち上げない正規化へ修正。候補の位置・回転は保持する。一本のモデルの各根先を斜面へ個別に変形する機能は含まない。

## 用途別4樹種の実GPU性能とヤナギの例外

[測定JSON](ce-tree-garden-performance-20261029.json) は製品の `createTownOpenSpaces` を使用。Apple M4／ANGLE Metal／Chromium headless、1200×1600、DPR 1、各260本、固定20列×13列（5.5／6 m間隔）、俯瞰・林縁・低視点、影なし／ありの24条件。native ultraの地表より上の高さ・最大水平半径を候補寸法とし、全品質で共用する。各カメラをX±3 m・Z±2 mで動かし、12フレームのウォームアップ後に64フレーム計測した。影は2048角のPCF、地面は影を受ける。実都市全体ではなく公園レイヤーと地面・固定照明の分離試験である。

各行は3視点中のp95最大値。CPUはLOD更新＋描画提出、GPUは描画を囲む非同期timer query、RAFはrequestAnimationFrameの間隔を示す。GPUの測定区間にはドライバの実行待ちも含み、純粋なGPU busy時間ではない。CPU・GPU・RAFは同じフレームの完了時間を表す同一の指標ではない。

| 樹種 | 影 | CPU p95 ms | GPU p95 ms | RAF p95 ms | 最大提出三角形 |
| --- | --- | ---: | ---: | ---: | ---: |
| `mediterranean_cypress` | なし | 1.4 | 8.4 | 26.2 | 1,498,578 |
| `mediterranean_cypress` | あり | 1.7 | 8.5 | 26.2 | 1,558,322 |
| `oriental_evergreen` | なし | 1.3 | 9.9 | 26.2 | 2,018,238 |
| `oriental_evergreen` | あり | 1.4 | 9.1 | 26.2 | 2,075,086 |
| `sacred_bodhi_and_fig` | なし | 1.0 | 13.2 | 26.1 | 5,043,530 |
| `sacred_bodhi_and_fig` | あり | 1.8 | 12.9 | 26.2 | 5,101,571 |
| `peaceful_willow` | なし | 1.3 | 26.9 | 26.2 | 8,407,194 |
| `peaceful_willow` | あり | 1.4 | 28.3 | 26.3 | 8,444,486 |

ヤナギhighは垂れ枝の木部骨格を維持するため制作目安超過を認め、この固定配置・機種での実測を条件として受入する。影ありのGPU p95最大28.3 ms、RAF p95最大26.3 ms。840万超の三角形を提出する条件があるため、都市全体でも33 ms以内・任意密度でも安全という意味ではない。全域の有限予算への対応は下記の別課題へ残す。

各樹種を破棄した後はgeometry 1（地面）・texture 3（照明の影とrendererの既定texture）で一定。地面・照明を含めた解放後はgeometry 0・texture 1で、textureは開始時と同じThree.jsの空の影sampler用1枚。geometry／textureとも0とは記録しない。pageerror・WebGL error・disjoint・不足サンプルは0件。検証スクリプトの初回は終了処理で影を再描画し、次の試行は既定textureを0と期待して失敗した。照明の除去と開始時基準との比較へ直し、最終の24条件が成功した。

## 未受入の3項目と次の作業

1. **T01・T02：LOD切替の外観調整。** [現行8モデルの基準](ce-tree-lod-lime-yew-baseline-20261029.md)ではmediumの林がhighより密になり、lowの外接幅が小さい。特にイチイの透けの差が大きい。地表基準の修正はこの密度差を解消しない。次は固定カメラで切替前後の輪郭・隙間を確認し、採用mediumの房のcoverageとlowの樹冠外形を必要な範囲で調整する。Opus採用と作者・派生履歴を維持する。
2. **T04：指定されたOpus版の所在と採用の整合。** ユーザーはトウヒ・シラカバをOpus採用と指定しているが、現在のTREE_VARIANTSとCE_ADOPTIONにはシラカバのOpus版が存在せず、全4品質がCodex版を返す。既存Codex版をOpusと改称して解消しない。対応する実モデルを特定・登録してから採用とBV表示を確認する。形状・登録テストの成功をこの採用指示への適合と混同しない。

## 別途実装する拡張

- 地域ごとの追加樹種・混交比率、落葉季・紅葉・積雪、低木と下草。20種で全地域の植物相を再現したことにはしない。
- オアシス・河畔・土壌水分からの自然分布、標高・気候による樹林限界。alpineTundra／heathlandのナナカマドは明示された森林化・植栽に限る。
- 冠水・潮位・水中のマングローブ林。現行の水域排他を維持する。
- 火山の経過年・植生回復段階。volcanicBarrens／volcanicSoilのカナリアマツと、無立木のlavaFieldを維持する。
- 公園・墓地の全域予算と混交時の配分。openSpaceTreeLodは本数がsites.lengthで、geometryのtriangles／callsはInfinity、shadowTrianglesは種のレイヤーごと60,000。profileがboundedでも森林と同じ有限のgeometry予算にはならない。有限化する場合は、非採用木を消さない代替描画とセットで実装する。
- 全樹種を含む実都市、高DPR、別GPUの性能確認。品質優先の上限例外と、公園の実GPU観測を区別する。

## 検証・再現

```sh
node --import tsx scripts/measureCeTreeModels.mts docs/analytics/ce-tree-final-inventory-20261029.json
node --import tsx scripts/benchmarkCeGardenTreeLod.mts
npx vitest run src/buildings/landscape/treeQuality.test.ts src/buildings/landscape/treeRegistration.test.ts src/city3d/adoption.test.ts
```

関連3ファイル46テスト成功。型検査は今回は再実行していない。前段の既知エラー `fogControls.ts:45` はこの確認で解消したことにはしない。新規の描画スクリプトはJSONのみを出力し、画像を保存する処理を持たない。
