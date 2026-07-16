# テスト修正の振り返り(2026-07-17)

`npm run test`(vitest)と`npm run test:e2e`(Playwright)の失敗を「ソースコードの動作を正とする」方針で修正した際の記録。単体テスト5件・E2Eテスト約30件超を修正したが、特にE2E側は原因特定にかなりの時間を要した。ここではその作業から得られた知見を、後続の作業者(人間・エージェント問わず)のためにまとめる。

## 全体傾向: 失敗の9割は「アプリのバグ」ではなく「テストの経年劣化」だった

今回発見した失敗のほぼ全ては、実装側の意図的な変更にテストが追従していなかったケースであり、アプリ自体の不具合ではなかった。裏を返すと、「テストが落ちている = 実装にバグがある」と決めつけて実装側を直そうとすると、正しい設計変更を壊すリスクがある。逆に「テストが古いはず」と決めつけて機械的にテストだけ書き換えるのも危険で、実際に1件(`src/ui/dialogs/ProvincesEditorDialog.tsx`の`id`追加を検討→撤回した件、後述)は最終判断を誤りかけた。

以降、劣化のパターンを分類する。

---

## パターン1: React移行によるDOM構造・id変更にテストが追従していない

このリポジトリはjQuery時代のUIをReact/Zustandへ移行中(`AGENTS.md` §4)。移行時にDOM構造やidが変わったが、E2Eテストの一部は旧UIの構造を前提にしたままだった。

| 旧テストの前提 | 現在の実装 | 該当コミット |
| :--- | :--- | :--- |
| `#optionsTrigger`をクリックしてメニューを開く | ボタンidは`#optionsHide`に改名(`OptionsContainer.tsx`) | `e87d719ac` (React移行) |
| `#options`要素自体が開閉で表示/非表示になる | `#options`は常にDOM上に存在し、**中身(タブ内容)だけ**が`isMenuOpen`で出し入れされる | 同上 |
| `#mapLayers > li`(リスト構造) | `#mapLayers > button`(フラットなボタン列、`LayersTab.tsx`) | 不明(調査時点で既に移行済み) |
| `#statesBodySection > div[data-id]` | `@tanstack/react-virtual`による仮想化テーブルの`<tr data-id>` (`StatesEditorDialog.tsx` + `VirtualTableBody.tsx`) | 不明 |

**教訓**: UIをReact化・仮想化するリファクタでは、対象のDOM要素を`tests/e2e/`から`grep`して洗い出してから着手しないと、後から誰かがまとめて調査する羽目になる。逆に言えば、テスト側の修正者は「この`id`は本当に今も存在するか」を必ず`grep -rn "id=\"xxx\""`  src/ で確認すること。存在しなければ、それは十中八九このパターン。

**"#options"の見えない罠**: `#options`は要素として常に存在するため、`toBeVisible()`は常にtrueになる。つまり「開閉のテスト」のつもりで`expect(page.locator("#options")).toBeVisible()`と書いても、実際には何も検証していない**壊れていないように見えるテスト**になってしまう。今回は`isOptionsMenuOpen()`ヘルパー(`#optionsHide`のグリフ`►`/`◄`を読む)を新設し、意味のある検証に置き換えた。「見た目上パスしている」テストが実は無意味だったケースがあることは、失敗しているテストの調査以上に注意が必要。

---

## パターン2: 新機能がデフォルトで有効化され、既存のテストフィクスチャが対応しきれていない

`src/generators/military-generator.test.ts`の5件中2件は、"military quality system"機能(コミット`03d50924`ほか)で導入された`simManpower: true`(デフォルトON)が原因だった。

- `Military.generate()`実行後、`isManpowerSimEnabled()`が真なら`reconcileAllStatesManpower()`が呼ばれ、生成された兵力を`cells.maleAdults`/`burg.demographics.maleAdults`から差し引く。
- テストのモック`pack`には`maleAdults`/`femaleAdults`が存在しない(`undefined ?? 0`で0扱い)。
- `removeCivilianMalePeople()`は利用可能な男性人口が0なら「引けた人数/必要人数 = 0」の倍率を全兵力に掛けて**全ての連隊の兵力を0にスケール**する。
- 結果、`totalFieldTroops`や`capitalGuard.a`が常に0になり、`toBeGreaterThan(0)`系のアサーションが軒並み失敗する。

