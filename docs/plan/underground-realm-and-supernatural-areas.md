# 地下王国と「面としての超自然地理」— ドワーフ坑内圏の設計深掘り

- **Status**: 設計のみ（未実装）。コード変更なし。
- **Last updated**: 2026-09-06
- **前提**: [docs/temp/races/dwarf.md](../temp/races/dwarf.md)（Codex の一次調査）、
  [fictional-map-feature-gaps.md](fictional-map-feature-gaps.md) の **§4 超自然の地理** と
  **§6-4 地下世界**
- **関連**: [wild-oikoumene-frontier.md](wild-oikoumene-frontier.md),
  [biome-goods-producer-ecosystem.md](biome-goods-producer-ecosystem.md),
  [high-fantasy-dungeons.md](high-fantasy-dungeons.md),
  [fauna-biome-realism.md](fauna-biome-realism.md), [danger-layer.md](danger-layer.md)

---

## 0. この文書の位置づけ

`dwarf.md` は「**地表セルを入口・国家位置として使い、地下はその集落の居住形態として持つ**」という
方針を出した。この判断は正しく、本文書もそれを覆さない。

一方 `fictional-map-feature-gaps.md` §4 は別の角度から同じ空白を指摘している。すなわち
「エルフの森・ドワーフの山中都市・竜の縄張りといった非人間の居住域が**地図上の面として**表現されない」
「`giantHighlandOikoumene.ts` がその方向性の唯一の先例」。

この2つは**同じ設計を別の抽象度から見たもの**である。`dwarf.md` は「ドワーフ国家を1つ生成する手順」、
§4 は「種族領域という面レイヤの型」。本文書は両者を接続し、次の3点を深掘りする。

1. `dwarf.md` の 1〜7 を、**ドワーフ専用ではなく面レイヤの参照実装**として一般化するデータモデル(§2)
2. `dwarf.md` §6 が `subterraneanCapacity` という**不透明な定数**に丸めてしまった部分を、
   既存の食料網機構に載る**明示的な地下生態系**へ展開する(§4)
3. その面が政治・危険度・鉱床・ダンジョンとどう因果を持つか(§5, §6)

また `dwarf.md` の記述のうち、現行コードと食い違う点・そのままでは壊れる点を §7 に列挙する。

---

## 1. 中心的な設計判断

### 1.1 地下は「第2のマップ」ではなく「地表セルに束ねられた鉛直属性」

`pack.cells` は Voronoi 幾何と密結合している（`p` / `c` / `v` / `area`、`PackedGraph.ts:24-102`）。
第2の独立グラフを足すと save・export・全レンダラ・routes・economy の全域に波及し、
city generator 並みのスコープになる（feature-gaps §6-4 の懸念どおり）。

代わりに **1 地表セル = 1本の鉛直な柱** とする。地下は柱の中の属性であり、
面としての「地下圏」は**地表セル集合への投影**として表す。これで:

- 既存の面表現(`Zone`, `wildLand`, `dangerField`)と同じ土俵に乗る
- 地表の州と地下の圏が**同じセルの上下に共存**できる（§5.1 の重層支配）
- save は既存のセル列 + 小さなオブジェクト配列で済む

### 1.2 鉛直方向は3層。語彙は既存の鉱床深度に揃える

`MineralDeposit.depth` は既に `surface | shallow | deep` を持つ
（`mineralResources.ts:206`）。地下層はこれと**同じ語彙**にする。

| 層 | コード | 目安 | 主な意味 |
| :--- | ---: | :--- | :--- |
| `shallow` | 1 | 〜100m | 坑道・地下街・住区。ドワーフの主生活圏 |
| `deep` | 2 | 100〜800m | 大空洞・菌糸畑・深部鉱脈。`deep` 鉱床はここでしか掘れない |
| `abyssal` | 3 | 800m〜 | 深淵。恒常的な危険源。国家は届かない |

これにより「`deep` 鉱床を持つ国はドワーフだけになりやすい」という経済的優位が、
新しいルールを足さずに**既存の鉱床データから自動的に出る**。

---

## 2. データモデル

### 2.1 セル列（`PackedGraphCells` への追加）

