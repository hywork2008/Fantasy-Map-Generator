# CE リファクタリング Phase 7 総合検証・移行完了

状態: Phase 7完了。実施日: 2026-10-14。着手時: `38eb5c267381df5bb8272f794b2251cd45b60d90`。移行前比較: Phase 0の`cf32584ecfe5e2e510e8f01e536184db00791b3d`。
設計: [アーキテクチャ規約](../architecture.md)。工程: [ロードマップ](../plan/architecture-refactoring-roadmap.md)。前工程: [Phase 6](1014-ce-refactoring-phase6.md)。機械可読の集計・hash・残存関数一覧: [検証manifest](1014-ce-phase7-validation.json)。再実行: [Phase 7検証ツール](../../../scripts/city-editor/phase7/README.md)。

## 1. 破棄後の保持を2か所修正

`mountCityEditor`の戻り値が`() => scope.dispose()`だったため、呼出し側がdisposerを保持すると、V8の共有closure contextを通して文書・履歴・controllerが残った。`scope.dispose.bind(scope)`へ変更し、返す関数の参照先をlifetimeだけに限定した。listener等の解除手順・画面操作・APIの引数と戻り値の型は変えていない。

`ferryLanding.ts`のWeakMapはconnectionをkeyにし、valueに文書を強く保持していた。connectionは履歴・輸入snapshotと共有されるため、weak keyだけでは旧文書を解放できない。valueの文書をWeakRefへ変更した。文書とriverFlowsのidentityによる再利用・無効化、渡し船の輪郭計算は同じ。connectionが生存する間は最大一件の派生plan/flow参照が残り、connection回収・再利用で解除されるが、文書全体を保持しない。所有の表は`renderers/derivedCaches.ts`に反映した。

同じ検証runner・固定seedで、旧実装は着手コミットの当該2モジュールをGitから読み、他の条件を揃えて比較した。製品に診断global・exportを追加していない。

| 強制GCによる境界検証 | 修正前 | 修正後 |
| --- | ---: | ---: |
| 3 mountのdisposerを保持したdispose後の文書 | 3件残存 | 0件 |
| 同条件のsession state | 3件残存 | 0件 |
| disposer解除後の文書 | 0件 | 0件 |
| 外部でconnectionを保持した場合のferry文書 | 残存 | 回収 |
| fabricの弱いkey文書 | 回収 | 回収 |
| 各mountで20回minimize/restoreしたlistener | 194→194 | 194→194 |
| dispose後のlistener/timer/frame/cleanup | 全件0 | 全件0 |

文書置換を含む6件の文書と3件のsessionをWeakRefで観測し、保持したdisposerが文書を残さないことを確認した。新しい長寿命の強参照・cache所有者・全体cloneは追加していない。履歴は利用中のmountが所有し、mountを破棄した後にdisposer経由で残らない。

## 2. テスト・型・依存・実ブラウザー

| 検証 | 結果 |
| --- | --- |
| 最終CE関連全体 `npx vitest run city-editor --maxWorkers=4` | 185ファイル: 177成功、8skip。1,405件: 1,386成功、19skip、失敗0。383.78秒 |
| FMG preview・i18n・道路scene・lifecycle等の対象検証 | 7ファイル: 6成功、1skip。48件成功、2skip。全体と重複する件数を加算しない |
| 追加したFMG→CE handoff境界 | 3件成功。最終CE全体にも含む |
| 追加したferry cacheの再利用・別文書/flow置換 | 2件成功。最終CE全体にも含む |
| `npx tsc --noEmit` | エラー0 |
| 変更対象Biome、`git diff --check` | 指摘0 |
| `node --import tsx scripts/lint-architecture.ts` | CE違反0。既存FMG allowlistは3辺のまま |
| 最終inventory | runtime 306、runtime循環0、生成から上位層への辺0、CE内の旧パス参照0 |
| CEだけのVite production build | 334モジュール。HTML、CE entry、generationWorkerの出力成功 |

最初の全体実行は1,380件成功・1件timeout・19skipだった。失敗はPhase 1でも記録された「① reveals the coastline walk…」の120秒timeoutで、単独再実行は87.29秒で成功した。この実測を最終成功の件数へ置き換えていない。

このテストは「vertex 1」と最初の1点を期待するのに、ループの脱出条件が2点以上で、新都市の完全生成を最大12回繰り返していた。初期gridと生成seedをmount前から`phase7`に固定し、最初の1点→次の1点増加を直接確認する形へ変更した。海面を表示しないこと・status・点数増加のassertionは維持し、timeoutを延長していない。修正対象3件の実行は2.22秒、その後に全体を再実行して上記の最終結果を得た。その他のランダムUIテストまで一括変更していない。

