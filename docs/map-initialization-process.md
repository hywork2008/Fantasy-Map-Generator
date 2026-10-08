# 地図初期化プロセス

> `src/app.ts` の `initApp()` を起点とする、現在の地図生成・表示・保存地図ロードの流れ。
> 最終確認: 2026-10-08（`src/app.ts`, `src/main.ts`, `src/initViewLayers.ts`, `src/runtime/worldRuntime.ts`, `src/runtime/mapReadyTaskCoordinator.ts`, `src/extensions/economy/index.tsx`, `src/extensions/nobility/index.tsx`、道路・河川サービス、CE 連携・計測 CLI）

この文書の「順序」は、特記がない限り同一の同期処理内での呼び出し順である。`initMain()`、スタイル読込、生成、動的拡張の読込には `await` があるため、起動全体は完全な直列処理ではない。

---

## 1. 起動フロー

`initApp()` は `drawMap` / `drawUI` を受け取る。既定値はいずれも `true` であり、通常のブラウザ起動では地図 SVG と React UI の両方を初期化する。

```
initApp({ container?, drawMap = true, drawUI = true })
  │
  ├─ コンテナを取得または #fmg-container として作成
  ├─ drawMap に応じて #map をコンテナへ移動、または DOM から外す
  ├─ viewContext.renderMap = drawMap
  ├─ #defElements をコンテナへ移動
  ├─ injectInfrastructure(container)
  │
  ├─ [drawUI] injectVisibleUI(container)
  │           → 動的 import("./ui/index") → initReactUI(container)
  │           → 次の macrotask まで待機
  │  [!drawUI] #loading を削除
  │
  ├─ initUtils()
  ├─ initModules()
  ├─ [drawMap] initRenderers()
  ├─ initControllers(worldContext, viewContext, appServices)
  │           └─ initLayers() は標準レイヤー・プリセット・レイヤーイベントを登録
  │
  ├─ initMain(drawMap)                 ※ Promise を待たずに起動する
  │   ├─ [drawMap] createViewLayers() / populateSizeRects()
  │   ├─ checkLoadParameters(drawMap)  → §2
  │   ├─ 編集イベント・resize・自動保存・ツアー導線を登録
  │   └─ map 再初期化、レンダーモード変更、simulation 更新等のホストイベントを登録
  │
  ├─ initRenderCoordinator()
  │   └─ WorldRuntime の commit を描画・投影・WebGL 更新に接続
  │
  ├─ window.fmg を Object.freeze() して公開
  │   └─ world / view / simulation / actions / extensionAPI
  │
  └─ await initExtensions()
      ├─ Economy
      ├─ Characters
      ├─ Nobility
      ├─ Shipbuilding
      └─ IndexedDB の動的拡張
```

### 並行性に関する注意

- `initApp()` は `initMain(drawMap)` を `await` しない。そのため、`initMain()` が `checkLoadParameters()` 内で待機している間に、レンダー・コーディネータの接続、`window.fmg` の組立て、組込み拡張の初期化が進む。
- `checkLoadParameters()` の通常のランダム生成経路は `generateMapOnLoad()` を開始するが、その Promise はそこで待機しない。`generateMapOnLoad()` 自身はまず `applyStyleOnLoad()` を待つ。
- したがって、起動図は「SVG レイヤー構築 → 生成開始 → 拡張初期化完了」のような単純な一列の保証ではない。組込み拡張は `init()` 時にレイヤー・Map Ready task・イベント処理を登録し、生成後のデータ初期化は Map Ready task として行われる。動的拡張だけが互換イベント `fmg:generate-post-core` を利用できる。
- `drawMap: false` では SVG レイヤー、通常レンダラー、地図描画を作らないが、世界データ生成、`window.fmg`、拡張初期化は実行できる。

---

## 2. 初回の地図選択・生成

`initMain()` はホストレイヤーを準備した後、`checkLoadParameters()` で初期地図を決める。

```
checkLoadParameters(drawMap)
  ├─ ?maplink=... が有効
  │    └─ 1 秒後に loadMapFromURL()
  ├─ ?seed=... がある
  │    └─ await generateMapOnLoad(drawMap)
  ├─ onloadBehavior === "lastSaved" かつ IndexedDB に lastMap がある
  │    └─ uploadMap(blob)             → §7
  └─ 上記以外
       └─ generateMapOnLoad(drawMap)

generateMapOnLoad(drawMap)
  ├─ await applyStyleOnLoad()
  ├─ await runGeneration()            → §3（失敗ならここで終了）
  └─ [drawMap]
       ├─ applyLayersPreset()
       ├─ drawLayers()
       ├─ fitMapToScreen()
       ├─ focusOn()                   // URL の scale/cell/burg/x/y を反映
       └─ void startMapReadyTasks()   → §3.2
```

`applyLayersPreset()` は `localStorage["preset"]`、なければ Zustand の active preset を使う。対象のプリセットが存在しない場合は `political` に戻す。

---

## 3. `generate()` と世界データの生成

公開 API の `generate()` は、ジェネレーターを直接呼ばない。`dispatchWorldGenerate()` が `WorldRuntime` の `world.generate` コマンドとして `runGeneratePipeline()` を実行し、成功した全体を一度の `fullReplace` commit として公開する。

```
generate(opts?)
  ├─ await runGeneration(opts)
  │    ├─ await dispatchWorldGenerate(opts)
  │    │    └─ WorldRuntime.executeGenerate()
  │    │         ├─ 現在の WorldDocument を rollback 用にスナップショット
  │    │         ├─ await runGeneratePipeline({ seed, graph })
  │    │         ├─ 出力を検証
  │    │         └─ FULL_REPLACE_TOPICS を含む 1 回の fullReplace commit を publish
  │    │              └─ RenderCoordinator が次フレームで全体描画を予約 → §5
  │    ├─ [debug snapshot 有効時] 初期スナップショットを保存
  │    ├─ drawScaleBar() / drawCalendar() / showStatistics()
  │    └─ 成功・失敗を返す（失敗時はエラーダイアログ等を処理）
  └─ [生成成功] void startMapReadyTasks()
```

生成中の `pack` / `grid` は既存オブジェクトを in-place で空にして再利用する。生成失敗または検証失敗時は `WorldRuntime` が生成前のスナップショットを戻し、commit は公開しない。

### `runGeneratePipeline()` の順序

