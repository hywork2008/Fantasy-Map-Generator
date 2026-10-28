# BVモデルの作者と、CEが採用するモデルの組み合わせ

2026-10-29

## 1. 目的

BVのモデルは、複数のAIモデルがそれぞれ一部を作っている。1つの樹種でも、high・ultraはCodex（GPT-6.1 Sol）、mediumはClaude Opus 5.5というように、品質の段階ごとに作者が違うことがある。同じ部位を別々のAIが作った版が並ぶこともある（ガレオン船、市壁など）。

次の2つを、コードの中で1か所にまとめて保持する。

1. **作者**：BVの各モデル・各品質の段階を、誰が作ったか。どのモデルを土台にしたかも含める。
2. **採用**：開発者が、CEでどの版を使うと決めたか。

採用を変えるときは、採用表を1行書き換えるだけで済むようにする。BVでは作者と採用の状態が見えるようにする。

## 2. 現状

### 2.1 作者の記録

- 作者は、モデル定義の自由な文字列 `author` に書かれている。同じ作者の書き方が揃っていない。

  | 文字列 | 件数 | 備考 |
  |---|---|---|
  | `Codex GPT-6.1 Sol` | 159 | |
  | `Claude Opus 5.5` | 18 | |
  | `GPT-6.1 Sol` | 4 | 樹木（ライム・トウヒ・シラカバ・イチイ） |
  | `Codex` | 1 | 門楼。BVの既定値 `DEFAULT_AUTHOR` も `Codex` |
  | `Claude 5.5 Medium` | 1 | バシリカ神殿 |
  | `Grok` | 3箇所 | `TOWN_WALL_AUTHOR` |

- `author` を持たないモデルは、BVでは `DEFAULT_AUTHOR = "Codex"` と表示される。
- BVの「Created by」は、`AUTHORED_VARIANTS`（一覧ボタンのidをキーとする表）で別の作者の版に切り替える。この表の登録は、[main.ts](../../src/building-viewer/main.ts) の中に散らばっている。
- 品質の段階ごとの作者は、2026-10-29に暫定で次の形にした。
  - [43-landscape-treesModels.ts](../../src/buildings/medieval/43-landscape-treesModels.ts) に `QUALITY_AUTHORS` という表を置き、ライムとイチイのmediumをClaude Opus 5.5としている。
  - BVでは、その表を `LEVEL_AUTHORS` で読んで表示している。

### 2.2 CEの採用

- CEは、使うモデルの生成関数を直接importしている。どの版を採用したかは、import文の中にしか残っていない。
  - ガレオン船：BVにはCodex版（`ships/galleon`）とOpus版（`ships/opusGalleon`）がある。CEは [shipMeshes.ts](../../src/city3d/three/shipMeshes.ts) でCodex版を使っている。
  - 市壁：BVにはCodex版（`codexTownWalls`）とGrok版（`townWalls`）がある。CEは [townWallMeshes.ts](../../src/city3d/three/townWallMeshes.ts) でCodex版を使っている。
  - バシリカ神殿：CEはClaude 5.5 Medium版（`createBasilicaTemple`）を使っている。
  - 樹木：品質の段階ごとに作者が違う。CEは `createLandscapeTree(species, quality)` を通して、全段階を使っている。
- どの版を採用したか、その理由と日付を、コードからもCEの画面からも確かめられない。

### 2.3 品質の段階の呼び方

品質の段階は、モデルの系統ごとに呼び方が違う。

- 建物：`MODEL_QUALITIES = low / standard / high`（[modelQuality.ts](../../src/buildings/modelQuality.ts)）
- 樹木：`TREE_QUALITIES = low / medium / high / ultra`（[treeQuality.ts](../../src/buildings/landscape/treeQuality.ts)）

この設計では呼び方を統一しない。段階の名前は、系統ごとに文字列として扱う。

## 3. 用語

