# 技術発展・発見ロードマップ: 中世農業から宇宙開発まで

## 状態

**Phase 1–8 実装済み（全分野が実装済み — ロードマップ完成）**（2026-08-20 更新。ロケット・宇宙開発チェーン（§11、
`militarySignalRockets`/`rocketDynamicsAndHighTemperatureCombustionResearch`/`liquidPropulsionAndTestFacilities`/
`guidanceAndAttitudeControl`/`stagingAndOrbitalInsertion`）の実装により Phase 8 が完了し、本書の全段階が実装済みとなった）

| Phase | 内容 | 状態 |
| --- | --- | --- |
| 1 | 共通モデル・開始時代シード・年次評価 | 実装済み |
| 2 | 火薬ノード + State 別需要効率 | 実装済み |
| 3 | 大航海ノード + 船級ゲート | 実装済み |
| 4 | 前工業化ノード + 初期蒸気機関 | 実装済み。工場制手工業（`factoryOrganization`）を追加済み（2026-08-20、下記参照） |
| 5 | 蒸気・機械化（高効率機関・鉄道・海運蒸機） | 実装済み。機械紡績・機械織機（`mechanizedTextiles`）を追加済み（2026-08-20、下記参照） |
| 6 | 近代化学・電化・電解工業（硫酸・リン酸肥料・近代製鋼・触媒化学・合成アンモニア・発電網・電解アルミニウム・辰砂/水銀） | 実装済み。辰砂・水銀チェーン（§9.5）を追加済み（2026-08-20、下記参照） |
| 7 | 石油・内燃機関 | 実装済み。石油地質・掘削・製油・内燃機関チェーン（§10）を追加済み（2026-08-20、下記参照） |
| 8 | ロケット・宇宙開発 | 実装済み。火薬ロケット・ロケット力学研究・液体推進・誘導制御・多段化軌道投入チェーン（§11）を追加済み（2026-08-20、下記参照） |

`textiles` ギルド知識ドメイン（紡織）は §3-A の分類上ずっと存在していたが、2026-08-20 まで技術ノードからは一切参照されておらず、蓄積されても何の効果も持たなかった。`factoryOrganization` / `mechanizedTextiles` の追加はこの欠落（§7・§8 の「工場制手工業」「機械紡績・機械織機」行）を埋めるもの。`leather` ドメインは元々ロードマップにノードとして記載がなく、対応不要。

**2026-08-20 追加（設計のみ・未実装）**: §16（付録）に、現在の開始時代（§2、成熟中世）の手前を埋める前史として、古代ローマ的技術水準から成熟中世に至るまでの技術ロードマップを追加設計した。Phase 1–8（段階0〜8）の実装・仕様には一切影響しない、独立した将来検討用の拡張（例: 「古代ローマ開始」シナリオを追加する場合の設計叩き台）である。

**2026-08-21 追加（技術グラフのデータ層のみ実装済み）**: §16.2〜16.4 の18ノード（前1: 6ノード、前2: 6ノード、前3: 6ノード）を [`src/generators/technologyPrehistory.ts`](../../src/generators/technologyPrehistory.ts) に型付きデータとして実装した（ユニットテスト: [`technologyPrehistory.test.ts`](../../src/generators/technologyPrehistory.test.ts)、15件）。`technologyDefinitions.ts` / `technologyProgress.ts` / `worldContext` / 年次 tick のいずれからも import されておらず、現行ゲームの開始・進行には一切影響しない。`TechnologyEraBand`（0〜8）は変更せず、前史は独自の `PrehistoryEra` 文字列型で管理する。§16.1 の「維持投資途絶による退行」は、前2の3ノード（`collapseOfCentralMaintenance`/`dissolutionOfLegionsIntoRetinues`/`fragmentationOfUnifiedTrade`）が持つ `affectsMaintenanceOf` フィールドとして情報だけ表現し、実際に他ノードの stage を巻き戻す評価器は実装していない（決定事項15のとおり、これは前史専用ルールであり実装済み段階0〜8には適用しない）。「古代ローマ開始」シナリオ本体（世界生成オプション分岐・退行評価器・UI）は引き続き未着手。

コードの主な置き場:

- `src/generators/technologyTypes.ts` / `technologyDefinitions.ts` / `technologyProgress.ts`
- `simulationContext.technology`（セーブ対象、暦の `era` とは別）
- 年次 tick: `technology.tick`（economy phase、`shipbuilding.tick` の後）
- 効果: 火薬需要倍率（Economy `militaryResources`）、船級上限（Shipbuilding `getHighestUnlockedShipClass`）

本書は、現在想定する「三圃式農業と鉄製農具が普及し、火薬・銃・砲はまだ実用化されていない世界」から、火薬時代・大航海時代・前工業化・蒸気機関・電化・近代化学・石油・宇宙開発までを連続して扱う技術発展のロードマップである。

対象年代は厳密な現実史の再現ではなく、概ね西暦 1100〜1400 年相当を開始地点とする。各段階は暦年ではなく、知識・資源・制度・需要を満たしたときに進む。これにより、海運国家が先に大航海時代へ進む、鉱山国家が早く蒸気排水を採用する、農業国家が化学肥料を強く求める、といった分岐を許容する。

関連設計:

- [知識・技術蓄積システム](./knowledge-guild-system.md): Guild / Academy / State Secret / Martial Discipline の組織知。
- [個人熟練・才能・技法システム](./individual-skill-mastery-system.md): 個人熟練、適性、技法、師弟継承。
- [騎士の時代と銃・大砲の時代の分離実装計画](./guns-era.md): 現在の `gunpowderEraEnabled` と火器の有効化。
- [Shipbuilding Extension](./shipbuilding.md): 港湾、船体、資材、時間経過の基盤。
- [農村技術投資システム](./rural-agtech-investment.md): 鉄製農具と役畜による農業生産性。
- [都市水利・衛生インフラ設計](./urban-water-and-sanitation-system.md): 上水、灌漑、雨水排水、下水と都市運営の設計。都市排水は本書では技術ノードとしてのみ扱い、施設・維持管理・衛生の詳細は同書を正とする。
- [蒸気機関の知識・技術蓄積プロセス設計](./steam-engine-knowledge-accumulation.md): 火器・貨幣・都市需要による深部鉱山の排水圧力から、初期蒸気排水機関の試作・実証・採用へ至る設計。
- [蒸気機関後の工業 Good・市場・後続技術設計](./steam-industrial-goods-and-technology-chain.md): Coke、Steel、機械部品、資本財、鉄道、化学、電化を市場・技術・設備の連鎖として導入する設計。
- [化学・医学の知識・技術蓄積プロセス設計](./chemistry-medicine-knowledge-accumulation.md): 薬種・実験ガラス・病院から工業硫酸までの知識蓄積。火山材料とガラス細工を化学・医学の本線に接続する。
- [プレイヤーキャラクターによる技術バイアス](./player-character-technology-bias.md): PC は同じ証拠に局所バイアスをかけ、Technology Overview が `explainTechnologyGate` で不足シグナルを示す。
- [石油・内燃機関の縦切り実装計画](./petroleum-and-internal-combustion-vertical-slice.md): 石油地質・試掘、近代掘削・油田運営、製油・分留、内燃機関の4ノードと `Crude Oil`/`Kerosene`/`Lubricating Oil` チェーン。
- [ロケット・宇宙開発の縦切り実装計画](./rocket-and-space-development-vertical-slice.md): 火薬ロケット、ロケット力学・高温燃焼研究、液体推進・試験設備、誘導・姿勢制御、多段化・軌道投入の5ノード。新規 Good・プラント・シグナルなしで既存の era 1–7 系列を収束させる。

---

## 1. 設計原則

### 1.1 技術ツリーではなく、条件付き技術グラフ

技術は一本の直線的なツリーではなく、複数の前提を持つ有向グラフとして扱う。

```text
組織知・個人技能 ─┐
物資・設備 ───────┼─> 発見／実証 ─> 実用化 ─> 普及
制度・資本 ───────┤                         │
需要・地理条件 ─────┘                         └─> 新たな需要・次技術
```

