# 国家財政の構造的赤字（-42%/yr）原因調査

## 状態

**根本原因の調査は完了。方針A（維持費率の適正化）は実装済み（2026-09-06）。方針Bは未着手——A実装後の
再実測を踏まえて要否を判断する段階。** 「維持費不足による停滞」（崩壊リスク・死亡率結合など§8.3/§8.4の
新規挙動）はユーザー指示によりスコープ外として実装しない。

2026-09-05、ユーザー指示により新規起票。同日、ユーザーから「運営費/補修費の分離」「施設カテゴリごとの
資金不足時の挙動」という設計方針の追加指示を受け、§8として維持費率の実世界調査・施設カテゴリの再分類
（コード確認により薬種工房についての想定を1点訂正）・死亡率結合や崩壊リスクなど未実装の新規論点を整理した。
2026-09-06、ユーザーから「維持費不足による停滞効果（§8.3/§8.4）はスコープ外、Aの実装を進めてほしい」との
指示を受け、`chemMedCommon.ts`の`debitTreasury()`を共有する19モジュール全ての「毎年renewal」debitを
§8.2の実測ベンチマークレート（土木インフラ2%・その他10%）に減額する実装を完了した。既存の挙動
（fundingCut/safe-stop等）は一切変更していない——数値（金額）だけを変更した、狭い意味でのA実装。
実装後の再実測結果は§9参照。

`docs/plan/advance-time-fast-forward.md` §5.3.3（Fast-Forward機能のPhase 0キャリブレーション作業中に発見、
5シードで-37.6〜-46.4%/yr、ウォームアップ3/10/15年いずれでも同水準——一過性ではない構造的特性と判定）を受け、
「なぜ`state.treasury`が現行デフォルトバランスで恒常的にこれほど大きく減り続けるのか」を実測データに基づいて
調査した。**結論: 原因は単一の系統的パターンに強く集中しており、既存の一過性ランダムイベントや税制側の
問題ではない（§3・§4）。**

## 関連ドキュメント

| Doc / Code | 関係 |
| :--- | :--- |
| `docs/plan/advance-time-fast-forward.md` §5.3.3 | 本調査の発端になった実測結果（Fast-Forwardプリセットのキャリブレーション） |
| `scripts/diagnoseTreasuryDecline.ts`（`npm run diagnose:treasury`、本調査で新設） | `state.treasury`の全ての増減をコールサイト単位で記録する診断ツール |
| `docs/analytics/treasury-decline-diagnosis.json` | 本調査の実測生データ |
| `docs/plan/chemistry-medicine-knowledge-accumulation.md` §4.2 | 「年予算」という設計方針が最初に明文化された元ドキュメント（§4参照） |
| `docs/plan/state-treasury-department-budget.md` | 国庫支出の部局別配分の既存実装（`treasuryAllocation.ts`）——本調査の対象ではないが同じ`state.treasury`を扱う |
| `docs/plan/economy-coupling-audit.md` | 「個別には正しいが集約すると見落とされる」結合度問題を扱う既存監査——本調査はその財政版に相当する |
| `docs/plan/burg-treasury-equilibrium.md` | `civilAdministration.ts`が参照する先行調査（§3で安全側の一例として言及） |

---

## 1. 調査手法

`scripts/diagnoseTreasuryDecline.ts`（`npm run diagnose:treasury`）を新設した。既存の
`scripts/calibrateFastAdvance.ts`と同じハーネス（`scripts/lib/advanceYearHarness.ts`）でマップ生成・
拡張有効化・ウォームアップを行った後、**全`State`の`treasury`プロパティを`Object.defineProperty`で
getter/setterに置き換え**、以後のすべての書き込みについて:

- 増減額（`delta`）
- 呼び出し元（`new Error().stack`から抽出したソースの`file:line`——多くの呼び出し元が
  `chemMedCommon.ts`の共有ヘルパー`debitTreasury()`を経由するため、そのヘルパー自身のフレームだった場合は
  さらに1段上の実際の呼び出しモジュールまで遡って記録する）

を記録する。実行後、`(before, after)`の実測差分と全ログの合計が一致することで計測漏れが無いことを検証した上
（本調査の実行では**完全一致**、`docs/analytics/treasury-decline-diagnosis.json`の`sumOfLoggedDeltas`と
`actualDelta`参照）、コールサイト別に集計した。

実行条件: seed=`treasury-diagnosis-1`、`characters,economy`拡張、ウォームアップ10年→計測3年
（Fast-Forwardキャリブレーションと同条件）。1シードのみだが、元の5シードキャリブレーション
（`docs/analytics/fast-advance-calibration.json`）が-37.6〜-46.4%/yrという狭いレンジで一致していたことから、
本調査で見つかった構造的パターンが他シードでも同様に支配的である可能性は高いと考えている（複数シードでの
再確認は§6の今後の課題）。

