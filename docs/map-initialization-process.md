# 地図初期化プロセス

> `src/app.ts` の `initApp()` を起点とする、現在の地図生成・表示・保存地図ロードの流れ。
> 最終確認: 2026-07-28（`src/app.ts`, `src/main.ts`, `src/initViewLayers.ts`, `src/runtime/worldRuntime.ts`, `src/runtime/renderCoordinator.ts`, `src/controllers/layers.ts`）

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
  ├─ window.fmg を一度だけ Object.freeze() して公開
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
- したがって、起動図は「SVG レイヤー構築 → 生成開始 → 拡張初期化完了」のような単純な一列の保証ではない。拡張は `init()` 時にレイヤーと `fmg:generate-post-core` ハンドラを登録し、生成後の描画は `WorldRuntime` の commit を通して集約される。
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
  ├─ await generate()                 → §3
  └─ [drawMap]
       ├─ applyLayersPreset()
       ├─ drawLayers()
       ├─ fitMapToScreen()
       └─ focusOn()                   // URL の scale/cell/burg/x/y を反映
```

`applyLayersPreset()` は `localStorage["preset"]`、なければ Zustand の active preset を使う。対象のプリセットが存在しない場合は `political` に戻す。

---

## 3. `generate()` と世界データの生成

公開 API の `generate()` は、ジェネレーターを直接呼ばない。`dispatchWorldGenerate()` が `WorldRuntime` の `world.generate` コマンドとして `runGeneratePipeline()` を実行し、成功した全体を一度の `fullReplace` commit として公開する。

```
generate(opts?)
  ├─ await dispatchWorldGenerate(opts)
  │    └─ WorldRuntime.executeGenerate()
  │         ├─ 現在の WorldDocument を rollback 用にスナップショット
  │         ├─ await runGeneratePipeline({ seed, graph })
  │         ├─ 出力を検証
  │         └─ FULL_REPLACE_TOPICS を含む 1 回の fullReplace commit を publish
  │              └─ RenderCoordinator が次フレームで全体描画を予約 → §5
  ├─ [debug snapshot 有効時] 初期スナップショットを保存
  ├─ drawScaleBar()
  ├─ drawCalendar()
  └─ showStatistics()
```

生成中の `pack` / `grid` は既存オブジェクトを in-place で空にして再利用する。生成失敗または検証失敗時は `WorldRuntime` が生成前のスナップショットを戻し、commit は公開しない。

### `runGeneratePipeline()` の順序

```
 1. setSeed()                         シードを決定し Alea と appServices.rng を初期化
 2. applyGraphSize()
 3. randomizeOptions()
    └─ gunpowderEraEnabled / conflictAutonomy も options へ同期

 4. grid を再生成、または既存 grid.cells.h を破棄
    └─ precreatedGraph または generateGrid()
 5. await HeightmapGenerator.generate() → grid.cells.h
 6. pack を空にする
 7. extension state slices と simulation の burg/state/military 状態を reset

 8. Features.markupGrid()
 9. addLakesInDeepDepressions()
10. openNearSeaLakes()
11. [renderMap] OceanLayers()
12. defineMapSize()
13. calculateMapCoordinates()
14. calculateTemperatures()
15. generatePrecipitation()

16. reGraph()
17. Features.markupPack()
18. createDefaultRuler()
19. Rivers.generate()
20. Biomes.define()
21. Features.defineGroups()
22. Ice.generate()
23. Threats.generate()
24. rankCells()
25. Cultures.generate() / Cultures.expand()
26. Burgs.generate()
27. States.generate()
28. Routes.generate()
29. Religions.generate()
30. Burgs.specify()
31. States.collectStatistics() / States.defineStateForms()
32. Provinces.generate() / Provinces.getPoles()
33. Rivers.specify() / Lakes.defineNames()
34. Military.generate()
35. establishVassalage()
36. FrontierForts.generate()
37. Markers.generate()
38. Zones.generate()

