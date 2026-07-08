# 海軍の航路拘束と沿岸戦線の再設計

前回の調査（チャット上の相談、`docs/debug/military.md` 末尾の報告に対応）で判明した「艦隊(Fleet)が海を挟んだ都市を無抵抗で落とし続け、しかも一度落ちた沿岸都市を元の所有国が二度と奪還できない」問題への対応方針。ユーザーからの追加要件は明確で、**海軍の移動・到達判定は既存の海洋 Routes（`pack.routes` の `group: "searoutes"`）を辿ることに拘束すべき**、というもの。羅針盤や海図が未発達な時代設定である以上、既存航路を外れた直線移動は座礁・遭難のリスクを伴い、ゲームロジック上も「安全に到達できる」とみなすべきではない、という判断。

---

## 0. 前提となる調査結果

### 0.1 今回直した3つのバグ（再掲）

チャットでの調査で判明した根本原因は次の3点。詳細は本ドキュメント内で対応箇所ごとに再度触れる。

1. **`localSkirmish.ts`** — `LocalSkirmish.resolve()` は敵対国同士の連隊が直線距離150以内なら、陸続きかどうかを問わず戦力比3倍で即座に相手を殲滅・都市を陥落させる（`SKIRMISH_CONTACT_RADIUS = 150`、`ANNIHILATION_RATIO = 3`）。艦隊はプールされた国全体の海軍力（最大2500人×`populationRate`）を持つ一方、都市駐屯兵は人口の5%（`cityGarrison`）しかなく、正式な宣戦布告（`StrategicGoal`のtension蓄積）を経ずに沿岸を落とし続けられる。
2. **`frontierAnalysis.ts`** — `analyzeFrontiers()` は `cells.c[i]`（陸続きの隣接セル）だけを見て国境セグメントを作る。海を挟んだ相手とは国境セグメントが一切生成されないため、`military-generator.ts` の `redistributeGarrisons()` は陸軍をそちらへ引き寄せず、`strategic-planner.ts` の `generate()` もその方角への `StrategicGoal`（奪還計画を含む）を生成しない。「近くにいるのに防衛できない」「奪還できない」の直接原因。
3. **`battle-resolution.ts` / `strategic-planner.ts`** — 攻撃側戦力の集計は `regimentLandmass === targetLandmass || dist < 300` で艦隊の到達を判定している。`cells.f`（feature id）は陸塊だけでなく海洋・湖も含む識別子のため、水上にいる艦隊は`regimentLandmass`が土地と一致することはなく、実質的に直線距離300ユニットのみが判定基準になっている。

これらは「艦隊の移動・到達判定が航路と無関係な直線距離ベースになっている」という一点に共通する。本ドキュメントはこれを解消する設計。

### 0.2 既存の Routes データ構造

`src/generators/routes-generator.ts` の `RoutesGenerator.generate()` が `pack.routes: Route[]` と `pack.cells.routes: Record<number, Record<number, number>>`（セルペア→routeId のグラフ）を構築する。

- `generateSeaRoutes()`（routes-generator.ts:553-584）: 同じ水域feature（`portsByFeature`）に属する港湾都市(`Burg.port`)同士を Urquhart グラフで結び、`findPathSegments({ isWater: true, ... })` で陸地を避けた水上セル経路を Dijkstra（`findPath`, `src/utils/pathUtils.ts:328`）で求める。気温が低すぎる海（`MIN_PASSABLE_SEA_TEMP = -4`）や、沿岸からの距離帯（`cells.t`: -1沿岸〜-4遠洋、`ROUTE_TYPE_MODIFIERS`）でコストが変わり、航行しにくい海域ほどルートが通りにくい。
- 経路の始点・終点は **港湾都市自身の陸地セル**（`featurePorts[fromId].cell`）であり、水上のセルはその間だけ通過する。つまり `pack.cells.routes` のグラフ上のノードには港のいる陸地セルIDがそのまま乗っている。
- `pack.cells.routes[cellId][nextCellId] = routeId` で隣接関係が引ける。`routeId` から `pack.routes[routeId].group` を見れば `"searoutes"` かどうか判別できる。

### 0.3 艦隊(Fleet)の座標とルートグラフの対応

