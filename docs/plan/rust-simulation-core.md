# 地図生成とシミュレーションの Rust 化 設計・計画

## 状態

- 2026-10-28 設計。未着手。
- 前提: [シミュレーション・コア分離](simulation-core-separation.md) の S0〜S6 が完了している。コアは DOM なしで Node 上で動き、ブラウザ・Node・jsdom の3環境で golden ハッシュが一致する。本書はその分離済みのコアを、TypeScript から Rust へ段階的に移す計画である。

## 1. 目的

| 目的 | 現状 | 目標 |
| --- | --- | --- |
| 長期実行の速度 | World 固定入力の48か月で約45分、96か月で約7.5時間（2026-10-27、Node、ヒープ上限1.5GB）。時間に比例せず遅くなる | 96か月を48か月の2倍程度の時間で終える。目安は R0 の計測後に決める |
| メモリ | 16GB の Mac mini でヒープ1.5GBに絞って1本ずつ実行している（`Map` 762か所・`Set` 444か所など、オブジェクト中心の状態） | 同じ World を1GB未満で保持し、計測用の機械で複数本を並べられる |
| 並列化 | 単一スレッド。月次の `production:burgLoop` などは市場・都市ごとに独立した計算が多い | セル・市場単位の独立な計算をスレッドに分ける。結果は並列度によらず同一 |
| ヘッドレスの計測 | `node --import tsx scripts/audit*.mts` | ネイティブの CLI。WASM 版とビット単位で同じ結果 |

### 非目的

- 一括の書き直し。対象は TS で約20万行（`src/generators` 5.6万行、`src/extensions` 13.5万行、うち economy 10.3万行）あり、経済の校正（親計画 E1）が毎日のように定数とロジックを変えている。止めて書き直す期間は取れない。
- 結果を変えること。移行の各段階で、同じ入力から**ビット単位で同じワールド**が出ることを保証する（§6）。
- UI・描画・CE・RE・BV・DE の Rust 化。対象は地図生成（FMG 本体）とシミュレーションのコアに限る。
- 第三者の動的拡張（`src/extensions/dynamicLoader.ts`）の廃止。JS の拡張は TS のシステムとして最後まで登録できる（§4.4）。

## 2. 現状の調査結果

### 2.1 そのまま土台にできるもの

| 仕組み | 場所 | Rust 化での役割 |
| --- | --- | --- |
| `SimulationHost`・Ports | `src/simulation/host.ts`、`ports.ts` | ブラウザと Node の唯一の入口。Rust のコアもこの裏に置く |
| システム登録の契約（`id`・`phase`・`reads`/`writes` トピック・`after`/`before`・`cadence`） | `src/generators/simulationSystem.ts` | **移植の単位**。1システムずつ TS → Rust に置き換える |
| `TransactionWriter` とトピック | `src/runtime/worldRuntime.ts`、`worldTopics.ts` | Rust のシステムも同じトピックを `markChanged` する |
| 決定的な数学関数（FreeBSD msun / fdlibm の移植） | `src/simulation/deterministicMath.ts` | Rust に同じアルゴリズムを移植し、両者の一致を全数近い乱数入力で検査する |
| シミュレーション乱数の一本化（時間軸シード） | `src/runtime/simulationRng.ts`、`simulationRandom.ts` | 乱数列を Rust で再現する |
| golden ハッシュ（区画ごとの digest） | `src/simulation/goldenHash.ts`、`__golden__/` | 置き換え前後の一致検査。ずれた区画が分かる |
| 列（SoA）の状態 | `simulationContext.cells`（`simulationCellColumns.ts`）、economy の `getSliceFloat32Column` | Rust の線形メモリに置く列の候補 |
| tick プロファイラ | `src/generators/tickProfiler.ts` | 移植対象の選定（§5 R0）と効果の計測 |

### 2.2 重い処理（[Advance Year パフォーマンス調査](../analytics/advance-year-performance.md)、4,566セル・711都市、P0/P1 前の内訳）

