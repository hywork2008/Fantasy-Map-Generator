# キャラクター・バックストーリー属性設計

**Status**: Phase A–E 実装済み（生成・Solidarity/Favor・贈答・芸術 Good・Details/CSV・戦略AI/結婚/汚職・Dynasty/Bonds/文化パック/フレーバー）。  
**Related**: `docs/plan/characters.md`, `docs/plan/char-economy.md`, `docs/plan/char.md`, `src/extensions/characters/characterTypes.ts`, `src/extensions/characters/backstoryProfile.ts`, `src/extensions/characters/personFactory.ts`  
**Goal**: 能力・性格だけでは書けない「何に仕えて生きているか」「何が好きで何が嫌いか」「どこから来た誰か」「誰をどれだけ好むか（ギャルゲー式好感度）」「何を贈ると心が動く／逆に嫌われるか」をデータ化し、フレーバー文・伝記・政治/経済AIの動機付けの共通基盤にする。

---

## 0. 問題意識

現状の `Character` は、**できること（Skills）** と **どう振る舞うか（Personality）** は持つが、次が欠けている。

| 欠けている軸 | 人間が人物を語るときに必ず使う情報 | 現状の代替（不十分） |
| :--- | :--- | :--- |
| **何を一番大事にするか** | 「家門のため」「神のため」「金のため」 | `zeal`（強度のみ・向き先なし）、`piety`（宗教傾倒の強さ）、docs 上の `Loyalty Target`（未実装） |
| **好き・嫌い** | 酒・金・戦・社交・特定階層への偏見 | `sociability` / `greed` / `compassion` など汎用スカラーのみ |
| **出自・身分** | 王族・旧家・成り上がり・奴隷解放など | `prestige` が漠然と近いが、身分階層ではない |
| **生まれ・故郷** | 王都育ちか辺境育ちか | `location`（現在地）、任意の `birthStateId`（生成時ほぼ未設定） |
| **個人史のフック** | 恩義・屈辱・師・ライバル | `affinities`（国家単位）、`vengefulness`（強度のみ） |
| **人物への好感** | 誰が誰を好きか・嫌いか | 国家 `affinities` のみ。同郷・同軍属・贈答の効果なし |
| **贈り物で心を動かす** | 芸術好きに芸術品を贈る等 | 個人在庫なし。芸術完成品 Good も不足 |

結果として、`人物まとめ` のような解釈文は **数値の読み替え** に留まり、「なぜその数値になる人生を送ったか」を生成できない。本計画は、その前段として **バックストーリー用プロファイル（Backstory Profile）** をスキーマと生成ルールで定義する。

### 0.1 設計原則

1. **強度と向き先を分離する**  
   既存の `zeal` / `piety` / `greed` / `patriotism`（計画中）は **強さ**、本計画の *Commitment* は **何に対して強いか** を表す。
2. **物語用データとシミュレーション用データを同じ語彙で持つ**  
   UI の伝記生成と、将来の AI（宣戦・結婚・贈収賄・汚職）が同じフィールドを読む。
3. **全キャラ必須の薄いコア + 役職が厚いオプション**  
   商人にも軍人にも王族にも載る最小セットを先に固定し、貴族専用の家門史などは後段で拡張する。
4. **時代・文化で語彙を差し替え可能にする**  
   中世ヨーロッパの「王の神聖性」も、神権国家の「教団」、遊牧の「血族」、共和の「都市」も、同じ *CommitmentKind* 列挙の重み付けで表現する。
5. **既存フィールドを壊さない**  
   `skills` / `personality` / `titles` / `roles` / `location` はそのまま。本プロファイルは追加ブロックとして載せる。
6. **人物間感情は「連帯感」よりギャルゲー式の好感度で持つ**  
   同郷・同軍属は自動で永続連帯する固定陣営ではなく、**初期値やイベント補正の材料**。本体は数値の好き／嫌い／無関心（§6）。賄賂が清廉な相手に逆効果になるのも、この数値への符号付きデルタで表現する。

---

## 1. 現状ギャップ監査

### 1.1 実装済み（`characterTypes.ts`）

| 領域 | フィールド | バックストーリー上の役割 |
| :--- | :--- | :--- |
| 身元 | `name`, `age`, `gender`, `culture` | 名前・年齢・性・文化圏 |
| 地位 | `titles[]`, `roles[]`, `pastTitles[]` | 現職・経歴の骨格 |
| 地理 | `location?`（burg id） | **現在地**のみ。出生地ではない |
| 帰属 | `state`, `birthStateId?`, `nationalityStateId?` | 所属国・出生国・国籍の枠はあるが生成が薄い |
| 能力 | `skills`（9種） | 何が得意か |
| 性格 | `personality`（12種） | 行動様式の傾向 |
| 対外感情 | `affinities`（stateId → -100..100） | **国家**への好悪のみ |
| 婚姻外交 | `marriages[]` | 国家間の婚姻紐帯 |
| 家族 | `family`（人数と任意 id） | 構造は薄い（名前付き家系ではない） |
| 資産・容姿 | `wealth`, `appearance`, `prestige` | 経済力・魅力・漠然とした家柄感 |

### 1.2 ドキュメントのみ / 未実装

| 項目 | 出典 | 備考 |
| :--- | :--- | :--- |
| `Patriotism` | `characters.md` §4 | `CharacterPersonality` に未定義 |
| `Loyalty Target` | `characters.md` §4 | 「国・組織・人物」へ向く忠誠。本計画の *Commitment* と統合すべき |
| 家門・家系オブジェクト | 継承の記述のみ | `family.fatherId` 等はあるが Dynasty 実体なし |
| 宗教 id | pack に `religions` / `cells.religion` はある | Character に `religionId` なし |
| 嗜好・嫌悪 | なし | 商人の rival ヘイトは計画メモのみ（`characters.md` 末尾） |

### 1.3 「人物まとめ」作業で露呈した不足

`temp/chars/人物まとめ-*.md` で解釈を書く際、次を **推測で補う** 必要があった。

- 家門存続を優先するのか、国家・信仰・私利を優先するのか（例: 伯爵の強欲 vs 名誉）
- 酒・美食・色欲・戦場・宮廷など **生活の味** の有無
- 成り上がりか世襲か、王都育ちか辺境育ちか
- 誰を師・恩人・仇・ライバルと見ているか
- 軍人嫌いの外交官、貴族嫌いの商人、異教徒嫌いの聖職者、といった **カテゴリ嫌悪**

これらは Personality の高低から **部分的に推論可能** だが、推論は解釈者ごとにブレる。データとして持つべきである。

---

## 2. 提案スキーマ概要

```
Character
├── (既存) skills / personality / titles / roles / family / affinities(state) / ...
├── favor: Record<characterId, number>   // 人物間好感度 -100..100（§6）
├── inventory?: Record<goodId, number>   // 個人所持 Good（贈答用・§6.5）
└── backstory: CharacterBackstory
    ├── origin          // 出自・出生・社会階層
    ├── commitment      // 何を一番大事にするか（Zeal の向き先）
    ├── tastes          // 好き・嫌い（嗜好 / 嫌悪）
    ├── bonds           // 関係ラベル（mentor 等・好感度の注釈）
    └── hooks           // 短文フック / 生成済みフレーバー（任意）
```

実装上はフラットでもネストでもよいが、**論理ブロック** は Origin / Commitment / Tastes / Favor / Gifts を核にする。

---

