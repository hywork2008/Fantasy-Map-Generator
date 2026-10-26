# Encyclopedia — 時間軸つき百科辞書・ヘルプ

| 項目 | 内容 |
| :--- | :--- |
| Status | 2026-10-16 起票。**C0(骨格)実装済み**(2026-10-16)。C1 以降は未実装 |
| Parent | なし(FMG 全体のヘルプ/辞書基盤) |
| Related | [`world-history-depth.md`](./world-history-depth.md) §4 Layer B(`pack.chronicle`)、[`diplomacy-history.md`](./diplomacy-history.md)、[`technology-development-roadmap.md`](./technology-development-roadmap.md)、[`earth-geography-heightmaps.md`](./earth-geography-heightmaps.md)、[`data/steam-industrial-technology-history.csv`](./data/steam-industrial-technology-history.csv)、[`../world/help/README.md`](../world/help/README.md) |
| 参考画像 | `temp/800.grocery/`(関ヶ原布陣図、WWII 欧州戦線・太平洋戦線)。表現様式の参考のみで、収録対象ではない(§11) |

---

## 0. 結論

FMG に **Encyclopedia** という1つのダイアログを追加する。中身は「項目(Entry)」と「年表再生(Timeline)」の2本柱で、扱う題材は3種類ある。

| 題材 | 例 | データの出どころ |
| :--- | :--- | :--- |
| **H: 史実** | ニューコメン機関(1712, イングランド, ニューコメン)、カンナエ(前216)、ヘイスティングズ(1066) | リポジトリ同梱のキュレーション済みデータ(CSV/JSON) |
| **W: この世界の出来事** | 生成された戦争、包囲戦、技術の発見・実演・普及、人物の即位・戦死 | 実行中の `pack` / technology state / characters から**その場で導出** |
| **F: 機能・ルール** | Cost of Living、通貨、Relations history の読み方、橋の斜角上限 | i18n 文字列 + Markdown |

設計の要点は3つ。

1. **項目は全部同じ形(`EncyclopediaEntry`)にする。** 史実・世界内・機能説明が同じ検索・同じリンク記法(`[[tech:atmosphericSteamPumping]]`)・同じ詳細ペインに乗る。「全機能・全事象の辞書」にするための前提。
2. **世界内の項目は保存しない。** Provider がライブデータから毎回組み立てる。セーブ形式を増やさず、データとの食い違いも起きない。保存が要るのは「起きた事実の記録」だけで、それは Layer B の `pack.chronicle` の責務であり Encyclopedia 側では持たない。
3. **年表再生は「地図アダプタ」で地図と切り離す。** 世界内の戦争は FMG 地図上に(既存の `drawHistoryArrows` を一般化して)描く。史実は緯度経度で記述し、Earth region の地図が読み込まれていればその上に、そうでなければ Encyclopedia 内の小地図(インセット)に描く。同じ再生エンジン・同じオーバーレイ部品を使う。

史実 H と世界内 W は**同じ技術 id で相互リンク**する。Technology Overview で「蒸気ポンプ: 自国 adopted 1123年」を見ている人が、そのまま「史実では 1712年、ダドリー城近くの炭鉱でニューコメンが…」に飛べる。これがゲームを遊びながら歴史を学べる中心の導線になる。

---

## 1. 現状の資産(再利用するもの)

| 資産 | 場所 | Encyclopedia での使い道 |
| :--- | :--- | :--- |
| 戦争・包囲の年代記 | `pack.states[0].diplomacy`(`ChronicleEvent` の入れ子配列) | W の戦争項目・年表の元データ |
| 年代記ダイアログ | [DiplomacyHistoryDialog.tsx](/src/ui/dialogs/DiplomacyHistoryDialog.tsx) | 行ホバー → 矢印強調、Details ボタン → War Details |
| 経路矢印の描画 | [diplomacy-history-renderer.ts](/src/controllers/diplomacy-history-renderer.ts) `drawHistoryArrows` / `highlightHistoryArrow` | 年表再生のオーバーレイ部品に一般化 |
| 戦争詳細 | `WarDetails` / `WarParticipant`(兵力 `forces`、誓約、通過方法)、[WarDetailsDialog.tsx](/src/ui/dialogs/WarDetailsDialog.tsx) | 参戦国・兵力・指揮官の表示。キャラクター詳細へのリンクは既にある |
| 経路計算 | `services/warRouteFinder.ts` | 部隊移動の線 |
| 技術進捗 | `TechnologyProgress`(`discoveredYear`/`demonstratedYear`/`adoptedYear`/`diffusion`)、[technologyOverview.ts](/src/generators/technologyOverview.ts) | W の技術項目と「発明の伝播」年表 |
| 技術定義 | [technologyDefinitions.ts](/src/generators/technologyDefinitions.ts)(`id`/`label`/`era`/`prerequisites`) | H と W を結ぶキー |
| 史実の技術年表 | [steam-industrial-technology-history.csv](./data/steam-industrial-technology-history.csv)(25行、`technology_id` 列あり、出典 URL あり) | H 技術項目の最初の投入データ |
| Cost of Living 等 | [CustomAboutContent.tsx](/src/ui/components/tabs/CustomAboutContent.tsx) + `en.json`/`ja.json` の `about.*` | F 項目に移設(About タブからはリンクで残す) |
| 世界ヘルプ文書 | [docs/world/help/](../world/help/) | F/世界設定項目の Markdown 本文 |
| Earth region の座標系 | `earthConfig.ts` の `mapCoordinates`(`latN`/`latT`/`lonW`/`lonT`、等距円筒)、`getEarthCoordinatesAtMapPoint` | 史実の緯度経度を FMG 地図座標へ射影 |

