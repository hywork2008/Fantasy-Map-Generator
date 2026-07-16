# 未修正の不具合とテスト診断性向上の修正案(次セッション引き継ぎ)

`docs/debug/0717-test-suite-fixes-retrospective.md`(2026-07-17のテスト修正振り返り)で見つかったが**未着手**のタスクをここにまとめる。このドキュメントは**修正の実装計画そのものではなく**、次のセッションが着手する際の起点として書いている。優先順位はユーザーとまだ合意していない。

対象は大きく2つ:
1. テスト修正の過程で見つかった、プロダクトコード側の未修正の不具合(§1)。
2. 「エラーメッセージと実際の原因の間の距離が長い」ことへの改善案(§2)。いずれもまだ実装していない。

---

## 1. 未修正の不具合

### 1.1 [解決済み 2026-07-17 追加調査] 3Dビュー(viewMesh)で集落を再配置しても低ポリアイコンのクリック判定位置に反映されない

**追記(2026-07-17、別セッション)**: 根本原因は`three-d-renderer.ts`側ではなく、**テストフィクスチャ`forceThreeDBurgFixture()`自体のバグ**だった。同関数は対象集落を`groupName`(`options.burgs.groups[0].name`、このseedでは`"capital"`)へ強制的に再割り当てした上で、その**グループ全体**のSVG要素に`data-size=400`を設定していた。`buildLowPolyBurgSymbols()`のアイコンサイズはグループ単位のスタイル(`getBurgIconStyle()`)から決まるため、この変更は対象の1集落だけでなく**同じ`"capital"`グループに属する集落全て(このseedでは17件)**を巨大な球体アイコンに変えてしまい、地図中央付近で多数の巨大アイコンが重なり合った結果、レイキャストが対象と異なる集落(例: `Breimel`)を拾っていた。`pack.burgs[i].x/y`への直接代入自体は正しく3D側に反映されており、「再配置が無視される」という当初の仮説は誤りだった。
修正(`tests/e2e/helpers/fmg-helpers.ts`の`forceThreeDBurgFixture()`): `data-size`変更で巻き添えになる同グループの他の集落を、`options.burgs.groups`に存在しないダミーgroup名へ再割り当てし、`buildLowPolyBurgSymbols()`の`visibleGroups`チェックで3Dシーンから除外することで、対象集落のアイコンのみを残すようにした。あわせて、カメラ・地形フレーミングに依存する固定クリック座標(`bounds.height * 0.2`等)をやめ、`clickLowPolyBurgIconUntilSelected()`(キャンバス全面グリッド探索+実際の`pointerdown`/`pointerup`イベント)に置き換え、将来のフレーミング変更にも耐性を持たせた。関連テストは`--workers=1`で8回連続、フルスイートで43/43成功を確認済み。

以下は解決前の調査ログ(誤っていた「未確認の仮説」を含むため、上記の追記を正としてください)。

- **ファイル**: `src/renderers/three-d-renderer.ts`、`createLowPolyBurgIcons()` / `scheduleTerrainOverlays()`
- **経緯**: `docs/webgl-renderer-migration-candidates.md`のWebGLハイブリッドレンダラーには、SVGとは別に3D表示(`viewMesh`)がある。3D表示では集落(burg)を低ポリのインスタンス化メッシュ(`THREE.InstancedMesh`)として描画し、`pickBurgAt()`でレイキャストによりクリック判定を行う。テスト用フィクスチャ`forceThreeDBurgFixture()`(`tests/e2e/helpers/fmg-helpers.ts`)は、クリック位置を安定させるため`burg.x`/`burg.y`を地図中央へ直接書き換えるが、**再配置後もその集落の3Dアイコンは元の位置relatedのままクリック不能**であることを、キャンバス全面のグリッド探索(`document.addEventListener("fmg:3d-burg-select", ...)`を仕込んで9×9〜10×10グリッドで総当たりクリック)で確認した。
- **失敗シナリオ**: `pack.burgs[i].x`/`y`を直接更新しても、3Dの低ポリアイコンの実際の描画位置・ピック判定位置には反映されない。実際のプロダクト操作でも「集落エディタ等で集落を移動させた直後に3Dビューへ切り替え、その集落アイコンをクリックする」という操作で同じ症状が起きる可能性がある(未検証)。
- **切り分け済みで否定された仮説**:
  - 特定の集落(先頭の集落/首都)固有の問題か → 別の集落(id=21, town group)でも再現し、否定。
  - 再配置先の座標(ちょうど地図中央)がメッシュの継ぎ目等で特殊か → 中央以外のランダムなオフセット座標でも再現し、否定。
  - `viewMesh`のOFF→ON切り替えで内部キャッシュが解消されるか → 解消されず、否定。
  - サテライトテクスチャモード(`#options3dSatellite`)固有の問題か → サテライト無しでも再現し、否定。
