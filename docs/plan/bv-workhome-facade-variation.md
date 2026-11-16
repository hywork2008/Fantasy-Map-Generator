# BV Workhome の外観のバリエーション

作成: 2026-11-14
状態: 設計のみ。未実装。

## 1. 目的と範囲

BV の Medieval 50 · Workhome Shells と Medieval 51 · Trade Workhomes を CE に並べると、次の 2 つが起きる。

- 業種が違うのに、外観が同じ大きな建物が並ぶ。
- 扉が開いたままで、そこから違う内部が見える。

これが、街並みで一番目立つ違和感になっている（[1113.md](../temp/day-by-day/1113.md) 18行目、2026-11-13 にユーザーが指摘）。

本書では、Workhome を次の 2 つに分ける。

- **外装**: 通りから見える外殻。ほかの住宅と同じ町の外観の設定から作る。
- **業種の設備**: 内部。今の Workhome の床・階段・作業場の取り決めをそのまま守る。

これで、同じ業種の施設どうしも、違う業種の施設どうしも、見た目が変わるようにする。

### 1.1 範囲に入れる

- BV: Workhome の外装を、パラメータを受け取って作る形にする。次のものを加える。
  - 閉じた扉
  - 店の開口と、跳ね上げ式の雨戸
  - 業種ごとの吊り看板
  - 間口の窓の数
  - 妻入り・平入り
  - 張り出し（ジェッティ）
  - 階数
  - 町の外観の色
- CE: 施設 1 つごとに外装のパラメータを決める。業種ごとに 1 つの資産を共有するのをやめる。3D の試作品キャッシュに入る数を計測する。

### 1.2 範囲に入れない

- 業種の設備（作業台・在庫）の作り直し。ただし外から見える部分だけは、§4.4 の扱いに従う。
- 街区・区画の作り方（[ce-meshless-frontage-first-blocks.md](ce-meshless-frontage-first-blocks.md) の FF の作業）。
- Medieval 52〜58 の専用作業場（パン焼き・鍛冶・樽・なめし・縄・肉・町の職人）。どれも業種ごとの外形をすでに持っている。
- CG。

## 2. 前提と順序

2026-11-13 のユーザーとの合意で、次の前提がある。

1. **先に BV の大掃除をする**: カテゴリ・地域・文化・年代を整理する。ギルドホール（27 Cloth Halls、28 Craft Guild Halls、48 Trade Guild Halls、49 Market Guild Halls）は、史料から調べ直すかもしれない。
2. 当初は、提案 1（建物を先に並べる FF）が終わってから、本書の部品がどこまで要るかを見定める予定だった。FF1 は 2026-11-13 に一度スタッシュに退避され、廃止を前提に扱われている。このため本書の段階は、**FF の結果に依存しない部分（V0〜V3）**と、**区画の幅に依存する部分（V4）**に分けた。

V0〜V3 は大掃除と並行できる。BV の中で 50/51 の位置と名前は変えない前提にする。大掃除で番号や分類が変わったら、本書の表記を追従させる。V5（ギルドホールを混ぜる）は、大掃除が終わってから進める。

## 3. 今の実装の調査

### 3.1 外観が同じになる経路

