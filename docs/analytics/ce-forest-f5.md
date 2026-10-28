# CE 森林 F5：実GPUでの比較・調整・記録

実施日：2026-10-28  
対象計画：[ce-forest-surroundings.md](../plan/ce-forest-surroundings.md)

## 実装と判断

- 遠景の樹冠を広げ、上端を近景の樹木の高さへ近づけた。内部の樹冠半径を `min(24, cell × 0.6)`、中心の地上高を6.5 mとした。林縁は3.5 mの樹冠を維持し、外周・穴・道路の余白と全樹冠の包含判定は変えない。三角形数の上限は増やしていない。
- 開いている3Dビューのカメラ復元で都市入力の同期・resizeを繰り返さないようにした。通常の編集は既存の `sync()` で反映する。
- `getFramePerformance()` を追加した。CPU描画時間・森林統計を、全sceneのgeometry/materialを集計せずに取得できる。毎フレームの計測が高品質住宅の大きなsceneを走査して負荷を作る問題を避ける。既存の計測パネル用 `getPerformance()` は全体集計を維持する。
- MetalのApple M4で固定3入力を確認し、森林の数量上限と自動品質の33／20 ms、30／120サンプル、5／20秒は維持する。1機種の余裕だけを根拠に上限を引き上げない。
- 標準住宅条件では、標準森林の全姿勢でp95が33 ms以内。影を有効にしても同目標を満たした。標準住宅の操作中のCPU負荷を根拠に、森林のWorker化は今回は行わない。初回構築は別に記録し、待機・カメラ操作の時間と混同しない。

## 再現方法と測定の範囲

```sh
node --import tsx scripts/benchmarkCeForestFinal.mts
CE_FOREST_SHADOWS=1 CE_FOREST_OUTPUT=docs/analytics/ce-forest-f5/shadows \
  node --import tsx scripts/benchmarkCeForestFinal.mts
CE_FOREST_HOUSING=high CE_FOREST_OUTPUT=docs/analytics/ce-forest-f5/high-housing \
  node --import tsx scripts/benchmarkCeForestFinal.mts
```

- F0の `docs/analytics/raw/ce-forest-f0/{small-flat,medium-flat,small-river-valley}.json` を使う。ない場合はF0手順で再生成する。都市・seedはこの3件だけで、seed探索はしていない。
- Apple M4、Chromium 151の `--use-angle=metal`、1000 × 720、DPR 1。レンダラー文字列と `EXT_disjoint_timer_query_webgl2` を確認し、SwiftShader等のソフトウェア描画なら停止する。実際のバージョン・Git基点・入力のSHA-256は各結果JSONに記録した。Git基点は未コミットの今回変更を含むコミットではない。
- 3Dは実CEの `mountCity3d()` を使う。従来景観と森林の軽量・標準・高品質について、俯瞰・林縁・低い斜め視点で同じ位置の小さな周回を行う。姿勢ごとに12フレームをウォームアップし、続く64フレームを採用する。途中のLOD切替による停止は測定から除かない。
- 操作フレーム間隔はカメラを更新して次の描画が終わるまでの経路を含む。CPUはrenderer提出とLOD処理、GPUは最初のdrawからrender終了までを非同期queryで測る。GPUのdisjoint・未完了・WebGLエラーを検査し、`gl.finish()` は測定経路に入れない。影のclear等、最初のdrawより前の処理はGPU区間に含まれない。
- p50/p95はその64標本の順序統計。ヘッドレスのRAFスケジュールと計測処理を含むため、これから画面のFPSを逆算しない。初回shader/LOD構築、長距離移動の初回停止、別GPU、高DPRの保証ではない。
- 高品質住宅の比較は実UIの景観適用に合わせ、同じビュー・WebGLコンテキスト内で従来景観から森林へ更新した。結果の `reusedContext` に記録する。他の品質比較は独立した初回構築とした。
- 影なしが通常のCE既定状態。影ありは同じsun設定を有効にし、4096²のshadow mapと既存の250 ms以上の更新間隔を利用した。毎フレームshadow mapを強制更新していない。

## 2Dの比較

SVG構築は全都市を含むウォーム3回の中央値。農地を森林へ置換するため、従来との差は森林だけの追加時間ではない。エクスポートサイズはSVG文字列のUTF-8バイト数。パン・ズームはSVGの同一ノードを維持して32フレーム動かし、最初の4回を除く。

