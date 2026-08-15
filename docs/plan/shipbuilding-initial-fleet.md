# 初期艦隊配布（Initial Fleet Seeding）

マップ生成直後、港を持つ国家へ史実参考の初期船を配布し、`Vessel assets` ダイアログに所有者別・船級別・母港別に記録する。

根拠データ: [`docs/data/historical-ship-fleets/`](../data/historical-ship-fleets/)  
関連: [`docs/plan/ships.md`](ships.md)、[`docs/plan/shipbuilding.md`](shipbuilding.md)、[`shipbuilding-industrial-policy.md`](shipbuilding-industrial-policy.md) §4.6（資材初期在庫）

---

## 1. 目的と非目的

### 1.1 目的

- 新規マップ開始時に、港を持つ国家が **空の艦隊** から始まらないようにする。
- **例外:** Frontier の **陸地起源** (`frontierStartMode: "landOrigin"`) は船なしで始まる。配布しない。
- **例外:** Frontier の **海上到来** は史実ガイドラインを使わない。移民船団は本国へ戻った想定で、各上陸国に **1–2 隻**（国家所有、大型なし）だけ残す。仕様: [`docs/simulation/frontier-start-modes.md`](../simulation/frontier-start-modes.md)。
- 他パターンは従来どおり真の海洋港へ史実ガイドラインを配布する。
- 配布結果は既存の `ShipHull` レジストリに載り、**Vessel assets**（`VesselAssetsOverviewDialog`）が所有者別に集計・表示する。
- 配布量・船級比・国家/商家比は `historicalPeriod` と **海洋ロール**（港数・港の質中心。領土面積・総人口の単純比例ではない）に従う。
- 史実どおり **外れ値**（小国の旗艦 1 隻、大国でも港が弱ければ Galleon 0）を許容する。

### 1.2 非目的（本 Phase ではやらない）

- Economy の `Sloop`/`Caravel`/`Galleon` **Goods 在庫** への同時配布（Phase 10 bridge とは別。Hull ≠ saleable Good）。
- 所有ラベルの細分化（王族・ギルド・教会を UI 行として増やす）。ゲーム上の所有者は既存の `"state" | "market"` のみ。
- 生成時の過去シミュレーション再生（資材 warm-up と同じく **明示的 seed**）。
- 港湾収容力の docked 枠を seed で埋めること（平時はほぼ `voyage`）。
- CSV のランタイム動的読込（設計データは TS 定数へ写し、CSV は較正用の正本として残す）。

---

## 2. 現状（実装済み）

| 要素 | 場所 | 備考 |
| :--- | :--- | :--- |
| 船級 3 ティア | `src/types/shipClasses.ts` / `generators/shipClasses.ts` | sloop / caravel / galleon |
| 完成船体 | `ShipHull { id, shipClassId, owner, ownerId, homeBurgId, status }` | `owner: "state" \| "market"` |
| 完成カウンタ | `completedHulls["state\|market:ownerId:shipClassId"]` | Shipyards Overview も参照 |
| 完成処理 | `completeHull()` in `shipyardQueue.ts` | キュー完成時のみ呼ばれる |
| 初期化フック | `shipbuilding.initialization` map-ready task | reset → candidates → 資材 initial stock |
| Vessel assets | `vessel-assets-overview.ts` | `getHulls()` を owner+homePort+class で group |
| 所有者判定 | `determineOwner(burg)` | capital/citadel → state、他 → market |
| 技術ポイント | `stateTechPoints[stateId]` | キューの解禁ティアを決める |
| 期間設定 | `worldContext.options.historicalPeriod` | early/high/late/ageOfExploration |

**ギャップ**: 生成直後 `_hulls` / `completedHulls` は常に空。Vessel assets は "No completed vessels found."。造船は 0 からキュー進行のみ。

---

## 3. 史実から固定する設計判断

調査セッション（`docs/data/historical-ship-fleets/` + 議論）からの拘束条件:

