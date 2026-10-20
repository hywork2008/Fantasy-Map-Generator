# 子どもの労働力と時代ごとの変遷

状態: 2026-10-20 調査。同日 §5 の案 1・2 を実装(§6)。
きっかけ: [port-freight-queue-and-warehouses.md](port-freight-queue-and-warehouses.md) §10.23 の後、都市の生産で使われる労働が人口の 3 割に届かないことの説明として、0〜14 歳・50 歳以上が働かないことを確かめた。その中で、子どもが実際にどれだけ働いたかを時代ごとに調べた。
関連: [urban-employment-demand.md](urban-employment-demand.md)、[farm-labour-calibration.md](farm-labour-calibration.md)、[rural-food-labor-audit.md](rural-food-labor-audit.md)

## 1. 今の実装

| 場所 | 扱い |
| :--- | :--- |
| 人口の内訳(`BurgDemographics`、`populationAgeBands.ts`) | 子ども 0〜14 歳、大人 15〜49 歳、老人 50 歳以上。province-101(5 年後)の都市で子ども 40.7%・大人 46.3%・老人 13.0%、world-102(3 年後)で 38.8%・47.6%・13.6% |
| 都市の手工業(`production-generator.ts runWorkerLoop`) | 町の人口(`burg.population`、子どもと老人を含む)をそのまま働ける量にする |
| 都市の基幹産業(`basicEmployment.ts`) | 行政・鉱山・製錬・石切り・建設は大人(`maleAdults + femaleAdults`)から割り当てる |
| 農村の収穫月(`ruralOccupationAllocation.ts`) | 子ども 0.35、老人 0.4 を大人 1 人分に換算して手伝いに足す(`HOUSEHOLD_HARVEST_CHILD_EQUIVALENT`)。収穫月だけで、失業の計算には入れない |

手工業だけが子どもを大人と同じに数え、ほかの雇用は子どもを数えない。

## 2. 史料

### 2.1 時代ごとの働く割合(イングランド)

Horrell・Humphries・Weisdorf(2019)の表 4。救貧の調査、家計簿、国勢調査から。1570〜1625 年は、ひとりで働く子どもから、働きながら学ぶ子どもまでの幅。

| 年 | 史料 | 5〜9 歳 | 10〜14 歳 |
| :--- | :--- | :--- | :--- |
| 1570 | ノリッジの貧民調査 | 36〜50% | 74〜87% |
| 1597 | イプスウィッチ | 26〜36% | 56〜70% |
| 1625 | ソールズベリー | 19〜30% | 67〜73% |
| 1790 | ドーセット、Corfe Castle の人口調査 | 男 10%・女 11% | 男 67%・女 70% |
| 1787〜96 | 家計簿 | 11% | 54% |
| 1830〜39 | 家計簿 | 9% | 70% |
| 1840〜54 | 家計簿 | 7% | 42% |
| 1851 | 国勢調査 | 男 2%・女 1% | 男 37%・女 20% |
| 1861 | 国勢調査 | 男 2%・女 1% | 男 37%・女 20% |

- 同じ論文は、早い時代(中世)を、12 歳の男の子 75%・7 歳の女の子 50% と置いている。
- 1600 年より前の数字は貧しい家の調査で、平均より高く出る。1851 年の国勢調査は、工場の子どもを 3 分の 1 ほど少なく数えた(グラスゴーの工場の記録との照合)。

### 2.2 働く日数と稼ぎ(大人に対して)

| 項目 | 値 | 出典 |
| :--- | :--- | :--- |
| 働く日数 | 働いている 10〜14 歳の男の子の多くは大人の男と同じだけ働いた。5〜9 歳の女の子は大人の男の 4 分の 1〜3 分の 2 の日数 | Horrell・Humphries・Weisdorf(2019) |
| 子どもの賃金 / 未熟練の大人の男の賃金 | 1270 年ごろ約 60% から、1860 年ごろ約 40% へ下がる。16 世紀から差が開く | Horrell・Humphries(2019) |
| 10〜14 歳の稼ぎ / 父の稼ぎ | 父の職によって 20〜50%(1787〜1872 年) | Horrell・Humphries(1995) |
| 子どもの働きがないと暮らせないか | 黒死病の前と、17 世紀前半には不可欠。家族が子どもの働きなしで「まともな暮らし」を保てるのは、19 世紀の工業化の後 | Horrell・Humphries・Weisdorf(2019) |

