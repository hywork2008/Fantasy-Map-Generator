# レガシーDOM操作 マイグレーション計画

> **作成日**: 2026-06-26  
> **対象**: `src/` 以下の jQuery 時代のパターン（`.innerHTML =` / 直接 DOM 操作）  
> **目的**: 4層アーキテクチャ違反の解消・React 移行・安全性の確保

---

## このドキュメントを読むAIエージェントへ

このドキュメントはバグ調査の起点として用意したフェーズ別修正計画です。各フェーズを独立したセッションで実施できるように設計しています。作業前に必ず `AGENTS.md` を参照し、4層アーキテクチャルール・コーディング規約を確認してください。

**作業前チェックリスト（必須）:**
1. `npx tsc --noEmit` でコンパイルエラーなしを確認
2. `npm run lint` でゼロエラーを確認
3. `npm run test` で全テスト通過を確認
4. 作業後も同じチェックを繰り返し、**全て通過してからコミット**する

---

## 問題の全体像

### 調査結果（2026-06-26 時点）

| カテゴリ | パターン | 総件数 | ファイル数 |
|---|---|---|---|
| 4 | `.innerHTML =` | 201 | 43 |
| 5 | `document.getElementById` / `querySelector` / `appendChild` / `insertAdjacentHTML`（`src/renderers/` 除く）| 1,182 | 65 |

### 問題の分類

**4層アーキテクチャ上の違反:**
```
Generator 層  → DOM操作禁止（✅ 現状違反なし）
Renderer 層   → SVGのみ許可（⚠️ innerHTML使用あり、要確認）
Editor 層     → イベント経由のみ許可、SVG直接描画禁止（❌ 違反多数）
```

**具体的な問題パターン:**

| 優先度 | パターン | リスク |
|---|---|---|
| P0 | Editor/Controller 層からの SVG 直接挿入 | アーキテクチャ違反・レンダラバイパス |
| P1 | `innerHTML` へのワールドデータ直接代入 | XSS の温床・React 移行の障害 |
| P2 | 命令的 DOM API でのダイアログ構築 | 保守困難・テスト不可能 |
| P3 | Controller 層の巨大 DOM 依存パネル | React 移行の最大障壁 |

---

## フェーズ1: SVG 直接操作の Renderer 委譲（P0・最優先）

### 背景

`AGENTS.md` の Renderer Encapsulation Rule より:
> `d3.select("...").append(...)` 等の直接 DOM / SVG 操作は `src/renderers/` 外で**厳禁**。
> Editor 層はすべての描画操作を適切な Renderer に委譲しなければならない。

以下のファイルで Editor 層から SVG への直接書き込みが発生しており、最も危険度が高い。

### ⚠️ D3 ドラッグフィードバック例外（修正不要）

マウスの `mousemove` / `drag` イベントのホットパスでリアルタイムに更新される要素は、Renderer 経由では60fps を維持できないため、**直接 SVG 操作を例外として許可**する。

| ファイル | 行 | 内容 | 理由 |
|---|---|---|---|
| `src/controllers/editors.ts:95` | `moveCircle()` | ブラシ円の位置更新 (`setAttribute`) | `mousemove` ごとに呼ばれるホットパス。初回のみ `insertAdjacentHTML` で生成し、以降は `setAttribute` で位置更新するパターンは最適解。 |

これらは `// drag-feedback: direct SVG manipulation intentional for perf` コメントで明示して残す。

### 非 SVG 操作（フェーズ1の修正対象外）

カテゴリ5に含まれているが、SVG 操作ではなく HTML パネル内の UI 構築であるため**修正不要**:

| ファイル | 行 | 内容 |
|---|---|---|
| `src/controllers/editors.ts:305` | `insertAdjacentHTML` | カラーピッカーの HSL/HEX 入力フォーム（HTML `<label>/<input>`）|
| `src/controllers/editors.ts:864` | `appendChild` | アイコンピッカーのサムネイル `<div>`（HTML UI パネル内）|

### 対象ファイルと問題箇所

#### `src/controllers/editors.ts`
```
:100  insertAdjacentHTML でブラシ円 <circle> をSVGへ直接挿入  ← ⚠️ 例外（上記参照）
```
**対処方針**: 例外扱い。コメントを追記するのみ。

