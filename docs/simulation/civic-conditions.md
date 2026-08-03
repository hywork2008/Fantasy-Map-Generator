# 治安・衛生

地域・都市・商人倉庫に保持する、将来の社会シミュレーション用の基礎指標を定義する。

## 現在の実装範囲

新規生成時にはすべて `50`（中立）で初期化する。範囲は `0`（最悪）から `100`（最良）である。

| 対象 | 治安 | 衛生 |
| :-- | :-- | :-- |
| State（国家・地域） | `state.security` | `state.sanitation` |
| Province（州・地方） | `province.security` | `province.sanitation` |
| Burg（都市・集落） | `burg.security` | `burg.sanitation` |
| Market 所有の輸出倉庫 | `market.warehouseSecurity` | `market.warehouseSanitation` |

過去のセーブデータではこれらの値が未定義の場合がある。効果を読む将来の実装は、未定義を `50` として扱う。

### 衛生の自動更新（Economy 有効時）

Economy 拡張が有効なとき、都市水利・衛生モデル（[urban-water-and-sanitation-system.md](../plan/urban-water-and-sanitation-system.md) Phase 1）が次を行う。

- Burg ごとに `UrbanWaterSystem`（排水 tier、需要と容量、洪水・ぬかるみ・悪臭、汚染、詰まり、制度、有機廃棄物経路、上下流汚染）を持つ。
- 年次更新で需要シグナルに応じた公共事業（側溝・石張り排水・被覆暗渠）と維持費を `burg.treasury` から支払い、`burg.sanitation` を再計算する。
- 建設予算と維持予算は分離し、維持不足は `maintenanceCondition` 低下と `clogging` 増加で容量を削る。
- 清掃税（burg 独自）が維持を支え、接続許可・放流規制が tier だけでは得られない飲水保護を決める。
- 同一河川の上流放流は下流の `upstreamPollutionImport` / 灌漑・飲水へ外部費用を与える。
- `healthPressure` は衛生由来の健康負債（将来の疫病接続用）。civic スコアに既に反映する。
- Province / State の `sanitation` は、所属 Burg の平均でロールアップする。

治安（`security`）と倉庫衛生は、この段階ではまだ自動変動しない。

## 将来の仕様（未実装）

- 急激な人口増加と都市人口に見合わない官憲・警備人数は、都市治安を悪化させる。
- 低衛生は疫病リスクを高め、疫病は人口へ影響する（衛生スカラーへの接続は Phase 1 で準備済み）。
- 治安の悪い都市と小規模な都市は商人の保管先としての魅力を下げる。特に高額商品は低治安の倉庫へ保管されにくい。
- 穀物を保管する輸出倉庫ではネズミ被害が発生しうる。被害は在庫損失として扱う予定である。
- `Cats` は `unit: "head"` の生きた交易品である。将来、倉庫へ配備した頭数がネズミ被害を抑制する。配備・消費・ネズミ被害の計算はまだ実装しない。
- 疫病イベント本体と人口死亡への直結、技術グラフ解禁（Phase 4）は未実装。

治安と倉庫衛生は、この段階では経済・人口・交易の計算結果をまだ変えない。
