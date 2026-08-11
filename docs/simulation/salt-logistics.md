# 国家塩業と都市への塩流通

`Salt` は気候セルから自然発生する一般 Good ではなく、国家が管理する必需品である。各国家は、人口を持つ市場圏が一つでもあれば、少なくとも一つの `Saltworks`（塩田、塩井、岩塩坑）を持つ。塩業所は市場セルを候補に選び、海岸なら塩田、高地なら岩塩坑、それ以外は塩井として記録する。

## 数量契約

`Salt` の `unit: "bag"` は **60 kg** と仮定する。これは Cheese のレシピが 1,000 kg のチーズに 0.25 bag を使うため、塩分が約 1.5% になる量であり、一般的なチーズの塩分水準（約 1.5–1.7%）と整合する。 [Wisconsin Center for Dairy Research](https://cdr.wisc.edu/cheese-faqs) 家計の基準は 10 g/日、年 3.6 kg とし、さらに塩蔵・乳製品・加工用に年 2.4 kg を市場へ配分する。従って国家塩業の通常の供給目標は **年 6 kg/人 = 0.1 bag/人** である。

これは栄養学上の推奨摂取量ではなく、料理と保存を含むシミュレーション上の計画値である。10 g/日（3.6 kg/年）は考古学的な消費モデルの基準例であり、保存を含む中世後期の年間消費は地域によって 15–16 kg 程度という推計もある。 [Anatolia salt-production model](https://www.cambridge.org/core/journals/european-journal-of-archaeology/article/model-of-salt-production-and-consumption-patterns-in-bronze-age-anatolia/B0A2D8BFF1947DC1566724CC8AF5101A), [late-medieval German estimate](https://erenow.org/common/beyond-bratwurst-history-food-in-germany/6.php)

塩業所の年間能力は、その国家の市場圏人口に必要な 6 kg/人を合計し、15% の操業余力を加えたものになる。大国は一施設あたり 900 bag/年を目安に複数拠点へ分割される。

## 月次フロー

1. 生産月の先頭で、各 `Saltworks` が年間能力の 1/12 を発地市場へ卸す。
2. 同じ国家に属する各市場圏の人口（都市人口と市場に属する農村人口）から、月間の供給必要量を算出する。
3. 国家内の塩業所から都市市場へ `SaltShipment` を作成して在庫を移す。これは市場商人による月次の卸売配送を表す。発地・着地・数量・推定移動日数・到着時単価を記録する。
4. 着地市場は家計分の 3.6 kg/人/年を販売して在庫から差し引く。残る 2.4 kg/人/年相当は保存食・チーズなど既存レシピの入力に使える。

この初期版は国内の確実な基礎供給を優先し、国家間の塩貿易や物理キャラバンへの積載は扱わない。`SaltShipment` は将来、既存の caravan / deal 層へ接続するための配送契約であり、現時点では月次決済済みの卸売として処理する。

## データと診断

Economy の simulation slice は次を保持する。

- `saltworks`: 国家・セル・発地市場・類型・能力・当月生産量
- `saltShipments`: 最新月に完了した国内卸売配送
- `stateSaltLedgers`: 国家ごとの人口、必要量、生産量、配送量、家計販売量、不足量

`Salt` は `chance: 0` かつ `demandCoverage: {}` とし、旧来のバイオーム生産と utilities 需要から除外する。旧セーブに残る Salt のセル割当も、通常の農村生産経路では供給されない。
