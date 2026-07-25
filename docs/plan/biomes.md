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

既存の `Temperate deciduous forest` は、通常の中欧のブナ・ナラを主体とする落葉広葉樹林を表す用途には引き続き適切である。新設する「中世ドイツ風の通常の大森林」は、その置換ではなく、より冷涼な温帯混交林、針葉樹を含む深い森林、低い開墾率を意図的に選べるようにする追加カテゴリとする。

## 追加対象

| 優先度 | 追加する識別子（仮） | 表示名（仮） | 想定する現実・創作上の用途 | 現在の代用 |
| --- | --- | --- | --- | --- |
| 高 | `centralEuropeanGreatForest` | Central European great forest | 中世ドイツ、黒い森、ビャウォヴィエジャの森、カルパチア周縁などの広大な温帯混交林。中欧ではブナ・ナラ、ビャウォヴィエジャ周辺ではナラ・シナノキ・シデ・トウヒ・マツなど、地域に応じた樹種混合と深い森林を表現する | Temperate deciduous forest / Taiga |
| 高 | `mediterraneanWoodlandScrub` | Mediterranean woodland & scrub | 南欧、ギリシャ、イタリア、アナトリア。夏季乾燥、硬葉樹、低木、石灰岩質の景観 | Grassland / Temperate deciduous forest |
| 高 | `temperateConiferousForest` | Temperate coniferous forest | 中欧の山地、北米北西部、温帯の針葉樹林・針広混交林。`Taiga` ほど寒冷ではない | Taiga |
| 中 | `montaneForestMeadow` | Montane forest & alpine meadow | アルプス、ヒマラヤ、火山島の山腹。標高に伴う山地林から高山草原への移行 | Taiga / Tundra |
| 中 | `mangrove` | Mangrove | 熱帯・亜熱帯の河口・海岸湿地。港湾、漁業、危険な水路、沿岸防災の舞台 | Wetland |
| 中 | `xericShrubland` | Xeric shrubland | 中央アジア、アラビア周縁、岩石砂漠の縁、荒野の国境地帯 | Cold desert / Grassland |
| 中 | `cloudForest` | Cloud forest | アンデス、中央アメリカ、東南アジア、霧深い山岳王国。高湿度・急斜面・固有種を表現する | Tropical rainforest |
| 低〜中 | `heathMoorland` | Heath & moorland | 英国・北欧のヒース、ポリーシャを含む東欧の泥炭湿地、古墳や魔女伝承のある荒野 | Grassland / Wetland |
| 低 | `floodedForest` | Flooded forest & riparian woodland | アマゾンの氾濫原、ポリーシャ／プリピャチ湿地の河畔林、巨大河川沿いで季節的に冠水する森林 | Tropical rainforest / Wetland |

