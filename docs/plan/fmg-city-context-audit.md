# FMG都市・街道・防衛文脈の抽出／監査スクリプト設計

作成日: 2026-10-15  
状態: 設計。今回の成果物は本書であり、抽出・監査スクリプトの実装は後続作業とする。

## 1. 目的と対象

保存済み `.fmg` をアプリケーションで開かずに読み、都市から伸びる各街道の行き先、所属・外交、人口、軍事、城・市壁、経済、河岸の情報をJSON／CSVへ出力する。CEへ渡す上流のFMGデータについて、立地・防衛・経済の説明に必要な事実を追跡できるようにする。

主な用途:

- fortの立地を国境、敵対勢力、交通の結節点、渡河施設、港、資源、生産・補給、過去の所有者と照合する。
- 街道の行き先と通過交通の経済的重要性を調べ、CEで街道沿いに多数の建物ができる原因を切り分ける。
- 河川沿いの都市の所在河岸と敵味方の方向を確認し、都市重心や城の配置を検討する材料を得る。
- FMGの保存値、CE引渡し時の派生値、監査用の仮説を区別し、生成ロジック改善の根拠を残す。

対象はFMGとCE連携。廃止予定のCGは参照・変更しない。保存ファイルの修正、地図の再生成、時間進行、CE建物生成、史実との自動的な適否断定は対象外。

## 2. 現行コード・実ファイルで確認したこと

### 2.1 参照元

| 参照 | 本設計に関係する責務 |
| --- | --- |
| `scripts/extractFmgArchive.ts` | ZIP展開、manifest読取、typed arrayの一部参照、`--burg`診断。既存CLIを維持する |
| `src/runtime/worldArchive.ts` | 保存形式、バージョン、特殊値・typed array等のシリアライズ契約 |
| `src/runtime/simulationBurgState.ts` | population/product/treasury/demographicsのsimulation側所有と実行時互換投影 |
| `src/services/burgSiteDescriptor.ts` | CEの人口、街道の分岐、最初に到達する都市、外交、役割、河川・共有渡河施設 |
| `src/generators/routes-generator.ts` | `getRenderPoints`による実描画経路の整形 |
| `src/generators/worldLandConnectionArchive.ts` | 登録陸路と河川形状の整合した復元 |
| `src/controllers/mapContextMenu.ts` | 右クリックDistance from/toから`computeDirections`を呼ぶ入口 |
| `src/services/travelDirections.ts` | Directionsと共用する都市間経路探索・距離計測、移動手段の既定選択 |
| `src/ui/dialogs/DirectionsDialog.tsx` | 移動手段・海路設定、`rn(route.distanceKm)`による距離表示 |
| `src/utils/mapUnitMeters.ts` | CE形状・補助距離の単位換算 |
| `src/types/models.ts`、`src/context/simulationContext.ts` | 都市、軍団、simulationの型 |
| `src/utils/bridgeSkewPolicy.ts` | 橋の斜交判定の唯一の基準 |

現行CEでは、都市を通過するrouteを前後に分け、各方向で最初の別都市を `nextBurg` とする。これは地理的最近傍でも、道路網全体の最短経路でもない。登録陸路、共有渡河施設、海路には別の処理がある。

`buildBurgSiteDescriptor`周辺には河川・道路の準備やmorphology初期化があるため、監査CLIから無条件に呼び出さない。保存値監査で生成・補完を実行すると、入力の不具合を隠す恐れがある。

### 2.2 都市間距離の正式な計測元

呼出し経路は `mapContextMenu.openDirectionsForBurgs` → `travelDirections.computeDirections(fromBurgId, toBurgId, options)` → `DirectionsDialog`。都市間距離にはこの関数の共用コアを必ず使用し、CEのnextBurg.distanceMetersや生routeの累積長で代用しない。

