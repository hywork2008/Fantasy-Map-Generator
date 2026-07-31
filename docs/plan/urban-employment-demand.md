# 都市雇用モデル: `employmentDemand` による実雇用駆動の都市吸引力

最終確認: 2026-07-30

## 0. 決定記録

**2026-07-30 決定（§5の回答を反映）**: §5の未決定事項に対し、次の方針で確定した(詳細は§5.1)。

1. 鉱業・製錬雇用は§3.2案どおりBurgアンカー型で実装する。`LaborMarket`のMarket圏cohortには統一しない。
2. Burg単位の産業労働力上限（鉱業・製錬・造船戦略労働・港湾交易が共有する成人比率の上限）は設けない。食料供給（`effectiveCapacity`）が支える限り、人口増加に伴って住宅建設等の雇用も増えてよいという想定。
3. `serviceMultiplier`の初期値は史料的正確性を求めすぎず、調整前提の「それらしい」値を先に入れる。
4. `employmentDemand`から`urbanLaborIntake`への接続は総量駆動（§3.6前者案）とする。
5. 行政雇用はまず州の人口とBurg数に比例させる。治安維持のための衛兵人員も行政雇用に含める想定。
6. 港湾・交易雇用の初期需要指標はCaravan到着量のみとする（`BurgMarketLedger`・`searoute`本数は後続）。積荷の積み替えに人足が必要という前提を式に反映する。

**2026-07-30 設計確定（§6不変条件の補足）**: `MineOperation.workers`/`SmelterOperation.workers`は、Burgの総人口を実際に増減させる実体ではなく、**Burgの既存成人人口のうち何人がその仕事に従事しているかという内訳（サブセット）**として扱う。既存の`LaborMarket`（`strategicLaborMarkets.ts`、§2.3）が「Burg人口を物理的に減らさない、内部比率のみ」という設計であるのと同じ会計原則に揃え、二重計上・人口消失のリスクを避ける。したがって`workers`の増減はBurgの`population`/`demographics`を書き換えない。`employmentDemand`の総量が`urbanLaborIntake`を実際に動かす（Burg人口を増やす）のはPhase 4で`employmentDemand`と`urbanLaborIntake`を接続したときが最初になる。§6の該当文はこの解釈に修正する。

**2026-07-30 実装状況**: Phase 1（鉱業・製錬雇用のBurg接続）を実装した。`MineOperation.workers`/`SmelterOperation.workers`は、その施設が立地するBurgの現有成人人口（`getBurgDemographics`で読み取り）から按分される内訳として、新しい年次リコンサイル`reconcileAnnualBasicEmploymentWorkers()`（`basicEmployment.ts`。Phase 3で`reconcileAnnualIndustrialWorkers()`から改名）により毎年緩やかに目標値へ追随する。同一Burgに複数の鉱山・製錬所がある場合は共有の成人プールを奪い合う（上限は設けない＝決定2）。`workerFactor`（`produceMonth()`の抽出・製錬効率）は、この`workers`と「フル稼働に必要な労働力」（鉱山は既存の`4 + richness * 6`、製錬所は新設の`4 + annualCapacityTons * 0.05`）の比で決まるため、Burgの成人人口が不足しているBurgでは初めて意味のある値になる。

**2026-07-30 実装状況（Phase 2 — 港湾・交易雇用）**: `LaborMarket`（`strategicLaborMarkets.ts`）へ`STRATEGIC_OCCUPATIONS`の5番目として`"trade"`を追加した。決定6により需要指標をCaravan到着量のみに絞ったため、§3.3が挙げていた`BurgMarketLedger`実績・`searoute`接続本数・河川水運/海路/陸上交易の優先順位づけは今回は採用しない（将来これらを追加する場合は同じ`getDemandMultiplierByOccupation`の分岐に足す）。`Market.caravanArrivalVolume`という新しいdecayingゲージを追加し、`Caravans.tick()`内でキャラバン到着のたびに積載量（`caravan.units`）を加算、半減期60日で指数減衰させる（積荷の積み替えに人足が必要という決定6の前提を「最近の到着実績」として近似）。この値を`getTradeDemandMultiplier()`で1〜4の需要倍率に変換し、他の4職種と同じ`getDesiredWorkers`/`moveWorkersTowardDemand`/`updateWagesSkillsAndCapacity`経路で毎月の生産サイクル中に配分・賃金・熟練度を更新する。`trade`はGoodsに紐づかない職種のため、賃金計算は`good?.value ?? 1`のフォールバックをそのまま使う。港湾・交易雇用そのものを`portTradeEmployment[burgId]`として集計しBurgへ帰属させる作業（§3.1）はPhase 4で行う。

**2026-07-31 実装状況（Phase 3 — 行政・首都雇用とサービス業雇用）**: `administrationEmployment.ts`（新規）を追加し、`burg.capital`を持つBurg（`state.capital`）に、`state.rural + state.urban`（州人口）と`state.burgs`（Burg数）に比例した行政雇用需要`4 + population * 0.005 + burgs * 1`を与えた（決定5。衛兵人員は独立させず行政雇用に含める）。`basicEmployment.ts`の年次リコンサイルへBurgアンカー型スロットとして追加し、同一Burgでは行政を鉱山・製錬所より先に配分する（州都は鉱床の有無に関わらず統治機能が要る、という優先順位の判断）。既存の`reconcileAnnualIndustrialWorkers()`は`reconcileAnnualBasicEmploymentWorkers()`へ改名した。州の首都が変わった／州が消滅した場合、`administrationEmployment`レコードは翌年の再構築時に新しい首都だけへ再生成されるため、旧首都に幽霊雇用が残らない。`serviceEmployment.ts`（新規）で`serviceEmploymentDemand = basicEmploymentDemand × 1.5`を実装した（決定3。前近代都市の非基盤サービス人口は基盤人口の1〜2.5倍程度という経済地理学の目安を参考にした暫定値、校正は次段階）。`basicEmploymentDemand[burgId]`は現時点では行政＋鉱業＋製錬（Burgアンカー型のみ）の合計であり、Market圏の`trade`雇用（Phase 2）はまだBurgへ帰属させていない——`basicEmploymentSummary`（新規state）としてBurgごとに保存され、Phase 4で`trade`雇用を合算し`employmentDemand`として`urbanLaborIntake`へ接続する。