| ラベル | 1年の合計 | 周期 |
| --- | ---: | --- |
| `production:settle`（うち `playerCommerce` 8.1秒、`produce` 6.5秒、`burgLoop` 4.9秒） | 14.7秒 | 月次 |
| `core:manpower` | 4.0秒 | 日次 |
| `core:militaryFallback` | 2.6秒 | 日次 |
| `production:finishCycle` | 1.5秒 | 月次 |

日次の retail は P0/P1 で年約20msまで下がった。現在の World 固定入力（`docs/analytics/inputs/salt-s0-aligned-20261023/world-102.fmg`）の内訳は未計測で、R0 で取り直す。

### 2.3 Rust 化を難しくする点

| 点 | 内容 | 対策 |
| --- | --- | --- |
| JS の数値の意味 | 全ての数は f64。`Float32Array` への代入で f32 に丸め、読むと f64 に戻る。`Math.round` は .5 を +∞ 側へ丸める。`\|0`・`>>>` は32ビットの折り返し。`%` は被除数の符号 | Rust は f64 で計算し、列への保存だけ `as f32`（最近接偶数丸め。`Math.fround` と同じ）。`js_round`・`to_int32` などの関数を `fmg-sim-js` クレートにまとめ、直接の `.round()` を lint で禁止する |
| 反復順序 | `Map`/`Set` は挿入順。オブジェクトのキーは整数キーが昇順で先、残りは挿入順。`Array.prototype.sort` は安定ソート | Rust では `HashMap` を使わず、`IndexMap` か id 添字の `Vec` を使う。ソートは `sort_by`（安定）に限り、`sort_unstable` を lint で禁止する |
| 浮動小数の和の順序 | 和の順序が変わると下位ビットが変わる | 並列化しても縮約は id 順の固定木で行う（§4.5） |
| 状態の形 | economy の状態の多くはオブジェクトと `Map` の入れ子。`pack.burgs` などは JS オブジェクトの配列 | エンティティ表（id 添字の SoA）に移す。移すまでは TS 側が持ち、Rust のシステムは境界で表に詰めて受け取る（§4.3） |
| 校正の速さ | 定数とロジックの変更が多い（E1 だけで §7.1〜§7.59） | 校正中のシステムは移さない。移す時期は「直近の変更が少ない」ことで決める（§5.1） |
| JSON・保存形式 | `.fmg` は ZIP の中に JSON と型付き配列のバイナリ。数値の文字列化は JS の規則 | 保存・読み込みは TS に残す（§4.6）。ネイティブ CLI 用の読み込みは R5 で追加する |

## 3. 方式の選択

| 方式 | 内容 | 判定 |
| --- | --- | --- |
| A. 一括書き直し | Rust で全体を作り直してから切り替える | 採らない。20万行を、校正を止めずに一致させる方法がない |
| B. ネイティブのみ（napi） | Node のアドオンとして呼ぶ | 採らない。ブラウザで使えず、ブラウザと Node の結果が分かれる |
| **C. 1つのクレートを WASM とネイティブにビルドし、システム単位で置き換える** | ブラウザ・Node は WASM、計測用 CLI はネイティブ。TS と Rust のシステムが同じスケジューラで混在する | **採る** |

C の要点:

1. **置き換えの単位はシステム（またはシステム内の純粋な計算）**。登録の契約（`reads`/`writes`/順序）は変えない。
2. **同じソースから WASM とネイティブを作る**。両者の一致は、決定的な数学関数とスレッドによらない縮約で保証する。
3. **TS 版を残したまま並走させて比べる**（§6.2）。一致を確認できたシステムから TS 版を消す。

## 4. 目標アーキテクチャ

```
┌──────────────── Browser / Node (TS) ────────────────┐
│ UI・描画・CE/RE/BV/DE（変更なし）                       │
│ SimulationHost ── Ports                              │
│   timeEngine のスケジューラ（当面 TS）                   │
│     ├─ TS システム（未移植・動的拡張）                    │
│     └─ RustSystem アダプタ ──┐                          │
│ 保存・読み込み（worldArchive.ts）                        │
└───────────────────────────┼─────────────────────────┘
                            │ wasm-bindgen（列はゼロコピーの view）
┌───────────────────────────▼─────────────────────────┐
│ crates/fmg-sim（Rust）                                │
│   store:   列ストア・エンティティ表・トピックの変更記録        │
│   math:    決定的な数学関数・JS の数値の意味                  │
│   rng:     シミュレーション乱数（alea と時間軸シード）           │
│   systems: 移植済みのシステム                              │
│   gen:     地図生成のカーネル（§4.7）                       │
└─────────────────────────────────────────────────────┘
          │ 同じソースのネイティブビルド
┌─────────▼──────────┐
│ crates/fmg-sim-cli │ ヘッドレス実行・計測（R5 以降）
└────────────────────┘
```

