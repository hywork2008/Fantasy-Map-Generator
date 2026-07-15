# Shipbuilding Phase 8 — 資材消費ゲート

| 項目 | 内容 |
| :--- | :--- |
| Status | Implemented — 2026-07-15（M8.4 の E2E 回帰確認は継続） |
| Parent | [shipbuilding.md](shipbuilding.md) Phase 8 |
| Scope | Shipbuilding の建造進捗を Economy の市場在庫に接続する |
| Primary owners | Economy: 在庫・価格・原子的な消費 / Shipbuilding: 船級別必要量・進捗・停止状態 |

## 1. 目的

現在の `runShipyardTick()` は、造船適性を満たすすべての港で `BUILD_POINTS_PER_YEAR = 2` を無条件に加算する。
そのため Wood / Sails / Ropes / Tar が存在しなくても Sloop、Caravel、Galleon が完成する。本 Phase は、
**造船所の所属市場に必要資材が同時に存在するときだけ、その分の建造進捗を加算・消費する**ようにする。

これにより、森林伐採→Wood 供給低下→市場在庫の不足→造船停滞、ならびに物流到着・市場生産→在庫回復→造船再開、
という既存エコシステム上の因果を成立させる。

### 非目標

- `pack.cells.biome` の変更、伐採ロジック、森林回復率の変更
- Economy の `Ships` Good と個別 `ShipHull` の統合
- state treasury / 商会資金からの支払い、税、売り手への収益配分
- 港湾収容力による建造停止
- 新しい Caravan、資材専用の交易路、輸送予約
- 一括 `advanceTime()` と UI の日次 Advance Time を完全に同値にする時間エンジンの再設計

資金決済と収容力は、在庫ゲートの実測後に独立した Phase とする。両方を同時に導入すると「資材不足」と
「資金不足」、「係留枠不足」が区別不能になり、調整ができない。

## 2. 実装済みエコシステムの事実

### 2.1 Economy の供給・在庫・物流

| 要素 | 現在の挙動 | Phase 8 の扱い |
| :--- | :--- | :--- |
| 在庫 | `Market.goods[goodId].stock` が唯一の可変在庫。 | 造船資材の引当先。burg 個別在庫を新設しない。 |
| 農村供給 | `Markets.collectRuralProduction()` が biome と人口から市場 stock を増やす。 | 森林の Wood 供給はここを通じて回復する。 |
| 都市製造 | `Production.produce()` がレシピの材料を市場から買い、製品を市場へ売る。 | Sails / Ropes / Tar も既存の Good・レシピ・価格決定に従う。 |
| 市場間交易 | 輸出元 stock は Deal 作成時に減り、輸入先 stock は Caravan 到着時にだけ増える。 | 輸送中の資材は引当不可。到着後の次の資材請求から利用できる。 |
| 伐採 | Shipbuilding の `fmg:shipbuilding-log-harvested` を Economy が受け、セル別 Wood 産出係数を下げる。 | 完成船の Wood 消費とは別。両方が Wood 不足へ寄与する。 |
| 再生 | `tickForestRegrowth()` は減衰量を年 2% 回復し、Wood の将来生産量を戻す。 | 在庫を直接補充しない。次回の生産更新で市場 stock に表れる。 |

`Ships` Good のレシピは `{ Wood: 2, Sails: 2, Ropes: 2, Tar: 1 }` だが、これは市場で取引される汎用船舶の
製造である。一方 `ShipHull` は造船所が完成させる個別船体で、Military・航海に接続する。二者を同一在庫に
してはいけない。ただし Phase 8 の Sloop 基準必要量にはこのレシピを再利用する。

### 2.2 Shipbuilding の現在の責務

- `computeShipyardCandidates()` は外洋隣接かつ森林比率 30% 以上の港を導出する。
- `runLoggingTick()` は候補ごとに伐採イベントを出す。建造進捗・完成数とは連動しない。
- `runShipyardTick()` は技術ポイントを蓄積し、各候補の単一キューを無条件で進める。
- `ShipyardQueueEntry` は船級、所有者、進捗しか保持せず、停止理由や消費履歴を持たない。
- `PortCapacity` は表示用導出値であり、現在はキューを制約しない。

### 2.3 時間粒度の制約

UI の Advance Time は日単位で `advanceTime(0, 0, 1)` を繰り返す。一方、公開 API の
`advanceTime(years, months, days)` は hook を一度だけ呼ぶ。Economy は大きな差分を一度に渡された場合、
30日以上をまたいでも `Production.produce()` を一度しか予約しない。

Phase 8 はこの既存差異を解消する対象ではない。ただし大差分で資材を一度に請求して無料で複数隻を完成させる、
または要求量の丸めで無料進捗を生むことは防ぐ。UI 日次経路を正規のシミュレーション経路とし、一括 API は
「その時点の在庫に対する粗いシミュレーション」である既存仕様を維持する。

