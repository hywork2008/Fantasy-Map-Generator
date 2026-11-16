# 人の蓄えの年数を身分ごとに史料で決める

## 1. 背景

[character-cash-20261114.md](../analytics/character-cash-20261114.md)で、人の手持ちのお金が増え続ける主な理由の一つが、全ての身分が生活費の5年分（`WEALTH_RESERVE_YEARS`、商人は設定`merchantReserveYears`）まで使わずに貯めることだと分かった。36か月目でも目安の約3割にしか届かず、余りを町で使う人は一人もいなかった。この5年は[initial-wealth-calibration.md](initial-wealth-calibration.md) §8.3で、支配者の富の偏りを抑えるために置いた値で、史料からではない。そもそも中世の人々に、貯める習慣と貯められる余地があったのかを先に確かめる。

## 2. 史料

### 2.1 王

- エドワード3世は、百年戦争の初めの戦費をフィレンツェのバルディ家（約13.8万ポンド）とペルッツィ家（約9.2万ポンド）からの借金で賄い、1340年代に返せなくなった。両家は1290〜1345年に英国王に計43.3万ポンドを貸した（Russell、British History Online）。両家の倒産の原因は王の返済不能だけではない（Hunt）。
- その前も、王はルッカのリッカルディ家（1272〜1294）、フィレンツェのフレスコバルディ家（1294〜1312頃）から借りた。1433年のヘンリー6世の負債は16.8万ポンドだった。
- 王は蓄えるのではなく、借りて使う側だった。

### 2.2 大貴族

- 例外的な蓄えの例として、アランデル伯リチャード・フィッツアランは1376年の死の時に約6万ポンド（9万マルク）の現金を残し、その半分近くをアランデル城の高い塔に袋で置いていた。1370年には王が伯に2万ポンド以上の借りがあった（DNB）。伯は戦争・王の顧問・外交の働きで富を得た。
- Dyer（*Standards of Living in the Later Middle Ages*、第2〜4章）は、中世の終わりの貴族は収入にいつも不安を抱え、15世紀初めに地代が下がって苦しんだとし、支出の章を「やりくり（making ends meet）」と題している。貴族の支出は家の会計で賄われ、貴族全体で年に約50万ポンド（平時の国家の予算の10倍以上）を使った。
- McFarlane（*The Nobility of Later Medieval England*）は、大貴族は多くが支払いに困らず、借金は一時の資金繰りだったと論じたと理解しているが、本文は確かめていない。
- 大貴族の多くは収入をほぼ使い切り、数年分の現金を持つのは戦争・官職で稼いだ一部の人に限られた、と読める。

### 2.3 商人

- ジェノヴァの13世紀の遺言では、手元の現金はコメンダ（出資の契約）の額と比べてごく小さかった（Van Doosselaere）。1281年のヴェネツィアの商人の例でも、富の大部分は25件のコメンダの貸しで、現金と身の回りの品は1割ほどだった（抜き出した文が崩れていて、割合は未確認）。
- 商人の富は、品と出資と貸しとして回っており、使わずに置く現金は少なかった。

### 2.4 農民と町の人

- 14世紀の英国の村では、農民同士の小さな貸し借りが多く、荘園の裁判所の借金の訴えの中央値は約3シリングで、7〜8割が5シリング未満だった（Briggs、*Credit and Village Society in Fourteenth-Century England*）。決まった金貸しの層はおらず、誰もが借り手にも貸し手にもなった。
- 蓄えは現金よりも、家畜・穀物・家財として持たれ、足りない時は借りてしのいだ。

## 3. 読み取り

1. 生活費の5年分を現金で持つのは、アランデル伯のような例外で、どの身分の典型でもない。
2. 王と多くの貴族は、収入をほぼ使い切り、足りない分を借りた。今のシミュレーションの支配者・中央の役人・ギルドの親方がお金0で止まるのは、借りる道が無いので、この形の半分（使い切り）だけが出ている。
3. 商人は貯めた分を出資と品に回した。今の仕組みにも、蓄えを超えた分を家（市場の商家）に出資する道（`investFromCharacter`）があるが、5年の蓄えに届かないので、ほとんど通らない。

## 4. 決める仕組み（案）

