# 門ごとの物流に応じた商業区・職人区・門前施設の配置 (Approach Commerce Quarters) 設計

2026-10-17 設計。未実装。

## 状態

- 設計のみ。実装は §9 の段階計画に従う。
- 前提: [approach-traffic-observatory.md](approach-traffic-observatory.md)(出入り口台帳 `approachTraffic`、観測 API、CE プローブ、O4 の `approachGrowthSource`)。
- 調査用に追加した API: `GET /api/sim/channels/:id/observe/goods`(品目カタログと貨物区分)と `observe/gates[?burg=b]`(門ごとの占有率・流入比・通過比・平均積載・貨物区分の積載枠と価値)。実装は `scripts/lib/observeViews.mts` の `goods()` / `gates()`。
- 計測の修正(§4.1): 市場内の出荷を経路付きで記録、台帳に品目別の価値 `goodsValue`。`npm run observe -- run` は 1 年ずつ進めるようにした(大きな地図で HTTP がタイムアウトしたため)。

## 1. 目的

FMG の経済シミュレーションで「どの門をどんな物がどちら向きに通るか」が分かるようになった。これを CE に渡し、

1. 物流の多い門から市場までの通りに商人の家・市場・宿を寄せる。
2. 荷車・家畜・馬を扱う施設(荷馬車の溜まり場、宿の中庭、家畜市、資材置き場)を、その荷が通る門の付近に十分な広さで置く。
3. 職人区を、原料が入る門・製品が出る門・水・悪臭の規則に従って置く。

これにより、現状のほぼ無作為な区割りを、史料に裏付けのある「流通に引かれた」区割りに置き換える。地図生成直後(台帳が空)にも使えるように、交通量の事前推定(§5)を併せて設計する。

### 非目的

- 経済式の調整、交易ルートの距離モデルの変更。
- CE の街路網生成アルゴリズム自体の変更(区の割り当てと施設配置のみを変える)。
- 城下町型・イスラーム都市型の街路形態(枡形・袋小路など)の新規生成。§3.4 の知見は区割り規則の文化別差分として扱う。

## 2. 現状の CE(コード確認結果)

| 対象 | 現状 | 場所 |
| :--- | :--- | :--- |
| 内側の区割り | 21 職人・5 スラム・1〜4 商人・2 上流・2〜3 市場… の混合を **Fisher–Yates でシャッフル**し、`rateLocation` で場所を選ぶ。職人(`craftsmen`)は `null` = **完全に無作為**。商人は「中心に近い」だけ。 | `src/city-editor/generators/wards.ts` `fillInner` / `rateLocation` |
| 職種別の職人区 | 経済プロファイルがあれば職人スロットの職種配分は実数に従うが、**場所は無作為**。 | `economicWards.ts` `craftDomainsFor` |
| 門区(gate ward) | 門に接するセルを確率 (`GATE_CHANCE_*`, `OUTER_GATE_CHANCE`) で門区にする。交通量と無関係。城外の門区は 12% 商人・残り職人。 | `wards.ts` 手順 4・6 |
| 門前宿 | 路線の `traffic` 最大の門に置く(`busiestGroup`)。**urban morphology の都市では descriptor が `traffic` と `economy` を落とすため置かれない**。 | `gateInnPlacement.ts`、`burgSiteDescriptor.ts` |
| ギルドの資材置き場(timberYard 等) | 町の外の空き地に置く。どの門かは問わない。 | `guildFacilityPlacement.ts` |
| 郊外の帯 | 隣接都市人口と道路種別(O4 で交通量に切り替え可能)。 | `urbanGrowth.ts` |

結論: 門と区割りの関係を決めているのは「門に接するかどうか」と乱数だけで、物流の情報は区割りに入っていない。

## 3. 史料調査の要点

信頼度の目安: ◎ 学術・一次史料に基づく、○ 学術機関・自治体の解説、△ 一般向け解説。

### 3.1 欧州中世都市

