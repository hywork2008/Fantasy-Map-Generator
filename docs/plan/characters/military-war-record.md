# 生成時の戦歴再構成

**Status**: 実装済み（2026-09-07）。  
**Code**: `src/extensions/characters/militaryWarRecord.ts`  
**Related**: [prestige.md](prestige.md), [flavor-text.md](flavor-text.md), [marshal-player-unauthorized-war.md](../marshal-player-unauthorized-war.md) D4

## 問題

地図生成直後の高齢武人は、Relations history に戦争があっても個人の従軍記録を持たない。`Campaign.end` は勝利ではない（D4）。単純な「勝ち＝名誉、負け＝汚名」は、殿で味方を助けた敗戦や、後方に引っ込んだ勝ち戦を表せない。

## 対象

- 軍職（Marshal / Commander / Admiral 等）または辺境の地方領主
- 人間換算のキャリアが 25 年以上（およそ 45 歳以上）
- 所属国の `state.campaigns` が在任期間と重なる

若い将校や、戦争のない国の武人は作らない。

## 従軍と戦い方

戦争ごとに「その国の戦争に居たか」と「どう戦ったか」を分ける。

1. **従軍判定** — 官職による確率（Marshal 高、野戦指揮官中、辺境領主低）。外れた戦争は名簿にも戦場にもいない。
2. **戦い方 (`WarConductKind`)** — 性格・武勇・防衛側かどうかで重み付け。`campaign.end` は見ない。

| conduct | 意味 | 民衆 Prestige |
| :--- | :--- | ---: |
| `rearguard_rescue` | 敗走・撤退で味方を助けた | +8 |
| `defensive_hold` | 防衛線を守った | +6 |
| `front_assault` | 前線で指揮した | +5 |
| `costly_push` | 突っ込んだが犠牲が大きい（勝敗は問わない） | +2 |
| `rear_idle` | 後方に下がって何もしなかった | −2 |
| `cautious_avoid` | 戦闘を避けた | 記録しない |

勝ち戦の `rear_idle` はプラスにならない。負け側でも `rearguard_rescue` は名誉になる。

経験は従軍した件数だけ `specializations.experienceYears.battle` と `experience[]`（mode `battle`）に足す。架空の都市陥落は書かない。

## 二つ名

従軍が溜まって初めて付く。全員には付けない。

| id | 条件 | 日本語 |
| :--- | :--- | :--- |
| `guardian` | 救援が2回、または救援+防衛 | 守護神 |
| `last_guard` | 救援1回 | 殿軍 |
| `wall` | 防衛2回以上（救援なし） | 鉄壁 |
| `vanguard` | 前線2回以上（後退なし） | 先鋒 |
| `idle_banner` | 後退2回以上で前線・救援なし | 控えの将 |

フレーバー行は保存した `epithetId` から出す。戦果を捏造しない。

## パイプライン

```
applyCharacterBackstory（民衆 Prestige）
seedMilitaryWarRecords（従軍・delta・二つ名）
calculateAffinities / 結婚
finalizeCharacterSociety（hooks に epithet）
```

野戦将校・辺境領主は生成時に在任開始年をキャリア開始まで戻し、過去の戦争と重なるようにする。
