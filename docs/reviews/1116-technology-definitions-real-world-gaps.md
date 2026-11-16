# 技術定義に無い、現実の産業化に寄与した知識

- **日付**: 2026-11-16
- **対象**: `src/generators/technologyDefinitions.ts`（段階0〜8、91ノード）、`src/generators/technologyPrehistory.ts`（ローマ最盛期〜初期中世、18ノード。年次進行には未接続）
- **照合**: `docs/plan/technology-development-roadmap.md` の節17は、熱力学・精密機器・工業アルカリ・合成染料・空気液化・軽量構造材・真空管・石油化学・硝石を未実装と書いている。定義ファイルにはこれらのノードがある。本記録はロードマップ本文ではなく定義ファイルを正とした。
- **問い**: 古代から現代まで、現実の産業と技術の発展に寄与した知識・技術のうち、上記の定義に名前が無いものは何か。

## 結論

定義は、成熟中世の農業・冶金・沿岸航海から、火薬、外洋帆船、蒸気、鉄道、硫酸・アルカリ・合成アンモニア、電信・発電、石油・内燃機関、真空管、多段ロケットまでを一本の産業史として持っている。抜けているのは、その本線のあいだで現実には産業の立地・材料・土木・食料・組織を変えた知識である。電子は真空管で止まり、飛行・ガスタービン・半導体・計算機・原子力は、軌道投入と同じ20世紀中葉に既にあったのにノードが無い。

ファンタジーノード `arcaneGremlinWarding` は歴史技術の照合から外した。

## 定義にあるもの

段階0〜8のラベルは次のとおり。

| 段階 | ラベル |
| --- | --- |
| 0 | Three-field agriculture、Iron tools and draft animals、Water and wind mills、Basic metallurgy、Stone building and roads、Coastal navigation、Knightly warfare、Literacy and markets |
| 1 | Four-course rotation、Improved mining、High-temperature furnace、Mechanical water-powered workshops、Urban covered drainage、Expanded records and copying、Alembic distillation、Mathematics, astronomy, geography、Mature commercial finance、Laboratory glassware、Apothecary compounding、Surgical anatomy、Hospital medicine |
| 2 | Black powder composition、Corned powder and quality control、Cannon founding、Artillery tactics、Mass firearm production、Saltpeter beds and refining、Gunpowder fortification |
| 3 | Ocean navigation、Ocean-going sailing hulls、Standard charts and maritime records、Fleet provisioning and logistics、Naval gunnery、Overseas trading posts |
| 4 | Experimental natural philosophy、Mine survey and drainage、Precision boring and measurement、Coal fuel supply、Early public health、Analytical chemistry、Factory-style manufactory organization |
| 5 | Atmospheric steam pumping、Separate-condenser steam engine、Rotary steam power、Mechanized spinning and weaving、Coke-fuelled blast furnace、Standard machine works、High-efficiency stationary steam engine、Steam locomotive、Rail engineering、Railway operations、Municipal steam pumping、Marine steam engineering、Coastal steam navigation、Ocean steam navigation、Thermodynamics、Precision instrument making |
| 6 | Chemical industry foundation、Cinnabar roasting and mercury recovery、Industrial sulfuric acid、Industrial alkali (soda process)、Organic chemistry and synthetic dyes、Phosphate fertilizer、Modern steelmaking、High-pressure chemical apparatus、Catalytic chemistry、Synthetic ammonia、Electrical and magnetic experiments、Practical batteries and electrical measurement、Electric telegraph network、Generator and motor、Power grid and electricity utilities、Electric water pumps、Electrolytic industry、Air liquefaction and industrial gases |
| 7 | Petroleum geology and exploratory drilling、Modern drilling and oil-field operations、Oil refining and fractional distillation、Internal combustion engine、Natural gas liquefaction、Gas-fired electricity generation、Mechanical refrigeration、Radio and electron tubes、Lightweight structures and conductors、Petrochemicals |
| 8 | Military and signal powder rockets、Rocket dynamics and high-temperature combustion research、Liquid propulsion and rocket test facilities、Guidance and attitude control、Multi-stage rockets and orbital insertion |

