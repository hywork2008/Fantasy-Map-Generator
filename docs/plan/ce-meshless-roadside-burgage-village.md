# CE meshless 市壁のない短冊形区画の村 — 街道に張り付く街区と裏小路

作成: 2026-11-22
更新: 2026-11-22（V0: 村の区画の間口・奥行き、裏小路、村の通りと広場、南欧の村の史料を調べ、§2.4 に採用値を確定した。§4.2・§5 をそれに合わせて改めた。V1: 区画の型 `village-toft` と純関数 `planRoadsideBlocks` を作った。§5.6 の費用を「重み × 距離 ＋ 基準」に改め、設定・UI・検証は V2 に回した（§12）。V2: `burgage-village` を生成に接続し、v66 とした（§13））
状態: V0〜V5 完了。2026-11-22 に村の家と人口の上限を見直し（§14）、V3 以降の段階を組み直した。次は V6。
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
- 人口は 50〜1,000 人に限る（§14.3。2026-11-22 に 3,000 人から改めた）。家は 1 階建てで 1 軒に 1 世帯とする（§14.2）。1,000 人を超える集落は村ではなく町として、`burgage`・`burgage-dense` で作る。
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
| V3 | 村の家（§14.2）: 1 階建て・1 軒 1 世帯、屋敷地の型ごとの家（長い家・小屋）と離れの納屋。人口の上限（§14.3）: 生成の検証、UI、未収容の理由。戸数の見込みを 1 軒 1 世帯に改める | 50・200・500・1,000 人で未収容 0、家はすべて 1 階・1 世帯。1,001 人以上は生成せず理由を返す。ほかの Plot pattern の出力が変わらない。**完了（2026-11-22）**。§15 |
| V4 | MV に村の家のモデルを作る（§14.4）: 長い家（住まいと牛舎）、小屋、納屋。地域の型ごとの壁と屋根。CE の 3D で村の家をそのモデルで描く | MV で一覧に出て、寸法が §14.2 の範囲にある。CE の 3D で村の家が 1 階・草葺き（地域による）で、区画の通り側に建つ。**完了（2026-11-22）**。§16 |
| V5 | 村の中心（交差点の角、教会、広場、細長い広場）、施設（`placeFacilitiesOnPlots`）、tanners' row の判定の置き換え（旧 V3） | 施設のある 1,000 人の村で、施設の 8 割以上が置ける。中心の角に三角の街区がない。**完了（2026-11-22）**。§17 |
| V6 | 土地利用と耕区。村の土地の外を耕地にし、裏小路に接する耕区の向きを判断する（旧 V4） | 村の土地と耕地の間に 400 m² を超える空き地が残らない |
| V7 | ブラウザで 2D・3D を確かめ、見た目の不自然さを直す。市の設定パネルの Walls などの入力を、村では無効にする（旧 V5） | 画面での確認の記録を本書に書く |

## 8. 検証

固定入力は人口で指定する。

| 指標 | 目標 |
| --- | --- |
| 未収容の戸数 | 1,000 人まで 0（§14.3。2026-11-22 に 3,000 人から改めた）。1,000 人を超える人口は生成せず、理由 `village-population` を返すこと |
| 斜めに切られた区画（四隅の角が 90° ± 5° を外れる区画） | 0。曲がる街道の弦の継ぎ目は横の小路にするので、区画は斜めにならない |
| 1 つの街区の中の奥行きの差 | ±10% 以内 |
| 道へつながらない街区・行き止まりの裏小路 | 0 |
| 街区と水域・予約地・別の街区との重なり | 0 |
| 生成時間・文書の長さ | 同じ人口の `burgage`（壁なし）より長くならない |

テストは変更した範囲に関わるものだけを実行する（AGENTS.md）。多数のシードでの検証はしない。2 MB を超える出力は `docs/analytics/raw/` に置く。

## 9. 決めていないこと

1. FMG から開いた都市に `burgage-village` を出すか。出す場合、FMG の道路入口と固定交差を動かさずに街区を張り付ける方法は、成長型の生成の GM3 と合わせて決める。
2. §5.6 の費用の重みと基準、腕の長さの区切り（175 m・750 m）。V0・V1 で仮の値を決めた。V2 で町並みを見て調整する。特に、200 人の村でも腕 1 本では区画の半分以上が割られる（§12.2）のを、そのままにするか。
3. ~~3,000 人を超えたときの扱い~~ → 1,000 人を上限とし、超える集落は町として作る（§14.3）。村から町への成長（同じ集落が人口とともに村の形から町の形へ変わる）は、成長型の生成（[ce-meshless-growth-generation.md](ce-meshless-growth-generation.md)）で扱う。
4. 成長型の生成（`growth`）が実装されたら、本書の 1 段目・2 段目をその成長の段階として扱うか。
5. 2 本以上の道が集まる中心の広い広場（broad green）を作るか（§17.2）。
6. 村の施設（工房・店）を、2 階建ての町家のモデルではなく、村の家のモデルで描くか（§17.4）。

