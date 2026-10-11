# RE / CE 表示文言のキー

RE / CE の表示文言は `src/i18n/locales/editors.en.json` と
`src/i18n/locales/editors.ja.json` で管理する。既存の i18next リソースへ
`src/i18n/index.ts` で統合する。既定言語とフォールバックは英語。
既存の言語設定 `fmg-language` に `ja` が保存されていれば日本語で開始する。
日本語辞書では、従来から英語で表示していた項目の文言も保持している。

## 生成フェーズ

13 段階の親項目は `cityEditor.generationStages.title`（都市生成フェーズ）。
番号は表示値・実行順序であり、翻訳キーには使わない。

| 段階 | キーの接頭辞 | 日本語の表示値 |
| --- | --- | --- |
| 1 | `cityEditor.generationStages.coast` | ① 海岸線と海 |
| 2 | `cityEditor.generationStages.river` | ② 河川 |
| 3 | `cityEditor.generationStages.urban` | ③ 市街地コア |
| 4 | `cityEditor.generationStages.walls` | ④ 城壁 |
| 5 | `cityEditor.generationStages.riverPassages` | ⑤ 河川横断・セル分割 |
| 6 | `cityEditor.generationStages.passages` | ⑥ 門の通路・セル分割 |
| 7 | `cityEditor.generationStages.gates` | ⑦ 門・城郭 |
| 8 | `cityEditor.generationStages.streets` | ⑧ 街路 |
| 9 | `cityEditor.generationStages.wards` | ⑨ 地区割り当て |
| 10 | `cityEditor.generationStages.geometry` | ⑩ 幾何平滑化 |
| 11 | `cityEditor.generationStages.blocks` | ⑪ 街区・小道 |
| 12 | `cityEditor.generationStages.buildings` | ⑫ 住居・完成都市 |
| 13 | `cityEditor.generationStages.conceal` | ⑬ 道路・小道を隠す |

各接頭辞に `.label`（表示名）、`.hint`（説明）を付ける。
`GenerationStage.labelKey` / `hintKey` がそのキーを保持し、
`label` / `hint` は現在の言語で解決する。

## FMG から受け取ったパラメーター

CE の受信パラメーター群の親見出しは `cityEditor.fmgParameters.title`。
受信データ本体は `generateSettings.descriptor`（`BurgSiteDescriptor`）。
`cityEditor.messages.fromWorldMap` は受信元の表示であり、全体の見出しではない。

## その他の表示項目

- `cityEditor.messages.*` / `regionEditor.messages.*`: パネル、設定名、説明、ボタン、
  ツールチップ、通知、履歴、生成診断、選択情報、地図の表示ラベル。
- `cityEditor.options.*` / `regionEditor.options.*`: 選択肢や種別の表示名。
  ドキュメントに保存する値や HTML の `option.value` は変更しない。
- `cityEditor.pageTitle` / `pageDescription` および RE の同名キー: ページのメタ情報。

コードでは型付きの `editorText(key, values)` を使う。
HTML に埋め込む文言は `editorHtml(key, values)` を使い、差し込み値は
エスケープ前の値を渡す。`editorHtml` が文言と値を一度だけエスケープする。
`editorOptionText(value, editor)` は既知の種別を翻訳し、外部データの独自 ID は保持する。

都市名、地物名、ユーザーの入力、地図の数値、保存形式のフィールド名や ID は
翻訳辞書の表示項目と区別する。新しい表示文言を追加するときは英日双方に
同じ意味のキーと同じ差し込みパラメーターを追加する。

`src/i18n/editorMessages.test.ts` が辞書のキー・差し込みパラメーターの一致、
13 段階の識別、言語別の RE 表示、HTML エスケープ、日本語の直書き再混入を検証する。
