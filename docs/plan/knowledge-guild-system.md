# 知識・技術蓄積システム設計: ギルド・アカデミー・国家機密 (Knowledge & Guild System)

## 状態

**2026-07-31 Phase 1(冶金ギルド基盤)実装済み**: §8.1の決定に従い、Metallurgyドメインのみで`GuildKnowledgeStock`を実装した。

- `src/extensions/economy/generators/guildKnowledgeTypes.ts`: `CRAFT_KNOWLEDGE_DOMAINS`(当初`["metallurgy"]`のみ、Phase 2で残り7ドメインを追加)・`GuildKnowledgeStock { burgId, domain, stock }`。
- `src/extensions/economy/generators/guildKnowledge.ts`: `GuildKnowledgeModule.settleAnnual()`。既存の`IndustrialTechInvestment`と同型のEWMAだが、駆動源はTools購入カバレッジではなく`SmelterOperation.workers`(実践者頭数)。`coverage = min(1, workers / 飽和定数)`で、飽和定数を小さく取ることで§8.1決定2(人口閾値なし・数人規模のギルド支部を許容)をそのまま実装している——都市規模差は`stock`の到達上限ではなく、`workers`頭数(=集計生産量)側に現れる。非稼働smelterは減衰し、smelterサイト自体が消滅したBurgも孤児ストックとしてしばらく減衰し続ける(即消滅しない)。
- `getMetallurgyGuildBonus(burgId)`(Phase 2で`getGuildBonus(burgId, domain)`に一般化)を`smelterOperations.ts`の`processingFactor`に第3の独立乗数として接続(`toolsInvestmentStock`由来の`investmentBonus`と並列)。

**今回のスコープ外(Phase 2以降に送った項目)**:

- 武器/防具(`Arms`/`Tools`)recipeの生産効率への直接接続。`production-generator.ts`の`craftWorkersUsed`は現状すべてのレシピ横断の集計値であり、ドメイン別(冶金 vs 織物 vs 木工…)に分離されていない。ドメイン別分離は他クラフトドメイン展開(§9 Phase 2)と合わせて行うほうが手戻りが少ないため、Phase 1では`SmelterOperation`(製錬)側の効率ボーナスのみに留めた。
- Characters拡張連携の師弟継承(§5、§9 Phase 6)。

テスト: `guildKnowledge.test.ts`(6件)新規追加。economy拡張51ファイル291テスト、リポジトリ全体165ファイル1155テストがgreen。`tsc --noEmit`・`npm run lint`・`npm run madge`はすべてクリーン。

**2026-07-31 Phase 2(残り7クラフトドメイン展開)実装済み**: §3-Aの8ドメイン全てで`GuildKnowledgeStock`を有効化した。

- `guildKnowledgeTypes.ts`: `CRAFT_KNOWLEDGE_DOMAINS`を`metallurgy` / `woodworking` / `masonry` / `textiles` / `leather` / `glassware` / `instruments` / `printing`の8つに拡張。`CRAFT_DOMAIN_BY_GOOD_NAME`(`Good.name`→ドメインの静的対応表)と`getCraftDomainForGood()`を新規追加——`good.recipes`のingredientキーは登録時に数値idへ変換されるため`Good.name`をキーにした。`instruments`(精密機器)は対応する`Good`が未実装のため型としては定義するが実質休眠(Clockmaker系Goodが将来追加された時点で接続する)。
- 新規`CraftDomainEmploymentRecord { burgId, domain, workers }`(`economyContext.ts`の`getCraftDomainEmploymentRecords`/`setCraftDomainEmploymentRecords`)を`production-generator.ts`に追加。既存の`CraftEmploymentRecord`(Burg合計、`basicEmployment.ts`・`employment-overview.ts`が読む)の形は変更せず、並行する別スライスとしてドメイン別頭数を追跡する——既存2消費者への影響をゼロにするため。
  - `runWorkerLoop()`は総workersUsedに加え、各生産ステップで`decision.action.good`のドメインへ`workerFraction`を積算した`Map<domain, number>`を返す。
  - `executeManufacture()`の`produced`計算に`getGuildBonus(burgId, domain)`をcultureModifierと並ぶ独立乗数として追加(ドメイン未対応のGoodはbonus=1のno-op)。
- `guildKnowledge.ts`を一般化: `settleAnnual()`は`SmelterOperation.workers`(active時のみ、metallurgyドメイン固定)と`CraftDomainEmploymentRecord`全件を`(burgId, domain)`キーで合算した"practitioners"マップを1本のロジックで処理する。冶金だけは精錬(smelter)と鍛冶(recipe)の2系統の実践者が同一`GuildKnowledgeStock`に合流する——現実の「同じ鍛冶ギルドが製錬も加工も担う」構造に対応。定数名を`METALLURGY_GUILD_*`から`GUILD_*`へ一般化(全ドメイン共通の飽和・EWMA・減衰・ボーナス定数)。
- `Good→ドメイン`対応表(§3-Aとの対応):
  - `metallurgy`: Bronze, Tools, Arms, Bullets, Harnesses(Artilleryは国家機密ドメイン(§3-C, Phase 4)候補として除外)
  - `woodworking`: Barrels, Ropes, Arrows(矢羽根/矢柄の木工。造船・船体recipeはshipbuilding拡張側の別Goodで、`recipes`を持たないため今回は未接続——将来の連携ポイントとして§9 Phase 2ノートに記録)
  - `masonry`: Lime, Roman Concrete(`constructionEmployment.ts`のmason労働力への直接接続は見送り——`ConstructionOperation`にはSmelterOperationに相当する単純な"workers"駆動口がなく、`buildingStock`という別の状態変数で駆動されるため。今回はLime/Roman Concreteのrecipe生産効率のみに留めた)
  - `textiles`: Cloth, Garments, Sails
  - `leather`: Leather, Boots
  - `glassware`: Ceramics, Glass
  - `printing`: Paper, Ink, Books(アカデミー層への「知識の記録媒体」としての接続はPhase 3待ち)

**Phase 2のスコープ外(引き続き未着手)**:

- masonryドメインと`constructionEmployment.ts`本体(`buildingStock`/mason労働力)の直接接続。
- woodworkingドメインとshipbuilding拡張の船体recipeの接続(拡張間の疎結合を保ったまま接続する設計が必要)。
- instrumentsドメインに対応する`Good`の新設。
- printingドメインのストックをAcademy層(§3-B, Phase 3)の入力として使う接続。

