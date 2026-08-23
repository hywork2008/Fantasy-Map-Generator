# 近代都市の浄水・下水処理・自治権限設計

## 状態

**設計案（Phase 1–5 実装済み、§8/§12/§13/§14/§15/§16 参照）**。未整備の川沿い Burg が、取水・濾過・消毒・配水と、下水収集・処理・安全な放流を段階的に整備するための設定・実装資料である。

既存の[都市水利・衛生インフラ設計](./urban-water-and-sanitation-system.md)が扱う開放側溝、被覆暗渠、分流、清掃・放流規制を置き換えない。本書はその後段、すなわち「川の水を都市規模で飲料用に安全化する」「汚水を下流へ移すだけでなく処理して放流する」近代的な工程を定義する。

関連設計:

- [都市水利・衛生インフラ設計](./urban-water-and-sanitation-system.md) — 既存の水系分離、Tier 0–5、都市予算・放流権の正本。
- [技術発展・発見ロードマップ](./technology-development-roadmap.md) — `locked → known → demonstrated → adopted → diffused` の技術段階と era 5–6。
- [塩素アルカリ電解の縦切り実装計画](./chlor-alkali-electrolysis-vertical-slice.md) — 既存 `Chlorine` Good の工業的な供給経路。
- [Civil administration の内訳分解と Burg/State 按分](./civil-administration-burg-state-split.md) — 都市自治の財政的な置き場。
- [疫病：上下水道インフラとコレラ](./epidemic-cholera-and-water-security.md) — `burg.waterSecurity` と水系感染症への接続先。

---

## 1. 結論

川沿い都市の近代化は、次の二本の**交わらない流れ**として実装する。

```text
保護された上流取水 → 着水井・沈砂 → 凝集・沈殿 → 濾過 → 消毒 → 配水池 → 給水管 → 家庭・工房

家庭・便所・浴場・工房 → 下水管 → スクリーン・沈砂 → 一次沈殿 → 生物処理 → 最終沈殿 → （必要なら消毒）→ 下流放流
```

「下水を川へ流す」だけでは衛生的な下水道ではない。上水取水点より十分下流に放流口を置くこと、処理の各工程に能力と維持費を与えること、豪雨時に未処理水があふれることを、別々に扱う。ただし「下流放流」は海・外洋へつながる開放流域に限る。内陸で消失する河川、閉鎖湖、永久凍土に近い寒冷地では、同じ河川を放流先とみなさず、貯留・土壌浸透・蒸発散・汚泥保管を処理系の一部として扱う。

同様に、砂濾過と塩素消毒を一つの万能設備にしない。濁った原水へ塩素を加えるだけでは管理が難しく、濾過だけでは配水中の再汚染を防げない。原水保護、濁度を下げる工程、消毒、残留消毒剤の検査、密閉した配水をそろえて初めて `drinkingWaterSecurity` を高くできる。

市内の配水・下水支線なら、**自治憲章を持つ首長主導型の自治都市**が管理できる。市長、ポデスタ、市政官、都市代官、または任命制の水道委員長が、承認済みの「都市公共事業枠」の内訳を水道・下水・道路・市場から選べる。

ただし、水源地、導水幹線、貯水池を複数 Burg にまたがって建設する**広域上水道**は、単独都市の事業にしない。都市は計画を発議し出資できるが、水利権・用地・流量配分・債務・水源地補償を扱う `RiverBasinWaterAuthority`（State の流域水道局、または認可された都市連合）が着工主体となる。詳細は§5.2と§9を正とする。

---

## 2. 未整備都市からの導入順序

安全性を実際に上げる最小順序は、豪華な施設の建設順ではなく、汚染経路を切る順序で決める。

| 優先 | 事業 | まず解く問題 | まだ解けない問題 |
| --- | --- | --- | --- |
| 1 | 上流取水・水源保護・下流放流の区分 | 取水口へ便所・工房排水が直接入る | 病原体、濁水、各戸の貯水容器の汚染 |
| 2 | 公衆井戸／取水塔、沈砂池、雨水・汚水側溝 | 泥、砂、ごみ、道路のぬかるみ | 微生物汚染、河川への汚水負荷 |
| 3 | 低速砂濾過と密閉貯水・配水 | 濁りと多くの微生物を低減する | 高濁度時の能力低下、配水途中の再汚染 |
| 4 | 下水幹線、スクリーン、一次沈殿、下流放流 | 固形物、悪臭、都市内の滞留 | 有機物・病原体を含む放流水、下流の酸欠 |
| 5 | 水質検査、凝集沈殿／急速濾過、塩素消毒 | 大量給水時の濁度・水系感染症 | 消毒副生成物、化学汚染、設備停止時の危機 |
| 6 | 生物処理、最終沈殿、必要時の放流水消毒 | 有機汚濁と病原体を大きく下げる | 栄養塩、微量化学物質、豪雨時の越流 |

人口が小さく水源が良い都市は、優先3までの「水源保護 + 低速砂濾過 + 貯水槽」だけでも大きな改善を得られる。一方、高密度の工業都市は、下水処理を後回しにして上水だけを近代化すると、下流都市へ危険と政治負債を移す。

### 2.1 河川配置の必須条件

```text
上流  ─ 水源保護区 ─ 取水口 ─ 浄水場 ─ 市街 ─ 下水処理場 ─ 放流口 ─ 下流集落
                         ↑                      ↓
                    高所の配水池           洪水位より上の施設
```

- 取水口は原則として市街地・港・屠畜場・染色場・下水放流口より上流に置く。
- 下水処理場と放流口は取水口より下流に置き、洪水時の逆流を避ける。潮汐河川なら満潮逆流も判定する。
- 取水口と放流口を離せない都市は、地下水・泉・貯水池・遠距離導水を優先し、処理能力のない人口密集を抑える。
- 雨水と汚水を同じ管に流す**合流式**は初期費用を下げるが、豪雨時に越流する。新設の近代都市は原則として分流式とする。

### 2.2 気温と閉鎖流域による処理方式の分岐

処理方式は Burg の年平均気温だけで決めない。少なくとも**冬の低温**、**夏に生物処理が働く期間**、および放流先が海へ抜けるかを別々に判定する。河川セルであることは、安全な放流先であることを意味しない。

```text
河川を下流へ追跡
  → 海・外洋へ到達                 : openBasin（条件付きで河川放流可）
  → 閉鎖湖・湿地・扇状地で消失     : closedBasin（河川放流不可）

冬季最低気温 <= -15°C かつ 夏季平均気温 >= 10°C
  → seasonalCold（冬季の生物処理・露天池は停止／凍結）
```

`seasonalCold + closedBasin` は、タイガの盆地・内陸デルタ・河川が砂礫地や湿地で消える地域を表す。この分類は巨人・人間を問わない地理条件であり、巨人の食料・居住適性の判定へは接続しない。

| 流域・気候 | 冬季 | 夏季 | 下水の既定終点 | 許可しないこと |
| --- | --- | --- | --- | --- |
| `openBasin` + 温暖 | 通年運転可能 | 生物処理が安定 | 処理場 → 取水点より下流の河川放流 | 取水点・河川源流への接続 |
| `openBasin` + `seasonalCold` | 覆蓋槽・配管保温を要する。露天生物処理は低下 | 散水ろ床・湿地を季節運転できる | 越冬貯留を経た、流量のある下流放流 | 凍結期に未処理水を河川へ連続放流 |
| `closedBasin` + 温暖 | 通年の沈殿・浸透管理 | 蒸発散・人工湿地・土壌処理が使える | 沈殿 → 浸透盆／人工湿地／再利用。水文的な閉鎖域内で収支管理 | 消失河川・閉鎖湖を「下流放流」と扱うこと |
| `closedBasin` + `seasonalCold` | 密閉沈殿槽・凍結しない幹線・汚泥保管へ貯留 | 短い暖期に沈殿水を人工湿地・礫層・浸透盆へ計画投入 | `sealedStorageAndInfiltration`（貯留・浸透処理地） | 河川源流、凍結した水路、地下水流向で取水地の上流にある処理地 |

寒冷閉鎖流域では、処理場を市街地下流かつ取水地の地下水流向より下流に置く。浸透能力、凍結深、地下水位、処理地から取水点までの距離を満たせない場合、都市の接続率・人口・工房排水を増やさず、広域移送または汲み取り・密閉保管を選ぶ。夏に約15°Cまで上がる地域は、暖期の礫床・人工湿地・乾燥床を使えるが、冬季の連続的な好気性処理を仮定しない。

---

## 3. 必要な Good・施設・人員

Good は「一度建てれば消える建設材」と「毎年消費する運転材」を混ぜない。運転材が欠けたときは、施設を残したまま処理能力と安全性だけが落ちる。

| 区分 | 具体例 | 主な用途 | 調達・維持上の注意 |
| --- | --- | --- | --- |
| 土木建設材 | Stone、Brick、Lime、Sand、Gravel、Timber、Iron、Glass、Tools | 取水堰、沈殿池、濾過槽、下水管、配水池、処理槽、点検口 | Stone/Brick は管渠・池、Iron は弁・ポンプ・後期の耐圧管、Glass は検査器具に使う |
| 配水・集水部材 | 焼成管、鋳鉄管、木樋、鉛管、弁、継手、ポンプ | 給水管・下水管・送水・逆流遮断 | 鉛管は施工しやすいが、飲料水の長期安全性には不利。近代段階では鉄・鋼・陶管へ移行させる |
| 濾過材 | Sand、Gravel、木炭／活性炭、布、石灰 | 砂濾過、支持層、粗い前処理、必要時の吸着 | 砂は洗浄・補充、低速砂濾過は表層の掻き取りと休止槽が不可欠 |
| 水処理薬品 | Alum、Lime、Chlorine／次亜塩素酸塩、必要時の炭酸ソーダ | 凝集、pH調整、消毒、管内腐食の抑制 | 塩素は消毒目的の少量連続投入。原水の濁度と有機物が多いほど投薬管理を難しくする |
| 下水処理の運転材 | スクリーンかす容器、砂利・砕石、曝気用機械、電力／石炭、消毒薬 | スクリーン、散水ろ床、曝気槽、放流水消毒 | 汚泥の引抜き・乾燥・堆肥化／処分先が無い処理場は継続稼働できない |
| 測定・記録具 | ガラス器具、試薬、目盛器、帳簿、標準容器、通信 | 濁度・残留塩素・細菌指標の検査、日誌、事故報告 | 「検査できない処理場」は能力を過大評価しない。記録は予算・責任追跡の設備でもある |
| 専門職 | 水利技師、測量士、石工、管工、機械工、化学技師、検査員、処理場運転員、清掃人 | 設計、施工、投薬、点検、浚渫、試験、汚泥処理 | 為政者個人の `administration` は補助であり、専門運転員を代替しない |

### 3.1 施設ごとの入力と効果

| 施設 | 建設時に必要なもの | 年次／日常の入力 | 成功時の効果 | 故障・不足時の結果 |
| --- | --- | --- | --- | --- |
| 取水堰・着水井・沈砂池 | Stone、Tools、測量、水利権 | 清掃、浚渫、監視人 | ごみ・砂を後段へ入れにくくする | 洪水で埋没、原水濁度の急増 |
| 低速砂濾過池 | Sand、Gravel、Stone/Brick、広い土地 | 表面掻き取り、砂の洗浄・補充 | 小〜中都市の飲料水安全を大きく改善 | 高濁度・凍結・能力超過で流量不足 |
| 凝集沈殿・急速濾過 | Alum、Lime、砂、ポンプ、配管、検査器具 | 継続的な投薬・逆洗・電力／動力 | 大都市の濁水を短時間で処理 | 薬品不足・誤投薬・停電で水質事故 |
| 消毒設備 | Chlorine、投薬器、密閉接触槽、検査器具 | 塩素在庫、残留量の測定、運転員 | 配水中を含め病原体リスクを下げる | 過少投与は流行、過量投与は苦情・健康負債 |
| 配水池・給水管 | 高所用地、Stone/Brick、Iron/陶管、弁 | 漏水修理、水圧管理、清掃 | 家庭・浴場・消防へ安定給水 | 漏水、負圧時の汚水吸引、配水再汚染 |
| 一次沈殿池 | Stone/Brick、掻寄せ具、汚泥乾燥地 | 汚泥引抜き、乾燥・搬出 | 固形物と沈降性有機物を除去 | 汚泥腐敗、悪臭、処理能力喪失 |
| 散水ろ床 | 砕石、散水装置、自然通風、ポンプ | 散水・配水装置の保守、汚泥管理 | 有機物を生物的に低減。電力需要は比較的小さい | 目詰まり、低温時の能力低下、臭気 |
| 活性汚泥法 | 曝気槽、最終沈殿池、送風機、電力、機械工 | 電力、送風、返送汚泥、検査 | 高負荷の都市下水を安定して二次処理 | 停電・毒性排水で微生物群が崩れ、未処理放流 |
| 汚泥乾燥床・消化槽 | 土地、砂、覆い、配管 | 引抜き、乾燥、搬出または安全処分 | 処理の副産物を場外へ安全に移す | 処理場内へ汚泥が蓄積し全系統が停止 |

---

## 4. 技術力と時代相当

時代は世界一斉の年号ではなく、技術・資本・制度が同時に揃った State/Burg の到達段階である。本ゲームの開始時代（成熟中世相当）では、上流取水、井戸保護、沈砂、側溝、自然流下の排水までは可能だが、都市規模の安全な浄水・下水処理はまだ不可能とする。

| 段階 | 現実史の目安 | 必要な技術・知識 | 解禁できること | ゲーム上の位置 |
| --- | --- | --- | --- | --- |
| A. 水源保護・重力式水利 | 古代〜中世 | `surveying`、石工、取水・放流の区分、水利権、清掃制度 | 上流取水、貯水槽、沈砂池、側溝、被覆暗渠 | 既存 `urbanWaterworks` / `municipalSanitation` の範囲 |
| B. 低速砂濾過 | 19世紀初頭相当 | 細菌以前の経験的衛生、砂層設計、流量管理、公共事業会計 | 低速砂濾過、密閉配水池、定期清掃、給水の検査記録 | era 5 の前半または新しい都市衛生枝の入口 |
| C. 都市衛生工学 | 19世紀後半相当 | 細菌学、公衆衛生統計、耐圧管、蒸気揚水、行政監査 | 近代的給水網、下水幹線、一次沈殿、工場排水規制 | `municipalSteamPumping` の後続。既存 `sanitaryEngineering` を具体化 |
| D. 急速濾過・塩素消毒 | 19世紀末〜20世紀初頭相当 | 分析化学、投薬制御、ポンプ、圧力／流量計、検査所、塩素供給 | 凝集沈殿、急速砂濾過、連続塩素消毒、残留塩素管理 | era 6。`Chlorine` Good は工業供給を要求 |
| E. 二次下水処理 | 19世紀末〜20世紀前半相当 | 微生物学、散水ろ床または活性汚泥、曝気、汚泥管理、広域放流規制 | 生物処理、最終沈殿、放流水消毒、汚泥処理 | era 6。大都市では State/広域連合が所有 |
| F. 高度処理・流域管理 | 20世紀後半以降相当 | 栄養塩除去、毒性物質管理、自動計測、環境法、電力網 | 窒素・リン管理、再利用水、厳格な放流水基準 | 本書では将来拡張。安全な基本整備の必須条件にはしない |