| 用語 | 意味 | 例 |
|---|---|---|
| 系統（family） | CEが1つの用途で使うモデルのまとまり | `tree.garden-parkland`、`ship.galleon`、`wall.town` |
| 段階（level） | 系統の中の品質の段階。段階が1つしかない系統は `default` | `medium`、`high` |
| 版（variant） | ある系統の、ある段階を、ある作者が作った実装 | ライムのmedium（Opus版） |
| 作者（author） | 版を作ったAI。作業した道具とモデル名の組 | Codex＋GPT-6.1 Sol |
| 採用（adoption） | CEがその系統・段階で使う版を、開発者が1つに決めたもの | ライムのmedium → Opus版 |

## 4. データモデル

### 4.1 作者の登録表（`src/buildings/authors.ts`、実装済み）

作者は、登録表にある表記だけを受け付ける型 `Author` で書く。

```ts
export const AUTHORS = ["Codex GPT-6.1 Sol", "Claude Opus 5.5", "Grok"] as const;
export type Author = (typeof AUTHORS)[number];
export const DEFAULT_AUTHOR: Author = "Codex GPT-6.1 Sol";
export function authorSlug(author: Author): string; // "claude-opus-5.5"
```

- 初案では、表示名とは別のid（`codex-gpt-6.1-sol`）で参照する予定だった。実装では、表示名そのものを型にした。
  - 既存の159件の `"Codex GPT-6.1 Sol"` は、書き換えずにそのまま型チェックを通る。
  - 版idに使う小文字の形は、`authorSlug` で作る。
- 各モデル定義の `author?: string` は `Author` に変えた（modelKit・townWalls・barbicans・architectureKit・hangingSign）。
- BVの `AUTHORED_VARIANTS` も `Author` で型付けしたので、BVに表示される作者はすべて型チェックを通る。
- §9の決定に従い、既存の文字列を次のように置き換えた。
  - `GPT-6.1 Sol`・`Codex` → `Codex GPT-6.1 Sol`
  - `Claude 5.5 Medium` → `Claude Opus 5.5`
- 作者のないモデルに表示する `DEFAULT_AUTHOR` は、`Codex` から `Codex GPT-6.1 Sol` に変えた。

### 4.2 版（`ModelVariant`、`src/buildings/modelVariants.ts`、実装済み）

```ts
export interface ModelVariant {
  /** `${family}@${level}#${author}` で、リポジトリ全体で一意 */
  id: string;
  family: string;
  level: string;
  author: Author;
  /** 土台にした版。Opusのmediumは、GPT-6.1 Solのhighの枝構造をそのまま使う */
  basedOn?: readonly string[];
  /** 作業の履歴。古い順に並べる */
  credits?: readonly { author: Author; date: string; note: string; commit?: string }[];
  create(): CityStructureMeshes;
}
```

- 版のidは文字列1つで済むようにし、採用表・キャッシュのキー・BVの表示・テストで共通に使う。例：`tree.garden-parkland@medium#claude-opus-5.5`。
- `basedOn` は、作者の「担当範囲」を正しく表すために置く。Opusのmediumは、GPT-6.1 Solのhighの生成関数を同じ乱数列で動かし、葉だけを置き換えている。そのため「mediumはOpusが作り、枝はGPT-6.1 Solのhighに由来する」と記録する。
- `credits` には、同じ版を別の作者が書き直したことを残す。例えば、元はCodexが作ったmediumをOpusが作り直した場合、`basedOn` ではなく `credits` に残す（commitは任意）。
- 版の一覧は系統ごとのファイルに置き、`src/buildings/variants.ts` の `MODEL_VARIANTS` で1つの表にまとめる。樹木は `src/buildings/landscape/treeVariants.ts`。
- 樹木の版（2026-10-29時点）
  - 段階のない18樹種は、`default` の版が1つずつある。作者は樹種ごとの `TREE_AUTHORS` に置き、BVの `43-landscape-treesModels.ts` もこれを参照する。
  - ライムとイチイには、low・medium（Codex）・medium（Opus）・high・ultraの5版がある。
  - Codexの旧mediumは、commit 45e24d51d のコードを `temperateTreeCodexMedium.ts` に戻した。

### 4.3 CEの採用表（`src/city3d/adoption.ts`、樹木は実装済み）

