# 追加したドキュメント

2026-10-28

- docs/plan/ce-forest-surroundings.md - CEの全耕作地・郊外の森林化を設計。共通の森林領域と農地の排他、固定要素・道路・水域・防御用地の保護、2Dの面＋林縁、3Dの樹木・簡略樹冠とチャンク・LOD・総量予算、非同期農地の復活防止、保存・共有・履歴、段階別実装と固定入力による計測を整理。同日F0の固定3都市を計測し、林縁方式のSVG要素79〜85%減、詳細樹木の全域利用回避、128 m近景・256 m遠景、初版の数量制限と実GPU計測の引継ぎを記録。同日F1の森林用地・共有輪郭・農地排他・キャッシュ無効化、文書v6／共有v4、生成・履歴への継承を実装し、関連131件と固定小都市の確認結果を追記。同日F2の2D面・林縁・内部模様・全域樹木・品質別上限・幾何再利用・静的SVGを実装し、関連75件と比較画像・計測を追記。同日F3の3D林床・樹冠・軽量立木・LOD・チャンク・予算・影と資源の制御を実装し、関連25件と固定2都市の確認を追記。同日F4の景観適用・取消、密度と表示設定のUI／保存、操作フレームによる自動品質・計測表示を実装し、関連30件と実ブラウザーでの確認、F5への校正引継ぎを追記。同日F5のMetal GPUによる固定3都市の比較、遠景樹冠・カメラ更新・軽量計測APIの調整、影あり／高品質住宅の切分け、関連8件と条件付きの33 ms目標達成、予算維持と追加校正の条件を追記。続く高品質住宅の最適化で近景LOD・再利用・仕様によるprototype共有を実装し、中都市の森林適用約48→2.3秒、操作p95最大26.3 ms、関連39件の検証と残作業を追記
- docs/plan/livestock-lot-ledger-performance.md - 長期実行が月数のほぼ2乗で遅くなる原因の家畜のロット台帳について、取引ごとの全ロット走査と、市場のロット・出荷・出口の集計が消えずに増える点を計測値で整理。結果を変えない索引（L1）、48か月の再計測（L2）、古いロットの統合と出所記録の削除（L3）の段階と、world.notesを除くgoldenのセクション比較による確認方法を設計
- docs/plan/rust-simulation-core.md - 分離済みのシミュレーション・コアと地図生成を、1つのRustクレートからWASM（ブラウザ・Node）とネイティブ（計測用CLI）にビルドし、システム単位で段階的に置き換える設計。列のゼロコピー受け渡し、エンティティ表、TSのスケジューラとの混在、JSの数値の意味と決定的な数学関数の移植、並列化でも結果が変わらない縮約、golden・並走検査によるビット一致、校正中のシステムを後回しにする順序、R0（遅さの原因が計算かメモリかの計測）〜R6の段階と判断基準を整理
- docs/plan/tick-growth-measurement.md - World固定入力の長期実行で月が進むほど遅くなる原因を特定する計測の計画・手順書。48か月の1本の実行で、月ごとの所要時間、tickラベル別のtotal/self時間、序盤と終盤の伸び率、都市・市場・隊商・台帳などの件数の推移、2か月分のCPUプロファイルを取り、伸びた処理と件数を対応づける。出力形式・判定方法・計測用Macでの手順・計測が結果を変えないことの確認を整理

2026-10-26

- docs/plan/ce-building-height-controls.md - 単独CEの高さ分布を既定とし、従来の一定階数への切替、都市全体・セル別の階数と屋根を含むm上限を追加。厳しい方の適用、人口容量と増階・描画の共通判定、セルの分割と結合・入力への継承、保存・共有・Undo/Redoと検証を整理。一般建物を対象とし固有施設は別扱い
- docs/plan/ce-building-height-variation.md - 高さ分布を実装。詳細表示を集約用の粗区画から再分割する初版を撤回し、従来の住宅配置と敷地形状を維持するよう修正。低層化に必要な面積を実容量から校正してコアのセル数を増やし、FMGの敷地充填率と区画寸法で帳尻を合わせない方針、固定境界・保存と共有・回帰検証を追記
- docs/plan/ce-regional-building-appearance.md - 一般住宅のBV詳細モデルを実測敷地・各階高から生成し、非等方な引き伸ばしと屋根勾配の丸めを除去。累積張り出し、店舗・工房兼住宅、板葺き・スレート・芝土・鉛板の描画、矩形適合と用途によるfallback、比較画像・関連テスト・固定1都市の負荷と残作業を§15へ記録。同日、街路・敷地内通路に向ける妻入り/平入りの選定、建物・水域・城壁等の遮蔽判定、実BV住宅によるクリック輪郭を実装し、§16に記録。同日、煙突の塞がった2本の円柱を中空の排煙口へ直し、建物規模・用途による1口/2口、地域別の筒・開口・笠と拡大画像を§17へ記録

