# 保存FMGの都市・街道・Directions抽出

`.fmg`のchunked ZIP形式（schema 1/2）をアプリを起動せず読み、都市・街道の接続先・外交・人口・城・市壁・河岸・軍事・経済の保存情報をJSON/CSVへ出力する。

## 指定ファイルのMochaを調べる

```sh
npm run audit:fmg-cities -- \
  temp/000.savdata/Triviers_2026-10-12-18-47.fmg \
  --output temp/triviers-mocha-audit --burg 347 \
  --distance-unit km --format both --expand
```

出力先は新規または空ディレクトリを指定する。既存の結果を上書きしない。入力を更新せず、生成・時間進行・保存値の補完も行わない。

この保存ファイルで確認した結果:

| 起点 | 人口 | group | 城 | 市壁 |
| --- | ---: | --- | --- | --- |
| Mocha#347 | 2099 | town | true | false |

| 接続先 | 関係 | 人口 | group | 城 | 市壁 | Directions表示距離 |
| --- | --- | ---: | --- | --- | --- | ---: |
| Cosonillo#287 | domestic | 1807 | village | false | false | 103km |
| Miniltabla#399 | Enemy | 1099 | village | true | false | 91km |

既定の移動手段選択はDirectionsの`pickDefaultMode`と同じ。この例はmountedが選択される。未丸め距離はそれぞれ102.53897750043281、90.98869031693359km。

Mochaにはこの2都市以外への接続もあり、海路も独立した行で出る。同じ都市への陸路と海路は統合しない。Directionsはその都市対全体で経路を探索するため、海路の接続行に記載されたDirections距離が陸路の距離になる場合もある。`routeGroup`・`directionsComposition`・`distanceBasis`を併せて確認する。

## よく使う指定

```sh
# 複数の起点。地理的な近傍と道路接続は別表
npm run audit:fmg-cities -- map.fmg --output temp/city-audit \
  --burg 347 --burg 399 --nearby-radius-km 150 --distance-unit km

# 全都市からの接続。JSONのみ
npm run audit:fmg-cities -- map.fmg --output temp/all-city-audit \
  --all --distance-unit km --format json

# Directionsで徒歩・海路回避を選んだ状態と比較
npm run audit:fmg-cities -- map.fmg --output temp/foot-audit \
  --burg 347 --distance-unit km --travel-mode foot --avoid-sea

npm run audit:fmg-cities -- --help
```

| オプション | 内容 |
| --- | --- |
| `--burg ID` / `--all` | 起点の指定。`--burg`は複数指定可。両者は同時指定不可 |
| `--output DIR` | 必須。新規または空ディレクトリ |
| `--format json\|csv\|both` | 既定both |
| `--expand` | 元JSONチャンクとtyped arraysを`raw/`へ展開 |
| `--distance-unit km\|mi\|lg\|vr\|nmi` | 保存されていない単位を指定。保存値と競合したらエラー |
| `--travel-mode auto\|foot\|mounted\|wagon` | 既定auto。全移動手段の結果も出力 |
| `--avoid-sea` / `--prefer-sea` | Directionsと同じ探索設定。同時指定不可 |
| `--height-exponent 1..5` | 高さ設定。未指定は保存値、なければ共通既定1.8 |
| `--nearby-radius-km N` | 直線距離の近傍検索も出力。近傍都市へのDirectionsも計測 |
| `--fail-on error\|warning\|never` | 既定error。該当検出があってもレポートは出力する |
| `--max-archive-mb N` | 圧縮前後それぞれのサイズ上限。既定512MiB |

## 出力と主な列

| ファイル | 内容 |
| --- | --- |
| `manifest.json` | 入力hash、保存形式、コードrevision、実行設定、距離・高さ設定の出典 |
| `report.json` | 完全な抽出結果。生都市／simulation都市、軍団、参照元も保持 |
| `burgs.csv` | 都市一覧。起点と到達先・近傍都市を出力。isOriginで区別 |
| `connections.csv` | 起点・保存route・前後方向ごとの最初の別都市。未解決も残す |
| `directions.csv` | 有向都市対・移動手段ごとの計測結果。経路セル列、陸海内訳、所要時間 |
| `nearby.csv` | 半径指定時のみ。地理的近傍 |
| `military.csv` | 地図全体の軍団・兵種別数量、現在地と基地座標、募集上限・未編成枠 |
| `findings.csv` | 整合性検出、分類差分、未評価項目と理由 |
| `summary.md` | 件数、起点都市、主な検出、実装範囲 |
| `raw/` | `--expand`時の元チャンク。typed array参照は元JSONのまま |

