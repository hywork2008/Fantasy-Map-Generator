# 商品の単位: 中身・荷姿・取引の 3 層

状態: 2026-10-20 設計(未実装)。家畜の 1 head を 1 頭にする [livestock-head-unit.md](livestock-head-unit.md) を、全品目の単位に広げる。同日、単位の語ごとに標準の量を決める初版を、中身・荷姿・取引の 3 層に書き直した。2026-10-21、史料・博物館の所蔵品解説・物性資料を再確認し、§9 の採用方針を確定。容量・風袋の代表値、容器の再使用、取引条件による荷姿の選択、価格の校正、全207品目の基本単位を補った。同日、陸・船・倉庫・家畜の上限を史料(§10 の S17〜S32)と照合して既定値を直し、今のコードの荷を計測した(§12)。§12.5 の積荷の即時の修正(Wood・wain の枠、家畜を歩かせる、荷馬車の積載量)を実装した(§12.6)。全207品目に今の単位の中身を記入した(段階2、§13)。また物流の判定のため、品の物性の項目(§5.1)、固い容器と柔らかい容器(§5.2)、ばら積みの容積の式と、陸・船・倉庫・家畜の重さと容積の上限(§5.4)を足し、荷車の隊の積載量の誤った比較を船の積載量の食い違いに直した。数値の校正と実装は未実施。

## 1. 目的

今は単位の語(wain・barrel・set・head など)だけがあり、実物の量(L・個数・kg)は品目ごと・コードの場所ごとにばらばらに仮定されている。同じ Wood の 1 単位が、森と燃料の計算では 10 m³、車両の材料の注記では 1.2 m³ になっている。

本設計では、次の 3 つを分けて扱う。

- 中身: 品そのものの量。
- 荷姿: 何に詰めて運ぶか。
- 取引: どれだけまとめて動かすか。

市場の在庫・価格・生産・消費はすべて中身の基本の単位で持ち、荷姿は運ぶ・置く・小分けする段で使う。梱包や瓶詰めの場所は売り手・買い手・仲介者の取引条件で変わり、B2B/B2C の区別から一意には決まらない。史料に複数の慣行があるものは併存させ、通常の取引では自動選択する。

[goods-unit-scale.md](goods-unit-scale.md)(2026-08-01)の前提は「1 単位はロット(会計の単位)で、内部の値は変えず、表示だけ個数に読み替える」だった。本設計はこの前提を改める。理由は次の 3 つ。

- 表示の読み替えでは、コードの各所が別々の量を仮定するのを止められない。
- 人物が馬 1 頭・ワイン 1 本を買うたびに換算が要る。
- 家畜の`head`は「1頭で曖昧さがない」とされたが、馬には25頭の境界換算がある。非馬類は現行の群れの引当てではすでに1個体であり、高い価格を理由に頭数を増やしてはいけない(livestock-head-unit.md §2)。

## 2. 3 つの層

| 層 | 表すもの | 単位 | 例 |
| :--- | :--- | :--- | :--- |
| 中身(品、`Good`) | 物そのもの | 基本の単位: L・個数・kg・m³・m²・m・MJ、役務は別扱い | ワイン1 L、石油1 L、レモン1 kg、馬1頭、靴1足、穀物1 kg、布1 m²、綱1 m |
| 荷姿(容器、`Package`) | 中身を詰めて運び、置く入れ物 | 実用内容量・外側の積付容積(L)・自重(kg) | 型ごとのアンフォラ、樽 200 L、瓶、木箱、麻袋、俵、ドラム缶、ばら積み。タンク船は輸送資産 |
| 取引(荷、`Consignment`) | 品の量と、その荷をどう運び引き渡すか | 基本単位の数量 + 容器内訳 + 条件 | 隊商の荷、船の積荷、港の倉庫の荷。端数入りの容器や、容器なしの荷もある |

同じワインが、古代は地中海でアンフォラに、中世は樽に、近世以降は瓶にも詰められる。石油は樽からタンク車・タンク船によるばら輸送にも移る。タンク車・船そのものは容器一覧に製造材料として入れず、輸送資産として扱う。荷姿は品の性質ではなく、時代・文化・技術で決まる運び方・売り方の性質として扱う。「樽のワイン」と「瓶のワイン」を別の品にすると、同じワインの需要と供給が 2 つに割れ、価格が別々に動く。

## 3. ゲームで要る単位

| 次元 | 単位 | 使う所 |
| :--- | :--- | :--- |
| 液体の量 | L | 酒・乳・油・酢・タール・石油。蜂蜜・水銀・化学品は kg とし、濃度・状態を併記 |
| 個数 | 品ごとの数え方(頭・人・個・足・組・本・冊・挺・門・隻・枚) | 1 つずつ数える物。中身の基本の単位 |
| 質量 | kg | 粒・粉・塊のばら物(穀物・豆・砂・石炭・鉱石・地金・塩・香辛料)。中身の基本の単位。全品の 1 単位の重さ(運ぶ重さ、栄養、レシピの釣り合い) |
| 布・紙・革の面積 | m² | 幅と長さを持つ材料。目付(kg/m²)と厚さを定義し、反・枚・連は表示や取引のまとまり |
| 長さ | m | 綱・銅線・レール。径・断面・規格を品の仕様として固定 |
| かさ(体積) | L(大きい量は m³) | 全品の 1 単位のかさ(容器に何個・何 kg 入るか、倉庫・CE の置き場)。薪と木材は中身の基本の単位も m³ |
| 熱量 | MJ | 燃料の物性。Natural Gas・LNG は基本単位も MJ(発熱量の基準を統一) |
| 栄養 | kcal・たんぱく質 g | 食料 |
| 積荷の枠 | slot | 車両・船・倉庫の容量と運賃。荷姿を含めた重さとかさから計算する(§5.4) |
| 時間・労働・お金 | 日・人月・SP | 単位自体は変えない。商品1基本単位あたりの作業量・単価は換算する |

個数で数えるのは、1 つの仕様を定義できる完成品・家畜などに限る。果物は B2B/B2C とも kg を正本にし、店頭の「1 個」は平均重量から換算する。全207品目の割当は §11。基本単位は計算の正本であって、その社会がメートル法を採用したという設定ではない。bushel・斤・升などの地域の度量衡は換算表示にできる。

## 4. 今の単位の問題

### 4.1 同じ品の 1 単位を、場所によって違う量で読んでいる

| 品 | 読み方 1 | 読み方 2 | 場所 |
| :--- | :--- | :--- | :--- |
| Wood(pile) | 10 m³(約 6.5 t) | 約 1.2 m³ | `forestStock.ts WOOD_M3_PER_UNIT`・`heating.ts` / `transportAssetOrders.ts` の注記 |
| Grain(wain) | 約 465 kg(`GROSS_FOOD_NEED` 0.43 wain = 200 kg) | 約 600 kg(荷車 20 wain = 12 t) | `foodConstants.ts`、`settlementClearance.ts` / `transportAssetOrders.ts` の注記 |
| Coal(wain) | 1 t(熱量 27 GJ) | 穀物と同じ wain(465 kg) | `heating.ts COAL_HEAT_PER_UNIT` / カタログの単位の語 |
| Horsesほか家畜(head) | 1個体として扱う群れ・騎兵・CEの経路 | 現行の群れの引当てはHorsesが25頭/市場単位、他は1個体 | livestock-head-unit.md |
| Harnesses(set) | 1 組(単位の語) | 100 組(`HARNESS_SETS_PER_LOT`) | port-freight-queue-and-warehouses.md §10.18 |
| Wool(fleece) | 1 枚(単位の語) | 1,000 枚(`FLEECES_PER_WOOL_MARKET_LOT`) | `woolProduction.ts` |
| Boots(pair)・Bread(loaf) | 1 足・1 個(単位の語) | 20 足・20 個(表示専用の `goodsUnitFlavor.ts`) | goods-unit-scale.md |
| Cloth(wardrobe bolt)・Garments(wardrobe lot) | 1 着分の布・1 着 | 1,000 人分(カタログの注記) | `goods-generator.ts` |

### 4.2 単位の語が個数なのに、値が 1 個の値ではない

以下は初版の価格試算であり、年額 0.52 を使った比率と日当の目安は未検証。**この表だけでロットの個数や新価格を確定しない**。現行 `subsistenceWage.ts` では、穀物価格 1 のとき 1 人の年間の賃金は `1.5 × 0.43 = 0.645 SP`。§5.6 の同時代・同地域の価格/日当と物量の監査で校正する。物量と価格が矛盾していることは確認できるが、高い価格だけから「実際に何個だったか」は逆算できない。

| 品(単位の語、値) | 初版の年額0.52で読んだ値 | 初版の日当換算案(出典・仕様の再検証前) |
| :--- | :--- | :--- |
| 家畜 10 品(head) | livestock-head-unit.md §2 | 馬 50〜90 日、牛 40〜50 日、豚 12 日、羊 5 日、鶏 0.3 日 |
| Boots(pair、7) | 賃金 13 年分 | 2〜4 日 |
| Bread(loaf、2) | 4 年分 | 0.1〜0.3 日 |
| Tools(set、14)・Arms(set、24)・Harnesses(set、10) | 27 年・46 年・19 年分 | 農具一式 10 日、武具一式 40〜80 日、馬具 1 組 10〜20 日 |
| Muskets(piece、35)・Artillery(cannon、120) | 67 年・230 年分 | 小銃 60〜80 日、大砲は数年分 |
| Paper(ream、5)・Ink(bottle、7)・Candles(block、10) | 10〜19 年分 | 1 連 数日、1 瓶 1 日未満、蝋燭 1 本は日当の数分の一 |
| Spinning Wheel(wheel、12)・Furs(pelt、6)・Pearls(pearl、18)・Amber(stone、8) | 12〜35 年分 | 紡ぎ車 数日〜10 日、毛皮 1 枚 数日 |
| Garments(wardrobe lot、20)・Cloth(wardrobe bolt、15) | (1,000 人分と注記) | 衣服一揃い 20〜40 日 |

Books・Jewelry・Ships・Engines・Relics も、単数形や高価格だけでは旧1単位=実物1個と認定しない。写本/印刷本、材質、船級・出力などの仕様と既存の生産・装備・購入経路を照合する。

### 4.3 単位の語に量の定義がない

`sack`・`bag`・`bale`・`bundle`・`chest`・`pallet`・`block`・`coil`・`crate`・`bar`・`flask`・`vat`・`length`・`beam`・`case`・`basket`・`roll`・`bolt`・`ream`・`quiver`・`pouch`・`vessel` は、kg・L・個数のどれも決まっていない。`barrel` は液体(Oil・Vinegar・Tar)にも固体(Sulfur・Potash・Saltpeter・Soap)にも使われる。`wain` は穀物・魚・石炭・粘土・煉瓦・ガラス・陶器・保存食・燻製チーズに使われ、積荷の枠は品ごとに 2〜5 と違う。

量が決まっているのは、主に次の品だけ。

- `200 L cask`(Wine・Beer・Cider・Perry)。
- `1,000 kg ... lot`・`250 kg ... lot`・`1,000 L dairy lot`(果物・チーズ・乳・干し果物・ブドウの搾り滓)。
- `kg`(金・銀)。
- `wagon`(鉱石・地金を `goodUnits.ts` が 1 t と読む)。

### 4.4 積荷の枠が量と結びついていない

1 単位の積荷の枠は、`cargo.cargoSlotsPerUnit` がなければ交易の性格の `trade.bulk`(1〜5 の段階)をそのまま使い、下限は 0.25 枠。

| 品 | 1 単位 | 枠 | 1 枠あたり |
| :--- | :--- | :--- | :--- |
| Grain | 約 465 kg | 4 | 約 116 kg |
| Wood | 10 m³(約 6.5 t) | 5 | 約 1.3 t |
| Iron Ore | 1 t | 5 | 200 kg |
| Silver Ore・Gold Ore | 1 kg | 0.05 | 20 kg |
| Silver Ingot・Gold Ingot | 1 kg | 0.005 | 200 kg |
| 家畜(head) | Horsesは換算25頭、他は1個体 | 1〜5 | — |
| Sloop・Caravel・Galleon(ship) | 船 1 隻 | 5 | — |

1 枠に入る重さが品によって 10 倍以上違う。車両・船・倉庫の容量と運賃が、品の実際の重さ・かさを反映していない。

### 4.5 レシピで量が釣り合わない

量の定義がないので、レシピの入出力の質量・体積が確かめられない。確かめられる品にも食い違いがある。

- Bread: Flour 1 sack → 20 個。sack の重さが未定。
- Charcoal: Wood 1.5(15 m³、約 10 t)→ 1 sack。炭の歩留まりは重さで 15〜25%。
- Bronze: Copper Ingot 0.5 t または Tin Ingot 0.5 t と炭 → 1 t。銅と錫の一方だけで青銅になり、質量も合わない。
- Leather: Cattle 1(群れの塊)→ 1 roll。roll の枚数が未定。
- Ivory: Elephants 0.2 → 1 tusk。象 1 頭から 5 本取れる。
- Egg: Chicken 1 → 1 basket。鶏を潰して卵にしている。
- Brick: Clay 1 wain + Wood 0.1(1 m³)。
- Cloth: Wool 6(6,000 枚)→ 1(1,000 着分の布)。
- 既存の物量契約として確認できる例はCheese(Milk 10 lots = 10,000 L → 1,000 kg、`foodLots.ts`)と Wine(Grapes 0.26 = 260 kg → 200 L)だけ。

### 4.6 単位の大きさを前提にした式

livestock-head-unit.md §3 に挙げたもの(価格の丸め 2 桁、取引による価格の動きが単位数に比例、価格の平滑化 5 単位、価格の需要の配分、積荷の下限 0.25 枠)は全品目に効く。単位を実物に合わせると、1 単位の値が小さい品(鶏 1 羽・パン 1 個・蝋燭 1 本)が丸めで 0 になる。単位の大きさは品ごとに大きく違うので、同じ取引の金額でも価格の動きが品ごとに違う。

ほかに、次の定数が単位の大きさを前提にしている。

- 1 人あたりの量: `GROSS_FOOD_NEED`、`BASE_HEATING_UNITS_PER_1000_RESIDENTS_MONTH`、`TOOLS_PER_HOUSEHOLD`、`ARMS_PER_HEAD`、`ARCHER_ARROWS_PER_HEAD`、`FIREARM_BULLETS_PER_HEAD`、`MOUNTED_FODDER_PER_HEAD`。
- 調整の表の月の量(`craftDemandCalibration.ts`)。
- 作業の人月(`requiredWorkPoints`)。

## 5. 方針

### 5.1 中身: 正味の量と物性を一度だけ定義する

`GoodMeasure` は基本単位(`liter`・`kilogram`・`item`・`cubicMeter`・`squareMeter`・`meter`・`megajoule`)、個数の呼び名、物の仕様、必要に応じて栄養・発熱量を持つ。`Coins` は既存のカタログの注記どおり造幣・両替の役務で、物理貨物にしない。

物流の判定(§5.3・§5.4)に使う物性は、基本単位ごとに次の項目で持つ。どれが要るかは基本単位で決まり、要る項目が欠けた品は荷にできない(試験で検出する)。

| 項目 | 意味 | 要る品 |
| :--- | :--- | :--- |
| `kgPerUnit` | 1基本単位の正味質量 | 全品(kgの品は1) |
| `densityKgPerLiter` | 液体の密度 | L の品(ワイン約0.99、油0.9、タール1.2) |
| `bulkKgPerLiter` | すき間を含む見かけの密度。荷の容積 = 質量 ÷ この値 | kg の粉粒体・塊・繊維(小麦0.77、石炭0.8、鉄鉱石2.0〜2.5、乾草0.1、羊毛のばら0.05前後) |
| `itemOuterLiters` | 1個の外形の容積(外接する箱で近似) | 個数の品(馬・船など自分で動く物を除く) |
| `itemShape` | 箱詰めの詰め方の率を決める形(箱形・円筒・球・不定形) | 個数の品。率は形と容器の組で§5.3の表から引く |
| `fragility` | 割れ物・潰れ物の区分。緩衝材の容積と質量を足すか、上に積めるか | 卵・ガラス・陶器・果物・瓶詰め |
| `kgPerSquareMeter`・`kgPerMeter` | 目付、長さあたりの質量 | m² の品(布・紙・革)、m の品(綱・銅線・レール) |
| `rolledLitersPerSquareMeter`・`lengthLimitM` | 巻いた・束ねたときの容積、1本の長さ(荷車・船に入るか) | 布・紙・革、レール・梁・長材 |
| `stowageFactor` | ばら積み・結束で、荷の容積に足す損失の倍率(§5.4) | ばら積みできる品、木材 |
| `phase`・`referenceConditions` | 気体・液化ガスの相、温度・圧力、発熱量の基準 | 気体・液化ガス |

- **質量と見かけの体積を分ける**。粉粒体は粒の真密度でなく、空隙を含んだかさ密度(`bulkKgPerLiter`)を使う。FAO の小麦は 0.72〜0.83 kg/L、粉砕小麦は 0.60〜0.62 kg/L で、同じ物でも状態が違う[S6]。
- 木材の m³ は実材積。積んだときの空隙は `stowageFactor` で加える。薪を積み上げた1 m³(層積)の中の木は0.6〜0.8 m³(1 cord 128立方フィートに実材約85立方フィート、0.66)[S31]なので、薪は1.5を既定とし、丸太・角材は1.2〜1.4とする(P)。650 kg/m³ は乾燥状態を固定したモデル値で、全樹種・含水率の史実値ではない。
- 布・紙・革は m² あたりの質量、綱・銅線・レールは m あたりの質量と断面を定義する。反や coil を基本単位に戻さない。
- 気体・液化ガスは状態・温度・圧力・発熱量の基準が必要。LNG は天然ガスと同じエネルギー量でも容積が大きく違う[S12]。全商品共通の固定 `liters` だけでは表せない。
- 集計上の頭数は端数でもよいが、人物への馬・道具の引渡しは整数。部分取引した数量と、実物1個の引渡しを区別する。

代表値の採用例:

| 品 | 基本単位 | 採用する物性・仕様 | 根拠の区分 |
| :--- | :--- | :--- | :--- |
| Wine | L | 質量は約1 kg/L。200 L ロットは200 Lのまま | 密度はモデル近似、量は `foodLots.ts` の既存契約 |
| Wheat / Grain(既定の穀物) | kg | かさ密度0.77 kg/L → 約1.30 L/kg | [S6]の範囲から採用。Grainは小麦相当の代理品 |
| Flour | kg | 0.61 kg/L → 約1.64 L/kg | [S6]の粉砕小麦を代理に採用。小麦粒と別の値 |
| Fodder | kg | 乾草相当0.10 kg/L → 10 L/kg。圧縮俵は別の積付プロファイル | [S6]の乾草0.08〜0.12 kg/Lから採用 |
| Lemons | kg | 店頭の1個は0.1 kg相当を既定とする | 大きさの差を省くモデル値。1000 kgロットから1000 kgへ移行 |
| Wood / Timber | 実材積m³ | 650 kg/m³を既定、積付容積は別 | 既存の近似を引き継ぐ。樹種・含水率による変更を可能にする |
| Horses | 頭 | 450 kg/頭を既定。歩行輸送と船内輸送は別の占有量 | 体格のモデル値。家畜の取扱い枠は§5.4 |

旧 `packingFill` は全商品共通の物性から外す。かさ密度の空隙、容器の余裕、個数品の詰め方を一つの率にまとめない。

### 5.2 荷姿: 内容量・風袋・積付容積・価格を分ける

容器の一覧は、`capacityLiters`(実用内容量)、`tareKg`(自重)、`stowageLiters`(外側の寸法と積付方法で決まる占有容積)、`maxPayloadKg`、`rigid`(形が固定か)、材質・適合する中身・技術、再使用の可否を持つ。容器の容量と船倉を占める容積は同じではない。

- 固い容器(樽・アンフォラ・瓶・壺・木箱・ドラム)は、中身の量に関わらず `stowageLiters` を占める。半分しか入っていない樽も樽1本のかさ。
- 柔らかい容器(袋・俵・包み・籠のうち編み目の柔らかいもの)は、中身の容積に合わせて縮む。占有容積 = `min(stowageLiters, 中身の容積 × 柔らかい容器の積付倍率)`。積付倍率は袋・包みで1.15(P)。50 kgの小麦(約65 L)を入れた100 L袋は75 Lを占め、110 Lではない。
- 空の容器を運ぶとき(返送・転売)は、固い容器は `stowageLiters`、柔らかい容器は畳んだ容積(容量の5%、P)で数える。樽を解体して運ぶ慣行([S4])は、解体した樽材の容積を別のプロファイルで持つ。

下表を初期プロファイルとして採用する。**出典がある測定値と、ゲーム用の代表値を区別する**。Pはモデルの採用値で、歴史的な統一規格を意味しない。すべての文化に同時に出さず、[S1]〜[S5]の地域・時期に応じて使う。