2026-10-25

- docs/plan/ce-bastioned-fortress-city.md - CEの都市外周を稜堡・幕壁・堀・ラヴリン群へ置き換え、内側に市街全体を収める設計。防御用地の先行予約、門と橋の到達性、人口容量、地形・FMG連携、保存形式v5と旧レシピ互換、2D・3Dの共通計画、独立城塞との共存、段階別の実装と受入条件を整理。2026-10-25にB0〜B5の初版を実装。同日、起伏の縦断、川・海岸での水門と水際開口、兵舎と弾薬庫の専用区画を追加した。水堀は平らな内陸に限る。市壁と城塞の共有壁、第三外郭、地下通路、射界は後続 同日、第1次の火砲寸法校正を追加。稜堡・幕壁・外郭・空地の実寸下限、350 mの側防距離検査、校正値と史料値の区別、旧レシピ互換とv3共有、迫撃砲・施条砲への限界を整理
- docs/plan/ce-building-height-variation.md - CEのFMG連携・単独生成で住宅の階数が揃う経路を調査し、用途・地区別の分布、通りのまとまり、人口不足時の選択的増階、各表示モードの階数計算、階高の微差、旧保存と共有の互換、段階別の実装・検証を設計。史料の確認事項と生成用の仮比率を区別し、12棟の調査入力による現行処理の確認結果を記録
- docs/plan/ce-cell-elevation-presets.md - 3Dの川面を、接する陸からの低さで描画時に決める。既定は1 m下（陸100 mなら川面99 m）。スライダーの端では川面0 mで、これまでの溝に戻る。川面は上流が最も高く、下流へ上がらず、陸を越えない。中央が高い地形では川面は中央の高まりに乗らない

2026-10-24

- docs/plan/ce-cell-elevation-presets.md - CEの単独生成で陸セルがすべて標高1 mになる状態に、平面・山の斜面・中央高・中央低・谷のプリセットを加え、FMGのHeightmap編集に相当する上げ・下げ・ならしのブラシでセル標高を塗る。川は接する陸セルの川床が下流へ上がらない向きに直し、上がる陸セルは川床まで下げる。高さ場モードとは別の地面で、既定の平面とFMGから写した標高は変えない。高低差のスライダー（1〜8倍）は、12〜80 mに抑えた振幅を倍率で拡大する。スライダーを離すか「高低差を更新」で、生成済みの地図の陸の標高だけを書き直し、街路・区・建物・城壁は残す
- docs/plan/ce-terrain-field-mode.md - CEのセル標高(約50 m)より細かい高さ場を基盤地形`field`として加え、街区・建物の配置は既存のまま崖の上の城塞を3Dで描く設計。高さ場・Voronoiセル・敷地の3層を標本化でつなぐ解像度の分離、Landscape outline型の部品とテンプレート(岩山・尾根の先端・蛇行の岬・崖の縁)による生成とFMGとの整合、勾配の区分と切土・盛土を釣り合わせた敷地の造成、FMG同様の規則格子とチャンク・LODによる描画、格子1・2・4・8 mごとの頂点数・誤差の見積もりと計測(M0)で既定の格子と対象の規模(micro〜small、medium・largeは計測次第)を決める手順。2026-10-24にM0〜T5を実装。`npm run ce:terrain-perf` では見込みの格子のメッシュ構築が500 ms未満（1,200 m・1 mで81 ms、約144万頂点）で継ぎ目p95は0.3 m未満。1フレームの時間は未計測のため既定の格子は見込みのまま、高さ場を選べる上限は small（1,200 m）。medium・largeは対象外。headless Chromiumで岩山の生成（等高線・ケバ・3D）とBVの崖上城塞サンプルを開き、コンソールエラーは無かった
- docs/plan/ce-terrain-layers.md - CEの高さの持ち主をセルから外し、自然の地面(高さ場)・川の回廊(中心線・幅・下流へ単調に下る川床の縦断・土の岸か石の護岸)・用地(多角形のsummitを持つpad、縁は崖・斜面・擁壁)・城の台地・道の縦断の層に分ける設計。川を用地より先に重ね、用地から回廊と道の帯を差し引くことで、用地の縁を川岸に沿わせ、セルの外周の壁が川の上に立つ不具合をなくす。水面は回廊の縦断から直接決め、高さ場モードではセルの標高の編集を用地の作成に読み替える。L0(cellsモードの壁を水面で切り抜く小修正)〜L4の段階と、新しい地形ツールを作らない理由を整理。2026-10-24にL0〜L4を実装。回廊とpadは `terrain.features` に保存し、川床の高さ場への焼き込みは止めた。cellsモードは川・水路の多角形で擁壁三角形を切り抜く。BVに段々の川の確認用サンプルを追加
- docs/plan/winter-livestock-slaughter-and-preservation.md - 冬前の選択的屠畜と肉保存の史料確認、地域/種別の適用範囲、群れ・飼料・解体副産物・保存工程・所有会計の契約、校正待ち係数と実装順序を設計

