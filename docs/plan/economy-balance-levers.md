# 経済の釣り合いを崩せる係数（ゲームの係数）

2026-10-18 作成。農業労働・食料・お金の校正（[farm-labour-calibration.md](farm-labour-calibration.md)、[craft-wage-subsistence-scale.md](craft-wage-subsistence-scale.md)、[initial-wealth-calibration.md](initial-wealth-calibration.md)、[money-scale-calibration.md](money-scale-calibration.md)、[grain-storage-life.md](grain-storage-life.md)）で決めた係数の一覧。

## 0. 目的

- 校正の目標は、「出生の分だけ人口が増え、食料と経済が順調に回る」状態である。
- ゲームとしては、校正前のようないびつな状態（都市が飢える・お金が首都に溜まる・農村が働き手不足で収穫を落とす）を、為政者の意思決定で直していく遊び方も想定している。
- そのため、校正した係数のうち、**崩すと校正前の問題が再現でき、かつ為政者の政策として説明できるもの**をここにまとめる。シナリオの難易度や、国ごとの政策の値として後から出せるようにする。

## 1. 読み方

- **今の値**: 校正後の値。順調に回る基準。
- **校正前**: 校正の前の値、または仕組みがなかった状態。この値に戻すと、校正前の問題が再現する。
- **崩すと**: 値を校正前の側へ動かした時に起きること。
- **政策としての読み**: ゲームの中で、為政者のどんな決定にあたるか。
- 種類:
  - **政策**: 国や町ごとに、プレイヤーが変えられる値として出すのに向く。
  - **シナリオ**: 地図や時代の難しさとして、開始時に決める値に向く。
  - **固定**: 史料で決めた物理的な値。崩すと説明がつかなくなるので、ゲームの係数にはしない（参考として載せる）。
- 今はどれもモジュールの定数である（`pollTax` と移住の方式を除く）。出す時は、国ごとの政策（`State` の値）か、シナリオの設定（`optionsStore`）に移す。

## 2. お金の流れ

