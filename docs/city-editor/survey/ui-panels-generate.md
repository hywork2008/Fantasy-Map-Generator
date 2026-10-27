# GENERATEパネルの分類と再構成

## 2026-10-26 実装後の構成

New cityとFeaturesをタブの外の上部に集約し、その下を「基本条件 / 要素別設定 / 表示 / デバッグ / 装飾」の5タブに分割した。海岸と河川は有無と形状・本数を兼ねる選択メニューのため、Relief / Hilltopとともに上部に置く。タブの切替ではDOMを作り直さず、設定値・生成結果・生成段階を維持する。

「最上位」は、生成全体の方式や入力元を選ぶものと、地図要素の有無を決めるものを区別する。詳細設定は対象となる地図要素に所属させる。例えばCoastal wallsは海岸ではなく城壁、Castle platformは城塞、Urban area inside wallsは城壁と市街地の配分、Avoid seaは道路・壁・建物に共通する水域回避である。

| 操作・設定 | 分類 / 階層 | 対象 | 配置 |
| --- | --- | --- | --- |
| Generation mode | 生成全体の最上位モード | City / Fort、利用できる生成条件 | 上部 |
| New city、進捗 / Cancel | 新しいSeedでの生成実行・進捗 | 生成全体 | 上部 |
| Generate from seed（Seedから生成） | 指定したSeedでの生成実行 | 生成全体 | 基本条件のSeed入力欄の直下 |
| Port / Walls / Citadel / Plaza / Temple / Shanty | 要素の最上位スイッチ | 港 / 城壁 / 城塞 / 広場 / 寺院 / 小屋地区 | 実行操作の下のFeatures |
| Coast / Rivers / Relief・Hilltop | 地理要素の有無・基本条件 | 海岸 / 河川 / サイトの丘上条件 | Featuresの直下 |
| Seed / Copy shareable link | 再現・共有（地図要素に属さない） | 乱数入力 / 現在の生成条件と段階 | 基本条件 |
| FMGパラメーター / Use standalone site | 入力元の最上位選択・情報 | FMG連携 / 独立サイトの条件 | 基本条件 |
| Population enabled | 規模計画の最上位スイッチ | 人口から市街地・住宅・地図範囲を計画するか | 基本条件 → 人口・地図範囲 |
| Population source / Population / display / frame / cell、人口推計 | 有効時の詳細条件・見積情報 | 人口の入力元・目標、住宅表現、地図範囲、メッシュ粒度 | 基本条件 → 人口・地図範囲 |
| Generation method / City layout | 生成全体の方式・都市構造の最上位選択 | Mesh-first / Skeleton-first、市街地・街路の構成 | 基本条件 → 生成方式・都市構造 |
| Randomize geography | 条件のランダム化と再生成 | サイト条件とSeed（海岸だけではない） | 基本条件 |
| Elevation preset / relief、Terrain field / Terraces / step | 地形の方式と詳細条件 | 地形・標高・平坦段（海岸形状とは独立） | 要素別設定 → 地形・標高 |
| Update elevation relief | 生成済みの対象への更新操作 | 現在の標高地形 | 要素別設定 → 地形・標高 |
| River placement / River drop | 有効時の詳細条件 | 河川の対市街地位置 / 水面深さ | 要素別設定 → 河川 |
| Town fortification、outworks / ditch / street plan / dimensions | 城壁方式の選択と方式固有の詳細条件 | 通常防壁 / 稜堡都市、外郭・堀・街路・寸法 | 要素別設定 → 城壁 |
| Wall shape / sides / material / coastal walls | 有効時の詳細条件 | 城壁の形状・材質・海岸側の閉じ方 | 要素別設定 → 城壁 |
| Town wall outer moat / rings / build order | 有効時の詳細条件 | 都市側の堀 / 城壁構成 / 建設順 | 要素別設定 → 城壁 |
| Urban area inside walls | 要素間の配分条件 | 城壁内外の市街地・住宅容量 | 要素別設定 → 城壁 |
| Remove bastioned town | 生成後の構造編集 | 生成済みの稜堡防御施設 | 要素別設定 → 城壁 |
| Castle position / relationship / form / size / platform / rise、Citadel outer moat | 有効時の詳細条件 | 城塞の配置・内部構造・地盤・堀、城壁との接続 | 要素別設定 → 城塞 |
| Building generation / Urban core allocation mode、住宅集計 | 方式・詳細条件・結果情報 | 建物配置 / 市街地の割当 / 住宅容量 | 要素別設定 → 市街地・住宅 |
| Street far end / Manual bearings | 詳細条件 | 城門外道路の行き先・方向 | 要素別設定 → 道路・水域回避 |
| Avoid sea | 複数要素に共通する生成制約 | 道路・壁・建物の水域回避 | 要素別設定 → 道路・水域回避 |
| Block editing view / Show grid lines / urban core / FMG surroundings / elevation tint | 表示・編集補助（生成条件とは別） | 編集メッシュ、各表示レイヤー | 表示 |
| Render quality | 描画品質（生成条件とは別） | 表示量・描画時の集約 | 表示 |
| Generation stage / Previous・Next step / Generate from edits / N patches | 段階検証・編集状態からの再開・診断用制限 | 生成途中の状態と処理 | デバッグ |
| Failure preview / Close failure preview | 失敗診断 | 失敗時の診断表示 | デバッグ |
| Generate / Show vacant lot trees | 生成後の装飾とその表示 | 空き地の樹木 | 装飾 → 空き地の樹木 |
| Regenerate farmland / generation / range / direction / coverage / system / year、農地集計 | 生成後の土地利用の生成・設定・結果情報 | 郊外の農地・農村景観 | 装飾 → 農地・郊外の土地利用 |

