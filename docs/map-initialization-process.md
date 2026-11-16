# 地図初期化プロセス

> `src/app.ts` の `initApp()` を起点とする、現在の地図生成・表示・保存地図ロードの流れ。
> 最終確認: 2026-11-16（`src/app.ts`, `src/main.ts`, `src/initViewLayers.ts`, `src/runtime/worldRuntime.ts`, `src/runtime/mapReadyTaskCoordinator.ts`, `src/runtime/dualPortPlacementTask.ts`, `src/simulation/host.ts`, `src/simulation/masterReference.ts`, `src/simulation/loadedWorld.ts`, `src/extensions/index.ts`、組込み拡張の simulation 入口、道路・河川サービス、CE 連携）

この文書の「順序」は、特記がない限り同一の同期処理内での呼び出し順である。`initMain()`、スタイル読込、生成、動的拡張の読込には `await` があるため、起動全体は完全な直列処理ではない。

---

## 1. 起動フロー

`initApp()` は `drawMap` / `drawUI` を受け取る。既定値はいずれも `true` であり、通常のブラウザ起動では地図 SVG と React UI の両方を初期化する。

```
initApp({ container?, drawMap = true, drawUI = true })
  │
  ├─ connectSimulationEventsToDocument()
  ├─ installBrowserMasterReference() / installBrowserSimulationViewPort()
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
  │   ├─ registerMapFileInput()
  │   ├─ [drawMap] createViewLayers() / populateSizeRects()
  │   ├─ registerWorldRecalculateHandler()  ※ 工程確認中の再計算より前
  │   ├─ [hostname なし] サーバレス警告
  │   │  [それ以外] hideLoading() → await checkLoadParameters(drawMap) → §2
  │   ├─ 既定イベント、自動保存、共有マップサーバの監視、ツアー導線
  │   └─ 再生成、zoom、reGraph、レイヤー再初期化、simulation、render mode、
  │      map-ready 完了、resize 等のホストイベントを登録
  │
  ├─ initRenderCoordinator()
  │   └─ WorldRuntime の commit を描画・投影・WebGL 更新に接続
  ├─ installDebugSnapshotCapture()
  ├─ createSimulationHost()
  │   └─ dual-port-placement（Checking river and sea ports）を Map Ready task として登録
  │
  ├─ window.fmg を Object.freeze() して公開
  │   └─ world / view / simulation / actions / extensionAPI / lab
  │
  └─ await initExtensions()
      ├─ Economy → Characters → Nobility → Shipbuilding
      └─ IndexedDB の動的拡張
```

### 並行性に関する注意

- `initApp()` は `initMain(drawMap)` を `await` しない。`initMain()` は `checkLoadParameters()` を待つが、その待ちの間にレンダー・コーディネータの接続、`SimulationHost` の作成、`window.fmg` の組立て、組込み拡張の初期化が進む。
- `?seed=` の経路だけが `checkLoadParameters()` 内で `generateMapOnLoad()` を待つ。通常のランダム生成は `generateMapOnLoad()` を開始したあと、その Promise を待たない。`generateMapOnLoad()` 自身はまず `applyStyleOnLoad()` を待つ。
- したがって、起動図は「SVG レイヤー構築 → 生成開始 → 拡張初期化完了」のような単純な一列の保証ではない。組込み拡張は `init()` 時にレイヤー・Map Ready task・イベント処理を登録し、生成後のデータ初期化は Map Ready task として行われる。動的拡張だけが互換イベント `fmg:generate-post-core` を利用できる。
- `drawMap: false` では SVG レイヤー、通常レンダラー、地図描画を作らないが、世界データ生成、`window.fmg`、拡張初期化は実行できる。`startMapReadyTasks()` は `drawMap: true` の初回ロードでは呼ぶ。`generate()` と `regenerateMap()` は描画の有無と別に、生成成功後に呼ぶ。

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
  │    └─ 成功時に fitScopedMapToView()（州・小島スコープの表示範囲）
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
  │    ├─ cancelMapReadyTasks()
  │    ├─ await dispatchWorldGenerate(opts)
  │    │    └─ WorldRuntime.executeGenerate()
  │    │         ├─ 現在の WorldDocument を rollback 用にスナップショット
  │    │         ├─ await runGeneratePipeline({ seed, graph })
  │    │         ├─ 出力を検証
  │    │         └─ FULL_REPLACE_TOPICS を含む 1 回の fullReplace commit を publish
  │    │              └─ RenderCoordinator が次フレームで全体描画を予約 → §5
  │    ├─ [debug snapshot 有効時] 初期スナップショットを保存
  │    ├─ drawScaleBar() / drawCalendar() / showStatistics() / fitScopedMapToView()
  │    └─ 成功・失敗を返す（失敗時はエラーダイアログ等を処理）
  │         工程確認中の地図ロードは MapLoadRequestedError で pipeline を止め、
  │         生成前の snapshot に戻してからロード側が共有バッファを使う
  └─ [生成成功] void startMapReadyTasks()
