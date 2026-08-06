# Fantasy Culture Set 専用交易品 — 調査ノート

Culture set が `highFantasy` / `darkFantasy`（`FANTASY_CULTURE_SETS`, [src/data/raceCivicStance.ts](../../src/data/raceCivicStance.ts)）のときに登録したい、ファンタジー・ジャンル特有の交易品（Good）の調査。JRPG（日本語圏）と英語圏ファンタジー（TRPG・洋ゲー・原作小説）それぞれの「定番商品」を洗い出し、[docs/simulation/goods.md](../simulation/goods.md) および [docs/plan/exchange/](exchange/README.md)（史実ベースの交易品拡充計画）に対する**ジャンル・フレーバー軸の追加候補**として整理する。

**現状の実装**: `GOODS_DATA`（[goods-generator.ts](../../src/extensions/economy/generators/goods-generator.ts)）に culturesSet 条件で品目を分岐させる仕組みは存在しない。`multipliers` は `cultureType` / `culture` / `state` / `religion` / `biome` / `zone` のみで、`culturesSet`（`generic` / `highFantasy` / `darkFantasy`）はキーとして扱えない（[goodsGeneratorTypes.ts](../../src/extensions/economy/generators/goodsGeneratorTypes.ts)）。本ドキュメントは調査・アイデア出しであり、未実装。

**命名時の注意**: 本ドキュメントに登場する固有名詞の一部（Mithril 等）はトールキン関連の商標対象。実装時の表記は [docs/world/help/trademarked-fantasy-terms.md](../world/help/trademarked-fantasy-terms.md) を先に確認すること。

---

## 1. JRPG（日本語圏ファンタジーゲーム）の定番商品

FF・ドラクエ系列を起点に、多くの和製ファンタジー RPG で共通化した「お約束アイテム」。ほぼすべてが店売り前提の消費財で、効果が名前から即座に読み取れる記号性が特徴。

### 1.1 回復・状態異常系消費財

| 和名 | 英名（慣用訳） | 効果 | 由来・備考 |
| :--- | :--- | :--- | :--- |
| やくそう（薬草） | Medicinal Herb | HP少量回復 | ドラクエ発祥。現実の傷薬・生薬をそのまま持ち込んだ最も原初的な回復アイテム |
| ポーション | Potion | HP少量〜中回復 | FF発祥。英語で本来「（薬の）一服」を指す語を、そのまま固有アイテム名として定着させた |
| ハイポーション／エクスポーション | Hi-Potion / X-Potion | HP中〜大回復 | ポーションの上位互換。JRPG特有の「同名アイテムに接頭辞を足して階層化する」命名規則の典型 |
| エーテル | Ether | MP回復 | 実在の物質名（麻酔・揮発性溶剤としてのエーテル、古典的には「宇宙を満たす物質」の意）を借用し、「魔力を回復する液体」という記号として再定義 |
| エリクサー | Elixir | HP・MP全回復 | 錬金術の「賢者の石の溶液＝万能薬」という古典的概念に由来。シリーズ通して「貴重で温存しがちな最上位アイテム」という扱いが定番化 |
| フェニックスの尾 | Phoenix Down | 戦闘不能から少量HPで蘇生 | 不死鳥の伝承（死んでも灰から蘇る）をそのまま蘇生アイテムに転用。JRPG蘇生アイテムの代名詞 |
| どくけし（毒消し） | Antidote | 毒状態を解除 | 現実の解毒薬がそのまま定番アイテム化 |
| まんげつそう／せかいじゅの葉 | World Tree Leaf 等 | 状態異常全回復・戦闘不能から全回復 | ドラクエ系。世界樹（北欧神話ユグドラシル）モチーフの上位アイテム |
| 目覚まし草 | Awakening Herb 等 | 睡眠状態を解除 | 状態異常ごとに専用アイテムを用意する JRPG の類型パターンの一例 |