```ts
export const CE_ADOPTION: Record<string, Record<string, Adoption>> = {
  "tree.garden-parkland": {
    medium: { variant: "tree.garden-parkland@medium#claude-opus-5.5", since: "2026-10-29",
              note: "Matches the high-tier silhouette with fewer triangles (2,446 to 1,888)" }
  },
  "tree.sacred-yew": { medium: { variant: "tree.sacred-yew@medium#claude-opus-5.5", since: "2026-10-29", note: "…" } }
};
interface Adoption { variant: string; since: string; note?: string }
```

- 採用表は、BVではなくCE側（`src/city3d`）に置く。BVはモデルの一覧で、その中からどれを使うかはCEの判断だからである。
- 採用表に書くのは、同じ系統・同じ段階に複数の版がある所だけにした。版が1つしかない段階は、その版を自動で採用する。
  - 初案ではすべての段階を書く予定だった。しかし全段階を書くと、選択肢のない行が採用表の大半を占め、判断した所が埋もれる。
  - 複数の版があるのに採用表に書いていない場合は、`adoptedVariant` が例外を投げ、テストで検出する。
- 足りない段階の補い方は、今の規則のままにする（建物は `resolveModelQuality`、樹木は1段ずつ下げる）。

### 4.4 CEからの呼び出し

CEは生成関数を直接importせず、採用表を通して版を作る。

```ts
export function adoptedVariant(family: string, level: string): ModelVariant
export function adoptedTree(species: TreeSpecies, quality = "ultra"): ModelVariant
```

- 生成済みモデルのキャッシュのキー（[bvInstances.ts](../../src/city3d/three/bvInstances.ts) の `BvDefinition.id`）には、版のidを使う。採用を変えると、別のプロトタイプとして作り直される。森の詳細樹木は `forest-tree:${variant.id}` に変えた（以前の `forest-tree:${species}:${quality}` には作者が入っていなかった）。
- 樹木では、CEの森（`forestTreeDetails.ts`）と公園・墓地（`openSpaceMeshes.ts`）の `createLandscapeTree` を `adoptedTree(...).create()` に置き換えた。
- BVの建物モデルの部品として使う樹木（修道院の庭の `friary.ts`）は、BVのモデルの一部なので置き換えていない。

## 5. BVの表示（樹木は実装済み）

- 品質のプルダウンには、段階を1つずつ出す。選ぶと、その段階でCEが採用している版を表示する。
- 「Created by」には、表示中の版の作者を出す。同じ段階に複数の作者の版があれば、「Created by」で切り替えられる（ライム・イチイのmediumでは、Codex GPT-6.1 SolとClaude Opus 5.5）。
- 詳細欄に次の項目を出す。
  - 「CE adoption」：「Adopted」か「Not adopted; CE uses …」
  - 「Based on」：土台にした版
  - 「Credits」：作業の履歴
- 複雑さの比較表には、すべての版を列として出す。採用されていない版の列名には作者を付ける（例：`medium · Codex`）。
- 2026-10-29の暫定実装（`QUALITY_AUTHORS`、品質名への作者名の併記）は廃止した。
- ほかの系統の `AUTHORED_VARIANTS` の手書き登録は、A3で版の表から作るように変える。

## 6. CEの表示

- 3D表示の設定か情報欄に「3Dモデルの作者」を置く。いま画面にある系統について、採用している版の作者を一覧にする。
- 一覧は採用表から作るので、追加で記録するものはない。

## 7. 保存と共有

- CEの保存文書と共有データには、採用表を記録しない。3Dモデルは開くたびに生成されて文書に保存されないので、採用が変わっても文書の内容は壊れない。
- 再現のために、スクリーンショットや計測を出力するときは、採用表のハッシュを添える（例：計測ツールの出力ヘッダー）。文書形式は変えない。

## 8. 検査

テストは、次の取り違えを防ぐものに限る。

1. 採用表のすべての版idが、版の表に存在する。
2. 版idが、その版の `family`・`level`・`author` と一致する。
3. CEが要求する系統と段階が、採用表か補い方の規則で必ず解決できる。
4. 作者は型で縛るので、テストは要らない。

