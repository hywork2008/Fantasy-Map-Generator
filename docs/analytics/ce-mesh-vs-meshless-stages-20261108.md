# CE mesh first / meshless ステージ時間再計測（2026-11-08）

中央施設・面積・表示範囲の調整後、同じ既定人口5,000人・シード `b5o620` で再計測した。生成は **mesh first 4.230秒、meshless 12.769秒（3.02倍）**。SVG構築までの合計は **4.913秒 対 24.119秒（4.91倍）**。

## 今回の比較条件

| 項目 | mesh first | meshless |
| --- | ---: | ---: |
| 外壁内面積 | 120,351.30 ㎡ | 121,903.23 ㎡（+1.29%） |
| 表示範囲の一辺 | 1,200 m | 1,200 m |
| プラザ・教会 | CE既定の配置 | 中央に事前予約・配置 |
| 墓地 | 1か所 | 1か所 |
| 中央施設予約面積 | 土地形状・配置は方式ごとに異なる | 7,324 ㎡ |
| 目標人口 / 収容人口 | 5,000 / 5,000人 | 5,000 / 5,000人 |
| 未配置人口 | 0人 | 0人 |
| 住宅表示数（方式固有の報告値） | 1,536 | 890 |
| SVG子要素数 | 10,485 | 5,063 |

河川1本・海岸なし・外壁1重・Organic・Medieval建物・Age of Exploration・Voronoi/Small。FMG連携なし。meshlessのFacilities探索は0件だが、中央のプラザ・教会・墓地は存在する。外壁内面積は外壁中心線が囲む面積で比較した。住宅数・階数分布・道路形状・農地等の全機能まで同一出力にそろえた比較ではない。

計測開始: 2026-11-08T06:50:37+09:00。Apple M4、darwin 27.0.0、Node v22.23.1、Vitest/jsdom、1 worker、逐次実行。固定入力を単発で測定し、シード探索・多数回の平均化・中央値計算は行っていない。

## 時間と実行順の読み方

- MFの18行は、UIの`generateStageOnDocument(processStep, wallCheckpoint)`と同じ経路で、元の入力からその段階まで再生成した時間。入力を複製しプレビューキャッシュをクリアした。直前の行からの差分ではなく、各行を合計してはいけない。
- ML到達累積は、一度の一括生成内でその対応処理が終わるまでの区間時間の和。ML実行順は後段の内訳表の番号。順序が異なるため、この対応表では上から単調増加しない。
- ML対応区間の列は、その段階に関連する個別処理の時間。複数の表示段階に共通する区間は同じ番号を再掲しているため、この列も合計してはいけない。
- 「—」は独立した対応処理を実行しないという意味。0msで同じ機能を終えたという意味ではない。
- 一括生成とチェックポイント再生成は別経路。特にMFのBuildingsだけの時間には、一括生成の人口補正・農地処理の全負担は入らない。方式間の総時間比は一括生成同士を使う。
- SVG構築は生成物をDOMとして作るまで。ブラウザのlayout/paint、Worker起動・転送、Undo履歴、編集パネル更新、ファイル保存は含まない。実ブラウザでのボタン押下から表示完了までの時間ではない。

## City generation stages 対応表

単位: ms。ML個別区間は「番号: 時間」。