## 2. 実測結果: コールサイト別内訳（3年間、全State合計）

`Before=5356.07 → After=2109.33（実測差分-3246.74、ログ合計も-3246.74で完全一致）`

| コールサイト | 収入 | 支出 | 純額 | 収入イベント数 | 支出イベント数 | 分類（§3） |
| :--- | ---: | ---: | ---: | ---: | ---: | :--- |
| `dams.ts`（新設+毎年更新の2箇所） | 0 | -1,352.00 | -1,352.00 | 0 | 52 | 🔴定額・毎年全額 |
| `experimentalWorkshops.ts`（2箇所） | 0 | -656.00 | -656.00 | 0 | 41 | 🔴定額・毎年全額 |
| `apothecaryWorkshops.ts`（2箇所） | 0 | -516.00 | -516.00 | 0 | 43 | 🔴定額・毎年全額 |
| `levees.ts`（2箇所） | 0 | -380.00 | -380.00 | 0 | 38 | 🔴定額・毎年全額 |
| `hospitalInstallations.ts`（2箇所） | 0 | -120.00 | -120.00 | 0 | 6 | 🔴定額・毎年全額 |
| **🔴小計（chemMedCommon家族、5モジュール分のみ計測——§3参照）** | **0** | **-3,024.00** | **-3,024.00** | **0** | **180** | **総赤字の93.1%** |
| `fiscalEvents.ts`（複数箇所、正負混在） | +925.00 | -1,119.19 | -194.19 | 37 | 117 | 🟡ランダムイベント（ほぼ均衡） |
| `civilAdministration.ts` | 0 | -500.67 | -500.67 | 0 | 67 | 🟢収入比例（安全） |
| `stateSecretKnowledge.ts` | 0 | -267.50 | -267.50 | 0 | 42 | 🟢treasury比例（安全） |
| `revenueMix.ts` | +31.78 | -131.80 | -100.02 | 27 | 27 | ？未調査（小規模） |
| `wildernessEcology.ts` | 0 | -81.00 | -81.00 | 0 | 15 | ？未調査（小規模） |
| `treasuryAllocation.ts`（複数箇所） | +174.90 | -91.59 | +83.31 | 57 | 154 | 🟢純額はプラス |
| `portDevelopment.ts` | 0 | -30.00 | -30.00 | 0 | 3 | ？未調査（小規模） |
| `climateDisasters.ts` | 0 | -8.00 | -8.00 | 0 | 1 | 🟢災害対応（想定通り） |
| `agTechInvestment.ts` | 0 | -1.62 | -1.62 | 0 | 1 | 🟢treasury比例（安全） |
| `urbanWaterSystem.ts` | +34.11 | -34.11 | 0 | 12 | 12 | 🟢内部振替（純額0） |
| `taxes-generator.ts` | +877.00 | 0 | +877.00 | 72 | 0 | 通常の税収 |
| **🟡🟢小計（上記すべて、chemMedCommon家族を除く）** | **2,042.79** | **-2,265.53** | **-222.74** | — | — | **総赤字の6.9%** |

**中核経済（税収・行政・機密研究・財政イベント・歳入構成・財務配分・災害対応など）はそれ自体ほぼ均衡している
（3年で-222.74、年あたり-74程度）。総赤字-3246.74の93.1%は、`chemMedCommon.ts`の共有ヘルパーを使う
施設系モジュール群のうち、この時点（シミュレーション約10〜13年目）で既に解禁されていた5モジュール
（ダム・実験工房・薬種工房・堤防・病院）だけで説明できる。** 生データは
`docs/analytics/treasury-decline-diagnosis.json`。

## 3. 根本原因: 「毎年全額再徴収」される定額の施設維持費

### 3.1 パターンの実体

[`chemMedCommon.ts:144-150`](../../src/extensions/economy/generators/chemMedCommon.ts)の共有ヘルパー:

```ts
export function debitTreasury(stateId: number, amount: number): boolean {
  const state = getWorldContext().pack.states?.[stateId];
  if (!state?.i || state.removed || amount <= 0) return false;
  if ((state.treasury ?? 0) < amount) return false;
  state.treasury = rn((state.treasury ?? 0) - amount, 2);
  return true;
}
```

これ自体は単純な「引き落とし可能なら引き落とす」処理で問題は無い。問題は**呼び出し側**にある。
[`dams.ts`](../../src/extensions/economy/generators/dams.ts)を例に取ると:

```ts
// 新設時（foundNewDams、96行目）
if (!burgId || !debitTreasury(state.i, DAM_BUDGET)) continue;
// ダムを新規作成...

// 毎年の決済（settleDam、121行目）— 既存の稼働中ダム全てに対して、新設時と「同額」を再度引き落とす
if (!debitTreasury(dam.stateId, DAM_BUDGET)) {
  dam.active = false;  // 払えなければ稼働停止（"fundingCut"）
  ...
  return;
}
```

