# Import/Export 漏れ調査・解消計画 & E2E テスト拡充計画

> 作成日: 2026-05-23  
> ブランチ: `feature/javascript2typescript`

---

## 背景

`public/modules/` 以下の JavaScript ファイルを `packages/@fmg/legacy-ui/src/` 以下の TypeScript ESM へ移植する作業が進行中です。  
`src/index.html` は個別の `<script>` タグで public モジュールを読み込む旧来の方式をやめ、`<script type="module" src="modules/index.ts">` 経由で ESM として一括ロードする新方式に移行しています。

この移行において **エクスポート/window 登録が漏れた関数は HTML の `onclick`/`onchange` ハンドラから呼び出せなくなる** というデグレードが発生しました。  
前セッションでは保存機能(`saveMap` / `getFileName`)の欠落を修正しました。本ドキュメントでは現時点の全欠落を体系的に調査し、解消戦略と E2E テスト計画を示します。

---

## 1. 現在のスクリプトロード構成

```
src/index.html
├── <script src="libs/...">          (jQuery, d3, etc. — 変更なし)
├── <script type="module" src="utils/index.ts">
├── <script type="module" src="modules/index.ts">   ← ESM エントリ
│   ├── @legacy-ui-runtime/globals-compat           ← window 登録の中枢
│   ├── @legacy-ui-runtime/modules/ui/*.ts          ← 各 UI モジュール
│   └── @legacy-ui-runtime/modules/io/{load,cloud}
├── <script type="module" src="renderers/index.ts">
├── <script type="module" src="controllers/index.ts">
└── <script defer src="main.js">    ← レガシー起動スクリプト (非モジュール)
```

`public/main.js` は map 生成の起動ロジックを担い、`@fmg/shared` や `@fmg/core` が `window.*` に登録した関数・オブジェクトを利用します。  
**`public/modules/ui/*.js` の個別 `<script>` タグはすでに削除済み** — TypeScript 版が ESM として読み込まれます。

---

## 2. window 登録の仕組み

| 登録元 | 登録先 | 内容 |
|--------|--------|------|
| `packages/@fmg/shared/src/index.ts` | `window.*` | `rn`, `tip` 相当ユーティリティ, `wiki`, `openURL`, `link`, `parseError` など 40+ 関数 |
| `packages/@fmg/core/src/modules/ui-tour.ts` | `window.UITour` | `{ start }` |
| `packages/@fmg/legacy-ui/src/globals-compat.ts` | `window.*` | UI 操作関数・IO 関数・ジェネレータ |
| `packages/@fmg/legacy-ui/src/main.ts` | (ローカル変数) | `invokeActiveZooming` — **未登録** |

---

## 3. Import/Export 漏れ一覧

### 3-A. `globals-compat.ts` に未登録の HTML onclick 関数

以下の関数は TypeScript 側で定義済みだが `Object.assign(window, {...})` に含まれていないため、ブラウザから呼び出せない状態です。

#### カテゴリ 1: レイヤー切り替え (`layers.ts`)

29 関数すべて**未 export / 未登録**です。

| 関数名 | 行 |
|--------|-----|
| `toggleHeight` | 228 |
| `toggleTemperature` | 243 |
| `toggleBiomes` | 255 |
| `togglePrecipitation` | 283 |
| `togglePopulation` | 326 |
| `toggleCells` | 399 |
| `toggleIce` | 418 |
| `toggleCultures` | 431 |
| `toggleReligions` | 461 |
| `toggleStates` | 490 |
| `toggleBorders` | 533 |
| `toggleProvinces` | 545 |
| `toggleGrid` | 584 |
| `toggleCoordinates` | 626 |
| `toggleCompass` | 698 |
| `toggleRelief` | 710 |
| `toggleLakes` | 723 |
| `toggleTexture` | 735 |
| `toggleRivers` | 762 |
| `toggleRoutes` | 797 |
| `toggleMilitary` | 836 |
| `toggleMarkers` | 848 |
| `toggleLabels` | 860 |
| `toggleBurgIcons` | 880 |
| `toggleRulers` | 892 |
| `toggleScaleBar` | 906 |
| `toggleZones` | 918 |
| `toggleEmblems` | 944 |
| `toggleVignette` | 958 |
| `handleLayersPresetChange` | 135 |
| `removePreset` | 162 |
| `savePreset` | 149 |

#### カテゴリ 2: オプション操作 (`options.ts`)

| 関数名 | 行 | 備考 |
|--------|-----|------|
| `connectToDropbox` | 848 | Dropbox 連携 |
| `copyLinkToClickboard` | 773 | URL コピー |
| `loadURL` | 853 | URL からロード |
| `openExportToPngTiles` | 888 | PNG タイル出力ダイアログ |
| `regeneratePrompt` | 733 | 再生成確認ダイアログ |
| `showSupporters` | 91 | サポーター表示 |

