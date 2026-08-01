# 商人輸送資産台帳・製造・発注の設計

| 項目 | 内容 |
| :-- | :-- |
| Status | Proposed — 容量・多様性の初期実装後に着手する設計 |
| 対象 | Economy extension、任意の Shipbuilding extension、Trade Details |
| 前提計画 | [trade-cargo-capacity-and-diversity.md](trade-cargo-capacity-and-diversity.md) Phase F / G |
| 調査日 | 2026-08-01 |

## 1. 結論

`Market.goods` は販売在庫であり、馬車・荷役具・役畜・商船の耐久資産を置く台帳にはしない。商人の
輸送手段は Economy extension slice に独立した **MerchantTransportLedger** として保持する。

台帳の恒久的な所有単位は `marketId` とする。`MerchantOrganization` は市場・人物台帳から都度同期して
再生成されるため、`organizationId` を資産台帳の主キーにすると、再同期や市場再編時に所有権を失う。
組織 ID は表示・権限判定用の参照に留める。

完成した Cart、Wagon、Pack saddle は通常 Good の販売在庫へ入れず、材料レシピと作業を持つ
**TransportAssetOrder** の完成物として台帳へ直接登録する。プレイヤーの「大工へ発注」はこの order を
作る操作であり、個々の Caravan へ Good を渡す操作ではない。

## 2. 調査結果

### 2.1 既存の台帳と不足している責務

| 既存データ | 現在の責務 | 輸送資産の台帳として使えない理由 |
| :-- | :-- | :-- |
| `Market.goods` | Good ごとの販売在庫と価格 | 売買・生産で増減する消費財であり、各便で再購入・消滅するモデルになる |
| `Market.marketTreasury` | 市場管理者の運転資金と農家への未払金 | 現金のみ。資産明細や予約状態を持たない |
| `BurgMarketLedger` | Burg 内の商人別売上、シェア、所属組織 | 収益配分の台帳であり、所持品を表さない |
| `MerchantOrganization` | 会頭、会員、商圏、商取引可否 | `syncMerchantOrganizations()` が市場・商人台帳から配列を組み直すため、可変資産を内包できない |
| `Caravan.payload` | 輸送中の貨物と、その便で選んだ抽象的容量 | 到着・喪失時に Caravan が削除され、資産の返却・損失を表せない |
| Shipbuilding `ShipHull` | 個別船体、港、国家/港の所有、停泊/航海状態 | 商船についても所有 ID は建造元 Burg ID であり、Economy の Deal/Caravan と接続されていない |

`TradeCargo` が現在作る `transportAllocations` は「この便に必要な Cart/Wagon/船級の数量」という表示用・
積載用の選定結果であり、実在する一台・一隻の予約ではない。したがって、容量計算は既に存在するが、
資産の可用性・製造・返却・損失を扱う seam は未実装である。

### 2.2 既存の再利用可能な要素

- `Good.cargo` と `cargoSlotsPerUnit`、`TradeCargo` の積載計算はそのまま使う。
- `Caravan.transportAllocations` は、予約済み資産を表示する出力先として拡張できる。
- `Market.marketTreasury` は商会プールが購入・発注を支払う初期の資金源として使える。ただし国家の
  `State.treasury` や Guild の知識/資金台帳とは混ぜない。
- Shipbuilding は `ShipHull` を個体として保存済みであり、水運の個別資産は複製せず参照する。
- `ConstructionOperations` には Burg ごとの `carpenterWorkers` があるが、現状は建築ストック専用である。
  輸送資産の作業をここへ無制限に足すと同じ労働を二重計上するため、そのまま生産能力として流用しない。

## 3. 採用しない案

### A. Cart/Wagon を通常 Good として `Market.goods` に置く

不採用とする。材料レシピは表現できるが、通常の販売・交易・消費フローへ入るため、耐久物が一便ごとに
消える。輸送能力を増やす購入と、販売在庫の変動を分離できない。

### B. `MerchantOrganization` に `assets` を追加する

不採用とする。商会は `syncMerchantOrganizations()` が市場・人物台帳を基に再構築する派生データである。
資産をここに書くと同期の実装詳細が資産の寿命を決めてしまい、locality が悪い。

### C. すべてを Shipbuilding の `ShipHull` と同じ個体レジストリに統合する

不採用とする。陸上の荷車・荷役具は大量かつ同質であり、一台ごとの ID は初期段階で leverage を生まない。
一方、船体はすでに Shipbuilding が個体として所有する。陸上は集計資産、水上は船体参照という二つの
adapter を、同じ MerchantTransportAssets module の小さい interface の背後へ置く。