### 2.3 仕事の種類と始める年齢

| 時代・地域 | 内容 | 出典 |
| :--- | :--- | :--- |
| ローマ | 子どもは 10 歳ごろ、早ければ 5 歳から働かせられた(Brunt)。農書には収穫・加工のすべての段階に少年少女が出てくる。羊・山羊の番。働き方は年齢より身分(自由人か奴隷か)で決まった | Mirković、Tassi Scandone |
| ローマ期エジプト(オクシリンコス) | 徒弟の契約は約 20 件、多くは織物。10 代になる前に始め、2〜4 年。女の子の徒弟はまれ | オスロ大学(Vuolanto) |
| 中世イングランド | 外国人の観察では 7〜9 歳で奉公に出すが、多くは 14 歳ごろ(Hanawalt)。徒弟は 12 歳前後から 7 年が普通 | Hanawalt、medievalists.net |
| 近世イングランド | 14〜25 歳の農家の住み込み奉公人(servants in husbandry)が、農業の常雇いの半分ほど | Kussmaul(1981) |
| 1841 年のイングランド | 15 歳未満の男の子の職は農業労働者 82,259 人、使い走り 43,922 人、綿工場 33,228 人。女の子は家事奉公 58,933 人、綿工場 37,058 人 | 1841 年国勢調査(Wikipedia 経由) |
| 産業革命の工場 | 1833 年の綿・毛・亜麻・絹工場で、13 歳未満が 10〜20%、13〜18 歳が 23〜57%。鉱山では 1800〜1850 年に 20〜50% が子ども | 工場調査(Wikipedia 経由) |
| 江戸時代の商家 | 丁稚は 10 歳前後で入り、15〜16 歳で半人前、17〜19 歳で一人前。給金はなく衣食住。京都の町家では男子は数え 13 歳ごろに奉公を始め、女子は 1〜2 年の短い奉公 | 国立歴史民俗博物館、浜野潔 |
| 明治・大正の日本 | 1911 年の工場法で雇える年齢を 12 歳以上(軽い仕事は 10 歳)にし、15 歳未満は 1 日 12 時間まで。施行は 1916 年。1916 年の工場の届出で、15 歳未満は男 1.4 万人・女 5.5 万人 | 工場法、当時の報道 |

### 2.4 法と学校による減少

| 年 | 内容 |
| :--- | :--- |
| 1819・1833 年(英) | 綿工場で 9 歳未満を禁止、9〜13 歳は 1 日 8 時間 |
| 1842 年(英) | 10 歳未満の男の子と、すべての女性の坑内の仕事を禁止 |
| 1870 年(英) | 義務教育 |
| 1872 年(日) | 学制 |
| 1880〜1930 年(米) | 10〜15 歳の働く割合が、男の子 32.5% → 6.4%、女の子 12.2% → 2.9%。減った分は主に工場で、農業の手伝いは国勢調査に出にくい |
| 1996 年(世界) | 10〜14 歳の働く割合は世界で 13.2%、アフリカ 26.3%、アジア 13%、中南米 9.8%(ILO) |

## 3. 大人に換算した働き

子ども 1 人を大人の何人分と数えるかを、次の積で見積もる。

子ども 1 人の働き = Σ(年齢層の割合 × 働く割合 × 日数の比 × 生産性の比)