**2026-07-31 実装状況（Phase 4 — `employmentDemand`を`urbanLaborIntake`へ接続する）**: `basicEmployment.ts`の年次リコンサイル末尾で、Market圏`trade`雇用（`LaborMarket.workersByOccupation.trade`、Phase 2）をそのMarketの`centerBurgId`へ帰属させて`basicEmploymentDemand[burgId]`に合算するようにした（読み取りのみ — `reconcileStrategicLaborMarkets`が毎月別途Market圏の労働力プールに対して配分するため、ここでBurgの成人プールへ二重に競合させない）。これで`basicEmploymentDemand`は行政＋鉱業＋製錬＋交易の全4種を含む。`urbanLaborIntake.ts`に`calculateAnnualUrbanLaborIntakeFromEmploymentDemand()`を追加し、決定4（総量駆動）どおり`min(effectiveCapacity - population, max(0, employmentDemand - currentAdultPopulation) * businessCycle * localVariation)`を実装した（`employmentDemand = basicEmploymentDemand + serviceEmploymentDemand`、`currentAdultPopulation = maleAdults + femaleAdults`）。`businessCycle`/`localVariation`はそのまま雇用充足速度の揺らぎとして残した — Phase 1〜3のどの雇用計算も乱数を持たないため、二重計上の心配はない。`generateAnnualIntakes()`は`useOptionsState.getState().ruralUrbanMigration === "megacity"`のときだけこの新式へ切り替え、`"independent"`（既定値）では`basicEmploymentSummary`を一切読まず既存の`population × 2%`式を使う（§6不変条件、回帰テストあり）。

> **既知の影響（要Phase 5バランス調整）**: `basicEmploymentDemand`は現状、行政（州都のみ）・鉱業・製錬・交易（Market中心Burgのみ）からしか生まれない。megacityモードでは、これらのいずれにも該当しないBurg（農業中心の一般的な町など）は`employmentDemand`が0のままとなり、`urbanLaborIntake`が恒常的に0になる——本書§1の意図（基盤産業のない都市は人口だけで膨らまない）どおりの挙動だが、影響範囲は非常に広い（鉱山も交易拠点でも州都でもない大多数のBurgが対象）。Phase 5で鉱山を持つ都市・持たない都市の成長曲線を比較しながら、`serviceMultiplier`やその他の係数を調整すること。

**2026-07-31 実装状況（Phase 5 — UI・可視化・バランス）**: Burg Editor（`BurgEditorDialog.tsx`）に「Basic employment」「Service employment」行を追加した（`BurgEconomySummary`型を拡張し、`burgEconomySummary.ts`が`getBasicEmploymentSummary()`から値を埋める）。デバッグ用に新しい`Employment Overview`ダイアログ（Tools → Edit → Employment）を追加し、`employmentDemand`が発生している全Burgを行政・鉱業・製錬・交易・basic・service・totalの内訳付きで一覧表示する（値は年次リコンサイルが確定させた既存stateを読むだけで、再計算はしない）。`basicEmployment.ts`の交易帰属ロジックを`getTradeWorkersByBurg()`として切り出し、年次リコンサイルとこのダイアログの両方から再利用する。ブラウザで実機確認（seed `phase5-verify`、economy拡張・megacityモード有効、Advance Timeで60年分進行）: Burg EditorとEmployment Overviewの数値は一致し（例: 州都Nish — Basic 14.3 / Service 21.5 / Total 35.9）、UIは想定どおり機能した。

> **バランス確認の結果**: 同じseedで`独立`モードと`megacity`モードを別々に60年分進行させ、複数Burgの人口推移を比較した。小規模なBurg（人口100前後）が数十年で人口ほぼ0まで急減する現象が観測されたが、**これはmegacity/independentどちらのモードでも同一に発生する**——本計画のPhase 1〜4とは無関係な、既存の人口シミュレーション（飢饉・戦争・野盗などによる減耗）側の既知の変動であることを確認した。一方、`employmentDemand`を持つ大きめのBurg（州都・鉱山町・交易拠点）は両モードで破綻的な挙動を示さず、Employment Overviewの内訳も一貫していた。時間の制約上、`serviceMultiplier`・行政雇用係数のさらなる精密な数値調整（史料的裏付けを伴う校正）は行っていない——決定3の方針（「それらしい値を入れて後で調整する」）どおり、今回は「壊れていないことの確認」までとし、既知の影響（上記）を踏まえた継続的なバランス調整は今後の課題として残す。

**2026-07-31 調査結果（サービス業雇用によるGoods需要への波及確認）**: 本計画がめざした「これまで増えなかった都市人口を、実雇用に基づいて増やす」ことが、food以外のGoods需要（衣類など`clothing`タグのGoodsを含む）にも正しく波及するかを確認した。結論: **追加実装は不要**。既存のGoods需要式（`goods-generator.ts`の`DEMAND_TARGET_FACTORS`/`demandCoverage`、`markets-generator.ts`の`collectConsumerDemand()`/`calculatePopulationByMarket()`）は、職業構成に関係なくBurgの`population`にのみ比例する汎用の人口比例式であり、`runGlobalTrade()`はこの人口比例需要を在庫目標（`reserve`）として使い、不足分をキャラバンで輸入する。したがって`employmentDemand`（本計画）が`urbanLaborIntake`（megacityモードのみ、Phase 4）経由でBurg人口を増やせば、その増加分は他の産業由来の人口増と全く同じ扱いで、foodを含む全カテゴリのGoods需要（`utilities`/`luxury`/`construction`等に紐づく`clothing`タグGoods含む）に自動的に反映される。サービス業人口だけを特別扱いする消費モデルは存在しないし、本計画の意図（人口が増えた分だけ生活必需品の需要も増える）に照らして追加する必要もない——`employmentDemand`/`serviceEmploymentDemand`は`goods-generator.ts`・`markets-generator.ts`・`production-generator.ts`のいずれからも参照されておらず（雇用系ファイルとUI表示にのみ出現）、Goods需要側は`burg.population`だけを見れば足りる設計のままで良い。この経路は`"independent"`モードでは`urbanLaborIntake`が`employmentDemand`を読まないため機能しない点は既存の不変条件（§6）どおり。

