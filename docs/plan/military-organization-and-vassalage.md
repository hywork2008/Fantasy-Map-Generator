# 軍隊編成の再設計と属国統治

`docs/analytics/military-frontier-repositioning.md` が扱う「軍隊・砦を国境の脅威に応じて配置する」話の延長線上で追加した、**属国の統治（駐屯・貢納）**と**軍隊編成そのものの集約（近衛兵団＋少数の野戦軍）**についてまとめる。前者はどこに置くかの話、こちらは「そもそも何個の部隊が、どういう構成で存在するか」という別軸の変更。

---

## 1. 属国の統治（駐屯・貢納）— `src/generators/vassalage.ts`

### 背景

`Vassal`/`Suzerain` という外交関係ラベルは存在していたが、実際の統治関係（駐屯・貢納）は何も起きていなかった。国がまるごと切り替わる急激な征服ではなく、「宗主国が属国に駐屯し、属国が貢納する」という緩やかな統治関係を先に作ることにした。今回はマップ生成時に一括計算する core 実装のみで、Nobility 拡張のルーラー・intrigue を使った「乗っ取り」は次フェーズ。

### 貢納（Tribute）

`Vassal` である state に対し、`state.tributeRate`（`rand(5,15)/100`、`salesTax`/`pollTax` と同じ乱数レンジ・書式を踏襲）と `state.tributePaid`（`(rural+urban) * populationRate * tributeRate` の穀物換算額）を設定する。Economy 拡張の treasury（金）は使わず、コア人口データだけで完結させている（Economy 拡張なしでも成立させ、treasury ベースの上乗せは将来の追加機能として後乗せする二段構えにするため）。

### 駐屯（Garrison）— 按分による切り出し

当初は宗主国の連隊を**丸ごと1つ**属国へ移す実装にしていたが、ユーザーが実際にマップを再生成して確認したところ次の2つのバグが見つかった:

- 「一番小さい連隊」がたまたま海軍（艦隊）だと、そのまま属国の首都（陸地）座標に移されてしまう
- 宗主国の連隊数が少ないと、丸ごと引き抜かれて母国の防衛が0になる

修正として、連隊を丸ごと引き抜くのをやめ、**非海軍の連隊全体から一定割合だけ按分して切り出し**、新しい駐屯専用の連隊を生成する方式に変更した:

- `GARRISON_SHARE_PER_VASSAL = 0.15`（1属国あたり最大15%）
- `MAX_TOTAL_GARRISON_SHARE = 0.5`（宗主国全体で最大50%、複数属国がいても母国の兵力は必ず半分以上残る）
- `MIN_GARRISON_TROOPS = 5`（按分結果がこれ未満なら駐屯連隊を作らない＝無理に兵を捻出しない）

按分の基準値（`troopsToDetach`）は宗主国の**元々の**陸上兵力合計から計算し、実際に切り出す割合（`fraction`）はその都度の**現在の**残存兵力に対して再計算する。こうしないと、2人目以降の属国への割り当てが「既に減った後の兵力の15%」になり、意図した絶対量より少なくなってしまう（実装中にテストの数値が合わず、この非線形な目減りに気づいて修正した）。

さらに、按分対象の連隊リストから**既に他の属国に駐屯済みの連隊**（`garrisonHost` が設定済み）と**近衛兵団**（`isCapitalGuard`、後述）を除外している。前者を除外しないと、2番目の属国への割り当て計算で1番目の属国に送った駐屯連隊自体が母国兵力としてカウントされ、二重に削られてしまうバグがあった（これもテストで発覚）。後者は「近衛兵団はルーラーの直属兵で、どれだけ他の軍が大きくても属国駐屯には出さない」という設計判断。

### スコープ外（次フェーズ）

- Nobility 拡張のルーラー `intrigue`/`personality` と `affinities` を使った、脅し・スパイの暗闘による Vassal/Suzerain の差し替え（乗っ取り）
- Economy 拡張の treasury（金）を使った貢納の上乗せ
- tick 駆動での再評価（`advanceTime()` との連動）

---

## 2. 軍隊編成の集約 — 近衛兵団と野戦軍

### 背景

以前の実装（`docs/analytics/military-frontier-repositioning.md` の時点）では、軍隊は人口ベースでセル/都市ごとに大量の `Platoon` を生成し、d3 quadtree で近接クラスタリングして `3 * populationRate` 程度のサイズを目安に統合していた。国家の州（province）数が多いと最終的な連隊数が5〜10個に増え、しかも地理的近さだけで統合されるため「どの方面も同じくらいの厚さ」になりがちで、前線に兵力が集中しないという問題があった。ユーザーからの要望は次の通り:

- 王や皇帝は首都に近衛兵団を持つ。首都が脅威にさらされていなければ普通サイズ、脅威が高いほど厚くする
- 国家は州（Province）ごとに兵団を持たせるが、前線でない（周囲が自国領の）州の兵団は解体し、敵国に近い方面へ再配置する
- 都市ごとの衛兵は不採用（アイコンが増えすぎるため）
- 1国家あたり近衛兵団1＋野戦軍を少数に集約し、どの方面も手薄にならないようにする（当初の目安は野戦軍1〜2個だったが、`MAX_FIELD_ARMIES` は後の `refactor: increase MAX_FIELD_ARMIES...` コミットで9まで引き上げられている。州単位の粒度をなるべく保つための調整で、以下の「検証結果」の連隊数もそれに合わせて読み替えること）
- 小隊・中隊・大隊・師団・旅団のような編成階級を、規模に応じた表示名として使う
- 臆病で猜疑心の強い君主（Nobility 拡張）は、近衛兵団を自国の他のどの部隊よりも必ず多くする

### 調査で判明した制約

- `Province.rural`/`urban`/`burgs` は `Military.generate()` 実行時点では未計算（`Provinces.collectStatistics()` は編集画面からしか呼ばれない）。そのため、州の人口集計モジュールを新たに呼び出すのではなく、既存のルーラル/都市ループで `cells.province[cell]` をそのまま `Platoon.province` としてタグ付けする形にした。
- `cells.province` は0（州なし）になりうる（burg数2未満の国家）。
- Nobility 拡張の `Characters.generate()` は `Military.generate()` より**後**（`fmg:generate-post-core` イベント経由）に実行される。そのため、ルーラーの性格による近衛兵団の増強は、core の軍隊生成の中では判定できず、Nobility 拡張側で事後的に上書きする形になる。

### `frontierAnalysis.ts` の拡張 — `getProvinceThreats()`

既存の `FrontierSegment`（国境セグメント）を、州ごとにグルーピングし直す関数を追加した:

```ts
getProvinceThreats(pack, segments): Map<provinceId, { totalWeight, primaryNeighbor }>
```

セグメントが触れるセルの `cells.province` を集計し、州ごとに脅威度を合算しつつ、最も脅威度が高い `neighborState` を `primaryNeighbor` として記録する。実装時、最初は「セグメントが触れる**セルの数だけ**脅威度を加算する」実装にしてしまい、国境の長さが長い州ほど脅威度が水増しされるバグがあった（テストの期待値と実際の計算結果が合わず発覚）。修正として、1つのセグメントにつき、それが触れる州ごとに**1回だけ**脅威度を加算するようにした（国境の長さではなく、関係の深刻さだけを反映する）。

### 連隊生成の全面差し替え — `military-generator.ts`

兵力算出ロジック（ルーラル/都市ループ、文化・宗教・大陸ペナルティ）自体は変更していない。変更したのは `Platoon` を集めてから連隊化する部分:

1. **首都の分離**: 首都のセルから生まれた `Platoon` は州のプールに混ぜず、別枠の「近衛候補プール」に集める。
2. **州ごとのプール化**: 残りの陸上 `Platoon` を `province`（0なら国家全体をひとまとめの疑似州として扱う）ごとに合算する。
3. **前線判定と統合**: `getProvinceThreats()` で得た州ごとの `primaryNeighbor` でグルーピングし、隣国ごとに1個の野戦軍バケットを作る。前線に接しない州は「予備プール」に合算し、最終的に残った野戦軍バケットへ脅威度比で按分して合流させる。
   - 野戦軍バケットが `MAX_FIELD_ARMIES` を超える場合、脅威度合計が低いバケットから順に、最も強いバケットへ吸収合併する（この値は当初2だったが、州単位の粒度を保つため後に9へ引き上げ済み — `src/generators/military-generator.ts` 参照）。
   - 敵対国境が1つも無い（完全に平和な）国家は、予備プール全体を1個の野戦軍としてまとめる。
4. **近衛兵団**: 近衛候補プールから1個の専属連隊（`isCapitalGuard: true`）を作る。首都の州自体が前線（`getProvinceThreats` で脅威度あり）なら `1 + threatWeight * CAPITAL_GUARD_THREAT_MULTIPLIER`（0.5）倍のボーナスを掛け、脅威がなければ等倍（普通サイズ）のまま。
5. **海軍**: 全ての海軍 `Platoon` を1個の艦隊（Fleet）に統合。
6. **命名**: `isCapitalGuard` なら `"{国名} Royal Guard"`、それ以外は最終兵力規模（`populationRate` 倍数の閾値）に応じて Company → Battalion → Brigade → Division の呼称を使う。

