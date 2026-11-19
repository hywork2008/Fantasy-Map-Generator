# 町の外の作業場の大きさを見直す

作成: 2026-11-19
状態: 調査（§3）と方針（§5）。S1（綱打ち場を門から出る道の脇に置く、§8.1。道に面した区画の裏へ移した、§8.2）と S2（鍛冶の Opus 版、§8.3）を済ませた。次は S3。
関連: [ce-town-trade-rear-works.md](ce-town-trade-rear-works.md) §2（町の外は対象外とした）・§9、[opus-ropewalk.md](opus-ropewalk.md)

## 1. 目的

CE の施設のある町では、臭い・火・広い土地を要る業種を町の外（`zone: "outskirts"`）に置く。大きさの多くは史料ではなく、最初の MV の習作の外形から来ている。史料と照らし、変える所を決める。

## 2. 今の実装（大航海時代、`atlantic`、港なし）

| 施設（モデル） | 作者 | CE の外形 | 2,000 人 | 5,000 人 | 10,000 人 |
| --- | --- | --- | --- | --- | --- |
| 水を使う皮なめし（`dedicated-wet-tannery`） | Codex | 18 × 16 m | 6 | 14 | 28 |
| 樽屋（`dedicated-cooperage`） | Codex | 16 × 13 m | 4 | 10 | 20 |
| 鍛冶（`dedicated-smithy`） | Codex | 11.7 × 10.5 m | 2 | 6 | 12 |
| 石灰・煉瓦・瓦の窯場（`dedicated-lime-tile-yard`） | Opus | 20 × 20 m | 1 | 4 | 8 |
| 陶工（`potters-workshop`） | Codex | 11.3 × 7.5 m | 1 | 4 | 8 |
| 馬の粉ひき（`dedicated-horse-mill`） | — | 12.6 × 12 m | 1 | 3 | 7 |
| 綱打ち場（`dedicated-ropewalk`） | Opus | 6 × 54 m | 0 | 2 | 4 |
| ろうそく（`dedicated-chandlery`、区画の町では R2 の組） | Opus | 12 × 10 m | 1 | 4 | 8 |

（数は [populationFacilityRequests.ts](../../src/city-editor/generators/populationFacilityRequests.ts) の要求。皮なめしは実務者 4 人に 1 つ、ほかは業種の作業場の数。）

- 種 `workhome-w3`（壁あり・川なし、5,000 人）では、綱打ち場の要求 2 つはどちらも置けない（`compact` は理由 `district`、`burgage-dense` は `plot`）。54 m の細長い外形が、町の外の区画にも空き地にも入らない。
- 皮なめしは川べりの皮なめしの列（[ce-meshless-tanners-row.md](ce-meshless-tanners-row.md)）に置く。川のない町では置けない。

## 3. 史料

