# 13. FMG 立地入力（Burg Site Descriptor）

Fantasy Map Generator（FMG）本体は、各都市（burg）の**立地サーベイ** `BurgSiteDescriptor` を出力する。City Generator はこれを S1–S3 の入力として受け取ることで、「川が存在する」ではなく「**川がどこを、どの向きに、どの幅で流れているか**」に基づいて都市を生成し、FMG の地図にぴったりはまる街を作る。

- FMG 側実装: `src/services/burgSiteDescriptor.ts`（FMG リポジトリ）
- 取得方法:
  - API: `window.fmg.actions.getBurgSiteDescriptor(burgId)` → JSON オブジェクト
  - UI: Burg エディタの「Copy the City Generator site input」ボタン（`icon-docs`）→ クリップボードに JSON
- FMG 側ユニットテスト: `src/services/burgSiteDescriptor.test.ts`

本書は **入力契約（コントラクト）** である。descriptor のフィールドを無視する実装は [01-goals.md](01-goals.md) の設計原則 4「地形が形を決める」への違反として却下する。

## 1. 座標系・単位の約束

| 項目 | 約束 |
|------|------|
| 原点 | burg の位置（FMG マップ座標 `frame.originMapUnits`） |
| 単位 | **メートル**（本計画書の「1 シーン単位 = 1 m」と一致） |
| 軸 | +X = 東、+Y = 北（FMG のマップ Y は南向きに増えるため、descriptor 側で反転済み） |
| 方位角 | コンパス度。0° = 北、90° = 東、時計回り |
| 生成窓 | 原点中心の正方形。一辺 `frame.extentMeters`（市半径の約 6 倍、1500–4500 m にクランプ） |

City Generator のシーン座標はこのローカル座標系をそのまま使う。これにより生成結果（GeoJSON 等）を FMG 側へ逆変換して重ねることも将来可能になる。

## 2. スキーマ（v1）

```ts
interface BurgSiteDescriptor {
  version: 1;
  burg: {
    id: number; name: string; group: string; type: string;
    seed: string;            // watabou プレビューと同一の決定論シード
    population: number;      // 絶対人数
    capital: boolean; port: boolean; citadel: boolean; plaza: boolean;
    walls: boolean; temple: boolean; shanty: boolean;
  };
  frame: {
    originMapUnits: [number, number];
    metersPerMapUnit: number;
    extentMeters: number;      // 生成窓の一辺
    cityRadiusMeters: number;  // 人口→市域半径の推定（城壁内 150 人/ha モデル）
  };
  climate: { temperatureC: number; biomeId: number };
  terrain: {
    elevationMeters: number;             // 都心の標高
    downhillAzimuthDeg: number | null;   // 最急降下方位（平坦なら null）
    gradePercent: number;                // 都心の勾配（%）
    heightfield: {                       // 粗い標高場（マクロ制約）
      size: number;                      // 17（17×17 サンプル）
      spacingMeters: number;
      elevationsMeters: number[];        // 行優先。行 0 = 北端、列 0 = 西端
      waterMask: (0 | 1)[];              // 1 = 水域セル
    };
  };
  rivers: {
    riverId: number; name: string; type: string;
    widthMeters: number;        // 都心最接近点での実河川幅（FMG の経験則モデル）
    axisAzimuthDeg: number;     // 最接近点での下流方向
    offsetMeters: number;       // 都心から中心線までの距離（バンク・スナップ後）
    offsetRatio: number;        // offset / cityRadius。0=5:5、~0.4=7:3、>=1=10:0
    cityBank: "left" | "right"; // 下流を向いて都心がどちらの岸か
    crossesSite: boolean;       // 中心線が市域半径内を通るか
    throughBurgCell: boolean;   // FMG 世界モデル上「街はこの川の上にある」（burg セルを流れる）
    rawOffsetMeters: number;    // スナップ前の生の地図距離（§4 の誇張幅アーティファクト）
    snappedToBank: boolean;     // 中心線を岸まで平行移動したか（throughBurgCell の川のみ）
    segments: {                 // 生成窓でクリップ済み中心線（上流→下流）
      points: [number, number][];
      widthsMeters: number[];   // points[i] と対応
    }[];
  }[];
  waterbody: {
    kind: "ocean" | "lake";
    name?: string; group?: string;
    isPort: boolean;
    shoreAzimuthDeg: number;             // 都心→水面の方位
    shoreline: [number, number][][];     // クリップ済み海岸線/湖岸線
  } | null;
  roads: {
    routeId: number;
    group: string;              // "roads" | "trails" | "searoutes"
    name?: string;
    entryAzimuthDeg: number;    // 市域半径を横切る方位 = 門アンカー候補
    reachesEdge: boolean;       // false = 市域内で終端（行き止まりレグ）
    path: [number, number][];   // 都心から外向きのポリライン（クリップ済み）
    nextBurg: { id: number; name: string; distanceMeters: number } | null; // 道標の行き先
  }[];
  suggestedGates: number;       // 陸路レグ数（searoutes を除く）
  suggestedArchetype: "harbor" | "riverCrossing" | "hillTop" | "crossroads";
}
```

