# Medieval 44 — Preaching cross calvary High (2026-11-02)

`preaching-cross-calvary`をCodex GPT-6.1 SolのHighへ対応させた。既存`cemetery.preaching_cross_calvary`ファミリーにLow／Highを追加し、互換defaultとLowの形状署名は維持する。CEの墓地配置は引き続きdefaultを使う。

## 構成

Highは`stepped-base`・`shaft`・`cross-head`の3部品。木製の墓標十字架とは構造・材質が異なるため、そのモデルを引き伸ばさず、共通`ModelKit`の石造部材から生成する。特定の実在記念物の再現ではない。

- 台座：面取りした3段の石段と柱の受け石。各段は直下の段に接し、最下段はY=0へ接地する。
- 柱：先細りの八角柱、下端・頸部の輪帯、柱頭。柱は受け石へ、十字架頭部は柱頭へ少し重ねて支持する。特定の付属物用の穴を母体に開けない。
- 頭部：面取りしたラテン十字架、両面の彫り込み。表面層に開口を設け、約24.8 mm奥の溝底を見せる。内部の石造芯は連続しており、十字架全体を貫通する穴にはしない。

墓地施設のHigh対応を`CEMETERY_HIGH_DETAILS`へまとめ、品質登録・BVの部品factory・説明・依存元が同じ一覧を参照するようにした。納骨堂・納骨棚のLow／Highは既存計測JSONと照合して4形状とも不変。未対応の他18種はdefaultのみのLow扱いを維持する。納骨堂の計測スクリプトは今後High対象が増えても、同じ2モデルだけを再計測するよう対象を明示した。

BVでは全体と3部品を選べる。任意の柱・頭部交換や寸法調整のUIは今回追加しない。

## 計測

| 品質 | 三角形 | メッシュ | CPU属性バッファ bytes |
| --- | ---: | ---: | ---: |
| Low | 36 | 3 | 840 |
| High | 740 | 3 | 53,280 |

| High部品 | 三角形 |
| --- | ---: |
| 段状台座・受け石 | 248 |
| 八角柱・輪帯・柱頭 | 140 |
| 面取り頭部・両面の彫り込み | 352 |

Highの幅×奥行×高さは約2.624×2.624×4.938 m。三角形数を品質判定に使わず、独立したHigh構造・面取り・彫り込みの実装を根拠に登録する。CPU値は重複しない属性・index ArrayBufferの合計で、JSオブジェクト・一時領域・GPUメモリ・FPSを含まない。

再計測は`node --import tsx scripts/profilePreachingCrossHigh.mts`。[計測JSON](bv-preaching-cross-high-20261102.json)に署名・寸法・台帳・部品別値を保存する。監査は220記録中Highあり106、未対応114。これは配置・状態違いも含む記録数であり、固有資産数ではない。

## 検証と次の対象

- `preachingCrossHigh.test.ts`：4件成功。Low/default署名、接地・石段間の接触・柱と頭部の支持、両面の実際の彫り込み深さと連続した芯、寸法・有限座標・3部品範囲・独立生成・資源所有と解放を検証。
- `ossuaryHigh.test.ts`：6件成功。High対象の追加に追従できるよう既存2モデルの検査対象を明示し、共通登録変更後の回帰を検証。
- `src/city3d/adoption.test.ts`：3件成功。合計13件成功。
- 既存納骨堂・納骨棚のLow／High 4形状を保存済み署名と照合して一致。
- `npx tsc --noEmit --pretty false`、変更した生成コード・テストのBiome check、`git diff --check`が成功。
- 実BVでHigh全体、3部品、Low切替、High復帰を確認。固定計測値と一致し、ページエラー0件。全体と頭部の彫り込みを目視確認。画像は一時領域だけに置き、リポジトリへの保存・PNG参照は追加しない。CE対話操作とGPU FPSは今回測定していない。

次は同じMedieval 44のMausoleum dome。既存のドーム・石造開口・基壇を確認し、再利用できる部品からHigh化する。