**この種の失敗が厄介な理由**: エラーメッセージは単に`expected 0 to be greater than 0`で、どこにも「男性人口データが無い」とは書かれていない。`Military.generate()`内の乗算チェーンを`git blame`/`grep`で遡り、最終的に`manpower.ts`の`reconcileStateManpower()`→`removeCivilianMalePeople()`まで辿って初めて「0除算的な倍率」が原因だと分かった。**シミュレーション系のグローバルなデフォルト値(オプトイン→オプトアウトへの切り替え)は、直接ジェネレータを呼ぶ単体テストのフィクスチャを静かに壊す**という点は、今後も繰り返し起こりうる。

**教訓**: `useOptionsState`のデフォルト値を変更する(特に`false→true`)PRでは、そのフラグを参照する生成ロジックを直接呼んでいる`*.test.ts`のフィクスチャに、新しく必須になったフィールド(今回は`cells.maleAdults/femaleAdults`)が含まれているか確認する。`main.ts`の実際のシード処理(`packCells.maleAdults[i] = packCells.pop[i] * 0.2205`)をコピーして修正した。

---

## パターン3: 共有リストへの項目追加が、複数テストに逆方向の影響を与えた

コミット`a41ccc93`(WebGL版トレードアニメーション対応)は`hybridLayerPolicy.ts`の`WEBGL_MANAGED_SVG_LAYER_IDS`配列に`"tradeAnimation"`を追加した。これは正しい・意図的な変更だが、**同じ配列を参照する既存テストが2つあり、それぞれ逆方向に壊れた**:

1. `applies the hybrid SVG layer policy...`: 配列を全走査して「全レイヤーが`exists:true, hasManagedClass:true`になっているか」を検証するテスト。`tradeAnimation`はEconomy拡張が有効な時にしかDOMに存在しないSVG要素だが、このテストは拡張を有効化していなかった→`exists:false`で失敗。
2. `reacquires Economy SVG layers...`: 逆に、Economy拡張のレイヤーが**ホスト管理クラスを持っていないこと**(=拡張独自にdeck.glで描画される)を検証するテストで、`tradeAnimation`も含めてチェックしていた。しかし`tradeAnimation`は今回の変更で意図的にホスト管理対象になったので、他の拡張レイヤー(`goods`, `marketsLayer`など)と同じ扱いを期待するのは古い前提だった。

**教訓**: 「配列に1行足すだけ」の変更でも、その配列を`for...of`で全走査しているテストは全て見直す必要がある。特に、配列の要素が実行時条件(拡張の有効化など)に依存して存在したりしなかったりする場合、テストのセットアップ(`beforeEach`)がその条件を満たしているとは限らない。

---

## パターン4: 意図的な描画順序変更にスナップショット的アサーションが追従していない

コミット`46885493`(「WebGLレイヤーの描画順をSVGのスタッキング順に合わせる」)は`buildDeckLayers.ts`内で`emblems`/`burg-icons`/`markers`を`coastline`の**後**に描画するよう並び替えた。コミットメッセージ自体が変更内容を明言しているにも関わらず、同じPRで`deckDataAdapters.test.ts`の`toEqual([...])`という順序に敏感なアサーションは更新されていなかった。

**教訓**: レイヤー描画順・配列の並び順を意図的に変えるコミットは、`toEqual`で完全一致比較しているテストを`grep`し、機械的に更新対象へ含めること。lintやtscでは検出できない類のズレ。

---

## パターン5: 兄弟コンポーネント間で命名規約が割れており、「どちらが正か」の判断に時間がかかった

`states.spec.ts`の`#provincesEditor`(存在しない)というアサーション失敗の調査で、`ProvincesEditorDialog.tsx`は中身を`<div id="provincesEditorContainer">`で包んでいるだけで、`#provincesEditor`という裸のidは無いことが判明した。