1. **大型船は面積・総人口に単純比例しない。** 港・商業資本・造船志向が主因。外れ値が普通に混ざる。
2. **船体数の過半は商家（民間）。** 国家は少数の戦力核／威信船。戦時徴用は既に voyage/docked ロジックで表現済み。
3. **時代で船級 mix が変わる。** Early はほぼ小型、Large は Late 以降に薄く出現。
4. **ゲーム船級名は時代横断のサイズ・ティア。** Early の "Caravel" は中型貨客船の代理であり、史実 caravel ではない。
5. **海洋都市国家型** は小国でも `major_maritime` になり得る（ヴェネツィア型）。判定は面積ではなく **港密度・港数・Naval 文化**。

---

## 4. データモデルと配布アルゴリズム

### 4.1 ランタイム定数（CSV の写し）

新規モジュール（案）:

```text
src/extensions/shipbuilding/generators/initialFleetTables.ts
src/extensions/shipbuilding/generators/initialFleet.ts
src/extensions/shipbuilding/generators/initialFleet.test.ts
```

`initialFleetTables.ts` に以下を **手で同期した定数** として持つ（CSV は docs 正本）:

| テーブル | CSV 元 | 用途 |
| :--- | :--- | :--- |
| `PERIOD_CLASS_RATIOS` | `period-ship-class-ratios.csv` | 時代別 sloop/caravel/galleon 比率 |
| `PERIOD_OWNERSHIP` | `period-ownership-mix.csv`（集約） | 国家 vs 商家 hull 比 |
| `STARTER_GUIDELINES` | `starter-fleet-guidelines.csv` | role × period の基数 |

所有ラベルの集約（ゲーム 2 値への写像）:

| 史実 owner_code | ゲーム `owner` |
| :--- | :--- |
| `crown_state`, `city_commune`（海軍・都市艦隊） | `"state"` |
| `merchant_private`, `merchant_guild_company`, `nobility`, `church_order` | `"market"` |

`starter-fleet-guidelines.csv` の `state_owned_share` / `merchant_owned_share` をそのまま使い、`period-ownership-mix` は較正・ドキュメント用。実装の第一ソースは starter guidelines。

### 4.2 対象国家

`pack.states` を走査し、次を満たす state のみ:

- `state.i > 0`（中立帯 state 0 を除外）
- 少なくとも 1 つの **海洋港 burg** を持つ  
  （`burg.port` あり、かつ `cells.haven` の feature type が `ocean` — shipyard 候補と同じ海判定）

造船適性（森林）は **必須にしない**。港があれば seed 対象。母港割当では shipyard 候補を優先する。

無所属港町（`burg.state === 0`）:

- Phase 1 では **seed しない**（Vessel assets の state 行が主用途。必要なら Phase 2 で market-only free city）。

### 4.3 海洋ロール `maritime_role`

領土面積・総人口を主入力にしない。

```text
portCount = 当該 state の海洋港 burg 数
shipyardPortCount = そのうち shipyard candidate 数
capitalIsPort = 首都が海洋港か
navalCultureShare = 港セル文化が Naval の割合（任意・弱補正）
```

| role | 判定（暫定） |
| :--- | :--- |
| `minor_coastal` | `portCount == 1` かつ `!capitalIsPort`、または港が極小 |
| `regional_maritime` | `portCount` 2–3、または 1 港でも首都港 |
| `major_maritime` | `portCount >= 4`、または `portCount >= 2 && shipyardPortCount >= 2`、または Naval 文化が強く港 >= 2 |
| `oceanic_empire` | `lateMedieval` / `ageOfExploration` のみ。`portCount >= 6` かつ shipyard 多数、**かつ** マップ内で上位少数（例: portCount 上位 1–2 国、または閾値超えが 0 なら不採用） |

`earlyMedieval` / `highMedieval` の `oceanic_empire` 行はガイドライン上 0 隻 — 実装でも role を落とす（`major_maritime` に clamp）。

### 4.4 隻数の算出

state ごと:

```text
guide = STARTER_GUIDELINES[period][role]
total = guide.total_ships_base
       + guide.ships_per_extra_port * max(0, portCount - guide.typical_ports)
total = clamp(total, 0, MAX_FLEET_PER_STATE)   // 安全上限 e.g. 200
```

船級分割:

1. ガイドラインの `sloop_count` / `caravel_count` / `galleon_count` を base とし、`total` が base と異なる場合は **同じ比率で再スケール**して整数化（最大剰余法）。
2. あるいは `PERIOD_CLASS_RATIOS[period]` で `total` を分割（ガイドラインと比率が食い違う場合は **ガイドライン優先**、比率表はコメント較正用）。
3. **外れ値旗艦**（面積非依存）:
   - `galleon_count == 0` かつ period ∈ {lateMedieval, ageOfExploration}
   - `role ∈ {minor_coastal, regional_maritime}`
   - 決定論 RNG で確率 `FLAGSHIP_OUTLIER_P`（暫定 0.08 / 0.12）が当たれば `galleon_count = 1`、`sloop` または `caravel` から 1 減らす。
4. period が earlyMedieval なら **galleon を常に 0** に強制（ガイドラインと一致）。

所有者分割:

```text
stateHulls  = round(total * guide.state_owned_share)
marketHulls = total - stateHulls
```

船級を state / market に配る優先:

| owner | 優先船級（残りを他へ） |
| :--- | :--- |
| state | galleon → caravel → sloop（威信・戦力核を国家寄り） |
| market | sloop → caravel → galleon（沿岸商船が厚い） |

史実の「大型は王冠・海洋共和国、小型は商家」に寄せる。合計は必ず一致。

### 4.5 母港 `homeBurgId` の割当

state の海洋港リストを用意:

- **state 船体**: capital 港 → citadel 港 → shipyard candidate → 人口降順港  
  （`determineOwner === "state"` になり得る burg を最優先し、Vessel assets の "State navy" と造船所の state キューの物語を揃える）
- **market 船体**: shipyard 以外の商港優先、なければ全港。**1 港に偏りすぎないよう** ラウンドロビン or 人口加重。

`ownerId`:

- state hull: `stateId`
- market hull: **母港の `burgId`**（既存 `completeHull` と同じキー体系）

1 港あたりの seed 上限（任意・推奨）:

```text
maxAtPort ≈ max(3, small + medium + large)  // portCapacity があれば
```

超過分は他港へ振り分け。全港が満杯なら打ち切り（安全弁）。

### 4.6 技術ポイントの底上げ

seed した最高船級を以後のキューでも維持できるよう:

```text
requiredTech = max techPointsRequired of seeded classes for that state
stateTechPoints[stateId] = max(existing, requiredTech)
```

これをしないと、Caravel/Galleon を配った直後にキューが Sloop に戻り不自然。

### 4.7 船体登録 API

`completeHull` から共通化:

```ts
/** Queue completion and map-gen seeding both use this. */
export function registerCompletedHull(args: {
  burg: Burg;
  owner: "state" | "market";
  shipClassId: string;
  states: readonly State[];
  /** When false, skip naval-tech side effects that assume "just built" (default true). */
  emitCompletedEvent?: boolean;
}): ShipHull
```

- `completedHulls` カウンタを +1
- `hulls[id]` を追加
- status: 既存と同じ（state かつ戦争中 → `docked`、他 → `voyage`）
- market なら `fmg:shipbuilding-merchant-hull-changed`
- `emitCompletedEvent !== false` なら `fmg:shipbuilding-ship-completed`  
  → `navalTechBonus` が state 船体を拾う

**seed 時**: `emitCompletedEvent: true` を推奨（Military fleet ボーナスと整合）。大量 seed でボーナスが跳ねすぎる場合は係数側で上限（既存 cap 3x）があるため許容。

資材・国庫は消費しない（「既に存在する艦隊」）。

### 4.8 RNG

拡張から `window` に触れず、`getWorldContext()` 経由で seed 可能な乱数を取るか、`api` に RNG が無い現状では:

- **案 A（推奨）**: `aleaPRNG` 相当を `mapId` + `"initial-fleet"` + `stateId` からローカルに生成（hostUtils に既にあれば利用）。
- **案 B**: 外れ値を確率ではなく **決定論スコア**（`hash(stateId) % 100 < p`）にする。

マップ再生成で再現可能であること。

---

## 5. パイプライン組み込み

`shipbuilding.initialization`（`index.ts`）の順序:

```text
1. reset（queues / hulls / tech クリア）
2. recompute candidates + port capacity
3. seedInitialFleets(candidates, portCapacity)   // ← 新規
4. publishMerchantHullSnapshot()
5. refreshShipyardsOverviewIfOpen / refreshVesselAssetsOverviewIfOpen
6. generateShipbuildingInitialStock（既存・資材）
```

依存:

- `dependsOn: ["economy.initialization"]` は現状維持（資材 stock が後段）。
- 艦隊 seed 自体は Economy 不要。Economy 無効でも Vessel assets に Hull が出る。
- Military の `fleet` 再生成タイミング: seed が `fmg:shipbuilding-ship-completed` を撃つ場合、map-ready 後の Military 生成がボーナスを読むかは既存順序を確認。読めなければ seed 後に一度 `navalTechBonus` が溜まるだけで、次の `Military.generate()` まで反映待ち（現状の完成時挙動と同じ — 許容）。

拡張無効時: seed しない（reset のみ）。有効化時に `requestMapReadyTask` が走る既存パスで seed される。

---

## 6. Vessel assets 表示（追加 UI は原則不要）

既存 `buildRows()`:

```text
group key = owner : ownerId : homeBurgId : shipClassId
columns   = Owner | Merchant organization | Home port | Class | Docked | Voyage | ... | Hull count
```

seed 後の期待:

| Owner | Operator | Home port | Class | Voyage | Hull count |
| :--- | :--- | :--- | :--- | ---: | ---: |
| Kingdom of X | State navy | Capital Port | Galleon | 1 | 1 |
| Kingdom of X | State navy | Capital Port | Caravel | 2 | 2 |
| Port Y | Market merchant fleet / org | Port Y | Sloop | 5 | 5 |

- 商家の組織名は Economy の `fmg:economy-merchant-operator-snapshot-request` に依存。Economy 無効時は "Market merchant fleet"（現状どおり）。
- **UI 変更は空状態メッセージ改善程度**（任意: "No completed vessels — enable Shipbuilding and regenerate"）。必須ではない。

Shipyards Overview の `completedHulls` 列も同じカウンタを見るため、seed 後に母港の造船所行に完成数が載る。

---

## 7. モジュール境界

```text
initialFleetTables.ts   — pure constants（period/role テーブル）
initialFleet.ts         — pure-ish: classify role, allocate counts, assign ports
shipyardQueue.ts        — registerCompletedHull / seed から呼ぶ
index.ts                — map-ready で seedInitialFleets を呼ぶ
```

- Generator 層: `pack` を読取、runtime hulls/tech を書込（既存 shipyardQueue と同じ拡張ランタイム）。
- Renderer / React: 変更なし（Zustand 行は open/refresh 時に再構築）。
- host モジュール直接 import 禁止パターンは遵守。`getWorldContext()` / runtime state 経由。
- `docs/data/.../*.csv` はドキュメント。ビルドに載せない。

---

## 8. 実装マイルストーン

### M1 — テーブルと純粋ロジック（単体テスト） — 実装済み

- [x] `initialFleetTables.ts` に starter guidelines / tech floors を定数化
- [x] `classifyMaritimeRole` / `planStateFleet` / `assignHullsToPorts`
- [x] 整数分割・early galleon=0・owner 分割の単体テスト

### M2 — 船体登録の共通化 — 実装済み

- [x] `completeHull` → `registerCompletedHull` 抽出
- [x] 既存 `shipyardQueue.test.ts` 緑
- [x] seed が completedHulls + hulls + tech floor を更新

### M3 — マップ生成接続 — 実装済み

- [x] `seedInitialFleets` を `shipbuilding.initialization` に接続（`generateShipbuildingInitialFleet`）
- [x] `publishMerchantHullSnapshot` / Vessel assets / Shipyards refresh

### M4 — 検証 — 単体済み / 手動確認は任意

- [x] 単体: role 分類、配分合計、owner キー、tech floor、ocean 港なし 0
- [ ] 手動: Shipbuilding 有効で生成 → Tools → Vessel assets に state/market 行

### M5 — 較正（実装後）

- [ ] 複数 seed で role 分布を観測し `STARTER_GUIDELINES` 係数を調整
- [ ] FLAGSHIP_OUTLIER_P / oceanic_empire 選出閾値を調整

---

## 9. 擬似コード

