# Building Viewer から Model Viewer へ：名称変更と属性による一覧

## 目的

BV（Building Viewer）を、建物に限らない3Dモデル全般のビューワー **Model Viewer（MV）** に改める。

- 世界中の建物、乗り物、船、兵器（第一次世界大戦の戦車などの近代兵器を含む）、樹木、小物を1つのビューワーで扱う。
- モデルに「種類・年代・地域・用途」の属性を持たせ、一覧を絞り込みと検索で引けるようにする。収録数が増えても目的のモデルにたどり着けることが目的である。

## 背景

- BVはすでに建物専用ではない。`src/buildings/` には ships・siege・vehicles・props・landscape（樹木）があり、BVの一覧には Ships、Siege engines、Artillery、Small arms、Vehicles、Trees などの分類が並ぶ。
- 一覧は [src/building-viewer/main.ts](../../src/building-viewer/main.ts)（約3,700行）で、`modelCategory()` の折りたたみ見出しを手書きの順で並べている。中世モデルは `*Models.ts` の task 番号ごとに見出しが作られる（例: `Medieval 61 · Horse Mills`）。分類の基準が見出しごとにばらばらで、年代・地域では引けない。
- 年代の区分は [src/types/historicalPeriod.ts](../../src/types/historicalPeriod.ts) の `HISTORICAL_PERIODS`（classicalAntiquity 〜 rocketryEra）がFMG全体の基準としてすでにあり、第一次世界大戦は `petroleumEra` に入る。
- 戦車を静的モデルと部品分解で表示する限り、品質段階（Low/High）、author、部品表示、実寸の確認、CEへの配置という既存の機能でそのまま扱える。ビューワーを分けると、これらを二重に保守することになる。

## 方針

1. ビューワーは1つのままとし、名前を Model Viewer（略称 MV）に変える。
2. 一覧の膨大さは、ビューワーを分けるのではなく、属性による絞り込みと検索で解決する。
3. 作業の順序は「属性の定義 → 一覧の絞り込み → 名称変更」とする。名前だけ先に変えても、一覧の問題は解決しないためである。
4. 名称変更は他の作業と混ぜず、名称変更だけの独立したコミットで行う。

### 別のビューワーに分ける条件

次のいずれかに当たる場合に限り、MVとは別のビューワーを検討する。

- 砲塔の旋回や履帯の動きなど、関節の操作やアニメーションの再生が主な目的になる。
- CEなど本プロジェクトのエディタと無関係な用途で使い、MVの配置契約（[placementContract.ts](../../src/buildings/placementContract.ts)）に従わない。

関節を持つモデルも、まずはMVで「静止姿勢＋部品分解」として収録し、動作の確認が必要になった段階で改めて判断する。

## 属性

各モデルの定義に、次の属性を持たせる。

| 属性 | 型 | 内容 |
| --- | --- | --- |
| `kind` | `ModelKind` | 最上位の種類。一覧はまずこれで分ける。 |
| `periods` | `HistoricalPeriod[]` | 使われた年代。既存の `HISTORICAL_PERIODS` を使い、独自の区分は作らない。 |
| `years` | `[number, number]`（任意） | 根拠のある使用年の範囲（例: `[1916, 1918]`）。`periods` より細かく絞りたいときに使う。 |
| `regions` | `ModelRegion[]` | 地域・文化圏。地域を問わないものは `"any"`。 |
| `uses` | `string[]` | 用途のタグ（例: `milling`、`military`、`trade`、`worship`）。 |

```ts
export type ModelKind =
  | "structure"   // buildings, walls, bridges, aqueducts, yards
  | "vehicle"     // land vehicles: carts, wagons, carriages, tanks
  | "ship"
  | "weapon"      // siege engines, artillery, small arms
  | "flora"       // trees and plants
  | "prop";       // containers, signs, square and churchyard furniture

export interface ModelFacets {
  kind: ModelKind;
  periods: readonly HistoricalPeriod[];
  years?: readonly [number, number];
  regions: readonly ModelRegion[];
  uses: readonly string[];
}
```