前史にあるのは、Hydraulic mortar and pozzolanic concrete、Aqueducts and urban water supply、Paved military road network、Standing legions and logistics、Provincial administration and codified law、Mediterranean-wide unified trade and currency、中央維持の崩壊・軍団の解散・広域交易の分裂、Monastic preservation of fragmentary knowledge、Early heavy moldboard plow、Stirrup and improved harness、Manorialism and feudal hierarchy、Transition to three-field rotation、Widespread water and wind mill adoption、Establishment of knighthood、Cathedral schools and monastic scholarly revival、Revival of long-distance trade, fairs, and merchant bands である。

## 近いノードがすでに受け持っているもの

次は独立ノードに見えても、既存ラベルの範囲に入るため欠落リストには入れない。

| 知識 | 受け持つノード |
| --- | --- |
| 複式簿記、手形、市場信用 | Mature commercial finance |
| 写本から印刷へ向かう記録の複製 | Expanded records and copying |
| 外洋船体、海図、天文航法の束 | Ocean-going sailing hulls、Standard charts、Ocean navigation、Precision instrument making |
| コークス高炉、量産鋼、ソルベー法級アルカリ | Coke-fuelled blast furnace、Modern steelmaking、Industrial alkali |
| 硫酸、リン酸肥料、アンモニア合成、コールタール染料 | Industrial sulfuric acid、Phosphate fertilizer、Synthetic ammonia、Organic chemistry and synthetic dyes |
| 電磁気の実験、電池、電信、発電、電力事業 | Electrical and magnetic experiments、Practical batteries and electrical measurement、Electric telegraph network、Generator and motor、Power grid and electricity utilities |
| 冷凍、空気の液化と工業ガス | Mechanical refrigeration、Air liquefaction and industrial gases |
| ローマのコンクリート、水道、舗装街道、成文法 | 前史の hydraulic concrete、aqueducts、paved roads、codified law。段階0〜8には近世以降の再発明が無い |

## 古代〜中世初期（前史にも無い）

| 知識・技術 | 後の産業への効き方 |
| --- | --- |
| 灌漑、カナート、揚水螺旋 | 乾燥地の食糧余剰。前史の水道は都市への重力送水であり、圃場灌漑は別である |
| 位置記数法、ゼロ、代数 | 測量、会計、のちの力学計算の表記 |
| 歯車、カム、クランク | 回転と往復の変換。水車工房より前の機械要素で、蒸気機関まで続く |
| 機械時計と脱進機 | 等時性、工場の時間規律、精密機器と航海時計の親 |
| 紙の抄造 | 記録複製は写す側で、紙を作る工程は無い |
| 磁針羅針盤 | 沿岸航海と外洋航海のあいだの、全天候航法の前提 |
| レンズ研磨、眼鏡 | 望遠鏡、顕微鏡、測器の技能元 |
| 高温窯、磁器、耐火物 | 炉材、るつぼ、のちの碍子。高温炉ノードは鉄側だけである |
| 線引き（針金） | 針、カード、釘、のちの電信線と送電線 |

## 産業革命の直前まで（段階1〜4の穴）

| 知識・技術 | 後の産業への効き方 |
| --- | --- |
| 閘門式運河、人工の内陸水路 | 鉄道前のバルク輸送。石炭と綿業の立地を決めた |
| 記述幾何と製作図 | 親方の手順を、別の工房で再現できる設計に変える |
| 互換性部品とゲージ体系 | Standard machine works は加工能力で、部品を入れ替え可能にする公差思想は別である |
| 塩素と晒粉 | 機械紡績の白布を量産する化学。アルカリ・硫酸とは別系統。`docs/plan/chlorine-production-vertical-slice.md` に設計メモがあり、定義には無い |
| 水硬性石灰の再発見 | ローマのポゾラナコンクリートは前史のみ。近世の水硬性モルタルは段階0〜8に無い |
| 有限責任、株式会社、特許、保険数理 | 商業金融は手形と市場まで。鉱山・運河・鉄道への長期投資を可能にした制度技術は無い |
| 工科大学、ポリテクニク | 経験則の親方技能を、再現できる工学教育に変える |

## 蒸気・化学・電化と同じ時代の穴（段階5〜6）

