# CE 史実の短冊形区画（burgage plot）で街区を作るオプション

作成: 2026-11-18
更新: 2026-11-18（B0: 史料の本文を確認し、§2 の寸法表を確定。`bastide` の型を `binaire` に置き換えた。B1: 設定の型・型の表・区画を作る純関数を実装。B2: メッシュなしの生成に接続し、開発中の既定値にした。B3: 施設を区画単位で置く。B4: 区画の裏庭・境界の塀・venelle を描く）
状態: B0〜B4 完了。B5 以降は未実装。新しい CE の既定は `medieval-facilities` と `burgage`（§8.2）。
関連: [ce-meshless-block-fabric-scaling.md](ce-meshless-block-fabric-scaling.md)、[ce-medieval-facility-district-packing.md](ce-medieval-facility-district-packing.md)、[ce-facility-block-allocation.md](ce-facility-block-allocation.md)、[bv-workhome-facade-variation.md](bv-workhome-facade-variation.md)、[ce-meshless-gate-ribbon-growth.md](ce-meshless-gate-ribbon-growth.md)

## 1. 目的と範囲

### 1.1 起きていること

`medieval-facilities` で都市を作ると、Town Trades と Workhome の施設が住宅用の街区を 1 つ丸ごと使ってしまう。その結果、通りに沿って「道・施設・道・施設」と並び、建物がまばらに見える。

原因は、今の街区が「奥行きの浅い住宅を 2 列、背中合わせに並べる」大きさで切られていることである（§3）。施設は住宅 1 列の奥行きより深いため、裏の列まで届き、街区の幅をすべて使ってしまう。

史料では、中世ヨーロッパの都市の多くの手工業は、住宅と同じ短冊形の区画（burgage plot、Hofstatt）の中で営まれていた。間口は狭く奥行きは深い。表通り側が店と住居で、奥が工房・中庭・付属屋である。大きい家は隣の区画を合わせて建てた（1½〜2 筆の例がある）。B0 で確認した史料は §2 にまとめた。

### 1.2 本書で行うこと

- 今の街区の切り方（住宅だけを前提にした、浅く小さい街区）は**そのまま残す**。これを `compact` と呼ぶ。
- 史料に基づく短冊形区画で街区を作る生成方式を、**別のオプション** `burgage` として加える。
- `burgage` では、施設は「区画を 1〜3 筆合わせたもの」として置く。同じ街区に住宅と施設が混ざる。

### 1.3 範囲に入れる

- メッシュなし CE（skeleton-first）の `medieval` と `medieval-facilities`。
- 区画の寸法の表（地域の型・時代ごと）、街区と裏小路の作り方、区画の中の建物と裏庭、施設を合筆して置く処理、都市の大きさの見積もり、保存形式。

### 1.4 範囲に入れない

- 今の `compact` の関数（`organicLayout`、`frontageBuildings` の `packAttachedHouses`、`placeFacilitiesOnLots`）の変更。`compact` の出力は変えない。
- 施設の正確な敷地面積の合わせ込み。Workhome の大きさは「住宅より大きい施設がある程度」とだけ扱う（2026-11-18 のユーザー方針）。外観と大きさのばらつきは [bv-workhome-facade-variation.md](bv-workhome-facade-variation.md) で扱う。
- メッシュあり CE（mesh-first）への適用。B6 で判断する（§8）。
- 経済（Economy）の結果を区画に反映すること。Economy がオンのときに CE へ経済の値を渡す方針はあるが、本書では人口から決まる施設数だけを使う。
- CG。

## 2. 史料と寸法

B0（2026-11-18）で、手に入った史料の本文を読んで確認した。本文を読めたものだけを「確認済み」とし、検索結果の要約や二次的な紹介でしか見ていないものは「未確認」として分ける。

### 2.1 確認した史料

