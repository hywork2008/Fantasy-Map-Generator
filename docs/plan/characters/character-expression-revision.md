# 人物表現の改訂 — 動機・手段・技能・経験

更新: 2026-09-06。実装済み範囲と後続設計を分ける。本書は `characters.md` / `backstory-profile.md` の初期設計と競合する場合の現行仕様。

## 1. 責務

| 層 | 表すもの | 今回の扱い |
| --- | --- | --- |
| Skills | 遂行・看破の能力 | 9軸を維持。Intrigue は工作・隠蔽、Diplomacy は交渉。職業や技能だけで工作欲求を決めない |
| Personality | 平常時の行動傾向 | 12軸を維持。Guile は間接的手段、Boldness は危険許容、Zeal は献身の熱量 |
| Commitment | 大切にする対象 | 既存の primary / secondary / intensity を維持。国家と現君主への忠誠を同一視しない |
| Goals | 具体的に望む結果 | kind / intensity / status / 任意の型付き対象を追加 |
| Principles | 越えない一線 | 誓約、民間人保護、捕虜助命、侵略拒否を追加 |
| Tastes | 私的な好き嫌い | 日常の46項目と、好み・価値判断・恐怖の区別を追加 |
| Origin | 出自と養育環境 | migration / familyOccupation と生成時の階層・養育環境指定を追加 |
| Life events | 実際の経験 | 今回は実際の辞任を記録。過去の捕虜生活・死別・改宗などは捏造しない |

Compassion と Guile の同時高値を抑制しない。「救助のために欺く」と「加害のために欺く」は手段が共通でも動機が異なる。高 Guile は低忠誠、低 Guile は低能力、高 Piety は好戦性、低 Sociability は悪人、という一対一対応を廃止する。