「誰かが原理を発見した」だけでは国全体の技術水準は上がらない。材料、技能、工房、投資、需要を満たして初めて実用化され、輸送・教育・資本・制度を通じて初めて普及する。

### 1.2 発見・実用化・普及を分離する

各技術ノードには、少なくとも次の四段階を設ける。

| 状態 | 意味 | 効果 |
| --- | --- | --- |
| `locked` | 前提不足 | 利用不可 |
| `known` | 原理・技法を知る | 研究候補、少量の試作が可能 |
| `demonstrated` | 実証に成功 | 限定された工房、艦隊、兵器廠で利用可能 |
| `adopted` | 継続生産・制度化 | 対象 Burg / State に実用効果 |
| `diffused` | 広域に定着 | 同一 State または交易圏へ緩やかに伝播 |

この分離は、たとえば「小国の学者が火薬の配合を知るが、大砲の量産は大国が先」「新大陸航路を発見した商会はあるが、航路の常用には港湾・補給・護衛が必要」といった展開を可能にする。

### 1.3 知識の所有主体を混同しない

| 知識の種類 | 主な所有主体 | 代表例 |
| --- | --- | --- |
| 実践的製造知 | Burg のギルド | 製錬、造船、精密加工、織機整備 |
| 理論・記録知 | Academy / 修道院 / 大学 | 数学、天文学、化学、自然哲学 |
| 軍事・高圧技術 | State / 王立工廠 / 大企業 | 火薬配合、砲兵運用、耐圧容器 |
| 個人の暗黙知 | 親方、研究者、船長、指揮官 | 新技法、試作の改善、教育 |

技術ノードは、必要な組織知だけでなく、その知識を実際に扱う個人熟練と設備を指定する。

### 1.4 発展は需要に駆動される

研究はランダム抽選だけで起こさない。各技術には、その投資を正当化する需要シグナルを持たせる。

- 鉱山の深部化・浸水 → 排水機械、蒸気機関
- 食料不足・都市人口の増加 → 農具、輪作、肥料、化学肥料
- 海外市場・植民地・海上競争 → 航海術、大型帆船、海軍砲術
- 戦争と要塞の強化 → 火薬、大砲、築城、軍需生産
- 繊維需要・労賃上昇 → 機械化紡績、動力機関

需要がない場合は `known` で停滞してよい。これは「技術的には可能でも、誰も大規模投資をしない」状態を表す。

---

## 2. 開始時代: 成熟中世農業・騎士時代

開始世界は、現行の `gunpowderEraEnabled === false` を前提とする。火薬・大砲・銃は Goods、軍事編成、UI のいずれにも存在しない。[guns-era.md](./guns-era.md) の無効化仕様を、そのまま開始条件として維持する。

### 2.1 開始時に広く普及済みとする技術

| 分野 | 開始時の状態 | シミュレーション上の根拠・効果 |
| --- | --- | --- |
| 農業 | 三圃式、鉄製農具、役畜利用 | `AgTechInvestment` による Tools 投資と農業生産性を利用可能にする |
| 水力・風力 | 水車・風車、製粉、揚水、初歩的な動力利用 | 地域の生産効率、後の機械動力の前提 |
| 冶金 | 鉄の製錬、鍛冶、工具・武器の製造 | metallurgy GuildKnowledgeStock の基礎 |
| 建築・輸送 | 石造建築、橋、道路、荷車、河川輸送 | 都市化・交易・鉱山・港湾を支える |
| 航海 | 沿岸航海、帆走、港湾交易 | Shipbuilding の初期船体と海上交易を支える |
| 軍事 | 騎士、弓兵、槍兵、攻城兵器 | MartialDisciplineStock の剣術・弓術・馬術を利用可能にする |
| 文字・商業 | 写本、帳簿、信用、都市市場 | Academy / printing の後続発展の土台 |

開始状態は全 State を同一にしない。文化・地形・既存産業により、各 Burg / State に初期の知識ストック、熟練者、資源、港湾適性の差を与える。たとえば森林と良港を持つ都市は造船、炭田と鉄鉱脈を持つ地域は冶金、河川平野は農業投資に有利とする。

### 2.2 開始時には未解禁とするもの

- 火薬、銃、大砲、砲兵戦術
- 外洋横断を常態化させる航海・補給体系
- 大規模な株式会社・植民地行政・恒常的な世界市場
- 蒸気機関、機械化工場、鉄道
- 近代的な化学工業、高圧化学、アンモニア合成

この開始状態がどのような歴史的経路（古代ローマ的文明の技術的頂点と、その一部の喪失・再到達）を経て成立したと想定するかは、§16（付録）で扱う。現行の開始時点の数値・解禁状態を変更するものではなく、背景設定および将来「古代ローマ開始」のような別シナリオを検討する場合の設計叩き台として位置づける。

---

## 3. 時代ロードマップ

時代は全世界へ一斉に切り替わるフラグではない。各 State / Burg がどの技術を `adopted` / `diffused` しているかの結果を、UI と生成設定の便宜上「時代」と呼ぶ。

| 段階 | 中核となる変化 | 主な到達条件 | 主な結果 |
| --- | --- | --- | --- |
| 0. 成熟中世 | 鉄製農具・三圃式・騎士制 | 開始条件 | 農業余剰、都市・交易・ギルドの成立 |
| 1. 後期中世の知識集積 | 記録、鉱山、精密な冶金と航海 | 都市化、印刷前の書物・ギルド、鉱業需要 | 火薬・外洋航海・機械技術の前提形成 |
| 2. 火薬・砲兵革命 | 火薬製造、砲鋳造、砲兵運用 | pyrotechnics、冶金、Treasury、軍需需要 | 銃砲・要塞・国家機密・軍需産業 |
| 3. 大航海・海洋商業 | 外洋航海、海図、遠洋船、海軍砲術 | 造船、天文・地理、港湾、商業資本 | 遠距離交易、海外拠点、資源・知識流入 |
| 4. 前工業化 | 印刷・実験・鉱山排水・工場制手工業 | 石炭・鉱山、精密加工、学術機関、需要 | 工業投資と蒸気機関の条件が整う |
| 5. 蒸気と機械化 | 蒸気排水、回転動力、機械紡績、鉄道 | 耐圧冶金、機械加工、石炭、資本 | 生産性・輸送・都市化の急上昇 |
| 6. 電化・近代化学 | 鋼、発電、送電、電解、硫酸・化学肥料 | 重工業、電気工学、化学工学、国家／企業研究 | 高密度の工業、食料供給・軍需・人口規模の再編 |
| 7. 石油・内燃機関 | 掘削、精製、内燃機関、石油化学 | 地質調査、製油所、輸送網、石油需要 | 機動化、航空、化学原料の多様化 |
| 8. ロケット・宇宙開発 | 高性能推進、制御、試験施設、多段化 | 大規模研究、電力・石油化学・精密工業、国家計画 | 長距離ロケット、人工衛星、宇宙開発 |

以下では、各段階をノード群として定義する。

---

## 4. 段階 1: 後期中世の知識集積

この段階は火薬を有効化しない。火薬時代へ進めるための、人材・記録・資材・需要を作る段階である。

| ノード | 必要な技能・組織知 | 物的・制度的前提 | 実用化の効果 |
| --- | --- | --- | --- |
| 改良鉱山 | mining、smelting、metallurgy Guild | 鉱脈、排水需要、Tools、労働力 | 金属供給増。後の石炭・深部鉱山の土台 |
| 高温炉・良質鋳造 | smelting、blacksmithing、metallurgy Guild | 鉄・木炭／石炭、炉、継続需要 | 砲鋳造・耐圧容器・機械部品の前提 |
| 機械・水力工房 | carpentry、mechanics、woodworking Guild | 水車／風車、木材、工具、都市需要 | 製粉・揚水・加工効率。後の動力機械の原型 |
| 都市水利・被覆排水渠 | civilEngineering、surveying、stoneworking Guild | 河川・灌漑／治水工事、人口集中、石材、都市財政 | 低湿地の市街化、洪水・ぬかるみの軽減。汚水の接続は後続の都市制度として扱う |
| 記録と複製の拡大 | writing、printing、Academy Knowledge | Paper、Ink、書記、都市市場 | 技法の再現性、教育、遠隔地への知識伝播 |
| 数学・天文・地理 | learning、mathematics、astronomy、Academy Knowledge | 学術都市、書物、航海需要 | 海図・測量・砲術計算・遠洋航海の前提 |
| 商業金融の成熟 | stewardship、administration、Academy Knowledge | 市場、港、法制度、商人組織 | 高額な航海・鉱山・軍需への投資能力 |