39. initSimulationClock()
40. simulation の burg/state/military 状態と extension state slices を bind
41. dispatchEvent("fmg:generate-post-core")
42. applyHistoricalWarScars()
43. Threats.appendCasualtyNotes()
44. Names.getMapName(false)
45. mapId が未設定なら Date.now() を設定
```

### 3.1 生成工程の確認ダイアログ

通常の新規生成は、画面中央の `Build map` ダイアログで以下の 5 工程ごとに停止する。最初の `Landscape outline` では高さマップを SVG にプレビューするため、国家や都市を生成する前に海岸線を確認できる。

1. `Landscape outline` — grid / 高さマップ / 湖 / pack graph / feature
2. `Climate and waterways` — 気候、降水、河川、バイオーム、氷
3. `Cultures and settlements` — 脅威、文化、人口基盤、burg
4. `Realms and routes` — 国家、道路、宗教、州、河川・湖の名称
5. `Finish the world` — 軍隊、地点、zones、simulation、拡張初期化、名称

各停止点では `Continue` または `Generate entire map` を選べる。`Return to previous stage` は途中の可変 `pack` / `grid` を直接復元せず、現在のシードで必要な前段から再生成して指定工程で止まる。これにより generator の in-place mutation と `WorldRuntime` の final fullReplace commit を両立する。`Generate another landscape` は第 1 工程でのみ表示され、新しいシードと grid からやり直す。

工程中は `WorldRuntime` の staging 状態であり、すべての工程を完了するまで `mapId` と fullReplace commit は公開されない。生成失敗時は従来どおり生成前の rollback snapshot に戻る。

`fmg:generate-post-core` は WorldRuntime の staging 中に発火する。この間に拡張が `extension.command` を実行しても個別 commit は発行されず、外側の生成 commit に含まれる。

組込み拡張が有効なら、このイベントで例えば次の処理が走る。

- Economy: 旧マップ由来の一部バッファをクリアし、Goods / Markets / tax rate / 食料台帳 / Production / taxes を初期化する。
- Nobility: キャラクター、役職、外交・諜報・戦略関連の初期状態を生成する。
- Shipbuilding: キューをリセットし、候補港と港湾能力を再計算する。経済生成後に初期船舶在庫を補充する処理は microtask に遅延される。

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
  │    ├─ #terrs
  │    │    ├─ #oceanHeights
  │    │    └─ #landHeights
  │    ├─ #lakes
  │    │    ├─ #freshwater / #salt / #sinkhole
  │    │    └─ #frozen / #lava / #dry
  │    ├─ #biomes
  │    ├─ #danger                    display:none
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
  │    ├─ #routes
  │    │    ├─ #roads / #trails / #searoutes
  │    ├─ #temperature
  │    ├─ #coastline
  │    │    ├─ #sea_island
  │    │    └─ #lake_island
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

SVG 経路の `paintSvgMapLayers()` は以下の順に renderer を呼ぶ。個々の項目は対応する layer toggle が ON の場合だけ描画する（Features / lakes 同期を除く）。視覚的な前後関係は呼び出し順ではなく §4 の DOM 順で決まる。

```
Features → Texture → Heightmap → Biomes → Cells → Grid → Coordinates → Compass
→ Rivers → Relief → Religions → Cultures → States → Provinces → Zones → Borders
→ Routes → Temperature → Population → Ice → Precipitation → Danger → CombatDeaths
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

保存地図では世界データを `world.replace` として検証・commit した後に、`applyLegacyMapView()` が view 専用の復元を行う。

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

## 8. デフォルトの Political preset

`political` プリセットは以下を ON にする。拡張レイヤーは含まれない。

- Borders
- Burg icons
- Ice
- Labels
- Lakes
- Rivers
- Routes
- Scale bar
- States
- Vignette

---

## 9. 関連ファイル

| ファイル | 役割 |
| :-- | :-- |
| [src/app.ts](../src/app.ts) | `initApp()`、公開 API、Extension API、拡張初期化の起点 |
| [src/main.ts](../src/main.ts) | 初回ロード判定、生成 pipeline、zoom・ホストイベント |
| [src/initViewLayers.ts](../src/initViewLayers.ts) | ホスト SVG レイヤーの作成・再取得・保存互換補完 |
| [src/runtime/worldRuntime.ts](../src/runtime/worldRuntime.ts) | staged generation、検証、fullReplace commit |
| [src/runtime/renderCoordinator.ts](../src/runtime/renderCoordinator.ts) | commit を描画・presentation 投影へ接続 |
| [src/controllers/layers.ts](../src/controllers/layers.ts) | SVG / WebGL-hybrid の描画分岐、レイヤー・プリセット管理 |
| [src/renderers/webgl/hybridLayerPolicy.ts](../src/renderers/webgl/hybridLayerPolicy.ts) | ハイブリッド時に SVG へ適用する表示ポリシー |
| [src/extensions/index.ts](../src/extensions/index.ts) | 組込み・動的拡張の初期化順 |