## 10. 次に進める作業

V6 に進む。村の外の土地利用と耕区を整える。V5 の画面の確認では、村の中心の周りと川沿いに、畑にも村にもならない土地（地図の地の色）が広く残った（§17.4）。その原因を調べ、村の土地の外を耕地・牧草地にし、裏小路に接する耕区の向きを判断する。

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

## 14. 村の家と人口の上限の見直し（2026-11-22）

### 14.1 きっかけ

V2 の村は、CE の戸数の式（床面積 × 階数）で 2 階余りの家に 2〜3 世帯を入れていた（§13.4）。ユーザーが想定する村は、参考画像（`temp/1118-ce-workhome/` の 3 枚: 中世の村の説明図、Manor Lords、Banished）のような、**1 階建ての草葺きの家が屋敷地ごとに建ち、裏に柵で囲んだ菜園や畑が続く村**である。また、1 階建てのまま数千〜数万人の都市を作ると土地が際限なく要る。そのような都市は無く、町は建物の階数が上がり、裏庭や畑のない密集した町並みになる。

このため、"medieval village"・"peasant house" などの語で史料を調べ直し、村の家の形と、村として作る人口の上限を決める。

参考画像から読み取れること（史料ではない。形の目標として使う）:

- 家は 1 階建てで、壁が低く、屋根（草葺き）が大きい。
- 家は 1 軒ずつ離れて建ち、屋敷地ごとに柵・生垣で囲まれる。家の後ろに菜園・小屋・畑がある。
- 家は通りに妻（切妻の三角の側）を向けるもの（Manor Lords）と、軒を向けるもの（説明図）がある。
- 教会・領主の館・水車・鍛冶屋などが、家の並びとは別に建つ。

### 14.2 村の家（史料）

本書のほかの節と同じく、本文を読んだものを「確認済み」、検索結果の要約だけで見たものを「確認済み（要約）」とする。

