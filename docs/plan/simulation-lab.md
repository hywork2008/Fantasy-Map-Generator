# Simulation Lab — Headless tick / CLI / ログ蓄積 / 分析環境 設計

**Status**: design only（本ドキュメントは設計。実装には進まない）  
**Date**: 2026-07-14  
**Related**:

| Doc / Code | Relation |
| :--- | :--- |
| `docs/simulation/advance-time.md` | `advanceTime` / day loop / tick hooks |
| `docs/plan/military/manpower-ecosystem.md` | 人口・兵力・死者台帳（in-memory 現状） |
| `src/generators/timeEngine.ts` | 時計・人口・manpower・拡張 hook |
| `src/generators/populationLossTracker.ts` | 死者 40 日リングバッファ（UI 用） |
| `src/utils/aiDebugExporter.ts` | `captureSnapshotData()`（状態の部分スナップショット） |
| `src/types/fmg.d.ts` | `window.fmg` 公開面 |
| `tests/e2e/` | Playwright 経由の `window.fmg` アクセス先例 |

---

## 0. 目的

ブラウザ UI を開かずに（または最小限の headless ブラウザで）:

1. **ゲーム内 tick（Advance Day 等）を高速・大量に回す**
2. **事象を追跡可能なテキスト／構造化ログとして永続化する**
3. **捨てる前提の実験データを、安いストレージ／tmpfs に置き、一発削除できる**
4. **後からファイル grep・簡易集計・MariaDB/SQL で分析できる**
5. LAN 上の **64GB ノート 2 台 + Docker** を計算・蓄積ノードとして使える

Population Overview の Deaths（1d/7d/30d の集約）は **対話用の窓**のままにし、Lab では **1 日 1 ファイル（または append-only NDJSON）で無制限に残す**。

「為政者キャラが何を見て方針を決め、このターンから軍を動かしたか」も、同じ run フォルダに **意思決定ログ**として残す。

---

## 1. 制約と現実（このリポジトリ固有）

### 1.1 FMG はブラウザ前提の単一プロセス

- 状態の正規入口は **`window.fmg`**（`world` / `simulation` / `actions` / `extensionAPI`）
- シミュレーションは `advanceTime` + `registerTimeTickHook` が中心だが、**DOM / SVG / localStorage / canvas** に触れる経路が多数
- 拡張（Economy / Nobility / Characters）は **browser 上の同一モジュールグラフ**で動く
- 現状 **Node だけで `initApp` を完走する経路は無い**

したがって「API で window.fmg を叩く」を実現するには、少なくとも次のどちらかが必要:

| 方式 | 中身 | 速度 | 忠実度 | 実装コスト |
| :--- | :--- | :--- | :--- | :--- |
| **A. Headless Browser Driver** | Playwright が Chromium を起動し `page.evaluate(() => fmg.actions.advanceTime(...))` | 中（ブラウザ起動・描画コスト） | 最高（本番と同じ） | 低〜中（E2E 資産を流用） |
| **B. Simulation Core 抽出** | `timeEngine` + generators を DOM 無し Node で動かす | 高 | 高（抽出漏れで乖離） | 高 |
| **C. Hybrid** | 生成・拡張 ON は A、tick ループは B に寄せる | 高 | 要検証 | 中〜高 |

**推奨**: **A で Lab v1 を立ち上げ、ボトルネックを測ったうえで B を選択的に切る（C）**。  
「捨てるかもしれないデータ」を今すぐ回したい用途には A が最速で価値が出る。

### 1.2 既にあるフック

- `window.fmg.actions.advanceTime`（型定義は現状 `deltaYears` のみだが実装は `deltaYears, deltaMonths?, deltaDays?` — Lab で正式に 3 引数を公開する）
- `document` の `fmg:time-advanced` / `fmg:simulation-updated`
- `captureSnapshotData()` — states / military / burgs / simulation の部分 clone
- `populationLossTracker` — ただし **40 日で捨てる**（Lab の日次ログとは役割分担）
- Playwright E2E helpers（`window.fmg` 読み取りパターン）

### 1.3 非目標（Lab v1）

- ブラウザ UI の完全置き換え
- 毎 tick の full `pack.cells` ダンプ（容量爆発）
- 本番プレイヤー向けクラウドセーブ
- リアルタイム対戦ネットコード

---

## 2. 全体アーキテクチャ

