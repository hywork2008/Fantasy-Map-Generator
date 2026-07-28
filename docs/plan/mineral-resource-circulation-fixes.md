# 鉱物資源システム: 経済循環レビュー修正計画

## 状態

Fix 2・Fix 1 実装済み。Fix 3 は未着手。`docs/plan/mineral-resource-system.md` の Phase 0〜4
実装完了後にレビューを行い、検出した3件の設計ギャップを Fix 2 → Fix 1 → Fix 3 の順で修正する。
本書は進捗確認用であり、各 Fix のチェックリストを実装しながら更新する。

対象コミット: `1fb4611e`(Phase 1)〜`6c5a6739`(Phase 4)。
元レビューの詳細な根拠は本書に転記済みなので、`docs/plan/mineral-resource-system.md` 自体は
変更しない。

---

## 背景: レビューで確認した3件のギャップ

`src/extensions/economy/generators/mineralResources.ts` / `mineOperations.ts` / `minting.ts` /
`militaryResources.ts` と呼び出し順序 (`production-generator.ts`) を確認した結果、個々のモジュールは
`docs/plan/mineral-resource-system.md` の記述通りに実装されているが、「経済を循環させ続ける」という
目的に対して次の3点が未解決だった。

1. **鉱山の新規開山・技術更新が Advance Time で自動発生しない**(Fix 2、最優先)
2. **鉱区数が地図面積に依存せず固定上限40にサチる**(Fix 1)
3. **鉱床が地図・UI上でどこにも可視化されず、旧来の Good アイコンと空間的に無関係**(Fix 3)

優先順位はユーザー指示により 2 → 1 → 3 の順で着手する。

---

## Fix 2: 鉱山の自動更新を Advance Time tick に接続する

**問題**

`economy.mines.prospect`(`src/extensions/economy/generators/mineOperations.ts:54`)は道路・港・
到達性を再評価して新規鉱山を開山し、深部鉱床の排水・技術を引き上げるが、呼び出し箇所は
`src/extensions/economy/index.tsx:823` の Tools タブボタンのみ。同ファイル1230行目の
`economy.tick`(`registerSimulationSystem`)からは一度も呼ばれない。

同じ tick 内で森林は `tickForestRegrowth` により毎ティック自動再生する
(`src/extensions/economy/index.tsx:1309`)のに、鉱山側には対応する自動処理がない。

`reserveTons`(埋蔵量、寿命40〜250年)は月次生産で必ず減り続ける一方、増える経路はユーザーが
手動でボタンを押した時だけ。AI国家のみで進む長期シミュレーションでは誰も押さないため、世界の
鉱物産出は時間とともに単調減少し、最終的にゼロへ収束する。MintLedger の通貨供給
(`circulation` は毎月0.5%減衰、補充は鉱山産の Gold/Silver/Copper 在庫のみ ——
`src/extensions/economy/generators/minting.ts:63`, `:75`)にも直結し、長期的に貨幣供給が枯渇する。

**方針**

- `economy.tick` システム(`src/extensions/economy/index.tsx` 内 `_unregisterTickSystem`)から、
  低頻度(年1回程度を想定。`tickForestRegrowth` のような毎tick処理ではなく、`effectiveDeltaYears`
  蓄積カウンタで間引く)で `MineOperations.prospect()` 相当を自動実行する。
- 呼び出し頻度・トリガー条件(道路網の変化を検知するか、単純に周期実行するか)は実装時に決める。
  少なくとも「何年かけても新規開山が一度も起きない」状態を解消することが必須条件。
- Tools タブの手動ボタンは残し、自動実行の補助・即時確認用として使えるようにする(自動化と手動操作
  は排他ではない)。
- 深部鉱床の技術・排水アップグレード(`operation.technology` / `operation.drainage` の引き上げ)も
  同じ自動サイクルに乗せるか検討する。

**チェックリスト**

- [ ] `economy.tick` に低頻度の prospect 呼び出しを追加する
- [ ] 呼び出し頻度を決定し、定数化する(マジックナンバーを避ける)
- [ ] 既存の手動 `economy.mines.prospect` コマンド・UIボタンは変更せず残す
- [ ] `mineOperations.test.ts` に「Advance Time 経過だけで新規鉱山が開山する」ケースを追加する
- [ ] `minting.test.ts` または統合テストで、長期経過後も鉱山産金銀銅供給がゼロに収束しないことを確認する