```
prepareGenerationStage()
  ├─ setSeed() / applyGraphSize() / randomizeOptions() / options 同期
  ├─ grid を再生成、または既存 grid.cells.h を破棄
  ├─ pack を空にする（Heightmap 生成より前）
  ├─ 初期 landUse / frontier / wilderness、拡張・simulation 状態を reset
  └─ [renderMap] undraw()

getGenerationStages()（同じ SettlementGeometrySession を 2 回の shift で共有）
  1. Landscape outline
     await HeightmapGenerator.generate() → grid.cells.h
     → Features.markupGrid() → addLakesInDeepDepressions() → openNearSeaLakes()
     → reGraph() → Features.markupPack() → resetRulers()

  2. Climate and waterways
     [renderMap] OceanLayers() → defineMapSize() → calculateMapCoordinates()
     → calculateTemperatures() → generatePrecipitation()
     → OceanCurrents.generate() → Features.applyOceanCurrentEnclosure()
     → Rivers.generate() → LavaFlows.generate() → Biomes.define()
     → Features.defineGroups() → Ice.generate()

  3. Cultures and settlements
     Threats.generate() → rankCells() → generateSubsistenceCapacity()
     → [Fantasy] generateCaveSystems() → Deep Worms・danger 更新
     → Cultures.generate() / expand() → seedDwarfHoldOikoumene()
     → [条件付き] preferredFrontierStarts 算出
     → applyInitialSettlementPattern() / settlementFoundation 設定
     → Burgs.generate({ deferShift: true })
     → await Burgs.shiftAsync({ geometrySession })

  4. Realms and routes
     [standard]
       States.generate()
       → await Burgs.shiftAsync({ connectStateLandmasses: true, geometrySession })
       → Routes.generate()
     [standard 以外]
       Routes.generate() → States.generate()
       → await Burgs.shiftAsync({ connectStateLandmasses: true, geometrySession })
       → Routes.generate()
     → Religions.generate() → Burgs.specify()
     → States.collectStatistics() / defineStateForms() → assignWildLandTags()
     → Provinces.generate() / getPoles() → Rivers.specify() / Lakes.defineNames()

  5. Finish the world
     Military.generate() → establishVassalage() → FrontierForts.generate()
     → Markers.generate() → Dungeons.generate() → Zones.generate()
     → initializeForestStock() → initSimulationClock() → ensureFuneralRemainsSeeded()
     → advanceSeasonalClimate()
     → simulation burg/state/military と extension state slices を bind
     → applyHistoricalWarScars() → Threats.appendCasualtyNotes()
     → ensureConvergingWorldRiverRoads()（最終入力で CE 用の準備を確定）
     → [changedRoutes がある] resolveRiverRouteCrossings(preparedRoads)
     → Names.getMapName(false) → mapId が未設定なら Date.now() を設定
```

通常起動は `src/main.ts` の上記非同期 pipeline を使う。`src/generators/index.ts` の同期ヘルパー `generateWorld()` は別経路であり、その呼び出し順を通常の地図生成順として扱わない。

### 3.1 生成工程の確認ダイアログ

`renderMap` が有効で React UI コンテナがある通常の新規生成は、画面中央の `Build map` ダイアログで以下の 5 工程ごとに停止する。最初の `Landscape outline` では高さマップを SVG にプレビューするため、国家や都市を生成する前に海岸線を確認できる。

1. `Landscape outline` — grid / 高さマップ / 湖 / pack graph / feature
2. `Climate and waterways` — 気候、降水、河川、バイオーム、氷
3. `Cultures and settlements` — 脅威、文化、人口基盤、burg
4. `Realms and routes` — 国家、道路、宗教、州、河川・湖の名称
5. `Finish the world` — 軍隊、地点、zones、simulation、コア世界の確定・名称（拡張初期化は commit/初回描画後の §3.2）

各停止点では `Continue` または `Generate entire map` を選べる。`Return to previous stage` は途中の可変 `pack` / `grid` を直接復元せず、現在のシードで必要な前段から再生成して指定工程で止まる。これにより generator の in-place mutation と `WorldRuntime` の final fullReplace commit を両立する。`Generate another landscape` は第 1 工程でのみ表示され、新しいシードと grid からやり直す。

工程中は `WorldRuntime` の staging 状態であり、すべての工程を完了するまで `mapId` と fullReplace commit は公開されない。生成失敗時は従来どおり生成前の rollback snapshot に戻る。

コア pipeline 自体は拡張の経済・キャラクターデータを生成しない。成功後に `WorldRuntime` が `fullReplace` を publish し、通常の表示経路ではまずコア地図を描画する。その後の拡張初期化は §3.2 の Map Ready task が担う。

> 旧実装の説明と異なり、組込み拡張は `fmg:generate-post-core` を直接購読して初期化しない。このイベントは Map Ready task の開始時に発火し、動的拡張との互換用である。組込み拡張は進捗表示・取消・依存順を持つ task として実行される。

### 3.2 コア生成後: Map Ready task と初期資産の配布

`generate()`、`regenerateMap()`、`drawMap: true` の `generateMapOnLoad()` は、コア world の commit と初回描画後に `startMapReadyTasks()` を起動する。コーディネータは double `requestAnimationFrame` の後に `fmg:generate-post-core` を一度 dispatch し、登録済み task を依存関係順（依存のない task 同士は登録順）に `await` する。組込み拡張の現在の順序は Economy → Nobility → Shipbuilding であり、Shipbuilding は明示的に Economy に依存する。

```
core world fullReplace / 初回描画
  → Map Ready: "Preparing extensions" + fmg:generate-post-core（動的拡張向け）
  → Economy: "Preparing economy"
  → Nobility: "Preparing nobility"
  → Shipbuilding: "Preparing shipyards"（Economy に依存）
  → fmg:map-ready-tasks-completed → 最終 drawLayers()
```

以下は、有効な拡張だけが行う初期化である。無効な拡張のデータは生成されない。

#### Economy: 市場・物資・初期資本

Economy task は前マップに紐づく voyage income、調達費、輸送キャッシュ等をクリアしてから、鉱物・開発可能性・Goods・Markets・採掘/製錬/採石/火山灰・造幣・軍需・交易警備・税率を生成する。続いて Food Ledger の bootstrap、最初の `Production.produceIncrementally()`、税の徴収、Guild chapter、宿屋を初期化する。

`Goods.generate()` が最初に配布するのは **セル上の産地情報**（good cell column）であり、キャラクターのインベントリではない。`Markets.generate()` は市場圏と空の市場レコードを作る。Good が市場に初めて入るときは、在庫 0・当該 Good の基準価値を価格として開始し、最初の Production pass が農村産出・Burg の生産を市場在庫へ反映する。したがって通常 Goods の「初期在庫」は主にこの pass の結果である。個々の商人・商会へ Good を直接配る処理はない。

Food Ledger をまだ持たない各 Market には、一度だけ次を seed する。