- 年齢層の割合: 子どもの多い前近代の人口では、0〜14 歳のうち 0〜4 歳が約 36%、5〜9 歳が約 33%、10〜14 歳が約 31%(仮定。モデルは分けて持たない)。0〜4 歳は 0。
- 日数の比: 10〜14 歳 0.9、5〜9 歳 0.45(§2.2)。
- 生産性の比: 賃金の比で代える。10〜14 歳は 16 世紀まで 0.55、17 世紀 0.5、18 世紀 0.4、19 世紀 0.35。5〜9 歳は 0.25(仮定)。

| ゲームの時代 | 5〜9 歳の働く割合 | 10〜14 歳の働く割合 | 子ども 1 人の働き | 拠り所 |
| :--- | :--- | :--- | :--- | :--- |
| classicalAntiquity〜lateMedieval(〜1450) | 50% | 75% | 約 0.13 | Horrell・Humphries・Weisdorf の中世の仮定、ローマの史料 |
| ageOfExploration(1450〜1600) | 30〜45% | 70〜80% | 約 0.13 | 1570 ノリッジ、1597 イプスウィッチ |
| maritimeEra(1600〜1750) | 25% | 70% | 約 0.11 | 1625 ソールズベリー |
| preIndustrialEra(1750〜1830) | 10% | 60% | 約 0.07 | 1787〜96 家計簿、1790 ドーセット |
| steamEra(1830〜1880) | 5% | 40% | 約 0.04 | 1830〜54 家計簿、1851・1861 国勢調査 |
| industrialChemistryEra 以降(1880〜) | 0〜2% | 20% から下がる | 0.02 → 0 | 1870 年代の義務教育、米国の 1880〜1930 年 |

- 中世から近世の子ども 1 人は、大人の 1 割強。働く割合は高いが、年下の子は数えず、10〜14 歳も大人の半分ほどしか生まない。
- 産業革命で工場の子どもが目立つが、大人に換算した量は 18 世紀より小さい。賃金の比が下がり、5〜9 歳が働かなくなったため(工場の数字は数えすぎ・数え漏れの両方がある)。
- 農村の収穫月の 0.35 は、年の平均ではなく、家族総出の繁忙期の値として、上の値と矛盾しない。

都市の人口に当てはめると(子ども 40%・大人 47%・老人 13%)、中世の町で働ける量は「大人 0.47 + 子ども 0.40 × 0.13 ≒ 0.52」(老人を除く)。今の手工業は 1.0 として数えている。

## 4. 都市の子どもの働き方

- 町の 10〜14 歳の多くは、住み込みの家事奉公人と、12〜14 歳で入る徒弟。1841 年でも、15 歳未満の女の子の職のいちばんは家事奉公。
- 家事奉公は品を造らない。大人の女性の家事を肩代わりして、大人を手工業や市場の仕事に回す働き方になる。徒弟は手工業の中で働く。
- 町の子どもの奉公人の多くは村から来た。村の側の働きの減りと、町の側の働きの増えが対になる。
- 糸紡ぎは、近世の女性と子どもの主な内職で、出来高払いで稼ぎは低かった(Humphries・Schneider)。都市の手工業より、家の中の仕事に入る。

## 5. 実装への案(1・2 は §6 で実装)

1. 都市の手工業の働ける量を、総人口から「大人 + 子ども × 時代の換算値」に変える。換算値は §3 の表を `HistoricalPeriod` から引く。
2. 1 の大人から、同じ町の建設・行政・鉱山などの雇用を引く(二重に数えないため。今は手工業が大人の 56〜68%、基幹産業の合計が大人の 177〜187% を数えている)。
3. 子どもの働きの一部(家事奉公)は、品を造らず大人の手を空ける形で入れるかを決める。入れないなら、1 の換算値は徒弟の分だけに下げる。
4. 時代の換算値を、国の技術(義務教育・工場法)で下げるかを決める。今の時代の選択肢は地図の作成時の下限で、国ごとの技術で進む。
5. 老人(50 歳以上)は今回調べていない。農村の収穫月は 0.4 で数えている。