#### カテゴリ 3: ロード操作 (`load.ts`)

| 関数名 | 行 | 備考 |
|--------|-----|------|
| `quickLoad` | 7 | IndexedDB からロード |
| `loadFromDropbox` | 16 | Dropbox からロード |
| `createSharableDropboxLink` | 24 | Dropbox 共有リンク |

#### カテゴリ 4: スタイルプリセット (`style-presets.ts`)

| 関数名 | 行 |
|--------|-----|
| `addStylePreset` | 176 |
| `requestStylePresetChange` | 132 |
| `requestRemoveStylePreset` | 460 |

#### カテゴリ 5: 個別 UI モジュール

| 関数名 | ファイル | 行 |
|--------|----------|----|
| `editWorld` | `world-configurator.ts` | 9 |
| `textureProvideURL` | `style.ts` | 969 |
| `cleanupData` | `versioning.ts` | 88 |

#### カテゴリ 6: エクスポート済みだが `globals-compat.ts` に未登録

| 関数名 | ファイル | 状態 |
|--------|----------|------|
| `exportToJson` | `dynamic/export-json.ts` | `export function` はある、window 登録なし |

#### カテゴリ 7: `main.ts` ローカル定義・未登録

| 関数名 | ファイル | 行 |
|--------|----------|----|
| `invokeActiveZooming` | `main.ts` | 485 | HTML `onchange="invokeActiveZooming()"` から直接呼ばれる |

### 3-B. 登録済み確認 (問題なし)

以下は既に `window.*` に登録されていることを確認済みです。

| 関数 / オブジェクト | 登録元 |
|---------------------|--------|
| `wiki`, `openURL`, `link`, `parseError` | `@fmg/shared/src/index.ts` |
| `UITour.start()` | `@fmg/core/src/modules/ui-tour.ts` |
| `Names.getMapName()` | `globals-compat.ts` (Names オブジェクト) |
| `saveMap`, `saveToStorage`, `saveToMachine`, `saveToDropbox`, `initiateAutosave` | `globals-compat.ts` |
| `exportToSvg`, `exportToPng`, `exportToJpeg`, `exportToPngTiles` | `globals-compat.ts` |
| `saveGeoJsonCells/Routes/Rivers/Markers/Zones` | `globals-compat.ts` |
| 全 `toggle*` は旧 JS にも存在するが **新 TS 版は未登録** | — |

---

## 4. 解消戦略

### 原則

1. **export → globals-compat 登録** の 2 ステップで対応する。
2. `@ts-nocheck` が残るファイルは登録作業と同時に型エラーを確認し、可能なら除去する。
3. 一度に大量の関数を登録せず、**機能グループ単位**でコミットする (レビュー・リバート容易性)。

### ステップ A: `layers.ts` — 全 toggle 関数 + ヘルパー (優先度: 最高)

影響範囲が最大 (29 関数)。地図閲覧の基本操作 (レイヤー ON/OFF) がすべて動作しない。

```
1. layers.ts: 未 export 関数に export キーワードを追加
   - toggleHeight / toggleTemperature / toggleBiomes / ... (全 29)
   - handleLayersPresetChange / savePreset / removePreset
2. globals-compat.ts: 対応する import と Object.assign エントリを追加
```

### ステップ B: `options.ts` — オプション操作関数 (優先度: 高)

```
1. options.ts: 6 関数に export を追加
2. globals-compat.ts: import + 登録追加
```

### ステップ C: `load.ts` — ロード関数 (優先度: 高)

`quickLoad` / `loadFromDropbox` / `createSharableDropboxLink` を export + 登録。  
※ `save.ts` と対称的な作業。

### ステップ D: `style-presets.ts` / 個別 UI (優先度: 中)

`addStylePreset` / `requestStylePresetChange` / `requestRemoveStylePreset` / `editWorld` / `textureProvideURL` / `cleanupData` を export + 登録。

### ステップ E: `invokeActiveZooming` の登録 (優先度: 高)

`main.ts` の `invokeActiveZooming` は `invokeActiveZoomingView` (zoom-utils.ts) のラッパー。  
対応案:

```
案 1 (推奨): zoom-utils.ts に invokeActiveZooming エイリアスを export し
            globals-compat.ts から登録する。
            main.ts のラッパー定義は削除。
案 2: main.ts から export して globals-compat で登録する。
```

### ステップ F: `exportToJson` の登録 (優先度: 中)

`export-json.ts` の `exportToJson` を globals-compat.ts に追加。

### ステップ G: `@ts-nocheck` の段階的除去