| id / 荷姿 | 実用内容量L | 風袋kg | 積付容積L | 採用範囲・根拠 |
| :--- | ---: | ---: | ---: | :--- |
| `amphora-wine-25` | 25.1 | 25.7 | 65(P) | タラコネンシス北部沿岸のDressel 1。[S1]の特定型式の値。他のアンフォラの代表値に流用しない |
| `cask-200` | 200(P) | 40(P、ボルドーのbarrique 225 Lの空樽は約45 kg、資料により23〜54 kg[S32]) | 300(P) | 木製の液体用樽。既存200 L契約に合わせたモデル。英国のbarrelなどの史実単位の換算値ではない[S2] |
| `bottle-075` | 0.75(P) | 0.5(P) | 1.25(P、箱詰め前) | 丈夫なガラス瓶がある近世以降の選択肢。0.75 Lはゲームの既定で、17世紀瓶の統一容量ではない[S3] |
| `jar-10` | 10(P) | 5(P) | 15(P) | 陶製の壺。液体なら内面処理が必要。古代・中世の量り売り用の代表モデル |
| `sack-100` | 100(P) | 1(P) | 110(P) | 繊維袋。正味積載上限50 kg(P)。容量と「50 kg袋」を混同しない |
| `crate-100` | 100(P) | 8(P) | 125(P) | 木箱。正味積載上限50 kg(P)。詰め物が必要な品は追加 |
| `basket-40` | 40(P) | 2(P) | 50(P) | 籠。果物・卵・生鮮品用。個数や正味質量は別に記録 |
| `bale-1000` | 1000(P) | 2(P、包みと綱) | 1100(P) | 俵・梱包束。kg数は繊維の種類と圧縮で変わる。乾草なら既定約100 kg[S6] |
| `drum-200` | 200(P) | 20(P) | 240(P) | 工業時代の鋼製ドラムの代表モデル。208 L/55 US gal型とは別プロファイル |
| `bulk` / `bundle` | 固定なし | 包装なしなら0 | 荷の実際の積付容積 | ばら積み・結束材。結束する場合は綱などを別に加算 |
| `cylinder` / `cryogenic-tank` | 設備の仕様 | 設備の仕様 | 設備の仕様 | 気体・液化ガス専用。船・車両に組込みなら輸送資産台帳の設備容量を使う[S12][S14] |

**159 L(42 US gal)は石油の取引数量の換算であり、必ずその大きさの物理的な樽が1本あるという意味ではない**[S5]。木製の石油樽を使う場合だけ実容器のプロファイルを選び、ドラム・タンク輸送でも数量の表示にbblを使える。

容器の「値」は全時代共通のSP定数にしない。新品の価格は、容器製造の材料費 + 地元の職人賃金 × 作業量 + 現行の生産利幅から出す。製造でWood・Glass・Ceramicsなどを消費し、**再充填では完成済み容器を使うだけ**。`Barrels`を完成した空樽の品として残すなら、その購入とWoodの再消費を二重計上しない。型ごとの材料表は風袋・製造歩留まりと整合させる。史料なしに一律の「樽1本=日当何日」を置かない。

- 樽・瓶・木箱・袋は再使用可能とする。空容器は荷を空けた所有者の在庫へ移し、売買・返却・次の出荷で使う。[S3][S4]は瓶の持ち込み・再充填・樽の修理の実例。
- 初期実装の通常取引は、売り手の容器を中身と一緒に買い手へ売る。契約が持参容器なら容器を売らず、返却条件つきなら所有権を保ち預り金を別勘定にする。自動選択の既定であり、史実の全取引がこの条件だったという主張ではない。
- 使い回すことと産地への返送は別。空樽を毎回無料で産地へ戻さない。返送も風袋と積付容積のある荷として運賃がかかり、近隣での転売もできる。
- アンフォラも一律使い捨てとはしない。再利用・別用途・破棄が併存した[S11]。食品用への再充填は前の中身と容器の状態が適合するときだけ。
- 返送契約・中古価格・個体の劣化を詳細化する前でも、空容器の種類別数量と所有者は保持する。破損・補充係数は校正値であり、史料で確認していない使用回数や年数を史実値として書かない。

### 5.3 中身と容器の適合、および入る量

初期の組合せは次の表で決める。全207品目は§11の群を通じてこの表へ割り当てる。同じ群でも気体・薬品などの適合制約を先に適用する。

| 中身の群 | B2Bの通常の候補 | B2Cの候補・条件 |
| :--- | :--- | :--- |
| ワイン・ビール・シードル・酢・蒸留酒 | 地域・技術に合う樽、液体用の壺、型式の合うアンフォラ。瓶詰めでの出荷も可 | 量り売り・持参容器・店の再使用瓶・生産者/商人の封をした瓶 |
| 乳 | 地元の壺・桶、技術導入後の乳缶・冷蔵タンク | 持参容器・瓶。冷却なしの遠距離輸送を容器だけで可能にしない |
| 食用油・蜂蜜 | 内面の適合した壺・アンフォラ・樽 | 量り売り・壺・瓶。蜂蜜は正味kgで測る |
| 穀物・豆・粉・塩・乾燥食料 | 袋・乾物用樽・倉庫/船倉へのばら積み | 正味kgの量り売り、持参袋、小袋 |
| 果物・生鮮魚介・卵 | 籠・通気する木箱、卵には緩衝材 | kgまたは個数。密閉液体樽に空隙率だけで詰めない |
| 羊毛・綿・麻・干草・ゴム・泥炭 | 俵・束。圧縮できるかを技術と物の状態で決める | 正味kg、束の表示は量を併記 |
| 布・革・紙 | 巻物・反・束を包む。濡れから守る包装 | m²・長さと幅・枚数を換算表示。幅が違う布を同じ1反として扱わない |
| 鉱石・石・石炭・粘土・地金 | ばら積み・袋・結束。地金の形状は規格 | kg。宝飾素材は必要に応じg・carat表示 |
| 木材・レール・綱・銅線 | ばら積み・束・巻き。長さ制限も判定 | 実材積または規格つきm。容積だけで船や荷車への適合を決めない |
| 完成した靴・道具・武器・本・器物 | 木箱・包み・乾物用樽。壊れ物は緩衝材 | 個・足・組・冊。上位容器の中に瓶や箱がある入れ子も可 |
| 火薬・薬品・鉱油 | 乾燥・内張り・材質など品固有の適合条件を満たす容器 | 量・濃度・容器を併記。全てを「樽」にしない |
| 塩素・無水アンモニア・天然ガス・LNG | 専用配管・容器・タンク。圧力・冷却の設備と技術が前提[S12][S14] | 同じ物理制約を適用。木樽・普通瓶は候補外 |
| 家畜・人 | 歩行、または畜房・籠・船内の専用空間 | 頭・羽・人。通常の商品包装と別の輸送条件 |
| 船・機関車・大型固定機関 | 回航・線路走行・分解輸送など品の輸送方式 | 通常の箱詰め貨物にしない |
| 造幣・両替役務 | 物理容器なし | 役務の取引。金銀の在庫・通貨発行とは別 |

量の計算:

- 液体: プロファイルの実用内容量まで。`cask-200`ならワイン200 L。190 Lだけ入れたなら在庫と荷に実量190 Lを記録する。**全液体に自動で0.95を掛けない**。発酵中の容器と輸送用の満たした容器も区別する。
- 粉粒体: `min(容量L × かさ密度kg/L, 正味積載上限kg)`。小麦は100 L袋に理論77 kgでも、上限50 kgの袋なら50 kg。かさ密度にさらに0.75などの空隙率を掛けない。
- 個数品: `min(floor(利用可能容積 × 詰め方の率 / 1個の外形容積), floor(正味積載上限 / 1個の質量))`。容器の口を通るか、割れないか、梱包材が入るかも先に判定する。詰め方の率は `itemShape` と容器で決める(P): 箱形を木箱へ0.85、円筒0.75、球形(果物・卵以外)0.6、不定形0.5。`fragility` のある品は緩衝材の分として率に0.7を掛け、緩衝材(藁・おがくず、容量1 Lあたり0.05 kg、P)を風袋に足す。
- 入れ子: 瓶を木箱に入れるなら、両方の風袋と木箱外側の占有容積を使う。瓶の容積を船倉にもう一度加えない。
- 最後の容器は端数入りを許す。容器数は整数でも、入っている正味数量は整数倍とは限らない。

塩漬けの塩・液汁は保存加工の材料・出力の構成であり、空容器の容量補正ではない。樽の輪は容器製造の材料。これらを一つの「組合せの上書き」で隠さない。

### 5.4 運ぶ重さ・かさ・輸送資産

#### 5.4.1 荷の重さと容積

- 荷の総質量 = 正味質量 + 実際に積んだ容器・包材・緩衝材の風袋。
- 荷の占有容積は、容器の種類で分けて足す。
  - 固い容器: 最外層の容器の `stowageLiters` の合計。
  - 柔らかい容器: §5.2 の縮んだ容積の合計。
  - ばら積み: `正味質量 ÷ bulkKgPerLiter × stowageFactor`。`stowageFactor` は船倉・荷台の隅や梁による損失で、穀物・石炭・鉱石を均した(trimmed)ばら積みは1.05(P)、木材は§5.1の値。海運の積付係数(heavy grain 1.30 m³/t、石炭1.2〜1.4 m³/t、鉄鉱石0.40 m³/t)[S22]は見かけの密度(小麦0.77、石炭0.71〜0.83、鉄鉱石2.5 kg/L)とほぼ同じで、均したばら積みの損失は小さい。
  - 結束: 束の外形の容積。
- 入れ子(瓶を木箱に)は、最外層の容積だけを数え、内側の容器の風袋は総質量に足す。

`slot = max(総質量 / SLOT_KG, 占有容積 / SLOT_LITERS)`を混載の配賦・料金表示に使う。`SLOT_KG = 150`、`SLOT_LITERS = 250`は初期のモデル尺度として採用する。これは史実の運送単位ではない。この比は 0.6 kg/L で、これより軽い荷(乾草・羊毛・毛皮・空の樽)はかさで、重い荷(穀物・ワイン・鉱石・地金)は重さで枠が決まる。

**積めるかの判定は、荷全体のkgとLの両上限で行う**。各荷のmaxを足したslotだけで判定すると、軽い嵩物と重い荷の混載に過大な枠を課す。各輸送資産・倉庫は §5.4.2〜§5.4.4 の重量上限と容積上限を持つ。`trade.bulk` は物流の物量の正本から外す。長さ・形状・温度・取扱いの条件は、kgとLだけでは省略できないので、`lengthLimitM`・`fragility`・適合の表で別に判定する。

#### 5.4.2 陸: 1頭・1台で上限を決め、隊は台数を掛ける

今のコードの量は隊全体の抽象で、実物1頭・1台の量ではない。

| 今の値 | 場所 | 読み替えると |
| :--- | :--- | :--- |
| 馬の牽く量 `towCapacitySlots` 80枠/頭 | `caravanMovement.ts` | 1頭で12 t。実際は荷車の隊(20台)全体の量 |
| 馬の背負う量 `cargoCapacitySlots` 18枠/頭 | 同上 | 1頭で2.7 t。荷駄の隊(馬50頭、`requiredDraftAnimals` 2)の半分 |
| 荷馬車 240枠 / 180枠 / 実効160枠 | `tradeCargo.ts` / `transportAssetOrders.ts` / `getTransportAllocations`(`requiredDraftAnimals` 2 × 牽く量80) | 同じ車両が3通りに読まれる(20台で36 t / 27 t / 24 t)。計測(§12)で実際に使われていたのは160枠。2026-10-21 に160枠へ統一(§12.6) |
| 荷駄 36枠 / 40枠 | 同上 | 同じく違う(5.4 t / 6 t) |
| 牛の牽く量 120枠/頭 | `caravanMovement.ts` | 18 t |

150 kg/枠で読んだ隊の合計は荷車12 t・荷馬車24〜36 t・荷駄5.4〜6 tで、1台あたりでは史料の範囲に入る(荷車0.6 t、荷馬車1.2〜1.8 t、荷駄の馬1頭110〜120 kg)。誤っているのは、それを「動物1頭の量」として持っていることと、3通りの値の食い違い。ただし今の1枠は品によって13〜1,300 kgになる(§12.2)ので、実際に運んでいる重さは枠の数からは分からない。

新しい持ち方:

| 輸送手段 | 1台・1頭の正味積載(P) | 容積(P) | 根拠・注記 |
| :--- | ---: | ---: | :--- |
| 荷駄の馬・ラバ | 90〜110 kg(既定100 kg) | 300 L(左右の荷籠・荷包み) | 英国の荷駄は1頭約2 cwt(約100 kg)、240 lb(110 kg)を左右の荷籠に分けた。12〜40頭の列で1日約40 km[S17]。150 kgは現代の軍用の上限(体重の35%)で、史料の通常の荷ではない。荷鞍の重さは動物の側に数え、荷の風袋に入れない |
| 荷駄の駱駝 | 160〜200 kg(既定180 kg) | 500 L | 長い旅で1頭約160 kg、モンゴルの隊商で100〜200 kg、300 kgは最大[S18]。地域と時代で選ぶ(T15) |
| 1頭立ての2輪荷車 | 0.5〜1.5 t(既定0.8 t) | 1,500 L | 1797年のロンドンの荷車の上限は粉12袋・煉瓦750個・石炭1 chaldron(約1.3〜1.4 t)で、複数頭立てを含む上限[S19]。1頭立ての石炭車2 tは20世紀の舗装路の例。道の状態・坂で減らす(`gradeSensitivity`) |
| 4輪の荷馬車(馬4頭) | 1.5〜3 t(既定2 t) | 4,000 L | 18世紀の有料道路の上限は細い車輪の荷馬車3 t、広い車輪で6 t(8頭まで)。実際の牽引は馬1頭で最大約1 t[S20]。上限は法の天井で、通常の荷はその半分ほど |
| 牛車(牛2頭) | 0.6〜1 t(既定0.8 t) | 2,500 L | 牛1頭の2輪車(Red River cart)で270〜400 kg[S21]。速さは馬の半分(今の値を保つ) |

- 隊の上限 = 1台・1頭の上限 × 台数・頭数。隊の大きさ(荷車20台、荷駄50頭)は port-freight-queue-and-warehouses.md §10.13 の隊の定義をそのまま使う。
- 動物の数え方は livestock-head-unit.md と合わせ、隊の馬は実頭数(荷駄50頭・荷車20頭・荷馬車60頭)で持つ。牽く量を「動物1頭あたりの枠」で持たない。
- 荷馬車・荷駄の2か所の食い違いは、上の表の値で1つにする。

#### 5.4.3 船: 載せられる重さと船倉の容積

今の船の枠を150 kg/枠で読むと、史実より3〜10倍小さい。

| 船 | 今の枠 | 150 kg/枠で読むと | 史実の目安(載せられる重さ) |
| :--- | ---: | ---: | :--- |
| Sloop | 100 | 15 t | 植民地の商船のスループは25〜70 t、私掠船は140〜220 t[S23] |
| Caravel | 300 | 45 t | 初期は80 t未満、後期100〜150 t、大型の丸いカラベルは300 t超[S24] |
| Galleon | 800 | 120 t | 大西洋のガレオン500〜1,000 t、マニラのガレオンは2,000 tまで[S24] |
| Steamship | 1,100 | 165 t | 1852年の鉄製スクリュー石炭船 John Bowes(459総トン)が約540 t、1872年の H P Stephenson が1,368載貨重量トン[S25] |
| Galley(軍船) | 30 | 4.5 t | 商船には使わない |

船の大きさは、歴史的にはワインの大樽 tun(252ガロン、約954〜1,150 L、満たすと約1 t)を何本積めるかで数えた(ton burden)。樽1本の外形は約40立方フィート(1.13 m³)で、運賃の容積トン(freight ton)も40立方フィートとした[S26]。1 tun が占める船倉は、樽の形のすき間を含めて約1.4 m³(P)とする。英国の Builder's Old Measurement(1650〜1849年)は船の長さと幅から tons burden を出す式、1854年以降の登録トン(100立方フィート = 2.83 m³)は船全体の容積で、どちらも貨物の重さではない[S26]。史料の船の「トン」は、何の基準かを確かめてから使う。船ごとに次の2つを持つ。

- `deadweightKg`: 載せられる正味の重さ(貨物・容器の合計。乗員・食料・水・バラストは別)。
- `holdLiters`: 貨物に使える船倉の容積。既定は `deadweightKg / 1000 × 1,400 L`(1 tun 分の重さあたり1.4 m³)。

| 船 | 既定の載せられる重さ(P) | 既定の船倉(P) |
| :--- | ---: | ---: |
| Sloop | 50 t | 70 m³ |
| Caravel | 100 t | 140 m³ |
| Galleon | 500 t | 700 m³ |
| Steamship | 500 t(1850年代)・1,500 t(1870年代以降) | 700 m³・2,100 m³(機関・石炭庫を除く) |

- 船倉の容積の基準は 1.4 m³/t ≒ 0.71 kg/L で、枠の尺度の 0.6 kg/L と同じ桁。鉱石・地金は重さで、羊毛・乾草・空樽はかさで満ちる。袋詰めの穀物(約1.5 L/kg)は船ではかさで満ち、ばら積み(1.3〜1.4 L/kg)ならほぼ重さと同時に満ちる(§12.4 の5)。
- 枠に直すと Sloop 333枠・Galleon 3,333枠になり、今の値の3〜4倍。船の数・回航・荷待ち(port-freight-queue-and-warehouses.md §10)の計測は段階3の後に取り直す。
- 蒸気船は石炭庫が船倉を食う。航続距離に応じた石炭の重さと容積を、載せられる重さ・船倉から差し引く。史料の例では1,020載貨重量トンの船が石炭庫に120 t、約900 tの外輪船が214 tを積んだ[S25]。
- 既定値は船級の中で小さめの側にとった(Galleon 500 t は大西洋のガレオンの下限)。同じ船級でも時代・地域で大きさが違うので、船級の既定値と、造船の技術の段階による倍率を分けて持つ。

#### 5.4.4 倉庫

港の倉庫の 0.8 m²/枠(`PORT_WAREHOUSE_FLOOR_M2_PER_SLOT`)は床面積。容積への換算は `床面積 × 積み上げ高さ × (1 − 通路の割合)` とする。

| 荷の種類 | 積み上げ高さ(P) | 通路の割合(P) |
| :--- | ---: | ---: |
| 樽・ドラム(横置き3段) | 2.0 m | 0.3 |
| 袋・俵 | 2.5 m | 0.3 |
| 木箱 | 2.5 m | 0.3 |
| ばら物(穀物の床置き) | 1.5 m | 0.2 |

床面積の重量上限(既定1,500 kg/m²。英国の穀物倉の設計荷重3 cwt/平方フィート ≒ 1,640 kg/m²[S27])も持ち、穀物・鉱石の上階への積み過ぎを防ぐ。CE の倉庫の描画(port-freight-queue-and-warehouses.md §5.3 の床面積)は、この換算から逆算する。

#### 5.4.5 家畜・人

| 輸送 | 制約(P) |
| :--- | :--- |
| 歩かせる | 1つの群れの頭数(ウェールズ・スコットランドから英国南部への牛の群れは200〜400頭)、1日の距離(牛で約25〜30 km、草を食わせながら)[S28]、牧夫1人あたりの頭数(P、牛20〜40頭、羊100〜200頭)、途中の飼料と水。荷車・船の貨物の上限は使わない |
| 船に載せる | 床面積: 馬2.5〜3 m²/頭(帆船の馬房は長さ8フィート・幅4フィート ≒ 3 m²[S29])、牛1.5〜2 m²/頭(現代の基準で0.77 m²以上、体重の2/3乗に比例[S30])、羊・山羊0.3〜0.5 m²/頭(現代の基準0.26〜0.66 m²[S30])、豚0.5〜0.8 m²/頭、鶏0.05 m²/羽(籠)。中世の馬の輸送船 taride は20〜30頭、帆船 usciere は100頭まで[S29]。航海日数分の飼料と水の重さ・容積を荷に足す |
| 人 | 船内の床面積1〜1.5 m²/人と、航海日数分の食料・水 |

船に載せる家畜・人は、船倉の容積ではなく甲板・船倉の床面積で上限を決め、`deckAreaM2`(既定は `holdLiters / 2,500` m²、P)を船に持たせる。

#### 5.4.6 タンクと大型の品

- タンク車・タンク船は一回で消費するPackageではなく輸送資産。設備の自重は船の載貨重量/車両の許容積載量の定義に合わせ、貨物風袋へ二重に足さない。持ち運ぶタンクだけ風袋を加える。
- 船・機関車・大型固定機関は、回航・線路走行・分解輸送で運ぶ(§5.3)。

### 5.5 B2B/B2Cに共通の取引条件と、詰め替えの場所

[S3]の17〜18世紀英国では、買い手の瓶を商人の樽から満たす例がある。[S7]は17世紀のシャンパーニュ産ワインを樽で英国へ送り、到着後に瓶詰めした例を示す。[S8]のMoutonは1924年に全量のシャトー瓶詰めを導入するまで商人へ樽で送っていた。**「近世以降は産地瓶詰め」「都市では必ず瓶に詰め替える」のどちらにも固定しない**。

`Consignment`は品の基本単位の数量を正本とし、包装の内訳、容器の所有/持参/返却条件、詰める担当者と場所、受取側の条件を付帯情報として持つ。B2B/B2Cは相手・会計経路の区別であって、荷姿を決める規則ではない。

自動選択は次の順とし、利用者への個別の質問や設定を必要としない。

1. 商品の物性・保管条件と、送り手/運び手/受け手の設備・技術で不適合な方法を除外する。
2. 受取側の条件や、すでに封をした商品・持参容器・返却条件があれば優先する。完成済みの瓶を卸で買った場合はそのまま小売できる。
3. 条件指定がなければ、地元の慣行に合う既存容器を使い、利用できる方法の中で容器・詰め替え労働・輸送・損耗の総費用が小さい方法を選ぶ。同費用なら地域の慣行を優先する。
4. 卸・仲介者・店で詰め替える必要が生じた地点でだけ、正味数量を移し、空いた容器を在庫へ戻す。受渡しのたびに再梱包しない。輸送中の量は保管設備のない場所で勝手に詰め替えない。

小売価格 = 中身の仕入原価 × 正味量 + **その取引で実際に負担する**容器代または使用料 + 小分け/提供の労働費 + 現行の小売利幅。容器ごとの購入原価を持ち、同じ容器を再使用するたび新品価格を重ねない。預り金は返済義務で、売上や物価に混ぜない。持参容器や樽から注ぐ1杯に新品瓶の材料費を課さない。

人物の持ち物・店の在庫は基本単位で持つ。店頭の「瓶1本」はその荷の実量(既定0.75 L)、「1杯」は提供量。瓶の中身を飲んでも、再使用可能な瓶自体が消える扱いにしない。瓶内二次発酵など、製法自体が特定の容器を必要とする場合は製法の条件として指定する。現代Champagneの製法条件[S9]を全時代のWineへ遡及適用しない。

