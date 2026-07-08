# 軍団は何をしているか

Advance Timeで10年ほど時間を15-20回ほど進める事でようやく戦闘が起こる事が多い。
戦闘が起こるとMilitaryのregenerateをした時のように軍団の兵士の数が更新される。
しかし場所は動いていない。
つまり殆どの国は軍事的な動きは殆どしていないか、或いはそのように見える。
戦闘が起ころうが起こるまいが常備軍が同じ所に留まり続けているのは奇妙に見える。
一応は周辺国の脅威度に合わせて、そこに居座る事を決めている筈だが、何十年もじっとしているとかなり奇妙に見える。
動かない軍団は最寄りの都市に駐屯しているものとして街の近くに絵文字だけ表示するか、或いは何も表示せず、Edit Burgダイアログの項目として駐屯している兵士の数を記載するか、或いは砦の建築などに従事した方が良さそうに見える。

軍隊は何をすべきか、どう動かすべきか？

docs/analytics/military-frontier-repositioning.md
docs/plan/military-organization-and-vassalage.md

## 回答

現状のコードを確認しました。ユーザーの観察はコードの実挙動そのものです。

### 現状の挙動(コード上の事実)

advanceTime()(src/generators/timeEngine.ts:62-110)自体は軍事ロジックを一切呼んでいません。年数を進め、simulateDemographics()と登録済み_tickHooksを呼ぶだけです。
実際に戦争/戦闘を動かしているのはNobility拡張のtick hook(src/extensions/nobility/index.tsx:139-159)→StrategicPlanner.advanceTension()(strategic-planner.ts:153-221)。各国の「戦略目標」のtensionが年ごとに+1〜+5(君主の大胆さ×warFrequency設定で変動)蓄積し、100に達した時だけ戦争宣言→resolveSiege()(battle-resolution.ts)が呼ばれます。10年×15-20回で発火するというユーザーの体感は、この閾値蓄積の速度とほぼ一致します。

resolveSiege()はreg.a(兵力)を減らす/陥落処理をするだけで、regiment.cell/x/yには一切触れません(battle-resolution.ts:154-179)。都市が陥落して国境が変わった場合のみMilitary.generate()が丸ごと再実行され、その副作用としてfrontierAnalysisベースの再配置が起きます(nobility/index.tsx:146-156)。つまり陥落が起きない限り位置は完全固定——ユーザーが見ている「何十年も同じ場所」は仕様どおりの挙動です。

### 提案(既存パターンの流用が筋が良い)

すでにgarrisonHost(他国駐屯を示すフラグ、vassalage.ts由来)やisCapitalGuardという「役割フラグ」パターンがMilitaryRegiment(src/types/models.ts:333-357)にあるので、これを拡張する形が自然です。

1. 駐屯判定: getProvinceThreats()(frontierAnalysis.ts、既にMilitary生成時に使用)が返すthreat値が一定tick連続で閾値以下の連隊を「駐屯中」とみなす。新規フィールドは最小限(garrisoned?: boolean程度)で済む。

2. 表示: 駐屯中の連隊は最寄りburgの近くに小アイコンのみ表示。moveRegiment()(draw-military.ts:175、バトル画面で既にX/Y遷移に使っている関数)を再利用すれば新規実装は少なくて済む。これがユーザー案の「絵文字だけ表示」に直接対応。

3. 砦建築の payoff: 何もしないと味気ないので、駐屯が一定tick続いた連隊の近くのburgでcitadelフラグを段階的に立てる。現状citadelは生成時1回きりのロール(burgs-generator.ts:490-512)だが、これをtick駆動でも立てられるようにすれば「駐屯→時間経過で砦完成」という自然な見た目になり、既存のcitadel描画/Edit Burg UIをそのまま流用できる。

4. Edit Burg欄: BurgEditorDialog.tsxのTreasury行(193行目)とFeatures行(194行目)の間に「駐屯兵力」行を追加。同burgをgarrison先とする連隊のaを合算するだけなので、上記1-3のどれを採るかに関係なく独立して足せる。

トレードオフ: 現状のtick hookは毎ターン外交tensionしか触っていない軽い処理です。連隊ごとに毎tick駐屯判定を入れると全国家×全連隊分の計算が増えますが、frontierAnalysis級の重い再計算ではなく閾値比較+稀にcitadelフラグを立てる程度なので許容範囲だと思います。