```

生成中の `pack` / `grid` は既存オブジェクトを in-place で空にして再利用する。生成失敗または検証失敗時は `WorldRuntime` が生成前のスナップショットを戻し、commit は公開しない。

### `runGeneratePipeline()` の順序

```
prepareGenerationStage()
  ├─ setSeed() / applyGraphSize() / randomizeOptions()
  ├─ applyMapScope()（事前 grid が無いとき。州・小島スコープはキャンバスを縮める）
  ├─ options 同期（時代、火薬、入植、辺境、港、バイオーム、気候変動、
  │    農村生態、家畜、economyStartMode、貨幣スケール、鉄鉱床など）
  ├─ grid を再生成、または既存 grid.cells.h を破棄
  ├─ pack を空にする（Heightmap 生成より前）
  ├─ landUse を消し beginInitialLandUse()、frontier / wilderness、
  │    拡張・simulation の burg / state / military を reset
  └─ [renderMap] undraw()

getGenerationStages()（同じ SettlementGeometrySession を 2 回の shift で共有）
  1. Landscape outline
     await HeightmapGenerator.generate() → grid.cells.h
     → [River-Port Lab が有効] applyLabTerrain()
     → Features.markupGrid() → addLakesInDeepDepressions() → openNearSeaLakes()
     → reGraph() → Features.markupPack() → resetRulers()

  2. Climate and waterways
     [renderMap] OceanLayers() → defineMapSize() → calculateMapCoordinates()
     → calculateTemperatures() → generatePrecipitation()
     → OceanCurrents.generate() → Features.applyOceanCurrentEnclosure()
     → Rivers.generate() → LavaFlows.generate() → Biomes.define()
     → Features.defineGroups() → Ice.generate()

  3. Cultures and settlements
     入植オプションを live の Options から取り直す
     → Threats.generate() → rankCells() → generateSubsistenceCapacity()
     → [Fantasy] generateCaveSystems()（それ以外は空の地下領域）
     → Deep Worms を追加して danger を再計算
     → Cultures.generate() / expand() → seedDwarfHoldOikoumene()
     → [辺境かつ polity 間隔が dispersed] preferredFrontierStarts 算出
     → applyInitialSettlementPattern()
     → settlementFoundation にドワーフの山岳圏を入れる
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
     → Names.getMapName(false) → mapId が未設定なら Date.now() を設定