最初は「States/Biomes/Cultures/Religions/Emblemsは全部`<div id="xxxEditor">`という裸idパターンなのに、Provincesだけ無いのはおかしい」と考え、**ソース側に`id="provincesEditor"`を追加する方向**で一度実装した。しかし economy拡張のダイアログ(Goods/Markets/Production等、**13個中13個全て**)を横断調査したところ、そちらは完全に`"{name}EditorContainer"`型で統一されており、裸idは1つも無かった。さらにコア側にも`DiplomacyEditorDialog.tsx`という同型の先例(`diplomacyEditorContainer`のみ)が既にあった。

つまり実態は「5つの古いダイアログ(裸id) vs. Provinces/Diplomacy/economy拡張全体(Containerサフィックス)」であり、後者の方が新しい・広く使われている規約である可能性が高いと判断し、**ソース変更を撤回してテスト側を`#provincesEditorContainer`/`#goodsEditorContainer`/`#marketsOverviewContainer`に合わせる方針に切り替えた**。

**教訓**: 「片方だけ変」に見えるコンポーネントを見つけたら、直す前に**同系統の兄弟コンポーネントを横断的に`grep`して多数派を確認する**こと。今回のように、少数派だと思っていたものが実は別モジュール(拡張機能)まで含めると多数派だった、というケースがある。ソースを1行足すだけの安全そうな変更でも、規約の実態を誤認したまま入れると将来の一貫性をかえって損なう。

---

## パターン6: 同じ表示文言のボタンが2つ存在するようになり、`getByRole`が曖昧になった

`ToolsTab.tsx`の「Edit」セクションには`States`という編集ボタンがあり、「Regenerate」セクションにも同じ`States`という文言の再生成ボタンがある。`page.getByRole("button", { name: "States", exact: true })`は`exact: true`を付けていても**アクセシブルネームが同じなら複数要素にマッチしうる**ため、Playwrightの strict mode 違反になる。同様の衝突が`Provinces`/`Goods`/`Markets`でも発生していた。

**教訓**: ツールパネルに「編集」ボタンと「再生成」ボタンが両方存在するUIでは、同じラベルの衝突が起きやすい。`id`が無いボタンは`data-tip`(ツールチップ文言)がほぼ確実にユニークなので、`button[data-tip="..."]`で選択する方が安全。今回もこの方式に統一した。

---

## パターン7: WebGLハイブリッドレンダラー特有の「見えない状態」の食い違い

`webgl-hybrid.spec.ts`の修正が最も時間を要した。理由は、失敗の症状(タイムアウトや値の不一致)から原因を逆算するのが難しい種類のバグが集中していたため。

### 7-1. `clear()`と`finalize()`の違い

`svg`↔`webglHybrid`のモード切り替えは`DeckGlRenderer.clear()`(`controllers/layers.ts`の`drawLayers()`経由)を通る。これは deck.gl の**レイヤーを空にしてCSSクラスを剥がすだけ**で、`viewContext.webglDeck`自体はnullにしない(再切り替えを高速化するための意図的な設計)。`webglDeck`を完全に破棄するのは`finalize()`(ページ終了・マップ再読込時のみ)。

テストは「svgに戻したらdeckExists:falseになるはず」という、finalize相当の完全破棄を期待しており、実際の(意図的な)軽量クリアの挙動と食い違っていた。テストヘルパーには`deckLayersSuspended`という、まさにこの「生きてはいるが空」の状態を表すフィールドが既に用意されていたが、テスト本体はそれを使わず`deckExists:false`をチェックしていた。**ヘルパーの設計自体が正しい挙動を知っていたのに、テストの記述がそれに追従していなかった**という珍しいケース。

### 7-2. ラベル(テキスト)がWebGLキャンバスの上に本物のSVG要素として乗っている

