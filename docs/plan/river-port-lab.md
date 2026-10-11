# River-Port Lab: 河川・港湾都市を量産するデバッグ生成モードと収集API

状態: L0〜L4 実装済み(2026-10-12)
関連: [map-scope-small-worlds.md](map-scope-small-worlds.md), [map-server.md](map-server.md), [bridge-skew-policy.md](bridge-skew-policy.md)

## 1. 目的

Province scope の小さな地図で、河川と都市の位置関係を意図的に多様化し、CE に渡る「河川港 + 海港」「合流点」「河口」「蛇行部」などのサンプルを大量に作る。
その配置パターンを統計として集め、FMG の河川形状生成と都市配置アルゴリズム、CE の水辺処理を改良する材料にする。

通常の生成結果は変えない。デバッグ用オプションがオフなら、既存のシード再現性を保つ。

## 2. 現状の制約(調査結果)

| 項目 | 現状 | 影響 |
| --- | --- | --- |
| 河川量 | `Rivers.generate` は `grid.cells.prec` × セル数補正で flux を積算し、`MIN_FLUX_TO_FORM_RIVER` 未満は川にならない(`river-generator.ts:76-153`) | 乾燥気候や小さな地図では川が1〜2本しか出ない |
| 都市配置 | `placeTowns` は `getSettlementBaseSize`(気温・降水・地形)を乱数化したスコア順に、間隔条件で選ぶ(`burgs-generator.ts:1519`) | 河口や合流点を優先する仕組みが無い。合流点は `cells.conf` にあるが、タグ付け(`:1984`)に使うだけ |
| Province 上限 | 国・文化・宗教は2(`mapScope.ts SCOPE_COUNT_CAPS`) | 本モードでは問題にならない |
| 生成環境 | 生成パイプラインは `src/main.ts` の DOM 依存コード。Node + jsdom で動くのは「読込済み .fmg の参照」まで(map server worker、ce:perf) | オンザフライ生成は headless Chromium が必要(`fmg:small` と同じ方式) |
| 収集 | `fmg:small` は .fmg を保存し、`ce:perf` などが後から読み込む | ファイル経由で遅く、統計を取るループに向かない |

## 3. 全体構成

```text
[統計スクリプト npm run lab:collect]
        │ HTTP (JSON)
        ▼
[map server  /api/lab/*]  ── 生成ジョブキュー ── [headless Chromium プール (N ページ)]
        │                                          │ Vite dev (内部ポート)
        │                                          └ window.fmg.lab.generate(opts) → 抽出JSON
        └ 既存 /api/map, /api/burgs (.fmg 共有) はそのまま
```

- 生成と抽出はブラウザ側(`src/debug/riverPortLab/`)で完結させる。サーバーは Playwright でページを保持し、`page.evaluate` で呼ぶだけ。
- .fmg は保存しない。保存が要るサンプルだけ `include: ["fmg"]` で base64 を返す(→ `PUT /api/map` や CE での目視確認に使う)。
- ページは使い回す。1ページで「生成 → 抽出 → 次のシード」を繰り返す。メモリが増えたら M 回ごとに reload する。

## 4. 生成オプション `riverPortLab`(デバッグ専用)

`OptionsState` に1つのオブジェクトとして追加する。UI は Generation Settings の Map scope = Province の時だけ、開発ビルドで "Debug: River-port lab" の折りたたみとして出す。

```ts
interface RiverPortLabOptions {
  enabled: boolean;              // false なら全項目無視(既定)
  riverDensity: number;          // 1..10。河川化しきい値と降水の倍率
  ignoreClimate: boolean;        // true: 降水を一様 + 微小ノイズで上書き
  forceSeaOutlet: boolean;       // 地図内に海があることを保証(無ければ縁を海にする)
  siteQuota: Partial<Record<LabSiteKind, number>>; // 各サイト種別に何都市置くか
  fillTowns: boolean;            // クォータ後、残りを通常の placeTowns で埋めるか
}
type LabSiteKind =
  | "estuary"        // 河口: 川の最下流セル かつ haven(海)あり → 海港+河川港
  | "deltaBranch"    // 河口から1〜3セル上流の岸
  | "confluence"     // cells.conf > 0
  | "confluenceBelow"// 合流点の1セル下流(合流後の本流)
  | "meander"        // 川の曲率が大きいセル
  | "riverBank"      // 直線区間の岸(対照群)
  | "lakeOutlet"     // 湖の流出口
  | "coastNoRiver"   // 海岸のみ(対照群)
  | "inland";        // 水辺なし(対照群)
```

