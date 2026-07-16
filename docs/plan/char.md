# 軍隊関連の人事（武官・地方領主）

`docs/plan/characters.md`（為政者・中央官職の設計）の延長として、宗主国中央だけでなく前線・部隊レベルのNPCを追加した。**実装済み。**

## 武官（Officer）— `src/extensions/nobility/generators/officerAssignment.ts`

「軍団全てではなく、一部にたまにふらりと能力をランダム生成させた武官が所属する」という要求を、`MilitaryRegiment.commanderId?: number`（`src/types/models.ts`）1フィールドの追加で実現した。新しい役職テーブルやentityTypeは増やしていない — 既存の `TitleHolding`（`entityType: "state"`, `landed: false`）に "Commander"（陸上連隊）/ "Admiral"（艦隊、`regiment.n` が真）の称号を持たせるだけで表現できる。

- **近衛兵団（`isCapitalGuard`）**: 新規キャラクターは作らない。既存の中央官職 Marshal（`CENTRAL_OFFICES`）が自動的に指揮官になる — 近衛兵団は「独立した軍団」ではなく「宮廷直属の兵」という設計判断（`docs/plan/military-organization-and-vassalage.md` の近衛兵団の扱いと同じ思想）。
- **それ以外の連隊（野戦軍・属国駐屯・艦隊）**: `assignOfficers()` が呼ばれるたびに、まだ指揮官のいない連隊へ確率的（`OFFICER_ASSIGNMENT_CHANCE = 0.35`）に新規武官を生成・配属する。全連隊を毎回埋めるわけではない — 「たまにふらりと」を確率ゲートで表現している。
- **能力**: 新しい槍・剣・弓・騎馬・カリスマのようなスキルは追加せず、既存の `CharacterSkills.martial`（primarySkillとして40〜100を保証）を再利用。武官の有無・能力による戦闘補正は `battle-resolution.ts` の `commanderPowerMultiplier()` が担う（後述）。
- **死亡・空席の扱い**: `getRegimentCommander()` が「生存していて、かつ該当stateのCommander/Admiral称号をまだ保持している」ことを毎回チェックする。武官が死亡（`advanceAge()`）したり、`Military.generate()` の再実行で連隊配列が丸ごと再生成されたりして指揮官が失われても、次の `assignOfficers()` 呼び出しで自動的に空席が埋まる。逆側（称号を明示的に剥奪する処理）は実装していない — 判定を「生存＋称号あり」の2条件にしたことで、剥奪処理を別途書く必要がなくなっている。

### 戦闘への反映 — `battle-resolution.ts`

以前は誰の能力も戦闘力の計算に使われていなかった（TODOコメント付きで常にrulerにフォールバックしていた）。今回の変更で2点を修正:

1. **Spymasterの検出フェイズ**: `attackerSpymaster`/`defenderSpymaster` を、常にrulerではなく実際にSpymaster官職を持つキャラクターから解決する（見つからなければrulerへフォールバック）。
2. **武官の戦闘力補正**: `commanderPowerMultiplier()` が `1 + martial/100 * 0.5`（最大+50%、常に1以上）を、連隊の実兵数ではなく「勝敗判定に使う戦力スコア」にだけ掛ける。死傷者数の計算は実兵数ベースのまま変えていない — 補正は「強い武官がいると勝ちやすくなる」だけで、「その分兵士が減りにくくなる」わけではない。

**未解消**: `strategic-planner.ts`（AIが「攻めるかどうか」を判断するための戦力見積もり）はまだ武官ボーナスを見ていない。実戦闘の結果だけが武官の影響を受け、AIの侵攻判断はまだ生の兵数だけで行われる。整合性のズレとして残っている（意図的なスコープ外— 判断ロジックと解決ロジックを同時に変えるとテストの因果が追いにくくなるため）。

## 地方領主・辺境伯（Province Lord）— `src/extensions/nobility/generators/provinceLordGenerator.ts`

「辺境の防衛・辺境伯」を、`TitleHolding.entityType` に `"province"` を追加する形で実装した（`characterTypes.ts` に元々 `// extend with "province" | "burg" once those levels are generated` という伸ばし先コメントがあり、それをそのまま使った）。