`rivers` は都心に近い順にソート済み（先頭が橋・水車の主対象）。`roads` は方位角順。合流点の街では `rivers` が本流・支流の 2 本以上になる。

## 3. パイプラインへの取り込み（site モード）

`CityParams` に `site?: BurgSiteDescriptor` を追加する（[02-architecture.md](02-architecture.md) §4）。`site` があるときの各ステージの義務:

| ステージ | site モードでの義務 |
|---------|--------------------|
| S0 | `seed = site.burg.seed`、`sizePreset` は `population`/`cityRadiusMeters` から導出。`siteArchetype` は `suggestedArchetype` を既定値とする（UI で上書き可） |
| S1 地形 | 高度場は **`terrain.heightfield` をバイリニア補間した低周波成分 + 独自ノイズの高周波成分** で作る。ノイズ振幅は heightfield の起伏より小さく保つ（マクロ地形を反転させない）。`waterMask`・`waterbody.shoreline` から水域を再構成する |
| S1 河川 | 川は自前生成せず **`rivers[].segments` の中心線をそのまま使い**、`widthsMeters` で水域ポリゴンに膨らませる。FMG 解像度（セル間隔）未満の蛇行ディテールを追加してよいが、**弦位置（offsetRatio）・流向（axisAzimuthDeg）・岸（cityBank）を変えてはならない**。橋候補点はこの中心線上で選ぶ |
| S2 骨格 | 門アンカーは **`roads[].entryAzimuthDeg` を必ず全数採用**する（±30° の揺らぎ内で調整可）。`suggestedGates` < `numGates` の場合のみ地形適性から追加。広場アンカーは archetype 規則（[04-terrain.md](04-terrain.md) §4）に従い、riverCrossing なら descriptor の川の橋のたもと、harbor なら `shoreAzimuthDeg` の方角の港の背後に置く |
| S3 幹線 | 街道端点は `roads[].path` が生成窓の縁と交わる点。`path` の市外区間はそのまま highway の初期経路として使い、A* は市内区間のみ再計算してよい |
| S10 検証 | **fit メトリクス**（§5）を算出する |

`site` が無いとき（スタンドアロンモード）は従来通り [04-terrain.md](04-terrain.md) の手続き生成にフォールバックする。両モードで S2 以降のアルゴリズムは共通— descriptor は「S1/S2 のアンカーとコスト場の初期値」を差し替えるだけで、道路・街区・敷地のロジックには分岐を作らない。

## 4. フィールドの意味と使途の補足