- `ModelRegion` の値の一覧は、FMGの文化セット（Cultures set）とCEの地域外観（`BUILDING_APPEARANCE_PROFILES`）を突き合わせて決める。最初の段階では `european`、`mediterranean`、`middle-eastern`、`east-asian`、`south-asian`、`african`、`american`、`any` 程度の粗い区分から始める。
- 属性は、型と既定値を持つ1つのモジュール（`src/buildings/modelFacets.ts`）にまとめる。`MedievalModel`、`BuildingRecord`、船・乗り物・兵器の各定義は、このモジュールの `ModelFacets` を参照する。
- 属性のないモデルが残っているあいだは、一覧の「未分類」に入れる。属性付けが完了していないことを、一覧で見えるようにするためである。

## 一覧の絞り込み

- 一覧の上部に絞り込み欄を置く：種類（タブまたはチップ）、年代（`HISTORICAL_PERIODS` の範囲指定）、地域（複数選択）、用途タグ、名前での検索。
- 見出しは、絞り込み後のモデルを `kind` → 既存の見出し（Ships、Trade facilities など）の順にまとめて作る。task 番号は表示用の見出しから外し、詳細欄に移す。
- 絞り込みの状態はURLのクエリに保存する（例: `?kind=vehicle&period=petroleumEra`）。特定の一覧をリンクで共有できるようにするためである。
- 一覧の構築は、見出しごとの手書きのコードから、モデルの登録一覧と属性から作る方式に順次置き換える。`main.ts` が大きいため、一覧の構築を `src/building-viewer/catalogueIndex.ts`（名称変更後は `src/model-viewer/`）に切り出す。

## 名称変更

### 対象

| 対象 | 変更前 | 変更後 |
| --- | --- | --- |
| 表示名・ページタイトル | Building Viewer | Model Viewer |
| 略称（AGENTS.md・docs・コメント） | BV | MV |
| ソースのディレクトリ | `src/building-viewer/` | `src/model-viewer/` |
| Viteのエントリ（[vite.config.ts](../../vite.config.ts)） | `buildingViewer` | `modelViewer` |
| URL | `/Fantasy-Map-Generator/building-viewer/` | `/Fantasy-Map-Generator/model-viewer/` |

### 変えないもの

- **モデルのIDとバリアントID**（例: `trade-workshop.dedicated-horse-mill`、`medieval.…@low#…`）。CEの保存データに入っているため変えない。
- **CEの保存データ中の識別子**（`bvModel`、`bv-facility:`、`provenanceId: "bv:…"` など）。名前は古くなるが、変えると既存の保存データが読めなくなる。読み込み時の変換を用意する場合も、別の作業として扱う。
- **`src/buildings/` のディレクトリ名**。種類ごとのフォルダ（`src/models/structures`、`vehicles` など）に分け直すかは、属性付けの後に改めて判断する。名称変更と同時には行わない。
- **過去の設計書のファイル名**（`docs/plan/bv-*.md`）。履歴として残し、本文も書き換えない。今後追加する設計書は `mv-` を接頭辞にする。

### 互換性

- 旧URL `building-viewer/` には、新URLへ移動するだけのページを残す。ブックマークや過去の設計書のリンクを生かすためである。
- ソースから `building-viewer` を参照している箇所（例: テストからの `../../building-viewer/modelMetrics` のimport）は、名称変更のコミットでまとめて置き換える。

## 作業の段階

1. **属性の型の定義**（2026-11-18 完了）：[modelFacets.ts](../../src/buildings/modelFacets.ts) に `MODEL_KINDS`・`MODEL_REGIONS`・`ModelFacets` と検査関数 `modelFacetErrors()` を定義した。`MedievalModel`・`LandmarkModel`・`PlaceableObject` に任意項目 `facets?: ModelFacets` を追加した。
   - `BuildingRecord`（`catalogue/*.json`）には項目を追加しない。レコードは `contentHash` を持つ保存形式で、すでに `period`（年代）と `region`（実在の地名）を持つためである。段階2では、`kind: "structure"`・`periods: [record.period]` をレコードから導き、`region` の地名から `ModelRegion` への対応表をレコードIDごとに用意する。
   - 船・乗り物・兵器・樹木・小物の多くは、共通の定義型を持たず `main.ts` から直接一覧に登録されている。これらの属性は、段階3で一覧の構築を切り出すときに、登録一覧の項目として持たせる。
