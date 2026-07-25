# 未領有フロンティアと段階的領土拡張

- **Status**: In progress (Phase 0–2 complete; Phase 3 onward planned)
- **Last updated**: 2026-07-25
- **Owner**: Core simulation / map generation
- **Related**: [population-dynamics.md](../simulation/population-dynamics.md), [advance-time.md](../simulation/advance-time.md), [disaster-mode.md](disaster-mode.md), [unite-data-and-map.md](unite-data-and-map.md), [military-defense.md](military-defense.md)

## 0. 要約

現在の地図は、初期人口率を下げても、ほぼ全ての居住可能セルに人口と国家領が置かれる「薄く均一な世界」になる。
本計画は、人口を都市・河川・海岸・街道の周辺へ集め、政治境界の外側に**未領有フロンティア**を残す。

国家は Advance Time を通じ、余剰人口と treasury を使って前哨地を送り、村落を定着させ、初めて周囲を統治領へ編入する。
したがって開拓は、人口増加だけではなく、道路・治安・食料備蓄・災害復興に投資する理由になる。

この計画の最初の版は、国家が未領有地を主張する制度、係争地、植民地独立を扱わない。まずは「無主地」から「実効支配された統治領」へ移る一方向の流れを成立させる。

### 0.1 再設計への移行（2026-07-25）

Phase 1–2 の実装は、無主地、人口 cohort、`state = 0`、州外地を扱う互換性の確認には成功した。一方で、世界全域の定住セル順位付け、Burg の独立配置、State の後付け行政回廊、State 後の Routes 生成が別々に働くため、地形・気候・道路で説明できない細長い領土を作る。

したがって Phase 1–2 は完了ではなく **prototype** として残し、チェックリストを再オープンする。再設計では、定住圏・初期集落・初期移動網を先に作る `Settlement Foundation Module`、その移動網から国家と統治圏を導く `Initial Polities Module`、移動網を延長して開拓する Phase 3 を順に実装する。既存 prototype は characterization と比較用の実装として維持し、受け入れ条件を満たす新実装へ段階的に置き換える。詳細な問題記録は [country-and-border.md](frontier/country-and-border.md) を参照。

## 1. 目的と非目標

### 1.1 目的

- 初期世界に、人口 0 かつ `state = 0` の居住可能な陸地を意図的に残す。
- 初期人口率と人口分布を分離し、開拓前線・散在する諸国・標準・密集文明圏を生成時プリセットとして選べるようにする。
- 開拓前線では、森林適地の未定住セルを高い森林被覆で始め、定住・道路・伐採に伴って農地・牧草地・管理林へ段階的に転換する。
- Advance Time に、人口・資金・安全・接続性を消費して無主地を定住・編入するフローを加える。
- 領土拡張を「一セルの偶発的な人口移動」ではなく、前哨地・村落・統治領の明示的な段階として扱う。
- 災害、経済、軍事が、新しい辺境を維持するための内政支出へ接続できる土台を作る。
- SVG と WebGL hybrid の両方で、政治領・無主地・前哨地を同じ canonical state から表示する。

### 1.2 非目標

- 初回から歴史的に正確な植民地制度、領有権、条約、国境紛争を再現すること。
- 無主地を「資源も住民も危険も存在しない空白」とすること。
- 日次で全セルの領土再分割、州再生成、道路再生成を行うこと。
- 現在の State / Province editor の全 UX を同時に再設計すること。
- Nobility の都市占領を、開拓システムで置き換えること。

## 2. 用語と不変条件

| 用語 | 定義 | 初期版での表現 |
| --- | --- | --- |
| 無主地 (Unclaimed land) | 居住可能だが、どの国家も実効支配していないセル | `cells.state = 0`、`cells.province = 0` |
| 前哨地 (Outpost) | 開拓中の小規模拠点。国家が支援するが、まだ通常の Burg / 州ではない | simulation-owned cell stage |
| 定住地 (Settlement) | 継続人口を持ち、道路・食料・防衛の対象になる村落または Burg | `pop > 0`、必要時に Burg |
| 統治領 (Governed territory) | 税・徴兵・災害救援・国境防衛の対象となる実効支配セル | `cells.state = stateId` |
| 州 (Province) | 複数の統治領と Burg を束ねる既存の行政単位 | `cells.province = provinceId` |

