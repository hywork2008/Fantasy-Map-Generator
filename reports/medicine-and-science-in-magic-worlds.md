# 医学と科学の位置づけ

「医学と科学技術を迷信として扱う」のは、設計者の決定である。D&D の規則から読んだ結論ではない。この報告書は、その決定を D&D の記述として確かめたり、D&D の誤読を指摘したりするためのものではない。決定の横に置く材料として、D&D の規則と出版設定、および有名なファンタジー作品が、医学・薬草・外科・自然学をどこに置いているかを並べる。

決定の文言は [fantasy-world-agenda.md](../docs/plan/dnd/fantasy-world-agenda.md) §6.5 にある。魔法が実在する世界では、効く説明は魔法側にあり、医学と科学技術は迷信として後景に退く。術者が人口の **0.05%** でも、rare と common を分けない。係数は [superstition-coefficients.md](../docs/plan/dnd/superstition-coefficients.md) にある。**SCHOLARSHIP_SUPERSTITION_FACTOR = 0.5** は、medicineDemandPressure を四項合成のあと clamp の前に半分にし、naturalPhilosophy の採用率 **0.15 を 0.075** にする。medicine 領域の採用率は **0.15 のまま** である。死亡率、衛生、コレラ、medicalCare は動かさない。

一次の SRD は Wisdom (Medicine) と 3.5 の Heal を、呪文なしの手続きとして残している。Forgotten Realms と Eberron は世俗の治療を制度として残し、物語の多数は薬草と外科を魔法の隣に残す。Glorantha は、神話が世界の仕組みであり、重力のような世俗科学の語が世界の内側に無い、という点で決定に近い。治療の神格は残り、失敗は人口比の統計ではなく神話操作の代償である。これらは決定の正否ではなく、決定の隣にある位置づけである。

## 決定は知識の地位であり、死亡率ではない

決定には二つの層がある。知識の地位が一つである。現実の科学文明では効くのが医学と科学技術で、魔法はイカサマである。魔法が実在する世界では、この評価を逆にする、というのが決定の文言である。効く説明は魔法側にあり、医学と科学技術は迷信として扱われる。術者が人口の **0.05%** でも、薬種・病院・自然哲学は胡散臭いものとして後景に退く。rare と common は分けない。ここでの迷信は、効かないと知りつつ残る儀礼のことではなく、信じられる説明が魔法側にあるために経験知のほうが虚偽だと扱われる、という知識の地位である。

もう一つは、その地位を需要信号と採用率の係数にした層である。掛ける場所は二つだけである。medicineDemandPressure を合成のあと clamp の前に半分にすることと、naturalPhilosophy の採用率を半分にすることである。medicine 領域のアカデミー採用率、ノードの最小値、死亡率、衛生、コレラ、medicalCare はそのままである。

文言は薬種・病院・自然哲学をまとめて後景に退かせ、術者が稀でも例外を置かない。係数は自然哲学の採用率と医学の需要信号だけを半分にし、医学のアカデミー在庫と、身体が治る速度はそのままにする。資料と並べるときは、この二つを一つの命題として読まない。

## 資料を並べる三つの位置

資料は、社会が経験知をどう分類するかで三つに分ける。(A) は、稀な奇跡が規模化しないので、通常の医学はそのまま残る、である。(B) は、魔法のほうが社会的に上で、医学と経験知は効く、である。(C) は、魔法的説明があるので、経験的医学と自然哲学は虚偽、すなわち迷信だと信じられる、である。威信の差だけで、経験知を虚偽とまでは書かないものは、(B) と (C) のあいだに残す。

決定の文言は (C) に置く。信じられる説明が魔法側にある、という理由で薬種・病院・自然哲学を後景に退かせ、術者 **0.05%** でも rare と common を分けないからである。係数の 1/2 は、その文言のうち需要信号と自然哲学の採用率だけを動かし、医学が効くことと医学アカデミーの 0.15 は残す。以下の節にある「反証」「部分支持」は、資料がこの決定のどこに立つかを示すラベルである。その資料が決定の出所だ、という意味ではない。

## 中核規則は Medicine を非魔法の手続きとして残す

開いて確認された一次は、SRD 5.1、SRD 5.2.1、その変換ガイド、Sage Advice Compendium v2.7（2021）、3.5 の OGL SRD である。Player's Handbook 本文、Dungeon Master's Guide 本文、*Xanathar's Guide to Everything*、AD&D、BECMI の書籍は開かれていない。未確認は未確認のまま残す。

