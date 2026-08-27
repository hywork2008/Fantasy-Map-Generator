# city generator

## 1st step

/Users/h-yamaguchi/Projects/TownGeneratorTS/src
/Users/h-yamaguchi/Projects/TownGeneratorTS/docs
を参考にSVGで都市を描画する以下のプロセスを進める。

FMGの都市の規模に合わせて都市を描く領域、縦✕横の大きさを決める
ボロノイで領域を分割する
都市の位置から海岸線を決定し、陸地と海のセルを決定する。海岸線にない都市には海セルは無い。
都市の位置から河川の位置を決定し、陸地と河のセルを決定する。
陸地の中から都市セルを決定する。

これらのプロセスはスライダーでセルの描画の途中経過を確認出来るようにする。

### ref

その他参考
/Users/h-yamaguchi/Projects/Fantasy-Map-Generator/docs
/Users/h-yamaguchi/Projects/gemini-city-generator/docs

## Inspector

gemini-city-generatorではSVG要素をクリックすると、そのSVGが何を描いているのかを表示するInspector機能があり、以下のように情報を見る事ができ、デバッグ時に役に立つので設計に含めて下さい。

```json
Inspector
Click a building / lot / road / landmark

building #6 (house)
{
  "layer": "buildings",
  "kind": "building",
  "id": 6,
  "label": "building #6 (house)",
  "buildingKind": "house",
  "lotId": 16,
  "part": 0,
  "floors": 1,
  "height": 2.8,
  "roof": "slate"
}
```