`mechanics`、`mathematics`、`astronomy`、`mining` は、個人熟練モデルで追加候補となる DomainSkill である。全住民には付与せず、親方・学者・管理者・船長などに限定する。

---

## 5. 段階 2: 火薬・砲兵革命

火薬は `StateSecretStock` の `pyrotechnics` を中核とする。現行の `gunpowderEraEnabled` は単なる静的トグルから、以下の「最初に実用化した State が有効化できる技術」へ段階的に発展させる。

### 5.1 火薬ノード群

| ノード | 前提知識・技能 | 資源・設備・制度 | 結果 |
| --- | --- | --- | --- |
| 黒色火薬の調合 | pyrotechnics State Secret、chemistry / naturalPhilosophy | saltpeter、sulfur、charcoal、試験場 | 少量の爆薬・信号・工兵用途 |
| 火薬の粒状化・品質管理 | pyrotechnics、printing / records、administration | 精製設備、標準配合、兵器廠 | 安定した軍需 Good としての Gunpowder |
| 砲鋳造 | smelting、blacksmithing、metallurgy Guild | 良質な銅／鉄、炉、熟練労働、Treasury | 大砲の試作・限定配備 |
| 砲兵術 | artillery Engineering State Secret、mathematics、Martial Discipline | 訓練場、弾薬供給、士官、戦争需要 | 砲の命中・運用・補給を改善 |
| 火器の量産 | 複数 Burg の冶金・工房知、administration | 国家発注、兵器廠、道路・河川輸送、Treasury | Gunpowder / Artillery の継続生産と連隊編成 |
| 火薬要塞・対砲戦 | fortificationScience State Secret、masonry、militaryEngineering | 石材・土木労働・国家予算 | 要塞防御・攻城戦の再設計 |

### 5.2 解禁ルール

`gunpowderEraEnabled` をグローバルな生成オプションとして残す場合でも、進行世界では次の二層に分ける。

1. **世界設定ゲート**: 火薬技術が存在し得る世界か。無効なら研究ノード自体を生成しない。
2. **State ごとの採用ゲート**: 有効な世界で、前提を満たした State だけが火薬・砲兵を試作・採用できる。

最初に `demonstrated` へ到達した State は機密優位を持つが、交易、職人引き抜き、諜報、征服撹乱を通じて他国も追いつける。これにより「最初の発明者が永久に勝つ」状態を避ける。

---

## 6. 段階 3: 大航海・海洋商業

大航海時代は、単に船体を大型化する段階ではない。航海知、測量、補給、港湾、商業金融、海軍砲術を組み合わせたネットワーク技術として扱う。

| ノード | 前提知識・技能 | 資源・地理・制度 | 結果 |
| --- | --- | --- | --- |
| 外洋航法 | navigation、astronomy、cartography、Academy Knowledge | 書物・観測、経験ある船長、外洋港 | 沿岸外への安全な航路探索 |
| 遠洋帆船 | shipwrighting、carpentry、woodworking Guild | 良港、木材、Sails、Ropes、Tar、Iron | 航続力・積載量の高い ShipHull |
| 標準海図・海事記録 | cartography、printing、administration | Paper、Ink、港湾組織、帰還航海 | 航海失敗率低下、知識の組織化 |
| 船団補給 | stewardship、logistics、港湾組織 | 穀物・水・修理材、市場、資本 | 長距離航路の反復運用 |
| 海軍砲術 | pyrotechnics、artillery Engineering、navigation | Gunpowder、Artillery、砲艦、訓練 | 海上での護衛・制海能力 |
| 海外交易拠点 | administration、diplomacy、商会・国家制度 | 遠洋航路、資本、護衛、現地供給 | 新たな Good、資源・需要・知識の流入 |

Shipbuilding 拡張が所有する船体・港・建造キューと、Economy が所有する Wood / Sails / Ropes / Tar / Iron の在庫をそのまま使う。技術ロードマップは「どの船級を建造できるか」「航路を反復利用できるか」を決め、物資の生産・消費を二重管理しない。

大航海は必須の一本道ではない。内陸国家は、鉱山・織物・機械化・陸上交易を主軸に前工業化へ進めてよい。一方、海洋商業は新資源・資本・地理知識を得るため、工業化を早める有力な経路となる。

---

## 7. 段階 4: 前工業化

前工業化は、蒸気機関そのものではなく、蒸気機関を必要かつ実用的にする産業・学術・資本の蓄積である。

| ノード | 前提知識・技能 | 資源・需要・制度 | 結果 |
| --- | --- | --- | --- |
| 印刷と技術書の普及 | printing Guild、learning、Academy Knowledge | Paper、Ink、都市市場、識字層 | 技法の複製・再現性、学術知の蓄積加速 |
| 実験自然哲学 | naturalPhilosophy、mathematics、Academy Knowledge | 学術機関、器具、記録、後援者 | 熱・圧力・材料に関する理論知 |
| 深部鉱山・排水 | mining、mechanics、metallurgy Guild | 石炭・金属鉱床、浸水、投資 | 蒸気排水への強い需要 |
| 石炭利用の拡大 | mining、smelting、industrial Knowledge | 炭田、輸送、炉、都市燃料需要 | 高温炉・蒸気動力の燃料基盤 |
| 精密中ぐり・工作機械 | precisionMachining、blacksmithing、mechanics | 良質鉄、工具、工房、軍需／鉱山需要 | 気密なシリンダー、均質部品の前提 |
| 工場制手工業 | textiles / metalworking Guild、stewardship | 労働力、資本、都市需要、水力 | 分業・生産規模・動力需要の増大 |

ここで必要な `precisionMachining` は、単なる `engineering` の高値ではなく、個人熟練とギルド技法を伴う専門領域として扱う。砲の中ぐり、鉱山ポンプ、時計、計測器などが同じ工作機械基盤を強化する。

---

## 8. 段階 5: 蒸気と機械化

蒸気機関は一回の発見で完結させず、用途・性能・普及を分ける。

```text
深部鉱山の浸水 + 石炭 + 耐圧冶金 + 精密中ぐり
    + 熱・圧力の実験知 + 資本
  → 鉱山排水用の初期蒸気機関
  → 回転動力・高効率機関
  → 繊維・輸送・工場への普及
```

| ノード | 前提知識・技能 | 実用化の範囲 | 普及の効果 |
| --- | --- | --- | --- |
| 初期蒸気排水機関 | mechanics、precisionMachining、smelting、naturalPhilosophy | 浸水鉱山など限定地点 | 鉱山の深部化、石炭・金属供給増 |
| 高効率蒸気機関 | thermodynamics、precisionMachining、highPressureMetallurgy | 大工房・炭田 State | 燃料効率上昇、固定動力として利用可能 |
| 機械紡績・機械織機 | textiles、mechanics、factory organization | 繊維都市・水力／蒸気利用地 | Cloth 生産量増、職人構成と都市雇用の変化 |
| 蒸気輸送 | civilEngineering、mechanics、administration | 高額な公共投資をできる State | 港・鉱山・都市間の輸送費低下 |
| 鉄道 | railEngineering、steelmaking、蒸気輸送 | 鉄・石炭・土地・国家投資 | 市場統合、軍事・人口移動の加速 |

初期蒸気機関の強みは、まず鉱山から資源を得ることである。繊維工場や鉄道を先に無条件で出すのではなく、蒸気排水が石炭・鉄の供給を増やし、その増分が後続ノードを支える循環を作る。

---

## 9. 段階 6: 電化・近代化学

ハーバー・ボッシュ法は、近代化学・高圧装置・大規模エネルギー・国家または企業研究を必要とする終盤の複合技術とする。単純な「肥料技術の次段階」にはしない。