まず3と4(citadel建設payoff + Edit Burg欄)を先に入れて、駐屯アイコン表示(2)は見た目のインパクトを見てから追加、という順番で進めるのが良さそうですが、どこから着手したいか教えてください。

## バグを発見

軍団は敵の都市のあるセルを攻略するので、途中の都市のないセルは無視され、占領した都市が高確率で飛び地になる。

## その他の案

Militaryレイヤー表示では砦の表示を大きくして、戦略的に意味のある場所に砦が配置されているか確認したい。

軍隊を解散する。
解散した兵士には帰るべき家がある…あればいいなあ。
兵士が働いている時、兵士の住処は空き家なのか、家族と住んでいるのか、各都市がどれだけ兵士を収容出来るかの仕組みを整える必要がある。
兵士が兵士でない時の生活の仕組みが。

兵士が駐屯している都市には特需が発生し、経済的に発展する。

現在、時間は年単位で進めている。
秋の収穫が終わると兵士として稼働し、冬を兵士として過ごすなどのループを実行する為に四半期の時間経過か、1か月毎か。
地図の配置`WorldConfigurator`によっては穀物の保管に向かない、一年中農耕が出来る亜熱帯の場合はどうするか？

Diplomacy Editorの列に各国の総兵力を追加する。

## バグを発見

軍団は敵の都市のあるセルを攻略するので、途中の都市のないセルは無視され、占領した都市が高確率で飛び地になる。

temp/Auteia 2026-07-08-03-32.mapを展開したファイルがtemp/map_partsフォルダの中にあります。
総兵数6万のAl FaraがAlkとJukrosianという2つの敵国12万に囲まれ国家存亡の危機に見えます。
3倍の兵数が無いので攻めあぐんでいますが、現実の3倍は砦や城に籠っている敵を倒す時の話で、平地での合戦はそうではありません。
飛び地で絶体絶命のAl Faraの9人の騎馬隊、859人の陸軍はAdvance Timeで時間を進めても敵に無視され続け、逃げもしません。
為政者の決定だけではなく、現地判断で殲滅すべきに思えます。
ロジックを作りたいです。

またKautongwuという都市が飛び地になっているのはAl Faraから見て途中のセルに都市が無いから占領できないのかが気になっています。

## 回答2

セーブデータ(temp/map_parts)を実際に読んで、両方の疑問をコードと突き合わせました。

### Kautongwuが飛び地になる原因

「途中のセルに都市が無いから」ではなく、征服処理がそもそも都市の**セル1つしか**国有化しないことが原因です。

resolveSiege()の陥落処理(battle-resolution.ts:185-195)を見ると、

```ts
if (cityCaptured) {
  targetBurg.state = attackerId;
  for (let i = 0; i < pack.cells.burg.length; i++) {
    if (pack.cells.burg[i] === targetBurg.i) {
      pack.cells.state[i] = attackerId;
    }
  }
```

burgは1セルにつき1つ(burgs-generator.tsで`cells.burg[cell] = burgId`は1回しか立たない)なので、このループは実質「burg本体のセル1個」だけをattackerId国有に書き換えて終わりです。周囲のセルが自国領と地続きかどうかのチェックも、征服後にflood-fillで領土を塗り直す処理も一切ありません。世界生成時のexpandStates()(states-generator.ts:133-203)はDijkstra風のコスト付きBFSで首都から連続的に領土を広げる(=地続き保証)のに対し、戦争中の征服はこのBFSを二度と呼ばない別経路です。

Kautongwuの実データ(cell 3486, feature 2 = Al Faraの首都Shoqbahと同じ陸塊)を見ると、狙われた理由は距離だけです。ターゲット選定(strategic-planner.ts:50-63)は「segment.cx/cyに一番近い敵burg」を選ぶだけで、自国領に隣接しているかは見ていません。つまり過去のどこかの征服(campaignsに残る"Muwalese Conquest"や"Jukrosian War"など)でKautongwuだけが飛び地として陥落し、その後一度も地続き化されずに今に至っている、というのが実態です。都市の有無は無関係で、地続き化ロジックが存在しないこと自体がバグです。

### 飛び地守備隊(9騎兵+859歩兵)が何十年も無視される原因

Kautongwuは実は「都市(burg)」なのでStrategicPlannerのターゲットには入り得ます。無視され続けているのは、攻撃に必要な兵力の見積もりが完全に間違っているからです。

実データ: Al Fara総兵力 53,049 / Alk 55,821 / Jukrosia 70,295 (14_states.jsonのmilitary[].aを合算)。Kautongwuの現地守備隊は859+9=868、都市人口15人相当の民兵(`population*0.05`)を足しても誤差程度です。

