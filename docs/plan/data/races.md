# 種族CSVの編集・取り込み

`races.csv` が `RaceDefinition` の正本。`src/data/races.generated.json` は検証済みの生成物で、手編集しない。`src/data/races.ts` は生成物を読み込み、既存の種族APIを提供する。生成物もコミットすることで、Viteを使わないシミュレーション用スクリプトからも同じ値を利用できる。

## 操作

```sh
# CSVを編集した後、検証してゲーム用データを生成
npm run races:import

# 別ファイルを検証し、正本CSVとゲーム用データへ取り込む
npm run races:import -- /tmp/adjusted-races.csv

# CSVと生成物の一致を検証（書き込みなし、CI向け）
npm run races:check

# 現在の生成済みソースデータを別CSVへ書き出す
npm run races:export -- /tmp/current-races.csv
```

exportは既存ファイルを上書きしない。引数なしではCSVを標準出力する（リダイレクトには `npm run --silent races:export > /tmp/current-races.csv`）。生成済みデータを出力するため、CSVの未取り込みの編集は含まれない。

`npm run dev` は起動時およびCSV保存時に生成する。検証エラーはViteの画面・ログに表示し、直前の正常な生成物を維持する。`npm run build` / `build:economy` もビルド前に生成する。配布ゲームにCSVの取得通信やパーサーは不要で、オフラインでも利用できる。起動済みマップへの変更はページ再読み込み・セーブ読み込みまたは新規生成で反映する。ゲーム画面でのファイル選択・実行中世界への即時上書きはこの仕組みの対象外。

## ヘッダ仕様（v2）

UTF-8、1行ヘッダ、1種族1レコード。BOM、CRLF、引用符付きセル、セル内の改行とカンマに対応。列と行の順番は変更可能だが、列の削除・追加・重複はエラー。空白だけのレコードは無視し、セルの前後空白は除去する。数式は使わず数値を入力する。小数点は `.`。

| 列 | 意味・制約 |
| --- | --- |
| `id` | 0始まりの連続した固定ID。既存0〜14はキーとの組み合わせを固定。行順はIDに影響しない |
| `key` | 一意な内部キー。英小文字で開始し、英小文字・数字・`_` のみ。表示名の変更とは分離 |
| `name` | 空でない表示名 |
| `hybrid_parent_a`, `hybrid_parent_b` | 両方空、または親のキーを2つ指定。後方参照も可。存在しない親・循環参照はエラー |
| `character_gender` | 空欄＝寿命による既存の性比ルール。`male_dominant` / `female_only` / `balanced` |
| `lifespan_years`, `max_lifespan_years` | 標準寿命と最大寿命（年）。標準は1以上、最大は標準以上 |
| `fertility_start_years`, `fertility_end_years` | 生殖期間の開始・終了年齢。0 ≤ 開始 ≤ 終了 ≤ 最大寿命 |
| `interbirth_years` | 出産間隔（年）。正数。旧CSVの `birth/y` は出生率と紛らわしいため廃止 |
| `litter_mean`, `litter_max` | 一回の出産の平均・最大人数。0 ≤ 平均 ≤ 最大、最大は整数。不妊は両方0 |
| `looks_<axis>` | 外見の基準値（1〜100）。通常種族は6軸すべて必須 |
| `beauty_weight_<axis>` | 同種族の美的評価の重み。負数も可。空欄はその軸を省略。最低1軸必要 |
| `looks_<axis>_min`, `looks_<axis>_max` | 任意の外見生成範囲。軸ごとに両方指定または両方空欄。1 ≤ 最小 ≤ 基準 ≤ 最大 ≤ 100 |
| `population_capacity_multiplier` | 環境収容人口の倍率（0以上）。環境耐性を指定してこの列が空欄の場合は `1` |
| `food_independent`, `temperature_independent` | `true` / `false`。各項目は独立して指定でき、空欄は `false`（倍率も空欄なら `1`） |
| `appearance_kind` | 空欄、`demon`、`beastfolk` |
| `horn_animals` | demonの角の動物名。antelope,bison,buffalo,gazelle,goat,ibex,oryx,ram,yak から選択 |
| `animals` | beastfolkの動物名。bear,cat,cattle,deer,dog,fox,goat,hare,horse,lion,otter,raccoon,tiger,wolf から選択 |
| `furry_scale_min`, `furry_scale_max` | beastfolkのみ必須。1〜10の整数、最小 ≤ 最大 |

