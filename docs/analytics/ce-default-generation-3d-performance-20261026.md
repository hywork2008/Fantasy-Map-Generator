# CE単独・デフォルト都市生成と3D表示の性能調査

調査日: 2026-10-26。初回調査の対象コミット: `c81d3b683`。初回調査後の修正内容と再計測は末尾に記載する。

## 条件と計測範囲

- CE単独ページを、新規ブラウザーコンテキストで開く。
- 初期UI値: 人口5,000、Small、Voronoi、mesh-first、建物パターンmedieval、単城壁、3D品質High。
- 都市生成シードのみ `ce-default-perf-20261026` に固定。人口に基づくグリッド再生成もこのシードを使用する。
- ローカルVite開発サーバー、Playwright Chromium headless、1440 × 1000。
- 都市生成 → 初回3D表示 → 静止 → 2D → 3D再表示を1都市で計測。
- Workerの既存ProcessingProfiler、メインスレッドCPUプロファイル、WebGL draw呼出し、BufferGeometryのposition属性設定とdispose呼出しを記録。

絶対時間は開発ビルド・headless環境・計測器の影響を含む参考値。特にGPU処理を含むブラウザー外側の待ち時間は、通常ブラウザーの表示速度との比較には使わない。複数シードによる統計的な性能評価は実施していない。

集計値は同名のJSONファイルに保存した。

## 結論

明確な不要処理は3D側で3件確認した。優先順位は、農地合成による変更検知の誤判定、再表示時の強制再構築、静止時の連続描画の順を推奨する。生成側では農地処理が最大だったが、処理時間だけを理由に不要とは判断できない。

### 1. 同じ都市のsyncでも建物を再構築する

関係箇所:

- `src/city-editor/generators/blockInfill.ts#L315` と `:427`
- `src/city-editor/renderers/standaloneHousingAppearance.ts#L21`
- `src/city-editor/renderers/cityView.ts#L449`

`buildBlockFabric`はキャッシュにヒットしても、農地overlay/snapshotがあれば `{ ...cached.fabric, ...overlay }` を毎回作る。生成完了時のデフォルト都市には農地snapshotがあるため、この経路を通る。

その結果、元のbuildingsとfarmsが同じ参照でもfabric全体は別参照になる。High品質・単独CEの自動外観キャッシュはfabric参照をキーの一部にするため、外観割当ても再実行する。3Dは `fabric !== built` を変更と判定し、建物、細部、城壁、特殊建築、井戸、関連する空地層まで再構築する。

生成した同一CityDocumentを使った追加確認:

| 比較対象 | 連続2回の結果 |
| --- | --- |
| fabric全体の参照 | 不一致 |
| 元のbuildings参照 | 一致 |
| farms参照 | 一致 |
| 自動外観適用後のfabric参照 | 不一致 |
| 自動外観適用後のbuildings参照 | 不一致 |

同一都市・同一品質のまま直接 `sync()` をもう一度実行したところ、約330 ms、position属性設定1,136回、geometry dispose 931回が発生した。この追加確認では連続フレームとWebGL drawを抑止し、再構築そのものを調べた。position属性設定回数はユニークgeometry数や建物数を意味しない。

改善案: 元fabricとoverlayの組に対して合成済みfabricを再利用する。overlayが更新された場合の無効化は維持する。単にCityDocument参照だけでsync全体を省略すると、既存の直接編集や別途更新される農地overlayを見落とすため不適切。

### 2. 2Dから3Dへ戻るたびに建物を強制再構築する

`src/city-editor/renderers/cityView.ts#L591` の `built = null` により、シーンを保持していても再表示時には必ず建物変更扱いとなる。

実画面の再表示ボタン処理は約389 ms。初回に焼いた共有プロトタイプは再利用されるが、インスタンス層や通常メッシュなどの再生成・破棄は残る。

改善案: 保持済みのbuiltを再表示時に捨てず、既存の変更検知に任せる。ただし項目1があるため、この1行だけを直してもデフォルト都市の再構築は解消しない。2D表示中の都市編集、品質変更、地形変更を再表示時に正しく反映することと、カメラ初期化要求が反映されることを合わせて確認する必要がある。

### 3. 静止中も毎フレームWebGL描画を続ける

`src/city-editor/renderers/cityView.ts#L399` のtickは無条件に次フレームを予約し、`renderer.render`を呼ぶ。OrbitControlsのdampingはfalseであり、都市の常時アニメーションもこの経路にはない。

静止区間でも3フレームで1,215回のWebGL draw呼出しが発生した。静止中のgeometry生成・破棄は0回であり、細部LODの再生成が毎フレーム起きているわけではない。

改善案: カメラ変更、resize、都市更新、選択ハイライト変更、3Dを開く操作などで描画を要求する方式にする。カメラ変更時の細部LOD更新も同じ描画要求で実行する。close/dispose時の予約取消しは維持する。

## 初回3D表示の追加改善候補

初回3Dボタンの同期処理は約1,676 ms。position属性設定209,435回、geometry dispose 205,625回が発生し、プロトタイプ準備中の一時geometry処理が多い。これはユニークgeometry数ではなく、clone・変換・結合を含む属性設定の総回数である。

`src/buildings/houses/regionalHouses.ts#L921` はモデルを材質ごとに結合し、`src/city3d/three/bvInstances.ts#L17` はそのモデルをさらに非index化/clone、変換、頂点色化して再結合する。BV表示用モデルからCEプロトタイプへ変換する汎用経路なので、すべてが無駄という意味ではない。

項目1〜3の後に、CE用の焼成済みgeometryを直接返す経路や、形状と色違いの共有範囲拡大を検討できる。品質Highの外観・選択判定・材質・プロトタイプの参照管理を保つ必要があり、今回の調査だけで具体的な短縮量は断定できない。

