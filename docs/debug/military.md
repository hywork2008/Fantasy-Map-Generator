# 軍隊と砦の初期配置

現在、軍隊の位置や規模、砦の位置などが周辺国との戦争とは無関係な荒唐無稽な位置にある。
これらはどのように生成されているか、アルゴリズムを調査して下さい。

殆どのCultures set設定において軍隊はRelations historyに記載される周辺国との戦争に備えさせようと思います。
Dark FantasyのDangerレイヤーに生成されるモンスターの位置にも対応させる予定です。

## 侵略戦争メモ書き

仕様書
docs/analytics/military-frontier-repositioning.md
docs/plan/military-organization-and-vassalage.md

メモ書き
docs/debug/military.md

現時点のマップは何故この国はこの国を攻め滅ぼさないのかという明らかで甚大な国力の差を持っている構造が作成される。
Relations Historyを読み取り、今後、Advance Timeで時間を進めた時に戦争・侵攻をはじめる国の動きを演出するデータ構造を作りたい。

強い国Aがあって、その横に友好的で脆弱な国Bがあるとする。
Bの周りの国々C,D,EもAから見ると弱すぎてまとめて倒す事すら出来て、倒すので損害が出ても、もう周りには敵対国も無い。
自国と周辺国の情勢、為政者達のPersonalityなどと照らし合わせて、地図のデータを読み解くと次の動きが分かるような自然な状態にしたい。

**実装済み**: `StrategicGoal`（`src/context/simulationContext.ts`）と `src/extensions/nobility/generators/strategic-planner.ts`。国力比較・辺境州ごとの脅威度（`getProvinceThreats()`）・為政者の`boldness`を組み合わせて`tension`を毎ティック上昇させ、閾値到達で`state.diplomacy`をEnemyに切り替えて`BattleResolutionGenerator.resolveSiege()`が戦闘を解決する。

## 配置の基本

情報伝達と移動速度の遅い世界情勢を考えるとある程度、満遍なく軍隊を配置する必要がある。
属国に兵士を配備しすぎて本国の守りが薄い国がある場合は、Relations history生成時点で無理な敵対関係を生み出しすぎた可能性がある。

近接している国は似たようなバイオームで、同じくらいの人口、同じくらいの兵数になってもおかしくない筈である。

## Fleet

船にはどれくらいの人数が乗れるか
小さい国ほど生き残りをかけて大陸間貿易などを欲する
大国はもちろん船を建造するだけの労働力や財力を確保しやすい

## 属国の運営方法

属国の運営方法として宗主国が属国内に軍隊を常駐させる。
敵国の兵士が多く、自国の兵士がそれに対抗出来るほど十分で無い場合は派兵出来ない。
属国の兵士が少なすぎる場合は宗主国に武装放棄させられている？

属国が宗主国に上納金・穀物など税を収める。
属国は宗主国の軍隊の維持という負担を押し付けられている状態。

src/generators/vassalage.ts

**実装済み**（貢納・按分駐屯のみ）: 詳細は `docs/plan/military-organization-and-vassalage.md` の「1. 属国の統治」を参照。「敵国の兵士が多い場合は派兵出来ない」「兵が少なすぎる場合の武装放棄」は未実装 — 現状の按分ロジックは宗主国側の残存兵力だけを見ており、属国側の脅威状況は見ていない。

### 属国の奪い方

属国の統治者を脅して、宗主国を無視して、侵略側に貢がせる。
属国内で宗主国と侵略国のスパイ等が暗闘を繰り広げる。

**未実装**（次フェーズ）。`docs/plan/military-organization-and-vassalage.md` の「今後の課題」にある「Nobility 拡張のルーラー intrigue/personality と affinities を使った属国の乗っ取り」がこれに対応する。

## 為政者以外のNPC

為政者のSkills, Personalityなど
docs/plan/characters.md

### 将軍・武官・地方領主

**実装済み**。以下は当初「実装すべきか」を相談していたメモだが、`docs/plan/char.md` に設計・実装内容をまとめたのでそちらを参照。要点だけ残す:

- 属国の防衛・辺境の防衛・辺境伯・敵国への侵攻 → 前線州にのみ領主を生成する `provinceLordGenerator.ts`。称号は一律「辺境伯」ではなく `Province.formName`（County/Margrave/Barony/...）から性別変化して解決するので、州ごとに異なる爵位名になる。
- 貴族の称号・姓の準備 → 称号は上記で対応。姓（家系名）は未実装のまま持ち越し。
- 各軍団に武官が能力（槍・剣・弓・騎馬・カリスマ）で戦闘力にプラス補正 → 新しいスキルは追加せず、既存の `martial` スキルと `MilitaryRegiment.commanderId` で表現。`officerAssignment.ts` が「たまにふらりと」を確率的な配属（35%）として実装し、`battle-resolution.ts` の実戦闘解決に+50%までの補正が反映される。AIの侵攻判断（`strategic-planner.ts`）側にはまだ反映されていない — 未解消の課題として残した。

データ永続化について: SQLiteのような別ストレージ層は導入しなかった。`pack.characters` は既存の他の配列（`states`/`burgs`等）と同じ、素のJS配列のままで十分な規模（1マップあたり数十〜数百人程度）。既存の永続化（`src/io/save.ts`/`ldb.ts`、pack全体を1つのBlobにフラット化してIndexedDBへ保存）とも整合する。

## Invasion / 侵攻

Relations history

## 兵の種類

王や皇帝などは首都に近衛兵団を持つ

州兵
国家はProvinces事に兵団を持たせる？
周りが自国のProvincesの兵団は解体されて、敵国の近くなどに再配置される。

都市兵・衛兵は分散しすぎて表示が増えすぎるので不採用

常備軍と半農の兵士
中世ヨーロッパファンタジーなら常備軍は少なそう

小隊・中隊・大隊
師団・旅団
などで再編しやすくする？

**実装済み**（近衛兵団＋州単位の野戦軍への統合、Company/Battalion/Brigade/Divisionの規模呼称）。詳細は `docs/plan/military-organization-and-vassalage.md` の「2. 軍隊編成の集約」を参照。都市兵は上記の通り不採用のまま。

船はどのように配置され、初期の数は何が由来か？

**未回収**（このメモの中では未調査のまま）。次に調べる時は `docs/plan/ship.md` / `docs/plan/shipbuilding.md` を先に確認する。