## 4. アーキテクチャ

### 4.1 所有と永続化

Economy が `simulation.extensions.economy` に次を保存する。

```ts
type TransportAssetState = "available" | "reserved" | "inTransit" | "maintenance";

type MerchantLandAssetBalance = {
  assetId: "pack-saddle" | "cart" | "wagon";
  available: number;
  reserved: number;
  inTransit: number;
  maintenance: number;
};

type MerchantWaterAssetReference = {
  shipHullId: number;
  shipClassId: string;
  homeBurgId: number;
  state: TransportAssetState;
  reservationId?: number;
};

type MerchantTransportLedger = {
  marketId: number; // 恒久キー。市場削除時だけ明示的に精算する
  organizationId?: number; // 表示用の派生参照。所有権のキーではない
  landAssets: MerchantLandAssetBalance[];
  waterAssets: MerchantWaterAssetReference[];
  lastReconciledTick: number;
};

type TransportReservation = {
  id: number;
  dispatcherMarketId: number;
  caravanId: number;
  allocations: {
    mode: "land" | "water";
    assetId: string;
    quantity: number;
    shipHullIds?: number[];
  }[];
  state: "reserved" | "inTransit" | "released" | "lost" | "cancelled";
};
```

`available + reserved + inTransit + maintenance` は各 land asset の総数と常に一致し、負数にしてはならない。
水上資産は Shipbuilding の `ShipHull` が正本であり、Economy は `shipHullId`、予約状態、商会への所属を
保持するだけである。

### 4.2 安定した dispatcher の決定

各便の資産を出す市場は次で決める。

1. `sellerType === "market"` なら `seller`。
2. `sellerType === "burg"` なら売り手 Burg の `market`。
3. 市場が存在しない、または台帳がない場合は便を作らず Deal を未積載のまま残す。

輸入側の市場から資産を借りる、または途中市場で乗り換える機能は初期対象外とする。これにより、資産の
帰還先、予約解除、所有者を一意に保つ。mixed route の land/water も同じ dispatcher の台帳から予約する。

### 4.3 深い module と seam

`generators/merchantTransportAssets.ts` を、資産台帳・選定・予約・返却・損失・旧セーブ移行の複雑さを
隠す module とする。呼び出し側は個別配列やカウンタを書き換えない。

```ts
interface MerchantTransportAssets {
  ensureLedger(marketId: number): MerchantTransportLedger;
  reserve(dispatcherMarketId: number, request: TransportRequest): ReservationResult;
  depart(reservationId: number, caravanId: number): void;
  settleCaravan(caravan: Caravan, outcome: "arrived" | "lost"): void;
  cancel(reservationId: number): void;
  reconcileMerchantHulls(snapshot: readonly MerchantHullSnapshot[]): void;
  getAvailability(marketId: number): MerchantTransportAvailability;
}
```

この interface の leverage は、Caravans、Trade Details、将来の発注 UI が「どの台帳配列をどう更新するか」を
知らずに済む点にある。module を削除すると予約、二重割当、到着時返却、船体との整合を全呼び出し側で
再実装する必要があるため、単なる pass-through ではない。

`TradeCargo` は需要容量を算出する純粋 module のままとし、資産保有数を読まない。`MerchantTransportAssets`
が availability を基に一便あたりの allocation を選び、選定不能なら Deal を待機させる。この分離により、
貨物多様性と資産不足を独立にテストできる。

## 5. 輸送のライフサイクル

```text
Deal (remainingUnits)
  -> capacity-aware manifest
  -> reserve assets
  -> Caravan transit
  -> arrived: cargo credited, assets available
  -> lost: cargo lost, assets lost/maintenance demand
```

1. `Caravans.spawnFromDeals()` は manifest 候補を作った後に `reserve()` を呼ぶ。
2. 予約できた実効容量だけを manifest として確定し、その units 分だけ `Deal.remainingUnits` を減らす。
3. `Caravan` は `reservationId` と、実際に割り当てた `transportAllocations` を snapshot として持つ。
4. 出発時に `reserved -> inTransit`、到着時に `inTransit -> available` とする。
5. 喪失時は `inTransit` の land asset を `maintenance` に移す。修理・補充が未実装でも交易が恒久停止
   しないよう、初期版では一定期間後に `available` へ戻す「回収・再編」規則を採用する。完全な破壊と
   再建は TransportAssetOrder が実装された後に有効化する。
6. 予約失敗、ルート消失、拡張無効化、Caravan 作成例外では `cancel()` で必ず `available` へ戻す。

