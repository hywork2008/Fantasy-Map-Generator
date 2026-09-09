# 愚王・賢王と佞臣

**Status**: 実装済み（2026-09-07）。  
**Code**: `src/extensions/characters/courtFavorite.ts`  
**Related**: [flavor-text.md](flavor-text.md), [character-expression-revision.md](character-expression-revision.md), [military-war-record.md](military-war-record.md)

## 問題

宮廷の Solidarity は追従を好感として扱っていたが、為政者の判断力で差がつかない。能力も合理性も低い支配者と、人をたぶらかす技能を持ち忠誠が主君に向かない重臣が、同じ宮廷にいても関係として残らない。戦歴の二つ名は戦争の戦い方だけを表し、治世の渾名には使えない。

## 二つ名

戦歴の `militaryRecord.epithetId` とは別の `courtEpithetId`。名前表示は宮廷二つ名を優先する。両方あるときはフレーバーに両方残す。全員には付けない。

| id | 条件 | 日本語 | 英語 |
| :--- | :--- | :--- | :--- |
| `foolish_king` | 君主。合理性 ≤35、統治能力 ≤40、Intrigue ≤40、Martial ≤45（全能力が低水準な無能君主） | 愚王 | the Fool |
| `tyrant_king` | 君主。Compassion ≤20、Honor ≤45、かつ以下のいずれか：<br>1. 唯我独尊・覇道型（Boldness ≥70 かつ Confidence ≥70 かつ Vengefulness ≥55）<br>2. 苛烈な報復型（Vengefulness ≥75 かつ Boldness ≥45 かつ（Boldness ≥60 または Confidence ≥60））<br>3. 強欲と苛政型（Honor ≤30 かつ Greed ≥70 かつ（Vengefulness ≥50 または Boldness ≥50））<br>4. 猜疑と粛清型（Vengefulness ≥70 かつ Guile ≥65 かつ Sociability ≤45）<br>5. 狂信的弾圧型（Zeal ≥75 かつ Piety ≥65 かつ Vengefulness ≥50） | 暴君 | the Tyrant |
| `wise_king` | 君主。合理性 ≥70、統治能力 ≥65、Intrigue ≥50 | 賢王 | the Wise |
| `sycophant` | 愚王、またはだまされやすい暴君の宮廷で選ばれた佞臣、最大1人 | 佞臣 | the Sycophant |

統治能力は Diplomacy / Stewardship / Learning / Geography の平均。Martial や Prowess は入れない。武勇のある暗君と、文治の賢王を分けておくため。

共和政の元首にも同じ id を付ける。英語は王号に依存しない（`the Wise` / `the Fool`）。日本語は landed 称号で屈折する（賢王／賢帝／賢君、愚王／愚帝／愚君）。Queen／Empress は賢女王／賢女帝。Martial は統治能力に入れない。詳細は [occupation-epithets.md](occupation-epithets.md)。

## 佞臣

追従の表面（Greed+Guile+Sociability）とは別。定義は技能と忠誠の所在。

- 宮廷の重臣（中央官・武官・宗教官）。君主本人は対象外
- Guile ≥60、Sociability ≥55、Honor ≤55
- Intrigue または Diplomacy ≥65（たぶらかす技能）
- Commitment の第一が `liege` ではない
- 第一が self / wealth / house / patron / hedonism / rivalry / office のいずれか

国家や民への献身は、主君に仕えない愛国者であり佞臣ではない。Greed は必須にしない。家門第一の巧言も成立する。

## 関係

だまされやすい君主（合理性 ≤40、かつ Intrigue ≤45 または統治能力 ≤45）の宮廷から、佞臣条件を満たす者を一人選ぶ。たぶらかし得点が最大の者。既に `sycophant` がいる場合は入れ替えない。

- 君主→佞臣の Solidarity を少なくとも +58（寵愛。数値はだまくらかされた側）
- 佞臣→君主の Solidarity を少なくとも +38（表面の恭順。誓約ではない）
- Bond: 君主は `favorite`（寵臣）、佞臣は `patron`（主君を糧にする）。`benefactor` は付けない
- 賢王とは組まない。甘言は看破する

Commitment は書き換えない。見せかけの忠誠と、献身の対象を同一視しない。

## 初対面の追従

`computeInitialSolidarity` の追従ボーナスを君主の判断で分岐する。

- 合理性 ≥65 かつ Intrigue ≥55: 減点（看破）
- 合理性 ≤40 または Intrigue ≤35: 大きな加点（取り込み）
- それ以外: 従来どおりの小さな加点

## パイプライン

```
seedCharacterRelations（初対面 Solidarity）
finalizeCharacterSociety
  seedCharacterBonds
  seedCourtFavorites（二つ名・寵愛の底上げ・favorite/patron）
  applyCharacterHooks
```

新規の重臣追加は `finalizeCharacterSocietyForPeer` が同じ宮廷だけ再評価する。

## 表示

一覧・詳細・プレイヤーパネルの名前に `getCharacterEpithetSuffix`。フレーバーは保存した `courtEpithetId` と Bond から出す。架空の讒言事件は書かない。
