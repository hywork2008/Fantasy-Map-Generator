# 中世〜大航海時代の欧州向け3Dモデル追加タスク

作成日: 2026-10-21

## 対象と優先順位

BVの既存モデルとCEの「Add / remove facilities」全26項目を照合した追加候補。
主に12〜16世紀の欧州の都市・村落で見かける頻度を目安に並べる。
順位は統計値ではなく定性的な目安であり、地域・時代・集落の規模によって前後する。

「未整備」はBVの既存モデルに相当する専用3Dモデルがないことを指す。
CEの施設配置・平面描画や汎用3D表現の有無とは区別する。
「汎用あり」は既存の簡易表現を補う詳細モデルの候補。
複数モデルをまとめた項目は、記載した対象が揃った時点で完了とする。

## タスクリスト

- [x] 01. **樽・木箱・麻袋・籠** — 商店、農家、倉庫、市場、港向け。空・蓋付き・積載状態の差分。`src/buildings/props/medievalContainers.ts` に全12種類を実装し、BVの `Storage props` に登録。麻袋の蓋付き相当は口を縛った状態。実寸・接地・正面図・平面図を確認可能。CEへの自動配置は対象外。
- [x] 02. **木柵・枝編み柵・簡易木戸** — 宅地境界、菜園、牧場、家畜囲い向け。`src/buildings/medieval/02-boundariesModels.ts` に3モデルを実装し、BVに登録。
- [x] 03. **納屋・脱穀納屋・干草小屋** — 大扉、作業床、穀物束・干草を含む農村用モデル。 `src/buildings/medieval/03-barnsModels.ts` に専用モデルを実装し、BVに登録。
- [x] 04. **厩舎・牛舎・豚小屋・鶏小屋** — 農家、宿、都市の裏庭向け。用途別の規模・構造。 `src/buildings/medieval/04-animal-housingModels.ts` に専用モデルを実装し、BVに登録。
- [x] 05. **飼葉桶・水飼い桶** — 厩舎前、農家、宿、市場向け。 `src/buildings/medieval/05-troughsModels.ts` に専用モデルを実装し、BVに登録。
- [x] 06. **市場の露店・屋台** — 木台、布庇、商品陳列を組み合わせる。 `src/buildings/medieval/06-market-stallsModels.ts` に専用モデルを実装し、BVに登録。
- [x] 07. **普通の農家・小住宅の詳細モデル** — 汎用あり。木骨、塗壁、石造などの扉・窓・煙突・付属屋。 `src/buildings/medieval/07-dwellingsModels.ts` に専用モデルを実装し、BVに登録。
- [x] 08. **店舗兼住宅・小工房** — 汎用あり。開閉式の店先、庇、作業窓を持つ街路沿いの建物。 `src/buildings/medieval/08-shop-housesModels.ts` に専用モデルを実装し、BVに登録。
- [x] 09. **二輪荷車・手押し車・手運び台車** — 農作業、市場、建設現場向け。既存の四輪荷馬車を補完。 `src/buildings/medieval/09-hand-cartsModels.ts` に専用モデルを実装し、BVに登録。
- [x] 10. **パン焼き小屋・パン屋・共同窯** — 石造炉、煙突、薪置場。地域に応じた形式。 `src/buildings/medieval/10-bakeriesModels.ts` に専用モデルを実装し、BVに登録。
- [x] 11. **鍛冶場・蹄鉄工房** — CE: `smithyYard`。炉、鞴、金床、作業庇。 `src/buildings/medieval/11-smithiesModels.ts` に専用モデルを実装し、BVに登録。
- [x] 12. **街道宿・旅籠** — CE: `inn`。宿泊棟、中庭、厩舎。 `src/buildings/medieval/12-innsModels.ts` に専用モデルを実装し、BVに登録。
- [x] 13. **薪・柴束・木炭の置場** — CE: `fuelStack`。棚、覆い、積み方の差分。 `src/buildings/medieval/13-fuel-storageModels.ts` に専用モデルを実装し、BVに登録。
- [x] 14. **小規模な教区教会・村の礼拝堂** — 汎用あり。簡素な身廊、内陣、小鐘楼。既存の大型礼拝堂を補完。 `src/buildings/medieval/14-parish-churchesModels.ts` に専用モデルを実装し、BVに登録。
- [x] 15. **醸造所・エール醸造小屋** — 町、宿、修道院向け。農村への配置は地域による。 `src/buildings/medieval/15-breweriesModels.ts` に専用モデルを実装し、BVに登録。
- [x] 16. **穀倉・穀物貯蔵棟** — CE: `granary`。地域・時代別の貯蔵形式を選ぶ。 `src/buildings/medieval/16-granariesModels.ts` に専用モデルを実装し、BVに登録。
- [x] 17. **商業倉庫・荷蔵** — CE: `warehouse`。荷揚げ扉、庇、巻上げ梁。 `src/buildings/medieval/17-warehousesModels.ts` に専用モデルを実装し、BVに登録。
- [x] 18. **家畜市場の囲い・売買用柵** — CE: `livestockPen`。柵、仕切り、出入口。 `src/buildings/medieval/18-livestock-marketsModels.ts` に専用モデルを実装し、BVに登録。
- [x] 19. **墓標・墓石・教会墓地の小物** — 簡素な石標・木標など。時代・地域に合わせる。 `src/buildings/medieval/19-grave-markersModels.ts` に専用モデルを実装し、BVに登録。
- [x] 20. **織工・仕立屋・靴職人の工房** — 作業台、織機、材料棚。会館とは別の作業施設。 `src/buildings/medieval/20-textile-leather-workshopsModels.ts` に専用モデルを実装し、BVに登録。
- [x] 21. **桶職人・指物師の工房** — 樽組立台、木工台など。既存の製材・木材置場とは用途を分ける。 `src/buildings/medieval/21-woodworking-workshopsModels.ts` に専用モデルを実装し、BVに登録。
- [x] 22. **皮なめし場** — CE: `tannery`。槽、洗場、皮の乾燥架。 `src/buildings/medieval/22-tanneriesModels.ts` に専用モデルを実装し、BVに登録。
- [x] 23. **小型漁船・手漕ぎ舟** — 海岸、川、湖向け。漁網、櫂、籠を組み合わせる。 `src/buildings/medieval/23-small-boatsModels.ts` に専用モデルを実装し、BVに登録。
- [x] 24. **公共水盤・泉の水場・洗濯場** — 広場や水源付近向け。既存の屋根付き井戸を補完。`src/buildings/wells/publicWaterBasin.ts` に3モデルを実装し、BVの `Wells` に登録。CEの広場には衝突・通路判定を通した公共水盤を配置し、2D・3Dで同じ位置・実寸を使用。泉の水場・洗濯場のCEへの自動配置は対象外。
- [x] 25. **公共穀倉** — CE: `publicGranary`。大型貯蔵棟、搬入口。 `src/buildings/medieval/25-public-granariesModels.ts` に専用モデルを実装し、BVに登録。
- [x] 26. **市庁舎・市場会館** — 都市、市場町向け。集会室、商業用の開放階など。 `src/buildings/medieval/26-civic-hallsModels.ts` に専用モデルを実装し、BVに登録。
- [x] 27. **布地会館** — CE: `textiles`。織物生産・交易都市向け。店舗や織物工房とは別用途。 `src/buildings/medieval/27-cloth-hallsModels.ts` に専用モデルを実装し、BVに登録。
- [x] 28. **皮革・木工・石工・鍛冶の各会館** — CE: `leather` / `woodworking` / `masonry` / `metallurgy`。各職種のギルド会館。通常の工房とは区別。 `src/buildings/medieval/28-craft-guild-hallsModels.ts` に専用モデルを実装し、BVに登録。
- [x] 29. **石材置場・石工の作業場** — CE: `stoneYard`。粗石、切石、石工台、作業庇。 `src/buildings/medieval/29-stone-yardsModels.ts` に専用モデルを実装し、BVに登録。
- [x] 30. **石灰窯** — CE: `limeKiln`。窯体、焚口、原料置場。 `src/buildings/medieval/30-lime-kilnsModels.ts` に専用モデルを実装し、BVに登録。
- [x] 31. **布の晒し場** — CE: `bleachingField`。布を広げる区画、乾燥設備。 `src/buildings/medieval/31-bleaching-fieldsModels.ts` に専用モデルを実装し、BVに登録。
- [x] 32. **修道院の生活棟群** — CE: `abbey`。回廊、食堂、寝室棟、厨房など。 `src/buildings/medieval/32-abbey-living-quartersModels.ts` に専用モデルを実装し、BVに登録。
- [x] 33. **托鉢修道会の修道院** — CE: `friary`。主に中世盛期以降の都市向け。教会と比較的簡素な生活棟。 `src/buildings/medieval/33-friariesModels.ts` に専用モデルを実装し、BVに登録。
- [x] 34. **陶工の工房・陶器窯** — 窯、乾燥棚、粘土置場。 `src/buildings/medieval/34-pottery-workshopsModels.ts` に専用モデルを実装し、BVに登録。
- [x] 35. **港の木製荷揚げクレーン** — 商港、河港向け。踏車式・巻上げ式など地域別に選択。 `src/buildings/medieval/35-harbor-cranesModels.ts` に専用モデルを実装し、BVに登録。
- [x] 36. **常設絞首台** — CE: `gallows`。裁判権を持つ町の郊外や街道沿い向け。 `src/buildings/medieval/36-gallowsModels.ts` に専用モデルを実装し、BVに登録。
- [x] 37. **ガラス職人の会館** — CE: `glassware`。専門産業都市向け。ガラス炉・工房とは別施設。 `src/buildings/medieval/37-glassworkers-hallsModels.ts` に専用モデルを実装し、BVに登録。
- [x] 38. **印刷工房・印刷職人会館** — CE: `printing`は会館に対応。15世紀半ば以降。印刷機、紙棚、乾燥設備。 `src/buildings/medieval/38-printing-modelsModels.ts` に専用モデルを実装し、BVに登録。
- [x] 39. **楽器職人会館** — CE: `instruments`。比較的大きな都市や専門産地向け。 `src/buildings/medieval/39-instrument-makers-hallsModels.ts` に専用モデルを実装し、BVに登録。
- [x] 40. **砂置場** — CE: `sandYard`。ガラス製造・建設関連の原料山、囲い、運搬容器。 `src/buildings/medieval/40-sand-yardsModels.ts` に専用モデルを実装し、BVに登録。
- [x] 41. **正教会修道院** — CE: `orthodoxMonastery`。東欧・南東欧では優先順位を上げる。 `src/buildings/medieval/41-orthodox-monasteriesModels.ts` に専用モデルを実装し、BVに登録。
- [x] 42. **キャラバンサライ** — CE: `caravanserai`。欧州全域では低頻度。オスマン圏の南東欧などで採用。 `src/buildings/medieval/42-caravanseraisModels.ts` に専用モデルを実装し、BVに登録。

