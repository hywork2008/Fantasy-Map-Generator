# City Generator — FMG 水系コンテキスト設計

## 目的

FMG の都市立地を City Generator へ忠実に移す。特に、都市セルを通る大河、支流の合流、都市から離れた下流の海を、都市の尺度を壊さずに表現する。

この設計は次の実マップを受入れサンプルとする。

| サンプル | FMG 上の立地 | 現行の不具合 | 期待結果 |
| --- | --- | --- | --- |
| Gegrin | Gazd の河岸、港、河口幅約 11 km | `offsetRatio` により主流を drop | 河ではなく広い水域の河岸として描く |
| Drurrad | Gazd と Kezegh の合流、港 | 主流を drop、支流は合流点で未解決となり drop | 主流の水域と合流を描く |
| Taris | Koukenia と Askhapaion が Histhos に合流。海は Histhos の下流約 64.5 km | 都市窓は 1.5 km、海は descriptor に無く、河川も局所コリドーへ変形される | 都市図では合流・河岸を描き、海までの方位・距離・下流経路は地域コンテキストで示す |

「都市図に収まらない水を黙って除外する」ことは許可しない。水系が都市に関係するが都市図の尺度を超える場合は、`openWater`（河岸）へ昇格するか、明示的な `regional` 情報として残す。

## 現行契約の問題

`BurgSiteDescriptor` v1 は `throughBurgCell`、中心線、幅を持つが、City 側へ渡す際に `crossesSite || offsetRatio < 1.6` でふるい落とされる。この比率は河川の中心線までの距離なので、都市が河岸にある広い河川ほど大きくなり、まさに必要な主流を「遠い河川」と誤判定する。

さらに、幅の m 換算は FMG の `distanceScale` を反映していない。河川座標と都市座標は scale 済みの local meters なのに、幅だけが scale 前の値である。幅・中心線・河岸は同じ座標単位へ統一する。

City の `walkRiver` は各河川を独立に扱い、両端が都市窓の端または海岸で解決しなければ捨てる。これは、支流が窓内で主流へ合流する Drurrad / Taris 型と両立しない。

## 原則

1. **FMG の水系トポロジーを正とする。** imported mode では河川の分岐・合流・下流水域をランダム walk で変更しない。
2. **都市図と地域図は別の縮尺にする。** 都市図の `frame.extentMeters` は市街・河岸を描く範囲に固定し、数十 km の海をそこへ縮小配置しない。
3. **水面が都市図の大半を占めるなら river band ではなく water area とする。** 都市側の近い河岸線を海岸線と同じセル境界として扱う。
4. **除外は可視・説明可能であること。** Inspector は各水系を `riverBand`、`openWater`、`regionalOnly` のいずれにしたかと根拠を表示する。

## Descriptor v2

v1 は互換読み込みをしない。水面の単位・意味が変わるため、FMG と City Generator を同時に v2 へ上げ、古い共有 URL は「v1 の再生成が必要」と表示する。

```ts
interface BurgSiteRiverV2 {
  riverId: number;
  parentRiverId: number | null;
  downstreamRiverId: number | null;
  /** すべて local meters。FMG distanceScale を含む。 */
  centerline: { points: Point[]; widthsMeters: number[] }[];
  /** 河川の左右の実際の水際。中心線から復元しない。 */
  leftBank: Point[][];
  rightBank: Point[][];
  cityBank: "left" | "right";
  throughBurgCell: boolean;
  /** 都市窓内でこの水系が別の river に接続する場合の接続先。 */
  joins: { riverId: number; point: Point }[];
  /** 都市から下流終端までの簡略化した経路。 */
  downstream: {
    terminal: "ocean" | "lake" | "mapEdge" | "confluence";
    distanceMeters: number;
    bearingDeg: number;
    corridor: Point[];
  };
}

interface BurgSiteWaterContextV2 {
  /** 都市図そのものの正方形の一辺。従来の extentMeters。 */
  urbanExtentMeters: number;
  /** 地域コンテキストが扱える最大距離。描画用グリッドには使わない。 */
  regionalExtentMeters: number;
  rivers: BurgSiteRiverV2[];
  /** 都市が海岸セルにある場合のみ local water area として入る。 */
  localWaterbody: BurgSiteWaterbody | null;
}
```