**新設コストと「毎年の維持費」が同一の`DAM_BUDGET`（26）で、減額も償却も無い。** 一度建てたダムは、
建設した年と全く同じ金額を、稼働している限り毎年払い続けなければならない——現実の公共事業なら初期投資
（資材・労賃）の後は数分の一程度の維持費で済むはずのところ、このコードでは「建設費 ＝ 恒久的な年間予算」
という設計になっている。

### 3.2 このパターンは意図的に設計された仕様である

[`chemistry-medicine-knowledge-accumulation.md` §4.2](chemistry-medicine-knowledge-accumulation.md)は
この挙動を明示的に文書化している:

> 開設は Economy generator。（…）`state.treasury`を減算する。**以後毎年、年予算が払えなければ
> `active = false`**（record は減衰、即ゼロにしない）。

そして表の列名も「年予算」——開設コストと同じ数値を、そのまま繰り返し徴収される「年予算」として明記して
いる。**したがって個々のモジュール単体で見れば、これはバグではなく設計ドキュメント通りの実装である。**

### 3.3 このパターンが他11モジュールにも同一の形で存在することを確認済み

`debitTreasury()`を呼ぶモジュールは21個ある（`grep -rln "debitTreasury(" src/extensions/economy/generators/`）。
うち11個で「新設1回debit + 毎年1回debitのrenewal」という同一の2箇所呼び出しパターンを直接確認した:

| モジュール | 予算定数（[chemMedCommon.ts](../../src/extensions/economy/generators/chemMedCommon.ts)） | 新設debit行 | 毎年renewal debit行 |
| :--- | ---: | ---: | ---: |
| `acidPlants.ts` | 24 | 73行目 | 88行目 |
| `dams.ts` | 26 | 96行目 | 121行目 |
| `hospitalInstallations.ts` | 20 | 102・135行目（2基目あり） | 156行目 |
| `levees.ts` | 10 | 88行目 | 104行目 |
| `experimentalWorkshops.ts` | 16 | 70行目 | 84行目 |
| `apothecaryWorkshops.ts` | 12 | 47行目 | 58行目 |
| `chlorinePlants.ts` | 26 | 74行目 | 89行目 |
| `steelConverters.ts` | 32 | 44行目 | 59行目 |
| `powerStations.ts` | 36 | 54行目 | 70行目 |
| `telegraphLines.ts` | 18 | 39行目 | 54行目 |
| `electrolysisPlants.ts` | 42 | 45行目 | 60行目 |

残り10モジュール（`chlorAlkaliPlants`, `coldStorageDepots`, `gasPowerStations`, `lngPlants`, `mercuryPlants`,
`oilRefineryPlants`, `phosphateFertilizerPlants`, `syntheticAmmoniaPlants`, `climateDisasters`,
`chemMedCommon`自身）はコード確認していないが、同じ`chemMedCommon.ts`の予算定数命名規約
（`XXX_PLANT_BUDGET`, `XXX_STATION_BUDGET`）を共有しており、同型と推定している（未確認、§6）。

### 3.4 なぜ「実測で§2の5モジュールしか出てこなかった」のに深刻と言えるか

本調査を実行したシミュレーション年数（約10〜13年目）では、上記21モジュールのうち**まだ5個
（ダム・実験工房・薬種工房・堤防・病院——いずれも比較的早期にunlockする技術）しか解禁されていなかった**。
それでも総赤字の93%を説明してしまっている。[`chemMedCommon.ts`](../../src/extensions/economy/generators/chemMedCommon.ts)
の予算定数コメントを見る限り、酸プラント・塩素プラント・クロルアルカリ・冷蔵倉庫・電解・実験炉・
ガス発電所・水銀・石油精製・リン酸肥料・発電所・製鋼転炉・合成アンモニア・LNG・電信線の残り16モジュールは
軒並み「era 4〜7」相当のより後期の技術（多くのBUDGET定数コメントに"calibration TBD"と明記されている——
校正が最後まで行われなかったことを示唆）で、**長期プレイでこれらが順次解禁されるたびに、同じ「定額・毎年
全額」パターンの新しい支出項目が積み上がっていく。** 個々の技術解禁時点では「小さな追加コストのはず」と
判断されていたと推測されるが（各BUDGET値は10〜42の狭いレンジ）、**21モジュール合計でどれだけの年間コミット
になるかを横断的に検証した形跡は見当たらなかった**（各vertical-slice設計ドキュメントは自分のモジュール単体
の予算感だけを記述しており、他の20モジュールとの合算を検討していない）。

## 4. 「安全」なパターンとの対比