テスト: `guildKnowledge.test.ts`に2件追加(計8件)。economy拡張51ファイル293テスト、リポジトリ全体165ファイル1157テストがgreen。`tsc --noEmit`・`npm run lint`・`npm run madge`はすべてクリーン。

**2026-07-31 Phase 3(アカデミー/修道院、法学・行政ドメインのみ先行実装)**: §3-Bの4ドメイン(医学/法学・行政/神学/自然哲学)のうち、既存コードに実在の頭数データと接続先ボーナス消費者を持つ**法学・行政ドメインのみ**を先行実装した。残り3ドメインは実装前提となるデータが皆無(調査結果は下記)のため、明示的に次フェーズへ送った。

- 調査の結果判明した制約: `medicine`/`theology`/`naturalPhilosophy`にはBurg単位の実践者頭数データが存在しない(Physician/Priest/Alchemist等のCSV上の職業はどの拡張のCharacter/雇用トラッキングにも接続されていない)。ボーナスの接続先となる既存メカニクス(死亡率、安定度/腐敗、錬金術等)も皆無。Guild層(Phase1-2)のように既存のシミュレーション済み頭数(SmelterOperation.workers等)を再利用する経路が無いため、この3ドメインは頭数モデルとボーナス消費者の両方を新規発明する必要があり、Phase3のスコープからは意図的に除外した(ユーザー確認済み、2026-07-31)。
- `src/extensions/economy/generators/academyKnowledgeTypes.ts`: `SCHOLARLY_KNOWLEDGE_DOMAINS`(現状`["administration"]`のみ)・`AcademyKnowledgeStock { burgId, domain, stock }`(`GuildKnowledgeStock`と同型)。
- `src/extensions/economy/generators/academyKnowledge.ts`: `AcademyKnowledgeModule.settleAnnual()`。`GuildKnowledgeModule`と構造的に同一のEWMA。実践者頭数は`AdministrationEmploymentRecord.workers`(`administrationEmployment.ts`)——各Stateの首都Burgのみに1件存在する、書記/公証人/裁判官相当のclerks(実際にはgarrison込みの混合値、既存コードの制約としてそのまま流用)。`ACADEMY_SATURATION_WORKERS = 8`(Guildの6よりやや高いが、首都の最低clerks基礎値である`REQUIRED_WORKERS_BASE = 4`より十分低く、一都市国家でも到達可能)。
- `getAcademyBonus(burgId, domain)`を`taxes-generator.ts`の`collectTaxes()`の人頭税(pollTax)収入に乗数として接続した(`state.capital`のAcademyKnowledgeStockを参照)。「公証人・裁判官による記録管理が整うほど、人頭税の徴収漏れ・脱税が減る」というフレーバー。既存の売上税(`deal.tax`、市場取引ごとに別モジュールで計算済み)には未接続——人頭税は本ファイル内で完結する唯一の州単位の税収計算行であり、最小限の1接続に留めた(Phase1のSmelterOperation.processingFactorと同様の方針)。`ACADEMY_BONUS_MAX = 0.2`(満stockで人頭税収入+20%)。

**今回のスコープ外(次フェーズ以降に送った項目)**:

- `medicine`/`theology`/`naturalPhilosophy`ドメイン本体——頭数モデル・ボーナス消費者ともに未設計(上記調査結果参照)。
- 教会network越境伝播(§3-B本文、§8.1決定4によりそもそも本設計全体のスコープ外)。

テスト: `academyKnowledge.test.ts`新規追加(6件)。`taxes-generator.test.ts`に1件追加。`tsc --noEmit`・`npm run lint`・`npm run madge`はクリーン(確認手順は本フェーズの末尾参照)。

**2026-07-31 Phase 4(国家機密、火薬術ドメインのみ先行実装)**: §3-Cの2ドメイン(火薬術/軍事工学・築城、データモデル上は`pyrotechnics`/`militaryEngineering`/`fortificationScience`の3分類)のうち、既存の`MilitaryResourceLedger`に実在の消費先を持つ**火薬術(pyrotechnics)ドメインのみ**を先行実装した。Phase 3と同じ理由で残り2ドメインは次フェーズへ送った——調査の結果、築城・軍事工学に対応する消費先(要塞/攻城メカニクス)はNobility拡張側(`marchCapture.ts`等)にのみ存在し、AGENTS.md §7.1の依存方向(EconomyはどのExtensionにも依存しない)によりEconomy拡張からは到達できない。Nobility側がPhase 4のデータを読み取り専用で参照する経路(§7で既定)が今後整備されるまで、この2ドメインは保留とした。

- `StateSecretStock`はGuild/Academy層と異なり、実践者頭数ではなく**Treasuryからの継続投資**で育つ(§8.1決定2)。これは既存の`IndustrialTechInvestment`(Tools購入カバレッジ)と同じ「投資駆動型EWMA」の型であり、Guild/Academyの「頭数駆動型EWMA」とは別系統として実装した。
- `src/extensions/economy/generators/stateSecretTypes.ts`: `STATE_SECRET_DOMAINS`(現状`["pyrotechnics"]`のみ)・`StateSecretStock { stateId, domain, stock }`(Burgではなく**State**単位、Guild/Academyと異なる点)。
- `src/extensions/economy/generators/stateSecretKnowledge.ts`: `StateSecretKnowledgeModule.settleAnnual()`。`MilitaryResourceLedger.annualDemand.gunpowder`が0より大きいStateを「現役の火薬・銃砲プログラムを持つ」とみなし、Treasuryの一定割合(`STATE_SECRET_BUDGET_SHARE_OF_TREASURY = 0.05`)を上限`STATE_SECRET_TARGET_ANNUAL_SPEND`(年20、要調整の仮値)まで実際に支出し、`spend / TARGET`をカバレッジとしてEWMA更新する。他のGuild/Academyモジュールと異なり、このモジュール自身が`state.treasury`を直接減算する副作用を持つ(`IndustrialTechInvestment.invest()`が`market.marketTreasury.balance`を直接減算するのと同型のパターン)。火薬需要がゼロ(または`gunpowderEraEnabled`がオフ)のStateは投資せず、既存ストックが減衰する。
- `getStateSecretMaterialMultiplier(stateId, domain)`を`militaryResources.ts`の`getAnnualDemand()`内、`gunpowder`需要の算出式に直接乗算する形で接続した(`STATE_SECRET_BONUS_MAX = 0.3`、満stockで火薬需要-30%)。`saltpeter`/`sulfur`/`coal`は`gunpowder`から導出される値のため、この1点への接続だけで火薬生産チェーン全体に一貫して波及する。「精製された火薬術ほど、同じ攻撃力を得るのに必要な原料が少なくて済む」というフレーバー。

