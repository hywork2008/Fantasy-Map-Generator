# 古代ローマ〜大航海時代の未登録3Dモデル追加タスク

作成日: 2026-11-19

## 目的

古代ローマから大航海時代（紀元前1世紀〜17世紀頃）に、街中や戦場で見かける建造物・乗り物・兵器のうち、MVに登録されていないものを洗い出し、追加の順番を決める。

[中世〜大航海時代の欧州向け3Dモデル追加タスク](medieval-european-model-tasks.md)（01〜42、全件完了）の続編にあたる。あちらは12〜16世紀の欧州の町と村を対象にした。本書は、そこで扱わなかった古代ローマ、戦場、船、町の残りを対象にする。

## 登録済みのもの（2026-11-19時点）

照合した範囲は次のとおり。`src/buildings/` 配下の各モデル、`PLACEABLE_OBJECTS`、`medieval/*Models.ts`、MVの一覧ボタン（`src/model-viewer/main.ts`）。

| 分野 | 登録済み |
|---|---|
| 古代ローマ | Pont du Gard、Basilica temple、Trireme（Grok版・Opus版）、Galley |
| 中世の町と村 | 前計画の01〜42と、43以降の住宅・工房・会館・広場と教会墓地の設備・馬で回す粉挽き |
| 城と城壁 | 城壁、門楼、バービカン4種、Krak des Chevaliers、Bojnice、Chambord、詳細記録のある11件 |
| 船 | 小型漁船、手漕ぎ舟、川舟（Barge）、Caravel、Carrack、Galleon、Ship of the line、Sloop |
| 兵器 | 平衡錘式トレビュシェット、破城槌、攻城塔、野砲（1500年頃）、フリントロック銃 |
| 車両 | 四輪荷馬車、幌馬車、貴族の馬車、戦闘用馬車、トロッコ、二輪荷車、手押し車、運搬台 |
| 水と動力 | 井戸、公共水盤、泉の水場、洗濯場、風車（ポスト式・塔式）、水車 |

以下の各候補は、英語名と一般的な別名でコード全体を検索し、MVのモデルが無いことを確認した。CEが2Dの平面や簡易な形で描くものは、各項目に注記する。

## タスクリスト

順位は、ゲームでの必要性（既存の規則や機能との結び付き）と、その時代に見かける頻度で決めた定性的な目安である。統計値ではない。

### A. 渡し船（最優先）

AGENTS.mdの「河川と橋の角度」の規則では、橋の角度の上限を守れない地点に渡し船を使う。CEには渡し場の計画（`src/city-editor/generators/ferryLanding.ts`）がある。しかし、そこを渡る船のモデルが無い。

- [x] A01. **綱渡しの平底渡し船** — 両岸に張った綱を伝って渡る。人・荷車・家畜を載せる。荷車の積み込み口を持つ。中世〜近世の欧州。2026-11-19に [ropeFerry.ts](../../src/buildings/ships/ropeFerry.ts) として実装し、MVの Ships に `rope-ferry` で登録した（`SHIP_VARIANTS` の `ship.rope-ferry`、Low／High。author は Claude Opus 5.5）。CEへの配置は未実装。
  - 寸法は史料から決め、CEの渡し場の寸法には合わせていない。船体は全長12.0 m・幅3.4 m・深さ0.8 m・空荷の喫水0.3 m。跳ね上げ板を立てた全長は13.03 m。荷車の通路は幅2.76 m で、四輪荷馬車（6.4 × 2.5 m）が載る。
  - 形式：Kuhn（Deutsches Schiffahrtsarchiv 6, 1983）によれば、1657年に川の流れで渡る渡し船（Gierponte）が現れる前のライン川の渡しは、漕ぐ渡し船（Ponte・Schale）だった。幅が広く、非常に平たく、ほぼ長方形の船で、引き馬を付けたままの荷車・荷馬車・馬車を載せた。Enameの渡し船の復元（995年頃、Visual Dimension 2015）は、荷車が一方の端から入って反対の端から出るよう左右対称に作られている。竿で押し、川を横切る鎖で針路を保つ。
  - 大きさ：Dieren（IJssel川）の渡しは1269年の記録に現れ、1565年に大小の渡し船を持っていた。1889年の大型船は12.27 × 3.19 m。中世の川舟の出土例は Magor Pill（1239/40年）が約14 × 3.7 m・深さ1.2 m、Ráckeve（ドナウ川）が11 × 3 m。19〜20世紀の手で綱を引く渡し船は全長10〜15 m・幅2.4〜4.9 m。
  - 推定の部分：両端の跳ね上げ板（長さ1.5 m）は、19世紀以降の綱渡しの渡し船（Barnstedt の Aller 川の渡し、2 m）から推定した。中世には板を渡して使った可能性がある。綱の支柱・ローラー・綱を引く道具の形も推定である。
