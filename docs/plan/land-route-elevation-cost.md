# 陸路 routes 生成: 高標高・急登りコスト強化

陸路（`roads` / `trails`）を Dijkstra で敷くとき、**elevation が高いセル・急な登り**の探索コストを大きくし、可能な限り谷・低地の安楽な経路を選ばせる。  
**迂回路が無く峠がコスト最短なら、そのまま峠で接続してよい**（通行禁止にはしない）。

関連:

- 旅行時の勾配・馬打判別・商人の峠回避選択: [`docs/plan/route-grade-movement.md`](./route-grade-movement.md)（**生成後**の速度・日数。本ドキュメントとは分離）
- 実装箇所: `src/generators/routes-generator.ts` の `createCostEvaluator` → `getLandPathCost`
- 探索本体: `findPath`（`src/utils/pathUtils.ts`）、呼び出しは `findPathSegments` / `generateMainRoads` / `generateTrails`
- 中世ヨーロッパのイメージ（幹線は谷、峠は少数の必要動脈）: 本ドキュメント §1.3

**実装状況**: **Phase 1 実装済み**（elevation/slope コスト、roads/trails 感度）。**再生成モード選択も実装済み**（`landRouteGenerationMode`: `elevationAware` | `legacy`、`seaRouteGenerationMode` と同様に Regenerate Routes ダイアログ・永続化・load 時再構築）。Phase 2（目視チューニング・Options スライダ）は任意・未着手。

---

## 0. ユーザー決定

| 項目 | 決定 |
| :--- | :--- |
| 目的 | 高 elevation の陸路を避け、より安楽なルートを生成する |
| 峠しか合理的でない場合 | **接続してよい**（`Infinity` で山を封鎖しない） |
| 対象 | 陸路生成（`roads` / `trails`）。海路は対象外 |
| 旅行速度・交易日数 | 本改修のスコープ外（`route-grade-movement.md`） |
| 熊・山賊などの危険 | 生成コストには今は入れない（将来枠） |
| 航行可能河川 | 同じ河川の連続セルを陸路が縦走することは禁止。港への陸側接続・単一河川セルの横断は許す |

---

## 1. 調査結果

### 1.1 生成パイプライン

```
generate()
  ├─ generateMainRoads(connections)   // 国内の首都・港・主要 Burg の Urquhart → findPathSegments(isWater: false)
  ├─ generateTrails(connections)      // burg 間 Urquhart → 同上（既存 connection を再利用しやすい）
  └─ generateSeaRoutes(...)           // isWater: true → 別コスト（本改修の対象外）
```

`findPathSegments`:

1. `createCostEvaluator({ isWater, connections, … })` で辺コスト関数を得る  
2. 陸路では自国以外（`state !== 0 && state !== stateId`）を `Infinity`  
3. `findPath(start, exit, getCost, pack)` でセル隣接グラフ上の Dijkstra  
4. `getRouteSegments` で既存 connection との接続単位に分割し `connections` に登録  

陸路と水路は別々の connection 集合を持つ。道路が河川港に達していても、その河川を航行する `searoute` を「既存接続」と誤認して省略してはならない。

航行可能河川（同じ `riverId` の連続セルかつ両セルが `MIN_NAVIGABLE_FLUX` 以上）は水運の専用回廊として扱う。`roads` / `trails` はその連続辺を通れないが、河川セルへ一度入って港に達する、または河川セルを一度だけ横断して反対岸へ出ることはできる。これにより河川港の後背地道路と橋相当の接続を保ちながら、川筋の道路化を防ぐ。

編集時の `connectToRoad` / trail 追加なども同じ `createCostEvaluator` を使うため、**陸コスト式を直すと生成と手動接続の両方に効く**。

### 1.2 現行の陸コスト式

```ts
// routes-generator.ts getLandPathCost
distanceCost = distanceSquared(p[current], p[next])
habitabilityModifier = 1 + max(100 - habitability, 0) / 1000   // [1, 1.1]
heightModifier       = 1 + max(h[next] - 25, 25) / 25          // コメント上 [1, 3]
connectionModifier  = connections 済みなら 0.5 否则 1
burgModifier         = burg ありなら 1 否则 3
pathCost = distanceCost * habitability * height * connection * burg
```