- **対象**: 全州ではなく、`getProvinceThreats()`（`src/generators/frontierAnalysis.ts`）が実際に脅威ありと判定した**前線州のみ**。内陸州には領主を置かない — 都市兵/衛兵を「表示が増えすぎる」として不採用にした判断（本ファイル冒頭の設計方針）と同じ理由で、キャラクター数を絞っている。
- **称号**: 一律「Margrave」にはしていない。`Province.formName`（`provinces-generator.ts` が生成する County/Earldom/Landgrave/Margrave/Barony/...等の既存フレーバーテキスト）をそのまま流用し、性別変化した爵位名を `resolveProvinceLordTitle()`（`titleTable.ts`）で解決する。国のform（Monarchy/Republic/Theocracy/Union/Anarchy/Wild）ごとの語彙をカバーする表と、未知のformNameへのフォールバック（Lord/Lady）を用意した。
- **継承**: 州レベルの領主は `processSuccessions()`（中央官職の椅子取りゲーム）の対象にしていない。死亡時の称号剥奪だけは既存の汎用ロジック（`advanceAge()` の死亡分岐は entityType を問わず全称号を剥奪する）でカバーされるので、後任は次の `assignProvinceLords()` 呼び出しで自然に補充される。存命中の辞任・更迭ロジックは対象外（v1のスコープ外）。

### 導入時に見つかった表示バグ（修正済み）

`entityType` を追加したことで、`entityId` の意味が「stateのid」から「entityType次第でstateまたはprovinceのid」に変わった。この前提を踏まえずに `entityId` をそのまま `pack.states[]` へ添字アクセスしていた箇所が2つ残っていて、実際に動かして初めて見つかった:

- `CharacterDetailsDialog.tsx` のTitles/Past Titles表示（およびCSV出力）が常に `states[t.entityId]` を見ていたため、province領主の称号が「{称号} of Unknown」になっていた。Characters Overview一覧表は `character.state`（キャラクター自身が属する国のid、常に正しく設定される）を見ていたため、こちらは元から正しく表示されていた — 同じ画面群でも参照しているフィールドが違っていたのが表面化しにくかった原因。`getTitleEntityName()` を追加し、`entityType` で `pack.states`/`pack.provinces` を切り替えるよう修正。
- `characters-generator.ts` の `processSuccessions()` 内 `livingStateChars` フィルタが `entityType` を見ずに `entityId === state.i` だけで判定していたため、province idとstate idが数値的に一致した場合、province領主が誤って「その国の中央官職保持者」として数えられる可能性があった。`entityType === "state"` の条件を追加して修正。

**教訓**: `entityId` を読む場所は必ず `entityType` を見てから対応するテーブル（`pack.states` / `pack.provinces`）を選ぶこと。`entityId` 単体でstate配列に添字アクセスするコードを新たに書かない。

## 呼び出しタイミング

`assignOfficers()` / `assignProvinceLords()` は、`Characters.generate()` の3つの既存呼び出し箇所（`fmg:generate-post-core` ハンドラ、"Regenerate Characters" ツールアクション、拡張有効化サブスクライバ — `applyPersonalityToCapitalGuard()` と同じ3箇所、`docs/plan/military-organization-and-vassalage.md` 参照）と、`registerTimeTickHook`（毎ティック）の両方から呼ぶ。ティック側は2箇所ある:

- `Characters.advanceAge()` の直後 — 武官の死亡・領主の死亡による空席を埋める。
- `bordersChanged` で `Military.generate()` を再実行した直後 — 連隊配列が丸ごと作り直されるため、`commanderId` を持つ連隊が一つも無くなる。ここで `assignOfficers()` をもう一度呼ばないと、次の空席補充まで全連隊が指揮官なしになる。

## スコープ外（次フェーズ）

- `strategic-planner.ts` の戦力見積もりへの武官ボーナス反映（上述）
- 州レベル領主の存命中の辞任・更迭、`processSuccessions()` 相当のロジック
- 武官・領主自身のPersonality/Skillsが部隊の采配（撤退判断など)に反映される仕組み