- [x] A02. **櫂・竿で漕ぐ小型渡し船** — 人と小荷物を運ぶ。古代〜近世。既存の手漕ぎ舟とは用途と船幅で区別する。2026-11-19に [ferryNachen.ts](../../src/buildings/ships/ferryNachen.ts) として実装し、MVの Ships に `ferry-nachen` で登録した（`SHIP_VARIANTS` の `ship.ferry-nachen`、Low／High。author は Claude Opus 5.5）。CEへの配置は未実装。
  - 寸法：ジーク川 Weldergoven の渡しの舟2隻のうち、大きい方に合わせた。1846年4月15日付のジーク川の渡しの一覧で、40 × 5 × 2¼ プロイセン・フィート（12.56 × 1.57 × 0.70 m）。この舟は主に人を渡すためのもので、荷車や大きな家畜は渡せなかった。小さい方は9.42 × 0.86 × 0.47 m。Dieren の渡しにも、大型船とは別に約5 × 0.95 m の小舟が2隻あった。
  - 形式：モーゼル川の Dreibord（厚い板3枚で作る。底板1枚と舷側板2枚）。1〜2人の船頭が竿（Deibaam）と手漕ぎの櫂で進め、乗客用に作った舟は6〜10人を乗せた（regionalgeschichte.net「Die Reisenachen」）。座席5本に2人ずつで、乗客は10人とした。船底の反り、舷の開き、舷の反り上がり、座席の間隔、櫂の寸法は推定である。
- [ ] A03. **渡し場の桟橋と綱の支柱**（2026-11-20：CE のオーバーホール中のため保留） — 両岸の着岸台、綱を張る柱、巻き上げ機。CEの渡し場に置く設備。Kuhn（1983）によれば、荷車を乗せるには水位に合わせて上下する浮き桟橋（Landeschiff）が要る。固定の桟橋では荷車を乗せられない。浮き桟橋か、水際まで下る斜路のどちらかで作る。St. Goar の渡しの浮き桟橋の船（1786年の見積り、Kuhn 付録3）は、長さ60 Schuh・底幅7½ Schuh・舷の高さ4 Schuh。Kuhn の換算（80 Schuh ≒ 22.8 m）で約17.1 × 2.1 × 1.1 m になる。

