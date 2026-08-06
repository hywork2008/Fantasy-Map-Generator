# バイオーム産品エコシステム再設計: 生産者数駆動モデル

## 0. 決定記録

**2026-08-06 設計開始**: 現行のバイオーム産品生産（`Fish`/`Game`/`Wine`/`Cattle`等）は、`stapleFood`（Grain）を除き、セル人口に一律の`biomeOutput`レートを掛けるだけで、実際にその産業へ従事する人数（狩猟者・漁業従事者・ブドウ農家）や、家畜・野生動物側の個体数上限をまったく参照していない。本書は、既存の`agriculturalLandUse.ts`（Grain向けに実装済みの「耕地面積×労働力カバレッジ」モデル）を参照実装として一般化し、狩猟・漁業・牧畜・ブドウ栽培に同様の「生産者数がボトルネックになる」モデルを導入する設計を記す。実装はまだ着手していない。

**2026-08-06 レビュー反映**: 初版へのフィードバックを反映し、以下を変更した。(1) 狩猟の年齢選択性の既定値を反転——`Hunting`文化こそ老齢個体を狙う技能を持つ選択的猟とし、無差別猟は文化を持たない・危機時（飢饉・戦時）の default 側にした（§4.4）。(2) 野生ストック（Game）と家畜ストック（liveAnimal）は、キャリング容量の決まり方が本質的に異なるため、たとえ計算構造（コホート・繁殖）を共有しても**別系統の容量計算**が必要と確認した。また愛玩・軍用など非食用の家畜は無尽蔵に増やせず、需要（買い手）にキャップされる（§4.2, §4.5）。(3) Wineは`Grapes`を独立した交易可能商品として新設し、生食・干しブドウ（保存食）・ワインの3用途に分岐する設計に変更した（§5.3）。(4) 狩猟の労働力配分は「上限まで割り当てる」貪欲最大化ではなく、**自給＋軽度の獣害対策で足りる程度の小規模な既定枠**として、他産業と競合する前に先取りする方式に変更した（§3.1, §5.1）。(5) ブドウ産品3系統の需要連動の再配分速度は、商品ごとの既存`trade.durability`値に反比例させ、保存の効くWineほど緩やかに調整する（§5.3, §9.4）。(6) 保存食（干物・干しブドウ等）の加工は、Ore→Ingotの`mineOperations.ts`/`smelterOperations.ts`分離と同じく、収穫労働力とは別の**加工労働力**を要求する2段階モデルに変更した（§5.2, §5.3, §9.5）。

**2026-08-06 Phase 1実装完了**: §8のPhase 1（農村労働配分器の導入＋狩猟自給枠・漁業・ブドウ栽培収穫段階の労働力ゲート化）を実装した。新規`src/extensions/economy/generators/ruralOccupationAllocation.ts`が`developmentPotential.ts`の`storeAgriculture()`（`generate()`/`updateAnnualAgriculture()`双方から呼ばれる）に組み込まれ、`migratableAdults`予算から狩猟自給枠→漁業/ブドウ栽培（`good.value`降順の貪欲配分）の順に労働力を割り当て、残余を`ruralReleasePressure`として`ruralLaborRelease.ts`に渡す（§2.2の三重取り問題を解消）。`production-utils.ts`の`getRuralProductionContributions()`はGame/Fish/Wineの3品目についてのみ、この配分結果（`getHuntingGameOutput`/`getFishingWorkerFactor`/`getViticultureWorkerFactor`）で既存レートをゲートするよう変更した。個体群/バイオマスストック（§4）・牧畜（§5.4）・Grapes新設（§5.3）はまだ未着手（Phase 2以降）。Fishの労働力は「Fishボーナス枠を持つセル（水域セルもあり得る）」に紐づき、水域セルの場合は隣接する陸セルへ均等按分する簡易モデルとした（隣接陸セルが複数あると同一水域枠の労働力予算が重複して見える簡略化が残る——校正はPhase 2以降）。定数（`HUNTING_POPULATION_SHARE`, `GAME_YIELD_PER_HUNTER_PER_MONTH`, `FISHING_WORKERS_PER_UNIT_OUTPUT`, `VITICULTURE_WORKERS_PER_UNIT_OUTPUT`等）はすべて仮置き（§9.3）。単体テスト`ruralOccupationAllocation.test.ts`で狩猟枠・ワークファクター・優先順位配分・Game出力が人口非依存であることを検証済み。既存テスト831件（economy拡張全体）は全て green、`tsc --noEmit`/`lint`/`madge --circular`もクリーン。

**2026-08-06 §10未決定事項への回答＋パフォーマンストグル要件を反映**: ユーザーから§10の5項目全てに回答があり、以下を決定事項として§9へ格上げした（詳細は各項目参照）。(1) §4.5`demandAbsorptionCapacity`は直近4四半期（1年分）の実績平均×バッファ係数1.2倍を基準とし、さらに「増やせる労働力の量」と「増やせる敷地/面積の量」の小さい方でキャップする——需要が急伸しても、労働力か土地のどちらか狭い方より速くは物理的に拡張できないという制約を明示した。(2) 狩猟自給枠の下限は**集落規模によらず一律3人**（既存の`HUNTING_FLOOR_POPULATION_THRESHOLD`によるサイズゲートは撤廃）、規模が大きい集落での比率は`manpower.ts`の`PEACE_TARGET_MOBILIZATION`（平時徴兵率1%）に倣い3%→1%へ変更——**この2点は既にPhase 1実装済みの`ruralOccupationAllocation.ts`の定数なので、ドキュメント確定と同時にコードも修正済み**（`HUNTING_MINIMUM_HEADCOUNT: 1→3`、`HUNTING_POPULATION_SHARE: 0.03→0.01`、`HUNTING_FLOOR_POPULATION_THRESHOLD`定数は削除、`ruralOccupationAllocation.test.ts`の該当4アサーションも追随して更新、テスト全green）。害獣のセル密度による枠の増減は、そうした密度指標が現状どこにも存在しないため、Phase 2以降の拡張点としてフックのみ残す。(3) 牧畜（§5.4）の面積・労働定数は史料からの概算・類推を優先し、良いデータが見つからない場合はPhase 3着手時に改めてユーザーと相談する。(4) 加工労働力（燻製・塩蔵・乾燥・醸造）のBurg雇用セクターは、新設`foodProcessing`セクター案を撤回し、既存`craft`セクターを再利用する——§6の記述を修正。醸造・製パンなどはキャラクターのスキル/熟練度に強く依存しうるが、厳密な生産計算式は求めず、既存の個体スキル熟練度パターン（`martialIndividualMastery.ts`と同型の民生版、または`guildKnowledgeTypes.ts`の`CRAFT_DOMAIN_BY_GOOD_NAME`が持つギルド技能ドメインの概念）をキャラクター背景・フレーバーとして接続できれば十分とする。(5) Wineのレシピに樽を追加する。**コードベース調査の結果、樽は`Barrels`という独立Goodとして既に実装済み**（`recipes: [{ Wood: 1 }]`、`guildKnowledgeTypes.ts`で`woodworking`ギルド技能ドメインに紐付け済み、`Beer`の`{ Grain: 1, Barrels: 1 }`等で既に消費されている）——つまり「樽職人・ギルドが成り立つか」を判定するまでもなく、現行実装は期間・文化を問わず樽職人（woodworkingギルド）を常に成立させている。よってWine（Phase 4/5で導入）のレシピは新規Good追加不要で`{ Grapes: X, Barrels: Y }`（Beerと同型）に決定し、「樽が成り立たない場合の`Grapes`+`Wood`直接レシピ」は、将来的に文化/時代別の樽ギルド不成立ケースを作る場合のみ使うフォールバックとして設計に残すに留める。