2026-10-23

- docs/analytics/economy-e0-baseline-20261023.md - E0の§4.0基準表（出典範囲/基準なし）、固定2入力12か月の食料・一次生産・繊維の現状判定表と実決済観測の範囲を記録
- docs/analytics/economy-e0-comparison-20261023.json - E0基準観測のProvince/World派生比較。食料決済・一次生産・繊維・家計残高の集計と入力/ソースハッシュ
- docs/analytics/economy-e0-diagnostics-20261023.md - 都市作業の計画/実行の停止理由と主因、繊維の実決済の未充足内訳、市場別判定と製造/委託賃金の分離を記録
- docs/analytics/economy-e0-diagnostics-catalogues-20261023.json - 固定.fmgの保存商品カタログを無移行で抽出した入力カタログ対応表。入力ハッシュ付きで商品IDを照合
- docs/analytics/economy-e0-diagnostics-comparison-20261023.json - E0診断の固定2入力派生比較。旧観測との経済結果一致と市場別の計画/実行診断
- docs/analytics/economy-e0-food-boundaries-20261023.md - セル内食料の実収穫・加工と市場搬入の境界、食料台帳の対象人口、新市場17の初回決済スキップの継続観測を記録
- docs/analytics/economy-e0-fresh-processing-20261023.md - Fish/Game/Shellfishの加工記録の欠測補完、同一入力比較、E0完了条件の照合表を記録
- docs/analytics/economy-e0-planner-home-20261023.md - 計画診断unknownの停止箇所、家内作業の材料/労働/予算/丸め制約、E0の完了判定と未モデル化項目の持越しを記録
- docs/analytics/inputs/salt-s0-aligned-20261023/ - 同一年比較に使用した1300年・High MedievalのProvince seed101とWorld seed102の固定入力アーカイブ、および共通生成設定を保存
- docs/analytics/raw-observations-20261023.md - Git管理外にした全量観測JSONの一覧、バイト数、SHA-256と再生成の方針
- docs/analytics/raw/economy-e0-*-20261023.json - Git管理外（ハッシュはraw-observations-20261023.md）。E0各段階のProvince/World全量観測、6 MB前後の派生比較3件、1301年1月の継続観測
- docs/analytics/raw/salt-s0-aligned-province-101-20261023.json - Git管理外（ハッシュはraw-observations-20261023.md）。1300年・High Medievalの新規Provinceを12か月観測したSalt S0基準。初期プロファイルと実決済ごとの台帳を記録
- docs/analytics/raw/salt-s0-aligned-world-102-20261023.json - Git管理外（ハッシュはraw-observations-20261023.md）。同じ1300年・High Medievalの新規Worldの12か月観測。Provinceと同じ年月・尺度・設定・実装で比較
- docs/analytics/raw/salt-s0-province-101-20261023.json - Git管理外（ハッシュはraw-observations-20261023.md）。Standard・populationRate1000のprovince-101を590年1月から12か月進めた塩の品別フロー・実決済ごとの国家台帳・輸送と入力/ソースハッシュ
- docs/analytics/raw/salt-s0-world-102-20261023.json - Git管理外（ハッシュはraw-observations-20261023.md）。Standard・populationRate1000のworld-102を1929年1月から12か月進めた同形式の塩観測。provinceと保存年が異なる条件を明記
- docs/analytics/raw/salt-s1-province-101-20261023.json - Git管理外（ハッシュはraw-observations-20261023.md）。S1後のProvince固定入力の正式12か月観測。無所属も含む需要分母、加工履歴と家畜の補給仮定を明記
- docs/analytics/raw/salt-s1-world-102-20261023.json - Git管理外（ハッシュはraw-observations-20261023.md）。同じ設定・期間のWorld固定入力のS1後の観測。家計/家畜の不足を分離して保存
- docs/analytics/raw/salt-s2-province-101-20261023.json - Git管理外（ハッシュはraw-observations-20261023.md）。S2後のProvince固定入力の正式12か月観測。実決済ごとの生産方法・労働・Wood消費を追加
- docs/analytics/raw/salt-s2-world-102-20261023.json - Git管理外（ハッシュはraw-observations-20261023.md）。同期間・設定・実装でWorld固定入力を進めたS2正式観測。生産制約による不足と入力/ソースハッシュを保持
- docs/analytics/raw/salt-s3-province-101-20261023.json - Git管理外（ハッシュはraw-observations-20261023.md）。S3後のProvince固定入力の正式12か月観測。実支払と製塩ステップの保有者別現金変化を追加
- docs/analytics/raw/salt-s3-world-102-20261023.json - Git管理外（ハッシュはraw-observations-20261023.md）。同期間・設定・ソースのWorld固定入力の正式S3観測。現金移転・不足・物量照合用フローとハッシュを保持
- docs/analytics/raw/salt-s5-province-101-20261023.json - Git管理外（ハッシュはraw-observations-20261023.md）。通常自動判断でProvince固定入力を12か月観測したS5回帰結果。税・密売・義務未達・反乱・議会判断を追加
- docs/analytics/raw/salt-s5-world-102-20261023.json - Git管理外（ハッシュはraw-observations-20261023.md）。同期間・設定・ソースでWorld固定入力を進めたS5年次観測。自動政策が発動しなかったことも含めて保持
- docs/analytics/salt-s0-aligned-comparison-20261023.json - 同条件の2世界の派生比較集計、生成コマンド・条件の一致検証、固定入力/観測出力のハッシュと物量照合残
- docs/analytics/salt-s0-baseline-20261023.md - Salt S0の用途別史料・基準なしの範囲、旧2世界の観測と人口/物量境界を記録。同日追補で原典・原研究の採否、1300年の共通設定による比較、S0完了と次のS1を明記
- docs/analytics/salt-s1-comparison-20261023.json - 固定2入力のS0/S1比較。人口分母の違い、国家住民/無所属の内訳、家畜の補給、物量照合残と観測ハッシュを保存
- docs/analytics/salt-s1-demand-20261023.md - 無所属の取得経路、固定加工枠から実投入見込みへの置換、放牧5種の暫定補給計画と自然控除、保存互換・テスト・12か月比較、S1完了と次のS2を記録
- docs/analytics/salt-s1-population-coverage-20261023.json - S1の人口境界監査。固定した1300年の2世界で対象外人口は無所属住民であり、有効国家内の市場未割当は0人であることを確認
- docs/analytics/salt-s2-comparison-20261023.json - 同じ固定入力のS1/S2派生比較。労働・Wood実使用、方法別生産、家計区分、観測ハッシュと物量照合残を保存
- docs/analytics/salt-s2-production-20261023.md - 製塩の共通労働・燃料・天日季節・内陸地質の接続、暫定係数、12か月の不足増加と残課題、検証、S2完了と次のS3を記録
- docs/analytics/salt-s3-comparison-20261023.json - 固定2入力のS2/S3比較。実支払、保有者別現金純増減、人口区分、物量照合残、観測ハッシュを保存
- docs/analytics/salt-s3-finance-20261023.md - 家計購入・製塩賃金/燃料・卸/国際購入/運賃の決済、価格と出力の方針、12か月の現金保存と不足、S3完了と次のS4を記録
- docs/analytics/salt-s4-ownership-20261023.json - Province固定入力で4区分の既存所有者を割り当てた1か月の検証。国営移行、変更後/決済後の保存再読込、口座残高、現金保存とソースハッシュを保持
- docs/analytics/salt-s4-ownership-20261023.md - 私営・都市・教会・国の口座帰属、市場画面の所有者選択、旧保存の国営移行、失効参照と決済時所有者の扱い、検証、S4完了と次のS5を記録
- docs/analytics/salt-s5-comparison-20261023.json - 通常固定2入力のS3/S5年次比較。政策の非発動、供給・支払・現金保存・物量照合残と観測ハッシュを保存
- docs/analytics/salt-s5-policy-20261023.md - 専売営業権、財政/性格と議会、実税と徴税請負、密売・義務未達・不満・租税反乱の接続、政策比較と年次観測、S5完了と次のE0残作業を記録
- docs/analytics/salt-s5-policy-cases-20261023.json - Province固定入力の通常/税50%の12か月比較と、初期政治不満を明記した1か月の義務/反乱ストレス検証。保存・現金・イベント・ソースハッシュを保持
- docs/plan/ce-terrain-grading-layer.md - CEの高さをセル属性から基盤地形・造成フィーチャー(台地・堀・坂・道路回廊)・道路縦断の3層へ分け、崖の上の城塞や登城路を自動生成と統合する設計。P0として地形モデルを導入しFortSiteを移植(地面・高さは変更前と一致、FortSiteの基礎高の見落としを修正)。P1として城のセル全体を平らな台地(崖の縁または土の斜面)にする保存可能な造成と検査欄の操作を追加。P2として道の縦断を勾配上限(荷車10%・路地15%・小道25%)付きで解き、地形を道に合わせて切土・盛土し、崖をまたぐ道を止める処理を追加。P3として崖の台地の城門から崖の裾を巻いて下る石造の登城路(勾配8%、つづら折り)の自動配置、保存、2D・3D描画を追加。G1として生成の設定で城の地盤(崖・斜面と高さ)を選べるようにし、生成し直しても編集した台地と登城路を作り直し、登城路は登る人の右側を城壁に向ける。P4として丘の起伏から擁壁で区切った段々の町を作り、路地と段のある街路を石の階段で段に上げる処理(段の高さ4 m、階段は蹴上げ16 cm)を追加。2026-10-24、セルの標高をセル中心の円錐から水平なセルに改め、隣のセルとの段差は1:3の土手が収まれば土手、収まらなければ擁壁とした(道路の造成が円錐を削って尖塔が残る不具合とtempleの埋没を修正)
- docs/plan/historical-economy-production-consumption-circulation.md - 2026年10月追加の経済計画と最新追補を照合し、生活必需品の需要・予算、生産・実支払賃金、資本回収・輸送を接続する作業を再構成。食料優先と土地・月別労働・複合生産の補正を含む配分原則、材料余剰時の判定順、E0で確定する史実の桁の基準、食料と一次生産(牧草地・群れ・採毛)の規模を独立段階とした作業順、成果物付きの完了条件と比較観測・関連テストの方針を整理
- docs/plan/wool-products-and-sheep-husbandry.md - 羊毛製品の追加を確定方針として、Gemini回答の用途・史料を照合。普通の羊毛衣料・毛布からの実装順、共有牧草地・年齢別採毛・農村の加工供給の見直し、同一入力12か月の実頭数・土地要求・羊毛・衣服需要の監査を記録

