# 交易貨物の容量・多様性・輸送資産 実装計画

## 0. 目的と採用決定

Trade Animation の貨物が高価値・小嵩品へ過度に集中する問題を、輸送可能な容量、貨物の容量占有、
および積載方針として明示的にモデル化する。Trade Details では、個々の貨物だけでなく、船・馬車
（または荷役動物）ごとの積載済み容量と空き容量を確認可能にする。

本計画では、次をすべて採用する。

1. Good に容量占有値を追加する。
2. 船級、馬車、および役畜に輸送容量を追加する。
3. Deal を容量制約の下で便（shipment / caravan）へ分割・積載する。
4. 高額品のみが積載枠を占有しないための、多様性を明示した積載方針を導入する。
5. Trade Details に貨物別占有量、輸送手段、使用量、空き量、積載率を表示する。
6. 馬車・荷車・荷役具を、将来は商人所有の耐久輸送資産として生産・更新可能にする。

容量制約だけでは多様性は生まれない。利益密度だけで残容量を埋めると、高価値・小嵩品への集中を
むしろ強める。そのため、容量計算と貨物選定を別の責務にし、選定側に品目多様性・需要充足の規則を
持たせる。

## 1. 現状と制約

- `Good.trade.weight` / `bulk` は 1〜5 の相対評価であり、物理容積ではない。現在は価値密度、
  日数上限、採算ペナルティにだけ使われる。
- `Caravan` は payload、総 units、総 value、経路、移動進捗を持つが、輸送手段・積載上限・
  使用容量を持たない。`draftAnimalId` は現在全 Caravan が horse であり、水路では船の絵を
  描画するだけで船体を割り当てない。
- `ShipClassDefinition` は技術・建造点のみで、cargo capacity を持たない。Shipbuilding の船体と
  Economy の Caravan も未接続である。
- 市場間 Deal は出発時に輸出元在庫を減らし、到着時に輸入先在庫へ加える。容量導入後も、この
  在庫の正本性と輸送中在庫の分離を壊してはならない。
- Economy は拡張所有の状態・生成器・React UI を持つ。容量選定は Generator、Trade Details は
  Renderer/UI の読み取り専用表示に留める。

## 2. 設計原則

### 2.1 単位は実 m³ ではなく `cargoSlots`

最初の実装単位は実世界の立方メートルでなく、ゲーム内の整数または小数の `cargoSlots` とする。
Goods の既存 `unit` は "barrel" や "pile" など抽象度が異なるため、m³ を直接導入すると生産量・
価格・人口ポイントとの尺度調整が必要になる。`cargoSlotsPerUnit` はその変換を後回しにしつつ、
同一便の相対的な容積占有と空き率を正確に表せる。

`bulk` は削除しない。既存の交易採算・到達日数の挙動を保つための性質として残し、新しい
`cargoSlotsPerUnit` を物理的な積載計算の唯一の入力にする。初期値は `bulk` と `unit` を基に
カタログへ明示的に割り当て、移行後に `bulk` から実行時推測しない。

### 2.2 容積と牽引力を分離する

船と馬車は荷室の `cargoCapacitySlots` を持つ。一方、役畜は荷室を持つとは限らないため、荷車を
牽く動物には `towCapacitySlots`、駄載動物には `cargoCapacitySlots` を持たせる。

```ts
type CargoCapacity = {
  cargoCapacitySlots: number;
};

type DraftAnimalType = {
  id: string;
  speedMultiplier: number;
  towCapacitySlots: number;
  cargoCapacitySlots?: number; // pack animal のみ
};

type LandTransportDefinition = {
  id: string;
  cargoCapacitySlots: number; // 荷台・箱の容積
  requiredDraftAnimals: number;
};
```

荷車 1 台の実効容量は、`min(荷台容量, 役畜頭数 × towCapacitySlots)` とする。これにより、
「大型荷車に弱い役畜を 1 頭だけ付ける」構成を正しく制限できる。荷駄のような荷車なし輸送は、
役畜の `cargoCapacitySlots` を使う。

### 2.3 混合ルートは区間別に扱う

`land` と `water` を含む経路では、同一の貨物が港で積み替わる。便全体の単一 capacity ではなく、
陸上 convoy と水上 ship allocation を別々に保存する。Trade Details は便全体の要約と、各輸送区間の
`used / capacity / free / utilization` を表示する。貨物量は各区間で同じでも、利用する輸送資産と
空き率は異なり得る。