WWFの陸上生態地域区分にも、地中海性森林・低木地、山地草原・低木地、マングローブなどは独立したカテゴリとして扱われている。[WWF Global 200](https://files.worldwildlife.org/wwfcmsprod/files/Publication/file/5xdxix5fsv_The_Global_200_Priority_Ecoregions_for_Global_Conservation.pdf) 特にマングローブは、熱帯・亜熱帯の水没しやすい海岸に適応した森林であり、一般的な内陸湿地とは区別する価値がある。[WWF: Mangroves](https://www.worldwildlife.org/resources/explainers/mighty-mangroves/)

## バイオームではなく属性として扱うもの

次の要素は気候・植生の分類そのものではないため、上記の標準バイオームには追加しない。将来はバイオームに重ねる属性として実装する。

| 属性 | 例 | 用途 |
| --- | --- | --- |
| 森林被覆・密度 | `forestCover: 0..1` | 樹冠・森林面積の連続量。「鬱蒼」を表現し、巨大森林の面積は地域マスクと併用して決める |
| 森林状態 | young / mature / ancient | 原生性、樹齢、管理の履歴を表現する |
| 林相 | broadleaf / conifer / mixed | 同じ気候帯でも樹種構成を変える |
| 土地被覆 | naturalForest / managedForest / cropland / pasture / settlement | 中世の開墾地、王領林、伐採地、集落を表現する |
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
| 地域プロファイル・ノイズによる連続領域 | 中欧の大森林、地中海性植生など、気候だけでは重なる種類 |

### 判定順序（案）

`Biomes.getId()` を次の優先順位へ発展させる。実際の閾値はマップサイズ・気候スライダーごとに調整し、定数へ切り出す。

1. 海・氷河など既存の排他的な地表状態を判定する
2. 沿岸低地かつ高温多湿なら `mangrove` を判定する
3. 河川・氾濫条件を満たすセルを `floodedForest` または既存 `Wetland` に判定する
4. 高標高セルを `montaneForestMeadow`、高湿度の熱帯山地を `cloudForest` に判定する
5. 乾燥度が高い温帯・亜熱帯セルを `xericShrubland` または `mediterraneanWoodlandScrub` に判定する
6. 温帯の森林候補を `temperateConiferousForest`、`centralEuropeanGreatForest`、既存 `Temperate deciduous forest` に振り分ける
7. それ以外を既存 `biomesMatrix` の結果へフォールバックする

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
| `src/types/WorldState.ts` | バイオーム定義・地域プロファイルの型を追加する |
| `src/context/worldContext.ts` と生成オプション型 | 選択中の地域プロファイルを保持する |
| `src/renderers/draw-relief-icons.ts` | 各新規種の植生アイコンを描画する。森林は樹種混合、マングローブは根・水際、ヒースは低木を使う |
| `src/renderers/draw-satellite-texture.ts` | 定義のキー・色・地形アイコンを通じて、既定色・密度を取得する |
| `src/renderers/webgl/` | カタログから得た色・テクスチャ・タグを使い、キャッシュ署名がセル列とカタログ内容の双方に追随することを確認する |
| 経済・造船・資源生成 | 木材、樹脂、薬草、湿地資源、沿岸資源の分布条件をバイオームタグで定義する |
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
| Montane forest & alpine meadow | 低 | 高 | 標高に応じて針葉樹から草地へ移行。鉱物・牧畜を想定 |
| Mangrove | 低 | 非常に高 | 沿岸樹木、水路・漁業・塩・木材を想定 |
| Xeric shrubland | 低 | 中〜高 | 低木・岩地、遊牧・香料・鉱物を想定 |
| Cloud forest | 低〜中 | 高 | 密な常緑樹・霧、希少植物・木材を想定 |
| Heath & moorland | 低 | 中 | ヒース・泥炭・湿地、牧畜・泥炭を想定 |
| Flooded forest & riparian woodland | 中 | 高 | 河畔樹林・季節冠水、漁業・木材・肥沃な周縁を想定 |

## 実装フェーズ

### Phase 1: カタログ基盤

1. 現在の13種と表の9種を `BiomeKey` と `BiomeDefinition` で定義し、並行配列を撤去する。
2. `BiomeCatalog`、コードコンパイラ、タグ・キーから定義を引くヘルパーを導入する。
3. 数値コード範囲を使う森林判定・資源判定を検索し、タグまたは `BiomeKey` ベースへ移行する。
4. `pack.cells.biome` を `pack.cells.biomeCode` へ置換し、セル列を読む全呼び出し元をカタログ経由へ移行する。
5. `BiomeCatalogSnapshot` を新しいアーカイブ形式へ導入する。
6. `LegacyBiomeCodec` と旧 `.fmg` fixture を追加し、旧標準13種と旧カスタムバイオームを正規形式へ移行する。

### Phase 2: 描画と手動編集

1. 色、地形アイコン、衛星テクスチャ、WebGL描画を追加する。
2. Biomes Editorから各新規種をセルへ手動適用できるようにする。
3. 新規種ごとの居住適性・移動コストを適用し、経路・国家・文化の生成結果を確認する。

### Phase 3: 気候・地形による自動割当

1. 海岸、河川、標高、傾斜、湿潤度の判定ヘルパーを追加する。
2. マングローブ、冠水林、高山林・高山草原、雲霧林、乾燥低木地を優先ルールで自動割当する。
3. 気候バンドから地中海性森林・温帯針葉樹林を割り当てる。
4. 地域マスクを導入し、`centralEuropeanGreatForest` とヒース／湿原性荒野を連続した地域として生成する。

### Phase 4: 地域プロファイルとシミュレーション連携

1. 地域プロファイル選択を生成UIへ追加する。
2. `medievalEurope` を実装し、中世ドイツ風の大森林に加え、ビャウォヴィエジャ／ポリーシャ型の森林・泥炭湿地・氾濫原林のモザイクが適切な面積・連続性で現れるよう調整する。
3. 経済、造船、軍事、資源、遭遇イベントが新規タグを利用するよう拡張する。
4. 将来の「古代の森」「魔法の森」等の属性レイヤーを、バイオームを増やさず追加できる形にする。

## テスト計画

| 種別 | 検証内容 |
| --- | --- |
| 単体テスト | 各バイオームの判定閾値、優先順位、タグ、`BiomeKey` の網羅性、キーからコードへのコンパイル、カタログ検証 |
| 生成テスト | 固定seed・地域プロファイルごとに、対象バイオームが0セルにならず、極端に断片化しないこと |
| アーカイブテスト | `BiomeCatalogSnapshot` と `biomeCode` 列の round-trip、未定義キー・重複キー・不正コードを安全に拒否すること |
| レガシー移行テスト | 旧標準13種、旧形式のカスタムバイオーム、旧コード列を `LegacyBiomeCodec` が対応する `BiomeKey` と既定値へ正規化できること |
| レンダラーテスト | SVG・WebGL Hybridの双方で色、可視状態、更新後のキャッシュ無効化を確認する。カタログのコード順を変えても描画結果の意味が変わらないこと |
| E2Eテスト | Biomes Editorでの手動変更、凡例、地域プロファイル選択、保存・再読み込みを確認する。SVGを対象にするテストは必要に応じて `renderMode: "svg"` を明示する |
| バランステスト | 新規森林・湿地・山地を跨ぐ経路、国家拡大、資源、居住人口に不自然な偏りがないこと |

## 完了条件

- バイオームの意味は `BiomeKey` と定義オブジェクトだけで決まり、配列添字・数値コード・表示名の変更では決まらない。
- 表の9種を含む標準カタログが、凡例、編集画面、新しい保存データ、SVG、WebGLで利用できる。
- 標準カタログの順序を変えても、気候ルール、ゲームロジック、描画、アーカイブ内の各セルが同じ `BiomeKey` を指す。
- 新しいアーカイブは `BiomeCatalogSnapshot` と `biomeCode` 列を検証付きで round-trip できる。
- 旧 `.fmg` は `LegacyBiomeCodec` を通じて新しい正規形式へ移行でき、旧数値コードや並行配列の知識がロード境界の外へ漏れない。
- 海岸・河川・標高・気候・地域プロファイルを必要とする種が、意図した環境に自動生成される。
- `medievalEurope` プロファイルで、`centralEuropeanGreatForest` が中世ドイツ風の連続した大森林として生成される。
- ビャウォヴィエジャ／ポリーシャ型のプロファイルまたは地域マスクで、`centralEuropeanGreatForest`、`heathMoorland`、`Wetland`、`floodedForest` が不自然に細分化されず、連続した森林・湿原・河畔林のモザイクとして生成される。
- 森林・湿地などのゲームロジックが数値ID範囲ではなく、明示的なタグまたは `key` を用いる。
- 古代・魔法・暗黒・巨木などは、追加の気候バイオームではなく、後続の属性レイヤーで表現できる設計になっている。