| 史料 | 内容 | 状態 |
| --- | --- | --- |
| Weald & Downland Living Museum, "Hangleton cottage"（[Web](https://www.wealddown.co.uk/?p=16403)） | Sussex の廃村 Hangleton（13〜14 世紀）。長い家（longhouse）2 棟は約 40 × 20 ft（約 12 × 6 m）で、中を 3 部屋に分ける。ほかの建物はどれも長さ 30 ft（約 9 m）未満で、2 部屋か 1 部屋。屋根は軒より上が分からず、復元は麦わら葺きだが、板葺き・芝・ほかの葺き方もありうる。村の典型は、通りの両側に屋敷地（toft）が並ぶ形で、屋敷地には住まい・家畜の小屋・納屋や穀倉が別に建つ。14 世紀初めの人口は約 200 人、1 世帯は約 5 人、1 世帯の耕地は約 11〜12 エーカー | 確認済み |
| Herefordshire Through Time, "How were village houses constructed?"（[Web](https://htt.herefordshire.gov.uk/herefordshires-past/the-medieval-period/villages/how-were-village-houses-constructed/)） | 13 世紀より前の村の小屋（cot）は 1 部屋で約 5 × 3.5 m。隷農（villein）は 3 部屋の家に住むことが多く、長い家の形で、一方の端に住まい 2 部屋、他方に家畜と農具の部屋がある。13 世紀以後、豊かな者は家畜の建物を別に建て、長い家に直角に置くことが多い。壁は木の骨組みに編み枝と土（wattle and daub）、屋根は麦わら葺きが好まれた。煙突はまれで、煙出しの穴があった。床は土 | 確認済み |
| Wikipedia, "Peasant homes in medieval England"（[Web](https://en.wikipedia.org/wiki/Peasant_homes_in_medieval_England)） | 南イングランドの家は、吹き抜けの広間（open hall）で、煙突も上の階も無く、中央の炉の煤が残る。ミッドランドの家は、対の曲がった柱（cruck blade）で屋根と壁を支える cruck の家が多い | 確認済み |
| English Heritage, "Hound Tor Deserted Medieval Village"（[Web](https://www.english-heritage.org.uk/visit/places/hound-tor-deserted-medieval-village/history)） | Dartmoor の廃村（13 世紀）。4 つの農家にそれぞれ長い家があり、最大は長さ約 19 m。石造で、壁の高さは約 2 m、草葺きの屋根を木の梁で支えた | 確認済み（要約） |
| Buckinghamshire の Steeple Claydon の家（ADS の調査報告。検索結果の要約） | 草葺きの家が通りと平行に建つ（長い側を通りに向ける）例 | 確認済み（要約） |
| Hochschule Neubrandenburg, "Siedlungsgrundrisse"（§2.1） | Angerdorf の家は軒を広場に向け、厩と納屋は敷地の奥 | 確認済み |
| ドイツ南西部のWüstung（Ulm-Eggingen）の発掘（Heidelberg の公開論文。検索結果の要約） | 木造の 3 廊の大きな家（Hallenhaus）が約 20 × 12 m。中欧の農家は住まいと家畜小屋を 1 棟にした Wohnstallhaus が多い | 確認済み（要約） |
| J.G. Hurst による Wharram Percy の家の調査の紹介（[medievalists.net](https://www.medievalists.net/2008/10/the-medieval-peasant-house/)） | 1200〜1500 年の農民の家 9 棟が重なって見つかった。13 世紀には石造、14 世紀には低い石の土台の上の木骨造。家はほぼ一世代ごとに建て直された | 確認済み |

取り決め:

- **V-R12 1 階建て**: 中世の村の家は 1 階建てである。吹き抜けの広間で、上の階は無い（Wikipedia、Herefordshire）。壁は低く（約 2 m、Hound Tor）、屋根は草葺きが普通である。
- **V-R13 1 軒 1 世帯**: 屋敷地 1 つに 1 世帯（約 5 人）が住む（Hangleton）。1 世帯の人数は 4.7〜5.8 人の推計がある（§14.3）。CE の 1 戸 4.5 人（`URBAN_DWELLING_SIZE`）は変えず、1 軒を 1 戸とする。
- **V-R14 家の型**:

  | 型 | 寸法 | 史料 | 置く区画 |
  | --- | --- | --- | --- |
  | 長い家（住まい＋家畜） | 長さ 12〜19 m、幅 5〜6 m | Hangleton 12 × 6 m、Hound Tor 最大 19 m、Herefordshire の隷農の家 | 割っていない屋敷地（間口 16.5 m 以上） |
  | 小屋（1〜2 部屋） | 長さ 5〜9 m、幅 3.5〜5 m | Herefordshire 5 × 3.5 m、Hangleton 9 m 未満 | 割った区画、2 段目の区画 |
  | 離れの納屋・家畜小屋 | 長さ 6〜10 m、幅 4〜5 m（寸法は史料にない。ゲーム側の調整） | Hangleton（住まい・家畜小屋・納屋を別に建てる）、Herefordshire（長い家に直角に置く） | 割っていない屋敷地の中庭。家が長い家でないとき |

- **V-R15 家の向き**: 長い側を通りに向ける例（Steeple Claydon、Angerdorf）が史料にあり、これを既定にする。妻を通りに向ける家は参考画像（Manor Lords）にあるが史料では確かめていないので、選択肢として後で加える。

### 14.3 人口の上限

| 史料 | 内容 | 状態 |
| --- | --- | --- |
| Hangleton（§14.2） | 14 世紀初めの村が約 200 人、1428 年には 2 世帯 | 確認済み |
| C. Dyer による Caldecote（Hertfordshire）の発掘の書評（*Medieval Settlement Research* 24、[ADS](https://archaeologydataservice.ac.uk/catalogue/adsdata/arch-1164-1/dissemination/pdf/MSRG_Vol_24/01-05_Dyer.pdf)） | Domesday で 13 人の借地人と司祭、1321 年に約 16 の借地人。家のある囲い地は 13 世紀末に約 15 | 確認済み（要約） |
| 1300 年頃の世帯の大きさ（*Social Science History* の論文、[Cambridge](https://www.cambridge.org/core/journals/social-science-history/article/english-familial-demography-c-1300-a-reconstruction/42D2F954F759E4BD06CF2354FED6B5A1)。Hallam の推計） | 平均 5.8 人。Hallam は 4.7 人と仮定した | 確認済み（要約） |
| A. Dyer による 1377 年の地方都市の推計（[History Today](https://www.historytoday.com/archive/how-urban-was-medieval-england) などの紹介） | 地方の大きい町 57 のうち、550 人が 1、1,000〜2,000 人が 25、2,000〜5,000 人が 21 | 確認済み（要約） |
| Loughborough の小都市の研究（*Urban History*、[Cambridge](https://www.cambridge.org/core/journals/urban-history/article/an-english-small-town-in-the-later-middle-ages-loughborough/6219ADA7EC5D39568AE15E275231CA90)） | 都市の人口の絶対的な下限は決められない（市場や交易の働きで決まる） | 確認済み（要約） |

- 村はおおむね十数〜数十世帯（数十〜 300 人）である。1,000〜2,000 人は、すでに小さな町（市場町）の大きさである。町と村の境は人口だけでは決まらないが、1,000 人を超える集落を、1 階建て・裏庭付きの村の形で作る理由は無い。
- **上限**: `burgage-village` は 1,000 人までとする（約 223 戸）。推奨は 500 人まで。1,000 人を超える人口では生成せず、理由 `village-population` を返す。UI は Plot pattern の選択肢に人口の範囲を書き、超えたときは `burgage`（壁なしの小さな町）か `burgage-dense`（市壁のある町）を案内する。
- **1,000 人の村が収まること**: 1 軒 1 世帯で 223 戸、余裕を見て約 241 区画になる。V1 の計測（§12.2）では、腕 1 本の村でも 223 区画が上限の 750 m 以内に収まったので、どの形の村でも収まる見込みである。V3 で計測して確かめる。
- **ほかの Plot pattern**: 町の家の階数は、今の階数の決め方（時代・高さの方針。`expectedVectorHouseStoreys`）に任せ、本書では変えない。人口が多いほど建て詰まる町は `burgage-dense` が受け持つ。

### 14.4 MV のモデル

今の MV には、村の家として使えるモデルが少ない。`stone-cottage`（1 階の石の小屋、草葺き、6.5 × 5 m）はあるが、長い家・木骨と土壁の小屋・離れの納屋は無い。CE の家は `RegionalHouseSpec`（[regionalHouses.ts](../../src/buildings/houses/regionalHouses.ts)）で、地域の型ごとの外観・階数・屋根の葺き方・入口の面（`entranceFace`）を持つ。

V4 で次を作る（MV の新しい task。番号は作るときに決める）:

| モデル | 中身 | 地域の型ごとの違い |
| --- | --- | --- |
| 長い家（`village-longhouse`） | 1 階、壁の高さ約 2 m、中央の通り抜けの土間（cross-passage）で住まいと家畜の部屋に分ける。家畜側の端に大きな扉。煙突なし、屋根に煙出し | `atlantic`: 木骨と土壁・草葺き。`stone-upland`: 石積み・草葺き（Hound Tor）。`northern-wooded`: 丸太・板・こけら葺き。`northern-urban`: 木骨の Wohnstallhaus・草葺き。`mediterranean`: 石積み・瓦（寸法の史料なし） |
| 小屋（`village-cottage`） | 1 階、1〜2 部屋、5〜9 × 3.5〜5 m | 同上 |
| 離れの納屋（`village-barn`） | 1 階、大きな両開きの扉、6〜10 × 4〜5 m | 同上 |

CE の 3D では、村の家の外形（区画の通り側に建てた長方形）に合わせてこれらのモデルを描く。MV のモデルを作る前に、モデルの作り手（Codex か Opus か）と、既存の `RegionalHouseSpec` に 1 階・草葺きの型を足すだけで足りるかを、V4 の始めに決める。

## 15. V3 の記録（2026-11-22）

### 15.1 作ったもの

| ファイル | 内容 |
| --- | --- |
| [villagePlan.ts](../../src/city-editor/generators/vector/generation/villagePlan.ts) | `villageFarmstead`: 屋敷地ごとの建物（§14.2）。間口 15 m 以上の屋敷地は、65% が長い家（12〜19 × 5〜6 m、片側に 3 m の通路）、35% が小屋（5〜9 × 3.5〜5 m）と離れの納屋（6〜10 × 4〜5 m、小屋と反対の側に、通りに妻を向けて直角に置く）。間口 15 m 未満の区画（割った区画、2 段目）は小屋。どれも長い側を通りに向け、通りから 0.5〜2.5 m 下げる。`VILLAGE_MAX_POPULATION`（1,000）。区画の必要数は 1 区画 1 戸で数え、余裕を 1.05 倍に下げた |
| [perimeter.ts](../../src/city-editor/generators/vector/generation/perimeter.ts) | `VectorPerimeterPlan` に `village`（1 階・1 軒 1 戸）と、家の `farmstead`（同じ屋敷地の建物の印）・`outbuilding`（離れ）を加えた。`placeVectorPerimeterHouses` の採用の処理を `adoptHouse` にまとめ、離れは、同じ屋敷地の家が建ったときだけ、戸数 0・1 階で後から建てる。`village` も離れも無い計画では、処理は前と同じ |
| [urban.ts](../../src/city-editor/generators/vector/generation/urban.ts) | 村の計画に `village: true` を付ける。`burgage-village` で 1,000 人を超えると `urban-village-population` で止める |
| [editorInput.ts](../../src/city-editor/generators/vector/generation/editorInput.ts) | 村の敷地を、家の土地を見積もる 1 回目の組み立てなしに、中心の施設の半径から直接決める（§15.3） |
| [VectorGenerationPanel.ts](../../src/city-editor/components/vector/VectorGenerationPanel.ts)、[editors.en.json](../../src/i18n/locales/editors.en.json)、[editors.ja.json](../../src/i18n/locales/editors.ja.json) | Generate city は、村で 1,000 人を超えると生成の前に止め、町の Plot pattern を案内する。選択肢の名前に「1,000 人まで」「1 階建て」を入れた |

### 15.2 計測

合成入力、シード `roadside-village`、`medieval`、`lotOccupancy` 1。「家」は戸数 1 の建物、「納屋」は戸数 0 の離れ、「長い家」は長い辺が 12 m 以上の家。「奥」は中心から街区の角までの最大の距離。

| 人口 | 川 | 時間（ms） | 必要戸数 | 未収容 | 街区（うち 2 段目） | 区画 | 家 | 納屋 | 長い家 | 奥（m） | 描画範囲（m） | 文書（KB） |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 50 | なし | 174 | 12 | 0 | 6（0） | 13 | 12 | 3 | 8 | 128 | 800 | 466 |
| 50 | あり | 218 | 12 | 0 | 6（0） | 13 | 12 | 1 | 9 | 135 | 800 | 423 |
| 200 | なし | 102 | 45 | 0 | 14（0） | 48 | 45 | 15 | 21 | 197 | 804 | 488 |
| 200 | あり | 196 | 45 | 0 | 12（0） | 48 | 45 | 12 | 23 | 220 | 804 | 459 |
| 500 | なし | 144 | 112 | 0 | 22（0） | 118 | 112 | 21 | 35 | 294 | 1,019 | 832 |
| 500 | あり | 230 | 112 | 0 | 20（0） | 118 | 112 | 15 | 28 | 347 | 1,019 | 799 |
| 1,000 | なし | 237 | 223 | 0 | 36（3） | 235 | 223 | 24 | 36 | 438 | 1,374 | 1,480 |
| 1,000 | あり | 312 | 223 | 0 | 35（5） | 235 | 223 | 19 | 29 | 516 | 1,374 | 1,316 |

- どの人口でも未収容 0。家はすべて 1 階・1 戸で、家の数は必要戸数と同じになった。
- 1,000 人の村も、中心から約 0.5 km の内に収まった（§14.3 の見込みのとおり）。
- 人口が増えるほど長い家の割合が下がる（200 人で約半分、1,000 人で 1〜2 割）。§5.6 の費用では、腕の 175 m を超えた後は、腕を伸ばすより中心の近くの屋敷地を割る方が先になり、割った区画には小屋が建つためである。小屋住み（cottar）の多い大きな村と見ることもできるが、長い家を多く残したいなら、分割の基準（175）を上げる。§9 の 2 として残す。

### 15.3 見つかったこと

- **小さな敷地と川**: 合成入力で川があり人口が少ない（`burgage` で 50〜60 人、`compact` で 50〜100 人）と、`vectorInputFromEditor` の 1 回目の組み立て（家の土地だけで決めた小さい円の敷地）で、川の面が作れず `width-fold` で止まる。村では 1 回目の組み立てをやめたので起きない（4 シード × 50〜1,000 人で確かめた）。`burgage`・`compact` では今も起きるが、本書の範囲の外なので直していない。
- **離れの描画**: 離れは fabric の家として、戸数 0・1 階で保存される。2D・3D では、まだ家と同じ見た目で描かれる。V4 でモデルを分ける。
- **画面での確認**: ブラウザで町並みを画像にして確かめることは、この作業ではできなかった（一時的なローカルの配信が許可されなかった）。数値とテストで確かめた。V7 でまとめて確かめる。

### 15.4 ほかの Plot pattern が変わらないこと

§13.3 と同じ 16 通り（`compact`・`compact-medium`・`burgage`・`burgage-dense`、壁のあり・なし、施設のあり・なし、1,500 人）で、V3 の変更の前後の直列化した文書の SHA-256 は 16 件とも一致した。`placeVectorPerimeterHouses` の書き直しで、ほかの町の家の建て方は変わっていない。

### 15.5 テスト

- `npx vitest run src/city-editor/generators/burgage src/city-editor/generators/vector/generation/{villagePlan,burgagePlots,perimeter,urban}.test.ts src/city-editor/components/vector/VectorGenerationPanel.test.ts src/city-editor/generators/vector/validation`: 79 件成功。
- `npx tsc --noEmit`: 誤りなし。
- [villagePlan.test.ts](../../src/city-editor/generators/vector/generation/villagePlan.test.ts) に加えたこと: 1,000 人の村で、家がすべて 1 階、戸数は 0 か 1、戸数 1 の家の数が必要戸数と同じ、離れがある。1,001 人の村は `urban-village-population` で止まる。

## 16. V4 の記録（2026-11-22）

### 16.1 決めたこと

- **作り手**: ユーザーの指示で Claude Opus 5.5 とした（`author: "Claude Opus 5.5"`）。
- **既存の `RegionalHouseSpec` に足すか、新しいモデルにするか**: 新しいモデルにした。地域の家（`RegionalHouseSpec`）は町の家（2 階以上、張り出し、店の間口）を前提にしていて、長い家の通り抜けの土間・家畜の部屋・脱穀の納屋の向かい合う扉を持てないためである。
- **CE への載せ方**: 村の家は fabric の家のまま保存し、3D でだけ、家の外形の長さ・幅に合わせた Opus のモデルで描く。モデルは寸法を 0.25 m 刻みに丸め、同じ寸法・地域・向きの家は 1 つのモデルを instancing で共有する。保存形式と生成の結果は変えない。

### 16.2 作ったもの

| ファイル | 内容 |
| --- | --- |
| [opusVillageHouses.ts](../../src/buildings/medieval/opusVillageHouses.ts) | `createOpusVillageHouse(spec, quality)`: 長い家・小屋・納屋。spec は種類・地域・長さ・幅・向き（住まいの端が左か右か）。長い辺を x、表（通り、納屋は中庭）を +z、原点を中心にした。壁は外形どおり、屋根は 0.35 m 張り出す。壁の高さは 2.0〜2.1 m（納屋 2.8 m）。長い家は通り抜けの土間と向かい合う扉、住まいの端の窓 1〜2 と煙出し、家畜の端の換気の細窓（High では排水口と土間の踏み石）。小屋は扉 1 と窓 1〜2 と煙出し。納屋は長い辺の中央に向かい合う大扉。地域ごとの壁と屋根: `atlantic` 編み枝と土壁＋木骨・草葺き 50°、`northern-wooded` 丸太・板葺き 38°（High で丸太の段）、`northern-urban` 木骨の Wohnstallhaus・草葺き 48°、`stone-upland` 石積み・草葺き 45°、`mediterranean` 石積み・瓦 22°・石の煙突。`villageHouseDefinition`: spec と品質ごとに 1 つの定義（instancing 用） |
| [62-village-housesModels.ts](../../src/buildings/medieval/62-village-housesModels.ts) | MV の task 62「Village Houses」: `village-house.longhouse`・`village-house.cottage`・`village-house.barn`。Low・High。MV で地域・長さ・幅・向きを選べる |
| [medievalVariants.ts](../../src/buildings/medieval/medievalVariants.ts)、[catalogueFacets.ts](../../src/buildings/catalogueFacets.ts)、[wikipedia.ts](../../src/model-viewer/wikipedia.ts) | 登録、絞り込みの属性（中世〜、ヨーロッパ、住まい・農業）、Wikipedia の項目（Longhouse、Cottage、Barn） |
| [villageHouses.ts](../../src/city-editor/renderers/vector/villageHouses.ts) | fabric の家から spec と置き方を求める。戸数 0 は納屋、長い辺 11.5 m 以上は長い家、それ以外は小屋。家の表は入口の先の通りへ、納屋の表は同じ屋敷地の家の側（中庭）へ向ける。地域は町の住まいの文化（自動の場合も含む。`legacy` は `atlantic`） |
| [renderData.ts](../../src/city-editor/renderers/vector/renderData.ts)、[houseAppearance.ts](../../src/city-editor/renderers/vector/houseAppearance.ts) | `burgage-village` の街区の家は、massing の代わりに `houses.village`（spec・中心・向き）を持つ。2D の描画は変えない |
| [villageHouseMeshes.ts](../../src/city3d/three/villageHouseMeshes.ts)、[scene3d.ts](../../src/city-editor/renderers/vector/scene3d.ts) | 3D の層 `village-houses`: 村の家を Opus のモデルで instancing して描く。家を選ぶと fabric の家の id が返る |

### 16.3 画面での確認

開発サーバーで確かめた。

- MV の「Village Houses」に 3 つのモデルが出て、Low・High と地域・寸法・向きを切り替えられた。最初の版は、軒の近くで壁の角が屋根を突き抜けていた（屋根の下面の傾きが妻壁と合っていなかった）。屋根の下面を妻壁の傾きに揃えて直した。
- CE で Meshless・「街道沿いの村」・400 人を生成し、3D で見た。家は 1 階で、屋敷地の通り側に軒を通りに向けて並び、納屋は妻を通りに向けて屋敷地の脇に建った。屋敷地の裏の畑・川・橋・教会と合わせて、村の形になっている。この町の自動の住まいの文化は `northern-wooded` で、丸太と板葺きの濃い茶色の家だった。
- 2D・3D の投影図（MV の Front elevation・Top view）に、妻壁の端が細い三角に見えるところがある。3D の表示では見えないので、そのままにした。
- 施設のある村（既定の `medieval-facilities`）では、施設が 13 のうち 1 しか置けなかった（V5 で扱う）。

### 16.4 テスト

- [opusVillageHouses.test.ts](../../src/buildings/medieval/opusVillageHouses.test.ts) 2 件: 3 種類 × 5 地域 × Low・High × 3 寸法で、モデルが地面に立ち、外形以上・外形＋0.8 m 以下に収まり、中心が原点で、高さが 1 階の範囲にある。同じ spec と品質で定義を共有する。
- [villageHouses3d.test.ts](../../src/city-editor/renderers/vector/villageHouses3d.test.ts) 1 件: 300 人の村で、すべての家が村のモデルで描かれ（massing は無い）、長い家・小屋・納屋がそろい、納屋はちょうど戸数 0 の建物で、モデルの中心が家の外形の中にあり、3D で全部の家を選べる。
- `MEDIEVAL_MODEL_TASK=62 npx vitest run src/buildings/medieval/modelContracts.test.ts`: 8 件成功。
- `npx vitest run src/city-editor/renderers/vector src/buildings/medieval/opusVillageHouses.test.ts src/buildings/catalogueFacets.test.ts src/model-viewer src/city-editor/generators/vector/generation/villagePlan.test.ts`: 26 ファイル・65 件成功。
- `npx tsc --noEmit`: 誤りなし。

## 17. V5 の記録（2026-11-22）

### 17.1 施設が置けなかった原因と直したこと

V4 の画面の確認で、施設のある 400 人の村は施設を 13 のうち 1 しか置けなかった。原因は 3 つあった。

| 原因 | 直したこと |
| --- | --- |
| 町の中心の判定（`core`）が、壁のない町では円形の敷地の半径の 0.65 倍だった。村の敷地は中心の施設だけの小さな円なので、村の区画はすべて「町の外」になり、町の中に置く施設（パン焼き・仕立て・靴など）の候補が無かった | 村では、中心から屋敷地の届く距離の 0.6 倍（`VILLAGE_CORE_SHARE`）を中心部とする。街区を並べる前（tanners' row の予約）は見込みの長さ（`villageReachMeters`）で、並べた後は実際の長さで決める。外側の 4 割の屋敷地には、鍛冶など町の外に出す業種が建つ |
| 横の小路と裏小路の面が、区画の縁にちょうど接していた。施設の判定は小路の面を数 cm 広げて見るので、どの区画も小路に重なると判定された | 小路の帯の両側に、burgage の街区と同じ 5 cm の隙間（`LANE_CLEARANCE_METERS`）を空けた。横の小路は道の中心線から街区に直角に引く（前は道の最寄りの点から斜めに引いていた） |
| 施設を区画に置いた後、検証が「施設が町の土地（`urban.domain`）の外にある」として止めた。村の町の土地は、中心の小さな円のままだった | 村の町の土地に、村の district の外形、街区（5 cm 広げる）、街区の前の通り（正面から道の中心線まで）を加えた |

あわせて、施設の屋敷地の分を村の区画の必要数に足した（施設 1 つに 1 区画、大きな施設は 2 区画。1 列の半分までしか施設を置けないので 1.5 倍。`VILLAGE_FACILITY_ROOM`）。

### 17.2 村の中心と広場

- **交差点の角**: 街区はすべて四角形で、道の帯と中心の施設（教会・広場・墓地）を避けて置くので、角に三角の街区はできない。
- **細長い広場（street green）**: 村の半分（シードで決める）で、いちばん長い腕の中心から、幅 20〜45 m・長さが幅の 4〜8 倍（175 m まで）の区間を広場にした（§2.4、Thorpe 1949）。この区間の屋敷地は、正面を道から広場の幅の半分まで下げる。道と屋敷地の間を芝地（公園と同じ描き方。`village-green`）にし、屋敷地の正面に沿って幅 2 m の小道（`front`）を通す（家は広場から直接出入りした: Thorpe 1949）。
- **broad green**（2 本以上の道が集まる中心の広い広場）は作っていない。中心の施設（教会・広場）の配置と重なるため、必要になれば別に扱う（§9 の 5）。
- **公園の区画**: 村では、町の公園の区（park ward）を使わない。村の屋敷地はすべて家の土地で、広場が村の空き地である。V5 の前は、家の建たない区画が木のある芝地になっていた。

### 17.3 計測

合成入力、`medieval-facilities`、`lotOccupancy` 1。「置けた施設」は、川が無くて置けない皮なめし（理由 `river`）を除いた数に対する割合。

| シード | 人口 | 川 | 施設（置けた／要る） | 置けた割合（皮なめしを除く） | 広場 | 未収容 |
| --- | --- | --- | --- | --- | --- | --- |
| `village-v5` | 400 | あり | 12／12 | 100% | なし | 0 |
| `village-v5` | 1,000 | あり | 39／39 | 100% | なし | 0 |
| `village-v5` | 1,000 | なし | 36／39 | 100% | なし | 0 |
| `e` | 400 | あり | 12／12 | 100% | あり | 0 |
| `e` | 1,000 | あり | 39／39 | 100% | あり | 0 |
| `e` | 1,000 | なし | 31／39 | 86% | あり | 0 |

V5 の前は、同じ入力で 1／12、3／39、0／39 だった。

### 17.4 画面での確認と残したこと

開発サーバーで、シード `e`・1,000 人・川ありの村を生成して 2D と 3D で見た。

- 施設は 39／39 置け、町の家と並んで街道沿いに建った。皮なめしは下流の川岸に建った。
- 南東の腕に広場ができ、道の両側に芝地、その奥に屋敷地が下がって並んだ。
- **施設の建物が町の家のまま**: 施設（trade workhome、shop-house）は 2 階建ての町家のモデルで描かれ、1 階の村の家の中で目立つ。村の工房のモデルは今は無い。村の施設を村の家のモデルで描くかは、後で決める（§9 の 6）。
- **使われない土地**: 村の中心の周りと川沿いに、畑にも村にもならない土地が広く残った。V6 で扱う。
- 施設の家にも戸数があるので、戸数の容量は必要数をやや上回る（1,000 人で 238／223）。

### 17.5 ほかの Plot pattern が変わらないこと

§13.3 と同じ 16 通りで、V5 の変更の前後の直列化した文書の SHA-256 は 16 件とも一致した。

### 17.6 テスト

- [villagePlan.test.ts](../../src/city-editor/generators/vector/generation/villagePlan.test.ts) に 2 件を加えた: 施設のある 1,000 人・川ありの村で、施設の 8 割以上が置け、皮なめしがあり、皮なめし以外の施設はどれも屋敷地の上に建つ。シード `green-village` の 500 人の村に広場の芝地があり、芝地は屋敷地の外にある。
- [roadsideBlocks.test.ts](../../src/city-editor/generators/burgage/roadsideBlocks.test.ts) の裏小路の確かめ方を、小路の隙間（5 cm）の分だけ直した。
- `npx vitest run src/city-editor/generators/burgage src/city-editor/generators/vector/generation/{villagePlan,burgagePlots,perimeter,urban,facilityLots}.test.ts src/city-editor/renderers/vector/villageHouses3d.test.ts src/city-editor/generators/vector/validation`: 10 ファイル・74 件成功。
- `npx tsc --noEmit`: 誤りなし。

