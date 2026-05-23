# ESM 化作業指示書 — `@fmg/legacy-ui` グローバル依存の解消

## 背景と目的

現在の `@fmg/legacy-ui` は、TypeScript ESM モジュールでありながら `Object.assign(window, { ... })` を使って関数やクラスをグローバルスコープに公開し、旧 `public/main.js` やほかのレガシーモジュールがそれを暗黙に参照するという構造になっている。

```
legacy-ui モジュール
  → Object.assign(window, { layerIsOn, tip, ... })
      → public/main.js で window.layerIsOn() として暗黙参照
```

この方式の問題点は以下のとおり。

- 依存関係が静的解析できず、未定義参照は実行時エラーになるまで検知できない
- 読み込み順に強く依存し、HMR や遅延ロードで壊れやすい
- 型安全・テスト容易性が低い
- 追加する関数が増えるたびにデバッグコストが増える

本作業の目標は **`Object.assign(window, ...)` を段階的に廃止し、明示的な ESM `export` / `import` に置き換える** ことである。

---

## 現状の `Object.assign(window, ...)` 公開一覧

作業開始時点で 8 ファイルに分散している。

| ファイル | 公開関数 / クラス |
|---|---|
| `modules/ui/general.ts` | `tip`, `showDataTip`, `onMouseMove`, `getFriendlyHeight`, `showMainTip`, `clearMainTip`, `showElementLockTip`, `lock`, `unlock`, `locked`, `stored`, `store`, `applyOption`, `showInfo` |
| `modules/ui/layers.ts` | `applyLayersPreset`, `drawLayers`, `layerIsOn` |
| `modules/ui/options.ts` | `showOptions`, `hideOptions`, `toggleOptions`, `applyGraphSize`, `fitMapToScreen`, `applyStoredOptions`, `randomizeOptions` |
| `modules/ui/editors.ts` | `restoreDefaultEvents`, `closeDialogs` |
| `modules/ui/style-presets.ts` | `applyStyleOnLoad` |
| `modules/ui/measurers.ts` | `Rulers`, `Ruler`, `Opisometer`, `RouteOpisometer`, `Planimeter`, `createDefaultRuler` |
| `modules/io/save.ts` | `initiateAutosave` |
| `modules/io/export.ts` | `exportToSvg`, `exportToPng`, `exportToJpeg`, `exportToPngTiles`, `saveGeoJsonCells`, `saveGeoJsonRoutes`, `saveGeoJsonRivers`, `saveGeoJsonMarkers`, `saveGeoJsonZones` |

---

## 移行戦略

### 基本方針

1. **一度に全ファイルを書き換えない。** 1 ファイル単位で移行し、各ステップごとにブラウザ動作と E2E テストを確認する。
2. **呼び出し側の優先度を下げる。** `public/main.js` は最終的に `packages/@fmg/legacy-ui/src/main.ts` へ完全移行するまで暫定的にグローバル参照が残る場合がある。その場合はシム（後述）で橋渡しする。
3. **依存注入パターンを優先する。** `main.ts` の `buildXxxDeps()` パターンがすでに実装されているので、それを手本にする。

### 段階的移行の 3 フェーズ

#### フェーズ 1 — export の追加（後方互換シムを維持）

各ファイルで関数を `export` に変え、`src/modules/index.ts` 経由で必要な呼び出し側に `import` する。  
`Object.assign(window, ...)` はまだ残す。

```typescript
// ✅ Before
function layerIsOn(el) { ... }
Object.assign(window, { layerIsOn });

// ✅ After（フェーズ 1）— export を追加しつつ window 公開も維持
export function layerIsOn(el) { ... }
Object.assign(window, { layerIsOn });
```

ポイント: この段階では呼び出し側は何も壊れない。

#### フェーズ 2 — 呼び出し側の import 化

`public/main.js` が TypeScript に移行済みの関数を参照している箇所を、明示的な `import` に置き換える。

```typescript
// src/modules/index.ts または main.ts
import { layerIsOn, drawLayers, applyLayersPreset } from "@legacy-ui-runtime/modules/ui/layers";
```

ただし `public/main.js` はレガシー非 ESM のため直接 `import` できない。  
この間は **互換シム** を用意する（後述）。

#### フェーズ 3 — `Object.assign(window, ...)` の削除

呼び出し側の import 化が完了した関数について、`Object.assign(window, ...)` のエントリを削除する。  
全エントリが削除されたら、ファイルから `Object.assign(window, ...)` 行ごと除去する。

---

## 互換シムの設け方

`public/main.js` が完全に移行されるまでの橋渡しとして、グローバルバインドを一箇所に集約した互換シムファイルを置く。

```
packages/@fmg/legacy-ui/src/
  globals-compat.ts   ← 新規作成。すべての window 公開をここに集約
```

### `globals-compat.ts` の役割

各モジュールから `import` した上で `window` に再公開する。

```typescript
// packages/@fmg/legacy-ui/src/globals-compat.ts
//
// 互換レイヤー: public/main.js が ESM 移行完了するまでの一時的なグローバル橋渡し。
// 各モジュールが ESM export を完備したあと、ここから import してまとめて公開する。
// public/main.js の移行が終わったらこのファイルごと削除する。

import { layerIsOn, drawLayers, applyLayersPreset } from "./modules/ui/layers";
import { tip, clearMainTip, stored, /* ... */ } from "./modules/ui/general";
// ...

Object.assign(window, {
  layerIsOn,
  drawLayers,
  applyLayersPreset,
  tip,
  clearMainTip,
  stored,
  // ...
});
```

