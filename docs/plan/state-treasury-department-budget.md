# 国家財源(state.treasury)の統治形態別・部門予算配分 設計

## 状態

**大部分実装済み**(§5: 為政者家政費、§7: 6部門フルテーブル+軍事充足率+`militaryDiscontent`+Treasury Overview UI+中央官職俸給+属州領主/野戦指揮官/Guild/Market俸給+初期所持金でっち上げ)。未実装は「予算配分を政策レバーとして操作する仕組み(戦時動員/War Footing含む)」と、非軍事4部門のゲーム内効果(§8非目的)。[burg-treasury-equilibrium.md](burg-treasury-equilibrium.md)の非目的節で「政体(君主制/共和制等)による上納比率の作り込み」が将来の拡張ポイントとして明示的に保留されていた項目に着手する。本ドキュメントは state 財政の**支出側**——為政者(ルーラー)給与と、統治に関わる各部門への配分——を、`state.form`(Monarchy/Republic/Theocracy/Union/Anarchy)に応じて設計する。

**改訂(v2)**: 初版では軍事(Marshalcy)を「既存実装があるから」という理由で配分調整の対象外に置いたが、これは軍事予算を政策レバーとして操作できない設計になってしまい、「平時国家・属領の軍事予算を意図的に削る」という中核ユースケースを表現できないという指摘を受けて撤回した。v2では軍事も他の4部門と同列の配分対象部門とし、代わりに「必要額(既存の`getStateMilitaryUpkeep`)」と「配分予算」を分離することで、削減とその帰結(readiness低下・不満蓄積)を表現できるようにした。詳細は§4。

**改訂(v3)**: §5の為政者給与を`Character.wealth`(案B)で実装。判断根拠と、それに伴う一般設計方針の更新は§6を参照。

**改訂(v4)**: §7(6部門フルテーブル・`getMilitaryFundingCeiling`・`allocateTreasury`・`militaryDiscontent`)を実装。加えて、実装前の設計問答で浮上した2つの未解決点を§4.4として明記(いずれも実装は次フェーズ):

1. 「戦時動員(War Footing)」——特定部門(例: 神権政治の聖戦なら元帥府+教会庁)へ基準比率を上書きして予算を全振りする政策レバー。神権国家の聖戦モードは Marshalcy+Ecclesiastica 合算100% という案が出たが、**非宗教国家の総動員もあり得るため、この形では設計として未完成**——一般化が必要。
2. 充足率が1.0を超える(過剰投資)場合の扱い——案β(`effectiveTroopTarget()`への一時的な動員ブースト接続)を採用方針とし、まだ財政の影響を受けない兵力目標値(manpower.ts)に、War Footing発動時に限定して接続を開く設計とする。

## 背景・目的

現状、`state.treasury`は単一スカラーで、体系的な支出区分は[軍事維持費](../../src/extensions/economy/generators/militaryLogistics.ts)(`getStateMilitaryUpkeep`)のみが毎サイクル確実に引かれる([taxes-generator.ts:93,99](../../src/extensions/economy/generators/taxes-generator.ts))。それ以外の支出(貿易安全保障・辺境拡張・農業技術投資)は場当たり的な既存シンクへの合流に留まり、「統治形態が財政運営そのものにどう表れるか」を表現する仕組みがない。

軍事維持費は現状、`state.military`の実在兵力から純粋に算出される天引き額であり、治療との間にフィードバックが一切ない(治療が枯渇しても兵力は減らず、`Math.max(0, ...)`で不足分が黙って消える)。逆に兵力の目標値(`effectiveTroopTarget()`, [manpower.ts:360-375](../../src/generators/manpower.ts))は人口と外交(敵性国家の有無)のみで決まり、財政の影響を一切受けない。つまり「軍事に金を払わない」という選択そのものがゲーム内に存在しない。本設計の中心課題はこのギャップを埋めることにある。

一方、[titleTable.ts](../../src/extensions/nobility/data/titleTable.ts)には既に`CENTRAL_OFFICES`として5つの中央官職(Chancellor/Marshal/Steward/Spymaster/Court Chaplain)が全stateに生成されており、それぞれ`CharacterSkills`の1属性に紐付いている。この5官職は中世ヨーロッパの宮廷機構(尚書/元帥/家宰/諜報/教会)とほぼ1対1で対応するため、**新しい部門体系を発明するのではなく、既存の5官職を「予算配分部門」としてそのまま転用する**のが本設計の骨子。