- `computeDirections`はlandRouteGraphとseaRouteGraphを構築し、foot/mounted/wagonごとに勾配等を考慮したコストで探索する。距離最小の経路を選ぶ処理ではない。
- 返却値は各移動手段のavailable/reasonKeyと、routeのcells、kinds、composition、distanceKm、landDistanceKm、seaDistanceKm、durationDays、ascentM/descentM等。
- distanceKmは選ばれた経路のセル中心間距離にdistanceScaleを掛けて合計する。CEの描画点列の距離とは別契約。
- `avoidSea`と`preferSea`を記録する。avoidSeaでも陸路がなければ混合経路へfallbackするため、`seaRequiredDespiteAvoid`も必須。`preferSeaNoEffect`も保持する。
- 初期選択は`pickDefaultMode(result)`で所要時間が最短の利用可能な移動手段。同時間時の優先順はwagon、mounted、foot。ダイアログで手動選択した場合はそのmodeを指定して比較する。
- ダイアログは`rn(route.distanceKm)`と表示単位ラベルを出す。現行計測関数はdistanceUnitを参照せずdistanceScaleを使用するため、監査側で独自換算してから同名のDirections値へ上書きしない。元返却値・表示ラベル・物理単位の確定状態を別々に記録する。
- CLI対応時はworldContext・options store依存を明示的なcontext引数へ切り出し、UIの`computeDirections`もその同じコアを呼ぶ。アルゴリズムを監査側に複製しない。heightExponentも実効値と出典を記録する。

### 2.3 指定ファイルの実査

対象: `temp/000.savdata/Triviers_2026-10-12-18-47.fmg`

- ZIP形式、manifest.format=`fantasy-map-generator`、schemaVersion=`2`、appVersion=`1.125.1`、endian=`little`。
- `map/world.json`、`simulation/core.json`、`presentation.json`、`typed-arrays/*.bin`を含む。
- populationRate=`1000`、urbanization=`1`、distanceScale=`4.297319201995013`。
- historicalPeriod=`ageOfExploration`、options.year=`339`。
- 都市基本レコードには人口がなく、`simulation.burgs[id].population`に保存されている。

人口は `round(populationPoints × populationRate × urbanization)` で以下になる。

| ID | 名称 | 人口（人） | group | state | citadel | walls | riverId / bank |
| --- | --- | ---: | --- | ---: | --- | --- | --- |
| 347 | Mocha | 2099 | town | 10 | true | false | 25 / right |
| 287 | Cosonillo | 1807 | village | 10 | false | false | 25 / left |
| 399 | Miniltabla | 1099 | village | 11 | true | false | 95 / right |

**ユーザー例との差異:** 保存値の `states[10].diplomacy[11]` は `Enemy`。例示のrivalへ置換しない。都市のgroupとCEのscaleも別項目とする。現行CEのscale判定はgroupだけでなく人口ポイントも参照するため、townのMochaを他都市から参照した場合はvillage判定になり得る。

Mochaのセルに接する保存routeは253/360（trails）、499/506（searoutes）。生のpointsをたどった場合、253はCosonillo#287と都市#525へ、360はMiniltabla#399へ、499はCosonillo#287へ、506は都市#140へ到達する。

距離単位をkmと仮定した生のpointsの累積距離は、253→Cosonilloが約101.861km、360→Miniltablaが約90.356km、499→Cosonilloが約24.586km。**Directionsの都市間距離ではない。** ユーザー例の103km／91kmは、右クリックDistance from/toで開くDirectionsダイアログの表示値である。都市間距離の正式な計測元は`computeDirections`とし、同じ移動手段・海路設定・高さ設定で得た結果と表示丸めを照合する。海路と陸路を都市対だけで統合しない。

このファイルのworld.optionsにはdistanceUnitがない。現行UIの既定値はkmだがlocalStorageに依存するため、保存ファイルだけから当時の表示単位を断定できない。

## 3. CLIと成果物

新規CLI案: `scripts/auditFmgCityContext.ts`、npm script案: `audit:fmg-cities`。

