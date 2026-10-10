# 橋の斜角（skew）ポリシー

2026-10-07。AGENTS.md の「直角に交差しない橋は絶対に描いてはならない」を、史実に合わせた**許容斜角つきの原則**に改めた。FMG を基準にし、FMG・RE・CE の三つすべてに同じ基準を当てる。

実装は [src/utils/bridgeSkewPolicy.ts](../../src/utils/bridgeSkewPolicy.ts)。

## 定義

**斜角（ずれ角）**は、橋軸と河川法線のなす角を指す。河川法線は、橋の中心点での河川接線に直交する線。

- 0° は直角に交差する橋。
- 90° は川と平行な橋。

## 改定の理由

もとの厳格な直角ルールは、次のような奇妙な橋を除くために作った。

- 川とほぼ平行に架かる橋
- 斜めに架かり、川の途中で 90° 曲がって対岸に渡る橋

これらは史実のどの時代にも存在しないので、今後も禁止する。

一方、少しの斜めは史実でよく見られる。厳格な直角ルールはこれまで禁止していたので、そこが厳しすぎた。

## 史実の根拠（概略）

| 時代・構造 | 実際の斜角 | 背景 |
|---|---|---|
| 古代ローマの石造アーチ | ほぼ 0°〜10° | 迫石（アーチを組む石）を斜めに加工するのは難しい。そのため道の側を曲げて、川に直角に入った |
| 中世の石造橋 | 0°〜10° | 基礎の位置を優先して、橋の途中で浅く折れる例はある（サン・ベネゼ橋など）。折れるのは橋脚の上だけ |
| 古代〜近世の木造桁橋 | 〜20° 前後 | 梁を渡すだけなので、斜めでも架けられる |
| 18 世紀末以降 | 〜30° | 運河や鉄道で、斜めアーチの作図法と施工法が確立した |
| 現代日本の道路橋 | 30° 以内が望ましい | それを超える場合は、構造上の特別な検討が必要になる |

斜めにすると、橋の長さは 1/cos(斜角) 倍になる。10° で +1.5%、20° で +6%、30° で +15%、45° で +41% である。

## 上限値

推奨は全時代を通じて 10° 以内とする（`BRIDGE_SKEW_PREFERRED_DEGREES`）。生成器は 0° を目指す。

| 段階 | 開始時の Historical period | 石造 | 木造 |
|---|---|---|---|
| 0 古代・中世 | earlyMedieval / highMedieval / lateMedieval（未設定もこれ） | 15° | 20° |
| 1 近世の測量 | ageOfExploration / maritimeEra | 25° | 25° |
| 2 斜めアーチ・近代工学 | preIndustrialEra 以降 | 30° | 30° |

構造は道の種類で決める（`bridgeStructureForRouteGroup`）。

- FMG の主要道路（`roads`）と RE の街道（`highway`）は石造。
- それ以外の道（`trails` など）は木造。
- 複数の道が一本の橋を共有する場合、主要道路が一本でも含まれれば石造とする。
- CE は橋の構造を知らないので、FMG は木造の上限（石造以上の値）を CE 全体の上限として渡す。

## 時代と技術による上限の引き上げ

Historical period（地図生成オプション）は**ゲーム開始時の下限**とする。

国家が次の技術を adopted 以上にすると、その国の段階が上がる（`BRIDGE_SKEW_TECHNOLOGY_GATES`）。技術は年次の Advance Time で進むので、上限も時間の経過とともに上がる。技術が段階を下げることはない。

| 段階 | 技術 | 理由 |
|---|---|---|
| 1 | `mathAstronomyGeography`（第 1 時代） | 測量・幾何の知識で、斜めの径間を割り付けられる |
| 2 | `precisionBoringAndMeasurement`（第 4 時代） | 精密な切石と計測で、斜めアーチを施工できる |

国家ごとの値は `getStateBridgeSkewLimit(stateId)`（[technologyProgress.ts](../../src/generators/technologyProgress.ts)）で求める。

## 各エディタへの適用

### FMG

都市ごとの橋の生成（`ensureConvergingWorldRiverRoads`）は、川沿いの各候補地点について、次の斜角の橋を試す。

1. 0°、±10°（推奨値）を先に試す。
2. ±10° の案が最良だった場合に限り、その国家の、その橋の構造での上限（`getStateBridgeSkewLimit(stateId, structure)`）の ±上限も試す。生成時間を抑えるためである。

候補の選び方は従来どおりで、迂回距離が最も短い案を採る。ただし、10° を超えた 1° ごとに 5 m を経路コストに上乗せする（`bridgeSkewPenaltyMeters`）。このため、直角に近い橋が優先され、大きな斜角の橋は迂回が大きく減る場合にしか選ばれない。

