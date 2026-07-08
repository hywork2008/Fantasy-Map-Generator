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

1. **Phase 1**（実装済み）: 陸路版route graph新設（`seaRouteGraph.ts`と同じ設計）。低リスク——Naval Sea LanesのPhase 1で実証済みのパターンをそのまま転用するだけなので、最初に着手するのが自然。
2. **Phase 2**（実装済み）: 移動予算モデル。`MilitaryRegiment`に移動関連フィールドを追加し、`advanceTime`のtick hook内で経過日数分の予算だけ経路上を前進させる。艦隊(`redistributeFleet`)も統一。
3. **Phase 3**: 索敵・AI反応レイヤー新設。
4. **Phase 4**: 部隊編成の階層化・動的分割/合流。4つの柱の中で最も設計難度が高く、Phase 1〜3が固まってから着手するのが安全。

### Phase 1 実装ログ

`src/generators/landRouteGraph.ts` / `landRouteGraph.test.ts` を新設。`seaRouteGraph.ts`と全く同じDijkstra設計（`FlatQueue`ベースの`dijkstraFrom`、`build*`/`find*Distance`/`find*ReachableCells`/`find*Path`の4関数構成）を、対象routeグループだけ`"searoutes"`→`"roads"`/`"trails"`に変えて転用した。

- **統合はせず並存を選択**: `routeGraph.ts`への一般化（§1.2で「要検討」としていた案）は見送った。陸路は「全陸地セルが道路網でカバーされているとは限らない」（§1.2の未解決の懸念）という海路には無い固有のフォールバック要件をPhase 2以降で抱える見込みが高く、今の時点で共通化すると後で分岐が必要になった時に無理に剥がすことになる。今は2モジュールの重複で十分、実際に共通ロジックが安定してから統合を検討する。
- **既存呼び出し元への影響なし**: `seaRouteGraph.ts`は無改修。今回追加したのはグラフ構築・探索の土台のみで、`redistributeGarrisons`等への配線（半島に迷い込まないようにする経路拘束の適用）はPhase 2の移動予算モデルと合わせて行う（naval-sea-lanes.md Phase 1も同様に「グラフを作るだけ」でPhase 4まで配線しなかった前例に倣った）。
- テスト15件（グラフ構築時の双方向エッジ・距離計算、roads/trails混在の経路連結、searoutesの除外、並列route辺の最短距離採用、未到達ケース、`findLandRoutePath`の経路復元）追加。`npx tsc --noEmit`・`npm run lint`・`npm run madge`・`npx vitest run`（全31ファイル327件）すべてクリーン。

### Phase 2 実装ログ

**着手前にユーザーと確認したアーキテクチャ上の分岐点**: `Military.generate()`は`bordersChanged`のたびに`state.military`を完全に作り直す（連隊に永続的なID・identityが無い）。移動予算モデルを「経過ティックをまたいで前回位置から前進させる」ものにするには、この作り直しとどう共存させるかを先に決める必要があった。ユーザーの選択: **配置ロジックを`generate()`から完全に分離する**（`redistributeGarrisons`/`redistributeFleet`とその補助前計算を`military-generator.ts`から削除し、独立した「移動tick」システムを新設。`generate()`は兵力構成（徴兵・統合）と初期スポーン位置の設定のみを担当し、以後は二度と位置に触れない）。