`--format json`ではCSVを、`--format csv`ではreport.jsonを作らない。manifestとsummaryはどちらでも出力する。

都市は`populationPersons`・`groupRaw`・`citadel`・`walls`・`riverId/riverBank`が主な確認項目。人口はsimulation側を優先し、人口ポイント×populationRate×urbanizationを人単位へ変換する。`ceProjection`はCEと共通のscale/role分類だが、保存groupとは別属性。

接続一覧では`sourceId/targetId`、`relationRaw`、`reverseRelationRaw`、`routeDistanceKm`、`directionsDisplayDistance`、`directionsMode`を確認する。`Enemy`と`Rival`は区別し、外交は起点→対象を採用する。state=0同士は自国扱いしない。

距離は右クリックDistance from/toの**Directionsと同じ共通関数**で計測する。`routeDistanceKm`は未丸め値、`directionsDisplayDistance`はダイアログと同じ整数丸め。`rawPathDistanceKm`は保存routeの点列に沿った補助値で、Directions距離とは異なる。`directions.csv`のcells/kindsで実際に選ばれた経路を確認できる。海路回避でも陸路がなければ海路へfallbackするので`seaRequiredDespiteAvoid`も確認する。

現行Directions関数は`distanceUnit`を参照せず`distanceScale`で計測する。このため、保存単位が不明でも返却値を`distanceValue`として保持する一方、`routeDistanceKm`等の物理km値は単位をkmと確認できた時だけ出力する。mi等を指定した場合もDirectionsの返却値・表示ラベルを保持し、kmの主列へ未検証の換算値を入れない。生route・直線距離の補助値は`mapUnitMeters`で換算する。

軍事の`militarySameCellUnitsRaw`は都市セルにある軍団の兵種別数量、`militaryStateUnitsRaw`は所属国家全体の兵種別数量。`military.csv`の`sameCellBurgIds`で対応を追える。艦船・砲・人員を合計した「兵員数」は出さない。募集上限、plannedUnits、childrenを現役へ加算しない。同一セルの部隊がその都市専属の守備隊とは限らない。欠損rosterは0兵と解釈しない。

JSONの欠損値はnull、CSVでは空欄。0・falseは値として保持する。CSVはUTF-8、引用符・改行をescapeし、数式として読まれ得る文字列には先頭`'`を付す。元の名称はJSONに保持する。各データのevidenceはチャンク名とJSON pointer。

## 現時点の範囲

都市・生街道・Directions・軍事／経済／河岸の保存事実と基本整合性まで実装した。CE道路の共通投影と引渡し参照との照合まで実装済み。CLI単独での登録陸路snapshot復元、史料プロファイルによる歴史的自然さの判定、城位置・建物分布の判定、橋の斜交判定は後続作業。該当findingは`skipped`とし、合格扱いしない。`--rules`はまだ未対応。

保存経路の接続一覧は`connectionKind=stored_route_next_burg`。共通処理で読めたCE投影は追加列と`ceRoads.csv`へ出力する。登録陸路の準備済み参照がない場合は`ceCompatibility=requires_registered_snapshot`と表示する。

終了コードは0=正常、1=引数・入力・出力の失敗、2=レポート出力成功かつfail-on条件の検出。大きな全都市監査では、都市対ごとに3モード探索するため時間がかかる。グラフは一度構築し、同一都市対の結果を再利用する。

検証: `npm run test:fmg-audit`。既存の単純展開は従来どおり`npm run extract:fmg -- ...`を使用でき、同じarchive readerで検証・復号する。

## CE道路との照合（Phase 2）

保存時点の道路を、FMG描画とCEで共用する読取処理へ渡し、`ceRoads.csv`へ投影する。CLIは道路を生成・修復しない。街道のセル位置へのスナップ、必要な中間点、海岸迂回、同一都市セル内の始点選択、次の都市、入口方位、交通順位は共通実装を使用する。

追加出力:

