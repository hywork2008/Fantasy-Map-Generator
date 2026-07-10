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
- [x] hover tooltip が SVG と WebGL で同じセル・同じ対象を指すことを確認する。
- [x] 同一点・近傍に複数オブジェクトが重なる場合の候補列挙と選択UIを定義する。
- [x] click edit 導線をWebGL pick経由に寄せる。SVG DOM event前提の箇所は `mapInteraction.ts` か controller action に集約する。burg / marker / regiment / river / route / lake / coastline / ice が対応済み。province / state は対応不要と判断（理由は対応表の下の注記）。残るは emblem / label / coastline(vertex drag) など編集導線の deeper 部分。
- [x] burg / marker / regiment / route / river / lake / province / state のクリック編集をE2E化する。province / state は「地図クリックでの個別 editor 起動」自体を実装しない判断のため対象外（下記注記）。burg / marker / river / route / coastline は `webgl-hybrid.spec.ts` の `opens existing editors from WebGL pick targets` で、lake / ice は専用テストで検証する。
- [x] drag系操作が必要な対象は、deck.gl pick結果から既存controllerへ渡す最小APIを定義する。marker で実装済み、regiment は同じAPIを拡張する形の未着手フォローアップとして残す（詳細は開始ログ）。
- [x] `#debug .webgl-selected` は一時可視化として維持し、正式な選択表示に統合するか判断する。→ 統合済み（詳細は開始ログ）。

### Phase 4 開始ログ

