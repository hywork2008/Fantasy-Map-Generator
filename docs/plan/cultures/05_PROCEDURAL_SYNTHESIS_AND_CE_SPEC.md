# 手続き的合成アルゴリズムと City Editor (CE) 実装仕様書

本仕様書は、`00_OVERVIEW_AND_TAXONOMY.md` から `04_SPECIALIZED_AND_INDIGENOUS.md` に至る世界中の埋葬文化を、**Fantasy Map Generator (FMG)** の文化シミュレーションおよび **City Editor (CE)** の幾何学レンダリングエンジンへと実装するための技術仕様書である。

---

## 1. データモデル設計（TypeScript 型定義）

FMGの文化設定（`Culture`）およびCEの都市ドキュメント（`CityDocument`）に組み込むデータ構造を以下のように策定する。

```typescript
/**
 * 埋葬文化の基本設定（FMG Cultureレベルに保持）
 */
export interface BurialCultureProfile {
  id: string;
  name: string;
  description: string;

  /** 7大直交パラメータ */
  zoning: CemeteryZoning;
  boundary: CemeteryBoundary;
  sanctuary: CentralSanctuary;
  bodyFate: CorpseTreatment;
  monuments: MonumentLayout;
  vegetation: FuneraryFlora;
  ritualFacilities: RitualFacility[];

  /** FMGシミュレーション連動値 */
  mechanics: {
    remainFraction: number; // 遺体残存率 (0.0=完全消滅 〜 1.0=完全残存)
    zombieRatio: number;    // アンデッド化時の肉体(ゾンビ)比率 (0.0=骨のみ 〜 1.0=肉体保持)
    resourceCostPerCapita: {
      wood?: number;        // 火葬薪、木棺
      stone?: number;       // 石棺、墓石、石壁
      linen?: number;       // 埋葬布、包帯
      incense?: number;     // 香料、防腐樹脂
    };
    sanitationRisk: number; // 衛生リスク (0.0=安全 〜 1.0=水源汚染・悪臭リスク高)
    pilgrimageAppeal: number; // 巡礼吸引力 (聖者廟・聖地など)
  };
}

/** 1. ゾーニング立地 */
export type CemeteryZoning =
  | "extramural_highway"     // 市壁外の主要街道沿い（古代ローマ、古代ギリシャ）
  | "intramural_core"        // 市壁内中央・教会/神殿同居（中世西欧カトリック）
  | "extramural_sanitary"    // 市壁外郊外・風下下流の専用区画（近代公営、イスラム・スンニ）
  | "topographic_hill"       // 都市近郊の丘陵・高台・風水斜面（東アジア風水、エルサレム）
  | "riverfront_ghat"        // 河川敷・水辺テラス（ヒンドゥー教火葬ガート）
  | "isolated_highland"      // 都市から数km離れた不毛の岩山・頂（ゾロアスター、チベット）
  | "subterranean_network"   // 地下採石場・凝灰岩坑道（カタコンベ）
  | "household_intramural";  // 住居床下・街区内分散（メソポタミア、マヤ）

/** 2. 境界構造 */
export type CemeteryBoundary =
  | "high_stone_wall"        // 高い石壁・錬鉄門（視線と侵入を遮断）
  | "low_curb_or_hedge"      // 低い縁石・生垣（開放的な緑地）
  | "open_desert_field"      // 境界なし（砂漠・荒野と連続）
  | "ditch_and_rampart"      // 堀と土塁（古代、ケルト）
  | "stepped_water_terrace"  // 水面に向かって開かれた石段テラス
  | "monumental_gate_pylon"; // 記念塔門・鳥居・牌坊による結界

/** 3. 中心核・祭祀建築 */
export type CentralSanctuary =
  | "chapel_basilica"        // 礼拝堂・聖堂
  | "mausoleum_dome"         // ドーム型巨大霊廟（円形廟、トゥルベ、クッバ）
  | "preaching_cross_calvary"// 説教十字架（カルヴァリオ）
  | "stupa_chorten"          // 仏塔・ストゥーパ・多層塔
  | "cremation_pyre_platform"// 火葬台・火葬棟
  | "tower_of_silence"       // 円形無天井石塔（ダクマ）
  | "ossuary_charnel_house"  // 納骨堂・骸骨堂
  | "ancestral_hall"         // 祖先祠堂（位牌堂）
  | "none_flat_memorial";    // 中心核なし（完全平坦・平等）

/** 4. 遺体処理 */
export type CorpseTreatment =
  | "inhumation_coffined"    // 木棺・石棺土葬
  | "inhumation_shrouded"    // 白布直接土葬（棺なし、キブラ配向など）
  | "cremation_ritual"       // 薪・炉による火葬
  | "mummification_embalmed" // 防腐ミイラ化
  | "excarnation_sky"        // 猛禽・太陽による鳥葬・風葬
  | "submersion_water"       // 川・海への水葬
  | "exposure_surface";      // 足場・樹上放置

/** 5. 墓標・区画レイアウト */
export type MonumentLayout =
  | "headstone_grid"         // 規則正しい長方形格子列
  | "crowded_jumble"         // 不規則に傾斜・密集した墓石群（ゲットー等）
  | "linear_avenue_monuments"// 舗装道路沿いの記念碑・家族廟列
  | "stepped_tumuli_mounds"  // 盛り土の円形・前方後円墳丘群
  | "columbarium_walls"      // 壁龕・棚状ニッチの壁面収蔵
  | "cairns_and_steles"      // 積石・石柱・五輪塔群
  | "flat_ground_markers"    // 地表同一面の平坦プレート
  | "terrace_horseshoe";     // 等高線沿いの馬蹄形・亀甲墓群

/** 6. 景観・植生パレット */
export type FuneraryFlora =
  | "mediterranean_cypress"  // イタリアイトスギ（円錐形の濃緑樹）
  | "sacred_yew"             // セイヨウイチイ（枝が広がる暗緑樹）
  | "oriental_evergreen"     // 松・槇・柏
  | "sacred_bodhi_and_fig"   // 菩提樹・ガジュマル
  | "peaceful_willow"        // シダレヤナギ
  | "barren_gravel"          // 樹木なし（砂利・岩・小石のみ）
  | "garden_parkland";       // 芝生・オーク・バラの近代庭園

/** 7. 儀礼・付帯施設 */
export type RitualFacility =
  | "caretaker_cottage"      // 墓守小屋・管理棟
  | "ablution_fountain"      // 清めの泉・水場・手水舎
  | "cremation_woodyard"     // 火葬薪集積場
  | "mourning_cloister"      // 追悼回廊
  | "bone_cleaning_table"    // 遺体洗浄・骨粉砕台
  | "incense_candle_stand"   // 灯明台・大香炉
  | "skull_shelf";           // 頭蓋骨棚・陳列壁
```

