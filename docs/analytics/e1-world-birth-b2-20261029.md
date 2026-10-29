# 世界誕生時点の家畜B2: 進行中に動物が無から現れる箇所の修正（2026-10-29）

[設計書](../plan/livestock-world-birth-herds.md)§5のB2の記録。3章の違反を`faunaPopulation.ts`で直した。

- **誕生の期間:** 経済のスライスに世界誕生の群れの版（`livestockWorldBirthHerds`）が記録されるまでを誕生の期間とし（`isWorldBirthPhase`）、群れのないセルに群れを置くのはこの間だけとする。版は`settleWorldBirthHerds`の最後、または進めた世界の読込時に記録する。
- **新しい群れ（`advanceStockOneYear`）・初回の取り出し（`ensureStock`・`dispatchDomesticatedFauna`・`peekHarvestableStock`）・一度だけの補正（`rebaseGrazedHerdsToDemandScale`）:** 誕生の期間の後は、まだ数えていないセルの群れを0頭として扱う（`initializeStock`が0を返す）。
- **最小の繁殖頭数:** 繁殖層が`MIN_BREEDING_HEADS`（2頭、仮、全種共通）未満の群れは子を産まない。
- **隣からの移動（`spreadFromNeighbours`）:** 年次の更新の後、収容力があるのに群れが2頭未満のセル（家畜の各種と野生）は、隣のセルの同じ種の群れから、若い層と繁殖層の5%ずつ（`NEIGHBOUR_SPREAD_SHARE`、仮）を受け取る。受け取る量は収容力の25%まで（`NEIGHBOUR_SPREAD_CAPACITY_SHARE`、仮）。合わせて2頭に届かなければ動かない。頭数は移すだけで増えない。

## World の確認（25か月）

    NODE_OPTIONS=--max-old-space-size=1900 node --import tsx scripts/auditWorldBirthHerds.mts docs/analytics/inputs/salt-s0-aligned-20261023/world-102.fmg docs/analytics/e1-world-birth-b2-20261029/world-1300-25.json 25 12,24

誕生時に人の住むすべてのセルへ群れを置くため、結果はB1とほぼ同じ（1302年1月の牛1,306千頭・収容力1,255千頭、馬328千頭）。B2が効くのは、開墾・技術・人口の移動で後から収容力が生まれるセルである。

## テスト

`faunaPopulation.test.ts`に3件を加えた：誕生の後、種のいない土地に群れが現れない（取り出しも0）、繁殖層が2頭未満の群れは子を産まない、隣からの移動で2つのセルの合計が移動なしの場合と同じ。`src/extensions/economy/generators/`の単体テストは2,394件成功、1件失敗（`constructionEmployment.test.ts`のBrickの品目、変更前でも失敗する）。

## 出力SHA-256

    c6f9c85564da5424036c1cf878616d3d247a31191a95f0daccec176818ed5ebd  e1-world-birth-b2-20261029/world-1300-25.json
