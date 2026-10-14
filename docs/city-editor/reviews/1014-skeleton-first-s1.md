# 骨格先行生成 Phase S1: 骨格と検証（メッシュなし）

実施日: 2026-10-14
対象: [骨格先行生成 設計書](../plan/skeleton-first-generation.md) §7 Phase S1
前段: [Phase S0 記録](1014-skeleton-first-s0.md)

## 1. 実装したもの

K1〜K5 を `generators/generation/skeleton/` に実装した。現行の生成（mesh-first）には接続していない。生成パネルからはまだ選べない（Phase S3）。

| ファイル | 内容 |
| --- | --- |
| `contracts.ts` | 骨格の入出力と不採用理由の型 |
| `vector.ts` | 光線と輪の交点、海岸線の閉合、交差の列挙、川の帯 |
| `inputs.ts` | K1：硬い水域、橋を架けられる川、道路 |
| `cityCore.ts` | K2：都市核と市域（核の周りの星形多角形） |
| `wallShapes.ts` | K3：外壁の形、目標面積への当てはめ、水門 |
| `crossings.ts` | K4：門、橋、合流の回避 |
| `checkSkeleton.ts` | K5：メッシュを作る前の判定 |
| `pipeline.ts` | K1〜K5 の順序と骨格の再試行（最大16回） |
| `skeleton.test.ts` | K1〜K5 のテスト11件 |

関連する変更:

- `types/generation.ts`：`generationMethod`、`wallShape`、`wallSides` を追加した（任意項目）。現行の生成は読まない。
- `generators/site/siteInput.ts`：`skeletonRiverCourses` を追加した。理由は §3.1。
- `services/io/shareRequest.ts`：`cityEditorDocument` と `cityEditorSettings` を `housingReport.ts` から移した。`housingReport.ts` は FMG 本体（`simulationContext`）に依存するため、CLIから読み込めなかった。旧位置からは再exportしており、挙動は変えていない。
- `services/analysis/skeletonLab.ts`：骨格の実行と検査用SVG。却下された場合は最後の試行を描く。
- `scripts/city-editor/skeleton/skeletonLab.ts`：S0 と同じ比較セットで K1〜K5 を実行するCLI。
- `scripts/city-editor/skeleton/cases.ts`：単独生成の条件。S0 の基準スクリプトと共有する。

外壁の形は organic、round、oval、square、polygon の5種である（`bastioned` は S4）。いずれも核から見て星形なので、市域・外壁・水域との関係を光線（各方向の半径）で扱える。多角形の和・差の演算ライブラリは不要だった。

## 2. 結果

比較対象は S0 と同じである。単独生成は12条件 × 12 seed、FMG連携は Triviers の層別96都市。骨格の時間は K2〜K5 の合計（`planMs`）。K1 の入力の正規化は中央値0.5 msで、別に計測した。

### 2.1 単独生成

| 条件 | mesh-first 失敗 | 骨格 失敗 | 骨格の再試行あり | 骨格 平均 ms | 最大 ms | 落とした道路 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| small-voronoi 既定 | 0 | 0 | 0 | 6.9 | 19.6 | 0 |
| small-voronoi 川なし | 0 | 0 | 0 | 2.8 | 4.6 | 0 |
| small-voronoi 川2本 | 0 | 0 | 0 | 12.4 | 27.3 | 0 |
| small-voronoi 湾 | 0 | 0 | 0 | 3.7 | 5.7 | 0 |
| small-voronoi 岬 | 0 | 2 | 4 | 14.5 | 69.8 | 3 |
| small-voronoi ランダム | 1 | 1 | 1 | 5.7 | 46.8 | 1 |
| tiny-evolution 既定 | 0 | 0 | 0 | 3.0 | 12.4 | 0 |
| tiny-evolution 川なし | 0 | 0 | 0 | 1.2 | 2.0 | 0 |
| tiny-evolution 川2本 | 0 | 0 | 0 | 8.3 | 23.1 | 0 |
| tiny-evolution 湾 | 0 | 0 | 1 | 2.2 | 6.6 | 0 |
| tiny-evolution 岬 | 4 | 1 | 4 | 7.1 | 40.7 | 14 |
| tiny-evolution ランダム | 0 | 2 | 2 | 3.6 | 31.2 | 3 |

