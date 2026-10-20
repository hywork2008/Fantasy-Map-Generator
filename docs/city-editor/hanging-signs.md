# 吊り看板テンプレート

CEでの店舗属性追加に先立つ、再利用可能な3D部品。BVの **Hanging shop signs** で確認できる。各項目を選択後、Shape / Material / Symbolを個別に切り替えられる。

| 要素 | 選択肢 |
| --- | --- |
| 形状 | 長方形・円形・楕円形・盾形・アーチ形 |
| 素材 | 木板（木目の継ぎ目）・鉄・緑青を帯びた銅 |
| 図柄 | 無地・宿屋（ベッド）・鍛冶屋（金床）・酒場（ジョッキ）・パン屋（パン）・薬屋（フラスコ）・馬屋（蹄鉄） |
| 吊り構造 | 壁面金具・補強付き腕木・2本の鎖・吊り帯・金属の縁取り |

図柄は両面に配置する。裏面では左右を反転して、裏側から見ても正しい向きにする。文字・フォント・画像・通信には依存しない。素材の色・粗さ・金属度と、厚みのある幾何形状で表現する。特定の史実建築の復元ではなく、ファンタジー向けの創作テンプレート。

## 利用方法

```ts
import { createHangingSignModel, HANGING_SIGN_TEMPLATES } from "../../buildings/signs/hangingSign";

const preset = HANGING_SIGN_TEMPLATES.find(template => template.id === "inn")!;
const sign = createHangingSignModel(preset);
sign.group.position.set(wallX, eavesHeight, wallZ);
sign.group.rotation.y = facadeAngle;
scene.add(sign.group);

// On removal:
scene.remove(sign.group);
sign.dispose();
```

- 座標はメートル、Yが上。原点が壁の取付位置、+Xが壁から外に突き出す方向。看板の表裏は±Z方向。
- 本体は原点より下に垂れるため、軒の高さに配置する。全高は約1.35m、突出量は約1.52m。歩行者との高さの余裕と、軒や隣棟への干渉は配置側で確保する。
- `createHangingSignModel`はCE向けのモデルのみを生成する。`createHangingSign`はBV向けに同じモデルから正面図と平面図のSVGも生成する。
- `shape`・`material`・`symbol`を独立して指定できる。省略時は長方形・木製・無地。新しい絵柄は`SignSymbol`と図柄生成部分に追加できる。
- 資源はモデルが所有する。撤去時に`dispose()`を呼ぶ。多数の建物への配置時は、CE側でインスタンス化または材質ごとの結合を行う。
- 現段階ではCEの建物属性、保存形式、自動配置には接続していない。店舗属性の導入時に、その属性からプリセットを選び、道路側の壁へ配置する。
