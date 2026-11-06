# CE「Building generation」中世モードの生成ロジック比較

調査日: 2026-11-06。対象: CE Generate パネルの `medieval` と `medieval-facilities`。現行実装の選択値変換、都市生成後の区画・施設・住宅処理を追跡した。

## モードの意味

| UI 選択 | 内部設定 | 概要 |
| --- | --- | --- |
| `medieval` | `buildingPattern: "medieval"`、`facilityLayout` なし | 中世の街区・敷地・店舗・住宅・庭を生成する。施設は通常のランドマーク処理など既存の経路で扱う。 |
| `medieval-facilities` | `buildingPattern: "medieval"`、`facilityLayout: "population"` | `medieval` の中世街区を使い、人口に応じた職業施設を割り当ててから、人口住宅を容量に合わせて配置する。 |

`medieval-facilities` は別の建物パターンではない。選択イベントで `buildingPattern` を `medieval` に設定したうえで、人口施設レイアウトを有効にする（`controllers/panelEvents.ts`）。選択欄の表示・復元も `facilityLayout` を見ている（`components/generationPanel.ts`、`controllers/generation.ts`）。

## ステップごとの比較

| Step | `medieval` | `medieval-facilities` | 分岐・結果 |
| --- | --- | --- | --- |
| 1. 設定の確定 | `buildingPattern="medieval"` | 同左に加えて `facilityLayout="population"` | 街路、街区、歴史時代など共通設定を使う。 |
| 2. 都市骨格の生成 | 海岸・河川・城壁・門・街路・地区を通常どおり生成 | 同左 | 施設モード専用の道路生成ではない。生成の入口は `generation/generateCity.ts`。 |
| 3. 建物生成方式の選択 | `buildBlockFabric` が `buildingPattern` を見て中世ファブリック経路へ進む | 人口プランがあれば人口住宅用ファブリック経路を選ぶ | `blockInfill.ts` が `populationPlan` を先に判定し、無ければ `medieval` を判定する。 |
| 4. 街区・敷地の構築 | 中世街路文書を使い、既存ブロック生成から `buildMedievalFabric` を作る | `populationFabricSource` で人口住宅用の基礎ファブリックを作る。街路・街区形状は通常 CE の基礎経路を再利用 | どちらも既存メッシュと街路から導出し、別の格子を作らない。ファブリック分岐は `blockInfill.ts`、`populationHousing.ts`。 |
| 5. 職業施設の需要計算 | 人口連動の施設需要リストは作らない | 人口・時代・港の有無から交易・職業需要を計算 | `medievalTradeDemand` と `populationFacilityRequests` がギルドホール、工房などの要求を作る（`populationFacilities.ts`）。 |
| 6. 施設用地の割当 | 人口施設の割当処理を実行しない | 完成した街路形状のファブリックに対して施設を配置。通常割当と地区優先割当を比較し、全要求の配置状況がより良い方を採用 | 施設要求には中心部・郊外、商業・工芸・危険作業・河岸などの条件が付く。BVモデルが無い資産は仮寸法の暫定施設になり得る。人口が無い場合は population-required を報告する。 |
| 7. 住宅容量への適合 | 中世の住宅・店舗・庭などを含む `buildMedievalFabric` の建物構成を使う。人口目標への反復適合はこのモードの標準経路ではない | 施設を確定した後、残りの土地で必要住戸数を測定し、人口住宅の割当を適合 | 施設は住宅地を消費するため、施設割当後に住宅容量を評価する（`generateCity.ts`）。 |
| 8. 住宅容量の調整 | 建物高さ制約などが有効な場合、必要に応じて住宅面積を拡張する共通処理が働く | 住宅面積の拡張判定が人口施設モードでも有効。人口住宅の適合時は住戸数を再計測 | 面積拡張は再生成を伴い、最大3回の拡張パス設定を使う。人口モードでは必要住戸数と容量報告を保存する（`generation/heightArea.ts`、`populationHousingFit.ts`）。 |
| 9. 建物配置の確定 | 中世ファブリックの建物群を採用 | 選ばれた人口住宅適合パスのファブリックを保持し、住宅を確定 | 人口住宅の候補は時代の標準階数、最大階数、条件が許せば小さめの区画面積の順。住戸不足を最も減らす候補を選び、足りればそこで終了する。 |
| 10. 結果・表示 | 建物形状は通常の中世生成結果から導出 | 職業施設、住宅、施設・住宅容量レポートを含む | 施設レポートには要求数・配置数・暫定施設数・未配置項目と住宅の必要数・割当数・不足数などが含まれる。 |

## 生成順の要点

施設モードの主要な順序は次のとおり。

1. 選択値を `buildingPattern="medieval"` と `facilityLayout="population"` に変換する。
2. 通常どおり都市の骨格・街路・地区を生成する。
3. 人口、歴史時代、港の条件から職業施設の要求を作る。
4. 街路が完成した状態で施設を割り当て、採用した配置を固定する。
5. 施設配置後の街区ファブリックで住戸容量を計算する。
6. 人口プランの住宅適合を行い、必要なら住宅面積を拡張して再生成する。
7. 住宅容量と施設配置の結果をレポートに記録する。

通常の `medieval` は 1〜3 の施設専用工程を持たず、中世ファブリックの建物生成へ進む。両モードのもっとも大きな違いは、`medieval-facilities` が「住宅の見た目だけ」ではなく、人口需要に基づく施設配置を先に行い、その後に残存容量へ住宅を適合する点である。

## 主な実装箇所

- UI と設定変換: `src/city-editor/components/generationPanel.ts`、`src/city-editor/controllers/panelEvents.ts`
- 都市生成順・住宅面積の再試行: `src/city-editor/generators/generation/generateCity.ts`、`src/city-editor/generators/generation/heightArea.ts`
- ファブリック分岐: `src/city-editor/generators/blockInfill.ts`
- 人口施設の需要・配置: `src/city-editor/generators/populationFacilities.ts`、`src/city-editor/generators/allocateBVFacilities.ts`
- 人口住宅と容量適合: `src/city-editor/generators/populationHousing.ts`、`src/city-editor/generators/populationHousingFit.ts`
