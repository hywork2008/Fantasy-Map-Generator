# 蒸気機関後の工業 Good・市場・後続技術設計

## 状態

**設計案（未実装）**。本書は初期蒸気排水機関の採用後、工業用の中間財・資本財・サービスをどの順で市場へ導入し、後続技術をどのように解禁するかを定める。

関連設計:

- [蒸気機関の知識・技術蓄積プロセス設計](./steam-engine-knowledge-accumulation.md)
- [技術発展・発見ロードマップ](./technology-development-roadmap.md) §8–9
- [都市水利・衛生インフラ設計](./urban-water-and-sanitation-system.md) §6, §11
- [鉱物資源・鉱山・貨幣供給システム設計](./mineral-resource-system.md) §8
- [鉱石精錬・治安システム設計](./mineral-smelting-security-system.md) §2
- [化学・医学の知識・技術蓄積プロセス設計](./chemistry-medicine-knowledge-accumulation.md): Phase D の手前。ガラス細工・火山材料・薬種から工業硫酸までの蓄積

## 1. 結論

初期蒸気排水機関の次は、次の順序で進める。

    Coal → Coke → Steel → Machine Parts → Stationary Steam Engine
                                      ├→ Spinning Frame / Power Loom → Cloth
                                      ├→ Rail → Locomotive → Railway service
                                      ├→ Marine Steam Engine → Steamship → Steamship service
                                      ├→ Steam Waterworks → Pumped water supply
                                      ├→ Machine Tools → 精密機械・計測器
                                      └→ Generator → Electricity service

    Coke → Coal Tar → Sulfuric Acid → Phosphate Fertilizer
    Steel + Machine Parts → 高圧容器・高効率蒸気機関

この連鎖で追加するものを三種類に分ける。

| 種類 | 例 | 市場での扱い |
| --- | --- | --- |
| 中間 Good | Coke、Steel、Machine Parts、Rail、Spun Yarn、Copper Wire、Sulfuric Acid | 在庫・交易・レシピ入力として扱う |
| 資本 Good | Stationary Steam Engine、Spinning Frame、Power Loom、Locomotive、Marine Steam Engine、Generator | 市場で生産・売買し、設置時に在庫から消費して施設・資産へ変換する。世帯需要は持たない |
| 容量サービス | Steam Power、Railway service、Steamship service、Pumped water supply、Electricity | 通常の Good にしない。地点またはネットワークの供給容量・利用量・損失として扱う |

「Steam Power」や鉄道・蒸気船の輸送力、揚水された上水を在庫 Good にしないことが重要である。石炭や部品を運んで設備を稼働させた結果として、その月・年に限られた容量が生まれる。これはロードマップが Electricity を在庫 Good ではなくサービスと定める方針と同じである。

## 2. Good が市場に現れるまでの四段階

現行の Good カタログと、Market.goods の在庫を混同しない。Good 定義は世界共通で安定した ID を持ち、個別市場には生産・輸入・調達された在庫だけを作る。

| 段階 | 条件 | Good カタログ | State | 市場 |
| --- | --- | --- | --- | --- |
| 定義済み | セーブ互換のために標準カタログへ登録済み | 存在するが非表示・非製造 | 利用不可 | 在庫なし |
| 世界で既知 | 最初の State が当該技術を demonstrated | 交易・工具画面の候補に見える | 試作品の輸入・研究調達のみ | 試験拠点の市場だけが少量在庫を持ち得る |
| State で採用 | 当該 State が adopted | 製造レシピを有効化 | 通常の生産・調達が可能 | 原料、労働、設備があれば在庫を生産する |
| 地域へ普及 | State が diffused、または設備網が拡大 | 同じ Good 定義を使う | 複数 Burg で製造可能 | 交易・設備投資を通じて複数市場に在庫が広がる |