```ts
/** 空洞率 0..1。地質由来。地下の物理的容積の素。 */
subterraneanVoid?: Float32Array;
/** 到達可能な最深層コード（0 = 地下空間なし, 1 shallow, 2 deep, 3 abyssal）。 */
subterraneanReach?: Uint8Array;
/** 地下圏 id（0 = なし）。面としての種族領域の実体。 */
subterraneanDomain?: Uint16Array;
/** 地下由来の人口扶養力。§4 の食料網の出力であって入力定数ではない。 */
subterraneanCapacity?: Float32Array;
```

`subterraneanVoid` は**地質プロヴィンスから引く**。既存の
`GeologicalProvinceKind`（`mineralResourcesTypes.ts:41`）にそのまま対応させられる。

| プロヴィンス | 空洞率 | 洞窟の性格 |
| :--- | ---: | :--- |
| `carbonate` | **0.55–0.85** | カルスト。石灰岩の溶食洞。最大の天然空洞源 |
| `volcanic` | 0.40–0.65 | 溶岩洞。熱と硫黄を伴う（§4.1 の一次生産に直結） |
| `basin` | 0.25–0.45 | 炭層・堆積層。掘削は容易だが崩落しやすい |
| `orogen` | 0.20–0.40 | 断層・破砕帯の裂罅。狭く垂直的 |
| `granite` | 0.05–0.15 | 天然空洞ほぼ無し。**全て掘って造る**＝ドワーフの職人的地下都市 |
| `shield` | 0.05–0.15 | 同上。硬く安定 |
| `placer` | 0.00 | 河川堆積。地下都市不可 |

ここに「ドワーフ技術による人工掘削」を加算する（§3.4）。
`granite` が「天然空洞ゼロだが最も堅牢」なのは意図的で、
**カルスト＝天然の大空洞 / 花崗岩＝人工の石造大広間** という2種類の地下都市の像が
地質から自動的に分かれる。

### 2.2 地下圏オブジェクト（`pack.subterraneanDomains`）

```ts
export type SubterraneanDomainKind =
  | "dwarfHold"    // ドワーフの氏族圏（人間の state と別次元の領域）
  | "wildCavern"   // 無主の洞窟系。探検・ダンジョン候補
  | "chasmHive"    // 深穴蜂の巣域（§4.2b）
  | "wormReach";   // 大喰蟲の掘削領域（§4.2a）

export interface SubterraneanDomain {
  i: number;
  kind: SubterraneanDomainKind;
  name?: string;
  /** 支配種族（無主なら undefined）。cells.state とは独立。 */
  raceId?: number;
  /** 地表への投影セル集合。これが「面」。 */
  cells: number[];
  /** 地表へ開口するセル（Burg / marker "caves" の設置点）。 */
  entrances: number[];
  /** 到達最深層。 */
  depth: 1 | 2 | 3;
  /** 総空洞容積（抽象量: Σ area × void × 層係数）。capacity の物理的上限。 */
  voidVolume: number;
}
```

`Zone`（`models.ts:1183`）と意図的に似せてあるが、`Zone` は装飾的な色付き注釈であり
セマンティクスを持たない。`SubterraneanDomain` は生成系が読み書きする一次データなので分ける。

**この型を dwarf 専用にしないことが重要**。`kind` を足すだけで
レイライン網・呪われた土地・常闇の領域（feature-gaps §4 が挙げた未実装項目）が
同じ「面 + スカラー場 + 専用レンダラ」の型に乗る（§5.3）。

---

## 3. 生成パイプライン

### 3.1 挿入位置

`dwarf.md` §3 の順序を、現行 `main.ts` の実際の呼び出し順に合わせて修正したもの。

```text
Biomes.define                       (main.ts:1131)
Threats.generate                    (main.ts:1137)
rankCells
generateSubsistenceCapacity         (main.ts:1139)
generateGeologicalProvinces   ← NEW: economy から core へ抽出（§3.2）
generateCaveSystems           ← NEW: void → 連結成分 → SubterraneanDomain 候補（§3.3）
Cultures.generate / Cultures.expand (main.ts:1140-1141)
seedDwarfHoldOikoumene        ← NEW: ドワーフ文化を最良 domain へ（§3.4）
applyInitialSettlementPattern       (main.ts:1153)   ← "mountain" region を予約
Burgs.generate                      (main.ts:1166)
Routes / States
```

### 3.2 Phase 0: 地質プロヴィンスを core へ抽出（振る舞い不変）

`classifyProvince()` は現在 `mineralResources.ts:284` にあり、Economy 拡張の内側にいる。
しかし**地下圏は Economy を無効にしても生成されなければならない**（ドワーフ国家の生成は
core の責務）。core の generator は拡張を import できない。