```sh
# 明示した都市の街道と周辺文脈をJSON/CSVへ出力
npm run audit:fmg-cities -- \
  temp/000.savdata/Triviers_2026-10-12-18-47.fmg \
  --output temp/triviers-city-audit --burg 347 \
  --distance-unit km --travel-mode auto --format both --expand

# 全都市。近傍検索は明示した半径内で別表へ出力
npm run audit:fmg-cities -- map.fmg --output temp/all-city-audit \
  --all --nearby-radius-km 150 --distance-unit km --format both
```

上記は実装後の利用例で、現時点では実行できない。

| 引数 | 契約 |
| --- | --- |
| 入力パス | 初版はchunked ZIP形式。旧形式は明示的にunsupportedとして終了 |
| `--output` | 必須。新規または空ディレクトリのみ。入力と同一パスは禁止 |
| `--burg <id>` / `--all` | いずれか必須。`--burg`は反復可能。存在しない／削除済みIDは説明付きエラー |
| `--format json\|csv\|both` | 既定both |
| `--distance-unit` | 保存された有効な単位がなければ換算に使用。保存値と競合すればエラー。未知単位は拒否 |
| `--travel-mode auto\|foot\|mounted\|wagon` | 既定autoは`pickDefaultMode`。全modeの結果もJSONに保持 |
| `--avoid-sea` / `--prefer-sea` | Directionsと同じ探索オプション。CLIでの同時指定は拒否。既定は両方false |
| `--height-exponent` | Directions探索に使用する高さ設定。保存値がなければUIと共通の既定値を使い、その採用根拠を記録 |
| `--nearby-radius-km` | 指定時だけ地理的近傍表を追加。正の有限値 |
| `--expand` | `raw/`へ元チャンクを保持して展開。指定なしでも必要チャンクはメモリで復号 |
| `--rules <path>` | 監査プロファイル。未指定はデータ整合性ルールのみ |
| `--fail-on error\|warning\|never` | 既定error。実行エラーと監査検出を区別 |

出力構成:

```text
manifest.json          入力SHA-256、保存バージョン、時刻、単位根拠、CLI引数、実装revision
report.json            正規化データ、CE互換投影、根拠、監査結果の完全版
burgs.csv              1行1都市
connections.csv        1行1起点都市・route・方向・branch（到達先未解決も残す）
directions.csv         1行1有向都市対・移動手段・海路設定。共用計測関数の結果
nearby.csv             任意。1行1起点・近傍都市。道路接続とは独立
military.csv           軍団・兵種別の事実と都市への関連付け
findings.csv           1行1監査結果（skippedも含む）
summary.md             件数、主要検出、欠損、使った仮定
raw/                   任意。元チャンクとtyped arrays
```

`--burg`は出力の起点を絞るだけで、探索対象を絞らない。接続先都市、国家、軍団、経済は全体から参照し、接続先の都市行も出力する。接続先からの接続を無制限に再帰展開しない。

単位不明でも生のmap units、属性、Directions関数の返却値は抽出できる。物理単位を確定できない場合、独自換算するmeters/km、半径検索、物理距離閾値ルールはnull／skippedとし、欠損理由を記録する。Directions返却値は関数のフィールド名を保持して出力し、物理単位が未確認である旨を付す。黙ってkmを採用しない。

## 4. データモデル

### 4.1 都市

`burgs`には以下を保持する。

- identity: id、name、表示用label=`name#id`、cellId、stateId/name、provinceId、cultureId、removed。
- settlement: **groupRaw**、typeRaw、capital、citadel、walls、fortificationQuality、foundedYear、settlementSite。
- population: points、persons、maleAdults/femaleAdults等の生値と単位、値の出典。人口未保存はnullであり0ではない。
- economy: treasury、product、marketId、保存されている都市市場台帳・生産の参照。各値の単位と対象期間を併記。
- geography: x/y（map units）、waterAccess、riverPlacement、riverSiteStatus、標高、港、所属セル。
- history: stateHistoryの生値、campaigns等の参照、年月の有無。所有者列だけから占領年月を作らない。
- militarySummary: 同一セル所在、周辺所在、基地対応、国家全体を別集計。関連付け方法を必須とする。

