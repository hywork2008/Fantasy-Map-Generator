# WebGL レイヤーへの透明度（opacity）の適用

## 背景と問題

WebGL ハイブリッドモード（deck.gl）では、地図の各ポリゴンレイヤー（Biomes、States、Cultures 等）の色をセルごとに直接 RGBA 値として GPU に渡す。SVG モードではこれらのレイヤーに `opacity` 属性が適用されているため、半透明のポリゴンが地形色と合成された見た目になる。WebGL モードにおいて、この opacity を正しく再現しないと地図全体の色が SVG モードより明らかに濃く見える。

### 問題発生の経緯

実装初期、各ポリゴンビルド関数の opacity は開発時の目視調整値がハードコードされていた。

```typescript
// 修正前（buildBiomesPolygons）
cellId => colorToRgba(biomesData.color[pack.cells.biome[cellId]], "#999999", 0.9)
// SVG のデフォルト (#biomes opacity) は 0.5 → WebGL は 0.9 で約 2 倍濃い
```

SVG レイヤーのデフォルト opacity は `public/styles/clean.json` に定義されており、これと大幅に乖離していた。

| SVG 要素     | デフォルト opacity | 修正前 WebGL | 差分   |
|:-------------|:------------------:|:------------:|:------:|
| `#biomes`    | **0.5**            | 0.9          | +0.4   |
| `#statesBody`| **0.3**            | 0.64         | +0.34  |
| `#cults`     | **0.6**            | 0.7          | +0.1   |
| `#relig`     | **0.7**            | 0.7          | ±0     |
| `#zones`     | **0.7**            | 0.65         | -0.05  |
| `#provs`     | **0.7**            | 0.58         | -0.12  |

`#biomes`（0.9）と `#statesBody`（0.64）が特に問題で、ユーザーが「WebGL は地図全体の色が濃い」と感じた主因。

---

## 修正アプローチ

### 1. SVG 要素からopacityを読み取る関数（`getCellLayerOpacities`）

`src/renderers/webgl/webglStyleExtractors.ts` に追加。  
`ViewContext` が保持する各 SVG `<g>` 要素の `opacity` 属性を読み取り、未設定の場合は `clean.json` のデフォルト値にフォールバックする。

```typescript
export function getCellLayerOpacities(viewContext: Readonly<ViewContext>): {
  biomes: number;
  religions: number;
  cultures: number;
  states: number;
  provinces: number;
  zones: number;
  temperature: number;
  precipitation: number;
  danger: number;
  population: number;
} {
  const readOp = (
    el: { attr(n: string): string | null; style(n: string): string } | null | undefined,
    fallback: number
  ): number =>
    parseOptionalNumber(el?.attr("opacity") ?? el?.style("opacity")) ?? fallback;

  return {
    biomes:        readOp(viewContext.biomes,     0.5),
    religions:     readOp(viewContext.relig,      0.7),
    cultures:      readOp(viewContext.cults,      0.6),
    states:        readOp(viewContext.statesBody, 0.3),
    provinces:     readOp(viewContext.provs,      0.7),
    zones:         readOp(viewContext.zones,      0.7),
    // これらのレイヤーは SVG で opacity: null（セルごとに強度で表現）
    // → max opacity キャップとして扱う
    temperature:   0.72,
    precipitation: 0.75,
    danger:        0.75,
    population:    0.72
  };
}
```

**読み取り優先順位：** `el.attr("opacity")` → `el.style("opacity")` → `fallback`

### 2. ポリゴンビルド関数への opacity パラメータ追加

`src/renderers/webgl/adapters/deckDataAdapters.ts` の各ポリゴンビルド関数に `opacity` 引数を追加。

```typescript
// 修正後（例：buildBiomesPolygons）
export function buildBiomesPolygons(
  worldContext: Readonly<WorldContext>,
  focusScope: FocusScope | null,
  landCells?: ReadonlyArray<DeckLandCellGeometry>,
  opacity = 0.5  // ← clean.json デフォルト値
): DeckCellPolygon[] {
  ...
  cellId => colorToRgba(biomesData.color[pack.cells.biome[cellId]], "#999999", opacity)
  ...
}
```

デフォルト引数は `clean.json` の値に合わせることで、`getCellLayerOpacities` を渡さずに呼ぶコードでも正しい結果になる。

