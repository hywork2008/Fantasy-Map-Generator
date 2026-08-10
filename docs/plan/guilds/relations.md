# 職人の人間関係

職人ギルドでは

- Engineeringが低い
- Confidenceが高い

という組み合わせの見習いは退職しやすい。

以下はオプションとして上記のダニング＝クルーガー効果より薄く影響させる。

- Rationalityが低い
  - 間違った方向へ進む力
- Boldnessが高い
  - 間違った方向へ進む力
- Energyが高い
  - 間違った方向へ進む力
- Greedが高い
  - もっと高い評価が得られる筈という欲
- Zealが高い
  - 自己評価の高さを盲信する
  - Zealというパラメーターとの目的整合性が低いので薄く影響。
- Vengefulnessが高い
  - 評価の低さを恨む
- Honorが低い
  - 体面を気にしないので「あの見習いは根気が無い」「あそこのギルドは見習いがすぐ辞める」など。

好き・嫌いも師弟関係に影響を与え、相性が悪いと退職しやすい。相性が悪ければ悪いほど辞めるまでの期間が短くなるが、見習いが他に生計を立てる手段が無ければ耐える事もあり得る。

弟子はEngineeringが天才的な高さで無い限りPrestige(名誉)は0に近く設定する。技術力が高ければ神童扱いで評価は高いという扱い。

職人キャラクターは同じギルド内や商人キャラクターと知己を得やすい。
軍用品を作っている鍛冶師は軍人と知己を得やすい。

Proficiencyが高く、Aptitudeが高評価なギルドマスターは権力者・大商人に招かれて首都を拠点にしやすい。
偏屈な職人気質であれば故郷から離れない事もありうる。

都市の人口が多く、師匠の評判が高ければ、辞めた弟子に変わる新キャラクターが弟子として補充されやすい。
辞めた後の弟子は別のギルドに割り当てたり、野盗になる、野垂れ死にする等でも良い。

- Debateが好きと嫌い
  - Debate嫌いの師匠と好きな弟子。ただし師匠が子持ちで家族を大事にしている(Compassionが高い)ならお喋りな弟子を暖かく見守る。

## 汎用設計: 嗜好に基づく対人関係評価

### 決定

`Character.solidarity` を一般的な対人関係の唯一の Score（`-100..100`、疎、非対称）として維持する。恋愛専用の `favor`、国家への `affinities`、ギルドの所属 Role には流用しない。

新設する Characters 所有の **Taste Relationship Evaluation module** は、人物 A が人物 B をどう感じるかを、嗜好・観測状況・A の受容性から**決定論的に評価するだけ**にする。Score をいつ、どれだけ動かすか、離職するかはこの Module の責務にしない。

```text
Character tastes + interaction context
              ↓
Taste Relationship Evaluation module  （A → B の評価、pure）
              ↓ assessment + evidence
Characters initial-contact adapter / Economy guild adapter / event adapter
              ↓ それぞれの頻度・上限・結果を解釈
adjustSolidarity(A, B.i, delta)
```

この分離により、Characters は「嗜好が生む方向性」と説明を一箇所に保持し、Economy は「師弟は毎日接触する」「関係悪化は退職圧になる」という Guild 固有の意味だけを保持する。Economy が Characters の嗜好カタログを再実装せず、Characters が Guild の年次処理・雇用先・退職先を知る必要もない。

### 置き場所と責務

| 項目 | 所有者 | 方針 |
| --- | --- | --- |
| `CharacterTaste`、`solidarity`、嗜好評価 | Characters extension | `src/extensions/characters/tasteRelationship.ts` を新設。`Character` と `CharacterTaste` の型だけを読み、乱数・DOM・WorldContext を読まない pure Module にする。 |
| 嗜好 ID の意味、組合せ、緩和規則 | Characters extension | 同 Module 内の小さな catalog に集約する。`backstoryProfile.ts` の `computeInitialSolidarity` 内へ新たな個別 `if` を足さない。 |
| 初対面の Score | Characters extension | 既存 `computeInitialSolidarity(A, B)` が Module の初対面用評価を一度だけ加える。既存の役職・同郷・人格則は残す。 |
| 師弟の日常接触、年次変動、離職圧 | Economy extension | `guildSuccession.ts` から Guild 用 adapter を呼ぶ。親方・弟子を選び、年 1 回の上限と退職判断を適用する。 |
| `solidarity` のクランプと疎保存 | Characters extension | 既存の `adjustSolidarity` / `setSolidarity` だけを通す。0 は edge を削除する既存不変条件を保つ。 |

