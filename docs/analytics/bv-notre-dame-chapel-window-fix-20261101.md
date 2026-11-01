# Notre-Dame放射状礼拝堂の窓位置修正

2026-11-01

追記：この修正後、[周歩廊をHigh化](bv-notre-dame-ambulatory-high-20261101.md)した。以下の565,859三角形とHigh全体の署名は周歩廊High化前の比較基準であり、礼拝堂の窓修正は維持している。

## 原因と修正

G01 Notre-Dame de Parisの`Radiating Chapels · High`は、五角形の壁を生成しながら、窓を半径20.3・礼拝堂の角度±0.17 radで置いていた。この位置と向きが実際の前方2面に一致せず、窓が壁面からずれていた。P5の分割前からの形状を維持した際に残った不具合である。

7棟それぞれの前方2辺から中央点と外向き法線を求め、その面へ窓14枚を配置し直した。窓の幅・高さ・装飾は維持し、位置と向きだけを修正した。壁の外面との微小な離隔は0.01 mとし、キット既定の窓枠・ガラスの奥行を維持する。

同名部品を持つCologneも調べた。こちらは十二角柱の面角度と内接半径に合わせる既存方式だったため、生成コードの変更は不要。両モデルに壁面への位置・向き・窓枠の収まりの回帰検証を追加した。共通キットとギルドホールには変更なし。

## 検証

- `npx vitest run src/buildings/landmarks/notreDame/chapelWindows.test.ts`：2件成功。Notre-Dameの14枚とCologneの21枚について、窓中央と窓枠両端から壁へレイを飛ばし、面との距離、法線の一致、枠全体の背後に壁があることを確認。
- `npx vitest run src/buildings/landmarks/notreDameParts.test.ts src/buildings/landmarks/notreDame/highDetail.test.ts`：5件成功。計7件。鐘楼の実開口や扉・彫刻等の既存検証も成功。
- Low全体の署名は変更なし。礼拝堂群を除くHighの10部品の署名も`6f851eb39f1ea55e6dfab346e16127b2fcb9d8a27d2097c77720570c4499a9ff`で修正前後一致。
- High全体は565,859三角形・10メッシュ、礼拝堂群は50,099三角形・6メッシュのまま。修正後High全体の署名は`56707a24263ee72ca871bf2c4f3abd29d530e5371e52063c0b0fea136a20b6b0`。
- 実BVで礼拝堂群の内側・外側から3D表示を確認し、Low／High切替と全体復帰も確認。ページエラーなし。
- 変更した生成コードと関連テストのBiome check、`git diff --check`成功。

[修正後の外側視点](bv-notre-dame-chapel-window-fixed-outer-20261101.png)・[通常視点](bv-notre-dame-chapel-window-fixed-20261101.png)。

窓の修正直後の値は[修正後JSON](bv-notre-dame-chapel-window-fix-20261101.json)に保存した。`node --import tsx scripts/profileNotreDameParts.mts`は周歩廊High化後の現行値を別のJSONへ出力する。[P5初回記録](bv-notre-dame-parts-p5-20261101.md)とそのJSONも修正前の比較基準として残す。

次は周歩廊の既存外殻の重なりと接続を見直し、実際のHigh部品の作製を続ける。
