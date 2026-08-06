# バイオーム拡張計画

## 目的

現在の標準バイオーム13種は、世界全体を気温と湿潤度で大まかに表すには十分である。一方、現実の地域性やファンタジー世界の舞台として重要な植生・地形の差を表すには粒度が足りない。

本計画では、現在の13種を出発点として標準カタログを再設計し、以下のバイオームを追加する。現在の数値ID・名称・配列順は新設計の制約にしない。一方で既存 `.fmg` は、ロード境界の専用 `LegacyBiomeCodec` で新しい正規形式へ一回だけ移行する。特に「中世ドイツ風の通常の大森林」を、単に広い `Temperate deciduous forest` として扱うのではなく、温帯混交林と人為改変の少ない森林景観を表す選択肢として追加する。

この計画は、気候からの自動割当、地図上の見た目、居住・移動・資源生成への影響を一貫して実装するための設計書である。

開拓・定住により森林が伐採・再生する時間的な処理は、[未領有フロンティアと段階的領土拡張](frontier-expansion.md) が所有する。本書は「どの環境が森林になりうるか」という潜在自然植生と、その森林特性を定義する。

## 現状

`src/generators/biomes.ts` の `Biomes.getDefault()` は、次の13種を定義している。

```text
Marine
Hot desert
Cold desert
Savanna
Grassland
Tropical seasonal forest
Temperate deciduous forest
Tropical rainforest
Temperate rainforest
Taiga
Tundra
Glacier
Wetland
```

自動割当は主に `biomesMatrix` の気温・湿潤度バンドで決まり、海抜、海岸、河川、湿地については `getId()` の個別条件で補正する。このため、新しいバイオームの多くは気温・湿潤度だけでは既存種と区別できない。

現在の `Glacier` は低温セルをそのまま割り当てるため、温暖な地方の高山で森林限界より上にあるが、夏には植生が露出する地域まで氷河扱いになりうる。新設計では低温と永続雪氷を同一視しない。

既存の `Temperate deciduous forest` は、通常の中欧のブナ・ナラを主体とする落葉広葉樹林を表す用途には引き続き適切である。新設する「中世ドイツ風の通常の大森林」は、その置換ではなく、より冷涼な温帯混交林、針葉樹を含む深い森林、低い開墾率を意図的に選べるようにする追加カテゴリとする。

## 追加対象

| 優先度 | 追加する識別子（仮） | 表示名（仮） | 想定する現実・創作上の用途 | 現在の代用 |
| --- | --- | --- | --- | --- |
| 高 | `centralEuropeanGreatForest` | Central European great forest | 中世ドイツ、黒い森、ビャウォヴィエジャの森、カルパチア周縁などの広大な温帯混交林。中欧ではブナ・ナラ、ビャウォヴィエジャ周辺ではナラ・シナノキ・シデ・トウヒ・マツなど、地域に応じた樹種混合と深い森林を表現する | Temperate deciduous forest / Taiga |
| 高 | `mediterraneanWoodlandScrub` | Mediterranean woodland & scrub | 南欧、ギリシャ、イタリア、アナトリア。夏季乾燥、硬葉樹、低木、石灰岩質の景観 | Grassland / Temperate deciduous forest |
| 高 | `temperateConiferousForest` | Temperate coniferous forest | 中欧の山地、北米北西部、温帯の針葉樹林・針広混交林。`Taiga` ほど寒冷ではない | Taiga |
| 中 | `montaneForest` | Montane forest | アルプス、ヒマラヤ、火山島などの森林限界より下にある山地林・亜高山林。低地が温暖でも標高によって針葉樹・矮性樹の林となる | Taiga |
| 中 | `alpineTundra` | Alpine tundra | 森林限界より上で、夏には地表が露出して矮性低木、草、苔、地衣類が育つ高山帯。低緯度の高峰にも成立する | Tundra / Grassland |
| 中 | `mangrove` | Mangrove | 熱帯・亜熱帯の河口・海岸湿地。港湾、漁業、危険な水路、沿岸防災の舞台 | Wetland |
| 中 | `xericShrubland` | Xeric shrubland | 中央アジア、アラビア周縁、岩石砂漠の縁、荒野の国境地帯 | Cold desert / Grassland |
| 中 | `cloudForest` | Cloud forest | アンデス、中央アメリカ、東南アジア、霧深い山岳王国。高湿度・急斜面・固有種を表現する | Tropical rainforest |
| 低〜中 | `heathMoorland` | Heath & moorland | 英国・北欧のヒース、ポリーシャを含む東欧の泥炭湿地、古墳や魔女伝承のある荒野 | Grassland / Wetland |
| 低 | `floodedForest` | Flooded forest & riparian woodland | アマゾンの氾濫原、ポリーシャ／プリピャチ湿地の河畔林、巨大河川沿いで季節的に冠水する森林 | Tropical rainforest / Wetland |

既存の `Glacier` は標準カタログで **`Glacier & perennial snowfield`** へ表示名と意味を改める。これは氷河、氷帽、万年雪渓のように、融雪期にも雪氷が残り、植生がほぼ成立しない地表を表す。冬季だけの積雪はバイオームではなく、将来の `snowCover` のような季節的な表示・気候属性で扱う。

