# 軍隊・砦の国境配置（Relations History 連動）

## 課題

これまで軍隊（`src/generators/military-generator.ts`）と砦フラグ（`src/generators/burgs-generator.ts` の `citadel`）は、人口・首都フラグ・純粋な乱数のみで決まっており、`src/generators/states-generator.ts` の `generateDiplomacy()` が生成する外交・戦争史（Relations History）を一切参照していなかった。そのため、軍隊の駐屯地や砦の位置が、周辺国との戦争関係と無関係な場所に現れることがあった（詳細調査の経緯は `docs/debug/military.md` を参照）。

軍隊の兵力算出そのもの（人口ベースの徴兵率、文化・宗教ペナルティ、`alert` による全体スケーリング）は `docs/analytics/population.md` の「3. 軍隊（Military）人数の計算方法」で既に解説されている。本ドキュメントはそれとは別軸の「**配置**（どこに軍隊・砦を置くか）」を Relations History に連動させた変更を扱う。

Dark Fantasy の Danger レイヤー（モンスター）との連動、および兵站（補給線）による兵力上限は、単一国家では対抗できない脅威であるため今回のスコープには含めていない。

「属国の統治（駐屯・貢納）」と「軍隊編成そのものの集約（近衛兵団＋少数の野戦軍への統合）」は、本ドキュメントとは別軸の変更として `docs/plan/military-organization-and-vassalage.md` にまとめている。本ドキュメントは「軍隊・砦をどこに置くか」、そちらは「そもそも何個の部隊がどういう構成で存在するか」を扱う。

---

## 1. 新規モジュール: `src/generators/frontierAnalysis.ts`

軍隊・砦の両方から参照する共有ロジック。読み取り専用で `WorldContext.pack` を解析するだけの Generator 層ユーティリティ。

- **`analyzeFrontiers(pack, currentYear)`**
  各国家について、`cells.c`（隣接セル）を辿って自国の陸地セルが他国の陸地セルと接する「国境セル」を検出し、**隣接国家と陸地塊（`cells.f`）の組み合わせ**でグループ化する。`state.diplomacy` の関係ラベルから脅威度（`Enemy=1, Rival=0.5, Suspicion=0.2`、それ以外は 0）を割り当て、`Ally`/`Neutral` などの非敵対関係は最初から除外する。`state.campaigns` に該当隣国との進行中・直近（15年以内）の戦争があれば脅威度を 2.5 倍にブーストする。結果は `Map<stateId, FrontierSegment[]>`（`{ neighborState, relation, threatWeight, cells, cx, cy, landmass }`）として返る。敵対国境を持たない（平和な）国家は結果に含まれない。
  陸地塊も併せてグループ化しているのは、飛び地（本土と海で隔てられた領土）を持つ国家で、飛び地の連隊が本土側の国境重心へ直線的に引き寄せられて洋上に着地してしまうバグを修正するため（後述）。
- **`getChronicleContestedBurgs(pack)`**
  `pack.states[0].diplomacy`（chronicle、`generateDiplomacy()` が記録する戦争史ログ）を走査し、`ChronicleEvent.fromBurg` / `toBurg`（実際に戦場になった都市）を集める。
- **`pickPrimaryFrontier(x, y, segments)`**
  複数の敵対国境がある場合に、距離と脅威度の両方を考慮してどの国境へ向かうべきかを1つ選ぶ（`score = threatWeight / (1 + dist/1000)`）。
- **`normalizeHabitability(score, meanScore, maxScore)`**
  居住適性スコア（`cells.s`）を集団の平均・最大値に対して 0〜1 に正規化する。

このモジュールは Economy 拡張（食料・穀物などの生産データ）を一切参照しない。理由は次節を参照。

### パイプライン順序と Economy 拡張との関係

`src/main.ts` の生成順序は `States.generate()`（外交・chronicle 生成）→ `Burgs.specify()`（砦決定）→ … → `Military.generate()` → … → `fmg:generate-post-core` イベント発火（ここで初めて Economy 拡張の Goods/Markets/Production が動く）。つまり砦・軍隊の配置決定は外交データ生成後に走るため参照可能だが、Economy 拡張の実際の生産データより**前**に走るため参照できない。

「穀倉地帯」判定には、Economy 拡張の Grain 生産分布式自体が `minHabitability(20) && habitability()` というコアの居住適性スコア（`cells.s`、`rankCells()` で計算済み）に基づいていることを利用し、コアデータだけで同じシグナルを再現している。これにより Economy 拡張の有無に関わらず動作し、パイプライン順序の制約も回避している。

---

## 2. 砦（Citadel）配置への反映 — `burgs-generator.ts`

`specify()` の冒頭で `computeStrategicContext()` を一度だけ計算し（`analyzeFrontiers` + `getChronicleContestedBurgs` + 居住適性の平均・最大値）、各都市の `defineFeatures()` に渡す。

citadel 判定は既存の閾値ロールに**独立した追加ボーナスロール**を足す形にしている（既存ロールをそのまま残すことで、平和な内陸都市の挙動を変えないようにするため）:

```
baseCitadel = capital || (pop > 50 && P(0.75)) || (pop > 15 && P(0.5)) || P(0.1)
strategicBonus = min(frontierBonus + breadbasketBonus, 1) * MAX_STRATEGIC_CITADEL_BONUS  // 0.5
citadel = baseCitadel || (strategicBonus > 0 && P(strategicBonus))
```