## 3. 採用する設計

### 3.1 所有権と依存関係

```text
Shipbuilding queue
  └─ request { burg, ship class, work points, material quantities }
        └─ synchronous CustomEvent
             └─ Economy validates every market stock and atomically consumes them
                    ├─ fulfilled → Shipbuilding advances those work points
                    └─ blocked   → Shipbuilding records a reason and advances nothing
```

- **Economy** が Good 解決、`Market.goods[].stock` の検査・減算、価格圧力の更新を所有する。
- **Shipbuilding** が必要量の式、進捗、停止理由、Overview 表示を所有する。
- Shipbuilding は Economy の generator を直接 import しない。現在の伐採イベントと同じく CustomEvent 契約で接続する。
- Economy が無効、未初期化、または対象 burg に市場がない場合、キューは `economyUnavailable` または `noMarket` で停止する。
  Shipbuilding レイヤーと候補表示は引き続き使えるため、拡張依存を `required` に変更しない。

### 3.2 船級別の必要量

`shipClasses.ts` に、10 build points あたりの正規化済み要求量を置く。

```ts
const MATERIALS_PER_TEN_BUILD_POINTS = {
  Wood: 2,
  Sails: 2,
  Ropes: 2,
  Tar: 1
} as const;
```

各請求量は `materialsPerTenBuildPoints * (requestedWorkPoints / 10)` とする。従って一隻を完成させた累計は:

| 船級 | build points | Wood | Sails | Ropes | Tar |
| :--- | ---: | ---: | ---: | ---: | ---: |
| Sloop | 10 | 2 | 2 | 2 | 1 |
| Caravel | 25 | 5 | 5 | 5 | 2.5 |
| Galleon | 60 | 12 | 12 | 12 | 6 |

市場 stock は小数を扱えるため、Tar の 2.5 のような要求量を許容する。表示は 2 桁へ丸めるが、判定・減算途中で
丸めて無料進捗を作らない。

### 3.3 原子的な資材請求イベント

新しいイベントは `fmg:shipbuilding-materials-requested` とする。`document.dispatchEvent()` は同期なので、
Economy listener は同じ detail object に結果を書き込み、Shipbuilding は dispatch 完了直後に結果を読む。

```ts
type ShipbuildingMaterialId = "Wood" | "Sails" | "Ropes" | "Tar";
type ShipbuildingMaterials = Readonly<Record<ShipbuildingMaterialId, number>>;

type ShipbuildingMaterialRequest = {
  burgId: number;
  marketId: number;
  shipClassId: string;
  owner: "state" | "market";
  workPoints: number;
  materials: ShipbuildingMaterials;
  result?:
    | { status: "fulfilled" }
    | { status: "economyUnavailable" | "noMarket" | "missingGood" }
    | { status: "insufficientMaterials"; missing: Partial<ShipbuildingMaterials> };
};
```

契約の TypeScript 型と runtime type guard は `src/types/shipbuildingMaterials.ts` に置く。これは型のみの共有で、
動的 extension が host を runtime import する契約にはしない。イベント listener が不在の場合は
`economyUnavailable` と解釈する。

Economy の処理は次の順序を必須とする。

1. Economy が有効、market と全4 Good が存在・有効であることを確認する。
2. 全4 Good の `stock >= requested` を確認し、不足分を `missing` に集める。
3. 一つでも不足なら **どの stock も変更しない**。
4. 全部が揃う場合だけ全4 stock を減らし、通常の市場購入と同じ方向の価格圧力を適用する。
5. 今回は Deal、treasury、税を変更しない。これは「市場在庫からの産業投入」であり、資金決済を持たない MVP とする。

この処理は `Markets` に public な `tryConsumeShipbuildingMaterials()` を追加して閉じ込める。イベント listener で
直接 `Market.goods` を書き換えない。

### 3.4 進捗・停止状態

`ShipyardQueueEntry` に以下を追加する。

```ts
type ShipyardBlockedReason =
  | "economyUnavailable"
  | "noMarket"
  | "missingGood"
  | "insufficientMaterials";

blockedReason?: ShipyardBlockedReason;
missingMaterials?: ShipbuildingMaterialShortage;
```

- 資材請求が `fulfilled` のときだけ `progress` を増やし、停止情報を消す。
- 失敗時は `progress`、完成数、船体イベントを一切変えない。
- 失敗した期間の作業を後からまとめて進めない。資材がない間は職人が待機したものとし、次の請求周期から再開する。
- 技術ポイントの蓄積は資材不足と独立して継続する。研究と建造を同じ在庫ゲートに入れない。

日次の微小要求を2桁 market stock に丸めてゼロ消費にしないため、キュー内では **0.5 build points**
単位に分けて請求する。大きな tick でもこの上限で反復し、船級の完成境界で必ず分割する。
各請求は成功した時点でのみ進捗化し、失敗した小区間の潜在作業は破棄する。