## 3. Origin — 出自・出生・現在の居場所

### 3.1 フィールド定義

| フィールド | 型 | 説明 |
| :--- | :--- | :--- |
| `socialStratum` | enum | 生まれの社会階層（下記） |
| `estateStatus` | enum | 現在の身分ステータス（昇進・没落後） |
| `birthBurgId` | number \| null | 生まれた都市（pack.burgs id） |
| `birthProvinceId` | number \| null | 生まれた州（都市が無い場合のフォールバック） |
| `birthStateId` | number | 出生時の国家（既存 optional を必須化・生成時設定） |
| `homeBurgId` | number \| null | 本拠・実家・本領の中心都市 |
| `raisedIn` | enum | 成育環境の類型（下記） |
| `lineageId` | number \| null | 家門 ID（将来の Dynasty テーブル。v1 は null 可） |
| `lineageName` | string \| null | 表示用家名（Dynasty 未実装時の軽量代替） |
| `isDynasticClaimant` | boolean | 王位・爵位の継承候補か（生成時の物語フラグ） |
| `religionId` | number \| null | 個人の宗教（未設定時は出生セル/文化の多数派を推定） |

#### SocialStratum（生まれ）

```
royal          // 王族・支配家系
high_noble     // 大貴族・旧家
minor_noble    // 地方小貴族・騎士級
gentry         // 郷士・都市名望家・官人層
commoner       // 平民（職人・農民・兵士家庭など）
merchant_born  // 商人家系（commoner の下位区分でも可）
clergy_orphan  // 寺社・修道院育ち（血縁より施設）
freedman       // 解放奴隷・その子孫
slave_born     // 奴隷身分で出生（稀・特定文化のみ）
foreigner      // 他国・他文化から来た寄寓者（階層は別途 estateStatus）
unknown        // 出自不明・落胤・拾い子
```

#### EstateStatus（現在）

生まれと現在が一致しないケース（成り上がり・没落・叙爵）を表す。

```
reigning_dynasty | court_noble | landed_noble | officer | official |
cleric | freeman | burgher | serf | slave | outlaw | exile
```

#### RaisedIn（成育環境）

```
capital_court   // 王都・宮廷
capital_city    // 王都だが宮廷外
provincial_seat // 地方領主の居城・州都
frontier_burg   // 辺境都市
rural_manor     // 農村・荘園
monastery       // 修道院・神殿
military_camp   // 軍営・従軍
merchant_quarter// 商館・港町
foreign_court   // 人質・人質外交・亡命先
street          // 路上・孤児
```

### 3.2 地理の三層

| 概念 | フィールド | 意味 |
| :--- | :--- | :--- |
| 生まれ | `birthBurgId` / `birthStateId` | アイデンティティ・方言・幼少期の記憶 |
| 本拠 | `homeBurgId` | 家門・領地・実家の所在 |
| 現在地 | 既存 `location` | 任地・旅先・駐留 |

**同一人物で三者が食い違う** のが普通である（例: 辺境生まれ → 家は州都 → 現在は王都の Marshal）。

### 3.3 役職・属性ごとの Origin 偏り

生成時は一様乱数ではなく、**ロール／称号から事前分布** を引く。

| ロール | socialStratum の主分布 | birth / home / location の典型 |
| :--- | :--- | :--- |
| **Ruler（君主）** | royal 70%, high_noble 25%, unknown 5% | birth=home=capital（王朝定着）。征服王朝なら birth は旧都・異国も可 |
| **中央官職**（Chancellor 等） | high_noble 40%, minor_noble 30%, gentry 20%, commoner 10% | location=capital 固定。home は自領 or 首都。birth は国内都市を重み付き |
| **Marshal / 軍務** | minor_noble 45%, high_noble 25%, gentry 15%, commoner 15% | location=capital。frontier 育ち（raisedIn: frontier/military）をやや増やす |
| **Spymaster** | minor_noble 30%, gentry 30%, commoner 25%, foreigner 10%, unknown 5% | 出自をぼかす（unknown/foreigner）確率を他職より高く |
| **宗教官**（Dean, Chaplain 等） | clergy_orphan 25%, minor_noble 30%, gentry 25%, commoner 20% | raisedIn: monastery を厚く。piety/zeal と整合 |
| **Province Lord（地方領主）** | high_noble 30%, minor_noble 55%, gentry 15% | home=州の中心 burg、location=home。birth も同州寄り |
| **Commander / Admiral** | minor_noble 35%, gentry 25%, commoner 30%, freedman 5%, foreigner 5% | location=駐屯/艦隊母港。raisedIn: military_camp / frontier を厚く |
| **Market Merchant** | merchant_born 50%, commoner 30%, freedman 10%, minor_noble 5%, foreigner 5% | birth/home=市場都市。複数都市に商圏があっても home は本店 |
| **Market Rival** | merchant_born 55%, commoner 25%, foreigner 15%, minor_noble 5% | 同上。foreigner と rival 親和性を少し上げる |
| **後継者・王族傍流**（将来） | royal / high_noble | capital_court 育ちを強制寄り |

#### 君主・中央貴族の「首都固定」ルール

1. `titles` に state 君主 or 中央 landed=false 官職がある → `location = state.capital`（現状どおり）  
2. `homeBurgId`  
   - royal / high_noble かつ中央官職: 60% capital、40% 国内大都市（将来の本領）  
   - 地方領主: 州都 or 最大 burg  
3. `birthBurgId`  
   - royal: 80% capital（王朝の連続性）、20% 他領（母方・戦時疎開・征服前）  
   - 中央貴族: 首都 40%、国内他都市 50%、国外 10%  
   - 商人: 市場都市 70%、同国内他港 20%、国外 10%

### 3.4 Prestige との関係

| socialStratum | prestige の生成バイアス（目安） |
| :--- | :--- |
| royal | 70–100 |
| high_noble | 55–95 |
| minor_noble | 35–80 |
| gentry | 25–65 |
| merchant_born | 15–70（成功商人は上振れ） |
| commoner | 5–45 |
| freedman / slave_born | 1–30 |
| unknown | 1–50（謎めいた高名声も可） |

`prestige` は「家柄そのもの」ではなく **現在の社会的ブランド** とする。成り上がりは `socialStratum=commoner` かつ `estateStatus=landed_noble` かつ prestige 高、で表現する。

---

## 4. Commitment — 何を一番大事にしているか

「Zeal の本当の向き先」。強度は既存スカラー、**対象** は本ブロックが持つ。

### 4.1 概念モデル

```
Commitment = {
  primary: CommitmentFocus,     // 第一の忠誠・献身の対象（必須・1つ）
  secondary?: CommitmentFocus,  // 第二（任意）
  intensity: 1..100,            // 献身の熱量（未設定時は zeal を流用可）
  conflictPolicy: enum          // 第一と第二が衝突したときの傾向
}
```

`conflictPolicy`:

| 値 | 意味 | 例 |
| :--- | :--- | :--- |
| `primary_wins` | 常に第一優先 | 家門 > 国家 |
| `negotiate` | 状況で秤にかける | 合理性の高い人物 |
| `whichever_hurts_less` | 損失回避 | 臆病・低 boldness |
| `burn_both` | 両義的に破綻しやすい | 低 rationality × 高 zeal |

### 4.2 CommitmentKind（対象の種類）