`biome` は潜在自然植生であり、`Grassland` を農地や人為的な開けた土地と同一視しない。気候上の森林適地、自然草原、土地被覆の定義は [バイオーム拡張計画](biomes.md) に従う。本書では、開拓によって変化する `landCover` と `forestCover` を扱う。

### 2.1 不変条件

1. `cells.state` は今後も **実効支配者** を表す。`0` は無主地であり、国家統計、徴兵、国家税、国家単位の food stress から除外する。既存の `states[0]` が持つ外交史用の役割は維持するが、無主地に外交的な主体性を与えない。
2. `cells.province` は統治領外では常に `0`。未領有地に暫定州を作らない。
3. `capacity` は土地の潜在的な環境収容力であり、無主地でも保持する。`pop = 0` は居住不能ではなく未定住を意味する。
4. 既存の `foodStress` は戦争による農事被害だけを表し続ける。災害由来の食料ショックは別フィールドで合成する。
5. 都市占領と平時開拓は別の Generator module にする。前者は Nobility、後者は host-owned Frontier Expansion が所有する。
6. 領土が変わる操作は `WorldRuntime` の変更通知を通し、Renderer は state を変更しない。

### 2.2 将来に回す概念

将来、国家が実効支配前に領有を主張する必要が出た時だけ `claim` を導入する。最初から `claim`、`control`、`occupation` を混在させない。二つ以上の実装が必要になった時点で、領有状態の Adapter を持つ real seam にする。

## 3. 現行実装との差分

| 現行 | フロンティア化後 | 変更の所在 |
| --- | --- | --- |
| `rankCells()` が全適地へ `capacity × initialPopulationSaturation` を配り、Burg 候補も人口配置と独立して選ぶ | 定住クラスタにだけ人口と初期 Burg 候補を置き、無主地は `pop = 0` のまま capacity を保持 | `src/main.ts`、初期定住分布 Module |
| `States.expandStates()` が首都から広域へ flood-fill する | 首都と既存定住地を核に、限られた統治領だけを生成する | `src/generators/states-generator.ts` |
| 人口移動は過密セルから隣接セルへの一回の移送 | 開拓候補の選択、前哨地、定着、編入を年次で進める | 新規 Frontier Expansion Module |
| `cells.state` の変化後、統計・州・隣接国は定期的には再構成されない | 編入イベントで政治集計、frontier、描画をまとめて更新する | `WorldRuntime` command / change topics |
| 州は生成時の State 領全体を対象に作る | 州外の無主地を許し、行政密度を満たした統治領だけを州へ昇格する | `src/generators/provinces-generator.ts` |

現行の `simulateDemographics()` は `pop = 0` のセルを処理せず、過密時だけ移住させる。そのため人口分布プリセットだけを導入しても、無主地が自然に開拓されることはない。開拓候補の探索と移住実行を独立 Module に集める必要がある。

## 4. Target architecture

### 4.1 所有権

```text
MapData / WorldContext
  terrain, biome, rivers, routes
  cells.state       = 実効支配者。0 は無主地
  cells.province    = 行政編入済みの州。0 は州外

SimulationData / SimulationContext
  population cohorts, carrying capacity
  landCover / forestCover（開墾・伐採・放棄後の再生によって変化する土地被覆）
  frontier cell stage（dense column）
  project progress, settlement support, state frontier budget / policy cooldown（host-owned frontier slice）

Frontier Expansion Module
  初期定住分布を生成する
  初期の森林被覆を設定し、開墾・再生を実行する
  年次の開拓候補を評価する
  前哨地・村落・統治領への遷移を実行する
  必要な WorldChangeSet を発行する
```

`Settlement Foundation Module` は、水源・気候・資源から初期定住圏を選び、Burg 候補と初期移動網を同じ計画から作る。`Initial Polities Module` はその移動網から国家核と統治圏を導く。`Frontier Expansion Module` は候補探索、人口移送、支出、経路延長、編入、更新通知を所有する。それぞれを一つの小さな Interface の背後に隠す deep module とする。削除すると各 caller が同じ適地評価・経路探索・state 変更・統計更新・描画通知を再実装するため、十分な leverage と locality がある。