追加の分類は「生成全体の条件」「入力元」「再現・共有」「描画・編集補助」「結果・見積情報」「生成後の構造編集」「複数要素に共通する制約」。これらをFeaturesのチェックボックスと同列に扱わず、それぞれの目的・対象に配置した。

### 依存条件と連携

- Walls / Citadelが無効なら対応する詳細セクションを隠す。再度有効にした際には以前の設定を維持する。
- 河川詳細は河川がある場合のみ、River placementは河川1本かつ城壁あり、Coastal wallsは海岸あり、Terrace stepは段丘ありの場合のみ表示する。
- 人口計画が無効なら人口の詳細条件と見積を隠す。
- Skeleton-first等の既存の利用制限、形状による辺数の表示条件、二重城壁の建設順の無効化、手動方位の表示条件は維持する。
- FMG取込時もFeaturesは上部に表示し、FMGの実際の値を読み取り専用で示す。編集するには「基本条件」のUse standalone siteで入力元を切り替える。独立サイト専用の地理・都市構造設定は従来どおり非表示とする。
- 設定の警告・不整合はタブの外に表示し、別タブの設定変更でも更新する。Fortではすべての都市専用グループを隠す。
- タブは左右矢印 / Home / Endで切り替え可能。選択状態と表示先をARIA属性で関連付ける。

DOCUMENTの役割を地図サイズ・セル構造・縮尺・全体のスムージングと定義し、生成条件・外観・描画設定をGENERATEへ移動した。詳細は次節を参照。

## DOCUMENTからの移動と外観の即時反映

| 項目 | 役割 | 配置 |
| --- | --- | --- |
| Historical period | 生成の時代条件。城郭様式等の自動判定にも使用 | GENERATE → 基本条件 |
| Current building generation | 現在の建物方式を変更し、以後の生成にも使用 | GENERATE → 要素別設定 → 建物の外観 |
| Housing culture / Housing climate | 現在の住宅の文化・気候表現を即時更新 | GENERATE → 要素別設定 → 建物の外観 |
| Building height mode / City-wide height limits / Update building height distribution | 住宅の高さと高さ制限を更新 | GENERATE → 要素別設定 → 建物の外観 |
| Castle style | 現在の城へ様式を一括反映し、以後の生成にも使用 | GENERATE → 要素別設定 → 建物の外観 |
| Model quality / Ground spacing | 3Dモデルの品質・地面の描画解像度 | GENERATE → 表示 |
| Map size / Grid / Hex size / Scale / Smoothing / Grid evolution | 地図範囲・セル構造・幾何編集 | DOCUMENTに維持 |