| Kind | 説明 | 解決に必要な参照 |
| :--- | :--- | :--- |
| `self` | 自己の生存・野心・名誉 | — |
| `family` | 配偶者・子女・近親 | family ids |
| `house` | 家門・家系の存続と威信 | lineageId / lineageName |
| `liege` | 特定の主君・個人への臣従 | characterId |
| `patron` | 恩人・後援者 | characterId |
| `office` | 官職・省庁・軍という組織自体 | title / department tag |
| `domain` | 自領・州・都市という土地 | provinceId / burgId |
| `state` | 国家・王国という抽象体 | stateId |
| `nation_culture` | 民族・文化共同体 | cultureId |
| `faith` | 宗教・教団・神 | religionId |
| `ideology` | 共和・自由・征服・改革など世俗イデオロギー | tag string |
| `craft` | 技芸・学問・商売そのもの | skill / role domain |
| `wealth` | 富の蓄積そのもの | — |
| `comrades` | 戦友・ギルド仲間・船団 | organizationId / tag |
| `people` | 領民・庶民一般（牧民思想） | — |
| `rivalry` | 仇敵を打ち倒すこと自体が生きがい | target ref |
| `hedonism` | 快楽・享楽の継続 | — |

> **注意**: `faith` は「何を信じるか」ではなく「何のために熱狂するか」。`piety` が高くても primary が `house` なら、信仰は家門繁栄の道具になり得る。

### 4.3 CommitmentFocus の形

```ts
interface CommitmentFocus {
  kind: CommitmentKind;
  /** kind に応じた対象 id。self/wealth/hedonism/people 等は不要 */
  targetId?: number;
  /** 人間可読ラベル（生成時キャッシュ）。"House Bracqualenza", "God of Storms" 等 */
  label?: string;
  /** 0..100 任意。primary は通常 intensity に近い */
  weight?: number;
}
```

### 4.4 既存 Personality との役割分担

| 既存 | 役割 | Commitment との関係 |
| :--- | :--- | :--- |
| `zeal` | 熱狂の**強度** | `intensity` の初期値候補。向き先は Commitment |
| `piety` | 宗教規範への傾倒 | primary=`faith` の事前確率を上げる |
| `greed` | 領土・富への執着の強さ | primary が `wealth` / `domain` / `house` になりやすい |
| `honor` | 誓約遵守 | `liege` / `state` / `house` のどれを守るかは Commitment が決める |
| `patriotism`（計画） | 共同体への愛着の強さ | 向き先が `state` か `nation_culture` か `domain` かは Commitment |
| `Loyalty Target`（計画） | 忠誠の対象 | **本 Commitment.primary に吸収**（重複定義しない） |

### 4.5 役職・階層ごとの primary 偏り

重みは相対確率（正規化して抽選）。文化・国家 form で上書きする（§7）。

| ロール / 階層 | 主に出やすい primary（相対重み例） |
| :--- | :--- |
| **Ruler（君主）** | state 30, house 25, domain 15, faith 10, self 10, ideology 5, people 5 |
| **中央貴族** | house 35, liege 20, office 15, state 10, wealth 10, self 10 |
| **地方領主** | domain 30, house 30, family 15, state 10, liege 10, wealth 5 |
| **Marshal** | state 25, office 20, liege 15, comrades 15, domain 10, house 10, self 5 |
| **Commander** | comrades 25, liege 20, craft(martial) 15, state 15, self 10, house 10, wealth 5 |
| **Spymaster** | liege 25, office 20, self 20, state 15, wealth 10, house 10 |
| **宗教官** | faith 45, office 15, state 10, people 10, house 10, craft(learning) 10 |
| **商人** | wealth 30, craft 20, family 15, house 10, self 10, domain(都市) 10, state 5 |
| **成り上がり**（commoner→官職） | self 25, wealth 20, office 15, family 15, liege 15, state 10 |
| **奴隷出身・解放民** | family 25, self 25, patron 20, wealth 15, comrades 10, state 5 |
| **神権国家の君主** | faith 40, state 25, office 15, house 10, people 10 |
| **共和制エリート** | state 25, domain(都市) 25, craft 15, wealth 15, office 10, house 10 |
| **遊牧・血族国家** | house 35, family 25, comrades 15, domain 10, self 10, faith 5 |

### 4.6 Personality からの補正（生成後調整）

抽選後、次で `primary` を再抽選 or スワップする（確率的）。

| 条件 | 補正 |
| :--- | :--- |
| `piety ≥ 80` かつ `zeal ≥ 70` | `faith` を primary 候補に +40 |
| `greed ≥ 80` かつ `honor ≤ 40` | `wealth` / `self` を +30 |
| `compassion ≥ 80` かつ `greed ≤ 40` | `people` / `family` を +25 |
| `vengefulness ≥ 85` | `rivalry` を secondary に強制候補 |
| `sociability ≤ 20` | `comrades` / `people` を減らし `craft` / `self` を増やす |
| `honor ≥ 85` かつ socialStratum が noble 系 | `house` / `liege` を +20 |
| `rationality ≥ 80` | `conflictPolicy = negotiate` 寄り |
| `rationality ≤ 25` かつ `zeal ≥ 70` | `conflictPolicy = burn_both` 寄り |

### 4.7 シミュレーションへの効き方（将来）

| 状況 | Commitment の使い方 |
| :--- | :--- |
| 宣戦布告 | primary=`domain`/`wealth`/`house` かつ高 greed → 領土要求戦争 |
| 聖戦 | primary=`faith` かつ高 zeal/piety |
| 裏切り | primary が `self`/`wealth`/`house` で、state への weight が低い + 低 honor |
| 政略結婚拒否 | primary=`faith` で異教相手、または primary=`house` で格下婚 |
| 汚職 | primary=`wealth`/`office` + 高 greed + 低 honor |
| 自己犠牲 | primary=`state`/`liege`/`people` + 高 honor + 低 greed |
| 商人の rival 殺し | primary=`wealth`/`rivalry` + 高 vengefulness + 低 compassion（`characters.md` 末尾と接続） |

---

## 5. Tastes — 好き・嫌い

生活の味と、カテゴリへの態度。バックストーリーの「人間味」と、イベント分岐（酒宴・贈収賄・社交・軍事パレード）の両方に使う。

### 5.1 モデル

嗜好は **タグ + 強度** のリスト。固定の巨大 enum を全部埋めるのではなく、**カタログから 2〜6 個を抽選** して持つ（スパース）。

```ts
interface TasteTag {
  id: TasteId;       // カタログ id
  polarity: "like" | "dislike";
  intensity: 1..100; // 好き/嫌いの強さ
  /** 任意: 物語用の一言 "cannot refuse a red wine" */
  note?: string;
}
```

1人あたりの目安:

- likes: 2〜4
- dislikes: 1〜3
- 同じ id を like と dislike の両方に持たない
- `intensity ≥ 80` を「特徴的嗜好」としてフレーバー文の主役にする

### 5.2 嗜好カタログ（v1）

カテゴリは UI グループ用。id は安定キー。

#### A. 快楽・身体

| id | 表示例 | 関連 Personality / Skill |
| :--- | :--- | :--- |
| `wine` | 酒 | energy, sociability |
| `feast` | 美食・饗宴 | greed, artistry |
| `lust` | 好色 | sociability, low piety |
| `luxury` | 贅沢・装身 | greed, artistry, appearance |
| `hunting` | 狩猟 | prowess, martial |
| `sport` | 武芸試合・競い | prowess, boldness |
| `opium_or_drug` | 麻酔・幻覚（文化依存） | low rationality リスク |