#### `src/controllers/tools.ts`
```
:1071 markersElement.insertAdjacentHTML でSVGマーカーを直接挿入
```
**対処方針**: `src/renderers/draw-markers.ts` にマーカー単体描画関数を追加し、委譲する。

#### `src/controllers/battle-screen.ts`
```
:749  document.getElementById("markers").insertAdjacentHTML でSVGマーカー挿入
```
**対処方針**: 上記と同様、Renderer の描画関数を呼ぶ。

#### `src/editors/coastline-editor.ts`
```
:294  document.getElementById(newGroup).appendChild(elSelected.node())
:345  document.getElementById(group).appendChild(elSelected.node())
:367  document.getElementById("sea_island") / document.getElementById(group)
```
**対処方針（SVG グループ構造変更）**: Renderer への委譲ではなく、`document.getElementById` を `viewContext.coastline.select(...)` に置換。`appendChild` 自体は Editor 層のデータ変更に伴う SVG 構造変更として許容。`:343` の `viewContext.coastline.node()!.appendChild(newGroup)` は既に正しい。

#### `src/editors/labels-editor.ts`
```
:183  document.getElementById(newGroup).appendChild(elSelected.node())
:228  document.getElementById(groupName).appendChild(elSelected.node())
```
**対処方針**: `document.getElementById` → `viewContext.labels.select(...)` に置換。`:226` は既に正しい。`:228` は直前で `viewContext.labels.node()!.appendChild(newGroup)` が実行されており `newGroup` 変数を直接使用可能。

#### `src/editors/lakes-editor.ts`
```
:198  document.getElementById(newGroup) — changeLakeGroup
:239  document.getElementById("lakes") — createNewGroup
:240  document.getElementById(group) — createNewGroup
:263  document.getElementById("freshwater") / document.getElementById(group) — removeLakeGroup
```
**対処方針**: `document.getElementById` → `viewContext.lakes.select(...)` / `viewContext.lakes.node()` に置換。

#### `src/editors/routes-editor.ts`
```
:397  document.getElementById(group).appendChild(elSelected.node())
```
**対処方針**: `viewContext.routes.select(`#${group}`).node()!` に置換。

#### `src/editors/states-editor.ts`
```
:1295 document.getElementById(`army${rulingStateId}`) — rulingStateArmy 取得
:1320 document.getElementById(oldId) — 移動対象 regiment 要素取得
```
**対処方針**: `viewContext.armies.select(...)` に置換。

#### `src/editors/emblems-editor.ts`
```
:301  document.getElementById("defs-emblems") — defsEmblems 取得
:302  document.getElementById(targetId) — oldEmblem 取得
```
**対処方針**: `viewContext.defs.select(...)` に置換。

### 作業手順（フェーズ1）

1. `src/renderers/draw-markers.ts` に `appendMarkerToLayer()` を追加し、`renderers/index.ts` でエクスポート
2. `tools.ts` と `battle-screen.ts` から `appendMarkerToLayer()` を呼び出すよう修正
3. 各エディタの `document.getElementById` を `viewContext.[layer].select(...)` に置換
4. `npx tsc --noEmit` + `npm run lint` + `npm run test` で確認

---

## フェーズ2: `innerHTML` × ワールドデータの安全化（P1）

### 背景

`innerHTML` に世界データを直接代入するパターンはユーザー作成データ（地名・メモ等）を扱う場合、XSS の温床になりうる。また React 移行の障害にもなる。

### 対象ファイルと問題箇所

#### `src/utils/uiHelpers.ts`（28件 — 最大集中箇所）

マップ情報パネル（右下の座標・セル情報表示）がすべて `innerHTML` で更新されている:
```typescript
// 現状（XSS リスク: burg名などユーザーデータを含む）
infoBurg.innerHTML = cells.burg[i] ? `${pack.burgs[cells.burg[i]].name} (${cells.burg[i]})` : "no";
infoState.innerHTML = cells.state[i] ? pack.states[cells.state[i]].fullName : "n/a";
```

**対処方針**:  
- 静的テキストのみの箇所 → `textContent =` に変更（XSS排除）
- 構造化HTMLが必要な箇所 → `DOMPurify.sanitize()` を通すか、React コンポーネントに移行
- マップ情報パネル全体を React コンポーネント `<MapInfoPanel />` として `src/ui/` に実装することが最終的なゴール

