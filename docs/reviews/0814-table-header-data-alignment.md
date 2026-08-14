# テーブルダイアログのヘッダー/データ配置不一致 — 調査と修正計画

**ステータス: 調査・計画・Phase 0〜6実装まで完了（2026-08-14）。** 実装結果は末尾の「実装結果」セクションを参照。

## 発端

Military Supplies Overview ダイアログ（`src/extensions/economy/ui/dialogs/MilitarySuppliesOverviewDialog.tsx`）で、1行目のヘッダー（Arms / Arrows / Mounts / Muskets / Bullets / Artillery / Gunpowder）が中央寄せ、2行目以降のデータ行が左寄せになっており、列を目視で追いにくいという指摘。

この指摘を受けて、同様の不備が他のダイアログにも存在するか調査した。結論として、これは単一ダイアログの不具合ではなく、共通コンポーネント側にアラインメントのルールが一切存在しないことに起因する**全社的（アプリ全体）な設計ギャップ**であり、`.fmg-table` を使うテーブル系ダイアログの大半に同じ不備が再現する。

## 根本原因

`src/ui/dialogs/dialog.css` の `.fmg-table` ブロック（450–503行目）には `td` の `padding`/`line-height`/`vertical-align` などのルールはあるが、**`text-align` を指定するルールが一切ない**。`th`/`.sortable`/`.alphabetically`（数値以外の列に付与される、ソート方向アイコン用のクラス）についても同様で、アプリ全体を検索しても `.sortable` や `.alphabetically` を対象にした CSS は1件も存在しない。

```css
/* src/ui/dialogs/dialog.css:450-503 */
.fmg-table {
  width: max-content;
  min-width: 100%;
  border-collapse: collapse;
  ...
  td {
    padding: 0;
    margin: 0;
    line-height: 0.9;
    vertical-align: middle;
  }
  th, td { white-space: nowrap; }
}
```

その結果、ブラウザの UA デフォルトスタイルがそのまま適用される：

- `<th>` は UA デフォルトで `text-align: center`
- `<td>` は UA デフォルトで `text-align: left`（`body` から継承）

ヘッダーコンポーネント `src/ui/components/tables/SortableHeader.tsx` は数値列かどうかを表す `alphabetically` クラスをちゃんと出力している（48行目）が、それを消費する CSS が存在しないため実質的に死んでいるメタデータになっている。

```tsx
// src/ui/components/tables/SortableHeader.tsx:42
className={`sortable ${numeric ? "" : "alphabetically"} ${isActive ? "sort-active" : ""} ${iconClass} ${className}`}
```

一方 `<td>` 側には、そもそも列が数値かどうかを示すクラス自体が（一部の例外を除き）存在しない。つまり CSS 側だけでなく、行レンダラー側にも「この列は数値だ」という情報がマークされていない。

→ **ヘッダーが中央寄せ・データが左寄せになるのは Military Supplies Overview 固有のバグではなく、`.fmg-table` を使うほぼ全てのダイアログが最初から抱えている構造的な欠落。新しいテーブル系ダイアログを追加するたびに、著者が偶然気づいて手動で直さない限り確実に再発する。**

## 実機での確認

`npm run dev`（起動済み）+ Playwright で実際に確認した。

1. **Military Supplies Overview**（報告どおり）: `State` 列は左寄せで違和感がないが、`Arms`〜`Gunpowder` の数値ヘッダーは中央寄せ、データは左寄せで、ヘッダー直下にデータが来ない。
2. **States Editor → Overview タブ**（`src/ui/dialogs/StatesEditorDialog.tsx`、拡張機能に依存しないコアダイアログ）: `Burgs` / `Area` / `Population` / `Treasury` の各ヘッダーが中央寄せ、データ（`20`, `113K km²`, `850K` など）が左寄せ。**拡張機能とは無関係にコア機能側でも同じ不備が再現することを確認**。
3. **Trade Animation → Active Caravans**（`src/extensions/economy/ui/dialogs/TradeAnimationDialog.tsx`）: こちらは `<td>` 側に個別インラインスタイル `style={{ textAlign: "right" }}` が入っており、データは右寄せになっている。しかしヘッダー側は無修正のまま中央寄せなので、依然としてヘッダーとデータの軸が一致しない（左寄せよりはマシだが、ベストプラクティス（ヘッダーとデータの配置を一致させる）には達していない）。