### 1.1 足りないもの(この設計で埋める/他設計に依存するもの)

| 不足 | 影響 | 対応 |
| :--- | :--- | :--- |
| 年代記が `yearsAgo` 相対年・英語 `rawText` 固定・`states[0].diplomacy` 間借り | 年表の時間軸にそのまま載らない | **`world-history-depth.md` Layer B に依存**。Encyclopedia は Layer B 前でも動く読み出しアダプタを持つ(§4.3) |
| 戦闘イベントに**指揮官・兵力・日付(月日)**が入っていない(`battle-resolution.ts` は `commanderIds` を計算しているが `ChronicleEvent` に書かない) | 「誰が参加し、どれくらいの兵力で」が出せない | `ChronicleEvent` に任意フィールド追加(§5.1) |
| 部隊の**移動軌跡が残らない**(`regimentMovement.ts` は現在位置しか持たない) | 「いつどこにどの部隊が進んだ」が再生できない | 戦役ごとの軽量な行軍ログ(§5.2) |
| 技術の発見に**人物・都市**が紐づかない | 「誰がどこで発明したか」が出せない | `TechnologyProgress` に任意の `originBurgId` / `creditedCharacterId`(§5.3) |
| Markdown レンダラ・全文検索が無い | F/H 本文の表示と検索 | 自前の小さなサブセット描画 + 前方一致インデックス(§7、依存追加なし) |

---

## 2. 用語

- **Entry(項目)**: 辞書の1ページ。id は `<namespace>:<key>`(例 `tech:atmosphericSteamPumping`、`war:w-3-7-1`、`history:battle-sekigahara`、`feature:cost-of-living`)。
- **Provider**: ある namespace の項目を列挙・生成する関数群。静的データ用とライブデータ用がある。
- **Timeline(年表)**: 時刻つきのキーフレームの列。項目にぶら下がる(戦争項目なら戦役の推移、技術項目なら国から国への伝播)。
- **Map adapter**: Timeline の座標指定(セル/都市/国家 id、または緯度経度)を画面座標に変換し、描画先レイヤを提供するもの。
- **Overlay primitive**: 矢印・部隊章・戦闘マーク・前線/最大版図・日付ラベル。参考画像の凡例に出てくる要素をそのまま部品化したもの。

---

## 3. データモデル

### 3.1 EncyclopediaEntry

```ts
// src/encyclopedia/encyclopediaTypes.ts
export type EncyclopediaNamespace =
  | "feature" | "rule"                 // F: 機能・ルール
  | "history"                          // H: 史実(戦い・戦争・発明・人物)
  | "tech" | "good" | "biome" | "race" | "culture" | "religion"   // H/W 共有の概念
  | "state" | "burg" | "province" | "character" | "war" | "battle" | "dynasty"; // W: この世界の個体

export interface EncyclopediaEntry {
  id: string;                          // "tech:atmosphericSteamPumping"
  namespace: EncyclopediaNamespace;
  title: LocalizedText;
  summary?: LocalizedText;             // 一覧・ツールチップ用 1〜2 文
  /** 本文はブロック列。Markdown 文字列もブロックの1種として持てる。 */
  body: EncyclopediaBlock[];
  /** 年代(暦年)。史実は西暦、世界内はゲーム暦。混ぜて並べない(§6.3)。 */
  period?: { start: number; end?: number; calendar: "gregorian" | "world" };
  tags?: string[];
  /** 双方向リンクは表示時に逆引きで作る。ここには明示リンクだけを書く。 */
  links?: string[];
  timeline?: EncyclopediaTimelineRef;
  sources?: { title: string; url: string }[];   // 史実は必須
}

export type LocalizedText = { en: string; ja?: string } | { i18nKey: string; params?: Record<string, unknown> };

export type EncyclopediaBlock =
  | { kind: "markdown"; text: LocalizedText }
  | { kind: "facts"; rows: { label: LocalizedText; value: LocalizedText | number; link?: string }[] }
  | { kind: "table"; columns: LocalizedText[]; rows: (string | number)[][] }
  | { kind: "entityList"; title: LocalizedText; ids: string[] }      // 参戦国・参加人物など
  | { kind: "liveWidget"; widget: EncyclopediaWidgetId; params?: Record<string, unknown> } // 例: 物価表、技術進捗表
  | { kind: "compare"; worldEntryId: string; historyEntryId: string };            // 史実 vs この世界
```

