# 宿屋の樽をStorage propsへ共通化

2026-11-01。宿屋Highの樽の蓋が長方形の板で作られ、隙間が残るという指摘に対応した。

`innComponents.ts`の専用`barrel`関数を削除し、Storage propsと同じ`createMedievalContainerModel("barrel", "closed")`へ置き換えた。共通モデルの蓋は円形に切った7枚の板で開口全体を覆う。Storage props自体は変更していない。Lowは以前から同じ共通モデルを使うため形状を維持する。

Highでも共通モデルのメートル寸法と色を使い、宿屋の既存配置（x=3、z=0.6、接地y=0）へ置く。Lowの配置はx=3、z=0.5のまま。共通樽の高さは1 mで、旧High専用樽より高くなるが宿屋全体の寸法上限内に収まる。

両品質の樽部品は依存元`container.barrel-closed@default#codex-gpt-6.1-sol`を記録する。共通モデルにHighの登録はないため、樽部品の品質表示を両方でLow扱いとした。単体表示の`Part quality`と宿屋側の`Assembly quality`を区別する。宿屋Highの登録自体は維持する。

| 対象 | 変更前の三角形 | 変更後の三角形 |
| --- | ---: | ---: |
| High付属樽 | 10,136 | 4,940 |
| Roadside High 全体 | 40,856 | 35,660 |
| Courtyard High 全体 | 57,608 | 52,412 |

共通樽の4材質が宿屋本体の材質と異なるため、High全体の描画メッシュ・材質数は10→14。樽単体のHigh経路は4メッシュ。三角形数は減るがGPU処理時間の改善を示す測定ではない。樽を含まない既存プリセットとLow全体の三角形数は変更しない。

`node --import tsx scripts/profileInnParts.mts`の出力を[今回の計測JSON](bv-inn-shared-barrel-20261101.json)へ変更し、Highの基準ハッシュを意図的な置き換え後の値へ更新した。部品化時点の[元のJSON](bv-inn-parts-p3-20261101.json)は履歴として維持する。Lowのハッシュは元の値と一致する。

検証：

- `npx vitest run src/buildings/medieval/innParts.test.ts src/buildings/medieval/smithyAndInnDetails.test.ts src/buildings/props/medievalContainers.test.ts`：3ファイル35件成功。
- 宿屋2モデル×2品質で共通の閉じた樽factoryを呼ぶことと、依存元・Low扱いの品質を検証。蓋の内側を2 cm刻みの格子でレイ検査し、板の隙間から下へ抜けないことを確認。
- Storage props側の既存の蓋全面・周縁検査、入口・厩舎・サービス棟・資源解放等の関連検証も成功。
- 変更した4ファイルのBiome checkと`git diff --check`が成功。
- 実BVで両宿屋Highの樽単体と全体の値を確認し、閉じた円形の蓋と品質表示を目視。GPU FPS・CE対話操作は今回測定していない。

後続の[Breweries実装記録](bv-brewery-parts-p3-20261101.md)で部品化と閉じた貯蔵樽の共通化を行った。加熱銅釜・仕込み桶は用途固有の設備として保持する。次はP4 Friary Highへ進む。