### 2.4 供給と積載を二重に減らさない

Deal 作成時点で輸出元 stock は控除済みである。積載器は Deal の未積載残量だけを分割し、再度市場
stock を控除してはならない。未出発の貨物は `loading` shipment として保存し、取消・破棄・旧セーブ
移行時にだけ、明確な精算規則を通して市場在庫へ戻す。

## 3. データモデル

### 3.1 Good の貨物プロファイル

`goodsGeneratorTypes.ts` に追加する。

```ts
type GoodCargoProfile = {
  cargoSlotsPerUnit: number;
  handlingClass: "loose" | "barreled" | "crated" | "fragile" | "live";
};

interface Good {
  // existing fields
  cargo: GoodCargoProfile;
}
```

- 初期カタログは全 Good に明示的な `cargo` を持たせる。未設定 Good は保存互換時だけ
  `bulk` から安全な既定値を導出し、ロード後または次のカタログ保存で明示値へ正規化する。
- `handlingClass` は Phase 1 では UI と将来の積卸し時間用。容量補正や破損率へ直ちに接続しない。
- 貨物行は `occupiedSlots = units * cargoSlotsPerUnit` を保存するのではなく、Good 定義から再計算する。
  ただし shipment の履歴再現が必要になった段階では、出航時の `cargoSlotsPerUnit` snapshot を payload
  に持たせる。

### 3.2 輸送手段カタログ

新しい Economy 内の純粋なカタログとして、以下を置く。

- `generators/tradeTransportTypes.ts`: transport / allocation / shipment の型
- `generators/tradeTransportCatalog.ts`: 馬車、荷車、荷駄、船級の容量定義
- `generators/tradeCargo.ts`: 容量計算、積載選定、分割の純粋関数

船級の `cargoCapacitySlots` は共有 `ShipClassDefinition` に追加する。初期値は Sloop / Caravel /
Galleon の役割差が明瞭になる比率で設定するが、現実の載貨トン数を直接転記しない。陸上用は
`Cart`、`Wagon`、`Pack train` を別定義にし、各 `DraftAnimalType` には horse / ox の牽引容量を追加する。

### 3.3 Caravan から Shipment への拡張

既存の `Caravan` を画面上の移動オブジェクトとして維持しつつ、以下を追加する。

```ts
type CargoPayloadItem = {
  goodId: number;
  dealId: number;
  units: number;
  value: number;
  cargoSlotsPerUnit: number;
};

type TransportAllocation = {
  mode: "land" | "water";
  transportId: string;
  unitCount: number;
  capacitySlots: number;
  usedSlots: number;
};

type Caravan = {
  // existing identity, route, progress and state
  payload: CargoPayloadItem[];
  transportAllocations: TransportAllocation[];
  state: "loading" | "transit" | "arrived" | "lost";
};
```

Deal には後方互換を保った `remainingUnits` を導入する。既存 `units` は契約・発生総量として残し、複数便へ
分割した量は `remainingUnits` から控除する。すべて積まれた時だけ `spawned = true` とする。これにより、
容量不足の貨物を次便へ繰り越せる。

## 4. 積載・多様性アルゴリズム

### 4.1 便の形成

1. 同じ seller / buyer / sellerType / buyerType の未積載 Deal を route bundle として集める。
2. 経路が land-only、water-only、mixed のどれかを判定し、必要な transport allocation を作る。
3. 便が積める容量を算出する。mixed route は各区間で必要な容量を満たす最小の資産組合せを使う。
4. `loadCargoManifest` が Deal を部分積載して payload を作る。
5. 残量がある場合は `loading` 便に保持し、出港周期または満載時に出発させる。

容量によって一つの Deal が複数便に分かれることは正常動作とする。出荷量を切り捨てたり、容量を超えた
まま一便に積んだりしない。

### 4.2 多様性を保つ選定規則

容量内の最適化を純粋関数に隔離し、初期版は次の二段階にする。

1. **多様性パス**: 各 eligible Good を、少なくとも一つの最小積載単位まで round-robin で積む。
   `maxDistinctGoods`、最小積載量、残容量を超えないことを守る。
