# 有限艦隊の航路運用（Vessel Itinerary + Finite Sea Trade）

| 項目 | 内容 |
| :--- | :--- |
| Status | P0–P1 implemented (2026-08-15); P2–P4 remaining |
| 対象 | Shipbuilding `ShipHull`、Economy `Caravan` / `MerchantTransportAssets`、Vessel assets UI、Trade Animation UI |
| 前提 | [merchant-transport-asset-ledger.md](merchant-transport-asset-ledger.md) F1–F3 実装済み、[shipbuilding-initial-fleet.md](shipbuilding-initial-fleet.md) 初期艦隊 seed 済み、[ships.md](ships.md) §4.5 voyage 実装済み |
| 調査日 | 2026-08-14 |

---

## 0. 目的

Trade Animation 上の水上交易が「船が無限に湧く」ように見える現状をやめ、**Vessel assets に載っている有限隻数の船体**が、母港・現在地・次寄港地を持ちながら、実在ルート上で効率的に回る体にする。

プレイヤーが確認できること:

1. **Vessel assets**: 各船が今どこにいるか（港 or 海上区間）、次にどの都市へ向かうか、どの Caravan に紐づくか。
2. **Trade Animation**: 海上便は必ず 1 隻以上の具体的 `shipHullId` を伴い、空き船が無い路線は出航待ちになる。
3. **経済**: 商船の稼ぎは主に実貨物の Deal/Caravan から出る。抽象的な「常時 voyage 収入」は、貨物に出ていない商船では縮小または停止する。

---

## 1. 現状診断（なぜ無限に見えるか）

### 1.1 既にできていること

| 要素 | 状態 |
| :--- | :--- |
| 個体船体 `ShipHull` | 実装済み（owner / homeBurgId / status） |
| 初期艦隊 seed | 実装済み（港持ち state に有限隻） |
| 水上資産台帳 `MerchantWaterAssetReference` | 実装済み（`shipHullId` 参照） |
| 予約 seam | 実装済み（`cargo` 予約 / 到着で release） |
| Caravan の `transportAllocations.shipHullIds` | 予約成功時のみ付与 |
| Trade Details の Hull # 表示 | reservation がある場合のみ |

### 1.2 ギャップ（本計画の対象）

| 問題 | コード上の根拠 |
| :--- | :--- |
| **水上のみの出航が船体なしで通る** | `tryDepartLoadingCaravan()` は `hasLandTransport && !reservation` のときだけ待機。**水上専用ルートは reservation 失敗でも abstract allocation で `transit` へ進む**（`caravans.ts` 出航処理）。 |
| **船体に地理的位置が無い** | `ShipHull` は `homeBurgId` と status のみ。`currentBurgId` / `destinationBurgId` / `caravanId` が無い。 |
| **Vessel assets が集計のみ** | owner × homePort × class の docked/voyage/cargo 数。現在地・次寄港地列が無い。 |
| **voyage 収入がルート非依存** | `runVoyageTick()` は `status === "voyage"` の全艦に定額を付与。貨物便に出ていない商船も「常時稼ぐ幽霊航路」になる。 |
| **homeBurg 固定** | ships.md §4.5 は「他港へ移動しない」暫定。有限運用では少なくとも**寄港地の概念**が必要（所有 home は維持しつつ現在地は動く）。 |

### 1.3 体感の分解

- **陸上**: land 資産は有限 seed され、予約失敗で待機するため比較的有限に見える。
- **海上**: Shipbuilding 有効時でも、予約失敗や abstract fallback で Caravan が増え続ける。
- **Vessel assets**: 船は「voyage」としか出ないため、Trade Animation の無数の矢印と 1:1 対応しない。

---

## 2. 設計原則

