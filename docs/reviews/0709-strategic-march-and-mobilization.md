# 「国が動かない」問題の調査 → Siege行軍ブリッジと徴兵の実装

`docs/reviews/0709-military-passing-capture.md`の「未実装のまま残っている項目」に書かれていた`applyStrategicMarchOrder`と、`docs/plan/strategy.md`（ユーザーが実際のセーブデータ`temp/Dorgisia 2026-07-09-02-38.map`を見て書いた草案）で報告された症状に対応した実装のまとめ。次のセッションが差分の意図を追えるように、変更したファイルと理由を記録する。

## 背景: 何が問題だったか

`docs/plan/strategy.md`で報告された3国の症状を実際のセーブデータ(`temp/map_parts`, `temp/debug/latest.json`)で調査した結果、すべて**同じ1つの欠落**に起因していることが分かった。

- **Madbay → Hes**: Madbayは38,004の兵力を持ち、Hesとの`strategicGoals`にも`targetBurg:109, tension:100, requiredAttackForce:0.81`という事実上無抵抗の目標が存在するのに、何も起きない。
- **Madbay 国内**: かつて自国だった都市(265 Bibizinda/408 Fayard/526 Kilukkzinb)が敵国に占領されたまま。Madbayの連隊はそこから25〜160map unit（隣接セル相当）の位置に立ったまま動かない。
- **Quick → Donan**: Quickは16,925+5,520=22,445の兵力を持ち、Donan(兵力25、`intelligence`の推定も"accurate"で25)への`goal`(`targetBurg:188, tension:100, requiredAttackForce:165.9`)も既に確定しているのに、とどめを刺さない。

原因: `strategic-planner.ts`は`goal.tension`を100まで上げて外交を"Enemy"に切り替えるところまではやるが、**`goal.targetBurg`へ向けて実際に行軍命令を出すコードがどこにも存在しなかった**。`advanceTension()`は「すでに`regimentReinforcementRadius`内にいる連隊」の戦力を集計するだけで、誰かをそこへ送る処理が無い。連隊が動くのは`regimentMovement.ts`の反応層（近くの敵に反応）と国境警備の駐屯プル（防御姿勢）だけで、どちらも「目標都市への攻撃」を意図した動きではなかった。

副次的に見つかったバグ: Madbayの連隊の`goalTargetBurg`が、既に自国が奪還済みの burg (412など) を指したまま放置されていた——目標達成時に`goalTargetBurg`をクリアする処理が`evaluatePlans()`の撤退パスにしか無く、`advanceTension()`の達成パスに無かったため。

また、Hes(人口2.8M・兵力253=0.01%)やDonan(人口764K・兵力25=0%)が徴兵をしない件は別問題: `Military.generate()`（人口ベースの兵数計算）はマップ生成時か手動再生成でしか走らず、毎tick呼ばれる`Military.updateDynamic()`は既存連隊を元の`r.t`上限まで回復させるだけで、人口増加や壊滅後に軍を再拡大する仕組みが一切無かった。

## 今回のセッションで実装したこと

### 1. `applyStrategicMarchOrder` — 実装済み

`src/generators/regimentMovement.ts`に新設。Nobility拡張の`StrategicPlanner.getActiveSiegeTargets()`（後述）が返す「state→確定済みsiege目標burg id」のMapを`advanceAllRegimentMovement`の第5引数として注入する形にした。Generatorモジュールは`tension`や外交の意味論を一切知らないまま、「このburgはこの国の進軍先だ」という単純なデータだけを受け取る。

```ts
function applyStrategicMarchOrder(
  r: MilitaryRegiment,
  segments: FrontierSegment[],
  pack: PackedGraph,
  landRouteGraph: LandRouteGraph,
  activeSiegeTargetBurgs: number[]
): boolean
```

自分が本来担当している国境(`pickPrimaryFrontier`が返す最寄りのフロンティアセグメント)の相手国(`neighborState`)と目標burgの所有国が一致する場合のみ進軍させる——これにより、Hesとの国境を守っている連隊はHesへのsiegeが確定すれば進軍するが、別の国(例: state 7)との国境を守っている連隊はMadbay-Hes戦に巻き込まれて持ち場を離れたりしない。

`advanceAllRegimentMovement`内の優先順位は「反応(`applyReactionMarchOrder`) → 国内奪還(`applyRecaptureMarchOrder`) → **Siege行軍(`applyStrategicMarchOrder`)** → 通常の国境警備(`ensureGarrisonMarchOrder`)」。

### 2. `strategic-planner.ts`の目標選定に「旧自国領優先」を追加 — 実装済み

`generate()`が国境セグメントごとに目標burgを選ぶ際、これまでは単純に「セグメントのアンカーに一番近い敵burg」を選んでいた。このため、Madbayの旧自国領(265/408/526)がアンカーから遠ければ、単に近いだけの別のburgが選ばれ続け、**旧自国領がそもそも目標候補にすら挙がらない**という問題があった。

```ts
const historicallyOwn = candidateTargets.filter(b => b.stateHistory?.includes(attacker.i));
const pool = historicallyOwn.length ? historicallyOwn : candidateTargets;
```

セグメント内に`stateHistory`が自国と一致する候補が1つでもあれば、距離に関わらずそちらを優先する。無ければ従来通り最近傍を選ぶ。

### 3. stale `goalTargetBurg`のクリーンアップ — 実装済み

