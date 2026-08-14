# 戦略鉱物アクセス・輸入依存・敵対国禁輸

| 項目 | 内容 |
| :--- | :--- |
| Status | Proposed — design only |
| Scope | Economy の国家軍需向け戦略調達。通常の民間交易には適用しない。 |
| Parent | [shipbuilding-industrial-policy.md](shipbuilding-industrial-policy.md) §4.1–4.3 |
| Primary consumers | `MetallurgWork`、`MilitaryResources`、`StrategicProcurement`、`Minerals Overview` |

## 1. 結論

鉱床を持たない国でも軍需生産を止めないため、国家は **完成した Ingot を優先して輸入し、国内に
稼働可能な精錬能力があるときだけ Ore も代替候補にする**。国内鉱床が無いこと自体では無制限の
買付を発生させず、実際の軍需・整備・備蓄不足があるときにだけ国家資金で発注する。

敵対国との取引は、Wood / Tar 等と同じく **戦略物資の国家調達だけ**を双方向で禁止する。通常の
`Markets.runGlobalTrade()` は変更しない。したがって、これは全品目の戦時通商断絶ではなく、国家が
軍事転用を見込んで直接買い上げる物資への限定的な禁輸である。

この範囲は既存の `StrategicGoodsPolicy.enemyTrade = "prohibited"` を維持・一般化するものであり、
民間交易まで一括で政治化しないという Phase 9 の判断を崩さない。

## 2. 史料・研究から採る原則

前近代の交易は「平時から敵性地域の全交易を永久に止める」一様な制度ではなかった。一方で、武具、
火薬原料、船舶用品、馬、金属のように軍事能力へ直結する品には、禁輸・没収・許可制が繰り返し適用
された。次の設計判断はその区別をモデル化する。