1. **船体の正本は Shipbuilding。** 位置・次寄港地も `ShipHull`（または同一 runtime slice 内の併設 itinerary マップ）に置き、Economy は Caravan 側に `shipHullIds` を持ち、同期は CustomEvent / 既存 reservation seam で行う。
2. **Shipbuilding 有効時、水上区間を含む出航は実船体必須。** abstract water allocation は互換モード（Shipbuilding 無効）専用。
3. **1 隻は同時に最大 1 便。** 既存 `cargo` + waterAssets.reservationId を維持・厳守。
4. **効率運用 = 空き船を待ち Deal に割り当て、空船回航を最小にする。** 最初は「出発港に居る available 船だけが積載可」とし、空船回航（ballast leg）は Phase 2。
5. **国家艦 (`owner: "state"`) は商会台帳に載せない**（既存方針）。本計画の貨物拘束は **market 船体**が主。国家艦の位置は任意で「訓練航路」抽象のまま、または後続で護衛に接続。
6. **在庫会計を壊さない。** Deal の stock 控除・到着加算・loading 精算は現状維持。変更するのは「誰が運ぶか」と「船がどこにいるか」だけ。

---

## 3. データモデル

### 3.1 `ShipHull` 拡張（Shipbuilding）

```ts
export type ShipHullDuty =
  | "idle" // 港に待機（積載待ち）
  | "loading" // 積載中（Caravan state loading に予約済）
  | "cargo" // 貨物便 in transit（既存 status と整合）
  | "ballast" // 空船回航（Phase 2）
  | "patrol"; // 国家艦の訓練/諜報（抽象ルート可）

export interface ShipHullItinerary {
  /** 現在停泊中の港 burg。海上なら null。 */
  currentBurgId: number | null;
  /** 次に目指す港 burg。idle かつ予定なしなら null。 */
  nextBurgId: number | null;
  /** 紐づく Economy Caravan id。無ければ null。 */
  caravanId: number | null;
  /** 経路上の進捗 0..1（Caravan から投影。表示用）。 */
  routeProgress: number;
  /** 責務ラベル（UI / 診断）。 */
  duty: ShipHullDuty;
}
```

`ShipHull` へ直接フィールドを足す案を採用する（別 Map より save/load と Vessel assets が単純）:

```ts
export interface ShipHull {
  id: number;
  shipClassId: string;
  owner: "state" | "market";
  ownerId: number;
  homeBurgId: number; // 所有・帰還の本籍港（不変）
  status: ShipHullStatus; // docked | voyage | cargo | maintenance（互換維持）
  maintenanceDays?: number;
  // NEW
  currentBurgId?: number | null;
  nextBurgId?: number | null;
  caravanId?: number | null;
  routeProgress?: number;
  duty?: ShipHullDuty;
}
```

**status と duty の対応（互換）**

| status（既存） | duty（新規） | 意味 |
| :--- | :--- | :--- |
| `docked` | `idle` | 港にいる（戦時動員含む） |
| `voyage` | `patrol` または `idle`（港） | 旧: 常時出港。新: patrol=抽象訓練、idle=寄港待機へ移行 |
| `cargo` | `loading` / `cargo` / `ballast` | 貨物・回航 |
| `maintenance` | （duty 省略可） | 修理中・現在地は last port |

### 3.2 Economy 側（Caravan / 台帳）

既存で足りるもの:

- `transportAllocations[].shipHullIds`
- `transportReservationId`
- waterAssets.state / reservationId

追加は最小限:

```ts
// Caravan 任意フィールド（診断・Trade Animation 用）
shipHullSummary?: { hullId: number; shipClassId: string; homeBurgId: number }[];
```

reservation 成功時に snapshot するだけでよい（UI が shipbuilding を import しないため）。

### 3.3 セーブ互換

- 旧 hull: `currentBurgId` 未定義 → `homeBurgId` にフォールバック、`duty` 未定義 → status から導出。
- 旧 Caravan: shipHullIds 無し → Trade Animation では "Abstract (legacy)" と表示。新規出航では作らない（Shipbuilding 有効時）。

---

## 4. ライフサイクル（商船）

```text
[seed / complete]
  currentBurgId = homeBurgId
  status = docked | voyage → 新方針: market 船は原則 docked+idle で母港待機
  （戦時 state 船のみ docked 動員）

[loading 開始: Deal 束ね → Caravan loading]
  reserve(hull) 成功
  hull.status = cargo
  hull.duty = loading
  hull.caravanId = caravan.i
  hull.currentBurgId = originBurg
  hull.nextBurgId = destinationBurg
  hull.routeProgress = 0

[出航 depart]
  duty = cargo
  currentBurgId = null（海上）
  routeProgress は Caravan.currentDistance / totalDistance を投影

[到着 settle arrived]
  release hull
  currentBurgId = destinationBurg
  nextBurgId = null
  caravanId = null
  duty = idle
  status = docked   // 港で次便を待つ（有限運用の核心）
  （旧: 即 voyage に戻して抽象収入 → やめる or 縮小）

[喪失 lost]
  maintenance 30 日（既存）
  位置は last known port または homeBurg
```