#### B. 知・技・美

| id | 表示例 | 関連 |
| :--- | :--- | :--- |
| `books` | 書物・学問 | learning |
| `music` | 音楽 | artistry |
| `art` | 美術・建築美 | artistry, engineering |
| `maps` | 地図・旅行談 | geography |
| `machinery` | 機械・工芸 | engineering |
| `theology` | 神学問答 | learning, piety |
| `law` | 法と前例 | stewardship, learning |

#### C. 社会関係

| id | 表示例 | 関連 |
| :--- | :--- | :--- |
| `company` | 人付き合い・宴席 | sociability |
| `solitude` | 孤独・静謐 | low sociability |
| `flattery` | 追従されること | confidence, greed |
| `debate` | 議論 | diplomacy, learning |
| `gossip` | 噂話 | intrigue, sociability |
| `ceremony` | 儀式・儀礼 | piety, prestige |

#### D. 職業・階層への態度（カテゴリ好悪）

| id | 表示例 | 用途 |
| :--- | :--- | :--- |
| `soldiers` | 軍人 | 軍人と懇意 / 軍人嫌い |
| `courtiers` | 廷臣 | 宮廷政治への態度 |
| `merchants` | 商人 | 軍人と悪徳商人の癒着（`characters.md`）と接続 |
| `clergy` | 聖職者 | |
| `peasants` | 農民・庶民 | compassion と連動しうる |
| `foreigners` | 外国人 | culture 差別・排外 |
| `nobles` | 貴族 | 成り上がりのルサンチマン等 |
| `own_state` | 自国 | patriotism の「好き/嫌い」面 |
| `rival_state` | 宿敵国 | affinities と二重化しないよう、タグは「類型」に留め具体国は affinities |
| `war` | 戦争そのもの | martial + boldness vs compassion |
| `peace` | 平和・現状維持 | |
| `corruption` | 贈収賄・裏金 | guile, greed, honor |

#### E. 抽象価値（Commitment と近いが「好み」として軽い）

| id | 表示例 |
| :--- | :--- |
| `gold` | 金銭そのもの |
| `land` | 土地所有 |
| `titles_glory` | 称号・栄光 |
| `piety_practice` | 信心深い生活習慣 |
| `cruelty` | 残虐・恐怖支配（暗い嗜好） |
| `mercy` | 慈悲深い裁定 |

### 5.3 抽選バイアス

| 条件 | 出やすい like | 出やすい dislike |
| :--- | :--- | :--- |
| `sociability ≥ 75` | company, feast, wine, gossip | solitude |
| `sociability ≤ 25` | solitude, books, maps | company, feast, ceremony |
| `greed ≥ 75` | gold, luxury, land | mercy（低確率） |
| `piety ≥ 75` | theology, ceremony, piety_practice | lust, luxury, corruption |
| `piety ≤ 25` | wine, lust, gold | ceremony, clergy |
| `martial ≥ 75` or Commander | hunting, sport, soldiers, war | （peace は低） |
| `martial` 低 かつ中央文官 | books, law, ceremony | war, soldiers（低〜中確率） |
| `artistry ≥ 75` | art, music, feast, luxury | cruelty |
| `intrigue ≥ 75` | gossip, flattery, corruption(like は闇) | — |
| `compassion ≥ 75` | mercy, peasants, peace | cruelty, war |
| `compassion ≤ 25` | cruelty（低確率）, war | peasants, mercy |
| Merchant role | gold, merchants, feast, luxury | soldiers（時々）, nobles（成り上がり） |
| Spymaster | gossip, solitude, corruption | ceremony（表の儀式嫌い） |
| Religious office | theology, ceremony | lust, war（例外: 聖戦型は war like） |
| `zeal` 高 + primary faith | war(like) if 好戦宗, foreigners(dislike) | — |
| Frontier raisedIn | hunting, soldiers, maps | courtiers, luxury |
| Capital court raisedIn | ceremony, flattery, luxury, art | peasants, solitude |

### 5.4 Personality との二重定義を避けるルール

- **スカラーで既に表せる一般傾向**（社交的か、強欲か）は Taste に重複定義しない。  
- Taste は **具体物・具体カテゴリ** に限定する。  
  - NG: `likes: sociability`  
  - OK: `likes: wine, feast` / `dislikes: soldiers`
- 国家単位の好悪は **`affinities` が正本**。Taste の `own_state` は「愛国/厭国の気質タグ」に留め、特定 stateId は affinities に書く。

### 5.5 フレーバー文への落とし方（例）

入力:

- primary: `house`
- likes: wine 90, hunting 70
- dislikes: merchants 80, company 60
- socialStratum: minor_noble

出力例:

> 酒と狩猟を愛し、商いの匂いを嫌う地方小貴族。宴の席は好まず、家名を守る話になると突然饒舌になる。

---

## 6. 対人関係 — Solidarity（連帯感）と Favor（恋愛好感度）

人物間感情は **2軸** に分ける（実装: `character.solidarity` / `character.favor`）。

| 軸 | フィールド | 意味 | 典型用途 |
| :--- | :--- | :--- | :--- |
| **連帯感** | `solidarity` | 同僚・主従・ライバルとしての政治的立場 | 宮廷の権力争い、援軍要請、贈収賄 |
| **恋愛好感度** | `favor` | 恋愛・性的関心のみ | 求婚・寵愛・ギャルゲー的ルート |

### 6.0 設計方針（改訂）

1. **基本の関係性は連帯感**。同郷・同軍・同政権は薄い制度的連帯に留まり、友情の自動付与ではない。  
2. **国家中枢は「同じ国家を支える仲間でありながら、権力を競うライバル」**。中央官職同士は同僚ボーナスより **権限争いペナルティ** が勝りやすい。  
3. **Personality で複雑な好悪を出す**  
   - 高 Guile × 高 Guile: 理性が高ければ **冷たい相互尊重**、低ければ **暗闘ライバル**  
   - 高 Guile × 低 Guile/低 Rationality: 策士が浅慮な相手を **軽蔑**  
   - 低 Guile × 高 Guile: 素朴な側が策士を **警戒・不信**  
   - 高 Honor × 低 Honor、高 Greed 同士、信仰差、Commitment 衝突なども摩擦  
4. **Favor は恋愛専用**。外見・好色 Taste・社交性で疎にシード。一般的な「Friendly だらけ」を Favor に載せない。  
5. 贈り物・賄賂は原則 **連帯感** を動かす（`intent: romance` のときのみ Favor も動く）。

### 6.0.1 Solidarity バンド

- bonded / solid / collegial / neutral / **strained** / **rivalrous** / hostile  

宮廷では collegial〜rivalrous が普通で、friendly 一色にならない。

### 6.1 現状で表現できないこと

| 欲しい関係 | 現状 | 備考 |
| :--- | :--- | :--- |
| 人物 A→人物 B の好き嫌い | **不可** | `affinities` は **stateId** キーのみ（主に君主の対国家感情） |
| 同じ軍属・同じ連隊への連帯 | **不可** | `commanderId` 等の所属事実はあるが感情値なし |
| 同じ故郷 | **不可** | `birthBurgId` 未実装。`location` は現在地のみ |
| 同じ文化での親近 | 部分的 | `culture` id はあるが、人物間スコアに未使用（国家同士の +10/-10 のみ） |
| 贈り物で好感を上げる／下げる | **不可** | 個人 Good 在庫も贈与 API もなし |