```
┌─────────────────────────────────────────────────────────────────┐
│  Operator (dev laptop / SSH)                                    │
│  fmg-lab CLI  |  curl / scripts  |  Jupyter / SQL client        │
└───────────────┬───────────────────────────────┬─────────────────┘
                │ HTTP / SSH / shared volume      │
                ▼                                 ▼
┌──────────────────────────────┐   ┌──────────────────────────────┐
│  Lab API Node A (Docker)     │   │  Lab API Node B (Docker)     │
│  64GB notebook on LAN        │   │  64GB notebook on LAN        │
│                              │   │                              │
│  ┌────────────────────────┐  │   │  same image, other runs      │
│  │ fmg-lab-api (TS/Node)  │  │   │                              │
│  │  - run registry        │  │   │                              │
│  │  - job queue (optional) │  │   │                              │
│  └──────────┬─────────────┘  │   │                              │
│             │                │   │                              │
│  ┌──────────▼─────────────┐  │   │                              │
│  │ Worker: Playwright     │  │   │                              │
│  │  Chromium + FMG build  │  │   │                              │
│  │  OR later: node-core   │  │   │                              │
│  └──────────┬─────────────┘  │   │                              │
│             │ writes         │   │                              │
│  ┌──────────▼─────────────┐  │   │                              │
│  │ Run Store (volume)     │◄─┼───┤ optional NFS/rsync mirror    │
│  │ tmpfs or SSD bind      │  │   │                              │
│  └────────────────────────┘  │   │                              │
└──────────────────────────────┘   └──────────────────────────────┘
                │
                │ optional ETL (batch, not per-tick)
                ▼
        ┌───────────────┐
        │ MariaDB       │  ← 興味のある run だけ load
        └───────────────┘
```

### 2.1 三層の責務

| 層 | 名前 | 役割 |
| :--- | :--- | :--- |
| **Engine** | FMG シミュレーション本体 | マップ生成・`advanceTime`・拡張 tick。真実の状態を持つ |
| **Lab Host** | CLI / API | run の作成、tick ジョブ、スナップショット要求、削除、一覧 |
| **Run Store** | ディレクトリ木 | テキスト／NDJSON／JSON の永続化。DB ではない |

DB は **分析用の二次派生**。一次ソースは常に Run Store。

---

## 3. Run Store — フォルダ規約

### 3.1 ルート

```
$FMG_LAB_ROOT/                    # 例: /var/fmg-lab  or  tmpfs mount
  runs/
    {runId}/
      meta.json                   # seed, options, extensions, createdAt, host
      config.json                 # 再現用: 生成パラメータ、有効拡張、sim toggles
      map.map                     # 任意: ブラウザ互換セーブ（重い場合は間引き）
      snapshots/
        initial.json.gz           # 生成直後の要約スナップショット
        day-000365.json.gz        # 任意 cadence のフル要約
      events/                     # append-only 事象ストリーム
        ticks.ndjson              # 1 行 = 1 tick メタ（必須・軽い）
        military/
          moves.ndjson
          battles.ndjson
        population/
          deaths/
            0100-03-15.ndjson     # 暦日ごと 1 ファイル（Deaths の「永遠ログ」）
            0100-03-16.ndjson
          living/
            day-000010.json       # 任意 cadence（Living 相当の集計）
        strategy/
          goals.ndjson            # strategicGoals の変化
          decisions.ndjson        # 為政者 AI の方針テキスト／スコア
        characters/
          actions.ndjson
        economy/                  # Economy ON 時のみ
          markets.ndjson
      indexes/
        by-state/{stateId}.json   # 任意: 後から付けた索引
      reports/
        summary.md                # CLI が吐く人間向け要約
      .lock                       # 実行中 worker
```

`runId` 例: `20260714T153012_seed-42_h1`（時刻 + seed + host 短縮）。

### 3.2 なぜ「1 日 1 ファイル」か（Deaths）

- Population Overview の 1d/7d/30d は **UI 用の集約窓**のまま維持
- Lab は **解析・捨てる実験**向けに日次ファイルを無限保持
- 1 ファイルが壊れても他の日は残る
- `deaths/0100-03-15.ndjson` を `cat` / `jq` / 日次 ETL しやすい
- 月や年にまとめて gzip する **compact ジョブ**を後付け可能

### 3.3 ストレージ負荷への答え

毎 tick のフル `pack` 書き込みは **禁止**（既定）。既定は:

| 書き込み | 頻度 | サイズ感 |
| :--- | :--- | :--- |
| `events/ticks.ndjson` 1 行 | 毎 tick | 数百 B |
| `deaths/YYYY-MM-DD.ndjson` 行追加 | 死がある tick のみ | 可変・小さい |
| `military/moves.ndjson` | 移動があった tick のみ | 中 |
| 要約スナップショット | N 日に 1 回 | 数百 KB〜数 MB gzip |
| full map セーブ | 手動 or 稀 | 大 |

**SSD を惜しむ場合**:

1. Run Store を **tmpfs**（RAM ディスク）に載せる — 64GB 機なら 16–32GB を lab volume に
2. 興味のある run だけ rsync / tar で SSD や NAS へ
3. 終わった run は `fmg-lab run rm` で丸ごと削除
4. Docker volume: `type=tmpfs,destination=/data`

書き込みバッファ:

- Worker 内 **Ring buffer → 1〜5 秒ごと、または N tick ごとに flush**
- `fsync` はバッチ境界のみ（クラッシュ時に数秒ロスを許容）

---

## 4. イベントスキーマ（機械可読）

すべて **NDJSON**（1 行 1 JSON）。人間が `jq` でき、MariaDB に `LOAD DATA` しやすい。

### 4.1 共通エンベロープ

```ts
interface LabEventBase {
  v: 1;                          // schema version
  runId: string;
  tick: number;                  // simulationContext.tickCount
  cal: { y: number; m: number; d: number; era: string };
  t: string;                     // event type, e.g. "pop.death"
  // payload fields follow per type
}
```

### 4.2 例: 死者

```json
{"v":1,"runId":"...","tick":42,"cal":{"y":100,"m":3,"d":15,"era":"Era"},"t":"pop.death","stateId":3,"cause":"combat","people":1284,"source":"localSkirmish"}
```

`cause`: `combat | famine | natural | other`（現行 tracker と一致）  
`source`: 計上 API 名（`applyDemographicCasualties` / `agriculturalStress` / …）

### 4.3 例: 軍隊移動

```json
{"v":1,"runId":"...","tick":42,"cal":{...},"t":"mil.move","stateId":3,"regimentI":2,"fromCell":110,"toCell":115,"x":12.3,"y":45.6,"a":5200,"quality":0.81,"action":"march","goalTargetBurg":88}
```

### 4.4 例: 戦略意思決定（為政者 AI）

```json
{"v":1,"runId":"...","tick":42,"cal":{...},"t":"ai.decision","stateId":3,"rulerId":17,"kind":"strategicGoal","summary":"Siege burg 88 — enemy weak","inputs":{"ownTroops":12000,"enemyEst":800,"tension":100},"outputs":{"goalType":"siege","targetBurg":88,"requiredAttackForce":0.8},"rationale":["outnumbered_enemy","lost_enclave_in_stateHistory"]}
```

**重要**: 既存 AI は rationale を出していない。Lab 用に **strategic-planner / mobilization の分岐点で構造化ログを emit する hook** を後から足す（§7.3）。

### 4.5 ticks メタ行（必須・軽い）

```json
{"v":1,"runId":"...","tick":42,"cal":{...},"t":"tick.end","dtDays":1,"ms":12.4,"deathsCombat":1284,"deathsNatural":9021,"regimentsMoved":3,"hooks":["demographics","manpower","nobility","economy"]}
```

---

## 5. Engine 側の変更契約（実装時）

ブラウザ本番と Lab で同じシミュレーションになるよう、**Observer を 1 本**に寄せる。

### 5.1 `SimulationTelemetry`（新・薄い）

```ts
// src/lab/telemetry.ts  または src/services/simulationTelemetry.ts
export interface SimulationTelemetry {
  onTickStart?(ctx: TickContext): void;
  onTickEnd?(ctx: TickContext, stats: TickStats): void;
  onDeath?(e: DeathEvent): void;
  onRegimentMove?(e: MoveEvent): void;
  onBattle?(e: BattleEvent): void;
  onAiDecision?(e: DecisionEvent): void;
}

let _telemetry: SimulationTelemetry | null = null;
export function setSimulationTelemetry(t: SimulationTelemetry | null): void { _telemetry = t; }
export function telemetry(): SimulationTelemetry | null { return _telemetry; }
```

- **ブラウザ**: 既定 `null`（コストゼロ）
- **Lab**: Host が FileTelemetry / NetworkTelemetry を注入