Castle styleは生成の有無やCitadelスイッチにかかわらず使用でき、手動配置した城にも適用する。地図全体の外観変更として通常の城を一括更新し、城の敷地・内部形状・構造のロック状態を維持する。固有モデルを持つ歴史要塞はそのモデルを維持する。Autoでは各城の様式指定を解除して時代・文化の自動判定へ戻す。

全体で選んだCastle styleは地図に保存し、Undo / Redo、再読込、生成入力への継承で維持する。Inspectorで各城だけに異なる様式を指定することも可能。Inspectorの選択欄にはアクセシブル名を付け、従来の「Style: 現在の様式」の重複ラベルを削除して幅いっぱいに表示する。

## 移動前の機能調査

再構成前のソースコードに基づいた機能調査です。**「直接の対象」**と、配置変更などによる**「間接的な影響」**を区別しています。項目名はUIと照合しやすいよう、英語名・内部名も併記しています。

なお、Historical period、Current building generation、Scale、Smoothing、建物の文化・気候などは、現在の実装では **GENERATEではなくDOCUMENTパネル**の項目です。

### 生成操作・表示

| 項目名 | 効果 | 影響する対象 |
| --- | --- | --- |
| Generation mode | 都市（City）と砦（Fort）の生成を切り替える。Fortでは小さな範囲・20m六角グリッドを使用する | **生成全体**。Fortでは都市用設定の一部が利用不可 |
| Generate complete city | 現在の設定で一括生成する | **生成全体** |
| New city | 新しい都市を生成する | **生成全体** |
| Seed | ランダム生成の基準値。同じ設定と組み合わせて生成結果を再現する | **乱数を使う生成処理全般** |
| Copy shareable link | Seedや生成設定を含む共有リンクをコピーする | 生成結果への影響なし |
| 生成進捗・Cancel | 生成状況の表示と、実行中の生成の中止 | 実行中の生成処理 |
| Debug: Show generation failure preview | 生成失敗時の診断用プレビューを表示する | **診断表示のみ** |
| Close failure preview | 失敗プレビューを閉じる | **診断表示のみ** |
| Block editing view | 街区編集用のメッシュ表示を切り替える | **編集表示のみ** |
| Show grid lines | グリッド線の表示を切り替える | **表示のみ** |
| Render quality | 自動・詳細・軽量・最小を選ぶ。建物の集約や、建物・樹木の表示量を調整する | **描画のみ**。都市の生成設定とは別 |
| Show urban core | 都市中心部レイヤーの表示を切り替える | **表示のみ** |
| Show FMG surroundings | FMGから取り込んだ周辺レイヤーの表示を切り替える | **表示のみ** |

### 人口・生成方式

| 項目名 | 効果 | 影響する対象 |
| --- | --- | --- |
| Population enabled | 人口を基準に都市規模を計画する機能を有効化する | **市街地面積・必要住宅数・生成範囲・メッシュ**。城壁や道路にも間接的に影響 |
| Population source | 手入力、FMGの人口、CEでの上書きを選択する | **人口計画**。FMG連携の有無で選択肢が制限される |
| Population | 目標人口を指定する。FMG人口を使用する場合は直接編集不可 | **住宅数・市街地規模**。壁・道路の配置にも波及 |
| Population display | 自動・詳細・10戸集約・20戸集約を選ぶ | **住宅の表現・集約単位** |
| Population frame | 人口に合わせた範囲の自動設定、または既存範囲の使用を選ぶ | **地図の生成範囲**。手動範囲が不足する場合はエラー |
| Population cell | 人口計画で使用するメッシュのセル幅を50・100・150・200mから選ぶ | **メッシュと市街地割り当ての粒度**。壁・道路などにも間接的に影響 |
| 人口推計の表示 | 必要住宅数、推定建物数、面積、生成範囲などを表示する | 情報表示のみ |
| Generation method | Mesh-first／Skeleton-firstを選ぶ。メッシュを基準に生成するか、骨格を先に組み立てるかを切り替える | **都市構造全体** |
| Wall shape | Skeleton-firstで、Auto・Organic・Round・Oval・Square・Polygon・Bastionedを選ぶ | **城壁の基本形状**。市街地・道路にも間接的に影響 |
| Wall sides | Polygon／Bastionedの辺数を3〜12で指定する | **城壁形状**。該当形状を選んだ場合のみ表示 |