| 係数 | 場所 | 今の値 | 校正前 | 崩すと | 政策としての読み | 種類 |
| --- | --- | ---: | --- | --- | --- | --- |
| `RURAL_TOWN_SPEND_DUES_SHARE` | `householdWealth.ts` | 0.25 | 1.0（全額を町の金庫へ） | 農家が町で使うお金が町の住民の稼ぎにならず、金庫に溜まって年末に回収される。町の家計が尽きて都市が飢える（§11） | 市の使用料・通行税・物品税の重さ。上げると町の財政は潤うが、職人・商人の手取りが減る | 政策（町・国） |
| `RURAL_HOUSEHOLD_TOWN_SPEND_SHARE` | `householdWealth.ts` | 0.05（月） | 0（農村のお金は人頭税にしか出ない） | 町に農村のお金が入らない。町の食費が農家に払われたまま戻らない | 定期市・市場の開設、街道の安全。農家が町で買い物をする度合い | 政策（国）／シナリオ |
| `TOWN_WORKS_TARGET_MONTHS` | `townWorks.ts` | 2 | 0（公共事業なし） | 金庫にお金がある町で、家計が飢える（§12.1 の 1） | 飢饉時の公共事業・救貧の手厚さ | 政策（町・国） |
| `TOWN_WORKS_TREASURY_SHARE` | `townWorks.ts` | 0.1（月） | 0 | 同上。小さいと救済が遅れる | 町の財政のうち、公共事業に回す割合 | 政策（町・国） |
| `TOWN_WORKS_RESERVE_MONTHS` | `townWorks.ts` | 2 | — | 大きいと金庫を貯め込み、救済しない | 町の財政の手元資金の方針 | 政策（町） |
| 市場の利益の払い出し先 | `payOutMarketSurplus`（`householdWealth.ts`） | 市場のすべての町へ人口比 | 市場の中心の都市だけ（さらに前は市場の金庫に溜まるだけ） | 中心の都市だけ豊かになり、周りの町が飢える（§12.1 の 2） | 穀物の取引を中心の都市の商人に独占させるか、各町の市に分けるか | 政策（国） |
| `MARKET_MERCHANT_PROFIT_SHARE` | `householdWealth.ts` | 1/3 | — | 上げると商人の人物に富が集まり、町の稼ぎが減る | 商人組合の特権の強さ | 政策（国） |
| `MARKET_SURPLUS_PAYOUT_SHARE` | `householdWealth.ts` | 0.2（月） | 0（市場の金庫に溜まるだけ） | 市場の金庫にお金が溜まり、町にも農家にも戻らない | 市場の利益の再投資の速さ | シナリオ |
| `CAPITAL_PAYROLL_WEIGHT` | `householdWealth.ts` | 3 | — | 上げると国の給与が首都に集まり、地方の町が貧しくなる | 中央集権の度合い（宮廷・官庁・兵営を首都に置くか） | 政策（国） |
| `URBAN_HOUSEHOLD_BUFFER_MONTHS`・`URBAN_HOUSEHOLD_SPEND_SHARE` | `householdWealth.ts` | 12・0.2（月） | なし（賃金が町に溜まるだけ） | 豊かな町に現金が溜まり、市場・国庫に戻らない | 奢侈・消費の気風 | シナリオ |
| `STATE_RESERVE_YEARS`・`STATE_SURPLUS_SPEND_SHARE` | `taxes-generator.ts` | 2年・0.25（月） | なし（国庫に溜まり続ける） | 国庫に溜まり続け、家計が尽きる（[initial-wealth-calibration.md](initial-wealth-calibration.md) §3） | 国の財政方針（備蓄か支出か） | 政策（国） |
| `state.pollTax`（人頭税の税率） | `taxes-generator.ts`、国の財政タブ | 国ごと（UI で変えられる） | 通貨量の係数 K を掛けていた（食費の約27%） | 農村の現金を国庫が吸い上げ、2年で農村の家計が1/4になる | 人頭税。既に政策として出ている | 政策（国、既存） |
| `WAGE_SUBSISTENCE_MULTIPLE` | `subsistenceWage.ts` | 1.5 | 林業の賃金の流用（生活費の1/36） | 生産の賃金が都市の家計の収入の1%前後になる | 賃金の公定（ギルドの賃金規制） | 政策（国・町） |
| `MINE_HEAD_PRICE_SHARE` | `extractionPayments.ts` | 0.8 | 0（鉱山の産物は市場にただで入る） | 鉱夫・石切りに賃金が払われず、領主に鉱山税も入らない（§13） | 鉱石の買い上げ価格（造幣所への定価納入など） | 政策（国） |
| `MINING_ROYALTY_SHARE` | `extractionPayments.ts` | 0.1 | 0 | 上げると国庫が潤い、鉱山町の賃金と経営者の利益が減る | 鉱山税（Bergregal の十分の一税） | 政策（国） |
| 鉱山税の受け取り手（`getMiningRoyaltyHolder`） | `extractionPayments.ts` | 君主国・神権国は国、共和国・連合は町、無政府は無し | — | 町が鉱業権を買い取れば、鉱山税は町に残る（Goslar、1359年） | 鉱業権（regalia）の売却・下賜 | 政策（国） |
| 鉱山の経営者（`getExtractionOperator`） | `extractionPayments.ts` | 帝国は国の直営、ほかは町の出資者 | — | 直営にすると利益は国庫へ、町には賃金だけが残る | 鉱山の直営か請負か（ローマの procurator、佐渡奉行） | 政策（国） |
| `UNFREE_EXTRACTIVE_LABOUR_SHARE_BY_PERIOD` | `extractionPayments.ts` | 古典古代0.6・古代末期0.3・以後0 | — | 不自由労働の分は賃金でなく食い扶持だけになり、鉱山町の家計が細る | 奴隷・囚人労働の容認 | 政策（国）／シナリオ |
| `WORKS_LABOUR_SHARE` | `worksPayments.ts` | 0.6 | 公共事業費はどこにも払われず消える | 公共事業の賃金が町・農村に戻らない | — | 固定 |
| `ROAD_CORVEE_SHARE_BY_FORM` | `worksPayments.ts` | 君主国・神権国0.5、共和国・連合・無政府0（蒸気の時代から0） | — | 上げると国庫は安く道を造れるが、労働は農民の無償の負担になり、賃金として戻らない | 道路の賦役（フランスの王の賦役、1738〜1787） | 政策（国） |
| `GUILD_PROFIT_SHARE` | `guildTreasury.ts` | 0.35 | — | 上げるとギルドに富が集まり、町の金庫が細る | ギルドの特権 | 政策（町） |

