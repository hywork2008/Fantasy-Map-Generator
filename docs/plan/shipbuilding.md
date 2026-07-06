# Shipbuilding Extension: 造船・大航海時代シミュレーション

本ドキュメントは、海と森に近接する都市を起点とした造船技術の発展、大型船の技術開発、伐採による森林バイオームの変化、および技術発展を脅威と見なす外国からの干渉——という一連の「大航海時代」シミュレーションを、既存の拡張機能エコシステム（Economy / Nobility / Military）にどう割り振るかを定義する設計・相談用資料です。

## 0. 前提となる調査結果

実装に着手する前に、現状のコードベースを確認したところ、以下の事実が判明した。これが本設計全体の前提になる。

* **経時変化シミュレーションの基盤が存在しない**。マップ生成は一発生成のパイプラインであり、「ターン」「年数経過」「tick」に相当する仕組みは一切ない。Economy拡張の `regenerateEconomy()` / `regenerateEconomyForGood()` も、ユーザー編集をトリガーにした**再計算**であって時間経過の**シミュレーション**ではない。
* Nobility拡張の `docs/plan/characters.md` は「今後の展望」として、キャラクターの性格パラメータが将来的に国家間の戦争・外交AIに接続される計画を既に示している。つまり、造船シミュレーションのためだけに時間経過の仕組みを作ると、後で外交・戦争シミュレーションのために作り直す二度手間になる。**時間経過エンジンは造船拡張専用にせず、host層の共有基盤として設計するべき**。
* 港湾都市の概念は既に存在する: `Burg.port`（隣接する水域フィーチャーID, `src/types/models.ts`）と `cells.haven` / `cells.harbor`（`src/generators/burgs-generator.ts`）。海軍ユニットは `military-generator.ts` で `unit.type === "naval"` かつ `haven` を持つ港湾都市からのみ生成されており、`form: "Fleet"` の概念も既にある。ただし艦種・トン数といった「船そのもの」のデータモデルは無く、`MilitaryRegiment` は汎用のユニット数管理のみ。
* Economy拡張には既に `"Wood"` という Good が定義されており、森林バイオーム（5,6,7,8,9,12）から産出する設計（`biomeOutput`）になっている。木材の資源経路自体はゼロから作る必要がない。
* さらに調査したところ、Economy拡張には既に **`"Ships"` という完成品Goodがレシピ付きで実装済み**（`recipes: [{ Wood: 2, Sails: 2, Ropes: 2, Tar: 1 }]`, `multipliers.cultureType.Naval: 2`）。原材料側の `Sails`（`{ Cloth: 1 }`）、`Ropes`、`Tar`、`Iron` も既存Goodとして存在する。つまり「木材を運んで船を造る」という資源変換パイプラインの骨格は、Economy拡張の中に**既に**存在している。ゼロから並行実装するのは重複であり、既存レシピの拡張（船級ティアの追加、時間経過での蓄積化）として設計するべき。
* `year` / `era` というフィールドも既に `src/store/optionsState.ts`（Zustandの `useOptionsState`）に存在する（`year: 100`, `era: "Era"`）。ただしこれは「絶対年表示のためのUI設定値」に過ぎず、`src/generators/states-generator.ts` 内の**固定3回ループ**（`for (let attempt = 0; attempt < 3; attempt++)`）が `yearsAgo` を大雑把な発生年代（80〜100年前 / 50〜70年前 / 10〜30年前）としてヒューリスティックに割り当て、過去の戦争履歴（Blood Feud）を一括生成しているだけで、年単位で進行する本物のシミュレーションではない。「xx eraはどう生成されているか」への回答はこれに当たる。
* 拡張機能（Extension）が受け取る `ExtensionAPI` の `worldContext` / `viewContext` は**読み取り専用**。つまり拡張は `pack.cells.biome` のような核データを直接書き換えられない。森林の伐採・回復のような「バイオーム変化」は、核データの改変ではなく、拡張が自前で保持する派生データ（オーバーレイ）として表現する必要がある。
* **拡張機能同士（Economy ⇔ Shipbuilding ⇔ Nobility）が直接依存し合うパターンは現状存在しない**。AGENTS.mdの規約は「拡張はhostモジュールを直接importしない」を定めているが、拡張間の連携方法については未定義。ここは新しく決める必要がある。

---