```ts
export function seedInitialFleets(
  candidates: readonly ShipyardCandidate[],
  portCapacity: ReadonlyMap<number, PortCapacity>
): void {
  const { pack, options } = getWorldContext();
  const period = options.historicalPeriod ?? "ageOfExploration";
  const oceanPortsByState = collectOceanPortsByState(pack);
  const shipyardBurgIds = new Set(candidates.map(c => c.burgId));
  const oceanicIds = pickOceanicEmpireStates(oceanPortsByState, period);

  for (const [stateId, ports] of oceanPortsByState) {
    if (stateId === 0 || ports.length === 0) continue;
    const role = classifyMaritimeRole({
      ports,
      shipyardBurgIds,
      period,
      forceOceanic: oceanicIds.has(stateId)
    });
    const plan = planStateFleet(period, role, ports.length, rngFor(stateId));
    if (plan.total === 0) continue;

    ensureTechFloor(stateId, plan.maxTier);
    const assignments = assignHullsToPorts(plan, ports, shipyardBurgIds, portCapacity);
    for (const a of assignments) {
      registerCompletedHull({
        burg: pack.burgs[a.homeBurgId],
        owner: a.owner,
        shipClassId: a.shipClassId,
        states: pack.states,
        emitCompletedEvent: true
      });
    }
  }
}
```

---

## 10. 受け入れ条件

1. Shipbuilding 有効で新規生成すると、海洋港を 1 つ以上持つ各 state に 1 隻以上の `ShipHull` が入る（early minor でもガイドライン最小 3 前後）。
2. Vessel assets を開くと、Owner が国家名または商港名、Class が Sloop/Caravel/Galleon、Hull count が seed 合計と一致する。
3. state / market の比率が period の `state_owned_share` から大きく外れない（±1 隻の丸めのみ）。
4. earlyMedieval で Galleon が現れない。ageOfExploration の major/oceanic では Galleon が現れ得る。
5. 同じ `mapId`/seed なら role と外れ値旗艦の有無が再現する。
6. 資材 initial stock（§4.6）と共存し、互いに壊さない。
7. `npm test` 対象ユニットが緑。`registerCompletedHull` 抽出後も建造キュー完成パスが従来どおり。

---

## 11. リスクと緩和

| リスク | 緩和 |
| :--- | :--- |
| 大国に Galleon が集まりすぎる | role を港ベースにし、面積を使わない。oceanic は上位 1–2 のみ |
| seed 過多で Military fleet ボーナス上限張り付き | 既存 cap（3x）を維持。必要なら seed 時だけ event 抑制フラグ |
| 母港が内陸誤判定 | shipyard と同じ ocean haven 判定を再利用 |
| ガイドラインと実マップ規模の乖離 | `MAX_FLEET_PER_STATE` と `ships_per_extra_port` で抑え、M5 で較正 |
| CSV と TS のドリフト | README に「定数同期」を明記。テストで主要数値を固定 |

---

## 12. 将来拡張（本 Phase 外）

- 無所属自由都市への market-only seed
- Vessel assets に seed 由来フラグや "Inherited fleet" 注記
- 史実 owner の 6 区分を UI サブラベル化（要 `ShipHull` 拡張）
- Economy Goods 在庫との橋渡し（Phase 10）と「市場に並ぶ船」と「完成 Hull」の二重計上防止
- culture `Naval` を role 判定の正式入力に昇格（現状は弱補正候補）

---

## 13. 実装チェックリスト（ファイル単位）

| 作業 | ファイル |
| :--- | :--- |
| 定数テーブル | `src/extensions/shipbuilding/generators/initialFleetTables.ts` |
| 分類・配分・seed | `src/extensions/shipbuilding/generators/initialFleet.ts` |
| 単体テスト | `src/extensions/shipbuilding/generators/initialFleet.test.ts` |
| `registerCompletedHull` 抽出 | `src/extensions/shipbuilding/generators/shipyardQueue.ts` |
| キューテスト追随 | `src/extensions/shipbuilding/generators/shipyardQueue.test.ts` |
| map-ready 接続 | `src/extensions/shipbuilding/index.ts` |
| データ正本（既存） | `docs/data/historical-ship-fleets/*` |
| 本計画 | `docs/plan/shipbuilding-initial-fleet.md` |
| 親計画への 1 行リンク | `docs/plan/shipbuilding.md` Phase 一覧に Phase 11 相当を追記 |

UI（`VesselAssetsOverviewDialog.tsx`）は **読み取りのみ**のため、M1–M3 が正しく Hull を書けば追加実装なしで受け入れ条件 2 を満たす。
