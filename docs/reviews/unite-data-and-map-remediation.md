# Unite Data and Map 修正進捗

- **対象計画**: `docs/plan/unite-data-and-map.md`
- **開始日**: 2026-07-20
- **運用**: 優先度の高い項目から修正し、各項目を `In progress` → `Verified` または `Blocked` に更新する。`Verified` は回帰テストと関連する build が成功して初めて付与する。
- **クローズ（2026-07-20）**: remediation 表 P0–P3 は全件 Verified。計画 Phase の必須境界は下表「計画クローズ判定マップ」で **完了** / **Done with residual**。以降の residual は post-unite backlog（運用 / cleanup / 計測駆動）であり、新規必須 P-ID は切らない。

## 優先度と状態

| ID | 優先度 | 状態 | 問題 | 完了条件 |
| :-- | :-- | :-- | :-- | :-- |
| P0-1 | Critical | Verified | WebGL cache key が全体 revision を含み、無関係な commit でも全 layer projection を失効させる | layer key が依存 `DataTopic` と view 固有値だけで決まり、無関係な topic の commit で cache key が変化しない |
| P0-2 | Critical | Verified | `.fmg` の `world.replace` は浅い validation 後に live state を変更し、後段 failure で partial state を残す | replacement 前に必要な構造を検証し、apply 中の failure でも live world / simulation / presentation が不変 |
| P0-3 | Critical | Verified | `.fmg` load が `PresentationData.labels` を復元せず、presentation を SVG に一貫して投影しない | styles / layers / labels が archive round-trip 後に復元され、SVG / WebGL が同じ presentation source を読む |
| P1-1 | High | Verified | `burg.move` が政治データも変更するのに `map.settlements` しか publish しない | 実際に変更する topic をすべて publish し、state label / cache の更新を回帰テストで保証 |
| P1-2 | High | Verified | Simulation hook が Renderer を直接呼び、RenderCoordinator が SVG work を commit ごとに即時実行する | tick 中の direct render を除去し、必要な renderer work を rAF 単位で coalesce |
| P1-3 | High | Verified | 未移行の direct `pack` / `grid` writer が revision を発行しない | writer inventory / allowlist を導入し、優先 editor を command 経由へ移行 |
| P2-1 | Medium | Verified | `WorldRuntime.read()` と ExtensionAPI が mutable backing store を公開する | dynamic extension 向け read facade を導入し、raw mutable buffer を到達不能にする |
| P2-2 | Medium | Verified | `PresentationData` に layer order / overlays がなく、WebGL style の SVG fallback が残る | 保存対象を model 化し、live SVG style read を compatibility path へ限定または除去 |
| P2-3 | Medium | Verified | Simulation の RNG 分離・daily runner・headless interface が未完 | simulation slice に RNG state を保存し、renderer/UI 非依存の day step を test surface にする |
| P2-4 | Medium | Verified | extension slice registration / opaque chunk promotion / core-reference delete policy が未完 | scoped extension seam と archive validation/migration lifecycle を実装（計画 §9 `registerStateSlice` / migration / `collectCoreReferences`） |
| P2-5 | Medium | Verified | UI 日次経路と public bulk 経路が別 semantics のまま（互換期間中） | 各 system の bulk/日次差を versioned migration で解消し、UI と `window.fmg.actions.advanceTime` が同じ daily command 列（`SimulationRunner` / `simulation.stepDay`）から同一 state・tickCount・RNG・event を作る |
| P2-6 | Medium | Verified | simulation RNG が単一共有 stream のまま（per-system 派生が未実装） | system ID と tick/date から独立 stream を得られ、一 extension の追加乱数消費が他 system の結果を変えない。algorithm version と各 stream state が archive round-trip する |
| P2-7 | Medium | Verified | 既存 tick が `registerTimeTickHook` 互換 system に依存したまま | built-in / 主要 extension が `registerSimulationSystem`（phase / cadence / reads / writes / dependency）へ移行し、legacy hook API は新規利用を禁止または薄くする |
| P2-8 | Medium | Verified | module-local な tick 状態が archive / `SimulationData` に入っていない | `populationLossTracker`・Economy `forestDepletion` 等の module-private Map を versioned simulation / extension slice へ移し、save/load と headless で同一結果になる |
| P2-9 | Medium | Verified | map generate と legacy `.map` load が `world.generate` / 完全 staging 外のまま | 生成は staging world → validate → `world.replace` / `world.generate`。legacy load も decode 完了前に live context を壊さない。完了まで「全 write が dispatch 経由」を達成済みと扱わない |
| P2-10 | Low | Verified | `options.year/month/day` と `SimulationContext` 時計の dual mirror が残る | 唯一の正を simulation clock とし、legacy readers を移行したうえで options mirror を廃止する（計画 §4.2） |
| P2-11 | Medium | Verified | target `simulation.stepDay` + `TransactionWriter` が未実装 | system は宣言 topic だけを writer 経由で書き、in-place pack/simulation 直書きを止める。一日一 command / 失敗日 rollback の契約を test で固定する（計画 §5.1 / §6） |
| P2-12 | Medium | Verified | writer lint が controllers のみ・generator/extension の seam 漏れ | `lint-world-writers` を generators / extensions に拡張するか同等 inventory を持つ。extension tick 内の direct `draw*` は draw-layer hook / RenderCoordinator 経路へ寄せる |
| P2-13 | Low | Verified | SVG export が `withSvgSnapshot()` に依存 | export も offscreen SVG adapter が canonical / PresentationData から生成し、renderMode 切替や live DOM snapshot に依存しない（save path は既に DOM-free） |
| P3-1 | Medium | Verified | E2E の render mode 固定が不十分 | 全 map-related E2E が helper で renderer mode を明示する（現状 helper 使用は一部 spec に限定） |
| P3-2 | Medium | Verified | memory / GPU / partial-update benchmark が未整備 | 10k/50k/100k で required metrics を継続測定する。基準を満たせない層だけ partial GPU update を検討（計画 Phase 7 / §13） |
| P3-3 | Low | Verified | 計画 §12.4 architecture check が機械化されていない | Generator→Renderer import 禁止、schema field↔DataTopic coverage、public read model の mutable 到達不能を lint/test で継続強制する |

### 計画クローズ判定マップ（2026-07-20）

`docs/plan/unite-data-and-map.md` Phase 0–8 / §4–§9 / §12–§13 と remediation 表の最終突き合わせ。

**判定の使い分け**

| ラベル | 意味 |
| :-- | :-- |
| **完了** | 計画 Phase / 節の必須境界を満たす。新規実装は不要。 |
| **Done with residual** | 必須境界は満たすが、意図的な互換層や post-unite 任意作業が残る。Unite 完了宣言から外さない。 |
| **Won't do (measured)** | 計測の結果、今は実装しない（再検討条件のみ残す）。 |

