import { describe, expect, it } from "vitest";
import { addLandmark, addSettlement, addSymbol, eraseAt, moveSymbol, paintBiome, removeSymbol } from "./commands";
import { createEmptyRegionDocument } from "./document";
import type { RegionSymbol } from "./types";

describe("Region Editor Commands", () => {
  it("シンボルの追加、移動、削除が正常に行われ、Y昇順ソートが維持されること", () => {
    let doc = createEmptyRegionDocument();

    const sym1: RegionSymbol = {
      id: "s1",
      type: "mountain_peak_major",
      x: 100,
      y: 200,
      scale: 1,
      rotationDeg: 0
    };
    const sym2: RegionSymbol = {
      id: "s2",
      type: "tree_deciduous",
      x: 100,
      y: 50,
      scale: 1,
      rotationDeg: 0
    };

    doc = addSymbol(doc, sym1);
    doc = addSymbol(doc, sym2);

    expect(doc.symbols).toHaveLength(2);
    // Y座標昇順なので s2 (y:50) が先頭
    expect(doc.symbols[0].id).toBe("s2");
    expect(doc.symbols[1].id).toBe("s1");

    // 移動: s1 を y: 20 に移動すると先頭になる
    doc = moveSymbol(doc, "s1", 100, 20);
    expect(doc.symbols[0].id).toBe("s1");
    expect(doc.symbols[0].y).toBe(20);

    // 削除
    doc = removeSymbol(doc, "s2");
    expect(doc.symbols).toHaveLength(1);
    expect(doc.symbols[0].id).toBe("s1");
  });

  it("paintBiome でバイオーム領域とシンボルが追加されること", () => {
    let doc = createEmptyRegionDocument();
    doc = paintBiome(doc, [300, 300], 50, "coniferous_forest");

    expect(doc.biomes).toHaveLength(1);
    expect(doc.biomes[0].kind).toBe("coniferous_forest");
    expect(doc.symbols.length).toBeGreaterThan(0);
  });

  it("eraseAt で指定半径内のシンボルが消去されること", () => {
    let doc = createEmptyRegionDocument();
    doc = addSymbol(doc, {
      id: "target",
      type: "tree_pine",
      x: 150,
      y: 150,
      scale: 1,
      rotationDeg: 0
    });
    doc = addSymbol(doc, {
      id: "far",
      type: "tree_pine",
      x: 500,
      y: 500,
      scale: 1,
      rotationDeg: 0
    });

    expect(doc.symbols).toHaveLength(2);

    doc = eraseAt(doc, [150, 150], 30);
    expect(doc.symbols).toHaveLength(1);
    expect(doc.symbols[0].id).toBe("far");
  });

  it("集落とランドマークの追加ができること", () => {
    let doc = createEmptyRegionDocument();
    doc = addSettlement(doc, {
      id: "new-city",
      name: "Neverwinter",
      position: [200, 300],
      type: "city"
    });
    doc = addLandmark(doc, {
      id: "new-dungeon",
      name: "Cragmaw Hideout",
      position: [250, 320],
      kind: "dungeon"
    });

    expect(doc.settlements).toHaveLength(1);
    expect(doc.settlements[0].name).toBe("Neverwinter");
    expect(doc.landmarks).toHaveLength(1);
    expect(doc.landmarks[0].name).toBe("Cragmaw Hideout");
  });
});
