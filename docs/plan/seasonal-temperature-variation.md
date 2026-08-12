# 地軸傾斜ベースの季節気温変動 計画

## 状態

**Phase 0〜3実装完了(2026-08-12)。** 月次推奨・SVGリアルタイム反映不要の方針でユーザー承認済み。フェーズ4(economy拡張の重複計算解消・ドキュメント更新)は未着手・任意。

- **Phase 0(地軸傾斜の設定追加): 完了。** `EARTH_AXIAL_TILT_DEG`(`src/data/earthConfig.ts`)・`WorldOptions.axialTilt`・生成時デフォルト・World Configurator UI(`#axialTiltInput`)・lock永続化・旧セーブへの後方互換フォールバックを実装。
- **Phase 1(季節計算コアの修正): 完了。** `getSeasonalTemperatureOffset`/`getSolarDeclinationDeg` に `axialTiltDeg` 引数を追加し、判断2の通り振幅が `sin(axialTiltDeg)/sin(23.5°)` でスケールするよう式を直した(旧式は傾斜角が完全に相殺されて無効だった)。`heating.ts` の呼び出しにも `world.options.axialTilt` を渡すよう更新。
- **Phase 2(共有グリッドフィールドと月次更新システム): 完了。** `grid.cells.seasonalTemp`(`types/Grid.ts`)・`simulationContext.lastSeasonalTempBucket`・新規 `src/generators/seasonalClimate.ts`(`advanceSeasonalClimate()`)・`timeEngine.ts` への `seasonal-climate.tick` システム登録(`phase: "environment"`)・`dataFieldOwnership.ts` 登録・`main.ts`/`io/load.ts` からの初回呼び出しを実装。
- **Phase 3(表示への反映): 完了。** WebGL(`buildTemperaturePolygons`/`buildDeckLayers.ts` のトピックゲート)・SVG(`draw-temperature.ts`)とも `seasonalTemp ?? temp` を読むよう変更。合意通りSVGへのtick駆動自動再描画は追加していない(トグル時のみ最新値を反映)。

検証: `tsc --noEmit`/`biome`/`madge` は全てクリーン。単体テスト(`seasonUtils.test.ts`・`seasonalClimate.test.ts`・`timeEngine.systems.test.ts`・`deckDataAdapters.test.ts`)を追加、全パス。全体 `vitest run` は本セッション開始前から存在する無関係な3件の既知失敗(i18n商品名・goodsEditor・seasonalPricing.integration)のみで新規リグレッションなし。新規e2e `tests/e2e/seasonal-temperature.spec.ts`(SVG描画・WebGL描画・実際に「Advance Month」ボタンを押しての月次再計算)を3件とも実ブラウザで確認済み。

既存の `src/utils/seasonUtils.ts` に地軸傾斜・太陽赤緯・季節振幅・気温オフセット計算のコアはすでに実装されていたが、コアの気温グリッド(`worldContext.grid.cells.temp`)にも地図の気温レイヤー表示にも一切接続されていなかった(このセッションで接続した)。`economy` 拡張(デフォルト無効)の `heating.ts` は今回 `axialTilt` を渡すよう更新したが、まだ独自に `getSeasonalTemperatureOffset` を再計算している(Phase 4で `grid.cells.seasonalTemp` の読み取りに統合可能)。

## 背景・現状分析

### 気温は年月日と無関係な年間平均値

`calculateTemperatures()`（[main.ts:1480](../../src/main.ts)）は生成時に一度だけ呼ばれ、緯度と標高だけから `grid.cells.temp`（`Int8Array`、グリッド解像度＝デフォルト1万セル程度）を計算する。`temperatureEquator`/`temperatureNorthPole`/`temperatureSouthPole`（年平均気温として World Configurator で設定）から緯度勾配を作るだけで、暦日は一切参照しない。ユーザーの指摘通り、四季の変動は今のところ存在しない。

### 季節計算のコアはすでにある。ただし地軸傾斜の"大きさ"は式の中で相殺されて効いていない

`src/utils/seasonUtils.ts` に：

- `AXIAL_TILT_DEG = 23.5`（モジュール定数、外から変更不可）
- `getSolarDeclinationDeg(dayOfYear)` = `-AXIAL_TILT_DEG * cos(360/365 * (dayOfYear+10))`
- `getSeasonalAmplitude(latitudeDeg, climate)` = `(北半球スプレッド+南半球スプレッド)/2 * 0.5 * sin(|latitude|)` （ユーザーが設定した赤道・両極の年平均気温差から振幅を導出。傾斜角は不使用）
- `getSeasonalTemperatureOffset(lat, y, m, d, climate)` = `amplitude * hemisphereSign * (declination / AXIAL_TILT_DEG)`

