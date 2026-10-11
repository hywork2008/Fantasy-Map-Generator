# River-Port Lab: 河川・港湾都市を量産するデバッグ生成モードと収集API

状態: 設計(未実装) 2026-10-11
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

```
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

- `src/debug/riverPortLab/classifyRiverSite.ts`(+ テスト8件)。判定の優先順は estuary > confluence > deltaBranch > confluenceBelow > lakeOutlet > meander > riverBank。川のない陸地は coastNoRiver / inland。
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

## 9. 未決事項

1. **Node 単独生成**: Chromium を使わず jsdom で `main.ts` の生成を動かせれば数倍速い。ただし DOM 描画が混ざっているため、L3 以降に計測してから判断する。
2. **CE まで実行するか**: 記述子だけでなく CE の水辺生成結果(岸壁長、桟橋数など)も欲しい場合、ce:perf のエントリを lab ページ内で呼ぶ。1都市あたり数百 ms 増える見込みなので、`include: ["ce"]` の任意指定にする。
3. **改良の反映先**: 統計で得たパターンを、FMG の都市スコア(合流点や河口へのボーナス)に戻すのか、CE 側だけで扱うのか。L4 のレポートを見てから決める。