`liveWidget` が「ドキュメント表示プラスアルファ」の受け皿になる。Cost of Living を例にすると、
本文(storytelling guideline)は i18n 文字列のまま、その下に「この世界の現在の穀物価格・最安/最高の市場」を
ライブ計算した表を差し込める。既存ダイアログの部品(Technology Overview の表など)を `liveWidget` として
埋め込めるようにしておけば、辞書と既存ツールの二重実装を避けられる。

### 3.2 Provider

```ts
export interface EncyclopediaProvider {
  namespace: EncyclopediaNamespace;
  /** 検索インデックス用の軽い列挙(title/summary/tags のみ)。 */
  list(ctx: EncyclopediaContext): EncyclopediaEntryStub[];
  /** 詳細は開いた時だけ組み立てる。 */
  get(ctx: EncyclopediaContext, key: string): EncyclopediaEntry | null;
  /** その項目から辿れる年表(なければ null)。 */
  timeline?(ctx: EncyclopediaContext, key: string): EncyclopediaTimeline | null;
}
```

- **静的 Provider**(`feature`/`rule`/`history`): ビルド時に同梱した JSON を読む。`history` は `fetch` で遅延読込し、初期バンドルに入れない。
- **ライブ Provider**(`state`/`burg`/`war`/`tech`…): `worldContext.pack`、`getTechnologyState()`、`getCharacters()` から組み立てる。**拡張機能(nobility/characters/economy)が無効なら、その Provider は登録しない**(core から extension を import しない既存規約に合わせ、extension 側が `registerEncyclopediaProvider()` を呼ぶ)。
- `tech` は H と W の両方を持つ**合成 Provider**。1ページに「この技術とは(定義・前提技術)」「史実(CSV 由来)」「この世界での進捗(国ごとの段階・年)」の3セクションを並べる。

### 3.3 史実データの置き場所と形式

```
src/encyclopedia/content/
  features/*.md                 # F。frontmatter に id/title/tags
  history/technology.csv        # steam-industrial-technology-history.csv と同じ列 + inventor/place/country 列
  history/events/<id>.json      # 戦い・戦争。§3.4 の Timeline を内包
  history/people.csv            # 人物(生没年、国、関連項目)
```

- `docs/plan/data/*.csv` は**調査資料として残し、Encyclopedia 用には変換スクリプトで取り込む**(`scripts/encyclopedia-import-history.mjs`)。調査資料の列をアプリの都合で崩さない。
- 史実の技術 CSV に足す列: `inventor_en`, `inventor_ja`, `place_en`, `place_ja`, `country_en`, `country_ja`, `lat`, `lon`。「いつ・誰が・どの国で」をここで満たす。`technology_id` 列が W 側の `TechnologyDefinition.id` との結合キー。
- 出典 URL は必須(既存 CSV の `source_url` を継承)。出典の無い史実項目はビルド時テストで落とす。

### 3.4 Timeline

```ts
export interface EncyclopediaTimeline {
  id: string;
  /** 座標系。world = FMG の cell/burg/state id、geo = 緯度経度。 */
  space: "world" | "geo";
  calendar: "gregorian" | "world";
  /** 時刻は「年 + 年内の日」(0..365)。史実の日付も世界の月日もこれで表す。 */
  start: EncyclopediaTime; end: EncyclopediaTime;
  sides: { id: string; label: LocalizedText; color: string; members?: string[] }[]; // 西軍/東軍、枢軸/連合
  tracks: EncyclopediaTrack[];
  /** 再生時の章立て(「1941年12月 開戦」「1942年6月 ミッドウェー」)。 */
  chapters?: { at: EncyclopediaTime; title: LocalizedText; text?: LocalizedText; focus?: EncyclopediaPlace[] }[];
}
export type EncyclopediaTime = { year: number; day?: number };
export type EncyclopediaPlace =
  | { cell: number } | { burg: number } | { state: number }   // space: "world"
  | { lat: number; lon: number; label?: LocalizedText };      // space: "geo"

export type EncyclopediaTrack =
  | { kind: "unit"; id: string; side: string; label: LocalizedText; strength?: number;
      commander?: string /* entry id */; unitType?: "infantry" | "cavalry" | "naval" | "air" | "mixed";
      keyframes: { at: EncyclopediaTime; place: EncyclopediaPlace; strength?: number; status?: "advancing" | "holding" | "routed" | "destroyed" }[] }
  | { kind: "arrow"; side: string; from: EncyclopediaTime; to?: EncyclopediaTime; path: EncyclopediaPlace[]; style?: "advance" | "retreat" | "airRaid" | "supply" }
  | { kind: "battle"; at: EncyclopediaTime; until?: EncyclopediaTime; place: EncyclopediaPlace; label: LocalizedText; victor?: string; casualties?: number; entry?: string }
  | { kind: "area"; side: string; from: EncyclopediaTime; to?: EncyclopediaTime; polygon: EncyclopediaPlace[] | { states: number[] }; style: "frontline" | "maxExtent" | "occupied" }
  | { kind: "note"; at: EncyclopediaTime; place: EncyclopediaPlace; text: LocalizedText };
```