boolはtrue/false/null。欠損をfalseへ変換する現行CE投影は別に `ceProjection` として保存する。`citadel=true`はFMGの城・城塞フラグであり、城の正確な位置・向き・規模を意味しない。

### 4.2 都市からの街道

各接続は以下を持つ。

| 項目 | 意味 |
| --- | --- |
| connectionId | 起点ID、routeId、向き、branchを含む安定キー |
| sourceBurgId / targetBurgId | 到達先不明の場合targetはnull |
| routeId / routeGroup / mode | roads/trails/searoutesを保存。modeの詳細が未確定ならunknown |
| branchId / sharedCrossingId / registeredConnectionId | 共有施設や登録陸路の対応。該当しない値はnull |
| connectionKind | `ce_next_burg`、`stored_route_next_burg`。近傍はこの表へ混ぜない |
| pathStatus | resolved / terminal_without_burg / missing_geometry / invalid_reference / unsupported |
| rawPathMapUnits / renderedPathMapUnits | 生の距離とCE整形後距離を別々に保持 |
| routeDistanceMeters / routeDistanceKm | 都市間距離の主列。Directionsで選択したmodeのdistanceKmを使用し、distanceBasis=`directions`とdirectionsIdを付す。metersは単位確定時のみ換算 |
| ceNextBurgDistanceMeters | CE引渡しの距離。主列とは独立した互換性監査用 |
| directionsId / directionsMode | 共用計測結果への参照と実際に選択した移動手段 |
| straightDistanceKm | 都市中心間の直線距離。街道距離とは別 |
| entryAzimuthDeg / targetBearingDeg | 街道出口方向と対象都市への直線方位を分離。北0°・時計回り |
| sourceStateId / targetStateId | 外交の参照キー |
| relationRaw / reverseRelationRaw | 起点→対象、対象→起点の保存外交値 |
| relationClass | domestic / enemy / rival / friendly / neutral / other / unknown |
| targetGroupRaw / targetCeScale / targetCeRole | 保存groupとCEの分類結果を分離 |
| targetPopulationPersons / targetCitadel / targetWalls | 一覧監査用に接続先属性を展開 |
| trafficRaw / trafficRank / economicEvidence | 保存交通量、順位と母集団、期間・単位・根拠 |
| evidenceIds / missingReasons | 入力チャンク・JSON pointer等への追跡 |

自国扱いは有効な同一国家IDの場合。両方state=0であるだけでは同一政治主体とみなさない。CEが同一state値をdomesticとする挙動は互換投影側に残し、差分を検出する。`Rival`と`Enemy`をまとめない。

CSVの最小列例（ユーザー提示値の書式例であって、距離の実測結果ではない）:

```csv
source_id,source_name,source_population,source_group,source_citadel,source_walls,target_id,target_name,relation,target_population,target_group,target_citadel,target_walls,route_distance_km
347,Mocha,2099,town,true,false,287,Cosonillo,domestic,1807,village,false,false,103
347,Mocha,2099,town,true,false,399,Miniltabla,enemy,1099,village,true,false,91
```

実出力にはrouteId・distanceBasis・directionsId・directionsMode・海路設定・単位根拠も含める。距離列の値へ「Mocha#347からの距離」を混ぜない。

同一都市対に陸路・海路が複数ある場合も、街道接続は別行で残す。Directions結果は有向都市対・設定をキーとして共用する。Directionsがその街道とは別経路や海路を選ぶ可能性があるため、主距離を「このrouteに沿った距離」と解釈させない。探索したcells/kindsを保存し、経路内訳を追えるようにする。到達不能・同一セルの場合は距離nullとreasonKeyを保持し、直線距離で補完しない。

### 4.3 軍事

`simulation.military[stateId]`を第一の参照元とし、対応する保存形式でのみ旧 `pack.states[].military` を補助参照する。

