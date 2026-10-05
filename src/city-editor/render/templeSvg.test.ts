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

  it("automatically selects rustic chapel for small hamlet scales (length < 24m) when type is unspecified", () => {
    const node = renderTempleSvg({
      point: [10, 20],
      length: 14,
      width: 8,
      id: "hamlet-chapel"
    });

    expect(node.classList.contains("ce-temple")).toBe(true);
    expect(node.classList.contains("ce-temple--chapel")).toBe(true);
    expect(node.querySelector(".ce-temple-nave")).not.toBeNull();
    expect(node.querySelector(".ce-temple-chancel")).not.toBeNull();
    expect(node.querySelector(".ce-temple-porch")).not.toBeNull();
    expect(node.querySelector(".ce-temple-bellcote")).not.toBeNull();
    // A rustic village chapel does NOT have large basilica transept or double westwork towers
    expect(node.querySelector(".ce-temple-transept")).toBeNull();
    expect(node.querySelector(".ce-temple-westwork")).toBeNull();
  });

  it("renders a rustic village chapel with single nave, chancel, south porch, and bellcote", () => {
    const node = renderTempleSvg({
      point: [0, 0],
      length: 16,
      width: 8,
      templeType: "chapel",
      id: "chapel-explicit"
    });

    expect(node.classList.contains("ce-temple--chapel")).toBe(true);
    expect(node.querySelector(".ce-temple-shadow")).not.toBeNull();
    expect(node.querySelector(".ce-temple-base")).not.toBeNull();
    expect(node.querySelector(".ce-temple-buttresses")).not.toBeNull();
    expect(node.querySelector(".ce-temple-nave")).not.toBeNull();
    expect(node.querySelector(".ce-temple-chancel")).not.toBeNull();
    expect(node.querySelector(".ce-temple-porch")).not.toBeNull();
    expect(node.querySelector(".ce-temple-bellcote")).not.toBeNull();

    // Bellcote has 4-sided pyramid roof with diagonal spire lines
    const bellcote = node.querySelector(".ce-temple-bellcote");
    const diagonals = bellcote?.querySelectorAll(".ce-temple-spire-diagonal");
    expect(diagonals?.length).toBe(2);
  });

  it("renders a megalithic stone circle with standing stones and central altar", () => {
    const node = renderTempleSvg({
      point: [0, 0],
      length: 18,
      width: 18,
      templeType: "megalith",
      id: "megalith-sanctuary"
    });

    expect(node.classList.contains("ce-temple--megalith")).toBe(true);
    expect(node.querySelector(".ce-temple-earth")).not.toBeNull();
    expect(node.querySelector(".ce-temple-shadow")).not.toBeNull();
    const stonesGroup = node.querySelector(".ce-temple-megaliths");
    expect(stonesGroup).not.toBeNull();
    expect(stonesGroup?.querySelectorAll(".ce-megalith-stone").length).toBeGreaterThanOrEqual(7);
    expect(stonesGroup?.querySelectorAll(".ce-megalith-portal").length).toBe(2);

    // Central altar with sun/runic symbol
    const altar = node.querySelector(".ce-temple-altar");
    expect(altar).not.toBeNull();
    expect(altar?.querySelector("circle")).not.toBeNull();
  });

  it("renders a primitive timber shrine with thatched roof, animal head gable ends, and sacred hearth", () => {
    const node = renderTempleSvg({
      point: [0, 0],
      length: 16,
      width: 10,
      templeType: "shrine",
      id: "timber-shrine"
    });

    expect(node.classList.contains("ce-temple--shrine")).toBe(true);
    expect(node.querySelector(".ce-temple-shadow")).not.toBeNull();
    expect(node.querySelector(".ce-temple-base")).not.toBeNull();
    expect(node.querySelector(".ce-temple-roof")).not.toBeNull();
    const posts = node.querySelector(".ce-temple-posts");
    expect(posts).not.toBeNull();
    expect(posts?.querySelectorAll("circle").length).toBe(6);

    // Sacred hearth with glowing flame
    const hearth = node.querySelector(".ce-temple-hearth");
    expect(hearth).not.toBeNull();
    expect(hearth?.querySelectorAll("circle").length).toBeGreaterThanOrEqual(3);
  });
});