[states-personality.md](states-personality.md)で既にGreed→重税、Piety→寺院建設、というような政策傾向がPersonality平均値の解釈として言語化されている。本設計はこれを財政の実データとして具体化するものでもある。

## 1. 中世ヨーロッパの統治形態と財政運営(調査サマリー)

> **拡張調査**: 歳入源・金庫の分割・支出権限・為政者私財まで含めた形態別対照は [polity-fiscal-regimes-historical.md](../analytics/polity-fiscal-regimes-historical.md)（2026-08）。本節は支出配分テーブルの根拠サマリーに留め、会計構造のギャップ分析はそちらを正とする。  
> **多層会計設計**: 個人 / 家政 / 国庫 / 部門・領の実装方針は [multi-ledger-fiscal-architecture.md](./multi-ledger-fiscal-architecture.md)。


| 統治形態 | 史実モデル | 財政運営の特徴 | 軍事費の性質 |
| :--- | :--- | :--- | :--- |
| **君主制 (Monarchy)** | イングランド/フランス王権、Curia Regis + Exchequer | 王室費(宮廷の威信誇示)が大きい。教会庇護は王権の正統性根拠として重要(戴冠・叙任と不可分)。官僚機構は未発達で尚書の比重は中程度。 | 封建軍役+国王直属の従士団(household knights)は王権の物理的基盤そのもの。**削減は王自身の権力基盤を切り崩す自傷行為**であり、平時でも極めて削りにくい。 |
| **共和制 (Republic)** | ヴェネツィア/ジェノヴァ/フィレンツェの都市共和国 | 元首(ドージェ等)は評議会に権限を制限された俸給制公職者——個人への富の集中がむしろ警戒される。複雑な合議制官僚機構(評議会・公証人・行政官)への支出が突出。ヴェネツィアの十人評議会(Council of Ten)に代表される高度な諜報網が特徴的。 | 軍事の主力は傭兵隊(コンドッティエーリ)。**未払いの傭兵は即座に契約破棄・寝返る**という史実(スフォルツァ家がミラノを乗っ取った経緯等)があり、支払いを怠るコストが極めて具体的かつ即座。 |
| **神権政治 (Theocracy)** | 教皇領、ドイツ騎士団国家 | 教会財政(荘園収入+十一税)が支配的な歳出先——聖堂建設、聖職者俸給、巡礼路整備。教会法に基づく行政(canon law bureaucracy)が尚書機能を兼ねる。 | 常備軍ではなく騎士修道会・十字軍動員に依存するため、**そもそも維持すべき兵力自体が少ない**——削減圧力ではなく必要額自体が低い。 |
| **連合 (Union)** | カルマル同盟、ポーランド・リトアニア共和国、神聖ローマ帝国の選帝侯体制 | 構成国間の利害調整(議会・同君連合間の外交)に最大の支出——尚書/外交部門が突出。選挙王制・制限君主制のため為政者個人への集中度は低い。 | 中央軍事費は各構成国の分担金に依存。**中央の為政者は自前の忠誠部隊を持たない**ため、軍事への個人的執着が薄く、他の統治形態より相対的に削りやすい。 |
| **無政府 (Anarchy)** | カロリング朝崩壊後の群雄割拠、ロシア動乱時代 | 機能する財政機構そのものが存在しない。行政・宗教庇護への恒常的支出は事実上ゼロ。為政者(軍閥)個人の取り分と略奪品の分配の境界が曖昧。 | 軍閥の権力基盤は従士団そのもの。**軍事費(=配下への分け前)を削れば即座に見限られ失脚する**——全形態中もっとも削減不可能。 |

**この調査から得られる中核の設計原則**: 軍事費の「削りにくさ」は統治形態そのものより、**その軍事力が為政者個人の権力基盤とどれだけ直結しているか**で決まる。君主制・無政府は為政者=軍事力の所有者なので削減が自傷行為になるが、連合の中央政府や、他国に軍事的に依存する属領国家は、軍事費を「他人事」として削れる。これを§4の配分モデルに反映する。

## 2. 部門定義: 既存5官職への対応付け