**検証**

- 数百年分の Advance Time をシミュレートしても、稼働中鉱山数が単調減少一辺倒にならないこと
- 自動 prospect 実行後、既存の手動ボタンを押しても二重開山・状態不整合が起きないこと
- 既存のセーブ互換性(`.fmg` / 旧 `.map`)が壊れないこと

---

## Fix 1: 鉱区数の地図面積スケーリングを修正する

**問題**

`src/extensions/economy/generators/mineralResources.ts:163`:

```ts
const districtCount = Math.min(40, Math.max(4, Math.ceil(landCells.length / 110)));
```

設計書 `docs/plan/mineral-resource-system.md` §6.1 は「陸地面積 `A = 陸地面積km² / 100,000` に
比例した鉱区密度」を要求しているが、実装は陸セル数が **4,400 を超えた時点で密度が頭打ち** になる。
デフォルト〜大規模マップは陸セルがこれを容易に超えるため、実質的にどのマップサイズでも世界全体で
40鉱区(`DISTRICT_PROFILES` 11種をラウンドロビンで割り振るため、商品ごとに約3〜4鉱区)しか
生成されない。

旧来の Good 配置式 `resourceMaxCells = ceil(200 * cells / 5000)`(セル総数に比例して無制限に
スケール、`docs/plan/mineral-resource-system.md` §2.1)と対照的で、マップが大きく人口が増えるほど
「人口あたりの鉱物供給」が相対的に希薄になり、設計書§6.2の「人口の95%が鉄を調達できる」という
検証目標に対して、マップサイズが大きいほど不利になる。

また `MineralDistrict` は現状 `depositIds: [depositId]` で常に1鉱区=1鉱床固定になっており
(`mineralResources.ts:201-208`)、鉱区数の上限がそのまま鉱床総数の上限になっている。

**方針**

- `districtCount` の上限 `40` を撤廃するか、`landCells.length` に対して線形に伸び続ける式に
  変更する(設計書§6.1の面積比例モデルに合わせる)。
- 地質州(`GeologicalProvinceKind`)ごとの品目バランスが崩れないよう、単純に候補数を増やす場合は
  `PROFILE_PRIORITY` によるラウンドロビン配分が引き続き機能するか確認する。
- 上限を外した場合の生成コスト(パフォーマンス)を計測し、必要なら妥当な上限(ただし面積に比例した
  値)に調整する。
- 1鉱区=1鉱床の制約を残すか、`MineralDistrict` が複数 `MineralDeposit` を持てるようにするかは
  本 Fix のスコープ外(設計書§12「未決定事項」)。まずは鉱区総数のスケーリングのみ直す。

**チェックリスト**

- [x] `districtCount` の算出式を面積比例(上限撤廃)に変更する
      (`mineralResources.ts:163-166`。`Math.min(40, ...)` を撤廃し `Math.max(4, Math.ceil(landCells.length / 110))` のみに)
- [x] 大規模マップでの生成時間を計測し、許容範囲か確認する
      (計測したところ上限撤廃だけでは `pickCell` が province 内の未使用セルをフルスキャンする
      構造のため `O(landCells²)` のままで、100,000陸セルで約2.3秒かかることが判明。原因は
      グローバルな `usedCells: Set` を毎回フィルタし直す実装。`pickCell` を province ごとの
      可変プール(swap-remove で O(1) 取り出し)に書き換え、100,000陸セルで約16msまで改善した
      (`mineralResources.ts:267-280`))
- [x] `mineralResources.test.ts` に「陸セル数が増えるほど鉱区数が増え続ける」回帰テストを追加する
      (`mineralResources.test.ts` の `keeps scaling district count with land area well past
      the old 40-district cap`)
- [ ] 既存セーブの再生成(Tools > Mineral deposits)で異常な密度にならないか目視確認する
      (ブラウザでの手動確認が必要。未実施)

**検証**

- [x] 陸セル数を変えた複数マップで、鉱区総数が概ね線形に増加すること(自動テストで確認)
- [ ] 各商品(Iron/Copper/Lead-Silver等)の鉱区数が、小規模マップ以上の数量を大規模マップで維持すること
      (`PROFILE_PRIORITY` のラウンドロビンにより理論上は維持されるはずだが、専用アサーションは
      未追加)
