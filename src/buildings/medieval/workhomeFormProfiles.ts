/** Lightweight, quality-invariant workhome geometry and floor ledger; no mesh imports. */
export type WorkhomeQuality = "low" | "high";
export type WorkhomeForm = "standard" | "narrow" | "wide";
export type FloorRect = [number, number, number, number];
const area = ([x0, z0, x1, z1]: FloorRect) => (x1 - x0) * (z1 - z0);

/** Non-overlapping floor cells. Stairwell, circulation and storage are explicit reservations. */
function partition(bounds: FloorRect, reservations: { use: string; rect: FloorRect }[]) {
  const xs = [...new Set([bounds[0], bounds[2], ...reservations.flatMap(r => [r.rect[0], r.rect[2]])])].sort(
    (a, b) => a - b
  );
  const zs = [...new Set([bounds[1], bounds[3], ...reservations.flatMap(r => [r.rect[1], r.rect[3]])])].sort(
    (a, b) => a - b
  );
  const cells: { use: string; rect: FloorRect }[] = [];
  for (let i = 1; i < xs.length; i++)
    for (let j = 1; j < zs.length; j++) {
      const rect: FloorRect = [xs[i - 1], zs[j - 1], xs[i], zs[j]],
        x = (rect[0] + rect[2]) / 2,
        z = (rect[1] + rect[3]) / 2;
      if (area(rect) < 1e-9) continue;
      const use =
        reservations.find(r => x > r.rect[0] && x < r.rect[2] && z > r.rect[1] && z < r.rect[3])?.use ?? "net-use";
      cells.push({ use, rect });
    }
  return cells;
}

function profile(
  form: WorkhomeForm,
  width: number,
  depth: number,
  levels: number,
  storage: number,
  circulation: number
) {
  const right = width / 2 - 0.2,
    rear = -depth / 2 + 0.2,
    front = depth / 2 - 0.2,
    stairLeft = right - 2.2,
    spine = stairLeft - 0.5,
    workLeft = -right,
    workRight = spine - 0.5,
    workEnd = form === "wide" ? 2.7 : 2.1;
  const hole: FloorRect = [stairLeft, -1.7, right, 1.7],
    inner: FloorRect = [-right, rear, right, front],
    rearStorage: FloorRect = [workLeft, rear, workRight, -workEnd];
  const frontStorage: FloorRect = [
    workLeft,
    front - (storage - area(rearStorage)) / (workRight - workLeft),
    workRight,
    front
  ];
  const floors = Array.from({ length: levels }, (_, level) => {
    const reservations =
      level === 0
        ? [
            { use: "stair", rect: hole },
            { use: "circulation", rect: [spine - 0.5, rear, spine + 0.5, front] as FloorRect },
            { use: "circulation", rect: [spine + 0.5, 1.7, right, 2.7] as FloorRect },
            { use: "storage", rect: rearStorage },
            { use: "storage", rect: frontStorage }
          ]
        : [
            { use: "stair", rect: hole },
            { use: "circulation", rect: [right - circulation, 1.7, right, 2.7] as FloorRect }
          ];
    const cells = partition(inner, reservations),
      sum = (use: string) => cells.filter(c => c.use === use).reduce((n, c) => n + area(c.rect), 0);
    return {
      level,
      elevation: level === 0 ? 0.15 : 3.35 + (level - 1) * 2.7,
      use: level === 0 ? "workshop-reservation" : "residential",
      clearFloorAreaM2: area(inner),
      deductionsM2: { stair: sum("stair"), circulation: sum("circulation"), serviceOrStorage: sum("storage") },
      netUseAreaM2: sum("net-use"),
      cells
    };
  });
  const flights = floors.slice(1).map((floor, i) => {
    const rise = floor.elevation - floors[i].elevation,
      risers = i === 0 ? 18 : 16;
    return {
      fromLevel: i,
      toLevel: i + 1,
      rise,
      risers,
      tread: 0.27,
      treadsPerFlight: risers / 2 - 1,
      turnZ: 1.7 - (risers / 2 - 1) * 0.27,
      lowerEntry: [stairLeft + 0.58, floors[i].elevation, 1.7],
      upperExit: [stairLeft + 1.7, floor.elevation, 1.7]
    };
  });
  return {
    formId: `workhome-${form}`,
    placementSpecVersion: 2,
    form,
    width,
    depth,
    wall: 0.2,
    eave: levels === 3 ? 8.75 : 6.05,
    roofRise: 1.8,
    envelope: {
      min: [-width / 2 - 0.3, 0, -depth / 2 - 0.3],
      max: [width / 2 + 0.3, levels === 3 ? 11 : 8.6, depth / 2 + 1.2]
    },
    main: { position: [spine, 0.15, depth / 2], clearWidth: 1, clearHeight: 2.1 },
    service: {
      position: [spine, 0.15, -depth / 2],
      clearWidth: 1,
      clearHeight: 2.1,
      required: false,
      fallback: "main"
    },
    spine: { centerX: spine, clearWidth: 1, fromZ: depth / 2, toZ: -depth / 2 },
    stair: { hole, flightClearWidth: 1, outerGuardWidth: 0.08, centralGap: 0.12, landingDepthMin: 1.1, flights },
    floors,
    workZoneXZ: [workLeft, -workEnd, workRight, workEnd] as FloorRect,
    upperAccess: floors.slice(1).map(_f => [
      [stairLeft + 1.7, 1.7],
      [stairLeft + 1.7, 2.2],
      [right - circulation + 0.5, 2.2]
    ]),
    capacity: {
      netResidentialAreaM2: floors.slice(1).reduce((n, f) => n + f.netUseAreaM2, 0),
      dwellings: 1,
      workshops: 1,
      laborPeople: 2.5,
      simultaneousWorkplaces: 3
    },
    operationalStatus: "skeleton-only",
    equipmentVerified: false
  };
}
export const WORKHOME_FORMS = {
  standard: profile("standard", 6, 10, 2, 8, 4),
  narrow: profile("narrow", 4.8, 8.4, 3, 4, 3),
  wide: profile("wide", 7.2, 10, 2, 12, 4)
};
export type WorkhomeProfile = (typeof WORKHOME_FORMS)[WorkhomeForm];