水・氷河相当（habitability 0）は `Infinity`。

### 1.3 現行 `heightModifier` の実効値

```text
inner = max(h[next] - 25, 25)
heightModifier = 1 + inner / 25
```

| `h[next]` | `heightModifier` | 備考 |
| ---: | ---: | :--- |
| 20〜49 | **2.0 固定** | 丘陵差がコストに出ない |
| 50 | 2.0 | |
| 75 | 3.0 | |
| 100 | 4.0 | コメントの「[1,3]」を超える |

**問題点:**

1. **h &lt; 50 で標高差が無効** — 平地と中高度が同じ 2 倍  
2. **絶対標高のみ** — 到着セルの高さだけで、セル間の Δh（崖直登 vs 鞍部）がない  
3. **倍率の上限が弱い** — 平面で 2〜3 倍長い谷回りが、山直登に負けやすい  
4. **他係数の方が強い** — `burgModifier` 3、`connectionModifier` 0.5。先に山へ入ると既設扱いされ後続も張り付きやすい  
5. **habitability** は実質ほぼ無視（1.0〜1.1）  

観測された「heightmap と見比べて頭がおかしい山道強行軍が多い」は、このコスト構造と整合する。

### 1.4 国境界制約との関係

道路探索は **自国（または未領有 state=0）内** に閉じる。  
国内に平地回廊が無く首都が山岳だけで結ばれている場合、コストをどれだけ上げても **峠経路が残る**。  
これは「それでも峠が最短なら繋がってよい」という要件と一致し、**バグではなく期待挙動**とする。

### 1.5 中世ヨーロッパ像との対応（設計の動機）

- 日常幹線は谷・低地・河岸。山は森林・辺境で、通過は **少数の固定峠** に集中しがち  
- 国境があっても、実務的には「通れる・守れる道」が優先される  
- ゲーム上も「平坦ルートと必要峠」が稀少に残る方が、後続の grade / 商人選択（`route-grade-movement.md`）と相性が良い  

本改修は **生成段階で幹線を谷寄りにする** こと。旅行時の遅さ・馬打ラベルは別レイヤ。

### 1.6 影響範囲

| 影響する | 影響しない |
| :--- | :--- |
| 新規生成・routes 再生成の `roads` / `trails` 形状 | 既存セーブのルート（再生成するまで） |
| `pack.cells.routes` 隣接関係 | 海路コスト・`searoutes` |
| 交易・軍隊が辿る「既設路」トポロジ（結果として） | 交易の 2D 距離式そのもの（別計画） |
| 手動の陸路接続パスファインディング | heightmap / biome 生成 |

生成と旅行コストを **同一式にしない**（`route-grade-movement.md` § 方針）。  
生成 = どこに道を敷くか。旅行 = 敷いた道の遅さ。

### 1.7 実現可能性

| 観点 | 評価 |
| :--- | :--- |
| 変更箇所 | `getLandPathCost` 中心。必要なら roads/trails 感度分岐 |
| アルゴリズム | 既存 Dijkstra のまま |
| 性能 | 辺コスト計算がやや重い程度。辺数不変 |
| ブロッカー | なし。本体はチューニング |

---

## 2. 設計方針

### 2.1 原則

1. **高標高・急登りを有限の大きなコストに**（禁止しない）  
2. **平面の長い谷回りが、短い尾根直登に勝てる**程度の倍率  
3. **鞍部・峠だけが合理なら残る**  
4. 可能なら **roads は厳しく、trails は緩め**（幹線 vs 抜け道）  
5. 海路・水コストは不変  

### 2.2 推奨コスト構成

```text
pathCost = distanceCost
         * habitabilityModifier          // 現行維持
         * elevationModifier(h[next])   // 差し替え・強化
         * slopeModifier(h[cur], h[next]) // 新規推奨
         * connectionModifier
         * burgModifier
```

#### A. 絶対標高 `elevationModifier`（必須）

