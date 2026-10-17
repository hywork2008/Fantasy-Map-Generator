# 通貨量の較正 (Money Scale Calibration) 設計

2026-10-17 設計。[initial-wealth-calibration.md](initial-wealth-calibration.md) §8.5「価格水準とお金の量の不一致」の対応。案 C(価格は据え置き、お金の側を引き上げる)を採用した。

## 状態

- 実装済み(2026-10-17)。`MONEY_SCALE_BASE = 16` で計測し、目標をおおむね満たした(§8)。K=8・32 の比較は未実施。
- 価格(`Good.value`、Food Ledger の主食価格、About タブの生活費 [cost-of-living.md](../analytics/cost-of-living.md))は変えない。

## 1. 問題

### 1.1 二つの尺度が混在している

| 系統 | 尺度 | 例 |
| :--- | :--- | :--- |
| 物の量と、量 × 価格で決まる金額 | **実人数**(人口点 × `populationRate`、既定 1,000) | 食料需要 `cells.pop × populationRate × GROSS_FOOD_NEED`(`foodLedgerConsumption.ts`)、農家渡しの代金、生産ロット(`laborPointsForLots(..., populationRate)`) |
| 定額で決めたお金 | **人口点** | 開始時の配分(`economyStartMode.ts` の `*PerPopulation`)、人頭税 `pollTax × population`、俸給、公共事業費、軍の維持費 `BASE_UPKEEP_PER_HEAD` |

人口点 1 あたりで比べると、次のようになる。

- 1 年分の食費: 約 430 SP(0.43 wain × 約 1 SP × 1,000 人)
- 家計・金庫の残高: 10〜20 SP

手元のお金は年間の食費の 1/20〜1/200 しかない。史実の 15 世紀イングランドの推計(通貨量 ≒ GDP の 3 か月分。Mayhew 等、要出典確認)より 1〜2 桁少ない。農民への未払い(都市人口点あたり 200〜400)が膨らむのはこのためである。

### 1.2 `applyMoneySupplyPriceLevel` では直らない

`markets-generator.ts` の L7 価格補正には、次の二つの制約がある。

- 主食を対象にしない。
- 補正後の価格を `good.value × PRICE_FLOOR_FACTOR〜CEILING_FACTOR` の範囲に収める。

このため、桁のずれは吸収できない。本設計はこの補正を変えない。尺度を揃えた後は、本来の目的(鋳造量の過不足による数割の変動)にだけ働く。

## 2. 方針

1. **係数 `K` を 1 つ定義し、「定額で決めたお金」の側だけに掛ける。** 比率で決まる額と、量 × 価格で決まる額には掛けない。
2. `K` は `populationRate` に比例させる。人口点あたりの物の量は `populationRate` に比例するので、お金も同じ比例で動かす。

   ```text
   K = MONEY_SCALE_BASE × populationRate / 1000
   ```

3. `MONEY_SCALE_BASE` は §5 の計測で決める。目安は 10〜30。人口点 1 あたりの通貨量が年間食費の 3〜6 か月分(約 100〜200 SP)になる値とする。
4. 係数の置き場所と判定は `src/extensions/economy/generators/moneyScale.ts` の 1 か所にまとめる。

```ts
/** Nominal money per population point is scaled to the real-headcount goods side. */
export const MONEY_SCALE_BASE = 16; // calibrated in docs/plan/money-scale-calibration.md §5
export function getMoneyScale(): number; // options.moneyScaleBase ? K : 1
export function nominal(amount: number): number; // amount * getMoneyScale()
```

- 新規地図は生成時に `options.moneyScaleBase` を保存し、K はその都度 `populationRate` から計算する。
- `options.moneyScaleBase` が無い場合(旧セーブ、既存のテストの文脈)は 1 として扱い、従来の動作を変えない。先例は `getEconomyStartMode()` が旧セーブを `provisioned` に解決する扱い。
- 定数そのものは書き換えず、使う箇所で `nominal()` を通す。定数の値と意味は人口点尺度の基準値として残す。

## 3. 対象の分類

