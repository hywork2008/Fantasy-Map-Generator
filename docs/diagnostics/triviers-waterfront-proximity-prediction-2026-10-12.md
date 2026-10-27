# Triviers: 水辺配置計画による CE 生成改善の予測

2026-10-12。対象計画: [waterfront-town-proximity.md](../plan/waterfront-town-proximity.md)。実装・再生成前の予測であり、速度改善の実測ではない。

## 結論

計画は FMG の水辺配置の正確さには有効だが、この地図の CE 生成失敗と所要時間をまとめて解消する計画ではない。

- ID 317 は非港湾集落の城の区画不足であり、改善は見込みにくい。
- ID 40 は水辺が遠いのではなく、海岸が都市中心に近すぎる配置で城の接続道路を確保できていない。乾いた都市用地を確保する配置へ変えれば改善の可能性はあるが、2R 判定や探索範囲拡大だけでは解決しない。
- 上位20都市には `candidate-budget` / `no-dry-site` がない。P2 が主に狙う失敗とは異なる。全596都市でも、記述子にある河岸配置は placed 277、unresolved 2（両方 folded-banks）、記録なし317。
- 大都市の支配的な費用は住宅数調整と建物生成・干渉判定。小都市の一部は海岸・河岸・固定橋を含める広いメッシュで道路接続が高コストになっている。位置変更で改善する場合はあるが、CE の窓・メッシュと処理の改善も別に必要。
- 計画5章どおり保存済み `.fmg` の位置を変えないなら、今回のファイルを同じ入力で再計測しても、この計画による改善は生じない。以下は新規生成、または明示的に再配置した場合の予測。

## 使用した情報

入力は `temp/000.savdata/Triviers_2026-10-12-18-47.fmg`。計測 JSONL、降順 CSV、および同時出力された `temp/benchmarks/triviers-1012.jsonl.inputs.csv` の `share_json` を照合した。FMG→CE の入力の正本はこの `share_json` であり、都市別の人口・半径・水辺・河岸配置・固定横断を確認できる。

596都市中594成功、2 rejected。592都市は1案、ID 8 は3案、別の1都市は2案、失敗2都市は8案。計測は repeat=1、render=false、Node v22.23.1、Apple M4。時間は CLI Worker の `totalMs` であり、FMG の descriptor 作成、Worker 初期化、ブラウザ表示を含まない（[計測仕様](../tools/ce-performance.md)）。内部工程は包含関係を重複加算せず、工程全体か末端工程の self 時間を使った。

## 失敗した2都市

| 都市 | 実測と FMG 入力 | 計画による予測 |
| --- | --- | --- |
| 40 Poilleneuzy | 2,210ms、8/8案 `castle-no-access`。人口6,771、住居目標1,505、R=215m。海港、河川港なし。海岸距離55.7m=0.26R。河川147、幅300.8m、`crossesSite=true`、城あり・市壁なし | P1の2R条件はすでに満たすため海港は残る。P2/P3の「遠い水辺を探す」改善では直接解消しない。海側の目標195mへ中心を内陸に離す配置と、最終Rでの河岸用地確保を実行すれば、城と接続道路の陸地を確保できる可能性がある。ただし河口で両水辺を満たせるか、城への道路が成立するかは未検証。効果は条件付き |
| 317 Sinzlingen | 1,040ms、8/8案 `castle-layout-too-small`。人口434、住居目標97、R=68m、入力窓390m、初期48面。港なし、CE入力に海岸・河川なし。城・市壁あり。詳細は門の辺長14m未満、外部への接続腕なし等 | 港の配置・フラグ変更の対象に当たらない。CE の城用地・門・接続の確保を別に改善する必要がある |

ID 40 は8案の `wall-plan` 合計約1,199ms、`route-junctions` 合計約575ms。ID 317 は `wall-plan` 合計約815ms。失敗の時間は再試行を繰り返した費用で、住宅数調整へは到達していない。

失敗理由のコード上の対応は、[generate.ts](/src/city-editor/core/generate.ts) の城計画・`finalizeCastles` と `castle-no-access` の不採用処理。

## 予測を左右する連携情報の不整合

`riverPlacement.accessMeters[0]` は河岸配置の都市中心を表す（[waterfrontSettlement.ts](/src/services/waterfrontSettlement.ts)）。これを `frame.originMapUnits * metersPerMapUnit` と照合すると、12都市で2mを超えるずれがある。12都市とも海港で、河川港あり6、なし6。上位20では次の4都市が該当する。