### 5.6 1個の価格: 同時代の日当比を主基準、生存費を照合に使う

史料の価格と賃金を同じ地域・年代・品質・取引段階でそろえ、`史料の品1個の価格 / 史料の普通労働者の日当`を得る。それをゲームの基準市場の普通労働者の日当に掛けて、新カタログの価格の校正値にする。歴史上のポンドや銀貨の名をゲームのSPへ直接同一視しない。[S10]は農業品価格と日当の系列を公開しており、食料・燃料の比較に使える。

- 初期の標準カタログは中世末〜近世初頭の欧州を基準にし、対象商品に合う系列の同じ年代窓を使う。現物支給・食事込みの賃金と現金日当、卸売と小売を混ぜない。
- ゲームへの年額→日当換算は年250日を**モデルの慣例値**として採用し、実際の年就業日数を歴史的な普遍定数とはしない。例えば穀物価格1なら年0.645 SP、日当0.00258 SP。初版の年0.52と混用しない。
- 生存費は日当とどちらか一方を選ぶ別基準ではなく、食料バスケットで購買力を照合するために使う。ゲームの1.5倍は労働者本人の食費に対する倍率で、歴史研究の家族全員の生活費に対する比とは同じでない。
- 普通品の仕様を先に決める。Bootsは普通の1足、Garmentsは普通の衣服一揃い。Arms/Toolsの「一式」は構成を定義する。本・宝石・馬・大砲など品質差が大きい物に全時代一律の日数を与えない。象・駱駝など欧州系列の外にある品を馬の固定倍率で史実化しない。
- 作業量と材料費で作る供給原価も照合する。小売価格だけ妥当でも原料費・賃金を払えない品を、根拠のないロット個数で帳尻合わせしない。

**単位変換と価格再校正は別の変更**。旧1単位=実物kなら、単位変換だけでは価格を1/kにする。日当比で得た目標価格に合わせる変更は、その後の明示したバランス変更とする。価格比からkを作り、物量をk倍にして同時に「金額も史実も保存できる」とは主張しない。家畜は現行の群れの引当ての契約から馬k=25、他はk=1を採用し、初版で価格から逆算した牛20・鶏400などの移行案は採用しない。

### 5.7 レシピを正味物量で確かめる

質量収支・乾物収支・収量の試験を作る。水・空気・燃料の燃焼・副産物・廃棄を含めず、単に出力の重さが入力より大きいというだけで不正にしない。容器の風袋は中身の歩留まりに含めない。

- CheeseとWineは`foodLots.ts`の既存の契約(1000 kgチーズに10000 L乳、200 Lワインに260 kgブドウ)を移行の起点にする。収率を後から校正する場合は単位変更と別に記録する。
- Bronzeは銅・錫の両方を使う合金として直す。Leatherは皮の面積、Clothは面積と目付、Breadは粉・水・焼成損失から再計算する。パンの史料は価格に応じ重量を変える制度も示しており、歴史上のloafを一律重量にできない[S13]。
- 卵・乳・羊毛などの反復生産は、生きた親個体の頭数と期間から出す。毎回ChickenやCattleを原料として消滅させない。革・肉・脂・牙などのと畜副産物は同じ個体からの取り分を一度だけ計上する。

### 5.8 単位に依らない市場の式

livestock-head-unit.md §4.1 を、本設計の前提として全品目に入れる。

- 価格は有効数字で丸める。
- 価格の動きと平滑化は、月の需要の割合で決める。
- 価格の需要は、単位に依らない重みで品に配る。

基本の単位は 1 つが小さい(ワイン1 L、鶏1羽、レモン1 kg、穀物1 kg)ので、この前提がないと価格が丸めで 0 になる。また、同じ金額の取引でも、品によって価格の動きが何桁も違ってしまう。1 人あたりの量の定数(§4.6)は、基本の単位で書き直す。

## 6. 古い保存

品ごとに「旧単位 1 = 基本の単位 k」の係数を、既存の物量契約から決める。読み込み時に1回、量をk倍、価格を1/kにする。価格の妥当性からkを推測するだけでは物量の移行を保証できない。定義のなかった品には、採用した仕様・k・根拠が既存契約かモデルかを移行表に残す。

- 入力iのレシピ係数a(旧出力1単位あたり)は、`a × k_i / k_output`。副産物も同様。入力だけk倍にするのは出力のkが1の場合だけ。
- 生産率・在庫・需要数量はk倍、単価・1単位あたりの労働・需要充足は1/k倍。月の需要を分母にした比、金額、実物量が単位変換だけでは不変であることを確かめる。
- 個体の頭数・実材積など、すでに実物量で保存される項目はそのままにする。名前が似ていても市場単位の数量と同じ変換を掛けない。
- 全商品共通の版を正本にし、家畜専用の版がある保存にも二重適用しない。生産・消費量の履歴、移動中の荷、注文、装備への換算も対象。
- 荷姿は今の保存にはない。移動中の荷は保存された数量を変えずに互換用の荷姿を付け、追加の容器代・原料消費を遡って請求しない。実装後の新規梱包から通常の会計に移る。
- 利用者が編集した品・新しく作った品には `GoodMeasure` がない。旧単位のまま(k = 1、基本の単位は「1 単位」)とし、質量は旧枠×150 kg、積付容積は旧枠×250 Lの互換推定にする。史実に校正した値とは表示しない。

## 7. 段階

1. 市場の式を単位に依らない形にする(§5.8、livestock-head-unit.md の段階 1)。
2. `GoodMeasure` を足し、今の単位のまま(k = 1)重さ・かさ・熱量・栄養を記入する。燃料・栄養・CE の置き場をこの量から計算する。§4.1 の食い違いをここで 1 つに決める。
3. 荷姿と適合の表、空容器の数量・所有者、製造時の材料消費を足す。荷の重さとかさを計算し、§5.4.2〜§5.4.5 の1頭・1台・船級・倉庫のkg・Lの上限を入れる(荷馬車・荷駄の2か所の食い違い、動物1頭あたりの枠の持ち方、船の載せられる重さを直す)。Wineなどのレシピの`Barrels`を実際の容器取得へ置き換える。既存の在庫樽を製造材料と二重消費しない。
4. レシピを量で確かめて直す(§5.7)。
5. 品を基本の単位に移す(k ≠ 1)。個数の品(家畜を含む)、液体、ばら物の順に、品の群ごとに入れて計測する。1 人あたりの量の定数・調整の表を書き直す。
6. 売買条件に応じた詰め替え・持参容器・容器込み売買と小売の1回分(§5.5)を接続する。産地/仲介者/店の複数経路を同じ数量の仕組みで扱う。
7. 古い保存の読み替え(§6)。

段階2は数量の意味を固定するだけ。段階3の容器費・輸送上限と段階4のレシピ修正は費用・供給を変えるので、価格据え置きでも経済挙動は変わる。段階5の単位変換と価格再校正は別々に評価する。古い保存への移行は各段階の公開時に必要なものを実装し、最後まで未対応のまま互換性を約束しない。

## 8. 計測

port-freight-queue-and-warehouses.md と同じ地図・期間で、段階ごとに次を比べる。

- §7.2 の指標と取引の件数。
- 品目ごとの価格・生産量・在庫(基本の単位で)。単位変換だけなら、数量×単価・実物量・同じ取引による相対的な価格変化が変わらないこと。
- 車両・船・倉庫の積荷の使われ方を重さと容積で別々に見る。荷車の隊(20 台)が 10〜12 t、荷駄の馬1頭が150 kg、船が `deadweightKg` と `holdLiters` を超えないこと。かさで満ちた荷(乾草・羊毛・空樽)と重さで満ちた荷(穀物・鉱石)の割合。
- 船の積載量を直した後の、船の数・回航・港の荷待ち・`noTransport` の変化。
- 荷姿の内訳、空容器の総数・所有者・取得原価と製造/破損の数量。再充填で容器が消えないこと、返送に輸送能力を使うこと、持参容器/封済み瓶の売買で二重請求しないこと。
- 1人あたりの食料・酒・燃料・衣服・道具の量。既存のモデル目標(穀物200 kg、薪1〜3 m³、靴0.25足など)と比較し、史料上の範囲がある場合は地域・時代を対応させる。初版の全目標を史料の確定値とは呼ばない。
- 資料にある史料値/物性範囲と、Pのモデル値を分けて結果を記録する。通常の関連テストの方針はAGENTS.mdに従う。本改訂でシミュレーションの計測は実行していない。

## 9. 採用方針(初版の確認依頼6項目への回答)

| 項目 | 採用する扱い | 根拠と残る作業 |
| :--- | :--- | :--- |
| 容器の値・組合せ | §5.2の代表プロファイルと§5.3の適合表で開始。内容量・風袋・積付容積を別に持つ | 型式の実測[S1]、時代/内容物で違う樽[S2]、物性[S6]。Pはモデル値として校正する |
| 空樽・空瓶の扱い | 初めから再使用可能。通常は容器込み売買、持参・返却条件も表現できる。全品使い捨ては採らない | 再充填・預り金・修理の実例[S3][S4]。遠方への返送は契約と費用次第で、自動で義務化しない |
| ばら物の基本単位 | kgを採用。bushelなどは地域・年代つき換算で表示する | 歴史的な度量衡の存在[S15]と、物性による質量/容積の換算[S6]を分離 |
| 瓶詰めの場所 | 産地・仲介者・輸入商・店・買い手の各経路を許す。技術/製法と取引条件で自動選択 | 持参瓶[S3]、英国到着後の瓶詰め[S7]、産地全量瓶詰め[S8]。B2B/B2Cだけで固定しない |
| 1個の値の基準 | 同じ地域・年代の価格/日当を主基準、生活費と製造原価を照合に使う | 価格・賃金の対応系列[S10]。現行賃金式を使用し、旧ロットの変換と値付けを分離 |
| 表示 | 在庫は正味量、荷の詳細は正味量+実際の荷姿、店頭は買うまとまり+正味量 | 史料で唯一のUIを決める問題ではないため、本設計の表示方針として採用。例は下記 |

表示例: 市場の在庫「ワイン 1200 L」、荷「ワイン 1200 L(200 L樽×6)」、端数入りの荷「ワイン 190 L(200 L樽×1)」、店頭「ワイン 1瓶(0.75 L)」、持参容器なら「ワイン 0.75 L」。容器内訳のない集計に架空の「樽何本」を付けない。

以上は利用者の細かな選択待ちにしない。残るのは、根拠が弱い物性・製造作業量の校正、既存207品目の旧ロット換算表、具体的な保存項目の監査と実装。史料がない値を「史実で決定済み」とはしない。

## 10. 調査資料と適用範囲

参照日: 2026-10-21。一次史料の公開訳、発掘品の型式データ、博物館解説、研究者本人のデータ、物性の公的/供給者資料を使った。近現代の資料を中世の規格や慣習の証明に転用しない。

