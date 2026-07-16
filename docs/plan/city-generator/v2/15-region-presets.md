# 15. 地域様式プリセット（regionPreset）— 計画書

**位置づけ**: [14-historical-morphology-review.md](14-historical-morphology-review.md) の勧告に基づく、v2 本体完了後の**拡張計画**。  
**現状**: 未実装。既定生成は `regionPreset: "northWestBurgage"`（現行仕様と同一）として扱う。  
**原則**: パイプライン段階（S0–S10）は共通のまま、**パラメータセット・一部ステージの差し替え規則・メトリクス帯**だけをプリセットで切り替える。ボロノイ復活やランダムウォークは引き続き禁止（[01-goals.md](01-goals.md)）。

---

## 1. 目的

中世ヨーロッパの町並みは一様ではない。既定の北西ヨーロッパ短冊敷地（バーゲージ形態）に加え、次を **ユーザーが選択可能な生成オプション** として提供する。

| ID | 表示名 | 要約 | 代表参照 |
|----|--------|------|----------|
| `northWestBurgage` | 北西ヨーロッパ短冊型（既定） | 狭い間口・深い奥行・城壁・町家列 | ローテンブルク、ヨーク、ゲント |
| `mediterraneanCourtyard` | 地中海中庭型 | 広い間口・浅い奥行・中庭（patio/corte）必須 | シエナ旧市街の一部、南仏、イベリアの中世層 |
| `canalLowland` | 低地運河都市 | 水路網が骨格。道路と運河が並行・直交 | ブルージュ、ヘント、アムステルダム前史 |
| `romanGridLegacy` | ローマ格子残存型 | 旧 cardo/decumanus が幹線骨格 | フィレンツェ中心、ルッカ、チェスターの痕跡 |
| `bastidePlanned` | バスティード計画都市 | 全域グリッド＋中央市場広場 | モンパジエ、コルド・シュル・シエル |
| `hillOrganic` | 丘上有機型（強調） | 等高線環状＋放射を強める | シエナ、ペルージャ |
| `eastCentralOrganic` | 中東欧有機型 | 広場（rynek 等）核＋やや広い間口 | クルムロフ、クラクフ旧市街の一部 |

村落モード（`settlementType: "village"`）は地域プリセットと直交する（[12-roadmap.md](12-roadmap.md) M10）。

---

## 2. データモデル拡張

### 2.1 CityParams

```ts
/** 地域・形態様式。アルゴリズム骨格は共通、数値と一部規則のみ差替え */
type RegionPreset =
  | "northWestBurgage"      // 既定 = 現行 01–11
  | "mediterraneanCourtyard"
  | "canalLowland"
  | "romanGridLegacy"
  | "bastidePlanned"
  | "hillOrganic"
  | "eastCentralOrganic";

interface CityParams {
  // ... 既存フィールド ...
  regionPreset: RegionPreset;  // 既定: "northWestBurgage"
}
```

- URL 状態・Tweakpane に `regionPreset` を追加する（[10-rendering-ui.md](10-rendering-ui.md)）。  
- FMG site モードでは descriptor の気候・港フラグから**推奨プリセットを提案**してよいが、ユーザー上書きを優先する。

### 2.2 RegionProfile（純データ）

`src/generation/regionProfiles.ts`（新規）に、プリセットごとの定数を集約する。`generation/*` はプロファイルを読み、ハードコード数値を減らす。