対象: `src/` で残高(`treasury`・`wealth`・`householdWealth`・`ruralHouseholdWealth`・市場の現金・交易資本)を読み書きするファイルは 158 本ある(うち `extensions/economy/generators` が 96 本)。

| 区分 | `nominal()` を掛けるか | 例 |
| :--- | :--- | :--- |
| A. 開始時の配分 | 掛ける | `EconomyStartProfile` の `burgTreasuryPerPopulation`・`stateTreasuryPerPopulation`・`householdWealthPerPopulation`・`marketMaintenancePerPopulation`、人物の一時金と `BACK_PAY_CYCLES` の元になる俸給 |
| B. 人口あたりの定額の税・費用 | 掛ける | `taxes-generator.ts` の `pollTax`、`militaryLogistics.ts` の `BASE_UPKEEP_PER_HEAD`、`currencyDemand` の人口の項(`minting.ts` の `population × 0.06`・`urban × 0.04`) |
| C. 定額の給与・俸給と、その下限・上限 | 掛ける | `characterStipends.ts` の `*_STIPEND`、`treasuryAllocation.ts` の `*_STIPEND_FLOOR/CAP`、`NAVY_CREW_WAGE_PER_YEAR`、`ESCORT_BASE_PAY_PER_DAY`・`ESCORT_MIN_FEE`、`characterLivingCosts.ts` の役職別生活費 |
| D. 定額の事業費・予算 | 掛ける | `publicWorks.ts` の `*_COST*`、`chemMedCommon.ts` の `*_BUDGET`、`frontierExpansion.ts`・`frontierGovernance.ts`・`portDevelopment.ts` の費用、`regionalWaterAuthority.ts`・`urbanWaterSupply.ts` の費用、`EXPEDITION_BASE_INVESTMENT`、`COLONY_GARRISON_UPKEEP_PER_UNIT`、`CARAVAN_DAILY_MAINTENANCE_COST`、`DROUGHT_RELIEF_BUDGET_*`、`WORKSHOP_RESEARCHER_HIRE_COST`、`LEGIT_WAR_TREASURY_DRAIN`、`PUBLIC_DEBT_PLAYER_REPAY_AMOUNT` |
| E. 残高に対する閾値 | 掛ける | `GREAT_LIBRARY_*_TREASURY_FLOOR`、`WAR_OPTIONAL_TREASURY`、`TREASURY_RESERVE`、`ESCORT_TREASURY_RESERVE`、`WEALTH_CARE_REFERENCE`、`getComfortableTreasuryLevel()` の人口下限 |
| F. 比率・割合 | 掛けない | `*_SHARE`・`*_RATE`・`*_MULTIPLIER`、`salesTax`、`WEALTH_UPKEEP_RATE`、`SURPLUS_WEALTH_SPEND_SHARE` |
| G. 量 × 価格で決まる金額 | 掛けない | 市場の売買、農家渡しの代金、海軍の偽装交易の買い付け、`marketTradeValue` |

区分 A〜E の一覧は、§6 の手順 1 で grep と計測から作る。上の表は代表例であり、網羅したものではない。迷う定数は、§5 の計測でその金額が量 × 価格の流れと同じ桁かどうかを見て決める。同じ桁なら G、1〜2 桁小さければ A〜E とする。

## 4. 旧セーブ

- 既定では換算しない。`options.moneyScaleBase` が無いので `K = 1` で従来どおり動く。
- 任意の換算は後で別途扱う。読み込み時に残高(区分 A の保有者全部、人物の富、公債・対外債務の元本、`MintLedger.circulation`)へ `K` を掛け、`options.moneyScaleBase` を書き込む。農民への未払いは G の尺度なので掛けない。

## 5. 較正の計測

- 地図と条件は [initial-wealth-calibration.md](initial-wealth-calibration.md) §2 と同じにする(`npm run fmg:small` の seed 101・102・103、15 年、`--sample-detail wealth,burgs`)。
- お金の出入りの計測(§7.1 の `observe/wealth`)を使い、年間の流れを人口点あたりで区分ごとに集計する。