### 3. `WEBGL_POLYGON_LAYERS` でのopacity転送

`src/renderers/webgl/buildDeckLayers.ts` の `WEBGL_POLYGON_LAYERS` 定数内の各 build クロージャーから `getCellLayerOpacities(view).XXX` を渡す。

```typescript
{
  toggle: "toggleBiomes",
  id: "biomes",
  build: (world, view, landCells) =>
    buildBiomesPolygons(world, view.focusScope, landCells, getCellLayerOpacities(view).biomes)
},
{
  toggle: "toggleStates",
  id: "states",
  build: (world, view, landCells) =>
    buildStatePolygons(world, view.focusScope, landCells, getCellLayerOpacities(view).states)
},
// ... 以下同様
```

`getCellLayerOpacities(view)` は `getCachedDeckData` のシグネチャが一致する限り build クロージャーは呼ばれないため、実質的に opacity 変更時のみ評価される。

### 4. キャッシュ無効化のためのシグネチャへの組み込み

ユーザーがスタイルパネルで opacity を変更した場合に古いキャッシュが使われないよう、`buildLayerSignatures` の各レイヤーシグネチャ文字列に opacity を付加した。

```typescript
// SignatureStyles に cellLayerOpacities を追加
interface SignatureStyles {
  ...
  cellLayerOpacities: ReturnType<typeof getCellLayerOpacities>;
}

// setIfActive のシグネチャ文字列にopacityを付加
setIfActive("biomes", "toggleBiomes",
  () => `${landGeometry()}|...|op:${styles.cellLayerOpacities.biomes}`
);
setIfActive("states", "toggleStates",
  () => `${landGeometry()}|${states()}|op:${styles.cellLayerOpacities.states}`
);
```

---

## Temperature / Precipitation / Danger / Population の特殊扱い

これら 4 レイヤーは SVG において `opacity: null`（スタイル未設定）であり、実際の透明度はセルごとの値（気温・降水量・人口密度等）を alpha チャンネルに直接マッピングすることで表現する。

そのため、固定の max opacity をキャップとして使い、各セルの alpha はその範囲内でスケールさせる：

```typescript
// 例：Precipitation（降水量）
const alpha = Math.min(maxOpacity, Math.max(maxOpacity * 0.24, precipitation / 220));
```

SVG の `#prec`、`#temperature`、`#danger`、`#population` はいずれも `"opacity": null` なので、この固定キャップ値（0.72〜0.75）が実質的なデフォルト扱いとなる。

---

## 修正後の opacity 対応表

| WebGL レイヤー | SVG 要素        | デフォルト opacity | 動的読み取り |
|:---------------|:----------------|:-----------------:|:-----------:|
| biomes         | `#biomes`       | 0.5               | ✅           |
| religions      | `#relig`        | 0.7               | ✅           |
| cultures       | `#cults`        | 0.6               | ✅           |
| states         | `#statesBody`   | 0.3               | ✅           |
| provinces      | `#provs`        | 0.7               | ✅           |
| zones          | `#zones`        | 0.7               | ✅           |
| temperature    | `#temperature`  | 0.72（max cap）   | ❌（固定）   |
| precipitation  | `#prec`         | 0.75（max cap）   | ❌（固定）   |
| danger         | `#danger`       | 0.75（max cap）   | ❌（固定）   |
| population     | `#population`   | 0.72（max cap）   | ❌（固定）   |

---

## 関連ファイル

| ファイル | 役割 |
|:---------|:-----|
| [`src/renderers/webgl/webglStyleExtractors.ts`](../../src/renderers/webgl/webglStyleExtractors.ts) | `getCellLayerOpacities()` — SVG からの opacity 読み取り |
| [`src/renderers/webgl/adapters/deckDataAdapters.ts`](../../src/renderers/webgl/adapters/deckDataAdapters.ts) | `build*Polygons()` — opacity パラメータを受け取るポリゴンビルド関数群 |
| [`src/renderers/webgl/buildDeckLayers.ts`](../../src/renderers/webgl/buildDeckLayers.ts) | `WEBGL_POLYGON_LAYERS`、`buildLayerSignatures()` — レイヤーへの opacity 転送とキャッシュ管理 |
| [`public/styles/clean.json`](../../public/styles/clean.json) | フォールバックに使う各レイヤーのデフォルト opacity 値のソース |