**Wisdom (Medicine) は呪文を要求しない。** SRD 5.1 は “A Wisdom (Medicine) check lets you try to stabilize a dying companion or diagnose an illness.” と書き、安定化は 0 hit points への first aid で、DC 10 の成功である。安定した生き物は death saving throw をしないが意識は戻らず、治癒がなければ **1d4 時間後に 1 hit point** である（一次、[SRD 5.1](https://media.wizards.com/2016/downloads/DND/SRD-OGL_V5.1.pdf)）。SRD 5.2.1 の例は “Diagnose an illness, or determine what killed the recently slain.” で、Help による安定化も同じく DC 10 である。Medicine 判定で Hit Points を大きく戻す、とは書かれていない。戻るのは放置された Stable の 1 点、Short Rest と Long Rest、または別枠の魔法である（一次、[SRD 5.2.1](https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf)）。診断の DC は技能文では固定されず、固定されている Medicine の DC は安定化と、5.2.1 の非致死殴打への first aid の 10 だけである。

**Healer's Kit は判定を不要にする非魔法の道具である。** 5.1 でも 5.2.1 でも 10 回使いで、1 回分を使えば Wisdom (Medicine) なしに 0 hit points を安定化する（一次、同じ二つの SRD）。Sage Advice Compendium v2.7 は公式解説であり規則本文ではないが、magic item の使用は Use an Object に含まれず、対照として “using a nonmagical item, such as a healer’s kit, is in the domain of Use an Object” と書く（[Sage Advice Compendium v2.7](https://media.wizards.com/2021/dnd/downloads/SA-Compendium.pdf)）。技能文自体は Medicine を魔法とも非魔法ともラベルしない。キットを nonmagical と呼ぶ designer article は、この 2021 年の解説以外にはノートの範囲で見つかっていない。

**Herbalism Kit は実技で、2024 の治癒薬は術者を要求しない。** 5.1 では薬草の同定と適用に習熟を足し、antitoxin と potions of healing の作成に習熟が要る。5.2.1 の Utilize は植物の同定（DC 10）で、Craft に Antitoxin、Healer's Kit、Potion of Healing がある。非魔法品の作成は工具習熟、価格の半分の材料、価格 GP÷10 日で “you make the item” である。Potion of Healing の個別醸造は、Herbalism Kit に習熟した者がその kit と **25 GP** の材料で 1 日（8 時間）に 1 本作り、**spell slot も呪文も条件に出ない**。完成品の装備欄は “This potion is a magic item.” で、Common は **2d4+2** Hit Points である（一次、[SRD 5.2.1](https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf)）。5.1 の common 行は抽出で確定していないので、ここには書かない。Antitoxin は毒へのセーブを有利にする消耗品で、魔法の解除ではない。

魔法なしでできることは、安定化、診断、死因の判断、毒への一時的な有利、特定の病への非魔法の軟膏、自然回復を待つ休息である。魔法なしで規則が渡していないことは、Cure Wounds のような瞬間の大量回復、条件の即時解除、蘇生である。SRD 5.1 の Cure Wounds は 1d8＋能力修正、Lesser Restoration は disease 一つまたは blinded、deafened、paralyzed、poisoned の一つを終わらせ、Heal は盲目・聴覚喪失と any diseases を終わらせる。Raise Dead は nonmagical diseases を治し、magical diseases は先に除かなければ蘇生後に発効する（一次、[SRD 5.1](https://media.wizards.com/2016/downloads/DND/SRD-OGL_V5.1.pdf)）。5.2.1 では Lesser Restoration と Heal と Raise Dead の抽出本文から disease が落ち、Heal は **70 Hit Points** と Blinded、Deafened、Poisoned である。Spare the Dying は 0 hit points を Stable にする cantrip で、Medicine と同じ安定化を魔法側にも置いている。短休息の Hit Point Dice に Healer's Kit も Medicine も要らない。Healer feat の利益本文はどちらの SRD にも無く、記憶で補わない。

3.5 の Heal も呪文を要求しない。DC は first aid、long-term care、棘傷が 15、毒と病気はそれぞれの save DC である。応急は負の hit points からの喪失を止めるだけで **hit points を戻さない**。長期看護の成功は、通常の自然回復を **2 倍**にする。healer's kit（50 gp、10 回）は 5e と違い判定を置き換えず、**+2 circumstance** である（一次、[d20srd.org Heal](http://www.d20srd.org/srd/skills/heal.htm)、[goods and services](http://www.d20srd.org/srd/equipment/goodsAndServices.htm)）。cure 系呪文のダイスはこのノートでは未参照なので書かない。分かれていること自体は、Heal が安定化と自然回復の加速であり、瞬間の魔法的回復ではない、という書き方から言える。

Knowledge は経験知を迷信の枠に入れない。3.5 は Knowledge を “a study of some body of lore, possibly an academic or even scientific discipline” とし、例に arcana、architecture and engineering、nature、religion がある。失敗は再挑戦できず、「知らない」ことであり、信念が虚偽だという判定結果ではない。未修得は common knowledge（DC 10 以下）に限られる（一次、[d20srd.org Knowledge](http://www.d20srd.org/srd/skills/knowledge.htm)）。5.1 の Arcana、Nature、Religion、Investigation は lore の想起か手がかりからの推論で、Investigation の例には傷の外見から武器を見分ける、という魔法を使わない観察がある（一次、[SRD 5.1](https://media.wizards.com/2016/downloads/DND/SRD-OGL_V5.1.pdf)）。5.2.1 では Medicine は Search、Arcana と Investigation と Nature と Religion は Study で、偽情報を思い出す失敗モードは定義されていない。Religion と Arcana が実在する神と魔法の lore なのは、設定で神と魔法が実在するからで、Nature や Investigation を迷信に入れる書き方にはなっていない。「民間の誤りを思い出す」卓処理を SRD が禁止しているわけでもなく、そこは未定義である。

任意規則は、むしろ非魔法の手続きを残す。5.1 の Sight Rot は lesser restoration や heal まで戻らない一方、herbalism kit の習熟者が Eyebright から軟膏を作り、**3 服で病気自体が治る**（一次、[SRD 5.1](https://media.wizards.com/2016/downloads/DND/SRD-OGL_V5.1.pdf)）。5.2.1 は病気を magical contagion に改名し、“Alchemists, potion brewers, and areas of wild magic are credited with creating the first magical contagions.” と書く。これは「このサンプルは魔法・錬金の事故として扱え」であり、「医療は迷信」ではない。Sight Rot は Heal か Lesser Restoration で即座に終わり、同時に Herbalism Kit の **nonmagical ointment** を 72 時間分塗っても終わる。Cackle Fever の項目に呪文名は無く、Long Rest のセーブ 3 成功で終わる。Sewer Plague は長休息と Hit Dice を壊し、夜明けの Constitution で Exhaustion を増減させる（一次、[SRD 5.2.1](https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf)）。*Xanathar's Guide to Everything* の Healer's Kit Dependency と、2014 Dungeon Master's Guide の Lingering Injuries は、書名としては広く知られているが両書は開かれておらず、二つの SRD の検索では条文が無い。ページは書かない。未確認のまま残す。

中核規則に「医学はいかさま」と書く文は、探した範囲には無かった。SRD 5.2.1 の全文で superstition、charlatan、physician、natural philosophy、lingering injury は 0 件で、science の唯一の見かけは conscience の部分文字列である。SRD 5.1 の charlatan も 0 件で、2014 PHB の Charlatan 背景が SRD にあるとは確認できなかった。仮にあっても、身分を偽る背景であって医学否定の規則だ、と断定するには PHB を開く必要がある。3.5 の masterwork は “exceptional craftsmanship, not through being magical” である（一次、[d20srd.org Craft](http://www.d20srd.org/srd/skills/craft.htm)）。Craft (alchemy) だけは “You must be a spellcaster to craft any of these items.” と製造ゲートに術者性を要求する。酸や antitoxin の効果は、作ったあとに追加の呪文を要するという記述ではなく、製品が幻想だとも書かれない。前科学的な誤りに一番近い機械はこのゲートであり、それでも誤り扱いではない。5.2.1 は逆に、magic item である Potion of Healing を呪文なしの薬草作業日で作れる。

AD&D の Healing と Herbalism の非武器習熟、BECMI と Rules Cyclopedia の自然回復、4e の healing surge の個数は未確認である。Wikipedia は cleric を 1974 年からある強力な healer とし、起源を吸血鬼狩りの聖職者に置くが、医師が詐欺だという規則ではない、と二次情報で書くだけである（[Cleric (Dungeons & Dragons)](https://en.wikipedia.org/wiki/Cleric_(Dungeons_%26_Dragons))）。4e の “healing surges” の一文には citation needed が付く。僧侶が治癒魔法を持つことと、医師や自然哲学を迷信として置き換えたこととは、開いた一次の範囲では繋がっていない。

## 出版設定は、世俗の治療や工学を制度として残す

設定本の逐語は、Keith Baker のブログと、Wikipedia がリードで要約した範囲に限られる。Forgotten Realms Wiki 以下は、脚注があっても出版社本文の転写ではないのでウィキ要約である。Baker のブログは設定本と分ける。各設定が医学と工学をどこに置いているかは、次のとおりである。

| 設定 | 判定 | 一行 |
| --- | --- | --- |
| Forgotten Realms | 反証 | Waterdeep の医師・薬種ギルドは裕福な職能で、神殿は治癒を独占しない。Spellplague は魔法災害であり、医学が偽である証拠ではない。ウィキ要約 |
| Eberron | 反証 | 列車・飛空船・機械生命は魔法で動く技術。Baker は秘術を教えられる科学とし、日常診療を Heal の世俗サービスとする。医師という職名の設定本逐語は未確認 |
| Dragonlance | 混在 | clerical magic は Cataclysm 後 300 年以上消えた、とウィキが書く。ノーム工学は失敗の多い実在の機械工。世俗医学が空白を埋めた、とも薬草が効いた、とも未記載 |
| Dark Sun | 混在 | 秘術は生態を壊す実在の危険。医学の社会的地位は未記載。「医学は迷信」の文は無い。life-shaping は科学的理解から手順の暗記へ落ちた、とウィキが書く |
| Greyhawk | 反証は技術に限る | *Expedition to the Barrier Peaks*（1980）の宇宙船技術は作動し、病死は魔法の比喩に還元されていない。中世医学の社会的評価は未見 |
| Spelljammer | 混在 | Wikipedia は “fantastic (as opposed to scientific)” な宇宙と書く。spelljamming はその代わりに学ぶ魔法技術であり、否定された迷信ではない |
| Ravenloft | 未確認 | 取得したリードに医師・外科・科学・迷信は無い。Van Richten と Lamordia の解剖は開いていない。判定を付けない |
| Gygax の中世医学論 | 未確認 | 依頼された論説は見つかっていない。確認できた記録は Barrier Peaks で、科学技術を迷信にしていない |

Forgotten Realms の反証はウィキ要約に載る制度である。Guild of Apothecaries and Physicians は登録ギルドで、本部は House of Healing、入会金 50 gp、年会費 10 gp、診察 1 gp、薬瓶はおおむね 1–8 gp、緊急の手当は 1 日 10–20 gp、とウィキが *Waterdeep and the North* p. 39 ほかに拠らせる。医師は発熱と毒を抑え、薬は本治癒までの時間を買う、と活動が要約される。ギルドは無免許医療を禁じ、対象に cleric を含めようとして Lords of Waterdeep に抵抗された。医学は蔑まれた迷信ではなく、政治的で裕福な職能である（ウィキ要約、[Guild of Apothecaries and Physicians](https://forgottenrealms.fandom.com/wiki/Guild_of_Apothecaries_and_Physicians)）。料金と権限の設定本逐語、および刊行年は未確認である。Spellplague は Mystra の死と Weave の崩壊で、医師が扱う伝染病としては書かれていない（ウィキ要約、[Spellplague](https://forgottenrealms.fandom.com/wiki/Spellplague)）。ゲーム内の処方書はキャンペーン設定本ではない。

Eberron の出版紹介は、魔法で動く非伝統的技術を置く。*Eberron Campaign Setting* ハードカバーは **2004 年 6 月**である（二次情報、[Eberron](https://en.wikipedia.org/wiki/Eberron)）。House Jorasco のウィキは、払える者に世俗と魔法の両方の治療を提供し、構成員に herbalist、alchemist、physician が含まれる、と書くが、この段落に脚注は無い。医師を含む文を *Rising from the Last War* p. 43 の逐語とみなしてはならない（ウィキ要約、[House Jorasco](https://eberron.fandom.com/wiki/House_Jorasco)）。設定の知識の地位に直接当たるのはデザイナー解説である。Keith Baker は 2013-10-14 に “They don't go to Jorasco for magic; they go there for the mundane services of the Heal skill.” と書き、即時魔法は払える者向けで、ほとんどの人はそれを必要としない、とする。平均的な神殿の司祭は expert で魔法を使わない、とも書く。「Dol Dorn の cleric は Cure Disease の儀式を学べない」は “in my campaign” でありハウスルールである（デザイナー解説、[JorascoCare and the Mark of Snails](https://keith-baker.com/dragonmarks-jorascocare-and-the-mark-of-snails/)）。2020-12-05 には “The idea that arcane magic is a form of science is a fundamental principle of the Eberron campaign setting.” と書く（デザイナー解説、[Arcane Science](https://keith-baker.com/dm-arcane-science/)）。*Exploring Eberron* からの逐語かどうかは、この取得では切れていない。定式は「科学が迷信」ではなく「魔法が科学」である。魔法が技術であることは、医学を偽にしない。2004 年と 2019 年の設定本からの短い逐語は未取得である。

Dragonlance では、神授の clerical magic が地上から消えた時代がウィキに書かれる。Cataclysm 項は “clerical magic also disappeared from Krynn until the War of the Lance, over three centuries later” と置くが、この文の脚注は取得範囲に無く、同じ事実は *Dragonlance Campaign Setting* pp. 95–99 に寄せられる（ウィキ要約、[Clerical Magic](https://dragonlance.fandom.com/wiki/Clerical_Magic)、[Cataclysm](https://dragonlance.fandom.com/wiki/Cataclysm)）。その空白を世俗医学が埋めた、とはノートは書いていない。Mount Nevermind のノームは、蒸気と歯車の発明がしばしば爆発し、安定して動く発明者は狂人扱いされる、実在の tinker である。迷信ではなく、信頼できない実技である（ウィキ要約、[Gnome](https://dragonlance.fandom.com/wiki/Gnome)）。工学については反証、医学については支持する文が無い。

Dark Sun では、秘術は生態を灰にする実在の危険で、Defiler は発覚すれば処刑されうる（ウィキ要約、[Defiler](https://darksun.fandom.com/wiki/Defiler)）。Wikipedia は神々がおらず、1991 年のボックスが第2版向けだ、とリードで要約する。医学への言及はその抜粋に無い（二次情報、[Dark Sun](https://en.wikipedia.org/wiki/Dark_Sun)）。ウィキ検索の healer 系ヒットは Rhul-thaun の 1 件だけで、不在の証明ではない。そこでは “Procedures once understood scientifically were reduced to memorized sequences of actions, chants, observations, and rituals.” とウィキが載せる。ref 名は見えるが頁は未確認で、同頁の別文が付ける *Windriders of the Jagged Cliffs* pp. 8–11 をこの文に付けてはならない（ウィキ要約、[Rhul-thaun](https://darksun.fandom.com/wiki/Rhul-thaun)）。これは魔法が科学を迷信にした例ではなく、失われた理論が手順として残った例としてウィキが書く。

Greyhawk で確認できたのは Gary Gygax の *Expedition to the Barrier Peaks*（AD&D 第1版、**1980** 年。原型は 1976 年のコンベンション）で、墜落した宇宙船の技術が機能し、乗員は特定されない病で死んでいる、という Wikipedia の要約である。science fantasy と分類され、社会が科学を迷信と呼ぶとは書かれていない（二次情報、[Expedition to the Barrier Peaks](https://en.wikipedia.org/wiki/Expedition_to_the_Barrier_Peaks)）。Spelljammer のリードは “a fantastic (as opposed to scientific) outer space environment” と言い、同時に spelljamming helm による航海を実地の知識として置く（二次情報、[Spelljammer](https://en.wikipedia.org/wiki/Spelljammer)）。第2版の年は抜粋に無かったので書かない。自然哲学が近代科学の名では採られない、と読めても、魔法技術が迷信として否定されているわけではない。Ravenloft は 1990 年の *Ravenloft: Realm of Terror* で始まる、とリードが書くだけで、医学の固有立場は主張できない（二次情報、[Ravenloft](https://en.wikipedia.org/wiki/Ravenloft)）。Gygax がクレリックの治癒と中世医学をどう並べたかは、英語 Wikipedia とウィキクォートの検索では医学論が見つからず未確認である。確認できた範囲の 1980 年のモジュールは、「魔法がある世界では科学技術は迷信」を採っていない。

これらの設定が繰り返すのは、魔法が速い、高い、または神頼みで、その外側に遅い実務がある、という階層である。「魔法があるので実務は偽」ではない。Spellplague、defiling、Cataclysm 後の神授魔法の消失は、魔法災害、生態破壊、神の撤退であり、医師の知識が迷信だという社会描写ではない。

## 物語作品は、薬草と外科を魔法の隣に残す

指定 9 作に『鋼の錬金術師』を加えた 10 作が、医学と経験知をどこに置いているかを、調査ノートのラベルのまま書く。ラベルは決定との距離であり、作品が決定の根拠だという意味ではない。原書の長い本文は再現されていない。ファンダムと Coppermind は二次情報である。

**Tolkien, *The Lord of the Rings*（『指輪物語』）は反証である。** ミナス・ティリスの Houses of Healing は infirmary で、Warden、Ioreth、herb-master がいる。Wikiquote は “The hands of the king are the hands of a healer, and so the rightful king shall be known.” を "The Houses of Healing" に置く。話者名はそこには無く、Ioreth の願いだとするのは Tolkien Gateway の二次情報である（[Wikiquote](https://en.wikiquote.org/wiki/The_Return_of_the_King)、[Houses of Healing](https://tolkiengateway.net/wiki/Houses_of_Healing)）。athelas は傷・毒・黒息に効く薬草で、王の手において特別な力を持ち、ゴンドールでは王不在のために香りと頭痛止めへ狭まった、と Gateway が要約する。薬草医療の否定ではなく、上位の用法が制度の側で狭まった、という記述である（ウィキ要約、[Athelas](https://tolkiengateway.net/wiki/Athelas)）。Elrond を本文が "master of healing" と呼ぶ話者は未確認で、CBR の帰属は他の要約と衝突するため引用根拠にしない。療養院は尊重され、王の癒しはそれに代わる迷信認定ではない。

**Ursula K. Le Guin, Earthsea（『ゲド戦記』。第1作の言語リンクは『影との戦い』）は部分支持である。** Wikipedia は Master Herbal を "versed in healing" とし、初期長編のことわざ “weak as a woman's magic, wicked as a woman's magic.” を載せる（二次情報、[Earthsea](https://en.wikipedia.org/wiki/Earthsea_(universe))）。ことわざの頁を *A Wizard of Earthsea* p. 5 に帰すのは学術 PDF の二次情報である（[Concentric](http://www.concentric-literature.url.tw/issues/Violence/7.pdf)）。村の女の薬草まじないは下位の魔法として軽蔑され、虚偽の科学として廃棄されるとは書かれていない。Roke の癒しは尊重される学科である。独立した自然学・外科の学部は、この調査の範囲では確認できない。薬草が具体的に効く場面の原文は未引用である。

**Robert Jordan, *The Wheel of Time*（『時の車輪』）は部分支持である。** Yellow Ajah の伝統的 Healing は、小さな傷を消し大きな傷を数秒で閉じるが、失った四肢は戻さず、重傷では患者の体力を使い果たして治療が患者を殺しうる、とファンダムが要約する。Wisdom は村の薬草の healer で、Women's Circle の指導者であり、saidar に敏感でない者もいる。Nynaeve は Emond's Field の前 Wisdom である（ウィキ要約、[Healing](https://wot.fandom.com/wiki/Healing)、[Wisdom](https://wot.fandom.com/wiki/Wisdom)）。Aes Sedai が薬草を迷信と呼ぶ短い引用は、この二項目では確認できなかった。未確認のまま残す。魔法の専門職があっても、薬草の権威と魔法の限界が残る。

**George R.R. Martin, *A Song of Ice and Fire*（『氷と炎の歌』）は反証であり、主張の逆に近い。** maester は scholars, healers, messengers, and scientists の結社で、銀の輪が medicine, healing, and the functions of the body、ヴァリリア鋼の輪が higher mysteries である。後者は百人に一人で、魔法はかつて強大だったが今は "last ember" だと言う者がおり、高等神秘を試す者はいつも失敗する、とウィキが書く。生体解剖は鎖の剥奪になりうる。灰鱗病では maester の石灰・湿布・熱湯が進行を止めると言われ、septon の祈り・犠牲・断食が cure だと主張される（ウィキ要約、章注付き。原書の一文は未引用、[Maesters](https://awoiaf.westeros.org/index.php/Maesters)、[Greyscale](https://awoiaf.westeros.org/index.php/Greyscale)）。迷信の位置に置かれるのは祈りと、学寮がほぼ死んだと見る魔法であって、医学ではない。低魔法であり、(A) の「奇跡は通常医療を置換しない」よりさらに、疑われるのが魔法の側である。

**Andrzej Sapkowski, *The Witcher*（『ウィッチャー』）は反証である。** *The Lady of the Lake* の Brenna で、halfling の field surgeon である Milo Vanderbeck は、魔術師 Marti Södergren と同じ野戦病院で、身分にかかわらず机の上の者を縫う。ウィキが省略つきで掲げる英語は “Before God we are all equally wise-and equally foolish.” と、解剖の口伝 “Red to red, yellow to yellow, white to white. Sew like that and it's sure to be fine.” である（ウィキ要約、[Milo Vanderbeck](https://witcher.fandom.com/wiki/Milo_Vanderbeck)）。一年後、彼は治療法のない Catriona 疫病を看病して感染死する。魔術師は外科を廃しない。農民が誰を迷信と呼ぶかの短い引用は未確認である。

**J.K. Rowling, *Harry Potter*（『ハリー・ポッター』）は部分支持で、この 10 作では社会的軽蔑が最も主張に近い。** St Mungo's は魔法病院で、Healers が Healing magic を行う、とウィキが書く。同じ項目が対話として掲げるのは、Harry「Are they doctors?」に対する Ron「Doctors? Those Muggle nutters who cut people up? Nah, they're Healers.」である。ページはゲーム由来の記述を含むと警告しており、二次情報のまま扱う（[St Mungo's](https://harrypotter.fandom.com/wiki/St_Mungo%27s_Hospital_for_Magical_Maladies_and_Injuries)）。1995 年 12 月、Nagini に咬まれた Arthur Weasley に研修 Healer の Pye が stitches を試して失敗するのは、魔法の毒に対する縫合の失敗であり、「マグル医学はすべて虚偽」ではない。Arthur 側はマグルの技法を試す側である。Arthur のマグル技術への憧憬の逐語は未確認である。無知と軽蔑であり、虚偽の証明ではない。(C) の存在論的否定には落ちない。

**Terry Pratchett, Discworld（『ディスクワールド』）は反証である。** Unseen University は怠惰な魔法大学で、*The Science of Discworld*（1999）は Pratchett と科学研究者 Ian Stewart、Jack Cohen の共著として、物語と真面目な科学解説を交替させる（二次情報、[Unseen University](https://en.wikipedia.org/wiki/Unseen_University)、[The Science of Discworld](https://en.wikipedia.org/wiki/The_Science_of_Discworld)）。Igor は移植外科に長け、緊急手術を報酬なしでし、余暇に電気を使う。標語は “A spare hand where needed” である（ウィキ要約、[Igor](https://wiki.lspace.org/Igor)）。魔法が働いても、Roundworld の科学は解説として本気で書かれ、外科は縫って働く。

**Patrick Rothfuss, *The Name of the Wind* は反証だが、細部は未確認である。** 英語版 Wikipedia に日本語題の言語リンクは無く、定訳は未確認なので訳題は置かない。Medica は University の主要な履修部門で、Master Physicker の Arwyl が預かり、medicine、anatomy、知られている範囲の surgery を研究する。来た者は拒まず、当番の Re'lar が治療する。項目自身が情報不足と断っている（ウィキ要約、[Medica](https://kingkiller.fandom.com/wiki/Medica)）。sympathy を医局が使うか拒むかは未確認である。確認できるのは、魔法を教える同じ University の中で医学が正規部門だ、ということだけである。

**Brandon Sanderson, *The Stormlight Archive*（起点は *The Way of Kings*）は反証である。** 日本語題の言語リンクはノートに無いので訳題は置かない。Lirin は Hearthstone の surgeon で、Coppermind が同書への注付きで掲げる台詞は “The children of the men and women whose lives we save. That's who tells stories of surgeons.” である。注の章名は未確認。町の人は学知を気味悪がるが仕事は尊重し、奇跡を期待して果たせないと怒る。一部の Radiant が他人を癒せると知った Lirin は、外科が obsolete だと感じて塞ぎ込んだ、と Coppermind が書く。Kaladin が力の限界を説明すると、Lirin は Urithiru の医療と Kharbranth の新しい器具に興奮し、外科は消えない（二次情報、[Lirin](https://coppermind.net/wiki/Lirin)）。これは「魔法が外科を陳腐化する」という恐れが一度現れ、限界の説明で解ける場面であり、(C) の定着した信念ではない。fabrial は光と spren の装置で、Coppermind は “fabrial science” と書き、工学として提示する（二次情報、[Fabrial](https://coppermind.net/wiki/Fabrial)）。Herdaz が外科を迷信視する、という記述は Lirin の項に見当たらず未確認である。

**Hiromu Arakawa, *Fullmetal Alchemist*（『鋼の錬金術師』）は反証である。** Wikipedia は、錬金術が広く行われる科学である世界で、人体錬成の失敗が四肢と体の喪失になる、と要約し、意匠はヨーロッパの産業革命期が主だとする（二次情報、[Fullmetal Alchemist](https://en.wikipedia.org/wiki/Fullmetal_Alchemist)）。Automail は神経系に直結する動力義肢で、装着に機械工学と外科の両方が要り、回復と操作の習得は平均約三年とされる（ウィキ要約、[Automail](https://fma.fandom.com/wiki/Automail)）。OVA に帰される由来は漫画本編の根拠にしない。錬金術は作中で科学であり、その身体的失敗のあとを外科と工学が引き受ける。

この 10 作で魔法の治療が尊重されるときでも、薬草・外科・解剖は隣に残る。逆転に一番近い社会的軽蔑は Ron の外科への罵倒と、Earthsea 初期の女の魔法へのことわざである。どちらも、経験知が効かないという叙述にはなっていない。Sanderson の陳腐化の恐れは、限界を聞いたあと外科が残る方向へ解ける。「魔法が実在する」ことと「経験的技術が迷信になる」ことは、これらの作者の選択としては別問題で、魔法はしばしば薬草・外科・機械の隣に追加される。

## Glorantha が最も近いが、治療神は残り需要半減は描かれない

認識論ノートの支持条件は、自然や身体の体系的・経験的研究が作中で虚偽・異端・迷信として分類されることである。反例は、魔法と経験的医学・工学の両立、または魔法そのものが科学として研究されることである。威信の差だけでは部分支持にとどまる。「奇跡が本物なら人は医学を捨てるか」に答える刊行エッセイは、Gygax、Le Guin、Tolkien の書簡、Pratchett、Sanderson のいずれも、一次引用できる形では取れていない。Sanderson の法則は魔法体系の設計論であり、この主張には引き伸ばさない、とノートは明示する。Earthsea と Discworld と Stormlight の作品内描写は前節にあり、作者エッセイの不在を作品判定で埋めない。

**Glorantha が最も近いが、(C) ではない。** Chaosium の設定解説は、太陽が Gates of Dawn から出て Sky Dome を渡ることを比喩ではなく世界の仕組みとして書き、神々は実在し、最も進んだ人間文化は青銅器時代から初期鉄器時代相当で鉄を除く、とする。God Learners は magical philosophers として神話を体系化し、絶滅して憎まれるが、仕事の影響は後世に残る（[What is Glorantha?](https://wellofdaliath.chaosium.com/home/gloranthan-documents/glorantha/)）。Greg Sez の但し書きは、species や gravity のような、Glorantha の意識の外にある概念を不適切な語として使うのであり、その語用が世界内で概念が使われていることを意味してはならない、とノートが要約する。稿が現行設定と矛盾しうると同頁が断る。重力のような世俗科学の基礎概念が世界内意識の外にある、という一次に近い記述である（[Greg Sez](https://wellofdaliath.chaosium.com/home/gloranthan-documents/greg-sez/)）。英語 Wikipedia は、God Learners を Joseph Campbell の monomyth の含意を試す演習だと要約する。これは二次情報である（[Glorantha](https://en.wikipedia.org/wiki/Glorantha)）。

Jeff Richard（2021-06-25）は、God Learners が神々を知られうる一体に配列し、God Time を再構成して意志を押しつけようとした、と Glorantha Sourcebook の一節を引き、敷衍して、合理主義者としての道具は有用で総合は機能した、誤りは意志と理性でその形を乗り越え宇宙を作り替えられると信じたことだ、と書く。自然が反撃し、God Learners と Middle Sea Empire を砕いた。これは Stafford の署名文ではなく、刊行本の抜粋を現デザイナーが解説したものである（デザイナー解説、[The Mythical Synthesis Movement](https://wellofdaliath.chaosium.com/the-mythical-synthesis-movement/)）。2025-06-25 の記事と、Stephen R. Marsh のコメント（Hero Plane で代償の支払いを避け、崩壊時に一括で払わされた）は、共同作業者のブログであり Stafford の刊行引用ではない（[How The God Learners Learned About The Gods](https://wellofdaliath.chaosium.com/how-the-god-learners-learned-about-the-gods/)）。

(C) から外れる点が二つある。第一に、誤りとされるのは神話を無視した普遍的・世俗的な統合理論であり、経験的な手当てそのものではない。Richard は総合そのものが機能したと書く。第二に、治療は消えていない。Chalana Arroy は Healing の女神で、息子 Arroin は Healing Arts の神として Cults of Prax（1978）以降の書誌に載る。索引頁は「魔法を失ったので無魔法の外科・薬草で治す」という本文までは載せていない（[Chalana Arroy](https://wellofdaliath.chaosium.com/home/gloranthan-documents/prosopaedia/deities/c/chalana-arroy/)、[Arroin](https://wellofdaliath.chaosium.com/home/gloranthan-documents/prosopaedia/deities/c/chalana-arroy/arroin/)）。RuneQuest の First Aid の現行規則文は未確認である。Glorantha の失敗は稀な治癒者の統計ではなく、神話領域の操作の代償である。部分支持にしてよいのは「世俗の普遍自然科学はカテゴリとして世界に合わない」までである。

**Warhammer Fantasy は反例である。** Lexicanum は Imperial Engineers School を、錬金術と機械を研究し戦争機械を設計する、皇帝が後援する学院とする。職員に錬金術師、天文学者、生物学者、機械工が混ざる。Gold Order への反感は White Dwarf 296 p. 54 として引かれ、制度間の敵対であり工学の存在論的否定ではない。原書は未確認で、出典付き wiki である（[Imperial Engineers School](https://whfb.lexicanum.com/wiki/Imperial_Engineers_School)）。Colleges of Magic は Teclis が Magnus the Pious の求めで **2304 IC** に設立し、学院の外の魔法は最も苦痛な死に値する犯罪だった、と Lexicanum が軍書の頁を挙げて書く。歴史の順序は「魔法が犯罪で、後に公認学問になる」であり、主張の逆である。魔女狩人の引用は、免許された学院を魔女の別名として焼き払え、と言う。疑われるのは魔法の側である。原書未確認（[Colleges of Magic](https://whfb.lexicanum.com/wiki/Colleges_of_Magic)）。Shallya の神殿は病人・負傷者・死にゆく者の場所で、同記事は Shallya が Wood Elf の薬草師の伝承を学びに行った、と書く。これは wiki の文で、Herbalist 項の規則書は直接見ていない。世俗の Physician ギルド本文は未確認である（[Shallya](https://whfb.lexicanum.com/wiki/Shallya)）。(B) の威信差に見えても、方向はしばしば「魔法が疑わしい」であり、「医学が迷信」ではない。

**魔法を学問にする作品は主張の逆である。** 『魔法科高校の劣等生』について英語 Wikipedia は、魔法が現代技術で洗練され、遺伝で限られ、達也が Four Leaves Technology を通じて魔法技術を商品化した、と要約する。原書の定義文は開いていない（二次情報、[The Irregular at Magic High School](https://en.wikipedia.org/wiki/The_Irregular_at_Magic_High_School)）。日本語 Wikipedia は出典不十分（2022年6月）かつ作中視点だと自己申告したうえで、CAD、現代魔法と古式魔法、魔法工学、後年の理論の提唱を書く。出典の弱い二次情報としてのみ使う（[魔法科高校の劣等生](https://ja.wikipedia.org/wiki/%E9%AD%94%E6%B3%95%E7%A7%91%E9%AB%98%E6%A0%A1%E3%81%AE%E5%8A%A3%E7%AD%89%E7%94%9F)）。『とある魔術の禁書目録』では、科学サイドの超能力とオーバーテクノロジーが実在し、学園都市の一般住人は基本的に魔術の存在を知らない、と日本語 Wikipedia が要約する。一般人はむしろ魔術を知らない。原書の巻・頁は未確認である（二次情報、[とある魔術の禁書目録](https://ja.wikipedia.org/wiki/%E3%81%A8%E3%81%82%E3%82%8B%E9%AD%94%E8%A1%93%E3%81%AE%E7%A6%81%E6%9B%B8%E7%9B%AE%E9%8C%B2)）。

**Jonathan Strange & Mr Norrell は (A) に近く、反例である。** 2004 年刊。ヨークの Learned Society of York Magicians は実演できない理論家の集団で、Norrell が実演して解散させる。魔法は対ナポレオン戦争に使われ、Strange は道路を作り町を動かすが、ジョージ3世の狂気は治せなかった、と英語 Wikipedia が要約する。医学が迷信になったとは書かれない。医師が併走する原書頁は未確認である（二次情報、[Jonathan Strange & Mr Norrell](https://en.wikipedia.org/wiki/Jonathan_Strange_%26_Mr_Norrell)）。**The Magicians も (A) に近く、反例に近い。** Brakebills は魔法を古い言語と手の位置として教え、卒業後のマンハッタンと、魔法を捨てたあとの事務職が残る。世俗の病院・医師の診療場面はこのあらすじに無い。未確認であり、秘密の学院が世俗知を迷信に再分類した、とは書けない（二次情報、[The Magicians](https://en.wikipedia.org/wiki/The_Magicians_(Grossman_novel))）。

**Conan は別軸の反例である。** Wikiquote が "Beyond the Black River"（1935）の下に置く “Barbarism is the natural state of mankind. Civilization is unnatural. It is a whim of circumstance. And barbarism must always ultimately triumph.” は、文明が不自然で最終的に蛮族が勝つ、という価値の軸である。直後の “There's nothing in the universe cold steel won't cut” は、悪魔に斧が効かなかった文脈では外れか枝の偏向かもしれない、とノートが注記する。魔術師の確執を嫌う抜粋は、魔術の実在と、きれいな剣を選ぶ実務の選好が同居する。物語名の見出し対応は一語ずつ固定されていない。1929 年の書簡は、文明を自然で不可避な結果だとする。1935 年の作中文と評価は一致せず、どちらも経験知の虚偽化ではない（[Robert E. Howard](https://en.wikiquote.org/wiki/Robert_E._Howard)）。英語 Wikipedia が Conan の父を鍛冶屋とするのは二次情報である（[Conan the Barbarian](https://en.wikipedia.org/wiki/Conan_the_Barbarian)）。

**十二国記の医学制度、ロードスの医師置換、ベルセルクの医師は未確認のまま残す。** 『十二国記』では麒麟と妖魔が実在し、雁国では壊れた漉水の堤が謀反の名目になる。超自然の王権と、堤防という経験的土木が同じ政治にある、と日本語 Wikipedia が要約する。記事から医師・医学の制度は確認できなかった。不在の証明ではない。治水は反例（土木）に近く、(C) の証拠ではなく、医学需要の半減は読めない（二次情報、[十二国記](https://ja.wikipedia.org/wiki/%E5%8D%81%E4%BA%8C%E5%9B%BD%E8%A8%98)）。『ロードス島戦記』ではファリスの神官エト、マーファの司祭ニース、魔術師と賢者の学院が記事にあり、「治療」は外伝側のアニスがチャ・ザ神殿でキュアウーンズ以外をろくに修行していなかった、という一箇所だけである。司祭が医師を社会的に置換するかは、この記事からは言えない。小説本文は未参照である（二次情報、[ロードス島戦記](https://ja.wikipedia.org/wiki/%E3%83%AD%E3%83%BC%E3%83%89%E3%82%B9%E5%B3%B6%E6%88%A6%E8%A8%98)）。『ベルセルク』では Rickert が鍛冶と工学で Cannon Arm を組み、蝕のあと Guts と Casca を回復させようとした、とウィキが書く。使徒と星界は実在する。医師という職業が迷信だという記述はこの記事に無く、ファルネーゼ側の医学も未確認である。鍛冶は工学の反例として置ける。漫画の頁は開いていない（ウィキ要約、[Rickert](https://berserk.fandom.com/wiki/Rickert)）。

**0.05% の奇跡行使者がいるだけで医学需要と自然哲学の採用率が半減する、という人口メカニズムを描いた作品は、今回の資料にはない。** Glorantha の失敗もその統計ではない。有名作が繰り返すのは (A)、魔法と経験知の両立、魔法自体の科学化のいずれかである。

## 決定の隣に、資料がどこに立つか

決定は設計者のものである。下の表は、資料がその決定と同じ位置にいるかを示す。別の位置にあることは、決定が資料の誤読であるという意味ではない。

| 層 | 決定に近い資料 | 決定と別の位置にある資料 |
| --- | --- | --- |
| 文言は (C)。魔法的説明があるので薬種・病院・自然哲学は胡散臭く、0.05% でも rare と common を分けない | Glorantha の狭い部分だけ。gravity のような語は世界内意識の外にあり、神話を操作可能な世俗理論にした God Learners は失敗し憎まれる。ただし総合は機能した、と現デザイナーが書き、Healing の神格は残る | D&D の SRD は Medicine を迷信と呼ばない。Forgotten Realms と Eberron は世俗治療を残す。10 作に (C) の明確な例は無い。0.05% で需要が半減する社会を描いた作品はノートに無い |
| 実装は需要信号と naturalPhilosophy の 0.15 を 1/2 にし、medicine の採用率 0.15 と死亡率は変えない | 「遅い実務は残る」という D&D と物語の併存と、方向だけは近い。知識の地位を下げても、規則上の治癒効果までは消していない | 文言が薬種・病院・自然哲学をまとめて後景に退かせるほど強くない。医学のアカデミー在庫は半減しない。半減の人口メカニズムを作品が描いた証拠は無い |
| D&D の Medicine は非魔法で効く | 5e の安定化・診断、Healer's Kit、Sight Rot の非魔法軟膏、3.5 の応急と倍速の看護、Knowledge が科学的学科でありうること。設定側のギルドと Jorasco の世俗需要 | 文言が医学を虚偽に置くこととは一致しない。ただし Medicine は Hit Points を大きく戻さず、瞬間回復は Cure Wounds や Potion of Healing 側にある。「魔法の方が速く広い」という階層までは、規則と文言が同じ地図を見ている |
| 作品の多数は (A) か (B) | Martin、Strange、Magicians、十二国記の治水は (A) かその境界。Tolkien、Witcher、Pratchett、Rothfuss、Sanderson、鋼の錬金術師は併存の反証。Jordan は (B) に近い部分支持。Warhammer は工学と魔法学院の並立で、疑いが魔法へ向く | (C) を稀少のまま需要半減として実装する強さは、この多数派より広い。部分支持の Rowling と Earthsea も、縫合の失敗を魔法の毒に限り、村の薬草を下位の魔法として残すので、(C) の虚偽認定ではない |

係数の 1/2 と、術者 0.05% でも掛けるという適用は、この資料群の中に同じ人口の仕組みとしては出てこない。D&D の中核規則が置いているのは、魔法と非魔法の併記である。非魔法は狭く遅く、一部の病では軟膏が魔法と並んで足りる。2024 の SRD がサンプル疫病の起源を錬金術師と野生魔法に帰した文は、薬の由来を魔法側に置く点で決定に触れる。同じ章には非魔法の軟膏が残る。

## 資料の限界

証拠が強いのは、開いた一次の範囲に限られる。SRD 5.1、SRD 5.2.1、3.5 の Heal、Craft、Knowledge は、医学と工学を詐欺と呼ばず、呪文なしの安定化・看護・製作を数値つきで残す。Sage Advice は healer's kit を非魔法の道具の例にするが、これは公式解説である。Baker の 2013 年と 2020 年の文は、Eberron について「魔法は科学、日常診療は世俗の Heal」と直接書く。ただしブログは 2004 年の設定本ではなく、2013 年の文は 4e の回復経済の説明を含む。Glorantha について強いのは、神話が作動原理だという Chaosium の設定解説と、重力のような概念が世界内意識の外にあるという Greg Sez の但し書きまでである。0.05% で需要が半減する作品がノートに無い、という不在も、探索範囲の報告としては明示できる。

証拠が言い切れないところは広い。設定の社会描写の大半はウィキ要約で、Waterdeep の料金、Dragonlance の “disappeared”、Dark Sun の scientifically、Warhammer の学院、Brenna の台詞、St Mungo's の対話は、出版社または原書の頁を開いた逐語ではない。ウィキに医師の語が無いことは、ロードス、十二国記、ベルセルク、Ravenloft の不在証明にならない。AD&D の Healing 習熟、*Xanathar's Guide to Everything*、Healer feat、4e の surge、Gygax の中世医学論、作者たちが「奇跡が本物なら医学を捨てるか」と書いたエッセイは未確認である。Medica と sympathy、Herdaz の医療、Arthur Weasley の逐語、灰鱗病の原書の一文も未確認である。日本語 Wikipedia の魔法科は出典不十分と自己申告している。God Learners について使えたのは Greg Sez と、Jeff Richard と Stephen Marsh のブログであり、Stafford 署名の刊行書からの逐語ではない。

係数は死亡率・衛生・コレラ・medicalCare を動かさない。需要信号を半分にしても、身体が治る速度は決定の外側に残る。medicine 領域の採用率は 0.15 のままなので、アカデミー在庫のうえでは医学を自然哲学と同じだけ後景に退かせてはいない。文言、係数、効果を変えない層は、すでに三つの強さである。この報告書が渡すのは、D&D と調べた作品が医学と経験知をどこに置いているか、という一覧である。決定をその一覧に合わせるかどうかは、決定の外側にある。
