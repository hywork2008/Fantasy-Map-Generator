# CE生成の失敗・低速都市の改善計画

2026-10-14。根拠データ: `temp/benchmarks/triviers-1014.jsonl`（Triviers、596都市、各1回）と同 `.inputs.csv`。
集計は `npm run ce:perf:query`（[docs/tools/ce-performance-query.md](../tools/ce-performance-query.md)）と、入力CSVの `share_json` を都市IDで結合した一時集計による。

## 1. 現状（計測で分かったこと）

### 1.1 3分類

| 分類 | 定義 | 都市数 | 時間 | 主な理由 |
| --- | --- | --- | --- | --- |
| ① 失敗は少ないが遅い | 1回で成功、生成時間 ≥ p95 (1848 ms) | 27 | 96 s（全体の25%） | 全27都市が港。`fit-housing` 53%、うち `coastal-reservations` 22% |
| ② 失敗が多いが成功 | attempts > 1 で成功 | 3 | 11.6 s（捨てた試行 5.6 s） | 8 Seriemigny `castle-no-access`×5、10 Almeirora `unconnected-gates`×2、575 Winkburgh `castle-no-site`×1 |
| ③ 失敗が多く不採用 | 8試行すべて不採用 | 4 | 7.3 s（全て無駄） | 6 Ordes `unconnected-gates`/`castle-no-access`、314 Gothengsfeld `unconnected-gates`、317 Sinzlingen・452 Sanjeiradil `castle-layout-too-small` |

- ②③の7都市は**全て城塞（citadel）付き**。城塞なしの481都市は再試行0件。失敗の原因は城塞と門の配置に集中している。
- ③は8試行とも同じ理由で落ちる。再試行で seed を変えても原因が変わらない＝**地形・入力で決まる失敗**であり、再試行は時間の浪費。
- ①は港の効果が大きい。住宅1000戸以上で比べると ms/住宅 は港 1.46、非港 0.67。

### 1.2 二重市壁（首都）— 成功扱いの中に隠れた失敗

- `urbanMorphology.wallPhases` が2段の都市は自動で `townWallRings: "double"`。該当18都市（首都16のうち10）。
- **18都市中13都市で内壁が作られていない**。計画段階 `planInnerTown` が `null` を返し（`inner-wall` 工程: `planned=0, failureCode=3 "gap"`）、警告なく単一市壁に戻っている。結果は `generated` なので、`retries` や `status` には現れない。
- 内壁ができたのは 1 Leigh、2 Penorham、12 Dunsbole、192 Calver、62 Bracoso の5都市のみ。
- 内壁の面積割合（0.21〜0.39）と成否には関係が見られない。urban faces は47〜101で、`MIN_INNER_FACES*3=9` を満たす。したがって失敗は面数不足ではなく、**外壁先モードで要求する内外壁間の2セル以上の間隔（`INNER_WALL_MIN_GAP_CELLS`）**による。
- 失敗した13都市のうち11都市が港。`gapOf` は「都市の外」へ出るまでの面の層数を数える。水面の面も都市の外に数えるため、広場が水辺に近い港町では、外壁と関係なく水側の間隔が2未満になる。この仮説は未検証で、§3 P0で確認する。

### 1.3 質問への回答

**grid**: 596都市すべて `grid: "evolution"`（入力CSVの `share_json.grid`）。

**内壁・外壁の順序**: FMGからの入力では `townWallBuildOrder` を設定していない。このため、今回の18都市は**すべて外壁先（outer-first）**で生成されている。[generateCity.ts](../../src/city-editor/generators/generation/generateCity.ts) の `wall-defense-closure` も全件 `innerFirst: 0` だった。内壁先モードは、FMG入力ではまだ一度も計測されていない。

**外壁先の河川途切れ**: 外壁先では、二重市壁でも開口で不採用にならない（`townWallDefensePolicy` が未指定なら不採用判定をしない）。開口は記録だけ残る。