初期定住と Advance Time の開拓は同じ「定住圏・経路候補評価」を共有するが、生成時と時間経過時では RNG・資金・イベント通知が異なる。共通の純粋な適地・経路評価を内部 seam とし、二つの Module の公開 Interface は分ける。

### 4.2 フロンティア cell stage

| Stage | `state` | 人口 | 意味 | 次段階の条件例 |
| --- | ---: | ---: | --- | --- |
| 0: wilderness | 0 | 0 | 無主地。capacity と自然資源のみ | 開拓団の到着 |
| 1: outpost | 0 | 少量 | 国家支援中の前哨地。独立国家税・徴兵の対象外 | 食料維持、治安、定住期間 |
| 2: settlement | 0 | 継続人口 | 村落。周辺に国家が存在しても、まだ統治は未成立 | 行政費、道路または港、最低人口 |
| 3: incorporated | stateId | 継続人口 | 統治領。通常の国家集計へ入る | 州昇格の条件 |

`outpost` と `settlement` は初期版では既存 Burg と同一視しない。一定人口・接続性を満たした時にのみ `Burgs.add()` を使って Burg を作る。これにより、現在の「人口が閾値を超えた全セルで Burg を生む」挙動を開拓の到達点へ置き換えられる。

### 4.3 土地被覆と森林被覆の遷移

`landCover` と `forestCover` は `SimulationContext` が所有する可変状態とする。`WorldContext` の `biome` は気候由来の潜在自然植生として維持し、農地化や伐採のために書き換えない。レンダラーは両方を readonly で読み、バイオーム色の上に土地被覆・森林密度を描画する。

| 状態・イベント | 森林適地 | 自然草原・砂漠など森林非適地 |
| --- | --- | --- |
| `frontier` の未定住セル | `naturalForest`、高い `forestCover` で開始 | 気候に応じた開放的な自然土地被覆で開始 |
| 前哨地の設置 | 小規模な伐採地・道・補給地だけを作る | 小規模な道・補給地だけを作る |
| 村落・統治領への成長 | 食料需要と接続性に応じ、`managedForest`、`cropland`、`pasture` を周辺へ拡大 | `cropland`、`pasture` 等を周辺へ拡大 |
| 伐採・造船・採掘 | `forestCover` を低下させ、木材供給・道路建設・防衛に影響させる | 該当なし、または低木・草地資源を別途扱う |
| 放棄・人口減少 | 二次林として徐々に `forestCover` を回復させる | 気候に応じた草地・低木地へ回復させる |

開墾の広さと速度は、人口、食料需要、道路・河川への接続、治安、国家の資金、地形、バイオームの森林再生力で制限する。国家領であることだけを理由に、セル全体を即座に農地へ転換してはならない。

### 4.4 領土編入のトランザクション

一セルごとの `cells.state` 代入を公開操作にしない。編入は次を原子的に実行する Implementation に閉じ込める。

```text
開拓団到着
  → outpost を作る
  → 定住支援・人口維持を年次評価
  → settlement が成立
  → 接続した行政圏セルを incorporated にする
  → cells.state / cells.province を更新
  → State / Province 集計、隣接国、frontier を再計算
  → map.politics / map.settlements / simulation.* の変更を一度だけ通知
```

政治領、州、国家統計の再集計は日次ではなく、`incorporated` または州昇格という離散イベント時に限る。これにより 4 層ルールを守りながら、WebGL と SVG の cache invalidation を局所化する。

## 5. 生成時プリセット

初期 UI は高度な係数を直接見せず、次のプリセットだけを提供する。詳細値は将来 Advanced settings へ出す。

| ID | 表示名 | 初期人口率の目安 | 初期定住面積 | 集中度 | 国家領 | 主な遊び |
| --- | --- | ---: | ---: | ---: | --- | --- |
| `frontier` | 開拓前線 | 20–35% | 低い | 高い | 首都・既存定住地周辺のみ | 入植、道路、辺境防衛 |
| `scattered` | 散在する諸国 | 40–55% | 中 | 中 | 主要都市圏のみ | 地方統合、交易、治安 |
| `standard` | 標準 | 60% | 高い | 低〜中 | 現行に近い | 戦争、経済、災害 |
| `dense` | 密集文明圏 | 75–90% | 非常に高い | 中 | ほぼ全適地 | 都市経済、疫病、食料危機 |

内部パラメータは次の三つに限定する。

