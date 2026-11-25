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
   - 2026-11-18：航空機の最初の1機として、アメリカの B-29 Superfortress 爆撃機（1944〜1960年）を [b29Bomber.ts](../../src/buildings/vehicles/b29Bomber.ts) に追加した。航空機は飛行船の前例に合わせて `kind: "vehicle"` とし、属性は `periods: ["petroleumEra"]`、`years: [1944, 1960]`、`regions: ["american"]`、`uses: ["aviation", "military"]`。`PLACEABLE_OBJECTS`（ID `b29`）、MVの Vehicles の見出し、`object.b29@high` に登録した。author は Claude Opus 5.5。
   - 全長30.18 m、全幅43.05 m、全高8.46 m、プロペラ直径5.05 m は公表値に合わせた。尾翼・ナセル位置・脚の位置は三面図から割り出した概略値である。翼・尾翼は対称 NACA 断面を断面ロフトで作り、上反角4.5°と丸めた翼端を持つ。High ではフラップ・補助翼・昇降舵・方向舵を分け、機首ガラスの枠、天測窓、銃塔4基と尾部銃座、側面・上面の照準ブリスター、爆弾倉扉の継ぎ目、カウルフラップ・オイルクーラー吸気口・ターボ過給器、ねじれと黄色の先端を持つプロペラ、主脚の緩衝支柱・ドラッグブレース・脚扉を加えた。車内、爆弾、一部機体の APQ-13 レドーム、後期型の4連装上部銃塔は省いた。プロペラ・銃塔・舵面は動かない静止モデルで、マーキングは描いていない。
   - 2026-11-18：アメリカの B-2 Spirit ステルス爆撃機（1997年〜、退役予定を2032年とした）を [b2Bomber.ts](../../src/buildings/vehicles/b2Bomber.ts) に追加した。属性は `kind: "vehicle"`、`periods: ["rocketryEra"]`、`years: [1997, 2032]`、`regions: ["american"]`、`uses: ["aviation", "military"]`。`PLACEABLE_OBJECTS`（ID `b2`）、MVの Vehicles の見出し、`object.b2@high` に登録した。author は Claude Opus 5.5。
   - 全長21.0 m、全幅52.4 m、全高5.18 m、前縁後退角33° は公表値に合わせた。後縁の折れ点（ダブルWの鋸歯）は各辺がいずれかの前縁と平行になるよう計算し、翼厚・インテーク・脚の位置は三面図から割り出した概略値である。翼は中心体から翼端まで断面ロフトした一体の全翼で、操縦席の膨らみは中心線上の実際の頂点が公表全高にちょうど届くよう高さを決めている。High では中央のビーバーテール（GLAS）、片側3枚のエレボン、翼端のスプリット式ドラッグラダーを分け、風防・側窓、脱出ハッチ、空中給油口、補助吸気扉、爆弾倉扉の継ぎ目、4輪ボギーの主脚と支柱・脚扉・脚収納部を加えた。機内、兵装、電波吸収材のパネル継ぎ目、センサー類は省いた。舵面・扉は動かない静止モデルで、マーキングは描いていない。
   - 2026-11-19：ライト兄弟のライトフライヤー号（1903年）を [wrightFlyer.ts](../../src/buildings/vehicles/wrightFlyer.ts) に追加した。属性は `kind: "vehicle"`、`periods: ["industrialChemistryEra"]`、`years: [1903, 1903]`、`regions: ["american"]`、`uses: ["aviation"]`。`PLACEABLE_OBJECTS`（ID `wrightFlyer`）、MVの Vehicles の見出し、`object.wrightFlyer@high` に登録した。author は Claude Opus 5.5。
   - 全長6.43 m、全幅12.29 m、全高2.74 m、翼弦1.98 m、翼間1.83 m、キャンバー1/20、プロペラ直径2.59 m は公表値に合わせた。全高はプロペラの羽根を真上に向けた先端とし、プロペラ軸を上下翼の中間に置いて翼の高さを決めている。支柱の位置、前後のアウトリガー、昇降舵・方向舵の寸法は三面図から割り出した概略値である。上下翼はキャンバー付きの薄板で、翼端に向けて垂れ下がる（アンヒドラル）。Low は翼・複葉の昇降舵・双方向舵・支柱・アウトリガー・スキッド・ねじれのある2翅プロペラ2基・箱形のエンジンと駆動軸。High では両翼と昇降舵のリブ、中央以外の各ベイの張線、昇降舵間の半月形ブリンカー、4気筒エンジンのシリンダー・水ジャケット・フライホイール、縦置きラジエーター、燃料タンク、駆動軸とスプロケット、チェーンとガイド管（左は交差させて逆回転）、プロペラ軸受の支柱、ヒップクレードルと昇降舵レバーを加えた。操縦者、発射レールと台車、操縦索、計器は省いた。翼はねじれず、プロペラは回らない静止モデルである。
   - 2026-11-19：カール・ベンツのベンツ・パテント・モトールヴァーゲン Nr. 1（1885年製作、1886年1月29日特許 DRP 37435）を [benzMotorwagen.ts](../../src/buildings/vehicles/benzMotorwagen.ts) に追加した。属性は `kind: "vehicle"`、`periods: ["industrialChemistryEra"]`、`years: [1886, 1893]`、`regions: ["european"]`、`uses: ["transport"]`。`PLACEABLE_OBJECTS`（ID `benzMotorwagen`）、MVの Vehicles の見出し、`object.benzMotorwagen@high` に登録した。author は Claude Opus 5.5。
     - 全長2.70 m、全幅1.40 m、全高1.45 m、ホイールベース1.45 m は Wikipedia の公表値に合わせた。全長は前輪タイヤの前端から水平フライホイールの後端、全幅は後輪ハブキャップ間、全高は操舵ティラーの握りの上端とした。車輪径（前0.74 m・後1.12 m）、トレッド、座席・エンジン・駆動系の位置は写真とレプリカから割り出した概略値である。Low は3輪（ソリッドタイヤ・リム・ハブ・8本スポーク）、前フォークとヘッドチューブ、鋼管フレーム、床板、座席、ティラーと操舵ロッド、箱形のエンジンと水タンク、水平フライホイール・垂直クランク軸、カウンターシャフトとプーリー・スプロケット。High ではタンジェント組みのワイヤースポーク（前24本・後32本）、フレームのクロスチューブと後軸の楕円ばね、すのこ状の床板、座席の手すり、フィン付きシリンダー・蒸発冷却の水ジャケットと上部タンク・クランクケース・表面気化器・バルブロッド・排気管、クランク軸プーリーからカウンターシャフトへの4分の1ひねりベルト、固定・遊動プーリー、差動装置、バンドブレーキ、左右の駆動チェーン、ラック・アンド・ピニオン、ブレーキ兼ベルト切替レバーを加えた。運転者、ランプ、燃料配管は省いた。車輪・ベルト・チェーンは動かない静止モデルである。
   - 2026-11-19：綱を手で引いて川を渡る荷車用の平底渡し船を [ropeFerry.ts](../../src/buildings/ships/ropeFerry.ts) に追加した（[古代ローマ〜大航海時代の未登録モデル](ancient-to-early-modern-model-tasks.md) の A01）。CE にはまだ置かないため MV 専用とし、Ships の見出しに置いた。属性は `kind: "ship"`、`periods` は highMedieval〜steamEra、`regions: ["european"]`、`uses: ["ferry", "transport"]`（[catalogueIndex.ts](../../src/model-viewer/catalogueIndex.ts) の MV 専用エントリ `rope-ferry`）。`SHIP_VARIANTS` に `ship.rope-ferry` の default／low／high を登録した。author は Claude Opus 5.5。
     - 船体は全長12.0 m・幅3.4 m・深さ0.8 m・空荷の喫水0.3 m。跳ね上げ板を立てた全長は13.03 m で、水線を y = 0 とする。寸法の根拠と推定した部分は、A01 の項に記載した。Low は船体・一枚の甲板・車輪止めの縁材・側面のレール・跳ね上げ板・綱の支柱と綱・係船柱・乗せ竿。High では甲板の板、外板の継ぎ目、跳ね上げ板の滑り止めと蝶番の鉄帯・吊り鎖、支柱のローラー、綱を引く道具、車輪止め、汲み出し用の手桶、竿の鉄の石突きを加えた。人・荷車・家畜と、川を横切る綱の全長は省いた。
   - 2026-11-21：ポンペイの円形闘技場を [amphitheatre.ts](../../src/buildings/roman/amphitheatre.ts) に追加した（[古代ローマ〜大航海時代の未登録モデル](ancient-to-early-modern-model-tasks.md) の C03）。MV 専用で Roman buildings の見出しに置いた。属性は `kind: "structure"`、`periods: ["classicalAntiquity", "lateAntiquity"]`、`regions: ["mediterranean"]`、`uses: ["spectacle"]`（MV 専用エントリ `amphitheatre`）。author は Claude Opus 5.5。
     - 全体と闘技場の寸法、列数は Mau（1899）の記述、観客席の帯の幅は図93から測った。根拠は C03 の項に記載した。闘技場は地表下にあるため、MV の地面の円盤は隠し、モデル側に周りの地面（外面から10 m）を持たせた。Low は闘技場の床と壁、笠石、35列の座席と2本の通路、第2通路の手すり壁、桟敷の台とヴォミトリウム40、テラス、外壁と控え壁40、南北の通路（掘割とヴォールトの口、外壁の入口）、西の「死の門」、西の二重の外階段2つ。High では闘技場の壁画（広い区画と狭い区画を交互）、笠石の鉄柵、桟敷の仕切り、外周のアーチ、死の門の枠を加えた。
   - 2026-11-21：ポンペイのフォルム浴場の男湯を [forumBaths.ts](../../src/buildings/roman/forumBaths.ts) に追加した（[古代ローマ〜大航海時代の未登録モデル](ancient-to-early-modern-model-tasks.md) の C02）。MV 専用で Roman buildings の見出しに置いた。属性は `kind: "structure"`、`periods: ["classicalAntiquity"]`、`regions: ["mediterranean"]`、`uses: ["bathing"]`（MV 専用エントリ `forum-baths`）。author は Claude Opus 5.5。
     - 各室の内寸は Mau（1899）の図86の縮尺から測った。根拠は C02 の項に記載した。Low は脱衣室・微温浴室・熱浴室（北の半円の張り出し付き）・円形の冷浴室・炉室の外形、瓦の切妻屋根と冷浴室の四角錐の屋根、入口。High では冷浴室の天窓、微温浴室と熱浴室の南端の高窓とアーチ、網目積みの目地、角の瓦の層、炉室の青銅の湯釜3基とその台、焚き口、熱浴室の屋根の丸瓦を加えた。
   - 2026-11-20：ローマの集合住宅（インスラ）を [insula.ts](../../src/buildings/roman/insula.ts) に追加した（[古代ローマ〜大航海時代の未登録モデル](ancient-to-early-modern-model-tasks.md) の C01）。MV 専用で、新しい見出し Roman buildings に置いた。属性は `kind: "structure"`、`periods: ["classicalAntiquity"]`、`regions: ["mediterranean"]`、`uses: ["dwelling", "trade"]`（MV 専用エントリ `roman-insula`）。author は Claude Opus 5.5。
     - オスティアのディアナの家（40 × 22 m、4階、軒14.9 m）に合わせた。根拠は C01 の項に記載した。Low は中庭を囲む4棟・瓦の寄棟屋根・中庭の床・店の入口と中二階の窓・中庭への通路・階段の入口・上階の窓・2階のバルコニー。High では瓦の帯（レンガ張りの中の平瓦の層）、窓と店の上の浮き彫りのアーチ、トラバーチンの敷居と戸口の柱、バルコニーの持ち送りと手すり、一部の窓の鎧戸、中庭の窓・貯水槽・大理石の噴水、屋根の丸瓦を加えた。
   - 2026-11-20：15世紀のボヘミア製パヴィス（大盾）を [pavise.ts](../../src/buildings/arms/pavise.ts) に追加した（[古代ローマ〜大航海時代の未登録モデル](ancient-to-early-modern-model-tasks.md) の B04）。MV 専用で、新しい見出し Field defences に置いた。属性は `kind: "weapon"`、`periods: ["lateMedieval"]`、`regions: ["european"]`、`uses: ["armor", "military"]`（MV 専用エントリ `pavise`）。author は Claude Opus 5.5。
     - メトロポリタン美術館の収蔵品（107.95 × 52.07 cm、反り12.7 cm、厚さ約2.5 cm、7.569 kg）に合わせた。根拠と重さの照合は B04 の項に記載した。Low は彩色した表面・裏面・縁の板・支え棒。High では革張りの縁、ボヘミア王の徽章（王冠と三本の駝鳥の羽根）、裏の握りと鋲、運搬用の革帯、支え棒の鉄の受け金と石突きを加えた。
   - 2026-11-20：ヘンリー8世の野営宿営の一部（広間・円形のテント・渡り廊下）を [tudorLodging.ts](../../src/buildings/camps/tudorLodging.ts) に追加した（[古代ローマ〜大航海時代の未登録モデル](ancient-to-early-modern-model-tasks.md) の B03）。MV 専用で、新しい見出し Camps に置いた。属性は `kind: "structure"`、`periods: ["ageOfExploration"]`、`years: [1520, 1547]`、`regions: ["european"]`、`uses: ["military", "residence"]`（MV 専用エントリ `tudor-lodging`）。author は Claude Opus 5.5。
     - 寸法は1547年目録の布の幅数・三角布の数・深さ（ヤード）から、布1幅を約1ヤードとして導いた。根拠は B03 の項に記載した。Low は壁と屋根の布・広間の棟木と柱・円形のテントの柱・青い縁飾り・金の風見と頂部の飾り玉。High では屋根の三角布と壁の布の継ぎ目、青いバックラムの枝模様、頂部の赤いバラ、結び上げた入口の垂れ布、張り綱と杭を加えた。
   - 2026-11-20：攻城陣地に据えた大型の鍛鉄製ボンバードを [bombard.ts](../../src/buildings/siege/bombard.ts) に追加した（[古代ローマ〜大航海時代の未登録モデル](ancient-to-early-modern-model-tasks.md) の B02）。属性は `kind: "weapon"`、`periods: ["lateMedieval"]`、`regions: ["european"]`、`uses: ["artillery", "military", "siege"]`。`PLACEABLE_OBJECTS`（ID `bombard`）、MVの Artillery の見出し、`object.bombard@high` に登録した。author は Claude Opus 5.5。
     - 砲は Mons Meg（全長4.06 m、砲身2.80 m、口径510 mm、縦板25本、約6.6 t）に合わせ、砲身の外径約0.71 m は重さから割り出した。寸法と史料の根拠は B02 の項に記載した。Low は砲身と薬室・鉄輪4本・枕木・台の梁・受け木・仰角の楔・反動受けの梁と柱と斜めの支え・盾の柱と筋かいと軸・上げた盾・石の弾。High では砲身と薬室の鉄輪を1本ずつ、砲口の縦板の継ぎ目25本、薬室を回す棒の受け穴、砲を台に縛る綱と鉄帯、地面の杭、盾の板の継ぎ目と蝶番と支え棒、予備の弾、込め棒と火薬の匙を加えた。砲手は省いた。
   - 2026-11-20：人力で綱を引く投石機（traction trebuchet、マンゴネル）を [tractionTrebuchet.ts](../../src/buildings/siege/tractionTrebuchet.ts) に追加した（[古代ローマ〜大航海時代の未登録モデル](ancient-to-early-modern-model-tasks.md) の B01）。属性は `kind: "weapon"`、`periods` は lateAntiquity〜highMedieval、`years: [586, 1291]`、`regions: ["european", "mediterranean", "middle-eastern"]`、`uses: ["military", "siege"]`。`PLACEABLE_OBJECTS`（ID `tractionTrebuchet`）、MVの Siege engines の見出し、`object.tractionTrebuchet@high` に登録した。author は Claude Opus 5.5。
     - 腕木4.88 m（6対1）、柱3.66 m、地面の梁4.88 m と3.66 m、投石紐1.04 m は Tarver の復元機に合わせた。寸法と史料の根拠は B01 の項に記載した。Low は梁・柱・筋かい・軸・先細りの腕木・根元の塊・三角の補強・鉤・投石紐と袋と石・引き綱4本。High では引き綱8本と輪、握りの結び目、腕木に巻いた綱、根元の鉄帯、軸受けと楔、筋かいの木釘、投石紐の鉄の輪、予備の石を加えた。引き手は省いた。
   - 2026-11-20：ライン川の流れで渡る渡し船（Gierponte、fliegende Brücke）を [reactionFerry.ts](../../src/buildings/ships/reactionFerry.ts) に追加した（[古代ローマ〜大航海時代の未登録モデル](ancient-to-early-modern-model-tasks.md) の A05）。MV 専用で Ships の見出しに置いた。属性は `kind: "ship"`、`periods` は maritimeEra〜steamEra、`regions: ["european"]`、`uses: ["ferry", "transport"]`（MV 専用エントリ `reaction-ferry`）。`SHIP_VARIANTS` に `ship.reaction-ferry` の default／low／high を登録した。author は Claude Opus 5.5。
     - St. Goar の1772年の船を基準に、船体2隻（各23.5 × 3.56 × 1.48 m）、荷床17.1 × 8.5 m、鐘の小屋の屋根まで水線上13.0 m。寸法と史料の根拠は A05 の項に記載した。Low は船体2隻・舵2枚と舵柄・荷床と後ろの台・荷床の柱・縁材・手すり（両舷に門）・2本のマストと2本の横木・鐘の小屋・綱と受け台と巻き取り機・部屋2つ・番小屋。High では手すりの子柱、甲板の継ぎ目、縁材の曲がった角、マストの横静索と飾りの軒、鐘、吹き流し、錨の巻き上げ機2台、排水ポンプ2台、巻き取り機のハンドル、舵の金具を加えた。鎖と鎖を支える小舟、人・馬・荷車は省いた。
   - 2026-11-19：竿と櫂で人を渡すライン川流域の渡しの小舟（Fährnachen）を [ferryNachen.ts](../../src/buildings/ships/ferryNachen.ts) に追加した（[古代ローマ〜大航海時代の未登録モデル](ancient-to-early-modern-model-tasks.md) の A02）。MV 専用で Ships の見出しに置いた。属性は `kind: "ship"`、`periods` は highMedieval〜steamEra、`regions: ["european"]`、`uses: ["ferry", "transport"]`（MV 専用エントリ `ferry-nachen`）。`SHIP_VARIANTS` に `ship.ferry-nachen` の default／low／high を登録した。author は Claude Opus 5.5。
     - 12.56 × 1.57 × 0.70 m、喫水0.2 m。寸法と史料の根拠は A02 の項に記載した。Low は底板・舷側板・両端・舷縁・座席5本・櫂2本・竿。High では肋材、船底の反りに沿う床板、舷側板の継ぎ目、櫂を受ける栓と輪、竿の鉄の石突き、両端のもやい綱、汲み出し用の手桶を加えた。人と荷は省いた。
   - 2026-11-19：帆と櫂で広い水面を渡るデンマークの屋根の無い渡し船（スマック船）を [ferrySmack.ts](../../src/buildings/ships/ferrySmack.ts) に追加した（[古代ローマ〜大航海時代の未登録モデル](ancient-to-early-modern-model-tasks.md) の A04）。MV 専用で Ships の見出しに置き、帆の Set／Furled を選べる。属性は `kind: "ship"`、`periods` は ageOfExploration〜preIndustrialEra、`regions: ["european"]`、`uses: ["ferry", "transport"]`（MV 専用エントリ `ferry-smack`）。`SHIP_VARIANTS` に `ship.ferry-smack` の default／low／high を登録した。author は Claude Opus 5.5。
     - 船体は全長14 m・幅4.5 m・深さ1.5 m・喫水0.8 m。寸法と史料の根拠は A04 の項に記載した。Low は船体・前後の甲板・荷室の床・馬をつなぐ横木と柱・リーボード・舵と舵柄・マスト・ブーム・ガフ・主帆と前帆（畳むと束）・櫂・乗り込み用の板。High では外板の継ぎ目と甲板の継ぎ目、マストの帆環、横静索と鎖板、前支索、帆を上げる索と帆を操る索、主帆の縮帆索、リーボードの軸と吊り索、馬の胸当て、櫂を受ける栓、舵の軸金具、小錨を加えた。人・馬・荷車は省いた。
   - 2026-11-18：アメリカの Gerald R. Ford 級原子力空母（ネームシップ CVN-78、2017年〜）を [fordCarrier.ts](../../src/buildings/ships/fordCarrier.ts) に追加した。CE の船舶ツールは帆船（GalleonState）前提のため、トライリームと同じく MV 専用とし、Ships の見出しに置いた。属性は `kind: "ship"`、`periods: ["rocketryEra"]`、`years: [2017, 2105]`、`regions: ["american"]`、`uses: ["aviation", "military"]`（[catalogueIndex.ts](../../src/model-viewer/catalogueIndex.ts) の MV 専用エントリ `ford-carrier`）。author は Claude Opus 5.5。
   - 全長337 m、飛行甲板幅78 m、水線幅41 m、喫水12 m、キールからマスト頂部まで76 m は Wikipedia の公表値に合わせた。水線を y = 0 とする。飛行甲板の高さ（水線上19.5 m）、アイランド・エレベーター・カタパルト・兵装の位置は写真と一般配置図から割り出した概略値である。Low は船体・スポンソン・飛行甲板・アイランド・マスト・レーダー面・エレベーター・推進器の概形、High は甲板マーキング（9°のアングルドデッキ、EMALS 4基と JBD、着艦ワイヤー3本）、艦橋・航空管制所の窓、マストのヤードとアンテナドーム、格納庫開口、錨孔、喫水線の黒帯、Mk 29・Mk 49・ファランクス、5翅プロペラ4基と舵2枚を加えた。艦載機・艦番号・内部は省いた。

## 検証

- 属性：すべてのモデルが `kind`・`periods`・`regions` を持ち、`periods` が `HISTORICAL_PERIODS` の値だけからなることをテストで確かめる。
- 一覧：絞り込みの結果が、属性から求めた期待値と一致することを確かめる。
- 名称変更：変更後に、モデルの契約テスト（`modelContracts.test.ts`）とCEの施設配置のテスト（`allocateBVFacilities.test.ts`）が変わらず通ることを確かめる。旧URLから新URLへ移ることをブラウザで確認する。

## 未決事項

- `ModelRegion` の最終的な値の一覧（FMGの文化セットとの対応）。
- ~~戦車を `weapon` と `vehicle` のどちらに入れるか~~ → `vehicle` に決定（2026-11-18）。
- CEの保存データ中の `bv` 接頭辞を、読み込み時の変換付きで改名するかどうか。