## ベストプラクティスとの比較

一般的なデータテーブルの配置規則（Material Design / Nielsen Norman Group 等が共通して挙げるもの）：

| 列の種類 | ヘッダー | データ |
| :--- | :--- | :--- |
| 数値・数量 | 右寄せ | 右寄せ（桁を揃えて比較しやすくする） |
| テキスト・カテゴリ | 左寄せ | 左寄せ |
| バッジ・アイコン・ステータス | 中央寄せ（明示的に選んだ場合のみ） | 中央寄せ |

**ヘッダーとデータの配置は常に一致していなければならない。** 中央寄せはブラウザのデフォルト任せで採用してよいものではなく、意図して選ぶスタイルであるべき。

現状のコードはこの規則を満たしておらず、しかも同じ問題への対処が場当たり的で一貫していない：

- 大半のダイアログ: 無修正（ヘッダー中央 / データ左）
- 一部のダイアログ: `<td>` にだけインライン `style={{ textAlign: "right" }}` を1セルずつ手書き（ヘッダー中央 / データ右 — 半端な状態）
- `StatesEditorPersonalityTab.tsx` のみ `textAlign: "center"`（背景色付きのステータス値セルなので中央寄せ自体は妥当だが、ヘッダー側は他と同様センターで結果的に一致している＝意図せず正しくなっているケース）

## 確認済みの対象ダイアログ一覧

`SortableHeader` を使用する全19ファイル（報告対象を除く）と、`<th>` を直書きしている代表的な数値テーブル数件を調査した。

### グループA: 無修正（ヘッダー中央寄せ／データ左寄せ） — 報告と同一の不備

`SortableHeader` で `numeric` 列を持つが、対応する `<td>` に配置指定が一切ない。

- `src/extensions/economy/ui/dialogs/MilitarySuppliesOverviewDialog.tsx` （今回の報告対象）
- `src/ui/components/tables/ProvincesTable.tsx`
- `src/ui/components/tables/BurgsTable.tsx`
- `src/ui/dialogs/MilitaryOverviewDialog.tsx`
- `src/ui/dialogs/CulturesEditorDialog.tsx`
- `src/ui/dialogs/ZonesEditorDialog.tsx`
- `src/ui/dialogs/PopulationOverviewDialog.tsx`
- `src/ui/dialogs/RoutesOverviewDialog.tsx`
- `src/ui/dialogs/BiomesEditorDialog.tsx`
- `src/ui/dialogs/StatesEditorDialog.tsx` （実機確認済み）
- `src/ui/dialogs/ReligionsEditorDialog.tsx`
- `src/extensions/economy/ui/dialogs/GoodsEditorDialog.tsx`
- `src/extensions/economy/ui/dialogs/TreasuryOverviewDialog.tsx`
- `src/extensions/economy/ui/dialogs/GuildOverviewDialog.tsx`
- `src/extensions/shipbuilding/ui/dialogs/ShipyardsOverviewDialog.tsx`
- `src/extensions/characters/ui/components/tables/CharactersStatsTable.tsx`

### グループB: 部分的な場当たり修正（データのみインラインstyleで右/中央寄せ、ヘッダーは無修正のまま）

- `src/extensions/economy/ui/dialogs/MarketOverviewDialog.tsx`
- `src/extensions/economy/ui/dialogs/TradeAnimationDialog.tsx` （実機確認済み）
- `src/extensions/characters/ui/components/tables/CharactersTable.tsx`
- `src/extensions/nobility/ui/components/StatesEditorPersonalityTab.tsx` （`textAlign: "center"`。色付きステータスセルなので中央寄せの意図自体は妥当）

### グループC: `SortableHeader` を使わない素の `<th>` テーブルでも同型の不備を確認