- `initialPopulationSaturation`: 全世界の人口量
- `settledFootprint`: 初期に人が住む適地の割合
- `settlementClustering`: 首都、河川、海岸、道路、既存 Burg への集中度

`frontier` では、`settledFootprint` の外側にある森林適地を `naturalForest` と高い `forestCover` で初期化する。これは `Grassland` バイオームを森林へ置換する処理ではなく、気候上の潜在自然植生に対応した未開の土地被覆を設定する処理である。`dense` では人口と道路に近い土地ほど初期農地・牧草地の比率を上げるが、森林適地のすべてを開墾済みにしない。

`manors` は Burg 数であり、人口分布ではない。プリセットが推奨値を設定してよいが、独立した生成オプションとして残す。

## 6. 年次開拓ループ

開拓は日次ではなく、年または季節の区切りで一度だけ評価する。`registerSimulationSystem()` の cadence は tick 数であり暦年ではないため、Frontier Expansion Module は politics phase で実行し、永続化される暦日ガードにより評価回数を制御する。候補は次の順で選ぶ。

1. **送り出し国家**: treasury が最低留保額を超え、統治領に人口余剰があり、戦争・飢饉・重大災害中ではない State。
2. **送り出し地**: 人口が capacity の 80〜90% 以上、または政策による計画移住対象の Burg / rural cell。
3. **候補地**: 無主地で、居住適性、淡水・河川・港、道路または既存定住地からの到達性、danger、気候リスクを評価する。
4. **支出と移送**: treasury、食料、成人男女を移送する。移送後も送り出し地の人口・兵役制約を満たすことを確認する。
5. **土地利用**: 前哨地・村落の食料、木材、道路、防衛の需要に応じ、周辺の `landCover` と `forestCover` を段階的に更新する。森林非適地を森林へ変えず、未定住の森林適地を即座に農地化しない。
6. **定着判定**: 前哨地は毎年、食料、治安、災害、接続性を判定する。失敗すれば放棄して二次林化し、成功すれば村落へ進む。
7. **編入判定**: 村落が人口・期間・行政投資・接続性の条件を満たした時だけ、周囲の行政圏を State に編入する。

同一 State が一年に開始できる事業数は、財政・行政力・前哨地維持費で制限する。これにより、最適行動が「全方向へ毎年一セルずつ塗る」ことになるのを防ぐ。

## 7. 災害・経済・軍事との接続

| 領域 | 接続 | 初期版での扱い |
| --- | --- | --- |
| 災害 | 前哨地は干魃、洪水、野盗、疫病に脆弱。救援を受けられないと定着失敗 | 災害 Module 実装前は、簡易な danger / food / maintenance だけで判定 |
| 経済 | 開拓は treasury と food stock を消費し、編入後に初めて通常の税・生産・徴兵に入る | Economy extension 無効時も基本人口・資金判定を維持する |
| 森林 | 木材採取・開墾・造船は森林被覆を下げ、放棄地と管理された森林は再生する。森林適地かどうかはバイオーム定義から読む | Economy extension の `forestDepletion` と将来的に統合し、二重に森林を消費しない |
| 食料 | 出発地からの食料供給、現地 capacity、備蓄が定着率を決める | `foodStress` と混ぜず、将来は climate food stress と合成 |
| 軍事 | 無主地との接点は対国家国境ではなく frontier。砦・巡回・護衛の対象 | `analyzeFrontiers()` と別に `analyzeUnclaimedFrontier()` を導入する |
| 外交 | 無主地を越えた他国との接触で初めて通常の隣接国になる | 初期版は claim・係争地を作らない |

## 8. フェーズと進捗管理

### Phase 0 — 基準固定と移行設計

- [x] 既存の `initialPopulationSaturation = 60`、State / Province 統計、Economy 生産、軍事徴兵の characterization tests を追加する。
- [x] `cells.state = 0` を読む主要 Module を一覧化し、無主地の扱い（除外・通過可・採取可）を決定する。
- [x] `.fmg` save migration の version と、旧セーブを `standard` として読む既定値を決める。

### Phase 0.5 — 土地被覆の基準固定

