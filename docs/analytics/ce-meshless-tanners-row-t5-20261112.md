# メッシュなしCE なめし職人の河岸 T5 記録（曲がりで途切れない列と、曲がりでの工房用水路）

実施日: 2026-11-12
計画: [メッシュなしCEのなめし職人の河岸と給水・排水](../plan/ce-meshless-tanners-row.md) §8 T5
全量: [既定（continuous）](ce-meshless-tanners-row-t5-continuous-20261112.json)、[leat](ce-meshless-tanners-row-t5-leat-20261112.json)（T4と同じ13件）
前の記録: [T4](ce-meshless-tanners-row-t4-20261112.md)

## 1. 目的

T4で、なめらかに曲がる川では工房の列が曲がりごとに途切れ、町あたり6〜13群に分かれた。次の2つを実装し、設定で選べるようにした。

1. **曲がりに沿って1列に並べる（`continuous`、既定）**
2. **曲がりで列が分かれる所に工房用水路を掘る（`leat`）**

## 2. 変更

| 箇所 | 内容 |
|---|---|
| `VectorUrbanSettings.tanneryBends` | `"continuous" \| "leat"`。無い時は `continuous`。生成・文書の検証で値を確かめる |
| `tannersRow.ts` `continuous` | 各弦の工房を上流端から詰めて並べる（以前は弦の中央に寄せ、両端に余りが残った）。次の弦は最後の工房の端から始める。内側の曲がりで前の工房と重なる時は、重ならなくなるまで次の工房だけを1 mずつ下流へずらす |
| `facilityLots.ts` 小路 | `continuous` では、前面の間隔が間口2.5軒（45 m）以内の工房を1本の小路でつなぐ（以前は30 m）。曲がりで広がった列も1本の小路で通る |
| `facilityLots.ts` 用水路の条件 | `leat` では、T3の条件に加えて、工房のある直線区間が3つ以上に分かれる区間にも用水路を掘る |
| 画面 | メッシュなし生成パネルに「川の曲がりでのなめし場」（1列に並べる／工房用水路を掘る）を加えた |
| 計測 | `tanneryT0.cli.test.ts` に「列」（背面の中点が22 m以内でつながる工房の数）を加えた。`CE_TANNERY_BENDS=leat` で方式を切り替える |

## 3. 結果

「群」は工房の中心が22 m以内でつながる数（T0から同じ定義）、「列」は背面が並ぶ数。

| ケース | 配置 | T4 群 | continuous 群/列 | leat 群/列/用水路 |
|---|---|---|---|---|
| synthetic-open-5000 | 14 | 3 | 2/1 | 3/2/0 |
| synthetic-walls-5000 | 14 | 1 | 1/1 | 1/1/0 |
| synthetic-open-20000 | 41 | 2 | 2/1 | 2/1/0 |
| gothengsfeld | 14 | 1 | 1/1 | 1/1/0 |
| gondre | 9 | 1 | 1/1 | 1/1/0 |
| myosiasos | 28 | 2 | 1/1 | 2/2/0 |
| archiagu | 5 | 1 | 1/1 | 1/1/0 |
| synthetic-walls-5000-meander | 14 | 3 | 1/1 | 3/3/0 |
| synthetic-open-5000-meander | 14 | 6 | **1/1** | 1/1/**1** |
| synthetic-open-20000-meander | 55（leat 54） | 11 | **1/1** | 2/2/**1** |
| synthetic-walls-20000-greatBend | 40 | 6 | 5/5 | 6/6/0 |
| synthetic-walls-20000-meander | 55 | 13 | **3/3** | 13/12/0 |
| synthetic-open-5000-greatBend | 14 | 1 | 1/1 | 1/1/**1** |

- どちらの方式でも、置いた工房はすべて岸（または用水路）の最前列で、背面が水、給水が上流、町の下流にある。配置数はT4と同じ（leatのsynthetic-open-20000-meanderだけ1軒少ない）。
- **continuous**: 曲がった川の町で群が大きく減った（meanderで6→1、11→1、13→3）。直線の川の町も変わらないか減った。
- **leat**: 曲がりで分かれた区間のうち、用水路を引ける所（道路・市壁・予約地を横切らず、地図に収まる所）に用水路を掘った（13件中3件）。引けない所は方式Aの列のまま残る（synthetic-walls-20000-meanderは市壁と道路で用水路を引けず、13群のまま）。
- greatBendの城壁の町（5群）は、枠で切れた15軒を除き、川の両岸と曲がりの先に分かれている。

## 4. 試験

- `tannersRow.test.ts`: S字の岸で `continuous` の列が、背面の間隔が間口から30 m未満で続き、隣の工房と重ならない。
- `facilityLots.test.ts`: なめらかなmeanderの町（synthetic-open-5000-meander）で、既定では用水路を掘らず、`leat` では掘る。
- `npx vitest run src/city-editor/generators/vector/generation src/city-editor/generators/vector/validation`: 34ファイル中33成功・1スキップ。
- `VectorGenerationPanel.test.ts`、`i18n/editorMessages.test.ts`: 成功。