各ステップ完了後、対象ファイルの TypeScript エラーを `npx tsc --noEmit` で確認し、エラーがなければ `@ts-nocheck` を削除する。

---

## 5. E2E テスト 拡充計画

### 5-1. 既存テストのカバレッジ評価

| テストファイル | テスト対象 | 保存/エクスポート検証 |
|----------------|------------|----------------------|
| `load-map.spec.ts` | .map ファイルのロード | ✗ |
| `layers.spec.ts` | SVG レイヤーの DOM 構造 | ✗ (toggle 動作なし) |
| `lakes-layer.spec.ts` | 湖レイヤー | ✗ |
| `zones-export.spec.ts` | GeoJSON エクスポート | △ (window.saveGeoJsonZones 経由) |
| `burgs.spec.ts` | 都市生成 | ✗ |
| `states.spec.ts` | 国家生成 | ✗ |
| `ui-tour.spec.ts` | UI ツアー | ✗ |
| `tour-prompt.spec.ts` | ツアープロンプト | ✗ |

**未テスト領域:**
- `.map` ファイルの保存 (saveMap → ダウンロード)
- レイヤー toggle ON/OFF の動作
- ロード (quickLoad, loadFromDropbox)
- スタイルプリセット変更
- PNG/SVG エクスポート

### 5-2. 追加すべき E2E テスト

#### T1: `save-map.spec.ts` — 地図保存

```
目的: saveMap が window に登録され、ファイルダウンロードが発火することを確認

テストケース:
  T1-1: saveMap('machine') を呼ぶとダウンロードイベントが発生する
  T1-2: ダウンロードされるファイルが .map 拡張子を持つ
  T1-3: ファイル内容が JSON としてパース可能である
  T1-4: 保存ファイルに必須フィールド (mapName, mapId, seed, pack) が含まれる
  T1-5: saveMap 呼び出し後にコンソールエラーが発生しない
```

#### T2: `layer-toggle.spec.ts` — レイヤー切り替え

```
目的: toggleXxx 関数が window に登録され、DOM 状態が変化することを確認

テストケース:
  T2-1: toggleBiomes() を呼ぶと #biomes が非表示になる
  T2-2: 再度 toggleBiomes() を呼ぶと #biomes が表示に戻る
  T2-3: toggleStates() が #regions の display を変更する
  T2-4: toggleRivers() が #rivers の display を変更する
  T2-5: toggleBorders() が #borders の display を変更する
  T2-6: 任意の toggle 後にコンソールエラーが発生しない

実装メモ:
  - page.evaluate(() => window.toggleBiomes()) でブラウザ側から呼び出す
  - SVG display 属性 or visibility を確認
```

#### T3: `quick-load.spec.ts` — クイックロード

```
目的: quickLoad が window に登録され、IndexedDB からマップを復元できることを確認

テストケース:
  T3-1: saveMap('storage') 後に quickLoad() を呼ぶと mapId が復元される
  T3-2: quickLoad() 後にコンソールエラーが発生しない
```

#### T4: `style-preset.spec.ts` — スタイルプリセット

```
目的: requestStylePresetChange が window に登録され、スタイルが変更されることを確認

テストケース:
  T4-1: requestStylePresetChange('ancient') でスタイルが変わる
  T4-2: addStylePreset() / removePreset() で localStorage が更新される
```

#### T5: `window-globals-smoke.spec.ts` — グローバル関数スモークテスト (高優先度)

```
目的: globals-compat.ts 経由で登録された全関数が window に存在することを一括確認する
      個別機能テスト前の "smoke test" として位置づける

テストケース:
  T5-1: 全 toggle 関数が typeof window.toggleXxx === 'function' であること
  T5-2: saveMap / saveToStorage / saveToMachine が function であること
  T5-3: exportToSvg / exportToPng / exportToJpeg が function であること
  T5-4: quickLoad / loadFromDropbox が function であること
  T5-5: editWorld / cleanupData / regeneratePrompt が function であること
  T5-6: invokeActiveZooming が function であること
  T5-7: exportToJson が function であること

実装例:
  const missing = await page.evaluate(() => {
    const required = ['toggleBiomes', 'toggleStates', ...];
    return required.filter(fn => typeof window[fn] !== 'function');
  });
  expect(missing).toEqual([]);
```

### 5-3. テスト実装の優先順位

| 優先度 | テスト | 理由 |
|--------|--------|------|
| 🔴 最高 | T5 (スモークテスト) | 全グローバル関数の一括確認。修正漏れの即時検出 |
| 🔴 最高 | T1 (保存) | 前回デグレードが実際に発生した機能 |
| 🟡 高 | T2 (レイヤー toggle) | 現在最多の未登録関数グループ |
| 🟡 高 | T3 (クイックロード) | 保存と対になる基本機能 |
| 🟢 中 | T4 (スタイル) | UX 上重要だが致命度は低い |