```ts
interface RegionProfile {
  id: RegionPreset;
  label: string;
  /** 敷地間口 (m) */
  frontage: { min: number; max: number; median: number; logSigma: number };
  /** 敷地奥行 (m) */
  depth: { min: number; max: number };
  /** 奥行/間口の目標中央値レンジ（メトリクス M2） */
  aspectMedian: [number, number];
  /** 間口 P10/P90 の合格帯（メトリクス M3） */
  frontagePercentiles: { p10Min: number; p90Max: number };
  /** 建物 */
  building: {
    zeroSetback: boolean;
    courtyardRequired: boolean;     // 中庭必須
    courtyardFraction: [number, number]; // 敷地面積に対する中庭比
    gableToStreetBias: number;      // 0–1 妻入り確率（市場沿い）
    roofPitch: [number, number];
    floorsByDistrict: Record<string, [number, number]>;
  };
  /** 街区 */
  block: {
    targetDepth: [number, number];  // m
    areaRange: [number, number];    // m²
    peelOppositeRows: boolean;      // 背中合わせ 2 列
  };
  /** 道路 */
  road: {
    tJunctionTarget: [number, number]; // M5
    preferContour: number;          // 等高線優先係数 0–1
    canalAsPrimary?: boolean;
  };
  /** 水路（canalLowland のみ必須） */
  waterways?: {
    primaryCanalWidth: [number, number];
    secondaryWidth: [number, number];
    quayStrip: number;              // 護岸沿い空地 m
    bridgeSpacing: [number, number];
  };
  /** 骨格 */
  skeleton: {
    forceEastWestChurch: boolean;
    centralPlazaType: "triangle" | "spindle" | "square" | "campoLike" | "rynek";
    romanAxes?: boolean;            // cardo/decumanus
    fullGrid?: boolean;             // bastide 全域
  };
  /** 描画ヒント（屋根色・壁色の基調） */
  palette: "timberNorth" | "stoneSouth" | "brickLowland" | "plasterMed";
}
```

既定プロファイル `northWestBurgage` は現行 [07-blocks-lots.md](07-blocks-lots.md)・[08-buildings.md](08-buildings.md) の数値をそのまま写経する。

---

## 3. プリセット別仕様

### 3.1 northWestBurgage（既定・現行）

- そのまま [07](07-blocks-lots.md) / [08](08-buildings.md) / [05](05-roads.md)。  
- 間口 4–12 m、奥行 20–50 m、背中合わせ 2 列、妻入りバイアス高（市場沿い）。  
- オプションで `deepBurgage: true`（将来）により奥行 60–120 m を許可。

### 3.2 mediterraneanCourtyard（地中海中庭型）

**形態的根拠**: 地中海都市では、狭長バーゲージより、**間口が広め・奥行が抑えめ・中央または後方に中庭**を持つ住居・パティオ型が多い。通りに面するファサードは連続するが、生活の核は中庭側になる。

| 項目 | 値 |
|------|-----|
| 間口 | 8–18 m（中央 ~12 m） |
| 奥行 | 12–30 m |
| 縦横比中央値 | 1.0–2.5（M2 をプリセット別に緩和） |
| 中庭 | 建物可敷地の ≥ 70% で必須。面積比 15–35% |
| 建物形 | コの字・ロの字（中庭を囲む矩形合成）。I 型は少数 |
| セットバック | 通り側ゼロ。中庭側に開口 |
| 屋根 | 瓦（tile）優勢、勾配やや緩い（0.3–0.45） |
| 色 | 漆喰・砂岩系パレット |
| 街区 | やや大きめ可。peel は 1 列優先（背中合わせ強制を弱める） |
| 道 | T字路目標を 0.5–0.8 に緩和。丘と組む場合は hillOrganic と合成可 |

**アルゴリズム差分（S8–S9）**:

1. フロンテージ帯ピーリングは共通。スライス後、各 lot の**内側に中庭矩形**をくり抜く（または建物を「囲み」として parts 生成）。  
2. `Lot.use` に `courtyard` を追加するか、`Building.parts` の内側リングを庭として描画。  
3. 袋地 backland は中庭に併合しやすいよう、面積閾値を下げる。  
4. 鋭角コーナーは引き続き埋めない。

**受け入れ（目視 + メトリクス）**:

- 建物可敷地の中庭保有率 ≥ 0.70  
- M2 がプロファイル帯内  
- 通りから見て連続ファサードだが、内部に空地のリズムがある  
- 川上に物件なし等、既存不変条件は維持  

**参照**: シエナ（丘＋有機）、フィレンツェの中世層、南仏・カタルーニャの中世核（格子は bastide と混在し得る）。

### 3.3 canalLowland（低地運河都市）

**形態的根拠**: 低地商業都市では、**運河が物流・防衛・地割の骨格**となり、街路は運河に平行・直交する。建物は水路と道路の両方に面し得る（表通り＋裏水路）。