### 9.1 近代化学のノード群

| ノード | 前提知識・技能 | 資源・制度 | 結果 |
| --- | --- | --- | --- |
| 化学工業の基礎 | chemistry、laboratoryTechnique、Academy Knowledge | 学術機関、酸・アルカリ原料、記録・投資 | 染料、薬品、爆薬、肥料の基盤 |
| 工業的硫酸 | chemistry、chemicalEngineering、耐酸設備の技法 | Sulfur / 黄鉄鉱、燃料、鉛・ガラス・耐酸容器、標準化された工場 | リン肥料、染料、金属処理、後続化学の中間財 |
| リン酸肥料 | 工業的硫酸、agricultural chemistry、administration | リン鉱石、硫酸工場、肥料流通、食料需要 | 合成アンモニア以前からの農業生産性上昇 |
| 近代製鋼 | steelmaking、precisionMachining、industrial Guild | 鉄鉱石、石炭／コークス、工場、輸送 | 高品質な機械・鉄道・耐圧容器 |
| 高圧化学装置 | highPressureMetallurgy、chemicalEngineering、precisionMachining | 高品質鋼、計測器、工場、安全規制 | 高圧反応の安定運用 |
| 触媒化学 | physicalChemistry、laboratoryTechnique、Academy / corporate research | 研究所、希少材料、長期投資 | 反応効率の飛躍、アンモニア合成の前提 |
| 合成アンモニア | chemicalEngineering、触媒化学、高圧化学装置 | 水素源、窒素、大規模エネルギー、国家／企業資本 | 工業的窒素肥料と軍需原料 |

### 9.2 合成アンモニアの採用条件

```text
近代化学 + 触媒化学 + 高圧化学装置
  + 高品質鋼・精密計測
  + 水素源・窒素・大規模エネルギー
  + 食料増産または軍需という強い需要
  + 国家／企業による長期研究投資
→ 合成アンモニアの実証
→ 肥料工場・流通網
→ 農業生産性と人口扶養力の上昇
```

`demonstrated` の段階では、限られた国家・企業が少量生産する。`adopted` には肥料工場と市場・農村への流通が必要であり、実際の農業効果は [農村技術投資システム](./rural-agtech-investment.md) のように市場・State ごとの普及ストックへ接続する。

合成アンモニアは肥料だけでなく火薬・爆薬の原料供給にも影響しうるため、農業技術、国家機密、軍需産業をまたぐ。ただし、農業上の利益と軍事上の利益は別の消費先・予算で評価する。

### 9.3 電力・電気化学

電力は市場に保管する通常の Good ではない。発電能力・送電容量・需要・損失を持つ、地点とネットワークに属するサービスとして扱う。発電所の出力を超える機械・照明・電解の要求は満たせず、電力不足はその年の生産量または稼働率を下げる。

| ノード | 前提知識・技能 | 資源・設備・制度 | 結果 |
| --- | --- | --- | --- |
| 電気と磁気の実験 | physics、mathematics、laboratoryTechnique、Academy Knowledge | 銅、磁性鉱物、計測器、研究所 | 電池・電信・発電機の原理を `known` にする |
| 実用電池・電気計測 | electrochemistry、precisionMachining | 化学試薬、銅、亜鉛、ガラス、標準器 | 電気化学・通信・研究設備の小規模な電源 |
| 発電機・電動機 | electricalEngineering、mechanics、precisionMachining | 銅線、鉄、絶縁材、蒸気／水力、工場 | 動力を電力へ変換し、離れた設備で利用可能にする |
| 送電網・電力事業 | electricalEngineering、civilEngineering、administration | 発電所、送電線、変圧・保護技法、公共／企業投資 | Burg 間の電力供給、照明、通信、電気動力 |
| 電解工業 | electrochemistry、chemicalEngineering、安定した電力網 | 大量電力、電極材料、化学プラント | アルミニウムなど、電気集約型の材料生産 |

電気の利用は「発明した State 全体へ倍率」を与えない。発電設備と送電網がある Burg だけが稼働でき、石炭・水力・後続の石油・ガスなどのエネルギー供給、送電投資、設備保守により供給量が決まる。

### 9.4 アルミニウム: 電力を材料へ変える産業

アルミニウムは鉱石そのものではなく、ボーキサイト等から精製される金属である。ゲーム内では `Bauxite` を原料 Good、`Alumina` を中間 Good、`Aluminum` を電解精錬された金属 Good として分ける。

```text
Bauxite + アルカリ化学 + 熱
  → Alumina
Alumina + 氷晶石・炭素電極 + 大量かつ安定した Electricity
  → Aluminum
```

| ノード | 前提 | 結果 |
| --- | --- | --- |
| ボーキサイト精製 | 化学工業、アルカリ、耐食容器、熱源 | `Alumina` の継続生産 |
| 電解アルミニウム | 電解工業、電力網、炭素電極、氷晶石または代替フラックス | `Aluminum` の量産 |
| 軽量構造材・導体 | aluminum metallurgy、precisionMachining、electricalEngineering | 送電、輸送、航空、後続の宇宙機器の材料選択肢 |

アルミニウム工場は、原料だけでなく毎年（または月次）の電力容量を大きく消費する大口需要家とする。電力不足で停止・減産するため、水力に恵まれる地域、石炭火力を大量建設できる地域、強い送電網を持つ地域に立地上の意味が生まれる。

### 9.5 水銀・辰砂: 希少な試薬、計測材料、そして負債

`Cinnabar`（辰砂、硫化水銀）を鉱石 Good、`Mercury`（水銀）を精製 Good とする。水銀は錬金術・初期化学の「科学者の玩具」ではなく、少量でも価値の高い試薬・計測材料・鉱業用資材として扱い、用途ごとに明示的に消費または損失させる。

| ノード／用途 | 前提 | 効果 | リスク |
| --- | --- | --- | --- |
| 辰砂焙焼と水銀回収 | mining、smelting、chemistry | Mercury の少量生産。顔料・試薬の入口 | 鉱山・精錬所の作業者曝露 |
| 錬金術・分析化学 | laboratoryTechnique、chemistry、Academy Knowledge | 試薬・蒸留・分析の実験候補を増やす | 汎用「研究力」倍率にはしない |
| 貴金属アマルガム | metallurgy、mining、assaying | Gold / Silver 回収の改善 | 水系・土壌への損失、鉱山周辺の健康被害 |
| 精密計測・電気機器 | precisionMachining、physics、electricalEngineering | 圧力・温度などの計測器、限られた電気部品 | 工場・廃棄物からの汚染 |

水銀は Health / Environment の負債を必ず伴わせる。`MercuryContaminationStock` を鉱山・工場・下流水系に記録し、作業者の健康、周辺人口、漁業・食料、水源のいずれかへ局所的な負の効果を与える。安全設備・代替材料・回収技法が進むまで、安価な万能素材にはしない。

---

## 10. 段階 7: 石油・内燃機関・石油化学

石油は、初期には地表の瀝青・浸出油を防水・照明・医療的用途に用いるだけでよい。大きな転換は、地質調査、掘削、精製、輸送、内燃機関が結びついた時点から始まる。原油を一つの完成 Good とせず、精製能力を通じて用途別の留分へ変換する。

| ノード | 前提知識・技能 | 資源・設備・制度 | 結果 |
| --- | --- | --- | --- |
| 石油地質・試掘 | geology、surveying、drillingEngineering | 油田兆候、測量、資本、掘削装置 | Petroleum 資源を発見・採掘可能にする |
| 近代掘削・油田運営 | drillingEngineering、mechanics、administration | 鋼管、ポンプ、道路／港、労働者、安全設備 | 安定した Crude Oil 生産 |
| 製油・分留 | chemicalEngineering、thermodynamics、precisionMachining | 製油所、熱源、タンク、輸送 | Kerosene、Fuel Oil、Lubricants、軽質燃料などへ分離 |
| 内燃機関 | mechanics、precisionMachining、thermodynamics | 軽質燃料、潤滑油、量産部品、整備網 | 車両・船舶・発電・後続航空の動力 |
| 石油化学 | chemicalEngineering、触媒化学、大規模製油 | 石油留分、電力、化学プラント、研究投資 | 合成材料・溶剤・高性能燃料などの後続原料 |

