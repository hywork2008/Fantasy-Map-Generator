# 地図初期化プロセス

> `src/app.ts` の `initApp()` から始まるデータ生成とレイヤー描画の全順序。
> 最終確認: 2026-07-09（`src/app.ts`, `src/main.ts`, `src/initViewLayers.ts`, `src/controllers/layers.ts`）

---

## 1. `initApp()` 実行順序（全体）

```
initApp()
  │
  ├─ 0. injectInfrastructure() / injectVisibleUI()
  │                              — DOM 基盤と表示 UI の差し込み
  │
  ├─ 1. initReactUI()          — React UI のマウント（ツールバー、ダイアログ）
  │
  ├─ 2. initUtils()            — ユーティリティ関数の登録
  │
  ├─ 3. initModules()          — ジェネレーターモジュールの初期化
  │
  ├─ 4. initRenderers()        — レンダラーシングルトンのエクスポート
  │
  ├─ 5. initControllers()      — コントローラー初期化
  │       └─ initLayers()      — デフォルトレイヤー設定、カスタムプリセット復元
  │
  ├─ 6. initMain(drawMap)
  │       ├─ [drawMap] createViewLayers() / populateSizeRects()
  │       ├─ checkLoadParameters()
  │       │     └─ generateMapOnLoad() ← 通常ルート
  │       │           ├─ applyStyleOnLoad()
  │       │           ├─ generate()     ← §2 データ生成
  │       │           ├─ applyLayersPreset()
  │       │           ├─ drawLayers()   ← §4 レイヤー描画
  │       │           └─ fitMapToScreen() / focusOn()
  │       └─ initiateAutosave() / イベントリスナー登録
  │
  ├─ 7. window.fmg アセンブリ（凍結）
  │
  └─ 8. initExtensions()       — 拡張機能初期化（Economy等）
```

> **注意**: `main.ts` はモジュールとして `app.ts` に import された時点でモジュールレベルのコードが実行される。
> ただし、ホスト SVG レイヤー `<g>` 要素の作成は現在 `src/initViewLayers.ts` に集約されており、
> `initMain(drawMap)` の中で `createViewLayers()` / `populateSizeRects()` として実行される。

---

## 2. `generate()` — データ生成順序

`generate()` はほぼデータ生成フェーズだが、実装上は海洋レイヤー、スケールバー、カレンダーなど一部の表示更新も含む。