- **門の外の宿と需要**(◎/○ 後期中世ロンドン): 門外の地区は交通量が多く宿泊需要が大きかった。Bishopsgate 外の George・Harp、Aldgate 外の Axe など、門のすぐ外に宿が確認でき、Axe は醸造所とパン焼き所を併設していた。→ **宿は門の外側、交通の多い門に集まり、醸造・製パンと複合する。**
- **悪臭・汚水の職種は外へ・下流へ**(◎ Jørgensen の York 河川汚染研究、○ Coventry・London の研究): 皮なめし・染色・獣脂ろうそく(chandler)・皮革加工(tawyer)は城外へ移るよう促され、皮なめしは川沿い・集落の縁に置かれた。York では川向こうの Tanner's Row に移され、皮革とと畜は水路汚染の規制対象だった。
- **家畜・馬の市は門の外**(◎ Victoria County History: Oxford): 13 世紀 Oxford では北門の外の通りが Horsemonger Street と呼ばれ馬が売られ、家畜市も北門の外(Northgate hundred)にあった可能性が高い。穀物商は北門近くの Northgate Street の一区画に集まり、干し草はその通りの中ほどで売られた。→ **門から市場へ向かう通りが「穀物→干し草→…」と品目別に区切られて市になる。**
- **穀物市・家畜市は町の縁**(○ Sandwich): 城壁内の西側に穀物市があり、穀物と家畜が取引され、後に家畜市と改名された。
- **市場の形**(△ Swansea ほか): 漏斗形・三角形の市場が門へ向かって開き教会の近くに置かれる形が中世の市場の特徴とされる。市は広場・三角地・広い通り・市場会館で開かれた。
- **中心の小売・高価品**(◎ Keene の Cheapside 研究): Cheapside は建物密度・地価が高く中間層が住む小売の中心で、遠距離大口取引の地区(Walbrook)と対比される。金細工・絹物商の集中は近世の規制によるもので、中世の厳密な区割りの証拠ではない。→ **高価な小売は中心の市場通り、大口の取引は別の地区。**
- **商人の家は倉庫を兼ねる**(○ Lübeck の Dielenhaus): 港から荷車で運んだ品を通りに面した広間(Diele)に入れ、売れ残りは巻き上げ機で上階の倉庫へ上げた。地下室も倉庫に使った。商人も職人も同じ家型を使った。→ **商人の家は「荷車が横付けできる間口と奥行き・上階倉庫」を持つ大きな家。** 港・荷揚げ場から市場への通りに並ぶ。
- **宿の中庭と荷車**(○ London Museum、Wikipedia の Coaching inn 他、主に近世): 通りから門口(夜は閉鎖)を通って回廊付きの中庭、その奥に厩舎の中庭。中庭は馬車が入り、向きを変え、荷を積み降ろす場所で、本道から離して馬・荷・客を扱う。厩舎は十数頭から 100 頭規模まで幅がある。中庭付きの大型宿は 15 世紀初頭には現れ始めたとされる。
- **荷馬車の宿は入口と出口が別**(△ 独語圏の解説): 本街道沿いの大きな宿は、荷馬車が向きを変えなくて済むよう入口と出口を分けていた。Stuttgart の Leonhardsvorstadt には商人・運送業者・宿屋が住み着いた。閉門後に着いた者は城外の宿に泊まった。
- **郊外の形**(◎ Conzen 学派): 城壁は開発の固定線となり、その外側に内側の縁辺帯(fringe belt)が生じる。幹線道路沿いの帯状の郊外は Alnwick では 19 世紀の現象で、中世の事例の一般化はできない。→ **郊外の「帯」は道路沿いに伸びるが、中世の城外は宿・家畜市・悪臭職種・資材置き場といった土地を食う用途が主。**

### 3.2 イスラーム圏の都市(古典的モデルとその批判)

- (○ 学術論文・大学講義資料) 市場は大モスクを中心に階層化され、宗教用品・書籍が最も近く、布市場(カイサリーヤ)が中心近く、鍛冶は外側、染色・皮なめし・陶工は外縁の区画、陶工はほぼ城外。**門に近づくとキャラバンの場所、次に近郊からの食料の売り手が来る。**
- (○ Aleppo の諸資料) 15 世紀以降、中心の市場地区は官吏が建てた大型ハーン(隊商宿兼取引所)を取り込んで拡大した。ハーンは特定品目(布・綿・毛皮)の取引所でもあった。
- 注意: 「イスラーム都市」モデルは Damascus・Baghdad 中心の一般化として批判がある。CE では「遠距離交易の取引所は中心、隊商の荷解き・家畜は門」という二段構えの傾向として使い、文化設定(caravanserai を使う文化)に限る。

### 3.3 共通する規則(CE 用に抽出)

