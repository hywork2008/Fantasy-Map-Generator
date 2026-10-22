# 追加したドキュメント

2026-10-22

- docs/plan/ce-manual-city-authoring.md - CE手動編集のセル境界由来の細街路・仕上げ後の枠付近の道路・共有時の再生成を調査し、手動補完ポリシー、選択区域の仕上げ、文書共有と生成条件共有の分離、実装順序と受入条件を設計
- docs/plan/character-wealth-lifecycle.md - 人物の遅延生成・詳細削除・死亡・相続から現金口座を独立させ、初期資金の配分と抽象家計の分割、通貨量の保存、旧セーブ移行・削除前精算を定義する設計
- docs/plan/master-character-generation-compatibility.md - 全拡張ONの固定masterを基準に、初期人物の種類・人数・兼任・所持金・家族構成を選択生成で再現するプロファイル、初期予算・乱数再生・家族集計・移行・差分検証の設計

2026-10-21

- docs/plan/arms-theft.md - 長い間売れない Arms・Muskets・Artillery の市場の在庫が、都市の不満が高いか治安が悪いと盗まれる設計(在庫の年齢で盗まれやすさを決め、盗まれた量を都市ごとに累計して、武装蜂起のリスク要素として持つ)
- docs/plan/ce-3d-friary.md - CEのFriaryの生成済み形状から教会・鐘楼・開放回廊・門・庭・井戸を組み立てるBV共通モデル、接地・統合描画・更新と検証の設計
- docs/plan/ce-3d-parks-cemeteries.md - CEの公園・墓地の2D配置を共有する3D地表・樹木・文化別施設、BV共通モデル、接地・更新・インスタンス描画・検証の設計
- docs/plan/ce-rural-field-layout.md - 中世欧州の開放耕地・囲い込みから近現代の圃場整備・近郊園芸を踏まえ、CE郊外の農地領域をセルから独立させ、耕作しやすい区画・農道・面積配分・時代別形状と検証を設計
- docs/plan/gothic-romanesque-building-tasks.md - BV向けにゴシック建築10件・ロマネスク建築10件の著名建築を整理した、再現の重点・増改築への注意・参考資料・完了条件付きタスクリスト
- docs/plan/medieval-european-model-tasks.md - BVとCE施設一覧の照合に基づく、中世〜大航海時代の欧州向け3Dモデル追加候補42項目の優先順位付きタスクリスト

2026-10-20

- docs/plan/child-labour-history.md - 子どもの労働力の時代ごとの変遷を史料(Horrell・Humphries・Weisdorf の 1570〜1861 年の働く割合、子どもの賃金の比 60% → 40%、ローマ・中世・江戸の奉公の年齢、工場法と義務教育、米国 1880〜1930 年、ILO 1996 年)で調べ、子ども 1 人を大人の何人分と数えるかを時代ごとに見積もった(中世〜近世 0.11〜0.13、1750〜1830 年 0.07、1830〜1880 年 0.04、以降 0 へ)。都市の手工業が子どもと老人を含む総人口を働ける量としていることへの修正案
- docs/plan/goods-physical-units.md - 商品の単位を中身(基本の単位: 液体は L、1 つずつ扱う物は個数、ばら物は kg)・荷姿(アンフォラ・樽・瓶・麻袋・木箱・タンク船・ばら積みなど、時代・文化・技術で選ぶ容器)・取引(容器の数でまとめた荷)の 3 層に分ける設計。同じ品を場所ごとに違う量で読んでいる所、個数の語なのに値が 1 個の値でない品、量の定義のない単位の語、積荷の枠、釣り合わないレシピを抽出し、容器に入る量の計算、荷の重さとかさからの積荷の枠、市場どうし(B2B)と小売(B2C)を段で分ける扱い、古い保存の読み替えを提案(goods-unit-scale.md の「単位はロット、表示だけ読み替え」の前提を改める)。2026-10-21追補: 史料16群の出典・適用範囲、容器の再使用と取引条件、実用内容量/風袋/積付容積の分離、日当比による値付けと単位移行の分離、全207品目の基本単位を整理
- docs/plan/livestock-head-unit.md - 家畜の市場の1 headを実物の1頭にする設計。2026-10-21に移行kを現行の物量契約(馬25、他1)から確定し、価格から逆算した頭数案を撤回。史料の日当比での価格再校正と単位変換を分離し、単位の大きさに依存している市場の式(価格の丸め・取引による価格の動き・平滑化・価格の需要の配分・積荷の下限)を全品目で単位に依らない形にし、カタログと古い保存を読み替える
- docs/plan/modular-hill-fortress.md - クラックを原型とする内郭・石造斜面・外郭の塔と壁・門・登城路の組み立て、CEセル標高への接地、時期の切り替え、BVと編集可能な確認用サンプル
- docs/plan/port-freight-remaining-tasks.md - port-freight-queue-and-warehouses.md の §10.18 までで対応していない課題(倉敷料・港での売却・隊商を港で分ける・船の注文のきっかけ・陸の出荷の回数・失われた隊商の車両と馬・Horses の単位・武器と弾の国の注文・季節・仮の値の校正・CE の描画・未決と計測)のタスクリストと進める順の案