歴史上、英国の散水ろ床は1893年、活性汚泥法は1914年に開発されたとされる。米国での恒常的な都市上水の塩素消毒は1908年に始まった。したがって「砂濾過だけの早期近代」「濾過 + 消毒」「生物処理まで持つ工業都市」を別段階にする。塩素消毒は濾過の代用品ではなく、特に配水網の再汚染に対する最後の防壁として扱う。 [CDC: 飲料水処理史](https://archive.cdc.gov/www_cdc_gov/healthywater/drinking/history.html), [CDC: 塩素・クロラミン消毒](https://www.cdc.gov/drinking-water/about/about-water-disinfection-with-chlorine-and-chloramine.html), [米国EPA: 生物処理の歴史資料](https://nepis.epa.gov/Exe/ZyPURL.cgi?Dockey=9100LYD1.TXT)

### 4.1 提案する技術グラフ

既存の `urbanWaterworks`、`waterLifting`、`municipalSanitation`、`sanitaryEngineering` を削除しない。その上に次のノードを置く。`known` は試験槽・少数区画、`demonstrated` は一都市の限定運転、`adopted` は日常運転と予算化、`diffused` は同じ流域の都市への標準化を意味する。

```text
urbanWaterworks + municipalSanitation
  → protectedIntakeAndWaterRecords
  → slowSandFiltration
  → municipalSteamPumping ─┐
                               ├→ pressurizedDistributionAndPrimaryTreatment
analyticalChemistry ──────────┤
                               ├→ rapidFiltrationAndCoagulation
chemicalIndustryFoundation ───┤
catalyticChemistry + Chlorine ─┘→ controlledWaterChlorination

pressurizedDistributionAndPrimaryTreatment
  + sanitaryEngineering
  → biologicalWastewaterTreatment
  → activatedSludgeAndEffluentControl
```

| ノード | 主な前提 | `adopted` の物証 | 解禁内容 |
| --- | --- | --- | --- |
| `protectedIntakeAndWaterRecords` | 測量、行政、`urbanWaterworks` | 水源保護条例、取水点・放流点の台帳、検査員 | 上流取水と下流放流の強制、事故記録 |
| `slowSandFiltration` | `protectedIntakeAndWaterRecords`、石工、砂・砂利、都市予算 | 休止槽を含む稼働濾過池、定期掻き取り記録 | 小〜中都市の濾過水供給 |
| `pressurizedDistributionAndPrimaryTreatment` | `municipalSteamPumping`、管工・機械工、`sanitaryEngineering` | 配水池、弁・管網、一次沈殿池、汚泥搬出 | 大規模給水、下水一次処理 |
| `rapidFiltrationAndCoagulation` | 分析化学、機械動力、Alum/Lime、検査所 | 薬品投入・逆洗の運転記録 | 高濁度河川の大量浄水 |
| `controlledWaterChlorination` | `rapidFiltrationAndCoagulation`、`Chlorine`、化学技師、検査所 | 連続投薬器、接触槽、残留塩素台帳 | 消毒と配水中の水系感染症リスク低減 |
| `biologicalWastewaterTreatment` | `sanitaryEngineering`、微生物学、一次処理、砕石／散水装置 | 稼働する散水ろ床、最終沈殿、汚泥処分契約 | 二次処理した放流水 |
| `activatedSludgeAndEffluentControl` | `biologicalWastewaterTreatment`、電力／送風機、機械工、流域規制 | 曝気槽・返送汚泥・水質試験の連続運転 | 高密度都市の安定した二次処理 |

`Chlorine` は既存 Good を再利用する。塩素製造そのものを水道技術の前提にしない。初期には石灰系の次亜塩素酸塩を交易で得られてもよいが、広域普及と安定供給には、既存の化学工業・塩素工場・塩素アルカリ電解の連鎖を必要とする。

---

## 5. 予算、所有、政治形態

### 5.1 支出を四つの財布に分ける

| 財布 | 支出対象 | 支出を決める者 | 典型的な財源 |
| --- | --- | --- | --- |
| 都市建設予算 | 取水口、濾過池、管渠、処理場、配水池 | 市政官／市長／水道委員長 | 市場税、接続料、起債、State 補助 |
| 都市運転予算 | 薬品、電力・石炭、運転員、検査、砂の洗浄、汚泥搬出 | 水道局・処理場長。市政官が上限を配賦 | 水道料金、下水道使用料、工房排水料 |
| 流域・環境予算 | 下流補償、河川監視、複数都市の共同処理場 | State／流域連合 | State treasury、流域負担金、罰金 |
| 非常時予備費 | 洪水、原水汚染、設備故障、疫病 | 首長または危機管理官の即時権限 | 都市予備金、State 災害補助 |

建設費だけを払って運転費を払わない都市は、濾過池が詰まり、投薬が止まり、汚泥が積もる。「施設はあるが安全性は低い」という状態を正規に発生させる。少なくとも `waterworksOperationsFunding` と `wastewaterOperationsFunding` を、建設ストックと別に持つ。

### 5.2 権限を市内・流域・State に分ける

| 範囲 | 所有・決裁主体 | 典型的な対象 | 単独で決められること | 上位の同意が必要なこと |
| --- | --- | --- | --- | --- |
| Burg 内 | 市政官／水道委員長 | 市内配水管、下水支管、公衆給水所、修繕、日常の薬品購入 | 承認済みの都市水道枠の配分、運転停止・緊急修繕 | 新税、起債、私有地の強制収用 |
| 複数 Burg | `RiverBasinWaterAuthority` | 水源保護区、取水口、導水路・送水管、共同浄水場、幹線下水・共同処理場 | 参加都市間で合意済みの容量配分、幹線の施工順、共同運転予算 | 水利権、州境越え、強制収用、国庫補助 |
| State／流域 | State の水利・公衆衛生部局 | 河川流量、水源地保護、放流基準、流域補償、認可 | 許認可、基準設定、非常時の取水制限 | 他 State の水源使用・国際河川の配分 |

この分割により、都市管理者の裁量を消さずに「水源を持たない都市が、上流都市の土地と川を勝手に使う」状態も防ぐ。市政官は計画の提案者・地元網の所有者であり、広域水道局は水を融通する公共法人である。

### 5.3 標準政治形態: 首長主導型の自治都市

この要件に最も合うのは、**自治憲章（都市特許）を持つ首長主導型の自治都市**である。現実史の自由都市、自治体、市政官制、任命制の衛生委員会を、世界設定に合わせて抽象化する。

| 役職・機関 | 権限 | 制約 |
| --- | --- | --- |
| 市政官／市長／ポデスタ | 年間の都市公共事業枠を、水道・下水・道路・市場・防災へ配分。緊急時は予備費を即時執行 | 総枠を超える支出、増税、起債は単独でできない |
| 水道委員長／都市技師 | 承認済み水道枠の中で、濾過材・薬品・修繕・検査員の配分と運転停止を決定 | 新税、対外補償、流域を跨ぐ事業は市政官／議会へ上申 |
| 都市評議会 | 年間枠、料金、起債、土地収用を承認。監査報告を受ける | 日々の投薬量・修繕順などの技術判断には介入しない |
| State／流域連合 | 水利権、下流保護基準、都市間補償、広域施設の認可 | 市内の通常運転の細部は自治都市へ委任 |

この形なら「為政者・管理担当者の個人の権限」は、**予算の内訳を変える委任権限**として明確になる。一方で、個人が無制限に税を取り、下流都市へ汚水を押しつけ、債務を残せる設定にはしない。政治的な対立は「浄水に予算を寄せれば市場拡張と軍備が遅れる」「工場主は排水料に反対する」「下流都市は放流規制を要求する」として残る。

### 5.4 他の政治形態との相性

| 形態 | 実行の速さ | 継続運転 | 個人裁量 | 上下水道での物語上の特徴 |
| --- | --- | --- | --- | --- |
| 首長主導型の自治都市（推奨） | 高い | 高い | 市政官・水道委員長に明確に委任 | 市民料金・評議会監査と、専門家の即応を両立 |
| 都市共和国・合議制自治 | 中程度 | 高い | 低〜中。評議会決議が必要 | 商人・工房主の反対で遅れるが、料金制度と記録は強い |
| 中央集権君主制の直轄市 | 高い | 中程度 | 総督・王室技師が強い | 威信事業を速く建てるが、王都優先・地方の運転費不足を起こし得る |
| 神権・寺院都市 | 中程度 | 中程度 | 宗教官に集中 | 清浄・巡礼の動機で水源保護は強いが、化学消毒を宗教的に拒む分岐が可能 |
| 寡頭制の港湾都市 | 高い（利益地区のみ） | 低〜中 | 有力商人へ偏る | 港・市場・富裕区は整う一方、貧民区・下流への外部性が残る |
| 無政府／弱体行政 | 低い | 低い | 私設施設にはあるが公共性なし | 井戸・汲み取り・私設水売りが中心。都市網の保守は難しい |

既存の `Republic` / `Union` は Burg の地方行政負担比率が高く、自治都市の母体として相性がよい。`Monarchy` でも都市憲章または総督への委任を持たせれば同じ運転モデルを採れる。State が自動的に全 Burg の水道予算を決める設計にはせず、各 Burg に `utilityBudgetAuthority` を持たせる。

---

## 6. シミュレーション上の状態と更新

既存 `UrbanWaterSystem` の値を捨てず、近代設備だけを追加する。特に `sanitation`（都市全般の衛生）と `waterSecurity`（飲料水安全）と `riverPollutionLoad`（下流への負荷）は別シグナルにする。

```ts
interface ModernWaterTreatmentSystem {
  sourceProtection: number;          // 0..1: 上流取水・保護区・放流隔離
  drinkingTreatmentTier: 0 | 1 | 2 | 3;
  wastewaterTreatmentTier: 0 | 1 | 2 | 3;
  basinKind: "openBasin" | "closedBasin";
  thermalRegime: "temperate" | "seasonalCold";
  effluentDestination: "riverOutfall" | "coastalOutfall" | "sealedStorageAndInfiltration";
  distributionIntegrity: number;     // 漏水・負圧・配水池衛生
  treatmentOperationsFunding: number;
  wastewaterOperationsFunding: number;
  treatedWaterCapacity: number;
  wastewaterTreatmentCapacity: number;
  chlorineStockCoverage: number;
  chemicalTestCoverage: number;
  effluentCompliance: number;
  combinedSewerOverflow: number;
  sludgeBacklog: number;
  winterStorageFill: number;         // 凍結期に処理待ちの沈殿水・汚泥の占有率
  seasonalInfiltrationCapacity: number;
}
```

| `drinkingTreatmentTier` | 内容 | `waterSecurity` への意味 |
| --- | --- | --- |
| 0 | 保護されない河川・井戸・私設給水 | 飲水由来の危険が高い |
| 1 | 水源保護、沈砂、低速砂濾過、密閉貯水 | 通常時の危険を大きく下げる |
| 2 | 凝集沈殿／急速濾過、検査、近代配水 | 高濁度時も比較的安定 |
| 3 | Tier 2 + 制御された塩素消毒・残留管理 | 配水中を含む病原体リスクをさらに下げる |

| `wastewaterTreatmentTier` | 内容 | `riverPollutionLoad` への意味 |
| --- | --- | --- |
| 0 | 未処理放流、便槽、汲み取り中心 | 都市内・下流の双方へ高負荷 |
| 1 | スクリーン、沈砂、一次沈殿、汚泥搬出 | 固形物・沈降物を下げるが、放流水はなお汚い |
| 2 | 散水ろ床などの生物処理 + 最終沈殿 | 有機物負荷を大きく下げる |
| 3 | 活性汚泥など + 放流水検査／必要時の消毒 | 高密度都市でも低い有機物・病原体負荷を維持 |

年次更新では、人口・工房・降雨から水量と汚濁負荷を計算し、`capacity × operationsFunding × maintenanceCondition` と比較する。処理能力が足りない、塩素在庫が尽きる、検査が行われない、豪雨で合流式越流が起きる、汚泥が滞留する、のいずれでも安全性を下げる。`seasonalCold` では冬季に好気性処理能力と露天湿地・乾燥床の能力を下げ、流入分を `winterStorageFill` へ積む。暖期には `seasonalInfiltrationCapacity` と未凍結の処理能力の範囲で取り崩す。`closedBasin` では `riverOutfall` を選択不能にし、貯留量が上限を越えた時点で衛生負担・地下水汚染・工房操業制限を発生させる。単に見えない河川終端へ負荷を捨ててゼロにはしない。

```text
原水汚染 + 配水漏水 + 濾過／消毒不足
  → waterSecurity 低下 → 水系疾病圧の上昇

開放流域:
下水量 + 工房排水 + 合流式越流 −（一次／二次処理容量 × 運転充足）
  → riverPollutionLoad 上昇 → 下流 Burg の原水汚染・外交圧

寒冷閉鎖流域:
下水量 − 冬季の密閉貯留余力 − 暖期の浸透／蒸発散／再利用能力
  → winterStorageFill・sludgeBacklog 上昇 → 地下水汚染・衛生負担・接続／操業制限
```

`drinkingTreatmentTier = 3` でも、工業毒物・塩類・重金属を砂濾過や塩素で無害化したことにはしない。これらは水源転換、工房排水の事前規制、後期の高度処理を必要とする別問題である。

---

## 7. 導入プロジェクトと失敗条件

| プロジェクト | 発生条件 | 決裁権限 | 建設後も必要なこと | 主な失敗 |
| --- | --- | --- | --- | --- |
| 水源保護条例と取水移設 | 上流に取水候補があり、下流放流が可能 | 市政官 + State の水利認可 | 保護区巡視、工房規制 | 地主・上流集落との紛争、無許可放流 |
| 市営砂濾過場 | 都市人口、砂・砂利、建設用地、維持班 | 市政官または水道委員長 | 掻き取り、砂の補充、予備槽 | 表層閉塞、洪水濁水、濾過槽を休ませない |
| 配水池・給水網 | 高所・揚水・管材・土地収用 | 都市建設予算。起債は評議会 | 漏水修理、圧力管理、配水池清掃 | 水圧不足、管破裂、負圧による再汚染 |
| 塩素消毒所 | 濾過、`Chlorine`、試験所、技師 | 水道委員長の運転権限 | 投薬・残留検査・薬品調達 | 薬品切れ、誤投薬、原水濁度急変 |
| 一次下水処理場 | 下水幹線、下流用地、汚泥搬出先 | 都市 + State 放流認可 | 汚泥引抜き、スクリーン清掃 | 汚泥放置、洪水時の逆流、放流口の閉塞 |
| 生物下水処理場 | 一次処理、砕石または曝気機械、専門員 | 大都市は State／流域連合との共同 | 運転日誌、水質検査、汚泥処分 | 電力・石炭不足、毒性工場排水、越流 |

都市管理者は、完成した設備を保全するか、新地区への管路延長を優先するか、薬品を買うか、下流補償を払うかを毎年選ぶ。安全性の高い水道は、単発の建設プロジェクトではなく、運転予算を守り続けた結果とする。

---

## 8. 実装の段取り

| Phase | 変更 | 既存資産との接続 |
| --- | --- | --- |
| 1 | **実装済み（2026-08-23、§12参照）**。`ModernWaterTreatmentSystem` と `RegionalWaterScheme`、取水・放流の地理判定、`waterSecurity` / `riverPollutionLoad` の分離 | `UrbanWaterSystem`、疫病水質設計 |
| 2 | **実装済み（2026-08-23、§13参照）**。水源保護、低速砂濾過、一次沈殿、建設費と運転費の分離 | Burg treasury、清掃税・接続料 |
| 3 | **実装済み（2026-08-23、§14参照）**。流域水道局、参加・補償・水利認可、`toggleWaterSupply` の計画／建設／稼働表示 | Burg/State の行政按分、既存の拡張レイヤー API |
| 4 | **実装済み（2026-08-23、§15参照）**。凝集・急速濾過・`Chlorine` 消費・水質検査 | era 6 の化学工業、`Chlorine` Good |
| 5 | **実装済み（2026-08-23、§16参照）**。散水ろ床／活性汚泥、汚泥処理、流域補償、放流水検査、`toggleSewerage` | `sanitaryEngineering`、上流・下流汚染外交 |

Phase 1–2 では「塩素を入れれば直ちに近代水道」という近道を作らない。Phase 4 は `controlledWaterChlorination` が `demonstrated` になった都市だけが試験的に実行でき、`adopted` になった State でも、各 Burg が濾過・薬品・検査・運転費を満たした場合にのみ恒常効果を得る。

---

## 9. 流域上水道のレイヤー、計画、合意

### 9.1 表示は「水道レイヤー」にまとめず、二つの独立レイヤーにする

既存 `Rivers` レイヤーは地形・自然水系であり、導水管や下水幹線を混ぜない。自然河川は流向・流量・氾濫・航行の基準である一方、水道は人工物で、所有者、計画段階、契約容量、故障状態を持つからである。

推奨する UI は、親グループを **Utilities（都市水利）** とし、その下へ次の二つのトグルを置く形である。

| レイヤー | ID 案 | 表示するもの | 表現 | `Rivers` と分ける理由 |
| --- | --- | --- | --- | --- |
| 上水道 | `toggleWaterSupply` | 水源保護区、取水口、浄水場、導水路／送水管、配水池、揚水所、給水対象 Burg | 青〜青緑の実線。計画中は細い破線、建設中は点線、停止中は灰色 | 水は河川を逆流・横断・地下通過し得る。河川の支流として描くと誤読される |
| 下水・処理 | `toggleSewerage` | 幹線下水、ポンプ場、雨水吐、下水処理場、放流口、汚泥処理地 | 暗い紫灰／褐色の破線。放流口は下流向き矢印、越流は警告記号 | 水流と同じ経路ではなく、上水施設と交差することもある。選択・故障・予算も別 |

上水・下水を単一の「水道レイヤー」に重ねる案は採らない。送水管と下水管が交差したとき、どちらを選んだか、どの事業が未着工か、どの事故が起きたかを判別しにくくなるためである。ただしレイヤー管理画面では両者を同じ `Utilities` グループに置き、「両方表示」の親トグルを提供してよい。

世界地図の縮尺では、全戸の枝管を描かない。Burg 間の導水幹線・下水幹線と施設だけを描き、市内の支管、接続率、処理能力は Burg Editor の Water タブまたは拡大時の都市図に委ねる。これにより既存 `Rivers` と `Routes` に重ねても視認性を保てる。

実装上は既存 `Rivers` の SVG group を再利用せず、Economy 拡張の Dam/Levee と同じ独自 SVG layer とする。`economyLayers` に二つの `LayerConfig` を追加し、拡張の `registerLayerElement` / `registerLayerToggle` / `registerDrawLayerHook` で描画・再描画する。導水管の線形には道路ルートを流用せず、水頭、地形、トンネル、用地取得をコストに含む専用経路を持たせる。

### 9.2 広域上水道計画のライフサイクル

水源のない Burg は、いきなり導水路を建設しない。市政官が `RegionalWaterScheme` を**提案**し、流域水道局が調査と合意を取りまとめ、全条件を満たして初めて建設キューへ入れる。

```text
需要都市が提案
  → 水源候補・導水経路の調査
  → 仮計画（容量・受益都市・費用・補償）
  → 水源地・通過地・受益都市・State の合意
  → 資金拠出／起債と水利権の確定
  → 区間ごとの建設
  → 試運転・水質検査
  → 運転開始・料金徴収・能力配分
```

| 段階 | 提案都市ができること | 水道局／State が行うこと | 着工を止める条件 |
| --- | --- | --- | --- |
| 提案 | 不足水量、候補水源、希望容量、自己負担額を提示 | — | Burg treasury が調査分を負担できない、需要がない |
| 調査 | 地元の配水網・需要を提示 | 流量、標高差、水質、洪水、複数候補経路を比較 | 水源余力なし、自然流下も揚水も不可能 |
| 仮計画 | 受益者として加入／辞退 | 参加者、契約容量、工区、補償、料金を作成 | 受益容量が建設費に見合わない |
| 合意 | 出資と市内接続用地を承認 | 水利権、通過地収用、放流・環境条件を認可 | 水源地の許可なし、通過地補償なし、State の水利認可なし |
| 建設・試運転 | 市内配水池・接続管を建設 | 取水・幹線・共同浄水場を施工し、水質試験 | 必要額未拠出、戦争・災害、工区未完成 |
| 運転 | 使用量に応じて料金を払い、配水末端を保守 | 契約容量を配分し、渇水時の制限を発令 | 薬品・動力・修繕費の未払い、水源事故 |

合意対象は「周辺の全都市」ではない。水源地 Burg、管路が通る Burg、給水を受ける Burg、および水利権を持つ State／流域当局だけを当事者にする。近隣都市は希望すれば受益都市として参加できるが、加入しない都市が無制限の拒否権を持つと広域事業が常に停止する。

### 9.3 合意と予算の既定ルール

| 事項 | 決める主体 | 既定ルール |
| --- | --- | --- |
| 水源の取水量 | 流域水道局 + State | 渇水時にも残す河川流量と既存利用者の水利権を先に差し引く |
| 取水口・幹線の用地 | 水源地・通過地 Burg + State | 任意売買を優先。公益収用は State 認可と補償を必須にする |
| 建設費 | 水道局の協定 | State 補助 50%、受益 Burg 40%を契約容量比、水道債／商会出資 10%を既定案とする。比率は協定で変更可能 |
| 水源地・通過地への補償 | 水道局 | 受益都市の拠出から払う。水源地は原則として幹線建設費を負わず、保護区制限の対価と非常時の優先給水を得る |
| 日常運転費 | 水道局 + 受益 Burg | 水道料金・接続料で賄い、契約容量に応じた固定費と実使用量に応じた従量費を分ける |
| 渇水時の配分 | 水道局 | 生命維持・消防・病院を優先し、次に各 Burg の契約最低量、最後に工房・庭園用水を制限する |
| 争議 | State／流域裁定所 | 水源側・需要側の市政官ではなく、許認可主体が裁定する。州境越えは国家間条約へ上げる |

この方式では、都市管理者は「自都市が参加し、いくら出し、どれだけの容量を買うか」を決められる。しかし、他都市の水を一方的に奪う権限は持たない。広域水道局は参加都市の寄せ集めではなく、State 認可を受けて資産・債務・容量配分を一元管理する法人とする。

### 9.4 データ境界

```ts
interface RegionalWaterScheme {
  id: number;
  sponsorStateId: number;
  authorityKind: "stateWaterAuthority" | "charteredWaterUnion";
  status: "proposed" | "surveying" | "negotiating" | "funded" | "building" | "commissioning" | "operating" | "suspended";
  sourceCellId: number;
  intakeBurgId?: number;
  routeCellIds: number[];             // 幹線のみ。各戸配管ではない
  memberBurgIds: number[];            // 給水を受ける都市
  transitBurgIds: number[];
  contractedCapacityByBurg: Record<number, number>;
  approvalByParty: Record<string, "pending" | "approved" | "rejected">;
  capitalContributionByParty: Record<string, number>;
  compensationReserve: number;
  constructionProgress: number;
  operationsReserve: number;
}
```

これは既存の Burg 単位 `UrbanWaterSystem` の置換ではない。`RegionalWaterScheme` は「どの Burg へ、どの経路で、どれだけ原水または処理水を届けるか」を所有し、各 `UrbanWaterSystem` は受け取った水を貯水・消毒・配水する能力と、下水を回収・処理する能力を所有する。

Giant 国家の全 Burg（`capital` / `city` / `town` / `village` / `fort`）には、古代ローマ式の導水を `UrbanWaterSystem.hasInheritedRomanWaterworks`、幹線下水を `hasInheritedRomanSewer` として初期配置する。旧セーブの前者は後者も持つものとして移行する。Giant は食料・気温・人間用の高地適性に縛られず、最高水源の集水域には雪山を含めて低密度（人間相当容量の最大10%）で定住する。このため、Giant 国家は、地図で最高標高の `River.source`、その `River.basin` に流下する集水域、および首都から水源へ至る陸上回廊を単独で占有できる場合だけに生成する。できない Giant 候補は通常の Human State として扱う。地図生成時には、これらの集落を地図上の最高河川水源より低い標高の適地へ置く。遺産があり State が Giant である間は、年次の水利技術バイアスも State 種族から得る。Giant 国家の既設上下水道は `drinkingTreatmentTier = 1` と `wastewaterTreatmentTier = 1` を持つ。`toggleWaterSupply` は、**同一State・同一陸地内で最も高い、下水放流に汚染されない河川源流**を共通の保全取水地として選ぶ。導水は取水地から最寄りの Burg へ、以後は既設の導水セルから最寄りの未接続 Burg へ、標高を無視したセル間最短距離で追加するため、重複しない幹線と枝線の樹状網として描画される。外国領・海・別島は経路に使わない。`toggleSewerage` は、河川セルの近さだけで放流点を選ばず、下流追跡で海へ達する `openBasin` の河川または近い海岸だけを通常の放流点とする。`seasonalCold + closedBasin` のタイガ等では、河川放流の代わりに共同の `sealedStorageAndInfiltration` を終点とし、冬は密閉貯留、夏は人工湿地・礫層・浸透盆へ計画投入する。処理地は取水源・源流セル・地下水流向で取水地の上流に置かない。海・海峡・別島を越える導水・下水は行わない。後続の `RegionalWaterScheme` が実際の水源保護区・経路・契約相手を所有するまで、これは暫定的な遺産記録である。

## 10. 参考と設定上の注意

- 砂濾過は微生物と濁りを減らす有効な工程だが、化学汚染を除去する万能手段ではない。塩素消毒は主に病原体を対象とし、濁りや化学物質を消さない。 [CDC: 家庭・地域の水処理](https://www.cdc.gov/global-water-sanitation-hygiene/about/about-household-water-treatment.html)
- 処理済み下水の「安全な放流」は、取水口より下流への放流、容量内の運転、汚泥の処分、放流水の検査を満たす相対的な状態である。流域の生態系・栄養塩・毒性物質まで無害という意味にはしない。
- 中世・古代風都市に近代処理場を遡及させない。古い都市が持つのは水源保護、重力式導水、沈砂、公共便所、汲み取り、排水であり、濾過・消毒・生物処理は化学・機械・検査・行政記録の積み上げ後に到達する。
- 魔法で `purifyWater` を採用する場合も、都市全体の処理能力、術者の勤務、取水・配水、下水・汚泥の行き先、監査権限を同じ枠で定義する。魔法は塩素や濾過の工程を代替できても、制度と物流を不要にはしない。

---

## 11. 文化圏ごとの近代化適性（実装済み・下位基盤）

**状態: 実装済み**。「遊牧文化が上下水道を整備する見込みは低い」という直感を、`CultureType` と新規属性 `Culture.modernizationAffinity` として一般化した。本章より前の §1–10（`ModernWaterTreatmentSystem`、`RegionalWaterScheme` 本体）はまだ未実装のままであり、ここで定義する属性はその実装が読み取るための下位基盤に留まる。

### 11.1 問題

既存の `CultureType`（`Generic`/`River`/`Lake`/`Naval`/`Nomadic`/`Hunting`/`Highland`）は生成時の地形コスト・拡張性のためだけに作られており、「この文化圏が恒常的な公共事業へ投資するか」を表す軸を持たなかった。`Nomadic` を上下水道整備から除外したいだけなら `type === "Nomadic"` を特別扱いすれば足りるが、それでは次の二つを取りこぼす。

1. 砂漠のオアシス都市・隊商都市は、河川や港がなければ一律 `Nomadic`（`isNomadicBiome` が砂漠タグと草原タグを区別しない）に分類され、定住的な文化として扱われない。
2. 「近代化に前向きな文化」と「後ろ向きな文化」の差は `Nomadic` かどうかの二値では表現できない。高地・湿地・沙漠はそれぞれ異なる理由で整備が遅れ、逆に工業化・植民地化を経た文化はむしろ整備が早い。

### 11.2 追加した `CultureType`

`src/types/models.ts` の `CULTURE_TYPES` を7種から11種へ拡張した（`src/generators/cultures-generator.ts` の `defineCultureType` が生成時に判定）。

| 追加した型 | 分岐条件 | 動機 |
| --- | --- | --- |
| `Desert` | 砂漠バイオーム（`isDesertBiome`）で、かつ湖・海港・河川のいずれにも該当しない地点 | オアシス・隊商都市。ナイル/チグリス・ユーフラテス型の「砂漠だが河川文化」は従来通り `River`/`Naval` に残る |
| `Marsh` | 湿地バイオームで、海岸から2セル以内（`cells.t <= 2`） | デルタ・ポルダー型の定住農耕文化。内陸の湿地採集民は従来通り `Hunting` に残る |
| `Industrial` | `historicalPeriod` が `steamEra` 以降、かつ砂漠・湿地でない地点で確率的に採用 | 蒸気力・工場町文化。近代化の中心的な受益者として新設 |
| `Colonial` | `initialSettlementPattern === "frontier"` かつ `historicalPeriod` が `ageOfExploration` 以降で確率的に採用（`frontierStartMode === "seaborne"` なら沿岸のみ） | 入植者文化。制度・インフラを本国から移植するため、有機的な `Industrial` とは別に区別する |

`Nomadic` の判定自体も、砂漠タグを除外するよう変更した（草原・サバンナのみを対象とする）。`defineCultureExpansionism`、`getBiomeCost`/`getHeightCost`/`getRiverCost`/`getTypeCost`（拡張コスト）、`culturalHygieneProfile`（`src/extensions/economy/generators/urbanWaterSystem.ts`）、`CULTURE_CROP_PREFERENCES`（`agriculturalLandUse.ts`）、`BASE_HOUSING_RECIPE_BY_CULTURE`（`housingRecipes.ts`）、`KNOWLEDGE_VALUE_PRIOR`（`cultureKnowledgeValue.ts`）を4型分拡張済み。エディタ側は `CulturesEditorDialog`/`StatesEditorDialog`/`BurgEditorDialog` のドロップダウンと `en.json`/`ja.json` を更新済み。

### 11.3 新規属性 `modernizationAffinity`

`knowledgeValue`（学問への価値観、既存）と同じ形の乱数属性を追加した：`Culture.modernizationAffinity?: number`（0..1）。生成時に文化型ごとの事前分布からガウス乱択し、セーブへ永続化する（`src/utils/cultureModernizationAffinity.ts`、読み取りは `getCultureModernizationAffinity()`）。`knowledgeValue` と分けた理由は、両者が独立した問いに答えるためである — 「物知りだが定住しない文化」も「工学的には浅いが投資に前向きな文化」もあり得る。

| `CultureType` | 事前平均 | 根拠 |
| --- | --- | --- |
| `Nomadic` | 0.08 | 定住地を持たないため、恒常的な公共事業を置く場所自体がない（本章の出発点） |
| `Hunting` | 0.15 | 人口密度が低く、定住しても投資規模が小さい |
| `Desert` | 0.2 | 井戸・季節キャンプ依存が基本だが、隊商都市が富めば整備し得る |
| `Highland` | 0.3 | 到達可能だが、勾配・低地からの距離で普及が遅れる |
| `Marsh` | 0.35 | 高密度な定住は可能だが、排水工学の前提条件が河川取水より重い |
| `Generic` | 0.4 | 中立 |
| `Lake` | 0.5 | — |
| `River` / `Naval` | 0.55 | 水力・水運・港湾交易による技術伝播が歴史的に最速 |
| `Colonial` | 0.7 | 本国基準の移植。ただし都市内の区画間で不均一になり得る点は単一スカラーでは表現できない（§5.4 の留保どおり） |
| `Industrial` | 0.85 | 本計画が最終的に想定する受益文化そのもの |

### 11.4 §1–10 実装時にどう読むべきか（提案。実装状況は §11.5 参照）

`modernizationAffinity` はまだ何もゲートしていない。§8 の Phase 1 以降を実装する際は、次のように読む案を残す。

- Phase 1（`ModernWaterTreatmentSystem` 新設時）: 初期状態の `drinkingTreatmentTier`/`wastewaterTreatmentTier` を 0 で揃えるのではなく、`modernizationAffinity` が高い Burg ほど Tier 1 相当（水源保護・沈砂・低速砂濾過）の初期投資が既に済んでいる確率を上げる。
- Phase 2–5（薬品消費・生物処理・広域水道）: `modernizationAffinity` を「同じ予算充足度でも整備が進む速さ」の乗数として使う。ゲートそのもの（薬品・技術ノード・予算）は §4/§8 の技術グラフのままとし、`modernizationAffinity` は技術が使える前提の上での「その文化がどれだけ積極的に予算を割り当てるか」に限定する — 技術的に不可能なことを可能にはしない。
- `Nomadic`/`Desert` の低い値は「劣っている」ことを意味しない。Nomadic 文化が強制的に定住化された場合（現実史のカザフ人・ベドウィンの定住化に相当する将来イベントがあれば）、`type` を変えずに `modernizationAffinity` だけ再ロールし直す拡張点として残せる。

### 11.5 §11.4 の3提案の実装状況（2026-08-23 時点でのまとめ）

| 提案 | 状態 | 実装箇所 |
| --- | --- | --- |
| Phase 1: Tier 初期値を `modernizationAffinity` が高い Burg ほど上げる | **実装済み** | レガシー `tier` ラダー: §18.2 `initialTier()`。近代ラダー（`drinkingTreatmentTier`/`wastewaterTreatmentTier`）: §20 `modernWaterworksGenerationSeed()`。どちらも Burg 自身の `modernizationAffinityForBurg(burg)` を読む |
| Phase 2–5: 投資速度の乗数（ゲート自体は変えない） | **実装済み**（§13.1 で先行実装、本書の当初の想定どおり） | `urbanWaterModernTreatment.ts` の `settleModernWaterTreatmentInvestment()`——`speedMultiplier = 0.35 + affinity * 1.3` が `stepRate` を通じて drinking・wastewater 両ラダーの Tier 進捗速度に効く。ゲート（era・技術ノード・予算）には無関係 |
| Nomadic/Desert の強制定住化時の再ロール拡張点 | **未実装・意図的に据え置き** | 「現実史のカザフ人・ベドウィンの定住化に相当する**将来イベントがあれば**」という条件付きの拡張点として最初から記述されており、その定住化イベント自体が本ロードマップのどこにも存在しない。存在しない仕組みのために作り込まない、という本書一貫の方針（§12.3 等）により保留する。定住化イベントを設計する具体的な要望があれば、その一部として実装する |

Phase 1・Phase 2–5 の2提案は既存 3ターンの作業（§13.1・§18・§20）でカバーされており、`modernizationAffinity` は生成時の初期値（レガシー・近代の両ラダー）と年次投資速度（近代ラダー）の両方に配線済みで、追加の未接続箇所はない。

---

## 12. Phase 1 実装メモ（実装済み・2026-08-23）

**状態: 実装済み**。ただし「巨人の国にだけ最初から上下水道を設置する仕組み」（本書より前に `feature/giants-urban-water` ブランチで実装済み）が、Phase 1 が要求する要素の大半を既に部分的に含んでいた。そのため実装は「新設」より「Giant 専用だった既存ロジックを全 Burg 向けに一般化する」作業が中心になった。以下、当初の想定との差分を明記する。

### 12.1 見つかった既存資産（重複実装を避けた箇所）

| Phase 1 が要求する要素 | 実装前の状態 | 対応 |
| --- | --- | --- |
| `thermalRegime`（`temperate`/`seasonalCold`） | `isSeasonalColdBurg()`（`urbanWaterClimate.ts`）が §2.2 と同一の閾値（冬季 ≦ -15°C、夏季 ≧ 10°C）で既に実装済み。ただし Giant の継承下水判定でのみ呼ばれ、`UrbanWaterSystem` に保存されていなかった | `UrbanWaterSystem.thermalRegime` として全 Burg 分を保存するフィールドを追加。計算ロジック自体は変更なし |
| `basinKind`（`openBasin`/`closedBasin`） | `getClosedRiverIds()`（`urbanSewerage.ts` 内、非公開）が河口標高・`feature.type`・`feature.closed` から既に §2.2 相当の閉鎖流域判定を実装済み。ただし Giant の継承下水路が対象で、**`seasonalCold` の Burg にしか適用されていなかった**（温暖な閉鎖流域は素通りしていた） | `export` して `urbanWaterClimate.ts`（`resolveBurgBasinKind`）から再利用。`seasonalCold` ゲートを外し、全 Burg・全気候で無条件に適用するよう一般化 |
| `waterSecurity` / `riverPollutionLoad` の分離 | 既に分離済みだった。`waterSecurityScoreFromSystem()`（`drinkingWaterSecurity * 60 + (1 - waterContamination) * 40`）が `Burg.waterSecurity` を書き込み（`docs/plan/epidemic-cholera-and-water-security.md §3.1`）、`downstreamPollutionExport`/`upstreamPollutionImport` が `propagateRiverPollution()` で川沿いに Burg 間を伝播していた | 変更なし。ただし `hasDownstreamOutfall` の地理判定が甘く、伝播の入力自体が不正確だった（§12.2） |
| `drinkingTreatmentTier` / `wastewaterTreatmentTier` | `UrbanWaterSystem` に既存（Giant は 1、他は 0 固定、進行ロジックなし） | 変更なし。Tier 進行ロジック（低速砂濾過等の投資）は Phase 2 の範囲 |

### 12.2 新規実装

- **`hasDownstreamOutfall` の地理バグ修正**（`urbanWaterSystem.ts`）: 従来は `geography.hasRiver || geography.isCoastal || hasRegionalRomanSewerOutfall` で、川が実際に海へ到達するか（`basinKind`）を一切見ていなかった。内陸で消失する川沿いの Burg でも無条件に「下流放流先あり」と扱われ、`downstreamPollutionExport` を無制限に外部化できてしまっていた。`(geography.hasRiver && basinKind === "openBasin") || geography.isCoastal || hasRegionalRomanSewerOutfall` に修正。`pollutionExport()`（`urbanWaterInstitutions.ts`、既存）は `!hasDownstreamOutfall` のとき既に汚濁を局所化する実装だったため、`sealedStorageAndInfiltration` 相当の容量経済（§6 の `winterStorageFill` 等）を新設しなくても、この一行修正だけで閉鎖流域の Burg は自分の汚水を輸出できなくなる。
- **Giant 継承下水路の同型バグも修正**（`urbanSewerage.ts`）: `hasSameLandSewerOutfall`/`chooseSameLandSewerOutfall`/`buildDownhillSewerNetwork` の3箇所で `seasonalCold` ゲートを外し、閉鎖流域の回避と貯留地フォールバック（`chooseSameLandStorageSite`）を気候によらず常時適用。温暖な閉鎖流域の Giant 国家が、以前は閉鎖河川へそのまま継承下水路を通せてしまっていた不整合を解消。
- **`UrbanWaterSystem` に3フィールド追加**: `basinKind`、`thermalRegime`、`effluentDestination`（`"riverOutfall" | "coastalOutfall" | "sealedStorageAndInfiltration"`、`resolveBurgEffluentDestination()` で導出）。いずれも `previous` からの引き継ぎではなく毎年ジオグラフィから再計算する、`hasUpstreamIntake`/`hasDownstreamOutfall` と同じ性質のフィールド。
- **`RegionalWaterScheme` の型のみ追加**（`urbanWaterTypes.ts`）: §9.4 のインターフェースと完全一致。生成・永続化・参照のいずれも未実装（Phase 3 の範囲）。`Culture.modernizationAffinity`（§11）と同じく「後続フェーズが依拠する型を先に用意する」方針。

### 12.3 `ModernWaterTreatmentSystem` を独立した型にしなかった理由

当初案（§6）は `ModernWaterTreatmentSystem` を `UrbanWaterSystem` とは別の型として新設する想定だった。しかし実装時点で `drinkingTreatmentTier`/`wastewaterTreatmentTier`（Giant 専用初期値として既存）が既に `UrbanWaterSystem` 本体のフィールドとして存在しており、別オブジェクトに分離すると同じ「浄水・下水の整備度」を表す情報が二箇所に分裂する。既存の設計判断（`hasUpstreamIntake`/`hasDownstreamOutfall`/`hasInheritedRomanWaterworks` も全て `UrbanWaterSystem` 直下）に合わせ、`ModernWaterTreatmentSystem` という別名の型は作らず、§6 の該当フィールドを `UrbanWaterSystem` へ直接統合する方針とした。§6 の残りのフィールド（`sourceProtection`、`treatedWaterCapacity`、`chlorineStockCoverage`、`chemicalTestCoverage`、`effluentCompliance`、`combinedSewerOverflow`、`sludgeBacklog`、`winterStorageFill`、`seasonalInfiltrationCapacity`）は、対応する投資・運転ロジック（Phase 2/4/5）が実装される時点で同様に `UrbanWaterSystem` へ追加する想定とし、今回は先行実装しない（AGENTS.md の「今存在しない仕組みのために作らない」方針）。

### 12.4 未着手（Phase 2 以降に残した項目）

- `drinkingTreatmentTier`/`wastewaterTreatmentTier` の投資進行ロジック（低速砂濾過・一次沈殿等）。非 Giant Burg は依然として恒久的に Tier 0。
- `sealedStorageAndInfiltration` の容量経済（`winterStorageFill`、`seasonalInfiltrationCapacity`）。今回は `effluentDestination` の分類のみで、`hasDownstreamOutfall = false` による汚濁の局所化は既存の `pollutionExport()` に委ねている。
- `RegionalWaterScheme` のライフサイクル（提案→調査→交渉→資金→建設→試運転→運転）。
- `modernizationAffinity`（§11）を Tier 初期値・投資速度へ実際に接続すること。

---

## 13. Phase 2 実装メモ（実装済み・2026-08-23）

**状態: 実装済み**。§12 で追加した `drinkingTreatmentTier`/`wastewaterTreatmentTier` は、それまで巨人国家だけが 1 に固定され、他の全 Burg は生成時 0 のまま**進行ロジックが一切存在せず**、しかもどの計算式からも参照されない純粋なデータだった（`drinkingWaterSecurity`/`waterContamination` に何の影響も与えていなかった）。Phase 2 はこの2つの穴を埋めた: 通常 Burg 向けの年次投資ロジックと、実際にゲーム上の数値へ反映する接続。

### 13.1 新設ファイル `urbanWaterModernTreatment.ts`

既存の `WaterWorksProjectKind`（開放側溝→衛生分離の単一梯子）へ新プロジェクトを追加する案も検討したが、`WATER_WORKS_PROJECT_LABELS` 等の全 UI/参照テーブルに era ゲート付き近代プロジェクトが漏れ出すため、既存の `urbanWaterTech.ts`（Phase 4 late tech）と対をなす、独立した小さいモジュールとして実装した。

- **`sourceProtection`**（水源保護、0..1）: `hasUpstreamIntake` が前提。単独でも `drinkingWaterSecurity` に小さいボーナスを与える（§2 の優先1が優先3と独立した価値を持つという記述に対応）。
- **`drinkingTreatmentUpgradeProgress` → `drinkingTreatmentTier` 0→1**（低速砂濾過）: `sourceProtection >= 0.6` を前提条件とする（§4.1 の技術グラフが `slowSandFiltration` を `protectedIntakeAndWaterRecords` に依存させている構造を反映）。同一年内に水源保護がこの閾値を超えれば、同じ年のうちに濾過投資へ連鎖しうる。
- **`wastewaterTreatmentUpgradeProgress` → `wastewaterTreatmentTier` 0→1**（一次沈殿）: 独立した経路。`hasDownstreamOutfall`（§12 で一般化済み、閉鎖流域では false）が前提。
- **era ゲート**: `historicalPeriod` が `steamEra` 以降（§4 の Stage B、cultures-generator.ts の `Industrial` 文化ゲートと同一閾値）。
- **人口ゲート**: 400人未満は対象外。
- **`modernizationAffinity`（§11）を初めて実際に配線**: 投資速度の乗数としてのみ使用し（0.35〜1.65倍）、era/地理ゲートには一切影響しない（§11.4 の「技術的に不可能なことを可能にはしない」という設計方針どおり）。
- **建設費と運転費の分離**（§5.1「四つの財布」）: 建設（一回限り、`MODERN_CONSTRUCTION_BUDGET_SHARE = 0.06`）と運転（毎年、`MODERN_OPERATIONS_BUDGET_SHARE = 0.03`）を別プールとして扱う。Tier に到達していても `treatmentOperationsFunding`/`wastewaterOperationsFunding` が低ければ、下記13.2の効果はほとんど得られない（§5.1「施設はあるが安全性は低い」を再現）。
- **年次実行順**: `settleBurgWaterInvestment`（既存レガシー投資）の後に呼ぶ。同じ Burg treasury を取り合うため、基礎的な既存インフラの維持・建設が優先され、近代化投資は残った予算から行う設計とした。
- **意図的な簡略化**（未実装のまま残した部分、忘れないよう明記）: 建設費は現金のみで、既存の `purchaseProjectMaterials`（Stone/Tools/Brick の市場調達）は近代プロジェクトには接続していない。将来、Phase 2 のゲームプレイが妥当だと確認できた時点での接続を推奨する。

### 13.2 `computeUrbanWaterSystem` への接続（このフェーズの核心）

新設フィールドが実際に効果を持つよう、既存の3つの式に項を追加した:

| 式 | 追加した項 |
| --- | --- |
| `waterContamination` | `- sourceProtection * 0.06 - (drinkingTreatmentTier >= 1 ? 0.12 * treatmentOperationsFunding : 0)` |
| `drinkingWaterSecurity` | `+ sourceProtection * 0.05 + (drinkingTreatmentTier >= 1 ? 0.2 * treatmentOperationsFunding : 0)` |
| `treatmentFactor`（`downstreamPollutionExport` の入力） | `× (wastewaterTreatmentTier >= 1 ? 1 - 0.35 * wastewaterOperationsFunding : 1)` |

3行目は、`riverPollutionLoad`（§1/§12 で `downstreamPollutionExport`/`upstreamPollutionImport` として既に実装済みと確認した信号）を下げる直接の経路であり、「上流の一次処理場が下流 Burg の水安全を守る」という本書全体の前提を、初めて数値として成立させている。

### 13.3 巨人国家の扱い

巨人は `settleModernWaterTreatmentInvestment` を一切通らない（§12 で確認した通り `computeUrbanWaterSystem` 内で `isGiantState` 分岐が毎回上書きするため）。今回、`sourceProtection: 1`、`treatmentOperationsFunding`/`wastewaterOperationsFunding: 0.9` を同じ分岐へ追加した — 巨人の継承インフラが「存在するが13.2の効果を一切生まない」という抜け（Phase 2 実装前は該当フィールドがどの式からも参照されていなかったため、巨人の Tier 1 も無効果だった）を、他の巨人向け既存シード値（`connectionPermitCoverage: 0.86` 等）と同水準でふさいだ。

### 13.4 未着手（Phase 3 以降に残した項目）

- 建設費の Goods 連動（現状は現金のみ）。
- Tier 2以降（急速濾過・塩素消毒 = Phase 4、生物処理 = Phase 5）。
- `RegionalWaterScheme` のライフサイクル本体（§9.2 の提案→調査→交渉→資金→建設→試運転→運転）。単独 Burg の `sourceProtection`/Tier 進行は実装したが、複数 Burg にまたがる広域水源・導水路の共同事業はまだ存在しない。
- `sealedStorageAndInfiltration` の容量経済（`winterStorageFill`、`seasonalInfiltrationCapacity`）— §12 から持ち越し、未着手のまま。

---

## 14. Phase 3 実装メモ（実装済み・2026-08-23）

**状態: 実装済み**。§12.3 で「`RegionalWaterScheme` は §9.4 のインターフェースと完全一致する型のみ先行実装し、生成・永続化・参照はまだ存在しない」と明記した通り、Phase 2 終了時点でこの型は完全に未接続だった。Phase 3 はこの型を初めて構築・永続化・毎年進行させ、かつ「川も海もない Burg がどうやって近代的な取水を得るか」という §1 の問い（単独 Burg では解けない）に、単独 Burg 向けの Phase 2 とは別の経路で答える。

### 14.1 新設ファイル `regionalWaterAuthority.ts`

`RegionalWaterScheme.status` の8状態（proposed → surveying → negotiating → funded → building → commissioning → operating、+ suspended）をそのまま状態機械として実装した。既存資産の再利用を徹底し、新規に書いたのは制度（誰がいつ何を承認・支払うか）の部分のみである:

- **経路探索は流用、新規実装なし**: 巨人の継承水道（`urbanWaterSupply.ts`）がすでに「どの河川セルを保護取水地にすべきか」（`chooseProtectedIntakeCell`）と「そこから各 Burg へ重力流下できる経路」（`buildAqueductTree`、内部で Dijkstra の `findGravityPath` を使用）を実装済みだったため、両関数を `export` して Phase 3 からそのまま再利用した。巨人の遺産水道と交渉済みの `RegionalWaterScheme` は「どの水源をどう護るか」という物理法則を共有しており、別実装を持つ理由がない。
- **描画も流用**: `RegionalWaterScheme.routeCellIds` は §9.4 の「幹線のみ」の定義通り重複排除済みセル集合として永続化するに留め、点列は永続化しない。`drawWaterSupply.ts` は描画のたびに `sourceCellId`/`memberBurgIds` から `buildAqueductTree` を再実行して枝の形状を再構成する — 巨人の遺産経路が「毎回再計算・非永続化」なのと同じ設計。
- **循環 import の回避**: `urbanWaterSystem.ts` はこのファイルの `getRegionalSchemeConnectedBurgIds()` を import する（§14.2）。逆方向の import は循環になるため、`urbanWaterSystem.ts` 側にしかなかった `actualUrbanPeople`/`modernizationAffinityForBurg` 相当のロジックはこのファイル内に小さく複製した（ファイル冒頭のコメントに明記）。

### 14.2 `computeUrbanWaterSystem` への接続

Giant の `hasRegionalRomanWaterConnection`（§12 で確認済み、`hasInheritedRomanWaterworks && hasSameLandGravityWaterSource(...)`）が使われている3箇所（`serviceWaterCapacity`、`drinkingBase`、`hasUpstreamIntake`）を、`hasRegionalRomanWaterConnection || hasRegionalSchemeConnection` という1つの `hasRegionalWaterConnection` にまとめた。`hasRegionalSchemeConnection` は `computeUrbanWaterSystem` の新規オプション引数で、呼び出し側（`buildSystems()`）が `getRegionalSchemeConnectedBurgIds()`（`status === "operating"` の全 `memberBurgIds`）から都度計算して渡す — Phase 2 の `drinkingTreatmentTier` 等と同じ「呼び出し側が注入する」パターンを踏襲した。

`RegionalWaterAuthority.settleAnnual()` は `UrbanWater.settleAnnual()` の直後に実行される（index.tsx）。同じ年の `hasUpstreamIntake` を読んでスキームを進行させるため、スキームが `operating` になった効果が実際の `hasUpstreamIntake` に反映されるのは**翌年から**になる — `PowerGridInvestment` が前年の `Dam`/`PowerStation` 出力を読む一年遅れと同じ設計。

### 14.3 制度設計での簡略化（意図的、§13.1 に続く開示）

- `authorityKind` は常に `"stateWaterAuthority"`。State を持たない都市連合（`"charteredWaterUnion"`）は未実装。
- §9.3 の既定按分（State 50% / 受益 Burg 40% / 起債 10%）を State 60% / Burg 40% に単純化し、起債という別の資金手段は持たない。
- 交渉（negotiating）は「State が定額の交渉費を払えるか」だけを見る簡略なチェックであり、Burg ごとの水利権・補償交渉は再現していない — 交渉が成立した年に参加 Burg 全員が自動的に `approved` になる。
- `chooseProtectedIntakeCell` の下水放流地点除外リストは空配列で呼んでいる。既存 Burg の汚水放流点の下流に取水地を選んでしまう可能性を、この Phase ではまだ塞いでいない。
- `contractedCapacityByBurg` は人口比のみで決め、渇水時配分（§9.3）は未実装。

これらは「まだ存在しない仕組みのために作り込まない」方針に基づく単純化であり、`RegionalWaterAuthority` のファイル冒頭コメントに同じ内容を明記した。

### 14.4 未着手（Phase 4 以降に残した項目）

- §14.3 の全項目（都市連合、起債、Burg 単位の交渉、下水放流点の除外、渇水配分）。
- `compensationReserve`（§9.3 の水源地・通過地補償）— インターフェースには存在するが、このPhaseでは一度も加算されない。
- 建設費・運転費の Goods 連動（Phase 2 から持ち越し、依然として現金のみ）。
- `toggleSewerage` 側の `RegionalWaterScheme` 対応（§8 Phase 5 の範囲 — 本 Phase は `toggleWaterSupply` のみ）。

---

## 15. Phase 4 実装メモ（実装済み・2026-08-23）

**状態: 実装済み**。§13.4/§14.4 で「Tier 2以降（急速濾過・塩素消毒）」として持ち越されていた項目。`drinkingTreatmentTier` の型自体は Phase 1 の時点で `0 | 1 | 2 | 3` を許容していたが、Phase 2 が実装した投資ロジックは Tier 0→1 で止まっており、Tier 2・3 へ進める経路はどこにも存在しなかった。Phase 4 はこの2段を追加する。

### 15.1 同じ進捗メーターを使い回す設計

Phase 2 の `drinkingTreatmentUpgradeProgress`（0..1）は Tier 0→1 専用の名前ではなく、汎用の「次の Tier への進捗」を表す値としてすでに設計されていた（Tier 完了時に 0 へリセットされる）。そのため Phase 4 は新しい進捗フィールドを追加せず、同じメーターを Tier 1→2・Tier 2→3 でも再利用する形にした。`urbanWaterModernTreatment.ts` の Step 2 は次のように一般化した：

```text
現在の drinkingTreatmentTier に応じて次の一歩が解禁されているかを判定
  0: sourceProtection >= 0.6（Phase 2 から変更なし）
  1: analyticalChemistry が対象 State で demonstrated 以上（新規）
  2: catalyticChemistry が対象 State で demonstrated 以上（新規）
解禁されていれば、その段の建設費（240 / 420 / 560、people でスケール）へ課金し、
進捗が 1 に達したら drinkingTreatmentTier をインクリメントして進捗を 0 に戻す。
```

### 15.2 発見・修正した Phase 2 の潜在バグ

`settleModernWaterTreatmentInvestment` の早期リターン条件は元々 `drinkingTreatmentTier >= 1 && wastewaterTreatmentTier >= 1` だった。これは「もう建設することがないなら丸ごと何もしない」つもりだったが、実際には**運転予算（`treatmentOperationsFunding`/`wastewaterOperationsFunding`）の計算も毎年ゼロに固定してしまう**バグだった。両方の Tier が 1 に達した年以降、恒久的にゼロ運転予算が返り続け、`computeUrbanWaterSystem` 側の `drinkingTreatmentTier >= 1 ? 0.2 * treatmentOperationsFunding : 0` のような項が常に無効化される——「施設はあるが安全性は低い」ではなく「施設があっても未来永劫ゼロ」になっていた。

これが Phase 2 のテストで見つからなかった理由は、既存テスト「funds operations only once a tier has actually been reached」が `wastewaterTreatmentTier: 0` を使っており、ガード条件を偶然満たしていなかったため。Phase 4 は Tier を 1 より先へ進める必要があり、この早期リターンをそのまま残すと Tier 2/3 へ絶対に進めなくなるため、ガードを「era/人口ゲートのみ」に絞り込んで修正した（§13.4 のスコープカット一覧には無かった、実装中に発見した独立のバグ）。§14 までの慣行（Phase 1 の `hasDownstreamOutfall` 地理バグ発見と同型）を踏襲し、テスト名にも regression として明記した。

### 15.3 巨人国家への副作用と対策

上記の早期リターン修正により、もう一つの隠れた効果が消えた：巨人国家は `computeUrbanWaterSystem` の `isGiantState` 分岐で毎年 `drinkingTreatmentTier`/`wastewaterTreatmentTier` を強制的に 1 に上書きされる。この結果 `settleModernWaterTreatmentInvestment` に渡る `previous.drinkingTreatmentTier`/`wastewaterTreatmentTier` は常に両方 1 になり、旧ガードはこれを「もう何もしない」と偶然正しく判定していた。ガードを外すと、`analyticalChemistry`/`catalyticChemistry` がたまたま demonstarted になった巨人国家に対して、この関数が Tier 2/3 の建設費を実際に treasury から引き落とし始める——にもかかわらず `computeUrbanWaterSystem` は結果を毎回 1 へ上書きして捨てる、つまり巨人の国庫が無意味に浪費される。

対応として `buildSystems()`（`urbanWaterSystem.ts`）に明示的な分岐を追加し、巨人国家では `settleModernWaterTreatmentInvestment` の呼び出し自体をスキップするようにした。以前のコードのコメントには「No-ops for Giants（already seeded）」と書かれていたが、これは上記の偶然の産物を意図した挙動であるかのように誤記していたもので、Phase 4 で初めて本当に正しい実装になった。

### 15.4 `computeUrbanWaterSystem` への接続

Tier 1 と同じ「運転充足度で効果を減衰させる」パターンを踏襲しつつ、Tier 2・3 独自の追加ゲートを設けた：

| 式 | Tier 2（急速濾過・凝集） | Tier 3（塩素消毒） |
| --- | --- | --- |
| `waterContamination` の追加項 | `- 0.1 * treatmentOperationsFunding * chemicalTestCoverage` | `- 0.14 * chlorineStockCoverage * treatmentOperationsFunding` |
| `drinkingWaterSecurity`（`modernDrinkingBonus`）の追加項 | `+ 0.15 * treatmentOperationsFunding * chemicalTestCoverage` | `+ 0.2 * chlorineStockCoverage * treatmentOperationsFunding` |

Tier 2 は運転資金だけでなく `chemicalTestCoverage`（水質検査の実施状況）にも懸かる——投薬量を検査していない急速濾過は§1の「残留消毒剤の検査…そろえて初めて `drinkingWaterSecurity` を高くできる」という前提に反するため。Tier 3 は実際の `Chlorine` Good 在庫（`chlorineStockCoverage`）と運転資金の両方を要求する。

### 15.5 `Chlorine` の実消費（このフェーズの核心）

Tier 3 のみ、`Markets.consumeForMarketInvestment`（`purchaseProjectMaterials` が Stone/Tools/Brick に使うのと同じ有償引き出しプリミティブ）で Burg の地元市場から `Chlorine` を実際に購入する。これは Phase 2/3 の「現金のみ」路線からの意図的な逸脱であり、§8 が Phase 4 の核心として明記した「`Chlorine` 消費」を Good ベースの実在する希少性として実装するためである。塩素工場（`chlorinePlants.ts`/`chlorAlkaliPlants.ts`）は稼働プラント1つあたり年 0.15〜0.6 バレルしか産出しないため、`chlorineAnnualNeed()` は人口比で小さく（例: 人口5000で年0.06バレル）設定し、大都市の需要でも近隣の塩素プラント1〜2基の産出量に収まる規模にした。地元市場に `Chlorine` の在庫や交易路がなければ、予算があっても `chlorineStockCoverage` は上がらない——化学工業と塩素供給網（既存の `catalyticChemistry` ゲート）へ実在する依存を生む設計とした。

### 15.6 未着手（Phase 5 に残した項目）

- 生物処理（散水ろ床・活性汚泥）、`wastewaterTreatmentTier` の 1 超え。
- 建設費・運転費・Chlorine 以外の Good の連動は依然として現金のみ（Tier 2 の `Alum` 連動は §17.1 で実装）。
- `chemicalTestCoverage`/`chlorineStockCoverage` の流域補償・`toggleSewerage` への接続（Phase 5 の範囲）。
- `rapidFiltrationAndCoagulation`/`controlledWaterChlorination` を §4.1 が示す独立した技術ノードとして技術グラフに追加すること——今回は既存の `analyticalChemistry`/`catalyticChemistry` を再利用するに留めた（Phase 1〜3 が独自の技術ノードを作らなかった前例を踏襲し、UI/セーブ互換への影響を避けるための意図的な選択）。

---

## 16. Phase 5 実装メモ（実装済み・2026-08-23）

**状態: 実装済み**。§15.6 で持ち越されていた最後の項目。`wastewaterTreatmentTier` は Phase 2 の Tier 0→1（一次沈殿）で止まっており、Tier 2（生物処理）・Tier 3（活性汚泥）へ進める経路がなかった。Phase 5 はこの2段を追加し、あわせて汚泥処理・放流水検査・流域補償・`toggleSewerage` を実装した。

### 16.1 同じ進捗メーターを使い回す設計（Phase 4 と同型）

`wastewaterTreatmentUpgradeProgress`（0..1）は Phase 2 の時点で Tier 0→1 専用の名前ではなく、汎用の「次の Tier への進捗」として設計されていた。Phase 4 が飲料水側のラダーで確立した「同じメーターを使い回し、Tier 完了時に 0 へリセットする」設計をそのまま下水側にも適用した。`wastewaterTreatmentStepCost(fromTier, people)` が段ごとの建設費（260 / 480 / 640、people でスケール）を返す。

### 16.2 `sanitaryEngineering` を技術ゲートとして再利用（既存資産の発見）

§8 の表が Phase 5 の「既存資産との接続」として明記していた `sanitaryEngineering` は、`urbanWaterTech.ts` の `evolveWaterTechStocks()` がすでに毎年計算している Burg 単位の 0..1 スタックだった（レガシー `tier`（旧梯子）が3以上になり、かつ administration が一定水準を超えないと育たない、意図的に遅い指標）。Phase 4 が `analyticalChemistry`/`catalyticChemistry`（グローバルな State 技術段階）を再利用したのと同じ精神で、Phase 5 は新しい技術ノードを追加せず、この既存スタックをそのままゲートに使う：

| 段階 | ゲート |
| --- | --- |
| Tier 0→1（一次沈殿、Phase 2 から変更なし） | `hasDownstreamOutfall` のみ |
| Tier 1→2（散水ろ床／生物処理） | `sanitaryEngineering >= 0.32` |
| Tier 2→3（活性汚泥） | `sanitaryEngineering >= 0.5` かつ `generatorAndMotor` が対象 State で known 以上 |

`generatorAndMotor` は dams.ts が自身の電化判定にすでに使っている既存の技術ノードで、"送風機・電力・機械工" という §3.1 の活性汚泥法の要件に対応する。新しい技術ノードは一つも追加していない。

### 16.3 `computeUrbanWaterSystem` への接続——3つの新しい掛け算

Tier 1 の「運転充足度で減衰させる」パターンを踏襲しつつ、Tier 2・3 独自の追加要素を `modernWastewaterTreatmentFactor` に掛け合わせた（値が小さいほど放流負荷を下げる、既存の符号規約どおり）：

| Tier | 追加した乗数 | 意味 |
| --- | --- | --- |
| 2（散水ろ床） | `1 - 0.3 * wastewaterOperationsFunding * effluentTestCoverage * sludgeCapacityFactor` | 運転資金と放流水検査の両方が必要（未検証の生物処理は信用しない、Phase 4 の `chemicalTestCoverage` と同じ理由）。`sludgeCapacityFactor`（`1 - sludgeBacklog * 0.6`）で汚泥滞留による能力低下を織り込む |
| 3（活性汚泥） | `1 - 0.25 * wastewaterOperationsFunding * electricityCoverage` | `Market.electricityStock` の実在するカバレッジで減衰。Chlorine と異なり購入・消費する Good ではなく、他プラントが既に読んでいる共有容量シグナル（`chemMedCommon.ts` の `electricityCoverageForMarket()`）をそのまま流用 |

また `odor` にも `wastewaterTreatmentTier >= 2 ? sludgeBacklog * 0.15 : 0` を追加した——汚泥滞留は下流への輸出量を減らすだけでなく、§3.1 が明記する「汚泥腐敗、悪臭」という局所的な迷惑でもあるため。

**実装中に発見・修正したバグ**: `sludgeCapacityFactor` の符号を最初は逆（`1 - backlog*0.4` をペナルティとして directly 乗算）に書いてしまい、テストで「汚泥が滞留しているのに `downstreamPollutionExport` が下がる」という逆の結果が出て発覚した。§15.2 と同じく、テストが実装のバグを検出した例として明記する。修正後は `sludgeCapacityFactor` を Tier 2 の**便益量そのもの**に掛ける形にし、滞留がどれだけひどくても「Tier 2 が全く無い状態より悪化する」ことはない（下限は Tier 1 相当の乗数）よう設計した。

### 16.4 `sludgeBacklog` は蒸発する係数ではなく実際に評価される在庫

`chemicalTestCoverage`/`chlorineStockCoverage`（Phase 4）や `effluentTestCoverage`（本フェーズ、新規）は毎年ゼロから再計算される「今年の充足率」だが、`sludgeBacklog` だけは `sourceProtection` と同じ「年をまたいで持ち越される実在の在庫」として設計した（`previous.sludgeBacklog` 経由）。EWMA で評価する：

```text
sludgeBacklog(次年) = sludgeBacklog(前年) * 0.7 + (1 - sludgeOpsFunding) * 0.3
```

資金が続けば徐々に解消し、途切れれば徐々に積み上がる——「一年未払いで即座に全汚泥が滞留する」でも「一年払えば即座に解消する」でもない、現実的な遅延を表現する。`wastewaterTreatmentTier < 2` の間は毎年 0 にリセットする（生物処理由来の汚泥がまだ存在しないため）。

### 16.5 `toggleSewerage`——意図的に狭くした範囲

§9.1 の `toggleSewerage` 行が示す表示内容（「幹線下水、ポンプ場、雨水吐、**下水処理場**、放流口、汚泥処理地」）のうち、本フェーズが実装したのは「各 Burg 自身の処理場の状態表示」のみである。`RegionalWaterScheme`（Phase 3）に相当する「複数 Burg が交渉して建設する広域下水網」は、ドキュメント中のどこにも明示的なデータ構造（`RegionalSewerScheme` 等）が定義されておらず、今回新設しなかった——存在しない仕組みのために作り込まない、という一連のフェーズの一貫した方針に従う。

代わりに `drawSewerage.ts` を拡張し、`wastewaterTreatmentTier >= 1` の全 Burg（巨人の継承経路を除く）に、Tier に応じたアイコン（🪣 一次沈殿／🌾 生物処理／⚙️ 活性汚泥）と `sludgeBacklog` に応じた不透明度のマーカーを追加した。巨人の継承幹線下水路（`buildInheritedSewerRoutes`、Phase 1 以前から存在）とは別レイヤーの重ね描きとして共存する。

### 16.6 流域補償は追加実装不要だった（既存資産の発見）

§8 が Phase 5 の既存資産として名指ししていた「上流・下流汚染外交」——`urbanWaterTech.ts` の `buildInterstatePollutionEdges`/`settlePollutionCompensation`/`applyPollutionDiplomaticAlert` と、それを呼び出す `urbanWaterSystem.ts` の `applyPollutionDiplomacy()`——は、Phase 1 の監査時点で `downstreamPollutionExport`/`upstreamPollutionImport` を入力に、既に稼働していることを確認済みだった（§12.1）。Phase 2 で `wastewaterTreatmentTier >= 1` が `downstreamPollutionExport` を下げる経路を接続した時点で、この既存の補償システムはすでに間接的に接続されていた。Phase 5 が `wastewaterTreatmentTier` を 2・3 まで伸ばしたことで、同じ経路を通じて上流 Burg の補償負担がさらに下がる——新規のコードを一切書かずに、§8 が求める「流域補償」との接続が完成した。

### 16.7 未着手（将来拡張）

- Phase 4 と同じく、建設費は現金のみ（砕石・送風機などの Good 連動は将来の拡張）。
- `RegionalSewerScheme`（複数 Burg が交渉する広域下水網）は未実装。単独 Burg の `wastewaterTreatmentTier` 進行のみ。
- `biologicalWastewaterTreatment`/`activatedSludgeAndEffluentControl` を §4.1 が示す独立した技術ノードとして追加すること——Phase 4 と同じ理由で見送った。
- 高度処理（栄養塩・微量化学物質除去、§4 の Stage F）は本書の対象外のまま。

---

## 17. Industrial 国家の生成時シード、Alum/Lime 消費、近代ラダー税（実装済み・2026-08-23）

**状態: 実装済み**。§11.4 が Phase 1 実装時の提案として残していた「文化圏の近代化適性を Tier 初期値へ接続する」方向性とは別の切り口として、historicalPeriod と CultureType という2つの生成時条件から直接シードする経路（§17.1）、Phase 4 が Chlorine のみだった実 Good 消費を Tier 2 へも広げる経路（§17.2、Alum + Lime）、複数の Good 消費経路が同一マーケット在庫を無調整に奪い合う競合を防ぐ経路（§17.3）、`cleaningTaxRate`（Phase 3、§4 相当）を新設の近代ラダーへ接続する経路（§17.4）の4点を追加した。`modernizationAffinity` 自体への接続は §11.4 の提案のまま未着手で残っている——今回追加した4点はいずれもそれとは独立した経路である。

> **2026-08-23 追記: `modernizationAffinity` 自体への接続は §20 で実装済み。** 上の一文は §17 執筆時点（§20 より前）の記述で、歴史的経緯として残す。§11.4 の3提案の最終状態は §11.5 にまとめてある。

### 17.1 `industrialModernWaterworksSeed()`——rocketryEra × Industrial 国家の生成時シード（§20 で一般化・置換済み）

> **この節は歴史的記録として残す。実装は §20 で `modernWaterworksGenerationSeed()` へ一般化・置換された**（関数名も変更）。era ゲートを `rocketryEra` 固定から `steamEra` 以降の連続スケールへ、文化ゲートを State レベルの `Industrial` 二値判定から Burg レベルの `modernizationAffinity` 連続値へ広げている。以下は置換前の元の設計。

`urbanWaterSystem.ts` に `giantRomanWaterworksSeed()` と対になる関数を新設した。地図生成オプションの `historicalPeriod` が `rocketryEra` で、かつ Burg の所属 State の `culture`（`state.culture` が指す `Culture.type`、§11.2/§11.3）が `Industrial` の場合のみ、`buildSystems()` の `mode === "generate"` 分岐（`giantRomanWaterworksSeed()` が null を返した場合のフォールバック）で読まれる。

Burg 人口（`actualUrbanPeople()`、他の近代処理と同じ計算式）で `drinkingTreatmentTier`/`wastewaterTreatmentTier` の初期値を3段階に分けた——`initialTier()`（本ファイル既存、レガシー `tier` の生成時判定）がすでに使っている 4,000/15,000 人のしきい値をそのまま再利用し、新しいしきい値を作らなかった：

| 人口 | 初期 Tier |
| --- | --- |
| `MODERN_WATER_MIN_POPULATION`（400人）未満 | シードなし（0のまま） |
| 400〜3,999人 | 1 |
| 4,000〜14,999人 | 2 |
| 15,000人以上 | 3 |

Giant のシードと異なり、これは**生成時の頭出しのみ**——`computeUrbanWaterSystem` の `isGiantState` 分岐のように毎年強制的に上書きし続けることはしない。生成後は通常の Burg と同じく年次投資・維持（`settleModernWaterTreatmentInvestment`）に委ねられる。州レベル（`state.culture`）でゲートする点は `raceKeyForBurgState()`（Giant のゲート）や `getStateMaritimeAptitude()`（Naval CultureType のゲート、`technologyProgress.ts`）と同じ粒度に合わせた——Burg 個別の局所文化ではなく、征服等で局所文化が異なっていても国家全体に適用される。

### 17.2 `Alum`/`Lime` の実消費——Tier 2（急速濾過・凝集）への Good 接続

§15.6/§16.7 で「Chlorine 以外の Good 連動は現金のみ」と持ち越されていた項目のうち、Tier 2（`rapidFiltrationAndCoagulation`）分を実装した。`urbanWaterModernTreatment.ts` に Phase 4 の Chlorine 購入ブロックと対になる購入ブロックを2つ追加した：主薬剤の `Alum`（`coagulantStockCoverage`、0..1）と、凝集後の pH 調整・軟化用の副次的な `Lime`（`limeStockCoverage`、0..1）。どちらも `goods-generator.ts` の既存 Good をそのまま流用し、新しい Good は追加していない。

`chlorineAnnualNeed()` が実在する塩素工場の産出量（年0.15〜0.6バレル/プラント）から逆算した具体的な数字を持つのに対し、`Alum`/`Lime` にはどちらも対応する専用の採掘・精製チェーンが存在しないため、`coagulantAnnualNeed()`/`limeAnnualNeed()` は独自の実測値を主張せず、`chlorineAnnualNeed()` と同じ「控えめに小さく保つ」方針だけを踏襲した概算値にとどめている——専用の産出チェーンができた際は見直しが必要。

`computeUrbanWaterSystem` の Tier 2 の項（`waterContamination`/`drinkingWaterSecurity` 双方）への接続は Alum と Lime で非対称にした。`coagulantStockCoverage`（Alum）は既存の `treatmentOperationsFunding`（運転資金）・`chemicalTestCoverage`（検査充足度）と並ぶ3つ目の**必須**乗数——実際の Alum 在庫がなければ Tier 2 の便益はほとんど得られない、Tier 3 の `chlorineStockCoverage` と同じ設計。一方 `limeStockCoverage`（Lime）はこの乗算項には加えず、**独立した小さな加算ボーナス**（`waterContamination` に `-0.03`、`drinkingWaterSecurity` に `+0.04`、いずれも `treatmentOperationsFunding` とのみ掛け合わせ）として実装した——現実の凝集処理も Alum が主薬剤で Lime は pH 補正の副次工程であることを反映し、また4つの乗数を1つの項に積み重ねると Tier 2 の便益がほぼゼロまで縮む設計上のリスクを避けるため。Alum はあるが Lime が手に入らない Burg でも、Alum 由来の便益はそのまま得られる。

### 17.3 `Markets.consumeForMarketInvestment` の在庫シェア上限——同一マーケット在庫の無調整競合を防ぐ

実装レビュー中に発見: `Alum` は既存の `apothecaryWorkshops.ts`（アジャンクト材料）の、`Lime` は既存の `constructionEmployment.ts`（Roman Concrete の原料、建設業全体で広く使われる高流通量の財）の、それぞれ確立した消費先を持っていた。`Markets.consumeForMarketInvestment`（Chlorine の購入で Phase 4 から使われている、予算上限付きの有償引き出しプリミティブ）はそれまで在庫シェアの上限を持たず、`requestedUnits`/`budget`/現在庫のいずれか小さい方まで引き出せた——つまり、同一マーケット在庫を調整なしに共有する2つの独立した系のうち、その年のサイクル内でどちらが先に呼ばれるかによって、片方が在庫を独占してしまう可能性があった（`ChlorAlkaliPlants` のコメントが `Salt` 競合について「a modeling nuance, not a blocker」と明記している既存の許容パターンと同型だが、Lime は Roman Concrete という高流通量の既存消費先と競合する点でリスクが大きいと判断した）。

`markets-generator.ts` の `consumeForConstruction`/`consumeForMint`/`consumeForMilitary`/`consumeForMetallurg` が既に持っていた「現在庫の一定シェアまでしか引き出さない」という確立済みパターン（`consumeForMint` の 0.2 上限が先例）を `consumeForMarketInvestment` にも一般化し、任意の `maxStockShare`（0..1、省略時は 1 = 従来どおり無制限）を追加した。既存の全呼び出し元（Chlorine、AgTechInvestment、IndustrialTechInvestment 等、計7箇所）はこの引数を渡していないため、挙動は完全に変わらない。Alum/Lime の新規購入だけが `MODERN_TREATMENT_GOOD_MAX_STOCK_SHARE = 0.2`（`consumeForMint` と同じ値）を渡し、どちらの呼び出し順でも現在庫の20%までしか取れないようにした——確立済みの大口消費先（Roman Concrete/apothecary）が常に大半を確保できる。

### 17.4 `cleaningTaxRate` の近代ラダー加算

`urbanWaterInstitutions.ts` の `cleaningTaxRate`（Phase 3 で導入済み、レガシー `tier` にのみ連動する自己財源の清掃税）に、`drinkingTreatmentTier`/`wastewaterTreatmentTier`（近代ラダー）に応じた加算項を追加した——塩素消毒・活性汚泥等の実在する経常的維持費を、税収という形で反映する。

既存の Burg（近代ラダーへ未投資、両 Tier とも0）の挙動を一切変えないことを最優先し、レガシー分の上限（`LEGACY_CLEANING_TAX_RATE_CAP = 0.04`、従来の唯一の上限だった値）とキャップの計算を完全に温存したまま、近代ラダー加算分（`MODERN_CLEANING_TAX_SURCHARGE_PER_TIER = 0.005` × 完了 Tier 数）を**その上に加算**し、合算後にのみ新しい上限（`CLEANING_TAX_RATE_CAP = 0.07`）を適用する二段構成にした。両 Tier とも0の Burg は `legacyRate + 0` が必ず旧上限0.04以下に収まるため、旧実装とビット単位で同じ値を返す。

### 17.5 未着手（将来拡張）

- `Alum`/`Chlorine`/`Lime` 以外の建設費（Stone/Tools/Brick 相当の近代版）は依然として現金のみ。
- `connectionPermitCoverage`/`dischargeRegulation`（`institutionalTargets` の他2項目）は近代ラダーへ未接続——今回は `cleaningTaxRate` のみに範囲を絞った。
- ~~`modernizationAffinity`（§11）の**近代ラダー**（`drinkingTreatmentTier`/`wastewaterTreatmentTier`）Tier 初期値への接続は §11.4 の提案のまま未着手~~ → **§20 で実装済み**（`modernWaterworksGenerationSeed()`）。§11.4 の3提案（Phase 1 初期値・Phase 2-5 投資速度・Nomadic/Desert 再ロール拡張点）の状態は §11.5 にまとめた。
- Chlorine の購入（Phase 4、Tier 3）には `maxStockShare` を適用していない——Bleaching Powder という潜在的な競合消費先はあるが era-6+ の小規模な化学財で、Phase 4 実装時点では確立した高流通量消費先ではなかったため、既存の挙動を変えずに残した。将来 Bleaching Powder の消費量が増えるようなら再検討する。

---

## 18. レガシー `tier` ラダーの生成時ボーナス——ペスト以降の時代選択×都市規模×文化（実装済み・2026-08-23）

**状態: 実装済み**。「ペストの発生した史実の時代（`lateMedieval`、i18n ラベルでは c. 1300-1500）以降・`rocketryEra` 以前を選んだ場合、都市の規模・文化・技術レベルに応じて上下水道のある都市を発生させる」という要望を実装した。

### 18.1 なぜ近代ラダーではなくレガシー `tier` ラダーか

§10 は「中世・古代風都市に近代処理場を遡及させない——古い都市が持つのは水源保護、重力式導水、沈砂、公共便所、汲み取り、排水であり、濾過・消毒・生物処理は化学・機械・検査・行政記録の積み上げ後に到達する」と明記している。`drinkingTreatmentTier`/`wastewaterTreatmentTier`（近代ラダー、Phase 2/4/5）の運用ゲート `isModernWaterEraAvailable()`（`urbanWaterModernTreatment.ts`）も `steamEra` 以降でしか true にならない——`lateMedieval`/`ageOfExploration`/`maritimeEra`/`preIndustrialEra` でこのラダーに Tier を種付けしても、`settleModernWaterTreatmentInvestment` の era ゲートが `treatmentOperationsFunding` 等を毎年ゼロへ強制し続け、Tier の数字だけが残って便益が一切出ない壊れたシードになる。

そのため今回は、era ゲートを一切持たないレガシー `tier` ラダー（`initialTier()`、開放側溝→衛生分離、既存の `settleBurgWaterInvestment` は era を問わず動く）側に実装した。こちらは「水源保護・重力式導水・排水」という §10 が明示的に中世都市へ許容している範囲そのものであり、ペスト以降の各時代でも矛盾なく機能し、その後の年次投資でも era に関わらず自然に進行し続ける。

### 18.2 `initialTier()` への拡張

`urbanWaterSystem.ts` の `initialTier()`（既存、人口・地理からレガシー `tier` を 0-2 で決める生成時関数）に、`historicalPeriod`/`modernizationAffinity`（§11）の2つの省略可能引数を追加した。省略時（既存の3呼び出し元のテスト、`earlyMedieval`/`highMedieval`/未設定）は既存の挙動と完全に同一——新しい計算パスに一切入らない。

`historicalPeriod` が `lateMedieval` 以降 `rocketryEra` 以下のいずれかで、かつ人口が `MODERN_WATER_MIN_POPULATION`（400人、`settleModernWaterTreatmentInvestment` と同じ床）以上の場合のみ、追加ボーナスを計算する：

```text
techLevelProgress = clamp01((その時代のランク - lateMedievalのランク2) / (rocketryEraのランク8 - 2))
readiness = techLevelProgress × modernizationAffinity（burg 自身の文化、§11）
populationBand = 1〜3（industrialModernWaterworksSeed()、§17.1 と同じ 400/4,000/15,000 人の3段階）
bonus = round(populationBand × readiness)
tier = min(ABSOLUTE_MAX_WATER_TIER, baseTier + bonus)
```

技術レベル（時代の進み具合）と文化（`modernizationAffinity`）を**両方**掛け合わせる設計にした——`Industrial` 文化が `lateMedieval`（時代がまだ追いついていない、`techLevelProgress = 0`）にいても、`Nomadic` 文化が `rocketryEra`（文化がその技術に定着しない、`affinity ≈ 0.08`）にいても、どちらもボーナスをほぼ得ない。`populationBand`（人口の3段階）でボーナスの大きさ自体も「都市の規模」に応じてスケールする——大都市ほど大きなボーナスを得られる。人口が床（400人）未満の集落は、暦がどれだけ進んでも文化がどれだけ近代化志向でも civic waterworks を得ない——規模そのものがゲートとして残る。

**バグ修正（2026-08-23）**: 初版はこのゲートを `baseTier > 0`（人口・地理スコアからの既存 0-2 Tier）としていた。`baseTier` は河川・湿地・洪水リスク・首都といった地理条件に強く依存する既存スコアで、内陸・平坦・非首都の「地理的に平凡な」都市は人口がいくら多くても score < 2 になりやすく、その場合 era/culture ボーナスの計算にすら入らず常に 0 のままだった（ユーザー報告: 「petroleumEra の Industrial でも上下水道が出てこない」）。ゲートを地理依存の `baseTier > 0` から人口のみの `people >= MODERN_WATER_MIN_POPULATION` に差し替え、`bonus` の係数も固定値 `3` から `populationBand`（1-3）に変更した——大都市の固定シナリオ（後述、rocketryEra×Industrial の大都市）では偶然どちらの式でも同じ結果になるため、既存テストは無変更で通っている。

`historicalPeriod`/`modernizationAffinity` は `computeUrbanWaterSystem()` 内の唯一の呼び出し元から、`getWorldContext().options?.historicalPeriod` と既存の `modernizationAffinityForBurg(burg)`（burg 自身の局所文化、§17.1 の州レベルゲートとは異なり Burg 個別）をそのまま渡している。

### 18.3 `industrialModernWaterworksSeed()`（§17.1）との関係

> **2026-08-23 追記: §17.1 は §20 で `modernWaterworksGenerationSeed()` へ一般化された。** 以下は §20 実装前の記述で、歴史的経緯として残す。§20 実装後は、近代ラダー側にも Burg 自身の `modernizationAffinity` によるスケーリングが入ったため、下記の「§17.1 は無条件で `tier = 5`」という記述はレガシー `tier` フィールドについてのみ今も正しい（近代ラダー自体は §20 の式に従う）。

§17.1 の rocketryEra×Industrial 国家シードは、対象 Burg について `previous` を完全に差し替えるため `initialTier()` 自体を呼ばせない（レガシー `tier` を無条件 `ABSOLUTE_MAX_WATER_TIER` に固定）。したがって両者は競合しない——§17.1 は「近代ラダー（drinkingTreatmentTier 等）を rocketryEra×Industrial 国家の Burg に限定して種付けする」経路、§18 は「レガシー `tier` ラダーを lateMedieval 以降のあらゆる時代・文化に一般化して種付けする」経路で、独立した軸（レガシー vs 近代ラダー）と独立した対象集合（§17.1 は国家の文化、§18 は Burg 自身の文化）を持つ。

参考として、rocketryEra×Industrial（`modernizationAffinity` 事前平均 0.85）の大都市（人口15,000人以上、`populationBand = 3`）について両者の結果を突き合わせると: §17.1 は無条件で `tier = 5`。§18 の式では `baseTier`（人口・地理で決まる 0-2）+ `round(3 × 1 × 0.85) = 3` なので、`baseTier = 2` の都市でも `tier = 5` で一致する——ただし §18 は地理条件（河川・湿地等）による `baseTier` の差、および `populationBand` が人口帯で 1-3 に変わる点で、小規模な Industrial 国家の都市では §17.1 ほど高くならない。この差は意図的な簡略化として残す（§17.1 は狭いケースのために先に実装済みのため、今回は変更しなかった）。

### 18.4 未着手（将来拡張）

- §18.2 のボーナスはレガシー `tier` ラダーのみ。近代ラダー（`drinkingTreatmentTier`/`wastewaterTreatmentTier`）への `modernizationAffinity` 接続は §11.4 の提案のまま未着手だったが、**§20 で実装した**（`modernWaterworksGenerationSeed()`）。
- `techLevelProgress`/`bonus` の具体的な係数（`3`、ランク 2-8 等）は他の近代ラダー係数と同様、実測値の裏付けがない概算。バランス調整の余地を残す。
- §18.3 で触れた `baseTier` 依存の非対称性（rocketryEra×Industrial の小規模都市が §17.1 経由よりレガシー tier で不利になり得る）は、今回は許容し修正していない。

---

## 19. Generation オプション `forceIndustrialCultures`（実装済み・2026-08-23）

**状態: 実装済み**。§18 のバグ修正後もユーザーから「petroleumEra の Industrial でも上下水道が出てこない」という報告が続いた。原因の切り分けとして、`CultureType: "Industrial"` 自体が §11.2 の通り確率的採用（`steamEra` 以降、砂漠・湿地でない地点で25%）であり、生成された地図に Industrial 文化圏の国家が1つも存在しない可能性を排除できなかった。そのため、地図上の全ての文化を無条件に Industrial にする Generation オプションを追加した。

### 19.1 何を上書きするか

`cultures-generator.ts` の `defineCultureType(i)`（Nomadic/Highland/Lake の地形硬直判定、Colonial、Industrial（確率25%）、Naval/River/Desert/Marsh/Hunting、Generic という既存の分岐チェーン）の**先頭**に、`options.forceIndustrialCultures` が true なら無条件で `"Industrial"` を返す短絡を追加した。地形硬直判定（山岳・湖）すら無視する、意図的に乱暴なデバッグ／強制オプションである——通常の `Industrial` 分岐（25%の確率的採用のみ）とは別物であることを明記する。ロックされた文化（`culture.lock`）は元々 `defineCultureType` 自体を通らないため、このオプションの影響を受けない（既存の挙動を尊重）。

### 19.2 配線

`OptionsState`（`optionsState.ts`）に `forceIndustrialCultures: boolean`（デフォルト `false`）を追加し、既存の boolean 生成オプション（`gunpowderEraEnabled`/`initialFirearmsUnstocked`）と同じ配線パターンを踏襲した：

- `GENERATION_OPTION_KEYS`（optionsState.ts）——エクスポート/インポート対象に含める。
- `exportGenerationOptions.ts` の `BOOLEAN_KEYS`——JSON インポート時の型バリデーション。
- `controllers/options.ts` の `persistedOptionKeys` とブール値パース分岐——ロックアイコンでの localStorage 永続化。
- `WorldState.ts` に `forceIndustrialCultures?: boolean` を追加し、`main.ts`（生成開始時に `useOptionsState` から `worldContext.options` へブリッジ）・`io/load.ts`（保存地図読み込み時に `worldContext.options` から `useOptionsState` へ復元）を接続——ただし `defineCultureType` は `useOptionsState.getState()` を直接読むため、この `worldContext.options` 側の配線は実際の生成ロジックには不要で、他の生成オプションとの一貫性・地図保存後のトレーサビリティのためだけに用意した。
- `GenerationSettingsTab.tsx` に `historicalPeriod` 選択の直後へチェックボックス行を追加（`LockIconButton` 付き）。
- `en.json`/`ja.json` にラベル・ツールチップを追加。

### 19.3 未着手（将来拡張）

- `defineCultureType` の1行の短絡自体には専用のユニットテストを追加していない（`generate()` 全体を動かすには pack.cells/features/biomesData 等の重いフィクスチャが要る一方、変更は関数先頭の無条件 `if` 一行のみで、既存のオプション配線テスト（`exportGenerationOptions.test.ts` の `GENERATION_OPTION_KEYS` 一致検証）が配線面はカバーしている）。実際の地図生成で目視確認することを推奨する。

**2026-08-23 追記: 根本原因を特定・修正した（§20）**。§19 導入時点では「このオプションが実際に根本原因だったかは未確認」と記していたが、`forceIndustrialCultures` を有効にしても解決しないというユーザー報告により、真因は文化の存在確率ではなく別の場所にあることが判明した——地図の「Water and sewage」レイヤープリセット（`layersPreset = sewages`）が実際に描画する `drawSewerage.ts` の処理場アイコンは `wastewaterTreatmentTier >= 1`（近代ラダー）だけを見ており、それまでの§18の修正はレガシー `tier` ラダーだけを底上げしていたため、このレイヤーには一切反映されていなかった。かつ近代ラダーの生成時シード（§17.1 `industrialModernWaterworksSeed()`）は `historicalPeriod === "rocketryEra"` に固定されていたため、petroleumEra ではそもそも一度も走っていなかった。§20 で近代ラダー側のシードを一般化し、この節で残っていた懸念を解消した。

---

## 20. `modernWaterworksGenerationSeed()`——近代ラダー生成時シードの一般化（真因修正・2026-08-23）

**状態: 実装済み**。ユーザー報告「petroleumEra + 全文化 Industrial 強制でも上下水道が地図に出ない」の根本原因を特定し修正した。

### 20.1 根本原因

地図の `layersPreset = sewages`（Water and sewage、`controllers/layers.ts`）は `toggleSewerage`/`toggleWaterSupply` の2レイヤーを有効化する。このうち Burg 個別の処理場アイコン（🪣/🌾/⚙️）を描く `drawSewerage.ts` の `treatmentPlantMarkup()` は、

```ts
const tier = system.wastewaterTreatmentTier ?? 0;
if (tier < 1 || routedBurgIds.has(system.burgId)) continue;
```

という条件で、**近代ラダー（`wastewaterTreatmentTier`）だけ**を見ている。§18 で強化したのはレガシー `tier` ラダー（`initialTier()`）で、これはこのレイヤーからは一切参照されない——つまり §18 のバグ修正がどれだけ正しくても、ユーザーが実際に見ているこのレイヤーには**構造的に絶対反映されない**組み合わせだった。

`drawWaterSupply.ts`（`toggleWaterSupply`）も同様で、Giant 継承水道か `RegionalWaterScheme`（Phase 3、実際に交渉が進んだ広域水道のみ）しか描画しない——どちらも生成時点でゼロから存在するとは限らない。

一方、近代ラダーへ生成時に非ゼロ値を書き込む唯一の経路（`industrialModernWaterworksSeed()`、§17.1）は `historicalPeriod === "rocketryEra"` に固定されていた。petroleumEra はこの経路を一度も通らないため、`wastewaterTreatmentTier` は 0 のまま——`forceIndustrialCultures`（§19）で文化を全て Industrial にしても、rocketryEra 以外では素通りされ、何も変わらなかった。

### 20.2 修正: `industrialModernWaterworksSeed()` → `modernWaterworksGenerationSeed()`

関数を全面的に一般化した（関数名も変更）:

| 項目 | 旧（§17.1） | 新（本節） |
| --- | --- | --- |
| era ゲート | `historicalPeriod === "rocketryEra"` のみ | `isModernWaterEraAvailable(period)`（`steamEra`/`industrialChemistryEra`/`petroleumEra`/`rocketryEra`、既存の年次投資ゲートと同一集合） |
| 文化ゲート | State の `culture`（`state.culture`）が `Industrial` かどうかの二値 | Burg 自身の `modernizationAffinity`（`modernizationAffinityForBurg(burg)`）の連続値——§18.2 のレガシーラダー側と同じ粒度・同じ理由（Burg 自身の文化が、その Burg 自身がどれだけ積極的に建設するかを決めるべき） |
| Tier 算出 | 文化ゲートを通れば人口だけで Tier 1/2/3 が決定 | `techLevelProgress`（steamEra=0..rocketryEra=1）× `modernizationAffinity` の `readiness` に `populationBand`（1-3）を掛けて四捨五入、0..3 にクランプ |

`steamEra` を下限にした理由は2つ: (1) 年次投資側の `isModernWaterEraAvailable()` と同じ集合にすることで、シード後も `settleModernWaterTreatmentInvestment()` が毎年 `treatmentOperationsFunding` 等を正しく更新できる（§10 のもう一段階前の期間まで広げると、年次投資側の era ゲートに弾かれて `funding` が毎年0に強制され、Tier の数字だけが残る「凍った無意味なバッジ」になる）。(2) §10 が明記する「中世・古代風都市に近代処理場を遡及させない」という設計原則——`steamEra` より前は化学消毒・急速濾過という近代処理そのものが時代的に成立しない。

`techLevelProgress` は §18.2 と同じ `CIVIC_WATERWORKS_TECH_LEVEL` ランク表を再利用し、`MODERN_WATERWORKS_SEED_TECH_LEVEL_MIN = 5`（`steamEra`）を分母の起点にした（§18.2 は `lateMedieval` = 2 が起点）。

### 20.3 検算（rocketryEra×Industrial 大都市は旧実装と一致）

`modernizationAffinity` 事前平均 0.85（Industrial）、人口15,000人以上（`populationBand = 3`）、rocketryEra（`techLevelProgress = 1`）:

```text
readiness = 1 × 0.85 = 0.85
tier = round(3 × 0.85) = round(2.55) = 3
```

旧実装（無条件で Tier 3）と完全に一致する——rocketryEra の大都市という既存テストの対象範囲では回帰しない。petroleumEra（`techLevelProgress = (7-5)/3 ≈ 0.667`）の同じ都市では:

```text
readiness = 0.667 × 0.85 ≈ 0.567
tier = round(3 × 0.567) = round(1.7) = 2
```

Tier 2 が生成時に立つ——ユーザーが「petroleumEra でも tier 1くらいは出るかと思った」と述べていた期待を満たし、`wastewaterTreatmentTier >= 1` を見る `drawSewerage.ts` に実際に描画されるようになる。

### 20.4 既存テストへの影響

`urbanWaterSystem.test.ts` の「Industrial-culture rocketryEra generation seed」describe ブロックは、State レベルの `state.culture` 設定に依存していたため（新実装は Burg レベルの `burg.culture` を読む）、4件が最初赤くなった。ブロックごと書き直し、`worldContext.pack.burgs[1]!.culture = 1` を明示的に設定する形に変更した上で、petroleumEra ケース・era 下限（`preIndustrialEra` で不発火）・低 affinity 文化（Nomadic でほぼ0）のケースを追加した。

### 20.5 未着手（将来拡張）

- レガシー `tier` の扱い（`tier: ABSOLUTE_MAX_WATER_TIER` 無条件）は今回も変更していない——§18.3 で触れた非対称性がそのまま残る。小規模な Burg（例: 人口1,000人・Tier 1相当）でもレガシー `tier` だけ 5 に飛ぶのは、今回のスコープでは意図的に据え置いた。
- ~~`drawWaterSupply.ts`（`toggleWaterSupply`）は Giant 継承水道と `RegionalWaterScheme` のみ描画する~~ → **§21 で対応済み。**

---

## 21. `drawWaterSupply.ts` の上水道側マーカー追加（実装済み・2026-08-23）

**状態: 実装済み**。§20.5 の残課題——`drawSewerage.ts` は §16.5 で `wastewaterTreatmentTier >= 1` の処理場アイコンを追加したのに対し、対になる `drawWaterSupply.ts`（`toggleWaterSupply`）は Giant 継承水道と `RegionalWaterScheme`（交渉が実際に進んだ広域水道のみ）しか描画しておらず、通常 Burg の `drinkingTreatmentTier`/`sourceProtection` を可視化する経路が存在しなかった——を埋めた。

### 21.1 追加したマーカー

`drawSewerage.ts` の `treatmentPlantMarkup()` と対になる関数を `drawWaterSupply.ts` に追加した：

| 状態 | マーカー | 条件 |
| --- | --- | --- |
| Tier 1（低速砂濾過） | 🪨 | `drinkingTreatmentTier >= 1` |
| Tier 2（急速濾過・凝集） | 🌀 | 同上 |
| Tier 3（塩素消毒） | 🧪 | 同上 |
| 保護済み取水のみ（Tier 0） | 🛡️（破線円） | `hasUpstreamIntake && sourceProtection >= SOURCE_PROTECTION_MIN_FOR_FILTRATION`（0.6、§4.1 の Tier 0→1 前提としてすでに存在する定数を `urbanWaterModernTreatment.ts` から export して再利用） |

Tier 1-3 のマーカーは `treatmentOperationsFunding` に応じて不透明度を下げる（`drawSewerage.ts` が `sludgeBacklog` で行っているのと同じ「施設はあるが安全性は低い」の可視化——§5.1）。Giant 継承水道の経路（`routedBurgIds`）に含まれる Burg はスキップし、既存のアイコンと重複描画しない。`RegionalWaterScheme` のメンバー Burg は除外していない——広域水道から水を受けていても、その水を処理する自前の設備を併せ持ちうるため。

### 21.2 テスト

`drawWaterSupply.test.ts` を新設（`drawDams.test.ts` と同じ、実 SVG DOM ノードに対して描画し `querySelectorAll`/`textContent`/`title`/`opacity` を検証するパターン）。Tier 1/3 のアイコン・タイトル、資金不足時の不透明度低下、保護済み取水のみの表示、しきい値未満・取水なしでの非表示、をカバーする6ケース。`buildInheritedWaterSupplyRoutes()`/`buildInheritedSewerRoutes()` は河川セルが無ければ即座に `[]` を返す（`urbanWaterSupply.ts`）ため、河川データを持たない最小フィクスチャで Giant 経路生成をバイパスし、今回追加したロジックだけを検証している。

---

## 22. 川の無い農村向けの「衛生知識」ボーナス（実装済み・2026-08-23）

**状態: 実装済み**。ユーザー提起: 「近代化した地図の、川が近くにない農村は、中世の農村よりは知識により衛生関連の運用が改善し、病気にかかりにくくなっているはず（井戸とトイレを離す、年一回以上の塩素消毒など）だが、その仕組みが存在しない」。

### 22.1 発見した構造的な穴

`hasUpstreamIntake = (geography.hasRiver && !geography.isWetland) || hasRegionalWaterConnection`（[urbanWaterSystem.ts:976](../../src/extensions/economy/generators/urbanWaterSystem.ts#L976)）は、近代ラダーの投資条件（`settleModernWaterTreatmentInvestment`、[urbanWaterModernTreatment.ts](../../src/extensions/economy/generators/urbanWaterModernTreatment.ts)）の前提そのものである。川も広域水道もない村は、この条件を**どれだけ年月・時代が進んでも一度も満たせない**——`drinkingTreatmentTier`は生成時シード（§20）以外の経路では永久に0のまま。

代替になりそうな`sanitaryEngineering`（era駆動の一般衛生知識ストック、`urbanWaterTech.ts`）も、`args.tier < 3`（レガシー`tier`ラダーが3以上）を満たさない限り一切成長しない（`evolveWaterTechStocks()`の`sanitaryTarget`）。つまり「時代が進めば知識だけで自然に上がる」信号はこれまで一切存在しなかった。

### 22.2 `wellHygieneReadiness()`——資本投資と独立した知識項

`urbanWaterSystem.ts`に`modernizationAffinityForBurg()`と対になる新関数を追加した：

```ts
function wellHygieneReadiness(burg: Burg, drinkingTreatmentTier: WaterSanitationTier): number {
  if (drinkingTreatmentTier >= 1) return 0;
  const period = getWorldContext().options?.historicalPeriod;
  const techLevel = period ? CIVIC_WATERWORKS_TECH_LEVEL[period] : undefined;
  if (techLevel === undefined) return 0;
  const techLevelProgress = clamp01(
    (techLevel - MODERN_WATERWORKS_SEED_TECH_LEVEL_MIN) / (CIVIC_WATERWORKS_TECH_LEVEL_MAX - MODERN_WATERWORKS_SEED_TECH_LEVEL_MIN)
  );
  return techLevelProgress * clamp01(modernizationAffinityForBurg(burg));
}
```

§20 の `modernWaterworksGenerationSeed()` と完全に同じ era スケール（`steamEra` = 0 .. `rocketryEra` = 1）と文化スケール（Burg 自身の `modernizationAffinity`）を再利用している——菌原説・塩素消毒という発想自体が steamEra 以降の知識であり、`lateMedieval` の村が「自然に」知ることはない、という §10 の「近代処理場を遡及させない」原則を知識面にもそのまま適用した。

`drinkingTreatmentTier >= 1`（本物の処理場が建った時点）で即座に0へ落ちる——実際の処理場の効果（0.12/0.2、§13.2）に重複加算しない設計。

### 22.3 `computeUrbanWaterSystem` への接続

```text
waterContamination    -= wellHygiene * 0.08
drinkingWaterSecurity（modernDrinkingBonus 経由） += wellHygiene * 0.1
```

意図的に Tier 1 本体のボーナス（0.12/0.2）より小さい——「井戸とトイレを離す・時々消毒する」という民間の知識と、実際に建設された処理場との質的な差を表現している。`treatmentOperationsFunding`・Good購入のいずれも要求しない——これは知識・行動の変化であって資本投資ではないため、既存の建設費・運転費予算とは競合しない。

### 22.4 テスト

`urbanWaterSystem.test.ts`に`computeUrbanWaterSystem`直下の新規describeブロックを追加（4ケース）: steamEra以前は効果なし、steamEra→rocketryEraで川の無い村の水質が改善すること（かつ`treatmentOperationsFunding`等が0のままであること＝無償であることの確認）、Industrial文化とNomadic文化での効果の差、`drinkingTreatmentTier`が1に達すると本項が消えて実処理場側の項に主導権が移ること。

### 22.5 未着手（将来拡張）

- ユーザーが当初提案していた「塩素消毒」の上乗せ（実在の`Chlorine`在庫を少量要求する追加項）は、本人の希望により今回は実装していない。「知識のみ」の本項とは独立に、後から追加できる。
- 農村セル（`pack.cells`、Burgに属さない人口）への適用は対象外のまま——`epidemic-cholera-and-water-security.md`の既存方針（`UrbanWaterSystem`はburgスコープ）を踏襲し、village型burgのみを対象にしている。
