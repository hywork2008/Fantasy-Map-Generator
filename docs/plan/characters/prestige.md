# Prestige — 民衆から見た社会的ブランド

**Status**: 初期値の生成ルールを実装済み（2026-09-07）。  
**Code**: `src/extensions/characters/prestige.ts`, applied from `applyCharacterBackstory()`.  
**Related**: [characters.md](../characters.md) §2, [backstory-profile.md](backstory-profile.md) §3.4, [guilds/relations.md](../guilds/relations.md)（見習い上書き）

## 1. 定義

`Character.prestige`（1–100）は **民衆がいまその名前を聞いて想起する社会的ブランド** である。

| 含む | 含まない |
| :--- | :--- |
| 家名が通っている度 | 家柄そのもの（それは `socialStratum`） |
| 民衆が知る官職（王冠・元帥・宰相） | 宮廷内の実効力（Solidarity・官職・Intrigue） |
| 成人後に公開の場で積んだと推定される実績 | `personality.honor`（誓約を守るか） |
| | 諜報の成功・失敗 |

宮廷評価用の第2ステータスは置かない。Spymaster の実効力は官職・Intrigue・為政者との Solidarity で表す。

生成後の加齢だけでは上がらない。初期値は **これまで公開の場にいた人生の要約** であり、以後は公開イベントでのみ動かす。

## 2. 初期値の3成分

```
prestige = clamp(1, 100, inherited + officeBump + record + noise)
noise    = gauss(0, 3) clipped to [-6, +6]
```

実装: `rollInitialPrestige()`。内訳は `breakdownInitialPrestige()`。

### 2.1 家名 (`inherited`)

身分が「完成した名声」を与えない。若い王族が高いのは「王子だと名前は知られている」まで。

| socialStratum | 家名帯 |
| :--- | :--- |
| royal | 22–38 |
| high_noble | 12–26 |
| minor_noble | 8–18 |
| gentry | 5–14 |
| merchant_born | 4–16 |
| clergy_orphan | 3–12 |
| commoner | 1–8 |
| foreigner | 2–14 |
| unknown | 1–10 |
| freedman / slave_born | 1–5 |

### 2.2 公開官職 (`officeBump` × `visibility`)

官職そのものが民衆に見えるか。複数称号があるときは公開度が最大のものを使う。**諜報称号は公開度 0 としてスキップする。**

| 職務 | visibility | bump |
| :--- | ---: | ---: |
| Ruler（landed state 称号を含む） | 1.00 | 28–38 |
| Marshal / General / Minister of War | 0.90 | 10–16 |
| Commander / Admiral | 0.80 | 5–12 |
| その他 commander | 0.85 | 8–14 |
| Chancellor / 外交官 | 0.70 | 8–14 |
| Province lord | 0.70 | 12–20 |
| Chaplain / 宗教官 | 0.60 | 7–13 |
| Steward / 財務 | 0.50 | 6–11 |
| Merchant | 0.45 | 0 |
| その他の中央官 | 0.35 | 3–8 |
| Ordinary（名指しの市井） | 0.15 | 0 |
| **Spymaster / Director of Intelligence** | **0** | **0** |

君主が諜報職を兼ねる場合は王冠が公開なので ruler 側を取る。

### 2.3 公開実績 (`record`)

```
careerYears  = max(0, age − careerStartAge) を人間成人年へ換算
skillFactor  = 0.65 + 0.35 × publicSkill/100   （公開技能が無いときは 0.65）
record       = 55 × (1 − exp(−careerYears × visibility / 28)) × skillFactor
```

- キャリア開始は種族換算の人間 20 歳（`careerStartAge`）。成熟したばかりのエルフは 0。
- 減衰つきなので、高齢君主が全員 100 にはならない。
- 公開技能: 君主は Diplomacy、武官は Martial、宰相は Diplomacy、財務・商人は Stewardship、宗教官は Learning。
- **Spymaster の Intrigue は公開技能に使わない。** visibility が 0 なので record も 0。