製油所は、分留・変換・処理の三段階を持つ重い産業設備とする。原油の採掘だけでは内燃機関もロケット燃料も利用できず、目的に合う留分と品質管理が必要になる。石油への依存は、油田・港湾・パイプライン・海路の戦略的重要性も生む。

---

## 11. 段階 8: ロケット・宇宙開発

ロケットは火薬技術の単純な上位版ではない。初期の火薬ロケットは Stage 2 の pyrotechnics から派生しうるが、長距離・高性能のロケット、さらに人工衛星を目指すには、推進、材料、計測、制御、試験、国家規模の組織を束ねる必要がある。

| ノード | 前提知識・技能 | 資源・設備・制度 | 結果 |
| --- | --- | --- | --- |
| 軍用・信号用火薬ロケット | pyrotechnics、砲兵術、木工／金属加工 | Gunpowder、標準化された筒体、訓練 | 限定的な信号・軍事用途。宇宙開発の直接解禁にはしない |
| ロケット力学・高温燃焼研究 | advancedMathematics、physics、thermodynamics、Academy Knowledge | 大学・研究所、計測器、計算能力、長期研究 | 高性能推進の設計候補 |
| 液体推進・試験設備 | chemicalEngineering、cryogenics、precisionMachining、highTemperatureMaterials | 精製燃料・酸化剤、ポンプ、耐熱材料、隔離試験場、大電力 | 大型液体ロケットの実証 |
| 誘導・姿勢制御 | electricalEngineering、electronics、controlTheory、precisionMachining | センサー、通信、計算装置、試験設備 | 制御可能な長距離ロケット |
| 多段化・軌道投入 | 上記技術群、lightweightStructures、systemsEngineering | 大規模製造、発射場、追跡網、国家計画 | 人工衛星・宇宙機の打上げ候補 |

ロケット開発は State または国際的な大組織の国家計画として扱う。個人の天才研究者は `known` / `demonstrated` を早められるが、試験場、材料産業、電力、石油化学、精密工業、誘導電子機器がなければ `adopted` には進めない。

宇宙開発の初期効果は、通信・観測・地図・威信などの民生的／科学的効果に分離して設計する。戦略兵器としての効果を導入する場合は、別途の外交・軍事・安全保障設計で扱い、本書の技術進行から自動的には与えない。

---

## 12. 技術ノードの共通データ契約

技術の状態は毎年変化し、セーブ・ロードを越えて保持される。そのため、暦表示用の `SimulationContext.era` と混同しない `technologyProgress` を SimulationContext 側に置くことを提案する。`WorldContext.options` は「火薬が存在し得るか」のような世界生成ルールだけを持ち、進行中の研究状態を持たない。

```ts
type TechnologyStage = "locked" | "known" | "demonstrated" | "adopted" | "diffused";

type TechnologyScope = "burg" | "state" | "network";

interface TechnologyProgress {
  technologyId: string;
  scope: TechnologyScope;
  ownerId: number;
  stage: TechnologyStage;
  discoveredYear?: number;
  adoptedYear?: number;
  diffusion: number; // 0..1, adopted から周辺へ伝播する進捗
}

interface TechnologyDefinition {
  id: string;
  scope: TechnologyScope;
  prerequisites: string[];
  requiredKnowledge: ReadonlyArray<{ domain: string; minimum: number }>;
  requiredSkills: ReadonlyArray<{ domain: string; minimum: number }>;
  requiredGoods?: ReadonlyArray<{ good: string; amount: number }>;
  requiredCapacity?: ReadonlyArray<{ service: string; minimum: number }>;
  requiredConditions?: string[];
  discoveryTriggers: string[];
  adoptionTriggers: string[];
}
```

### 12.1 所有境界

- 技術グラフの定義・進行の共通機構は host / SimulationContext が所有する。
- GuildKnowledgeStock、AcademyKnowledgeStock、StateSecretStock、MartialDisciplineStock の値は、各所有拡張が読み取り専用の条件として提供する。
- Good の在庫・生産・消費は Economy が唯一の所有者である。
- Electricity は Economy の在庫 Good ではなく、発電・送電・需要を持つエネルギーサービスとして専用モジュールが所有する。
- 船体・港・船級は Shipbuilding が所有する。
- 軍隊・戦闘計算は core / Nobility が所有する。
- 動的 ZIP 拡張は host モジュールを直接 import せず、ExtensionAPI 経由で技術条件・効果を登録する。

この分離により、技術ノードが全データを再実装したり、特定の拡張が他拡張の内部状態を書き換えたりしない。

### 12.2 年次進行の原則

各年次の技術更新は、次の順で評価する。

1. 資源・生産・雇用・市場・Treasury を更新する。
2. Guild / Academy / State Secret / Martial Discipline の組織知を更新する。
3. 個人熟練・師弟継承・技法伝承を更新する。
4. 技術ノードの `known` / `demonstrated` 判定を更新する。
5. 国家・都市・商会の投資と需要から `adopted` / `diffused` を更新する。
6. 技術の効果を次年の生産、軍事、航海、農業、輸送の入力として使う。

同じ年の発見が、その年のすべての生産を即座に何倍にもすることを避ける。原則として発見の効果は次の年次サイクルから反映し、設備建設や教育を要するものはさらに遅延させる。

---

## 13. 実装順序

### Phase 1: 共通モデルと開始時代の明文化 — **実装済み**

1. `TechnologyDefinition` / `TechnologyProgress`、セーブ正規化、`technology.tick` 年次評価。
2. 成熟中世の開始プロファイルを `diffused` でシード。火薬ノードは `gunpowderEraEnabled` ゲート。
3. ユニットテストで段階遷移とゲートを検証。

### Phase 2: 火薬の State 別採用 — **実装済み（ソフト効果）**

1. `blackPowder` / `cornedPowder` / `cannonFoundry` / `artilleryTactics` / `massFirearms` / `gunpowderFortification`。
2. シグナル: pyrotechnics / metallurgy / gunpowderDemand / treasury / 戦争。
3. 効果: `getGunpowderDemandTechMultiplier` を軍事火薬需要に接続（未実証は浪費、普及後は効率改善）。Goods の世界ゲートは従来どおり `gunpowderEraEnabled`。

### Phase 3: 大航海ノード — **実装済み**

1. `oceanNavigation` / `oceanGoingHulls` / `standardCharts` / `fleetLogistics` / `navalGunnery` / `overseasTradingPosts`。
2. 船級: sloop 常時可、caravel は `oceanGoingHulls` ≥ demonstrated、galleon は adopted + `oceanNavigation` ≥ known（加えて従来の tech points）。
3. 内陸は港・船体シグナルが弱いため大航海ノードが停滞し、鉱山系 era-1 ノードは別経路で進行可能。

### Phase 4: 前工業化と蒸気機関 — **実装済み**

1. [蒸気機関の知識・技術蓄積プロセス設計](./steam-engine-knowledge-accumulation.md) に従い、鉱山排水圧力、実験自然哲学、精密中ぐり、Coal 供給を別々の前提として実装済み（`experimentalNaturalPhilosophy` / `mineSurveyAndDrainage` / `precisionBoringAndMeasurement` / `coalFuelSupply`）。火器の Iron / Lead 需要は鉱山投資を加速するが、蒸気機関の必須前提にはしていない。
2. 初期蒸気機関（`atmosphericSteamPumping`）は深部鉱山の試作・設置記録を必要とし、効果は設置済み MineOperation の排水・年産上限に限定している。
3. 高効率機関、工場動力、蒸気輸送、鉄道を個別の後続ノードとして実装済み（ERA_5、下記 Phase 5 参照）。
4. **2026-08-20 追加**: 本書 §7 の「工場制手工業」行が `textiles` ギルド知識ドメインを前提に挙げているにもかかわらずノード化されていなかったため、`factoryOrganization`（`mechanicalWorkshops` + `commercialFinance` 前提）を追加した。効果は Phase 5 の `mechanizedTextiles` の前提となるほか、単独では新たな生産効果を持たない（ロードマップの「分業・生産規模・動力需要の増大」は下流の `mechanizedTextiles` 側で具体化する）。

