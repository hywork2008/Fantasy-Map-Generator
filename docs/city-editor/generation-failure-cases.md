# City Editor 都市生成の失敗条件と試行結果

調査日: 2026-10-02。対象: `c47ed0e33`（`feature/moat` マージ後）。[生成プロセス](generation-process.md)と合わせ、現行の `generateCityAttempt` / `applyPlan`、交差検証、城郭・外堀の処理を確認した。2026-09-28 の順位と件数を現行版の発生率として扱わず、新しい固定シード試行で更新した。

現行でも最多の不採用理由は門の未接続。城の配置・内部配置・支線接続が新しい失敗経路となり、堀は道路経路の制約を増やす。旧資料で未観測だった evolution 面の自己交差も今回観測した。以下の件数は小規模な調査結果で、全設定の出現率ではない。

## 失敗の単位と再試行

- **不採用案**: `generateCityAttempt` が途中で `null` を返した1案。最初に到達した不採用理由を1件記録する。後段に別の問題があっても、この案では評価されない。
- **都市の最終失敗**: `generateCityOnDocument` が要求シード、続いて `` `${seed}:junction-retry:1` ``〜`:7` の計8案を試しても成功しない状態。`all-attempts-rejected` は集約結果で、独立した原因ではない。
- **工程①〜⑥の失敗**: 都市全体の8案再試行はしない。川・街路の内部再試行はある。
- **キャッシュが無い工程⑦〜⑩**: 要求シードを先に1案試し、失敗すると同じ要求シードから8案再試行する。最大9回（先頭案は重複）。今回の集計はこの入口ではなく、一括生成APIを使った。

Worker の例外、結果の受信エラー、起動エラーは上記の不採用理由とは別。例外は worker の `error` 応答などからUIへ返り、8案の再抽選で回復する経路ではない。キャンセルは `AbortError` として表示する。また、生成中に文書が編集された場合や画面が閉じられた場合、成功結果でもUIは採用しない。

## 不採用判定の実行順

出典: [generate.ts](../../src/city-editor/core/generate.ts)、[passages.ts](../../src/city-editor/core/passages.ts)。次の順に確認するため、頻度表は問題の総数ではなく**案が停止した理由**の分布になる。

| 順 | phase / reason | 判定内容 |
| --- | --- | --- |
| 1 | `prepare` / `too-few-faces` | 入力格子の面が3未満 |
| 2 | `castle` / `castle-no-site` | `runPlan` で指定条件を満たす城の予約面を作れない |
| 3 | `urban` / `urban-area-too-small` | 充填全体の面積が `πR² × 0.45` 未満。城壁内のシェアとは別 |
| 4 | `castle` / `castle-layout-too-small` | `applyPlan` 内の `installCastle` で城門・庭・必須棟を設置できない |
| 5 | `gate-routing` / `unconnected-gates` | 採用済みの生成都市門に壁の開口が無い、または完成生成 / 工程⑥で道路との十字交差が無い |
| 6 | `castle` / `castle-no-access` | `finalizeCastles(..., true)` で城門の支線・内部配置・メッシュを確定できない |
| 7 | `apply-validation` / `invalid-mesh` | `validate` によるメッシュ・feature・門などの検証エラー |
| 8 | `street-plan` / `too-few-external-roads` | 仕上げ前の生成外縁道路がサイズの下限を満たさない |
| 9 | `castle` / `castle-layout-too-small` | 幾何仕上げ後の `finalizeCastles(..., false)` が失敗。内部配置の更新またはメッシュ検証の失敗を含む |
| 10 | `street-plan` / `roads-in-moat` | 仕上げ後のいずれかの road 辺が、門の橋以外で有効な堀に重なる |
| 11 | `crossing-validation` / `invalid-crossings` | 都市門・壁と川・橋の交差に不正がある |
| 12 | `crossing-validation` / `too-few-external-roads` | 仕上げ後の生成外縁道路が下限を満たさない |
| 13 | `crossing-validation` / `self-intersecting-faces` | evolution の面ポリゴンが自己交差する |
| 14 | `complete` / `all-attempts-rejected` | 上記の不採用が8案続いた集約結果 |

①〜⑥の `applyPlan` は `plan.castleFailure` があると直接 `null` を返すため、城配置失敗の reason を報告しない場合がある。理由の記録を比較する際は、一括生成の observer を使う。