| 部門 | 対応官職 | `primarySkill` | 史実上の職掌 | ゲーム内での既存接点 |
| :--- | :--- | :--- | :--- | :--- |
| **家政 (Household)** | 為政者本人(ruler) | — | 宮廷の威信・為政者個人の生活 | なし(本設計で新設、§5参照) |
| **元帥府 (Marshalcy)** | Marshal | martial | 常備軍・城砦維持 | [`getStateMilitaryUpkeep`](../../src/extensions/economy/generators/militaryLogistics.ts)が「必要額」を計算——本設計ではこれを**配分予算と比較する基準値**として使う(§4)。他の部門と異なり、唯一「客観的な必要額」を持つ特別な部門。 |
| **尚書院 (Chancery)** | Chancellor | diplomacy | 外交・法務・文書行政 | 外交/同盟モディファイアの将来接続点 |
| **家宰府 (Stewardship)** | Steward | stewardship | 内政・公共事業・徴税実務 | [`getAcademyBonus(..., "administration")`](../../src/extensions/economy/generators/taxes-generator.ts)による徴税効率ボーナスの拡張先 |
| **諜報府 (Spymastery)** | Spymaster | intrigue | 諜報・防諜・国内監視 | nobilityのespionage/strategic AI systemsの資金源として接続可能 |
| **教会庁 (Ecclesiastica)** | Court Chaplain | learning | 宗教庇護・寺院建設・聖職者俸給 | religion/cults層の不満度緩和や施設生成への接続先 |

6部門すべてが同一の配分テーブル(治療の取り分%、合計100%)の対象。軍事だけを特別扱いして除外することはしない——ただし軍事は「必要額」という客観的な参照値を持つ唯一の部門であり、それが§4の「予算不足」メカニクスを成立させる。

## 3. 統治形態別 基準配分比率(初期値案)

`taxes-generator.ts`の`DEFAULT_TAX_BY_FORM`と同じ設計慣習(平均値+`gauss()`による州ごとのばらつき)を踏襲する。これは「政策介入がない場合のデフォルト配分」であり、§4の政策レバーによって実際の配分(特に軍事)はここから乖離しうる。各列の合計は100%。

| 部門 | Monarchy | Republic | Theocracy | Union | Anarchy |
| :--- | ---: | ---: | ---: | ---: | ---: |
| 元帥府 (Marshalcy) | 35% | 30% | 15% | 20% | 75% |
| 家政 (Household/為政者給与) | 25% | 5% | 8% | 8% | 15% |
| 尚書院 (Chancery) | 15% | 30% | 12% | 40% | 2% |
| 家宰府 (Stewardship) | 12% | 20% | 12% | 20% | 2% |
| 諜報府 (Spymastery) | 5% | 12% | 5% | 10% | 6% |
| 教会庁 (Ecclesiastica) | 8% | 3% | 48% | 2% | 0% |

**根拠の要約:**

- **Monarchy**: 軍事(王権の物理的基盤)と家政(宮廷の威信)が二大支出。教会庇護も正統性の裏付けとしてまとまった額。
- **Republic**: 軍事(傭兵契約の完全履行が必須)と尚書(合議制官僚機構)が二大支出。家政は意図的に低い(ドージェ型=個人への富集中を警戒)。諜報が全形態中最高(十人評議会モデル)。
- **Theocracy**: 教会庁が過半を占め他を圧倒。軍事は必要額自体が低い(§1参照)ため基準比率も低いが、これは「削減」ではなく「そもそも兵力が少ない」ことの反映。
- **Union**: 尚書(構成国間調整)が全形態中最高。軍事・家政はともに「為政者個人の権力基盤ではない」ため低め——§4の削減耐性も全形態中もっとも低く設定する。
- **Anarchy**: 軍事が支出の4分の3を占め、他はほぼ機能不全。家政15%は「軍閥個人の取り分と略奪品分配が未分離」という史実的特徴の反映——正規の俸給ではなく実質的な戦利品の私的取得。

## 4. 軍事予算の可変化: 「必要額」と「配分予算」の分離、削減とその帰結

これが本設計の核心部分。§1の原則(軍事費の削りにくさは為政者個人の権力基盤への依存度で決まる)を、実装可能な形にする。

### 4.1 二つの数値

- **軍事必要額 (Military Need)** = 既存の`getStateMilitaryUpkeep(state)`。実在兵力から算出される、変更不要の既存ロジック。
- **軍事配分予算 (Military Budget)** = §3の基準比率テーブルに、以下の政策修正(§4.2)を掛けた実際の配分額。**基準値から上下に乖離しうる、プレイヤー/AIが操作可能な政策レバー**。

**充足率 (Funding Ratio) = 軍事配分予算 ÷ 軍事必要額。** これが1を下回る状態が「予算削減」の実体であり、本設計が新たに導入するフィードバックの起点になる。

### 4.2 「削りやすさ」の修正係数