**重要な発見**: `declination = -AXIAL_TILT_DEG * cos(angle)` なので `declination / AXIAL_TILT_DEG = -cos(angle)` となり、`AXIAL_TILT_DEG` は式の中で完全に相殺される。つまり現状のコードは「23.5°固定」なだけでなく、傾斜角の**大きさが最終的な季節振幅に一切影響しない**構造になっている（位相＝`cos(angle)` の部分も傾斜角とは無関係な暦日だけの関数）。ユーザーが要求する「地軸の傾きを足す」を意味のある機能にするには、この式自体を直す必要がある（後述の設計判断2）。

### データ所有権とレンダリング配線の既存パターン（変更の土台）

- `src/runtime/dataFieldOwnership.ts` は `grid.cells.{temp,prec}` を `owner: "map"` / `topic: "map.physical"`（生成専有・静的データ）として明示的に登録している。これは `seasonUtils.ts` 自身のコメント「既存の静的な temp 配列自体は書き換えない」という設計意図とも一致する。
- `src/runtime/renderCoordinator.ts` の `visualTopic` 判定は `simulation.*` で始まる全トピックを対象にしており、該当トピックが変化すると自動的に `effects.scheduleWebglUpdate()` が呼ばれる（[renderCoordinator.ts:151-155](../../src/runtime/renderCoordinator.ts)）。つまり新しいデータを `simulation.cells` トピックとして `markChanged` するだけで、WebGL側の再描画チェックは自動的に走る。
- ただし `src/renderers/webgl/buildDeckLayers.ts` の `"temperature"` レイヤーは署名計算のトピックゲートが `["map.topology", "map.physical", "presentation.styles"]` のみで `"simulation.cells"` を含まないため（[buildDeckLayers.ts:1606-1612](../../src/renderers/webgl/buildDeckLayers.ts)）、このままでは季節更新に気づかない。トピックゲート方式は `revisionSignature()` がトピックのリビジョンカウンタだけを見て署名を作る設計（`src/renderers/webgl/webglTopicRevisions.ts`）なので、ゲートへの追加は必須。
- SVG版 `src/renderers/draw-temperature.ts` は等温線（isoline）パスを `grid.cells.temp` から都度構築する処理で、population/danger 等の他のセル単位ヒートマップ系レイヤーと同様、`renderCoordinator.ts` にtick駆動の自動再描画経路がない（トグルON時などに手動で呼ばれるのみ）。

### `SimulationSystem` の `cadence.every` は「月に1回」の意味では使えない

`src/generators/simulationSystem.ts` のコメントに明記されている通り、`cadence.every` は「calendar日ではなく `advanceTime` 呼び出し回数（tick）」基準。「1日ずつ進める」の連続再生ループも「1年進める」のバルクジャンプも同じ1tickとして数えられるため、`every: N` では月次相当の粒度を再現できない。

既存の `technology.tick`（[timeEngine.ts:187-199](../../src/generators/timeEngine.ts)）が正にこの問題への回答になっている：`cadence: { every: 1 }` で毎tick呼ばれるが、内部の `settleTechnologyAnnual()` が `tech.lastEvaluatedYear === year` を比較して自己ゲートし、変化がなければ即 `return false`（何もマークしない）。今回もこのパターンを踏襲する。

### `heating.ts` に月次の重複実装がすでに存在する

`src/extensions/economy/generators/heating.ts` の `getCellEffectiveTemperature()` は、まさに今回作ろうとしている「`grid.cells.temp` + 季節オフセット」をセル単位でオンデマンド計算している（月次で呼ばれる、コメントに"Heating is settled after monthly production"とある）。月次粒度が実運用で許容されている実例であり、後述のフェーズ4でこの重複を解消できる。

## 目標

1. 地軸傾斜を World Configurator の新規パラメータとして追加する（現状23.5°固定を可変に）。
2. 緯度・現在の暦日から導出される「現在の実効気温」を、日次ではなく月（または四半期）単位で更新する共有データを追加する。
3. 気温レイヤー（WebGL・SVGとも）が季節変動を反映できるようにする。
4. 既存の年間平均 `grid.cells.temp` は生成基準値として維持し、バイオーム判定・文化配置・海路氷結判定など生成時の一回限りの消費者に影響を与えない（後方互換）。

## 非目標