- [ ] `biome`（潜在自然植生）と `landCover` / `forestCover`（可変の土地利用・樹冠被覆）の責務を型と保存形式に明記する。
- [ ] `frontier`、`standard`、`dense` の固定seedで初期森林被覆・農地被覆を検証する characterization tests を追加する。
- [ ] 既存 `forestDepletion` と開墾・再生を統合する所有権を決め、二重に減衰させないことを検証する。
- [x] 生成時・Advance Time 時の政治変更に使う `DataTopic` を確定する。

**完了条件**: 既存の標準世界が新しい field を欠いても同じようにロード・生成・Advance Time でき、frontier feature を無効にすると既存テストが通る。

### Phase 1 — 定住圏・初期集落・初期移動網（prototype を置換）

- [x] `initialSettlementPattern` の archive 互換を維持しつつ、開始状況・定住圏数・人口予算を分離する。
- [x] 水源、降水量、成長期、温度、地形、森林・沿岸資源、danger を使う `Settlement Foundation Module` を実装する。
- [x] 世界全域のセル順位付けではなく、少数の river basin / lake / coast / spring を定住圏として選び、その内部へ人口 cohort と Burg 候補をコンパクトに配置する。
- [x] Burg 候補を独立した Quadtree 配置で追加せず、定住圏計画のノードから materialize する。
- [x] State 生成より先に、集落ノード間の trail / river route / coastal link を生成する。
- [x] 未定住地、定住圏、初期移動網を SVG / WebGL hybrid の両方で可視化し、人口 overview の unclaimed / unsettled 集計を維持する。
- [x] `standard` は互換 Adapter として既存の見た目・人口総量を保つ。

**完了条件**: 同 seed で、首都・Burg・人口・初期移動網が同じ定住圏で説明できる。Cold Desert の河川は少数の生活可能ノードを作り得るが、流域全体を自動的に埋めない。

### Phase 2 — 初期国家と統治圏（prototype を置換）

- [x] `Initial Polities Module` が、初期移動網の首都候補・集落ノードを network cost で国家へ束ねるようにする。
- [x] `statesNumber` を直接の State 数ではなく、定住網に対する polity density / 上限として再定義する。
- [x] 統治領を、首都または港へ到達できる定住圏と初期移動網の service area から導く。道路のない地形を領土接続だけのために編入しない。
- [x] 同一陸地で到達不能な Burg を最寄り State へ割り当てず、海を越える飛地は港・海路・補給の条件を満たすまで作らない。
- [x] 現行の後付け行政回廊 (`connectDetachedStateNuclei`) を新しい移動網ベースの統治圏生成へ置き換える。完全包囲された小さな空洞だけを正規化する。
- [x] Province generator、State statistics、neighbors、frontier 表示が `state = 0` / `province = 0` を維持し、`states[0]` に外交的な主体性を与えないことを再検証する。

**完了条件**: 国家領の全連結成分には実在する初期移動経路があり、道路・河川・港湾で説明できない細長い領土を作らない。国家は Burg、軍、経済、外交を正常に持つ。

### Phase 3 — 前哨地と計画開拓

- [ ] simulation-owned frontier stage と、年次 Frontier Expansion Module を追加する。
- [ ] 人口余剰、treasury、食料、到達性、danger を使った候補評価を実装する。
- [ ] 前哨地の設立、維持費、放棄、村落への定着を実装する。
- [ ] 既存の自動 Burg spawning を、frontier stage と矛盾しない条件へ変更する。
- [ ] 決定性を simulation RNG と archive round-trip で保証する。
- [ ] Economy の同一 tick 内の税収確定には依存せず、前回確定 treasury を使う暦境界の予算評価を定義する。

**完了条件**: 十分な資金・人口を持つ State が数年〜数十年で前哨地を作り、危険・飢饉・資金不足なら失敗または停止する。

### Phase 4 — 統治領編入と再集計

- [ ] 村落と接続した行政圏を一括編入する transaction を実装する。
- [ ] 編入後に State / Province 統計、隣接国、frontier、renderer topics を一回だけ更新する。
- [ ] 新領土の税、生産、food stress、徴兵、道路・市場再評価を接続する。
- [ ] 無主地に対する frontier 防衛、巡回、前哨地の救援を追加する。

**完了条件**: 編入後の領土は表示、国家統計、Economy、人口、軍事で一貫して同じ owner を読む。

### Phase 5 — 災害・内政・AI