| 項目 | 値 |
|------|-----|
| 主運河幅 | 12–25 m |
| 支運河幅 | 6–12 m |
| 護岸帯 | 両岸 2–4 m（建物不可、道路または埠頭） |
| 街区 | 運河と道路に挟まれた短冊。間口 4–10 m（商業核は狭） |
| 橋 | 80–150 m 間隔、または道路交差ごと |
| 壁 | ある場合も水門を必須化。壁外は干拓地・牧場・耕地 |
| 色 | 煉瓦・階段破風を連想するパレット（描画） |

**パイプライン差分**:

| ステージ | 変更 |
|----------|------|
| S1 | 平坦高度場。`waterbody` または外海接続可。主運河の中心線を 1–2 本生成（蛇行弱め） |
| S2 | 港・市場を主運河屈曲または合流に配置。門アンカーの一部を「水門」に |
| S3 | 幹線の一部を**運河沿い道路**としてコスト場で岸に貼り付かせる。横断は橋点のみ |
| S3b（新） | **運河グラフ** `WaterGraph`（RoadGraph と類似）。面抽出は「道路＋運河」の合成平面グラフでも可 |
| S5 | 街路は運河に直交する短いボート路地（canal alley）を生成可 |
| S6 | 水域クリップに運河ポリゴンを含める（既存河川ルールと統一） |
| S8–S9 | 水路に面する frontage を `rank: "quay"` 相当で高商業価値に |
| S9 | 倉庫を運河沿いに優先 |

**データモデル追加**:

```ts
interface Waterway {
  id: number;
  rank: "mainCanal" | "secondary" | "dock";
  width: number;
  path: Point2[];
  polygon: Ring;
}
// TerrainModel または CityModel に waterways: Waterway[]
```

**受け入れ**:

- 運河上に庭・畑・一般建物が乗らない（橋・埠頭を除く）  
- 主運河が市場または港核に接続  
- 目視で「水路が街を分割し、橋で縫合している」  
- 性能: 中都市 < 2.0 s（水路追加分を許容し [11] を更新）  

**参照**: ブルージュ、ヘント。アムステルダムの運河帯はやや後期だが形態参照として可。

### 3.4 romanGridLegacy（ローマ格子残存型）

**形態的根拠**: 旧ローマ都市では cardo（南北）・decumanus（東西）が長く残り、その上に中世の有機埋めで歪み・袋小路が乗る。

| 項目 | 値 |
|------|-----|
| 骨格 | S2 で直交 2 軸（±15° の回転可）を highway/artery として固定 |
| 交差点 | 中心 forum 的広場（方形寄り） |
| S5 | 格子セル内部のみ有機成長（T字路・路地）。主軸は曲げない |
| 敷地 | northWest か mediterranean を副選択（既定は NW 間口） |
| 壁 | 旧ローマ範囲と一致しないことが多い → organic 壁で主軸を内包 |

**受け入れ**: 主軸 2 本が fort 全体を貫き、交差点が広場に接続。内部は有機で T字路率が上がる。

### 3.5 bastidePlanned（バスティード）

現行 `plannedQuarter: true` を**全域化**したプリセット。

- S3–S5: ほぼ全域をグリッド。中央 1 街区を市場広場。  
- 間口ほぼ一定（6 ± 0.5 m）。  
- 壁は矩形に近い polygon。門は辺の中央寄り。  
- `plannedQuarter` フラグは本プリセットでは暗黙 true（UI では隠すか無効化）。

### 3.6 hillOrganic（丘上有機・強調）

`siteArchetype: hillTop` と組み合わせることを推奨（自動提案可）。

- コスト場の等高線項を強化。  
- 環状 artery を丘の中腹に 1 本追加（S3 後処理）。  
- 城プレシンクトは丘頂固定。  
- 敷地は NW または地中海をユーザー選択（シエナ寄りなら中庭型と合成）。

### 3.7 eastCentralOrganic（中東欧）

- 中央の広い市場広場（rynek 型: 方形〜やや不整形、一辺 80–150 m）。  
- 間口 6–14 m とやや広め。  
- 教会が広場に面するか一角を占める。  
- 城壁あり。郊外は弱いリボン。  

---

## 4. ステージへの影響マトリクス