**2026-08-06 §5.2の事実誤認を訂正（ユーザー指摘）**: 「現行カタログに`Dried Fish`/`Salted Fish`に相当する商品は存在しない」という記述は誤りだった。実際には`Stockfish`（`recipes: [{ Fish: 1 }]`、干物・無塩、`tags: ["food", "preservative"]`）と`Preserved food`（`recipes: [{ Fish: 1, Salt: 1 }, { Fish: 1, Vinegar: 0.5 }, { Fish: 1, Wood: 1 }, ...]`、塩漬け/酢漬け/燻製に相当し`Game`/`Cattle`/`Sheep`/`Pig`等も原料に取れる、`icon: "good-salted-fish"`）の両方が既に実装済みで、いずれもFishを原料とする保存食そのものである。新規Good追加は不要。さらに調査の結果、これらのような`recipes`を持つGood（`Barrels`/`Beer`/`Stockfish`/`Preserved food`等）は、`production-generator.ts`の汎用`runWorkerLoop`が生産サイクル毎にBurg人口をどれだけ製造へ割り当てるかを既に決めており、`craftEmployment.ts`はその観測値を`基本雇用需要`用に平滑化しているだけと判明した。つまり「収穫＝rural／加工＝Burg雇用プール」の二段構成そのものは、`mineOperations.ts`/`smelterOperations.ts`型の**新規`requiredWorkers`ゲートを発明するまでもなく**、レシピを持つGood全般に対してこの既存の汎用生産ループが既に担っている。§5.2・§5.3・§9.5の「専用の加工労働力を要求する二段構成」という記述は、新規メカニズムの発明ではなく、**新しいレシピ（`Wine: { Grapes, Barrels }`、`Raisins: { Grapes }`）を登録するだけで既存の汎用パイプラインに乗る**、という意味に修正した。Phase 4のスコープはこれにより大幅に縮小し、正味「新規Good`Grapes`・`Raisins`の追加とWineのレシピ切替」のみが残る（Fish→保存食は追加実装ゼロで既に完成している）。§5.2/§5.3/§9/§8のPhase 4行を修正した。

**モデル詳細度トグル（Options → Generation）**: 「Phase 2以降は処理が重くなりうるため、簡素化モデル（または現行の古いモデル）をUIから選択可能にし、新モデルを既定にしたい」という要件を受け、新設オプション`ruralEcosystemDetail: "detailed" | "simplified"`（既定`"detailed"`）を`useOptionsState`に追加し、`GenerationSettingsTab.tsx`に`biomeRegionProfile`/`enclosureCalculationMode`と同型の`<select>`＋`LockIconButton`行として配置する設計とした（詳細は新設§11）。Phase 1の配分器自体はセル数に対して線形の軽い処理のため常時有効のままとし、トグルが実際に効くのはPhase 2で導入するfauna個体群ストック（コホート・繁殖・年齢選択性間引き、種×セルのスパース状態を持つ）以降の重い計算——`"simplified"`選択時はコホート更新をスキップし、Game/liveAnimalはPhase 1同等の「労働力充足率でゲートされた無上限レート」のまま据え置く（個体群上限なし＝実質的に旧モデルに近い挙動）。トグル自体の導入はPhase 2実装時に行う（本書更新時点ではまだ未実装）。

**2026-08-06 Phase 2実装完了**: §8のPhase 2（fauna個体群ストックモデル・モデル詳細度トグル）を実装した。新規`src/extensions/economy/generators/faunaPopulation.ts`が、野生（Game）・家畜（liveAnimal 9種）双方に対し3コホート（young/breeding/old、**性別区分は省略**——§4.1が許容する簡略化）のスパース個体群ストック（`simulation.extensions.economy.faunaStock`、キー`cellId:speciesKey`）を持たせ、`ruralOccupationAllocation.ts`の`getHuntingGameOutput()`と`production-utils.ts`の`getRuralProductionContributions()`（liveAnimalタグ分岐を追加）の両方から、既存の「労働力/レートで決まる希望産出量」を`drawWildFaunaOfftake()`/`drawDomesticatedFaunaOfftake()`で在庫上限にキャップするよう変更した。`options.ruralEcosystemDetail`（`GenerationSettingsTab.tsx`に「6. Rural economy」節として追加、`main.ts`が生成時に`worldContext.options`へミラー）が`"simplified"`のときはこれらの関数が希望量をそのまま素通しする純粋なパススルーになり、在庫テーブルには一切触れない（§11.2の「トグルを切り替えただけでは数値が動かない」保証どおり）。年次コホート更新（繁殖・加齢遷移、ロジスティック増殖でキャリング容量にキャップ）は`updateAnnualFaunaCohorts()`が独自の年次ガード（`getFaunaPopulationLastSettledYear`、`updateAnnualAgriculture`とは別系統）付きで担い、`index.tsx`の`economy.tick`内で`DevelopmentPotential.updateAnnualAgriculture()`の直後に呼ぶ。非食用種（Cats/Horses/Camels/Elephants）の需要吸収キャップ（§4.5）は、四半期ごとに`recordQuarterlyNonFoodDemand()`が各Marketの在庫を前回四半期末スナップショットと比較し「純減少分＝消費量」を直近4件ローリングし、その平均×1.2倍を上限とする——四半期の食料台帳更新（`FoodProduction.generateQuarterlyLedger`）と同じサイクルに乗せた。**実装時に確定した簡略化点（設計からの逸脱、いずれも将来の精緻化余地として残す）**: (1) 家畜のキャリング容量は`husbandry.ts`（Phase 3）がまだ存在しないため、暫定的に「Phase 1時点の無制限フラットレート×24ヶ月分」を代理指標として使用——Phase 3実装時に牧草地/労働力ベースの値へ置き換える。(2) §4.5の需要吸収キャップは、本来は牧場ごとの按分配分を想定していたが、実装ではMarket単位の上限値をそのMarketに属する全セルへそのまま（按分せず）適用する簡略化とした——各セル単独ではMarket全体の上限まで到達しうる分だけ保守的（キャップが緩め）だが、Market単位の集計パスを1本追加する複雑さを避けた。(3) 種ごとの繁殖率/世代年数定数（`SPECIES_PROFILES`）は史料ベースではなく相対順序（Chicken>>Elephants等）のみを根拠にした仮置き——§9.3の既存placeholder方針を踏襲。狩猟/家畜の年齢選択性（§4.4）は文化タイプ（`Hunting`文化→選択的強）と`foodStressProductionMultiplier`（危機時→無差別寄り）から連続値で導出し、`applyCull()`が老齢優先ドローと比例ドローを線形ブレンドする。`agriculturalLandUse.ts`から`calculatePhysicalAreaHectares()`を抽出・エクスポートし、`calculateCultivableAreaHectares()`とwildHabitatArea計算の両方が同じ物理面積の起点を共有するようにした。新規単体テスト`faunaPopulation.test.ts`（36件）でキャリング容量・在庫の枯渇/据え置き・選択性の文化/危機依存・需要キャップ・年次コホート更新の据え置きガードと縮小時のダイオフ・トグルのパススルー保証を検証済み。既存`ruralOccupationAllocation.test.ts`の「Game出力は人口非依存」テストは、fauna在庫モデルが要求する`cells.area`/`distanceScale`フィクスチャを持たないため`ruralEcosystemDetail: "simplified"`を明示指定して労働力式のみを引き続き検証する形に変更した（Phase 1の意図どおりの回帰対象を維持）。既存テスト854件（economy拡張全体）は全てgreen、`tsc --noEmit`（テストファイル含む一時tsconfigでも確認）/`lint`/`madge --circular`/`npm run build`もすべてクリーン。牧畜（§5.4、Phase 3）・Grapes新設（§5.3、Phase 4）は引き続き未着手。

