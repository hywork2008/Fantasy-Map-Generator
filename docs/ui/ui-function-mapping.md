# UI と関数の対応表

`div#options`（Reactタブ）と `div#react-ui-root`（Reactダイアログ）の下にある UI 要素と、それが呼び出す関数・開くダイアログの一覧。

---

## 全体構造

```
┌─────────────────────────────────────────────────────────────┐
│                   React UI Container                        │
│          (src/ui/App.tsx → div#react-ui-container)          │
└─────────────────────────────────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
┌──────────────────┐ ┌──────────────┐ ┌──────────────────┐
│ DialogsContainer │ │OptionsContainer│ │ExitCustomization│
│  (dialogs-root)  │ │  (#options)  │ │  (heightmap)     │
└──────────────────┘ └──────────────┘ └──────────────────┘
         │                  │
    40+ Dialog         5 React Tabs:
    components      ├─ Layers
                    ├─ Style
                    ├─ Options
                    ├─ Tools
                    ├─ About
                    └─ Sticked (footer)

    React Components      CustomEvent        Controllers
    ─────────────────     ──────────         ──────────────
    onChange/onClick      dispatch           addEventListener
         │                    │                    │
         └────────────────────┼────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │                   │
                    ▼                   ▼
              options.ts          tools.ts
         (map/ui/era/year)    (features/editors)
                    │                   │
                    └─────────┬─────────┘
                              │
                         Zustand Stores
                    ├─ useOptionsState
                    ├─ useViewState
                    ├─ useStyleState
                    ├─ useLayerState
                    └─ useDialogState
```

---

## 1. Layers Tab（`src/ui/components/tabs/LayersTab.tsx`）

### レイヤープリセット管理

| UI要素 | 種類 | イベント | 呼ばれる関数 | 結果 |
|--------|------|---------|------------|------|
| `id="layersPreset"` | `<select>` | onChange | `window.handleLayersPresetChange(value)` | レイヤープリセット変更 |
| `id="savePresetButton"` | button | click | `window.savePreset()` | 現在のレイヤー設定をプリセットとして保存 |
| `id="removePresetButton"` | button | click | `window.removePreset()` | 現在のプリセットを削除 |

### レイヤートグル・並び替え

| UI要素 | 種類 | イベント | 呼ばれる関数 | 結果 |
|--------|------|---------|------------|------|
| `#mapLayers` li要素 | list item | click | `window.<layerId>()` | 該当レイヤーの ON/OFF |
| 各 li 要素 | list item | drag/drop | `useLayerState.reorderLayers(from, to)` | レイヤーの上下順序変更 |
| 各 li 要素 | list item | Ctrl+click | `window.<layerId>(event)` | 該当レイヤーのスタイル編集 |

### ビューモード切り替え

| UI要素 | 種類 | イベント | 呼ばれる関数 | 結果 |
|--------|------|---------|------------|------|
| `id="viewStandard"` | button | click | `window.changeViewMode(event)` | 通常ビューに変更 |
| `id="viewMesh"` | button | click | `window.changeViewMode(event)` | 3D Mesh ビューに変更 |
| `id="viewGlobe"` | button | click | `window.changeViewMode(event)` | グローブビューに変更 |

---

## 2. Style Tab（`src/ui/components/tabs/StyleTab.tsx`）

### スタイルプリセット

| UI要素 | 種類 | イベント | 呼ばれる関数 | 結果 |
|--------|------|---------|------------|------|
| `id="stylePreset"` | `<select>` | onChange | `window.requestStylePresetChange(value)` | スタイルプリセット変更 |
| `id="addStyleButton"` | button | click | `window.addStylePreset()` | 新規スタイルプリセット保存 |
| `id="removeStyleButton"` | button | click | `window.requestRemoveStylePreset()` | スタイルプリセット削除 |

### 要素別スタイル編集

| UI要素 | 種類 | イベント | 呼ばれる関数 | 結果 |
|--------|------|---------|------------|------|
| `id="styleElementSelect"` | `<select>` | onChange | `window.applySliderChange(id, value)` | 編集対象要素変更・対応スライダー表示 |
| スタイルスライダー群 | input range | onChange | `window.applySliderChange(id, v)` | 該当要素のスタイル値を即座に変更 |

---

## 3. Options Tab（`src/ui/components/tabs/OptionsTab.tsx`）