- [ ] 干魃・洪水・疫病・野盗などの災害が、前哨地の定着率と復興費に影響するようにする。
- [ ] 穀倉、井戸、道路、砦、衛生などの内政投資が、開拓・維持・災害軽減へ複数の leverage を持つようにする。
- [ ] Nobility の国家 AI が、戦争目標だけでなく frontier 防衛・開拓予算を判断できるようにする。
- [ ] UI に候補地、必要資金、失敗理由、次段階条件を説明する。

**完了条件**: Advance Time で蓄積した資産を、戦争・災害救援・新規開拓の間で選んで使うゲームループになる。

### Phase 6 — 領有主張・係争地（任意）

- [ ] 実効支配と法的主張を区別する必要性を再評価する。
- [ ] 必要であれば `claim` data と表示を導入し、無主地、主張地、占領地を区別する。
- [ ] 外交、条約、植民地、先住勢力などをこの段階で検討する。

**開始条件**: 実効支配だけでは、複数国家の開拓競争または戦争後の領有表現を説明できなくなった時。

## 9. テスト戦略

| 層 | 対象 | 確認事項 |
| --- | --- | --- |
| Unit | 定住クラスタ評価 | 同 seed・同 option で同じ人口分布、capacity 保存、無主地の生成 |
| Unit | 前哨地候補評価 | 到達性、danger、河川・港、資金、人口余剰の順位 |
| Unit | 編入 transaction | state / province / population / topics が整合し、部分更新が残らない |
| Integration | Advance Time | 年次開拓、放棄、定着、編入、災害中断の連続動作 |
| Archive | `.fmg` round-trip | frontier stage、進捗、RNG、未領有地が保存・復元される |
| E2E | SVG / webglHybrid | 両 render mode で無主地、前哨地、統治領を表示・選択できる |
| Regression | standard preset | 既存 seed の人口、Burg、State、Province、Economy が許容範囲で維持される |

E2E は必ず render mode を固定する。WebGL-managed SVG layer を selector に使う既存テストは `svg` を明示するか、WebGL pick helper を使う。

## 10. 未解決の設計判断

| 論点 | 選択肢 | 推奨する初期判断 |
| --- | --- | --- |
| 無主地の文化・宗教 | 既存 spread を残す / 空値化する | 文化・宗教は残す。政治支配だけを空白化する |
| 無主地の資源生産 | 生産しない / 市場なしで採取だけ / 国家が遠隔利用 | 通常の国家税・市場生産はしない。後者二案は Economy 設計時に決める |
| 無主地の通行 | 完全通行可 / 移動コスト増 / 危険に応じて閉鎖 | 通行可だが、道路外コストと danger を適用する |
| 初期の中立 Burg | 無主地に残す / 必ず State を作る | 初期版では既存 Burg は原則 State の核にする。無主の集落は後段 |
| 新領土の州化 | 即時 / 人口・行政条件後 | 条件後。開拓の成果を段階化する |
| プレイヤー操作 | 自動のみ / 国家ごとの方針 / 個別プロジェクト | Phase 3 は自動 + 方針、Phase 5 で個別プロジェクト |

## 11. 進捗ログ

### 2026-07-24 — Phase 0 完了

#### 互換性基準と characterization

- `src/generators/initialPopulationCohorts.ts` に、現行 `rankCells()` の `capacity × 60%` と年齢 cohort 比率を純粋 Module として固定した。`standard` はこの Module を使うだけであり、生成結果を変えない。
- `stateProvinceStatistics.test.ts` は現行の集計を明示する。現時点では `states[0]` が `state = 0` の陸地を集計する一方、`province = 0` は Province 集計から除外される。これは Phase 2 で意図的に切り替える compatibility baseline である。
- Economy は `taxes-generator.test.ts` の neutral-state 非課税テスト、軍事は `manpower.test.ts` の `cells.state === stateId` に限定した人口・徴兵テストを基準とする。Food/market 生産には現状 `state = 0` の専用ガードがないため、無主地に market を割り当てない Phase 1–2 の前提で既存挙動を維持する。

#### `cells.state = 0` の主要 consumer と初期判断

