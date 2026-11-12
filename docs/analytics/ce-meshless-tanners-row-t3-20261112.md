# メッシュなしCE なめし職人の河岸 T3 記録（工房用水路）

実施日: 2026-11-12
計画: [メッシュなしCEのなめし職人の河岸と給水・排水](../plan/ce-meshless-tanners-row.md) §6・§8 T3
全量: [ce-meshless-tanners-row-t3-20261112.json](ce-meshless-tanners-row-t3-20261112.json)（T0の7件と、曲がった川の合成4件）
前の記録: [T2b](ce-meshless-tanners-row-t2b-20261112.md)

## 1. 変更

| 箇所 | 内容 |
|---|---|
| `facilityLots.ts` `tryTannersLeat` | 方式Aでは列が細切れになる岸の区間に、まっすぐな工房用水路を引く。水路は区間の弦と平行に置き、岸のどの曲がりよりも陸側に6 m離す（間の土地は「中洲」）。上流の端で川から分かれ、下流の端で川へ戻る。分かれ口と戻り口は川に対して35°以内の斜めにする。水路は幅2.5 mの `river` パス（`urban-tanners-leat:<n>`）で、町の所有パスに入る。道路・予約地・門・置いた敷地を横切らず、市壁から25 m離す。地図の枠に届く区間は、水路が枠に収まるまで下流側を切り詰める |
| 切り替えの条件 | 区間に工房3軒以上の長さがあり、次のどちらかに当たる時: 方式Aで置ける工房が理想（長さ÷間口）の60%未満、または工房のある直線区間1つあたりの工房が平均2.5軒未満 |
| 工房の並べ方 | 水路の陸側の縁を岸として `tannersRow` で並べる（護岸なし、水路の長さ0）。工房が1軒も立たなかった水路は掘らない（パスを消す） |
| 列のまとまり | 置ける工房が最も多い区間（岸または水路）から先に埋め、区間の中では町に近い方から埋める。以前は全区間を町に近い順に混ぜて埋めていた |
| `urban.ts` | 中洲を街路計画から除く。工房と護岸を街区から除く範囲を0.3 mほど広げる。T3の曲がった川で、区画の縁で止まる小路がセンチ単位の丸めで工房に食い込み、生成が止まった（`dependency-protected-placement`）ため |

## 2. 結果

| ケース | 要求 | 配置 | 未配置 | 群 |
|---|---|---|---|---|
| synthetic-open-5000 | 14 | 13（T2b: 11） | river 1 | 3 |
| synthetic-walls-5000 | 14 | 14 | 0 | 1 |
| synthetic-open-20000 | 55 | 41（39） | river 14 | 2 |
| gothengsfeld | 14 | 14 | 0 | 1 |
| gondre | 14 | 0 | river 14 | 0 |
| myosiasos | 28 | 28（25） | 0 | 2 |
| archiagu | 48 | 5 | river 43 | 1 |
| synthetic-walls-5000-meander | 14 | 6 | frame 8 | 4 |
| synthetic-open-5000-meander | 14 | 14 | 0 | 10 |
| synthetic-open-20000-meander | 55 | 33 | frame 22 | 9 |
| synthetic-walls-20000-greatBend | 55 | 11 | frame 44 | 2 |

- どのケースでも、置いた工房はすべて背面が水、給水が上流、町の下流にある。
- 最も多い区間から埋めるようにしたため、まっすぐな川の町で配置が増え、列のまとまりは保たれた（myosiasos 25→28、synthetic-open-20000 39→41）。
- 曲がった川（meander）では、水路を引いた区間の工房は1列にまとまる。それでも町全体では群が9〜10残る。合成のmeanderの川は、鋭く折れる短い線分の連なりで、地図の枠までの間に十分な長さの区間が少ない。そのため、残りの工房が他の短い区間に散る。
- greatBendと市壁ありのmeanderの未配置は、すべて枠で切れた分（`frame`）。

## 3. 試験

- 追加: `facilityLots.test.ts` に、市壁のない5,000人のmeanderの町で、工房用水路が `river` パスとして所有パスに入り、その陸側に工房が3軒以上並ぶ（水路が水路の線から2 m以内に届く）ことを確かめる試験を加えた。
- `npx vitest run src/city-editor/generators/vector src/city-editor/renderers/vector src/city3d/three/bvInstances.test.ts src/city-editor/generators/populationFacilities.test.ts`: 64ファイル中58成功・5スキップ・1失敗。失敗は `houseLod3d.test.ts` で、HEADでも同じく失敗する既存の不具合。

## 4. 残り

- 曲がった川での散らばりは、ベジェの曲がりを入れた後（T4）にもう一度測る。合成のmeanderの折れ線は、予定しているなめらかな曲がりとは形が違うため。
- 水路の中洲は空き地のまま。干し場の小物は置いていない。