## 9. 決定事項（2026-10-29）

1. `Codex`・`Codex GPT-6.1 Sol`・`GPT-6.1 Sol` は同じ作者とし、`Codex GPT-6.1 Sol` に統一する。
2. `Claude 5.5 Medium` は `Claude Opus 5.5` とする。
3. 今あるlowと、作者が書かれていないモデルは、すべて `Codex GPT-6.1 Sol` とする。
   - ライム・イチイのlowの陰影は、10-29にOpusが書き直した。これは `credits` に残す。
4. Codexが作った旧mediumを戻し、BVで比べられるようにする。作り直した版は、Opusの版として表示する。CEはOpusの版を採用する。

## 10. 実装の段階

| 段階 | 内容 | 状態 |
|---|---|---|
| A0 | 作者の登録表を作り、既存の表記を統一する | 2026-10-29 完了 |
| A1 | 版の表と版idを作る。樹木から始め、`QUALITY_AUTHORS` を版の表に移す。Codexの旧mediumを戻す | 2026-10-29 樹木完了 |
| A2 | CEの採用表を作り、樹木の生成（森・公園・墓地）を採用表経由にする。キャッシュのキーを版idにする | 2026-10-29 樹木完了 |
| A3 | 別の作者の版がある系統を移す（ガレオン船、市壁、バシリカ神殿）。続いて残りの系統を移す | 2026-10-29 完了（§10.2、§10.4） |
| A4 | BVの「CE採用」表示と `basedOn`/`credits` の表示。CEの「3Dモデルの作者」の一覧 | 2026-10-29 完了（§10.3） |

- A0〜A3は表示を変えない置き換えなので、各段階で関連テストとBVでの確認だけで進められる。
- 樹木では、採用表を書き換えるだけでCEが使う版を切り替えられる。

### 10.1 2026-10-29の確認

- 型チェックとbiomeのチェックは問題なし。
- `npx vitest run src/city3d/adoption.test.ts src/buildings/landscape src/building-viewer src/buildings/medieval` と、森・公園の3Dの関連テストを実行した。
  - 新しい2件（版idの一意性と表記、採用表の解決）と、採用表経由に書き換えた品質の段階のテストは成功した。
  - `modelContracts.test.ts`（21件）と `structuralClearance.test.ts`（1件）は失敗した。変更前のコードでも同じ件数が失敗しており、今回の変更とは関係しない。
- BVでライムを開いて確認した。
  - ultra・high・low：Codex GPT-6.1 Sol、Adopted
  - medium：Claude Opus 5.5、Adopted。「Created by」でCodex GPT-6.1 Solに切り替えると旧mediumを表示し、三角形は2,446、「Not adopted; CE uses Claude Opus 5.5」になる。
  - コンソールエラーはなかった。

### 10.2 A3（2026-10-29）

- `ModelVariant` に引数の型を持たせた（`ModelVariant<[profile?]>` など）。市壁の部品は、文化ごとの屋根色を引数で受け取るためである。
  - 一覧と表示に使う `MODEL_VARIANTS` は、生成関数を除いた `ModelVariantInfo` にした。
  - CEは系統ごとの型付きの一覧から `adopt(variants, family, level)` で版を選ぶ。
- 登録した系統

  | 系統 | 版 | CEの採用 |
  |---|---|---|
  | `ship.sloop`・`ship.caravel`・`ship.barge` | Codex（`default`） | 版が1つなので自動 |
  | `ship.galleon` | Codex（`default`）、Opus（`default`＝high、`low`） | Codex（採用表に記録） |
  | `town-wall.town-curtain-wall`・`town-mural-tower`・`town-gate` | Codex、Grok（BVの習作。両脇に城壁の一部が付く） | Codex（採用表に記録） |
  | `town-wall-part.wall`・`bare`・`tower`・`gate` | Codex（CEが城壁の周回に並べる部品）。`basedOn` はCodexの習作 | 版が1つなので自動 |
  | `temple.basilica` | Opus（`high`・`low`） | 版が1つなので自動 |