### 4.1 出航ゲート（必須修正）

`tryDepartLoadingCaravan()`:

```ts
const needsWater = routeHasWater(caravan.routeSegments);
const reservation = MerchantTransportAssets.reserve(...);

if (hasLandTransport && !reservation) return "waiting";
// NEW:
if (needsWater && waterAssetModeActive && !reservationHasWaterHulls(reservation)) {
  return "waiting"; // 空き船が来るまで積み置き
}
// abstract water fallback は waterAssetModeActive === false のときのみ
```

これにより **海上 Caravan 数 ≤ 利用可能 merchant hull 数（同時）** が保証される。

### 4.2 待機中 loading と船の拘束

現状 loading 中は資産をまだ reserve しない（出航時のみ）。  
有限運用では二択:

| 案 | 内容 | 採否 |
| :--- | :--- | :--- |
| A. 出航時予約（現状） | loading 中は船を拘束しない。出航瞬間に空いていれば出る | **Phase 1 採用**（実装が軽い） |
| B. loading 開始時予約 | 積み始める時点で船を港に拘束 | Phase 1.5 で検討（長期 loading が船を寝かせる） |

Phase 1 は A。ただし **同一 origin で出航待ちの loading が船不足で滞留**する挙動は意図どおり（無限出航の代替）。

### 4.3 位置の投影元

- **正本の進捗**は引き続き `Caravan.currentDistance`。
- 毎 tick（Economy caravan tick 後、または Shipbuilding tick 前）に:

```ts
// Economy → event or sync helper
for each transit caravan with shipHullIds:
  update hull.routeProgress, nextBurgId, currentBurgId=null
```

拡張間は直接 import せず:

- 案1（推奨）: Economy が tick 末に `fmg:economy-caravan-hull-positions` を dispatch（`{ hullId, caravanId, progress, originBurgId, destBurgId, phase }[]`）。Shipbuilding が購読して hull を更新。
- 案2: Vessel assets 表示時だけ Caravan を Economy へ問い合わせ投影（永続位置は持たない）。  
  → セーブ後・UI 外シミュレーションで位置が消えるため **非推奨**。

### 4.4 初期 seed 後の状態

`seedInitialFleets` / `registerCompletedHull` 後:

- market 船: `status: "docked"`, `duty: "idle"`, `currentBurgId: homeBurgId`  
  （旧 peacetime `voyage` 即出港を **商船については廃止**）
- state 船: 既存どおり平時 `voyage`+`patrol`（訓練収入・諜報）、戦時 `docked`

これにより初期から「港に居る有限商船が Trade に順番に出る」見た目になる。

---

## 5. 効率運用ポリシー

「限られた船を効率的に」は次のルールで表現する（AI 最適化ソルバは不要）。

### 5.1 Phase 1（必須）

1. **空き船 = origin 港（または origin 市場の港群）に idle で居る hull。**
2. 出航時、必要 cargo slots を満たす最小船級を prefer（既存 `allocateWaterAssets` の smallest-fit）。
3. 空きが無い O/D は loading 継続 or 新規 spawn 抑制（既存 maxWait → cancelled-thin と整合）。
4. 到着後は **目的地に idle**。次にその港から出る Deal が船を再利用（片道固定の無駄を許容）。

### 5.2 Phase 2（空船回航 ballast）

- 目的地に需要が薄く、home または別港に高需要 Deal があるとき、空の `ballast` 便を短距離で生成。
- ballast は payload 空・低維持費、到着後 idle。
- 乱用防止: 同一 hull の ballast 連続回数上限、距離上限。

### 5.3 Phase 3（任意・高度）

- multi-stop（A→B→C）同一 hull での積替えなし寄港は対象外（ルートプランナ大規模改修）。
- 国家艦の護衛スロット。

---

## 6. 収入モデルの整理