### Phase 5: 電力・硫酸・近代化学 — **実装済み**

1. naturalPhilosophy / chemistry の実践者・組織知・消費先を追加済み（`analyticalChemistry` ほか）。
2. 工業的硫酸、リン酸肥料、近代製鋼、電力網、高圧装置、触媒化学を接続済み（下記 Phase 6 参照。ERA_5/ERA_6 に実装が分散している）。
3. 合成アンモニアを実装済み（肥料普及と軍需原料を別効果として扱う設計は [synthetic-ammonia-vertical-slice.md](./synthetic-ammonia-vertical-slice.md) 参照）。
4. **2026-08-20 追加**: 本書 §8 の「機械紡績・機械織機」行（`textiles`、`mechanics`、`factory organization` 前提）が未実装だったため、`mechanizedTextiles`（`factoryOrganization` + `rotarySteamPower` 前提）を追加した。効果は `getMechanizedTextilesOutputMultiplier`（`technologyProgress.ts`）が Cloth / Garments / Sails（`textiles` ギルドドメイン）の生産量に最大 +35% のボーナスを乗せる形で `production-generator.ts` に接続済み — 既存のギルド技術ボーナスに積み重なる。

### Phase 6: 電気化学・アルミニウム・水銀の安全な利用 — **実装済み**

1. Electricity を容量型サービスとして導入し、発電所・送電網・需要家の不足時挙動を実装済み（`generatorAndMotor` / `powerGrid`、[electric-power-and-telegraph.md](./electric-power-and-telegraph.md)）。
2. Bauxite → Alumina → Aluminum のチェーンを追加し、電解精錬を大口電力需要として接続済み（`electrolyticIndustry`、[electrolytic-industry-vertical-slice.md](./electrolytic-industry-vertical-slice.md)）。
3. Cinnabar → Mercury の小規模チェーンを追加済み（`cinnabarRoastingAndMercuryRecovery`、`MercuryPlants`、
   [cinnabar-mercury-vertical-slice.md](./cinnabar-mercury-vertical-slice.md)）。分析（`analyticalChemistry` を
   流用）は実装済み。貴金属回収・精密計測の限定用途は `Mercury` Good の未実装の消費先として次タスクに委ねる。
4. 水銀鉱山・精錬・利用による健康・環境の負債は `MercuryPlant.contamination` として実装済み — 運転する年ごとに
   必ず蓄積し、閾値超過でその年の産出を強制的に停止させる（[cinnabar-mercury-vertical-slice.md](./cinnabar-mercury-vertical-slice.md) §3.6-3.7）。
   既存の `burg.sanitation`／キャラクター疾病モデルへの接続は意図的に見送った（同書§1・§6 決定事項2）。

### Phase 7: 石油・内燃機関 — **実装済み**

1. Oil seep / Petroleum の地質・掘削・油田運営を実装済み（`petroleumGeologyAndExploration` /
   `modernDrillingAndFieldOperations`）。`Crude Oil` は `Bauxite`/`Cinnabar` と同じ「鉱山供給のみ、
   `requiredTechnology` なし」パターンで、新規 district `oilField`（province `basin` — coalSeam/evaporite/
   phosphorite と同区分）から自動供給される。`modernDrillingAndFieldOperations` は新規シグナル
   `petroleumAccess`（`Crude Oil` の市場在庫カバレッジ）を実質的なゲートとする — 循環依存を避けるため、
   `Crude Oil` 自体は技術ゲートしない設計とした。
2. 製油所を原油の分留・変換・処理を担う設備として実装済み（`oilRefiningAndFractionation` + `OilRefineryPlants`）。
   `OilRefineryPlant` はこの経済で初めて1つの入力（Crude Oil）から2つの Good（`Kerosene`/`Lubricating Oil`）を
   同時産出するプラント。両 Good とも `Synthetic Ammonia`/`Aluminum`/`Mercury` と同じ「資本設備のみ」パターン。
3. 内燃機関を `internalCombustionEngine` ノードとして実装済み（`standardMachineWorks` を mechanics/
   precisionMachining の代理前提とし、`refinedFuelAccess`/`steelAccess` を閾値とする）。roadmap の「車両・船舶・
   発電・後続航空の動力」という効果は `getInternalCombustionEngineEffect()` として公開するに留め、具体的な消費先
   （新規 Good、既存動力ボーナスの拡張）は未実装のまま次タスクに委ねた
   （`getAtmosphericSteamDrainageBonus()` が現在も未接続であるのと同じパターン）。
   「石油輸送」（Shipbuilding/Caravan との接続）・「石油化学」（roadmap §10
   5行目、`catalyticChemistry` との接続）は非目的として見送った。詳細は
   [petroleum-and-internal-combustion-vertical-slice.md](./petroleum-and-internal-combustion-vertical-slice.md)
   を参照。

### Phase 8: ロケット・宇宙開発 — **実装済み**

1. 火薬ロケット（`militarySignalRockets`）を、`artilleryTactics`/`mechanicalWorkshops` を前提とする
   `gunpowderWorld` ゲート付きノードとして追加した。決定事項13を守り、他のどの era-8 ノードの `prerequisites`
   にも現れない独立した葉として実装している — 火薬ロケットから高性能ロケット系列への自動昇格は存在しない。
2. 高性能ロケットは、火薬とは無関係な学術・工業系列（`mathAstronomyGeography`/`electricalExperiments`/
   `highPressureChemicalApparatus`）から派生する `rocketDynamicsAndHighTemperatureCombustionResearch` を起点に、
   `liquidPropulsionAndTestFacilities`（+ `oilRefiningAndFractionation`/`powerGrid`）→
   `guidanceAndAttitudeControl`（+ `electricTelegraph`）→ `stagingAndOrbitalInsertion`（+ `electrolyticIndustry`）
   という4ノードの別系統として実装した。新規 Good・State資本設備プラント・`TechnologySignals` フィールドは
   一切追加せず、既存の `refinedFuelAccess`/`electricityCoverage`/`copperWireAccess`/`instruments`/
   `experimentRecord`/`administration`/`treasury` と `minimumYearsAtPreviousStage` の組み合わせだけで
   roadmap §11 の「推進・制御・試験・精密材料・大規模組織」を表現している（`catalyticChemistry` と同型の
   知識収束ノードパターン）。
3. 宇宙開発の効果は `getMilitarySignalRocketsEffect()`/`getStagingAndOrbitalInsertionEffect()` という
   0..1 の効果クエリ関数として公開するに留め、`getAtmosphericSteamDrainageBonus()`/
   `getInternalCombustionEngineEffect()` と同じ「未接続」のまま次タスクに委ねた。通信・観測・地図・威信などの
   民生的効果、および戦略兵器としての効果はいずれも本書の技術進行からは自動的に与えない。詳細は
   [rocket-and-space-development-vertical-slice.md](./rocket-and-space-development-vertical-slice.md) を参照。

---

## 14. バランス・テスト要件

- 火薬を有効にできる State が、冶金・軍需資金・火薬知識なしに出現しないこと。
- 火薬を最初に実証した State が、恒久的かつ絶対的な優位を持たないこと。
- 大航海が海洋立地・港・資本・航海知の複合条件であり、船を一隻作るだけで解禁されないこと。
- 内陸国家が鉱山・繊維・陸上交易経由で前工業化できること。
- 蒸気機関が石炭・深部鉱山・精密加工の需要を持たずに普及しないこと。
- 合成アンモニアが化学知識だけでなく、高圧装置・エネルギー・投資・肥料流通を要求すること。
- 工業的硫酸が明示的な化学レシピの中間財として消費され、全産業への汎用倍率にならないこと。
- 電力を必要とする工場が、原料だけでなく発電・送電の余剰容量を持つ場合だけ稼働すること。
- アルミニウムが、ボーキサイトだけでなく Alumina、電極・フラックス、安定した大口電力を必要とすること。
- 水銀の便益が、鉱山・精錬・廃棄物による局所的な健康・環境負債なしに得られないこと。
- 石油採掘だけでは内燃機関・航空・高性能推進を利用できず、製油・品質管理・輸送を要求すること。
- ロケットが火薬技術だけから自動で人工衛星へ到達せず、推進・制御・試験・材料・組織の複合前提を要求すること。
- 技術の効果が、個人の天才一人または単一の数値ボーナスだけで State 全体へ伝播しないこと。
- `locked`、`known`、`demonstrated`、`adopted`、`diffused` の状態遷移が、年次 tick を跨いでも決定的に再現できること。

