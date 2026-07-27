# 鉱物資源・鉱山・貨幣供給システム設計

## 状態

Phase 4 の基礎まで実装済み。これは史実を厳密に再現する仕様ではない。地図生成時に
「将来の発展・通貨・軍需を支えられる資源の下地」を作るため、一次・研究資料を
参照しつつ、調整可能なゲーム用の初期値を定める文書である。

対象時代は古代後期から近世初頭を基本とし、火薬時代を拡張段階として扱う。

## 1. 目的と非目的

### 目的

- 鉱床の位置、埋蔵金属量、採掘能力、発見・枯渇を地図データとして持つ
- 鉱物供給を人口、都市、貨幣鋳造、武器・砲兵生産へ接続する
- 鉱床の偏在と交易依存を残し、全国家の完全自給を要求しない
- 鉱山をバイオーム産品から分離し、地質史・地形・水利・燃料に基づいて配置する
- 将来の鉱山開発・技術革新・戦争による戦略資源争奪の基盤を作る

### 非目的

- 現実の鉱山の鉱量、品位、年産を地図スケールに正確に写すこと
- 最初から鉱石、選鉱、精錬、副産物、輸送を全て個別 Good にすること
- 全ての鉱床をプレイヤーに初期表示すること

## 2. 現状監査

### 2.1 Economy Goods

`src/extensions/economy/generators/goods-generator.ts` には Iron / Copper / Tin /
Silver / Gold がある。これらは市場に投入される抽象的な Good であり、鉱床ではない。

- 1 セルには原則 1 Good だけを置く。
- `resourceMaxCells = ceil(200 * cells / 5000)` が各 Good のセル数上限である。
- `chance` と `distribution` は配置の確率条件であり、埋蔵量・品位・年産を表さない。
- 産出量は主に人口に比例する抽象単位で、鉱山の稼働能力や枯渇は存在しない。
- `Coins` は Gold または Silver を材料にする市場 Good であり、貨幣在高・金銀銅の
  額面・鋳造量を保持していない。

よって現在の配置数から「人口と経済を支える鉱物があるか」は判定不能である。

### 2.2 Markers の mines

`src/generators/markers-generator.ts` の `mines` は、標高 47 超かつ Burg のあるセルへ
付く説明用の Marker である。候補には salt / gold / silver / copper / iron / lead / tin が
あるが、Goods・市場・生産とは接続していない。

特に Lead は Marker には存在するが、現行 `GOODS_DATA` にはない。候補データは
`docs/plan/exchange/04-goods-data-candidates.md` にあるだけで未実装である。

### 2.3 火薬時代の不足

現行では Artillery は Iron または Bronze を消費し、Gunpowder は Saltpeter と Coal を
消費する。火器・弾薬を物量化するなら次が必要になる。

- Lead: 弾丸、散弾、活字、配管、銀製錬の副産物
- Sulfur: 火薬の原料
- Fuel: 木炭または石炭。鉱山排水、精錬、高炉も燃料と水利を必要とする

## 3. 調査メモと設計への反映

ここでの資料は「数値を直接コピーする根拠」ではなく、配置・併産・技術制約の
モデルを決めるための根拠である。