- [x] A04. **帆と櫂の大型渡し船** — 綱を張れない広い川・河口・海峡を渡る渡し船。人・家畜・荷車を載せ、帆と櫂で走る。FMG連携によりCEの川幅は最大で12 km近くになり、綱を使うA01や、流れで渡る渡し船では渡れない。
  - 根拠：Kuhn（1983）によれば、綱を使わない漕ぐ渡し船（Ponte・Schale）が「古くから」の方式で、ライン川の下流では帆を付けたものもあった。フォース湾の Queensferry には12世紀から定期便があり、1821年に外輪蒸気船が曳くようになるまで帆船で渡した。大ベルト海峡（Nyborg–Korsør 約26 km）には、中世に途中のスプロー島（Nyborg から約8.5 km）に王の待機所があった。
  - 史料調査（2026-11-19）の結果は次のとおり。
    - **形式**：18世紀デンマークの渡し船は「帆で走り、風が無いときは櫂で漕ぐ、屋根の無い船」で、旅人・車両・荷・馬・牛を載せた（Mortensøn『Kystlandskabet』1996、Jonge『Danmarksbeskrivelse』1777 による。da.wikipedia「Færgegårde i Danmark」の引用から）。主な船種はスマック船（færgesmakke）と小型帆船（jagt）である。スマック船は平底で、両端がふくらみ、側面がほぼ直線で、リーボード（風下側に下ろして横流れを防ぐ板）を持つ。帆は古くはスプリットセイル（斜めの棒で張る帆）で、18世紀からガフセイル（上辺を斜めの棒で張る帆）が主になった。
    - **距離**：Assens–Ærø の約15 km（2デンマーク・マイル）を、馬と荷車用の屋根の無いスマック船2隻で渡した。大ベルト海峡の Nyborg–Korsør（約26 km、1300年代からの特権付きの渡し）も同じ種類の船で渡した。Aarhus–Kalundborg（12デンマーク・マイル、約90 km）には、大・中・小の3種類のスマック船があった（1747年の料金表）。CEの最大12 km はこの範囲に収まる。
    - **積載量**：小ベルト海峡（Middelfart–Snoghøj）のスマック船1隻は、旅客と馬10〜12頭を載せた。大きい輸送用の渡し船は馬16〜22頭（Jonge 1777）。
    - **運航の規模**：1785年、大ベルト海峡の渡し船10隻（Nyborg 6隻、Korsør 4隻）が800往復し、約6,500人、牛5,405頭、子羊1,363頭、豚177頭、馬約2,000頭を運んだ。冬に海が凍ると、氷の上を引ける小舟（isbåd）を使った（Provinsens søfart 1720–1832）。
    - **時代**：スマックという語の初出は1460年で、16世紀には広く使われた。中世盛期の Queensferry（12世紀〜）なども帆と櫂の渡しだが、船の形と寸法の史料は見つからなかった。A04 は16〜18世紀の北海・バルト海沿岸のスマック型渡し船とし、中世の船体は後の課題とする。
    - **寸法（推定）**：渡し船のスマック船の寸法を書いた史料は見つからなかった。同じ地域の平底・一本マストの砂運搬船（sandskude、18世紀中頃）が平均で全長14 m・幅4.5 m・深さ1.5 m である。馬10〜12頭（1頭あたり約0.8 × 2.5 m）を2列に並べられる大きさと合うため、これを基準にする。推定であることをモデルの説明文に明記する。
    - **未解決**：荷車の積み方（板を渡したか、車輪を外したか）、櫂の数、乗組員の数。荷車は分からないため、船に載せた状態は作らず、板を渡す装備だけを置く。
  - 制作の方針：一本マストでガフセイル（展帆と畳帆）、リーボード、平底で両端がふくらんだ船体、屋根の無い荷室、馬をつなぐ横木、乗り込み用の板、長い櫂。Low／High の2品質とし、A01 と同じく MV 専用で `SHIP_VARIANTS` に登録する。
  - 2026-11-19に [ferrySmack.ts](../../src/buildings/ships/ferrySmack.ts) として実装し、MVの Ships に `ferry-smack` で登録した（`SHIP_VARIANTS` の `ship.ferry-smack`、Low／High、帆は Set／Furled を選べる。author は Claude Opus 5.5）。CEへの配置は未実装。
    - 船体は全長14 m・幅4.5 m・深さ1.5 m・喫水0.8 m。舵を含む全長は14.75 m、リーボードを含む幅は4.68 m、マストの頂部は水線上12.42 m。マストの高さと帆の大きさは、船体からの割り出しである。
    - 馬12頭が乗る。並べ方は、1頭あたり2.5 × 0.9 m の区画を4列 × 3頭（荷室の x = −4〜3.5 m）。胴の高さで外側の列が船内に収まることをテストで確かめた。当初の船尾の細い船型では外側の列が収まらなかったため、両端を同じようにふくらませた。
    - 荷車は積んだ状態を作っていない。乗り込み用の板（4 m）だけを置く。