同じ`state.treasury`を触る他のモジュールには、**treasury/収入に対する割合ベースで自己制限的**な、
より安全な先例が既に存在する:

- [`agTechInvestment.ts:136`](../../src/extensions/economy/generators/agTechInvestment.ts):
  `totalBudget = Math.max(0, state.treasury ?? 0) * STATE_BUDGET_SHARE_OF_TREASURY`
- [`stateSecretKnowledge.ts:68`](../../src/extensions/economy/generators/stateSecretKnowledge.ts):
  `budget = Math.max(0, state.treasury || 0) * STATE_SECRET_BUDGET_SHARE_OF_TREASURY`（5%）
- [`civilAdministration.ts`](../../src/extensions/economy/generators/civilAdministration.ts):
  `totalAdminUpkeep`は`taxes-generator.ts`側で`rawDomesticIncome × administrativeUpkeepShare`として
  算出される——**収入に比例**し、かつこのモジュール自体のdoc commentが「合計額は変更していない、既存の
  按分を変えただけ」と明記している既存の安定コンポーネント。

これらは**treasuryや収入が縮小すれば支出も自動的に縮小する**ため、単体では恒久的な赤字の原因になり得ない
（§2の実測でも中核経済全体の純額は年-74程度で安定していた）。対して§3のパターンは**支出額が固定**で
treasury側の縮小に反応しないため、施設数が積み上がるほど、あるいはtreasuryが小さい国ほど、相対的な負担が
際限なく重くなる。

## 5. まとめ

| 項目 | 判定 |
| :--- | :--- |
| 単一の原因に特定できるか | ✅ できる——`chemMedCommon.ts#debitTreasury()`を共有する施設系モジュール群の「新設費＝恒久年間予算」パターン |
| 個々のモジュール実装は設計通りか | ✅ 設計通り（§3.2、`chemistry-medicine-knowledge-accumulation.md` §4.2に明記） |
| 21モジュール合計の財政インパクトは検証されていたか | ❌ 形跡なし。各vertical-sliceは単体の予算感のみで設計・calibration TBDのまま |
| 中核経済（税収・行政・治安・災害対応等）に問題はあるか | ほぼ無い（年-74程度、安定） |
| 今後さらに悪化するか | 高確率でYes——残り約16モジュール（多くがera4-7）が順次解禁されるたびに同型の固定費が積み上がる |

## 6. 今後の課題・未検証事項

- 残り10モジュール（`chlorAlkaliPlants`等）のコード確認——命名規約から同型と推定しているが未読了。
- 複数シードでの本コールサイト内訳の再現性確認——Fast-Forwardキャリブレーションの5シードでは総額の水準
  （-37.6〜-46.4%/yr）は一致していたが、内訳（どのモジュールが何%を占めるか）まではこの1シードでしか
  見ていない。
- より長期（20〜30年）シミュレーションで、後期モジュール（酸・塩素・アンモニア・電解等）が解禁された後の
  内訳がどう変化するかの追加計測。
- `fiscalEvents.ts`（収支ともに大きいがほぼ均衡、純額-194/3yr）の内容確認——本調査では規模の小ささから
  優先度を下げ未着手。

## 7. 対応案（方針決定済み、実装はまだ行っていない）

| 案 | 内容 | 状態 |
| :--- | :--- | :--- |
| **A. renewal debitを適切な維持費率に減額** | 毎年の`debitTreasury`呼び出しを新設コストの一部に変更し、「建設費」と「維持費」を分離する | ✅ **実装完了（2026-09-06）。§8.2のレート（土木2%/その他10%）をそのまま採用。19モジュール＋テスト19本を更新、既存テスト回帰なし。結果は§9** |
| **B. 州単位の集約予算上限を新設** | `AgTechInvestment`/`StateSecretKnowledge`と同じ「treasury/収入に対する割合」の上限を、施設維持費全体に対して導入する | ⏸ **未着手。Aの再実測（§9）を踏まえて要否を判断する段階** |
| **C. 現状維持（意図的な難易度カーブとして追認）** | 何もしない | ❌ 却下（2026-09-05、A/Bの採用によりCは不要と判断） |

**「維持費不足による停滞」効果（§8.3の死亡率結合、§8.4の崩壊リスク・自然状態への回帰、§8.5の運営費/補修費
の作り分け）はユーザー指示によりスコープ外とした（2026-09-06）。** 実装したのはA単体——`debitTreasury`が
返す真偽値と、失敗時の既存の`fundingCut`/`active=false`挙動は一切変更していない。変えたのは「毎年払う金額」
だけであり、「払えなかった場合に何が起きるか」は変更前と完全に同じ（安全停止のみ、死亡率・崩壊リスクの新設は
無し）。