## 6. 実装(2026-10-20)

§5 の案 1・2。

| 項目 | 内容 | 場所 |
| :--- | :--- | :--- |
| 子どもの換算値 | §3 の表を `HistoricalPeriod` ごとの定数にした(古代〜大航海時代 0.13、海洋時代 0.11、産業革命前夜 0.07、蒸気時代 0.04、化学工業時代 0.02、以降 0)。時代の指定のない古い地図は highMedieval として読む | `craftWorkforce.ts CHILD_LABOUR_EQUIVALENT` |
| 町の基幹産業の人手 | 行政・石切り・火山灰・建設(石工・大工)は町の大人から、鉱山・製錬は市場の大人から取る(`reconcileAnnualBasicEmploymentWorkers` と同じ)。鉱山・製錬の人手は、各町の自分の産業の後に残る大人の割合で分ける。石切り・鉱山などの `workers` は現場の単位(人、必要人数)なので、年の割り当てと同じく人口点に直す(`crewScale`) | `craftWorkforce.ts getBasicWorkersByBurg`、`basicEmployment.ts crewScale` |
| 手工業の人手 | 大人 + 子ども × 換算値 − 基幹産業の人手(0 未満は 0)。老人は数えない。人口の内訳のない古い町は総人口から引く | `craftWorkforce.ts getCraftWorkforce` |
| 生産 | 1 か月の労働の上限、保存食の段と戦略の段の枠(× 0.15)、車両の造りに取る労働を、総人口から手工業の人手に替えた。家計の需要、月の量の下限、職の分野の見込みの人手(1,000 人あたりの職人)は都市の総人口のまま。手順の数も総人口のまま(人手が 1 点に満たない小さな町でも、保存食・注文・利益の順の手を試せるように) | `production-generator.ts runWorkerLoop`、`BurgProductionState.workforce` |

交易の 30%(`LaborMarket`、市場の人口の 30% を 5 つの職に分ける)は人数ではなく賃金と技能の指標として扱い、引いていない。

### 6.1 計測(1 か月の刻み、`on`。§10.23(port-freight-queue-and-warehouses.md)の後 → 本節の後)

| 項目 | province-101 | world-102 |
| :--- | :--- | :--- |
| 町の大人 / 基幹産業の人手 / 手工業の人手(人口点、終わりの時点) | 147 / 76 / 88 | 333 / 202 / 167 |
| 手工業で使われた労働(総人口に対して、12 か月) | 29.6% → 12.4% | 27.4% → 12.3% |
| 手工業の雇用 / 大人(終わりの時点) | 67.8% → 38.2% | 56.0% → 27.8% |
| 取引(件、5 年 / 3 年) | 2,328 → 2,148 | 888 → 973 |
| 高額品の取引 | 1,371 → 1,253 | 740 → 788 |
| 支払いの比(最後の年) | 0.986 → 0.980 | 0.984 → 0.977 |

- 手工業の人手は大人の 6 割ほど(基幹産業が大人の 5 割ほどを取り、子どもの分が少し足される)。そのうち実際に使われるのは半分ほどで、残りは利益の出る仕事や需要の余地がない。
- 前にいちばん労働を使っていた Beer(world-102 の 7〜8 か月目で 164 → 29 点)が大きく減った。総人口を使えたときは、Beer が子どもと老人の分まで使っていた。
- world-102 の取引は増え、province-101 は減った(§10.22 の後の 1,768 件よりは多い)。
- world-102 の国 4(届け先は人口 3.4 の町 1 つ)は、戦略の段の枠が人手 × 0.15 に縮み、馬具の新造が 12.15 → 5.20 / 14.05 ロット、武器の新造が 3.53 → 2.28 / 3.61 ロットに減った。
- province-101 の国 2 は、§10.23 と同じく届け先の市場 1 に鉄の地金がなく、材料待ち。

### 6.2 残る課題