**2026-08-06 牧羊犬の調査＋`Dogs`Good登録**: Phase 3（`husbandry.ts`、牧夫1人あたり許容頭数の定数化）着手に向けた事前調査として、ユーザー提供の`docs/temp/herding-dogs.md`（シドニー大学 Arnott et al., 2014 の使役犬研究——ハンドラー1人＋牧羊犬で最大羊2,000頭/牛500頭を牧畜可能、ROI 5.2倍）を精査し、§5.4へ引用・反映した（牧羊犬**あり**時の頭数上限乗数の裏付けにはなるが、乗数を掛ける前の**ベースライン**頭数は依然史料が必要——§10.3の未決定は範囲を絞って残存）。この調査結果を踏まえ、`goods-generator.ts`へ新規Good`Dogs`（`tags: ["liveAnimal", "herding"]`、非食用、Catsと同型の交易プロファイル、`biomeOutputByTag`で牧畜バイオームに紐付け）を追加した。既存の`liveAnimal`＋非食用種向け汎用パイプライン（`faunaPopulation.ts`のfaunaストック・非食用需要キャップ）へ自動的に接続されるため、`SPECIES_PROFILES`への1エントリ追加以外のPhase 2側コード変更は不要だった。既存セーブ向けに`migrateLiveDogsGood()`（`migrateLiveCatsGood()`と同型、`index.tsx`の3箇所の移行呼び出し地点すべてに配線）も追加した。`husbandry.ts`本体（牧夫1人あたり頭数への`Dogs`頭数の乗数適用）はまだ未着手——Catsの`pestControl`タグと同じく「将来の消費者を待つ」段階。番犬・闘犬などの亜種Goodは本ターンでは追加していない（需要/生産性への効き方が異なるため、必要になった時点で別Goodとして検討）。新規単体テスト2件（`goods-generator.test.ts`：Dogsのカタログ定義・移行関数）を追加し、economy拡張全体856件（854+2）が全てgreen、`tsc --noEmit`（テストファイル込みでも確認）/`lint`/`madge --circular`もクリーン。

---

## 1. 目的

- バイオーム産品の生産量を、セル人口の一律レートではなく、**その産業に実際に従事している人数**（農業従事者・狩猟者・漁業従事者・ブドウ農家）で決める。
- `liveAnimal`タグの家畜（Cattle, Horses, Sheep, Goats, Pig, Chicken, Camels, Elephants, Cats）に、Burgの人口動態（`maleAdults`/`femaleAdults`/`children`/`elders`）と同型の年代構造を持つ「個体群ストック」を各セルに持たせ、繁殖による自然増加と、狩り方（老齢選択 vs 無差別/若齢選択）による将来世代への影響をモデル化する。
- Wine（ワイン）を、ブドウ農家数・作付面積・ワイン化率の3要素から決まる生産物として再設計する。
- バイオーム産品と、同じセル（または後背地）にあるBurgの労働者数・種別を接続する。

## 2. 現状分析

### 2.1 現行の生産経路（3種類が無調整で併存）