したがって `src/generators/geologicalProvinces.ts` へ純関数として抽出し、
`mineralResources.ts` はそれに委譲する。入力は `seed` / `cells.h` / `cells.r` /
`cells.biomeCode` + `biomesData` のみで、既にすべて core 側にある。
**同じ hash 実装を持っていけば決定性は完全に保たれる**（既存の鉱床テストが緑のままであることが
Phase 0 の完了条件）。

この抽出は本文書のためだけの作業ではない。`mineralResources.ts:163` が自ら
「将来のテクトニクスモデルが残りを置き換える」と書いており、feature-gaps §6-1 が指摘した
プレートモデルの受け皿も core 側にあるべきである。

### 3.3 Phase 1: 洞窟系の生成（`caveSystems.ts`）

1. 各陸セルに `subterraneanVoid` を割り当て（§2.1 の表 + セル内 hash ゆらぎ）
2. `void >= 0.25` のセルで**連結成分**を取る（`cells.c` の BFS。`dangerField.ts` の BFS と同型）
3. 面積が閾値未満の成分は破棄。残りを `SubterraneanDomain { kind: "wildCavern" }` にする
4. `depth` は成分内の最大 void と最大 `cells.h` から決める（高い山ほど深く潜れる）
5. `entrances` は成分の縁で `cells.h` が局所的に高い／河川侵食のあるセルを選ぶ
6. `voidVolume = Σ area × void × depthFactor`

**Fantasy カルチャーセット以外ではこの工程を丸ごとスキップする。**
`isFantasyCulturesSet()`（`raceCivicStance.ts`、`giantHighlandOikoumene.ts:23` の先例）で
ゲートする。これが feature-gaps §4-4「非 Fantasy でこのレイヤはどう振る舞うべきか」への回答であり、
`pack.subterraneanDomains` が空配列 ⇒ レイヤは自動的に非表示になる。

既存の marker `"caves"` は `cells.h >= 50 && cells.pop` というだけの点配置
（`markers-generator.ts:1576`）である。Phase 1 以降はこれを `entrances` から引くようにして、
**ランダムな飾りから「実在する洞窟系の開口部」へ格上げ**する。安価で効果が大きい。

### 3.4 Phase 2: ドワーフ氏族圏の播種（`seedDwarfHoldOikoumene.ts`）

`giantHighlandOikoumene.ts` を先例とするが、**3点で異なる**。

| | Giant（現行） | Dwarf（本設計） |
| :--- | :--- | :--- |
| 対象領域 | 最高河川源流の分水界 | 洞窟系の連結成分（`wildCavern` domain） |
| 呼び出し位置 | `Burgs.generate` の中（`burgs-generator.ts:752`） | **`applyInitialSettlementPattern` の前**（main.ts） |
| capacity | 人間相当 × 0.1 の定数 | §4 の地下食料網の出力 |

呼び出し位置の違いは決定的である。Giant は Settlement Foundation の**後**に播種されるため、
`frontier` / `marches` では Foundation の region/node に入れず、
`dwarf.md` が §4 で警告したとおり「首都だけ差し替えると一セル国家になる」問題を抱えている。
ドワーフはこれを踏襲してはならない。

手順:

1. `wildCavern` domain のうち `voidVolume` と地表 `cells.h` の合成スコアが最大のものを選ぶ
2. `kind` を `"dwarfHold"` に、`raceId` をドワーフ種族に変える
3. ドワーフ文化の `center` を最良 `entrance` セルへ移し、domain の投影セルへ文化を塗る
4. 人工掘削分を `subterraneanVoid` に加算（`granite` / `shield` はここで初めて居住可能になる）
5. `SettlementRegion` に `kind: "mountain"` を追加し（`settlementFoundation.ts:1-7`）、
   domain の投影セルを1つの予約 region として Foundation に渡す
6. その region の中心 node に `mandatoryCapital` を付け、初期国家数の枠内で必ず1つ首都にする

`cells.s`（適性）は人口容量と首都選定スコアを兼ねている。
`giantHighlandOikoumene.ts:79` と同じく、**アンカーの `s` だけ**を人間最高値の数倍に引き上げ、
実際の容量は上げない。

---

## 4. 地下の食料基盤 — 本設計の中核

### 4.1 なぜここを掘り下げるのか