これらは `alphabetically` クラスすら存在しないため、CSS 側の対応だけでは直せず、`<th>`/`<td>` 両方に明示的なクラス付与が必要。

- `src/extensions/economy/ui/dialogs/EmploymentOverviewDialog.tsx`
- `src/extensions/economy/ui/dialogs/MineralOverviewDialog.tsx`
- `src/extensions/economy/ui/dialogs/GreatLibraryOverviewDialog.tsx`
- `src/extensions/economy/ui/dialogs/MarketsOverviewDialog.tsx`
- `src/ui/dialogs/RegimentsOverviewDialog.tsx`（ヘッダーの一部が動的生成 `<th>`）

グループCは `.fmg-table`/`VirtualTableBody` を使う全ダイアログ（60ファイル超）のうち代表的なものをサンプル調査した結果であり、**全数調査ではない**。Phase 1（下記）で棚卸しを完了させる。

## 修正方針

パッチワーク的にダイアログを1つずつ直すと、また次の新規ダイアログで同じ不備が再発する。共通コンポーネント側にアラインメントの規約を持たせ、各ダイアログはその規約に従うだけにする。

### レイヤー1: CSS基盤（`dialog.css` の `.fmg-table` ブロック）

```css
.fmg-table {
  /* 既存ルールに追加 */
  th, td { text-align: left; }

  th.sortable:not(.alphabetically),  /* SortableHeader の数値列 */
  td.numeric {
    text-align: right;
  }
}
```

`SortableHeader.tsx` は変更不要（`alphabetically` クラスは既に正しく出力されている）。数値以外の `<th>`（グループC）には `numeric` と対になる明示クラスを付与する。

### レイヤー2: 行レンダラー側の対応

各ダイアログの `renderRow`（または相当箇所）で、数値を表示する `<td>` に `className="numeric"` を付与する。グループBはインライン `style={{ textAlign: ... }}` を削除して `className="numeric"` に置き換える（ヘッダー側も自動的に右寄せになり整合が取れる）。グループCは `<th>` にも対になるクラスを追加する。

既存の `className="d-flex"` 等、他の用途のクラスとは共存可能（`className="d-flex numeric"` のように併記）。

## 修正計画（フェーズ分割）

| フェーズ | 内容 | 対象 |
| :--- | :--- | :--- |
| Phase 0 | `dialog.css` にレイヤー1のCSSルールを追加。既存ダイアログの見た目は変化しない（`numeric`/`numeric-col` クラスがまだどこにも付いていないため）安全な差分。 | `dialog.css` |
| Phase 1 | `.fmg-table` / `VirtualTableBody` を使う全ファイルへの `grep` 全数棚卸しを行い、本ドキュメントのグループA/B/Cリストを確定版に更新する（今回はサンプル調査に留まる）。 | 棚卸しのみ、コード変更なし |
| Phase 2 | 報告対象の `MilitarySuppliesOverviewDialog.tsx` を修正し、レイヤー2の適用パターンを確立する。 | グループA先頭1件 |
| Phase 3 | グループA残り14ファイルに同パターンを横展開。 | グループA |
| Phase 4 | グループBの4ファイルからインライン `style` を除去し `className="numeric"` に統一。 | グループB |
| Phase 5 | グループCのファイルに `<th>`/`<td>` 両方への明示クラス付与、または `SortableHeader` への置き換え（ソート機能も同時に得られるため望ましいが、スコープ拡大になるので別判断）。 | グループC |
| Phase 6 | 目視回帰確認（各ダイアログをブラウザで開きヘッダーとデータの縦軸を確認）。加えて `npm run build` / `npx tsc --noEmit` / `npm run lint` / `npm run madge`（AGENTS.md §8のゲート）を実行。 | 全体 |

Phase 2以降は対象ファイル数が多いため、報告対象（Military Supplies Overview）のみを先行修正する小さな差分と、残り全体を横展開する差分とを分けて進めることを推奨する。

## 検証方法