2. **属性付け**（2026-11-18 完了）：既存モデルに属性を付ける。task 番号のまとまり（中世 `*Models.ts`、船、乗り物、兵器、樹木、カタログ）ごとに分けて進める。全モデルに属性があることを確かめるテストを置き、属性付けが終わった段階で「必須」に切り替える。
   - 属性は各モデルのファイルに書かず、[catalogueFacets.ts](../../src/buildings/catalogueFacets.ts) の表にまとめた。中世モデルは task 番号ごとの既定値と、モデルIDごとの上書きで引く（[wikipedia.ts](../../src/building-viewer/wikipedia.ts) と同じ方式）。60ファイルに分散させず、年代・地域の付け方を1か所で見比べられるようにするためである。モデル定義の `facets` 項目は、表より優先される上書きとして残す。
   - 対象は中世モデル・ランドマーク・配置用オブジェクト（`PLACEABLE_OBJECTS`）・カタログレコードの計269件。引けないモデルでは `medievalFacets()` などの関数が例外を投げ、[catalogueFacets.test.ts](../../src/buildings/catalogueFacets.test.ts) で全件の属性が `modelFacetErrors()` を通ることを確かめる。これを「必須」の扱いとする。
   - 専用工房（`trade-workshop.*`）は、他のモデルと task 番号が重なる（例: cutlery と horse mill がともに 61、metalwares と市場の調度がともに 59）。このため task 番号ではなく工房の種類で引く。
   - カタログレコードは、`kind: "structure"` と `periods: [record.period]` をレコードから導き、地域はレコードIDごとの対応表で引く。
   - 船（ships）・`PLACEABLE_OBJECTS` に入っていない乗り物、兵器・小物の多くは、共通の定義型がなく `main.ts` から直接登録されているため、段階3に回す。
   - 車輪で走るものは用途が軍事でも `vehicle` とした（war wagon）。攻城兵器と火砲は `weapon` とした。
3. **一覧の絞り込み**（2026-11-18 完了）：一覧の構築を切り出し、絞り込み欄と検索、URLクエリへの保存を入れる。
   - 一覧の各ボタンの `data-id` を、属性を引くキーとした。IDのなかったボタン（船のバージ、攻城兵器、水車、井戸、乗り物、収納小物、城門楼、看板など）にIDを付けた。新しいIDは配置用オブジェクトのID（`batteringRam` など）か、`barbican-`・`sign-`・`container-` の接頭辞付きとし、既存のIDは変えていない。
   - [catalogueIndex.ts](../../src/building-viewer/catalogueIndex.ts)：`entryFacets(id)` は、中世モデル・ランドマーク・カタログレコード・配置用オブジェクトを段階2の関数で引く。どれにも当たらないビューワー独自の項目（船、マスケット銃、城壁、地域住宅、要塞の組み立てなど）は、このファイルの表で引く。絞り込みの判定 `entryMatches()` と、URLクエリの読み書き `parseFilter()`・`serializeFilter()` もこのファイルに置いた。
   - [catalogueFilterPanel.ts](../../src/building-viewer/catalogueFilterPanel.ts)：一覧を作り終えた後に呼ばれる。既存の見出しを、属性の種類ごとの節（Structures・Vehicles・Ships・Weapons・Flora・Props・Unclassified）の下に並べ替える。そのうえで、検索・種類・年代の範囲・地域・用途の絞り込み欄を一覧の上に置く。各見出しの中身とクリック時の処理には手を加えず、合わない項目を隠すだけとした。`main.ts` の手書きの一覧を作り直すと差分が大きくなるため、段階的に置き換える方針を取った。
   - 判定の規則：種類・地域・用途は、選んだ値のどれかに当たれば一致とする。年代は、範囲と重なる時代が1つでもあれば一致とする。地域が `any` のモデルは、どの地域を選んでも一致する。属性で絞り込んでいるあいだは、属性のない項目を隠す。
   - 中世モデルの見出しから task 番号を外した（例: `Medieval 61 · Horse Mills` → `Horse Mills`）。task 番号は、これまでどおり詳細欄の「Task」に出る。
   - 確認：ブラウザで全322項目に属性があり、Unclassified の節が空であることを確かめた。`?kind=vehicle&from=steamEra` では5件（熱気球、飛行船、蒸気機関車、鉱車、幌馬車）に絞られた。