```

各工程・generator・描画の所要時間は [FMG 生成計測 CLI](tools/fmg-performance.md)（`npm run fmg:perf`）で計測する。

通常起動は `src/main.ts` の上記非同期 pipeline を使う。`src/generators/index.ts` の同期ヘルパー `generateWorld()` は別経路であり、その呼び出し順を通常の地図生成順として扱わない。

### 3.1 生成工程の確認ダイアログ

`renderMap` が有効で React UI コンテナがある通常の新規生成は、画面中央の `Build map` ダイアログで以下の 5 工程ごとに停止する。最初の `Landscape outline` では高さマップを SVG にプレビューするため、国家や都市を生成する前に海岸線を確認できる。停止中は工程に応じたレビューレイヤーを個別に描き直せる。

1. `Landscape outline` — grid / 高さマップ / 湖 / pack graph / feature
2. `Climate and waterways` — 気候、降水、河川、バイオーム、氷。バイオーム地域、高度指数、World Configurator、気候の再生成
3. `Cultures and settlements` — 脅威、文化、人口基盤、burg。文化変更の再適用
4. `Realms and routes` — 国家、道路、宗教、州、河川・湖の名称。領域変更の再適用
5. `Finish the world` — 軍隊、地点、zones、simulation、コア世界の確定・名称（拡張初期化は commit/初回描画後の §3.2）

最終工程の主ボタンは `Finish map`、それ以前は `Continue` である。`Generate entire map` は残りの停止を飛ばす。`Return to previous stage` は途中の可変 `pack` / `grid` を直接復元せず、現在のシードで必要な前段から再生成して指定工程で止まる。文化工程と領域工程の再適用、気候工程の再生成も同じ再実行である。これにより generator の in-place mutation と `WorldRuntime` の final fullReplace commit を両立する。`Generate another landscape` は第 1 工程でのみ表示され、新しい grid からやり直す。Options から同じレビュー中にシードを変えた場合は、そのシードで第 1 工程からやり直す。

工程中は `WorldRuntime` の staging 状態であり、すべての工程を完了するまで `mapId` と fullReplace commit は公開されない。生成失敗時は従来どおり生成前の rollback snapshot に戻る。レビュー中に保存地図を開くと pipeline は `MapLoadRequestedError` で終わり、同じ snapshot へ戻ったあとロードが共有バッファを使う。

コア pipeline 自体は拡張の経済・キャラクターデータを生成しない。成功後に `WorldRuntime` が `fullReplace` を publish し、通常の表示経路ではまずコア地図を描画する。その後の拡張初期化は §3.2 の Map Ready task が担う。

> 旧実装の説明と異なり、組込み拡張は `fmg:generate-post-core` を直接購読して初期化しない。このイベントは Map Ready task の開始時に発火し、動的拡張との互換用である。組込み拡張は進捗表示・取消・依存順を持つ task として実行される。

### 3.2 コア生成後: Map Ready task と初期資産の配布

`generate()`、`regenerateMap()`、`drawMap: true` の `generateMapOnLoad()` は、コア world の commit と初回描画後に `startMapReadyTasks()` を起動する。コーディネータは、最初の task を始める前に進捗を「Preparing extensions」とし、double `requestAnimationFrame` の後に `fmg:generate-post-core` を一度 dispatch する。登録済み task は依存を先に訪れる深さ優先で、依存のない task 同士は登録順に `await` する。各 task には `generation: true` が渡る。

現在の登録順と、そこから決まる全実行の順序は次のとおりである。

| 順 | id | 表示 | 宣言された依存 |
| --: | :-- | :-- | :-- |
| 1 | `dual-port-placement` | Checking river and sea ports | なし。`SimulationHost` が拡張より前に登録する |
| 2 | `economy.initialization` | Preparing economy | なし。`economy.personalCash` の依存として先に実行される |
| 3 | `nobility.initialization` | Preparing nobility | なし。同じく `personalCash` の依存 |
| 4 | `characters.roster` | Preparing organizations | なし。同じく `personalCash` の依存 |
| 5 | `economy.personalCash` | Preparing personal assets | Economy、Nobility、Characters roster |
| 6 | `shipbuilding.initialization` | Preparing shipyards | Economy のみ。登録が最後なので末尾になる |

`economy.personalCash` は Economy の simulation 登録中、`economy.initialization` より前に Map へ入る。全実行が personal cash から依存を辿るため、Nobility は Economy の後、Characters roster はその後になる。この順は宣言された一本の鎖ではなく、登録順と `dependsOn` の結果である。

```
core world fullReplace / 初回描画
  → "Preparing extensions" + fmg:generate-post-core（動的拡張向け）
  → Checking river and sea ports
  → Preparing economy
       ├─ [既定] master reference worker が同じ task 列を評価し、文書を置き換える → §3.3
       └─ [下記の条件] メインスレッドで経済手順を直接実行
  → Preparing nobility          … on-demand の buildWorldRoster()
  → Preparing organizations     … characters.roster の build
  → Preparing personal assets
  → Preparing shipyards         … reference に含まれていれば何もしない
  → fmg:map-ready-tasks-completed
       ├─ [未確定] initializeSettlementLandUse()
       ├─ [Economy 無効] refreshEstimatedSubsistenceCapacity()
       └─ [renderMap] drawLayers()