参考画像との対応:

| 参考 | 部品 |
| :--- | :--- |
| 関ヶ原布陣図(武将名 + 兵力の札、西軍青/東軍赤、寝返りは色違い) | `unit`(label=武将、strength、side。寝返りは keyframe の途中で `side` を変える代わりに **side 違いの unit を2本**にし、`status` で切り替える) |
| WWII 欧州(侵攻矢印、爆発マーク、国旗) | `arrow` + `battle`。国旗は side の `members` の国章(W なら既存 COA) |
| 太平洋戦線(日付つき戦闘、最大版図の帯、空襲の破線) | `battle`(日付ラベル)、`area` の `maxExtent`、`arrow` の `airRaid` |
| 太平洋のインセット(バターン、マニラ、ガダルカナル) | 章(`chapters`)に `focus` を持たせ、再生中にその範囲へズームする |

---

## 4. 世界内(W)の年表をライブデータから組み立てる

### 4.1 戦争項目 `war:<warId>`

組み立て元: `WarDetails`(参戦国・陣営・兵力・誓約・非参戦国)、その `warId` を持つ `ChronicleEvent` 群、関与キャラクター。

- **本文**: 開戦理由(`casusBelli*`)、期間、結果(`outcome`)、陣営別の参戦国と `forces`(歩兵/騎兵/海軍/合計)の表、参加人物(`entityList`、クリックで既存の `CharacterDetailsDialog`)、War Details ダイアログを開くボタン(既存 `warDetailsDialogStore.open` をそのまま呼ぶ)。
- **年表**: `ChronicleEvent` を時刻順に並べ、
  - 宣戦・参戦 → `arrow`(`routeCells` があればそれを path に、無ければ `warRouteFinder` で再計算。既存 `drawHistoryArrows` と同じ判定 `isCombatAction` を共有関数に切り出す)
  - 包囲・占領 → `battle`(`toBurg` を place、勝敗は `action` から)
  - 行軍ログ(§5.2)があれば `unit` トラックを生成
  - 交戦国の版図 → `area`(`states`)。国境の時系列は持っていないので、**Layer B 以前は現在の版図のみ**。`Burg.stateHistory` から「この戦争で持ち主が変わった都市」を強調表示するのが現実的な代替。

### 4.2 技術項目 `tech:<id>` の「伝播」年表

`TechnologyProgress` は国ごとに `discoveredYear`/`demonstratedYear`/`adoptedYear` を持っている。
これを時刻順に並べると「どの国でいつ知られ、いつ実演され、いつ普及したか」の伝播アニメーションになる。

- 各国の首都(`capitalX/Y` は `TechnologyOverviewRow` に既にある)に段階に応じたマーク
- 最初に `discovered` した国から、後続国へ時間順に `arrow`(`style: "supply"` 相当の細線)。因果は持っていないので「隣接国のうち先に到達していた国から」と**推定である旨を凡例に明記**する
- 「発見者・発見地」は §5.3 のフィールドが入るまでは「首都」表示にする

この同じページの別セクションに史実(CSV)の年と人物・場所を出すので、**「史実ではイングランドで1712年。この世界ではX国が1104年に最初に実演」**という比較(`compare` ブロック)がそのまま成立する。

### 4.3 Layer B との関係(依存の向き)

Encyclopedia の W 年表は Layer B(`pack.chronicle`、絶対年・型付き kind・i18n)があれば素直に組めるが、**Layer B を前提条件にはしない**。

- `src/encyclopedia/providers/chronicleSource.ts` に「年代記の読み出し」を1か所に閉じる。
  - Layer B 前: `states[0].diplomacy` の入れ子配列を `DiplomacyHistoryDialog` と同じ手順で平坦化し、`year = currentYear - yearsAgo` を導出
  - Layer B 後: `pack.chronicle` を読む
- Encyclopedia 側から年代記へは**書き込まない**。

---

## 5. 記録側に足すもの(シミュレーション側の小改修)

いずれも**任意フィールドの追加**で、既存セーブとの互換を壊さない。

### 5.1 `ChronicleEvent` の拡張

```ts
// types/models.ts — 既存 interface に追加
  year?: number; month?: number; day?: number;  // Layer B の year と同じ意味。先行して入れてよい
  commanderIds?: { attacker: number[]; defender: number[] };
  forces?: { attacker: number; defender: number };       // 交戦前の兵力
  casualties?: { attacker: number; defender: number };
  cell?: number;                                          // 交戦地点
```