- 日次の気温再計算（ユーザーの要望により対象外）。
- 降水量の季節変動（現状の年1回固定モデルのまま。別計画とする）。
- 極から極までを1枚につなぐ生成マップの特殊季節扱い（`docs/plan/seasonal-crop-calendars.md` が採用した既存のスコープ制限を踏襲し、対象外とする）。
- 前回整理した `distanceScale` の緯度依存化などの別課題（スコープ外、別計画）。

## 主要な設計判断

### 判断1: 年間平均 `grid.cells.temp` は書き換えず、新規フィールドを追加する

`grid.cells.temp` は生成時専有データ（`dataFieldOwnership.ts` で `map.physical`）であり、書き換えると「年間平均のはずが実は今月の値」という意味の混同が起きる。既存の設計意図（`seasonUtils.ts` のコメント）とも一致させ、**新規フィールド `grid.cells.seasonalTemp: Int8Array`** を追加する。所有者は `"simulation"`、トピックは新設せず既存の `"simulation.cells"` を再利用する（`dataFieldOwnership.ts` の他のtick駆動セルデータと同じパターン）。

### 判断2: 地軸傾斜が実際には効かない計算式を修正する

現状の `declination / AXIAL_TILT_DEG` はどんな傾斜角でも `-cos(angle)` に潰れる。傾斜角0°で季節振幅0（無季節）、23.5°（デフォルト）で現状の見た目と完全互換、傾斜角が大きいほど振幅が拡大するよう、振幅計算そのものに傾斜角を掛け込む形へ直す：

```text
tiltScale = sin(axialTiltDeg in rad) / sin(23.5° in rad)   // 23.5°を基準に正規化
offset = amplitude(climate, latitude) * tiltScale * hemisphereSign * -cos(dayAngle)
```

`sin()` を使うのは、傾斜90°（理論上の最大）で振幅が発散せず頭打ちになるようにするため。`declination` 自体は今後も表示・デバッグ用に返してよいが、オフセットの倍率計算からは `AXIAL_TILT_DEG` 固定値ではなく引数化した `axialTiltDeg` を使う。

### 判断3: 再計算の粒度は「暦バケットの変化検知」であり、tickカウントのスロットリングではない

判断3の理由は上記「`cadence.every` は月次の意味では使えない」の通り。`simulationContext` に `lastSeasonalTempBucket: number | null` を追加し、`year * 12 + month`（月次）または `year * 4 + quarterOf(month)`（四半期）と比較して、変化した時だけ実際の再計算＋`markChanged` を行う。バケット幅は定数1つで切替可能にしておく（判断4）。

セーブ／ロード時は `lastSeasonalTempBucket` 自体を永続化せず、ロード直後・`initSimulationClock()` 直後に無条件で1回再計算する方針とする（保存フォーマットを増やさず、"seasonalTempが未初期化のまま"という状態を作らないため）。

### 判断4: 月次を推奨（四半期はフォールバック候補として実装だけ用意）

**月次を推奨する。** 理由：

- `heating.ts` がすでに月次で同等の計算を実運用しており、粒度として妥当だという実例がある。
- グリッドセル数はデフォルト1万、大きくても数万程度（`points` オプション依存）。配列を1周する再計算は `calculateTemperatures()` と同オーダーの計算量で、数ミリ秒未満。月次でも四半期でもこの部分のコストはほぼ無視できる。
- 本当のコスト要因は再計算そのものではなく**再描画**（SVG版の等温線パス再構築、WebGLレイヤーの再構築）。これは月1回でも十分に安く、`frontier-expansion` など他の毎tick系システムも同様に「変化があった時だけ描画コストを払う」設計になっている。
- 四半期にすることで节约できるコストがほぼ無い一方、季節の変わり目が3ヶ月単位でしか動かず体感が粗くなる。

ただし判断3の通りバケット幅は定数化するため、実装後の負荷計測で問題が出れば四半期へ即座に切り替え可能。

### 判断5: 再描画配線はWebGL優先、SVGはフェーズ2以降

WebGLは`"simulation.cells"`を`markChanged`するだけで`renderCoordinator.ts`が自動的に再描画チェックをスケジュールする（判断1の通りトピックを揃えれば済む）。SVG版`draw-temperature.ts`は現状、population/dangerなど他のセルヒートマップ系レイヤーと同じく「トグルON時のみ手動描画」という扱いで、tick駆動の自動更新経路がそもそも存在しない。今回の変更でSVG版だけ新たにtick駆動の自動再描画を追加するのはスコープが広がりすぎるため、**フェーズ1では他レイヤーと同じ挙動（トグル操作時に最新のseasonalTempを読む）に揃える**ことを推奨する。WebGLがデフォルトレンダラーであるため実利用上の影響は小さい。SVG側のtick駆動自動更新は将来の拡張候補として明記するに留める。