**2026-07-31 調査結果（羊毛→生地→衣装の加工チェーンと雇用の関係）**: 上記の続きで、`clothing`需要を満たす具体的な物資フロー（例: `Sheep`→`Cloth`→`Garments`、`goods-generator.ts`のレシピ）が実際に機能しているか、またそれが「雇用」を生んでいるかを確認した。物資フロー自体は既に機能していた——`production-generator.ts`の`executeManufacture()`が原料を地元在庫優先で使い、不足分は`Markets.buy()`で市場から購入するため（`runGlobalTrade()`の輸入経路に乗る）、羊毛（Sheep）や生地（Cloth）を自給していないBurgでも交易で流入した原料から衣装を作れる。一方、この加工ループ（`runWorkerLoop`）は`burg.population`（人口ポイント、`demographics.maleAdults`等と同一単位）を「1周期に何工程回せるか」という汎用キャパシティとして消費するだけで、`employmentDemand`/`basicEmploymentDemand`のどこからも参照されておらず、§2.5がもともと指摘していた欠落（「原料→製品の加工に伴う雇用」）がそのまま残っていた。

**2026-07-31 実装状況（Phase 6 — 手工業雇用、§3.7）**: 上記の欠落を埋めるため、`runWorkerLoop`が既に算出している「このBurgの人口ポイントのうちレシピ加工（Cloth/Garmentsなど、原料採取ではなく`recipes`を持つGoods全般）に投入された量」を`craftEmployment.ts`（新規）の`smoothCraftWorkers()`で毎周期スムージングし（減衰半減期に相当する指数平滑、係数0.2）、`basicEmployment.ts`の年次集計へ`trade`と同じ「読み取り専用・年次スロット競合に含めない」方式で合算した。`trade`同様に読み取り専用としたのは、この労働力が競合する対象（`runWorkerLoop`内の`burg.population`）が、年次スロット側の`remainingAdults`（鉱業・製錬・行政が奪い合うプール）とは別会計であり、スロット側で二重に差し引くと整合しなくなるため。`basicEmploymentDemand = 行政 + 鉱業 + 製錬 + 交易 + 手工業`となり、`serviceEmploymentDemand`（§3.5、「非基盤（サービス・小売・職人）人口」との元々の説明どおり）はこの拡大した基盤雇用にも1.5倍で反応するようになった。Employment Overviewダイアログ（Phase 5）に「Craft」列を追加し、Burg Editorの「Basic employment」表示はこの変更を自動的に反映する（`basicEmploymentSummary`を読むだけの既存コードのため変更不要）。ユニットテスト（`craftEmployment.test.ts`、`basicEmployment.test.ts`）を追加。

**2026-07-31 調査結果（造船業と雇用の関係）**: Phase 6の手工業雇用と対比する形で、造船（`shipbuilding`拡張）が同様に雇用を生んでいるかを調べた。結論: 2段構えで穴がある。(1) 船体建造そのもの（`shipyardQueue.ts`の`runShipyardTick`/`advanceQueueWithMaterials`）は`worker`/`employ`概念を一切持たず、固定の`SHIPYARD_BUILD_POINTS_PER_YEAR`（造船所1つあたり年間固定値）と資材・tech pointのみで進行する——Burgの人口を全く見ない設計。(2) 造船資材（木材・帆布・ロープ・タール）を供給する`forestry`/`sailmaking`/`ropeMaking`/`tarBurning`（§2.3の`STRATEGIC_OCCUPATIONS`、`trade`を除く4職種）は`LaborMarket`に実在するコホートだが、`basicEmployment.ts`が読んでいたのは`trade`だけで、この4職種は`basicEmploymentDemand`に一度も合算されていなかった——Phase 6が埋めた穴と同型（「労働力の実測はあるのに雇用集計に繋がっていない」）。(1)は`SHIPYARD_BUILD_POINTS_PER_YEAR`という意図的な「施設の存在が主要な制約」という設計を崩すため今回は対象外とし、(2)のみをPhase 7として実施することにした。

**2026-07-31 実装状況（Phase 7 — 戦略産業雇用、§3.8）**: `basicEmployment.ts`に`getStrategicOccupationWorkersByBurg(occupations)`という共通ヘルパーを追加し、既存の`getTradeWorkersByBurg()`をこの上に再実装（`["trade"]`のみを渡す）。新たに`getStrategicIndustryWorkersByBurg()`を追加し、`forestry`/`sailmaking`/`ropeMaking`/`tarBurning`の合計をMarketの`centerBurgId`へ、`trade`と全く同じ「読み取り専用」方式で帰属させた——`LaborMarket`はBurg人口を物理的に減らさない内部比率（§2.3）であり、`trade`同様この帰属は年次スロットの`remainingAdults`と競合しない。`basicEmploymentDemand = 行政 + 鉱業 + 製錬 + 交易 + 戦略産業 + 手工業`となった。Employment Overviewダイアログに「Industry」列を追加。ユニットテスト（`basicEmployment.test.ts`に1ケース追加）。

## 1. 目的

[megacity-food-import-economy.md](megacity-food-import-economy.md)は、食料輸入と農業労働力の分離により、農村から都市へ人と食料を送る土台（`releaseRuralLaborSurplus`、`UrbanLaborIntake`、`FrontierExpansion`のプール連携、野盗ライフサイクル）を実装した。しかし、その土台がまだ答えていない問いが残っている。**都市へ送られた人は、着いた先で何をして生きるのか。**