- 最終失敗は mesh-first 5都市、骨格 6都市。両方で失敗したのは2都市。骨格だけが失敗したのは4都市、mesh-first だけが失敗したのは3都市（すべて tiny 岬）。
- 骨格の所要時間は中央値2.7 ms、p95 23 ms、最大70 ms。同じ条件の mesh-first の生成全体は中央値1,553 ms。
  - ただし骨格にはメッシュの生成と文書への反映が含まれない。比較できるのは「不採用を判定するまでの費用」である。
  - mesh-first では生成時間の19%が不採用になった試行に費やされていた（S0）。骨格では、この判定が数 ms で済む。
- 骨格の不採用理由（全試行）: `too-few-external-roads` 54、`bridge-skew` 53、`gate-unreachable-inside` 2、`wall-river-parallel` 1。mesh-first で最多だった壁と川の取り合いは、骨格ではほぼ生じない。
- 「落とした道路」は、門を置ける場所が無かった合成道路の数である（§3.4）。岬に集中している。

### 2.2 FMG連携（96都市）

- 95都市が成功し、93都市は1回目で成功した。失敗は29 Pueblela（`core-in-water`）の1都市。
- 所要時間は中央値1.1 ms、p95 20 ms、最大341 ms。
- 外壁ありは62都市。橋を架けられる川が残った都市は17。水門を持つ都市は0、骨格上の橋を持つ都市は4。
  - Triviers の川は幅130〜6,000 mと町の規模に比べて広い。そのため多くの川は「硬い水域」（§3.2）として扱われ、壁で横切る川は現れなかった。**FMG連携で川を貫く城壁の検証は、この比較セットでは行えていない。**

## 3. 設計からの変更・追加

実装中に、設計書に無い次の扱いを追加した。設計書に反映する。

### 3.1 FMG の川の取り込み

`fixedCrossings` の schema v2 以上では、mesh-first は測量済みの岸を直接使う。そのため `siteToGeography` は川を `geo.rivers` から除いている（consumed）。骨格は川の流路の中心線を必要とするので、`skeletonRiverCourses` で取り出す。

FMG の `widthsMeters` は地図に描くための誇張された幅である。そこで実際の幅は、測量済みの岸の輪（`fixedCrossings.rivers[].rings`）に、流路から直角に光線を当てて測る。値は75パーセンタイルとし、描画幅の1.2倍を上限とする。

### 3.2 広い川は硬い水域

時代の技術で橋を架けられない川、または幅が都市半径以上の川は、海と同じ「硬い水域」とする。測量済みの岸の輪があればそれを使う。町はその片岸に収まる。mesh-first の `withWideRiverOffCore` と同じ基準である。

FMG の固定道路が FMG の固定橋でその川を渡る場合は、道路を橋の前後でつなげたまま扱う。

### 3.3 町の縁を流れる川

流路が核から都市半径の半分以上離れている川は、町を貫かず縁を流れる川とみなす。市域と外壁は、硬い水域と同様にその川の手前で止める。外壁の頂点は、川から直角方向にも離隔が取れるまで光線に沿って内側に寄せる。

これをしないと、外壁が川に沿って重なって走った（Obermerstein など）。

### 3.4 合成道路の扱い

次はいずれも合成道路（FMG の固定道路でないもの）にだけ適用する。FMG の道路の経路は入力として変えない。

- 道路の端が窓の縁に届いていなければ、乾いた陸の上で窓の縁まで延ばす（mesh-first の `farNodeFor` に相当）。
- 道路の外側が海に入る場合は、門から乾いた陸の上を窓の縁へ向け直す（向きの変更は最大75°）。
- 門が川や水門に近すぎるとき、または外側が水のときは、城壁に沿って門をずらす。ずらせる場所が無ければ、その道路は作らず落とす（`dropped`）。mesh-first も海側の門を減らしている。外部道路の本数の下限は引き続き K5 で判定する。
- 城内の道は、核から門まで直線で引く。

### 3.5 橋

- 道路と川の交差が斜めなら、元の交差点から川に沿って3区画以内で候補地点を探す。各候補に試しの直線区間を置き、実際に川を横切る点での斜角が最も小さい地点を選ぶ。
- 2本の川の合流点には橋を置かない。試しの区間が別の川に触れる候補は捨てる。
- K5 が判定するのは骨格が描いた部分だけである。FMG の固定道路の城外の経路（橋、浅瀬、船着き場）は FMG 側で検証済みの入力なので、却下の理由にしない。
- FMG の固定道路の橋の斜角は、FMG の固定交差の記録（`normal` と `tangent`）から取る。

### 3.6 水門