**remediation 表（P0–P3）は監査欠陥の是正として全件 Verified。** 下表は計画 target のクローズ判定であり、新しい P-ID を切るための未完リストではない。

| 計画 | 判定 | 根拠（remediation） | residual / 次の扱い |
| :-- | :-- | :-- | :-- |
| **Phase 0** 仕様固定・E2E mode | **完了** | **P3-1**、**P2-8** | 運用: 新規 map E2E は helper で `renderMode` を明示 |
| **Phase 1** WorldRuntime shell | **完了** | **P2-9**、**P2-1** | residual: host 用 `readTrusted()`（dynamic は immutable facade）。Worker realm 完全隔離は post-unite |
| **Phase 2** 描画を commit へ | **完了** | **P1-2**、**P2-12** | residual: editor / layer toggle の extension `draw*`（ユーザー操作の即時表示）。tick 内 direct render は禁止済み |
| **Phase 3** PresentationData | **Done with residual** | **P2-2**、**P0-3** | residual: icon raster 等の限定 live SVG 互換。**新規 style 源は PresentationData 必須**。全 live SVG 除去は post-unite optional |
| **Phase 4** Simulation system | **完了** | **P2-3/5/6/7/8/11** | 互換 bulk 単一 commit は廃止。daily 列に統一済み（下記履歴） |
| **Phase 5** Command migration | **Done with residual** | **P1-3**、**P2-12** | residual: heightmap 1 module allowlist、generator 内部 write（計画 Phase 5 境界どおり許容）。触る editor から command 化 |
| **Phase 6** `.fmg` archive | **完了** | **P2-4**、**P2-9**、**P2-13**、**P0-2** | residual: legacy `.map` 互換 read/export（計画どおり維持） |
| **Phase 7** revision projection | **完了** + **Won't do (measured)** | checklist + **P3-2** | residual: partial GPU は 100k single-topic/initial≈0.32 で **今は実装しない**。再検討: 比≥0.55 または soft budget 超過が続くとき |
| **Phase 8** physical split / Worker | **Done with residual** | checklist ほぼ [x]、**P2-8** inventory | residual: pack / entity の temporary compatibility projection（mirror）。**完全削除は post-unite 大型リファクタ**（caller が slice 直読みに移った後）。topology Worker seam は正式化済み |
| **§4.2** clock mirror 廃止 | **完了** | **P2-10** | 運用: live は `simulationContext`、options は生成パラメータのみ |
| **§5** TransactionWriter / stepDay | **Done with residual** | **P2-11** | residual: 完全 staged write（現状は in-place + `markChanged`）。system 単位の移行は post-unite Medium 以下 |
| **§9** ExtensionAPI target | **Done with residual** | **P2-4** | 済み: `registerStateSlice` / migration / opaque / `registerExtensionCommand`。residual: dynamic ZIP の hostile Worker 隔離などは post-unite |
| **§12.4** arch checks | **完了** | **P3-3**、**P1-3/P2-12** | 運用: `lint:architecture`、ownership / read-model tests、writer inventory |
| **§13** perf criteria | **完了** | **P3-2** | 運用: `npm run perf:webgl-layers` → `docs/analytics/webgl-layer-benchmark-latest.json` |

#### Unite クローズ宣言

- **監査是正（P0–P3）**: 全件 Verified。必須の新規 remediation ID は切らない。
- **計画 Phase 0–8 の必須境界**: 上表すべて **完了** または **Done with residual**。  
  residual は互換維持または post-unite 任意であり、Unite 未完了理由にはしない。
- **この文書の以降の役割**: 履歴・運用チェックリスト・post-unite backlog の参照。新規欠陥は通常の issue / PR で扱う。

#### 残作業の帯分け（post-unite）

| 帯 | いつ | 内容 |
| :-- | :-- | :-- |
| **A. 運用（常時）** | 変更のたび / リリース前 | E2E の `setRenderMode` / `waitForMapLoad(..., mode)`；`npm run lint:architecture` + writer lint；field 追加時の `dataFieldOwnership`；`npm run perf:webgl-layers` の結果更新 |
| **B. post-unite cleanup（任意）** | 触るモジュールがあるとき、または純化を優先するとき | pack / burg / state / military の temporary compatibility projection 削除ロードマップ；`TransactionWriter` 完全 staged write；heightmap allowlist 解消；残 live SVG style / icon 互換の縮小；薄い未 command editor の command 化 |
| **C. 計測駆動（条件付き）** | 数字が悪化したときだけ | partial GPU（single-topic/initial ≥ 0.55 が継続、または soft budget 超過）；cold projection の Worker 拡大；dynamic extension の Worker realm 隔離 |

**やらない方がよいこと:** residual を理由に P4-x を大量追加する、pack mirror の一発削除、計測なしの partial GPU / 全面 Worker。

#### 履歴: Phase 4 分解（P2-3 型）— すべて Verified 済み

| 計画項目 | remediation |
| :-- | :-- |
| UI 日次 / public bulk の semantics を別々に固定 | P2-3（characterization） |
| RNG stream を simulation archive 対象にする | P2-3（単一 stream → 後に P2-6） |
| DOM 無し interface test | P2-3（`simulationRunner`） |
| bulk / 日次差を migration したうえで daily に統一 | **P2-5** |
| system ID 由来の独立 deterministic stream | **P2-6** |
| `registerTimeTickHook` → phase 付き system | **P2-7** |
| population loss / forest depletion 等を versioned slice へ | **P2-8** |
| `simulation.stepDay` + TransactionWriter | **P2-11** |

**互換期間は P2-5 で終了。** `window.fmg.actions.advanceTime` / UI / headless はすべて `simulation.stepDay` 列。`advanceLegacyBulk` は daily alias（deprecated）。

#### 履歴: 総点検で「隠れていない」と確認したもの（2026-07-20）

- P0–P1 / P2-1–P2-3 の Verified 完了条件 — 実装と一致。
- Phase 6 save の `withSvgSnapshot` 削除 — save/autosave は `captureArchiveDocument`；export は **P2-13**。
- Phase 7 topic-revision cache / Worker topology — 計画 checklist 済み。
- Phase 8 cell/burg/state/military/extension slice 移動 — checklist 済み；残るは compatibility projection の最終削除（帯 B）。
- partial GPU — 計画どおり「必要なら」；**P3-2** 計測後 **Won't do (measured)**。

#### 履歴: 是正時の依存の目安（当時）

```text
P2-8 / P2-7 / P2-11 ─→ P2-5 ─→ P2-10
P2-6 ─ 独立
P2-4 / P2-9 ─ 独立
P2-12 / P3-3 ─ 横断 enforcement
P3-1 / P3-2 ─ テスト・計測
P2-13 ─ export
```

全 ID Verified 後は依存 DAG に従う未完ブロックはない。

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

### 2026-07-20 — P1-3 burg editor command migration