基準比率(§3のMarshalcy列)に対し、以下を乗算して実際に許容される軍事配分の下限を決める。数値は初期案、要調整。

| 条件 | 削減許容係数 | 根拠 |
| :--- | ---: | :--- |
| 平時・敵性国家なし(`!stateHasEnemy(state)`) | ×0.5〜0.7 まで削減可 | 実戦の必要がないため、多少の不払いでも即座の反乱には至らない |
| 交戦中(`stateHasEnemy(state)`) | ×0.9 未満への削減で即座に不満蓄積開始 | 実戦下の兵士は自分の待遇に敏感——史実の傭兵離反・厭戦のリスク |
| 属領/被支配国家(`state.diplomacy`が"Vassal"、`findSuzerainId(state)`が存在) | 基準比率自体に追加で×0.5〜0.6 | 宗主国が意図的に被支配国の常備軍を弱体化させる史実の慣行(反乱防止)。属領は自国の軍事力ではなく宗主国の軍事力に安全保障を依存するため、為政者にとって軍事費は「自分の権力基盤」ではなくなる——§1の原則がそのまま「削りやすさ」に転化する |
| Union中央政府 | 基準比率自体に追加で×0.7〜0.8 | 中央の為政者が自前の忠誠部隊を持たないため、Monarchy/Anarchyほどの抵抗がない |

これにより、「平和な属領国家」は基準比率(Union: 20%)×属領修正(0.55)×平時削減(0.6) ≈ 6.6%まで軍事配分を落とせる——史実の「宗主国が属領の軍事力を意図的に弱体化させる」動きをそのまま表現できる。逆にMonarchyが交戦中に基準比率(35%)を大きく割り込むのは強い政治的リスクを伴う。

### 4.3 充足率不足の帰結(段階的)

現状コードには支払い不足に対する結果が一切ない(§背景参照)ため、これは新規メカニクスとして導入する。**即座に劇的な結果を起こすのではなく、段階的に蓄積させる**——単発の予算削減がすぐ破滅に直結すると「削る」という選択肢自体が機能しなくなるため。

| 充足率 | 即時効果 | 蓄積効果 |
| :--- | :--- | :--- |
| 0.8〜1.0 | なし(許容誤差) | なし。`militaryDiscontent`は5/サイクルで減衰 |
| 0.5〜0.8 | (未接続、下記) | 弱い不満蓄積(`militaryDiscontent` +3/サイクル) |
| 0.5未満 | (未接続、下記) | 強い不満蓄積(+10/サイクル)。100到達で`fmg:military-discontent-threshold`イベントを一度だけ発火 |

**不満蓄積が閾値を超えた場合の帰結は、本設計のスコープ外とし、フェーズ2の課題として明示的に残す**——現状nobility拡張にクーデター/離反/内乱の仕組みが存在しない(grep確認済み)ため、ここで無理に設計すると本題の配分設計から逸脱する。フェーズ1では「`militaryDiscontent`という観測可能なスコアが存在し、閾値超過をイベントとして発火できる」ところまでを実装範囲とし、実際に何が起きるか(将校の離反、Marshal官職者による簒奪、反乱軍化等)は将来のnobility拡張のクーデター機構と合わせて別途設計する。

**即時効果(readinessペナルティ)は実装していない**——初版は「`military-generator.ts`の政体別モディファイアと同じ接続点」を想定していたが、実装時に調査した結果、それらのモディファイアは兵力生成(recruitment)時のみ働く値であり、かつ`military-generator.ts`はホスト側コア生成ロジックで、economy拡張(オプショナル)へ依存させることはできない(§1のレイヤールールに反する)。継続的に読める「戦闘有効性」スコアは`MilitaryRegiment.quality`のみ既存だが、これは新兵希釈という別の確立済み意味を持ち、無関係な原因(財政)で上書きするのは既存システムの汚染になる。よって現時点では`state.militaryFundingRatio`(観測可能な生データ)と`state.militaryDiscontent`(蓄積スコア)のみを新設し、実際のゲーム効果への接続は次フェーズの課題として残す。

### 4.4 実装前の設計問答で残った未解決点(次フェーズ)