見習い（人間 12–17 歳相当）はキャリア 0。ギルド側が直後に `getInitialApprenticePrestige` で上書きする（通常 1–5、Engineering ≥ 90 の神童のみ例外）。

## 3. Spymaster

職務の成功は為政者と直属にしか見えない。民衆の名誉にはならない。

- 出自は従来どおり minor_noble / gentry / commoner / foreigner / unknown 寄り。
- 初期 Prestige の主因は家名だけ。50 歳・Intrigue 100 でも record は 0。
- 80 回生成の実測（commoner、50 歳、Intrigue 90）: 中央値 5、p90 は 9、最大 13。

露見した工作は、将来イベントで下げる側に置く。成功では上げない。

## 4. 生成パイプライン

```
createPerson()                  // prestige はプレースホルダ rand(1,100)
assign titles / location
applyCharacterBackstory()
  origin (stratum, raisedIn, …)
  skill background bias
  rollInitialPrestige()         // ここが本番。嗜好より前
  tastes / commitment           // 儀式好みなどは確定 Prestige を読む
guild apprentice のみ
  getInitialApprenticePrestige() // 最後に上書き
```

再適用（`backstory` 既存）では Prestige を再抽選しない。D&D プリセットは `applyCharacterBackstory` 自体をスキップする。

## 5. 実装結果（人間・80 回）

`applyCharacterBackstory` 経由。技能は表の値、出自は固定。

| 人物 | p10 | 中央値 | p90 | 解釈 |
| :--- | ---: | ---: | ---: | :--- |
| 20 歳の王（royal, Diplomacy 50） | 54 | 63 | 70 | 王ではあるが治世の伝説はない。最大 75 |
| 50 歳の王（royal, Diplomacy 70） | 88 | 96 | 100 | 確立した君主 |
| 55 歳の Marshal（minor_noble, Martial 90） | 57 | 63 | 69 | 名高い将軍。王より下 |
| 50 歳の Spymaster（commoner, Intrigue 90） | 1 | 5 | 9 | 民衆から見ればほぼ無名 |

決定論の内訳（ノイズなし、家名を中央付近に固定）:

| 人物 | 家名 | 官職 | 実績 | 合計 |
| :--- | ---: | ---: | ---: | ---: |
| 20 歳の王 | 30 | 28–38 | 0 | 58–68 |
| 50 歳の王 Diplomacy 70 | 30 | 28–38 | ≈32 | ≈90–100 |
| 22 歳の Commander | 12 | 5–12 | <8 | 若手将校 |
| 55 歳の Marshal Martial 90 | 12 | 10–16 | ≫若手 | ベテランが上回る |

若い王が 90 台になる旧生成（身分帯 70–100 への 65% 寄せ）は、この定義では誤り。

## 6. 下流

| 利用 | 影響 |
| :--- | :--- |
| 政略結婚 `house_prestige_gap`（差 25） | 若い王同士は通りやすく、老王が低名家を拒みやすい |
| 商人シェア `prestige * 0.3` | 若手商人はやや小さい。技能項の方が大きい |
| 儀式の好き嫌い | 確定 Prestige を読む。若い下級将校は儀式嫌い、高位の閲兵指揮官は好き |
| 商家の Dynasty 判定（merchant_born かつ ≥55） | 確立した商人に寄る |
| ギルド親方の評判（Prestige 10%） | 公開ブランドは補助。本業は熟練 |

## 7. 今後足さないもの / 後で足すもの

足さない:

- 生成後の年齢ティックによる自動加算
- Spymaster の在任年数・Intrigue の公開換算
- 身分帯 70–100 を家名に戻すこと
- `personality.honor` を足すこと
- 宮廷評価用の新ステータス

後続:

- 戦勝・条約・公開土木など、公開イベントでの増減
- 商人の成功（wealth / share）による上振れ。生成時の代理は Stewardship × キャリア
- 若い騎士の武勇名声は、必要になってから狭く
