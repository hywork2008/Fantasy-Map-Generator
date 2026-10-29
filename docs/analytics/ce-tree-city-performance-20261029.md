# CE樹木LOD・都市全体の性能測定

確認用画像は目視比較のための一時出力とし、永続保存・Git収録を行わない。画像ファイルの有無を完了条件にせず、以下の所見・条件・計測値・再現手順を記録として残す。既存スクリプトによる画像出力も確認後に削除する。

実施日：2026-10-29。対象：[作製計画](../plan/ce-forest-biome-tree-lod-tasks.md) F5-3／F5-4。

## 結果と修正

現在の品質優先モデルを使う実CEの固定3都市で、森林standard・標準住宅・DPR 1・簡略化autoを測定した。変更前は中都市の俯瞰が操作p95 37.1 ms（影なし）／38.7 ms（影あり）で33 ms目標を超えた。同一フレーム内の採用モデル検索を共有した後は26.4 ms／27.6 msとなった。

変更後の3都市×4視点×影2設定×方針2構成＝48条件は、すべて操作p95 33 ms以内。最大27.6 msは製品の品質優先・中都市・俯瞰・影あり。予算内の対照条件でも全条件が同目標を満たした。この機種・解像度・入力・経路での結果であり、全都市・全樹種・別GPU・高DPRでの保証ではない。

`forestTreeDetails.ts` は候補ごとに同じ採用モデルを検索し直し、そのたびに版一覧をfilterし、prototypeのLRUを更新していた。中都市の俯瞰では約2.9万本が描画される。フレーム内だけ種×品質の検索結果を共有して反復を減らした。次のupdateでは共有表を作り直すため、作者・採用版の変更は引き続き反映される。モデルの形状、品質境界、採用、候補、予算方針は変更していない。

変更前後の比較可能な2,304フレーム（native影なし／あり、bounded-control影なし各3都市×4視点×64）で、森林の本数・三角形・calls・面積・詳細本数・詳細三角形・品質内訳・樹種・影三角形が完全一致した。採用切替と簡略行列の復元を含む関連34テストも成功した。

## 固定入力・計測条件

- 入力は森林F0の `small-flat`／`medium-flat`／`small-river-valley` を再利用。建物は各940／10,874／2,113棟。元の温帯落葉樹林のバイオームと都市設定を維持し、森林設定をsurroundings・standard密度にした。
- `mountCity3d` を使い、建物・水域・地形・施設・公園・森林・CEの描画スケジューラを含めて描画した。FMGやCE編集UIの起動時間・都市生成時間は含めない。
- Apple M4／ANGLE Metal、Chromium headless、1000×720、DPR 1、住宅standard、森林standard、都市部・郊外の簡略化auto。太陽を無効／有効にして影を比較した。ソフトウェアrendererまたはGPU timer query非対応なら測定を止める。
- nativeは製品の樹木profileをそのまま使う。bounded-controlはページの試験プロセス内だけ樹木profileのbudgetをboundedにした対照条件。製品の選択肢ではなく、品質優先との負荷差を調べるための条件である。
- 俯瞰・林縁・低視点・市街接近の4姿勢を固定。各姿勢のカメラ位置からX方向±24 m、Z方向±12 mの経路を動かし、12フレームのウォームアップ後に64フレームを採取した。LOD切替の停止時間を除外しない。
- CPUはCEの描画処理時間、操作時間はrequestAnimationFrame間隔。GPUは `EXT_disjoint_timer_query_webgl2` で最初のdrawから描画終了後までを囲み、非同期に完了を待つ。GPUがbusyだった時間だけを示す値ではなく、この範囲の経過時間である。`gl.finish()` は使わず、disjoint・不足サンプル・WebGLエラーなら失敗とする。
- mount CPUは同期の3D構築、readyはその後2 RAFまでの待ちを含む。初期化前のJSON読み込み・都市生成は対象外。操作計測前に作ったprototype等の再利用を含むウォーム状態の操作性能と区別する。

全条件の各フレーム統計と固定入力のSHA-256はGit管理外の全量JSONに保持し、[全量観測一覧](raw-observations-ce-tree-city-performance-20261029.md) にパス・サイズ・ハッシュを記録した。保存対象は派生JSON・記録であり、比較画像は一時確認後に削除する。

## 変更前後の中都市・俯瞰（native）

| 条件 | CPU p95 前→後 ms | GPU p95 前→後 ms | 操作p95 前→後 ms |
| --- | ---: | ---: | ---: |
| 影なし | 36.1→23.8 | 19.8→18.1 | 37.1→26.4 |
| 影あり | 37.1→23.1 | 24.0→19.5 | 38.7→27.6 |

各条件は一度の固定経路計測で、繰返し実験の信頼区間を求めたものではない。前後比較の主張は今回の測定値と描画状態の一致に限る。

## 変更後の都市別結果

各行のp95は4姿勢の中の最大値。CPU・GPU・操作の最大は必ずしも同じ姿勢ではない。全48姿勢のp50・p95・最大、森林最大コスト、frame値は [派生比較JSON](ce-tree-city-performance-20261029/comparison.json) に保存した。

