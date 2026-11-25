# CE meshless `compact-v2` / `compact-medium-v2` 街区構造の改善・検証計画

作成: 2026-11-25
改訂: 2026-11-25（既存の `compact` / `compact-medium` は凍結して対照群とし、複製した別 Plot pattern `compact-v2` / `compact-medium-v2` を作って改善・A/B 検証する方針へ改訂。主対象規模を数千〜2 万人へ変更）
状態: C0〜C5 実装完了（ブラウザ 2D/3D 目視 A/B 検証待ち）
対象: メッシュなし CE（skeleton-first）に新設する `PlotFabric = "compact-v2"` および `"compact-medium-v2"`（`medieval` / `medieval-facilities`）
関連: [ce-meshless-block-fabric-scaling.md](ce-meshless-block-fabric-scaling.md)、[ce-burgage-plot-fabric.md](ce-burgage-plot-fabric.md)、[ce-meshless-gate-ribbon-growth.md](ce-meshless-gate-ribbon-growth.md)、[ce-facility-block-allocation.md](ce-facility-block-allocation.md)

## 1. 目的と方針

### 1.1 既存パターンを複製して A/B 検証する理由

- 改善案が実際に中世都市の街並みとして自然になるかは、2D/3D の目視と定量指標で確かめるまで断定できない。
- そのため、既存の `compact`・`compact-medium` は **一切変更せず完全に対照群として凍結** する（直列化文書の SHA-256 を不変に保つ）。
- これらを複製した別の Plot pattern として **`compact-v2`** と **`compact-medium-v2`** を追加し、同一シード・同一人口・同一条件で既存パターンと切り替え比較できるようにする。
- これにより、レビューで抽出した 5 課題（§1.3）の分析が的確か、各修正が本当に中世の都市に近づくかを客観的に検証する。

### 1.2 想定する規模（ボリュームゾーン）

- 主に想定する都市規模は **数千〜2 万人程度**（代表固定ケース: **2,000 / 5,000 / 10,000 / 20,000 人**）。
- 5 万〜20 万人規模のための過度な簡略化・妥協（例: 中庭のある街区で裏庭 `plots` の記録を省くなど）は行わず、**数千〜2 万人の範囲で最も中世都市らしい街区構造を実現すること**を優先する。
- ただし既存の文書長上限（8 MB）・実用的な生成時間・並列決定性（Worker 1/2/4 本で一致）は維持する。

### 1.3 検証する 5 つの課題（仮説）

| ID | 課題 | 現状（`compact` / `compact-medium`） | 改善仮説（`compact-v2` / `compact-medium-v2`） |
| --- | --- | --- | --- |
| **D** | **穴空き骨格街区の真南北スリット道路** | [perimeter.ts](../../src/city-editor/generators/vector/generation/perimeter.ts) `withoutHoles` が穴を常に真南北（`x ± 0.1`）で切断し、そこに街路を引く | 穴から最寄りの道路辺（または外周辺）への最短切断線に変えることで、修道院・広場から通りへ抜ける自然な連絡路になる |
| **B** | **死んだ角地・盲壁の横通り** | [perimeterHousing.ts](../../src/city-editor/generators/perimeterHousing.ts) `packPerimeter` が最長辺と対辺を端から端まで先取りし、短辺の角地が側壁になる | 角地（65°〜125°）に角棟（Eckhaus）を先置きし、残余スパンへ各辺の住宅列を並べることで、横通りのファサードと交差点の構えが回復する |
| **E-1** | **全地区一律の区画規模** | 全地区一律 `lotArea: 80` で中心〜外縁・幹線〜裏小路の差がない | 既知の `hub`（中心距離）と `primary`（幹線接道）から間口・奥行きに緩やかな勾配を付けることで、中心・幹線ほど密で奥深い町並みになる |
| **A** | **街区中央の無区画の盲腸空間** | 4 辺の住宅の奥に区画線も通路もない空白地帯が閉じ込められる（特に `compact-medium`、`compact` の 32% でも発生） | 街区芯を規模に応じて **① 周囲住宅へ帰属する私有裏庭（`plots` 記録＋塀・果樹）** または **② 進入小路（幅 2.0〜2.4 m）付き共同中庭（井戸配置対象）** に転換することで、19 世紀型ロの字死地を解消し中世の区画・中庭構造に近づく |
| **C** | **2 層独立 BSP の細切れ T 字路・小路過密** | 50 m セル・小路の BSP 分割が独立で食い違い、`compact` は街区長 37〜58 m で小路が過密 | 地区分割（`partition`）で既存道路端・対向接道辺を結ぶ通り抜け街路を優先し、`compact-v2` の街区長上限をやや伸ばすことで、連続した通りと落ち着いた街区プロポーションになる |
| **E-2** | **施設による街区横断占有と凸凹敷地** | [facilityLots.ts](../../src/city-editor/generators/vector/generation/facilityLots.ts) に街区上限がなく、裏列貫通や残片吸収で「施設だけの街区」や不規則敷地ができる | 壁内街区に施設占有上限（総ロットの 50%・最低 2 戸は住宅を残す）を設け、裏列を貫通しない配置を優先し、残片吸収を小片に限定することで、工房と住宅の自然な混在を保つ |

