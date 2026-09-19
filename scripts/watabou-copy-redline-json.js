// 全セルのエッジ座標をJSONとしてクリップボードにコピー
const edges = [];
for (const cell of window.hx["com.watabou.mfcg.model.City"].instance.cells) {
  const s = cell.shape;
  for (let i = 0; i < s.length; i++) {
    edges.push({ from: [s[i].x, s[i].y], to: [s[(i+1)%s.length].x, s[(i+1)%s.length].y] });
  }
}
copy(JSON.stringify(edges));
console.log("全エッジ座標をJSONとしてクリップボードにコピーしました！");