---

## 2. 実在モデル完全プリセット集（名前変更ですぐ使えるカタログ）

ゲーム内で特定の歴史的雰囲気を再現する場合、以下のプリセットをそのまま読み込み、文化名のみをリネームして即座に運用可能とする。

| プリセット ID | 歴史モデル | ゾーニング (`zoning`) | 中心核 (`sanctuary`) | 墓標 (`monuments`) | 植生 (`vegetation`) | 主な特徴 |
| --- | --- | --- | --- | --- | --- | --- |
| `roman_via_appia` | 古代ローマ街道 | `extramural_highway` | `mausoleum_dome` | `linear_avenue_monuments` | `mediterranean_cypress` | 市壁外主要街道沿いに並ぶ円形霊廟・石棺・コロンバリウム壁 |
| `medieval_parish` | 西欧中世カトリック | `intramural_core` | `chapel_basilica` | `headstone_grid` | `sacred_yew` | 市壁内教区教会境内、シャネルハウス納骨堂、説教十字架、イチイ |
| `victorian_garden`| 近代景観霊園 | `extramural_sanitary` | `chapel_basilica` | `headstone_grid` | `garden_parkland` | 郊外丘陵の広大な緑地公園、曲がりくねった散策路、ゴシック礼拝堂 |
| `prague_ghetto` | 中世ユダヤゲットー | `intramural_core` | `ossuary_charnel_house`| `crowded_jumble` | `barren_gravel` | 極小敷地に何層も盛り土、傾き重なり合う無数の墓石、供養の小石 |
| `jewish_orthodox` | ユダヤ超正統派 | `extramural_sanitary` | `none_flat_memorial` | `headstone_grid` | `barren_gravel` | 郊外専用霊園、男女完全分離区画、白布直土葬、平坦な長方形石板 |
| `ottoman_turbe` | オスマン帝国イスラム | `extramural_highway` | `mausoleum_dome` | `headstone_grid` | `mediterranean_cypress` | 街角や街道に面したドーム霊廟（トゥルベ）、大理石ターバン墓石、イトスギ林 |
| `wadi_us_salaam` | シーア派聖廟都市 | `extramural_sanitary` | `mausoleum_dome` | `crowded_jumble` | `barren_gravel` | 地平線まで広がる黄色煉瓦の墓塔群、地下家族墓室、聖廟直近の過密埋葬 |
| `sunni_wahhabi` | イスラム厳格派 | `extramural_sanitary` | `none_flat_memorial` | `flat_ground_markers` | `barren_gravel` | 完全な砂利の平原、装飾・霊廟・ドーム一切排除、自然石の頭石のみ |
| `varanasi_ghat` | ヒンドゥー火葬河岸 | `riverfront_ghat` | `cremation_pyre_platform`| `none_flat_memorial`| `barren_gravel` | 聖なる河岸の階段状テラス、山積みの薪、絶え間ない火葬の炎と灰の放流 |
| `thai_chedi_wat` | 東南アジア上座部 | `intramural_core` | `cremation_pyre_platform`| `cairns_and_steles` | `garden_parkland` | 寺院境内の金色火葬塔、周囲を囲む白漆喰チェディ（小仏塔）の回廊 |
| `tibetan_jhator` | チベット鳥葬・密教 | `isolated_highland` | `stupa_chorten` | `cairns_and_steles` | `barren_gravel` | 遠隔岩山の平坦な解体岩盤、ハゲワシへの布施、チョルテン仏塔とタルチョ旗 |
| `edo_temple_town`| 日本近世寺町寺檀 | `intramural_core` | `chapel_basilica` | `headstone_grid` | `oriental_evergreen` | 寺町区画の本堂背後の墓地、地下カロート、先祖代々竿石、卒塔婆立、松 |
| `fengshui_mountain`| 中国・東アジア風水 | `topographic_hill` | `ancestral_hall` | `terrace_horseshoe` | `oriental_evergreen` | 背山臨水の丘陵斜面、亀甲墓・馬蹄形石壁、墓前石畳庭、清明節の祭祀 |
| `zoroastrian_tower`| 拝火教沈黙の塔 | `isolated_highland` | `tower_of_silence` | `none_flat_memorial`| `barren_gravel` | 不毛岩山頂の円筒形無天井石塔（ダクマ）、同心円状の遺体安置台、中央骨穴 |
| `steppe_kurgan` | 草原遊牧民クルガン | `topographic_hill` | `none_flat_memorial` | `stepped_tumuli_mounds` | `garden_parkland` | 草原の尾根や段丘に築かれた巨大墳丘（マウンド）、馬の殉葬坑、直立石人 |
| `catacomb_paris` | 近代地下骨壁迷宮 | `subterranean_network`| `ossuary_charnel_house`| `columbarium_walls` | `barren_gravel` | 地下20mの旧採石場坑道、大腿骨と頭蓋骨による幾何学装飾壁 |