### 1.2 素材・加工系（鍛冶・錬金クラフト向け）

| 和名 | 英名（慣用訳） | 用途 | 備考 |
| :--- | :--- | :--- | :--- |
| ミスリル鉱石／ミスリル銀 | ~~Mithril~~ → **Mithral** Ore / Mithral Silver | 軽量高性能な武具の素材 | 出典はトールキン『指輪物語』（後述 §2）。`Mithril` はミドルアース社の登録商標のため、実装時は D&D公式が採用する差別化綴り `Mithral` を使う（[trademarked-fantasy-terms.md](../world/help/trademarked-fantasy-terms.md) §2.1）。JRPGでは中間素材として鉱石→インゴット→装備の生産チェーンに組み込まれることが多い |
| オリハルコン | Orichalcum | 最上位金属素材 | プラトン『クリティアス』に登場する伝説の金属（アトランティスの黄金に輝く合金）が出典。ファンタジー創作で「ミスリルのさらに上」の最終素材として定番化 |
| 竜の鱗／竜の牙／竜の骨 | Dragon Scale / Fang / Bone | 高級装備の素材 | モンスタードロップを鍛冶屋・道具屋に売却／持ち込みで装備強化する「素材収集」ループの中核 |
| 魔石／マナストーン | Magic Stone / Mana Stone | 魔法のエネルギー源、魔道具の燃料 | 「魔法をエネルギー資源として流通させる」和製ファンタジー・SFファンタジー（特に魔法×産業革命もの）の定番。経済シミュレーション適性が高い |
| 星のかけら | Star Fragment 等 | 最上位装備の鍛造素材 | FF系列。天体・流星をモチーフにした稀少加工素材 |
| モンスターの素材（牙・爪・皮・角） | Monster Fang / Claw / Hide / Horn | 道具屋への売却益、装備強化素材 | 「倒したモンスターの部位がそのまま換金可能」という JRPG 経済ループの基本構造 |

### 1.3 儀式・道具系

| 和名 | 英名（慣用訳） | 用途 |
| :--- | :--- | :--- |
| 聖水 | Holy Water | アンデッド系への攻撃・浄化儀式 |
| 護符／お守り | Charm / Talisman | 状態異常予防、幸運上昇 |
| 巻物 | Scroll | 一度きりの魔法発動アイテム |
| 魔法のロープ／脱出の巻物 | Rope of Escape 等 | ダンジョンからの緊急離脱 |

**JRPG系の特徴のまとめ**: (1) 名称と効果が一対一で対応する記号的ネーミング、(2) 上位互換による階層化命名（ポーション→ハイポーション→エクスポーション）、(3) モンスター討伐→部位ドロップ→道具屋売却／鍛冶強化という素材経済ループが必ず併走する。

---

## 2. 英語圏ファンタジーの定番商品

英語圏では「JRPG的な単一の定番消費財リスト」は薄く、代わりに **(a) TRPG（D&D系）の錬金・素材経済**、**(b) 原作小説由来の固有アイテム**、**(c) 洋ゲー（Skyrim/WoW/Diablo/Witcher等、TRPGの影響を強く受けた系譜）の商品リスト**の3層で「定番」が形成されている。

### 2.1 稀少金属（Fantasy Metals）

| 名称 | 特徴 | 出典・備考 |
| :--- | :--- | :--- |
| **Mithril / Mithral** | 鋼より軽く、鋼より丈夫 | トールキン『指輪物語』のモリアの銀（"true-silver"）が原典。D&D では `mithral` 表記で防具の重量区分を1段軽くする特殊金属として公式ルール化されている |
| **Adamantine / Adamantium** | 重いが実質破壊不可能なほど硬い | ギリシャ語 adamas（征服されざるもの）に由来する古典的な最硬金属モチーフ。D&D 5e では武具にクリティカル無効化などの特性を付与。Marvel の Adamantium 等、SFにも越境した汎用トロープ |
| **Cold Iron** | 妖精（Fae）や悪魔に対して特効 | ヨーロッパ民間伝承（鉄が妖精を退ける）が出典。D&D でも fey/demon 特効の武器素材として定番 |
| **Silver（銀）** | 人狼・アンデッド特効 | 民間伝承（銀の弾丸が人狼を倒す）由来。武器コーティング材としてほぼ全ての西洋ファンタジー作品で共通 |
| **Orichalcum** | 最上位帯の金属 | 上記1.2参照。英語圏でも同じくプラトン起源で「ミスリル・アダマンタインのさらに上」に置かれることが多い |

