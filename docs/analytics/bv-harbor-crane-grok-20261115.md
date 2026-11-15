# BV高品質モデル：踏車式港湾クレーンの Grok 4.7（2026-11-15）

Medieval 35「Timber harbor treadwheel crane」に、作者 `Grok 4.7` の high を追加した。版idは `medieval.harbor-treadwheel-crane@high#grok-4.7`。Lowは作らない。手巻き式はCodexのまま。CEが描く high は、これまでどおり `medieval.harbor-treadwheel-crane@high#codex-gpt-6.1-sol` である。

## 形

比較用の寸法（水平半径4.35 m、滑車高4.45 m、ロープ下端1.1 m）でも、CE荷役の寸法（9 m、8 m、6.5 m）でも、落ちるロープの中心は指定した半径・高さに置く。踏車の大きさは人の寸法のままにし、ジブだけを寸法から組み直す。基礎の占有はCodexと同じく、ジブの向きを +X として x = -3.7〜2.5 m、半幅2 mに収める。

追加したのは、石積みの旋回座、踏車を収める木造の小屋、輪の内側の踏板、巻胴と逆転止め、削り出したマストと二材のジブトラス、案内滑車・頭部滑車・鍛造フックである。巻胴とそこから上がるロープは踏板の +Z 側に置き、踏板を通さない。吊荷の木箱は通常の表示には含めない。

## 計測

| 構成 | 三角形 | 統合後のメッシュ | 外接 |
| --- | ---: | ---: | --- |
| Compact study | 18,692 | 6 | 8.13 × 3.97 × 5.20 m |
| CE cargo-quay | 19,244 | 6 | 12.78 × 3.97 × 8.75 m |

部品台帳の三角形は、studyで基礎3,204、架構3,000、駆動7,992、吊り具4,496。いずれも作者は `Grok 4.7`、品質は high。Codexの生成関数は土台にしていない。接地は Y = 0。

## 検証

- `npx vitest run src/buildings/medieval/grokHarborCrane.test.ts src/buildings/medieval/harborCraneDetails.test.ts src/city3d/three/harborRendering.test.ts src/city3d/adoption.test.ts` の21件が成功。落ちるロープの位置、踏板と巻上げロープの離隔、屋根が踏車より上にあること、屋根がマストに届かないこと、外接、部品と作者、資源の分離、不正な寸法の拒否、CEの採用がCodexのままであることを確認した。
- 変更した5ファイルは `npx biome check --write` を通した。
- 実BVでこのモデルを開くと、既定はCodexの High で「Adopted」、三角形21,072。Lowも「Adopted」。Created by を Grok 4.7 にすると High だけが選べ、三角形18,692、「Not adopted; CE uses Codex GPT-6.1 Sol」、上記のクレジットが出る。CE寸法に切り替えると外接は 12.78 × 3.97 × 8.75 m。駆動部だけの表示で、内側の踏板と輪縁を確認した。ページ例外はなかった。

## 次の作業

手巻き式の Grok 4.7 は作っていない。CEへの採用替え、河川・起伏地の荷役、帆を畳んだ船の直接荷役は、これまでの港湾計画に残す。
