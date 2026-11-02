# BV Shipsの品質監査と状態別部品（2026-11-03）

## 1. 範囲と結論

ユーザー指示により、門楼よりShipsを優先する。Medieval 44の残りは保留を維持する。S0で既存factory・品質・負荷・BVとCEの採用を調べ、状態別部品の契約を定めた。続くS1で**Sloop Highと展帆／畳帆、部品組立・索具保持の共通基盤を実装した。S2でCaravel／Carrack Highも完成した。次はガレオンのHighと砲門開閉へ進む。** 単一モデルの部品化だけではHigh完成と扱わない。

通常の展帆に加えて停泊用の畳帆を作る。ガレオンは帆と独立して砲門を閉じられる構成にする。旗も帆から独立させる。畳帆時にマスト・必要な索具を丸ごと消すこと、閉じた蓋から砲身が突き抜けることは禁止する。

## 2. 品質の根拠と対象

| モデル | 作者 | 現在の指定 | 対応経路 |
| --- | --- | --- | --- |
| Sloop | Codex GPT-6.1 Sol | S1で明示Low／High追加、互換default維持 | BV両品質・両帆状態。CE smallは従来Low |
| Caravel | Codex GPT-6.1 Sol | S2で明示Low／High追加、互換default維持 | BVへ追加、両帆状態対応。CE mediumは従来Low |
| Carrack | Codex GPT-6.1 Sol | S2でdefault／Low／Highを登録 | BV専用、両帆状態対応 |
| Galleon | Codex GPT-6.1 Sol | 単一default、Low扱い | BVとCE large |
| Barge | Codex GPT-6.1 Sol | 単一default、Low扱い | BVとCE barge。帆は無い |
| Galleon | Claude Opus 5.5 | 実際のlow／high分岐あり | BVの作者切替。CEは不採用 |

根拠は`src/buildings/ships/shipVariants.ts`、各factory、BVのShips区画。S0時点ではCodex製にHigh指定が無かった。S1ではSloop、S2ではCaravel／Carrackに新しい詳細factoryと明示Highを追加した。作者名やポリゴン数でHighと判定しない。

Opusは`createOpusGalleon("high")`が船体分割数・帆・手すり・甲板・索具を増やす実装であり、High表示には明示的な根拠がある。ただしSHIP_VARIANTSではそのHighを`level: "default"`として登録している。Codex Highの存在とは数えない。後の明示high追加でも既存default互換IDは維持する。

`Carrack · High-castled merchant ship`のHigh-castledは高い船首楼・船尾楼の説明で、品質指定ではない。S0時点で単一モデルの比較は`clearMesh()`で品質指定を空にし、`modelComparison.mount()`が既定Lowを使っていた。S1／S2の帆船も、現在は選択したlow／highを明示する。ラベルの一語でなく、作者・比較表・生成factoryを合わせて確認する。

S0の実BVでもCodexの4ボタンがLowのみ、OpusがLow／Highを選べることを確認した。Opusの比較表には選択中の品質しか計測しないのに「この品質のみ利用可能」と表示する不具合があったため、`viewOnly: true`を指定して「表示中の品質のみ計測」に修正した。品質判定や形状は変えていない。

## 3. S0時点の負荷計測

`node --import tsx scripts/profileShips.mts`で[計測JSON](../analytics/bv-ships-audit-20261103.json)を再生成する。今後のLow維持検証用に既存メッシュの形状・材質署名も記録した。

| モデル | 三角形 | メッシュ | 線分 | 属性・index配列 bytes |
| --- | ---: | ---: | ---: | ---: |
| Sloop | 1,642 | 49 | 19 | 15,356 |
| Caravel | 1,058 | 42 | 16 | 6,836 |
| Carrack | 4,764 | 198 | 136 | 22,952 |
| Codex Galleon | 4,798 | 200 | 126 | 26,780 |
| Barge | 5,860 | 141 | 0 | 28,736 |
| Opus Galleon Low | 17,284 | 3 | 110 | 1,869,312 |
| Opus Galleon High | 50,736 | 3 | 5,043 | 5,600,520 |