### 5.2 既存コードへの刺し所（最小）

| 箇所 | emit |
| :--- | :--- |
| `populationLossTracker.recordDeaths` | `onDeath` |
| `regimentMovement` が cell を進めたとき | `onRegimentMove` |
| `applyDemographicCasualties` / skirmish / siege | `onBattle` または death に `source` |
| `strategic-planner` goal set/clear | `onAiDecision` |
| `timeEngine.advanceTime` 終端 | `onTickEnd` |

**Deaths の Lab 永続化**は tracker を置き換えず、`recordDeaths` の末尾で telemetry にミラーするだけでよい（UI リングバッファは維持）。

### 5.3 `window.fmg.actions` の Lab 向け拡張（任意）

```ts
advanceTime(years: number, months?: number, days?: number): void;
// Lab only (guarded):
exportSnapshot(kind: "summary" | "military" | "population"): object;
getLabMetrics(): { deathsToday: ...; troopsByState: ... };
```

ブラウザ UI からは呼ばない。Playwright の `page.evaluate` 専用。

### 5.4 描画スキップ（高速化）

Lab 実行時フラグ `lab.skipRender = true`:

- `advanceTime` 内の `*Renderer.render` を no-op
- WebGL `scheduleWebglUpdate` を no-op
- `runTimeSimulation` の rAF を使わず **同期 for ループで day を回す**

これだけで Playwright 経路でも体感が大きく上がる。

---

## 6. Lab Host — CLI と API

### 6.1 CLI（ローカル／SSH 先で同じバイナリ）

パッケージ案: `packages/fmg-lab` または `scripts/lab/` + `tsx`。

```bash
# 新規 run（マップ生成まで）
fmg-lab run create --seed 42 --extensions nobility,economy --out $FMG_LAB_ROOT

# 既存 .map から
fmg-lab run import --map ./saves/foo.map

# tick（1 日 × N）
fmg-lab run tick <runId> --days 365 --sync-day   # 必ず 1 日ずつ（フック忠実）

# 一括年（注意: hook 粒度が変わる — フラグ明示）
fmg-lab run tick <runId> --years 1 --bulk

# 要約スナップショット強制
fmg-lab run snapshot <runId>

# 一覧 / 削除（実験データの始末）
fmg-lab run ls
fmg-lab run rm <runId>          # フォルダごと削除
fmg-lab run rm --older-than 7d

# 簡易集計（ファイルだけ・DB 不要）
fmg-lab stats deaths <runId> --from 100-01-01 --to 100-12-31 --by state,cause
fmg-lab stats military <runId> --state 3

# MariaDB へ任意ロード
fmg-lab etl load <runId> --dsn 'mysql://...'
```

### 6.2 HTTP API（Docker 上の TS サーバー）

| Method | Path | 説明 |
| :--- | :--- | :--- |
| `POST` | `/runs` | create（body: seed, extensions, …） |
| `GET` | `/runs` | list |
| `GET` | `/runs/:id` | meta |
| `POST` | `/runs/:id/tick` | `{ days, bulk? }` → job id |
| `GET` | `/jobs/:id` | 進捗 |
| `GET` | `/runs/:id/events?type=pop.death&from=&to=` | ストリーム／ページング |
| `GET` | `/runs/:id/files/*` | 静的ファイル配信（NDJSON） |
| `DELETE` | `/runs/:id` | フォルダ削除 |
| `POST` | `/runs/:id/snapshot` | 要約保存 |

認証: LAN 内なら shared token / reverse proxy。インターネット公開は想定しない。

実装スタック案: **Fastify or Hono + TypeScript**、ワーカーは **同一コンテナの Playwright** または **別 worker コンテナ**。

### 6.3 CLI と API の関係

```
CLI ──HTTP──► Lab API ──► Worker(Engine)
  └─ (local mode) ──► Worker を子プロセスで直接起動
```

ローカル開発は `fmg-lab --local`、ノート 2 台は API 常駐。

---

## 7. Worker 実装戦略（段階）

### Phase L0 — Playwright Lab（最短で動く）

1. `vite build` + `vite preview` を worker が起動、または静的 serve
2. Playwright Chromium headless
3. `page.goto` → マップ生成完了待ち（既存 E2E と同様 `window.fmg.world.mapId`）
4. ループ:

```ts
for (let i = 0; i < days; i++) {
  await page.evaluate(() => {
    window.fmg.actions.advanceTime(0, 0, 1); // 3 引数を型と実装で揃える
  });
  // telemetry はページ内で window.__labBuffer に積み
  // または evaluate で差分を引き抜いて Node 側で flush
}
```

**ページ内バッファ案**（書き込み回数削減）:

```ts
// injected
window.__lab = { buffer: [], flush() { const b = this.buffer; this.buffer = []; return b; } };
// recordDeaths 末尾: window.__lab?.buffer.push(...)
// Node: every 10 ticks → const events = await page.evaluate(() => window.__lab.flush())
```

Node 側が Run Store に append。**ブラウザ FS に直接書かない**（権限・性能・ポータビリティ）。

### Phase L1 — 描画オフ + 同期 day ループ

- `labMode` フラグで Renderer / WebGL 無効
- `runTimeSimulation` 相当を worker が **同期 for** で実行（rAF 無し）
- 目標: 1 年 = 365 tick を数秒〜数十秒（マシン依存）

### Phase L2 — Simulation Core の Node 実行（任意・高速）

- `timeEngine` / `demography` / `manpower` / `regimentMovement` / nobility generators を **DOM 非依存**に切り出し
- `worldContext` を plain object で渡す
- 拡張は「Node 対応済み」だけ enable
- 生成パイプラインは当面 Playwright のまま（地図生成が重い・DOM 依存が深い）

**判定基準**: L1 で 1 日 tick が 50ms を切らない、または 1000 年バッチが現実的でないとき L2 へ。

### Phase L3 — 分散

- API が run を A/B ノードに割当（sticky: 1 run = 1 worker、状態はメモリに常駐）
- 完了 run の Store を rsync で収集ノードへ
- 同時 N run 並列（64GB × 2 なら Chromium 多重に注意 — 1 ノード 2〜4 worker が目安）

---

## 8. Docker 配置（ノート 2 台）

### 8.1 サービス

```yaml
# docker-compose 概念
services:
  lab-api:
    image: fmg-lab:latest
    ports: ["8080:8080"]
    environment:
      FMG_LAB_ROOT: /data
      FMG_LAB_TOKEN: ...
    volumes:
      # 実験用は tmpfs 推奨
      - type: tmpfs
        target: /data
        tmpfs:
          size: 17179869184   # 16GiB 例
    # または bind: /mnt/lab-ssd:/data
    deploy:
      resources:
        limits:
          memory: 24G

  # optional
  mariadb:
    image: mariadb:11
    profiles: ["analytics"]
    volumes:
      - mariadb-data:/var/lib/mysql
```

Playwright 用イメージは公式 `mcr.microsoft.com/playwright` ベースに FMG build を載せる。

### 8.2 2 台運用

| マシン | 役割 |
| :--- | :--- |
| Host A | lab-api + workers（常時） |
| Host B | lab-api + workers（負荷時）または ETL + MariaDB + 分析 |
| Dev laptop | CLI のみ。重い tick は A/B に投げる |

DNS/hosts: `fmg-lab-a.local:8080`。CLI:

```bash
export FMG_LAB_URL=http://192.168.x.10:8080
fmg-lab run tick $ID --days 3650
```

### 8.3 データの寿命

```
tmpfs (hot, volatile)
  → fmg-lab run export $ID ./archive/$ID.tar.zst   # 興味あり
  → fmg-lab run rm $ID                             # 捨てる
  → etl load は archive からでも可
```

---

## 9. 分析パス

### 9.1 ファイルだけ（第一選択）

```bash
# 戦闘死が多い日
rg '"cause":"combat"' runs/$ID/events/population/deaths/ | wc -l

# 国家 3 の 1 年分 combat
jq -s 'map(select(.stateId==3 and .cause=="combat")) | map(.people) | add' \
  runs/$ID/events/population/deaths/0100-*.ndjson

# 簡易 CLI
fmg-lab stats deaths $ID --group-by cause
```

### 9.2 MariaDB（第二選択・興味 run のみ）

テーブル例:

```sql
CREATE TABLE death_events (
  run_id VARCHAR(64),
  tick INT,
  y SMALLINT, m TINYINT, d TINYINT,
  state_id INT,
  cause ENUM('combat','famine','natural','other'),
  people DOUBLE,
  source VARCHAR(64),
  INDEX (run_id, state_id, cause),
  INDEX (run_id, y, m, d)
);
```