既存 `affinities` は **対国家** のまま残し、**対人物** は本節の `favor` に分離する（二重定義しない）。

### 6.2 データモデル

```ts
/** A が B に対して抱く好感。キーは相手 character.i。値は -100..100 */
// character.favor?: Record<number, number>

/** 表示・フレーバー用の区間ラベル（保存は数値のみでよい） */
type FavorBand =
  | "devoted"      // +80..+100  心酔・絶対の信頼
  | "fond"         // +50..+79   好意・盟友寄り
  | "friendly"     // +20..+49   友好
  | "neutral"      // -19..+19   無関心
  | "wary"         // -49..-20   警戒・冷淡
  | "hostile"      // -79..-50   敵意
  | "hatred";      // -100..-80  憎悪
```

| 性質 | 方針 |
| :--- | :--- |
| 非対称 | A→B と B→A は独立（片思い・一方的な嫌悪を許す） |
| スパース | 全キャラ全組合せは持たない。接触・共有属性・イベントがあった相手だけ記録 |
| 既定値 | キーが無い = 未接触または実質 0（無関心）として扱う |
| クランプ | 常に [-100, 100] |
| 減衰（任意） | 長期無接触で 0 へ緩やかに戻す。血仇・婚姻は減衰を遅くする |

### 6.3 初期値の組み立て（共有属性は「連帯」ではなくボーナス）

初対面または初回接触時:

```
favor[A→B] = clamp(
  base
  + sharedContextBonus(A, B)   // 同郷・同軍・同文化など
  + appearanceFirstImpression  // B.appearance × A の傾向
  + randomNoise
)
```

| 共有コンテキスト | 目安ボーナス | 必要なデータ |
| :--- | :--- | :--- |
| 同じ `birthBurgId`（同郷） | +8〜+20 | Origin.birthBurgId |
| 同じ `homeBurgId` かつ地方領主同士 | +5〜+12 | Origin.homeBurgId |
| 同じ `culture` | +5〜+12 | 既存 culture |
| 同じ `religionId` | +5〜+15 | Origin.religionId |
| 同じ state の軍職同士（Marshal/Commander 等） | +8〜+18 | titles / regiment 所属 |
| 同じ regiment の上下関係・戦友 | +10〜+25 | regiment id（将来） |
| 同じ宮廷（capital 勤務の中央官職同士） | +3〜+10 | location + titles |
| 主君→家臣 / 家臣→主君 | +5〜+15（忠誠・恐怖で符号が変わりうる） | titles |
| 商人同士で同じ市場の rival | -15〜-40 | roles |
| 異文化 + Taste `foreigners` dislike | -10〜-25 | tastes |
| 片方が Taste `soldiers` dislike かつ相手が軍人 | -10〜-30 | tastes + titles |

**重要**: 同郷でも、後から裏切り・略奪・賄賂失敗で大きくマイナスになり得る。共有属性は「運命共同体フラグ」ではない。

### 6.4 イベントによる変動（ギャルゲーの「好感度イベント」）

| イベント | 典型 Δfavor | 修飾 |
| :--- | :--- | :--- |
| 丁寧な挨拶・贈答以外の礼儀 | +1〜+5 | sociability |
| 共闘・戦場で助命 | +10〜+30 | 軍職・高 martial |
| 侮辱・公開羞辱 | -15〜-40 | 低 rationality 側はさらに悪化しやすい |
| 同盟遵守・約束履行 | +5〜+15 | 高 honor が相手だと効果大 |
| 裏切り・騙し討ち | -30〜-80 | 相手の vengefulness で固定化しやすい |
| **嗜好に合う贈り物** | +5〜+25 | §6.5 |
| **賄賂と見なされる贈り物** | **符号が人格次第** | §6.5.3 |
| 政略結婚の成立 | +20〜+40（当事者） | 強制婚だと片方だけマイナスもありうる |

UI では数値そのものより `FavorBand` ラベルと「最近の出来事」一言を出すと、ギャルゲー的に読みやすい。

### 6.5 贈り物・賄賂と Goods

#### 6.5.1 キャラクター側の前提（現状不足）

| 項目 | 現状 | 必要 |
| :--- | :--- | :--- |
| 個人資産 | `wealth`（金額）のみ | 贈答には金額でも可だが味気ない |
| 個人 Good 在庫 | **なし** | `inventory?: Record<goodId, amount>` または贈答セッション専用の一時保持 |
| 贈与トランザクション | **なし** | `offerGift(fromId, toId, goodId, amount, intent)` |
| 市場からの調達 | 市場在庫はある | 誰が買い、誰の inventory に入るかが未定義 |

`characterTypes.ts` の wealth コメントにある *future … gifting* は、本節で具体化する。

#### 6.5.2 贈り物の評価パイプライン

```
1. intent: "courtesy" | "bribe" | "tribute" | "romance" | "piety_offering"
2. matchScore = how well good fits recipient tastes / skills / commitment
3. integrityReaction = how recipient's honor/piety/greed reads the intent
4. Δfavor = f(matchScore, integrityReaction, value, amount, currentFavor)
5. side effects: wealth/inventory 移動、発覚時の第三者 favor、汚職フラグ
```

| matchScore の材料 | 例 |
| :--- | :--- |
| Taste like `art` / `wine` / `gold` | 対応 Good で上昇 |
| `skills.artistry` が高い | 芸術系 Good の match 上昇 |
| `skills.learning` が高い | Books 等 |
| primary commitment `faith` | Incense, 将来の聖遺物 |
| primary `wealth` / 高 greed | Jewelry, Coins, Silk が効きやすい |
| dislike タグと衝突 | 軍人嫌いへ Arms を贈る → match 負 |

#### 6.5.3 清廉な相手には賄賂が逆効果

「贈り物 = 常にプラス」にしない。**受け手の人格で符号が反転する** のが本システムの中核の一つ。

清廉・清貧寄りとみなす例（閾値は実装時に調整）:

- `honor ≥ 70` かつ `greed ≤ 40`
- `piety ≥ 75` かつ Taste dislike `corruption` / like `piety_practice`
- primary commitment が `faith` / `people` / `state` で `wealth` ではない
- Taste dislike `corruption` が強い

| intent / 見え方 | 清廉な受け手 | 強欲・腐敗許容の受け手 |
| :--- | :--- | :--- |
| 露骨な `bribe`（見返り要求付き） | **Δfavor −15〜−50**（軽蔑・警戒） | +10〜+40 |
| 高額の金品のみ（Coins, 地金） | 負または微増（侮辱的） | 大きく正 |
| 嗜好に合うが文脈が贈収賄 | 負寄り（「買おうとした」） | 正 |
| `courtesy` の廉価な手土産（酒一杯、地元の名産） | 小さな正 | 小さな正〜無反応 |
| 公の寄進・神殿への献納（受け手が聖職） | 正（bribe 扱いしない） | 場合による |
| 芸術品を「収集家への敬意」として渡す | artistry 高なら正（intent が courtesy） | 正 |

判定の疑似コード:

```
if (looksLikeBribe(intent, value, context) && recipientIntegrityHigh) {
  Δfavor = -basePenalty * (1 + matchIrony); // 高くて露骨なほど悪化
} else if (matchScore > 0) {
  Δfavor = +baseReward * matchScore * recipientGreedFactor;
} else {
  Δfavor = -slightMismatch; // 的外れな贈り物
}
```

