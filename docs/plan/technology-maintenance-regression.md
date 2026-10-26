# 技術の維持と退行（前史グラフの接続）設計

## 状態

**設計のみ・未実装（2026-10-16）。** [classical-antiquity-historical-period.md](./classical-antiquity-historical-period.md) §5.4（P4）の「前史グラフの接続と退行の評価器」を受けた別文書。[technology-development-roadmap.md](./technology-development-roadmap.md) §16.1（維持コストによる技術の退行）と決定事項15・16を実装可能な形にする。

---

## 1. 要約

- **前史の18ノードはそのまま評価器に載せない。** P2 で、ローマの到達点は既存の era 1 ノードへの前倒し（`urbanCoveredDrainage`・`commercialFinance` など）として表した（決定事項16）。18ノードを並行して動かすと、同じ到達点が2系統になる。[technologyPrehistory.ts](/src/generators/technologyPrehistory.ts) は設計の根拠・UI の説明文の出典として残す。
- **接続するのは「退行」という規則だけ。** 前史グラフの3つの「崩壊」ノードが表す「維持投資が途切れると adopted/diffused が known へ戻る」を、実際に動いている既存ノードと既存の国家シグナル（国庫・行政知識・戦争）に適用する。
- **退行させるのは、維持費のかかるインフラ・制度を表すノードだけ**（§3 の表）。知識そのもの（数学・天文など）は退行しない。退行しても `known` より下には戻らない（「忘れる」のではなく「回らなくなる」）。
- 物理的な施設（上水の段階、舗装道路）の劣化は、技術段階とは別に、各システムの維持処理で表す。上水は既に維持状態（`maintenanceCondition`）があり、道路には無いので新設する（§4）。

---

## 2. 現状

| 項目 | 現状 |
| --- | --- |
| `advanceStage()`（[technologyProgress.ts](/src/generators/technologyProgress.ts)） | 段階を上げるだけで、下げない。「Knowledge can stall but does not forget」という不変条件がコメントで明記されている |
| 開始プロファイル | 古代・初期中世では era 0/1 の一部を低い段階から始める（P2） |
| 前史18ノード | 型・閾値・`affectsMaintenanceOf` を持つが、どこからも読まれない |
| 上水 | 維持費の不足で `maintenanceCondition` が下がり、詰まり（clogging）が増える。段階（tier）自体は下がらない |
| 舗装道路 | Route の `group === "roads"` が舗装扱い。劣化は無い |

---

## 3. 退行の規則

### 3.1 対象ノードと維持の条件

| ノード | 表すもの | 維持に要るもの（毎年判定） |
| --- | --- | --- |
| `urbanCoveredDrainage` | 都市の暗渠・水道 | 国庫 ≥ 閾値、`urbanWaterMaxTier` ≥ 2 |
| `commercialFinance` | 広域の貨幣・信用 | 行政知識 `administration` ≥ 閾値、戦争中でない |
| `stoneBuildingAndRoads` | 舗装道路網と石造の公共建築 | 国庫 ≥ 閾値、`masonry` ≥ 閾値 |
| `literacyAndMarkets` | 記録と市場 | `administration` ≥ 閾値、都市人口 ≥ 閾値 |

知識ノード（`mathAstronomyGeography`・`recordReplication`・`surgicalAnatomy` など）と、農法・冶金のように個々の農民・職人が担う技術は退行させない。

### 3.2 進み方

1. 国家ごと・対象ノードごとに「維持不足の連続年数」を数える（`TechnologyProgress` に `maintenanceDeficitYears` を足す。省略可能なので既存セーブは移行不要）。
2. 条件を満たした年は 0 に戻す。満たさない年は +1。
3. 連続年数が猶予年数（案: 10年、技術発展速度の設定で伸縮）を超えたら1段下げる。`diffused → adopted → demonstrated → known` の順で、`known` が下限。
4. 下がった段階は、通常の `advanceStage()` で再び上がれる（再建）。再建は最初の普及より速くしない（同じ閾値・待機年数）。

### 3.3 `advanceStage()` の不変条件との関係

退行は `advanceStage()` の中に入れず、別関数 `regressUnmaintainedStage()` として年次評価の後段で呼ぶ。`advanceStage()` の「下げない」という保証と既存テストはそのまま残る。

### 3.4 どの時代で有効にするか（要決定）

| 案 | 内容 | 長所・短所 |
| --- | --- | --- |
| A | 古代2時代のマップだけ | ローマの衰退を表すための機能に限定。中世以降のマップは一切変わらない |
| B | すべての時代 | 財政破綻した国家が近世でもインフラを失う。既存のバランス（国庫の構造的赤字の調査で較正済み）に影響する |
| C | 生成オプションで切り替え（既定 OFF） | A と B の両立。設定が1つ増える |

推奨は **C**（古代では既定 ON、それ以外は既定 OFF）。国庫の構造的赤字の調査（treasury-structural-deficit-investigation.md）で、多くの国家が毎年赤字であることが分かっている。B にすると、意図しない大規模な退行が全時代で起きるおそれがある。

---

## 4. 物理的な劣化

技術段階が下がっても、既にある施設が消えるわけではない。施設側の劣化は各システムで扱う。

| 施設 | 方針 |
| --- | --- |
| 上水 | 既存の `maintenanceCondition` が一定以下の状態が続くと、段階（tier）を1つ下げる。今は詰まりが増えるだけで tier は下がらない |
| 舗装道路 | Route に `condition`（0〜1）を足す。国の道路予算（Public Works L8 の舗装と同じ財源）が不足すると下がり、0.3 未満が続くと `group` を `trails` に戻す。舗装と同じ経路で再舗装できる |
| 常備軍 | 既存の兵の給与（国庫）不足による動員解除で表せるので、新設しない |

---

## 5. 検証

- 単体: 条件不足が猶予年数続くと1段下がる。`known` より下がらない。条件が戻れば再び上がれる。対象外ノードは下がらない。
- ライブ: 古代マップで50年の Advance Time（歴史モード）を回し、退行した国家の割合・再建までの年数を測る。中世マップ（案 C で OFF）で技術段階が以前と同一であることを確認する。

---

## 6. 実装フェーズ（案）

| フェーズ | 内容 |
| --- | --- |
| R1 | `maintenanceDeficitYears`・`regressUnmaintainedStage()`・§3.1 の表・生成オプション（案 C）。単体テスト |
| R2 | 上水の tier 低下（§4） |
| R3 | 道路の `condition` と舗装の喪失（§4） |
| R4 | ライブ計測で猶予年数と閾値を較正 |

---

## 7. 未決事項

1. §3.4 の有効範囲（A / B / C）。
2. 退行を Chronicle（年表）に記録するか（「〜国で水道の維持が途絶えた」など）。
3. 前史18ノードの `technologyPrehistory.ts` を、本設計の実装後も残すか、§3.1 の表に統合して削除するか。