資産不足は容量を無視する理由にしない。小さい構成で出せるなら部分出荷し、何も予約できなければ Deal は
未積載のまま残る。予約前に `remainingUnits` や市場 stock を変更してはならない。

## 6. 水運と Shipbuilding の連携

Shipbuilding は船体の正本を維持し、Economy は複製しない。両 extension は直接の内部 import ではなく、
次の CustomEvent seam を使う。

- `fmg:shipbuilding-merchant-hulls-request`: Economy が再同期時に要求する。
- `fmg:shipbuilding-merchant-hulls-snapshot`: Shipbuilding が market-owned Hull の `{ id, shipClassId,
  homeBurgId, ownerId, status }` を返す。
- `fmg:shipbuilding-merchant-hull-changed`: 完成・破棄・所有変更時に Shipbuilding が送る。

完成イベントには `hullId` を含める。現行の完成イベントは `shipClassId` までしか渡さないため、複数隻が
同一 tick に完成した時に Economy が安全に特定できない。

Economy は `homeBurgId -> burg.market` から対象 MerchantTransportLedger を決める。Shipbuilding が無効なら
水運資産は作らず、水上 Deal を待機させるのではなく、現在の抽象船 allocation を維持する。この互換モードを
明示し、Shipbuilding を Economy の必須依存にしない。

Shipbuilding 有効時に個別 Hull を必須にするのは、TransportAssetOrder と予約/返却が完成した後である。
それまでは Hull の voyage income と Economy の貨物便を二重に「同じ船」と主張しない。

## 7. 製造とプレイヤー発注

### 7.1 Blueprint は Good ではない

```ts
type TransportAssetBlueprint = {
  id: "pack-saddle" | "cart" | "wagon";
  outputAssetId: string;
  materials: Readonly<Record<number, number>>;
  requiredWorkPoints: number;
  requiredCraft: "woodworking" | "leather";
  cargoCapacitySlots: number;
  requiredDraftAnimals?: number;
};

type TransportAssetOrder = {
  id: number;
  marketId: number;
  requestedBy: "simulation" | "player";
  blueprintId: string;
  quantity: number;
  completedQuantity: number;
  fundedAmount: number;
  reservedMaterials: Record<number, number>;
  workPoints: number;
  status: "queued" | "waitingMaterials" | "building" | "completed" | "cancelled";
};
```

`materials` は既存 Good の ID を参照するレシピであるが、output は `Market.goods` に販売在庫として入れない。
材料は order が `building` へ遷移する時に一度だけ市場在庫から控除し、完了時に MerchantTransportLedger
へ加える。取消時は未消費の予約材料を市場在庫へ返す。

### 7.2 大工への依頼

初期の発注主は市場商会プールとし、費用は `Market.marketTreasury.balance` から支払う。国家 treasury や
Guild treasury を暗黙に使わない。プレイヤーは後続 UI で市場、blueprint、数量、上限予算を選ぶ。

作業は既存 `ConstructionOperations.carpenterWorkers` と同じ人数を二重計上しない。実装時は次のどちらかを
一つ選び、混在させない。

1. **推奨**: `woodworking` の CraftDomainEmployment から輸送製作向け work point を明示的に予約し、
   通常の recipe 生産に同じ分を使わせない。
2. 建築作業を使うなら ConstructionOperation に用途別 worker allocation を追加し、建築 stock と輸送資産が
   同じ carpenter capacity を競合するようにする。

本計画では 1 を採用する。これにより「大工へ依頼」という UI 上の語彙を保ちつつ、住宅建設用の
`carpenterWorkers` を隠れて消費しない。最初の実装では、既存の woodworking Guild bonus を work point の
生産性補正として再利用する。

### 7.3 自動補充とプレイヤー発注の順序

1. まず市場規模に応じた初期 land asset を seed する。既存の抽象 convoy と同等以上の開始能力を保証する。
2. 稼働率、maintenance 数、未積載 Deal を基に simulation の補充 order を作る。
3. 次に player order を同じキューへ追加する。player order は上限予算内で先行順位を持つが、材料・作業を
   無から作らない。

これにより、プレイヤーが一度も発注しないことで全交易が停止する状態を防ぎ、同時に発注が実際に保有容量を
増やす意味を持つ。

## 8. UI

### 8.1 Market Overview

既存の Goods 表には資産を混在させない。新しい **Transport assets** タブを追加し、以下を表示する。

- asset 名、available / reserved / in transit / maintenance
- 合計 cargo slots と現在の稼働率
- 商会名（派生参照）、所属 Burg、Shipbuilding 水運資産の有無
- open TransportAssetOrder、必要材料、進捗、blocked 理由