2026-10-19

- docs/calibration/farmland-area-pilot-20261019.json - 経済有効の3世界・10年ずつの耕地統計、学習・検証の分離、都市側配分で悪化した研究モデルの評価と入力・実装ハッシュ
- docs/plan/ce-road-network-normalization.md - CE道路の同一edge重複・孤立・折り返しを調査し、物理区間と路線の分離、接続済み網への追加、需要と新設延長による採否、平滑化前の経路正規化を提案
- docs/plan/character-generation-presets.md - 国家元首・首脳・軍事指揮官・領主・越境宗教組織の聖職者・御用商人・ギルド長等を種類別/組織別に選択生成するプリセットと、役職定員・兼任・新規人数の設計
- docs/plan/farmland-area-estimation.md - sim:serverの年次耕地観測、5年統計、経済無効時の静的推定の校正・独立世界による評価・純粋推論を分けたAPIとFMG/RE/CEへの接続設計
- docs/plan/long-distance-merchant-reach-capital.md - 遠距離交易を止めている商会の到達範囲(支店があれば本拠の範囲を問わない、高額品は 90 日まで、外地の商館)と運転資金(対価のない 8% の利益の廃止、市場間の代金の決済、commenda 型の出資、動かない荷の取り消し)の見直し(approach-commerce-quarters.md §10 の候補 (2) と §4.5 で見つかった資本の関門)
- docs/plan/luxury-value-demand.md - 高額品の需要を個数ではなく予算と価格帯(並・上・極上)で決め、人物の生活費・余剰の一部で居住都市の市場から高額品を実際に買う設計。計測で、買い手のお金は足りているのに安い毛皮・香が需要を満たし、価値 20 以上の品が都市に一度も買われていないことを示した(initial-wealth-calibration.md §5.4 の対応)
- docs/plan/money-supply-mint.md - 長期の計測(修正後 50 年でお金が 37% 減、1 人あたり半分、金庫が 0 の都市 8 割)を受け、造幣で実際のお金を出す・摩耗と国外への支払いで減らす・物価を通貨量に合わせる・国内への支払いを消さず家計へ・国庫の抱え込みの上限・対価のない生成の除去を設計(long-distance-merchant-reach-capital.md R1 より先に行う)
- docs/plan/port-freight-queue-and-warehouses.md - 史料(運賃積み・ヴェネツィアのガレー船の船腹・ロンドンの Legal Quays の荷揚げ待ち・浅草御蔵・大坂の蔵屋敷・Bryggen・Fondaco など)に基づき、陸は車両を雇い足して運賃を上げ、海は港で船を待つ(どの市場の船でも運賃で積む・高い荷から積む・期限を過ぎた荷は港で売る・空いた船の回航)。港を持つ都市に倉庫の収容力を持たせ、交易と荷待ちで増やし、CE は型(商人の家・岸の倉庫の列・商館・大倉庫・船渠)と敷地を岸の背後に描く(long-distance-merchant-reach-capital.md §17 の後継)
- docs/tools/farmland-research.md - 耕地観測・期間集計・モデル作成・独立世界での評価を別コマンドで実行する手順

2026-10-18