### 地形・海岸・河川・都市構造

| 項目名 | 効果 | 直接の対象と間接的な影響 |
| --- | --- | --- |
| Elevation preset | Flat・Slope・Dome・Basin・Valleyから標高形状を選ぶ | **標高地形**。海岸線の形を直接選ぶ項目ではない |
| Elevation relief | 標高プリセットの起伏の強さを調整する | **標高・高低差** |
| Update elevation relief | 起伏設定を現在の地図へ適用する | **現在の標高地形** |
| City layout | Auto・Organic・Circulade・Bram・Classicを選ぶ | **市街地・街路などの都市構造**。Coastだけ、Wallだけの設定ではない |
| Building generation | Legacy／Medievalを選ぶ。従来の住宅配置と、敷地・店舗・住宅・庭を扱う方式を切り替える | **敷地・建物配置** |
| Coast | None・Straight・Bay・Capeで海岸の有無と形を選ぶ | 直接は**海岸・海域**。港、市街地、海岸側城壁、道路、建物配置にも波及 |
| Rivers | 河川数を0・1・2本から選ぶ | 直接は**河川**。橋、城壁の河川通過部、道路、市街地にも波及 |
| River placement | 市内を通過／城壁のすぐ外／城壁の外側を選ぶ | **河川と市街地・城壁の位置関係**。河川1本かつ城壁ありの場合に適用 |
| Relief / Hilltop | サイト生成の丘上地形を有効にする | **サイトの地形条件**。CoastやWallだけの設定ではない |
| Terrain field | Off・Crag・Spur・Meander・Escarpment・Noiseの地形テンプレートを選ぶ | **地形の起伏・地形場**。有効にするとElevation presetはFlatになる |
| Terraces | 自然地形と段丘化を切り替える | **地形の平坦段**。道路のランプ・階段にも関係 |
| Terrace step | 段丘の高さ間隔を指定する | **段丘の高低差** |
| Randomize geography | サイト設定とSeedをランダム化し、生成段階を再実行する | **海岸・河川・Relief・Featuresなど**。Coastだけを変更する操作ではない |

### Features

| 項目名 | 効果 | 影響する対象 |
| --- | --- | --- |
| Port | 港の生成を有効化する | **港・水際施設**。海岸・水域条件に依存 |
| Walls | 都市城壁の生成を有効化する | **都市城壁・城門**。道路や市街地配置にも間接的に影響 |
| Citadel | 城塞の生成を有効化する | **城塞・その敷地と防御施設**。周辺の市街地・城壁にも影響し得る |
| Plaza | 広場の生成を有効化する | **広場・周囲の土地利用や街路** |
| Temple | 寺院の生成を有効化する | **寺院・その用地** |
| Shanty | 掘っ立て小屋地区の生成を有効化する | **該当地区・建物配置** |

### 城壁・城塞・堀

| 項目名 | 効果 | 直接の対象と間接的な影響 |
| --- | --- | --- |
| Wall material | Auto・Stone・Woodを選ぶ。Autoは都市規模に応じて石造／木造を選択する | **城壁の材質・表現**。海岸形状の設定ではない |
| Coastal walls | Auto・Fully walled・Open coast・One openingを選ぶ | **海岸側の城壁の閉じ方・開口**。Coastそのものの形は変更しない |
| Castle position | Auto・Edge・Centralで城塞位置を選ぶ | **城塞の位置**。周辺街区・都市城壁との接続にも波及 |
| Relationship to town walls | Auto・Integrated・Detachedを選ぶ | **城塞と都市城壁の接続関係** |
| Castle form | Keep and courtyard／Residence around a courtyardなどを選ぶ | **城塞内部の構成** |
| Castle size | Small・Standard・Largeなどを選ぶ | **城塞の規模・占有範囲** |
| Castle style | 自動、または城郭様式を選ぶ | **城塞の様式** |
| Castle platform | Auto・Natural・Cliff・Slopeを選ぶ | **城塞の基壇・周辺地形** |
| Castle ground rise | 城塞地盤の持ち上げ高さを指定する | **城塞地盤の標高** |
| Town wall outer moat | 都市城壁の外堀を有効化する | **都市側の防御回廊・堀** |
| Citadel outer moat | 城塞の外堀を有効化する | **城塞側の防御回廊・堀** |
| Town wall rings | Single・Double・Razedを選ぶ。単郭、二重城壁、内壁撤去状態を指定する | **都市城壁の構成・旧市街との関係** |
| Town wall build order | Outer-first／Inner-firstを選ぶ | **二重城壁の生成順・生成段階**。Singleでは無効 |
| Urban area inside walls | 城壁内に割り当てる市街地割合を指定する | **城壁内外の市街地・住宅容量の配分**。Wallだけの見た目設定ではない |
| 住宅集計 | 都心部と外周部の地区別建物数などを表示する | 情報表示のみ |

