# JS→TS リファクタリング コーディング原則

このドキュメントは `public/`（レガシーJS）を `src/`（TypeScript）へ移行する際に、
**複数の Claude Code セッション間で一貫したアプローチを維持するための原則**をまとめたものです。

---

## 1. アーキテクチャの 4 層ルール

```
State（WorldState）
  ↓ 読み取り専用で渡す
Generator（src/modules/）  → 世界データを生成・変異
Renderer（src/renderers/） → SVG への純粋描画（書き込み禁止）
Editor（public/modules/ui/）→ ユーザー操作を受けて State を変異
```

| 層 | DOM/SVG を直接変更 | `pack` / `grid` を書き込む | 許可される操作 |
|---|---|---|---|
| Generator | ❌ | ✅ | State の生成・変異 |
| Renderer | ✅（SVG のみ） | ❌ | `Readonly<WorldState>` → SVG |
| Editor | ✅ | ✅ | ユーザー操作 → State 変異 + 再描画呼び出し |

**ESLint で強制する予定のルール**：
- Renderer ファイルで `pack.xxx =` という代入は `no-restricted-syntax` で禁止
- Generator ファイルで `document.*` / `svg.*` へのアクセスを `no-restricted-globals` で禁止

---

## 2. グローバル変数の扱い方

### 現状（フェーズ 1 完了後）

`src/types/global.ts` がグローバル変数の単一の型定義源。
`WorldState` 型（`src/types/WorldState.ts`）が最終的な移行先。

```typescript
// 現状：window.* 経由のグローバル
var pack: PackedGraph;
var grid: Grid;
var options: WorldOptions;
```

### 目標（フェーズ 5 以降）

```typescript
// main.ts で明示的に生成し、関数引数として渡す
const worldState: WorldState = createWorldState();
Generator.run(worldState);
Renderer.draw(worldState as Readonly<WorldState>);
```

**移行中の注意**：
- `window.*` への新規代入を禁止。既存コードを触る際は引数渡しに変換する
- 既存のグローバル参照は `global.ts` の型定義を通じてのみ使用する
- `any` を新たに追加しない。型が分からない場合は `unknown` にして型ガードを書く

---

## 3. 型定義の原則

### `any` の代わりに使うもの

| 状況 | 代替 |
|---|---|
| 型が本当に不明 | `unknown` + 型ガード |
| 複数の具体的な型 | Union 型 (`A \| B`) |
| 後から追加されるプロパティ | オプショナル (`?`) または フェーズを分けて定義 |
| 判別共用型（氷、ルートなど） | discriminated union (`type: "iceberg" \| "glacier"`) |

### `!` 非 null アサーション

生成パイプラインの実行順序が保証されている場所でのみ使用する。
コメントで「なぜ安全か」を説明すること。

```typescript
// options.year は generateWorld() で必ず設定される
const year = options.year!;
```

### TypedArray と `number[]`

`pack.cells.*` や `grid.cells.*` は `TypedArray`（`Uint8Array` 等）。
`number[]` と区別して扱い、`.forEach` より `for...of` か `Array.from()` を使う。

---

## 4. Grid / Pack の型階層

```
voronoi.ts    → Cells（基底Voronoi構造: v, c, b, i のみ）
graphUtils.ts → GridCells = Cells & { h, t, f, temp, prec }（生成後のグリッド）
              → Grid = { cells: GridCells, vertices, points, features, ... }
PackedGraph.ts → PackedGraph（packed グラフ + 全ゲームデータ）
```

- `Grid` は `generateGrid()` で生成され、生成パイプラインが後から `h`, `t`, `f`, `temp`, `prec`, `features` を追加する
- `PackedGraph` は `pack` グローバル。`cells` の型は `PackedGraph["cells"]`（`GridCells` とは別物）

---

## 5. ファイル移行の手順

1. **対象ファイルを `public/modules/` から `src/` へコピー**（拡張子を `.ts` に変更）
2. **型エラーを修正**。`any` は使わず union 型かオプショナルで対処
3. **`src/types/global.ts` を更新**して不要になったグローバル宣言を削除
4. **元の `.js` ファイルを削除**し、`index.html` でのスクリプト参照を更新
5. **`npx tsc --noEmit` がゼロエラー**であることを確認してからコミット

---

## 6. 命名規則と型のエクスポート

- **型/インターフェースのエクスポート**：同じモジュール内でしか使わないものは `interface`（非エクスポート）、他モジュールから参照されるものは `export interface`
- **モジュールの型**: `src/modules/xxx.ts` で定義し、`PackedGraph.ts` / `global.ts` からインポートする
- **ファイル名**: `kebab-case`（例: `rivers-creator.ts`）、型名: `PascalCase`

---

## 7. コミット粒度の指針

- **フェーズ単位でコミット**。ファイル 1 枚ずつの細かいコミットは避ける
- **`npx tsc --noEmit` がゼロエラーの状態**でコミットする
- コミットメッセージ例: `refactor: migrate rivers-editor to TypeScript (phase 2)`

---

## 8. よくある落とし穴

| 落とし穴 | 対処 |
|---|---|
| `d3.event` （D3 v5 以前の API） | D3 v6+ では `event` 引数を関数パラメータとして受け取る |
| `var` のグローバルリーク | `let` / `const` に変更し、スコープを明示する |
| `$.dialog(...)` の型 | jQuery UI の型は `any` のままとし、フェーズ 3 以降で整理する |
| 判別共用型のアクセス | `.type` で絞り込んでからアクセス（`if (ice.type === "iceberg") ice.cellId` など） |
| `Uint32Array.map()` の返り値 | `Uint32Array` を返す。`number[]` が欲しければ `Array.from()` を使う |