2. **充填パス**: 残容量を、輸入側不足度、利益、価値密度、既に積んだ同品目の比率から計算する
   `cargoPriority` の順に積む。同一 Good が総容量の `maxSingleGoodShare` を超える場合は、他に
   eligible な Good が残る限り保留する。

初期既定値は設定として公開せず、名前付き定数とテストで調整可能にする。確認後に Trade Animation
設定へ「cargo diversity」を追加できる。容量を埋められないことは失敗ではない。成立 Deal が少ない便は、
高額品を少量だけ積み、空き率をそのまま表示する。

### 4.3 採算の扱い

現行の「高価値貨物が固定維持費を負担し、低収益貨物が同乗できる」方針は維持する。ただし運賃・
維持費の最終配賦は価格や units ではなく、`occupiedSlots` を基準にする。各 payload の固定費負担を
記録するのは後続フェーズとし、Phase 1 は既存の route viability 判定を保持して貨物量だけを容量で分割する。

## 5. 商人用の馬車・荷役具・役畜

### 5.1 採用方針

馬車、荷車、荷駄具は **消費される通常 Good ではなく、商人が保有する耐久輸送資産** として導入する。
生産にはレシピを使うが、完成後は各出荷で市場在庫から消費しない。

理由は次の通り。

- 馬車や荷役具は一回の輸送でなくならず、Goods の通常売買へ置くと毎便で再購入・消滅する不自然な
  モデルになる。
- `cargoCapacity` を持つのは役畜そのものではなく、基本的には「荷台 + 牽引可能量」の組合せである。
- 現在のプレイヤーには個々の商人・商会へ大工仕事を発注し、完成品を所有権付きで割り当てる一般的な
  発注 UI / 資産台帳がない。先にこれを作らず Goods だけ追加すると、交易全体が在庫不足で停止しやすい。

### 5.2 段階的な導入

**Phase 1–3: 抽象 convoy**

- 市場規模と経路種別から、利用可能な馬車・船の tier を選ぶ。
- 容量・多様性・Trade Details を先に完成させる。
- 市場在庫に Wagon Good が無くても通常交易は停止しない。

**Phase 4: 製造可能な輸送資産**

- `Cart`, `Wagon`, `Pack saddle` をレシピ（Wood、Iron Ingot、Leather など）で生産できる耐久資産にする。
- `MarketTransportFleet` または merchant organization 所有の台帳を Economy extension slice に置く。
- 大工は製造の担い手として生産サイクルに参加し、完成物は通常 Good の stock へ置かず、商人資産台帳へ
  入れる。
- 馬・牛・ラクダ等は、生体 Good の単純な消費ではなく、商人が割り当てた役畜資産または市場圏の
  利用可能頭数として扱う。病気・死亡・飼料・繁殖は別フェーズである。

**Phase 5: プレイヤー発注**

- プレイヤーが特定市場の大工へ発注する機能は、merchant organization、発注、支払、納期、所有者、
  完成資産の割当を持つ汎用 contract system を導入してから実装する。
- UI は「商会へ wagon を N 台発注」とし、完成した資産をその市場の fleet へ入れる。個々の Caravan
  へ直接 Good を渡す UI にはしない。

この順序により、「大工に頼む」ゲーム性を将来採用しつつ、容量・多様性という現在の目的をその未実装の
経済ループに依存させない。

## 6. UI / 表示

### 6.1 Trade Details

貨物テーブルに次を追加する。

- Unit volume (`cargoSlotsPerUnit`)
- Occupied volume (`units × cargoSlotsPerUnit`)
- 便全体に占める比率

フッターに次を追加する。

- Land: `Cart/Wagon/Pack train × count — used / capacity slots — free slots — utilization %`
- Water: `Sloop/Caravel/Galleon × count — used / capacity slots — free slots — utilization %`
- mixed route は land / water を別行で表示する。

空き率は `max(0, 1 - usedSlots / capacitySlots)` で求める。payload が無い、または旧 Caravan で allocation
が無い場合は `Not recorded (legacy caravan)` と表示し、推測表示はしない。

### 6.2 Trade Animation

- loading 状態は港・市場で停止表示または非表示にし、transit のみを経路上へ描画する。
- SVG と WebGL hybrid の双方で同一 `Caravan.transportAllocations` を読む。描画器は capacity・payload を
  変更しない。