- 軍団IDはstateIdとの複合キー。`u`の兵種別値、`a`、`t`、`plannedU`、type、n、quality、cell、x/y、bx/by、homeProvince、garrisonHost等を保持する。
- `t`は募集上限。`plannedU`は装備待ち等の未編成枠で、現役兵へ加算しない。
- 艦船・砲・人員等の単位が混在し得るため、`a`や全兵種の単純合計を無条件に「兵員数」としない。兵種定義で人員換算を確認できた値のみpersonsにする。
- 同一セルの軍団を都市の専属守備隊と断定しない。周辺部隊は半径・経路・観測時点を付す。base座標も現在地と混同しない。
- childrenや統合済み軍団の重複計上を避け、親子集計の契約を軍事側実装と一致させる。
- 人口・成人数は動員可能性の補助指標。任意の動員率を指定した推定は `estimatedMobilizablePersons` に分離し、率・対象人口・根拠を出力する。既定では算出しない。
- 「敵より軍が多い」は対象範囲・兵種・同一時点・単位が一致する場合だけ比較する。不明は優劣判定をしない。

### 4.4 河川・城・所有履歴

保存されたriverId、bank、sourceSegmentId、sourceParameter、geometryVersion、footprint、アクセス形状を保持する。河岸の左右は下流方向基準であり、異なる川のright同士を同じ側と解釈しない。

河川形状が復元できる場合、都市中心・接続先方向の局所河川接線に対する符号付き側、渡河有無、渡河施設、国境との関係を追加する。合流点・蛇行・複数河川はambiguousとして扱い、保存bankと計算値の差を残す。

FMG都市中心はCE市街地の面積重心ではない。保存された都市フットプリントも建物分布の重心とは区別する。CE城位置・市街地重心・街道沿い建物密度が入力にない場合はnull／not_availableとする。将来、同じmapId・burgId・入力revisionのCE監査結果を別入力で結合できるようにする。

stateHistory、戦争・占領イベントに具体的な証拠があれば説明候補とする。履歴がない場合、「旧国境を守る城だった」と創作しない。

## 5. 読取・正規化・CE互換の実装方針

1. 入力SHA-256とファイル情報を取得し、manifest形式・対応schema・endiannessを検証する。
2. ZIPの必須チャンク、typed arrayの型・長さ・checksum・参照先を検証する。`$undefined`等も既存保存契約に沿って復号する。
3. 生データを不変で保持し、純粋な正規化モデルを別構築する。IDを配列添字と無条件に同一視せず、重複・欠番・参照不整合を検出する。
4. schema別所有権に従いworldとsimulationを結合する。新形式ではsimulation優先。旧形式fallbackは出典を記録し、両方に矛盾があれば検出する。
5. 都市・セル・route・軍団の索引を一度構築する。全都市ごとに全route／全軍団を再走査しない。
6. 街道は都市位置を起点に前後へ分割し、最初の別都市までの累積長と途中セルを記録する。都市セル内の複数点、同一都市再通過、ゼロ長、ループ、merged、削除済み参照を明示的に処理する。
7. CEの `collectRouteLegs`／`collectRoadEntries` の読取部分をcontext明示の純粋モジュールへ抽出し、CEとCLIで共用する。描画点計算、人口・scale・role・外交、sharedBranchesを独自に二重実装しない。
8. 登録陸路はnetworkのedge端点を使用し、逆向きedgeの重複を除く。渡河施設への切り詰めと共有分岐はCE契約を維持する。必要なsnapshotがなければunsupportedとし、生route近似をCE一致と表示しない。
9. CEが読み込み時に準備・修復を必要とする場合は、それを保存値と別の派生フェーズとして記録する。初版では再生成をしない。互換投影不能は検出結果とし、保存値抽出を継続する。
10. 接続先を特定した有向都市対について、Directionsの共用コアで全移動手段の経路・距離を計測する。主列には指定modeまたはpickDefaultModeの結果を採用する。グラフは入力ごとに構築・共有し、有向都市対・探索設定・高さ設定で結果をcacheする。地理的近傍は別索引で検索し、道のない近傍都市も残す。
11. 各値に `sourceKind=stored|derived|estimated`、evidenceId、計算method/versionを付す。推定値は保存値を上書きしない。
12. ルール評価・CSV/JSON出力後に件数と欠損をまとめる。監査が入力オブジェクトを書き換えていないことを検証する。

