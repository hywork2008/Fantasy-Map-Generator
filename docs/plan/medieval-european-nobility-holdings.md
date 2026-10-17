# 中世ヨーロッパ貴族の領地分割

- 状態: Draft（レビュー 1 回目 2026-10-17 済。R4 は 2026-10-17 にスコットランド型 `gaelicProvincial` として決定し、台帳と NPC まで実装した。他の体制は未実装で、現行の辺境領主のまま）
- 日付: 2026-10-17
- 対象: Nobility 拡張を有効にしたときの、中世ヨーロッパ系国家への貴族 NPC 配置
- 関連実装: `src/extensions/nobility/generators/provinceLordGenerator.ts`, `src/extensions/nobility/data/titleTable.ts`, `src/generators/provinces-generator.ts`, `src/generators/states-generator.ts`

## Overview

Nobility 拡張は今、国家ごとに統治者と中央官職を置き、辺境の Province にだけ領主を 1 人置いている。内陸の複数セルを持つ貴族、都市へ統治を委任された者、辺境伯のような職務、騎士の軍役単位は存在しない。Province の `formName`（County、Barony、Margrave など）は面積や国境と無関係なフレーバー抽選である。

本設計は、中世ヨーロッパの土地保有を「爵位の階段がそのまま面積になる」モデルとしては採用しない。階級（dignity）、職務（office）、保有形態（tenure）を分け、文化と統治制度ごとの分割手続きで Holding（領地台帳）を作る。NPC にするのは台帳のうち政治的に意味のある席だけにする。騎士 1 人につき 1 セルは、既定の地図縮尺では史料とも実装コストとも両立しない。

## Background

### 現行の地図単位

Province は `Provinces.generate()`（`src/generators/provinces-generator.ts`）が、国家内の burg を人口順に種にして領域成長させた行政区画である。`options.provincesRatio` の既定は 20 で、州数は `max(ceil(burg数 × 0.2), 2)`。burg が 2 未満の国家には州ができない。成長後の面積は歴史上の「伯領」や「男爵領」とは一致しない。

Monarchy の州名は次の重みで抽選される。County 22、Earldom 6、Shire 2、Landgrave 2、Margrave 2、Barony 2、Captaincy 1、Seneschalty 1。Margrave は辺境でなくても付く。Republic、Theocracy、Union、Anarchy は別語彙（Province、Parish、Council など）を使う。

国家の `form` は Monarchy / Republic / Theocracy / Union / Anarchy。`formName` は面積ティアと文化の name base で決まる（`States.defineStateForms()`）。ヨーロッパ風の君主国は Duchy、Grand Duchy、Principality、Kingdom、Empire。属国の辺境公国は Marches になり得る。Khanate、Shogunate、Emirate、Horde、Caliphate、Tsardom、Despotate などは同じ `form === "Monarchy"` でもヨーロッパ封建の語彙ではない。

セル面積はピクセル面積 × `distanceScale²` である。`getArea()`（`src/utils/domUtils.ts`）がこれを返す。`distanceScale` は赤道周長 40,075 km × `mapSize / 100 / graphWidth`（`src/data/earthConfig.ts`）。既定は `mapSize` 12.9、キャンバス 960×540、グリッド約 10,000 セル（`points === 4`）。このとき

- 地図の幅は約 5,170 km、面積は約 1,500 万 km²
- グリッド 1 セルの名目面積は約 1,500 km²

である。パックの内陸セルも同じオーダーで、海岸は点を追加するためより小さい。ただし実地図ハイトマップ（Britain、Europe など）では `distanceScale` が赤道基準のまま計算され、`getArea()` は真の面積の 1/cos²(中央緯度) 倍、Britain で約 3.1 倍、Europe で約 2.7 倍を返す（R1）。`mapSize` を下げ、`points` を上げるとセルは小さくなる。領地割当はセル個数ではなく、生成時に測った km² を使う。

都市人口の実数は `burg.population × populationRate × urbanization` である（`src/generators/burgs-generator.ts`）。`populationRate` の既定は 1,000 なので、`population` 1 は約 1,000 人、10 は約 1 万人である。

### 現行の貴族 NPC

`assignProvinceLords()` は `getProvinceThreats()` が脅威ありとした辺境州にだけ生存領主がいなければ 1 人作る。称号は `resolveProvinceLordTitle()` が州の `formName` から取る。内陸州は無名のままである。これは `docs/plan/char.md` の判断で、州ごとの領主は名簿を膨らませるため採用されていない。本設計はこの判断を上書きする。名簿の上限で席を間引かず、史料上必要な席を実際に揃える（レビュー R3）。

`TitleHolding.entityType` は `"state" | "province" | "burg"` である（`src/extensions/characters/characterTypes.ts`）。コメントは burg を市長や評議会のために予約しているが、生成はしていない。1 称号が複数セルを指すフィールドはない。

中央官職は時代テーブル `OFFICES_BY_ERA.medieval` の Chancellor、Marshal、Steward、Spymaster、Court Chaplain で、土地を持たない（`landed: false`）。

### この設計が解くこと

辺境伯だけを足しても、ユーザーが求めた配置には届かない。必要なのは次の 4 層である。

1. 複数の Province、または Province をまたぐセル群を持つ上級貴族
2. 1 Province 前後を持つ伯・辺境伯・司教領主
3. 都市とその管轄だけを委任される者（市長、執政、城伯、代官）
4. セルより小さい騎士の軍役を、人数の台帳として持つこと

## Goals

- Historical period が `earlyMedieval`、`highMedieval`、`lateMedieval` のいずれかで、文化と `state.form` がヨーロッパ中世の対象に入る国家に、領地台帳と貴族 NPC を置く。
- 階級と職務を分離する。辺境伯は辺境の職務であり、内陸の大きい伯領の別名にしない。
- 同じ爵位でも、地図の km² に応じて支配セル数が変わる。
- 都市運営の委任を、農村領地とは別の席として burg に付ける。
- 名指しの席は名簿の軟上限で間引かない。体制と人口・burg から必要数を導き、その数だけ Character を作る（R3）。
- 対象外の国家（遊牧君主、日本の幕府、共和制の都市国家を封建伯国として塗る、など）は現行の辺境領主のままにする。
- 既存の Province 境界、軍事プール、国境分析は変えない。領地はオーバーレイである。

## Non-Goals

- 騎士 1 人、荘園 1 つにつき NPC を 1 人作ること。
- 1611 年創設の baronet（準男爵、日本語で騎士爵とも訳される世襲爵）を中世マップに置くこと。
- Province を領地の形に切り直すこと。
- ルース人のボヤール、ビザンツのプロノイア、イスラムのイクター、日本の知行をこの文書の割当アルゴリズムに含めること。対象外としてフォールバックする。
- `ageOfExploration` 以降の残余的な貴族制。中世の 3 期以外ではこの割当を走らせない。
- 領地からの税収式の再設計。台帳は後で動員と財政が読める形にするが、税率の変更は別作業である。
- 継承法の全文実装。分割相続と長子相続のどちらを台帳更新に使うかは、初回配置の規則として決め、死亡時の再分割は後続 PR とする。ケルトのタニストリーもここに含む。空席は同称号の新人物で埋めるところまで。
- ケルト Holding の保有者を burg 俸給へ接続すること。較正前の引き出しは R7 として後回しにする。
- 司教 NPC、家政騎士、旗手騎士、地図オーバーレイ。ケルトでも法人の教会 Holding と封数の数値だけを置き、これらの席と塗りは作らない。
- ケルトの必要席に `shouldGenerateSparseRole()` を掛けて間引くこと。

## 史料から採る単位

西欧中世に、爵位と面積の対応表は無い。Susan Reynolds, *Fiefs and Vassals*（Oxford, 1994）が整理したとおり、王―公―伯―男爵―騎士が排他的に土地を積み上げる図は、12–13 世紀の法学者の整理が強く、初期中世の実態でも地域共通の制度でもない。実装は「1 爵位 = 1 面積帯」を全世界に適用せず、地域と世紀で手続きを切り替える。

以下の広さは、ゲームの目標帯を決めるための較正値である。史料の 1 件を全世界の定数にはしない。

### 王国と直轄

- イングランド王国の土地面積は約 13 万 km²。Domesday Book（1086）は荘園単位の調査で、記録された土地価値約 £73,000 のうち教会分は約 £18,400、すなわち約 4 分の 1 である。教会のテナント・イン・チーフの条目は全条目の約 15% で、そのうちさらに下封されたものがある（教会財産の研究が示す £18,400 / £73,000 と、条目比）。ノルマン王権の法理では土地はすべて王から保有される。王自身が占有する直轄地はその一部であり、王国の過半を塗るものではない。
- フランス王領は 1180 年時点ではパリを核とするイル＝ド＝フランスとその周辺に限られ、プランタジネットの公領・伯領、フランドル、シャンパーニュ、ブルゴーニュ、トゥールーズが王国の残りを占めていた。Philippe II Auguste（1180–1223）の治世に王領はノルマンディー、アンジュー、メーヌ、トゥレーヌ、さらにピカルディの諸伯領を併せて拡大した。13 世紀後半から 1328 年までに王領は王国の大半へ広がるが、アパナージュ（王子領）が再び大きな塊を切り出す。Louis VIII の遺言に始まるアルトワ、ポワトゥー、アンジュー、のちに Jean II が息子たちに与えたアンジュー、ベリー、ブルゴーニュがそれである（Crown lands of France; Britannica, appanage）。
- 神聖ローマ帝国では、皇帝直轄は帝国諸侯・司教・帝国都市・帝国騎士のモザイクのあいだに散在する。重要な地位は面積ではなく帝国直属（Reichsunmittelbarkeit）、すなわち皇帝以外の領主を仲介しないことである。

直轄地のゲーム既定（較正パラメータ。Domesday のパーセントそのものではない）:

| 体制 | 直轄として領主 NPC を置かないセルの割合 |
| --- | --- |
| イングランド型 | 土地の 15–25%。首都州と、各伯領から細かく抜いた散在セル |
| フランス型・初期 | 首都から連続する塊で王国の 10–20% |
| フランス型・盛期後半以降 | 40–70%。残りを諸侯とアパナージュ |
| ドイツ型 | 10% 未満。直轄は首都セルと少数の城塞 |
| 北欧型 | 行政官区が原則で、王の私領は別枠の小さい割合 |
| ハンガリー型 | 城県（vármegye）は王の行政区画。私領化は世紀とともに増やす |
| ケルト・スコットランド型 | 初期は首都セルだけ。盛期は国土の 10%、後期は 15%。首都から連続し、少なくとも首都セル |

### 公（duke）

公はもともと軍司令官または大族の支配者で、面積規格ではない。ノルマンディー公領やブルターニュは数万 km² の領域君主である。ドイツの部族大公国（ザクセン、バイエルン、シュヴァーベン）も王国に近い。小国の `formName` が Duchy のときは、その国家自体が公領であり、国内にさらに公を置かない。

ゲームの目標帯: 連続領地として 15,000–40,000 km²、または Province 2–4 個分。それより小さい国家では公の中間領主を作らない。

### 辺境伯（margrave / marchio / Markgraf）

辺境伯は爵位というより辺境軍管区の職である。カロリング朝のマルカ（スペイン辺境伯領、ブルトン辺境、東方の諸辺境）は複数の伯管区を束ねる軍政で、伯より広い権限（城の建築、現地軍の召集、外交の裁許）を持った。ブランデンブルク辺境伯領は北方辺境（Nordmark）から成長し、1356 年の金印勅書で選帝侯になった。職が世襲化し、のちに侯爵（marquess）という宮中序列へ吸収される。

したがって辺境伯の土地は「伯より一段階広い」とは限らない。広いのは管区全体であることが多く、本人の私領は伯と同じオーダーでよい。ゲームでは次の 3 つをセットにする。

- 職務 `borderCommand`: 敵対国家または無主地に接する Holding にだけ付与する。
- 称号は文化語彙で Margrave、またはイングランド文化では Earl of the March / Lord Marcher。フランス語文化で国境が海や友好国だけのときは付けない。
- 私領の目標面積は同文化の伯と同じ帯。権限だけが広い（徴募倍率、城塞の優先、辺境政策）。

現行の州ラベル Margrave（重み 2 の内陸抽選）は、この職務と一致しない。Nobility がこの割当を走らせた国家では、内陸州の `formName === "Margrave"` を County または Landgrave に直す。辺境の Holding の首邑がある州にだけ Margrave を残す。

### 伯（count / comes / Graf / earl）

カロリング朝の伯は、パグス（地方区）の王吏で、裁判・軍招集・王領地の管理を担った。世襲領土化したあとも、伯領の広さは地域で桁が違う。

- フランスの大伯領（フランドル、シャンパーニュ、トゥールーズ）は公領に近い数万 km² になり得る。これは「伯」ではなく領域君主として、公と同じ割当段に上げる。
- ドイツの伯領はより小さく、後期には城と数村まで分解するものがある。
- イングランドの shire は行政区画である。州の数は 30 余。平均すれば数千 km² だが、ヨークシャーとラトランドでは桁が違う。Earl はその州の所有者ではない。伯は州裁判収入の 3 分の 1（third penny）と、州の内外に散る所領を持つ。州の運営者は sheriff（shire-reeve）で、王の官吏である。

ゲームの伯の目標帯（私領または世襲化した管区）:

| 体制 | 目標面積 | 連続性 |
| --- | --- | --- |
| フランス型 | 3,000–15,000 km² | 連続 |
| ドイツ型・盛期 | 1,000–8,000 km² | 連続を優先し、分割相続後は飛地を許す |
| イングランド型 | 伯は行政官ではない。Earl の所領は名誉（honour）として 2,000–10,000 km² 相当の持分を非連続に散らす | 非連続 |
| ハンガリー型 | 県は行政区。世襲マグナートの所領は県の内側とまたぎで 2,000–12,000 km² | 連続寄り |

Landgrave（Landgraf）は、テューリンゲンやヘッセンのように、通常の伯より広い地域裁判権を持つ伯の上位である。目標面積が伯の上限を 2 倍以上超える 1 塊にだけこの称号を使う。州ラベルの Landgrave 抽選とは独立に、測った面積で付与する。

### 子爵（viscount / vicecomes）と城伯（burgrave）

フランスの vicecomes は伯の代理である。11 世紀までに南フランス（ベアルン、ナルボンヌ、カルカソンヌ）では世襲の領土領主になり、伯領の一部、複数の城代管区を持った。イングランドの viscount は 1440 年に Peerage の爵位として現れる宮中序列で、領土単位ではない。中世のイングランド文化には領土としての子爵を置かない。後期中世に稀な尊称として 1 国家 0 または 1 までにする。

ドイツの Burggraf は都市城または王城の司令官である。ニュルンベルクでは城伯と都市参事会が別管轄で並立した。土地は城とその直近の管轄で、伯領全体ではない。ゲームでは「城壁のある burg と、都市共同体が併存するとき」の軍事席とし、支配セルは 0 または 1 とする。

### 城代管区（châtellenie）

Georges Duby, *La société aux XIe et XIIe siècles dans la région mâconnaise* が示したように、マコネ地方では 1000–1030 年頃に伯の公的裁判が崩れ、城主がバン（命令権、裁判、徴発）を私した。1 つの伯領の中に複数の城代管区があり、1 つの城代管区は複数の教区・村落を含む。村落の土地所有（seigneurie foncière）とその上のバン領主権は別である。11 世紀末のマコネでは、なおアロド（無封の自由地）が卓越していた、とも Duby は書いている。

既定縮尺の 1 セル（約 1,500 km²）は、村落でも騎士封でもなく、小伯領または城代管区の束に当たる。この縮尺でセルの名指し領主は城代か小伯である。セルがおおむね 50 km² を下回る地域図では、セルを 1 つのセイニュリーとみなし、旗手騎士が 1 セルを持てる。

### 男爵（baron）と名誉（honour）

イングランドの baron は、王から直接保有するテナント・イン・チーフのうち、バロンの法廷に出る者を指す。所領は honour と呼ばれ、複数の州に散る荘園の集合である。I. J. Sanders, *English Baronies*（1960）が追跡したバロン領は、塗りつぶされた州ではなくこの散在複合体である。

フランスの baron は、高裁判権と城、数人の家臣を持つ領主の緩い呼称で、連続した小さい領土であることが多い。

ゲームでは体制で分ける。

- イングランド型: Holding は非連続。セルごとに保有割合（basis points）を持つ。地図の単色領域にはしない。
- フランス型・南イタリア型: 連続した 1 セル、またはセルが 200 km² 未満なら数セル。burg を持つものだけ NPC にする。

### 騎士、旗手騎士、騎士爵

騎士封（knight's fee, feodum militis, fief de haubert）は、騎兵 1 人を支える会計単位であり、測量された正方形ではない。

- 1166 年の Cartae Baronum を集成した Thomas K. Keefe の表は、チェシャーとウェールズを除き 313 件、7,525 騎士封を数える（*Feudal Assessments and the Political Community under Henry II and His Sons*, 1983, Appendix）。イングランド規模の王国で数千件であり、村ごとでも州ごとでもない。
- 同封の返答例では、Lambert of Etocquigny が 16 カルケートと 2 ボヴェート（約 2,000 エーカーの耕地評価）で 10 人分の軍役を負う。1 封あたり約 200 エーカーの耕地評価である。いっぽう「1 封 = 5 ハイド」という規範もあり、ハイド自体が地域で 40–120 エーカー程度に振れる税の単位である。1 つのエーカー数をコードに固定しない。
- 封は分数化が普通である（半封、4 分の 1 封）。人は複数の封の持分を集め、1 つの荘園が複数の領主に分割される。
- Distraint of knighthood: Henry III は年収 £20 の自由保有者に騎士になることを求めた。閾値はのちに上がり、テューダー期には £40 である。騎士は世襲爵位ではなく、土地収入または戦功で帯びる身分である。
- 旗手騎士（knight banneret, banneretus）は 13 世紀半ばまでに、自旗の下で他の騎士を率いる上級騎士として確立した。戦場では通常騎士より高い給与を取り、民事の男爵称号と並記されることがあった。James I の baronet とは別物である、と John Selden が注意している。
- Baronet は 1611 年 5 月、James I がアルスター植民の資金として創った世襲尊称で、Peerage でも騎士団でもない。中世の `historicalPeriod` では生成しない。日本語の「騎士爵」がこの爵を指す場合、中世マップ上の対応物は旗手騎士と、複数封を率いる小男爵である。

ドイツの Rittergut は村落 1 つかその一部と直営地であることが多く、帝国騎士の直属領は近世には数 km² 以下まで小さくなる。これは後期の分裂の結果であり、盛期の初期値にはしない。ミニステリアーレス（unfree knights）は、ホーエンシュタウフェン期のドイツ領主の軍事的中核で、自由騎士より身分が低い。台帳では `tenure: "ministerialis"` の無名封として数え、自由騎士と混ぜて爵位を付けない。

北欧のフレス（frälse）は軍役と引き換えの免税身分で、封土ではない。Erik Ulsig が *The Cambridge History of Scandinavia* で整理するとおり、中世後期のデンマーク・スウェーデン・ノルウェーの貴族地はアロドである。ノルウェーは最も薄く、デンマークが最も大陸的である。

### 都市へ委任される者

都市の「所有者」と「運営者」は別である。