### 4.1 リポジトリ構成

```
crates/
  fmg-sim/          コア（no_std ではないが、I/O なし）
  fmg-sim-js/       JS の数値の意味・決定的な数学関数（fmg-sim から使う）
  fmg-sim-wasm/     wasm-bindgen の境界。TS 向けの型は自動生成
  fmg-sim-cli/      ネイティブの CLI（R5）
src/simulation/rust/
  loadFmgSim.ts     WASM の読み込み（ブラウザは Vite、Node は fs）
  rustSystem.ts     Rust のシステムを SimulationSystem として登録するアダプタ
  columnBridge.ts   列の受け渡し（§4.2）
```

- ビルドは `cargo` と `wasm-bindgen-cli`。`npm run build:wasm` を `dev`・`build`・`vitest` の前に走らせる。生成物（`.wasm` と型）は Git 管理外とする。
- Rust を入れていない環境のために、ビルド済みの `.wasm` を取得する手段を R1 で決める（CI の成果物など）。

### 4.2 列の受け渡し（ゼロコピー）

- 移植済みのシステムが読み書きする列は、**Rust の線形メモリが持ち主**になる。TS 側の `Float32Array` は WASM メモリの view にする。
- WASM のメモリが伸びると既存の view が無効になる。TS は列を変数に保持せず、毎回 `columnBridge.get("husbandryMonthlyWorkDays")` で取り直す。既存の `getSliceFloat32Column` はこの取り直しの形になっているので、economy の列はそのまま載せ替えられる。
- 列の名前・型・長さは Rust 側の1つの表で宣言し、TS の型と archive の記述子を生成する。

### 4.3 エンティティ（都市・市場・商品・群れ）

- id を添字とする SoA の表にする（`BurgTable { population: Vec<f32>, market: Vec<u32>, … }`）。可変長のもの（市場の在庫・注文）は CSR（オフセット列＋値列）で持つ。
- 移行期間中、持ち主が TS のエンティティを Rust のシステムが読む時は、システムの実行前に TS が表へ詰める（境界のコピー）。コピーの費用が計算の節約を上回るシステムは、エンティティの持ち主を Rust に移すまで移植しない。
- 持ち主を Rust に移したエンティティは、TS からは読み取り専用のアクセサ（`BurgView`）で見る。UI はこのアクセサで描画する。

### 4.4 スケジューラとシステムの混在

- R1〜R4 の間、スケジューラは TS の `timeEngine` のままにする。Rust のシステムは `RustSystem` アダプタが `SimulationSystem` として登録する。`reads`/`writes`/`after`/`before` は Rust 側の宣言から生成する。
- `TransactionWriter.markChanged` は、Rust が返した変更トピックの一覧を TS がそのまま渡す。
- 乱数: システムごとの乱数ストリーム（`SimulationStepContext.rng`）の状態を Rust に渡し、実行後に戻す。同じ列を消費することを §6 の検査で確かめる。
- R5 でスケジューラを Rust に移し、TS のシステム（動的拡張を含む）は Rust から呼び戻す形に反転する。

### 4.5 並列化

- 対象は「セル・市場・都市ごとに独立した計算」に限る。共有状態への書き込みは、スレッドごとの一時バッファに貯め、id 順に適用する。
- 和・最大などの縮約は、要素数だけで決まる固定の木で行い、スレッド数によらず同じ値にする。
- ネイティブは `rayon`。WASM のスレッドは `SharedArrayBuffer`（COOP/COEP ヘッダ）が要るため、ブラウザでは R4 まで単一スレッドとし、並列度は設定で切り替える。結果は単一スレッドと一致する。

### 4.6 保存・読み込み