- **未確認のまま残っている仮説**: `createLowPolyBurgIcons()`内の`buildLowPolyBurgSymbols(worldContext, ...)`は`burg.x`/`burg.y`を直接読んでおり、コードレビュー上は最新値を反映するはずに見える。したがって「反映されない」原因は以下のいずれかと推測されるが、いずれも実行時ログでの確認が必要:
  - `scheduleTerrainOverlays()`が呼ばれるタイミングが、実際にはフィクスチャの代入より**前**である(何らかの理由で`viewMesh`初回表示時に先行して1度ビルドが走っている等)。
  - `mesh.userData.burgIds`と`instanceId`の対応関係、または`InstancedMesh`の`count`のprogressive reveal(`ICONS_PER_FRAME`ごとに`requestAnimationFrame`で段階的に表示)に、特定条件で取りこぼしがある。
  - フィクスチャ自体が想定通りに動作していない(例: `burg.group`の変更や`data-size`属性の設定が、実際には3D側のスタイル計算に影響しない)。
- **重大度**: 低〜中。テスト専用のフィクスチャ限定の不具合である可能性が高いが、実プレイでも「集落移動直後の3Dクリック判定」に影響する可能性がありゼロではない。
- **関連テスト**: `tests/e2e/webgl-hybrid.spec.ts`の`opens Edit Burg when a low-poly viewMesh icon is clicked`。現状はクリック位置のずれ(旧: `bounds.height * 0.35`)を`0.2`に補正して**一部の症状(「何も見つからない」タイムアウト)だけ回避**しているが、これは対症療法であり、根本原因(再配置が反映されない)は未解決。テストは現在「間違った集落(Breimel)が開いてしまう」というアサーション失敗で赤のまま。
- **次にやること**: `three-d-renderer.ts`の`createLowPolyBurgIcons()`/`scheduleTerrainOverlays()`に一時的な`console.debug`(対象burgIdの座標・batch index・instance index)を仕込み、`npm run dev`+実ブラウザ操作 or Playwrightの`page.on("console", ...)`で、再配置後のビルドで対象burgがどの座標としてインスタンス化されているかを直接確認する。

---

## 2. テスト・開発時の可観測性向上の修正案(未実装)

いずれも「エラーメッセージと実際の原因の間の距離が長い」ことへの対策。テスト修正セッションで発見した、今後同種の調査コストを繰り返さないための改善案。**まだコードは変更していない。**

### 2.1 Playwrightのtrace設定が実質機能していない

- **ファイル**: `playwright.config.ts`
- **現状**: `retries: 0`(常に)かつ`use.trace: 'on-first-retry'`。リトライが発生しない設定のため、`on-first-retry`は永久に発火せず、**失敗時のtrace(DOM操作録画・スクリーンショット・ネットワークログ)が一切保存されない**。
- **提案**:
  - `use.trace`を`'retain-on-failure'`に変更する(初回失敗時点でも保存、成功時は破棄されるのでストレージ肥大の心配は小さい)。
  - または、CI(`isCI`)だけ`retries: 1`にし、`on-first-retry`のままでも実質的にtraceが記録されるようにする。
- **見込む効果**: 今回`clickAndGetWebglPickCandidates`系のタイムアウトの原因調査に、`document.elementFromPoint()`を仕込んだ再現スクリプトを何度も手書きしたが、traceが残っていれば`npx playwright show-trace <file>`でクリック時点のDOMスナップショットを直接見れば済んでいたはずの作業。
- **リスク**: 実行時間・保存容量の微増のみ。副作用なし。

### 2.2 地図クリック系のテストヘルパーが、失敗時に無診断でタイムアウトする

