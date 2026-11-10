# BV：人口段階に合わせた教会・広場のモデル追加

作成日：2026-11-10  
状態：B0〜B2完了（2026-11-10、[B0の記録](../analytics/bv-town-church-b0-20261110.md)）。次はB3（T4）。対象は中世ヨーロッパのキリスト教に限る。

## 1. 目的と範囲

[メッシュなしCEの機能同等化P0b](../analytics/ce-meshless-parity-p0-20261109.md)で、広場と寺院の大きさを目標人口から決める共通関数`civicSizeForPopulation`（`src/city-editor/generators/housing.ts`）を加えた。値は暫定である。これに合わせて描くための3Dモデルが、BVに足りない。この文書は、足りないモデルをBVへ追加する計画である。

- 対象：中世ヨーロッパ（おおむね1000〜1500年）のキリスト教の教会と、その前の広場・墓地の付属物。
- 対象外：イスラム・仏教・正教・多神教などの寺院、近世以降の教会、実在建築の個別再現（Gothic landmarksの領域）、内部空間。
- CE側の接続（寺院の`modelId`の選択、旧CEの描画への登録）は§6のB6で扱う。機能同等化P2の作業と重なるため、そちらの計画と順序を合わせる。

## 2. 現状の調査

### 2.1 人口段階と既存モデル

| 人口 | 広場の一辺 | 現在の寺院（`civicSizeForPopulation`） | BVにある近いモデル | 過不足 |
| --- | --- | --- | --- | --- |
| 1,000未満 | 18 m | 礼拝堂 14×8 m、高さ10 m | Medieval 14の`village-chapel`（`size` 15×8×8、Low/High） | ほぼ足りる。高さが2 m違う |
| 1,000〜3,000 | 30 m | 礼拝堂 22×10 m、高さ12 m | Medieval 14の`parish-church`（`size` 18×10×11、Low/High、西の鐘塔付き） | 長さが4 m足りない。非等方に拡縮しない方針のため、そのまま伸ばさない |
| 3,000〜8,000 | 48 m | バシリカ（66×30 m、高さ46 m） | なし | 中間がない |
| 8,000〜25,000 | 64 m | 同上 | なし | 中間がない |
| 25,000以上 | 88 m | 同上 | `basilica-temple`（`src/buildings/temples`、64×30×46、ロマネスク） | 足りる |

- P0の記録には「礼拝堂にはBV資産がない」とあるが、`village-chapel`と`parish-church`は既にある。旧CEは`village-chapel`を`CE_CHAPEL`（`src/city3d/three/specialBuildingMeshes.ts`）として、礼拝堂の構造物の位置に当てはめている。メッシュなしCEの`ce-civic-chapel`が量塊なのは、まだ接続していないだけである。
- 最も大きな欠落は3,000〜25,000人の層である。現在の表は、人口3,000の町に、長さ66 m・高さ46 mの双塔のバシリカを置く。1,000〜3,000人の22×10 mから見ると、面積は約9倍、高さは約4倍に跳ぶ。
- 広場の付属物は、市場の屋台（Medieval 06）、市庁舎・屋根付き市場（Medieval 26）、井戸・公共の水盤（`wells`）がある。市場の十字架、さらし台などはない。
- 教会墓地の付属物は、墓標（Medieval 19）と墓地の施設（Medieval 44）がある。墓地の入口の屋根門（lych-gate）と墓地の十字架はない。

### 2.2 守る約束

- 完成したモデルを非等方に拡縮して敷地へ合わせない（[bv-composite-models.md](bv-composite-models.md)）。寸法は、ベイ数・階数などの限られた入力で生成し直す。
- 母体の壁と屋根は連続させ、付属部品は埋め込む重ね合わせで接続する。差し込み用の穴を母体に作らない（同文書、2026-11-01の指示）。入口・窓の開口は別である。
- 品質は`low` / `high`の2段階で登録する（`registerHighVariants`の方式）。作者は`src/buildings/authors.ts`の登録表に従い、新しい表記が要る場合は先に登録表へ足す（[bv-model-authorship-ce-adoption.md](bv-model-authorship-ce-adoption.md)）。
- 完成モデルのスクリーンショットはリポジトリへ追加しない。確認は計測値とBVでの目視で行う。
- 敷地の向きは`BV_FRONT_AXES`（`src/buildings/placementContract.ts`）に登録する。バシリカと同じく西の正面を-xとする。