| 所有主体 | 初期値 | 資金・物資の由来と注意点 |
| :-- | :-- | :-- |
| Burg | `burg.treasury` = `population × 20`（未設定/0 の場合） | 都市行政・生産用の運転資金。既存の残高を上書きしない。 |
| Market | Food Ledger の Age0/Age1 に各年需要の 3 か月分（合計 6 か月分） | Market 圏の都市・農村人口から算出する穀物備蓄。Age2 は 0 で始まる。 |
| Market | `marketTreasury.balance` = 当該 Market の Burg treasury 合計の 50〜100% | 食料仕入れ等に使う市場の運転資金。**Burg treasury から控除して移すのではなく、新規に導出して seed する**。 |
| Market | `tradeWorkingCapital` = 同合計の 25〜80%、`tradeCapitalLocked` = 0 | 商会/市場の交易資本。これも Burg 残高とは別プールで、開始前から取引していたものとして生成する。 |
| Burg | `foodReserve` = 当該 Burg の 10 日分の食料需要 | Market の Food Ledger とは別の都市内備蓄。 |

`marketTreasury.balance` は staple food の農村仕入れに実際に使われ、不足は `ruralGrainPayable`（農村への未払）に積む。一方、一般 Goods の市場取引は現時点では完全な Market 現金決済ではない。したがって、Market の `revenue` や Burg の `treasury` を「商人個人の財布」と解釈してはならない。会計境界の詳細は [economy-market-accounting-audit.md](simulation/economy-market-accounting-audit.md) を参照する。

#### Economy と Characters: 商人・商会・キャラクターの資産

`Markets.generate()` は各 Market ごとに、中心 Burg に紐付く **市場管理者 1 人**と**競合商人 2 人**を `pack.characters` に作成し、merchant role を与える。さらに Burg market ledger は同じ Market の管理者/競合商人を各 Burg の商人として参照し、各 Market に 1 つの major Merchant Organization（表示名は `… Company`）を同期する。管理者はその商会の chairperson になる。

ここで重要なのは、商会は独立した Good inventory や `treasury` フィールドを持たない点である。物資は Market、食料・市場運転資金は `marketTreasury`、都市の資金は `burg.treasury` に所属する。商会・商人 ledger の `revenue` は売上配分を説明するための導出値であり、キャラクターの `wealth` や Market 在庫への直接配布ではない。

Nobility task は Economy の後に Characters roster、統治者、中央官職、部隊指揮官、属州領主、外交/諜報/戦略状態を生成する。経済側が先に作った merchant role を持つ人物は政治キャラクター再生成時に保持される。その後 `seedMissingCharacterWealth()` が、まだ `wealth === 0` の有給役職者だけに開始時の蓄財を設定する。これは既存残高からの振替ではなく、初回の Advance Time を待たずに支出可能にするための初期値である。

- 統治者・中央官職・部隊指揮官: State の人口税見込みと部門別の stipend 見込みを、ランダムな 6〜18 回分の back-pay として換算する。
- 属州領主: 着任 Burg の `burg.treasury` を基準に同じ back-pay を換算する。
- Guild master / apprentice: Guild treasury を基準に換算する。
- Market manager / rival merchant: `marketTreasury.balance` を基準に換算する。

この初期 `Character.wealth` の計算は、State / Burg / Guild / Market の残高を減額しない。また、既に `wealth > 0` の人物を上書きしない。以後のシミュレーションでは Market manager/rival の stipend は `marketTreasury.balance` から、Guild の stipend は Guild treasury から支払われる。

#### Shipbuilding: 国家造船向けの市場在庫 warm-up

Shipbuilding が有効な場合は Economy の後に候補港・港湾能力を再計算し、キューと完成 hull を reset する。その直後、国家所有 shipyard の需要に対して Economy へ初期在庫を要求する。Economy は対象 Market の Wood / Tar / Ropes / Sails 在庫を、国家の treasury・港数・地域バイオーム適性から算出した 90〜365 日相当（素材別補正あり）の目標まで**増やすだけ**である。

この warm-up は新規地図時のみで、treasury を支出せず、Caravan や Procurement Order も作らない。既に最初の Production pass が置いた在庫は減らさない。従ってこれは商会やキャラクターへの配布ではなく、造船を開始できるようにする Market 在庫の補完である。

#### 3.2.1 Preparing economy の応答性: yield 化と Trade route 生成スキップ（実装済み）

実測（2026-08-13, `docs/map-initialization-process.md` 執筆時点の live profiling）では、疎らな入植パターン・小規模マップでは `generateEconomy` 合計は 400〜550ms 程度だが、Standard 入植パターン・現実的な burg 数（375 burgs 規模）では **6 秒超**に達し、うち `Markets.runGlobalTrade()` + `Caravans.spawnFromDeals()`（Trade レイヤー/アニメーションが描画するデータ）だけで全体の 3 割前後、`planRetailReplenishment()`（小売補充計画、交易固有ではない）が単独で最大の割合を占めることが確認された。これを受けて、Worker 化（§3.3）とは別に、既存の `produceIncrementally()` の burg バッチ yield パターンを他の重い O(n) ループにも広げる形で対応した。

- **yield 化**: `Markets.runGlobalTradeIncrementally()`（good 単位でバッチ yield）、`Caravans.spawnFromDealsIncrementally()`（route bundle 単位）、`planRetailReplenishmentIncrementally()`（market 単位）を追加。共通の `runBatchedYielding()`（`src/extensions/economy/generators/incrementalBatching.ts`）を使い、`requestAnimationFrame` へ定期的に制御を返す。同期版（`runGlobalTrade()` / `spawnFromDeals()` / `planRetailReplenishment()` / `Production.produce()`）は Advance Time・「regenerate」コマンド・エディタ操作向けにそのまま残る — 呼び出し契約は変更していない。`Production.produceIncrementally()` は内部で `finishProductionCycleIncrementally()`（新設の private メソッド）を呼び、この 3 つの Incrementally 版を使う。
- **Trade route 生成スキップ**: Options > Generation タブに「Skip trade route generation」チェックボックス（`useUiPreferencesState.economySkipTradeOnGenerate`、`fmg-ui-preferences` に永続化）を追加。ON の場合、初回の Preparing economy task が `Markets.runGlobalTradeIncrementally()` / `Caravans.spawnFromDealsIncrementally()` を丸ごとスキップする（`Production.produceIncrementally({ skipGlobalTrade: true })`）。Burg↔Market のローカルな売買（`produceForBurg()` 内の `Markets.buy()`/`sell()`）や Deal は影響を受けず、スキップされるのは Market↔Market の広域交易マッチングと、それに伴う Caravan 生成（Trade レイヤー/アニメーションのデータ源）だけである。後から `Tools > Economy > Regenerate > Production`（`economy-regenerate-production`、内部的には同期版 `Production.produce()` を呼ぶ）で通常どおり再生成できる。