### マップサイズ・シード

| UI要素 | 種類 | イベント | CustomEvent / 関数 | 結果 |
|--------|------|---------|-------------------|------|
| Canvas size 復元 icon | icon-ccw | click | `react-map-size-change` | キャンバスサイズをウィンドウサイズに復元 |
| Canvas width input | input number | onChange | `updateOption("mapWidth")` + `react-map-size-change` | マップ幅変更 |
| Canvas height input | input number | onChange | `updateOption("mapHeight")` + `react-map-size-change` | マップ高さ変更 |
| Seed 履歴 icon | icon-hourglass-1 | click | `restoreSeed(id)` | シード履歴を表示・復元 |
| Map seed input | input number | onKeyDown (Enter) | `react-generate-map-with-seed` | 入力シードで地図再生成 |
| Copy seed icon | icon-docs | click | `react-copy-seed` → `copyMapURL()` | シードをURLつきでコピー |

### グラフ生成設定（ロック機能付き）

| UI要素 | 種類 | イベント | CustomEvent / 関数 | 結果 |
|--------|------|---------|-------------------|------|
| `id="lock_points"` | icon | click | `lock("points")` / `unlock("points")` | Points 設定をロック/アンロック |
| Points range slider | input range | onChange | `updateOption("points", value)` | ポイント数変更（次回生成に反映） |
| `id="lock_mapName"` | icon | click | `lock("mapName")` / `unlock("mapName")` | Map 名をロック/アンロック |
| Map name input | input text | onChange | `updateOption("mapName", value)` | マップ名変更 |
| Map name 再生成 icon | icon-arrows-cw | click | `react-regenerate-map-name` | マップ名を自動再生成 |
| Year input | input number | onChange | `updateOption("year")` + `react-change-year` | 年号変更・グローバル同期 |
| Era input | input text | onChange | `updateOption("era")` + `react-change-era` | 時代名変更・グローバル同期 |
| Era 再生成 icon | icon-arrows-cw | click | `react-regenerate-era` | 時代名を自動再生成 |

### テンプレート・文明・国設定（ロック機能付き）

| UI要素 | 種類 | イベント | CustomEvent / 関数 | 結果 |
|--------|------|---------|-------------------|------|
| `id="lock_template"` | icon | click | `lock("template")` / `unlock("template")` | Template をロック/アンロック |
| `id="templateInputContainer"` | div | click | `react-open-template-selection` | Heightmap テンプレート選択ダイアログを開く |
| `id="lock_cultures"` | icon | click | `lock("cultures")` / `unlock("cultures")` | Cultures 数をロック/アンロック |
| Cultures range + number | input range + number | onChange | `updateOption("cultures", value)` | 文明数変更 |
| `id="lock_culturesSet"` | icon | click | `lock("culturesSet")` / `unlock("culturesSet")` | Cultures set をロック/アンロック |
| `id="culturesSet"` | `<select>` | onChange | `updateOption("culturesSet")` + `react-change-cultures-set` | 文明セット変更・上限チェック |
| `id="lock_statesNumber"` | icon | click | `lock("statesNumber")` / `unlock("statesNumber")` | States 数をロック/アンロック |
| States number slider | SliderInput | onChange | `updateOption("statesNumber", value)` | 国家数変更 |
| Provinces ratio slider | SliderInput | onChange | `updateOption("provincesRatio", value)` | Province 比率変更 |
| Size variety slider | SliderInput | onChange | `updateOption("sizeVariety", value)` | 大きさバリエーション変更 |
| Growth rate slider | SliderInput | onChange | `updateOption("growthRate", value)` | 成長率変更 |
| Burgs number range | input range | onChange | `updateOption("manors", value)` | Burgs 数変更 |
| Religions number slider | SliderInput | onChange | `updateOption("religionsNumber", value)` | 宗教数変更 |
| State labels mode | `<select>` | onChange | `updateOption("stateLabelsMode")` + `react-change-state-labels-mode` | State ラベル表示モード変更 |

### 表示・テーマ設定（即座に反映）