`<axis>` は `stature`, `build`, `symmetry`, `refinement`, `vitality`, `ornament`。動物リストは `|` 区切りで重複不可。外見kindに対応しない動物・furry列の入力はエラー。

## Half Elfと派生値

Half Elfは `human` と `elf` を親に指定する。親指定時は寿命・外見基準・外見範囲・美的評価の列を空にする。標準寿命・外見基準・美的評価重みは親の小さい値、最大寿命は大きい値、外見範囲は親の基準値の最小〜最大となる。親を調整すれば自動で追随する。生殖・性別・環境耐性・動物外見は継承せず、その行で指定する。

技能・性格補正も親の小さい値（未指定軸は0）を継承する。超自然能力はarcaneCapのみ大きい値、arcaneMedian・arcaneInclination・durabilityは小さい値を継承する。これらの派生列も親指定時は空にする。先祖返り・社会・経済・人名は継承しない。

exportは親指定と派生ルールを保持する。親を持つ種族の派生列は空欄で書き出し、再import時に計算する。v1の数値展開方式から変更し、往復変換で親への追随や技能生成時の親の範囲計算が失われないようにした。export先に正本パスを指定することは禁止している。

## 拡張と互換性

新種族は次のID（現在は15）と新しいキーで行を追加する。既存IDの削除・改名・再割り当ては禁止。Unknown=0、Human=1を含め既存セーブとの対応を守る。新規マップの種族テーブルには自動で追加される。

CSVは別モジュールの種族別パラメーターも管理する（下表）。文化の配置・翻訳、共通の計算式や年齢閾値・技能標準偏差はコードで管理する。新種族を文化として出現させるには文化側の設定も必要。既存セーブに新種族の文化を自動作成するものではない。

既存のセーブ補完仕様を維持する：既知キーの寿命・生殖・環境耐性・超自然能力は現カタログで更新し、外見基準・範囲・美的評価・動物外見は欠けている場合のみ補完する。性別の既存処理も変更しない。

移行時には旧ソースの15種族を数値・任意項目ごと比較して一致を確認。元の手作りCSVのDwarf `sym` は1.2だったが、ソースに合わせて0.7へ訂正した。Unknown、Half Elfの派生指定、性別、外見範囲、動物候補、環境耐性を追加した。

## 別モジュールから移したパラメーター

確率は0〜1で指定する（0.006 = 0.6%）。先祖返り・隷属など、明記された相互依存のある機能グループは全必須項目を揃える。環境耐性と上下水道補正は各列を独立して指定でき、空欄は中立値になる。Humanの先祖返りは互換定数が参照するためプロフィールを必須とし、無効化は確率0にする。

| 列 | 意味・制約 | 元の利用箇所 |
| --- | --- | --- |
| `arcane_cap`, `arcane_median`, `arcane_inclination`, `durability` | 必須（親派生時は空）。上限は0〜100の整数、中央値は0〜上限、使用傾向は0〜1、耐久倍率は正数 | `raceSupernatural.ts` |
| `infernal_atavism_chance` | 先祖返りの発生確率 | `arcane.ts` |
| `infernal_atavism_blue_blood_chance` | 先祖返りした人物がblueBloodになる条件付き確率。残りはpactHouse | `arcane.ts` |
| `infernal_atavism_arcane_cap`, `infernal_atavism_arcane_median`, `infernal_atavism_arcane_inclination`, `infernal_atavism_durability` | 先祖返り用プロフィール。制約は通常の超自然能力と同じ | `arcane.ts`, `personFactory.ts` |
| `skill_bias_<skill>` | 技能平均への加算補正（−100〜100）。空欄は補正なし | `raceSkillBias.ts`, `skillGeneration.ts` |
| `personality_bias_<trait>` | 性格平均への加算補正（−100〜100）。空欄は補正なし | `racePersonalityBias.ts` |
| `civic_stance` | 必須。diplomatic / distant / enemy_colony / bound | `raceCivicStance.ts` |
| `mixed_polity_chance` | 必須。混住政体の確率。diplomatic以外は0 | `raceCivicStance.ts` |
| `bound_servitor_key`, `bound_servitor_roles`, `bound_servitor_chance` | **主人の行**で指定。隷属種族キー、役割のパイプ区切りリスト、出現確率。対象はboundで主人は1種族のみ。主人自身はbound不可 | `raceBoundServitors.ts` |
| `hoard_sp_per_adult_year` | 成人後1年あたりの初期財産蓄積（SP、0以上）。空欄は追加なし | `raceWealthBias.ts` |
| `water_lifting_ceiling_bonus`, `municipal_sanitation_ceiling_bonus`, `water_administration_bonus` | 上下水道の技術上限・行政補正（0〜1）。各列は独立し、空欄は `0` | `raceWaterTechBias.ts` |
| `water_urgency_threshold_multiplier`, `water_construction_speed_multiplier` | 上下水道の着工緊急度閾値・建設速度の正の倍率。各列は独立し、空欄は `1` | `raceWaterTechBias.ts` |
| `person_name_primary`, `person_name_alternate` | 人名圏ID（0以上の整数）またはnull（地名からMarkov生成）。primary空欄はnull、alternate空欄は代替なし | `racePersonNameConfig.ts` |
| `continuous_monogamy` | 長命でも継続的単婚制を使う例外。空欄はfalse、true/falseを指定。現在Dwarfのみtrue | `raceAge.ts` |
| `carnivorous_animals` | Beastfolk外見の動物候補のうち肉食扱いする動物のパイプ区切りリスト。animalsの部分集合 | `races.ts` |