`dwarf.md` §6 は `subterraneanCapacity` を
「坑内農業・貯蔵・交易・採掘経済を抽象化した容量」と定義し、`capacityMultiplier: 0.3` を置いた。
これは**設計者が任意の数字を書けるブラックボックス**であり、次の問題がある。

- なぜドワーフが金属を穀物と交換するのか、なぜツンドラの地下王国が貧しいのか、
  なぜ人口が人間より少ないのかが、すべて「そういう定数だから」になる
- 本リポジトリは既に、地表について4つの支持（農耕・漁労・牧畜・採集）を明示的に足し合わせて
  容量を出す機構を持つ（`subsistenceCapacity.ts:76-102`）。地下だけ定数にする理由がない
- 個体群ストック（`faunaPopulation.ts` の3コホート + ロジスティック成長）と
  農村労働配分器（`ruralOccupationAllocation.ts:347`）という、
  **狩猟・牧畜をそのまま表現できる機構が既にある**

したがって `subterraneanCapacity` は**入力定数ではなく §4.2–4.4 の出力**とする。

### 4.2 一次生産（光合成のない世界のカロリー源）

3系統。いずれも既存の地図シグナルから引ける。

| 系統 | 依存する既存データ | 性格 |
| :--- | :--- | :--- |
| **地熱化学合成マット** | `volcanic` プロヴィンス / `volcanic` biome tag / `sulfur` 産出 | 地表と無関係に安定。火山性の地下王国だけが持つ |
| **地表からの滴下有機物** | 直上セルの `forestStock` / `subsistenceNonAgriculturalCapacity` | 森の下の洞窟は肥沃。**地表植生と地下を結ぶ結合項** |
| **菌糸農業（fungiculture）** | 上2つ＋木材・堆肥を基質、労働で倍率 | ドワーフの技術介入。新 Good `Cave Fungus` |

一次生産 = 地質(熱・硫黄) + 地表植生の浸透 + 労働。
第2項があるおかげで、**地下圏はバイオームから切り離された孤島にならない**
（feature-gaps §4-3 が求めた「魔法圏・種族領域が biome とどう相互作用するか」への回答）。

### 4.3 タンパク源 — 巨大ミミズと巨大蜂は「対立案」ではなく「食物網の別階層」

ユーザー提案の2案は、生態的地位が異なるので**両方採る**。片方を選ぶと設計が痩せる。

#### (a) 大喰蟲 / **Deep Worm** — 頂点捕食者かつ高リスク・高収量のタンパク源

- **生態**: 岩と菌糸マットを食う腐食＋捕食者。坑道を自ら掘り進み、ドワーフも食う。
- **既存機構への写像**: **新規機構を作らない**。`Monster`（`models.ts:557`）として置く。
  `type: "deepWorm"`, rarity 2–3, `power` = 影響半径。
  `rebuildDangerFromMonsters()`（`dangerField.ts:38`）がそのまま danger を塗る。
- **狩猟**: 既存の threat cull job（`player-threat-cull-jobs.md`）に乗る。
  cull 成功で danger が下がり、Good `Worm Meat`（`freshFood`, `food` タグ, 高 value,
  `unit: "wain"`, `Game` と同じ形。`goods-generator.ts:670` を雛形）が大量に入る。
- **個体数**: `faunaPopulation.ts` の3コホートに species key `"DeepWorm"` で載せる。
  carrying capacity = domain の `voidVolume` × 一次生産量。
  **過剰狩猟すると翌年の繁殖群が減る**という既存ロジックがそのまま働く。
- **逆説的な利得**: 蟲が掘るので `subterraneanVoid` が年々増える。
  **敵が住居を掘ってくれる**。蟲を狩り尽くした氏族は肉と拡張余地の両方を失う。
  これは「danger をゼロにするのが常に最適解ではない」という珍しい因果で、
  `wildLandTags.ts` の monster_domain（高危険＝無主）を経済的にも意味づける。
- **人食いの表現**: domain 内 danger が閾値を超えると
  地下人口に損耗を与える（`threatCullEffects.ts` と同じ経路）。
  「地下は放置すると人が減る」というプレッシャーが常時かかる。

#### (b) 深穴蜂 / **Chasm Hive** — 半家畜化された安定タンパク源

- **生態**: 成虫は**地表に出て採餌**し、地下の巨大巣に幼虫を育てる。
  つまり地表バイオームと地下を物質的に繋ぐパイプ。