| ステージ | NW | 地中海 | 運河 | ローマ格子 | バスティード | 丘強調 | 中東欧 |
|----------|----|--------|------|------------|--------------|--------|--------|
| S1 地形 | 既存 | 既存 | 平坦+運河種 | 既存 | 平坦寄り | 丘強調 | 既存 |
| S2 骨格 | 既存 | 広場形 | 水門・港核 | cardo/dec | 中央広場 | 環状+城 | rynek |
| S3 幹線 | 既存 | 既存 | 岸貼付+橋 | 直交軸固定 | 格子幹線 | 等高線強 | 広場放射 |
| S3b 水路 | — | — | **必須** | — | — | — | — |
| S4 壁 | 既存 | 既存 | 水門 | 既存 | polygon | 既存 | 既存 |
| S5 街路 | 既存 | T字緩和 | 運河直交 | 軸内有機 | 全域格子 | 既存 | 既存 |
| S6 街区 | 既存+水域 | 既存 | 運河差引 | 既存 | 矩形街区 | 既存 | 既存 |
| S8 敷地 | 短冊 | **中庭** | 埠頭価値 | プロファイル | 整然 | プロファイル | やや広間口 |
| S9 建物 | 妻入り | コ/ロ字 | 倉庫・階段破風 | 既存 | 整然 | 既存 | 既存 |
| S10 検証 | M* | M2/M3差替 | 水路不変条件 | 軸メトリクス | 直交率 | 既存 | 広場接道 |

---

## 5. メトリクスのプリセット別緩和（11 の拡張）

[11-validation.md](11-validation.md) に「プロファイル上書き」節を追加する前提。

| メトリクス | NW（現行） | 地中海 | 運河 | バスティード |
|------------|------------|--------|------|--------------|
| M2 縦横比中央 | [2, 5] | [1.0, 2.5] | [2, 5] | [1.5, 3]（整然） |
| M3 間口 P10/P90 | ≥3 / ≤15 | ≥6 / ≤20 | ≥3 / ≤12 | ≥5 / ≤8 |
| M5 T字路率 | [0.6, 0.85] | [0.5, 0.8] | [0.45, 0.75] | [0.2, 0.5]（十字多い） |
| 新 C1 中庭率 | — | ≥0.70 | — | — |
| 新 C2 運河越境 | — | — | 建物×運河 = 0 | — |
| 新 C3 主軸直交 | — | — | — | 軸交差角 90°±8° |

必須帯の考え方（14 の勧告）:

- **常に必須**: M1, M8, M9, M10, M12,（運河時 C2）  
- **目標**: M4, M5, M11  

---

## 6. UI・エクスポート

### 6.1 Tweakpane

```
Generation
  regionPreset: [dropdown]
  （地中海選択時）courtyardDensity: 0–1
  （運河選択時）canalDensity: sparse | normal | dense
```

### 6.2 説明文

各プリセット選択時に 1 行ヘルプ（例: 「地中海: 広い間口と中庭。短冊町家ではない」）。

### 6.3 描画

- `palette` に応じた屋根・壁の基調色。  
- 運河は water レイヤーで河川より暗い緑青。埠頭は道路面の一種。  
- 中庭は lot 塗りつぶしで薄緑。

### 6.4 GeoJSON

`properties.regionPreset` / `lot.hasCourtyard` / `featureType: canal` を付与。

---

## 7. 実装ロードマップ（M11–M16）

[12-roadmap.md](12-roadmap.md) の M10 以降に接続する。**v2 コア（M0–M10）完了後**に着手。複数プリセットを同時実装しない。

### M11: regionPreset インフラ

- **スコープ**: `RegionPreset` 型、`RegionProfile`、既定 NW プロファイルへの既存数値の移設、UI ドロップダウン、URL 同期。挙動は NW のみ（回帰ゼロ）。  
- **受け入れ**: 全 golden seeds が NW でビット一致（または指紋一致）。他プリセット選択時は「未実装」フォールバックで NW + console 警告でも可（M12 以降で本実装）。

### M12: mediterraneanCourtyard