共通読取処理は `scripts/lib/fmgArchiveReader.ts`、監査モデル・ルール・出力は `scripts/lib/fmgCityAudit/` に分割する案。既存extract CLIの引数・展開結果を壊さず、段階的に共通readerへ移す。ブラウザstore、DOM、localStorageへの依存をCLIへ持ち込まない。

## 6. 監査ルール

整合性の違反と、歴史・立地上の要検討を別カテゴリにする。閾値はコードへ埋め込まず、ルールの適用時代・地域・技術・ファンタジー条件と一緒にバージョン管理する。

| ruleId | 判定対象 | 出力・制約 |
| --- | --- | --- |
| DATA_REFERENCE_INVALID | 都市・国家・セル・route・typed arrayの無効参照 | error。欠損箇所を特定 |
| DATA_OWNER_CONFLICT | worldとsimulationの重複値の不一致 | warning。採用値・両方の出典を記録 |
| CE_HANDOFF_MISMATCH | 共用処理の結果と実際のCE引渡し結果の差 | errorまたはwarning。フィールド単位の差分 |
| SETTLEMENT_CLASS_DIVERGENCE | groupとCE scale/roleの差 | info。設計上許される差もあるので自動修正しない |
| FORT_CONTEXT_UNEXPLAINED | fortに防衛・通行・行政・補給・資源・履歴の説明が見つからない | review候補。証拠の網羅性が足りなければskipped |
| MILITARY_BALANCE_REVIEW | 敵対方向と比較可能な軍事量・城・市壁 | 数量と条件を提示。人口だけで軍事的優劣を断定しない |
| ROAD_ECONOMIC_CONTEXT_WEAK | 街道の交通・市場・生産・港・後背地・通過先の説明が弱い | review候補。最初の小都市だけで低価値としない |
| RIVER_DEFENSE_ORIENTATION_REVIEW | 河岸、敵味方方向、城位置、旧所有関係 | 城位置がなければ位置評価はskipped。FMG文脈のみ出力 |
| CE_RIBBON_DEVELOPMENT_REVIEW | 街道沿い建物密度と経済文脈 | 対応するCE結果がある場合のみ。FMG単独ではskipped |
| BRIDGE_SKEW_POLICY | 保存形状で判定可能な橋の斜交・折曲り | 既存bridgeSkewPolicyを使用。必要形状・技術不明ならskipped |

各finding: ruleId/version、category、severity、status=`pass|flagged|skipped`、対象ID、observed、expected/threshold、evidenceIds、missingData、confidence、代替説明、reviewQuestion。

橋の上限はHistorical periodを下限として国家技術を反映する既存ポリシーへ委譲する。独自の角度閾値を新設しない。渡し船を橋の違反として判定しない。

### 歴史史料との照合

本書では未検証の史実を数値閾値に採用しない。初版の既定ルールはデータ整合性までとし、歴史的自然さのルールは証拠付きプロファイルを登録して有効化する。

プロファイルには、史料名・著者・刊年・ページ／節・URL等、地域・年代、一次史料／研究の区別、資料から観察された事実、ゲームへ適用する仮説、適用除外、確信度を必須とする。引用と設計者の推論を分離する。城の防御対象、港・渡河・関所、行政拠点、旧国境、商業回廊など複数の説明を比較し、現時点で国境から遠いだけでfortを異常扱いしない。

ファンタジー固有の種族・魔法・地下都市・非人間部隊は、史料の適用条件から外れる可能性を明示する。単一の「自然さスコア」にまとめる機能は初版では作らない。

## 7. 出力品質・再現性