- [x] A05. **流れで渡る渡し船（Gierponte、fliegende Brücke）** — 2隻の船体を荷を載せる床で連結した渡し船。門形の枠の上で綱を滑らせ、上流に錨で留めた長い鎖を、数隻の小舟（Buchtnachen、最大9隻）で水面の上に支える。舵で斜めに構えると、流れの力で対岸へ渡る。1657年にナイメーヘンで始まり、ライン川では1669年（マンハイム）以降に広まった（Kuhn 1983）。
  - 寸法の史料は十分にある。St. Goar の新造船は、1696年が80 × 8 × 5 Schuh（22.8 × 2.3 × 1.4 m）、1772年が23.5 × 3.5 × 1.5 m、1788年が25.6 × 3.4 × 1.7 m（いずれも1隻の船体）。1696年の船からは、門形の枠と台形の荷床を使った。Deutz（ケルン）の船体は110 × 14 Fuß（約31.7 × 4 m）、荷床は70 × 60 Fuß（約317 m²）で、操作には船頭のほか4人の手伝いが要った。
  - 川幅による船の割り当てでは、数百mまでの流れのある川を受け持つ。綱と鎖が本流をふさぐため、船が通るときは片岸へ寄せる必要があった。
  - 2026-11-20に [reactionFerry.ts](../../src/buildings/ships/reactionFerry.ts) として実装し、MVの Ships に `reaction-ferry` で登録した（`SHIP_VARIANTS` の `ship.reaction-ferry`、Low／High。author は Claude Opus 5.5）。CEへの配置は未実装。
    - 基準は St. Goar の1772年の新造船（Kuhn 付録2の見積り）。船体2隻は82.5 × 12.5 × 5.2 Schuh で、Kuhn の換算（82.5 Schuh = 23.5 m）では23.5 × 3.56 × 1.48 m になる（Kuhn の表は23.5 × 3.5 × 1.5 m に丸めている）。荷床は船体の内部に組んだ60 Schuh（17.1 m）の構造の上に、6 Schuh（1.71 m）の柱で載る。見積りにある手すりの子柱116本、まっすぐな縁材2本と曲がった縁材4本、部屋2つ、舵2枚、鐘の小屋付きの大きいマスト、小さいマスト、番小屋を作った。横木（Katze）は荷床から約7 m（1693・1696年の図面）。
    - 推定の部分：2隻の間隔（1.2 m）、荷床の幅（8.5 m）、船体の線、マストの高さ。1772年の見積りは2本のマストの「慣例の形」で、1696年からの門形の枠とは描かれ方が食い違う（Kuhn も解決できないとしている）。今回は見積りに従って2本のマストにした。
    - 鎖と、鎖を支える小舟（Buchtnachen）は川の上流へ長く伸びるため、船首から出る綱だけを示した。

### 川幅による渡し船の選び方（2026-11-19）

綱で渡す方式が実用になる距離は、史料と記録の範囲では数百mまでである。

- 綱を手で引く渡しの現存例は、ほとんどが小河川である（例：Elwell Ferry は対岸まで約100 m）。
- 流れで渡る渡し船（Gierponte）は、ライン川の本流が上限だった。最初の例のナイメーヘン（1657年）でさえ川幅全体は渡れず、浅い北岸側の約3分の1には舟橋をつなげていた（Kuhn 1983）。
- 綱の方式で1 kmを超えるのは、近代の鋼索とエンジンの例だけである。世界最長は Baynes Sound Connector（2016年、1,961 m、海底に沈めた鋼索3本）。

これを受けて、CEでは川幅で船を選ぶ。境界の値は、A02・A04 の史料調査で決め直す仮の値である。

| 川幅 | 渡し船 |
|---|---|
| 〜300 m程度 | A01 綱を手で引く平底渡し船 |
| 〜数百m | A05 流れで渡る渡し船（17世紀以降）、または A02 竿や櫂で漕ぐ渡し船（人と小荷物） |
| それより広い川 | A04 帆と櫂の大型渡し船 |

### CEの渡し場の大きさ（2026-11-19 確認）

CEの `FERRY_LANDING_RESERVE_METERS = 24`（[ferryLanding.ts](../../src/city-editor/generators/ferryLanding.ts)）は、桟橋・係留中の船・待つ人と荷車のために確保する土地の幅である。しかし、根拠となる史料の記載が無い。A01の船体（12 m）なら1隻は収まる。待つ荷車の列や浮き桟橋の大きさは、史料に基づいて決めたものではない。A03の制作時に、浮き桟橋と斜路の寸法から確保する幅を決め直す。

### B. 中世の戦場の基本セット