## 1. 拡張エコシステムの全体構成

新規に built-in 拡張 **`src/extensions/shipbuilding/`**（Extension ID: `shipbuilding`）を作成し、造船・艦隊技術に関するドメインロジックを集約する。既存拡張は最小限の連携ポイントのみ追加し、内部実装には手を入れない。

| 領域 | 責務の置き場所 | 理由 |
| :--- | :--- | :--- |
| 港湾都市の「造船適性」判定（海＋森近接） | **Shipbuilding拡張**（新規） | 造船拡張固有のドメインロジック。`pack.burgs[].port` と近傍セルの `biome` を読み取るだけの派生計算で、核データは変更しない。 |
| 丸太→船の資源変換そのもの（数量計算） | **Economy拡張が所有**（既存の `"Ships"` Good・レシピを拡張） | 既にEconomyに `Ships: { Wood:2, Sails:2, Ropes:2, Tar:1 }` のレシピが実装済み。並行実装せず、これを時間経過対応・船級ティア対応に拡張する。 |
| 造船の技術ティア・船級ゲーティング・研究進捗 | **Shipbuilding拡張**（新規） | 「どの船級が建造可能か」はEconomyのGoodモデルの範囲外なドメイン知識。既存 `Ships` Goodに `techTier` 相当の乗算係数を適用する形でEconomyの数量計算に介入する。 |
| 森林の減少・回復（バイオーム変化） | **Economy拡張が所有**（`Wood` Goodの`biomeOutput`を時間経過で増減させる） | `Wood`の産出とバイオームの紐付けは既にEconomyの管轄。Shipbuildingが伐採量をイベントで通知し、Economy側が自分の管轄内で産出係数を増減させる方が二重管理を避けられる。`pack.cells.biome` 自体は変更しない（readonly制約）。 |
| 木材(Wood)・鉄(Iron)等の産出・在庫・価格 | **Economy拡張が唯一の所有者、Shipbuildingはイベント経由で消費・産出変化を通知** | 二重管理を避ける。Economyはupstream/master由来で今後ユーザー自身が独自実装へ置き換える予定のため、連携面はイベント経由の薄い契約に留め、Economy内部実装に依存しない。 |
| 艦隊(Fleet)の戦力・艦種反映 | **Military（core generator）が所有、Shipbuildingはイベント経由で技術ボーナスを通知** | `military-generator.ts` は拡張ではなくcoreモジュールのため、直接呼び出しではなくCustomEvent経由の疎結合にする（将来Militaryが拡張化されても壊れない）。 |
| Engineeringスキルによる技術開発補正 | **Nobility拡張が所有するスキル値を、hostの「モディファイア登録」経由でShipbuildingが参照**（実装済み） | 拡張同士の直接importを避けるための新しい共有パターン（§3.2）。`src/services/skillModifierService.ts`。 |
| 経時変化の駆動（年数カウンタ・tick配信） | **host（新規 `src/modules/timeEngine.ts`）が所有** | Shipbuilding専用にせず、将来の外交/戦争シミュレーションにも使い回せる共有基盤にする。既存の `optionsState.year`/`era` を昇格させる形にする（§6参照）。 |
| 外国からの干渉イベント（妨害工作など） | **Shipbuilding拡張内で`console.log`のみのスタブ実装** | 優先度は低い。UIも状態管理も持たず、tickフック内で確率判定して裏でログを流すだけで良い。 |

---

## 2. Host層への最小追加: 時間経過エンジン

`src/modules/timeEngine.ts`（Generatorレイヤー）を新設する。

* 年数カウンタは**ゼロから作らない**。既に `src/store/optionsState.ts` に `year`/`era` が存在するため、`advanceTime()` はこの既存フィールドをインクリメントする形にする（ただし現状は「UIオプション」として置かれており、実体は経時シミュレーション状態である。この置き場所自体が適切かは §6 で再検討する）。
* `advanceTime(deltaYears: number)` を実装し、以下を順に行う:
  1. `year` を更新する（現在は `optionsState`、§6の結論次第で移設先が変わる）。
  2. 登録済みの tick フックを実行する。
  3. `fmg:time-advanced` CustomEvent（`detail: { deltaYears, currentYear }`）を dispatch する。