```typescript
// 安全な修正例（テキストのみ）
infoBurg.textContent = cells.burg[i] ? `${pack.burgs[cells.burg[i]].name} (${cells.burg[i]})` : "no";
```

#### `src/editors/` 各エディタでの `alertMessage.innerHTML`

各エディタでアラートメッセージを `innerHTML` で書き込んでいる:
```typescript
alertMessage.innerHTML = `Are you sure you want to remove the group? ... <i>sea_island</i> ...`;
```
これらは静的テンプレートリテラルで XSS リスクは低いが、React の `confirmationDialog` に統一する方が望ましい。

**対処方針**:  
- ユーザーデータを含まない純粋なテンプレート文字列 → 現状維持（低優先）
- ユーザーデータ（地名・グループ名等）を含む → `textContent` 分割か React ダイアログへ移行

#### `src/editors/emblems-editor.ts`
```typescript
:307  htmlEl.innerHTML = result  // SVGレンダリング結果の挿入
```
COA レンダラーが返す SVG 文字列を `innerHTML` で挿入している。SVG はサードパーティ生成のため XSS リスクがある。`DOMPurify.sanitize(result, { USE_PROFILES: { svg: true } })` でサニタイズするか、`AppServices.COArenderer` の戻り値型を `SVGElement` に変更して DOM ノードとして扱う。

### 作業手順（フェーズ2）

1. `uiHelpers.ts` のマップ情報パネル更新を `textContent` に変換（構造が単純なものから）
2. エディタの `alertMessage.innerHTML` でユーザーデータを含むものを `textContent` + `createElement` で分割
3. `emblems-editor.ts` の COA SVG 挿入を `DOMPurify.sanitize` で保護

### 意図的に維持した `innerHTML` パターン

以下は `innerHTML` を使用しているが、設計上の理由から変更してはならない。

#### `tip()` — ツールチップ (`src/utils/uiHelpers.ts:64`)

```typescript
tooltip.innerHTML = message;
```

**理由**: 呼び出し側が HTML 書式を意図的に使用している。

```typescript
// tools.ts 内の実例
tip(`<i>States Number</i> option value is zero. No counties are generated`, false, "error");
```

`textContent` に変えると `<i>` タグがそのまま文字列として表示されてしまう。ツールチップは同一オリジンのコードベースからのみ呼び出されるため、外部ユーザー入力が混入しない限り XSS リスクは実質ゼロ。

**禁止事項**: `tip()` に対してユーザー作成のワールドデータ（地名・メモ本文等）を**生文字列のまま**渡さないこと。ワールドデータを含む場合は呼び出し元で `String` として扱い、HTML タグを含まない形に制限する。

---

#### Notes Legend — リッチテキスト (`src/editors/notes-editor.ts`, `src/utils/uiHelpers.ts`)

```typescript
notesLegend.innerHTML = note.legend;   // notes-editor.ts
body.innerHTML = note.legend;          // uiHelpers.ts (サイドバー表示)
```

**理由**: `note.legend` は TinyMCE エディタが生成する HTML リッチテキストであり、ユーザーが意図的にフォーマット（太字・リンク・改行等）を付与したコンテンツ。`textContent` に変えるとフォーマットが失われる。

`note.name`（ノートのタイトル）はプレーンテキストなので `textContent` に変更済み。legend のみ維持。

---

#### `alertMessage.innerHTML = /* html */` パターン — 確認ダイアログ (各エディタ)

```typescript
// 典型例 (coastline-editor.ts)
alertMessage.innerHTML = `Are you sure you want to remove the group? ... <i>sea_island</i> ...`;
openRichDialog({ content: alertMessage.innerHTML, ... });
```

**理由**: これらはすべて**コードベース内に静的に記述されたテンプレート文字列**であり、ユーザー入力が直接挿入されるパターンではない（`count` のような数値は XSS に利用不可）。`openRichDialog` が `content` として受け取るのもこの静的文字列のみ。

**将来の方向性**: フェーズ3 の React 移行で `openRichDialog(<ConfirmDialog message={...} />)` 形式に置き換えると、この問題は根本的に解消される。

---