- [x] B01. **人力投石機（マンゴネル）** — 大勢で綱を引いて腕木を振る投石機。6〜13世紀。既存の平衡錘式トレビュシェットの前の段階にあたる。2026-11-20に [tractionTrebuchet.ts](../../src/buildings/siege/tractionTrebuchet.ts) として実装し、`PLACEABLE_OBJECTS`（ID `tractionTrebuchet`）、MVの Siege engines の見出し、`object.tractionTrebuchet@high` に登録した（Low／High。author は Claude Opus 5.5）。
  - 寸法：W. T. S. Tarver による実物大の復元（Technology and Culture 36, 1995）に合わせた。12世紀の al-Tarsusi の兵法書とヨーロッパの写本から作った「フランク式」の機械で、腕木16 ft（4.88 m）を軸で6対1に分ける。腕木の根元には三角の補強と、引き綱用の輪8個を付けた重い塊がある。柱は12 ft（3.66 m）、地面の梁は12 ft と16 ft、投石紐は41インチ（1.04 m）、鉤はまっすぐな5インチの鉄。
  - 性能（復元機）：引き手12〜20人で、2.5〜4.7 kgの石を約80〜105 m、最大は3.1 kgで145 m、1分間に4発強。al-Tarsusi は射程80〜120 mとする。
  - 時代：586年または597年のテッサロニキ包囲（アヴァール人）でヨーロッパに確認でき、12世紀末に平衡錘式へ主役を譲った。1291年のアッコン包囲でも多数が使われた。
  - 推定の部分：地面の梁・筋かい・柱の組み方と、休止の姿勢（長い腕を後ろの地面へ下ろす）。引き手は省いた。
- [x] B02. **攻城砲（ボンバード）** — 木の台に載せた大口径の鍛鉄砲。14〜15世紀。Mons MegやDulle Grietなど現存する砲の寸法を参照する。2026-11-20に [bombard.ts](../../src/buildings/siege/bombard.ts) として実装し、`PLACEABLE_OBJECTS`（ID `bombard`、Artillery）、MVの Artillery の見出し、`object.bombard@high` に登録した（Low／High。author は Claude Opus 5.5）。
  - 砲：Mons Meg に合わせた。1449年にモンスで試射され、ブルゴーニュ公の砲工 Jehan Cambier が作った。全長4.06 m、砲身2.80 m（鍛鉄の縦板25本を焼き嵌めの鉄輪で締める）、別に鍛造した薬室を砲尾にねじ込む。口径510 mm（20インチ）、重さ約6.6 t、石の弾は約175 kg。砲身の外径は記録が無いため、重さから約0.71 mと割り出した。薬室の外径と内径は写真からの推定。
  - 陣地：大型の砲は車輪付きの台では反動に耐えられず、牛の引く車で運び、起重機で地面の梁の台（Lade）へ移した。後ろの梁で反動を受け（撃つたびに直した）、楔で仰角をつけ、撃つときだけ上げる回転式の板の盾の陰から撃った。1日に1〜7発、射程はおよそ500 m以内（Cheb の解説板、Warfare History Network、ドイツ語の解説）。台・反動受け・盾の組み方は、これらの記述からの解釈である。Mons Meg 自体は初め車輪の無い箱に載り、1497年に車輪を得て、今は1934年に作った1500年頃の台の複製に載る。
- [ ] B03. **軍用テント・陣幕（パビリオン）** — 円錐形・寄棟形のテント、指揮官の陣幕、野営地の幕の囲い。中世〜近世。
  - 2026-11-20（一部完了）：王の野営宿営を [tudorLodging.ts](../../src/buildings/camps/tudorLodging.ts) として実装し、MVの新しい見出し Camps に `tudor-lodging` で登録した（MV 専用、Low／High。author は Claude Opus 5.5）。ヘンリー8世の死後の1547年目録（D. Starkey 編、1998年）にある「小さい方の王の宿営」から、広間1棟・円形のテント1棟・その間の渡り廊下（tresaunte）を作った。
    - 目録の記述：広間は屋根8幅・両端に三角布16枚・屋根の深さ4ヤード・壁32幅で深さ2½ヤード。円形のテントは三角布50枚・屋根の深さ6¾ヤード・壁25幅で深さ2½ヤード、頂部の内外に赤いサージのバラ。渡り廊下は屋根2幅で深さ2¼ヤード、壁4幅。宿営全体は「青いバックラムの大きな枝模様」で飾り、柱には王の紋章を描いて金を施した鉄の風見を立てた。
    - 換算：布1幅を約1ヤードとした（W. McLean「The Cut of Henry VIII's Tents」2015 が、テントの図面の屋根の勾配から推定）。円形のテントは直径約7.3 m・頂部約7.3 m、広間は約12 × 4.7 m・棟約5.1 m になる。渡り廊下の幅、柱、張り綱、枝模様の配置は推定。
    - 残り：兵士用の簡素な丸形・楕円形・くさび形のテント（1544年のブローニュの陣の絵に描かれる）と、陣営を囲む幕（1529年の Altdorfer の絵、1544年の Marquison の陣の絵）。どちらも寸法の史料が見つかっていないため未着手。