| # | 規則 | 根拠 |
| :--- | :--- | :--- |
| R1 | 交通の多い門の**外側**に宿(厩舎付き中庭)が集まる。夜間閉門のため城外宿が必要。 | London、独語圏 |
| R2 | 宿の中庭は荷車が入って向きを変えられる大きさ、または入口と出口が別。 | 宿の諸資料 |
| R3 | 家畜・馬の市は門の外、または門のすぐ内側の広い場所。 | Oxford、Sandwich、イスラーム圏 |
| R4 | 主要な門から中心の市場までの通りが市場通りになり、品目ごとに区切られる(門側が穀物・干し草など大口の農産物、中心側が小売・高価品)。 | Oxford、Cheapside、イスラーム圏 |
| R5 | 商人の家は市場通りと荷揚げ場(港・河岸)を結ぶ通りに並ぶ、間口の広い倉庫兼住宅。 | Lübeck、Cheapside |
| R6 | 悪臭・汚水の職種は城外・水辺・下流。 | York、Coventry、London、イスラーム圏 |
| R7 | 原料が重く嵩張る職種(鍛冶、大工、石工、陶工)は、その原料が入る門・資材置き場の近くか外縁。 | イスラーム圏(鍛冶は外側)、§4 の観測(鉱石・燃料は大口) |
| R8 | 遠距離の高価品の取引所(ハーン・商館)は中心、荷解きと家畜は門。 | Aleppo |
| R9 | 職種名が通り名・町名になる(区画は職種ごとにまとまる)。 | 英国・日本の城下町 |

### 3.4 日本の城下町・宿場町(文化別の参考)

- (○ 国総研・金沢市の研究報告) 町人地は職業別に集められ、鍛冶町・船場町など職種が町名になった。城へ向かう道を軸に町人地を並べる「縦町型」や、街道を城下に引き込み、その沿道に町人地を展開する町割がある。仙台では町人は奥州街道と大町通沿い、職人は町屋敷の裏や足軽屋敷の隣に置かれた。
- (○ 千葉市図書館資料ほか) 宿場は街道沿いに屋敷割りされ、問屋場・本陣・脇本陣は宿の中央、宿の両端に枡形を置いた。問屋場は人馬の継ぎ立てを差配した。
- → R4 の「街道=市場通り」は日本でも成り立つ。違いは **宿と人馬継ぎ(問屋場)が門の外ではなく町の中央** にあること。文化設定で R1 の位置を「門外」と「中央」に切り替えられるようにする(§6.5)。

## 4. 観測結果(調査用シミュレーション)

### 4.1 計測の修正(2026-10-17)

初回の集計では通過交通がほぼゼロ、高価品がほぼ見えなかった。原因は経済モデルではなく記録側にあった。

- 流量の大半は市場内の出荷(`MarketShipment`、半年で約 3,000 件)で、市場間のキャラバンは同期間に 1 件程度。出荷は所要日数を計るために道路上の経路を計画している(`retailInventory.ts`)が、経路を捨てていたため、台帳は「相手方向の門」で両端だけを推定していた。
- 修正: 出荷を **発送時に、所要日数を計った同じ経路で** 記録する(`recordShipmentApproaches(shipment, segments)`)。到着時に経路を引き直す方式は経路キャッシュの順序を変えてシミュレーションを変えたため採らなかった。修正後、golden の差分は `economy.approachTraffic` だけ(`simGoldenDiff` で確認)。
- 台帳に品目ごとの価値(`goodsValue`)を追加し、出荷にも価値を付けた(以前は 0)。

### 4.2 修正後の結果

baseline(province 3000 cells、seed 101–103、warmup 2 年 + 10 年)の最終時点に `observe/gates` を適用した。

| 指標 | 修正前 | 修正後 | 設計への含意 |
| :--- | :--- | :--- | :--- |
| 交通のある都市 / 2 門以上に 1% 超 | 590 / 373 | 607 / 488 | |
| 首位の門の占有率(中央値) | 0.78 | **0.54**(四分位 0.50–0.68) | 通過交通は入る門と出る門の両方に付くため、街道上の町は 2 門がほぼ半々になる。**「主門 1 つ」ではなく「通り抜ける軸(2 門の対)+ 端の流れ」** として扱う |
| 門ごとの通過比(中央値) | 0.00 | **0.93** | 流量の大半は通過交通。宿・厩舎・荷馬車の溜まり場の需要は通過交通で測れる |
| 通過比 >0.1 の門を持つ都市 | 10 / 126 | **415 / 488** | |
| 流入主体 / 流出主体の門 | — | 554 / 456(1,084 門中) | 供給門と出荷門の区別は残る |
| 貨物区分(積載枠) | 穀物 0.91、嵩物 0.07 | 穀物 0.91、嵩物 0.07、高価品 0.000 | 積載枠では高価品は見えない |
| 貨物区分(**価値**) | 記録なし | 穀物 0.84、嵩物 0.11、**高価品 0.024**、生鮮 0.008、家畜 0.005 | 高価品の判定は価値で行う |
| 高価品の価値が 1 つの門に集中する度合い(中央値) | — | **1.00**(186 都市) | 高価品は特定の 1 門からしか来ない。商館・ハーンをその門と中心を結ぶ通りに置ける |
| 首位と 2 位の門の価値構成の差(中央値) | 0.30(枠) | **0.41**、0.5 超は 155/399 | 4 割の都市で門ごとに荷の性格が明確に違う |