* `ExtensionAPI` に `registerTimeTickHook(fn: (deltaYears: number) => void): () => void` を追加し、`registerDrawLayerHook` と同様のパターンで拡張が自分のシミュレーションステップをフックできるようにする。
* `window.fmg.actions.advanceTime(years)` を追加。UIは「時間を進める」ツールボタン（既存の regenerate 系ボタンと同じ配置パターン）から呼び出す、ユーザートリガー式のステップシミュレーションとする（リアルタイムのゲームループは作らない）。

この基盤は本ドキュメントのShipbuilding拡張だけでなく、`characters.md` が予告する将来の国家間戦争AIのtick駆動にもそのまま使える。

---

## 3. 拡張間連携: 新しい共有パターン

現状「拡張が別の拡張に依存する」パターンが存在しないため、以下の2つの疎結合な連携方法を新設する。

### 3.1 イベント経由（Economy ⇔ Shipbuilding, Military ⇔ Shipbuilding）（実装済み）
`document.dispatchEvent(new CustomEvent(...))` を使う。実装した実際のイベント:
* `fmg:shipbuilding-log-harvested`（Phase 2） — `{ cellId, burgId, amount, deltaYears }`。Shipbuildingが伐採進行をEconomyへ通知し、`economy/generators/forestDepletion.ts` がそのセルのWood産出係数を減衰させる。
* `fmg:shipbuilding-ship-completed`（Phase 3/4） — `{ burgId, stateId, owner, shipClassId }`。`owner === "state"` の完成を、core側の `src/generators/navalTechBonus.ts` が購読し、艦隊(`fleet`)ユニットの国家別補正係数に反映する（`military-generator.ts` への1行差し込み）。Military側は当初案の `applyNavalTechBonus(stateId, bonus)` のような公開関数ではなく、Shipbuildingを一切importしない自己完結型のイベントリスナーとして実装した（コアが拡張の存在を意識しない、という原則をより厳密に守れるため）。

### 3.2 モディファイア登録経由（Nobility ⇔ Shipbuilding）（Phase 5で実装済み）
`tooltipExtensions` と同様のパターンで、`src/services/skillModifierService.ts`（host、新規） + `ExtensionAPI` に**汎用のモディファイア・チェーン**を実装した:
```typescript
registerSkillModifier(source: string, fn: (characterId: number, skill: string, currentValue: number) => number): () => void
getEffectiveSkill(characterId: number, skill: string): number
```
当初案の「`keyof CharacterSkills`」ではなく `skill: string` にした（Shipbuilding側が`CharacterSkills`型をimportしなくて済むように）。`getEffectiveSkill`は登録順にモディファイアを`0`からチェーン適用し、何も登録されていなければ`0`を返す（＝「データなし」であって「スキル0」ではない、という意味で呼び出し側が扱う）。Nobility拡張は自身の`init()`で1つだけモディファイアを登録し、`pack.characters`から該当キャラクターの`skills[skill]`を返す。Shipbuildingは`state.rulerId`（Nobility側の型拡張で`State`に生えるdenormalizedフィールド、コアの型としては常に存在）を経由して`getEffectiveSkill(rulerId, "engineering")`を読み、`shipyardQueue.ts`の国家技術ポイント蓄積速度に`1 + engineering/100`の乗算係数として適用する。Nobility無効時や為政者未設定時は`1`（無補正）にフォールバックする。

---

## 4. Shipbuilding拡張の内部モデル（概要）