| 都市 | 内壁 | 河川開口 m | 侵入経路 |
| --- | --- | --- | --- |
| 12 Dunsbole | あり | 87 | 1 |
| 192 Calver | あり | 22 | 1 |
| 16 Skipton | 単一に後退 | 132 | 2 |
| 199 Schonauesch | 単一に後退 | 519 | 2 |
| 261 Baltonor | 単一に後退 | 291 | 4 |

- 内壁ができた5都市のうち2都市が河川で開いている。ただし、この記録は全周の合計なので、開口が内壁・外壁のどちらにあるかは分からない（§3 P0で分離する）。
- 比較のため、単一市壁の61都市では河川開口は1都市だけだった。

**evolution の外縁セルが大きく失敗しやすいという仮説**: 今回の失敗は、都市中心付近（内壁の間隔、城塞の接続）で起きている。外縁の大セルが直接の原因である証拠は、このデータにはない。ただし `unconnected-gates` は、門から枠外へ向かう道路が外縁の大きなセルを通るため、関係する可能性がある。§3 P0で、失敗した門から枠までの面の大きさを記録する。

## 2. 着手順序の推奨: ③ → ② → ①（二重市壁は②に含める）

1. **③を最初に**。
   - 都市の地図が全く出ない、利用者に見える欠陥である。
   - 8試行すべてで同じ理由が再現する決定的な失敗なので、`ce:perf --burg 6,314,317,452` で確実に再現でき、原因究明が最も容易。
   - 原因（城塞の敷地・接続、門の道路接続）は②と共通。③で直したことの多くが②も解消するため、先に③を直すと②の残りだけを扱えばよい。逆の順序だと、②で入れた対処を③のために作り直すおそれがある。
2. **②を次に**。
   - ③の修正後に再計測し、残った都市だけを扱う。
   - 二重市壁の隠れた後退（13/18）もここで扱う。`status` は成功だが、首都の要求仕様（二重市壁）を満たしていない点で②と同じ「品質の失敗」である。
   - 外壁先と内壁先の選択は、§3 P0で統計を取ってから決める。
3. **①を最後に**。理由は三つある。
   - 速度改善は「出力を変えない」ことが前提になる。③②の修正は生成アルゴリズムと出力を変えるので、先に速度を詰めても計測の基準を取り直すことになる。
   - ③②の修正で、捨てる試行の時間（今回13 s）が自動的に消える。
   - ①は時間の効果が最大（96 s）だが、全27都市が成功しているので緊急性は低い。

## 3. 計画

### P0 計測の補強（全段の前提、半日〜1日）

1. **`planInnerTown` の失敗理由を分ける**。`too-small` と `gap` を区別して返し、`gap` のときは次を `inner-wall` 工程の `counts` に記録する。
   - 最大の間隔
   - 間隔を詰めた相手の種類（水面／都市外の陸／枠外）
   これで §1.2 の港の仮説を確認する。
2. **`wall-defense-closure` を周回ごとに記録する**。外壁・内壁ごとの河川開口m・侵入経路数を記録する。
3. **`ce:perf` に生成設定の上書き指定を追加する**。例: `--setting townWallBuildOrder=inner-first`。同じ入力CSVで外壁先と内壁先を比較できるようにする。`.meta.json` に上書き内容を保存する。
4. **`ce:perf:query` に `walls` コマンドを追加する**。内容は次のとおり。
   - 二重市壁の要求数と実現数、後退理由の内訳
   - 周回別の河川開口
   - 城塞の失敗理由
5. **`unconnected-gates` の詳細を記録する**。失敗した門から枠までの経路上の最大の面面積を記録し、evolution の外縁仮説を検証する。
6. **出力の指紋を `ce:perf` に追加する**。生成後の文書（mesh・壁・道路）のハッシュで、P3 の「出力不変」を判定するために使う。

### P1 ③ 不採用4都市（1〜3日）