- ガレオン船と市壁の採用は、今のCEの状態をそのまま記録したものである（新しい判断ではない）。
  - CEは、船の大きさを `hull-topsides` という名前のメッシュで測る。Opusのガレオン船にはこの名前のメッシュがないので、採用を切り替えるにはOpus版側の対応が要る。
  - CEが使う市壁の部品はCodexの習作から切り出したものである。Grokには対応する部品がないので、Grokの習作はBV専用である。
- CEの船（`shipMeshes.ts`）、市壁（`townWallMeshes.ts`）、バシリカ神殿（`specialBuildingMeshes.ts`）は採用表を通して作るようにした。
  - 生成済みモデルのキャッシュのキー（`cacheKey`）を版idにした。メッシュの名前（`id`）は変えていない。
- BVでは、ガレオン船・市壁・バシリカ神殿の詳細欄に「CE adoption」を出すようにした。
  - BVの「Basilica temple」でCodexを選ぶと出るのは、カタログの粗い外形の記録で、版の一覧には含めていない。そのため「CE adoption」は出ない。
- 確認
  - 型チェックとbiomeのチェックは問題なし。
  - 採用表、船・市壁・特殊建物・樹木の3D、`src/buildings/ships`・`fortifications`・`landscape`、BVのテストを実行した（23ファイル100件、すべて成功）。
  - BVでの表示は次のとおりで、コンソールエラーはなかった。
    - ガレオン船：Codex「Adopted」、Opus「Not adopted; CE uses Codex GPT-6.1 Sol」
    - 市壁・門：Codex「Adopted」、Grok「Not adopted」
    - バシリカ神殿：Opus「Adopted」
- 次の作業
  1. A4の残り：CEに「3Dモデルの作者」の一覧を追加する。
  2. 残りの系統（家屋・城・中世の各モデル・設置物）を、CEが使っているものから版の一覧に移す。

### 10.3 A4：CEの「3Dモデルの作者」（2026-10-29）

- CEの右下（「Sunlight」の上）に「3Dモデルの作者」の折りたたみ欄を追加した。
  - 開いている間だけ1秒ごとに更新し、3D表示に描かれている版を作者ごとに一覧にする。
  - 3D表示が閉じているとき、BVのモデルが1つも描かれていないときは、それぞれ案内文を出す。
- 描かれている版は、3Dのオブジェクトに付けた印から集める。
  - 印は `userData.modelVariants` に置く（`markVariant`）。
  - `sceneVariants` が、表示中のオブジェクトだけを集める。描画数0のインスタンスメッシュは数えない。
  - 印を付ける場所
    - `BvDefinition.variant` を持つ部品：`createBvInstances` が付ける（バシリカ神殿）
    - 市壁：使った部品ごとにグループへ付ける
    - 船：置いた種類ごとに付ける
    - 森の詳細樹木：品質の段階ごとのメッシュに付ける
    - 公園・墓地の樹木：付ける
  - 採用表を毎回引き直すのではなく描画の結果から集めるので、カメラによって品質の段階が変わる樹木も、いま描かれている段階だけが出る。
- `mountCity3d` に `getModelVariants()` を追加した。3D表示が閉じているときは `null` を返す。
- 文言は日英の2言語に追加した（`modelAuthorsPanel`・`modelAuthorsEmpty`・`modelAuthorsNone`）。
- 確認
  - 型チェックとbiomeのチェックは問題なし。
  - `adoption.test.ts`（印の集計のテストを追加、3件）、`src/i18n`、`src/city3d`、CEの関連テスト、BVのテストを実行した。
    - `waterGeometry.test.ts` と `obernHouseModels.test.ts` の2件が失敗した。変更前のコードでも同じ2件が失敗する。
  - CE（headless Chromium、Metal）で、港・神殿ありの新しい都市を生成し、3D表示を開いて確認した。
    - Claude Opus 5.5：temple.basilica · high
    - Codex GPT-6.1 Sol：town-wall-part.gate／tower／wall、tree.garden-parkland · ultra、tree.sacred-yew · ultra
    - コンソールエラーはなかった。