## 4. 実装計画

### M8.0 — 契約と必要量の純粋ロジック（実装済み）

- `src/types/shipbuildingMaterials.ts`: 資材 request/result の discriminated union と runtime type guard。
- `src/extensions/shipbuilding/generators/shipClasses.ts`: 正規化済み必要量と `getMaterialsForWork(shipClass, workPoints)`。
- unit test: 10 / 25 / 60 points の累計量、ゼロ・負値、端数を検証。

受け入れ: Sloop が既存 `Ships` レシピと一致し、他船級は build-point 比に正確に比例する。

### M8.1 — Economy の原子的市場消費（実装済み）

- `markets-generator.ts`: `tryConsumeShipbuildingMaterials(marketId, materials)` を実装。
- `economy/index.tsx`: request event listener を登録・cleanup し、Economy 無効時は応答しない。
- unit test: 成功時の全素材減算・価格圧力、不足時の全量ロールバック、Good/market 不在、輸送中資材を使えないこと。

受け入れ: 一つでも不足なら全 Good の stock と price が不変。成功時は要求量だけ減り、stock が負にならない。

### M8.2 — Shipyard queue のゲート化（実装済み）

- `shipyardQueue.ts`: 請求関数を注入し、時間差分を 0.5 build points・完成境界で分割する。
- `index.ts`: event dispatch を注入し、Economy 無効時に明示的な停止結果を返す薄い adapter を置く。
- `ShipyardQueueEntry`: blocked state と missing quantities を保持する。
- unit test: 充足時の進捗・完成、不足による停止、在庫補充後の再開、複数完成を含む大差分、state/market 両所有者。

受け入れ: 在庫ゼロの候補は何年進めても hull を完成させない。資材補充後は同じ queue が新規生成なしで再開する。

### M8.3 — Overview と可観測性（実装済み）

- `ShipyardsOverviewDialog` に `Materials` 列を追加する。
- 通常時は `Supplied`、停止時は `Waiting: Wood 0.35, Tar 0.10` のように欠乏量を表示する。
- tooltip は「市場在庫のみを見る。輸送中の貨物・伐採ポテンシャルは含まない」と明記する。
- dialog を開いたまま tick しても既存の `refreshShipyardsOverviewIfOpen()` で値が更新されることを確認する。

受け入れ: 不足理由が owner、ship class、進捗と混同されずに読める。Economy 無効時もクラッシュしない。

### M8.4 — 統合・回帰検証（unit test 実装済み、E2E は継続）

- Economy + Shipbuilding を有効にした integration test で、伐採、Wood 低下、補給 Caravan 到着、再開を検証する。
- Shipbuilding のみ有効な既存 map で queue が停止表示になることを検証する。
- `advanceTime(0, 0, 1)` を繰り返す経路を主対象とし、一括 API では「資材なしで完成しない」安全性のみを検証する。
- E2E: Shipyards overview の進捗停止と再開を、`window.fmg` への直接 mutation ではなく UI 操作と test helper 経由で確認する。

## 5. リスクと対策

| リスク | 対策 |
| :--- | :--- |
| 端数要求が `rn(..., 2)` でゼロになり、日次進捗が無料になる | 0.5 build points の請求単位へ集約し、進捗は成功済み請求と同じ work points だけを増やす。 |
| 1資材だけ減って後から他資材不足が判明する | 全量検査後の一括減算のみを許す。 |
| Economy と Shipbuilding の直接 import で循環・分離違反になる | 同期 CustomEvent と型だけのイベント契約を使う。 |
| 伐採で減った Wood が直ちに在庫からも消え、二重消費になる | 伐採は将来の生産量、資材ゲートは現在 stock と明確に分ける。 |
| 一括 Advance Time が UI 日次経路と異なる結果を出す | 既存の時間粒度制約として文書化し、Phase 8 は bulk での無料完成を禁止する。完全な同値化は別計画。 |
| 資材不足と資金不足が同じ表示になる | MVP は資金を扱わず、blocked reason を資材・Economy 状態だけに限定する。 |

## 6. 完了条件

1. 完成船一隻ごとに、船級に対応する Wood / Sails / Ropes / Tar が市場 stock から失われる。
2. 一つでも不足すれば、同じ請求の他資材も失われず、進捗も完成イベントも発生しない。
3. 交易 Caravan が到着して在庫が増えれば、次の請求周期に停止中キューが再開する。
4. 伐採・森林再生は既存どおり Wood の生産量だけへ作用し、biome と個別船体の意味を変えない。
5. Economy が無効または市場を持たない map でも Shipbuilding UI は動作し、理由付きで建造のみ停止する。
6. Shipbuilding・Economy の既存 unit test、追加 unit/integration test、関連 E2E が通る。