- 再現: `npm run ce:perf -- temp/benchmarks/triviers-1014.jsonl.inputs.csv temp/benchmarks/p1-before.jsonl --burg 6,314,317,452`
- **`castle-layout-too-small`**（317・452、住宅97戸・84戸）:
  - 小さすぎる町に城塞を要求している。
  - 「町の外・隣接地に城を置く」配置を試す。
  - それも不可能な場合は、城塞を明示的に省略する。省略は `townWallGeneration.fallbackReason` と同様に文書に記録し、静かな省略にはしない。
- **`unconnected-gates`**（6・314）:
  - P0-5 の結果で、門の位置の問題か、外縁セルの問題かを切り分ける。
  - 外縁が原因なら、門から枠への道路を外縁の大セル内で分割する（またはその経路に沿って面を細分する）。
- **`castle-no-access`**（6）: ②の Seriemigny と同じ原因として扱う（P2）。
- **決定的失敗の早期打ち切り**: 試行1と同じ理由・同じ詳細で失敗した場合、seed を変えても無駄なので打ち切るか、対処を変えて再試行する（既存の `castleStreetLinks` と同じ仕組み）。
- **完了条件**: 4都市すべて `generated`。全596都市の再計測で、新たな不採用が出ないこと。

### P2 ② 再試行都市と二重市壁（2〜4日）

- P1後に再計測し、残った再試行都市を `city <id>` で確認する。
- **Seriemigny の `castle-no-access`**: 二重市壁の計画が失敗した（`gap`）直後に城塞を置いている。内壁の後退が城塞の配置に影響していないかを確認する。
- **二重市壁の順序の決定**。P0-3 で、18都市×{外壁先, 内壁先}×`--repeat 3` を計測し、次を比較する。

| 指標 | 意味 |
| --- | --- |
| 内壁の実現率 | 現状 5/18 |
| 周回別の河川開口・侵入経路 | 外壁先で内壁が川で途切れるという懸念の検証 |
| 外壁の後退・平滑化での内壁セル不足 | 内壁先の懸念の検証。内壁先の `wall-defense-closure` 不採用件数も含む |
| 生成時間・試行回数 | |

- 統計の母数を増やす。18都市では少ないため、合成地形の既存ツール `scripts/compareTownWallOrders.mjs`（条件A〜D、grid・river・castle を総当たり）も、`--grid evolution --river through,meander --castle none,standard --seeds 20` で並行して回す。
- **判断基準**: 内壁先が「実現率が高い」かつ「河川開口が少ない」なら、FMG入力の既定を内壁先にする。どちらか一方だけなら、河川を持つ都市だけ内壁先にするなど、地形で順序を選ぶ。
- **港の間隔の問題**（P0-1で確認できた場合）: 水面側を間隔判定から外す（海側は内壁の外も水面で、外壁が無い側だから）。そのうえで、水辺の内壁は河川・海と同じ扱いで閉じる。
- **完了条件**:
  - 再試行都市0
  - 二重市壁の実現率の目標を P0 の結果を見て設定する（例: 15/18以上）
  - 実現した二重市壁で河川開口0、または開口が水門・橋門として描かれていること（[AGENTS.md](../../AGENTS.md) の橋の原則と整合）

### P3 ① 低速都市（港・`fit-housing`、2〜5日）

- 対象27都市は全て港。`fit-housing` 53%、`coastal-reservations` 22%。
  - `coastal-reservations` は1都市で4回呼ばれる。結果をキャッシュできるかを最初に確認する。
  - `local-fabric` は全都市で自己時間2位なので、港以外にも効く。
- 手順:
  1. `stage coastal-reservations` と `scaling --self` で、規模依存か固定費かを確認する（現状 k≈0.78、相関0.88）。
  2. Node の CPU プロファイル（`--cpu-prof`）で関数単位の自己時間を取る。
  3. 出力不変の改善（キャッシュ、空間索引、重複計算の削除）を先に行い、P0-6 の指紋で同一出力を確認する。
  4. 出力が変わる改善（反復回数を減らす等）は別の変更として行い、見た目の差を確認する。
- **完了条件**:
  - ①の27都市の合計 96 s → 目標 50 s 以下
  - 全596都市で出力の指紋が一致すること（出力不変の段階）
  - `ce:perf:query compare` で悪化した都市がないこと