実ブラウザーでは、検証用CE MPAにAtheiateのFMG descriptorをsessionStorageで渡し、実Workerによる完了（118 blocks、7 groups、valid）、Undo/Redo、JSON/SVGの実ダウンロードとファイル読込を確認した。native保存の再符号化、読込文書からのSVG再出力、読込前後の表示SVGは完全一致。実Workerの開始直後のcancelでもbusy解除、cancel非表示、既存SVG不変を確認した。対象navigation後のconsole errorは0。結果JSON・PNG・実出力をartifactに保持する。

FMG側は`openCityEditorForBurg`からstorage/URLを介してCEの実parserまで通す境界テストを追加し、descriptor不在・storage拒否で開かないことも確認した。FMG本体の地図画面で右クリックメニューを手動操作したとは扱わない。独立MPAと受渡し契約・実consumer・実Workerをそれぞれ検証した。固定要素、橋の共通斜交判定、城壁閉鎖、輸入approach・外部道路接続は既存の`features`/`passages`/`bridgeDeck`/`townDefenseClosure`/`fmgHandoffGeneration`等を含む全体テストで確認した。

8ファイル・19件のskipはarchive入力や環境変数で有効化する既存のCLI等。成功件数に含めない。廃止予定CGはソース調査・変更・比較snapshotへの収録をしていない。

## 3. 8都市・136段階と保存出力の比較

移行前のCEと共通FMGソースをartifactの隔離ディレクトリへGit archiveから展開し、同じworkspaceのnode_modulesを使用した。生成・描画・parser・保存出力は各版の実装を使い、共通の未正規化JSON要求・seedを渡した。旧版にreset APIがないcacheだけ、使い捨てVite runnerで既存LRUのclearとward cache解除を公開して条件を揃えた。

Atheiate、Erente、Gothengsfeld、Hekus、Circulade、Bram、二重城壁の内側先行・外側先行の8ケースを比較した。

- 完全生成の文書・SVGは移行前と一致し、Git管理するPhase 0 manifestのhashとも全8件一致。
- native JSON出力、読込文書、読込後のSVGも移行前・現在で全8件一致。
- 17段階×8ケースの136比較は、段階の並び・checkpoint・採否・文書・SVGが全件一致。134件が生成、Erenteの`streets`と`wards`の2件は両版とも不採用。nullを生成成功扱いしていない。
- 完全生成と各段階の描画で入力・文書が変わらないことを確認した。

ID・座標・配列・レイヤー・SVG属性の順序を正規化していない。ブラウザーsmokeはその画面自身の保存往復の比較であり、別の初期gridを使うCLI出力との同一性を主張するものではない。

## 4. 大都市の性能・保持メモリ

同じNode v22.23.1 / Apple M4 / darwin arm64、同じJSON要求、1回warm-up後3反復、同じcold-cache/GC地点で順次計測した。4.8 kmのLarge/Evolution、陸地、classic、城壁なし、legacy建物、seed `render-quality`。出力は130 faces、81,523 building paths、136,716 SVG要素。全試行で文書・SVGのhash・要素数が一致した。

| 中央値 | 移行前 | 現在 | 差 |
| --- | ---: | ---: | ---: |
| 生成 | 228.92 ms | 227.57 ms | −0.59% |
| 単独SVG構築（全詳細） | 5,250.85 ms | 5,215.85 ms | −0.67% |
| 文書とSVGを保持しGCしたheap | 1,287.39 MiB | 1,286.27 MiB | −0.09% |
| 文書/cache解放・DOM window終了後のheap | 120.07 MiB | 119.03 MiB | −0.87% |

計測した差は1%未満で、3試行から性能改善を主張しない。生成の範囲は移行前225.21〜269.31 ms、現在225.27〜235.26 ms。描画は移行前5,130.00〜5,300.88 ms、現在5,214.37〜5,222.54 ms。処理分離による大きい退行はこの条件では観測しなかった。

各回の終了後は入力文書・生成文書・SVGのWeakRefすべてが回収済み。これはNode/jsdomのheapで、GPU・ブラウザーframe timeではない。DOM windowを使い回す予備計測では、jsdomのselector cacheに最後のdetached SVGが残ったため、両版ともwindowを閉じて置換してから終了後heapを計測した。予備結果は`*-live-dom.*`として保持し、製品の文書保持と混同していない。

最初に試したdefault設定のLarge要求は移行前で生成不採用だったため性能値に使っていない。要求と失敗ログは保持し、設定を明示した上記の共通要求を両版に渡した。生成を成功扱いするためのアルゴリズム変更はしていない。

## 5. 残る大きいファイル・関数

1,000行超のruntimeファイルは12件。名前付き関数宣言の150行超は90件、追加の匿名/arrow/methodの150行超は7件（親関数との重複を含む）。全件の名前・行番号・長さはmanifestに保持する。行数だけで分割せず、所有・依存・責務の混在を点検した。