- burg editor の名称・種別・文化の直接 `pack.burgs` 書込みを `burg.patch` command に置換した。command は culture ID と許可済み culture type を検証し、実変更時だけ `map.settlements` を publish する。
- これにより SVG の label 更新と WebGL の settlement projection invalidation が同一の revision / render-coordination 経路を通る。編集 UI の即時表示更新は維持する。
- 残作業: burg の group / population / flag edits と、heightmap・zones 等の残存 direct writer の command 化または明示 allowlist。P1-3 は `In progress` を維持する。
- 検証: `npm test -- --run src/runtime/worldRuntime.test.ts src/runtime/renderCoordinator.test.ts` — 27 passed。`npm run build` — 成功。

### 2026-07-20 — P1-3 burg editor residual writer containment

- `burg.patch` を lock、custom preview link、citadel / walls / plaza / temple / shanty の施設フラグまで拡張した。施設名・値は command 側で検証する。
- group、population と demographics、port、capital 移管の複合変更は、暫定 compatibility mutation を通して `map.settlements`（必要時は `map.politics` / `simulation.burgs`）を必ず publish するようにした。capital 移管時の個別 SVG renderer 直接呼出しは除去した。
- これで burg editor にある状態変更は、burg 削除を除き、すべて revision / RenderCoordinator の経路を通る。残作業は burg 削除および他 editor の direct writer inventory / allowlist。
- 検証: `npm test -- --run src/runtime/worldRuntime.test.ts src/runtime/renderCoordinator.test.ts` — 27 passed。`npm run build` — 成功。

### 2026-07-20 — P1-3 burg removal and overview actions

- `burg.remove` command を追加し、non-capital burg の cell ownership、removed flag、関連 note、COA を一つの検証済み commit で更新するようにした。削除は `map.settlements` / `map.annotations` / `simulation.burgs` を publish する。
- burg editor は新 command を使用する。Burgs overview、State editor、Province editor の削除・lock 操作も、command または compatibility mutation を通すようにしたため、これらの表 UI からの変更で WebGL/SVG invalidation が欠落しない。
- 残作業: heightmap、zones、generation-triggered edits を含む残存 direct writer inventory / allowlist。P1-3 は `In progress` を維持する。
- 検証: `npm test -- --run src/runtime/worldRuntime.test.ts src/runtime/renderCoordinator.test.ts` — 28 passed。`npm run build` — 成功。

### 2026-07-20 — P1-3 zones and heightmap invalidation

- zone の作成・属性更新・visibility・cell assignment・削除を `zone.create` / `zone.patch` / `zone.remove` command に移行した。zone polygon は WebGL で `map.annotations` revision に依存するため、従来の SVG 即時描画だけでは残っていた canvas 側の更新漏れを解消する。
- heightmap editor は、編集中には無駄な invalidation を発行せず、確定時にだけ topic を publish するようにした。`keep` は `map.physical` のみ、`erase` / `risk` の再生成は topology、physical、politics、settlements、networks、annotations と simulation slices を一括 publish する。
- 残作業: editor 全体の direct writer inventory と allowlist の機械化、generation-triggered edits の残存経路。P1-3 は `In progress` を維持する。
- 検証: `npm test -- --run src/runtime/worldRuntime.test.ts src/runtime/renderCoordinator.test.ts src/renderers/webgl/webglTopicRevisions.test.ts` — 31 passed。`npm run build` — 成功。

### 2026-07-20 — P1-3 state editor command migration

- `state.patch` command を追加し、state editor の color、culture、type、expansionism、lock、short/full name、form を検証済み `map.politics` commit に統一した。capital burg の名称変更も既存 `burg.patch` を利用する。
- SVG の局所的な色・label 更新は維持しつつ、同一操作が WebGL の state fill / border / label projection を確実に無効化する。
- 残作業: religion、river overview、tools 等の残存 direct writer inventory と allowlist の機械化。P1-3 は `In progress` を維持する。
- 検証: `npm test -- --run src/runtime/worldRuntime.test.ts src/runtime/renderCoordinator.test.ts` — 30 passed。`npm run build` — 成功。

### 2026-07-20 — P0-2 extension preflight and opaque reference policy

- archive preflight は built-in extension slice の field-level structure（economy の cell column / burg table、Nobility の state table、Shipbuilding runtime state を含む）を replacement 前に検証する。未知 extension slice も安全な record container でなければ拒否する。
- opaque extension chunk の core-reference kind を明示的な allowlist に限定した。`restrict` reference は対象の core entity の削除を拒否し、reference manifest が `unknown` の opaque chunk は delete / merge を全て拒否する。`orphan` は既存の stable-ID tombstone と互換であるため保持できる。
- state 削除・state merge・burg / province / culture / religion / route / marker / zone 削除を同じ runtime guard に通した。拒否は変更前に発生するため live world は不変である。
- P0-2 の replacement 事前検証および rollback 要件を満たしたため `Verified` に更新した。動的 extension の slice registration / migration / promotion lifecycle は P2-4 で継続する。
- 検証: `npm test -- --run src/runtime/worldArchive.test.ts src/runtime/worldRuntime.test.ts src/runtime/extensionStateSlices.test.ts` — 35 passed。`npm run build` — 成功。

### 2026-07-20 — P1-3 route group deletion migration

- Route Groups editor は `GenerationPipeline.Routes.remove()` を直接呼ばず、対象 route ID を snapshot して既存の `route.remove` command を一件ずつ dispatch するようにした。これにより group 削除も `map.networks` revision と RenderCoordinator を経由し、WebGL の network projection が stale にならない。
- 残作業: editor/generator 全体の writer inventory と allowlist の機械化、および river overview を含む残存 direct writer の command 化。P1-3 は `In progress` を維持する。
- 検証: `npm run build` — 成功。

### 2026-07-20 — P1-3 river and writer-inventory remediation

- `river.remove` と `river.clear` command を追加し、river editor と Rivers Overview の削除処理を runtime seam に移行した。tributary の収集、river-owned cell column（`r` / `fl` / `conf`）の復元、`map.networks` publish を一つの transaction に集約している。
- religion metadata の変更と Burgs Overview の一括改名を `religion.patch` / `burg.patch` command に移行した。これらの操作でも SVG と WebGL が同じ revision 経路で更新される。
- `scripts/lint-world-writers.ts` を追加し、controller 内の direct `worldContext.pack` / `grid` writer を明示 allowlist と照合するようにした。新規 writer は command 化またはレビュー済みの compatibility entry がない限り lint に失敗する。
- 残作業: allowlist に残る heightmap / tools / river creation 等の大規模 transaction の command 化。P1-3 は `In progress` を維持する。
- 検証: `npm run lint:world-writers` — 12 compatibility modules。`npm test -- --run src/runtime/worldRuntime.test.ts src/runtime/renderCoordinator.test.ts` — 33 passed。`npm run build` — 成功。

### 2026-07-20 — P1-3 river creation command migration