| 都市 | 森林面積 ha | 林縁／全域の森林要素数 | 従来／林縁／全域の構築 ms | 林縁／全域の出力 MB |
| --- | ---: | ---: | ---: | ---: |
| 平坦な小都市 | 99.4 | 1,289 / 8,000 | 62.7 / 22.0 / 84.9 | 1.08 / 3.42 |
| 平坦な中都市 | 399.1 | 2,607 / 8,000 | 2,171.3 / 93.8 / 152.5 | 5.10 / 6.97 |
| 川と谷の小都市 | 100.8 | 1,693 / 8,000 | 141.4 / 34.7 / 97.5 | 1.79 / 3.99 |

森林面積は2Dの両表現・3Dの全品質で一致した。全域樹木は3都市とも8,000要素の予算内、林縁は上限未満。静的SVGのハッシュ、ノード数、パン・ズームの標本は [結果JSON](ce-forest-f5/results.json) に収録する。大きなSVG自体は重複してGitへ追加しない。

## 3D：標準住宅、影なし

時間はms。全sceneを描いた値であり、森林だけのGPU時間ではない。GPUの差は別々の計測列のp95同士の差で、フレームごとの対差ではない。

| 都市 | 視点 | 従来の間隔 p95 | 森林の間隔 p50 / p95 | 森林CPU p95 | 従来GPU p95 | 森林GPU p95 | GPU差 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 平坦な小都市 | 俯瞰 | 28.2 | 13.9 / 26.2 | 1.1 | 2.4 | 2.2 | -0.2 |
| 平坦な小都市 | 林縁 | 26.5 | 14.1 / 27.1 | 0.7 | 2.1 | 2.5 | +0.4 |
| 平坦な小都市 | 低い斜め視点 | 26.3 | 14.4 / 26.4 | 0.8 | 1.9 | 2.4 | +0.5 |
| 平坦な中都市 | 俯瞰 | 26.5 | 12.4 / 27.9 | 0.9 | 8.5 | 9.6 | +1.0 |
| 平坦な中都市 | 林縁 | 26.7 | 14.3 / 27.3 | 0.8 | 8.6 | 10.0 | +1.4 |
| 平坦な中都市 | 低い斜め視点 | 26.2 | 15.2 / 25.7 | 0.7 | 9.5 | 10.4 | +0.9 |
| 川と谷の小都市 | 俯瞰 | 26.9 | 14.0 / 26.6 | 1.0 | 8.9 | 8.7 | -0.2 |
| 川と谷の小都市 | 林縁 | 26.7 | 14.5 / 26.4 | 0.6 | 5.3 | 5.4 | +0.2 |
| 川と谷の小都市 | 低い斜め視点 | 26.7 | 15.0 / 27.1 | 0.6 | 5.5 | 5.2 | -0.2 |

## 影ありと高品質住宅の切り分け

各都市の3姿勢のp95の最大値。住宅高品質は影なし。森林はどちらも標準を指定した。

| 都市 | 影あり：従来／森林の間隔 p95 | 高品質住宅：従来／森林の間隔 p95 | 高品質住宅：従来／森林のGPU p95 |
| --- | ---: | ---: | ---: |
| 平坦な小都市 | 27.5 / 27.0 | 25.9 / 26.2 | 14.9 / 14.6 |
| 平坦な中都市 | 26.2 / 26.2 | 93.5 / 102.2 | 96.9 / 88.4 |
| 川と谷の小都市 | 26.7 / 26.8 | 26.1 / 27.0 | 30.2 / 32.4 |

高品質住宅の中都市は従来景観でも33 msを超える。俯瞰の間隔p95は従来93.5 ms、森林102.2 msで、森林化による差も残る。住宅モデルの品質は森林とは別設定であり、森林の密度や面積を減らしてもこの市街側の負荷は解消しない。標準住宅へ下げる選択が有効で、今回の森林標準の目標達成は標準住宅・指定解像度の条件に限定する。高品質住宅と森林の追加分は [別結果](ce-forest-f5/high-housing/results.json) に残した。

高品質住宅の中都市では、初回構築CPUも16.8秒、同一ビューでの森林適用CPUは48.0秒を要した。この規模では景観適用の待ち時間も未改善の課題として残る。標準住宅の条件と分けて判断し、高品質住宅まで性能目標を達成したとは扱わない。

## 初回構築と資源の安定性

mountはシーン構築のCPU時間を1回ずつ測った値で、shaderのGPU完了時間を含まない。先行する2D構築・cacheの影響があり、差を純粋な森林構築時間とは解釈しない。

| 都市 | 従来／森林標準のmount ms | 品質切替＋開閉3巡のgeometry数 | texture数 |
| --- | ---: | --- | ---: |
| 平坦な小都市 | 274.8 / 415.3 | 78 → 78 → 78 | 0 |
| 平坦な中都市 | 1,321.1 / 1,806.5 | 126 → 126 → 126 | 0 |
| 川と谷の小都市 | 1,710.3 / 1,606.1 | 86 → 86 → 86 | 0 |