| モジュール | 行数 | 残す責務・理由 |
| --- | ---: | --- |
| `components/CityEditorPage.ts` | 2,690 | 4所有状態の初期化、画面構築、live API/getterの配線、起動。mount 2,583行にはfactory・adapterの宣言も含む。生成・描画・ツール本体は担当moduleへ委譲する。closureの実保持問題は今回のdisposer修正で解決 |
| `generators/passages.ts` | 1,860 | 道/壁/川が会うメッシュの分割・通行口・橋/門の整合性。`splitBarrierPassageFace`と内部`splitInSector`は同一編集の局所状態・ID順を保つ処理 |
| `renderers/shipSvg.ts` | 1,816 | 4船種のSVG形状・回転handle。最大704行はbargeの形状記述。都市に船を生成する判断は持たない |
| `renderers/templeSvg.ts` | 1,621 | 4寺院様式のSVG形状と描画選択。最大708行のbasilicaは装飾形状。配置・用途の変更はしない |
| `generators/aerialLandmarks.ts` | 1,253 | 施設の配置探索と占有条件、文書をkeyにする弱い派生cache。描画と占有輪郭の共通読取りは分離済み |
| `generators/innerTownWall.ts` | 1,230 | 旧城壁・二重城壁の容量、建設、接続と失敗理由。複数段階を明示的な結果で返し、UI/DOMを持たない |
| `generators/interior.ts` | 1,143 | 城壁内の頂点・交差・道路・河川gateの幾何修復。メッシュ整合性を保つドメイン処理 |
| `generators/frameRoads.ts` | 1,062 | FMG外部道路の表示枠への接続・乾地クリップ・橋。共通橋規約を利用し、UI/描画へ依存しない |
| `renderers/castleLayoutBuilder.ts` | 1,018 | 既存castle planを様式ごとの表示輪郭へ変換。メッシュや恒久castle情報を編集しない |
| `controllers/inspector.ts` | 1,015 | feature別のInspector controlと編集意図の調停。共通のcommit・undo経路へ渡す。一つのInspectorのlifetimeで管理 |
| `generators/wards.ts` | 1,014 | 都市program・立地評価による用途割当、港・寺院・墓地の一貫した割当。RNG/走査順を共有する同じ工程 |
| `generators/features.ts` | 1,001 | メッシュ上のfeature groupの編集・経路・参照の整合性。DOMも現文書globalも持たない |

Phase 4が点検を残した`landscape.ts`（951行）は地形theme・自然表現の描画専用処理、`townFabricSvg.ts`（403行）は準備済みtown factsの描画とlayer planの組立てとして維持する。

残る長い関数も責務ごとに確認した。panel/controller factoryはcontrol・event・操作APIを一つのlifetimeへ束ねる構築単位で、長い引数型や子関数も長さに含む。tool callback 3件はそれぞれclick/context/pointer-downの入力dispatchで、ドメイン処理を操作APIへ委譲する。生成のpipeline/attempt/assembly/roads/施設配置はRNG・ID・走査・失敗の順序を守る単一工程。`repairRiverWalls`の内部reroute/separateNearBanksと道路routerの長いcallbackは、その工程内の候補探索・採用単位として維持する。描画の長い関数は形状・theme・layer専用、`wallRingLab`はCLIの試行・集計専用である。

上位層への逆依存や新しい正本文書の複製先を行数対策として増やさない。今後これらに異なる責務を追加するときはその担当moduleへ分ける。今回必要だった追加修正は参照所有の2点であり、アルゴリズムの再設計や機械的なファイル分割は行っていない。

## 6. 完了と残す境界

Phase 4に残った大きい描画moduleの理由付け、Phase 5の破棄と参照所有、Phase 6の依存規則を上記で総合確認した。移行完了に必要な未実施項目はない。公開操作、MPA、保存形式、同じ入力の生成/描画、橋の共有規約を維持した。

| 残す事項 | 担当module・影響・次の対応 |
| --- | --- |
| 旧`core/document.ts`窓口 | 廃止予定CGの文書利用者向けだけ。現行CE/FMG/CLIは利用しない。CG撤去と同時に削除し、新規参照はlintで禁止 |
| Erenteの途中2段階の不採用 | `generators/generation/previews.ts`。移行前と同じ採否で完全生成は成功。途中段階の採否改善は入力・seed付きの生成改善として別変更 |
| 巨大な全詳細SVGのコスト | `renderers`。81,523棟の今回のcaseは約5.2秒・DOM込み約1.29 GiB。移行前と同程度。細部集約/DOM方式/出力最適化は計測を添えた別変更 |
| その他のランダムUI試行とopt-in archiveテスト | 関連test module。今回以外の入力固定や全archive網羅は別のテスト整備。今回の成功とskipの範囲を混同しない |

生ログ・入力・出力・比較JSON・PNG・snapshot・buildはGit管理対象外の`artifacts/city-editor/phase7-20261014/`。以前のapproval reviewが使用量制限で検証server停止を実行できなかったが、再開時に当該serverが稼働していないことを確認した。検証browser tabも終了済み。
