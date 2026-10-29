# CE樹木LODの保存・読込・履歴・表示設定の確認

確認用画像は目視比較のための一時出力とし、永続保存・Git収録を行わない。画像ファイルの有無を完了条件にせず、以下の所見・条件・計測値・再現手順を記録として残す。既存スクリプトによる画像出力も確認後に削除する。

実施日：2026-10-29。対象：[作製計画](../plan/ce-forest-biome-tree-lod-tasks.md) F5-5。

## 結果

実CEページでバイオーム変更、Undo/Redo、編集用JSONの保存・ドロップ読込、ビュー開閉、ページ再読込を確認した。12状態の比較と関連6ファイル45テストが成功し、製品コードへの追加修正は不要だった。

- 温帯落葉樹林からタイガ・温帯雨林・温帯針葉樹林・暑い砂漠・氷河へ切り替えると、SVGと3Dが同じ植生方針を使う。氷河では森林と作者一覧の樹木が消える。
- 氷河への変更をUndoするとタイガ、Redoすると氷河となる。森林の本数・LOD・樹種と、編集JSONの内容が元の状態へ戻る。
- タイガ／氷河をそれぞれ編集JSONへ保存し、実際のファイルdrop経路で再読込して同じ状態を復元した。
- 各状態でメッシュと手動要素のSHA-256が入力と一致し、森林モード・密度も保持された。生成レシピのinput.biomeは現在のbiomeと一致し、generation.settingsのSHA-256は全状態で同じだった。
- 表示品質high／auto／standard／light、SVG表現all-trees、作者パネルとビュー開閉を操作しても、操作前後の編集JSONはバイト単位で同じ。表示品質・作者・採用版IDを都市や生成設定へ混入させていない。
- ページ再読込後も端末側の表示設定light／all-treesを保持した。編集文書の復元はファイル読込を使っており、自動保存を確認した記録ではない。

## 入力と経路

森林F0の固定小都市 `small-flat`（seed `ce-forest-f0-small-v1`、建物940棟）を使い、森林をsurroundings・standard密度とした。Chromium／ANGLE Metal／Apple M4、1440×1000、DPR 1でCE本体の `src/city-editor/index.html` を開いた。生成器と描画レイヤーだけのハーネスではなく、通常のバイオーム選択、履歴ボタン、編集JSON出力、ファイルdrop、3D切替、性能／作者パネルを操作した。

出力は保存形式v6。保存用Blobとダウンロードを検証内で捕捉し、ファイル操作の内容を比較した。全状態で都市メッシュとelementsのハッシュを検査した。生成器による都市の再生成・FMG連携の再同期は実行していない。

[結果JSON](ce-tree-persistence-20261029/results.json) に各状態の保存JSON・生成設定のSHA-256、SVG／3Dの森林面積、樹種・品質、作者パネル、入力と関連ソースのSHA-256を記録した。全保存JSONはGit管理外へ置き、[全量観測一覧](raw-observations-ce-tree-persistence-20261029.md) へパス・サイズ・ハッシュを記載した。

## 12状態の対応

カメラはCEの全体表示を使ったため、森林の個別品質はlow。森林全体のlightと、各モデルのlowは別の設定として検査した。森林がある状態では森林品質light、個別木12,048本・全low、面積993,664.5634041692 m²がSVGと3Dで一致した。

| # | 操作／状態 | バイオーム | 3D森林樹種 | 本数 | SVG面積 m² |
| --- | --- | --- | --- | ---: | ---: |
| 1 | initial | `temperateDeciduousForest` | `garden_parkland` | 12,048 | 993,664.6 |
| 2 | taiga | `taiga` | `norway_spruce`、`silver_birch` | 12,048 | 993,664.6 |
| 3 | temperateRainforest | `temperateRainforest` | `western_red_cedar` | 12,048 | 993,664.6 |
| 4 | temperateConiferousForest | `temperateConiferousForest` | `western_red_cedar` | 12,048 | 993,664.6 |
| 5 | hotDesert | `hotDesert` | `date_palm` | 12,048 | 993,664.6 |
| 6 | taiga | `taiga` | `norway_spruce`、`silver_birch` | 12,048 | 993,664.6 |
| 7 | glacier | `glacier` | 無立木 | 0 | 0.0 |
| 8 | undo-glacier | `taiga` | `norway_spruce`、`silver_birch` | 12,048 | 993,664.6 |
| 9 | redo-glacier | `glacier` | 無立木 | 0 | 0.0 |
| 10 | reload-glacier | `glacier` | 無立木 | 0 | 0.0 |
| 11 | reload-taiga | `taiga` | `norway_spruce`、`silver_birch` | 12,048 | 993,664.6 |
| 12 | final | `taiga` | `norway_spruce`、`silver_birch` | 12,048 | 993,664.6 |

氷河へのUndo／タイガの再読込／最後の表示設定変更後の保存ハッシュは、タイガ保存時と一致。氷河へのRedo／氷河の再読込は氷河保存時と一致した。保存後に見た目だけを合わせた比較ではなく、同じJSON内容へ戻ることを確認した。

作者パネルの各樹木について、表示されたfamily・品質に対する `adoptedTree` の作者と一致することを確認した。現在の採用表を正本とし、今回作者や採用版は変更していない。氷河では以前の森林の作者が残らなかった。

復元後の実CE画面 を目視し、タイガの選択、森林品質light、樹種・作者パネルと森林表示を確認した。全手順でpageerrorは0。性能測定やGPU資源解放の追加判定はこの確認の目的に含めない。

## 再現・関連テスト

```sh
node --import tsx scripts/verifyCeTreePersistence.mts
npx vitest run src/city-editor/components/biomeControls.test.ts src/city-editor/components/CityEditorPage.forest.test.ts src/city-editor/generators/forestPlan.test.ts src/city-editor/generators/history.test.ts src/city-editor/services/io/documentCodec.test.ts src/city-editor/renderers/cityViewRendering.test.ts
```

関連6ファイル45件が成功。既存テストはバイオーム選択とレシピ、森林の履歴と読込、表示設定の履歴非追加、文書codec、3Dの更新と品質切替を検証する。重複する単体テストは追加せず、実CEの結合経路を固定スクリプトで補った。

製品コードの変更がないため、型確認は今回再実行していない。前段の `fogControls.ts:45` の既存型エラーは今回の作業範囲に含めない。

## 残作業と次の作業

F5-5を完了。F5-6の最終受入には、F1-1のシナノキ・イチイの基準画像、F1-4／F2-3／F3-3の現地条件・接地・自然林と植栽範囲の確認を先に揃える。次はF1-1の既存2樹種の4品質・採用版の基準となる比較所見・計測値・再現手順を整理する。

今回の実UI確認は固定1都市と上記の代表バイオームの遷移であり、全29バイオーム×全品質×全作者の総当たりではない。全29キーの選択・無立木の網羅はF4-3、品質・簡略化・影はF5-2、都市全体の性能はF5-3／F5-4の記録と合わせて判断する。