ところがstrategic-planner.ts:88-97の「3倍ルール」はこう計算します。

```ts
const baseDefendingForce = intel.estimatedMilitaryPower;
let perceivedDefense = isCornered ? baseDefendingForce : baseDefendingForce * 0.5;
...
let requiredAttackForce = perceivedDefense * 3; // The 3x Attacker Rule
```

`intel.estimatedMilitaryPower`はespionage-generator.ts:63,111で`target.military`の**全連隊合計**、つまりAl Fara一国まるごとの兵力の(誤差付き)推定値です。Kautongwuという一都市を落とすのに、Al Faraの総兵力53,049の半分=約26,500を「守備兵力」とみなし、その3倍、約79,500を要求兵力にしてしまう。AlkもJukrosiaも単独ではこれを超えられないので、実際の現地兵力(868)とは無関係に、両国とも永遠に「攻めあぐむ」ことになります。ユーザーの直感どおり、3倍ルールが砦籠城でも野戦でも一律に、しかも国全体の兵力を基準に適用されているのが根本原因です(isCorneredがtrueな孤立landmassの場合はさらに2倍要求されるので、島嶼の飛び地などではもっと悪化します)。

つまりresolveSiege()自体は現地兵力ベースで正しく戦闘解決する仕組み(cityGarrison+radius内の連隊、battle-resolution.ts:50-87)を既に持っているのに、その手前のstrategic-planner.generate()が全く別の(国全体の)数字で「戦うかどうか」を判定しているため、そもそも開戦(tension蓄積開始)にすら至りません。

### 提案

1. **perceivedDefenseを現地兵力ベースに直す(本丸)**: strategic-planner.tsの`baseDefendingForce`を`intel.estimatedMilitaryPower`(国全体)ではなく、resolveSiege()と同じ「対象burgのcityGarrison + 半径内の連隊」の推定値に差し替える。intelの`accuracyLevel`(overestimated/underestimated)は倍率ノイズとして残せば、間諜の不確実性という意味も保てる。これだけでKautongwuのような薄兵力の飛び地は、AlkかJukrosiaのどちらかが次にgenerate()を回した時点で普通に狙われるようになるはず。

2. **砦/城籠城と野戦で倍率を分ける**: 現状citadelがあれば×1.5するだけ(line 92-95)なので、これを拡張し、citadel/walls無しの対象は3倍ではなく1.2〜1.5倍程度で十分attackできるようにする。「3倍は籠城戦の話」というユーザーの指摘に対応。

3. **「現地判断」による即time skirmish**: 上記1・2を直してもtensionは年+1〜+5ずつしか溜まらず(warFrequencyにもよるが)、陥落まで何年もかかる(前回の回答どおり)。国家の外交tension待ちとは別に、毎tick「敵対関係にあり、かつ近接する連隊/守備隊同士」を突き合わせ、兵力比が例えば3:1以上開いていれば即座に小規模な殲滅イベントを解決する軽量な仕組みを新設する(例: `LocalSkirmishGenerator`、nobility/index.tsxのtick hookに相追加)。これは中央のtension蓄積やdeterrence(隣接脅威による自重、strategic-planner.ts:118-135)を経由せず、"前線指揮官の独断"としてbypassする設計にする。frontierAnalysis.tsのanalyzeFrontiers()が既にlandmass単位で国境セグメントを出しているので、そのセグメント内の連隊同士だけ比較すればO(n²)を避けられる。

まず1(見積もりの根本バグ修正)を先に入れるのが費用対効果が高いと思います。1だけでKautongwuの飛び地守備隊は次のadvanceTension()サイクルで現実的に狙われるようになるはずです。2と3は「現地判断で殲滅」というユーザーの要望により直接応えるものなので、1の効果を確認したうえで追加するか、それとも3(現地判断スキルミッシュ)を先に作って即効性のある解決を優先するか、どちらから着手したいか教えてください。

## 実装完了

1・2・3すべて実装しました。

