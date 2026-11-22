# CE meshless 市壁のない短冊形区画の村 — 街道に張り付く街区と裏小路

作成: 2026-11-22
更新: 2026-11-22（V0: 村の区画の間口・奥行き、裏小路、村の通りと広場、南欧の村の史料を調べ、§2.4 に採用値を確定した。§4.2・§5 をそれに合わせて改めた。V1: 区画の型 `village-toft` と純関数 `planRoadsideBlocks` を作った。§5.6 の費用を「重み × 距離 ＋ 基準」に改め、設定・UI・検証は V2 に回した（§12）。V2: `burgage-village` を生成に接続し、v66 とした（§13））
状態: V0〜V2 完了。次は V3。
対象: メッシュなし CE（skeleton-first）の、FMG と連携しない単独の都市生成（合成入力）。FMG から開いた都市、メッシュあり CE、廃止予定の CG は対象外。
関連: [ce-burgage-plot-fabric.md](ce-burgage-plot-fabric.md)（区画の型と寸法）、[ce-meshless-growth-generation.md](ce-meshless-growth-generation.md)（成長型の生成。未実装）、[ce-meshless-gate-ribbon-growth.md](ce-meshless-gate-ribbon-growth.md)（市壁の外の街道沿いの帯）、[ce-rural-field-layout.md](ce-rural-field-layout.md)（郊外の耕地）、[bridge-skew-policy.md](bridge-skew-policy.md)

## 1. 目的

### 1.1 起きていること

メッシュなし CE の単独生成では、市壁がないときも円形の敷地（`siteDisk`、[input.ts](../../src/city-editor/generators/vector/generation/input.ts)）を先に作り、その中を道路で切って街区にする。短冊形区画（`burgage`）を選ぶと、区画の奥行きは 50〜90 m と深い。このため、円の縁に近い街区では、裏庭と建物が円弧で斜めに切られる。

市壁がない村には、円に沿って敷地を揃える理由がない。円で切られた裏庭は史実の村落の形に合わない（§2）。

### 1.2 本書で行うこと

市壁がなく短冊形区画を使う集落を、円形の下書きから始めない。次の順に生成する。

1. 村の中心（教会・広場・交差点・渡河点）と、そこへ集まる街道を描く。
2. 街道の両側に、四角形の街区を張り付けて並べる。街区の中を短冊形区画に割る。
3. 街区と街区の隙間から裏へ抜ける小路を通し、街区の奥に沿う裏小路につなぐ。
4. 人口が足りなければ、裏小路の外側にも四角形の街区を並べる。
5. 残った土地は畑・牧草地などにする（既存の土地利用 `landUse` と耕区 `furlongs`）。

## 2. 史料

2026-11-22 にウェブ検索で調べた。本文を読んだものを「確認済み」、検索結果に示された各機関・論文の記述でしか見ていないものを「確認済み（要約）」とする。V0 では本文を読もうとしたが、Historic England と North York Moors National Park Authority のサイトは自動の取得を拒み（HTTP 403）、Wharram Percy の調査報告（ADS）は PDF が大きすぎて読めなかった（§11）。これらは「確認済み（要約）」のままである。

### 2.1 確認した史料