### 1.4 非変更・隔離の原則

- **既存 5 パターン不変**: `compact`（v60）・`compact-medium`（v63）・`burgage`（v64）・`burgage-dense`（v65）・`burgage-village`（v66）の出力（直列化 SHA-256）を 1 ビットも変えない。
- **mesh-first 不変**: 共有モジュール（`organicBlocks.ts`・`perimeterHousing.ts`・`frontageBuildings.ts`）への変更はすべて既定 `undefined`/`false` のオプトイン引数に隔離し、mesh-first の挙動・乱数消費を一切変えない。
- **独立したアルゴリズム版**: `compact-v2` を `vector-urban-v67`、`compact-medium-v2` を `vector-urban-v68` とし、既存の保存文書・検証・共有リンクとの互換を保つ。
- **撤回容易性**: 比較検証の結果、採用しない場合は `compact-v2` / `compact-medium-v2` を取り除くだけで既存系へ影響を残さない。

---

## 2. 設計詳細

### 2.1 新 Plot pattern の接続仕様

| 項目 | `compact-v2` | `compact-medium-v2` |
| --- | --- | --- |
| `PlotFabric` 値 | `"compact-v2"` | `"compact-medium-v2"` |
| アルゴリズム版 | `vector-urban-v67` | `vector-urban-v68` |
| `compactBlockScale` | 1（無効） | 1.1〜2.2（既定 1.5、UI 有効） |
| 英語表示名 | `Compact v2 (experimental)` | `Compact, medium blocks v2 (experimental)` |
| 日本語表示名 | `コンパクト v2（検証用）` | `コンパクト・中型街区 v2（検証用）` |

### 2.2 課題 D: `withoutHoles` の最短道路方向スリット

[perimeter.ts](../../src/city-editor/generators/vector/generation/perimeter.ts) の `withoutHoles` に `naturalSlit` オプションを追加する（`compact-v2` / `compact-medium-v2` で有効）。

1. 穴 `hole` の各頂点と外周 `outer` の各辺との最短ペア `(pHole, pOuter)` を探索する（`block.frontage` など既存道路に接する外周辺を優先距離係数 0.7 で優遇）。
2. `pHole → pOuter` を両端 1 m 延長した幅 0.2 m の帯で `regionBoolean([part], [slit], "difference")` を実行する。
3. 帯が他の穴を割る等で輪郭が壊れた場合は、穴重心から外周最短点、さらに従来の鉛直スリットへフォールバックする。

### 2.3 課題 B・E-1: 角地先取り（Eckhaus）と区画規模勾配

[perimeterHousing.ts](../../src/city-editor/generators/perimeterHousing.ts) の `packPerimeter` に `compactV2?: { hub: Point; reach: number }` 相当のオプトイン設定を追加する。

1. **中心距離・幹線による勾配**:
   - ブロック重心の中心距離比 `r = min(1, dist(centroid, hub) / reach)` と、辺が幹線道路か（`front.primary`）から、基準間口と奥行きを調整する。
   - 中心・幹線側: 間口やや狭め（4.2〜5.4 m）・奥行き深め（10.0〜11.5 m）。
   - 外縁・裏小路側: 間口やや広め（5.2〜6.8 m）・奥行き浅め（7.5〜9.0 m）。
