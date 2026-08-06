# Enclosure スコアのゲームプレイ応用 — 調査・検証ログ

| 項目 | 内容 |
| :--- | :--- |
| Status | Design discussion — 実装なし。2案を検証済み、着手判断待ち |
| Parent | なし(独立した調査) |
| Related | [ships.md](ships.md), [shipbuilding.md](shipbuilding.md), [harbor-siting.md](harbor-siting.md)(Elevation/Depthによる別軸の立地条件) |
| Scope | `pack.cells.enclosure`(水セルの囲まれ度スコア)をレンダリング以外のゲームプレイ機構に転用できるか検証する |

## 1. 背景

`calculateEnclosure()`(`src/generators/features.ts:324-362`)が算出する`pack.cells.enclosure`は、
現状ヒートマップ描画専用のデバッグ値(`src/types/PackedGraph.ts:42-43`に"Debug-only"と明記)であり、
人口・経済・造船などどのゲームプレイ系コードからも参照されていない。本セッションでは、この値を実際の
都市/施設補正に転用する2案を検討した。

### 1.1 enclosureの実装詳細

- 水セルのみ対象(陸セルは常に0)。各水セルから水セルのみを辿るBFSを`ENCLOSURE_BFS_RADIUS = 6`ホップまで
  展開し、`blocked/total`(陸に当たった隣接探索の割合)を0〜100にスケールする(`features.ts:358`)。
  0 = 外洋、100 = 完全に閉じた湾/内海。
- `ENCLOSURE_AREA_LIMIT_RATIO`(`features.ts:43`)により、面積が中央値の3倍を超える巨大深海セルは
  スキップされ0のまま据え置かれる(コミット`33162167`で追加。グリッド解像度起因の誤った陸地閉塞判定を防止)。
- 消費先はレンダリング関連ファイルのみ(`enclosureRenderer.ts`、`hybridLayerPolicy.ts`、
  `buildDeckLayers.ts`ほかWebGL配線一式)。`docs/simulation/`・`docs/analytics/`のいずれにも
  enclosure・navigation・training・wave roughnessに関する既存の設計メモは存在しない。

## 2. 史実の参照 — 航海訓練の段階性

検討の出発点として、史実の航海訓練が「いきなり外海」から始まらないことを確認した。地中海の沿岸伝統
(cabotage)、ポリネシアのウェイファインディング(師匠の下で近距離の穏やかな航路から段階的に外洋へ)、
大航海時代ヨーロッパの沿岸貿易船からのキャリアパスなど、いずれも「静穏な水域→段階的に荒い水域」という
訓練progressionが共通していた。この史実パターンをenclosureスコア(静穏度の代理指標)に対応付けられないか、
という着想が2案の出発点になった。

## 3. 案A: 「航海メッカ」都市 — 人口・商業補正(検証結果: 条件付きで妥当)

### 3.1 提案内容

enclosureの低い(荒い外海に面した)都市が「航海術のメッカ」として優秀な航海士を惹きつけ、
バイオーム/資源制約以上の人口成長補正と商業発展補正を得る、というアイデア。

### 3.2 既存アーキテクチャとの整合性チェック

| 観点 | 結果 |
| :--- | :--- |
| enclosureの都市への集約 | **未整備。** 水セル単位のデータを burg に紐付ける集約ロジックが新規に必要(既存コードに前例なし) |
| 「バイオーム制約を超える人口成長」 | **現行モデルと不整合。** `simulateDemographics()`(`src/generators/demography-simulator.ts`)は`capacity`をハードキャップ(K)として扱い、超過時は出生停止→飢餓縮小に向かう。バイオーム/資源の制約自体が`capacity`の入力の一部であり、それを"超える"独立した仕組みは存在しない。実装可能なのは`capital *= 1.5`と同列の乗算項を`capacity`計算式に足すことのみ |
| 商業補正 | 既存の`Good.multipliers.cultureType`(Naval文化圏に既に+1.4倍などが設定済み)や`CAPITAL_MULTIPLIER`パターンを踏襲すれば実装自体は可能 |
| 資格判定の前例 | `computeShipyardCandidates()`(`shipyardCandidates.ts`)の「派生フラグを都市データに書き戻さず都度算出する」パターンが最も近いテンプレート |

### 3.3 結論

コンセプトは妥当だが、以下2点のフレーミング修正が必要:

1. 「バイオーム/資源制約を超える」ではなく「capital/connectivityと並ぶ、もう一つの乗算補正項が加わる」と
   位置づけるべき(既存モデルに天井破りの概念がないため)。