- **既存機構への写像**: `liveAnimal` 系の**非放牧家畜**（`husbandry.ts` の Pig/Chicken 側）。
  Goods: `Hive Brood`（幼虫、`freshFood`）、`Cave Wax`（蝋、craft 原料）、
  `Deep Honey`（`luxury` + 保存食）。
- **依存**: carrying capacity は**直上セル群の気温・降水・`forestStock`**。
  ツンドラ／砂漠／氷河の上に開いた地下王国では蜂が効かない。
- **蟲との関係**: 蟲は巣を襲う。domain 内に `deepWorm` がいると
  hive の carrying capacity が下がる。
  **蟲狩り → 蜂の増産**という直接の経済因果が生まれる。

#### 労働配分への接続

3つとも `ruralOccupationAllocation.ts` の `MonthlyLaborCandidate`（:347）に
`kind` を足すだけで乗る。

```ts
readonly kind: "viticulture" | "fishing" | "husbandry"
  | "fungiculture" | "broodTending" | "wormHunting";
```

同じ月次労働予算を漁労・牧畜と奪い合うので、
「蟲狩りに人を出しすぎた年は菌糸畑が回らない」が自動的に起きる。
**新しい配分器を書かない**ことが重要。

### 4.4 結果としての `subterraneanCapacity`

```text
subterraneanCapacity(cell)
  = min(
      voidVolume 由来の物理上限,
      fungiculture(基礎カロリー)
        + hiveBrood(タンパク。地表植生・気温に依存)
        + wormOfftake(高カロリー。danger と引き換え)
    )
```

地表からの穀物輸入は既存の `foodImportNetwork.ts` がそのまま担当する（新規実装不要）。

この式の帰結:

- **貿易相手のいないツンドラ上の地下王国は本当に食えない** ⇒ 金属を穀物と交換する
  古典的なドワーフ像が、設定として宣言されるのではなく**式から出てくる**
- 人口が人間より少ないことも自動的に出る。`dwarf.md` の `capacityMultiplier: 0.3` は
  **式の出力を頭打ちにする clamp** として残す（初期較正値・安全弁）
- カルスト（大空洞・湿潤・蜂が効く）と花崗岩（人工掘削・堅牢・菌糸中心）で
  食料構成が変わる ⇒ 氏族ごとの個性が地質から出る

### 4.5 Economy 無効時のフォールバック

§4.2–4.4 は Goods / fauna / 労働配分に依存するので Economy 拡張が要る。
Economy 無効時は Phase 2 の定数 multiplier（`0.3`）にフォールバックする。
これは `subsistenceCapacity`（core）と `agriculturalLandUse`（economy）が既に取っている
二段構えと同じ形であり、新しい方針ではない。

---

## 5. 面としての超自然地理（feature-gaps §4 への回答）

### 5.1 地下圏は「重層支配」の最初の実装

feature-gaps §4-2 の問い —
「種族領域は文化の版図決定ロジックを転用できるか、独立オクメーネか」への回答は
**独立レイヤ**である。理由は明確で、`cells.state` は1セル1所有者であり、
地下圏をそこへ入れると地表の州と席を奪い合ってしまう。

`subterraneanDomain` を別列にすれば、
**同じ地表セルの上を人間の州が、下をドワーフ氏族が支配する**状態が表現できる。
これが §4-3 の要求「種族領域は国家の実効支配と別」そのものであり、
「山の下を通る回廊が人間の国境を無視する」という物語装置に直結する。

### 5.2 レンダラ

`dangerField.ts` + `danger-renderer.ts` の「セル単位スカラー場 + 専用レンダラ」を踏襲する
（feature-gaps §4-1 が指摘した流用可能パターン）。

- 新規 `src/renderers/subterranean-renderer.ts`
- **面塗りにしない**。州色と競合するため、ハッチング／点描 + 輪郭線で描く。
  地表の政治色を潰さずに「下に何かある」を示すのが要件
- `entrances` は専用アイコン（既存 marker `"caves"` のアイコンを共用）
- `styleElementGroups.ts` の `OVERLAYS_ELEMENTS` にレイヤ登録、トグル名は `Underground`
- domain が空（非 Fantasy）ならトグル自体を出さない

### 5.3 他の面的超自然地理への一般化

`SubterraneanDomain` の構造 — **`kind` + `cells` + `entrances` + 付随スカラー場** — は
そのまま feature-gaps §4 の未実装項目に使える。

