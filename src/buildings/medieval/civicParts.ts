import { ModelKit } from "./modelKit";

/** Open masonry loggia carrying an upper assembly room. Not a workshop shell. */
export function assemblyHall(id: string, width = 12, depth = 7) {
  const k = new ModelKit(id);
  k.box("civic-foundation", [0, 0.12, 0], [width, 0.24, depth], "stone");
  const bays = Math.round(width / 2.5),
    spacing = (width - 0.6) / bays;
  for (const z of [-depth / 2 + 0.2, depth / 2 - 0.2])
    for (let i = 0; i <= bays; i++) {
      const x = -width / 2 + 0.3 + i * spacing;
      k.cylinder("loggia-column", [x, 1.6, z], 0.18, 3.2, "stone");
      k.box("column-capital", [x, 3, z], [0.5, 0.2, 0.5], "stone");
      if (i < bays)
        k.tube(
          "loggia-arch",
          Array.from({ length: 13 }, (_, j) => {
            const a = Math.PI - (j * Math.PI) / 12;
            return [x + spacing / 2 + (Math.cos(a) * spacing) / 2, 2.5 + Math.sin(a) * 0.65, z] as const;
          }),
          0.13,
          "stone"
        );
    }
  const upper = new ModelKit(`${id}-assembly-room`);
  const entranceX = width / 2 - 1.2;
  upper.hall(0, 0, width, depth, 3.2, 2, { storeys: 1, wall: "plaster", doorOffset: entranceX });
  k.attach(upper.finish(), [0, 3.25, 0]);
  for (const z of [-depth / 2 - 0.1, depth / 2 + 0.1])
    k.box("assembly-floor-band", [0, 3.4, z], [width + 0.2, 0.25, 0.25], "wood");
  for (let i = 0; i < 11; i++) {
    const h = (i + 1) * 0.29;
    k.box("civic-stair", [entranceX, h / 2, depth / 2 + 4.6 - i * 0.4], [1.5, h, 0.4], "stone");
  }
  k.box("upper-landing", [entranceX, 3.2, depth / 2 + 0.3], [1.6, 0.18, 0.6], "stone");
  return k;
}