`docs/webgl-renderer-migration-candidates.md`にある通り、`HYBRID_SVG_OVERLAY_LAYER_IDS`(`labels`など)はハイブリッドモードでも実SVG要素として残り、キャンバスの**上**にクリック可能な状態で乗っている(ラベル編集ダイアログをクリックで開けるようにするため)。

`getFirstStateScreenPoint()`や`getFirstWebglLayerDatumClickPoint()`といったテストヘルパーは、川・ルート・隣接する集落アイコンを避けるロジックは持っていたが、**その州/集落自身の名前ラベル**を避けるロジックが無かった。ラベルは州の中心(`state.center`)や集落アイコンのすぐ隣という、まさにこれらのヘルパーが「一番良い候補点」として選びがちな座標に描画される。`page.mouse.click(x, y)`は実際のOSレベルのクリックなので、テキスト要素がその座標を覆っていれば、クリックはそこで止まり、deck.glのピッキングイベントは一切発火しない。

この失敗はPlaywrightのエラーメッセージからは一切わからない。`page.waitForFunction(...)`はただ「30秒待ってタイムアウトした」としか言わず、**何がクリックを吸収したのか**は教えてくれない。原因を突き止めるには、`document.elementFromPoint(x, y)`を挟んだ再現スクリプトを都度書き、実際にどのDOM要素がその座標にあるかを直接確認する必要があった(スクリーンショットも有効)。

同様に、ダイアログ(`.fmg-dialog`)自体が地図の上に大きく被さっているケースもあった。小さいビューポート(900×600)で再現したときは「ダイアログに隠れている」ように見えたが、実際のテストスイートの固定ビューポート(1280×720、`playwright.config.ts`)で再現し直すと「ラベルに隠れている」だった、というように**再現環境のビューポートを実際の設定と合わせないと誤った原因を掴んでしまう**罠もあった。

**教訓**: 「地図上の任意の点をクリックする」系のテストヘルパーは、
1. 川・ルート・アイコンだけでなく**ラベル(テキスト)**、
2. 開いている**ダイアログ**、
3. その他のオーバーレイ全般(`isHybridSvgOverlayElement()`や`.fmg-webgl-svg-overlay-layer`クラスで判定可能)、
の3つを避けるべき。ヘルパーが「候補点を1つ計算して返す」設計だと、その1点がたまたま覆われているだけで詰む。今回は「候補になり得るセル/データ点を複数持ち、覆われていないものが見つかるまで探す」設計に直した(`getFirstStateScreenPoint`は州単位、`getFirstWebglLayerDatumClickPoint`は`elementFromPoint`によるガードを追加)。

### 7-3. 3Dビュー(`viewMesh`)での集落アイコンの再配置バグ(未解決)

`opens Edit Burg when a low-poly viewMesh icon is clicked`のみ、原因を特定できずに終わった唯一のテスト。`forceThreeDBurgFixture()`は集落を地図中心へ強制移動させ(`burg.x = graphWidth/2`など)、クリック位置を安定させる設計だが、実際には**再配置後もその集落の3Dアイコンは移動前の位置からピック不能**であることを、キャンバス全面のグリッド探索で確認した。以下を1つずつ切り分けたが、いずれも再現しなかった:

- 特定の集落(先頭の集落、首都)固有の問題か → 別の集落(id=21, town)でも再現した。
- 座標の再配置先(ちょうど中心座標)が特殊(メッシュの継ぎ目等)か → 中心以外のランダムなオフセット座標でも再現した。
- `viewMesh`の再構築(off→on)でキャッシュが解消されるか → 解消されなかった。
- サテライトテクスチャモード固有か → サテライト無しでも再現した。

つまり「**`pack.burgs[i].x/y`への直接代入は、3Dの低ポリ集落アイコンの実際の描画/ピック位置に一切反映されない**」という現象だけを確定できたが、`three-d-renderer.ts`内の`createLowPolyBurgIcons()`/`scheduleTerrainOverlays()`のどこで無視されているかまでは、実行時ログを仕込んでの追跡が必要で、テスト修正の範囲を超えると判断し保留した。テスト側の対処として、クリック位置のずれ(0.35→0.2)は改善したが、根本のフィクスチャ不具合は解決していない。