| 方針 | 影 | 都市 | mount CPU ms | ready ms | CPU p95最大 ms | GPU p95最大 ms | 操作p95最大 ms |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| bounded-control | なし | small-flat | 682.2 | 822.3 | 1.7 | 3.0 | 26.6 |
| bounded-control | なし | medium-flat | 3039.4 | 3385.5 | 1.8 | 8.3 | 26.6 |
| bounded-control | なし | small-river-valley | 1988.8 | 2170.2 | 1.9 | 6.3 | 26.7 |
| bounded-control | あり | small-flat | 667.7 | 822.5 | 2.4 | 4.7 | 26.5 |
| bounded-control | あり | medium-flat | 3085.7 | 3570.5 | 1.6 | 13.1 | 26.4 |
| bounded-control | あり | small-river-valley | 2023.8 | 2220.1 | 1.8 | 8.8 | 27.0 |
| native | なし | small-flat | 699.2 | 899.3 | 5.8 | 12.3 | 27.1 |
| native | なし | medium-flat | 2966.5 | 3507.2 | 23.8 | 20.2 | 26.4 |
| native | なし | small-river-valley | 2073.8 | 2458.9 | 5.8 | 15.4 | 26.3 |
| native | あり | small-flat | 660.8 | 871.7 | 5.6 | 14.7 | 26.8 |
| native | あり | medium-flat | 3009.0 | 3600.3 | 23.4 | 25.9 | 27.6 |
| native | あり | small-river-valley | 1981.9 | 2234.2 | 5.6 | 21.3 | 26.6 |

## 数量予算・メモリ・画像

bounded-controlでは全フレームで森林の本数8,000・三角形300,000・calls 128・影50,000以下を確認した。nativeは品質優先のため本数・三角形・callsの上限達成条件には含めず、影の50,000だけを確認した。全体が33 ms以内でも、品質優先の数量を予算内と呼ばない。

12の都市／方針／影条件で各3巡、森林品質と4視点を切り替え、ビュー開閉後のgeometry・texture・森林cache数を比較した。最終2巡で同じ値となり、継続増加はなかった。これはビュー内で保持する資源の安定確認であり、解放後の0確認は前段のF5-2と区別する。

変更後の画像は native・影あり・中都市俯瞰 を目視確認し、市街・施設・道路・森林が同じ都市に存在することを確認した。各条件の4姿勢・変更前後の比較を一時的な画像で確認した。画像の永続保存と画像ハッシュ一覧を要件から外し、所見と再現手順を残す。pageerror・WebGLエラー・GPU disjointは全条件で0。

各条件の派生記録：

- [native・影なし](ce-tree-city-performance-20261029/native-plain/results.json)
- [native・影あり](ce-tree-city-performance-20261029/native-shadow/results.json)
- [bounded-control・影なし](ce-tree-city-performance-20261029/bounded-control-plain/results.json)
- [bounded-control・影あり](ce-tree-city-performance-20261029/bounded-control-shadow/results.json)

## 再現と検証

```sh
node --import tsx scripts/benchmarkCeTreeLodCity.mts
CE_FOREST_SHADOWS=1 node --import tsx scripts/benchmarkCeTreeLodCity.mts
CE_TREE_POLICY=bounded-control node --import tsx scripts/benchmarkCeTreeLodCity.mts
CE_TREE_POLICY=bounded-control CE_FOREST_SHADOWS=1 node --import tsx scripts/benchmarkCeTreeLodCity.mts
npx vitest run src/city3d/three/forestMeshes.test.ts src/city3d/three/forestTreeDetails.test.ts
```

計測は単独で順に実行し、GPU負荷を競合させない。`CE_TREE_IDS` で固定都市の一部を選べる。固定入力がローカルにない場合は、森林F0の生成手順で同じ入力を再生成してハッシュを照合する。現在のハーネスは本記録のstandard住宅条件で使用する。

関連2ファイル34件、変更ファイルのBiomeが成功。`npx tsc --noEmit --pretty false` は既存の `src/city-editor/renderers/fogControls.ts(45,36)` のstringとEditorMessageKeyの不一致で失敗し、今回の変更箇所の型エラーはなかった。入力3都市を越える多数seedや全件テストは実行していない。

初回のnative・影なし小都市は先行計測として別JSONに保存し、同じハーネスで残る2都市を採取した。変更前の9都市条件と変更後の12都市条件はそれぞれ独立に保存しており、失敗した予算内目標を成功した結果で上書きしたものではない。

## 次の作業

F5-3／F5-4を完了。今回のCPU削減と全48条件の33 ms以内を記録する。次はF5-5のバイオーム切替・保存／読込・Undo/Redoの総合確認へ進む。

F1-1の既存モデルの基準比較、F1-4／F2-3／F3-3の現地条件・接地・植栽範囲と、F5-6の全29バイオーム／全20樹種の最終受入は残る。簡略化無効での大都市、他の樹種による全都市、影・高DPR・別GPU・高品質住宅の追加性能校正は今回の達成範囲に含めない。特にヤナギhighの制作目安超過は、この温帯森林の計測で受入済みにしない。
