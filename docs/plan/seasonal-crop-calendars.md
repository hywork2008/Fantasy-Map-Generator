# 季節別作物暦・農繁期・混合農業労働の計画

## 状態

月次暦と共通農村労働配分を実装済み（2026-08-12）。共有の `src/data/cropCalendars.ts` が、少数の季節地域・農業気候ゾーン・作物・必要なコホートから月次収穫／労働重みを生成する。Food Ledger は月次収穫へ移行し、通常の市場供給、果樹、農地の移住余力も同じ暦を参照する。主食・狩猟・漁撈・果樹・牧畜の月別要求は同一の常住成人プールへ合算され、未充足分を `seasonalLaborShortage[cellId * 12 + month]` として保持する。保存済みの気候分類列と、道路・賃金を使う季節雇用市場は後続段階とする。

## 背景と結論

現在の Economy には二つの独立した季節化がある。

| 経路 | 現状 | 問題 |
| --- | --- | --- |
| `foodProduction.ts` の Food Ledger | 地図中央の緯度だけで、均等な四半期配分と北半球の `[0.20, 0.23, 0.34, 0.23]` を最大 10% 混ぜる | 高緯度でも供給がほぼ通年化される。セル、作物、二期作を区別しない |
| `production-utils.ts` の通常商品供給 | セル緯度により `food` タグ全体へ温帯型の秋ピークを掛ける | 作物・果樹・家畜を同じ曲線に載せ、Food Ledger と暦の根拠が別になる |

これは価格を意図せず平準化するだけでなく、果樹・穀物・家畜の繁忙期を比較できない原因になっている。今後は、**少数の季節地域ごとの季節位相と農業気候ゾーン別・作物別の月次作物暦**を、生産、Food Ledger、価格、労働力の唯一の時期情報源にする。

通年収穫は「赤道に近い」だけで決めない。各月にその作物の温度・水分条件が満たされ、かつ収穫可能な短周期／継続収穫作物である場合だけ許す。高緯度では年一回の収穫を標準とし、長い生育可能期間・十分な水分・短い生育周期を全て満たす年次作物だけが二期作以上を選べる。永年作物は、個別の史料が裏付けない限り年一回の収穫とする。