## 既存モデルとの重複を避ける

- CEの `timberYard` はBVに製材・木材置場の専用モデルがあるため、新規タスクから除外。
- 井戸、木造・石造風車、水車小屋、吊り看板、四輪荷馬車、幌馬車は実装済み。
- 城郭、大型礼拝堂、既存の各種船舶は実装済み。小規模教会・漁船など用途や規模の異なるものを追加する。
- カラベル船はBV一覧にないが、`src/buildings/ships/caravel.ts` にモデルコードがあるため除外。
- 桟橋、橋、城壁・城門はCE側に3D表現があるため、BV未登録だけを理由に追加しない。
- CE施設全26項目のうち25項目を上記タスクに対応付け、残る `timberYard` は既存実装として扱う。

## 着手の目安と完了確認

まず01〜06の小物・農業施設と09〜12の運搬・生業・宿泊モデルを揃える。
地域限定・時代限定のモデルは、順位だけでなく対象文化圏と年代に合わせて選ぶ。

各タスクでは専用3Dモデルを作成し、BVで形状・実寸・接地を確認できる状態を完了の目安とする。
CEへの自動配置・既存施設との接続は別途実装範囲を決める。モデル作成だけで施設の配置機能まで完了扱いにしない。

## 照合元と参考資料

- [BV登録一覧](/src/building-viewer/main.ts)
- [CE施設一覧](/src/city-editor/types/facilities.ts)
- [CE施設操作パネル](/src/city-editor/components/facilityPanel.ts)
- [CE構造物の3D形状生成](/src/city-editor/renderers/structureMassing.ts)
- [CE汎用建物の3D描画](/src/city3d/three/cityMeshes.ts)
- [Weald & Downland Living Museum: 農業建築](https://www.wealddown.co.uk/discover/buildings/farm-buildings/) — 納屋と穀倉の用途・時代差の参考。英国の形式を欧州全域に一律適用しない。
- [Weald & Downland Living Museum: 中世店舗の実例](https://www.wealddown.co.uk/buildings/medieval-shop-from-horsham/)
- [Historic England: 教会建築](https://historicengland.org.uk/images-books/publications/dlsg-places-worship/heag124-places-of-worship-lsg/)

本書は候補のタスク化であり、順位全体を史料から定量的に算出したものではない。
