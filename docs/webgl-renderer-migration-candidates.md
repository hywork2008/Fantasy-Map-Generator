# deck.gl レンダラー移行タスク

> 以前の候補比較は削除済み。以後この文書は、既に採用済みの deck.gl hybrid renderer を完成させるための作業台帳として扱う。

## 現在地

deck.gl 化は `svg` / `webglHybrid` の並列レンダラーとして開始済み。

主な実装箇所:

| 領域 | 現在の主担当 |
| :-- | :-- |
| モード切替 | `src/actions.ts` の `setRenderMode()` |
| Canvas / layer 再取得 | `src/initViewLayers.ts` の `webglMapCanvas` 生成・再取得 |
| deck.gl インスタンス | `src/renderers/webgl/deckRenderer.ts` |
| deck.gl レイヤー組み立て | `src/renderers/webgl/buildDeckLayers.ts` |
| WorldContext から deck.gl data への変換 | `src/renderers/webgl/adapters/deckDataAdapters.ts` |
| SVG / WebGL hybrid 表示ポリシー | `src/renderers/webgl/hybridLayerPolicy.ts` |
| WebGL pick bridge | `src/types/webglPicking.ts`, `src/services/mapInteraction.ts` |
| E2E | `tests/e2e/webgl-hybrid.spec.ts`, `tests/e2e/helpers/fmg-helpers.ts` |

現在の方針:

- `Renderer` 層は引き続き `Readonly<WorldContext>` / `Readonly<ViewContext>` から描画データを作る。`pack` / `grid` へ書き込まない。
- `webglHybrid` では deck.gl canvas を地図本体として使い、必要な SVG overlay だけを残す。
- SVG レイヤーの非表示は ID 列挙を CSS に直接書かず、`hybridLayerPolicy.ts` で管理クラスを付与して行う。
- UI は地図レイヤーより前面に出す。特に左上の `#options` は `#map` / `#webglMapCanvas` に隠れないこと。

## 完了定義

deck.gl 移行は、以下を満たした時点で「既定レンダラー化可能」と判断する。

- 主要プリセットで見た目と操作が SVG 版と実用上同等。
- zoom / pan / resize / focus view / map load 後も canvas が非 blank で、座標同期が崩れない。
- cell / feature / burg / marker / regiment など、編集導線に必要な picking が SVG 版と同じ粒度で機能する。
- SVG fallback にいつでも戻せる。
- E2E が canvas pixel、layer id、SVG overlay、UI stacking、picking を検証している。
- `.map` load 後の `fmg:reinitialize-map-layers` で WebGL canvas と SVG layer policy が破綻しない。
- `npm run lint`, `npx tsc --noEmit`, `npx tsc --noEmit -p tests/tsconfig.json`, WebGL E2E が通る。

## Phase 1: Hybrid 基盤の安定化

- [x] `setRenderMode()` を `FMGActionsAPI` / `tests/fmg.d.ts` / public docs に明記する。
- [x] `webglHybrid` から `svg` に戻した時、deck.gl layers と body class と SVG managed class の表示状態が完全に戻ることをE2E化する。
- [x] `.map` load 後に `webglMapCanvas` が再取得され、`DeckGlRenderer` が古い canvas 参照を保持しないことを検証する。
- [x] `DeckGlRenderer.finalize()` を呼ぶべき lifecycle を整理する。map reload は `parseLoadedData()`、renderer disable は `drawLayers()` の SVG fallback、hot reload は `deckRenderer.ts` の HMR dispose で finalize する。
- [x] `#options`, dialogs, tooltip, tour prompt, map overlay の stacking order を一覧化し、地図 canvas / SVG より常に上に出すUIを明文化する。
- [x] `body.fmg-webgl-hybrid .fmg-webgl-managed-svg-layer` の対象を `hybridLayerPolicy.ts` のみで管理し、CSS側に個別SVG IDを増やさない運用にする。

### Phase 1 運用メモ

#### deck.gl lifecycle