- WebGL pick bridge は `deckRenderer.ts` で `fmg:webgl-map-hover` / `fmg:webgl-map-pick` を dispatch し、`mapInteraction.ts` が tooltip と `#debug .webgl-selected` を受け持つ。
- `tests/e2e/webgl-hybrid.spec.ts` に、主要な編集対象レイヤーごとの `kind` / `id` / `cellId` / `coordinate` 検証を追加した。現時点で `deck.pickObject()` まで検証する対象は state / province / lake / military / river / route。burgIcon / marker は deck data identity の検証に留め、後述の重なり解決UIと合わせてクリック編集E2Eで再度扱う。
- クリック編集の本配線では、SVG DOM event の `event.target` 依存をそのまま増やさず、`WebglPickDetail` から既存 controller へ渡す adapter を `mapInteraction.ts` か controller action 側に置く。ただし単一 hit を前提にした adapter だけでは不十分で、同一点・近傍の複数 hit を扱える選択導線を先に設計する。
- `deckRenderer.ts` は `fmg:webgl-map-pick-candidates` を追加で dispatch する。候補は `pickMultipleObjects()` 由来の `WebglPickDetail[]` で、既存の `fmg:webgl-map-pick` は後方互換の primary pick として維持する。
- `mapInteraction.ts` は候補が複数ある場合に `#mapPickChooser` を表示する。候補を選ぶと `fmg:webgl-map-pick-candidate-selected` を dispatch し、暫定的に `#debug .webgl-selected` へ選択セルを表示する。
- E2E は同一座標に2つの regiment を重ね、`pickMultipleObjects()` 由来の候補が複数返ること、`layerId:id` で重複排除されること、primary pick が候補先頭と一致すること、chooser が出て任意候補を選べることを検証する。
- `deckRenderer.ts` は `pickMultipleObjects()` だけでは拾えない対象を補う semantic hit test も行う。対象は military box bbox、burg icon bbox、marker pin bbox の交差/近傍判定。軍隊矩形に隠れた burg icon や visual pick が不安定な marker pin を chooser 候補へ補完する。
- chooser 表示時は直後の従来 SVG click handler を抑止し、最前面の regiment editor が即座に開かないようにした。military 候補を選んだ場合は `regiment-<stateId>-<regimentId>-<part>` から state/regiment id を取り出し、SVG regiment DOM が無い WebGL hybrid でも Regiment Editor を開く。
- 単一の editable pick (`burgIcon` / `marker` / `military` / `river` / `route`) は chooser を出さずに `fmg:webgl-map-pick-candidate-selected` へ流す。複数候補時と同じ controller adapter を通すことで、クリック編集の入口を `WebglPickDetail` に寄せた。
- `controllers/editors.ts` は `WebglPickDetail.id` から burg / marker / regiment / river / route の既存 editor API へ変換する。`MarkersEditor.editMarker()` は WebGL hybrid で SVG marker DOM が無い場合も editor state を開けるようにし、drag 接続は SVG element が存在する場合だけ行う。
- `webgl-hybrid.spec.ts` は burg / marker / river / route の WebGL candidates と既存 editor 起動を検証する。`clickAndGetWebglPickCandidates()` は listener setup と click の race を避けるため、一時 snapshot を登録してから click する形へ更新した。
- lake / coastline / ice も WebGL pick 経由でクリック編集できるようにした。`LakesEditor.editLakeById()` / `CoastlineEditor.editCoastlineById()` は `event.target` ではなく feature id から SVG `use[data-f]` 要素を再取得して既存の open処理を呼ぶ（`editLake(event)` / `editCoastline(event)` はそれぞれこの共通処理の薄いラッパーになった）。`IceEditor.editIceById(id, isGlacier)` は `polygon[data-id][type="glacier"]` を再取得する。`isSingleClickEditablePick()` に `lake` / `coastline` / `ice` を追加し、SVG版同様に単一候補ではchooserを出さず直接editorを開く。
- 上記の実装中に判明した既存の欠落を修正: `drawHybridSvgOverlays()` は lake / coastline は毎回 `FeaturesRenderer.render()` で同期していたが、`ice` は同期していなかった（`toggleIce` の WebGL hybrid 分岐が `IceRenderer.render()` を一切呼ばないため、`#ice` SVG が空のままになりうる）。lake と同じ理由（`WEBGL_MANAGED_SVG_LAYER_IDS` にある非表示レイヤーを WebGL pick からの再選択用に実体として維持する）で `IceRenderer.render()` の呼び出しを追加した。
- province / state はSVG版でも「地図クリックで個別 editor を開く」導線がそもそも存在しない（States/Provinces Editor の一覧から `openStateEditor(stateId)` / `openProvinceEditor(provinceId)` を呼ぶのみ）。WebGL版だけに新規挙動を足すと「SVG版と実用上同等」という完了定義に反するため、地図クリックでの個別 editor 起動は実装しない。tooltip 表示（`getCellPoliticalSummary()`）のみで対応済みとする。
- テスト基盤の是正: `clickWebglEditTargetAndExpectEditor()` の「前の editor を閉じる」処理が `getByRole("button", { name: "Close all dialogs" }).first()` の実クリックに依存していたが、burg / marker / lake / ice 等の editor dialog は `dialogStore` ではなく個別の Zustand `isOpen` state を持つため `closeAllDialogs()` では閉じられず、DOM順で先頭に来る（が z-index的には背面に回っている）editorのボタンをクリックしようとして pointer interception でタイムアウトすることがあった（対象を4種から5種以上に増やすと顕在化）。`closeAllOpenEditorDialogs()` に置き換え、表示中の全 `.fmg-dialog` の Close ボタンを `page.evaluate()` 内で直接 `.click()` するようにした。
- hover tooltip parity: `showMapTooltip()`（SVG, `tooltipService.ts`）と `formatWebglPickTooltip()`（WebGL, `mapInteraction.ts`）はそれぞれ独立した実装で、state/province のセル政治サマリだけ `getCellPoliticalSummary()` として両者から個別に定義されており、文言がズレる余地があった。`cellInfoService.ts` に `getCellPoliticalSummary()` / `getStateName()` / `getProvinceName()` を切り出し、両ファイルがこれを import する形に統合した。burg / marker など他の kind は SVG 側が "Click to edit" 等の操作ヒントや人口を含む一方 WebGL 側は名前のみ、という文言差が残っているが、これは「同じセル・同じ対象を指す」ことの確認範囲外（対象特定の一致）として許容する。`webgl-hybrid.spec.ts` の `hover tooltip names the same state cell in SVG and WebGL mode` で、同一スクリーン座標での SVG hover と WebGL hover のトースト文言が一致することを検証する。
- テスト実装中に判明した副次バグ: `src/services/mapInteraction.ts` の `onMouseMove`（SVG hover）は `debounce()` という名前だが実装は leading-edge + cooldown（`utils/commonUtils.ts`）で、trailing debounce ではない。カーソルを一旦離してから戻す、のような 100ms 未満の間隔で連続 `mousemove` を送ると2回目以降が cooldown で握りつぶされる。E2E で hover を検証する場合は、間隔を開けるか単発の move にする必要がある。
- drag系の最小API: `src/types/webglPicking.ts` に `WebglDragKind` / `WebglDragDetail` を追加し、`deckRenderer.ts` が `fmg:webgl-map-drag-start` / `fmg:webgl-map-drag` / `fmg:webgl-map-drag-end` を dispatch する。deck.gl 側の `controller: false`（pan/zoom は既存の d3-zoom が担当）を踏まえ、pick 経由の drag 開始を検出したら d3-zoom のパンを止める必要がある。d3-zoom は `mousedown.zoom`（Pointer Event ではなく生の `mousedown`）を pick bridge と同じ `svg#map` ノードに bind しているため、`pointerdown` を止めても無関係で、かつ同ノード上でイベントターゲットが `svg#map` 自身になるケースでは capture/bubble の区別が効かず登録順（d3-zoom が先勝ち）になる。対策として `pointerdown` / `mousedown` の両方を `document` に `capture: true` で登録し、常に d3-zoom より先に評価されるようにした上で、drag 対象が見つかった時だけ `mousedown` 側で `stopPropagation()` する。また、単一 pick (`pickObject`) は drag 対象の位置に重なる他レイヤー（route 等）を拾うことがあるため、drag 判定は `pickMultipleObjects()` 相当の候補列挙から探す。`registerWebglDragTargetPredicate()` で「今どの pick 対象が drag 可能か」、`registerWebglDragAvailability()` で「そもそも drag 対象が存在しうるか」を controller 側（`controllers/editors.ts`）から注入し、後者は通常時（editor 未オープン）の pointerdown で毎回 `pickMultipleObjects()` を呼ばないためのコスト削減ゲート。これを入れないと通常クリックのたびに追加 GPU readback が走り、`webgl-hybrid.spec.ts` の他テスト（chooser 表示、editor 起動）がフルスイート実行時にまれにタイムアウトする形で顕在化した。
- marker がこの API のリファレンス実装: `MarkersEditor.isDragTarget()` / `hasDragTarget()` / `beginWebglMarkerDrag()` / `updateWebglMarkerDrag()` を追加し、`controllers/editors.ts` が `fmg:webgl-map-drag-*` を購読してこれらを呼ぶ。WebGL hybrid では marker の SVG 要素が存在しない（`MarkersRenderer.render()` が `drawHybridSvgOverlays()` から呼ばれないため）ので、ドラッグ中は `pack.markers[i].x/y` を直接更新し `drawLayers()` を呼んで deck.gl レイヤーを再構築する形にした（SVG版の d3-drag のような単一ノード属性更新はできない）。`webgl-hybrid.spec.ts` の `drags the selected WebGL marker without panning the map` で、マーカーが選択済み editor 経由でのみ drag 可能なこと、drag 中に地図がパンしないこと、ドラッグ量が正しく map 座標へ反映されることを検証する。
- regiment（`military` kind）は同じ `WebglPickDetail.kind` 集合に入っているが未実装のまま残した。`RegimentEditor` は position drag と rotation drag の両方が `view.armies` 配下の SVG 要素（`MilitaryRenderer.render()` も `drawHybridSvgOverlays()` からは呼ばれない）に依存しており、rotation drag 用ハンドルは `view.debug` に描画されるため動く一方、`reg.angle` を更新しても再描画（`drawLayers()`）を呼んでいないため WebGL 表示に反映されない。position drag は SVG 要素が無く d3-drag が空セレクションに対してno-opになる。フォローアップは、`WEBGL_DRAGGABLE_KINDS` に `"military"` を追加し、`RegimentEditor` にも `isDragTarget` / `hasDragTarget` / `beginWebglRegimentDrag` / `updateWebglRegimentDrag`（+ 別途 rotation 用）を実装して `controllers/editors.ts` に配線する、という marker と同じパターンで進める想定。
- `#debug .webgl-selected` は正式な選択表示として統合する判断とした。SVG版の province 選択ハイライト（`draw-provinces.ts` の `selectProvinceHighlight()`、CSS `#debug path.selected { stroke: #da3126; ... }`）と同じ「`#debug` に選択中の輪郭だけを描く」設計で、色も揃っていた（`#d0240f` は `#da3126` とほぼ同じ赤で誤差の範囲）ため、`public/index.css` に `#debug path.selected, #debug polygon.webgl-selected { ... }` をまとめて定義し、`drawWebglSelectionHighlight()`（`mapInteraction.ts`）側のインライン `stroke`/`fill`/`stroke-width` 指定を削除して CSS 側に一本化した。クラス名・E2E (`#debug .webgl-selected` の存在確認) はそのまま維持している（変更すると既存 E2E が壊れるため）。