```

以下は、有効な拡張だけが行う初期化である。無効な拡張のデータは生成されない。既定の新規地図では、この経済手順はメインスレッドではなく §3.3 の worker 内で一度実行され、その結果の文書がメインの世界を置き換える。メインスレッドが同じ手順を直接実行するのは、Characters が無効、すでに市場・人物・個人現金がある、または `generation` ではない修復実行のときである。Characters が有効な新規生成で能力プリセットが `ck3e` と `dnd5e` のどちらでもないときは、worker へ進まず Economy task が失敗する。

#### Economy: 市場・物資・初期資本

Economy task は前マップの航海収入、戦略調達、配分スナップショット、公共事業、財政報告、交易アニメの経路キャッシュを消す。その後の順は、鉱床、ダム候補とダム台帳のクリア、堤防候補と堤防台帳のクリア、Goods、開発可能性、Markets、塩物流、陸上セルの動物資源、出生時の牧群、商船船体スナップショットの要求、鉱山・製錬・採石・火山灰・建設、開始時の備蓄、造幣、軍需、交易警備、海外関係、税率、Food Ledger、最初の `Production.produceIncrementally()`、年次の基礎雇用、暖房、森林ガラス室、税の徴収、冶金と月次精算、ギルド知識と新ギルドの運転資金、要塞熟練、プレイヤー商業、ギルド支部、宿屋、都市水道、広域水道、脅威討伐と護衛の仕事板である。Goods は開発可能性より前である。開発可能性が牛・羊・葡萄の需要を Goods から読むためである。

`settleStartProvisioning()` は、まだ時間を進めていない世界に一度だけ、住宅、塩、衣料と寝具（各 3 か月分）を置く。既存の在庫は減らさない。

`Goods.generate()` が最初に配布するのは **セル上の産地情報**（good cell column）であり、キャラクターのインベントリではない。`Markets.generate()` は市場圏と空の市場レコードを作る。Good が市場に初めて入るときは、在庫 0・当該 Good の基準価値を価格として開始し、最初の Production pass が農村産出・Burg の生産を市場在庫へ反映する。したがって通常 Goods の「初期在庫」は主にこの pass の結果である。個々の商人・商会へ Good を直接配る処理はない。

金額は `economyStartMode` のプロファイルに従う。新規地図の既定は `balanced` で、人口あたりの金額は地図の貨幣スケールを掛ける。`provisioned` は旧来の速い開始、`subsistence` は備蓄だけで運転資金がほとんど無い開始である。未設定の保存地図は `provisioned` として読む。Food Ledger をまだ持たない各 Market には、一度だけ次を seed する。表の倍率は `balanced` である。

| 所有主体 | 初期値（balanced） | 資金・物資の由来と注意点 |
| :-- | :-- | :-- |
| Burg | `burg.treasury` = `population × 15`（未設定/0 の場合） | 都市行政・生産用の運転資金。既存の残高を上書きしない。`provisioned` は × 20。 |
| State | `(rural + urban) × 8` | `defineTaxRates()` が税率未設定の国家に一度置く。`provisioned` は 0。 |
| Market | Age0 と Age1 は、それぞれ `max(都市の年需要の 3 か月, (収穫までの不足 + 輸出保留 3 か月) / 2)` | 都市人口と醸造用穀物から求める。単純な 6 か月固定ではない。Age2 は 0。輸出保留を引いた余りを staple の市場在庫にする。 |
| 農村世帯 | 陸上セルごとに、農村人口 × 穀物食の割合 × 1 年分 | Market 在庫とは別の世帯蔵。全 Market が未 seed のときだけ置き直す。 |
| 世帯現金 | 都市は `burg.population × 10`、農村は市場圏の人口ポイント × 10 | 都市は Burg 台帳、農村は Food Ledger。最初にその財布を参照したときに seed する。 |
| Market | `marketTreasury.balance` = 当該 Market の Burg treasury 合計の 100〜150% | 食料仕入れ等に使う市場の運転資金。**Burg treasury から控除して移すのではなく、新規に導出して seed する**。`provisioned` は 50〜100%。 |
| Market | `tradeWorkingCapital` = 同合計の 10〜30%、`tradeCapitalLocked` = 0 | 商会/市場の交易資本。これも Burg 残高とは別プールで、開始前から取引していたものとして生成する。`provisioned` は 25〜80%。 |
| Burg | `foodReserve` = 当該 Burg の 10 日分の食料需要 | Market の Food Ledger とは別の都市内備蓄。 |

`marketTreasury.balance` は staple food の農村仕入れに実際に使われ、不足は `ruralGrainPayable`（農村への未払）に積む。一方、一般 Goods の市場取引は現時点では完全な Market 現金決済ではない。したがって、Market の `revenue` や Burg の `treasury` を「商人個人の財布」と解釈してはならない。会計境界の詳細は [economy-market-accounting-audit.md](simulation/economy-market-accounting-audit.md) を参照する。

#### Economy と Characters: 組織台帳と人物

通常プレイは on-demand roster である。役職は人数として台帳にあり、個人の `Character` は必要になるまで作らない。人物の正本は `simulation.extensions.characters.characters` で、`pack.characters` は互換用である。

既定の新規生成では、この個人作成は §3.3 の worker の reference-evaluation の中だけで起きる。そのモードでは on-demand が外れ、`Markets.generate()` が各 Market に市場管理者 1 人と競合商人 2 人を作る。`ck3e`（既定の能力プリセット）では Nobility の `Characters.generate()` が統治者、中央官職、部隊指揮官、属州領主を作り、`seedMissingCharacterWealth()` が `wealth === 0` の有給役職だけに初期の蓄財を置く。back-pay は 4〜10 回分の固定 stipend で、国家・ギルド・市場の残高からは引かない。市場管理者と競合商人は作成時に同じ back-pay を受け、この後段では上書きしない。`dnd5e` ではこの政治人物の生成を行わない。

worker は終了時に、作った人物を `referenceGeneration` へ畳み、`extensions.characters.characters` を空にする。メインスレッドがその文書を採用したあと、残る task は次を行う。

- Nobility は reference-evaluation ではないので、個人を再生成せず `buildWorldRoster()` で国家・所領の役職を台帳へ入れる。
- Characters の `characters.roster` が同じ `buildWorldRoster()` をもう一度行い、都市・市場・商会・ギルドの組織と役職人数を入れる。市場は管理者 1 と商人 2、商会は頭・書記・護衛、在庫のあるギルドは親方 1 と徒弟 2、という人数である。
- Personal assets は reference があると、空の人物一覧に対する `synchronizePersonalCash()` だけで終わり、世帯現金から役職プールへ配る経路には入らない。reference が無いときだけ、各役職の 6 回分の stipend を希望額とし、その都市の世帯現金の 4 分の 1 を上限にプールへ分ける。公庫からは引かない。

商会は独立した Good inventory や `treasury` を持たない。物資は Market、食料と市場の運転資金は `marketTreasury`、都市の資金は `burg.treasury`、世帯の現金は Burg 台帳と Food Ledger に所属する。

#### Shipbuilding: 初期艦隊と市場在庫

既定の経路では、この task は worker の中で実行され、戻った reference の `tasks` に `shipbuilding.initialization` が含まれる。メインスレッドの同じ task はそのとき何もしない。

worker 内、または reference が無い直接実行では、候補港と港湾能力を計算し直し、キューと完成 hull を reset する。続いて港を持つ国家に時代別の初期 hull を置き、国家所有 shipyard の需要を Economy へ渡す。Economy は対象 Market の Wood / Tar / Ropes / Sails 在庫を、国家の treasury・港数・地域バイオーム適性から算出した 90〜365 日相当（素材別補正あり）の目標まで**増やすだけ**である。

この在庫の補完は新規地図時のみで、treasury を支出せず、Caravan や Procurement Order も作らない。既に最初の Production pass が置いた在庫は減らさない。

#### 3.2.1 Preparing economy の応答性: yield 化と Trade route 生成スキップ（実装済み）

実測（2026-08-13）では、疎らな入植パターン・小規模マップでは `generateEconomy` 合計は 400〜550ms 程度だが、Standard 入植パターン・現実的な burg 数（375 burgs 規模）では **6 秒超**に達し、うち `Markets.runGlobalTrade()` + `Caravans.spawnFromDeals()`（Trade レイヤー/アニメーションが描画するデータ）だけで全体の 3 割前後、`planRetailReplenishment()`（小売補充計画、交易固有ではない）が単独で最大の割合を占めることが確認された。これを受けて、`produceIncrementally()` の burg バッチ yield を他の重いループにも広げた。2026-11-16 時点でもこの yield と交易スキップは残っている。既定の新規地図では、それらを呼ぶ経済手順そのものが §3.3 の worker 内で動く。

- **yield 化**: `Markets.runGlobalTradeIncrementally()`（good 単位でバッチ yield）、`Caravans.spawnFromDealsIncrementally()`（route bundle 単位）、`planRetailReplenishmentIncrementally()`（market 単位）を追加。共通の `runBatchedYielding()`（`src/extensions/economy/generators/incrementalBatching.ts`）を使い、`requestAnimationFrame` へ定期的に制御を返す。同期版（`runGlobalTrade()` / `spawnFromDeals()` / `planRetailReplenishment()` / `Production.produce()`）は Advance Time・「regenerate」コマンド・エディタ操作向けにそのまま残る — 呼び出し契約は変更していない。`Production.produceIncrementally()` は内部で `finishProductionCycleIncrementally()`（新設の private メソッド）を呼び、この 3 つの Incrementally 版を使う。
- **Trade route 生成スキップ**: Options > Generation タブに「Skip trade route generation」チェックボックス（`useUiPreferencesState.economySkipTradeOnGenerate`、`fmg-ui-preferences` に永続化）を追加。ON の場合、初回の Preparing economy task が `Markets.runGlobalTradeIncrementally()` / `Caravans.spawnFromDealsIncrementally()` を丸ごとスキップする（`Production.produceIncrementally({ skipGlobalTrade: true })`）。Burg↔Market のローカルな売買（`produceForBurg()` 内の `Markets.buy()`/`sell()`）や Deal は影響を受けず、スキップされるのは Market↔Market の広域交易マッチングと、それに伴う Caravan 生成（Trade レイヤー/アニメーションのデータ源）だけである。後から `Tools > Economy > Regenerate > Production`（`economy-regenerate-production`、内部的には同期版 `Production.produce()` を呼ぶ）で通常どおり再生成できる。

yield は `Production.produceIncrementally()` の中に残る。既定の新規地図ではこの関数は §3.3 の worker の中で動く。メインスレッドが同じ手順を直接実行するときだけ、`requestAnimationFrame` へ制御を返すことで UI を空ける。同期版（`runGlobalTrade()` / `spawnFromDeals()` / `planRetailReplenishment()` / `Production.produce()`）は Advance Time・「regenerate」コマンド・エディタ操作向けに残る。

### 3.3 既定の新規生成: master reference worker

既定（Characters が有効、能力プリセットが `ck3e` または `dnd5e`、市場も人物も個人現金もまだ無い、`generation: true`）では、メインスレッドの Preparing economy は経済手順を自分で実行しない。`prepareMasterReference()` がコア世界の `WorldDocument` を worker へ渡し、戻った文書で live の世界を置き換える。置き換えのあと `Goods.sync()` と `Markets.sync()` を行い、Economy task は終わる。既定の能力プリセットは `ck3e` である。それ以外の組込みプリセットは `dnd5e` だけで、どちらでもない新規生成はここで失敗する。

```
main（Preparing economy）
  ├─ 港の再配置が済んだ現在の WorldDocument を送る
  ├─ progress message を Map Ready の進捗にする
  ├─ 取消されていれば結果を採用しない
  └─ 検証済みの文書を restoreRollbackDocument() で置き換える