| lifecycle | finalize 呼び出し元 | 目的 | 検証 |
| :-- | :-- | :-- | :-- |
| `.map` reload | `src/io/load.ts` の `parseLoadedData()` | 保存 SVG の DOM 差し替え前に旧 canvas / listener / GPU resource を破棄する | `webgl-hybrid.spec.ts` の map load テストで deck marker が残らず、deck canvas が新 DOM canvas と一致する |
| renderer disable (`webglHybrid` -> `svg`) | `src/controllers/layers.ts` の `drawLayers()` SVG fallback | SVG renderer に戻るとき deck layer だけでなく deck instance も破棄する | roundtrip テストで `deckExists: false`、body class と SVG display の復元を確認する |
| hot reload | `src/renderers/webgl/deckRenderer.ts` の `import.meta.hot.dispose` | Vite HMR 時に module-local picking listener と deck instance を破棄する | 手動確認対象。HMR dispose は通常 E2E では発火しない |

#### stacking order

地図本体は `#webglMapCanvas` (`z-index: 1`) と `#map` (`z-index: 2`) が最下層。WebGL hybrid では canvas が描画本体、SVG は overlay と pointer event target として残る。

| 要素 | z-index | 地図より前面に出す理由 |
| :-- | :-- | :-- |
| `#mapOverlay` | `10` | map upload / loading overlay。`pointer-events: none` のまま canvas / SVG より上に出す |
| `#options` | `20` | 左上の常設操作 UI。WebGL canvas と SVG map に隠れないことを E2E で検証する |
| `.fmg-dialog` | `100` 以上 | editor / prompt / extension dialogs。`useDraggable()` が visible dialog の最大 z-index + 1 に引き上げる |
| `#tourPromptButton` | `9999` | tour 起動ボタン。地図操作中も前面に出す |
| `.driver-popover` / `.driver-overlay` | driver.js 管理 | UI tour。CSS override は `body.tour-free-roam .driver-overlay` のみ |
| `#tooltip` | `99999` | hover tooltip。地図・ダイアログより上に表示する |

#### hybrid SVG layer policy

- WebGL が代替描画する SVG layer は `src/renderers/webgl/hybridLayerPolicy.ts` の `WEBGL_MANAGED_SVG_LAYER_IDS` に追加する。
- WebGL hybrid でも SVG として残す layer は同ファイルの `HYBRID_SVG_OVERLAY_LAYER_IDS` に追加する。
- CSS は `body.fmg-webgl-hybrid .fmg-webgl-managed-svg-layer { display: none !important; }` だけで managed SVG layer を隠す。`public/index.css` や `src/index.html` に `body.fmg-webgl-hybrid #<svg-layer-id>` のような個別 SVG ID selector を増やさない。
- `#map` と `#webglMapCanvas` は layer policy の対象ではなく、地図コンテナ / canvas として CSS 側で扱う。

## Phase 2: 描画レイヤーの残差解消

優先順位は「大面積・高ノード数・頻繁に切替されるもの」を先にする。

| レイヤー | 状態 | 次タスク |
| :-- | :-- | :-- |
| background / land | 実装済み | style preset差分の再現性確認 |
| height | 実装済み | color scheme / opacity / ocean含有設定のSVG版差分確認 |
| biomes | 実装済み |境界・focus view・凡例との整合確認 |
| cultures / religions / states / provinces | 実装済み | boundary layer の太さ・透明度・mask差分確認 |
| zones / temperature / population / precipitation / danger | 実装済み |プリセット切替と legend / tooltip の整合確認 |
| lakes / coastline / ice | 実装済み | outline / stroke width / fractal coastline の見た目差分確認 |
| cells / grid | 実装済み | zoom倍率別の線幅と hit target の確認 |
| rivers / routes / borders | 実装済み | route group style, sea routes, selected state borders の差分確認 |
| burg icons | 実装済み | group style, capital/port表現, zoom scaling の差分確認 |
| markers | 実装済み | custom marker icon / external image / pinned-only表示の差分確認 |
| military | 実装済み | regiment box, icons, totals, action markers, drag/edit導線の差分確認 |
| labels / burg labels | 実装済み |フォント、回転、衝突回避、CJK表示、zoom threshold の差分確認 |
| emblems | 実装済み | placeholder icon から COA texture 化へ進める |
| texture / terrain / relief | SVG overlay継続 | deck.gl化は後続判断。WebGL hybrid中もtoggle可能なことをE2Eで維持する |
| coordinates / compass / scaleBar / legend / ruler / debug / fogging | SVG overlay | overlay policy classと主要常時表示overlayをE2Eで維持する |