- **offsetRatio が答える問い**: 「正方形の街を川が左右 5:5 に割るのか、7:3 なのか、10:0（市壁の外をかすめる）なのか」。0 なら都心貫流、1 以上なら市域外。`crossesSite` が false の川は市内に引き込まず、郊外要素（水車・渡し場）として扱う。
- **widthMeters は実幅**: FMG が地図に描く川ポリゴンは誇張されている。descriptor の幅は FMG の経験則モデル（河口幅 km 換算）によるメートル実幅であり、橋の長さ・桟橋の規模はこちらを使う。
- **バンク・スナップ（誇張幅アーティファクトの補正）**: FMG は川を誇張幅で描き、河川都市の burg を「描画上の岸」へ 0.3–0.6 マップ単位（scale 3 で 0.9–1.8 km）ずらして置く。そのため `throughBurgCell` の川の生の中心線距離（`rawOffsetMeters`）は現実には無意味な ~1 km になる。descriptor はこの川の中心線を**剛体平行移動**し、都心が岸（`offsetMeters = 実幅/2 + min(150 m, 0.3 × cityRadius)`）に立つように補正する（`snappedToBank: true`）。形状・流向・岸の左右は保存される。FMG のセル解像度（数 km）未満では「川が街のどこを通るか」の地図的真実は存在しないため、この規約が両者の共通解釈となる。生の値も `rawOffsetMeters` に残るので、City Generator 側で別ポリシーを採ることもできる。合流点の街では各川が独立にスナップされるため合流点が数百 m ずれ得る（v1 の既知の制限。S1 で川同士を再接続してよい）。
- **nextBurg**: 門の名前（「〜門」）や道標、行き先看板のフレーバー生成に使える。`reachesEdge: false` のレグは隣町に至らない袋小路であり、門ではなく木戸程度に格下げしてよい。
- **heightfield は粗い**: FMG のセルは都市より遥かに大きい（数 km 級）。heightfield は「北東に向かって 40 m 下る」といったマクロ制約であり、丘・崖のミクロ地形は S1 が site の起伏に整合するように生成する。
- **suggestedArchetype は既定値**: FMG 側ヒューリスティック（port→harbor、川貫流+街道 2 本以上→riverCrossing、周縁より 30 m 以上高い→hillTop、他→crossroads）。確定値ではないため UI からの上書きを許す。
- **village 規模の burg も同じ契約**: descriptor は都市専用ではない。FMG の `village`/`hamlet` グループの burg でも同じ構造で出力される（population が小さく walls が false になるだけ）。[12-roadmap.md](12-roadmap.md) の村落モードはこれを前提とする。

## 5. fit メトリクス（site モード限定の検証）

[11-validation.md](11-validation.md) の全メトリクスに加え、site モードでは以下を S10 で算出する:

| ID | メトリクス | 合格基準 |
|----|-----------|---------|
| F1 | 生成された川中心線と descriptor 中心線の平均偏差 | ≤ 20 m（追加した蛇行ディテールの振幅以内） |
| F2 | 各門方位と対応する `entryAzimuthDeg` の差 | ≤ 30° |
| F3 | 門数 ≥ `suggestedGates`（陸路レグ全数に門がある） | 必須 |
| F4 | 都心標高と `elevationMeters` の差 | ≤ 10 m |
| F5 | 川の岸（cityBank）・弦位置（offsetRatio ± 0.15）の一致 | 必須 |

## 6. 受け渡しフローと互換性

1. FMG で対象 burg のエディタを開き「Copy site input」→ JSON をクリップボードへ。
2. City Generator の UI（Tweakpane）に「Import FMG site」欄を設け、JSON を貼り付けて `CityParams.site` にセットする（`io/` にバリデータを置く）。
3. `version` フィールドで前方互換を管理する。未知の version は拒否し、フィールド追加は同一 version 内で許容（受信側は未知フィールドを無視する）。

> 参考: FMG は従来 watabou の City Generator へ URL パラメータ（`river=0/1`、`sea` 方位、`gates` 数など）を渡していたが、あちらの API では川の形状・街道方位を表現できない。descriptor はその制約を解消するための本プロジェクト専用契約である（watabou リンクも FMG 側で `gates` に実街道レグ数を渡す改善のみ実施済み）。