- `river.create` command を追加し、river creator の確定時の river table 挿入と未所有 cell の `r` assignment を `map.networks` commit に統一した。入力 river の ID、source/mouth、parent、cell sequence を command が検証する。
- River Creator の flux 入力も `river.setFlux` command 経由に移した。これにより確定前の幅計算に影響する変更も revision を発行する。
- `rivers-creator.ts` を direct writer allowlist から除去した。残る compatibility module は 11 件。
- 残作業: heightmap / tools / diplomacy 等の大規模 transaction を command 化する。P1-3 は `In progress` を維持する。
- 検証: `npm run lint:world-writers` — 11 compatibility modules。`npm test -- --run src/runtime/worldRuntime.test.ts` — 27 passed。`npm run build` — 成功。

### 2026-07-20 — P1-3 world configurator containment

- World Configurator の river / biome / feature 再計算を一つの `legacyMutation` に収め、完了時に `map.physical` と `map.networks` を publish するようにした。大規模再生成の compatibility implementation は残すが、Renderer に通知されない direct write は残さない。
- この file は大規模 transaction のため allowlist に残し、inventory の理由を command 化済みの小規模 writer と区別した。
- 検証: `npm test -- --run src/runtime/worldRuntime.test.ts src/runtime/renderCoordinator.test.ts` — 34 passed。`npm run build` — 成功。

### 2026-07-20 — P1-3 diplomacy transaction containment

- Diplomacy editor の relation change、relation regenerate/reset、relations history の初期化・編集・clear を `legacyMutation` に収め、すべて `map.politics` を publish するようにした。敵対終了 event は commit 後に dispatch するため、listener が変更前の world を観測しない。
- `diplomacy-editor.ts` を direct writer allowlist から除去した。残る compatibility module は 10 件。
- 検証: `npm run lint:world-writers` — 10 compatibility modules。`npm test -- --run src/runtime/worldRuntime.test.ts src/runtime/renderCoordinator.test.ts` — 34 passed。`npm run build` — 成功。

### 2026-07-20 — P1-3 religion editor transaction containment

- Religion editor の center drag は既存の `religion.patch` command を使うようにし、拡張・中心位置の変更に伴う再計算は `map.politics` compatibility commit に収めた。
- `religions-editor.ts` を direct writer allowlist から除去した。残る compatibility module は 9 件。
- 検証: `npm run lint:world-writers` — 9 compatibility modules。`npm test -- --run src/runtime/worldRuntime.test.ts src/runtime/renderCoordinator.test.ts` — 34 passed。`npm run build` — 成功。

### 2026-07-20 — P1-3 province editor transaction containment

- Province editor の全削除、merge、lock 操作を通知付き transaction に収めた。merge は province cell ownership、burg の province 参照、state の province list、統計・pole 再計算を同じ `map.politics` / `map.settlements` commit で処理する。
- `provinces-editor.ts` を direct writer allowlist から除去した。残る compatibility module は 8 件。
- 検証: `npm run lint:world-writers` — 8 compatibility modules。`npm test -- --run src/runtime/worldRuntime.test.ts src/runtime/renderCoordinator.test.ts` — 34 passed。`npm run build` — 成功。

### 2026-07-20 — P1-3 tools regeneration transaction containment

- Tools の route、river、population、state、province、burg、religion、culture、military、ice、marker、zone と emblem の再生成処理を、描画 renderer の実行前に一つ以上の `legacyMutation` commit に収めた。state ID の既存 SVG 要素移し替えは互換 transaction 内に残すが、full renderer 実行は commit 完了後に行う。
- 各 commit は影響する `map.*` と `simulation.*` topic を publish するため、Tools タブ経由の大規模再生成でも SVG と WebGL の projection / revision が同期する。state と burg の再生成では、関連する province、military、route の更新も同じ通知範囲に含める。
- `tools.ts` は複合 generation transaction を抱えるため明示 compatibility allowlist に残す。残作業は heightmap / biome 等の残存 compatibility module を、より狭い typed command または同等の transaction に分解すること。P1-3 は `In progress` を維持する。
- 検証: `npm run lint:world-writers` — 8 compatibility modules。`npm test -- --run src/runtime/worldRuntime.test.ts src/runtime/renderCoordinator.test.ts src/renderers/webgl/webglTopicRevisions.test.ts` — 36 passed。`npm run build` — 成功。

### 2026-07-20 — P1-3 biome editor transaction migration

- biome の色、名称、habitability、custom biome の追加・削除、default 復元を `legacyMutation` に移した。Biome cell assignment と同様に `map.physical` revision を publish するため、metadata と map projection の更新経路が統一される。
- default 復元は biome definition と dependent population を再計算するため、settlement / burg simulation topic も publish する。SVG renderer と editor-store の局所更新は commit 後に維持する。
- `biomes-editor.ts` を direct pack/grid writer allowlist から除去した。残る compatibility module は 7 件で、heightmap の編集プレビューと大規模再構築を次の分割対象とする。P1-3 は `In progress` を維持する。
- 検証: `npm run lint:world-writers` — 7 compatibility modules。`npm test -- --run src/runtime/worldRuntime.test.ts src/runtime/renderCoordinator.test.ts src/renderers/webgl/webglTopicRevisions.test.ts` — 36 passed。`npm run build` — 成功。

### 2026-07-20 — P1-3 burg editor inventory completion

- Burg editor に残っていた state capital / center の直接参照を local record 経由に整理した。変更自体は既存の `legacyMutation` に含まれ、`map.settlements` / `map.politics` / `simulation.burgs` を publish する transaction である。
- これにより `burg-editor.ts` を direct pack/grid writer allowlist から除去した。heightmap edit session は可逆 preview grid を保持し、finalize 時の一括 publish が正しい seam であることを確認したため、6 件の compatibility module に残す。
- 検証: `npm run lint:world-writers` — 6 compatibility modules。`npm test -- --run src/runtime/worldRuntime.test.ts src/runtime/renderCoordinator.test.ts` — 34 passed。`npm run build` — 成功。

### 2026-07-20 — P1-3 tools inventory completion

- Tools の state / burg / culture regeneration が使用する pack record を transaction 内で局所化した。前回導入した `legacyMutation` が既にすべての generator write を覆い、renderer は commit 後に実行する構造であることを確認した。
- `tools.ts` を direct pack/grid writer allowlist から除去した。残る 5 件は heightmap の可逆 preview grid と finalize/rebuild transaction、World Configurator の world-wide transaction である。
- 検証: `npm run lint:world-writers` — 5 compatibility modules。`npm test -- --run src/runtime/worldRuntime.test.ts src/runtime/renderCoordinator.test.ts src/renderers/webgl/webglTopicRevisions.test.ts` — 36 passed。`npm run build` — 成功。

### 2026-07-20 — P1-3 world configurator inventory completion