- reportのschemaVersionは保存形式と別管理。入力hash、コードrevision、ルールhash、保存時刻・simulation時点、距離換算根拠を記録する。
- JSONは数値・bool・nullを保持。CSVはUTF-8、固定ヘッダー、RFC 4180相当の引用。nullは空欄とし、missing理由を別列へ出す。0とfalseは空欄にしない。
- CSVで配列は別表またはJSON文字列として扱う。名称のカンマ、改行、引用符を正しくescapeする。表計算ソフト向け文字列の数式注入対策を行い、生の名称はJSONに保持する。
- 内部計算は丸めず、CE固有の丸めと一覧表示の丸めを分離する。表示kmは小数3桁を標準とする。
- 安定ソートは都市ID、routeId、方向、branch、対象ID。生成日時を除いた同一入力・設定の結果は一致する。
- ZIPのパストラバーサル、symlink経由の出力逸脱、過大展開、未知型、checksum不一致を拒否する。展開量・entry数に設定可能な上限を設ける。
- 処理途中のファイルは一時出力し、失敗時は成功したreportとして公開しない。入力を更新しない。
- 終了コード: 0=正常（fail-on条件未達）、1=読取／引数／出力失敗、2=出力成功かつfail-on条件該当。

## 8. 実装順序と受入条件

### Phase 1: 保存値の抽出

reader共通化、スキーマ検証、typed array復号、world/simulation結合、都市・生route接続のJSON/CSV、Directions共用コアによる都市間距離を実装する。

受入条件:

- 指定ファイルで3都市の人口2099/1807/1099、group、citadel、walls、state、外交Enemy、河岸を再現する。
- 253/360/499/506を区別し、Mochaの接続先をユーザー例の2都市だけに限定しない。
- Directionsの返却値と物理単位の確定状態を区別する。明示km時の補助的な生route距離が本書の実査値と丸め誤差内で一致する。
- 同じmap・mode・avoidSea/preferSea・heightExponentで、都市間経路のcells/kinds、距離、所要時間がDirectionsと一致する。UI既定選択と手動mode指定の双方を検証する。
- 壊れた参照・欠損人口・state=0・削除都市・重複IDを、0や自国として黙って処理しない。

### Phase 2: CE互換投影

CEの純粋な読取処理を共用化し、実際のdescriptorとの比較テストを追加する。

受入条件:

- 同一入力・単位・設定のCE出力と、nextBurg、距離、人口、scale、role、外交、入口方位、共有分岐が一致する。
- ユーザー例の103km／91kmをDirections共用コアの結果と`rn`による表示丸めで照合する。差があれば選択mode・海路設定・heightExponent・入力revision・グラフ復元・表示単位を確認する。CE描画距離への調整で数値を合わせない。
- 陸路のみ、海路のみ、混合、avoidSea時のfallback、preferSea、到達不能、同一セルを検証する。CE nextBurg距離との相違はそれ自体をエラーとしない。
- 通過routeの両方向、複数点の同一セル、registered edge、共有渡河、searoutes、merged、到達先なしのfixtureを含む。
- 現在の登録陸路を復元できない入力でも、保存値抽出は完了し、CE一致は未確認と明示される。

### Phase 3: 軍事・経済・河川の監査

軍団の単位別集計、経済台帳参照、所有履歴、河岸文脈、根拠付きfindingsを追加する。

受入条件:

- 人口と兵力、募集枠と現役、現在地と基地、艦船・砲と人員が混同されない。
- 経済拡張なし、所有履歴なし、城位置なしの場合に必要なルールがskippedとなる。
- 低人口の中継都市の先に重要市場がある例、旧国境のfort、河口・合流点等で即断的な異常判定をしない。
- 小さい人工fixtureを通常テストへ、指定の実保存ファイルをローカル受入テストへ使用する。大きな保存ファイルを新規にgitへ追加しない。
- CSV再読込で列数・改行・null・特殊文字が維持され、JSONと数値が対応する。
- ファイルhashと読取モデルの比較により、実行前後で入力内容と監査対象データが不変である。

### Phase 4: CE生成結果との結合（後続拡張）

FMG側の文脈を確定した後、城位置、市街地重心、街道沿い建物数・用途・密度をCE監査結果から結合する。入力revisionが一致しない結果は比較を拒否する。これにより「FMGの属性が原因」「CEの解釈が原因」「証拠不足」を分けて改善できる。