### 4.3 地図生成直後の推定

路線網と都市人口だけから首位の門を当てる推定を、10 年後の実測と比べた(3 地図、488 都市)。

| 推定 | 的中 |
| :--- | :--- |
| 重力モデル(到達都市の人口 / 道のり²) | 53% |
| 市場中心の都市を人口 / 道のりで加算 | 53% |
| 同じ市場の都市の人口(=通過する出荷) | 54% |
| 無作為 | 43% |

修正後は首位の門が半々になる町が多く、推定の優位は小さい(+10 ポイント)。生成直後は「どの道が街道の軸か」(通過)と「どの門の先に同じ市場の町が多いか」(端)を分けて推定し、Advance Time 後は台帳に切り替える(§5)。

### 4.4 経済モデル側の観測(このまま CE 設計の前提とする事項)

市場間の交易を、ゴールデン fixture(5 市場、互いに 450–1,300 km)で段階ごとに数えた。

| 段階 | 1 か月目 | 6 か月目 | 12 か月目 |
| :--- | :--- | :--- | :--- |
| 余剰市場→不足市場の組 | 91 | 103 | 164 |
| 価値密度による距離上限で除外(嵩物の長距離陸送は割に合わない) | 54 | 70 | 107 |
| 商人組織の到達範囲外で除外 | 32 | 31 | 52 |
| 成立 | 5 | 2 | 4 |

- 成立するのは宝石・香・琥珀など少数の高価品で、輸入側の在庫目標を一度満たすと止まる(継続的な消費が小さい)。市場間キャラバンは 1 年以内にほぼ出なくなる。
- 市場間 24〜94 日の所要日数は地図の縮尺(約 2,000 × 1,100 km に 5 市場)からみて妥当で、嵩物を陸路で運ばないのも史実に合う。
- **CE の設計上の扱い**: 都市の門を通る流れは市場内の出荷が支配的で、これは今回の修正で正しく測れるようになった。高価品は価値で見れば都市の 3 割で検出できる。市場間の遠距離交易が細いことは CE の区割りの判断(どの門に何を置くか)を大きくは変えないため、経済モデルの改善(§10)は本設計の前提にせず別設計とする。

### 4.5 高額商品の流通調整の後の再計測(2026-10-19)

[luxury-value-demand.md](luxury-value-demand.md)(高額品の需要を予算と価格帯で決める)の実装後に、§4.4 と同じゴールデン fixture(5 市場)で、交易の成立までの段階を数え直した。

- 方法: `npm run sim -- tests/fixtures/sim-golden.fmg --years 3 --sample-every-months 1 --sample-detail trade,luxury`。`on` は `--settings` で `fmg-luxury-value-demand` を `on` にした。
- 計測の口: `tradeStageObserver.ts`(交易の照合の各段階で、読み取り専用の観測口を呼ぶ)と観測ビュー `trade()`(`--sample-detail trade`、sim:server の `observe/trade`)。経済の値は変えない(fixture のハッシュは観測の有無で一致)。
- 数え方は §4.4 と同じく「輸出元 × 輸入先 × 品」の組。年ごとに 12 か月を合計した。

高額品(`luxury`・`art`・`gift`・`ritual` のタグ、または高額品の需要を持つ品):

| 年 | 組 | 商会の到達範囲外 | 積荷の規則(価値密度・傷み) | 商人の運転資金不足 | 成立 | うち 24 日以上 |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: |
| `off` 1 年目 | 377 | 83% | 11% | 56 | 31 | 30 |
| `off` 2 年目 | 530 | 81% | 17% | 159 | 18 | 13 |
| `off` 3 年目 | 869 | 73% | 22% | 346 | 8 | 1 |
| `on` 1 年目 | 169 | 74% | 24% | 12 | 4 | 4 |
| `on` 2 年目 | 261 | 63% | 34% | 25 | 7 | 5 |
| `on` 3 年目 | 385 | 55% | 42% | 51 | 8 | 0 |

全品目:

| 年 | 組 | 商会の到達範囲外 | 積荷の規則 | 運転資金不足 | 成立 | 24 日以上 |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: |
| `off` 1・2・3 年目 | 1,093・1,641・2,801 | 38・33・30% | 54・58・59% | 100・376・961 | 83・78・134 | 82・61・40 |
| `on` 1・2・3 年目 | 906・1,393・2,324 | 25・20・18% | 68・69・70% | 53・221・721 | 48・86・134 | 48・57・38 |

- **遠距離の高額品交易が細い問題は解消していない**。`off` でも `on` でも、24 日以上の高額品の交易は 3 年目にほぼなくなり(`off` 1 件、`on` 0 件)、成立する交易の大半は 8〜20 日・190〜320 km の近い市場どうしに移る。§4.4 の「1 年以内にほぼ出なくなる」より緩やかだが、傾向は同じ。
- `on` は高額品の成立件数を減らした(1 年目 31 → 4)。`off` で成立していた分の多くは、需要を見ない推測取引や、買い手のいない品の運び込みだった(luxury-value-demand.md §2.2)。`on` の 2・3 年目の成立件数は `off` と同程度。
- 高額品を止めている最大の関門は**商会の到達範囲**(組の 55〜83%)。§10 の候補 (2) にあたる。全品目では**積荷の規則**(価値密度による距離の上限、54〜70%)が最大で、嵩物を陸路で遠くへ運ばないことと整合する(候補 (3))。
- §4.4 になかった関門として、**商人の運転資金不足**(`ExportStaging.bookFromRetail` が商人の交易資本を確保できない)が年々増える。3 年目には高額品で成立の 6〜43 倍、全品目で 5〜7 倍の組がここで止まる。
- province 地図(3 地図、15 年、luxury-value-demand.md §10・§14)では、市場間の高額品の運び込みは `off`・`on` とも 15 年続く。ただし市場どうしが近いため、遠距離の検証にはならない。
- 結論: 高額品の継続的な需要(候補 (1))は luxury-value-demand.md で入ったが、遠距離交易は増えていない。遠距離交易を太くするには、商会の到達範囲(候補 (2))と、商人の運転資金(新しい関門)の見直しが要る。

## 5. 門の性格(Approach Profile)の算出

descriptor の `roads[]` に、O4 の `approachTraffic` を拡張した `approachProfile` を載せる。

```ts
interface ApproachProfile {
  /** 都市内の占有率 0..1(積載枠 + 通過)。 */
  share: number;
  /** 0..1: この門の流量のうち通過交通の比。通過の多い 2 門の対が街道の軸になる。 */
  throughShare: number;
  /** 軸の反対側の門(通過交通で最も強く結ばれた門)。 */
  axisPartner?: string;
  /** 0..1: 端の流れのうち流入の比。0.5 付近は両方向。 */
  inboundShare: number;
  /** 貨物区分ごとの比(合計 1)。区分は observeViews.mts の CARGO_CLASSES と同じ。 */
  cargo: Partial<Record<"grain" | "bulk" | "livestock" | "perishable" | "provisions" | "manufactured" | "luxury", number>>;
  /** 貨物区分ごとの価値の比(高価品の評価用)。 */
  cargoValue: Partial<Record<string, number>>;
  /** 1 年あたりの荷馬車台数の目安(§6.2)。 */
  wagonsPerYear: number;
  /** "ledger" = Advance Time の実測、"prior" = 生成直後の推定、"blend" = 両者の加重。 */
  source: "ledger" | "prior" | "blend";
}
```

- **prior**(地図生成直後): 端の流れは「その門の先にある同じ市場の都市の人口」、通過は「市場中心と市場内の各都市を結ぶ最短路がこの町を通り抜けるか」で推定する(§4.3)。貨物区分は相手の市場が余剰を持つ品目と、自都市の不足で推定する(市場の在庫・価格は生成時に存在する)。
- **ledger**: `approachTraffic` の減衰累計。
- **blend**: 台帳の総量が少ない間(1 年分の流量に満たない)は prior と加重平均する。重み = 台帳の年流量 / (台帳の年流量 + 基準量)。

区分ごとの価値の比を出すため、台帳に `goodsValue`(品目ごとの価値の累計、上位 8)を追加する。経済の値は変えない(記録のみ)。

## 6. CE への適用規則

### 6.1 主門と市場通り(R4・R5)