金属の序列は作品ごとにばらつくが、代表的な並びは `Bronze < Iron < Steel < Mithril < Adamantine < (Orichalcum ほか作品固有の最上位金属)` という強度インフレ構造で共通する。

### 2.2 TRPG（D&D系）の錬金・調達品

D&D 5e の `Alchemist's Supplies`（錬金道具一式）は「ガラスビーカー、加熱用金属フレーム、ガラス撹拌棒、乳鉢と乳棒、塩・鉄粉・精製水などの一般薬品一式」と定義されており、**特定の完成品ではなく「調合するための道具・汎用試薬」**が基本単位になっている点が JRPG と対照的。実際の消費財・素材としては：

| 分類 | 代表品目 | 備考 |
| :--- | :--- | :--- |
| 回復薬 | Potion of Healing | D&D で最も基本的な回復アイテム。JRPGのポーションと機能的にほぼ同一だが、「魔法のポーションは希少で高価、店売り前提ではない」というグラウンデッドな経済観が既定ルール |
| 毒・特殊薬 | Potion of Poison, Antitoxin | 解毒薬（Antitoxin）はJRPGの「どくけし」に相当 |
| 魔法書・呪文巻物 | Spellbook, Scroll of ~ | 呪文を紙・皮に定着させた一回性の魔法発動体。JRPGの「巻物」と同型トロープ |
| 魔法の触媒・呪文構成要素 | Component Pouch, 各種 Focus（水晶球・聖印等） | 「詠唱に物理的な材料が要る」という西洋魔法観の反映。JRPGにはほぼ対応物がない |
| モンスター由来の錬金素材 | 竜の鱗、トロールの脂肪、ユニコーンの角、バジリスクの毒、フェニックスの羽、グリフォンの羽根、ワイバーンの毒 | インディーTRPG・ファンタジーゲームで広く見られる「錬金屋（Apothecary/Alchemist）が買い取るモンスター素材」の定番リスト。稀少素材ほど大きな町でしか売買できない／取り寄せが必要、という経済設計もセットで語られることが多い |

### 2.3 原作小説・洋ゲー由来の固有アイテム

| 名称 | 出典 | 備考 |
| :--- | :--- | :--- |
| Lembas（レンバス、エルフの携行食） | トールキン『指輪物語』 | 少量で満腹感を与える携行保存食。JRPGの「携行食料」枠に相当するが、西洋ファンタジーでは「エルフ製の特別な保存食」という民族色を伴って語られることが多い |
| Pipe-weed（パイプ草） | トールキン『ホビットの冒険』『指輪物語』 | ホビット庄特産の嗜好品（タバコ的作物）。地域特産品としてのフレーバーグッズの好例 |
| Soul Gem（ソウルジェム） | The Elder Scrolls（Skyrim等） | 生物の魂を封じる宝石。エンチャント（付呪）の燃料として交易・鍛冶に組み込まれる、和製の「魔石」と機能的に近い西洋ゲーム発の概念 |
| Alchemy Ingredients（Nirnroot 等の採取素材） | The Elder Scrolls | 薬草・鉱物・モンスター素材を採取してポーションを調合するシステム。「素材採取→調合」という構造はJRPGのクラフト系と収斂している |
| Runestone / Enchanting Materials（Arcane Dust 等） | World of Warcraft | 魔法金属・付呪素材が「Trade Goods」カテゴリとして市場で流通する。経済シム的な設計思想が本プロジェクトの Goods システムと親和性が高い |
| Runes / Gems（ソケット式強化素材） | Diablo | 武具に差し込む強化アイテム。稀少度に応じた「ルーン序列」が定番化 |
| Witcher's Potions / Oils / Bombs | The Witcher | モンスターの部位（血・脂・毒腺等）を素材に、モンスター種族ごとの弱点を突く薬・油・爆弾を調合する。JRPGの「モンスター素材売却」とTRPGの「モンスター錬金素材」の両方を最も直接的に統合した例 |