`redistributeGarrisons`（既存の国境への引き寄せ）は、統合後の野戦軍が既に前線州の代表地点（州都 or 州の中心セル）に配置されている前提なので、実質的には位置の微調整（州の代表地点→実際の国境線）程度の役割になった。`isCapitalGuard` の連隊はこの引き寄せの対象からも除外している（近衛兵団は首都から動かさない）。

### Nobility 拡張との連携 — `capitalGuardModifier.ts`

`src/extensions/nobility/generators/diplomacy-modifier.ts`（`applyAffinitiesToDiplomacy`、既に `state.diplomacy` を直接書き換えている）と全く同じパターンで、新規 `capitalGuardModifier.ts` の `applyPersonalityToCapitalGuard()` が `state.military` を直接書き換える。

「臆病で猜疑心が強い」の判定は、`CharacterPersonality` に猜疑心（paranoia）に相当するパラメータが存在しないため、`boldness < 30 && confidence < 30` を暫定のプロキシとして採用（ユーザー承認済み、将来 `paranoia` パラメータが追加されたらこの判定関数だけ差し替える想定）。該当する場合、近衛兵団の兵力を自国の他のどの連隊よりも1多い値まで引き上げる。

`Characters.generate()` は3箇所（`fmg:generate-post-core` ハンドラ、"Regenerate Characters" ツールアクション、拡張有効化サブスクライバ）から呼ばれるため、`applyPersonalityToCapitalGuard()` もこの3箇所全てに追加した（1箇所でも漏らすと、手動でキャラクターを再生成した後に近衛兵団の増強が反映されなくなる）。

### 実装中に発見したレンダリングバグ

`vassalage.ts` が生成する属国駐屯連隊に `icon` フィールドが設定されておらず、軍隊レイヤーを表示すると `draw-military.ts` の描画コード（`d.icon!.startsWith(...)`）が**クラッシュする**バグを、実際にレイヤーを表示してスクリーンショットを撮った際に発見した。ユニットテストは SVG 描画を通さないため検出できず、直前のセッションの `window.fmg.world.pack` 経由のデータ検証だけでも見逃していた。固定の `"🛡️"` アイコンを設定して修正。**教訓: ジェネレータの変更を検証する際は、既存レンダラーが新しいデータ形状を描画できるか、実際にレイヤーを表示してスクリーンショットを撮るところまで確認する。**

### 検証結果

- 実マップ生成（複数seed）で、全国家の陸上連隊数が近衛兵団＋野戦軍（当時の上限で最大2個、合計**最大3個**）に収まっていることを確認 — 上限は後に`MAX_FIELD_ARMIES = 9`へ引き上げられているため、現行コードでの連隊数上限はこの記述より大きい
- 内陸州の兵が前線の野戦軍に合流し、単独の州だけでは説明できない兵力になっていることを確認
- 軍隊レイヤーのスクリーンショットで、連隊アイコンの数が修正前（数十個）から大幅に減少していることを目視確認

---

## 3. 今後の課題

- Nobility 拡張のルーラー `intrigue`/`personality` と `affinities` を使った、属国の乗っ取り（脅し・スパイの暗闘）
- Economy 拡張の treasury（金）を使った貢納の上乗せ
- `CharacterPersonality` への `paranoia`（猜疑心）パラメータの追加、および `capitalGuardModifier.ts` の判定ロジックの差し替え
- 兵站（補給線）による野戦軍の兵力上限（`docs/analytics/military-frontier-repositioning.md` からの持ち越し課題）
- ~~連隊を率いる武官（Commander/Admiral）と、辺境州の領主（Margrave等）の生成~~ → 実装済み。詳細は `docs/plan/char.md` と `src/extensions/nobility/generators/officerAssignment.ts` / `provinceLordGenerator.ts` を参照。`strategic-planner.ts`（AIの侵攻計画判定）の戦力見積もりはまだ武官ボーナスを見ていない点は未解消— `battle-resolution.ts` の実戦闘解決だけが対応済み。
- ~~**部隊編成の階層化・動的な分割/合流**（引き継ぎ、未着手）~~ → 実装済み。`docs/plan/military-movement.md` Phase 4で、`useOptionsState().militaryHierarchy`が`"dynamic"`のときのみ、複数方面の脅威を検知した野戦軍が`~150`兵の分遣隊（`parentId`付き）を分離し、用が済めば親へ合流する仕組みが入った。デフォルトの`"simple"`では本ドキュメントの「州単位プール化＋`MAX_FIELD_ARMIES = 9`固定編成」のまま変わらない。