`invalid-crossings` の詳細は次の順で並ぶ。先頭のメッセージだけを分類すると後ろの問題は集計から落ちる。

1. `townGates` に属する `gc:*` の都市門に、壁と道路の十字交差が無い。
2. 城壁と川が同じ辺を共有している。
3. 城壁と川の共有頂点が十字交差でない。
4. `gc:bridge-*` が道路–川–道路の3頂点でない、または中央に川と道路の十字交差が無い。
5. 生成川の辺の両側が建設可能な陸面なのに、その川上に道路との十字交差が1つも無い。

城門は `ownerCastleId` で都市門から分離され、城の専用検証に入る。橋の「直角に見えるか」と、辺の接続・入射順で判定する「十字交差」は同一の条件ではない。

## 2026-10-02 の固定シード試行

各条件12都市、計168都市。成功162、最終失敗6。不採用案は計165件、成功案を含む試行は計327案だった。実行時例外は0件。最終失敗の6都市が出した48件も不採用案に含む。

全条件で格子シードは `ce-audit-20261002-mesh`。生成シードは `ce-audit-20261002:0`〜`:11`。各案は同じ未加工格子から生成し、失敗案のメッシュを次の案に渡していない。格子APIの既定パラメータを使用し、evolution は117面、Small hex は247面、Small Voronoi は577面。`descriptor` と `urbanNPatches` は未指定。

生成設定は `defaultGenerationSettings()` が基準。内陸、川 `through` 1本、都市壁・広場・寺院・shantyあり、城・港なし、layout `auto`、海回避と平滑化あり。時代は入力文書の `ageOfExploration`、建物パターンは `legacy`。外堀は指定した行だけ有効。

「地形ランダム」は `` randomSiteConfig(makeRng(`${seed}:site`)) `` で海岸・川・起伏・施設を都市ごとに決め、8案内ではその設定を固定した。layout ごとの集計はしていない。

| 設定 | 都市 | 不採用案 | 最終失敗 | 不採用理由の内訳 |
| --- | ---: | ---: | ---: | --- |
| Tiny evolution 既定 | 12 | 14 | 0 | 門9、交差4、自己交差1 |
| Tiny evolution 地形ランダム | 12 | 11 | 0 | 外縁道路5、門3、交差3 |
| Micro evolution 既定 | 12 | 5 | 0 | 門3、交差2 |
| Micro evolution 地形ランダム | 12 | 22 | 2 | 城配置15、城形状1、門2、交差3、外縁道路1 |
| Tiny evolution 内陸・川なし | 12 | 2 | 0 | 門2 |
| Tiny evolution 湾・川 `toCoast` 1本・港 | 12 | 4 | 0 | 門4 |
| Tiny evolution 岬・川 `toCoast` + `meander`・港 | 12 | 33 | 2 | 門16、交差13、外縁道路3、自己交差1 |
| Micro evolution 岬・川2本・港・都市壁なし | 12 | 5 | 0 | 外縁道路4、交差1 |
| Tiny evolution 既定 + 川 `outside` | 12 | 1 | 0 | 門1 |
| Tiny evolution 既定 + 都市外堀 | 12 | 23 | 1 | 門19、交差3、自己交差1 |
| Tiny evolution 既定 + 城（全項目auto） | 12 | 18 | 0 | 門12、交差2、城支線2、自己交差1、城形状1 |
| Tiny evolution 既定 + 城 + 都市 / 城の外堀 | 12 | 26 | 1 | 門20、交差1、城形状2、自己交差1、城支線2 |
| Small hex 既定 | 12 | 0 | 0 | — |
| Small Voronoi 既定 | 12 | 1 | 0 | 交差1 |

同じ格子とシード群で条件を変えた局所比較であり、独立した168種類の格子を調べたわけではない。旧調査とは格子・生成シードが異なるので、件数の増減をそのまま性能改善・悪化とは判定できない。Medium / Large、FMG descriptor、`outsideNear`、手動 / ロック城、medieval の描画品質はこの試行の対象外。

### 不採用理由の集計