### 2.4 英語圏の特徴のまとめ

- **消費財より「素材と道具」に重心**: TRPG由来の伝統では、既製の魔法消費財（ポーション等）は貴重・非日常品として扱われ、代わりに素材（金属・モンスター部位・呪文構成要素）と、それを加工する専門技能（Alchemist's Supplies等の「道具」）が経済の主役になる。
- **金属の位階構造が強い記号**: Mithril / Adamantine / Cold Iron / Silver はいずれも「特定の敵・特定の用途に効く」という機能的裏付けを民間伝承や原典小説から継承しており、JRPGのような「ただの上位互換」ではなく質的に異なる特効素材として扱われることが多い。
- **地域色を伴う特産品**: Lembas・Pipe-weed のように「特定の種族・地方の特産品」としてのフレーバーグッズが多く、これは本プロジェクトの `multipliers.cultureType` / `multipliers.culture` の仕組みと相性が良い。
- **洋ゲー（Skyrim/WoW/Diablo/Witcher）は事実上JRPGと収斂**: 商業ゲームとしての遊びやすさを優先する過程で、「採取した素材を売る／消費財に加工する」というJRPG的経済ループを取り入れており、TRPGの厳格な希少性ルールより緩い。

---

## 3. JRPG と英語圏ファンタジーの比較まとめ

| 観点 | JRPG | 英語圏（TRPG系譜） | 英語圏（洋ゲー系譜） |
| :--- | :--- | :--- | :--- |
| 回復薬の位置づけ | 店売り前提の日用品。名前＝効果が一対一 | 貴重品・非日常品。魔法経済の希少資源として扱われがち | JRPGに近く、店売り／採取即使用が一般的 |
| 素材経済 | モンスタードロップ→道具屋売却／鍛冶強化が定番ループ | Alchemist が特定モンスター素材を買い取る、という設定は一般的だが「道具一式」中心でレシピ性が薄い | モンスター素材採取→ポーション/エンチャント素材、と明確なクラフトループを持つ（Witcher・Skyrimが顕著） |
| 最上位金属 | ミスリル→オリハルコンの二段構え | Mithril / Adamantine / Cold Iron / Silver が並立し、それぞれ用途が異なる（軽量・硬度・特効） | TRPGの体系をほぼ踏襲 |
| 蘇生・状態異常薬 | 専用アイテムが明確に体系化（フェニックスの尾、どくけし等） | 個別の呪文・魔法アイテムとして扱われることが多く、消費財としての体系化は薄い | JRPGに近い体系化が見られる（Elixir of Life 等） |
| 地域特産フレーバー | 薄い（世界共通アイテムが基本） | 強い（Lembas、Pipe-weed など種族・地方色が明確） | 中間（クラフト素材はバイオーム依存で表現されることが多い） |

**本プロジェクトへの示唆**: 本フォークの Goods システムはすでに「バイオーム産出 × cultureType 補正 × レシピ生産」という構造を持っており、これは英語圏TRPG系譜（素材＋クラフト＋地域色）との親和性が高い。一方でJRPG的な「効果名＝アイテム名の消費財」は、現状の需要カテゴリ（`food`/`utilities`/`construction`/`military`/`hunting`/`luxury`）に対応する枠が薄い（回復薬に相当する需要カテゴリが無い）。導入する場合は `luxury` または新設の `magic` 系カテゴリへの計上が必要になる。