- `connections.csv`の`ceTargetId`、`ceNextBurgDistanceMeters`、`renderedPathMapUnits`、`ceNextBurg`。Directionsの都市間距離は従来の列を維持する。
- `ceRoads.csv`: 1行1入口・分岐・処理段階。入口方位、次都市、距離、外交、人口、城、市壁、交通順位、入口形状と枝道形状。
- `ceDifferences.csv`: CE引渡し参照とのフィールド単位の差。JSON pointer形式のfield、投影値、観測値を保持する。

保存ファイルには共有渡河施設の準備済み状態が全て含まれているとは限らない。登録陸路もIDだけから有効な物理経路と認定しない。通常のCLI実行で復元できないものは`partial_saved_projection`／`skipped`とする。`frameSource=population_window`は人口から算出した初期表示範囲で、河川・渡河施設に合わせて拡大した実際のCE表示範囲とは異なり得る。

### 実際の引渡しを指定する

```sh
npm run audit:fmg-cities -- \
  temp/000.savdata/Triviers_2026-10-12-18-47.fmg \
  --output temp/triviers-ce-comparison --burg 347 --distance-unit km \
  --ce-handoff temp/triviers-mocha-ce-handoff.json
```

参照JSONには`format=fmg-ce-road-handoff`、schemaVersion、入力ファイルSHA-256、mapId/seed、burgId、準備前後の道路入力revision、正確な表示座標系、CEへ実際に渡したroads、読取に使用した準備済みroute／描画点／共有施設／登録陸路端点を含める。単独のdescriptor JSONは入力同一性が確認できないため受け付けない。別ファイル・別地図・異なる準備前revisionの参照は比較を拒否する。

比較段階:

| stage / comparison | 意味 |
| --- | --- |
| `saved_projection` / `saved_inputs_vs_handoff` | 保存入力からの投影と実際のCE引渡しの差。ここでのみ元の保存データを使う |
| `captured_projection` / `captured_inputs_vs_handoff` | CEが準備・検証した読取入力を共通処理で再生し、実際の引渡しと照合 |
| `observed_handoff` | 参照JSONに保存された実際のCE引渡し |

参照がある都市は同じ表示範囲を使用し、`frameSource=handoff_reference`とする。共有渡河施設は入口をまとめつつ、各routeの遠岸側の枝道・行き先を残す。登録陸路は実行時の既存validatorが認定した端点を参照から受け取り、逆向き・橋手前での切り詰めもCEと共通の処理で再生する。これは登録陸路をCLI単独で再認定する処理ではない。

`CE_PREPARATION_CHANGED_INPUT`はCE準備で地図全体の道路入力が変わったというwarning。都市立地の異常判定ではない。保存入力との差分と、準備済み入力を再生した一致／不一致を分けて確認する。参照の再生結果が全フィールド一致した時だけ`CE_HANDOFF_MISMATCH=pass`となる。参照なし・未解決入力はskippedで、合格にはしない。

### 参照JSONの取得と受入検証

実行中のFMGでは`src/services/burgSiteDescriptor.ts`の`getBurgRoadAuditReference(burgId, inputSha256)`が参照を作る。識別した保存状態を用意してから、CEを開いたり編集したりする前に呼ぶ。この関数は実際のCE引渡し関数を実行するため、実行中の世界では通常のCEと同じ準備処理が走る。

元ファイルを変更せず、隔離した世界のコピーで指定保存ファイルの参照を取得・検証するローカル受入テストも用意した。

```sh
FMG_AUDIT_ARCHIVE=temp/000.savdata/Triviers_2026-10-12-18-47.fmg \
FMG_AUDIT_BURG=347 \
FMG_AUDIT_REFERENCE_OUTPUT=temp/triviers-mocha-ce-handoff.json \
npx vitest run src/services/burgRoadAudit.archive.test.ts
```

これは既存のCE引渡し関数をテスト環境で実行する。実際に読み込まれたUIが保存後に再生成した場合は準備前revisionが変わるため、保存状態との直接比較は拒否される。上記の受入テストは保存状態のコピーから始め、CE準備による変化を別段階として記録する。

`FMG_AUDIT_REFERENCE_OUTPUT`は任意で、指定時はそのファイルへ参照を書き込む（既存なら置換）。参照ファイルのSHA-256も監査manifestに記録し、実行中に参照が変更された場合は出力を中止する。入力保存ファイルは更新しない。