- [ ] B04. **大盾（パヴィス）と移動式の防壁** — 弩兵が立てる大盾と、車輪付きの板の防壁。14〜15世紀。
- [ ] B05. **据え置き式の大型弩（スプリンガルド）** — 城壁や攻城陣地に据える弩。13〜14世紀。
- [ ] B06. **多銃身砲（リボードカン）と前車** — 車輪付きの台に小砲身を並べた砲と、砲を牽く二輪の前車。15世紀〜。
- [ ] B07. **陣地の障害物** — 拒馬（シュヴォー・ド・フリーズ）、尖った杭の列、堡籃（ガビオン）。CEの柵と見張り塔は2Dで描かれているが、3Dのモデルは無い。
- [ ] B08. **大航海時代の砲と小火器** — カルバリン砲、臼砲、火縄銃。15〜17世紀。既存の野砲とフリントロック銃の間を埋める。

### C. 古代ローマの基本セット

属性は `periods: ["classicalAntiquity"]` と `"lateAntiquity"`、`regions: ["mediterranean"]` を基本にする。

- [ ] C01. **インスラ（集合住宅）** — 1階に店舗、上階に住戸を持つ3〜5階建て。オスティアの遺構を参照する。
- [ ] C02. **浴場（テルマエ）** — 冷浴室・温浴室・熱浴室、床下暖房、運動場。町の小浴場から始め、大浴場はその後にする。
- [ ] C03. **円形闘技場** — 楕円の観客席、アーチを重ねた外壁、闘技場の床。地方都市の規模から始める。
- [ ] C04. **凱旋門** — 単拱式と三拱式。ティトゥス帝の凱旋門・コンスタンティヌス帝の凱旋門を参照する。
- [ ] C05. **バリスタ・スコルピオ** — ねじり式の弩砲。大型と、軍団兵が扱う小型。
- [ ] C06. **オナゲル（投石機）** — ねじり式の一本腕の投石機。後期ローマ。
- [ ] C07. **戦車（チャリオット）** — 競技用の二輪戦車。戦闘用は、ローマ時代では周辺民族の装備として扱う。
- [ ] C08. **ドムス（邸宅）** — 中庭（アトリウム）と柱廊の庭を持つ1〜2階建て。ポンペイの遺構を参照する。
- [ ] C09. **劇場・戦車競技場** — 半円形の劇場と、細長い競技場（キルクス）。
- [ ] C10. **フォルム（広場）と柱廊** — 列柱、演壇、記念柱。既存のBasilica templeと組み合わせる。
- [ ] C11. **店舗・軽食屋（タベルナ、テルモポリウム）** — 通りに面した開口と、壺を埋め込んだカウンター。
- [ ] C12. **道と軍事の小物** — 里程標、舗装路の断面と縁石、国境の見張り塔、軍団の野営地の門と柵、灯台。
- [ ] C13. **ローマの乗り物と船** — 旅行用の四輪車（ラエダ）、牛車（プラウストルム）、輿（レクティカ）、小型軍船（リブルナ）、商船（コルビタ）。

### D. 中世の船の空白

