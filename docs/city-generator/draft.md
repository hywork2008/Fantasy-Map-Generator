# city generator

## 1st step

/Users/h-yamaguchi/Projects/TownGeneratorTS/src
/Users/h-yamaguchi/Projects/TownGeneratorTS/docs
を参考にSVGで都市を描画する以下のプロセスを進める。

FMGの都市の規模に合わせて都市を描く領域、縦✕横の大きさを決める
ボロノイで領域を分割する
都市の位置から海岸線を決定し、陸地と海のセルを決定する。海岸線にない都市には海セルは無い。
都市の位置から河川の位置を決定し、陸地と河のセルを決定する。
陸地の中から都市セルを決定する。

これらのプロセスはスライダーでセルの描画の途中経過を確認出来るようにする。

### ref

その他参考
/Users/h-yamaguchi/Projects/Fantasy-Map-Generator/docs
/Users/h-yamaguchi/Projects/gemini-city-generator/docs

## Inspector

gemini-city-generatorではSVG要素をクリックすると、そのSVGが何を描いているのかを表示するInspector機能があり、以下のように情報を見る事ができ、デバッグ時に役に立つので設計に含めて下さい。

```json
Inspector
Click a building / lot / road / landmark

building #6 (house)
{
  "layer": "buildings",
  "kind": "building",
  "id": 6,
  "label": "building #6 (house)",
  "buildingKind": "house",
  "lotId": 16,
  "part": 0,
  "floors": 1,
  "height": 2.8,
  "roof": "slate"
}
```

## 河川の直線解除

河川生成のコードを一通り読みました（synthSite.ts、riverPath.ts、graphWalk.ts、classifyRiver.ts）。

なぜ今の河川はほぼ直線なのか
形は「ラフなコリドー → ボロノイ辺グラフの biased random walk → 平滑化」で決まりますが、3段すべてが直線化に効いています。

コリドーが完全な直線 — synthSite.ts:203-208 の through 分岐。corridor は source → chord → mouth の3点だが、3点とも perp·shift の同じ横オフセット上に置いて flow 軸方向に ±span しているだけ。曲がりの種がゼロ（共線）。toCoast（L193-197）も中間点が ±0.1R の微小ゆらぎのみ。

corridorPull: 4 の二乗ペナルティがコリドーにバネ留めする — graphWalk.ts:72-77 の score -= corridorPull · (d/cell)²。1セルずれると −4、2セルで −16。一方 ALIGN_WEIGHT·align は実質 [−1.6, 1.6]、wander 項は [0, 0.5]（riverPath.ts:66）。直線コリドーから離れる自由度が事実上ない。

smoothPath 3回 — riverPath.ts:26。±1セルの微振動すら平滑化で消える。

結果は「直線 + 約1セルの震え → 平滑化」。参照画像のような大きなS字蛇行・単一大湾曲・分岐は構造的に出ません。

修正案（効果の大きい順）

### A. コリドー自体を蛇行させる ← 最大のレバー・最小の変更

corridorPull が強いままでも、コリドーが曲がれば川はそれをなぞる。synthSite.ts の synthRiver() で3点直線を 8〜12点の蛇行ポリラインに置き換える。

flow 軸に沿って t ∈ [0,1]、横オフセット lat(t) = baseShift + A·f(t)
f(t) = 位相・周波数を rng で振った sin 成分1〜3個の和（または1次元の有界ランダムウォーク）
振幅 A ≈ rng.range(0.3, 1.1) · cityRadius、波長は窓幅で 1〜3 回曲がる程度
下流側で寝かせる非対称度も rng から → seed 毎に多様
端点は固定（source = 窓縁、mouth = 岸／窓縁）、中間だけ泳がせる
through は町（原点）を川に飲ませないよう、原点最近傍の |lat| を ≥ 0.28R にクランプし、平均を offsetRatio·R に寄せる

### B. walk のパラメータを緩めて、制御点の“間”でも膨らめるようにする

riverPath.ts:59-81 の walkGraph 呼び出し：

パラメータ 現在 提案 理由
corridorPull 4 1.5〜2.5 制御点の間で walk 自身が湾曲できる余地を作る
ペナルティ指数 (d/cell)² (d/cell)^1.5 か線形 二乗は近距離でも急峻すぎる（graphWalk.ts:76）
wander 0.5 0.8〜1.1 design コメントで ~1.5 が "wild"（graphWalk.ts:20）
maxSteps 220 ~300 蛇行で経路長が伸びる
ALIGN_WEIGHT（graphWalk.ts:47 の 1.6）は下げると海に届かず失速するリスクがあるので触らない。すでに nodes.length < 3 で緩め再試行がある（riverPath.ts:70-81）ので、1段目=緩めた新値／2段目=現状維持 の二段構えにすればフォールバックは保たれる。

### C. RiverShape に「型」を足す — 揺らぎでなく類型の多様化

現状 siteConfig.ts:10 は through | beside | toCoast。読んで違いが分かる archetype を追加し、synthSite の placement 分岐で archetype ごとに corridor 生成器 + walk params を出し分ける：

straight — 現行（低蛇行の広い谷底河川）。1オプションとして温存
meander — 高蛇行、交互の大きな曲がり（A のコリドー）
greatBend — 町の位置で1回だけ ~90° に折れる（北から来て町で東へ。「大湾曲の外側に町」＝ヨーロッパ都市に多い形）。corridor = source → 町付近のひじ → source と直交する mouth
fork / confluence — 2支流が町付近で Y 字合流。walk を2コリドー分回して合流点で結合し、classifyRiver.ts が枝分かれ edgePoints を扱えるようにする（工数大／後回し可）
islandSplit — 中州を挟んで2股→再合流（パリのシテ島型）。原点周りにほぼ平行な2チャネル
siteConfig.ts:21 の RIVER_SHAPES と randomSiteConfig を拡張、UI の River-shape セレクタにも追加。

### D / E（仕上げ・優先度低）

SMOOTH_ITERATIONS: 3 → 2（riverPath.ts:26）。大蛇行は3回でも残るので効果は小
川幅を曲率の外側で広げる（synthSite.ts:213 の単調 6 + 10·t に bendFactor を足す）
ガードレール・一緒に直すもの
原点オフセット維持：A のクランプ必須。synthSite.matrix.test.ts の「弦位置 ±0.25R 保存」系テストが蛇行で振れるので許容幅を見直す
自己接近クランプ：islandSplit 以外では、コリドーが自身に ~3セル以内へ近づかないよう振幅/波長を制限（ヘアピンが陸の細い首を water に飲む・岸割りが3成分以上になるのを防ぐ）
straddle（2 through で町を挟む水路、synthSite.ts:54-60）：両方が独立に蛇行すると交差する。低振幅にするか位相をロック
テスト更新：riverPath.test.ts:61 の meanToCorridor < 0.6R は振幅次第で緩める。pipeline.test.ts の「urban core は単一連結成分」は蛇行でも通るはずだが要確認。design.md §4.2 S2 の記述も追随