#### SVG text 要素への innerHTML (`src/editors/regiment-editor.ts`, `src/editors/markers-editor.ts` 等)

```typescript
// regiment-editor.ts
(getRegEl().querySelector("text") as SVGTextElement).innerHTML = String(Military.getTotal(reg));
// markers-editor.ts
iconText.innerHTML = isExternal ? "" : icon;
```

**理由**: SVG コンテキストの `<text>` 要素に対する `innerHTML` は HTML ではなく SVG XML を操作する。ブラウザの HTML パーサーを経由しないため、HTML XSS としては機能しない。また `labels-editor.ts` の `<tspan>` 挿入も同様に SVG XML 操作。

regiment の `innerHTML = String(total)` は純粋な数値のため、`textContent` への変換は可能だが優先度は低い。

---

#### `temp.innerHTML` — エディタ undo 履歴 (`src/editors/cultures-editor.ts:463`, `src/editors/states-editor.ts:1168`)

```typescript
temp.innerHTML = culturesManualHistory.pop() ?? "";  // 履歴から復元
// ...
culturesManualHistory.push(temp.innerHTML);           // 履歴へ保存
```

**理由**: エディタパネル全体の HTML をシリアライズして undo スタックに積む設計。`temp` は非表示の `<div>` で、保存・復元ともコードベース内部のみで行われる。ユーザー入力がスタックに混入するリスクはあるが、フェーズ3 の React 移行後に状態 (`useState`) ベースの undo に置き換えることで根本解消する。

---

## フェーズ3: 命令的ダイアログの React 移行（P2）

### 最優先ターゲット: `src/extensions/economy/editors/goods-distribution-editor.ts`

**現状**: 77件の `document.createElement` + `appendChild` でダイアログを構築している。UI の全テーブル・フォーム・ボタンをプログラマティックに生成しており、可読性・保守性・テスト可能性が著しく低い。

```typescript
// 現状の典型パターン（goods-distribution-editor.ts）
const dialog = document.createElement("dialog");
const header = document.createElement("div");
// ... 数十行の createElement + appendChild
document.body.appendChild(dialog);
```

**目標**: `src/extensions/economy/editors/GoodsDistributionDialog.tsx` として React コンポーネントに全面移行。`openRichDialog` (`ExtensionAPI`) を用いてホストアプリに登録する。

**移行パターン**:
```typescript
// 移行後
export const GoodsDistributionDialog: React.FC<{goodId: number; api: ExtensionAPI}> = ({ goodId, api }) => {
  // ...
  return <dialog>...</dialog>;
};

// editors から呼び出し
api.openRichDialog("goods-distribution", <GoodsDistributionDialog goodId={id} api={api} />);
```

#### `src/controllers/rivers-creator.ts`

River セル一覧を `document.createElement` + `appendChild` で構築している (95行)。`src/ui/dialogs/RiversCreatorDialog.tsx` として React 移行が適切。

### 作業手順（フェーズ3）

1. `goods-distribution-editor.ts` の既存ロジックを分析し、状態（選択された条件のリスト等）を抽出
2. `GoodsDistributionDialog.tsx` を作成、JSX でUIを再実装、状態は `useState` で管理
3. `openRichDialog` 経由での起動に切り替え
4. 旧 `goods-distribution-editor.ts` の DOM 構築コードを削除

---

## フェーズ4: 巨大コントローラの React 移行（P3・長期）

### 背景

`codebase-brushup-roadmap.md` フェーズ5「jQuery の完全排除」の中核タスク。DOM 依存が最も集中している2ファイルが全体の DOM 操作の約3割を占める。

### 対象ファイル

| ファイル | DOM操作件数 | 移行先 |
|---|---|---|
| `src/controllers/style.ts` | 253 | `src/ui/dialogs/StyleDialog.tsx` + Zustand store |
| `src/controllers/options.ts` | 104 | `src/ui/dialogs/OptionsDialog.tsx` + `useOptionsState` |

これらのコントローラはそれぞれ `document.getElementById` で HTML パネルの各コントロールを直接参照し、値を読み書きしている。React + Zustand に移行することで:
- 型安全なフォーム状態管理
- 双方向バインディングの宣言的記述
- エディタ PROBLEMS の解消

### 移行戦略