| 席 | 何を持つか | 任期 | 置く条件 |
| --- | --- | --- | --- |
| 都市領主（seigneur de la ville） | 裁判・関税・市場権。しばしば司教、伯、修道院、王 | 世襲または職禄 | 自治憲章が無い burg。土地はバンリュー 0–1 セル |
| プレヴォ、リーブ、Schultheiss | 領主の徴収人。職を請け負うことがある | 任免・請負 | NPC にはしない。首都と大都市の品質値だけ |
| バイイ、セネシャル、sheriff | 複数の下級徴収区を回る王または公の巡回官 | 任免。土地は持たない | 王領・公領の中だけ。北フランスは bailli、南フランスは sénéchal（Philippe Auguste がプレヴォ監督の巡察を定住させたもの） |
| 市長、執政官（consuls）、参事会員（Rat、échevins） | 都市団体の運営 | 選挙または領主の任命。任期 | 憲章都市。人口閾値は下表 |
| ポデスタ | 都市が雇う外来の執政官 | 半年〜1 年 | イタリア型のコムーネ |
| カピターノ・デル・ポポロ | ポポロ（非貴族市民）の軍事代表 | 短期 | イタリア型で人口が大きい都市に、ポデスタと併記し得る |
| 城伯 | 都市城の軍事Custody | 任免または世襲 | 共同体と城が併存するときだけ |
| 司教の世俗権（Hochstift） | 都市と周辺の世俗領 | 職。個人の世襲ではない | 司教座のある burg。教区全体は土地にしない |
| 帝国都市・自由都市 | 参事会が都市と小さなバンリューを保有 | 都市貴族の寡占 | 領主 NPC を置かない |
| イベリアのコンセホ | 都市がアルフォス（término）として複数村、複数セルを保有 | 後期は終身レヒドールの寡占 | レコンキスタ型。都市が農村セルの領主になる |

都市人口の目安（実数 = `population × populationRate × urbanization`）:

| 実人口 | 扱い |
| --- | --- |
| 1,000 未満 | 村。城があれば城代だけを検討。自治職は置かない |
| 1,000–5,000 | 市場町。憲章があれば市長またはシュルトハイスを 1 人 |
| 5,000–20,000 | 都市。参事会の長を 1 人。司教座なら司教を別席 |
| 20,000 以上 | 大都市。参事会の長に加え、城伯またはポデスタを併立できる |

プレヴォを全市に NPC 化しない。`docs/plan/char.md` が都市兵を不採用にしたのと同じ名簿制約である。

イタリアでは 12 世紀後半からコムーネが外来ポデスタを短任期で雇い、周辺農村（コンタード）を都市の管轄に入れた。13 世紀末以降、ヴィスコンティ家、エステ家のようなシニョリーアが都市の実権を世襲する。後期中世のイタリア共和制は、確率で「制度はコムーネ、実権は 1 家系」に傾ける。

南イタリアは別である。*Catalogus Baronum* はシチリア王国（半島側）の軍役台帳で、Roger II 期の 1150–51 年に始まり、William II 期の 1167–68 年に改訂された *Quaternus magne expeditionis* を核とする。ここはノルマンの封建伯・男爵の連続領地であり、北イタリアのコムーネではない。文化 base がイタリアでも、`form === "Monarchy"` なら南イタリア型、Republic / Free City / City-state ならコムーネ型にする。

### 教会領

司教の教区（精神的管轄）と、司教が諸侯として支配する世俗領（Hochstift）は一致しない。教区のほうが広い。ゲームの Theocracy 州や Parish ラベルを、そのまま司教の私領面積にしない。

世俗君主国では、セルの 10–30% を教会の世俗領として台帳に載せる。NPC にするのは司教座を持つ者だけで、修道院領は法人 Holding（`holderKind: "abbey"`）として無名のまま面積と封数だけ持つ。Theocracy では統治者自身が首座の聖職者なので、教会割合を別に抜かず、ミニステリアーレスと城代へ下封する。

### イベリア

コンセホは征服後の都市と、そのフエロが保証する農村管轄（アルフォス）である。アンダルシアでは都市評議会が防衛と入植の主体になり、のちに終身レヒドールと王権監督へ寄った（Rafael Sánchez Saus の概観）。貴族の連続領地と、都市が持つ広い農村が並ぶ。

騎士団（サンティアゴはレオンで 1170 年頃、カラトラバ、アルカンタラ）は辺境の城と所領を法人として保有する。団長 1 人を NPC にし、団領は複数セルの法人 Holding にする。家系の伯と混ぜない。

アデランタードは 13–15 世紀の辺境長官で、封土ではなく王の職である。後期中世のイベリア型で、辺境伯の代わりにこの職を使う。イダルゴは免税の身分で、セルを与えない。

### 北欧

オーダル（óðal）は一族の土地である。西ノルウェーの古グラティング法（12 世紀前半）では 5 代、フロスタティング法では 3 代の保有でオーダルになる、と後世の写本が伝える。売買には親族の先買が付く。フランス型の封土ピラミッドを北欧文化に敷かない。

ゲームでは、県に相当する Province へ sysselmann / fogde / länsherren を任免官吏（`landed: false`）として薄く置き、名指しの大土地所有者は国家あたり少数、土地の残りは「オーダル農民が保有」として NPC 無しにする。ヤールは国家あたり 0 または 1 の尊称とする。フレス騎兵は封数と同じくセル上の整数にする。

### ハンガリー

イシュトヴァーン 1 世の県（vármegye）は王の城県で、イスパーン（comes）は王吏である。高中世以降に城領地の寄進で大貴族（バロン）の世襲所領が太くなるが、県自体は行政区画として残る。辺境では bán（クロアチア、スラボニアなどの副王）が複数県を束ねる。辺境伯ではなく bán を、大国の辺境 Province 群に 1 人置く。

### 世紀による違い

| | 初期中世 | 盛期中世 | 後期中世 |
| --- | --- | --- | --- |
| 伯 | 任免される王吏。世襲は一部 | 世襲領土が卓越 | 官吏（バイイ、sheriff）が新設の世襲封より重要 |
| 城代 | 少ない | ローカル権力の単位 | 王領では城代が官吏化 |
| 騎士封 | 会計単位として未成立 | 台帳の基本 | イングランドは金納と請負契約（bastard feudalism）。新規の下封は Quia Emptores（1290）で止まる |
| 都市 | 司教・伯の都市 | コムーネと憲章が広がる | イタリアはシニョリーア。ドイツは帝国都市。イベリアは都市寡占 |
| ドイツ | 大公国 | 公国が伯領・司教領・辺境へ分解 | 飛地と帝国直属の小領主・都市 |
| フランス王領 | 小さい | 拡大中。バイイ創設 | 大きいがアパナージュが厚い |
| 相続 | 職の世襲化が始まる | フランスは分割が残る。イングランドは長子が強い | ドイツは分割が進行。イングランドは中間領主を新設しない |

## FMG での対応

既定縮尺の読み替え:

| 史料の単位 | 典型の広さのオーダー | 既定セル（約 1,500 km²）での扱い |
| --- | --- | --- |
| 騎士封 | 耕地評価で数十〜数百 ha。王国全体で数千件 | セルに整数 `knightFees`。NPC にしない |
| 荘園・村 | 数 km² | セルより細かい。表現しない |
| 城代管区 | 伯領の中の複数村落 | セルが 200–2,000 km² ならセル 1 つが城代。より大きいセルは「複数城代を含む」として城代 NPC を burg にだけ置く |
| 小伯領 | 1,000–8,000 km² | 1 から数セル |
| 大伯領・小公領 | 1 万–4 万 km² | 複数 Province または Province をまたぐセル塊 |
| イングランドの州 | 行政で数千 km² | Province は州のままで、Earl の所有地にしない |
| 王国 | 10 万 km² 級 | State 全体。統治者が最高封主 |

地域図で 1 セルが 50 km² を下回るときは、城代と旗手騎士の割当がセルへ降り、伯は複数セルから複数 Province へ上がる。閾値は km² で書き、セル数で書かない。

## 対象の判定

Nobility が有効でも、次をすべて満たす State だけが本割当に入る。

1. `historicalPeriod` が `earlyMedieval`、`highMedieval`、`lateMedieval`。
2. 文化の name base が対象表にあり、`formName` が非ヨーロッパ君主語彙（Khanate、Khaganate、Horde、Ulus、Beylik、Shogunate、Emirate、Caliphate、Satrapy、Tsardom、Despotate）ではない。
3. `form` が Anarchy ではない。Anarchy は現行どおり辺境の Warlord のみ。

name base は `src/generators/names-generator.ts` の `i` と一致させる。

| base | 名 | 体制キー |
| --- | --- | --- |
| 0 German | ドイツ型 `germanImmediate` | |
| 1 English | イングランド型 `englishHonour` | |
| 2 French | フランス型 `frenchTerritorial` | |
| 3 Italian | `form` が Republic、または formName が Free City / City-state なら `italianCommunal`。Monarchy なら `italianFeudal`。Theocracy なら司教領 | |
| 4 Castilian、13 Portuguese、20 Basque | イベリア型 `iberianConcejo` | |
| 6 Nordic、9 Finnic | 北欧型 `nordicOfficer` | |
| 8 Roman | フランス型。Theocracy なら司教領。ラテン語地名の文化を西欧封建へ寄せる対応であり、共和政ローマではない | |
| 15 Hungarian | ハンガリー型 `hungarianCounty` | |
| 22 Celtic | ケルト・スコットランド型 `gaelicProvincial`。アイルランド、ウェールズ、スコットランドを一つの手続きにする。Britain 地図の european セットで出る | |
| 5 Ruthenian、7 Greek、その他 | 対象外。現行の `assignProvinceLords()` | |

`form` による上書き:

- Theocracy かつヨーロッパ系: 体制は司教領モード。統治者は聖職者。下位はミニステリアーレスと城代。世俗の公を置かない。
- Republic / Free City / City-state: その文化がイタリアでなくても、領土伯の分割をしない。コンタード（首都 burg に隣接するセル）は都市団体の Holding。名指しはポデスタまたは執政と、少数の都市貴族の所領持分。大共和国（面積ティア 3 以上）は地方に任免の rector / captain を置く（`landed: false`）。
- Union / League / Confederation: 中央は評議会職のまま。各 Province を構成員とみなし、構成員の文化体制で小さい Holding を作る。連合そのものを 1 人の王領地にしない。ケルト（base 22）の Union はこの一般則を待たず `gaelicProvincial` にする。連合手続き自体は未実装である。
- ケルトの Republic、Free City、City-state は `urbanCommunal`。ケルトの Theocracy は司教領モード。どちらも未実装で、現行の辺境領主になる。Monarchy は `gaelicProvincial`。
- Monarchy の Marches: 国家自体が辺境命令を持つ。国内のさらに小さい辺境伯は、外部国境に接するときだけ置く。