書き込み箇所は `battle-resolution.ts#L378` 付近の1か所が主(`commandersA/B` と `attackerPower`、死傷者は既に手元にある)。
`localSkirmish.ts` / `marchCapture.ts` / `homeRecapture.ts` も同様に埋める。

### 5.2 戦役の行軍ログ

`regimentMovement.ts` が連隊を動かすたびに、**戦争 id を持つ連隊についてだけ**、日次ではなく「経路上の節点(都市・分岐・渡河)に到達した時」だけ記録する。

```ts
interface MarchLogEntry { warId: string; regimentId: string; stateId: number; cell: number;
  year: number; day: number; strength: number; commanderId?: number; event?: "depart" | "arrive" | "engage" | "retreat" }
```

- 置き場所: `pack` 直下ではなく戦争ごと(`WarDetails.marchLog?: MarchLogEntry[]`)。終戦後 N 年(既定 50 年)を過ぎた戦争は**間引き**(連隊ごとに出発・交戦・到着だけ残す)。
- サイズ見積: 1戦争 × 連隊20 × 節点10 = 200エントリ × 約40バイト ≈ 8 KB。30戦争で 240 KB。間引き後は 1/3 程度。
- 「歴史モード」(`advance-time-history-mode.md`)の系統マスクで軍事が止まっている区間は記録されない。それで良い(その区間は年代記にも戦闘が無い)。

### 5.3 技術の「誰が・どこで」

```ts
// TechnologyProgress に追加
  originBurgId?: number;          // 段階が上がった年に、その国で該当シグナルが最大だった都市
  creditedCharacterId?: number;   // その都市の該当ギルド長/学術機関の長(characters 拡張がある時だけ)
```

`settleTechnologyAnnual()` で段階が上がった瞬間に1回だけ書く。信号(`TechnologySignals`)はすでに都市単位の
ギルド知識から集約しているので、argmax を残すだけで済む。人物の紐付けは extension 側のフックで行い、
core に characters を import しない。

---

## 6. 地図アダプタと年表再生

### 6.1 再生エンジン

```ts
// src/encyclopedia/timeline/timelinePlayer.ts
interface TimelinePlayer {
  load(timeline: EncyclopediaTimeline, adapter: MapAdapter): void;
  seek(t: EncyclopediaTime): void;          // スライダー
  play(speed: number): void;         // 1秒あたり何日進めるか
  pause(): void;
  onChapter(cb: (c: Chapter) => void): void;
}
```

- 時刻 t における状態は**純関数** `evaluateTimeline(timeline, t)` で求める(unit は前後キーフレームを線形補間、arrow は `from..to` の間だけ表示し進行率で伸ばす、battle は `at` 前後で強調→常設マークへ)。純関数にしておけばテストが書け、シーク時に巻き戻し処理が不要。
- 描画は D3 の join で差分更新。毎フレーム全消去しない。

### 6.2 地図アダプタ

| アダプタ | 使う場面 | 座標変換 | 描画先 |
| :--- | :--- | :--- | :--- |
| `FmgMapAdapter` | W の年表(space: world) | cell → `pack.cells.p`、burg → `burg.x/y`、state → `state.pole` | `viewbox` 上の専用 `<g id="encyclopediaTimeline">`(既存 `#diplomacyHistoryArrows` と同居させず別グループ) |
| `EarthRegionAdapter` | H の年表で、**読み込まれている地図が Earth region で、年表の範囲を覆っている**とき | `mapCoordinates` の逆変換 `x = (lon - lonW) / lonT * graphWidth`、`y = (latN - lat) / latT * graphHeight`(`getEarthCoordinatesAtMapPoint` の逆関数を earthConfig.ts に追加) | 同上 |
| `InsetAtlasAdapter` | H の年表で、上記以外(架空地図を開いている時など) | d3-geo の等距円筒/メルカトル(d3 は依存済み) | Encyclopedia ダイアログ内の SVG。海岸線は同梱の簡略化データ(§6.4) |

アダプタは `toScreen(place)`、`layer()`、`focus(places)`(章の `focus` でズーム)、`dispose()` だけを持つ。
オーバーレイ部品(矢印・部隊章・戦闘マーク・帯)は**アダプタに依存しない**ので、FMG 地図でもインセットでも同じ見た目になる。

`EarthRegionAdapter` は「ヨーロッパの地図を生成して、ヘイスティングズを自分の地図の上で再生する」体験になる。
世界地図ではなく実在地形 heightmap(`japan`/`europe`/`mediterranean-sea` など、Phase 3 で追加済み)を選んでいる人にとって最も価値が高い。範囲外の年表は自動でインセットに切り替える。

### 6.3 時間軸の扱い

