# CE mesh first / meshless 生成ステージ時間比較（2026-11-07）

同じ既定設定・シードで、一括生成は **mesh first 4.277秒、meshless 15.923秒（3.72倍）**。SVG構築まで含めると **4.990秒 対 27.470秒（5.50倍）**。

meshlessの最大区間は最終文書検証 **12.124秒**（生成時間の76.1%）。SVG構築 **11.548秒** にも同じ全量文書検証が含まれる。今回は計測のみで、検証の省略や生成方式の高速化は行っていない。

## 条件・時間の読み方

- 入力: CE単独起動の既定値相当。人口5,000人、Age of Exploration、Voronoi / Small 1.2 km、Organic、海岸なし・河川1本、外壁1重、Medieval建物。FMG連携なし。
- 地図シード・生成シード: `b5o620`。再試行で成功するシードを探索した結果ではなく、この固定入力1組を順に計測。地形形状・建物数の一致は前提にしていない。
- meshlessは既定の`medieval`、Facilities探索なし。両方式とも目標人口5,000人・未配置人口0人を確認。
- 実行環境: Apple M4 / 10 logical CPUs、darwin 27.0.0、Node v22.23.1、Vitest/jsdom、1 worker、方式・ステージ間の並列実行なし。
- 時間は`performance.now()`による単発の実測値。モジュール読み込み後に実行。ウォームアップ反復・平均・中央値・多数シード試験は行っていない。実行順やJIT/GCによる差を含む。
- **下の対応表のMF時間は、その表示ステージを元の入力から直接再生成する累積時間**。UIの`generateStageOnDocument(processStep, wallCheckpoint)`と同じ呼び出しを使う。直前の行だけにかかった差分時間ではなく、各行を足してはいけない。MF側は各行で入力を複製し、プレビューキャッシュをクリア。
- **ML時間は、一度の通常生成内の重複しない実処理区間**。複数のMF表示段階が同じML区間に対応する場合は、同じ番号・時間を再掲している。対応表のML列も足してはいけない。全区間の合計は後段の内訳表で確認できる。
- 一括生成とチェックポイント再生成は別の経路。特にMFのBuildingsチェックポイントだけの値には、一括生成で行う人口収容補正・農地処理の全負担は含まれない。比較の倍率には一括生成同士の値を使う。
- SVG構築は2Dの生成物作成まで。ブラウザのレイアウト・paint、Worker起動/転送、Undo履歴、編集パネル更新、ファイル保存を含まない。したがってボタンを押して表示されるまでの実ブラウザ待ち時間そのものではない。

## City generation stages 対応表

単位: ms。MF順は実際のUI定義の番号。ML順は次節の計測区間番号。MF再生成とML到達累積が、それぞれ元の入力からその段階の処理を終えるまでの値。ML対応区間列は、その段階に関連する個別処理だけの値。ML到達累積は計測区間の先頭からの和で、呼び出し等の未区分差1.27msを除く。順番が違うため、対応表のML累積時間は上から単調増加しない。