| 史料 | 確認した内容 | 状態 |
| --- | --- | --- |
| *VCH Warwickshire* vol. 3 (1945), "The borough of Stratford-upon-Avon: Borough", p. 247（[BHO](https://www.british-history.ac.uk/vch/warks/vol3/pp247-258)） | 1196年に Worcester 司教 John de Coutances が週市の特許を得て、区画ごとに「12 by 3½ perches」（約60.4 × 17.6 m）の土地を割り当て、地代は12 d。1252年に約240の burgage があった | 確認済み |
| Victoria County History, *Explore* Panel 2 "Reconstructing Medieval Towns"（Burford, Oxfordshire）（[PDF](https://ihr-archive.github.io/vch-explore/sites/explore/files/explore_assets/2010/03/22/panel2whole.pdf)） | 区画の幅は statute perch（16½ ft = 5.03 m）の倍数で測られた。Burford の最初期（11〜12世紀）の区画は 1½ perch × 22〜28 perch（7.5 × 110〜140 m）、12世紀後半の区画は 3 perch × 14〜19 perch（15 × 76〜90 m）。1250年頃に半分の区画（half-burgage）の記録がある。豊かな者は隣り合う数筆の区画に大きな家を建てた（1½筆分で間口11 mの家の例） | 確認済み |
| F. Löbbecke, „Und soll jegliche Hofstätte sein hundert Schuh lang und fünfzig breit", *Schau-ins-Land* 126, S. 7–18（[DOI](https://doi.org/10.57962/regionalia-17820)、CC BY 4.0） | Freiburg im Breisgau の Hofstätte は 50 × 100 Fuß。Freiburg の1フィートを32.4 cm とすると 16.20 × 32.40 m（S. 8）。12世紀の最初の家は短い辺を通りに向け、横に中庭への通路を空ける。内法は約5.5〜8 × 8〜11 m（S. 12）。実測の区画は 16.3 × 32〜34.7 m、15〜16.5 × 37 m（S. 13）。表の家・翼屋・裏の家という後の区画の構成が12世紀に見え始め、ある家の中庭には鍛冶場があった（S. 13）。区画の幅は14〜18 m、奥行きは32〜40 m に散らばる（S. 17）。1252〜1255年に幅約17 m の区画が2つに割られた。1200年頃から、新しく開いた区域はこの規格に従わなくなった（S. 18） | 確認済み |
| G. Séraphin, « Un modèle de parcellaire médiéval : le parcellaire binaire », *La maison au Moyen Âge dans le Midi de la France*, M.S.A.M.F. hors série 2008, p. 37–52（[PDF](https://societearcheologiquedumidi.fr/_samf/memoires/hrseri2008/03_Seraphin.pdf)） | 南西フランスの計画都市には3つの型がある（p. 38）。**gascon**（Mirande）: 家は壁を接して軒を通りに向け、区画の奥に庭がある。**aquitain**（Monpazier）: 家は細い路地（venelle）で離れ、妻を通りに向け、市街地全体を埋めて**庭を持たない**。**binaire**（Figeac、Villefranche-de-Rouergue など）: 街区の幅は11.5〜12 m（Figeac）、14〜17 m（Villefranche、多くは15 m）、長さは約50〜70 m。街区の中央を幅0.5 m 未満の路地が通り、空き地はない（p. 39, 44）。街区の頭の家は 6 × 12 m（Figeac）、7.5 × 15〜20 m（Villefranche）。普通の家は横の路地（2〜3 m）に面し、間口4.5〜7.5 m・奥行き6〜7.5 m（p. 39, 44）。街区の頭には2区画分の大きな家が建つこともある（p. 39） | 確認済み |
| Alnwick Civic Society, "Rods, poles and perches"（2020）（[Web](https://alnwickcivicsociety.org.uk/2020/09/11/rods-poles-and-perches/)） | Conzen が1960年代に Alnwick を調べたとき、多くの区画は約28 ft（8.5 m）幅か、その分数・倍数だった | 確認済み（ただし Conzen の原典ではなく地元団体による紹介） |

### 2.2 確認できなかった史料

次のものは、本文を読めなかった。本書の数値には使わず、取り決めの背景としてだけ挙げる。

| 史料 | 見込まれる内容 | 確認できなかった理由 |
| --- | --- | --- |
| M.R.G. Conzen, *Alnwick, Northumberland* (1960) | burgage cycle（区画の奥が建て込み、空いて、また建つ）、合筆 | 原典が手に入らない。burgage cycle の定義は複数の二次文献で一致する |
| T.R. Slater (1981) ほか、M. Beresford (1967) | イングランドの区画の寸法 | 原典が手に入らない |
| Bern の Goldene Handfeste（Hofstatt 100 × 60 Fuß） | ツェーリンゲン家の都市の区画 | Bern 市の地図サーバーに接続できなかった。検索結果の要約でしか見ていない |
| Monpazier の区画 8 × 24 m | バスティードの区画 | 出典が百科事典の子供向け版（Vikidia）だけ。Séraphin は Monpazier を「庭を持たない」型としている |
| Lübeck などハンザ都市の区画の幅 | 北ドイツの区画 | 本文を読めず、数値が得られなかった。区画が細長く、奥に倉庫・厩・汚水溜めがあったことは要約でしか見ていない |
| York, Coppergate | 表通りの工房、奥の住居 | 報告書の本文を読めなかった |
| D. Keene (1985)、J. Schofield (1994)、『メンデル家十二兄弟財団の家の書』 | 区画内の用途の混在、通りに面した工房 | 本文を確認していない |

### 2.3 確定した寸法

史料の値と、生成に使う値（採用値）を分けて書く。採用値が史料から外れるところは、理由を書く。

| 型 | 史料の値 | 採用値 | 史料から外した理由 |
| --- | --- | --- | --- |
| `english-burgage` | 作った時の間口 7.5〜17.6 m（1½〜3½ perch）、奥行き 60〜140 m（Stratford・Burford）。間口は半分に割られた（Burford）。Alnwick では約8.5 m | 間口 5〜9 m（1〜1¾ perch。割った後の区画を基本にし、15〜18 m の割っていない区画を1割まぜる）。奥行き: 壁の外・小さな町は 50〜90 m、壁の中は 30〜50 m | 史料の奥行き（60〜140 m）のままでは、市域が広がりすぎる（§6）。壁の中の奥行きは史料で確かめていない。ゲーム側の調整である |
| `hofstatt` | 規格 16.2 × 32.4 m。実測 14〜18 × 32〜40 m（Freiburg）。1250年代に割られ、間口が約8 m になる | 間口 7〜9 m（割った後）。14〜18 m の割っていない区画を2割まぜる。奥行き 32〜40 m | 外していない |
| `binaire` | 街区の幅 11.5〜17 m、長さ 50〜70 m。中央に0.5 m 未満の路地。横の路地 2〜3 m。頭の家 6〜7.5 × 12〜20 m。普通の家は間口 4.5〜7.5 m・奥行き 6〜7.5 m。空き地なし | 史料の値のまま | 外していない |

**前の版からの変更**:

- `bastide` の型（間口8 m・奥行き20〜25 m で裏庭を持つ）は、確かな出典がないので取り下げた。Séraphin によると、南西フランスの計画都市は裏庭を持たない型（aquitain、binaire）が多い。地中海の地域の型には `binaire` を使う。
- 裏庭を持つ南西フランスの型（gascon）もあるが、寸法を得られなかったので、本書では扱わない。
- ハンザ都市の値（間口 6〜10 m、奥行き 30〜50 m）は確かめられなかったので取り下げた。`northern-urban` は `hofstatt` の値を使う。

### 2.4 史料から取る取り決め

- **R1 細長い区画**: `english-burgage` と `hofstatt` の区画は、通りに狭く面して奥に深い。奥行きは間口の2〜8倍（Freiburg 約2倍、Stratford 約3.4倍、Burford 5〜19倍）（確認済み）。
- **R2 表と奥**: 表に家、奥に中庭と付属の建物がある。Freiburg では表の家・翼屋・裏の家の構成が12世紀に見え始める（確認済み）。
- **R3 工房は区画の中に収まる**: Freiburg では家の中庭に鍛冶場があった（確認済み）。大きな家は隣の区画を合わせて建てた（Burford で1½筆分、Figeac で2筆分）（確認済み）。街区を丸ごと使う施設を作らない取り決めは、これらの例から導いたものである。手工業の施設が街区を占めなかったことを、数で示す史料は得ていない。
- **R4 街区**: `binaire` の街区は区画2列を背中合わせにし、中央に細い路地を通す（確認済み）。`english-burgage` と `hofstatt` の街区の作りは、本文では確かめていない。区画2列を背中合わせにするか、1列の奥を裏小路にする案は、二次文献の一般的な説明による。
- **R5 区画の割りと合わせ**: 区画は後から縦に割られ（Burford c.1250、Freiburg 1252〜1255）、また合わせられた（Burford）（確認済み）。
- **R6 規格は時代とともに崩れる**: Freiburg では1200年頃から、新しく開いた区域は規格に従わなくなった（確認済み）。古い中心ほど規格どおりで、後から広がった区域ほど不揃いにする。
- **R7 空き地のある町並み**: Figeac の1400年頃の土地台帳では、建った区画と空いた区画が交互に並んでいる（Séraphin p. 37。確認済み）。`lotOccupancy` < 1 で空いた区画を残すことは史料に合っている。
- **R8 外側に出す業種**: なめし革などを川沿い・下流に置く今の tanners' row（[ce-meshless-tanners-row.md](ce-meshless-tanners-row.md)）は、そのまま使う。本書では史料を確かめていない。

## 3. 今の実装の調査

### 3.1 街区の切り方（`compact`）

メッシュなし CE は、骨格の街区（district）を [perimeter.ts](../../src/city-editor/generators/vector/generation/perimeter.ts) の `perimeterJobs` で受け取り、[organicBlocks.ts](../../src/city-editor/generators/organicBlocks.ts) の `planOrganicStreetCells` と `buildOrganicStreetCell` で街区（street block）と区画に分ける。

| 箇所 | 値 | 意味 |
| --- | --- | --- |
| [perimeter.ts:236](../../src/city-editor/generators/vector/generation/perimeter.ts#L236) `ceParameters` | `lotArea: 80`、`laneWidth` は設定の 2.4 m（[urban.ts:60](../../src/city-editor/generators/vector/generation/urban.ts#L60)） | 住宅 1 戸の敷地 80 m²（[housing.ts:8](../../src/city-editor/generators/housing.ts#L8) `DWELLING_LOT_M2`） |
| [organicBlocks.ts:206-210](../../src/city-editor/generators/organicBlocks.ts#L206-L210) | `houseDepth = √80 × 1.1 ≈ 9.8 m`、`pairedSpan = 2 × 9.8 + 2.4 + 0.7 ≈ 22.4 m` | 住宅 2 列を背中合わせにした幅 |
| [organicBlocks.ts:50-51](../../src/city-editor/generators/organicBlocks.ts#L50-L51) | `COARSE_STREET_CELL_METERS = 50`、`COARSE_STREET_WIDTH_METERS = 5` | 骨格の街区を約 50 m 角の街区に切る |
| [organicBlocks.ts:286-291](../../src/city-editor/generators/organicBlocks.ts#L286-L291) `subdivide` | 短い辺は `pairedSpan` ＋ 0〜3 m（32% は中庭付きで ＋ 6〜14 m）。長い辺は `pairedSpan` × 1.65〜2.6 | 最後の街区は約 22〜37 m × 37〜58 m |
| [frontageBuildings.ts:194](../../src/city-editor/generators/frontageBuildings.ts#L194) `packAttachedHouses` | コメントに「Compact houses, not elongated burgage holdings」 | 区画は家の外形そのもので、裏庭を持たない |

### 3.2 施設が街区を占有する経路

[facilityLots.ts:50-56](../../src/city-editor/generators/vector/generation/facilityLots.ts#L50-L56) の `placeFacilitiesOnLots` は、施設 1 つに 1 つの街区の隣り合う住宅区画を何筆か割り当てる。施設の敷地が触れた区画は、区画の線まで全部を施設のものにする。

- 住宅 1 列の奥行きは約 9.8 m しかない。Workhome や Town Trades の敷地はそれより深いので、裏の列の区画にも触れる。
- 裏の列まで施設のものになると、施設が街区の幅（約 22 m）をすべて使う。表と裏の両方の通りに施設が面し、その街区には住宅が残らない。
- 街区の長い辺も 37〜58 m しかない。施設が 2 つ入ると長い辺も埋まり、街区全体が施設だけになる。

区画の大きさ（住宅の 80 m²）と施設の大きさの比が合っていないことが根本の原因である。施設の配置の探索を直しても解決しない。

### 3.3 都市の大きさの見積もり

[urbanSizing.ts](../../src/city-editor/generators/vector/generation/urbanSizing.ts) の `meshlessCityRadius` は、`MESHLESS_DWELLINGS_PER_M2_STOREY = 0.0068`（道を含めて 1 戸・1 階あたり約 147 m²）で市域の半径を決める。`compact` の区画の大きさから求めた値なので、`burgage` には使えない（§6）。

### 3.4 使える部品

- 骨格の街区を受け取る処理（`perimeterJobs`）、district と街区の安定した ID（`vectorDistrictId`、`ringHash`）、乱数の流れ（`growthRandom`、`makeRng`）。
- 区画・小路の保存形式（fabric の記録、[vector/fabric](../../src/city-editor/generators/vector/fabric)）。
- 住宅の階数（`vectorHousingHeights`）、地域の型（`vectorHousingCulture` → `BuildingAppearanceProfile`）。
- tanners' row の予約（`reserveTanneryRow`）。
- 空き地の木（[vacantLotTrees.ts](../../src/city-editor/generators/vacantLotTrees.ts)）。裏庭の木と菜園に使う。

## 4. 方針

1. **`compact` は変えない**: 新しい処理は別のモジュールに書く。既存の関数を書き換えて分岐を足すことはしない。`compact` の固定入力の出力は、直列化した文書の SHA-256 が変更前と一致することで確かめる。
2. **設定の追加**: `GenerationSettings` に `plotFabric?: "compact" | "burgage"` を加える。値がないときは `compact`。`VectorUrbanSettings` にも同じ項目を持たせる。施設の有無（`mode`）とは別の軸とし、`medieval`（住宅だけ）でも `burgage` を選べる。
3. **UI**: Urban area & housing に「Plot pattern」を加える。選択肢は `Compact (houses only)` と `Burgage plots (historical)`。文言は多言語化のファイルに置く。
4. **アルゴリズムの版**: `burgage` を選んだときだけ `vector-urban-v19` とする。`compact` は v18 のまま出力が変わらない。保存済みの文書は、保存された版のまま扱う。
5. **区画が単位**: `burgage` では、区画が所有と配置の単位になる。住宅も施設も区画の上に建つ。施設は区画の線をまたいで置かず、区画を合わせて広げる。
6. **史料の寸法は表で持つ**: §2.3 の採用値は `burgageProfiles.ts` の表に置く。生成の処理に数値を直接書かない。

## 5. 区画のモデル

### 5.1 型の選び方

| 地域の型（`BuildingAppearanceProfile`） | 区画の型 |
| --- | --- |
| `atlantic`、`northern-wooded`、`legacy` | `english-burgage` |
| `northern-urban` | `hofstatt` |
| `mediterranean` | `binaire` |
| `stone-upland` | `english-burgage`（奥行きを短い側に寄せる。斜面で深い区画が取りにくいため。ゲーム側の調整で、史料では確かめていない） |

型は自動で選ぶ。上書きの設定は B1 では作らず、必要が出たら加える（§10）。

`binaire` は裏庭を持たない密な型なので、§5.3〜§5.5 のうち裏庭と裏小路の部分は使わない。`binaire` だけの取り決めは §5.7 にまとめる。

### 5.2 区画の寸法の決め方

区画 1 筆ごとに、型の範囲の中から間口と奥行きを乱数で決める。乱数は街区の ID から作り、ほかの街区の結果に左右されない。

- **間口**: §2.3 の採用値の範囲から選ぶ。割っていない広い区画（`english-burgage` 1割、`hofstatt` 2割）は、街の中心に近い古い区域に多く置く。Freiburg では古い区域ほど規格どおりで、後から開いた区域ほど不揃いだったため（R6）。
- **割った区画**: 割った区画は、隣り合う2筆が合わせて割っていない区画の間口になるように作る（R5）。間口は「元の区画 → 半分」の順に決め、ばらばらの値を並べない。
- **奥行き**: 1 つの街区の 1 列の中では、ほぼ揃える（差は ±10% 以内）。Freiburg の実測では奥行きが32〜40 m に散らばるが、これは主に通りが平行でないためである（Löbbecke S. 17）。
- **壁の中と外**: `english-burgage` の奥行きは、壁の中で 30〜50 m、壁の外の街道沿い（[ce-meshless-gate-ribbon-growth.md](ce-meshless-gate-ribbon-growth.md) の roadside ribbon）と壁のない町で 50〜90 m を使う（§2.3 の採用値）。

### 5.3 街区と裏小路

`compact` の「約 50 m 角に切る」処理の代わりに、区画の奥行きから街区の大きさを決める。

- **短い辺**: 区画の奥行き × 2（背中合わせ）。または区画の奥行き ＋ 裏小路の幅（1 列と裏小路）。`english-burgage` は両方を使い、`hofstatt` は背中合わせを基本にする。この街区の作りは史料の本文で確かめていない（R4）。
- **長い辺**: 区画が 10〜30 筆並ぶ長さ（60〜200 m）。主要道路に沿う辺を長い辺にする。区画の正面は主要道路か街路に向ける。
- **横の小路**: 長い辺が長すぎて奥へ行けない場合は、60〜120 m ごとに狭い横の小路（1.5〜2.5 m、英国の wynd・vennel に当たる）を通す。
- **裏小路**: 幅 2〜3 m。区画の奥にある裏口と作業場への出入りに使う。裏小路にも家は面さない（区画の奥の付属屋は B5 で扱う）。
- **骨格の街区の形が合わない場合**: 三角形の角や細い先端は、区画の奥行きを短くして埋める。奥行きが型の下限の半分より短くなる部分は、空き地（菜園・木）として残す。三角形の家は作らない（`packAttachedHouses` と同じ考え方）。

### 5.4 区画の中

区画を、表から奥へ 3 つの帯に分ける。

| 帯 | 奥行き | 中身 |
| --- | --- | --- |
| 表 | 建物の奥行き（住宅は 8〜12 m、施設はモデルの奥行き）。Freiburg の12世紀の家は内法 5.5〜8 × 8〜11 m（Löbbecke S. 12） | 表通りに面した建物。隣とは壁を接し、連続した町並みにする。`hofstatt` の割っていない区画では、家の横に中庭への通路を空ける（同） |
| 中庭 | 残りの前半 | 翼屋・作業場・井戸・薪置き。施設の付属の敷地はここに入る。Freiburg では中庭に鍛冶場の例がある（Löbbecke S. 13） |
| 奥 | 残りの後半 | 菜園・果樹・汚水溜め・付属屋（B5） |

- 区画の境界は、2D では細い線、3D では低い石垣・板塀・生垣で描く（B4）。
- 建物が建たない区画（`lotOccupancy` < 1 で空いた区画）は、区画全体を菜園や空き地として描く。
- 区画 1 筆の住宅の戸数は、表の建物の大きさと階数から今の `perimeterHouseDwellings` で決める。

### 5.5 施設を区画に置く

`compact` の `placeFacilitiesOnLots` とは別に `placeFacilitiesOnPlots` を作る。

1. 施設の必要数と置く順序は今と同じ（`buildPopulationFacilityRequests`、`facilityPlacementOrder`）。
2. 施設の**間口**だけから、合わせる区画の数を決める: `ceil(施設の幅 / 区画の間口)`。奥行きは区画の中に収まればよい。施設の正確な面積は合わせない（§1.4）。
3. 1 つの街区の**同じ通りに面して隣り合う**区画を合わせる。施設の建物は合わせた区画の表に置き、残りは施設の中庭と奥の帯になる。
4. 上限:
   - 1 つの施設が合わせる区画は 3 筆まで。史料で確かめた合筆は 1½〜2 筆（R3）なので、3 筆はゲーム側の余裕である。宿屋・ギルドホールのような大きい施設は 4 筆まで認める。
   - 1 つの街区の 1 つの辺のうち、施設が使う区画は半分まで。残りは住宅にする。
   - 1 つの街区で、通りに面したすべての辺が施設だけになる配置はしない。
5. 施設の奥行きが区画の奥行きより深い場合、その施設は「街区規模の施設」として扱う。この扱いを許すのは、修道院・施療院・大きな市場の建物など、表で指定した種類だけにする。それ以外は、置けなかった理由 `plot-depth` として報告する。
6. 用途の位置は今の考え方を引き継ぐ。商業は中心に近い区画、川を使う業種は川に近い区画、なめし革は tanners' row（R8）。
7. 置けなかった施設は、今と同じく `unplacedFacilities` に理由を付けて残す。上限を破って数だけ満たすことはしない。

施設の区画が決まった後、残りの区画に住宅を建てる。施設の区画と住宅の区画は区画の線で接し、間に余りの土地はできない。

### 5.6 Workhome の幅との関係

[bv-workhome-facade-variation.md](bv-workhome-facade-variation.md) の V4（間口の幅を連続して受け取る外装、4.8〜7.2 m）は、「区画の作り方の方針（FF の後継）が決まってから」となっている。`burgage` の区画の間口（`english-burgage` 5〜9 m、`hofstatt` 7〜9 m、`binaire` 4.5〜7.5 m）は、この範囲とほぼ重なる。

- B3 では、Workhome は今の 3 種類の外形（narrow 4.8 m・standard 6 m・wide 7.2 m）のうち、区画の間口に収まる一番広いものを選ぶ。
- V4 が実装されたら、区画の間口を外装の幅として渡す。

### 5.7 `binaire` の街区

Séraphin（p. 39, 44）の Figeac と Villefranche-de-Rouergue の値で作る。

- **街区**: 幅 11.5〜17 m、長さ 50〜70 m の細長い街区。長い辺を主要な通り（4〜6 m）に直角に向け、街区と街区の間は横の路地（2〜3 m）にする。
- **中央の路地**: 街区の長い軸に沿って、幅 0.5 m 未満の路地で 2 列に分ける。人は通らない。排水と雨水の路地として 2D で細い線に描き、道路グラフには入れない。
- **頭の家**: 主要な通りに面した街区の両端に、6〜7.5 × 12〜20 m の大きな家を置く。妻を主要な通りに向け、1 階を店にする。
- **普通の家**: 横の路地に面して、間口 4.5〜7.5 m・奥行き 6〜7.5 m の家を壁を接して並べる。裏は中央の路地に面する。空き地は作らない。
- **施設**: 施設は街区の頭に置く。頭の家 1 つ分か、中央の路地をはさんだ 2 つ分（Figeac の Hôtel de la Monnaie のように 2 区画分を 1 つの家にする）を使う。1 つの街区の頭は 2 か所（両端）なので、施設が街区全体を使うことはない。普通の家の区画（奥行き 6〜7.5 m）には、Workhome は入らない。
- 今の `compact` の住宅（約 80 m²）より 1 戸あたりの土地が狭い。`binaire` は `compact` より密になる（§6）。

## 6. 都市の大きさ

型によって密度が大きく変わる。§2.3 の採用値の中央で、道の分を区画の約 25% として見積もると、次のようになる（概算。B2 で計測する）。

| 型 | 区画の例 | 1 筆あたりの土地（道を含む） | `compact`（1 戸・1 階あたり約 147 m²）との比 |
| --- | --- | --- | --- |
| `english-burgage`（壁の中） | 7 × 40 m = 280 m² | 約 350 m² | 約 2.4 倍 |
| `english-burgage`（壁の外） | 7 × 70 m = 490 m² | 約 610 m² | 約 4 倍 |
| `hofstatt` | 8 × 36 m = 288 m² | 約 360 m² | 約 2.4 倍 |
| `binaire`（普通の家） | 6 × 6.75 m ≈ 40 m² | 約 55 m² | 約 0.4 倍 |

`english-burgage` と `hofstatt` では、1 筆に 1 戸だと、同じ人口で市域が 2 倍以上になる。史料の奥行き（Stratford 60 m、Burford 76〜140 m）のままなら、さらに広がる。§2.3 で壁の中の奥行きを 30〜50 m にしたのはこのためである。

- `meshlessCityRadius` に、区画の型ごとの土地の倍率 `landFactor` を渡す引数を加えた（B2）。倍率は固定入力から計測して決めた（§8.2）: `english-burgage` 3、`hofstatt` 3.5、`binaire` 1。`compact` は 1 で、値は変わらない。施設の土地にも同じ倍率をかける。施設は区画を丸ごと使い、裏庭も一緒に取るため。
- 壁の中では、R5（区画を割る）と B5 の裏の棟で密度を上げる。壁の中に入りきらない分は、今と同じく門の外の街道沿いへ回す。
- 市域が広がると、壁・門・道の数も増える。[ce-meshless-block-fabric-scaling.md](ce-meshless-block-fabric-scaling.md) の上限（道の数・記録の数・文書の長さ）に当たらないかを B2 で確かめる。

## 7. 保存形式

- fabric の街区（`VectorFabricCell`）に、区画の記録 `plots` を加える。区画 1 筆は、輪郭（`packPoints` で詰めた環）、正面の線の ID、合わせた施設の ID（あれば）を持つ。
- 住宅の記録は今と同じ形のまま、どの区画に建つかを持つ。
- `burgage` の文書は native の版を 1 つ上げる。`compact` の文書の形は変えない。
- 区画は保存された値を展開して描く。読み込みや描画のたびに区画を作り直さない（[ce-meshless-block-fabric-scaling.md](ce-meshless-block-fabric-scaling.md) §3 の方針 2）。

## 8. 段階

| 段階 | 内容 | 完了条件 |
| --- | --- | --- |
| B0 | §2 の史料を原典で確認し、§2.3 の表を確定する | **完了（2026-11-18）**。5 件の本文を確認し、寸法に出典と頁を付けた。確認できなかった 7 件は §2.2 に分け、数値には使わない。`bastide` を `binaire` に置き換え、ハンザ都市の値を取り下げた |
| B1 | 設定（`plotFabric`）、型の表（§2.3 の採用値と出典を持つ）、純関数 `planBurgageCell(ring, profile, context)`（区画・裏小路・横の小路を返す）、`binaire` の `planBinaireCell` | **完了（2026-11-18）**。§8.1 |
| B2 | メッシュなしの生成に接続する。`perimeterJobs` の後で、`plotFabric` によって `compact` と `burgage` の処理を選ぶ。住宅の配置、都市の大きさ（§6）、保存・読込、v19 | **完了（2026-11-18）**。§8.2 |
| B3 | `placeFacilitiesOnPlots`（§5.5） | **完了（2026-11-18）**。§8.3。壁の中の施設だけの街区は 0。壁の外には残る（§8.3） |
| B4 | 区画の境界と裏庭を描く（2D の線、3D の塀・生垣、菜園、木） | **完了（2026-11-18）**。§8.4。空いた区画の木と菜園の作物は B5 に回した |
| B5 | burgage cycle: 人口の密度と時代で、間口を割り、区画の奥に裏の棟を建てる | 壁の中の密度が B2 の見積もりより上がり、市域が狭くなる。裏の棟が裏小路か中庭から出入りできる |
| B6 | メッシュあり CE への適用を判断する | メッシュあり CE の利用状況と、`localInfill.ts` の `buildPerimeterBlocks` に同じ処理を渡すときの費用を比べて決める |

テストは AGENTS.md の方針に従い、変更した範囲に関係するものだけを実行する。B2 以降の FMG での確認は、Settlement pattern を Standard にした地図で行う。

**次に進める作業**: B5（区画の分割と裏の棟による建て込み。あわせて、壁の外の施設だけの街区・川のある小さな町の区画不足・空いた区画の木と菜園を扱う）。§2.2 の未確認の史料は、手に入ったときに §2.3 を見直す。


### 8.1 B1 の記録（2026-11-18）

実装したもの:

| ファイル | 内容 |
| --- | --- |
| [types/contracts/burgage.ts](../../src/city-editor/types/contracts/burgage.ts) | `PlotFabric`（`compact` / `burgage`）、区画・小路・街区の計画の型（`BurgagePlot`、`BurgageLane`、`BurgageCellPlan`） |
| [types/generationSettings.ts](../../src/city-editor/types/generationSettings.ts)、[types/vector/urban.ts](../../src/city-editor/types/vector/urban.ts) | `plotFabric?` を加えた。どこからも読まないので、今の生成は変わらない |
| [generators/burgage/profiles.ts](../../src/city-editor/generators/burgage/profiles.ts) | `BURGAGE_PROFILES`（§2.3 の採用値と出典の文字列）、`burgageProfileFor`（§5.1） |
| [generators/burgage/frame.ts](../../src/city-editor/generators/burgage/frame.ts) | 街区の辺の座標系、凸の窓での切り抜き、長さを幅の列で埋める `fillLength` |
| [generators/burgage/stripCell.ts](../../src/city-editor/generators/burgage/stripCell.ts) | `planBurgageCell`: 背中合わせの 2 列、1 列と裏小路、深すぎる街区の中央の空き地、横の小路、元の区画を 2 つに割る処理 |
| [generators/burgage/binaireCell.ts](../../src/city-editor/generators/burgage/binaireCell.ts) | `planBinaireCell`: 細長い街区、横の路地、中央の venelle、頭の家、横の路地に面する家、長すぎる街区を切る路地 |

設計からの変更と、B2 へ送るもの:

- 奥行きと間口の比の検査は、割った区画で 2 倍以上、割っていない区画で 1.75 倍以上にした。`hofstatt` の割っていない区画は、Freiburg の実測（幅14〜18 m・奥行き32〜40 m）どおりだと 2 倍に届かないため。
- 割った区画 2 筆の間口の和は、作り方の上で元の区画の間口に一致する。元の区画の間口は記録していないので、テストでは和が元の区画の範囲に入ることを確かめた。
- 幅は「範囲から引いて長さに合わせて伸縮する」ので、範囲の端を少し（テストでは ±15%）はみ出すことがある。
- 斜めの街区の角で、通りに面さない区画や細すぎる区画は空き地にした。
- `stone-upland` の奥行きを短い側に寄せる処理（§5.1）、UI（§4 の 3）、街区の外周の後退（今の `fill` の `setback` に当たる処理）は B2 で行う。
- `binaire` の向かいの通りの頭の家は、街区の遠い辺が向かいの通りと平行なときだけ置く。平行でないときは空き地になる。

テスト: `npx vitest run src/city-editor/architecture.test.ts src/city-editor/generators/burgage`（2 ファイル・20 件成功）。`scripts/lint-architecture.ts` も成功した。


### 8.2 B2 の記録（2026-11-18）

#### 既定値

開発中の生成を既定にして、Generate city を押せばすぐに今の状態が見えるようにした（2026-11-18 のユーザーの依頼）。

| 場所 | 既定 |
| --- | --- |
| 新しく開いた CE（[CityEditorPage.ts](../../src/city-editor/components/CityEditorPage.ts) の `generateSettings`） | `facilityLayout: "population"`（Building generation は `medieval-facilities`）、`plotFabric: "burgage"` |
| メッシュなしの生成パネル（[VectorGenerationPanel.ts](../../src/city-editor/components/vector/VectorGenerationPanel.ts)） | Plot pattern の選択を加えた。エディターの設定がないときは `medieval-facilities` と `burgage` |
| 保存された文書・共有リンク | 設定に `plotFabric` がなければ `compact`。保存済みの都市の結果は変わらない |

ほかに既定を変えた設定はない。今の既定（川 1 本が町を通る、小さな都市の施設、壁あり）は、区画・施設・川沿いの業種をまとめて確かめられるため、そのままにした。

#### 実装

| ファイル | 内容 |
| --- | --- |
| [generators/burgage/perimeterCell.ts](../../src/city-editor/generators/burgage/perimeterCell.ts) | CE の街区 1 つを区画にする。辺ごとの後退（compact と同じく小路の半幅以上、近くの街路の半幅）、凹んだ街区を 15° より鋭い角で凸に切る処理、区画の正面の家（奥行き 8〜12 m、区画の半分まで）、小路を街路の中心線まで伸ばす処理 |
| [perimeter.ts](../../src/city-editor/generators/vector/generation/perimeter.ts) | `PerimeterPlanContext.burgage`（型・壁の環・高地の浅い区画）。街区の大きさを区画の奥行きから決める（`burgageStreetCellMeters`）。`computeBurgageCell`。fabric の街区に `plots` を保存。アルゴリズムの版を `vectorUrbanAlgorithm` で決める |
| [urbanState.ts](../../src/city-editor/generators/vector/generation/urbanState.ts) | `vector-urban-v19`。`burgage` だけが v19 で、`compact` は v18 のまま |
| [urbanSizing.ts](../../src/city-editor/generators/vector/generation/urbanSizing.ts)、[editorInput.ts](../../src/city-editor/generators/vector/generation/editorInput.ts)、[urban.ts](../../src/city-editor/generators/vector/generation/urban.ts) | 土地の倍率（§6） |
| [validation/fabric.ts](../../src/city-editor/generators/vector/validation/fabric.ts)、[validation/urban.ts](../../src/city-editor/generators/vector/validation/urban.ts)、[share.ts](../../src/city-editor/services/io/vector/share.ts)、[hash.ts](../../src/city-editor/generators/vector/fabric/hash.ts) | `plots`・`plotFabric`・v19 の検証と、内容のハッシュ。`plots` がない街区のハッシュは変わらない |

`compact` の出力を守るため、次の 3 か所は `burgage` か、今まで例外で止まっていた場合にだけ働く。

- [facilityLots.ts](../../src/city-editor/generators/vector/generation/facilityLots.ts): `burgage` では、施設の下になった家の残りを施設の敷地に合わせない。合わせると、細い角や棘ができ、正面の街路にまで届いた。残りは裏庭になる。B3 で区画単位の配置に置き換える。
- [perimeter.ts](../../src/city-editor/generators/vector/generation/perimeter.ts) `vectorPerimeterResidual`: 残りの土地（表示だけに使う）の切り抜きが失敗した区画は、残りの土地なしにする。
- [forest.ts](../../src/city-editor/generators/vector/generation/forest.ts) `vectorCountryside`: 切り抜きが失敗したら、建物の敷地を除かずに田園を作り直す。それも失敗したら田園なし。入力の並びは前と同じにした。

#### 計測

壁あり（多角形）・川なしの合成入力（シード `b2-probe`）。ほかに、川ありの 3 シード（`s1`〜`s3`、2,000・8,000 人）でも、全件で未収容 0 を確かめた。

| 型（地域の型） | 人口・方式 | 生成時間 | 家 | 区画 | 必要戸数 | 壁の中／外の戸数 | 未収容 | 施設 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `english-burgage`（atlantic） | 1,000・medieval | 0.5 秒 | 149 | 175 | 223 | 197／26 | 0 | – |
| 同 | 2,000・facilities | 2.3 秒 | 178 | 410 | 445 | 451／0 | 0 | 94/100 |
| 同 | 5,000・facilities | 3.1 秒 | 465 | 1,003 | 1,112 | 1,114／0 | 0 | 241/255 |
| `hofstatt`（northern-urban） | 1,000・medieval | 0.5 秒 | 79 | 120 | 223 | 224／0 | 0 | – |
| 同 | 2,000・facilities | 1.9 秒 | 166 | 345 | 445 | 446／0 | 0 | 94/100 |
| 同 | 5,000・facilities | 3.1 秒 | 344 | 912 | 1,112 | 1,112／0 | 0 | 241/255 |
| `binaire`（mediterranean） | 1,000・medieval | 0.4 秒 | 117 | 189 | 223 | 224／0 | 0 | – |
| 同 | 2,000・facilities | 3.4 秒 | 218 | 563 | 445 | 445／0 | 0 | 93/100 |
| 同 | 5,000・facilities | 7.6 秒 | 594 | 1,240 | 1,112 | 1,112／0 | 0 | 236/255 |
| `compact`（比較） | 2,000・facilities | 3.3〜3.8 秒 | 369 | – | 445 | 445／14 | 0 | 94/100 |
| `compact`（比較） | 5,000・facilities | 6.0 秒 | – | – | 1,112 | 1,112／13 | 0 | 239/255 |

- `compact` の固定入力（1,000 人 medieval・2,000 人 facilities）の直列化文書の SHA-256 の先頭 16 桁は、変更前後で同じだった（`5e13d2db3d1e8823`、`5b8b8adac3dec72c`）。
- 生成時間は、どの型も `compact` の 1.5 倍以内だった（`binaire` の 5,000 人が最大で約 1.3 倍）。
- 土地の倍率を `english-burgage` で 2〜4 と変えて比べた。2 では未収容が出た。4 では 1,000 人の町で区画の 4 割に家が建たなかった。そこで 3 にした。`hofstatt` は 3 で 5,000 人に未収容 9 が出たので、3.5 にした。

#### 残った課題

- **空いた区画**: 施設のある町では、家も施設もない区画が多い（`hofstatt` の 5,000 人で区画 912 に家 344・施設 241）。施設の土地にかけた倍率が大きすぎる可能性がある。B3 で施設が区画を何筆使うかが決まってから、倍率を計り直す。中世の町に空いた区画があったこと自体は史料に合う（R7）。
- **施設の置き方**: B2 では、今の `placeFacilitiesOnLots` が家の正面の帯を「区画」として使う。施設の奥は裏庭の上にはみ出し、区画の線に揃わない。B3 で置き換える。
- **`binaire` の venelle**: 保存も描画もしていない（家の裏が中央の路地に面していることが見えない）。B4 で描く。
- **district の記録の `parameters`**: `burgage` でも `lotArea: 80`・`streetCellMeters: 50` のまま保存している。読み込みや描画には使っていない。
- **切り抜きの失敗への逃げ道**: 上の 2 か所は、問題を隠す方向の処理である。B4 で区画と裏庭を描くときに、どの形で失敗するかを調べ直す。

#### テスト

- 追加: [burgagePlots.test.ts](../../src/city-editor/generators/vector/generation/burgagePlots.test.ts)。`burgage` の町で、v19 になること、全員が収容されること、家が区画の正面に建つこと、保存と読み込みで fabric が変わらないこと、`compact` が v18 のままで区画を持たないことを確かめる。
- 実行して成功: burgage（2 ファイル）、architecture、perimeter、facilityLots、urban、forest、landUse、validation/fabric、validation/document、documentCodec、share、VectorGenerationPanel、VectorCitySettingsPanel、generationFacilities、market、suburbs。`scripts/lint-architecture.ts` と `tsc --noEmit` も成功した。
- [renderers/svg.test.ts](../../src/city-editor/renderers/svg.test.ts) の「draws a Tiny church larger than a house plot…」は失敗した。変更前の状態でも同じく失敗するので、今回の変更とは関係ない。


### 8.3 B3 の記録（2026-11-18）

#### 実装

[facilityPlots.ts](../../src/city-editor/generators/vector/generation/facilityPlots.ts) の `placeFacilitiesOnPlots` を作った。`plotFabric` が `burgage` のときは、[urban.ts](../../src/city-editor/generators/vector/generation/urban.ts) がこちらを使う。`compact` は今までどおり `placeFacilitiesOnLots` を使う。

- **列**: 同じ街区で、同じ通りに面し、正面の端どうしが 0.6 m 以内で接する区画を 1 つの列にする。`binaire` の頭の家 2 つ（venelle 0.4 m をはさむ）も 1 つの列になる。横の小路で切れた列は別の列になる。
- **施設の区画**: 種と同じ列で隣り合う区画を、少ない筆数から試す（最大 3 筆、ギルドホール・宿屋は 4 筆）。建物は区画を合わせた正面の中央に、正面から 0.05 m 下げて置く。敷地は区画を合わせたものそのもので、裏庭もその施設のものになる。
- **上限**: 1 つの列で施設が使えるのは半分まで（`binaire` の頭の 2 つは両方を使える）。1 つの街区で施設が使えるのは区画の半分まで。上限に達した列と街区は種にしない。
- **`binaire`**: 施設は頭の家に置く。頭の家より深い施設は、その後ろの家（同じ街区の両側）も合わせて取る。Figeac の Hôtel de la Monnaie のような、2 区画分の頭の家に当たる。
- **順序**: 商業は中心に近い区画から、川を使う業種は川に近い区画から、ほかは「乱数 0.4・中心からの距離 0.6」の順に置く。家と同じ順にしたのは、家が必要にならなかった街区に工房だけが残らないようにするため。施設のある列が先に選ばれ、工房が並ぶ（今の `placeFacilitiesOnLots` と同じ考え方）。
- **置けなかった理由**: 幅か奥行きが足りる並びが 1 つもなかった施設には、新しい理由 `plot`（「幅と奥行きの足りる短冊形区画の並びがない」）を付ける。型・検証・英日の文言に加えた。
- 共通の部品（線の索引、施設が避ける土地、なめし場の列の接続）を [facilityLots.ts](../../src/city-editor/generators/vector/generation/facilityLots.ts) から `facilityLines`・`facilityLand`・`connectTanneryRow` として切り出した。`compact` の出力は変わらない（SHA-256 の先頭 16 桁 `5e13d2db3d1e8823`・`5b8b8adac3dec72c` が一致）。
- 施設の土地の倍率を、家の倍率とは別の表 `BURGAGE_FACILITY_LAND_FACTOR` にした。値は家と同じ（`english-burgage` 3、`hofstatt` 3.5）。施設を 1.5〜2 に下げると、2,000 人の町で置けた施設が 89 から 66〜70 に減ったので、下げなかった。

#### 計測

壁あり・川なし、シード `b2-probe`。「1 施設の筆数」は施設の敷地に重心が入る区画の数。「施設だけの街区」は、施設があって家がない街区。

| 型 | 人口 | 施設 | 1 施設の筆数（1／2／3／4） | 施設だけの街区（壁の中／外） | 家も施設もない区画 | 未収容 |
| --- | --- | --- | --- | --- | --- | --- |
| `english-burgage` | 2,000 | 89/100 | 41／37／11／0 | 0／7 | 119／464 | 0 |
| 同 | 5,000 | 239/255 | 106／108／25／0 | 0／14 | 199／1,059 | 0 |
| `hofstatt` | 2,000 | 94/100 | 64／26／4／0 | 0／6 | 96／388 | 0 |
| 同 | 5,000 | 229/255 | 158／65／6／0 | 0／13 | 290／939 | 0 |
| `binaire` | 2,000 | 83/100 | 34／37／0／12 | 0／5 | 260／688 | 0 |
| 同 | 5,000 | 187/255 | 57／111／0／19 | 0／14 | 332／1,494 | 0 |
| `compact`（比較） | 2,000／5,000 | 94/100／239/255 | – | – | – | 0 |

川ありの 3 シード（`english-burgage`、2,000・8,000 人）は、8,000 人では施設が 368〜372/394 だった。2,000 人では 98・73・57/100 と幅があり、1 件で未収容 3 戸が出た。

- **B3 の完了条件との対応**: `english-burgage`・`hofstatt` では、すべての施設が 1〜3 筆だった。`binaire` では 86〜90% が 1〜2 筆で、残りは 4 筆（頭 2 つと、その後ろの家 2 軒）。壁の中の施設だけの街区は、どの型でも 0。置けた施設の数は、`english-burgage` と `hofstatt` で `compact` の 9 割以上だった（`binaire` は 7〜8 割で、条件を満たさない）。
- **壁の外の施設だけの街区**: どれも壁の外の街区で、郊外の業種（`zone: "outskirts"`）が街道沿いの区画に建ち、家は壁の中で足りたために建たなかったものである。R8（外側に出す業種）には合うが、見た目は「道・施設・道」に近い。壁の外の施設の街区にも家を建てるかは、B5 で決める。
- **`binaire` の置けた施設は 7 割**: 施設を置けるのは街区の頭だけで、頭の数が足りない。横の路地に面した家（奥行き 6〜7.5 m）に Workhome は入らない。路地をはさんだ 2 軒を 1 つの区画にするかは、§10 に加えた。
- **置けない施設**: 縄（rope walk）は長すぎて区画に入らない。鍛冶・蠟燭・陶器などの郊外の業種も、壁の外の浅い区画には入らないことがある。
- **川のある小さな町**: 区画そのものが足りなくなる（川ありのシード `s1` で、区画 340 に家 211・施設 73、空いた区画 2）。都市の大きさの見積もりが川の分を十分に見ていない。B5 の区画の分割と合わせて見直す。

#### テスト

- [burgagePlots.test.ts](../../src/city-editor/generators/vector/generation/burgagePlots.test.ts) に 1 件加えた: 2,000 人の施設のある町で、施設の敷地が 1〜4 筆の区画そのもの（面積が区画の和と 2% 以内で一致）であること、壁の中で施設のある街区には家もあること、全員が収容されること、施設の 8 割以上が置けること。
- [VectorGenerationPanel.test.ts](../../src/city-editor/components/vector/VectorGenerationPanel.test.ts) の urban の段階のテストは、`compact` の戸数を確かめるテストなので、Plot pattern を `compact` に選ぶ操作を加えた（パネルが `burgage` で開くようになったため）。
- 実行して成功: burgage（2 ファイル）、burgagePlots、architecture、perimeter、facilityLots、urban、tannersRow、guilds、parks、validation/fabric、validation/document、share、VectorGenerationPanel。`tsc --noEmit` と `scripts/lint-architecture.ts` も成功した。


### 8.4 B4 の記録（2026-11-18）

#### 実装

- **描く面**: [renderData.ts](../../src/city-editor/renderers/vector/renderData.ts) の `burgagePlotSurfaces` が、区画のある街区 1 つから次の面を作る。どれも `kind: "feature"`・`featureKind: "burgage"` で、2D の SVG と 3D の両方が、今の面の描き方のまま描く。
  - `yard`: 街区の区画をすべて合わせた地面（色 `#b5b27f`）。家の建たない区画は、そのまま菜園・空き地に見える。
  - `plot-wall`: 区画の境目と区画の奥の線に沿った、幅 0.25 m・高さ 1.1 m の塀（色 `#8f7d63`）。区画の正面（家が閉じる側）には立てない。重なる辺は 1 回だけ描く。
  - `venelle`: `binaire` の街区の中央の路地（幅 0.4 m、色 `#6f6658`）。`binaire` の区画は家そのものなので、裏庭と塀は描かない。
- **描く順序**: 裏庭と塀は、その街区の家より前に置く。2D では家が上に描かれる。
- **3D の数を抑える**: 裏庭と塀は街区ごとに 1 つの多角形に合わせる。3D は多角形 1 つを 1 つのメッシュにするため、区画や塀の 1 本ごとにメッシュにしない。合わせられなかった街区は、裏庭は区画のまま描き、塀は描かずに警告（`burgage-yards:`・`burgage-walls:`）を残す。
- **venelle の保存**: B2 では venelle を捨てていた。fabric の街区の `plots.venelles` に、小路と同じ形で保存するようにした。家の扉が向く小路（`lanes`）には入れない。ハッシュと検証も合わせた。
- **区画を描く段階**: Blocks and lanes・Facilities・Housing の各段階で描く（家は Housing だけ）。

#### B2 の切り抜きの逃げ道の調べ直し

B2 で入れた 2 つの逃げ道（残りの土地、田園）が、B3 の後にどれだけ働くかを数えた。3 つの型 × 3 つの人口と、川ありの 3 シード × 2 つの人口（計 15 回）で、働いたのは残りの土地の 1 回だけだった。

- 原因: 楔形の区画の辺と、その上の家の辺が、数 mm ずれて重なっていた。家はセンチメートルに丸めて保存されるが、区画（残りの土地の計算に使う街区の区画）は丸めていなかった。
- 対策: 区画を、家と同じくセンチメートルに丸めて記録するようにした。その後の 15 回では、どちらの逃げ道も 1 回も働かなかった。逃げ道は、念のための守りとして残した。

#### 計測

2,000 人・施設あり・壁あり・川なし（シード `burgage-b4`）。描画データの作成は `vectorRenderData`、3D は `createVectorScene` の時間。

| 型 | 描画データ | 3D の作成（町全体） | 3D のメッシュ（町全体／うち区画） | 区画の頂点数 | 警告 |
| --- | --- | --- | --- | --- | --- |
| `english-burgage` | 66 ms | 2.8 秒 | 2,147／80 | 34,837 | なし |
| `hofstatt` | 49 ms | 2.2 秒 | 974／99 | 33,575 | なし |
| `binaire` | 45 ms | 2.1 秒 | 2,094／145 | 580 | なし |

区画のメッシュは、町全体のメッシュの 4〜10% だった。生成の結果（家・施設・未収容）は B3 から変わらず、`compact` の SHA-256 も変わらなかった。

#### 残したこと

- 空いた区画の木と、菜園の畝・作物は描いていない。今は裏庭の色だけで見せている。B5 で、区画の奥の付属屋とあわせて扱う。
- 塀は区画ごとに石垣・板塀・生垣を分けていない（色 1 つ）。地域の型と時代で分けるかは、§10 に残す。

#### テスト

- 追加: [burgagePlots3d.test.ts](../../src/city-editor/renderers/vector/burgagePlots3d.test.ts)。`english-burgage` の町で、区画のある街区ごとに裏庭と塀が 1 つずつあり、家より先に並ぶこと、警告がないこと、区画のメッシュが区画の数の半分より少ないことを確かめる。`binaire` の町で、venelle が描かれ、裏庭が描かれないことを確かめる。
- 実行して成功: burgage（2 ファイル）、burgagePlots、burgagePlots3d、renderData、sceneLayers、picking、precision、validation/fabric、validation/document、documentCodec、share、perimeter、facilityLots、VectorGenerationPanel、architecture。`tsc --noEmit` と `scripts/lint-architecture.ts` も成功した。
- [houseLod3d.test.ts](../../src/city-editor/renderers/vector/houseLod3d.test.ts) の 1 件は失敗した。B2 より前のコミット（`b7b2c8e33`）でも同じく失敗するので、今回の変更とは関係ない。

## 9. 受入の指標

生成ごとに次の値を報告（`VectorUrbanReport`）に出し、`compact` と比べる。

- 施設だけの街区の数と割合（街区規模の施設を除く）
- 施設 1 つあたりの区画の数の分布
- 区画の間口・奥行き・縦横比の分布（型ごと）
- 未収容の住宅、置けなかった施設とその理由
- 市域の面積、壁の長さ、生成時間、文書の長さ

## 10. 未決事項

- 区画の型を地域の型から自動で選ぶだけでよいか、ユーザーが選べるようにするか。
- `burgage` を新しい都市の既定にするか。本書では既定を `compact` のままにする。
- 裏小路を道路グラフの道として持つか、fabric の小路として持つか。今の小路と同じく fabric の小路とする案が有力。
- 区画の奥の付属屋（B5）を、MV のモデルにするか、CE の簡単な箱にするか。
- `binaire` の横の路地に面した、路地をはさむ 2 軒（奥行き 6〜7.5 m ずつ）を 1 つの区画にして、小さな工房を置けるようにするか（B3 の計測で、`binaire` の施設の 3 割が置けなかった）。
- 区画の塀を、地域の型と時代で石垣・板塀・生垣に分けるか（B4 では色 1 つ）。
- 橋は増やさない。区画の配置で新しい橋は作らないので、[bridgeSkewPolicy.ts](../../src/utils/bridgeSkewPolicy.ts) の判定には影響しない。ただし、川に沿う区画の奥の端は川岸で止め、川の上に区画を作らない。