---

## 15. 決定事項

1. 開始地点は、鉄製農具・三圃式・基礎冶金・沿岸航海を持つ成熟中世とする。
2. 火薬・外洋航海・蒸気・電力・石油・宇宙開発は開始時に利用不可とする。
3. 技術進行は年代による一斉解禁ではなく、知識・技能・資源・制度・需要を前提とする技術グラフで扱う。
4. 発見、実証、採用、普及を別段階とし、発見だけでは社会全体の効果を得られないようにする。
5. 火薬は世界設定ゲートと State ごとの採用ゲートを分離する。
6. 大航海は船体だけでなく、航海知・港・補給・資本・必要に応じた海軍砲術を要求する。
7. 蒸気機関は、まず深部鉱山の排水需要へ接続し、資源供給の拡大から工業化を駆動する。
8. 硫酸は、リン酸肥料・金属処理・染料・後続化学を接続する中間財として扱い、万能な生産倍率にはしない。
9. 電力は在庫型 Good ではなく、発電・送電・消費容量を持つサービスとして扱う。アルミニウム精錬はその大口需要家とする。
10. 辰砂と水銀は、実験・分析・貴金属回収・計測の限定的な素材とし、必ず健康・環境負債を伴わせる。
11. 石油は、採掘・精製・輸送・用途別燃料を分け、内燃機関・石油化学・ロケット推進の共通基盤とする。
12. ハーバー・ボッシュ法は、近代化学、高圧装置、エネルギー、国家または企業研究、肥料流通を必要とする終盤の複合技術とする。
13. ロケットと宇宙開発は、火薬ロケットから直接の上位解禁にせず、推進・制御・試験・精密材料・大規模組織を必要とする別段階とする。
14. 帝政ローマ的な技術水準は、成熟中世の開始状態を上回る要素（水硬性コンクリート建築、都市上水網、常備軍団、地中海規模の統一貨幣圏、広い識字率・行政記録密度）と、下回る要素（重量有輪犂、三圃式、鐙、騎士制度）の両方を持つ非単調な前史として扱う。「古代の方が単純に技術が低い」という単調な描写にはしない。
15. 古代の衰退期（前2）は、新規ノードの発見ではなく主に「維持投資の途絶による退行」として表現する。退行は既存の `TechnologyStage` 列挙内を逆方向（例: `diffused`/`adopted` → `known`）に遷移させることで表し、§12 のデータ契約に新たな状態値は追加しない。この退行則は前史専用の追加ルールであり、実装済みの段階0〜8には適用しない。
16. 帝政ローマ期に失われた広域インフラ・組織技術（都市上水網、統一交易圏、常備軍、行政記録密度、陸上輸送網）は、前史側で個別に再導入・再実装しない。既存の段階1・2・3・4・5（本書 §4・§5・§6・§7・§8）が、新技術として再到達または超過達成する形で扱う（§16.4 対応表）。前史専用の効果・Good・シグナルとして重複実装しない。

---

## 16. 付録: 古代ローマから成熟中世への前史ロードマップ（設計のみ・未実装）

本章は、§2 が開始条件として固定する「成熟中世・騎士時代」（概ね西暦 1100〜1400 年相当）に至るまでの前史を、本書 §1 と同じ「条件付き技術グラフ」「発見・実用化・普及の分離」「知識の所有主体」「需要駆動」の原則に沿って設計する。Phase 1–8（段階0〜8、§4〜§11）はすでに実装済みであり、本章はそれより手前・独立の拡張である。現在の生成コードは §2 の開始状態からシミュレーションを始めており、本章の内容を実装しない限りゲーム上の効果は一切発生しない。

想定用途は次の二つに限定する。

1. 「なぜ成熟中世の開始状態が、ある面ではローマ帝政期より進んでおり（三圃式・鉄製農具・騎士制度）、別の面では劣っている（都市上水網・常備軍団・広域統一市場が存在しない）のか」という背景設定・UI 説明文の裏付け。
2. 将来「古代ローマ開始」のような、より早い時代を開始点とする別シナリオを追加する場合の技術グラフの叩き台。

### 16.1 新原則: 維持コストによる技術の退行

§1.1〜1.4 の原則に加え、本章専用として次の原則を導入する（決定事項15、実装済み段階0〜8には適用しない）。

技術は、発見・実用化・普及が進む方向にしか動かないわけではない。`adopted` / `diffused` の技術のうち、継続的な財政・労働力・輸送コストを要するもの（大規模インフラ、常備制度、広域交易網）は、その維持投資が途絶えると `known` 相当まで後退しうる。これは新たな `TechnologyStage` を追加するのではなく、既存の5段階（`locked` / `known` / `demonstrated` / `adopted` / `diffused`）を逆方向に遷移させることで表現する。

```text
維持投資（財政・労働力・輸送）の継続
  → adopted / diffused を維持
維持投資の途絶（中央政府の解体、財政破綻、交易路の危険化）
  → adopted / diffused → known（設備・記録は残るが、継続的な稼働・普及効果は失われる）
```

退行は「技術そのものを忘れる」のではなく、「制度・資本が支えられなくなり、効果が働かなくなる」ことを表す。石造の水道橋は地面に残るが、維持修繕がなければ機能を失う、というのがこの原則の典型例である。

### 16.2 前1: 帝政ローマ最盛期（技術・制度の頂点）

この段階は、部族的な青銅器・初期鉄器社会（本ロードマップの対象外とする）から一足飛びに、中央集権的な帝政の技術・制度水準を最初の記述可能な到達点として置く。

| ノード | 前提知識・技能 | 資源・設備・制度 | 結果 |
| --- | --- | --- | --- |
| 水硬性モルタル・コンクリート建築 | masonry、stoneworking、初歩の chemistry（石灰焼成） | 石灰石、火山灰等の混和材、燃料、熟練石工 | ドーム・アーチ・港湾構造物・大規模公共建築を、切石加工だけに頼らず安価かつ大量に建設可能にする |
| 高架水道橋・都市上水網 | civilEngineering、surveying、水硬性コンクリート建築 | 水源測量、石材、継続的な維持管理予算 | 数十万人規模の都市への安定給水。公共浴場・噴水・水洗設備など都市衛生の基盤 |
| 舗装軍道網 | civilEngineering、surveying、administration | 石材、賦役労働、中央財政 | 陸上輸送・軍展開の速度が向上し、遠隔属州の統治・交易・軍需輸送を一体化する |
| 常備軍団と兵站制度 | administration、militaryEngineering、Martial Discipline | 常設の国庫、規格化装備、穀物供給網、道路網 | 標準化された装備・訓練・補給線を持つ常備軍。辺境防衛と迅速な鎮圧行軍が可能になる |
| 属州行政・成文法 | writing、administration、法学的 Academy Knowledge | 書記層、記録保存、中央-地方の官僚機構 | 属州の徴税・治安・司法を標準化し、広域統治のコストを引き下げる |
| 地中海規模の統一交易圏・貨幣制度 | administration、commercialFinance の先駆的形態 | 港湾、共通貨幣、契約・海商に関する法制度、治安（海賊掃討） | 属州間で穀物・オリーブ油・ワイン・金属を大量に海上輸送し、大都市への安価な食料供給を実現する |

この段階の技術は、どれも高い水準の中央財政・官僚機構という単一の前提に依存する。次段階（前2）は、この共通前提が崩れたときに何が起きるかを描く。

### 16.3 前2: 古代の衰退と地方分権化（移行期）

この段階は、新規ノードの獲得よりも、前段階（前1）で `adopted` / `diffused` に達していた技術が §16.1 の退行則によって後退する過程を中心に据える。同時に、この混乱期に後の中世技術の萌芽となる要素が生まれる。