### Phase 2 開始ログ

- `texture` / `terrain` は Phase 2 では deck.gl 化せず、SVG overlay として残す。texture は raster image overlay、terrain / relief は既存 SVG symbol 利用が強く、COA / icon atlas 方針と同じく Phase 6 以降でまとめて再検討する。
- `drawHybridSvgOverlays()` は `texture` / `relief` の表示状態を active layer state と同期する。preset変更で off になった場合も古い SVG overlay を残さない。
- E2E は `WEBGL_MANAGED_SVG_LAYER_IDS` / `HYBRID_SVG_OVERLAY_LAYER_IDS` のDOM class分類、`scaleBar` / `calendar` の常時overlay表示、WebGL hybrid中の `toggleTexture` / `toggleRelief` を検証する。

## Phase 3: Style Fidelity

- [x] `public/styles/*.json` の代表スタイルを `webglHybrid` で巡回し、主要レイヤーの色・opacity・stroke幅をSVG版と比較する。
- [x] `draw-*` renderer が参照しているSVG属性のうち、deck data adapter側に反映していないものを棚卸しする。
- [x] `getLakePaint`, `getCoastlinePaint`, `getIcePaint`, `getLabelStyle`, `getMarkerStyle`, `getBurgIconStyle`, `getEmblemStyle` をテスト可能な小関数へ分割する。
- [x] CSS custom properties / SVG attributes / layerState のどれをWebGL style source of truthにするか決める。
- [x] `widthUnits: "pixels"` と map coordinate幅の使い分けをレイヤー別に明文化する。
- [x] HiDPI時の線幅、文字サイズ、アイコンサイズを desktop / mobile で確認する。

### Phase 3 開始ログ

- `src/renderers/webgl/webglStyleExtractors.ts` を追加し、SVG属性 / `worldContext.style` / fallback から WebGL paint・label・icon style を読む処理を `buildDeckLayers.ts` から分離した。
- `webglStyleExtractors.test.ts` で lakes / coastline / ice / height / emblems / markers / burg icons / labels の style extraction を単体検証する。
- `webgl-hybrid.spec.ts` に代表 style preset (`default`, `atlas`, `watercolor`, `night`, `cyberpunk`) の fidelity test を追加した。canvas non-blank、主要 deck layer、deck data上の style metadata 変化に加えて、lakes / lake outlines / coastline / labels の deck data color・stroke width・size が SVG 属性由来の値と一致することを検証する。
- 現在の暫定 source of truth は「既存SVG属性を優先し、burg icon / label group は `worldContext.style` を fallback とする」。CSS custom properties への集約可否は未決定。
- 幅単位の暫定ルール: SVG の stroke width に追従する境界・湖岸・海岸線・rivers/routes/grid/cells は `widthUnits: "pixels"` を使う。burg icons / emblems / military boxes / labels のように地図上の実寸や既存 symbol size を再現するものは map coordinate 系 (`sizeUnits: "common"` または polygon座標) を使う。marker glyph / external marker image は既存 marker UI の pixel size に合わせるため `sizeUnits: "pixels"` を維持する。
- HiDPI test は `deviceScaleFactor: 2` で desktop (`1000x700`) と mobile (`390x720`) を同一テスト内で確認する。canvas backing store が CSS size の2倍になり、代表 path/text/icon layer の `widthUnits` / `sizeUnits` と data上の width/size が欠落しないことを検証する。

### Phase 3 style source of truth

既定化までは SVG 版との互換性を優先し、WebGL style source of truth は既存 SVG 属性とする。deck data は `webglStyleExtractors.ts` を通じて SVG 属性を読む。burg icons / anchors / burg labels は既存 renderer が `worldContext.style` も更新するため、DOM selection が未生成または空の場合だけ `worldContext.style` を fallback とする。layer visibility は引き続き `useLayerState.activeLayers` を source of truth とする。CSS custom properties は UI theme / global font family の source に留め、WebGL map layer paint の主 source にはしない。

