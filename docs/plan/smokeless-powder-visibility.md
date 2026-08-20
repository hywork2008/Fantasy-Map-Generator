# 無煙火薬の視界メリット（将来検討・未着手）

## 状態

**未着手**。設計メモのみ。史実考証としての指摘を記録するに留め、今回の実装スコープには含めない。

## 発端

`Gunpowder`（`src/extensions/economy/generators/goods-generator.ts`）に、`Nitric Acid` を原料とする
硝酸ベースの近代化レシピ（綿火薬系）を追加した際の指摘。史実では黒色火薬は連射時に大量の白煙を発生させ、
戦場の視界を悪化させた（自軍・敵軍双方の視認性、指揮官の戦況把握、部隊間連携に影響）。無煙火薬（今回追加した
硝酸ベースのレシピ）はこの問題を解消しており、単なる推進力の向上以上に、19世紀後半の戦術に構造的な変化を
もたらした技術だった。現状の実装では `Gunpowder` を単一の Good のまま2レシピ化しただけで、この戦術的な
違いは一切表現されていない。

## 現状のギャップ

- `Gunpowder` は州単位の抽象在庫としてのみ存在する。どの部隊がどちらのレシピ由来の火薬を装備しているかを
  追跡する仕組みが元々ない（`militaryResources.ts` の州レベル調達 work order は、消費した Good のレシピ
  出自を記録しない）。
- 軍事シミュレーション側で「視界」に相当する概念は `src/generators/regimentMovement.ts` の
  `findHostileRegiments()`（[regimentMovement.ts:646-664](../../src/generators/regimentMovement.ts#L646-L664)）
  が使う固定値 `VISUAL_DETECTION_RADIUS = 400`（[regimentMovement.ts:141](../../src/generators/regimentMovement.ts#L141)）
  のみ。部隊の装備状態に応じて動的に変化する仕組みは無い。
- `src/extensions/nobility/generators/battle-resolution.ts` の戦闘解決は戦力比ベースの単純なモデルで、
  命中率・視界・混乱度といった個別パラメータは登場しない。
- 経済層（Goods生産）と軍事層（Regiment/Battle）を結ぶ、部隊の装備水準を伝える橋渡しが現状存在しない。
  AGENTS.md の4層アーキテクチャ上、これは Generator 層内の新しい結合を意味し、今回の Goods カタログ拡張とは
  規模の異なる設計判断になる。

## 実装するとしたらの方向性（未検討・粗いメモ）

1. **州単位のフラグ化**（個々の部隊の装備追跡はしない）: 州が `industrialSulfuricAcid`／`Nitric Acid` 由来の
   `Gunpowder` 供給実績を一定水準持っているかどうかを新しいシグナルとして持たせ、その州に属する部隊の
   `VISUAL_DETECTION_RADIUS`（発見されにくさ、あるいは霧的なペナルティ免除）に反映する。経済層のGoods在庫
   モデル（レシピ出自を区別しない単一stock）を変えずに済む分、実装コストは低いが、「州全体が近代化したら
   即座に全部隊が恩恵を受ける」という粒度の粗さが残る。
2. **部隊単位の装備追跡**: `MilitaryRegiment` に装備火薬の由来を持たせ、調達時に記録する。より正確だが、
   `militaryResources.ts` の調達ロジック・セーブ互換性・既存部隊生成コードへの影響範囲が大きい。
3. 効果の表現先も未決定: `VISUAL_DETECTION_RADIUS` の動的化（発見されやすさ）か、`battle-resolution.ts` の
   継続戦闘（複数ターン交戦）時のペナルティ軽減か、あるいは両方か。

## 非目的（現時点）

- 今回のタスクでは実装しない。着手する場合は独立タスクとして、上記の方向性のどちらを取るか改めて相談してから
  進める。
- `Gunpowder` の Good 自体（レシピ2本）には手を入れない。今回追加した硝酸ベースのレシピはそのまま。

## 関連

- [chlorine-production-vertical-slice.md] — `Chlorine`/`Nitric Acid` を追加した際のコード内コメントが参照して
  いるファイル名だが、実際には作成されていない。本書とは独立した既知の記録漏れ。