| ID | 資料 | 確認できたこと / この設計での使い方 |
| :--- | :--- | :--- |
| S1 | [ICAC, Amphorae ex Hispania: Dressel 1, features](https://amphorae.icac.cat/amphora/dressel-1-tarraconensis-northern-coastal-area/features) | 特定の産地・型式で容量25.1 L、容器質量25.7 kg。amphoraという語だけで容量・風袋を統一しない |
| S2 | [Colonial Williamsburg, Meet the Cooper (2012)](https://podcast.history.org/2012/01/02/meet-the-cooper/) | 18世紀の復元技能の解説。caskは総称、barrelは容量名で、酒類と時期で異なる。液体と乾物の樽、靴や器物も含む梱包の実例 |
| S3 | [Ashmolean, Glass Bottle Seal from Temple Cowley](https://britisharchaeology.ashmus.ox.ac.uk/east-oxford/ob-bottle-seal.html) / [Corning Museum of Glass, Serving Bottle, c.1690](https://glasscollection.cmog.org/objects/38392/decanter-bottle) | 17〜18世紀英国の持参瓶への樽からの再充填、所有印、預り金、約半Lの瓶。0.75 Lが普遍でないことと、容器の所有/再使用の根拠 |
| S4 | [USS Constitution Museum, Roll out the Barrel (2016)](https://ussconstitutionmuseum.org/2016/03/10/roll-out-the-barrel/) | 米国帆走海軍の樽の修理と、空樽を解体し必要時に再組立てする実例。全樽を毎回廃棄する前提を置かない |
| S5 | [American Oil & Gas Historical Society, History of the 42-Gallon Oil Barrel](https://aoghs.org/transportation/history-of-the-42-gallon-oil-barrel/) | 1866年の42 US galの合意、1872年の業界採用。石油の数量単位と物理容器を分ける。159 Lや風袋30 kgを古代・中世へ適用しない |
| S6 | [FAO, Appendix XI: Bulk Density, Pelletability and Particle Size](https://www.fao.org/4/s4314e/s4314e0q.htm) | 小麦・粉砕小麦・乾草などのかさ密度。近現代の物性の参考で、歴史上の袋の規格ではない |
| S7 | [Union des Maisons de Champagne, The Origins of Champagne Production: Trade](https://maisons-champagne.com/en/encyclopedias/the-great-story-of-champagne-houses/chapter-i/article/the-origins-of-champagne-production-trade) | 17世紀、シャンパーニュから英国へ樽で輸送し現地で瓶詰めした経路。地域名だけで産地瓶詰めを強制しない |
| S8 | [Château Mouton Rothschild, 1924](https://www.chateau-mouton-rothschild.com/l-histoire/dates-clefs/dates-clefs-1924?lang=fr) | 当該シャトーでの全量産地瓶詰めの導入年と、それ以前の商人への樽出荷。他の地域・生産者の導入年とはしない |
| S9 | [Comité Champagne, Bottling and second fermentation](https://www.champagne.fr/en/about-champagne/how-champagne-is-made/bottling-and-second-fermentation) | 現代Champagneの瓶内二次発酵と製品瓶。容器が製法の条件になる例であり、近世全般の法規の証拠ではない |
| S10 | [Gregory Clark, Data, UC Davis](https://faculty.econ.ucdavis.edu/faculty/gclark/data.html) / [The long march of history (2007)](https://onlinelibrary.wiley.com/doi/abs/10.1111/j.1468-0289.2006.00358.x) | 英国の農業品価格・日当・購買力の系列。実データを使う際は年代・品質・単位・賃金の支給条件をそろえる。犬・猫・象など全品目の価格を保証する資料ではない |
| S11 | [J. Theodore Peña, The Reuse of Amphorae for Purposes Other than as Packaging Containers](https://www.cambridge.org/core/books/abs/roman-pottery-in-the-archaeological-record/reuse-of-amphorae-for-purposes-other-than-as-packaging-containers/C2EFC052D2DE8D109626CBF916D461AE) | ローマ陶器の再利用の研究。再使用不能な中身や臭い、他用途への再利用もある。全てを輸送用に無制限再使用とはしない |
| S12 | [Gasum, Natural gas and liquefied natural gas](https://www.gasum.com/en/gasum/products-and-services/natural-gas-and-liquefied-natural-gas-lng/) | 液化時の容積は気体時の約1/600、低温設備が必要。天然ガスとLNGを同じ固定Lの品として扱わない |
| S13 | [Fordham Medieval Sourcebook, The Assizes of Bread, Beer, & Lucrum Pistoris](https://sourcebooks.web.fordham.edu/source/breadbeer.asp) | 中世英国の法文の公開訳。穀物価格に応じたパン重量と、材料以外の費用の扱い。loafに普遍的な質量を与える根拠にはしない |
| S14 | [Yara, Ammonia](https://www.yara.com/industrial-nitrogen/base-chemicals/ammonia/) / [Airgas, Chlorine product catalogue](https://www.airgas.com/airgascatalog/catalog/P15_Chlorine_Pure_Gases.pdf) | 現代の無水アンモニアは加圧/低温で輸送、塩素は液化ガス用容器。既存のbarrelラベルを木樽と読む誤りを防ぐ物性上の根拠 |
| S15 | [The Magna Carta Project, 1215, Clause 35](https://magnacartaresearch.org/read/magna_carta_1215/Clause_35?com=sec) | ワイン・エール・穀物・布の度量衡の規定。史料上の単位を保存しつつ計算用のSI単位へ換算する。条文自体は全品共通の容量や近代換算値を与えない |
| S16 | [EIA, British thermal units](https://www.eia.gov/energyexplained/units-and-calculators/british-thermal-units.php?lv=true) | thermは100000 Btuというエネルギー量。Natural Gas/LNGの旧thermをLと誤認しない。MJ化ではBtuの定義も固定する |
| S17 | [Packhorse (Wikipedia)](https://en.wikipedia.org/wiki/Packhorse) / [Herefordshire Through Time, Pack horse transport](https://htt.herefordshire.gov.uk/herefordshires-past/the-post-medieval-period/transport/guest-author-essay-pack-horse-transport) / [Marple Local History Society](https://www.marplelocalhistorysociety.org.uk/society-meetings/meetings-2015-2016/19th-october-donald-reid-along-the-packhorse-trails-2.html) | 英国の荷駄1頭約2 cwt(約100 kg)、240 lb(110 kg)を左右の荷籠に分ける、列は12〜20頭(40頭まで)、1日約40 km。中世の一次史料の値ではない |
| S18 | [Pack animal (Wikipedia)](https://en.wikipedia.org/wiki/Pack_animal) / [World History Encyclopedia, Camel Caravans of the Ancient Sahara](https://www.worldhistory.org/trans/es/2-1344/las-caravanas-de-camellos-del-antiguo-sahara/) | 駱駝の荷は長い旅で約160 kg、100〜200 kg、最大約300 kg。二次資料 |
| S19 | [Encyclopaedia Britannica 3rd ed. (1797), Cart](https://jimclifford.ca/early_encyclopedia_britannica/articles/1797/eb_3rd_1797_005418.html) | ロンドンの荷車の上限(粉12袋・煉瓦750個・石炭1 chaldron)。頭数は確認していない |
| S20 | [Bentham manuscript JB/095/116/001 (Transcribe Bentham)](https://transcribe-bentham.ucl.ac.uk/td/JB/095/116/001) / [Stroud, Canals: the beginning](https://digitalstroud.co.uk/gettinghere-canals-beginning) | 有料道路法の草案で、広い車輪の荷馬車6 t・8頭、細い車輪の荷馬車と広い車輪の荷車3 t。18世紀に馬1頭が荷馬車で牽けたのは最大約1 t(地方史の記述) |
| S21 | [Bullock cart (Wikipedia)](https://en.wikipedia.org/wiki/Bullock_cart) / [Red River cart の記述](https://www.pbs.org/video/artifact-spotlight-ox-cart-yqzx2j) | 牛1頭の2輪車で600〜900ポンド(270〜410 kg)。北米19世紀の例 |
| S22 | [Stowage factor (Wikipedia)](https://en.wikipedia.org/wiki/Stowage_factor) / [Handybulk, Coal stowage factor](https://www.handybulk.com/coal-stowage-factor-in-bulk-shipping/) | 積付係数: heavy grain 45 ft³/lt(1.30 m³/t)、石炭48 ft³/lt(1.2〜1.4 m³/t)、鉄鉱石14 ft³/lt(0.40 m³/t)。近現代の海運の値 |
| S23 | [The Ships of the Acadian Expulsion (Landry)](https://freepages.rootsweb.com/~acadiancajun/genealogy/landryships.htm) / [Adverts 250 Project, 1766-02-11](https://adverts250project.org/2016/02/11/february-11/) / [Bunker Hill (1778 ship)](https://en.wikipedia.org/wiki/Bunker_Hill_(1778_ship)) | 植民地のスループ25〜70 tons burden(Chapelle の孫引き)、1766年の広告で約55 t、私掠船140〜222 t |
| S24 | [World History Encyclopedia, Caravel](https://www.worldhistory.org/Caravel/) / [Galleon](https://www.worldhistory.org/Galleon/) / [Spanish Galleon](https://www.worldhistory.org/Spanish_Galleon/) | カラベル初期80 t未満、後期100〜150 t、丸いカラベル300 t超。大西洋のガレオン500〜1,000 t、マニラのガレオン2,000 tまで。トンの基準(積載か排水量か)は明記されていない |
| S25 | [Kangaroo (1853), Liverpool University](https://www.liverpool.ac.uk/%7Ecmi/books/earlySS/kangaroo.html) / [Lindsay, History of Merchant Shipping vol.4 (Gutenberg)](https://gutenberg.org/cache/epub/74393/pg74393-images.html) / [H P Stephenson (1872)](https://www.tynebuiltships.co.uk/H-Ships/hpstephenson1872.html) / [Treaty of Washington papers](https://search.library.wisc.edu/digital/AV2AEREMFOCNGD8T/text/AGWXJILR25NWGL86) | 初期の鉄製スクリュー船400 tons burden、John Bowes(1852)459総トンで約540 t、H P Stephenson(1872)1,368載貨重量トン、1,020載貨重量トンの船の石炭庫120 t、外輪船の石炭214 t |
| S26 | [Tonnage (Wikipedia)](https://en.wikipedia.org/wiki/Tonnage) / [Builder's Old Measurement](https://en.wikipedia.org/wiki/Builder%27s_Old_Measurement) | tun は252ガロン・約40立方フィート、運賃の容積トン40立方フィート、Moorsom の登録トン100立方フィート。tonnage は容積の尺度で、重さではない |
| S27 | [The Mechanical Handling and Storing of Material (tekniskkulturarv.dk)](https://tekniskkulturarv.dk/book/f0752918-87a3-43f9-9662-e7990c425145?page=797) / [Mills Archive, Loading floor](https://millsarchive.org/glossary/a-z-glossary/3455) | 英国の穀物倉の床の安全荷重3 cwt/平方フィート(≒1,640 kg/m²、換算は本設計)。穀物1袋約100 kg。積み上げ高さは確認できていない |
| S28 | [Herefordshire Through Time, Droving](https://htt.herefordshire.gov.uk/herefordshires-past/the-post-medieval-period/transport/guest-author-essay-droving) / [Droving (Wikipedia)](https://en.wikipedia.org/wiki/Droving) | 牛の群れ200〜400頭、1日15〜20マイル。牧夫1人あたりの頭数は確認できていない |
| S29 | [Horse transports in the Middle Ages (Wikipedia)](https://en.wikipedia.org/wiki/Horse_transports_in_the_Middle_Ages) / [Turf Hallmarks, Shipping horses](https://www.tbheritage.com/TurfHallmarks/GoneAbroadf/Flora/FloraHorses.html) | 13世紀の taride 20〜30頭、usciere 100頭まで。19世紀の帆船の馬房8×4フィート |
| S30 | [Frontiers in Veterinary Science (2022), space allowance for sheep](https://www.frontiersin.org/articles/10.3389/fvets.2022.965635/full) / [Maritime Executive, Far From the Farm Gate](https://maritime-executive.com/features/far-from-the-farm-gate) | 現代の生体輸送の基準: 羊0.26〜0.66 m²、牛0.77 m²から、面積 = k × 体重^(2/3)。史実の船の値ではなく下限の参考 |
| S31 | [Stere (Wikipedia)](https://en.wikipedia.org/wiki/Stere) / [USDA Forest Service](https://research.fs.usda.gov/treesearch/12959) | 層積1 m³の実材0.6〜0.8 m³、cord 128立方フィートに実材約85立方フィート |
| S32 | [Barrique (yumda)](https://www.yumda.com/en/encyclopedia/Barrique.html) | ボルドーの barrique 225 L の空樽約45 kg。資料により23〜54 kg |

## 11. 全207品目の基本単位の割当

`goods-generator.ts`の`GOODS_DATA`を2026-10-21に照合(作業時HEAD: `92420c5c7`)。以下は**新しい正本の単位の決定**であり、旧ロットのkや全品目の歴史価格が確定したという表ではない。群ごとの候補荷姿は§5.3を使う。個数品の寸法・品質、材料の目付・断面はカタログの標準仕様として別に固定する。役務・大型輸送資産・気体は一般の箱詰め対象から外す。

<!-- catalogue-unit-map:start -->
| 基本単位 | 品目(カタログ名) | 仕様・換算の注意 |
| :--- | :--- | :--- |
| 実材積m³ | `Wood`, `Mahogany`, `Timber` | 木材。梁の本数は長さ・断面から換算 |
| kg | `Stone`, `Marble`, `Iron Ore`, `Copper Ore`, `Tin Ore`, `Lead Ore`, `Silver Ore`, `Gold Ore`, `Chromium Ore`, `Nickel Ore`, `Molybdenum Ore`, `Silicon Ore` | 石・鉱石。銀鉱石/金鉱石も地金や純金属含有量と混同しない |
| kg | `Iron Ingot`, `Copper Ingot`, `Tin Ingot`, `Lead Ingot`, `Silver Ingot`, `Gold Ingot`, `Chromium Ingot`, `Nickel Ingot`, `Molybdenum Ingot`, `Silicon Ingot`, `Bronze`, `Steel`, `Stainless Steel`, `Aluminum` | 地金・合金。延べ棒の本数で量を変えない |
| kg | `Grain`, `Wheat`, `Rye`, `Barley`, `Oats`, `Millet`, `Maize`, `Rice`, `Buckwheat`, `Peas`, `Broad Beans`, `Lentils`, `Chickpeas`, `Soybeans`, `Spelt` | 穀物・豆。穀種別かさ密度 |
| kg | `Turnips`, `Potatoes`, `Olives`, `Dates`, `Grapes`, `Apples`, `Pears`, `Plums`, `Figs`, `Lemons`, `Chestnuts` | 野菜・果物。個数売りは平均質量から換算 |
| 頭/羽 | `Cattle`, `Horses`, `Elephants`, `Camels`, `Sheep`, `Goats`, `Pig`, `Chicken`, `Cats`, `Dogs` | 1個体。体格・種類・役畜/食用などの仕様 |
| kg | `Fish`, `Game`, `Shellfish` | 可食原料の基準を定義し、丸魚・殻付き・枝肉の歩留まりを区別 |
| L | `Wine`, `Beer`, `Cider`, `Perry`, `Pomace Wine`, `Vinegar`, `Liquor`, `Milk` | 飲料。濃度・酒度などを仕様にする |
| kg | `Pomace`, `Honey`, `Salt`, `Dried Fruits`, `Raisins`, `Cheese`, `Smoked Cheese`, `Flour`, `Preserved food`, `Stockfish` | 保存食・食材。Stockfishの束の尾数や魚種を一定としない |
| kg | `Cocoa`, `Coffee`, `Spices`, `Tea`, `Tobacco`, `Sugarcane`, `Medicinal herbs` | 嗜好品・植物原料。Sugarcaneは生の茎と精製糖を同一視しない |
| kg | `Fodder`, `Hemp`, `Wool`, `Flax`, `Cotton`, `Reeds`, `Rubber`, `Peat` | 繊維・乾草など。Woolは1枚の羊毛でなく正味kg |
| kg | `Dyes`, `Incense`, `Resin`, `Amber`, `Obsidian`, `Ivory`, `Coral` | 天然素材。象牙1本/珊瑚1枝の質量を一律にしない |
| 個 | `Pearls`, `Gemstones` | 標準品質・大きさを定義。質量も保持しg/caratで表示可能 |
| 枚 | `Furs` | 普通の毛皮1枚、動物種・面積を仕様にする |
| 人 | `Slaves` | 旧名・IDは互換対象。人の移動条件として扱い一般容器にしない |
| L | `Tar`, `Coal Tar`, `Oil`, `Crude Oil`, `Kerosene`, `Lubricating Oil` | 油・タール。粘度/密度と容器の適合 |
| L | `Whales` | 移行後の意味は鯨油と明示。鯨肉との混合指標を解消する注記は後述 |
| kg | `Sulfur`, `Saltpeter`, `Coal`, `Charcoal`, `Coke`, `Clay`, `Volcanic Ash`, `Pumice`, `White sand`, `Lime`, `Slaked Lime`, `Ash`, `Alum`, `Potash`, `Slag`, `Phosphate Rock`, `Bauxite`, `Alumina`, `Cinnabar` | 粉粒体・鉱物。粉砕/焼成/乾燥などの状態で密度を変える |
| 個 | `Brick`, `Firebrick`, `Ceramics` | 標準煉瓦・耐火煉瓦・普通の陶器1点。寸法と質量を仕様にする |
| kg | `Glass`, `Roman Concrete` | ガラス材料、練り上がりコンクリート。調合・密度を別に持つ |
| m² | `Leather`, `Cloth`, `Silk`, `Linen`, `Paper`, `Sails` | 革・織物・紙・帆布。目付、幅/厚さ。衣服一揃い/船級別に必要面積を定義 |
| m | `Ropes`, `Copper Wire`, `Rail` | 径・断面・規格ごと。coilやlengthの長さを曖昧にしない |
| L | `Ink`, `Perfume`, `Rennet` | インク・香水・凝乳剤。Rennetは濃度/力価を仕様にする |
| 冊/足/組 | `Books`, `Boots`, `Garments`, `Harnesses`, `Tools`, `Arms`, `Instruments` | 1冊・1足・衣服/馬具/道具/武具/楽器の定義した1組 |
| 本/発/挺/門 | `Arrows`, `Bullets`, `Muskets`, `Artillery` | 実物1本/発/挺/門。砲の口径・重量を定義 |
| kg | `Gunpowder`, `Tallow`, `Beeswax`, `Soap` | 火薬・脂・蝋・石鹸。完成した蝋燭とは別 |
| 個 | `Egg`, `Bread`, `Candles`, `Spinning Wheel`, `Jewelry`, `Artworks`, `Sculptures`, `Tapestries`, `Relics` | 卵1個、規定重量のパン/蝋燭1個、完成品1点。品質・寸法を仕様にする |
| 個 | `Barrels` | 型式ごとの完成済み空樽1個。包装で使うときに再びWoodを消費しない |
| 隻/台 | `Sloop`, `Caravel`, `Galleon`, `Steamship`, `Stationary Steam Engine`, `Locomotive`, `Marine Steam Engine` | 船級・機関出力などの仕様。回航・設置・組立ての経路 |
| kg | `Machine Parts`, `Light Alloy Parts` | 標準用途の部品材料量。完成した機関1台とは分ける |
| 組 | `Lab Glassware`, `Precision Instruments` | 構成を定義した標準器具一式 |
| kg | `Medicines`, `Sulfuric Acid`, `Chlorine`, `Bleaching Powder`, `Nitric Acid`, `Synthetic Dye`, `Soda Ash`, `Caustic Soda`, `Synthetic Resin`, `Mercury`, `Phosphate Fertilizer`, `Synthetic Ammonia`, `Nitrogen Fertilizer` | 化学品・製剤。濃度/組成と相を定義。容器の適合でLやbarrelと誤読しない |
| MJ | `Natural Gas`, `LNG` | 発熱量の同一基準。物質のkgと相別の容積も保持 |
| 役務 | `Coins` | 現行の造幣・両替役務。通貨や金属の複製貨物にしない |
<!-- catalogue-unit-map:end -->

旧ロット換算で、すでに量が固定されているものはその量を保つ。Wine/Beer/Cider/Perry/Pomace Wineは200 L、Milkは1000 L、果物・チーズ・Pomaceは明記された1000 kg、乾燥果物・Raisinsは250 kg、kg建ての金銀は1 kg。家畜は現行の`animalsPerMarketHead()`から馬25頭、他は1個体。数値を決めていないwain/sack/palletを単語だけで一律1 tや50 kgへ変換しない。

境界の扱い:

- `Whales`は現在foodとfuelの両タグを持つbarrelで、鯨そのもの1頭でも純粋な鯨油でもない。新しい単位では鯨油Lを正本とし、食用肉を必要とする経路はkgの別の副産物へ分ける。旧保存の数量は一度だけ換算し、同じ1樽を肉と油の両方に全量計上しない。分離を実装するまでの旧混合指標を、史実の純鯨油の物量として報告しない。
- `Sugarcane`は生の茎kgとし、砂糖の保存効果をそのまま同量の茎に与えない。精製糖を必要とする経路は糖の収量を経る。これは単位変換と別のレシピ/意味の修正として扱う。
- `Honey`・`Tallow`・`Beeswax`・`Soap`・`Resin`・薬品は、状態が変わっても正味kgが変わらないよう質量を正本にした。小売の瓶・塊・棒は中身の量に換算する。
- `Cloth`/`Garments`の「1000人分」と`Sails`の「1組」は面積や衣服数を別々に導出する必要がある。旧価格から面積を逆算せず、既存の労働量・衣服の材料量・船級の帆面積を同時に監査する。
- 個数品の標準仕様が未定義の経路は、1個の呼び名だけを先に置き換えて公開しない。標準仕様・旧k・必要量・生産量をそろえた品群から移行する。史料の届かない架空のRelicsなどは、史実価格ではなく明示したゲームの仕様として決める。

## 12. 今の荷の計測(2026-10-21)

### 12.1 方法

今のコード(HEAD `92420c5c7`)で province-101 を5年、world-102 を3年、1か月の刻みで進めた(`fmg-long-distance-trade=on`)。出発するすべての荷について、品・数量・1単位の枠と、割り当てた車両・船を記録した(province-101 は5,273件、world-102 は1,815件。港で分けた荷は段ごとに1件)。

記録した荷に、今の1単位の重さとかさの仮定を当て、§5.4 の上限(荷駄の隊=馬50頭×100 kg・300 L、荷車の隊=20台×0.8 t・1,500 L、荷馬車の隊=20台×2 t・4,000 L、Sloop 50 t・70 m³、Caravel 100 t・140 m³、川船20 t・30 m³)と比べた。仮定は次のとおりで、単位の量が決まっていない品(§4.3)はこの仮定の分だけ結果が動く。

- 穀物・豆・芋は1 wain = 465 kg を袋詰め(見かけの密度は小麦0.77、大麦0.62、燕麦0.45、芋0.67 kg/L、袋の積付倍率1.15)。
- 1 bag = 60 kg、1 sack = 50 kg、1 barrel = 120 L(液体)・自重25 kg・積付180 L、1 cask = 200 L・40 kg・300 L、1 bale = 200 kg。
- Wood の1単位 = 10 m³(6.5 t、層積1.5倍)、地金・大理石の1単位 = 1 t。
- Cloth・Garments の「1,000人分」は文字どおり(布900 kg、衣服2 t)に読んだ。

計測に使った記録・集計のスクリプトは本設計書の外(作業用)に置いた。

### 12.2 今の1枠に入っている重さとかさ

今のモデルは1枠を150 kg・250 L 相当として車両・船の大きさを決めているが、品ごとの1単位の枠(`trade.bulk` の段階)は重さと結びついていない。

| 品 | 1枠あたりの重さ | 1枠あたりのかさ | 品 | 1枠あたりの重さ | 1枠あたりのかさ |
| :--- | ---: | ---: | :--- | ---: | ---: |
| Wood | 1,300 kg | 3,000 L | Honey | 64 kg | 60 L |
| Iron Ingot | 333 kg | 51 L | Cotton | 51 kg | 200 L |
| Marble | 200 kg | 89 L | Tallow | 44 kg | 60 L |
| 小麦・豆・芋・大麦(3枠/wain) | 157 kg | 230〜400 L | Salt | 30 kg | 29 L |
| Grain・Maize・Rice(4枠/wain) | 117 kg | 175〜185 L | Charcoal | 17 kg | 77 L |
| Ceramics | 131 kg | 291 L | Flour | 13 kg | 24 L |
| Beer | 60 kg | 75 L | Candles | 7 kg | 8 L |
| Chicken(1羽) | 1 kg | 5 L | Ropes | 12 kg | 20 L |

1枠の重さが品によって7 kgから1,300 kgまで180倍違う。同じ荷車の隊に、薪なら32枠で隊の上限を超え、塩なら530枠積んでもまだ重さが足りない。

### 12.3 §5.4 の上限に当てた結果

隊・船の「今の枠を満たした荷」が、§5.4 の上限の何割になるか(中央値・上位10%)と、上限を超える荷の割合:

| 地図 | 輸送 | 件数 | 重さ(中央・90%) | かさ(中央・90%) | 今の枠の使用率(中央) | 上限を超える荷 | かさで決まる荷 |
| :--- | :--- | ---: | :--- | :--- | ---: | ---: | ---: |
| province-101 | 荷駄 | 1,525 | 0.67・0.95 | 0.36・0.51 | 1.00 | 9% | 9% |
| province-101 | 荷車 | 695 | 0.59・0.59 | 0.46・0.46 | 1.00 | 0% | 3% |
| province-101 | 荷馬車 | 2,706 | 0.47・0.47 | 0.35・0.35 | 1.00 | 0% | 3% |
| province-101 | Sloop | 350 | 0.23・0.31 | 0.25・0.38 | 1.00 | 0% | 99% |
| province-101 | Caravel | 68 | 0.35・0.47 | 0.40・0.57 | 1.00 | 0% | 100% |
| world-102 | 荷駄 | 1,447 | 0.20・1.12 | 0.12・0.66 | 0.30 | 22% | 17% |
| world-102 | 荷車 | 40 | 0.35・1.40 | 0.29・1.71 | 0.46 | 30% | 55% |
| world-102 | 荷馬車 | 168 | 0.18・0.91 | 0.15・1.03 | 0.62 | 10% | 21% |
| world-102 | 川船 | 94 | 0.27・0.28 | 0.30・0.34 | 0.22 | 0% | 82% |
| world-102 | Sloop | 317 | 0.06・0.26 | 0.05・0.31 | 0.36 | 0% | 74% |

上限を超える荷の中身(件数 / その組の件数):

- province-101 の荷駄: 芋 59/101、大麦 24/51、小麦 16/23、豆 9/15、Iron Ingot 8/104、Artillery 7/39、Wood 5/7。
- world-102 の荷駄: 芋 94/96、大麦 66/81、Wood 47/123、燕麦 39/44、小麦 22/25、Iron Ingot 19/66、豆 18/21。荷馬車の Wood 17/17、荷車の Wood 12/12。

### 12.4 わかったこと

1. **Wood は1単位(10 m³・6.5 t)が5枠で、どの車両にも載らない**。world-102 では Wood の荷の多くが荷駄・荷車・荷馬車で運ばれ、§5.4 の上限の数倍の重さになる。§4.1 の 10 m³ と 1.2 m³ の食い違いを1つに決めるとき、Wood の枠も重さとかさから出し直す必要がある。
2. **3枠/wain の穀物・芋は、荷駄の馬1頭に約112 kg を載せている**。§5.4 の既定100 kg を1割ほど超える。4枠/wain の Grain・Maize は約84 kg で収まる。同じ wain でも品によって枠が3と4で違うことが、重さの差になっている。
3. **荷車・荷馬車は、今の枠を満たしても §5.4 の上限の5〜6割(荷車1台約0.47 t、荷馬車1台約0.94 t)**。§5.4 の既定(荷車0.8 t、荷馬車2 t)にすると、陸の量は1.7〜2倍に増える。荷馬車の既定2 t は史料(馬1頭で最大約1 t、細い車輪の荷馬車の法の上限3 t)の範囲だが、陸の量の増え方が大きいので、段階3で荷車・荷馬車の既定を中央値(1.2〜1.5 t)から始め、取引・輸送不足の変化を見て決める。
4. **船は今の枠を満たしても §5.4 の上限の2〜4割**。Sloop は約12 t しか運んでいない(史料の植民地のスループは25〜70 t)。船を §5.4 の値にすると海の量は3〜4倍になり、港の荷待ち・回航・`noTransport`(port-freight-queue-and-warehouses.md §10)が大きく変わる。
5. **船は容積で、陸は重さで満ちる**。袋詰めの穀物は1 kg あたり約1.5 L で、船倉の基準(1.4 L/kg)より大きく、陸の車両(荷車1.9 L/kg、荷馬車2 L/kg、荷駄3 L/kg)より小さい。船では穀物をばら積み(1.3〜1.4 L/kg)にするかどうかで、積める量が1割ほど変わる。荷姿の選択(§5.5)を船の積み込みに入れる意味がある。
6. **家畜を車両に載せている**。province-101 で荷の枠の0.7%、world-102 で2.3%が家畜(Horses は1単位25頭、Cattle、Camels、Pig、Elephants)で、すべて荷駄・荷車・船の貨物として運ばれている。§5.4.5 のとおり、歩かせる荷として車両の上限から外す必要がある。
7. **軽い品は今の枠が大きすぎる**。Salt・Flour・Charcoal・Candles・Ropes は1枠7〜30 kg で、§5.4 の尺度(150 kg・250 L)で数え直すと枠が1/3〜1/10 になる。ただし bag・sack・block・coil の量は決まっていない(§4.3)ので、この差の大きさは §12.1 の仮定に依存する。
8. **単位の量が決まっていない品が荷の0.4〜2.4%**(Glass、Sculptures、Harnesses、Liquor、Paper、Vinegar、Brick、Ivory、Bread など)。§11 の割当と §5.1 の物性を記入するまで、重さとかさを出せない。

### 12.5 段階3へ

- 船級ごとの載せられる重さ・船倉と、荷車・荷馬車の既定は、§12.4 の3・4のとおり陸と海の量を大きく変える。段階3では、まず重さとかさの計算と判定だけを入れ、上限は今の枠の量に合わせた値(荷車1台0.5 t、荷馬車1台1 t、Sloop 15 t など)から始める。その後、史料の既定へ段階的に寄せ、そのたびに計測する。
- Wood の1単位と枠、3枠/wain と4枠/wain の違い、家畜を車両から外すことは、上限の値に関わらず段階3の初めに直す。

### 12.6 積荷の即時の修正(2026-10-21、実装)

§12.5 の「上限の値に関わらず直す」4点を入れた。市場の式と、車両・船の上限(枠の数)は変えていない。

| 項目 | 内容 | 場所 |
| :--- | :--- | :--- |
| 量から出す枠 | 1単位の重さと積んだときのかさから `max(kg / 150, L / 250)` で枠を出す品を作った。今は単位の量が決まっている品だけ: 穀物・豆・芋(1 wain = `STAPLE_NEED_KG_PER_PERSON_YEAR / GROSS_FOOD_NEED` ≒ 465 kg を袋詰め。見かけの密度は品ごと、袋の積付倍率1.15、袋の重さ1%)、Wood・Mahogany(1単位 = `WOOD_M3_PER_UNIT` 10 m³、650・700 kg/m³、層積1.5倍)。単位の語が既定と違う品(利用者が単位を変えた品)には当てない | `goodCargoMeasure.ts`、`tradeCargo.ts getDefaultGoodCargoProfile` |
| 古い保存 | 読み込みのたびに、上の品の `cargo.cargoSlotsPerUnit` を量から出した値に直す。運んでいる途中の荷は積んだときの枠のまま | `goods-generator.ts migrateMeasuredCargoSlots`、`simulation.ts` |
| wain の3枠と4枠 | 小麦・大麦・豆(3枠)と Grain・Maize・Rice(4枠)を、すべて重さで3.13枠にした。かさの大きい燕麦・スペルト(4.75枠)、大麦・蕎麦・蕪(3.45〜3.57枠)はかさで決まる | 同上 |
| Wood の枠 | 1単位5枠 → 60枠(かさで決まる。重さなら43枠)。Wood の1単位を 10 m³ にそろえ、車両の材料の Wood を 1.2 m³ の読みから直した(荷車の隊 7 → 1.5、荷馬車の隊 16 → 4、荷駄の隊 0.5 → 0.1。荷車1台に挽いた材木0.35 m³、荷馬車1 m³、丸太の半分が材木) | `transportAssetOrders.ts` |
| 家畜を歩かせる | 陸だけの経路では、家畜(`liveAnimal`)は車両の枠を取らない(`getRouteCargoSlotsPerUnit` が0)。家畜だけの荷は車両を予約せず、積み込みを待たずに出る(`departDrove`)。船・川船の区間がある経路では、今までどおり枠を取る | `tradeCargo.ts`、`caravans.ts`、`markets-generator.ts`、`tradeTransportRoom.ts` |
| 荷馬車の積載量 | 240枠 / 180枠 / 実効160枠 を160枠に、荷駄の 36 / 40 を36にそろえた。車両の設計(`TransportAssetBlueprint`)の枠と牽く頭数は、交易の定義(`LAND_TRANSPORTS`)から取る | `tradeCargo.ts`、`transportAssetOrders.ts` |

計測(1か月の刻み、`on`。修正前(HEAD `463f332fc`)→ 修正後):

| 地図・年 | 取引(件) | 高額品の取引 | 24日以上の高額品 | `noTransport`(高額品) | 支払いの比 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| province-101・1年 | 78 → 83 | 70 → 73 | 66 → 69 | 0 → 0 | 1.000 → 1.000 |
| province-101・2年 | 172 → 172 | 122 → 120 | 96 → 90 | 0 → 0 | 1.000 → 1.000 |
| province-101・3年 | 392 → 356 | 252 → 214 | 201 → 153 | 0 → 2(1) | 1.000 → 1.000 |
| province-101・4年 | 803 → 760 | 404 → 372 | 308 → 269 | 9(5) → 5(0) | 1.000 → 1.000 |
| province-101・5年 | 859 → 880 | 540 → 520 | 396 → 351 | 5(3) → 0(0) | 0.984 → 0.995 |
| world-102・1年 | 214 → 212 | 158 → 159 | 143 → 145 | 90(12) → 99(17) | 1.000 → 1.000 |
| world-102・2年 | 316 → 324 | 266 → 271 | 250 → 253 | 202(53) → 135(36) | 0.993 → 0.994 |
| world-102・3年 | 314 → 298 | 245 → 227 | 221 → 200 | 97(34) → 65(19) | 1.000 → 0.982 |

運んだ荷(出発した荷の合計。修正前 → 修正後):

| 地図 | 品 | 数量 | 枠 |
| :--- | :--- | :--- | :--- |
| province-101(5年) | Grain | 93,603 → 95,950 wain | 374,412 → 300,562 |
| province-101 | Horses | 523 → 643 head | 2,615 → 0(すべて歩いた) |
| province-101 | Pig | 209 → 123 head | 837 → 3 |
| province-101 | Wood | 12.5 → 34.8 | 63 → 2,088 |
| world-102(3年) | Wood | 681 → 695 | 3,406 → 41,335 |
| world-102 | Cattle | 187 → 181 head | 936 → 900(海の区間のある経路) |

- world-102 では Wood の荷が今までと同じ量のまま12倍の枠を取り、荷車の荷が40 → 229件、荷馬車の荷が168 → 282件に増えた。修正前は荷車・荷馬車・荷駄の Wood の荷が §5.4 の重さの上限を数倍超えていたが、修正後は荷車・荷馬車で上限を超える荷がなくなった(§12.3 の表の再計測で、荷車・荷馬車の「上限を超える荷」は 30%・10% → 0%・0%)。
- Wood の荷が陸の車両を使うようになった分、world-102 の3年目は高額品の取引が減った(245 → 227件)。`noTransport` は減っているので、車両の不足で止まったのではない。province-101 の3〜5年目の高額品の減り(252 → 214 など)は、初めは揺れとみたが、§12.7 の盗賊なしの計測で、揺れではなく修正による差と分かった。
- 家畜は陸だけの経路では車両を使わなくなった。province-101 の馬は 523 → 643 頭に増えた。
- 荷駄の隊36枠は、1枠150 kgで5.4 tになり、馬50頭×100 kg(§5.4.2)を8%超える。荷駄の「上限を超える荷」は、Grain の枠が4 → 3.13 になって隊に積める量が増えたため、province-101 で 9% → 42% に増えた(超えても108 kg/頭)。荷駄の枠を1頭あたりの重さから出し直すのは、§12.5 の上限の校正で行う。

#### 残る課題

- 単位の量が決まっていない品(§4.3)は、今の `trade.bulk` の枠のまま。Timber(beam)・Charcoal(sack)・Salt(bag)など。
- Wood を材料にするレシピ(Charcoal・Barrels・Tar・Ash・Timber など)は、1単位 10 m³ の量で確かめていない(段階4)。
- 家畜の群れの移動に、牧夫の賃金・途中の飼料の費用を入れていない。運賃は今までどおり、品の交易の性格から出す。
- 荷駄・荷車・荷馬車・船の上限(枠の数)を、1頭・1台・船級の重さと容積から出すこと(§5.4.2〜§5.4.3)。

## 13. 段階2: 今の単位の中身を全品目に記入(2026-10-21、実装)

### 13.1 入れたもの

`goodMeasureCatalog.ts` に、全207品目について、今の市場の1単位が実物でどれだけかを記入した(`GOOD_MEASURES`)。単位は変えていない(k = 1)。Wool は今も1,000枚分、Horses は25頭分のまま。

| 項目 | 内容 |
| :--- | :--- |
| 持つ値 | 単位の語、中身の言葉(「465 kg」「200 L」「1,000 fleeces」)、正味の重さ、荷姿に詰める前の容積(ばら物は見かけの密度、個数の品は外形)、既定の荷姿、量の出所 |
| 荷姿 | 袋(積付1.15倍・袋の重さ1%)、俵・束(1.1倍・1%)、樽120 L(1.5倍・自重25 kg)、酒樽(1.5倍・0.2 kg/L)、木箱(1.25倍・8%)、ばら積み(1.05倍)、層積の木材(1.5倍)、歩く(家畜・人)、自分で動く(船・機関車)、管(天然ガス)、運ばない(造幣の役務) |
| 量の出所 | `code` 68品(ほかのモジュールがその量で数えている)、`label` 17品(単位の語が量を名乗る)、`recipe` 25品(レシピの入力の重さから)、`model` 97品(何も決めていないので本節で決めた) |
| 試験 | 全品目がカタログの単位の語のまま記入されていること、塩の袋60 kg・羊毛1,000枚が持ち主のモジュールの定数と同じこと(`goodMeasureCatalog.test.ts`) |

積荷の枠を量から出すのは、§12.6 の品(穀物・豆・芋、Wood、Mahogany)だけのまま。ほかの品は今の `trade.bulk` の枠を使い続ける。

### 13.2 コードがすでに決めていた量

調べると、単位の語と違う量で数えている品がある。今の数量はこの量なので、記入もこれに従った。

| 品 | 単位の語 | コードの量 | 場所 |
| :--- | :--- | :--- | :--- |
| Coal・Saltpeter・Sulfur・Phosphate Rock・Bauxite・Cinnabar・Crude Oil・Natural Gas | wain・barrel・sack・therm | 1 t(鉱山の埋蔵量・産出をtで数え、kg建ての品以外は1単位=1 t) | `mineOperations.ts`、`goodUnits.ts`、`mineralResourcesTypes.ts FUEL_MINERAL_COMMODITIES` |
| 鉱石・地金・青銅 | wagon | 1 t | 同上、`smelterOperations.ts` |
| Stone・Marble | pallet | 1 t | `quarryOperations.ts` |
| Salt | bag | 60 kg | `saltLogistics.ts SALT_KILOGRAMS_PER_BAG` |
| Wool | fleece | 1,000枚(1枚1.5 kgで1.5 t) | `woolProduction.ts` |
| Cloth・Garments | wardrobe bolt・lot | 衣服1,000揃い分。Cloth は Wool 6(6,000枚)から織る | `goods-generator.ts` の注記 |
| Harnesses | set | 100組 | `craftDemandCalibration.ts` |
| Boots・Bread | pair・loaf | 20足・20個(表示) | `goodsUnitFlavor.ts` |

Crude Oil の1単位は約1,180 L(42ガロン樽の7本分)、Natural Gas の1単位は 1 t(約1,300 m³、約47 GJ)になる。単位の語(barrel・therm)とは桁が違う。

本節で決めた単位の量(`model`): sack 50 kg、bag 60 kg(塩の袋に合わせた)、bale 200 kg、chest 50 kg、bundle 25 kg、barrel 120 L(固体も120 Lを満たした量)。レシピから決めた量(`recipe`)は、入力の重さから歩留まりを引いた量(Steel 1 t、Tools・Arms 500 kg、Paper・Books 200 kg、Sails 1 t、Timber 7.5 m³ など)。

### 13.3 量から出した枠と今の枠

量から出した枠(§5.4.1)を今の枠と比べた(全品目、`trade.bulk` の枠に対する比):

| 比 | 品の数 | 例 |
| :--- | ---: | :--- |
| 0.1倍未満 | 19 | Pearls・Gemstones・Jewelry(1個0.1〜0.2 kg に1枠)、Perfume・Ink・Rennet(1 L)、Amber、Silk、Leather、Linen |
| 0.1〜0.5倍 | 56 | Salt 0.20、Dyes 0.23、Spices・Medicines 0.25、Candles 0.24、Tallow 0.30、Charcoal 0.31、Honey 0.43、Furs 0.11、Boots・Bread・Egg 0.11〜0.14、Flour 0.09 |
| 0.5〜2倍 | 66 | Wine 0.53、Beer 0.40、Cotton 0.63、Iron Ore・Stone 1.33、Coal 1.67、Fish 1.29、Hemp 1.71、Tools 1.39、Arms・Muskets 1.67 |
| 2〜5倍 | 37 | Iron Ingot 2.4、ほかの地金・Steel・部品 3.6、Cheese 2.4、Milk 2.73、果物の lot 3〜3.3、Crude Oil・Sulfur・Saltpeter 2.2、Coke 2.3、Sails 2.75、Harnesses 4.2 |
| 5倍以上 | 10 | Wool 5.5、LNG 6.7、Bullets 7.2、蒸気機関 7.2〜14.4、Timber 9、Wood・Mahogany 12(§12.6 で切り替え済み)、Cloth 14.7、Garments 23.5 |
| 運ばない | 19 | 家畜・人(歩く)、船・機関車(自分で動く)、Natural Gas(管)、Coins |

今の枠は、軽くて高い品(宝飾・香辛料・塩・染料)のかさを数倍〜千倍に、重いロット(地金・果物・布・衣服・羊毛)のかさを数分の一に数えている。

### 13.4 重さあたりの値の食い違い

1 kg あたりの値を Grain(1 wain = 465 kg で値1)と比べると、次の品は史料の価格の比と桁が合わない。単位の中身(コードの量)は正しいので、値の方の問題になる。

| 品 | 1 kg の値(Grain = 1) | 史料の目安(Grain = 1) |
| :--- | ---: | :--- |
| Wool(1,000枚 = 1.5 t、値2) | 0.6 | 3〜6(中世英国の羊毛は小麦の数倍の値/kg) |
| Cloth(4 t、値15) | 1.7 | 10〜50(普通の毛織物) |
| Garments(4 t、値20) | 2.3 | Cloth 以上 |
| Salt(60 kg、値3) | 23 | 2〜5 |
| Bread(20個 = 20 kg、値2) | 47 | 1.5〜3 |
| Linen(20 kg、値6) | 140 | 10〜20 |
| Flour(50 kg、値1.5) | 14 | 1.2〜1.5 |

量から出した枠に切り替えると、Wool・Cloth・Garments は1単位の枠が5〜23倍になり、値が重さに見合わないので交易がほぼ止まる。逆に Salt・Bread・Flour・Linen は枠が1/5〜1/10になり、値が高すぎる分、遠くまで運ばれやすくなる。

### 13.5 次の段階

枠の切り替えは、単位の中身がコード・単位の語で決まっていて、1 kg あたりの値が史料と桁で合う品から、群ごとに行い、そのたびに計測する。

1. 鉱石・地金・鉱物・石・燃料(`code`、1 t)。Coal・Iron Ore など。
2. 食品の lot と酒樽(`code`・`label`)。Wine・Beer・Cheese・Milk・果物。Milk は1 kg の値が Grain の0.45で、遠くへ運ばない品なので枠が大きくなっても影響は小さい見込み。
3. 軽い高額品(宝飾・香辛料・薬・香)。枠が1/4〜1/1000になるので、高額品の遠距離交易が大きく増える。照合で荷の数量に上限(1回の荷の価値の上限など)がないかを先に確かめる。
4. Wool・Cloth・Garments・Salt・Bread・Flour・Linen など §13.4 の品は、値の見直し(§5.6 の日当比での再校正)と一緒に行う。Wool・Cloth・Garments・Flour・Bread は §21 で行った。Salt は §22 で行った。Linen・酒樽5品・Ink・Rennet・Leather・Beeswax は、先に直すものが見つかったので残した(§21.5)。

### 12.7 校正用に盗賊の出没を止める(2026-10-21、実装)

隊商が盗賊・戦争に襲われる判定(`TradeSecurity.getBanditRiskPerDay`)は乱数で、同じ地図を同じ設定で進めても結果が変わっていた。単体の試験(`caravans.test.ts` の §10.24 の試験)も、数回に1回、隊商が襲われて失敗していた。

| 項目 | 内容 | 場所 |
| :--- | :--- | :--- |
| 設定 | 世界の設定 `fmg-caravan-raids` を足した。`off` で隊商の危険度が0になり、盗賊・戦争に襲われない。危険度を読む所(運賃・支払い条件・食料の輸入・護衛の求人)もすべて0を読む。既定(値なし)は今までどおり襲われる | `simulation/worldSettings.ts`、`tradeSecurity.ts areCaravanRaidsEnabled` |
| 計測 | `npm run sim` に `--world-setting fmg-caravan-raids=off` を付ける | `scripts/sim.mts`(変更なし) |
| 試験 | 長距離交易を有効にして日を進める `caravans.test.ts` の4つの試験は `off` で動かす。`off` で危険度0・襲われないことを `tradeSecurity.test.ts` で確かめる | |

盗賊なしでは、同じ地図・同じコードの計測が2回とも完全に同じ値になった(province-101 5年、world-102 3年)。ほかの乱数で結果が変わることは、この計測では見られなかった。

§12.6 の修正の計測を、盗賊なしで取り直した(修正前 HEAD `463f332fc` → 修正後):

| 地図・年 | 取引(件) | 高額品の取引 | 24日以上の高額品 | `noTransport`(高額品) | 支払いの比 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| province-101・3年 | 391 → 356 | 252 → 214 | 201 → 153 | 0 → 2(1) | 1.000 → 1.000 |
| province-101・4年 | 810 → 751 | 420 → 369 | 325 → 273 | 8(5) → 5(0) | 1.000 → 1.000 |
| province-101・5年 | 847 → 851 | 530 → 506 | 365 → 340 | 2(2) → 0(0) | 1.000 → 0.992 |
| world-102・1年 | 214 → 212 | 158 → 159 | 143 → 145 | 90(12) → 99(17) | 1.000 → 1.000 |
| world-102・2年 | 314 → 322 | 261 → 270 | 245 → 254 | 200(50) → 148(35) | 0.993 → 0.994 |
| world-102・3年 | 293 → 295 | 224 → 224 | 199 → 197 | 97(36) → 64(26) | 0.984 → 0.981 |

province-101 の高額品の減りがどの修正によるかを、修正を1つずつ戻して分けた(province-101 の高額品の取引、3年・4年・5年):

| 版 | 3年 | 4年 | 5年 |
| :--- | ---: | ---: | ---: |
| 修正前 | 252 | 420 | 530 |
| 修正後 | 214 | 369 | 506 |
| 修正後から、穀物・豆・芋の枠だけ元(3枠・4枠)に戻す | 225 | 412 | 524 |
| 修正後から、家畜を歩かせるのだけやめる | 231 | 374 | 522 |

- 4年目の減り(420 → 369)の大部分は、穀物・豆・芋の枠の変更による。Grain・Maize・Rice が4枠から3.13枠になり、陸の荷として安く多く運ばれるようになった分(4年目の取引は、穀物の枠を戻すと 751 → 792 件)、高額品の取引が減った。
- 3年目の減り(252 → 214)には、家畜を歩かせることも効いている。
- どちらも戻しただけでは修正前に戻らない。残りは Wood の枠・車両の材料の Wood の量・荷馬車の枠の統一による。
- world-102 の3年目は、盗賊なしでは修正前後で高額品の取引が同じ(224件)。§12.6 の表の 245 → 227 件の差は、盗賊の乱数による揺れを含んでいた。

これからの計測は、盗賊なし(`fmg-caravan-raids=off`)で取る。盗賊の影響を見るときだけ、既定に戻して比べる。

## 14. 枠の切り替え 第1群: 鉱物・金属・石(2026-10-21、実装)

§13.5 の1。鉱山・製錬所・石切場が t(金銀は kg)で数えている品の枠を、§13 の量から出す枠に切り替えた。

| 品 | 1単位 | 今までの枠 → 量から出した枠 |
| :--- | :--- | :--- |
| Coal・Phosphate Rock・Bauxite・Sulfur・Saltpeter・Crude Oil | 1 t | 3〜4 → 6.7(重さで決まる) |
| Coke | 1 t | 4 → 9.3(かさで決まる) |
| Cinnabar | 1 t | 2 → 6.7 |
| 鉱石8品 | 1 t | 3〜5 → 6.7 |
| 地金8品・Bronze・Steel・Stainless Steel・Aluminum | 1 t | 2〜3 → 7.2(木箱の重さ8%を含む) |
| Stone・Marble | 1 t | 5 → 6.7 |
| Silver Ore・Gold Ore | 1 kg | 0.05 → 0.0067 |
| Silver Ingot・Gold Ingot | 1 kg | 0.005 → 0.0072 |

- 場所: `goodCargoMeasure.ts MEASURED_SLOT_GOODS`。古い保存は §12.6 と同じく読み込み時に直る(`migrateMeasuredCargoSlots`)。
- カタログの行が自分の枠を持つ品(金銀)も、切り替えた品は量から出した枠を使う(`goods-generator.ts` の既定のカタログの組み立て)。運び方の区分(`handlingClass`)は行の値を保つ。

計測(盗賊なし、§12.7。切り替え前 → 後):

| 地図・年 | 取引(件) | 高額品の取引 | 24日以上の高額品 | `noTransport`(高額品) | 支払いの比 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| province-101・3年 | 356 → 369 | 214 → 228 | 153 → 175 | 2(1) → 1(0) | 1.000 → 1.000 |
| province-101・4年 | 751 → 738 | 369 → 354 | 273 → 257 | 5(0) → 5(1) | 1.000 → 1.000 |
| province-101・5年 | 851 → 881 | 506 → 514 | 340 → 359 | 0 → 0 | 0.992 → 0.997 |
| world-102・1年 | 212 → 215 | 159 → 162 | 145 → 148 | 99(17) → 97(16) | 1.000 → 1.000 |
| world-102・2年 | 322 → 306 | 270 → 253 | 254 → 231 | 148(35) → 184(52) | 0.994 → 0.995 |
| world-102・3年 | 295 → 277 | 224 → 205 | 197 → 178 | 64(26) → 131(40) | 0.981 → 0.976 |

運んだ荷(出発した荷の合計。切り替え前 → 後):

| 地図 | 品 | 数量 | 枠 |
| :--- | :--- | :--- | :--- |
| province-101(5年) | Iron Ingot | 259 → 267 t | 776 → 1,923 |
| province-101 | Lead Ingot・Bronze・Copper Ingot | 76 → 85 t | 247 → 609 |
| province-101 | Marble | 205 → 236 t | 1,025 → 1,573 |
| province-101 | Tools・Arms | 189 → 194 | 566 → 583 |
| world-102(3年) | Iron Ingot | 224 → 243 t | 671 → 1,724 |
| world-102 | Tools | 39 → 68 | 116 → 203 |
| world-102 | Wood | 415 → 640 | 24,561 → 38,092 |
| world-102 | 荷車・荷馬車の荷 | 389 → 512件 | |

- 金属・石の運ぶ量は減らなかった(地金は1枠あたりの値がまだ高く、枠が2.4〜3.6倍になっても照合で選ばれる)。
- world-102 の2〜3年目は、高額品の取引が減り(270 → 253、224 → 205)、`noTransport` が増えた(64 → 131)。同じ期間に Wood の荷が1.5倍(枠で24,561 → 38,092)になり、陸の車両を取り合っている。金属の枠が増えて照合の順と車両の割り当てが変わり、Wood の荷が増えた結果とみる。Wood の荷が陸の量の大部分を占める状態(§12.6)が、ほかの荷の輸送を止め始めている。
- province-101 は年によって増減が入れ替わり、5年目は取引・高額品とも増えた。

#### 残る課題

- Wood(1単位60枠)が陸の車両を大量に使う。薪は史実では近くでしか運ばれず、遠くへは川・海で運んだ。陸の Wood の照合で運賃が重さとかさに見合っているか(運賃が枠に比例しているか)を確かめる。
- 次は §13.5 の2(食品の lot と酒樽)。

## 15. 運賃を枠に比例させる(2026-10-21、実装)

§14 の残る課題。照合の運賃(`getTransportCost`)は「距離 × 品の交易の性格の weight + bulk」で、積荷の枠と関係がなかった。Wood は1単位が60枠になっても(§12.6)、運賃は weight 4 + bulk 5 = 9 のままで、荷車の隊1つに1.3単位しか載らないのに、普通の品と同じ運賃で陸を運ばれていた。

| 項目 | 内容 | 場所 |
| :--- | :--- | :--- |
| 運賃の重み | 枠を量から出す品(§12.6・§14 の品)は、その経路での枠 × `FREIGHT_LOAD_PER_SLOT`。ほかの品は今までどおり weight + bulk | `tradeOpportunityEstimator.ts getTransportCost` |
| 1枠あたりの重み | 8 ÷ 3.13 ≒ 2.56。Grain 1 wain(3.13枠)が今までの weight 4 + bulk 4 = 8 と同じ運賃になる値 | 同上、`goodCargoMeasure.ts WAIN_FREIGHT_SLOTS` |
| 経路 | 照合・国の調達・市場の画面(交易の機会)で、運賃に経路を渡す。家畜が陸だけの経路で歩くとき(枠0)は、牧夫と途中の費用の代わりに今までの weight + bulk の運賃を払う | `markets-generator.ts`、`strategicProcurement.ts`、`controllers/marketTradeOpportunities.ts` |

運賃の変わり方(今まで → 後、Grain を1とした比):

| 品 | 今まで | 後 |
| :--- | ---: | ---: |
| Grain・Wheat など(3.13枠) | 1 | 1 |
| Oats・Spelt(4.75枠) | 0.75〜1 | 1.5 |
| Wood・Mahogany(60枠) | 1.1 | 19 |
| 地金(7.2枠) | 0.75〜0.9 | 2.3 |
| 鉱石・Coal・Stone(6.7枠) | 1〜1.25 | 2.1 |
| 金銀の地金(1 kg、0.0072枠) | 0.4 | 0.002 |

計測(盗賊なし。§14 の後 → 本節の後):

| 地図・年 | 取引(件) | 高額品の取引 | 24日以上の高額品 | `noTransport`(高額品) | 支払いの比 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| province-101・3年 | 369 → 354 | 228 → 218 | 175 → 165 | 1(0) → 0(0) | 1.000 → 1.000 |
| province-101・4年 | 738 → 714 | 354 → 349 | 257 → 256 | 5(1) → 4(0) | 1.000 → 1.000 |
| province-101・5年 | 881 → 870 | 514 → 523 | 359 → 363 | 0 → 0 | 0.997 → 0.993 |
| world-102・1年 | 215 → 206 | 162 → 154 | 148 → 143 | 97(16) → 95(16) | 1.000 → 1.000 |
| world-102・2年 | 306 → 305 | 253 → 255 | 231 → 231 | 184(52) → 155(51) | 0.995 → 0.988 |
| world-102・3年 | 277 → 285 | 205 → 214 | 178 → 192 | 131(40) → 93(37) | 0.976 → 0.987 |

運んだ荷(出発した荷の合計。§14 の後 → 本節の後):

| 地図 | 品 | 数量 | 枠 |
| :--- | :--- | :--- | :--- |
| province-101(5年) | Wood | 40 → 13 | 2,426 → 760 |
| province-101 | Marble | 236 → 115 t | 1,573 → 768 |
| province-101 | Iron Ingot | 267 → 274 t | |
| world-102(3年) | Wood | 640 → 399 | 38,092 → 23,594 |
| world-102 | Marble | 90 → 74 t | |
| world-102 | 荷車・荷馬車の荷 | 512 → 379件 | |

- Wood の陸の荷が province-101 で1/3、world-102 で6割に減り、world-102 の `noTransport` が戻った(131 → 93)。3年目の高額品は 205 → 214件(§12.6 の修正の前は224件)。
- world-102 に残る Wood の荷(399単位、278件)はすべて陸の荷。運賃は19倍になったが、隣り合う市場の間の短い距離では、値の差がまだ運賃を上回る。薪を近くの町へ運ぶのは史実にもある。
- 地金は運賃が2.3倍になっても運ぶ量が変わらない。1 t の値(Iron Ingot 8)に比べて運賃がまだ小さい。

#### 残る課題

- 運賃は、陸・川・海の別なく距離に比例する。史実では水運は陸運の1/10〜1/20(t・km あたり)で、薪・石・穀物の遠距離の荷は水で運ばれた。区間ごとの運賃(陸・川・海の別の1枠・1 km あたりの値)にすると、Wood の荷が水路へ移るはず。照合の運賃全体の水準が変わるので、別に計測して入れる。
- 次は §13.5 の2(食品の lot と酒樽)。

## 16. 陸・川・海の運賃の差(2026-10-21、実装)

§15 の残る課題。照合の運賃は、陸・川・海の区別なく直線距離に比例していた。

### 16.1 史料

| 資料 | 陸 : 川 : 海(同じ荷・同じ距離の運賃) |
| :--- | :--- |
| 中世英国の州長官の会計(Masschaele 1993。[Viabundus の紹介](https://www.landesgeschichte.uni-goettingen.de/roads/viabundus/?p=939)) | 陸は川の約2倍。[別の紹介](https://www.medievalists.net/tag/economics-general/page/5/)では陸は水運の10倍以上 |
| ディオクレティアヌスの最高価格令(Kunow の読み。[Internet Archaeology](https://intarch.ac.uk/journal/issue36/5/5-4.html)) | 川は海の3.9〜7.8倍、陸は川の10倍以上 |
| ローマの嵩物の輸送(Rahn、同上) | 陸は海の28倍 |

中世の値(陸 : 川 : 海 ≒ 1 : 0.5 : 0.1)を採った。ローマの比(1 : 0.1 : 0.035)はさらに水運が安い。Masschaele の論文と最高価格令の価格表の原典は確かめていない。

### 16.2 入れたもの

| 項目 | 内容 | 場所 |
| :--- | :--- | :--- |
| 区間の運賃の重み | `FREIGHT_MODE_FACTOR`: 陸1、川0.5、海0.1(旧い `water` も海と同じ)。経路の各区間の長さで重みを平均した値を、運賃に掛ける(`getRouteFreightModeFactor`)。陸だけの経路は今までと同じ | `tradeOpportunityEstimator.ts getTransportCost` |
| 市場の画面 | 交易の機会の運賃は、陸・川・海の距離から同じ重みを出す(`getFreightModeFactorFromLengths`) | `controllers/marketTradeOpportunities.ts` |
| 運べる日数 | 安い嵩物を運べる日数の上限(値の密度 × 12 × 4日、「荷車に見合う」)を、経路の運賃の重みで割る。海だけの経路なら10倍の日数まで運べる。Wood は陸で約5日、海で約53日 | `getGoodMaxTradeDurationDays` |

運べる日数の上限を変えなかった版では、運賃が下がっても Wood は5日より遠くへ行けず、world-102 の Wood の荷はすべて陸のまま(399 → 497単位)だった。

計測(盗賊なし。§15 の後 → 運賃の重みだけ入れた版 → 本節の後):

| 地図・年 | 取引(件) | 高額品の取引 | 24日以上の高額品 | `noTransport`(高額品) | 支払いの比 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| province-101・3年 | 354 → 341 → 382 | 218 → 210 → 235 | 165 → 153 → 174 | 0 → 0 → 2(2) | 1.000 → 1.000 → 1.000 |
| province-101・4年 | 714 → 731 → 759 | 349 → 333 → 369 | 256 → 249 → 286 | 4(0) → 7(0) → 1(0) | 1.000 → 1.000 → 1.000 |
| province-101・5年 | 870 → 846 → 877 | 523 → 522 → 527 | 363 → 356 → 372 | 0 → 0 → 0 | 0.993 → 0.994 → 1.000 |
| world-102・1年 | 206 → 220 → 227 | 154 → 167 → 171 | 143 → 152 → 154 | 95(16) → 98(17) → 122(16) | 1.000 → 1.000 → 1.000 |
| world-102・2年 | 305 → 317 → 327 | 255 → 265 → 278 | 231 → 241 → 264 | 155(51) → 201(52) → 285(78) | 0.988 → 0.987 → 0.991 |
| world-102・3年 | 285 → 284 → 295 | 214 → 203 → 222 | 192 → 186 → 196 | 93(37) → 97(29) → 86(30) | 0.987 → 0.988 → 0.984 |

運んだ荷(出発した荷の合計。運賃の重みだけの版 → 本節の後):

| 地図 | 品 | 数量 |
| :--- | :--- | :--- |
| world-102(3年) | Wood | 497 → 658(うち海を通る荷 0 → 75) |
| world-102 | Grain | 2,288 → 3,086 wain |
| world-102 | 海を通る荷 | 346 → 427件 |
| province-101(5年) | 海だけの荷 | 328 → 380件 |
| province-101 | Clay | 0 → 60 |

- 水運が安くなり、遠くまで運べるようになった分、取引と高額品が両方の地図で増えた(province-101 の4年目の高額品 349 → 369、world-102 の2年目 255 → 278)。
- Wood・穀物・Clay が海で運ばれ始めた。
- world-102 の1〜2年目は、海の荷が増えて船が足りず、`noTransport` が増えた(2年目 155 → 285)。船の積載量は今の枠のまま(Sloop 100枠 = 15 t、§5.4.3 の史料では25〜70 t)で、船の積載量を史料の値に近づけること(§12.5)が次の課題になる。

#### 残る課題

- 船の積載量(§5.4.3)。海の運賃を下げて海の荷が増えたので、船の不足が目立つようになった。→ §17 で実装。
- 川の上りと下りの差(最高価格令では上りが下りの数倍)。今は同じ0.5。
- 次は §13.5 の2(食品の lot と酒樽)。

## 17. 船の積載量を載せられる重さと船倉から出す(2026-10-21、実装)

§16 の残る課題。船の枠(Sloop 100枠 = 15 t)を、§5.4.3 の載せられる重さと船倉の容積から出すようにした。

| 項目 | 内容 | 場所 |
| :--- | :--- | :--- |
| 船の持つ値 | 船級ごとに `deadweightKg`(載せられる正味の重さ)と `holdLiters`(貨物に使える船倉)を持つ。船倉は1 tあたり1,400 L(§5.4.3 の tun の積付) | `src/types/shipClasses.ts` |
| 枠 | `cargoCapacitySlots = floor(min(deadweightKg / 150, holdLiters / 250))`。1枠の荷は150 kg・250 L 以下なので、枠を満たした荷はどれも重さ・船倉の両方に収まる。船倉の基準(0.71 kg/L)は枠の尺度(0.6 kg/L)より重いので、どの船も船倉で枠が決まる | `src/types/cargoSlot.ts getCarrierCargoSlots`(枠の尺度 `CARGO_SLOT_KG`・`CARGO_SLOT_LITERS` をここへ移し、`goodCargoMeasure.ts` は再輸出) |
| 海外への力 | 国の海外への力(`computeOverseasProjectionScore`)は、商船の枠ではなく載せられる重さ(t)で数える。1 tあたり0.1で、Sloop 1隻は今までと同じ5。Caravel 15 → 10、Galleon 40 → 50、Steamship 55 → 100 | `overseasVoyageRisk.ts`、`overseasRelations.ts` |

| 船 | 載せられる重さ | 船倉 | 枠(今まで → 後) |
| :--- | ---: | ---: | :--- |
| Sloop | 50 t | 70 m³ | 100 → 280 |
| Caravel | 100 t | 140 m³ | 300 → 560 |
| Galleon | 500 t | 700 m³ | 800 → 2,800 |
| Steamship | 1,000 t | 1,400 m³ | 1,100 → 5,600 |
| Galley(軍船) | 5.4 t | 7.6 m³ | 30 → 30 |

- Steamship は船級が1つしかないので、§5.4.3 の1850年代(500 t)と1870年代以降(1,500 t)の間をとり、機関・石炭庫を除いた1,000 tとした。航続距離に応じて石炭を差し引くことはしていない。
- §12.5 は「今の枠に合わせた値から始め、段階的に史料の既定へ寄せる」としていたが、§16 で海の荷が増えたので、§5.4.3 の既定値(船級の小さめの側)へ一度に寄せた。
- 船の数は変えていない。造船所が船を造る量は枠と関係がない(world-102 の商船は前後とも270隻)。

計測(盗賊なし。§16 の後 → 本節の後):

| 地図・年 | 取引(件) | 高額品の取引 | 24日以上の高額品 | `noTransport`(高額品) | 支払いの比 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| province-101・3年 | 382 → 382 | 235 → 240 | 174 → 186 | 2(2) → 1(0) | 1.000 → 1.000 |
| province-101・4年 | 759 → 770 | 369 → 422 | 286 → 328 | 1(0) → 1(0) | 1.000 → 1.000 |
| province-101・5年 | 877 → 900 | 527 → 542 | 372 → 376 | 0 → 2(0) | 1.000 → 1.000 |
| world-102・1年 | 227 → 230 | 171 → 162 | 154 → 147 | 122(16) → 107(16) | 1.000 → 1.000 |
| world-102・2年 | 327 → 345 | 278 → 280 | 264 → 258 | 285(78) → 207(65) | 0.991 → 0.995 |
| world-102・3年 | 295 → 314 | 222 → 247 | 196 → 217 | 86(30) → 167(74) | 0.984 → 0.976 |

world-102 の `noTransport` の内訳(`transportLimit`。§16 の後 → 本節の後):

| 年 | 船がない(`sea`) | 港が季節で閉じている(`season`) | 港に空いている商船 |
| :--- | :--- | :--- | :--- |
| 1年 | 33 → 17 | 89 → 90 | 213 → 233隻 |
| 2年 | 101 → 16 | 184 → 191 | 204 → 252隻 |
| 3年 | 5 → 35 | 81 → 132 | 242 → 254隻 |

海を通る荷(出発した荷の合計。§16 の後 → 本節の後):

| 地図 | 海の荷(件) | 使った船(隻・回) | 積んだ枠 | 船の枠に対する積荷(中央値) |
| :--- | :--- | :--- | :--- | :--- |
| province-101(5年) | 479 → 362 | 628 → 427 | 68,403 → 117,321 | 1.00 → 1.00 |
| world-102(3年) | 433 → 338 | 486 → 352 | 32,783 → 43,316 | 0.88 → 0.13 |

- 海で運ぶ量は province-101 で1.7倍、world-102 で1.3倍になり、船の回数は3割減った。province-101 の Maize は10,260 → 21,646 wain、world-102 の Wheat・Oats・Turnips は約2倍。
- 高額品の取引は province-101 の4年目(369 → 422)と world-102 の3年目(222 → 247)で増えた。
- `noTransport` のうち船がないことによるもの(`sea`)は、3年の合計で139 → 68件に減った。§16 で増えた `noTransport` の大部分は、船の不足ではなく、冬に閉じる港を通る荷(`season`)だった。world-102 の3年目に `noTransport` が増えた(86 → 167)のは、主に `season` の増え(81 → 132)で、取引が増えて冬の港を通る組が増えたため。
- world-102 では、船の枠に対する積荷の中央値が0.13になった。1件の荷が小さく(1回の取引の量)、大きくなった船倉を満たさずに出ている。港で荷を待つ日数(積み込みの待ち)は今の規則のまま。

#### 残る課題

- ~~1件の荷が船倉の1割しか使わない(world-102)。港で複数の取引の荷を1隻に合わせて積むこと(port-freight-queue-and-warehouses.md の荷待ち)が、船が大きくなった分だけ効くはず。~~ §17.1 で調べ、今は直さないことにした。
- 蒸気船の石炭庫を航続距離から差し引くこと、造船の技術の段階による船の大きさの倍率(§5.4.3)。
- 冬に閉じる港を通る荷の `noTransport`(`season`)。
- 川の上りと下りの差、§13.5 の2(食品の lot と酒樽)は §16 のまま。

### 17.1 薄い出港の内訳(2026-10-22、調査)

world-102 を3年進め、海へ出るすべての出港について、出る港・着く港・売り手・買い手・出た理由・積んだ枠・陸の車両を記録した(338件、§17 の後のコード)。

| 荷の出どころ | 出た理由 | 件数 | 積んだ枠(中央値) | 船の枠に対する積荷(中央値) |
| :--- | :--- | ---: | ---: | ---: |
| 市場の中心が港(最初から海) | 満載(`depart-full`) | 112 | 280 | 1.00 |
| 内陸から港へ下ろした荷 | 出港日(`depart-schedule`) | 94 | 36 | 0.13 |
| 内陸から港へ下ろした荷 | 荷待ちの期限(`depart-overdue`) | 35 | 36 | 0.13 |
| 川から港へ下ろした荷 | 荷待ちの期限 | 14 | 39 | 0.14 |
| 積荷の枠と出た理由を持たない荷(中身は未調査) | — | 55 | 0 | 0 |

- 薄い出港は、ほぼすべて内陸から港へ下ろした荷で、1件の荷は荷駄の隊1つ分(36枠)。最初から港で積む荷は、§10.32(port-freight-queue-and-warehouses.md)の積み合わせで満載になっている。
- 同じ売り手・買い手・港の荷が続けて出る間隔は、ほとんどが約30日(照合の周期)で、10日以内に続くのは183件中16件。港で次の荷を待っても、多くは1か月待つことになる。
- ほかの売り手・買い手で、同じ港から同じ港へ10日以内に出た荷は27件。別の商会・別の買い手の荷を1隻に積み合わせても、減る出港は3年で30件ほど。
- 港に空いている商船は約250隻あり、運賃は船の大きさではなく枠に比例する(§15)。薄い出港は船の回数を増やすだけで、荷の量・運賃・`noTransport` を止めてはいない。

薄い出港の元は、内陸の市場が1か月に港へ下ろせる量(荷駄の隊の数)で、船の積み方ではない。別の商会の荷の積み合わせ(運賃積みの混載)は、効果が小さいので今は入れない。内陸の陸の上限(§5.4.2 の1頭・1台の重さ)を直すときに、もう一度測る。

## 18. 枠の切り替え 第2群: 食品の lot(2026-10-22、実装)

§13.5 の2。`foodLots.ts` か単位の語が量を決めている食品の lot を、§13 の量から出す枠に切り替えた(`goodCargoMeasure.ts MEASURED_SLOT_GOODS`)。古い保存は §12.6 と同じく読み込み時に直る。

| 品 | 1単位 | 今までの枠 → 量から出した枠 | 運賃の重み(今まで → 後) |
| :--- | :--- | :--- | :--- |
| Milk | 1,000 L | 3 → 8.2(重さ) | 6 → 20.9 |
| Cheese | 1,000 kg | 3 → 7.2(重さ) | 6 → 18.4 |
| Grapes・Apples・Pears・Plums・Figs・Lemons | 1,000 kg | 3 → 9.1〜11.1(かさ) | 6〜8 → 23〜28 |
| Chestnuts・Pomace | 1,000 kg | 3 → 7.0〜7.7(かさ) | 6 → 18〜20 |
| Raisins・Dried Fruits | 250 kg | 3 → 2.1(かさ) | 4〜6 → 5.3 |

### 18.1 酒樽を外した理由

§13.5 は「1 kg あたりの値が史料と桁で合う品から切り替える」とした。酒樽の5品はこれに合わない。

| 品 | 1 kg の値(Grain = 1) | 史料の目安(Grain = 1) |
| :--- | ---: | :--- |
| Beer・Cider | 9.2 | 0.7〜1.5(中世英国の ale は1ガロン約1ペンス、小麦は1クォーター約6シリング) |
| Perry | 10.4 | ale と同じ |
| Pomace Wine | 4.7 | ale 以下(搾りかすの酒) |
| Wine | 18.8 | 2〜4(ガスコーニュのワインは1 tun 3〜6ポンド) |

Beer の値は、レシピ(大麦1 wain = 465 kg から ale 200 L、史料では1,000 L 以上)とあわせて高すぎる。枠に切り替えると運賃の重みが 8 → 4.1 に半減し、値の高すぎる品の運賃だけが下がる。最初の版(酒樽を含む)では province-101 の高額品の取引が4年目 422 → 370、5年目 542 → 474 に減り、Beer だけを切り替えた版でもほぼ同じ(378・475)だった。酒樽は §13.5 の4(値の見直し)と一緒に切り替える。

### 18.2 計測

盗賊なし。§17 の後 → 本節の後:

| 地図・年 | 取引(件) | 高額品の取引 | 24日以上の高額品 | `noTransport`(高額品) | 支払いの比 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| province-101・3年 | 382 → 386 | 240 → 239 | 186 → 185 | 1(0) → 0(0) | 1.000 → 1.000 |
| province-101・4年 | 770 → 742 | 422 → 388 | 328 → 288 | 1(0) → 3(0) | 1.000 → 1.000 |
| province-101・5年 | 900 → 896 | 542 → 557 | 376 → 377 | 2(0) → 0 | 1.000 → 0.993 |
| world-102・1年 | 230 → 231 | 162 → 163 | 147 → 148 | 107(16) → 107(16) | 1.000 → 1.000 |
| world-102・2年 | 345 → 344 | 280 → 279 | 258 → 254 | 207(65) → 222(79) | 0.995 → 0.992 |
| world-102・3年 | 314 → 303 | 247 → 236 | 217 → 215 | 167(74) → 187(82) | 0.976 → 0.984 |

運んだ荷(出発した荷の合計。§17 の後 → 本節の後):

| 地図 | 品 | 件数 | 数量 | 枠 |
| :--- | :--- | :--- | :--- | :--- |
| province-101(5年) | Cheese | 13 → 18 | 9.5 → 15.6 | 28 → 113 |
| province-101 | Dried Fruits | 8 → 8 | 11.5 → 11.5 | 23 → 24 |
| world-102(3年) | Cheese | 0 → 13 | 0 → 11.7 | 0 → 84 |

- 切り替えた品は、どちらの地図でもほとんど運ばれていない。生の果物・Milk は鮮度で遠くへ運べず、もとから荷にならない。
- 小さな差でも結果は揺れる。Beer の見かけの密度を 1.01 → 1.0101(0.01%)に変えただけで、province-101 の5年目の高額品は 474 → 494 件(4%)動いた。province-101 の4年目の差(422 → 388、8%)は、Cheese だけを切り替えた版でも同じ(388)で、Cheese の荷の変化から広がった揺れとみる。1本ずつの計測では、5%前後の差は揺れと区別できない。
- 一度も運ばれない品(Grapes だけを切り替えた版)は、結果を1件も変えなかった。

#### 残る課題

- 酒樽の5品(§18.1)。値の見直し(§13.5 の4)と一緒に行う。
- 次は §13.5 の3(軽い高額品)。荷1回の価値の上限がないかを先に確かめる。
- ~~計測の揺れの幅。~~ §19.3 の方法で幅を出す。

## 19. 枠の切り替え 第3群: 軽い高額品(2026-10-22、実装)

§13.5 の3。宝飾・香辛料・植民地の作物・薬・香・絹・染料・毛皮の17品(Pearls、Gemstones、Jewelry、Amber、Coral、Ivory、Spices、Coffee、Cocoa、Tea、Medicines、Medicinal herbs、Incense、Perfume、Silk、Dyes、Furs)を、量から出す枠に切り替えた(`goodCargoMeasure.ts MEASURED_SLOT_GOODS`)。初めの計測で高額品の取引の件数が減ったので、一度保留して原因を調べた(§19.4)。件数は減るが取引の額は変わらず、1件の取引が大きくなっただけと分かったので入れた。

### 19.1 先に確かめたこと

- **1 kg あたりの値**: 17品とも史料と桁で合う(Spices は Grain の167倍で、中世英国の胡椒の80〜160倍。Silk は744倍で生糸の値と同じ桁。Tea・Coffee・Cocoa は77〜108倍)。
- **1回の荷の量の上限**: 照合の荷の量は、売り手の在庫の25%・買い手の在庫の目安・運転資金・買い手の現金・流れの予算で決まり、枠では決まらない(`tradeOpportunityEstimator.ts estimateTradeOpportunity`、`markets-generator.ts`)。枠が1/4〜1/1000になっても、1回の荷の量や価値は増えない。枠で決まるのは運賃(§15)と、車両・船にどれだけ載るかだけ。

| 品 | 枠(今まで → 量から) | 運賃の重み(今まで → 後) |
| :--- | :--- | :--- |
| Pearls・Gemstones・Jewelry | 3 → 0.0007〜0.0014 | 2 → 0.002〜0.004 |
| Amber・Coral・Perfume | 3 → 0.007〜0.01 | 2 → 0.02〜0.03 |
| Ivory・Silk | 3 → 0.11〜0.14 | 2〜3 → 0.3〜0.4 |
| Spices・Medicines・Incense・Coffee・Cocoa・Dyes・Furs | 3 → 0.42〜0.5 | 3〜6 → 1.1〜1.3 |
| Tea・Medicinal herbs | 3 → 0.73〜0.86 | 3 → 1.9〜2.2 |

### 19.2 計測

切り替えると、運賃は下がるのに、province-101 の高額品の取引の件数が減った。

| 地図・年 | 高額品の取引(§18 の後 → 切り替え) | 取引 |
| :--- | :--- | :--- |
| province-101・1年 | 68 → 64 | 93 → 88 |
| province-101・3年 | 239 → 232 | 386 → 377 |
| province-101・4年 | 388 → 370 | 742 → 706 |
| province-101・5年 | 557 → 494 | 896 → 823 |
| world-102・1年 | 163 → 179 | 231 → 247 |
| world-102・3年 | 236 → 220 | 303 → 282 |

- 切り替えた品そのものの荷も、province-101(5年)で Ivory 47 → 36件、Tea 40 → 30件、Incense 58 → 45件、Dyes 340 → 303件と減った。Grain・Salt など、切り替えていない品の荷も7〜9%減った。
  - (§20.3 の追記)この件数は、車両・船を予約して出た荷だけを数えている。生産は前後で変わらない(province-101 の3年目まで、Dyes 865.8・Incense 479.6・Tea 151.9 → 151.7 で同じ)。
- 17品を半分ずつ切り替えた版(宝飾・香・絹・毛皮の10品 / 香辛料・作物・薬・染料の7品)は、4年目の高額品がそれぞれ374・354件で、どちらも減った。1品のせいではない。
- 1年目の照合を品ごとに数えると、切り替えた品の段の数は前後で同じで、差は Ink・Linen・Paper・Silver Ingot など切り替えていない品の数件だけだった。1年目の終わりには、Tools の生産が43 → 31、Soap が2.9 → 4.8と、交易と直接関係のない生産もすでに違う。積み込みの待ち日数・出た理由、荷に縛られた資金、食料の相積みの量は、前後でほとんど違わなかった。

### 19.3 揺れの幅の出し方

§18.2 のとおり、小さな差でも結果は揺れる。運賃の1枠あたりの重み(`FREIGHT_LOAD_PER_SLOT`)に (1 + k/1000)(k = 1〜3)を掛けた版を3本ずつ足し、元の版とあわせて4本で比べた(Oats の見かけの密度を0.01%変える方法は、枠の丸めに吸われて結果が1件も変わらなかった)。

| 地図・年 | 高額品の取引: §18 の後(4本) | 切り替え(4本) |
| :--- | :--- | :--- |
| province-101・3年 | 239・244・244・244(平均243) | 232・234・228・227(230) |
| province-101・4年 | 388・410・418・419(409) | 370・346・330・339(346) |
| province-101・5年 | 557・563・567・535(556) | 494・506・484・512(499) |
| world-102・2年 | 279・279・279・279 | 262・262・262・266 |
| world-102・3年 | 236・236・236・236 | 220・220・220・226 |

- province-101 の4〜5年目は、前後の4本の幅が重ならない(4年目 388〜419 と 330〜370)。揺れではなく、切り替えによる件数の減り(4年目 −15%、5年目 −10%)。額は減っていない(§19.4)。
- world-102 は小さな変化ではほとんど揺れない(4本がほぼ同じ値)。
- province-101 の4年目の1本ごとの幅は約30件(平均の±4%)。これより小さい差は、1本の計測では判断しない。

### 19.4 件数が減った理由(2026-10-22、調査)

**差の始まり**: 盗賊なし・食料の相積みなしで2つの版を1か月ずつ進め、市場の在庫・値・隊商の荷・車両の台帳を比べた。最初に違うのは3か月目の隊商の積み方だった。市場12から市場2への荷で、§18 の後は Medicines 3.83単位(7.7枠)が自分の荷駄を待って積み込み中に残った。切り替えた版では、同じ荷(1.9枠)が先に出る荷馬車の空きに積み足されて、1か月早く出た。軽くなった荷がほかの荷の隙間に入って早く出るのは、切り替えの狙いどおりの動き。4か月目からは、その差が市場の在庫・値に広がる。

**食料の相積みではない**: 軽い荷の空いた枠に主食が相積みされる量は増えた(province-101 の3年目 6,946 → 8,028単位)。しかし相積みを止めた2つの版でも、高額品の件数の差は残った(3年目 223 → 203、4年目 370・384 → 338)。

**件数は減るが額は変わらない**: §19.3 の4本ずつで、取引の額を比べた。

| 地図・年 | 高額品の取引の額: §18 の後(4本) | 切り替え(4本) | すべての取引の額(平均) |
| :--- | :--- | :--- | :--- |
| province-101・1年 | 3,034 | 2,850 | 7,003 → 6,634 |
| province-101・3年 | 14,171〜14,209 | 13,493〜14,448 | 58,012 → 57,801 |
| province-101・4年 | 16,979〜19,220 | 18,127〜18,672 | 127,104 → 128,380 |
| province-101・5年 | 25,371〜28,392 | 23,931〜26,651 | 156,049 → 161,486 |
| world-102・3年 | 12,022 | 12,409〜12,422 | 25,889 → 26,650 |

- province-101 の4年目の高額品は、件数が409 → 346(−15%)なのに、額は18,394 → 18,385で変わらない。1件の額が45 → 53に大きくなった。3〜5年目の額の幅は前後で重なり、すべての取引の額も変わらない。world-102 の3年目は、高額品・すべての取引とも額が3%増えた。
- 軽い品は、照合で車両の枠に詰まらずに(`markets-generator.ts` の `carriable / slotsPerUnit`)1回で多く予約でき、隊商の隙間にも入る。同じ額の交易が、少ない件数の大きな取引になる。
- 1年目の province-101 の額は 3,034 → 2,850 で6%減っている。1年目は揺れがほとんどない(4本が同じ値)ので、これは切り替えによる差。2年目以降は額が戻る。

これからの交易の計測では、件数だけでなく取引の額も比べる。荷の枠が変わると1件の大きさが変わるので、件数は交易の量の目安にならない。

#### 残る課題

- §13.5 の4(Wool・Cloth・Garments・Salt・Bread・Flour・Linen と酒樽)は、値の見直し(§5.6)と一緒に行う。
- ~~芸術品・工芸品(Artworks・Relics・Instruments・Tapestries・Sculptures)と、Tobacco・Liquor・Soap などの軽い品は、まだ今までの枠のまま。~~ §20 で切り替えた。
- §14〜§18 の計測も件数で比べている。額で見直すかは必要になったときに決める。

## 20. 枠の切り替え 第4群: 芸術品・工芸品と軽い品(2026-10-22、実装)

§19 の残る課題。値を見直さずに切り替えられる軽い品の残りを、量から出す枠に切り替えた(`goodCargoMeasure.ts MEASURED_SLOT_GOODS`)。§13.5 の4(値の見直しと一緒に行う品)は後回しにした。

### 20.1 選んだ品

| 品 | 1単位 | 枠(今まで → 量から) | 1 kg の値(Grain = 1) | 史料の目安(Grain = 1) |
| :--- | :--- | :--- | ---: | :--- |
| Artworks | 5 kg | 3 → 0.13 | 2,977 | 品質で大きく違う(§5.6) |
| Relics | 2 kg | 3 → 0.02 | 11,163 | 同上 |
| Instruments | 10 kg | 3 → 0.25 | 1,116 | 同上 |
| Tapestries | 20 kg | 3 → 0.29 | 1,047 | 同上(アラスのタペストリーは1枚で数〜数十ポンド) |
| Sculptures | 200 kg | 3 → 1.44 | 98 | 同上 |
| Obsidian | 5 kg | 3 → 0.04 | 1,116 | — |
| Tobacco | 60 kg | 3 → 0.88 | 62 | 15〜20(1700年ごろ) |
| Liquor | 100 L | 3 → 0.77 | 59 | 約30(ブランデー) |
| Soap | 120 L | 3 → 0.97 | 23 | 6〜12 |
| Candles | 100 kg | 3 → 0.72 | 47 | 獣脂12・蜜蝋50 |

- どれも史料と同じ桁か、品質の差が大きく一律の値を決められない品(§5.6)。
- 外した品: 1 kg の値が史料より1桁以上高い Ink(Grain の2,960倍、1 L の瓶)・Rennet(1,860倍)・Leather(112倍、史料は約3倍)と、5倍ほど高い Beeswax(233倍、史料は約45倍)。値の見直し(§13.5 の4)と一緒に行う。

### 20.2 計測

盗賊なし。§19 の後と本節の後を、それぞれ運賃の1枠あたりの重みに (1 + k/1000)(k = 0〜3)を掛けた4本ずつで比べた(§19.3)。

| 地図・年 | 取引(件) | 高額品(件) | 高額品の額 | すべての取引の額 |
| :--- | :--- | :--- | :--- | :--- |
| province-101・1年 | 88 → 88 | 64 → 65 | 2,850 → 2,979 | 6,634 → 6,892 |
| province-101・2年 | 187 → 176 | 127 → 121 | 9,673 → 9,501 | 29,675 → 29,315 |
| province-101・3年 | 371〜377 → 350〜360 | 227〜234 → 210〜216 | 13,493〜14,448 → 13,174〜14,162 | 55,343〜60,693 → 54,550〜62,092 |
| province-101・4年 | 706〜753 → 704〜758 | 330〜370 → 344〜387 | 18,127〜18,672 → 16,383〜17,059 | 123,729〜133,492 → 121,533〜124,777 |
| province-101・5年 | 798〜879 → 840〜862 | 484〜512 → 503〜542 | 23,931〜26,651 → 24,566〜26,190 | 148,196〜175,854 → 141,263〜170,952 |
| world-102・1年 | 247 → 241 | 179 → 174 | 5,897 → 5,921 | 13,786 → 13,829 |
| world-102・2年 | 326〜330 → 332 | 262〜266 → 266 | 12,182〜12,193 → 12,133 | 28,225〜28,248 → 28,243 |
| world-102・3年 | 282〜293 → 295〜305 | 220〜226 → 231〜241 | 12,409〜12,422 → 12,495〜12,551 | 26,613〜26,664 → 26,953〜27,065 |

- world-102 は、取引の件数・額とも少し増えた(3年目の高額品の額 +1%、すべての取引の額 +1.5%)。
- province-101 は、4年目の高額品の額だけが前後の幅の外で減った(平均 18,385 → 16,846、−8%)。3年目・5年目の額と、すべての取引の額は幅が重なる。
- 切り替えた品の生産は変わらない(world-102 の3年目まで、Sculptures 127.6 → 123.5、Soap 51.1 → 56.2、Candles 232.6 → 235.4、Liquor 161.6 → 166.0)。市場の間の交易は増えた(world-102 の3年で Candles の取引 27 → 34件、11.9 → 14.4単位)。
- world-102 の `noTransport` は2〜3年目で 180 → 242件に増えた。3年目の内訳は、船がない(`sea`)40 → 80件、冬に閉じる港(`season`)134 → 156件。取引が増えた分、海の組の予約が増えた。港に空いている商船は前後とも約250隻で、船の数ではなく、船が出る港にいないことで止まっている。

### 20.3 数え方の注意

切り替えた品を車両・船を予約して出た荷だけで数えると、world-102 で Sculptures 23 → 16件(30.3 → 17.4単位)、Soap 28 → 23件のように減って見える。これらの品の荷の多くは、町の工房から自分の市場へ納める荷(`sellerType: "burg"`)。予約して出た件数が減る仕組みは確かめていないが、生産と市場の間の交易は減っていない(§20.2)。§19.2 の「切り替えた品そのものの荷も減った」も同じ数え方によるもの。

#### 残る課題

- ~~§13.5 の4: Wool・Cloth・Garments・Salt・Bread・Flour・Linen、酒樽5品、Ink・Rennet・Leather・Beeswax。値の見直し(§5.6)と一緒に行う。~~ Wool・Cloth・Garments・Flour・Bread は §21 で切り替えた。残りは §21.5。
- world-102 で、船が港にいないことによる `noTransport`(`sea`)が、取引が増えるたびに増える。回航の需要(port-freight-queue-and-warehouses.md §10.10)が予約の増えに追いついているかを確かめる。
- 計測の道具(出発した荷の記録)は、車両・船を予約した荷しか数えない。品ごとの流れは、生産・在庫・照合の段で見る。

## 21. 枠の切り替え 第5群: 値を重さに合わせた品(2026-10-22、実装)

§13.5 の4。値が 1 kg あたりで史料と桁が合わない品のうち、Wool・Cloth・Garments・Flour・Bread の5品を、値を重さに合わせ直して、量から出す枠に切り替えた(`goodCargoMeasure.ts MEASURED_SLOT_GOODS`)。値は §5.6 の方針で、1 kg あたりの値を Grain(1 wain = 465 kg で値1)の何倍かで決めた。単位変換ではなく**明示した値のバランス変更**で、単位の量(kg)は変えていない。

### 21.1 切り替えた品と値

| 品 | 1単位 | 枠(今まで → 量から) | 値(今まで → 後) | 1 kg の値(Grain = 1、今まで → 後) | 史料の目安(Grain = 1) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Wool | 1,000枚 = 1.5 t | 4 → 22 | 2 → 13 | 0.6 → 4.0 | 3〜6 |
| Cloth | 4 t | 3 → 44 | 15 → 98 | 1.7 → 11.4 | 10〜50 |
| Garments | 4 t | 3 → 70.4 | 20 → 130 | 2.3 → 15.1 | Cloth 以上 |
| Flour | 50 kg | 4 → 0.38 | 1.5 → 0.16 | 14 → 1.5 | 1.2〜1.5 |
| Bread | 20 kg | 3 → 0.33 | 2 → 0.08 | 47 → 1.9 | 1.5〜3 |

- Cloth は Wool 6 lot(6 × 13 = 78)の1.25倍、Garments は Cloth の4/3倍。今までの利幅の比(15/12、20/15)を保った。
- Cloth は史料の幅(10〜50)の下端に近い。上げすぎて Garments・Sails・Tapestries の入力が割に合わなくならないよう、Wool 6 lot の1.25倍に抑えた。
- 日当比(§5.6)で見ると、Garments 1揃いは 0.13 SP、年 0.25 揃い(`textileDemand.ts`)で年 0.033 SP。穀物価格1での年の賃金 0.645 SP の約5%になる(今までは0.5%)。

### 21.2 値に連動して変えたレシピと充足

値だけを変えると、入力が高くなった品が赤字になる。次を変えた。

| 品 | 変更 | 理由 |
| :--- | :--- | :--- |
| Sails・Artworks | Cloth 1 → 0.15 | Cloth 1 lot(4 t)が15から98になった。利幅を今までの Cloth 15 のときと同じにする |
| Tapestries | Cloth 2 → 0.3 | 同上 |
| Flour | Grain 1 → 0.134 | 50 kg の粉を挽く穀物。粉 50 kg ÷ 挽き歩留まり 0.8 = 62.5 kg = 0.134 wain。今までは 1 wain(465 kg)から 50 kg だった(§5.7) |
| Bread | Flour 1 → 0.3 | 20 kg のパンを焼く粉。粉 1 kg から約 1.3 kg のパン |
| Flour の `demandCoverage` | food 0.3 → 0.1 | 50 kg の粉が賄う食料(50 kg ÷ 465 kg ≈ 0.1 wain) |
| Bread の `demandCoverage` | food 1 → 0.03 | 20 kg のパン(約 5 万 kcal)が、穀物 1 wain(約 160 万 kcal)に対して賄う分 |

Flour と Bread の充足を直さないと、値が1/9〜1/25になったのに充足は変わらず、burg の食料の需要が穀物から粉に移る。

Cloth の入力に Hemp・Cotton がある経路は変えていない。Hemp は 465 kg で値1、Cotton は 200 kg で値2で、6 lot の量が Cloth 4 t に対して質量で合わない(§5.7 の段階4)。

### 21.3 古い保存

`migrateWeightRepricing`(`goods-generator.ts`、`simulation.ts GOODS_CATALOG_MIGRATIONS`)が、保存済みの品の値・レシピの量・充足を直す。値が今までの既定のままのもの、量が今までのままのものだけを変え、Goods エディタで利用者が変えた値と量は残す(`migrateSmeltedMetalValues` と同じ方針)。直したときは市場の値が `Markets.initializeMarketPrices()` で引き直される。

### 21.4 計測

盗賊なし(§12.7)。province-101・world-102 を3年進め、取引の成立(`tradeStageObserver` の `deal`)、品ごとの生産と消費(`goodsBalanceLedger`)を比べた。

| 地図・年 | 取引(件) | 取引の額 | 衣服の家計の消費(累計、lot) |
| :--- | :--- | :--- | :--- |
| province-101・1年 | 174 → 126 | 2,666 → 2,232 | 36 → 32 |
| province-101・2年 | 209 → 217 | 11,033 → 11,372 | 99 → 99 |
| province-101・3年 | 601 → 511 | 33,267 → 31,423 | 166 → 173 |
| world-102・1年 | 120 → 137 | 4,330 → 4,426 | 113 → 122 |
| world-102・2年 | 181 → 181 | 9,875 → 10,943 | 283 → 331 |
| world-102・3年 | 376 → 264 | 15,898 → 13,781 | 452 → 551 |

- 衣服の家計の消費は前後で同じか増えた(world-102 の3年目 +22%)。満たされない分(`unmet`)はどちらも同じ桁(province-101 の3年目 6,821 → 6,815)。値が6.5倍になっても、家計の衣服は止まらない。
- 取引の件数・額の差は、Silver Ingot・Dyes・Medicines など切り替えていない品に散っている(world-102 の3年目は Silver Ingot 28 → 1件が最大)。切り替えた品そのものの取引は少なく(Cloth は province-101 の3年目 23 → 9件)、件数の減りと結びつけられない。この地図は盗賊なしで再現するので、揺れではなく、少しの違いが広がった結果。
- Flour の生産は同じ(province-101 の3年目 1,546 → 1,561 sack)で、穀物の消費が 1,546 → 209 wain に減った。粉の在庫は world-102 で 10,074 → 4,149、burg の需要は 710 → 2,901 sack に増えた(充足が1/3になったので同じ食料に3倍の袋が要る)。Grain の輸出は 390 → 429 wain。
- Tapestries・Artworks の生産が増えた(province-101 の3年目 10 → 61、15.6 → 60.4)。在庫も増えて値が下がった(Tapestries 40.7 → 30.8、Artworks 25.7 → 19.0)。今までは1個に Cloth 2 lot・1 lot(8 t・4 t)を要し、Cloth の在庫(約 8〜46 lot)がそれを満たせなかったと考えられる(生産が縛られていたかは未確認)。入力が1/7になった。
- Linen の流れ(生産・Garments と Sails への投入・取引)は前後でほとんど同じ(province-101 の3年目 生産 31.8 → 20.6、投入 43 → 31)。

### 21.5 切り替えなかった品と理由

調べると、値を直す前に直すものが見つかった。次の品は残す。

| 品 | 理由 |
| :--- | :--- |
| ~~Salt~~ | 当初は産出が多すぎると見て残したが、見直した結果、産出は多すぎなかった。§22 で切り替えた |
| Linen・Flax | Linen を 0.65(Grain の15倍)・Flax を 0.4 にすると、Linen の生産(burgCraft)が 31.8 → 0 になった。原因はコードを読んで確かめた(計測での再確認はしていない)。候補の点数は1 lotあたりの利益(売値 − 入力)で、必要な労働者は 1 lot あたり 1 人と数える(`production-generator.ts buildImmediateManufactureCandidate`・`planGoodAction` の `workersNeeded = targetUnits`)。重さの違う lot がそのまま比べられるので、1 lot の利益 0.25 が Cloth・Garments の数十に負ける。`laborPointsForLots` も Linen は未校正で、1 lot = 1 労働点のまま(Charcoal は 0.0215 に校正済み)。Garments の linen 脚(0.75、20 kg の bolt で 4 t の衣服)も質量で合わない(正しくは約 190 bolt)。先に Linen の労働点と、候補の並べ方(労働点あたりの利益)を直す |
| 酒樽5品(Beer・Cider・Perry・Pomace Wine・Wine) | Beer(0.48 = 200 L ale の目安)にすると、入力 Barley 1 wain(0.9)と樽 0.16 で赤字になる。ale 200 L に要る麦は約 0.2 wain(§18.1)で、レシピを質量で直す必要がある。Cider・Perry も、入力の果実の lot(Apples 2.2 / 1,000 kg、1 kg あたり Grain の約1倍)が、史料の酒の値(Grain の0.7〜1.5倍/kg)に対して 1 L の酒に 1.5 kg 要るので、果物の lot の値から見直す。`migrateFoodProcessingLotContracts` が Wine の値・Beer のレシピを毎回上書きするので、そこも変える |
| Ink・Rennet | 1 L の瓶が Grain の 2,960 倍・1,860 倍。Ink は Oil 1 barrel(120 L)から 1 L、Rennet は牛 0.03 頭から 1 L を作るレシピで、量が質量と合わない(§5.7) |
| Leather・Beeswax | Leather は 1 hide(25 kg)の値 6 が牛1頭(5)より高い。Boots(20足で 20 kg)の入力 1 roll と、Harnesses・鎧の入力が同じ単位でつながる。Beeswax は Honey 0.5 barrel(84 kg)から 10 kg を作る。どちらも消費する側のレシピを一緒に直す |

#### 残る課題

- ~~Salt の産出量の見直しと、そのあとの値(§21.5)。~~ §22 で切り替えた。
- Linen の労働点の校正と、候補の並べ方(1 lot あたりの利益か、労働点あたりの利益か。`production-generator.ts`)の確認。
- 酒樽5品: レシピを質量で直し、果物の lot の値を見直す(§21.5)。
- Ink・Rennet・Leather・Beeswax: レシピの量を質量で直す(§5.7)。Leather は Boots・Harnesses のレシピと一緒に。
- Wool の使い道: 3年の計測では Wool を入力にする Cloth の経路は前後とも 0 件(`recipeInput` なし)。Hemp(6 wain = 2.8 t、値6)・Cotton(6 bale = 1.2 t、値12)で 4 t の Cloth ができる量の合わないレシピの方が安く、Wool の在庫(province-101 で 1,703)は床の値のまま溜まる。Cloth のレシピを質量で直す(§5.7)と一緒に直す。
- Tapestries・Artworks は、入力の縛りが外れた分だけ在庫が増えた(§21.4)。需要の側(`characterLuxury`・`luxuryPurchase`)との釣り合いを、次の計測で見る。

## 22. Salt の切り替え(2026-10-22、実装)

§21.5 で、Salt の値を 3 → 0.45 にすると取引の額が半分になったので、産出が多すぎると見て残した。調べ直すと、その見立ては誤りだった。

### 22.1 産出は多すぎなかった

- 台帳の `mineSupply` は鉱山ではなく、国の製塩所(`saltLogistics.ts`)の出力。人口の食べる量と備蓄(3か月)に応じてだけ作る。
- 地図の人口 9,300 は千人単位(`populationRate`)で、実人口は数百万人。家計の塩は1人年 3.6 kg(1/17 bag)なので、年 約 41 万 bag の消費は人口の桁と合う(正確な人数との照合はしていない)。在庫の約 14 万 bag は、備蓄 3か月 + 家計の量に当たる。
- 値の床(0.25 倍)に張り付いているのは今までも同じ。製塩所は在庫が減ったときだけ作るので、市場の値の信号には関わらない。

### 22.2 値と枠

| 品 | 1単位 | 枠(今まで → 量から) | 値 | 1 kg の値(Grain = 1) | 史料の目安 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Salt | 60 kg | 2 → 0.40 | 3 → 0.45 | 23 → 3.5 | 2〜5 |

`WEIGHT_REPRICING` に足したので、古い保存は `migrateWeightRepricing` で直る(値が3のままの場合だけ)。

### 22.3 計測

盗賊なし、3年。§21 の後 → 本節の後。

| 地図・年 | 取引(件) | 取引の額 | Salt の家計の消費(年、bag) | Salt の産出(年、bag) |
| :--- | :--- | :--- | :--- | :--- |
| province-101・1年 | 126 → 136 | 2,232 → 2,283 | — | — |
| province-101・2年 | 217 → 205 | 11,372 → 10,837 | — | — |
| province-101・3年 | 511 → 531 | 31,423 → 17,991 | 408,650 → 408,651 | 446,729 → 443,168 |
| world-102・3年 | 264 → 257 | 13,781 → 15,108 | 310,934 → 310,933 | 312,894 → 312,201 |

- 3年目の province-101 の額の減り(−13,432)は、Salt の取引 13,355(8件、7,243 bag)が消えた分とほぼ同じ。ほかの品の額は 18,068 → 17,991 で同じ。
- その取引は、床に張り付いた Salt の値が時々だけ天井(値の3倍)に跳ねたときに、そこへ運んだ荷だった(今までの3年目は 0.75 → 最大 4.58)。産出の 1.6%(4,806 / 446,729 bag)で、物の動きとしては小さい。値を 0.45 にすると、市場の値が全部床の 0.11 のまま動かず、その差を狙った取引が成り立たない。国の製塩所の輸送(`SaltShipment`)は別なので変わらない。
- Salt を使う Preserved food の生産が増えた(province-101 の3年目 26.5 → 88.3、world-102 で 22.5 → 121.5)。入力の Salt が安くなった分、保存食の利幅が広がった。史料では塩は保存食の費用の主な部分で、方向は合う。
- 家計の消費と産出は、前後でほとんど同じ(誤差 1% 未満)。

#### 残る課題

- Salt の市場の値が床に張り付いたまま動かない(今までと同じ)。国の製塩所が備蓄を保つので、市場の需給の信号を持たない。値を動かすなら、製塩所の出力を市場の値に応じさせる必要がある。

### 22.4 次の課題の調べ(2026-10-22)

Linen・酒樽5品・Ink・Rennet・Leather・Beeswax は、いずれも「値を重さに合わせると 1 lot の利益が小さくなる」品で、§21.5 の Linen と同じ壁に当たる。

- 生産の候補は 1 lot の利益で並び、1 lot を 1 人と数える(§21.5)。Beer を 0.48、Ink を 0.05 前後にすると、利益が Cloth・Garments の 1/100 以下になり、労働を取れなくなる見込み。Flour・Bread が残ったのは、`demandCoverage`(食料)が利益に掛かるため(`getDemandEffect`)。
- 労働の計算は別にある。`laborPointsForLots` は校正済みの品の労働点を持つ(Cloth 0.259、Garments 0.972)が、候補の並べ方は使っていない。並べ方を労働点あたりの利益に変えると全品目の生産の配分が変わるので、単独の品の切り替えとは別の変更として計測する。
- 先にこれを直してから、残る品の値とレシピを質量で直す。

## 23. 候補の並べ方を労働点あたりにする試み(2026-10-22、実験、採用せず)

§22.4 で、生産の候補を 1 lot あたりの利益ではなく**労働点あたりの利益**で並べる案を立てた(`planGoodAction` の `normalizedGain` を、校正済みの `laborPointsForLots` で割る。未校正の品は 1 労働点のまま)。実装して計測したが、採用せず戻した。

盗賊なし、3年。§22 の後 → 並べ方を変えた後:

| 地図 | burg の生産(3年目、lot) | 生産する品の数 | 衣服の家計の消費(累計) | 取引の件数(3年目) |
| :--- | :--- | :--- | :--- | :--- |
| province-101 | 10,547 → 12,067 | 62 → 53 | 178 → 126 | 531 → 639 |
| world-102 | 13,786 → 15,854 | 66 → 57 | 550 → 390 | 257 → 282 |

- 労働点の小さい品に配分が寄った。Barrels(province-101 で 19 → 680、world-102 で 72 → 2,344)、Boots(7 → 149、5 → 419)、Charcoal、Ropes、Tools、Arrows が増えた。
- 衣服の家計の消費が30%減り、満たされない分が増えた(province-101 の3年目 6,809 → 6,862、world-102 で 5,113 → 5,273)。Garments(0.972 労働点)は、労働点あたりでは Barrels などに負ける。
- 生産する品が9品減った(world-102 では Artillery 35.5 → 0、Clay 44.6 → 0 など)。
- Linen は直らなかった(province-101 の3年目 30.7 → 2)。Linen は未校正で 1 労働点のままなので、校正済みの品より相対的に悪くなった。

校正済みの労働点は「その品の1 lot に要る労働の量」で、品の間の相対的な利益を比べるために作った値ではない(`craftDemandCalibration.ts` は需要の量から逆算している)。並べ方に使うと、配分が労働点の小ささで決まってしまう。

したがって、並べ方は 1 lot あたりの利益のままにする。残る品(Linen・酒樽5品・Ink・Rennet・Leather・Beeswax)は、値を重さに合わせるのではなく、**1 lot の値の大きさがほかの品と並ぶ大きさになる単位**で持つ方向を試す(段階5の k ≠ 1)。たとえば Linen 1 lot を 20 kg の bolt ではなく 200 kg(10 bolt)にすれば、1 kg の値を保ったまま 1 lot の利益が 10 倍になる。この場合は単位の量・レシピ・需要・古い保存(§6)を同時に直す。

#### 残る課題

- Linen・酒樽5品・Ink・Rennet・Leather・Beeswax: 単位を大きくして、1 lot の値を保つ(上記)。

## 24. Linen: 20 kg の bolt から 200 kg の bale へ(2026-10-22、実装)

§23 の方針の最初の品。値を下げずに単位を10倍にして、1 lot の利益の大きさを保ちつつ、1 kg の値を史料の幅に収めた(`goodCargoMeasure.ts MEASURED_SLOT_GOODS` に Linen を加えた)。

### 24.1 変えたもの

| 項目 | 今まで → 後 |
| :--- | :--- |
| Linen の単位 | bolt(20 kg) → bale(200 kg = 10 bolt)。`goodMeasureCatalog.ts` |
| Linen の値 | 6 → 8(1 kg で Grain の 140 倍 → 18.6 倍。史料 10〜20) |
| Linen の枠 | 0.22(量から出した値) → 2.2 |
| Flax の値 | 1 → 0.3(25 kg の束。1 kg で Grain の 5.6 倍。繊維は織物より安い) |
| Linen のレシピ | Flax 1 → 10(250 kg の亜麻から 200 kg の麻布) |
| Garments の linen の脚 | Linen 0.75 → 12(bale。2.4 t) |
| `textileDemand.ts` の Linen 在庫の換算 | ÷0.75 → ÷12 |

- Linen の値を 6 のままにすると 1 lot の利益が 3 に、5 にすると 2 に下がり、Linen の生産が止まった(province-101 の3年目で 30.7 → 0〜1)。8 にして、レシピの原価 3(Flax 10 × 0.3)を引いた利益 5 を、今までの 1 lot の利益と同じにした。
- Garments の脚は質量では 3.8 t(19 bale)になるが、そうすると原価 152 が Garments の値 130 を超え、レシピの利幅の試験(`goods-generator.test.ts`)に通らない。亜麻布は織りが軽いとして 12 bale(原価 96、Cloth の脚 98 の下)にした。
- Sails の linen の脚は 1 のまま(原価は 6 → 8)。
- 需要の充足(`utilities` 0.2)は変えない。1 lot の役割を保つ。

### 24.2 古い保存

`migrateLinenBale`(`simulation.ts GOODS_CATALOG_MIGRATIONS`、`migrateMeasuredCargoSlots` の前)が、Linen の単位が bolt のとき bale にして、市場の在庫を1/10にする。値・レシピ・Garments の脚は `migrateWeightRepricing` が直す(Flax と Linen の値、Linen の Flax、Garments の Linen の量)。移動中の荷・注文・葬儀の亜麻・キャラクターの装備の亜麻は、数が少ないので数を直さない(今までの数が bale になる)。

### 24.3 計測

盗賊なし、3年。§22 の後 → 本節の後:

| 地図 | Linen の生産(3年目、lot) | Linen の取引(件) | 衣服の家計の消費(累計) | 取引の件数(3年目) |
| :--- | :--- | :--- | :--- | :--- |
| province-101 | 30.7 → 4.6 | 17 → 15 | 178 → 162 | 531 → 551 |
| world-102 | 59.5 → 8.8 | — | 550 → 518 | 257 → 291 |

- Linen の生産が約1/7に減った。主な使い道だった Garments の linen の脚(1 lot に Linen 0.75、原価 4.5 で Cloth の脚 78 より安かった)が、12 bale、原価 96(Cloth の脚 98 とほぼ同じ)になり、投入が 29.7 → 0.4(province-101)に減ったため。今までの linen の脚は、質量で見て1/16の亜麻で 4 t の衣服ができるレシピだった。
- Linen の価格は 4.2 → 5.8 に上がり、取引の額は同じ(29.2 → 29.6)。
- 衣服の家計の消費は約5〜6%減った（province-101 で 178 → 162、world-102 で 550 → 518）。満たされない分の増えは 0.2〜0.7%。安すぎる linen の脚が無くなった分。Cloth の脚が代わりに使われている（Cloth の投入が増えた）。

#### 残る課題

- 酒樽5品・Ink・Rennet・Leather・Beeswax: 同じ方法（単位を大きくし、1 lot の利益を保つ）で、1 品ずつ。
- Garments の linen の脚が実際にはほとんど使われない（Linen の在庫が 0 に近く、Linen の生産が Garments の需要で起きない）。
- `tradeTransportRoom.test.ts`（5件）と `foodClimateCalibration.test.ts`（1件）は、この作業の前から失敗している（§17〜§20 の途中の変更で、枠が変わったのに試験の値が変わっていない）。

## 25. Ink: 1 L の瓶から 120 L の樽へ(2026-10-22、実装)

§24 と同じ方法の2品目。`MEASURED_SLOT_GOODS` に Ink を加えた。

### 25.1 変えたもの

| 項目 | 今まで → 後 |
| :--- | :--- |
| Ink の単位 | bottle(1 L) → barrel(120 L、132 kg)。`goodMeasureCatalog.ts`(`barrelOf(1.1)`) |
| Ink の値 | 7 → 3.4(1 kg で Grain の 2,960 倍 → 約12倍) |
| Ink のレシピ | Oil 1 → 0.1、Dyes 0.5 → 0.1(油 0.1 樽で煤を取る。顔料 6 kg) |
| Books・Artworks の ink の脚 | 0.5 瓶 → 0.5/120 樽(同じ 0.5 L) |
| 工房(`experimentalWorkshops.ts`)の消費 | 0.1 → 0.1/120 |
| `craftDemandCalibration.ts` の Ink | 月の lot 0.2 → 0.2/120、労働点 0.0169 → 0.0169 × 120 |

- 1 lot の利益は 7 − 4(Oil 1)= 3 から 3.4 − 0.4 = 3 に保った(Dyes の脚は 3.4 − 0.8)。
- Books の原価は ink の分(3.5)が 0.015 になり、その分 Books の利幅が上がる。Books の値(18)は変えていない。

### 25.2 古い保存

`migrateInkBarrel`(`GOODS_CATALOG_MIGRATIONS`、`migrateMeasuredCargoSlots` の前)が、Ink の単位が bottle のとき barrel にして、市場の在庫を 1/120 にする(`migrateLinenBale` と共通の `migrateLargerUnit`)。値・レシピは `migrateWeightRepricing`(`WEIGHT_REPRICING`・`WEIGHT_RECIPE_REPRICING`)が、元の値のままのものだけ直す。移動中の荷・注文は直さない。

### 25.3 計測

盗賊なし、province-101、3年(前 → 後)。品別の生産は取っていない。集計だけ見た。

| 項目 | 前 → 後 |
| :--- | :--- |
| 3年目の終わりの国庫の合計 | 548,369 → 548,239 |
| 贅沢品の充足(12か月) | 2.896 → 2.914 |
| 贅沢品の支出 | 3,095.9 → 3,104.0 |

- 集計は前後でほぼ同じ(0.1% 未満)。Books の原価が下がった影響は集計には見えない。
- 試験: `goods-generator.test.ts`(Ink の移行を追加)を含む `economy/generators` は、前から失敗している6件(`tradeTransportRoom.test.ts` 5件・`foodClimateCalibration.test.ts` 1件)だけが失敗。`tsc` は通る。
- 3年後の保存(`--out`)は、`Invalid character organization roster` で失敗した。旧人物の組織名簿への移行に原因があり、§25.4 で修正した。

### 25.4 保存エラーと計測時の人物(2026-10-22、修正)

`province-101.fmg` は、組織名簿・master 初期人物の参照データがない旧形式で、人物54人が保存されている。この地図では、3年進めた後だけでなく、読み込んで0日で保存してもエラーを再現した。Ink の生産や単位変更によって起きるエラーではない。

原因は `roster/runtime.ts migrateCharacters`。旧人物の `Commander` という肩書きと国家だけで役職を照合するため、同じ国の指揮官3人を、各連隊の指揮官役職に重複して登録していた。組織の再構築で各役職の定員が1人に戻り、保存時の名簿検証で「在任人数が定員を超える」として失敗した。

- 指揮官は肩書きではなく、連隊の `commanderId` によって照合するように修正した。
- 兼職の移行では、最初の役職の番号を使い回さず、役職ごとに在任者の番号と必要な定員を計算するように修正した。
- `sim` は `--out` または `--hash` を指定した場合だけ保存処理を呼ぶようにした。`--samples` のみの計測では不要な保存を行わない。

修正後は、同じ入力・`--years 3 --world-setting fmg-caravan-raids=off --out ...` で 590-1-1 → 593-1-1(1,096 tick)の進行と保存に成功した。回帰テストは `roster.test.ts` に追加し、`reference.test.ts` と合わせて25件成功。`tsc --noEmit` も成功した。

人物の作製については、旧保存では保存済みの人物をそのまま移行するため、All master opening characters を実行する必要はない。新形式の master 初期人物も、画面に人物シートを作製する前から `getSimulationCharacters` / `operationalWorld` を通じてシミュレーションに参加する。All master opening characters は、それらの人物シートを表示用に実体化する操作であり、全初期人物を計測に参加させるための必須操作ではない。`sim` の拡張機能は既定で全4種類が有効。

#### 残る課題

- 酒樽5品・Rennet・Leather・Beeswax: 同じ方法で、1 品ずつ。
- Ink・Linen の品別の生産・取引を集計に出す(今回は集計だけ)。

## 26. Beeswax: 蜜の採取の副産物へ(2026-10-22、実装)

方針は「ファンタジー要素以外の校正データは常に史料を基準とする」。§25 の方法を Beeswax に当てると、歩留まりを史料に合わせた場合に今の recipe の形(Honey を入力にして作る)では成り立たなかった。蝋は蜜の採取の副産物なので、採取に蝋を付ける形(案 a)にした。

- 今の recipe は Honey 0.5 樽(84 kg)から蝋 10 kg(8.4 : 1)。史料は蜜約 20 kg から蝋 1 kg(20 : 1)。蝋の値を史料の約45倍にすると、20 kg の蜜の値が蝋 1 kg の値の約5倍になり、Honey を入力にしたままでは赤字になる。
- `byproducts` は recipe を持つ品にだけ働く。Honey は recipe を持たず、農村の採取(`production-utils.ts getRuralProductionContributions`)で出る。

### 26.1 変えたもの

| 項目 | 今まで → 後 |
| :--- | :--- |
| Beeswax の単位 | block(10 kg) → block(100 kg)。`goodMeasureCatalog.ts` |
| Beeswax の値 | 5 → 9.7(1 kg で Grain の約45倍。史料。233倍だった) |
| Beeswax の recipe | Honey 0.5 → なし |
| 蝋の出どころ | Honey の採取に付く。Honey 1 樽(168 kg)につき蝋 8.4 kg = 0.084 lot(`BEESWAX_LOTS_PER_HONEY_LOT`) |
| Candles の値 | 10 → 14(100 kg の蝋が 9.7 なので、蝋の脚に利幅を付けた) |
| Candles の recipe | `[Honey 2, Oil 1, Beeswax 1, Tallow 1]` → `[Oil 1, Beeswax 1, Tallow 1]`。Honey の脚は、100 kg の蝋燭に蜜 2 t(12 樽、原価 48)が要り、利幅の試験にも通らないので外した |
| 枠 | `MEASURED_SLOT_GOODS` に Beeswax を加えた(Candles は既に入っている) |

- Candles の `{ Beeswax: 1 }` の脚は数が同じ。単位が 10 kg から 100 kg になり、100 kg の蝋燭に 100 kg の蝋という質量の合う脚になった。

### 26.2 古い保存

`migrateBeeswaxByproduct`(`GOODS_CATALOG_MIGRATIONS`)が、Beeswax に recipe があれば消し、市場の在庫を1/10にし、Candles の Honey だけの脚を外す。値は `migrateWeightRepricing`(Beeswax 5 → 9.7、Candles 10 → 14)が直す。

### 26.3 計測

盗賊なし、province-101、3年(前 → 後)。

| 項目 | 前 → 後 |
| :--- | :--- |
| 3年後の国庫の合計 | 549,131 → 549,034 |
| 贅沢品の充足 | 2.925 → 2.921 |
| 市場の在庫 Beeswax(block) | 0 → 789 |
| 市場の在庫 Candles | 52.6 → 20.6 |
| 市場の在庫 Honey | 10,916 → 10,847 |

- 集計はほぼ同じ。蝋は今までほぼ作られず(Honey を入力にする recipe が選ばれなかった)、採取から出るようになった。在庫が溜まる分は、蝋の需要(`utilities` 0.1)が小さいため。蝋の使い道を増やす課題は未着手。
- 試験: `src/extensions/economy` は、前から失敗している6件のみ失敗。`tsc` は通る。

#### 残る課題

- 蝋の在庫が溜まる。Candles の需要・蝋の他の使い道(封蝋など)は未調整。
- Rennet(1 L あたり牛 0.03 頭の recipe。1 lot の利益を保つと入力が出力の値を超える)も同じ型の問題を持つ。史料の歩留まりと値で見直す。
- 酒樽5品・Leather(Boots・Harnesses と一緒)。