- 史実(gregorian)と世界(world)の暦は**同じ軸に並べない**。比較は `compare` ブロックの表で行い、年表は別々に再生する。
- 世界暦の負の年(長命種族の前史、`world-history-depth.md` §3.5)はそのまま扱える(`year: number`)。
- 表示フォーマットは `world-history-depth.md` §3.5 で予定している共通フォーマッタを使う(重複実装しない)。

### 6.4 インセット用の基図

- Natural Earth 1:110m 程度の海岸線・河川を、**ビルド時スクリプトで必要範囲だけ切り出し、座標を小数2桁に丸めた JSON** にして `public/encyclopedia/basemap/` に置く(Earth heightmap の取り込みスクリプトと同じ方針)。topojson 等の新規依存は入れない。
- 地域ごとに分割(`europe.json`、`east-asia.json`、`pacific.json`)し、年表の範囲から必要な分だけ読む。
- 個々の会戦のような**戦場規模**(10 km 四方)は 110m データでは何も描けない。戦場図は年表 JSON 側に簡略地形(山・川・街道のポリライン、参考画像の布陣図程度)を `basemap` として同梱する。

### 6.5 既存の Relations history との関係

- `drawHistoryArrows` の中の「戦闘アクション判定」「経路線生成」「マーカー定義」を `src/renderers/historyOverlay/` に切り出し、Relations history と Encyclopedia の両方から使う。Relations history の見た目は変えない。
- Relations history の各行に「▶ この戦争を再生」を足し、Encyclopedia の該当 `war:` 項目を年表タブで開く。
- 逆に Encyclopedia の戦争項目から「Relations history で見る」で既存ダイアログの該当行へスクロールする。

---

## 7. UI

### 7.1 ダイアログ構成

```
┌ Encyclopedia ─────────────────────────────────────────────── [_][×] ┐
│ [🔍 検索…………………………]  [全て|機能|史実|この世界]  [EN/JA]          │
├──────────────┬──────────────────────────────────────────────────────┤
│ 目次/検索結果 │  ▌Atmospheric steam pumping  ニューコメン大気圧機関    │
│              │  [概要] [史実] [この世界] [年表▶]                       │
│ ▸ 機能        │                                                      │
│ ▸ ルール      │  史実: 1712年 イングランド ダドリー城近郊               │
│ ▸ 技術        │        トマス・ニューコメン  出典: Science Museum      │
│   ・蒸気…     │  この世界: 最初の実演 1104年 Vorland(首都 Kesh)        │
│ ▸ 戦争        │        普及国 4/23  ── [Technology Overview で開く]     │
│ ▸ 史実の戦い  │  前提技術: [[tech:coalCarbonization]] …                │
│ ▸ 人物        │  関連: [[good:atmosphericMinePump]] [[history:watt]]   │
├──────────────┴──────────────────────────────────────────────────────┤
│ 年表 ◀◀ ▶ ▶▶  ━━━━━━●━━━━━━━━━━  1942年6月4日  速度 [30日/秒]       │
│ 章: 1941/12 開戦 · 1942/06 ミッドウェー · 1943/11 タラワ …          │
└────────────────────────────────────────────────────────────────────┘
```

- 年表タブを開くと、W なら FMG 地図に、H ならアダプタ判定(§6.2)で FMG 地図かインセットに描く。インセットは右ペインの本文と入れ替えて大きく表示する。
- 再生中は章のテキストを字幕のように下部に出す(学習用途の中心)。
- 年表の部隊章・戦闘マークにホバーするとツールチップ、クリックでその項目(人物・戦い)へ。

### 7.2 入口(Encyclopedia を「全機能の辞書」にするための導線)

| 入口 | 動作 |
| :--- | :--- |
| Tools タブに「Encyclopedia」 | トップを開く |
| About タブ | Cost of Living 等は本文を残しつつ「Encyclopedia で詳しく」リンク。将来は About 本文を Encyclopedia の `feature:` 項目から描画して一本化 |
| 各ダイアログのタイトルバーに「?」 | `feature:<dialogId>` を開く。`Dialog` 共通部品に `encyclopediaId` prop を1つ足すだけで全ダイアログに展開できる |
| 用語ホバー | 本文や既存ツールチップ中の `[[id]]` をリンク化 |
| 地図右クリックメニュー | 都市/国/戦場マーカーの上で「Encyclopedia で見る」(都市→`burg:`、戦場マーカー→該当 `battle:`/`war:`) |
| Technology Overview の行 | 「史実と比較」→ `tech:` 項目 |
| Relations history の行 | 「▶ 再生」→ `war:` 項目の年表 |

### 7.3 検索

- 起動時に全 Provider の `list()` から `{id, title(en/ja), summary, tags}` を集め、正規化(小文字化・かな/カナ統一・全角半角統一)した前方一致 + 部分一致のインデックスを作る。数千件規模なので自前で十分、依存追加はしない。
- ライブ項目(都市・人物)は数が多いので、`list()` は名前だけ返し、件数上限つきで別グループ表示。

