
現在のソースコードに基づいてまとめました。**「直接の対象」**と、配置変更などによる**「間接的な影響」**を区別しています。項目名はUIと照合しやすいよう、英語名・内部名も併記しています。

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

参照元：[パネル構成](/src/city-editor/components/CityEditorPage.ts#L2480)、[生成コントロールと制限](/src/city-editor/components/generationPanel.ts#L268)、[人口設定](/src/city-editor/components/populationControls.ts#L14)。

コード変更は行っていないため、テストは実行していません。