## 台帳のモデル

領地は Province を置換しない。Nobility の拡張スライスに Holding を置く。セルの `province` は行政区のまま、軍事と国境分析は現行どおり Province を読む。

```ts
type Dignity =
  | "duke" | "landgrave" | "count" | "earl" | "viscount"
  | "baron" | "banneret" | "knight" | "jarl" | "magnate";

type Office =
  | "none" | "borderCommand" | "ban" | "sheriff" | "bailli" | "seneschal"
  | "castellan" | "burgrave" | "bishopTemporal" | "abbotTemporal"
  | "mayor" | "consuls" | "podesta" | "capitanoPopolo"
  | "adelantado" | "ispan" | "sysselman" | "orderMaster"
  | "mormaer" | "thane";

type Tenure =
  | "demesne" | "fief" | "allod" | "appanage"
  | "ecclesiastical" | "urbanJurisdiction" | "militaryOrder"
  | "ministerialis" | "odal" | "feeQuotaOnly"
  | "thanage" | "kinLand";

interface NobleHolding {
  id: number;
  stateId: number;
  dignity: Dignity | null;
  office: Office;
  tenure: Tenure;
  /** 連続塊。イングランド型の非連続名誉では空でもよい。 */
  cellIds: number[];
  /** 非連続または部分保有。1 万 = そのセルの世俗権の 100%。 */
  shares?: { cellId: number; basisPoints: number }[];
  provinceIds: number[];
  burgIds: number[];
  knightFees: number;
  holderKind: "character" | "crown" | "commune" | "abbey" | "order" | "odal" | "kindred";
  holderCharacterId?: number;
  /** 辺境職・巡回官など、土地と別に表示する称号。 */
  officeTitle?: string;
  hereditary: boolean;
  frontier: boolean;
  /** 「Earl of X」の X。人物ダイアログは台帳を読まず、称号の seatName を使う。 */
  seatName?: string;
  /** 座所 burg。町が無いときは 0。 */
  seatBurgId?: number;
}
```

`TitleHolding` は表示用に残す。複数セルの領主は `entityType` を拡張して `"holding"` を足し、`entityId` を Holding id にする。単一 Province 全体と一致するときも Holding を正とし、Province 称号の二重管理をしない。都市職は既存の `"burg"` を使い、`landed` は都市団体の土地を持たない任期職では false、バンリューを持つ都市領主では true。

爵位・職務・保有は別フィールドなので、同じ人物が「伯（dignity）かつ辺境命令（office）かつ封土（tenure）」を持てる。内陸の伯は office が `none` である。

### 騎士封の数

イングランド較正: 約 13 万 km² に対し Keefe の約 7,500 封、すなわち総土地おおむね 17 km² あたり 1 封。これを既定の粗密にする。山地と未墾地が封を生まないよう、人口で頭打ちにする。

```
grossFees = holdingLandKm2 / 17
people    = ruralPeople + urbanPeople   // 値 × populationRate
peopleCap = people / 400
knightFees = clamp(round(min(grossFees, peopleCap)), 0, grossFees)
```

400 人に 1 封は、1086 年頃の人口規模と 12 世紀の封数を同じ年に置いた商ではない。王国サイズで封数が数千に収まり、無人セルが 0 になるためのゲーム定数である。フランスのオーベール封はこれより細かくし得るが、NPC を増やさないため同じ定数から始め、体制係数 `feeDensity`（北欧 0.25、ドイツ 0.7、フランス 1、イングランド 1、イベリア辺境 0.5、ケルト 0.35）を掛ける。保存する整数は `round(min(grossFees * feeDensity, peopleCap))` を `floor(grossFees * feeDensity)` で頭打ちし、0 以下は 0 にする。面積・人口・係数のいずれかが正でなければ 0 である。

封数は動員の上限ヒントとして Holding に保存する。名指し騎士は次だけである。

- 統治者の家政騎士: 国家の km² に応じ 3–12 人。土地は直轄の封数から支払い、セルを与えない。
- 旗手騎士: burg または城塞セルを持ち、封数 5 以上の Holding の保有者。それ未満は男爵または無名封。

## 分割手続き

共通の前処理:

1. 国家の陸上セルを集め、`getArea(cells.area[id])` で km² を得る。面積単位オプションが平方でない場合も、内部計算は km² に戻してから帯と比較する。
2. 首都セルと、首都から連続する直轄割合を `crown` Holding にする。イングランド型は割合の半分だけを首都塊にし、残りを各塊から 1 セルずつ抜いて散在直轄にする。
3. 司教座 burg（大都市、または Theocracy の首都）に教会 Holding を切り、周辺セルを目標割合まで成長させる。教区ラベルの州全部は渡さない。
4. 残りのセルに体制別の手続きを適用する。
5. 辺境接触セルを含む Holding にだけ `borderCommand` を付与する。既存の `analyzeFrontiers()` と `getProvinceThreats()` を使い、新しい国境判定を作らない。
6. 都市席を burg 人口で付与する。
7. 封数を計算する。
8. NPC 化規則で Character を作る。

成長の乱数は Nobility のシミュレーション乱数流を使う。同じ世界種と state id から同じ Holding が再構築できるように、入力が Holding 未生成のセーブでも初回だけ生成してスライスへ保存する。

### フランス型

連続分割。残地を目標 3,000–15,000 km² の塊へ領域成長する。種は人口最大の未使用 burg。塊が 15,000 km² を超える地形の障壁（山、海）で割れないときは公または大伯 1 人にまとめる。初期中世は目標を 1,000–4,000 km² に下げて城代を厚くし、伯はそれらの上に複数塊を束ねる任免職（`hereditary: false`）として少数だけ置く。盛期は城代の塊を世襲伯領に統合する。後期は直轄割合を上げ、直轄内の城代とバイイを官吏にし、王家の弟の数だけ最大塊を `tenure: "appanage"` にする。アパナージュは男系が尽きたら直轄へ戻す規則を台帳に書く（死亡処理そのものは後続）。

南フランス文化を name base だけでは分けられない。同じフランス型を使い、初期に `tenure: "allod"` の割合を 30% まで上げることで、Duby がマコネで強調したアロドの残存を表す。

### ドイツ型

初期は公の目標帯（15,000 km² 以上）で少数の大 Holding を作る。盛期はそれらを伯・司教・辺境の帯へ割る。後期は相続分割を初期配置に織り込み、同一家系ではなく隣り合う小 Holding（1 セル、または burg のみの帝国都市）を多くする。帝国都市は人口 5,000 以上の非首都 burg のうち後期には約半数を `holderKind: "commune"` にし、都市領主を置かない。ミニステリアーレス封は自由伯の `knightFees` の一部としてタグだけ分け、NPC にしない。辺境伯は外部国境の塊に限る。

### イングランド型

Province は shire の行政単位として残す。各 Province に sheriff を 1 人、`landed: false` で置く。ただし Province が 8,000 km² を大きく超えるときは、面積 4,000 km² あたり 1 人まで増やし、担当セルを分ける。Earl と baron の honour は連続塗りにしない。残地の封数を、大きい honour（封 40–80）数個と小さい honour（封 10–20）に分配し、各 honour の持分を複数 Province のセルへ散らす。1 セルの世俗権は直轄・教会・複数 honour の basis points の和が 10,000 になる。地図の色は Province のままにし、Honour は人物画面と将来のオーバーレイで見る。

Quia Emptores に合わせ、後期中世は honour の下に新しい中間 Holding を作らない。城代は honour 保有者の官吏（`hereditary: false`）として大 burg にだけ置く。

海または敵対国に接する honour のうち 1 つを marcher とし、イングランド文化の辺境職にする。称号は Margrave にしない。

### イタリア・コムーネ型

首都と大 burg の隣接セルを都市団体のコンタードにする。丘陵や山で都市から離れたセルにだけ農村貴族（封数の小さい連続 Holding）を置く。各憲章都市にポデスタ 1 人。後期中世は国家あたり 1 都市をシニョリーアにし、そのポデスタ席を世襲都市領主へ置き換える。

### イタリア・封建型

フランス型の連続分割を使い、目標を 1,000–8,000 km² とする。*Catalogus Baronum* 型に、伯の下の男爵 Holding を封数で持つ。男爵は burg があるものだけ NPC。

### イベリア型

直轄と教会を抜いたあと、人口上位の burg にアルフォスを成長させる。1 都市の目標は 1,000–6,000 km² で、セルが巨大なときは 1 セルでも都市管轄にする。残地を大貴族の連続領とする。外部国境側の残地は騎士団法人を優先し、団長 1 人を置く。後期は辺境にアデランタード 1 人を官吏として重ねる。イダルゴは生成しない。

### 北欧型

Province ごとに官吏 1 人（土地なし）。追加の大土地所有者は国家面積 20,000 km² あたり 1 人まで、各人の保有は連続 500–3,000 km² のアロド。残りは `holderKind: "odal"` で NPC 無し。ヤールは面積ティアが Kingdom 以上のとき 1 人。フレス騎兵数は `knightFees` に書き、`tenure` は `"odal"` のままとする。

### ハンガリー型

Province を県とみなし、イスパーンを官吏として 1 人。マグナートの連続所領を県の内外に、フランス型より少ない数（土地 10,000 km² あたり 1 人程度）で置く。辺境県が 2 つ以上まとまって外部国境に触れるとき、その群に bán を 1 人置く。bán は県のイスパーンの上位職で、県の土地をすべて私領にはしない。

### ケルト・スコットランド型