### Phase 3 SVG attribute audit

| SVG renderer / layer | SVG attributes read by SVG renderer | WebGL mapping | Remaining gap |
| :-- | :-- | :-- | :-- |
| `draw-heightmap.ts` / `#terrs #landHeights`, `#oceanHeights` | `scheme`, `opacity`, `data-render` | `getHeightStyle()` -> `buildHeightPolygons()` | SVG heightmap filter/mask details are not reproduced; color scheme and ocean inclusion are covered |
| `draw-features.ts` / `#lakes`, `#coastline` | group `fill`, `stroke`, `stroke-width`, `opacity` | `getLakePaint()`, `getCoastlinePaint()` -> lake fill/outlines and coastline paths | Fractal coastline geometry parity is tracked under Phase 2 visual-diff follow-up |
| `draw-ice.ts` / `#ice` | `fill`, `stroke`, `stroke-width`, `opacity` | `getIcePaint()` -> `buildIcePolygons()` | SVG pattern/filter effects, if introduced by a preset, are not mapped |
| `draw-burg-labels.ts` / `#burgLabels` | group `fill`, `opacity`, `font-size`, `data-size`, `data-dx`, `data-dy` | `getLabelStyle()` -> `buildLabelSymbols()` | SVG text font family, halo/shadow and exact `em` baseline behavior remain Phase 6 text work |
| `draw-state-labels.ts` / `#labels #states` | `fill`, `opacity`, `font-size`, `data-size` | `getLabelStyle()` -> state labels | Rotation/path layout and collision parity remain Phase 6 text work |
| `draw-burg-icons.ts` / `#burgIcons`, `#anchors` | group `fill`, `opacity`, `font-size`, `data-size`, `data-icon` | `getBurgIconStyle()` -> `buildBurgIconSymbols()` | `data-icon` custom SVG symbol is not mapped; current WebGL uses circle/anchor placeholder icons pending Phase 6 atlas work |
| `draw-emblems.ts` / `#emblems` | `opacity`, `#stateEmblems/#provinceEmblems/#burgEmblems data-size` | `getEmblemStyle()` -> `buildEmblemIcons()` | Actual COA rendering is not mapped; placeholder shield remains until Phase 6 |
| `draw-markers.ts` / `#markers` | `pinned`, `rescale`; marker record `pin`, `fill`, `stroke`, `icon`, `px`, `dx`, `dy`, `size` | `getMarkerStyle()` plus marker data -> pin/icon/image layers | Custom external image load fallback and full icon atlas policy remain Phase 6 |
| `draw-military.ts` / `#armies` | `box-size`; state/regiment color/icon/action fields | `getMilitaryBoxSize()` plus regiment data -> military box/text/image layers | SVG font metrics and custom image edge cases remain Phase 6 |
| `draw-grid.ts`, cell/border/path renderers | stroke color/width/dash/linecap or generated constants | WebGL uses fixed path colors/widths for cells/grid/borders/rivers/routes | Grid `stroke-dasharray`, `stroke-linecap`, pattern type/offset/scale are not mapped; styles are acceptable for current hybrid but need Phase 9 defaulting review |
| `draw-biomes.ts`, `draw-cultures.ts`, `draw-religions.ts`, `draw-provinces.ts`, population/temperature/precipitation/danger | isoline fill/water gap and generated color values | WebGL adapters use generated pack/grid colors and fixed overlay opacities | SVG water-gap/mask details and some contour-specific effects are not mapped |

## Phase 4: Picking と編集導線

- [x] `WebglPickDetail.kind` と既存編集対象の対応表を作る。
- [ ] hover tooltip が SVG と WebGL で同じセル・同じ対象を指すことを確認する。
- [x] 同一点・近傍に複数オブジェクトが重なる場合の候補列挙と選択UIを定義する。
- [ ] click edit 導線をWebGL pick経由に寄せる。SVG DOM event前提の箇所は `mapInteraction.ts` か controller action に集約する。
- [ ] burg / marker / regiment / route / river / lake / province / state のクリック編集をE2E化する。
- [ ] drag系操作が必要な対象は、deck.gl pick結果から既存controllerへ渡す最小APIを定義する。
- [ ] `#debug .webgl-selected` は一時可視化として維持し、正式な選択表示に統合するか判断する。