- [ ] D01. **コグ船** — 一本マストと横帆、船尾の舵、船首と船尾の楼。北海・バルト海、12〜15世紀。ブレーメンのコグ（1380年頃）を参照する。
- [ ] D02. **ロングシップ** — 鎧張りの船体、一本マスト、櫂。8〜11世紀。スクーレレウ船・ゴクスタ船を参照する。
- [ ] D03. **クナール船・ハルク船** — 北欧の商船と、中世後期の大型商船。
- [ ] D04. **ガレアス船・フライト船・シーベック船・ピンネース船** — 16〜17世紀の船の種類を埋める。
- [ ] D05. **ゴンドラ・筏** — ヴェネツィアの小舟と、木材を流す筏。`industrialVehicles.ts` の "gondola" は飛行船の吊りかごであり、該当しない。

### E. 町と村の残り

- [ ] E01. **建設用の足場と踏み車クレーン** — 大聖堂の工事用の足場と、建設現場の踏み車クレーン。港のクレーン（35）とは別に用意する。
- [ ] E02. **圧搾機** — ブドウ・オリーブ・リンゴの梁式・ねじ式の圧搾機と、その小屋。
- [ ] E03. **鳩小屋** — 円形・角形の石造の鳩小屋。荘園と修道院向け。
- [ ] E04. **養蜂の巣箱** — 藁の巣箱（スケップ）と、雨よけの棚。
- [ ] E05. **炭焼き窯・ガラス炉** — 森の炭焼き窯と、ガラス炉の工房。ガラス職人の会館（37）とは別施設にする。
- [ ] E06. **鉱山の巻上げ機・塩田・造船台** — 馬で回す巻上げ機、海岸の塩田、船を造る台。
- [ ] E07. **施療院・救貧院・公衆浴場** — 都市の福祉施設と、中世の浴場。
- [ ] E08. **塔状住宅・時計塔** — イタリアの都市の塔状住宅（サン・ジミニャーノなど）と、町の時計塔。
- [ ] E09. **水責め椅子** — 池や川岸に据える刑罰具。既存のさらし台・絞首台と同じ分類にする。
- [ ] E10. **他の宗教の建物** — モスクとミナレット、シナゴーグ。オスマン帝国治下の南東欧とイベリア半島向け。

### F. 小さな乗り物

- [ ] F01. **輿・駕籠** — 中世〜近世の人を担ぐ乗り物。
- [ ] F02. **そり** — 雪上と、重い石材を引く荷そり。
- [ ] F03. **霊柩馬車** — 葬列用の馬車。
- [ ] F04. **乗合馬車（コーチ）** — 16世紀のハンガリー起源の箱型馬車。作る前に、既存の貴族の馬車との違いを確認する。

## 着手の順番

A（A01・A04・A02・A05 は完了。A03 は CE のオーバーホールが終わるまで保留〔2026-11-20〕）→ B（B01・B02 は完了、B03 は王の宿営のみ完了。次は B04）→ C（C01〜C07を先に）→ D01・D02 → E01〜E03 → 残り。

上の各グループの中では番号順に進める。地域や時代が限られるモデル（E10、D04など）は、使う文化圏と年代の要望が出た時点で順位を上げる。

## 完了の基準

- 各タスクでは専用の3Dモデルを作り、MVで形・実寸・接地・正面図・平面図を確認できれば完了とする。
- 属性（`kind`・`periods`・`years`・`regions`・`uses`）を付け、MVの絞り込みで「未分類」に入らないようにする（[model-viewer-rename-and-catalogue-facets.md](model-viewer-rename-and-catalogue-facets.md)）。
- 寸法は現存する実物・遺構・博物館の復元を参照し、参照元をモデルのコードか制作記録に残す。
- CEへの自動配置は別途、範囲を決める。モデルを作っただけで配置機能まで完了扱いにはしない。ただしA01・A03は、CEの渡し場に置くところまでを同じタスクで検討する。

## 照合元