- `frontierBonus`: その都市が chronicle に記録された戦場都市なら 1、そうでなければ自国境セルの中にあればその `threatWeight`（0〜1）、なければ 0。
- `breadbasketBonus`: その都市のセルの居住適性スコアを正規化した値（穀倉地帯＝高居住適性の土地ほど防衛価値が高いとみなす）。

---

## 3. 軍隊配置への反映 — `military-generator.ts`

兵力算出ロジック（`platoons` 生成）自体は変更していない。`generate()` の冒頭で `analyzeFrontiers()` を一度計算し、各国家の連隊が形成された**後**に、駐屯地の再配置（Garrison Redistribution）を行う:

```ts
segments = frontiers.get(state.i)
regiments.forEach(r => {
  if (r.n || r.isCapitalGuard) return  // 海軍・近衛兵団は対象外
  localSegments = segments.filter(seg => seg.landmass === cells.f[r.cell])  // 自分と同じ陸地塊の国境だけを見る
  if (!localSegments.length) return
  totalWeight = sum(localSegments.threatWeight)
  target = pickPrimaryFrontier(r.x, r.y, localSegments)
  pull = (target.threatWeight / totalWeight) * GARRISON_PULL_STRENGTH  // 0.5
  r.x += (target.cx - r.x) * pull
  r.y += (target.cy - r.y) * pull
})
```

敵対関係にある隣国がない（平和な）国家は `frontiers.get(state.i)` が `undefined` になり、既存の人口重心配置がそのまま維持される。海軍部隊（`r.n`）は、海を挟んだ国境の検出に `cells.c` の陸地隣接だけでは不十分（海路距離の仕組みが別途必要）なため対象外。近衛兵団（`isCapitalGuard`、`docs/plan/military-organization-and-vassalage.md` 参照）も首都から動かさないため対象外にしている。

### バグ修正: 飛び地の連隊が洋上に着地する問題

当初は国境セグメントを陸地塊で区別していなかったため、飛び地（本土と海で隔てられた領土）に配置された連隊が、本土側の国境重心へ直線的に引き寄せられ、途中の海の上に着地してしまうことがあった。ユーザーが実際にエクスポートした `.map` ファイルを確認して発見。`FrontierSegment` に `landmass`（`cells.f`）フィールドを追加し、`(neighborState, landmass)` の組み合わせでセグメントを分割、連隊は自分と同じ陸地塊にある国境にしか引っ張られないように修正した。同じ陸地塊に敵対国境が無い飛び地の連隊は、今まで通り人口重心の位置に留まる。実マップ4シードで洋上着地ゼロを確認済み。

上記修正後も「たまに」同じ症状（陸軍が洋上に配置される）が再発するとの報告があり、再調査したところ2つ目の原因が見つかった。`FrontierSegment.cx/cy` は当時、国境セル全体の**単純な算術平均**だった。国境が入り江や飛び地の外周を大きく囲むような凹形状の場合、その平均座標が実際にはどの国境セルの位置とも一致しない、水上の1点になり得る（凸包の外に平均が落ちる典型例）。修正として、平均に最も近い**実在の国境セル**へスナップする `getBorderAnchor()` を追加した（`frontierAnalysis.ts`）。

さらに、この修正後もなお別経路で同症状が再現することが実マップで確認された（例: とある属国国家の州都と、その州が接する国境セルが遠く離れており、`redistributeGarrisons` がその間を直線的に按分移動させた結果、両端点はどちらも実在の陸地セルであるにもかかわらず、按分の**途中点**が凹んだ海岸線の外＝海上に落ちた）。両端点が陸地であることを保証しても、その間の直線経路までは保証されない。修正として、按分後の座標を「その国家が実際に所有する、同じ陸地塊の陸地セルの中で最も近いセル」へスナップし直すようにした（`military-generator.ts` の `redistributeGarrisons`、`landCellsByStateAndLandmass` 参照）。これにより連隊の最終位置は常に自国の実在セルの座標と一致する。実マップ8シードでの自動検証（連隊位置と自国最寄り陸地セルとの距離をチェック）でゼロ件、目視でのスクリーンショット確認でも洋上配置ゼロを確認済み。

---

## 4. 動作確認（実マップでの検証結果）

- Rival 関係を持つ国家の連隊が、首都と国境重心のほぼ中間（`GARRISON_PULL_STRENGTH = 0.5` 通り）に移動することを確認。
- 5カ国と敵対するある国家で、国境沿いの都市の砦保有率が内陸都市の 2 倍以上（55.6% vs 25.0%）になることを確認。
- 軍隊レイヤーを表示した状態のスクリーンショットで、連隊アイコンが国境線に沿って集中しているのを目視確認。

---

## 5. 今回のスコープ外（将来課題）

- **Danger レイヤー（モンスター）との連動**: 単一国家では対抗できない脅威のため、軍隊は偵察部隊の配置や撤退準備程度に留まる想定。`FrontierSegment` の仕組みをモンスター勢力にも拡張すれば実現できる余地を残している。
- **兵站（補給線）による兵力上限**: 穀倉地帯・首都からの経路距離に応じて、遠方の国境に配置できる兵力に上限をかける仕組み。`routes-generator.ts`（街道網）を使った経路距離計算が必要になるため、実装の複雑度が上がり次フェーズに先送りしている。