現行の `max(h-25, 25)/25` を廃止し、例えば:

```text
H0 = 30〜35          // これ未満はほぼペナルティなし
base = max(0, h[next] - H0) / (100 - H0)   // 0..1 付近
elevationModifier = 1 + K * base^p          // K ≈ 8〜20, p ≈ 1.5〜2
```

- 低地: ≈ 1  
- 中腹: 数倍  
- 高峰: 十倍オーダー（有限）  

定数はモジュール先頭の named constants に置き、後から Options 化できるようにする。

#### B. 登り勾配 `slopeModifier`（強く推奨）

```text
dh = max(0, h[next] - h[current])   // 上りのみ（下りは 0 加算でよい）
slopeModifier = 1 + S * (dh / dhRef)^q     // dhRef 例: 8〜15, S 例: 2〜6
```

同じ高所でも「徐々に上がる鞍部」と「一気に跳ねる直登」が分かれる。  
歴史的な「峠は通るが尾根直登は避ける」に近づく。

#### C. roads / trails 感度（推奨）

| | roads | trails |
| :--- | :--- | :--- |
| `K`, `S` | 強 | 弱（例: roads の 0.5〜0.7 倍） |
| イメージ | 荷車幹線は谷優先 | 峠の小道は残りやすい |

`createCostEvaluator` または `getLandPathCost` に `landMode: "roads" | "trails"` を渡し、`generateMainRoads` / `generateTrails` / 手動接続から適切な mode を指定する。

#### D. 触らないもの（この計画の初期）

- 高標高の `Infinity` 封鎖  
- 熊・山賊・danger の生成コスト  
- `routes-generator` 以外の旅行日数ロジック  
- heightmap 自体の再生成  

#### E. 任意の追随チューニング

標高を強くしたあと山岳 burg 経由がまだ多すぎる場合:

- `burgModifier` の非都市 3 をやや下げる、または  
- 高所 burg への到達に elevation が既に効くので様子見  

初期実装では **burg / connection は据え置き**、elevation + slope のみ変更。

### 2.3 数式の確定プロセス

1. 定数をコード内に仮置き（§2.2 のレンジ）  
2. unit test で「低地回廊 vs 直登山」が低地を選ぶことを固定  
3. 代表シードで目視（幹線が谷に寄るか、山岳州が孤立しないか）  
4. 必要なら `K` / `S` / `H0` を 1 段階調整  

Options UI への公開は **必須ではない**（Phase 2 任意）。

---

## 3. 実装計画

### Phase 1 — コスト式の差し替えとテスト（本丸）

**目標**: 陸路生成が低地・緩勾配を優先し、峠のみの場合は接続を維持する。

| # | 作業 | ファイル |
| :--- | :--- | :--- |
| 1.1 | 陸コスト用定数を定義（`H0`, `K`, `p`, `S`, `dhRef`, trails 倍率） | `routes-generator.ts` |
| 1.2 | `elevationModifier` / `slopeModifier` を純関数またはクロージャ内関数として実装 | 同上 |
| 1.3 | `getLandPathCost` を新式に差し替え。旧 `heightModifier` 削除 | 同上 |
| 1.4 | `landMode: "roads" \| "trails"` を cost evaluator に渡し、感度を分岐 | 同上 + 呼び出し元 |
| 1.5 | unit test: 低地回廊が直登山に勝つ | `routes-generator.test.ts` |
| 1.6 | unit test: 山しかない廊で path が null にならない（有限コスト） | 同上 |
| 1.7 | unit test: trails の方が急坂を許容しやすい（mode 差を入れる場合） | 同上 |
| 1.8 | searoutes / river-aware 既存テストが緑のまま | 同上 |
| 1.9 | `tsc` / lint / madge / 関連 vitest | CI 相当 |

**受け入れ条件:**

- [x] 合成パックで「平坦 1.5〜2 倍長い道」vs「短い高山直登」→ 平坦が選ばれる  
- [x] 高地のみの接続で path が得られる  
- [x] 海路テスト不変  
- [x] コメントと定数が式の意図を説明している  

### Phase 1 実装ログ