- `.fmg` の書き出しと読み込み（`src/runtime/worldArchive.ts`）は TS に残す。Rust の列は、archive の型付き配列の記述子として同じバイナリで保存する。形式は変えない。
- ネイティブ CLI 用に、`.fmg` を読む Rust 実装を R5 で追加する。正しさは「TS で読んだ状態」と「Rust で読んだ状態」の golden ハッシュの一致で確かめる。保存は R5 でも TS（Node）に任せてよい。

### 4.7 地図生成

- 生成（`src/generators` の voronoi・高さ・気候・河川・ルート・都市の配置など）は時間進行と別のトラック G とする。生成は描画と絡んでいるため（[分離計画](simulation-core-separation.md) の非目的）、先に「生成の結果だけを返す純粋な関数」を TS 側で切り出し、その関数を Rust に置き換える。
- 候補（R0 で計測して決める）: Delaunay/Voronoi（`delaunator` 相当）、高さの侵食・河川の流量（`riverHydrology.ts`、`fluidSolver.ts`）、陸路のグラフ探索（`worldDryLandRouteGraph.ts` など）、河岸の配置（[河岸配置の計算量削減](fmg-settlement-placement-performance.md)）。
- 橋の角度の判定は `src/utils/bridgeSkewPolicy.ts` に一本化されている。ルート生成を移す時は、この判定も Rust の1か所に移し、TS からは同じ関数を呼ぶ（判定を2か所に置かない）。

## 5. 段階

| 段階 | 内容 | 完了条件 |
| --- | --- | --- |
| **R0 計測と判断** | World 固定入力で、1年分の tick 内訳（`tickProfiler`）と、ヒープの推移を月ごとに取る。96か月で遅くなる原因が「計算量」か「GC・メモリの増加」かを分ける。後者なら、まず TS で直す（Rust 化の理由にしない） | 計測記録（`docs/analytics/`）。移植候補の上位5つと、それぞれの「計算／境界のコピー」の見積もり |
| **R1 基盤** | クレートの構成、WASM の読み込み（ブラウザ・Node・vitest）、`columnBridge`、決定的な数学関数と JS の数値の意味の移植、乱数の移植 | 数学関数が TS 版と 10⁷ 個の乱数入力でビット一致。乱数列が一致。空の Rust システムを登録しても golden ハッシュが変わらない |
| **R2 最初のシステム** | 列だけを読み書きする、校正の落ち着いた計算を1つ移す。候補: 牧草の成長・飼料台帳（`livestockFeed`）、人口動態（`core:demographics`）、`core:manpower` | golden ハッシュが 0・30・365日で一致。そのシステムの時間が TS 版の1/3以下。**この結果で R3 以降に進むかを決める** |
| **R3 年次・月次の重い計算** | 職業の割り当て（`ruralOccupationAllocation`）、農地の土地利用（`agriculturalLandUse`）、`production:produce`/`burgLoop`。都市・市場の表を導入する | 各システムで golden 一致。World 1年の時間とピークメモリの改善を記録 |
| **R4 並列化** | ネイティブと Node の WASM で、独立な計算をスレッドに分ける | 並列度1・4・8で golden ハッシュが一致 |
| **R5 Rust 主体** | スケジューラと economy の状態の持ち主を Rust に移す。ネイティブ CLI（`.fmg` の読み込み、月数、観測の出力） | CLI と WASM、ブラウザの golden 一致。`scripts/audit*.mts` の主要なものを CLI の観測に移す |
| **G1〜G3 地図生成** | §4.7。R1 の基盤の上で、R2 以降と並行してよい | 同じシードから同じ地図（`pack` の golden ハッシュ一致） |
| **R6 TS 版の撤去** | 一致が続いた TS のシステムを消す | 並走の検査（§6.2）を外しても golden テストが通る |

### 5.1 移す順番の決め方

各候補を次で採点し、R0 の計測と合わせて順番を決める。

1. 時間の割合（R0 の内訳）
2. 境界のコピーの少なさ（列だけを読む計算が先）
3. 校正の落ち着き（直近1か月の変更回数が少ないもの）。E1 で校正中の家畜・飼料・職業の割り当ては、校正の区切りまで後回しにしてよい
4. 決定性の扱いやすさ（乱数・`Map` の反復順に依存しないもの）