* **造船適性都市の判定**: `port` を持つ burg のうち、隣接セル（半径N）に森林バイオーム(5,6,7,8,9,12)が一定割合以上存在するものを「Shipyard候補」として抽出する純粋な導出データ。拡張内キャッシュに保持し、`fmg:generate-post-core` 時に再計算する（Economy拡張の既存パターンを踏襲）。
* **伐採→丸太→造船のパイプライン**: 実際の資源変換（Wood/Sails/Ropes/Tar → Ships の数量計算）はEconomy拡張の既存レシピに委譲する。Shipbuildingは `registerTimeTickHook` 内で、Shipyard候補都市の伐採進行を `fmg:shipbuilding-log-harvested` イベントでEconomyへ通知し、Economyは自身の `Wood` Goodの産出係数を増減させる。Shipbuildingは船級ティアに応じた乗算係数（`techTier` multiplier）だけを `Ships` Goodの計算に適用する。
* **技術ツリー（Phase 3で実装済み）**: `shipClasses.ts` に Sloop → Caravel → Galleon の3ティアを定義（`techPointsRequired`, `buildPointsRequired`）。研究ポイントは**国家（State）単位**で蓄積し（`shipyardQueue.ts` の `_stateTechPoints`、その国が持つ造船適性都市の数に比例して加算）、その国に属す都市の建造キューはこのティアに従う。無所属（stateless/自由都市）の都市はティア0（Sloop）に固定。研究ポイント蓄積速度は、その国の為政者(ruler)のEngineeringスキルにより`1 + engineering/100`倍される（Phase 5で実装済み）。**大砲は前提にしない**: 世界観として銃火器は標準ルール外（弓矢・白兵戦が基本）であるため、船級ティアは「積載量・航洋性・乗員数」を軸にした輸送・遠洋航行寄りの木で設計し、`Gunpowder`/`Artillery` Good（既存）を用いた本格的な戦列艦（Ship of the Line）ルートは、オプション機能として別ゲート（`options`フラグ）の裏に隠す。
* **建造キューと所有者（Phase 3で実装済み）**: 造船適性都市1つにつき単一のキュー（`ShipyardQueueEntry { shipClassId, owner, progress }`）を持つ。所有者は都市の属性から毎tick自動判定する: 国家に属し、かつ首都(`capital`)または城塞(`citadel`)を持つ都市は `"state"`（国家/海軍の艦隊）、それ以外は `"market"`（商家の商船）。両者とも同じ国家技術ツリーからティアを引く（商家だけ技術的に劣る、という制約は設けていない）。完成した船体は `getCompletedHulls(owner, ownerId, shipClassId)` でカウントを保持し（国家所有は `stateId` 単位、商家所有は `burgId` 単位）、完成時に `fmg:shipbuilding-ship-completed` イベントも発火する。**Economyの`Ships`Goodへは接続しない**: `Ships` は交易品としての汎用ボートを表す既存の需要駆動クラフト良品であり、ここでいう「特定ティアの船体を1隻建造した」という出来事とは概念が異なるため、混同を避けて意図的に分離した。
* **Military連携（Phase 4で実装済み）**: `src/generators/navalTechBonus.ts`（core、Shipbuildingを一切importしない）が `fmg:shipbuilding-ship-completed` イベントを購読し、`owner === "state"` の完成のみを対象に国家単位のボーナス係数（`1 + 0.1 * 完成数`、上限3倍）を蓄積する。`military-generator.ts` は艦隊(`fleet`)ユニットの状態別補正係数 `s.temp["fleet"]` にこの係数を掛けるだけの1行差し込みで、Shipbuildingが無効/未導入でもボーナスは常に1（無効果）。**このボーナスは`Military.generate()`が次に実行されたときに反映される**（Economy PhaseのようなmicrotaskベースのAuto-refreshは行わない。理由: `Military.generate()`はGenerationPipeline経由の重い処理で、それを呼ぶには`navalTechBonus.ts`が`generationPipeline.ts`に依存する必要があり、`military-generator.ts → navalTechBonus.ts → generationPipeline.ts → military-generator.ts`の循環依存を招くため）。新規マップ生成時（`fmg:generate-post-core`）にボーナスは自動リセットされる。ブラウザE2Eで、国家所有の造船完成後に手動でMilitary再生成を行うと艦隊戦力が実際に増加することを確認済み。
* **資材消費（未実装）**: 建造の進行自体は現状、素材(Wood/Sails/Ropes/Tar)在庫の十分性をチェックしない。伐採(Phase 2)による木材枯渇とは独立して進む。実際の資材消費ゲートは今後の拡張候補。
* **森林の回復（Phase 6で実装済み）**: `economy/generators/forestDepletion.ts` の `tickForestRegrowth(deltaYears)` が、`api.registerTimeTickHook` 経由で `advanceTime()` のたびに全ての伐採済みセルの depletion係数を線形に回復させる（年2%、MAX_DEPLETION=0.9からの完全回復に約45年）。**Shipbuilding拡張が無効化されていても回復は止まらない**（`isExtensionEnabled("economy")` のみをチェックし、Shipbuildingの状態は見ない）——伐採が止まった森は主体が居なくなっても回復し続ける、という意図的な設計。Production再計算は既存のmicrotaskベースの `scheduleProductionRefresh()` を再利用し、伐採イベントと回復ティックのどちらが先に走っても1回の `advanceTime()` 呼び出しにつき`Production.produce()`は高々1回にまとめられる。
* **外国からの干渉**: 優先度低のスタブ実装。tick毎に簡易な確率判定を行い、該当すれば `console.log()` でフレーバーメッセージ（例: "Foreign agents sabotage the shipyard at X"）を出すだけに留める。状態管理・UI・イベント配信は一切持たない。判定ロジックは1関数（例: `checkForeignInterference()`）に隔離し、将来の外交/戦争シミュレーションが実装された時点で丸ごと差し替えられるようにする。