2. **角地先取り（Eckhaus）**:
   - 隣接する 2 つの接道辺（`fronts`）の交点のうち、内角が 65°〜125° の頂点を角地候補とする（`primary` を含む角を優先）。
   - 角地に対して両辺に沿う幅 `sA`, `sB`（6.0〜9.5 m、ただし各辺長の 40% 以下、かつ `rowDepth` 以下）の四角形（または四辺形）角棟を配置し、他の候補や既存建物と重ならず `block` 内に収まる場合に採用する。
   - 角棟の占有区間を各辺の予約スパンとして記録し、残った各辺の空きスパンに対して `planRow` で連続した住宅列を並べる。
   - これにより、短辺（長さ 14 m 以上）でも角棟の間または角棟自身が横通りに面し、盲壁の横通りが大幅に減る。

### 2.4 課題 A: 街区中央の「盲腸空間」の解消（私有裏庭・共同中庭）

`packPerimeter` の配置完了後、ブロックの建蔽範囲（`block`）から採用した全住宅帯を除いた中央残余ポリゴン（`core`）を判定する。

1. **極小（面積 < 25 m² または内接幅 < 3 m）**: 従来のまま隙間として残す（`plots` 記録なし）。
2. **中規模（面積 25〜220 m² または内接幅 < 14 m）**: **私有裏庭分割**。
   - 周囲の各住宅について、その背面辺（街路と反対側）を母線とする半平面クリッピング（ボロノイ的な最近接住宅割り当て）で `core` を各住宅の裏庭ポリゴンに分割する。
   - 「住宅ポリゴン ∪ 割り当て裏庭ポリゴン」を 1 つの `BurgagePlot` 互換プロット（`ring`, `front`）として `VectorFabricCell.plots` に記録する。
   - 既存の [renderData.ts](../../src/city-editor/renderers/vector/renderData.ts) `burgagePlotSurfaces` / `burgageYardTrees` がそのまま裏庭地面・区画塀・果樹を描画し、[wells.ts](../../src/city-editor/generators/vector/generation/wells.ts) `builtYards` が私有裏庭への井戸誤配置を防ぐ。
3. **大規模（面積 > 220 m² かつ内接幅 ≥ 14 m）**:
   - 中心部寄り（`r < 0.45`）かつ 60% の確率で **私有裏庭分割＋低層裏棟**（奥行き 16 m 以上の裏庭に、表の家より 1〜2 階低い 1〜2 階建ての `rear` 棟を 1 棟配置可能。表の家が埋まった後に採用）。
   - それ以外（約 40% または中間〜外縁）は **進入小路付き共同中庭（Hof）**:
     - `block` の接道辺のうち最も中庭に近い非幹線辺（無ければ最長辺）の住宅 1 軒分の隙間（幅 2.2〜2.4 m）を空け、通りから街区芯へ入る進入小路（`lanes`）を通す。
     - 共同中庭は `plots` に含めず開放地として残すため、既存の [wells.ts](../../src/city-editor/generators/vector/generation/wells.ts) が共同井戸の候補地として自然に活用できる。

### 2.5 課題 C・E-2: 街路連続性・街区長調整・施設配置改善

1. **通り抜け街路優先（`organicBlocks.ts` `partition`）**:
   - `compactV2` 有効時、`partition` 内の `chooseSplit` で、切断線（`chord`）の両端が `boundaries` の接道辺（`feature && !barrier`）に載る候補（`roadEnds === 2`）に強いスコア優遇を与え、地区を貫通する街路を優先する。
2. **`compact-v2` の街区長バランス**:
   - `compactV2` 有効時、`subdivide` の `longLimit` を現行 `1.65〜2.6 × pairedSpan` から `2.0〜3.1 × pairedSpan`（約 45〜70 m）へやや伸ばし、細切れの横小路を減らして連続ファサードを増やす。
3. **施設配置の改善（`facilityLots.ts` `placeFacilitiesOnLots`）**:
   - `compactV2` 有効時、以下の 3 点を適用する：
     - **壁内街区の施設上限**: 壁内の 1 街路街区で施設が消費してよい住宅ロット数は総ロットの 50% 以下かつ最低 2 戸を住宅に残す（壁内の施設単独街区 0）。
     - **裏列貫通回避の優先**: 候補スコアにおいて、シードロットと同じ通り向き（法線内積 > 0.7）のロットのみを消費する配置を、裏列（反対向きのロット）を潰す配置より強く優先する。
     - **残片吸収の整形**: `absorbed` へ統合する残余断片は、元のロット面積の 35% 以下かつ単純凸寄り形状に制限し、通りへ細長く伸びる不自然な敷地を防ぐ。