1. **戦時動員(War Footing)レバー**: §4.1の「配分予算」を、基準比率(§3)から離れて政策的に上書きする仕組みは未実装。神権政治が聖戦のため元帥府へ予算を全振りする例で議論した結果、「Marshalcy+Ecclesiastica合算100%」という神権政治向けの案が出たが、**非宗教国家の総動員(例: 君主制の総力戦)も表現できる必要があり、形態ごとに個別の組み合わせを決め打ちする設計では一般性が足りない**。次フェーズでは「動員の対象部門をどう選ぶか」を形態非依存の形で設計し直す必要がある。
2. **充足率が1.0を超える場合(過剰投資)の扱い**: §4.3の帰結表は充足率<1.0のみを扱っており、政策的に基準比率を超えて元帥府へ投資した場合の効果が未定義。**採用方針は案β**——`effectiveTroopTarget()`(manpower.ts)は現状、人口と外交(`stateHasEnemy`)のみで兵力目標が決まり財政の影響を一切受けないが、War Footing発動時に限り、充足率1.0超過分を一時的な兵力目標の上振れ(動員ブースト)に接続する。平時の財政↔兵力の非接続はそのまま維持し、War Footingという明示的な政策発動時だけ接続を開く設計とする。

## 5. 為政者(ルーラー)給与の設計 — 実装済み(案B)

家政(Household)部門の資金を為政者キャラクターにどう帰属させるかについて、初版では「新規フィールドを増やさない」案Aと「`Character.wealth`を新設する」案Bを比較し、スコープ超過を理由に案Aを推奨していた。**この判断を撤回し、案Bで実装した。**

理由: 本タスクの直後の後続タスクとして「キャラクター個人をプレイする仕組み」が計画されている。個人プレイ視点では、社会的評価である`prestige`とは別に、実際に消費・贈与・相続・没収の対象になる「個人の可処分財産」が必須になる——これは投機的な深読みではなく、直後のタスクが要求する具体的要件である。ここで案Aの「威信への変換」を選ぶと、後続タスクの初手で「個人資産という概念そのものを後付けする」という、舞台設定上不自然な断崖絶壁を作ってしまう。既に必要と分かっている要件を先取りして自然な形にしておく方が、システム全体の説明力が上がる。

### 実装内容

- `Character.wealth: number`(新規・非オプショナル)を[characterTypes.ts](../../src/extensions/characters/characterTypes.ts)に追加。`createPerson()`([personFactory.ts](../../src/extensions/characters/personFactory.ts))生成時に`0`で初期化。
- [`treasuryAllocation.ts`](../../src/extensions/economy/generators/treasuryAllocation.ts)(新規)——`HOUSEHOLD_STIPEND_RATE_BY_FORM`(§3のHousehold行と同値)+ `payRulerHouseholdStipend(state, domesticIncome)`。統治形態別の家政比率を、その周期の内国収入(pollTaxRevenue + voyageIncome、軍事維持費と同じ基準値)に掛けて算出し、`nobilityContext.getRulerId()`で解決した在位中の為政者の`wealth`に加算する。
- [`taxes-generator.ts`](../../src/extensions/economy/generators/taxes-generator.ts)の`collectTaxes()`に統合——軍事維持費と同じサイクルで、治療クランプ前に家政費を控除。
- 安全策: Characters拡張が無効化されている場合(`hasCharactersContext()`が`false`)は家政費支出自体をスキップし、金額は治療に残る(消えない)。Nobility拡張が無効/在位者未設定の場合も`getRulerId()`が`undefined`を返すため同様にスキップされる——単一拡張のみを有効化した状態でも安全に動作する。
- テスト: [`treasuryAllocation.test.ts`](../../src/extensions/economy/generators/treasuryAllocation.test.ts)。

軍事(§4)の残りの実装状況は§7を参照。

## 6. 一般設計方針の更新

本セッションでの指摘を受け、今後の本プロジェクトの設計判断に対する方針を明確化する: **「投機的な将来要件のための設計をしない」という一般原則を機械的に適用しない。** 既に具体的に計画されている後続タスクがシステムを合理化・説明する見込みが高い場合は、それを見越した設計を優先し、システムが表現する舞台に不自然な断崖絶壁(後から取ってつけたような概念の追加)が生まれることを避ける。過剰な先回り(まだ何も決まっていない仮説的な将来要件への対応)とは区別すること——今回の案Bはあくまで「次のタスクとして既に明言されている」ことが根拠であり、無条件の先回り設計を許可するものではない。

## 7. 実装アーキテクチャ案

§5(ルーラー給与)・§7項目1〜8は実装済み:

1. ✅ [`treasuryAllocation.ts`](../../src/extensions/economy/generators/treasuryAllocation.ts)の`BASELINE_ALLOCATION_BY_FORM`(§3、6部門フルテーブル)。`getHouseholdStipendRate()`はこのテーブルのHousehold行を参照するよう改修(値は不変、テストも既存のまま通過)。
2. ✅ `getMilitaryStructuralMultiplier(state)`(vassal/Union判定による常時適用の構造係数、§4.2)+ `getMilitaryFundingCeiling(state)`(構造係数×`stateHasEnemy()`による平時/戦時許容フロア)。後者は§4.4-1のWar Footingレバーが実装されるまで参照者がいない、参照専用の公開関数。
3. ✅ `allocateTreasury(state, domesticIncome)` — 6部門の配分額(baseline%×収入、MarshalcyのみさらにgetMilitaryStructuralMultiplier適用)を返す。返り値の`marshalcy`/`chancery`/`stewardship`/`spymastery`/`ecclesiastica`は**名目Budget**(officeの在職状況に関わらず一定、充足率/§4.2フロア比較の基準値として使われる)。実際にtreasuryから引かれるのは`household`と`officeStipendsPaid`(項目6参照)のみ。[`taxes-generator.ts`](../../src/extensions/economy/generators/taxes-generator.ts)の`collectTaxes()`から`payRulerHouseholdStipend`直接呼び出しを置き換える形で統合。
4. ✅ `state.militaryFundingRatio`/`state.militaryDiscontent`([models.ts](../../src/types/models.ts))——§4.3の段階的蓄積/減衰を`allocateTreasury()`内で毎サイクル更新。閾値(100)超過時のみ`fmg:military-discontent-threshold` CustomEventを一度だけ発火(発火後の処理はフェーズ2、§4.3参照)。
   - テスト: [`treasuryAllocation.test.ts`](../../src/extensions/economy/generators/treasuryAllocation.test.ts)に追加(構造係数・フロア値・配分内訳・充足率・discontent蓄積/減衰・イベント発火の単発性を検証)。
5. ✅ Treasury Overview UI(Editグループの一覧ダイアログ)——各国が動かせる予算の大きさは地図世界への影響力そのものであり、ゲームバランス調整の可視化に直結するため、`GuildOverviewDialog`と同型のソート可能テーブルダイアログとして実装した(単一指標の棒グラフである`ChartsOverviewDialog`側には載せず、6部門を同時比較できる表形式を優先)。
   - `treasuryAllocation.ts`に`_snapshotByState`(モジュール内`Map<stateId, TreasuryAllocationSnapshot>`)+ `getTreasuryAllocationSnapshots()`/`clearTreasuryAllocationSnapshots()`を追加。`allocateTreasury()`は呼び出しのたびに副作用(家政費支払い・discontent更新)を伴うため、ダイアログを開くたびに再計算するのではなく、実際の`collectTaxes()`サイクルが最後に計算した結果を読み取り専用スナップショットとして保持する設計とした。
   - [`treasury-overview.ts`](../../src/extensions/economy/controllers/treasury-overview.ts)(新規コントローラ)・[`treasuryOverviewState.ts`](../../src/extensions/economy/store/treasuryOverviewState.ts)(新規Zustand store)・[`TreasuryOverviewDialog.tsx`](../../src/extensions/economy/ui/dialogs/TreasuryOverviewDialog.tsx)(新規ダイアログ)を、既存の`guild-overview.ts`/`guildOverviewState.ts`/`GuildOverviewDialog.tsx`と同じ三層構造で追加。ToolsTab「Edit」セクションに"Treasury"ボタンとして登録([`economy/index.tsx`](../../src/extensions/economy/index.tsx))。
   - 新規マップ生成時(`state id`再利用)と拡張無効化時の両方で`clearTreasuryAllocationSnapshots()`を呼び、前回マップ/前回セッションのスナップショットが残留しないようにした(既存の`clearVoyageIncome()`等と同じ箇所に追加)。
   - テスト: [`treasuryAllocation.test.ts`](../../src/extensions/economy/generators/treasuryAllocation.test.ts)にスナップショットの記録/上書き/クリアを追加。[`treasury-overview.test.ts`](../../src/extensions/economy/controllers/treasury-overview.test.ts)(新規)で行構築・除去済みState除外・クリア後の空表示を検証。