いずれも Map Ready task の orchestration レベル（`economy/index.tsx` の `run()` 内、および `Production.produceIncrementally()`/`finishProductionCycleIncrementally()`）での対応であり、§3.3 が想定する「Worker への computation 移譲」そのものではない — メインスレッド上のまま、より細かく `requestAnimationFrame` へ制御を返すだけである。数秒規模の重いマップで UI 応答性を改善する低リスクな緩和策として位置づけられ、§3.3 の Worker 化を不要にするものではない。

### 3.3 将来の `Preparing economy` Worker 化

> **設計予定。現時点では未実装。** §3.2.1 の yield 化により Preparing economy 実行中も `requestAnimationFrame` 単位でメインスレッドへ制御は戻るが、それでも全処理はメインスレッド上で行われる — 真に別スレッドで並行実行されるわけではない。現在の Economy task はメインスレッドで live の `WorldContext` / `SimulationContext` を直接更新する。特に `Production.produceIncrementally()` は UI を固めないよう burg batch ごとに `requestAnimationFrame` へ制御を返すが、Goods・Markets・鉱物/施設の初期化などは同期的である。Worker 化では、これらを単に `new Worker()` 内から既存 generator として呼び出してはならない。

目的は、コア地図が描画された後も UI 操作を受け付けたまま Economy 初期化を実行し、完了時だけ整合した経済状態を公開することである。そのため Worker は live context の共有所有者ではなく、**不変入力から結果を計算する data plane** とする。

```
main thread
  ├─ core world の revision / mapId を固定した EconomyInitializationInput を作成
  ├─ EconomyInitializationWorker へ structured clone で送信
  │     └─ Goods / Markets / production 初期状態などを Worker 所有のデータで計算
  ├─ progress message → MapReadyTaskContext.reportProgress()
  └─ result message を revision / runId / extension 有効状態で検証
         └─ 成功時だけ extension.command で EconomyInitializationResult を一括適用

Worker
  ├─ DOM、`window`、`ExtensionAPI`、Renderer を参照しない
  ├─ 明示された seed だけで乱数を生成する
  ├─ 途中進捗・完了・失敗・取消確認を message で返す
  └─ 新規作成した TypedArray buffer のみ transfer して結果を返す
```

#### 必須の対応

1. **Worker 境界の型を先に定義する。** `EconomyInitializationInput` には計算に必要な world snapshot、Economy slice、simulation 日付、明示的な乱数 seed、`mapId`、WorldRuntime revision、Map Ready の run ID を入れる。`EconomyInitializationResult` には goods、market territories / markets、鉱物・施設・Food Ledger・初回 production の結果、更新対象の Burg / State / Character、進捗可能な phase を含める。関数、D3 selection、class instance、DOM node、`ExtensionAPI` は payload に含めない。

2. **live 配列を Worker へ transfer しない。** `pack.cells` や `grid.cells` の既存 `ArrayBuffer` を transfer するとメインスレッド側が detach され、描画・pick・編集が壊れる。入力は structured clone または Worker 用コピーにし、結果側で新規に作った大きな `Uint16Array` / `Float32Array` だけを transfer する。`SharedArrayBuffer` の導入は、データ競合を防ぐ明示的な同期設計なしには使わない。

3. **経済 generator を純粋な計算と適用に分割する。** `Goods.generate()`、`Markets.generate()`、鉱物/施設生成、Food Ledger bootstrap、初回 Production を、`Readonly<EconomyInitializationInput> -> EconomyInitializationResult` の Worker 実装と、メインスレッドで結果を in-place 適用する adapter に分離する。現行の `economyContext` getter や `Math.random` のグローバル置換に依存する実装を Worker に持ち込まない。乱数は stage ごとのローカル PRNG を使用し、同じ seed で既存経路と同じ結果を再現できるようにする。

4. **結果の公開は原子的に行う。** Worker の途中結果を `worldContext` へ書き込まない。Worker 完了後に `extension.command`（例: `economy.applyInitializationResult`）で検証し、Economy slice・`pack` の該当フィールド・simulation slice を同一 commit で更新する。適用時も `pack` / `grid` の参照は差し替えず、既存の in-place mutation 規則に従う。これにより Renderer、Nobility、Shipbuilding が半端な市場・在庫を見ることを防ぐ。

5. **取消と stale result を扱う。** `cancelMapReadyTasks()`、再生成、Economy 無効化、map load は Worker job を abort/terminate し、run ID を無効化する。結果を受け取った側は `mapId`、WorldRuntime revision、Map Ready run ID、`api.isExtensionEnabled("economy")` を再確認し、一つでも異なれば結果を破棄する。Worker が停止を確認するまで待って古い結果を適用してはならない。

6. **依存順を維持する。** Economy Worker の結果を commit し、`Markets`・merchant character・Food Ledger・最初の市場在庫が一貫した後に初めて `nobility.initialization` を開始する。Nobility の初期 `Character.wealth` は Market / Burg / Guild の初期残高を参照するためである。Shipbuilding はさらに Economy 完了後の Market 在庫を前提とし、今と同じく Economy task への `dependsOn` を保持する。

7. **UI と描画はメインスレッドに残す。** `MapReadyTaskContext.reportProgress()`、Zustand の進捗表示、SVG レイヤー操作、tooltip、WebGL render 要求、merchant hull snapshot、最終 `drawLayers()` は Worker から呼ばない。Worker の message を受けた Economy task がこれらを実行し、commit 後に `api.requestWebglRender()` を要求する。

8. **失敗時の安全な挙動を定める。** Worker 起動不能・message の検証失敗・計算例外時は、部分結果を適用せず task を失敗として扱う。対応ブラウザが Worker を作れない場合だけ、同じ pure data-plane を非同期 in-process adapter で実行する。この fallback も途中適用を禁止し、UI を占有しない batch/yield 方針を持つ。

#### 検証項目

- 同一 seed・同一入力で、Worker と in-process fallback の `EconomyInitializationResult` が一致すること。
- 実行中の再生成、拡張無効化、保存地図ロードで stale result が一切適用されないこと。
- Economy commit 前に Nobility / Shipbuilding が開始されず、commit 後には現在と同じ初期 wealth・Market 在庫・shipyard warm-up が得られること。
- 大規模地図でも Map Ready の progress UI、pan/zoom、キャンセル操作が応答し続けること。E2E では render mode を明示的に固定する。

### 3.4 道路・河川準備の回数と内容（2026-10-08 改修後）

以下は工程確認で戻る・再試行する操作のない **pipeline 1 周**の呼び出し回数である。途中から戻る場合は pipeline を先頭から再実行するため、既に通った工程の回数は増える。描画、拡張、プレビューによる追加の問い合わせは含まない。

