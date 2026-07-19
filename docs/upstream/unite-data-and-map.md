結論として、「全て実装済み」ではありません。実装の骨格はありますが、Phase 0〜7 は大半が部分実装で、正しさ・性能・描画に重大な未達があります。Phase 8 は比較的進んでいます。

| Phase | 判定 | 主な確認結果 |
|---|---|---|
| 0: 現行仕様固定 | 未完了 | E2E 12 spec 中、render mode を明示するのは 3 spec のみ。計画の全関連 E2E 固定条件を満たしていません。 |
| 1: WorldRuntime shell | 部分実装 | revision/subscribe はあるが FIFO queue、expectedRevision、immutable read model、range/entity change は未実装。`read()` は生の mutable `WorldContext` / `SimulationContext` を返します。 |
| 2: 描画通知統一 | 部分実装 | `RenderCoordinator` はある一方、Nobility tick が Renderer を直接呼び、coordinator は SVG 描画を commit ごとに即時実行します。rAF coalesce ではありません。 |
| 3: PresentationData | 部分実装・描画不具合あり | `styles/layers/labels` はあるが `layerOrder/overlays` は未実装。WebGL は依然 SVG 属性へ fallback します。`.fmg` load 時に labels を復元していません。 |
| 4: SimulationSystem | 部分実装 | registry/DAG/cadence はあるが、現行 extension はすべて `registerTimeTickHook`。RNG 分離・保存、日単位 runner、TransactionWriter、DOM/Zustand 非依存は未達です。 |
| 5: Command migration | 部分実装 | 列挙された command は多く存在するが、直接 `pack/grid` 書込みが多数残存。少なくとも 33 の非テストソースファイルで直接書込みを確認しました。 |
| 6: archive | 部分実装・原子性不成立 | `.fmg` ZIP/chunk/チェックサム/autosave は実装済み。ただし validate が浅く、replace がライブ state を先に破壊するため、後段例外でロールバックされません。 |
| 7: revision-driven projection | 未達（性能退行） | topic revision キーに world 全体 revision も混入しており、無関係な commit でも全レイヤー cache が失効します。 |
| 8: physical split / Worker | 概ね実装済み | simulation column/slice、ownership inventory、worker seam は存在しテストもあります。ただし計画要求の heap/GPU/memory budget・single-topic/full-replace 計測は未確認です。 |

重大な問題は以下です。

- WebGL cache key が `world:${projection.revision}` を含みます。marker 編集のような無関係な変更でも、すべてのレイヤーのキーが変わります。topic 単位 invalidation の意味が失われ、100k cell での小編集が全データ再投影へ退行します。[webglTopicRevisions.ts](/Users/h-yamaguchi/Projects/Fantasy-Map-Generator/src/renderers/webgl/webglTopicRevisions.ts:21)

- `world.replace` は妥当性検証が `mapId/seed/pack/grid` 程度で止まり、その後に現在の world を in-place で削除・置換してから compatibility binding を実行します。binding が失敗すると部分置換済みの world が残ります。計画の「decode → migrate → validate → atomic replace」を満たしていません。[worldArchive.ts](/Users/h-yamaguchi/Projects/Fantasy-Map-Generator/src/runtime/worldArchive.ts:295) [worldRuntime.ts](/Users/h-yamaguchi/Projects/Fantasy-Map-Generator/src/runtime/worldRuntime.ts:1302)

- `.fmg` load で `presentation.styles` と `activeLayers` しか反映せず、保存済み label layout が残存／消失します。さらに full replace の coordinator 処理は presentation を SVG へ投影せず、layer store だけを hydrate します。[worldRuntime.ts](/Users/h-yamaguchi/Projects/Fantasy-Map-Generator/src/runtime/worldRuntime.ts:1329) [renderCoordinator.ts](/Users/h-yamaguchi/Projects/Fantasy-Map-Generator/src/runtime/renderCoordinator.ts:63)

- `burg.move` は `cells.burg`、burg の state、capital state の center まで変更するのに、`map.settlements` しか publish しません。`map.politics` 依存の state label / cache が更新漏れします。[worldRuntime.ts](/Users/h-yamaguchi/Projects/Fantasy-Map-Generator/src/runtime/worldRuntime.ts:634)

- 直接 mutation が cache correctness を壊します。例えば biome editor は `pack.cells.biome` を直接変更して SVG だけ再描画し、runtime revision を増やしません。WebGL 側は revision key が同じため stale cache を再利用できます。[biomes-editor.ts](/Users/h-yamaguchi/Projects/Fantasy-Map-Generator/src/controllers/biomes-editor.ts:328)

- Simulation の DOM/renderer 分離も未達です。time engine は Zustand・`window.fmg` に依存し、Nobility hook は tick 中に state/border/military renderer を直接呼びます。[timeEngine.ts](/Users/h-yamaguchi/Projects/Fantasy-Map-Generator/src/generators/timeEngine.ts:281) [nobility/index.tsx](/Users/h-yamaguchi/Projects/Fantasy-Map-Generator/src/extensions/nobility/index.tsx:237)

- Extension target API は未実装です。`registerStateSlice`、scoped `world.read/dispatchOwn`、semantic `registerMapLayerProjection` はなく、extension に mutable な context と renderer 固有 `requestWebglRender` を渡しています。[extension-api.ts](/Users/h-yamaguchi/Projects/Fantasy-Map-Generator/src/types/extension-api.ts:170)

検証結果:

- `npm run build`: 成功。
- 中核テスト 57 件: 55 passed / 2 failed。
  - `world.replace` の accepted archive テストが compatibility binder で例外。
  - Presentation test の期待値と実装が不整合。
- 現行 benchmark:
  - 10k: initial 114.9 ms / preset 30.3 ms
  - 50k: initial 514.2 ms / preset 128.7 ms
  - 100k: initial 1053.9 ms / preset 269.5 ms / zoom cache hit 4.3 ms

特に Phase 7 の cache key 問題があるため、この zoom cache-hit 数値を「小編集も高速」という根拠には使えません。今回は監査のみで、ファイルは変更していません。