`military-generator.ts` の艦隊生成（585-638行、および 330-435行のプラトーン生成）では、海軍プラトーンは `cells.haven[i]`（隣接する水セル）の座標を `x, y` として持つが、**`cell` フィールドは港側の陸地セルのまま**（`anchor = { cell: anchorPlatoon.cell, x: anchorPlatoon.x, y: anchorPlatoon.y }`、633行)。つまり艦隊連隊(`MilitaryRegiment`)の `.cell` は常に母港の陸地セルであり、これは 0.2 で述べたルートグラフのノードと直接一致する。**到達判定には `regiment.x/y`（水上の見た目座標）ではなく `regiment.cell`（母港セル）を使えば、既存のルートグラフにそのまま乗せられる。**

---

## 1. 設計方針

**「陸塊をまたぐ／どちらかが艦隊(`regiment.n === true`)である到達判定は、すべて `pack.cells.routes` の `searoutes` グループを辿った経路距離に置き換える。経路が存在しなければ到達不可（＝遠征不可能）とする。」**

これを1箇所の共有ヘルパーとして実装し、既存の4箇所（`localSkirmish.ts` の接触判定、`battle-resolution.ts` の攻撃側集計・援軍到着判定、`strategic-planner.ts` の現地戦力集計、`military-generator.ts` の `redistributeGarrisons`）から呼び出す形にする。`docs/plan/military-organization-and-vassalage.md` で `localDefense.ts` に距離・戦力計算を集約した前例と同じパターン。

陸続きの通常の陸軍同士の到達判定（既に `localDefense.ts` の `regimentReinforcementRadius` 等でカバー済み）は対象外・変更しない。

### 1.1 新規共有モジュール: `seaRouteGraph.ts`

置き場所は Nobility 拡張固有ではなく、`military-generator.ts`（core）からも将来使う可能性があるため `src/generators/seaRouteGraph.ts` とする。

```ts
export interface SeaRouteGraph {
  /** cellId (港セル) -> 隣接cellId -> 経路距離(直線距離の合計、ユニット) */
  readonly adjacency: Map<number, Map<number, number>>;
}

export function buildSeaRouteGraph(pack: PackedGraph): SeaRouteGraph;

/** start/end はどちらも港の陸地セルID(regiment.cell)を渡す想定。到達不可なら null。 */
export function findSeaRouteDistance(graph: SeaRouteGraph, start: number, end: number): number | null;
```

- `buildSeaRouteGraph` は `pack.routes.filter(r => r.group === "searoutes")` から隣接グラフを1回だけ構築する（`pack.cells.routes` を使ってもよいが、group判定のため searoutes だけを別グラフとして持つ方がシンプル）。エッジの重みは `points` 配列から求める実距離（Euclidean の累積）。
- `findSeaRouteDistance` はダイクストラ（`FlatQueue` を使う `findPath` と同系の実装、もしくは単純な優先度キュー）。
- **キャッシュと無効化**: `RoutesGenerator.generate()` が呼ばれるたび（マップ生成時、および将来 Routes 再計算時）にグラフは作り直す必要がある。呼び出し側（Nobility拡張の tick hook）で毎回 `buildSeaRouteGraph(pack)` を呼ぶ設計にし、早すぎる最適化はしない。1マップあたりの港湾都市数は限定的（`docs/plan/military-organization-and-vassalage.md` の連隊集約と同様、既に艦隊は水域feature単位で1〜数個に集約されている）ため、tickごとの再構築コストは許容範囲と見込む。実測して重ければ「Routes未変更ならキャッシュ再利用」の最適化を追加する。

### 1.2 母港セルが無い/港を持たない連隊の扱い

艦隊は常に `regiment.cell` が母港セル（0.3参照）なので問題にならない。一方、**攻撃対象の都市が港でない場合**（`Burg.port` が未設定）、その都市の陸地セルはルートグラフのノードとして存在しない。この場合は「対象都市に最も近い、到達可能な自国/敵国の港」までの経路距離＋その港から対象都市までの直線距離（上陸後の短距離行軍とみなす）を合算する形にする。度を超えた行軍にならないよう、上陸後の直線距離には既存の `regimentReinforcementRadius`（100〜300ユニット）と同程度の上限を設ける。

---

## 2. 各モジュールへの適用

### 2.1 `frontierAnalysis.ts` — 海上フロンティアの追加