| ノード | 前提・引き金 | 資源・設備・制度 | 結果 |
| --- | --- | --- | --- |
| 中央財政・道路網の維持断絶 | 中央政府の解体（内戦・侵入・財政破綻） | なし（退行の引き金となる負のノード） | 「舗装軍道網」「高架水道橋」など維持依存の技術が、地域ごとに `diffused` / `adopted` → `known` 相当へ後退しうる |
| 常備軍団の解体と従士団化 | 中央財政の断絶、辺境防衛の地方委譲 | 地方領主の台頭、土地を対価とした軍役 | 常備軍団に代わり、土地に紐づいた従士団・城砦防衛体制が軍事力の単位になる |
| 統一交易圏の分断・現物経済化 | 治安悪化、海上交易路の危険化 | なし（退行の引き金となる負のノード） | 広域市場と統一貨幣の効果が失われ、地域自給と現物取引・小規模市場が優勢になる |
| 修道院による知識の断片的保存 | writing、宗教制度、Academy Knowledge の残滓 | 写本、修道院、限られた識字聖職者 | 属州行政期の記録密度・識字率は取り戻せないが、学術知の全面的な断絶は避けられる |
| 重量有輪犂の萌芽 | blacksmithing、北方の重粘土質土壌への適応需要 | 鉄、牽引力のある役畜 | ローマ期の軽量な引っ掻き犂を、北方の重い土壌向けの犂へ置き換え始める。段階0「鉄製農具」の前身 |
| 鐙・改良馬具の伝来 | 遊牧民・東方との接触、交易 | なし | 騎乗戦闘の安定性が向上する。段階0「騎士」制度の軍事技術的前身 |

「維持投資の途絶」と「新技術の萌芽」は同じ地域で同時に起きてよい。ある State が道路網の維持に失敗しつつ重量有輪犂を採用する、といった非対称な進行を許容する。

### 16.4 前3: 初期中世の再建と封建化（→ 段階0 成熟中世へ）

この段階は、前2で生まれた萌芽を制度として定着させ、§2.1 の開始プロファイルへ到達する回復・統合の過程を描く。

| ノード | 前提知識・技能 | 資源・設備・制度 | 結果 |
| --- | --- | --- | --- |
| 荘園制・封建的階層の制度化 | 地方領主制、慣習法 | 土地・労働・軍役義務を結ぶ制度 | 土地・労働・軍役を一体化した安定した地方統治単位ができる。段階0の統治基盤 |
| 三圃式農業への移行 | 鉄製農具の普及、荘園の耕地管理 | 十分な鉄供給、労働力配分の制度化 | 二圃式に対して単位面積あたりの収穫が増加する。§2.1「三圃式、鉄製農具」の前提そのもの |
| 水車・風車の本格的普及 | carpentry、mechanics | 河川・適地、木材、都市・荘園の製粉需要 | ローマ期は限定的だった水力利用が、製粉・揚水・繊維加工へ本格的に普及する。§2.1「水力・風力」の前提 |
| 騎士制度の確立 | 鐙・改良馬具、封建軍役義務、Martial Discipline | 従士への土地・武具の授与、訓練 | §2.1「騎士、弓兵、槍兵、攻城兵器」の直接の前身となる軍事・社会制度が確立する |
| 大聖堂学校・修道院学術の再興 | 修道院知識保存、都市の再成長 | 学校、写本、後援（教会・領主） | §2.1「文字・商業」、および段階1「数学・天文・地理」（本書 §4）への橋渡しとなる学術基盤が育つ |
| 遠隔地交易の再興（定期市・商人団） | 治安回復、貨幣経済の再興 | 定期市、商人団、街道・河川交通の回復 | §2.1「文字・商業」の「都市市場」、および後のギルド制度の前身が形成される |

この6ノードがおおむね `adopted` に達した時点が、§2.1 の開始プロファイル（三圃式・鉄製農具・役畜、水車・風車、冶金、石造建築・橋・道路・荷車・河川輸送、沿岸航海、騎士・弓兵・槍兵・攻城兵器、写本・帳簿・信用・都市市場）に相当する。

### 16.5 帝政ローマ期の達成と、成熟中世開始時点との対応

ローマ期の達成は、成熟中世の開始状態にそのまま持ち越されない。以下は、決定事項16に対応する「どこで失われ、どの既存段階で再到達・超過達成するか」の一覧である。

| 帝政ローマ期の達成 | 段階0（成熟中世）開始時点の状態 | 再到達・超過達成する段階 |
| --- | --- | --- |
| 水硬性コンクリート建築 | 喪失。石造建築は継続するが工法は簡素化する | 本ロードマップの範囲では再導入しない（近代以降の技術として別途扱う場合のみ検討） |
| 高架水道橋・都市上水網 | 大部分喪失。井戸・小規模水利のみ | 段階1「都市水利・被覆排水渠」（本書 §4）で部分的に再興、[urban-water-and-sanitation-system.md](./urban-water-and-sanitation-system.md) で本格的に再興 |
| 常備軍団・規格化兵站 | 喪失。封建軍役・従士団に置換 | 段階2「火器の量産」（本書 §5）以降の常備化、段階4以降（本書 §7〜）の国家財政拡大で再到達 |
| 地中海規模の統一貨幣・交易圏 | 喪失。地域市場中心 | 段階1「商業金融の成熟」（本書 §4）で回復開始、段階3「大航海・海洋商業」（本書 §6）で外洋規模へ超過達成 |
| 属州行政・広い識字率・記録密度 | 大幅後退。記録は聖職者・修道院中心 | 段階1「記録と複製の拡大」（本書 §4）で回復開始 |
| 舗装軍道網 | 部分的存続（劣化）。荷車・河川輸送で代替 | 段階4「蒸気輸送」・段階5「鉄道」（本書 §8）で質的に超過達成 |
| 鉄製農具・重量有輪犂・三圃式・騎士制度 | 開始時点で標準装備として既に普及済み（§2.1） | ローマ期には存在せず、前2・前3（本章 §16.3〜16.4）で新規に獲得する、ローマを上回る到達点 |

この対応表が示すとおり、成熟中世の開始状態は「古代より単純に進んでいる」のでも「単純に退化している」のでもない。都市インフラ・常備制度・広域交易は後退したまま開始し、後続の段階1・3・4・5（本書 §4・§6・§7・§8）で新技術として再構築・超過達成される一方、農業・騎兵技術は古代を上回った状態で開始する。

### 16.6 本章を実装する場合の留意点

実装を検討する際は、次を守る。

- §12 の `TechnologyStage` 列挙・`TechnologyDefinition` 契約はそのまま再利用し、新たな状態値・データ構造を追加しない。退行は既存フィールドの値を逆方向へ更新するだけで表現する（決定事項15）。
- 前1〜前3のいずれのノードも、実装済みの段階0〜8（本書 §4〜§11）のノード・Good・シグナルを重複して再実装しない。§16.5 の対応表が指す既存ノードへ収束させる（決定事項16）。
- 本章はあくまで「開始時点をどこに置くか」の選択肢を増やす拡張であり、既存の既定シナリオ（§2 を開始点とする現行の生成）を変更しない（決定事項1・2は不変）。「古代ローマ開始」シナリオを追加する場合も、既定シナリオとは別の `WorldContext.options` 分岐として実装し、既存セーブ・既存テストに影響を与えない設計とする。

**実装状況（2026-08-21）**: 上記18ノードのデータ層（`TechnologyDefinition` 相当の型・thresholds・prerequisites・`affectsMaintenanceOf` 情報メタデータ・純粋関数 `advancePrehistoryStage`/`prehistoryThresholdsMet`/`prehistoryPrerequisitesMet`）は [`src/generators/technologyPrehistory.ts`](../../src/generators/technologyPrehistory.ts) に実装済み。上記3点の留意点はいずれも守られている（`technologyTypes.ts`/`technologyDefinitions.ts` 未変更、段階0〜8のノード・シグナルを再実装せず、既定シナリオ・セーブ・既存テストへの接続なし）。未着手なのは、退行を実際に適用する評価器、「古代ローマ開始」の `WorldContext.options` 分岐、および世界生成 UI。