| 船体 | 旧 | 新 Phase 1 |
| :--- | :--- | :--- |
| market + cargo 便 | voyage 収入なし（status cargo で skip 済み） | 維持。貨物利益は Deal/Caravan 側 |
| market + idle in port | voyage 収入あり（旧 status voyage） | **収入なし**（港待機） |
| market + abstract voyage | 定額 voyage 収入 | **廃止**（常時 voyage にしない） |
| state + patrol | voyage 収入 + intel | 維持（訓練名目）。位置は optional |
| state + war docked | 収入なし | 維持 |

これにより「Trade Animation で貨物を運んでいないのに国庫が増える」幽霊を商船から消す。

国家艦の patrol 収入は意図的フレーバーとして残す。商船の主収入を貨物に寄せる。

---

## 7. UI

### 7.1 Vessel assets（必須）

既存集計表に加え、**個体行モード**または展開行:

| 列 | 内容 |
| :--- | :--- |
| Hull # | `ShipHull.id` |
| Owner / Operator | 既存 |
| Class | Sloop / … |
| Home port | homeBurgId |
| Status | idle / loading / at sea / maintenance / patrol |
| Location | 港名 or "At sea (X% → Dest)" |
| Next port | nextBurgId 名 |
| Cargo / Caravan | caravanId + 主 Good 名（Economy 問い合わせ） |

実装案:

- 個体リストを主表示に切り替え（集計は上部サマリ）。
- Economy から caravan 概要を取るなら既存と同様 `CustomEvent` request/response（merchant operator snapshot と同型）。

### 7.2 Trade Animation Active Caravans（必須）

列追加:

- **Vessels**: `Hull #12 Sloop, #15 Caravel` または `Abstract (no Shipbuilding)`
- 水上便で hull が空なら行を出さない（出航ゲートでそもそも作られない）か、loading のみ "Waiting for vessel"。

### 7.3 Trade Details（軽微）

既存 Hull # 表示を Location 連動テキストに拡張（"Hull #12 · at sea 40% · bound for Port Y"）。

### 7.4 Shipyards Overview

Port (docked/capacity) が再び意味を持つ（商船が到着後 docked に戻るため）。表示ロジックは既存の docked カウントで足りる。

---

## 8. モジュール境界

```text
Shipbuilding
  ShipHull + itinerary fields
  registerCompletedHull / seed → idle at home
  subscribe fmg:economy-caravan-hull-positions
  reservation handlers (既存 cargo status)

Economy
  tryDepartLoadingCaravan: hard water hull gate
  caravan tick end: publish hull positions
  MerchantTransportAssets.allocateWaterAssets (既存)
  optional shipHullSummary on Caravan

UI
  VesselAssetsOverviewDialog / vessel-assets-overview.ts
  TradeAnimationDialog ActiveCaravansTab
```

- Economy は `ShipHull` を複製しない（台帳参照のみ）。
- Shipbuilding は Deal/Caravan 配列を import しない（event 投影のみ）。

---

## 9. 実装フェーズ

### P0 — 水上 abstract 出航の封鎖（最小・即効） — 実装済み (2026-08-15)

- [x] `tryDepartLoadingCaravan`: Shipbuilding water mode 時、open-water 必要なら hull 付き reservation 必須。失敗は `"waiting"`。
- [x] `spawnStrategicProcurement` に同ゲートを適用。
- [x] テスト: 船体 0 で海上 loading が transit にならない / 船体 1 で同時 2 便が出ない / mode off では abstract 出航可。
- [x] 受け入れ: 同時海上便 ≤ 予約可能な merchant hull 数（`canDepartWithTransportAssets`）。

### P1 — 位置フィールドと到着後 idle — 実装済み (2026-08-15)

- [x] `ShipHull` に itinerary フィールド。seed/complete で market 船は home で idle+docked。
- [x] 予約時 / 到着時 / 喪失時に位置・duty・caravanId を更新（`reserveMerchantHullsForCargo` / `releaseMerchantHullsFromCargo`）。
- [x] Economy が `Caravans.tick` 末に `fmg:economy-caravan-hull-positions` で位置投影。
- [x] 商船の抽象 voyage 収入を停止（state patrol は維持）。
- [x] 単体テスト: A→B 貨物後 destination で idle、再予約可（`shipHullItinerary.test.ts`）。