1. 通過交通で結ばれた門の対があれば、それを **街道の軸** とし、軸を結ぶ街路(門→広場→門)を **市場通り** とする(§4.2: 8 割超の町に通過交通がある)。
2. 軸がなければ、端の流れ(流入 + 流出)が最大の陸の門を主門とし、主門から広場までを市場通りとする(港町で海が最大なら荷揚げ場を主門とみなす)。
3. `wards.ts` の `rateLocation` を変更する:
   - `merchant`: 中心からの距離ではなく「市場通りからの距離 + 中心からの距離 × 0.3」。
   - `market`(2 つ目以降の市場セル): 市場通りに面するセルを優先する。主門の `cargo.grain + livestock` が大きければ主門側の端、`luxury + manufactured` が大きければ中心側。
   - `gate`(門区): 確率ではなく、`share` に比例して門区を割り当てる(主門は確実に門区、`share < 0.05` の門は門区にしない)。
4. 市場通りの幅員を 1 段階広げる(既存の舗装幅と同じ扱い: `cobbledWidthMeters`)。主門側の門の内側に漏斗形の広がり(市の立つ空き地)を置く。

### 6.2 荷馬車と宿の空間(R1・R2)

- `wagonsPerYear = Σ(端と通過の積載枠) / 平均積載`(1 回 51 枠程度を荷馬車 1 台分として正規化)。通過交通の多い軸の門ほど宿と溜まり場が大きい。
- 主門の外(文化設定が「中央」なら町の中央の市場通り沿い)に、宿の中庭を `wagonsPerYear` から決める大きさで置く。既存の `gateInnPlacement.ts` の中庭面積(`STABLE_COURT_M2 × stableSpaces`)を流用し、`stableSpaces` を荷馬車台数から算出する。
- 中庭は入口と出口が別、または回転できる大きさ(荷馬車の回転半径 8 m を目安)を満たさない場合は配置しない。
- urban morphology の都市でも、descriptor の `approachProfile` があれば門前宿を置く(現状は置かれない)。

### 6.3 品目別の門前施設(R3・R7)

| 門の貨物 | 施設 | 位置 |
| :--- | :--- | :--- |
| `livestock` が 0.2 以上 | 家畜市(柵で囲った広場) | その門の外、道路沿い |
| `grain` が主 | 穀物市(市場通りの門側の区画)、穀物倉 | 門の内側 |
| `bulk` が 0.2 以上 | 既存のギルド資材置き場(timberYard・stoneYard・limeKiln・smithyYard)をその門の外に寄せる | 門の外 |
| `perishable` | 小売市場(中心の広場) | 中心 |
| `luxury`(価値比 0.2 以上、または都市内の高価品の価値がこの門に集中) | 商館・隊商宿(caravanserai の文化はハーン) | この門と中心を結ぶ市場通りの中心寄り |

### 6.4 職人区(R6・R7・R9)

`craftsmen` の `rateLocation` を無作為から次の採点に変える(職種 `craftDomain` 別):

- 原料が嵩物の職種(鍛冶・大工・石工・陶工): 嵩物の入る門への距離。
- 製品を出荷する職種(織物・皮革など): 流出主体(`inboundShare < 0.3`)の門への距離。
- 水を使う・悪臭の職種(皮なめし・染色・と畜): 既存の水辺・下流の判定を優先(現行の `tannery` 配置規則と同じ)。
- 同じ職種は隣接セルを優先する(R9: 通り単位でまとまる)。

### 6.5 文化別の切り替え

既存の文化・時代設定(`SiteLodging.kind` が `caravanserai` の文化、日本系の文化)から:

- 欧州型: 宿は門外(R1)。
- イスラーム型: 隊商の荷解き場は門、取引所(ハーン)は中心(R8)。
- 日本型(宿場・城下町): 宿と問屋場は町の中央の街道沿い、枡形は町の両端。市場通り = 街道。

## 7. 実装の要点

### 7.1 descriptor と設定

- `BurgSiteRoadEntry.approachProfile`(§5)。O4 の `approachTraffic` を置き換える。
- 生成設定 `approachCommerce: "off" | "on"`(既定 off)。off のときは O4 と同様に descriptor から取り除き、既存の都市を変えない。
- CE UI(生成パネル)に切り替えを追加する。既存の都市を開き直したときに見た目が変わる問題は、ドキュメントに設定を保存して開き直しでは変えない。

### 7.2 経済側

- 台帳に `goodsValue` を追加(§5)。
- prior の算出は `src/services/` の純関数とし、FMG 側(descriptor)と観測(`observe/gates?prior=1`)の両方から呼ぶ。

### 7.3 検証

観測所の CE プローブに次の指標を追加する。