## 3. 追加するモデル

### 3.1 教会の段階

教会は、1つの生成関数にベイ数などを渡して作る。段階ごとに別のファイルを持たず、部品（身廊・側廊・内陣・塔・翼廊・玄関）を共通にする。

```ts
// 案：src/buildings/churches/townChurch.ts
interface TownChurchSpec {
  naveBays: number; bayLengthMeters: number; naveWidthMeters: number;
  aisles: 0 | 1 | 2; clerestory: boolean;
  chancelBays: number; apse: "none" | "polygonal";
  tower: { place: "west" | "crossing"; stages: number; spire: "none" | "timber" | "stone" };
  transept: boolean; southPorch: boolean;
}
```

| 段階 | 人口 | 呼び名 | 目標の外形（長さ×幅、高さ） | 構成 | 新規 |
| --- | --- | --- | --- | --- | --- |
| T1 | 1,000未満 | 村の礼拝堂 | 14×8 m、10 m | 単廊、小さな内陣、木の鐘架 | 既存`village-chapel`。高さを計測して表を合わせる |
| T2 | 1,000〜3,000 | 市場町の教区教会 | 22×10 m、14 m | 身廊4ベイ、内陣、西の鐘塔、南の玄関 | 新規 |
| T3 | 3,000〜8,000 | 大きな町の教区教会 | 36×20 m、28 m | 身廊5〜6ベイ、片側または両側の側廊、高窓、西塔と木造尖塔、南北の玄関 | 新規 |
| T4 | 8,000〜25,000 | 参事会教会・大規模教区教会 | 52×28 m、36 m | 側廊付きの身廊、翼廊、交差部の塔、多角形の後陣、礼拝所 | 新規 |
| T5 | 25,000以上 | 司教座級の大聖堂 | 64×30 m、46 m | 既存`basilica-temple` | なし（ゴシック版は別タスク） |

- 外形の値は設計上の目標である。着手時（B0）に、中世の教区教会・参事会教会の規模を史料で確かめてから確定する。確かめられない値は暫定と明記する。
- T2は既存の`parish-church`と別のモデルにする。`parish-church`は小さな教区教会として残す。BVでは同じMedieval 14の下に並べる（`task: 14`）。
- 地域・様式の差（ロマネスクとゴシック、地方の屋根材）は初回では持たない。1つの様式（石造、瓦またはスレート屋根、尖頭窓）に絞り、様式の切り替えは§9のD2で決める。

### 3.2 広場の付属物

| 段階（広場の一辺） | 置く物 | 既存 | 新規 |
| --- | --- | --- | --- |
| 18 m（村の緑地） | 井戸、さらし台 | 井戸 | 木のさらし台・足かせ（W1） |
| 30 m | + 石の市場十字架 | | 段付きの石の十字架（W2） |
| 48 m | + 屋根付きの市場十字架、市場の屋台 | 屋台（Medieval 06） | 屋根付きの市場十字架（W3） |
| 64 m | + 市庁舎、屋根付き市場 | Medieval 26 | なし |
| 88 m | + 水盤の噴水 | 公共の水盤 | なし |

- 広場に何をどこへ置くかの規則はCE側の作業（B6）で、BVでは部品を作るだけである。18 mの広場に、20 m級の建物は置かない。

### 3.3 墓地の付属物

墓地の奥行は人口段階で20 / 30 / 40 mになる。墓地に付ける物を足す。

- Y1：墓地の十字架（段付きの台座、石の軸）。
- Y2：墓地の入口の屋根門（lych-gate。木造、瓦の屋根、2本の柱と梁）。

## 4. 実装の構成（案）

