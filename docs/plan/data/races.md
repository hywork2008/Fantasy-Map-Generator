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

## ヘッダ仕様（v1）

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
| `population_capacity_multiplier` | 環境収容人口の倍率（0以上） |
| `food_independent`, `temperature_independent` | `true` / `false`。環境耐性は倍率を含む3列すべて指定、またはすべて空欄 |
| `appearance_kind` | 空欄、`demon`、`beastfolk` |
| `horn_animals` | demonの角の動物名。antelope,bison,buffalo,gazelle,goat,ibex,oryx,ram,yak から選択 |
| `animals` | beastfolkの動物名。bear,cat,cattle,deer,dog,fox,goat,hare,horse,lion,otter,raccoon,tiger,wolf から選択 |
| `furry_scale_min`, `furry_scale_max` | beastfolkのみ必須。1〜10の整数、最小 ≤ 最大 |

`<axis>` は `stature`, `build`, `symmetry`, `refinement`, `vitality`, `ornament`。動物リストは `|` 区切りで重複不可。外見kindに対応しない動物・furry列の入力はエラー。

## Half Elfと派生値

Half Elfは `human` と `elf` を親に指定する。親指定時は寿命・外見基準・外見範囲・美的評価の列を空にする。標準寿命・外見基準・美的評価重みは親の小さい値、最大寿命は大きい値、外見範囲は親の基準値の最小〜最大となる。親を調整すれば自動で追随する。生殖・性別・環境耐性・動物外見は継承せず、その行で指定する。

exportは計算結果をすべて展開し、親指定を空にする。再importで同じゲーム数値を復元できるが、親への追随を続ける場合は正本の親列を維持する。誤って派生ルールを消さないよう、export先に正本パスを指定することは禁止している。

## 拡張と互換性

新種族は次のID（現在は15）と新しいキーで行を追加する。既存IDの削除・改名・再割り当ては禁止。Unknown=0、Human=1を含め既存セーブとの対応を守る。新規マップの種族テーブルには自動で追加される。

CSVが管理するのは従来の `races.ts` の `RaceDefinition` 範囲。文化の配置、翻訳、技能・性格バイアス、超自然能力、隷属関係など別モジュールのルールはそれぞれで定義する。新種族を文化として出現させるには文化側の設定も必要。既存セーブに新種族の文化を自動作成するものではない。

既存のセーブ補完仕様を維持する：既知キーの寿命・生殖・環境耐性は現カタログで更新し、外見基準・範囲・美的評価・動物外見は欠けている場合のみ補完する。性別の既存処理も変更しない。

移行時には旧ソースの15種族を数値・任意項目ごと比較して一致を確認。元の手作りCSVのDwarf `sym` は1.2だったが、ソースに合わせて0.7へ訂正した。Unknown、Half Elfの派生指定、性別、外見範囲、動物候補、環境耐性を追加した。
