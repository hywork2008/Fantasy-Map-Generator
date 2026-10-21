# 商品の単位: 中身・荷姿・取引の 3 層

状態: 2026-10-20 設計(未実装)。家畜の 1 head を 1 頭にする [livestock-head-unit.md](livestock-head-unit.md) を、全品目の単位に広げる。同日、単位の語ごとに標準の量を決める初版を、中身・荷姿・取引の 3 層に書き直した。2026-10-21、史料・博物館の所蔵品解説・物性資料を再確認し、§9 の採用方針を確定。容量・風袋の代表値、容器の再使用、取引条件による荷姿の選択、価格の校正、全207品目の基本単位を補った。同日、陸・船・倉庫・家畜の上限を史料(§10 の S17〜S32)と照合して既定値を直し、今のコードの荷を計測した(§12)。また物流の判定のため、品の物性の項目(§5.1)、固い容器と柔らかい容器(§5.2)、ばら積みの容積の式と、陸・船・倉庫・家畜の重さと容積の上限(§5.4)を足し、荷車の隊の積載量の誤った比較を船の積載量の食い違いに直した。数値の校正と実装は未実施。

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
| 荷馬車 240枠 / 180枠 / 実効160枠 | `tradeCargo.ts` / `transportAssetOrders.ts` / `getTransportAllocations`(`requiredDraftAnimals` 2 × 牽く量80) | 同じ車両が3通りに読まれる(20台で36 t / 27 t / 24 t)。計測(§12)で実際に使われていたのは160枠 |
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