| reason | 不採用案 | 読み方 |
| --- | ---: | --- |
| `unconnected-gates` | 91 | 門の配置後に道路接続を確保できない |
| `invalid-crossings` | 33 | 詳細先頭は壁–川の非十字18、壁–川の共有辺10、橋5頂点5 |
| `castle-no-site` | 15 | すべてMicroの地形ランダム |
| `too-few-external-roads` | 13 | すべて仕上げ前 `street-plan` |
| `self-intersecting-faces` | 5 | すべてTiny evolution |
| `castle-layout-too-small` | 4 | 城設置時 / 仕上げ後を同じreasonで報告する |
| `castle-no-access` | 4 | Tinyの城あり条件 |
| `roads-in-moat`、`urban-area-too-small`、`invalid-mesh`、`too-few-faces` | 0 | 未観測。判定経路が無いという意味ではない |

交差33案の内訳は**詳細の先頭1件**で分類したもの。1案に複数の交差問題が含まれる場合がある。これだけでは、どの幾何処理で交差が壊れたかは確定できない。

## 現行の主な失敗要因

### 1. 門を置けても、禁止帯を避ける道路が通らない

`unconnected-gates` は91件で最多。川なしは2件、既定の川1本は9件、同じ条件で都市外堀ありは19件だった。

現行はすでに、川 / 城の頂点を避け、枠へ届く城外の陸を探索し、4方向開口が城内と城外に抜ける候補だけを採用している。したがって「門を置く前に候補を選別する」という旧提案の一部は実装済み。しかし候補の開口と、広場から門・門から外への道路が全経路で通ることは別である。

A* は壁・川の辺、海、寺院、広場内部、Bramの核、城の予約領域、堀などを避ける。門候補が城内外へ抜けても、目的地への通路が詰まると案を捨てる。配置候補を飛ばすこと自体は `unconnected-gates` ではなく、**採用した門**が未接続であることを検査している。門が少なくなった場合は、後段の外縁道路不足として出ることもある。

2026-10-02 の追加事例（`l1nr46`、`ce-generation-failure-20261002-085522.svg`）では、上側の `gc:gate-1` に城外道路だけが接続し、城内道路が欠けていた。SVGの格子形状を再構成して確認すると、広場の最寄り頂点へのスナップが寺院の遮断辺に囲まれた頂点を選んでいた。多角形の広場は `faceIds` が空なので、従来の「広場の別頂点へ接続する」フォールバックに候補が無かった。多角形の各角に近い頂点も候補に加え、遮断制約を維持したまま別の角へ接続するよう修正した。再構成格子・既定設定で、修正前は同じ門の未接続、修正後は全門の交差検証と完成生成が成功する。SVGには元の格子シード・全生成設定が無いため、元入力そのものの再実行ではない。

追加事例 `kz6ecv`（`ce-generation-failure-20261002-094010.svg`）でも、右の `gc:gate-0` は城外道路だけが接続していた。自動形態ならこのシードはBramになる。Bramの城内道路は半径123 mの中心部外側で終わるが、最寄りの格子頂点が道路禁止半径118 mの内側へ入ると、その頂点の全辺が遮断される。提供SVGから再構成した格子でも、半径約116.5 mの頂点へ接続先を移すと失敗し、近隣の外側頂点なら接続できた。Bramの経路失敗時は、予定接続先から1区画サイズ以内にある禁止半径外の頂点も探索するよう修正した。海・壁・川・城・堀の通行制約は維持する。再構成格子に直線海岸・川through・城あり・広場なし等の設定を適用した再現ケースでは、修正前は2門未接続、修正後は両門の十字交差が成立し、後段の壁–川交差検証まで進む（その別の交差問題は残る）。元の格子シード・設定はSVGに無いため、提供された元入力そのものの完走を確認した結果ではない。

都市外堀ありで失敗が増えたという観測はあるが、道路探索前の形状もシードごとに変わるため、個々の案の直接原因まではこの集計で特定していない。改善調査は門候補ごとの城内・城外経路の可否、A*の遮断辺を記録し、実際に接続できる候補を選ぶところから始める。

### 2. 壁と川の共有辺・交差順、橋の3頂点条件が残る

`invalid-crossings` は33件。先頭詳細の28件が壁と川、5件が橋の頂点数だった。岬・川2本のTinyは交差だけで13件、最終失敗も2都市ある。

仕上げ前に `resolveRiverBoundaryOverlaps`、`joinWallRiverCrossings`、`openWallRiverMouths` で重なりを修復する。仕上げ後にも `straightenBridges` と `straightenGateCrossings`、evolutionでは `connectUrbanRiverDistricts` による孤立地区への追加橋がある。旧資料の「修復は計画段階だけ」「仕上げ後に橋を組み直すべき」という説明では現状を表せない。