### 7.4 Markdown

F/H の本文は Markdown で書くが、使う記法を**見出し・段落・箇条書き・表・強調・リンク・`[[id]]`** に限定し、小さな自前レンダラで React 要素に変換する(`dangerouslySetInnerHTML` を使わない)。
`docs/world/help/*.md` はこのサブセットに収まるか確認してから取り込む。

### 7.5 i18n

- UI 文字列は `en.json`/`ja.json` の `encyclopedia.*`。
- 史実データは CSV/JSON に en/ja を並べて持つ(既存 CSV がすでにその形)。
- W の本文は既存のエンティティ名 + i18n テンプレートで組み立てる。年代記の `rawText`(英語)は Layer B の `messageKey` が入るまでフォールバック表示。

---

## 8. モジュール配置

```
src/encyclopedia/
  encyclopediaTypes.ts          # §3
  registry.ts                   # registerEncyclopediaProvider / getEncyclopediaEntry
  search.ts                     # §7.3
  markdown.tsx                  # §7.4
  providers/
    featureProvider.ts          # F(content/features/*.md + i18n)
    historyProvider.ts          # H(content/history/*、遅延読込)
    techProvider.ts             # H+W 合成
    stateProvider.ts burgProvider.ts warProvider.ts
    chronicleSource.ts          # §4.3
  timeline/
    evaluateTimeline.ts         # 純関数
    timelinePlayer.ts
    adapters/fmgMapAdapter.ts earthRegionAdapter.ts insetAtlasAdapter.ts
  content/ …                    # §3.3
src/renderers/historyOverlay/   # §6.5(Relations history と共有)
src/ui/dialogs/EncyclopediaDialog.tsx
src/store/encyclopediaState.ts
src/extensions/characters/encyclopedia/characterProvider.ts  # extension 側から登録
src/extensions/nobility/encyclopedia/dynastyProvider.ts
scripts/encyclopedia-import-history.mjs     # docs/plan/data → content/history
scripts/encyclopedia-build-basemap.mjs      # §6.4
```

---

## 9. 実装フェーズ

| Phase | 内容 | 完了条件 |
| :--- | :--- | :--- |
| **C0 骨格** | `encyclopediaTypes`/registry/検索/`EncyclopediaDialog`、F Provider(Cost of Living を移設、About からリンク)、Markdown サブセット | Tools タブから開け、Cost of Living が検索で出る。About の表示は変わらない |
| **C1 技術** | `tech` 合成 Provider。蒸気 CSV に inventor/place/country を追記して取り込み。Technology Overview から相互リンク | 25技術すべてに「史実 / この世界」が並ぶ。出典の無い行はテストで落ちる |
| **C2 世界の戦争(静的)** | `war`/`battle`/`state`/`burg` Provider、`chronicleSource`(Layer B 前の読み出し)、War Details・Character Details への遷移 | 既存マップの全戦争に項目ができ、参戦国・兵力・人物が出る |
| **C3 年表再生(世界)** | `evaluateTimeline` + `FmgMapAdapter` + historyOverlay 切り出し。Relations history に「▶ 再生」 | 戦争1件を時間スライダーで再生でき、Relations history の見た目は回帰しない |
| **C4 記録の強化** | §5.1 `ChronicleEvent` 拡張、§5.2 行軍ログ、§5.3 技術の発見地・人物 | Advance Time 後の戦争で部隊の移動と指揮官が年表に出る |
| **C5 史実の年表** | `history/events/*.json` 形式確定、`InsetAtlasAdapter` + 基図、サンプル3本(§11 の古代ローマ〜中世ヨーロッパの会戦) | 3本が章つきで再生できる。紀元前の年が正しく表示される |
| **C6 Earth 上での再生** | `EarthRegionAdapter`(earthConfig に逆変換を追加) | `mediterranean-sea` 地図でカンナエ、`britain` 地図でヘイスティングズが FMG 地図上に描かれる |
| **C7 全機能辞書化** | `Dialog` に `encyclopediaId` を足し全ダイアログに「?」、`feature:` 項目を順次執筆、右クリックメニュー | ダイアログの「?」が全部どこかの項目に着地する(未執筆は「準備中」項目) |

C0→C1→C2→C3 は直列。C4 は C3 と並行可。C5 は C3 の再生エンジンだけに依存し、C2/C4 とは独立。

### 9.1 テスト方針

- `evaluateTimeline` は純関数なので時刻ごとのスナップショットを単体テスト。
- Provider は小さな fixture pack で項目の組み立てをテスト(既存 `technologyOverview.test.ts` の作法に合わせる)。
- 史実データの検証テスト: 全行に出典 URL、`technology_id` が `TechnologyDefinition` に存在、年代が単調、en/ja 両方ある。
- C3 以降はライブ Playwright で再生を確認(地図準備完了は `fmg:map-ready-tasks-completed` を待つ)。