| 施設 | 資料 | 確かめたこと | 今の外形と比べて |
| --- | --- | --- | --- |
| 鍛冶 | Newington（Oxfordshire）の 13 世紀の鍛冶場（[SOAG Bulletin 65](https://www.soagarch.org.uk/docs/projectsarchive/newington/bulletinissue65_p35-39.pdf)、検索結果の抜粋） | 石の土台の建物 8 × 5 m と、燃料置き場とみられる小さな付属屋。中に石の金床の台、直角に並ぶ炉 2 つ、水槽。近くの掘立柱の建物 13.5 × 7 m も鍛冶場らしい（未確定） | 建物は 8 × 5 m。今の 11.7 × 10.5 m は作業の庭を含む外形で、建物だけなら大きすぎない。庭を含めた大きさの根拠はない |
| 鍛冶 | スコットランドの中世の鍛冶場（[ScARF 9.5.1](https://scarf.scot/regional/higharf/medieval/9-5-craft-and-industry/9-5-1-metalworking/)） | 発掘例は少ない。Cromarty の鍛冶場は柱穴と壁土が残り、屋根があり、前が開いていたとみられる | 前の開いた作業場の形 |
| 皮なめし | Canterbury, 46 North Lane（[Kent HER](https://heritage.kent.gov.uk/Monument/MKE5252)） | 15 世紀の建て替えに伴い、開いた庭に石灰の槽 8 つ。17 世紀末に板張りの大きな長方形のなめし槽 | 槽は屋外の庭に並ぶ。槽の数・大きさの記録はまだ読んでいない |
| 皮なめし | Northampton, The Green／Green Street（[Northamptonshire HER](https://her.northamptonshire.gov.uk/Monument/MNN14962)） | なめし場は円形と長方形の槽からなる。Green Street で 15 世紀の円形の槽 6 つ | 同上 |
| 皮なめし | Fountains Abbey のなめし場（[Bradford 大学](https://bradford.ac.uk/news/archive/2021/fountains-abbey.php)） | 幅 16 m の石造の建物 2 棟（1 棟は長さ 32 m 以上）と、周りの槽・水槽。修道院の大きななめし場 | 町の皮なめし 1 軒の比較には使えない（修道院の作業場をまとめたもの） |
| 瓦の窯 | 中世の瓦窯の発掘（Norton Priory・Danbury・Lacock・Penn、[Medieval Ceramics 1978](https://archaeologydataservice.ac.uk/catalogue/adsdata/arch-5456-1/dissemination/1978/MedievalCeramics_1978-2_31-42.pdf) ほか、検索結果の抜粋） | 窯の内のり 1.1 × 0.9 m（Norton Priory）、2.2 × 2.0 m（Danbury）、3.0 × 1.85 m（Lacock）、1.65 × 3.5 m 以上（Penn、15〜17 世紀） | 窯そのものは小さい。20 × 20 m は、窯・乾燥小屋・粘土置き場を含む庭の外形で、庭の大きさの根拠はない。石灰窯の寸法は見つけていない |
| 瓦の窯 | Tyler Hill（Kent）の窯（[Kent HER](https://heritage.kent.gov.uk/Monument/MKE5567)） | 幅約 2.8 m（9 ft 2 in）、長さ 3〜4.3 m（10〜14 ft）、1250〜1350 年頃 | 同上 |
| 陶工の窯 | Campus Galli の復元窯（中世の形の実験）、Audlem（Cheshire）の中世の窯（検索結果の抜粋） | 焼成室は直径約 1 m・高さ 0.8 m（復元）。Audlem の円形の遺構は直径約 1.1 m（3 ft 9 in） | 窯は小さい。工房の建物の寸法は見つけていない |
| 馬の粉ひき | Mills Archive の馬の車（[Downe](https://new.millsarchive.org/mills/index/10987) ほか、検索結果の抜粋） | Downe の馬の車は、馬が直径 4.07 m の輪を歩く（年代不明、八角形の建物）。馬の車の直径 13〜18 ft（4〜5.5 m）の例。英国の馬の粉ひきの多くは 17〜19 世紀 | 揚水の車の例で、粉ひきの例ではない。12.6 × 12 m の建物は、馬の歩く輪が 9 m 前後の粉ひきなら妥当だが、確かめていない |
| 樽屋 | 中世の樽屋の発掘例 | 建物の寸法のある発掘例は見つけていない（Perth で樽の板の出土 57 など） | 16 × 13 m の根拠なし |
| 綱打ち場 | [opus-ropewalk.md](opus-ropewalk.md) §2 | 実物は 180〜300 m。町の門の外のまっすぐな並木道（ハンブルク、17〜18 世紀） | モデルは 54 m に縮めた。それでも町の外に置けない |

## 4. 分かったこと

- 外形を史料で確かめられるのは、建物か窯の寸法だけ。作業の庭を含めた外形（今の CE の外形）の根拠になる資料は、どの業種でも見つけていない。
- 大きさを変える根拠が一番はっきりしているのは鍛冶（建物 8 × 5 m）。今の外形は庭を含めても大きめで、Newington の 8 × 5 m の建物と付属屋なら 10 × 8 m 前後に収まる。
- 窯の業種（瓦・石灰・陶工）は、窯そのものは小さい。外形は庭の広さで決まり、史料からは決められない。
- 問題として大きいのは大きさより置き方:
  - 綱打ち場は、今の町の外の区画・空き地に入らないので一度も置けない。史料では町の門の外の道に沿う（ハンブルク）か、町の堀・城壁に沿う細長い土地。
  - 皮なめし（5,000 人で 14）と樽屋（10）は数が多い。数は実務者の数から出ていて、大きさの見直しとは別に確かめる必要がある。

## 5. 方針（案）

| 段階 | 内容 | 依存 |
| --- | --- | --- |
| S1 | 綱打ち場を置けるようにする。町の門から出る道に沿う細長い土地（道の脇、外側の区画の裏）か、城壁の外の堀・斜面（glacis）に沿う帯に置く。外形 6 × 54 m は変えない | なし |
| S2 | 鍛冶を Opus 版で作り直す。Newington に合わせて建物 8 × 5 m・前の開いた作業場・付属の燃料小屋、外形 10 × 8 m 前後。CE の数・置き方は変えない | なし |
| S3 | 皮なめし・樽屋の施設 1 つあたりの実務者の数を確かめる（今は皮なめし 4 人、樽屋は作業場の数のまま） | なし |
| S4 | 瓦・石灰の窯場、陶工、馬の粉ひき、樽屋の外形は、根拠が見つかるまで今のままにする。資料（窯場の庭の発掘、馬の粉ひきの建物の記録）を探し続ける | なし |

## 6. 未決事項

- ~~S1 の綱打ち場の置き場所（道の脇か、城壁の外の帯か）。~~ 門から出る道の脇（2026-11-19 にユーザーが決めた）。道に面した所は旅籠などの商売の土地なので、その区画の裏に道と平行に置く（同日、§8.2）。
- ~~S2 で鍛冶の外形を小さくすると、町の外の施設の土地の見積もりと町の外の区画が変わる。版を上げる。~~ 版を上げた（§8.3）。
- 町の外の区画のある町（`burgage`）で、町の外の作業場を区画に置くか、空き地に置くか（今は区画に置く）。

## 7. 次の作業

S3: 皮なめし・樽屋の施設 1 つあたりの実務者の数を確かめる。

## 8. 実装の記録

### 8.1 S1（2026-11-19）

作ったもの:

- [ropewalks.ts](../../src/city-editor/generators/vector/generation/ropewalks.ts) の `reserveRopewalks`: 綱打ち場を、門から町の外へ出る街道（`vectorApproachBands` の帯）のまっすぐな所の脇に置く。
  - 街道に沿って 4 m ずつ始まりをずらし、54 m の間で街道が弦から 1 m 以内に収まる所を探す。左右どちらの脇でもよい。門に近い方から。
  - 始まりは、街道が城壁を出てから 12 m 以上、かつ城壁の前の空き地（glacis、帯の `clearance`）の外。敷地のどの点も城壁から `clearance` 以上離す。
  - 外形は街道の縁から 1.5 m 離し、長い辺を街道に沿わせる。頭（麻の小屋と戸）を門の側に向ける。
  - 敷地は外形の周り 0.3 m。街道・水・占有された土地・門の口・辻の円盤に重ならないこと。
  - 戸は街道に直接つなぐ（`accesses` の街道の点、`accessIndex` 0）。
  - 皮なめしの列と同じく、通りの計画の前に置き、その敷地を守る土地に加えて通りと区画をよけさせる。敷地は町の土地（`domain`）に加える。加えると形が崩れる敷地は諦め、その要求は今までどおり区画・空き地に置く。
- [urban.ts](../../src/city-editor/generators/vector/generation/urban.ts): 施設のある城壁の町で、新しく作る時だけ置く（編集の後は、残した綱打ち場はそのまま）。置いた綱打ち場は、町の持つ配置に最初から入る。
- 版: `compact` を v46、`burgage` を v47、`burgage-dense` を v48 にした。

結果（壁あり）:

| 町 | 綱打ち場 | 施設を置けた数 |
| --- | --- | --- |
| `compact` 5,000 人（川なし） | 0 → 2 | 229 → 231/245 |
| `burgage-dense` 5,000 人（川なし） | 0 → 2 | 237 → 239/253 |
| `burgage` 5,000 人（種 `r1`、川あり） | 0 → 2 | — → 161/254 |
| `burgage-dense` 10,000 人（川なし） | 0 → 4 | — → 482/510 |

- 5,000 人の町では、綱打ち場 2 つは同じ街道の両脇に並ぶ。10,000 人の町では 1 本の街道に 2 組。
- 3D で綱打ち場に警告（仮の箱・高さの不一致）は出ない。CE の 2D で、城壁の前の空き地の外から始まり、通りが綱打ち場をよけることを目視した。

確かめたこと:

- [burgagePlots.test.ts](../../src/city-editor/generators/vector/generation/burgagePlots.test.ts) に足した: `burgage-dense` 5,000 人の町で綱打ち場 2 つがすべて置かれ、戸が街道につながり、敷地が街道に重ならず、城壁から 10 m より離れていること。
- 関連テスト 9 ファイル（67 件）が成功した。

まだ扱っていないこと:

- 綱打ち場の外の脇（街道と反対の側）の土地は、今は区画や畑になりうる。並木（ハンブルクの Reeperbahn は並木道）は置いていない。
- 川のある町で、川べりの皮なめしの列と綱打ち場が同じ街道を取り合う時の順（今は皮なめしの列が先）。

### 8.2 綱打ち場を道に面した区画の裏へ（2026-11-19）

§8.1 の置き方は綱打ち場を街道の縁から 1.5 m に置き、門の前の街道の片側を 54 m にわたって塞いでいた。門の前の街道に面した所は、町を出入りする人を相手にする旅籠・店の土地で、そこを綱打ち場で潰すのは土地の無駄になる。

史料（[opus-ropewalk.md](opus-ropewalk.md) の調査と一般的な知識。この時点で改めて調べてはいない）:

- ハンブルクの Reeperbahn は道に沿って並んだが、場所はハンブルクとアルトナの間の城壁の外の空き地（Hamburger Berg）で、門の前の商売の土地ではない。
- 英国の綱の町 Bridport では、綱打ち場の多くは表通りの家の裏の細長い庭の中にあった。表は家と店のまま。
- 英国の多くの町に残る「Rope Walk」の通りは、城壁・堀に沿う帯や町外れの裏道など、ほかに使い道の少ない細長い土地にある。

変えたこと（[ropewalks.ts](../../src/city-editor/generators/vector/generation/ropewalks.ts)）:

- 綱打ち場を街道の縁から 24 m（`FRONT_ROW_METERS`、町の外の道沿いの区画は中心が道から 20 m 以内）離し、街道に面した区画の一列の裏に、街道と平行に置く。
- 頭（麻の小屋と戸）の門の側に幅 3 m の小道を取り、街道の縁から綱打ち場の向こう側まで敷地に含める。戸はこの小道の口で街道につなぐ。区画と通りは小道もよける。
- 版は §8.3 と合わせて上げた。

結果: `compact`・`burgage`・`burgage-dense` の 5,000 人の町（壁あり、川なし）で、綱打ち場は §8.1 と同じく 2 つとも置ける。`burgage-dense` 5,000 人の 2D の図で、綱打ち場と街道の間に町の外の作業場の区画が並ぶことを確かめた。

確かめたこと: [burgagePlots.test.ts](../../src/city-editor/generators/vector/generation/burgagePlots.test.ts) の綱打ち場のテストに、綱打ち場の建物が街道から 20 m より離れていることを足した。

まだ扱っていないこと:

- 裏に場所が取れない町で、城壁・堀に沿う帯に回す置き方（今は置けなければ今までどおり区画・空き地を探し、たいてい置けない）。
- 綱打ち場の外側（街道と反対の側）は畑のまま。

### 8.3 S2（2026-11-19）

作ったもの:

- [opusSmithy.ts](../../src/buildings/medieval/opusSmithy.ts) の `createOpusSmithy`: Newington（Oxfordshire）の 13 世紀の鍛冶場に合わせた鍛冶。外形 10 × 8 m（`OPUS_SMITHY`、[opusTradeProfiles.ts](../../src/buildings/medieval/opusTradeProfiles.ts)）。
  - 建物 8 × 5 m。石の土台の上に塗り壁の木の壁、石の板の屋根（火を使うので草葺きにしない）。前は柱 3 本で開き、庭に面する（Cromarty の前の開いた鍛冶場）。煙は棟の上の煙出しから出す（この時代の鍛冶場に煙突は無い）。
  - 中: 腰の高さの石の炉 2 つを直角に（奥の壁と西の妻壁）。それぞれにふいご。2 つの炉の間に石の台に載せた金床、隅に水槽（Newington の石の金床の台・炉 2 つ・水槽）。奥の壁に作業台と掛けた道具、東の妻壁に棒鉄。
  - 東の妻壁の外に板張りの燃料小屋（炭の山と薪）。妻壁の戸口から入り、庭の側も開く。
  - 庭: 鉱滓の山、水の樽、砥石。両脇に編み垣。前（道の側）が入口。
  - Low と High で壁・開口・道具の位置は同じ。High は木組みの柱と筋交い、燃えさし、鉄の削り屑の床、小さな道具を足す。
- [53-dedicated-smithiesModels.ts](../../src/buildings/medieval/53-dedicated-smithiesModels.ts): 鍛冶（`dedicated-smithy`）の主を Opus 版にし、`placementEnvelope` を 10 × 8 m にした。Codex の習作は選べるまま。蹄鉄の鍛冶（`dedicated-farrier`）は変えない。
- [adoption.ts](../../src/city3d/adoption.ts): CE は Opus 版を使う。
- [populationFacilityRequests.ts](../../src/city-editor/generators/populationFacilityRequests.ts): 鍛冶の入口を `OPUS_SMITHY.entrance`（外形の前の辺の中央）にした。数は変えない。
- [opusTradeKit.ts](../../src/buildings/medieval/opusTradeKit.ts) の `bellows`: 革の胴が筒先の側で太くなっていたのを、筒先の側で細くなるように直した（町の作業場・裏の作業場のふいごも同じく変わる。外形は変わらない）。
- 版: `compact` を v47、`burgage` を v48、`burgage-dense` を v49 にした（§8.2 と合わせて）。

結果（壁あり、川なし、5,000 人）:

| 町 | 鍛冶 | 施設を置けた数（前 → 後） |
| --- | --- | --- |
| `compact` | 6 / 6 | 231 → 231/245 |
| `burgage-dense` | 6 / 6 | 239 → 239/253 |
| `burgage` | 6 / 6 | 239 → 239/253 |

- 鍛冶 1 つの外形は 11.7 × 10.5 m（122.9 m²）から 10 × 8 m（80 m²）になった。町に 6 つで、町の外の土地を約 257 m² 使わなくなった。置けなかった 14 は、どれも川のない町の水を使う皮なめし（理由 `river`）で、前と同じ。
- 以前の鍛冶の外形で保存された CE の文書では、少し大きい敷地に Opus 版を描く。

確かめたこと:

- [opusSmithy.test.ts](../../src/buildings/medieval/opusSmithy.test.ts): 両方の段で 10 × 8 m に収まり、地面より下に出ず、高さが同じで、三角形の数が Low 3,000・High 9,000 以下。道の側の入口から開いた前を通って中まで、幅 1.2 m・高さ 1.9 m の通り道を何も塞がない。CE の置く外形と Opus 版の採用。
- MV と同じ組み立てを仮のページで描き、前・中・後ろから目で見た。