| 知識・技術 | 後の産業への効き方 |
| --- | --- |
| 水車タービンと水力発電 | 在来の水車と、発電機ノードのあいだ。火力以外の大電力の本線 |
| 蒸気タービン | 高効率蒸気機関ノードは往復式。20世紀の発電と船舶の主機はタービン |
| 材料力学、弾性論、流体力学 | 熱力学ノードとは別。橋梁、船体、タービン、航空機が使った工学理論 |
| 産業用板ガラス | 実験ガラス器具とは別。建築、灯火、鏡、のちの光学 |
| 木材パルプ製紙 | ぼろ紙の限界を外し、行政・新聞・包装の量を変える |
| 加硫ゴムと空気タイヤ | シール、絶縁、ベルト、道路車両。石油化学より前の必須材料 |
| ニトロ系爆薬、雷管、導火線 | 黒色火薬の先。トンネル、港湾、鉄道の切土、油井掘削の土木能力 |
| 溶接とガス切断 | 鋲接の次。鋼構造、圧力容器、船体、パイプラインの接合 |
| 浮遊選鉱 | 低品位の銅・鉛・亜鉛を経済鉱にする。電解精錬の原料側 |
| 工具鋼、高速度鋼、ステンレス | 近代製鋼は量産鋼。切削速度と耐食は別の合金知識 |
| 細菌説、消毒、麻酔、ワクチン、缶詰殺菌 | 初期公衆衛生と病院医療は細菌説より前。産業都市の死亡率と食糧保存を変えた |
| 条播、脱穀、収穫の農業機械、科学的育種 | 四圃式の次。工業労働力を農村から切り離す |
| グアノ、チリ硝石 | 合成アンモニアより前の窒素供給。19世紀後半の収量を押し上げた |
| 電話 | 電信網と真空管のあいだの音声通信 |
| 写真化学と製版 | 測量記録、複製、のちの電子撮像の前段 |
| ポルトランドセメントと鉄筋コンクリート | 産業期の港湾、工場床、ダム、都市。前史のローマン・コンクリートとは別技術 |
| 安全エレベータと鉄骨架構 | 鉄道工学は線路側。高密度都市と多層工場の垂直輸送は無い |
| マカダム道路と舗装 | 石畳と街道の次。内燃機関を走らせる路面 |

## 石油・電子管・ロケットと同時代なのに無いもの（段階7〜8）

電子ノードのラベルは Radio and electron tubes で、真空管までである。軌道投入と同じ20世紀中葉に産業の本線になっていたものが抜けている。

| 知識・技術 | 後の産業への効き方 |
| --- | --- |
| 空気力学、風洞、飛行機、航空用エンジン | 軽量構造材は材料で、揚力・安定・機体は無い |
| ガスタービン、ジェット | 往復内燃機関ともロケットとも別。航空と、のちの発電の主機 |
| 自動車というシステム | 内燃機関ノードはある。大量生産、給油網、道路とセットの普及形態は無い |
| 転がり軸受、チェーン伝動 | 工作機械、自転車、自動車に共通する機械要素 |
| 高分子化学（ベークライト、ナイロン、ポリエチレン） | 石油化学ノードは原料留分。重合で材料にする知識は別 |
| パイプライン輸送 | 掘削と精製のあいだで、流体を大陸規模で動かす |
| パンチカード集計機 | 鉄道、国勢調査、大企業の事務を機械計算にした |
| 半導体、トランジスタ | 真空管の次の増幅とスイッチ |
| プログラム内蔵コンピュータ | 弾道計算、会計、工程制御。誘導ノードはロケット搭載機器で、汎用計算機ではない |
| 流れ作業、統計的品質管理 | 工場制手工業と機械工場の次の、20世紀の生産組織 |
| 核分裂の制御と原子力発電 | 発電構成のもう一本。エネルギー源としての知識が未定義 |
| レーダーとマイクロ波 | 真空管無線の応用で、航空管制、航海、のちの通信の基盤 |

## グラフの終端より後に産業の主役になったもの

ロードマップは宇宙開発で終える設計である。それより後に成熟し、現代の産業を組み替えているものは次である。

- 集積回路、ソフトウェア、パケット通信
- 数値制御工作機械と産業用ロボット
- コンテナ輸送
- 衛星測位
- レーザー加工と光ファイバ

## 範囲

本記録はノード追加の設計ではない。各項目は歴史上の寄与の有無で選んでおり、ゲームに載せる優先度は付けていない。核分裂はエネルギー源としての知識名だけを挙げ、装置や手順は書いていない。