| UI要素 | 種類 | イベント | CustomEvent / 関数 | 結果 |
|--------|------|---------|-------------------|------|
| Interface size slider | SliderInput | onChange | `updateOption("uiSize")` + `react-change-ui-size` | UI サイズ変更・即座に反映 |
| Tooltip size slider | SliderInput | onChange | `updateOption("tooltipSize")` + `react-change-tooltip-size` | ツールチップサイズ変更・即座に反映 |
| Theme color 復元 icon | icon-ccw | click | `react-restore-theme` | テーマ色をデフォルトに復元 |
| `id="themeColorInput"` | input color | onChange | `updateOption("themeColor")` + `react-change-theme` | テーマ色変更・全ダイアログに反映 |
| Transparency slider | SliderInput | onChange | `updateOption("transparency")` + `react-change-theme` | 透明度変更・ダイアログに反映 |
| Autosave interval | range + number input | onChange | `updateOption("autosaveInterval", value)` | オートセーブ間隔変更 |
| Onload behavior | `<select>` | onChange | `updateOption("onloadBehavior", value)` | ロード時動作設定 |
| Azgaar assistant | `<select>` | onChange | `updateOption("azgaarAssistant", value)` | アシスタント表示/非表示 |
| Speaker voice test icon | icon-volume | click | `react-test-speaker` | 選択音声でテスト再生 |
| Speaker voice | `<select>` | onChange | `updateOption("speakerVoice", value)` | TTS 音声選択 |
| Emblem shape | `<select>` | onChange | `updateOption("emblemShape")` + `react-change-emblem-shape` | 紋章形状変更・再描画 |

---

## 4. Tools Tab（`src/ui/components/tabs/ToolsTab.tsx`）

全ボタンは `react-tool-action` CustomEvent を dispatch し、`src/controllers/tools.ts` で処理される。

### Edit セクション

| ボタン | detail.action | 呼ばれる関数 | 開くダイアログ |
|--------|---------------|------------|--------------|
| Biomes | `editBiomesButton` | `editBiomes()` | Biomes Editor |
| Burgs | `overviewBurgsButton` | `overviewBurgs()` | Burgs Overview |
| Coastlines | `editCoastlineSettings` | `editCoastlineSettings()` | Coastline Settings Editor |
| Cultures | `editCulturesButton` | `editCultures()` | Cultures Editor |
| Diplomacy | `editDiplomacyButton` | `editDiplomacy()` | Diplomacy Editor |
| Emblems | `editEmblemButton` | `openEmblemEditor()` | Emblem Editor |
| Heightmap | `editHeightmapButton` | `editHeightmap()` | Heightmap カスタマイズモード |
| Markers | `overviewMarkersButton` | `overviewMarkers()` | Markers Overview |
| Military | `overviewMilitaryButton` | `overviewMilitary()` | Military Overview |
| Namesbase | `editNamesBaseButton` | `NamesbaseEditor.open()` | Namesbase Editor |
| Notes | `editNotesButton` | `editNotes()` | Notes Editor |
| Provinces | `editProvincesButton` | `editProvinces()` | Provinces Editor |
| Religions | `editReligions` | `editReligions()` | Religions Editor |
| Rivers | `overviewRiversButton` | `overviewRivers()` | Rivers Overview |
| Routes | `overviewRoutesButton` | `overviewRoutes()` | Routes Overview |
| States | `editStatesButton` | `editStates()` | States Editor |
| Units | `editUnitsButton` | `editUnits()` | Units Editor |
| Zones | `editZonesButton` | `editZones()` | Zones Editor |

### Regenerate セクション

確認ダイアログを表示してから `processFeatureRegeneration()` を実行（カスタム変更削除を警告）。

| ボタン | detail.action | 呼ばれる関数 | 結果 |
|--------|---------------|------------|------|
| Burgs | `regenerateBurgs` | `regenerateBurgs()` | 全 Burgs を再生成 |
| Cultures | `regenerateCultures` | `regenerateCultures()` | ロック解除済みの文明を再生成 |
| Emblems | `regenerateEmblems` | `regenerateEmblems()` | 全紋章を再生成 |
| Ice | `regenerateIce` | `regenerateIce()` | 氷河・氷山を再生成 |
| State Labels | `regenerateStateLabels` | `drawStateLabels()` | State ラベル配置を再計算 |
| Markers | `regenerateMarkers` | `regenerateMarkers()` | ロック解除済みの Marker を再生成 |
| Markers (config icon) | `configRegenerateMarkers` | `configMarkersGeneration()` | Marker 乗数設定ダイアログを開く |
| Military | `regenerateMilitary` | `regenerateMilitary()` | 軍事力を再計算 |
| Population | `regeneratePopulation` | `recalculatePopulation()` | 人口を再計算 |
| Provinces | `regenerateProvinces` | `regenerateProvinces()` | ロック解除済みの州を再生成 |
| Relief Icons | `regenerateReliefIcons` | `ReliefIconsRenderer.render()` | 地形アイコン再生成 |
| Religions | `regenerateReligions` | `regenerateReligions()` | 宗教を再生成 |
| Rivers | `regenerateRivers` | `regenerateRivers()` | 河川を再生成 |
| Routes | `regenerateRoutes` | `regenerateRoutes()` | 経路を再生成 |
| States | `regenerateStates` | `regenerateStates()` | ロック解除済みの国家を再生成 |
| Zones | `regenerateZones` | `regenerateZones()` | ゾーンを再生成 |

