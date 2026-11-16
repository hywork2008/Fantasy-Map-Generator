# upstream culture 実装における一神教文化の表現範囲

- **日付**: 2026-11-16
- **対象**: `/Users/h-yamaguchi/Projects/fmg-upstream`（Azgaar's Fantasy Map Generator 1.158.0）
- **範囲**: culture の生成・データと、それに接続する religion / state / development。fmg-2 側の実装は見ていない。
- **問い**: 古代ローマ期から現代までの一神教文化を、この実装で表現できるか。

## 結論

古代ローマ期から近世初頭までの民族・言語の地図は置ける。一神教そのものは文化の属性ではなく、宗教レイヤのラベルである。ユダヤ教・キリスト教・イスラームの歴史的な振る舞いと、啓蒙期以降の社会は、生成でもデータ構造でも表現できない。

「一神教の文化」は、言語圏の文化と、形態が一神教の宗教を同じ地図に並べたときの読みである。両者の結合は弱く、形態は名前と神名の有無しか変えない。

## 文化が持っているもの

文化は言語圏と居住域である。`src/model/society/cultures-generator.ts` の `Culture` にあるのは名前、ネームベース、紋章の盾形、生態学的な型、拡張力、中心の開発度、任意の `ancestry`、起源 ID である。教義、聖典、聖職、聖語、暦、改宗方針のフィールドはない。データモデル上の説明も「races, language zones」である（`docs/architecture/data-model.md`）。

型は `src/data/culture-types.ts` の 7 つである。

`Generic`、`Hunting`、`Highland`、`River`、`Lake`、`Naval`、`Nomadic`

型は発生地点のバイオーム、標高、海岸、河川から決まる（`cultures-generator.ts` の `defineCultureType`）。ローマ文化でもヘブライ文化でも、草原なら Generic、海岸で抽選に当たれば Naval になる。帝国、都市文化、文字文化、法文化という型はない。広がりもこの型の生態コストで決まり、開発度や宗教では変わらない（`docs/wiki/Culture-types.md`）。

開発度は 1–100 で、時代名は Paleolithic から Post-human まで `src/data/development.ts` の `DEFAULT_ERAS` に定義されている。文化セットが実際に入れる値はそこまで届かない。

| セット | 文化の開発度 | 対応する時代名 |
| --- | --- | --- |
| Antique | 12–24 | 青銅器時代〜古代末期 |
| European など | おおむね 28–42 | 中世前期〜ルネサンス |
| High Fantasy のドワーフ | 50–53 | 科学革命の入口 |
| 定義のみ | 60、70、80、90 | 啓蒙、産業革命、機械時代、宇宙時代 |

Antique の Roman は 24（古代末期の境界）、Hebrew は 19（鉄器時代の次）。European の Tallian は 42、Luari は 40、Romian は 36 である。未指定時の既定は 33（商業革命）である。

中心の値に型補正が乗る。Naval は +3、River は +2、Lake は +1、Highland は −2、Nomadic は −3、Hunting は −4 である。セルの開発度は、その文化の中心値にバイオームと川・海岸を足し、近傍で平滑化し、振幅 9 のノイズを加えたものである（`src/model/society/development-generator.ts`）。一つの文化の中に時代の幅は出る。産業社会や国民国家の段階へ進む文化セットはない。開発度を手で 70 にしても、広がりの規則は同じ生態コストのままである。

生成時、全文化の `origins` は `[0]`（野生地）である。子文化は、ユーザーが既存文化のセルへ文化を追加したときだけ、そのセルの文化を親にする。Roman から Tallian への言語的継承は自動では起きない。`ancestry` はエルフやドワーフなどの種族ラベルで、同じ ancestry は Folk 宗教を 1 つ共有する。歴史上の民族系統ではない。

## 一神教は宗教側の抽選ラベル

宗教の型は `Folk`、`Organized`、`Cult`、`Heresy` である（`src/model/society/religions-generator.ts`）。Folk の形態はシャーマニズム、アニミズム、多神教、祖先崇拝、自然崇拝、トーテミズムだけで、一神教にはならない。どの文化も最初は Folk に全面的に覆われ、組織宗教がそれを押しのける。

Organized の形態の重みは次のとおりである。