## 3. 食料と穀物の市場

| 係数 | 場所 | 今の値 | 校正前 | 崩すと | 政策としての読み | 種類 |
| --- | --- | ---: | --- | --- | --- | --- |
| `FARMGATE_PRICE_SHARE` | `foodProduction.ts` | 0.8 | — | 下げると農家の現金が細り、町での買い物が減る。上げると市場の利益（運送・小売の稼ぎ）が減る | 穀物の買い上げ価格の統制 | 政策（国） |
| `STORAGE_CAP_MONTHS` | `foodProduction.ts` | 12 | 9か月で捨てる | 端境期に町の穀物が尽きる | 公設の穀物庫の規模 | 政策（町・国） |
| `PRICE_FLOOR`・`PRICE_CEILING` | `foodLedgerConsumption.ts` | 0.8・2.0 | — | 上限を上げると不作の年に都市の家計が穀物を買えなくなる | 穀物の価格統制（最高価格令） | 政策（国） |
| 地金の基準価値（`SMELTED_METAL_REPRICING`） | `goods-generator.ts` | 鉄8・銅8.5・錫9.5・鉛7（原料の約1.25倍） | 鉄4・銅5・錫6・鉛3（原料割れ） | 戻すと製錬が赤字になり、製錬所に人が付かない（§15） | 金属の公定価格・造幣所への定価納入 | 政策（国） |
| `FARMGATE_PAYABLE_YEARS` | `foodProduction.ts` | 1年 | 上限なし | 農家への未払いが際限なく増える | 市場の掛け買いの規制 | シナリオ |
| `EXPORT_RESERVE_MONTHS` | `foodProduction.ts` | 3 | — | 下げると、凶作の地域から穀物が出ていく | 穀物の輸出禁止令 | 政策（国） |
| 市場間の穀物の輸入（実際に運ぶ） | `foodImportNetwork.ts` | 運んだ分だけ | 都市の上限だけを上げ、穀物は動かない | 届かない食料で都市が育つ | 穀物の流通の自由化 | — |

## 4. 農業労働

| 係数 | 場所 | 今の値 | 校正前 | 崩すと | 政策としての読み | 種類 |
| --- | --- | ---: | --- | --- | --- | --- |
| 収穫に労働の充足率を掛ける | `foodProduction.ts`（`cropLaborCoverage`） | 掛ける | 掛けない（労働が足りなくても収穫は減らない） | 働き手のいない畑でも満額の収穫が出る | — | 固定 |
| `PEAK_MONTH_WORK_MULTIPLIER` | `agriculturalLandUse.ts` | 2 | 1（月の労働能力が一律） | 収穫月に必要労働の6割近くが足りなくなる | 農繁期の夜明けから日没までの労働（領主の賦役を免除するか） | シナリオ |
| `URBAN_HARVEST_HELP_SHARE_*` | `ruralOccupationAllocation.ts` | 中世0.05・近世0.10・以後0.15 | 0（町の住民は手伝わない） | 収穫月の労働不足が残り、収穫が落ちる | 町の住民の収穫への動員（労働の義務・賃金） | 政策（国） |
| `REGIONAL_HARVEST_MOBILITY_*` | `ruralOccupationAllocation.ts` | 中世0.25・近世0.40・以後0.50 | 0（出稼ぎなし） | 同上 | 季節労働者の移動の自由（通行証・移動の制限） | 政策（国） |
| `FIELD_LABOUR_DAYS_PER_HECTARE` | `settlementClearance.ts` | 30日/ha | — | — | — | 固定（Clark c.1300） |
| `FIELD_WORK_DAYS_PER_ADULT` | `settlementClearance.ts` | 140日 | — | — | — | 固定 |
| `THRESHING_LABOUR_SHARE` | `settlementClearance.ts` | 0.25 | 0（脱穀が収量に比例しない） | 豊作の年の脱穀の労働を少なく見積もる | — | 固定 |
| `PROCESSING_MONTHS` | `cropCalendars.ts` | 4 | 0（収穫月に脱穀まで詰め込む） | 収穫月の労働が過大になる | — | 固定 |