### 重なりオブジェクトの選択方針

現状の SVG 版は描画順と DOM event target に依存しており、同じ街や同じセルに burg / marker / regiment / label / emblem / route / river が重なると、ユーザーが意図した対象を選べる保証がない。軍隊は `advanceTime()` 後に複数 regiment が同じ burg 座標へ集まりやすく、上に描かれた一部だけが実質クリック可能になる。この問題は WebGL 移行で自然には解決しないため、Phase 4 では「最前面の単一オブジェクトをクリックできること」ではなく、「カーソル近傍の編集候補を列挙し、ユーザーが対象を明示選択できること」を完了条件にする。

実装方針:

- `deck.pickObject()` ではなく `deck.pickMultipleObjects()` 相当の候補収集を使い、同一 pointer 座標の近傍から `WebglPickDetail[]` を作る。
- `pickMultipleObjects()` の候補だけに依存しない。deck data から semantic hit test を行い、描画順や picking buffer の都合で隠れた編集対象を補完する。最初の具体策は military box bbox / burg icon bbox / marker pin bbox の交差・近傍判定。
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
| `lake` | `id = lake-<featureId>` または `lake-outline-<featureId>`, `cellId = feature.firstCell` | Lake Editor | `LakesEditor.editLake(event)` が SVG path の `data-f` を読む | 対応済み: `LakesEditor.editLakeById(featureId)` |
| `burgIcon` | `id = burg-<burgId>` / `anchor-<burgId>`, `cellId`あり | Burg Editor | `BurgEditor.editBurg(dataset.id)` | `burgId` を parse して `editBurg(burgId)` |
| `marker` | `id = marker-<markerId>`, `cellId`あり | Marker Editor | `MarkersEditor.editMarker(markerI)` | `markerId` を parse して `editMarker(markerId)` |
| `military` | `id = regiment-<stateId>-<regimentId>-<part>`, `cellId`あり | Regiment Editor | `RegimentEditor.editRegiment(element)` が SVG group dataset を読む | `stateId` / `regimentId` を直接渡せる controller API が必要。暫定で `#regiment<stateId>-<regimentId>` 再選択 adapter が必要 |
| `river` | `id = river-<riverId>`, `cellId = river.cells[0]` | River Editor | `RiversEditor.editRiver("river<riverId>")` | `riverId` を parse し、既存形式 `river<riverId>` へ変換 |
| `route` | `id = route-<routeId>`, `cellId = route.cells[0]` | Route Editor | `RoutesEditor.editRoute("route<routeId>")` | `routeId` を parse し、既存形式 `route<routeId>` へ変換 |
| `coastline` | `id = coastline-<featureId>`, `cellId = feature.firstCell` | Coastline Editor | `CoastlineEditor.editCoastline(event)` | 対応済み: `CoastlineEditor.editCoastlineById(featureId)` |
| `ice` | `id = glacier-<id>` / `iceberg-<id>` | Ice Editor | `IceEditor.editIce(svgElement)` | 対応済み: `IceEditor.editIceById(id, isGlacier)` |
| `emblem` | `id = state-<id>` / `province-<id>` / `burg-<id>` | Emblem Editor | `editEmblem(..., element)` | type/id を parse して COA target を解決 |
| `label` | `id = state-label-<id>` / `burg-label-<id>` | Label Editor / related entity | `LabelsEditor.editLabel(tspan)` | SVG text/tspan 依存。label type/id 指定 API が必要 |
| `land` / `height` / `biome` / `culture` / `religion` / `zone` / `temperature` / `population` / `precipitation` / `danger` / `cell` / `grid` / `border` | 主に `cellId` | セル情報、各 overlay tooltip、必要なら該当 editor の context | hover tooltip / cell info | `cellId` を canonical input とする |
| `background` | `cellId = null` | なし | ocean tooltip | 編集対象外 |