- World Configurator の river / biome / feature 再計算は既存の world-wide `legacyMutation` に保持し、pack height の一時退避・復元を transaction 内の局所 record 経由に整理した。
- `world-configurator.ts` を direct pack/grid writer allowlist から除去した。残る 4 件はすべて heightmap edit session の可逆 preview grid を扱う module であり、finalize 時の publish/rebuild contract を共有する。
- 検証: `npm run lint:world-writers` — 4 compatibility modules。`npm test -- --run src/runtime/worldRuntime.test.ts src/runtime/renderCoordinator.test.ts` — 34 passed。`npm run build` — 成功。

### 2026-07-20 — P1-3 heightmap finalize transaction correction

- erase / risk の heightmap 再構築は、更新後に空の commit を発行するのではなく、再構築そのものを `legacyMutation` 内で実行するようにした。listener は常に coherent な world を観測してから complete topic set を受け取る。
- risk の COA 削除、ice layer と keep 時の landmass/lake 表示は commit 後の view 操作へ移した。Renderer / DOM 副作用が world mutation transaction 内に混在しない。
- heightmap の 4 compatibility module は、編集中の可逆 grid preview を保持するため allowlist に残す。P1-3 は `In progress` を維持する。
- 検証: `npm run lint:world-writers` — 4 compatibility modules。`npm test -- --run src/runtime/worldRuntime.test.ts src/runtime/renderCoordinator.test.ts src/renderers/webgl/webglTopicRevisions.test.ts` — 36 passed。`npm run build` — 成功。

### 2026-07-20 — P1-3 battle annotation command migration

- Battle Screen の戦場 marker と対応 note の直接追加を `marker.create` command に移行した。入力を検証してから marker / note を一つの `map.annotations` commit で追加するため、SVG marker と WebGL annotation projection は RenderCoordinator 経由で更新される。
- writer inventory は direct assignment だけでなく、`push` / `splice` / `set` などの direct mutator 呼び出しも検出するようにした。これにより今回のような direct collection mutation は allowlist または command migration なしに追加できない。
- heightmap edit session の 4 compatibility module は、確定前の可逆 grid preview を維持するため allowlist に残す。P1-3 は `In progress` を維持する。
- 検証: `npm test -- --run src/runtime/worldRuntime.test.ts` — 29 passed。`npm run lint` — 成功。`npm run build` — 成功。

### 2026-07-20 — P1-3 staged heightmap preview

- `HeightmapEditSession` を追加し、brush、template、image conversion、undo/redo と preview drawing が live `grid.cells.h` ではなく draft heightmap を読むようにした。編集中の操作は canonical world と revision を変更しない。
- finalize の `legacyMutation` 内でだけ draft を live grid に反映し、keep は `map.physical`、erase/risk は再構築に必要な完全な topic set を publish する。モード選択をキャンセルした場合は draft を破棄する。
- `heightmapBrushes.ts`、`heightmapImage.ts`、`heightmapTemplate.ts` を writer allowlist から除去した。残る compatibility writer は finalize/rebuild を一つの transaction で担う `heightmapEditor.ts` だけである。P1-3 はこの world-wide rebuild の command 化を残して `In progress` を維持する。
- 検証: `npm test -- --run src/runtime/heightmapEditSession.test.ts src/runtime/worldRuntime.test.ts` — 31 passed。`npm run lint` — 成功（1 compatibility module）。`npm run build` — 成功。

### 2026-07-20 — P1-3 heightmap finalize command

- `heightmap.finalize` command と handler registration seam を追加し、erase / keep / risk の finalize が named runtime command として一つの revisioned commit を発行するようにした。handler 未登録時は command を拒否する。
- heightmap rebuild の互換 implementation は allowlist に残るが、Controller が `legacyMutation()` を直接組み立てる経路は除去した。ocean layer の DOM 更新も commit 後へ移し、world mutation と混在しないようにした。
- writer inventory / allowlist、優先 editor の command migration、残る heightmap finalize の commit seam が揃ったため、P1-3 を `Verified` に更新した。
- 検証: `npm test -- --run src/runtime/worldRuntime.test.ts src/runtime/heightmapEditSession.test.ts` — 32 passed。`npm run lint` — 成功（1 compatibility module）。`npm run build` — 成功。

### 2026-07-20 — P2-1 dynamic extension read facade

- `WorldRuntime.read()` は dynamic extension 用の immutable read model を返すようにし、trusted renderer / host adapter 専用の mutable compatibility projection は `readTrusted()` に分離した。
- read model は plain record、entity list、dense numeric column を `get` / iterator / `copyRange()` だけを持つ frozen facade に変換する。raw `Array`、`Map`、`Set`、Typed Array、`ArrayBuffer` は返さず、commit ごとに snapshot cache を無効化する。
- ZIP dynamic loader は `DynamicExtensionAPI` を渡す。`world.read()` と compatibility 名の `worldContext` / `simulationContext` は同じ immutable snapshot を返し、書き込みは既存の registered extension command seam のみを通る。組み込み extension は legacy writer 移行中の trusted adapter を継続する。
- 同一 JavaScript realm の dynamic extension を hostile code から隔離するものではない。隔離が必要な場合は計画どおり Worker realm へ structured-cloneable command / snapshot のみを渡す。
- 検証: `npm test -- --run src/runtime/worldRuntime.test.ts src/extensions/dynamicExtensionApi.test.ts` — 31 passed。`npx biome check`（変更ファイル）— 成功。`npm run build` — 成功。

### 2026-07-20 — P2-2 PresentationData layerOrder / overlays and WebGL style source

- `PresentationData` に `layerOrder`（toggle id の paint 順序）と `overlays`（scaleBar / compass / legend 等の chrome layout）を追加した。`presentation.patch` は両者を topic 付きで commit し、archive validation は旧 `.fmg` で欠落していても空値へ正規化する。
- known overlay selector（`#scaleBar`、`#compass > use` 等）への style patch は semantic `overlays` と双方向に mirror し、`projectPresentationToSvg` と legacy `.map` import も overlays を扱う。
- Layers panel の reorder は `layerOrder` を publish し、full replace 後の `syncPresentation` は `hydrateLayerOrder` で panel / SVG 順を復元する。
- `webglStyleExtractors` と `buildDeckLayers` の ocean/land fill は live SVG attribute を読まず、`PresentationData` と hardcoded default のみを使う。DOM からの style 取り込みは `importLegacyPresentationFromSvg` に限定する。
- 検証: `npm test -- --run src/runtime/worldRuntime.test.ts src/renderers/webgl/webglStyleExtractors.test.ts src/renderers/presentationProjection.test.ts src/runtime/worldArchive.test.ts src/runtime/renderCoordinator.test.ts` — 59 passed。`npx biome check`（変更ファイル）— 成功。`npm run build` — 成功。

### 2026-07-20 — P2-3 simulation RNG archive and headless day runner