さらにユーザーから、Aの「維持費」を単純な一律減額ではなく、**施設の性質に応じた挙動の作り分け**にすべきという
設計方針が示された（2026-09-05）:

- 維持費を**運営費**（払えなければ安全に稼働停止するだけ）と**補修費**（払えなければ物理的な劣化・災害リスク
  上昇に繋がる）の2種類に分ける。
- ダム・堤防: 補修費が払えないと崩壊による災害リスクが上昇し、放置し続けると最終的に「治水など何もしていない
  自然状態」まで機能が失われる。
- 実験工房・薬種工房: 予算不足に対して比較的安全に停止できる。
- 薬種工房・病院: 予算停止が死者数の増加に繋がる（べき）。
- 薬種工房が化学薬品プラントとして経済に組み込まれているなら、その停滞は文明レベルというより生活レベルの
  低下として表れるはず。

以下§8はこの方針を実装可能な設計に落とし込むための追加調査・設計タスクであり、**コード変更は一切行っていない**。

## 8. 次のアクション（追加調査・設計タスク、未実装）

### 8.1 施設カテゴリの再分類（コード確認済み——ユーザー案の一部を補正）

21モジュールのコードを追加確認したところ、ユーザーが挙げた4施設は実は3つの異なる性質のカテゴリに分かれており、
**特に薬種工房は想定と異なる実装だった**:

| カテゴリ | 該当モジュール | 現在の産出 | 資金不足時に本来あるべき挙動 |
| :--- | :--- | :--- | :--- |
| **①物理インフラ・生産設備（産出あり）** | `dams`（洪水防御/水力）, `levees`（洪水防御）, `powerStations`/`gasPowerStations`（発電容量）, `telegraphLines`（通信範囲）, `acidPlants`/`chlorinePlants`/`chlorAlkaliPlants`/`coldStorageDepots`/`electrolysisPlants`/`lngPlants`/`mercuryPlants`/`oilRefineryPlants`/`phosphateFertilizerPlants`/`steelConverters`/`syntheticAmmoniaPlants`（市場向けGood産出——例: [`acidPlants.ts:124`](../../src/extensions/economy/generators/acidPlants.ts)が`addNamedStock(marketId, "Sulfuric Acid", …)`、[`steelConverters.ts:83`](../../src/extensions/economy/generators/steelConverters.ts)が`addNamedStock(marketId, "Steel", …)`で実際に市場在庫を増やしている） | 実在の市場Good、または発電容量/通信範囲などの「面」の効用 | 産出停止（既存動作）＋ダム・堤防のみ追加で崩壊リスク上昇・自然状態への回帰（未実装） |
| **②知識トライアル（産出なし）** | `experimentalWorkshops`, `apothecaryWorkshops` | **なし**——`addNamedStock`の呼び出しが無く、市場Goodを一切生産していない。純粋な技術進捗（`documentedRuns`蓄積によるtech stage進行）専用のトライアル | 安全に停止（**既存動作のまま。変更不要**） |
| **③医療施設** | `hospitalInstallations` | `burg.medicalCare`civic score（`consumeNamed(marketId, "Medicines", …)`で市場の"Medicines"を消費、[hospitalInstallations.ts:165](../../src/extensions/economy/generators/hospitalInstallations.ts)） | 死亡率上昇（**未実装、新規結合が必要——§8.3**） |

**ユーザー案の訂正が必要な点**: 「薬種工房が化学薬品のプラントであれば経済が停滞する」という懸念は方向性として
正しいが、**現在の`ApothecaryWorkshop`自体はプラントではない**。実際に市場へ流通する"Medicines"という
Goodは[`goods-generator.ts:2854-2869`](../../src/extensions/economy/generators/goods-generator.ts)に定義された
**通常の交易品レシピ**（`Medicinal herbs + Honey/Vinegar/Salt/Alum/Soap/Sulfur/Incense`、`requiredTechnology:
"apothecaryCompounding"`）であり、`Production.produce()`の通常サイクルで技術さえ解禁されていれば
`ApothecaryWorkshop`の資金繰りとは無関係に生産され続ける。つまり**現状ではApothecaryWorkshopの資金停止は
Medicines供給や広い経済に一切影響しない**——ユーザーが懸念した「化学薬品プラントとしての経済波及」は、
実際には①カテゴリの`acidPlants`/`steelConverters`等（実際にGoodを生産している）にこそ当てはまる。
薬種工房をあえて①的な「経済波及のある施設」に作り替えるかどうかは新規の設計判断が必要（§8.4）。

### 8.2 案A: 維持費率の根拠調査（実世界ベンチマーク）

実施済み（WebSearch、2026-09-05）。カテゴリ①の中でも「物理土木インフラ」と「工業プラント」で相場が大きく
異なることが分かった:

| 分類 | 出典・調査結果 | 本ゲームへの適用案 |
| :--- | :--- | :--- |
| **ダム・水力インフラの年間維持費** | オーストラリアの33ダム調査: 建設費の**0.14〜0.35%**/年（大規模改修を除く経常維持のみ）。水力発電プロジェクト全般ではより広く**1〜7%**/年という推計も（[ResearchGate: Dams, dam costs and damnable cost overruns](https://www.researchgate.net/publication/331068945_Dams_dam_costs_and_damnable_cost_overruns)、[FDE Hydro: Best Hydropower Project Costs](https://fdehydro.com/hydropower-project-costs/)） | **補修費**: 建設費の**約2%/年**を初期値案とする（実測レンジの下限〜中央値寄り。放置による崩壊リスクは別途§8.4で設計） |
| **堤防の年間維持費** | 業界標準として明確に公表された単一の比率は見つからなかった。個別事例では出口工の補修だけで初期建設費の15%というケースも（一度きりの補修、年額ではない）（[USACE: Summary of Costs Associated with Levee-related Activities](https://mmc.sec.usace.army.mil/NLSP_website/NLSP_LeveeCostBrochure_FINAL_NOV2023.pdf)） | 出典が薄いため、**同じ土木インフラとしてダムと同じ約2%/年を暫定的に流用**——今後より良い出典が見つかれば更新 |
| **化学プラント・工業設備の年間維持費** | 化学工学の経済性評価における標準的な経験則: 設備投資額（fixed capital investment）の**5〜15%/年**、設計段階の概算には**10%**がよく使われる。ベストプラクティスの現場では1.8〜2%、管理の悪い現場では5%超という幅もある（[Rules of Thumb for Process Equipment Maintenance Cost Estimation](https://industrialmonitordirect.com/blogs/knowledgebase/process-equipment-maintenance-cost-estimation-formulas)、[ESTIMATION OF OPERATING COSTS](https://chemicalprojects.wordpress.com/2014/05/11/estimation-of-operating-costs/)） | `acidPlants`/`chlorinePlants`/`chlorAlkaliPlants`/`electrolysisPlants`/`steelConverters`/`syntheticAmmoniaPlants`/`oilRefineryPlants`/`phosphateFertilizerPlants`/`coldStorageDepots`/`lngPlants`/`mercuryPlants`等: **建設費の約10%/年**を初期値案とする（標準的な概算値） |
| **発電所・通信インフラ** | 上記の化学プラント値を代用（電力/通信のO&Mも同様の資本設備型コスト構造であり、個別の文献調査は今回未実施） | `powerStations`/`gasPowerStations`/`telegraphLines`: 暫定的に**約10%/年**（要個別出典調査） |
| **病院の運営費** | 現実の病院コストは人件費・消耗品が支配的で、「建設費の◯%」という資本設備型の指標がそもそも成立しない（年間運営費が建設費の何倍にもなるのが普通）。本ゲームの抽象度（州の補助金1本の額）では、この比率をそのまま持ち込むのは不適切と判断——**維持費率の話とは切り離し、§8.3の死亡率結合の設計を優先すべき** | 保留（§8.3） |
| **知識トライアル系（実験工房・薬種工房）** | 該当する実世界ベンチマークなし（産出を持たない小規模研究拠点という性質上、資本設備の維持費モデルが当てはまらない） | 暫定的に化学プラントと同じ**約10%**を流用案とするが、根拠が薄いため要再検討 |

**まとめ**: 「維持費率」は施設の種類によって**2%（土木インフラ）〜10%（工業プラント・発電・通信）**という
2段階が現時点の推奨値。これを`DAM_BUDGET`等の各定数に直接掛けるのではなく、後述§8.5の「運営費/補修費」
分離モデルの中でどちらの費目に何%を割り当てるかを次に詰める必要がある。

### 8.3 病院・薬種工房と人口死亡率の結合（新規機能、未設計）

現状のコード調査結果: `burg.medicalCare`（[hospitalInstallations.ts:28-43](../../src/extensions/economy/generators/hospitalInstallations.ts)）は
**Nobility拡張の`characterHealth.ts`（named characterの健康・生存率）にしか接続されていない**。
一般人口の死亡率を計算する`src/generators/demography-simulator.ts`には`medicalCare`への参照が一切無い
——**「病院の資金停止で死者が増える」という挙動は、現状のコードベースにまだ存在しない。**

一方、`demography-simulator.ts`には類似の仕組みとして疫病死亡（`EPIDEMIC_WATER_SAFE_THRESHOLD` /
`EPIDEMIC_RATE_SCALE`、`waterSecurity`に連動）と飢饉死亡（`FOOD_SECURE_THRESHOLD` / `FAMINE_RATE_SCALE`、
`foodSecurity`に連動）が既に実装されている（[demography-simulator.ts:32-61](../../src/generators/demography-simulator.ts)）。
**この2つと同じ形——`burg.medicalCare`が閾値を下回ると死亡率が上乗せされる`healthSecurity`相当の第3の軸を
新設する**のが、既存アーキテクチャに最も自然に沿う実装方針になりそうだが、これは本調査のスコープを超える
新規設計であり、着手していない。検討が必要な論点:

- `medicalCare`（現状デフォルト50、病院ありで最大100）のどの閾値を「危険域」とするか。
- 疫病・飢饉と同様に`addLoss`経由で`naturalPts`/`faminePts`/`epidemicPts`のいずれかに合流させるか、
  新しい`healthPts`カテゴリを作るか。
- 病院が「一つも無い」状態（=`MEDICAL_CARE_DEFAULT`の50）を危険域にしてしまうと、病院システム自体が
  存在しない/経済拡張オフのマップ全てにペナルティが生じてしまう——「病院を建てて資金停止した場合にのみ
  ペナルティが乗る」設計（例: 一度でも`role: "service"`に到達した実績を記憶し、そこからの低下分だけを
  罰する）が必要かもしれない。

### 8.4 ダム・堤防の劣化・崩壊リスクメカニズム（新規機能、未設計）

現状のコード調査結果: `debitTreasury`失敗時、[`dams.ts:121-128`](../../src/extensions/economy/generators/dams.ts)は
即座に`dam.active = false`・`dam.floodProtectionRating = 0`にする——**「自然状態への回帰」は既に一発で
起きている**（ユーザー案の後半部分は既存動作と一致）。**存在しないのは「崩壊による災害リスクの上昇」という
中間状態**（現状は「満額の防御 or ゼロ」の二値で、確率的な決壊・被害イベントは無い）。設計が必要な論点:

- 補修費（§8.2）が一定期間払えなかった場合に`floodProtectionRating`を段階的に減衰させるか、即座にゼロにする
  現行動作を維持しつつ「未払い年数」に応じた決壊確率だけを別途上乗せするか。
- 決壊時の被害モデル（下流セルへの一時的な洪水ダメージ？ 経済損失？）を新規に設計するか、既存の
  `climateDisasters.ts`の枠組みに便乗させるか。
- `MAX_DAMS_PER_STATE`のような上限がある中、崩壊したダムサイトが再建可能になるまでのクールダウンの要否。

### 8.5 運営費/補修費の二本立てモデルの適用範囲（設計方針、未確定）

ユーザー提案の「運営費（安全停止）」「補修費（劣化・災害リスク）」の2分類は、**カテゴリ①（物理インフラ・
生産設備）の中でもさらに「土木インフラ（ダム・堤防）」と「工業プラント（酸/鉄鋼/発電等）」で意味が変わる**
可能性がある——工業プラントは「補修を怠ると爆発する」ような災害リスクを持たせるべきか、それとも産出停止
だけで十分か（現実の化学プラントは老朽化で事故率が上がるのは事実だが、ゲームスコープとして妥当かは要判断）。
現時点の作業仮説:

- **土木インフラ（ダム・堤防）**: 運営費＋補修費の2本立て。補修費不足 → 崩壊リスク上昇（§8.4）。
- **工業プラント（酸・鉄鋼・発電等の残り約14モジュール）**: 運営費のみ（1本）で産出停止するだけ、
  補修費/災害リスクの追加は当面見送り（対象を広げすぎるとA案の実装コストが膨らむため）。
- **知識トライアル（実験工房・薬種工房）**: 運営費のみ（現状の`debitTreasury`失敗時の安全停止のまま、
  §8.2の10%案を適用するだけで追加設計は不要）。
- **医療施設（病院）**: 運営費のみだが、停止時の帰結が「安全停止」ではなく「死亡率上昇」（§8.3）。

### 8.6 案B（集約予算上限）の優先順位付けロジック（未設計）

案Aで各施設の年額負担が2〜10%に下がれば、案Bが必要になるほど深刻な予算超過は起きにくくなる可能性がある
——**案Bの詳細設計は、案Aの新レートでのキャリブレーション実測（§8.7）を見てから着手するのが妥当**
（両方を並行で設計すると、Bの上限値をどう決めるかがAの結果次第で変わってしまう）。着手時に必要な論点だけ
先出しする:

- 上限を「treasury残高に対する割合」にするか「税収に対する割合」にするか（`AgTechInvestment`は前者、
  `civilAdministration`は後者を採用しており、どちらの精神を踏襲するかで挙動が変わる）。
- 上限超過時、どの施設から`fundingCut`にするか（新しい施設優先/古い施設優先/カテゴリ優先度）。

## 9. 検証結果（案A実装後、2026-09-06実施）

### 9.1 実装内容

`chemMedCommon.ts`に2つのレート定数を追加し、19モジュール（`acidPlants`, `apothecaryWorkshops`,
`chlorAlkaliPlants`, `chlorinePlants`, `coldStorageDepots`, `dams`, `electrolysisPlants`,
`experimentalWorkshops`, `gasPowerStations`, `hospitalInstallations`, `levees`, `lngPlants`,
`mercuryPlants`, `oilRefineryPlants`, `phosphateFertilizerPlants`, `powerStations`, `steelConverters`,
`syntheticAmmoniaPlants`, `telegraphLines`）の「毎年renewal」debit呼び出しだけを書き換えた
（新設時の初回debitは変更なし、`mercuryPlants`の汚染除去debitも別物として変更なし）:

```ts
// chemMedCommon.ts
export const CIVIL_INFRASTRUCTURE_MAINTENANCE_RATE = 0.02; // dams, levees
export const FACILITY_MAINTENANCE_RATE = 0.1;              // それ以外17モジュール
```

`experimentalWorkshops.ts`のみ、既存のpatronage（篤志家寄付）による相殺ロジックとの整合を取るため、
`need = Math.max(0, EXPERIMENTAL_BUDGET * FACILITY_MAINTENANCE_RATE - patronageGold)`という形で
レートを`need`計算の内側に適用した。既存テスト19本（各モジュール1本ずつ、founding+renewalの二重debit額を
アサートしていたもの）を新レートに合わせて更新——`mercuryPlants.test.ts`の1本は、renewal debitが軽くなった
ことで「汚染除去費用を払えない」というテストの前提条件（開始treasury）が崩れていたため、シナリオが同じ結論
（除染失敗・稼働停止）になるよう開始treasuryを調整した。全体テストスイート（444ファイル、3701件）・
`tsc --noEmit`・`biome check`・`madge`は全てクリーン。

### 9.2 実測結果

`npm run diagnose:treasury -- --warmupYears=10 --years=3`（同一seed、実装前後で比較、§2と同条件）:

| | 実装前（§2） | 実装後 |
| :--- | ---: | ---: |
| 3年間の国庫純増減 | -3246.74 | -1517.89 |
| chemMedCommon家族の寄与 | -3024.00（93.1%） | 約-1027.5（67.7%） |

`npm run calibrate:fast-advance -- --seeds=5 --warmupYears=10 --years=5`（同一5seed、§5.3.2と同条件）:

| | 実装前（§5.3.2） | 実装後 |
| :--- | ---: | ---: |
| 平均 | -42.47%/yr | **-19.01%/yr** |
| 中央値 | -43.48%/yr | **-12.88%/yr** |
| 標準偏差 | 3.57 | 12.49（seedごとの技術解禁進度のばらつきが増えたため） |
| 範囲 | -46.4 〜 -37.6 | -39.1 〜 -9.9 |

**平均で約55%、中央値で約70%、国庫の赤字ペースを縮小できた。** ただし依然として全シードで負のまま——
`stateSecretKnowledge`（treasuryの5%）のような「安全な」比例支出も、treasuryが健全化すると絶対額としては
増える（5%の母数が大きくなるため）ことが今回分かった。人口・在庫・価格の成長率は実装前後でほぼ変化なし
（想定通り、この修正は国庫のみに影響する）。生データは`docs/analytics/treasury-decline-diagnosis.json`・
`docs/analytics/fast-advance-calibration.json`（いずれも2026-09-06分に更新済み）。

### 9.3 案Bの要否判断

**中央値-12.9%/yr、平均-19.0%/yrという残存赤字は、案Aだけでは解消しきらなかったことを示している。**
案Bの着手可否は本書のスコープに含めたまま次のアクションとする（§10）——ユーザーは今回「Aの実装を進める」
とだけ指示し、B着手の可否は明示していないため、ここで判断を先取りしない。

## 10. 次のアクション

1. ✅ ~~A/B/Cのどれで進めるか確認~~ → **A→Bで決定（2026-09-05）**
2. ✅ ~~案Aの維持費率の根拠調査~~ → **完了（§8.2、2026-09-05）**
3. ✅ ~~案Aの実装~~ → **完了（2026-09-06、§9.1）。「維持費不足による停滞」効果（§8.3〜8.5）はユーザー指示に
   よりスコープ外のまま**
4. **未着手・要ユーザー判断**: §9.3の通り、Aだけでは平均-19%/yr・中央値-13%/yrの赤字が残る。案B
   （州単位の集約予算上限）に進むか、この残存赤字を許容範囲として次段階（Fast-Forwardプリセットの確定）に
   進むかをユーザーに確認する。
5. 方針が決まり次第、`docs/plan/advance-time-fast-forward.md`§5.2の「標準」プリセット国庫成長率
   （現在⚠保留）を、§9.2の再実測結果に基づいて確定させる。