したがって、新 Good を技術到達のたびに配列へ push して新しい ID を発行しない。すべての候補 Good を標準カタログに固定 ID で登録し、次の問い合わせを分けて実装する。

    isIndustrialGoodKnownInWorld(good)
    isGoodManufacturableInState(good, stateId)
    canInstallCapitalGoodAtMarket(good, marketId)

現行の火薬 Good の世界ゲートと、Liquor の State 別製造ゲートを一般化する。市場に在庫がない Good は市場表・交易候補・世帯需要へ表示しない。技術が adopted でも、原料・労働・資本財がなければ生産は始まらない。

## 3. 蒸気以後に導入する Good

### 3.1 第1群: 蒸気排水を工業の基盤へ変える

| Good | 種別 | 解禁技術 | 主入力 | 主な出力・用途 | 市場投入条件 |
| --- | --- | --- | --- | --- | --- |
| Coke | 中間 | Coal Carbonization | Coal | Steel、後続の高温炉 | Coke oven がある採用 State の市場で生産 |
| Steel | 中間 | Modern Steelmaking | Iron Ingot、Coke、Lime | Machine Parts、Rail、耐圧容器 | 製鋼所と高温炉があり、Coke を継続調達できる市場 |
| Machine Parts | 中間・保守材 | Standard Machine Works | Steel、Iron Ingot、Tools | 機関・紡績機・機関車・発電機の建設と保守 | MachineWorks が連年稼働する Burg |
| Stationary Steam Engine | 資本 | High-Efficiency Steam Engine | Machine Parts、Steel、Copper Ingot、Glass | 深部鉱山ポンプ、固定動力設備、Steam Waterworks の動力源 | State 調達または工場投資で作られ、設置時に在庫から除かれる |

Coal Carbonization は、初期ポンプを動かす前提ではない。初期大気圧機関は既存の Coal を使う。Coke は燃料密度と高温・均質な冶金を必要とする後続段階であり、Charcoal を置き換えて中世の精錬を無効化しない。

Coal Tar は Coke の副産物として記録するが、第1群では独立 Good にしない。市場に用途のない副産物を増やさないためである。Chemical Industry Foundation が demonstrated になった時点で初めて Coal Tar を中間 Good として分離し、染料・防水材・有機化学の入力にする。

### 3.2 第2群: 固定動力を繊維・精密加工へ広げる

| Good または設備 | 種別 | 解禁技術 | 主入力 | 結果 |
| --- | --- | --- | --- | --- |
| Spun Yarn | 中間 | Mechanized Spinning | Wool / Flax / Cotton、Machine Parts、Steam Power | Cloth の直接原料になる。既存 Cloth の原料レシピを段階移行する |
| Spinning Frame | 資本 | Mechanized Spinning | Machine Parts、Steel、Wood | 糸生産設備。設置市場の Spun Yarn 生産能力を与える |
| Power Loom | 資本 | Mechanized Weaving | Machine Parts、Steel、Wood | Spun Yarn から Cloth を生産する設備。Steam Power または水力容量を消費する |
| Precision Instruments | 中間・資本 | Precision Instrument Making | Glass、Copper Ingot、Steel、Machine Parts | 圧力計・温度計・測量器を抽象化し、蒸気効率、製鋼、化学、発電の前提にする |
| Machine Tools | 資本・能力源 | Machine Tool Standardization | Steel、Machine Parts、Precision Instruments | Machine Parts の品質・供給上限を上げる。単なる汎用生産倍率にはしない |

Cloth は新しい別 Good にしない。世帯・船舶・軍需がすでに消費する市場 Good であり、機械化は「Spun Yarn と設備を使う別レシピ」と「設備がある市場の生産能力増」として表す。これにより、手工業 Cloth と機械織 Cloth の需要を二重計上しない。

### 3.3 第3群: 鉄道・蒸気船と市場統合