| 箇所 | 今の処理 | 影響 |
| --- | --- | --- |
| [workhomeFormProfiles.ts:136](../../src/buildings/medieval/workhomeFormProfiles.ts#L136) | 外形は `standard` 6×10 m・2階、`narrow` 4.8×8.4 m・3階、`wide` 7.2×10 m・2階の 3 種類だけ | 外殻は全部で 3 種類しかない |
| [workhomeTradeProfiles.ts](../../src/buildings/medieval/workhomeTradeProfiles.ts) | 業種ごとに既定の外形が 1 つ決まっている。`optional`（narrow）もある | CE は既定の外形しか使わない |
| [populationFacilityRequests.ts](../../src/city-editor/generators/populationFacilityRequests.ts) | `cached(\`workshop:${pool}\`)` で、業種 1 つに資産 1 つ | 同じ業種の施設は、町の中で全部同じモデルになる |
| [workhomeShell.ts:94-121](../../src/buildings/medieval/workhomeShell.ts#L94-L121) | 正面と背面に、窓 2 つと扉の開口 1 つを置く。窓の位置は幅の ±31%。側面にも窓 2 つ | 業種が変わっても、窓と扉の並びは同じ |
| [workhomeShell.ts:61-84](../../src/buildings/medieval/workhomeShell.ts#L61-L84) | `door: true` の開口は枠だけで、扉板がない。窓のガラスは `water` 面 | 扉が開いたままに見え、内部の設備が通りから見える |
| [workhomeShell.ts:148-199](../../src/buildings/medieval/workhomeShell.ts#L148-L199) | 屋根は平入りの切妻で固定。色は ModelKit の既定（石の腰壁・漆喰・瓦） | 町の外観の設定（壁・屋根・木部の色、張り出し、妻入り）を受け取らない |

### 3.2 隣の住宅との差

同じ通りの住宅は [regionalHouseMeshes.ts](../../src/city3d/three/regionalHouseMeshes.ts) の `regionalHouseSite` で作られ、次のものを区画ごとに変えている。

- 区画の `massing`（幅・奥行き・各階の高さ・張り出し・屋根勾配・棟の向き）
- 区画の `appearance`（地域の型・壁・屋根・木部の色・仕上げ・明暗の段階）
- `variant`（扉の側・煙突の位置）。施設の id から `growthRandom` で決める

試作品は `regionalHouseSpecKey` で共有し、キャッシュの上限は 512 である。`groundUse: "craft" | "retail"` の住宅には、1 階の開口と金物がすでにある（[regionalHouses.ts:778](../../src/buildings/houses/regionalHouses.ts#L778)）。

このため、Workhome だけが町の外観に合わない「よその建物」になり、同じ形のまま繰り返されている。

### 3.3 使える部品

- [opusTradeKit.ts](../../src/buildings/medieval/opusTradeKit.ts)（BV 57/58 の Opus 版、CE が採用している）に、必要な部品がある。
  - `doorLeaf`: 角度を指定できる扉板
  - `shopFront`: 下の板を台にし、上の雨戸を突き上げる店の開口
  - `signBracket`: 張り出しの下に吊る看板の腕木
  - `windowOn`
  - `townHouse`: 張り出しのある 2 階建ての町家。妻入り・平入りを選べる
- CE の 3D には、試作品の左右反転（`BvDefinition.mirrorX`）と、内容に応じた共有（`cacheKey`）がすでにある（[bvInstances.ts](../../src/city3d/three/bvInstances.ts)）。

## 4. 方式

### 4.1 外装と設備を分ける

Workhome を次の 3 つの部品で組み立てる。

```ts
assembleWorkhome(spec: WorkhomeExteriorSpec, role, quality)
  = workhomeExterior(spec, quality)    // new, built on TradeKit
  + workhomeInterior(form, quality)    // existing floors + internal stair
  + tradeEquipment(role, form, quality) + tradeStock(role, form, quality)   // existing
```

- 床・階段・作業場・倉庫の配置（`WorkhomeProfile` の `floors`、`stair`、`workZoneXZ`、`spine`）は変えない。
- 外装の扉の位置は、`spine.centerX` の通路の正面に置く。
- 外装の仕様は、BV・CE の両方から Three.js なしで読める、プロファイルだけのファイル（`workhomeExteriorProfiles.ts`）に置く。`workhomeFormProfiles.ts` と同じ扱いにする。

### 4.2 `WorkhomeExteriorSpec`

```ts
interface WorkhomeExteriorSpec {
  form: WorkhomeForm;            // standard | narrow | wide (V0–V3); continuous width only in V4
  storeys: 2 | 3;                // the form's default, or one more where the form allows it
  entranceFace: "gable" | "eave";
  jetty: number;                 // 0 | 0.3 | 0.5 m, first upper storey only
  bays: 2 | 3 | 4;               // window bays across the street front of each upper storey
  shop: "open" | "closed" | "none";  // the ground-storey shop opening and its shutters
  door: "closed" | "ajar";
  sign: WorkhomeRole | null;     // emblem on a bracket under the jetty
  wall: BuildingPaletteId; roof: BuildingPaletteId; frame?: BuildingPaletteId;
  finish: "frame" | "boarding" | "stone" | "masonry";
  shade: 0 | 1 | 2;
  mirror: boolean;               // door and stair side, baked through BvDefinition.mirrorX
}
```

`workhomeExteriorSpecKey(spec)` で試作品を共有する。数値は 0.1 m 単位にそろえてキーにする。

### 4.3 見た目を変える要素（効果の大きい順）

| # | 要素 | 決め方 | 根拠・理由 |
| --- | --- | --- | --- |
| 1 | 町の外観の色と仕上げ | 区画の `appearance` を、隣の住宅と同じ規則で使う | 「よその建物」に見えるのを止める。差が一番大きい |
| 2 | 扉を閉じる、店の開口 | 扉は既定で閉じ、2 割を半開きにする。1 階の正面には、業種の店の開口と雨戸を付ける | 内部が見える違和感を直接なくす。中世の店は、1 階の正面に雨戸付きの開口を持ち、下の雨戸を売り台にしていた（§5） |
| 3 | 吊り看板 | 業種ごとの紋（はさみ・靴・鞍・弓など）を腕木に吊る | 外から業種が分かる。中身の違いを、開いた扉ではなく看板で見せる |
| 4 | 妻入り・平入り、張り出し | 区画の `massing` から取る。ない時は `growthRandom(id)` | 隣の住宅と同じ分布にそろう |
| 5 | 窓の数 2〜4、反転 | `growthRandom(id)`。隣の施設と同じ組み合わせを避ける（§4.5） | 同じ通りで同じ正面が続かないようにする |
| 6 | 階数 | [ce-building-height-variation.md](ce-building-height-variation.md) の階数の分布から取る | 階数と人口の容量の扱いは、その設計書に一本化する |

業種の外形（standard／narrow／wide）は、`optional` の外形も CE で使えるようにする。たとえば仕立屋・靴屋・革細工は、narrow も使えるようにする。

### 4.4 内部の見え方と品質の段階

- 店の雨戸が `closed` の時は、内部の設備が外から見えない。Low の段階では、設備と在庫の部品を描かない選択肢を設ける。描くかどうかは V3 で、三角形の数と描画時間を測ってから決める。
- 品質の段階どうしの取り決め（Opus 版と同じ）: Low と High で、外形・開口・扉・看板の位置は同じにする。High では木組み・瓦の段・看板の鎖・雨戸の金物を足す。
- 店の開口から見える、売り台の上の品物（布・靴・袋など）は、業種の在庫の部品から既存の形を流用する。新しい形は作らない。

### 4.5 並びの規則（CE）

- 外装の仕様は、施設 id の種（`growthRandom(\`workhome-exterior:${id}\`)`）から決まる。同じ保存データなら、何度描いても同じになる。
- 同じ列で接する 2 つの施設が同じ `specKey` になったら、`bays` → `mirror` → `entranceFace` の順に次の候補へずらす。
- 町の中の Workhome の外装の種類は、`min(施設の数, 12)` 以上を目標にする。試作品キャッシュの上限 512 は住宅と共有なので、V3 で数を測る。

### 4.6 CE の資産と保存

- `populationFacilityRequests` の資産は、業種ごとの共有をやめない。外形・扉・接道の口（`entrances`）は外形（form）で決まるので、資産は「業種 × 外形」で共有する。
- 外装の仕様は施設を置いた後に決め、保存データの施設の配置に `exterior`（`WorkhomeExteriorSpec`）として持たせる。書いていない古い保存データは種から作り直すので、保存形式の版は上げない（V3 で確かめる）。
- `entranceFace: "gable"` で扉の向きが変わる時も、外形の向きと扉の位置は変えない。棟の向きだけを変える（`RegionalHouseSpec.entranceFace` と同じ規則）。CE の配置の取り決めに影響を出さない。

## 5. 史料

参照日: 2026-11-14。次の資料は、店の開口・雨戸・売り台の形を支持する。看板については、中世の通りの看板の数や分布を示す学術的な資料を今回は見つけられなかった。このため、看板の出現率は生成用の仮値として扱う。

| 資料 | 確認できること | 設計への適用と限界 |
| --- | --- | --- |
| D. Clark, "The shop within? An analysis of the architectural evidence for medieval shops", *Architectural History* 43 (2000) ([Cambridge](https://resolve.cambridge.org/core/journals/architectural-history/article/abs/shop-within-an-analysis-of-the-architectural-evidence-for-medieval-shops/870F1729B4647050A0643BFFE4F8C198)) | 中世の店の建築上の証拠を類型にまとめている | 店の開口の型の根拠。英国の事例がほとんどなので、大陸の型はV1で追加調査する |
| [VCH Explore（Victoria County History の教材）](https://ihr-archive.github.io/vch-explore/node/12669.html) | 雨戸は上下に開き、下の雨戸（stall board）を開くと売り台になる | `shop: "open"` の形の根拠 |
| [Historic England: Commerce and Exchange Buildings（指定の手引き）](https://cms.historicengland.org.uk/images-books/publications/dlsg-commerce-exchange-buildings/heag121-commerce-and-exchange-lsg) | 中世の店が元の形のまま残ることはまれで、元の雨戸や売り台が残る例はきわめて少ない | 細部は推定になる。腕木・蝶番の金物は High だけに描く |
| [RCHME Stamford, Plate 139: Shop Fronts](https://www.british-history.ac.uk/rchme/stamford/plate-139) | 歴史上の店の正面の図版 | 比率を確かめる参考。後世の例も含むので、年代を確かめてから使う |
| [English Buildings: Lavenham](https://englishbuildings.blogspot.com/2017/02/lavenham-suffolk.html) | 15 世紀の店は、ガラスのない開口を雨戸で閉じた。ガラスは教会と高位の家に限られた | 1 階の店の開口にはガラスを入れない。今の `water` 面のガラスは、上の階の窓も含めて見直す |
| ドイツ語圏の鉄製の看板（Zunftzeichen）の解説 | 鍛鉄の業種の看板は、ザルツブルク・コルマールなどに多く残る | 残っている例の多くは近世以降。中世には木の板の看板を基本とし、鉄の飾り看板は lateMedieval 以降だけにする（仮） |

大掃除でギルドホールの史料を調べ直す時に、看板と店の開口の地域差（英国・低地地方・ドイツ語圏）も一緒に確かめる。

## 6. 段階

| 段階 | 内容 | 依存 |
| --- | --- | --- |
| V0 | 計測。CE の代表の町で、Workhome の外観の種類の数、同じ外観が接している組の数、試作品の数、三角形の数を今の方式で記録する | なし |
| V1 | BV: `WorkhomeExteriorSpec` と `workhomeExterior`（TradeKit）を作る。扉を閉じる、店の開口、窓の数、反転、色を入れる。BV の Medieval 51 に、外装を切り替える選択肢を出す。内部の取り決めのテスト（[workhomeTrades.test.ts](../../src/buildings/medieval/workhomeTrades.test.ts)）を守る | なし |
| V2 | 業種ごとの看板の紋（10 業種）、妻入り・平入り、張り出し、階数 | V1 |
| V3 | CE: 施設ごとに外装の仕様を決め（§4.5）、`optional` の外形を使い、3D の試作品キャッシュを使う。Low で設備を描かない選択肢を測る。V0 と比べる | V1、V2 |
| V4 | 間口の幅を連続して受け取る外装（4.8〜7.2 m の範囲。内部の取り決めは外形の中に収める） | 区画の作り方の方針（FF の後継）が決まってから |
| V5 | 使われていない Trade／Market Guild Halls を、同じ並びに混ぜる | BV の大掃除の後 |

## 7. 受入の条件

V0 と同じ町で測る。

- 同じ列で接する Workhome の組のうち、外装の `specKey` が同じ組: 0
- 町の中の Workhome の外装の種類: `min(施設の数, 12)` 以上
- 扉が開口だけになっている Workhome: 0（`door: "ajar"` の扉板は、扉があるものとして数える）
- 試作品の数と、3D の初回表示の時間: 今の 1.2 倍以内
- Low の三角形の数: 1 棟あたり今の 1.5 倍以内
- 最後に、BV と CE の 3D で目視して、ユーザーに確かめてもらう

## 8. 未決事項

- 扉を半開きにする割合（仮に 2 割）と、看板の出現率（仮に 7 割）。
- 店の開口を `open` にする割合。季節・時刻の表示の設定と結びつけるか。
- 1 階のガラスを外すときに、上の階の窓も、ガラスから油を塗った布や格子に変えるか。年代で変えるか。
- V4 で幅を連続させた時に、narrow の 3 階の階段の取り決めを、幅の下限でも守れるか。
- Workhome を、隣の住宅の `RegionalHouseSpec` と同じ部品で作るか（外観は確実にそろうが、内部の取り決めとの整合が難しい）。または TradeKit で作るか（本書の案。Opus 版の 57/58 と見た目がそろう）。V1 の初めに、TradeKit の案で 1 業種を試作して決める。

## 9. 次の作業

V0 です。代表の町で、今の Workhome の外観の種類と、同じ外観が接している組の数を記録します。