- 市場通りの長さ・商人区の市場通りからの平均距離(on / off)。
- 職人区の職種別の重心と、対応する門への距離。
- 門前宿の中庭面積と `wagonsPerYear` の対応。
- §4 で門の性格が分かれている都市(貨物構成の差 > 0.5)で、施設が門ごとに違う種類になっているか。

O3 で分かったとおり、budget など内部の値ではなく **実際に描かれた建物・区画** で測る。

## 8. 互換性

- 既定 off。on にしたときだけ区割り・施設が変わる。
- 経済シミュレーションの結果は変えない(`goodsValue` は記録のみ)。golden の差分は economy slice の新フィールドだけになるよう `simGoldenDiff` で確認する。

## 9. 段階計画

| 段階 | 内容 | 完了条件 |
| :--- | :--- | :--- |
| C0 | `approachProfile`(ledger のみ、通過比と軸を含む)を descriptor に載せる | 観測所の `observe/gates` と descriptor の値が一致 |
| C1 | 主門・市場通り・`merchant`/`market`/`gate` の採点(§6.1)、設定 `approachCommerce` | off で既存テスト・CE 出力が不変。on で商人区の市場通りからの平均距離が off より短い |
| C2 | 宿の中庭の大きさと位置(§6.2)、urban morphology でも宿を置く | 主門の外に宿が置かれる都市の割合、中庭面積と荷馬車台数の相関 |
| C3 | 品目別の門前施設(§6.3)と職人区の採点(§6.4) | 貨物構成の違う門を持つ都市で施設の種類が門ごとに分かれる |
| C4 | prior と blend(§5)、文化別の切り替え(§6.5) | 生成直後の地図で prior の首位門の的中率が §4 と同程度 |

## 10. リスクと未決事項

- **経済モデルの遠距離交易が細い**(§4.4。高額商品の流通調整の後も未解消、§4.5): 市場間のキャラバンは 1 年以内にほぼ止まり、成立するのは少数の高価品の一回限りの取引。改善するなら別設計で扱う。候補: (1) 高価品の継続的な需要(在庫目標の一回充足ではなく消費に応じた補充)、(2) 商人組織の到達範囲の見直し(除外の 35%)、(3) 嵩物は水運に限る現行の考え方を明記して検証する。改善しても門ごとの流れの主体(市場内の出荷)と CE の判断は大きくは変わらない見込み。高額商品を買う余剰が家計・商人に無いことが先の問題で、[initial-wealth-calibration.md](initial-wealth-calibration.md) の順序(お金の循環の是正 → 開始時の富の逆算)の後に扱う。
- **積載枠では高価品が見えない**: 穀物が 9 割を占める。高価品の判定は価値(`goodsValue`、実装済み)を使う。
- **小規模な地図**: 検証は province 規模で、門が 2〜3 本の小都市が多い。全球規模の地図で再測定する。
- **史料の一般化**: 欧州の事例は英国・独語圏中心、イスラーム都市モデルには批判がある(§3.2)。規則は「傾向」として重み付けに使い、決定的な配置規則にはしない。
- **河川と橋**: 門前施設や市場通りの延長が川を渡る場合、橋の可否は `src/utils/bridgeSkewPolicy.ts` の判定に従う。上限を超える地点では施設を同じ岸に限る。

## 参考資料