`src/modules/index.ts` からこのファイルを 1 行 import するだけで、散在した `Object.assign` を集約できる。

```typescript
// src/modules/index.ts の末尾
import "@legacy-ui-runtime/globals-compat";
```

---

## 優先度別の移行順序

副作用が少なく独立度が高いものから始める。

### 優先度 高（まず着手）

#### `modules/ui/layers.ts` — `layerIsOn`, `drawLayers`, `applyLayersPreset`

理由: 既に `Object.assign` 追加済み。参照箇所が `public/main.js` に集中していて追跡しやすい。`layerIsOn` は多くのモジュールから呼ばれており、早期に export 化すると恩恵が大きい。

```typescript
// layers.ts
export function layerIsOn(el: string): boolean { ... }
export function drawLayers(): void { ... }
export function applyLayersPreset(): void { ... }
```

#### `modules/ui/general.ts` — `tip`, `clearMainTip`, `stored`, `store`, `locked`, `lock`, `unlock`

理由: 最も多くのモジュールから呼ばれる汎用ユーティリティ群。export 化することで他モジュールの import 移行が連鎖的に進む。

### 優先度 中（次のフェーズ）

#### `modules/ui/options.ts` — `applyStoredOptions`, `randomizeOptions`, `applyGraphSize`, `fitMapToScreen`

理由: `public/main.js` の初期化フローに直結している。`main.ts` の `RuntimeBridge` 型宣言と合わせて整理できる。

#### `modules/ui/editors.ts` — `restoreDefaultEvents`, `closeDialogs`

理由: エディタ全体から呼ばれる基盤関数だが、依存が `d3` と DOM のみで比較的独立している。

#### `modules/ui/measurers.ts` — `Rulers`, `Ruler`, `Opisometer`, `RouteOpisometer`, `Planimeter`, `createDefaultRuler`

理由: クラス群であるため `export class` / `export function` に変えやすい。`main.ts` の `_rulers` 変数経由で参照されているので依存を追いやすい。

### 優先度 低（後回し可）

#### `modules/ui/style-presets.ts` — `applyStyleOnLoad`
#### `modules/io/save.ts` — `initiateAutosave`
#### `modules/io/export.ts` — 各種エクスポート関数

理由: 呼び出し箇所が少ないか、`public/main.js` の対応する処理が移行完了するまで変更の意味が薄い。

---

## 1 ファイルの移行手順（チェックリスト）

`layers.ts` を例にした具体的な作業フロー。

```
[ ] 1. 関数定義に export を追加する
       export function layerIsOn(...) { ... }
[ ] 2. Object.assign(window, ...) はまだ残す
[ ] 3. globals-compat.ts に import & 再公開を移す
[ ] 4. 元ファイルの Object.assign(window, ...) から移行した関数を削除する
[ ] 5. npm run build でビルドが通ることを確認する
[ ] 6. Playwright で ブラウザエラーが出ないことを確認する
  Playwright MCP サーバーを使って対象URLに遷移し、console error / pageerror を確認する
[ ] 7. 呼び出し側（TypeScript ファイル）で import に置き換えられる箇所を置き換える
[ ] 8. 再度ビルドと Playwright 確認
```

---

## 型宣言の整理

現在 `packages/@fmg/types/src/globals.d.ts` と `src/types/global.ts` に `var xxx: any` でグローバルが宣言されている。

ESM 移行が完了した関数については、対応する `var` 宣言を削除する。削除しないと `window.xxx` 経由のアクセスが型エラーにならず、移行完了の検知が難しくなる。

```typescript
// globals.d.ts から削除すべき例（export 化後）
// var layerIsOn: (el: string) => boolean;   ← 削除
```

---

## 完了判定（Definition of Done）

各ファイルの移行完了条件:

1. ファイル内の `Object.assign(window, ...)` にそのファイル由来のエントリが残っていない
2. 移行した関数が `export` で公開されている
3. TypeScript ファイルからの参照がすべて `import` に置き換えられている
4. `npm run build` が成功する
5. Playwright による Dev Console チェックでエラーが出ない

全ファイルの移行完了条件:

1. `globals-compat.ts` が空になり、削除できる状態になった
2. `src/index.html` の `<script>window.modules = ...` シムが不要になった
3. `globals.d.ts` のグローバル宣言が実際に残存する変数のみになっている

---

## 関連ファイル

| ファイル | 役割 |
|---|---|
| `src/modules/index.ts` | legacy-ui モジュールの import エントリポイント |
| `packages/@fmg/legacy-ui/src/main.ts` | RuntimeBridge 型と依存注入のハブ |
| `packages/@fmg/types/src/globals.d.ts` | グローバル変数の型宣言（移行完了後に削除対象が出る） |
| `src/types/global.ts` | src ローカルのグローバル宣言（同上） |
| `public/main.js` | レガシーエントリポイント（最終的に legacy-ui/main.ts へ統合）|
| `.github/copilot-instructions.md` | ブラウザ診断時の Playwright 実行ガイドライン |

---

## 注意事項

- `public/main.js` が ESM でない限り、そこへの `import` は使えない。移行は必ず `globals-compat.ts` シム経由で行う。
- HMR（Vite の Hot Module Replacement）は ESM の副作用モジュールを再実行するため、`Object.assign(window, ...)` が残っていても基本的には問題ないが、順序依存バグが起きやすい。シムへの集約はこのリスクも下げる。
- ブラウザ診断は Playwright MCP サーバーを優先して行う。MCP 設定で `--executable-path /usr/bin/chromium` を指定し、必要に応じて `npm run test:e2e` で再確認する。
