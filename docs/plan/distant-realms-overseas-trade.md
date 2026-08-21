# 遠方諸国との海外交易（Distant Realms / Overseas Trading Companies）

| 項目 | 内容 |
| :-- | :-- |
| Status | **Phase 0 + Phase 1 + Phase 2 + Phase 3 implemented**（2026-08-21）；Phase 4–5 未実装 |
| 対象 | Economy拡張（新規モジュール）、Shipbuilding拡張（`ShipHull` 予約・duty）、Goods新規追加 |
| 前提 | [merchant-transport-asset-ledger.md](merchant-transport-asset-ledger.md)、[vessel-itinerary-and-finite-trade-fleet.md](vessel-itinerary-and-finite-trade-fleet.md)、[shipbuilding-initial-fleet.md](shipbuilding-initial-fleet.md)、[state-treasury-department-budget.md](state-treasury-department-budget.md)、[staple-crop-climate.md](staple-crop-climate.md) |
| 調査日 | 2026-08-21 |

---

## 実装メモ（Phase 0–3、2026-08-21）

新規ファイル: `overseasRelationsTypes.ts`（型）、`overseasVoyageRisk.ts`（純関数：気候差・海難/海賊リスク・PowerTier別レート）、`overseasRelations.ts`（`OverseasRelations`シングルトン：seed・遠征発航・月次決済）、`store/overseasRelationsState.ts` + `controllers/overseasRelations.ts` + `ui/dialogs/OverseasRelationsDialog.tsx`（一覧＋「交易遠征を送る」ボタン）。`economyContext.ts`にDistantRealm/OverseasRelationLedger/OverseasExpeditionの永続化スロットを追加し、`index.tsx`のTools「Overseas Relations」ボタン・`production-generator.ts`の月次決済（`TradeSecurity.settleMonthly()`と同じ枠）に接続済み。テストは`overseasRelations.test.ts`（seed冪等性、国庫不足、船プール枯渇、共有プール減少、成功/喪失の決済）で、`npm run build`相当のtsc・biome・vitest（economy配下206ファイル/1542件）はすべて green。

設計からの変更点3つ：

1. **リスク判定は往路/復路を分けず、往復1回のロールに圧縮**（§6の「1レグごと」は見送り）。`computeRoundTripLossRisk`が片道リスクを2乗合成する形で近似。
2. **船級tier下限（caravel以上）は強制せず、リスク側の`SEAWORTHINESS_BY_TIER`だけで弱いincentiveを掛ける。** `MerchantTransportAssets.reserve()`はtierでの絞り込みに対応しないため、ハードゲートではなくソフトな損失率差で表現。
3. **国庫との出入りは「船倉いっぱいの商品価値」ではなく、小さな定額（`EXPEDITION_BASE_INVESTMENT`基準）にスケールダウン。** `state.treasury`は他の財政レバー（州の部門予算など）と同じ十〜数十のスケールで動いており、Good.valueとcargoSlots通りに掛け算すると2桁以上ズレる。詳細はdocs/plan/state-treasury-department-budget.mdのスケール感、実装は`overseasVoyageRisk.ts`のコメント参照。

「喪失」時のship pool挙動は既存の`MerchantTransportAssets.settleCaravan(..., "lost")`をそのまま再利用しており、恒久的な撃沈ではなく**既存のcaravan喪失と同じ30日メンテナンス**（`releaseMerchantHullsFromCargo`）に落ちる。設計doc§7が示唆する「恒久喪失」は、Shipbuilding側にハル削除の新イベントを追加する変更になるため今回は見送り、Phase 2以降の課題として残す。

新規Good（Cocoa/Coffee/Maize/Rubber）はPhase 5のまま未着手。Phase 1のspecialtyGoodNamesは既存カタログ（Spices/Silk/Furs/Dyes等）から選定している。

### Phase 2（2026-08-21）