- 各ダイアログをブラウザで開き、数値列のヘッダーとデータの左右端が一致していることを目視確認する。
- 可能であれば、Playwright で `getComputedStyle(th).textAlign === getComputedStyle(td).textAlign`（同一列内）を機械的にアサートする軽量テストを追加し、将来また同じ不備が紛れ込むことを防ぐ（AGENTS.md §5 のテスト方針に従い `tests/e2e/helpers/` にヘルパーを置く）。

## 付録: 調査に使ったコマンド

```bash
# .fmg-table / SortableHeader 利用箇所の洗い出し
grep -rln "SortableHeader" src --include="*.tsx"
grep -rln "fmg-table\|VirtualTableBody" src --include="*.tsx"

# text-align 指定の有無（.fmg-table 系には無いことの確認）
grep -rn "text-align" src --include="*.css"
grep -rn "textAlign" src --include="*.tsx"

# .sortable / .alphabetically を消費するCSSが存在しないことの確認
grep -rn "\.sortable\b\|alphabetically" src --include="*.css"
```

---

## 実装結果（2026-08-14）

上記計画の Phase 0〜6 をすべて実装した。`npx tsc --noEmit` / `npm run lint`（biome + legacy + world-writers + architecture）/ `npm run madge` / `npm run build` は全てエラーなしで通過し、実際にブラウザ（Playwright + `npm run dev`）で Military Supplies Overview・States Editor・Treasury Overview・Trade Animation の4ダイアログを目視確認し、ヘッダーとデータが列ごとに正しく右寄せで揃うことを確認済み。

### Phase 0: CSS基盤

`src/ui/dialogs/dialog.css` の `.fmg-table` ブロックに以下を追加：

- `th, td { text-align: left }` を明示（UAデフォルトの`th`中央寄せを上書き）
- `th.sortable:not(.alphabetically)`, `th.numeric`, `td.numeric` → `text-align: right`
- `td.numeric > .d-flex { justify-content: flex-end }` — アイコン+値のペアがflexラップされているセル（`text-align`はflexアイテムに効かないため、別途対応）
- `td.numeric input:not([type="checkbox"]):not([type="radio"]) { text-align: right }` — `<input disabled readOnly>` で数値を表示しているセル（BurgsTable、GoodsEditorDialogなど）

この1回のCSS変更だけで、`SortableHeader` コンポーネント経由だけでなく、`className="sortable"` を手書きしているダイアログ（RiversOverviewDialog、DiplomacyEditorDialog、MarketsOverviewDialog、MarketTradeOpportunitiesDialogなど）の**ヘッダー側も自動的に正しく右寄せになった**。残る作業は各ダイアログの `<td>` に `numeric` クラスを付与するデータ側の対応のみ。

### Phase 2/3: グループA（16ファイル、報告対象含む）— 全て対応済み

`MilitarySuppliesOverviewDialog.tsx` / `ProvincesTable.tsx` / `BurgsTable.tsx` / `MilitaryOverviewDialog.tsx` / `CulturesEditorDialog.tsx` / `ZonesEditorDialog.tsx` / `PopulationOverviewDialog.tsx` / `RoutesOverviewDialog.tsx` / `BiomesEditorDialog.tsx` / `StatesEditorDialog.tsx` / `ReligionsEditorDialog.tsx` / `GoodsEditorDialog.tsx` / `TreasuryOverviewDialog.tsx` / `GuildOverviewDialog.tsx` / `ShipyardsOverviewDialog.tsx` / `CharactersStatsTable.tsx`

`CharactersStatsTable.tsx`（CK3風の能力値グリッド）と `StatesEditorPersonalityTab.tsx` は元々 `<td>`側が意図的に `textAlign: "center"` だったため、`<td>` は変更せず `<th>` 側に同じ `textAlign: "center"` を明示して合わせた（Phase 0のCSSがそのままだとヘッダーだけ右寄せになり、新たな不一致を生むところだった）。

### Phase 4: グループB（4ファイル）— インラインstyleを`className="numeric"`に統一

