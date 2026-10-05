# Autruyles（burg ID 392）: Roads=1から外部道路3本になる原因

## 結論

FMGの道路受け渡しは1本のまま。CEの共通の出入口計画で最低3か所に増やし、出入口ごとに外部道路を生成するため3本になる。さらに `descriptorEnd` でも入力道路との方向差が45度以上なら独自の放射方向へ切り替えるので、2本はFMGの道路と無関係に伸びる。

## 再現条件と結果

ユーザー提示shareのAutruyles / seed=1175006530392 / evolution / tiny / extent=600m / cityRadius=137m / nPatches=17 / organic / walledAreaShare=1 / legacyを使用。descriptorはOconlandアーカイブのburg 392から取得し、設定と道路IDを提示shareに合わせた。アーカイブ読み込み後の道路IDは282、提示shareは291で、道路形状・方向・行先は同じ。海路なし、河川なし、港なし、城壁なし。config側のwalls=trueやrivers=[through]は、descriptor側のwalls=false・rivers=[]を上書きしない。

| 段階 | 数値 |
| --- | ---: |
| FMG道路入力 | 1本（trails、Courtindon方面） |
| 入力道路方位 | 237.3° |
| suggestedGates | 1 |
| CE geographyのroadBearings / roadPaths | 各1 |
| ④出入口計画 | 3か所 |
| ⑤外部道路計画 | 3本 |
| 最終出力の外部道路 | 3本 |

| 外部道路 | 街側の出入口方位 | 画像範囲端の方位 | FMGとの関係 |
| --- | ---: | ---: | --- |
| gc:road-0 | 240.7° | 242.7° | 入力237.3°を参考に生成 |
| gc:road-1 | 158.8° | 163.4° | 入力との差78.5° → 放射方向へフォールバック |
| gc:road-2 | 344.2° | 339.6° | 入力との差106.9° → 放射方向へフォールバック |

内部道路gc:road-3〜5も生成されるので、最終documentのroad feature groupは合計6個。ユーザーが確認した「外へ伸びる3本」は前半3個であり、内部街路との数え違いではない。

## 処理の因果関係

1. `core/gen/site/siteInput.ts` は道路1本・方位1つ・suggestedGates=1をそのまま引き渡す。入力欠落・複製はない。
2. `core/gen/interior.ts:255` の `placeGates` は `max(3, min(6, round(suggested * 0.7)))` を使う。本件は水域なしなのでwet加算もなく、1→3となる。出入口候補は同じ入力方位を `targets[i % targets.length]` で3回参照するが、候補を間引くため2個目以降は離れた場所へ選ばれる。城壁の有無にかかわらず市街地境界の出入口計画に使われる。
3. `core/gen/streets.ts:710` の `farNodeFor` は `descriptorEnd` でも方向差45度未満の場合だけ入力道路の終点方向を採用する。それ以外は出入口から放射方向へ伸ばす。入力終点を厳密に保持するモードではない。
4. `core/generate.ts:735` の完成都市生成は `plan.gates.map(...)` で外部道路を各出入口につき1本再構成する。元のFMG道路リストとの1対1の対応を持たない。
5. `requiredExternalRoads` はdescriptor入力時に0を返すので、Standalone向け最低道路数の再試行が今回の原因ではない。その分岐は既に分離されているが、門数の最低3規則と放射フォールバックは共通のまま残っている。

## 修正方針

FMG入力では外部道路を「出入口の数」ではなく、海路を除いた入力道路の実際の境界到達から計画する。各外部道路に元のroute/legと出入口の対応を持たせ、1本の道路方位を複数の外部道路へ使い回さない。城内の街路数や港の水門は別に扱う。

最低3出入口や放射方向の補充はStandalone向けの規則として分ける。FMG入力のdescriptorEndでは、フィット後の600mの表示範囲へ元の道路線をクリップして到達点を求め、無関係な方向の外部道路を補わない。架橋不可・城・海岸による接続不能は経路変更や明示的な失敗として扱う。

回帰対象はFMG道路0/1/2本、城壁あり/なし、港・河川、道路が局所範囲内で終わる場合、フィット後の範囲、Bram/circuladeの推奨出入口とし、外部道路の本数と各入力道路との対応を確認する。

## 成果物

- temp/autruyles-road-input.json: 再現入力
- temp/autruyles-road-diagnostic.json: 入力・地理・出入口数・各道路の終点と方位
- temp/autruyles-road-city.json / .svg: 最終生成結果
- temp/autruylesDiagnostic.test.ts: 生成段階を追跡した診断コード（src/core内へ一時配置して実行）

診断生成は成功。今回は原因調査のみで、生成ロジックは変更していない。


## 修正結果（2026-10-03）

FMG descriptorがある生成では、海路を除く有効な入力道路にsource indexとrouteIdを保持し、道路ごとに出入口を1つ計画する。最低3本・水域による追加・サイズによる上限・Bram/circuladeの推奨門数はStandaloneのみ適用する。表示範囲を縮めた場合は入力線の最初の境界交点を使用し、放射方向へのフォールバックは行わない。

Autruylesの修正後は出入口1・外部道路1。元のrouteId=291とCourtindon（burg 19）への対応を保持する。道路0〜2本でも住宅が生成されるよう、市内街路の計画は外部街道とは別に行う。入力にない遠岸用の追加街道も生成しない。接続できない元の道路がある場合は、完成時に `fmg-road-mismatch` と不足したsource index / routeIdを報告して生成を失敗させる。

修正後の診断とSVGは `temp/autruyles-corrected-road-diagnostic.json` と `temp/autruyles-corrected-road-city.svg`。回帰テストは `core/importedRoads.test.ts` に追加し、0・1・2・7本、城壁、organic/Bram/circulade、範囲クリップ、局所終端、海路除外、行先対応、Standaloneの既存規則を確認する。港町Shiqshの架橋不能な入力は、別方向へ街道を創作して成功させず明示的失敗として検証する。

関連の `gen/approachBeyond.test.ts` は2件失敗するが、今回の変更前のHEADでも同じ失敗が再現する（方位角の単位を誤ったmockと、旧メッシュedge IDを前提とした中央道路の検証）。今回の道路本数修正による回帰ではない。