### 4.1 河川を増やす(気候を無視)

`generatePrecipitation` の直後、`Rivers.generate` の前にフックを入れる(`main.ts:1213-1220`)。

1. `ignoreClimate` の場合: `grid.cells.prec[i] = base × (0.8 + 0.4·rand)` で上書きする。base は `riverDensity` に比例させる。
2. `Rivers.generate` に `labFluxScale` を渡し、`MIN_FLUX_TO_FORM_RIVER / riverDensity` をしきい値にする。定数自体は変えない。
3. 標高は変えない。川の形は既存の flowDown アルゴリズムのままにする。統計の対象は「既存アルゴリズムの形」なので、地形をいじると比較の意味がなくなる。
4. 気温・バイオームは元のまま残す。都市の人口・文化には影響するが、配置は 4.2 で強制する。

`forceSeaOutlet` は heightmap テンプレートの選択で満たす。Province scope の既存テンプレートの中から、海岸があるものだけ選ぶ。地形の後加工はしない。

### 4.2 都市を河川との関係で強制配置

`Burgs.generate` の `generateTowns` の前に `placeLabSites()` を挟む。

1. 各 `LabSiteKind` の候補セルを分類器 `classifyRiverSite(cell)`(4.3)で列挙する。
2. 種別ごとに、クォータ数を間隔条件付きで選ぶ。既存の `placeTowns` の quadtree 間隔ロジックを流用し、候補を種別内に限定する。
3. 選んだセルは `cells.s` を一時的に最大値へ上げる。そうすれば既存の port 判定・haven 決定・waterfront settlement(port waterfront guarantee)がそのまま走る。burg 生成の本流は変えない。
4. 首都(States 用)は通常どおり選ぶ。ただし首都の位置も統計に含め、`siteKind` タグを付ける。
5. `fillTowns` なら、残りの町を通常アルゴリズムで置く。

不足時(例: 合流点が無い): クォータを満たせなかった数を `labReport.shortfall` に記録し、エラーにはしない。

### 4.3 サイト分類器(生成とも統計とも共通)

`src/debug/riverPortLab/classifyRiverSite.ts` に純関数として作る。生成時の候補選びと、収集時の「実際にどうなったか」の判定に同じ関数を使う。結果がずれると統計が無意味になるため。

入力は pack セルで、出力は `{ kind, riverId, distanceToMouthCells, confluenceOrder, flux, curvature, bankSide }`。

## 5. 抽出データ(1都市1レコード)

ブラウザ内の `extractLabSample()` で作る。CE の Burg Site Descriptor(`getBurgSiteDescriptor`)をそのまま含め、さらに統計用の派生値を加える。

```jsonc
{
  "map": { "seed": "1234", "labOptions": {...}, "cells": 500, "riverCount": 14, "genMs": 2100 },
  "burg": {
    "id": 7, "population": 3.2, "port": true, "capital": false,
    "siteKindIntended": "estuary",          // 4.2 で狙った種別
    "siteKindActual": "estuary",            // 生成後に classify した種別
    "seaPort": true, "riverPort": true,     // CE の港判定と同じ規則
    "river": { "id": 3, "flux": 412, "widthM": 38, "distanceToMouthKm": 0.0,
               "confluenceOrder": 2, "curvatureDeg": 24, "bankSide": "left|right|both|island" },
    "relation": {                            // 都市中心から見た川・海の幾何
      "riverEntryBearingDeg": 80, "riverExitBearingDeg": 250,
      "coastBearingDeg": 190, "nearestBridgeSkewDeg": 6
    },
    "waterfrontCheck": { "ok": true, "alerts": [] },  // 既存の waterfront-check
    "descriptor": { /* Burg Site Descriptor 全体 (optional, include=descriptor) */ }
  }
}
```