name base 22（Celtic）はアイルランド、ウェールズ、スコットランドを一つの手続き `gaelicProvincial` で割る。Britain 地図の european 文化セットはこの base を出す。手続きの形はスコットランドの州統治から取る。初期中世の mormaer は州の世襲族長で、thane は王領地（thanage）を預かる王吏だった。盛期以降、mormaer の称号は Earl へ置き換わり、thane の職は世襲化する（Barrow, *Kingship and Unity: Scotland 1000–1306*; Grant, "Thanes and Thanages, from the Eleventh to the Fourteenth Centuries"）。女性の mormaer と thane に別の英語は作らない。盛期・後期の dignity `count` の表示は Earl / Countess である。

この手続きだけが、台帳と NPC を作る。他の体制キーは判定だけを返し、現行の辺境領主のままである。

| 項目 | 初期 | 盛期 | 後期 |
| --- | --- | --- | --- |
| mormaer / Earl | 人口 6 万人あたり 1。人口 4,000 未満、または州が無いときは 0。最低 1、上限は州数。`floor` | 同左 | 同左。首都州から陸上で届かない州には、定員の外で 1 人 |
| 私領 | 州面積の 20% | 25% | 25% |
| 私領のセル数 | 州が 2 セル以上なら `min(n-1, max(1, round(n × 割合)))`。州全体は取らない | 同左 | 同左 |
| thane | `floor(人口 / 12000)`。自由な burg まで | `floor(人口 / 24000)` | `floor(人口 / 60000)`。分離州には置かない |
| thanage | 800 km² を目標、1,500 を上限。開始セルがすでに 1,500 以上、または面積が 0 以下ならその 1 セル | 同左 | 同左 |
| thane の世襲 | しない | する | する |
| 男爵 | 0 | `floor(非高地の自由セルの人口 / 20000)` | 同左。分離州には置かない |
| 男爵の面積 | — | 400–4,000 km²。種は burg | 同左 |
| sheriff | 0 | 州ごと 1。州が 8,000 km² を超えるときは `max(1, round(面積 / 4000))`。土地なし、封数 0 | 同左 |
| 直轄 | 首都セルのみ | 国土の 10% | 15% |
| 教会 | なし | 非高地の 15%。首都以外で都市人口が最大の burg から | 同左 |
| キンランド | 直轄・私領・thanage の残り | 高地の保留と、男爵に育たなかった残り | 同左 |
| `feeDensity` | 0.35 | 0.35 | 0.35 |

手順は乱数を使わない。隣接セルは標高の昇順、同高なら id の昇順に見る。

1. 高地。初期は無し。盛期・後期は、セルが 4 未満、または最高と最低の標高差が 15 未満なら無し。それ以外は、burg の無いセルのうち標高が 60 パーセンタイル以上を候補にする。候補がセル数の 15% 未満なら無し。45% を超えるときは、標高の高い順（同高は id の降順）に `round(0.4 × セル数)` だけ残す。平らな地図に高地を作らない。
2. 後期の分離州。首都セルから、国家内の陸上隣接を BFS する。届かない州が分離州である。州が 1 つだけの島国は中核であり、分離州ではない。男爵と thane を残す。
3. 直轄。`holderKind: "crown"`、`tenure: "demesne"`。NPC は作らない。少なくとも首都セル。割合が 0 の初期は首都セルだけである。
4. 教会。初期は無し。盛期以降は、非高地の面積の 15% を、首都以外で都市人口が最大の自由な非高地 burg から成長させる。`holderKind: "abbey"`、`office: "abbotTemporal"`、`tenure: "ecclesiastical"`。司教 NPC は作らない。
5. mormaer / Earl。州を人口の降順、同点は id の昇順に歩き、定員まで置く。後期はそのあと分離州を足す。座所セルが空いていればそこから。王が座所を取っているときは、州内で最も近い空きセルから始め、高地以外を優先する。初期は dignity 無し、office `mormaer`、tenure `kinLand`、世襲。盛期・後期は dignity `count`、office `none`、tenure `fief`、世襲。`getProvinceThreats()` が脅威とした州のこの Holding だけ `frontier: true` にする。Margrave と `borderCommand` は使わない。
6. 町の Holding。自由で非高地、かつ首都セル以外の burg。後期は分離州の burg を除く。都市人口の降順。男爵の席数を先に確保し、残った町数を thane の上限とする。割当は人口の多い町から thane、その次を男爵とする。同じ州の中だけで伸ばし、高地には開始セル以外を入れない。thane は office `thane`、tenure `thanage`。男爵は dignity `baron`、tenure `fief`、世襲。
7. 残りを州ごとに `holderKind: "kindred"`、`tenure: "kinLand"`。NPC は作らない。高地の保留もここへ入る。
8. sheriff。盛期以降。`landed: false`、`cellIds` は空、`tenure: "feeQuotaOnly"`、`office: "sheriff"`、封数 0。空の `cellIds` でも `provinceIds` に州 id を持つ。同じ巨大州の複数 sheriff は同じ州名を使う。
9. 封数。sheriff 以外に `knightFeesFor` を書く。

人口は農村 `cells.pop × populationRate` と都市 `burg.population × populationRate × urbanization` の和で、二重に数えない。面積は `cells.area × distanceScale²`。標高 20 未満の水域は入れない。面積が 0 以下のセルは開始セルだけを持ち、伸ばさない。

NPC は `holderKind: "character"` だけである。mormaer、Earl、thane、男爵は `roleClass: "province_lord"`、主技能 martial。世襲席は統治者の年齢、初期の thane は官吏の年齢。sheriff は `roleClass: "central_officer"`、主技能 stewardship、官吏の年齢。生活水準は一般のままにし、俸給には接続しない。称号の `entityType` は `"holding"` で、`seatName` に地名を持つ。Province の領主としては作らない。`shouldGenerateSparseRole()` は掛けない。

台帳は `simulation.extensions.nobility.holdings` と、国家ごとの `gaelicPeriodByState` に置く。スライスが無いときは何も作らず、辺境領主にも落とさない。保存した時代とセル集合が一致するときは土地を動かさず、死亡と欠員だけ同称号の新人物で埋める。時代が変わったとき、またはセル集合が変わったとき（征服）は、その国家の Holding 称号を `endYear` と理由 `Holding redistributed` で `pastTitles` へ移し、台帳を作り直す。消えた国家の Holding は `assignProvinceLords()` の先頭で外す。国家削除の参照は restrict にしない。孤児として残し、後で落とす。

セーブ検証は、範囲外の cell id、持分の basis points がセルごとに 10,000 を超えること、持分を使わない Holding 同士の cell id の重複を拒否する。国家が無いことと、体制が一致しないことは拒否しない。セル数が 0 のときは範囲検査を省く。

新規割当のとき、開発ログに 1 行出す。state id、Holding 数、封数の合計、mormaer / Earl、thane、男爵、sheriff の数である。

### 司教領モード

統治者が首座の世俗領主である。直轄は首都と隣接セル。残りを城代とミニステリアーレス封へ。世俗の公・伯の dignity は使わず、城代の dignity は knight または banneret、tenure は `ministerialis` または `fief`。複数の司教座があるときは 2 人目以降を副司教 Holding とし、統治者と別に NPC 化する。

## NPC を置く席

Holding レコードは上記の手続きで全部作る。Character は次の席だけに作る。

| 席 | 上限の目安 |
| --- | --- |
| 統治者、既存の中央 5 官職 | 現行どおり |
| 公、大伯、アパナージュ、bán、ヤール | 国家の塊のうち目標帯を満たすもの。小国は 0 |
| 伯、辺境伯、ランドグレーフ、イスパーン、sheriff、バイイ | 行政官は担当区ごと 1。世襲伯は Holding ごと 1 |
| 司教（世俗領または司教座） | 司教座 burg の数 |
| 騎士団長 | 体制あたり 1 |
| 城代・城伯 | 人口上位の城塞 burg。国家あたり最大 8 |
| 都市の長（市長、執政、ポデスタ） | 実人口 1,000 以上の burg のうち、憲章を持つもの。共和制は全対象 burg、君主制は人口上位を国家あたり最大 6 |
| 家政騎士 | 3–12。セルを持たない |
| 旗手騎士 | 封 5 以上かつ burg を持つ Holding の保有者。上の伯と重複するなら新規に増やさない |

~~君主制の名指し土地貴族の軟上限 `clamp(round(国土 km² / 8000), 4, 36)`~~ は撤回する（R3）。席数は「レビュー」節の必要席数表から導き、上限で間引かない。長命種族の mono 国家に `shouldGenerateSparseRole()` を掛けるかは別途決める。

都市任期職と官吏は軟上限の外で数える。土地を持たないからである。

現行の `assignProvinceLords()` は、本割当の対象国家では呼ばない。対象外国家では現行の辺境 1 人を維持する。

## 称号の言語

表示名は `titleTable.ts` に体制と性別の列を足す。州の `formName` からの流用を、対象国家ではやめる。

| 内部 | フランス語文化の例 | ドイツ語文化の例 | 英語文化の例 |
| --- | --- | --- | --- |
| duke | Duke / Duchess | Duke / Duchess | Duke / Duchess |
| landgrave | —（使わない） | Landgrave / Landgravine | — |
| count | Count / Countess | Count / Countess | Earl / Countess |
| borderCommand | Margrave / Margravine | Margrave / Margravine | Lord Marcher / Lady Marcher |
| viscount | Viscount / Viscountess | — | 後期に稀な尊称のみ |
| baron | Baron / Baroness | Baron / Baroness | Baron / Baroness |
| banneret | Banneret | Ritter | Knight Banneret |
| knight | Knight | Ritter | Knight |
| bailli | Bailli | — | — |
| seneschal | Seneschal | — | — |
| sheriff | — | — | Sheriff |
| mormaer | — | — | Mormaer（男女同じ語。初期のケルト） |
| thane | — | — | Thane（男女同じ語。ケルトの thanage） |
| burgrave | Châtelain | Burgrave | Constable of the castle |
| podesta | Podestà | — | — |
| ispan | — | — | Ispán（ハンガリー文化） |
| ban | — | — | Ban |
| sysselman | — | — | Sysselman |