「清廉だが芸術は愛する」人物には、**賄賂の袋** は嫌われるが、**公開の美術寄贈や作法の正しい献上品** は上がりうる、という二段構えを intent と公開性で表現する。

#### 6.5.4 既存 Goods で賄える贈答

| 系統 | 既存 Good | 向く受け手 |
| :--- | :--- | :--- |
| 酒・饗宴 | Wine, Liquor, Beer, Spices, Tea | Taste `wine`/`feast` |
| 装身・財 | Jewelry, Pearls, Gemstones, Amber, Silk, Furs, Garments, Perfume, Gold/Silver Ingot | greed, luxury, appearance |
| 知・儀礼 | Books, Incense, Candles | learning, piety |
| 素材・工芸寄り | Marble, Glass, Ceramics, Mahogany, Ivory, Coral | 建築・審美の **素材** まで |
| 現金 | Coins / wealth 送金 | 万能だが清廉キャラには危険 |

汎用の贅沢な贈答は **部分的に足りる**。

#### 6.5.5 カタログ不足 — 芸術好き為政者への「芸術品」

`skills.artistry` や Taste `art` / `music` はあるが、Economy の default goods（`goods-generator.ts`）に **芸術完成品が無い**。

| 欲しい贈り物 | いちばん近い既存 | 問題 |
| :--- | :--- | :--- |
| 絵画・作品 | （なし） / Dyes, Paper, Ink | 素材・道具止まり |
| 彫刻 | Marble, Ivory, Bronze | 素材であり Sculpture ではない |
| タペストリー | Cloth, Dyes, Silk | 織物素材であり宮廷芸術品ではない |
| 楽器 | （なし） | 完全欠落 |
| 装飾写本・聖像 | Books, Incense | Books は educational/ritual で美術品ではない |

**追加候補 Good（贈答・luxury 向け v1）**:

| name | 役割 | レシピ案（概念） | 主な match |
| :--- | :--- | :--- | :--- |
| Artworks | 絵画・細密画など | Dyes + Paper/Ink +（高 artistry 都市補正） | art, artistry |
| Sculptures | 彫刻 | Marble/Ivory/Bronze + Tools | art, prestige |
| Tapestries | 壁掛・物語織物 | Cloth/Silk + Dyes | art, court luxury |
| Instruments | 楽器 | Wood/Mahogany + Metal 少量 | music, artistry |
| Relics | 聖遺物・聖像（希少） | 特殊生成・略奪・寄進のみでも可 | faith, piety |

タグ例: `luxury`, `gift`, `art`（需要カテゴリは `luxury`）。  
`warEconomyType: "luxury"`。価値は Jewelry 前後〜Books 上の帯を目安にする。

#### 6.5.6 Taste ↔ Good 対応表（贈答マッチング用）

| Taste id | 優先 Good（既存＋追加案） |
| :--- | :--- |
| `wine` | Wine, Liquor |
| `feast` | Spices, Wine, Cheese, Honey |
| `luxury` | Silk, Jewelry, Perfume, Garments |
| `art` | **Artworks, Sculptures, Tapestries**, Marble, Ivory |
| `music` | **Instruments** |
| `books` | Books, Paper, Ink |
| `gold` | Coins, Gold Ingot, Jewelry |
| `theology` / `piety_practice` | Incense, Candles, Relics |
| `hunting` | Horses, Furs, Arms（文脈次第） |
| dislike `corruption` | 高額 Coins / 露骨 bribe を減点 |
| dislike `soldiers` | Arms, 軍事パレード的贈答を減点 |

### 6.6 Bonds — 関係ラベル（好感度の注釈）

好感度数値とは別に、**物語上の関係名** を少数持てるとフレーバーが安定する。  
Bond は「連帯の実体」ではなく、**favor の解釈ラベル**（この人は mentor、この人は rival）とみなす。

```ts
interface CharacterBond {
  kind: "mentor" | "benefactor" | "rival" | "nemesis" | "lover" | "friend"
      | "ward" | "patron" | "client" | "blood_feud" | "comrade" | "hometown_kin";
  targetType: "character" | "house" | "state" | "religion" | "organization";
  targetId: number;
  /** 関係の深さ 1..100。favor とは別（rival でも favor が上がる「好敵手」がありうる） */
  strength: number;
  sinceYear?: number;
  note?: string;
}
```

| 既存との関係 | |
| :--- | :--- |
| `favor` | 対人物感情の **数値の正本** |
| `affinities` | 対 **国家** 感情の正本 |
| `family.*Ids` | 血縁の正本。Bond は感情の質 |
| `marriages[]` | 国家間婚姻。個人の恋人は Bond `lover` |
| Commitment `rivalry` | Bond `nemesis` と接続しやすい |

生成 v1:

- 接触のあった相手に favor 初期値だけでもよい（Bond は任意）
- 商人 market rival → Bond `rival` + favor 低め
- 高 vengefulness → `nemesis` 1 件
- 同郷で favor が高い組 → 表示用に `hometown_kin` を後付け可

### 6.7 シミュレーションへの効き方（将来）

| 状況 | favor の使い方 |
| :--- | :--- |
| 協力・援軍要請 | 対象人物への favor が高いと応諾しやすい |
| 暗殺・謀略の協力者選び | 低 favor / 高 guile を優先 |
| 政略結婚の当事者感情 | favor が低いと破談・内縁不和 |
| 贈収賄 | §6.5。成功時は favor 増、清廉失敗時は減＋発覚リスク |
| 外交 | 君主同士の favor が state affinities をゆっくり引っ張る（任意） |
| 席替え・抜擢 | 主君から見て favor が高い家臣が残りやすい |

### 6.8 非目標（Favor まわり）

- 全キャラ全対全の密行列を毎ティック再計算すること  
- 「同郷なら必ず味方」の硬直ルール  
- 恋愛ルート専用の完全なギャルゲー UI（数値とイベント効果があれば足りる）  
- 既存 state `affinities` の廃止  

---

## 7. 文化・国家形態・時代による語彙と偏り

CommitmentKind 自体は時代不変。**重み表とラベル** が時代・文化で変わる。

### 7.1 中世ヨーロッパ風（デフォルト想定）

- 庶民: `faith` + `family` 厚め、`state` は薄い（王は遠い）
- 貴族: `house` > `liege` > `state`（「王を尊崇しつつ家が第一」をデフォルト物語に）
- 聖職: `faith` 第一
- 王: `house` と `state` が同一視されやすい（dynastic state）

### 7.2 神権・聖地国家

- 全ロールで `faith` の重み +20〜40
- Ruler の primary が `faith` でも違和感がない
- Taste: ceremony, theology を厚く、lust/luxury を dislike 側へ

### 7.3 遊牧・血族

- `house` / `family` / `comrades` を厚く
- `domain` は「土地」より「放牧権・移動路」ラベルへ
- raisedIn: military_camp / rural_manor 寄り

### 7.4 商業共和国・都市国家

- `domain`（都市）と `wealth` / `craft` を厚く
- socialStratum: merchant_born / gentry が増える
- Ruler でも royal 比率を下げる

### 7.5 奴隷制が強い文化

- `slave_born` / `freedman` の出現率を上げる
- 解放後の primary に `patron` / `self` を厚く
- 貴族の Taste に `slaves`（所有・嫌悪）をカタログ追加する余地

### 7.6 「古代〜現代」の段階的差し替え

時代スライダーや tech レベルがある場合の **ラベル置換表**（データ側）:

| Kind | 古代寄りラベル | 中世寄り | 近世寄り | 近代寄り |
| :--- | :--- | :--- | :--- | :--- |
| state | ポリス / 帝国 | 王国 | 国家 | 国民国家 |
| house | 氏族 | 家門 | 家系 | 一族・財閥 |
| faith | 神々・祭祀 | 教会・宗派 | 宗派 | イデオロギー化しうる |
| office | 政務官 | 官職 | 省庁 | 官僚機構 |
| craft | 職能・流派 | ギルド | 専門職 | キャリア |

数値スキーマは変えず、**表示と生成重みだけ** 時代パックで切り替える。

---

## 8. 生成パイプライン

`createPerson()` の後段、またはロール付与直後に `buildBackstoryProfile(character, context)` を呼ぶ。

```
1. createPerson()           // 既存: skills, personality, family, ...
2. assign titles / roles / location
3. buildOrigin(character, context)
   - socialStratum / estateStatus をロール表から抽選
   - birth/home を地理ルールで決定
   - prestige を stratum で再ロール or 補正（オプション）
4. buildCommitment(character, context)
   - ロール×階層の重み表
   - personality 補正
   - primary / secondary / conflictPolicy
5. buildTastes(character, context)
   - カタログから like/dislike をスパース抽選
6. seedFavor(characters)    // 共有コンテキストからスパースに初期 favor
7. buildBonds()             // 任意の関係ラベル
8. (optional) generateHooks // 短文 1〜3 本をキャッシュ
// 贈答は生成時ではなくライブイベント:
// offerGift(from, to, goodId, amount, intent) → Δfavor
```

### 8.1 決定論

世界 seed / キャラ id から派生した RNG ストリームを使い、再生成でバックストーリーだけが暴れないようにする。favor の初期ノイズも seed 由来にする。

### 8.2 整合性ガード

| ルール | 内容 |
| :--- | :--- |
| G1 | primary=`faith` なのに piety < 20 → piety を底上げ or primary 再抽選 |
| G2 | socialStratum=`royal` なのに Ruler 以外かつ prestige < 40 → prestige 補正 |
| G3 | Merchant なのに like に `gold` も `craft` も無い → どちらかを強制追加 |
| G4 | dislike `company` と sociability ≥ 90 が同居 → どちらかを弱める（偽善キャラとして残すなら note で説明） |
| G5 | location が capital 固定の中央官職で birth が国外ばかりにならないよう、国外率に上限 |
| G6 | female で多配偶者文化以外、family.spouses ≤ 1（既存）を Origin でも壊さない |
| G7 | favor は常に [-100, 100]。自己参照 favor[i][i] は作らない |
| G8 | intent=`bribe` かつ受け手 honor 高・greed 低なのに Δfavor が常に正、はテストで禁止 |
| G9 | 芸術 Taste / 高 artistry への match に、完成品 Good がカタログに無い場合は設計上の既知ギャップ（§6.5.5）として追跡する |

---

## 9. 型スケッチ（実装時の目安）

```ts
// src/extensions/characters/characterTypes.ts への追加案

export type SocialStratum =
  | "royal"
  | "high_noble"
  | "minor_noble"
  | "gentry"
  | "commoner"
  | "merchant_born"
  | "clergy_orphan"
  | "freedman"
  | "slave_born"
  | "foreigner"
  | "unknown";

export type EstateStatus =
  | "reigning_dynasty"
  | "court_noble"
  | "landed_noble"
  | "officer"
  | "official"
  | "cleric"
  | "freeman"
  | "burgher"
  | "serf"
  | "slave"
  | "outlaw"
  | "exile";

export type RaisedIn =
  | "capital_court"
  | "capital_city"
  | "provincial_seat"
  | "frontier_burg"
  | "rural_manor"
  | "monastery"
  | "military_camp"
  | "merchant_quarter"
  | "foreign_court"
  | "street";

export type CommitmentKind =
  | "self"
  | "family"
  | "house"
  | "liege"
  | "patron"
  | "office"
  | "domain"
  | "state"
  | "nation_culture"
  | "faith"
  | "ideology"
  | "craft"
  | "wealth"
  | "comrades"
  | "people"
  | "rivalry"
  | "hedonism";

export interface CommitmentFocus {
  kind: CommitmentKind;
  targetId?: number;
  label?: string;
  weight?: number;
}

export interface CharacterCommitment {
  primary: CommitmentFocus;
  secondary?: CommitmentFocus;
  /** 省略時は personality.zeal を参照してよい */
  intensity?: number;
  conflictPolicy: "primary_wins" | "negotiate" | "whichever_hurts_less" | "burn_both";
}

export type TastePolarity = "like" | "dislike";

export interface CharacterTaste {
  id: string;
  polarity: TastePolarity;
  intensity: number;
  note?: string;
}

export interface CharacterOrigin {
  socialStratum: SocialStratum;
  estateStatus: EstateStatus;
  birthBurgId?: number;
  birthProvinceId?: number;
  birthStateId: number;
  homeBurgId?: number;
  raisedIn: RaisedIn;
  lineageId?: number;
  lineageName?: string;
  isDynasticClaimant?: boolean;
  religionId?: number;
}

export interface CharacterBond {
  kind:
    | "mentor"
    | "benefactor"
    | "rival"
    | "nemesis"
    | "lover"
    | "friend"
    | "ward"
    | "patron"
    | "client"
    | "blood_feud"
    | "comrade"
    | "hometown_kin";
  targetType: "character" | "house" | "state" | "religion" | "organization";
  targetId: number;
  strength: number;
  sinceYear?: number;
  note?: string;
}

export type GiftIntent = "courtesy" | "bribe" | "tribute" | "romance" | "piety_offering";

export interface CharacterBackstory {
  origin: CharacterOrigin;
  commitment: CharacterCommitment;
  tastes: CharacterTaste[];
  bonds?: CharacterBond[];
  /** 生成済みの短文フック。UI / 伝記の種 */
  hooks?: string[];
}

// Character に追加:
// backstory?: CharacterBackstory;
// /** A→B 人物好感度。キーは相手 character.i。未記載は無関心扱い */
// favor?: Record<number, number>;
// /** 個人所持 Good（贈答・私有）。市場在庫とは別 */
// inventory?: Record<number, number>;
```

既存のトップレベル `birthStateId` / `nationalityStateId` は、移行期間は `backstory.origin` と二重持ちし、最終的に origin へ寄せる。  
対国家感情は既存 `affinities`、対人物感情は `favor` とし、キー空間を混ぜない。

---

## 10. UI・CSV・フレーバーへの露出

### 10.1 Character Details

新規タブまたはセクション案:

1. **Origin** — 身分、出生都市、本拠、成育環境、家名  
2. **Commitment** — 「第一に仕えるもの」「第二」「衝突時の方針」  
3. **Tastes** — likes / dislikes を強度付きチップ表示  
4. **Favor** — 主要人物への好感バンド（fond / neutral / hostile 等）と数値  
5. **Inventory**（任意）— 個人所持の贈答候補 Good  

### 10.2 CSV エクスポート（人物まとめ用）

```
Origin
Social Stratum, minor_noble
Estate Status, landed_noble
Birth, Cardo (Vinia)
Home, Cardo
Raised In, provincial_seat
Lineage, Escagospo
Commitment
Primary, house (House Escagospo)
Secondary, faith
Intensity, 95
Conflict Policy, primary_wins
Tastes
Likes, titles_glory:90; hunting:70
Dislikes, merchants:80; company:55
Favor
Chaxias, 42 (friendly)
Concocais, -18 (neutral)
Oncos, -55 (hostile)
```