- 次の作業：残りの系統（家屋・城・中世の各モデル・設置物）を、CEが使っているものから順に版の一覧に移す。移した系統は、この一覧にも自動で出る。

### 10.4 A3の残り：CEが描くBVモデルの全系統（2026-10-29）

CEの3D表示がBVのモデルを作るすべての箇所を、版の一覧と採用表を通すようにした。どの系統も版は1つなので、採用は自動で決まる。CEの見た目は変わらない。

| 一覧（ファイル） | 系統 | 段階 | CEの使用箇所 |
|---|---|---|---|
| `MEDIEVAL_VARIANTS`（`medieval/medievalVariants.ts`） | `medieval.<モデルid>`：CEが使う21のタスクファイル（住居・鍛冶場・燃料置場・教会・穀倉・倉庫・家畜市場・墓標・皮なめし・公設穀倉・織物会館・ギルド会館・石置場・石灰窯・漂白場・港のクレーン・絞首台・ガラス工房・印刷所・楽器工房・砂置場）の全モデル | `default` | 施設・クレーン・礼拝堂・公園と墓地 |
| `REGIONAL/EARTHEN/POLYGON_HOUSE_VARIANTS`（`houses/houseVariants.ts`） | `house.regional`（Opus）、`house.earthen`・`house.polygon`（Codex） | `high`・`low`。引数は区画ごとの仕様 | 地域住宅 |
| `OBJECT_VARIANTS`（`siteVariants.ts`） | `object.<id>`：手で置く設置物（攻城兵器・乗り物・風車・水車・大砲・井戸・水場） | `default` | 設置物、施設の風車 |
| `WELL_VARIANTS` | `well.medieval`、`well.publicBasin`・`spring`・`washhouse` | `default` | 井戸、城塞の水場、公園の水盤 |
| `YARD_VARIANTS` | `yard.lumber`、`siege.early-field-cannon` | `default` | 施設 |
| `CONTAINER_VARIANTS` | `container.<種類>-<状態>` | `default` | 港の樽・木箱 |
| `CEMETERY_VARIANTS` | `cemetery.<種類>`（21種） | `default` | 墓地 |
| `FRIARY_VARIANTS` | `monastery.friary`（`basedOn` はライムのultra） | `default`。引数は修道院の配置 | 托鉢修道院 |
| `GARRISON/LODGING/RAVELIN_VARIANTS` | `facility.garrison`・`facility.courtyard-lodging`・`facility.citadel-ravelin` | `high`・`low`。引数は保存された寸法 | 城塞の建物、宿、ラヴリン |
| `BRIDGE_VARIANTS` | `bridge.modular` | `high`・`low`。引数は橋ごとの仕様 | 橋 |

- 作者
  - 定義に作者があるものはそれを使った。
  - 墓地の構造物、托鉢修道院、城塞の建物・宿・ラヴリン、橋は作者が書かれていないので、§9-3に従い `Codex GPT-6.1 Sol` とした。
  - 設置物の一覧（`PLACEABLE_OBJECTS`）には、各モデルの作者を必須の項目として加えた。
- CE側の共通の部品（`adoption.ts`）
  - `adoptedDefinition`：採用された版から、生成済みモデルのキャッシュに渡す定義（`BvDefinition`）を作る。引数・段階・キャッシュのキーを指定でき、`createGeometry` も引き継ぐ。版idを付けるので、「3Dモデルの作者」欄にも出る。
  - `medievalDefinition`：中世のモデルをこの定義に包む。メッシュの名前は今までどおりモデルのidを使い、同じモデルには同じ定義を返す。
  - 定義を作らない箇所（修道院・橋・公園と墓地の一括描画）は、`adopt` で版を選び、`markVariant` で印を付ける。
- 対象外としたもの
  - Krak des Chevaliers などのカタログの粗い外形（`catalogueMassing`・`fortressMassing`）。BVのモデルではなく寸法の記録から作る外形のため。
  - 墓地の平石（ledger）。CEがその場で作る板で、BVのモデルではないため。