### 8.2 Trade Details

現在の allocation 表示を保ち、予約済みの場合だけ asset source と reservation 状態を追加する。旧 Caravan と
抽象 convoy には `Abstract allocation` と表示し、実在資産が割り当てられたように見せない。

### 8.3 Player order UI

Market Overview の Transport assets タブから開く。入力は market、blueprint、数量、予算上限のみとし、
Caravan を直接選ばせない。注文の進捗・材料待ち・完成後の台帳増加を同じ画面で追跡できるようにする。

## 9. 移行・削除・互換性

- 既存セーブに台帳が無い場合、初回 reconcile で market ごとの初期 land asset を生成する。数量は過去の
  `transportAllocations` から逆算せず、市場規模の決定式で一度だけ seed する。
- 旧 Caravan は reservation を持たない。到着・喪失しても資産台帳を変更せず、表示は抽象 allocation のままにする。
- Market 削除時は transit reservation を取消し、未出発 Deal を通常の取消規則で市場在庫へ戻す。残る資産と
  order は削除前に destination を決める明示的な移管処理が必要であり、暗黙に隣接市場へ移さない。
- MerchantOrganization の再同期では、ledger の `organizationId` だけを最新の `homeMarketId` に対応する
  organization へ更新する。資産残高を再作成・初期化してはならない。
- Shipbuilding 無効化時は `shipHullId` 参照を保持したまま水運を abstract mode へ戻す。Hull を Economy が
  削除してはならない。

## 10. 実装フェーズと受け入れ条件

### Phase F1 — 台帳・予約・陸上資産

- `MerchantTransportLedger`、reservation、marketId による dispatcher 決定を追加する。
- Cart/Wagon/Pack saddle の aggregate asset を seed し、Caravan が予約・出発・到着で正しく遷移する。
- 受け入れ: 同じ asset を二便へ二重予約できず、到着後に再利用され、資産不足時は Deal が未積載で残る。

### Phase F2 — 表示・回復・診断

- Market Overview の Transport assets、Trade Details の reservation source、稼働率診断を追加する。
- lost / cancel / legacy Caravan の資産整合をテストする。
- 受け入れ: 各 market の残高合計と全 reservation が一致し、旧 Caravan による残高変化が無い。

### Phase F3 — Shipbuilding adapter

- Hull snapshot/change event と `shipHullId` 参照を導入する。
- Shipbuilding 有効・無効の双方で Economy が起動し、正本の Hull が二重作成されないことを確認する。
- 受け入れ: 一隻の Hull を二便へ予約できず、Shipbuilding の voyage/port tests が維持される。

### Phase G1 — blueprint と simulation 補充 order

- TransportAssetBlueprint、材料予約、woodworking work point、Market treasury 支払いを実装する。
- 受け入れ: 完成品は `Market.goods` に入らず、材料・現金・作業量が保存され、取消時の返却が一度だけ起きる。

### Phase G2 — player order

- 市場別発注 UI、予算上限、状態表示を追加する。
- 受け入れ: プレイヤー注文が通常補充と同じキューを通り、完成時に指定 market の available capacity を増やす。

## 11. テスト計画

- Unit: dispatcher market の決定、reserve/cancel/depart/arrive/lost の各遷移と残高不変条件。
- Unit: 一台の Cart、一隻の Hull、mixed route の二重予約防止。
- Unit: organization 再同期後も marketId 台帳が保持され、表示用 organizationId のみ更新されること。
- Unit: TransportAssetOrder の材料予約、予算上限、work point、取消返却、完成の一回性。
- Integration: Deal -> reservation -> Caravan -> arrival/loss -> ledger の合計整合性。
- Integration: Economy 単独、Economy + Shipbuilding、Shipbuilding 無効化後の read/write 分離。
- UI: Market Overview の資産状態、Trade Details の具体/抽象 allocation、player order の blocked 表示。
- E2E: SVG と `webglHybrid` を明示固定し、Caravan 詳細と市場資産台帳が同じ reservation を示すこと。

## 12. 非目標

- Phase F で役畜の繁殖、飼料、老衰、個体ごとの疾病をモデル化しない。
- 個々の Cart/Wagon に ID、位置、修理履歴を持たせない。必要になるまで aggregate balance を維持する。
- Shipbuilding の state-owned navy hull を merchant asset として予約しない。
- 資産台帳の導入を理由に、現在の `cargoSlots`、貨物多様性、既存 Deal の供給・到着会計を変更しない。
