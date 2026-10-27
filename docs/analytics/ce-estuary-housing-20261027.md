# 河口都市の住宅面積予約の改善（2026-10-27）

[前回の河口形状修正](ce-estuary-approaches-20261027.md)で残ったNobraの住宅面積補正を、初期予約の改善で省いた。比較元は `84408be536d0a5b4b47df24d3839710ac5af6f3c`。

## 結果

Nobraの都市生成時間は、各2回の平均で **6.468秒 → 3.793秒（41.4%短縮）**。住宅用fabricの初期構築は **2回 → 1回**、住宅面積不足による都市全体の追加生成は **1回 → 0回**。門接続不成立による破棄と外部道路の未接続は引き続き0件。

| 都市 | 変更前 秒 | 変更後 秒 | 初期fabric構築回数 | 住宅容量 |
| --- | ---: | ---: | ---: | ---: |
| Nobra | 6.468 | 3.793 | 2 → 1 | 2895 → 2895 |
| Jilesca | 2.766 | 2.592 | 1 → 1 | 2862 → 2862 |
| Seseneva | 3.364 | 3.425 | 1 → 1 | 5077 → 5077 |
| Obern | 2.618 | 2.601 | 1 → 1 | 1405 → 1405 |

Nobraは市街地メッシュ・道路などのfeature・城壁のfingerprint、都市面積、建物数、住宅容量と建物の建築面積合計が直前版と一致した。住宅面積倍率と保存recipeが変わるため、documentとfabricのfingerprintは変化する。Jilescaは全fingerprintと住宅容量が直前版と一致した。

## 計算方法

低層住宅向けの面積に、旧市街城壁の想定半径とその周囲の一街区幅から求めた環状帯の面積を加える。岸に沿う道路を陸側へ引き、城の敷地も置くため、住宅と競合する余地を先に確保する。

追加するのは、二重城壁・城・開放水際を持ち、川岸と海岸の両方が住宅必要面積から見積もった半径の内側にあるFMG河口都市に限る。住宅地と水際が離れている場合や城がない場合は従来の推定値を使う。実際の住宅容量による補正、画面範囲による上限、明示倍率・ロック・手動人口枠の制約は従来どおり適用する。

指定20都市の固定入力では、この条件に該当するのはNobraのみ。Jilescaも地理条件は該当するが城がないため、不要な拡張を行わない。城の条件を加える前の試行ではJilescaの住宅容量が2,862→3,455と増加しており、この条件で元の規模を維持した。

## 検証と限界

水辺を中心とする11都市を固定入力・固定シードで各2回観測した。22回とも生成成功し、橋の角度上限超過と交差検証エラーは0件、外部道路の未接続は0件、同一都市の2回のfingerprintは一致した。NobraとJilescaについては最終条件で各2回再計測し、上表にはその値を使った。

11都市のうち、城の有無の条件を追加する前の計測で結果に影響するのはJilescaだけだった。追加前後でNobraのfingerprintが一致し、残り9都市は条件に入らない。再計測したJilescaは直前版の出力に戻った。Falldalderは住宅容量1,903戸に対して必要1,993戸という既存の不足が残るが、今回の条件には該当しない。

Vitestは `generation/heightArea.test.ts` と `nidyiaWaterfront.test.ts` の **6件成功**。前者で海岸・川岸の距離、城、海岸城壁設定、明示倍率とロックを確認し、後者でNobraの初期fabricが1回であること、水際と橋の制約、住宅容量、生成recipeの再現を確認した。`npx tsc --noEmit --pretty false`、変更ファイルのBiome、`git diff --check` は成功。全件テストと多数のシードによる検証は行っていない。

次は、異なる地形・人口の河口都市でも、この環状帯の見積もりが過大にならないかを観測する。Falldalderなど枠上限による住宅不足は別途検討する。

## 計測データ

Node v22.23.1、各都市2回、cold worker、`--jobs 1`。`generationMs` のみを比較し、FMGの読込・描画・worker起動は含めない。[都市別比較CSV](ce-estuary-housing-20261027.comparison.csv)、[全量出力のSHA-256一覧](ce-estuary-housing-20261027.sha256.csv)。固定入力は[前回の20都市入力](ce-waterfront-generation-20261027.inputs.csv)。

全量JSONLはGit管理外の `docs/analytics/raw/ce-estuary-housing-20261027/` に保存。`after-verified.jsonl` は城の条件追加前の11都市、`final-targets.jsonl` は最終条件のNobra・Jilesca。比較CSVでは最終条件の2都市と、条件追加の影響を受けない残り9都市を使用する。条件追加前のJilesca結果は過大予約の観測としてJSONLに残している。

```sh
node --import tsx scripts/benchmarkFmgCities.mjs \
  docs/analytics/ce-waterfront-generation-20261027.inputs.csv \
  docs/analytics/raw/ce-estuary-housing-20261027/recheck.jsonl \
  --burg 13,93,396,7,11,92,14,17,301,1,71 --repeat 2 --jobs 1
```