- **スコープ**: プロファイル数値、S8 中庭くり抜き、S9 コの字/ロの字、M2/M3/C1。  
- **受け入れ**: C1≥0.70、水域非侵食、決定論、目視チェックリスト（中庭リズム・漆喰パレット）。

### M13: canalLowland

- **スコープ**: S1 運河、S3b WaterGraph、橋、S6 運河クリップ、埠頭 frontage、C2。  
- **受け入れ**: C2=0、主運河が核に接続、畑が運河に乗らない、中都市 < 2 s。

### M14: bastidePlanned + romanGridLegacy

- **スコープ**: 全域格子 / cardo-decumanus。M5 帯の差替、直交メトリクス。  
- **受け入れ**: バスティードは中央広場＋格子が目視で明確。ローマ型は主軸が fort を貫く。

### M15: hillOrganic + eastCentralOrganic

- **スコープ**: 環状 artery、rynek 広場、プロファイル調整。  
- **受け入れ**: hillTop×hillOrganic で等高線沿いが目視可能。中東欧で広場が核。

### M16: 合成ルールとドキュメント収束

- **スコープ**: `siteArchetype` × `regionPreset` の推奨組合せ表、矛盾時の正規化（例: canal + hillTop は警告して平坦化）、14/15 と 01–11 の相互リンク更新、golden seeds をプリセットごとに 2 個ずつ。  
- **受け入れ**: README の用語集と 15 が矛盾しない。`npm test` / `test:full` 緑。

---

## 8. siteArchetype × regionPreset の推奨組合せ

| regionPreset \ site | riverCrossing | hillTop | harbor | crossroads |
|---------------------|---------------|---------|--------|------------|
| northWestBurgage | ◎ | ◎ | ◎ | ◎ |
| mediterraneanCourtyard | ○ | ◎ | ○ | ○ |
| canalLowland | ○（内陸運河） | △ 非推奨 | ◎ | ○ |
| romanGridLegacy | ○ | △ | ○ | ◎ |
| bastidePlanned | ○ | △ | ○ | ◎ |
| hillOrganic | △ | ◎ | △ | △ |
| eastCentralOrganic | ◎ | ○ | △ | ◎ |

正規化ルール（S0）:

1. `canalLowland` + `hillTop` → `siteArchetype` を `harbor` または `crossroads` に落とすか、高度振幅を抑え警告。  
2. `bastidePlanned` → `plannedQuarter` を true に強制。  
3. `hillOrganic` + 非 hillTop → `preferContour` のみ中程度適用。

---

## 9. リスク

| リスク | 対応 |
|--------|------|
| プリセット分岐が generation に散らばり破綻 | 規則は `RegionProfile` と少数の strategy 関数に閉じる。if (preset) の乱立禁止 |
| 運河＋道路の二重グラフが不安定 | WaterGraph を RoadGraph と同型にし、面抽出前に merge する経路を 1 つに |
| メトリクス緩和の濫用 | 帯の変更は 11 と 15 を同時更新。理由をコミットに残す |
| 性能 | 運河は辺数増。空間インデックスと、中都市予算 2 s を 11 に明記 |
| 「全部入り」プリセット欲 | 禁止。組合せは表の ◎○ のみサポート |

---

## 10. 非ゴール（本拡張でもやらない）

- 実在都市の完全 GIS 再現  
- 民族・宗教共同体区画の詳細シミュレーション（必要なら将来別ドキュメント）  
- 運河の水位・閘門の水理  
- 地中海と運河の同時フル特徴（合成は限定的）  

---

## 11. 作業指示（実装者向け）

1. M11 から順に。受け入れ前に次へ進まない。  
2. 各 M で [14](14-historical-morphology-review.md) の「形態制約」を壊していないか確認する。  
3. 新規メトリクスは `validation/metrics.ts` に集約し、HUD とテストで共有。  
4. 完了時に 07/08/11 の該当節へ「詳細は 15」と相互リンクを張る。  
5. 迷ったら 01 の禁止事項と、14 の「北西が既定・他はプリセット」に立ち返る。

---

## 12. 改訂履歴

| 日付 | 内容 |
|------|------|
| 2026-07-13 | 初版。14 の勧告に基づく regionPreset 拡張計画（地中海・運河・ローマ格子・バスティード等） |