英語の Earl とフランスの Count は同じ dignity `count` の表示差である。Margrave は dignity ではなく office `borderCommand` の表示である。

## 既存システムとの接続

- 生成タイミングは現行の Nobility 初期化（Economy の後、`fmg:generate-post-core`）と、Characters 再生成と同じ箇所。`assignProvinceLords()` の直前で体制判定し、対象なら Holding 生成へ分岐する。
- 死亡による空席は、世襲 Holding なら後継を既存の継承処理へ接続するまで「空席のまま次の補充で同 dignity の新人物」とする。官吏とポデスタは空席を次ティックで埋め、土地は動かさない。継承の本実装は後続 PR と明記する。
- 動員（`Mobilization.conscript`）は初回 PR では封数を読まない。封数は台帳にあり、兵数式の変更は別 PR にする。兵数が爵位で突然変わると、既存の戦力テストの基準が崩れる。
- 戦略 AI の `getProvinceThreats()` は Province 単位のまま。辺境伯 NPC の有無で脅威計算を変えない。
- セーブは `simulation.extensions.nobility` のスライス検証（`src/runtime/extensionStateSlices.ts`）に Holding 配列を足す。未知の古いセーブは空配列として読み、Nobility 初期化時に一度だけ埋める。

## データモデルの変更箇所

- 新規: `src/extensions/nobility/holdings/regime.ts`（判定）、`types.ts`（台帳）、`titles.ts`（ケルトの表示名）、`allocateGaelic.ts`（スコットランド型）、`assignGaelicHoldings.ts`（世界からの読み取りと NPC）。他体制の `allocateHoldings.ts` は未作成。
- 変更: `characterTypes.ts` の `entityType` に `"holding"` と `seatName`。`provinceLordGenerator.ts` はケルトを台帳へ分岐し、対象外は辺境領主のまま。`extensionStateSlices.ts` に検証。`characterLifecycle.ts` に `createHoldingNoble`。称号表示、生活水準、名声、軍歴、異名は土地を持つ Holding を州領主と同じ段にする。sheriff は中央官職の段で、生活水準は一般のまま。
- Province の `formName` は、対象国家の内陸 Margrave を County へ直す一点だけ書く。他のフレーバー名（Barony と County の抽選）は行政ラベルとして残す。領主の爵位はラベルと一致しなくてよい。イングランドの shire に Earl が住んでいない、という史料側の関係を保つためである。

## インターフェースの要点

```ts
function regimeFor(state: State, cultureBase: number, period: HistoricalPeriod): FeudalRegime | null;

function allocateEuropeanHoldings(state: State, regime: FeudalRegime): NobleHolding[];

function materializeHoldingCharacters(state: State, holdings: NobleHolding[]): void;
```

`regimeFor` が `null` のときは現行の辺境領主のみ。呼び出し側は Nobility の `simulation.ts` と初期化タスクの、現行 `assignProvinceLords()` と同じ 3 地点（生成後、再生成、有効化）に置く。

## 代替案

### A. Province を 1 爵位として全員に領主を置く

州ラベルがすでに County や Barony なので、各州に 1 人置ければ実装は小さい。却下する。ラベルは面積も辺境も見ていない。既定縮尺では 1 州が大伯領〜公領になり、男爵や騎士の土地としては広すぎる。内陸を含む全州 NPC は、`char.md` が避けた名簿増をそのまま再現する。

### B. セル 1 つを騎士または男爵の土地として塗る

地図が塗り分けやすく、複数セルの支配も「何セル持つか」で表現できる。却下する。既定で 1 セルは約 1,500 km² あり、騎士封の数百倍である。地域図では逆に 1 セルが荘園になり、同じセル数規則が両方では成立しない。イングランドの名誉は連続セルではない。

### C. 本設計（台帳は km² と体制手続き、NPC は席だけ）

地図縮尺が変わっても爵位の意味が残る。名簿は軟上限で現在の方針を維持できる。欠点は、Holding と Province が一致せず、地図の色だけでは領主が読めないことである。人物画面と、後続のオーバーレイで補う。

## リスク

| 重大度 | 内容 | 緩和 |
| --- | --- | --- |
| 高 | NPC が増え、人物画面と月次処理が重くなる | 軟上限、封は数値、都市は人口閾値 |
| 高 | 非連続のイングランド領がプレイヤーに読めない | 初期実装は台帳と人物の肩書まで。地図オーバーレイは独立 PR。フランス型を先に出し、見た目の確認を分ける |
| 中 | 内陸 Margrave ラベルの書き換えが既存セーブの州名を変える | 新規生成と、Holding を初めて作るときだけ。ロックされた州は変えない |
| 中 | 封数をすぐに兵数へ接続すると戦力平衡が変わる | 台帳のみ先行し、動員接続を別 PR にする |
| 中 | 文化 base の対応表がファンタジー文化で誤爆する | 表に無い base は対象外。ヨーロッパ語彙の formName だけでは有効化しない |
| 低 | 再生成で人物 id がずれ、Holding の `holderCharacterId` が孤立する | 再生成時は Holding と対象 Character を同じ手続きで作り直す |

## セキュリティとプライバシー

プレイヤーの個人情報は扱わない。セーブに増えるのは生成された人物と領地台帳だけである。不正なセーブ（範囲外の cell id、basis points の和が 10,000 を超えるセル、持分を使わない Holding 同士のセル重複）はスライス検証で拒否する。国家が消えていること、または体制キーと一致しないことは拒否しない。ケルト国家は統治者参照を外したあと削除できる。

## 観測

開発時ログに、国家ごとの体制キー、Holding 数、NPC 化した席の内訳、封数合計を 1 行出す。既定の England 規模（約 13 万 km²）で封数がおおむね 3,000–10,000 に入ること、名指し土地貴族が軟上限以内であることをテストで固定する。プレイヤー向け UI の計測は、オーバーレイ PR まで足さない。

## ロールアウト

Nobility 拡張がオフのときは何も生成しない。オンでも体制が `null` なら現行挙動のまま。対象国家だけ新経路に入る。フラグをオプションに増やさず、Historical period と文化と form の判定をゲートにする。問題があれば判定表から base を外すことで、その文化だけ現行の辺境領主へ戻せる。

古いセーブは Holding 無しとして読み、Nobility の初期化が空なら一度生成する。すでに辺境領主がいる対象国家では、既存の Province 領主を消さずに、内陸と都市の不足分だけ足す。二重の辺境伯を避けるため、辺境 Province に生存領主がいるときは、その Province を覆う Holding の保有者をその人物へ接続する。

## Key Decisions

1. **領地は Province の塗り替えではなくオーバーレイにする。** Province は軍事プール、脅威、名称、編集 UI がすでに依存している。封土は非連続であり、行政区画と一致しない。
2. **階級、職務、保有形態を分ける。** 辺境伯は辺境職務であり、伯と同じ面積帯に広い軍政権を載せる。内陸の Margrave ラベルは職務と矛盾するので直す。
3. **割当の単位は km² である。** 既定セルは約 1,500 km² で、城代管区の束に当たる。地域図でセルが小さければ同じ爵位がより多くのセルを持つ。
4. **ヨーロッパ中世の 1 つのピラミッドを全君主国に敷かない。** 文化 base と form と世紀で 9 の領土手続きに分ける。司教領は手続きではなくモードである。対象外は現行の辺境領主のまま。
5. **ケルト（base 22）はスコットランドの州手続きをアイルランドとウェールズにも使う。** 初期は mormaer と任期の thane、盛期以降は Earl と世襲 thane と男爵である。辺境は `frontier` フラグだけで、Margrave にはしない。2026-10-17 に R4 をこの案で閉じ、台帳と NPC まで先に実装した。
6. **騎士封は数値、旗手騎士と家政騎士だけが人物になる。** 1166 年頃のイングランドで数千封あり、全員を NPC にすると名簿が史料の縮尺を超えて膨らむ。
7. **Baronet は中世の対象外である。** 1611 年の世襲尊称であり、中世の上級騎士は banneret である。
8. **都市の所有者と運営者を分ける。** 憲章都市には任期の市政職を、城が併存するときだけ城伯を、司教座には教区全体ではなく世俗領を与える。
9. **イングランドは州を伯の所有地にしない。** sheriff が州を運営し、Earl と baron は散在する honour の持分を持つ。
10. **封数は台帳に保存し、兵数式にはまだ接続しない。** 戦力平衡の変更をこの設計の必須部分から外す。
11. ~~名指し土地貴族には軟上限を置く。~~ 撤回。必要な席を全部作る（R3）。代わりに人物の索引化を前提条件にする（R8）。

## Open Questions

1. 解決: 軟上限は置かない（2026-10-17 ユーザー判断）。残る論点は騎士個人を NPC にするか（R3 の表の最下行）。
2. 内陸州の `formName` Margrave を County に書き換えてよいか。地図ラベルを安定させたい場合は、ラベルを残して職務称号だけ正しくすることもできる。
3. ルース人とギリシア文化を、この PR 列の対象外のままでよいか。ボヤールとプロノイアは別設計になる。
4. イングランド型の非連続名誉を初回から実装するか。連続のフランス型だけを先に見えるようにするか。
5. 後期中世のイタリア共和制を、どの確率でシニョリーア（世襲都市領主）へ傾けるか。既定案は 0.5。

## PR Plan

### PR 0. 実地図の距離スケール補正（実装済 2026-10-17）

R1 の修正。`getTemplateDistanceScale()`（`src/data/earthRegions.ts`）が実地図テンプレートの `distanceScale` に cos(bbox 中央緯度) を掛ける。`defineMapSize()`、World Configurator、Units Editor の復元の 4 箇所が使う。ランダム地図は従来どおり赤道スケール。

### PR 1. 体制判定と面積

- タイトル: Add European feudal regime classifier
- ファイル: `src/extensions/nobility/holdings/regime.ts`, `area.ts`, テスト。`historicalPeriod.ts` と name base の番号は既存を参照するだけ。
- 依存: なし
- 内容: `regimeFor` と km² 変換。生成結果は変えない。判定表のテストを、各 form と対象外の Khanate について書く。