```
generate()
  │
  ├─  1. setSeed()                    — シード決定・Alea 乱数初期化
  ├─  2. applyGraphSize()             — グラフサイズ適用
  ├─  3. randomizeOptions()           — オプションランダム化
  │
  ├─  4. Grid 生成（必要な場合のみ）
  │       └─ generateGrid() / precreatedGraph
  ├─  5. HeightmapGenerator.generate() — 高さマップ (grid.cells.h)
  │
  ├─  6. pack クリア
  ├─  7. Features.markupGrid()        — グリッドセルの地物フラグ付け
  ├─  8. addLakesInDeepDepressions()  — 窪地に湖を追加
  ├─  9. openNearSeaLakes()           — 海近くの湖を開口（海に接続）
  │
  ├─ 10. OceanLayers()               — 海洋レイヤー更新（`viewContext.renderMap` が true の場合）
  ├─ 11. defineMapSize()             — マップサイズ・緯度定義
  ├─ 12. calculateMapCoordinates()   — 地理座標計算
  ├─ 13. calculateTemperatures()     — 気温シミュレーション (grid.cells.temp)
  ├─ 14. generatePrecipitation()     — 降水量シミュレーション (grid.cells.prec)
  │
  ├─ 15. reGraph()                   — pack ボロノイグラフ再生成
  ├─ 16. Features.markupPack()       — pack セルの地物フラグ付け
  ├─ 17. createDefaultRuler()        — デフォルト定規生成
  │
  ├─ 18. Rivers.generate()           — 河川生成 (pack.rivers)
  ├─ 19. Biomes.define()             — バイオーム定義 (pack.cells.biome)
  ├─ 20. Features.defineGroups()     — 地物グループ定義
  ├─ 21. Ice.generate()              — 氷河・氷山生成
  │
  ├─ 21.5 Threats.generate()         — Danger/モンスター脅威生成 (pack.cells.danger等、rankCellsより前)
  ├─ 22. rankCells()                 — セル優先度計算 (pack.cells.s/pop、Threatsの結果を反映)
  ├─ 23. Cultures.generate()         — 文化生成
  ├─ 24. Cultures.expand()           — 文化拡大（ボロノイ成長）
  │
  ├─ 25. Burgs.generate()            — 都市生成（都市候補決定）
  ├─ 26. States.generate()           — 国家生成・拡大
  ├─ 27. Routes.generate()           — 交易路生成
  ├─ 28. Religions.generate()        — 宗教生成・拡大
  │
  ├─ 29. Burgs.specify()             — 都市詳細化（港・名前等）
  ├─ 30. States.collectStatistics()  — 国家統計集計
  ├─ 31. States.defineStateForms()   — 国家形態定義
  │
  ├─ 32. Provinces.generate()        — 州生成
  ├─ 33. Provinces.getPoles()        — 州ポール（ラベル位置）
  │
  ├─ 34. Rivers.specify()            — 河川詳細化（名前・規模）
  ├─ 35. Lakes.defineNames()         — 湖名定義
  │
  ├─ 36. Military.generate()         — 軍事ユニット生成
  ├─ 36.5 establishVassalage()       — 属国の駐屯・貢納関係の初期化 (src/generators/vassalage.ts)
  ├─ 37. Markers.generate()          — マーカー生成
  ├─ 38. Zones.generate()            — ゾーン生成
  │
  ├─ 38.5 initSimulationClock()      — SimulationContext初期化（tickCount=0、options.year/era等から復元）
  ├─ 39. dispatchEvent("fmg:generate-post-core")  ← Economy/Shipbuilding/Nobility拡張がここで受信
  │       └─ [Economy ON時] Goods.generate() → Markets.generate() → Taxes/Production
  │       └─ [Nobility ON時] Characters.generate() → offices/diplomacy/espionage/StrategicPlanner
  │       └─ [Shipbuilding ON時] shipyard queues clear → candidates recompute/draw
  │
  ├─ 39.5 applyHistoricalWarScars()  — 過去の戦争史(chronicle)由来の人口減少を反映 (demography-simulator.ts)
  ├─ 39.6 Threats.appendCasualtyNotes() — モンスター被害のフレーバーテキストをnotesへ追記
  ├─ 40. drawScaleBar()              — スケールバー描画
  ├─ 40.5 drawCalendar()             — カレンダーオーバーレイ描画（`#calendar`、docs/simulation/advance-time.md参照）
  └─ 41. Names.getMapName()          — マップ名生成
