import { type MedievalModel, ModelKit } from "./modelKit";

/** Each upper floor projects toward the street (+Z); corner houses also project toward +X. */
function dwelling(id: string, storeys: number, corner = false, shop = false) {
  const k = new ModelKit(id);
  const width = 5.2;
  const depth = 6;
  const floorHeight = 2.65;
  const projection = 0.48;
  k.box("stone-foundation", [0, 0.15, 0], [width, 0.3, depth], "stone");
  for (let floor = 0; floor < storeys; floor++) {
    const base = floor * floorHeight + 0.3;
    const x = corner ? (floor * projection) / 2 : 0;
    const z = (floor * projection) / 2;
    const w = width + (corner ? floor * projection : 0);
    const d = depth + floor * projection;
    const front = z + d / 2;
    const right = x + w / 2;
    k.box("floor-deck", [x, base, z], [w, 0.2, d], "wood");
    k.box("rear-infill", [x, base + floorHeight / 2, -depth / 2 + 0.1], [w, floorHeight, 0.2], "plaster");
    for (const side of [-1, 1]) {
      k.box(
        "side-infill",
        [x + side * (w / 2 - 0.1), base + floorHeight / 2, z],
        [0.2, floorHeight, d],
        floor ? "plaster" : "stone"
      );
    }
    // Leave a real ground-floor doorway; upper windows are dark inset panels with shutters.
    if (floor === 0) {
      const doorX = 1.55;
      const doorWidth = 0.95;
      for (const [left, rightEdge] of [
        [-width / 2, doorX - doorWidth / 2],
        [doorX + doorWidth / 2, width / 2]
      ]) {
        k.box(
          "street-infill",
          [(left + rightEdge) / 2, base + floorHeight / 2, front - 0.1],
          [rightEdge - left, floorHeight, 0.2],
          "plaster"
        );
      }
      k.box("door-header", [doorX, base + 2.35, front - 0.1], [doorWidth, 0.6, 0.2], "plaster");
      k.box("door-leaf", [doorX, base + 1.02, front + 0.03], [doorWidth, 2.04, 0.08], "wood");
      for (const y of [0.8, 1.8]) k.box("door-iron-strap", [doorX, y, front + 0.08], [0.8, 0.06, 0.025], "iron");
      k.box("door-step", [doorX, 0.15, front + 0.23], [1.25, 0.3, 0.55], "stone");
      if (shop) {
        k.box("shop-opening", [-0.9, 1.55, front + 0.025], [2.1, 1.2, 0.06], "dark");
        k.box("folding-shop-counter", [-0.9, 0.96, front + 0.42], [2.3, 0.1, 0.9], "wood");
        k.box("shop-shutter-canopy", [-0.9, 2.23, front + 0.4], [2.3, 0.09, 0.85], "wood");
      } else k.window(-1.1, front + 0.13, 1.7, 0.8, 1);
    } else {
      k.box("street-infill", [x, base + floorHeight / 2, front - 0.1], [w, floorHeight, 0.2], "plaster");
      for (const wx of [x - w * 0.25, x + w * 0.25]) {
        k.window(wx, front + 0.13, base + 1.4, 0.85, 1.05);
        for (const side of [-1, 1])
          k.box("window-frame-post", [wx + side * 0.5, base + floorHeight / 2, front], [0.15, floorHeight, 0.18]);
        for (const yy of [base + 0.875, base + 1.925]) k.box("window-frame-rail", [wx, yy, front], [1.15, 0.15, 0.18]);
      }
      for (let i = 0; i <= 8; i++) {
        const bx = x - w / 2 + 0.12 + (i * (w - 0.24)) / 8;
        k.box("jetty-joist", [bx, base - 0.06, front - 0.38], [0.14, 0.24, 1.05]);
        if (i % 2 === 0)
          k.beam("jetty-bracket", [bx, base - 0.65, front - projection], [bx, base - 0.1, front - 0.08], 0.13);
      }
      if (corner) {
        for (let i = 0; i <= 6; i++) {
          const bz = -depth / 2 + 0.2 + (i * (d - 0.4)) / 6;
          k.box("side-jetty-joist", [right - 0.38, base - 0.06, bz], [1.05, 0.24, 0.14]);
          k.beam("side-jetty-bracket", [right - projection, base - 0.65, bz], [right - 0.08, base - 0.1, bz], 0.13);
        }
      }
    }
    for (const zz of [-depth / 2, front]) {
      for (const xx of [x - w / 2 + 0.1, x, right - 0.1]) {
        if (floor === 0 && zz === front && xx === x) continue;
        k.box("oak-storey-post", [xx, base + floorHeight / 2, zz], [0.18, floorHeight, 0.18]);
      }
      for (const yy of [base + 0.12, base + floorHeight]) k.box("oak-storey-rail", [x, yy, zz], [w, 0.18, 0.2]);
      if (floor > 0) {
        for (const side of [-1, 1])
          k.beam(
            "diagonal-frame-brace",
            [x + side * (w / 2 - 0.1), base + 0.12, zz],
            zz === front ? [x + side * (w * 0.25 + 0.5), base + 0.875, zz] : [x, base + floorHeight, zz],
            0.13
          );
      }
    }
    for (const xx of [x - w / 2, right]) {
      for (const yy of [base + 0.12, base + floorHeight]) k.box("side-storey-rail", [xx, yy, z], [0.18, 0.18, d]);
      const bays = [-depth / 2, -1, 1, front];
      for (const bz of bays) {
        k.box("side-frame-post", [xx, base + floorHeight / 2, bz], [0.18, floorHeight, 0.18]);
      }
      for (let bay = 0; bay < bays.length - 1; bay++)
        k.beam("side-frame-brace", [xx, base + 0.12, bays[bay]], [xx, base + floorHeight, bays[bay + 1]], 0.13);
    }
  }
  const offset = (storeys - 1) * projection;
  const roofX = corner ? offset / 2 : 0;
  k.roof(
    roofX,
    offset / 2,
    width + (corner ? offset : 0) + 0.65,
    depth + offset + 0.65,
    0.42 + storeys * floorHeight,
    2.5,
    "tile",
    true
  );
  k.chimney(-1.5, -1.4, storeys * floorHeight + 2.8);
  return k.finish();
}

export const models: MedievalModel[] = [
  {
    id: "jettied-town-house",
    name: "Jettied timber town house",
    task: 45,
    size: [7, 8, 9],
    note: "Illustrative late medieval two-storey dwelling with a streetward upper-floor jetty, exposed oak joist ends, diagonal supporting brackets, plaster infill, shutters and a steep tiled roof. Meter units; not a surveyed reconstruction.",
    create: () => dwelling("jettied-town-house", 2)
  },
  {
    id: "double-jettied-merchant-house",
    name: "Double-jettied merchant house",
    task: 45,
    size: [7, 9, 12],
    note: "Illustrative three-storey merchant dwelling: two successive streetward jetties, timber bressummers and supporting brackets, shuttered upper rooms, a ground-floor shop counter and a masonry chimney.",
    create: () => dwelling("double-jettied-merchant-house", 3, false, true)
  },
  {
    id: "corner-jettied-shop-house",
    name: "Corner-jettied shop and dwelling",
    task: 45,
    size: [8, 8, 9],
    note: "Illustrative late medieval corner shop with an upper dwelling projecting over two adjoining street elevations. Exposed joists and brackets support both jetties; oak framing, plaster panels, folding shop shutters and a tiled roof complete the exterior.",
    create: () => dwelling("corner-jettied-shop-house", 2, true, true)
  }
];