## 4. 各段の検証手順（共通）

```sh
npm run ce:perf -- temp/benchmarks/triviers-1014.jsonl.inputs.csv temp/benchmarks/<step>.jsonl
npm run ce:perf:query -- temp/benchmarks/triviers-1014.jsonl compare temp/benchmarks/<step>.jsonl --self
npm run ce:perf:query -- temp/benchmarks/<step>.jsonl retries
```

同じ入力CSV・同じマシンで測る。FMG側のdescriptor作成を変えた場合は、入力CSVを作り直す。

## 5. 未確認事項

- 港の水面が内壁の間隔判定を詰めているという仮説（P0-1で確認）。
- 河川開口が内壁・外壁のどちらにあるか（P0-2で確認）。
- evolution の外縁セルと `unconnected-gates` の関係（P0-5で確認）。
- 単一市壁の港町9都市で `unprotectedMeters` が74〜298 mある。港の開口を防御の欠落として数えているだけか、実際の欠落かは未確認。

## 6. P0 実施結果（2026-10-14）

### 実装

| 項目 | 内容 |
| --- | --- |
| P0-1 | `planInnerTown` に診断引数を追加。`too-small` と `gap` を区別し、`inner-wall` 工程に `townFaces`・`trials`・`bestGap`・`blockerCode`（1=water, 2=outside-land, 3=mesh-edge）を記録 |
| P0-2 | `wall-defense-closure` に `outer*`／`inner*` の `UnprotectedMeters`・`RiverOpeningMeters`・`InvasionPaths` を追加 |
| P0-3 | `ce:perf --setting key=value`（townWallBuildOrder／townWallRings／townWallDefensePolicy／innerWallState／generationMethod）。`.meta.json` の `settingOverrides` に保存 |
| P0-4 | `ce:perf:query walls` |
| P0-5 | `unconnected-gates` に `gateFrameRatio`・`gateFaceAreaRatio`・`gateRoadEdges` を追加 |
| P0-6 | JSONL に `fingerprint`（document／mesh／features／defenses／fabric のSHA-256先頭16桁）を追加。同一入力の反復で一致することを確認済み |

- 生成への影響: 診断のみ。二重市壁18都市を再計測し、状態・試行数・面数・面積が元の計測と全件一致した。
- 唯一の挙動変化: 内壁計画の失敗理由が、面数不足のとき `gap` から `too-small` になる。これは内壁先の `townWallGeneration.fallbackReason` にも反映される。テスト `innerTownWall.test.ts` の期待値を更新した。

### 計測（二重市壁18都市、`temp/benchmarks/p0/`）

| 条件 | 内壁実現 | 単一に後退 | 不採用 |
| --- | --- | --- | --- |
| 外壁先（現行の既定） | 5 | 13（全て計画段階の `gap`） | 0 |
| 内壁先（既定の閉鎖判定あり） | 4 | 0 | 14（`open-town-defense` 13、`unconnected-gates` 1） |
| 内壁先＋判定なし（`townWallDefensePolicy=legacy`） | 5 | 11（構築段階の `gap` 9、`castle-crowds` 2） | 2（192 Calver、12 Dunsbole） |

1. **港の水面仮説は否定**。外壁先の13都市では、間隔を詰めた相手はすべて `outside-land` だった。`bestGap` は10都市で0、3都市で1。最初の試行から面積を0.85倍ずつ6回縮めても、内壁の候補が市街地の外の陸に直接接している。
   - 内壁の中心（広場 `plaza` の位置）が市街地の端にあるか、計画時の市街地集合が細長い可能性が高い。次に調べるのはここ。
2. **内壁先の不採用は順序ではなく防御判定が原因**。内壁先は既定で閉鎖を要求するため、内壁を作れず単一に戻った都市でも、港側の開いた外壁（外壁先で `unprotectedMeters` 300〜600 m と記録されていたもの）で不採用になる。
   - 外壁先はこの開口を判定せず成功扱いにしている。開口の問題は両方の順序に共通している。