**今回のスコープ外(次フェーズ以降に送った項目)**:

- `militaryEngineering`/`fortificationScience`ドメイン本体——Nobility拡張側の要塞/攻城メカニクスへの読み取り専用アクセス経路が未整備なため(上記調査結果参照)。
- Nobility拡張からの`StateSecretStock`参照(§7で設計だけ既定、実装はまだ)。

テスト: `stateSecretKnowledge.test.ts`新規追加(8件)。`militaryResources.test.ts`に1件追加。`tsc --noEmit`・`npm run lint`・`npm run madge`はクリーン(確認手順は本フェーズの末尾参照)。

**2026-07-31 Phase 5(武術、剣術・弓術・馬術の3ドメインのみ先行実装)**: §3-Dの4ドメイン(剣術/槍術/弓術/馬術)のうち、`options.military`の`type`フィールドで頭数を実際に分離できる**剣術(swordsmanship)/弓術(archery)/馬術(horsemanship)の3ドメイン**を実装した。槍術(spearmanship)は、基本ゲームが汎用的な単一の"melee"ユニットタイプしか持たず、剣術と区別する実データが存在しない(pike/sword分岐を恣意的に発明しない限り分離不可能)ため、Phase 3/4と同じ理由で次フェーズへ送った。

- `MartialDisciplineStock`はGuild/Academyと同じ頭数駆動型EWMAだが、Burgではなく**State**スコープ(§3-D「State/常備軍スコープ」)。実践者頭数は各Stateの`state.military[].u`をユニット名→`options.military`の`type`フィールドで分類して集計する(`melee`→swordsmanship、`ranged`→archery、`mounted`→horsemanship)。専用の雇用レコードを新設せず、既存の`MilitaryRegiment`をそのまま流用している点はStateSecret(Phase 4)がMilitaryResourceLedgerを流用したのと同じ方針。
- `src/extensions/economy/generators/martialDisciplineTypes.ts` / `martialDisciplineKnowledge.ts`: `MartialDisciplineKnowledgeModule.settleAnnual()`(構造はGuild/Academyと同一)、および`getMartialDisciplineMultiplier(stateId, unitCounts)`——1つのregimentが複数ユニットタイプを混在させうるため、regiment自身の構成比で加重平均したボーナスを返す(分類できないユニットタイプ(artillery/fleet)は加重平均を薄める形で寄与ゼロ)。
- 接続先は**Nobility拡張**の`commanderPowerMultiplier()`(`src/extensions/nobility/generators/localDefense.ts`)——指揮官のMartial スキルによる戦力倍率と直接乗算で合成した。この関数は`battle-resolution.ts`/`homeRecapture.ts`/`marchCapture.ts`/`localSkirmish.ts`/`strategic-planner.ts`の計12箇所から呼ばれる、Nobility内の攻城・遭遇戦・防衛計算が実際に共有している唯一の戦力係数フックであり、1箇所の変更で全消費先に伝播する。`MilitaryRegiment`が`state`フィールドを直接持つため、呼び出し側のシグネチャ変更は不要だった(内部で`regiment.state`を読むだけで済んだ)。
- これは本設計で初めてEconomy拡張の外(Nobility拡張)へ実際に接続する例であり、§7で事前に許可されていた依存方向(「Nobility拡張はStateSecretStock/MartialDisciplineStockを読み取り専用で参照する」)を初めて実装した。ビルド時ES importで直接Economyのgetterを呼ぶ形を採用——動的(ZIP)拡張の禁止事項(host直接import禁止)はbuilt-in拡張同士には適用されない。Economy拡張が無効、または(Nobilityの既存ユニットテストのように)economyContextが未初期化のままNobility側だけが動く状況に備え、`economyContext.ts`に`isEconomyContextReady()`を新設し、`getMartialDisciplineMultiplier()`はEconomy未初期化時に例外を投げず1(ボーナスなし)を返すようにした——既存のNobilityテスト群(`initEconomyContext`を呼ばない)がこの変更で壊れないことを確認済み。

**今回のスコープ外(次フェーズ以降に送った項目)**:

- `spearmanship`ドメイン本体——`options.military`の`type`だけでは剣術と区別できないため(上記調査結果参照)。
- Nobility拡張からの`StateSecretStock`参照の実装(§7で設計は既定だが、Phase 4・5とも消費先が見つからず/見つかったが対象外だったため未着手のまま)。

テスト: `martialDisciplineKnowledge.test.ts`新規追加(9件)。`localDefense.test.ts`に2件追加(`commanderPowerMultiplier()`自体の単体テストは今回が初出)。`tsc --noEmit`・`npm run lint`・`npm run madge`はクリーン(確認手順は本フェーズの末尾参照)。

**2026-07-31 Phase 6(個人継承、metallurgyドメインのみ先行実装)**: §5の師弟継承メカニズムを実装した。着手前調査で、他フェーズと異なりCharacters拡張側に前提データがほぼ皆無であることが判明した(Characterに職業/craft domainフィールドが無い、師弟リンクフィールドが無い、Characters拡張自体に年次tick機構が無く現状のCharacterAging/死亡判定はすべてNobility拡張のtickに間借りしている、死亡フックが無く`character.dead`をポーリングするしかない)。ユーザーに調査結果を提示し、「フル実装、1ドメイン(metallurgy)の垂直スライス」を明示的に選択してもらった上で着手した(§8.1決定5どおりCharacters拡張必須の個人継承)。

