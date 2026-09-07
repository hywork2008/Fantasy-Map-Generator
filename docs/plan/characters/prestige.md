# Prestige — 民衆から見た社会的ブランド

**Status**: 初期値の生成と観察者相対の導出クエリを実装済み（2026-09-07）。  
**Code**: `src/extensions/characters/prestige.ts`（生成は `applyCharacterBackstory()`）。  
**Related**: [characters.md](../characters.md) §2, [backstory-profile.md](backstory-profile.md) §3.4, [guilds/relations.md](../guilds/relations.md)（見習い上書き）

## 1. 定義

`Character.prestige`（1–100）は **民衆がいまその名前を聞いて想起する社会的ブランド** である。

| 含む | 含まない |
| :--- | :--- |
| 家名が通っている度 | 家柄そのもの（それは `socialStratum`） |
| 民衆が知る官職（王冠・元帥・宰相） | 宮廷内の実効力（Solidarity・官職・Intrigue） |
| 成人後に公開の場で積んだと推定される実績 | `personality.honor`（誓約を守るか） |
| | 諜報の成功・失敗 |
| | 軍部評価・外国での英雄／悪名（導出。§8） |

保存フィールドは `prestige` のみ。宮廷の為政者からの評価は Solidarity。軍部と外国は `militaryStanding` / `reputationAmong` で導出する。Spymaster の職務成功は為政者と直属の Solidarity にだけ残す。

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
| 政略結婚 | 観察国から見た `marriageTrophyValue`。味方・中立は国際知名度、敵は悪名（負）。差 25 で拒否。悪名は `house_infamy` |
| 商人シェア `prestige * 0.3` | 若手商人はやや小さい。技能項の方が大きい |
| 儀式の好き嫌い | 確定 Prestige を読む。若い下級将校は儀式嫌い、高位の閲兵指揮官は好き |
| 商家の Dynasty 判定（merchant_born かつ ≥55） | 確立した商人に寄る |
| ギルド親方の評判（Prestige 10%） | 公開ブランドは補助。本業は熟練 |
| 兵の服従（独走戦争） | 民衆 `prestige` ではなく `militaryStanding` |

## 7. 今後足さないもの / 後で足すもの

足さない:

- 生成後の年齢ティックによる自動加算
- Spymaster の在任年数・Intrigue の公開換算
- 身分帯 70–100 を家名に戻すこと
- `personality.honor` を足すこと
- `courtPrestige` / `militaryPrestige` / `foreignPrestige` を人物に保存すること
- 敵国の数だけ署名付きスコアを持つこと
- 恐れを名誉に混ぜること

後続:

- 戦勝・条約・公開土木など、公開イベントでの増減（民衆 `prestige` と軍部評価を別々に）
- 商人の成功（wealth / share）による上振れ。生成時の代理は Stewardship × キャリア
- 若い騎士の武勇名声は、必要になってから狭く
- 宮廷の集団平均 Solidarity が必要になってから圏集計を足す

## 8. 観察者相対 — 知名度・符号・対人

観客の数だけ Prestige を持たない。同じ軍務卿が味方の英雄で敵の悪名なのは、別の人生ではなく **同じ伝説の符号が観察者で反転する**。

| 層 | 問うこと | 実装 |
| :--- | :--- | :--- |
| 知名度 | その圏で名前が通っているか | 民衆は `prestige`。軍部・国際は導出 |
| 評価の符号 | 英雄か悪名か | `diplomacyValence` × 国際知名度 |
| 対人関係 | この人がこの人をどう思うか | `solidarity` / `favor` |
| 恐れ | 敵が怖がるか | `dread`。名誉のマイナスではない |

### 8.1 4つの観客

| 観客 | 何を見るか | 持ち方 |
| :--- | :--- | :--- |
| 国内民衆 | 公開の官職と戦勝の名誉 | 保存 `prestige` |
| 宮廷の為政者 | 個人ごと。忠誠・脅威・儀礼 | **Solidarity**。`courtKnownness` は「職が見えるか」だけ |
| 軍部 | 勝つか、兵を無駄にしないか | `militaryStanding`（導出。無名兵士キャラはいない） |
| 友好国 | 同じ戦歴を英雄として読む | `reputationAmong` … 国際知名度 × 正 |
| 敵対国 | 同じ戦歴を悪名／恐れとして読む | 同じ関数 … 国際知名度 × 負 + dread |

パレード型の軍務卿は民衆 Prestige と宮廷 Solidarity が高く、軍部評価が低いことがある。泥の軍務卿はその逆。

スパイ:

- 民衆 `prestige` … 家名だけ
- 宮廷 knownness … 職があることは見える（deeds は入らない）
- 職務成功 … 為政者と直属の Solidarity のみ
- 軍部・国際 … 0（露見時だけ国際が跳ねる。未実装）

### 8.2 圏の公開度

`SPHERE_VISIBILITY`（`OfficeKind` × public / court / military / international）:

| 職務 | 民衆 | 宮廷 | 軍部 | 国際 |
| :--- | ---: | ---: | ---: | ---: |
| 君主 | 1.00 | 1.00 | 0.50 | 1.00 |
| 軍務卿 | 0.90 | 0.80 | 1.00 | 0.85 |
| 野戦指揮官 | 0.80 | 0.20 | 0.90 | 0.40 |
| 宰相 | 0.70 | 0.90 | 0.10 | 0.55 |
| 財務 | 0.50 | 0.70 | 0.10 | 0.15 |
| Spymaster | 0 | 0.35 | 0 | 0 |

### 8.3 導出クエリ

```
militaryStanding     = 0.35 × 家名中央値 + 軍部官職加点 + record(軍 vis, Martial)
internationalKnownness = 家名中央値 × 国際漏れ + 官職加点 × (国際 vis / 民衆 vis) + record(国際 vis, 公開技能)
  国際漏れ: royal/high_noble 0.85, minor_noble/gentry 0.50, 他 0.25
  Spymaster は 0

diplomacyValence(Ally/Friendly/Vassal/Suzerain) = +1
diplomacyValence(Enemy/Rival) = −1
diplomacyValence(Suspicion) = −0.4
diplomacyValence(Neutral / 未設定) = +0.2

reputationAmong(人物, 観察国):
  自国 → honor = prestige, dread = 0, label home
  他国 → knownness = internationalKnownness
         honor = knownness × valence
         dread = valence < 0 のとき knownness × 軍事脅威
         label: unknown / hero / infamous / noted

marriageTrophyValue:
  自国 → prestige
  valence < 0 → honor（悪名は負）
  それ以外 → knownness（中立の名君も婚資になる）
```

コード: `src/extensions/characters/prestige.ts`。生成後も乱数を使わず、家名は帯の中央値。

身内（家門）用の Prestige は置かない。家名は民衆 `prestige` の inherited、家の中の序列は Solidarity と称号。

### 8.4 UI

人物詳細の Prestige は自国民衆。軍 vis ≥ 0.4 なら軍部評価を並べる。プレイヤー人物が別国なら「あなたの国から見た評価」（英雄／悪名／恐れ）。宮廷評価の数値行は出さない（関係タブの Solidarity）。