FAO の agro-ecological zoning は、生育可能期間を「温度と水分が作物生育を許す日数」と定義し、温帯では低温、熱帯でも乾季が生育を止めるとする。このため緯度だけの判定では不十分である。[FAO: growing period](https://www.fao.org/4/W2962E/w2962e-03.htm)  FAO は、利用可能期間と作物の生育周期を照合して複数作の可能性を判定する手法も示している。[FAO: multiple cropping zones](https://www.fao.org/4/a1075e/a1075e03.pdf)

### 地域限定と計算量

この計画の前提として、通常の生成マップは惑星全体ではなく、緯度幅を限った地域とする。**赤道をまたぐ地図は許容する。** ただし北極から南極までを一枚につなぐ地図は対象外とする。

生成時に、セルを北部・赤道・南部のうち必要な少数の**季節地域**へ分類する。北部と南部は半年ずれた位相、赤道地域は季節温度振幅の小さい位相を共有する。この地域分割は固定的な三地域を強制するものではなく、地図の緯度範囲と季節性に応じて一つから三つを生成する。

各季節地域の内部でも年平均気温、年降水 proxy、灌漑、土壌、標高に相当するセル気候は異なる。これを無視して全セルに同じ暦を使うと、一作地と二期作可能地、乾燥限界地、冷涼地が同質になる。そこでセルごとの月次気候計算は行わず、生成時または灌漑・気候条件の変更時に各セルを少数の**農業気候ゾーン**へ分類する。各ゾーンが所属する季節地域の位相に対する作物暦を一つ持ち、セルは `seasonRegionId` と `zoneId` を参照するだけとする。

初期実装ではこの分類を保存済みセル列にはまだ書かず、年平均入力から導いた `seasonRegion × zone × crop × cohort` の少数キャッシュを参照する。灌漑・気候の変化は異なるキーを選ぶため、セルごとの月次気候配列を保持・再計算しない。

初期候補は `cold-rainfed-single`、`temperate-rainfed-single`、`warm-rainfed-single`、`warm-irrigated-double`、`tropical-irrigated-continuous`、`warm-water-limited-single` のように、`seasonality`・`waterRegime`・作数を連結した識別子にする。これはバイオームではなく農業上の気温・水分・灌漑の分類であり、必要なゾーンだけを生成する。`dry` を気温帯として扱わず、乾燥制限は `waterRegime: "waterLimited"` で表す。月次の暦計算・キャッシュは `seasonRegion × zone × crop × cohort` 単位、セル側は生成時の地域・ゾーン・必要なコホート参照と面積・収量の掛け算だけに留める。コホート数は少数固定であり、キーに含めてもセル数に比例するキャッシュにはならない。

## 対象と非対象

### 対象

- 主食作物、豆類、根菜の播種・栽培・収穫を月次で配分する。
- Grapes、Olives、Apples、Pears、Plums、Figs、Lemons の剪定・管理・収穫を月次で配分する。
- 放牧家畜の通年世話と、繁殖・移牧・搾乳・越冬飼料の繁忙を月次で配分する。
- 季節地域ごとの季節位相と、セルを生成時に分類する農業気候ゾーン、作物固有の生育周期から、年一作・二期作・継続収穫を判定する。
- 月次収穫を Food Ledger、通常商品の市場供給、私的食料在庫、価格に同じ値で渡す。
- 常住成人の月次労働余力、農繁期不足、後続の季節雇用を計算可能にする。

### 非対象（この計画の初期実装では行わない）

- 月ごとの降水グリッド、モンスーン開始日の実データ、霜害・病害虫・品種別 chill hours。
- 北極から南極までを含む一枚の生成マップに対する季節作物暦。これは季節地域を三つに留める本設計を超えるため、必要になった場合は別の広域気候設計とする。既存の世界生成・旧セーブの読み込み自体は妨げない。
- 作付一回ごとの個別農家・畑・雇用契約の追跡。
- 自動的な三期作。二期作の検証後にのみ候補とする。
- 果樹園と牧草地の土地共有。現在どおり両者は土地を排他的に消費する。労働・副産物の統合は土地共有とは別に扱う。

## 史料に基づく設計原則

1. **生育可能期間を先に算出する。** 年平均の気温・雨量だけで播種回数を決めない。FAO は温度、水分、土壌水分貯留を生育可能期間の構成要素としている。[FAO climatic inventory](https://www.fao.org/4/T8300E/t8300e05.htm)
2. **作物ごとに生育周期を持つ。** FAO の作物水需要資料も、作物ごとに生育期の長さと段階を分けて扱う。[FAO Crop Water Needs](https://www.fao.org/4/S2022E/s2022e07.htm)
3. **二期作は余った月数だけでは認めない。** 一作目の収穫後に播種・整地の余地があり、両作が生育可能期間内に収まる組合せだけを認める。二期作は同じ圃場の生産性を増す一方、播種・収穫の両方を増やす。[USDA ERS: double cropping](https://ers.usda.gov/data-products/charts-of-note/114011)
4. **果樹は基本年一回、労働は通年に分散し収穫で集中する。** 例えばブドウは冬の剪定、春夏の樹冠管理、夏から秋の収穫という別作業を持つ。[UC Cooperative Extension のワイン用ブドウ作業暦](https://ucanr.edu/sites/NapaCountyUCCE/files/52946.pdf) 既存の果樹の年間 `laborDaysPerHectare` を、史料が得られるまで年一作を前提とした暫定値と明示する。
5. **牧畜は通年の基礎世話を持つ。** 作物の季節雇用と異なり、多くの畜産は通年労働を必要とする。[USDA ERS: Farm Labor](https://ers.usda.gov/topics/farm-economy/farm-labor) 従って「同じ日に水やりと給餌ができる」ことは総労働日を無くす理由ではなく、月次の同一世帯配分を可能にする理由である。
6. **統合農業の効率化は個別に表す。** 家畜が下草・残渣を利用して除草費を下げる例はあるが、収穫期には家畜を排除すべき場合もある。[FAO: integrated crop-livestock systems](https://www.fao.org/agriculture/crops/thematic-sitemap/theme/spi/scpi-home/managing-ecosystems/integrated-crop-livestock-systems/icls-what/en/) よって、全作物・全家畜への一律「兼務割引」は導入しない。

## データモデル

新規の共有型は `src/data/cropCalendars.ts` に置く。これは純粋なデータ・計算モジュールとし、Economy の context や UI を import しない。

```ts
type MonthlyWeights = readonly [number, number, number, number, number, number, number, number, number, number, number, number];
type MonthlyValues = readonly [number, number, number, number, number, number, number, number, number, number, number, number];
type MonthlyFlags = readonly [boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean];
type SeasonRegionId = "north" | "equatorial" | "south";
type AgriculturalClimateZoneId =
  | "cold-rainfed-single"
  | "temperate-rainfed-single"
  | "warm-rainfed-single"
  | "warm-irrigated-double"
  | "tropical-irrigated-continuous"
  | "warm-water-limited-single";

interface CropCalendarProfile {
  readonly annualCycleDays: number;
  readonly turnaroundDays: number;
  readonly minimumGrowingTemperatureC: number;
  readonly harvestWindows: readonly HarvestWindow[];
  readonly labourByStage: {
    readonly establishment: number;
    readonly maintenance: number;
    readonly harvestAndProcessing: number;
  };
  readonly canProduceContinuously: boolean;
  readonly maximumCropsPerYear: 1 | 2;
}

interface HarvestWindow {
  readonly startAfterPlantingDays: number;
  readonly durationDays: number;
}

interface AgriculturalClimateZone {
  readonly id: AgriculturalClimateZoneId;
  readonly seasonality: "cold" | "temperate" | "warm" | "tropical";
  readonly waterRegime: "rainfed" | "irrigated" | "waterLimited";
  /** Zone representative used with SeasonRegionProfile offsets; not re-evaluated per cell/month. */
  readonly referenceAnnualTemperatureC: number;
  readonly maximumAnnualCropCycles: 1 | 2;
  /** True only where water and temperature permit uninterrupted growth. */
  readonly allowsContinuousGrowth: boolean;
}

interface SeasonRegionProfile {
  readonly id: SeasonRegionId;
  readonly hemisphere: "north" | "equatorial" | "south";
  readonly monthlyTemperatureOffsets: MonthlyValues;
}
```

- 年次作物は `StapleCropProfile` に `calendar` を追加する。既存の気温・降水・土壌適性は残す。
- 永年作物は `PerennialCropProfile` に `calendar` を追加する。初期値は `maximumCropsPerYear: 1` とし、Grapes、Olives、Apples、Pears、Plums、Figs、Lemons を個別調査して収穫窓と作業配分を決める。
- 家畜は `HusbandrySpeciesProfile` を公開データ型へ移し、`routineCareMonthlyWeights` と `seasonalEvents` を追加する。現行の `baselineHeadsPerHerder` は、年あたり・月あたりの世話日数へ再校正するまで互換用の上限として残す。
- `Good.tags.includes("food")` はカレンダーの有無を表す条件に使わない。`crop`、`perennialCrop`、`liveAnimal` 等の明示的な型で振り分ける。
- `SeasonRegionId` と `AgriculturalClimateZoneId` はセルごとに保持するが、月次の `MonthlyWeights` は保持しない。`plantingCohort` を用いる作物だけ、少数コホートの ID もセルに保持する。暦のキャッシュキーは `seasonRegionProfile + zoneId + cropId + plantingCohort` とする。
- 灌漑された赤道地域で、profile が明示的に許す短周期作物だけ `plantingCohort` をセルへ決定的に割り当てる。早植え・中植え・遅植えの少数コホートをずらし、地域または市場圏として通年収穫を作る。これは一セル内の圃場をさらに追跡せず、月次気候計算も増やさない。現行カタログには Rice/Paddy はないため、初期の純粋計算・テストはこの一般化した profile fixture を使う。稲を商品として追加する場合は、その profile に根拠・水要求・コホート可否を追加する別タスクとする。

## 暦の算出

### 1. 季節地域の位相とセルの農業気候ゾーン

地図の緯度範囲と World Configurator の気温設定から、北部・赤道・南部の必要な `SeasonRegionProfile` を一度だけ作る。これは半球区分、各月の温度オフセット、収穫期の月順序を持つ。赤道をまたぐ地図では、セルの `seasonRegionId` により北部・赤道・南部のいずれかを参照する。個々のセルについて月別に `getSeasonalTemperatureOffset()` を呼び直さない。

この作物暦機能を有効にする際は `mapCoordinates.latT < 180` を検証する。`latT = 180` の既存の極域横断マップ／旧セーブは読み込めるが、実験的な作物暦を初期化せず、明示的な診断と既存の季節供給へフォールバックする。新規生成で本機能を有効にする UI はこの範囲を選べないようにする。これにより「対象外」は通常の地図生成を拒否する意味ではなく、三季節地域モデルを部分的に生成しないという意味になる。

各セルは年平均の `grid.cells.temp`、`grid.cells.prec`、土壌、水利・灌漑、地形の既存値から `AgriculturalClimateZoneId` を決定する。

```text
seasonRegionId = classifySeasonRegion(latitude)
zoneId = classify(annualCellTemperature, annualPrecipitation, irrigation, soil, terrain)
calendar = getCalendar(seasonRegionProfile, zoneId, cropProfile, plantingCohort)
```

現行ワールドは月降水を持たないため、`waterRegime` は年降水・灌漑からの保守的な可否に留める。乾季を知っているかのようなセル別雨季を捏造しない。月降水・雨季位相が導入された時点で、ゾーン分類を月別の生育可能期間へ拡張する。

### 2. 年一作・二期作・継続収穫

1. `seasonRegionProfile.monthlyTemperatureOffsets` と `zone.referenceAnnualTemperatureC`、作物の `minimumGrowingTemperatureC` から `growableMonths: MonthlyFlags` を一度だけ導出する。`waterRegime` が `waterLimited` の場合は灌漑対応 profile 以外を生育不可とする。現行ワールドには月降水がないため、水分は全月共通の保守的な可否であり、雨季を推測しない。この配列の連続区間（年境界をまたぐ場合を含む）が生育可能期間である。
2. `annualCycleDays + turnaroundDays` を満たす最も適した播種月を選ぶ。
3. 同じ年に、二つの非重複サイクルが `2 × (annualCycleDays + turnaroundDays)` を満たし、かつ profile と zone の双方が二期作を許す時だけ二期作とする。
4. 継続収穫は `canProduceContinuously` の作物だけに限定し、`allowsContinuousGrowth` が真で全月が `growableMonths` であるゾーンだけで月次収穫を平坦化する。既存カタログの穀物・豆・根菜・永年果樹に無根拠に付与しない。
5. 南部季節地域は北部と半年ずれた位相を使う。赤道地域は温度季節性を弱くし、灌漑された継続栽培・明示的に許可された短周期作物だけは `plantingCohort` による時期ずらしを許す。雨水依存の作物を、赤道だからという理由だけで通年収穫にはしない。

各 `seasonRegion × zone × crop × cohort` は `harvestWeights: MonthlyWeights` と `labourWeights: MonthlyWeights` を返す。双方の和は必ず 1 とする。セルはこの結果を参照し、自身の面積・収量・労働量だけを掛ける。コホート版はベース暦を月方向に回転したものとしてキャッシュする。二期作では年間収量・種子・土壌回復・労働日を作数に応じて別々に積むため、単に同じ収量を二倍にしない。

## Food Ledger と市場への接続

### 唯一の権威

`getCropCalendar(seasonRegionProfile, zoneId, good, year, plantingCohort)` を新設し、セルは `seasonRegionId`・`zoneId`・必要なら `plantingCohort` を引いて以下の全てが同じ戻り値を使う。

- `FoodProduction.generateMonthlyLedger(month)` の主食収穫と農村世帯在庫への投入
- `markets-generator.ts` の月別卸売供給
- `production-utils.ts` のセル生産寄与
- 果樹・家畜の生産量
- 農村労働配分器の月次労働要求

これにより、Food Ledger の穀物だけが四半期補正、通常商品の果実だけが別の月次補正、家畜まで秋収穫という重複・矛盾をなくす。

### 月次 Food Ledger への移行

現在の月次消費に対して収穫と在庫の加齢は四半期単位である。繁忙期と価格を正しく出すには、`generateQuarterlyLedger()` を月次化する。

```text
月初: 保存期間を一月進める
月中: その月の crop calendar に従い収穫を世帯在庫・Market 在庫へ入れる
月末: 都市・農村の消費、価格、輸入・輸出を決済する
```

- Age0/Age1/Age2 の三バケットは互換移行時に月齢バケットまたは期限付きロットへ置換する。保存期間 9 か月という総量制限は維持する。
- 旧セーブは既存の三バケットを 0–2、3–5、6–8 か月の均等初期分布として移行し、初回の月次決済から正規化する。
- 年間生産量は、年一作・二期作を除き、既存の `foodPotential` と同じに保つ。変わるのは収穫時期、在庫、価格、繁忙期である。

## 労働力と農繁期

現行の `migratableAdults` は年次の主食農業を先に差し引いた残余であり、`viticulture` は年間 `laborDaysPerHectare / 140`、牧畜は頭数／牧夫で要求を出している。このまま兼務係数を加えると、同じ作業時間を二重に割り引く危険がある。

次の式を共通仕様にする。

```text
requiredDays[occupation, month] = annualRequiredDays × labourWeights[month]
residentCapacity[month] = residentAdults × workableDaysForThatMonth
residentRequiredAdults = max_month(sum(requiredDays[*, month]) / workableDaysForThatMonth)
seasonalShortage[month] = max(0, sum(requiredDays[*, month]) - residentAdults × workableDaysForThatMonth)
```

- 通常期の兼務は、同じ成人プールへ月次作業を合算することで自然に表す。任意の「果樹＋牧畜 = 何% 節約」という係数は使わない。
- 播種、干し草、収穫、脱穀が重なる月は `seasonalShortage` として現れる。これは将来の臨時雇い、家族労働、共同労働、軍役免除の需要側入力になる。
- 果樹放牧のように、実際に一つの作業が別作業を代替する場合だけ `jointTaskLaborSaving` を profile の明示的な組合せに持たせる。初期値は 0 とし、対象・時期・根拠を指定した史料がある場合だけ有効にする。

### 年次の移住・作付上限との接続

これは月次労働の表示だけを追加する変更ではない。`minimumFarmAdults`、`farmLaborRequired`、`migratableAdults`、`ruralReleasePressure` は、現行の年平均式ではなく同じ月次暦から一度だけ導出する。別の年次控除を残して二重に人数を差し引かない。

```text
minimumFarmAdults = residentRequiredAdults(minimumFoodPlan)
farmLaborRequired = residentRequiredAdults(cultivatedProductionPlan)
migratableAdults = max(0, ruralAdults - farmLaborRequired × safetyMargin)
ruralReleasePressure = max(0, ruralAdults - minimumFarmAdults × safetyMargin)
laborAffordableCultivatedArea = max(area where
  residentRequiredAdults(plan(area, reservedOutflow, ruralNonFarmWorkers))
  <= ruralAdults / safetyMargin)
```

- `laborAffordableCultivatedArea` は旧来の年平均による除算を使わず、候補面積を増やしたときの月次ピークが常住成人の容量を超えない最大値として求める。作付・作物構成が固定されている一回の生成では単調な探索にできるため、セルごとの月次シミュレーションを必要としない。
- 主食、果樹、牧畜、漁撈などの常住農村職は、まず同じ `requiredDays` 配列へ入れ、最終的な `residentRequiredAdults` を確定してから `migratableAdults` と `ruralReleasePressure` を更新する。既存の Rural Occupation Allocator が移住余力を先に予約する順序は、この共通計算に置換する。
- `seasonalShortage` は移住後の常住成人を基準に再計算する。初期段階では不足を隠れた生産ボーナスで埋めず ledger として残し、後続の季節雇用だけがこれを充足できる。

## 調査と再校正

### 調査単位

次を「地域・栽培様式・年代・単位」を伴うデータとして収集し、無出典の定数を置き換える。

| 対象 | 必要な値 | 優先資料 |
| --- | --- | --- |
| Wheat / Barley / Rye / Oats / legumes / roots | 生育日数、播種月、収穫月、作付間隔、播種・収穫・脱穀の労働日 | FAO Crop Calendar、農業史の荘園帳簿研究 |
| Grapes | 剪定、誘引、樹冠管理、収穫の月別労働日 | 大学 extension の作業暦、歴史的葡萄栽培資料 |
| Olives | 剪定、灌漑、収穫、搾油の月別労働日 | FAO、地中海農業史 |
| Apples / Pears / Plums / Figs / Lemons | 剪定、摘果、収穫、乾燥・保管の月別労働日と収穫窓 | Extension、一次的な園芸資料、農業史 |
| Sheep / Goats / Cattle / Horses / Camels | 日常世話、移牧、繁殖、搾乳、越冬飼料の労働日／頭 | 畜産 extension、牧畜史、既存の犬運用資料 |

FAO Crop Calendar は 100 以上の作物・50 以上の国について播種・収穫期を agroecological zone 別に提供しており、初期データ収集の入口として使う。[FAO Crop Calendar](https://cropcalendar.review.fao.org/) ただし近現代の作業時間を中世の絶対値へ無変換で流用しない。機械化、樹形、品種、雇用形態を資料ごとに記録し、初期時代（13世紀ごろの北西ヨーロッパ）との距離を明記する。

### 校正順序

1. まず作物ごとの月次重みと生育可能期間を校正する。年間生産量・人口支持力は変えない。
2. 次に主食の労働 30 日/ha を播種・維持・収穫・脱穀へ分解し、年次合計が既存の基準範囲を外れないことを確認する。
3. 永年作物の 16–26 日/ha を、収穫・剪定だけでなく管理・加工を含めて再評価する。Olives の 16 日/ha は暫定値であり、機械化された近代園地の数値を中世的園地の検証に転用しない。
4. 牧畜の頭数／牧夫を月次の世話日へ変換し、年間合計が既存の持続可能な頭数上限を不意に崩さないよう調整する。
5. 最後に、作物＋牧畜の月次合算と季節不足を校正する。生産量／労働者比は各産業の年間作業量の監査に使い、兼務率そのものの根拠にはしない。

## 実装フェーズ

1. **監査と純粋計算**: **実装済み（保存列以外）**。`SeasonRegionProfile`、`AgriculturalClimateZoneId`、`plantingCohort`、`cropCalendars.ts`、月次重み型を追加し、少数キーのキャッシュを実装した。北極から南極までの地図の UI 検証と診断フォールバック、保存列化は未実装である。
2. **主食の月次化**: **実装済み**。`FoodProduction.generateMonthlyLedger(month)` が毎月の収穫を投入し、旧3バケットを三か月帯として維持して9か月保存上限を互換維持する。旧 `getGlobalQuarterlyFoodWeights()` は旧呼出元と既存テスト用の互換 API として残るが、Food Ledger の新経路は参照しない。
3. **通常商品との統合**: **実装済み**。`getSeasonalFoodProductionMultiplier()` は名称互換を保ちつつ作物・永年作物の暦重みだけへ委譲する。家畜・魚・加工品に作物用秋ピークは掛からない。
4. **永年作物の暦と再校正**: **実装済み（初期値）**。`PerennialCropProfile.calendar` と月次の果樹労働日計算を追加した。史料に基づく品種・地域別再校正は継続課題である。
5. **牧畜と労働暦**: **実装済み（季節雇用を除く）**。`calculateAgriculturalLandProfile()` は主食の実作業日をセル×月で返し、Rural Occupation Allocator は主食・狩猟・漁撈・果樹・牧畜を同じ月次容量へ合算する。配分後の月次ピークから `farmLaborRequired`、`migratableAdults`、`ruralReleasePressure` を一度だけ再計算し、希望する全作業と残留成人との差を `seasonalLaborShortage` として残す。牧畜は通年世話の 80% と種別ごとの二つの季節イベントに 20% を置く初期暫定値であり、史料に基づく再校正は継続課題である。

季節雇用は本計画の後続依存計画とする。道路、距離、賃金、都市の余剰を使い、`seasonalShortage` を短期契約で埋める。その実装までは、不足を隠れた生産ボーナスで相殺しない。

## 受入条件とテスト

- 赤道をまたぐ有限地域の地図では、北部・赤道・南部の必要な `SeasonRegionProfile` だけが生成され、各セルは一つを参照する。`latT = 180` の世界では作物暦機能は有効化されず、診断と既存季節供給へのフォールバックが行われる。通常の世界生成・旧セーブの読み込みは妨げない。
- 赤道近傍の `tropical-irrigated-continuous` ゾーンで、温度・水分を満たす連続収穫 profile は 12 か月の重みが均等に近い。
- 同じ季節地域・同じ作物でも `cold-rainfed-single` / `temperate-rainfed-single` / `warm-irrigated-double` は異なる収穫窓を持ち、高緯度相当ゾーンは一回の収穫へ集中する。南部季節地域は北部と半年反転する。
- 水不足または低温のゾーンは、赤道近傍の地域でも通年収穫にならない。
- 灌漑された赤道地域で、profile がコホート栽培を許す短周期作物は、早植え・中植え・遅植えセルで収穫月がずれ、市場圏の合計供給は通年化する。これは現行商品に存在しない Rice/Paddy を前提にせず、純粋計算の fixture で検証する。雨水依存の同 profile にはこの保証を与えない。
- 二期作は、二つの生育周期と作付間隔を満たすセルだけで成立し、年間収量・水・種子・土壌・労働の全てを二重計上しない。
- 一年の月次生産重みの合計は、二期作を除き既存の年間出力と一致する。
- 食料価格は収穫直後に下がり、端境期に上がる。これは固定の価格補正ではなく在庫変動によって起きる。
- 果樹収穫と牧畜の日常世話が重なる月は同じ成人プールに加算される。繁忙期は `seasonalShortage > 0` を生む。
- Food Ledger、通常市場供給、Burg summary が同一セルの `seasonRegionId`・`zoneId`・`plantingCohort`・同一作物・同一月で同じ暦重みを使う。
- 月次ピークから得た `farmLaborRequired` を基に `migratableAdults` が一度だけ算出される。主食と果樹・牧畜が重なる月に、旧年次式と新月次式の双方で同じ成人を控除しない。
- 旧セーブをロードしても食料在庫、Goods ID、年次総生産が破損しない。

## 更新対象

- `docs/simulation/population-food-supply.md` §4.1–4.4: 既存の軽い四半期補正を暫定実装として明示し、`minimumFarmAdults`・`ruralReleasePressure`・`laborAffordableCultivatedArea` を月次ピーク由来の共通計算へ移す契約を記録する。
- `docs/simulation/seasons.md` §3: 全 food-tag 一律の秋曲線を暫定実装として明示し、作物暦へ統合する。
- `docs/plan/perennial-fruit-crops.md`: 年間果樹労働値が暫定であり、本計画で収穫・作業暦へ再校正することを追記する。