### Phase 4 開始ログ

- WebGL pick bridge は `deckRenderer.ts` で `fmg:webgl-map-hover` / `fmg:webgl-map-pick` を dispatch し、`mapInteraction.ts` が tooltip と `#debug .webgl-selected` を受け持つ。
- `tests/e2e/webgl-hybrid.spec.ts` に、主要な編集対象レイヤーごとの `kind` / `id` / `cellId` / `coordinate` 検証を追加した。現時点で `deck.pickObject()` まで検証する対象は state / province / lake / military / river / route。burgIcon / marker は deck data identity の検証に留め、後述の重なり解決UIと合わせてクリック編集E2Eで再度扱う。
- クリック編集の本配線では、SVG DOM event の `event.target` 依存をそのまま増やさず、`WebglPickDetail` から既存 controller へ渡す adapter を `mapInteraction.ts` か controller action 側に置く。ただし単一 hit を前提にした adapter だけでは不十分で、同一点・近傍の複数 hit を扱える選択導線を先に設計する。
- `deckRenderer.ts` は `fmg:webgl-map-pick-candidates` を追加で dispatch する。候補は `pickMultipleObjects()` 由来の `WebglPickDetail[]` で、既存の `fmg:webgl-map-pick` は後方互換の primary pick として維持する。
- `mapInteraction.ts` は候補が複数ある場合に `#mapPickChooser` を表示する。候補を選ぶと `fmg:webgl-map-pick-candidate-selected` を dispatch し、暫定的に `#debug .webgl-selected` へ選択セルを表示する。
- E2E は同一座標に2つの regiment を重ね、クリックで chooser が出て任意候補を選べることを検証する。

### 重なりオブジェクトの選択方針

現状の SVG 版は描画順と DOM event target に依存しており、同じ街や同じセルに burg / marker / regiment / label / emblem / route / river が重なると、ユーザーが意図した対象を選べる保証がない。軍隊は `advanceTime()` 後に複数 regiment が同じ burg 座標へ集まりやすく、上に描かれた一部だけが実質クリック可能になる。この問題は WebGL 移行で自然には解決しないため、Phase 4 では「最前面の単一オブジェクトをクリックできること」ではなく、「カーソル近傍の編集候補を列挙し、ユーザーが対象を明示選択できること」を完了条件にする。

実装方針:

- `deck.pickObject()` ではなく `deck.pickMultipleObjects()` 相当の候補収集を使い、同一 pointer 座標の近傍から `WebglPickDetail[]` を作る。
- 候補は `kind` / entity id / 表示名 / 距離 / layer priority を持つ `MapPickCandidate` に正規化する。SVG fallback でも同じ candidate 型へ変換できるようにする。
- 候補が1件なら直接 editor action を呼ぶ。候補が複数なら pointer 近傍に小さな chooser を出す。
- chooser はリスト形式を第一候補にする。数が少ない対象だけ radial fan-out を検討する。地図座標そのものを勝手に動かす fan-out は、ドラッグ編集や座標編集と衝突するため preview 表示に留める。
- regiment のように同一座標へ頻繁に重なる対象は、描画上も微小オフセットや集約 badge を検討する。ただし保存データの座標は変更せず、view-only offset として扱う。
- E2E は「同一点に複数 regiment / marker がある fixture」を作り、単一クリックで chooser が出て、任意候補を選べることを検証する。

### `WebglPickDetail.kind` と既存編集対象の対応