### PR 2. フランス型の Holding 台帳

- タイトル: Allocate contiguous French holdings without characters
- ファイル: `allocateHoldings.ts`, フランス手続き、スライス検証、Nobility 初期化からの呼び出し（キャラクターは作らない）。
- 依存: PR 1
- 内容: 直轄、教会、連続伯領、辺境職務、封数。セーブ往復。人物名簿は現行のまま。

### PR 3a. ケルト・スコットランド型（実装済 2026-10-17）

フランス型より先に実装した。Britain 地図の european セットが base 22 を出すためである。

- タイトル: Allocate Gaelic provincial holdings and their named seats
- ファイル: `src/extensions/nobility/holdings/`（`regime.ts`, `types.ts`, `titles.ts`, `allocateGaelic.ts`, `assignGaelicHoldings.ts`）、`provinceLordGenerator.ts`, `characterLifecycle.ts`, `characterTypes.ts`, 表示と社会的順位、`extensionStateSlices.ts`, 称号の i18n。
- 依存: PR 0。体制判定はケルト実装に同梱し、他文化の割当はまだ呼ばない。
- 内容: 判定表の全キー、スコットランド型の台帳、mormaer / Earl / thane / 男爵 / sheriff の NPC、空席の補充、セーブ検証。俸給、司教 NPC、家政騎士、旗手騎士、地図オーバーレイ、タニストリー、疎な間引きは含めない。

### PR 3. 残りの体制

- タイトル: Add German, English, Italian, Iberian, Nordic, and Hungarian holding patterns
- ファイル: 体制別手続きとテスト。
- 依存: PR 2
- 内容: 非連続 honour、コンタード、アルフォス、騎士団、官吏県。まだ NPC は増やさない。

### PR 4. 土地貴族の NPC 化

- タイトル: Materialize capped landed nobles from holdings
- ファイル: `materializeNobles.ts`, `characterTypes.ts`, `titleTable.ts`, `provinceLordGenerator.ts`, `characterLifecycle.ts`
- 依存: PR 3
- 内容: 軟上限つきで人物を作る。対象国家では辺境だけの領主生成を止め、既存の辺境領主とは接続する。内陸 Margrave ラベルの修正を、Open Question 2 の決定に従って含めるか外す。

### PR 5. 都市への委任

- タイトル: Appoint urban magistrates, burgraves, and bishops
- ファイル: 都市席の割当、burg 称号、人物生成。
- 依存: PR 4
- 内容: 人口閾値、ポデスタ、城伯の併立、司教の世俗領。プレヴォは NPC にしない。

### PR 6. 継承の最小実装

- タイトル: Fill vacant hereditary holdings and term offices
- ファイル: Nobility の死亡処理の隣。
- 依存: PR 4、PR 5
- 内容: 世襲空席を 1 人補充する。アパナージュの返還とドイツ型の分割相続は、この PR ではやらず別設計にする。官吏とポデスタの任期補充だけ行う。

### PR 7. 表示

- タイトル: Show holding names on character titles
- ファイル: 称号の表示名解決（`getTitleEntityName` 相当）と人物詳細。
- 依存: PR 4
- 内容: `entityType === "holding"` で「Count of X」が Unknown にならないようにする。地図オーバーレイは含めない。

### PR 8. 動員への封数（任意）

- タイトル: Let knight-fee quotas inform mobilization
- ファイル: `mobilization.ts` と戦力テスト。
- 依存: PR 3。NPC PR には依存しない。
- 内容: 封数を兵数の上限ヒントにする。平衡を別に検証する。本設計の完了条件には含めない。

## 検証

UI の見た目は PR 7 まで地図上ではほぼ変わらない。PR 4 以降は人物一覧で確認する。ブラウザ確認が必要になるのは、称号ダイアログと、Margrave ラベルを書き換える場合の州ラベルである。それ以前の PR はユニットテストで、体制判定、面積帯、封数の較正（13 万 km² で数千封）、必要席数、対象外国家が現行経路のままであることを固定する。

## レビュー（2026-10-17）

### 実測の方法

ヘッドレス Chromium で地図を生成し、国家ごとのセル数・面積・burg 数・Province 数・農村/都市人口・burg 人口帯を集計した（`npm run fmg:small` と同じ起動手順の使い捨てスクリプト）。共通設定は Historical period `highMedieval`、Settlement pattern `standard`、Initial population % 既定 60。

| 条件 | 枚数 | 内容 |
| --- | --- | --- |
| Britain、european、points 4 | seed 101–105 | 既定の州数（13–28 国家） |
| Britain、european、points 8 | seed 101–103 | セル密度 2 倍 |
| Britain、english、statesNumber 3、points 4 | seed 201–204 | イングランド規模の 1 国家を作る |
| 同上、points 8 | seed 201–203 | |
| 同上、points 8、manors 2000 | seed 201–202 | burg 数を手動で増やす |
| 同上、points 4、Initial population 90% | seed 201–202 | 人口の感度 |
| Europe、european、points 4 | seed 101–105 | |

下表の「真の km²」は R1 の補正後（`getArea()` × cos²(中央緯度)）。

| 地図 | 真の陸地 | 陸セル平均（真） | burg 総数 | burg のある人口セル比 | 人口密度（国家中央値） | burg 1 つあたり | Province 1 つあたり | 都市人口比 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Britain p4 | 33.4 万 km² | 108 km² | 379–604 | 0.20–0.21 | 19 人/km² | 535 km² | 2,100 km² | 10.6% |
| Britain p8 | 33.2 万 km² | 55 km² | 656–698 | 0.12 | 29 人/km² | 370 km² | 1,300 km² | 10.4% |
| Britain p8 + manors 2000 | 33.2 万 km² | 55 km² | 2,003 | 0.35–0.41 | — | — | — | — |
| Europe p4 | 978 万 km² | 1,480 km² | 706–1,014 | 0.20–0.21 | 2.4 人/km² | 5,100 km² | 18,500 km² | 10.7% |

イングランド規模の国家（english、statesNumber 3 の最大国家）:

| seed / points | 真の面積 | burg | Province | 農村 / 都市人口 | 最大 burg | 5,000–2 万 | 2 万以上 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 201 / p4 | 12.2 万 km² | 174 | 49 | 250 万 / 26 万 | 20,270 | 8 | 1 |
| 203 / p4 | 13.7 万 km² | 186 | 49 | 272 万 / 24 万 | 9,364 | 6 | 0 |
| 201 / p8 | 12.6 万 km² | 279 | 81 | 385 万 / 37 万 | 11,226 | 12 | 0 |
| 203 / p8 | 16.3 万 km² | 270 | 77 | 368 万 / 32 万 | 18,354 | 8 | 0 |
| 201 / p4 / 人口 90% | 12.2 万 km² | 174 | 49 | 250 万 / 40 万 | 30,414 | 15 | 1 |

史料側の目安（概数）: イングランド約 13 万 km²、人口 1086 年約 200 万・1300 年約 450–600 万、Domesday の borough 約 110、1300 年頃の borough 約 500–600、1349 年までの市場特許約 2,000、州 39、司教区 17、ロンドン 1300 年頃 7–8 万人。

読み取り:

- Britain 地図は人口密度 19–29 人/km²、都市人口比 10% で、1086–1300 年のイングランドの幅に入る。Province 数 49–81 は州 39 と同じオーダーで、Province ≒ shire の読み替えが成り立つ。寒さによる人口不足は無く、Initial population % を変える必要は無い（この値は burg 人口だけを動かし、農村人口は変わらない）。
- 不足は最大都市だけである。ロンドン級（7 万）は出ず、人口 90% でも 3 万。首都の大都市席（城伯・ポデスタ併立）は 2 万人閾値をほぼ超えない。閾値を実人口ではなく国家内の順位でも満たせるようにする。
- burg 数は Domesday と 1300 年の borough の間（174–279）。市場町・荘園の数には届かないが、それは台帳の数値で持つ。
- Europe 地図は人口密度が 2.4 人/km² で、史料（西欧 20–40 人/km²）の 1/10 である。R2 を参照。
- 州の数を既定（gauss(18,5)）に任せた Britain 地図では、最大国家でも真の 4.7–9.6 万 km² で、イングランド規模にならない。イングランド型を検証するときは statesNumber を 3 前後に固定する。

### 所見