### 5.2 校正中のシステムを移した後の運用

- Rust に移したシステムの定数は、Rust 側の1つの表（`crates/fmg-sim/src/policy/*.rs`）に置き、出典のコメントも一緒に移す。TS に同じ定数を残さない。
- 校正の作業手順（計測スクリプト → 記録 → 計画書）は変えない。計測スクリプトは、Rust のシステムが公開する観測用の読み取り関数を使う。`setTickStepObserver` のシステム境界での呼び出しは Rust のシステムでも維持する。

## 6. 正しさの保証

### 6.1 golden テスト

- 既存の golden ハッシュ（`goldenParity.node.test.ts` など）を、Rust のシステムを有効にした構成でも走らせる。0・30・365日、Province と World の固定入力。
- 不一致の時は、区画ごとの digest でずれた区画を示す（既存の仕組み）。

### 6.2 並走検査（shadow 実行）

- 移植中のシステムは、TS 版と Rust 版の両方を同じ入力で実行し、書き込んだ列・エンティティを比べるモードを持つ（`FMG_SIM_SHADOW=<system id>`）。最初にずれた要素の id・値・ビット差を出す。
- 一致したら Rust 版の結果を採用する。TS 版は §5 R6 まで残す。

### 6.3 一致させない場合

- ビット一致を諦めて結果を変える場合（例: 和の順序を並列向けに変える）は、その変更を**TS 版で先に行い**、golden を更新してから移植する。Rust 化と挙動の変更を同じ段階で混ぜない。

## 7. 性能・メモリの目標と計測

- 計測は R0 と同じ条件（World 固定入力、`fmg-caravan-raids=off`）で行い、時間とピーク RSS を記録する。
- R2 で、移したシステムが TS 版の1/3以下の時間にならなければ、R3 以降に進まない。境界のコピーが原因なら、エンティティの持ち主の移し方を見直してから再判断する。
- 長期実行の時間とメモリの目標は、R0 の結果から決めて本書に追記する。

## 8. リスクと対策

| リスク | 対策 |
| --- | --- |
| 校正の作業と移植が衝突し、二重保守になる | 校正中のシステムは移さない（§5.1）。移したシステムの TS 版は並走検査のためだけに残し、変更は Rust 版に行う |
| JS と Rust の数値の意味の違いで結果がずれる | `fmg-sim-js` に意味を集め、lint で直接の `.round()`・`sort_unstable`・`HashMap` の反復を禁止する。並走検査でずれた要素を特定する |
| WASM メモリの伸長で TS の view が無効になる | 列を保持しない（§4.2）。開発ビルドでは、古い view へのアクセスを検出する |
| ビルドの複雑化（Rust ツールチェーン、Vite・vitest・Service Worker） | R1 で、Rust 無しでも開発できる手段（ビルド済み WASM の取得）を用意する。`.wasm` は Service Worker のキャッシュ対象に加える |
| 遅さの原因が計算ではなくメモリの問題だった | R0 で先に分ける。メモリの問題は TS で直し、Rust 化の判断材料にしない |
| デバッグのしにくさ | ネイティブで同じシステムを単体実行できるようにし、Rust 側に単体テストを置く。shadow 実行で TS との差分を出す |
| 第三者の動的拡張 | TS のシステムとして登録を続けられる（§4.4）。R5 以降も Rust から呼び戻す |

## 9. 未決事項

- 長期実行の時間とメモリの具体的な目標（R0 の後）。
- WASM のスレッドを使うためのヘッダ（COOP/COEP）を、FMG の配信形態（Service Worker、静的ホスティング）で付けられるか。
- R5 でスケジューラを移す時、`isBulkAdvance`・Fast-Forward の倍率・歴史モードのフィルタ（`SimulationSystemFilter`）をどう Rust に渡すか。
- 地図生成のうち、描画と絡む部分（`emblem`、ラベル配置など）の切り出しの範囲。

## 10. 次の作業

**R0: World 固定入力で、1年分の tick 内訳と月ごとのヒープの推移を取り、96か月で遅くなる原因が計算量か、GC・メモリの増加かを分ける。** 計測は計測用の Mac mini で、1本ずつ行う。