動的 ZIP extension が host module を import できないという制約は変わらない。将来の動的 extension は、同じ評価結果を受け取るための `ExtensionAPI` action が実際に二つ以上必要になった時点で初めて seam を設ける。v1 では built-in Characters/Economy 間の既存依存方向を増やさず、Economy の小さな adapter が Characters Module を利用する。

### 外部 Interface（評価と適用を分離）

```ts
// src/extensions/characters/tasteRelationship.ts

export type TasteRelationshipSituation =
  | "firstContact"
  | "sharedWork"
  | "mentorship"
  | "socialVisit"
  | "gift";

/** 呼び出し元が、その場で実際に露出する話題・行動だけを渡す。 */
export interface TasteRelationshipContext {
  situation: TasteRelationshipSituation;
  /** e.g. ["debate", "craft", "company"]. 空なら嗜好同士は判定しない。 */
  exposedTasteIds: readonly string[];
  /** 0..1. 接触の濃さ。初対面は低く、師弟の日常作業は高い。 */
  exposure: number;
  /** B が A からどう読まれるか。e.g. ["soldiers", "merchants"]. */
  counterpartTraits?: readonly string[];
  /** mentorship のときだけ必要。寛容規則を observer 側へ限定する。 */
  observerRole?: "mentor" | "apprentice" | "peer";
}

export interface TasteRelationshipEvidence {
  tasteId: string;
  kind: "sharedLike" | "sharedDislike" | "opposedTaste" | "counterpartTrait";
  /** その evidence が A→B に与える未丸めの寄与。 */
  contribution: number;
  /** catalog が適用した受容・文脈緩和の理由。UI/debug 用。 */
  modifier?: "mentorTolerance" | "contextLimited";
}

export interface TasteRelationshipAssessment {
  /** A が B と接するときの嗜好由来の傾き。-100..100、A→B のみ。 */
  compatibility: number;
  /** 入力を正規化した 0..1 の接触濃度。delta 投影でも参照する。 */
  exposure: number;
  evidence: readonly TasteRelationshipEvidence[];
}

export function assessTasteRelationship(
  observer: Pick<Character, "personality" | "family" | "backstory">,
  counterpart: Pick<Character, "personality" | "family" | "backstory">,
  context: TasteRelationshipContext
): TasteRelationshipAssessment;

/**
 * assessment を、一回の関係イベントに許される小さな変化へ写す pure helper。
 * 保存はせず、呼び出し元が adjustSolidarity を使う。
 */
export function projectTasteRelationshipDelta(
  assessment: TasteRelationshipAssessment,
  options: { maxPositive: number; maxNegative: number; currentScore: number }
): number;
```

この Interface は `A → B` のみを返す。`B → A` は引数を交換してもう一度評価する。相性を単一の対称値に潰さないため、弟子は師匠の沈黙を苦痛に感じる一方、師匠は弟子を「少し騒がしいが可愛い」と評価できる。

`projectTasteRelationshipDelta` は `compatibility` の符号と `exposure` を反映し、`maxPositive` / `maxNegative` を超えない差分を返す。さらに現在の Score が同じ符号の端へ近いほど差分を縮める。したがって、年次処理を繰り返しても -100/+100 に機械的に張り付かず、贈答・共闘・侮辱など既存の別イベントが Score を動かす余地を残す。評価 Module 自身は時刻・乱数・保存済みの「前回評価年」を持たない。重複呼出しを防ぐ cadence は各呼び出し元の責務である。

### 嗜好の照合規則

評価するのは `context.exposedTasteIds` に含まれる嗜好だけである。例えば、二人とも `wine` の好みを持っていても作業場で酒が話題にならなければ関係 Score は変えない。これにより、人物の全嗜好を毎年総当たりで再評価することと、無関係な好みで人間関係が振動することを防ぐ。

| A の嗜好 | B の嗜好 | 基本寄与 | 意図 |
| --- | --- | --- | --- |
| like | like | 正 | 話題・活動を共に楽しめる |
| dislike | dislike | 小さい正 | 同じ不満を共有する。ただし共通の嫌悪だけで強い友情にはしない |
| like | dislike | 負 | A が大事にする活動を B が拒む |
| dislike | like | 負 | B が好む活動を A が避けたい |
| A が `soldiers` 等を dislike | B の `counterpartTraits` に該当 | 負 | 相手の役割・階層への直接的嫌悪 |

強度は A の `intensity` を主、B の `intensity` を従として合成する（例: `0.7 × A + 0.3 × B`）。これは「A がどれだけ気にするか」を優先しつつ、B の強い反発も見落とさないためである。寄与は同一 `tasteId` ごとに算出し、1 回の assessment では正・負を別々に合計してから、各々の上限を掛ける。強烈な `debate` 一件だけで全人格・全関係を決めない。