| 処理 | standard | standard 以外 | 内容 |
| :-- | --: | --: | :-- |
| `Rivers.generate()` | 1 | 1 | 気候・地形から世界の河川を生成する。 |
| `Burgs.shiftAsync()` | 2 | 2 | 河岸・海岸への都市位置調整、water access 更新。 |
| `Routes.generate()` | 1 | 2 | 陸路・航路生成、横断調整、通航検証。非 standard の初回は国家生成前、2 回目は国家・都市位置確定後。 |
| `ensureConvergingWorldRiverRoads()` | 2 | 3 | 各道路生成内で 1 回、Finish the world の最後で 1 回。横断判定へ準備結果を渡すため、内部での再確認は省く。 |
| `resolveRiverRouteCrossings()` | 1〜2 | 2〜3 | 各道路生成内で 1 回、最後の準備結果に changedRoutes があれば 1 回追加。 |
| `Rivers.specify()` | 1 | 1 | parent / basin / name / type を設定。これらだけの変更は収束キャッシュを無効化しない。 |

都市配置、道路収束、CE の canonical water 抽出は `settlementGeometrySession(world)` を通して **pack ごとに同じ session** を使う。各境界で入力を確認するが、地形索引と河川索引は別々に更新し、変更のない河川の幾何・断面キャッシュを保持する。人口・橋技術の変更は横断の再評価を必要とするが、それだけでは河川形状を再構築しない。

```
Routes.generate():
  sync() → createRoutesData()
  → prepared = ensureConvergingWorldRiverRoads()
  → buildLinks() → resolveRiverRouteCrossings(world, prepared)
  → 河川貨物船・外洋船の navigation graph 構築
  → 横断不能・通航不能 route を除去 → buildLinks()
  → [landConnectionGeneration] 登録陸路を生成・置換 → buildLinks()

Finish the world の末尾:
  prepared = ensureConvergingWorldRiverRoads()（上記の除去・都市詳細・季節更新後）
  → [prepared.changedRoutes がある] resolveRiverRouteCrossings(world, prepared)
  → 世界を commit
```

収束準備は、入力不一致時に元の道路点列を復元し、沿岸道路を調整、地形・河川索引と都市近傍の道路脚を準備して、橋候補・渡し・迂回を検証し、道路点列・リンク・都市別横断施設を確定する。橋の角度判定は `bridgeSkewPolicy.ts` の時代・国家技術の制約を使う。

**生成完了時点で、最終入力に対する CE 用準備が存在する。** 改修前は `pack.rivers` 全体を比較していたため `Rivers.specify()` の名称等で無効化していたが、現在は形状・横断水深等の依存値だけを比較する。道路除去、`Burgs.specify()` の人口確定、季節による水深更新などの必要な再評価は、最後の準備で完了させる。生成後の編集・拡張・シミュレーションが依存値を変えた場合は改めて準備する。

`landConnectionGeneration` 有効時、通常の収束サービスはキー確認後に空の準備結果を返す。登録陸路は `generateWorldLandConnections()` が担うため、通常経路の全体再構築回数をこのモードに適用しない。

上表は **呼び出し回数**であり、再構築回数ではない。入力が変わらなければ、最後の ensure も既存結果を返す。

---

## 4. ホスト SVG レイヤーと DOM 順

`createViewLayers()` は起動時に一度だけホスト所有の `<g>` を作り、`Object.assign(viewContext, ...)` で参照を保存する。さらに `#map` の直前に `#webglMapCanvas` を作成または再取得する。拡張所有レイヤーはここでは作らない。

SVG は後に追加された兄弟要素ほど前面になる。以下は `#viewbox` 内の標準 DOM 順であり、`▼` が背景、`▲` が前景である。

```
#map
  ├─ #deftemp (defs)
  ├─ #viewbox
  │    ▼
  │    ├─ #ocean
  │    │    ├─ #oceanLayers
  │    │    └─ #oceanPattern
  │    ├─ #enclosure                 display:none
  │    ├─ #landmass
  │    ├─ #texture
  │    ├─ #lakes                     display:none
  │    │    ├─ #freshwater / #salt / #sinkhole
  │    │    └─ #frozen / #lava / #dry
  │    ├─ #biomes
  │    ├─ #coastalHabitats           display:none
  │    ├─ #terrs
  │    │    ├─ #oceanHeights
  │    │    └─ #landHeights
  │    ├─ #danger                    display:none
  │    ├─ #underground               display:none
  │    ├─ #population
  │    │    ├─ #rural
  │    │    └─ #urban
  │    ├─ #cells
  │    ├─ #gridOverlay
  │    ├─ #coordinates
  │    ├─ #compass                   display:none
  │    ├─ #rivers
  │    ├─ #terrain
  │    ├─ #relig
  │    ├─ #cults
  │    ├─ #regions
  │    │    ├─ #statesBody
  │    │    └─ #statesHalo
  │    ├─ #provs
  │    ├─ #zones
  │    ├─ #borders
  │    │    ├─ #stateBorders
  │    │    └─ #provinceBorders
  │    ├─ #temperature
  │    ├─ #coastline
  │    │    ├─ #sea_island
  │    │    └─ #lake_island
  │    ├─ #routes
  │    │    └─ #roads / #trails / #searoutes / #railways
  │    ├─ #ice
  │    ├─ #prec                     display:none
  │    ├─ #emblems                  display:none
  │    │    ├─ #burgEmblems / #provinceEmblems / #stateEmblems
  │    ├─ #icons
  │    │    ├─ #burgIcons
  │    │    └─ #anchors
  │    ├─ #labels
  │    │    ├─ #states / #addedLabels / #burgLabels
  │    ├─ #combatDeaths             display:none（#armies の直下）
  │    ├─ #armies
  │    ├─ #markers
  │    ├─ #frontierForts
  │    ├─ #fogging-cont
  │    │    └─ #fogging             display:none
  │    ├─ #ruler                    display:none
  │    └─ #debug
  │    ▲
  ├─ #scaleBar                      viewbox 外
  ├─ #legend                        viewbox 外
  └─ #calendar                      viewbox 外
```

`populateSizeRects()` は `graphWidth` / `graphHeight` が設定された後に、`#landmass`、`#oceanPattern`、`#oceanLayers` の背景 `<rect>` を追加する。

`#scaleBar`、`#legend`、`#calendar` は `#viewbox` の外にあり、地図の pan/zoom とは独立した画面固定の SVG 要素である。

---

## 5. 描画経路

### `drawLayers()` の分岐

現在の `viewContext` 実装では初期 render mode は `svg`。`localStorage["fmg-render-mode"]` が `webglHybrid` で、かつ WebGL2 が利用できる場合だけ起動時にハイブリッドを選ぶ。描画は次のように分岐する。