`widthsMeters` は `Rivers.getWidth(...) * metersPerMapUnit` で作る。`centerline` と bank は同じローカル座標変換を通す。都市図に入る範囲だけでなく、両側に少数のガード点を残し、境界近くの蛇行・合流角を失わない。

## 水の分類

City 側は `BurgSiteRiverV2` を次の優先順で分類する。`throughBurgCell` は、近接判定を通過させる根拠であり、遠方 river の除外条件には使わない。

| 分類 | 条件 | 都市図での表現 |
| --- | --- | --- |
| `riverBand` | 都市窓内の実幅が都市図の短辺の 35% 未満 | 現行の on-edge river path。合流端は parent の path に接続可能 |
| `openWater` | 都市窓内の実幅が短辺の 35% 以上、または水面が市街半径へ接する | 都市側の bank を shoreline として、対岸側を water cell に分類。河川帯は描かない |
| `regionalOnly` | 都市窓へ入らず、ただし都市の下流系または港・主要河川に関係する | 都市図は変えず地域コンテキストへ距離・方位・経路を表示 |
| `irrelevant` | 都市の水系に接続せず、regional extent 外 | descriptor には diagnostics のみ残し、都市図・地域図から省略 |

35% は初期値であり、ハードコードした `offsetRatio=1.6` の代替ではない。判定は幅、都市側 bank までの距離、都市半径との交差で行い、Inspector に算出値を出す。

`openWater` は海と同じ S1 の水セル分類を使う。ただし semantic は `river` / `lake` / `ocean` として保持し、配色・岸壁・港のルールを後段で選べるようにする。水側を決めるのは `cityBank` と実 bank であり、中心線を都市へ強制移動する bank-snap ではない。

## Taris の処理

Taris は都市セル 8812 に Koukenia (423)、Askhapaion (435)、Histhos (436) が接続する。Histhos は次の水セル 8945 へ流れ、都市からの水セル中心距離は約 64.5 km である。

- 都市図（1.5 km）は海を描かない。海岸を 750 m 地点へ合成することは禁止する。
- Histhos は scale 補正後の幅で `openWater` 判定し、都市側の河岸と合流形状を描く。
- Koukenia / Askhapaion は `joins` により Histhos の水際へ終端接続する。窓端・海岸まで届かないことを理由に drop しない。
- 地域コンテキストは「海まで下流 64.5 km、南寄り」の経路を簡略線または inset で示す。これは都市図の縮尺・セル格子・城壁配置には影響しない。

## City Generator の実装段階

1. **契約と単位** — FMG の descriptor v2 を実装し、幅を scale 済み meters に統一。bank、親子、合流、下流終端を出力する。v1 の `offsetRatio` による drop を撤去する。
2. **水域分類** — `CityGeography` を `waterAreas[]` と `riverBands[]` に分ける。S1 を coast 専用から複数 water boundary 対応へ一般化し、`openWater` を sea と同じセル分類で描く。
3. **合流** — `walkRiver` の endpoint invariant を拡張し、`joins` に指定された parent river / water area への到達を有効な終端とする。imported mode のガイドは FMG polyline から外れない許容誤差を持つ。
4. **地域コンテキスト** — City Generator の Inspector に分類理由を、UI に縮尺を明記した inset を追加する。`regionalOnly` もここで可視化する。
5. **港・城壁** — `openWater` の岸を coast と同じ quay / water gate / sea wall の候補にし、semantic により名称だけを変える。

## 受入れテスト

- Gegrin: Gazd が `openWater`。都市側 bank が水際となり、水面が生成結果に存在する。
- Drurrad: Gazd が `openWater`。Kezegh は Gazd へ接続し、`generatedRivers` が空にならない。
- Taris: 3 本の river id と接続関係が渡る。海は都市図に偽の近距離海岸として現れず、地域コンテキストに約 64.5 km の下流終端として現れる。
- 500–700 m 級の river: endpoint が parent river に接続していれば描画され、接続が無い場合も Inspector が `regionalOnly` / `irrelevant` の理由を表示する。
- 同一 descriptor + seed は同じ water-area 境界、同じ river 接続、同じ地域コンテキストを生成する。

