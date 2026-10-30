# 校正用の平和モード（2026-10-30）

関連: [記録（市場の金庫の出入り）](../analytics/market-treasury-flows-20261030.md)§4。

## 1. 背景

固定入力のWorld（`docs/analytics/inputs/wet-pastoral-birth-20261029/world-102.fmg`）は、`conflictAutonomy`が`playerDirected`で、実際の戦闘は起きない。しかし地図の生成で作られた敵対（`"Enemy"`）の関係が16組あり、経済側の`stateHasEnemy`がこれを戦時とみなすため、29か国のうち20か国が戦時体制（`warFooting`）に入っていた。`conflictAutonomy`と`warFrequency`では止められない。経済の校正の計測が戦時経済の影響を受けないように、戦争が起こらず、戦時経済にも入らないモードを加える。

## 2. 仕様

`conflictAutonomy`に3つめの値`"peace"`（UIでは「平和（校正用）」）を加える。地図に保存され、`autonomous`・`playerDirected`と同じ経路で読み込み・保存・書き出しされる。

- 戦争は始まらず、進まない。`mayAdvanceAutonomousConflict`・`mayAdvanceConflict`・`mayAdvanceAnyConflict`は常に偽で、歴史モードの強制より優先する。プレイヤーの宣戦（`startPlayerConflict`）は`reason: "peace"`で断る。保存済みのプレイヤーの承認は消さないが、効かない。
- どの国も戦時とみなさない。`isStateInActiveConflict`・`stateHasEnemy`・技術の進み方の`atWar`・開拓の`isAtWar`・造船所の`isStateAtWar`・動員の敵の兵力・アンデッドの蘇りは、敵対の関係があっても戦時でないものとして扱う。
- 戦時体制に入らない。`isWarFootingActive`は偽、AIは戦時体制を選ばず、`syncWarFootingFromDiplomacy`はプレイヤーの固定も含めて解除する。
- 外交関係（`"Enemy"`を含む）は書き換えない。モードを戻すと元の扱いに戻る。
- 複数日の時間進行では、`playerDirected`と同じく連隊の移動を省く。

計測用のスクリプト（`auditWetRegionPopulationGrowth.mts`・`auditUrbanMoneyFlows.mts`・`auditMarketSaltPrice.mts`・`auditSaltworksOutput.mts`・`auditMarketTreasuryFlows.mts`）は、環境変数`FMG_CONFLICT_AUTONOMY=peace`で、読み込んだ地図の設定を上書きできる（`scripts/lib/conflictAutonomyFromEnv.mts`）。

## 3. 確認（2026-10-30）

- 単体テスト: 正規化（`conflictAutonomy.test.ts`）、戦争の判定（`activeConflict.test.ts`）、戦争の開始・進行（`conflictDirector.test.ts`）、戦時体制と`stateHasEnemy`（`warFooting.test.ts`）。
- 固定入力で`FMG_CONFLICT_AUTONOMY=peace`の12か月: 読み込み直後に保存されていた戦時体制の印は、最初の月の精算で20か国とも外れ、6か月・12か月とも戦時体制の国は0。戦略目標・承認は0、連隊の数は187のまま。

## 4. 未確定事項

- 塩・市場の金庫などのこれまでの計測を、平和モードで測り直す（[salt-supply-calibration.md](salt-supply-calibration.md)）。
