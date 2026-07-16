# 都市人口ポイントと Manpower の単位系修正

**Date**: 2026-07-15  
**Status**: implemented

## 発見

`pack.burgs[].population` は Burg Editor や Burgs Overview に出る実人口ではない。これは集落規模を表す内部の**人口ポイント**であり、実人口は次で求める。

```ts
urbanPeople = burg.population * populationRate * urbanization;
```

農村セルは `populationRate` のみを掛ける。

```ts
ruralPeople = cells.pop[cell] * populationRate;
```

したがって、都市と農村が混在する州では `troops / populationRate` を共通の人口ポイントに変換することはできない。都市出身者を 1 ポイント減らしたときの人数は `populationRate * urbanization` 人であり、農村の 1 ポイントとは異なるためである。

この発見は、Economy の都市地場資源ボーナスを再調整する根拠にはならない。係数は内部ポイント用であり、先行修正どおり小規模 burg に対する下限だけを撤去するのが正しい。詳細は [urban-resource-bonus-rebalance.md](urban-resource-bonus-rebalance.md) を参照。

## 修正内容

### Manpower

- `src/generators/manpower.ts` は、徴兵・補充・復員・負傷帰還・再生成前の復員をすべて**実人数**で移すよう変更した。
- 人口ポイントへの書き戻しは地点別に行う。農村は `people / populationRate`、都市は `people / (populationRate * urbanization)` を使う。
- 動員目標と成人男性の物理上限は、`state.rural` / `state.urban * 1000` ではなく、現在のセル・burg・在営兵から実人数で再集計する。
- 初期軍が民間成人男性プールを超える場合、再調整時に軍を実際に引き出せた人数まで縮小する。
- 農業ストレスの動員率と Population Overview の年齢バケツも、都市倍率を含む実人数へ統一した。

`docs/plan/military/manpower-ecosystem.md` もこの定義へ更新済みである。Manpower Ledger の `underArms` は人口ポイントではなく実人数である。

### Nobility の都市防衛・略奪

以下は部隊人数と `burg.population` を直接比較していたため、実人口へ変換した。

- 占領に必要な残存兵力
- 都市民兵の見積り
- 通過軍による略奪の被害率

これにより、例えば人口ポイント `20`・`populationRate=1000` の都市の占領に必要な兵力は `1` 人相当ではなく、`20,000 × 5% = 1,000` 人となる。略奪では内部ポイントに `Math.round()` を掛けて小集落を 0 ポイントに丸める処理も除去した。

### Economy の Wealth 表示

旧 Wealth は `product / burg.population` であり、分母が生スコアだった。Burgs Overview と生産詳細は、実人口を分母にした読みやすい値として次を表示する。

```ts
productPerThousandResidents = product / urbanPeople * 1000;
```

表示名は **Product / 1k**。生産量そのものや、生産ボーナスの内部ポイント計算は変更しない。

## 回帰テスト

- `src/generators/manpower.test.ts`: `urbanization = 2` で都市を含む成人男性プールから、軍人数と同じ人数だけを引くことを確認する。
- `src/generators/populationOverviewStats.test.ts`: 都市年齢バケツにも `urbanization` を適用することを確認する。
- `src/extensions/nobility/generators/localDefense.test.ts`: 占領閾値が実人口に依存することを確認する。
- `src/extensions/nobility/generators/marchCapture.test.ts`: 小規模 burg の略奪後に人口ポイントが不自然に 0 へ丸められないことを確認する。

## 不変条件

1. Civilian pools と `regiment.a` の移動は常に実人数で保存される。
2. 農村・都市への配分後に換算した実人数の合計は、移動前後で一致する（丸め誤差を除く）。
3. `urbanization` を変更しても、同じ実人数の徴兵・復員・占領判定が倍率違いで増減しない。
4. Economy の生産フォーミュラは内部人口ポイントを入力として維持し、表示専用の per-capita 指標だけが実人口を使う。