```

> 番号に `.5` が付いている行は、本ドキュメント作成後（Danger レイヤー・Advance Time 日/月粒度・属国統治の実装）に
> 追加されたステップ。既存の番号を振り直すと他ドキュメントからの行番号参照が壊れるため、間に挿入する形にしている。

---

## 3. SVG レイヤーの DOM 構造と z-order（`src/initViewLayers.ts`）

SVG の重ね順は DOM の追加順で決まる（**後に追加 = 上に表示**）。
ホストレイヤーは `src/initViewLayers.ts` の `createViewLayers()` で `viewbox.append()` された順序が視覚的スタック順序になる。
保存済み SVG を読み込んだ後は `reinitializeMapLayers()` が既存 DOM を再選択し、`viewContext` を in-place で更新する。

```
#map (SVG)
  ├─ #legend           ← viewboxの外、svg直下
  ├─ #calendar         ← viewboxの外、svg直下（Advance Timeカレンダーオーバーレイ、docs/simulation/advance-time.md参照）
  ├─ #deftemp (defs)
  ├─ #viewbox (g)  ← すべての地図レイヤーの親
  │     │
  │     │ ▼ 下（背景）
  │     ├─ #ocean
  │     │     ├─ #oceanLayers
  │     │     └─ #oceanPattern
  │     ├─ #landmass
  │     ├─ #texture
  │     ├─ #terrs
  │     │     ├─ #oceanHeights
  │     │     └─ #landHeights
  │     ├─ #lakes
  │     │     ├─ #freshwater
  │     │     ├─ #salt
  │     │     ├─ #sinkhole
  │     │     ├─ #frozen
  │     │     ├─ #lava
  │     │     └─ #dry
  │     ├─ #biomes
  │     ├─ #danger          ← Dangerレイヤー（display:none）。biomesの直後・populationの直前
  │     ├─ #population
  │     │     ├─ #rural
  │     │     └─ #urban
  │     ├─ #cells
  │     ├─ #gridOverlay
  │     ├─ #coordinates
  │     ├─ #compass
  │     ├─ #rivers
  │     ├─ #terrain
  │     ├─ #relig
  │     ├─ #cults
  │     ├─ #regions
  │     │     ├─ #statesBody
  │     │     └─ #statesHalo
  │     ├─ #provs
  │     ├─ #zones
  │     ├─ #borders
  │     │     ├─ #stateBorders
  │     │     └─ #provinceBorders
  │     ├─ #routes
  │     │     ├─ #roads
  │     │     ├─ #trails
  │     │     └─ #searoutes
  │     ├─ #temperature
  │     ├─ #coastline
  │     │     ├─ #sea_island
  │     │     └─ #lake_island
  │     ├─ #ice
  │     ├─ #prec
  │     ├─ #emblems
  │     │     ├─ #burgEmblems
  │     │     ├─ #provinceEmblems
  │     │     └─ #stateEmblems
  │     │
  │     ├─ #marketsLayerFill  Economy拡張 (display:none, insertBefore:"icons")
  │     ├─ #marketsLayer      Economy拡張 (display:none, insertBefore:"icons")
  │     ├─ #goods             Economy拡張 (display:none, insertBefore:"icons")
  │     │
  │     ├─ #icons             ← burgIcons・anchors
  │     │     ├─ #burgIcons
  │     │     └─ #anchors
  │     ├─ #labels            ← 国名・都市ラベル
  │     │     ├─ #states
  │     │     ├─ #addedLabels
  │     │     └─ #burgLabels
  │     ├─ #armies
  │     ├─ #markers
  │     │
  │     ├─ #tradeAnimation    Economy拡張 (insertAfter:"marketsLayer")
  │     │
  │     ├─ #fogging-cont
  │     │     └─ #fogging
  │     ├─ #ruler
  │     └─ #debug
  │     │ ▲ 上（前景）
  │
  └─ #scaleBar
```

> `#danger`/`#population`の位置は`docs/plan/debug-danger.md`で「cellsレイヤーより下に移動させた」と記録されている変更を反映（旧版は`#population`を`#prec`の後に置いていたが誤り）。`#legend`/`#calendar`は`viewbox`の外（`svg`直下）にあるため、pan/zoomの影響を受けない固定要素として描画される。

---

## 4. `drawLayers()` — レイヤー描画順序（`src/controllers/layers.ts`）

`drawLayers()` は各 SVG `<g>` グループにコンテンツを書き込む。
**呼び出し順序はレイヤーの描画優先度を示すが、実際の視覚的重ね順は §3 の DOM 順序で決まる。**

```
drawLayers()
  │
  ├─  1. FeaturesRenderer.render()      — 海岸線・湖パス（常に実行、toggleなし）
  │       └─ lakes表示状態をトグル状態に同期
  │
  ├─  2. [toggleTexture]   TextureRenderer.render()
  ├─  3. [toggleHeight]    HeightmapRenderer.render()
  ├─  4. [toggleBiomes]    BiomesRenderer.render()
  ├─  5. [toggleCells]     CellsRenderer.render()
  ├─  6. [toggleGrid]      GridRenderer.render()
  ├─  7. [toggleCoordinates] CoordinatesRenderer.render()
  ├─  8. [toggleCompass]   compass 表示
  ├─  9. [toggleRivers]    RiversRenderer.render()
  ├─ 10. [toggleRelief]    ReliefIconsRenderer.render()
  ├─ 11. [toggleReligions] ReligionsRenderer.render()
  ├─ 12. [toggleCultures]  CulturesRenderer.render()
  ├─ 13. [toggleStates]    StatesRenderer.render()
  ├─ 14. [toggleProvinces] ProvincesRenderer.render()
  ├─ 15. [toggleZones]     ZonesRenderer.render()
  ├─ 16. [toggleBorders]   BordersRenderer.render()
  ├─ 17. [toggleRoutes]    RoutesRenderer.render()
  ├─ 18. [toggleTemperature] drawTemperature()
  ├─ 19. [togglePopulation] PopulationRenderer.render()
  ├─ 20. [toggleIce]       IceRenderer.render()
  ├─ 21. [togglePrecipitation] PrecipitationRenderer.render()
  ├─ 21.5 [toggleDanger]   DangerRenderer.render()
  ├─ 22. [toggleEmblems]   EmblemsRenderer.render()
  ├─ 23. [toggleLabels]    drawLabels()
  │         ├─ drawStateLabels()
  │         └─ BurgLabelsRenderer.render()
  ├─ 24. [toggleBurgIcons] BurgIconsRenderer.render()
  ├─ 25. [toggleMilitary]  MilitaryRenderer.render()
  ├─ 26. [toggleMarkers]   MarkersRenderer.render()
  │
  ├─ 27. for hook of _drawLayerHooks: hook()   ← 拡張機能フック（全拡張分実行）
  │         └─ [Economy拡張フック]
  │               ├─ [toggleGoods]        drawGoods()
  │               ├─ [toggleMarketsLayer] drawMarketsLayer()
  │               └─ [toggleTrade]        TradeAnimation.start()
  │
  └─ 28. [toggleRulers]    rulers.draw()
```