- docs/plan/craft-wage-subsistence-scale.md - 生産の賃金(労働点 1 = 1,000 人・月に約 1 SP)を地元の穀物価格で測った生活費 × 倍率にそろえ、都市の家計が食費を払えるようにする設計(money-scale-calibration.md §8.3 の残課題)
- docs/plan/economy-balance-levers.md - 農業労働・食料・お金の校正で決めた係数のうち、崩すと校正前のいびつな状態(都市の飢え・首都への富の集中・農繁期の人手不足)が再現でき、為政者の政策として出せるものの一覧(今の値・校正前の値・崩した時の結果・政策としての読み)
- docs/plan/farm-labour-calibration.md - 農業労働の年間日数・収穫月の集中・1 ha あたりの労働・脱穀の時期を史料で確認。収穫と脱穀を収穫月に詰め込んでいること、月の労働能力が一律であること、脱穀が量に比例しないことを示し、作業配分の分割・収穫月の能力・労働の充足率の校正案を提示
- docs/plan/grain-storage-life.md - 市場の穀物在庫を9か月で捨てる設定を史料で見直し、Age3(9か月〜、期限なしで少しずつ傷む)を足し、上限を12か月・傷みを気候で変える。赤道直下の「四半期の供給が均等」という前提を作物暦に置き換える
- docs/plan/rural-food-labor-audit.md - 農家の穀物の蓄えと購入、Megacity の労働の送り出し、農繁期の労働を史料と実装で監査。漁村・牧畜の住民を全員穀物で食べる人として数えていること、Megacity で都市に定着する人が0人であること、労働の不足が収穫を減らさないこと、降水の補正の単位違い、季節の出稼ぎが未実装であることを報告し、修正の順序を提案

2026-10-17

- docs/plan/approach-commerce-quarters.md - 門ごとの物流(占有率・流入出・貨物区分)と史料調査に基づき、CE の市場通り・商人区・職人区・門前宿・家畜市・資材置き場の配置を物流に従わせる改善案
- docs/plan/approach-traffic-observatory.md - Advance Time で地図を進めて流通網の区間・都市の出入り口ごとの交通量を時系列収集し、どの門が発展しやすいかを CE の郊外生成と照合して測る仕組み(sim:server 拡張・出入り口台帳・実験定義・レポート)
- docs/plan/building-record.md - 城・修道院・住宅・水車を後から含められる建造物の正本。測量メートルの平面から CE の粗い 3D と上面 SVG、DE の文書を導く。第1弾は中世ラテン・ヨーロッパの城 9 件。現行の DungeonDocument は正本にしない
- docs/plan/ce-3d-building-massing.md - CE建物の3D属性(階数・各階の用途・屋根・材質)、three.jsでの3D表示、LOD簡略版をFMG 3D/REへ配置。同日補強: 今回はCE単体のM0–M3。建物と構造物は保存せず導出時に属性を付ける
- docs/plan/ce-3d-water-boundary.md - CEの3D水面。陸と非陸を文書から描画時に導く
- docs/plan/estuary-port-pair-relocation.md - 河口の港町の寄せ過ぎ(セル外・海上への再配置、海上の橋)の改善案(取り下げ)
- docs/plan/fmg-harbour-model-before-after.html - fmg-harbour-model.md を実装した場合の before / after の図解
- docs/plan/fmg-harbour-model.md - 港を独立した存在にし、都市・港・航路の生成順序を固定する(estuary-port-pair-relocation.md の後継)
- docs/plan/initial-wealth-calibration.md - 国家・都市・人物の開始時の富を定常期の統計から逆算する調査。現状はお金が家計から国庫へ一方向に流れて定常状態がなく逆算できないため、出入りの計測→循環の是正→逆算の順序を示す
- docs/plan/medieval-european-nobility-holdings.md
- docs/plan/money-scale-calibration.md - 価格(人数尺度)と定額のお金(人口点尺度)の桁ずれを、価格は据え置き定額のお金に係数 K(populationRate 比例)を掛けて揃える設計(initial-wealth-calibration.md §8.5 の対応)
- docs/plan/road-surface.md - 街道と都市内幹道の路面。時代・文化圏・経済力から描画時に導く。CE 3D が最初の消費者

2026-10-16

- docs/plan/simulation-channel-server.md
- docs/plan/simulation-core-separation.md
- docs/plan/wind-aspect-climate-variability.md - セル別の季節風・日変化、斜面方位による気温補正、小氷期

2026-10-15

- docs/plan/fmg-city-context-audit.md
- docs/tools/fmg-city-audit.md

