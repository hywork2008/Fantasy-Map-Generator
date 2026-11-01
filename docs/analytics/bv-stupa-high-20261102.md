# Medieval 44 — Stupa chorten High (2026-11-02)

`stupa-chorten`をCodex GPT-6.1 SolのHighへ対応させた。既存`cemetery.stupa_chorten`ファミリーにLow／Highを追加し、互換defaultとLowの形状署名を維持する。CEの墓地配置は引き続きdefaultを使う。

## 形態の範囲と参考資料

今回はチベット風のチョルテンの模式的外観とする。Kunzang Palyul Cholingの[Stupas解説](https://www.tara.org/stupas/)にある基壇・四段のテラス・bumpa・harmika・13輪の相輪・傘蓋・日月の頂部を部位構成の参考にした。寸法・曲線・接合部はBV向けの設計値で、特定の様式規範や実在遺構の完全な再現ではない。

[Metropolitan Museumの15世紀チベット製ストゥーパ](https://www.metmuseum.org/art/collection/search/697341)と[Rubin Museumの解説](https://rubinmuseum.org/highlights/stupa/)は、地域・時代と形態の多様性の確認に用いた。小型金属作品の実寸を建築寸法として扱わない。完成モデルや参考資料の画像はリポジトリへ保存しない。

## 部品と共通化

Highは`throne`・`terraces`・`bumpa`・`harmika`・`spire`・`crown`の6部品。

- 基壇は地面に接する3段の石段、白い本体と上下の繰形。既存の面取り石材生成へ表面色を指定できる引数を追加し、既定の石色と旧形状は維持する。
- 胴の下には4段のテラスを置き、最上部に控えめな赤褐色の帯を加える。
- bumpaは閉じた壺形の回転面と足元の繰形。室内へ通じる扉や窓は追加しない。
- harmikaは四角い足・本体・笠石を持ち、胴の上端と相輪の下端を重ねて支持する。接続用の専用穴を母体に開けない。
- 相輪は連続した芯と、上ほど小さくなる13輪。各輪を宙に浮かせず、芯と交差させる。
- 頂部は傘蓋・三日月・日輪・滴形の宝珠と連続した軸。月の内側は実際に開口し、日輪・宝珠・傘蓋も軸へ接続する。

BVで全体と6部品を独立表示できる。任意の宗教記号交換・寸法調整UIは今回追加しない。共通の墓地High登録へ1項目を追加し、他16種の未対応備品はdefaultのみのLow扱いを維持する。

## 計測

| 品質 | 三角形 | メッシュ | CPU属性バッファ bytes |
| --- | ---: | ---: | ---: |
| Low | 268 | 5 | 9,176 |
| High | 6,832 | 4 | 491,904 |

| High部品 | 三角形 |
| --- | ---: |
| 基壇 | 264 |
| 四段テラス | 224 |
| 壺形の胴 | 1,632 |
| 四角い上部 | 132 |
| 13輪の相輪 | 2,688 |
| 傘蓋・日月・宝珠 | 1,892 |

Highの幅×奥行×高さは約6.024×6.024×7.45 m。CPU値は重複しない属性・index ArrayBufferの合計で、JSオブジェクト・一時領域・GPUメモリ・FPSを含まない。材質結合で描画メッシュを抑える一方、非index化で属性配列は増える。

再計測は`node --import tsx scripts/profileStupaHigh.mts`。[計測JSON](bv-stupa-high-20261102.json)に署名・寸法・台帳・部品別値を保存する。監査は220記録中Highあり108、未対応112。配置・状態違いも含む記録数であり、固有資産数ではない。

## 検証と次の対象

- `stupaHigh.test.ts`：5件成功。Low/default署名、接地と部品間の支持、閉じた胴、13輪の先細りと芯への接続、月の開口と頂部の支持、寸法・有限座標・6部品範囲・独立生成・資源所有と解放を検証。
- `preachingCrossHigh.test.ts`：4件成功。共通石材への色指定追加後も既存の石造接触・彫り込み等を維持。
- `src/city3d/adoption.test.ts`：3件成功。合計12件成功。
- 既存の円形廟・説教十字架・納骨堂・納骨棚のLow／High 8形状を保存済み署名と照合して一致。
- `npx tsc --noEmit --pretty false`、変更した生成コード・テストのBiome check、`git diff --check`が成功。
- 実BVでHigh全体、6部品、Low切替、High復帰を確認。固定計測値と一致し、ページエラー0件。全体と頂部を目視確認。画像は一時領域だけに置き、リポジトリへの保存・PNG参照は追加しない。CE対話操作とGPU FPSは今回測定していない。

次は同じMedieval 44のCremation pyre platform。既存の石造基壇と木材部品を確認し、台と薪の支持を含めてHigh化する。