| 項目 | `kind` | スカラー場 | 開口/中心 |
| :--- | :--- | :--- | :--- |
| 地下王国 | `dwarfHold` | `subterraneanVoid` | 洞窟入口 |
| レイライン網 | `leyline` | 魔法濃度 | 交点（ノード） |
| 荒魔法地帯 | `wildMagic` | 魔法濃度 | — |
| 常闇 / 永冬 | `blight` | 影響強度 | 中心 |

したがって Phase 1 のデータ層は
`SupernaturalDomain`（`SubterraneanDomain` を含む上位型）として設計し、
鉛直方向の属性（`depth`, `voidVolume`）だけを地下固有の拡張にする。
**この一般化を先にやっておかないと、レイライン実装時にレンダラごと書き直しになる。**

なお魔法濃度と danger の関係について（§4-1 の問い）は、
**独立の場を持ち、danger には寄与だけする**（`applyBiomePredatorDanger()` が
`dangerField.ts` に対して取っているのと同じ関係）のが妥当。統合すると
「危険だが魔法的ではない」「魔法的だが安全」が表現できなくなる。

---

## 6. 既存システムとの相互作用

| システム | 相互作用 | 実装の重さ |
| :--- | :--- | :--- |
| 鉱床（`mineralResources.ts`） | `depth: "deep"` の鉱床は `subterraneanReach >= 2` の domain 内でのみ採掘可 ⇒ ドワーフの経済的優位が自動的に出る | 小（採掘可否の条件追加） |
| 危険度（`dangerField.ts`） | `deepWorm` は既存 Monster としてそのまま danger を塗る | ほぼゼロ |
| 無主地（`wildLandTags.ts`） | 蟲支配の domain は `monster_domain` 相当。国家は地表を取れても地下は取れない | 小 |
| ダンジョン（`dungeons-generator.ts`） | 現行は地表配置のみ。`wildCavern` domain の未踏区画を `lost_vault` の配置候補に加える | 小 |
| マーカー（`markers-generator.ts:1576`） | `"caves"` を `entrances` から引く（§3.3） | 小 |
| 交易・食料（`foodImportNetwork.ts`） | 変更なし。地下王国は既存の輸入網の一参加者 | ゼロ |
| 経路（`landRouteGraph.ts`） | 地下回廊は山越えより安いが domain 内のみ。`DirectionsDialog` に効く | **中〜大・MVP 外** |
| City Generator | `burgSiteDescriptor.ts` に `settlementSite` を追加、初期は地表生成へフォールバック（`dwarf.md` §7 のまま） | 小 |
| Fast-Forward | §7-4 参照 | — |

---

## 7. `dwarf.md` に対する修正点

現行コードと照合して見つかった、そのままでは壊れる／食い違う点。

### 7.1 `effectiveCapacity = max(foodCapacity, subterraneanCapacity)` は誤り

`dwarf.md` §6 の提案。`max` を取ると、地表の食料容量が地下の食料網を**丸ごと隠す**。
既存の同種処理は加算してから地形上限で clamp している:

```ts
// subsistenceCapacity.ts:62
target[cellId] = Math.min(terrainCapacity, nonAgricultural + agriculture);
```

山岳セルは少量の牧養力と菌糸畑を**同時に**持ちうるので、地下も同じ形にすべき:

```ts
target[cellId] = Math.min(terrainCapacity + subterranean, nonAgricultural + agriculture + subterranean);
```

### 7.2 Economy の再計算で地下容量が消える経路は `capacity` の clamp

`dwarf.md` §6 の懸念は正しいが、原因は書かれているより具体的である。
`reconcileSubsistenceCapacityFromFood()` は `terrainCapacity`（= `cells.capacity`）を
**上限として clamp する**（:62）。山岳セルの `capacity` が 0 なら、
`subsistenceCapacity` に何を書いても次の年次照合で 0 に潰される。

`giantHighlandOikoumene.ts:65` が `pack.cells.capacity[cell] = giantCapacity` と
**地形上限そのものを書き換えている**のはこのためである。
ドワーフも同じく `capacity` を引き上げる必要がある。§7.1 の式はそれを前提にしている。

### 7.3 播種の呼び出し位置は Giant を真似てはいけない

`dwarf.md` §3 は `Cultures.expand` と `applyInitialSettlementPattern` の間を指定していて、
これは正しい。ただし先例の `seedGiantHighlandOikoumene` は
`Burgs.generate` の内側（`burgs-generator.ts:752`）＝ Foundation の**後**で呼ばれている。
「Giant を真似る」と読むと逆になる。**Giant の呼び出し位置は先例ではなく既知の制約**であり、
`dwarf.md` §4 が警告する一セル国家問題の原因そのものである。実装時に取り違えやすい。