---

## 3. 手続き的ランダム合成（Mix & Match）アルゴリズム

文化生成時に「ランダム生成」が選択された場合、各次元を独立にロールし、以下の整合性ルール（Constraints Matrix）でフィルタリングして架空文化を組み立てる。

### 3.1 生成パイプライン
1. **立地（`zoning`）の選定**:
   - 地理条件（河川の有無、山岳・丘陵セルの有無、海辺か否か）を評価。
   - 例: セル内に川がない場合、`riverfront_ghat` は除外。高低差がない平原では `isolated_highland` や `topographic_hill` の重みを低下。
2. **遺体処理（`bodyFate`）の選定**:
   - バイオーム・気候を評価。
   - 例: 森林のない乾燥砂漠では燃料不足のため `cremation_ritual` の重みを低下、`mummification_embalmed` や `inhumation_shrouded` を優遇。極寒・永久凍土では `excarnation_sky` や `mummification_natural` を優遇。
3. **中心核・建築（`sanctuary`）と墓標（`monuments`）の選定**:
   - `bodyFate` との整合性チェック：
     - `cremation_ritual` → 火葬台（`cremation_pyre_platform`）または納骨塔（`stupa_chorten`）またはコロンバリウム壁（`columbarium_walls`）の確率増。
     - `excarnation_sky` → 鳥葬塔（`tower_of_silence`）または高地平坦岩場。
     - `mummification_embalmed` → ドーム霊廟（`mausoleum_dome`）または岩窟・塔墓。