| 例 | 確認した内容 | 状態 |
| --- | --- | --- |
| Appleton-le-Moors（North Yorkshire）。North York Moors National Park Authority の Conservation Area Appraisal（[PDF](https://www.northyorkmoors.org.uk/__data/assets/pdf_file/0023/206528/Item-8-Appendix-1,-Appleton-le-Moors-CAA-accessible-2026.pdf)）、同 Authority の案内（[Web](https://www.northyorkmoors.org.uk/places-to-go/hutton-le-hole-lastingham-appleton-le-moors)） | 12 世紀の計画村落。街道 1 本の両側に長い区画（toft と croft）が並ぶ。裏の敷地は奥行きが揃っていて、裏小路（back lane）まで続く。裏小路は街道の両側に 1 本ずつある。案内には、裏庭の長さが約 330 ft（約 100 m）とある | 確認済み（要約） |
| Historic England, *Medieval Settlements*（[Web](https://historicengland.org.uk/images-books/publications/iha-medieval-settlements/heag210-medieval-settlements)） | 計画村落の toft と croft は同じ大きさで、正面の線と奥の線を隣と共有する | 確認済み（要約） |
| Stratford-upon-Avon（1196 年）。*VCH Warwickshire* vol. 3（[BHO](https://prod.british-history.ac.uk/vch/warks/vol3/pp247-258)）、Stratford Society "History of Bridge Street"（[PDF](https://www.stratfordsociety.co.uk/files/History_of_Bridge_Street.pdf)） | 市壁のない計画都市。区画は 3½ × 12 perch（約 17.6 × 60 m）で、通りに沿って割られた。区画の境界の多くは今の地割に残る（[Our Warwickshire](https://www.ourwarwickshire.org.uk/?p=45274)） | 確認済み（[ce-burgage-plot-fabric.md](ce-burgage-plot-fabric.md) §2.1 でも使用） |
| Chipping Campden。考古学の評価報告（[ADS](https://archaeologydataservice.ac.uk/catalogue/adsdata/arch-1359-1/dissemination/pdf/archaeol27-342664_2.pdf)）、PCAS の論文（[ADS](https://archaeologydataservice.ac.uk/catalogue/adsdata/arch-1895-1/dissemination/pdf/PCAS/2016_CV/PCAS_CV_2016_065-072_Mustchin.pdf)） | 11〜13 世紀の計画町。線状の集落で、細長い区画が主要な通りに直角に伸びる。区画の形は High Street 沿いに最もよく残り、中心から離れるほど崩れる | 確認済み（要約） |
| 三富新田（元禄期、埼玉県所沢市・三芳町）。埼玉県の景観資源データシート（[PDF](https://www.pref.saitama.lg.jp/documents/63694/9999924017.pdf)）、三芳町の町勢要覧（[PDF](https://cms.town.saitama-miyoshi.lg.jp/town/oshirase/documents/07youran-P12-P15.pdf)） | 1 戸分を幅 40 間（約 72 m）× 奥行き 375 間（約 682 m）の短冊形に割った。道の側から、屋敷地・耕地・雑木林の順に並ぶ | 確認済み（要約） |
| 野火止新田（1661 年）。法政大学『史学』の論文（[PDF](https://hosei.ecats-library.jp/da/repository/00010683/shigaku_15_nagahama.pdf)） | 川越街道の両側に、屋敷・耕地・野が奥行き約 400 間で続く | 確認済み（要約） |
| Historic England の指定記念物の記述（V0）: Uckerby（[1017691](https://historicengland.org.uk/listing/the-list/list-entry/1017691)）、Kirby Knowle（[1019521](https://historicengland.org.uk/listing/the-list/list-entry/1019521)）、Cottam（[1017068](https://historicengland.org.uk/listing/the-list/list-entry/1017068)）、Wolfhampcote（[1019026](https://historicengland.org.uk/listing/the-list/list-entry/1019026)）、High Worsall（[1019065](https://historicengland.org.uk/listing/the-list/list-entry/1019065)） | 廃村の遺構の実測。toft の間口は Kirby Knowle で約 20 m、Cottam で 20 m 強（奥行き 35 m）、Wolfhampcote で 15〜50 m、Uckerby で最大 40 m（奥行き 60 m）。Uckerby では toft の後ろに幅 4 m の道の跡がある。Kirby Knowle では toft の後ろに裏小路がある。村の通りは Wolfhampcote で幅 8〜15 m、High Worsall で最大 40 m | 確認済み（要約） |
| J. Sheppard, "Metrological analysis of regular village plans in Yorkshire", *Agricultural History Review* 22 (1974)。同じ著者の "Medieval village planning in northern England"（*Journal of Historical Geography*、[ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/030574887690150X)） | 規則的な計画村落 約 100 か所を 19 世紀の OS 地図で調べ、toft の並びの長さに最も多く見られる単位は 18 ft の perch（5.49 m）だった。20 ft の perch も少しある。規則的な村落は 1070〜1400 年頃のものと見られる | 確認済み（要約。抄録だけ） |
| H. Thorpe, "The Green Villages of County Durham", *Transactions and Papers of the IBG* 15 (1949), pp. 155–180。Thorpe Thewles の村の団体による紹介（[Web](https://thorpe-thewles.org.uk/thorpe-thewles-village-green/)） | 広場（green）の村には street green と broad green がある。street green の幅は最大の長さの 4 分の 1 未満で、普通 150 ft（約 46 m）を超えない。broad green は幅が長さの 4 分の 1 を超え、幅はふつう 150〜250 ft（約 46〜76 m）で、550 ft（約 168 m）に達するものもある。家は広場から直接出入りし、家と裏庭（garth）の後ろ側には、その長さに沿って外周の道が通ることが多い。Thorpe Thewles の広場は長さ 390 ft（約 119 m）、幅 235〜360 ft（約 72〜110 m） | 確認済み（村の団体による紹介。Thorpe の原典は読んでいない） |
| Hochschule Neubrandenburg, "Siedlungsgrundrisse"（[Web](https://www.hs-nb.de/iugr/landschaft-hat-geschichte/kulturlandschaftselemente/eine-reise-durch-die-siedlungsgeschichte/siedlungsgrundriss-klein-vielen/siedlungsgrundrisse/)） | Angerdorf は、計画的に並べた農家が大きな広場（Anger）を囲む村で、広場が細長いことが特徴である。家の正面は多く軒を広場に向け（traufständig）、厩と納屋は敷地の奥にある。Straßendorf は、農家が通りを軸に 2 列に並ぶ村である | 確認済み |
| J. Passini, *Espacios urbanos a lo largo del Camino de Santiago* の抜き書き（[vallenajerilla.com](https://www.vallenajerilla.com/berceo/santiago/espaciosurbanos.htm)） | サンティアゴ巡礼路の小さな町では、最初の中心（burgo、barrio）が道に沿って約 200〜350 m 続く（Redecilla del Camino、Cacabelos、Molinaseca）。村（aldea）では、区画は道に直角な帯で、家は区画のごく一部を占めて道の端に建ち、約 200 m 続く。Sangüesa は長さ 330 m のまっすぐな軸の両側に計画された。Santo Domingo de la Calzada の Barrio Nuevo の区画は、主要な通りに直角で、長さ 68 m・幅 3.5 m（ただし後に市壁で囲まれた） | 確認済み（抜き書きのページ。ページ自身が「必ずしも原文どおりではない」と断っている） |

### 2.2 確認できなかったこと

| 内容 | 理由 |
| --- | --- |
| Chipping Campden の「Back Ends」「Back Lane」が中世の区画の奥の境界かどうか | 地図に名前があることしか確かめられなかった |
| Waldhufendorf の個別の村の寸法 | 寸法の載った史料を得られなかった。本書の村の形（区画の奥が耕地に続く 1 戸ごとの帯）は三富新田で代える |
| Angerdorf の広場の寸法、Straßendorf の農家の間口 | Hochschule Neubrandenburg のページに数値がなかった |
| Wharram Percy の toft の寸法 | 調査報告の PDF が大きすぎて読めなかった（§11） |
| 横の小路（街区の間を裏へ抜ける道）の幅と間隔 | 史料を得られなかった。[ce-burgage-plot-fabric.md](ce-burgage-plot-fabric.md) の値（`CROSS_LANE`）を使う。ゲーム側の調整である |
| 南欧の村の区画の寸法 | Passini の抜き書きには、村の区画の数値がない。数値のある Santo Domingo は市壁のある町である |

### 2.3 史料から取る取り決め

- **V-R1 街道が先**: 区画は街道（主要な道）に向いて並ぶ。区画の正面の線は街道と平行で、隣と共有する（Appleton-le-Moors、Historic England）。
- **V-R2 奥の線は直線**: 区画の奥行きは 1 つの並びの中で揃い、奥の境界は隣と共有する直線になる（同）。円弧や市域の縁で斜めに切られることはない。
- **V-R3 裏小路**: 区画の奥の境界に沿って、街道と平行な裏小路が通る（Appleton-le-Moors、Kirby Knowle、Uckerby。Durham の広場の村でも、家と裏庭の後ろに外周の道が通ることが多い: Thorpe 1949）。
- **V-R4 裏小路の外は畑**: 裏小路の外は耕地である（Appleton-le-Moors、三富新田、野火止新田）。
- **V-R5 中心は規格どおり、外ほど崩れる**: 区画の形は中心の通りで最も整い、外へ行くほど崩れる（Chipping Campden）。[ce-burgage-plot-fabric.md](ce-burgage-plot-fabric.md) の R6 と同じ考え方で、2 段目の街区（§5.5）は不揃いにしてよい。
- **V-R6 2 段目は後から**: 裏小路の外側に向いた街区は、史料で確かめた村の初めの形には含まれない。ただし、人口を収めるために要る（§5.5）。後から広がった町並みとして扱い、1 段目より浅く不揃いにする。これはゲーム側の調整である。
- **V-R7 村の区画は町の区画より広い**: 村の toft の間口は約 15〜40 m で、20 m 前後が多い（Historic England の遺構の記述）。町の割った区画（5〜9 m、[ce-burgage-plot-fabric.md](ce-burgage-plot-fabric.md) §2.3）の 2〜4 倍である。
- **V-R8 区画は perch の倍数**: 北イングランドの計画村落では 18 ft の perch（5.49 m）が使われた（Sheppard 1974）。間口は perch の倍数で決める。
- **V-R9 家は通りの側に**: 家は区画の通りの側に建ち、区画のごく一部を占める。厩・納屋は奥にある（Passini、Hochschule Neubrandenburg）。
- **V-R10 村の長さ**: 小さな町・村の最初の中心は、道に沿って約 200〜350 m 続く（Passini）。
- **V-R11 広場**: 広場の村の street green は幅が長さの 4 分の 1 未満・幅 46 m まで、broad green は幅 46〜76 m（Thorpe 1949）。Angerdorf の広場も細長い（Hochschule Neubrandenburg）。

### 2.4 採用値（V0 で確定）

| 項目 | 史料の値 | 採用値 | 史料から外した理由 |
| --- | --- | --- | --- |
| 1 段目の区画の間口（割っていない区画） | toft 15〜50 m、多くは約 20 m（V-R7）。18 ft perch（V-R8） | 3・3½・4 perch（16.5・19.2・22.0 m。1 perch = 5.49 m） | 40〜50 m の広い toft は、領主の館など特別な区画と見て使わない |
| 区画を割ったときの間口 | 町の区画は後に縦に割られた（[ce-burgage-plot-fabric.md](ce-burgage-plot-fabric.md) R5） | 割っていない区画の半分（8.2〜11.0 m）。さらに割るときは `english-burgage` の `frontageMeters`（5〜9 m）まで | 村の区画をいつ割るかは史料で確かめていない。人口を村の長さに収めるための調整である（§5.6） |
| 1 段目の区画の奥行き | toft 35〜60 m（Cottam、Uckerby）。toft と croft を合わせて約 100 m（Appleton-le-Moors） | 50〜90 m（`english-burgage` の `extramural` と同じ） | 外していない |
| 2 段目の区画の奥行き | なし | 30〜50 m | ゲーム側の調整（V-R6） |
| 村の通り（区画の正面と正面の間） | 8〜15 m（Wolfhampcote） | 8〜15 m | 外していない |
| 裏小路の幅 | toft の後ろの道の跡 4 m（Uckerby） | 3〜4 m | 外していない |
| 横の小路の幅と間隔 | なし | 幅 1.5〜2.5 m、間隔 60〜120 m（`CROSS_LANE`） | ゲーム側の調整 |
| 1 段目を道に沿って伸ばす長さ | 最初の中心は 200〜350 m（V-R10） | 1 本の街道の片側の腕（中心から外へ）で、まず 175 m まで。それを超える分は §5.6 の順序で決め、上限は 750 m | 上限の 750 m は、道に沿って 1.5 km 続く Castrojeriz（[Wikipedia](https://en.wikipedia.org/wiki/Castrojeriz)。要約でしか見ていない）を、中心から両側に分けた値 |
| street green | 幅は長さの 4 分の 1 未満、46 m まで（V-R11） | 幅 20〜45 m、長さは幅の 4〜8 倍 | 幅 20 m 未満の広場は、村の通り（8〜15 m）との差が小さいので作らない |
| broad green | 幅 46〜76 m、168 m に達する例もある（V-R11） | 幅 46〜76 m、長さは幅の 1.2〜4 倍 | 168 m の例は使わない |
| 南欧の村 | 区画は道に直角な帯、家は道の端（Passini）。寸法はない | 英国の村と同じ値 | 寸法の史料がないため。構成が同じことだけを根拠にする |

## 3. 今の実装

| 箇所 | 内容 | 問題 |
| --- | --- | --- |
| [editorInput.ts](../../src/city-editor/generators/vector/generation/editorInput.ts) の `size` | 必要戸数から、`meshlessCityRadius` で円形の敷地の半径を決める。壁がなければ `walledScale` = 1 | 敷地が円であることが前提になっている |
| [input.ts](../../src/city-editor/generators/vector/generation/input.ts) | `site.domain = [siteDisk(center, radius)]` | 円の外には街区ができない |
| [pipeline.ts](../../src/city-editor/generators/vector/generation/pipeline.ts) の `skeleton` | 円の中で道を探索し、道で区切った空き地（`deriveVectorBlocks`）を骨格の街区にする | 円の縁の街区は円弧で終わる |
| [suburbs.ts](../../src/city-editor/generators/vector/generation/suburbs.ts) の `clipVectorDomainToWall` | 壁があれば敷地を壁の中に切る。壁がなければ円のまま | 壁のない町の敷地が円のまま残る |
| [urban.ts](../../src/city-editor/generators/vector/generation/urban.ts) の `core` | 壁がなければ、半径の 0.65 倍の円を「町の中」とする（tanners' row などの判定） | 円に依存する |
| [perimeter.ts](../../src/city-editor/generators/vector/generation/perimeter.ts)、[generators/burgage/](../../src/city-editor/generators/burgage/) | 骨格の街区を受け取り、短冊形区画に割る（`planBurgageCell`）。区画にならない端は `open` にする | 円で切られた街区を割ると、斜めの区画と三角の空き地が出る |

使える部品:

- `planBurgageCell`（[stripCell.ts](../../src/city-editor/generators/burgage/stripCell.ts)）: 四角形の街区を 1 列の短冊形区画に割る。`fronts` で正面の辺を指定する。
- `curvedRibbon`、`RIBBON_EASE_METERS`（[suburbs.ts](../../src/city-editor/generators/vector/generation/suburbs.ts)）: 壁の外の街道沿いの帯。道の折れを均した線から帯を作る。
- `placeFacilitiesOnPlots`（[facilityPlots.ts](../../src/city-editor/generators/vector/generation/facilityPlots.ts)）: 施設を区画単位で置く。
- `raiseVectorLandUse`、`vectorFurlongs`（[landUse.ts](../../src/city-editor/generators/vector/generation/landUse.ts)、[furlongs.ts](../../src/city-editor/generators/vector/generation/furlongs.ts)）: 町の外を耕地・牧草地・森にする。
- 市場・教会・広場（`vectorCivicLayout`）、村の広場の家具（[civicFurniture.ts](../../src/city-editor/generators/vector/generation/civicFurniture.ts)）。

## 4. 方針

### 4.1 設定の持ち方: Plot pattern に新しい値を加える

「市壁なし」と「burgage」の組み合わせで自動的に切り替える方法と、Plot pattern に新しい値を加える方法を比べ、**新しい値を加える**ことにした。

| 観点 | 組み合わせで切り替える | 新しい値を加える（採用） |
| --- | --- | --- |
| 保存済みの文書 | 壁なしの `burgage` で保存した都市の生成結果が変わる。版で分けても、同じ設定から別の形ができる | 今の `burgage` と `burgage-dense` は変えない |
| 分かりやすさ | Walls のチェックを外すだけで町の作り方が大きく変わり、理由が見えない | 選択肢の名前で生成の仕方が分かる |
| 生成の流れ | 円形の敷地を使うかどうかが、壁の設定に隠れて分岐する | 円形の敷地を使わない流れを、値 1 つで選べる |
| 壁との関係 | — | 市壁なしが前提。この値を選ぶと壁を作らない（§4.3） |

- `PlotFabric` に `burgage-village` を加える（[types/contracts/burgage.ts](../../src/city-editor/types/contracts/burgage.ts)）。
- UI の表示名は `Roadside village (burgage, unwalled)` とする。文言は [editors.en.json](../../src/i18n/locales/editors.en.json) と [editors.ja.json](../../src/i18n/locales/editors.ja.json) に置く。
- 新しい CE の既定値は `burgage-dense` のままにする。

### 4.2 区画の型

村の区画は、町の区画（`english-burgage` など）とは別の型 `village-toft` として [profiles.ts](../../src/city-editor/generators/burgage/profiles.ts) に置く。値は §2.4 の採用値で、出典を `sources` に書く。

- 地域の型によらず `village-toft` を使う。`binaire` は裏庭を持たない密な都市の型なので村には合わない。`mediterranean` と `northern-urban` も同じ寸法を使い、建物の外観だけを地域の型に従わせる（§2.4 の南欧の村）。
- 割っていない区画の割合は固定しない。区画は割っていない間口で並べ始め、村の長さに収まらないときに中心に近い区画から割る（§5.6）。割った区画が中心に集まるのは、町の中心ほど区画が割られた史料（[ce-burgage-plot-fabric.md](ce-burgage-plot-fabric.md) R5・R6）に合う。
- 家は区画の通りの側に建てる（V-R9）。Angerdorf の家のように、軒を通りに向けた向き（traufständig）を基本にする。今の家のモデルでこの向きが取れるかは V5 で確かめる。

### 4.3 市壁との関係

- `burgage-village` を選ぶと、Walls・二重壁・稜堡・堀の設定は使わない。`vectorWallChoice` は `wall: "none"` を返す。UI ではそれらの入力を無効にし、理由を表示する。
- 城（`castle`）は、壁とは別のものとして今のまま置ける。

### 4.4 範囲

- 対象は FMG と連携しない合成入力だけ。FMG から開いた都市（`settings.descriptor` がある）では、この値を選択肢に出さない。FMG の道路入口と固定交差を守る処理は、[ce-meshless-growth-generation.md](ce-meshless-growth-generation.md) の GM3 と合わせて後で決める（§9）。
- 人口の目安は 50〜3,000 人。村から小さな市場町までに当たる。3,000 人を超えると、1 段目と 2 段目の街区だけでは収まらない、または街道が長くなりすぎる。街道が村で終わる（中心から腕が 1 本だけの）村は、約 1,700 人で上限に当たる（§12）。足りないときの扱いは §5.6 に書く。
- アルゴリズムの版は `burgage-village` のときだけ新しい版（`vector-urban-v66` を想定）にする。ほかの Plot pattern の出力は変えない。

## 5. 生成の流れ

| 順 | 内容 | 出力 |
| --- | --- | --- |
| 1 | 描画範囲と街道（§5.1） | 中心、街道の中心線、描画範囲 |
| 2 | 村の中心（§5.2） | 広場・教会の敷地、交差点 |
| 3 | 1 段目の街区（§5.3） | 街道に張り付く四角形の街区 |
| 4 | 隙間の小路と裏小路（§5.4） | 横の小路、裏小路 |
| 5 | 2 段目の街区（§5.5） | 裏小路に張り付く四角形の街区（必要なときだけ） |
| 6 | 区画・施設・住宅 | 短冊形区画、施設、家（今の処理を使う） |
| 7 | 残りの土地（§5.7） | 耕地・牧草地・森 |

円形の敷地（`siteDisk`）は作らない。`site.domain` は、描画範囲全体から水域を除いた土地にする。街区は、`deriveVectorBlocks`（道で区切った空き地）ではなく、本書の処理で作る。

### 5.1 描画範囲と街道

- **街道の本数と形**: 合成入力の街道（`synthSite` の approach roads）を使う。村の形は街道の本数で決まる。
  - 1 本が通り抜ける: 街村。
  - 2 本以上が交わる: 交差点の村。
  - 川を渡る: 渡河点の村。橋は [bridgeSkewPolicy.ts](../../src/utils/bridgeSkewPolicy.ts) の上限を守る。
- **街道の均し**: 街区を張り付ける区間は、`curvedRibbon` と同じ考え方で道の折れを均す（`RIBBON_EASE_METERS`）。均した線から道が `RIBBON_EASE_TOLERANCE_METERS` より離れる区間には、街区を張り付けない。
- **描画範囲**: 必要な街道の長さ（§5.6）に、耕地の余白（`LAND_USE_REACH.temperate.town` = 420 m）を加えて決める。上限は今の `frame.extentMeters` の検証の上限に従う。

### 5.2 村の中心

- 中心は `site.center` に置く。交差点の村では、街道の交点を中心にする。
- 中心には広場と教会の敷地を、街区より先に予約する。広場の形は人口で決める。
  - 小さい村: 交差点の角に教会と小さな広場（village green）を置く。
  - 広場の村: 中心の街道を広げて細長い広場（street green、Angerdorf の Anger）にする。寸法は §2.4 の street green の値。広場の両側に 1 段目の街区を張り付け、家は広場に面する（Thorpe 1949）。broad green は、2 本以上の街道が集まる中心にだけ使う。
  - 広場を作るかどうかと、その形は、シードで決める。人口による決まりは史料で確かめていないので作らない。
- 中心から各街道に沿って、両側の 1 段目の街区を並べ始める。交差点の角は、教会・広場・空き地にあてる。角の三角の土地に街区を作らない。

### 5.3 1 段目の街区（街道に張り付く）

街道の片側ごとに、中心から外へ順に街区を並べる。

- **形**: 四角形。正面の辺は、均した街道の線から、村の通りの幅（8〜15 m、§2.4）の半分だけ離して平行に取る。広場に面する街区では、広場の縁を正面の辺にする。両側の辺は正面の辺に直角に取る。奥の辺は正面の辺と平行で、奥行き分離れる（V-R1、V-R2）。
- **奥行き**: 50〜90 m（§2.4）。1 つの街区の中では揃える。隣の街区とは ±10% 以内にする。
- **長さ**: 横の小路の間隔（60〜120 m、§2.4）で決まる。割っていない区画で 3〜7 筆、割った区画で 6〜14 筆になる。中心に近い街区ほど長くする（V-R5）。
- **曲がる街道**: 街道が曲がる区間では、均した線を弦で区切り、弦ごとに 1 つの街区にする。弦と弦のなす角が 20° を超える位置は、街区の切れ目（§5.4 の横の小路）にする。曲がりの内側で、隣り合う街区の奥の角が重なる場合は、奥行きを短くして重ならないようにする。奥行きが型の下限より短くなるなら、その位置には街区を作らない。
- **妨げになるもの**: 川・水辺・急斜面・予約地（墓地・修道院・城）・tanners' row に重なる街区は、その手前で終える。奥行きを削って入れることはしない。斜めに切られた区画を作らないためである。
- **街区の中**: `planBurgageCell` を、正面の辺だけを `fronts` にして呼ぶ（1 列）。四角形の街区なので、区画もすべて四角形になる。

### 5.4 隙間の小路と裏小路

- **横の小路**: 隣り合う 1 段目の街区の間に、幅 1.5〜2.5 m の小路を空ける。これが街道から裏へ抜ける道になる（英国の twitchel・gennel に当たる）。間隔は 60〜120 m（§2.4。ゲーム側の調整）。
- **裏小路**: 同じ側に続く 1 段目の街区の奥の辺に沿って、幅 3〜4 m の裏小路を通す（V-R3、§2.4）。弦ごとの奥の辺をつなぎ、角は丸める。
- **つなぎ方**: 裏小路は、並びの両端と、各横の小路でつなぐ。並びの外側の端は、街道へ戻るか、耕地の農道（`furlongs` の headland）につなぐ。行き止まりの裏小路は作らない。
- **保存**: 裏小路と横の小路は、urban が持つ道（`ownedPaths`）として保存する。種類は `BurgageLane` の `back` と `cross` を使う。

### 5.5 2 段目の街区（裏小路に張り付く）

1 段目の街区を、§5.6 で決めた長さまで伸ばしても戸数が足りないときだけ作る。

- 裏小路の外側に、裏小路を正面にした四角形の街区を並べる。作り方は §5.3 と同じ。
- 奥行きは 30〜50 m（§2.4）。間口は割った区画の値から始める。後から広がった町並みとして、間口と奥行きの不揃いを 1 段目より大きくする（V-R5、V-R6）。
- 2 段目の街区の外には、新しい裏小路を作らない。区画の奥は耕地に接する。出入りは、裏小路と、2 段目の街区の間の横の小路からとる。
- 2 段目を置く順は §5.6 で決める。

### 5.6 大きさの見積もりと伸ばす順序

円の半径ではなく、区画を置ける場所（候補）を中心からの近さの順に取って見積もる。

1. **必要な区画**: 必要戸数（`getUrbanDwellings`、1 戸 4.5 人）を、区画 1 筆あたりの戸数と `lotOccupancy` で割る。施設の土地は、今の `vectorFacilityLand` の値を区画の数に換算して足す。
2. **候補**: 次の 3 種類の候補を、区画 1 筆ずつ作る。
   - 1 段目の延長: 街道の片側の腕を外へ伸ばした区画。
   - 1 段目の分割: すでに置いた割っていない区画を半分に割ってできる、もう 1 筆。
   - 2 段目: 裏小路の外側の区画。
3. **順序**: 候補の費用の低い順に取る。費用は「重み × 距離 ＋ 基準」で、距離は中心から区画の正面の中点までの道に沿った長さである（2 段目は 1 段目の奥行きを足す）。値はいずれもゲーム側の調整である。

   | 候補 | 重み | 基準 |
   | --- | --- | --- |
   | 腕の長さが 175 m までの 1 段目の延長 | 1 | 0 |
   | 175 m を超える 1 段目の延長 | 1.5 | 0 |
   | 1 段目の分割（半分に割る） | 2 | 175 |
   | 1 段目の 2 度目の分割（4 分の 1 にする） | 3 | 350 |
   | 2 段目 | 2.5 | 175 |

   基準により、腕の 175 m までの区画（費用 175 以下）は、どの分割・2 段目よりも先に取られる（V-R10。まず道に沿って村の中心ができる）。その後は、中心に近い区画の分割と、腕の延長と、2 段目が費用で競う。V0 では重みだけ（基準なし）としていたが、それでは中心の近くの分割が腕の延長より先になり、小さな村でも区画が割られてしまった（§12）。
4. **上限**: 腕の長さは 750 m まで（§2.4）。分割は `english-burgage` の間口の下限（5 m）まで。
5. **足りないとき**: 候補を使い切っても足りない分は、未収容として理由 `village-capacity` を付けて報告する。円形の敷地に戻すことはしない。UI では、`burgage` か `burgage-dense` と市壁を選ぶよう案内する。

目安（V1 で計測した。§12）: 3,000 人は 667 戸である。1 筆 1 戸・`lotOccupancy` 1 とする。2 本の街道が交わる村（腕 4 本、1 段目 8 列）と、街道 1 本が通り抜ける村（腕 2 本、4 列）は、3,000 人が上限の内に収まる。街道が村で終わる村（腕 1 本、2 列）は約 1,700 人（373 戸）で上限に当たり、未収容を報告する。

### 5.7 残りの土地

- 街区・道・小路・中心の予約地を「村の土地」とする。今の `landUse` の `town` には、円の代わりにこれを渡す。
- 村の土地の外は、今の `raiseVectorLandUse` で耕地・牧草地・森にする（V-R4）。
- 耕区（`furlongs`）の向きは、まず今のままにする。裏小路に直角に耕区を並べる処理（三富新田のように区画の奥から耕地が続く形）は V4 で判断する。
- `urban.ts` の `core`（半径の 0.65 倍の円）は、村の土地に含まれるかどうかに置き換える。tanners' row は、下流の川岸のうち 1 段目の街区の外を使う。

## 6. 保存形式

- `GenerationSettings.plotFabric` と `VectorUrbanSettings.plotFabric` に `burgage-village` を許す。検証（[validation/urban.ts](../../src/city-editor/generators/vector/validation/urban.ts)、[validation/fabric.ts](../../src/city-editor/generators/vector/validation/fabric.ts)、[share.ts](../../src/city-editor/services/io/vector/share.ts)）も同じく許す。
- fabric の街区記録に、次の 2 つを加える。どちらも、`burgage-village` 以外の街区では持たない。その街区のハッシュ（[hash.ts](../../src/city-editor/generators/vector/fabric/hash.ts)）は変わらない。
  - `villageTier: 1 | 2`: 1 段目か 2 段目か。
  - `frontPathId`: 正面の道（街道か裏小路）の ID。
- 既にある `growthStage` は使わない。成長型の生成（[ce-meshless-growth-generation.md](ce-meshless-growth-generation.md)）で段階を表すものとして残す。
- 採用した結果は保存し、読込と描画で計算し直さない（今の方針と同じ）。

## 7. 段階

| 段階 | 内容 | 完了条件 |
| --- | --- | --- |
| V0 | 村の toft の間口、南欧の村の区画、細長い広場の寸法を調べ、§2 と §4.2 を確定する | **完了（2026-11-22）**。§2.4、§11 |
| V1 | `village-toft` の型（§4.2）。純関数 `planRoadsideBlocks(roads, centre, need, profile, obstacles)` を作り、1 段目の街区・区画の分割・横の小路・裏小路・2 段目の街区を、§5.6 の順序で返す | 単体テスト: 直線と曲がる街道で、街区がすべて四角形であり、互いに重ならず、街道との距離が揃うこと。§5.6 の目安（交差点の村の 3,000 人が上限に収まり、腕 1 本の村は未収容を報告する）が成り立つこと。**完了（2026-11-22）**。§12 |
| V2 | `PlotFabric` の `burgage-village`・UI・多言語化・検証（V1 から移した。§12.1）。生成に接続する。円形の敷地を作らない流れ、大きさの見積もり（§5.6）、描画範囲、2 段目の街区、v66、保存と読込 | 200・500・1,000・2,000 人（川なし・川 1 本）で未収容 0。斜めに切られた区画が 0。ほかの Plot pattern の固定入力で、直列化した文書の SHA-256 が変わらない。**完了（2026-11-22）**。§13 |
| V3 | 村の中心（交差点の角、教会、広場、細長い広場）、施設（`placeFacilitiesOnPlots`）、tanners' row の判定の置き換え | 施設のある 1,000 人の村で、施設の 8 割以上が置ける。中心の角に三角の街区がない |
| V4 | 土地利用と耕区。村の土地の外を耕地にし、裏小路に接する耕区の向きを判断する | 村の土地と耕地の間に 400 m² を超える空き地が残らない |
| V5 | ブラウザで 2D・3D を確かめ、見た目の不自然さを直す | 画面での確認の記録を本書に書く |

## 8. 検証

固定入力は人口で指定する。

| 指標 | 目標 |
| --- | --- |
| 未収容の戸数 | 腕が 2 本以上の村で、3,000 人まで 0。腕 1 本の村は、上限に当たったときに理由 `village-capacity` を報告すること |
| 斜めに切られた区画（四隅の角が 90° ± 5° を外れる区画） | 0。曲がる街道の弦の継ぎ目は横の小路にするので、区画は斜めにならない |
| 1 つの街区の中の奥行きの差 | ±10% 以内 |
| 道へつながらない街区・行き止まりの裏小路 | 0 |
| 街区と水域・予約地・別の街区との重なり | 0 |
| 生成時間・文書の長さ | 同じ人口の `burgage`（壁なし）より長くならない |

テストは変更した範囲に関わるものだけを実行する（AGENTS.md）。多数のシードでの検証はしない。2 MB を超える出力は `docs/analytics/raw/` に置く。

## 9. 決めていないこと

1. FMG から開いた都市に `burgage-village` を出すか。出す場合、FMG の道路入口と固定交差を動かさずに街区を張り付ける方法は、成長型の生成の GM3 と合わせて決める。
2. §5.6 の費用の重みと基準、腕の長さの区切り（175 m・750 m）。V0・V1 で仮の値を決めた。V2 で町並みを見て調整する。特に、200 人の村でも腕 1 本では区画の半分以上が割られる（§12.2）のを、そのままにするか。
3. 3,000 人を超えたときに、未収容とするか、3 段目または平行な裏通り（村から町への成長）を作るか。
4. 成長型の生成（`growth`）が実装されたら、本書の 1 段目・2 段目をその成長の段階として扱うか。

## 10. 次に進める作業

V3 に進む。村の中心（交差点の角、教会、広場、細長い広場）を整え、施設のある村（`medieval-facilities`）で `placeFacilitiesOnPlots` が区画に施設を置けることを確かめる。`urban.ts` の `core`（円の 0.65 倍）を村の土地に置き換え、tanners' row の判定を直す。あわせて、§13.4 の「1 戸の家に 2〜3 世帯」をどう扱うかを決める。

## 11. V0 の記録（2026-11-22）

### 11.1 調べたこと

| 問い | 結果 | 本書への反映 |
| --- | --- | --- |
| 村の toft の間口 | 15〜50 m、多くは約 20 m（Historic England の 5 件）。18 ft perch（Sheppard） | §2.4: 3〜4 perch（16.5〜22.0 m） |
| 村の toft の奥行き | toft 35〜60 m、toft と croft で約 100 m | 変えない（50〜90 m） |
| 裏小路 | Uckerby で幅 4 m の道の跡、Kirby Knowle で裏小路、Durham の広場の村で外周の道 | §2.4: 3〜4 m。V-R3 の出典を足した |
| 村の通りと広場 | 通り 8〜15 m（Wolfhampcote）。street green・broad green の寸法（Thorpe 1949） | §2.4、§5.2 |
| 村の長さ | 最初の中心は道に沿って 200〜350 m（Passini） | §2.4、§5.6: 片側の腕 175 m までを最優先 |
| 南欧の村 | 区画は道に直角な帯、家は道の端（Passini）。寸法はない | §2.4、§4.2: 英国の村と同じ値 |
| 中欧の村 | Angerdorf の家は軒を広場に向け、厩と納屋は奥（Hochschule Neubrandenburg）。寸法はない | §4.2: 家の向き |

### 11.2 読めなかった史料

| 史料 | 理由 | 扱い |
| --- | --- | --- |
| Historic England の指定記念物の記述（5 件）、*Medieval Settlements* | サイトが自動の取得を拒んだ（HTTP 403） | 検索結果の要約の値を使い、「確認済み（要約）」とした。ブラウザで開いて本文を貼ってもらえれば、確かめ直せる |
| Appleton-le-Moors の Conservation Area Appraisal | 同じく HTTP 403 | 同上 |
| Wharram Percy の調査報告（A. Oswald、ADS の SNY9458） | PDF が 10 MB を超えて取得できない、または文字を取り出せなかった（この環境に PDF の文字を取り出す道具がない） | 使わない |
| Sheppard 1974、Roberts 1972・1977、Thorpe 1949 の原典 | 本文が手に入らない | Sheppard は抄録、Thorpe は村の団体の紹介で代えた |

### 11.3 採用値が史料から外れるところ

§2.4 の「史料から外した理由」の列にまとめた。ゲーム側の調整は、区画を割る時期と下限、2 段目の奥行き、横の小路、伸ばす順序の重み（§5.6）、腕の長さの上限 750 m である。

## 12. V1 の記録（2026-11-22）

### 12.1 作ったもの

| ファイル | 内容 |
| --- | --- |
| [profiles.ts](../../src/city-editor/generators/burgage/profiles.ts) | `VILLAGE_PERCH_METERS`（5.4864 m）、`VillageToftProfile`、`VILLAGE_TOFT_PROFILE`（§2.4 の採用値と出典、§5.6 の費用） |
| [types/contracts/burgage.ts](../../src/city-editor/types/contracts/burgage.ts) | `RoadsideArm`、`RoadsideBlock`、`RoadsideLane`、`RoadsideVillagePlan` |
| [roadsideBlocks.ts](../../src/city-editor/generators/burgage/roadsideBlocks.ts) | 純関数 `planRoadsideBlocks({ seed, arms, plotsNeeded, obstacles })` |
| [roadsideBlocks.test.ts](../../src/city-editor/generators/burgage/roadsideBlocks.test.ts) | 単体テスト 4 件 |

`planRoadsideBlocks` の処理:

1. 腕ごとに道の線を均し（`simplifyPolyline`、許容 8 m）、頂点で弦に分ける。腕は 750 m で切る。
2. 1 段目: 腕の片側ごとに、弦に沿って四角形の街区を置く。片側の候補のうち中心に最も近いものから、腕と側をまたいで順に置く（交差点の角は先に置いた街区のものになる）。街区は、前の横の小路と後ろの裏小路を含めた四角形が、ほかの街区・道の帯（全ての腕の、実際の道の線から道幅の半分）・障害物に重ならない位置に置く。重なるときは、奥行きを 10% まで浅くし、それでも重なれば 4 m ずつ外へずらす。道の線が弦から外へずれる分だけ、正面を下げる。
3. 2 段目: 1 段目の各街区の裏小路の外側に、同じ範囲で置く（奥行き 30〜50 m、重なれば浅くする）。
4. 区画: 1 段目は 3・3½・4 perch、2 段目は 8.2〜11 m の間口を、街区の長さに合うよう伸び縮みさせて並べる（`fillLength`）。
5. 置ける区画をすべて作った後、§5.6 の費用の順に必要な数だけ取る。区画は街区の中心側から順に取り、2 段目は 1 段目が取られた範囲にだけ置く。
6. 取られた区画だけで街区を切り詰め、横の小路（各 1 段目の街区の前）と裏小路（同じ弦で並ぶ街区の裏をつなぐ）を返す。

V0 の設計からの変更:

- **設定・UI・検証は V2 に回した**: `PlotFabric` に値を加えて UI に出すと、生成がまだ対応していないまま、その値で文書が保存される。V2 で生成と版（v66）がそろってから、同じ版で出したい。
- **費用に基準を加えた**: §5.6 の 3。重みだけでは、中心の近くの区画の分割（費用 = 2 × 距離）が、少し外の区画（費用 = 1 × 距離）より先に取られ、24 筆の村でも区画が割られた。
- **腕の本数で数える**: V0 の目安は「街道 1 本の村は 3,000 人に届かない」としていた。街道が村を通り抜ければ腕は 2 本・1 段目は 4 列で、3,000 人が収まった。上限に当たるのは、街道が村で終わる腕 1 本の村である。

### 12.2 計測

直線の街道（腕の長さ 800 m）、シード `stats`、1 筆 1 戸。「街区」は 1 段目／2 段目の数。「奥」は、街区の角の中心からの最も遠い座標（腕の長さに奥行きが加わる）。

| 腕 | 人口 | 必要 | 置いた | 未収容 | 街区 | 割った区画 | 奥（m） | 時間（ms） |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 本 | 200 | 45 | 45 | 0 | 7／2 | 26 | 253 | 6 |
| 1 本 | 1,000 | 223 | 223 | 0 | 17／8 | 126 | 750 | 3 |
| 1 本 | 2,000 | 445 | 373 | 72 | 17／17 | 220 | 750 | 3 |
| 2 本 | 200 | 45 | 45 | 0 | 9／0 | 18 | 185 | 8 |
| 2 本 | 1,000 | 223 | 223 | 0 | 22／9 | 122 | 478 | 7 |
| 2 本 | 3,000 | 667 | 667 | 0 | 34／32 | 398 | 750 | 7 |
| 4 本 | 200 | 45 | 45 | 0 | 12／0 | 0 | 158 | 26 |
| 4 本 | 1,000 | 223 | 223 | 0 | 36／4 | 142 | 402 | 25 |
| 4 本 | 3,000 | 667 | 667 | 0 | 66／19 | 412 | 750 | 26 |

- 腕 4 本の 200 人の村は、腕の 175 m までに収まり、区画は割られない。腕が少ないほど、早く分割と 2 段目に進む。
- 腕 1 本・2 本の 200 人の村でも、区画の半分ほどが割られる。腕の 175 m を超える延長（費用 1.5 × 距離 ≥ 262）より、中心の近くの分割（費用 175 ＋ 2 × 距離）が先になるためである。V2 で町並みを見て、基準の値を決め直す（§9 の 2）。

### 12.3 テスト

`npx vitest run src/city-editor/generators/burgage`: 16 件成功（新しい 4 件を含む）。`npx tsc --noEmit` は誤りなし。

- 通り抜ける街道で、24 筆の村: 街区と区画がすべて直角の四角形、割られていない、腕の 175 m の内、道と街区・街区どうしが重ならない、全ての街区に前の横の小路と裏の裏小路がある、同じ入力で同じ結果。
- 120° 曲がる街道: 街区が直角の四角形で、道とも互いにも重ならない。
- 川（障害物）を横切る街道: 街区が川に入らない。
- 交差点の 3,000 人: 未収容 0、2 段目と割った区画がある、間口が 5 m 以上。腕 1 本の 3,000 人: 未収容を `village-capacity` で報告する。

## 13. V2 の記録（2026-11-22）

### 13.1 作ったもの

| ファイル | 内容 |
| --- | --- |
| [types/contracts/burgage.ts](../../src/city-editor/types/contracts/burgage.ts)、[types/vector/urban.ts](../../src/city-editor/types/vector/urban.ts) | `PlotFabric` に `burgage-village`、版に `vector-urban-v66` |
| [urbanState.ts](../../src/city-editor/generators/vector/generation/urbanState.ts)、[validation/urban.ts](../../src/city-editor/generators/vector/validation/urban.ts)、[validation/fabric.ts](../../src/city-editor/generators/vector/validation/fabric.ts)、[share.ts](../../src/city-editor/services/io/vector/share.ts) | `burgage-village` は v66。検証と共有リンクが値と版を受け付ける |
| [VectorGenerationPanel.ts](../../src/city-editor/components/vector/VectorGenerationPanel.ts)、[editors.en.json](../../src/i18n/locales/editors.en.json)、[editors.ja.json](../../src/i18n/locales/editors.ja.json) | Plot pattern の選択肢「Roadside village (burgage tofts, unwalled)」「街道沿いの村（短冊形の屋敷地、市壁なし）」。選ぶと、Generate city は壁の選択によらず壁なしで生成する |
| [wallShape.ts](../../src/city-editor/generators/vector/generation/wallShape.ts) | `vectorWallChoice` は `burgage-village` のとき `wall: "none"` を返す |
| [editorInput.ts](../../src/city-editor/generators/vector/generation/editorInput.ts) | FMG と連携しない村では、描画範囲を `villageHalfExtentMeters`（街道の届く長さ＋奥行き＋畑の余白）の 2 倍に広げ、円形の敷地は村の中心（教会・広場）が入る大きさ（半径 40 m 以上）にする。稜堡の要塞は作らない |
| [villagePlan.ts](../../src/city-editor/generators/vector/generation/villagePlan.ts) | `villageArms`（幅 4 m 以上の道を、中心に最も近い交点から各行き止まりまで最短でたどった腕）、`planVillagePerimeter`（`planRoadsideBlocks` の結果を CE の district・cell・区画・家にする）、`villageHalfExtentMeters` |
| [urban.ts](../../src/city-editor/generators/vector/generation/urban.ts) | `burgage-village` では、円形の敷地を道で切った街区を使わず、`planVillagePerimeter` の結果を `joinPerimeterPlan` に渡す。敷地の拡大（最大 1.4 倍）はしない。土地利用には村の district の外形を町の土地として渡す。施設の要求は区画単位（`plots: true`） |
| [roadsideBlocks.ts](../../src/city-editor/generators/burgage/roadsideBlocks.ts) | 必要数を戸数で数える（`need`、`dwellingsOf`）。戸数が増えない分割は取らない。描画範囲の内に収める（`halfExtentMeters`）。障害物は外接矩形で先に絞る。横の小路は道の中心線から始める（道とつながる）。裏小路は街区ごとに 1 本（隣の街区の裏小路と端で接する） |

CE の fabric への写し方:

- 1 段目の街区 1 つを 1 つの district にする。district の外形は、街区・横の小路・裏小路・後ろの 2 段目の街区を包む凸多角形である。district の街路（`streets`）は、その街区の横の小路と裏小路である。横の小路の道側の端は、`joinPerimeterPlan` が道との接続（mouth）にする。
- cell は 1 段目と 2 段目の街区で、区画（`plots`）を持つ。cell の小路はない。
- 家（V-R9）: 間口 12 m 以上の割っていない区画には、通りに沿った長い家（長さ 10〜16 m、奥行き 5.5〜7 m）を、片側に 3 m の通路を空けて建てる。割った区画には、間口いっぱいに奥行き 8〜12 m の家を建てる。家の建て方（どの家から建てるか、何戸入るか）は今の `placeVectorPerimeterHouses` に任せる。
- 1 区画の戸数の見込みは、家の平均の床面積と `expectedVectorHouseStoreys` から `perimeterHouseDwellings` で出す。家の大きさと階数のばらつきに備え、必要戸数の 1.08 倍を区画にする（`VILLAGE_NEED_MARGIN`）。

### 13.2 計測

FMG と連携しない合成入力、シード `probe`（500 人は `roadside-village`）、`medieval`、`lotOccupancy` 1、Walls はオンのまま（生成は壁なし）。「川」は合成入力の既定の川 1 本。時間は入力・骨格・市街地の合計。

| 人口 | 川 | 時間（ms） | 必要戸数 | 未収容 | 街区（うち 2 段目） | 区画 | 家 | 1 戸の世帯（平均） | 描画範囲（m） | 文書（KB） |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 200 | なし | 199 | 45 | 0 | 8（0） | 25 | 21 | 2.24 | 804 | 529 |
| 200 | あり | 200 | 45 | 0 | 8（0） | 25 | 23 | 1.96 | 804 | 562 |
| 500 | なし | 255 | 112 | 0 | 15（0） | 55 | 41 | 2.73 | 1,019 | 786 |
| 500 | あり | 259 | 112 | 0 | 13（0） | 56 | 47 | 2.43 | 1,019 | 731 |
| 1,000 | なし | 221 | 223 | 0 | 20（1） | 97 | 82 | 2.74 | 1,374 | 1,219 |
| 1,000 | あり | 313 | 223 | 0 | 20（1） | 103 | 93 | 2.40 | 1,374 | 1,159 |
| 2,000 | なし | 359 | 445 | 0 | 33（5） | 179 | 169 | 2.63 | 1,920 | 1,851 |
| 2,000 | あり | 426 | 445 | 0 | 33（2） | 191 | 174 | 2.56 | 1,920 | 1,638 |

- どの人口でも未収容 0、壁 0。区画と街区はすべて直角の四角形だった（テストで確かめた）。
- 1,000 人・川ありの村は、4 本の街道に沿って両側に街区が並び、川の向こう側の腕にも街区が続いた。教会・広場のある中心の周りは空いたまま残る。

### 13.3 ほかの Plot pattern が変わらないこと

`compact`・`compact-medium`・`burgage`・`burgage-dense` の 4 つについて、壁のあり・なしと施設のあり・なしの 16 通り（1,500 人、シード `hash-probe`）の文書を作った。変更前（`git stash`）と変更後で、直列化した文書の SHA-256 は 16 件とも一致した。

### 13.4 見つかったこと・残したこと

- **1 戸の家に 2〜3 世帯**: CE の戸数の式（床面積 × 階数）では、長さ 13 m・奥行き 6 m・2 階余りの長い家に 2〜3 戸が入る。このため、200 人（45 戸）の村でも家は 21〜23 軒にとどまる。史料の村では、屋敷地 1 つに 1 世帯（4〜5 人）が普通である。村の家を 1 世帯にする（1 階にする、または村では戸数を 1 に固定する）かは V3 で決める。
- **壁の設定の入力**: §4.3 では、`burgage-village` を選ぶと Walls などの入力を無効にするとしていた。V2 では生成が壁の設定を無視するだけで、市の設定パネルの入力はそのままである。V5 で画面とあわせて直す。
- **合成入力のうち、海岸・曲がる川（native でない入力）**: 描画範囲は広げるが、敷地は `synthSite` の円のままで、村の中心だけの小さな敷地にはならない。区画は街道に沿って作られるが、確かめていない。
- **画面での確認**: 生成の関数（`vectorInputFromEditor` → `generateVectorSkeleton` → `generateVectorUrban`）は Generate city と同じものをテストと計測で通した。CE の画面での描画（2D・3D）は V5 で確かめる。

### 13.5 テスト

- `npx vitest run src/city-editor/generators/burgage src/city-editor/generators/vector/generation/{villagePlan,burgagePlots,wallShape,urban,perimeter}.test.ts src/city-editor/services/io/vector`: 55 件成功。
- `npx vitest run src/city-editor/components/vector/VectorGenerationPanel.test.ts src/city-editor/generators/vector/validation`: 37 件成功。
- `npx tsc --noEmit`: 誤りなし。
- 新しいテスト [villagePlan.test.ts](../../src/city-editor/generators/vector/generation/villagePlan.test.ts) 2 件: 1,000 人・川ありの村が v66・壁なし・未収容 0 で、円形の敷地の 2 倍より遠くまで街区が並び、cell と区画がすべて直角の四角形、家はどれも区画の中、全 district の小路が道につながり、保存して読み直しても fabric が同じ。200 人の村は 2 段目を作らず、街区が描画範囲の内に収まる。