- **共有ヘルパー新設**: `src/extensions/nobility/generators/localDefense.ts`。`estimateLocalDefendingForce(pack, targetBurg, characters)`(cityGarrison + 半径内(cavalry 300 / infantry 100)の連隊)、`commanderPowerMultiplier`、`regimentReinforcementRadius`を集約。battle-resolution.ts側の重複していた同ロジックもここに寄せてimportし直した(重複コード削減)。
- **提案1**: strategic-planner.tsの`baseDefendingForce`を`intel.estimatedMilitaryPower`(国全体推定)から`estimateLocalDefendingForce()`(現地兵力実測)に差し替え。isCorneredによる`baseDefendingForce`割引/非割引ロジックは、そもそも現地兵力ベースになったことで不要になったため削除。
- **提案2**: `FORTIFIED_ATTACK_RATIO = 3` / `FIELD_ATTACK_RATIO = 1.3`を新設し、`citadel || walls`があるburgのみ3倍ルールを適用、それ以外は1.3倍で足りるようにした(isCorneredの2倍掛けは籠城/野戦と独立した「死に物狂い」要素として維持)。
- **提案3**: `src/extensions/nobility/generators/localSkirmish.ts`に`LocalSkirmishGenerator`を新設。`state.diplomacy`が"Enemy"(=正式に開戦済み。これ自体が開戦のトリガーにはならない)の国同士について、150ユニット以内で接触している連隊ペアを毎tick走査し、兵力比が3倍以上(`ANNIHILATION_RATIO`)開いていれば弱い側を即座に殲滅(a=0、勝者側は3%の軽微な損耗)。殲滅された連隊が都市に駐屯していた場合はその都市も(resolveSiege同様に)陥落させる。nobility/index.tsxのtick hookに`StrategicPlanner.advanceTension()`と並べて追加し、どちらかが発生したら`bordersChanged`としてMilitary再生成/再描画をトリガーするようにした。

実際にKautongwuのセーブデータの数値(Al Fara Kautongwu守備隊868 vs Jukrosia 1st Division 58,133、距離約21〜55ユニット、両国とも既にEnemy)で検証すると、提案3のロジックがそのまま次のtickで殲滅・都市陥落を起こす条件を満たしていました。

テストは`localDefense.ts`のロジックを直接検証する`strategic-planner.test.ts`(新規、現地兵力ベースの計算・field/fortified比率の分岐を検証)と`localSkirmish.test.ts`(新規、上記のKautongwu相当シナリオ・射程外での不発・非交戦国での不発を検証)を追加。既存の`battle-resolution.test.ts`(リファクタ後も全パス)を含め、`npx vitest run`は29ファイル276件全てパス。`tsc --noEmit`・`npm run lint`・`npm run madge`・`npm run build`もすべてクリーンです。

## バグを発見2: LocalSkirmishが過剰発火し、新規マップ1年目で全国規模の粛清が起きる

`docs/plan/naval-sea-lanes.md`のPhase 5(実マップ検証)を実施したユーザーから、「海軍侵略は防げたが、陸軍は領内深くの都市がいきなり占領される。小国は自国の軍隊が密集しているのに近衛のいる首都が落とされ続け、近衛も特に兵が減ったり国が滅んだりしていない」という報告。

### 検証

同一シードで新規マップ生成→Nobility有効化→Advance Time 1年を実行すると、**16ヶ国中8ヶ国の首都が1年目で陥落**した。ブラウザのコンソールログを直接確認すると、原因は`resolveSiege()`(tension蓄積型の正式な包囲戦)ではなく`LocalSkirmish.resolve()`だった:

```
⚔️ LOCAL SKIRMISH: Halseara's Halseara Royal Guard annihilated Wargria's isolated 1st Fleet
⚔️ LOCAL SKIRMISH: Halseara's 1st (Feland) Company annihilated Wargria's isolated Wargria Royal Guard (135 troops)
🏆 Sidbury falls with its garrison to Halseara.
⚔️ LOCAL SKIRMISH: Halseara's 1st (Feland) Company annihilated Wargria's isolated 1st (Sidbury) Company (199 troops)
```

念のため、海軍修正着手前のコミット(`8e27f225`)で同一シードを検証したところ**10ヶ国が陥落**しており、この問題は海軍修正が原因ではなく元から存在したバグと確認できた(むしろ海軍修正後は艦隊による無制限越境が2件塞がれ、8ヶ国に減っていた)。

根本原因は`LocalSkirmish.resolve()`の設計そのもの:
- マップ生成時点でランダムに割り当てられる`Enemy`外交ラベルだけで即発火し、`StrategicPlanner`のtension蓄積という本来のペース配分を完全にバイパスする。
- `isCapitalGuard`を特別扱いしておらず、近衛兵団も「孤立した分遣隊」として無条件に殲滅対象になる。
- 勝者側は3%の軽微な損耗だけでループを継続するため、**1つの連隊が同一tick内で敵の複数連隊を連続殲滅**でき、複数都市が一度に陥落する。
- ユーザー報告の「近衛の兵は減っていないのに首都が落ちる」ケースも確認: Extedgiaの首都Northelは近衛ではなく`1st (Northel) Company`という別の野戦軍が同じセルに駐屯しており、そちらが殲滅されたことで陥落していた。