---

## 4. GOODS_DATA 導入候補（アイデア出し・未実装）

`docs/plan/exchange/04-goods-data-candidates.md` の形式に倣った品目候補案。**`multipliers.culturesSet`（`generic` / `highFantasy` / `darkFantasy`）というキーは現行スキーマに存在しない**ため、実装するには [goodsGeneratorTypes.ts](../../src/extensions/economy/generators/goodsGeneratorTypes.ts) の `Good.multipliers` 型拡張と、`goods-generator.ts` 側でのフィルタ処理追加が前提になる（`isGoodEnabled()` のような gate 関数を `culturesSet` 版として新設する案が有力— §5 参照）。

### 4.1 消費財枠（JRPG寄り・luxury/新設カテゴリ想定）

| Good | 由来 | 素材／生産案 | 備考 |
| :--- | :--- | :--- | :--- |
| Healing Potion | JRPG「ポーション」＋TRPG「Potion of Healing」の折衷 | `recipes: [{ Herb: 1, "Glass Vial": 0.5 }]` 等 | 既存 `demandCoverage` に対応枠が無い。luxury計上が現実的な妥協案 |
| Antidote | やくそう系統／Antitoxin | Herb + 既存 `Wax`（容器封蝋） | 既存の医薬系Goodがあれば統合可（要確認） |
| Elixir | JRPG「エリクサー」 | 稀少レシピ（Mana Stone + Phoenix Feather 等） | value を既存最上位帯（22+）に設定し「めったに出回らない」を表現 |
| Mana Stone / Magic Stone | 和製ファンタジー「魔石」＋Skyrim「Soul Gem」の統合概念 | `chance` 産出（高地・遺跡近傍） | 魔道具・エンチャント燃料として `demandCoverage: { utilities }` に寄せられる |

### 4.2 素材枠（英語圏TRPG寄り・construction/military/luxury想定）

| Good | 由来 | 素材／生産案 | 備考 |
| :--- | :--- | :--- | :--- |
| Mithral Ore（`Mithril` は商標のため不使用） | トールキン | `distribution: "minHeight(70) && ..."`（既存 Iron Ore と同系統、稀少版） | 既存 Iron/Silver との代替武具レシピに接続しやすい |
| Adamantine | ギリシャ神話・D&D | チャンス産出は極小、火山地形／深部地形限定 | value は Gold(40) 超級を想定 |
| Cold Iron | 欧州民間伝承 | Iron Ore の派生（レシピ加工品） | fae/demon特効という「軍需・儀式」枠の需要接続が必要 |
| Dragon Scale / Monster Hide | JRPG「竜の鱗」＋Witcher系「モンスター素材」の統合 | `dangerField.ts` / `high-fantasy-dungeons.md` のダンジョン討伐と接続する案が自然 | 既存の Danger/Dungeon 実装と紐付けられる唯一の候補。詳細は §5 |

### 4.3 儀式・地域特産枠

| Good | 由来 | 備考 |
| :--- | :--- | :--- |
| Holy Water | JRPG「聖水」＋西洋民間伝承 | アンデッド対策の軍需・宗教需要に接続可能 |
| Elven Waybread（Lembas系） | トールキン | High Fantasy専用の携行食フレーバー。`cultureType`（Highland/Forest系）との相性を検討 |

---

## 5. 実装に向けた論点（未決定・要議論）