現状の `analyzeFrontiers()`（陸接触ベース）はそのまま残し、新規に `analyzeSeaFrontiers(pack, seaRouteGraph)` を追加する。

- 各国の港湾都市ごとに、`seaRouteGraph` 上で到達可能な他国の港湾都市を列挙し、`state.diplomacy` の関係性で脅威度を重み付け（`RELATION_THREAT_WEIGHT` を流用）。
- 結果は既存の `FrontierSegment` 型に載せる。`landmass` フィールドは「自国の港がある陸塊」を入れることで、`redistributeGarrisons`（landmassでセグメントをフィルタする既存ロジック）や `pickPrimaryFrontier` にそのまま統合できる。`cx/cy` は自国港セルの座標（＝艦隊の帰属先）にする。
- `getProvinceThreats()` も無改修でそのまま使える（`segment.cells` に自国港セルを含めれば、その州が「前線州」として扱われ、野戦軍がそこへ配置されるようになる = 「近くにいるのに防衛できない」の直接対策）。

`StrategicPlannerGenerator.generate()` 内の `frontiers.get(attacker.i)` は `analyzeFrontiers()` と `analyzeSeaFrontiers()` の結果を結合したものを渡すようにする。

### 2.2 `strategic-planner.ts` — 艦隊侵攻を正式な`StrategicGoal`経由に一本化

- `localAttackerPower` の集計（76-91行）で、対象が海上フロンティア由来のセグメントの場合、艦隊連隊(`regiment.n`)については `dist < 300` の直線判定を `findSeaRouteDistance(graph, regiment.cell, targetPortCell) !== null` に置き換える。到達可能な場合のみ戦力に算入する。
- これにより艦隊による侵攻も、通常の陸戦と同じ tension蓄積 → `willingToAttack`/deterrence 判定 → `resolveSiege()` のパイプラインを通るようになり、`LocalSkirmish` による即時・無条件の陥落を経由しなくなる（2.4 で `LocalSkirmish` 側も海上では発火しないよう塞ぐ）。

### 2.3 `battle-resolution.ts` / `localDefense.ts` — 到達判定の統一

- `resolveSiege()` の攻撃側集計（70-89行）: `regimentLandmass === targetLandmass || dist < 300` の `dist < 300` フォールバックを、艦隊連隊に限り `findSeaRouteDistance` ベースの判定に差し替える。
- 防御側の援軍到着判定（46-65行、`regimentReinforcementRadius`）: 艦隊が防衛に参加するケース（例: 敵の上陸を阻止する自国艦隊）でも同様に航路距離を使う。`localDefense.ts` の `regimentReinforcementRadius()` は艦隊(`regiment.n`)の場合に「航路距離ベースの到達可否」を返す別ロジックに分岐させる（現状はcavalry/infantryの比較しかしておらず、艦隊は常にinfantry扱いの100ユニットになってしまっている）。
- `estimateLocalDefendingForce()`（strategic-planner.ts の見積もりにも使われる）も同様。

### 2.4 `localSkirmish.ts` — 海を挟んだ即殺を塞ぐ

- 現状は「敵対国同士・距離150以内・戦力比3倍」で無条件に殲滅する。艦隊(`regA.n || regB.n`)が絡む、または2連隊が異なる陸塊にいるペアについては、まず `findSeaRouteDistance` で到達可能か判定し、到達可能な場合のみ**航路距離**を150ユニット相当の閾値と比較する（直線距離の150ユニットをそのまま航路距離に使うと、実際の航路長は湾曲する分だいたい長くなるため、閾値は再検討が必要。フェーズ3で実測しながら調整する）。
- 到達不可能なペア（航路が無い＝安全に接触できない）は現状通りスキップされる。

### 2.5 `military-generator.ts` — `redistributeGarrisons` の艦隊対応

現状 `redistributeGarrisons()`（524-574行）は艦隊を無条件でスキップしている（535行 `if (r.n || r.isCapitalGuard) return;`）。