WWFの陸上生態地域区分にも、地中海性森林・低木地、山地草原・低木地、マングローブなどは独立したカテゴリとして扱われている。[WWF Global 200](https://files.worldwildlife.org/wwfcmsprod/files/Publication/file/5xdxix5fsv_The_Global_200_Priority_Ecoregions_for_Global_Conservation.pdf) 特にマングローブは、熱帯・亜熱帯の水没しやすい海岸に適応した森林であり、一般的な内陸湿地とは区別する価値がある。[WWF: Mangroves](https://www.worldwildlife.org/resources/explainers/mighty-mangroves/)

## バイオームではなく属性として扱うもの

次の要素は気候・植生の分類そのものではないため、上記の標準バイオームには追加しない。将来はバイオームに重ねる属性として実装する。

| 属性 | 例 | 用途 |
| --- | --- | --- |
| 森林被覆・密度 | `forestCover: 0..1` | 樹冠・森林面積の連続量。「鬱蒼」を表現し、巨大森林の面積は地域マスクと併用して決める |
| 森林状態 | young / mature / ancient | 原生性、樹齢、管理の履歴を表現する |
| 林相 | broadleaf / conifer / mixed | 同じ気候帯でも樹種構成を変える |
| 土地被覆 | naturalForest / managedForest / cropland / pasture / settlement | 中世の開墾地、王領林、伐採地、集落を表現する |
| 沿岸ハビタット | sandyBeach / rockyIntertidal / tidalFlat / coastalDune | 潮間帯の砂浜・磯・干潟・砂丘を表現する。海亀、カニ、貝、海鳥、採貝・塩田・港湾に影響する |
| 沿岸浅海ハビタット | rockyReef / coralReef / seagrassMeadow | 海岸に隣接する浅海の岩礁・サンゴ礁・海草藻場を表現する。漁場、航行危険、海洋生物の産卵・育成場所に影響する |
| 特殊性 | enchanted / cursed / giantTrees | 魔法の森、暗黒森、巨木の森などのファンタジー要素を表現する |

例:

```text
biome: centralEuropeanGreatForest
forestCover: 0.9
forestCondition: ancient
canopy: mixed
landCover: naturalForest
specialFeature: enchanted
```

この分離により、`Temperate deciduous forest` と `centralEuropeanGreatForest` の双方を「古代の森」にでき、熱帯雨林やタイガにも同じファンタジー表現を適用できる。

同じ考え方で、季節的な積雪は `snowCover` 属性としてバイオームに重ねる。`alpineTundra` は積雪の多い冬と植生が露出する短い夏を持ちうるが、`Glacier & perennial snowfield` は永続雪氷により植生がほぼない状態を表す。

砂浜、磯、干潟、浅海岩礁も気候バイオームではない。これらは干満、波浪、基質、海岸地形で決まる沿岸ハビタットであり、陸地セルには `coastalHabitat`、隣接する浅海セルには `nearshoreHabitat` を重ねる。

```text
biome: temperateDeciduousForest
coastalHabitat: sandyBeach
nearshoreHabitat: rockyReef
```

`sandyBeach` は海亀の産卵、砂浜性カニ、貝、海鳥の生息・採集地、`rockyIntertidal` は潮だまり、カニ、フジツボ、貝、ヒトデ、海藻の生息地として扱う。`tidalFlat` はカニ・貝・渡り鳥と採貝・塩田に、`rockyReef` / `coralReef` / `seagrassMeadow` は漁場・育成場・航行リスクに接続する。`Mangrove` は広い陸上植生と森林資源を持つため、これらの属性ではなく引き続き独立したバイオームとする。

### 沿岸ハビタットの分布と連続性

現実の全球推計では砂質海岸は海岸線のおよそ31%であり、砂浜は海岸の多数派ではない。[NASA Earth Observatory](https://science.nasa.gov/earth/earth-observatory/taking-stock-of-the-worlds-sandy-beaches-92507/) ただし地域差が大きいため、`global` プロファイルの生成目標は海岸線長ベースで **25〜35%** を目安とし、地域プロファイルは地形・気候に応じてこれを上下させる。これは砂浜を全海岸セルへ独立確率で置く値ではない。

まず海岸線を連続した区間へ分割し、各区間を海岸勾配、近傍河川からの堆積物供給、湾による遮蔽、波浪、潮差、基盤岩の露出で分類する。低勾配で砂の供給があり、比較的穏やかな波を受ける湾・河口は `sandyBeach`、急斜面・硬い岩盤・火山島・強い外洋波・フィヨルドは `rockyIntertidal`、非常に平坦で波が弱い河口・内湾は `tidalFlat` / `Wetland` に寄せる。`coastalDune` は十分に長い砂浜区間の背後にだけ置く。

区間の内部では同じハビタットを連続させ、短い遷移帯だけを混在させる。マップの一セルが実世界の浜幅より大きい場合も、セル全体を砂地に塗り替えず、海岸線に沿う帯状の描画として表現する。海亀の産卵地は、温暖な `sandyBeach` のうち、砂丘または高潮線上の乾いた背後地を持ち、人為改変が低い一部区間に限る。

### 港湾・船舶と砂浜

**（2026-08-06改訂）** 当初 `sandyBeach` は正式な港湾・造船拠点の候補から一律除外する設計だった
（旧`allowsFormalHarbor()`）。この方針は [harbor-siting.md](harbor-siting.md) §4.3 で撤回している —
`sandyBeach`・`coastalDune`・`tidalFlat` はいずれも候補地からは除外されず、`coastalHabitatFactor`
による収容力（`harbor`、Burg の港フラグ、shipyard candidate、`Ships`、hull を含む）の縮小として扱う。
砂浜・干潟の背後に港町を置く場合、係留・荷役の実務上は保護された入り江・河口を使う方が自然だが、
ゲームプレイ上のモデルとしては同じ`coastalHabitat`セル上でも港は成立し、防波堤・浚渫の維持費相当分
だけ容量が下がる（現状は容量縮小のみで維持費そのものは未実装 — harbor-siting.md §5.3/§6）。

`tidalFlat`（干潟）も同様に`coastalHabitatFactor`で扱う。本カタログの分類基準
（`classifySegmentBase()`）自体が「非常に平坦・停滞・堆積物過多で泥として堆積」と定義しており、
`sandyBeach`より軟弱・浅い底質になるが、`coastalHabitatFactor`は`sandyBeach`よりむしろ緩やか
（浚渫維持の方が防波堤新設より投資が軽いという判断、harbor-siting.md §4.3）。恒久的に港湾用地へ
転換したい場合は干拓（`coastalHabitat`の書き換え、`urban-water-and-sanitation-system.md`との接続を
想定）を使う設計方針だけを記録し、具体設計・実装は未着手（harbor-siting.md §4.4/§6）。

`rockyIntertidal` であっても、それだけで港を意味しない。正式な港湾・造船所には、既存の港適性に相当する**遮蔽された泊地**、十分な水深、海上経路への接続を別途要求する。岩場は港を許可しうる地質条件の一つにすぎず、外洋に曝された断崖・磯には港を作らない。「十分な水深」および陸側の標高条件の具体的なしきい値・実装配線は [harbor-siting.md](harbor-siting.md) を参照。

一方、砂浜には個人漁師・沿岸採集者の小舟が着岸できる。これは港湾インフラや `Ships` 商品ではなく、`shoreFishing` のような世帯・集落規模の生活活動として扱う。小舟は砂浜での漁、貝・カニ採集、短距離の沿岸移動を説明できるが、港、交易路、造船所、船舶在庫、軍事・遠洋航行の条件を満たさない。小舟を明示的に状態化する必要が生じた場合も、Economy 拡張の shipbuilding queue / completed hulls と別の `smallCraft` または漁業活動として保持する。

### 潜在自然植生と土地被覆

`biome` は気候・水分・標高などから得られる**潜在自然植生**であり、人口や国家領の有無だけで直接変更しない。たとえば `Grassland` には乾燥ステップや高山草原のように、未開地でも森林にならない自然草原が含まれる。このため、開拓前線の世界を表現するために `Grassland` を一律で森林バイオームへ置き換えてはならない。

人口利用によって変化する地表は、`biome` と別の土地被覆レイヤーとして扱う。

```text
biome: Temperate deciduous forest  # 潜在自然植生。原則不変
landCover: naturalForest           # 可変。naturalForest / managedForest / cropland / pasture / settlement 等
forestCover: 0..1                  # 可変。樹冠・森林面積の連続量
```

湿潤な温帯の森林適地では、未定住地の `landCover` を `naturalForest`、`forestCover` を高くする。定住・道路・伐採が進んだ範囲だけが `managedForest`、`cropland`、`pasture`、`settlement` へ転換する。乾燥草原、寒冷草原、海岸草地など、森林適地ではないセルは未定住でも開放的な土地被覆を維持する。

このレイヤーの開始値・変化・再生は開拓システムが決める。本書で定義するバイオーム、林相、土壌、水分、標高は、その変化が許可されるかと、森林再生・開墾の難易度を決める入力となる。

沿岸ハビタットは開拓の有無によって気候バイオームを変えないが、港の建設、干拓、護岸、乱獲、海面変動で変化しうる。海亀の産卵や潮間帯の生物は、`coastalHabitat` を資源・遭遇・保全の条件として参照する。

## 自動生成設計

### 原則

1. バイオームの正本は表示名でも数値IDでもなく、変更しない意味論的な `BiomeKey` とする。例: `temperateDeciduousForest`、`centralEuropeanGreatForest`。
2. 数値コードはセル列と気候マトリクスを高速・省メモリで扱うためだけの内部表現とする。コード値・カタログ順・配列添字を、ゲームロジック、UI、拡張、保存形式の意味論的な契約にしてはならない。
3. `biomesMatrix` を単に拡張するだけでは表せない条件は、気候バンド以外の明示的なルールで判定する。
4. 同じ気候条件で複数候補が競合する場合は、ワールドの地域プロファイルと空間的な地域マスクで選ぶ。気候だけで「中欧の大森林」と通常の温帯落葉樹林を恒久的に区別することはできない。
5. 新しいアーカイブでは、セルの内部コードとともにカタログのキー・定義スナップショットを保存する。将来のカタログ並べ替えや追加によって、保存済みセルの意味が変わらないようにする。
6. 旧 `.fmg` の数値コード・並行配列・古いデータスロットは `LegacyBiomeCodec` だけが解釈する。新しい Generator、Renderer、Controller、Extension に旧形式の分岐を持ち込まない。

### 判定に使う情報

| 情報 | 主な対象 |
| --- | --- |
| 気温・降水量 | 地中海性森林、温帯針葉樹林、乾燥低木地、雲霧林の候補抽出 |
| 標高・傾斜 | 山地林・高山草原、雲霧林 |
| 海岸からの距離・低標高 | マングローブ |
| 河川流量・氾濫原フラグ・湿潤度 | 冠水林・河畔林 |
| 土地被覆・水分保持 | ヒース／湿原性荒野 |
| 海岸勾配・堆積物・波浪・潮差 | sandyBeach / rockyIntertidal / tidalFlat / coastalDune |
| 水深・海底基質・海水温・透明度 | rockyReef / coralReef / seagrassMeadow |
| 年間の雪氷収支・夏季融雪の有無 | Glacier & perennial snowfield |
| 標高・風向・夏季気温による森林限界 | Montane forest / Alpine tundra |
| 地域プロファイル・ノイズによる連続領域 | 中欧の大森林、地中海性植生など、気候だけでは重なる種類 |

### 判定順序（案）

`Biomes.getId()` を次の優先順位へ発展させる。実際の閾値はマップサイズ・気候スライダーごとに調整し、定数へ切り出す。

1. 海などの排他的な地表状態を判定する
2. 年間の雪氷収支が正で、夏にも雪氷が残るセルを `glacier`（表示名: Glacier & perennial snowfield）に判定する
3. 沿岸低地かつ高温多湿なら `mangrove` を判定する
4. 河川・氾濫条件を満たすセルを `floodedForest` または既存 `Wetland` に判定する
5. 高標高セルは森林限界を基準に、森林限界より下を `montaneForest`、上で植生が成立する場所を `alpineTundra` に判定する。高湿度の熱帯山地は `cloudForest` を優先する
6. 乾燥度が高い温帯・亜熱帯セルを `xericShrubland` または `mediterraneanWoodlandScrub` に判定する
7. 温帯の森林候補を `temperateConiferousForest`、`centralEuropeanGreatForest`、既存 `Temperate deciduous forest` に振り分ける
8. それ以外を既存 `biomesMatrix` の結果へフォールバックする

沿岸ハビタットはこのバイオーム判定の後に独立して生成する。海岸セルの勾配・基質・波浪・潮差から `coastalHabitat` を、隣接する浅海セルの水深・基質・海水温から `nearshoreHabitat` を割り当てる。これらの属性は `Marine`、`Wetland`、陸上バイオームを置き換えない。

### 地域プロファイル

生成オプションに、既定では `global` とするバイオーム地域プロファイルを導入する。

```text
global
medievalEurope
mediterranean
tropicalRiverBasin
mountainRealm
```

`medievalEurope` では、適温・中〜高湿潤の連続した低地・丘陵地を `centralEuropeanGreatForest` に寄せる。地域マスクには低周波ノイズと隣接セルへの伝播を使い、細かく散った斑点ではなく「巨大森林地帯」として生成する。

ビャウォヴィエジャ／ポリーシャ型の地域では、単一バイオームに統一しない。乾いた低地・丘陵地を `centralEuropeanGreatForest`、泥炭質で排水の悪い低地を `heathMoorland` と既存 `Wetland`、河川・季節的氾濫原を `floodedForest` として連続配置する。この森林・湿原・河畔林のモザイク自体が、開拓や道路建設を困難にする地理的特徴である。

他プロファイルでも新規バイオームは利用可能とするが、プロファイルは出現率・連続性・優先順位を調整するだけで、既存の地形・気候生成を置き換えない。

## データモデルとコード変更

### カタログを正本にする

現在は `name`、`color`、`habitability`、`iconsDensity`、`icons`、`cost` が並行配列で定義され、配列添字がバイオームIDを兼ねている。この構造は、並べ替え・挿入・削除のたびに意味が変わり、数値範囲による判定を誘発する。本計画では並行配列と数値IDを正本から廃止する。

```ts
export const BIOME_KEYS = [
  "marine",
  "hotDesert",
  "coldDesert",
  // ... existing and newly planned standard biomes
  "floodedForest"
] as const;

export type BiomeKey = (typeof BIOME_KEYS)[number];
export type BiomeCode = number;

export interface BiomeDefinition {
  readonly key: BiomeKey;
  readonly label: string;
  readonly color: string;
  readonly habitability: number;
  readonly movementCost: number;
  readonly relief: { readonly density: number; readonly icons: readonly string[] };
  readonly tags: readonly BiomeTag[];
}

export interface BiomeCatalog {
  readonly definitionsByKey: Readonly<Record<BiomeKey, BiomeDefinition>>;
  /** Internal lookup only. Its order and values have no semantic meaning. */
  readonly keysByCode: readonly BiomeKey[];
  readonly codesByKey: Readonly<Record<BiomeKey, BiomeCode>>;
}
```

`BiomeTag` は `forest`、`wetland`、`mountain`、`coastal`、`dry`、`cold` 等の閉じた union 型とする。標準バイオームは `BiomeKey` の union でコンパイル時に網羅性を検査し、ユーザー作成バイオームが必要になった時だけ別の `CustomBiomeDefinition` として明示的に扱う。

セル列は密な `Uint8Array` を維持するが、名称を `pack.cells.biomeCode` に改める。これは `BiomeCode` だけを格納する内部列であり、セルの意味を読む側は必ず `BiomeCatalog` を経由して `BiomeDefinition` または `BiomeKey` を取得する。`biomeCode === 6`、`biomeCode > 4 && biomeCode < 10` のような比較は全面的に禁止する。

気候マトリクスもソース上では `BiomeKey` で記述し、カタログ初期化時にだけ `Uint8Array` のコードへコンパイルする。これにより、定義の並べ替え、追加、削除で気候ルールの意味が変わらない。

新しい保存形式は `BiomeCatalogSnapshot`（キー、定義、カタログ版）と `biomeCode` 列を対で保存する。読み込み時はスナップショットからカタログを復元・検証してからセル列を読む。これにより、将来の保存データはコンパクトさを保ちつつ、コード値を永続的なIDとして固定しない。

### 旧 `.fmg` の移行境界

`src/io/legacy/legacyBiomesV1.ts`（仮）に、現行 `.fmg` 用の純粋な `LegacyBiomeCodec` を置く。これは旧 `src/generators/biomes.ts` を複製・維持するものではない。生成処理・D3・グローバルコンテキストに依存せず、旧ファイル内のバイオーム部分だけを新しい正規データへ変換する小さな codec とする。

```text
旧 .fmg
  data[3]  : color | habitability | name の並行配列
  data[16] : 各セルの旧数値コード
      ↓ LegacyBiomeCodec
BiomeCatalogSnapshot + biomeCode
      ↓
通常の新アーカイブ読込経路
```

標準の旧コード `0..12` は、codec 内だけにある固定の `LEGACY_BIOME_KEY_BY_CODE` で `BiomeKey` へ対応付ける。たとえば旧コード `6` の意味は codec 内でだけ `temperateDeciduousForest` とする。新しいランタイムには旧コードの知識を残さない。

旧ファイルに追加されたカスタムバイオームは `legacyCustom:<oldCode>` のキーを発行し、保存済みの色・居住適性・名称を引き継ぐ。旧形式が保存していない地形アイコン、移動コスト、タグには明示的な安全既定値（アイコンなし、標準移動コスト、タグなし）を入れる。この復元精度は現行ローダーと同等であり、存在しなかった情報を推測して補わない。

`LegacyMapCodecAdapter` は、旧ファイルを読み取った直後にこの変換を実行し、以後は新形式の `WorldDocument` として扱う。旧形式から直接 Renderer や `worldContext` を構築してはならない。将来的に対応する旧形式が増える場合は、バージョンごとに小さな codec を追加し、共通の正規形式へ集約する。

### 修正対象

| 対象 | 変更内容 |
| --- | --- |
| `src/generators/biomes.ts` | `BiomeCatalog`、標準定義、キーで記述した気候ルール、コードへのコンパイル、地域プロファイルに基づく割当を実装する |
| `src/data/constants` | 湿度・気温・標高・海岸・河川流量の閾値を `BiomeConstants` に追加する |
| `src/types/WorldState.ts` | バイオーム定義・地域プロファイル、`coastalHabitat`、`nearshoreHabitat` の型を追加する |
| `src/context/worldContext.ts` と生成オプション型 | 選択中の地域プロファイルを保持する |
| `src/renderers/draw-relief-icons.ts` | 各新規種の植生アイコンを描画する。森林は樹種混合、マングローブは根・水際、ヒースは低木を使う。沿岸ハビタットは砂・岩・潮だまり・干潟として別レイヤーに描く |
| `src/renderers/draw-satellite-texture.ts` | 定義のキー・色・地形アイコンを通じて、既定色・密度を取得する。沿岸・浅海ハビタットのテクスチャを重ねる |
| `src/renderers/webgl/` | カタログから得た色・テクスチャ・タグと沿岸ハビタットを使い、キャッシュ署名がセル列とカタログ内容の双方に追随することを確認する |
| 経済・造船・資源生成 | 木材、樹脂、薬草、湿地資源、沿岸資源の分布条件をバイオームタグと沿岸ハビタットで定義する。`sandyBeach` を shipyard candidate・`Ships`・completed hull の生成候補から除外し、小舟の漁業活動は別モデルにする |
| 国家・文化・経路生成 | 森林・山地・湿地の移動コスト判定を数値ID範囲ではなく `tags` で行う |
| UI | Biomes Editor、凡例、地域プロファイル選択、ツールチップを、配列添字ではなく `BiomeDefinition` と `BiomeKey` で扱う |
| 保存・ロード | `BiomeCatalogSnapshot` と `biomeCode` 列を新規スキーマとして保存・検証する。`LegacyBiomeCodec` を `LegacyMapCodecAdapter` から呼び、旧 `.fmg` を正規形式へ移行する |

### 数値コードへの依存を除去する

現状には `biome > 4 && biome < 10` を森林扱いする箇所がある。数値コードはカタログの実装詳細になるため、この種の比較は設計違反とする。該当箇所は `catalog.hasTag(code, "forest")` または `catalog.getKey(code)` を使うヘルパーへ移行する。

同様に、資源分布で特定の数値集合を参照する箇所は、必要に応じて `forest`、`wetland`、`coastal` 等のタグへ置き換える。ゲームバランス上、個別バイオームを明示指定する方が望ましい場合だけ `BiomeKey` を使う。`BiomeCode` を引数・設定値・保存契約として公開してはならない。

## 既定パラメータの方針

数値は実装時のプレイテストで確定する。初期案は次のとおり。

| バイオーム | 居住適性 | 移動コスト | 見た目・資源の方針 |
| --- | --- | --- | --- |
| Central European great forest | 中 | 高 | 落葉・針葉の混交、木材・獣・薬草。道路外の移動を重くする |
| Mediterranean woodland & scrub | 中 | 中 | 常緑低木・硬葉樹、オリーブ・樹脂・牧畜を想定 |
| Temperate coniferous forest | 低〜中 | 高 | 針葉樹、木材・樹脂・毛皮を想定 |
| Montane forest | 低〜中 | 高 | 山地針葉樹・亜高山林。木材・樹脂・鉱物を想定 |
| Alpine tundra | 非常に低 | 非常に高 | 高山草本・苔・地衣類、鉱物、牧畜・狩猟を想定 |
| Glacier & perennial snowfield | 0 | 通行不能相当 | 氷河・氷帽・万年雪渓。通常の定住・生産対象外 |
| Mangrove | 低 | 非常に高 | 沿岸樹木、水路・漁業・塩・木材を想定 |
| Xeric shrubland | 低 | 中〜高 | 低木・岩地、遊牧・香料・鉱物を想定 |
| Cloud forest | 低〜中 | 高 | 密な常緑樹・霧、希少植物・木材を想定 |
| Heath & moorland | 低 | 中 | ヒース・泥炭・湿地、牧畜・泥炭を想定 |
| Flooded forest & riparian woodland | 中 | 高 | 河畔樹林・季節冠水、漁業・木材・肥沃な周縁を想定 |

## 実装フェーズ

### Phase 1: カタログ基盤 — **実装済み (2026-07-27)**

1. 現在の13種（`Glacier` の再定義を含む）と表の10種を `BiomeKey` と `BiomeDefinition` で定義し、並行配列を撤去する。 ✅
2. `BiomeCatalog`、コードコンパイラ、タグ・キーから定義を引くヘルパーを導入する。 ✅ (`src/types/biome.ts`, `src/data/biomeCatalog.ts`)
3. 数値コード範囲を使う森林判定・資源判定を検索し、タグまたは `BiomeKey` ベースへ移行する。 ✅ (states/cultures/burgs/military/markers/battle/shipyard 等)
4. `pack.cells.biome` を `pack.cells.biomeCode` へ置換し、セル列を読む全呼び出し元をカタログ経由へ移行する。 ✅
5. `BiomeCatalogSnapshot` を新しいアーカイブ形式へ導入する。 ✅ (`biomesDataToSnapshot` / world archive の `biomesData` に keys/tags/definitions を永続化; decode 時 `migrateBiomeCatalog`)
6. `LegacyBiomeCodec` と旧 `.fmg` fixture を追加し、旧標準13種と旧カスタムバイオームを正規形式へ移行する。 ✅ (`src/io/legacy/legacyBiomesV1.ts`, load path)

**残メモ (Phase 1 境界):**
- 経済 `biomeOutput` や military unit `biomes: number[]` は、歴史的 0–12 コード安定のため当面数値のまま。Phase 4 で `BiomeKey` / タグへ寄せる。
- 新規10種はカタログ・手動編集・描画色の既定値まで。気候自動割当は Phase 3。

### Phase 2: 描画と手動編集 — **実装済み (2026-07-27)**

1. 色、地形アイコン、衛星テクスチャ、WebGL描画を追加する。 ✅（標準23種の色/アイコン/衛星アルベド、WebGL キャッシュが `keys` も追随）
2. Biomes Editorから各新規種をセルへ手動適用できるようにし、沿岸ハビタットは専用の海岸編集操作で設定できるようにする。 ✅（Brush の Paint 切替: biome / coastal / nearshore）
3. 砂浜・磯・干潟・浅海岩礁を SVG と WebGL の双方で描画し、海亀、カニ、貝、海鳥、漁場等のコンテンツが参照できるようにする。 ✅（`toggleCoastalHabitats`、`coastalHabitat`/`nearshoreHabitat` 列、cell info / tooltip。当時の `allowsFormalHarbor` は2026-08-06に廃止 — §「港湾・船舶と砂浜」参照）
4. 新規種ごとの居住適性・移動コストを適用し、経路・国家・文化の生成結果を確認する。 ✅（カタログ定義の habitability / movementCost が既存経路で読まれる）

**残メモ (Phase 2 境界):**
- 沿岸ハビタットの自動割当（海岸線区間・25–35% 砂浜）は Phase 3。
- 砂浜の小舟漁業モデルは Phase 4。

### Phase 3: 気候・地形による自動割当 — **実装済み (2026-07-27)**

1. 海岸、河川、標高、傾斜、湿潤度の判定ヘルパーを追加する。 ✅ (`biomeAssignment.ts`, `BiomeConstants` 拡張)
2. 年間の雪氷収支・夏季融雪・森林限界を計算する補助モデルを追加し、Glacier & perennial snowfield、山地林、高山ツンドラを区別する。 ✅ (`isPerennialSnowIce`, `treelineHeight`)
3. マングローブ、冠水林、雲霧林、乾燥低木地を優先ルールで自動割当する。 ✅
4. 気候バンドから地中海性森林・温帯針葉樹林を割り当てる。 ✅
5. 地域マスクを導入し、`centralEuropeanGreatForest` とヒース／湿原性荒野を連続した地域として生成する。 ✅ (`smoothRegionMask`, `biomeRegionProfile`)
6. 海岸勾配・基質・波浪・潮差、水深・海底基質・海水温を使い、沿岸・浅海ハビタットを自動割当する。 ✅ (`coastalHabitatAssignment.ts` — 勾配/流量/水温プロキシ)
7. 海岸を連続区間として分類し、`global` では砂質海岸を海岸線長の25〜35%に調整する。 ✅（区間 BFS + `balanceSandyShare`）。砂浜セルを正式な港湾・造船候補から一律除外する仕様は2026-08-06に撤回し、`coastalHabitatFactor`による収容力縮小へ置き換えた（[harbor-siting.md](harbor-siting.md) §4.3）。

**オプション:** Options → Generation → **Biome region**（`global` / `medievalEurope` / `mediterranean` / `tropicalRiverBasin` / `mountainRealm`）。生成時に `worldContext.options.biomeRegionProfile` へ反映。

### Phase 4: 地域プロファイルとシミュレーション連携 — **実装済み (2026-07-27)**

1. 地域プロファイル選択を生成UIへ追加する。 ✅（Phase 3: Options → Generation → Biome region）
2. `medievalEurope` を実装し、中世ドイツ風の大森林に加え、ビャウォヴィエジャ／ポリーシャ型の森林・泥炭湿地・氾濫原林のモザイクが適切な面積・連続性で現れるよう調整する。 ✅（Phase 3 マスク + 閾値）
3. 経済、造船、軍事、資源、遭遇イベントが新規タグを利用するよう拡張する。 ✅  
   - `biomeTag()` / `biomeOutputByTag`（Wood, Game, Honey, Olives, …）  
   - Burg groups: `biomeTags`  
   - 軍事地形: 新規森林種・山地タグ  
   - 造船: 当時は `allowsFormalHarbor`（砂浜除外）。2026-08-06に廃止し `coastalHabitatFactor`（容量縮小）へ置換 — [harbor-siting.md](harbor-siting.md) §4.3
4. 砂浜の小舟による漁業・採集と、港湾・造船所を必要とする `Ships` / completed hull を分離する。 ✅（`shoreFishing.ts` — informal small craft only）
5. 将来の「古代の森」「魔法の森」等の属性レイヤーを、バイオームを増やさず追加できる形にする。 ✅  
   - `biomeAttributes` 型 + `forestCover` / `forestCondition` / `canopy` / `landCover` / `specialFeature`  
   - 気候生成時に自然林の既定値のみ投入。`specialFeature` は常に none（魔法は後続コンテンツが設定）

## テスト計画

| 種別 | 検証内容 |
| --- | --- |
| 単体テスト | 各バイオームの判定閾値、優先順位、タグ、`BiomeKey` の網羅性、キーからコードへのコンパイル、カタログ検証。高山では森林限界・夏季融雪・永続雪氷を別々に判定すること |
| 生成テスト | 固定seed・地域プロファイルごとに、対象バイオームが0セルにならず、極端に断片化しないこと。海岸の砂質・岩質・干潟・浅海条件に応じて沿岸ハビタットが割り当てられること |
| アーカイブテスト | `BiomeCatalogSnapshot` と `biomeCode` 列の round-trip、未定義キー・重複キー・不正コードを安全に拒否すること |
| レガシー移行テスト | 旧標準13種、旧形式のカスタムバイオーム、旧コード列を `LegacyBiomeCodec` が対応する `BiomeKey` と既定値へ正規化できること |
| レンダラーテスト | SVG・WebGL Hybridの双方で色、可視状態、更新後のキャッシュ無効化を確認する。カタログのコード順を変えても描画結果の意味が変わらないこと |
| E2Eテスト | Biomes Editorでの手動変更、凡例、地域プロファイル選択、保存・再読み込みを確認する。SVGを対象にするテストは必要に応じて `renderMode: "svg"` を明示する |
| バランステスト | 新規森林・湿地・山地を跨ぐ経路、国家拡大、資源、居住人口に不自然な偏りがないこと。砂浜・干潟の漁業活動と、同じセルの正式な港湾・造船・`Ships`（容量が`coastalHabitatFactor`で縮小される）が両立すること — [harbor-siting.md](harbor-siting.md) §4.3 |

## 完了条件

- バイオームの意味は `BiomeKey` と定義オブジェクトだけで決まり、配列添字・数値コード・表示名の変更では決まらない。
- 表の10種と再定義した Glacier & perennial snowfield を含む標準カタログが、凡例、編集画面、新しい保存データ、SVG、WebGLで利用できる。
- 標準カタログの順序を変えても、気候ルール、ゲームロジック、描画、アーカイブ内の各セルが同じ `BiomeKey` を指す。
- 新しいアーカイブは `BiomeCatalogSnapshot` と `biomeCode` 列を検証付きで round-trip できる。
- 旧 `.fmg` は `LegacyBiomeCodec` を通じて新しい正規形式へ移行でき、旧数値コードや並行配列の知識がロード境界の外へ漏れない。
- 海岸・河川・標高・気候・地域プロファイルを必要とする種が、意図した環境に自動生成される。
- `medievalEurope` プロファイルで、`centralEuropeanGreatForest` が中世ドイツ風の連続した大森林として生成される。
- ビャウォヴィエジャ／ポリーシャ型のプロファイルまたは地域マスクで、`centralEuropeanGreatForest`、`heathMoorland`、`Wetland`、`floodedForest` が不自然に細分化されず、連続した森林・湿原・河畔林のモザイクとして生成される。
- 温暖な地方の高峰で、森林限界より上かつ夏に植生が露出するセルは `alpineTundra`、夏にも雪氷が残るセルは Glacier & perennial snowfield となる。単に低温であるだけでは雪氷バイオームにしない。
- 砂浜・磯・干潟・浅海岩礁は気候バイオームを置き換えず、`coastalHabitat` / `nearshoreHabitat` として生成・編集・描画・保存できる。海亀、カニ、貝、海鳥、漁場などのコンテンツはこれらを参照できる。
- `global` プロファイルでは砂質海岸が海岸線長の25〜35%を目安に連続区間として生成される。砂浜・干潟セルの正式な港湾・造船所・`Ships`・completed hull は、2026-08-06以降は一律禁止ではなく`coastalHabitatFactor`による容量縮小として扱う（[harbor-siting.md](harbor-siting.md) §4.3）。個人漁師の小舟は、これらと別の沿岸生活活動として砂浜へ着岸できる。
- 森林・湿地などのゲームロジックが数値ID範囲ではなく、明示的なタグまたは `key` を用いる。
- 古代・魔法・暗黒・巨木などは、追加の気候バイオームではなく、後続の属性レイヤーで表現できる設計になっている。

---

## 後続カタログ拡張（Phase 1–4 実装後のギャップ分析）

Phase 1–4 により標準カタログは 23 種となり、中欧大森林・地中海・山地・マングローブ・冠水林・ヒースなど「代用がきつい」枠は埋まった。一方、遊牧・熱帯乾季林・北方泥炭の三種はまだ `Grassland` / `Savanna` / `Tropical seasonal forest` / `Taiga` / `heathMoorland` への寄せが目立つ。

以下は 2026-07 時点のギャップ分析に基づく。**1–3 は Phase 5 で実装済み**、**4–5 は独立バイオームにせず属性／タグで将来対応するオプション**とする。いずれも数値コード範囲比較を増やさず、`BiomeKey` と `BiomeTag` を正本とする既存規約を守る。

### ギャップ一覧

| 順位 | 方針 | 識別子 | 表示名 | 主な代用の問題 |
| --- | --- | --- | --- | --- |
| 1 | **実装済み** | `coldSteppe` | Cold steppe & forest-steppe | `Grassland` が湿潤温帯草原と寒冷ステップを同一視し、騎馬遊牧・馬産・東欧〜中央アジアの国境味が弱い |
| 2 | **実装済み** | `tropicalDryForest` | Tropical dry forest & thorn woodland | `Savanna` と `Tropical seasonal forest` の中間帯がなく、棘林・乾季落葉・香辛料・南アジア／サヘル縁の舞台が潰れる |
| 3 | **実装済み** | `borealPeatland` | Boreal peatland & muskeg | `Taiga` / `heathMoorland` / `Wetland` では北欧・カナダ型の泥炭苔原・移動地獄・泥炭資源を区別できない |
| 4 | **未来オプション（属性）** | （キーなし）`landCover: oasis` 等 | Oasis / gallery woodland | 砂漠内の河畔緑地。独立バイオームにすると気候マトリクスが汚れやすい |
| 5 | **未来オプション（タグ）** | 既存 `floodedForest` の細分 | Temperate vs tropical flooded forest | アマゾン型とプリピャチ型が同一キー。新キーよりタグまたは地域プロファイルで十分な場合がある |

---

## Phase 5: ステップ・乾季林・北方泥炭の追加 — **実装済み (2026-07-27)**

### 目的

1. **Cold steppe & forest-steppe** により、寒冷〜冷温帯の乾燥草原と森林ステップの縁を、湿潤 `Grassland` から分離する。 ✅
2. **Tropical dry forest & thorn woodland** により、熱帯の明確な乾季をもつ落葉・棘林を、開けたサバナと湿潤季節林から分離する。 ✅
3. **Boreal peatland & muskeg** により、タイガ内の泥炭湿地・蘚類平原を、温帯ヒースと通常の湿地・タイガから分離する。 ✅

いずれも潜在自然植生（`biome`）であり、開拓による農地化は引き続き `landCover` / `forestCover`（[frontier-expansion.md](frontier-expansion.md)）が所有する。

**実装箇所:** `STANDARD_BIOME_KEYS`（26種）、`BiomeConstants` Phase 5 閾値、`classifySpecialBiome` / `applyRegionalForestMask`、`BIOME_SATELLITE`、Horses/Spices の tag 分布、属性 init（dry forest の中密度 canopy）。

### 5.1 カタログ定義案

`STANDARD_BIOME_KEYS` / `STANDARD_BIOME_DEFINITIONS` に末尾追加する（既存 0–22 のコード安定を壊さない）。意味はキーのみ。コード値はカタログ順の実装詳細。

| key | label | 想定 tags | habitability（初期案） | movementCost（初期案） | relief 方針 |
| --- | --- | --- | --- | --- | --- |
| `coldSteppe` | Cold steppe & forest-steppe | `grassland`, `dry`, `nomadic`, `cold?` | 低〜中 | 中 | 草・疎らな低木。森林ステップ縁ではごく疎な `deciduous` / `conifer` を低密度で可 |
| `tropicalDryForest` | Tropical dry forest & thorn woodland | `forest`, `dry` | 中 | 中〜高 | `acacia` / `deciduous` / `deadTree` の棘・乾季落葉。サバナより樹木密度が高い |
| `borealPeatland` | Boreal peatland & muskeg | `wetland`, `cold`, （任意で `forest` は付けない） | 非常に低 | 非常に高 | `swamp` / `grass` / 低密度 `conifer`。タイガ本体より開いている |

**タグ方針の注意**

- `coldSteppe` に `cold` を付けるかはプレイテストで決める。付けると Furs 等の `biomeTag("cold")` に乗る。森林ステップ縁が「寒すぎる」場合は `cold` を外し、気温帯だけで割当する。
- `tropicalDryForest` は必ず `forest`（木材・狩猟）と `dry`（遊牧・砂漠資源の弱い重なりを避けるため、`nomadic` は付けないか弱い）。
- `borealPeatland` は `wetland` + `cold`。`forest` を付けると Wood の tag 生産に乗るが、泥炭地の木材量は低いので **付けない**か、`biomeOutputByTag` で wetland のみ低レートにする。

**色の初期案**（衛星・SVG・WebGL は定義色から取得）

| key | color（仮） |
| --- | --- |
| `coldSteppe` | `#c4c47a`（乾燥した黄土〜灰緑のステップ） |
| `tropicalDryForest` | `#a3a34a`（くすんだ黄緑の乾季林） |
| `borealPeatland` | `#5a6b4a`（暗い苔・泥炭） |

実装時に `draw-satellite-texture` の `BIOME_SATELLITE` 行もカタログ順に追記する。

### 5.2 自動割当（`classifySpecialBiome` / 地域マスク）

既存の優先順（海 → 永続雪氷 → マングローブ → … → マトリクス）に **挿入**する。閾値は `BiomeConstants` に定数化し、プレイテストで調整する。

#### `coldSteppe`

| 条件 | 初期案 |
| --- | --- |
| 気温 | おおよそ `-2°C .. 12°C`（ツンドラより暖かく、温帯落葉の芯より乾燥） |
| 湿潤 | `HOT_DESERT` より上、温帯落葉候補より下（例: moisture 8–16） |
| 標高 | 低地〜丘陵（例: height &lt; 55）。高峰は `alpineTundra` / `montaneForest` を優先 |
| 除外 | 河畔の高流量冠水、海岸マングローブ、永続雪氷 |
| 競合 | 同条件の `Grassland` / `xericShrubland` / マトリクスの grassland 帯 |
| 地域 | `global` では低周波マスクで連続ベルト。将来 `steppeRealm` プロファイルで出現率を上げる |

**森林ステップ縁:** 湿潤が帯の上端かつ隣接に森林セルがある場合、同一キーのまま `canopy` / `forestCover` をわずかに上げる（新キーは増やさない）。見た目は relief 密度で表現する。

#### `tropicalDryForest`

| 条件 | 初期案 |
| --- | --- |
| 気温 | おおよそ `≥ 18°C`（熱帯〜亜熱帯） |
| 湿潤 | サバナより高く、熱帯季節林・熱帯雨林より低い（例: moisture 12–22） |
| 標高 | 低地〜丘陵。雲霧林・山地林の標高帯では負け |
| 除外 | マングローブ条件、冠水林の高流量、サバナの極乾燥 |
| 競合 | `Savanna`、`Tropical seasonal forest`、マトリクス該当帯 |
| 地域 | `tropicalRiverBasin` では川から離れた乾季側に寄せる。`global` ではノイズ連続領域 |

判定位置の案: 既存の地中海・乾燥低木（温帯寄り）のあと、**マトリクスフォールバック前**に熱帯の moisture/temp バンドで差し込む。マトリクスが既に `tropicalSeasonalForest` を返しているセルを、乾燥側だけ `tropicalDryForest` に振り分ける二段でもよい。

#### `borealPeatland`

| 条件 | 初期案 |
| --- | --- |
| 気温 | おおよそ `≤ 6°C` かつ湿地可能な下限より上（例: `> WETLAND_COLD_LIMIT`） |
| 湿潤 | 高（例: moisture ≥ 20）または既存 wetland 条件に近い |
| 標高 | 低〜中（排水不良の平坦地を優先。高峰は alpine / glacier） |
| 除外 | 温帯ヒースの暖側、熱帯湿地、冠水林の温暖高流量 |
| 競合 | `Taiga`、`Wetland`、`heathMoorland` |
| 地域 | `global` の北方マスク、`medievalEurope` の北縁・ポリーシャ寒側。`heathMoorland` はより温帯・ヒース景観に残す |

判定位置の案: 既存 `isWetlandCell` 分岐の内部で、寒冷なら `borealPeatland`、温帯ヒース条件なら `heathMoorland`、それ以外 `wetland`。

### 5.3 地域プロファイル

| プロファイル | 影響 |
| --- | --- |
| `global` | 三種とも低〜中頻度の連続マスク。砂浜比率ルールは不変 |
| `medievalEurope` | 東縁・大陸性乾燥側に `coldSteppe`、北縁泥炭に `borealPeatland`。`tropicalDryForest` はほぼ出さない |
| `mediterranean` | 三種とも低。ステップは内陸乾燥縁のみ |
| `tropicalRiverBasin` | `tropicalDryForest` を盆地縁・乾季側で強化。ステップ・泥炭は出さない |
| `mountainRealm` | 低地ステップのみ可。泥炭は谷底平坦部のみ |

将来オプションとして `steppeRealm` / `borealRealm` を `BIOME_REGION_PROFILES` に足してもよいが、Phase 5 の必須ではない。

### 5.4 シミュレーション・経済・軍事への接続

数値コード表の更新は禁止。**タグと key** で接続する。

| 系統 | 接続方針 |
| --- | --- |
| 経済 `biomeOutputByTag` | `coldSteppe` → Horses / Cattle / Sheep を `grassland`+`nomadic` 経由で取得。Grain は arable が弱ければ低レート |
| | `tropicalDryForest` → Wood / Game を `forest`、Spices 候補を key または `dry`+高温で |
| | `borealPeatland` → Furs（`cold`）、Salt/泥炭相当がなければ Game 低レート。Wood は出さないか極低 |
| Burg groups | caravanserai: `nomadic` / `desert` / `scrub` に加え cold steppe は `nomadic` で既に入る想定。trading_post は forest のみなので dry forest は forest タグで入る |
| 軍事地形 | ステップ → `nomadic`。乾季林 → 必要なら dense forest 扱い（centralEuropean と同様の wetland 軍事タイプにはしない）。泥炭 → `wetland` タグで高コスト |
| 文化タイプ | Nomadic 中心がステップに出やすいこと、Hunting が乾季林に出やすいことを既存ロジックのタグ判定で確認 |
| 移動コスト | 泥炭は wetland 並みかそれ以上。ステップは grassland と同程度。乾季林は forest 寄り |

### 5.5 描画・編集・保存

| 層 | 作業 |
| --- | --- |
| カタログ | `biomeCatalog.ts` 定義追加。`LegacyBiomeCodec` は旧 0–12 のみ知っていればよい（新種は旧ファイルに存在しない） |
| 割当 | `biomeAssignment.ts` + `BiomeConstants` 閾値 |
| 描画 | 色は定義から自動。relief icons の重み、`BIOME_SATELLITE` 行、WebGL は keys 署名済みなら追従を確認 |
| Editor | カタログ列挙のため手動塗は自動で増える |
| 属性 | `initializeBiomeAttributes`: dry forest は forestCover 中、peatland は forestCover 低・landCover は natural だが canopy none 寄り |
| テスト | key 網羅、閾値単体、固定 seed で三者が 0 セルにならないこと、medievalEurope で tropicalDry が暴走しないこと |

### 5.6 実装フェーズ分割（Phase 5 内）

| 小フェーズ | 内容 | 状態 |
| --- | --- | --- |
| **5a カタログ** | 3 key の定義・タグ・色・cost・habitability、衛星行、属性 init | ✅ |
| **5b 割当** | 閾値・優先順・地域マスク、プロファイル別出現 | ✅ |
| **5c 連携** | 経済 tag、軍事（wetland/nomadic/forest tags）、Burg | ✅ |
| **5d 調整** | プレイテスト閾値、色、アイコン密度 | 閾値は定数化済み。インゲーム調整は継続可 |

### 5.7 Phase 5 完了条件

- `coldSteppe`、`tropicalDryForest`、`borealPeatland` が `BiomeKey` としてカタログ・保存スナップショット・SVG/WebGL・Editor で利用できる。 ✅
- ゲームロジックはコード範囲ではなく tags / key のみを参照する。 ✅
- `Grassland` は湿潤寄りの温帯草原、`coldSteppe` は寒冷乾燥寄りのステップとして視覚・資源で区別できる。 ✅
- `Savanna`（開けた熱帯草原）と `tropicalDryForest`（樹木の多い乾季林）が気候帯上で分離される。 ✅
- `Taiga` 本体と `borealPeatland` が北方でモザイクになり、後者は移動コストが高く木材生産が弱い。 ✅（peatland に `forest` タグなし）
- 旧 `.fmg` は引き続き `LegacyBiomeCodec` のみが旧コードを解釈し、新3種の知識をロード境界の外に漏らさない。 ✅

---

## 未来オプション（独立バイオームにしない）

Phase 5 の対象外。需要が固まった段階で、**属性またはタグ拡張**として設計する。気候バイオームの増殖は避ける。

### オプション A: Oasis / gallery woodland（属性）

| 項目 | 内容 |
| --- | --- |
| 問題 | 砂漠・ステップ内の河畔・湧水緑地が、セル全体を `Grassland` / 森林に塗り替えると気候帯が壊れる |
| 方針 | `biome` は `hotDesert` / `coldDesert` / `xericShrubland` / `coldSteppe` のまま。属性で上書きする |
| 案 | `landCover: oasis` または専用 `riparianGallery: 0..1`。条件例: 砂漠タグセルかつ `hasRiver` または高 flux、狭い帯状マスク |
| 接続 | 交易路ボーナス、Dates / 水場マーカー、Burg の oasis 集落、軍事上の「唯一の水路」 |
| 描画 | バイオーム色の上に狭い緑のオーバーレイ（沿岸ハビタット層と同様、気候を置換しない） |
| 非目標 | `oasis` を `BiomeKey` にしない。マトリクスに砂漠オアシス列を足さない |

### オプション B: Flooded forest の温帯 / 熱帯の区別（タグ）

| 項目 | 内容 |
| --- | --- |
| 問題 | `floodedForest` がアマゾン型（高温・多湿・密林）とプリピャチ型（冷涼・泥炭縁・河畔）を同一視する |
| 方針（推奨） | **キーは増やさない**。割当時に `biomeTags` へ動的付与するか、`canopy` / 地域プロファイル / 気温でコンテンツが分岐する |
| 案1 | セル属性 `floodedForestRegime: "tropical" \| "temperate"`（climate 派生の読み取り専用） |
| 案2 | 既存 tags に加え、生成後に気温 ≥ 20 なら production を Spices / 高 Wood、冷涼なら Furs / 低 Wood |
| 案3（最終手段） | `temperateFloodedForest` を別 key にするのは、案1–2で経済・描画が足りない場合のみ |
| 接続 | `medievalEurope` の河畔は温帯レジーム、`tropicalRiverBasin` は熱帯レジーム |
| 非目標 | 気候マトリクスを温帯／熱帯冠水の二次元に膨らませること |

### オプション記載の更新ルール

- オプション A/B を実装着手するときは、本節を「計画」から「Phase N」へ昇格させ、キー増減の有無を完了条件に明記する。
- 魔法の森・農地・砂浜をバイオームに足す提案は、本書「バイオームではなく属性として扱うもの」および Phase 4 属性レイヤーを優先し、却下または属性側に振る。
