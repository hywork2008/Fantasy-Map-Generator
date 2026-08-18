# 蒸気機関後の実装計画

## 状態

**実装進行中**。2026-08-18。Phase 0–3 の最小縦切りをコードに入れた。Phase 4（化学・電化）は未着手。

対象は、host 技術グラフの `atmosphericSteamPumping` が State ごとに到達した**あと**に、何をどの順で実装するかである。蒸気船を Shipyard 商品として足すだけでは足りない。鉄道インフラと都市蒸気揚水を同列の第一波とし、その前に工業基盤（Coke / Steel / Machine Parts / 定置機関）を置く。

関連する正本:

| 文書 | 役割 |
| --- | --- |
| [蒸気機関の知識・技術蓄積プロセス設計](./steam-engine-knowledge-accumulation.md) | 鉱山排水用の初期大気圧機関までの知識・試作・設置 |
| [蒸気機関後の工業 Good・市場・後続技術設計](./steam-industrial-goods-and-technology-chain.md) | 中間 Good / 資本 Good / 容量サービスの分類と解禁契約 |
| [技術発展・発見ロードマップ](./technology-development-roadmap.md) §8–9 | 時代帯と後続ノード |
| [都市水利・衛生インフラ設計](./urban-water-and-sanitation-system.md) §6.2 | 蒸気揚水は上水量・到達高度だけを上げ、浄水・下水の代替にしない |
| [調査 CSV](./data/steam-industrial-technology-history.csv) | 1709–1913 の主要マイルストーンと game_output 対応 |

本書は上記を置き換えない。現行コードとの差分を埋め、実装単位（Phase / PR）に落とす。

---

## 1. 結論

蒸気船は一つの枝であり、最初の枝ではない。`atmosphericSteamPumping` の次に実装すべきものは次の順である。

```text
0. 初期蒸気排水を「段階フラグ」から実設備へ（Coal / Tools 消費、設置鉱山だけが効く）
1. 工業基盤: Coke → Steel → Machine Parts → Stationary Steam Engine
2. 同時に見える三つの応用（どれも 1 の機関と部品を消費する）
   ├ 鉄道: Rail + Locomotive + 路線容量 → 都市間輸送・移動の短縮
   ├ 都市揚水: Steam Waterworks → 上水容量と衛生圧力の改善
   └ 蒸気船: Marine Steam Engine + Shipbuilding 船体 → 定時・高容量の水運
3. 機械化繊維（既存 Cloth のレシピ移行）は輸送・揚水と並行可能
4. 化学・電化・石油・内燃機関は第二波。第一波では定義とゲートだけ先置きしてよい
```

蒸気船だけを先に出すと、機関・鋼・部品の供給がなく「カタログに蒸気船があるが誰も造れない」状態になる。鉄道と揚水も同じ部品連鎖を共有するので、基盤を先に実装する方が三枝とも安くなる。

---

## 2. 現行実装との差分

2026-08-18 時点のコードは、設計書の Phase 4 / 工業連鎖より手前で止まっている。

| 層 | 今あるもの | まだないもの |
| --- | --- | --- |
| 技術グラフ | Era 4 前提 4 ノード + `atmosphericSteamPumping`。閾値到達で段階が上がる | `minimumYearsAtPreviousStage`、ExperimentalWorkshop、SteamPumpTrial、SteamInstallation |
| 効果 | `getAtmosphericSteamDrainageBonus` が State 段階から全鉱山へ一律の排水加点 | 設置鉱山だけ、Coal / Tools の継続消費、燃料切れで効果ゼロ |
| UI | Tools → Technologies。蒸気の段階要約あり | 候補鉱山、試作、燃料不足、設置一覧 |
| Good | Coal、Iron Ingot、Tools、Charcoal、Cloth、Copper Ingot、Glass は既存 | Coke、Steel、Machine Parts、Stationary Steam Engine、Rail、Locomotive、Marine Steam Engine、Sulfuric Acid ほか |
| 輸送 | `pack.routes` の roads / trails / searoutes。所要日数は `tradeRouteDuration.ts` / `routeGrade` | railways グループ、路線容量、機関車資産 |
| 都市水利 | `UrbanWaterSystem`、`waterLifting` ストック、`waterLiftingWorks` 事業 | Steam Waterworks、蒸気揚水容量、時代天井を蒸気で超える経路 |
| 造船 | Sloop / Caravel / Galleon。船級は `getMaxShipClassTierForState` | Marine Steam Engine、蒸気船級、石炭補給ゲート |