- 蓄えの年数を身分ごとの設定にする（`characterReserve`：`byTier`（既定）か`legacy`（今の一律5年、商人は`merchantReserveYears`））。
- 年数は−5〜10年（0.25刻み）とする。王と貴族の借金（§5の1）を入れた後は、負の年数を「生活費の何年分まで借りてよいか」の上限として使う。借金を入れるまでは、負の値は0として扱う（手持ちが0より下にはならない）。
- 0年は「蓄えを持たず、手持ちの10%（`SURPLUS_WEALTH_SPEND_SHARE`）を毎月町で使う」ことになる。

| 身分 | 設定 | 既定の年数 | 根拠 |
| --- | --- | ---: | --- |
| 支配者 | `rulerReserveYears` | 0 | 王は借りて使う側（§2.1） |
| 中央の役人・地方の領主 | `officeReserveYears` | 0.5 | 収入をほぼ使い切る（§2.2） |
| 部隊の長 | `commanderReserveYears` | 0 | 給料と戦利品を使う |
| 市場の長・商人 | `merchantReserveYears`（今の設定、既定を5から変える） | 0.25 | 富は品と出資に回る（§2.3）。超えた分は家に出資する |
| ギルドの親方・徒弟・その他 | `commonReserveYears` | 0.25 | 小さな蓄えと貸し借り（§2.4） |

- 今の手持ちは目安の約3割（5年の時）なので、領主・商人は始めから余りを使う段に入る。

## 5. 未確定事項

1. 王と貴族の借金（市場の商家・金貸しからの借り入れ）を置くか。今は国の金庫の公債だけがある。
2. 例外的に貯める人（戦争・官職で稼いだ人）を、性格や役で選ぶか。
3. ギルドの親方・中央の役人・支配者がお金0で止まる理由（手当の出どころ）は、別に調べる。

## 6. 出典

- [Russell, The societies of the Bardi and the Peruzzi and their dealings with Edward III (British History Online)](https://www.british-history.ac.uk/manchester-uni/london-lay-subsidy/1332/pp93-135)
- [Hunt, The Medieval Super-Companies](https://dukereportbooks.com/books/the-medieval-super-companies-a-study-of-the-peruzzi-company-of-florence/)
- [Richard Fitzalan, 3rd Earl of Arundel (DNB, Luminarium)](https://www.luminarium.org/encyclopedia/arundel3.htm)、[Country Life, Arundel Castle](https://www.countrylife.co.uk/architecture/arundel-castle-259656)
- [Dyer, Standards of Living in the Later Middle Ages (Cambridge)](https://www.cambridge.org/core/books/standards-of-living-in-the-later-middle-ages/07CF2C52840B2D0320A12B3B9ABCE65B)
- [McFarlane, The Nobility of Later Medieval England](https://search.worldcat.org/title/The-nobility-of-later-medieval-England-:-the-Ford-lectures-for-1953-and-related-studies/oclc/632993)
- [Van Doosselaere, Equity Partnerships for Heterogeneous Ties](http://www.econ.yale.edu/~egcenter/VanDoosselaere2.pdf)、[The secret of Venetian success](https://people.bu.edu/chamley/365-24/Venice.pdf)
- [Briggs, Credit and Village Society (Reviews in History)](https://reviews.history.ac.uk/review/835/)、[The Medieval Review 10.09.10](https://scholarworks.iu.edu/journals/index.php/tmr/article/view/17097/23215)
- [Henry VI deficit finance (JEEH 2020)](https://jeeh.it/documents/3937/1-2020-deficit-finance-during-the-early-majority-of-henry-vi-of-england-1436-1_i5AaMZq.pdf)

## 7. 結果

[character-reserve-20261114.md](../analytics/character-reserve-20261114.md)。人の手持ちは2年目から地図2102で約7万、2103で約4.5万で横ばいになった（前の決まりでは36か月目に17.3万・11.1万で増え続けた）。使った分は町の家計（+8%前後）・市場のお金（+6%前後）・農村の家計（+5%前後）に戻り、人が買う贅沢の品は約2割増えた。支配者・中央の役人・ギルドの親方が1年目でお金0になるのは変わらず、借金（§5の1）と手当の出どころ（§5の3）で見る。