候補の形（`createProvisionalRiverCrossing` の `skewDegrees`）は次のとおり。

- 橋軸 `nCrossing` を、河川法線から `skewDegrees` だけ回す。
- デッキの幅方向も、橋軸に直角になるよう同じ角度だけ回す。
- 斜めのデッキは端が岸に斜めに当たるので、岸側の受け（seat）を「道路幅の半分 × tan(斜角)」だけ延ばす。こうしないと、デッキの角が水に入る。
- `BRIDGE_SKEW_MAX_DEGREES`（30°）を超える指定は、不正な入力として扱う。

CE への受け渡し（`FixedBurgCrossings`）では、`normal` が橋軸を表す。検証（`validFixedBurgCrossings`）では、`normal` と河川接線 `tangent` のなす角が法線から 30° 以内であることを確かめる。デッキ幅の方向は、`normal` に直角な方向で判定する。

`getBurgSiteDescriptor` は、都市の所属国家の木造の上限を `transport.maxBridgeSkewDegrees` に入れて CE に渡す。`diagnosePolylineRiverCrossings` は、交差ごとに `skewDegrees` と `withinSkewLimit` を記録する。

実地の確認（2026-10-07、ageOfExploration、seed 424242 / 1001 / 777）：

- 橋は 28 / 46 / 13 本。そのうち 13 / 22 / 8 本が ±10° で、残りは 0° だった。上限の 25° はどの地図でも選ばれなかった。
- 橋が架かる道の数は、変更前とすべての都市で同じだった。
- 生成時間は 0.41 / 0.40 / 0.17 秒から 0.77 / 0.77 / 0.30 秒に増えた（約 1.9 倍）。

セル単位の陸路網の生成（`landConnectionGeneration`）では、川沿いの全標本点に斜めの案を足すと、試行数が数倍になる。そうすると既存の予算（`maxApproachAttempts`）を超え、生成全体が失敗しうる。そこで、斜めの案は次の範囲に限る（`worldRiverCrossingCandidates` の `skewLimitAt`）。

- 都市間の回廊ごとに、回廊に最も近い粗い標本点を一つ選ぶ。
- その点に、回廊の向きへ寄せた斜めの橋を一案だけ足す。角度は、その地点の国家の上限で打ち切る。
- 追加の試行は、回廊の数が上限になる。

`skewLimitAt` を渡さない呼び出しは、従来どおり直角の橋だけを作る。

候補の再検証（`validateProvisionalRiverCrossing`）は、入力に斜角がなければ候補自身の `skewDegrees` を使う。この値がない古い保存データは直角とみなす。

### CE

`bridgeDecks` は、デッキごとに `skewDegrees` を持つ。デッキには二種類ある。

- メッシュ頂点の位置で交差するデッキ：法線方向に作るので 0°。
- 頂点と頂点の間で交差するデッキ：道路の向きに沿って作るので、斜めになりうる。

上限を超えたデッキは次のように扱う。

- 描画しない（`overSkewedBridgeDecks`）。
- 生成時の検証（`explainGeneratedCrossingFailures` と `validGeneratedCrossings`）で不正として扱う。生成は別のシードで再試行する。

上限は、FMG から受け取った値を `CityDocument.maxBridgeSkewDegrees` に保持したものを使う。この値がなければ `historicalPeriod` から求める。

### RE

FMG は、州の石造と木造の上限を `RegionSiteDescriptor.bridgeSkewLimitDegrees` に入れて渡す。RE はこれを `RegionDocument.bridgeSkewLimitDegrees` に保持する。

`generatePerpendicularBridges` は、この上限の範囲で橋軸を道の向き（窓の前後の点を結ぶ向き）へ寄せる。

- 上限には、橋の構造（`highway` は `stone_arch`、それ以外は `wooden`）に応じた値を使う。
- 橋の長さは 1/cos(斜角) だけ延ばす。橋上の 4 点は、回した橋軸の上に一直線に並べる。
- 集落や端点を橋軸に載せる場合（pinned）は、直角のままにする。
- 斜角は `RegionBridge.skewDegrees` に記録する。

上限を持たない文書は、直角の橋だけを作る。対象は、この変更より前の RE 文書と、州のない単独生成である。描画のたびに橋を再配置するので、既存の地図の見た目が変わらないようにするためである。

## 禁止事項（全時代共通）

- 上限を超える橋
- 河川の上で折れ曲がる橋
- 流れに対して斜めに置いた橋脚。橋脚は常に流れと平行に置く

上限を守れない地点には橋を架けない。上下流の別の地点に移すか、渡し船にする。

## 今後の課題

- CE は橋の構造を区別せず、FMG から受け取った一つの上限（木造の値）だけを使う。