worker（masterReferenceWorker.ts）
  ├─ reference-evaluation を立て、独自の SimulationHost で組込み拡張を登録する
  ├─ 送られた文書を復元し、Options と UI 設定をコピーする
  ├─ 登録済み Map Ready task を依存順に実行する
  │    Economy の手順、ck3e の人物生成、初期艦隊、港の再確認を含む
  │    characters.roster は reference-evaluation 中は何もしない
  ├─ 作った人物を referenceGeneration に保存し、人物配列を空にする
  └─ 完成した WorldDocument を返す
```

worker は入力のコピー上で既存の generator を実行する。経済だけの純粋な入出力型には分割していない。メインスレッドは worker の途中状態を見ない。完了した文書を一度に採用する。取消は worker を terminate し、その結果は戻っても採用しない。

置き換えのあと、メインスレッドは Nobility、組織台帳、個人資産、造船の task を続ける。造船は reference の task 一覧に自分があれば省略する。港の再配置は、worker へ渡す前にメインで一度走り、worker の中でもう一度走る。採用されるのは worker の結果である。

以前に書いた `EconomyInitializationInput` / `EconomyInitializationResult` の data-plane worker は実装していない。

### 3.4 道路・河川準備の回数と内容（2026-10-08 改修後）

以下は工程確認で戻る・再試行する操作のない **pipeline 1 周**の呼び出し回数である。2026-11-16 に `getGenerationStages()` と `Routes.generate()` を再確認し、回数は変わっていない。途中から戻る場合は pipeline を先頭から再実行するため、既に通った工程の回数は増える。描画、拡張、プレビューによる追加の問い合わせは含まない。Map Ready の港再配置は、この表の生成中の回数には入らない。

| 処理 | standard | standard 以外 | 内容 |
| :-- | --: | --: | :-- |
| `Rivers.generate()` | 1 | 1 | 気候・地形から世界の河川を生成する。 |
| `Burgs.shiftAsync()` | 2 | 2 | 河岸・海岸への都市位置調整、water access 更新。 |
| `Routes.generate()` | 1 | 2 | 陸路・航路生成、横断調整、通航検証。非 standard の初回は国家生成前、2 回目は国家・都市位置確定後。 |
| `ensureConvergingWorldRiverRoads()` | 0 | 0 | 地図生成では呼ばない。CE への受け渡し（`getBurgSiteDescriptor`）で必要になった時に初めて行う（§8）。 |
| `resolveRiverRouteCrossings()` | 1 | 2 | 各道路生成内で 1 回。収束なし（`NO_RIVER_ROAD_CONVERGENCE`）で、描画される道路と河川の交点から横断計画を作る。 |
| `Rivers.specify()` | 1 | 1 | parent / basin / name / type を設定。これらだけの変更は収束キャッシュを無効化しない。 |

都市配置、道路収束、CE の canonical water 抽出は `settlementGeometrySession(world)` を通して **pack ごとに同じ session** を使う。各境界で入力を確認するが、地形索引と河川索引は別々に更新し、変更のない河川の幾何・断面キャッシュを保持する。人口・橋技術の変更は横断の再評価を必要とするが、それだけでは河川形状を再構築しない。

```
Routes.generate():
  sync() → createRoutesData()
  → buildLinks() → resolveRiverRouteCrossings(world, NO_RIVER_ROAD_CONVERGENCE)
  → 河川貨物船・外洋船の navigation graph 構築
  → 横断不能・通航不能 route を除去 → buildLinks()
  → [landConnectionGeneration] 登録陸路を生成・置換 → buildLinks()