Phase 4 の次の実装単位は、残る editor の SVG element / DOM event 依存を薄くすること。burg / marker / regiment / river / route / lake / coastline / ice は `WebglPickDetail` から既存 editor を開ける。label / emblem は id 指定 API を作るか、WebGL click では settings/editor 入口に限定する判断が必要。province / state は「地図クリックでの個別 editor 起動は実装しない」と決定した（SVG版にも同等の導線がないため）。

## Phase 5: キャッシュと性能

- [x] `buildLayerSignatures()` の粒度を見直し、不要な全レイヤー再構築を減らす。
- [x] `deckLayerDataCache` の invalidation 条件を文書化する。
- [x] map generation / style変更 / layer toggle / zoom-only 更新のどれで data rebuild が発生するか計測する。
- [x] zoom / pan では `viewState` 更新だけに抑え、data adapter が再実行されないことを確認する。
- [x] 10k / 50k / 100k cell 相当の seed で初回描画、preset切替、zoom操作の時間を計測する。
- [x] data adapter の重い処理は、shared geometry cache または typed array 化を検討する。shared geometry cache は実装済み。typed array / binary attribute 化は Phase 6 以降へ持ち越し（理由は開始ログ参照）。
- [x] deck.gl layer id の安定性を保ち、差分更新が効くようにする。

