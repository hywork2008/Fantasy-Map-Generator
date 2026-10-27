# 家畜のロット台帳の計算量と件数の抑制 計画

## 状態

- 2026-10-28 計画。コードは未変更。
- 根拠: [長期実行で月ごとに遅くなる原因の計測](../analytics/tick-growth-20261028.md)。関連: [冬前の屠畜と肉保存](winter-livestock-slaughter-and-preservation.md)（所有・出所の会計）、[Rust 化の設計](rust-simulation-core.md) の R0。

## 1. 問題

World 固定入力の48か月で、1か月の時間が16秒から279秒へ、月数のほぼ2乗で伸びる。48か月目の CPU の91%が`src/extensions/economy/generators/livestockLots.ts`である。台帳は2026-10-24（1c476c0d）に入った。

24か月の件数（`auditTickGrowth.mts --count-every=3`）:

| 月 | 1 | 6 | 12 | 18 | 24 |
| --- | ---: | ---: | ---: | ---: | ---: |
| ロット（`lots`） | 627 | 3,740 | 11,170 | 28,333 | 44,501 |
| うち市場（`market`） | 627 | 3,740 | 10,900 | 26,286 | 40,053 |
| うち所有（`owned`） | 0 | 0 | 269 | 2,046 | 4,442 |
| 出荷（`shipments`） | 671 | 4,053 | 18,095 | 51,788 | 87,454 |
| 出口の集計（`exits`のキー） | 63 | 333 | 7,249 | 25,571 | 47,490 |
| 1か月の時間（秒） | 16 | 10 | 27 | 39 | 75 |

12か月目以降、ロットは月に約2,800件ずつ直線的に増え、ほとんどが市場のロットである。頭数がごく小さいロット（1e-3頭未満）はない。`shipments`と`exits`も消えずに増える。

## 2. 原因

1. **全走査**: `recordLivestockLotFlow`と`moveOwnedLivestock`は、家畜の取引1件ごとに`Object.values(ledger.lots).filter(...)`で全ロットを走査する。1回の呼び出しの中でも`matching()`・`rows()`を2〜4回作り直す。取引数×ロット数で時間が伸びる。
2. **市場のロットが減らない**: 農村の出荷（`ruralHarvest`）は出荷ごとに新しいロットを作る。市場の在庫が残る限り FIFO で消費されないロットが残り、市場×種ごとのロットが月とともに積み上がる。
3. **出所の記録が消えない**: `shipments`と`exits`は出荷ごとに追加され、削除されない。保存ファイルの大きさも伸びる。

## 3. 方針

台帳の意味（FIFO の配分、出所・所有の会計、`ownedSlaughter.ts`が読む`shipments`・`exits`）は変えない。golden ハッシュが変わる変更（2）は、変わる理由を記録して受け入れる。

### 3.1 索引（計算量を下げる。結果は変えない）

- 台帳の外（保存しない実行時の表）に、`market:<marketId>:<species>`と`owned:<ownerId>:<species>`をキーにしたロット ID の挿入順リストを持つ。`addLot`で追加し、`terminal`で頭数が0になった時に外す。
- `matching()`は索引から引く。FIFO の順は`nextId`の順（挿入順）で、今の`Object.values`の順（キーの挿入順）と同じになることをテストで確かめる。
- 1回の呼び出しの中で`matching()`の結果を使い回す。途中で`terminal`がロットを消すため、使い回しは消えたロットを飛ばす形にする。
- 読み込み時と、索引が台帳と食い違う時は、台帳から索引を作り直す。

これで1回の取引の費用は、その市場×種のロット数に比例するまで下がる。

### 3.2 件数の抑制（結果が変わり得る）

- 同じ市場・種で、出所の区別が要らなくなった古いロット（一定期間より前の出荷、または出所不明）を1つにまとめる。まとめたロットの出所は`unknown`とし、`reconciledUnknownHeads`に数える。
- `shipments`は、対応するロットが残っていない出荷を削除する。`exits`は期間ごとの集計に畳む。`ownedSlaughter.ts`が参照する出荷は残す。
- まとめる期間は、出所を使う処理（所有者の屠畜・出所の検証）の要件から決める。

## 4. 段階

| 段階 | 内容 | 受入条件 |
| --- | --- | --- |
| L1 | §3.1 の索引 | 既存の`livestockLots`・`ownedSlaughter`・`characterLivestockTransfers`・`transportAssetOrders`・`livestockDispatch`のテストが通る。12か月の golden ハッシュが変更前と一致する（`world.notes`を除く。§5） |
| L2 | 48か月の再計測 | `auditTickGrowth.mts`で、48か月目の`production:rural`の self が変更前（220秒）より桁で下がる |
| L3 | §3.2 の件数の抑制 | ロット・`shipments`・`exits`の件数が年を追って横ばいになる。所有・出所のテストが通る。golden の差の理由を記録 |

L1 で十分に速くなれば、L3 は保存ファイルの大きさが問題になるまで後回しにしてよい。

## 5. 確認の方法

- golden ハッシュは`world.notes`が実行ごとに変わるため、セクション別の比較（`auditTickGrowth.mts --hash-sections=<file>`）で`world.notes`以外が一致することを見る。observer あり・なしの3か月の比較でも、差は`world.notes`だけだった（[記録](../analytics/tick-growth-20261028.md)）。
- 速度は計測用 Mac で`auditTickGrowth.mts`の48か月を使う。

## 6. 次の作業

**L1（索引）を実装し、関連テストと12か月の golden のセクション比較で結果が変わらないことを確かめる。**
