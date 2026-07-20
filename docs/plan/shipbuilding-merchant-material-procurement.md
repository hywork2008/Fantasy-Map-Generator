# Shipbuilding: Merchant-owned 造船所が資材枯渇で恒久停止する

| 項目 | 内容 |
| :--- | :--- |
| Status | Investigated — 対応方針は未合意（着手前）。2026-07-20 に調査完了、ユーザーへの着手可否確認待ち |
| Parent | [shipbuilding-material-consumption.md](shipbuilding-material-consumption.md)（Phase 8 資材消費ゲート） / [shipbuilding.md](shipbuilding.md) |
| Scope | Shipbuilding + Economy 拡張の資材調達ロジック（`owner === "market"` の造船所） |
| Trigger | ユーザー報告: 「Nobility以外の拡張機能がONの状態で4年ほど進めましたがShipyards OverviewのProgressがどこも0のままです。リセットさせて永遠に船が出来ない等の状態に陥っているのでは？」 |

## 1. 症状

Economy + Shipbuilding（+ Characters、Nobility は無効）を有効にしたマップで数年（実測: 1〜4年）進めると、Shipyards Overview の大半の行が `Waiting: Sails ..., Ropes ..., Tar ...`（Wood は潤沢）で進捗停滞したまま動かなくなる。`Progress` は 0%〜20% 程度に散らばり、必ずしも一律 0% ではないが、実質的に完成しない造船所が大多数を占める。

## 2. 調査結果

### 2.1 進捗が「リセット」されているわけではない

`advanceQueueWithMaterials()`（`src/extensions/shipbuilding/generators/shipyardQueue.ts:293-351`）は資材請求が失敗しても `entry.pendingWorkPoints` を破棄せず保持する（`:328-336` のコメントに、かつて 0 にリセットしていたことで「state 所有の造船所が資材到着待ちの間、丸1年 0% 表示になっていた」不具合への対処として明記済み）。したがって本件は「進捗がリセットされ続けている」のではなく、**資材そのものが恒久的に手に入らない造船所が存在する**という別種の問題。

### 2.2 私の直近のパフォーマンス修正が原因ではない（bisection で確認済み）

`git stash` で本セッションの変更（`stepDay` バッチスナップショット化、Trade ルートキャッシュ、market-by-id キャッシュ等）を全て退避し、素の状態で新規マップを生成 → 1年 (365 tick) 進めて再現テストしたところ、**同一の症状**（46行全てが 0%、`Waiting: Sails 0.10, Tar 0.05` 等）が再現した。`git stash pop` で変更を復元済み。既存の事前バグであり、今回の性能改善作業とは無関係。

### 2.3 Nobility の有効/無効とは無関係

造船所の所有権判定 `determineOwner()`:

```ts
// src/extensions/shipbuilding/generators/shipyardQueue.ts:104-111
/**
 * A shipyard is state-run (a naval arsenal) only at a burg significant enough to
 * warrant one — its state's capital or a fortified (citadel) port. Every other
 * shipyard candidate defaults to a commercial/merchant queue funded by local trade.
 */
function determineOwner(burg: Burg): ShipHullOwner {
  return burg.state && (burg.capital || burg.citadel) ? "state" : "market";
}
```

判定は `burg.capital || burg.citadel` のみに依存し、Nobility 拡張の有効/無効やその他の拡張状態を一切参照しない。「Nobility以外ON」という条件自体は症状の直接要因ではなかった。

### 2.4 根本原因: `owner === "market"` の造船所には能動的な資材調達手段が存在しない

`runShipyardTick()` 内の `StrategicProcurement` 需要通知は `owner === "state"` の造船所だけに限定されている:

```ts
// src/extensions/shipbuilding/generators/shipyardQueue.ts:266-267
if (entry.owner === "state" && burg.state && burg.market) {
  notifyStrategicProcurementDemand({ ... });
}
```

- **`owner === "state"`**（首都 or citadel 港のみ。実運用では少数）: Economy 拡張の `StrategicProcurement`（`src/extensions/economy/generators/strategicProcurement.ts`）が他市場からの Caravan 輸入を能動的に手配し、不足資材を補充する。
- **`owner === "market"`**（それ以外の全て。実運用では大多数）: `tryConsumeShipbuildingMaterials()` が参照するのは自市場の在庫のみ（`markets-generator.ts`）。他市場からの能動輸入経路は無い。当該市場が Sails / Ropes / Tar を自前で生産していない、あるいは生産量が消費に追いつかない場合、通常の交易（他 Good の Deal に付随して偶然運ばれてくる分）以外に在庫が回復する手段が存在せず、実質的に無期限で停滞し得る。

これは実装漏れというより、[shipbuilding-material-consumption.md](shipbuilding-material-consumption.md) の非目標（§1「新しい Caravan、資材専用の交易路、輸送予約」）として明示的にスコープ外にされていた設計上のギャップが、実プレイで顕在化したもの。

## 3. 未着手・未合意（次にやること）

対応要否・方針はユーザー未確認。着手する場合の候補案（優先度・採否とも未検討）:

| # | 案 | 概要 | トレードオフ |
| :-- | :-- | :-- | :-- |
| A | Merchant queue にも縮小版 `StrategicProcurement` を適用 | `owner === "market"` にも近隣市場からの少量輸入を許可する | Economy 側の交易網シミュレーションの負荷・Deal 生成量が増える。既存の「state だけが能動調達を持つ」非対称設計を変更することになる |
| B | 造船必要資材（Sails/Ropes/Tar）のレシピ・地場生産量を調整 | Production 側のレシピや biome 産出係数を見直し、市場単体で自給しやすくする | ゲームバランス全体（economy 側の他消費者）に波及する |
| C | 何もしない（意図的なゲームデザインとして許容） | 「大半の港は地元資源で細々と船を造る、拠点港だけが確実に量産できる」という非対称性をそのまま仕様とする | ユーザー体験としては「進捗が事実上止まって見える」ままになる |

いずれも実装は未開始。着手する場合は方針(A/B/C いずれか、または別案)をユーザーと合意した上で、必要なら [shipbuilding-material-consumption.md](shipbuilding-material-consumption.md) 相当の実装計画へ落とし込むところから始める。