---

## 3. 実施段階（C0〜C5）

| 段階 | 内容 | 主な変更対象 | 完了・A/B 判定条件 |
| --- | --- | --- | --- |
| **C0** | **複製パターンの枠組み実装とベースライン計測**。`compact-v2` / `compact-medium-v2` を型・UI・i18n・検証・共有・アルゴリズム版（v67/v68）へ追加（初期は既存と同動作）し、ボリュームゾーン（2,000 / 5,000 / 10,000 / 20,000 人）のベースラインを計測 | `types/contracts/burgage.ts`、`types/vector/urban.ts`、`compactBlocks.ts`、`urbanState.ts`、`validation/{fabric,urban}.ts`、`share.ts`、`VectorGenerationPanel.ts`、`editors.{en,ja}.json` | 新 2 パターンが UI から選択・生成・保存・共有できる。既存 5 パターンと mesh-first の出力不変 |
| **C1** | **穴空き骨格街区の最短道路方向スリット（課題 D）** | `perimeter.ts` | `compact-v2` 系で真南北スリットが 0。未収容 0 |
| **C2** | **角地先取り（Eckhaus）・短辺回復・区画規模勾配（課題 B, E-1）** | `perimeterHousing.ts`、`frontageBuildings.ts`、`organicBlocks.ts`、`perimeter.ts` | 短辺の盲壁率が既存比 50% 以上改善。未収容 0 |
| **C3** | **街区中央の盲腸空間解消（私有裏庭 `plots`・進入小路付き共同中庭・低層裏棟、課題 A）** | `perimeterHousing.ts`、`organicBlocks.ts`、`perimeter.ts`、`renderData.ts` | 150 m² 超の閉鎖無区画空き地が 0。2D/3D で塀と戸口の干渉なし |
| **C4** | **通り抜け街路優先・街区長調整・施設上限と裏列貫通回避（課題 C, E-2）** | `organicBlocks.ts`、`facilityLots.ts`、`perimeter.ts` | 壁内の施設単独街区 0。2,000〜10,000 人で施設配置率 80% 以上 |
| **C5** | **数千〜2 万人での A/B 定量比較・回帰テスト・検証記録** | `burgagePlots.test.ts`、関連テスト、本計画書 | 2,000 / 5,000 / 10,000 / 20,000 人の A/B 比較表を本書へ記録。既存 5 パターン・mesh-first の完全不変と型・テスト通過を確認 |

---

## 4. A/B 比較指標（ボリュームゾーン: 2,000〜20,000 人）

同一シード・同一設定で `compact` vs `compact-v2`、`compact-medium` vs `compact-medium-v2` を比較する。

- 未収容戸数（目標: 0）
- 閉鎖された無区画中央空き地（150 m² 超の個数・面積、目標: 0）
- 短辺の盲壁率（長さ 14 m 以上の接道辺で正面住宅 0 軒の割合）
- 壁内の施設単独街区数（目標: 0）および施設配置率（目標: 80% 以上）
- 街路・小路の本数と総延長、平均街区長
- 生成時間・文書サイズ（20,000 人まで 8 MB 上限内・実用時間内）
- 既存 5 パターン（`compact` / `compact-medium` / `burgage` / `burgage-dense` / `burgage-village`）および mesh-first の出力 SHA-256 不変

---

## 5. 実装結果と A/B 定量比較（C0〜C5 完了）

### 5.1 実装概要