- **新設 `src/generators/regimentMovement.ts`**: `MilitaryRegiment`に`destinationCell`/`path`/`pathIndex`/`edgeProgress`/`offRoad`を追加（`src/types/models.ts`）。トップレベル`advanceAllRegimentMovement(pack, worldContext, deltaYears)`が全国家・全連隊を走査し、(1) `ensureGarrisonMarchOrder`/`ensureFleetMarchOrder`で目的地を決定（旧`redistributeGarrisons`/`redistributeFleet`と全く同じ「主要フロンティアへの按分プル→自国seno land cellへスナップ／航路上のノードへスナップ」ロジックをそのまま移植——ただし直接座標を書き換える代わりに`destinationCell`をセットするだけ）、(2) 目的地までの経路を`landRouteGraph`（Phase 1）または`seaRouteGraph`で探索し見つからなければ`findPath`（`pathUtils.ts`、`cells.c`の密な隣接グラフ前提、既存流用）で§1.2のオフロードBFSフォールバックを試す、(3) `dailySpeedMapUnits`（種別・オフロード有無・`distanceScale`/`distanceUnit`から算出した1日あたりの移動距離）× 経過日数（`deltaYears*365`）を予算として経路上を前進させる（`advanceAlongPath`）、という3段構成。
- **移動速度モデル**（§4の回答1・2・6を反映）: 歩兵28km/日、騎兵56km/日（バースト56km/日を3日、その後徒歩ペース28km/日で1.5日休む、というサイクルを平均した実効速度——ユーザー回答2の「3日進んで1,2日休む、長距離の素早い移動は考慮しない」を日次ステートマシンではなく単純な加重平均でモデル化。理由:`advanceTime`の`deltaYears`は一度に何十年分にもなり得るため、日単位の状態遷移をシミュレートしても戦略ゲームのスケールでは精度向上に見合わない）、艦隊50km/日（叩き台、根拠となる数値未提示のため仮置き）。オフロード（§1.2のフォールバック時）は0.6倍のペナルティ。`distanceUnit`が"km"以外（"mi"）の場合はkm→mi換算してから`distanceScale`で地図単位に変換。
- **オフロードフォールバック（§1.2の未解決懸念への対応）**: 選択肢(a)+(b)を両方採用。`findLandRoutePath`が失敗したら`findPath`（既存の密なcells.c隣接グラフ用Dijkstra、`h<20`のセルを通行不可として）でBFSし、その経路には速度ペナルティ（`offRoad=true`）を課す。
- **`military-generator.ts`からの削除**: `GARRISON_PULL_STRENGTH`定数、`landCellsByStateAndLandmass`前計算、`redistributeFleet`/`redistributeGarrisons`関数、その呼び出し。`analyzeFrontiers`/`analyzeSeaFrontiers`/`getProvinceThreats`は部隊統合（軍団バケットの按分・合流判定）に引き続き必要なため残した。
- **配線**: `src/extensions/nobility/index.tsx`のtick hookで、`bordersChanged`時のみ`Military.generate()`を呼ぶ従来の分岐とは別に、`advanceAllRegimentMovement`を**毎tick無条件で**呼ぶように変更（行軍は`bordersChanged`イベントの有無に関係なく継続すべきため）。戻り値（何か動いたか）と`bordersChanged`のいずれかが真なら軍事レイヤーを再描画。
- **テスト**: `military-generator.test.ts`から配置系の2 describe（3テスト、うち1件は削除前は無変更の`redistributeGarrisons`の「航路が無ければ母港のまま」テストとして通っていたが、まとめて新モジュール側に移設）を削除し、consolidation系の4テストのみ残した（無改修で通過）。新設`regimentMovement.test.ts`に9テスト追加: 陸軍のオフロード進軍（十分な時間で自国land cellへスナップ到達／短い時間だと経路の途中で止まる／オフロードフラグの検証／charted roadがあればそちらを優先／経路不通なら現状維持）、艦隊（航路上のノードまで按分進軍／航路が無ければ母港のまま）、海上脅威による内陸陸軍の牽引（naval-sea-lanes.md §2.5の「海軍固有コード無しで陸軍も牽引される」という主張の回帰確認）、脅威が無い場合は行軍命令が発生しないこと。
- `npx tsc --noEmit`・`npm run lint`・`npm run madge`・`npx vitest run`（全32ファイル332件）・`npm run build`すべてクリーン。

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

### 4のOpen Questionsへの回答

1. 叩き台。1セルのサイズなど、ゲームの単位と合わせて柔軟に調整する必要がある。
2. 草原・水源が無い地帯では馬が餓死・渇死する可能性が高い。最大で3日進んで1,2日休むなどピーキーで良い。基本的には戦闘時の爆発力に重きを置いて、長距離の素早い移動を考慮しない。長距離の場合は、馬の乗り換え、その為の馬の準備を中継点に行う必要があると思われ、このようなシステムは現時点では実装を計画しない。
3. 偵察用の小隊をいくつか先に進ませて行動を補正する、という事が出来れば良いが、これは精妙な軍事シミュレーションのゲームでは無いので、150人ほどのグループが最小単位で良いかと思いますが、良い案があれば教えて下さい。
4. Militaryの抽象化設定を用意し、軍隊なんてどうでも良いという人向けにMAX_FIELD_ARMIESを残して、それを使わせる。それを使わない場合は、<select>で今回の方式を選択して使うようにする。
5. 今回は円形の固定半径で良い。各都市に密偵がいれば、密偵から軍の移動経路の報告も来るかと思われるので、それらは抽象化かつ成功率は高いものとして扱い、敵味方の軍隊は比較的高い確率でお互いに視界外でも寄っていく。
6. 艦隊も含める。そのうち季節ごとの風向きや海流で、海路の使い勝手が悪いというのも実装したい。
