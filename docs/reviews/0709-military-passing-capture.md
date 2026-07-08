# 軍隊の行軍バグ調査 → 通過制圧・飛び地奪還の実装

`docs/debug/0708-military-routes.md`（軍団の移動がリセットされる不具合の調査）の続きとして、同じセッション内で調査・実装した内容のまとめ。次のセッションが差分の意図を追えるように、変更したファイルと理由を記録する。

## 背景: 何が問題だったか

`docs/debug/0708-military-routes.md`で判明した2つの問題:

1. **`edgeProgress`が毎ターンリセットされる**: `ensureGarrisonMarchOrder`（`src/generators/regimentMovement.ts`）は毎ティック、脅威重みから導いた牽引点(`pulledX/pulledY`)に最も近い自国セルを再計算する。このセルがわずかな重みの揺らぎで隣のセルへフリップすると、`planLandMarchOrder`がフルリプランを行い`edgeProgress`が0に戻る——「少し進む→目的地再計算→セル中央に巻き戻る」のループに陥っていた。
2. **`strategicGoals`（Siege目標）が移動ロジックに一切反映されない**: `strategic-planner.ts`はSiege目標(`targetBurg`)を作成するが、`regimentMovement.ts`はそれを読まず「自国境界の防衛(Garrison)」しかしない。結果、UI上でSiege目標が確定していても連隊は自発的に向かわない。

その後、ユーザーが実際にデバッグデータ(`temp/debug`)を見て指摘した3点目の観察:

3. **6万規模の騎馬隊が、敵軍のいない広大な敵地を、防衛柵の無い街を素通りしながら進軍しても何も起きない**——住民が実質無防備な街ですら占領されず、行軍中の"現地調達（食料・水の徴発）"という自然なイメージに対応するデータ処理が存在しなかった。

## 今回のセッションで実装したこと

### 1. `edgeProgress`リセット対策（ヒステリシス） — 実装済み

`src/generators/regimentMovement.ts`の`ensureGarrisonMarchOrder`に、目的地選定の不感帯を追加。

```ts
const GARRISON_DESTINATION_STABILITY_RADIUS = 60;
```

牽引点(`pulledX/pulledY`)が既存の`destinationCell`から半径60map-unit以内にとどまる限り、目的地の再計算・再プランをスキップする。これにより、脅威重みのわずかな揺らぎで最寄りセルが隣のセルへ毎ティック飛び移り、`edgeProgress`がリセットされ続ける問題を抑える。

### 2. 飛び地の自動奪還 — 実装済み

**問題の核心**: `ensureGarrisonMarchOrder`の目的地候補は`landCellsByStateAndLandmass`（=`cells.state[i] === 自国`のセルのみ）に限定されていた。敵に一度奪われた自国内の飛び地は`cells.state`が敵国のものになるため、国境パトロールの目的地候補から永久に除外される——**「敵が去った後も、自国が二度とそこへパトロールを送らない」** という状態が起きていた（ユーザーの仮説どおり）。

`reclaimableEnemyCells()`（`src/generators/regimentMovement.ts`）を新設し、目的地候補に「かつて自国が所有していたことが`Burg.stateHistory`からわかる、現在は主要フロンティア対象国が持つ、同じ陸塊上の街」を追加した。

```ts
function reclaimableEnemyCells(pack, ownState, neighborState, landmass): number[]
```

これにより、通常の国境防衛パトロールが（脅威に引かれる先として）自然に飛び地の中へ踏み込むようになる。無防備であれば下記4番の`tryCaptureOnPassing`がその場で奪還する。**歴史的に一度も自国のものだったことがない敵の本土には踏み込まない**（`stateHistory`に自国IDが無い限り候補に入らない）よう歯止めをかけている。

### 3. `onCellEntered`フック — 実装済み

`advanceAlongPath`/`advanceAllRegimentMovement`（`src/generators/regimentMovement.ts`）に、経路上で新しいセルに進入するたびに呼ばれる任意コールバックを追加した。

```ts
export function advanceAlongPath(
  pack: PackedGraph,
  r: MilitaryRegiment,
  budget: number,
  onCellEntered?: (r: MilitaryRegiment, cell: number) => void
): void
```

1ティックで複数セル（複数の街）を跨ぐ大きな`deltaYears`でも、通過した全セルで一度ずつ発火する。コアのGeneratorモジュール（`src/generators/`）は国家/外交/占領といったビジネスルールを一切知らず、単にフックを提供するだけ——実際の判断はNobility拡張側（4番）に委譲する設計（AGENTS.mdの「Bridge Decoupling Pattern」に準拠）。

### 4. `Burg.stateHistory` — 実装済み

`src/types/models.ts`の`Burg`に追加:

```ts
stateHistory?: number[];
```

その街を所有したすべての国家を古い順に記録する配列（現在の所有者=`state`が末尾）。マップ生成時に`states-generator.ts`で`b.stateHistory = [b.state]`として初期化。

占領処理を一箇所に集約するため、`captureBurg`/`canOccupyBurg`/`OCCUPATION_FORCE_RATIO`を`localSkirmish.ts`から`src/extensions/nobility/generators/localDefense.ts`に移動し、`captureBurg`が`stateHistory`への追記も一緒に行うようにした。以下の3つの占領経路すべてがこの共通関数を通るようにリファクタ済み:

- 正式なSiege解決（`battle-resolution.ts`の`resolveSiege`——旧: state代入とセル書き換えをインライン実装していたのを`captureBurg()`呼び出しに置換）
- 背景スカーミッシュでの街占領（`localSkirmish.ts`）
- 新設の通過制圧（`marchCapture.ts`、次項）

どの経路で奪われても`stateHistory`の記録漏れが起きない。

### 5. 通過制圧 `marchCapture.ts`（新規ファイル） — 実装済み

`src/extensions/nobility/generators/marchCapture.ts`を新設。`onCellEntered`フックから呼ばれる`tryCaptureOnPassing(r, cell)`が本体。

- **戦力比 0.2** (`PASSING_CAPTURE_RATIO`): 通過中の街の防衛力(`estimateLocalDefendingForce`——人口5%の民兵+近隣の味方連隊)に対し、通過軍がその0.2倍の戦力さえあれば占領できる。正式Siegeの`FIELD_ATTACK_RATIO`(1.3)より大幅に低い——行軍シーズンの村は働き盛りの男手が少なく、民兵と正規軍を1:1で計算する必要はない、というユーザーの整理を反映。
- **城壁/城塞は例外**: `burg.citadel || burg.walls`があれば戦力比に関わらず占領は成立しない。落とすには従来どおり正式なSiege(`battle-resolution.ts`)が必要。
- **人口の微減 + Wealth/Treasury の激減**: 通過軍の戦力を`population × 2`で割った値を0〜1にクランプした`raidSeverity`を使い、最大で人口5%減・`treasury`/`product`を70%減。**占領の成否に関わらず**適用される（城壁のある街でも周辺の食料調達で多少は疲弊する、という想定）。`product`を落とすのはEconomy拡張の`Wealth`列(`product / population`)が間接的に下がるようにするため——Nobility拡張はEconomy拡張のコードには一切依存せず、共有の`Burg`フィールドを直接読み書きするだけ(既存の疎結合を維持)。
- 敵国(`diplomacy === "Enemy"`)以外の街には一切手を出さない。艦隊(`r.n`)は陸の街を「通過」する概念がないため対象外。
- 占領が成立すると`captureBurg()`(4番)経由で所有権と`stateHistory`を更新し、Chronicleに"living off the land"風のログを1件追加する。

### 6. ティックフックへの結線 — 実装済み

`src/extensions/nobility/index.tsx`の`registerTimeTickHook`内で、`advanceAllRegimentMovement`の第4引数に`tryCaptureOnPassing`を渡すクロージャを追加。占領が発生した場合は`marchCaptureOccurred`フラグを立て、States/Bordersレイヤーの再描画をトリガーする（既存の`bordersChanged`判定はSiege/Skirmish発生時のみを見ていたため、そのままでは通過制圧による所有権変化が描画に反映されなかった）。

## 未実装のまま残っている項目

- **`applyStrategicMarchOrder`**（Siege目標`strategicGoals`へ実際に進軍させるロジック）は前回の会話で設計案のみ提示し、ユーザーが通過制圧の要望を先に出したため、このセッションでは実装していない。したがって現時点でも、`strategic-planner.ts`が確定したSiege目標へ連隊が自発的に進軍することはない——遭遇するのは今回実装した「国境防衛パトロール」および「飛び地奪還」の副産物としての接触のみ。次にこの領域に着手する場合は、前回提示した優先順位（`applyReactionMarchOrder` > `applyStrategicMarchOrder` > `ensureGarrisonMarchOrder`）の設計をそのまま使える。

## 変更ファイル一覧

| ファイル | 変更内容 |
| :--- | :--- |
| `src/types/models.ts` | `Burg.stateHistory?: number[]`を追加 |
| `src/generators/states-generator.ts` | 生成時に`stateHistory`を`[state]`で初期化 |
| `src/generators/regimentMovement.ts` | ヒステリシス(`GARRISON_DESTINATION_STABILITY_RADIUS`)、飛び地奪還候補(`reclaimableEnemyCells`)、`onCellEntered`フックを追加 |
| `src/generators/regimentMovement.test.ts` | 飛び地奪還2件・`onCellEntered`発火1件のテストを追加 |
| `src/extensions/nobility/generators/localDefense.ts` | `captureBurg`/`canOccupyBurg`/`OCCUPATION_FORCE_RATIO`を集約（`stateHistory`追記込み） |
| `src/extensions/nobility/generators/localSkirmish.ts` | ローカル定義を削除し`localDefense.ts`からimport |
| `src/extensions/nobility/generators/battle-resolution.ts` | インラインの占領処理を共通`captureBurg()`呼び出しに置換 |
| `src/extensions/nobility/generators/marchCapture.ts` | 新規: `tryCaptureOnPassing`（戦力比0.2、城壁ゲート、人口/Wealth/Treasuryの被害、占領+ログ） |
| `src/extensions/nobility/generators/marchCapture.test.ts` | 新規: 6テスト |
| `src/extensions/nobility/index.tsx` | ティックフックに`tryCaptureOnPassing`を結線、占領発生時のStates/Borders再描画を追加 |

## 検証

- `npx tsc --noEmit` / `npm run lint`（biome + lint:legacy）/ `npx madge --circular --extensions ts,tsx src/app.ts` — いずれもクリーン。
- `npx vitest run` — 変更・新規分はすべてグリーン。既存失敗3件(`battle-resolution.test.ts`・`localSkirmish.test.ts`・`strategic-planner.test.ts`各1件)は`git stash`で確認済みの、変更前から存在する既知の失敗で無関係。
- `npm run build` — 成功。
