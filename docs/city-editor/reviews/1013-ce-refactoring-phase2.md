# CE リファクタリング Phase 2 実装記録

実施日: 2026-10-13。着手時コミット: `4ea2307a5c10220d7954f08b2a1e5e191f3a3a82`。
設計: [アーキテクチャ規約](../architecture.md)。工程: [ロードマップ](../plan/architecture-refactoring-roadmap.md)。比較基準: [Phase 0](1013-ce-refactoring-phase0.md)、[基準manifest](1013-ce-phase0-baseline.json)、[Phase 1](1013-ce-refactoring-phase1.md)。

## 変更内容と工程契約

`runPlan` を `generators/generation/pipeline.ts` へ移し、各計画工程を `planning/` へ抽出した。旧 `core/generate.ts` は `runPlan` の互換再exportを維持する。`applyPlan`、道路完成、再試行、逐次プレビューcacheはPhase 3へ残す。

| 工程 | 前提・入力 | 出力と変更対象 |
| --- | --- | --- |
| `planCoast` | 非空cells、既存edge graph、地理、水域seed、descriptor | 海・海岸の分類、沿岸水域、広幅channel、表示frame水域。水域metadataはpipelineがPlanへ反映 |
| `planRivers` | 海岸分類、メッシュ、都市規模、河川配置設定 | RoutedRiver、river bank、都市域分類の前提。外側河川は先に仮都市域・城壁を求めてから河川をrouteする既存順序を保持 |
| `planUrban` | 河川bank、仮都市域、都市規模・城壁容量 | urban/builtUp/outskirts、都市域の採用順、現在のmesh/cells対応。urbanの通知は従来どおりinset等の調整前に実行 |
| `planDefenses` | 現在の都市域・mesh、河川・channel、固定城、道路corridor | 城・内城壁の計画、border、precinct、gate、現在のmesh/cells対応。城の配置でmeshが変わる際はsea/ocean/coastalWaterのSetを同じ参照でremap |
| `planRoads` | 更新済みborder/gate、城・水域の障害判定、道路設定 | 仮approach、gateから街中心への線、区画計画用の街路結果。文書上の道路完成は行わない |
| `planWards` | 更新済みcellsと水域、道路計画、歴史時代・埋葬設定 | wards、決定順、temple/harbor、FMG標高。sourceDocumentを変更しない |

各工程は `Plan*Input` と `Plan*Result` を公開する。Inputは必要なデータだけを列挙し、settingsも工程ごとの `Pick<GenerationSettings, …>` に限定した。全Planを渡す工程はない。城壁工程が読むPlan由来の契約はchannelと固定crossingのみである。地形metadataと城の結果はpipelineがPlanへ反映する。実行順とstageStepによる早期終了、最終Planの組立てはpipelineが所有する。

関連する独立計算は `waterTerrain.ts`（channel適用・FMG標高）、`roadGeometry.ts`（乾いた道路側・frame道路・必要道路数・plaza接続点）、`meshLookup.ts`（近傍頂点index・generator border）へ抽出した。既存assemblyの利用する近傍頂点index等も同じ関数を参照する。

## 維持する契約と所有

- RNGの生成式、seed suffix、消費位置、走査・retry順序、ID・配列・Set/Mapの順序を維持した。橋の共通規約・判定は変更しない。
- graphはpipelineの一実行につき一回だけ生成する。工程間で文書全体・mesh全体をcloneせず、既存の城配置によるmesh更新だけを受け渡す。標高やurbanの既存計算の回数も維持した。
- stage 1〜5の早期returnとcompleteの道路・街路の選択を維持した。内城壁計画がstage 4/5のPlanに載らない既存の形状も維持し、挙動修正を混ぜていない。
- observerの `edge-graph → coast → river → urban → wall-plan → street-plan → wards` とattempt/countsを維持する。elapsedMsは実測時間であり一致比較の対象外。
- `retainBurg`、城付近のstreet hub、gate許可判定のclosureは一回のpipelineに属し、返される最終Planやmodule cacheへ保存しない。近傍頂点indexはその実行のclosureだけが保持する。新しい文書cache、DOM、timer、Worker、長寿命文書参照は追加しない。
- `generate.ts` の35公開export・保存形式・MPA境界を維持する。互換窓口の削除はPhase 6。旧coreの型・ドメイン計算への依存は配置移行まで残す。