```
drawLayers()
  ├─ renderMode === "webglHybrid" かつ DeckGlRenderer.render() が成功
  │    └─ drawHybridSvgOverlays()
  │         ├─ Features / lakes
  │         ├─ state labels、routes
  │         ├─ texture、relief、coordinates、compass
  │         ├─ 拡張の draw hooks
  │         └─ rulers
  │
  └─ それ以外
       ├─ DeckGlRenderer.clear()
       └─ paintSvgMapLayers()
```

SVG 経路の `paintSvgMapLayers()` は以下の順に renderer を呼ぶ。個々の項目は対応する layer toggle が ON の場合だけ描画する（Features / LavaFlows / lakes 同期を除く）。視覚的な前後関係は呼び出し順ではなく §4 の DOM 順で決まる。

```
Features → LavaFlows → Texture → Heightmap → Biomes → CoastalHabitats → Cells → Grid → Coordinates → Compass
→ Rivers → Relief → Religions → Cultures → States → Provinces → Zones → Borders
→ Routes → Temperature → Population → Ice → Precipitation → Danger → Underground → CombatDeaths
→ Enclosure → Labels → Burg icons → Military → Markers → Frontier forts
→ extension draw hooks → Rulers
```

ハイブリッドでは deck.gl canvas が WebGL 管理対象（地形、政治区分、burg icon、軍隊など）を描く。SVG 側は CSS クラスで対応する標準レイヤーを隠し、state label、texture、relief、coordinates、compass、scale bar、calendar、legend、ruler、debug、fogging などの SVG オーバーレイを残す。`#webglMapCanvas` は `#map` の直前に置かれるため、残る SVG オーバーレイが canvas の上に表示される。

### WorldRuntime commit からの再描画

`initRenderCoordinator()` は `worldRuntime.subscribe()` を登録する。複数 commit は `requestAnimationFrame` 単位でまとめられ、full replace では次を行う。

1. 保存された presentation（スタイル、レイヤー状態・順序）を SVG と store に反映する。
2. land topology の投影処理を予約する。
3. `viewContext.renderMap` が true なら `drawLayers()` を呼ぶ。
4. エディタを更新する。

そのため初回生成では、`generateMapOnLoad()` がプリセットを適用して即時に `drawLayers()` を呼ぶ経路に加え、生成 commit を受けたコーディネータの全体描画も予約される。

---

## 6. 拡張所有レイヤー

拡張は `api.addLayers()` に `SvgLayerSpec` を渡す。`buildExtensionAPI()` が `#viewbox` の既存要素を再取得するか、`insertBefore` / `insertAfter` に従って `<g>` を追加する。これらは `ViewContext` のメンバーではなく、拡張は `api.getSvgLayer(id)` で取得する。

| 拡張 | レイヤー | 配置 |
| :-- | :-- | :-- |
| Economy | `#goods` | `#icons` の前、初期状態は非表示 |
| Economy | `#marketsLayerFill`, `#marketsLayer` | `#icons` の前、初期状態は非表示 |
| Economy | `#tradeAnimation` | `#marketsLayer` の直後 |
| Shipbuilding | `#shipyards` | `#icons` の前、初期状態は非表示 |

`registerDrawLayerHook()` のフックは `paintSvgMapLayers()` と `drawHybridSvgOverlays()` の終盤に実行される。また、extension に関わる simulation commit は RenderCoordinator が `runDrawLayerHooks()` を通して再描画する。

---

## 7. 保存地図のロードとレイヤー再取得

### 7.1 `.fmg` アーカイブのデータ準備

`uploadMap()` はヘッダーで形式を判別する。chunked `.fmg` の `loadChunkedWorldArchive()` は以下を行う。旧形式の SVG 復元経路とは区別する。

```
decodeAndValidateWorldArchive() → 進行中の生成の終了を待つ
→ world.replace（検証済み world / simulation / presentation を適用）
→ OceanLayers()
→ refreshAllRiverHydrology() → updateAllBurgWaterAccess()
→ [seaRouteGenerationMode が保存され、登録陸路アーカイブではない]
    regenerateLoadedRoutes() → Routes.generate()（locked route は保持）
→ UI options 同期
→ [landConnectionGeneration] 登録陸路の現状確認・リンク再構築
→ ensureConvergingWorldRiverRoads()
→ [changedRoutes がある] buildLinks() → resolveRiverRouteCrossings(world, converged)（準備結果を再利用）
→ character race 移行 → callback / Map Ready task を利用可能にする
→ world-loaded / render-mode-changed / refresh-editors イベント
```

道路再生成の条件を満たす通常経路では `Routes.generate()` が 1 回、ensure はその内部 1 回と最後の 1 回で **2 回**。道路を保存時のまま維持する経路では最後の ensure が **1 回**。横断判定には準備結果を渡すので追加の ensure は行わない。最後の ensure は道路生成後の route 除去による変更も検出する。これらの回数はキャッシュ確認を含み、全体再構築回数とは異なる。

収束結果・河川索引の `WeakMap` キャッシュはランタイム内のもので、ファイルに保存されない。route に保存された `riverRoadConvergence` の元点列等と、メモリー上の都市別施設・索引キャッシュは別物である。したがって、ファイルを読み込む別セッションでは準備が必要になる。

### 7.2 旧形式の SVG 復元

旧形式では世界データを `world.replace` として検証・commit した後に、`applyLegacyMapView()` が view 専用の復元を行う。

```
applyLegacyMapView()
  ├─ DeckGlRenderer.finalize()
  ├─ 旧 #map を削除し、保存済み SVG を DOM に挿入
  ├─ dispatchEvent("fmg:reinitialize-map-layers")
  │    └─ reinitializeMapLayers()
  │         └─ bindViewLayersFromSvg(#map)
  │              ├─ #webglMapCanvas を再取得または作成
  │              ├─ host SVG レイヤーを再選択して viewContext を in-place 更新
  │              ├─ 古い保存にない calendar / enclosure / combatDeaths / frontierForts を補う
  │              ├─ 旧 #markets を #marketsLayer に移行
  │              └─ dispatchEvent("fmg:map-layers-reinitialized")
  ├─ style / activeLayers / presentation を保存 SVG から復元
  ├─ view のイベントを付け直す
  ├─ focus・zoom・active zoom を復元
  └─ [webglHybrid] fmg:render-mode-changed を発火して canvas を再描画
```

`fmg:map-layers-reinitialized` を受けた Extension API は、登録済みの `SvgLayerSpec` を再取得または作成してから、拡張の `registerMapReinitHook()` を実行する。拡張はこの API を使い、ホストイベントを直接購読してレイヤー参照を取り直してはならない。

`bindViewLayersFromSvg()` は offscreen export のためにも使われる。この場合は `updateWebglCanvas: false` と `dispatchReinit: false` を指定し、実行中の canvas と拡張の live reinit hook を変更しない。

