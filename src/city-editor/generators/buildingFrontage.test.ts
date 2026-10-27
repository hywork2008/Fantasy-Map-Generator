import { expect, it } from "vitest";
import { type BuildingFrontageCandidate, createBuildingFrontageResolver } from "./buildingFrontage";
import type { BuildingLot } from "./buildingLots.types";

const lot: BuildingLot = {
  faceId: "block",
  parcelId: "parcel",
  landmark: false,
  polygon: [
    [-2.5, -4],
    [2.5, -4],
    [2.5, 4],
    [-2.5, 4]
  ]
};
const candidates: BuildingFrontageCandidate[] = [
  { kind: "gable", flip: false, door: [0, 4], normal: [0, 1] },
  { kind: "gable", flip: true, door: [0, -4], normal: [0, -1] }
];
const routes = [
  {
    centerline: [
      [-20, 7],
      [20, 7]
    ] as [number, number][],
    widthMeters: 2
  },
  {
    centerline: [
      [-20, -9],
      [20, -9]
    ] as [number, number][],
    widthMeters: 2
  }
];

it("chooses a reachable street and rejects a nearer one behind another building or water", () => {
  expect(createBuildingFrontageResolver(routes, [lot])(lot, candidates)).toMatchObject({
    flip: false,
    source: "street"
  });
  const obstruction = [
    [-4, 4.5],
    [4, 4.5],
    [4, 6],
    [-4, 6]
  ] as [number, number][];
  expect(
    createBuildingFrontageResolver(routes, [lot, { ...lot, polygon: obstruction }])(lot, candidates)
  ).toMatchObject({ flip: true, source: "street" });
  expect(createBuildingFrontageResolver(routes, [lot], [obstruction])(lot, candidates)).toMatchObject({
    flip: true,
    source: "street"
  });
});

it("uses the actual parcel-access approach ending at the facade, and excludes other parcels' access", () => {
  const access = [
    {
      centerline: [
        [0, 4],
        [0, 9]
      ] as [number, number][],
      widthMeters: 0.8,
      parcelId: "parcel"
    }
  ];
  const resolve = createBuildingFrontageResolver(access, [lot]);
  expect(resolve(lot, candidates)).toMatchObject({ flip: false, source: "access" });
  expect(resolve({ ...lot, parcelId: "other" }, candidates).source).toBe("unknown");
});

it("does not invent frontage from a remote or perpendicular street and resolves equal distances consistently", () => {
  expect(
    createBuildingFrontageResolver(
      [
        {
          centerline: [
            [-20, 30],
            [20, 30]
          ],
          widthMeters: 2
        }
      ],
      [lot]
    )(lot, candidates).source
  ).toBe("unknown");
  expect(
    createBuildingFrontageResolver(
      [
        {
          centerline: [
            [0, 5],
            [0, 9]
          ],
          widthMeters: 1
        }
      ],
      [lot]
    )(lot, candidates).source
  ).toBe("unknown");
  const tied = [
    ...routes,
    {
      centerline: [
        [-20, -7],
        [20, -7]
      ] as [number, number][],
      widthMeters: 2
    }
  ];
  expect(createBuildingFrontageResolver(tied, [lot])(lot, candidates).flip).toBe(false);
  expect(createBuildingFrontageResolver([...tied].reverse(), [lot])(lot, candidates).flip).toBe(false);
});