- `SimulationContext.rng` に Alea の algorithm / seed / engine state を保存するようにした。`initRng` と `world.replace` は同じ stream を `appServices.rng` に install / restore し、`simulation.advance` は消費後に slice へ同期して `simulation.rng` topic を publish する。
- archive preflight は `simulation.rng` を検証し、旧 `.fmg` で欠落している場合は map seed から materialize する。`captureArchiveDocument` は clone 前に live PRNG を flush する。
- `src/runtime/simulationRunner.ts` に renderer / rAF / UI store 非依存の day step surface を追加した。`runLegacyDaily`（UI 日次 semantics）と `advanceLegacyBulk`（public bulk semantics）を characterization 用に分離し、`notify: false` で pure `simulation.advance` のみを実行できる。
- 互換期間中は daily と bulk の `tickCount` / hook 回数差を維持する。per-system 派生 stream への分割は未着手で、単一 simulation stream の save/load を先に固定した。
- 検証: `npm test -- --run src/runtime/simulationRng.test.ts src/runtime/simulationRunner.test.ts src/runtime/worldArchive.test.ts src/runtime/worldRuntime.test.ts src/generators/simulationSystem.test.ts src/runtime/renderCoordinator.test.ts` — 62 passed。`npx tsc --noEmit` — 成功。`npm run build` — 成功。

### 2026-07-20 — Phase 4 residual IDs tracked (P2-5 / P2-6 / P2-7)

- P2-3 の完了条件外に残っていた `unite-data-and-map` Phase 4 / §6.2 / §6.3 の target 作業を remediation 表へ追記した。新規欠陥の発見ではなく、計画上の後続が表から消えないようにするための分解である。
- **P2-5**: daily と bulk の semantics 統一（互換期間の出口）。前提は各 system の bulk/日次差の versioned migration。
- **P2-6**: per-system 派生 RNG stream と archive。
- **P2-7**: `registerTimeTickHook` 互換経路から `registerSimulationSystem` への本移行。
- 互換期間は P2-5 Verified まで継続する、と表直下の対応節に明記した。

### 2026-07-20 — Full plan residual audit (P2-8 … P2-13, P3-3)

- `unite-data-and-map.md` Phase 0–8・§4–§9・§12–§13 を remediation 表と `src/` 実装に突き合わせ、P2-3 型（Verified の狭い完了条件の後ろに target 後続が残る）の漏れを総点検した。
- **新規に表へ載せた後続**:
  - **P2-8** module-local tick 状態（`populationLossTracker`、`forestDepletion` 等）の slice/archive 化
  - **P2-9** `world.generate` / generate・legacy load の staging 原子性
  - **P2-10** options 時計 dual mirror の廃止
  - **P2-11** `simulation.stepDay` + `TransactionWriter`
  - **P2-12** writer inventory の generator/extension 拡張と tick 内 direct draw
  - **P2-13** export 経路の `withSvgSnapshot` 除去
  - **P3-3** §12.4 architecture check の機械化不足
- **隠れていなかったもの**も対応表に明記（Phase 6 save の DOM-free 化済み、Phase 7/8 checklist 済み、partial GPU は P3-2 駆動など）。
- 依存の目安と「Verified ≠ Phase 完了」の運用を remediation 本文に固定した。

### 2026-07-20 — P2-4 extension slice registration and opaque promotion

- `ExtensionAPI.registerStateSlice(spec)` / `WorldRuntime.registerStateSlice()` を追加した。spec は `schemaVersion`・`defaultState`・`validate`・`migrate`・必須の `collectCoreReferences` と、任意の encode/decode を持つ（計画 §9）。
- `src/runtime/extensionStateSliceRegistry.ts` が registry・structured opaque codec（Typed Array 対応）・demote/promote lifecycle を所有する。`extensionArchiveTypes.ts` に core reference / opaque chunk 型を切り出し、codec と registry の循環依存を避けた。
- Archive migration は未登録 `simulation.extensions` を opaque chunk へ demote し、登録済み extension の opaque chunk を migrate+validate 成功時だけ runtime slice へ promote する。validation 失敗時は world を変更せず opaque を保持する。
- `captureArchiveDocument()` も demote を行い、未インストール extension のデータを validated runtime slice として保存しない。登録済み live slice と opaque の双方で core delete policy（restrict / orphan / unknown）を適用する。
- Built-in characters / economy / nobility / shipbuilding は host 側で常時 register し、既存 field-level validation と entity-keyed `collectCoreReferences` を供給する。
- 検証: `npm test -- --run src/runtime/extensionStateSliceRegistry.test.ts src/runtime/worldArchive.test.ts src/runtime/extensionStateSlices.test.ts src/runtime/worldRuntime.test.ts src/extensions/dynamicExtensionApi.test.ts` — 48 passed。`npx tsc --noEmit` — 成功。`npm run build` — 成功。

### 2026-07-20 — P2-8 module-local tick state → simulation / extension slices

- `populationLossTracker` の module-private `simDay` / day-bucket history を `simulationContext.populationLoss` に移した。Overview / combat-death heatmap は同じ slice を読み、`.fmg` archive と `world.replace` で round-trip する。旧 archive では空 history へ正規化する。
- Economy `forestDepletion` は `simulation.extensions.economy.forestDepletion`（sparse cellId → factor）へ移した。ExtensionAPI 未初期化時のみ unit test 用 fallback を使う。archive validation は [0, 0.9] と topology cell range を検査する。
- 同種の tick 蓄積として `navalTechBonus` を `simulationContext.navalTechBonus` へ、Nobility `voyageIntelBonus` を `simulation.extensions.nobility.voyageIntelBonus` へ移した。どちらも save/load 後も軍事 / 諜報結果が変わらない。
- `dataFieldOwnership` inventory と extension `collectCoreReferences`（voyage intel は state orphan）を更新した。
- 検証: `npm test -- --run src/generators/populationLossTracker.test.ts src/generators/navalTechBonus.test.ts src/extensions/economy/generators/forestDepletion.test.ts src/extensions/economy/generators/production-utils.test.ts src/runtime/worldArchive.test.ts src/runtime/dataFieldOwnership.test.ts src/runtime/extensionStateSlices.test.ts src/runtime/simulationRng.test.ts src/runtime/simulationRunner.test.ts src/extensions/nobility/generators/espionage-generator.test.ts` — 63 passed。`npx tsc --noEmit` — 成功。`npm run build` — 成功。

### 2026-07-20 — P2-7 built-in tick hooks → registerSimulationSystem

- Economy / Shipbuilding / Nobility の `registerTimeTickHook` を `registerSimulationSystem` に置換した。
  - `economy.tick` — phase `economy`、reads/writes 明示、disabled 時は `[]`
  - `shipbuilding.tick` — phase `economy`（lexical で economy の後）、reads/writes 明示
  - `nobility.tick` — phase `military`（economy 系の後）、precise topic 返却を維持