| 指標 | 目標 |
| :--- | :--- |
| 人口点あたりの通貨量(全保有者の合計) | 年間食費(約 430 SP)の 3〜6 か月分 |
| 農民への未払い / 通貨量 | 1 未満で横ばい(増え続けない) |
| 都市の食料の充足率(金銭的な理由による不足) | 9 割以上 |
| 農村の家計の年変化 | −5%〜+5% |
| §8.4 の各保有者の比率(国庫 : 都市金庫 : 家計) | 大きく変えない |

- `MONEY_SCALE_BASE` = 8・16・32 の 3 点で測り、目標に入る値を選ぶ。
- 多数のシードでの検証は行わない(規約)。上記 3 地図に限る。

## 6. 実装の順序

1. `moneyScale.ts` を追加する(`getMoneyScale`・`nominal`)。新規地図の生成時に `options.moneyScaleBase` を書く。単体テストは「`moneyScale` が無いと 1」と「`populationRate` に比例する」の 2 点に限る。
2. 区分 A(開始時の配分)と B(人頭税・人口あたりの維持費・`currencyDemand`)に `nominal()` を掛ける。ここで §5 の計測を 1 回行う。未払いの増え方が止まるかを確認する。
3. 区分 C・D・E を、ファイル単位で順に置き換える。各ファイルの既存テストは `moneyScale` 無しの文脈で動くので、値は変わらない。
4. §5 の 3 点で計測し、`MONEY_SCALE_BASE` を決める。
5. 結果を本書 §7 に記録する。[initial-wealth-calibration.md](initial-wealth-calibration.md) §8.4 の配分を `K` 倍した値で見直す。[character-wealth-balance.md](../analytics/character-wealth-balance.md) の金額の記述に `K` の注記を足す。

## 7. 注意

- About タブの生活費の文言は変えない。価格を据え置くので、そのまま正しい。
- 国庫・人物の富の表示額は `K` 倍になる。`formatPrice()` の金貨・銀貨・銅貨の内訳表示はそのまま使える。
- 区分の取りこぼしがあると、その流れだけが相対的に 1/K に縮む。例: 定額の事業費を取りこぼすと、事業が実質 1/K の費用でできてしまう。手順 3 の後に、区分 A〜E の定数を `nominal()` を通さずに残高へ足し引きしている箇所が無いかを grep で確認する。
- `applyMoneySupplyPriceLevel` と `currencySufficiency.ts` は変えない。`currencyDemand` の人口の項を B として扱えば、鋳造の目標と流通量が同じ尺度になる。

## 8. 実施結果(2026-10-17)

### 8.1 実装

- `src/utils/moneyScale.ts`(`DEFAULT_MONEY_SCALE_BASE = 16`、`computeMoneyScale`、`getWorldMoneyScale`)と、economy 拡張用の `src/extensions/economy/generators/moneyScale.ts`(`getMoneyScale`・`nominal`)。
- 新規地図は生成時に `options.moneyScaleBase` を保存する(`main.ts`、既定値は `optionsStore`)。UI はない。localStorage の `moneyScaleBase` で上書きできる(計測用)。
- 区分 A: `getEconomyStartProfile()` が人口点あたりの 4 項目に K を掛けて返す。
- 区分 B: 人頭税(`pollTax`)、開拓地の定住補助、`currencyDemand` の人口の項。
- 区分 C: 人物の俸給・小遣い・初期の後払い、俸給の下限・上限、役職別生活費、種族の蓄財、護衛の報酬、ギルド親方の初期資産。
- 区分 D: 化学・医療・土木の施設予算(`debitTreasury` に渡す `*_BUDGET`)、公共事業、干ばつ・冷害の救済、遠征投資、植民地守備隊、地域水利、研究者の雇用・後援、正統性戦争、債務(上限・発行額・返済額・閾値)、治安の維持費、開拓(本体・統治)、港湾開発、怪物討伐、歴史モードの仮の歳入、海軍の偽装交易額。
- 区分 E: 大図書館の閾値と年間支出、国家機密の年間支出、信用プールの初期額、護衛の予備金、医療の富の基準、技術の国庫条件(`technologyProgress.ts` は国庫を K で割って比べる)、開拓統治の閾値。
- 掛けなかったもの: 軍の維持費 `BASE_UPKEEP_PER_HEAD`(兵の実人数 × 穀物価格から導いた値で、既に実人数尺度)、海軍の乗員給与(乗員の実人数あたり)、キャラバンの日々の費用(取引の見積もりで、量 × 価格と比べる値)、比率・割合すべて。