- 教会の生成：`src/buildings/churches/townChurch.ts`（仕様と部品の組み立て）、同`townChurchPresets.ts`（T2〜T4の仕様）。`ModelKit`と`HouseDetailKit`（`parishChurchDetails.ts`）の部品を再利用する。Highは別に作る（Lowを簡略化したものにしない）。
- 登録：`14-parish-churchesModels.ts`の配列に追加する。id案は`town-church-parish`、`town-church-large`、`town-church-collegiate`。BVでは「Medieval 14 · Parish Churches」に並ぶ。
- 広場・墓地の付属物：`src/buildings/props/`（W1〜W3）と`src/buildings/medieval/44-cemetery-facilitiesModels.ts`の隣（Y1・Y2）。置き場所は着手時に既存の分類を見て決める。
- 配置の外形：`placementModels.ts`に登録し、`placementFootprint(modelId, quality)`で外形を取れるようにする。バシリカと同じく、敷地の外形はモデルの外形から求める。
- 部品の台帳：結合後も、身廊・側廊・塔・内陣などの部品の範囲を残す（`modelParts.ts`）。BVの部品パネルで選べるようにする。

## 5. 検証

- モデルごとに、外形・高さの計測値が目標の±5%に入ることを確かめる（`modelMetrics`）。
- `civicSizeForPopulation`の礼拝堂・教会の寸法と、モデルの外形が一致することを確かめるテストを1つ足す。表とモデルは別の場所にあるので、食い違いをここで止める。
- 既存の構造の整合性テスト（`structuralClearance`、`modelQuality`、`placementContract`）に新モデルが通ること。
- BVで、各段階を並べて大きさの順序と見た目を目視する。画像はリポジトリへ入れない。
- テストは[AGENTS.md](../../AGENTS.md)の方針に従い、変更した範囲に関わるファイルだけを`npx vitest run <file>`で実行する。

## 6. 作業の区切り

1モデル1コミットを基本とする。

| 区切り | 内容 | 完了条件 |
| --- | --- | --- |
| B0 | 調査と計測 | `village-chapel`・`parish-church`・`basilica-temple`の実測。T2〜T4の寸法を史料で確かめて§3.1の表を確定。出典を記録 |
| B1 | 生成の枠組みとT2 | `TownChurchSpec`、部品、T2のLow/High、配置の外形登録。BVで表示できる |
| B2 | T3 | 側廊・高窓・尖塔付きの塔。同上 |
| B3 | T4 | 翼廊・交差部の塔・後陣。同上 |
| B4 | 広場の付属物 | W1〜W3。Low/High |
| B5 | 墓地の付属物 | Y1・Y2 |
| B6 | CE側の接続 | 下記 |

B6（CE側）：

1. `civic.ts`の`modelId`を段階で選ぶ（T1は`village-chapel`、T2〜T4は新モデル、T5は`catalogue:basilica-temple`）。敷地の外形をモデルから取る。
2. `civicSizeForPopulation`の寺院の寸法を、B0で確定した値へ更新する（§9のD1）。
3. 旧CEの`createTownSpecialBuildings`で、礼拝堂以外の段階の教会も描けるようにする。メッシュなしの描画は、機能同等化P2dの配置の照合でこれらのモデルを立てる。

進める順序は、B0 → B1 → B6の一部（T1・T2だけ）→ B2 → B3 → B4 → B5を勧める。T1・T2で1,000人未満〜3,000人の町が先に正しい大きさになり、B6の経路を早く確かめられる。

## 7. リスク

- 教会は平面と立面の自由度が高く、段階ごとの手作りだと数が増える。部品の共通化（§4）を最初に固めてからT3以降に進む。
- 人口3,000〜25,000人で教会の面積が約1/3〜1/2になるため、広場と寺院の敷地の大きさ（`vectorInputFromEditor`の半径）が変わる。B6の後に、固定ケース8件で生成の成功を再確認する。
- 敷地の半径が小さくなると、既存の成功率の記録（P0b）と比較できなくなる。比較は同じ条件で取り直す。

## 8. 範囲外

- 他の宗教・近世以降の教会。
- ゴシックの大聖堂の汎用モデル（T5の置き換え）。必要なら別に起こす。
- 教会の内部、ステンドグラスや彫刻の精密な再現。
- 地域・様式の切り替え（D2）。

## 9. 利用者の判断（2026-11-10）