1. **culturesSet gate の設計**: `isGoodEnabled()`（gunpowderEraEnabled と同型のフラグゲート）に倣い、`multipliers.culturesSet?: Partial<Record<CulturesSet, number>>` を Good に追加するか、あるいは `chance` そのものを culturesSet 別に無効化する別関数を新設するか。時代ゲート（`GoodEra`, exchange/04 §5）と設計思想を揃えるのが望ましい。
2. **需要カテゴリの不足**: `DEMAND_PRIORITY`（food/utilities/construction/military/hunting/luxury）に「回復薬・魔法アイテム」に対応する枠が無い。既存の `luxury` に間借りするか、新カテゴリ（例: `magic`）を追加するかは Demand/Market 側への波及が大きいため、経済シム全体設計（`docs/simulation/`）との整合を取ってから決めるべき。
3. **モンスター素材との接続**: Dragon Scale 等は `docs/plan/high-fantasy-dungeons.md`（ダンジョン配置）や `dangerField.ts` / `threatProfiles.ts`（脅威・討伐）とドロップ品として連動させるのが最も説得力がある。単純な `biomeOutputByTag` 産出ではなく「討伐イベント→Good付与」という生成経路が必要になり、これは Goods 単体の変更では完結しない。
4. **highFantasy と darkFantasy の書き分け**: 両者は `FANTASY_CULTURE_SETS` として同一集合だが、`raceCivicStance.ts` のコメントにある通り世界観のトーンが異なる（Dark Fantasyはモンスターが居住不能セルを作るほど脅威）。Dragon Scale/Monster Hide 系は Dark Fantasy でこそ供給が厚くなるべきで、highFantasy では Mithril/Elven Waybread 等の「高潔な」フレーバーを厚くする、といった非対称な重み付けが将来的な設計候補になる。

---

## 参考（Web調査）

- [Standard Fantasy Setting - TV Tropes](https://tvtropes.org/pmwiki/pmwiki.php/Main/StandardFantasySetting)
- [Mithril - TV Tropes](https://tvtropes.org/pmwiki/pmwiki.php/Main/Mithril)
- [Standard RPG Items - TV Tropes](https://tvtropes.org/pmwiki/pmwiki.php/Main/StandardRPGItems)
- [Fantasy Metals - TV Tropes](https://tvtropes.org/pmwiki/pmwiki.php/Main/FantasyMetals)
- [Alchemy Tropes - TV Tropes](https://tvtropes.org/pmwiki/pmwiki.php/Main/AlchemyTropes)
- [Metals in DnD 5e: Costs, Values, AC, and More - Black Citadel RPG](https://blackcitadelrpg.com/metals-5e/)
- [Alchemist and Potion Shop for D&D 5e - The Thieves Guild](https://www.thievesguild.cc/shops/shop-potion)
- [ポーション (ファイナルファンタジー) - Wikipedia](https://ja.wikipedia.org/wiki/%E3%83%9D%E3%83%BC%E3%82%B7%E3%83%A7%E3%83%B3_(%E3%83%95%E3%82%A1%E3%82%A4%E3%83%8A%E3%83%AB%E3%83%95%E3%82%A1%E3%83%B3%E3%82%BF%E3%82%B8%E3%83%BC))
- [フェニックスの尾 - ファイナルファンタジー用語辞典 Wiki*](https://wikiwiki.jp/ffdic/%E3%82%A2%E3%82%A4%E3%83%86%E3%83%A0/%E3%80%90%E3%83%95%E3%82%A7%E3%83%8B%E3%83%83%E3%82%AF%E3%82%B9%E3%81%AE%E5%B0%BE%E3%80%91)
- [ドラクエ アイテム『薬草』の解説 - Ken and Piki Blog](https://kenandpikiblog.com/%E3%83%89%E3%83%A9%E3%82%AF%E3%82%A8-%E3%80%8E%E8%96%AC%E8%8D%89%E3%80%8F%E3%81%AE%E8%A7%A3%E8%AA%AC-%E5%85%A8%E3%82%B7%E3%83%AA%E3%83%BC%E3%82%BA%E3%81%AE%E8%96%AC%E8%8D%89%E3%82%82%E7%B4%B9%E4%BB%8B/)