カテゴリ嫌悪（`soldiers`、`merchants`、`foreigners`、`nobles` など）は、既存の `computeInitialSolidarity` に散在する個別条件をこの catalog に移す。ただし、Role から `counterpartTraits` を得る変換は呼び出し元 adapter の責務とする。これで Module は Nobility/Economy の Role 名や市場制度を直接知らない。

### 受容性・例外の catalog

嗜好の一致/不一致は事実だが、その表出は性格と状況で変わる。例外は呼び出し元に `if` を増やさず、catalog の modifier として実装する。

| modifier | 発動条件 | 効果 |
| --- | --- | --- |
| `mentorTolerance` | `situation === "mentorship"`、A が親方として評価し、A の `family.children > 0` かつ `compassion >= 70` | `debate` / `company` の opposedTaste に限り、負寄与を 0.15〜0.45 倍へ緩和する。正へ反転はしない。 |
| `contextLimited` | 嗜好が exposed でない、又は exposure が低い | 寄与を 0 とする、又は exposure 比で小さくする。 |
| 将来: `patientTeacher` | 高 rationality・高 compassion など、明確なシナリオが追加された時 | 同様に catalog に足す。一般的な Personality 相性は既存の `computeInitialSolidarity` の責務のままにする。 |

従って例の「Debate 好きの弟子」と「Debate 嫌いの師匠」は双方に負の evidence を持ちうるが、子を持つ高 Compassion の師匠側だけは負寄与が大幅に弱まり、弟子側の不満は残る。これは非対称 Score として自然に表現できる。

### Guild adapter と年次の解釈

`guildSuccession.ts` に新しい薄い adapter（例: `guildRelationshipSettlement.ts`）を置く。ここは嗜好規則を持たず、次だけを行う。

1. 現役 `guildMaster` と、その `organizationId` を持つ現役 `guildApprentice` を列挙する。
2. 師弟ごとに A→B と B→A の `assessTasteRelationship` を、`{ situation: "mentorship", exposedTasteIds: ["craft", "company", "debate"], exposure: 0.75 }` など Domain ごとの日常接触文脈で呼ぶ。`debate` は常時露出にせず、師弟教育が口頭指導を含む Domain/イベントでのみ加える。
3. 初任時は低い上限（例: 正 `+8` / 負 `-12`）で一度だけ Score に反映する。現在の `ensureMasterApprenticeContactBond` の無条件 `+8..48` は、この初任評価と「最低限の共同作業の接触」を表す小さな中立寄り基礎値へ置換する。既存の悪い edge を上書きしない。
4. 年次には高々 1 回、より小さい上限（例: 正 `+3` / 負 `-5`）で drift させる。年度 guard は Economy の Guild settle 側に置く。
5. Score そのものではなく、両方向の低い方と生活手段を入力にして退職圧を計算する。退職・補充・他ギルド移籍・野盗化等の結果は別の Guild employment Module が所有する。本設計の v1 では退職を実装しない。

同じ Guild の非師弟や職人と商人の知己も、将来はこの adapter に別の `sharedWork` / `socialVisit` 文脈を渡すだけで扱える。誰を接触候補にするか（同一 Burg、軍需鍛冶師と軍人など）は Economy/Nobility の接触 graph の責務であり、Taste Relationship Evaluation module に全人物探索をさせない。

### 検証計画

Module の Interface をテスト面にする。乱数を使わないため、嗜好・文脈・性格を固定した単体テストで次を保証する。

- `like(debate)` の A と `dislike(debate)` の B は、`debate` が exposed のとき A→B が負、非 exposed なら 0。
- `like(debate)` 同士は正、`dislike(debate)` 同士はそれより小さい正。
- 同じ入力でも A→B と B→A は独立に評価され、強度差を反映する。
- 子持ち高 Compassion の親方は Debate 対立の師匠→弟子負寄与を緩和するが、弟子→師匠の負寄与を消さない。
- `projectTasteRelationshipDelta` は指定した片側上限、`solidarity` の `[-100, 100]` クランプ、0 の sparse 削除を破らない。
- Guild adapter は同年に二度 settle しても二重加算せず、既存の hostile な edge を無条件の正値で覆わない。

これらを Characters 側の `tasteRelationship.test.ts`、Guild 側の `guildRelationshipSettlement.test.ts` に分ける。前者は Economy fixture を不要にし、後者だけが年次 cadence と師弟 Role の結線を検証する。