4. **境界（`boundary`）と植生（`vegetation`）の選定**:
   - 気候帯（地中海＝`mediterranean_cypress`、温帯・冷帯＝`sacred_yew` / `oriental_evergreen`、乾燥・砂漠＝`barren_gravel`）。
5. **付帯施設（`ritualFacilities`）のスロット埋め（1〜3個）**:
   - 管理棟、清めの泉、薪土場、香炉台などを合成。

---

## 4. City Editor (CE) 幾何学描画エンジンの拡張仕様

CEにおいて、選定された `BurialCultureProfile` を実際のポリゴンおよび街区・建築として描画する手順を定義する。

### 4.1 Ward 配置アルゴリズム（`wards.ts: placeCemetery` の改修）

現在 CE の `placeCemetery` は単純に都市の外周（`outskirts`）または城壁内（`medieval`）の単一フェイスを選んでいる。これを `zoning` パラメータに応じて完全に分岐させる：

```typescript
export function placeCemeteryByCulture(
  mesh: Mesh,
  fortifications: FortificationRing[],
  roads: RoadGraph,
  rivers: RiverGeometry,
  culture: BurialCultureProfile,
  rng: RNG
): Id | null {
  const candidates: { faceId: Id; score: number }[] = [];

  for (const [faceId, face] of Object.entries(mesh.faces)) {
    if (face.properties.water !== "land") continue;
    if (face.properties.ward !== undefined) continue;

    const isIntramural = insideFortifications(face.centroid, fortifications);
    const distToRoad = minDistanceToRoad(face.centroid, roads);
    const distToRiver = minDistanceToRiver(face.centroid, rivers);
    const elevation = face.properties.elevation;

    let score = 0;

    switch (culture.zoning) {
      case "extramural_highway":
        // 市壁の外 ＋ 主要街道（アプローチ道路）沿い（15m〜40m以内）
        if (isIntramural) continue;
        if (distToRoad < 10 || distToRoad > 50) continue;
        score = 100 - distToRoad + (face.area > 400 ? 20 : 0);
        break;

      case "intramural_core":
        // 市壁の内側 ＋ 宗教区（Cathedral/Temple）または中央広場に隣接
        if (!isIntramural) continue;
        score = 80 - distToCenter(face.centroid, mesh);
        break;

      case "extramural_sanitary":
        // 市壁の外 ＋ 都市中心から適度に離れた郊外（下流・風下優遇）
        if (isIntramural) continue;
        const distCenter = distToCenter(face.centroid, mesh);
        if (distCenter < 100) continue;
        score = distCenter;
        break;

      case "topographic_hill":
        // 都市周辺で最も標高の高いフェイス（丘陵・尾根）
        score = elevation * 10 + (isIntramural ? -50 : 20);
        break;

      case "riverfront_ghat":
        // 川の岸辺に直接接するフェイス（川までの距離がゼロまたは至近）
        if (distToRiver > 5) continue;
        score = 200 - distToRiver * 20;
        break;

      case "isolated_highland":
        // マップの端（外周境界）に近い最も孤立した高地
        if (isIntramural) continue;
        score = elevation * 15 + distToCenter(face.centroid, mesh);
        break;
    }

    candidates.push({ faceId, score });
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.faceId ?? null;
}
```