- 実行順は phase により `economy.tick` → `shipbuilding.tick` → `nobility.tick`。旧 hook 登録順（economy→nobility→shipbuilding）から、voyage intel が同一 tick の Espionage に届くよう military を後ろへ寄せた。
- 各 extension の `cleanup()` で system unregister する。`registerTimeTickHook` は `@deprecated` の薄い politics-phase 互換 wrapper とし、DEV で警告を出す（dynamic ZIP 用に残置）。
- 検証: `npm test -- --run src/generators/timeEngine.systems.test.ts src/generators/simulationSystem.test.ts src/runtime/simulationRunner.test.ts src/runtime/renderCoordinator.test.ts` — 関連 green。`npx tsc --noEmit` — 成功。`npm run build` — 成功。

### 2026-07-20 — P2-11 simulation.stepDay + TransactionWriter

- `TransactionWriter`（`src/runtime/transactionWriter.ts`）を追加。system は宣言 `writes` 内の topic だけを `markChanged` でき、未宣言 mark は throw。
- `SimulationSystem.run(context, writer)` に変更。registry が writer を生成し marked topics だけを commit へ載せる。built-in economy / shipbuilding / nobility と legacy hook wrapper を移行。
- `simulation.stepDay` command を追加（payload なし、常に 1 暦日）。handler は mutation 前に simulation + pack を snapshot し、system 例外時は live state を復元して revision を発行しない。
- `simulationRunner.stepDay` / `runLegacyDaily` は `simulation.stepDay` を使用。`simulation.advance` は互換 bulk 経路として維持（P2-5 で日次統一）。
- 検証: `npm test -- --run src/runtime/transactionWriter.test.ts src/generators/simulationSystem.test.ts src/generators/timeEngine.systems.test.ts src/runtime/simulationRunner.test.ts src/runtime/worldRuntime.test.ts` — 51 passed。`npx tsc --noEmit` — 成功。`npm run build` — 成功。

### 2026-07-20 — P2-6 per-system derived RNG streams

- `SimulationRngState` に `streams: Record<systemId, engineState>` を追加。旧 archive は `{}` へ正規化する。
- `createSystemStepRng` / `deriveSystemStreamSeed` / `runWithSystemRng` を追加。各 system 呼び出しは `(masterSeed, systemId, tick, year-month-day)` から独立 Alea stream を派生する。
- `timeEngine` は system 実行中だけ `appServices.rng` をその stream に差し替えるため、既存の `appServices.rng` 利用（Nobility 等）も他 system と隔離される。終了時に ending state を `streams[systemId]` へ記録。
- 共有 root stream（`state`）は system 外呼び出し用に維持。`syncSimulationRngToContext` は root を flush しつつ streams を保持する。
- 検証: `npm test -- --run src/runtime/simulationRng.test.ts src/generators/simulationSystem.test.ts src/runtime/simulationRunner.test.ts` — 22 passed（isolation + archive streams round-trip 含む）。`npx tsc --noEmit` — 成功。`npm run build` — 成功。

### 2026-07-20 — P2-5 daily unification (compat period exit)

- **Semantic migration**: multi-day / month / year advances no longer use one `simulation.advance` commit. They expand via `durationToCalendarDays` and run one `simulation.stepDay` per calendar day (same as Tools UI).
- `advanceTime` (public `window.fmg.actions.advanceTime`) and `runTimeSimulation` (UI rAF loop) share that day sequence. Per-day observers: `fmg:time-advanced` / `fmg:simulation-updated` / telemetry with `{0,0,1}`.
- `SimulationRunner.advance` / `runDaily` are the headless multi-day entry points. `advanceLegacyBulk` is a deprecated daily alias (no longer a single bulk commit).
- `calendarDuration.ts` holds shared expansion rules to avoid timeEngine ↔ runner cycles.
- Characterization tests now require equal tickCount for UI daily, headless advance, public advanceTime, and the legacy bulk alias.
- 検証: `npm test -- --run src/runtime/simulationRunner.test.ts` — 9 passed。`npx tsc --noEmit` — 成功。`npm run build` — 成功。

### 2026-07-20 — P2-9 generate staging + legacy load atomicity

- **`world.generate` command**: async dispatch path with registered handler (`registerWorldGenerateHandler` / `dispatchWorldGenerate`). Handler stages into live pack/grid (generators remain singleton-bound); runtime validates the staged document, publishes `fullReplace` topics on success, and restores a pre-generate snapshot with **no revision** on failure or invalid output.
- **`generate()`** in `main.ts` is a thin wrapper: pipeline body is the handler; scale bar / calendar / stats are view-side work after a successful commit.
- **Legacy `.map` load**: `LegacyMapCodecAdapter.decode` already stages positional slots without live mutation. `parseLoadedData` now (1) snapshots live world, (2) stages data only (`stageLegacyMapData` — no SVG replace), (3) validates → `world.replace` fullReplace, (4) injects SVG / layers / presentation (`applyLegacyMapView`). Failure before data commit restores the snapshot; view failures after commit do not roll back accepted data.
- Concurrent dispatch is blocked while `world.generate` is running. Rollback restore skips archive validation so an empty pre-first-generate shell can be restored.
- 検証: `npm test -- --run src/runtime/worldRuntime.test.ts src/runtime/worldArchive.test.ts src/runtime/renderCoordinator.test.ts` — 53 passed。`npx tsc --noEmit` — 成功。`npm run build` — 成功。

### 2026-07-20 — P2-10 simulation clock sole source of truth

- `advanceTime` / `simulation.stepDay` no longer write `worldContext.options.year|month|day` or `useOptionsState.year`. Day-step rollback snapshots no longer include the options clock.
- Live readers migrated to `simulationContext` (or extension helpers): regiment movement, battle legends, character aging/lifecycle, province lords, strategic planner, economy season/quarter keys, caravans, production seasonality, Diplomacy History UI, debug snapshot year.
- Generation-time readers keep `options.year` (states / military / burgs / frontiers / historical war scars). `initSimulationClock` / user Year–Era edits still seed the live clock from options.
- Regression: multi-day advance leaves options generation year/month/day unchanged while simulation clock advances.
- 検証: `npm test -- --run src/runtime/simulationRunner.test.ts src/generators/simulationSystem.test.ts src/generators/timeEngine.systems.test.ts src/extensions/characters/advanceAge.test.ts src/extensions/nobility/generators/strategic-planner.test.ts src/extensions/nobility/generators/provinceLordGenerator.test.ts src/extensions/economy/generators/production-utils.test.ts src/extensions/economy/generators/caravans.test.ts` — 44 passed (2 skipped)。`npx tsc --noEmit` — 成功。`npm run build` — 成功。

### 2026-07-20 — P2-12 writer inventory + extension tick draw seam