### 10.3 フレーバー生成パイプライン（次工程）

```
skills/personality の凸凹
  + origin（どこから来た誰か）
  + commitment（何のために生きるか）
  + tastes（日常の好悪）
  + favor / bonds（誰を好み、どう呼ぶ関係か）
  → 人物一文 / 長文伝記 / イベント選択肢
```

本計画は **入力スキーマ** まで。文生成プロンプトやテンプレートは別ドキュメント（例: `docs/plan/characters/flavor-text.md`）とする。

---

## 11. 既存計画との統合方針

| 既存概念 | 方針 |
| :--- | :--- |
| `Loyalty Target`（characters.md） | **廃止して Commitment.primary に統合** |
| `Patriotism` | Personality スカラーとして追加してよいが、向き先は Commitment（state / nation_culture / domain） |
| `Zeal` | 強度のまま維持。宗教専用ではないことをコメントで明記し、向き先は Commitment |
| `affinities` | **対国家** 好悪の正本。対人物は `favor` |
| Dynasty / 継承 | `lineageId` は将来の家門テーブルの外部キー。v1 は `lineageName` 文字列で十分 |
| 商人 rival ヘイト（characters.md 末尾） | `favor` 低 + Bond `rival` + Taste + Commitment で実装 |
| 軍人×悪徳商人（characters.md） | like `merchants` + like `corruption` + 高 guile/greed + 低 honor。贈答は favor デルタで検証 |
| 同郷・同軍属の「連帯」 | 固定陣営にせず **favor 初期ボーナス**（§6.3） |
| Economy Goods | 贈答マッチング表（§6.5.6）。芸術完成品はカタログ追加が前提 |

---

## 12. 実装フェーズ

### Phase A — スキーマと生成（最小）

1. `CharacterBackstory` 型追加（Origin / Commitment / Tastes）  
2. `buildOrigin` / `buildCommitment` / `buildTastes`  
3. Ruler / 中央官職 / 地方領主 / 武官 / 商人 の重み表  
4. Details UI と CSV に Origin / Commitment / Tastes を表示  
5. 単体テスト: ロール別分布のスモーク、整合性ガード G1–G6  

### Phase B — Favor（好感度）

1. `character.favor: Record<characterId, number>`  
2. `seedFavor`（同郷・同文化・同軍職などの初期ボーナス）  
3. Details UI に Favor バンド表示  
4. テスト: 非対称性、クランプ、スパース既定値  

### Phase C — 贈答と Goods

1. `inventory` または wealth 送金のみの最小 gift API  
2. `offerGift(..., intent)` と清廉キャラへの bribe 逆効果（G8）  
3. Economy に Artworks / Sculptures / Tapestries / Instruments（必要最小）を追加  
4. Taste↔Good マッチング表で artistry 高キャラへの芸術品ボーナス  

### Phase D — シミュレーション接続 ✅

実装: `src/extensions/characters/characterSimulationHooks.ts`

1. 戦略 AI: `getWarDriveModifiers` を `strategic-planner.ts` に接続（必要兵力・緊張速度・justification: holy_war / greed_expansion / dynastic_ambition 等）  
2. 汚職・贈収賄: `applyCharacterCorruption` / `tryCourtBribe` を nobility tick から実行。検出時は ruler 連帯感悪化。`offerGift` で清廉君主への bribe 逆効果  
3. 結婚 AI: `evaluateDynasticMarriage` を `calculateAffinities` の政略結婚判定に接続（faith/house 拒否、favor 加点）  
4. 愛国心: 格納フィールドは増やさず `getEffectivePatriotism`（Commitment + honor 由来）として導出  

### Phase E — 家門・Bonds・文化パック ✅

| 項目 | 実装 |
| :--- | :--- |
| Dynasty | `pack.dynasties` + `dynastyGenerator.ts`（君主・有力貴族・商人成金など） |
| Bonds | `characterBonds.ts`（rival/nemesis/hometown_kin/comrade/lover/benefactor…） |
| 文化・政体パック | `cultureFormPacks.ts`（monarchy/theocracy/republic/horde/empire）→ commitment/stratum 重み |
| フレーバー | `flavorHooks.ts` + `docs/plan/characters/flavor-text.md` |
| 統合 | `finalizeCharacterSociety` を `Characters.generate` 後に実行。Details UI/CSV に家門・Bonds・hooks 表示 |

---

## 13. 受け入れ基準（Plan 完了の定義ではない — 実装完了時）

- 任意の生成キャラが、次を **データとして** 答えられる  
  1. 生まれの階層と出生都市  
  2. いま何に一番仕えているか（primary commitment）  
  3. 特徴的な好き・嫌いを少なくとも1つずつ  
  4. （Phase B 以降）特定の他キャラへの favor 数値または無関心  
- 同じ seed で再生成しても backstory / 初期 favor が安定している  
- 中央官職は高確率で王都在住、地方領主は自領、商人は市場都市が home  
- 「王を尊崇しつつ家門第一」の中央貴族が、重み表どおり一定比率で出る  
- 清廉な受け手（高 honor・低 greed）への `intent: bribe` が **favor を減らす** ケースがテストで固定される  
- 芸術 Taste または高 artistry の受け手に、芸術系 Good を courtesy で渡すと favor が上がる（完成品 Good 追加後）  
- 人物まとめが Origin+Commitment+Tastes+Favor を根拠に書ける  

---

## 14. 非目標（この計画ではやらない）

- 全文自動伝記の LLM 必須化（テンプレートで足りる段階を先に作る）  
- D&D 背景クラス（Acolyte 等）の完全移植（AbilityPreset とは別系統）  
- 全 Taste カタログの文化別完全翻訳  
- リアルタイムで Commitment が毎ティック変わる複雑な欲望シミュレーション（変更はイベント駆動に限定）  
- 既存 `personality.zeal` の削除や意味の破壊的変更  
- 全キャラ全対全の favor 密行列  
- 「同郷なら必ず味方」の硬直ルール  
- 恋愛特化の完全なギャルゲー UI  

---

## 15. 要約

| ブロック | 一問で言うと | 既存の穴 |
| :--- | :--- | :--- |
| **Origin** | どこから来た、どの身分の誰か | location のみ／身分なし |
| **Commitment** | 何に仕えて生きているか | zeal に向き先がない |
| **Tastes** | 何が好きで何が嫌いか（物・カテゴリ） | 汎用性格スカラーのみ |
| **Favor** | 誰をどれだけ好きか／嫌いか | 対国家 affinities のみ。同郷・同軍は未表現 |
| **Gifts** | 何を贈ると心が動くか（逆効果含む） | 個人在庫なし・芸術完成品 Good 不足 |
| **Bonds** | その関係を何と呼ぶか | 数値 favor の注釈ラベル |
| **Hooks** | 一言でどんな人物か | 手動解釈に依存 |

同郷・同軍属は「連帯フラグ」ではなく **favor の初期補正**。贈り物は常に加点ではなく、清廉な人物への賄賂は **嫌悪（マイナス好感度）** になる。これらをロール別・階層別・文化別の偏り付きで持つことで、フレーバーテキストと政治・経済 AI の双方に「人物の芯」と「対人関係の温度」を供給できる。