**段階的アプローチ（推奨）:**
1. 各コントローラ内のロジックを「状態読み書き関数」と「DOM参照」に分離する
2. 状態を Zustand store (`useStyleState`, `useOptionsState`) に移行する
3. HTML テンプレートパーツを React コンポーネントに順次置換する
4. 全パーツ移行完了後に旧コントローラファイルを削除する

**注意**: `style.ts` と `options.ts` は `window.fmg.actions` に公開されている関数を複数含んでいる。関数シグネチャを保ちながら実装を React コンポーネントのメソッドに委譲する設計を取ること。

---

## 許容パターン（修正不要）

以下のパターンは一見レガシーに見えるが、用途上正当であり修正不要:

### DOM 操作（appendChild / insertAdjacentHTML）

| ファイル | パターン | 理由 |
|---|---|---|
| `src/io/export.ts` | `appendChild` (cloneNode) | SVGエクスポート処理でクローンを操作するのは正当 |
| `src/io/load.ts:371` | `insertAdjacentHTML` | ファイルからSVGデータを読み込む処理 |
| `src/controllers/options.ts:454` | `document.head.appendChild(script)` | 外部スクリプト動的ロード（特殊用途） |
| `src/extensions/dynamicLoader.ts:41` | `document.head.appendChild(style)` | CSS動的ロード（拡張機能インフラ） |
| `src/canvas/map-canvas.ts` | `appendChild` (canvas, foreignObject) | Canvas要素をSVGに埋め込む特殊操作 |
| `src/extensions/economy/renderers/draw-trade-animation.ts` | `appendChild` | **Renderer 層**内なので正当 |
| `src/controllers/editors.ts:95` (`moveCircle`) | `insertAdjacentHTML` + `setAttribute` | ドラッグフィードバック例外 — `mousemove` ホットパス（詳細はフェーズ1参照）|

### innerHTML（意図的維持）

| ファイル / 箇所 | パターン | 理由（詳細はフェーズ2参照）|
|---|---|---|
| `src/utils/uiHelpers.ts:64` (`tip()`) | `tooltip.innerHTML = message` | 呼び出し元が `<i>` 等の HTML 書式を含む場合がある |
| `src/editors/notes-editor.ts`, `src/utils/uiHelpers.ts` | `body.innerHTML = note.legend` | TinyMCE が生成するリッチテキスト — `textContent` では書式が失われる |
| 各エディタの `alertMessage.innerHTML = /* html */` | 確認ダイアログ内容 | コードベース内の静的テンプレートのみ使用、ユーザーデータ混入なし |
| `src/editors/regiment-editor.ts`, `markers-editor.ts` 等 | SVG `<text>` 要素への `innerHTML` | SVG XML コンテキスト — HTML パーサー経由でなく XSS 経路にならない |
| `src/editors/cultures-editor.ts:463`, `states-editor.ts:1168` | `temp.innerHTML` (undo 履歴) | エディタパネル HTML のシリアライズ。フェーズ3 React 移行後に根本解消予定 |
| `src/renderers/` 内の `innerHTML` | SVGコンテンツ更新 | Renderer 層の責務範囲内 |

---

## 品質ゲート（全フェーズ共通）

各フェーズの完了条件:

```bash
# 1. 型チェック
npx tsc --noEmit
# → エラー 0

# 2. Lint
npm run lint
# → エラー 0、警告 0

# 3. テスト
npm run test
# → 全テスト通過（156件以上）

# 4. フェーズ1完了後の追加検証
grep -rn "insertAdjacentHTML\|\.appendChild" src/editors src/controllers \
  --include="*.ts" | grep -v "// acceptable" | grep -v "document.head"
# → SVG関連の行が残っていないこと
```

---

## 優先度サマリー

| フェーズ | 対象 | 工数感 | 効果 |
|---|---|---|---|
| **1** | SVG直接操作 → Renderer委譲 | 中（各 Editor 1〜2日） | アーキテクチャ違反の排除 |
| **2** | innerHTML × ワールドデータ → textContent | 小〜中 | XSS リスク排除 |
| **3** | 命令的ダイアログ → React | 中（goods-distribution は大） | 最高密度ファイルの解消 |
| **4** | style.ts / options.ts → React + Zustand | 大（各2〜3週） | DOM依存の根本的解消 |
