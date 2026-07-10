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

- [ ] `public/styles/*.json` の代表スタイルを `webglHybrid` で巡回し、主要レイヤーの色・opacity・stroke幅をSVG版と比較する。
- [ ] `draw-*` renderer が参照しているSVG属性のうち、deck data adapter側に反映していないものを棚卸しする。
- [ ] `getLakePaint`, `getCoastlinePaint`, `getIcePaint`, `getLabelStyle`, `getMarkerStyle`, `getBurgIconStyle`, `getEmblemStyle` をテスト可能な小関数へ分割する。
- [ ] CSS custom properties / SVG attributes / layerState のどれをWebGL style source of truthにするか決める。
- [ ] `widthUnits: "pixels"` と map coordinate幅の使い分けをレイヤー別に明文化する。
- [ ] HiDPI時の線幅、文字サイズ、アイコンサイズを desktop / mobile で確認する。

## Phase 4: Picking と編集導線

- [ ] `WebglPickDetail.kind` と既存編集対象の対応表を作る。
- [ ] hover tooltip が SVG と WebGL で同じセル・同じ対象を指すことを確認する。
- [ ] click edit 導線をWebGL pick経由に寄せる。SVG DOM event前提の箇所は `mapInteraction.ts` か controller action に集約する。
- [ ] burg / marker / regiment / route / river / lake / province / state のクリック編集をE2E化する。
- [ ] drag系操作が必要な対象は、deck.gl pick結果から既存controllerへ渡す最小APIを定義する。
- [ ] `#debug .webgl-selected` は一時可視化として維持し、正式な選択表示に統合するか判断する。

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
- [ ] style presetごとの smoke test を追加する。
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