### 7.4 Fast-Forward（`isBulkAdvance`）との整合

§4 が追加する年次系（`deepWorm` / `chasmHive` のコホート更新、菌糸農業の生産）は、
`project_advance_time_fast_forward` で既知の
「`Production.produce()`-skip リスク」（約18系統が未監査）の**新たな対象**になる。
Fast-Forward 時に地下食料だけ更新されず地下人口が飢える、という不整合が起こりうる。
Phase 3 の実装時に必ず fastAdvance 側のガードを同時に入れること。

### 7.5 `CultureType` に `Underground` を足さない判断は正しい

`dwarf.md` §1 の判断を支持する。`CULTURE_TYPES`（`models.ts:14-26`）は
goods の `multipliers.cultureType`、拡張コスト、雇用構成など広範囲のテーブルに波及しており、
「文化」と「立地」を混同する。地下性は `Burg.settlementSite` と
`SubterraneanDomain` が持つべきで、`Highland` の再利用で足りる。

---

## 8. フェーズ計画

| Phase | 内容 | Economy 依存 | 検証可能な完了条件 |
| ---: | :--- | :---: | :--- |
| **0** | `classifyProvince` を `src/generators/geologicalProvinces.ts` へ抽出 | — | 既存の鉱床テストが**全て**緑（決定性が変わっていない） |
| **1** | `caveSystems.ts` + `SupernaturalDomain` データ層 + save/load + レンダラ（表示のみ、経済影響ゼロ） | — | Fantasy マップに洞窟系が描かれる。非 Fantasy は空。save/load 往復で domain が保存される |
| **2** | `seedDwarfHoldOikoumene` + `SettlementRegion "mountain"` + `Burg.settlementSite`（`dwarf.md` 1–5,7） | — | `standard` / `marches` / `frontier` の3パターンでドワーフ国家が首都を持ち、一セル国家にならない |
| **3** | 地下食料網（菌糸農業 + 蜂 + 蟲）→ `subterraneanCapacity` を式で算出（`dwarf.md` §6 を置換） | 要 | Economy 有効・無効の両方で地下人口が維持される。§7.4 の fastAdvance ガード込み |
| **4** | `deepWorm` を Monster / `chasmHive` を fauna へ接続、cull job 連動、Goods 4種追加 | 要 | 蟲を狩ると danger 低下・肉入手・翌年の蜂増産が観測できる |
| **5** | 重層支配 UI、地下回廊、他の超自然 domain（レイライン等）への一般化 | — | — |

Phase 0–2 だけでも `dwarf.md` の目的（ドワーフ国家が生成される）は達成される。
Phase 3–4 が本文書の追加分であり、feature-gaps §4 の「面としての超自然地理」は
Phase 1 のレンダラ時点で満たされる。

---

## 9. 未決定事項

1. **命名**。蟲・蜂・洞窟系の呼称は文化ごとに変わるべきで、feature-gaps §1（地形の自動命名）
   および §7（言語の地理）と同時に設計するのが効率的。本文書では英語仮称のみ置いた。
2. **save サイズ**。`SubterraneanDomain.cells` は素直に書くと大きい。
   セル列 `subterraneanDomain: Uint16Array` があれば `cells` は再構築可能なので、
   保存は列のみ・オブジェクト側は `cells` を省略するのが妥当か要検討（`io/save.ts`）。
3. **複数氏族**。本設計は「有効な洞窟系があれば少なくとも1つのドワーフ国家」を保証するが、
   2つ目以降の domain をどう配るか（他氏族 / 無主 / 蟲の巣）は未定。
4. **蟲の掘削による `voidVolume` 増加**（§4.3a）の年次更新頻度。
   毎年更新するとセル列の書き換えが増える。10年周期などの粗い刻みで足りるか。
5. **`abyssal` 層（深度3）を誰が使うか**。現状は「国家は届かない危険源」としか定義していない。
   ダンジョン（`lost_vault`）の配置先として使うのが最も安価。
6. **エルフの森・竜の縄張り**への横展開。§5.3 の一般化型で受けられるはずだが、
   森は既存 biome と重なるため「面の二重定義」をどう避けるかは別途設計が要る。