---

## 5. 実装フェーズ案

1. **Phase 0**（実装済み）: host時間経過エンジン（`timeEngine.ts` + `registerTimeTickHook` + `advanceTime` アクション、`SimulationContext`新設）。
2. **Phase 1**（実装済み）: Shipbuilding拡張の骨格。Shipyard候補都市の判定（海洋feature限定、`cells.haven`直接判定）とレイヤー表示。
3. **Phase 2**（実装済み）: 伐採→`fmg:shipbuilding-log-harvested`イベント→Economyの`Wood`Good産出係数を減衰。
4. **Phase 3**（実装済み）: 造船キュー（国家/商家の単一キュー・自動所有者判定）・技術ツリー（国家単位）・tickフック接続。
5. **Phase 4**（実装済み）: `navalTechBonus.ts`経由のMilitary艦隊強化連携。
6. **Phase 5**（実装済み）: `skillModifierService.ts`新設 + Nobility Engineeringスキルのモディファイア連携。
7. **Phase 6**（実装済み）: Economy拡張側での森林回復（`tickForestRegrowth`）。
8. **Phase 7**: 外国干渉イベント（`console.log`スタブ）。

---

## 6. 検討結果・残る論点

以下、ユーザーからのフィードバックを反映した合意事項と、残る論点を整理する。

### 6.1 合意事項

* **独立拡張として進める**。ただし完全に別物として並行実装するのではなく、Economy拡張が既に持つ `Wood`/`Iron`/`Sails`/`Ropes`/`Tar`/`Ships` Goodとそのレシピを土台として活用する（§0, §1参照）。Economy拡張は現状upstream/master由来の初期実装であり、ユーザーが今後自前実装に置き換える予定であるため、Shipbuilding側からの依存はCustomEventベースの薄い契約に限定し、Economy内部のリライトに巻き込まれない設計にする。
* **拡張間連携の主役はEconomy**。造船（数量計算）も森林回復（産出係数の増減）も、Wood/Ships Goodを既に所有しているEconomy拡張側の管轄とし、Shipbuildingは「技術ティア」「造船適性判定」「艦隊・為政者との連携」という上位レイヤーの意思決定に専念する（§1テーブル、§4を更新済み）。
* **外国からの干渉は最小実装でよい**。データモデルもUIも持たず、tickフック内の確率判定＋`console.log()`のスタブに留める（§4, §5 Phase 7を更新済み）。

### 6.2 決定: Context分割の再設計（SimulationContext新設）

`year`/`era` は現在 `src/store/optionsState.ts`（本来はUIオプション用のZustandストア）に間借りしている。これは地図の描画要素でもなく（`ViewContext`ではない）、生成された世界の静的データでもない（`WorldContext`の想定範囲外）——本質的には「経時シミュレーションの進行状態」である。

Danger レイヤーや拡張機構の実装で既に破壊的変更を許容してきた実績があるため、後方互換性を理由に据え置く必要はないと判断し、以下で合意した:

* 新規 `SimulationContext`（`src/context/simulationContext.ts`）を新設し、`year`・`era`・`timeEngine.ts` が管理する将来のtick駆動状態をここに集約する。
* `optionsState` からは `year`/`era` を削除し、`SimulationContext` へ移設する（`DiplomacyHistoryDialog.tsx` など既存の参照箇所は移設に合わせて更新する）。
* `AGENTS.md` の Core Architecture 節（State Layerの定義: `WorldContext` / `ViewContext` / `AppServices`）に **`SimulationContext` を第4のカテゴリとして追加**する。これはPhase 0（host時間経過エンジン）の実装に着手するタイミングで、コード変更とあわせて行う。