2026-10-12

- docs/plan/waterfront-town-proximity.md

2026-10-11

- docs/plan/map-server.md
- docs/plan/river-port-lab.md

2026-09-15

- docs/city-editor/random-generation.md

2026-09-13

- docs/simulation/funeral-rites.md

2026-09-11

- docs/plan/characters/craft-skills-expansion.md
- docs/plan/neutral-burg-incorporation.md - 中立都市の統治機構・NPC政治姿勢および国家編入（平和的・武力的・第三国介入）
- docs/plan/war-fervor-and-weariness.md

2026-09-09

- docs/plan/data/races.md - 種族データCSVのimport/export手順

2026-09-08

- docs/plan/characters/relationship-compatibility.md

2026-09-07

- docs/plan/characters/arcane.md - High/Dark Fantasy の Arcane（第10スキルにしない）と種族耐久
- docs/plan/characters/court-favorite.md
- docs/plan/characters/military-war-record.md
- docs/plan/characters/occupation-epithets.md
- docs/plan/characters/prestige.md
- docs/plan/characters/skill-specializations.md
- docs/plan/long-lived-race-population-and-roster.md - 長寿種族の初期人口・軍事均衡・Fast-Forward後の名前付き人物肥大の調査と4層補償方針
- docs/plan/unscrupulous-merchant-goods-market.md - 悪徳商人による市場の操作

2026-09-06

- docs/plan/advance-time-history-mode.md
- docs/plan/characters/character-expression-revision.md
- docs/plan/fanatic-player-sacrificial-conflict.md - 狂信者の宗教結社プレイ、国家間工作・兵器後援・聖戦と奉納の設計
- docs/plan/marshal-player-unauthorized-war.md
- docs/plan/underground-realm-and-supernatural-areas.md
- docs/plan/world-history-depth.md

2026-09-05

- docs/plan/fictional-map-feature-gaps.md - フィクション地図と比較した際に欠けている地図要素8項目の概要と掘り下げポイント
- docs/plan/technology-graph-missing-intermediates.md

2026-09-04

- docs/plan/economy-coupling-audit.md

2026-08-23

- docs/plan/burg-directions.md
- docs/plan/fallow-reduction-fertilizer-rotation.md
- docs/plan/mechanical-refrigeration-and-cold-chain.md
- docs/plan/natural-gas-lng-power-generation.md

2026-08-21

- docs/plan/climate-disaster-drought.md
- docs/plan/distant-realms-overseas-trade.md
- docs/plan/epidemic-cholera-and-water-security.md
- docs/plan/military-era-progression.md
- docs/plan/modern-urban-water-treatment-and-governance.md
- docs/plan/river-avoiding-land-routes.md
- docs/plan/river-levee-and-flood-damage.md

2026-08-20

- docs/plan/catalytic-chemistry.md
- docs/plan/chlor-alkali-electrolysis-vertical-slice.md
- docs/plan/chlorine-production-vertical-slice.md
- docs/plan/cinnabar-mercury-vertical-slice.md
- docs/plan/dam-flood-control-and-hydropower.md
- docs/plan/electric-power-and-telegraph.md
- docs/plan/electrolytic-industry-vertical-slice.md
- docs/plan/modern-steelmaking-and-high-pressure-apparatus.md
- docs/plan/petroleum-and-internal-combustion-vertical-slice.md
- docs/plan/phosphate-fertilizer-vertical-slice.md
- docs/plan/rocket-and-space-development-vertical-slice.md
- docs/plan/smokeless-powder-visibility.md
- docs/plan/synthetic-ammonia-vertical-slice.md

2026-08-19

- docs/plan/craft-demand-calibration.md
- docs/plan/player-character-technology-bias.md

2026-08-18

- docs/plan/chemistry-medicine-knowledge-accumulation.md
- docs/plan/earth-geography-heightmaps.md
- docs/plan/steam-industrial-implementation.md

2026-08-16

- docs/simulation/frontier-start-modes.md
- docs/simulation/frontier-start-placement-guidelines.md

2026-08-15

- docs/plan/vessel-itinerary-and-finite-trade-fleet.md

2026-08-14