## 検証

詳細ログはGit管理対象外の `artifacts/city-editor/phase2-20261013/` に保持する。最終inventoryと単独再採取は `phase2-20261013-final/` に保持する。

旧実装の `prepareRun` と `runPlan` を着手時ソースから一時moduleとして読み込み、新pipelineと同じ入力で比較した。代表8都市×stage 1〜6×complete false/trueの96ケースで、Plan全体とobserver通知の順序・内容が完全一致した。Set/Mapを列挙順のままJSON化し、座標・ID・配列順の正規化はしていない。両実装とも入力document不変。ViteのNode runnerでDOM globalsなしに実行した。一時moduleは検証後に削除した。

`generate.ts` に残った30関数の本体は、着手時とのTypeScript token比較で一致した。特に `applyPlan`、道路完成、試行・再試行、各preview入口の本体を変更していない。

新しい `pipeline.test.ts` の2件は、各段階の終了位置とobserverの順序・attempt・urban counts、入力不変、別seed実行後の決定論、各実行のSet/Mapの独立性を検証する。

型検査と変更ファイルのBiome、既存アーキテクチャ検査は成功した。CE専用の依存規則は既存lintの対象外なのでPhase 0のinventoryでも確認し、新設10moduleに旧generate窓口への逆import、UI/render/controllerへの直接import、新しい実行時循環がないことを確認した。

| 検証 | 結果 |
| --- | --- |
| `npx tsc --noEmit` | 終了コード0 |
| Biome（変更した12 TSファイル） | エラーなし |
| アーキテクチャ検査（`node --import tsx scripts/lint-architecture.ts`） | 終了コード0。CEの新設依存はinventoryで別途確認 |
| 公開API | 35 exportを維持 |
| 旧計画との比較 | 96ケースのPlan・通知が完全一致、入力不変、DOMなしで成功 |
| 追加境界テスト | 1ファイル、2件成功 |
| 8都市の基準比較 | 入力原文・初期文書・設定・生成文書・SVGのSHA-256がPhase 0と完全一致 |
| 8都市の契約 | 入力不変、描画read-only、JSON parse往復、2回の文書/SVG完全一致すべて成功 |
| CE全体 | 175ファイル: 159成功、8失敗、8skip。1,371件: 1,335成功、17失敗、19skip。605.76秒 |

全体テストの失敗名はPhase 1と同じ17件である。Phase 0の既存16件と、`CityEditorPage.generate.test.ts` の「① reveals the coastline walk as a growing dotted trail, not sea cells」の120秒timeoutを確認した。後者はPhase 1で単独成功・全体timeoutを既に観測した、固定seedを持たず最大12回の再試行を含むテストである。今回のtimeoutも実測失敗として記録し、成功として数えない。このテストの安定化は別変更とする。全体テスト開始後に追加した境界テスト2件は、上の全体集計に混ぜず別途実行・記載した。

採取はNode v22.23.1 / Apple M4 / darwin arm64のPhase 0と同条件。単発の生成・描画時間はログに残すが、性能向上または低下の判定には用いない。構造の確認で全体clone・graph再構築・重複計算の追加がないことを確認した。既存建物系の循環は本工程の変更対象外として残す。

## 完了と次工程

Phase 2の工程分割、限定された入出力契約、順序・決定論の保持、UIなしの実行、代表計画・文書・SVGの互換性を確認した。`generate.ts` は5,774行から4,265行となった。`planning/` の最大は城・城壁・城門の計画を担う `defenses.ts` の585行である。Phase 3では `applyPlan` の工程、道路完成・接続修復、試行・再試行とpreview cacheの所有を分離する。
