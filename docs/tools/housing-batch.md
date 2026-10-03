# 都市の住宅数を一括比較する

```sh
npm run housing:export -- "temp/Bac Trang 2026-10-03-10-13.fmg" temp/housing-inputs.csv
npm run housing:batch -- temp/housing-inputs.csv temp/housing-results.csv
```

exportは削除済み都市とID 0を除く全都市を出力する。末尾に都市IDや完全一致の名前を指定すると対象を絞れる。同名都市はすべて対象になり、重複指定は除く。

```sh
npm run housing:export -- "temp/Bac Trang 2026-10-03-10-13.fmg" temp/housing-selected.csv 157 207 Crild
npm run housing:batch -- temp/housing-selected.csv temp/housing-selected-results.csv
```

CSVはUTF-8 BOM付きで、Excelでも日本語を読みやすくしている。人口・dwellings・seed・規模・範囲・城壁・港・河川数などの確認用列と、CEに渡す完全な入力である `share_json` を保存する。JSONには道路や河川の形状、地形、生成設定も含む。比較時には元のFMGを必要としない。

`max_bridge_crossing_meters` は時代設定と明示指定から解決した通常橋の横断総延長上限。複数径間を含み、単一支間の長さではない。旧列 `max_bridge_span_meters` は互換用に同じ値を出力する。上限を指定する場合は `share_json` 内の `descriptor.transport.maxBridgeCrossingMeters` を編集する。旧 `maxBridgeSpanMeters` の50m・1,000mは旧デフォルトとして時代別上限へ読み替える。

`share_json` が生成入力の正本で、通常の列は確認用。入力を変更して試す場合はJSON内の対応する値を編集する。例えばdwellingsは `descriptor.burg.dwellings`、生成seedは `seed`。burg_idとJSON内の都市IDは一致させる。source_extent_metersはFMG側の元の範囲を保持する。生成コードの補正を検証する際は、同じ入力CSVをそのまま再利用できる。

比較は都市ごとに新しい生成と建物キャッシュを使い、CEと同じ生成処理を実行する。全都市は時間がかかるので、まず対象を絞って試すことを推奨する。進捗を標準エラーに表示する。既存の出力パスは上書きされる。入力CSVと出力CSVに同じパスを指定しても動作するが、再比較のため入力を別に保存しておくと便利。

結果は入力列を残し、以下の列を追加する。

| 列 | 意味 |
| --- | --- |
| houses / houses_core / houses_outskirts | 住宅数、中心部、郊外。ランドマークや非住宅付属棟を除く |
| buildings / buildings_core / buildings_outskirts | CEの「建物」に相当する全建物数 |
| houses_minus_dwellings | 住宅数 − 入力dwellings。正なら過剰、負なら不足 |
| absolute_gap | 差の絶対値。この値の降順で出力 |
| houses_per_dwelling | 住宅数 / dwellings（小数点以下2桁） |
| relative_gap | 差 / dwellings。例: 0.5は50%過剰、-0.2は20%不足 |
| generated / generation_seed / error | 生成成功、生成seed、失敗理由 |

dwellingsが0なら比率は空欄。生成失敗や不正な入力の都市はerrorに理由を残して処理を続け、差は空欄として末尾に並べる。CSV全体の形式不正やFMG読み込み失敗はコマンドを失敗させる。住宅不足の優先度はhouses_minus_dwellingsの昇順、規模に対する差はrelative_gapの絶対値で表計算ソフトから確認できる。

既存の `housing:compare` は従来通りJSONを出力する。バッチツールも既存のjsdom/Vitest実行環境を使い、CEのブラウザ依存処理を再現する。ブラウザとNodeの幾何処理差により、一部の都市で住宅数がわずかに異なる場合がある。