| 形態 | 重み |
| --- | --- |
| Polytheism | 7 |
| Monotheism | 7 |
| Dualism | 3 |
| Syncretism | 2 |
| Pantheism | 2 |
| Non-theism | 2 |
| Philosophical | 1 |
| Ethical | 1 |
| Deism | 1 |
| Henotheism | 1 |

一神教は組織宗教の 7/27、約 26% である。宗教核の 10–40% は Cult で、Cult の形態は Cult、Dark Cult、Sect である。マップ全体では一神教は競合宗教のおよそ 2 割になる。

形態が変えるのは名前と、神名を持つかどうかだけである。拡張コストは形態を見ない。一神教の命名だけが拡張モードに偏る。命名重み 24 のうち global 15、state 5、culture 4 である。多神教は global 35%、state 35%、culture 30% で、一神教の方が普遍宗教の名前になりやすい。名前は `Faith of …` や `Church` といった英語の合成名で、ラテン語、アラビア語、ヘブライ語の教団名ではない。神名は文化のネームベースから作った幻想名である（`getDeityName`）。

セルは文化 1 つ、宗教 1 つである（`pack.cells.culture` と `pack.cells.religion`）。少数派、離散、ミッレト、無宗教多数派は置けない。宗教の予算は `セル数 / 20 × 成長率`、文化は `セル数 × 0.6 × 成長率` なので、宗教は文化より狭い競合領域になる。

Folk が `Old` と改名されるのは、同族に `expansion: "culture"` の組織宗教があるときだけである。最も多い global 一神教では、基層信仰の名は Old にならない。

## 時代ごとに置けるものと置けないもの

### 古典古代

Antique セットは 16 定義のうち最大 10 文化である（`getDefault` の `set === "antique"`）。内訳は Roman が 4 枠、Hellenic が 2 枠、ほか Macedonian、Celtic、Germanic、Persian、Scythian、Cantabrian、Estian、Carthaginian、Hebrew、Mesopotamian である。

Roman のネームベースはロンディニウムやルグドゥヌムのようなラテン語地名で、盾は `roman` である（`src/data/name-bases.ts` の Roman、index 8）。ヘブライとカルタゴはどちらも Levantine（index 42）で、エルサレム、ウガリト、カルタゴ、ヤスリブが一つのマルコフ源に入っている。ユダヤとフェニキアとポエニを名前では分けられない。Hebrew の出現率は 0.2 で、その Folk 宗教も多神教系の抽選である。文化名がヘブライでもユダヤ教にはならない。

ローマの多神教から国教キリスト教への移行は、1 枚の地図にはない。ローマ文化の都市に一神教が発祥し、`expansion: "state"` か `"global"` で広がれば、ラテン語地名の上に一神教が乗った帝国は偶然できる。その確率は保証されず、地名は帝国期のラテン語のままである。ビザンツは、ギリシア語ネームベースと、神政なら Patriarchate、Exarchate、Eparchy という称号の組み合わせで近似するだけである。

パイプラインは文化の展開、国家の生成、宗教の生成、国家形態の決定の順である（`src/model/generation-pipeline.ts`）。宗教は既存の国家境界を見て state 拡張できる。国家形態は宗教の結果を見て神政になれる。時間の経過はどちらにもない。

### 中世キリスト教世界

European セットは Shwazen、Angshire、Luari、Tallian、Astellian、Slovan、Norse、Elladan、Romian、Soumi、Portuzian、Vengrian などで、Romian の出現率は 0.2 である。これは言語と盾のセットで、教会は別レイヤである。一つの global 一神教が複数文化を覆えば「一つの信仰、複数の民族」にはなる。

正教とカトリックの分裂は、境界上の Heresy である。Heresy は拡張力 3 以上の組織宗教の境界セルに、平均 0、最大 3 個出る。親の形態は継ぐので一神教の異端にはなる。Heresy の命名はすべて global 拡張で、国家内分裂や文化内分裂にはならない。都市の改革者ではなく、領域の縁である。カルケドン分裂のような対等な二つの教会は、起源木では作れない。組織宗教の起源は、culture 拡張かつ 50% のときだけ親 Folk で、それ以外は半径内の近傍宗教が最大 2 つである。