- **ファイル**: `tests/e2e/helpers/fmg-helpers.ts`の`clickAndGetWebglPickCandidates()`、および`tests/e2e/webgl-hybrid.spec.ts`内のローカル関数群(`getFirstWebglLayerDatumClickPoint`等)
- **現状**: `page.mouse.click(point.x, point.y)`の後、`page.waitForFunction(() => Boolean(window.__fmgWebglPickCandidatesSnapshot))`で deck.gl のピックイベント発火を待つが、クリックが意図した要素(canvas)に届かず何か別の要素(ラベルのtspan、ダイアログ等)に吸収された場合、**単に30秒待ってタイムアウトするだけ**で、何が原因かはエラーメッセージに一切出ない。
- **提案**: クリック直前に対象座標の`document.elementFromPoint(x, y)`を評価して`tagName`/`id`/`className`を控えておき、`waitForFunction`がタイムアウトした際にその情報を含めて例外を再送出する。
  ```ts
  const blocker = await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    return el ? `${el.tagName}#${el.id || "(no id)"}.${el.className || "(no class)"}` : "(nothing at point)";
  }, point);
  await page.mouse.click(point.x, point.y);
  try {
    await page.waitForFunction(() => Boolean((window as any).__fmgWebglPickCandidatesSnapshot));
  } catch (e) {
    throw new Error(
      `WebGL pick event never fired for click at (${point.x}, ${point.y}). ` +
        `Top element at that point before the click was: ${blocker}. ` +
        `It likely intercepted the click before it reached the canvas.`
    );
  }
  ```
- **見込む効果**: 今回`getFirstStateScreenPoint`のラベル(`tspan`)・ダイアログ(`.fmg-dialog`)による吸収に気づくまでに複数回の手動再現スクリプトを要したが、この変更後はテスト実行のエラーメッセージだけで「州名ラベルがクリックを吸収した」まで即座に分かるようになる。
- **リスク**: なし(既存の失敗を早く・詳しく失敗させるだけ)。

### 2.3 マンパワー再構成(`manpower.ts`)がサイレントに全兵力をゼロへスケールする

- **ファイル**: `src/generators/manpower.ts`、`reconcileStateManpower()` → `scaleLandMilitary()`
- **現状**: `removeCivilianMalePeople()`が要求人数を確保できない場合(特に、その州の民間男性人口プールが完全に空 = `weighted <= 0`の場合)、`scaleLandMilitary(state, removed / troops)`が呼ばれ、`multiplier`が0(またはごく小さい値)になり得る。これにより該当州の全連隊の兵力(`r.a`/`r.t`/`r.u`)が無言でゼロにスケールされる。既存の`assertManpowerInvariant()`(DEV専用)は「上限超過」だけを検知しており、この「ゼロに潰れた」ケースは検知対象外。
- **提案**: `scaleLandMilitary()`の呼び出し側(`reconcileStateManpower()`)で、計算した`multiplier`が閾値(例: 0.05未満)の場合に`import.meta.env.DEV`ガード付きで`console.warn`を出す。
  ```ts
  if (removed + 1e-6 < troops) {
    const multiplier = removed / troops;
    if (import.meta.env.DEV && multiplier < 0.05) {
      console.warn(
        `[manpower] state ${state.i}: reconciliation scaled all land forces by ${multiplier.toFixed(3)}` +
          ` — civilian male population pool for this state is empty or near-empty` +
          ` (cells.maleAdults / burg.demographics.maleAdults). This usually means the pack` +
          ` was seeded without demographic data (see main.ts's packCells.maleAdults seeding).`
      );
    }
    scaleLandMilitary(state, multiplier);
  }
  ```
- **見込む効果**: 今回`military-generator.test.ts`の"expected 0 to be greater than 0"という失敗から、実際の原因(テストフィクスチャに`maleAdults`/`femaleAdults`が無い)に辿り着くまで`Military.generate()`の乗算チェーンを`manpower.ts`まで手動で追う必要があった。この警告があれば、テスト実行時のconsole出力を見るだけで一発で原因箇所(人口データ未セット)に到達できる。
- **リスク**: プロダクション挙動は変えず(`DEV`ガード付き)、開発時のconsole出力が増えるのみ。閾値(0.05)は仮の値なので調整の余地あり。

---

## 3. 次のセッションで最初に確認すべきこと(Open Questions)

1. §1(3Dバグ)と§2(可観測性改善)、どちらから着手するか。§2は低リスク・小工数で②→①→③の順が着手しやすいと思われるが、優先度はユーザーと未合意。
2. §1の3Dバグ調査は`three-d-renderer.ts`への一時的なデバッグログ追加が前提になる。恒久的にコードへ残すべきログか、調査用の一時コードとして扱うかを決める。
3. §2.3の閾値(`0.05`)や警告文言は仮置き。実際に警告が出すぎる/出なさすぎるかは、シミュレーションを実行して調整が必要。