| ID | 重大度 | 内容 | 推奨 |
| --- | --- | --- | --- |
| R1 | 高 | 実地図ハイトマップで `getArea()` が真の面積の 1/cos²(中央緯度) 倍になる。`defineMapSize()`（`src/main.ts`）は `climateAnchor.mapSize`（経度幅 / 360）から `getEarthDistanceScale()` を赤道の km で計算するが、グラフの縦横比は `earthRegionAspect()` が cos(中央緯度) で補正している。Britain は `distanceScale` 2.29 km/px（真は約 1.31）、面積 3.1 倍。Europe は 2.7 倍。本設計の km² の帯とイングランド較正（13 万 km²）は、そのままでは Britain 地図のイングランドを 40 万 km² と読む。スケールバーも 1.75 倍長い | 本設計の前に PR 0 として、実地図の `distanceScale` に cos(中央緯度) を掛ける修正を独立に出す。スケールバー・移動時間・経済の面積依存が変わるため、影響範囲の確認は別に行う |
| R2 | 高 | 人口はセル単位で決まり、面積に比例しない。セル 108 km² の Britain で 19 人/km²、セル 1,480 km² の Europe と既定のランダム地図で 1–2 人/km²。封数の式 `min(km²/17, 人口/400)` は大セルの地図で常に人口側で決まり、km² の帯で切った伯領は人口が 1/10 の空き地になる | 席数と封数は人口と burg から導き、km² は塊の形（連続性、セル数の下限・上限）と、セルを城代管区・小伯領のどちらと読むかの判定にだけ使う。大セル地図の人口不足は貴族設計の範囲外として記録する |
| R3 | 高 | ユーザー判断（2026-10-17）で名簿の軟上限を撤回する。必要な席を揃える | 下の必要席数表を正とする |
| R4 | 中 | 対象表に 22 Celtic が無い。Britain 地図の european セットで 5 枚中 2 枚に Celtic 国家が出た | 解決（2026-10-17）。スコットランド型 `gaelicProvincial` を追加し、台帳と NPC まで実装した。初期は mormaer と任期の thane、盛期以降は Earl、世襲 thane、連続の男爵領。辺境は Margrave にしない |
| R5 | 中 | `formName` の Duchy〜Empire は面積の絶対値ではなく、全国家の中央値に対する比のティアである（`defineStateForms()`）。statesNumber 3 の Britain では 12 万 km² のイングランド規模が Empire、1.5 万 km² が Grand Duchy になった | 「Duchy なら国内に公を置かない」は維持してよいが、公・大伯の段を作るかどうかは人口と真の km² で判定し、`formName` を使わない |
| R6 | 中 | Province の大きさは地図縮尺で 10 倍変わる。Britain p4 で中央値 2,100 km²（shire 相当）、Europe で 18,500 km²（公領相当）。Britain のセルは 55–108 km² で、本文の「既定セル 1,500 km²」は Europe・ランダム地図だけに当たる | 本文の縮尺表に Britain 縮尺の列を足す。100 km² 前後のセルは城代管区・ハンドレッドに当たり、50 km² の閾値は p8 でようやく近づく |
| R7 | 中 | Economy 接続が抜けている。現行の州領主は `payProvinceLordStipends()`（`src/extensions/economy/generators/characterStipends.ts`）で座所 burg の金庫から俸給を受ける。Holding の保有者には収入経路が無い | 「既存システムとの接続」に、Holding の座所 burg と俸給の経路を足す。数百人の新規人物が burg 金庫を同時に引くため、俸給額の較正をライブ計測で行う |
| R8 | 中 | 人物探索が線形である。extensions に `characters.some/find/filter(` が 69 箇所あり、`assignProvinceLords()` と `payProvinceLordStipends()` は Province ごとに全人物を走査する（O(Province × 人物)）。現行の名簿は Britain・3 国家で生存 151 人。必要席数表どおりなら国家あたり数百人になる | PR 4 の前に、`entityType + entityId → 保有者` の索引を作る PR を挟む。Advance Time の計測を前後で取る |
| R9 | 低 | 1 セル 1 burg の評価（次節） | 維持する |

### 必要席数（イングランド規模、上限なし）

実測のイングランド規模国家（真の 12–16 万 km²、burg 174–279、Province 49–81、人口 280–420 万）に対する目安。数は人口・burg・Province から導き、面積の軟上限を掛けない。

| 席 | 史料の目安 | 導出 | 実測国家での数 |
| --- | --- | --- | --- |
| Earl | 12–13 世紀に 7–12 | 人口 30 万人あたり 1 | 9–14 |
| テナント・イン・チーフの男爵（honour 保有者） | Sanders のバロン領約 200 | 人口 1.5–2 万人あたり 1 | 140–280 |
| Sheriff | 州ごと 1 | Province ごと 1（大きい Province は分割） | 49–81 |
| 司教 | 17 | 都市人口上位から、Province 3–4 つあたり 1 | 12–20 |
| 修道院長（法人 Holding の代表） | 大修道院 30–40 | 任意。初回は法人 Holding のみ | 0 |
| 王城の城代 | 50–90 | 城壁のある burg（実測 22–29）と首都 | 22–30 |
| 都市の長 | borough 500–600 | 憲章 burg。実人口 1,000 以上の burg（実測 80–110） | 80–110 |
| 旗手騎士 | 戦役ごとに数十〜百数十 | 封 5 以上かつ座所を持つ Holding | 50–150 |
| 家政騎士 | 数十 | 国家ごと 12–40 | 12–40 |
| 騎士個人 | 1300 年頃 1,000–1,500 | 封数 / 5 前後 | **未決**。NPC にするなら 1,000 超 |

騎士個人を除いても国家あたり 400–700 人になる。騎士個人を NPC にするかは R8 の索引と Advance Time の計測を見てから決める（Open Question 1）。

### 1 セル 1 burg の評価（R9）

結論: 維持する。城・荘園の座所・修道院は burg ではなく Holding の座所（`seatCellId` と種別）として持つ。

- 上限は効いていない。burg のある人口セルの割合は Britain p4 で 20%、p8 で 12%、Europe で 21%。burg の総数を決めているのは `getTownsNumber()`（`burgs-generator.ts`）の「人口セル数 / 5 /(密度/1 万)^0.8」で、セル上限ではない。points を 4 から 8 に倍増しても burg は 604→698 しか増えない。manors を 2,000 に固定すると Britain p8 で 2,003 burg が配置でき、人口セルの 35–41% で上限まで余裕がある。burg を増やしたい場合は manors を使えばよい。
- 史料の密度とも合う。1300 年頃の borough は約 220 km² に 1 つで、Britain のセル（55–108 km²）1 つに 1 未満である。市場特許（約 65 km² に 1 つ）は p4 で 1 セル 1.7 個になるが、市場は burg ではなく台帳の数値でよい。Europe とランダム地図では 1 セルに borough が数個入る計算になるが、そこでは人口自体が 1/10 で（R2）、burg を増やしても解決しない。
- 緩めた場合の不具合候補。`cells.burg` はセルごとに 1 つの `Uint16Array`（`burgs-generator.ts:1297`）で、54 ファイル 152 箇所が参照する。
  - 集計の取りこぼし: 国家・Province の都市人口と burg 一覧（`states-generator.ts:423`、`provinces-generator.ts:363-365`）、バイオーム統計、セル情報の都市人口。
  - 削除と移動: burg を消すとセルの枠が 0 になり、同じセルの別 burg が孤立する（`worldRuntime.ts:1398`、`burgs-generator.ts:2331`）。移動は上書きする（`worldRuntime.ts:1139-1140`）。
  - 経済: セルから burg を引く農地利用・生産・市場（`agriculturalLandUse.ts:619,693,739`、`production-utils.ts:54`、`economy/simulation.ts:714`）が後背地を 1 つの burg にだけ帰属させる。
  - 道路: 経路の節点がセルなので、同じセルの 2 burg は同じ節点を共有し、長さ 0 の区間ができる（`routes-generator.ts:1472,1563,1858`）。
  - 既存の不変条件: Burg Editor はセルが埋まっていると移動を拒否し（`burg-editor.ts:227`）、再サンプリングは衝突を退ける（`resample.ts:287`）。CE の町半径とサイト記述子もセル単位である。
  - 緩めるなら `cell → burg[]` の多重写像と 152 箇所の監査が必要で、貴族設計の利得に比べて重い。

### 本文への反映状況

反映済み: 状態行、char.md 判断の上書き、Goals の上限撤回、軟上限の段落、Key Decision 10（番号は 11 へ繰り下げ）、Open Question 1、Celtic の行、セル面積の注記、R4 のスコットランド型（対象表、手続き、称号、直轄割合、`feeDensity` 0.35、PR 3a、台帳のファイル一覧）。

未反映（次の改訂で本文に書く）: R1 の PR 0 を PR Plan に追加、R2 による封数式と目標帯の書き換え（km² → 人口と burg）、R6 の縮尺表の列、R7 の俸給経路、R8 の索引 PR、検証節の「軟上限」テストを「必要席数」テストへ。

## References

- Susan Reynolds, *Fiefs and Vassals: The Medieval Evidence Reinterpreted* (Oxford, 1994).
- Thomas K. Keefe, *Feudal Assessments and the Political Community under Henry II and His Sons* (University of California Press, 1983). Cartae Baronum 集成で 313 件、7,525 封。
- Cartae Baronum（1166）。Lambert of Etocquigny の返答は 16 カルケート余で騎士 10 人分。
- I. J. Sanders, *English Baronies: A Study of Their Origin and Descent, 1086–1327* (Oxford, 1960).
- Domesday Book（1086）。教会の記録価値は総額約 £73,000 のうち約 £18,400。
- Distraint of knighthood。Henry III 期の閾値は年 £20。のちに £40 へ上昇。
- Statute of Quia Emptores（1290）。
- Georges Duby, *La société aux XIe et XIIe siècles dans la région mâconnaise*（1953; 再版 1989）。
- フランス王領の拡大（Philippe II Auguste）とアパナージュ。Crown lands of France; Britannica, “appanage”。
- 辺境伯の職とブランデンブルク。金印勅書（1356）で選帝侯。
- 帝国直属（Reichsunmittelbarkeit）。中世後期から近世にかけて、直属領は大領邦から数 km² の帝国騎士領までを含む。
- *Catalogus Baronum*。核は 1150–68 年の *Quaternus magne expeditionis*。
- イベリアのコンセホとアルフォス。サンティアゴ騎士団は 1170 年頃レオンで形成。
- Erik Ulsig, “The nobility of the late Middle Ages”, *The Cambridge History of Scandinavia*. 北欧貴族地はアロドで、スウェーデンの frälse は軍役免税。
- オーダル。グラティング法とフロスタティング法の世代要件。
- Pál Engel, *The Realm of St Stephen: A History of Medieval Hungary, 895–1526* (2001)。県と bán。
- G. W. S. Barrow, *Kingship and Unity: Scotland 1000–1306*。mormaer から Earl への移行。
- Alexander Grant, "Thanes and Thanages, from the Eleventh to the Fourteenth Centuries", in Grant and Stringer eds., *Medieval Scotland: Crown, Lordship and Community* (1993)。
- Baronet。James I、1611 年 5 月。John Selden は中世の banneret との混同を退けている。
- ゲーム内の現行仕様: `docs/plan/char.md`, `docs/plan/military-organization-and-vassalage.md`, `src/extensions/nobility/data/titleTable.ts`, `src/generators/provinces-generator.ts`, `src/generators/states-generator.ts`。
