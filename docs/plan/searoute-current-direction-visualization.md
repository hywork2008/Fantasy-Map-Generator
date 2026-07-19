# WebGL searoutes の海流向き可視化

`viewContext.renderMode === "webglHybrid"` での `searoutes`（`pack.routes` の `group: "searoutes"`）に、矢印やテキストを使わず、かつ低負荷な方法で移動方向（＝海流の向きとして扱う）を視覚化したい、という要望への検討ログ。矢印・記号・文字を使わないという制約と、WebGL(deck.gl) レンダラの純粋性ルール（`AGENTS.md` §1.1: `Readonly<WorldContext>` を読むだけで `pack`/`grid` を書き換えない）は維持する。

---

## 0. 経緯・却下した案

### 案1（実装済み・視認性不足で却下）: パス自体のアルファグラデーション

`buildRoutePaths`（[deckDataAdapters.ts:1090](../../src/renderers/webgl/adapters/deckDataAdapters.ts#L1090)）内で、各 searoute を最大5分割し、`route.points` の並び順（生成時の起点→終点順、[routes-generator.ts:319](../../src/generators/routes-generator.ts#L319) `points.map(p => p[2])` が示す通り経路順で確定している）に沿ってセグメントごとのアルファ値を25%→100%に線形補間する実装（`buildSearouteFlowSegments`）を追加した。

- 各セグメントは同じ `id: route-${route.i}` を維持し、`mapInteraction.ts` の `parseTrailingNumber` によるピッキング/ツールチップ/ドラッグ解決を壊さないようにした。
- ユニットテストと `tsc`/lint/madge/build はすべてクリーン。

**却下理由**: searoutes の線幅は 0.7px 前後（[deckDataAdapters.ts:1110](../../src/renderers/webgl/adapters/deckDataAdapters.ts#L1110) 付近）と非常に細く、アルファのグラデーションは実際にブラウザで見るとほぼ人間の目に入らない。ユーザー確認の結果、「線ではなくセルに効果をつけないと駄目」という結論に至った。

→ 以降は **searoutes が通過するセル（水上セル）** に対して視覚効果を付ける方向に方針転換。

---

## 1. 前提となるデータ

- `route.points: [number, number, number][]` の各要素の3番目はセルIDで、経路探索（Dijkstra, `findPath`）が確定した順に並んでいる（[routes-generator.ts:319](../../src/generators/routes-generator.ts#L319)）。`points.map(p => p[2])` を先頭から辿り、連続する重複を除去するだけで「起点→終点の順に並んだセル列」が得られる。`route.cells` を別途参照する必要はない。
- 個々のセルのポリゴン座標は、既存の汎用ヘルパー `getCellPolygon(cells, vertices, cellId)`（`buildBackgroundPolygons` 等、複数の polygon アダプタが共通利用: [deckDataAdapters.ts:335](../../src/renderers/webgl/adapters/deckDataAdapters.ts#L335) 付近）でそのまま構築できる。
- 生成された静的ジオメトリは既存の `deckLayerDataCache`（シグネチャキー方式、[buildDeckLayers.ts](../../src/renderers/webgl/buildDeckLayers.ts)）にそのまま乗せられる。

---

## 2. 案A: セル列を流れる帯アニメーション（推奨）

searoute が通るセルポリゴンを1回だけ構築し、各セルに「経路上の位置」（0〜1に正規化したセル列インデックス）を静的属性として持たせる。毎フレーム JS 側で全セルの色を再計算するのではなく、`currentTime` という単一の uniform 値だけをシェーダに渡し、

```
brightness = triangleWave(time - cellPhase)
```

のような計算を GPU 側（頂点/フラグメントシェーダ）で行わせる。セル数が増えても CPU 負荷はほぼ増えない。

これは deck.gl の `TripsLayer`（`@deck.gl/geo-layers`）が「経路上のタイムスタンプ属性＋単一 uniform」で実現している仕組みと同じ原理で、海流・風向マップの定番手法（例: NASA Perpetual Ocean 的な「流れる光の帯」表現）。半透明の明るい帯が起点セルから終点セルへ渡り歩くように見えるため、線幅に縛られず視認性を確保できる。

**コスト**:
- 静的ジオメトリはキャッシュ可能（既存の signature キャッシュパターンに乗る）。
- 継続的な再描画ループが1本必要になる点だけが、現状の「オンデマンド描画」設計（`scheduleWebglUpdate()` によるトリガー駆動、[buildDeckLayers.ts](../../src/renderers/webgl/buildDeckLayers.ts) 参照）からの逸脱。deck.gl 標準の `AnimationLoop` か、`requestAnimationFrame` で `currentTime` prop だけを更新する軽量なループで足りる想定。

---

## 3. 案B: 静的な方向性グラデーション塗り（アニメ無し・最安）

アニメーションを一切使わず、searoute が通るセルポリゴンの塗りを起点側は薄く終点側は濃く（あるいは色相を寒色→暖色に）補間して塗るだけの案。案Aの「セル位置 → 補間値」ロジックはそのまま流用できるが、`currentTime` uniform を使わず1回描画したら終わりなので、継続的な再描画コストがゼロになる。

**トレードオフ**: 「流れている」感が弱く、静止画的な向き表示に留まる。ただしランタイムコストは実質ゼロで、案Aの前段階・フォールバックとして扱いやすい。

---

## 4. 推奨進め方

まず案Aで実装し、パフォーマンスが気になる場合や継続描画ループを避けたい場合は案Bにフォールバックする、という2段構え。案1（パスのアルファグラデーション、`buildSearouteFlowSegments`）は視認性不足のため、案A/B のいずれかが実装され次第、置き換えまたは削除を検討する。
