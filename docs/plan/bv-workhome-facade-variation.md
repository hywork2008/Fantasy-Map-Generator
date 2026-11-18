# MV Workhome の Opus 版（外観の店舗兼住宅）

作成: 2026-11-14
更新: 2026-11-18（Codex 版の内部構造をやめ、外観だけの Claude Opus 5.5 版を作る計画へ全面的に書き直した）
状態: W0（計測、§3.3）、W1（MV の Opus 版、§10.1）、W2（店の間・品物・階数、§10.2）、W3（CE で Opus 版を採用、§10.3）、W4（短冊形区画の幅に合わせる、§10.4）を済ませた。W5 は史料の調べ直し（§5.6）、計画（§6.1）、W5a（会館の数の規則、§10.5）、W5b（ドイツ語圏の会館を並びの町家に、§10.6）、W5c（イングランド型の町のギルドホールを市場に、§10.7）を済ませた。本書の段階はすべて済んだ。

## 1. 目的と方針

MV の Trade Workhomes（task 51）を CE に並べると、次の問題が起きる。

- 業種が違っても、外観が同じ大きな建物が並ぶ。扉が開いたままで、通りから内部が見える。
- 幅が 4.8〜7.2 m の 3 種類しかない。短冊形区画（[ce-burgage-plot-fabric.md](ce-burgage-plot-fabric.md)）の間口に入らず、施設 1 つが区画を 2 つ以上使う。
- 三角形が住宅の 4〜5 倍ある（§3.3）。

原因は、Codex 版が内部構造を先に設計したことにある。内部は通りから見えないのに、外形の下限を決め、ポリゴンも使っている。床・階段・作業場の台帳（`WorkhomeProfile`）で、間口の方向に階段 2.2 m と通路 1 m を取るため、4.8 m より狭い Workhome は作れない。

本書の方針（2026-11-18 のユーザーの指示）:

- **既存の Workhome（Codex 版）は CE で使わない。** Claude Opus 5.5 版を新しく作る。
- **内部構造は作らない。** 床・階段・作業場の台帳は Opus 版に持ち込まない。
- **作るのは通りから見えるものだけ。** 外観は史料に沿わせ、隣の住宅と同じ町の外観にそろえる。
- **例外は店の部分。** 雨戸を開けた店は中が見えるべきなので、浅い店の間（奥行き 2.5〜3.5 m）だけを作る（§4.4）。扉の奥は作らない。
- **大きさは区画が決める。** 幅は区画の間口から、奥行きは表の家と同じ規則から取る。Workhome は原則として区画 1 筆に建つ。

### 1.1 範囲に入れる

- MV: Opus 版の Workhome を作る。幅・奥行き・階数・文化を受け取る組み立て関数 `createOpusWorkhome(spec, quality)` を用意し、10 業種で使う。task 51 の既存のモデル ID に Opus の版として加える。
- CE: Opus 版を採用する（`CE_ADOPTION`）。施設ごとに外観の仕様を決める。`burgage`／`burgage-dense` では、区画の間口から幅を決める。

### 1.2 範囲に入れない

- Codex 版の削除。MV では選べるまま残す。保存データにモデル ID があるため（AGENTS.md）。
- task 50 Workhome Shells。業種のない外殻なので、CE は使っていない。
- task 52〜58 の専用作業場（パン焼き・鍛冶・樽・なめし・縄・肉・町の職人）の大きさの見直し。§8 の未決事項に記す。
- 住宅の階数の規則。§8 に記す。
- CG。

## 2. 前提

- MV の一覧の再編は済んでいる（[model-viewer-rename-and-catalogue-facets.md](model-viewer-rename-and-catalogue-facets.md)）。task 51 の属性は [catalogueFacets.ts](../../src/buildings/catalogueFacets.ts) で引く（`kind: "structure"`、highMedieval 以降、`european`、用途 `dwelling` と `crafts`、業種のタグ）。Opus 版も同じ属性を持つ。
- 区画の作り方は決まった。CE の meshless には `compact`／`burgage`／`burgage-dense` の 3 つがある（[ce-burgage-plot-fabric.md](ce-burgage-plot-fabric.md) §8.7）。旧版の「FF の後継が決まってから」という保留は解消した。
- 作者ごとの版の切り替えは、task 57/58 の Opus 版と同じ仕組みを使う。同じモデル ID の `variants` に作者 `Claude Opus 5.5` の版を足し、CE は [adoption.ts](../../src/city3d/adoption.ts) の `CE_ADOPTION` で採用する版を決める。

## 3. 今の実装の調査

### 3.1 CE が Workhome を置く経路

| 箇所 | 今の処理 | 問題 |
| --- | --- | --- |
| [workhomeFormProfiles.ts](../../src/buildings/medieval/workhomeFormProfiles.ts) | 外形は `standard` 6×10 m・2 階、`narrow` 4.8×8.4 m・3 階、`wide` 7.2×10 m・2 階の 3 種類。階段の穴 2.2 m と通路 1 m を間口の方向に取る | 内部の台帳が外形の下限を決める。narrow の作業場の幅は 1.2 m しか残らない |
| [workhomeTradeProfiles.ts](../../src/buildings/medieval/workhomeTradeProfiles.ts) | 業種ごとに既定の外形が 1 つ。`optional` の narrow もある | CE は既定の外形しか使わない |
| [populationFacilityRequests.ts](../../src/city-editor/generators/populationFacilityRequests.ts) | `cached(\`workshop:${pool}\`)` で、業種 1 つに資産 1 つ | 同じ業種は町じゅう同じモデル・同じ大きさになる |
| [bvFacilityAsset.ts](../../src/city-editor/generators/bvFacilityAsset.ts) | モデルを測った外接矩形を、そのまま敷地（`footprint`・`minimumSite`）にする | 区画の幅を受け取る口がない |
| [workhomeShell.ts](../../src/buildings/medieval/workhomeShell.ts) | 扉の開口は枠だけで扉板がない。窓 2 つと扉 1 つの並びは業種によらない。色は ModelKit の既定 | 扉の奥が見える。町の外観の設定を受け取らない |

### 3.2 隣の住宅

CE の住宅は [regionalHouses.ts](../../src/buildings/houses/regionalHouses.ts) の地域の型（`mediterranean`・`atlantic`・`northern-wooded`・`northern-urban`・`stone-upland`）で描く。

