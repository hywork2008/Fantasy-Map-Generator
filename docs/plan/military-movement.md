# 軍隊の移動・時間粒度・編成の再設計

新しいセッションへの引き継ぎ用ドキュメント。`docs/plan/naval-sea-lanes.md`（艦隊の航路拘束、Phase 1〜4実装済み）と`docs/plan/regiments.md`（LocalSkirmishの過剰発火修正）の両方の検証作業で、共通してより根深い問題が見えてきた——**連隊には「時間をかけて移動する」という概念が一切無く、Advance Timeのたびに新しい位置へ瞬間移動しているだけ**、という点。ユーザーからの直接の指摘:

> 騎馬ではない陸軍が1日に24-32km、騎馬隊がずっとでは無いですが倍の48-64km移動出来ると仮定すると現在のAdvance Time 1年あればどこへでも行けてしまいます。
>
> 戦争の為に年月日の概念を導入し、1日ごとのTickを用意し、軍隊が常識的な範囲内で移動する事を確認する必要があると思います。
> また、陸軍が敵地に繋がらない半島に潜り込まないようにpath findingをする必要があると思われます。
> そして、敵味方それぞれが状況に応じて軍隊を動かすには、おそらく現在の部隊の上限数では足りないはずです。小隊・中隊・大隊・旅団・師団(これらの単位は、あくまで例)など、少なくなりすぎない範囲で適切な分けたり合流し、お互いの侵攻の意図を推測し動く機能、目視で確認したなら寄っていくか、防衛の為に都市に入る事も検討しなければいけません。

このドキュメントは実装計画そのものであり、次のセッションはここから着手する（過去のセッションの文脈を再構築する必要はない）。**まだ何も実装していない** — 以下は調査結果と設計の叩き台であり、フェーズ着手前にユーザーとの確認（§4）が必要な項目を多く含む。

---

## 0. 前提となる調査結果（今回のセッションで確認済み）

- `MilitaryRegiment`（`src/types/models.ts`）は`cell`/`x`/`y`（現在位置）と`bx`/`by`（拠点位置。`regiment-editor.ts`の手動ドラッグUIが使う「拠点からの距離」表示専用で、シミュレーションには無関係）を持つが、「移動中」「目的地」「経過距離」に相当するフィールドは一切無い。
- `moveRegiment()`（`src/renderers/draw-military.ts`）は純粋なSVGアニメーション関数（座標を移動距離に比例した`duration`でtransitionさせるだけ）。呼び出し元は`battle-screen.ts`（手動のBattle Screenダイアログ）と`regiment-editor.ts`（手動ドラッグUI）のみで、Advance Timeの自動シミュレーションパイプラインには一切関与しない。
- 現状の連隊配置は完全に瞬間移動: `redistributeGarrisons`/`redistributeFleet`（`military-generator.ts`）は`Military.generate()`が呼ばれるたびに、連隊の座標を直接書き換える。移動時間・移動距離による制約は無い。`resolveSiege()`/`LocalSkirmish.annihilate()`による都市陥落も同様に瞬間的。
- `redistributeGarrisons`の陸軍按分は、起点・終点がどちらも自国の実在陸地セルであることは保証する（`docs/analytics/military-frontier-repositioning.md`で過去に修正済み）が、**その間の経路が実際に陸続きかは保証しない**。凹んだ海岸線・半島・湾を挟むと、直線経路の途中が海上や他国領を横切りうる——ユーザーが懸念する「敵地に繋がらない半島に潜り込む」不具合の温床。
- `advanceTime(deltaYears)`（`src/generators/timeEngine.ts`）は`deltaYears`の値に関わらず、登録済みtick hookを**常に1回だけ**実行する。`StrategicPlanner.advanceTension()`のtension加算も`deltaYears`でスケールしない（`(baseIncrement + noise) * frequencyMultiplier`のみ、経過年数を見ない）。つまり「Advance Time 10年」を1回呼んでも「Advance Time 1年」を1回呼んでも、シミュレーション上の処理量（連隊の移動量を含む）は全く同じ——これが「1年でどこへでも行けてしまう」の直接の原因。
- `worldContext.distanceScale`（マップ単位→現実距離の換算係数）と`useOptionsState().distanceUnit`（デフォルト`"km"`、ユーザー変更可）が既存で、`battle-screen.ts`・`routes-editor.ts`・`measurers.ts`等で使われている。現実の移動速度（km/日）をマップ単位に変換する土台としてそのまま転用できる。
- `pack.routes`には`"roads"`/`"trails"`（陸路）と`"searoutes"`（海路）の3グループがあり、`routes-generator.ts`が生成、`pack.cells.routes: Record<number, Record<number, number>>`で隣接関係を引ける。今回のNaval Sea Lanes作業（Phase 1、`src/generators/seaRouteGraph.ts`）で`"searoutes"`専用のDijkstraグラフ（`buildSeaRouteGraph`/`findSeaRouteDistance`/`findSeaRoutePath`/`findReachableCells`）を実装済み。**陸路(`"roads"`/`"trails"`)にも同じ設計パターンをそのまま転用できる**——ゼロから設計する必要はない。
- 連隊の規模表示（Company/Battalion/Brigade/Division、`military-generator.ts`の`SIZE_TIERS`）は兵力数から算出される**表示名のみ**。実際の指揮系統・分割/合流ロジックは存在しない。連隊統合は`Military.generate()`実行時の一発生成（脅威度に応じた州単位プール化、`docs/plan/military-organization-and-vassalage.md`参照）であり、tick駆動の動的な再編成ではない。`MAX_FIELD_ARMIES = 9`が1国家あたりの野戦軍上限。
- `MilitaryRegiment.children?: MilitaryRegiment[]`というフィールドが型定義に存在するが、コードベース全体で**一度も読み書きされていない**（アップストリームFMG由来の未使用フィールドと思われる）。階層構造の器として転用できる可能性はあるが、実績はゼロ。