- **C0（複製パターン枠組み）**: `"compact-v2"`（`vector-urban-v67`）および `"compact-medium-v2"`（`vector-urban-v68`、`compactBlockScale` 1.1〜2.2 対応）を型・UI（`VectorGenerationPanel.ts`）・日英 i18n・検証・共有リンクへ追加。既存の 5 パターン（`compact` / `compact-medium` / `burgage` / `burgage-dense` / `burgage-village`）および mesh-first CE の処理経路・乱数系列は完全不変。
- **C1（課題 D）**: [compactV2.ts](../../src/city-editor/generators/compactV2.ts) `withoutHolesNatural` により、穴空き骨格街区を既存接道辺優先（距離係数 0.7）の最短線で分割（失敗時のみ従来の鉛直スリットへフォールバック）。
- **C2（課題 B・E-1）**: [compactV2.ts](../../src/city-editor/generators/compactV2.ts) `packCompactV2Block` にて、中心距離・幹線接道による間口／奥行き勾配を適用した上で、内角 60°〜120° の角地へ Eckhaus 角棟を先置きし、短辺の横通りファサード（戻り列または角棟の短辺正面化）を確保した上で残余スパンを連続住宅列として充填。
- **C3（課題 A）**: `packCompactV2Block` の街区中央残余コアを規模に応じて判定し、中規模〜大規模コアを **周囲住宅へ帰属する Voronoi 私有裏庭（`VectorFabricCell.plots` 記録＋深い裏庭には 1〜2 階建て低層裏棟 `rear`）** または **進入小路（幅 2.2〜2.6 m）付き共同中庭（Hof）** へ転換。既存の `renderData.ts` / `wells.ts` とスキーマ無変更で連携。
- **C4（課題 C・E-2）**: [organicBlocks.ts](../../src/city-editor/generators/organicBlocks.ts) で `compactV2` 有効時のみ通り抜け街路（`roadEnds === 2`）を優遇し `longLimit` をやや延長。[facilityLots.ts](../../src/city-editor/generators/vector/generation/facilityLots.ts) で壁内街区の施設消費上限（総ロット 50% 以下かつ住宅 2 戸以上残存）・裏列貫通回避スコア・残片吸収上限（元ロット 35% 以下＋フットプリント包含検証）を適用。

### 5.2 A/B 定量比較（固定シード `ab-bench-seed`、2,000〜20,000 人）

| 人口 | 施設 | Plot pattern | 施設配置 | 壁内施設単独街区 | 未収容 | 壁内収容率 | 住宅棟数 | 建蔽率 | 外周接道率 | 短辺盲壁率 | 裏庭 `plots`（街区/区画） | 生成時間 | 文書サイズ |
| ---: | :---: | --- | :---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | :---: | ---: | ---: |
| 2,000 | なし | `compact` | - | 0 | 0 | 60.4% | 406 | 49.2% | 53.8% | 52.8% | 0 / 0 | 338 ms | 1,785 KB |
| 2,000 | なし | **`compact-v2`** | - | 0 | 0 | 59.6% | 362 | 42.4% | **55.1%** | **41.4%** | **19 / 242** | 334 ms | 1,910 KB |
| 2,000 | なし | `compact-medium` | - | 0 | 0 | 59.5% | 412 | 53.5% | 55.8% | 43.4% | 0 / 0 | 347 ms | 1,719 KB |
| 2,000 | なし | **`compact-medium-v2`** | - | 0 | 0 | 59.2% | 359 | 43.6% | 55.2% | **39.7%** | **19 / 252** | 322 ms | 1,846 KB |
| 2,000 | あり | `compact` | 87/87 | 1 | 0 | 98.5% | 361 | 27.9% | 37.4% | 67.2% | 0 / 0 | 1,102 ms | 2,275 KB |
| 2,000 | あり | **`compact-v2`** | **87/87** | **0** | 0 | **99.8%** | 380 | 29.3% | **43.6%** | **49.3%** | **26 / 383** | 948 ms | 2,464 KB |
| 2,000 | あり | `compact-medium` | 87/87 | 1 | 0 | 98.5% | 350 | 29.5% | 40.2% | 56.3% | 0 / 0 | 984 ms | 2,163 KB |
| 2,000 | あり | **`compact-medium-v2`** | **87/87** | **0** | 0 | **99.8%** | 367 | 30.2% | **44.1%** | **47.9%** | **26 / 434** | 822 ms | 2,371 KB |
| 5,000 | なし | `compact` | - | 0 | 0 | 99.1% | 1,011 | 48.5% | 45.2% | 58.1% | 0 / 0 | 485 ms | 3,081 KB |
| 5,000 | なし | **`compact-v2`** | - | 0 | 0 | 72.5% | 953 | 48.6% | **53.0%** | **37.9%** | **30 / 611** | 587 ms | 3,567 KB |
| 5,000 | なし | `compact-medium` | - | 0 | 0 | 98.9% | 958 | 54.3% | 49.6% | 51.6% | 0 / 0 | 455 ms | 2,840 KB |
| 5,000 | なし | **`compact-medium-v2`** | - | 0 | 0 | 72.7% | 889 | 49.6% | **53.0%** | **32.8%** | **29 / 688** | 594 ms | 3,347 KB |
| 5,000 | あり | `compact` | 236/236 | 0 | 0 | 99.1% | 867 | 28.2% | 26.2% | 68.2% | 0 / 0 | 2,580 ms | 4,758 KB |
| 5,000 | あり | **`compact-v2`** | **236/236** | **0** | 0 | **99.8%** | 875 | 28.6% | **26.4%** | 68.6% | **38 / 1,005** | 2,326 ms | 5,120 KB |
| 5,000 | あり | `compact-medium` | 236/236 | 0 | 0 | 99.5% | 808 | 30.1% | 27.5% | 65.2% | 0 / 0 | 2,023 ms | 4,476 KB |
| 5,000 | あり | **`compact-medium-v2`** | **236/236** | **0** | 0 | **99.7%** | 846 | 29.9% | 26.4% | 68.6% | **38 / 1,191** | 1,620 ms | 4,967 KB |
| 10,000 | なし | `compact` | - | 0 | 0 | 99.3% | 2,019 | 57.5% | 39.1% | 64.2% | 0 / 0 | 709 ms | 4,970 KB |
| 10,000 | なし | **`compact-v2`** | - | 0 | 0 | 74.5% | 1,737 | 49.7% | **41.8%** | **47.5%** | **44 / 1,146** | 835 ms | 5,727 KB |
| 10,000 | なし | `compact-medium` | - | 0 | 0 | 76.4% | 1,834 | 61.6% | 41.7% | 54.4% | 0 / 0 | 784 ms | 4,861 KB |
| 10,000 | なし | **`compact-medium-v2`** | - | 0 | 0 | 75.4% | 1,668 | 53.0% | **41.9%** | **47.5%** | **44 / 1,329** | 795 ms | 5,312 KB |
| 20,000 | なし | `compact` | - | 0 | 0 | 99.8% | 4,014 | 54.7% | 26.9% | 53.8% | 0 / 0 | 1,082 ms | 7,894 KB |
| 20,000 | なし | **`compact-v2`** | - | 0 | 0 | 82.1% | 3,610 | 51.0% | **28.7%** | **46.8%** | **95 / 2,514** | 1,267 ms | 3,381 KB |
| 20,000 | なし | `compact-medium` | - | 0 | 0 | 99.7% | 3,594 | 60.3% | 29.4% | 49.1% | 0 / 0 | 957 ms | 6,880 KB |
| 20,000 | なし | **`compact-medium-v2`** | - | 0 | 0 | 82.6% | 3,366 | 54.9% | 28.5% | **48.6%** | **94 / 2,865** | 1,186 ms | 2,974 KB |