- **設置場所はEconomy拡張**(`src/extensions/economy/generators/guildSuccession.ts`)——Characters拡張ではない。§7の「economyからcharactersへの直接依存は作らず」という文言は逆方向(Economy→Characters)の話であり、依存の向きとしてはCharacters側の型・`createPerson`をEconomyが直接importする形は`marketManagers.ts`/`merchantOrganizations.ts`が既に同じことをしている既存踏襲パターンだった(Character生成はCharacters拡張の有効/無効トグルに一切ゲートされていないことも確認済み)。この置き場所選択により、Characters拡張に初の年次tick機構を新設する必要が消え(既存のEconomy拡張の`economy.tick`と`getXLastSettledYear()`パターンをそのまま流用)、想定より作業量を圧縮できた。
- **師弟関係は`Character.roles[]`のみで表現**——`Character`本体に新規フィールドは追加していない。`CharacterRole`に汎用`domain?: string`フィールドを1つ追加しただけ(既存の`organizationId`と同じ「サブシステム固有ポインタ」枠)。マスターは`kind: "guildMaster"`(`entityType: "burg"`, `entityId: burgId`, `domain: "metallurgy"`)、弟子は`kind: "guildApprentice"`で、`organizationId`をマスターのcharacter idとして流用する(本来「組織id」用のフィールドだが、doc上も汎用ポインタと説明されているため転用)。ロール終了(死亡・昇格)は削除せず`endYear`をセットして残す。
- **年次ロジック**(`GuildSuccessionModule.settleAnnual()`、`economy.tick`内`GuildKnowledge.settleAnnual()`の直後、docs記載順どおり自己ゲート): stock>0のBurgごとに(1)既存マスターが死亡していれば弟子がいれば昇格・いなければ`applyMasterlessGuildPenalty()`(新規、`guildKnowledge.ts`、一回限り-30%の"secrets were lost"ペナルティ、通常の年次減衰`GUILD_DECAY_RATE`とは別の定数)、(2)マスター不在なら`createPerson`で新規生成(`marketManagers.ts`と同型)、(3)既存弟子の`engineering`スキルを`masterSkill/100 × GuildKnowledgeStock.stock × APPRENTICE_MAX_ANNUAL_GROWTH`で成長、(4)マスターの`engineering`が閾値(40)以上かつ弟子2人未満なら新規弟子を生成(`ageOverride`で12-17歳の若年キャラクターとして)。
- **職業→スキルの対応**: metallurgyの実践スキルは`CharacterSkills`の`engineering`を流用(既存フィールドの中で最も近い、Phase3の法学→AdministrationEmploymentRecord流用などと同じ思想)。`personFactory.ts`の`createPerson()`の`primarySkill`バイアス(40-100)が`engineering`だけ実装から漏れていたバグを発見・修正(既存の呼び出し元は皆無だったため副作用なし)——今回`primarySkill: "engineering"`を初めて使う呼び出し元として必要だった。
- 死亡起点のペナルティ/昇格処理は、既存の`character.dead`フラグに依存するため、`advanceCharacterAging()`がNobility拡張のtickに間借りしている既存の制約をそのまま引き継ぐ(Nobility無効時はマスターも弟子も加齢・死亡しない)。これは本フェーズが生んだ制約ではなく、調査で判明した既存の構造的制約であり、Nobility側のtickをリファクタリングする対応は今回のスコープ外とした。

**今回のスコープ外(次フェーズ以降に送った項目)**:

- metallurgy以外の7クラフトドメインへの展開(Phase 2と同様の横展開が必要)。
- Characters拡張自体が年次tick機構を持つように一般化すること(今回はEconomy拡張のtickに相乗りする形で回避した)。
- `advanceCharacterAging()`をNobility拡張から独立させ、Characters拡張自身が死亡を管理するようにするアーキテクチャ変更(死亡起点のペナルティ/昇格が引き続きNobility依存のまま)。

テスト: `guildSuccession.test.ts`新規追加(8件)。`guildKnowledge.test.ts`に2件追加(`applyMasterlessGuildPenalty()`)。`tsc --noEmit`・`npm run lint`・`npm run madge`はクリーン(確認手順は本フェーズの末尾参照)。

**2026-07-31 Phase 7(征服による技術吸収、Burg単位の征服撹乱ペナルティのみ実装)**: §4-4/§8.1決定3の「征服都市の技術は即時全量編入ではなく年単位で段階的に統合、占領直後の混乱で一部が失われる余地を残す」を実装した。着手前の再調査(チェックリスト記載どおり)で以下が判明した:

- **§4-4が前提としていた「State単位の技術プール」は実装に存在しない**。`GuildKnowledgeStock`/`AcademyKnowledgeStock`はどちらもBurgId単位のキーであり、Stateへ集約する仕組みはEconomy拡張のどこにも無い(`stateEconomySummary.ts`は市場在庫・食料のみ集計、Guild/Academyには一切触れない)。つまり現状、Burgが征服されるとBurgId紐付けのstockはそのまま新しい領主国に即時・無条件で引き継がれてしまう——これ自体が決定3の「即時全量編入」問題そのものだった。
- **vassalage(従属国化)は`src/generators/vassalage.ts`(core、Nobility拡張ではない)に部分的に実装済み**——マップ生成時一回限りの`establishVassalage()`が`tributeRate`と駐屯ガリソンを設定するのみで、シミュレーション中に発生する「ルーラーのintrigueによる乗っ取り」イベントは`docs/plan/military-organization-and-vassalage.md`で明記されたとおり次フェーズ止まりで未実装。annexation/loyalty/subjugationイベントはNobility拡張のどこにも存在しない(前回セッションの調査結果どおり)。
- **諜報による技術窃取の接続先も皆無**——`espionage-generator.ts`の`EspionageGenerator`は`IntelligenceReport`(推定軍事力/推定財力)を生成するだけの読み取り専用の情報収集で、対象Stateの実データを書き換える「窃取アクション」は存在しない。

以上を踏まえ、実装可能な唯一の垂直スライスとして**Burg単位の征服撹乱ペナルティ**を実装した。State単位の技術プールという当初の前提が無いため、「段階的統合」は新規のプール・ブレンドロジックではなく、「征服の瞬間に一度だけペナルティを与え、その後は既存の年次EWMA(Phase1/3で実装済み)がそのまま新しい領主国の下での回復を担う」形で実現した——決定3が求める効果(即時全量編入の否定、年単位での段階的回復、占領直後の喪失リスク)を、新しい状態やブレンドロジックを一切追加せずに達成できる。