### P2 — Vessel assets / Trade Animation UI

- [ ] Vessel assets 個体行 + Location / Next / Caravan 列。
- [ ] Trade Animation に Vessels 列、loading "Waiting for vessel"。
- [ ] 手動確認チェックリスト。

### P3 — 効率運用の改善（ballast・予約タイミング）

- [ ] 空船回航ルール（任意・フラグ off 既定）。
- [ ] loading 開始時予約（案 B）の実験と採否。
- [ ] 診断: 市場ごとの hull utilization、待ち日数、機会損失 Deal 数。

### P4 — 較正

- [ ] 初期艦隊隻数 × 交易量のバランス（待ち過ぎ / 遊休過多）。
- [ ] `ships_per_extra_port` と land fleet top-up との整合メモ。

---

## 10. 受け入れ条件

1. Shipbuilding + Economy 有効の新規マップで、海上 `transit` Caravan はすべて `shipHullIds.length >= 1`。
2. 任意時刻で `status===cargo` の merchant hull 数 = 予約中/海上貨物に拘束された hull 数。
3. Vessel assets で各 merchant hull に Home / Location / Next が表示され、貨物中は Next が目的港と一致。
4. 商船が港で idle のとき voyage 収入 event が出ない。
5. 船体不足時、該当 O/D の loading は waiting のまま増え続けず、出航できない（薄荷キャンセル規則は既存どおり発火可）。
6. Shipbuilding 無効時は従来どおり abstract water で交易可能（Economy 単独互換）。
7. 既存 merchantTransport / caravan / shipyardQueue テストが緑。新規テストが P0–P1 を固定。

---

## 11. リスクと緩和

| リスク | 緩和 |
| :--- | :--- |
| 出航ゲート厳格化で交易が止まる | 初期艦隊 seed 済み。待ち過ぎは cancelled-thin と fleet 係数で較正 |
| 片道運用で船が偏在 | P3 ballast。P1 では偏在を許容し診断だけ出す |
| event 順序（Economy tick vs Shipbuilding tick） | 位置投影は Economy caravan tick 末。予約は既存同期 CustomEvent |
| status 意味の破壊 | status 互換表を維持。duty を新意味の主に |
| パフォーマンス（全 hull × caravan 同期） | transit 中の hull 付き caravan のみ投影（通常数十〜数百） |

---

## 12. 非目標

- 陸地 Cart/Wagon の個体位置（aggregate のまま）。
- 国家艦を商会台帳へ混ぜる / 商船を軍事ユニット化する全面統合。
- リアルタイム連続座標シミュレーション（Caravan 進捗投影で十分）。
- 玩家が各船に手動航路を指定する艦隊指令 UI（後続）。
- Economy Goods としての船在庫と Hull の統合（Phase 10 bridge とは別）。

---

## 13. 関連ファイル（実装時）

| 領域 | ファイル |
| :--- | :--- |
| 出航ゲート | `src/extensions/economy/generators/caravans.ts` |
| 水上予約 | `src/extensions/economy/generators/merchantTransportAssets.ts` |
| 船体 | `src/extensions/shipbuilding/generators/shipyardQueueTypes.ts`, `shipyardQueue.ts`, `initialFleet.ts` |
| 抽象航海収入 | `src/extensions/shipbuilding/generators/shipVoyages.ts` |
| 拡張配線 | `src/extensions/economy/index.tsx`, `src/extensions/shipbuilding/index.ts` |
| Vessel UI | `vessel-assets-overview.ts`, `VesselAssetsOverviewDialog.tsx` |
| Trade UI | `TradeAnimationDialog.tsx` |
| 型 seam | `src/types/shipbuildingMaterials.ts`（snapshot に位置を載せるか検討） |

---

## 14. 推奨実装順（要約）

1. **P0** abstract 海上出航封鎖 → 体感の「無限船」が即消える。  
2. **P1** 位置・idle 帰還・商船 voyage 収入停止 → 有限艦隊の物語が Vessel と Trade で一致。  
3. **P2** UI 列 → ユーザー要求の「現在地・次都市」を満たす。  
4. **P3+** 回航と較正。

P0 だけでも Trade Animation の同時隻数は実 fleet に張り付く。P1–P2 で Vessel assets の情報要求を完了させる。