- 区画ごとの `massing`（幅・奥行き・階高・張り出し・屋根）と `appearance`（壁・屋根・木部の色、仕上げ、明暗）を受け取る。
- 試作品は `regionalHouseSpecKey` で共有する。キャッシュの上限は 512。
- `groundUse: "craft" | "retail"` の住宅には、1 階の開口と台がすでにある（[regionalHouses.ts:741](../../src/buildings/houses/regionalHouses.ts#L741)）。ただし開口の幅は 1.6 m までで、店の間はない。

Opus 版の Workhome は、地域の型の色・屋根材・仕上げ（`STYLES`）を共有する。これで「よその建物」に見えなくなる。

### 3.3 計測（W0、2026-11-18）

人口 5,000 人・highMedieval・港なしで `buildPopulationFacilityRequests` を実行した。

| 施設 | 外接矩形（間口×奥行き） | 件数 |
| --- | --- | --- |
| Workhome standard（仕立・靴・毛皮・革細工・金細工・書籍） | 6.44 × 10.53 m | 121 |
| Workhome wide（織物・馬具・指物・弓矢） | 7.64 × 10.53 m | 34 |
| ほかの施設 | — | 95 |
| 計 | | 250 |

施設の 62%（155/250）が Workhome である。

三角形の数（MV の CE 採用版、1 棟あたり）:

| モデル | Low | High |
| --- | --- | --- |
| Workhome standard（仕立） | 4,428 | 12,984 |
| Workhome wide（指物） | 4,468 | 14,200 |
| Workhome narrow（仕立） | 6,444 | 14,088 |
| 地域の型の住宅 `craft`（atlantic／northern-urban／mediterranean） | 1,136／1,180／596 | 5,828／5,044／6,240 |

Workhome の Low は住宅の約 4 倍ある。5,000 人の町では Workhome だけで Low 約 69 万三角形になる。

## 4. 方式

### 4.1 組み立て

```ts
createOpusWorkhome(spec: OpusWorkhomeSpec, quality: "low" | "high")
  = shell(spec)         // walls, jetty, roof, chimney, upper windows: what the street sees
  + groundFront(spec)   // shop opening by culture, door leaf, stall board, shutters
  + shopBay(spec)       // only when the shop is open: a shallow room behind the opening
  + streetSigns(spec)   // signboard, goods hung under the pentice
```

- 部品は [opusTradeKit.ts](../../src/buildings/medieval/opusTradeKit.ts) の `TradeKit` を使う（`wall`・`framing`・`windowOn`・`doorLeaf`・`shopFront`・`signBracket`・`pitchedRoof`・`chimneyStack`）。足りないものは TradeKit に加える。
- 色・屋根材・仕上げ・張り出しは、地域の型の `STYLES` から取る。そのために `STYLES` を Three.js なしのファイルに出して共有する。
- 床・階段・作業場は作らない。上の階は、壁と窓だけの箱にする。
- Low と High で、外形・開口・扉・看板の位置は同じにする（Opus 版の取り決め）。High では木組み・瓦の段・金物・品物を足す。

### 4.2 `OpusWorkhomeSpec`

```ts
interface OpusWorkhomeSpec {
  role: WorkhomeRole;               // trade: goods on the stall board and in the shop bay
  culture: RegionalHouseProfile;    // ground-floor type, colours, cover, finish (§4.3)
  widthMeters: number;              // street frontage, 3.0–7.7, on a 0.01 m grid
  depthMeters: number;              // 8–12, on a 0.01 m grid
  storeys: 2 | 3;                   // ground + upper storeys; a garret under the roof is not counted
  entranceFace: "gable" | "eave";   // never turns the footprint; only the ridge (as RegionalHouseSpec)
  fronts: 1 | 2;                    // single-fronted, or door between two shop windows (width >= 6)
  shop: "open" | "closed";
  door: "closed" | "ajar";
  sign: "board" | "none";
  // wall, roof and frame colours come from the culture's house style (W3 may take the plot's appearance instead)
  shade: 0 | 1 | 2;
  mirror: boolean;                  // door on the right; laid out, not baked through mirrorX, so the entrance stays exact
}
```

`opusWorkhomeSpecKey(spec)` で試作品を共有する。モデルは 0.01 m 刻みで作る（Codex の外接矩形 6.44 m などを保つため）。CE で試作品の種類を抑えるため、W4 では区画の幅を 0.25 m 刻みに丸めて渡す。

### 4.3 文化ごとの 1 階の形

1 階の店の形は、地域によって違う（§5 の Garrigou Grandchamp 2002）。地域の型と次のように対応させる。

| 地域の型 | 1 階の正面 | 上の階 | 根拠 |
| --- | --- | --- | --- |
| `atlantic` | 木枠の店の窓（縦桟で 2〜3 区画）。下の雨戸を倒して売り台にし、上の雨戸を突き上げて庇にする。扉は窓の横 | 張り出し 1 段 | Bennell pp.193, 198–199、VCH Explore |
| `northern-urban` | 妻入り。店の窓は 2 枚の跳ね上げ・跳ね下げの雨戸（上は庇、下は売り台）。アーケードは作らない | 張り出し。屋根裏の荷揚げ戸と滑車の梁 | Garrigou Grandchamp p.94（ドイツ語圏にアーケードはほとんどなく、ハンザの町では屋根裏が倉庫）、Reinle（§5.4） |
| `mediterranean` | 石造。アーチの店口（下に石の売り台）と、上の階へ上がる別の扉 | 張り出しなし。対の窓 | Garrigou Grandchamp p.92 図 15・p.94 |
| `stone-upland` | 石積みの 1 階。アーチの店口 1 つと扉 | 木組みの上階 | 同上（仮。山地の事例は未確認） |
| `northern-wooded` | 板張り。雨戸付きの開口 1 つと扉 | 張り出しなし | 仮。事例は未確認 |

- 店の開口にはガラスを入れない。上の階の窓も、透ける面ではなく暗い面にする（Bennell p.198、Lavenham）。
- 間口が 6 m 以上ある時は、扉の両側に店の窓を置く型（`fronts: 2`）も選べる。Treswell が 1585 年に描いた Cheapside の店は、ほとんどがこの型で、間口は 6.1〜7.3 m だった（Bennell p.194）。
- 狭い間口では、店の窓 1 つと扉 1 つを並べる。Treswell が描いた小さな店は幅約 3.35 m で、扉の両側に窓があった（Bennell p.193）。下限は 3.0 m にする。

### 4.4 店の間（雨戸を開けた時だけ）

- 奥行き 2.5〜3.5 m・天井高 2.7〜3.2 m の箱を、店の開口の奥に置く。奥の仕切り、床、棚 1〜2 段、業種の品物 3〜6 個を入れる。
  - 史料では、店は奥行き約 3 m の 1 部屋が普通だった（Schofield 1987、Bennell p.194 の引用で 2.44×3.04 m）。記録にある店の奥行きは 3.66〜7.62 m、高さは 2.74 m と 3.2 m（Bennell p.194）。
- 品物は売り台の上と庇の下にも並べる。業種は看板ではなく品物で見せる（§4.5）。品物は、TradeKit の小物（`hookRail` など）と既存の在庫の形から、業種ごとに 2〜3 種類を選ぶ。新しい形は最小限にする。
- 雨戸が `closed` の時は、店の間を作らない。扉が `ajar` の時は、扉の奥を暗い面 1 枚にする。

### 4.5 看板

- 吊り看板は、業種の紋ではなく、絵の板にする（動物・星・冠などの屋号）。中世から近世のロンドンの看板は、業種と関係のない屋号がほとんどだった（Bennell pp.201–202）。
- 業種を示すのは、売り台と庇の下の品物（§4.4）。
- ドイツ語圏の鍛鉄の業種看板（Zunftzeichen）は、残っている例の多くが近世以降である。本書では使わない。

### 4.6 階数と大きさ

- 幅は区画の間口から、奥行きは表の家と同じ 8〜12 m（[perimeterCell.ts](../../src/city-editor/generators/burgage/perimeterCell.ts) の `HOUSE_DEPTH`）から取る。
- 階数は 1 階と上の階 1 つ（`storeys: 2`）を基本とし、屋根裏を足す。
  - 1300 年のロンドンには、2 階建て、または 2 階に屋根裏を足した店の建物が多かった。初期の店は上の階が 1 つだけだった（Bennell pp.193–194、Schofield 1984 の引用）。
- `storeys: 3` は lateMedieval 以降で、間口 5 m 以上の時だけにする（仮）。
  - 1547 年の Cheapside の金細工師の店は、3 階建てに屋根裏があった（Bennell p.194）。
  - 間口が狭いほど背を低くするのは、ゲーム上の規則である。細い塔のような建物を出さないため。
- 階数の分布は [ce-building-height-variation.md](ce-building-height-variation.md) から取り、上の上限で切る。

### 4.7 CE の資産と配置

#### `compact`

- 業種×外形ごとの資産と外接矩形（6.44／7.64 × 10.53 m）を変えない。Opus 版の既定の 3 つの外形は、この外接矩形に収める。task 58 の Opus 版が、旧版の CE の外形を保ったのと同じ扱いにする。
- 置き方が変わらないので、`compact` の出力（v18）は変わらない。描くモデルだけが Opus 版になる。

#### `burgage`／`burgage-dense`

- Workhome の資産は、区画を選んだ後に、区画の幅に合わせて作る。
  - 資産の ID には幅を付ける（例: `bv-facility:trade-workhome.workhome-standard.tailoring:low:w4.25`）。モデル ID は変えない。幅と奥行きは資産（`bvModel`）に持たせる。
- `placeFacilitiesOnPlots` では、Workhome は区画 1 筆に置く。合わせる区画の数の上限（§8.7 の 3／4、`dense` で 2 倍）は、Workhome 以外の施設にだけ使う。
- 保存データの記録が変わるので、版を上げる（v19→v21、v20→v22、または burgage の版の付け直し）。古い保存データは、今の版の記録のまま読む。

#### 外観の仕様

- 施設を置いた後、`growthRandom(\`workhome-exterior:${id}\`)` と区画の `appearance` から決める。施設の配置の `appearance` に持たせる。
- 同じ列で接する 2 つが同じ `specKey` になった時は、`mirror` → `entranceFace` → `shade` の順に次の候補へずらす。
- 扉の半開きは 2 割（仮）。店を開ける割合は、§8 の未決事項。

## 5. 史料

参照日: 2026-11-18（§5.1〜§5.4）、2026-11-14（§5.5）。

### 5.1 J. Bennell, "Shop and Office in Medieval and Tudor London", *Trans. London and Middlesex Archaeological Society* 40, pp.189–206（[ADS](https://archaeologydataservice.ac.uk/catalogue/adsdata/arch-4072-1/dissemination/pdf/LAMAS_Vol40_189-206_ShopAndOfficeInMedievalAndTudorLondon.pdf)）

- p.193: Treswell（1585）が描いた小さな店は幅約 3.35 m で、扉の両側に売り台付きの窓がある。初期の店は上の階が 1 つだった（Schofield 1984 の引用）。
- p.194:
  - 普通の店の間口は 3.05〜5.48 m。Cheapside ではもっと狭く、1.83 m 未満。
  - 店の部屋は約 2.44×3.04 m（Schofield 1987 の引用）。記録にある奥行きは 3.66〜7.62 m、高さは 2.74 m と 3.2 m。
  - 1300 年には 2 階建ての店の建物が多かった。1547 年の金細工師の店は 3 階建てに屋根裏。
  - Treswell の Cheapside の店は、ほとんどが扉の両側に窓のある型で、間口 6.1〜7.32 m。
- pp.198–199: 店の正面は 17 世紀後半までガラスがなかった。窓は縦桟で 2 区画が最も多く、3〜4 区画もある。夜は上から吊った木の雨戸で閉じた。
- pp.201–202: 看板は屋号で、業種とはほとんど関係がなかった。

設計への適用: §4.3 の間口・扉・窓の形、§4.4 の店の間、§4.5 の看板、§4.6 の階数。ロンドンの事例なので、大陸には §5.3 を使う。ほかの著作からの引用（Schofield、Keene）は、原典を確かめていない。

### 5.2 P. Treveil and M. Burch, "Number 1 Poultry and the development of medieval Cheapside", *Trans. LAMAS* 50, pp.55–60（[ADS](https://archaeologydataservice.ac.uk/catalogue/adsdata/arch-4072-1/dissemination/pdf/LAMAS_Vol50_55-60_NumberIPoultryAndDevelopmentMedievalCheapside.pdf)）

- p.56: 11 世紀の Poultry の建物は、間口約 3 m・奥行き約 5.5 m。
- p.57: Bucklersbury の屋敷地は幅約 6 m・奥行き 20〜25 m。13 世紀から、金属職人の店と作業場が並んだ。

設計への適用: 幅の下限 3.0 m の裏付け。幅約 6 m の区画に、1 軒の店舗兼住宅が建つ。

### 5.3 P. Garrigou Grandchamp, « Les maisons urbaines du Xe au milieu du XIIIe siècle », *M.S.A.M.F.* hors série 2002（[SAMF](https://societearcheologiquedumidi.fr/_samf/memoires/hrseri2002/GARRIGOU.PDF)）

- p.92 図 15: 「多目的の家」（maison polyvalente）の 5 つの型。売り場は、1 階の正面、正面と軒下、半地下、またはその組み合わせにある。
- p.94:
  - 住まいは上の階にあり、通りに大きな開口を持つ。上の階へは、通りから直接上がることが多い。
  - アーケードの 1 階は、ブルゴーニュと南仏に多い。英国では、家の前の店の列と半地下の家が主になる。
  - ドイツ語圏にはアーケードがほとんどない。ハンザの町では、屋根裏が倉庫になる。
- p.100: マルセイユの陶工の町（12 世紀末〜1240 年代）は、幅約 6 m の細長い区画に、55〜65 m² の職人の家が建つ。

設計への適用: §4.3 の文化ごとの 1 階の形、§4.6 の大きさ。南仏の 12〜13 世紀が中心で、ドイツ語圏の店の窓の形は、本資料からは分からない。

### 5.4 A. Reinle, „Fensterladen", *Reallexikon zur Deutschen Kunstgeschichte* VII（1981）, Sp. 1501–1524（[RDK Labor](https://www.rdklabor.de/wiki/Fensterladen)）

- 「3. Klappläden」: 跳ね上げ・跳ね下げの雨戸（Klappladen）は、開口の上か下に蝶番で留め、棒で支えるか上で掛け金に掛けた。
- 同節: Konrad Witz の板絵（1445 年ごろ、シュトラスブルク）に、石造の家の 1 階の店の丸アーチの開口がある。上の雨戸は上げ、下の雨戸は倒して陳列台・売り台にしている。
- 冒頭: 通りに向けて開く中世の Klappladen が陳列台・売り台になり、ここから店を「Laden」と呼ぶようになった。
- 同節: Zürich の世界年代記（1340〜50 年ごろ）では、上に蝶番のある雨戸を棒で支え、片流れの庇のようにしている（店とは書かれていない）。

設計への適用: `northern-urban` の店の窓を、`atlantic` と同じ上下 2 枚の雨戸（TradeKit の `shopFront`）にする。開口の大きさと、扉が別にあるかは本資料からは分からない。図像が中心で、14〜15 世紀の店の雨戸の現存例は挙がっていない。

### 5.5 旧版から引き継いだ資料

| 資料 | 確認できること | 設計への適用と限界 |
| --- | --- | --- |
| D. Clark, "The shop within? An analysis of the architectural evidence for medieval shops", *Architectural History* 43 (2000)（[Cambridge](https://resolve.cambridge.org/core/journals/architectural-history/article/abs/shop-within-an-analysis-of-the-architectural-evidence-for-medieval-shops/870F1729B4647050A0643BFFE4F8C198)） | 中世の店の建築上の証拠を類型にまとめている | 店の開口の型の補足。本文は未確認 |
| [VCH Explore（Victoria County History の教材）](https://ihr-archive.github.io/vch-explore/node/12669.html) | 雨戸は上下に開き、下の雨戸（stall board）を倒すと売り台になる | `atlantic` の店の窓 |
| [Historic England: Commerce and Exchange Buildings](https://cms.historicengland.org.uk/images-books/publications/dlsg-commerce-exchange-buildings/heag121-commerce-and-exchange-lsg) | 中世の店が元の形で残ることはまれで、元の雨戸や売り台が残る例はきわめて少ない | 細部は推定になる。金物は High だけに描く |
| [English Buildings: Lavenham](https://englishbuildings.blogspot.com/2017/02/lavenham-suffolk.html) | 15 世紀の店は、ガラスのない開口を雨戸で閉じた | 店の開口にガラスを入れない |

まだ確かめていないこと:

- ドイツ語圏（`northern-urban`）の店の開口の大きさ。§5.4 で雨戸の形は確かめたが、寸法の資料はまだない。
- `stone-upland`・`northern-wooded` の事例。見つからなければ仮のまま、本書に明記する。

### 5.6 ギルドホール（W5 の調べ直し、2026-11-18）

| 資料 | 確かめたこと | 設計への適用 |
| --- | --- | --- |
| K. Giles, "Medieval Guildhalls as Habitus", in *An Archaeology of Social Identity: Guildhalls in York, c.1350–1630*, BAR (2000), pp.56–78（[White Rose](https://eprints.whiterose.ac.uk/11009/1/chap6.pdf)） | 14 世紀の職人組合は、祭壇を持つ教区教会の身廊・側廊で会合を開くのが普通だった（p.112）。多くの兄弟会・職人組合は会館を建てなかった（p.119 "many religious fraternities and craft mysteries never built guildhalls"）。会館を建てるのは、合併や危機などの節目だった（p.117）。ヨークで会館を建てた職人組合は、肉屋（Shambles）と靴屋（Hungate）くらいで、ほかは商人・兄弟会の会館。大きな会館は門と中庭の奥にあり、通りに面していない（p.121–122）。会館は前の家の敷地に建つことが多かった（p.119） | `atlantic`: 職人組合ごとの会館は作らない。大きな町でも数棟だけ。大きな会館は通りの並びではなく、表の家の奥に置く |
| [The Hundred Parishes, "Guildhalls"](https://hundredparishes.org.uk/wp-content/uploads/2023/07/Article-GUILDHALLS.pdf)（エセックス北西部の地域史の解説） | 村と小さな町の guildhall の多くは、教会に結びついた互助会のもの。教会の脇や裏に 1 棟（Linton 1523、Finchingfield・Clavering・Ashdon は 15 世紀）。職人組合のものは市場町に限られ、1 階を市場にしたものがある（Thaxted、3 階建て、15 世紀） | 町に 1 棟の「町のギルドホール」を、教会の近くに置く。市場のある町では 1 階が開いた型（task 49）にできる |
| [Thaxted Guildhall（Wikipedia）](https://en.wikipedia.org/wiki/Thaxted_Guildhall) | 1 階は市場の開いた床で、中央に太い柱。2 階は 3 面で通りに張り出す（独立した建物）。刃物組合が費用を出したとされるが、確かではない。年輪年代では材は 15 世紀後半 | task 49 の型の根拠。大きさは未確認 |
| P. Motz, 1926（[Badische Heimat](https://badische-heimat.de/wp-content/uploads/2019/02/1926_rathaeuser_konstanz.pdf)、検索結果の抜粋で確認、本文は未読）と [Rosgartenmuseum](https://en.wikipedia.org/wiki/Rosgartenmuseum) | コンスタンツ（15 世紀に約 5,000 人）の 10 の Zunft のうち、自分の家を持ったのは大きな 4 つだけで、ほかは Trinkstube を使った。「Zum Rosgarten」は 1324 年に記録のある家で、1454 年に Zunftsaal を入れた。肉屋・小売商・薬屋・陶工・縄屋の Zunft が 1 つの家を使った | `northern-urban`: Zunfthaus は並びの家を買い取ったもの。Zunft の数より少なく、1 つの家を数業種で使う |
| [Zünfte of Zürich](https://en.wikipedia.org/wiki/Z%C3%BCnfte_of_Z%C3%BCrich) と各 Zunfthaus の記事（Wikipedia） | 1336 年以後、13 の Zunft と Constaffel。家は買い取りが多い（Saffran 1383、Constaffel「Haus zum Rüden」1401、Schmiden「Zum goldenen Horn」1412、Kämbel 1487）。今の宮殿のような建物は 18 世紀の建て替え（Saffran 1719〜、Meisen 1752〜）。場所は Limmatquai・Münsterhof など川沿いと広場 | Zunft が町を治める町では、Zunft ごとに家がある。中世の家は通りの並びの町家で、大きさは隣の家に近い |
| [Turismo Roma: Seven Roman guild churches](https://turismoroma.it/en/page/seven-roman-guild-churches)、[Scuole Piccole of Venice](https://www.worddisk.com/wiki/Scuole_Piccole_of_Venice) | イタリアの組合の本拠は、守護聖人の教会や礼拝堂だった。ヴェネツィアの小さな scuole の多くは、教区教会や修道院の教会で会合した。ボローニャの樽運びの組合のように、大都市には組合の館もある | `mediterranean`: 職人組合の会館は、大都市を除いて作らない。教会の礼拝堂で足りる |

まとめ:

- 今の CE は、実務者 3 人以上の業種ごとに会館を 1 棟置く（`medievalTradeDemand` の `inferredHalls`）。500 人の町でも 7 棟、2,000 人で 9 棟の 12.8×9 m の会館が建つ。どの地域の資料とも合わない。「組合がある」ことと「会館を持つ」ことは別である。
- 会館を持つ組合は少なく、地域で形が違う。
  - `atlantic`: 町のギルドホール 1 棟（教会の近く、または市場の 1 階が開いた建物）。職人組合の会館は大きな町に数棟で、表の家の奥。
  - `northern-urban`: 通りの並びの町家を買い取った Zunfthaus。大きな Zunft だけが持ち、1 つの家を数業種で使う。Zunft が町を治める町では、Zunft ごとに持つ。
  - `mediterranean`: 教会の礼拝堂。会館は大都市だけ。

まだ確かめていないこと:

- `stone-upland`・`northern-wooded` の事例。北欧・バルト海沿岸の gilde の家（ギルドの宴会の家）を次に調べる。それまでは `atlantic` と同じ規則を仮に使う。
- Thaxted と Zunfthaus の間口・奥行き。Zunfthaus は隣の町家と同じ区画の家とみなす（仮）。
- 小さなドイツ語圏の町（2,000 人未満）で、Zunft が宿屋・市庁舎で会合したことを示す中世の資料。ウルムの宿屋の例は 18 世紀の記述だった（[ウルム市文書館](https://stadtarchiv.ulm.de/-/media/archiv/downloads/ugin/wirtschaft/zunftwesen.pdf)、検索結果の抜粋）。

## 6. 段階

| 段階 | 内容 | 依存 |
| --- | --- | --- |
| W0 | 計測（§3.3）。済み | なし |
| W1 | MV: `OpusWorkhomeSpec` と `createOpusWorkhome`（外殻・1 階の正面・看板）を作る。5 つの地域の型の 1 階（§4.3）を入れる。task 51 の 13 の組み合わせに Opus の版を足す。外接矩形は Codex 版と同じにする。MV で幅・文化・店の開閉を切り替えて見られるようにする | なし |
| W2 | 店の間と業種の品物（§4.4、10 業種）、階数（§4.6） | W1 |
| W3 | CE: `CE_ADOPTION` で Opus 版を採用する。施設ごとの外観の仕様（§4.7）を入れる。`compact` の出力が変わらないことを確かめる | W1、W2 |
| W4 | CE `burgage`／`burgage-dense`: 区画の幅に合わせた資産を作り、Workhome を区画 1 筆に置く。版を上げる。[ce-burgage-plot-fabric.md](ce-burgage-plot-fabric.md) §8.7 の町で、建物の割合と施設を置けた数を比べる | W3 |
| W5 | ギルドホールの数と形を地域ごとに改める（§6.1）。史料の調べ直し（§5.6）は済み | W3、W4 |

### 6.1 W5 の計画（§5.6 を受けて改めた）

旧版の「使われていない Trade／Market Guild Halls（task 48/49）を同じ並びに混ぜる」は、会館の数が今のままである前提だった。§5.6 で、数そのものが多すぎると分かったので、次の 3 つに分ける。

| 段階 | 内容 |
| --- | --- |
| W5a | 会館の数の規則。組合（実務者 3 人以上の業種）と会館を分ける。地域の型と町の人口から、会館の数と形を決める（下の表）。会館を持たない組合は建物を描かない（教会・宿屋で会合する） |
| W5b | `northern-urban` の Zunfthaus。task 48 の ID に Opus の版を足し、Workhome と同じ組み立てで、区画 1〜2 筆の町家として並びに置く。1 階は扉と窓、2 階は Stube の窓の列、紋の看板。店の間は作らない。1 つの家に数業種を割り当てる |
| W5c | `atlantic` の町のギルドホール。市場のある町では task 49（1 階が開いた型）を市場に面して置き、CE で使えるようにする。ほかは task 48 を教会の近くに置く。大きな町の職人組合の会館は、表の区画の奥に置く |

会館の数（Economy なしの既定。人口の区切りは仮の値）:

| 地域の型 | 2,000 人未満 | 2,000〜10,000 人 | 10,000 人以上 |
| --- | --- | --- | --- |
| `atlantic`・`northern-wooded`・`stone-upland`（仮） | 町のギルドホール 1 | 町のギルドホール 1 | 町のギルドホール 1 ＋ 職人組合の会館 5,000 人ごとに 1 |
| `northern-urban` | 0（宿屋で会合） | Zunfthaus を 1,250 人ごとに 1（コンスタンツ 5,000 人で 4）。組合の数が上限 | 同じ |
| `mediterranean` | 0 | 0 | 職人組合の会館 10,000 人ごとに 1 |

- 大きな組合（実務者の多い業種）から順に会館を割り当てる。`northern-urban` で会館より組合が多い時は、残りの組合を同じ家に足す（コンスタンツの Rosgarten）。
- Economy あり: FMG の組合（`guild-halls-and-urban-trades.md` の chapter）を組合として渡し、同じ規則で会館にする。
- 版: 施設の数が変わるので、`compact`・`burgage`・`burgage-dense` の版を上げる。

受入の条件:

- 2,000 人の `atlantic` の町の会館: 9 棟 → 1 棟。5,000 人の `northern-urban` の町: 4 棟以下で、全部が区画の並びの町家。
- 会館を持たない組合の業種でも、Workhome の数は変わらない。
- 未収容の住民: 0。`burgage-dense` の建物の割合は、空いた区画を家が埋めるので、W4 より下がらない。

## 7. 受入の条件

### 7.1 W1〜W2（MV）

- Low の三角形: 1 棟あたり 1,800 以下（地域の型の住宅 `craft` の約 1.5 倍）。High は 7,000 以下。今の Codex 版は 4,428〜6,444／12,984〜14,200。
- Low と High で、外接矩形・開口・扉・看板の位置が同じ。
- 幅 3.0 m と 7.5 m、5 つの地域の型の全部で、開口が壁や張り出しの柱と重ならない。
- 扉が開口だけになっている Workhome: 0。

### 7.2 W3（CE `compact`）

- `compact` の配置（施設の位置・向き・敷地）、街区の記録（fabric）、人口の報告が変わらない。Workhome の扉の位置・高さ・外観の仕様は変わるので、文書全体の SHA は変わる（2026-11-18 に改めた。§10.3）。
- 同じ列で接する Workhome の組のうち、`specKey` が同じ組: 0。
- 町全体の Workhome の三角形（Low）が、今の 0.4 倍以下。

### 7.3 W4（CE `burgage`／`burgage-dense`）

- Workhome の 9 割以上が区画 1 筆に建つ。
- §8.7 の 2,000 人と 5,000 人の施設のある町で、施設を置けた数が今以上、壁の中の建物の割合が今以上。
- 未収容の住民: 0。

最後に、MV と CE の 3D で目視し、ユーザーに確かめてもらう。

## 8. 未決事項

- 店を `open` にする割合。季節・時刻の表示と結びつけるか。
- `storeys: 3` の条件（lateMedieval 以降・間口 5 m 以上）は仮の値。
- 住宅にも、4×4 m ほどの小さな建物が 3〜4 階建てになるものがある（2026-11-18 にユーザーが指摘）。床面積と階数の関係の上限は、[ce-building-height-variation.md](ce-building-height-variation.md) で扱う。本書の §4.6 の上限は、その時に同じ規則へまとめる。
- task 52〜58 の専用作業場（パン焼き 14.5×10.5 m、鉄器・魚 14×12 m、肉 16×13 m など）。大きさは、表の店舗兼住宅と裏の作業場・庭をまとめた敷地の大きさになっている。`burgage` では区画がすでに庭を持つので、表の家を区画の家に任せ、裏の作業場だけを置く形にできるか。別の設計書で調べる。（2026-11-18、[ce-town-trade-rear-works.md](ce-town-trade-rear-works.md) で調べた。）

## 9. 次の作業

本書の W1〜W4 は済んだ。次の候補は 3 つある。

- 町の中心の大型施設（task 52〜58）の大きさの見直し（§8 の未決事項。別の設計書）。`burgage-dense` の施設のある町の建物の割合を `compact` に近づけるには、こちらが要る（§10.4）。
- W5 の残り（§10.7 のまだ扱っていないこと）: 大きな町の職人組合の会館を表の区画の奥に置く。Economy ありの町の会館に §6.1 の規則を通す。
- §10.4 で見つけた、`burgage`・川あり・5,000 人・種 `r1` の検証の誤り（刃物屋の配置）。W4 の前からある。

## 10. 実装の記録

### 10.1 W1（2026-11-18）

作ったもの:

- [opusWorkhomeProfiles.ts](../../src/buildings/medieval/opusWorkhomeProfiles.ts)（Three.js なし）: `OpusWorkhomeSpec`、正規化と `opusWorkhomeSpecKey`、壁・開口・入口を決める `opusWorkhomeLayout`、文化ごとの 1 階の型、Codex の外接矩形を保つ既定の仕様（`opusWorkhomePreset`）。CE は W3／W4 でここから敷地と入口を引く。
- [opusWorkhome.ts](../../src/buildings/medieval/opusWorkhome.ts): `createOpusWorkhome(spec, quality)`。外殻・1 階の正面・裏口・上の階の窓・屋根・煙突・看板だけを作り、`compactModel` で材料ごとにまとめる。
- [regionalHouseStyles.ts](../../src/buildings/houses/regionalHouseStyles.ts): 地域の型の `STYLES` を Three.js なしのファイルに移した（`REGIONAL_HOUSE_STYLES`）。住宅の出力は変えていない。
- task 51 の 13 のモデルに、作者 `Claude Opus 5.5` の Low／High を足した。MV では、作者を Opus に切り替えると、文化・間口・店の窓の数・店の開閉・扉・階数・通りに向ける面・扉の側を選べる（`MedievalModel.presentation`、MV 側は汎用の選択欄）。Opus 版には部品の一覧がない。
- `CE_ADOPTION` で、task 51 の CE の採用を Codex 版に固定した。CE の出力は変わらない。
- TradeKit の `pitchedRoof` に `courses`（瓦の段を描くか）を足した。草葺きには段を描かない。

設計から変えた点・決めた点:

- 外接矩形を区画に収めるため、屋根の出を寸法から逆算する。平入りは隣家との境で破風の出を 0.05 m にし、妻入りは軒の出と屋根の厚みの分だけ壁を内側に寄せる。張り出しと平入りの軒も、通り側の区画の線を越えない。
- 妻入りで店の窓が 1 m 未満になる狭い区画では、平入りに切り替える。`northern-urban`（妻入り固定）は、3 m の区画でも店の窓 1 m 弱を確保できる。
- 裏には、表の扉と並ぶ裏口と小窓を付けた（裏庭に面する）。
- W1 の店の開口の奥は、暗い面 1 枚で閉じた。店の間は W2 で作る。

三角形の数（仕立、店の窓 2、1 棟あたり、Low／High）:

| 文化 | 3 m・2 階 | 6.44 m・2 階 | 6.44 m・3 階 | 7.7 m・2 階 |
| --- | --- | --- | --- | --- |
| `atlantic` | 700／2,260 | 892／3,424 | 1,108／4,828 | 892／3,640 |
| `northern-urban` | 724／2,260 | 916／3,496 | 1,132／4,876 | 916／3,724 |
| `mediterranean` | 540／1,644 | 694／2,386 | 814／3,238 | 694／2,434 |
| `stone-upland` | 636／2,016 | 790／2,986 | 1,006／4,390 | 790／3,142 |
| `northern-wooded` | 556／1,696 | 748／2,512 | 868／3,496 | 748／2,596 |

Low は Codex 版（4,428〜6,444）の 1/4〜1/6、地域の型の住宅 `craft`（596〜1,180）と同じ程度になった。§7.1 の上限（Low 1,800、High 7,000）に収まる。メッシュは 1 棟 7〜10 個。

確かめたこと:

- [opusWorkhome.test.ts](../../src/buildings/medieval/opusWorkhome.test.ts): 5 つの文化 × 間口 4 つ × 階数 2 つで外接矩形が区画に収まること、三角形の上限、扉と店の窓が重ならず柱を残すこと（3 m〜7.7 m、窓 1／2、左右）、仕様のキー、13 モデルの Opus の版と CE の採用。
- MV で 5 つの文化を表示して目視した（英国型の平入り・妻入りの 2 窓、ハンザ型の妻入りと荷揚げ戸、南仏型のアーチの店口と石の売り台、山地型の閉じた雨戸と半開きの扉、北方の板張りの 3 m 間口）。

### 10.2 W2（2026-11-18）

作ったもの:

- 店の間（[opusWorkhome.ts](../../src/buildings/medieval/opusWorkhome.ts) の `shopBay`）: 雨戸を開けた店の窓の奥に、奥行き 2.8 m の部屋を作る（Schofield の約 2.4×3.0 m、Bennell p.194）。床、奥と左右の仕切り、窓台の内側の台、奥の壁の棚（Low 1 段、High 2 段）、開口の内側の吊り棒（High）。仕切りで家の中を閉じるので、奥の空洞は見えない。雨戸を閉めた時は作らない。
- 業種の品物（[opusWorkhomeGoods.ts](../../src/buildings/medieval/opusWorkhomeGoods.ts)）: 10 業種ごとに、売り台・内側の台・棚・吊り棒の 4 か所の品物を決めた。

  | 業種 | 品物 |
  | --- | --- |
  | 仕立 | 畳んだ布、吊った衣服 |
  | 織物 | 布の反物、吊った布 |
  | 靴 | 靴の対、吊った長靴 |
  | 毛皮 | 毛皮の束、吊った毛皮 |
  | 革細工 | 財布・ベルト、吊った袋 |
  | 馬具 | 鞍（台の上）、手綱、吊った馬具 |
  | 金細工 | 杯と大皿。手の届く所には吊らない |
  | 指物 | 小箱・椀、吊った腰掛け |
  | 弓矢 | 矢の束、吊った弓 |
  | 書籍 | 本（表紙の色を変える）。吊らない |

  品物の数は Low で減らし、位置は Low と High で同じにした。南仏型・山地型では、石の売り台の上に並べる。
- 階数（[opusWorkhomeProfiles.ts](../../src/buildings/medieval/opusWorkhomeProfiles.ts) の `opusWorkhomeStoreys`）: 3 階建ては lateMedieval 以降、間口 5 m 以上で、施設ごとのくじが 35% 未満の時だけ（仮）。仕様に 3 階建てを指定しても、間口 5 m 未満では 2 階建てにする。CE は W3 でこの関数を使う。
- 看板の屋号のうち、輪（トーラス、288 三角形）を平らな円板（太陽）に替え、鍵の輪も板にした。

三角形の数（1 棟あたり、Low／High）:

| 条件 | Low | High |
| --- | --- | --- |
| 6.44 m・窓 1・2 階・開店（10 業種 × 英国型・南仏型） | 756〜976 | 2,768〜3,808 |
| 7.7 m・窓 2・3 階・開店（同上、最大の組み合わせ） | 1,114〜1,528 | 4,278〜6,880 |
| 6.44 m・閉店 | 600〜712 | 2,352〜2,644 |

全業種・全組み合わせが §7.1 の上限（Low 1,800、High 7,000）に収まる。開店で増えるのは Low で 150〜300、High で 400〜1,200。

確かめたこと:

- [opusWorkhome.test.ts](../../src/buildings/medieval/opusWorkhome.test.ts) に 2 件足した: 10 業種 × 2 文化の最大の組み合わせで三角形の上限と区画に収まること、雨戸を閉めると店の間と品物がなくなること。階数の規則（時代・間口・くじ、間口 5 m 未満で 3 階にしない）。
- MV で正面から目視した: 仕立（英国型、布と衣服）、金細工（南仏型、石の売り台に杯と皿）、弓矢（英国型 7.5 m・窓 2）、靴（ハンザ型）、書籍（山地型、アーチの店口に本）、馬具（北方型）、毛皮の閉店と半開きの扉。

### 10.3 W3（2026-11-18）

作ったもの:

- 採用: `CE_ADOPTION` で task 51 の Low／High を Opus 版にした。
- 敷地: `MedievalModel.placementEnvelope` を足し、task 51 は Codex 版の外接矩形（6.44／5.24／7.64 × 10.53／8.93 m）を宣言する。`placementFootprint` は宣言した値を、測った網の値と同じ float32 に丸めて返す。どちらの作者のモデルでも、CE の敷地は同じになる。
- 入口: `populationFacilityRequests` の Workhome の入口を、Opus 版の既定の仕様の扉（`opusWorkhomeLayout(...).entrance`）にした。
- 外観の仕様（[workhomeExteriors.ts](../../src/city-editor/generators/vector/generation/workhomeExteriors.ts) の `dressWorkhomes`）: 施設を置いた後、自動で置いた Workhome ごとに決めて、配置の `exterior` に保存する。
  - 文化: 町の外観の型（`vectorTownProfile`。壁・塔と同じ。`legacy` なら英国型）。
  - 通りに向ける面・階数（`opusWorkhomeStoreys`）・雨戸（開 7 割）・扉（半開き 2 割）・看板（7 割）・明暗: 施設 id の種から。割合は仮（§8）。
  - 隣と壁を接する Workhome が同じ外観になる時は、通りに向ける面 → 明暗 → 雨戸の順にずらす。
  - 保存する高さ（`building.heightMeters`）を、その外観のモデルの高さにする（`opusWorkhomeHeight`。Low と High で同じ）。
  - 編集の前から残る施設は、保存されたまま（`exterior` がなければ Codex 版のまま）にする。
- 描画: 3D は `exterior` からその外観の Opus 版を作り（`placementDefinition` の `workhome`、仕様ごとに試作品を共有）、`exterior` のない古い保存データの Workhome は Codex 版で描く。これで古い保存データの高さの照合も通る。
- 町の外観の型を決める関数を、描画側から生成側（`vectorTownProfile`、[housingCulture.ts](../../src/city-editor/generators/vector/generation/housingCulture.ts)）に移し、描画側はそれを呼ぶ。`automaticHousingProfile` は [automaticHousing.ts](../../src/buildings/appearance/automaticHousing.ts) に移した（描画側からも再輸出している）。
- 文書の検証: 配置の `exterior` を受け付け、Workhome のモデル以外に付いていたり、値が範囲外だったりすれば誤りにする。

`compact` の出力（`b2-probe`、壁あり・川なし）:

| 町 | 配置・街区・報告 | 文書全体の SHA |
| --- | --- | --- |
| 1,000 人・家だけ | W3 の前と同じ | 同じ（`01a89e2c58563127`） |
| 2,000 人・施設あり | 同じ（施設 94/100） | 変わる（扉・高さ・外観） |
| 5,000 人・施設あり・lateMedieval | 同じ（施設 234/250） | 変わる |

初めは宣言した外接矩形を丸めずに返していたため、敷地の値が測った値（float32）と 1e-8 m ほど違い、配置と街区が変わった。丸めて同じ値にした。扉の位置と高さは、配置に影響しなかった。

町全体の Workhome（`compact`、`b2-probe`）:

| 町 | Workhome | 外観の種類 | 3 階建て | 三角形 Low（Codex → Opus） | 三角形 High |
| --- | --- | --- | --- | --- | --- |
| 2,000 人 | 58 | 52 の試作品 | 23 | 316,804 → 54,140（0.17 倍） | 898,060 → 218,760（0.24 倍） |
| 5,000 人 | 155 | 111 の試作品 | 43 | 837,912 → 142,912（0.17 倍） | 2,382,180 → 568,260（0.24 倍） |

試作品の数は Codex 版（業種 × 外形の 13 まで）より大きく増えた。5,000 人の町の 3D の場面を作る時間は、Low 691 → 686〜701 ms、High 2,395 → 2,472〜2,500 ms（+3〜4%）で、§7 の 1.2 倍以内に収まった（vitest の中で、2 回目以降を測った）。

確かめたこと:

- [workhomeExteriors3d.test.ts](../../src/city-editor/renderers/vector/workhomeExteriors3d.test.ts)（3 件）: 2,000 人の `compact` の町で、全 Workhome が町の文化の外観を持ち、壁を接する 2 つが同じ外観にならないこと。3D で全 Workhome がモデルで描かれ、高さの不一致や仮の箱の警告が出ないこと。`exterior` のない古い保存データが Codex 版で警告なく描かれること。
- [opusWorkhome.test.ts](../../src/buildings/medieval/opusWorkhome.test.ts): CE の採用が Opus 版になり、敷地が Codex 版の外接矩形のままであること。Low と High の高さが同じこと。
- CE（meshless）で `compact`・`medieval-facilities` の町を生成し、3D で目視した。
- 関連テスト 43 ファイル・219 件のうち、2 件が失敗した。`houseLod3d.test.ts` と `facilities3d.test.ts`（施設の町の BV の作業場を High で描く）は、W1 の前のコミット 730b4c1b7 でも失敗しており、今回の変更とは関係しない。

### 10.4 W4（2026-11-18）

作ったもの:

- 区画に合わせた資産（[workhomeAssets.ts](../../src/city-editor/generators/vector/generation/workhomeAssets.ts) の `fittedWorkhomeAsset`）:
  - 幅は区画の間口から両側 0.1 m を引き、0.25 m 刻みに切り下げる（3.0〜7.5 m）。
  - 奥行きは Codex の外形の奥行きを 0.5 m 刻みに切り下げたもの（10.5／9 m）か、区画の浅い所から 0.2 m 引いたものの小さい方（8 m 以上）。
  - 扉の側は施設 id の種で左右に分ける。入口はその仕様の Opus 版の扉。
  - 資産は配置の間だけ使い、保存しない。
- `placeFacilitiesOnPlots`: Workhome は、区画 1 筆から試し、その間口で上の資産を作って置く。間口が 3.2 m に足りない区画では、2 筆以上をまとめた幅で作る。区画の数の上限・列と街区に残す区画の規則は変えていない。
- 外観の仕様（`OpusWorkhomeExterior`）に `widthMeters`・`depthMeters`・`mirror` を足した（区画に合わせた Workhome だけが持つ）。`dressWorkhomes` はこの 3 つを残して残りを決め、階数の規則（間口 5 m）にはこの幅を使う。検証は刻みと範囲を確かめる。
- 3D: 区画に合わせた Workhome は、外観の仕様の幅と奥行きを敷地の照合に使う。
- 版: 出力が変わったので、`compact` を v21、`burgage` を v22、`burgage-dense` を v23 にした。W3 で `compact` の扉・高さ・外観が変わった分も v21 に含める（W3 では版を上げていなかった。再現用のレシピは版の違う文書を断る）。v18〜v20 の保存データは、そのまま読める。

施設のある町（壁あり・川なし、`b2-probe`）、W4 の前 → 後:

| 町 | 施設を置けた数 | Workhome が区画 1 筆 | 間口の中央値 | 建物の割合（家だけ） | 建物の割合（家と施設） |
| --- | --- | --- | --- | --- | --- |
| `burgage-dense` 2,000 人 | 84 → 94/100 | 9/48 → 56/58 | 4.25 m | 20.8% → 21.1% | 32.0% → 31.2% |
| `burgage-dense` 5,000 人 | 239 → 239/255 | 34/155 → 152/155 | 4.25 m | 21.0% → 21.7% | 32.9% → 31.5% |
| `burgage` 2,000 人 | 84 → 94/100 | 37/48 → 57/58 | 7.0 m | 12.5% → 12.2% | 18.6% → 19.0% |
| `burgage` 5,000 人 | 238 → 238/255 | 106/155 → 151/155 | 6.75 m | 10.9% → 10.8% | 16.9% → 16.7% |

（「区画 1 筆」は、区画の正面の中点から 1 m 奥の点が Workhome の敷地に入る区画が 1 つだけのもの。建物の割合は壁の中の街区に対する値で、§8.7 の計測とは数え方が違う。）

- 2,000 人の町で置ける施設が 84 から 94 になり、`compact`（94/100）と同じになった。Workhome が区画を 2 筆使わなくなったため。
- `burgage-dense` の建物の割合（家と施設）は 0.8〜1.4 ポイント下がった。Workhome の建物が 6.44 m 幅から区画の幅（中央値 4.25 m）に細くなり、その分の土地を家が埋め切っていない。§7.3 の「建物の割合が今以上」は満たしていない。
- 川あり（種 `r1`・`r2`）でも、施設 93〜253/255、Workhome の 95% 以上が区画 1 筆、未収容の住民 0。ただし `burgage`・川あり・5,000 人・種 `r1` は、文書の検証で刃物屋（task 58、Workhome ではない）の配置が誤りになり生成できない。W4 の Workhome の変更を外しても同じなので、W4 の前からある不具合である（未調査）。

確かめたこと:

- [workhomeExteriors3d.test.ts](../../src/city-editor/renderers/vector/workhomeExteriors3d.test.ts) に 2 件足した: `burgage-dense` の 2,000 人の町で、Workhome の 9 割以上が区画 1 筆に建ち、幅が区画の間口から 0.2 m 引いて 0.25 m 刻みに切り下げた値であること、扉が左右両方あること。3D で全 Workhome がモデルで描かれ、警告が出ないこと。
- [burgagePlots.test.ts](../../src/city-editor/generators/vector/generation/burgagePlots.test.ts) の版の期待値を v21〜v23 にした。
- 5,000 人の町（`burgage-dense`・`burgage`・`compact`、川ありを含む 4 つ）の 3D で、仮の箱や高さの不一致の警告が 0 件。
- CE で `burgage-dense` の 5,000 人の町を生成し、3D で目視した。この町では「仮の箱・未確認のモデル」の注記が 1 件出た。どの建物かは特定できていない（vitest の 4 つの町では 0 件）。
- 関連テスト 67 ファイル・272 件のうち、失敗は §10.3 と同じ 2 件（W1 の前から失敗している `houseLod3d.test.ts`・`facilities3d.test.ts`）。

### 10.5 W5a（2026-11-18）

§6.1 の数の規則を、2026-11-18 にユーザーが認めた。

作ったもの:

- [guildHallPlan.ts](../../src/city-editor/generators/guildHallPlan.ts): `guildHallPlan(culture, population, chapters)`。§6.1 の表のとおりに、会館の種類（`town`・`craft`・`zunft`）と、そこで会合する組合を返す。会館は実務者の多い組合から割り当てる。`northern-urban` では、家を持たない組合を家に順に足す。
- [populationFacilityRequests.ts](../../src/city-editor/generators/populationFacilityRequests.ts): `culture` を受け取り、会館の要求を `guildHallPlan` から作る。町のギルドホールの ID は `guild:town`、ほかは `guild:<業種>` のまま。モデルは W5b・W5c までは今の task 48（先頭の組合の紋）を使う。`culture` がない時（メッシュありの CE）は、今までどおり組合ごとに 1 棟。
- [housingCulture.ts](../../src/city-editor/generators/vector/generation/housingCulture.ts): 町の外観の型を文書ができる前にも出せるように `townProfileFor` を分け、型から会館・Workhome の文化を出す `vectorTownCulture` を置いた（`legacy` は `atlantic`）。`urban.ts`・敷地の見積もり（`vectorFacilityLand`、`editorInput.ts`・`pipeline.ts`）が同じ文化を使う。
- 版: `compact` を v24、`burgage` を v25、`burgage-dense` を v26 にした。

施設のある町（壁あり・川なし、`b2-probe`、大航海時代）、W5a の前 → 後:

| 町 | 会館 | 施設を置けた数 | 建物の割合（家と施設） | 未収容 |
| --- | --- | --- | --- | --- |
| `atlantic` `compact` 2,000 人 | 10 → 1 | 94/100 → 85/91 | 38% → 43% | 0 |
| `atlantic` `compact` 5,000 人 | 10 → 1 | 239/255 → 230/246 | 45% → 47% | 0 |
| `atlantic` `burgage` 2,000 人 | 10 → 1 | 94/100 → 85/91 | 19% → 17% | 0 |
| `atlantic` `burgage` 5,000 人 | 10 → 1 | 238/255 → 230/246 | 17% → 16% | 0 |
| `atlantic` `burgage-dense` 2,000 人 | 10 → 1 | 94/100 → 85/91 | 31% → 33% | 0 |
| `atlantic` `burgage-dense` 5,000 人 | 10 → 1 | 239/255 → 230/246 | 31% → 31% | 0 |
| `northern-urban` `compact` 5,000 人 | 10 → 4 | 239/255 → 233/249 | 45% → 45% | 0 |
| `northern-urban` `burgage` 5,000 人 | 10 → 4 | 233/255 → 230/249 | 15% → 15% | 0 |
| `northern-urban` `burgage-dense` 2,000 人 | 10 → 1 | 94/100 → 85/91 | 31% → 33% | 0 |
| `northern-urban` `burgage-dense` 5,000 人 | 10 → 4 | 239/255 → 233/249 | 31% → 31% | 0 |

（大航海時代なので印刷の組合ができ、W5a の前の会館は 10。建物の割合は壁の中の街区に対する値で、整数に丸めた。）

- 会館のほかの施設は、置けた数が前と同じ（減ったのは会館の分だけ）。`northern-urban` `burgage` 5,000 人だけは 3 つ多く置けた。置けなかった施設は、前と同じく縄綯い場が主。
- `burgage-dense` の建物の割合は下がらなかった（31〜33%）。`burgage` は 1〜2 ポイント下がった。会館の分だけ町が小さくなり、裏庭の割合が増えたため。`burgage` の割合は §6.1 の受入の条件に入れていない。
- `northern-urban` の Zunfthaus は、まだ task 48 の独立した会館（12.8×9 m）で、区画の並びの町家ではない（W5b）。

確かめたこと:

- [guildHallPlan.test.ts](../../src/city-editor/generators/guildHallPlan.test.ts) を足した（3 件: 地域の型ごとの数、`northern-urban` の家の共用）。
- [workhomeExteriors3d.test.ts](../../src/city-editor/renderers/vector/workhomeExteriors3d.test.ts) の W4 の幅の検査を直した。会館が減って町の区画が変わり、間口 9.5 m の区画に Workhome が建つようになった。上限 7.5 m と、保存した区画の正面が 1 cm 刻みであることを、検査が考えていなかった。
- [burgagePlots.test.ts](../../src/city-editor/generators/vector/generation/burgagePlots.test.ts) の版の期待値を v24〜v26 にした。
- 関連テスト 17 ファイル・113 件が成功した。`tsc --noEmit`・biome・`scripts/lint-architecture.ts` も成功した。

まだ扱っていないこと:

- Economy ありの町の会館（`raiseVectorGuilds`、`environment.guilds`）は、FMG の組合から別に建つ。§6.1 の規則はまだ通していない。
- メッシュありの CE の会館の数は変えていない。

### 10.6 W5b（2026-11-18）

作ったもの:

- MV: task 48 に Opus の会館（`trade-hall.guild-house.<業種>`、10 業種、作者 Claude Opus 5.5、Low／High）を足した。新しいモデル ID で、Codex の独立した会館（`trade-hall.guild-enclosed.*`）は変えていない。MV で文化・間口（6〜10 m）・階数・妻入り／平入り・扉の開閉・扉の側を切り替えられる。
  - [opusGuildHouseProfiles.ts](../../src/buildings/medieval/opusGuildHouseProfiles.ts)（three.js なし）: 仕様・配置・外観の保存形・検査。外形は既定 8×12 m、間口 6〜10 m（0.25 m 刻み）、奥行き 9〜14 m（0.5 m 刻み）。
  - [opusGuildHouse.ts](../../src/buildings/medieval/opusGuildHouse.ts): 1 階は石造で、アーチの入口と鉄格子の窓（チューリヒの Haus zum Rüden は 1348 年に 1 階を石で建て直した。`northern-wooded` だけ木造）。2 階は会合室（Stube）で、天井高 3.2 m、雨戸のない窓を間口いっぱいに並べる（Reihenfenster）。3 階は家の窓。入口の脇に組合の看板（業種の道具・品物の絵）を吊るす。内部は作らない。
  - Workhome と同じ外殻を使うため、[opusWorkhome.ts](../../src/buildings/medieval/opusWorkhome.ts) の組み立てを `groundShell`・`raiseStreetHouse`・`upperStorey` に分け、[opusWorkhomeProfiles.ts](../../src/buildings/medieval/opusWorkhomeProfiles.ts) の外形の計算を `opusStreetShell` に分けた。Workhome のモデルは頂点まで変わらない（5 文化×4 間口×Low／High の頂点・行列のハッシュが前と一致）。
- CE:
  - `northern-urban` の会館（W5a の `zunft`）の要求を、Opus の会館のモデルにした。`atlantic` などの町のギルドホールと職人組合の会館は、W5c までは今の task 48 の独立した会館のまま。
  - `burgage`／`burgage-dense` では、Workhome と同じ方法で区画に合わせる（[workhomeAssets.ts](../../src/city-editor/generators/vector/generation/workhomeAssets.ts)）。区画の並びの間口から幅を 6〜10 m で決め、1 筆で 6 m に足りない時は 2 筆を使う。
  - 外観（`dressWorkhomes`）は、町の文化、入口の開閉、明暗を施設ごとの乱数で決め、高さをモデルに合わせる。保存の `exterior` は、Workhome と会館のどちらかの形（[streetHouses.ts](../../src/buildings/medieval/streetHouses.ts) で型ごとに検査する）。
  - 版: `compact` を v27、`burgage` を v28、`burgage-dense` を v29 にした（`northern-urban` の町の出力が変わる。`atlantic` の町は版の文字列のほかは変わらない）。

施設のある町（壁あり・川なし、`b2-probe`、大航海時代、`northern-urban`）、W5b の前 → 後:

| 町 | 会館の幅 | 施設を置けた数 | 建物の割合（家と施設） | 未収容 |
| --- | --- | --- | --- | --- |
| `compact` 2,000 人 | 12.8 → 8 m（既定） | 85/91 → 85/91 | 43% → 38% | 0 |
| `compact` 5,000 人 | 12.8 → 8 m（既定） | 233/249 → 233/249 | 45% → 44% | 0 |
| `burgage` 2,000 人 | 12.8 → 6.75 m | 85/91 → 85/91 | 16% → 17% | 0 |
| `burgage` 5,000 人 | 12.8 → 6.25〜10 m | 230/249 → 227/249 | 15% → 15% | 0 |
| `burgage-dense` 2,000 人 | 12.8 → 8.25 m | 85/91 → 85/91 | 33% → 31% | 0 |
| `burgage-dense` 5,000 人 | 12.8 → 7.25〜9.5 m | 233/249 → 233/249 | 31% → 30% | 0 |

- `atlantic` の 6 つの町は、施設・家・建物の割合が前と同じ。
- `compact` 2,000 人の建物の割合が 5 ポイント下がったのは、会館の位置が変わって町の街区の分け方が変わり、壁の中の街区が 1 つ増えた（41,254 → 45,609 m²）ため。建物の面積（17,549 → 17,489 m²）はほぼ同じ。
- `burgage` 5,000 人では置けた施設が 3 つ減った（ろうそく屋など）。会館が区画の並びに入った分、ほかの施設の置き場所が変わったためとみられるが、原因は確かめていない。

確かめたこと:

- [opusGuildHouse.test.ts](../../src/buildings/medieval/opusGuildHouse.test.ts) を足した（3 件: 5 文化×間口 6・8・10 m×2・3 階×妻入り／平入りで外形の中に収まること、三角形が Low 1,800・High 7,000 以下（Workhome と同じ上限）、Low と High で高さが同じこと。入口・1 階の窓・Stube の窓が重ならないこと。10 業種が CE で置けること）。
- [workhomeExteriors3d.test.ts](../../src/city-editor/renderers/vector/workhomeExteriors3d.test.ts) に 2 件足した: `northern-urban`・`burgage-dense`・3,000 人の町で、会館が 2 棟とも Opus の会館（独立した会館は 0）、幅 6〜10 m、文化と妻入りが町のものであること。3D で警告が出ないこと。
- [enclosedGuildHall.test.ts](../../src/buildings/medieval/enclosedGuildHall.test.ts) は task 48 の全モデルを独立した会館として調べていたので、独立した会館だけを調べるように絞った。
- MV で目視した（`northern-urban`、8 m、High）。Stube の窓の列に雨戸を付けると重なったので、列の窓には雨戸を付けない（`TradeKit.windowOn` に `shutters` を足した。既定は今までどおり付ける）。
- 関連テスト 64 ファイルを実行した。失敗は、W5b の前から失敗している 5 ファイル（`modelContracts.test.ts` の 40 件、`marketGuildHall.test.ts`・`structuralClearance.test.ts`・`waterGeometry.test.ts`・`obernHouseModels.test.ts` の各 1 件。W5a のコミットでも同じ数だけ失敗する）だけ。`tsc --noEmit`・biome・`scripts/lint-architecture.ts` も成功した。

まだ扱っていないこと:

- 会館の大きさの根拠は、「隣の町家と同じ区画の家」という仮定だけ（§5.6 のまだ確かめていないこと）。
- 1 つの家に同居する組合（W5a）は、看板に先頭の組合しか描かない。

### 10.7 W5c（2026-11-18）

作ったもの:

- [townGuildhall.ts](../../src/city-editor/generators/vector/generation/townGuildhall.ts):
  - `townGuildhallRole`: 施設のある町で、§6.1 の規則が町のギルドホール（`guild:town`）を求める時に、その紋の組合を返す。`atlantic`・`northern-wooded`・`stone-upland` の町が対象。
  - `raiseTownGuildhall`: task 49 の 1 階が開いた会館（`trade-hall.guild-market-arcade.<業種>`）を、市民の広場（`feature:civic-plaza`）の中に置く。
    - 広場の縁に背を付け、正面を広場の中へ向ける。市場の入口から遠い縁（市場の奥）から試す。
    - 広場に入る街路の口と、市の通路が始まる各辺の中央（`layoutMarketStalls` の通路）を 3 m あけ、そこを塞がない。
    - ID は `civic:plaza-guildhall`。広場の配置（`placementIds`）に入れ、市の屋台と同じく展示物として描く（住戸 0）。
- [pipeline.ts](../../src/city-editor/generators/vector/generation/pipeline.ts): 市民の中心を作る段で、屋台を並べる前に会館を置く。屋台・通路・広場の十字架は会館を避けて並ぶ。
- [urban.ts](../../src/city-editor/generators/vector/generation/urban.ts): 広場に会館が建った町では、施設の要求から `guild:town` を外す。建たなかった町（広場が小さい町）は、今までどおり task 48 の独立した会館を施設として置く。どちらも想定どおりの動きなので、診断は出さない。
- task 49 の `cePlacementStatus: "preview-only"` を外し、注記を CE で使う旨に直した。
- 版: `compact` を v30、`burgage` を v31、`burgage-dense` を v32 にした。

施設のある町（壁あり・川なし、`b2-probe`、大航海時代、`atlantic`）、W5c の前 → 後:

| 町 | 広場の一辺 | 会館 | 市の屋台 | 施設を置けた数 | 建物の割合 |
| --- | --- | --- | --- | --- | --- |
| `compact` 2,000 人 | 30 m | 独立した会館のまま | 3 → 3 | 85/91 → 85/91 | 43% → 43% |
| `compact` 5,000 人 | 48 m | 独立 → 広場 | 6 → 5 | 230/246 → 229/245 | 47% → 47% |
| `compact` 10,000 人 | 64 m | 独立 → 広場（職人組合の会館 2 は独立のまま） | 6 → 6 | 463/495 → 462/494 | 48% → 48% |
| `burgage` 5,000 人 | 48 m | 独立 → 広場 | 6 → 5 | 230/246 → 229/245 | 16% → 16% |
| `burgage` 10,000 人 | 64 m | 独立 → 広場 | 6 → 6 | 427/495 → 426/494 | 17% → 17% |
| `burgage-dense` 5,000 人 | 48 m | 独立 → 広場 | 6 → 5 | 230/246 → 229/245 | 31% → 31% |
| `burgage-dense` 10,000 人 | 64 m | 独立 → 広場 | 6 → 6 | 460/495 → 459/494 | 33% → 33% |

- 施設の数が 1 つ減ったのは、広場の会館を施設の報告から外したため（市民の中心の配置として数える）。ほかの施設は前と同じ数だけ置けた。未収容の住民は 0。
- 3,000 人未満の町（広場 30 m）は、会館（約 17×9 m）が市の通路を塞がずに置ける辺がないので、独立した会館のまま。`burgage`・`burgage-dense` の 2,000 人も同じ。
- 1 つ目の実装は市の通路を考えず、5,000 人以上の町でも市の屋台が 0 になった（`market-unplaced`）。各辺の中央をあけて直した。

確かめたこと:

- [workhomeExteriors3d.test.ts](../../src/city-editor/renderers/vector/workhomeExteriors3d.test.ts) に 2 件足した: `atlantic`・3,500 人（広場 48 m）の `compact` と `burgage-dense` の町で、会館が 1 棟だけ（task 49）、広場の中にあり、屋台と重ならず、屋台が 1 つ以上並び、3D で警告が出ないこと。
- [marketGuildHall.test.ts](../../src/buildings/medieval/marketGuildHall.test.ts) の `cePlacementStatus` の期待値を直した。
- 関連テスト 58 ファイルを実行した。失敗は前からの 3 件（`marketGuildHall.test.ts` の形状の署名、`facilities3d.test.ts`、`houseLod3d.test.ts`）だけ。`tsc --noEmit`・biome・`scripts/lint-architecture.ts` も成功した。

まだ扱っていないこと:

- task 49 の大きさ（17.2×8.9 m）は Codex 版のまま。Thaxted の寸法は、Historic England の登録文が取得できず確かめていない。
- 大きな町（10,000 人以上）の職人組合の会館は、§6.1 の「表の区画の奥」ではなく、今までどおり独立した会館として施設の並びに置く。
- Economy ありの町の会館（`raiseVectorGuilds`）とメッシュありの CE は、W5a と同じく §6.1 の規則を通していない。
- CE の画面での目視はしていない（3D の警告と配置の検査は vitest で確かめた）。