### 修正(実装済み)

`localSkirmish.ts`に4つのゲートを追加:

1. **近衛兵団を対象外に**: `regA.isCapitalGuard || regB.isCapitalGuard`のペアはスキップ。首都防衛は正式な`resolveSiege()`経由のみになる。
2. **1tickあたり1回の戦闘に制限**: `Set<MilitaryRegiment>`で「このtickで既に戦った連隊」を追跡し、勝者・敗者とも同じ`resolve()`呼び出し内では再度戦えないようにした。
3. **「孤立」判定を追加**: 新設`isIsolated()`が、負ける側と同じ国の**他の**連隊が`regimentReinforcementRadius`(localDefense.ts、艦隊は航路距離)以内にいないかを確認。援軍が来られる距離にいれば殲滅は起きない — 元々の設計意図(Al Fara/Kautongwuのような真に孤立した飛地守備隊)に絞り込んだ。
4. **実際の緊張度も条件に**: 新設`hasStrategicTension()`が、`simulationContext.strategicGoals`にどちらかの国から相手への`StrategicGoal`が実在するかを確認。`StrategicGoal`生成(strategic-planner.ts)は既に戦力比・抑止条件を計算済みなので、これを再利用することで「マップ生成時のフレーバーラベルだけ」のペアでは発火しなくなる。

### 検証結果

同一シードで再検証: **1年目の首都陥落は0件**(8件から)。さらにtickを重ねて(63tick、約180年相当)確認したところ、`LocalSkirmish`自体は一度も発火しなかったが、`resolveSiege()`経由の正式な包囲戦(戦力比に応じた攻略成功/撃退)は継続的に発生しており、システムが機能停止したわけではないことを確認した(例: `⚔️ BLOODY SIEGE on Causbury! Force ratio: 0.27` → 撃退、`Force ratio: 2.95` → 陥落、といった正常な力比べが継続)。

`localSkirmish.test.ts`に4件追加(緊張度なしでの不発、近衛の除外、援軍がいる場合の不発、1tick1回制限)。`npx tsc --noEmit`・`npm run lint`・`npm run madge`・`npx vitest run`(全30ファイル312件)・`npm run build`すべてクリーン。

## 追記: `isIsolated()`の削除と復元

上記「実装完了」「バグを発見2」で作り込んだ`isIsolated()`（援軍が到達可能な距離にいれば殲滅を防ぐ保護）は、
その後の日単位tick化（`docs/plan/military-movement.md`、`localSkirmish.ts`の`resolve()`が瞬間annihilateから
毎日の漸進的な損耗ロールへ書き換えられた際）に無警告で失われていた。`docs/plan/military-time-advance-review-findings.md`
§1.4でこれをレビューで発見し、`hasExternalReinforcement()`（クラスター全体を1単位として援軍の有無を判定する形に
一般化）として復元済み。また、深追い（自国領土を追い出した後も敵国領内まで単独追撃し続ける挙動）を防ぐ
`MAX_PURSUIT_DEPTH_MAP_UNITS`リーシュも同時に`regimentMovement.ts`の反応レイヤーへ追加した。接触半径・援軍半径の
具体的な数値（`SKIRMISH_CONTACT_RADIUS`等）は日単位tick化の際に150→20などへ縮小されている点にも注意——本ドキュメント
中盤の「150ユニット以内」といった記述は現在のコードの値とは一致しない。

## 次の課題: 「軍団は動かない」への本格対応

このドキュメント冒頭の「軍隊は何をすべきか、どう動かすべきか」という当初の問いに、ここまでは瞬間移動（`redistributeGarrisons`等での座標書き換え）と即時戦闘解決（LocalSkirmish/resolveSiege）で対応してきたが、実際に**時間をかけて移動する**という概念は今も存在しない。ユーザーから「Advance Time 1年で騎馬隊なら大陸のどこへでも行けてしまう、現実的な移動速度・日単位のtick・陸路のpath finding・部隊の動的な分割/合流・索敵と反応行動が必要」という指摘があり、`docs/plan/military-movement.md`に設計の叩き台を切り出した。次のセッションはそちらから着手する。