3. **内壁の河川途切れは観測されなかった**。外壁先で実現した5都市、内壁先＋legacy で実現した5都市とも、内壁の河川開口は0 m。河川開口はすべて外壁側（Dunsbole 87 m、Calver 22 m、Baltonor 326 m など）。ただし母数は5都市。
4. **門の失敗は外縁の大セルではない**。Ordes（距離比0.93、面比0.18）、内壁先の Dunsbole（距離比0.76、面比1.3）とも、門は中心寄りで、周囲の面も普通の大きさ。門に接する道路の辺が1本だけ（壁を越えない）のが共通点。

### P1・P2 への反映

- P2 の二重市壁は、順序の選択より先に「計画段階で `bestGap=0` になる原因」（中心位置・市街地形状）を調べる。順序を変えても実現数は5のままだった。
- 港の外壁の海側開口を防御の欠落とみなすかを決める必要がある。海側を壁で閉じる、海に面した開口は許す、のいずれか。これが決まるまで、内壁先を既定にしてはならない（不採用が14都市に増える）。
- 内壁先の構築段階の `gap`（`addInnerTownWall`）には、まだ `bestGap`・相手の診断がない。P2 の最初に追加する。
- `unconnected-gates` は、門の道路が1本しか接続しない局所的な問題として P1 で扱う。

## 7. P1 実施結果（2026-10-15）

不採用4都市の原因は、再試行で変わらない決定的な3種類だった。全596都市の前後計測（`temp/benchmarks/p1-baseline.jsonl` と `p1-after.jsonl`、同一入力CSV）で、**不採用 4 → 0**（生成 592 → 596）。

| 都市 | 原因 | 修正 |
| --- | --- | --- |
| 6 Ordes | 広場がない町で、城が町の中心（街路の合流点）に置かれ、門の道路が通れない | [defenses.ts](../../src/city-editor/generators/generation/planning/defenses.ts): 広場がないとき、町の中心点に最も近い頂点に接する市街地の面を城の予約地にする（`townHubFaces`）。1回目で成功 |
| 317 Sinzlingen、452 Sanjeiradil | 城を町の外に置いたとき、城門が「城の壁と町の壁に囲まれた袋小路」に開き、道路が出られない。`castle-layout-too-small` は症状で、実際は `castle-no-site`／`castle-no-access` | [castles.ts](../../src/city-editor/generators/castles.ts): 門が町の外の面に開くとき、道路が壁・水・城を通らずに町の門か地図の端へ出られるか確認し（`exteriorReachesWorld`）、出られない辺を門の候補から外す。2回目で成功 |
| 314 Gothengsfeld | 橋のたもとへ向かう門に、川に入る古い外側の辺が残り、その辺が通り抜けの辺に選ばれて門が水没扱いになる。道路が門に接続できない | [gates.ts](../../src/city-editor/generators/generation/assembly/gates.ts): 橋のたもとへの腕を引いた直後に、川に触れる外側の辺が分けている2つの面を統合する（`dropWetExteriorArms`）。1回目で成功 |

### 影響と検証

- 4都市を除く592都市のうち、出力が変わったのは4都市（60 Fenoy、549 Mackerpor、568 Nemyshl、575 Winkburgh）。状態・試行数は変わらず、残る588都市は全周のハッシュが一致した。
- 変わった4都市のうち、568（城塞なし・河川）は門の修正、60・549・575（城塞あり）は城の配置の変更による。568と549を描画して確認し、門・道路・城が自然につながっていることを確かめた。
- 当初の診断と違い、`castle-layout-too-small` は原因ではなかった。これは症状の一つで、実際の原因は上の3種類。
- 計測の都合上、修正後の合計生成時間（479 s）が基準（457 s）より大きいが、修正後の計測は他の処理と並行していたため、速度の比較には使えない。速度は P3 で単独計測する。

### 未解決・次への申し送り