| Module 群 | 現在の読み方 | Frontier 初期版の扱い |
| --- | --- | --- |
| `states-generator`, `provinces-generator` | State 0 は neutral 集計、Province 0 は未所属 | Phase 2 で State 0 を国家集計・外交から除外。Province 0 は維持 |
| `draw-states`, `draw-borders`, WebGL adapters | 0 を塗りなし / 国境外として描画 | 無主地として描画。Renderer は canonical state を読むだけ |
| `demography-simulator` | 0 のセルにも隣接移住でき、過密時には state を移す | Phase 3 で outpost/settlement 経路に置換。単発の state 移送は開拓を編入しない |
| `manpower`, `military-generator` | State id ごとの cells/burgs だけを集計 | 0 は徴兵・国家軍事から除外 |
| Economy (`taxes`, `markets`, `foodProduction`) | 税は state 0 を除外。market/food は市場割当を読む | 無主地は通常の国家税・市場生産から除外。採取可否は Economy 接続フェーズで決める |
| `routes-generator`, `regimentMovement` | 0 は通行可能な地形で、国家所有とは別 | 通行可。道路外コストと danger は将来の候補評価で加算 |
| `frontierAnalysis` / Nobility | State id の相違を国境・占領の入力に使う | 無主地 frontier は国家間国境と分離し、平時開拓は host-owned Module が所有 |
| Editors / tooltip / cell-info | 0 を「未所属」として表示または編集対象外 | 編集 UX は現状維持。Phase 5 まで個別開拓操作を追加しない |

#### `.fmg` migration

- `WORLD_ARCHIVE_SCHEMA_VERSION = 2` を Frontier migration version とする。
- schema v1 を decode 時に受理し、`world.options.initialSettlementPattern` が無い場合は必ず `"standard"` を補完する。v2 で保存し直される。
- legacy positional `.map` も同じ normalizer を通す。feature を未使用の間は `standard` が従来の人口配置を完全に維持する。

#### 政治変更の DataTopic

Frontier の進行だけでは `simulation.cells` を発行する。outpost/settlement の可視化も変わる場合は `map.settlements` を追加する。`incorporated` transaction は一回の commit で次を発行する。

`simulation.cells`, `simulation.states`, `map.politics`, `map.settlements`

道路・港を transaction 内で新設または再計算した時だけ `map.networks` を追加する。新しい `frontier.*` topic は Phase 0 では導入しない。これら既存の coarse topic は SVG と WebGL hybrid の両方に同じ変更通知を渡す。

### 2026-07-24 — Phase 1 prototype 実装

- `Settlement Pattern Module` は文化圏の生成後、Burg の生成前に population/cohort を配置する。Culture は適地に残すため、未定住セルも文化的には空白にならない。`capacity` は決して変更しない。非 standard preset は river、harbor、coast の適性と settlement hub を使って適地を選び、選択済み capacity に人口量を再配分する。
- `standard` は適地の全セルへ旧来どおり capacity の 60% を配置し、追加の RNG を消費しない。そのため後続の Burg / State の seeded generation を変えない。
- Generation settings に 4 preset を追加した。プリセット選択時には推奨の population saturation を設定するが、既存の Population % slider は独立して上書きできる。
- Population layer は `pop = 0` の居住可能セルを薄い footprint として描画する。SVG と WebGL hybrid とも同じ `pack.cells.pop` を読む。前哨地は Phase 3 の simulation-owned stage が導入されるまで存在しないため、候補地表示は未定住 footprint として扱う。統治領は既存の States overlay が canonical `cells.state` から描画する。
- Population Overview に unclaimed capacity、unsettled capacity、governed population を追加した。Phase 2 で State 0 の領土が初期生成されると、同じ集計がそのまま無主地の値を示す。

この実装は archive 互換、無主地の可視化、population/cohort の基準として残す。ただし、世界全域のランキングで定住セルを選ぶため、定住圏と初期移動網を同時に作る再設計の受け入れ条件は満たしていない。

### 2026-07-24 — Phase 2 prototype 実装

- `States.expandStates()` は `standard` の従来どおりの全面 flood-fill を保持し、それ以外の定住分布では人口または Burg のある定住核だけを `cells.state` に編入する。無主地は到達性評価の通過対象であっても自動編入されない。
- 首都から離れた初期 Burg は最寄りの既存 State に結び、そのセルだけを定住核として編入する。これにより小領土でも Burg、道路、宗教、軍事の既存初期化経路が State owner を得る。
- Province 生成の完了時に `state = 0` のセルを必ず `province = 0` に正規化した。State 集計・隣接国・campaign は無主地を外交主体として扱わず、`states[0]` は外交史の保存先だけを維持する。
- 検証: `npx vitest run src/generators/states-generator.test.ts src/generators/stateProvinceStatistics.test.ts src/generators/settlementPattern.test.ts`、`npx tsc --noEmit`。