---

## 8. FMG → CE 連携: 1 回目と 2 回目

ここでの「2 回目」は、**同じ FMG タブ・同じ世界で、連携の間に地図や設定を変更せず**、同じ都市または別の都市を新しい CE タブへ開く場合である。FMG の再ロード、別タブ、新しい CLI 実行には、このキャッシュ再利用条件を適用しない。都市プレビューや RE 連携も descriptor を取得するため、CE を初めて開く前に既にキャッシュが準備されている場合がある。

### 8.1 FMG 側の処理工程

右クリックからの `openCityEditorForBurg()` は次を同期実行してから CE を開く。

```
stashCitySite(burgId)
  → getBurgSiteDescriptor(burgId)
      → prepared = ensureConvergingWorldRiverRoads()   全体確認は 1 回
      → 人口・局所座標・water access・river frontage・frame 算出
      → convergedBurgCrossings(..., prepared)          準備済み施設から抽出
      → [横断データがない] canonicalSiteWater()        共有 session で局所水面を抽出
      → 河川・海岸・地形・地域コンテキスト等の切り出し
      → collectRoadEntries(..., prepared)
          → convergedBurgFacilities(..., prepared)     同じ準備結果から抽出
          → 都市セルを含む route を選別
          → 対象 route のみ getRenderPoints()・frame との交差抽出
      → BurgSiteDescriptor を組み立てる
  → JSON.stringify() → sessionStorage["fmg.citySite"]
→ openURL("city-editor/")（同一 origin の新タブへ sessionStorage をコピー）
```

通常の有効な都市では ensure は **descriptor 1 回につき 1 回**。その結果を同じ同期処理内の横断・道路抽出へ渡す。以前の 3 回の全体確認を 1 回にした。準備結果の受け渡しは、その間に依存値を書き換えない同期処理内に限定する。

| 工程 | 1 回目の CE 連携 | 2 回目の CE 連携 |
| :-- | :-- | :-- |
| 全体の道路・河川収束準備 | 生成末尾または通常ロード末尾の準備結果を再利用。以後の変更・CLI cold では必要に応じて準備する。 | 前回以降依存値が変わらなければ再利用。河川名等の変更でも維持。 |
| 全体キー確認 | 1 回。現行の in-place 編集も検出する。 | 同じく 1 回。 |
| 河川 source・地形索引 | 共有 session を利用。source の照合は河川ごとの実際の形状入力で行う。 | 変更のない河川・地形の計算結果を維持。 |
| 都市別 descriptor | 局所データを新規抽出。道路の描画点生成は都市に接続する route のみ。 | 同じ都市でも再抽出。完成 descriptor のキャッシュは設けていない。 |
| JSON 保存・CE 起動 | 毎回実行。 | 毎回実行。 |

収束準備は `pack` ごとのキャッシュで、依存キーを海岸と道路・河川横断に分ける。海岸は seed・描画設定・港の固定辺・地形頂点・都市位置等、横断は距離単位・縮尺・人口係数・都市化・時代・橋技術・河川形状/流量/水深・陸地高さ・都市位置/人口/所属・国家の石造/木造の角度上限・route 点列/種別/航行区分/セル等を確認する。必要な変更を検出する一方、河川名・parent・basin・type はこの横断準備の依存値に含めない。descriptor の名称や下流情報は現在の world から毎回取得する。

`regionalRiverGeometry()` は meander・曲線生成 **より前**に、当該河川が参照する座標・流量・高さ・幅・縮尺・精度のキーを照合する。ヒットなら source 再生成も省略する。1 本の河川変更ではその河川の source を作り直し、共有空間索引を更新するが、他の河川の断面・局所水面キャッシュは保持する。地形の索引は別のキーを持つ。

### 8.2 CE 側の処理工程（初回・2 回目とも）

新規 CE タブは `incomingCity.ts` で受け取った descriptor を検証し、`shareFromDescriptor()` で seed・grid・size・生成設定を決める。`CityEditorPage.ts` が frame に合う grid document を作り、Complete City 生成を開始する。Worker が利用できる場合は `generationWorkerClient` 経由、利用できない場合はメインスレッドで同じ `generateCityOnDocument()` を使う。

```
受信 payload 検証・設定復元 → grid document 作成
→ Worker へ入力・設定・seed を送信（または同期 fallback）
→ generateCityOnDocument()
    → prepare → plan → apply-plan
    → 道路・区画の幾何調整 → 橋・門・城・寺院・横断検証
    → fabric・都市外道路・道路端・畑・墓地・water access
    → fitImportedHousing()（実際の住宅数を数え、occupancy を調整）
    → spawnHarborShips() → 固定横断の進入路調整
    → 成功時に再現 recipe・scene regions を設定
    → 失敗時は元入力から別の決定的 seed で再試行（上限あり）
→ 結果を CE の document に適用 → 描画・編集用索引等を更新
```

CE は渡された局所 descriptor を使い、FMG の全世界の道路・河川準備を呼ばない。FMG タブのメモリーキャッシュは新しい CE タブと共有されない。新規 CE タブを開く2回目も都市生成・住宅数調整・船配置・描画を行うため、FMG のキャッシュヒットは CE 自体の生成を省略しない。

### 8.3 計測 CLI とブラウザの違い

[CE パフォーマンス CLI](tools/ce-performance.md) の `.fmg` 準備は `housingReport.ts` の `loadArchiveWorld()` で decode/validate した world を取得し、simulation の burg 状態を bind する。**`uploadMap()` の hydrology 更新・道路再生成・最後の収束準備を経由しない。** そのため最初の descriptor の計測に全体準備が含まれ得る。ブラウザの保存地図読み込み完了後の CE 初回と同一の条件ではない。

1 回の CLI 実行では選択都市の descriptor を同じ準備プロセスで順次作る。`--repeat` は CE の生成入力を別プロセスで繰り返し生成する指定であり、同じ都市の FMG descriptor を再取得して「連携2回目」を測る指定ではない。別の CLI 実行は新しいキャッシュから始まる。

先の Feltashbrid（ID 27）の内訳計測で得た全体収束準備約 2.71 秒、descriptor 全体約 3.18 秒は、この CLI の cold な取得条件の値である。生成段階・通常ロード段階で何秒かかったか、ブラウザ2回目で何秒短縮するかをこの結果からは判断しない。

### 8.4 キャッシュ設計と再計算範囲

