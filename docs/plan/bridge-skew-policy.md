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

構造（石造か木造か）が分からない場合は、石造の値を使う。

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

`getBurgSiteDescriptor` が、都市の所属国家の上限を `transport.maxBridgeSkewDegrees` に入れて CE に渡す。

`diagnosePolylineRiverCrossings` は、交差ごとに `skewDegrees` と `withinSkewLimit` を記録する。

FMG の渡河候補（`createProvisionalRiverCrossing`）は、引き続き河川法線上に橋を作る（0°）。

### CE

`bridgeDecks` は、デッキごとに `skewDegrees` を持つ。デッキには二種類ある。

- メッシュ頂点の位置で交差するデッキ：法線方向に作るので 0°。
- 頂点と頂点の間で交差するデッキ：道路の向きに沿って作るので、斜めになりうる。

上限を超えたデッキは次のように扱う。

- 描画しない（`overSkewedBridgeDecks`）。
- 生成時の検証（`explainGeneratedCrossingFailures` と `validGeneratedCrossings`）で不正として扱う。生成は別のシードで再試行する。

上限は、FMG から受け取った値を `CityDocument.maxBridgeSkewDegrees` に保持したものを使う。この値がなければ `historicalPeriod` から求める。

### RE

`generatePerpendicularBridges` は河川接線に厳密に直角な橋だけを作るので、常に上限内に収まる。

## 禁止事項（全時代共通）

- 上限を超える橋
- 河川の上で折れ曲がる橋
- 流れに対して斜めに置いた橋脚。橋脚は常に流れと平行に置く

上限を守れない地点には橋を架けない。上下流の別の地点に移すか、渡し船にする。

## 今後の課題

- 今のところ、FMG と RE の生成器は 0° の橋しか作らない。許容の範囲内で道路の向きに寄せた斜めの橋（取り付け道路の迂回を減らす）を作るのは、別の作業として行う。
- 構造（石造か木造か）の属性は、まだどのエディタにもない。