`nearestBridgeSkewDeg` は `src/utils/bridgeSkewPolicy.ts` で判定し、時代上限を超えた橋の数を、マップ単位で `bridgeViolations` に集計する(AGENTS.md の原則の回帰検出を兼ねる)。

## 6. API(map server 拡張)

`npm run map:server -- [map.fmg] --lab [--lab-workers 2]` で有効にする。`--lab` が無ければ従来どおりで、エンドポイントも出さない。地図ファイルなしでも、lab 専用として起動できる。

| メソッド | パス | 内容 |
| --- | --- | --- |
| POST | /api/lab/generate | 1地図を生成して抽出結果を返す(同期)。body: `{seed?, cells?, lab: RiverPortLabOptions, filter?, include?: ["descriptor","fmg"]}` |
| POST | /api/lab/batch | `{seeds: [...] \| {start, count}, ...}` を非同期ジョブにする → `{jobId}` |
| GET | /api/lab/jobs/:id | 進捗(`done/total/failed`) |
| GET | /api/lab/jobs/:id/samples | NDJSON ストリーム。都市1行(5章の形式) |
| DELETE | /api/lab/jobs/:id | 中止 |

- `filter` の既定は `{ port: true }`(港を持つ都市だけ)。`{ siteKind: [...] }`、`{ all: true }` も指定できる。
- 認証は既存方針に合わせる。lab は重いので、`--read-token` 指定時は POST にも Bearer を必須にする。
- 同じ `(seed, options, gitHead)` の結果は `.cache/lab/` に NDJSON でキャッシュし、再実行を速くする。

## 7. 収集・集計 CLI

`npm run lab:collect -- --server http://127.0.0.1:8787 --seeds 1..500 --preset port-heavy --out .cache/lab/run.ndjson`

- `--preset` はオプションの組を指定する。`port-heavy`(estuary/deltaBranch 多め)、`confluence`、`balanced`、`control`(lab 無効 = 現行アルゴリズムの基準値)。
- `npm run lab:report -- run.ndjson` で集計する。出力は次のとおり。
  - siteKindIntended → Actual の混同行列(配置強制がどこで崩れるか)
  - 種別ごとの seaPort/riverPort 成立率と waterfront-check 失敗率
  - 河口からの距離、合流次数、曲率、岸側の分布
  - 橋の skew 分布と違反数
  - control との比較(現行アルゴリズムが各パターンをどれだけ自然に作っているか)

## 8. 段階

| 段階 | 内容 | 完了条件 |
| --- | --- | --- |
| L0 | `classifyRiverSite` + テスト、既存 .fmg に対する ce:perf 経由の分類ダンプ | 既存 small maps で分類が目視と一致 |
| L1 | `riverPortLab` オプション(河川増量・強制配置)+ ブラウザ UI | Province 500 セルで川 ≥10 本、estuary/confluence がクォータどおり出る。lab 無効時に既存シードの結果が完全一致 |
| L2 | `window.fmg.lab.generate/extract` + map server `/api/lab/generate` | curl 1回で .fmg 保存なしに港湾都市 JSON が返る |
| L3 | batch / NDJSON / キャッシュ / `lab:collect` | 500 シードを2ワーカーで完走 |
| L4 | `lab:report` と control 比較 | レポートから、配置・河川アルゴリズムの改善候補を挙げられる |

### L0 実装済み(2026-10-11)

- `src/debug/riverPortLab/classifyRiverSite.ts`(+ テスト8件)。判定の優先順は estuary > lakeOutlet > confluence > deltaBranch > confluenceBelow > meander > riverBank。川のない陸地は coastNoRiver / inland。
- `npm run lab:classify -- <map.fmg>... [--ports-only] > sites.ndjson`。map server の worker を流用し、`mapServerEntry.classifyBurgSites()` を呼ぶ。都市1件を1行で出力し、種別ごとの集計を stderr に出す。
- 既存の10地図(5216都市)での初回の集計:

| kind | burgs | seaPort | riverPort | both |
| --- | --- | --- | --- | --- |
| estuary | 403 | 186 | 111 | 111 |
| confluence | 109 | 5 | 63 | 5 |
| deltaBranch | 556 | 0 | 168 | 0 |
| confluenceBelow | 33 | 0 | 27 | 0 |
| meander | 169 | 0 | 47 | 0 |
| riverBank | 414 | 2 | 80 | 0 |
| coastNoRiver | 1569 | 618 | 0 | 0 |
| inland | 1951 | 0 | 0 | 0 |

  観察: 河口の都市の過半数(217/403)は港になっていない。海港・河川港の両方を持つのは111都市だけ。合流点の都市は全体の2%で、本モードで増やす価値が大きい。deltaBranch(3セル)は短い川で広く取りすぎている可能性があるため、L1 で km 基準への変更を検討する。

### L1 実装済み(2026-10-11)

設計(§4)から変えた点(いずれもライブ計測で判明):

- **設定の保持場所**: lab の設定は OptionsState に入れず、`src/debug/riverPortLab/labOptions.ts` のモジュール状態と localStorage `riverPortLab` に置く。保存・エクスポートには含めない。localStorage を使うのは、ページ読み込み直後に始まる生成にヘッドレスでも設定を渡すため。
- **一様降水は河川の流量計算にだけ適用**(`labRiverPrecipitation`)。`grid.cells.prec` 自体を上書きすると、バイオームが湿地化して居住可能セルが消え、seed 109 で都市が0件になった。
- **`riverDensity` は降水量の倍率も兼ねる**(一様降水 = 20 × riverDensity)。しきい値を下げるだけでは細い川が増えるだけで、航行可能(`MIN_NAVIGABLE_FLUX` = 100)な河口は1地図に3セル程度しかなかった。
- **候補は陸セル全体**(川の上なら航行可能なセルに限る)。Province では文化が陸の一部にしか広がらないため。文化のないセルに置く時は、最寄りの文化を割り当てる。
- **lab の都市は港選定で preferred 扱い**。陸塊ごとに代表1港だけを選ぶ通常の間引きを受けない。

追加物: `selectLabSites.ts`、`RiverPortLabRows.tsx`(開発ビルドの Generation Settings、Province 時のみ)、`window.fmg.lab.{getOptions,setOptions}`、`fmg:small --lab default|<json>`。`pack.riverPortLab` に `{options, shortfall, supply}` を記録する。

検証(12地図、`fmg:small --require sea-port --lab default`、seed 101〜114):

- lab の都市139件で、意図した種別と実際の種別が100%一致。
- 海港+河川港の都市は12地図で計75件。比較として、通常の世界地図10枚(5216都市)では111件。
- lab 無効時は、変更前のコードと比べて seed 103/109/112 の要約・都市分類が完全一致。
- 既存テスト 3305件が成功。

既知の制約(L1.5 で解消、下記):

- **合流点・湖の出口はほとんど作れない**(1地図あたり候補0〜5セル)。Province の海岸地図は、短い並行河川が直接海に注ぐ形が多いため。全陸地の地図(seed 104)では合流点60セルあるが、海が無いので港にならない。改善するには地形側の対策(内陸に広い集水域を持つテンプレート)が要る → L1.5 候補。
- **地図の外へ流れ出る川は河川港にならない**(`Rivers.resolveDrainFeature` が排水先を見つけられない)。Province は世界の切り出しなので頻繁に起きる。統計では `outflow: "offmap"` として区別できる。
- deltaBranch(河口から3セル以内)は航行可能な都市を多く含むが、海港にはならない。種別の定義としては妥当。

### L1.5 合流点・湖の出口・地図外流出の修正(2026-10-11)

lab 有効時、高さマップ生成の直後(`Features.markupGrid` の前)に `labTerrain.ts` の `shapeLabTerrain` で地形を加工する。

| オプション | 既定 | 内容 |
| --- | --- | --- |
| `seaBorder` | true | グリッドの外周**2重**を海にする。1重では、パック側の縁フラグ(`pack.cells.b`)が内側の陸セルにも立ち、そこを通る川が地図外へ流れた(seed 107 で2本) |
| `landShare` | 0.8 | 外周の内側で陸がこの割合に満たない時、最も浅い海を高さ20〜25の海岸平野に変える(順序は保つ)。既存の陸・気候・居住性はそのまま |
| `lakes` | 2 | 海から3セル以上離れた内陸の最奥に窪地(高さ15)を掘り、湖から海まで最急降下で放水路を刻む。湖面+19以下の谷にして、`Lakes.detectCloseLakes` に閉じた湖と判定されないようにする |