## 5. 都市の人口と移住

| 係数 | 場所 | 今の値 | 校正前 | 崩すと | 政策としての読み | 種類 |
| --- | --- | ---: | --- | --- | --- | --- |
| 移住の方式（`ruralUrbanMigration`） | `optionsStore.ts` | Independent（既定）／Megacity | — | Megacity では、都市は飢えるところまで人を受け入れる（§12.4） | 農村から都市への移住の自由 | シナリオ（既存） |
| `URBAN_CAPACITY_MAX_GROWTH_MULTIPLIER` | `urbanFoodCapacity.ts` | 3 | — | 今は効いていない（§12.4） | 都市の城壁・居住区の拡張の許可 | シナリオ |
| `SERVICE_EMPLOYMENT_MULTIPLIER` | `serviceEmployment.ts` | 1.5 | — | 上げると Megacity の移住が増える（賃金は伴わない、§12.5） | — | 固定（暫定） |
| 採掘の職の数（`getMineEmploymentPeople`・`getSmelterCrewPeople`、`crewSlot`） | `mineOperations.ts`・`smelterOperations.ts`・`basicEmployment.ts` | 産出の価値 ÷（1.3 × 作業員の年の賃金）。鉱山は最小4人、製錬所は最小8人 | 人口点の枠（鉱山1か所で最大3.4万人）→ 鉱種によらず40＋豊かさ×80人 | 職を人口点で数えると、Megacity で鉱山町に実在しない職を求めて人が集まる（§13）。鉱種によらない人数では、小さな鉱山が賃金を払えない（§14） | — | 固定 |
| `EXTRACTION_OUTPUT_PER_WORKER_IN_WAGE_YEARS` | `mineOperations.ts` | 1.3 | — | 下げると採掘の人数が増え、1人あたりの賃金が払えなくなる | 鉱山の生産性（技術・坑夫の熟練） | シナリオ |
| `MINE_MIN_HIRING_SHARE` | `mineOperations.ts` | 0.25 | 1（売れなくても掘り続ける） | 1にすると、売れない鉱石を掘り続けて賃金が払えない | 鉱山の雇用の維持（公費の補助） | 政策（国） |
| `URBAN_FOOD_FAMINE_DEATH_BAND`・`SEVERE_DEFICIT_QUARTERS_BEFORE_DEATH` | `foodLedgerConsumption.ts` | 0.85・2四半期 | — | 飢えによる死亡の始まり方 | — | 固定 |

## 6. 開始時の配分（`economyStartMode.ts`）

| 係数 | 今の値（balanced） | 崩すと | 種類 |
| --- | --- | --- | --- |
| `householdWealthPerPopulation` | 10 | 小さいと開始直後に家計が尽きる | シナリオ |
| `stateTreasuryPerPopulation` | 8 | 小さいと国が給与を払えない | シナリオ |
| `burgTreasuryPerPopulation` | 15 | 小さいと町が生産を始められない | シナリオ |

開始の方式（`balanced`・`provisioned`・`subsistence`）が、既に難易度の選択として出ている。

## 7. ゲームとして出す時の注意

- **お金を生まない**: どの係数も、お金をどこからどこへ動かすかの割合である。崩してもお金の総量は変わらない（行政費などの明示的な支出を除く）。新しく係数を出す時も、この性質を保つ。
- **係数の組み合わせで問題が現れる**: 例えば、市の使用料（`RURAL_TOWN_SPEND_DUES_SHARE`）を上げても、公共事業（`TOWN_WORKS_*`）で町の住民に戻せば都市は飢えない。プレイヤーには、片方だけでなく、両方の決定を見せる必要がある。
- **結果が見えるまでの時間**: 家計の変化が都市の食料の充足に出るまで、1〜2年かかる（家計は数か月分の現金を持ち、食料の不足は2四半期続いてから死亡につながる）。
- **観測**: 校正の計測に使った値（都市の家計が食費の何か月分か、市場ごとの充足、金庫と家計の偏り）は、そのままプレイヤーに見せる指標の候補になる。