- [The Landscape and Economy of Late Medieval London (Brewminate)](https://brewminate.com/the-landscape-and-economy-of-late-medieval-london/) — 門外の宿(Bishopsgate・Aldgate)、悪臭職種の城外移転
- [Markets and Fairs, VCH Oxfordshire vol. 4 (British History Online)](https://www.british-history.ac.uk/vch/oxon/vol4/pp305-312) — 北門外の馬市・家畜市、Northgate Street の穀物・干し草
- [Medieval Corn Market and the Guildhall (HMdb, Sandwich)](https://www.hmdb.org/m.asp?m=273067)
- [Jørgensen, Local government responses to urban river pollution in late medieval England](https://dolly.jorgensenweb.net/files/Jorgensen_Responses_to_urban_river_pollution_postprint.pdf)
- [Trade in the Medieval City — the History of York](https://www.historyofyork.org.uk/themes/trade-in-the-medieval-city)
- [Multisensory Virtual Experience of Tanning in Medieval Coventry (ResearchGate)](https://www.researchgate.net/publication/320616343_Multisensory_Virtual_Experience_of_Tanning_in_Medieval_Coventry)
- [The importance of London for craft and industry in medieval England (ResearchGate)](https://www.researchgate.net/publication/302504013_The_importance_of_London_for_craft_and_industry_in_medieval_England)
- [The Walbrook Study (IHR, Keene)](https://sas-space.sas.ac.uk/9185/1/The%20Walbrook%20Study%20-%20A%20Summary%20Report%20with%20Appendices.pdf)
- [Social and economic study of medieval London (IHR/CMH)](https://archives.history.ac.uk/ihrcms/cmh/projects/research/social-and-economic.html)
- [MoEML: Cheapside Street](https://mapoflondon.uvic.ca/CHEA2.htm)
- [Das Lübecker Dielenhaus](https://www.dielenhaus.de/) / [Monumente: Das Lübecker Dielenhaus und seine Windenanlage](https://www.monumente-online.de/de/ausgaben/2011/5/feiern-mit-geschichte.php) / [Lübecker Dielenhäuser (MLB)](https://mlb-verlag.de/luebecker-dielenhaeuser/)
- [The last galleried coaching inns left in London (London Museum)](https://www.londonmuseum.org.uk/collections/london-stories/last-galleried-coaching-inns-left-london/) / [Coaching inn (Wikipedia)](https://en.wikipedia.org/wiki/Coaching_inn) / [Oxford Arms, Warwick Lane (Wikipedia)](https://en.wikipedia.org/wiki/Oxford_Arms,_Warwick_Lane) / [Chequer Inn (Wikipedia)](https://en.wikipedia.org/wiki/Chequer_Inn)
- [Pinte, Herberge, Winkelwirtschaft (Donnerhaus)](https://donnerhaus.eu/blog/pinte-herberge-winkelwirtschaft-vormoderne-gastwirtschaften-geschichtskruemel-89/) / [Leonhardsvorstadt: Wie alles begann](https://www.zukunft-leonhardsvorstadt.de/planspiel-dateien/was-war-frueher.pdf) / [Stadttore und Türme (Landesbildungsserver BW)](https://www.schule-bw.de/faecher-und-schularten/gesellschaftswissenschaftliche-und-philosophische-faecher/landeskunde-landesgeschichte/module/bp_2016/europa_im_mittelalter/stadt-buerger/alltag-in-einer-mittelalterlichen-reichsstadt/d4.pdf)
- [Urban form glossary (ISUF)](https://urbanform.org/glossary/) / [British urban morphology: the Conzenian tradition](https://journal.urbanform.org/index.php/jum/article/download/3896/3218)
- [A new marketplace for medieval Swansea?](https://medievalswansea.ac.uk/cy/blog/a-new-marketplace-for-medieval-swansea/index.html) / [Trade in Medieval Europe (World History Encyclopedia)](https://www.worldhistory.org/article/1301/trade-in-medieval-europe/)
- [AJIS 論文(イスラーム都市の市場の階層)](https://ajis.org/index.php/ajiss/article/download/2043/1274/3260) / [Brown University course page](https://webhelper.brown.edu/joukowsky/courses/afterpharaohs2010/13953.html) / [Encyclopaedia Iranica: Bazar iii](https://iranicaonline.org/articles/bazar-iii) / [Bonine, Islam and commerce: Waqf and the Bazaar of Yazd](https://www.erdkunde.uni-bonn.de/article/view/2129)
- [Al-Madina Souq (Wikipedia)](https://en.wikipedia.org/wiki/Al-Madina_Souq) / [Aleppo's Al-Madina Souq (The Aleppo Project)](https://www.thealeppoproject.com/wp-content/uploads/2017/02/Al-madina-souq-1.pdf) / [Khan al-Gumruk (Wikipedia)](https://en.wikipedia.org/wiki/Khan_al-Gumruk)
- [国総研: 我が国固有のまちの成り立ち、都市の構造を知る](https://www.nilim.go.jp/lab/bcg/siryou/tnn/tnn0723pdf/ks072307.pdf) / [金沢市: 日本の城下町と金沢城下町](https://www4.city.kanazawa.lg.jp/material/files/group/22/kanazawajouka1-1-s.pdf) / [仙台城下町の構造と現代の町](https://note.com/miya_sen_mame/n/n668c58805708)
- [千葉市図書館資料(宿場の構造)](https://www.library.city.chiba.jp/news/pdf/20160628hanamigawadanchi_kikaku.pdf) / [コトバンク: 宿駅](https://kotobank.jp/word/%E5%AE%BF%E9%A7%85-77586) / [nippon.com 宿場町](https://www.nippon.com/ja/japan-topics/c08605/)