- [MVの登録一覧](/src/model-viewer/main.ts)
- [配置可能オブジェクト](/src/buildings/placeableObjects.ts)
- [MVの一覧と属性](/src/model-viewer/catalogueIndex.ts)
- [CEの渡し場](/src/city-editor/generators/ferryLanding.ts)
- H. W. Kuhn, Frühe Gierponten: fliegende Brücken auf dem Rhein im 17. und 18. Jahrhundert, Deutsches Schiffahrtsarchiv 6 (1983), 25–64（[SSOAR](https://www.ssoar.info/ssoar/handle/document/52531)）
- W. T. S. Tarver, The Traction Trebuchet: A Reconstruction of an Early Medieval Siege Engine, Technology and Culture 36 (1995), 136–167（[UCCS Historical Engineering Society の PDF](https://uccshes.files.wordpress.com/2012/09/reconstruction-of-a-traction-trebuchet.pdf)）
- [Mangonel（Wikipedia）](https://en.wikipedia.org/wiki/Mangonel)
- [The Cut of Henry VIII's Tents ほか（A Commonplace Book、W. McLean）](http://willscommonplacebook.blogspot.com/search/label/Tents) — 1547年目録（D. Starkey 編『The Inventory of King Henry VIII』1998）の読み
- [Mons Meg（Wikipedia）](https://en.wikipedia.org/wiki/Mons_Meg)、[Dulle Griet（Wikipedia）](https://en.wikipedia.org/wiki/Dulle_Griet)
- [Bombarda, 15. století（Cheb の解説板、HMdb）](https://www.hmdb.org/m.asp?m=285895)、[Medieval Siege Artillery（Warfare History Network）](https://warfarehistorynetwork.com/medieval-siege-artillery/)、[Belagerungsgeschütze（burgerbe.de）](https://www.burgerbe.de/2018/04/07/belagerungsgeschuetze-die-groessten-kanonen-der-fruehen-neuzeit/)
- [Die Fährnachen（weldergoven.de）](http://www.weldergoven.de/?page_id=202) — 1846年のジーク川の渡しの一覧
- [Die Reisenachen（regionalgeschichte.net）](https://www.regionalgeschichte.net/bibliothek/aufsaetze/zimmer-reisenachen-personenschifffahrt-mosel.html)
- [Cable ferry（Wikipedia）](https://en.wikipedia.org/wiki/Cable_ferry)
- [Guinness World Records: Longest cable ferry](https://www.guinnessworldrecords.com/world-records/407955-longest-cable-ferry)
- [History of the Forth Crossing（Wikipedia）](https://en.wikipedia.org/wiki/History_of_the_Forth_Crossing)
- [Great Belt（Wikipedia）](https://en.wikipedia.org/wiki/Great_Belt)
- [Færgegårde i Danmark（da.wikipedia）](https://da.wikipedia.org/wiki/F%C3%A6rgeg%C3%A5rde_i_Danmark) — Jonge『Danmarksbeskrivelse』（1777）と Mortensøn『Kystlandskabet』（1996）の引用
- [Provinsens søfart 1720–1832: Søfarten i Korsør](http://ddb.byhistorie.dk/provinsens_soefart/tekst.aspx?distriktID=20)
- [Provinsens søfart 1720–1832: Søfarten i Nyborg](http://ddb.byhistorie.dk/provinsens_soefart/tekst.aspx?distriktID=25)
- [Smakke（da.wikipedia）](https://da.wikipedia.org/wiki/Smakke)、[Sejlskibstyper（jmarcussen.dk）](https://www.jmarcussen.dk/maritim/mart/lexref/skibstyper.html)、[Smakken（aldus.dk）](https://www.aldus.dk/fanoe/kaaver/smakke.html)
- [Skibstyper（loekkenhistorie.dk）](https://www.loekkenhistorie.dk/skudehandlen-2/332-skibstyper-2) — 18世紀中頃の砂運搬船の寸法
- [Ename の中世の渡し船の復元（Europeana）](https://www.europeana.eu/en/item/2048716/object_HA_2128)
- [Magor Pill Boat（Living Levels）](https://www.livinglevels.org.uk/stories/2020/4/27/the-magor-pill-boat)
- [Medieval Shipwreck from Ráckeve（A. J. Tóth）](https://files.archaeolingua.hu/2013TA/Upload/cikk_Toth_EN.pdf)
- [Dieren の渡しの歴史（Dieren in Beeld）](https://www.diereninbeeld.nl/index/historie_Veerpont.html)
- [ドイツの車両渡し船（fjordfaehren.de）](https://www.fjordfaehren.de/d/d_rhein.htm)
- [橋の角度の基準](/src/utils/bridgeSkewPolicy.ts)

本書は候補のタスク化であり、順位全体を史料から定量的に算出したものではない。