### Phase 5 開始ログ

#### style 変更時に WebGL canvas が更新されない staleness バグの修正

調査中に、`webglHybrid` モードでスタイルパネル（色・opacity・stroke width・font size 等）を操作しても deck.gl canvas に反映されない欠落が見つかった。`controllers/style.ts` の約50個の export ハンドラはいずれも SVG renderer（`GridRenderer` 等）しか呼んでおらず、`webglHybrid` 中はその SVG 要素が `hybridLayerPolicy.ts` により `display:none` にされているため、見た目上気づかれないまま deck.gl canvas が古いスタイルのまま放置されていた。`webglStyleExtractors.ts` は毎回ライブな SVG 属性を読むため、`buildDeckLayers()` さえ再実行されればスタイル変更は正しく反映される状態だった。これは Phase 3 の Style Fidelity 完了条件と矛盾するため、Phase 5 の一環として修正した。

`src/controllers/layers.ts` の `scheduleWebglUpdate()` を `export` し、`controllers/style.ts` から呼べるようにした（`toggleRelief` と同じ既存の import パターンで、`layers.ts` → `style.ts` の逆import循環は発生しない）。`webglStyleExtractors.ts` が読む属性を変更しうるハンドラに呼び出しを追加:

- 汎用ハンドラ（多数の要素種別を横断する `getEl()` 経由の変更）: `applyFillColor`, `applyStrokeColor`, `applyStrokeDasharray`, `applyStrokeLinecap`, `applySliderChange`（case ごとの精密な仕分けはせず関数末尾で一括呼び出し — lakes/coastline/ice/labels/burgIcons/emblems/armies box-size など約20種の対象を横断する dispatcher のため、個別 case 単位のガードは漏れのリスクが高いと判断）
- heightmap: `applyHeightmapScheme`, `openHeightmapSchemeDialog` の `onConfirm` コールバック, `applyHeightmapRenderOcean`, `applyHeightmapCurve`
- burg icons: `applyBurgIconsIcon`, `applyBurgIconsLinejoin`
- markers: `applyRescaleMarkers`
- フォント: `changeFontSize`（`applyFontSize`/`applyFontSizePlus`/`applyFontSizeMinus` 共通経路）, `applyFontShiftX`, `applyFontShiftY`
- style preset 適用: `applyStyleWithUiRefresh`（`changeStyle()` からのプリセット切替経由で呼ばれる）

texture / vignette / scaleBar / legend / compass / ocean pattern / grid overlay 系のハンドラは、`webglStyleExtractors.ts` が一切参照しない SVG-only 属性のみを変更するため対象外とした（Phase 2 の「texture/terrain は SVG overlay 継続」判断と整合）。

#### `buildLayerSignatures()` の粒度見直し

以前は `buildLayerSignatures()` が ~24 個の `byLayer` シグネチャを active/inactive を問わず毎回計算しており、非表示レイヤー分まで `O(cells)` のハッシュ計算が無駄になっていた（例: `toggleGrid` だけを切り替えても states/provinces/cultures/religions 等すべてのシグネチャが再計算されていた）。また `getLakePaint()` / `getCoastlinePaint()` / `getIcePaint()` / `getEmblemStyle()` / `getBurgIconStyle()` / `getMarkerStyle()` / `getLabelStyle()` は `buildDeckLayers()` 本体とシグネチャ計算の両方から呼ばれ、二重に実行されていた。