計測で判明し、採用しなかったもの:

- **全体の傾斜(basinTilt)**:合流点の候補は 0/15/30 で 16/15/15 セルと変わらず、30 では内陸が寒冷化して都市0件の地図が出た。海岸セルまで持ち上げると港の標高条件を満たさず、海港+河川港が 75→33 に減った。
- **幹となる谷(valleys)**:0/2/4 本で合流点の候補は 20/14/19 セル。側壁から幹川へ入る流れが 1〜2 セルと短く、`MIN_RIVER_CELLS`(3)未満で川として残らない。
- 決め手は陸の量だった。500 セル地図は陸 14〜40% の海岸の切れ端で、陸 80〜88% の 1500 セル地図(4枚)では合流点 432 セル。

ほかの修正:

- **分類器**:保存時に `Lakes.cleanupLakeData` が `outCell` を消すため、湖の `outlet` 河川から出口を求める。流入河川と id を共有する場合があるので、「その湖の最後の水セルの次の陸セル」を出口とする。優先順は estuary > lakeOutlet > confluence > deltaBranch > confluenceBelow > meander > riverBank。
- **湖の出口の河川港**:小さな湖に面した都市は、湖港として不適格になった時点で港の審査が終わり、川の上でも河川港にならなかった。L1.5 では lab の都市に限って直したが、2026-10-12 に FMG 本体で修正した(下記)。
- **首都のみの初期国家**(`initialPolityRealmSize`)では町の生成が丸ごと飛ばされていた。lab の都市だけは置く。文化の有無の判定は候補セルではなく地図全体で行う(首都のみモードでは文化が首都セルにしかないため)。
- **`fmg:small --lab`** は Settlement pattern を Standard に固定する(`--local-storage` で上書き可)。無作為に Frontier が選ばれると、加工した地形で計画ノードが作られず都市0件になった(seed 111)。

検証(12地図、`fmg:small --require sea-port --lab '{"landShare":0.8}'`、seed 101〜112):

| 種別 | 都市 | 海港 | 河川港 | 両方 |
| --- | --- | --- | --- | --- |
| estuary | 79 | 72 | 72 | 72 |
| confluence | 52 | 10 | 32 | 10 |
| confluenceBelow | 8 | 0 | 5 | 0 |
| lakeOutlet | 23 | 0 | 16 | 0 |
| meander | 35 | 0 | 21 | 0 |
| deltaBranch | 37 | 0 | 36 | 0 |
| riverBank | 26 | 0 | 14 | 0 |

- 地図外へ流れ出る川(`outflow: "offmap"`)は 0 本(L1 では多数)。
- 合流点は L1 の 15 → 52、合流点の下流は 1 → 8、湖の出口は 0 → 23。
- 都市0件の地図はなし(1地図 19〜27 都市)。
- lab 無効時は変更前と seed 103/109/112 の要約・都市分類が完全一致。関連テスト 3302 件が成功。

### 小さな湖のそばの河川港(FMG 本体、2026-10-12)

小さな湖港の無効化(`lakePortCapacity` = 0)は、湖を挟んだ短距離の往復航路を避けるためのもの。1セルの湖のために馬車→船→馬車と積み替える物流は割に合わない。ところが、湖に面した都市は湖港として審査され、失格するとそこで港の審査全体が終わっていた。そのため、湖に面していて航行可能な川の上にある都市も、河川港になれなかった。

- `BurgsModule.isRiverPortBesideSmallLake`:湖港に不適格な湖(1セル、航行不能グループ、容量0)に面していても、航行可能な川の上にあれば、ほかの川沿いの都市と同じく河川港として審査する。一括の候補収集(`collectPortCandidates`)と単独の昇格(`developPort`)の両方に適用する。
- **ただし**、川の行き先(`Rivers.resolveDrainFeature`)が海か、湖港を持てる大きさの湖である場合に限る。行き先がその小さな湖なら、湖を挟んだ往復航路になるので港にしない。港を実際に使うかどうかは、商人の積み替え計算に任せる。
- `updateBurgWaterAccess` の `port.lake` は、湖港を持てる大きさの湖に面している場合だけ true にする。以前は港を持ち湖に面していれば true だったため、小さな湖のそばの河川港が CE で湖港の岸壁を持つおそれがあった。
- 湖港の容量計算は `src/services/lakePorts.ts`(`lakePortCapacity` / `lakeCanHostPorts`)にまとめた。

