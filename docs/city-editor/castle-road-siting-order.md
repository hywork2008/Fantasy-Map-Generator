# City Editor — 城と街道の配置順序の再設計

作成日: 2026-10-07。状態: **実装済み（2026-10-07）**。地形採点・中央型の H5 経路加点は未実装。

叩き台: [FMG連携の地形・バイオーム要素調査](temp/survey/factors.md) §2、[地形防御を活用した城郭配置設計](topography-driven-citadel-placement.md)。
関連: [城と城壁の設計](castles-and-fortifications.md)、[城郭実装記録](castles-implementation.md)、[生成処理の対応](generation-process.md)。

---

## 0. 結論

1. **街道が先、城が後、門と街路が最後。** 史実では、地域の街道と渡河点が城・町より先に存在し、城はそれを**脇から押さえる**位置に建てられた。城が街道を物理的に塞ぐことはない。
2. **城は街道の上ではなく横に置く。** 通過交通は都市門→市場→都市門を通り、城には市街側から入る別の門がある。城が支配するのは「通路」であり、「通行」させるのではない。
3. **生成順序を `街道回廊 → 門の受け持ち区間 → 城 → 門の確定 → 街路` に変える。** 城の候補は「街道回廊を塞がない」「城外から各門への陸路が残る」の2条件を**必須条件**にし、点数で相殺できる減点にはしない。
4. 地形の採点（比高・天然障壁・蛇行ネック）は [topography-driven-citadel-placement.md](topography-driven-citadel-placement.md) の案をそのまま使う。本書が変えるのは**候補の除外条件**と**工程の順序**であり、地形採点は除外を通過した候補の中での順位付けに使う。

---

## 1. 現状の問題（Hekus の事例）

共有URLの Hekus（小規模、平坦、東側が海、街道は北東と南西の2本）では、次の2つの失敗が起きた。

| 版 | 城の位置 | 結果 |
| --- | --- | --- |
| 修正前 | 海に接する外周の角 | 城の離隔帯が、海と城の間の唯一の陸路を塞ぐ。北の街道が門 `v117` に届かず、8案すべて `unconnected-gates` |
| 再試行で候補をずらした版 | 左上（南西の街道寄り） | 門が城を避けた位置にずれ、町道が外周を回り込んで街道とV字に接続（後で接続部だけを修正） |

原因は、[castlePlacement.ts](../../src/city-editor/core/gen/castlePlacement.ts) の候補評価が街道を全く見ないことにある。

```ts
height * 2 + (edge ? d * 0.05 : -d * 0.2) - |面積 - 目標| * 0.001
```

- 平坦地では `height` が一定のため、「中心から最も遠い外周セル」が選ばれる。陸側に突き出た外周であり、街道が入ってくる方向と重なりやすい。
- 生成順序は [generate.ts](../../src/city-editor/core/generate.ts) の `runPlan` で `placeCastleRegion` → `placeGates` → 街路 A* の順。門は城を避けることしかできない（`canPlaceTownGate`）。道は城の禁止帯を迂回することしかできない（`castleBlocked`）。
- 既存設計 [castles-and-fortifications.md](castles-and-fortifications.md) §5.2 には「門への道が作れない候補は不採用」「都市門同士が城内を通らないと結べない候補は棄却」と書かれているが、実装されていない。
- 一方、門の位置は既に街道の方位から決まっている（`placeGates` が `geo.importedRoads` / `roadPaths` の方位を目標にする）。**街道の情報は城を置く時点で既に手元にあるのに、城の配置にだけ使われていない。**

再試行のたびに候補順をずらす対処（`candidateOffset`）は症状を避けるだけで、本書の設計で置き換える。

---

## 2. 歴史上の配置

### 2.1 調査した史例

