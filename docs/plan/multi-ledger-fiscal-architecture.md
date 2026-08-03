# 多層会計アーキテクチャ（個人 / 家政 / 国庫 / 領）設計

## 状態

**設計案。PR-1〜PR-3 実装済み** — L0 個人 / L1 householdPurse / L2 treasury / L3a departmentBalances。軍事 upkeep は当面 L2。PR-4 支出権限フックは未実装。

史実対照 [polity-fiscal-regimes-historical.md](../analytics/polity-fiscal-regimes-historical.md) の結論「豊かさの本体はどの名義の金庫を誰が使えるか」を、現行の単一 `state.treasury` + `Character.wealth` モデルへ段階実装するための仕様と PR 計画。

関連:

| 文書 | 関係 |
| :--- | :--- |
| [state-treasury-department-budget.md](./state-treasury-department-budget.md) | 部門%・Marshalcy 充足率・名目 Budget（**支出配分**） |
| [character-wealth-balance.md](../analytics/character-wealth-balance.md) | 個人俸給梯子と生活費 sink |
| [burg-treasury-equilibrium.md](./burg-treasury-equilibrium.md) | Burg/Market/Guild プール、政体上納は将来課題 |
| [polity-fiscal-regimes-historical.md](../analytics/polity-fiscal-regimes-historical.md) | 形態別史実（本設計の根拠） |

---

## 1. 問題

| 症状 | 原因 |
| :--- | :--- |
| 為政者の所持金が金貨数枚で「貧乏王」に見える | プレイヤーが **公金を個人 wealth と誤認**。個人 cap + 生活費は意図的 |
| 部門予算があるのに「使えない」 | 部門は **名目%** のみ。残高も支出権限もない |
| 領主が領の金を使えない | Burg は **個人俸給の源泉**にしか使われない |
| 政体差が薄い | 税率と部門%以外は **同じ collectTaxes パイプ** |

史実調査の結論: **個人 wealth を一律に厚くするのではなく、財布を分けて権限と UI を与える**。

---

## 2. 目標と非目標

### 2.1 目標

1. **4層の現金名義**を定義し、誰が何に使えるかを形態ごとに決める。  
2. 為政者パネル／Treasury UI で「個人 / 家政 / 国庫 /（領）」を誤認なく見せる。  
3. 既存の `allocateTreasury` 名目表・軍事充足率・個人俸給梯子を **壊さず接続**する。  
4. 最小実装から段階投入でき、セーブ互換を保つ。

### 2.2 非目標（この設計の範囲外）

- 歳入の完全な形態別ミックス（所領税・十一税・公債）の最終実装 — 層が先、歳入ラベルは後続  
- 議会シミュレーション・税請負の詳細  
- 複合君主制の完全な多王冠会計（Union は「薄い中央 + 構成 state 各自」で近似）  
- 国際債務・金利市場  
- 個人生活費の再設計（既存 sink を維持）

---

## 3. 会計層の定義

### 3.1 層一覧

```text
L0  Character.wealth          個人の手元現金（贈与・市場・小遣い・官職個人給）
L1  state.householdPurse      為政者家政・宮廷運営資金（公的だが「王冠の家」）
L2  state.treasury            国庫・公庫（戦争・外交・共通行政の本丸）
L3a state.departmentBalances  部門使用可能残高（名目 Budget の実体化）
L3b burg.treasury / (将来 province)  領・都市の運転資金（領主の主戦場）
```

既存の **Market / Guild treasury** は L3 外の **拡張ドメインプール**として維持（商人・ギルド専用）。本設計は state 統治と領に集中する。

### 3.2 各層の意味

