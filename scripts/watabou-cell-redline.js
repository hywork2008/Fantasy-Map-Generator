(async () => {
  const container = document.getElementById("openfl-content");
  if (container) container.innerHTML = "";

  // 1. Haxe/OpenFLの内部クラスを抽出
  window.hx = {};
  Object.defineProperty(Object.prototype, "__name__", {
    get: function() { return this._hxName; },
    set: function(val) {
      this._hxName = val;
      if (typeof val === "string") window.hx[val] = this;
    },
    configurable: true
  });
  window.lime.embed("mfcg", "openfl-content", 0, 0);
  delete Object.prototype.__name__;

  // 2. 地図インスタンスの初期化完了を待機
  let TownScene, City, Sprite;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 100));
    TownScene = window.hx["com.watabou.mfcg.scenes.TownScene"];
    City = window.hx["com.watabou.mfcg.model.City"];
    Sprite = window.hx["openfl.display.Sprite"];
    if (TownScene && TownScene.map && City && City.instance) break;
  }

  const map = TownScene.map;
  const city = City.instance;

  // 3. 全エッジを描画する赤いレイヤーを生成して地図に追加
  const redLayer = new Sprite();
  const g = redLayer.get_graphics();
  g.lineStyle(2, 0xff0000, 1); // 2px 赤線 (0xFF0000)

  let edgeCount = 0;
  if (city && city.cells) {
    for (const cell of city.cells) {
      const shape = cell.shape;
      if (shape && shape.length) {
        for (let i = 0; i < shape.length; i++) {
          const p1 = shape[i];
          const p2 = shape[(i + 1) % shape.length];
          g.moveTo(p1.x, p1.y);
          g.lineTo(p2.x, p2.y);
          edgeCount++;
        }
      }
    }
  }

  map.addChild(redLayer);
  console.log(`[MFCG] Red edges drawn successfully! Total edges rendered: ${edgeCount}`);
})();