| 史例 | 城と街道・門の関係 | 出典 |
| --- | --- | --- |
| Wallingford、ロンドン塔 | ノルマン期の都市城は、既存の都市防御線の**角**に割り込んで建てられた（Wallingford は北東角、ロンドン塔は南東隅で河岸）。旧来の通りと門はそのまま残る | [Medievalists.net: Norman Imposition](https://www.medievalists.net/2010/06/norman-imposition-the-medieval-castle-and-the-urban-space-1050–1150/)、[castles-and-fortifications.md §2.1](castles-and-fortifications.md) |
| Conwy、Beaumaris（エドワード1世の計画都市） | 共通して **T字型の街路**が海岸・川から内陸へ伸び、城は **T の上端の角**にある。城は主軸の脇に位置し、主軸の上には乗らない。都市門は3つ（上門・下門・水車門）で、城の近くには別に小さな通用門がある | [Conwy town walls](https://en.wikipedia.org/wiki/Conwy_town_walls)、[Cadw](https://cadw.gov.wales/visit/places-to-visit/conwy-town-walls) |
| Caernarfon | 城は半島の**南端**（川の河口側）。陸側の主入口は東門（Porth Mawr）で、大通りの東西端に門がある。城は大通りの延長上ではなく、その脇にある | [Gatehouse Gazetteer](https://gatehouse-gazetteer.info/Welshsites/91.html)、[castlewales.com](https://castlewales.com/caernarf.html) |
| Monmouth | 都市門は5つ以上あり、そのうち St Stephen's Gate だけが**城の外庭への入口**。城への入口と都市への入口は別 | [Monmouth town walls](https://en.wikipedia.org/wiki/Monmouth_town_walls_and_defences) |
| Ludlow、Nottingham | 城が先に建ち、その門前に市場と計画街区が後から整備された（Nottingham は城の下に新しい「フランス人の町」と市場ができた） | [Ludlow 考古報告](https://archaeologydataservice.ac.uk/catalogue/adsdata/arch-435-1/dissemination/pdf/PDF_REPORTS_TEXT/SHROPSHIRE/LUDLOW_REPORT.pdf)、[Timeline of Nottingham](https://en.wikipedia.org/wiki/Timeline_of_Nottingham) |
| Edinburgh、Kraków | 高所の城から背骨状の主街路が下る（Royal Mile）。または、都市門から城まで「王の道」が通る。主街路は**城門で終わる**のであって、城を貫いて町の外へ抜けるのではない | [Royal Mile](https://en.wikipedia.org/wiki/Royal_Mile)、[Royal Road, Kraków](https://en.wikipedia.org/wiki/Royal_Road,_Krak%C3%B3w) |
| 日本の城下町 | 近くの街道を付け替えて**城下（町人地）を通す**。街道は城の正面を通るが、城内は通らない。町の道は鉤の手・食い違いで見通しを切る | [JAANUS: jōkamachi](https://projects.mcah.columbia.edu/jaanus/node/3565)、[Samurai Archives: Jokamachi](https://samurai-archives.com/wiki/Jokamachi) |

### 2.2 史例から導く規則

史例を生成規則に翻訳したものであり、統計に基づく頻度ではない（設計上の推論）。

| # | 規則 | 根拠 |
| --- | --- | --- |
| H1 | **街道と渡河点は城・町より先にある。** 城は既存の交通を支配するために置かれる | ノルマン都市城、城下町の街道付け替え |
| H2 | **城は街道の脇から押さえ、街道の上には乗らない。** 通過交通は都市門と市場を通る | Conwy の T字、Caernarfon の大通り、城下町 |
| H3 | **城の入口は都市の入口と別。** 城門は市街側へ開き、外向きの出入口は通用門・水門に限る | Monmouth、Conwy の通用門、Carcassonne |
| H4 | **外周型の城は防御線の「角」、特に水際・崖を背にした角に置く。** 陸側の正面は街道と門に譲る | Wallingford、ロンドン塔、Caernarfon、Conwy |
| H5 | **中央・高所型の城は主街路の終点になる。** 主街路は「都市門 → 市場 → 城門」と続き、城で行き止まる | Edinburgh、Kraków、Ludlow |
| H6 | **城と街道の距離は「近すぎず遠すぎず」。** 門・橋・渡河点を見下ろせる位置にあるが、門前の広場と進入路は城の外にある | 全史例。城の機能（監視・徴税・支配）と町の機能（交易）の分離 |

H2 と H4 を合わせると、Hekus のように片側が海の町では、城は**海側の角**に置き、陸側から来る2本の街道とその門は城を避けて町へ入る。海と城の間に街道を通すのではなく、城が海に背を付けて街道の通り道を残す配置が正しい。

---

## 3. 生成順序の再設計

### 3.1 新しい順序

```
① 海岸・河川                 （現行のまま）
② 市街地コア・城壁線          （現行のまま）
③ 街道回廊の予約              ← 新設
④ 門の受け持ち区間の決定      ← placeGates の方位決定を前倒し
⑤ 城の配置                    ← 回廊・区間・陸路の到達性を必須条件に
⑥ 門の確定                    ← 区間内でスナップ
⑦ 城門・城の支線、街路        （現行の A*、城禁止帯はそのまま）
```

現行は ⑤（城）→ ④⑥（門）→ ⑦（道）の順で、③が無い。変更点は、**③④を城より前に置き、⑤がその結果を制約として受け取る**ことだけである。⑥以降のアルゴリズムは変えない。

### 3.2 ③ 街道回廊（Approach Corridor）

descriptor の各街道（`importedRoadsForSite` / `geo.roadPaths`）について、地図枠から市街地の外周までの「街道が通るはずの帯」を予約する。

```ts
interface ApproachCorridor {
  sourceIndex: number;      // descriptor の road index
  routeId: number;
  bearingDeg: number;       // 町から見た方位（placeGates が使う値と同じ）
  centerline: Point[];      // 枠の進入点 → 外周の到達予定点
  halfWidthMeters: number;  // 道幅/2 + 城の離隔 + 余裕（初期値 max(12, blockSize*0.5)）
  arrival: Point;           // 外周（城壁線）上の到達予定点
}
```

- `centerline` は、枠の進入点から市街地外周までを descriptor の道路形状に沿って取り、外周との最初の交点を `arrival` にする。
- 外周を回り込んで門に至るのではなく、**街道がそのまま外周に当たる点**を門の目標にする。これにより、前回直したV字接続（外周に沿って回り込んでから折り返す道）の発生源も断てる。
- 海・川の中を通る部分は回廊に含めない（固定渡河 `fixedCrossings` がある区間は既存の橋の帯で扱う）。
- descriptor が無い（`synthSite`）場合は、合成した道路方位で同じ回廊を作る。生成器の分岐を増やさない。

### 3.3 ④ 門の受け持ち区間（Gate Sector）

現行の `placeGates` は、方位の目標を決める処理と、外周頂点へスナップする処理を一度に行う。これを2段に分ける。

1. **区間の決定（城より前）**: 各回廊の `arrival` を中心に、外周に沿って前後 `±max(1.5×blockSize, 25 m)` の弧を「この街道の門が立つ区間」とする。
2. **頂点の確定（城より後、⑥）**: 区間内の外周頂点から、現行と同じ基準（通路が開くこと、門の間隔、水際でないこと）で選ぶ。

一体型の城は外周を書き換える（城をコアに加えて外周を再計算する）ため、区間は頂点IDではなく**外周上の弧（座標と方位の範囲）**で持つ。城の配置後に、再計算した外周の上で同じ弧を引き直す。

### 3.4 ⑤ 城の配置：必須条件

候補（現行の `placeCastleRegion` の候補生成を流用）に対し、点数より先に次を判定する。1つでも満たさない候補は捨てる。

| # | 条件 | 判定方法 | 対応する規則 |
| --- | --- | --- | --- |
| C1 | 城の予約面とその離隔帯（`castleRoadEdgeAllowed` と同じ `(道幅 + 壁厚)/2 + 0.5 m`）が、どの街道回廊とも重ならない | 回廊の帯ポリゴンと城の予約面＋離隔のポリゴン交差 | H2 |
| C2 | 城が、どの門の受け持ち区間とも重ならない（一体型の城の外向きの弧が区間を含まない） | 外周弧の重なり | H2, H3 |
| C3 | 城を置いた後も、各回廊の枠進入点から `arrival` まで、城の離隔帯と水域を避ける陸路が残る | 面グラフ（城外の陸の面、城の禁止辺を除く）上の BFS。メッシュは数百面なので候補ごとに実行しても安い | H2 |
| C4 | 都市門同士を結ぶ市街内の経路が、城の予約面を通らずに存在する | 市街地の面グラフから城の面を除いた連結性 | H2（既存設計 §5.2 の未実装分） |

C3 は Hekus の失敗そのものを捉える条件である。城と海の間に残った陸の帯が離隔帯で途切れると、北の街道の進入点から門の区間へ到達できず、その候補は捨てられる。

全候補が C1〜C4 を満たさない場合の扱い:

1. 規模を1段小さくして再探索する（`standard` → `small`。既存の relaxed パスと同じ位置づけ）。
2. それでも無ければ `relationship: "detached"` で再探索する（現行のフォールバック順を維持）。
3. それでも無ければ城を置かず、`castle-no-site` で不採用にする。**街道を塞いだまま街路生成に進ませない。** 失敗理由には、満たせなかった条件と回廊の番号を出す。

### 3.5 ⑤ 城の配置：採点

必須条件を通過した候補の順位付け。地形項は [topography-driven-citadel-placement.md §4.2](topography-driven-citadel-placement.md) の定義を使う。

| 項 | 内容 | 規則 |
| --- | --- | --- |
| 地形（比高・天然障壁・アンカー近接） | 地形設計書の `S_prom`、`S_barrier`、`S_anchor` | H4 |
| 角らしさ `S_corner` | 一体型: 城が占める外周の弧が凸角（外周の折れ角が大きい頂点）を含むほど加点 | H4 |
| 街道との距離 `S_command` | 最寄りの回廊または門区間までの距離 `d` が 1〜3 ブロック（`blockSize`〜`3×blockSize`）なら最大点、それより近い（C1 の境界付近）または遠いと漸減 | H6 |
| 陸側正面の明け渡し `S_landFront` | 平坦地のフォールバック。街道の到来方位の平均ベクトルと逆側、または水際側の外周ほど加点 | H2, H4 |
| 面積の適合 | 現行の `|面積 − 目標|` 減点 | — |
| 中心からの距離 | 現行の `d * 0.05` は廃止する。「遠いほど良い」は街道の来る方向へ吸い寄せる元凶なので、`S_landFront` で置き換える | — |

中央型（`central`）の採点は H5 に従う。主要な門から市場を経て城まで、市街地の面グラフ上の経路が直線的に通る候補を加点し、城門をその経路の終点に向ける。中央型にも C1〜C4 を適用する（特に C4: 中央の城が門と門の間の唯一の通り道を塞がないこと）。

`position: "auto"` の edge/central の決め方は地形設計書 §4.3（地形類型による決定）に従う。平地型（`plain`）でのみ現行の乱数（外周 85%）を残す。

### 3.6 ⑥⑦ 門・城門・街路

- 都市門は §3.3 の区間内で確定する。C2 により、区間が城に食われていることは無い。
- 城門は市街側（H3）。一体型の城の外向きの弧に通用門・水門を置くのは任意で、その門は外部街道と接続しない。現行の「城門を都市門の予算・外部道路数に数えない」をそのまま維持する。
- 街路 A* と `castleBlocked` の禁止は現行のまま。C1〜C3 により、城外の道が城の禁止帯で詰まる状況は起こらない前提になる。それでも経路が失敗した場合は、従来どおり `unconnected-gates` で不採用にする（不変条件として残す）。

---

## 4. 実装範囲

| 箇所 | 変更 |
| --- | --- |
| `core/gen/approachCorridors.ts`（新設） | §3.2 の回廊生成と、C1/C3 の判定関数（帯の交差、面グラフ BFS） |
| `core/gen/interior.ts: placeGates` | 方位→区間の決定（`planGateSectors`）と、区間内スナップ（`snapGatesToSectors`）に分割。既存の呼び出しは2つを続けて呼ぶ薄いラッパーとして残し、circulade/bram の推奨方位スナップも区間の決定側に入れる |
| `core/gen/castlePlacement.ts: placeCastleRegion` | 引数に `corridors` と `sectors` を追加。候補ごとに C1〜C4 を判定してから採点。`d * 0.05` を `S_landFront` / `S_corner` / `S_command` に置き換え。`candidateOffset` を削除 |
| `core/generate.ts: runPlan` | 城の配置の前に回廊と区間を作り、城の配置の後で外周を再計算してから区間内で門を確定する。`placeCastleRegion` の呼び出しから `attempt - 1` を外す |
| `generationDiagnostics` | `castle-no-site` の詳細に、各候補を落とした条件（C1〜C4）と回廊番号を出す |

地形設計書のステップ1（`tacticalTerrain.ts`）とは独立に実装できる。順序は「本書の必須条件と順序変更 → 地形採点」を推奨する。必須条件が無いまま地形採点だけ強めると、高所の城が街道を塞ぐ失敗が別の形で再発するため。

---

## 5. 受入基準

| ケース | 期待 |
| --- | --- |
| Hekus（`fixtures/hekus-ui-request-20261007.json`） | 案1で城付きの都市が生成される（再試行に頼らない）。城は海側の外周にあり、2本の街道がそれぞれの門へ、外周を回り込まずに入る。各接続部の折れ角は45°以下 |
| 片側が海で街道が陸側から2本 | 城は海に接する外周の角に置かれ、どの街道回廊とも重ならない |
| 街道が4方向から来る平坦地 | 城は回廊の間の外周の角に置かれる。どの都市門の区間も城の外向きの弧に含まれない |
| 中央型 | 主要な門から市場を経て城門に至る通りがあり、城を通らずに門同士を結べる |
| 全候補が C1〜C4 を満たさない小さな町 | 規模縮小 → 独立型 → `castle-no-site` の順に退き、街道を塞ぐ城は生成されない |
| 既存 fixture（Tobogobo、Tives、Autruyles、Shroutumn、Atheiate、Bonenfeld） | 城の有無と門の数が変わらない。位置が変わる場合は、本書の規則に沿う変化であることをテストの期待値更新時に確認する |
| 決定論 | 同一 seed・同一入力で、回廊・区間・城・門が一致する |

---

## 6. 未決事項

- **回廊の幅**: 初期値 `max(12 m, blockSize × 0.5)`。Micro では町全体に対して太すぎる可能性があり、実測で調整する（ライブ計測で較正する方針）。
- **城が街道を意図的に支配する型**: 峠や橋頭堡で、城門そのものが関所になる型（橋の袂の城、峠の関）は H2 の例外である。現行の生成対象外とし、descriptor に橋頭堡・峠の類型が来た段階で別の配置型として追加する。
- **旧市壁の角への割り込み**（ノルマン型）: 旧城壁を導入する段階で扱う。本書は単一の城壁線のみを対象とする。