- 外壁が川を横切る地点では、川の法線方向の直線区間に置き換える。古い壁の頂点は交差点の周りの箱の中をすべて取り除く。
- 壁に沿って互いの半幅の和より近い交差（2本の河口が並ぶ、網状に分かれた川など）は、1本の区間にまとめる。まとめた区間は個々の流路ではなく、平均の流れの方向に対して直角とする。
- 水門の角度の上限は、橋と同じ時代の上限とする。
- 2本の流路が長さの30%以上にわたって互いの幅の中に入る場合は、1本の川として扱う（網状の川）。

### 3.7 都市核

- 核が水の中にある場合は、1区画以上の離隔が取れる最も近い乾いた点へ移す。探索範囲は都市半径まで。合成の岬では、名目上の中心が海の中に約11 m入ることがある。
- 核の周りの乾いた市域が下限に満たない場合（岬の先端など）は、内陸へ向けて核を移す。

## 4. 残る失敗と既知の制約

| 都市 | 理由 | 内容 |
| --- | --- | --- |
| small 岬 4・7、tiny 岬 4 | `too-few-external-roads` | 細い岬で門を置けず、合成道路を落とした結果、外部道路が下限に届かない |
| small ランダム 3、tiny ランダム 0・3 | `bridge-skew` | 合成の川が鋭く蛇行し、3区画以内に上限内で架けられる地点が無い。small ランダム 3 は mesh-first も失敗 |
| FMG 29 Pueblela | `core-in-water` | 都市半径の範囲に、1区画の離隔が取れる乾いた点が無い。mesh-first は成功しているので、核の探索をさらに見直す必要がある |

その他の制約:

- 骨格の再試行で変わるのは外壁（形と乱数）だけで、核と道路は変わらない。道路に起因する失敗は再試行では直らない。
- `auto` の形は seed だけで決まる。単独生成の各条件は同じ12個の seed を使うため、形の出現数（polygon 49、oval 47、organic 43、square 39、round 13）は seed の偏りを反映したものである。乱数の一様性は別に確認した（5,000 seed で各区間の出現数は976〜1,031）。
- K5 の門の到達性は、半区画間隔のラスタで判定している。半区画より細い陸の帯は見落とす可能性がある。

## 5. 検証

- `npx vitest run src/city-editor/generators/generation/skeleton`：11件すべて成功
- `npx tsc --noEmit`：骨格に関するエラーなし
- `npm run lint:architecture`：CE の層・依存・ブラウザー境界・循環のいずれも clean
- CE 全体のテスト（`npx vitest run city-editor --maxWorkers=4`）：下記 §5.1

### 5.1 CE 全体テストの結果

全体実行（並列4）では10件が失敗した。内訳と確認結果は次のとおり。

- `blockInfill`、`plausibility`、`prestadRegionalSea`、`rarerlandRiverPorts`、`rectifyHexBlocks` の各ファイルの失敗は、1ファイルずつ単独で実行すると全件成功した（`blockInfill` 9件、`plausibility` 14件、`prestadRegionalSea` 4件、`rarerlandRiverPorts` 3件、`rectifyHexBlocks` 4件、`riverEndpoints` 8件）。全体実行では負荷によるタイムアウトと見られる。S0 の記録（Phase 7）にも、並列実行でのみ timeout する既存の試験が記録されている。
- `CityEditorPage.generate.test.ts` は単独で実行しても失敗した（6件以上がタイムアウト）。変更を退避した状態（`siteInput.ts`・`housingReport.ts`・`generation.ts` を戻し、`shareRequest.ts` を外した状態）で `toggles grid lines visibility` 1件を実行したが、540秒以内に結果が出なかった。**この試験が今回の変更以前から遅いのか、今回の変更で遅くなったのかは確認できていない。** 骨格先行は生成に接続していないため、今回の変更が生成結果を変える経路は無い。変更したのは `housingReport.ts` の関数の移動（再export付き）と、追加の任意項目だけである。
- 未解決: 上の試験の失敗原因の切り分け。次のどちらかで行う。(1) 変更前のコミットを別の作業ツリーで同じ試験を実行する。(2) 並列数を1にして全体を再実行する。

## 6. 再現手順

```sh
node --import tsx scripts/city-editor/skeleton/skeletonLab.ts --out temp/s1/standalone.jsonl --seeds 12 --svg fail
node --import tsx scripts/city-editor/skeleton/skeletonLab.ts --out temp/s1/fmg.jsonl \
  --csv temp/s0/triviers-inputs.csv --burg <S0 記録の96都市> --svg fail
```

`--settings '{"wallShape":"square"}'` で外壁の形を固定できる。SVG は `<out>.svg/` に保存される。