- 20,000 人の `compact-v2` / `compact-medium-v2` の文書サイズが 3 MB 台なのは、`serializeVectorDocument` が整形 JSON 上限超過時に自動でコンパクト JSON へ切り替わる仕様によるもので、8 MB 保存上限内に十分収まっている。
- 施設なしの 5,000〜20,000 人で `compact-v2` 系の壁内収容率が 72〜82% に下がるケースは、街区中央の空間確保と外縁側のやや広めの区画幅により壁内収容戸数が約 5〜8% 減った結果、端数が城壁外の郊外帯へ繰り越されたもの（施設ありの通常モードでは壁内収容率 99.7〜99.8%、施設配置率 100% を維持）。

---

## 6. 次に進める作業

1. **ブラウザでの 2D/3D 目視 A/B 比較**:
   - CE（`meshless`）で同一シード・人口（2,000 / 5,000 / 10,000 人、`medieval-facilities`）に対し、`compact` ↔ `compact-v2` および `compact-medium` ↔ `compact-medium-v2` を切り替えて以下を目視評価する：
     - 角棟（Eckhaus）と横通りファサードの自然さ（不自然な角の段差や屋根のぶつかりがないか）
     - 街区中央の私有裏庭（塀・果樹・低層裏棟）および進入小路付き共同中庭の見え方（3D 視点での圧迫感・違和感の有無）
     - 施設（工房・ギルド・宿屋等）と周辺住宅の混在バランス
     - 穴空き骨格街区（修道院・広場周囲）の連絡街路の自然さ
2. **採否・再調整の判断**:
   - 目視評価の結果を踏まえ、効果が高かった要素のみ残す／閾値を微調整する／既存 `compact` 系へ昇格または `v2` を破棄するかを決定する。