**教訓**: 「直接データを書き換えれば描画に反映されるはず」という前提は、キャッシュ・progressive build・別ソースオブトゥルース(SVG属性がスタイルの正とされる、等)を持つレンダラーでは必ずしも成立しない。今回もこの前提のズレが疑われるが、確証を得るには本来ソース側にデバッグログを仕込んで再現する必要があり、「テストを直す」作業の枠を超える。

---

## なぜ時間がかかったか: 症状から原因への距離が長い

今回の作業を振り返ると、時間がかかった理由は共通して「**テストランナーが返すエラーメッセージと、実際の壊れた場所との距離が遠い**」ことに尽きる。

- `expect(0).toBeGreaterThan(0)` → 実際の原因は5階層下の`removeCivilianMalePeople()`の0除算的スケーリング。
- `Test timeout of 30000ms exceeded`(`waitForFunction`) → 実際の原因はクリック座標に重なった1つのテキスト要素。エラーメッセージにその要素の情報は一切出てこない。
- `strict mode violation: resolved to 2 elements` → これは数少ない「原因がエラーメッセージに書いてある」パターンで、相対的に早く直せた。

**タイムアウト系の失敗は、まず`page.screenshot()`と`document.elementFromPoint(x, y)`で「その瞬間に何が画面のその位置にあったか」を目視確認するのが最短経路**だった。憶測でロジックを読むより先に、実際に何がクリックを奪っているかを1回のスクリプトで確認する方が速い。

またWebGL/deck.gl関連は、チェックサムやピクセル差分に依存するテスト(`getCanvasColorChecksum`など)がいくつかあり、これらは**ヘッドレス・ソフトウェアレンダリング環境ではワーカー並列数や負荷によって結果が変わりうる**(=真のフレーク)。一度で「バグ」と「フレーク」を区別するのは無理で、同じテストを

1. フルスイート(並列)で実行
2. 単独(`--workers=1`)で1回実行
3. 単独で複数回実行

の3段階で試して、常に同じ結果になるものだけを「本当の不具合/テスト不備」として扱った。1回の失敗だけを見て修正しようとすると、フレークなテストを無意味にいじり回すことになる。

---

## 次回への簡易チェックリスト

- [ ] DOM要素の`id`やクラス名を変更・削除する前に、`tests/e2e/`全体を`grep`する。
- [ ] `useOptionsState`等のグローバル設定のデフォルト値を変える(特にopt-in→opt-out化)際は、対象の生成ロジックを直接呼ぶ単体テストのフィクスチャが、新たに前提とするフィールドを持っているか確認する。
- [ ] 共有配列(`WEBGL_MANAGED_SVG_LAYER_IDS`等)に項目を足す際は、その配列を全走査しているテストを`grep`し、要素が実行時条件付きで存在するかどうかを確認する。
- [ ] 描画順序や配列の並びを意図的に変えたら、`toEqual([...])`で順序比較しているテストを併せて更新する。
- [ ] 「片方だけ変」に見えるコンポーネントは、直す前に兄弟コンポーネント(拡張機能も含む)を横断`grep`し多数派を確認してから、ソースかテストかを決める。
- [ ] 同じ文言のボタンが「編集」と「再生成」で両方存在しうるUIでは、`getByRole(name:)`ではなく`data-tip`等ユニークな属性で選択する。
- [ ] 地図上の座標をクリックするテストヘルパーは、ラベル・ダイアログ・その他オーバーレイに覆われていないかを`document.elementFromPoint`相当でチェックし、複数候補から未使用の点を探す設計にする。
- [ ] `page.waitForFunction`がタイムアウトしたら、まず疑うべきは「クリックが意図した要素に届いていない」。`page.screenshot()`と`elementFromPoint`で即座に確認する。
- [ ] チェックサム/ピクセル比較に依存するテストが落ちたら、まず`--workers=1`かつ単独実行で再現するか確認し、フルスイート並列実行でのみ落ちるならフレークとして切り分ける。