---

## 5. Extension-owned SVG レイヤー

拡張機能の SVG レイヤーは `src/store/layerState.tsx` の `SvgLayerSpec` で宣言し、`api.addLayers()` 時に
`src/app.ts` の `buildExtensionAPI()` が `#viewbox` の指定位置へ作成または再取得する。

現在の Economy 拡張の宣言:

| レイヤー | DOM ID | 配置 |
| :-- | :-- | :-- |
| Goods | `#goods` | `insertBefore: "icons"` で burg icons / labels より下 |
| Markets fill | `#marketsLayerFill` | `insertBefore: "icons"` で burg icons / labels より下 |
| Markets borders/icons/labels | `#marketsLayer` | `insertBefore: "icons"` で burg icons / labels より下 |
| Trade animation | `#tradeAnimation` | `insertAfter: "marketsLayer"` |

過去には Economy レイヤーが `icons` / `labels` を覆う問題があったが、現在は `SvgLayerSpec.insertBefore` /
`insertAfter` による差し込みで解消済み。保存済み SVG 読み込み後は `fmg:map-layers-reinitialized` を受けて
extension API が登録済み `SvgLayerSpec` を再取得し、`registerMapReinitHook()` を呼ぶ。

Shipbuilding 拡張は `#shipyards` を `insertBefore: "icons"` で作成する。

---

## 6. デフォルトプリセット（Political map）のアクティブレイヤー

`applyLayersPreset()` で適用される初期状態（`political` プリセット）。Economy 拡張 OFF。

| レイヤー | ON/OFF |
| :-- | :-- |
| Borders (`#borders`) | ✅ ON |
| BurgIcons (`#icons`) | ✅ ON |
| Ice (`#ice`) | ✅ ON |
| Labels (`#labels`) | ✅ ON |
| Lakes (`#lakes`) | ✅ ON |
| Rivers (`#rivers`) | ✅ ON |
| Routes (`#routes`) | ✅ ON |
| Scale Bar | ✅ ON |
| States (`#regions`) | ✅ ON |
| Vignette | ✅ ON |
| その他すべて | ❌ OFF |

---

## 7. 関連ファイル

| ファイル | 役割 |
| :-- | :-- |
| [src/app.ts](../src/app.ts) | `initApp()` エントリーポイント |
| [src/main.ts](../src/main.ts) | `generate()`・`generateMapOnLoad()`・ズーム/ロード/ホストイベント |
| [src/initViewLayers.ts](../src/initViewLayers.ts) | ホスト SVG レイヤー生成・再取得 |
| [src/controllers/layers.ts](../src/controllers/layers.ts) | `drawLayers()`・`initLayers()`・プリセット管理 |
| [src/store/layerState.tsx](../src/store/layerState.tsx) | `DEFAULT_LAYERS` 定義・レイヤー状態管理 |
| [src/extensions/economy/index.tsx](../src/extensions/economy/index.tsx) | Economy 拡張の `init()` — レイヤー登録・フック登録 |
| [src/extensions/index.ts](../src/extensions/index.ts) | `initExtensions()` — 拡張機能のロードエントリー |