したがって「蒸気船を足す」作業の前に、少なくとも **実設備化した大気圧機関** と **Steel / Machine Parts / 定置機関** が要る。

---

## 3. 蒸気船以外に実装すべきもの

ユーザーが挙げた鉄道と上水道に加え、同じ基盤から出る必須項目を列挙する。

### 3.1 必ず先に実装する共有基盤

初期大気圧機関は鉱山排水専用であり、機関車や上水ポンプや舶用機関ではない。CSV 行 4・6（ワット復水器 1769、回転機関 1782）が、鉱山の外へ動力を出す転換点である。

| 項目 | 種別 | なぜ必要か |
| --- | --- | --- |
| `condensateEfficiency` / `rotarySteamPower` / `highEfficiencySteamEngine` | 技術ノード | 定置動力・輸送・揚水の前提。大気圧ポンプの数値上位版にしない |
| Coke | 中間 Good | 高温・均質な冶金。初期ポンプの燃料ではない（初期は既存 Coal） |
| Steel | 中間 Good | レール、機関、耐圧部品の材料 |
| Machine Parts | 中間・保守材 | すべての資本財の建設と毎年の保守 |
| Stationary Steam Engine | 資本 Good | 鉱山ポンプの更新、都市揚水、工場動力の設置物。在庫のまま効かない |

### 3.2 第一波の応用（蒸気船と同列）

| 枝 | プレイヤーに見える変化 | 所有 |
| --- | --- | --- |
| **鉄道** | 接続された市場間の貨物所要日数・損失が下がる。連隊・人物の陸上移動も同じ路線を使える。道路キャラバンは残る | 路線・駅は Economy のネットワーク状態。Rail / Locomotive は市場 Good。所要日数は既存 `tradeRouteDuration` が読む |
| **都市蒸気揚水** | 対象 Burg の `serviceWaterCapacity` と飲用水供給が上がり、`healthPressure` が下がる。下水 tier は自動では上がらない | `UrbanWaterSystem` が施設と衛生効果を所有。Economy は機関・石炭・部品の消費だけ |
| **蒸気船** | 石炭補給できる航路で、風待ちに左右されにくい定時・高容量の水運 | 船体は Shipbuilding。`Marine Steam Engine` は Economy。帆船航路は削除しない |

### 3.3 第一波で同時にやってよいが後回し可能なもの

| 項目 | 理由 |
| --- | --- |
| 機械化紡績・力織機 | CSV 行 5・7。既存 Cloth を置き換えずレシピを分ける。都市雇用が変わるので独立して検証できる |
| Precision Instruments / Machine Tools | 後続の高効率機関・製鋼・化学の品質上限。最初は Machine Parts の採用閾値で代用してよい |
| 技術 Overview の拡張 | 設置数、燃料不足、路線キロ、揚水稼働率を同じダイアログへ足す |

### 3.4 第二波（第一波では実装しない）

CSV の後半は、第一波の受け入れを壊さずにゲートだけ先置きする。