- 船と馬車のアイコン選択は既存の route segment 判定を維持する。将来、割当 tier に応じたアイコン差替えを
  行う場合も renderer 層だけで実装する。

## 7. 保存・移行・互換性

1. 旧 Good は初期対応表から `cargo` を補う。編集済み Good で値が不明な場合は `bulk` に基づく暫定値を
   設定し、次回保存時に明示値として保存する。
2. 旧 Caravan は `transportAllocations` を持たないまま読めるようにする。進行中 Caravan の容量を後から
   再配分して payload を変更しない。
3. 新しい Shipment / loading / Deal.remainingUnits は extension slice に保存する。
4. 旧 `spawned: true` Deal は完積載として扱い、二重出荷しない。
5. Extension 無効化時は、未出発貨物を市場在庫へ戻すか、現行と同じ破棄規則を明示して一貫して適用する。

## 8. 実装フェーズと完了条件

### Phase A — 観測と基準値

- 固定 seed ごとに Deal / Caravan / 品目数 / 高額品シェア / 平均積載率を出す純粋な診断器を追加する。
- 容量なしの現行結果を snapshot として保存する。
- 完了条件: 同一 seed の既存経済結果を再現し、偏りを数値化できる。

### Phase B — 貨物・輸送容量の型とカタログ

- Good cargo profile、船級 cargo capacity、馬車・役畜容量を追加する。
- `bulk` と cargo slots の責務を分離する。
- 完了条件: 全 default Good と全輸送定義が正の有限容量を持つ。Shipbuilding の既存 tier / port capacity
  テストが変わらず通る。

### Phase C — 容量計算と分割積載

- `loadCargoManifest`、transport allocation、partial Deal、loading 状態を導入する。
- 供給在庫を二重に減らさず、分割貨物の到着合計が Deal 総量と一致するようにする。
- 完了条件: payload の used slots が各 allocation capacity 以下、全出荷量と到着量が保存される。

### Phase D — 多様性方針と採算配賦の準備

- 多様性パス、充填パス、同一品目シェア上限を導入する。
- 高価値品だけの候補しかない場合はそのまま積み、候補が複数ある場合だけ多様性規則を適用する。
- 完了条件: 固定 fixture で候補が複数なら複数品目が積載され、容量超過も総量消失もない。

### Phase E — Trade Details と描画

- Zustand state、controller、React dialog へ容量の表示値を追加する。
- SVG / WebGL の picking から同じ Details を開き、loading / transit の表示を整合させる。
- 完了条件: unit volume、occupied、free、utilization を UI と state assertion の双方で確認できる。

### Phase F — 商人輸送資産と製造

- 市場または商会の transport fleet を実装する。
- Cart / Wagon / Pack saddle を耐久製造資産として大工生産へ接続する。
- 完了条件: 資産不足時は便が待機または小型化し、資産は到着後に再利用され、各輸送で消滅しない。

### Phase G — プレイヤー発注

- merchant contract と資産割当 UI を導入する。
- 完了条件: プレイヤーが市場・数量・予算を指定して発注し、完成資産が指定 fleet の容量を増やす。

## 9. テスト計画

- Unit: `cargoSlotsPerUnit`、馬車と役畜の `min` 容量、船級容量、混合ルートの区間別 allocation。
- Unit: 部分積載、残 Deal、複数便、到着合計、loss 時の在庫・契約整合性。
- Unit: 多様性パスが複数候補を確保し、候補が一品目なら抑制しないこと。
- Unit: 高額小嵩品が優先されても、`maxSingleGoodShare` と残容量を超えないこと。
- Integration: 生産 → Market stock → Deal → loading → transit → arrival の保存・読込。
- UI: Trade Details の容量列、区間別 summary、legacy 表示。
- E2E: SVG と `webglHybrid` を明示的に固定し、Caravan click / pick から同一 Details が開くこと。
- Regression: Economy 無効時、旧セーブ、Shipbuilding の船級・港湾収容力、Trade Animation の既存移動速度。

## 10. 非目標

- Phase A〜E で実世界の重量、容積、喫水、道路耐荷重、役畜の飼料消費を厳密に再現しない。
- 既存の船体個体を直ちにすべて Economy の商船として割り当てない。資産不足・所有権・帰港・予約は
  Phase F で導入する。
- 容量導入だけを理由に、既存の価値密度・日数・腐敗・治安の取引可否規則を撤廃しない。