| Good または設備 | 種別 | 解禁技術 | 主入力 | 結果 |
| --- | --- | --- | --- | --- |
| Rail | 中間・建設材 | Rail Engineering | Steel、Machine Parts、Wood | Railway segment の建設・修繕で消費する |
| Locomotive | 資本 | Steam Transport | Steel、Machine Parts、Precision Instruments | Railway service の牽引力。設置後は Coal と部品を継続消費する |
| Railway service | 容量サービス | Railway Operations | Rail network、Locomotive、Coal、整備 | 接続市場間の輸送量・所要時間・損失を改善する |
| Freight Wagon | 資本 | Railway Operations | Wood、Steel、Machine Parts | Railway service の貨物容量を増やす。必要なら Locomotive と別に消費する |
| Marine Steam Engine | 資本 | Marine Steam Engineering | Steel、Machine Parts、Precision Instruments、Copper Ingot | Shipbuilding が所有する船体を蒸気船化する推進機関。設置後は Coal と部品を継続消費する |
| Steamship | Shipbuilding 資産 | Coastal Steam Navigation / Ocean Steam Navigation | ShipHull、Marine Steam Engine、港湾設備、建造・改装キュー | 船体・船級・船員・耐久性は Shipbuilding が保持し、Economy の通常 Good にはしない |
| Steamship service | 容量サービス | Coastal Steam Navigation / Ocean Steam Navigation | Steamship、航路、寄港地の Coal 補給、整備 | 海上市場間の定期輸送量・所要時間・損失を改善する |

Rail を完成した鉄道路線と同一視しない。Rail は市場から建設に引き当てられる材料であり、Locomotive と Freight Wagon は耐用年数を持つ資産である。路線・駅・線路容量は Economy のネットワーク状態が所有し、Railway service は毎月の Coal・Machine Parts・整備労働が満たされた場合だけ使える。

同様に、`Steamship` 自体を Economy の市場在庫 Good にしない。既存の Shipbuilding が保持する `ShipHull` を、`Marine Steam Engine` の調達・設置によって蒸気船の船級・推進方式へ更新する。Economy は機関、Coal、Machine Parts の生産・価格・交易だけを所有し、Shipbuilding は船体、船員、建造キュー、損耗を所有する。

`Coastal Steam Navigation` は沿岸・河川・短距離の定期航路を対象とし、`Steam Transport`、港、Coal 補給、修理可能な機関を要求する。`Ocean Steam Navigation` はその上位ノードであり、高効率機関、耐圧冶金、精密計測、十分な航続距離、複数の寄港地または補給拠点を要求する。帆船航路を削除・置換せず、蒸気船は石炭補給と保守を引き換えに、風向に左右されにくい定時・高容量の選択肢にする。

### 3.4 第4群: 蒸気揚水による上水道

