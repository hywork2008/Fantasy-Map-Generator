# 肉の販売のL1（2026-10-31）

計画: [livestock-meat-sales.md](../plan/livestock-meat-sales.md) §4のL1。固定入力`docs/analytics/inputs/wet-pastoral-birth-20261029/world-102.fmg`、平和モード、24か月。比較の基準は同じ作業ツリーから`src`の変更だけを外したもの（f9f9fd1d2に、利用者がコミットした文書だけを加えた状態）。

## 1. 変更

- 財`Meat`（生の肉、1 wain = 465 kg、値2.5 = 穀物の1 kgあたり2.5倍）を加えた。既存のセーブには`migrateMeatGood`で末尾のidに加える。
- `slaughter.ts`で、潰した頭数×食べられる肉と脂（牛110 kg、羊10.7 kg、山羊9 kg、豚20.5 kg）の肉を出し、その場で市場の町が買う。
- 町ごとの買う量は、人数×1人年25 kg/12までと、財布から今月の主食の代金を引いた残りの10%（`MEAT_HOUSEHOLD_CASH_SHARE`、仮値）で買える量の小さい方。肉が需要に足りないときは、町の需要の比で分ける。
- 代金の80%（`FARMGATE_PRICE_SHARE`）を農村の財布へ、残りを市場の金庫へ入れる。町が買わなかった肉は農村が食べる扱いとし、在庫に残さない。

## 2. 結果

| | 基準 | 変更後 |
| --- | ---: | ---: |
| 家畜の塩の不足、1年目（袋） | 22,247 | 17,646（−21%） |
| 家畜の塩の不足、2年目（袋） | 30,482 | 17,992（−41%） |
| 農村の財布、10か月目 | 200,809 | 231,227 |
| 農村の財布、22か月目 | 229,201 | 276,739 |
| 町の家計の財布（年の平均）、1301年 | 123,999 | 100,571 |
| 町の家計の財布（年の平均）、1302年 | 122,227 | 92,794 |
| 都市の主食の充足、1301年 | 99.90% | 99.78% |
| 都市の主食の充足、1302年 | 99.84% | 99.82% |
| 町のお金の不足（budgetGap）、1301年 | 259 | 584 |
| 町のお金の不足（budgetGap）、1302年 | 416 | 474 |

町が買った肉は1年目19,141 wain（町の需要33,217 wainの58%）、2年目12,419 wain（37%）。代金は47.9千・31.0千で、農村へ38.3千・24.8千。町の財布が2割余り減って財布の上限が効き、2年目は買う量が減った。

家畜の塩の不足は、まだ年に約1.8万袋ある。2年目の後半（19〜23か月目）に月2.0〜2.8千袋で、基準（2.3〜5.1千袋）より少ないが、0にはならない。

## 3. 分かったこと

1. 肉の代金で農村の財布は1〜2割増え、家畜の塩の不足は2年目で4割減った。
2. 町の家計の財布は2割余り減ったが、主食の充足とお金の不足はほとんど変わらない。主食の代金を先に取っておく上限が効いている。
3. 町が買う肉は需要の4〜6割にとどまる。町の財布が上限で、肉が足りないためではない。農村へ渡ったお金が町に戻る（`spendRuralHouseholdsInTowns`）速さと、町の家計の収入の大きさ（[start-provisioning.md](../plan/start-provisioning.md)§5の町のお金の不足）による。
4. 残りの不足は、町の少ない市場（L0の市場13など）と、2年目の後半の農村の財布の減り方にある。

## 4. テスト

- `npx vitest run src/extensions/economy/generators/slaughter.test.ts`: 4件成功（2件追加: 町が払える分を買い農村へ80%を払う、貧しい町は主食の代金の残りの10%まで・残りは在庫に残らない）。
- `npx vitest run src/extensions/economy/generators/goods-generator.test.ts src/extensions/economy/generators/goodMeasureCatalog.test.ts`: 78件成功。
- `npx tsc --noEmit -p .`: 既知のfogControls.tsの1件のほかはエラー無し。
- goldenの基準値は更新していない。

## 5. L2: `herdDiet`から町に売った肉を差し引く（同日）

- 市場ごとに、その年に潰した肉と町が買った肉（kg）を`market.meatSales`に記録し、年が変わると前の年の売れた割合（`lastSoldShare`）を残す。
- 年ごとの`herdDiet`の計算（`developmentPotential.ts`の`storeAgriculture`）で、セルの群れの肉に（1 − 市場の売れた割合）を掛ける。閉じた年が無いうちは、その年の途中までの割合を使う。
- 固定入力24か月（`scripts/auditMarketFoodBudget.mts`、L1の後との比較）: 農村の主食の必要は1301年+77、1302年+937（1.15百万の0.08%）。都市の主食の充足（99.78%・99.82%）と町のお金の不足（584・473）は変わらない。L0の見込み（重なりは取り分の2〜7%）どおり小さい。
- テスト: `herdDiet.test.ts`に1件（売った肉を食べない、閉じた年の割合を先に使う）、`slaughter.test.ts`に1件（年の記録と年の変わり目）。`slaughter`・`herdDiet`・`ruralDiet`の13件、`developmentPotential.test.ts`の6件が成功。

## 6. ファイル

`livestock-meat-sales-l1-20261031/`

| ファイル | 内容 | SHA-256 |
| --- | --- | --- |
| meatl1.mts | 月ごとの家畜の塩の不足、農村・町の財布、金庫、肉の流れ（町・農村） | 5d50eae63d999de8419676fee7d57a73fa4d89dc8c91dda15799b6f0f98089ac |
| meatl1-before.jsonl | 基準の24か月 | 197e14ab907977c354ec812ca253a15cf80a8f49a71723fbd573167d7720ff3d |
| meatl1-after.jsonl | 変更後の24か月 | 68571b36d07dd98612d022812fb27197fb7e29587f6b56e050e0481a5028cc24 |
| food-before-24.json | `scripts/auditMarketFoodBudget.mts`の基準の24か月 | 29b04cac7466bd4b23ac5f38f462eaa31076767be30f6a733bf4e43da2c99f9b |
| food-after-24.json | 同じく変更後 | 21ed1a00075af6f58dd0b026ff43ad0e83b0d416d7d0b0bd1cdcf091bd15d0d3 |
| food-l2-24.json | 同じくL2の後 | 8092a058c0dc8f1050547a2cad3c6590c62ac36a56a43374f22caf5bfe6f40af |