## 都市生成側の観測

| 処理 | 時間 | Worker内生成時間に対する割合 |
| --- | ---: | ---: |
| Worker内生成全体 | 905 ms | 100% |
| farmland | 467 ms | 約52% |
| population-housing | 191 ms | 約21% |
| attempt-1 | 165 ms | 約18% |
| population-prepare | 9.5 ms | 約1% |

これらは同階層の主な計測区間であり、全処理の内訳を網羅する表ではない。Worker開始から結果受信までは約1,036 ms、UIで結果を受理するまでの計測区間は約1,393 ms。生成結果は170 faces、JSON文字数約168万。再試行はなく、成功した都市である。

生成では人口住宅の適合確認と農地snapshot作成が必要である。Workerと画面側のfabricキャッシュは共有されないため、表示側でのfabric構築も発生するが、それだけで不要な二重処理とは判断しない。今回の範囲では、生成アルゴリズムを変更するより先に、上記の3D側の確定した不要処理を除く方が影響を限定しやすい。

## 既に効いている省略と再利用

- 初回に3Dを開くまではWebGLRendererを作成しない。
- 非表示時はsyncを即時終了し、3Dの連続フレームを停止する。
- 道路・水・地形はstampで変更を判定し、毎フレーム作り直していない。
- 建物細部はカメラ行列・投影行列・画面高さが変わらなければLOD更新を省略する。
- BVプロトタイプの共有とInstancedMeshは既に使用している。

## 検証

実ブラウザーでのデフォルト生成・初回3D・静止・再表示、同一都市への連続syncを確認。ページ例外は0件。

関連既存テストのみ実行し、3ファイル・13テストが成功した。

```text
npx vitest run src/city-editor/renderers/cityView.test.ts src/city-editor/renderers/standaloneHousingAppearance.test.ts src/city-editor/generators/blockInfill.test.ts
```

既存テストは今回の不要処理がないことを保証するものではない。修正時には、農地overlayの変更だけを反映するケース、無変更のsyncと再表示、静止時の描画停止を対象に回帰確認が必要。

## 修正と再計測

上記の確定した3件と、初回3D表示の地域別住宅プロトタイプ生成を修正した。

- fabricキャッシュは元fabricと農地overlayから合成した結果も保持し、無変更なら同じ参照を返す。snapshotやoverlayの置換、入力の変更は引き続き反映する。
- 3Dを開く際にbuiltを破棄せず、既存の変更検知に任せる。カメラ初期化要求は、建物再構築がなくても反映する。
- 常時tickを廃止し、カメラ変更・リサイズ・都市更新・選択ハイライトの変更・再表示から描画を要求する。同一フレーム内の要求はまとめる。close/dispose時は予約を取り消す。
- 地域別住宅にCEプロトタイプ用の直接geometry生成経路を追加。小部品ごとのclone・非index化・geometry変換と、材質別モデルからの再結合を省く。共有プロトタイプの参照管理は維持する。BV表示用の生成経路も維持する。
- 再表示時の選択表示を従来どおり解除し、不要になった初回resizeの重複呼出しも除去した。

### 同じデフォルト条件・シードでの比較

| 項目 | 修正前 | 修正後 |
| --- | ---: | ---: |
| 無変更sync | 約330 ms | 約1.7 ms |
| 無変更sync中のposition属性設定 | 1,136回 | 0回 |
| 無変更sync中のgeometry破棄 | 931回 | 0回 |
| 再表示時のposition属性設定 | 1,136回 | 0回 |
| 再表示時のgeometry破棄 | 931回 | 0回 |
| 静止区間のWebGL draw | 3フレームで1,215回 | 約1.5秒で0回 |
| 初回3Dのposition属性設定 | 209,435回 | 18,026回 |
| 初回3Dのgeometry破棄 | 205,625回 | 15,232回 |

初回3Dのposition属性設定は約91%減少。回数はユニークgeometry数ではなく、clone等を含む属性設定の総回数である。

再表示ボタンの同期処理は約389 msから約1.9 msになった。ただし描画を次のrequestAnimationFrameへ移したため、これはクリックから画面表示までの時間の比較ではない。初回3Dの同期処理も約1,676 msから約1,350 msになったが、同じ理由から表示完了までの短縮率としては扱わない。

生成結果のCityDocumentは修正前と一致した。Worker内生成は約920 msで、今回変更していない生成処理の約905 msとの差は単発計測の変動として扱う。

### 修正後の検証

関連7ファイル・計38テストが成功。追加した回帰確認は、overlay合成結果の参照維持と更新反映、無変更syncと再表示時のシーン保持、必要時のみの描画と予約取消し、直接geometryの所有権、従来プロトタイプとの形状・法線・色の一致を対象とする。住宅の一致確認は5地域 × 2品質 × 切妻/寄棟で実施した。

TypeScript型チェック（`npx tsc --noEmit`）、変更9ファイルのBiomeチェックも成功した。

```text
npx vitest run src/city-editor/renderers/cityView.test.ts src/city-editor/renderers/cityViewRendering.test.ts src/city-editor/renderers/standaloneHousingAppearance.test.ts src/city-editor/generators/blockInfill.test.ts src/buildings/houses/regionalHouses.test.ts src/city3d/three/regionalHouseMeshes.test.ts src/city3d/three/bvInstances.test.ts
```

実ブラウザーでも初回表示・無変更再表示・静止時の停止・ホイール操作・ドラッグによる回転・リサイズ・地域別住宅の選択ハイライトと再表示時の解除を確認し、ページ例外は0件。ホイールとドラッグ後は描画回数が1→2→8に増え、その後の静止区間では8のまま維持された。スクリーンショットで建物・城壁・道路・河川・農地の表示も確認した。