影響の計測:世界地図4枚(seed 11/55/77/99、194都市)で、新しい規則で河川港になった都市は0件だった。湖に面した都市は11件あったが、航行可能で海へ注ぐ川の上の都市はなかった。lab 地図(6枚)では、湖の出口の都市11件のうち7件が河川港(湖港なし)になった。

計測の注意(2026-10-12 訂正):当初は「同じ seed でも世界地図の生成は揺らぐ」と結論したが、誤りだった。`Math.random` の全呼び出し(seed 11 で 204,899 回)を呼び出し元つきで2回記録すると完全に一致し、`map-ready` 時点の港の割り当ても一致した。揺らいで見えた原因は計測側にある。`scripts/lib/advanceYearHarness.ts` の `waitForMap` が `world.mapId` の定義を生成完了とみなしていたが、`mapId` はコア段階の最後で設定され、港の二重配置などの map-ready タスクはその後に走る。そのため、生成途中の状態(港 2〜9 件、正しくは 14 件)を読んでいた。`waitForMap` は `fmg:map-ready-tasks-completed` も待つように直した。このハーネスを使う `perf:advance-year`・Fast-Forward 較正・`diagnose:treasury` の過去の数値も、同じ影響を受けていた可能性がある。E2E の `waitForMapGeneration`(tests/e2e/helpers/fmg-helpers.ts)にも同じ前提が残っている。

### L2 実装済み(2026-10-12)

`npm run map:server -- --lab [--lab-workers 2] [--lab-url URL]` で `/api/lab/generate` を有効にする。地図ファイルは省略できる(lab 専用。`/api/map`・`/api/burgs` は 404/503)。

```sh
curl -s -X POST 127.0.0.1:8787/api/lab/generate \
  -d '{"seed":104,"cells":800,"lab":{"riverDensity":5},"filter":{"siteKind":["estuary"]},"include":["descriptor"]}'
```

- ブラウザ側: `src/debug/riverPortLab/labGenerate.ts`(`window.fmg.lab.generate`)と `labSample.ts`(`window.fmg.lab.extract`)。lab 設定は**既定値 + リクエストの `lab`** で毎回作り直す(前のリクエストを引き継がない)。`{"enabled": false}` で control。
- サーバー側: `scripts/lib/labPool.mjs`(Chromium ページのプール、50地図ごと・エラー時に reload)。Vite の起動は `scripts/lib/viteDevServer.mjs` に切り出し、`fmg:small` と共用。
- ページは使い回し、`regenerateMap({seed})` で生成する。seed 103 で、ページ再利用の結果が `fmg:small` の新規読み込みと都市の位置・分類・港まで完全一致した。同じページで同じ seed を2回生成しても一致。
- 1地図 8〜19 秒(Province 500〜800 セル)。2ワーカー同時実行を確認。
- 認証は既存の `--read-token` がそのまま POST にも掛かる。

§5 からの差分:

- **橋の skew**:FMG の通常生成では `landConnectionGeneration` が有効にならず、世界側の橋オブジェクトが無い。そのため、`include: ["descriptor"]` の時だけ、記述子の `fixedCrossings`(CE 用に都市ごとに収束させた橋)の床版軸と河川接線から `bridgeSkewDegrees` で測る。`map.bridgeViolations.source` が `"descriptor"`(都市ごとに数えるので、同じ橋が重複しうる)か `"landConnections"` かを示す。上限は開始時代の石造の値(`overPeriodLimit`)と `BRIDGE_SKEW_MAX_DEGREES`(`overMaxLimit`)の2つで数える。
- `river.widthM` も記述子由来のため、`descriptor` 指定時だけ入る。
- `distanceToMouthKm` は海へ注ぐ川だけ(河口セルで 0)。
- `bankSide` は `left|right|both`(都市がセル中心にほぼ重なる時 both)。island は未判定。
- 初回観察: seed 104(800 セル、riverDensity 5)では estuary を狙った6都市のうち4都市が海港にも河川港にもならなかった。L4 の集計対象。