修正後は `useLayerState` の `activeLayers` を渡して各 `byLayer` エントリを該当トグルが有効な場合のみ計算し、上記 style/paint オブジェクトは呼び出し側で一度だけ計算した値を再利用する。`geometry` / `landGeometry` / `gridGeometry` / `states` / `provinces` / `cultures` / `religions` 等、複数キーが共有する base シグネチャは `memo()` ヘルパーで遅延評価・使い回しにした。`getCachedDeckData()` 自体のキャッシュキー集合や invalidation の仕組み（signature 文字列一致判定）は変更していない — 純粋にシグネチャ*計算*の無駄を削減する変更。

#### `deckLayerDataCache` invalidation 条件

| cache key | invalidate する入力 |
| :-- | :-- |
| `background` | `mapId`, `graphWidth`/`graphHeight`, ocean fill color |
| `land` | `mapId`, focus scope, `pack.vertices.p`/`pack.cells.v` 内容, `pack.cells.h` 内容, land fill color |
| `land-geometry`（shared land cell 座標、後述） | `mapId`, focus scope, `pack.vertices.p`/`pack.cells.v`/`pack.cells.h` 内容のみ。fill color には依存しない |
| `height` | `mapId`, focus scope, `grid.vertices.p`/`grid.cells.v` 内容, `grid.cells.h` 内容, height scheme/opacity/includeOcean |
| `biomes` | land geometry（上記`land`と同条件）+ `pack.cells.biome` 内容 + `biomesData.color` 内容 |
| `religions` / `religions-boundaries` | land geometry + `pack.cells.religion` 内容 + `pack.religions[].color` 内容 |
| `cultures` / `cultures-boundaries` | land geometry + `pack.cells.culture` 内容 + `pack.cultures[].color` 内容 |
| `states` / `states-boundaries` | land geometry + `pack.cells.state` 内容 + `pack.states[].color` 内容 |
| `provinces` / `provinces-boundaries` | land geometry + `pack.cells.province` 内容 + `pack.provinces[].color` 内容 |
| `zones` | land geometry + `pack.zones[]` の `color`/`hidden`/`cells` 内容 |
| `temperature` | `mapId`, focus scope, `pack.vertices.p`/`pack.cells.v` 内容, `pack.cells.g` 内容, `grid.cells.temp` 内容 |
| `population` | land geometry + `pack.cells.pop` 内容 |
| `precipitation` | land geometry + `pack.cells.g` 内容 + `grid.cells.prec` 内容 |
| `danger` | land geometry + `pack.cells.danger` 内容 |
| `lakes` / `lakes-outlines` | `mapId`, focus scope, `pack.vertices.p`/`pack.cells.v` 内容, `pack.features`(type=lake) 内容, lake paint（fill/stroke/stroke-width、SVG由来） |
| `coastline` | 同上の geometry + `pack.features`(type=island) 内容 + coastline paint。**常時 active** 扱いで、他レイヤーの表示状態に関わらず毎回シグネチャを計算する |
| `ice` | focus scope + `pack.ice[]` 内容 + ice paint |
| `emblems` | focus scope + `pack.states`/`pack.provinces`/`pack.burgs` の coa 関連フィールド + emblem style（opacity/size、SVG由来） |
| `burgIcons` | focus scope + `pack.burgs[]` 内容 + burg icon style（SVG由来 or `worldContext.style` fallback） |
| `markers` | focus scope + `pack.markers[]` 内容 + marker style（pinned/rescale/scale） |
| `military` | focus scope + `pack.states[]`（regiment関連）内容 + `armies` box-size |
| `labels` | focus scope + `pack.states`/`pack.burgs` 内容 + label style（SVG由来 or `worldContext.style` fallback） |
| `cells` | `mapId`, focus scope, `pack.vertices.p`/`pack.cells.v` 内容 |
| `grid` | 上記 + `pack.cells.c` 内容 |
| `rivers` | `mapId`, focus scope, `pack.rivers[]` 内容 |
| `borders` | land geometry + states/provinces 内容 + `pack.cells.c` 内容 |
| `routes` | `mapId`, focus scope, `pack.routes[]` 内容 |