### Add セクション

| ボタン | detail.action | 呼ばれる関数 | 結果 |
|--------|---------------|------------|------|
| Burg | `addBurgTool` | `toggleAddBurg()` | Map クリックで Burg 追加モード有効化 |
| Label | `addLabel` | `toggleAddLabel()` | Map クリックで Label 追加モード有効化 |
| Marker | `addMarker` | `toggleAddMarker()` | Map クリックで Marker 追加モード有効化 |
| River | `addRiver` | `toggleAddRiver()` | Map クリックで River 追加モード有効化 |
| Route | `addRoute` | `createRoute()` | Route Creator ダイアログを開く |

### Show セクション

| ボタン | detail.action | 呼ばれる関数 | 開くダイアログ |
|--------|---------------|------------|--------------|
| Cells | `overviewCellsButton` | `viewCellDetails()` | Cell Info |
| Charts | `overviewChartsButton` | `overviewCharts()` | Charts Overview |
| Minimap | `openMinimapButton` | `openMinimap()` | Minimap |
| World | `openWorldConfigurator` | `window.editWorld()` | World Configurator |

### Create セクション

| ボタン | detail.action | 呼ばれる関数 | 開くダイアログ |
|--------|---------------|------------|--------------|
| Submap | `openSubmapTool` | `openSubmapTool()` | Submap Tool |
| Transform | `openTransformTool` | `openTransformTool()` | Transform Tool |

---

## 5. Sticked（`src/ui/components/Sticked.tsx`）

下部固定ボタン群。イベントリスナーは `src/controllers/options.ts` に登録。

| ボタン ID | ラベル | 呼ばれる関数 | 開くダイアログ |
|-----------|--------|------------|--------------|
| `newMapButton` | New Map | `regeneratePrompt()` | 新規マップ生成プロンプト |
| `exportButton` | Export | `showExportPane()` | Export Map (`exportMapData`) |
| `saveButton` | Save | `showSavePane()` | Save Map (`saveMapData`) |
| `loadButton` | Load | `showLoadPane()` | Load Map (`loadMapData`) |
| `zoomReset` | Reset Zoom | `resetZoom(1000)` | — |

---

## 6. ダイアログ一覧（`div#dialogs-root`）

### ダイアログ管理 API

```typescript
// ダイアログを開く
openDialog("dialogId", { title?: string; onClose?: () => void; [key: string]: unknown });

// ダイアログを閉じる
closeDialog("dialogId");

// アラート/確認
openAlert("message", { title?: string });
openConfirm("message", { onConfirm: () => void });
openRichDialog({ title: string; content: string });
openPrompt(config);
```

### Save / Load / Export

| ダイアログ ID | コンポーネント | 呼び出し元 | 内部ボタン → 関数 |
|-------------|--------------|---------|-----------------|
| `saveMapData` | SaveMapDialog | `saveButton` click | machine → `saveToMachine()`, dropbox → `saveToDropbox()`, browser → `saveToBrowser()` |
| `loadMapData` | LoadMapDialog | `loadButton` click | machine → file input, URL → `loadURL()`, storage → `loadFromStorage()`, Dropbox connect/load/share |
| `exportMapData` | ExportMapDialog | `exportButton` click | .svg → `downloadSVG()`, .png → `downloadPNG()`, .jpeg → `downloadJPEG()`, tiles → `openExportToPngTiles()` |
| `exportToPngTilesScreen` | ExportToPngTilesDialog | Export ダイアログ内 "tiles" button | — |

### エディタダイアログ