それでも最終検証で共有辺・非十字・5頂点橋が残る。現行の検証は残存状態を示すので、平滑化が原因と断定するには、平滑化・街区整流・追加橋・門直角化それぞれの前後を比較する必要がある。まず処理ごとの交差診断を取り、破綻した地点で局所修復を行う余地を調べる。

川 `outside` は既定と同じ12シードで不採用14→1、交差4→0。ただし川1本かつ都市壁ありの場合だけ有効で、すべての地形に対する成功保証ではない。

### 3. 城の予約面が作れない、必須棟が入らない、城門が市街へ届かない

新経路の3理由は計23件。`citadel` が有効かつ `legacyCastles` でない場合に城の専用処理が入る。

- `castle-no-site`: 位置・関係・面積・川からの離隔・ロック面回避・内部配置の予備チェックを満たす予約面が無い。small / standard / largeの最低面積は2,500 / 5,000 / 10,000 m²、上限は30,000 m²。`central + integrated`、都市壁なしの `integrated` はコード上配置不可。autoは別の位置や、組込みから独立への配置も試す。
- `castle-layout-too-small`: `installCastle` が城門・庭・必須棟を置けない。または仕上げ後に内部配置の更新 / メッシュ検証が失敗する。同じreasonなので phaseだけでは両者を区別できず、messageも確認する。
- `castle-no-access`: 城門から既存道路（無ければ広場）への支線を確保できない。`finalizeCastles(..., true)` は内部配置・メッシュも確認するため、名前だけから支線探索だけの失敗とは断定しない。

Microのランダム地形では2都市が最後まで失敗した。`ce-audit-20261002:1` は岬・`greatBend` 1本・都市壁なし・城ありで8案すべて `castle-no-site`。`:2` は湾・`greatBend` + `straight`・都市壁と城ありで、城配置5、城形状1、門1、交差1だった。狭い陸域と城の必須面積が両立しない配置を疑う材料になる。

改善調査では都市全体の再抽選の前に、失敗が設定の矛盾なのか面積・形・接続の不足なのかを分け、autoの候補探索と城門の支線予約を確認する。

### 4. 外縁道路がサイズの下限に届かない

`too-few-external-roads` は13件で、すべて仕上げ前だった。Micro / Tinyは最低1本、Small以上は最低2本。FMG descriptor付きは下限0本。

計数対象は未ロックの `gc:road-*`。端点の原点からの距離が、近い側で都市半径の25%以上、遠い側でさらにブロック寸法の半分以上離れるものを数える。**地図枠への到達そのものや、独立した出口方向の数を検査しているわけではない**。城の支線や `gc:riverRoad-*` もこの外縁道路の計数対象ではない。

探索は枠へ到達する別出口も試し、枠から町へ保存する道路は町側から見て最初の枠接触点で切る。海岸の細い陸続き、門数の減少、川・城・堀による迂回不能などは不足の候補要因になる。旧資料の「岬に2本を要求する」がMicro / Tinyに直接当てはまるわけではない。

改善調査は、枠へつながる乾いた陸成分と門・道路の対応を記録する。本数下限を変える場合も、Small以上の実例とdescriptorの要件を分けて検討する。

### 5. evolutionの面が自己交差する

`self-intersecting-faces` は5件。Tinyの既定、岬、都市外堀、城、城と外堀の各条件で1件ずつ出た。旧資料の未観測という記述は現行試行では成り立たない。

検査はevolutionだけで、仕上げ後の全顔を `isSimplePolygon(facePoints(...))` へ渡す。`finishCityGeometry` 自身にも面の向き・面積・自己交差を守る制約があるが、最終状態の検査はその後の橋・門・城の更新も終えた位置で行う。この理由だけから平滑化単独の原因とは断定しない。失敗面IDと各処理前後のポリゴンを比較する必要がある。

### 6. 外堀への道路侵入と、今回未観測の保険条件

`roads-in-moat` は新しい判定だが今回は0件。堀は防衛回路の内側を除いた壁外の帯として導出し、門の橋の通路だけ道路を許す。A*でも堀を禁止帯にし、仕上げ後には**全roadグループ**の各辺を道路半幅 + 1 mの余裕付きで再検査する。手動 / ロック道路も後段の検査対象になる。未観測なのは、前段の経路選択で避けられた案と、門未接続で先に止まった案の両方を含む。