歴史例はモデルの反例確認に使い、人物全体の診断には使わない。[シンドラーの救済と以前の行動](https://encyclopedia.ushmm.org/content/en/article/oskar-schindler)、[ワシントンの指揮権返還](https://www.mountvernon.org/library/digitalhistory/digital-encyclopedia/article/resignation-of-military-commission)、[アショーカの碑文](https://www.worldhistory.org/Edicts_of_Ashoka/) はそれぞれ「善意と間接手段」「任務完了による引退」「経験・自己表現と価値観の変化」の検討例。

## 2. 数値を追加しないで解決する範囲

- `getWarPreference`: 戦争を始めたい強さ。war/peace の好み、富への執着、慈悲、復讐対象への献身、故国回復目標、個人的な戦争教義を使う。Boldness / Skills は含めない。
- `getPersonalAmbition`: 地位・財産の active goal、栄誉の好み、Greed / Energy から得る。清廉だが出世を求める人物が成立する。`office` の献身を権力欲と決めつけない。
- `idleHawkLoyalty`: 現君主への関係に、対象が一致する誓約を加える。国家への affinity と平均しない。愛国的な反君主人物を保持する。
- `getEffectivePatriotism`: 従来の献身・Honor中心の派生値を維持するが Guile 減点は廃止する。
- 工作の選択は Guile と動機、成功は Intrigue / Diplomacy。横領の隠蔽と政敵による失脚への脆弱性も Guile から Intrigue へ移す。
- 聖職者の Zeal 生成を Guile で下げない。高学識・高合理性だけで賭博好きの可能性を抑えない。
- 人物一覧・引退効果の簡易比較は Compassion/Honor 対 Greed/Vengefulness。Guile、Zeal、Sociability を善悪得点に入れない。

和平的な君主への交代・信条の変化時には、既存の未開戦の侵略計画も再評価して破棄する。実際に始まった戦争、領地奪還、軍務官自身の工作は別に扱う。

生成とシミュレーションは既存の乱数系を使用する。新規生成結果の乱数列・人物分布は変わるが、既存人物の値はロード時に再抽選しない。

## 3. Backstory の任意追加

```ts
{
  goals?: [{
    kind: "gain_office" | "gain_wealth" | "protect_people" | "restore_homeland"
        | "return_home" | "reunite_family" | "master_craft" | "serve_faith" | "complete_service",
    intensity: number,
    status: "active" | "completed" | "abandoned",
    target?: { type: "character" | "state" | "burg", id: number }
  }],
  principles?: ("keep_oaths" | "protect_civilians" | "spare_prisoners" | "reject_aggression")[],
  compassionScope?: "everyone" | "community" | "faith" | "family",
  religiousWar?: "unspecified" | "defensive" | "holy_war" | "sacrificial",
  lifeEvents?: [{ kind: "office_exit", year, title, reason, entityType, entityId }]
}
```

新規生成では、適用できる Commitment から控えめな現在の目標を設定する。家族への献身だけで「家族と離別した」と推定しない。宗教戦争への立場は `unspecified`、慈悲の対象は `everyone` が既定。明示的な目標や信条を再度初期化しない。

`compassionScope` は人物間の初期関係に接続する。共同体・信仰・家族の範囲外に対する慈悲の寄与は25%とし、未知の国籍・宗教を敵扱いしない。

`reject_aggression` と `defensive` は戦争志向を0にするが、既存の戦争への応戦・領地奪還まで禁止するものではない。`keep_oaths` は対象を明示した忠誠に使う。民間人・捕虜への実際の処遇と、それに対する拒否・葛藤のイベントは後続の軍事／教団行動で接続する。

`religiousWar` は所属宗教でも結社membershipでもない。Holy war 補正には本人の教義支持、信仰への献身、熱意に加え `WarDriveContext.religiousConflict === true` が必要。通常プランナーは宗教争点をまだ渡さないので、文化差・高Pietyだけで聖戦補正を発火させない。

個人的な信仰を扱う政略結婚でも文化差を信仰差の代用にしない。双方の宗教が既知の場合のみ重みに反映し、異文化だけで拒否しない。

出自は `ApplyBackstoryOptions.socialStratum` / `raisedIn` / `migration` / `familyOccupation` を独立指定できる。例: `high_noble + monastery + immigrant + trade`。`foreigner` / `clergy_orphan` の旧enumは互換性のため保持し、旧セーブの身分を勝手に推定し直さない。出生国と所属国が既知で違う場合に移住情報を補う。

## 4. 辞任と独走

実際のトリガーを `OfficeExitCause` で渡し、`pastTitles.reason` と `lifeEvents` に同じ理由を残す。種族による Stress → Boredom の書き換えを廃止。

| 原因 | 今回接続した証拠 |
| --- | --- |
| stress | 従来の脅威・技能・危険許容による負荷が閾値を超える |
| boredom | 戦争志向 ≥60 の軍務官と国家の役務負荷に25以上の差 |
| health | 既存 health ≤25 |
| mission_complete | 担当国を対象にした complete_service 目標が completed |
| return_home | 強い帰郷目標、homeBurgId と現在地の不一致 |
| family | 強い家族再会目標、既存の家族ID、実在・生存・別所在の相手 |
| policy_conflict | 軍務官の戦争志向 ≤15 と君主の好戦政策 ≥70 の不一致 |

conscience / recognition / danger / loyalty_conflict の理由語彙も用意したが、命令違反・待遇・粛清危機の自動生成を捏造しない。該当するイベントの実装時に cause を渡す。

辞任しても現在地を維持し、帰郷・再会目標を completed にしない。移動・再会の成立は実際のゲーム内行動で決める。

独走は低い対君主忠誠と高い野心を要求する。戦争工作には Guile ≥60 と戦争志向 ≥60 を要求し、成功確率は技能による上限付き評価。工作に失敗しただけで臆病な人物をクーデターへ送らない。`playerDirected` の自律開戦禁止は維持する。

この変更は将軍草案の連隊服従・証拠・危機・非対称認可システムを実装するものではない。

## 5. 日常の好き嫌い

正本: `src/extensions/characters/dailyTastes.ts`。従来40項目 + 46項目 = 86項目。新規生成は日常カテゴリから重複しない3カテゴリを抽選し、like 2件 / dislike 1件を追加する。職業・性別・能力とは独立。

| カテゴリ | 項目 |
| --- | --- |
| 食 | 甘味、辛い料理、魚料理、野菜料理、郷土料理 |
| 調理・栽培 | 料理、パン・菓子作り、園芸・菜園、花 |
| 自然・移動 | 散歩、釣り、山、海、旅 |
| 娯楽 | 盤上遊戯、謎解き、演劇、踊り、歌、物語、冗談 |
| 手仕事・収集 | 木工、裁縫・刺繍、陶芸、収集 |
| 環境・身だしなみ | 静けさ、人混み、清潔、整頓、香水、入浴 |
| 関わり・進め方 | 深い会話、教えること、規則的生活、即興、事務仕事、競争 |
| 他者の振る舞い・注目 | 自慢、干渉、遅刻、指図、注目されること |
| 動物 | 猫、犬、鳥、虫 |

- 生成した全候補を強度順に整理して保持する。旧 `likes.slice(0, 4)` / `dislikes.slice(0, 3)` は廃止。重複は同じ aspect / id 内で整理する。
- `aspect` は preference / value / fear。旧データの省略は preference。mercy / cruelty / corruption の新規生成は value。「酒は好きだが飲酒を是としない」を別aspectで保存できる。私的欲求・戒律の別々の生成は今後の教義拡張で補う。
- 一般的な好き嫌いと恐怖・価値判断は表示で区別する。親しみを得る材料と、行為への倫理的な拒否は同一視しない。
- 宴会・料理と社交は別。料理好きで人付き合いが苦手でも矛盾と判定しない。
- 性別に基づく嗜好倍率・社交場の固定を廃止。商人のgold・軍人のsportも確率的にし、職業の得意不得意と私的な楽しみを分ける。
- 贈答は既存 Good を利用する。甘党へのHoney、香り好きへのPerfume、裁縫好きへのCloth/Silkなど。新しい交易財を無条件に追加しない。

## 6. 表示・互換性・検証

Details / CSV に目標・規範・戦争信条・慈悲の対象・移住・家業・実際の辞任履歴を表示する。英日翻訳を追加。フレーバーの先頭3件制限を外し、家門や仇のフックを保存・表示する。

任意フィールドの欠落は機能未使用として扱う。旧セーブから架空の戦争教義や過去の経験を生成しない。`onlyIfMissing` は既存Backstoryを変更しない。通常の再生成でも追加プロフィールを保持する。

主要な検証:

- 高Compassion・高Guileでも表示・愛国心がGuileで悪化しない。
- 勇敢な和平派と慎重な好戦派、清廉な野心家、愛国的な反君主が成立する。
- 高Piety・異文化だけで聖戦・婚姻拒否を起こさない。
- 学識や合理性だけで賭博嫌いを強制しない。
- 後から生成された趣味・価値観・関係フックを失わない。
- 旧データ、未設定の対象、他国への任務完了、存在しない家族を退職の根拠にしない。
- 英日表示と既存の贈答・人物生成・政治処理が動作する。

## 7. 後続候補

分野別専門性は [能力の専門分野・経験・言語設計](skill-specializations.md)（2026-09-07、専門プロフィール・言語・主要判定を実装済み）で具体化する。指揮・統率はMartialの内訳とし、9 Skillsを維持する。Leadershipの独立Skill化、自制・開放性の基本Personality化は引き続き別の調整で判断する。基本値を増やす前に、既存値では区別できない複数の判断場面を用意する。

捕虜・敗戦・恩赦・死別・改宗・破産などの転機、疲労・悲嘆・屈辱・達成感の状態、公開／秘密教義の認識、信念の改訂可能性は、実際のイベントと更新規則が必要。今回の `lifeEvents` をこれらの実装済み履歴モデルと誤認しない。