---

### 4.2 内部幾何学レイアウト（`cemeteryLayout.ts: layoutCemetery` の拡張）

選定されたフェイス内部のポリゴン生成において、文化パラメータに応じた建築パーツ（`CemeteryPart`）と植生・動線を生成する。

#### A. 境界（Perimeter Wall & Gate）
- `high_stone_wall`: フェイス外周からインセットした多角形に沿って石壁ポリゴンと門（Gate）を生成。
- `stepped_water_terrace`: 陸側は低壁、川に面したエッジには水面へ向かって何段もの並行ライン（階段ポリゴン群）を生成。
- `open_desert_field`: 外周石壁を生成せず、境界を自然な不規則ラインとする。

#### B. 中心核構造物（`sanctuary` に応じたフットプリント生成）
1. **`chapel_basilica`**: 十字形または長方形の教会堂（身廊・翼廊・アプシス）。
2. **`mausoleum_dome`**: 正八角形または円形の切石ドーム霊廟（直径6〜12m）。
3. **`tower_of_silence`**:
   - 屋根なしの二重同心円石壁。
   - 外径14〜20m。中央に直径3mの納骨竪穴（円形ホール）。
   - 内部に放射状に区切られた石座（パヴィ）。
4. **`stupa_chorten`**:
   - 正方形の基壇（多層テラス）の上に半球形または釣鐘型のドーム。
   - 周囲に幅2mの円形巡回通路（右繞道）。
5. **`cremation_pyre_platform`**:
   - 河岸または広場に面した一段高い長方形の石造プラットフォーム群（3m × 2m の火葬区画が複数並ぶ）。
   - 隣接して「薪集積場（木材テクスチャ）」を配置。
6. **`preaching_cross_calvary`**: 中央に立つ石造台座と十字架。
7. **`none_flat_memorial`**: 中央建築を生成せず、敷地全体を墓標または平地として活用。

#### C. 墓標・区画パターンの幾何学
- **`headstone_grid`**:
  歩道（幅1.5m）を十字または格子状に通し、長方形のブロック内に小さな短冊状の墓石ポリゴンを等間隔（1.2mピッチ）で整然と配置。
- **`crowded_jumble`**:
  不規則な角度（±15度のジッター）と間隔で、長方形墓石ポリゴンを過密（密度1.5倍）にランダム配置。
- **`linear_avenue_monuments`**:
  中央に広い舗装道路（幅3.5〜5m）を通し、その両脇に一定間隔で大型の正方形・長方形のモニュメント（石棺・小霊廟）を向かい合わせに配置。
- **`terrace_horseshoe`（亀甲・風水）**:
  等高線に沿って、後方が円弧状に丸く前方が開いた馬蹄形（U字型）の擁壁ポリゴンを斜面に段々状に配置。
- **`columbarium_walls`**:
  外周壁の内側に沿って厚さ1.2mの帯状ポリゴン（棚壁）を配置。

#### D. 植生パレット（樹木スプライトの選定と配置）
- `mediterranean_cypress`:
  円錐形の細長いイトスギを、入口から中央建築への参道沿いに等間隔（並木）で配置。
- `sacred_yew`:
  鬱蒼としたセイヨウイチイを敷地の隅および教会堂の周囲に2〜4本配置。
- `oriental_evergreen`:
  松・柏を墓地の背後（山側）を取り囲むように弧状に配置。