| ID | 保存された配置中心と現在の都市中心のずれ | 保存された bankDistanceMeters |
| --- | --- | --- |
| 40 | 約10.52km | 138m |
| 218 | 約17.61km | 123m |
| 590 | 約24.24km | 140m |
| 195 | 約15.81km | 134m |

したがって、これらの `status=placed` や保存された岸距離は、現在の都市が乾いた予約用地にある証拠には使えない。位置・予約用地・access・岸距離を同時に更新したデータで判定する必要がある。保存値がずれた原因までは今回の調査では確定していない。

例えば ID 218 は保存値だけなら海59.7m・川123mで両方2R以内だが、CE河川中心線の offset は648.7m。これは現在位置とは異なる河岸配置記録を持つため、保存値で「水辺配置は成功」と結論してはいけない。河口の欠けた岸や非対称の水面の問題もあるため、中心線距離から川幅の半分を引いた値を代替の岸距離として採用していない。

計画2.3の「配置時の岸距離を使う」には、**その配置の中心と現在位置が一致すること**を前提として加えるべきである。

## 所要時間上位20都市（失敗を含む）

「限定的」は、水辺配置の改善はあり得るが主要処理の短縮は保証できない、という意味。全件で速度倍率・削減msの予測はしていない。

| 順位 | ID / 都市 | totalMs | 主な根拠と改善の見込み |
| --- | --- | ---: | --- |
| 1 | 1 Leigh | 4,492 | R561m、河川港だが folded-banks。川幅6,274m。fit-housing が4,156ms（生成4,482msの約93%）。P1は未解決河川港を外す方向だが、河川自体と住宅目標8,502は残る。P2は折れた岸の幾何の修復ではない。速度改善は限定的 |
| 2 | 8 Seriemigny | 3,563 | 海岸58.1m、R386m。2案が城接続失敗、3案目成功。fit-housing 1,715ms、成功案の harbor-ships 約1,019ms。水際から遠くない。内陸へ離す配置で再試行を減らせれば改善するが条件付き |
| 3 | 14 Chate | 2,723 | 海岸58.2m、R334m。fit-housing 1,378ms、harbor-ships 672ms。既に2R以内。住宅と港の建物生成費用が残るため限定的 |
| 4 | 175 Kapellin | 2,424 | 海岸59.8m、R327m。fit-housing 1,379ms、harbor-ships 744ms。Chateと同様、限定的 |
| 5 | 218 Frampton | 2,370 | R107mに窓2,332m、365面。route-junctions 926ms。固定橋1件と遠い requiredBounds、河岸配置記録のずれ。整合する再配置で縮小できる可能性はあるが、橋を収める制約が残るため条件付き |
| 6 | 17 Wihulbo | 2,328 | 海岸59.9m、R340m、川幅6,618m、folded-banks。海港は残る。P1で河川港を外す可能性、P2だけでは岸の折れを解消しない。fit-housing 1,219ms、harbor-ships 722msが残り、限定的 |
| 7 | 585 Anela | 2,264 | 海岸54.2m、R147m、窓1,500m、332面。wall-plan 825ms、route-junctions 424ms。水辺は近い。距離適合だけでは窓・面数が減らないため限定的 |
| 8 | 151 Cacheira | 2,260 | 海岸55.0m、R315m。fit-housing 1,194ms、harbor-ships 561ms。大都市の建物生成負荷が残り、限定的 |
| 9 | 590 Abeman | 2,223 | R188m、窓2,597m、569面、route-junctions 1,099ms。固定横断payloadはあるが crossings は0件。遠い河岸を含む requiredBounds と配置記録のずれがあり、整合する再配置で縮小するなら改善余地。ただし主港は海で、河岸へ移す判断は計画の実装次第 |
| 10 | 86 Seirolima | 2,222 | R183m、海141.4m・保存川125m、配置中心整合、coastConstrained。固定橋1件、343面、route-junctions 689ms。両港は2R以内。P4の用地拡大・道路再生成による効果は条件付き |
| 11 | 12 Dunsbole | 2,220 | R292m、海220.1m・保存川189m、配置中心整合、coastConstrained。2R内だが最終Rより川に近い。P4は乾いた用地を増やす可能性。fit-housing 1,044ms、harbor-ships 568msが残る |
| 12 | 40 Poilleneuzy | 2,210 | 城接続失敗。上記参照 |
| 13 | 2 Penorham | 2,174 | R363m、保存川253m、配置中心整合。最終半径の乾いた用地確保というP4の対象になり得る。fit-housing 1,177ms、harbor-ships 610ms。配置品質改善は期待できるが処理費用は残る |
| 14 | 185 Varzea | 1,945 | R195m、海116.5m・保存川99m、配置中心整合、coastConstrained。332面、route-junctions 401ms。P4の用地確保と両港の調整は対象になり得るが速度改善は条件付き |
| 15 | 11 Arejas | 1,869 | 海岸58.2m、R289m。fit-housing 991ms、harbor-ships 505ms。距離条件を既に満たし、限定的 |
| 16 | 424 Sintral | 1,867 | 海岸60.2m、R141m、窓1,500m、328面。wall-plan 747ms、route-junctions 408ms。Anelaと同様、CEメッシュ・道路処理が残り限定的 |
| 17 | 199 Schonauesch | 1,853 | R317m、保存川94m、配置中心整合、固定橋1件。P4で乾いた用地を増やす対象になり得る。fit-housing 591ms、harbor-ships 637ms。橋の再生成を伴い速度は未確定 |
| 18 | 195 Cliford | 1,810 | R112m、窓3,265m、500面、route-junctions 974ms。crossings は0件。遠い河岸と配置記録のずれ。Abemanと同様、入力整合・窓縮小を伴うなら改善余地 |
| 19 | 180 Borgo | 1,805 | 海岸55.4m、R258m。fit-housing 927ms、harbor-ships 551ms。距離条件を既に満たし、限定的 |
| 20 | 328 Krofengengen | 1,799 | R78m、海岸60.2m、窓4,113m、632面、route-junctions 923ms。riverPlacementなし・fixedCrossingsなしだが、約2km先の河岸を含む requiredBounds がある。海港は適合するので、2R条件だけで遠い川が入力から消えるわけではない。窓縮小の追加対応が必要 |

