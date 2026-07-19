# Unite Data and Map 修正進捗

- **対象計画**: `docs/plan/unite-data-and-map.md`
- **開始日**: 2026-07-20
- **運用**: 優先度の高い項目から修正し、各項目を `In progress` → `Verified` または `Blocked` に更新する。`Verified` は回帰テストと関連する build が成功して初めて付与する。

## 優先度と状態

| ID | 優先度 | 状態 | 問題 | 完了条件 |
| :-- | :-- | :-- | :-- | :-- |
| P0-1 | Critical | Verified | WebGL cache key が全体 revision を含み、無関係な commit でも全 layer projection を失効させる | layer key が依存 `DataTopic` と view 固有値だけで決まり、無関係な topic の commit で cache key が変化しない |
| P0-2 | Critical | In progress | `.fmg` の `world.replace` は浅い validation 後に live state を変更し、後段 failure で partial state を残す | replacement 前に必要な構造を検証し、apply 中の failure でも live world / simulation / presentation が不変 |
| P0-3 | Critical | Verified | `.fmg` load が `PresentationData.labels` を復元せず、presentation を SVG に一貫して投影しない | styles / layers / labels が archive round-trip 後に復元され、SVG / WebGL が同じ presentation source を読む |
| P1-1 | High | Verified | `burg.move` が政治データも変更するのに `map.settlements` しか publish しない | 実際に変更する topic をすべて publish し、state label / cache の更新を回帰テストで保証 |
| P1-2 | High | Verified | Simulation hook が Renderer を直接呼び、RenderCoordinator が SVG work を commit ごとに即時実行する | tick 中の direct render を除去し、必要な renderer work を rAF 単位で coalesce |
| P1-3 | High | In progress | 未移行の direct `pack` / `grid` writer が revision を発行しない | writer inventory / allowlist を導入し、優先 editor を command 経由へ移行 |
| P2-1 | Medium | Pending | `WorldRuntime.read()` と ExtensionAPI が mutable backing store を公開する | dynamic extension 向け read facade を導入し、raw mutable buffer を到達不能にする |
| P2-2 | Medium | Pending | `PresentationData` に layer order / overlays がなく、WebGL style の SVG fallback が残る | 保存対象を model 化し、live SVG style read を compatibility path へ限定または除去 |
| P2-3 | Medium | Pending | Simulation の RNG 分離・daily runner・headless interface が未完 | simulation slice に RNG state を保存し、renderer/UI 非依存の day step を test surface にする |
| P2-4 | Medium | Pending | extension slice registration / opaque chunk promotion / core-reference delete policy が未完 | scoped extension seam と archive validation/migration lifecycle を実装 |
| P3-1 | Medium | Pending | E2E の render mode 固定が不十分 | 全 map-related E2E が helper で renderer mode を明示する |
| P3-2 | Medium | Pending | memory / GPU / partial-update benchmark が未整備 | 10k/50k/100k で required metrics を継続測定する |

## 更新履歴

### 2026-07-20 — 初回監査

- `npm run build` は成功。
- runtime / archive / renderer 周辺の選択テストは 57 件中 55 件成功、2 件失敗。
- 100k cells benchmark は initial 1053.9 ms、preset switch 269.5 ms、zoom-only cache hit 4.3 ms。
- P0 項目を先に修正する。以後の更新では、変更ファイル・検証コマンド・結果をこの節に追記する。

### 2026-07-20 — P0-1 Verified

- `src/renderers/webgl/webglTopicRevisions.ts` から global `revision` を layer cache key から除去した。full replace は全 `DataTopic` revision を更新するため、依存 topic の revision のみで安全に失効できる。
- `src/renderers/webgl/webglTopicRevisions.test.ts` を追加し、marker のような無関係 topic の commit では key が不変であり、依存 topic の更新では key が変わることを固定した。
- 検証: `npm test -- --run src/renderers/webgl/webglTopicRevisions.test.ts src/renderers/webgl/adapters/deckDataAdapters.test.ts` — 42 passed。

### 2026-07-20 — P0-2 remediated, deep validation remains

- `assertValidWorldDocument()` が archive envelope に加え、replacement adapter が必要とする `pack.cells` / `pack.burgs` / `pack.states` と presentation records を preflight するようにした。
- `world.replace` は preflight 後も rollback snapshot を保持し、compatibility adapter が failure した場合は context reference を保ったまま旧 world / simulation / presentation を復元する。
- 不正 `pack.burgs` を含む replacement が commit 前に拒否され、live state が不変であることを回帰テスト化した。
- 残作業: extension slice を含む field-level schema / foreign-key validation。これが未完のため P0-2 は `In progress` を維持する。

### 2026-07-20 — P0-3 Verified