| `kind` | WebGL `id` / `cellId` | 既存編集対象 | 既存SVG導線 | WebGL側で渡す最小情報 |
| :-- | :-- | :-- | :-- | :-- |
| `state` | `id = state-cell-<cellId>`, `cellId`あり | State / state editor | toolbarの States Editor、個別 state は `openStateEditor(stateId)` | `cellId -> pack.cells.state[cellId]` で `stateId` を解決 |
| `province` | `id = province-cell-<cellId>`, `cellId`あり | Province / province editor | toolbarの Provinces Editor、個別 province は `openProvinceEditor(provinceId)` | `cellId -> pack.cells.province[cellId]` で `provinceId` を解決 |
| `lake` | `id = lake-<featureId>` または `lake-outline-<featureId>`, `cellId = feature.firstCell` | Lake Editor | `LakesEditor.editLake(event)` が SVG path の `data-f` を読む | `featureId` を直接渡せる controller API が必要。暫定で SVG path 再選択 adapter が必要 |
| `burgIcon` | `id = burg-<burgId>` / `anchor-<burgId>`, `cellId`あり | Burg Editor | `BurgEditor.editBurg(dataset.id)` | `burgId` を parse して `editBurg(burgId)` |
| `marker` | `id = marker-<markerId>`, `cellId`あり | Marker Editor | `MarkersEditor.editMarker(markerI)` | `markerId` を parse して `editMarker(markerId)` |
| `military` | `id = regiment-<stateId>-<regimentId>-<part>`, `cellId`あり | Regiment Editor | `RegimentEditor.editRegiment(element)` が SVG group dataset を読む | `stateId` / `regimentId` を直接渡せる controller API が必要。暫定で `#regiment<stateId>-<regimentId>` 再選択 adapter が必要 |
| `river` | `id = river-<riverId>`, `cellId = river.cells[0]` | River Editor | `RiversEditor.editRiver("river<riverId>")` | `riverId` を parse し、既存形式 `river<riverId>` へ変換 |
| `route` | `id = route-<routeId>`, `cellId = route.cells[0]` | Route Editor | `RoutesEditor.editRoute("route<routeId>")` | `routeId` を parse し、既存形式 `route<routeId>` へ変換 |
| `coastline` | `id = coastline-<featureId>`, `cellId = feature.firstCell` | Coastline Editor | `CoastlineEditor.editCoastline(event)` | 現状は event 依存。feature/cell 指定 API を作るか、WebGL clickでは settings/editor入口に限定する判断が必要 |
| `ice` | `id = glacier-<id>` / `iceberg-<id>` | Ice Editor | `IceEditor.editIce(svgElement)` | 既存 editor が SVG element 依存。WebGL対象化するなら id 指定 API が必要 |
| `emblem` | `id = state-<id>` / `province-<id>` / `burg-<id>` | Emblem Editor | `editEmblem(..., element)` | type/id を parse して COA target を解決 |
| `label` | `id = state-label-<id>` / `burg-label-<id>` | Label Editor / related entity | `LabelsEditor.editLabel(tspan)` | SVG text/tspan 依存。label type/id 指定 API が必要 |
| `land` / `height` / `biome` / `culture` / `religion` / `zone` / `temperature` / `population` / `precipitation` / `danger` / `cell` / `grid` / `border` | 主に `cellId` | セル情報、各 overlay tooltip、必要なら該当 editor の context | hover tooltip / cell info | `cellId` を canonical input とする |
| `background` | `cellId = null` | なし | ocean tooltip | 編集対象外 |

Phase 4 の次の実装単位は、上表のうち「既に controller が id を受け取れるもの」から `mapInteraction.ts` に click dispatch を足すこと。対象は burg / marker / river / route。lake / regiment / coastline / ice / label / emblem は既存 editor の SVG element 依存を先に薄くする。

## Phase 5: キャッシュと性能

- [ ] `buildLayerSignatures()` の粒度を見直し、不要な全レイヤー再構築を減らす。
- [ ] `deckLayerDataCache` の invalidation 条件を文書化する。
- [ ] map generation / style変更 / layer toggle / zoom-only 更新のどれで data rebuild が発生するか計測する。
- [ ] zoom / pan では `viewState` 更新だけに抑え、data adapter が再実行されないことを確認する。
- [ ] 10k / 50k / 100k cell 相当の seed で初回描画、preset切替、zoom操作の時間を計測する。
- [ ] data adapter の重い処理は、shared geometry cache または typed array 化を検討する。
- [ ] deck.gl layer id の安定性を保ち、差分更新が効くようにする。

