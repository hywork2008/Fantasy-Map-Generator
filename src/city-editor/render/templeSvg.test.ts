import { describe, expect, it } from "vitest";
import { renderTempleSvg } from "./templeSvg";

describe("renderTempleSvg", () => {
  it("creates a basilica-style SVG element with width, height and transform attributes", () => {
    const node = renderTempleSvg({
      point: [100, 200],
      length: 40,
      width: 22,
      rotation: Math.PI / 4,
      id: "temple-main"
    });

    expect(node.tagName.toLowerCase()).toBe("g");
    expect(node.getAttribute("data-element")).toBe("temple-main");
    expect(Number(node.getAttribute("width"))).toBe(40);
    expect(Number(node.getAttribute("height"))).toBe(22);
    expect(node.getAttribute("transform")).toBe("translate(100 -200) rotate(-45)");
    expect(node.classList.contains("ce-temple")).toBe(true);
    expect(node.classList.contains("ce-temple--basilica")).toBe(true);
  });

  it("contains canonical architectural components of a basilica cathedral with terracotta roofs and stone gray body", () => {
    const node = renderTempleSvg({
      point: [0, 0],
      length: 68,
      width: 36,
      id: "cathedral-large"
    });

    // Shadow & Base
    expect(node.querySelector(".ce-temple-shadow")).not.toBeNull();
    const base = node.querySelector(".ce-temple-base path");
    expect(base).not.toBeNull();
    expect(base?.getAttribute("fill")).toBe("#b8b5ad"); // Stone gray base

    // Buttresses along flanks
    const buttresses = node.querySelector(".ce-temple-buttresses");
    expect(buttresses).not.toBeNull();
    expect(buttresses?.querySelectorAll("rect").length).toBeGreaterThanOrEqual(6);

    // Nave (terracotta orange roof)
    const nave = node.querySelector(".ce-temple-nave");
    expect(nave).not.toBeNull();
    const naveRoof = nave?.querySelector("polygon");
    expect(naveRoof?.getAttribute("fill")).toBe("#c86a3e"); // Terracotta highlight

    // Aisles (stone gray deck/walkway)
    const aisles = node.querySelector(".ce-temple-aisles");
    expect(aisles).not.toBeNull();
    const aislePolys = aisles?.querySelectorAll("polygon");
    expect(aislePolys?.[0].getAttribute("fill")).toBe("#b2afa7"); // Stone gray aisle north

    // Transept (cross-arm terracotta roof)
    expect(node.querySelector(".ce-temple-transept")).not.toBeNull();

    // Choir & Apse with radiating chapels
    const apse = node.querySelector(".ce-temple-apse");
    expect(apse).not.toBeNull();
    expect(apse?.querySelectorAll("circle").length).toBeGreaterThanOrEqual(3);

    // Crossing tower: NO yellow circle at apex, diagonal lines intersect across the spire
    const crossing = node.querySelector(".ce-temple-crossing");
    expect(crossing).not.toBeNull();
    expect(crossing?.querySelector("circle")).toBeNull();
    const crossingDiagonals = crossing?.querySelectorAll(".ce-temple-spire-diagonal");
    expect(crossingDiagonals?.length).toBe(2);

    // West facade towers: NO yellow circles, diagonal lines intersect across spires
    const westwork = node.querySelector(".ce-temple-westwork");
    expect(westwork).not.toBeNull();
    expect(westwork?.querySelectorAll("circle").length).toBe(0);
    const westDiagonals = westwork?.querySelectorAll(".ce-temple-spire-diagonal");
    expect(westDiagonals?.length).toBe(4); // 2 towers x 2 intersecting diagonals
    expect(westwork?.querySelectorAll("rect").length).toBeGreaterThanOrEqual(4);
  });
});