| MF順 | mesh firstの表示ステージ | MF再生成 ms | ML実行順 | ML到達累積 ms | ML対応区間 ms | 対応・順序の違い |
| ---: | --- | ---: | --- | ---: | --- | --- |
| 1 | Coastline and sea (`coast`) | 12.14 | 1 | 16.01 | 1: 16.01 | 海岸なし。入力準備の共通区間であり、海岸生成単独の値ではない。 |
| 2 | Rivers (`river`) | 12.93 | 1 | 16.01 | 1: 16.01 | 入力河川の中心線を作成。セル分類とは処理が異なる。 |
| 3 | Urban core (`urban`) | 11.51 | 1 → 9 | 2,104.35 | 1: 16.01 / 9: 0.09 | 人口・領域の設定。native側は骨格作成後に領域を確認する。 |
| 4 | Town walls (`walls`) | 12.43 | 3 | 393.93 | 3: 363.61 | 外壁・門・橋を一括処理。以下の3行と共有。 |
| 5 | River crossings and cell splitting (`riverPassages`) | 65.15 | 3 | 393.93 | 3: 363.61 | 外壁・門・橋と共有。セル分割は行わない。 |
| 6 | Gate passages and cell splitting (`passages`) | 69.03 | 3 | 393.93 | 3: 363.61 | 外壁・門・橋と共有。 |
| 7 | Gates and castles (`gates`) | 73.63 | 3 | 393.93 | 3: 363.61 | 門は外壁・橋と共有。教会は入力1で予約・作成済み。 |
| 8 | Streets (`streets`) | 88.86 | 4 → 5 | 1,969.93 | 4: 1,521.71 / 5: 54.29 | 経路探索→接続・参道・検証。 |
| 9 | District assignment (`wards`) | 88.95 | 14 | 2,628.72 | 14: 4.51 | 街区・路地・住宅平面12、道路グラフ13より後。 |
| 10 | Gate-to-centre roads (`centerRoads`) | 87.80 | 4 → 5 | 1,969.93 | 4: 1,521.71 / 5: 54.29 | 外部道路・中心接続道路と共通の探索。 |
| 11 | Inner town wall (`innerWall`) | 75.97 | — | — | — | 既定は外壁1重。独立した内壁生成なし。 |
| 12 | Old-town gates and roads (`innerGates`) | 83.14 | — | — | — | 既定は外壁1重。独立した内門生成なし。 |
| 13 | Town streets (`townStreets`) | 89.32 | 12 → 13 | 2,624.21 | 12: 308.41 / 13: 170.40 | CE共通の街区・小路・住宅平面計画→道路グラフ。 |
| 14 | Geometry smoothing (`geometry`) | 161.46 | — | — | — | メッシュ頂点平滑化はなし。骨格検証5・完成文書検証20は別表。 |
| 15 | Blocks and lanes (`blocks`) | 161.81 | 6 → 10 → 12 | 2,453.82 | 6: 36.71 / 10: 27.62 / 12: 308.41 | 骨格の敷地分割→基礎街区→CE街区・小路・住宅平面。12は再掲。 |
| 16 | Housing and completed city (`buildings`) | 166.15 | 12 → 16 → 17 → 19 → 20 → 21 | 12,768.34 | 12: 308.41 / 16: 199.85 / 17: 14.56 / 19: 20.02 / 20: 9,884.70 / 21: 7.55 | 住宅平面は先に計画。配置・人口配分後に台帳・全量検証・保存容量確認。 |
| 17 | Farmland (`farmland`) | 3,946.17 | — | — | — | 既定のnative Generate cityは農地生成を実行しない。 |
| 18 | Hide roads and lanes (`conceal`) | 3,880.41 | — | — | — | native編集画面にはMFの道路非表示段階の自動処理なし。 |

18/18段階で文書生成に成功。ML累積値と実測関数合計には計測コールバック等の未区分差 0.83ms がある。

## 一括生成・SVG構築

| 計測範囲 | mesh first ms | meshless ms | ML / MF |
| --- | ---: | ---: | ---: |
| 入力準備から生成完了 | 4,229.59 | 12,769.18 | 3.02倍 |
| 2D SVG構築 | 683.34 | 11,349.89 | 16.61倍 |
| 生成＋SVG | 4,912.93 | 24,119.07 | 4.91倍 |

CE起動時の初期グリッド作成 21.69ms は合計から除外。native入力の準備はmeshlessの生成時間に含めた。

## meshless 一括生成の実処理順

以下は重複しない連続区間。入力1には中央施設の敷地・教会モデル・墓地の保存形状作成が含まれる。12では街路と一緒に住宅平面も計画されるため、住宅の仕事の一部が配置16より先に行われる。