2026-10-22

- docs/analytics/goods-physical-units-observation-20261022.json - 同じStandard設定のprovince-101を酒樽変更前後で36か月ずつ進めた、Ink・Linen・Beer・果物と果実酒の生産・消費・在庫・照合・出発の集計と入力ハッシュ
- docs/analytics/rennet-historical-yield-and-price.md - T13の中世レンネット購入支出、18世紀の抽出法、1916年の相対力価と1919年の数量付き費用を照合し、現行レシピの25 L/Cattle市場頭と未確定の単価・胃からの換算を監査
- docs/plan/ce-manual-city-authoring.md - CE手動編集のセル境界由来の細街路・仕上げ後の枠付近の道路・共有時の再生成を調査し、手動補完ポリシー、選択区域の仕上げ、文書共有と生成条件共有の分離、実装順序と受入条件を設計
- docs/plan/ce-regional-building-appearance.md - CEの2D・3D共通の地域別屋根・壁パレット、既存BV住宅と簡易マッシングのベンチマーク、街区の色別SVG集約、軽量描画とBVの分担・導出と保存・実装順序を設計
- docs/plan/character-wealth-lifecycle.md - 人物の遅延生成・詳細削除・死亡・相続から現金口座を独立させ、初期資金の配分と抽象家計の分割、通貨量の保存、旧セーブ移行・削除前精算を定義する設計
- docs/plan/goods-physical-units-remaining-tasks.md - goods-physical-units.md の §29 までの「残る課題」を後続の対応と照合し、輸送・レシピ・需要・史料・計測・基本単位移行の未対応事項、完了条件、対応済み項目、進める順を整理したタスクリスト
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