## 実装フェーズ

### Phase 0: 地軸傾斜の設定を追加する

- [`src/types/WorldState.ts`](../../src/types/WorldState.ts): `WorldOptions` に `axialTilt: number` を追加。
- [`src/main.ts`](../../src/main.ts): 生成時の `options` 初期値に `axialTilt: EARTH_AXIAL_TILT_DEG`（新規定数、23.5）を追加。`EARTH_TEMPERATURE_PRESET` と同じ並びで `src/data/earthConfig.ts` に置くのが自然（地球実測値の集約先として既存の設計と一貫する）。
- [`src/store/worldConfiguratorFormStore.ts`](../../src/store/worldConfiguratorFormStore.ts) / [`src/ui/dialogs/WorldConfiguratorDialog.tsx`](../../src/ui/dialogs/WorldConfiguratorDialog.tsx): `temperatureEquator` 等と同じパターンで入力UI・`LockIconButton`・`data-stored="axialTilt"` を追加。
- [`src/io/save.ts`](../../src/io/save.ts) / [`src/io/load.ts`](../../src/io/load.ts): `settings` 配列の空きスロット（現状 `""` のプレースホルダ、または末尾追加）に格納。未設定の旧セーブは23.5にフォールバック。
- [`src/controllers/options.ts`](../../src/controllers/options.ts): `locked`/`stored` 対応、`persistedOptionKeys` への追加。

### Phase 1: 季節計算コアの修正（判断2）

- [`src/utils/seasonUtils.ts`](../../src/utils/seasonUtils.ts): `getSeasonalTemperatureOffset` に `axialTiltDeg` 引数を追加し、`tiltScale` 正規化を実装。`getSolarDeclinationDeg` も傾斜角を引数化（内部定数への依存を除去）。
- `src/utils/seasonUtils.test.ts`: 傾斜0°で振幅0、23.5°で現行の挙動と完全一致、90°付近で振幅が拡大することを確認する回帰テストを追加。
- [`src/extensions/economy/generators/heating.ts`](../../src/extensions/economy/generators/heating.ts): 呼び出し側に `axialTilt`（`worldContext.options.axialTilt`）を渡すよう更新（最小差分、Phase 4で共有フィールド読み出しに置き換えるまでの繋ぎ）。

### Phase 2: 共有グリッドフィールドと月次更新システム（判断1・3・4）

- [`src/types/Grid.ts`](../../src/types/Grid.ts): `GridCells` に `seasonalTemp: Int8Array` を追加。`temp`/`waterTemp` と同水準のJSDocで「`temp` に季節オフセットを加算した現在値、月次更新」であることを明記。
- [`src/context/simulationContext.ts`](../../src/context/simulationContext.ts): `lastSeasonalTempBucket: number | null` を追加（`worldSeason` の隣に置くのが自然）。
- 新規モジュール（例: `src/generators/seasonalClimate.ts`）: `updateSeasonalTemperature(world, simulation): boolean` を実装。
  - 現在のバケット（`year*12+month`、判断4の定数で四半期に切替可）を計算し `lastSeasonalTempBucket` と比較、不変なら即 `false`。
  - 変化していれば `calculateTemperatures()` と同じ行単位の緯度サンプリング（`grid.points[rowCellId]` から緯度を得て、行内の全セルに同じ緯度を適用）を踏襲し、`grid.cells.seasonalTemp[i] = minmax(grid.cells.temp[i] + getSeasonalTemperatureOffset(...), -128, 127)` を1周で計算。
  - `lastSeasonalTempBucket` を更新して `true` を返す。
- [`src/generators/timeEngine.ts`](../../src/generators/timeEngine.ts): `registerSimulationSystem({ id: "seasonal-climate.tick", phase: "environment", reads: ["map.physical", "simulation.cells"], writes: ["simulation.cells"], cadence: { every: 1 }, run: (_ctx, writer) => { if (updateSeasonalTemperature(worldContext, simulationContext)) writer.markChanged("simulation.cells"); } })`。`phase: "environment"` は現状未使用のフェーズで、他の全フェーズより先に実行されるため意味的にも適切。
- [`src/runtime/dataFieldOwnership.ts`](../../src/runtime/dataFieldOwnership.ts): `simulation("grid.cells.seasonalTemp", "simulation.cells", "grid-cell.id")` を追加。
- [`src/main.ts`](../../src/main.ts): 生成完了直後（`initSimulationClock()` の後）に `updateSeasonalTemperature()` を無条件で1回呼び、`seasonalTemp` を未初期化のまま残さない。
- [`src/io/load.ts`](../../src/io/load.ts): マップロード直後にも同様に1回強制再計算する（判断3の通り、バケット自体は永続化しない）。