- 艦隊専用の再配置ロジックを追加: 2.1 で `analyzeSeaFrontiers()` が返す自国のセグメントのうち、脅威度が最大のものへ艦隊を寄せる。ただし艦隊は直線移動ではなく、`seaRouteGraph` 上で母港から最も近い「脅威セグメントの相手港へ向かう航路上のノード」に位置を合わせる（＝実在する航路上にしか艦隊は存在しない、という制約をここでも守る）。
- 陸軍側については 2.1 の対応だけで十分機能する見込み（海上フロンティアセグメントが `landmass` タグ付きで追加されるため、既存の陸軍再配置ロジックがそのまま港へ野戦軍を引き寄せる）。追加改修は不要と見立てているが、フェーズ4の検証で確認する。

---

## 3. スコープ外・関連する既知の問題（今回は対応しない）

- **`Military.generate()` の全回復問題**: `nobility/index.tsx` の tick hook（151-159行）は `bordersChanged` のたびに `Military.generate()` を人口ベースでフル実行し、艦隊・陸軍とも戦闘損耗が実質的に「回復」してしまう。航路拘束を入れても、この回復問題が残っていると「弱い航路防衛さえ突破すれば艦隊は無傷で回り続ける」という別の意味での無双状態は解消しきらない可能性がある。別issueとして切り出す。
- **征服の飛び地化バグ**（`docs/plan/regiments.md` で既出）: `resolveSiege()` の陥落処理は都市のセル1つだけを国有化し、周辺の地続き化（flood-fill）を一切行わない。沿岸都市が海路でしか行き来できない飛び地になること自体は、航路拘束の世界観とは矛盾しない（むしろ「海路でしか補給できない橋頭堡」として自然）が、隣接セルとの整合性チェックは別途必要になる可能性がある。今回のスコープには含めない。
- **上陸作戦の中間表現**: 2.2で触れた「港でない都市への上陸」は簡易的な直線加算で近似する設計にとどめている。海兵隊(marines)の輸送・上陸プロセスそのものをシミュレートする作り込みは今回は行わない。
- **視界・偵察との連携**: `resolveSiege()` の奇襲判定（Spymaster vs Spymaster）は今回変更しない。航路上を移動する艦隊が事前に発見されやすくなる、といった連動は将来課題。

---

## 3.5 前提として先行実装したFleetの戦闘力バランス修正（実装済み）

航路拘束そのものとは別軸だが、ユーザー判断で先に着手・実装した。艦隊を無害化する方向の変更なので、Phase 1以降の効果を確認する土台として記録しておく。

- **`fleet`ユニットの`power`を大砲前提から乗員数ベースに修正**（`military-generator.ts` `getDefaultOptions()`）。旧`power: 50`は`crew`（100）と無関係な固定値だった（本プロジェクトは`docs/plan/shipbuilding.md`の方針で研究開放までは大砲を出さない）。`NAVAL_MELEE_PENALTY = 0.3`を新設し、`power: rn(fleetCrew * NAVAL_MELEE_PENALTY)`（=30）とし、揺れる甲板での白兵戦は歩兵ほど振るえない、という根拠を明示した。輸送している陸上部隊（marines）の戦闘力は別枠の`MilitaryRegiment.u`エントリとしてそのまま加算される。
- **海兵として乗せる弓兵にも追加ペナルティ**。`needsMarines`時の陸上部隊乗艦ロジックに`MARINE_TRANSFER_RATE = 0.25`を新設し、`type === "ranged"`の部隊は`NAVAL_RANGED_EMBARK_PENALTY = 0.4`をさらに掛けた乗艦率にした（実質25%×40%=10%）。揺れる船上では弓の照準が白兵戦以上に乱れるため、国は近接部隊を優先して海に出し、弓兵は陸に多めに残す、という想定。
- **注意点（非対称性）**: `unit.power`は現状`battle-screen.ts`（手動のBattle Screenダイアログ）でしか参照されておらず、Advance Timeの自動戦闘解決（`strategic-planner.ts`/`battle-resolution.ts`/`localSkirmish.ts`）は`regiment.a`（頭数）のみを見て`unit.power`を一切参照しない。一方、`NAVAL_RANGED_EMBARK_PENALTY`は乗艦させる頭数そのもの（`regiment.a`）を減らすため、自動戦闘解決にも実際に効く。Fleet Power修正は手動画面向け、乗艦ペナルティは自動戦闘にも有効、という理解でよい。
- Shipyards連携（既存船+新造船数を艦隊の上限にする案）はユーザー判断で今回はスキップ。

---

## 4. 実装フェーズ案