ETL: `fmg-lab etl load` が NDJSON を bulk insert。  
**tick 毎の INSERT はしない**（設計の核心）。

### 9.3 Population Overview との関係

| 面 | UI Overview | Lab Store |
| :--- | :--- | :--- |
| Living | 対話・その場集計 | 任意 cadence の `living/day-*.json` |
| Deaths 1d/7d/30d | リングバッファ集約 | 使わない（ファイルが一次） |
| Deaths 全日 | 無し | `deaths/YYYY-MM-DD.ndjson` 永久（run 削除まで） |

UI は Lab を必須にしない。Lab は UI を必須にしない（ただし L0 は headless Chromium 内で同じコードを動かす）。

---

## 10. セキュリティと運用

- Lab API は **LAN 限定**、Bearer token
- run 削除は破壊的 — `rm` は確認フラグ `--yes`
- 生成マップの著作・シードは `meta.json` に残し再現可能に
- Chromium のサンドボックスは Docker 内で既知の flag が必要な場合あり

---

## 11. 実装フェーズ（推奨順）

| Phase | 成果 | 目安 |
| :--- | :--- | :--- |
| **L0a** | `SimulationTelemetry` + `recordDeaths` / tick end ミラー | 小 |
| **L0b** | Playwright worker + `fmg-lab run create/tick/rm` + deaths 日次 NDJSON | 中 |
| **L0c** | military moves + tick.ndjson + skipRender | 中 |
| **L1** | Docker compose + tmpfs volume + API | 中 |
| **L1b** | strategic decision ログ（planner 分岐に emit） | 中 |
| **L1c** | `fmg-lab stats` 簡易集計 | 小 |
| **L2** | 任意 ETL → MariaDB | 小〜中 |
| **L3** | DOM 無し simulation core（必要なモジュールだけ） | 大 |
| **L4** | 2 ノード job 分散 | 中 |

**最初のマイルストーン（L0b）**で既に:

```bash
fmg-lab run create --seed 1
fmg-lab run tick $ID --days 100
ls runs/$ID/events/population/deaths/
fmg-lab run rm $ID --yes
```

が成立する。

---

## 12. リスクと緩和

| リスク | 緩和 |
| :--- | :--- |
| Playwright が遅い | skipRender、同期 day ループ、1 worker 1 ブラウザ常駐（map 再生成しない限り page を使い回す） |
| ブラウザ落ちで run 消失 | N tick ごとに summary snapshot + event flush |
| ログがディスクを埋める | tmpfs + 容量 cap + `rm --older-than` |
| 本番と Lab の挙動差 | 同じ bundle を headless で動かす（L0）；L3 は golden tick 比較テスト |
| 毎 tick 全データ欲しい | 禁止。関心で layer（deaths / moves / ai）を ON/OFF |
| `advanceTime` の年一括と日次の差 | Lab CLI は既定 `--sync-day`；bulk は明示フラグ |

---

## 13. 成功基準

1. CLI または API だけで **1000 Advance Day** を無人実行できる  
2. その run の **日次 deaths ファイル**が残り、cause×state で再集計できる  
3. 連隊の **移動ログ**から「いつ誰がどこへ」を追える  
4. `fmg-lab run rm` で実験データが **一瞬で消える**  
5. （任意）興味 run だけ MariaDB に載せ SQL できる  
6. ブラウザ UI の通常プレイに **ログ無し・テレメトリ null で影響しない**

---

## 14. 推奨アーキテクチャの一文要約

> **一次データは Run フォルダ上の NDJSON（tmpfs 可）。Engine は当面 headless Chromium 内の本物 FMG。Host は TypeScript CLI/API。DB は後付けの分析派生。捨てるデータは DB に入れない。**

これが「SSD を無駄に擦らず」「ノート 2 台のメモリを活かし」「Population / 軍事 / AI の因果をテキストで追う」ための骨格である。

---

## 15. 次の実装着手時のチェックリスト

1. `advanceTime(y, m?, d?)` を `fmg.d.ts` と actions に正式公開  
2. `setSimulationTelemetry` + `recordDeaths` ミラー  
3. `packages/fmg-lab` skeleton: create / tick / rm  
4. Playwright harness + skipRender flag  
5. deaths 日次ファイル writer  
6. Docker compose + tmpfs  
7. （その後）moves / ai.decision / stats / ETL  

本設計の承認後、L0a → L0b の順で PR 分割するのがよい。