- [x] 既存の Phase 1 検証項目(同seedでの再現性、Silverが Pb-Ag系鉱区に主として現れる等)が崩れないこと
      (既存テスト全て green)

**実装メモ**

`pickCell` の選出方式を「候補全件をハッシュでソートして先頭を取る」から「province ごとの
可変プール配列に対し、ハッシュ値をインデックスへ写像して swap-remove で1件取り出す」方式に
変更した。同じ `seed` に対する出力は決定的だが、個々の鉱床がどのセルに立つかという具体的な
選出順序は変わる(既存テストは具体的なセルIDではなく「同seedで再現するか」「type/commodityの
構造」だけを検証しているため、この変更で壊れるテストは無い)。

---

## Fix 3: 鉱床の可視化と旧来 Good アイコン配置との整合

**問題**

`MineralDeposit` / `MineOperation` を参照するレンダラー・ダイアログが存在しない
(`src/extensions/economy/renderers/` / `ui/` を検索してもヒットなし)。

一方で `src/extensions/economy/generators/goods-generator.ts:158-230` の
Iron/Copper/Tin/Lead/Silver/Gold は従来通り `minHeight`/`biome` ベースの `distribution` で
セルに配置され続け、マップ上にアイコンとして表示される。生産への寄与だけは
`isMineSuppliedGoodName` でブロックされている(`src/extensions/economy/generators/
production-utils.ts:137`)が、アイコンの位置自体は本物の `MineralDeposit` の位置と無関係のまま。

プレイヤーから見ると「鉱物アイコンが表示されている場所」と「実際に貨幣・軍需を支えている鉱山の
場所」が一致せず、かつ後者は完全に不可視。Fix 2 で自動 prospect を入れても、プレイヤーがどこに
道路・港を通せば新規鉱山が開くかを判断する手がかりがない。

**方針**

- `MineralDeposit` / `MineOperation` を描画する SVG または WebGL レイヤーを Economy 拡張が
  `api.addLayers()` で所有する形で追加する(AGENTS.md §7.4 に従う)。未発見鉱床を表示するか
  どうかは設計書§12の未決定事項なので、少なくとも「発見済み・稼働中」の鉱山は可視化する。
- 旧来の `goods-generator.ts` の Iron/Copper/Tin/Lead/Silver/Gold の `chance`/`distribution` に
  よるセル配置は、実際の `MineralDeposit` 座標を参照するように置き換えるか、鉱物系Goodについては
  Good アイコン自体を廃止して鉱山レイヤーの表示に一本化するかを検討する。
- `src/generators/markers-generator.ts` の `mines` Marker(物語用、Economy未接続)との関係も
  合わせて整理する。

**チェックリスト**

- [ ] Economy 拡張に鉱床/鉱山用の SVG (or WebGL) レイヤーを追加する
- [ ] レイヤーのトグル・凡例(legend)をToolsタブ/レイヤーパネルに追加する
- [ ] `goods-generator.ts` の鉱物系Good配置と `MineralDeposit` 座標の整合方針を決定し実装する
- [ ] `mines` Marker の説明文更新 or 統合方針を決定する
- [ ] E2E/描画テストを追加する(該当があれば `webgl-hybrid.spec.ts` 系に準拠)

**検証**

- 稼働中の鉱山がマップ上で視認できること
- 鉱物系Goodアイコンの位置と実際の鉱床位置に矛盾がなくなること(統合または位置整合のいずれか)
- 既存のレイヤー切り替え・プリセット機能に悪影響がないこと

---

## 次のセッションで最初に確認すべきこと

1. Fix 2 の自動 prospect 呼び出し頻度(年1回か、他の妥当な間隔か)をコードベースの既存パターン
   (`tickForestRegrowth` の呼び出し間隔等)を参照して決める。
2. Fix 1 で上限を完全撤廃するか、面積比例の新しい上限式にするかを、生成パフォーマンスを見てから
   決める。
3. Fix 3 は設計書§12の未決定事項(鉱床をユーザーに全公開するか等)にも関わるため、着手前にUI方針を
   確定する。