---

## 1. スコープと設計方針

ユーザーの要望を4つの柱に分解する。相互に依存関係が強いため（移動には時間粒度が要り、時間粒度には経路探索が要り、経路探索の単位は「連隊」という編成そのものに依存する）、1つのドキュメントにまとめる。

### 1.1 日単位の移動予算と現実的な速度

**方針**: シミュレーション全体を日単位に細分化するのではなく、**軍隊の移動距離計算だけ**を「経過日数 × 1日あたりの移動速度」で予算化する。人口動態（`simulateDemographics`）や外交tension蓄積など、既存の年単位ロジックは変更しない——粒度を上げるのは移動関連のみに限定し、既存の挙動への影響を最小化する。

- `advanceTime(deltaYears)`内で`deltaYears * 365`を「経過日数」として計算し、その日数分の移動予算を各連隊に割り当てる（うるう年等の精度は不要）。
- 移動速度定数（**要ユーザー確認、以下は叩き台**）:
  - 非騎馬部隊: 24〜32km/日
  - 騎馬部隊: 48〜64km/日（ユーザー曰く「ずっとでは無い」——長距離連続行軍では騎馬ボーナスが逓減する設計を検討。例: 最初の数日は倍速、それ以降は徒歩と同程度に減衰、など。具体的な減衰カーブは要ユーザー承認）
  - 艦隊: 現状`redistributeFleet`（naval-sea-lanes.md Phase 4）は`GARRISON_PULL_STRENGTH`（0〜0.5固定割合）で航路上のノードへスナップしており、実距離・実時間の概念が無い。艦隊もこの日単位予算制に統一するかは§4の確認事項。
- 単位換算は`worldContext.distanceScale`/`distanceUnit`を使う。`distanceUnit`が`"km"`でない場合の変換に注意（既存の`rn(length * worldContext.distanceScale)`パターンを踏襲すればよい）。

### 1.2 陸軍の経路探索（半島に迷い込まない）

**方針**: `seaRouteGraph.ts`と全く同じ設計パターンを陸路に転用する。

- 新規`src/generators/landRouteGraph.ts`（または`seaRouteGraph.ts`を汎用化した`routeGraph.ts`に統合し、`buildRouteGraph(pack, groups: string[])`のような形にするか——重複コード削減の観点で要検討）。`pack.routes`の`"roads"`/`"trails"`グループから隣接グラフを構築し、`findLandRouteDistance`/`findLandRoutePath`/`findLandReachableCells`を提供する。
- 陸軍の移動先決定を、直線距離按分＋最近傍セルへのスナップ（現行の`redistributeGarrisons`）から、この陸路グラフ上の実経路に沿った移動へ置き換える——`redistributeFleet`が航路グラフのノードへスナップした設計（naval-sea-lanes.md Phase 4）をそのまま踏襲できる。
- **未解決の懸念**: 全ての陸地セルが道路網（`"roads"`/`"trails"`）でカバーされているとは限らない（人口の少ない僻地、道路生成アルゴリズムの対象外になったセル等）。道路が無い区間の扱い案:
  - (a) 道路の切れ目では、隣接セル（`cells.c`、`analyzeFrontiers`が既に使っている陸接続グラフ）を辿るBFSにフォールバックする。
  - (b) 道路が無い区間の移動速度に大きなペナルティを課す（未整備地形は遅い、という現実的な理由付けにもなる）。
  - どちらか、あるいは両方の組み合わせが必要になりそうだが、実装前に方針を固めるべき。

### 1.3 部隊編成の階層化・動的な分割/合流

**方針**: 現状のCompany/Battalion/Brigade/Divisionは「表示名」のみ。ユーザーの要望は実質的な階層構造（小隊・中隊・大隊・旅団・師団、具体的な名称・比率はユーザーの言う通りあくまで例）を持たせ、状況に応じて動的に分割/合流させること。