| 層 | 名義 | 典型的な入り | 典型的な出 | 誰が「使える」か（理想） |
| :--- | :--- | :--- | :--- | :--- |
| **L0 Personal** | 個人 | 俸給、小遣い、贈与、取引 | 生活費 sink、個人贈与、PC 市場 | その Character |
| **L1 Household** | 王冠家政 | 歳入の household 配分、L2 からの合法振替 | 宮廷維持、威信、一部贈賄、限定的私的政策 | 在位為政者（形態で制約） |
| **L2 Treasury** | 公金 | poll/sales/voyage、属国貢納、余剰 | 軍事 upkeep、調達、部門 replenish、属国補助 | 形態依存の権限モデル（§5） |
| **L3a Department** | 官職・部局 | L2 からの配分振替 | 部門固有の将来効果（外交/行政/諜報/教会） | 対応中央官職（空席時は L2 に滞留） |
| **L3b Domain** | 都市・領 | 生産・市税シェア、ギルド還流 | 都市事業、領主政策、固定領主俸給 | 領主 / 市長（将来）/ 中央直轄時は L2 |

### 3.3 個人 wealth（L0）の位置づけ（再確認）

- **薄いのはバグではない**（特に Republic / Theocracy / Union）。  
- Monarchy の「豊かさ」は **L1 + L2** で見せる。  
- Anarchy のみ L0 と L2 を近づけてよい（§5.5）。  
- 既存の俸給 cap / 生活費 sink は L0 専用ルールとして維持。

### 3.4 名目 Budget と実残高（L3a）の関係

現行:

```text
allocateTreasury → 名目 marshalcy/chancery/... （情報 + 充足率）
実際の現金移動 → household 個人給 + office 個人給 + field commander + military upkeep
```

本設計後:

```text
毎サイクル domesticIncome
  → 名目表（形態%）で「配分意図」を計算（既存 BASELINE_ALLOCATION_BY_FORM）
  → L2 に税収を入れる（既存）
  → 名目額のうち「機関取り分」を L1 / L3a に振替（新規）
  → 個人給（L0）は機関取り分の一部または別口の小額（既存 clamp を接続）
  → Marshalcy 充足率 = L3a.marshalcy 使用可能 or 配分意図 ÷ Need（§6 で選択）
```

**原則**: 名目%は「政治的意図」、L3a は「残っている現金」。空席の官職部門は L3a に溜まるか L2 に戻す（既定: **L3a に滞留**、使われない金は見える）。

---

## 4. データモデル（提案）

### 4.1 State 拡張

```typescript
// models.ts / State — additive, all optional for save compat
interface State {
  treasury?: number;           // L2（既存）
  /** L1 — 王冠家政。未定義時は 0 扱い（旧セーブ）。 */
  householdPurse?: number;
  /**
   * L3a — 部門使用可能残高。キーは DepartmentBaselineAllocation と同じ。
   * household キーは使わない（L1 が担当）。marshalcy..ecclesiastica の5鍵。
   */
  departmentBalances?: {
    marshalcy: number;
    chancery: number;
    stewardship: number;
    spymastery: number;
    ecclesiastica: number;
  };
}
```

### 4.2 権限ビュー（永続化しない・派生）

```typescript
interface FiscalAuthorityView {
  stateId: number;
  form: string;
  personalWealth: number;       // ruler L0
  householdPurse: number;       // L1
  publicTreasury: number;       // L2
  departmentBalances: State["departmentBalances"];
  /** 為政者が「政策支出」UI で触れる合計（形態別ルール） */
  spendableAsRuler: number;
  /** 内訳ヒント（UI） */
  spendableBreakdown: { personal: number; household: number; public: number; departments: number };
}
```

### 4.3 セーブ互換

- 全フィールド optional。欠落時:  
  - `householdPurse = 0`  
  - `departmentBalances = 全0`  
  - 初回 `collectTaxes` で §6 の bootstrapping を実行可能  
- 旧セーブの `state.treasury` はすべて L2 とみなす（一括を L1 に分割しない — 歴史改変を避ける）。

### 4.4 既存フィールドとの共存

| 既存 | 扱い |
| :--- | :--- |
| `tributeRate` / `tributePaid` | Vassal → 宗主 L2 への流れとして維持・可視化強化 |
| `militaryFundingRatio` | §6.3 の定義更新（L3a.marshalcy 基準へ移行可能） |
| `Character.wealth` | L0 のみ。L1 にマージしない |
| `burg.treasury` | L3b。変更最小 |

---

## 5. 統治形態別・権限マトリクス

`spendableAsRuler` と自動振替の差が政体味になる。