- `src/extensions/economy/generators/guildKnowledge.ts`: `GUILD_CONQUEST_DISRUPTION_PENALTY = 0.4`・`applyConquestDisruptionToGuilds(burgId)`——そのBurgが持つ全ドメインのGuildKnowledgeStockに一括適用(Phase6の`applyMasterlessGuildPenalty`と同型、ドメイン限定なしで汎用)。
- `src/extensions/economy/generators/academyKnowledge.ts`: 同型の`ACADEMY_CONQUEST_DISRUPTION_PENALTY`・`applyConquestDisruptionToAcademies(burgId)`。GuildKnowledgeStockと同じくBurgId単位でState跨ぎの即時引き継ぎ問題を抱えていたため、片方だけ直さず両方に適用した。
- `StateSecretStock`/`MartialDisciplineStock`(Phase4/5)はState単位で、Burgの征服では一切変化しない——1都市を失っても国家機密や武術の技量はStateに残るのが正しい挙動であり、対象外とした。
- `src/extensions/economy/generators/conquestDisruption.ts`(新規): 上記2つをまとめて呼ぶ単一の入口`applyConquestDisruption(burgId)`。`isEconomyContextReady()`(Phase5で新設済み)で未初期化時は無視する。
- 接続先は`src/extensions/nobility/generators/localDefense.ts`の`captureBurg()`——`marchCapture.ts`/`homeRecapture.ts`/`battle-resolution.ts`/`localSkirmish.ts`の全征服経路が収束する唯一の関数(Phase5の`commanderPowerMultiplier`と同じ「単一フック、複数消費先」パターン)。`winnerStateId`が`burg.stateHistory`に既出かどうかで「新規征服」と「自国都市の奪還」を区別する——奪還は`homeRecapture.ts`が`captureBurg()`を呼ぶ前に`isOccupiedHomeBurg`で既に判定している既存ロジックと同じ判定材料(`stateHistory`)を再利用しており、奪還に対しては二重にペナルティを与えない(奪還対象都市は失陥時に既に一度撹乱を受けている)。

**今回のスコープ外(次フェーズ以降に送った項目)**:

- 諜報による技術窃取——`espionage-generator.ts`に対象Stateの実データを書き換えるアクション自体が存在しないため、Phase3と同じ「消費先が皆無」の状況(新規メカニクスの発明が必要)。
- vassalage/annexationイベント経由の技術吸収——シミュレーション中に発生する従属国化・乗っ取りイベント自体が`docs/plan/military-organization-and-vassalage.md`が明記するとおりまだ実装されていない。イベントが実装された時点で、そのイベントも`captureBurg()`と同様に`applyConquestDisruption()`を呼ぶか再検討する。

テスト: `guildKnowledge.test.ts`/`academyKnowledge.test.ts`に各2件追加。`conquestDisruption.test.ts`新規追加(2件)。`localDefense.test.ts`に`captureBurg()`のテスト3件追加(既存の`captureBurg()`単体テストは今回が初出)。`tsc --noEmit`・`npm run lint`・`npm run madge`はクリーン(確認手順は本フェーズの末尾参照)。

---

## 0. 背景・目的

農村から都市への食料供給と人口集中が技術・文化発展の土壌になる、という前提のもとで、大国と小国の間に技術発展速度の差をつけたい。特に:

- 火薬・銃・大砲の研究は国家が溜め込む可能性が高い。
- 鉱石の精錬技術・鍛冶の技術は、国家/都市/個人のどこが溜め込み、どう継承されるか。
- 剣術・槍術・弓術・馬術のような軍事技能は、参考CSVに欠けているため別途設計が必要。

この設計は、上記の問いに対する回答として「知識には蓄積主体ごとに異なる層があり、層ごとに蓄積速度・伝播速度・喪失リスクが違う」というモデルを提案する。

---

## 1. 現状監査(コード参照)