### Phase 3: 表示への反映

- [`src/renderers/webgl/buildDeckLayers.ts`](../../src/renderers/webgl/buildDeckLayers.ts): `"temperature"` レイヤーのトピックゲートに `"simulation.cells"` を追加。データ読み出し元（`buildTemperaturePolygons` 呼び出し及びその内部）を `grid.cells.seasonalTemp ?? grid.cells.temp` に変更。
- [`src/renderers/draw-temperature.ts`](../../src/renderers/draw-temperature.ts): `cells.temp` を読んでいる箇所を `cells.seasonalTemp ?? cells.temp` に変更（フォールバックにより、シミュレーション未開始・旧セーブでも壊れない）。再描画トリガーは判断5の通りフェーズ1では追加しない。
- 任意（余力があれば）: ツールチップ／凡例に「年平均 X℃ / 現在 Y℃」を並記する（既存の `tooltipService` 拡張）。

### Phase 4（統合、任意）

- [`src/extensions/economy/generators/heating.ts`](../../src/extensions/economy/generators/heating.ts): `getCellEffectiveTemperature()` を `worldContext.grid.cells.seasonalTemp[gridCellId] ?? baseTemperature` を読むだけの実装に置き換え、独自の `getSeasonalTemperatureOffset` 呼び出しを除去（重複計算の解消、tilt修正の恩恵が自動的に波及）。
- `docs/simulation/seasons.md`: 「現状このオフセットを実際に読み取っている消費者はまだいない」の記述を更新し、`grid.cells.seasonalTemp` の説明を追加する（ドキュメントの陳腐化を解消）。

## テスト計画

- `src/utils/seasonUtils.test.ts`: 判断2の回帰テスト（tilt=0→振幅0、tilt=23.5→既存値と一致、tilt増加で振幅増加の単調性）。
- 新規 `src/generators/seasonalClimate.test.ts`: バケット変更検知（同一月内では再計算しない／月をまたぐと再計算する／年をまたぐバルクジャンプでも1回だけ正しく再計算する）、`seasonalTemp` が `temp ± amplitude` の範囲に収まること、`-128〜127` にクランプされること。
- `src/generators/timeEngine.test.ts`（既存があれば）: `listRegisteredSimulationSystemIds()` に `"seasonal-climate.tick"` が含まれること、1日ずつ12回進めた場合と `advanceTime(0,12,0)` を1回叩いた場合とで最終的な `seasonalTemp` が一致すること（tick粒度に依存しないことの確認）。
- E2E: 季節を12ヶ月分進め、`window.fmg.world.grid.cells.seasonalTemp` の平均値が夏冬で変化することを確認する軽量スペックを追加（既存の `tests/e2e/generation-progress.spec.ts` 等のパターンを踏襲）。

## 検証チェックリスト（AGENTS.md準拠）

- `npx tsc --noEmit`
- `npm run lint`（biome + legacy/world-writers/architecture）— 特に `lint:world-writers` は新規の `grid.cells.seasonalTemp` 書き込み元が `dataFieldOwnership.ts` に正しく登録されているかを検証する
- `npx madge --circular --extensions ts,tsx src/app.ts`
- 上記テスト一式

## 未解決の論点（ユーザー判断が必要な点）

1. **月次 vs 四半期**: 月次を推奨（判断4）。四半期を希望する場合はバケット幅の定数を変えるだけで対応可能。
2. **SVGレンダラーのtick駆動自動再描画**: フェーズ1では見送り、トグル時のみ最新値を反映する設計を推奨（判断5）。SVGでもリアルタイム反映が必須なら、`renderCoordinator.ts` に `renderTemperature` effect と `topics.has("simulation.cells")` 分岐の追加が必要（追加スコープ）。
3. **`grid.cells.seasonalTemp` の命名**: 他候補として `currentTemp`／`effectiveTemp`。
4. **振幅の正規化基準**: 23.5°を基準にsin比でスケールする案（判断2）で問題ないか。別の基準（例: 単純に `sin(tilt)` をそのまま係数にする、上限を設けない等）を希望する場合は要調整。