| 経路 | 対象 | 計算式 | 実装 |
| :--- | :--- | :--- | :--- |
| **Staple food（穀物）** | Grain | 耕地面積×気候収量×`labourCoverage`(必要労働力に対する充足率) | [`agriculturalLandUse.ts`](../../src/extensions/economy/generators/agriculturalLandUse.ts), [`foodProduction.ts:320-340`](../../src/extensions/economy/generators/foodProduction.ts#L320-L340) |
| **Biome continuous（連続バイオーム産品）** | Cattle, Wine, Game, Honey, Olives, Salt(biomeOutput) 等 | `population(cell) × biomeOutput(biome,good) × getModifiers()` | [`production-utils.ts:125-152`](../../src/extensions/economy/generators/production-utils.ts#L125-L152)（`getRuralProductionContributions`） |
| **Bonus good（点資源）** | Fish, Iron等の`distribution`+`chance`で配置される資源セル | `min(population × 0.25, 5) × getModifiers()` | 同上、`BONUS_RURAL_PRODUCTION`/`MAX_BONUS_PRODUCTION` |

`liveAnimal`タグの商品は上記「Biome continuous」経路そのままで、その後に[`liveAnimalCatch.ts`](../../src/extensions/economy/generators/liveAnimalCatch.ts)（`rollLiveAnimalCatch`）が「連続レート → 確率的な整数捕獲」への変換を行う。**しかし変換元のレート自体は無限に湧き続ける定数であり、個体群ストックや上限は一切存在しない。** 捕りすぎても翌月以降のレートは変わらない。

`Fish`は`biomeOutput`/`biomeOutputByTag`を持たず（[`goods-generator.ts:258-269`](../../src/extensions/economy/generators/goods-generator.ts#L258-L269)）、Bonus good経路のみで生産される。つまり漁業従事者どころか、周辺セルの人口規模にすら比例していない（上限5/月で頭打ち）。

### 2.2 労働力の二重取り問題

[`agriculturalLandUse.ts`](../../src/extensions/economy/generators/agriculturalLandUse.ts)は`cells.maleAdults`/`femaleAdults`からGrain農業に必要な労働力（`farmLaborRequired`）を引き、余剰を`migratableAdults`/`ruralReleasePressure`として算出する。この余剰は[`ruralLaborRelease.ts`](../../src/extensions/economy/generators/ruralLaborRelease.ts)によって**そのままBurgへの移住キューに渡される**（`UrbanLaborIntake.enqueueRuralDisplacement`）。

一方、`getRuralProductionContributions()`（Cattle/Wine/Game/Honey等の生産）は同じセルの`getRuralCellPopulation()`（＝`cells.pop`、Grain労働力を差し引いていない生の人口）をそのまま使う。

つまり現状は「Grain農業に必要な人口」「都市へ出て行ける余剰人口」「Cattle/Wine/Gameを満額生産する人口」の3つが、同じ人口プールに対して独立かつ無調整に全量ずつクレームしている。本設計はこの三重取りを解消し、単一の農村労働配分器を通す。

### 2.3 Burg雇用構成との断絶

[`burgEmploymentComposition.ts`](../../src/extensions/economy/generators/burgEmploymentComposition.ts)は`administration`/`mining`/`smelting`/`quarrying`/`construction`/`trade`/`strategicIndustry`/`craft`の8セクターを集計するが、農業・狩猟・漁業・牧畜・ブドウ栽培はどれも含まれない（Grainの農業労働力ですら現状ここには出てこない）。これは`burgEmploymentComposition`がBurg人口を対象にし、`agriculturalLandUse`はセル人口（`cells.pop`、Burg人口とは別勘定）を対象にしているためで、設計上の断絶ではなく対象が違うだけである。ただしユーザーの要望（「バイオームと同セルの都市の労働者の数や種類と密接に関係する」）を満たすには、この2つの人口プールを明示的に橋渡しする必要がある（§6）。

### 2.4 再利用できる既存パターン

[`mineOperations.ts`](../../src/extensions/economy/generators/mineOperations.ts)の`getMineRequiredWorkers()` / `workerFactor = min(1, workers / required)`が、「必要労働力に対する充足率で生産量をゲートする」という、本設計が狩猟・漁業・ブドウ栽培へ横展開したいパターンそのものである。Grainの`farmLaborRequired`/`labourCoverage`（[`foodProduction.ts:328-334`](../../src/extensions/economy/generators/foodProduction.ts#L328-L334)）も同型。**新規実装ではなく、この既存パターンの一般化として設計する。**

---

## 3. 共通アーキテクチャ: 農村労働配分器（Rural Occupation Allocator）

新規モジュール `ruralOccupationAllocation.ts`（`agriculturalLandUse.ts`・`ruralLaborRelease.ts`と同階層）を導入し、セルごとの成人労働力を以下の優先順位で割り当てる。

1. **Staple food（Grain）** — 既存`agriculturalLandUse.ts`の`farmLaborRequired`をそのまま最優先クレームとして扱う（変更なし。自給が最優先という現行方針を維持）。
2. **狩猟の自給枠（baseline subsistence claim）** — 市場最大化ではなく、後述§5.1の「小規模・固定的な既定枠」を、他の二次産業より先に少量だけ取り分ける。
3. **市場向け二次産業（漁業・牧畜・ブドウ栽培）** — 残り（現行の`migratableAdults`/`ruralReleasePressure`相当から狩猟自給枠を差し引いた分）を予算として、各セルのバイオームで利用可能な産業に配分する。
4. **都市への移住** — どの産業にも割り当てられなかった残余のみを、従来どおり`ruralLaborRelease.ts`経由でBurgへ解放する。

### 3.1 配分ロジック（初版・簡易モデル）

**狩猟だけは他産業と競合しない。** §5.1の理由により、狩猟は「そのセルの人口が自活でき、かつ軽度の獣害対策になる」水準の小さな固定枠を、二次産業の貪欲配分ループの**前に**先取りする。上限まで割り当てる対象ではない。

残りの市場向け二次産業（漁業・牧畜・ブドウ栽培）は「そのセルで開放できる上限労働力」（`requiredWorkersForFullCapacity`、§4〜§5参照）を持つ。配分器はその残余労働力を、各産業の**単位労働力あたりの期待価値**（`good.value × 生産性`）が高い順に、上限まで貪欲に割り当てる（線形計画法のような最適化はしない。まずはmineOperations式のシンプルな充足率モデルで十分）。

```text
残余労働力 = migratableAdults[cell]                       // Grain分を既に差し引き済み
huntingAssigned[cell] = getHuntingSubsistenceClaim(cell)   // §5.1、上限配分ではなく固定的な既定枠
残余労働力 -= huntingAssigned[cell]

for occupation in [fishing, viticulture, husbandry] を価値降順:  // 狩猟はここに含めない
  cap = occupation.requiredWorkersForFullCapacity(cell)
  assigned = min(残余労働力, cap)
  occupation.assignedWorkers[cell] = assigned
  残余労働力 -= assigned
ruralReleasePressure[cell] = 残余労働力  // ruralLaborRelease.tsが消費
```

セルにその産業の資源が存在しない場合（例: 海に面さないセルの漁業）は`cap = 0`（狩猟の場合は自給枠も0）となり自動的にスキップされる。

### 3.2 更新頻度

既存の`getRuralPopulationSnapshotPeriod()`（四半期キャッシュ、[`markets-generator.ts:568-572`](../../src/extensions/economy/generators/markets-generator.ts#L568-L572)）と同じ四半期キャデンスに乗せる。`agriculturalLandUse`の年次再計算とも整合させ、二重の鮮度管理を増やさない。

---

## 4. 家畜・野生動物の個体群ストックモデル（`faunaPopulation.ts`）

Gameの野生ストックと`liveAnimal`家畜が、コホート構造・繁殖・間引きという**計算構造は共有**しつつ、キャリング容量（個体数上限）の決まり方は**野生／家畜で別系統**とする（§4.2）。「バイオームの100%が農地・牧草地・市街地として開発済みでない限り、野生動物は必ず一定数存在できる」というのが両者を分ける理由で、家畜の頭数は農地と同じく人間の労働力・土地配分の産物だが、野生動物の頭数は人間が手を付けていない残地の広さで決まる、という別々の因果を持つため。

### 4.1 状態表現

Burgの人口動態（`children`/`maleAdults`/`femaleAdults`/`elders`の4区分、[`hostCore`](../../src/extensions/hostCore.ts)の`getCellDemographics`/`setCellDemographics`参照）に倣い、**3コホート**（`young`未成熟 / `breeding`繁殖適齢 / `old`高齢）×性別を持たせる。人間ほどの粒度は不要なので雌雄別の内訳は種によって省略可（多くの家畜は雌雄比が繁殖率に直結するため維持、Gameの野生ストックは総数のみでも可）。

全セル×全`liveAnimal`種・Gameで密な配列を持つと動物種の大半は生息しないセルがほとんどのため無駄が大きい。[`liveAnimalCatchAccumulators`](../../src/extensions/economy/generators/liveAnimalCatch.ts)と同じ**疎なマップ**（キー`cellId:goodId`）を`simulation.extensions.economy.faunaStock`に持たせる方式を推奨する。Gameは`liveAnimal`タグを持たない解体済み食肉（`wain`単位）として流通する現行仕様を維持するため、ストック自体は`goodId`ではなく`biomeCode`などの野生種別キーで持ち、狩猟時に`wain`単位へ変換する。

### 4.2 キャリング容量（個体数上限）— 野生と家畜で別計算

- **野生ストック（Game）**: `wildHabitatArea(cell) = cellArea − cultivatedArea(cell)[Grain, agriculturalLandUse.ts] − vineyardArea(cell)[§5.3] − 牧草地面積(cell)[§4.5/husbandry] − Burg市街地面積`。既存の`calculateCultivableAreaHectares()`系の面積会計をそのまま再利用し、**すでに他用途に割り当てられている面積を差し引いた残地**が野生動物の生息地になる。`carryingCapacity = biomeBaseDensity(biome) × wildHabitatArea`。開発面積がcellArea近くまで迫らない限り、`wildHabitatArea`は0にならない——ユーザー指示どおり「100%開発済みでない限り野生個体群は残る」という条件を、既存の面積会計から導出できる形にした。
- **家畜ストック（liveAnimal）**: 野生の残地とは無関係に、**牧畜労働力×牧草地/飼料配分**（§4.5・§5.4で新設する`husbandry`占有）で決まる。人間が土地と労働を投じるほど頭数上限が上がる、通常の農業生産と同じ因果。

両者は同じロジスティック増殖式（下記4.3）を使うが、`carryingCapacity`の算出元だけが異なる、という設計にする。

### 4.3 繁殖・上限

年次（既存の年次バッチ、`DevelopmentPotential.updateAnnualAgriculture()`相当のタイミング）で:

- `breeding`コホートが、種ごとの繁殖率（Chickenのように速いものからElephantsのように極端に遅いものまで種ごとに大差があるため、**種別定数**が必要。既存`biomeOutputByTag`のレート感を流用して初期値を決める）で`young`を新規生産する。
- 生産量は§4.2の`carryingCapacity`に対するロジスティック増殖（個体数が上限に近づくほど増加率が逓減）でキャップする。
- `young → breeding → old`への遷移は種ごとの世代年数定数で進む。

### 4.4 間引き（狩猟・屠畜）と年齢選択性

月次の`rollLiveAnimalCatch()`が返す「今月の捕獲数owed」を、**どのコホートから引き落とすか**というポリシーで処理する:

- **選択的（老齢個体優先）**: `old`から優先的に引き落とし、不足時のみ`breeding`へ波及。`young`は最後の手段。→ 翌年の出生数（`breeding`頭数）にほぼ影響しない。
- **無差別（世代を問わず狩る、または若齢優先）**: 全コホートから頭数比例で引き落とす、または`young`優先。→ `breeding`が削れるため翌年の出生数が減り、複数年蓄積するとその土地の個体群が先細る。

**ポリシーの既定値（訂正済み）**: `Hunting`文化は老齢個体を狙う技能・伝統を持つ狩猟の専門家集団であり、**選択的**側に倒す。無差別側は、狩猟を専業としない一般文化圏や、`foodStressProductionMultiplier`が示す危機状態（飢饉・戦時、既存の食料ストレス指標をそのまま再利用できる）で、生存優先の乱獲に傾く、という既定値にする。家畜（liveAnimal・畜産管理下）は通常、日常の畜産運用として選択的側が既定。

```text
selectivity(cell) =
  Hunting文化圏                        → 選択的（強）
  一般文化圏、平時                     → 選択的寄り（中）
  一般文化圏、foodStress有り（飢饉・戦時） → 無差別寄り（弱〜中、危機の深刻度に比例）
```

この重み付けは、将来的な狩猟スキル/施設投資（`individualSkillMastery.ts`系の技能システムとの接続）への拡張点として設計するが、初版では上記の固定テーブルで開始してよい。

`rollLiveAnimalCatch`への入力`expectedAmount`自体も、**在庫が尽きていれば0でキャップ**する必要がある（現行は無限湧き）。`expectedAmount = min(desiredOfftake, harvestableStock)`という形に改修する。

### 4.5 非食用家畜（愛玩・軍用・輸送用）の需要キャップ

`liveAnimal`のうち`food`タグを持たない種（Cats=`pestControl`、Horses/Elephants/Camels=`supply`/`military`、[goods-generator.ts:357-413](../../src/extensions/economy/generators/goods-generator.ts#L357-L413), [:1620-1630](../../src/extensions/economy/generators/goods-generator.ts#L1620-L1630)参照）は、Cattle/Sheep/Goats/Pig/Chickenのような食肉種と異なり「常に広い需要（食料需要）が存在する」という前提が成り立たない。猫を際限なく繁殖させても、買い手（`demandCoverage.utilities`/駆除ニーズ）がいなければ市場価値がない。

このため非食用種は、§4.2の`carryingCapacity`にもう一段**需要吸収キャップ**を掛ける:

```text
effectiveCarryingCapacity(cell, good) =
  good.tags.includes("food")
    ? husbandryCapacity(cell, good)                                   // 食用種はこれだけ
    : min(husbandryCapacity(cell, good), demandAbsorptionCapacity(good))  // 非食用種は需要でも制約
```

`demandAbsorptionCapacity(good)`は、既存のMarket在庫・販売実績（`market.goods[goodId]`の在庫推移）から**直近4四半期（1年分）の実売れ行きの平均×バッファ係数1.2倍**を基準値として導出する（§10.1で確定）。新規の状態を増やさず、既存のMarket在庫トレンドを読むだけで済む設計を維持する。実需要を上回る供給は、繁殖を鈍化させる（`young`世代の生産数を絞る）形でフィードバックする——「倉庫に売れない猫が積み上がる」ような状態を避ける。

さらに、この基準値そのものが急伸しても、`effectiveCarryingCapacity`は**「増やせる労働力の量」と「増やせる敷地/牧草地面積の量」のうち小さい方**を上回って拡張できない（§10.1で確定）。需要が一年で倍になっても、牧夫を今期中に倍増できなければ、あるいは牧草地をその分広げられなければ、頭数上限はどちらか狭い方の制約で頭打ちになる、という物理的整合性を持たせる。

---

## 5. 各産業モデル

### 5.1 狩猟 → Game（`huntingGrounds.ts`）

**狩猟は「市場向け商品を最大生産する産業」ではなく、「農村になんとなく常に少数いる、自給＋獣害対策の担い手」としてモデル化する。** 熊・猪・鹿などが畑や家畜、人を襲う害を継続的に抑える役目も兼ねるため、専業でなくとも、ある程度の人口規模を超えた農村セルにはほぼ必ず少数の猟師がいる、という想定にする。§3.1のとおり他産業と競合する貪欲配分の対象にしない。

- 対象: `biomeTag("forest")`セル（現行`Game`の`distribution`と同じ判定を流用）。
- **自給枠**: `getHuntingSubsistenceClaim(cell)` — 「その人数が自分（＋近い家族）を養える程度」を基準にした小さな固定枠。`min(availableForestAdults, max(HUNTING_MINIMUM_HEADCOUNT, forestAdults × HUNTING_POPULATION_SHARE))`という式で、**下限は集落規模によらず一律3人**、規模が大きくなった集落では`manpower.ts`の平時徴兵率（`PEACE_TARGET_MOBILIZATION`＝1%）に倣った約1%が効いてくる（§10.2で確定、Phase 1実装済み）。市場最大化のための`requiredWorkersForFullCapacity`のような「フル稼働に必要な人数」という上限概念は使わない。害獣（獣害）のセル密度に応じて枠を増減させる拡張は、そうした密度指標がまだ存在しないためフックのみ残し、実装はしない。
- ストック: §4のfauna個体群モデル（野生ストック側、§4.2の`wildHabitatArea`ベースのキャリング容量）を適用する。
- 月産出（`wain`単位の食肉、現行同様に`liveAnimal`タグは付与しない＝生体ではなく解体済み食肉として流通）は、自給枠の猟師数×一人あたり持続可能捕獲量（在庫が少なければそれ以下）。市場供給量が少なめでも仕様どおり——狩猟はもともと市場向け主力商品ではない。
- **既存の脅威駆除システムとの関係**: [`threatCullHire.ts`](../../src/extensions/economy/generators/threatCullHire.ts)/[`cullPractice.ts`](../../src/extensions/economy/generators/cullPractice.ts)は、named Characterが個別の脅威（危険な獣・モンスター）討伐依頼に応じる**別系統**の仕組み（[`docs/plan/player-threat-cull-jobs.md`](player-threat-cull-jobs.md)）。本設計の狩猟自給枠は、そうした特定脅威イベントとは独立した、恒常的な背景労働力の統計値であり、混同しない。将来、狩猟自給枠の存在が獣害イベントの発生率を下げる、といった軽い接続は拡張候補として残すが、本設計のスコープ外とする。

### 5.2 漁業 → Fish・保存食（`fishingGrounds.ts` + 加工工程）

漁業はGrain/Wine同様、収穫（漁獲）労働力で市場向け供給量を決める通常の二次産業として扱う（狩猟のような自給枠限定にはしない——ユーザー原文が漁業には労働力の量そのものを産出の決め手として挙げているため）。

- 対象: 現行`Fish`の`distribution`（`nearshoreHabitat`/`shore(-1)`海洋・淡水・汽水セル）。
- ストック: 家畜ほど厳密な年齢構造は不要（ユーザー原文も漁業には年齢選択性を求めていない）。**連続バイオマスのロジスティック成長モデル**（在庫が上限に近づくほど増加が鈍る、一つの数値で十分）を採用する。
- `getFishingRequiredWorkers(stock)`で必要漁業従事者数を算出、`workerFactor`で月産出をゲートする（§3.1の貪欲配分ループに参加する通常の二次産業）。
- **不漁・豊漁**: ユーザー指示どおり本設計では確定させない。フックだけ用意する（例: `getCatchLuckMultiplier(cellId, month)`、既定値1.0）。将来、海況・海流データ（[`docs/simulation/ocean-currents.md`](../simulation/ocean-currents.md)）や年ごとの乱数ウォークに接続する。
- **保存食（干物・塩漬け魚）— 既に実装済み、新規作業ゼロ**（2026-08-06訂正、ユーザー指摘）: `Stockfish`（`recipes: [{ Fish: 1 }]`、無塩の干物）と`Preserved food`（`recipes: [{ Fish: 1, Salt: 1 }, { Fish: 1, Vinegar: 0.5 }, { Fish: 1, Wood: 1 }, ...]`、塩漬け/酢漬け/燻製、`Game`等の他原料も可）が両方とも既存カタログに実装済みで、新規Good追加は不要。
- **加工労働力は既存の汎用パイプラインが既に担っている**: `recipes`を持つGood全般（`Barrels`/`Beer`/`Stockfish`/`Preserved food`等）は、`production-generator.ts`の`runWorkerLoop`が生産サイクル毎にBurg人口を製造へ割り当て、`craftEmployment.ts`がその観測値を雇用需要へ平滑化する、という既存の汎用機構で既にBurg側の労働力ゲートがかかっている（§10.4で`craft`セクターに紐付けると確定した理由でもある）。よって「漁獲（rural、漁業従事者、§3.1で配分済み）」と「加工（Burg、`craft`セクター）」の二段構成は、`mineOperations.ts`/`smelterOperations.ts`型の**新しい`requiredWorkers`ゲートを発明する必要はなく**、Fish→Stockfish/Preserved foodは何もしなくても既に完成している。Phase 4でこの節に関して行うべき実装は実質ゼロ。

### 5.3 ブドウ栽培 → Grapes・干しブドウ・Wine（`viticulture.ts` + 加工工程）

`agriculturalLandUse.ts`と同じ構造をブドウ栽培用に複製・調整する（コピーではなく、地形適性ロジックなど共通化できる部分は関数抽出を検討）。**確定**: ブドウ（`Grapes`）は独立した交易可能な新規Goodとして新設し、地元で生食される分・干しブドウ（保存食）に加工される分・ワインに加工される分の3方向へ分岐する（§9.2で確定、旧版の「Wineへの直接変換のみ」案は撤回）。

**収穫段階（rural harvest labor、農村労働配分器で漁業・牧畜と競合）**:

- `vineyardCultivableArea(cell)`: 現行`Wine`の`distribution`（`biome(6)`地中海性など/`scrub`/`arable`+川沿い）を土地適性判定に転用。`calculateCultivableAreaHectares()`と同型だがブドウ向けの上限係数（Grainより狭い、稀少な土地利用という前提）を使う。§4.2の野生キャリング容量計算は、この`vineyardArea`も開発済み面積として差し引く。
- `grapeYieldPerArea` / `grapeFarmersRequired`: Grainの`yieldPerArea`/`farmLaborRequired`と同型だが、単位労働あたりの必要労働日数はGrainより低くてよい（果樹は年間労働がGrainほど集中しない）。
- 収穫量 = `vineyardArea × grapeYieldPerArea × workerFactor(grapeFarmersRequired)`。この量が新設`Grapes`（`tags: ["food"]`、生鮮品）の産出になる——**生食分はここで市場に出る分**そのもの（追加の加工不要）。

**加工段階（Burg側、`craft`セクター経由の既存レシピ生産パイプラインに乗せるだけ）**:

- 収穫された`Grapes`のうち、生食に回さない分を、干しブドウ（`Raisins`、新規Good、保存食）とワイン（`Wine`、既存Good、レシピを新設）へ**需要に応じて**振り分ける（§9.4、下記）。どちらも`recipes: { Grapes: X }`（Wineはさらに`Barrels: Y`、§10.5）を持つ新規/更新レシピとして登録するだけでよい——§5.2訂正のとおり、レシピ消費の労働力ゲート自体は`production-generator.ts`の`runWorkerLoop`（`craft`セクター、§10.4）が既に汎用的に担っており、Fish→保存食と同型の新しい二段構成コードを別途書く必要はない。
- **3方向配分の需要連動と速度**（§9.4確定）: 生食・`Raisins`・`Wine`の配分比率は、各商品の直近需要（Marketの在庫消化・価格トレンド）に応じて再計算するが、**再配分の速度を各商品の既存`good.trade.durability`値に反比例させる**——生鮮`Grapes`（低耐久）は需要変化に即座に追従、`Raisins`（中耐久）はやや緩やか、`Wine`（高耐久・貯蔵可能）は最も緩やか（例: 四半期ごとの配分比率変化に上限を設ける、または長い半減期のEMAで均す）。これは既存のGoodカタログが持つ`trade.durability`/`timeValueTrend`フィールドをそのまま再利用でき、Wine専用の新しい定数を増やさずに済む。腐りやすい生鮮品は毎期売り切る必要があるため配分を素早く調整し、貯蔵の効くワインは在庫が需要の緩衝材になるため急な価格変動に振り回されない、という直感と一致する。
- **樽（確定、§10.5）**: `Wine`のレシピに樽を追加する。コードベース調査の結果、樽は既に`Barrels`という独立Good（`recipes: [{ Wood: 1 }]`、`guildKnowledgeTypes.ts`で`woodworking`ギルド技能ドメインに紐付け、`Beer`の`{ Grain: 1, Barrels: 1 }`等で既に消費されている）として実装済みで、期間・文化を問わず常に成立する前提で動いている——「樽職人・ギルドが史料上成り立つか」を新たに判定するまでもなく、現行実装がすでにその答え（成り立つ）を出している。よって新規Good追加は不要で、`Wine`のレシピは`Beer`と同型の`{ Grapes: X, Barrels: Y }`に決定する。「樽が成り立たない場合の`Grapes`+`Wood`直接レシピ」は、将来的に特定の文化・時代設定で樽ギルドが不成立になるケースを作る場合のみ使うフォールバックとして設計に残す（現時点では未使用）。

### 5.4 牧畜 → liveAnimal家畜のキャリング容量（`husbandry.ts`、新規）

§4.2で家畜ストックのキャリング容量が「牧畜労働力×牧草地/飼料配分」で決まるとしたことに対応する、新設の二次産業。ブドウ栽培・漁業と同じ§3.1の貪欲配分ループに参加する。詳細な面積・労働定数はGrain/ブドウと同型のため、Phase 3着手時に個別設計する（本書では占位置のみ確定）。**確定（§10.3）**: 具体的な定数（牧草地の土地適性係数、牧夫1人あたり許容頭数など）は、可能な限り史料（中世牧畜の反当たり許容頭数、牧夫1人あたり管理可能頭数の記録等）から大まかに算出・類推する。十分な裏付けデータが見つからない場合は仮置きで進めず、Phase 3着手時に改めてユーザーへ相談する。

**牧羊犬による牧夫1人あたり許容頭数の乗数（2026-08-06調査、`docs/temp/herding-dogs.md`）**: シドニー大学の研究（Arnott et al., 2014、豪州800農場・4,000頭以上の使役犬を対象）は、訓練された牧羊犬を伴うハンドラー1人が最大2,000頭の羊、または500頭の牛を牧畜できると報告している——これは常勤の牧夫少なくとも1人分の労働力に相当する（ROI 5.2倍、生涯労働価値の中央値AU$40,000 対 生涯飼育・訓練費用中央値AU$7,763）。加えて、家畜を捕食者から守る「Livestock Guardian Dogs」は獣害による損失を68〜100%削減し、常時見張りに要する人的労力を大きく減らすとされる。この数値は「牧羊犬**あり**の場合の頭数上限への乗数」としては使えるが、「牧羊犬**なし**の場合の牧夫1人あたり基礎頭数」（乗数を掛ける前のベースライン）そのものは別途史料を要する——§10.3の未決定はこのベースライン部分に限定して残る。

`husbandry.ts`（Phase 3、未着手）は、牧夫1人あたり許容頭数を算出する際、そのセルの`Dogs`（新規登録、`liveAnimal`＋`herding`タグ、下記）の頭数に応じてこの乗数を適用する設計とする——具体的な適用式（線形補間か、飽和曲線か等）はPhase 3着手時に決める。

**`Dogs`Goodの新規登録（実装済み）**: 上記の設計に備え、`goods-generator.ts`へ`Dogs`（`tags: ["liveAnimal", "herding"]`、非食用、`unit: "head"`、Cats同型の低weight/bulk・高lossRiskの交易プロファイル、`Nomadic`/`Hunting`文化に高倍率）を新規Goodとして追加した。既存の`liveAnimal`＋非食用種の汎用パイプライン（`faunaPopulation.ts`のfaunaストック・繁殖・非食用需要キャップ、§4.5）へ自動的に乗るため、Phase 2側のコード変更は不要——`SPECIES_PROFILES`に繁殖定数を1行追加しただけで済んだ。現時点では`husbandry.ts`側の消費（牧夫1人あたり頭数への乗数適用）はまだ配線されておらず、Catsの`pestControl`タグと同じ「将来の消費者を待つ」段階に留まる。既存セーブ向けの移行関数`migrateLiveDogsGood()`（`migrateLiveCatsGood()`と同型）も追加済み。番犬・闘犬など`Dogs`の亜種は、需要（軍事/治安/娯楽）や生産性への効き方が異なる別Goodとして、必要になった時点で追加を検討する（本フェーズでは追加しない）。

---

## 6. Burg雇用構成との接続

「バイオームと同セルの都市の労働者の数や種類と密接に関係する」という要件に対応し、`burgEmploymentComposition.ts`へ`hunting`/`fishing`/`viticulture`/`husbandry`の4セクター（rural harvest labor）を追加する。§5.2/§5.3で確定した加工工程（燻製・塩蔵、干しブドウ、醸造）の労働力は、**新設セクターを起こさず既存`craft`セクターへ計上する**（§10.4で確定、当初案の新設`foodProcessing`セクターは撤回）。

- 既存の`collectionBurgId`帰属ロジック（[`markets-generator.ts:632-650`](../../src/extensions/economy/generators/markets-generator.ts#L632-L650)、セルに最も近いBurgへ生産を帰属させる仕組み）をそのまま再利用し、農村労働配分器の各セルの`assignedWorkers`を`collectionBurgId`ごとに集計する。加工工程の労働力はもとよりBurg雇用プール（`craftEmployment.ts`系、`craft`セクター）から確保するため、この帰属を介さず直接Burgに乗る。
- `sumActiveWorkers()`（[`burgEmploymentComposition.ts:73-83`](../../src/extensions/economy/generators/burgEmploymentComposition.ts#L73-L83)）と同型の集計関数を追加する。
- 発展として、Burgの`cultureType`（既に`multipliers.cultureType`で使われている概念、例: `Naval`/`Hunting`/`Highland`）を農村労働配分器の産業優先順位重みにフィードバックし、「漁業文化のBurgは同じ生産性でも漁業を優先配分する」という双方向の関係にできる。狩猟の自給枠についても、`Hunting`文化圏では枠そのものをやや広め（§4.4の選択的間引きに加え、獣害対策要員としての需要も高いと想定）にする、という同種のフィードバックが自然に載る。
- **確定（§10.4）**: 醸造・製パンなど`craft`セクターの加工職は、キャラクターごとのスキル・熟練度への依存度が特に高くなりうる想定。ただしこれを生産量に厳密に反映する計算式までは求めない——`martialIndividualMastery.ts`と同型の民生スキル熟練度、または`guildKnowledgeTypes.ts`の`CRAFT_DOMAIN_BY_GOOD_NAME`が既に持つギルド技能ドメインの概念を流用し、まずはキャラクターの経歴・フレーバー情報として接続できれば十分とする（生産量への定量反映はPhase 6以降の余地として残す）。

---

## 7. 移行・キャリブレーション上の注意

- **産出の急変を避ける**: 現行モデルは無制限フロー、新モデルは`requiredWorkers`上限でゲートされるため、既存セーブでは労働力充足率次第で総産出が変化しうる（Grain/mineの前例と同じ校正作業が必要、[`megacity-food-import-economy.md`](megacity-food-import-economy.md)の`LABOUR_DAYS_PER_HECTARE`再校正の事例を参照）。
- **既存セーブのマイグレーション**: `faunaStock`初期値・農村労働配分の初回計算を、`goods-generator.ts`の`migrateLive*`関数群と同じパターンで用意する。
- **回帰テスト**: `production-utils.test.ts`・`markets-generator.test.ts`・`liveAnimalCatch.test.ts`に、労働力ゼロ/充足/過剰の境界値と、家畜個体群が枯渇したセルでの捕獲0のケースを追加する。

---

## 8. フェーズ計画

| Phase | 内容 | 依存 |
| :--- | :--- | :--- |
| 1 ✅ | 農村労働配分器（§3）の導入。狩猟の自給枠（§5.1）＋漁業・ブドウ栽培（収穫段階のみ）を「労働力充足率でゲートされた連続レート」に変える（個体群/バイオマスストックはまだ導入しない＝現行の無限湧きレートに`workerFactor`／自給枠の頭数を掛けるだけ）。実装: `ruralOccupationAllocation.ts`（§0 2026-08-06 Phase 1実装完了を参照） | なし |
| 2 ✅ | Fauna個体群ストック・繁殖・年齢選択性間引き（§4）。野生（Game）・家畜（liveAnimal）を別キャリング容量計算で導入。非食用家畜の需要キャップ（§4.5）。新規モデル詳細度トグル（§11）を`Options → Generation`に導入し、`"detailed"`（既定）/`"simplified"`を切替可能にした。実装: `faunaPopulation.ts`（§0 2026-08-06 Phase 2実装完了を参照）。家畜キャリング容量はhusbandry.ts（Phase 3）不在のため暫定プロキシ値 | Phase 1 |
| 3 | 牧畜（`husbandry.ts`、§5.4）の面積・労働定数を確定し導入。家畜キャリング容量（§4.2）と接続。牧羊犬（`Dogs`Good、liveAnimal＋herdingタグ）の頭数に応じた牧夫1人あたり許容頭数の乗数を配線する（研究引用・Good登録は§0 2026-08-06「牧羊犬の調査＋Dogs Good登録」で完了済み） | Phase 1, 2 |
| 4 | `Grapes`・`Raisins`の新規Good追加、ブドウ収穫段階の労働力ゲート（§5.3の収穫段階、農村労働配分器に統合）、Wineのレシピを`{ Grapes, Barrels }`へ切替。加工段階（Grapes→Raisins/Wine）は既存`production-generator.ts`の`runWorkerLoop`＋`craft`セクターに新規レシピを乗せるだけ（2026-08-06訂正、新規機構は発明しない）。Fish→保存食（`Stockfish`/`Preserved food`）は既に実装済みのため本フェーズでの作業なし | Phase 1 |
| 5 | 3分岐・保存食配分の需要連動＋`durability`比例の再配分速度（§9.4） | Phase 4 |
| 6 | Burg雇用構成への接続（§6）、文化タイプによる産業優先度重み・狩猟自給枠の広狭 | Phase 1–4 |
| 7 | 不漁・豊漁の変動モデル（§5.2、ユーザー指示により別途決定） | Phase 1 |

---

## 9. 決定事項・残る詳細

以下はユーザーの回答により方針決定済み。実装時に詰める具体的な数値・境界条件のみ残る。

1. **決定**: コホート/繁殖モデルは野生（Game）・家畜（liveAnimal）の両方に適用する。ただしキャリング容量の計算式は別系統（§4.2: 野生＝残地面積ベース、家畜＝牧畜労働力/牧草地ベース）。
2. **決定**: `Grapes`を独立した交易可能な新規Goodとして新設し、生食・`Raisins`（干しブドウ、保存食）・`Wine`の3方向に加工する（§5.3）。
3. **決定（§10.2、Phase 1実装済み）**: 狩猟自給枠（§5.1）は`min(availableAdults, max(3, availableAdults × 0.01))`——下限は集落規模によらず一律3人、規模が大きい集落での比率は`manpower.ts`の平時徴兵率（1%）に倣う。害獣のセル密度による増減は指標未整備のためフックのみ（§9.6参照）。Game一人あたり月産出量（`GAME_YIELD_PER_HUNTER_PER_MONTH`）は引き続き既存の1人あたり食料消費定数（`GROSS_FOOD_NEED`）からの逆算値で仮置き。
4. **決定**: 生食・`Raisins`・`Wine`の配分比率は需要連動の可変値とし、再配分速度を各商品の`good.trade.durability`に反比例させる（Wineは緩やか、生鮮Grapesは即応）。
5. **決定（2026-08-06訂正）**: 保存食変換（Fish→干物・塩漬け、Grapes→Raisins）は「収穫＝rural（§3の配分器）／加工＝Burg雇用プール」の二段構成という設計自体は維持するが、**加工段階の労働力ゲートは新規メカニズムを発明せず`production-generator.ts`の既存`runWorkerLoop`＋`craftEmployment.ts`（`craft`セクター）にそのまま乗せる**。Fish→`Stockfish`/`Preserved food`は両方とも既にレシピとして実装済みで追加作業は不要、Grapes→`Raisins`/`Wine`はレシピを新設するだけでよい（mineOperations/smelterOperations型の新規`requiredWorkers`ゲートは不要）。
6. **決定（§10.1）**: `demandAbsorptionCapacity(good)`は直近4四半期（1年）の実売れ行き平均×バッファ係数1.2倍を基準とし、`effectiveCarryingCapacity`の伸びは「増やせる労働力の量」と「増やせる敷地/面積の量」の小さい方でさらにキャップする。
7. **決定（§10.3、一部進展）**: 牧畜（`husbandry.ts`）の面積・労働定数は史料からの概算・類推を優先する。十分なデータが見つからない場合は仮置きせずPhase 3着手時に改めて相談する。**2026-08-06追記**: 牧羊犬**あり**時の牧夫1人あたり許容頭数の乗数はArnott et al. 2014（`docs/temp/herding-dogs.md`、§5.4）で裏付けが取れた。乗数を掛ける前の**ベースライン**頭数（牧羊犬なしの場合）は引き続き未確定——§10.3の残課題はこの範囲に狭まった。関連して`Dogs`Good（`liveAnimal`＋`herding`タグ）を新規登録済み（§5.4）。
8. **決定（§10.4）**: 加工労働力（燻製・塩蔵・乾燥・醸造）は新設セクターを起こさず、既存Burg雇用プールの`craft`セクターに紐付ける。醸造等のキャラクター熟練度依存は、生産量への厳密反映ではなくキャラクター背景・フレーバー接続に留める。
9. **決定（§10.5）**: `Wine`のレシピに樽を追加する。樽は既存Good`Barrels`（`recipes: [{ Wood: 1 }]`、`woodworking`ギルド技能ドメイン、`Beer`等で消費実績あり）をそのまま再利用し、`Wine`のレシピは`{ Grapes: X, Barrels: Y }`に決定（新規Good不要）。「樽が成り立たない場合の`Grapes`+`Wood`直接レシピ」は将来の文化/時代別分岐用のフォールバックとして設計にのみ残す。
10. **決定（実装済み）**: Phase 2以降の重い計算（fauna個体群コホート等）に備え、`Options → Generation`にモデル詳細度トグル（`ruralEcosystemDetail: "detailed" | "simplified"`、既定`"detailed"`）を新設した（§11）。

## 10. 新たに生じた未決定事項

1. 害獣（獣害）のセル密度を表す指標が現状どこにも存在しない。§5.1の狩猟自給枠をこれで増減させる拡張は、その指標自体の設計をどこかのフェーズで別途行う必要がある（`threatCullHire.ts`/`cullPractice.ts`の脅威イベント頻度と関連付けるのが有力候補だが未検討）。
2. ~~§11のトグルの正式なオプションキー名・UIコピー・既存セーブの`faunaStock`マイグレーション~~ → **解決（Phase 2実装済み）**: オプションキーは`ruralEcosystemDetail`、UIコピーは「Detailed (fauna population model)」/「Simplified (faster)」。マイグレーションは「不要」という当初設計どおり——`"simplified"`ロード中は`faunaStock`を単に触らず放置し、`"detailed"`へ戻したときに`ensureStock`が既存エントリをそのまま再利用する。
3. Phase 3で`husbandry.ts`が実装されたら、`faunaPopulation.ts`の`getDomesticatedCarryingCapacity()`が使う暫定プロキシ（Phase 1フラットレート×24ヶ月）を実際の牧草地/労働力ベースの値に差し替える必要がある——差し替え時、既存セーブの`faunaStock`ドメスティック分がプロキシ値ベースで既に成長している可能性があり、新しい（恐らく異なる規模の）キャリング容量に対して急激な在庫スケーリング（`advanceCohortsOneYear`のダイオフ処理）が一度だけ発生しうる。急変が許容範囲か、緩和処理（複数年かけた段階的収束等）が要るかはPhase 3着手時に検討する。
4. §4.5の需要吸収キャップは、設計では牧場ごとの按分配分を想定していたが、実装ではMarket単位の上限値を按分せず各セルへそのまま適用する簡略化とした（§0 2026-08-06 Phase 2実装完了参照）。Marketに属するセル数が多い場合、需要キャップの実効性が設計意図より緩くなる（各セルが独立にMarket全体の上限まで到達しうる）。Market単位の集計・按分パスを追加する価値があるかは、実際のプレイでの体感を見てから判断する。

---

## 11. モデル詳細度トグル（`Options → Generation`）— ✅ 実装済み（Phase 2、§0 2026-08-06 Phase 2実装完了）

Phase 2以降で導入するfauna個体群コホート計算（§4）は、疎とはいえ種×セル単位で繁殖・年齢遷移・間引きを年次更新する必要があり、Phase 1の農村労働配分器（セル数に対して線形の単純な四則演算）より明確に重い。ユーザー要望「新しく導入するモデルを簡素化したモデル(或いは現行の古いモデル)をUIのOptions → Generationで選択可能にしたい。新モデルがデフォルト」を受け、以下の設計とする。

### 11.1 オプション

- `useOptionsState`に`ruralEcosystemDetail: "detailed" | "simplified"`を追加（既定値`"detailed"`）。他の生成時専用オプション（`biomeRegionProfile`, `enclosureCalculationMode`）と同じ`options`スライスに置く。
- `GenerationSettingsTab.tsx`に、`biomeRegionProfile`行と同型の`<LockIconButton>`＋`<select>`の行を追加する（表内のどのセクション見出し配下に置くかは実装時に決める。内容的には「6. Rural economy」のような新セクション見出しを起こすのが自然）。

  ```text
  <select value={options.ruralEcosystemDetail} onChange={...}>
    <option value="detailed">Detailed (fauna population model)</option>
    <option value="simplified">Simplified (faster)</option>
  </select>
  ```

- `enclosureCalculationMode`と同じく「即座に適用、次回生成不要」寄りにするか、`template`のように「次回生成が必要」寄りにするかは、fauna個体群ストックが`faunaStock`という新規セーブ状態を持つ（§4.1）ため、**セーブ済みマップ上での切替は次回生成が必要**（`LockIconButton`ロック対象）という運用が自然。既存マップ上で`"detailed"`↔`"simplified"`をシームレスに相互変換する移行ロジックは要求しない。

### 11.2 何が切り替わるか

- **Phase 1（農村労働配分器、§3）は常時有効**——軽量なため、トグルの対象外。`"simplified"`でも狩猟自給枠・漁業/ブドウ栽培の労働力ゲートはそのまま動く。
- **`"detailed"`（既定）**: §4のfauna個体群コホートモデルをフル稼働——野生（Game）・家畜（liveAnimal）それぞれ別系統のキャリング容量、繁殖、年齢選択性間引き、非食用家畜の需要キャップ（§4.5）まで含む。
- **`"simplified"`**: fauna個体群コホートの年次更新をスキップする。Game/liveAnimalの産出は、Phase 1で確立済みの「労働力充足率でゲートされた無上限レート」（個体群上限なし）のまま据え置く——実質的にはPhase 1時点の（＝現行の「古いモデル」に近い）挙動が固定される。牧畜（§5.4）・Grapes3分岐（§5.3）など、fauna個体群ストックの存在を前提とする後続フェーズの機能は、`"simplified"`では対応する簡易フォールバック（固定レート、または該当機能自体を無効化）に倒す——具体的な対応表はPhase 2〜5の各実装時にこの節へ追記する。

### 11.3 実装への影響

- fauna個体群の年次コホート更新関数（`faunaPopulation.ts`の`updateAnnualFaunaCohorts()`）は、関数の先頭で`getRuralEcosystemDetail() !== "detailed"`を早期リターンするだけの単純な条件分岐で実装した。個体群ストック自体は`"simplified"`時も触らない（怠惰に放置）——次に`"detailed"`へ戻したときに`ensureStock`が既存エントリをそのまま再利用する（都度クリアする特別処理は不要という設計どおり）。
- 消費側（`drawWildFaunaOfftake()`/`drawDomesticatedFaunaOfftake()`）も同じガードを持ち、`"simplified"`時は呼び出し元が計算した「希望量」をそのまま返すパススルーとして働く——在庫テーブルの読み書きも一切発生しないため、トグルを切り替えただけでは既存の出力に何の影響も出ない。