国有`ShipHull`を遠征ごとの護衛艦として0〜3隻選べるようにした。EconomyとShipbuildingの間は既存と同様の同期イベント境界で、利用可能艦照会・予約・帰還を行う。護衛艦は`duty: "overseas"`で往復中は哨戒・航海収入から外れ、遠征解決時に哨戒へ戻る。遠征喪失時は商船と同じく30日整備に入る（恒久撃沈は引き続き将来課題）。`escortRatio`を`computeRoundTripLossRisk`へ渡し、海難率は変えず海賊率だけを低減する。Vessel assets UIには`Overseas escort`状態を表示する。

### Phase 3（2026-08-21）

「貢納を要求する」と「略奪する」を追加した。どちらも護衛艦1隻以上と商船輸送枠を必要とし、貢納は同格/弱いRealm、略奪は弱いRealmだけに許可される。航海を無事終えた後に、防衛力・護衛数・国力差・既存関係から成る成功判定を行う。貢納成功は一時収入と`tributary`化、略奪成功はより大きい一時収入と`hostile`化をもたらす。撃退・航海喪失も敵対化する。朝貢国は`settleMonthly()`でRealmの抽象国富に比例する収入を国庫へ納める。

---

## 0. 目的

地図に描画されない「海の果ての国家（遠方諸国 = Distant Realm）」を導入し、船（特に外洋航行可能な船級）を持つ国家がそれらと関係を持てるようにする。

- 相手国は自国より**強い／同格／弱い**のいずれかで、気候帯も特産品も自国と大きく異なる。
- **強い相手**とは交易のみ。**弱い相手**からは**収奪**（貢納・略奪）や**統治（プランテーション化）**が可能。統治には軍の派遣を含む継続的な資金負担が要る。
- 気候差が大きい特産品ほど航路が長くなり、**海賊・海難による喪失リスク**が上がる。武装した船（護衛）を同行させるとリスクを下げられる。
- 遠方への船の派遣は、近海交易に使える船の在庫を直接圧迫する（共有プールからの取り合い）。
- Economyの本島シミュレーション（Market/burg単位の需給・雇用・価格）ほどの複雑さは持たせず、東インド会社的な活動を**数値集計で抽象化**する。

想定例（欧州スタート）: 温暖な地方から**香辛料・カカオ・ジャガイモ・トウモロコシ・コーヒー・ゴム**を仕入れる。

---

## 1. 既存コードとの接続点（この設計が乗る土台）

新規に発明する部分をなるべく減らし、既存の仕組みに寄せる。