- `MAX_FIELD_ARMIES = 9`は今回の要件には不足する可能性が高い——多方面に同時対応する必要があるため、上限そのものの再検討、または「上限は維持しつつ、脅威度に応じて動的に再編成する」設計が必要。
- 設計の方向性（**要ユーザー相談**、以下は選択肢の提示であって決定ではない）:
  - オプションA: 既存の未使用`MilitaryRegiment.children?: MilitaryRegiment[]`を使い、実際に親子階層を持たせる。
  - オプションB: フラットな配列のまま`parentId`的な参照で系統を表現する（`officerAssignment.ts`の`commanderId`パターンに近い）。
  - 分割/合流のトリガー例: 敵を発見した際に斥候部隊を分離する、複数方面の脅威に同時対応するため主力を分割する、脅威が一点に集中したら合流する。
- §1.4のAI反応レイヤーと表裏一体——「動く判断」をする主体が「連隊」なのか「連隊の中の一部隊」なのかで設計が変わる。

### 1.4 索敵・AIの反応行動

**方針**: 連隊に「視認範囲」の概念を導入し、tick毎に視認範囲内の敵連隊の有無を判定、状況に応じて以下のような意思決定をさせる:

- 敵を発見 → 迎撃のため接近する、または撤退して都市に籠城する、のいずれかを戦力比等に応じて選択する。
- これは既存の2層（`strategic-planner.ts`＝国家レベルの長期戦略tension、`localSkirmish.ts`＝隣接時の即時判定）とは別の、**「移動中の意思決定」という第三のレイヤー**になる。
- 都市への「撤退」は、既存の`estimateLocalDefendingForce`（`localDefense.ts`）＝都市の防衛力見積もりと自然に接続できる——籠城することで`FORTIFIED_ATTACK_RATIO`等の防御倍率の恩恵を受けられる、という既存の仕組みをそのまま活かせる。

---

## 2. スコープ外（このドキュメントでは扱わない）

- 人口動態（`simulateDemographics`）・外交tension蓄積速度そのものの年単位粒度——移動計算以外は変更しない。
- 兵站・補給線（`docs/analytics/military-frontier-repositioning.md`からの持ち越し課題、今回も対象外のまま）。
- `resolveSiege()`/`LocalSkirmish`の戦闘解決ロジックそのもの（force ratio計算等）——このドキュメントが扱うのは「戦う相手にどうやって・どれだけの時間をかけて辿り着くか」であって、「辿り着いた後にどう戦うか」は`docs/plan/regiments.md`/`docs/plan/naval-sea-lanes.md`の範囲のまま。

---

## 3. 実装フェーズ案（叩き台、着手前に§4をユーザーと確認すること）

1. **Phase 1**: 陸路版route graph新設（`seaRouteGraph.ts`と同じ設計）。低リスク——Naval Sea LanesのPhase 1で実証済みのパターンをそのまま転用するだけなので、最初に着手するのが自然。
2. **Phase 2**: 移動予算モデル。`MilitaryRegiment`に移動関連フィールド（`destinationCell`/`remainingDistance`/経路配列とカーソル位置、等——具体的なデータ構造は要設計）を追加し、`advanceTime`のtick hook内で経過日数分の予算だけ経路上を前進させる。艦隊(`redistributeFleet`)も統一するならここで一緒に置き換える。
3. **Phase 3**: 索敵・AI反応レイヤー新設。
4. **Phase 4**: 部隊編成の階層化・動的分割/合流。4つの柱の中で最も設計難度が高く、Phase 1〜3が固まってから着手するのが安全。

---

## 4. 次セッションが最初に確認すべきこと（Open Questions）

実装着手前に、これらをユーザーに確認すること。特に前半3つは数値・ルールそのものの承認が必要で、後半2つはアーキテクチャ選択の承認が必要。

1. 移動速度の具体値——24-32km/日・48-64km/日は叩き台か確定値か。
2. 騎馬部隊の「ずっとでは無い」の具体的な減衰ルール（何日で速度低下するか、どこまで落ちるか）。
3. 部隊階層の名称・比率をどこまで細かく作るか（ユーザーは「あくまで例」と明言しているので、実際の階級名・人数比はこちらで叩き台を作ってレビューを仰ぐ）。
4. `MAX_FIELD_ARMIES`の再設計方針——上限を撤廃するか、動的再編成（分割/合流）だけで対応するか。
5. 索敵範囲の具体的な数値・形状（円形の固定半径か、地形・文化タイプ依存か）。
6. 艦隊もこの日単位移動予算制に含めるか（naval-sea-lanes.md Phase 4の`redistributeFleet`との統一）。

着手順は上記フェーズ案の通りPhase 1（陸路route graph）から始めるのが最もリスクが低いが、最終的にどこから着手するかもユーザーに確認すること。