この実装は `state = 0` の国家集計・外交からの除外、`province = 0` の不変条件を維持する。ただし、State 後に Routes を生成し、離れた定住核を後付けで接続するため、道路と国境を同じ定住網から導く再設計の受け入れ条件は満たしていない。

### 2026-07-25 — Phase 2 prototype の領土連続性補正

- 非標準プリセットでは、定住核が同一陸地内の既存統治領から分離した場合、山地・河川コストを考慮した最小の行政回廊だけを編入して接続する。海・他国領を横断する回廊は作らない。
- 人口 0・Burg なしで、単一 State の統治セルに完全に囲まれた 3 セル以下の小さな無主地 pocket は、その State に編入する。開放された無主地や人口を持つセルは維持する。
- `states-generator.test.ts` に行政回廊と囲まれた無主地の回帰テストを追加した。

これは prototype の表示破綻を抑えるための補正であり、最終的な国境生成の方式ではない。

### 2026-07-25 — Phase 1–2 再設計を決定

- Phase 1–2 の完了チェックを再オープンし、既存実装を prototype と位置付けた。
- Phase 1 は `Settlement Foundation Module` により定住圏・集落ノード・初期移動網を State より先に作る。
- Phase 2 は `Initial Polities Module` により移動網から国家と統治圏を導き、後付け行政回廊を置き換える。
- Phase 3 は移動網の延長を伴う `Frontier Project` として設計する。詳細な問題とモデルケースは `docs/plan/frontier/country-and-border.md` を参照する。

### 2026-07-25 — Phase 1 Settlement Foundation 完了

- 非標準プリセットでは、水源・気候・地形・資源・danger から少数の定住圏を選び、人口 cohort、Burg 候補、初期移動リンクを一つの `SettlementFoundationPlan` として保存するようにした。
- 定住圏の BFS は、クラスタリング値と地図規模に応じた局所的な hop 範囲で打ち切る。これにより雨水を利用できるセルが連続していても、単一の河川拠点が流域や大陸全体を自動的に埋めない。
- 初期移動リンクは Burg 化されたノードに限らず、計画済みの村落ノード間にも materialize する。`manors` は引き続き Burg 数だけを制御する。
- `standard` は legacy population / Burg / State / Routes の順序と RNG 消費を維持する Adapter とする。
- 検証: `settlementFoundation.test.ts` の温暖な河川域・Cold Desert の孤立 oasis 回帰、`routes-generator.test.ts` の村落間移動リンク、archive round-trip、標準 preset の既存 characterization。

### 2026-07-25 — Phase 2 Initial Polities 完了

- `src/generators/initialPolities.ts` を追加し、非標準プリセットの State 所有セルを、実体化済みの initial movement network と Phase 1 のコンパクトな settlement service area だけから導出するようにした。道路外の地形 adjacency は国家の接続に使わない。
- `connectDetachedStateNuclei` と後付け行政回廊を削除した。移動網に接続していない集落・Burg は `state = 0` のまま残り、完全に包囲された小さな無主地 pocket だけを正規化する。
- `statesNumber` は Foundation map では polity density / 上限として解釈し、ネットワークの地域・ノード数が実際の首都数を制限する。`standard` は従来どおり State 数として扱う compatibility Adapter である。
- 検証: `initialPolities.test.ts`、State / Province statistics、Settlement Foundation、Routes の回帰テスト、`npx tsc --noEmit`、Biome、architecture lint。

| Date | Phase | Status | Note |
| --- | --- | --- | --- |
| 2026-07-24 | 設計 | Planned | 政治境界を空白化する方針、段階的な導入順、未解決事項を初版として記録 |

更新時は、完了したチェックボックス、実装 PR / commit、テスト結果、仕様変更理由をこの表へ追記する。計画段階の議論と実装済みの挙動を混同しないため、実装確認後にだけ `Status` を更新する。
