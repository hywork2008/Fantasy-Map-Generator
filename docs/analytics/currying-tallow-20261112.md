# 革の仕上げの獣脂（2026-11-12）

[currying-tallow.md](../plan/currying-tallow.md)の実装（`curryingTallowKgPerHide`=2）を、[household-goods-values-20261112.md](household-goods-values-20261112.md)のnew（prev）と比べた。

## 1. 条件

- 地図は北緯30°の2枚（2102・2103）、36か月、戦争なし・隊商の略奪なし。3年目を集計した。
- コード: コミット7826dddf5に、[candle-demand.md](../plan/candle-demand.md)・[household-goods-values.md](../plan/household-goods-values.md)・設計書の実装を加えたもの。凍結したworktreeで動かした。
- 測りは[goods.mts](currying-tallow-20261112/goods.mts)、実行は[run.sh](currying-tallow-20261112/run.sh)、集計は[sum.py](currying-tallow-20261112/sum.py)。

## 2. 結果（3年目）

| | 2102 prev | new | 2103 prev | new |
| --- | ---: | ---: | ---: | ---: |
| 仕上げに使った獣脂（長靴＋革の品、樽） | 0 | 4.6万 | 0 | 2.4万 |
| 獣脂の使い道の割合 | 43% | 52% | 44% | 52% |
| 獣脂の在庫 24 → 36か月目 | 48万 → 76万 | 40万 → 64万 | 24万 → 39万 | 20万 → 32万 |
| 作った長靴 | 97.3万 | 96.5万 | 48.6万 | 48.7万 |
| 作った革の品 | 80.1万 | 79.9万 | 47.3万 | 47.0万 |

- 馬具は年に数百ロットで、獣脂はわずかだった。
- 長靴と革の品の作った量は変わらない（獣脂は下限の値段で、代金は小さい）。
- お金はどの持ち手もほぼ同じ（差は1%以内）。

## 3. 読み取り

1. 見込みどおり、獣脂を年約4.6万樽（2102）使い、在庫の増えは年約28万から約24万樽になった。
2. 獣脂はまだ出た量の約半分が積み上がり、値段は下限のままである。残りは地図の外へ売る出口（[byproduct-history.md](../plan/byproduct-history.md) §5の3）か、捨て方（[byproduct-prices.md](../plan/byproduct-prices.md) §6の1）で扱う。

## 4. 出力のSHA-256

docs/analytics/raw/currying-tallow-20261112/

| ファイル | SHA-256 |
| --- | --- |
| new-2102.json | 5e8b5152eb3f4e292a42ec574cf7be911b7a15d7613fe9ea3edab31648b0071c |
| new-2103.json | afcf1a16019d1d83b0dd07e3ae2566ece66b44ea2ddf6bb62ff5a65eb7bed936 |