上位20の末端self時間の例: Leigh の local-fabric 合計1,998ms、coastal-reservations 合計1,816ms。Seriemigny はそれぞれ1,118ms、1,289ms。`coastal-reservations` は海港だけの費用ではなく、水面・固定道路・堀・ランドマーク等との干渉判定も含み、港フラグを外せば全額消える処理ではない（[blockInfill.ts](/src/city-editor/core/gen/blockInfill.ts)）。

## 計画に補足すると予測が明確になる点

1. **近すぎる水辺にも対応する。** 海港の中心は多くが約60m内陸で、2R上限には合格してもRの都市用地は海にかかる。計画の海側目標 `R−min(20,R/4)` に合わせるには、これらは水辺から離す必要がある。既存 `settledShorePort` は `distance <= R` で移動せず、riverPlacementがあれば処理しないため、そのままではID 40/8等への期待は成立しない。
2. **配置と記録を一体で確定する。** 現在位置と footprint/access の一致、現在の岸距離、最終Rの乾いた用地を検証してから港フラグを確定する。ID 40/218/590/195の保存岸距離を使ってP1/P4の成功を判定しない。
3. **2R適合とCE窓縮小を別々に検証する。** 現行は人口窓6R、最小窓や requiredBounds による拡大があり、海岸が窓内にある場合 `townMeshExtentMeters` が表示窓全体を採用する。計画の「一辺4R」は距離基準の意図であって、現在の連携で常に選ばれる実寸ではない。[incomingCity.ts](/src/city-editor/io/incomingCity.ts) と [document.ts](/src/city-editor/core/document.ts) を併せて検証する。海岸が近くなっても、遠い河岸・橋や1,500mの窓が残れば面数は減らない。
4. **城の失敗を独立した指標にする。** waterfront-checkの合格はCE成功を保証しない。ID 317の城区画不足、ID 40/8の城接続失敗は別に計測する。

上位外では ID 61 Iruevabue（564ms）が shore-distance の明確な対象。R=187m、海岸872.3m>2Rで、waterfrontCheckに超過625mが記録されている。P1は海港を外す方向、P3は両水辺を保てる地点へ移せるなら改善する方向。ただし既にCE生成は成功しており、今回の生成失敗2件の原因とは異なる。

## 実装後の検証対象

失敗2件に加え、城接続の ID 8、folded-banks の ID 1/17、窓と入力整合の ID 218/590/195/328、最終半径の ID 2/12/185/199、水辺距離の ID 61 を優先する。

新規生成は同じseedでも位置・港・道路・人口が変わり得るため、入力CSVを新しく保存し、住居目標も併記して比較する。各都市を複数回計測し、成功率、城の失敗理由、2R適合、配置中心のずれ、extent/面数、route-junctions、fit-housing、coastal-reservationsを確認する。橋は既存skew policyを守って再生成する。

この保存地図を反例として比較したい場合は、新規生成だけに適用する実装とは別に、都市を明示的に再配置した試験入力が必要。同じ古いCSVを使う比較ではFMG配置計画の効果を測れない。