- 575 Winkburgh（住宅14戸）は `castle-no-site` で1回再試行して成功している。②の対象として残る。
- 内壁先・二重市壁の課題は P2 に残っている（§6）。
- 城の予約地・袋小路判定は4都市の実例に基づく。再発する別の地形があれば、`ce:perf:query walls` の城塞の失敗件数で検知できる。

## 8. P2 実施結果（2026-10-15）

全596都市の前後計測（`p1-after.jsonl` と `p2-final.jsonl`）で、生成成功は596のまま、**二重市壁の実現 5/18 → 17/18**。変わったのは二重市壁の13都市だけで、残る583都市は全周のハッシュが一致した。再試行で捨てた時間は 17.4 s → 1.1 s。8 Seriemigny は6試行・34 s から1試行・5 s になった。

### 原因（§6 の仮説の更新）

- 外壁先で内壁が作れない原因は、港の水面ではなく**面の粗さ**だった。内壁の目標面積を満たす円形選択が、大きな外縁セルを含んで外壁に接してしまい、どれだけ縮めても内外壁の間隔（2セル）が取れない。順序を内壁先にしても実現数は変わらなかった。
- 内壁を作れるようになった結果、新たに2種類の失敗が表に出た。
  - 城門の隅を内壁が通り、門に外へ出る辺が残らない（17 Wihulbo、8 Seriemigny）。
  - 外壁の門から中心への道が、城の除外域と内壁で塞がれる（3 Huerejos）。

### 修正

| 内容 | ファイル |
| --- | --- |
| 内壁の選択を2段階にする。従来の円形選択が失敗したときだけ、外壁から間隔分以上内側の面に限って選ぶ（`inlandTown`）。計画段階と構築段階の両方 | [innerTownWall.ts](../../src/city-editor/generators/innerTownWall.ts) |
| 城門の隅に接する面を、内壁の内か外のどちらか一方にそろえる（`settleCastleGateFront`） | 同上 |
| 二重市壁の内壁を実際に作ったうえで2回失敗したら、単一市壁に戻して再試行し、`townWallGeneration.fallbackReason` に理由を残す | [generateCity.ts](../../src/city-editor/generators/generation/generateCity.ts) |

- 単一市壁への後退は、3 Huerejos（3試行目で成功）のみ。根本原因（外壁の門の道が城の除外域で塞がれる）は未修正。
- 実現した内壁で河川開口のあるものは0。外壁側の開口は5都市（Dunsbole 87 m、Skipton 132 m、Schonauesch 519 m、Calver 22 m、Baltonor 292 m）で、港・河川の開口の扱いは未決のまま。
- 1都市（`lost-later`）は内壁が作られたが、最終の周回数が1になっている。原因は未調査。
- UI 既定の自動生成で二重市壁が実現するようになったため、`CityEditorPage.generate.test.ts` の住宅集計の文言の期待を「外縁部」または「市壁間」に変更した。

### 試したが採用しなかったもの

- 城門が袋小路に開く判定を、町内の面にも広げた案は、synthetic な micro town で門の接続を壊し、`castles.test.ts` が4件失敗したため戻した。内壁側の修正（上記）で 17・8 は解決している。

### 残る再試行（合計1.1 s）

3 Huerejos、10 Almeirora（`unconnected-gates`）、575 Winkburgh・317 Sinzlingen・452 Sanjeiradil（`castle-no-site` を1回出してから成功）。いずれも1秒未満で、P3 の後に扱う。

### 内壁先モードについて

内壁先の既定化は見送る。外壁先が17/18で実現するようになり、内壁先の利点（実現率）がなくなった。内壁先は開口判定が厳しく、港の外壁の海側開口で不採用になる問題が残っているため、検討するなら港の開口の扱いを決めてからにする。

## 9. P3 実施結果（2026-10-15）

出力不変の高速化のみを行った。全596都市で、状態と出力のハッシュ（`fingerprint`）が P2 完了時と完全に一致した（差分0、`temp/benchmarks/p3-full1.jsonl`）。