1. **Phase 1**（実装済み）: `seaRouteGraph.ts` 新設（`buildSeaRouteGraph` / `findSeaRouteDistance`）+ 単体テスト（航路の有無・距離計算・到達不可ケース、並列route辺の最短距離採用）。`src/generators/seaRouteGraph.ts` / `seaRouteGraph.test.ts`。既存の`findPath`（`pathUtils.ts`）は密なセル隣接配列(`cells.c`)前提で疎な航路グラフには不向きなため流用せず、同じ`flatqueue`ベースのダイクストラを航路グラフ専用に新設した。艦隊連隊の`.cell`（母港の陸地セル、0.3参照）をそのままグラフのノードIDとして渡せる設計。`npx tsc --noEmit`・`npm run lint`・`npm run madge`・`npx vitest run`（全30ファイル284件）すべてクリーン。
2. **Phase 2**（実装済み）: `frontierAnalysis.ts` に `analyzeSeaFrontiers()` を追加（`FrontierSegment` に `origin?: "land" | "sea"` を新設。既存呼び出し元・テストへの影響を避けるためoptionalにし、未設定は"land"扱い）。`analyzeFrontiers()`との重複を避けるため、関係性+戦争履歴から脅威度を出す部分を`getThreatWeight`/`getRelationLabel`に共通化（挙動は変えず、既存16件のテストが無改修で通ることを確認済み）。`mergeFrontiers()`で land/sea 両マップを結合し、`strategic-planner.ts`の`generate()`に統合。
   - ターゲット選定: `segment.origin === "sea"`の場合、対象州の**港burgのみ**を候補にし、`segment.cx/cy`への直線距離ではなく`findSeaRouteDistance`（航路距離）で最寄りを選ぶ（§1.2で触れた「港でない都市への上陸」は今回もスコープ外のまま）。
   - 現地戦力集計: sea segmentでは**艦隊連隊（`regiment.n`）のみ**を対象に、`findSeaRouteDistance(regiment.cell, targetPortCell) !== null`で到達可否を判定（陸軍連隊は単独では洋上へ戦力投射できない、というモデル上の割り切り）。land segmentは既存ロジック無改修。
   - `isCornered`判定は「陸塊上の他burg数」から「候補ターゲット数（港数）」に一般化（land/sea共通のロジックとして自然に流用できた）。
   - テスト: `frontierAnalysis.test.ts`に`analyzeSeaFrontiers`/`mergeFrontiers`のテスト7件追加（航路で繋がったport間のセグメント生成、双方向性、未到達な敵対港は無視、非敵対関係の低weight、port以外/removed/無所属burgの除外）。`strategic-planner.test.ts`に「陸上国境が一切無い（`cells.c`が空）状態で、航路のみで繋がった敵地の港への奪還`StrategicGoal`が生成される」「航路が無ければ生成されない」の2件を追加し、Phase 2の受け入れ条件を直接検証。`seaRouteGraph.ts`には多対象探索用に`findReachableCells()`を追加（内部Dijkstraを`findSeaRouteDistance`と共通化）。
   - `npx tsc --noEmit`・`npm run lint`・`npm run madge`・`npx vitest run`（全30ファイル295件）・`npm run build`すべてクリーン。