- docs/plan/mineral-resource-system.md
- docs/plan/mount-and-fleet-asset-constraints.md
- docs/plan/shipbuilding-initial-fleet.md
- docs/plan/steam-engine-knowledge-accumulation.md
- docs/plan/steam-industrial-goods-and-technology-chain.md
- docs/plan/volcanic-biome-goods.md
- docs/reviews/0814-table-header-data-alignment.md

2026-08-13

- docs/plan/advance-time-loop-reduction.md
- docs/plan/civil-administration-burg-state-split.md
- docs/plan/department-budget-spending-effects.md

2026-08-12

- docs/plan/perennial-fruit-crops.md
- docs/plan/seasonal-crop-calendars.md
- docs/plan/seasonal-temperature-variation.md
- docs/plan/staple-crop-climate.md
- docs/plan/wine-pomace-distillation.md
- docs/simulation/salt-logistics.md

2026-08-11

- docs/plan/guilds/relations.md
- docs/simulation/heating-and-cold-climate-technology.md

2026-08-10

- docs/plan/river-water-allocation.md

2026-08-08

- docs/plan/guilds/textiles.md

2026-08-07

- docs/plan/balance-history-export.md
- docs/plan/fauna-biome-realism.md
- docs/plan/food-nutrition-audit.md

2026-08-06

- docs/plan/biome-goods-producer-ecosystem.md
- docs/plan/characters/character-health-and-disease.md
- docs/plan/fantasy-culture-set-goods.md
- docs/plan/harbor-siting.md
- docs/world/help/trademarked-fantasy-terms.md

2026-08-05

- docs/simulation/ocean-currents.md

2026-08-04

- docs/plan/character-loadout-and-readiness.md
- docs/plan/high-fantasy-dungeons.md
- docs/plan/player-threat-cull-jobs.md
- docs/plan/wild-oikoumene-frontier.md

2026-08-03

- docs/analytics/advance-year-performance.md
- docs/analytics/character-wealth-balance.md
- docs/analytics/polity-fiscal-regimes-historical.md
- docs/plan/characters/appearance-and-reproduction.md
- docs/plan/individual-skill-mastery-system.md
- docs/plan/multi-ledger-fiscal-architecture.md
- docs/plan/player-character-market-commerce.md
- docs/plan/technology-development-roadmap.md
- docs/plan/urban-water-and-sanitation-system.md
- docs/simulation/civic-conditions.md
- docs/world/help/multi-race-geopolitics.md
- docs/world/help/races-beauty-and-pairing.md

2026-08-02

- docs/plan/characters/backstory-profile.md
- docs/plan/characters/flavor-text.md
- docs/plan/great-library.md
- docs/plan/guild-city-bases.md
- docs/plan/market-goods-flow-budget.md
- docs/plan/merchant-logistics-warehouses.md
- docs/plan/urban-housing-system.md
- docs/plan/urban-inn-system.md

2026-08-01

- docs/analytics/cost-of-living.md
- docs/plan/currency-denomination.md
- docs/plan/goods-unit-scale.md
- docs/plan/merchant-transport-asset-ledger.md
- docs/plan/state-treasury-department-budget.md
- docs/plan/trade-cargo-capacity-and-diversity.md

2026-07-31

- docs/plan/burg-treasury-equilibrium.md
- docs/plan/knowledge-guild-system.md
- docs/plan/rural-agtech-investment.md
- docs/plan/urban-construction-industry.md

2026-07-30

- docs/simulation/economy-market-accounting-audit.md
- docs/simulation/population-food-supply.md

2026-07-29

- docs/plan/megacity-food-import-economy.md - 食料輸入によるBurg人口上限突破の経済モデル設計

2026-07-28

- docs/plan/mineral-resource-circulation-fixes.md
- docs/plan/mineral-smelting-security-system.md

2026-07-27

- docs/plan/land-route-elevation-cost.md
- docs/plan/mineral-resource-system.md
- docs/plan/route-grade-movement.md

2026-07-25

- docs/debug/0725-polity-density.md
- docs/plan/biomes.md
- docs/plan/frontier/country-and-border.md
- docs/plan/longbow.md

2026-07-24

- docs/plan/cell-to-hex.md
- docs/plan/disaster-mode.md
- docs/plan/frontier-expansion.md
- docs/plan/game-mode.md
- docs/plan/minimum-pops.md
- docs/plan/move-buttons.md - よく使うボタンを使いやすい場所に再配置する計画