6. ✅ **中央官職(CENTRAL_OFFICES)俸給** — Player Character HUD([`PlayerCharacterPanel.tsx`](../../src/extensions/nobility/ui/components/PlayerCharacterPanel.tsx))でランダム選出された非ルーラーの官職者(例: Chancellor)の`wealth`が常に0になる不具合の報告を受けて実装。[`titleTable.ts`](../../src/extensions/nobility/data/titleTable.ts)の`CENTRAL_OFFICES`(Chancellor/Marshal/Steward/Spymaster/Court Chaplain)は§2で各部門と1対1対応済みだったが、実際に俸給が支払われる経路がこれまで存在しなかった(`payRulerHouseholdStipend`はルーラーのみ対象)。
   - `treasuryAllocation.ts`に`payCentralOfficeStipends(state, breakdown)`を追加。`state.i`+`entityType:"state"`+官職名(`title.title`)で`pack.characters`から生存中の在職者を検索し、その部門の名目Budgetを100%そのままその官職者の`Character.wealth`へ移転する(Householdと同じパターン)。官職が空席の場合はスキップし、該当分はtreasuryに残る(消えない)。
   - `allocateTreasury()`の返り値に`officeStipendsPaid`(実際に支払われた合計、treasuryからの実控除対象)を追加。名目Budget自体(`marshalcy`等)は在職状況に関わらず不変のまま——充足率(§4.3)や§4.2のフロア比較が官職の空席で歪まないようにするため、意図的に分離した。
   - [`taxes-generator.ts`](../../src/extensions/economy/generators/taxes-generator.ts)の`collectTaxes()`で`allocation.officeStipendsPaid`をtreasury控除に追加。
   - Treasury Overview UI(項目5)に"Stipends"列を追加。
   - **経済バランスへの影響に注意**: これまでChancery/Stewardship/Spymastery/Ecclesiastica(合計で内国収入の35〜92%、統治形態依存)はtreasuryから一切控除されない情報値だったが、官職が埋まっている限りその全額が官職者個人へ実際に流出するようになった。結果としてtreasuryの蓄積速度は大幅に低下する(統治形態次第ではほぼ増えなくなる可能性がある)。意図的な変更だが、既存セーブの財政バランスに大きく影響するため明記しておく。
   - テスト: [`treasuryAllocation.test.ts`](../../src/extensions/economy/generators/treasuryAllocation.test.ts)に`payCentralOfficeStipends()`の在職者支払い・空席スキップ・死亡官職者スキップ・他State官職者との混同なし・充足率が空席の影響を受けないことを検証する`describe`ブロックを追加。
7. ✅ **非中央官職の俸給接続**(項目3の未着手課題を解消)——「属州領主はBurgsから、野戦指揮官はStateの軍事費から、ギルド/商人系称号はGuildsやMarketsから」という支払い元の指定を受けて実装。いずれも`state.treasury`とは別のプール(Burg/Market/Guildそれぞれの自己資金)から支払われるため、Treasury Overviewの表(6部門+Stipends)には含まれない——state財政とは独立した資金移動。
   - **属州領主**(`entityType:"province"`の生存中領主)——[`characterStipends.ts`](../../src/extensions/economy/generators/characterStipends.ts)の`payProvinceLordStipends(state)`が、領主の着任Burg(`province.burg`)の`burg.treasury`から`PROVINCE_LORD_STIPEND_RATE`(10%)を`Character.wealth`へ移転。Burg側は控除、`state.treasury`は無関係。
   - **野戦指揮官**——`getFieldCommanderStipend`=`clamp(upkeep×15%, floor 0.5, cap 1.5)` SP/cycle。首都親衛隊は対象外。
   - **中央官職**——部門名目Budgetの全額ではなく `clamp(Budget×12%, 0.8, 3.0)` を個人俸給とし、残余は `state.treasury` に残す。
   - **為政者家政**——`clamp(income×formRate, 1.0, 5.0)` SP/cycle。
   - **Guild Master/Apprentice**——Master 固定 0.35 SP/cycle。Apprentice は師弟双方 solidarity ≥ 20 のときだけ年齢帯固定小遣い(0.03/0.05/0.08)。金庫は天井のみ。
   - **属州領主 / 市場**——固定 1.00 / 管理者 0.70 / 競合 0.30 SP/cycle（各プールは天井のみ）。
   - 詳細は [`docs/analytics/character-wealth-balance.md`](../analytics/character-wealth-balance.md)。
   - **Market Manager/Rival Merchant**(`marketManagers.ts`。ManagerはChairperson役も兼務するため`merchantOrganizations.ts`の"Merchant Company Head"も同一キャラクターで自動的にカバーされる。Secretary/Bodyguard/Executive役職は`MERCHANT_ORGANIZATION_STAFF_ENABLED=false`で現状生成されないため対象外)——`payMarketStipends()`が`market.marketTreasury.balance`からManager(`MARKET_MANAGER_STIPEND_RATE`8%)→各Rival(`MARKET_RIVAL_STIPEND_RATE`3%)の順に控除・支払い。
   - いずれもレートは仮値・未調整(guildTreasury.ts/foodProduction.tsの既存プレースホルダーと同じ扱い)。
   - テスト: [`characterStipends.test.ts`](../../src/extensions/economy/generators/characterStipends.test.ts)(新規)で領主/Guild/Market各関数の支払い・空席/資金枯渇時のno-op・他State/他Burgとの混同なしを検証。[`treasuryAllocation.test.ts`](../../src/extensions/economy/generators/treasuryAllocation.test.ts)に`payFieldCommanderStipends()`用の`describe`ブロックを追加(通常regiment/首都親衛隊除外/専属士官不在時のno-op)。