| 資料 | 要点 | 設計への反映 |
|---|---|---|
| [USGS: Porphyry Copper Deposit Model](https://pubs.usgs.gov/sir/2010/5070/b/) | 斑岩銅は巨大な資源量を持ち、Cu とともに Au・Ag を伴いうる | Cu-Au-Ag は単一セルで独立抽選せず、造山帯の鉱区で併産させる |
| [USGS: MVT lead-zinc model](https://www.usgs.gov/publications/a-deposit-model-mississippi-valley-type-lead-zinc-ores) | Pb-Zn 鉱床では Ag が重要な副産物になりうる。母岩は石灰岩・ドロマイトに多い | Silver を単独鉱山に偏らせず、Pb-Ag-Zn 鉱区を基本形にする |
| [USGS: Tin statistics](https://www.usgs.gov/centers/national-minerals-information-center/tin-statistics-and-information) | 錫は稀で、主鉱石は cassiterite。砂鉱も世界供給で重要 | Sn は花崗岩帯の脈・下流砂鉱に限定し、銅より明確に希少にする |
| [PNAS: medieval lead pollution](https://doi.org/10.1073/PNAS.1904515116) | 中世の Pb/Ag 生産は新鉱区、技術、繁栄、戦争、疫病で大きく変動した | 鉱山年産を静的にせず、発見・技術・労働・戦争で変化させる |
| [Melle medieval silver quantification](https://www.bergbaumuseum.de/fileadmin/forschung/zeitschriften/metalla/20.2/metalla-20-2-how-to-quantify-medieval-silver-production-at-melle-tereygeol.pdf) | Goslar の推定年産 400 kg Ag など、地域鉱山でも貨幣供給に影響する規模が見える | 1 t/年未満の銀鉱山も地域的には重要な資源として扱う |
| [Allen: England and Wales silver money supply](https://onlinelibrary.wiley.com/doi/10.1111/j.1468-0289.2010.00552.x) | 英国貨幣において輸入銀の比重が国産銀より大きい時期があった | 各国に銀鉱山を保証せず、輸入・貢納・再鋳造を貨幣供給源にする |
| [Jernkontoret: Swedish blast furnaces](https://www.jernkontoret.se/en/the-steel-industry/the-history-of-swedish-steel-industry/blast-furnace-in-earlier-times/) | 17 世紀半ばのスウェーデン銑鉄年産は約 25,000 t とされる | 火薬時代の鉄を希少品にしすぎない。大産地は数千〜万 t/年級を許容する |
| [Agricola, *De re metallica* (1556)](https://www.gutenberg.org/files/38015/38015-h/38015-h.htm) | 坑道、排水、巻上げ、水車、選鉱、精錬を連続する産業として記述 | 鉱床量だけではなく、水利・燃料・坑内水・技術を MineOperation の制約にする |

## 4. 地質生成モデル

鉱物はバイオームから生成しない。バイオームは植生・気候であり、鉱床は過去の
造山、火山、貫入、変成、堆積、侵食による。標高は露頭・坑道の作りやすさの補助
条件には使えるが、`minHeight()` のみで鉱床を決めない。

火山 Marker は現役火山の表示であり、鉱物の直接原因ではない。むしろ侵食された
古い火山弧や造山帯も、重要な金属鉱区になりうる。

### 4.1 GeologicalProvince

地形生成後、セル群またはポリゴンとして次の `GeologicalProvince` を生成する。

| 種類 | 主な資源傾向 |
|---|---|
| 造山帯・古い火山弧 | Cu-Au-Ag、Pb-Ag-Zn、金脈、スカルン鉄 |
| 古い楯状地 | 鉄、金脈、ニッケル等の将来拡張 |
| 花崗岩帯 | Sn、W、Cu、下流の Sn 砂鉱 |
| 石灰岩台地・前縁盆地 | Pb-Zn-Ag、鉄、石材 |
| 裂け目・堆積盆地 | 堆積性 Cu、Pb-Zn、Coal、Salt |
| 熱帯風化高原 | ラテライト鉄、ボーキサイト等の将来拡張 |
| 河川集水域 | 上流の金・錫鉱床に対応する砂金・砂錫 |

最初の実装ではプレート・地殻モデルを新設せず、Heightmap の山脈線、火山列、
高地、石灰岩・盆地を表す疑似フィールドから決定論的に生成してよい。

### 4.2 MineralDistrict と併産

`MineralDistrict` は地図上で認知される「鉱区」であり、複数 `MineralDeposit` を持つ。
Good 1 件につき 1 地点ではなく、以下のような併産パターンを基本とする。

| 鉱区型 | 主産物 | 随伴・副産物 |
|---|---|---|
| Porphyry / skarn | Copper | Gold, Silver, Iron |
| Polymetallic vein | Lead, Silver | Zinc, Copper, Gold |
| MVT / SEDEX | Lead, Zinc | Silver |
| Granite tin | Tin | Copper, Silver |
| Shield iron | Iron | Gold の可能性 |
| Placer | Gold または Tin | 上流鉱床が発見済みなら発生率を上げる |

Silver と Lead は原則同じ鉱区に置く。これにより、貨幣と弾丸・工業用途の間に
自然な競合が生まれる。

## 5. データモデル

鉱床は Economy 拡張が所有する。正規の保存先は
`simulation.extensions.economy` であり、既存コードとの互換のため実行中には
`pack.mineralGeologicalProvinces` / `pack.mineralDistricts` /
`pack.mineralDeposits` としても参照できる。生成・更新は Economy の Generator、
描画は Economy の Renderer、編集は Controller に分離する。

```ts
export type MineralCommodity =
  | "iron"
  | "copper"
  | "tin"
  | "lead"
  | "silver"
  | "gold"
  | "coal"
  | "saltpeter"
  | "sulfur";

export type DepositType =
  | "bandedIron"
  | "lateriteIron"
  | "porphyry"
  | "skarn"
  | "polymetallicVein"
  | "mvt"
  | "sedex"
  | "graniteTin"
  | "lodeGold"
  | "placer"
  | "coalSeam"
  | "evaporite";

export interface MineralYield {
  commodity: MineralCommodity;
  /** 精錬済み金属相当の含有量。Gold/Silver は t、それ以外も t。 */
  reserveTons: number;
  /** 現在の技術と設備における最大年産。 */
  annualCapacityTons: number;
}

export interface MineralDeposit {
  i: number;
  districtId: number;
  cell: number;
  type: DepositType;
  yields: MineralYield[];
  depth: "surface" | "shallow" | "deep";
  accessibility: number; // 0..1。地形・道路・港・水利の合成
  discovered: boolean;
  exhausted: boolean;
}

export interface MineOperation {
  i: number;
  depositId: number;
  burgId?: number;
  workers: number;
  technology: number;
  drainage: number;
  fuelAccess: number;
  annualOutputTons: Partial<Record<MineralCommodity, number>>;
}
```

`reserveTons` は鉱石重量ではなく、便宜上「回収可能な精錬済み金属相当量」とする。
これにより初期実装で品位・回収率・選鉱廃石を分けずに済む。精密化は後段である。

## 6. 量と配置の初期値

### 6.1 面積は鉱区数、人口は需要

`A = 陸地面積 km² / 100,000` とする。陸地面積は `sum(land cell.area) * distanceScale²`
を用いる。地図の距離単位が km でない場合は km へ換算する。

以下は可視の `MineralDistrict` の基準密度であり、個別の坑口数ではない。地質州に
応じて 0〜3 倍の補正を掛ける。

| 鉱区 | 基準密度 / A |
|---|---:|
| Iron | 1.0–3.0 |
| Copper | 0.3–1.0 |
| Lead-Silver-Zinc | 0.2–0.8 |
| Tin | 0.05–0.25 |
| Lode Gold | 0.1–0.5 |
| Placer Gold / Tin | 0.5–2.0 |

この表は地図の見栄えと探索対象の密度を決める。供給保証は次節の年産目標から
別に行う。鉱物は面積に比例して均等に置かない。

### 6.2 平時年産の目安

人口 100 万人あたり、交易を含む経済圏で望ましい精錬済み金属年産の初期レンジ。
これは調整可能なゲーム値であり、史実の一点推定ではない。

| 時代 | Iron | Copper | Tin | Lead | Silver | Gold |
|---|---:|---:|---:|---:|---:|---:|
| 中世的 | 1–4 千 t | 50–200 t | 5–25 t | 100–500 t | 0.5–3 t | 1–10 kg |
| 火薬時代 | 5–15 千 t | 200–800 t | 20–100 t | 0.5–3 千 t | 1–8 t | 2–20 kg |

この需要は、国家ごとに完全自給させない。生成後に経済圏単位で次を検査する。

- 人口の 95% が、到達可能な市場から鉄を調達できる
- 錫は希少でよいが、青銅を使う経済圏には少なくとも 1 本の輸入経路がある
- 金銀は採掘、交易、貢納、既存貨幣の再鋳造のいずれかから得られる
- 火薬時代の軍事大国は鉄・鉛・硝石・硫黄・燃料の最低二重供給を持つ

### 6.3 鉱床規模と寿命

各鉱床の埋蔵量は次式で作る。

```text
reserveTons = annualCapacityTons × mineLifeYears
mineLifeYears = 40–250 年を中心とする対数正規分布
```

- 小鉱山: 20–80 年。浅部の露頭・砂鉱。短期の開発ブームを作る
- 地域鉱山: 80–250 年。通常の鉱脈・鉄鉱床
- 大鉱区: 300–800 年。少数だけ生成し、世界規模の交易・覇権の理由にする
- 未発見・深部鉱床: 稼働鉱山の合計年産の 1–3 倍を潜在資源として隠す

これにより初期地図で供給を満たしつつ、数百年の Advance Time でも全資源が一斉に
尽きる問題を避ける。

## 7. 貨幣設計

貨幣に必要なのは年間生産量だけでなく、流通・退蔵・国庫にある金属在高である。
`Coins` Good を物理的な全貨幣とみなさない。

```ts
export interface MintLedger {
  stateId: number;
  silverEquivalentStockKg: number;
  goldCoinKg: number;
  silverCoinKg: number;
  copperCoinKg: number;
  treasuryKg: number;
  circulatingKg: number;
  hoardedKg: number;
}
```

初期目標は実人口 `P` に対し、銀換算で以下を使う。

```text
中世的: M_target = P × 20–60 g Ag-eq
近世的: M_target = P × 60–180 g Ag-eq
年間純鋳造 = (M_target - currentStock) / 20 年 + currentStock の 0.5–2%
```

金・銀・銅の比率、金銀比価、貨幣品位は時代・国家ごとのパラメータとする。
貨幣不足は必ずしも鉱山不足ではない。輸入、貢納、略奪、再鋳造、品位低下でも補える。

## 8. 採掘と精錬

| 技術段階 | 採掘 | 主制約 | 解放される能力 |
|---|---|---|---|
| 露頭・砂鉱 | 露天掘り、パンニング、樋選鉱 | 季節、水流、浅部枯渇 | Gold / Tin 砂鉱、酸化鉱、表層鉄 |
| 初期坑道 | 横坑・立坑、火あぶり割り、手作業の荷揚げ | 坑内水、換気、木材 | 浅い Pb-Ag・Cu・Sn 鉱脈 |
| 水力鉱山 | 水車ポンプ、巻上げ、砕鉱・選鉱 | 河川・水利権、木炭 | 深部鉱脈、より大きい年産 |
| 火薬・高炉 | 発破、揚水、スタンプ、焙焼、高炉・精錬炉 | 石炭/木炭、硫黄、硝石、技術者 | 大規模鉄、砲、深部の低品位鉱 |

主要な精錬チェーンは以下とする。

```text
Iron deposit    → bloomery / furnace → Iron Good
Copper deposit  → smelter            → Copper Good
Tin deposit     → smelter            → Tin Good
Pb-Ag deposit   → lead smelter       → Lead Good + Silver Good
Gold deposit    → washing/smelting   → Gold Good
Copper + Tin    → foundry            → Bronze Good
Silver/Gold/Copper → mint            → MintLedger の貨幣在高
Saltpeter + Sulfur + charcoal/coal → Gunpowder Good
Iron/Bronze + fuel → Artillery Good
```

最小実装では、鉱山の `annualOutputTons` を既存 Good へ投入する。Ore Good の追加、
品位、選鉱、回収率は後段の精密化である。

## 9. 火薬軍需

火薬時代に鉄だけを増やしても不十分である。軍需は人口需要とは別に、連隊・砲兵・
戦争強度から追加する。

```text
ironDemand = civilianBase + firearmsReplacement + artilleryMass / serviceLife
leadDemand = civilianBase + expectedShots × projectileMass
powderDemand = expectedShots × powderCharge + artilleryShots × artilleryCharge
```

数値は戦闘・補給システムの定義に従う。重要なのは、戦争中だけ Lead / Saltpeter /
Sulfur / fuel が急増し、平時の市場価格と軍需調達が競合する構造を作ることである。

## 10. 実装計画

### Phase 0: 計測可能にする

目的: 現行の Good セル配置と生産量を可視化し、新モデルの基準を作る。

実装済み:

1. Economy の Goods Editor に、各 Good のセル数と実人口 1,000 人あたりの生産を表示する。
   生産・在庫の tooltip には市場圏別産出と市場在庫も表示する。いずれも既存 Economy
   の抽象単位であり、物理的な鉱量・年産トンではない。
2. `Lead` Good と `good-lead` SVG symbol を追加した。ただし従来どおり Good セル配置であり、
   鉱床・埋蔵量ではない。
3. `Sulfur` Good と `good-sulfur` SVG symbol を追加し、Gunpowder を Saltpeter + Sulfur +
   Coal のレシピに変更した。Sulfur / Gunpowder / Artillery は火薬時代外では無効化する。
4. `mines` Marker の説明文に、物語用 Marker で Economy の Goods・鉱床・生産と未接続で
   あることを明記した。

検証:

- Good 追加時に既存天然 Good の配置が不当に薄まらないこと
- 既存セーブを開けること
- Economy 無効時に鉱物関連データを参照しないこと

### Phase 1: 静的な鉱床と鉱区

目的: 地図生成時に地質的な資源下地を保存する。

実装済み:

1. `mineralResources.ts` が、バイオームを参照せず、Heightmap・河川・地図 seed から
   `orogen` / `shield` / `granite` / `carbonate` / `basin` / `placer` の疑似地質州を
   決定論的に分類する。
2. 地質州に応じて鉱区と鉱床を生成する。Pb-Ag 系を優先し、Tin は graniteTin または
   placer にのみ置く。Goods のセル配置・市場生産にはまだ接続しない。
3. 通常の `.fmg` 保存では Economy 拡張スライスに保存し、旧 `.map` 形式では任意の
   末尾スロットに保存する。旧ファイルでは空配列として復元する。
4. Full / Minimal JSON export に `mineralResources`（地質州・鉱区・鉱床・稼働鉱山）を含める。
   Tools の **Mineral deposits** はこの静的データだけを再生成する。

1. `src/extensions/economy/` に鉱物資源の context holder、型、Generator を追加する。
2. `pack.mineralDistricts` と `pack.mineralDeposits` を定義し、保存・ロード互換を追加する。
3. Heightmap / rivers / terrain の結果から疑似 `GeologicalProvince` を生成する。
4. 地質州に基づき MineralDistrict と随伴鉱物を決定論的に生成する。
5. 既存 Goods のセル配置と鉱床をまだ接続しない。まず JSON export とデバッグ表示で
   地質的な偏り、併産、地図端への偏りを確認する。

検証:

- 同 seed で鉱区・鉱床が再現されること
- 鉱物はバイオーム変更だけでは再配置されないこと
- Silver が Pb-Ag 系の鉱区に主として現れること
- Tin が花崗岩帯・河川集水域外に大量発生しないこと

### Phase 2: 稼働鉱山と市場供給

目的: 鉱床の埋蔵量・年産・労働・枯渇を Economy に接続する。

実装済み:

1. 各鉱床に commodity ごとの `reserveTons` / `annualCapacityTons`、深さ、到達性を保存し、
   市場圏に到達する鉱床から `MineOperation` を生成する。作業者、技術、排水、燃料到達性、
   河川・経路由来の到達性で年産を制限する。
2. Economy の約 30 日ごとの生産サイクルで、鉱山は市場の Good 在庫に月次供給し、同時に
   埋蔵量を減算する。枯渇した鉱床と鉱山は停止する。Pb-Ag 鉱床は両 Good を同時供給する。
3. Iron / Copper / Tin / Lead / Silver / Gold / Coal / Saltpeter / Sulfur は、従来の Good セル
   からの人口比例ボーナス生産を行わない。鉱山がない地図では新たな鉱物供給は生じず、
   既存在庫と交易だけが残る。
4. `mineOperations` を Economy 拡張スライスおよび旧 `.map` の mineral-resource スロットに
   保存する。市場在庫へ入るため、既存の価格計算と交易候補はその供給をそのまま利用する。

初期実装の範囲:

- 作業者は Burg 人口から物理的に差し引かない抽象的な採掘労働力である。
- 燃料到達性は定数から始め、Coal / Wood 在庫との実需競合は後続段階で精密化する。
- `Mineral deposits` の再生成は鉱床・稼働鉱山・埋蔵量を新規作成するため、編集済みの
  鉱山状態を維持する操作ではない。

1. `MineOperation` を作り、発見済み・到達可能な鉱床から初期稼働鉱山を選ぶ。
2. 月次 Economy tick で採掘量を計算し、`reserveTons` から減算して市場に Good を投入する。
3. 水利、燃料、道路・港、労働者、技術を年産上限に掛ける。
4. Pb-Ag 鉱床は Lead と Silver を同時に供給する。
5. 現行の Iron 等の「人口比例の天然生産」を、鉱物 Good だけ段階的に鉱山供給へ置換する。

検証:

- 鉱床がなくても Iron 等が無限生産されないこと
- 枯渇後に市場在庫・価格・交易ルートへ影響が出ること
- 鉱山を持たない国家が輸入で存続できること
- 1 鉱山の停止で全世界が即時に停止しないこと

### Phase 3: 貨幣とミント

目的: 金銀銅の供給を通貨・財政に接続する。

実装済み:

1. State ごとの `MintLedger` を Economy 拡張状態として保存する。Ledger は通貨需要、
   流通在高、月次鋳造額、累積鋳造額、鋳造差益を持つ。旧 `.map`、`.fmg`、JSON export にも
   含まれる。
2. 各 State は最大の自国市場を Mint として使う。月次 Economy cycle で Gold / Silver /
   Copper の市場在庫を最大 20% まで実際に消費し、額面価値に変換して Ledger の流通在高へ
   加える。初期の流通在高は六か月分を与え、鉱山・銀山の停止が即時の通貨消滅にならない。
3. 鋳造額の 2% だけを `state.treasury` に差益として入れる。金属在庫、通貨流通在高、
   treasury を同じ富として重複加算しない。
4. `Coins` Good は Gold / Silver を消費する物理貨幣ではなく、両替・鋳造の `service` Good に
   再定義した。物理的な通貨供給は MintLedger だけが担う。

初期実装の範囲:

- 需要は State 人口、都市人口、所属市場の在庫価値から求める調整用の抽象値である。
- 再鋳造、貨幣品位、国際収支、国庫からの実支出による流通量変化はまだ実装しない。
- Mint は Market ごとの施設ではなく、State が選ぶ代表市場として扱う。

1. `MintLedger` を State または Economy state に追加する。
2. Mint を Burg の施設または State の機能として実装し、Gold / Silver / Copper を
   貨幣在高へ転換する。
3. 人口・都市化・交易規模から貨幣需要を算出する。
4. 鋳造、再鋳造、退蔵、貿易収支、品位低下を段階導入する。
5. `Coins` Good は物理貨幣から、両替・鋳造・流通の抽象 Good へ再定義するか廃止する。

検証:

- 銀山喪失で通貨供給が直ちにゼロにならず、在高・輸入・再鋳造で緩衝されること
- 長期には鉱山、戦争、交易収支が財政へ影響すること
- 金貨・銀貨・銅貨の合計価値が二重計上されないこと

### Phase 4: 火薬・戦略資源・発見

目的: 近世化と資源争奪を表現する。

実装済み:

1. `Sulfur` と `Saltpeter + Sulfur + Coal -> Gunpowder` のレシピは Phase 0 で導入済みである。
   火薬時代を無効にすると、火薬・砲兵 Good とともに軍需 Ledger も需要をゼロにする。
2. State ごとの `MilitaryResourceLedger` を Economy 拡張状態に保存する。砲兵、および名称が
   arquebus / musket / firearm / gunner を含む火器部隊から、年間の Iron / Lead / Gunpowder
   需要を算出する。月次 cycle では代表市場の各在庫を最大 1/3 まで実際に消費するため、
   軍拡は Iron だけでなく Lead と Gunpowder を競合させる。
3. Ledger は火薬の材料換算として Saltpeter / Sulfur / Coal 需要も保持する。ただし原料は
   火薬 Good のレシピが一度だけ消費する。Ledger が同じ原料在庫を再度減らすことはない。
4. 初期稼働は river / route を持つ、到達性 0.50 以上の鉱床に限定する。`economy.mines.prospect`
   Extension command は現時点の river / route 到達性を再評価し、到達性 0.35 以上の未発見鉱床を
   開山する。深部鉱床は同時に排水 0.70、技術 1.10 へ改善される。道路・港の編集後にこの
   command を呼ぶことで追加鉱区を稼働化できる。
5. `militaryResourceLedgers` は Economy slice、旧 `.map` の mineral-resource slot、JSON export に
   含める。市場在庫を消費するだけなので、既存の価格計算・生産・交易とそのまま連動する。

この段階では、鉱区の法的権利、鉱山専用租税、戦時徴発、外国投資を Nobility / Characters の
イベントへ接続していない。それらは MineOperation の国家帰属・契約・支払先を別途設計してから
導入する（市場在庫を直接書き換えるイベントは追加しない）。

検証:

- 火薬時代の軍拡が Iron だけで完結しないこと
- Lead-Silver 鉱区が貨幣と弾薬の両方で戦略的になること
- 新鉱区の発見が交易・人口・国家財政を変えうること

## 11. アーキテクチャ上の制約

- 鉱床・鉱山を Economy 拡張が所有しても、地図の core Generator や Renderer が
  Economy の実装詳細を import しない。
- 生成・採掘で `pack` を変更するのは Generator / Editor のみとする。Renderer は
  `Readonly<WorldContext>` から鉱区と鉱山を描くだけにする。
- SVG layer は `ViewContext` に追加しない。Economy extension が `api.addLayers()` と
  `api.getSvgLayer()` を使って所有する。
- 動的 extension との将来連携は `ExtensionAPI` または CustomEvent を使い、host module を
  直接 import しない。
- セーブ互換のため、鉱床配列が存在しない旧マップはロード時に seed と地図形状から
  決定論的に補完するか、「資源未生成」として明示的な再生成操作を提供する。

## 12. 未決定事項

- `pack` に永続化するか、Economy 専用の extension state に永続化するか
- 鉱区をセル集合で持つか、中心セルと半径だけで持つか
- 鉱床をユーザーに全公開するか、未発見状態を表示するか
- 鉱山労働者を Burg 人口から実際に引き抜くか、抽象労働力として扱うか
- 個別 Ore Good を Phase 2 から導入するか、精錬済み金属相当のまま進めるか
- 石炭と木炭を区別し、森林枯渇システムとどの深さで接続するか

これらは Phase 1 の地図分布と Phase 2 の市場影響を観察してから決める。初期段階で
全てを物量シミュレーションにしないことを優先する。
