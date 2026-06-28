# レガシーDOM操作が残存しているコントローラーファイル一覧

`namesbase-editor.ts` と同様に、`src/controllers/` 配下で `document.getElementById` や `.addEventListener` といった命令的なDOM操作が行われており、純粋なReactコンポーネント（または純粋なロジック層）に移行しきれていないファイルの一覧です。

これらのファイルは将来的に、状態管理をReact（Zustand等）に委譲し、DOM操作を排除するリファクタリングの対象となります。

| ファイル名 | 主な役割 | 残存している非Reactパターンの例 |
| :--- | :--- | :--- |
| **地理・地形エディタ系** | | |
| `heightmap-editor.ts` | 標高マップの編集 | `document.getElementById`, `.addEventListener` による直接イベントバインド |
| `biomes-editor.ts` | バイオームの編集 | `document.getElementById` によるカラーピッカーや入力値の取得 |
| `coastline-editor.ts` | 海岸線の編集 | `document.getElementById` によるUI要素の取得 |
| `lakes-editor.ts` | 湖の編集 | 同上 |
| `rivers-editor.ts` | 川の編集 | 同上 |
| `rivers-creator.ts` | 川の生成ツール | `.addEventListener` によるUIバインド |
| **政治・文化・宗教系** | | |
| `states-editor.ts` | 国家エディタ | `document.getElementById` による直接の要素参照と更新 |
| `provinces-editor.ts` | 州エディタ | 一部React化されているが、内部で `document.getElementById` が残存 |
| `cultures-editor.ts` | 文化エディタ | `document.getElementById` によるUI取得 |
| `religions-editor.ts` | 宗教エディタ | `document.getElementById` によるUI取得 |
| `diplomacy-editor.ts` | 外交関係エディタ | `.addEventListener`, `document.getElementById` の使用 |
| **都市・拠点系** | | |
| `burg-editor.ts` | 個別都市エディタ | `document.getElementById` による要素取得 |
| `burgs-overview.ts` | 都市一覧概要 | `document.getElementById` による要素取得 |
| `burg-group-editor.ts` | 都市グループエディタ | `.addEventListener` によるイベント登録 |
| **軍事・部隊系** | | |
| `units-editor.ts` | 軍事ユニットエディタ | `document.getElementById`, `.addEventListener` の使用 |
| `regiment-editor.ts` | 連隊エディタ | `document.getElementById` によるUI取得 |
| `battle-screen.ts` | 戦闘画面UI | `document.getElementById` による直接書き換え |
| **装飾・メタデータ系** | | |
| `style.ts` | スタイルエディタ | `.addEventListener`, `document.getElementById` の広範な使用 |
| `emblems-editor.ts` | 紋章エディタ | `document.getElementById` の使用 |
| `labels-editor.ts` | ラベルエディタ | `document.getElementById` の使用 |
| `markers-editor.ts` | マーカーエディタ | `document.getElementById` の使用 |
| `markers-overview.ts` | マーカー一覧概要 | `document.getElementById` の使用 |
| `notes-editor.ts` | ノート（メモ）機能 | `document.getElementById` の使用 |
| **インフラ系** | | |
| `routes-editor.ts` | 経路エディタ | `document.getElementById` の使用 |
| `route-group-editor.ts`| 経路グループエディタ | `document.getElementById`, `.addEventListener` の使用 |
| **全般・ツール系** | | |
| `tools.ts` | ツールメニュー | `document.getElementById`, `.addEventListener` の使用 |
| `options.ts` | 設定画面 | `document.getElementById`, `.addEventListener` の使用 |
| `layers.ts` | レイヤー制御 | `document.getElementById`, `.addEventListener` の使用 |
| `measurers.ts` | 距離・面積測定ツール | `document.getElementById`, `.addEventListener` の使用 |
| `export-json.ts` | JSONエクスポート | `document.getElementById` の使用 |
| `ai-generator.ts` | AIテキスト生成連携 | `document.getElementById`, `.addEventListener` の使用 |
| `transform-tool.ts` | 変形ツール | `document.getElementById`, `.addEventListener` の使用 |
| `submap-tool.ts` | サブマップツール | `document.getElementById` の使用 |
| `minimap.ts` | ミニマップUI | `document.getElementById` の使用 |
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

## 移行済みファイル

- biomes-editor.ts
- rivers-creator.ts
- route-group-editor.ts
- minimap.ts