| CSV おおよその年 | 技術 | 理由 |
| ---: | --- | --- |
| 1746 / 1842 | 工業硫酸、過リン酸肥料 | 蒸気の必須前提ではない。農業・化学の別連鎖 |
| 1831–1882 | 電磁誘導、電信、発電機、電灯、配電網 | Electricity は在庫 Good にしない。発電・送電容量が別モジュール |
| 1856 | ベッセマー製鋼 | 第一波の Steel は「初期製鋼」。量産製鋼は後続ノード |
| 1859–1876 | 石油掘削、内燃機関 | 蒸気輸送の置換ではなく別動力系統 |
| 1886–1913 | 電解アルミ、合成アンモニア | 安定電力と高圧化学が前提 |

---

## 4. 調査 CSV との対応

[steam-industrial-technology-history.csv](./data/steam-industrial-technology-history.csv) を、実装 Wave に割り当てる。`game_output_category` が capacity service の行は市場在庫にしない。

| CSV id | 年 | technology_id | Wave | 実装メモ |
| ---: | ---: | --- | --- | --- |
| 1 | 1709 | `coalCarbonization` | 1 基盤 | Coke。初期蒸気の前提ではなく後続冶金の前提 |
| 2 | 1712 | `atmosphericSteamPumping` | 0 仕上げ | 既に段階ノードあり。実設備化が残件 |
| 3 | 1746 | `industrialSulfuricAcid` | 2 | 蒸気解禁に依存させない |
| 4 | 1769 | `condensateEfficiency` | 1 基盤 | Stationary Steam Engine + Steam Power 容量 |
| 5 | 1770 | `mechanizedSpinning` | 1 任意 | Spun Yarn + Spinning Frame。Cloth は既存 ID |
| 6 | 1782 | `rotarySteamPower` | 1 基盤 | 工場回転動力。在庫にしない |
| 7 | 1785 | `mechanizedWeaving` | 1 任意 | Power Loom。Steam Power または水力を消費 |
| 8 | 1804 | `steamTransport` | 1 鉄道 | Locomotive の実証。路線網ではない |
| 9 | 1807 | `steamNavigation` / `coastalSteamNavigation` | 1 蒸気船 | 内陸・沿岸の商業運航 |
| 10 / 14 | 1819 / 1838 | `oceanSteamNavigation` | 1 蒸気船（後半） | 外洋は別ノード。1819 は実証、1838 を採用閾値にする |
| 11 | 1825 | `railwayOperations` | 1 鉄道 | Rail + Locomotive + 定時運行記録でサービス容量 |
| 12–13, 19, 21–22 | 1831–1882 | 電化一式 | 2 | Copper Wire / Generator / Electricity 容量 |
| 15 | 1842 | `phosphateFertilizer` | 2 | 硫酸とリン鉱床が揃ってから |
| 16 | 1856 | `modernSteelmaking` | 2 | 第一波 Steel の上位 |
| 17–18, 20 | 1859–1876 | 石油・内燃 | 2 | 蒸気を自動置換しない |
| 23–25 | 1886–1913 | アルミ・アンモニア | 2 | 大口電力と高圧装置 |

---

## 5. 非目標

- 大気圧機関の adopted だけで Coke、鉄道、蒸気船、都市揚水、電力を解禁しない。
- Steam Power / Railway service / Steamship service / Pumped water supply / Electricity を `Market.goods` 在庫にしない。
- Steamship を Economy の通常 Good に複製しない。船体は Shipbuilding のまま。
- 鉄道を既存 roads の見た目差し替えにしない。道路キャラバンは残す。
- 蒸気揚水で下水 tier や `sanitaryEngineering` を自動最大にしない。汚染取水のまま揚水すれば汚染も増える。
- ボイラー圧・シリンダ径・熱効率の連続物理は持たない。
- 歴史年をシミュレーション年に直結させない。到達は知識・在庫・設備・需要で決まる。CSV の年は順序と物語の根拠だけである。

---

## 6. 所有境界

