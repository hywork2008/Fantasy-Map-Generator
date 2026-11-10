# CE meshless 全量検証の性能改善（2026-11-08）

[ステージ再計測](ce-mesh-vs-meshless-stages-20261108.md)を受けた最初のチューニング。全量検証を省略せず、交差点と敷地の重なり判定に空間索引を導入した。同じ固定入力の変更前後で、生成＋SVG構築は **23.589秒 → 4.269秒（81.9%短縮、5.53倍）**。生成文書のSHA-256は一致した。

## 条件と計測方法

- 人口5,000人・シード `b5o620`・河川1本・海岸なし・外壁1重・Organic・Medieval・Age of Exploration・Voronoi/Small・FMG連携なし。中央プラザ・教会・墓地を含む、参照記録と同じ条件。
- Apple M4、darwin 27.0.0、Node v22.23.1、Vitest/jsdom、1 worker、逐次実行。各条件を1回測定し、多数シード・平均・中央値は扱わない。
- 変更前は2026-11-08 07:14 JST、変更後は07:16 JST。ベースコミットは `4d3177d62a473d081631aa44eef670a7013f740f`。実際の計測ソースのSHA-256は各JSONの `measurementSources`。
- 計測テストに、完成文書の独立した全量検証と内部区間の計測を追加した。実行順は生成 → 独立検証 → SVG構築。独立検証時間は生成＋SVG合計に含めない。SVG構築も従来どおり全量検証を実行する。この独立検証によるキャッシュ状態の違いがあるため、改善率は今回の変更前後を使う。
- 変更後の初回実行は関連テスト等と同時実行だったため比較値に採用せず、関連テストと型チェックの終了後に単独実行し直した。下表と保存JSONは単独実行の値。
- 実ブラウザのlayout/paint、Worker転送、Undo履歴、編集パネル更新は含まない。

## 結果

| 範囲 | 変更前 ms | 変更後 ms | 短縮率 |
| --- | ---: | ---: | ---: |
| 入力準備から生成完了 | 13,056.08 | 3,169.04 | 75.7% |
| 生成末尾の全量検証（生成時間の内数） | 10,165.11 | 231.37 | 97.7% |
| 独立した全量検証（合計の対象外） | 9,618.48 | 213.08 | 97.8% |
| 独立検証内の交差点・敷地判定 | 9,416.81 | 6.75 | 99.93% |
| SVG構築（全量検証を含む） | 10,532.45 | 1,100.43 | 89.6% |
| 生成＋SVG | 23,588.53 | 4,269.47 | 81.9% |

独立検証では交差点・敷地判定が変更前の97.9%を占めた。住宅の領域演算等を含むurban検証は108.46ms → 111.42msで、今回の主因ではなかった。変更後の主な検証区間はurban 111.42ms、network 70.75ms。

参考として、変更後の同一実行でmesh firstは生成4,417.03ms、SVG 714.79ms、合計5,131.82ms。生成形状・住宅数・農地処理等の方式差は元の記録どおり残るため、一般的な方式の優劣とは解釈しない。

## 実装

`src/city-editor/generators/vector/validation/document.ts` の交差点検証で、全配置敷地と予約領域をRBushに登録する。交差点の境界矩形に重なる候補だけに、従来の `surfacesOverlap` を適用する。

- 近接接触を取りこぼさないよう、検索矩形を `segmentsIntersect` の許容値と同じ1e-9だけ拡張する。
- 穴・包含・交差・境界接触の厳密判定とエラー形式は維持する。
- 索引は検証呼び出しごとに再構築し、同じ文書の直接編集も再検証する。検証結果キャッシュやrevisionだけを根拠とする省略は導入しない。
- 生成・描画・編集・保存の全量検証呼び出しは維持する。参照記録が候補に挙げた検証の重複削減より先に、1回の検証コストを解消した。
- `validateVectorDocument` に任意の区間計測コールバックを追加し、計測テストから内訳を記録する。都市文書の保存形式は変わらない。

## 出力の一致と検証

変更前後と参照記録の生成文書SHA-256はすべて `ecbda3930f672adcd5230c104f98f87d586f960148d3c6f87247b66a0e66a7f9`。変更前後の条件オブジェクトと人口レポートも完全一致した。住宅890棟、配置891件、道路等752本、SVG子要素5,063件、未配置人口0人。

関連テストは5ファイル77件成功。配置敷地・予約領域それぞれで遠方、境界矩形だけの重なり、包含、辺の交差、接触、許容値内外、穴を従来の厳密判定と比較した。直接編集後に描画・保存が不正な重なりを拒否する回帰テストも追加した。

```sh
npx vitest run src/city-editor/generators/vector/validation/document.test.ts src/city-editor/generators/vector/document.test.ts src/city-editor/generators/vector/generation/urban.test.ts src/city-editor/generators/vector/editing/network.test.ts src/city-editor/renderers/vector/renderData.test.ts --maxWorkers=1
CE_STAGE_PERFORMANCE_OUT="$PWD/docs/analytics/ce-meshless-validation-tuning-20261108.json" npx vitest run src/city-editor/services/analysis/meshlessStagePerformance.cli.test.ts --maxWorkers=1
npx tsc --noEmit
```

固定条件の計測テスト1件も成功し、18段階・人口・中央施設・面積等の既存アサーションを通過した。型チェックと変更した3ソースのBiomeチェックも成功。全件テスト・ブラウザE2Eは実行していない。

## 保存データと次の作業

- [変更前の全計測値](ce-meshless-validation-tuning-before-20261108.json)
- [変更後の全計測値](ce-meshless-validation-tuning-20261108.json)

生成都市の全量JSON/SVGは保存せず、ハッシュと条件・時間のみを保存した。

次に進める作業は、現在の生成時間の48.4%を占める `skeleton.road-routing`（1,533.91ms）の内訳計測と改善。その次にSVG構築1,100.43msを検証・描画データ作成・DOM構築に分けて計測する。検証の重複削減は、編集後の失効管理と効果を評価してから判断する。