### 段階生成・市街地割り当て・道路

| 項目名 | 効果 | 影響する対象 |
| --- | --- | --- |
| Generation stageスライダー／左右ボタン | 指定した生成段階まで生成し、その状態を表示する | **選択段階までの生成結果**。Coast、River、Urban、Walls、道路、建物、農地など |
| Previous step／Next step | 対応する生成段階の内部ステップを前後する | **現在の段階内の処理**。Coast・River・Urban・Gates・Streets・Wardsで利用可能 |
| Generate from edits | 手動編集した状態を起点に生成を進める | **編集内容を引き継いだ後続の生成結果** |
| Urban core allocation mode | Legacyは外周住宅帯を含み、Compactは都市中心部に絞って割り当てる | **市街地の割り当て範囲**。城壁・住宅配置にも波及 |
| ③ N patches（空欄＝Auto） | 第③段階の市街地拡張を、先頭Nセルまでに制限する | **市街地セル数・範囲**。壁・道路・建物配置にも間接的に影響 |
| Avoid sea | 道路・壁・建物が水域に入り込むことを避ける | **道路・城壁・建物の水域回避**。海岸線自体は変更しない |
| Street far end | Descriptor end・Radial・Manual bearingsから城門外道路の行き先の決め方を選ぶ | **城門外へ延びる道路** |
| Manual bearings | 各陸上城門に対する道路方向を、コンマ区切りの方位角で指定する | **城門外道路の方向**。Manual bearings選択時のみ表示 |

### 装飾・農地

| 項目名 | 効果 | 影響する対象 |
| --- | --- | --- |
| Generate vacant lot trees | 空き地の樹木を新しいSeedで生成する | **空き地の樹木** |
| Show vacant lot trees | 生成済みの空き地樹木の表示を切り替える | **樹木の表示のみ** |
| Regenerate farmland | 農地を再生成する | **郊外の農地・農村土地利用** |
| Farmland generation | Manual・Background・Offで農地生成の扱いを選ぶ | **農地生成** |
| Farmland range | Whole frame／Near cityで対象範囲を選ぶ | **農地の配置範囲** |
| Farmland direction | 全方向／北／東／南／西を選ぶ | **農地の配置方向** |
| Farmland coverage | 農地の被覆率を0〜100%で指定する | **農地の量・占有率** |
| Farmland system | Auto・Open-field・Bocage・Planned・Mechanizedを選ぶ | **農地の区画・農業景観** |
| Farmland year | 輪作年を指定する | **農地の輪作状態** |
| 農地集計 | 農地の生成状態・集計を表示する | 情報表示のみ |

FMGから開いた場合には、取り込んだパラメーターの表示と **Use standalone site** もあります。後者は独立サイト設定へ切り替える操作で、海岸や河川を含む生成条件の入力元に関係します。

**利用条件の注意点：** Skeleton-firstでは、Citadel、二重城壁、城壁生成順、River placement、Urban core allocation mode、N patches、Street far end、Manual bearings、Avoid sea、Coastal walls、城塞・堀の設定などが制限されます。Bram／Circuladeも利用できず、Bastionedには時代条件があります。また、人口基準生成は現状、Skeleton-firstおよびBram／Circulade／Classicには対応していません。

参照元：[パネル構成](../../../src/city-editor/components/CityEditorPage.ts)、[生成コントロールと制限](../../../src/city-editor/components/generationPanel.ts)、[人口設定](../../../src/city-editor/components/populationControls.ts)。

上記の詳細一覧は移動前の実装調査。実装後の配置は冒頭の分類表を参照。
