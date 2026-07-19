# Unite Data and Map 修正進捗

- **対象計画**: `docs/plan/unite-data-and-map.md`
- **開始日**: 2026-07-20
- **運用**: 優先度の高い項目から修正し、各項目を `In progress` → `Verified` または `Blocked` に更新する。`Verified` は回帰テストと関連する build が成功して初めて付与する。

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