| 項目 | 所有者 | 他層がやってはいけないこと |
| --- | --- | --- |
| 技術定義・段階 | host `technologyDefinitions` / `technologyProgress` | Good 在庫や施設を直接書き換えない |
| 中間・資本 Good、レシピ、世界/State ゲート | Economy | 技術モジュールを動的 ZIP から import しない |
| SteamInstallation（鉱山） | Economy `MineOperation` 近傍 | State 全体の鉱産にグローバル倍率を掛けない |
| Railway 路線・駅・月次容量 | Economy のネットワーク状態 | `pack.routes` を Renderer から増やさない |
| 陸上所要日数 | 既存 `tradeRouteDuration.ts` / `routeGrade` | 鉄道専用の第二の距離計算を増やさない。倍率または別セグメント種別を足す |
| Steam Waterworks・取水・汚染・衛生 | `UrbanWaterSystem` | 揚水を汎用生産倍率にしない |
| 船体・船級・建造キュー・損耗 | Shipbuilding | Marine Steam Engine 在庫を船体と二重計上しない |
| 描画 | Renderer（SVG / WebGL） | pack / 経済状態を書かない。鉄道は WebGL 管理レイヤ方針に載せる |
| UI | React Overview | 未在庫の工業 Good を通常市場一覧へ出さない |

`pack.routes` に `group: "railways"` を足す場合、作成は Editor / Generator、描画は Renderer、所要時間は Economy が読む。既存 roads / trails / searoutes と同じ契約にする。

---

## 7. 鉄道

### 7.1 なぜ機関車 Good だけでは足りないか

CSV 行 8 は 1804 年の実証走行、行 11 は 1825 年の営業線である。機関車をカタログに足しただけでは都市間は速くならない。必要なのは次の三点である。

1. **材料** `Rail`（Steel + Machine Parts + Wood）
2. **牽引資産** `Locomotive`（および必要なら Freight Wagon）
3. **ネットワーク** 市場（または Burg）間の鉄道セグメントと、毎月の Coal・部品・整備

`railwayOperations` の adopted は、接続された区間、石炭補給、数か月の定時運行記録を要求する。一両の試作機関車では demonstrated までとする。

### 7.2 既存系への接続

| 既存 | 鉄道が入ったあとの読み方 |
| --- | --- |
| `pack.routes` | `group: "railways"` を追加。建設は State / 市場投資。国際路線は既存の国際ルート方針に従う |
| `tradeRouteDuration.ts` | 鉄道セグメントは陸路グレードより短い日数。Coal 不足の月は通常道路へフォールバックするか、容量ゼロで遅延する |
| キャラバン / 隊商 | 削除しない。高容量・短時間の選択経路になる |
| 連隊移動 `regimentMovement` | 自国または通行可能な鉄道セルでは行軍日数を短くする。敵地の未占領路線は使えない |
| Technology Overview | 国家ごとの路線キロ、稼働機関車、石炭不足を表示する |

勾配のきついセルは建設費を上げ、既存の `landRouteElevationAversion` と同じ思想で谷を選ばせる。峠に線路を引けないわけではないが、Steel と予算を多く使う。

### 7.3 容量と優先

Railway service はその月の供給（機関車、石炭、整備）から容量を出す。超過時の優先は工業連鎖設計 §5.3 に従う。軍需と鉱石が旅客より先でよいが、旅客をゼロにして都市成長だけを加速する隠し通路にはしない。

---

## 8. 都市蒸気揚水と衛生

### 8.1 非対称性を守る