2. enclosureが低いというだけの条件だと、外洋沿いの都市全部が候補になりインフレする。史実の段階的訓練に
   則り、**「穏やかな内海/湾から外洋まで段階的に繋がる勾配がその都市の近傍に存在すること」**を資格条件に
   すると、史実との整合性も取れ、希少性も担保できる。

集約ロジックが新規に必要な分、実装コストは案Bより高い。

## 4. 案B: enclosureを造船所(shipyard)の適地補正に使う(検証結果: 妥当性が高い、推奨)

### 4.1 提案内容

enclosureが高い(静穏な湾・入江)立地を造船所の適性/容量補正に使う。

### 4.2 既存アーキテクチャとの整合性チェック

| 観点 | 結果 |
| :--- | :--- |
| データ参照方法 | `computeShipyardCandidates()`が既に`pack.cells.haven[burg.cell]`(burg隣接水セル1つ)を直接参照している(`shipyardCandidates.ts:46`)。`pack.cells.enclosure[haven]`も同一パターンの1セル参照で取得可能。**近傍集約や勾配計算は不要**(案Aとの最大の違い) |
| 補正の挿入点 | `computeBurgPortCapacity()`(`portCapacity.ts:46-68`)が既に`pack.cells.harbor[burg.cell]`から`harborFactor`を算出し、`capital`/`citadel`と同列の乗算チェーンに組み込んでいる。enclosureも同じ関数に追加するだけで済む |
| 意味的妥当性 | 造船所は嵐・高波から船体・進水作業を守るため、史実でも湾/入江/フィヨルドのような遮蔽水域が好まれる(例: チェサピーク湾、クライド湾)。enclosureは`ENCLOSURE_BFS_RADIUS=6`の広域フラッドフィルで水域全体の静穏さを測るため、`cells.harbor`(隣接セルの陸地数のみを見る近距離指標)より広いスケールの補完指標として機能する |
| 候補判定(candidates)との整合 | `computeShipyardCandidates()`は`haven`セルの`feature.type === "ocean"`を要求し湖を除外済み(`shipyardCandidates.ts:44-47`)。enclosureは外洋沿いの湾・フィヨルドでも高スコアになり得るため、**候補判定(gate)には使わず、容量(capacity)側の補正にとどめる**べき。候補判定に混ぜると外洋直面の妥当な候補まで排除しかねない |

### 4.3 未解決の論点

1. **`cells.harbor`との役割分担。** 両方とも「遮蔽度」を測る指標であり、単純に両方掛け合わせると二重計上
   になり得る。案:
   - `harborFactor`(近距離・進入路の狭さ)は現状維持し、enclosure(広域・水域全体の静穏さ)は
     `LARGE_MIN_HARBOR_FACTOR`ゲートの代替/追加条件として使う。大型ドックほど広い静穏水域を必要とする、
     という史実傾向とも一致する。
   - あるいは`harborFactor`の計算式自体に`enclosure`を按分マージする。
2. **型コメントの更新。** `pack.cells.enclosure`の"Debug-only"注記(`PackedGraph.ts:42-43`)をゲームプレイ
   利用に合わせて更新する必要がある(新規APIは不要 — `getWorldContext()`経由で`pack`全体に既にアクセス可能)。

### 4.4 推奨実装方針

`computeBurgPortCapacity()`に`enclosureFactor = pack.cells.enclosure[haven] / 100`相当を追加し、
`large`ティア解禁条件(`LARGE_MIN_HARBOR_FACTOR`)にenclosureを絡める形が、既存アーキテクチャへの侵襲が
最小で史実的にも筋が通る。

## 5. まとめ

| 案 | 実装コスト | 妥当性 | 備考 |
| :--- | :--- | :--- | :--- |
| A: 航海メッカ都市補正 | 高(新規集約ロジックが必要) | 条件付きで妥当 | フレーミング修正 + 勾配ベースの資格条件が必要 |
| B: 造船所のenclosure補正 | 低(既存パターンの純粋な拡張) | 高い | `harbor`との重複整理のみが課題。**着手するなら案Bを先に推奨** |

## 6. 次のステップ

- 案Bを実装する場合: `portCapacity.ts`の`computeBurgPortCapacity()`にenclosure項を追加し、
  `harborFactor`との合成式(加算平均 or `large`ゲート限定利用)を決定する。
- 案Aを実装する場合: まず水セル→burg近傍勾配の集約ロジックの設計(半径・しきい値・対象を
  shipbuilding/新規拡張のどちらに置くか)を詰める。
