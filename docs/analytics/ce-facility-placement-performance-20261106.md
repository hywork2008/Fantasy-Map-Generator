# CE施設付き生成の性能改善

2026-11-06、`feature/ce-guild-hall-2`。修正前は`1b958b03e`。

## 固定入力での比較

`src/city-editor/generators/facilityHousing.test.ts`の通常条件を使用。人口5,000人、`highMedieval`、hex、入力シード`population-small`、生成シード`population-5000`。施設付き生成、広場・川・海・城壁・城・寺院なし、階数分布設定なし。

Node/Vitest上でCPUプロファイラと既存の`ProcessingProfiler`を有効にし、各版1回測定した。測定範囲は`generateCityOnDocument`の計算であり、モジュール読込・ブラウザの描画・保存のI/Oは含めない。実行環境・同時負荷による時間の変動はある。

| 処理 | 修正前 | 修正後 |
| --- | ---: | ---: |
| 都市生成全体 | 28,819.83 ms | 5,764.46 ms |
| 施設配置段階 | 26,292.16 ms | 3,519.04 ms |

全体で約5.00倍、施設配置段階で約7.47倍。配置結果は269施設、必要住居1,112戸を充足。

施設の位置・回転・敷地・入口接続、施設集計、人口集計、メッシュ、道路などのfeatureGroupsをJSON化して比較した。修正前後とも386,729 bytes、SHA-256は以下で一致した。

`8e809663c197bcc91cd5079fc2e1236f6d70d804ee81c9bc7f11dc3042f12e72`

## 原因と変更

CPUプロファイルでは、施設の接続候補について繰り返す敷地交差・線分交差判定が主な負荷だった。

- 入口の接続先を距離順に並べ、有効な最初の候補まで検証する。従来は全候補を検証し終えてから最短の有効候補を選んでいた。距離が同じ場合の既存の順序を維持する。
- 遠い敷地は外接矩形で除外し、近いものに既存の精密交差判定を実行する。線分判定の端点許容値を見込んだ余裕を持たせる。
- 水面・固定地などの阻害条件がない面には、敷地交差判定を実行しない。
- 敷地から遠い小路・道路について、通路帯のポリゴン生成を省く。
- 保護対象は既存の空間索引で近傍に絞る。候補位置から道路までの距離は、ソート比較ごとの再計算をやめ、各位置で1回だけ計算する。

配置数を減らす、探索上限を下げる、接続や衝突の条件を緩める、といった変更はしていない。

## 検証と範囲

- `facilityHousing.test.ts`、`landmarks.test.ts`、`landmarkIntegration.test.ts`、`allocateBVFacilities.test.ts`: 4ファイル17件成功。住宅不足によるコア拡張、保存・再読込、川辺・道路・固定地・中庭の穴を含む。
- Biome、アーキテクチャなどpre-commit相当の検査を実施。
- TypeScriptは変更外の既存2エラー（`charts-overview.ts:560`、`approachPrior.ts:259`）が残る。
- 川あり・大人口都市や、実ブラウザの描画を含めた待ち時間は今回の比較対象外。

## 全量出力

測定用の一時テストは削除し、固定入力と受入条件は既存の`facilityHousing.test.ts`を維持した。CPUプロファイル・段階別時間・比較出力はGit管理外の`docs/analytics/raw/`に保存した。

| ファイル | SHA-256 |
| --- | --- |
| `ce-facility-perf-baseline-20261106.cpuprofile` | `0429b12a4e87a8bbf55afd8b3c719d9dc2f9649245482ee4c6c6345bed1a2d95` |
| `ce-facility-perf-baseline-20261106-timings.json` | `490fa66ab3f64ccdf5cf2616bf2e1e90bea1277ff7bb435740d95ca9e747f6fe` |
| `ce-facility-perf-baseline-20261106-output.json` | `8e809663c197bcc91cd5079fc2e1236f6d70d804ee81c9bc7f11dc3042f12e72` |
| `ce-facility-perf-final-20261106.cpuprofile` | `3ff3af207ce7478e952c132351a311b2043ac842ed270d46fd8b2688b8e7d8a4` |
| `ce-facility-perf-final-20261106-timings.json` | `569c2c4f1ebeb6a5baf2548fe19da800acc340686d9213372ebed22610ac6ece` |
| `ce-facility-perf-final-20261106-output.json` | `8e809663c197bcc91cd5079fc2e1236f6d70d804ee81c9bc7f11dc3042f12e72` |