---

## 10. リスク・非目標

### リスク

- **史実の正確性。** 兵力・日付は資料によって幅がある(関ヶ原の参考画像にも「兵数は石高から推定」とある)。`strength` に `{ value, min?, max?, note? }` を許し、推定値は UI で「約」「推定」と出す。出典必須ルールで担保する。
- **著作権。** `temp/800.grocery/` の画像は**参考のみで同梱しない**。年表 JSON は事実(日付・地名・兵力)を自前で記述し、地図画像の図案・配色を写し取らない。基図は Natural Earth(パブリックドメイン)のみ。
- **WebGL hybrid 表示との整合。** 既存の州ハイライトは SVG 専用で WebGL 時に出ないケースがある(`diplomacy-editor.ts` のコメント)。年表オーバーレイも SVG `viewbox` に載せるため、WebGL hybrid 時の表示を C3 で確認する。
- **ライブ項目の古さ。** Encyclopedia を開いたまま Advance Time した場合、`fmg:refresh-editors` で開いている項目を再構築する(Relations history と同じ購読)。

### 非目標

- 史実イベントをゲームのシミュレーションに反映すること(史実年表はあくまで閲覧用)。
- 国境の時系列スナップショット(`world-history-depth.md` §5.5 の範囲)。Encyclopedia は持っているデータで描けるものを描く。
- 項目の利用者編集(wiki 化)。将来の検討事項。

---

## 11. 決定事項(2026-10-16)

1. **名称は Encyclopedia。** UI 表示は「Encyclopedia / 百科事典」、i18n 接頭辞は `encyclopedia.*`、コードは `src/encyclopedia/`。
2. **史実コンテンツは古代ローマ〜中世ヨーロッパの戦争と技術が中心。** 会戦は有名なものを3つ程度収録する。初期候補:
   | 会戦 | 年 | 技術・戦術の論点 | 地形 |
   | :--- | :--- | :--- | :--- |
   | カンナエの戦い | 前216 | 両翼包囲、ローマ重歩兵 vs カルタゴ騎兵 | `mediterranean-sea` |
   | ヘイスティングズの戦い | 1066 | 盾壁 vs 騎士・弓兵の協同 | `britain` |
   | アジャンクールの戦い | 1415 | ロングボウ(`longbow.md`)と下馬騎士、泥濘 | `europe` |
   技術側は蒸気 CSV と同形式で、古代〜中世の技術(`technology-prehistory-rome-medieval.md` の18ノード)を史実年表 CSV に起こす。紀元前の年は**天文年**(前216 = −215)で保持し、表示時に「前216年 / 216 BC」へ変換する。
3. **About タブの内容はそのまま残し、Encyclopedia を開くボタンを足す。**(C0 で実施。About と Encyclopedia は同じ i18n キーを読むので文面は食い違わない)
4. **架空地図の任意地点へ史実の年表を重ねる遊び方は、現時点では不要。** §6.2 の3アダプタのままとする。

## 12. C0 実装メモ(2026-10-16)

| ファイル | 役割 |
| :--- | :--- |
| `src/encyclopedia/encyclopediaTypes.ts` | `EncyclopediaEntry` / `EncyclopediaBlock`(C0 は `markdown` と `list` のみ)/ Provider |
| `src/encyclopedia/registry.ts` | namespace→Provider、表示順、`getOutgoingLinks` / `getBacklinks`(静的コンテンツなので全件走査) |
| `src/encyclopedia/search.ts` | NFKC・小文字・カタカナ→ひらがな正規化、英日両言語を常に検索、タイトル前方一致優先 |
| `src/encyclopedia/markdown.ts` | Markdown サブセット → AST(innerHTML を使わない)。`[[id]]` / `[[id\|label]]`、相対 `.md` リンクは `linkMap` で項目へ |
| `src/encyclopedia/providers/featureProvider.ts` | `feature:encyclopedia`(使い方、en/ja Markdown)、`feature:cost-of-living`(About と同じ `about.*` キー) |
| `src/encyclopedia/providers/ruleProvider.ts` | `docs/world/help/` の2本を `rule:` 項目として取り込み(ドキュメントが唯一の正) |
| `src/store/encyclopediaState.ts`、`src/controllers/encyclopedia.ts` | 選択項目・戻る履歴・検索語、`openEncyclopedia(entryId?)` |
| `src/ui/dialogs/EncyclopediaDialog.tsx` ほか | サイドバー(namespace 別)+本文+関連項目/被参照 |
| Tools タブ Show 欄「Encyclopedia」、About タブ「📖 Open in Encyclopedia」 | 入口 |

既知の制約: 漢字タイトルは読み(かな)で引けない(「せいかつ」では「生活費の目安」が出ない)。必要になったら項目に `tags` で読みを足す。