- `src/generators/routes-generator.ts`:
  - 定数: `LAND_ROUTE_ELEVATION_H0=32`, `K=12`, `P=1.75`, `SLOPE_S=4`, `DH_REF=10`, `Q=1.5`, trails 感度 `0.6`
  - `landRouteElevationModifier` / `landRouteSlopeModifier`（export、テスト用）
  - `createCostEvaluator({ landMode, landRouteGenerationMode })` — `elevationAware` で elevation × slope、`legacy` で旧 `heightModifier`
  - `generateMainRoads` → `landMode: "roads"`、`generateTrails` / `connectToNetwork` → `"trails"`
  - `Routes.generate(..., seaMode?, landMode?)` が `options.landRouteGenerationMode` を永続化（既定 `elevationAware`）
- `routes-generator.test.ts`: 低地回廊優先、legacy は尾根直進、峠必須接続、trails &lt; roads、persist、海路非影響
- 高標高の `Infinity` 封鎖はしていない（sole pass は接続）

### 再生成モード選択（sea と同型）

| 項目 | 内容 |
| :--- | :--- |
| 型 | `LandRouteGenerationMode = "legacy" \| "elevationAware"`（`src/types/models.ts`） |
| 永続 | `WorldOptions.landRouteGenerationMode` |
| UI | Tools → Regenerate routes 確認ダイアログ「Land route pathfinding」／Options → Generation「Land routes」 |
| 配線 | `tools.ts` → `Routes.generate`；`load.ts` は sea モードあり時に再構築。land 未保存は **elevationAware** |
| 既定（新規生成・未指定） | **`elevationAware`** |

### 生成オプション: elevation aversion 係数

Maria マップ検証: Doberedexau (h=32≈116m) → Zetaramizte (h=34≈147m) の **Voronoi 最短** は  
`4802–4803–4804–4805`（h 32–**50**–**53**–34 ≈ 116–**512**–**602**–147m、約 +500m 登り）。

**旧コストの問題**: 絶対標高×勾配の積が大きく、かつ `distanceSquared` の多段和が短い辺を有利にするため、5×近い谷回りが既定 aversion で勝ってしまうことがあった（距離も累積登りも悪化しうる遠回り）。

**再チューニング**: elevationAware は **線形平面距離** + **柔らかい絶対標高** + **登り Δh** + **uncapped 高峰ペナルティ**（`h > 55` から。h=55 ≈665 m の局所尾根は許容、h=70 ≈1227 m は強く回避）。

**Nesia (Shafushahr–Sardan)**:
- **望ましい**: `5100–5101–5102–5272`（5102 = h=55 ≈665 m）。`5100–5431–5432–5272` も同程度に妥当
- **問題**: 余計な **5271**（h=70 ≈1227 m）を挟むこと（例: `5101–5271–5272`）
- **根因**: `findPath` が出口隣接で即 return していたため、prefix が少し安い高峰 + 最後の安い下りが中丘尾根より先に確定し得た。加えて cost を Float32・priority を f64 のまま stale 判定すると elevation コストで経路が null になり得た
- **修正**: 出口はキュー pop 時に確定；cost は Float64Array；高峰ペナルティは `h > 55`（665 m 許容、1227 m 回避）

| 項目 | 内容 |
| :--- | :--- |
| オプション | `landRouteElevationAversion`（0–3、既定 **1**） |
| UI | Tools → **Regenerate routes** ダイアログ（Options → Generation には置かない） |
| 意味 | 0 = 標高/勾配ペナルティ無し／1 = 既定／&gt;1 = 谷を強く選ぶ |
| 適用 | `elevationAware` 時のみ（legacy ではスライダ無効） |
| 永続 | `WorldOptions`（マップに保存；regenerate で更新） |

### Phase 2 — 目視チューニングと任意 UI（任意）

| # | 作業 |
| :--- | :--- |
| 2.1 | 山岳寄りシードで幹線が谷に寄るか確認。メモを docs/debug または本ドキュメント追記 |
| 2.2 | 必要なら `K`/`S` を 1 回調整 |
| 2.3 | （任意）Options に “Land route elevation aversion” スライダ |
| 2.4 | （任意）`burgModifier` 微調整 |