---

## 6. 作業チェックリスト

### フェーズ 1: 緊急修正 (import/export 漏れ解消)

- [x] **A1** `layers.ts`: 全 toggle 関数 + `handleLayersPresetChange` / `savePreset` / `removePreset` に `export` 追加
- [x] **A2** `globals-compat.ts`: layers.ts からの import と window 登録を追加
- [x] **B1** `options.ts`: 6 関数に `export` 追加
- [x] **B2** `globals-compat.ts`: options.ts 関数の登録追加
- [x] **C1** `load.ts`: `quickLoad` / `loadFromDropbox` / `createSharableDropboxLink` に `export` 追加
- [x] **C2** `globals-compat.ts`: load.ts 関数の登録追加
- [x] **D1** `style-presets.ts`: 3 関数に `export` 追加、`globals-compat.ts` に登録
- [x] **D2** `world-configurator.ts`: `editWorld` に `export` 追加、登録
- [x] **D3** `style.ts`: `textureProvideURL` に `export` 追加、登録
- [x] **D4** `versioning.ts`: `cleanupData` に `export` 追加、登録
- [x] **E1** `invokeActiveZooming` を window に登録 (zoom-utils.ts or main.ts 経由)
- [x] **F1** `export-json.ts`: `exportToJson` を `globals-compat.ts` に追加
- [x] **build** `npm run build` で build エラーがないことを確認

### フェーズ 2: E2E テスト追加

- [x] `tests/e2e/window-globals-smoke.spec.ts` を作成 (T5)
- [x] `tests/e2e/save-map.spec.ts` を作成 (T1)
- [x] `tests/e2e/layer-toggle.spec.ts` を作成 (T2)
- [x] `tests/e2e/quick-load.spec.ts` を作成 (T3)
- [x] `tests/e2e/style-preset.spec.ts` を作成 (T4)
- [x] 既存 `layers.spec.ts` に toggle 動作検証を追記

### フェーズ 3: @ts-nocheck 除去 (継続作業)

- [x] `layers.ts` — `@ts-nocheck` 除去済み (2026-05-23)
- [x] `options.ts` — `@ts-nocheck` 除去済み (2026-05-23)
- [x] `load.ts` — `@ts-nocheck` 除去済み (2026-05-23)
- [x] `style-presets.ts` — `@ts-nocheck` 除去済み (2026-05-23)
- [x] `save.ts` — `@ts-nocheck` 除去済み (2026-05-23)
- [ ] その他 `modules/io/`, `modules/ui/` 残ファイル

---

## 7. 技術的注意事項

### `@ts-nocheck` 除去の手順

```bash
# エラー確認
npx tsc --noEmit 2>&1 | grep "対象ファイル"

# エラーゼロなら先頭行を削除
```

### globals-compat.ts への追加パターン

```typescript
// 1. import 追加
import { toggleBiomes, toggleStates, ... } from "./modules/ui/layers";

// 2. Object.assign に追加
Object.assign(window, {
  ...
  toggleBiomes,
  toggleStates,
  ...
});
```

### E2E テストでのダウンロード検証パターン

```typescript
// Playwright でのダウンロードイベント捕捉
const [download] = await Promise.all([
  page.waitForEvent('download'),
  page.evaluate(() => (window as any).saveMap('machine'))
]);
expect(download.suggestedFilename()).toMatch(/\.map$/);
```

### レイヤー toggle 検証パターン

```typescript
// toggle 前後の display 状態比較
const getDisplay = () => page.evaluate(() =>
  document.getElementById('biomes')?.style.display ?? 
  getComputedStyle(document.getElementById('biomes')!).display
);

const before = await getDisplay();
await page.evaluate(() => (window as any).toggleBiomes());
const after = await getDisplay();
expect(before).not.toEqual(after);
```

---

## 8. 影響範囲サマリ

| カテゴリ | 未登録関数数 | ユーザー影響 |
|----------|-------------|--------------|
| レイヤー toggle (layers.ts) | 32 | **致命的** — 地図レイヤーの全 ON/OFF 操作不能 |
| オプション操作 (options.ts) | 6 | **高** — Dropbox/URL ロード不能 |
| ロード操作 (load.ts) | 3 | **高** — QuickLoad 不能 |
| スタイル操作 | 4 | **中** — スタイルプリセット変更不能 |
| 個別 UI | 3 | **中** — ワールド設定/テクスチャ変更不能 |
| エクスポート | 2 | **中** — JSON エクスポート / activeZooming 不能 |
| **合計** | **50** | |

> **優先対応**: レイヤー toggle (A1/A2) → オプション+ロード (B/C) → E2E スモークテスト (T5)