- `sacred_bodhi_and_fig`:
  ストゥーパや火葬台の傍らに、枝を大きく広げた巨木を1本孤立樹として配置。
- `barren_gravel`:
  樹木生成数をゼロとし、敷地テクスチャを砂利・石畳とする。

---

## 5. FMG世界シミュレーションへの経済・社会フィードバック

文化の埋葬プロファイルは、単なるビジュアルにとどまらず、FMGの既存システムと有機的に連動する。

### 5.1 資源消費と産業ギルド連動
- `cremation_ritual`:
  - 1回の死亡ごとに大量の木材（`Wood`）を消費する（`funeralRites.ts` の `funeralMaterialsFor`）。
  - 都市に「薪商人ギルド」「木材土場」の需要を生み出す。森林伐採圧力を高める。
- `inhumation_coffined`:
  - 木工ギルド（棺製造）および石工ギルド（石棺・墓石切り出し）の需要。
- `mummification_embalmed`:
  - 亜麻布（`Linen`）に加え、香料・樹脂（`Spices/Resin`）、塩（`Salt`）の特化消費。長距離交易の需要ドライバーとなる。

### 5.2 死霊術（Lich / アンデッド兵士生成）
- `remainFraction`（遺体残存率）:
  - `cremation`（火葬）: 残存率 0% → リッチが出現してもスケルトン・ゾンビを一切徴募できない（対アンデッド防衛文化）。
  - `mummification`（ミイラ）: 残存率 95%、ゾンビ比率 80% → 腐敗しない強力な肉体ゾンビ兵団が即座に編成可能。
  - `inhumation`（土葬）: 残存率 80%、ゾンビ比率 40% → 一定期間経過でスケルトン主体の兵団となる。
  - `excarnation_sky`（鳥葬）: 残存率 12%、ゾンビ比率 0% → 細片化した骨のみで微弱なスケルトンしか作れない。

### 5.3 都市衛生と巡礼経済
- `sanitationRisk`:
  - 市壁内過密土葬（中世カトリック・ユダヤゲットー）は、都市の衛生圧力（`healthPressure`）を上昇させ、コレラやペストの発生確率を押し上げる。
  - 郊外隔離（ローマ街道・近代景観）や火葬・鳥葬は衛生リスクを劇的に低下させる。
- `pilgrimageAppeal`:
  - 聖廟巡礼墓地（シーア派ナジャフ、スーフィー聖者廟、バラナシ）を持つ都市は、国内外から膨大な巡礼者と寄進を集め、宿屋（`urban-inn-system`）や宗教観光経済が都市の基幹産業となる。

---

## 6. まとめと今後の実装ロードマップ

1. **フェーズ1（データ定義とプリセット登録）**:
   - 本仕様書に基づき、`src/data/burialCultures.ts` を新設。16種の実在プリセットと7大直交パラメータ型を定義。
   - `src/data/funeralRites.ts` をラップ・拡張し、後方互換性を維持しつつリッチ/資材計算を統合。
2. **フェーズ2（CE Ward配置エンジンの改修）**:
   - `src/city-editor/core/gen/wards.ts` の `placeCemetery` を `placeCemeteryByCulture` へ置換。
   - 街道沿い、市壁内、河岸、丘陵へのゾーニング配置を実現。
3. **フェーズ3（CE 幾何学レイアウトエンジンの拡充）**:
   - `src/city-editor/core/gen/cemeteryLayout.ts` に、ドーム霊廟、円形沈黙の塔、ストゥーパ、火葬ガートテラス、不規則過密墓石の生成ルーチンを追加。
   - イトスギ、イチイ、松などの植生パレット描画を切り替え可能にする。
4. **フェーズ4（UI統合）**:
   - FMGの `Cultures Editor` に「埋葬文化（Burial Culture）」設定タブを追加。
   - プリセット選択ドロップダウンおよび「ランダム合成」ボタン、各パラメータのスライダー調整を実装。