### 8.2 計測(seed 101・102・103、15 年、5〜15 年目の中央値)

| 指標 | K=1(従来) | K=16 | 目標 |
| :--- | :--- | :--- | :--- |
| 通貨量 / 全人口点 | 5〜15 | 84〜240 | — |
| 通貨量(年間食費 430 の何か月分) | 0.1〜0.4 | 2.4〜6.7 | 3〜6 |
| 農民への未払い / 通貨量 | 1.8〜2.3 | 0.06〜0.08 | 1 未満で横ばい |
| 未払いの増減(通貨量比 / 年) | −2.3〜−0.1% | −0.0〜+0.3% | 横ばい |
| 農村の家計 / 農村人口点 | 0.3〜0.8 | 4.1〜10.0 | — |
| 農村の家計の年変化 | −4〜−10% | −5〜−10% | −5〜+5% |
| 都市の家計の食費 / 都市人口点 / 年 | 8〜21 | 86〜105 | — |

- §8.5 の「未払いがお金の量と桁違い」は解消した(通貨量の 2 倍 → 6〜8%)。
- 残る課題(K では直らない、配分の問題):
  1. 通貨の約 75% が国庫にある(K=1 でも同じ比率)。
  2. 農村の家計が年 5〜10% 減り続ける(人頭税が民政費として戻る分を上回る)。
  3. 都市の家計が払う食費は、都市人口点あたり年 86〜105 で、必要量 430 の 2〜3 割にとどまる。不足分の扱い(自家備蓄・宿泊客・都市化率の換算)は未確認。
- 計測の注意: `npm run sim` は生きているデータが約 275MB でも、統計を取りながら進めると V8 のヒープが 4GB を超えて広がる。`NODE_OPTIONS=--max-old-space-size=1024` を付け、1 本ずつ実行した。

### 8.3 追加の是正と原因の調査(2026-10-18)

- **戦時の臨時税がお金を生んでいた**: 君主制が戦争中に国内収入の 15% を上乗せする `applyFormRevenueMix` の戦時補助は、対価なしに国庫へ加算していた(seed 103 で国庫に年 17.7 万、K に比例して増える)。人頭税と同じ比率で都市・農村の家計から徴収するように変えた(`taxes-generator.ts` が `levyWartimeAid` を渡す。省略時は従来どおり)。seed 103 の通貨量は年間食費の 6.7 か月分 → 4.2 か月分、国庫 / 全人口点は 173 → 121 になり、目標に入った。
- **都市の食費が必要量の 2〜3 割にとどまる原因**: 都市の家計は払える分しか食べない(`drawBurgMonthlyNeed`)。収入は民政費の払い出し・人物の生活費・海軍の給与がほとんどで、生産の賃金は年 0.04〜0.08 万しかない。賃金率は労働点(人口点の単位)1 あたり月 `good.value`(約 1 SP)で、実人数 1 人あたりにすると年 0.012 SP、食費(年 0.43 SP)の 1/36 にしかならない。生産の賃金・商品のロットの価格・労働点の尺度がそろっていないことが根本の原因で、K の対象外とした(賃金だけを K 倍・数十倍にすると、生産が赤字になる)。別の設計で扱う。
- `burg.foodSecurity` は農村と都市の不足をまとめて按分するため(都市の人口は全体の 3% 前後)、都市の飢えを小さく見せる。観測の `wealth` に都市の `foodSecurity` と市場の穀物価格・都市の食料不足の四半期数を足した(`scripts/lib/observeViews.mts`)。