- **D1：** `civicSizeForPopulation`の表を、モデルに合わせて変えてよい。
- **D2：** 様式は、T2〜T4が揃ってから決める。
- **D3：** T5は当初`basilica-temple`のままとする。巨大都市の巨大なランドマークは別に計画する。

## 10. B0の結果

詳細は[B0の記録](../analytics/bv-town-church-b0-20261110.md)。

- 既存モデルの実測：`village-chapel` 11.3×6.2×7.7 m、`parish-church` 16.5×8.2×10.2 m、`basilica-temple` 62.7×28.1×44.7 m。BVの`size`欄とは合っていない。
- 史料では、人口5,000〜1万人のNorwichに教区教会が約60あった。町の主要な教会でも約55 m（St Peter Mancroft）で、現在の表の3,000人でバシリカを置く値は大きすぎる。T2〜T4の外形（22×10、36×20、52×28 m）は史料の範囲内。高さは暫定。

## 11. B1の結果（2026-11-10）

- 生成の枠組み：`src/buildings/churches/townChurch.ts`の`createTownChurch(spec, detail)`。西塔・身廊（ベイ数）・内陣・南の玄関を仕様から組み立て、塔・内陣・玄関は身廊へ0.3 m埋め込む（切り欠きなし）。外形の中心を原点に揃える。Lowは板と暗い凹みで、Highは尖頭アーチの開口・目地・鐘・鎧戸で作る。
- 実装した仕様の項目は、T2に必要なもの（ベイ数、各部の寸法、塔の段、玄関）。側廊・高窓・翼廊・交差部の塔・尖塔は、必要になるB2・B3で仕様に足す。
- T2：`town-church-parish`（`MARKET_TOWN_PARISH_CHURCH`）。実測は21.9×10.6×13.9 m、Low 1,082・High 69,024三角形。BVの「Medieval 14 · Town Churches」に表示される。作者は`Claude Sonnet 5.5`（登録表に追加）。CEへは未接続（`cePlacementStatus: "preview-only"`、B6で接続）。
- 前提だった「既存`parish-church`と別のモデル」とするため、既存の`14-parish-churchesModels.ts`は変更せず、新しい`14-town-churchesModels.ts`に置いた。
- BVで目視した（Highの外観・前面図・平面図）。画像はリポジトリへ入れていない。
- 配置の外形（`placementFootprint`）への登録と`BV_FRONT_AXES`（西の正面は-x）の登録は、CE接続（B6）と同時に行う。
- 検証：`townChurch.test.ts`（外形が22×10 m・高さ13〜15 mの許容内、原点の中心）、既存の`modelQuality`・`placementContract`・`catalogue`・`compactModel`・`adoption`のテストが通った。`structuralClearance.test.ts`は`wayside-courtyard-inn`で失敗するが、新モデルを外しても同じ失敗で、既存の問題である。

## 12. B2の結果（2026-11-10）

- 仕様に側廊（`aisles`：片流れの屋根、身廊は高窓の壁として立ち上がる）と、塔の屋根の種類（`roof: "pyramid" | "spire"`）・塔の扉の寸法を足した。T2の外形は変わらない（21.9×10.6×13.9 m）。
- T3：`town-church-large`（`LARGE_TOWN_PARISH_CHURCH`）。身廊6ベイ、両側の側廊、高窓、西塔の木造の八角尖塔と隅の小尖塔、南の玄関。実測は35.3×19.9×27.8 m（目標36×20×28）、Low 1,590・High 130,828三角形。作者は`Claude Sonnet 5.5`。CE未接続（`preview-only`）。
- 側廊の屋根は傾けた板1枚、側廊の端の三角壁は別の面で作る。T3にも北の玄関は付けていない。
- BVでHighを目視した（外観・前面図・平面図）。
- 検証：`townChurch.test.ts`をT2・T3の2件に拡張（外形・高さの許容、中心）。`modelQuality`・`placementContract`・`catalogue`・`adoption`のテストも通った。

## 13. 次に進める作業

B3（T4：参事会教会、52×28 m）。翼廊・交差部の塔・多角形の後陣を仕様に足す。