| ダイアログ ID | コンポーネント | 呼び出し元 |
|-------------|--------------|---------|
| `statesEditor` | StatesEditorDialog | Tools: "States" → `editStates()` |
| `culturesEditor` | CulturesEditorDialog | Tools: "Cultures" → `editCultures()` |
| `religionsEditor` | ReligionsEditorDialog | Tools: "Religions" → `editReligions()` |
| `burgEditor` | BurgEditorDialog | States/Burgs Overview 内から |
| `riverEditor` | RiverEditorDialog | Rivers Overview 内から |
| `labelEditor` | LabelEditorDialog | Map 上の Label click または Add → Label |
| `routeEditor` | RouteEditorDialog | Routes Overview 内から |
| `provinceEditor` | ProvincesEditorDialog | Tools: "Provinces" |
| `emblemEditor` | EmblemEditorDialog | Tools: "Emblems" |
| `notesEditor` | NotesEditorDialog | Tools: "Notes" |
| `zonesEditor` | ZonesEditorDialog | Tools: "Zones" |
| `unitsEditor` | UnitsEditorDialog | Tools: "Units" |
| `namsbaseEditor` | NamesbaseEditorDialog | Tools: "Namesbase" |
| `biomesEditor` | BiomesEditorDialog | Tools: "Biomes" |
| `diplomacyEditor` | DiplomacyEditorDialog | Tools: "Diplomacy" |
| `diplomacyMatrix` | DiplomacyMatrixDialog | Diplomacy Editor 内から |
| `coastlineEditor` | CoastlineEditorDialog | Coastline Settings 内から |
| `coastlineSettingsEditor` | CoastlineSettingsEditorDialog | Tools: "Coastlines" |

### Overview / List ダイアログ

| ダイアログ ID | コンポーネント | 呼び出し元 |
|-------------|--------------|---------|
| `burgsOverview` | BurgsOverviewDialog | Tools: "Burgs" → `overviewBurgs()` |
| `burgGroupsEditor` | BurgGroupsEditorDialog | Burgs Overview 内から |
| `riversOverview` | RiversOverviewDialog | Tools: "Rivers" → `overviewRivers()` |
| `routesOverview` | RoutesOverviewDialog | Tools: "Routes" → `overviewRoutes()` |
| `routeGroupsEditor` | RouteGroupsEditorDialog | Routes Overview 内から |
| `markersOverview` | MarkersOverviewDialog | Tools: "Markers" → `overviewMarkers()` |
| `militaryOverview` | MilitaryOverviewDialog | Tools: "Military" → `overviewMilitary()` |
| `regimentsOverview` | RegimentsOverviewDialog | Military Overview 内から |
| `militaryOptions` | MilitaryOptionsDialog | Military Overview "Options" から |
| `chartsOverview` | ChartsOverviewDialog | Tools: "Charts" |

### ユーティリティダイアログ

| ダイアログ ID | コンポーネント | 呼び出し元 |
|-------------|--------------|---------|
| `minimap` | MinimapDialog | Tools: "Minimap" → `openMinimap()` |
| `cellInfo` | CellInfoDialog | Map 上セル hover/click |
| `worldConfigurator` | WorldConfiguratorDialog | Tools: "World" → `window.editWorld()` |
| `submapTool` | SubmapToolDialog | Tools: "Submap" → `openSubmapTool()` |
| `transformTool` | TransformToolDialog | Tools: "Transform" → `openTransformTool()` |
| `elevationProfile` | ElevationProfileDialog | Map 上 Elevation profile 表示 |
| `iconSelector` | IconSelectorDialog | 各エディタから icon 選択時 |
| `fontDialog` | FontDialog | スタイル設定から font 選択時 |

### Heightmap / 3D 関連ダイアログ

| ダイアログ ID | コンポーネント | 呼び出し元 |
|-------------|--------------|---------|
| `templateEditor` | TemplateEditorDialog | Options: Heightmap template click |
| `imageConverter` | ImageConverterDialog | Heightmap customization 内から |
| `brushesPanel` | BrushesPanelDialog | Heightmap customization "Paint Brushes" |
| `preview3d` | Preview3dDialog | Heightmap customization "3D scene" |
| `options3d` | Options3dDialog | Preview3d 設定変更から |

### Marker / River / Route 作成系ダイアログ