森林の立木・三角形・calls・影の上限はすべての標本で満たした。メモリ欄はWebGLの常駐geometry/texture件数で、GPUの実メモリバイト数は取得していない。geometry数が3巡で安定し、pageerror・context lost・WebGL errorは0件だった。全数観測には各標本の森林統計を保存し、Gitには最大値・末尾標本・CPU/GPU時間列を含む派生結果を置く。

## 見た目と画像

遠景の小さな点状の塊を広い樹冠へ調整し、近景の立木との高さの差を抑えた。保護用地の開口部・川や道の抜けを保持した。市街を囲む広い防御用の空地は既存の保護方針によるもので、森林化の際に縮めていない。

| 都市 | 2D | 3D |
| --- | --- | --- |
| 平坦な小都市 | [従来](ce-forest-f5/small-flat-2d-legacy.png)・[林縁](ce-forest-f5/small-flat-2d-edge-fill.png)・[全域](ce-forest-f5/small-flat-2d-all-trees.png) | [俯瞰](ce-forest-f5/small-flat-3d-overview.png)・[林縁](ce-forest-f5/small-flat-3d-edge.png)・[低視点](ce-forest-f5/small-flat-3d-low.png) |
| 平坦な中都市 | [従来](ce-forest-f5/medium-flat-2d-legacy.png)・[林縁](ce-forest-f5/medium-flat-2d-edge-fill.png)・[全域](ce-forest-f5/medium-flat-2d-all-trees.png) | [俯瞰](ce-forest-f5/medium-flat-3d-overview.png)・[林縁](ce-forest-f5/medium-flat-3d-edge.png)・[低視点](ce-forest-f5/medium-flat-3d-low.png) |
| 川と谷の小都市 | [従来](ce-forest-f5/small-river-valley-2d-legacy.png)・[林縁](ce-forest-f5/small-river-valley-2d-edge-fill.png)・[全域](ce-forest-f5/small-river-valley-2d-all-trees.png) | [俯瞰](ce-forest-f5/small-river-valley-3d-overview.png)・[林縁](ce-forest-f5/small-river-valley-3d-edge.png)・[低視点](ce-forest-f5/small-river-valley-3d-low.png) |

[調整前の遠景](ce-forest-f5/small-flat-3d-overview-before.png)／[調整後](ce-forest-f5/small-flat-3d-overview.png)。影あり画像は `ce-forest-f5/shadows/`、高品質住宅は `ce-forest-f5/high-housing/` に保存した。

## 確認と残る範囲

- 関連2ファイル8件、型検査、変更TypeScriptのBiome、`git diff --check` が成功。
- 面と穴の維持、地形・根元、樹冠の包含、候補の安定性、各予算、資源解放を既存の森林メッシュ試験で確認した。カメラ復元が都市入力を再読込しないこと、軽量統計取得がsceneを走査しないことを追加確認した。
- 自動品質の閾値は維持した。標準の余裕を確認できた一方、回復閾値20 msは33 msより保守的に残し、低下と回復を同じ閾値にして振動させない。手動指定を維持すること、段階的な低下・遅い回復はF4の関連試験で検証済み。
- F0〜F5の実装工程は完了。次の作業は別GPU・高DPR・より大きな実利用都市での追加校正。高品質住宅の中都市の最適化は市街描画側の独立課題とし、森林面積を減らして見かけ上の負荷を下げない。

## 観測データ

再生成可能な全量観測はGit管理外の `docs/analytics/raw/ce-forest-f5/`。一覧は [raw-observations-ce-forest-f5.md](raw-observations-ce-forest-f5.md)。派生JSONごとにも元の全量観測のSHA-256とバイト数を記録した。

初期の高品質住宅の観測ではビューを作り直す方式と全scene統計の毎フレーム取得を使っていた。最終比較は軽量統計と実UIと同じコンテキスト内更新へ揃えた。初期観測もrawの `high-housing-full-metrics-before.json` と `high-housing-separate-contexts-before.json` に残し、測定方法の違う数値を混ぜていない。

## 追補：高品質住宅の最適化

同日追加の [ce-housing-optimization.md](ce-housing-optimization.md) で、全域の詳細住宅を近景LODへ変更し、同一入力の住宅レイヤーとprototypeを再利用した。中都市の景観適用CPUは約48秒→約2.3秒、4姿勢の操作p95最大26.3 msへ改善した。本書の表は最適化前のF5観測として保持する。