大都市が大都市であるためには、農村から人を受け入れるだけでなく、その人たちが従事できる**実際の仕事**が要る。現状のBurgは、鉱山・製錬所という一次・二次産業の施設を持ちながら、それらが都市の雇用先として機能していない。都市人口が増えても、飲食店・宿・工房のような三次産業（サービス業）が自然に生まれる下地がない。これは経済学の基盤産業（basic industry：外部から資金を稼ぐ輸出産業）と非基盤産業（non-basic industry：域内の労働者・住民に対してサービスを提供する産業）の関係そのものであり、非基盤産業（飲食・宿・小売）は基盤産業（鉱業・製錬・交易・行政）の雇用が生む所得を追いかける形で成長する。基盤産業なしに都市だけを人口で膨らませても、その人口を支える所得の裏付けがない。

本書は、鉱業・製錬・港湾交易・行政という基盤産業の実雇用を`employmentDemand`として計算し、現在Burg人口の年率2%固定式でしかない`calculateAnnualUrbanLaborIntake`（[urbanLaborIntake.ts:299](../../src/extensions/economy/generators/urbanLaborIntake.ts#L299)）を、この実雇用に基づく受け入れ枠へ置き換える計画を立てる。

## 2. 現状と問題

### 2.1 都市受け入れ枠は人口自己参照の暫定式

```ts
// calculateAnnualUrbanLaborIntake — urbanLaborIntake.ts:299
const remainingCapacity = Math.max(0, capacity - population);
return Math.min(
  remainingCapacity,
  population * intakeRate /* 0.02 */ * businessCycle /* 0.5〜1.5 */ * localVariation /* 0.85〜1.15 */
);
```

入力は「今のBurg人口」「State単位の景気サイクル（乱数）」「Burgごとの地域差（乱数）」「食料が支える`effectiveCapacity`の残余」だけである。鉱山があるか、港が交易路に繋がっているか、首都かどうかは一切関係しない。megacity-food-import-economy.mdは当初からこれを承知の暫定式として明記していた。

> **決定**（megacity-food-import-economy.md §4.1）: 現段階の`settlementDevelopmentPotential`は移住先の順位付けだけに使い、年次`urbanLaborIntake`の総量を増やさない。受入枠は当面、Burg人口の年率2%に景気変動・空き容量を掛ける暫定式を維持する。資源・首都・港・水運・交易が何人を雇用するかは、静的立地とは別の`employmentDemand`として後続フェーズで導入する。

> **後続の課題**（同 §8）: 都市吸引力は、まず明示的な`employmentDemand`（資源採掘、港湾、水運、交易、行政、首都機能）の合計で`urbanLaborIntake`を置換する。賃金、地代、階層、Characterの選好はその後に追加する。

### 2.2 鉱業・製錬は物資フローのみで、人口と結び付いていない

`MineOperation.workers`（[mineOperations.ts:167](../../src/extensions/economy/generators/mineOperations.ts#L167)）は`4 + deposit.richness * 6`という、鉱床の豊かさから決まる固定値であり、生成後に一切変化しない。`produceMonth()`（同 L105）はこれを`workerFactor = min(1, operation.workers / (4 + richness * 6))`として使うが、分母と分子が定義上ほぼ同じ値のため、`workerFactor`は実質的に常に`1`である。Burgの人口・成人バケットを読み書きする箇所は`findNearestBurgId`（同 L136、`burgId`を割り当てるためだけ）しかない。`SmelterOperation`（[smelterOperations.ts](../../src/extensions/economy/generators/smelterOperations.ts)）も同様に`burgId`は持つが、労働者数の概念自体を持たない。

つまり、`MineOperation`/`SmelterOperation`は「鉱床がある」「製錬所がある」という物理的存在と物資フローだけをモデル化しており、それが**誰かの仕事**であるという側面を一切表現していない。

### 2.3 人口を消費する職業cohortパターンは既に存在するが、造船専用

[strategicLaborMarkets.ts](../../src/extensions/economy/generators/strategicLaborMarkets.ts)の`LaborMarket`は、Market圏Burg人口の30%（`WORKFORCE_SHARE`）を「戦略労働力」とし、`forestry`/`sailmaking`/`ropeMaking`/`tarBurning`の4職種（`STRATEGIC_OCCUPATIONS`）へ、未充足の戦略調達注文の需要に応じて再配分する。1周期あたり最大5%（`MAX_TRANSFER_SHARE_PER_CYCLE`）しか職種間移動せず、需要のある職種は技能・設備capacityが緩やかに向上し、生産性倍率（`getStrategicLaborProductivity`）として既存recipeの出力へ反映される。

この設計は[shipbuilding-industrial-policy.md §4.5](shipbuilding-industrial-policy.md#45-集約型の雇用産業能力後半-phase)で先に決定・実装されたもので、同節はコメントで`"shipbuilding" | "trade"`を将来の追加職種として明示している（鉱業・製錬は挙がっていない）。重要な性質として、`LaborMarket`はBurg人口を**物理的に減らさない**。あくまで「その人口のうち何%がどの職に向いているか」という内部比率であり、生産性倍率の計算にのみ使う。都市の受け入れ枠（`urbanLaborIntake`）とは接続されていない。

### 2.4 `settlementDevelopmentPotential`は雇用量ではなく立地の点数

[developmentPotential.ts:136](../../src/extensions/economy/generators/developmentPotential.ts#L136)の`calculateSettlementDevelopmentPotential`は、河川・港・交易結節の数、未枯渇鉱床の豊かさ、首都・港・広場ボーナスを単純加算した**静的なスコア**である。鉱床が実際に採掘されているか、港が実際に交易路へ繋がっているかは問わない。移住先・新Burg昇格候補の順位付けにのみ使われ（Phase 4の未実装項目）、雇用量の計算には使われていない。これは意図的な分離であり（§2.1引用の決定）、本書が作る`employmentDemand`は`settlementDevelopmentPotential`を置き換えるのではなく、「実際に稼働している」経済活動から別途算出する。

### 2.5 まとめ: 何が欠けているか

| 産業 | 現状 | 欠けているもの |
| --- | --- | --- |
| 鉱業 | `MineOperation`は物資フローのみ、`workers`は固定値で人口と無関係 | 実人口を消費する採掘労働力、鉱山閉山・新規開山時の雇用増減 |
| 製錬・加工（鍛冶相当） | `SmelterOperation`に労働力概念なし。一般`Production`（recipe変換）も労働力を消費しない ~~（Phase 6で解消、§3.7）~~ | ~~原料→製品の加工に伴う雇用~~ Phase 6で`craftEmployment`として実装済み |
| 港湾・交易 | Caravan・searoute・`BurgMarketLedger`は交易量を追跡するが、雇用への変換なし | 港湾労働者・商人の雇用 |
| 行政・首都機能 | `burg.capital`フラグのみ。`settlementDevelopmentPotential`に加点はあるが雇用ではない | 行政職の雇用 |
| サービス業（飲食・宿など） | 存在しない | 基盤産業雇用に追随して生まれる非基盤雇用 |
| 都市受け入れ枠 | 人口の年率2%固定 | 上記`employmentDemand`の合計、またはその**増分**で駆動 |

## 3. 目標モデル

### 3.1 状態の責務

| 状態 | 所有者 | 単位 | 意味 |
| --- | --- | --- | --- |
| `MineOperation.workers` | economy（既存フィールドの意味変更） | 人口ポイント | その鉱山で実際に働く成人数。鉱床の豊かさは採掘可能な**上限**を決めるだけで、実際の雇用は需要・労働力供給から決まる。 |
| `SmelterOperation.workers` | economy（新規フィールド） | 人口ポイント | その製錬所で実際に働く成人数。 |
| `portTradeEmployment[burgId]` | economy simulation | 人口ポイント | 港湾荷役・商人としての雇用。交易量から導出。 |
| `administrationEmployment[burgId]` | economy simulation | 人口ポイント | 首都・州都としての行政雇用。 |
| `craftEmployment[burgId]` | economy simulation | 人口ポイント | レシピ加工業（Cloth/Garmentsなど、専用Operationを持たない一般`Production`）の実雇用。`runWorkerLoop`の実測を指数平滑した値（§3.7、Phase 6）。 |
| `LaborMarket.workersByOccupation`（forestry/sailmaking/ropeMaking/tarBurning分） | economy simulation（既存、§2.3） | 人口ポイント | 造船・一般Wood供給を支える資材労働コホート。`basicEmployment.ts`の`getStrategicIndustryWorkersByBurg()`がMarketの`centerBurgId`へ読み取り専用で帰属（§3.8、Phase 7）。 |
| `basicEmploymentDemand[burgId]` | economy simulation | 人口ポイント | 鉱業・製錬・港湾交易・行政・戦略産業・手工業の合計（基盤雇用）。 |
| `serviceEmploymentDemand[burgId]` | economy simulation | 人口ポイント | 基盤雇用に追随して生まれる非基盤雇用（飲食・小売・宿など）。 |
| `employmentDemand[burgId]` | economy simulation | 人口ポイント | `basicEmploymentDemand + serviceEmploymentDemand`。`annualUrbanLaborIntake`の入力になる。 |

### 3.2 鉱業・製錬雇用 — Burgアンカー型で実装する（`LaborMarket`は流用しない）

**推奨（要確認）**: 鉱業・製錬の雇用は、`LaborMarket`のMarket単位cohortパターンには乗せず、`MineOperation`/`SmelterOperation`が既に持つ`burgId`アンカーをそのまま使う。理由は次の通り。

- `MineOperation`/`SmelterOperation`は生成時点で既に「最も近いBurg」（`findNearestBurgId`）に紐付いている。Market圏全体で按分し直す`LaborMarket`の抽象化は、この既存の1対1関係を壊してBurg単位の`employmentDemand`へ再集約する余分な変換を要求する。
- `LaborMarket`の戦略職（forestry等）はMarket圏に**複数存在しうる同種資源**（森林）を対象にした設計であり、Marketレベルの按分が自然だった。鉱山・製錬所は個々の施設が既に離散的・Burgアンカー型であり、同じ抽象化を必要としない。
- ただし、**将来`"trade"`職種を`LaborMarket`へ追加する**という[shipbuilding-industrial-policy.md §4.5](shipbuilding-industrial-policy.md#45-集約型の雇用産業能力後半-phase)の既存コメントとは矛盾しない。港湾・交易雇用（§3.3）はMarket圏に対して按分する性質が強いため、そちらは`LaborMarket`の`"trade"`職種として実装するのが整合的である。

初期式（要確認・数値は暫定）:

```text
desiredWorkers = min(
  extractionCapacityWorkers,  // yieldInfo.annualCapacityTons から逆算する採掘可能上限
  availableBurgAdults × MAX_INDUSTRIAL_WORKFORCE_SHARE  // Burg成人のうち鉱業へ割ける上限比率
)
workers += clamp(desiredWorkers - workers, -maxAnnualChange, +maxAnnualChange)  // 年次で緩やかに追随
workerFactor = min(1, workers / requiredWorkersForFullExtraction)
```

`requiredWorkersForFullExtraction`は現行の`4 + deposit.richness * 6`を「フル稼働に必要な労働力」として転用できる（現状は自己参照で無意味だが、意味を持たせ直せる）。`availableBurgAdults`は`burg.demographics.maleAdults + femaleAdults`から、農業労働力と同様に安全余力を残す（[population-food-supply.md](../simulation/population-food-supply.md)の`FARM_LABOUR_SAFETY_MARGIN`に相当する概念を都市労働にも導入するか要検討）。

`MAX_INDUSTRIAL_WORKFORCE_SHARE`のような「Burg成人のうち工業へ割ける上限比率」は、`strategicLaborMarkets.ts`の`WORKFORCE_SHARE = 0.3`と役割が重なる。単一のBurgが鉱業・製錬・造船戦略労働・港湾交易のすべてで人口を奪い合う可能性があるため、**Burg単位の産業労働力上限（例: 成人の50〜70%）を先に決め、鉱業・製錬・造船戦略労働がその枠を分け合う**設計にすべきか、次セッションの決定事項とする。

### 3.3 港湾・交易雇用 — `LaborMarket`へ`"trade"`職種を追加する

[shipbuilding-industrial-policy.md](shipbuilding-industrial-policy.md)が既に`"trade"`をコメントで予告している通り、`LaborMarket`へ`trade`（または`portLabor`）職種を追加し、Market圏の交易量（`Caravans`の到着量、`BurgMarketLedger`の取引実績、`searoute`接続の有無）から需要を計算する。既存の`getDesiredWorkers`/`moveWorkersTowardDemand`の仕組みをそのまま再利用できる。

初期の優先順位は既存の§5.2（megacity-food-import-economy.md）と揃える。

1. 稼働中の資源事業（鉱業・製錬、本書§3.2）
2. 河川水運
3. 海路へ実際に接続した港（`port && searoute`）
4. 道路・市場による陸上交易

> **実装（Phase 2、§0参照）**: 決定6により、上記優先順位づけは初期実装では採用せず、需要指標を`Caravans.tick()`到着時の積載量（`Market.caravanArrivalVolume`、半減期60日で減衰）のみに絞った。`BurgMarketLedger`実績・`searoute`接続本数・河川水運/海路/陸上交易の優先順位反映は、必要になった時点で`strategicLaborMarkets.ts`の`getDemandMultiplierByOccupation()`に追加できる形にしてある。

### 3.4 行政・首都雇用

`burg.capital`（州都・首都）を持つBurgに、Stateの人口・領域規模に応じた行政雇用を加える。既存の`getBurgLocationBonus`（[developmentPotential.ts:164](../../src/extensions/economy/generators/developmentPotential.ts#L164)）が`capital`に静的加点しているのと役割を分けること — あちらは移住先の魅力度、こちらは実際の雇用者数。初期式は最も単純に「Stateの総人口 × 小さな定数比率」から始めることを推奨する（詳細は次セッションで決定）。

> **実装（Phase 3、§0参照）**: `administrationEmployment.ts`の`getAdministrationRequiredWorkers()`が`4 + (state.rural + state.urban) * 0.005 + state.burgs * 1`を返す。`state.capital`Burgのみを対象とし（州都・属州都は対象外、必要になれば`Province.burg`も同じ枠組みに追加できる）、`basicEmployment.ts`の年次リコンサイルへBurgアンカー型スロットとして統合、同一Burg内では行政 → 鉱山 → 製錬所の順で成人プールを割り当てる。州都が別Burgへ移る／州が消滅すると、翌年の再構築で古い記録は再生成されず自然に消える。

### 3.5 サービス業雇用（非基盤雇用）— ユーザーの洞察をそのまま式にする

基盤雇用（鉱業・製錬・港湾交易・行政の合計）に対して、一定の乗数でサービス業雇用を派生させる。経済地理学の「経済基盤乗数（economic base multiplier）」の考え方をそのまま流用する。

```text
serviceEmploymentDemand[burgId] = basicEmploymentDemand[burgId] × serviceMultiplier
employmentDemand[burgId] = basicEmploymentDemand[burgId] + serviceEmploymentDemand[burgId]
```

`serviceMultiplier`の値は要確認。前近代都市では非基盤（サービス・小売・职人）人口が基盤人口と同程度かそれ以上になることが多いが、飲食店という業態そのものが近世以降に一般化した点には注意する（中世都市の「サービス業」は宿・酒場・市場仲買・職人が中心）。初期値として1.0〜2.0の範囲を検討し、史料的裏付けは次セッションの調査課題とする。

> **実装（Phase 3、§0参照）**: `serviceEmployment.ts`が`serviceMultiplier = 1.5`を採用した（決定3。前近代都市の非基盤サービス人口は基盤人口の1〜2.5倍程度、という経済地理学の目安の中間値を暫定的に採用。史料的な精査はしていない）。`basicEmploymentDemand[burgId]`は現時点では行政＋鉱業＋製錬（Burgアンカー型のみ）の合計で、`trade`（Market圏、Phase 2）はまだ含まれていない。`basicEmploymentSummary`（新規state、`{burgId, basicEmploymentDemand, serviceEmploymentDemand}`）として`basicEmployment.ts`の年次リコンサイル末尾で保存する。

### 3.6 `employmentDemand`から`urbanLaborIntake`への接続

**決定が必要**: 受け入れ枠を`employmentDemand`の**総量**で置き換えるか、**増分**（前年比の増加分）で駆動するかを決める。

- 総量で置き換える案: `annualUrbanLaborIntake = min(effectiveCapacity - population, max(0, employmentDemand - currentEmployedPopulation))`。雇用に対して人口が既に過剰なら受け入れを止める。
- 増分で駆動する案: `annualUrbanLaborIntake = min(effectiveCapacity - population, max(0, employmentDemand_thisYear - employmentDemand_lastYear))`。新規雇用創出だけが移民を呼ぶ。

前者は「未充足の雇用がある限り都市は成長を続ける」という当初のmegacity構想に近く、後者は「新しい産業が興きた時だけ都市が伸びる」というより保守的な成長モデルになる。既存の暫定式（`population × 2%`）は前者に近い性質（既存人口起点の緩やかな自己成長）を持つため、**後方互換的には前者寄りの式を推奨する**が、無制限の都市肥大化を防ぐ安全弁（`effectiveCapacity`は既にあるが、雇用側にも上限が必要か）は次セッションで検討する。

> **実装（Phase 4、§0参照）**: 決定4どおり前者（総量駆動）を採用した。`currentEmployedPopulation`はBurgの現有成人人口（`maleAdults + femaleAdults`）として実装した — `employmentDemand`自体は既に「求人数」（成人ポイント単位）であり、`burg.population`（子供・老人を含む総人口）と単位が揃わないため。`effectiveCapacity`ベースの安全弁（`remainingCapacity`）は既存のまま維持し、雇用側には追加の上限を設けていない（決定2と整合）。

### 3.7 手工業（加工業）雇用 — 一般`Production`の実労働を`basicEmploymentDemand`へ読み込む

§2.5がまとめていた欠落「原料→製品の加工に伴う雇用」に対応する。`production-generator.ts`の`runWorkerLoop`は、レシピ（`recipes`）を持つGoods（Cloth、Garmentsなど、鉱業・製錬・採石のような専用Operationを持たない一般加工業全般）に対して、Burgの人口ポイント（`burg.population`）のうちどれだけを毎周期の加工に投入するかを既に決定している。この値（`workersUsed`）は、鉱業・製錬の`requiredWorkers`のような固定の物理式ではなく、需要（`demandCoverage`の未充足分）に応じて周期ごとに変動する。

```text
craftWorkersUsed = runWorkerLoop()の戻り値  // 今周期、加工に投入されたBurg人口ポイント
craftEmploymentDemand[burgId] = smoothCraftWorkers(前回値, craftWorkersUsed)  // 指数平滑（係数0.2）
basicEmploymentDemand[burgId] += craftEmploymentDemand[burgId]
```

`trade`（§3.3）と同じ理由で、年次リコンサイルのスロット競合（`remainingAdults`を奪い合う仕組み）には含めず、読み取り専用で合算する: `runWorkerLoop`が消費する労働力プール（`burg.population`）は、年次スロットが参照する`demographics.maleAdults + femaleAdults`（`remainingAdults`）とは別会計であり、ここでスロットとして二重に差し引くと、同じ人口が「鉱業に割り当てられている」かつ「加工にも割り当てられている」という矛盾ではなく、単に一方の会計から不当に差し引かれるだけになってしまう。

> **実装（Phase 6、§0参照）**: `craftEmployment.ts`（新規）の`smoothCraftWorkers()`が上記の指数平滑を行い、`production-generator.ts`の`startProductionCycle`/`produceForBurg`/`finishProductionCycle`が毎周期`craftEmployment`スライス（`CraftEmploymentRecord[]`）を更新する。`basicEmployment.ts`は`trade`と並ぶ第5の入力としてこれを読み取り、`basicEmploymentDemand`に合算する。

### 3.8 戦略産業雇用（forestry/sailmaking/ropeMaking/tarBurning）— `trade`と同じ帰属をその他の`LaborMarket`職種にも広げる

§2.3で先に決定・実装されていた`LaborMarket`（`strategicLaborMarkets.ts`）は、`trade`を含む5職種（`STRATEGIC_OCCUPATIONS`）すべてでMarket圏人口の30%を再配分するコホートを持つ。しかし`basicEmployment.ts`が`basicEmploymentDemand`へ帰属させていたのは`trade`だけで、造船（および一般Wood供給）の資材を支える`forestry`/`sailmaking`/`ropeMaking`/`tarBurning`の4職種は、実データ（`workersByOccupation`）が存在するにもかかわらず一度も雇用集計に反映されていなかった。Phase 6が一般`Production`について埋めた穴と同型の欠落である。

```text
strategicIndustryWorkers[burgId] = Σ(forestry, sailmaking, ropeMaking, tarBurning)の該当MarketのworkersByOccupation
basicEmploymentDemand[burgId] += strategicIndustryWorkers[burgId]
```

`trade`と同じ理由（`LaborMarket`はBurg人口を物理的に減らさない内部比率であり、年次スロットの`remainingAdults`とは別会計）で読み取り専用として扱う。造船の船体建造そのもの（`SHIPYARD_BUILD_POINTS_PER_YEAR`という固定ペース＋資材/tech gate）には労働力概念がなく、これは意図的な設計（施設の存在自体が主要な制約）と判断し、本フェーズの対象外とした。

> **実装（Phase 7、§0参照）**: `basicEmployment.ts`に`getStrategicOccupationWorkersByBurg(occupations)`共通ヘルパーを追加し、`getTradeWorkersByBurg()`をこの上に再実装、新規`getStrategicIndustryWorkersByBurg()`が残り4職種を同じ方式で帰属させる。`basicEmploymentDemand = 行政 + 鉱業 + 製錬 + 交易 + 戦略産業 + 手工業`。Employment Overviewに「Industry」列を追加。

## 4. 実装フェーズ（暫定・次セッションで確定）

進捗はコードとテストで確認できる状態だけを`[x]`とする。

### Phase 1 — 鉱業・製錬雇用をBurgへ接続する

- [x] `MineOperation.workers`を「フル稼働に必要な労働力」に対する実雇用（Burg成人人口の内訳、§0参照）として再定義し、Burgの成人バケットから年次で緩やかに増減させる。既存の`4 + deposit.richness * 6`を必要労働力の基準値として転用する（`getMineRequiredWorkers`）。
- [x] `SmelterOperation`に`workers`フィールドを追加し、同様の年次雇用調整を行う（必要労働力は`4 + annualCapacityTons * 0.05`、要校正）。
- [x] 一Burgが複数の産業（鉱業・製錬）で人口を奪い合う際の割当順序を実装する。決定2により上限は設けず、同一Burg内では鉱山を製錬所より先に割り当てる（`basicEmployment.ts`）。造船戦略労働・港湾交易との共有はPhase 2以降で対応する。
- [ ] `farmLaborRequired`/`migratableAdults`との整合性を確認する。都市に移住した成人が鉱業・製錬労働力の供給源になるため、農村側の安全余力とは別に「都市成人のうち何割が実際に雇用されているか」を追跡する。

### Phase 2 — 港湾・交易雇用

- [x] `LaborMarket`（`strategicLaborMarkets.ts`）へ`trade`職種を追加する。
- [x] Market圏の交易量から需要を算出する（決定6によりCaravan到着量のみ。`Market.caravanArrivalVolume`、半減期60日で減衰）。
- [ ] ~~既存の優先順位（河川水運 > 海路接続港 > 陸上交易）を需要重みへ反映する~~ — 決定6によりCaravan到着量のみに単純化されたため対象外（`BurgMarketLedger`実績・`searoute`接続本数を使う優先順位づけは、必要になれば`getDemandMultiplierByOccupation`に後から追加できる）。
- [x] `portTradeEmployment[burgId]`としてBurgへ帰属させる集計（Phase 4で実装、`basicEmployment.ts`が`market.centerBurgId`へ帰属）。

### Phase 3 — 行政・首都雇用とサービス業雇用

- [x] 首都Burg（`state.capital`）の行政雇用を実装する（`administrationEmployment.ts`。属州都Burgは対象外、§3.4参照）。
- [x] `serviceEmploymentDemand`（基盤雇用への乗数）を実装する。乗数の初期値は史料からの精密な校正ではなく、決定3どおり「それらしい」暫定値（1.5）を採用した（`serviceEmployment.ts`）。史料的な精密校正はPhase 5のバランス調整に持ち越す。

### Phase 4 — `employmentDemand`を`urbanLaborIntake`へ接続する

- [x] `basicEmploymentDemand` + `serviceEmploymentDemand` = `employmentDemand`を集計する（`basicEmploymentSummary`。`trade`のBurg帰属をPhase 2から前倒しで統合）。
- [x] §3.6の「総量駆動」か「増分駆動」かを決定し（決定4＝総量駆動）、新関数`calculateAnnualUrbanLaborIntakeFromEmploymentDemand`で置き換えた。既存の`businessCycle`/`localVariation`は雇用創出速度の揺らぎとして残した（雇用側計算はPhase 1〜3どれも乱数を持たないため重複なし）。
- [x] `ruralUrbanMigration`オプション（[optionsState.ts](../../src/store/optionsState.ts)の`"independent" | "megacity"`）がoffの間は本モデルを一切評価しないことを確認する回帰テストを追加する（`urbanLaborIntake.test.ts`）。

### Phase 5 — UI・可視化・バランス

- [x] Burg詳細に基盤雇用・サービス業雇用の内訳を表示する（`BurgEditorDialog.tsx`の「Basic employment」「Service employment」行）。
- [x] 既存のFrontier Status panel・Tools panelと同様の透明性で、`employmentDemand`の内訳をデバッグ表示できるようにする（Employment Overviewダイアログ、Tools → Edit → Employment）。
- [x] seed固定シナリオで、鉱山を持つ都市と持たない都市の成長曲線を比較した（実機確認: seed `phase5-verify`）。小規模Burgの人口急減はmegacity/independent両モードで同一に発生する既存の人口シミュレーション側の変動と確認し、本計画由来の問題ではないことを確認した。`serviceMultiplier`・行政雇用係数の史料的な精密校正は決定3の方針により見送り、今後の継続課題として残す（上記「既知の影響」を参照）。

### Phase 6 — 手工業（加工業）雇用（§3.7）

- [x] `production-generator.ts`の`runWorkerLoop`が返す実測値（レシピ加工に投入されたBurg人口ポイント）を`craftEmployment.ts`の`smoothCraftWorkers()`で指数平滑する。
- [x] `basicEmployment.ts`の年次集計へ`trade`と同じ「読み取り専用」方式で合算し、`basicEmploymentDemand = 行政 + 鉱業 + 製錬 + 交易 + 手工業`とする。
- [x] Employment Overviewダイアログに「Craft」列を追加する。Burg Editorの「Basic employment」表示は既存コードのまま自動的に反映される。
- [ ] seed固定シナリオでの実機確認（鉱山を持たないがCloth/Garments加工が盛んなBurgが`serviceEmploymentDemand`経由で成長するか）はまだ行っていない。既知の影響（§2.5表の「基盤産業のない大多数のBurgは`employmentDemand`が0のまま」）を、手工業だけでどこまで緩和できるかはPhase 7以降のバランス調整課題として残す。

### Phase 7 — 戦略産業雇用（forestry/sailmaking/ropeMaking/tarBurning、§3.8）

- [x] `basicEmployment.ts`に`getStrategicOccupationWorkersByBurg(occupations)`共通ヘルパーを追加し、`getTradeWorkersByBurg()`をその上に再実装する。
- [x] `getStrategicIndustryWorkersByBurg()`（forestry/sailmaking/ropeMaking/tarBurningの合計）を追加し、`trade`と同じ読み取り専用方式で`basicEmploymentDemand`へ合算する。
- [x] Employment Overviewダイアログに「Industry」列を追加する。
- [ ] 造船の船体建造自体（`SHIPYARD_BUILD_POINTS_PER_YEAR`固定ペース）に労働力ゲートを設けるかどうかは、意図的に対象外とした（§3.8参照）。将来検討する場合は別途決定が必要。
- [ ] seed固定シナリオでの実機確認（forestry等が盛んなBurgが`employmentDemand`経由で成長するか）はまだ行っていない。

## 5. 未決定事項（次セッション冒頭で確認する）

1. 鉱業・製錬雇用をBurgアンカー型（§3.2案）にするか、`LaborMarket`のMarket圏cohortに統一するか。
2. Burg単位の産業労働力上限（鉱業・製錬・造船戦略労働・港湾交易が共有する成人比率の上限）をいくつにするか、そもそも共有上限を設けるか。
3. `serviceMultiplier`の初期値と、前近代都市の職業構成に関する史料的根拠。
4. `employmentDemand`を総量駆動にするか増分駆動にするか（§3.6）。
5. 行政雇用の具体的な算出式（Stateの何に比例させるか: 人口、Burg数、Provinces数など）。
6. 港湾・交易雇用の需要をどの既存データ（Caravan到着量、`BurgMarketLedger`、`searoute`本数）から導出するか。

### 5.1 意思決定

1. Burgアンカー型
2. (食料供給がある限り)上限を儲けない。人口が増える間は住宅建設等の仕事も増えて良い。
3. serviceMultiplierの値は調査してからそれっぽく見える値を入れておいて、調整前提で正しさは求めすぎなくて良い。
4. 総量駆動
5. まずは人口とBurg数。治安維持の為の衛兵も必要と思われる。
6. Caravan到着量のみでスタート。積荷を載せ替える人足が必要。

## 6. 不変条件（暫定）

- economy無効時、または`ruralUrbanMigration`が`"independent"`の間は、本モデルは一切評価されず、既存の人口自己参照式のみが使われる。
- `MineOperation`/`SmelterOperation`の`workers`は、Burgの`population`/`demographics`を書き換えない内訳（サブセット）である（§0の設計確定）。`getBurgDemographics`（`demographicTransfer.ts`）は読み取り専用で使い、Burg人口の複製・消滅を起こさない。Burg人口そのものを動かすのはPhase 4で`employmentDemand`を`urbanLaborIntake`に接続した後。
- `employmentDemand`は決定的に再計算し、保存データとしては経済拡張スライス（`simulation.extensions.economy`）に留める。core `pack`スキーマは増やさない。