既定オプションの1隻。配列は線ジオメトリを含め共有バッファを1回数える。JSオブジェクト・一時領域・GPUメモリ・FPSは測っていない。三角形は配置ごとの合計。メッシュ数と形状署名にはLineSegmentsを含めない。

Codex Galleonは帯材896、横帆768、手すり柱504、舷側448、砲身448三角形。帆を消すだけでは200メッシュの描画回数も残る。Carrackも帯材1,344三角形・198メッシュが目立つ。Bargeは樽本体864とタガ1,728で全体の約44%。積荷を分離し、共通Storage propsの品質を選ぶ余地がある。

Opus Highは材質別結合済みで3メッシュだが、船体・設備47,180、帆・旗3,460、灯具96三角形に加え索具等5,043線分を持つ。帆と旗は同じcloth、砲門・砲身・船体は同じsolidバッチ。**材質バッチは部品境界ではない。** 名前や材質から後処理で推定せず、生成時に部品所属を記録する。

## 4. 部品と状態の契約

既存の`ModelPartFactory`・`createModelAssembly`・部品台帳を再利用する。全パーツは船首+X、水線Y=0、共通の組立原点を使う。

| 部品 | 共通部分／状態交換部分 |
| --- | --- |
| 船体・甲板・船楼 | 品質別の母体。船体寸法・舵・荷口位置を公開 |
| 甲板設備 | 巻揚機・階段・錨・係船設備 |
| マスト・桁・ブーム | 帆の取付座標を公開。ガフ昇降など可動部分は帆装側で交換 |
| 固定索具 | マストを支える索。状態間で共用可能なもの |
| 帆装（帆ごと） | 展帆布と対応する動索、または束ねた帆布と結束索を排他的に生成 |
| 砲門枠・内側の暗部 | ガレオンの固定部。開閉で取付座標を変えない |
| 砲門蓋・大砲 | 開いた蓋と張り出した砲身、または閉じた蓋と格納した砲身 |
| 旗 | 帆から独立。Opusの既存ensign指定を維持 |
| 積荷 | Barge中心。樽・箱・材木を船体から分離し共通部品を利用 |

帆の指定はS1で実装済み（省略時は展帆）。砲門指定はS3の契約案で、まだ実装していない。

```ts
interface SailingShipState {
  sails?: "set" | "furled";
}
interface GalleonState extends SailingShipState {
  gunports: "open" | "closed";
}
```

品質・作者・船種と状態を別軸にする。Low／Highで同じ状態入力を受ける。まず全帆一括の指定とし、部品IDは将来の部分展帆に対応できる帆単位で作る。停泊は畳帆のプリセットであり、砲門・旗を強制決定しない。BVではSails・Gunportsを表示し、品質・作者変更でも選択を保つ。帆の無いBargeには帆指定欄を出さない。

ガレオンは展帆／畳帆×砲門開／閉の4構成をLow／Highで確認する。引数省略は既存の展帆・砲門開とLow/default形状・採用IDを維持。状態を新しい品質段階や作者variantとして水増し登録しない。

横帆は桁に沿う厚みのある帆布束と結束を作る。ラテン帆は斜めの桁に沿わせる。Sloopは主帆をブーム上に畳み、ガフを下げ、ジブも降ろして束ねる。展帆時のシートや帆縁を空中に残さず、固定索具・必要な吊索は維持する。帆を消す・縮める・透明にするだけでは畳帆完成と扱わない。束の断面・折り目・結束を品質別に作る。

砲門閉は蝶番を基準に蓋を閉位置へ置き、砲身を内側へ格納する。船側法線に蓋を合わせ、周囲へ少し重ねて隙間を防ぐ。Opusは下段20門・上段6門・船尾2門を漏らさない。現在は上段・船尾に開いた蓋の造形が無いが、今回の閉構成の対象として明示する。特定の史実船の全門に蓋があったという主張には使わない。