`advanceTension()`で「目標burgが既に自国のものになっている(goal達成)」と判定して`goal`を捨てる箇所に、該当連隊の`goalTargetBurg`タグもクリアする処理を追加した(`evaluatePlans()`の撤退パスに既にあった処理と対称)。

```ts
if (pack.burgs[goal.targetBurg]?.state === stateId) {
  for (const regiment of state.military || []) {
    if (regiment.goalTargetBurg === goal.targetBurg) regiment.goalTargetBurg = undefined;
  }
  continue;
}
```

### 4. `StrategicPlanner.getActiveSiegeTargets()` — 実装済み

`tension >= 100`（＝`advanceTension()`が既に宣戦布告済みと判定した）の`goal`だけを、state id → burg id配列のMapとして返す新設メソッド。`src/extensions/nobility/index.tsx`のtickフックで`advanceAllRegimentMovement`の呼び出しに渡している。

### 5. 徴兵/動員 `mobilization.ts`（新規ファイル） — 実装済み

`src/extensions/nobility/generators/mobilization.ts`を新設。`currentDay === 1`(年1回)のタイミングで`Mobilization.conscript(pack)`を呼ぶ。

- 平時目標: 人口(`(state.rural + state.urban) * 1000`)の1% (`BASE_MILITARY_RATIO`)。
- 既存の`simulationContext.intelligence`から「宣言済みEnemy国の推定軍事力合計」を求め、それが自国の現有陸軍(`r.a`合計)を上回っていれば「拮抗していない」と判定し、目標を3% (`EXISTENTIAL_MILITARY_RATIO`)まで引き上げる。
- 目標と現有`t`(陸上連隊の合計上限)の差の**半分**を1年ごとに埋める(`ANNUAL_GROWTH_SHARE = 0.5`)——即座に目標値へ飛ぶのではなく緩やかな動員。
- 実際に増やすのは各陸上連隊の`r.t`（上限）のみ。`r.a`（現有兵数）は既存の`Military.updateDynamic()`の回復ロジック(年20%)がそのまま追いつくので、新規ロジックはそこに一切手を触れていない。
- 艦隊(`r.n`)、新兵の質低下、為政者の性格/国体による難易度補正は対象外(`docs/plan/strategy.md`が明示的に「現時点では考慮しない」としている範囲、および性格補正は次フェーズ)。

```ts
export class MobilizationGenerator {
  conscript(pack: PackedGraph): void { /* ... */ }
}
export const Mobilization = new MobilizationGenerator();
```

### 6. ティックフックへの結線 — 実装済み

`src/extensions/nobility/index.tsx`の`registerTimeTickHook`内:

- `currentDay === 1`のブロックに`Mobilization.conscript(api.worldContext.pack)`を追加(`StrategicPlanner.evaluatePlans()`と同じ年次ゲート)。
- `advanceAllRegimentMovement`の第5引数に`StrategicPlanner.getActiveSiegeTargets()`を渡すよう変更。

## 未実装のまま残っている項目

`docs/plan/strategy.md`で挙げられた残りの指針(Phase 3/4として次回以降に着手予定):

- **弱小国の外交的延命**(婚姻・同盟の後押し・属国化を自ら求める): `ruler.marriages`/`diplomacy-modifier.ts`/`vassalage.ts`は既存だが、いずれも生成時の一回きりか受動的な仕組みで、tick駆動で弱小国が自発的に助けを求める経路は無い。
- **圧倒的優位時の国盗り/降伏勧告**: 今回の実装で行軍自体は解決したが、「敵が弱すぎる場合は通常のsiege待ちを待たず即座に併合/属国化を持ちかける」無血開城の分岐は未実装。
- ruler personality(boldness/caution)や宗教国家の国体による徴兵・外交行動の難易度補正。
- 新兵の質(訓練不足による弱さ)、軍事偏重による国民の不満パラメータ。

## 変更ファイル一覧

| ファイル | 変更内容 |
| :--- | :--- |
| `src/generators/regimentMovement.ts` | `applyStrategicMarchOrder`を新設、`advanceAllRegimentMovement`に`activeSiegeTargetsByState`引数を追加して結線 |
| `src/generators/regimentMovement.test.ts` | Siege行軍のテスト3件を追加(自国境界の目標へ進軍/別国境の目標には反応しない/達成済み目標には反応しない) |
| `src/extensions/nobility/generators/strategic-planner.ts` | 目標選定で`stateHistory`優先、`advanceTension()`のstale `goalTargetBurg`クリア、`getActiveSiegeTargets()`を追加 |
| `src/extensions/nobility/generators/strategic-planner.test.ts` | 旧自国領優先1件、stale tagクリア1件、`getActiveSiegeTargets()`2件を追加 |
| `src/extensions/nobility/generators/mobilization.ts` | 新規: 年次徴兵/動員(`Mobilization.conscript`) |
| `src/extensions/nobility/generators/mobilization.test.ts` | 新規: 5テスト |
| `src/extensions/nobility/index.tsx` | ティックフックに`Mobilization.conscript`と`getActiveSiegeTargets()`を結線 |

## 検証

- `npx tsc --noEmit` / `npm run lint`（biome + lint:legacy）/ `npx madge --circular --extensions ts,tsx src/app.ts` — いずれもクリーン。
- `npx vitest run` — 377件パス。既存失敗3件(`battle-resolution.test.ts`・`localSkirmish.test.ts`・`strategic-planner.test.ts`各1件)は`docs/reviews/0709-military-passing-capture.md`の時点から存在する既知の失敗で無関係。