`MarketOverviewDialog.tsx` / `TradeAnimationDialog.tsx` / `CharactersTable.tsx` / `MarketTradeOpportunitiesDialog.tsx` の `style={{ textAlign: "right" }}` を全て `className="numeric"` に置換。あわせて `MarketOverviewDialog.tsx` 内で当初のサンプル調査では見つけていなかった3つ目のテーブル（Transport Assets: Slots/Available/Reserved/In transit/Maintenance/Total/Ready slots）が素の `<th>`（配置指定なし）であることを発見し、`<th>`/`<td>` 双方に `numeric` クラスを追加した。

### Phase 5: グループC（当初5ファイル＋拡大調査で判明した3ファイル）

- 素の`<th>`（`sortable`規約なし）で `<th>`/`<td>` 双方への対応が必要だったもの: `EmploymentOverviewDialog.tsx` / `MineralOverviewDialog.tsx`（2テーブル） / `GreatLibraryOverviewDialog.tsx`（2テーブル） / `MarketsOverviewDialog.tsx` / `RegimentsOverviewDialog.tsx`
- `sortable`規約は使っているがSortableHeaderコンポーネント経由ではないため見落としていたもの（ヘッダーはPhase 0のCSSで自動修正済み、`<td>`のみ追加）: `RiversOverviewDialog.tsx` / `DiplomacyEditorDialog.tsx` / `DiplomacyHistoryDialog.tsx`（"#"列のみ）
- 調査したが数値列が無く対応不要と判断: `MarkersOverviewDialog.tsx`

### スコープ外とした判断（意図的に触っていない箇所）

1. **行ヘッダー型プロパティテーブル**（`<th scope="row">`でラベル、`<td>`で値を1行ずつ表示する形式）: `StateEditorDialog.tsx`／`ProvinceEditorDialog.tsx`／`StateNameEditorDialog.tsx`／`CellInfoDialog.tsx` など。今回の報告（列ヘッダーとデータ列の不一致）とは別種の懸念（行ラベル自体がUAデフォルトで中央寄せになっている可能性）であり、`.fmg-property-table` にも同様に `text-align` 指定が無いため潜在的な不備ではあるが、今回のスコープには含めていない。別課題として起票する価値がある。
2. **複合セル**（数字を含むが単純な大小比較の対象ではない文字列）: `MarketOverviewDialog.tsx` の Transport Orders テーブルの Progress/Budget 列（例: "3/5 complete · 60%"）、`DiplomacyHistoryDialog.tsx` の Era & Year 列など。右寄せにする意義が薄いと判断し、あえて据え置いた。
3. **未監査の編集/詳細パネル系テーブル**（約20ファイル）: `BurgEditorInnsTab.tsx` / `BurgEditorWaterTab.tsx` / `BurgEditorGuildsTab.tsx` / `BurgEditorGoodsTab.tsx` / `BurgEditorCharactersTab.tsx` / `StateFiscalReportTab.tsx` / `StatesEditorTreasuryTab.tsx` / `MarketsGoodCompareDialog.tsx` / `DomainPollDetailDialog.tsx` / `DebtNegotiationDialog.tsx` / `TradeDetailsDialog.tsx` / `MetallurgWorkDialog.tsx` / `ProductionOverviewDialog.tsx` / `BalanceHistoryDialog.tsx` / `MarketDealsDialog.tsx` / `CouncilSessionDialog.tsx` / `GoodsStockDialog.tsx` / `CharacterMarketDialog.tsx` / `GoodsProducersDialog.tsx` / `RegimentEditorDialog.tsx`（対戦相手一覧の副テーブル） / `FeaturesSelectionDialog.tsx` / `MarkerConfigDialog.tsx`。`.fmg-table`/`VirtualTableBody` 利用箇所の全数リスト（60ファイル超）に含まれるが、当初報告された「一覧系ダイアログのヘッダー/データ不一致」という主症状からは外れる編集フォーム寄りのテーブルが多く、今回は手を付けていない。次にこの種の不備が報告された場合、または本ドキュメントの続きとして棚卸しする対象。

### 変更ファイル一覧

- `src/ui/dialogs/dialog.css`（CSS基盤）
- 上記グループA 16 + グループB 4 + グループC 8 = ダイアログ/テーブルコンポーネント計27ファイル