| 観察 | 設計への反映 |
| :--- | :--- |
| 中世地中海では、木材・鉄・武器・食料などを対象とする禁輸と、航海単位または期間単位の免許・免除が併存した。[Conti, 2026](https://www.tandfonline.com/doi/full/10.1080/09503110.2026.2635260) | v1 は敵対国への直接国家調達を禁止する。密輸・個別免許は保存形式を先に固定せず、後続の外交／諜報機能として残す。 |
| 中世後期には禁輸が広く用いられる政策手段となり、ヴェネツィアの対オスマン禁輸には全面的な交易停止という局面もあった。[Carnes, *Embargo*](https://deepblue.lib.umich.edu/items/37ae0991-0950-47ef-a792-021196ab782e)、[Carnes, 2010](https://experts.azregents.edu/en/publications/devedo-the-venetian-response-to-sultan-mehmed-ii-in-the-venetian-/) | `Enemy` は買い手・売り手のどちらの立場でも戦略物資の候補から除外する。経済的な痛みは国家間で対称に残す。 |
| 1794 年の英米条約第18条は武器・火薬・硝石・弾丸だけでなく、帆・麻・索具・タール等の船舶用品も敵への輸送時に contraband とした一方、unwrought iron は除外した。[条約本文と注解](https://founders.archives.gov/documents/Hamilton/01-18-02-0281) | 物資を完成軍需品・軍需を可能にする中間財・通常品に分ける。鉄鉱石／鉄塊を常に武器と同一視せず、ゲーム上で国家の軍需注文に使われる場合だけ戦略扱いにする。 |
| ヴェネツィアとオスマンは戦争を繰り返しても、平時には相互交易と外交特権を維持した。[Metropolitan Museum of Art](https://www.metmuseum.org/toah/hd/vmos/hd_vmos.htm) | `Ally` / `Friendly` / `Neutral` を自動禁輸しない。平時の通常交易や、許可された非敵対国からの国家調達を残す。 |

このため v1 は「敵だから全品目を売らない」でも「鉄は常に禁輸品」でもない。**国家の軍事用注文が
敵に渡ることだけを止める**、限定的で検証可能なルールにする。

## 3. 現状と不足点

現行の `StrategicProcurement` は以下をすでに持つ。

1. Shipbuilding の Wood / Sails / Ropes / Tar と、`MetallurgWork` の State 軍需材料不足を国家発注に変換する。
2. `Enemy` の市場を候補から除き、国内市場を優先する。
3. 供給元在庫の 20% を残し、Caravan・国庫支出・到着在庫を通して移動させる。
4. `Iron Ingot` のような不足材料は、外部市場に同じ Good の在庫があれば、既に `metallurg` 発注として輸入できる。

しかし以下が欠ける。

| 欠けているもの | 結果 |
| :--- | :--- |
| 鉱床セルの所属 State による資源アクセス判定 | `Minerals Overview` は地質を表示できても、国家が自己供給・輸入依存のどちらかを示せない。 |
| Ingot と Ore の代替調達 | Ingot 在庫が無いが Ore がある市場、または国内精錬能力がある場合を使えない。 |
| 輸入鉱石を受け入れる精錬所 | `SmelterOperations` は採掘鉱床に紐づくため、鉱床を持たない国は Ore を Ingot に変えられない。 |
| 外交階梯を調達優先順位へ反映する表現 | 現在の `foreign` は Ally / Friendly / Neutral / Rival を一つに畳んでいる。Enemy 禁輸は正しいが、診断と順位の説明が粗い。 |
| 禁輸で止まった理由の可視化 | `foreignPolicy` はあるが、どの相手・どの戦略物資・どの関係で止まったかを Overview から読めない。 |

## 4. 用語とアクセス判定

### 4.1 資源アクセスは鉱床の有無だけではない

`Minerals Overview` の国別表示に、各 State と commodity の `MineralAccessReport` を派生データとして加える。
これは `pack` に保存しない。鉱床、稼働中の鉱山・精錬所、市場在庫、発注、Caravan から毎回再計算する。

```ts
type MineralAccessStatus =
  | "selfSufficient"
  | "importDependent"
  | "noDomesticDeposit"
  | "blockedByEmbargo"
  | "noReachableSupply";

interface MineralAccessReport {
  stateId: number;
  commodity: OreCommodity;
  domesticDepositCount: number;
  domesticOperationalCapacityTons: number;
  domesticIngotStock: number;
  incomingIngotUnits: number;
  incomingOreUnits: number;
  requiredIngotUnits: number;
  status: MineralAccessStatus;
  lastBlockedReason?: ProcurementOrderBlockedReason;
}
```

- **国内鉱床**: `deposit.cell` の `pack.cells.state` が対象 State であり、`exhausted` でないもの。
- **国内操業能力**: 上記 State の市場に属する active mine / smelter の実効能力。未発見・未操業の鉱床は地質上の
  潜在であって自己供給ではない。
- **輸入依存**: 国家軍需の必要量に対して国内操業能力が足りず、非敵対国からの Ingot / Ore の到着予定または
  到着可能な候補がある状態。
- **アクセス無し**: 地質を持たず、国内在庫・到着予定・許可された到達可能供給もない状態。国境の外に鉱床が
  見えていても、敵国しか候補でなければ `blockedByEmbargo` とする。

地質情報と供給力を混同しないため、表示は `Self-sufficient`、`Import-dependent`、`No domestic deposit`、
`Embargoed`、`No reachable supply` を別々にする。全 State の表と国フィルターの双方に同じ集計を用いる。

### 4.2 v1 の対象品目

最初に国家調達へ接続するのは、既存 recipe と既存の軍需需要がある品だけである。

| commodity / Good | 需要元 | 調達形態 |
| :--- | :--- | :--- |
| Iron Ingot / Iron Ore | Arms、Muskets、Artillery、Arrows、Tools | Ingot 優先。稼働可能な国内精錬所があれば Ore を代替候補にする。 |
| Lead Ingot / Lead Ore | Bullets（火薬時代のみ） | Iron と同じ。ただし銃火器時代が無効なら発注しない。 |
| Saltpeter、Sulfur、Charcoal | Gunpowder | Ore/ingot の代替ではない。既存の材料 forecast をそのまま国家調達に渡す。 |

Copper / Tin は将来の青銅・砲金 recipe が実際の State 軍需に接続されたときに同じ catalog へ追加する。
Gold / Silver は `luxury` / 通貨であり、地質が無いことだけを理由に軍需調達へ加えない。

Good 名ではなく `tags`、`warEconomyType`、および既存の `OreCommodity ↔ Ingot` 対応から Good id を解決する。
これによりセーブごとの Good id の違いに依存しない。

## 5. 外交と禁輸のルール

### 5.1 関係の正規化

既存 `State.diplomacy` の文字列を、調達用には次の四段階に正規化する。セーブの片方向だけが悪化している
場合は、必ずより厳しい側を採用する。

| 正規化関係 | 元の関係 | 戦略調達 |
| :--- | :--- | :--- |
| `domestic` | 同一 State | 許可。常に最優先。 |
| `ally` | Ally / Friendly | 許可。国外候補の最優先。 |
| `neutral` | Neutral / Suspicion / Rival / State 0 | 許可。Ally の後。`Rival` は敵ではないため v1 では禁輸しない。 |
| `enemy` | 双方向のいずれかが Enemy | 禁止。買付候補から除外する。 |

これは `StrategicMarketRelationship = "domestic" | "ally" | "neutral" | "enemy"` に置き換える。
現在の `foreign` は廃止するが、旧セーブに policy migration は不要である。

### 5.2 適用範囲

| 経路 | v1 の扱い |
| :--- | :--- |
| `Deal.purpose = "strategicProcurement"` / `"metallurgProcurement"` | この設計を適用。Enemy との新規契約を禁止。 |
| `Markets.runGlobalTrade()` の民間 Deal | 変更しない。食料・生活品・奢侈品を敵対国禁輸へ拡張しない。 |
| 既に出発済みの Caravan | 発注時点で合法なら到着させる。外交変化で貨物を消滅させない。将来の封鎖・私掠・拿捕は Caravan risk の拡張で扱う。 |
| 第三国経由・密輸・個別免許 | v1 では実装しない。直接の source/destination 関係だけを見る。 |

「source State 側も輸出を禁じるべきか」は、`Enemy` を双方向・より厳しい側で判定することで満たす。国家が
供給元市場から買い上げる発注は、買い手の政策だけではなく、両国関係が Enemy でないことを必ず確認する。

### 5.3 候補順位

同じ実効 Ingot 量を得る候補を、次の順序で選ぶ。

1. 同一 State の Ingot 在庫
2. 同一 State の Ore + 稼働可能な国内精錬所
3. Ally / Friendly の Ingot
4. Ally / Friendly の Ore + 稼働可能な国内精錬所
5. Neutral の Ingot
6. Neutral の Ore + 稼働可能な国内精錬所

同じ tier では、経路の存在、最大日数、**実効 Ingot 1 単位当たりの着地価格**、到着日数、供給余力、market id
で決める。Ore の実効量は実際の `smeltingYield` と必要 Charcoal を含めて計算し、安い Ore を燃料も精錬能力も
無い国へ誤って買わせない。

## 6. 発注モデル

### 6.1 既存の `metallurg` 発注を一次経路にする

State 軍需の `MetallurgMaterialForecast.projectedShortage` は、現在も `requestMetallurgMaterials()` から
`StrategicProcurement.handleMetallurgMaterialDemand()` へ渡る。この経路を保持し、同じ不足に二つ目の
「鉱物輸入注文」を作らない。

変更は次だけに留める。

1. forecast の Good が戦略 Ingot なら、`procureExactUnits()` は Ingot 単独候補ではなく Ingot / Ore の
   **代替材料候補**を評価する。
2. `ProcurementOrder` は引き続き実際に運ぶ Good id を持つ。発注目的は `metallurg` のままである。
3. 不足量・到着予定・禁輸理由は `MineralAccessReport` に読取り専用で反映する。

このため、鉱床が無い State が Armed forces の新造・修繕・弾薬備蓄を必要としたとき、外部市場の
Iron Ingot を既存の国庫・Caravan 経路で買える。一方、軍需が無い国が単に「鉄鉱床ゼロ」で国庫を空にする
ことはない。

### 6.2 予防備蓄は次段階に分ける

v1 の発火条件は実需不足だけとする。三か月以上の State 軍需材料を持たず、かつ国内操業能力がその需要を
継続して満たせない場合の予防備蓄は、後続の `strategicReserve` purpose として導入する。

```ts
type ProcurementOrderPurpose = "shipbuilding" | "metallurg" | "strategicReserve";

interface StrategicReserveDemand {
  stateId: number;
  destinationMarketId: number;
  commodity: OreCommodity;
  targetIngotUnits: number;
  reason: "noDomesticDeposit" | "insufficientDomesticCapacity";
}
```

備蓄を実装する際は、月ごとに `target - stock - inTransit` だけを補充し、国庫不足なら通常の軍需発注を
先に満たす。初期値は `targetReserveDays = 90` とし、Shipbuilding の 365 日備蓄を流用しない。

### 6.3 Ore を扱うための精錬所

現行 `SmelterOperation` は active mine の deposit に一対一で結び付く。よって鉱床を持たない国は Ore を
買っても精錬できない。Ore 代替を有効にする前に、以下の `import-fed` 精錬所を追加する必要がある。

```ts
type SmelterFeedstock =
  | { kind: "domesticDeposit"; depositId: number }
  | { kind: "importedOre"; commodity: OreCommodity };

interface SmelterOperation {
  // Existing site, workers, fuelAccess, technology, smeltingYield fields remain.
  feedstock: SmelterFeedstock;
}
```

- `importedOre` は State の supply market または指定 industrial market にだけ建てる。
- 要件は、対象 Ore の到着見込み、Charcoal の安全在庫、必要 worker、State treasury による設置費である。
- 鉱床由来の精錬所と同じ `produceMonth()` を使い、Ore と Charcoal を市場から実際に消費する。輸入 Ore から
  Ingot を直接生成しない。
- まずは Ingot が候補にあれば Ingot を選ぶ。`import-fed` 精錬所は Ingot が恒常的に高価または不足し、Ore が
  継続して到達できる State だけに投資する。

この順序により「Ore を輸入する」と「燃料なしで Ingot が湧く」を分離できる。

## 7. UI と診断

### 7.1 Minerals Overview

既存の State filter を維持し、全 State 表に `Access` 列を追加する。

| 表示 | 内容 |
| :--- | :--- |
| Resource coverage / State | 各資源の `MineralAccessStatus`、国内鉱床数、国内実効能力、到着予定、軍需必要量。 |
| Deposits | 現在の State 列と鉱床情報を維持する。アクセス状態は鉱床行ではなく resource aggregate に表示する。 |
| Procurement detail | 発注中なら source State、輸送中数量、到着予定日、`foreignPolicy` なら Enemy により除外された候補数を表示する。 |

`All states` では資源ごとの合計に加えて、`Import-dependent States` と `Embargoed States` の件数を表示する。
選択 State では「この State に属する鉱床」だけでなく、State 軍需のための輸入依存を確認できる。

### 7.2 Metallurg Work Overview

材料 forecast の不足行に、`Domestic` / `In transit` / `Import needed` / `Embargoed` を表示する。これにより
「Iron Ingot が不足している」のか「敵対国しか供給源がない」のかを区別できる。

### 7.3 通知とログ

- 初めて `blockedByEmbargo` になった State / commodity / month だけを通知する。
- 同じ理由で毎月 toast を出さない。状態が `importDependent` または `selfSufficient` に戻ったら再通知可能にする。
- デバッグログは source State、正規化関係、除外理由、候補 Ingot/Ore、国庫不足を含める。鉱床の存在だけを
  「入手可能」と記録しない。

## 8. 実装順序

### M1 — 診断と既存 Ingot 輸入の明確化

1. `mineralAccess.ts` を Generator の純粋な集計として作る。入力は World、Deposits、Mine/Smelter、Markets、
   Orders、Caravans。Renderer/UI は読み取り専用にする。
2. `MineralOverviewState` と dialog に State ごとの access rows を載せる。
3. `StrategicMarketRelationship` を `domestic` / `ally` / `neutral` / `enemy` に拡張し、両方向の厳しい関係を
   採用する。既存の Enemy 禁輸テストを更新する。
4. `metallurg` の Ingot 発注に source State と禁輸理由を残し、Overview から見えるようにする。

**受入条件**: Iron deposit がゼロで State 軍需の Iron Ingot forecast が不足している国は、Enemy 以外の
到達可能市場に Ingot があれば `metallurg` Caravan を一つだけ発注する。Enemy の市場しかなければ、在庫・国庫・
Caravan を変えず `blockedByEmbargo` / `foreignPolicy` になる。

### M2 — Ore 代替と import-fed 精錬所

1. `SmelterOperation.feedstock` の save migration を追加する。既存 operation は全て `domesticDeposit` に移行する。
2. `import-fed` 精錬所の建設・操業・Charcoal 消費・worker 上限を実装する。
3. 代替候補を実効 Ingot 単価で比較する。Ore 発注は稼働または建設中の `import-fed` 精錬所へだけ到着させる。
4. Ingot が無く Ore と燃料があるケース、逆のケース、精錬所の失業・燃料不足・Enemy への関係変化をテストする。

### M3 — 予防備蓄と外交政策 UI

1. `strategicReserve` を導入し、90 日の State 軍需用 Ingot target を追加する。
2. State policy UI で `domesticOnly` / `alliesAndNeutral` / `unrestricted` を編集可能にする。ただし Enemy
   の禁止は v1 のまま固定する。
3. 将来、諜報・封鎖・私掠が実装された時点で第三国経由・密輸・航海許可を別の policy として追加する。

## 9. 必須テスト

| ケース | 期待結果 |
| :--- | :--- |
| 国内鉄鉱床・稼働精錬所・十分な Ingot | 外国発注なし。`selfSufficient`。 |
| 国内鉱床なし、Ally に Iron Ingot 在庫 | State 軍需不足に対して Ingot 発注。`importDependent`。 |
| 国内鉱床なし、Enemy にしか Ingot がない | 発注なし、`foreignPolicy`、`blockedByEmbargo`。 |
| Neutral に Ingot、Ally にも Ingot | Ally を優先。国内候補があれば国内を優先。 |
| 外国 Ore だけ、import-fed 精錬所と Charcoal がある | Ore 発注、到着後に実際の Charcoal 消費を伴って Ingot 化。 |
| 外国 Ore だけ、精錬所または Charcoal がない | Ore を発注しない。Ingot 候補を試し、なければ no reachable supply。 |
| 民間通常 Deal が Enemy 間 | v1 では既存どおり通る。戦略調達だけが止まる。 |
| 出発後に外交が Enemy へ悪化 | 既に transit の Caravan は保持。以後の新規発注だけ停止。 |
| diplomacy が片方向だけ Enemy | 双方向判定で禁輸。 |

## 10. 非目標

- 鉱床があるだけで国家へ無料の鉱石・Ingot・軍備を与えない。
- 食料・生活必需品・すべての民間 Deal を敵対国禁輸にしない。
- 敵対国からの密輸、第三国ロンダリング、封鎖・拿捕、通商許可証を M1/M2 に入れない。
- Minerals Overview の地質表示を外交的な視界・諜報の真実性へ転用しない。知識の霧を導入する場合は別途、
  UI 表示と AI 調達候補の双方に同じ knowledge contract を設ける。