国家称号はネームベースに結び付いている（`states-generator.ts` の `defineStateForms`）。ヨーロッパ系の神政は Diocese、Bishopric、Divine Kingdom など、ギリシア語とルテニア語は Eparchy、Exarchate、Patriarchate である。神政になる条件は、首都の宗教が `expansion: "state"` であること、または Organized か Cult なら 10% の抽選である。一神教であることは見ていない。state 拡張の多神教でも神政になる。global 一神教は神政を自動では作らない。

### イスラーム圏

Oriental セットに民族の近似がある。Eurabic（開発度 40、アラビア語、砂漠寄り）、Tehrani（38、イラン語）、Turchian（35）である。All-world では Eurabic の出現率は 0.05、Levent（レバント、開発度 35、Levantine ネームベース）は 0.2 である。

称号だけが教団を匂わせる。アラビア語・アマジグ語の帝国は Caliphate、アラビア語の公国級は Emirate、トルコ語・ナイジェリア語の神政は Imamah、大きなアラビア語・アマジグ語・スワヒリ語の神政は Caliphate である。これもネームベースに結び付いた国号で、宗教形態が一神教であることは見ていない。

アラブ化（文化の拡張）とイスラーム化（宗教の拡張）は独立した洪水充填である。結果として「信仰は広く、アラビア語文化は狭い」は起き得る。設計された連動ではない。聖語と日常語の区別、法学派、モスクはデータにない。

### 離散、寛容、都市

ディアスポラは領域モデルに合わない。culture 拡張の宗教はその文化の領土に留まり、都市の少数派として散らばらない。手でセルを塗る以外に、ユダヤ教徒の離散やオスマン帝国の宗教共同体は置けない。

異文化・異信仰は次の数値にだけ現れる。

- 国家の腐敗は、支配文化と違う人口と、首都の信仰と違う人口を半分ずつ足し、最大 +10 である（`getDiversity`）。
- 兵力は支配文化と違うと半減する。Union では 1/1.2 である。首都の信仰と違うと 1/1.4、神政では 1/2.2 である（`military-generator.ts`）。

ズィンミーや宗教的寛容の制度はない。都市の `temple` は真偽値で、聖堂、モスク、シナゴーグの区別はない。`monastery` は都市グループ名である。

### 近世以降

近世以降の文化セットはない。大航海時代（開発度 45）以降の文化定義はなく、アメリカ、植民地の娘文化、国民国家、宗派化、世俗化、無宗教もない。理神論、非神論、哲学、倫理は組織宗教の稀な形態として存在し、セルを排他的に塗る。English セットは英語ネームベースを 10 文化に複製するだけで、近代のイングランドとその外延ではない。Portuzian の盾が `renaissance` なのが、意匠上の最も新しい印である。

## 手で補える範囲

エディタでは文化名、ネームベース、開発度 1–100、起源リンク、宗教の `form`（自由文で Monotheism と書ける）、拡張 `global` / `state` / `culture`、神政の称号、タグとノートを固定できる。ローマの娘文化としてのイタリアや、アラビア語文化の外まで広がる一神教は、配置としては組める。

組んでも残る欠落は次のとおりである。

- 一神教と多神教で拡張規則が変わらない。
- 1 セル 1 宗教のままなので、少数派と離散が置けない。
- 改宗は時系列ではなく、空間的な起源木である。
- 聖語、法学派、聖職階位、典礼がデータにない。Patriarchate や Caliphate は国号である。
- Hebrew と Carthaginian は同じ地名源のままである。
- 開発度を上げても、文化の広がりは生態型のままである。

## 参照した実装

- `src/data/culture-types.ts`
- `src/data/culture-sets.ts`
- `src/data/development.ts`
- `src/data/name-bases.ts`
- `src/model/society/cultures-generator.ts`
- `src/model/society/religions-generator.ts`
- `src/model/society/development-generator.ts`
- `src/model/political/states-generator.ts`
- `src/model/political/military-generator.ts`
- `src/model/political/burgs-generator.ts`
- `src/model/generation-pipeline.ts`
- `docs/architecture/data-model.md`
- `docs/wiki/Culture-types.md`
- `docs/wiki/Culture-sets.md`