4. **名称変更**（2026-11-18 完了）：上の表に従い、名前の変更だけのコミットで行う。AGENTS.md の「BV / Building Viewer」の節も、この時点で「MV / Model Viewer」に書き換える。
   - `src/building-viewer/` を `git mv` で `src/model-viewer/` に移した。テスト・`scripts/` の import や URL、`vite.config.ts` のエントリ（`modelViewer`）、ページタイトル・見出し・ルート要素のIDを改めた。
   - 旧URL用に [src/building-viewer/index.html](../../src/building-viewer/index.html) を残した。クエリとハッシュを保ったまま `model-viewer/` へ転送するだけのページで、ビルドの入口 `buildingViewer` として残す。
   - 改名しなかったもの：CSSのクラス名（`bv-*`）、ソース中のコメントや識別子に残る略称「BV」（約125ファイル）、`scripts/` のファイル名（`verifyBv*.mts` など）。いずれも画面に出ず、互換性にも関わらないため、触ったファイルから順に直す。
5. **近代兵器の追加**：第一次世界大戦の戦車などを `kind: "weapon"` または `"vehicle"`、`periods: ["petroleumEra"]` で追加する。
   - 2026-11-18：戦車は `vehicle` とすることに決めた（未決事項を解消）。最初の1両として、第二次世界大戦のドイツの Tiger I（1942〜1945年）を [tigerTank.ts](../../src/buildings/vehicles/tigerTank.ts) に追加した。属性は `kind: "vehicle"`、`periods: ["petroleumEra"]`、`years: [1942, 1945]`、`regions: ["european"]`、`uses: ["armor", "military"]`。`PLACEABLE_OBJECTS`（ID `tigerI`）とMVの Vehicles の見出しに登録した。author は Claude Opus 5.5。
   - 寸法は公表値（全長8.45 m（砲を前に向けた状態）、車体長6.316 m、全幅3.705 m、全高3.0 m）に合わせた。装甲厚、ハッチ、工具、履帯の個々のリンク、車内は簡略化または省いた。砲塔は旋回しない静止モデルで、国籍標識などのマーキングは描いていない。
   - 2026-11-18：Tiger I に High 品質を追加した。130 mm ピッチの個々の履帯リンク（片側約100枚、グローサー付き）、ゴムタイヤ付きの転輪とボルト止めのハブキャップ、2列の歯を持つ起動輪、スポーク付きの誘導輪、牽引シャックル・前照灯・牽引ワイヤー・工具・機関室のファンカバーとグリル、段付きの砲身とスロット付きの砲口ブレーキ、ピストルポート・脱出ハッチ・吊り上げ環・3連の発煙弾発射器を加えた。これまでのモデルは Low とした。`object.tigerI@high` として登録し、CE は従来どおり default（Low）を使う。

## 検証

- 属性：すべてのモデルが `kind`・`periods`・`regions` を持ち、`periods` が `HISTORICAL_PERIODS` の値だけからなることをテストで確かめる。
- 一覧：絞り込みの結果が、属性から求めた期待値と一致することを確かめる。
- 名称変更：変更後に、モデルの契約テスト（`modelContracts.test.ts`）とCEの施設配置のテスト（`allocateBVFacilities.test.ts`）が変わらず通ることを確かめる。旧URLから新URLへ移ることをブラウザで確認する。

## 未決事項

- `ModelRegion` の最終的な値の一覧（FMGの文化セットとの対応）。
- ~~戦車を `weapon` と `vehicle` のどちらに入れるか~~ → `vehicle` に決定（2026-11-18）。
- CEの保存データ中の `bv` 接頭辞を、読み込み時の変換付きで改名するかどうか。