- 雇用の集計(`basicEmploymentSummary`)は、交易の 30% と、それに掛けるサービス業(× 1.5)を含めて、まだ大人の 150% ほどを数える。交易の 30% を人数として扱うかを決める。
- 家事奉公(§5-3)、国の技術での換算値の引き下げ(§5-4)、老人(§5-5)は未実装。
- 人口 3〜4 の町 1 つを国の軍需の届け先にすると、戦略の段の枠が小さすぎる(T29)。

## 7. 出典

- Horrell, S., Humphries, J. and Weisdorf, J. (2019) "Family standards of living over the long run, England 1280-1850", CAGE Working Paper 419 <https://warwick.ac.uk/fac/soc/economics/research/centres/cage/manage/publications/419-2019_horrell_humphries_and_weisdorf.pdf>(表 4、図 6、本文の日数と賃金の比)
- Horrell, S. and Humphries, J. (2019) "Children's work and wages in Britain, 1280–1860", Explorations in Economic History 73 <https://ideas.repec.org/a/eee/exehis/v73y2019ic6.html>、データ <https://www.openicpsr.org/openicpsr/project/109304/version/V1/view>
- Horrell, S., Humphries, J. and Weisdorf, J. "Working for a Living? Women and Children's Labour Inputs in England, 1260-1850" <https://ideas.repec.org/p/oxf/esohwp/_172.html>
- Humphries, J. (2010) *Childhood and Child Labour in the British Industrial Revolution*, Cambridge University Press <https://www.history.ox.ac.uk/node/14881>
- Kussmaul, A. (1981) *Servants in Husbandry in Early Modern England* <https://resolve.cambridge.org/core/journals/journal-of-economic-history/article/servants-in-husbandry-in-early-modern-england/C4EC0CE5CACC92A8A027FD7477053DCB>
- Child labour in the British Industrial Revolution(1841 年の職、工場の割合、工場法) <https://en.wikipedia.org/wiki/Child_labour_in_the_British_Industrial_Revolution>
- Deacon, B. "Child labour in 1851"(コーンウォール、男の子の半分・女の子 16%) <https://bernarddeacon.com/2020/04/22/child-labour-in-1851/>
- Whaples, R. "Child Labor in the United States", EH.net <https://eh.net/encyclopedia/child-labor-in-the-united-states/>
- 1996 年 ILO の推計の報道 <https://www.sunsonline.org/trade/areas/develope/06110196.htm>
- medievalists.net "What medieval Europe did with its teenagers"(Hanawalt) <https://www.medievalists.net/2014/03/medieval-europe-teenagers/>
- オスロ大学 "2,000-year-old youth organization"(オクシリンコスの徒弟、Vuolanto) <https://hf.uio.no/ifikk/english/research/news-and-events/news/2014/2000-year-old-youth-organization.html>
- Mirković, "Child Labour and Taxes in the Agriculture"(Brunt の要約) <https://scriptaclassica.org/index.php/sci/article/download/3467/2987/6595>
- 国立歴史民俗博物館の解説(丁稚の年齢) <https://www.nact.jp/artcommons/user/detail/40106>、コトバンク「丁稚」 <https://kotobank.jp/word/%E4%B8%81%E7%A8%9A>
- 浜野潔(京都の町家の奉公) <https://kansai-u.repo.nii.ac.jp/record/8363/files/KU-1100-20060310-04.pdf>
- 工場法(1911)と 1916 年の届出の報道 <https://www1.udel.edu/History-old/figal/Hist370/text/er/underside.pdf>、<https://paperspast.natlib.govt.nz/newspapers/AS19161004.2.44>
- Humphries, J. and Schneider, B. "Spinning the industrial revolution" <https://www.history.ox.ac.uk/node/882346>

確かめていないこと: 江戸時代の奉公人の年齢別の割合(速水融の宗門改帳の研究)、明治の紡績工場の 14 歳未満の割合(『職工事情』)、フィレンツェの 1427 年の徒弟の年齢。どれも原典に当たる必要がある。