蒸気揚水は、鉱山用の初期蒸気ポンプを都市へ単純コピーするものではない。対象 Burg に既存の水源、取水権、導水・貯水・配水の設計、維持組織があり、[都市水利・衛生インフラ設計](./urban-water-and-sanitation-system.md#61-上水道との非対称性) の `waterLifting` が十分に育って初めて、Steam Power を上水供給へ転用できる。

| 設備またはサービス | 種別 | 解禁技術・局所条件 | 主入力 | 結果 |
| --- | --- | --- | --- | --- |
| Steam Waterworks | 都市水利資産 | Municipal Steam Pumping、`urbanWaterworks`、`waterLifting`、取水権 | Stationary Steam Engine、Steel / Iron Ingot、Machine Parts、Stone、Tools、Treasury | 水源から貯水・配水地点へ揚水する。`UrbanWaterSystem` の上水供給能力を増やす |
| Pumped water supply | 容量サービス | 稼働中の Steam Waterworks、到達可能な水源・配水網 | Coal、Machine Parts、整備労働、取水可能量 | `serviceWaterCapacity` と飲用水供給の不足を緩和する。市場在庫にはしない |

`Steam Waterworks` の資産、取水量、配水先、`waterContamination`、維持状態、`waterLifting` への効果は `UrbanWaterSystem` が所有する。Economy は建設時に Stationary Steam Engine・材料を市場在庫から消費し、運転時に Coal・Machine Parts・整備労働を消費するだけである。これは同じ機関を鉱山と都市の双方で使いながら、鉱山排水・上水供給・衛生状態を一つの汎用生産倍率へ混ぜないための境界である。

揚水は上水の**量と到達高度**を改善するが、汚水を浄化せず、自然流下する下水容量も直接増やさない。取水口が汚染されている、配水池・配管が不足している、維持費を払えない場合には、揚水量を増やしても飲用水・衛生の利益は得られない。`sanitaryEngineering`、上下水分離、放流規制は水利文書側の別条件として維持する。

### 3.5 第5群: 蒸気が化学と電化を可能にする

| Good または設備 | 種別 | 解禁技術 | 主入力 | 後続への接続 |
| --- | --- | --- | --- | --- |
| Coal Tar | 中間 | Chemical Industry Foundation | Coke oven の副産物 | Dyes、有機化学、防水・薬品の候補 |
| Sulfuric Acid | 中間 | Industrial Sulfuric Acid | Sulfur または黄鉄鉱、燃料、Lead、Glass | Phosphate Fertilizer、染料、金属処理 |
| Phosphate Rock | 原料鉱物 | Phosphate Survey and Mining | 新しい鉱床・鉱山 | Phosphate Fertilizer の原料 |
| Phosphate Fertilizer | 中間・農業投入材 | Phosphate Fertilizer | Phosphate Rock、Sulfuric Acid | 農村の施肥普及ストックを増やす。世帯消費 Good にはしない |
| Copper Wire | 中間 | Electrical Engineering | Copper Ingot、Glass、Machine Parts | Generator、送電線、通信 |
| Generator | 資本 | Generator and Motor | Copper Wire、Steel、Machine Parts、Precision Instruments | Steam Power / 水力を Electricity service に変える |
| Electricity | 容量サービス | Power Grid | Generator、送電線、燃料または水力 | 電解・照明・電動機。市場在庫にはしない |

Phosphate Rock は既存の MineralCommodity には含まれないため、追加時には鉱床生成・鉱山・市場供給を同じ変更で実装する。Sulfuric Acid を Sulfur の単純な需要倍率にせず、実際に Acid を市場在庫から消費するレシピの中間材とする。

## 4. 技術グラフと Good の解禁契約

    atmosphericSteamPumping
      → condensateEfficiency
      → coalCarbonization → modernSteelmaking → standardMachineWorks
                                              → highEfficiencySteamEngine
      → mechanizedSpinning → mechanizedWeaving
      → steamTransport → railEngineering → railwayOperations
      → marineSteamEngineering → coastalSteamNavigation → oceanSteamNavigation
      → municipalSteamPumping → steamWaterworks
      → chemicalIndustryFoundation → industrialSulfuricAcid → phosphateFertilizer
      → precisionInstrumentMaking → generatorAndMotor → powerGrid

各技術の状態は Good の利用を次のように制限する。

| 技術状態 | 中間 Good | 資本 Good | サービス |
| --- | --- | --- | --- |
| known | 設計・試験のための少量調達のみ | 建設不可 | なし |
| demonstrated | 試験市場で小ロット生産・輸入 | 試作設備を一基だけ設置可能 | 試験容量のみ |
| adopted | State 内の通常生産・調達 | 原料と予算があれば複数設置可能 | 設置済み地点で商用容量 |
| diffused | 複数 Burg のレシピを有効化 | 設備工房・整備網を拡張可能 | ネットワークとして地域へ拡大 |

後続技術は Good を一度市場に置いただけでは進まない。たとえば Modern Steelmaking の adopted には、Coke と Iron Ingot の在庫だけでなく、連続する Steel 生産、Machine Parts の保守需要、採算を満たす製鋼所が必要である。Railway Operations は Rail と Locomotive の一回生産ではなく、実際に接続された市場、Coal、整備人員、数か月の定時運行を要求する。Ocean Steam Navigation は適格な蒸気船、港湾の Coal 補給、反復運航の記録を、Municipal Steam Pumping は水源・配水網・維持予算を伴う実揚水を要求する。

## 5. 市場・設備・需要の流れ

### 5.1 中間 Good

中間 Good は通常の Market.goods 在庫となり、現行の生産、価格、交易、キャラバンを通る。生産者はレシピ入力を市場在庫から消費し、出力を同じ市場在庫へ入れる。別の市場へ届いた時点で初めて、その市場は後続レシピを稼働できる。

    Coal market stock
      → Coke oven
      → Coke market stock
      → Steelworks
      → Steel market stock
      → MachineWorks
      → Machine Parts market stock
      → engine works / railway construction / factory maintenance

これにより、炭田、鉄鉱山、製鋼都市、工業都市を交易が結び、すべての市場が同時に自給する必要はない。

### 5.2 資本 Good

資本 Good は一般の人口需要に入れず、State 調達、Market の産業投資、または施設の建設キューだけが買い手になる。注文が完了した時点で Good は一度市場在庫へ入り、設置が始まる時点で在庫から消費して資産へ変える。

    Machine Parts + Steel + Copper Ingot + Glass
      → Stationary Steam Engine market stock
      ├→ SteamInstallation build queue (MineOperation)
      └→ Steam Waterworks build queue (UrbanWaterSystem)

資本 Good の耐久性は資産側で保持する。故障時に完成機関を再度丸ごと消費せず、Machine Parts、Tools、Coal、整備労働を定期的に消費して condition を回復する。資産が廃棄または解体されたときだけ、少量の Steel / Iron を Scrap として回収する設計を後続で検討する。

### 5.3 サービス

Steam Power、Railway service、Steamship service、Pumped water supply、Electricity は設備・燃料・労働から毎月計算する。需要が容量を超えた場合、優先順位を付けて稼働率を下げる。

1. 鉱山排水・安全に必要な最低容量
2. 既存の Steam Waterworks による最低限の飲用・防火用水
3. 既存設備の保守・公共輸送
4. State の明示的な軍需・公共調達
5. 収益性が高い民間工場
6. 任意の奢侈・実験用途

この順序により、繊維工場の拡張が排水を止め、鉱山・燃料供給そのものを崩壊させる循環を避ける。

## 6. 実装の責務境界

| 項目 | 所有者 | ルール |
| --- | --- | --- |
| Good 定義、レシピ、世界・State のゲート | Economy extension | 固定 ID のカタログを維持し、技術進行を読み取り専用で参照する |
| 技術段階 | host TechnologyProgress | Good 在庫や設備を直接変更しない |
| 中間 Good の生産・在庫・交易 | Economy Generator | 既存の市場・レシピ・キャラバン機構を使う |
| 資本 Good の建設・設置・保守 | Economy Generator / Controller | 建設時だけ市場在庫から消費し、稼働資産と Good 在庫を二重計上しない |
| Steam / rail / maritime の容量 | 専用 Economy service module | Good 在庫にせず、地点・ネットワークの容量として保持する |
| Steamship の船体・船級・建造・損耗 | Shipbuilding extension | `Marine Steam Engine` を市場から消費して船体資産を改装・建造する。通常 Good に複製しない |
| Steam Waterworks の取水・配水・衛生効果 | UrbanWaterSystem | 水源・取水権・`waterContamination`・維持状態を保持し、揚水を汎用の工業出力にしない |
| 描画・市場 UI | Economy Renderer / React UI | 状態を変更しない。未在庫 Good を通常市場の在庫一覧へ出さない |

動的 ZIP extension が新しい工業 Good を追加する場合も、既存 Good の ID をずらしたり、host の技術モジュールを直接 import したりしない。ExtensionAPI 経由で Good 定義、技術ゲート、レシピ、設備効果を登録する契約を別途追加する。

## 7. 実装順序

### Phase A: Good ゲートの共通化

1. 既存の世界ゲートと State 製造ゲートを、工業 Good にも使える宣言型レジストリへ一般化する。
2. Good は固定 ID で標準カタログへ追加するが、技術条件を満たさない限り生産・交易候補・市場 UI から隠す。
3. 市場の在庫がゼロの Good を、新たな需要だけで自動生成しないことをテストする。

### Phase B: 工業基礎材

1. Coke、Steel、Machine Parts、Stationary Steam Engine を追加する。
2. Coke oven、Steelworks、MachineWorks、SteamInstallation を小さな縦切りとして実装する。
3. Coal、Iron Ingot、Lime、Tools、部品不足のいずれかで工場・機関が減産または停止することを確認する。

### Phase C: 機械化繊維・蒸気輸送・都市揚水

1. Spun Yarn、Spinning Frame、Power Loom を導入し、既存 Cloth のレシピを段階移行する。
2. Rail、Locomotive、Railway service を追加し、既存キャラバンを削除せず、選択可能な高容量輸送経路として接続する。
3. Marine Steam Engine を追加し、Shipbuilding の ShipHull を蒸気船資産へ改装できるようにする。沿岸航路と外洋航路では Coal 補給・保守・航続距離を別に検証する。
4. Steam Waterworks を、`UrbanWaterSystem` の `waterLifting`、取水権、配水網、維持予算が揃う Burg にだけ設置できるようにする。
5. 工業地帯が原料市場へ依存し、製品市場へ輸出できることを確認する。

### Phase D: 化学と電化

1. Coal Tar、Sulfuric Acid、Phosphate Rock、Phosphate Fertilizer を順番に追加する。
2. Copper Wire、Generator、Power Grid を追加し、Electricity を容量サービスとして実装する。
3. 化学・電化の効果を、肥料・金属処理・電解・動力という明示的な消費先だけへ接続する。

## 8. 受け入れ条件

- 初期蒸気排水機関の adopted だけでは Coke、Steel、鉄道、蒸気船、都市揚水、電力を自動解禁しない。
- 中間 Good は、原料・設備・労働・State 技術がそろう市場だけで生産される。
- 資本 Good は人口需要で消費されず、設置された資産と市場在庫が二重計上されない。
- ある State が Steel を発明しても、Steel の在庫または輸送がなければ他市場の Machine Parts 生産は始まらない。
- Coal 不足は Coke、Steel、Steam Engine、Railway service、Steamship service、Pumped water supply、石炭火力を連鎖的に制約する。
- 既存 Cloth、Coal、Iron Ingot、Tools、Glass、Copper Ingot の ID と旧セーブの在庫を変更しない。
- Electricity、Steam Power、Railway service、Steamship service、Pumped water supply は通常 Good の在庫にならない。
- 同じ経済状態と技術進行では、Good の解禁・生産・設置・市場への到達が決定的に再現される。

## 9. 決定事項

1. 蒸気以後の市場追加は、中間 Good、資本 Good、容量サービスを必ず分ける。
2. Good 定義は固定 ID で先に登録し、技術状態は製造・設置・表示をゲートする。
3. Coke、Steel、Machine Parts、Stationary Steam Engine を最初の工業 Good 群とする。
4. Cloth は機械化後も同じ完成 Good を使い、Spun Yarn と設備レシピで生産経路だけを変える。
5. Rail と Locomotive は材料・資本 Good、Railway service はネットワーク容量とする。
6. Marine Steam Engine は資本 Good、Steamship は Shipbuilding の資産、Steamship service は航路容量とする。
7. Steam Waterworks は都市水利資産、Pumped water supply は `UrbanWaterSystem` の容量サービスとする。揚水は浄水・下水処理の代替ではない。
8. Sulfuric Acid と Phosphate Fertilizer は、化学技術と鉱床・設備・流通が揃ってから市場へ出す。
9. Electricity は Steam Power と同様に在庫化せず、発電・送電・需要容量で扱う。