`ice` / `emblems` / `burgIcons` / `markers` / `military` / `labels` は `mapId` や geometry シグネチャを含まず、対象配列の内容ハッシュのみで invalidate される（content-addressed）。マップ生成をまたいでも配列内容が偶然一致すればキャッシュが理論上共有されうるが、実用上は問題にならない（`deckDataAdapters.test.ts` の in-place mutation テストで挙動を確認済み）。`deckLayerDataCache` はキー集合が固定（~20個 + `land-geometry`）で `clearDeckLayerDataCache()` は本番コードパスからは呼ばれない（テストの `beforeEach` のみ）— 古いエントリが無限に蓄積されるのではなく、シグネチャ不一致のたびに同じキーが上書きされるだけなので実害はない。

#### rebuild トリガーの実態

| トリガー | data rebuild が発生するか |
| :-- | :-- |
| map generation（`worldContext.mapId` 更新） | 発生する。`mapId` が geometry 系シグネチャのほぼ全てに含まれるため実質全レイヤー再構築 |
| style 変更（色・opacity・stroke width・font size 等） | 修正前は**発生しなかった**（上記バグ）。修正後は該当ハンドラで `scheduleWebglUpdate()` が呼ばれ、次の rAF で再構築される |
| layer toggle | 発生するが、`buildLayerSignatures()` の粒度修正後は該当レイヤーの signature のみ計算・比較され、他の active レイヤーは cache hit で `data` 参照を再利用する（`deckDataAdapters.test.ts` の stability テストで検証） |
| zoom / pan | 発生しない。`DeckGlRenderer.syncViewState()` は `viewState`/`width`/`height` の `setProps` のみ行い `buildDeckLayers()` を一切呼ばない（`deckRenderer.test.ts` で回帰テスト化） |

#### 10k / 50k / 100k cell 性能計測

`npm run perf:webgl-layers`（`scripts/benchmarkWebglLayers.ts`）を追加した。共有頂点を持つ合成 grid mesh 上で、cell 数に依存するレイヤー（height/biomes/states/provinces/temperature/population/precipitation/danger/cells/grid/borders）のみを対象に、cold cache 初回描画・preset 切替・signature 不変の repeat call（zoom/pan が実際には辿らない経路の upper bound）を計測する。burgIcons/markers/military/labels/emblems はセル数ではなくエンティティ数に依存するため合成データでは意図的に空にし、対象外とした。

実行結果例（開発機、単発計測。JIT warm-up 用に 2,000 cell の捨てラン後に計測）:

| cells | initial draw (ms) | preset switch (ms) | zoom-only / full cache hit (ms) |
| --: | --: | --: | --: |
| 10,000 | 95.3 | 22.8 | 0.5 |
| 50,000 | 516.9 | 98.4 | 1.7 |
| 100,000 | 915.8 | 407.6 | 3.2 |

cache hit のみのケース（zoom/pan 相当）は cell 数に対してほぼ一定かつ低コストで、実装が意図通り機能していることを裏付ける。preset 切替は初回描画よりかなり速いが、切替後に新たに active になったレイヤーの再構築コストがそのまま残るため cell 数に応じて増える。

#### shared land-cell geometry cache

`biomes`/`cultures`/`religions`/`states`/`provinces`/`zones`/`precipitation`/`danger`/`population`/`land` の10レイヤーは全て `h >= 20` の land cell に対する同一の頂点→ポリゴン変換を独立に行っていた。`deckDataAdapters.ts` に `buildLandCellGeometry()` を追加し、`buildDeckLayers()` 側で `land-geometry` cache key（`landGeometry` シグネチャのみに依存し、fill color には依存しない）を介して1回だけ計算した結果を上記10レイヤーすべてで再利用するようにした（`buildLandPolygons()` の新しい任意引数 `landCells` 経由）。既存の直接呼び出し・単体テストとの互換性のため、`landCells` 未指定時は従来通り内部で再計算するフォールバックを残した。

typed array / binary attribute 化（`Float32Array` の positions/colors を deck.gl に直接渡し、`getPolygon`/`getFillColor` アクセサでの per-datum オブジェクト生成を避ける方式）は、adapter の出力形状そのものを作り替える必要がある大きな構造変更のため、Phase 2 が texture/terrain の deck.gl 化を Phase 6 以降に持ち越したのと同じ理由で今回は着手せず、Phase 6 以降の課題として残す。

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