| 既存資産 | ファイル | 本機能での再利用方針 |
| :-- | :-- | :-- |
| `Good` / `GoodTradeProfile`（weight/bulk/rarity/distancePremium/lossRisk 等） | [goodsGeneratorTypes.ts](../../src/extensions/economy/generators/goodsGeneratorTypes.ts) | 新規Good（Cocoa/Coffee/Maize/Rubber等）をこの枠組みでそのまま追加。既存の`Spices`等も遠方諸国の輸入対象に流用可 |
| `StapleCropProfile`/`PerennialCropProfile`（温度・降水レンジ） | [stapleCrops.ts](../../src/data/stapleCrops.ts), `perennialCrops.ts` | 新規作物の気候要件定義に流用。地図側に該当バイオームが無ければ自然と国内生産ゼロになり、「遠方国家頼み」が自動的に成立する |
| `SHIP_CLASS_DEFINITIONS`（sloop/caravel/galleon/steamship, tier） | [shipClasses.ts](../../src/types/shipClasses.ts) | tier別の外洋適性・喪失耐性の元ネタ。`tier ≥ 1`（caravel以上）を遠洋遠征の下限とする |
| `MerchantTransportLedger.waterAssets` / `TransportReservation`（available/reserved/inTransit/maintenance） | [marketTypes.ts](../../src/extensions/economy/generators/marketTypes.ts), [merchantTransportAssets.ts](../../src/extensions/economy/generators/merchantTransportAssets.ts) | **「遠方へ送ると近海交易船が減る」を新配管なしで実現**：遠征は同じ船体プールから`reserved`→`inTransit`で確保し、往復が終わるまで国内交易は使えない |
| `ShipHull`（owner: state/merchant, `duty: "patrol"`） | [shipyardQueue.ts](../../src/extensions/shipbuilding/generators/shipyardQueue.ts), [shipyardQueueTypes.ts](../../src/extensions/shipbuilding/generators/shipyardQueueTypes.ts) | 「武装船」を新ステータスとして発明せず、**国有海軍船体＝事実上の武装船**として護衛に流用。`isStateAtWar()`により戦時は海軍が本国に拘束される既存ロジックとも整合 |
| `TradeSecurityModule`（0..1 investmentLevel、月次決済、caravan損失カウンタ） | [tradeSecurity.ts](../../src/extensions/economy/generators/tradeSecurity.ts) | 「海賊対策への投資レバー」「月次で治安費を国庫から引く」のパターンをそのまま海上版に転用 |
| `escortRouteThreat.ts`（danger→threatScore→fee の純関数群） | [escortRouteThreat.ts](../../src/extensions/economy/generators/escortRouteThreat.ts) | 陸路の脅威計算と同じ「純関数＋乗算合成」の書き方を海路リスクにも踏襲 |
| `resolveFoodImportNetwork`（四半期抽象決済、`securityRisk`フィールド） | [foodImportNetwork.ts](../../src/extensions/economy/generators/foodImportNetwork.ts) | 「burg単位の細かい処理を経ずに、集計値で航路の損失率を出す」という抽象度の先例。遠方諸国モジュールも同じ荒さで良い |
| `warFooting.ts`（レバーで予算配分を再配分する形） | [warFooting.ts](../../src/extensions/economy/generators/warFooting.ts) | 統治（コロニー）維持費の国庫負担レバーの書式に流用 |
| `MilitaryRegiment.garrisonHost`（vassal領への駐留） | [models.ts:1141](../../src/types/models.ts#L1141) | 「本国外に部隊を置くと継続コストが要る」という概念の前例。ただしDistantRealmは実State/座標を持たないため**実Regimentは再利用せず**、抽象的な駐留戦力レジャーで代替（§5） |
| `checkForeignInterference`（複合確率 `1-(1-p)^n`） | [foreignInterference.ts](../../src/extensions/shipbuilding/generators/foreignInterference.ts) | 遭難・海賊の複合ロス確率の書き方をそのまま踏襲（無関係なスタブだが式の型として妥当） |

つまり新規に用意する必要があるのは、**(a) DistantRealmという軽量データ、(b) 遠征（Expedition）という遷移ロジック、(c) 海上版リスク計算、(d) 統治レジャー**の4つだけで、輸送・在庫・国庫は既存配管に乗せる。

---

## 2. データモデル

### 2.1 `DistantRealm`（遠方国家）

Stateの完全な代替ではなく、フレーバーと数値のみを持つ軽量エンティティ。座標・cellsを持たないため地図には描画しない（発見済みならUIリスト上にのみ存在）。

```ts
type ClimateBand = "polar" | "temperate" | "arid" | "subtropical" | "tropical";
type DistanceBand = "nearAbroad" | "farAbroad" | "remote";
type PowerTier = "weaker" | "comparable" | "stronger"; // 接触した自国から見た相対評価。国ごとに動的算出
type RealmRelation = "unknown" | "contacted" | "trading" | "tributary" | "colony" | "hostile";

interface DistantRealm {
  i: number;
  name: string;               // フレーバー生成
  climateBand: ClimateBand;
  distanceBand: DistanceBand; // 航路長 = リスクと往復日数の主要因
  powerScore: number;         // 自国の overseasProjectionScore と比較して PowerTier を導出（§3）
  specialtyGoodIds: number[]; // このRealmが輸出する Good（新規Goodか既存Goodの高価値バリエーション）
  wealthLevel: number;        // 収奪・貢納の原資となる抽象国富
  defenseScore: number;       // 遠征失敗率・反乱率に使う抽象防衛力
  discoveredByStateId?: number;
}

/** 国家 × DistantRealm の関係。複数国が同じRealmと別々の関係を持てる */
interface OverseasRelationLedger {
  stateId: number;
  realmId: number;
  relation: RealmRelation;
  relationScore: number;         // 0..100 目安。貿易継続や貢納要求の可否閾値
  colonyGarrisonRequired?: number;
  colonyGarrisonFunded?: number; // §5 参照
  monthsUnderfunded: number;     // 反乱カウンタ
}
```

### 2.2 `OverseasExpedition`（遠征＝往復1回分の航海）

```ts
type ExpeditionPurpose = "trade" | "tribute" | "raid" | "colonizeInitial" | "colonyResupply";

interface OverseasExpedition {
  id: number;
  stateId: number;
  realmId: number;
  purpose: ExpeditionPurpose;
  cargoHullIds: number[];   // MerchantWaterAssetReference.shipHullId を予約
  escortHullIds: number[];  // 国有 ShipHull（duty: "patrol"→遠征中は "escort" 相当）
  reservationId: number;    // 既存 TransportReservation の枠組みを流用
  departedTick: number;
  etaTick: number;          // 距離帯から算出（§4）
  state: "outbound" | "atRealm" | "returning" | "resolved";
}
```

新規の`Good`フィールドは追加しない。代わりに「どのGoodをどのRealmが輸出するか」は`DistantRealm.specialtyGoodIds`側に持たせ、`Good`本体は既存の`GoodTradeProfile`をそのまま使う（"仕入れ値の遠隔割増"は§6のExpedition決済側で掛ける。Good自体を汚さない）。

---

## 3. 「強い／同格／弱い」の判定

Stateの総合国力のような指標は現状コードベースに存在しない（`military-generator.ts`等にも汎用の power comparator は無い）。既存の外交システムに深入りせず、**海外遠征専用の軽量指標**を新設する。

```
overseasProjectionScore(state) =
    Σ over state-owned ShipHull { (tier + 1) * navalCrewCapacity }   // 保有海軍力
  + treasuryReserve(state) * WEALTH_WEIGHT                            // 遠征を賄える体力
```

`DistantRealm.powerScore` は生成時に固定で振っておき、`PowerTier`は接触時に動的算出：

| 比 (`state.score / realm.powerScore`) | PowerTier |
| ---: | :-- |
| < 0.7 | stronger（相手が強い） |
| 0.7〜1.4 | comparable |
| > 1.4 | weaker（相手が弱い） |

これにより**序盤（貧弱な海軍）はほぼ全Realmがstronger＝交易のみ**、海軍を育てて初めて収奪・統治が解禁される、という自然な進行になる。国ごとにスコアが変わるため、同じRealmでも大国から見れば「弱い」、小国から見れば「強い」になり得る（マルチステート下で意味のある非対称性）。

---

## 4. 航路と距離帯

| DistanceBand | 片道日数目安 | 現地滞在（積込/商談） | 想定気候差 |
| :-- | ---: | ---: | :-- |
| nearAbroad（近隣外地） | 35–50日 | 10日 | 隣接気候帯1段差 |
| farAbroad（遠隔外地） | 70–100日 | 15日 | 2段差 |
| remote（絶域） | 120–170日 | 20日 | 3段差以上（対蹠地イメージ） |

気候帯は `polar < temperate < arid/subtropical < tropical` のような**自国気候からの段差**として扱う（気候帯そのものの絶対距離ではなく、「どれだけ毛色が違うか」）。自国の気候は本国首都burgの`grid.cells.temp`から代表値を取る。段差が大きいほど§6のリスク倍率が上がる、というのが「気候の大きく違う特産品ほど航海が長くリスクが高い」という要件の実装。

Expeditionの `etaTick` は `departedTick + 2 * oneWayDays + stayDays`（既存の`tradeRouteDuration.ts`にある港湾切替ペナルティ`PORT_TRANSFER_PENALTY_DAYS`と同じ発想で、現地滞在日数を別枠として加算）。

---

## 5. 関係アクション

| 関係 | PowerTier前提 | 内容 | コスト | リターン |
| :-- | :-- | :-- | :-- | :-- |
| **貿易 (trading)** | いずれでも可 | 特産品を仕入れ、国内余剰品を売却 | 船の往復拘束＋積荷原価 | `GoodTradeProfile.distancePremium`込みの売却益。stronger相手ほど買値は安く売値は渋い（弱者側の足元は見ない）、weaker相手ほど買い叩ける（§6の交易レートに反映） |
| **貢納要求 (tribute)** | weaker/comparable | 一回限りの武力威圧遠征。成功で`realm.wealthLevel`から一括徴収＋恒常tributary化（毎月少額の貢納） | 護衛艦の同行必須、`defenseScore`に応じた失敗率（失敗＝艦喪失＋relation "hostile"化） | tributary成立後は月次で自動収入（TradeSecurity.settleMonthlyと同じ形の決済関数） |
| **略奪 (raid)** | weaker のみ | 一回限りの略奪遠征。tributeより高い期待値だが**恒常関係は破壊**（以後 hostile、再訪は危険） | 護衛艦必須、貢納より高い失敗率許容の代わりに高リターン | `wealthLevel`の大きな割合を即座に獲得 |
| **統治／プランテーション化 (colonize)** | weaker のみ | ①初期遠征（軍を送り込み現地権力を制圧）→②成功でrelation "colony"化、以後は特産品を**継続的に**、通常貿易より大幅に安いコストで産出 | ①一時金（`defenseScore`に比例）＋②月次駐留維持費（§5.1） | 継続的な特産品供給（Marketへの直接搬入、burg単位の生産処理は経由しない）。維持費を怠ると反乱で喪失 |

貿易/貢納/略奪/統治は排他ではなくrelationの状態遷移として繋がる： `unknown → contacted → trading → (tributary | colony)`。tradingを経ずにいきなり武力行使することも可能（初手raidなど）だが、relationScoreが低いままだと成功率補正が悪い、という形でロールプレイ上の一貫性を軽く誘導する。

### 5.1 統治の維持費（garrison ledger）

`MilitaryRegiment.garrisonHost`（vassal駐留の先例）はcellsを持つ実Stateを要求するため、DistantRealmには使えない。代わりに `OverseasRelationLedger.colonyGarrisonRequired/Funded` の2数値だけで表現する：

- 月次決済（`warFooting.ts`のレバー処理や`TradeSecurityModule.settleMonthly`と同型の関数）で国庫から維持費を引き落とし、`colonyGarrisonFunded`を更新。
- `funded < required`が続くと`monthsUnderfunded`が増加し、閾値超過で植民地産出が減衰→最終的に反乱で`relation`が`hostile`に戻る（コロニー喪失、艦・投資の回収不可）。
- 維持費は「現地に部隊がいる」というフレーバーのみで、実際のManpower/Regimentは消費しない（Phase 1では治安コストだけ。実部隊派遣とのリンクは将来検討、§8参照）。

---

## 6. 遠洋リスク計算（純関数、`escortRouteThreat.ts`と同型）

1レグ（片道）ごとに評価し、往路・復路で個別に判定する。

```
climateGapSteps        = |homeClimateOrdinal - realm.climateBand ordinal|
climateGapMultiplier    = 1 + CLIMATE_GAP_WEIGHT * climateGapSteps      // 遠い気候ほど航海が過酷

shipwreckRisk = clamp01(
  BASE_WRECK_RATE[distanceBand]
  * (1 - SEAWORTHINESS_BY_TIER[cargoShipClass.tier])
  * climateGapMultiplier
)

escortRatio       = escortHullIds.length / (cargoHullIds.length + escortHullIds.length)
piracyRisk = clamp01(
  BASE_PIRACY_RATE[distanceBand] * (1 - escortRatio * ESCORT_EFFECTIVENESS)
)

totalLossRisk = 1 - (1 - shipwreckRisk) * (1 - piracyRisk)   // checkForeignInterferenceと同じ複合確率の形
```

- `BASE_WRECK_RATE`・`BASE_PIRACY_RATE`は`distanceBand`ごとに上昇するテーブル定数（nearAbroad小さく、remote大きく）。
- 喪失判定に外れても部分損（積荷の一部ロス＝`lossRisk`ベースの品減り）は別途、既存`GoodTradeProfile.lossRisk`を流用して算出。
- 喪失が発生したら、どの船体を失うかは貨物船と護衛で確率を分ける：海賊事案は護衛が身代わりになりやすい（護衛喪失率高め）、海難事故は等確率。
- 失われた`shipHullId`は`ShipHull`から除去（[vessel-itinerary-and-finite-trade-fleet.md](vessel-itinerary-and-finite-trade-fleet.md)の「有限艦隊」思想と一致：遠征の艦喪失は本国の艦隊数を恒久的に減らす）。

### 交易レートへのPowerTier反映

```
buyPriceMultiplier  = stronger ? 1.15 : comparable ? 1.0 : 0.75   // 弱い相手ほど買い叩ける
sellPriceMultiplier = stronger ? 0.85 : comparable ? 1.0 : 1.10   // 強い相手には売り込みにくい
```

（数値は仮。既存`distancePremium`/`TradeTrend`と乗算合成する形にすれば、既存の交易損益計算パイプラインに素直に乗る）

---

## 7. 船の在庫圧迫（共有プール）

新しい船種・新しい在庫テーブルは作らない。`OverseasExpedition`は他のCaravanと同じ`TransportReservation`機構で`MerchantTransportLedger.waterAssets`から`available`な`shipHullId`を`reserved`→`inTransit`に遷移させるだけでよい。往復日数がnearAbroadでも70〜100日超と、国内航路（既存`DEFAULT_MAX_WAIT_DAYS_SEA`桁の待機日数）より一桁長いため、**遠征に出した分だけ国内交易の空き船が長期間減る**という要件は追加ロジック無しで成立する。護衛艦（国有`ShipHull`）も同様に、遠征に出ている間は本国の哨戒（`duty: "patrol"`）に戻れない。

Vessel assets UI（[vessel-assets-overview.ts](../../src/extensions/shipbuilding/controllers/vessel-assets-overview.ts)）にも "Overseas" のような状態ラベルを1つ足すだけで、プレイヤーは「今何隻が海外に出ているか」を既存画面で確認できる。

---

## 8. UI設計

新規ダイアログ「Overseas Relations（対外交易）」を、既存の`MarketTradeOpportunitiesDialog`/`TradeAnimationDialog`と同系統のスタイルで追加。

- 一覧列: 国名、気候帯アイコン、特産品、PowerTier badge（弱/同格/強）、現在の関係、距離帯、直近の遠征状況。
- 行アクション: 「交易遠征を送る」「貢納を要求する」「略奪する」「統治を開始する」（relation/tierに応じて非活性化）。
- ヘッダ部に「海外遠征に出ている船: X隻 / 本国で利用可能な船: Y隻」を常時表示し、プールの取り合いを明示。
- 統治中Realmには`colonyGarrisonFunded/Required`のミニプログレスバー（TreasuryOverviewDialogの予算バーと同じ見た目）。

---

## 9. Tickへの組み込み

`src/extensions/economy/index.tsx`の`TradeSecurity.generate()`/`MilitaryResources.generate()`と並べて、新モジュール（仮称`OverseasRelations`）を配置する：

```
if (value.target === "economy") OverseasRelations.generate();   // Realm/Ledger初期化（未生成時のみ）
...
measureTickStep("production:overseasExpeditions", () => OverseasRelations.settleMonthly());
```

`settleMonthly()`の中身:
1. 進行中Expeditionの`etaTick`到達判定→§6のリスク判定→損益確定。
2. コロニー維持費の引き落とし（§5.1）。
3. tributary/colonyの月次自動収入計上。

---

## 10. 新規Good候補（欧州スタート想定）

| Good | 分類 | 気候要件（既存`ClimateRange`と同型） | 既存生成経路 |
| :-- | :-- | :-- | :-- |
| Cocoa | perennial | 高温多湿（熱帯） | ほぼ地図内バイオーム非対応→遠方国家頼み |
| Coffee | perennial | 亜熱帯〜熱帯、高地可 | 同上 |
| Maize | cereal（`STAPLE_CROP_PROFILES`拡張） | 温暖〜高温 | 地図内でも一部条件で成立し得る（既存Wheat等と共存） |
| Rubber | perennial/industrial原料 | 熱帯多雨 | ほぼ地図内非対応 |
| Spices（既存） | 既存Good流用 | 熱帯 | 地図内でも少量産出、遠方国家経由なら大量・安定 |

いずれも既存の`GoodTradeProfile`（weight/bulk/rarity/distancePremium/lossRisk）にそのまま乗せられる。地図内バイオームで条件が満たされれば自然に国内生産も走るため、「遠方国家が実質唯一の供給源になるかどうか」はプレイヤーが選んだ地図次第、というのが一貫していて良い（特別扱いフラグを`Good`に足さない）。

---

## 11. 段階的実装プラン

| Phase | 内容 |
| :-- | :-- |
| 0 | ✅ 実装済み（2026-08-21）。`DistantRealm`/`OverseasRelationLedger`型定義、世界生成時のRealm seed（フレーバー名・気候帯・距離帯・powerScore・specialtyGoodIds）。UIはまだ無し |
| 1 | ✅ 実装済み（2026-08-21）。貿易のみ：Expedition発航→§6リスク判定（往復1ロールに簡略化）→損益確定→UI一覧（読み取り専用＋「交易遠征を送る」ボタンのみ） |
| 2 | ✅ 実装済み（2026-08-21）。護衛艦連携：国有`ShipHull`をescortに割当て、piracyRisk低減。Vessel assets UIに"Overseas"ラベル追加 |
| 3 | ✅ 実装済み（2026-08-21）。収奪系：貢納要求・略奪、tributary化と月次自動収入 |
| 4 | 統治系：植民地化の初期遠征、`colonyGarrisonRequired/Funded`維持費レジャー、反乱による喪失 |
| 5 | 新規Good（Cocoa/Coffee/Maize/Rubber）追加、UIの磨き込み、フレーバーイベント（Chronicle連携） |

各Phaseは独立に価値があり（Phase 1だけでも「香辛料・カカオを仕入れる」というユーザーの主要イメージは満たせる）、途中で止めても壊れない設計にしてある。

---

## 12. 検討事項（未決定・要判断）

- **統治コストと実軍事システムの接続**: §5.1では駐留維持費を治安コストのみの抽象値にしたが、`MilitaryRegiment`を実際に1個だけ「幽霊駐留」させてManpowerを消費させる案もあり得る（よりリアルだが`military-generator.ts`との結合が増える）。まずはPhase 4まで抽象値で作り、物足りなければ後付けで良さそう。
- **PowerTier判定の`treasuryReserve`重み**: 海軍力だけで決めるとNaval文化圏国家が有利に偏りすぎる可能性があり、国庫規模も混ぜているが、実際のバランスは実装後の試遊で調整が必要。
- **多国間の競合**: 複数の自国が同じDistantRealmを同時に統治しようとした場合の扱い（早い者勝ち／取り合いイベント）は今回のドラフトでは未設計。Phase 4以降の課題とする。