### 5.1 Monarchy

| 層 | 為政者の権限 | ノート |
| :--- | :--- | :--- |
| L0 | 自由 | 薄い私室金 |
| L1 | **主戦場** | 歳入 household% は L1 へ（個人給は L1→L0 の小額 or 並存） |
| L2 | 強いが政治コスト付き（将来） | 当面は為政者支出可。将来 War/外交は L2 優先 |
| L3a | 官職が第一、空席時は為政者が代理 | Marshal 在職中は marshalcy を Marshal 優先 |
| L3b | 直轄領のみ | 属州は領主 |

**豊かさの見せ方**: `L1 + L2` を「王冠の財力」として大きく表示。

### 5.2 Republic

| 層 | 為政者の権限 |
| :--- | :--- |
| L0 | 自由（薄い） |
| L1 | **極小**（儀式的手当） |
| L2 | **合議ロック**（将来）。当面は AI 自動支出のみ、PC 元首は閲覧＋限定動議 |
| L3a | 官職ホルダー中心 |
| L3b | 市金庫は公的。元首の私的流用は禁止方向 |

**豊かさの見せ方**: L2 と Market 資本。元首 L0 が薄くてよい。

### 5.3 Theocracy

| 層 | 為政者の権限 |
| :--- | :--- |
| L0 | 薄い |
| L1 | 小 |
| L2 | 世俗公金 |
| L3a.ecclesiastica | **主戦場**（Camera 近似） |
| 他 L3a | 通常 |

歳入の一部を将来 ecclesiastica 直入（P2 歳入ミックス）。当面は配分振替で ecclesiastica を厚く。

### 5.4 Union

| 層 | 為政者の権限 |
| :--- | :--- |
| L0 | 薄い |
| L1 | 小 |
| L2 | **薄い中央公庫**（構成国からの分担のみ厚くなる想定） |
| L3a.chancery | 調整費の主戦場 |
| 構成 state の L2 | 各中央が別会計（現状の state 単位 treasury が近似） |

中期: `tribute` / 分担金イベントで構成→中央 L2。完全な同君連合マルチ王冠は非目標。

### 5.5 Anarchy

| 層 | 扱い |
| :--- | :--- |
| L0 と L2 | **同期または高い自動転送**（略奪→個人、従士給→個人） |
| L1 / L3a | ほぼ未使用（0 のまま） |
| 表示 | 「戦資金」として L0+L2 合算 |

---

## 6. 毎サイクル現金フロー（目標形）

`collectTaxes` 相当の順序（概念）:

```text
1. 歳入を L2 に加算（既存: poll, sales tax, voyage）
2. 軍事 Need を計算（既存）
3. 名目配分 baseline% × domesticIncome（既存 allocateTreasury 前半）
4. 【新規】機関振替:
     L2 → L1          : household 名目額の機関分 H_inst
     L2 → L3a[dept]   : 各部門名目の機関分 D_inst
   ※ 個人給は別:
     L0 ruler         : min(clamp旧ルール, H_inst の一部) または L1 から支払う
     L0 offices       : L3a または L2 から個人 clamp（既存 getCentralOfficePersonalStipend）
5. 軍事 upkeep を L3a.marshalcy から優先控除。不足は L2（既存の黙殺ゼロを段階的に改善）
6. 野戦指揮官個人給は L2 または L3a.marshalcy（既存 rate、資本は state）
7. 属州領主 L0 ← L3b burg（既存固定給）
8. Guild/Market 俸給（既存、別プール）
9. 個人生活費 sink（既存、L0 のみ）
10. スナップショット更新（Treasury Overview 拡張）
```

### 6.1 機関分と個人分の分割（推奨デフォルト）

名目 household 額 `H_nom = income × household%` について:

| 宛先 | 額 |
| :--- | :--- |
| L1 へ | `H_nom` 全額を一旦機関意図とするが、L2 残高が足りなければ pro-rata |
| L0 為政者 | 既存 `getRulerHouseholdStipend`（floor/cap）を **L1 から**支払う |

名目 chancery 等 `D_nom`:

| 宛先 | 額 |
| :--- | :--- |
| L3a[dept] へ | `max(0, D_nom − personalOfficePay)` |
| L0 官職 | 既存 `getCentralOfficePersonalStipend(D_nom)` |

これで:

- **機関口座が厚く見える**（ユーザーが欲しかった「部門に割り当てられた金」）  
- **個人 cap は維持**（L0 が再び暴騰しない）  
- Monarchy の L1 は名目 household が大きいほど厚くなる  

### 6.2 Marshalcy 充足率

**移行案（段階）**:

| フェーズ | Funding Ratio の分子 |
| :--- | :--- |
| 今 | 名目 marshalcy Budget |
| PR-2 以降 | そのサイクルの L3a.marshalcy **配分後残高** または 「配分額」 |
| 理想 | 実際に upkeep に充てられた額 ÷ Need |

PR-2 では破壊を避けるため、**分子は従来どおり名目**、L3a は並列表示から始めることを推奨。

### 6.3 Bootstrapping（旧セーブ）

初回のみオプション:

- 何もしない（L1/L3a=0 から蓄積）← **推奨**  
- または L2 の一定割合を L1/L3a に seed（バランス危険）

---

## 7. UI / UX

### 7.1 Treasury Overview 拡張

行ごとに追加列（または詳細パネル）:

| 列 | 内容 |
| :--- | :--- |
| Public (L2) | `state.treasury` |
| Household (L1) | `householdPurse` |
| Depts total (L3a) | 5 部門合計 |
| Personal (ruler L0) | 為政者 wealth |
| Form | Monarchy 等 |

ツールチップ: 「Personal は私室金。統治の主力は Public / Household / Departments」。

### 7.2 為政者・Player Character パネル

```text
Spendable (as ruler): XXX
  ├ Personal          aa
  ├ Household purse   bb   [Monarchy で強調]
  ├ Public treasury   cc   [Republic では "requires council" 将来]
  └ Departments       dd   (内訳リンク)
```

### 7.3 領主

Burg/Province UI:

```text
Domain treasury (burg): YYY
Lord personal: ZZZ
[将来] Spend domain funds on …
```

---

## 8. API / モジュール境界

| 関心 | 責務 |
| :--- | :--- |
| `treasuryAllocation.ts` | 名目表、充足率、個人給計算、**機関振替の計算** |
| `taxes-generator.ts` | サイクル順序、L2 加減、振替の実行 |
| `characterStipends.ts` | 属州・ギルド・市場（L3b / 拡張プール） |
| `characterLivingCosts.ts` | L0 のみ |
| 新規 `fiscalAuthority.ts`（任意） | `getFiscalAuthorityView(state)`、形態別 spendable |
| `treasury-overview` + PC HUD | 表示 |

アーキテクチャ規則: Generator が pack を mutate。Renderer は read-only。UI は store 経由。

---

## 9. リスクと制約

| リスク | 緩和 |
| :--- | :--- |
| L2 が機関振替で枯渇し軍事 upkeep 不能 | 振替は「L2 に upkeep と個人給を残した残額」から pro-rata |
| 部門に金が溜まりゲームが緩む | 将来の部門支出・年度リセット・L2 への還流 |
| UI 複雑化 | PR-1 は表示のみ、振替は PR-2 |
| Union を過大設計 | 構成 state の既存 treasury を「領邦会計」とみなし、中央は後で |

---

## 10. 最小実装計画（PR 分割）

### PR-1 — 可視化のみ（リスク最低） ✅

**目的**: 「貧乏王」誤読を止める。スキーマ変更なしでも可。

- ✅ Treasury Overview: `Public` (L2), `Ruler L0`, `Depts Σ` 名目、説明文  
- ✅ Player Character: Personal / Public treasury / Domain treasury（領主）  
- コピーで L1/L3a 未実装である旨を短く  

**完了条件**: 新規マップで為政者を開くと「個人は少ないが国庫は別」が一目で分かる。

### PR-2 — L1 householdPurse + 振替 ✅

- ✅ `State.householdPurse`  
- ✅ `collectTaxes`: 歳入を L2 に加算 → `creditHouseholdPurse` (L2→L1) → `payRulerHouseholdStipend` (L1→L0)  
- ✅ Treasury Overview / Player Character に HH purse  
- ✅ テスト  