| 変更 | 河川幾何 | 地形索引 | 道路・横断準備 |
| :-- | :-- | :-- | :-- |
| 河川名・parent・basin・type | 維持 | 維持 | 維持（descriptor 表示・下流情報は更新） |
| 河川 1 本の座標・幅・参照セルの流量/高さ | 当該河川を再構築、他の河川を維持 | 頂点が同じなら維持 | 再評価 |
| 河川の横断水深のみ | 維持 | 維持 | 渡し・橋・通航条件を再評価 |
| 都市人口・国家の橋技術・道路点列 | 維持 | 維持 | 再評価 |
| 地形頂点・縮尺・単位 | 影響する形状入力を再評価 | 再構築 | 再評価 |
| pack の差し替え | 新しいキャッシュ | 新しい session | 新しいキャッシュ |

道路収束は道路点列を更新し、複数都市が同じ route を共有する。そのため現段階では、実際に道路・横断依存値が変わった場合の**都市ごとの収束計算は全体を再評価**する。河川幾何と断面は再利用するが、影響都市だけに絞る増分収束は未実装。孤立した都市単位で無条件に再利用すると、隣の都市で更新した同じ道路の点列と矛盾するためである。

更新番号だけによる定数時間の確認も未導入。現行の編集経路は配列・オブジェクトを直接変更するため、変更通知を通らない更新を見落とさないよう値を照合する。将来導入する場合は全 writer の通知と、共有 route を通じた影響範囲の伝播を先に整備する。

検証は名称変更後のキャッシュ維持、幅/流量/水深/道路/人口/時代等の変更検出、1 本変更時の他河川キャッシュ維持、幾何 source のヒット時の meander 省略、無関係な道路の描画点生成省略、橋・CE descriptor の既存テストを対象とする。

実ファイルによる比較は `temp/000.savdata/Conland 2026-10-08-06-04.fmg` の Feltashbrid（ID 27）を同一プロセスで cold → warm → 全河川の名称変更後の順に取得する。通常の生成・ロード完了後のブラウザ時間とは区別する。

2026-10-08 の単回比較（FMG descriptor の時間。CE 本体の生成は含まない）:

| 条件 | 改修前 | 改修後 |
| :-- | --: | --: |
| cold（CLI 相当の未準備 world） | 3,033.5 ms | 2,862.1 ms |
| warm（同じ都市の再取得） | 454.6 ms | 29.1 ms |
| 全河川の名称変更後 | 2,576.1 ms | 25.9 ms |

道路描画点生成は 426 本から 4 本になった。全条件で改修前後の descriptor JSON を比較し一致した。単回のため絶対時間には実行環境の揺らぎがある。cold の全体準備そのものは残り、通常の新規地図では生成末尾に実行する。測定結果は `temp/cache-audit-before.json` / `temp/cache-audit-final.json`、確認用スクリプトは `temp/audit-ce-cache.mjs`（いずれもローカル診断用）に保存。


---

## 9. デフォルトの Political preset

`political` プリセットは以下を ON にする。拡張レイヤーは含まれない。以下は組込みの既定値であり、保存されたカスタムプリセット・presentation は別途復元される。

- Borders
- Burg icons
- Labels
- Rivers
- Routes
- States

---

## 10. 関連ファイル

| ファイル | 役割 |
| :-- | :-- |
| [src/app.ts](../src/app.ts) | `initApp()`、公開 API、Extension API、拡張初期化の起点 |
| [src/main.ts](../src/main.ts) | 初回ロード判定、生成 pipeline、zoom・ホストイベント |
| [src/initViewLayers.ts](../src/initViewLayers.ts) | ホスト SVG レイヤーの作成・再取得・保存互換補完 |
| [src/runtime/worldRuntime.ts](../src/runtime/worldRuntime.ts) | staged generation、検証、fullReplace commit |
| [src/runtime/renderCoordinator.ts](../src/runtime/renderCoordinator.ts) | commit を描画・presentation 投影へ接続 |
| [src/runtime/mapReadyTaskCoordinator.ts](../src/runtime/mapReadyTaskCoordinator.ts) | コア描画後の拡張 task の順序・進捗・取消を管理 |
| [src/controllers/layers.ts](../src/controllers/layers.ts) | SVG / WebGL-hybrid の描画分岐、レイヤー・プリセット管理 |
| [src/renderers/webgl/hybridLayerPolicy.ts](../src/renderers/webgl/hybridLayerPolicy.ts) | ハイブリッド時に SVG へ適用する表示ポリシー |
| [src/extensions/index.ts](../src/extensions/index.ts) | 組込み・動的拡張の初期化順 |
| [src/extensions/economy/index.tsx](../src/extensions/economy/index.tsx) | Economy の Map Ready task、初期生産・市場・Food Ledger |
| [src/extensions/economy/generators/foodProduction.ts](../src/extensions/economy/generators/foodProduction.ts) | Burg/Market の初期資本と食料備蓄の seed |
| [src/extensions/economy/generators/characterStipends.ts](../src/extensions/economy/generators/characterStipends.ts) | 有給キャラクターの初期 wealth と継続 stipend |
| [src/extensions/nobility/index.tsx](../src/extensions/nobility/index.tsx) | Nobility の Map Ready task と政治キャラクター生成 |
| [src/generators/routes-generator.ts](../src/generators/routes-generator.ts) | 道路生成・収束・横断・通航検証の順序 |
| [src/services/convergingWorldRiverRoads.ts](../src/services/convergingWorldRiverRoads.ts) | 世界の道路・河川収束準備とキャッシュキー |
| [src/services/riverRouteCrossings.ts](../src/services/riverRouteCrossings.ts) | 道路・河川交差の計画 |
| [src/services/settlementGeometrySession.ts](../src/services/settlementGeometrySession.ts) | 都市配置と水面・地形の索引 session |
| [src/services/regionalRiverGeometry.ts](../src/services/regionalRiverGeometry.ts) | 河川別の幾何キャッシュと局所 query |
| [src/services/burgSiteDescriptor.ts](../src/services/burgSiteDescriptor.ts) | CE/RE 用の都市局所データ抽出 |
| [src/controllers/city-editor-handshake.ts](../src/controllers/city-editor-handshake.ts) | descriptor 保存と CE タブ起動 |
| [src/io/load.ts](../src/io/load.ts) | ブラウザ保存地図ロードと道路・河川の再準備 |
| [src/city-editor/io/incomingCity.ts](../src/city-editor/io/incomingCity.ts) | CE の受信・検証・生成設定変換 |
| [src/city-editor/ui/CityEditorPage.ts](../src/city-editor/ui/CityEditorPage.ts) | CE の grid・Worker・描画の制御 |
| [src/city-editor/core/generate.ts](../src/city-editor/core/generate.ts) | CE の都市生成と再試行 |
| [src/city-editor/core/housingReport.ts](../src/city-editor/core/housingReport.ts) | CLI のアーカイブ読み込み |
| [src/city-editor/core/cityGenerationPerformance.ts](../src/city-editor/core/cityGenerationPerformance.ts) | CLI の FMG 連携準備と CE 計測 |