3. **Phase 3**（実装済み）: `localDefense.ts` に `regimentDistanceTo(regiment, targetCell, targetX, targetY, seaRouteGraph)` を新設（艦隊は航路距離、陸軍は従来通り直線距離、艦隊で航路が無ければ`null`）。`REINFORCEMENT_RADIUS`に`naval: 500`を追加し`regimentReinforcementRadius()`が艦隊は常にこれを返すように分岐。`estimateLocalDefendingForce()`に`seaRouteGraph`引数を追加（呼び出し元のstrategic-planner.tsは既にPhase2でグラフを持っている）。
   - `battle-resolution.ts`の`resolveSiege()`: 冒頭で`buildSeaRouteGraph(pack)`を1回構築。防御側の援軍到着判定と、陥落後のcasualty反映ループの両方を`regimentDistanceTo`ベースに置き換え。攻撃側戦力集計は「陸軍は`regimentLandmass === targetLandmass`のみ（`dist < 300`の直線フォールバックは削除——これがまさに元の「海を挟んでも300ユニット以内なら侵攻できてしまう」抜け道だったため）、艦隊は`findSeaRouteDistance !== null`」に分岐。
   - `localSkirmish.ts`: `NAVAL_SKIRMISH_CONTACT_RADIUS = 400`を新設（陸の150より広いが、艦隊の援軍到達範囲500よりは狭い——「接触」は"いずれ到着できる"より厳しい"今まさに交戦中"の意味なので）。`regA.n || regB.n`のペアだけ航路距離判定に分岐、陸同士は既存の直線150判定のまま無改修（既存のKautongwuシナリオ含め全既存テストが無改修で通ることを確認済み）。当初案にあった「陸塊が異なるだけの陸軍同士も航路判定に回す」は今回見送り——艦隊が絡むケースだけに絞ることで、よくテストされている陸戦パスに手を入れずに済み、報告された本丸のバグ（艦隊の無制限侵攻）に的を絞れた。
   - テスト: `battle-resolution.test.ts`に4件（艦隊到達可否での攻略成否、艦隊防衛の到達可否）、`localSkirmish.test.ts`に2件（Kautongwuと同型の戦力比だが艦隊版、航路の有無で結果が変わることを確認）追加。
   - `npx tsc --noEmit`・`npm run lint`・`npm run madge`・`npx vitest run`（全30ファイル301件）・`npm run build`すべてクリーン。
4. **Phase 4**（実装済み）: `military-generator.ts`の`generate()`冒頭で`analyzeFrontiers()`と`analyzeSeaFrontiers()`を`mergeFrontiers()`で結合（Phase2/3と同じパターン）。新設`redistributeFleet(r, segments)`が艦隊専用の再配置ロジックを実装:
   - 自国landmassの海上セグメントのうち最大脅威のものを`pickPrimaryFrontier`で選定（既存ヘルパーをそのまま流用——cx/cyが「自国の脅威を受けている港」の座標なので、land版と全く同じ関数で意味的に成立する）。
   - 脅威国の到達可能な最寄り港を`findSeaRouteDistance`で探索し、`findSeaRoutePath`（今回新設、Dijkstraの前駆ノード追跡を`dijkstraFrom`に追加）で母港からその港までの実際の経路ノード列を取得。
   - `GARRISON_PULL_STRENGTH`（land版と共通の0.5）×脅威比率で経路上の「何ノード目まで進むか」を計算し、その実在ノードへ`r.cell/x/y`をスナップ——直線移動は一切行わない。
   - 到達可能な脅威港が無ければ艦隊は母港から動かない（`enemyPortCell === -1`で早期return）。
   - **陸軍側は無改修で機能することを確認**: `getProvinceThreats()`と既存の`redistributeGarrisons`陸軍分岐は、`segment.origin`を区別せず`landmass`一致だけで海上セグメントも通常のセグメントとして扱うため、港を含む州が自動的に「前線州」として認識され、内陸の野戦軍がそちらへ引き寄せられる（テストで確認、追加コード不要という当初の見立て通り）。
   - テスト: `military-generator.test.ts`に3件追加（艦隊が航路上のノードまで移動する厳密な座標検証、航路が無ければ母港のまま、内陸陸軍が海上脅威のある港へ引き寄せられる比較検証）。全て`Military.generate()`をフルパイプラインで実行する統合テストとして記述（既存テストと同じスタイル）。
   - `npx tsc --noEmit`・`npm run lint`・`npm run madge`・`npx vitest run`（全30ファイル308件）・`npm run build`すべてクリーン。
5. **Phase 5**（一部実施）: 新規マップ+同一シードでの検証（`temp/Auteia`セーブではなく、`dev`サーバー+`playwright-cli`で新規生成→Nobility有効化→Advance Time）で、海軍修正着手前のコミット(`8e27f225`)と現行コードを比較。**艦隊による無制限越境が2件塞がれていることを確認**（同一シードで首都陥落数が10→8に減少、差分の2件はいずれも航路なしの越境）。一方でこの検証中、陸軍側の別バグ（`LocalSkirmish`の過剰発火）を発見し、そちらを`docs/plan/regiments.md`「バグを発見2」で修正済み。(a)(b)(c)の当初チェック項目（`temp/Auteia`セーブでの奪還計画確認等）は未実施のまま残っている。

どのフェーズから着手するか、あるいは通しで一気に実装するか、方針を教えてください。