**完了条件**: Monarchy 為政者の「王冠の財力 ≈ L1+L2」が個人の数倍〜桁上。

### PR-3 — L3a departmentBalances ✅

- ✅ `State.departmentBalances`（5 鍵）  
- ✅ L2→L3a 振替（名目部門シェア、L2 不足時 pro-rata）  
- ✅ 官職個人給は L3a→L0；空席は L3a に滞留  
- ✅ Overview **Depts bal** 列  
- 軍事 upkeep はまだ L2 から  

**完了条件**: 「部門に割り当てられたお金」が残高として存在する。

### PR-4 — 支出権限の最初のフック

- `getFiscalAuthorityView`  
- 1 つだけ実験的支出（例: 為政者が L1 から贈与、または L3b 領主が Burg から建設補助）  
- Republic は L2 直接支出を UI で抑制（フラグのみでも可）

### PR-5 — Marshalcy 支払いを L3a 優先、形態ポリシー

- upkeep を L3a.marshalcy → L2 の順  
- Anarchy の L0↔L2 近接  
- Union 分担の薄いフック（既存 tribute 可視化＋任意）

### PR-6 以降（本設計の外縁）

- 歳入ミックス形態差（調査ノート P2）  
- 領主の domain 政策メニュー  
- War Footing と L3a 連動  

---

## 11. テスト計画

| 領域 | ケース |
| :--- | :--- |
| 互換 | 旧セーブ load → treasury のみ、L1/L3a 0 |
| 振替保全 | L1+L2+L3a+支払個人給+upkeep の合計が歳入と整合（誤差 rn） |
| Monarchy | 数サイクル後 L1+L2 ≫ ruler L0 |
| Republic | L1 が Monarchy より薄い |
| Theocracy | L3a.ecclesiastica が相対的に厚い |
| 空席 | Marshal 不在でも L3a.marshalcy が減らない（個人給ゼロ） |
| 生活費 | L0 のみ減少、L1/L2 不変 |
| 属州 | 領主給が引き続き burg.treasury から |

---

## 12. 成功指標（プレイ体感）

1. 為政者を見て「国が貧乏」ではなく「**私室は薄いが国庫・家政がある**」と読める。  
2. Treasury Overview で **部門に金が載っている**。  
3. 領主 UI で **領の金庫**が自分の給与源として説明される。  
4. Republic 元首の個人が薄くても違和感が減る。  
5. 個人 wealth インフレが再発しない（L0 cap + sink 維持）。

---

## 13. 決定事項（この文書で固定する案）

実装キックオフ時に覆さない限り、以下を採用する。

| ID | 決定 |
| :--- | :--- |
| D1 | 4 層: L0 Personal / L1 Household / L2 Public / L3a Departments + 既存 L3b Burg |
| D2 | 個人給の cap/sink は L0 に限定。機関厚みは L1/L3a で出す |
| D3 | 名目%表は維持。機関振替の入力として使う |
| D4 | 旧セーブは L2 一括のまま。自動再分割しない |
| D5 | PR は 表示 → L1 → L3a → 権限フック の順 |
| D6 | Union の完全多王冠はしない。state 単位 L2 を領邦会計近似とする |
| D7 | Anarchy のみ公私近接を許す |

---

## 14. 次のアクション

| 順 | 作業 | 成果物 |
| :--- | :--- | :--- |
| 1 | 本設計のレビュー（D1–D7 の是非） | コメント |
| 2 | **PR-1** 可視化 | HUD / Treasury Overview |
| 3 | **PR-2** householdPurse | スキーマ + collectTaxes |
| 4 | **PR-3** departmentBalances | 部門残高 |
| 5 | 歳入形態差は別設計（調査ノート P2） | 後続 ADR |

---

## 15. 一文まとめ

国家の財力を **個人の小銭**に畳まず、**家政・公庫・部門・領**に分けて権限と表示を与える。  
史実の形態差は「税率表」より **どの層が主役か**で出し、実装は表示から機関残高へ段階的に進める。