CE への受け渡し（getBurgSiteDescriptor）で初めて:
  prepared = ensureConvergingWorldRiverRoads()（世界全体、pack ごとにキャッシュ）
  → [新しく準備し changedRoutes がある] 現在の呼び出しの後（microtask）で
      resolveRiverRouteCrossings(world, prepared) → map.networks commit（道路を再描画）
```

収束準備は、入力不一致時に元の道路点列を復元し、沿岸道路を調整、地形・河川索引と都市近傍の道路脚を準備して、橋候補・渡し・迂回を検証し、道路点列・リンク・都市別横断施設を確定する。橋の角度判定は `bridgeSkewPolicy.ts` の時代・国家技術の制約を使う。

**収束は地図生成から外した（2026-10-09）。** 収束は CE 用の共有橋位置を決めるもので、FMG の地図にはほぼ影響しない。

- どの道路を残すかには効いていなかった。10 seed で、収束がなければ除去されたはずの道路は 0 本だった。
- FMG の道路の変位は、ズーム 1 で中央値 0.05〜0.09 px、最大 0.3 px だった。
- 一方で費用は大きかった。道路生成内で約 0.43 秒（`Routes.generate` の 94%）、初回描画後に約 0.32 秒かかっていた。

そのため、CE 連携で初めて必要になった時に、世界全体を一度だけ準備する。都市ごとに分けないのは、複数の都市が同じ道路を共有し、都市番号順の逐次処理の結果が前の都市の書き換えに依存するためである。開いた順で結果が変わらないようにしている。

初回の CE 連携の費用は約 0.45〜0.55 秒、2 回目以降の descriptor は約 6 ms（2026-10-09、seed 200000002 / 1001）。変更前と比べると、同じ seed の地図は道路点列の違いが後続工程へ波及して変わる（指紋は rivers / population / burgs / routes 等が changed）。ただし道路の本数は同じだった。

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
  │         ├─ Features / LavaFlows / lakes の表示同期
  │         ├─ labels（state と burg。burg は hybrid 方針で隠す）、routes
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
→ Enclosure → Labels → Burg icons → Military → Diplomacy badges → Markers → Frontier forts
→ extension draw hooks → Rulers
```