技能軸: artistry / diplomacy / engineering / geography / intrigue / learning / martial / prowess / stewardship。

性格軸: boldness / compassion / greed / honor / rationality / sociability / vengefulness / zeal / energy / piety / guile / confidence。

`HUMAN_INFERNAL_ATAVISM` と `HUMAN_INFERNAL_ATAVISM_CHANCE` は互換のため引き続きexportするが、値はHuman行から取得する。他種族にも先祖返りグループを設定でき、人物生成は該当種族の確率とプロフィールを使用する。Half Elfの隷属出現率はElf行の `bound_servitor_chance` であり、Humanの先祖返り確率とは独立した調整項目（初期値は両方0.006）。

技能・性格・先祖返りは今後の人物生成、人名は今後の文化への既定値適用、蓄財は初期財産生成に反映する。上下水道補正・外交姿勢などは従来の参照タイミングで反映する。既存人物・文化の値を一律に上書きしない。

## 種族間の関係テーブル

`races-relations.csv` は `appearance.ts` の非対称な美的評価可読性を管理する。1行が1つの有向関係。列は `observer_key,target_key,readability`。キーは正本の種族を参照し、readabilityは0〜1。行を省略した組み合わせは既存の可読性0の扱いとなる。同種族の評価は別の計算なのでこの表には入力しない。重複ペア・未知キー・範囲外はエラー。

```sh
# 両CSVを検証・生成、または一致チェック
npm run races:import
npm run races:check

# 関係テーブルだけを外部CSVから取り込む／生成済みデータから書き出す
npm run races:relations:import -- /tmp/relations.csv
npm run races:relations:export -- /tmp/current-relations.csv
```

`src/extensions/characters/data/raceRelations.generated.json` も生成物としてコミットする。開発サーバーは両CSVを監視する。片方に検証エラーがあればどちらの生成物も更新しない。v1のCSVには追加列がないため、そのままimportはできない。新しい正本またはexportしたCSVを編集の起点にする。


## 生成物の分離

CSVは一元管理するが、生成先は所有者ごとに分ける。

- コア: `src/data/races.generated.json`
- Characters: `src/extensions/characters/data/races.generated.json`
- Charactersの種族間評価: `src/extensions/characters/data/raceRelations.generated.json`
- Economy: `src/extensions/economy/data/races.generated.json`

全生成物をコミットする。パーサー・統合スキーマ・検証は `scripts/races/` にあり、ゲームには含めない。既存のimport/exportコマンドは同じCSVを扱う。exportは上記の種族プロフィールをキーで結合し、元の単一CSVと親指定を復元する。

拡張専用のパラメーターは各拡張内から読み、共有の種族情報は `ExtensionAPI.races` を経由する。分離方針とチェック方法は [extension-dependencies.md](../extension-dependencies.md) の第4節を参照。