| MF順 | mesh firstの表示ステージ | MF再生成 ms | ML実行順 | ML到達累積 ms | ML対応区間 ms（番号:時間） | 対応・順序の違い |
| ---: | --- | ---: | --- | ---: | --- | --- |
| 1 | Coastline and sea (`coast`) | 12.87 | 1 | 6.40 | 1: 6.40 | 海岸なし。入力準備の共通区間。海岸生成の単独処理なし。 |
| 2 | Rivers (`river`) | 13.81 | 1 | 6.40 | 1: 6.40 | 入力の河川中心線を作成。MFの河川セル分類とは処理内容が異なる。 |
| 3 | Urban core (`urban`) | 12.63 | 1 → 9 | 2,640.25 | 1: 6.40 / 9: 0.28 | 人口から領域を設定。MFの都市セルの洪水塗りつぶしは実行しない。 |
| 4 | Town walls (`walls`) | 13.06 | 3 | 385.31 | 3: 377.75 | 外壁・門・橋の一括処理。下の3段階と同一区間を参照。 |
| 5 | River crossings and cell splitting (`riverPassages`) | 68.56 | 3 | 385.31 | 3: 377.75 | 外壁・門・橋と一括。単独時間に分割できない。 |
| 6 | Gate passages and cell splitting (`passages`) | 72.76 | 3 | 385.31 | 3: 377.75 | 外壁・門・橋と一括。単独時間に分割できない。 |
| 7 | Gates and castles (`gates`) | 78.14 | 3 | 385.31 | 3: 377.75 | 外壁・門・橋と一括。単独時間に分割できない。 |
| 8 | Streets (`streets`) | 97.48 | 4 → 5 | 2,505.44 | 4: 2,075.98 / 5: 44.15 | 道路探索 → 接続点作成・検証。 |
| 9 | District assignment (`wards`) | 96.89 | 14 | 3,522.26 | 14: 5.32 | 地区・段階表示台帳。小街区の計画12・グラフ13より後。 |
| 10 | Gate-to-centre roads (`centerRoads`) | 91.59 | 4 → 5 | 2,505.44 | 4: 2,075.98 / 5: 44.15 | 外部道路・中心接続道路は同じ探索区間で作成。 |
| 11 | Inner town wall (`innerWall`) | 81.55 | — | — | — | 既定は外壁1重。meshlessに独立した内壁生成段階なし。 |
| 12 | Old-town gates and roads (`innerGates`) | 85.86 | — | — | — | 既定は外壁1重。meshlessに独立した内門生成段階なし。 |
| 13 | Town streets (`townStreets`) | 89.26 | 12 → 13 | 3,516.93 | 12: 596.91 / 13: 225.16 | CE共通の街区・小路・住宅平面計画＋native接続 → 道路グラフ。12は住宅平面も含む。 |
| 14 | Geometry smoothing (`geometry`) | 162.27 | —（検証は5・20） | — | — | メッシュ頂点平滑化に直接対応する処理なし。文書全体の最終検証20は別表に記載。 |
| 15 | Blocks and lanes (`blocks`) | 166.33 | 6 → 10 → 12 | 3,291.78 | 6: 44.03 / 10: 36.51 / 12: 596.91 | 骨格の敷地分割 → 基礎街区の再算出 → CE街区・小路・住宅平面計画。12を再掲。 |
| 16 | Housing and completed city (`buildings`) | 166.78 | 12 → 16 → 17 → 19 → 20 → 21 | 15,921.46 | 12: 596.91 / 16: 211.04 / 17: 14.82 / 19: 21.36 / 20: 12,124.04 / 21: 9.68 | 住宅平面を先に計画し、配置・人口配分後に完成台帳と全量検証・保存容量チェックを行う。 |
| 17 | Farmland (`farmland`) | 4,096.76 | — | — | — | 既定のmeshless Generate cityは農地生成を呼ばない。未実行を0msの同等処理とは扱わない。 |
| 18 | Hide roads and lanes (`conceal`) | 4,684.12 | — | — | — | meshless編集画面にはMFの道路非表示段階に相当する自動処理なし。 |

MF側18/18ステージは非nullの文書を返した。海岸なし・内壁なしなどの段階にも、入力検証やそこまでの再生成時間は発生する。

## 一括生成と描画の比較

| 計測範囲 | mesh first ms | meshless ms | ML / MF |
| --- | ---: | ---: | ---: |
| CE起動用の初期グリッド作成（生成合計から除外） | 21.86 | 共通のCE起動処理。native入力は次行の生成に計上 | — |
| 入力準備から生成完了まで | 4,277.16 | 15,922.73 | 3.72倍 |
| 完成文書から2D SVG構築まで | 713.26 | 11,547.58 | 16.19倍 |
| 生成＋SVG構築 | 4,990.42 | 27,470.31 | 5.50倍 |

| 生成結果 | mesh first | meshless |
| --- | ---: | ---: |
| 収容人口 / 目標人口 | 5000 / 5000 | 5000 / 5000 |
| 未配置人口 | 0 | 0 |
| 住宅表示数 | 1536（MF populationReport） | 888（native配置） |
| SVG子要素数 | 10485 | 4925 |

住宅数は各方式の報告値で、建物寸法・容量配分・都市の幾何形状は同一ではない。設定をそろえた製品動作の比較であり、同一出力を作るアルゴリズム同士の比較ではない。mesh firstの農地・景観等と同じ全機能をmeshlessが実行したという意味でもない。

## meshless 一括生成の実行順・処理別内訳

この表は同じ一度の生成を連続区間に区切った値。上から順に実行し、区間同士の重複はない。12ではCE共通処理が街路だけでなく住宅の平面も計画するため、住宅配置16より先に住宅関連の仕事が発生する。