ハイブリッドでは deck.gl canvas が WebGL 管理対象（地形、政治区分、burg icon、軍隊など）を描く。SVG 側は CSS クラスで対応する標準レイヤーを隠し、state label、texture、relief、coordinates、compass、scale bar、calendar、legend、ruler、debug、fogging などの SVG オーバーレイを残す。氷と河川の編集用オーバーレイは `#debug` にあり、隠した `#ice` と `#rivers` の SVG 写しは hybrid では維持しない。`#webglMapCanvas` は `#map` の直前に置かれるため、残る SVG オーバーレイが canvas の上に表示される。

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
| Economy | `#mineralDeposits` | `#icons` の前、初期状態は非表示 |
| Economy | `#dams`, `#levees` | `#icons` の前、初期状態は非表示 |
| Economy | `#waterSupply` | `#rivers` の直後、初期状態は非表示 |
| Economy | `#sewerage` | `#waterSupply` の直後、初期状態は非表示 |
| Economy | `#powerGrid` | `#sewerage` の直後、初期状態は非表示 |
| Shipbuilding | `#shipyards` | `#icons` の前、初期状態は非表示 |

`registerDrawLayerHook()` のフックは `paintSvgMapLayers()` と `drawHybridSvgOverlays()` の終盤に実行される。また、extension に関わる simulation commit は RenderCoordinator が `runDrawLayerHooks()` を通して再描画する。

---

## 7. 保存地図のロードとレイヤー再取得

### 7.1 `.fmg` アーカイブのデータ準備

`uploadMap()` はヘッダーで形式を判別する。chunked `.fmg` の `loadChunkedWorldArchive()` は以下を行う。旧形式の SVG 復元経路とは区別する。

```
decodeAndValidateWorldArchive()
→ applyLoadTimeline()（続きから読むか、設定に従って新しい時間線にする）
→ 進行中の生成が終わるまで待つ
    レビュー中なら loadMap() で pipeline を止め、rollback のあと共有バッファを使う
→ world.replace（検証済み world / simulation / presentation を適用）
→ OceanLayers()
→ normalizeLoadedWorld()
    ├─ refreshAllRiverHydrology() → updateAllBurgWaterAccess()
    ├─ 湖セルを繰り返す河川を直し、置けなかった河川都市を再配置
    ├─ [seaRouteGenerationMode があり、登録陸路アーカイブではなく、
    │    routes の load repair が未適用]
    │     regenerateLoadedRoutes() → Routes.generate()（locked route は保持）
    ├─ UI options 同期、グラフ矩形の resize、画面へ fit
    ├─ [landConnectionGeneration] 登録陸路のリンク再構築
    └─ race が Unknown の人物を、文化の race または Human にする
→ （収束準備は行わない。保存済み route の点列をそのまま使い、CE 連携で必要になれば準備する）
→ [「skip map-ready tasks」でなければ] markMapReadyTasksAvailable()
→ [dualPortPlacement の load repair が未適用] request dual-port-placement
→ world-loaded / render-mode-changed / refresh-editors
→ [skip のとき] イベントのあとで markMapReadyTasksAvailable()
```

`fmg:world-loaded` では、Characters が有効で task を受け付ける状態なら `characters.roster` を要求する。Economy はカタログ移行と、市場が既にあるときの台帳同期を行い、空の市場でなければ `economy.initialization` を再実行しない。個人現金は Economy と Characters が両方有効なら、このイベントで `initializeRosterCash()` を直接呼ぶ。skip がオンのあいだは `coreMapReady` が偽なので、イベント中の task 要求は捨てられる。