| ダイアログ ID | コンポーネント | 呼び出し元 |
|-------------|--------------|---------|
| `riverCreator` | RiverCreatorDialog | Tools: Add → River または Map click |
| `routeCreator` | RouteCreatorDialog | Tools: Add → Route → `createRoute()` |
| `markerEditor` | MarkerEditorDialog | Marker click から |

### 地物編集ダイアログ（Map 上クリック起動）

| ダイアログ ID | コンポーネント | 起動条件 |
|-------------|--------------|---------|
| `lakeEditor` | LakeEditorDialog | 湖 hover/click |
| `iceEditor` | IceEditorDialog | 氷河 hover/click |
| `reliefEditor` | ReliefEditorDialog | 地形アイコン hover/click |
| `stateNameEditor` | StateNameEditorDialog | State 名 click |
| `provinceNameEditor` | ProvinceNameEditorDialog | Province 名 click |

### 通知・プロンプト

| ダイアログ ID | コンポーネント | 用途 |
|-------------|--------------|------|
| `__alert__` (alert) | AlertDialog | OK ボタンのみのアラート |
| `__alert__` (confirm) | AlertDialog | Yes/No 確認ダイアログ |
| `__alert__` (rich) | AlertDialog | HTML コンテンツ埋め込みダイアログ |
| `__prompt__` | PromptDialog | テキスト/数値入力ダイアログ |

### その他

| ダイアログ ID | コンポーネント | 呼び出し元 |
|-------------|--------------|---------|
| `aiGenerator` | AiGeneratorDialog | AI 生成機能から |
| `battleScreen` | BattleScreenDialog | Military Overview から戦闘シミュレーション |
| `regimentSelectorScreen` | RegimentSelectorScreenDialog | 戦闘画面から兵団選択 |
| `styleSaver` | StyleSaverDialog | Style Tab からカスタムプリセット保存 |

---

## 7. カスタムイベント一覧

| イベント名 | dispatch 元 | listen 先 | 用途 |
|----------|-----------|---------|------|
| `react-map-size-change` | OptionsTab | options.ts | マップサイズ変更処理 |
| `react-generate-map-with-seed` | OptionsTab | options.ts | シード指定で地図再生成 |
| `react-copy-seed` | OptionsTab | options.ts | シードを URL 付きでコピー |
| `react-change-year` | OptionsTab | options.ts | グローバル year 同期 |
| `react-change-era` | OptionsTab | options.ts | グローバル era 同期 |
| `react-regenerate-map-name` | OptionsTab | options.ts | マップ名自動再生成 |
| `react-regenerate-era` | OptionsTab | options.ts | 時代名自動再生成 |
| `react-change-ui-size` | OptionsTab | options.ts | UI サイズ変更処理 |
| `react-change-tooltip-size` | OptionsTab | options.ts | ツールチップサイズ変更 |
| `react-change-theme` | OptionsTab | options.ts | テーマ色・透明度適用 |
| `react-restore-theme` | OptionsTab | options.ts | テーマをデフォルトに復元 |
| `react-change-state-labels-mode` | OptionsTab | options.ts | State ラベル表示モード変更 |
| `react-change-cultures-set` | OptionsTab | options.ts | 文明セット変更・上限チェック |
| `react-change-emblem-shape` | OptionsTab | options.ts | 紋章形状変更・再描画 |
| `react-test-speaker` | OptionsTab | options.ts | TTS テスト再生 |
| `react-open-template-selection` | OptionsTab | heightmap-selection.ts | テンプレート選択ダイアログ起動 |
| `react-tool-action` | ToolsTab | tools.ts | Tools タブアクション処理（全ボタン共通） |
| `react-enter-heightmap-edit` | heightmap-editor | OptionsContainer | Heightmap 編集モード開始 |
| `react-exit-heightmap-edit` | heightmap-editor | OptionsContainer | Heightmap 編集モード終了 |

---

## 8. ロック機能（Lock System）

`id="lock_<keyName>"` という `<i>` アイコンで管理。`src/utils/uiHelpers.ts` の `lock()` / `unlock()` / `locked()` で操作し、`localStorage` に `${key}_lock` として保存。

**ロック対象の設定キー:**

`points`, `template`, `mapName`, `year`, `era`, `cultures`, `culturesSet`, `statesNumber`, `provincesRatio`, `sizeVariety`, `growthRate`, `manors`, `religionsNumber`, `stateLabelsMode`, `emblemShape`