| ML順 | 処理 | ms | 生成時間に占める割合 |
| ---: | --- | ---: | ---: |
| 1 | 既定設定からnative入力・人口・領域を作成 (`input`) | 6.40 | 0.04% |
| 2 | 入力検証・複製 (`skeleton.source-validation-and-clone`) | 1.16 | 0.01% |
| 3 | 外壁・門・橋 (`skeleton.walls-gates-bridges`) | 377.75 | 2.37% |
| 4 | 自由領域算出・道路経路探索 (`skeleton.road-routing`) | 2,075.98 | 13.04% |
| 5 | 道路接続・グラフ・骨格検証 (`skeleton.connections-and-validation`) | 44.15 | 0.28% |
| 6 | 敷地・街区分割 (`skeleton.land-blocks`) | 44.03 | 0.28% |
| 7 | 骨格台帳・検証・段階スナップショット (`skeleton.ledger-validation-and-snapshots`) | 40.99 | 0.26% |
| 8 | 骨格文書検証・複製 (`urban.source-validation-and-clone`) | 49.50 | 0.31% |
| 9 | 人口プログラム・領域設定 (`urban.programme-and-domain`) | 0.28 | 0.00% |
| 10 | 基礎街区の再算出 (`urban.base-blocks`) | 36.51 | 0.23% |
| 11 | 小路候補の列挙 (`urban.lane-candidates`) | 18.11 | 0.11% |
| 12 | CE街区・小路・住宅平面計画とnative道路接続 (`urban.ce-perimeter-plan-and-native-connections`) | 596.91 | 3.75% |
| 13 | 道路グラフ再構築 (`urban.road-graph`) | 225.16 | 1.41% |
| 14 | 地区分類・段階表示台帳 (`urban.districts-and-checkpoints`) | 5.32 | 0.03% |
| 15 | Facilities分岐（探索なし） (`urban.facilities`) | 0.02 | 0.00% |
| 16 | 住宅配置・入口・収容人数 (`urban.housing-placement`) | 211.04 | 1.33% |
| 17 | 人口配分・収容不足の集計 (`urban.population-allocation`) | 14.82 | 0.09% |
| 18 | 残余地・中庭 (`urban.residual-land`) | 18.24 | 0.11% |
| 19 | 生成結果台帳・所有権指紋 (`urban.ledger-and-fingerprint`) | 21.36 | 0.13% |
| 20 | 完成文書の全量検証 (`urban.final-validation`) | 12,124.04 | 76.14% |
| 21 | 保存容量チェック (`urban.save-budget-check`) | 9.68 | 0.06% |
| — | 上記区間合計 | 15,921.46 | 99.99% |
| — | 関数呼び出し・計測コールバック等の差 | 1.27 | — |
| — | 一括生成合計 | 15,922.73 | 100% |

## mesh first 一括生成の内訳

既存ProcessingProfilerのルート直下の計測区間。子孫を別途足していないため、次の表も重複しない。同じパスの複数回実行は合算し、回数を併記する（住宅面積調整等の再実行を含む）。実行順は上のUI番号とは異なる。正確な先頭実行順と子孫の詳細はJSONの`mesh.startOrder`と`mesh.breakdown`に保存。

| 一括生成の計測区間 | 呼び出し数 | ms |
| --- | ---: | ---: |
| `generation/population-prepare` | 2 | 28.61 |
| `generation/attempt-1` | 2 | 878.01 |
| `generation/castle-ground` | 2 | 0.07 |
| `generation/recipe-input-clone` | 2 | 0.77 |
| `generation/recipe-settings-clone` | 2 | 0.03 |
| `generation/population-facilities` | 2 | 0.04 |
| `generation/population-housing` | 2 | 778.56 |
| `generation/farmland` | 1 | 2,253.85 |
| ルート自身の未細分化処理 | 1 | 337.19 |
| 計測区間合計 | — | 4,277.13 |

`attempt-1`は外壁・門・河川・幹線・地区・仕上げを含む。`population-housing`が住宅収容の補正、`farmland`が農地・周辺環境を含む後処理。一括生成はMF表示ステージを1→18と順に呼ぶ実装ではないため、チェックポイントの時間差をこの区間の時間に置き換えていない。

## 計測から分かったこと

1. meshless生成の最終全量検証が 12,124.04ms で突出している。住宅配置そのものは 211.04ms、CE共通の街区・路地・住宅平面計画＋native接続は 596.91ms。
2. `renderVectorDocument` → `vectorRenderData`でも`assertVectorDocument`を呼ぶ。SVG構築 11,547.58ms は純粋な図形描画時間ではなく、再検証を含む。最終検証とSVG構築の合計は 23,671.62ms（生成＋SVG合計の86.2%）。SVG内の検証だけの時間は今回分離していない。
3. 骨格内の領域処理・道路探索も 2,075.98ms を要する。Facilitiesは探索なしで、0.02ms はスキップ分岐の処理だけ。Facilities探索を外した後も大きな待ち時間が残る理由は、上記の検証とSVG経路にある。
4. 次に進める作業は、編集・保存時の検証の正しさを保ちながら、生成直後と描画で同じ文書を繰り返し全量検証する箇所を分離・計測すること。今回その高速化は実施していない。

## 保存データと再実行

- [計測値・入力条件・生成結果ハッシュ・全チェックポイント・詳細プロファイル](ce-mesh-vs-meshless-stages-20261107.json)
- 実行元: `src/city-editor/services/analysis/meshlessStagePerformance.cli.test.ts`（明示実行時だけ計測）
- ベースコミット: `4f00f5e92c25b2640cbedcadbcd51ba8702da768`。計測用フックを追加したソースのSHA-256はJSONの`measurementSources`。地図全量JSON/SVGは保存していない。

```sh
CE_STAGE_PERFORMANCE_OUT="$PWD/docs/analytics/ce-mesh-vs-meshless-stages-20261107.json" \
  npx vitest run src/city-editor/services/analysis/meshlessStagePerformance.cli.test.ts --maxWorkers=1
```

計測用フックは未指定時に計測しない。幾何形状・人口・所有権台帳が計測有無で変わらないことは`generationTiming.test.ts`で確認。