`urban-area-too-small` は充填全体が `πR²` の45%未満。海が市街地を圧迫する入力や `urbanNPatches` の小さい指定で到達し得る。Medium45% / Large20%の城壁内シェアとは別で、今回は0件。

`invalid-mesh` は短い辺、面の不正、featureの不連続、川のメッシュ離脱、門や城データの整合性などの検証エラー。`too-few-faces` は入力の最低条件。どちらも今回は0件であり、編集・読み込み・ロックを含む入力では別途確認が必要。

## 都市を不採用にせず、省略・調整するもの

見た目の不足と上記の失敗を混同しないための一覧。

| 処理 | 成立しないときの現行動作 |
| --- | --- |
| 川の端点・経路 | `walkRiver` の `fallback` を捨て、その川を省略。指定本数が残ること自体は完成の条件ではない |
| `outside` / `outsideNear` | 有効条件を満たさなければ通常の川へ戻る。距離の目標から外れただけではreasonを出さない |
| 港 | 海隣接セルを選ぶ。無ければ省略し、書込み時も内陸harborをmerchantへ戻す |
| 寺院 | 道路・川・壁・海岸・公園・墓地を避けて移動。置けなければ寺院要素を削除 |
| 墓地 | 時代に応じて場所を探す。候補が無ければ地区を追加しない。内部レイアウトを作れなければ新規planを省略し、既存planの更新時は内部を空にして境界を保持 |
| 港の船 | 水深・桟橋長・船型・陸 / 桟橋 / 他船との干渉に応じて小型化・泊地への移動・候補省略。0隻も生成失敗にしない |
| 住居・農地・水車・路地 | 描画時に海岸セットバック・城 / 史跡 / 堀の予約で除外または切詰め。住居数の下限は完成生成の不採用条件ではない |
| light / minimal表示 | 詳細を簡略化する。生成案の合否とは別 |

## ログの読み方と改善調査の優先順

一括生成の observer に渡される `GenerationSample` の `attempt`、`phase`、`failure.reason`、`message`、`counts`、`details` を保存する。UIは `city-generation-diagnostics` イベントでも採取結果を返す。最終失敗時のコンソールは `logGenerationFailures` が案ごとの理由を出し、集約の `all-attempts-rejected` を原因の件数から除く。進捗の日本語ラベルは複数phaseをまとめるので、原因の区別には生のphaseを使う。

今回の範囲で調べる順は、門と目的地の経路成立 → 壁・川・橋の処理前後の不変条件 → Microの城予約 → 堀と城門支線の整合性 → 自己交差面。旧資料の改善案のうち、門候補選別、仕上げ後の橋修復、孤立地区への追加橋はすでに実装されているため、それらがどの条件で足りないかを記録してから変更を考える。頻度順位だけを理由に条件を緩めることは、この調査の結論に含めない。

## 画面で失敗箇所を確認する

Generateパネルで「デバッグ：生成失敗の途中図を表示」をONにしてから生成する。ON時は最初の案が失敗した時点で再試行を止め、その不採用案を表示する。工程⑦〜⑩も失敗後の再試行を行わない。OFF時は従来どおり最大8案を試す。工程スライダーの生成で失敗した場合はその工程の途中図を表示する。赤い輪・辺・面は検証詳細で指摘された対象。位置の記録が無い城配置・面積・道路本数などの失敗では、関連領域を橙で示す。工程・理由・シードはパネルに表示する。

失敗プレビューの表示中は、ツールバーの「Export city map as SVG」から失敗時点の途中図をSVGへ書き出せる。強調表示を含む全体図を出力し、画面の移動・拡大には依存しない。手動編集後は現在の文書の形状を書き出す（診断メタデータは失敗時点の記録）。ファイル名は `ce-generation-failure-日時.svg`。工程・理由・Seed・検証詳細もSVG内のメタデータに記録する。