## Phase 6: COA / アイコン / テキスト

- [ ] COA を placeholder icon から実際の紋章表示へ移行する方式を決める。
- [ ] 候補: `COArenderer` でSVGを生成し、offscreen canvas / image bitmap / texture atlas として `IconLayer` または `BitmapLayer` に渡す。
- [ ] burg icons / marker icons / military unit icons の atlas 化を検討する。
- [ ] external marker image のCORS / load failure時の fallback を定義する。
- [ ] `TextLayer` のフォント、CJK、回転、halo / shadow、line wrapping をSVG版と比較する。
- [ ] ラベル衝突回避を deck.gl 側で完結させるか、既存SVG layout結果を adapter が読むか決める。

## Phase 7: 保存・読み込み・拡張との整合

- [ ] `.map` load 後に WebGL managed class と extension layer 再取得が壊れないことをE2E化する。
- [ ] extension-owned SVG layers は `ViewContext` に入れず、`ExtensionAPI.getSvgLayer()` 管理のままにする。
- [ ] built-in extensions の描画レイヤーを WebGL に移す場合、host module import ではなく `ExtensionAPI` 経由にする設計を先に決める。
- [ ] economy goods / markets / trade animation の deck.gl 化可否を別タスク化する。
- [ ] save / export / PNG tiles が SVG + deck.gl canvas の合成に対応しているか確認する。
- [ ] 3D preview との canvas / WebGL context 共存を確認する。

## Phase 8: テスト追加

- [x] `tests/e2e/webgl-hybrid.spec.ts` に `svg -> webglHybrid -> svg` の往復テストを追加する。
- [x] `.map` load 後の webglHybrid 再描画テストを追加する。
- [x] style presetごとの smoke test を追加する。
- [ ] layer presetごとの deck layer id と canvas pixelを検証する既存テストを維持・拡張する。
- [ ] `elementFromPoint()` によるUI stacking検査を options以外の主要UIにも拡張する。
- [ ] pick detail の kind / id / cellId / coordinate を代表レイヤー別に検証する。
- [ ] adapter単体テストで focusScope, removed entity, missing style attr, malformed route/path を追加する。
- [ ] canvas blank検出は colored pixel だけでなく alpha / bounding area も見る。

## Phase 9: 既定化の判断

`webglHybrid` を既定レンダラーにする前に、以下を確認する。

- [ ] 新規生成、seed指定生成、map load、regenerate でWebGL表示が安定する。
- [ ] 主要編集UIがWebGL pickで動く。
- [ ] SVG版との差分が許容範囲として明文化されている。
- [ ] 低性能環境やWebGL unavailable時に自動で `svg` にfallbackできる。
- [ ] renderer mode preference の保存・復元がユーザーにとって自然に動く。
- [ ] export系機能がWebGL表示時にも期待通りの画像を出力する。

## 作業時の確認コマンド

通常確認:

```bash
npm run lint
npx tsc --noEmit
npx tsc --noEmit -p tests/tsconfig.json
npx playwright test tests/e2e/webgl-hybrid.spec.ts
```

必要に応じて:

```bash
npm run madge
npx playwright test tests/e2e/layers.spec.ts
npx playwright test tests/e2e/click-edit.spec.ts
npx playwright test tests/e2e/load-map.spec.ts
```

## 実装ルール

- 新しい WebGL レイヤーは `buildDeckLayers.ts` に直接巨大化させず、まず `deckDataAdapters.ts` に `WorldContext -> deck data` の純粋変換を追加する。
- adapter は `Readonly<WorldContext>` / `Readonly<ViewContext>` を受け取り、DOMを書き換えない。
- SVG属性を読む必要がある場合は、style extraction関数として局所化し、adapter本体にDOM依存を広げない。
- `any` は使わない。未知のdeck.gl propsや外部データは `unknown` から型ガードする。
- `viewContext.svg.select("#layerName")` で typed layer があるものを探さない。既存 `ViewContext` field を使う。
- extension-owned layer は `ViewContext` に追加しない。
- WebGL migration中も SVG fallback を壊さない。
