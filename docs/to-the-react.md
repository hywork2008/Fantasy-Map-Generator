# レガシーDOM操作が残存しているコントローラーファイル一覧

`namesbase-editor.ts` と同様に、`src/controllers/` 配下で `document.getElementById` や `.addEventListener` といった命令的なDOM操作が行われており、純粋なReactコンポーネント（または純粋なロジック層）に移行しきれていないファイルの一覧です。

これらのファイルは将来的に、状態管理をReact（Zustand等）に委譲し、DOM操作を排除するリファクタリングの対象となります。

| ファイル名 | 主な役割 | 残存している非Reactパターンの例 |
| :--- | :--- | :--- |
| **全般・ツール系** | | |
| `tools.ts` | ツールメニュー | `document.getElementById`, `.addEventListener` の使用 |
| `layers.ts` | レイヤー制御 | `document.getElementById`, `.addEventListener` の使用 |
| `measurers.ts` | 距離・面積測定ツール | `document.getElementById`, `.addEventListener` の使用 |
| `transform-tool.ts` | 変形ツール | `document.getElementById`, `.addEventListener` の使用 |
| `hotkeys.ts` | ホットキー管理 | `.addEventListener` を用いた直接のキーバインド（グローバルなイベント登録） |
| `editors.ts` | エディタ基盤処理 | `.addEventListener` を用いた共通ダイアログ処理など |

## リファクタリングのアプローチ（AGENTS.md準拠）

これらのファイルを改修する際は、今回実施した `namesbase-editor.ts` と同様の以下のステップを踏むことが推奨されます。

1. **State管理の分離**: 
   React側で管理すべきUIの状態（開閉状態、入力値、選択中のインデックス等）を `useState` や Zustand のストア（例: `src/store/...`）に移行する。
2. **DOM操作の排除**: 
   `document.getElementById` などの命令的クエリを削除し、Reactのコンポーネント（例: `src/ui/dialogs/...`）が宣言的に描画するように書き換える。
3. **ロジックの純粋化**: 
   `src/controllers/...` 内の関数は、引数としてデータを受け取り、DOMに依存せずデータを加工・更新する純粋な関数（あるいは `worldContext` を直接変更するピュアなミューテーター）として再定義する。

## 変更してはいけないパターン（既知の例外）

以下のパターンはアプリ全体で広く共有されており、**個別ファイルの React 化スコープでは変更しない**こと。
変更した場合、他のコントローラーとの整合性が崩れる。

### `toggleCells.dataset.forced` パターン

```ts
// 例: rivers-editor.ts / routes-editor.ts / rivers-creator.ts / burg-editor.ts 等
const toggleCellsEl = document.getElementById("toggleCells");
if (toggleCellsEl) toggleCellsEl.dataset.forced = String(+!layerIsOn("toggleCells"));
```

このパターンは複数のエディタが「セルレイヤーを一時的に強制表示してから、エディタ終了時に元に戻す」という協調動作を実現するために、`dataset.forced` フラグを共有シグナルとして利用している。
`rivers-editor.ts` の `document.getElementById("toggleCells")` はこの仕組みの一部であり、個別に置き換えると他のエディタとの協調が壊れる。

このパターンを完全に廃止するには、専用の Zustand ストアに「強制表示カウンター」を持たせる等のアプリ横断的なリファクタリングが必要であり、個別ファイルの改修と切り離して計画すること。