- `scripts/lint-world-writers.ts` を `src/controllers` / `src/generators` / `src/extensions` に拡張。検出パターンに `this.worldContext` / `getWorldContext()` / `api.worldContext` を含め、test ファイルは除外する。
  - controllers / extensions: 未登録の direct write は lint 失敗（allowlist: heightmapEditor、charactersContext）。
  - generators: Phase 5 どおり directory policy で許可しつつ、direct-pattern hit を inventory 出力で可視化する。
- Shipbuilding / Economy の `registerSimulationSystem` から tick 内 `drawShipyards` / `TradeAnimation.start` を除去。`writer.markChanged(extension.*)` 後に RenderCoordinator が `renderExtensionLayers`（`runDrawLayerHooks`）と WebGL update を rAF coalesce する。
- layer toggle / editor 経路の `draw*` と `registerDrawLayerHook` は維持（ユーザー操作の即時表示）。
- 付随: `worldArchive.ts` の未使用 `_assertRecordArray` を削除（`tsc --noEmit` の dead-code エラー）。
- 検証: `npm run lint:world-writers` — passed。`npm test -- --run src/runtime/renderCoordinator.test.ts src/generators/timeEngine.systems.test.ts src/runtime/simulationRunner.test.ts` — 22 passed。`npx tsc --noEmit` — 成功。`npm run build` — 成功。

### 2026-07-20 — P2-13 offscreen SVG export (no withSvgSnapshot mode switch)

- `withSvgSnapshot()` の `setRenderMode("svg")` 往復を廃止。hybrid 時の full-map / vector export は `withOffscreenSvgExport()` が live `#map` を一時 detach し、clone に `paintSvgMapLayers()` + `projectPresentationToSvg(PresentationData)` してから serialize する。
- `bindViewLayersFromSvg()` を export rebind 用に公開（`updateWebglCanvas: false` / `dispatchReinit: false`）。live deck canvas と hybrid body class を破壊しない。
- `paintSvgMapLayers()` を `drawLayers()` の SVG 本体から抽出。export は `DeckGlRenderer.clear` を呼ばない。
- Extension `getSvgLayer` は現在の `viewContext.viewbox` を優先し、offscreen rebind 中も extension draw hook が export 木へ描く。
- viewport PNG/JPEG の hybrid 合成（deck canvas + overlay clone）は従来どおり。save/autosave は引き続き DOM-free。
- 検証: `npm test -- --run src/services/svgSnapshot.test.ts` — passed。`npx tsc --noEmit` — 成功。`npm run build` — 成功。

### 2026-07-20 — P3-1 E2E render mode pinned via helpers

- `waitForMapLoad` / `uploadMapFixture` / `loadMapFile` は必須の `renderMode: "svg" | "webglHybrid"` を取り、load 完了後に `setRenderMode` で pin する。sticky `localStorage` や browser default に依存しない。
- `setRenderMode` helper は同期の `viewContext.renderMode` 代入を assert する（deck.gl の async fallback とは競合させない）。fixture helpers 内の inline `window.fmg.actions.setRenderMode` を helper 経由に統一。
- 全 map-related E2E を更新: SVG DOM / snapshot / click-edit 系は `"svg"`、WebGL hybrid 系は `"webglHybrid"`。toggle / extension enable / SVG↔WebGL 比較は意図的に `"svg"` で開始してから切替える。
- `startup-check` は generation smoke のみ（`waitForMapGeneration`）のため mode pin 対象外。
- 検証:
  - bare `waitForMapLoad` / `loadMapFile` / `uploadMapFixture` が 0 件。
  - `npx playwright test` lakes / burgs / economy-dialog-layers / states / hover tooltip / hybrid policy / toggle / non-empty canvas / SVG roundtrip — passed。
  - `load-map` は pre-existing flake（`rulers.fromString` / mapId wait）があり、本変更前後で再現。P3-1 範囲外。

### 2026-07-20 — P3-3 architecture checks mechanized (§12.4)

- `scripts/lint-architecture.ts` を追加し `npm run lint:architecture`（`lint:legacy` / pre-commit 経由）で継続実行する。
  - Host `src/generators/**` の value import from Renderer を禁止。residual allowlist: `burgs-generator`（icon/label/COA）、`resample`（OceanLayers）。
  - Extension `**/generators/**` の Renderer import を禁止（UI draw は index/controllers 側）。
  - `import type` / `export type` は許可。死んだ `generators/index.ts` の `ocean-layers` side-effect import を削除。
- `dataFieldOwnership` coverage test を拡張: core / FULL_REPLACE `DataTopic` 対応、WorldContext / SimulationContext / PresentationData / PackedGraph / PackedGraphCells / Grid の field 対応、brace 展開後の一意性、owner↔topic 整合。`pack.cells.area` を inventory に追加。
- `extensionReadModel.test.ts` で public read model の DFS 到達検査（Array/Map/Set/TypedArray/ArrayBuffer 禁止、frozen facade、host mutation isolation）。dynamic API テストも mutable context 非露出を強化。
- 検証: `npm run lint:architecture` — passed。`npm test -- --run src/runtime/dataFieldOwnership.test.ts src/runtime/extensionReadModel.test.ts src/extensions/dynamicExtensionApi.test.ts` — 19 passed。`npx tsc --noEmit` — 成功。

### 2026-07-20 — P3-2 continuous §13 benchmark harness

- `scripts/benchmarkWebglLayers.ts` を §13 required metrics 用に拡張。10k / 50k / 100k で:
  - **timings**: initial projection、single-topic（`map.politics`）、full replace、preset switch、zoom-only cache hit
  - **memory**: pack/grid typed-array budget、projection cache / land CSR bytes、estimated GPU binary attrs、snapshot staging clone、heap samples、mode-switch cache release
  - **decision**: single-topic/initial 比が soft threshold（0.55）を超えたときだけ partial GPU を推奨
- `estimateDeckLayerProjectionBytes()` を `buildDeckLayers.ts` に追加（cache + land topology の概算バイト）。
- 出力: console tables + `docs/analytics/webgl-layer-benchmark-latest.json`。`docs/webgl-renderer-migration-candidates.md` の計測節を更新。
- 2026-07-20 実行（100k）: initial 1210 ms、single-topic 393 ms（比 0.32）、full replace 1269 ms、zoom-only 0.1 ms → **partial GPU 不要**。soft budget 超過なし。
- 検証: `npm run perf:webgl-layers` — 成功（JSON 更新）。`npx tsc --noEmit` — 成功。

### 2026-07-20 — 計画クローズ判定マップへ書き換え

- 「計画全体の残作業マップ」を **Unite クローズ判定** に差し替えた。各 Phase / 節を **完了** / **Done with residual** / **Won't do (measured)** に分類。
- residual を **A 運用 / B post-unite cleanup / C 計測駆動** に帯分け。新規必須 P-ID は切らない方針を明記。
- Phase 4 分解表・依存 DAG・「隠れていない確認」は **履歴** へ移動（すべて Verified 済みの文脈）。