- 確認
  - 型チェックとbiomeのチェックは問題なし。版idの一意性と採用表の解決のテストは成功した（全系統が対象）。
  - `src/city3d`・`src/buildings`・BV・`src/i18n`（737件）を実行した。失敗24件は、すべて変更前のコードでも失敗するもの。
    - `modelContracts` 21件、`structuralClearance` 1件、`waterGeometry` 1件、`obernHouseModels` 1件
  - `src/city-editor/renderers`（282件）を実行した。失敗した `buildingAppearance.test.ts` の1件は、変更前のコードでも失敗する。
  - CE（headless Chromium、Metal）で、港・神殿ありの新しい都市を開いて3D表示を確認した。「3Dモデルの作者」欄には次の版が出た。コンソールエラーはなかった。
    - Claude Opus 5.5：バシリカ神殿
    - Codex GPT-6.1 Sol（17）：橋、墓地の構造物3種、中世モデル4種、風車2種、市壁の部品3種、樹木2種、井戸・水盤
    - 地域住宅は出なかった。この都市の3Dでは、住宅を詳細モデルで描いていなかったためである。
- 今後：BVに新しい版を追加したら、その系統の一覧に登録する。同じ段階に2つ目の版を登録すると、採用表に書くまでテストが失敗するので、採用の判断が漏れない。

### 10.5 ライムのOpus版high・軽量版と「版の種類（edition）」（2026-10-29）

- 同じ作者が同じ段階に複数の版を作れるように、`ModelVariant` に `edition` を加えた。
  - 版idは `…#作者~edition` になる（例：`tree.garden-parkland@high#claude-opus-5.5~light`）。
  - `edition` のない版が、その作者の標準版になる。
- ライム（Small-leaved lime）のhighに、2つの版を追加した。

  | 版 | 内容 | 三角形 |
  |---|---|---|
  | Codex high（既存、CE採用） | Codexの枝構造、ultraの葉を5枚に1枚へ間引いて拡大 | 21,626 |
  | Opus high（standard） | Opus独自の枝構造（中心の主幹から伸びる16本の主枝と小枝。葉は外側と内側の2層の卵形の殻に付く）。外向きのハート形の葉（1枚6三角形）、日向と日陰の葉色、樹冠全体の形に沿った法線 | 21,754 |
  | Opus high（light） | Opus highと同じ枝。葉の房（スプレー）ごとに楕円体1つを当てはめる（Opus mediumがCodex highに施したのと同じ処理）。細い枝は省く | 2,494 |

  - 実装は `src/buildings/landscape/smallLeavedLimeOpus.ts`。
  - 葉の配置は房ごとの乱数列から作るので、standardとlightで房の位置と大きさが一致する。
- CEの採用表では、highを明示的にCodex版とした。採用表に書かないと、版が3つになったhighの採用が決まらないためで、CEの見た目は変わらない。
- BVの表示
  - Qualityで「High」を選び、「Created by」を Claude Opus 5.5 にすると、「Edition」（Standard／Light）の選択欄が出る。
  - 詳細欄の「Edition」「CE adoption」「Based on」で、どの版を表示しているかが分かる。
  - 複雑さの比較表の列は `low`、`medium · Codex`、`medium`、`high`、`high · Claude`、`high · Claude light`、`ultra`。
- 見た目（CEと同じ光源で、90 px／240 px、および260本の林で比較）
  - Opus highは、ライムらしい丸い卵形の樹冠になり、陰影も柔らかい。
  - 一方で、Codex highより葉の密度が低く、樹冠の下の方が透けて見え、林で並べると樹冠がやや小さく見える。
  - lightは、Opus mediumと同じ見た目の系統で、三角形はOpus mediumの1,888よりやや多い。
- 確認
  - 型チェックとbiomeのチェックは問題なし。
  - 樹木・採用表・BV・森と公園の3Dのテストは、62件すべて成功した。
  - BVで、Codex high → Opus high（Standard） → Opus high（Light）の順に切り替えられることを確認した。コンソールエラーはなかった。