- replacement 時に `PresentationData.labels` も in-place で復元するようにした。
- `projectPresentationToSvg()` を SVG adapter に追加し、full replace では WebGL と同じ `PresentationData` を SVG 属性へ投影してから draw cycle を実行するようにした。
- 検証: `npm test -- --run src/runtime/worldRuntime.test.ts src/runtime/worldArchive.test.ts src/runtime/renderCoordinator.test.ts src/renderers/presentationProjection.test.ts` — 30 passed。`npm run build` — 成功。

### 2026-07-20 — P1-1 Verified

- `burg.move` が `cells.burg` と capital state の `center` を変更するため、`map.settlements` と `map.politics` の両方を publish するようにした。
- RenderCoordinator の回帰テストで burg icon / label に加え、state border / label invalidation を確認した。
- 検証: `npm test -- --run src/runtime/worldRuntime.test.ts src/runtime/renderCoordinator.test.ts` — 26 passed。

### 2026-07-20 — P1-2 Verified

- Nobility の time tick hook から `StatesRenderer` / `BordersRenderer` / `MilitaryRenderer` の直接呼出しを除去した。hook は変更 topic だけを返し、RenderCoordinator が commit 後に描画を選択する。
- RenderCoordinator は同一 animation frame に到着した複数 commit の topics を集合化して一度だけ処理する。headless test environment では同期 fallback を使う。
- 回帰テストで二つの commit が一 frame では一回の renderer work に coalesce されることを確認した。
- 検証: `npm test -- --run src/runtime/renderCoordinator.test.ts src/generators/simulationSystem.test.ts` — 12 passed。`npm run build` — 成功。

### 2026-07-20 — P1-3 incremental remediation

- `biomesApplyChange()` の `pack.cells.biome` 直接書込みを compatibility commit (`map.physical`) で囲んだ。これにより biome editor の SVG-only redraw 後に WebGL cache が旧 topic revision のまま残る経路を解消した。
- 残作業: direct writer の allowlist / lint、heightmap・zones・burg editor を含む残存 writer の command migration。このため P1-3 は `In progress` を維持する。
- 検証: `npm run build` — 成功。`npm test -- --run src/runtime/worldRuntime.test.ts src/runtime/renderCoordinator.test.ts src/renderers/webgl/webglTopicRevisions.test.ts` — 29 passed。

### 2026-07-20 — P0-2 validation expansion

- replacement preflight に simulation clock の有限数検証、`pack.burgs` / `pack.states` の record-table 検証、`pack.cells.i` の typed-array 検証、opaque extension chunk の metadata / core-reference 検証を追加した。
- malformed state table が archive encode 時点で拒否されることを回帰テスト化し、`world.replace` の binder 前 rejection を維持した。
- 残作業: map topology の全 column length、stable foreign key、extension slice schema を検証する機械可読 schema。P0-2 は `In progress` を維持する。
- 検証: `npm test -- --run src/runtime/worldArchive.test.ts src/runtime/worldRuntime.test.ts src/runtime/renderCoordinator.test.ts` — 31 passed。`npm run build` — 成功。

### 2026-07-20 — P0-2 topology and foreign-key validation

- `pack.cells.i` を基準に、archive 内の Typed Array cell column が topology と同じ長さであることを検証するようにした。
- cell の state / burg / culture / religion / province 参照が対応する entity table 範囲内であることを検証するようにした。
- 不正な column length と欠損 state reference を archive encode 前に拒否する回帰テストを追加した。
- 残作業: entity record 内の foreign key、extension slice schema、unknown opaque chunk の core deletion policy。P0-2 は `In progress` を維持する。
- 検証: `npm test -- --run src/runtime/worldArchive.test.ts src/runtime/worldRuntime.test.ts` — 25 passed。`npm run build` — 成功。

### 2026-07-20 — P0-2 entity-record reference validation

- state の `center` / `capital` / `culture`、burg の `cell` / `state` / `culture` / `province`、province の `state` / `burg` を topology と entity table に照合するようにした。
- 範囲外 cell を参照する burg record が archive encode 前に拒否される回帰テストを追加した。
- 残作業: routes / rivers / features の参照、extension slice schema、opaque chunk の core deletion policy。P0-2 は `In progress` を維持する。
- 検証: `npm test -- --run src/runtime/worldArchive.test.ts src/runtime/worldRuntime.test.ts` — 26 passed。`npm run build` — 成功。

### 2026-07-20 — P0-2 network and feature reference validation

- river の source / mouth / cell sequence、route の feature / cell sequence、feature の firstCell / outCell / vertices を topology と照合するようにした。
- topology 外 cell を持つ river record を archive encode 前に拒否する回帰テストを追加した。
- 残作業: extension slice schema と opaque chunk の core deletion policy。core map / simulation replacement の構造・column・主要 foreign key validation は実装済みとして、P0-2 を次回 extension archive seam と合わせて完了判定する。
- 検証: `npm test -- --run src/runtime/worldArchive.test.ts src/runtime/worldRuntime.test.ts` — 27 passed。`npm run build` — 成功。