[都市水利設計 §6.1–6.2](./urban-water-and-sanitation-system.md#61-上水道との非対称性) のとおり、上水は「高さ・量・場所へ運ぶ」連鎖であり、下水は自然流下で安く始められる。蒸気ポンプは上水側にだけ効く。

設置条件（すべて必須）:

- State が `municipalSteamPumping` を少なくとも demonstrated
- 対象 Burg に `urbanWaterworks` 相当の既存水利（現行では `UrbanWaterSystem` と `waterLifting`）
- 到達可能な水源と取水権
- 配水（貯水・管路）の最低限
- 市場から Stationary Steam Engine、Steel / Iron、Machine Parts、Tools を消費
- 運転年は Coal、Machine Parts、整備労働、維持予算

効果（許可するもの）:

- `serviceWaterCapacity` と飲用供給の不足を減らす
- `waterLifting` の期間天井を、蒸気採用 State の該当 Burg だけ押し上げる（`waterTechCeilings` の期間上限を世界一律に壊さない）
- 供給改善を通じて `healthPressure` を下げる
- 高所・城壁内への給水を可能にし、旱魃シグナル `droughtService` への耐性を上げる

効果（禁止するもの）:

- `tier` を 5 へ飛ばす
- `sanitaryEngineering` や `hasSeparateWastewaterRoute` を自動 true
- 汚染取水のまま飲用水を「清潔」とみなす。揚水量が増えれば汚染到達も増える
- State 全 Burg への一律給水ボーナス

### 8.2 既存都市水利への最小差分

`UrbanWaterSystem` に Steam Waterworks の小さな設置記録を足す。

```ts
interface SteamWaterworks {
  burgId: number;
  active: boolean;
  engines: number;
  condition: number; // 0..1
  lastFueledYear: number;
  annualCoalUsed: number;
}
```

月次または年次で Coal / 部品が足りなければ `active` を落とし、容量ボーナスを消す。`waterLiftingWorks` 事業は中世の水車・人力揚水のまま残し、蒸気は別資産とする。

Burg Editor の Water タブと、Technologies Overview に「揚水稼働 / 石炭不足 / 飲用改善」を出す。地図レイヤは必須にしない。

---

## 9. 蒸気船（本計画での位置）

ユーザー要望どおり第一波に含めるが、Shipyard の完成 Good を増やす作業だけにはしない。

1. Economy に `Marine Steam Engine` を資本 Good として追加する。
2. Shipbuilding は既存船体に機関を載せる改装キュー、または蒸気船級の建造キューを持つ。
3. 運航は寄港地市場の Coal を消費する。補給できない外洋区間は `oceanSteamNavigation` が adopted になるまで定期航路にしない。
4. 帆船 searoute は残す。蒸気は風向耐性と容量の選択肢である。
5. 1819 Savannah は demonstrated、1838 Great Western 相当を adopted の目安とする（CSV 行 10・14）。

詳細な船級表は Shipbuilding 側の後続メモでよい。本計画は「機関は Economy、船体は Shipbuilding、航路サービスは容量」だけを固定する。

---

## 10. 実装 Phase

各 Phase は独立してマージできる大きさにする。後の Phase は前の受け入れを壊さない。

### Phase 0 — 初期蒸気を実体化する

大気圧機関を「Technologies の段階」から鉱山設備へ落す。

- `SteamPumpTrial` / `SteamInstallation` の最小記録
- 稼働中だけ対象 `MineOperation` の排水を改善
- Coal / Iron Ingot / Tools / 保守の継続消費。不足なら効果なし
- 埋蔵は回復せず、採掘が増えれば枯渇も速い
- Technologies Overview に設置鉱山と燃料不足を出す

依存: 現行 `atmosphericSteamPumping` ノード。  
受け入れ: [蒸気機関知識蓄積 §10](./steam-engine-knowledge-accumulation.md#10-受け入れ条件とテスト)。

### Phase 1 — Good ゲートの共通化

- 工業 Good を固定 ID でカタログ登録し、技術条件を満たすまで製造・交易候補・通常市場 UI から隠す
- `isIndustrialGoodKnownInWorld` / `isGoodManufacturableInState` / `canInstallCapitalGoodAtMarket`
- 在庫ゼロの Good を需要だけで生成しない

依存: 既存の火薬世界ゲートと Liquor の State 製造ゲート。

### Phase 2 — 工業基盤

- 技術: `coalCarbonization`, `condensateEfficiency`, `rotarySteamPower`, `standardMachineWorks`, `highEfficiencySteamEngine`
- Good: Coke、Steel、Machine Parts、Stationary Steam Engine
- 小さな縦切り施設: Coke oven、Steelworks、MachineWorks
- Steam Power を地点容量として導入（在庫にしない）
- 初期大気圧ポンプは引き続き生 Coal で動く。Coke は製鋼以後

依存: Phase 0–1。

### Phase 3A — 鉄道

- 技術: `steamTransport` → `railEngineering` → `railwayOperations`
- Good: Rail、Locomotive（Freight Wagon は採用時でよい）
- `pack.routes` に railways。建設は Steel / Rail / 労働 / Treasury
- `tradeRouteDuration` と連隊移動が稼働中の自国路線を読む
- 石炭切れでその月の Railway service が落ち、道路へ戻る
- 地図: WebGL / SVG の路線描画。hybrid 方針に載せる

依存: Phase 2。

### Phase 3B — 都市蒸気揚水

- 技術: `municipalSteamPumping`（必要なら `steamWaterworks` を設置段階として分離）
- `SteamWaterworks` を `UrbanWaterSystem` に追加
- Stationary Steam Engine を建設時に消費
- `serviceWaterCapacity` / 飲用 / `healthPressure` のみ改善
- 期間別 `waterLifting` 天井は、設置 Burg への加算で超える

依存: Phase 2 と現行都市水利。3A と並行可。

### Phase 3C — 蒸気船

- 技術: `marineSteamEngineering` → `coastalSteamNavigation` → `oceanSteamNavigation`
- Good: Marine Steam Engine
- Shipbuilding: 改装 / 蒸気船級、寄港地 Coal ゲート
- 帆船航路は残す

依存: Phase 2 と Shipbuilding。3A / 3B と並行可。

### Phase 3D — 機械化繊維（任意・並行）

- `mechanizedSpinning` / `mechanizedWeaving`
- Spun Yarn、Spinning Frame、Power Loom
- 既存 Cloth ID を維持し、設備市場だけレシピを切り替える

依存: Phase 2。

### Phase 4 — 化学・電化（第二波）

CSV 行 3, 12–25。Sulfuric Acid、Phosphate Fertilizer、Copper Wire、Generator、Power Grid、電解アルミ、合成アンモニア。Electricity は容量サービス。第一波の受け入れを変えない。

---

## 11. UI と検証

プレイヤーが「できた」と分かる面を、段階と同時に出す。

| 面 | 出すもの |
| --- | --- |
| Tools → Technologies | 新ノードの段階、発見年。蒸気要約に加えて「定置機関 / 鉄道 km / 揚水稼働 / 蒸気船」 |
| Mineral Overview | 蒸気ポンプ設置鉱山の排水・産出 |
| Burg Editor Water | Steam Waterworks の有無、石炭、飲用改善 |
| Market / Goods | 技術ゲート付き工業 Good。未解禁は隠す |
| Shipyards / Vessel assets | 蒸気改装と石炭航続 |
| 地図 | 鉄道路線。蒸気船は既存船体アイコンの差分で足りる |

受け入れの自動テストは、決定的な年次進行、Coal 不足での停止、セーブ互換（新配列は空で正規化）、既存 Cloth / Coal / Iron Ingot ID の不変を最低限にする。

ブラウザ確認は、Technologies で段階が変わり、対象鉱山・対象 Burg・対象航路だけが効き、無関係な国家が一律に速くならないことを見る。

---

## 12. Key Decisions

1. **蒸気船は第一波の一枝であり、最初の枝ではない。** 共有する Steel / Machine Parts / 定置機関を先に実装する。
2. **鉄道と都市揚水を蒸気船と同列の第一波とする。** ユーザーが挙げた「都市間の移動・輸送」と「上水による衛生」を、カタログ追加だけで終わらせない。
3. **初期大気圧機関を実設備化してから後続を足す。** 段階フラグのまま機関車や上水を足すと、効果の所有境界が崩れる。
4. **容量サービスは在庫 Good にしない。** Steam Power、Railway service、Steamship service、Pumped water supply は設備・燃料・労働からその期の容量を出す。
5. **鉄道は新 route グループであり、道路の置換ではない。** 所要日数は既存 duration 経路へ載せる。
6. **揚水は上水の量と高さだけを改善する。** 下水分離・浄水・State 全土ボーナスは禁止。
7. **CSV の西暦は順序の根拠であり、シミュレーション時計ではない。** 外洋蒸気は 1819 実証 / 1838 採用の二段にする。
8. **化学・電化・石油・内燃は第二波。** 第一波のゲートを壊さない。
9. **Cloth / Coal / Iron Ingot / Tools の既存 ID を変えない。** 機械化はレシピと設備で表す。

---

## 13. 受け入れ条件

- `atmosphericSteamPumping` adopted だけでは Coke、鉄道、蒸気船、都市揚水、電力が出ない。
- 初期ポンプは設置鉱山だけで、Coal / Tools 不足なら排水ボーナスがない。
- Steel を知っている State でも、Coke または Iron の輸送がなければ Machine Parts が始まらない。
- 稼働中の自国鉄道だけが交易日数と行軍を短くする。石炭切れの月は道路並みに戻る。
- Steam Waterworks がある Burg だけ飲用・`healthPressure` が改善する。下水 tier は変わらない。汚染取水では汚染も増える。
- 蒸気船は機関在庫と船体資産が分かれ、寄港地 Coal なしでは定期外洋運航しない。
- Electricity / Steam Power / Railway service が `Market.goods` に現れない。
- 旧セーブは新施設配列を空として読み、既存火薬・大航海ノードを変えない。

---

## 14. Open Questions

実装に入る前に決めるとよい項目。未決のまま Phase 0–2 は始められる。

1. **鉄道路線の地形拘束をどこまで厳密にするか。** 既存道路に沿う安価な敷設を許すか、独立した線形だけにするか。
2. **旅客鉄道を人口移動（megacity 労働移動）に接続するか。** 第一波は貨物日数だけにし、人口移動は後続でもよい。
3. **蒸気揚水の衛生効果を `healthPressure` だけにするか、疫病・乳児死亡にも直接触るか。** 後者は人口動態との二重計上に注意する。
4. **第一波の Steel を「初期製鋼」として別 ID にするか、後で Bessemer が同じ Steel Good の製法ノードになるか。** 既存設計は後者（同じ Steel、上位ノードで量産）。

---

## 15. PR Plan

| PR | 題 | 主な対象 | 依存 |
| --- | --- | --- | --- |
| 0 | 初期蒸気ポンプの実体化 | `technologyProgress.ts`、MineOperation、Technologies Overview | なし |
| 1 | 工業 Good ゲート | `goods-generator.ts`、製造/市場 UI | なし（0 と並行可） |
| 2 | Coke / Steel / Machine Parts / Stationary Steam Engine | Economy 生産・施設、技術ノード Era 5 後半 | 1、推奨 0 |
| 3a | 鉄道路線と Railway service | `routes-generator`、`tradeRouteDuration`、連隊移動、描画 | 2 |
| 3b | Steam Waterworks | `urbanWaterSystem` / `urbanWaterTech`、Burg Water タブ | 2 |
| 3c | Marine Steam Engine と蒸気船級 | Economy Good、Shipbuilding キュー | 2 |
| 3d | 機械化繊維 | Cloth レシピ、雇用 | 2 |
| 4 | 化学・電化の定義とゲート | カタログと技術ノード。効果は最小 | 2 |

3a / 3b / 3c は 2 のあと並行できる。ユーザーの「蒸気船以外」への直接の答えは **3a と 3b** である。