| 項目 | 現状 | 参照 |
| --- | --- | --- |
| 技術投資EWMAパターン(参考実装) | `IndustrialTechInvestment`が`MineOperation.toolsInvestmentStock`/`SmelterOperation.toolsInvestmentStock`を「Tools購入カバレッジ→0..1のEWMA→生産式への乗数」で年次更新する。`AgTechInvestment`も`market.agTechStock`/`stateAgriculturalProductivity`で同型。いずれも`getXLastSettledYear()`/`setXLastSettledYear()`で年1回ゲート。 | [industrialTechInvestment.ts:18-111](../../src/extensions/economy/generators/industrialTechInvestment.ts#L18-L111)、[agTechInvestment.ts:21-155](../../src/extensions/economy/generators/agTechInvestment.ts#L21-L155) |
| 国家単位の軍需資源ledger | `MilitaryResourceLedger`が`stateId`単位で`gunpowder`/`saltpeter`/`sulfur`/`arrows`/`bullets`等の`annualDemand`/`lastConsumed`/`unmetDemand`を持つ。ただし「解禁されるまでの蓄積」「技術水準」の概念はなく、需給フローのみ。 | [militaryResourcesTypes.ts:1-29](../../src/extensions/economy/generators/militaryResourcesTypes.ts#L1-L29) |
| 都市単位のクラフト雇用 | `CraftEmploymentRecord { burgId, workers }`が`production-generator.ts`のレシピ加工に従事する労働者数を平滑化して観測する。都市の職業別労働力集計は`EmploymentOverviewRow`(`administration`/`mining`/`smelting`/`trade`/`strategicIndustry`/`craft`/`construction`)に集約される。 | [craftEmployment.ts:20-35](../../src/extensions/economy/generators/craftEmployment.ts#L20-L35)、[employmentOverviewState.ts:3-14](../../src/extensions/economy/store/employmentOverviewState.ts#L3-L14) |
| 個人スキル | `CharacterSkills { artistry, diplomacy, engineering, geography, intrigue, learning, martial, prowess, stewardship }`は静的な1-100値。加齢時の一度きりのランダム成長(25歳以降は効果なし)のみで、**師弟継承・スキル伝達の仕組みは存在しない**。 | [characterTypes.ts:33-40](../../src/extensions/characters/characterTypes.ts#L33-L40) |
| 年次tickの編成順序(参考実装) | `economy.tick`は`AgTechInvestment.settleAnnual()` → `IndustrialTechInvestment.settleAnnual()` → `DevelopmentPotential.updateAnnualAgriculture()` → (中略) → `reconcileAnnualBasicEmploymentWorkers()` → `DevelopmentPotential.updateAnnualBurgGroups()`の順で固定的に呼ぶ。 | [index.tsx:1387-1485](../../src/extensions/economy/index.tsx#L1387-L1485) |
| シミュレーションtickの粒度・登録API | 基本単位は1日。`SimulationSystem { id, phase, cadence: { every: N }, run }`を`registerSimulationSystem()`で登録し、`runsOnTick()`が`(tick-1) % every === 0`で判定する。年次システムは`every`を365相当にするか、既存パターンのように内部で`getXLastSettledYear()`比較する。 | [simulationSystem.ts:52-166](../../src/generators/simulationSystem.ts#L52-L166) |
| guild/technology/research概念 | リポジトリ全体をgrepしたが実質ゼロ件(`names-generator.ts`の"Guildford"という地名の偶然の部分一致のみ)。**ギルド・技術ツリー・研究機構は現状まったく存在しない**ため、本設計は追加のみで既存機能との衝突はない。 | grep確認済み |

---

## 2. 知識の4層モデル

| 層 | 蓄積主体 | スコープ | 伝播速度 | 実装の置き場所(案) |
| --- | --- | --- | --- | --- |
| 個人の暗黙知 | Character(親方・職人) | 個人 | ほぼゼロ(本人と共に失われる) | Characters拡張、`CharacterSkills`に師弟継承を追加(§5) |
| ギルド(職人組合) | 都市(Burg) | 都市単位。同一State内では緩やか、State間は遅い | 遅い(交易・移住経由) | Economy拡張、新規`GuildKnowledgeStock` |
| アカデミー/修道院 | 都市 / 教会network | 都市〜宗教network | 中(教会networkはState境界を越えて緩やかに) | Economy拡張、新規`AcademyKnowledgeStock` |
| 国家機密 | 国家(兵器廠) | State単位、原則非公開 | 極めて遅い(諜報・征服のみ) | Economy拡張、`MilitaryResourceLedger`と同スコープの新規`StateSecretStock` |

ユーザーの元の問いへの直接的な回答:

- **火薬・銃・大砲** → 国家機密層。既存の`MilitaryResourceLedger`(State単位)と同じスコープに`StateSecretStock`を追加すれば足りる。
- **鉱石精錬・鍛冶** → ギルド層。既存の`SmelterOperation`/`MineOperation`(Burg単位)にギルドの`GuildKnowledgeStock`を紐付ける。ただし軍需向け高品質鍛冶だけは、国家が上乗せ投資して囲い込める(§6 王立工廠パターン)。
- **個人がどう継承するか** → 師弟関係(§5)。現状唯一実装が存在しないギャップ。

---

## 3. CSVからの知識ドメイン分類

`medieval-european-occupations.csv`と`medieval-european-disciplines.csv`を蓄積主体でクラスタリングした案。既存の`production-generator.ts`の`recipes`チェーン(原料→精製→加工品)、`craftEmployment.ts`と1対1で対応させる。

### A. 都市ギルド(Burgスコープ、`recipes`の効率へ乗数)

| ドメイン | 学問(CSV) | 代表職業(CSV) | 接続先 |
| --- | --- | --- | --- |
| 冶金・鍛冶 | Metallurgy, Assaying | Blacksmith, Swordsmith, Armorer, Founder, Smelter | `SmelterOperation`、武器/防具recipe |
| 木工・造船 | Naval Architecture, Hydraulics, Mechanics | Carpenter, Shipwright, Millwright, Cooper | shipbuilding拡張、船体recipe |
| 石工・建築 | Architecture, Civil Engineering, Geometry, Surveying | Mason, Bricklayer, Stonemason | `constructionEmployment.ts`/`buildingStock` |
| 織物・染色 | Textile Science, Dyeing Science | Weaver, Dyer, Tailor, Draper | Cloth/Garment recipe |
| 皮革 | Tanning Chemistry | Tanner, Cordwainer, Saddler | 皮革recipe |
| ガラス・陶芸 | Glassmaking, Ceramics Science | Glassblower, Potter | 奢侈品recipe |
| 精密機器 | Horology, Instrument Making, Optics | Clockmaker, Instrument Maker | 高付加価値財 |
| 書物・印刷 | Calligraphy, Papermaking, Printing Craft | Scribe, Printer, Papermaker | アカデミー層の「知識の記録媒体」そのもの |

### B. アカデミー/修道院(都市〜教会networkスコープ、識字労働力が前提)

| ドメイン | 学問(CSV) | 代表職業(CSV) |
| --- | --- | --- |
| 医学 | Medicine, Surgery, Herbalism, Anatomy | Physician, Surgeon, Herbalist |
| 法学・行政 | Civil Law, Canon Law, Rhetoric, Logic | Lawyer, Judge, Notary |
| 神学 | Theology | Priest, Monk, Bishop, Abbot |
| 自然哲学 | Alchemy, Astronomy, Natural Philosophy | Alchemist, Astrologer, Scholar |

神学だけは教会networkを介してState境界を越えて緩やかに伝播させる案だったが、**§8.1決定4によりこのラウンドではスコープ外**とした。当面、神学ドメインも他の学術ドメインと同じくState/都市スコープ内で閉じて扱う。「小国は孤立して技術発展が遅れる」への緩和弁としての教会networkは、後続タスクとして再検討する。

### C. 国家機密(Stateスコープ、`MilitaryResourceLedger`に接続)

| ドメイン | 学問(CSV) | 代表職業(CSV) |
| --- | --- | --- |
| 火薬術 | Pyrotechnics | Gunsmith |
| 軍事工学・築城 | Military Engineering, Fortification Science | Siege Engineer, Engineer |

### D. 武術(新規追加、両CSVに欠落)

家門・従士団・訓練場(State/常備軍スコープ)で蓄積する。都市ギルドと異なり、識字も都市化も前提としない。

| ドメイン(新規) | 蓄積主体 | 代表職業(CSVに既存) | 接続先 |
| --- | --- | --- | --- |
| 剣術 | 騎士団/常備軍 | Knight, Man-at-Arms, Mercenary, Captain | Nobility拡張のOfficer、regiment戦闘力 |
| 槍術 | 常備軍訓練場 | Pikeman, Man-at-Arms | regiment戦闘力 |
| 弓術 | 都市の射場+常備軍(装備生産はギルド、射撃技能は訓練場と二重構造) | Archer, Crossbowman, Fletcher, Bowyer | regiment戦闘力 |
| 馬術 | 貴族家門 | Knight, Squire | regiment機動力/騎兵運用 |

弓術だけは「Fletcher/Bowyer(矢・弓の製造)」をギルド層(A)、「射撃技能そのもの」を訓練場層(D)に分離するのが史実にも合う。

---

## 4. 大国・小国の技術格差メカニズム

既存コードに接続可能な4つの閾値効果を提案する。

1. **ギルドの人口閾値は設けない、頭数による連続スケーリングにする**(§8.1決定2で確定): `burg.group`による設立ゲートは採用しない。小さな村でも数人の実践者がいれば`GuildKnowledgeStock`は育ち、時間をかければ`stock`(技術の熟練度)は大都市のギルドホールと同じ上限まで到達しうる。差が出るのは`stock`の到達上限ではなく**実践者の頭数=集計生産量**の側であり、大国は都市化した都市を多数抱えるため、頭数の多いギルドが複数都市で並行して育ち、国全体の実生産量で差がつく。実装は[guildKnowledge.ts](../../src/extensions/economy/generators/guildKnowledge.ts)の`METALLURGY_GUILD_SATURATION_WORKERS`(飽和定数を意図的に小さく取り、少人数の支部でも`stock`が満ちるようにする)を参照。
2. **国家機密は財源+常備インフラが前提**: `MilitaryResourceLedger`と同様、Treasuryからの継続投資がないと`StateSecretStock`が育たない。大国=大きい財源=先行しやすい。
3. **State内伝播 vs State間伝播**: 同一State内の都市ギルド同士は交易路(既存`trade`network)経由で比較的速く伝播させ、異なるState間は大幅に遅くする。大国は内部で技術を使い回せるため実効的な技術水準が高くなる。
4. **征服・従属による技術の緩やかな吸収**(§8.1決定3で確定): Nobility拡張の行軍占領(march capture)/属国化イベント時、征服都市の`GuildKnowledgeStock`は即時全量編入ではなく、年単位で段階的にStateの技術プールへ統合する(占領直後の混乱・反乱で一部が失われる余地を残す)。大国が拡大するほど他国のノウハウを吸収でき、複利的に差が開くという狙いは変わらないが、征服直後に一足飛びで並び立てない設計にする。具体的な統合速度・不安定化率は§9 Phase 7で既存のNobility annexationイベントとの接続点を調査した上で決定する(現状、annexation/loyaltyの専用機構は見つかっていない — §1参照)。

小国側の対抗手段として、既存のEspionage(諜報)による職人引き抜き/技術窃取と、教会networkの学術流入を残す。これにより小国が完全に詰まない設計になる。

---

## 5. 個人継承メカニズム

`CharacterSkills`には成長も継承もないため、ここだけは新規実装が必要になる唯一のギャップ。

- 職業に就くCharacter(親方 = 高い該当スキル値)に1〜2人の弟子(若年Character、同職業)を紐付ける。
- 弟子のスキル成長率は「親方のスキル値 × 所属ギルドの`GuildKnowledgeStock`」で決まる。ギルドが発展しているほど弟子の伸びが早い=制度が個人を後押しする。
- 親方が弟子を持たずに死亡した場合、ギルドの`GuildKnowledgeStock`に一時的な減衰ペナルティを与える(「秘伝が失われた」というフレーバーがそのまま機能として成立)。
- Characters拡張が無効な場合は、Character単位の師弟関係を飛ばし、`craftEmployment.ts`の頭数だけで`GuildKnowledgeStock`を成長させる(既存拡張群の"optional dependency"パターンに合わせた優雅な劣化)。

---

## 6. データモデル案(素案・未確定)

既存の`toolsInvestmentStock`/`agTechStock`と同じEWMA更新テンプレートを踏襲する。型・フィールド名は仮称。

```ts
// Economy拡張所有(MineOperation/SmelterOperationと同型: burgId/marketIdでキー)
interface GuildKnowledgeStock {
  burgId: number;
  domain: CraftKnowledgeDomain; // §3-A の8ドメイン
  stock: number; // 0..1 EWMA
  practitioners: number; // CraftEmploymentRecord由来
  masterCharacterIds?: number[]; // Characters拡張有効時のみ
}

interface AcademyKnowledgeStock {
  burgId: number;
  domain: ScholarlyKnowledgeDomain; // §3-B の4ドメイン
  stock: number;
  // churchNetworkIdは§8.1決定4によりスコープ外。教会networkを実装する場合のみ追加する。
}

interface StateSecretStock {
  stateId: number;
  domain: "pyrotechnics" | "militaryEngineering" | "fortificationScience";
  stock: number; // MilitaryResourceLedgerの生産効率/解禁ラインに接続
}

interface MartialDisciplineStock {
  stateId: number; // 将来的にはhouseId(貴族家門)に細分化する余地あり
  domain: "swordsmanship" | "spearmanship" | "archery" | "horsemanship";
  stock: number; // regimentMovement.tsの戦力係数に接続
}
```

「王立工廠パターン」: 軍需向け高品質な鍛冶(武器・防具)は`GuildKnowledgeStock`(冶金・鍛冶ドメイン)をベースラインにしつつ、State側が追加投資して同ドメインに上乗せストックを持てるようにする。これにより「民間の鍛冶は開かれたギルド技術、国家軍向けの高品質装備は国家が囲い込む」という二重構造を1つのドメインの中で表現できる。

---

## 7. 置き場所・拡張間の依存

Economy拡張はどの拡張にも依存しない自己完結型であり、`MilitaryResourceLedger`も既にEconomy拡張に置かれている。したがって:

- `GuildKnowledgeStock` / `AcademyKnowledgeStock` / `StateSecretStock` / `MartialDisciplineStock`はすべて`src/extensions/economy/generators/`配下の新規モジュール(例: `knowledgeInstitutions.ts`)に置く。
- Characters拡張が有効な場合のみ、§5の師弟継承ロジックを追加で接続する(economyからcharactersへの直接依存は作らず、`ExtensionAPI`経由の疎結合を維持)。
- Nobility拡張は、`StateSecretStock`(国家機密の解禁判定)と`MartialDisciplineStock`(regiment戦力係数)を読み取り専用で参照する。Nobilityは既にCharacters必須の依存を持つため、この経路もAGENTS.mdの依存ルールと矛盾しない。

---

## 8. 未解決事項(実装着手前にユーザー確認が必要な決定)

| # | 論点 | 選択肢の例 |
| --- | --- | --- |
| 1 | ドメインの粒度 | CSV全53学問+52職業をほぼ1:1で個別トラックにするか、§3のA/B/C/D程度(15前後)の粗いドメインにまとめるか |
| 2 | ギルド設立の都市段階閾値 | town以上か、city以上か。village止まりの集落は永久にギルドを持てないとするか |
| 3 | 征服時の技術吸収 | 即時全量編入か、年単位で緩やかに移行するか(占領直後の反乱・混乱で一部消失する余地を残すか) |
| 4 | 教会networkのスコープ | 今回のスコープに含めるか、後続タスクとして神学以外は国境を越えないシンプル版から始めるか |
| 5 | 師弟継承システムの必須度 | v1からCharacters拡張必須の個人継承を実装するか、まずは craft雇用頭数ベースの簡易版(§5後段)から始めるか |
| 6 | 初期解禁ライン | ゲーム開始時点(生成時)で、どのState/Burgがどのドメインを既に保有した状態にするか。全State同一水準からスタートさせるか、文化・地形起源のバイアスを与えるか |
| 7 | Roman Concreteとの整合 | 冶金・鍛冶以外の既存EWMAストック(`concreteTechStock`等)を、このKnowledge系ドメイン体系に将来統合するか、独立のまま残すか |

### 8.1 意思決定

1. 粗いドメイン
2. 制限なし。villageでも1.9Kほどの人口がいる場合がある。ファンタジーなら3-5人程度の盗賊ギルドの支部があってもおかしくない。
3. 年単位で緩やかに移行
4. 含めない
5. Characters拡張必須の個人継承
6. 文化・地形バイアスを与える。文化の拡張も視野に入れる。
7. 独立

---

## 9. 実装フェーズ(案・すべて未着手)

- [x] Phase 1: ギルド基盤(2026-07-31実装済み、状態節参照) — Metallurgyドメインのみで`GuildKnowledgeStock`を実装し、`SmelterOperation.processingFactor`に接続する垂直スライス。武器・防具(`Arms`/`Tools`)recipeの効率接続はPhase 2へ送った(craft employmentのドメイン別分離が前提のため)。
- [x] Phase 2: 他クラフトドメインの展開(§3-A 残り7ドメイン、2026-07-31実装済み、状態節参照) — `CraftDomainEmploymentRecord`(新規並行スライス)で`production-generator.ts`のworker使用量をドメイン別に追跡し、`executeManufacture()`のrecipe生産効率へ`getGuildBonus(burgId, domain)`を接続。`masonry`↔`constructionEmployment.ts`本体、`woodworking`↔shipbuilding拡張の船体recipe、`instruments`ドメイン用Goodの新設は次フェーズ以降に持ち越し(状態節参照)。
- [x] Phase 3: アカデミー/修道院の実装(§3-B、2026-07-31実装済み、状態節参照)——法学・行政ドメインのみ先行実装(`AdministrationEmploymentRecord`を頭数源、`taxes-generator.ts`の人頭税収入を接続先ボーナス消費者とする垂直スライス)。medicine/theology/naturalPhilosophyの3ドメインは頭数モデル・ボーナス消費者ともに既存コードに皆無なため次フェーズへ送った。教会networkによるState境界越え伝播は§8.1決定4によりスコープ外(後続タスク)。
- [x] Phase 4: 国家機密ドメインと`MilitaryResourceLedger`の接続(§3-C、2026-07-31実装済み、状態節参照)——火薬術(pyrotechnics)ドメインのみ先行実装(Treasury継続投資駆動のEWMAで`MilitaryResourceLedger`の`gunpowder`需要を削減する垂直スライス)。militaryEngineering/fortificationScienceの2ドメインは対応する消費先(要塞/攻城メカニクス)がNobility拡張側にしかなく、AGENTS.mdの依存方向によりEconomyから到達できないため次フェーズへ送った。
- [x] Phase 5: 武術ドメインと戦力係数の接続(§3-D、2026-07-31実装済み、状態節参照)——剣術/弓術/馬術の3ドメインのみ先行実装。接続先は当初想定の`regimentMovement.ts`(coreの移動・追撃判定、実際には加重power計算を持たない)ではなく、Nobility拡張の`commanderPowerMultiplier()`(localDefense.ts、攻城・遭遇戦・防衛計算が共有する唯一の戦力係数フック)だった。槍術ドメインは`options.military`の`type`だけでは剣術と区別できないため次フェーズへ送った。
- [x] Phase 6: 個人継承(Characters拡張必須、§5、§8.1決定5、2026-07-31実装済み、状態節参照)——metallurgyドメインのみ先行実装。着手前調査でCharacters拡張側に前提データ(職業タグ・師弟リンク・年次tick・死亡フック)が皆無と判明したためユーザーにスコープを確認し、フル実装(1ドメイン垂直スライス)を選択。実装はEconomy拡張側(`guildSuccession.ts`)に置き、Characters拡張に新規tick機構を作らず既存の`economy.tick`に相乗りする形で回避した。
- [x] Phase 7: 征服による技術の段階的吸収(§4-4、§8.1決定3、2026-07-31実装済み、状態節参照)——`captureBurg()`(Nobility)を単一フックにBurg単位のGuildKnowledgeStock/AcademyKnowledgeStockへ征服撹乱ペナルティを適用し、その後は既存の年次EWMAが新領主国の下での回復を担う形で「段階的統合」を実現した。再調査の結果、State単位の技術プールは実装に存在せず、annexation/loyaltyイベントもvassalage(`src/generators/vassalage.ts`、core)側にマップ生成時の一回限りの設定しかなく未実装のままと確認。諜報による技術窃取は接続先(窃取アクション自体)が皆無のため次フェーズへ送った。
- [ ] Phase 8(範囲未確定): 初期解禁ラインへの文化・地形バイアス(§8.1決定6)。将来のCulture拡張を見据えた設計が必要なため、Culture拡張の具体像が固まった時点で範囲を確定する。

各フェーズ開始前に、そのフェーズが依存する§8の未解決事項を確定させること。