失敗時点の文書は「生成失敗の途中図」としてUndo履歴へ追加し、そのまま頂点の選択・Inspector表示・ドラッグ移動や通常の都市編集、保存を続けられる。「失敗箇所の強調を閉じる」、Escape、デバッグOFFは強調表示だけを閉じ、都市を生成前へ戻さない。生成前へ戻るにはUndoを使う。詳細ログと合わせて使い、橙の領域だけから原因の位置を断定しない。利用方法とスナップショットの受け渡しは[生成プロセスの失敗プレビュー](generation-process.md#失敗プレビューデバッグオプション)を参照。

## 再現方法

リポジトリルートで以下を実行する。格子・生成シード・設定は上の表と同じ。`all-attempts-rejected` を除いた不採用案を集計し、各案の詳細も出す。`console.warn` は港の無い水域などの補助警告を抑えるため、この調査プロセス内だけ無効にする。

```sh
node --import tsx --input-type=module <<'JS'
import { createGridDocument } from './src/city-editor/core/document.ts';
import { defaultGenerationSettings, generateCityOnDocument } from './src/city-editor/core/generate.ts';
import { randomSiteConfig } from './src/city-editor/core/gen/site/siteConfig.ts';
import { makeRng } from './src/city-editor/core/gen/prng.ts';
const cases = [
  ['tiny-default', 'tiny', 'evolution'], ['tiny-random', 'tiny', 'evolution'],
  ['micro-default', 'micro', 'evolution'], ['micro-random', 'micro', 'evolution'],
  ['tiny-no-river', 'tiny', 'evolution'], ['tiny-bay', 'tiny', 'evolution'],
  ['tiny-cape', 'tiny', 'evolution'], ['micro-cape-unwalled', 'micro', 'evolution'],
  ['tiny-outside', 'tiny', 'evolution'], ['tiny-town-moat', 'tiny', 'evolution'],
  ['tiny-castle', 'tiny', 'evolution'], ['tiny-castle-moats', 'tiny', 'evolution'],
  ['small-hex', 'small', 'hex'], ['small-voronoi', 'small', 'voronoi']
];
console.warn = () => {};
for (const [name, size, grid] of cases) {
  const base = createGridDocument({ size, grid, seed: 'ce-audit-20261002-mesh' });
  const counts = {}, runs = [];
  for (let i = 0; i < 12; i++) {
    const seed = `ce-audit-20261002:${i}`;
    const s = defaultGenerationSettings();
    if (name.endsWith('-random')) s.config = randomSiteConfig(makeRng(`${seed}:site`));
    if (name === 'tiny-no-river') s.config.rivers = [];
    if (name.includes('bay') || name.includes('cape')) {
      s.config.coast = name.includes('bay') ? 'bay' : 'cape';
      s.config.rivers = name.includes('bay') ? ['toCoast'] : ['toCoast', 'meander'];
      s.config.features.port = true;
    }
    if (name === 'micro-cape-unwalled') s.config.features.walls = false;
    if (name === 'tiny-outside') s.riverPlacement = 'outside';
    if (name.includes('castle')) s.config.features.citadel = true;
    if (name === 'tiny-town-moat') s.moats = { town: true };
    if (name === 'tiny-castle-moats') s.moats = { town: true, castle: true };
    const failures = [];
    let city = null, exception = null;
    try {
      city = generateCityOnDocument(base, s, seed, sample => {
        if (!sample.failure || sample.failure.reason === 'all-attempts-rejected') return;
        failures.push(sample);
        const reason = sample.failure.reason;
        counts[reason] = (counts[reason] ?? 0) + 1;
      });
    } catch (e) { exception = String(e); }
    runs.push({ seed, success: !!city, selectedSeed: city?.generationSeed,
      config: s.config, failures, exception });
  }
  console.log(JSON.stringify({ name, faces: Object.keys(base.mesh.faces).length,
    towns: runs.length, rejected: Object.values(counts).reduce((a, b) => a + b, 0),
    failed: runs.filter(r => !r.success).length,
    exceptions: runs.filter(r => r.exception).length, counts, runs }));
}
JS
```

関連実装の既存テストも確認した。`generationDiagnostics`、`generationWorkerClient`、`castleGeneration`、`riverEndpoints`、`riverFoldback`、`wards`、`moats`、`harborShips` の8ファイル・52テストが成功。テストで扱う配置とこの固定格子試行は範囲が異なるため、テスト成功は全シードでの生成成功を意味しない。

## 旧調査との扱いの違い

2026-09-28版はTiny既定24都市で不採用23案・最終失敗0、Microランダム16都市で不採用17案・最終失敗1などを記載していた。その試行のシードと入力格子は資料に残っていないため、同条件の厳密な再実行はしていない。

今回の資料は固定格子・固定シード・再現コマンドを明記し、城郭 / 外堀の新判定、仕上げ後の追加橋、川の省略、寺院や港が欠けても都市自体は成功し得る条件を加えた。改善効果の測定には、この再現条件を変更前後で揃えて比較する。