| ML順 | 処理 | ms | 生成時間の割合 |
| ---: | --- | ---: | ---: |
| 1 | 既定入力・中央施設の敷地・教会モデル・墓地形状 (`input`) | 16.01 | 0.13% |
| 2 | 入力検証・複製 (`skeleton.source-validation-and-clone`) | 14.31 | 0.11% |
| 3 | 外壁・門・橋 (`skeleton.walls-gates-bridges`) | 363.61 | 2.85% |
| 4 | 自由領域算出・道路経路探索 (`skeleton.road-routing`) | 1,521.71 | 11.92% |
| 5 | 道路・参道接続、骨格検証 (`skeleton.connections-and-validation`) | 54.29 | 0.43% |
| 6 | 敷地・街区分割 (`skeleton.land-blocks`) | 36.71 | 0.29% |
| 7 | 骨格台帳・検証・段階スナップショット (`skeleton.ledger-validation-and-snapshots`) | 50.17 | 0.39% |
| 8 | 骨格文書検証・複製 (`urban.source-validation-and-clone`) | 47.44 | 0.37% |
| 9 | 人口プログラム・領域設定 (`urban.programme-and-domain`) | 0.09 | 0.00% |
| 10 | 基礎街区の再算出 (`urban.base-blocks`) | 27.62 | 0.22% |
| 11 | 小路候補の列挙 (`urban.lane-candidates`) | 13.43 | 0.11% |
| 12 | CE街区・小路・住宅平面計画とnative道路接続 (`urban.ce-perimeter-plan-and-native-connections`) | 308.41 | 2.42% |
| 13 | 道路グラフ再構築 (`urban.road-graph`) | 170.40 | 1.33% |
| 14 | 地区分類・段階表示台帳 (`urban.districts-and-checkpoints`) | 4.51 | 0.04% |
| 15 | Facilities分岐（探索なし） (`urban.facilities`) | 0.02 | 0.00% |
| 16 | 住宅配置・入口・収容人数 (`urban.housing-placement`) | 199.85 | 1.57% |
| 17 | 人口配分・収容不足の集計 (`urban.population-allocation`) | 14.56 | 0.11% |
| 18 | 残余地・中庭 (`urban.residual-land`) | 12.91 | 0.10% |
| 19 | 生成結果台帳・所有権指紋 (`urban.ledger-and-fingerprint`) | 20.02 | 0.16% |
| 20 | 完成文書の全量検証 (`urban.final-validation`) | 9,884.70 | 77.41% |
| 21 | 保存容量チェック (`urban.save-budget-check`) | 7.55 | 0.06% |
| — | 区間合計 | 12,768.34 | — |
| — | 呼び出し等の未区分差 | 0.83 | — |
| — | 一括生成実測 | 12,769.18 | 100% |

## mesh first 一括生成の内訳

既存ProcessingProfilerのルート直下を、最初に入った順で掲載。複数回実行された区間は合算し、呼び出し数を併記。住宅面積調整等による再実行を含む。子孫の時間を重ねて足していない。

| 区間 | 呼び出し数 | ms |
| --- | ---: | ---: |
| `generation/population-prepare` | 2 | 28.79 |
| `generation/attempt-1` | 2 | 869.90 |
| `generation/castle-ground` | 2 | 0.07 |
| `generation/recipe-input-clone` | 2 | 0.81 |
| `generation/recipe-settings-clone` | 2 | 0.03 |
| `generation/population-facilities` | 2 | 0.04 |
| `generation/population-housing` | 2 | 777.54 |
| `generation/farmland` | 1 | 2,217.39 |
| ルート自身の未細分化処理 | 1 | 334.98 |
| 区間合計 | — | 4,229.56 |

## ボトルネックと前回の扱い

- meshlessの最終全量検証20は **9.885秒**、生成時間の **77.4%**。中央施設等を追加して条件を寄せた後も最大区間だった。
- SVG構築は **11.350秒**。`renderVectorDocument` → `vectorRenderData`が`assertVectorDocument`を呼ぶため、これにも全量検証を含む。検証単独の時間をSVG内で分離した計測ではない。最終検証＋SVGは生成・描画合計の **88.0%**。
- 道路探索4は 1,521.71ms、CE街区・小路・住宅平面計画と接続12は 308.41ms、住宅配置16は 199.85ms。Facilitiesは探索なしで、15の 0.02ms はスキップ分岐の処理。
- 前回と今回では、敷地面積・中央施設・表示範囲・生成される街路や建物の数が異なる。前回より短くなった値を、性能最適化の効果とは評価しない。今回行ったのは条件を寄せた後の再計測であり、高速化の実装は行っていない。
- 次に進める作業は、この条件を固定し、完成直後と描画で繰り返す全量検証を個別に計測して重複を減らすこと。編集・保存時の検証の正しさは維持する。

## 保存データ・再実行

- [今回の全計測値・条件・プロファイル・ソースSHA-256](ce-mesh-vs-meshless-stages-20261108.json)
- [今回の面積・中央施設の調整記録](ce-meshless-civic-area-20261108.md)
- [前回の条件での比較表（保持）](ce-mesh-vs-meshless-stages-20261107.md)
- ベースコミット: `283cd50586c164d8ef3017ba3290e8aa54736ecc`。作業ツリーの実際の計測ソースのSHA-256はJSONの`measurementSources`。生成都市の全量JSON/SVGは保存せず、出力ハッシュと条件・数値のみ保存した。

```sh
CE_STAGE_PERFORMANCE_OUT="$PWD/docs/analytics/ce-mesh-vs-meshless-stages-20261108.json" \
  npx vitest run src/city-editor/services/analysis/meshlessStagePerformance.cli.test.ts --maxWorkers=1
```

上の明示計測テスト1件成功。18段階の成功、中央施設3種・墓地1か所、同一表示範囲、外壁内面積差5%未満、人口未配置0人、Facilities探索0件をテスト内で確認した。