両作者の現ガレオンは連続船体上の暗色面で砲門を表現し、可視の砲甲板内部を持たない。既存Lowを不用意にくり抜かない。Highで砲門開口を作る場合は機能上の開口として扱い、見える範囲の内側を作る。付属物は連続母体への重ね合わせを原則とし、小型交換部品用の専用ソケット穴を残さない。

## 5. 史料と表現範囲

英国MAIBの[TS Royalist調査報告の用語集](https://assets.publishing.service.gov.uk/media/547c6fd6ed915d4c10000049/TSRoyalistReport.pdf)には畳帆を桁へ結ぶ索の説明があり、「帆布を残し桁へ束ねる」造形の根拠とする。現代練習船の資料であり、今回の想像船の正確な歴史復元を保証する資料ではない。

[Mary Rose Museumの砲装解説](https://maryrose.org/discover/collections/the-weaponry-of-the-mary-rose/great-guns/)は、下部の重砲に閉じられる砲門蓋があり、上部では蓋を必要としなかった構成を説明する。蓋の有無は船・位置により異なる。開閉可能な部品を独立させる根拠とし、全砲門に同じ歴史的仕様を保証しない。

既存`ships.md`は火薬以前のゲーム運用を想定する一方、BVガレオンは砲を持つ想像上の近世船。開閉対応に伴って技術ツリー・造船・軍事仕様は変えない。閉砲門は無武装版と同義ではない。

## 6. CE・結合・所有への影響

CEは`shipMeshes.ts`で船種別defaultを採用し、`hull-topsides`または`hull-sides`の寸法で拡縮する。Opusはその名前の船体を持たず、現在は明示的にCodex defaultを採用している。Highでは結合後の名前に依存せず、船体境界・中心・喫水・荷口を契約として公開する。帆や斜檣を含む全体外接箱で船体寸法を決めない。

`ShipSite`と保存要素に帆・砲門の状態欄は無い。BVで部品を完成した後、保存の既定値・2D表示・港湾荷役と合わせて接続する。既存`cargoGeometry.ts`の荷口・索具回廊はLowの固定値であり、畳帆だけを根拠にクレーンが安全に通過できるとしない。港の全船を黙って畳帆へ変更しない。

組立後は材質別結合と部品台帳・頂点範囲を両立する。ただし既存`compactModel()`はメッシュのみで、LineSegmentsを引き継がない。船を直接渡すと索具を失うため、S1で`assembleSailingParts()`を追加し、線のワールド座標・部品IDを保持して複製し、元資源と最終資源をそれぞれ解放するようにした。状態変更時は旧モデルを解放し、非選択状態の形状を常駐させない。CEの共有キーは船種・採用variant・状態・寸法を含め、異なる状態を同じプロトタイプへ混ぜない。

## 7. 制作順と検証

1. **S0 調査（今回完了）**: 品質・7構成の負荷・採用経路・状態別部品を記録。
2. **S1 完了**: Sloop High、展帆／畳帆、部品台帳、共通寸法・帆装・索具の所有。Low維持とBV単体表示。
3. **S2 完了**: Caravel／Carrack High。ラテン帆・横帆を共通生成し畳帆も完成。CaravelをBVへ追加。
4. **S3 次に制作**: Codex Galleon Highと既存Opusの状態対応。両作者の4状態、Low／High、旗を確認。流用箇所は作者・派生元を維持。
5. **S4**: Barge High。船体・設備・共通積荷を分離し、混用部品の品質を明記。
6. **S5**: CEの保存・2D／3D・共有・荷役への接続。

High完成は近接表示の船体輪郭・船楼・甲板設備・建具・帆装と、その支持・接合・砲門密閉が成立すること。三角形数だけでは判定しない。既存Low署名・寸法、状態間の船体不変性、帆束と桁の接触、空中に動索が残らないこと、閉蓋からの砲身突出、資源解放、BV部品単体を関連テストで検証する。PNGの保存・参照は追加しない。

今回の既存回帰確認: `npx vitest run src/buildings/ships src/city3d/three/shipMeshes.test.ts src/city-editor/renderers/shipSites.test.ts`で8ファイル16件成功。新状態の検証ではない。全体監査は220レコード、Codex High 111、未対応109で変化なし。

比較表修正は`npx vitest run src/building-viewer/modelComparison.test.ts`の6件も成功し、計22件。実BVでCodex4船種のLow表示とOpus Low／Highを計測値と照合し、修正後の「表示中の品質のみ計測」も両品質で確認。ページ例外0、PNG保存なし。`npx biome check src/building-viewer/main.ts`と`git diff --check`も成功。

`npx tsc --noEmit --pretty false`は今回未変更の`src/controllers/charts-overview.ts:560`（TS2322）と`src/services/approachPrior.ts:259`（TS2488）で失敗した。Ships・今回の表示修正を指す型エラーは報告されていない。無関係な箇所は変更していない。


## 8. S1 Sloop High制作・検証（2026-11-03）

`SLOOP_STATIONS`をLow／Highの共通形状入力とし、Highで滑らかな丸底船体、独立甲板、窓の凹みと建具のある船室、舵金具・荷口・ウインドラス・係船／シート取付金具を作製。船体・甲板・船室・設備・固定帆柱類・固定索具・主帆・ジブの8部品とした。甲板には縦方向の継ぎ目、帆には膨らみ・縫い目・縁索を付ける。室内全体や特定の史実船の再現は対象外。

Highの主帆は展帆布と可動ガフ・ハリヤード・メインシートを同じ部品で所有する。畳帆では厚みと折り目を持つ帆布束・結束へ交換し、ガフを下げる。ジブは甲板上の束へ交換し、展帆時のシートを除去。固定索具・船体等6部品は状態間で同一。Lowにも同じ帆指定を追加し、引数省略の形状・材質署名を維持した。Lowは単独の互換組立部品としてBV表示し、8部品への分割はHighのみ。

`SailingKit`が索具を所有し、`assembleSailingParts()`が材質結合と線の保持を両立する。線にも生成時の部品IDを付与する。帆の束は共通`addSailBundle()`をLow／Highで利用。`ShipHullFrame`に船体のみの範囲・幅・水線・喫水を定め、Highのモデルメタデータへ記録した。SHIP_VARIANTSへ明示low／highを追加し、既存default IDを維持。CEはdefault採用のままで、新しいHigh・状態入力をCEの船へ自動適用しない。BVの採用表示もその範囲を明記する。

[計測JSON](../analytics/bv-sloop-high-20261103.json)は`node --import tsx scripts/profileSloopHigh.mts`で再生成できる。

| 品質 | 帆 | 三角形 | メッシュ | 線分 | 属性・index配列 bytes |
| --- | --- | ---: | ---: | ---: | ---: |
| Low | 展帆 | 1,642 | 49 | 19 | 15,356 |
| Low | 畳帆 | 2,308 | 59 | 10 | 32,816 |
| High | 展帆 | 10,570 | 5 | 2,357 | 817,608 |
| High | 畳帆 | 10,522 | 6 | 1,768 | 800,016 |

索具・縫い目は別の線描画であり、上記メッシュ数だけが描画回数ではない。畳帆は帆布束と結束を作るため、Lowでは展帆より三角形が増える。S0と同じ集計定義であり、GPUメモリ・FPS計測ではない。

`npx vitest run src/buildings/ships/sloopHigh.test.ts src/buildings/ships/sloop.test.ts src/city3d/three/shipMeshes.test.ts src/city3d/adoption.test.ts`は4ファイル15件成功。既存Low署名、状態間6部品の不変性、船体の閉鎖・窓の凹み、部品台帳／結合範囲、索具保持、両品質・両状態の資源解放、畳帆交換とガフ位置を確認した。型検査の失敗はS0で記録した未変更2箇所のみ。

実BVでもLow／High×展帆／畳帆、各状態のHigh8部品とLow互換1部品を巡回し、計測値と一致、ページ例外・コンソールエラー0。線を持たない部品の結合時に空の追加呼出しを避ける修正も行い、該当8テストを再確認した。High両状態の全体と投影を視認し、甲板継ぎ目・取付金具・帆束の収まりを確認した。検証画像は一時領域のみで、リポジトリへPNGや画像参照を追加していない。監査は220レコード、Codex High 112、未対応108へ更新。次はS2のCaravel／Carrack Highと畳帆。


## 9. S2 Caravel／Carrack High（2026-11-03）

`merchantShipHigh.ts`で丸底船体・甲板・船楼・設備・帆柱・索具・帆布を共通生成し、Caravelを8部品、Carrackを13部品で作製した。Lowのstationを共有し、Highは曲面を補間しつつ最大船幅を元の寸法内へ制限する。船楼は船体幅に沿う輪郭とし、下部を連続した船体へ重ねて隙間を防ぐ。独立した窓の凹み・建具・甲板・手すり・昇降梯子・荷口・巻揚機・係船設備を持つ。想像上の外観モデルであり、船倉や居住室全体の再現ではない。

Caravelは2枚のラテン帆、Carrackは横帆3枚と後部ラテン帆を個別部品にした。各部品が桁・帆布・対応動索を所有し、畳帆では帆布束と結束へ交換して展帆用シートを除去。固定索具は状態間で同一。Caravelの前後帆は反対側へずらし、帆布同士の干渉を防ぐ。桁とマストの間はパレルを表す接続材で支持する。Carrackの旗は独立部品で、畳帆でも維持する。

幅方向の桁に沿う帆布束で、従来の断面基底計算がゼロになる問題を共通`addSailBundle()`で修正した。Sloopの軸方向と形状は維持。Lowにも畳帆入力を追加し、展帆defaultは旧形状・材質署名を維持した。CarrackのLow畳帆は固定SVGを流用せず、実形状から平面・側面図を生成する。

BVはSloopと新規2船の表示処理を共通化し、CaravelをShips一覧へ追加。Low／High・帆・部品を選べ、帆指定は品質を変えても保持する。CarrackはBV専用と表示し、CEのCaravelは従来default Lowのまま。全モデルの状態・HighをCEへ接続するS5は未着手。

[計測JSON](../analytics/bv-merchant-ships-high-20261103.json)は`node --import tsx scripts/profileMerchantShipsHigh.mts`で再生成する。S0／S1と同じ定義で線も別計測し、GPUメモリ・FPSではない。

| 船種 | 品質 | 帆 | 三角形 | メッシュ | 線分 | 属性・index配列 bytes |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| Caravel | Low | 展帆 | 1,058 | 42 | 16 | 6,836 |
| Caravel | Low | 畳帆 | 2,108 | 52 | 10 | 32,288 |
| Caravel | High | 展帆 | 14,214 | 6 | 3,282 | 1,102,176 |
| Caravel | High | 畳帆 | 14,094 | 6 | 2,764 | 1,081,104 |
| Carrack | Low | 展帆 | 4,764 | 198 | 136 | 22,952 |
| Carrack | Low | 畳帆 | 6,297 | 218 | 124 | 62,318 |
| Carrack | High | 展帆 | 25,019 | 6 | 4,502 | 1,909,416 |
| Carrack | High | 畳帆 | 23,807 | 7 | 3,463 | 1,797,216 |

関連テストは`merchantShipHigh.test.ts`14件、`carrack.test.ts`2件、`sloopHigh.test.ts`8件、`shipMeshes.test.ts`2件、`adoption.test.ts`3件の計29件成功。Low署名・default採用、固定部品と旗の不変性、全帆の厚みを持つ束への交換、前後帆の分離、船楼支持、全21 High部品の組立・台帳・線・有限座標・寸法・資源解放を確認した。型検査は引き続き未変更の`charts-overview.ts:560`と`approachPrior.ts:259`の2件で失敗し、変更箇所を指すエラーは無い。

実BVでは3船×Low／High×展帆／畳帆と各部品を巡回。最終形状の視認とコンソールを確認し、PNGは一時領域だけで使用した。監査はCaravelのBV追加で221レコード、Codex High 114、未対応107となった。増えた1レコードは新しい独立モデルではなく、既存CE船種をBVへ表示したもの。次はS3のCodex Galleon Highと砲門開閉、既存Opusの状態対応。