## Guild apprentice lifecycle v1

嗜好評価以外の要求は、人物の気分を扱う Characters と、雇用を終える Economy の seam を越えないよう、以下の順で扱う。v1 は metallurgy の師弟だけに適用する。ほかの CraftKnowledgeDomain が実装された時は同じ Module を再利用する。

### Apprentice prestige

`createApprentice` の直後に、生成時のランダムな prestige を上書きする。

| Engineering | 初期 prestige | 意味 |
| --- | --- | --- |
| 1–89 | 1–5 | 見習いは未証明で、職業上の社会的名誉を持たない |
| 90–99 | 10–46 | 「神童」として都市で話題になる |
| 100 | 50 | 既に広く知られた天才。親方と同じ評価ではない |

実践 `proficiency` は後から育つため、初期 prestige の唯一の例外判定には使わない。これにより「Engineering が高ければ即有名」という要件と、技能習得の遅い実践値を二重計上しない。

### Annual departure assessment

新規 Module: `guildApprenticeLifecycle.ts`。`assessApprenticeDeparture(master, apprentice)` は pure な `ApprenticeDepartureAssessment` を返し、退職を直接実行しない。

```text
pressure =
  0.34 × overconfidence(confidence − engineering)
  + 0.32 × strainedMentorship(min(master→apprentice, apprentice→master))
  + 0.02..0.05 × optional personality terms

annualChance = pressure × (0.20 + 0.80 × financialMobility)
```

- ダニング＝クルーガー型（低 Engineering・高 Confidence）が主因である。
- Rationality の低さ、Boldness / Energy / Greed / Zeal / Vengefulness の高さ、Honor の低さは合計しても主因を上回らない薄い補助項である。
- `financialMobility` は named character の `wealth / 2 SP` を 0..1 にクランプする。貧しい見習いは不満を抱いても未知の生計に移れず、退職確率が最低 20% 係数まで抑えられる。
- 相互 `solidarity` の低い方だけを使う。一方だけが我慢している関係も離職圧になる。
- pressure が 0.12 未満なら退職抽選を行わない。通常の若者を無作為に離職させないための下限である。

年次順序は **嗜好 drift → departure assessment → skill growth → recruitment**。`GuildSuccession` の既存の year guard が同じ年の二重抽選を防ぐ。

抽選に当たった見習いは `guildApprentice` Role のみを `endYear` と `reason` 付きで終了する。Character と個人技能 record は消去しない。これは将来の別ギルド採用、雇われ職人、野盗化、死亡を別の employment / life-event Module が選べるようにするためである。v1 は「退職後に無所属として Burg に残る」までを実装する。

### Replacement recruitment and master standing

永続の `guildReputation` フィールドは v1 では追加しない。現時点で観測できる実績から、次の派生値を **master standing** と定義する。

```text
standing = 0.65 × practical proficiency
         + 0.25 × aptitude tier
         + 0.10 × public prestige
```

空席への年次応募確率は、`0.08 + 0.45 × log-normalized burg population + 0.40 × standing` を 0..1 にクランプする。新設ギルドだけは最初の一人を必ず確保し、技術ストックのある都市が人手ゼロで永久に始まらないようにする。以後の補充はこの抽選を通るため、人口が多く親方が有能な都市ほど辞めた弟子を早く補充する。

`standing` は派生値なので、将来に贈答・不正・受注失敗などの独立した評判履歴を導入しても競合しない。その時点で初めて `GuildReputation` を Economy slice に保存し、上式の第四項として加える。

### Deferred: social network and relocation

次の二つは入力データと状態遷移がまだ不足するため、v1 の年次師弟処理には混ぜない。

| 要求 | 必要な設計 | 実装開始条件 |
| --- | --- | --- |
| 同 Guild の職人・商人、軍需鍛冶師と軍人の知己 | Economy/Nobility が contact candidate を列挙し、`sharedWork` の exposed Taste context を Taste Relationship Module に渡す。`solidarity` を全人物総当たりで生成しない。 | 軍需の生産プログラムが「どの親方が軍用品を作ったか」を恒久 record として持つ時 |
| 高評価の master が首都へ移る | `(burgId, domain)` の Master Role、`GuildKnowledgeStock`、`GuildChapter`、家族の `homeBurgId` を一つの transaction で更新する。stock を本人と共に移動させない。 | GuildChapter 間の vacancy / invitation と、移転後の旧 Guild の後継選出を同時に扱える時 |

この二つを先に Role の直接書換えで実装すると、GuildKnowledgeStock の都市帰属、家族所在地、旧弟子の `organizationId` が分裂するため禁止する。