### L3 実装済み(2026-10-12)

```sh
npm run map:server -- --lab --lab-workers 2
npm run lab:collect -- --server http://127.0.0.1:8787 --seeds 1..500 --preset port-heavy --out .cache/lab/run.ndjson
```

- `scripts/lib/labJobs.mjs`:`POST /api/lab/batch`(`seeds` は `[..]`・`"1..500"`・`{start, count}`。ほかは `/api/lab/generate` と同じで、`cache: false` で再生成)、`GET /api/lab/jobs/:id`(`done/total/failed/cached/samples` と失敗 seed)、`GET /api/lab/jobs/:id/samples`(NDJSON。それまでの行を返した後、ジョブが終わるまで追従する)、`DELETE /api/lab/jobs/:id`(実行中の seed は完了させ、新しい seed を始めない)。
- 1行は `{"map": {..., gitHead, pageErrors}, "burg": {...}}`。batch では `include: ["fmg"]` を受け付けない。
- キャッシュ:`.cache/lab/<hash>.ndjson`(seed 1つ = 1ファイル、都市が0件でも空ファイルで残す)。キーは seed・リクエスト(cells/lab/filter/include)・コード版。コード版は HEAD に、未コミットの `src`/`public`/`index.html` の差分ハッシュを加えたもの。サーバー起動時に1回だけ計算するので、コードを変えたらサーバーを再起動する。`.cache/` は .gitignore に追加した。
- `scripts/labCollect.mjs`:プリセットは `balanced`(既定値)、`port-heavy`、`confluence`、`control`(lab 無効、全都市)。`--lab`・`--filter` で上書きできる。サンプルは届いた順にファイルへ書き、15秒ごとに進捗を表示する。Ctrl-C でサーバー側のジョブも中止する。
- 計測:6 seed で 65 秒(2ワーカー)。キャッシュからの再実行は 0.2 秒で、出力は一致した。

- 完了条件の確認:`--seeds 1..500`(balanced)を2ワーカーで完走した。500 seed で失敗0、都市8610件、港のある都市を含む地図は498枚。lab の都市7782件は全件で、意図した種別と実際の種別が一致した。生成時間の中央値は21秒/地図で、全体は約50分。中止(DELETE)は、実行中の2 seed を終えてから止まることを確認した。
- ページエラーが出た地図は4枚。seed 19/411/427 は `Land-use areas do not conserve physical land`、seed 101 は `pack.routes is not iterable`。いずれも生成は完了している。lab 由来か本体の問題かは未調査。

### L4 実装済み(2026-10-12)

`npm run lab:report -- <run.ndjson> [--control control.ndjson] [--json]` で Markdown のレポートを出す(`scripts/labReport.mjs`)。内容は次のとおり。

- 意図→実際の混同行列とクォータ不足
- 種別ごとの港の成立率(海・川・両方・湖、航行可能な川の上で河川港になった率)と waterfront-check の失敗率、警告の内訳
- 河川の幾何(河口までの距離、流量、川幅、曲率、合流次数、流出先、岸側)
- 橋の skew の分布と違反数(`--include descriptor` のサンプルのみ)
- control との比較
- 改善候補の自動検出。しきい値による目安で、判定ではない

ポートのみのサンプル(既定のフィルタ)では成立率が 100% になるため、レポートが警告を出す。比率を見るには `--filter '{"all":true}'` で集める。

**L4 の作業中に見つけた lab 側の不具合(修正済み)**:

1. `regenerateMap` の debounce は、前の呼び出しから 250 ms 以内の呼び出しを捨てる。小さな control 地図は生成と抽出が 250 ms 未満で終わるため、次の seed が黙って捨てられ、120 秒でタイムアウトしていた(200 seed 中 7 件)。`labGenerate` は 300 ms 空けてから呼ぶようにした。
2. ファンタジー系の文化セットが無作為に選ばれると、`options.ts` が `initialSettlementPattern` のロックを `marches` に書き換え、それが残る。そのため、同じページの後続の地図はすべて Marches になり、結果が「ページ読み込み時の無作為 seed」に依存していた(control の 184 seed 中 18 件が実行ごとに変わった)。`labGenerate` は毎回 `standard` をロックし直す。seed 94 で、`fmg:small` の新規読み込みと一致することを確認した。**L3 の 500 seed のデータ(`run-1-500.ndjson`)はこの修正の前に集めたもの**なので、取り直しが必要。
   - FMG 本体の問題でもある。ユーザーが Standard をロックしても、ファンタジー系の文化セットが選ばれた時点で、ロックが黙って Marches に変わる。

**計測(seed 1〜200、lab は既定 + `--filter all --include descriptor`、control は lab 無効)**:失敗0。lab は都市4660件、control は都市1810件(都市のある地図195枚)。生成時間の中央値は lab 20 秒、control 1.2 秒/地図。レポートは `.cache/lab/report-1-200.md`。

**改善候補(優先順)**

1. **支流の都市が河川港にならない(FMG 本体のバグ)**。航行可能な川の上の都市のうち、川の流出先が海の場合は 2998/3078 件、湖の場合は 155/175 件が河川港になるが、別の川へ合流する場合は 137/1228 件(11%)だけ。137件は、本流のセルにいる都市と考えられる。`Rivers.resolveDrainFeature`(`river-generator.ts:617`)は、川の最後のセルの feature を見る。支流の最後のセルは本流の陸セル(feature は陸塊)なので null を返し、`river.parent` をたどらない。meander の 60%、riverBank の 55% が港にならない主因でもある。修正すれば、lab 無効の生成結果も変わる(港が増える)。
2. **waterfront-check の失敗が 25〜44%**。内訳は `river-unresolved:candidate-budget` 499件、`no-dry-site` 306件、`shore-missing` 121件、`folded-banks` 47件、`shore-distance` 39件。首都は 7%、町は 32% で、小さい都市ほど河岸に置けていない。最多の candidate-budget は、河岸を探す候補数の上限に達して諦めたもの。上限か探索順の見直しが候補。合流点が最悪(44%)なのは、2本の川の岸に挟まれて乾いた土地(dry site)が無いためと考えられる。
3. **通常アルゴリズムは、合流点・湖の出口・合流点の下流をほとんど選ばない**。control での比率は合流点 2%、湖の出口 1%、合流点の下流 0%。都市スコアに合流点ボーナスを足すかどうか(§9.3)を判断する材料になる。
4. **通常アルゴリズムの河口の都市は、海港+河川港が 45% だけ**(lab では 94%)。陸塊ごとに代表1港を選ぶ間引きが、河口の都市にもかかる。河口の都市を間引きから除外する案。
5. **合流点の下流は、クォータの 68% が候補不足**。地形・河川の供給の問題で、L1.5 と同じく陸の面積が決め手。改善には `landShare` を上げるか、1500 セル地図での収集が要る。
6. **橋**:1832 件で最大 25°。開始時代(大航海時代 25°)の上限を超えた橋も、絶対上限を超えた橋も 0。AGENTS.md の原則は守られている。10〜15° が 443 件ある一方、15〜20° は 0 件で、skew が段階的に選ばれていることを示す。

生成中のページエラーが3枚で出た。seed 19/168 は `Land-use areas do not conserve physical land`、seed 27 は `pack.routes is not iterable`。L3 の時とは別の seed で出ており、lab の修正で地図が変わったためと考えられる。原因は未調査。

## 9. 未決事項

1. **Node 単独生成**: Chromium を使わず jsdom で `main.ts` の生成を動かせれば数倍速い。ただし DOM 描画が混ざっているため、L3 以降に計測してから判断する。
2. **CE まで実行するか**: 記述子だけでなく CE の水辺生成結果(岸壁長、桟橋数など)も欲しい場合、ce:perf のエントリを lab ページ内で呼ぶ。1都市あたり数百 ms 増える見込みなので、`include: ["ce"]` の任意指定にする。
3. **改良の反映先**: 統計で得たパターンを、FMG の都市スコア(合流点や河口へのボーナス)に戻すのか、CE 側だけで扱うのか。L4 のレポートを見てから決める。