ロード時に ensure は **0 回**。道路再生成の条件を満たす経路の `Routes.generate()` も収束を行わない。新規生成と違い、全 Map Ready task は走らない。要求された task とその依存だけが走る。

収束結果・河川索引の `WeakMap` キャッシュはランタイム内のもので、ファイルに保存されない。route に保存された `riverRoadConvergence` の元点列等と、メモリー上の都市別施設・索引キャッシュは別物である。したがって、ファイルを読み込む別セッションでは準備が必要になる。

### 7.2 旧形式の SVG 復元

旧形式でも、進行中の生成を待ってから世界データを `world.replace` する。その後 `applyLegacyMapView()` が view 専用の復元を行う。task の受付、未適用なら港再配置の要求、`fmg:world-loaded` はアーカイブと同じである。レイヤーのオンオフは保存 SVG の中身から推定し、拡張所有レイヤーのトグルは保存 SVG から落とさない。スタイルを戻したあと `OceanLayers()` で海面キャンバスを作り直す。

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

2026-11-16 に `getBurgSiteDescriptor()` を再確認した。収束準備は地図生成には無く、descriptor 1 回につき ensure は 1 回、という構造は変わっていない。descriptor には都市形態（`urbanMorphology`）が加わり、必要なら要求範囲と上限を渡して frame を広げる。以下の時刻は 2026-10 の計測のままである。

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
| 全体の道路・河川収束準備 | 地図ごとに最初の連携で準備する（約 0.5 秒）。以後の変更・CLI cold でも必要に応じて準備する。 | 前回以降依存値が変わらなければ再利用。河川名等の変更でも維持。 |
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

道路描画点生成は 426 本から 4 本になった。全条件で改修前後の descriptor JSON を比較し一致した。単回のため絶対時間には実行環境の揺らぎがある。cold の全体準備そのものは残り、通常の新規地図では初回描画後の Map Ready task で実行する。測定結果は `temp/cache-audit-before.json` / `temp/cache-audit-final.json`、確認用スクリプトは `temp/audit-ce-cache.mjs`（いずれもローカル診断用）に保存。


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
| [src/runtime/dualPortPlacementTask.ts](../src/runtime/dualPortPlacementTask.ts) | 新規生成とロード後の港再配置・水際検査 |
| [src/simulation/host.ts](../src/simulation/host.ts) | SimulationHost。組込み拡張の登録と港 task の登録 |
| [src/simulation/masterReference.ts](../src/simulation/masterReference.ts) | 既定の新規生成で経済以降を worker に渡す入口 |
| [src/simulation/masterReferenceEngine.ts](../src/simulation/masterReferenceEngine.ts) | worker 内の reference-evaluation と人物の畳み込み |
| [src/simulation/loadedWorld.ts](../src/simulation/loadedWorld.ts) | 保存地図の水文・道路・race の正規化 |
| [src/controllers/layers.ts](../src/controllers/layers.ts) | SVG / WebGL-hybrid の描画分岐、レイヤー・プリセット管理 |
| [src/renderers/webgl/hybridLayerPolicy.ts](../src/renderers/webgl/hybridLayerPolicy.ts) | ハイブリッド時に SVG へ適用する表示ポリシー |
| [src/extensions/index.ts](../src/extensions/index.ts) | 組込み・動的拡張の初期化順 |
| [src/extensions/economy/simulation.ts](../src/extensions/economy/simulation.ts) | Economy の Map Ready task と初期生産の順序 |
| [src/extensions/economy/index.tsx](../src/extensions/economy/index.tsx) | Economy のレイヤーと UI 登録 |
| [src/extensions/economy/generators/economyStartMode.ts](../src/extensions/economy/generators/economyStartMode.ts) | 開始モード別の初期資金 |
| [src/extensions/economy/generators/foodProduction.ts](../src/extensions/economy/generators/foodProduction.ts) | Burg/Market の初期資本と食料備蓄の seed |
| [src/extensions/economy/generators/personalCash.ts](../src/extensions/economy/generators/personalCash.ts) | 個人資産 task と世帯現金からの役職プール |
| [src/extensions/economy/generators/characterStipends.ts](../src/extensions/economy/generators/characterStipends.ts) | reference-evaluation 時の初期 wealth と継続 stipend |
| [src/extensions/characters/simulation.ts](../src/extensions/characters/simulation.ts) | 組織台帳の Map Ready task |
| [src/extensions/nobility/simulation.ts](../src/extensions/nobility/simulation.ts) | Nobility の Map Ready task |
| [src/extensions/shipbuilding/simulation.ts](../src/extensions/shipbuilding/simulation.ts) | 造船 task、初期艦隊、在庫要求 |
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
| [src/generators/generationProfiler.ts](../src/generators/generationProfiler.ts) | 地図生成の階層計測（`fmg:perf` 用、debug フラグで有効） |