8. ✅ **初期所持金のでっち上げ**(Advance Time前でも各人が資金を持つ設計)——「Marketsが最初からでっちあげの予算を持っている」のと同じ考え方で、`STARTING_BURG_TREASURY_PER_POPULATION`(foodProduction.ts)/Market初期資本(同ファイル)に倣い、生成直後にキャラクター側にも同様の初期資金を持たせる。
   - `characterStipends.ts`の`seedMissingCharacterWealth()`——ルーラー/中央官職/属州領主/野戦指揮官/Guild Master・Apprentice/Market Manager・Rivalの全役職について、`Character.wealth === 0`(＝一度も実俸給を受け取っていない)の者だけを対象に、その役職の1サイクル分の想定俸給額(上記の各レート×既に生成済みの`state.pollTax`/`burg.treasury`/`market.marketTreasury.balance`/guild treasury等)に、6〜18サイクル分のランダムな「積立年数」を乗じた金額を`wealth`へ設定する。wealthが0でない(既に実際の俸給や消費が発生した)キャラクターには一切触れないため、複数回の"regenerate"実行でも安全。
   - 呼び出し元は[`nobility/index.tsx`](../../src/extensions/nobility/index.tsx)の`regenerateNobilityData()`——`assignOfficers()`/`assignProvinceLords()`(領主/士官の生成)の直後、かつeconomy拡張の初期生成タスク(`registerMapReadyTask`、economyが先に登録されるため必ず先に完了し`state.pollTax`/各treasuryが計算済み)より後に実行される、というタスク実行順(`src/runtime/mapReadyTaskCoordinator.ts`が登録順に`await`で逐次実行)に依拠した設計。economy拡張が無効な場合は各種getterが空配列を返すだけで安全にno-opする。
   - テスト: [`characterStipends.test.ts`](../../src/extensions/economy/generators/characterStipends.test.ts)に`seedMissingCharacterWealth()`の新規ルーラー/属州領主への初期資金付与、既にwealthを持つキャラクターへの非上書きを検証。

未着手(次フェーズ以降):

1. §4.4のWar Footingレバーと過剰投資(案β)の一般化実装
2. Personality平均値による補正(states-personality.mdとの接続): Greedが高い国家ほど家政比率が上振れ、Boldness/Confidenceが高い国家ほど軍事削減により踏み込みやすい、という形で§4.2の係数をpersonality平均でシフトする
3. 項目7で接続した俸給レート(領主10%/野戦指揮官15%/Guild Master10%・Apprentice3%/Market Manager8%・Rival3%)・項目8の積立年数(6〜18サイクル)はいずれも未調整のプレースホルダー——実プレイでのtreasury/burg.treasury/guild treasury/market treasuryの蓄積速度とのバランス確認が必要
4. 各部門(軍事以外)支出の「俸給以外」のゲーム内効果——家宰府→徴税効率ボーナス拡張、諜報府→nobility espionage資金源、教会庁→宗教不満度緩和、あたりが自然な接続候補(項目6の俸給支払いとは別軸)

## 8. 非目的

- 不満蓄積閾値超過後の具体的な政治的帰結(離反・簒奪・内乱)の設計——nobility拡張のクーデター機構と合わせてフェーズ2で扱う
- 軍事以外の部門支出が具体的に何を発生させるか(効果のゲームバランス調整)
- Burg単位(市政府)の予算配分——本設計はState単位のみ
- 現代的統治形態(`modern`官職セット)への配分設計——本設計は`medieval`のみ
- 為政者`wealth`の具体的な使い道(消費・贈与・相続・没収)の実装——フィールドと歳入経路のみ用意し、後続の「キャラクター個人プレイ」タスク側で使用する