| 指標 | P0 計測（`triviers-1014`） | P3 |
| --- | --- | --- |
| 全596都市の生成時間合計 | 380.5 s | 271.2 s（-29%） |
| ①の27都市（成功1回・1.85 s 以上）の合計 | 95.7 s | 64.6 s（-33%） |
| 中央値 / p95 / 最大 | 373 / 1848 / 10619 ms | 273 / 1425 / 4206 ms |

この差には P1・P2 の効果（不採用都市の再試行の廃止。8 Seriemigny は 10.6 s → 数秒）も含まれる。P2 完了時点（365 s）との比較では -26%。

### 変更

| 内容 | ファイル | 効果の見立て |
| --- | --- | --- |
| `polygonOverlaps` に外接矩形による絞り込みを追加（互いに離れた多角形は即 false、相手の範囲外の頂点・辺は検査しない）。水面・領域など頂点の多い多角形との比較が支配的だった | [fortifications.ts](../../src/city-editor/generators/fortifications.ts) | 30都市で 72.8 → 63.7 s |
| `gapToLines` の走査に外接矩形の下限による枝刈り（現在の最小値より遠い線分は計算しない）。しきい値判定だけの呼び出しは `gapBelow`（最初に下回った時点で終了）に置換 | [defenseClearance.ts](../../src/city-editor/generators/defenseClearance.ts)、[urbanGrowth.ts](../../src/city-editor/generators/urbanGrowth.ts) | 63.7 → 52.8 s |
| 住宅数の調整（`fitMorphologyHousing`）で、(a) 地区パラメータが変わらない再計算を使い回し、(b) 地区の内容をキーにしたキャッシュを全回で共有 | [fitImportedHousing.ts](../../src/city-editor/generators/fitImportedHousing.ts) | 52.8 → 48.9 s |

上の時間は、診断用の30都市（`1,2,8,12,14,17,3,7,16,20,62,151,199,246,261,6,314,317,452,575,10,9,13,15,18,19,21,22,23,24`）の合計生成時間。基準は P2 完了時の 72.8 s。

### 採用しなかったもの

- **`assembleRoads.ts` の水面ポリゴンの取得を辺ごとから1回にまとめる案**: 30都市で 48.9 → 43.8 s と速く、全596都市のハッシュも一致したが、`CityEditorPage.generate.test.ts` の「二重市壁の共有リンクで同じ形が再現される」テストが、ファイル全体を実行したときだけ失敗した（同じ都市を2回生成した結果が一致しなくなる）。原因を特定できていないため戻した。水面ポリゴンの取得がキャッシュの状態に依存している疑いがあり、再度試す前に原因の調査が必要。
- **`fitImportedHousing`（非モルフォロジー経路）への同様のキャッシュ共有**: 効果がなかったため戻した。

### 残る時間（P2 完了時 → 現在の工程別自己時間、全596都市）

| 工程 | 合計 |
| --- | --- |
| `generation` 直下（計測されていない処理） | 50.4 s |
| `attempt-*/apply-plan` | 45.7 s |
| `attempt-*/plan` | 33.3 s |
| `fit-housing/coastal-reservations` | 28.1 s（57.5 s から半減） |
| `fit-housing/legacy-fabric/local-fabric` | 25.4 s（51.8 s から半減） |

- **目標との差**: ①の目標（96 s → 50 s 以下）には届いていない（64.6 s）。出力不変の範囲では、残りの時間は `apply-plan`・`plan` と、文書全体の複製（`structuredClone`、GC が1都市あたり 15〜20%）が大きい。
- **次の候補**:
  1. `moveVertices` など、頂点を1つ動かすたびに文書全体を複製する経路（`through-streets` が1都市で約 0.4 s）。複製を避けるには文書の更新方法の変更が必要で、影響が大きい。
  2. 港の `harbor-fabric` が住宅調整の各回で再計算される（全体で 11 s）。入力が同じ回の使い回しができれば減らせる。
  3. `regionalCoastalWaterPolygons` の `sameCoast` が、水面判定のたびにメッシュ全体を比較している。
  4. `generation` 直下の未計測の約 50 s の内訳を、計測を追加して特定する。