### Phase 3 — 後続計画との接続（別ドキュメント）

本改修完了後:

1. 生成路が谷寄りになる → 「残った峠」が意味を持つ  
2. [`route-grade-movement.md`](./route-grade-movement.md) の Phase 0（計測表示）→ Phase 1（旅行日数・商人の `preferSpeed` / `avoidHardPass`）  

生成コストと旅行 grade は **式を共有しない**。必要なら「どちらも heightToMeters を使う」程度の util 共有に留める。

---

## 4. テスト設計（詳細）

### 4.1 低地回廊 vs 直登山

最小セル配置のイメージ:

- start / exit を左右の低地 burg セル  
- 直線上に高 `h` の山稜  
- 上下に `h` の低い迂回セル列（平面距離は直線より長い）  

旧コストまたは弱い elevation では山を突っ切り、新コストでは迂回を選ぶことを assert（path の cell 列に高 h セルが含まれない、または max h が閾値以下）。

### 4.2 峠必須

- start / exit が二つの谷に分かれ、間は高 h の鞍部 1 本のみ  
- path が non-null で鞍部を通る  

### 4.3 回帰

- 既存 `RoutesModule river-aware water cost`  
- port connect / searoutes 系  

### 4.4 手動確認チェックリスト

- [ ] 新規マップで道路が稜線ジグザグしすぎない  
- [ ] 山岳国家の首都間が途切れない  
- [ ] trails が道路より峠を使いすぎない／使い足りないのバランス  
- [ ] Regenerate routes で意図どおり再配線  

---

## 5. リスクと緩和

| リスク | 緩和 |
| :--- | :--- |
| 山岳シードで道路が極端に遠回り | 峠必須テスト + 目視。`K` を下げる |
| 既存ユーザの「いつものシードの道」が変わる | 仕様変更として受け入れる。lock 済み手動路は維持 |
| connection 0.5 が山道を固定化 | 生成順は roads→trails のまま。最初の roads が谷に寄れば後続も寄る |
| slope と elevation の二重計上で過剰 | 片方だけでも Phase 1 可。まずは elevation 強 + 軽い slope |
| `distanceSquared` が短い急坂を相対的に安く見せる | slopeModifier で補正。必要なら後で距離項を見直す |

---

## 6. 作業量見積もり

| 項目 | 規模 |
| :--- | :--- |
| Phase 1 実装 + テスト | 小〜中（半日〜1 日目安） |
| Phase 2 チューニング | 中（体感依存） |
| Options UI | 小（任意） |

---

## 7. 明示的非目標

- 高標高セルの通行禁止  
- 熊・山賊・danger による生成回避  
- 海路・heightmap・biome 生成の変更  
- 交易 Land 距離やキャラバン速度への直接配線（別計画）  
- 既存セーブのルート自動張り替え  

---

## 8. セッション引き継ぎ

**Phase 1 完了。** 次は任意の Phase 2（代表シード目視・定数微調整）または [`route-grade-movement.md`](./route-grade-movement.md) Phase 0。

確認済み:

- 高 elevation を探索負荷として大きくする → **実装済**  
- 峠が唯一の合理ルートなら接続 → **実装済（有限コスト）**  
- 旅行時 grade / 商人選択 → **別ドキュメント**  

チューニング用の現行定数（コードと同期）:

| 定数 | 値 |
| :--- | ---: |
| `LAND_ROUTE_ELEVATION_H0` | 32 |
| `LAND_ROUTE_ELEVATION_K` | 12 |
| `LAND_ROUTE_ELEVATION_P` | 1.75 |
| `LAND_ROUTE_SLOPE_S` | 4 |
| `LAND_ROUTE_SLOPE_DH_REF` | 10 |
| `LAND_ROUTE_SLOPE_Q` | 1.5 |
| `LAND_ROUTE_TRAILS_SENSITIVITY` | 0.6 |

未決（Phase 2）:

- 目視後の `K` / `S` / `H0` 微調整  
- Options 公開の要否  
`)
