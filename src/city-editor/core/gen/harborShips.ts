import { measureProcessing, type ProcessingProfiler } from "../../../utils/processingProfiler";
import { SHIP_SPECS, type ShipType } from "../../render/shipSvg";
import { faceNeighbors, facePoints } from "../mesh";
import type { CityDocument, CityElement, Id, Point } from "../types";
import { waterPolygons as documentWaterPolygons } from "../waterGeometry";
import { buildBlockFabric } from "./blockInfill";
import { pointInPolygon, polygonCentroid } from "./geom";
import { harborWaterField, SEA_CHANNEL_HALF_WIDTH, seaBerthIsNavigable } from "./harborNavigation";
import { corridor, distance } from "./parcelGeometry";
import { makeRng } from "./prng";
import { riverPortShore } from "./riverPortShore";

const GEN_PREFIX = "gc:";

export function isExplorationOrLater(period?: string): boolean {
  return [
    "ageOfExploration",
    "maritimeEra",
    "preIndustrialEra",
    "steamEra",
    "industrialChemistryEra",
    "petroleumEra",
    "rocketryEra"
  ].includes(period ?? "ageOfExploration");
}

/**
 * 時代に応じた停泊可能な船種を返す。
 * 大航海時代以降: ガレオン (large)、キャラベル (medium)、スループ (small)。
 * それ以前（中世・古代など）: キャラベル (medium)、スループ (small) のみ。ガレオンは不可。
 */
export function allowedShipTypesForPeriod(period?: string): ShipType[] {
  if (isExplorationOrLater(period)) {
    return ["large", "medium", "small"];
  }
  return ["medium", "small"];
}

function distPointToSegment(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const ccw = (p1: Point, p2: Point, p3: Point) =>
    (p3[1] - p1[1]) * (p2[0] - p1[0]) > (p2[1] - p1[1]) * (p3[0] - p1[0]);
  return ccw(a, c, d) !== ccw(b, c, d) && ccw(a, b, c) !== ccw(a, b, d);
}

function distSegmentToSegment(a: Point, b: Point, c: Point, d: Point): number {
  if (segmentsIntersect(a, b, c, d)) return 0;
  return Math.min(
    distPointToSegment(a, c, d),
    distPointToSegment(b, c, d),
    distPointToSegment(c, a, b),
    distPointToSegment(d, a, b)
  );
}

interface KnownPier {
  id: string;
  waterFaceId: Id;
  riverId?: Id;
  water?: Point[];
  depth: number;
  start: Point;
  end: Point;
  length: number;
  width: number;
  dir: Point;
  normal: Point;
  polygon?: Point[];
}

interface PierBerth {
  pier: KnownPier;
  side: 1 | -1;
  clearanceScore: number;
}

/**
 * 港湾計画と水深・時代設定に基づき、港に停泊させる船の配置計画を生成する。
 * 桟橋に対して船が重なったり刺さったりしないよう、他桟橋・陸地との衝突判定を行い、
 * 桟橋の左右のうち十分な水域と離隔がある位置に停泊させる。
 */
export function planHarborShips(
  document: CityDocument,
  seed = "harbor-ships",
  profiler?: ProcessingProfiler
): CityElement[] {
  const harborFaces = Object.values(document.mesh.faces).filter(
    f => f.properties.ward === "harbor" && f.properties.water === "land"
  );
  if (!harborFaces.length) return [];

  const seaFaces = new Set(
    Object.values(document.mesh.faces)
      .filter(f => f.properties.water === "sea")
      .map(f => f.id)
  );
  const coastalHarborFaces = harborFaces.filter(f => faceNeighbors(document.mesh, f.id).some(nid => seaFaces.has(nid)));
  if (!coastalHarborFaces.length && !document.waterAccess?.port.river) return [];

  const period = document.historicalPeriod ?? "ageOfExploration";
  const exploration = isExplorationOrLater(period);
  const seaTypes = allowedShipTypesForPeriod(period);
  const typesForWater = (faceId: Id): ShipType[] => {
    if (!document.waterAccess) return seaTypes; // Legacy/standalone documents.
    if (document.waterAccess.port?.sea && document.coastalOceanFaceIds?.includes(faceId)) return seaTypes;
    // Inland water: sloops only where the town also has a sea port; river-only ports get barges.
    return document.waterAccess.port?.sea ? ["small"] : ["barge"];
  };

  const rng = makeRng(`${document.generationSeed ?? "fmg"}:${seed}:ships`);

  const knownPiers: KnownPier[] = [];

  // (1) fabric.harbor が存在する場合はその piers を利用
  const docFabric = document.fabric as import("./blockInfill").DistrictFabric | undefined;
  const fabric = docFabric?.harbor
    ? docFabric
    : measureProcessing(profiler, "block-fabric", () => buildBlockFabric(document, undefined, profiler));
  const fabricHarbor = fabric?.harbor;

  if (fabricHarbor && fabricHarbor.piers?.length) {
    for (const pier of fabricHarbor.piers) {
      let start: Point;
      let end: Point;
      let width = pier.width ?? (exploration ? 5.2 : 4.2);

      if (pier.start && pier.end) {
        start = pier.start;
        end = pier.end;
      } else if (pier.polygon.length >= 4) {
        start = [(pier.polygon[0][0] + pier.polygon[3][0]) / 2, (pier.polygon[0][1] + pier.polygon[3][1]) / 2];
        end = [(pier.polygon[1][0] + pier.polygon[2][0]) / 2, (pier.polygon[1][1] + pier.polygon[2][1]) / 2];
        width = distance(pier.polygon[0], pier.polygon[3]);
      } else {
        continue;
      }

      const dx = end[0] - start[0];
      const dy = end[1] - start[1];
      const length = Math.hypot(dx, dy);
      if (length < 5) continue;

      const dir: Point = [dx / length, dy / length];
      const normal: Point = [-dir[1], dir[0]];

      knownPiers.push({
        id: pier.id,
        waterFaceId: pier.waterFaceId,
        riverId: pier.riverId,
        water: pier.riverId?.startsWith("fixed-river:")
          ? document.importedFixedCrossings?.rivers
              .find(r => String(r.id) === pier.riverId!.split(":")[1])
              ?.rings[Number(pier.riverId.split(":")[2])]?.map(p => [p[0], p[1]] as Point)
          : pier.riverId
            ? document.waterAreas?.find((a, i) => a.kind === "river" && pier.riverId === `river-area:${i}`)?.polygon
            : undefined,
        depth: pier.depth,
        start,
        end,
        length,
        width,
        dir,
        normal,
        polygon: pier.polygon
      });
    }
  }

  // (2) fabric.harbor に桟橋がない場合（デフォルト生成等）、svg.ts と同一のメッシュ岸辺から桟橋を抽出
  if (!knownPiers.length) {
    const shores = new Map<Id, { a: Point; b: Point; ring: Point[]; length: number; depth: number; inward?: Point }>();
    for (const edge of Object.values(document.mesh.edges)) {
      const left = edge.leftFace ? document.mesh.faces[edge.leftFace] : null;
      const right = edge.rightFace ? document.mesh.faces[edge.rightFace] : null;
      if (!left || !right) continue;
      const land = left.properties.water === "land" ? left : right;
      const water = land === left ? right : left;
      if (land.properties.water !== "land" || land.properties.ward !== "harbor" || water.properties.water !== "sea")
        continue;
      const depth = water.properties.depth ?? 3;
      if (!Number.isFinite(depth) || depth < 3) continue;
      const physical = riverPortShore(document, land.id);
      const a = physical?.a ?? document.mesh.vertices[edge.a].point;
      const b = physical?.b ?? document.mesh.vertices[edge.b].point;
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (length < 10 || length <= (shores.get(water.id)?.length ?? 0)) continue;
      shores.set(water.id, {
        a,
        b,
        ring: physical?.water ?? facePoints(document.mesh, water),
        length,
        depth,
        inward: physical?.inward
      });
    }

    for (const [waterId, { a, b, ring, length, depth, inward }] of shores) {
      const center = polygonCentroid(ring);
      const tangent: Point = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
      let normal: Point = inward ? [-inward[0], -inward[1]] : [-tangent[1], tangent[0]];
      if (!inward && (center[0] - a[0]) * normal[0] + (center[1] - a[1]) * normal[1] < 0)
        normal = [-normal[0], -normal[1]];
      const count = length >= 50 ? 2 : 1;
      const width = Math.min(exploration ? 6.2 : 5.2, Math.max(exploration ? 4.8 : 4.0, length * 0.16));
      const fractions = count === 2 ? [0.28, 0.72] : [0.5];
      for (let i = 0; i < count; i++) {
        const t = fractions[i];
        const start: Point = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        let reach = 0;
        const maxReachLimit = exploration ? 42 : 28;
        const desired = Math.min(maxReachLimit, Math.max(exploration ? 32 : 22, length * (exploration ? 0.75 : 0.5)));
        for (let d = 0.5; d <= desired; d += 0.5) {
          if (
            ![-1, 0, 1].every(side =>
              pointInPolygon(
                [
                  start[0] + normal[0] * d + (tangent[0] * width * side) / 2,
                  start[1] + normal[1] * d + (tangent[1] * width * side) / 2
                ],
                ring
              )
            )
          )
            break;
          reach = d;
        }
        if (reach < 3) continue;
        const end: Point = [start[0] + normal[0] * reach, start[1] + normal[1] * reach];
        const dir = normal;
        const pierNormal: Point = [-dir[1], dir[0]];
        const deckPoly: Point[] = [
          [start[0] - (pierNormal[0] * width) / 2, start[1] - (pierNormal[1] * width) / 2],
          [end[0] - (pierNormal[0] * width) / 2, end[1] - (pierNormal[1] * width) / 2],
          [end[0] + (pierNormal[0] * width) / 2, end[1] + (pierNormal[1] * width) / 2],
          [start[0] + (pierNormal[0] * width) / 2, start[1] + (pierNormal[1] * width) / 2]
        ];

        knownPiers.push({
          id: `mesh-pier:${waterId}:${i}`,
          waterFaceId: waterId,
          depth,
          start,
          end,
          length: reach,
          width,
          dir,
          normal: pierNormal,
          polygon: deckPoly
        });
      }
    }
  }

  // A ship must be able to leave: drop sea piers whose head is boxed in (this
  // also covers the mesh-shore fallback above) and keep hulls on open water.
  const field = harborWaterField(document);
  const seaBerth = (pier: KnownPier) => !pier.riverId && !pier.id.startsWith("pier:bank:");
  for (let i = knownPiers.length - 1; i >= 0; i--)
    if (seaBerth(knownPiers[i]) && !seaBerthIsNavigable(field, knownPiers[i].end)) knownPiers.splice(i, 1);
  const onOpenWater = (p: Point) => field.navigable(p, SEA_CHANNEL_HALF_WIDTH);

  const waterPolygons = new Map<Id, Point[]>();
  for (const face of Object.values(document.mesh.faces)) {
    if (face.properties.water !== "land") {
      waterPolygons.set(face.id, facePoints(document.mesh, face));
    }
  }

  const landPolygons = Object.values(document.mesh.faces)
    .filter(f => f.properties.water === "land")
    .map(f => facePoints(document.mesh, f));

  const physicalWater = documentWaterPolygons(document);
  const onDryLand = (p: Point, land: Point[]) =>
    pointInPolygon(p, land) && !physicalWater.some(w => pointInPolygon(p, w));

  const ribbonWater = document.featureGroups.flatMap(group =>
    group.kind === "river"
      ? group.vertices
          .slice(1)
          .map((id, i) =>
            corridor(
              document.mesh.vertices[group.vertices[i]].point,
              document.mesh.vertices[id].point,
              group.style.widthMeters
            )
          )
      : []
  );
  physicalWater.push(...ribbonWater);
  for (const pier of knownPiers) {
    if (pier.riverId && !pier.water) pier.water = physicalWater.find(w => pointInPolygon(pier.end, w));
  }

  // 水上を渡る橋・道路（FMG固定橋、枠外へ続く道路と橋、対岸連絡路、道路グループ）。船を重ねない。
  const crossingLines: Array<{ a: Point; b: Point; halfWidth: number }> = [];
  const addLine = (points: readonly (readonly number[])[], width: number) => {
    for (let i = 1; i < points.length; i++)
      crossingLines.push({
        a: [points[i - 1][0], points[i - 1][1]],
        b: [points[i][0], points[i][1]],
        halfWidth: width / 2
      });
  };
  const fixed = document.importedFixedCrossings;
  for (const c of fixed?.crossings ?? []) addLine([c.approachA, c.deckA, c.deckB, c.approachB], fixed!.roadWidthMeters);
  const roadWidth = fixed?.roadWidthMeters ?? 6;
  for (const road of document.frameRoads ?? []) for (const piece of road.pieces) addLine(piece.points, roadWidth);
  for (const c of document.riverConnections ?? []) {
    addLine(c.townRoad, roadWidth);
    addLine(c.farRoad, roadWidth);
  }
  for (const group of document.featureGroups)
    if (group.kind === "road")
      for (const ref of group.segments) {
        const edge = document.mesh.edges[ref.edgeId];
        if (edge)
          addLine(
            [document.mesh.vertices[edge.a].point, document.mesh.vertices[edge.b].point],
            group.style.widthMeters
          );
      }

  // 桟橋の左右（side = 1 または -1）について、他桟橋や陸地との離隔を計測し候補バースを作成
  const berths: PierBerth[] = [];
  for (const pier of knownPiers) {
    for (const side of [1, -1] as const) {
      const probeDist = Math.max(16, pier.length * 0.5);
      const probePoint: Point = [
        pier.start[0] + pier.dir[0] * probeDist + pier.normal[0] * side * 15,
        pier.start[1] + pier.dir[1] * probeDist + pier.normal[1] * side * 15
      ];
      let clearanceScore = 50;
      for (const other of knownPiers) {
        if (other.id === pier.id) continue;
        const d = distPointToSegment(probePoint, other.start, other.end);
        clearanceScore = Math.min(clearanceScore, d);
      }
      for (const lp of landPolygons) {
        if (onDryLand(probePoint, lp)) clearanceScore = Math.min(clearanceScore, 2);
      }
      berths.push({ pier, side, clearanceScore });
    }
  }

  // 評価値でソート（水深、長さ、クリアランスの広さを総合評価）
  berths.sort((a, b) => {
    const scoreA = a.pier.length * 2 + a.pier.depth * 5 + a.clearanceScore * 0.8;
    const scoreB = b.pier.length * 2 + b.pier.depth * 5 + b.clearanceScore * 0.8;
    return scoreB - scoreA;
  });

  const placedShips: CityElement[] = [];
  const targetCount =
    knownPiers.length >= 2 ? (rng() < 0.4 ? 3 : 2) : knownPiers.length >= 1 ? (rng() < 0.4 ? 2 : 1) : 0;
  const usedPierSides = new Set<string>();

  for (const berth of berths) {
    if (placedShips.length >= targetCount) break;
    const berthKey = `${berth.pier.id}:${berth.side}`;
    if (usedPierSides.has(berthKey)) continue;

    const allowedTypes = berth.pier.riverId ? ["barge" as const] : typesForWater(berth.pier.waterFaceId);
    // 船種選択
    let chosenType: ShipType;
    if (exploration) {
      if (
        placedShips.length === 0 &&
        berth.pier.length >= 24 &&
        berth.pier.depth >= 3.5 &&
        berth.clearanceScore >= 12
      ) {
        chosenType = rng() < 0.65 ? "large" : "medium";
      } else if (placedShips.some(s => s.shipType === "large")) {
        chosenType = rng() < 0.65 ? "medium" : "small";
      } else {
        chosenType = rng() < 0.35 ? "large" : rng() < 0.75 ? "medium" : "small";
      }
    } else {
      chosenType = rng() < 0.65 ? "medium" : "small";
    }

    if (!allowedTypes.includes(chosenType)) {
      chosenType = allowedTypes[0];
    }

    // 桟橋の長さ・水深・クリアランスに応じた船型ダウンサイジング
    if (chosenType === "large" && (berth.pier.length < 24 || berth.pier.depth < 3 || berth.clearanceScore < 10)) {
      chosenType = "medium";
    }
    if (chosenType === "medium" && (berth.pier.length < 14 || berth.clearanceScore < 7)) {
      chosenType = "small";
    }

    const spec = SHIP_SPECS[chosenType];
    const sizeVariation = (rng() - 0.5) * (chosenType === "large" ? 4 : chosenType === "medium" ? 3 : 2);
    const sizeMeters = Math.max(
      spec.minSizeMeters,
      Math.min(spec.maxSizeMeters, Math.round((spec.defaultSizeMeters + sizeVariation) * 10) / 10)
    );
    const beam = (sizeMeters / spec.baseLengthMeters) * spec.baseBeamMeters;

    // 桟橋に沿った船体中心位置（岸辺から十分離れた位置）
    const riverBerth = !!berth.pier.riverId;
    const shipDir: Point = riverBerth ? berth.pier.normal : berth.pier.dir;
    const shipNormal: Point = [-shipDir[1], shipDir[0]];
    const offsetAlong = riverBerth
      ? Math.max(beam / 2 + 2, berth.pier.length * 0.65)
      : Math.max(sizeMeters * 0.48 + 3.0, berth.pier.length * 0.52);
    const lateralDist = berth.pier.width / 2 + (riverBerth ? sizeMeters * 0.48 : beam / 2) + 1.2;

    const shipCenter: Point = [
      berth.pier.start[0] + berth.pier.dir[0] * offsetAlong + berth.pier.normal[0] * berth.side * lateralDist,
      berth.pier.start[1] + berth.pier.dir[1] * offsetAlong + berth.pier.normal[1] * berth.side * lateralDist
    ];

    const bow: Point = [
      shipCenter[0] + shipDir[0] * (sizeMeters * 0.48),
      shipCenter[1] + shipDir[1] * (sizeMeters * 0.48)
    ];
    const stern: Point = [
      shipCenter[0] - shipDir[0] * (sizeMeters * 0.48),
      shipCenter[1] - shipDir[1] * (sizeMeters * 0.48)
    ];

    const halfBeam = beam / 2 + 0.6;
    const halfLen = sizeMeters * 0.48;
    const corners: Point[] = [
      [
        shipCenter[0] + shipDir[0] * halfLen + shipNormal[0] * halfBeam,
        shipCenter[1] + shipDir[1] * halfLen + shipNormal[1] * halfBeam
      ],
      [
        shipCenter[0] + shipDir[0] * halfLen - shipNormal[0] * halfBeam,
        shipCenter[1] + shipDir[1] * halfLen - shipNormal[1] * halfBeam
      ],
      [
        shipCenter[0] - shipDir[0] * halfLen - shipNormal[0] * halfBeam,
        shipCenter[1] - shipDir[1] * halfLen - shipNormal[1] * halfBeam
      ],
      [
        shipCenter[0] - shipDir[0] * halfLen + shipNormal[0] * halfBeam,
        shipCenter[1] - shipDir[1] * halfLen + shipNormal[1] * halfBeam
      ]
    ];

    // (1) 他の桟橋との衝突・干渉判定（絶対に他の桟橋に刺さらないようにする）
    const pierCollision = knownPiers.some(otherPier => {
      if (otherPier.id === berth.pier.id) return false;
      const d = distSegmentToSegment(stern, bow, otherPier.start, otherPier.end);
      if (d < beam / 2 + otherPier.width / 2 + 1.2) return true;
      if (otherPier.polygon && corners.some(c => pointInPolygon(c, otherPier.polygon!))) return true;
      return false;
    });
    if (pierCollision) continue;

    // (2) 陸地との干渉判定
    if (landPolygons.some(lp => corners.some(c => onDryLand(c, lp)) || onDryLand(bow, lp) || onDryLand(stern, lp))) {
      continue;
    }

    // (3) 水域内判定
    const waterPoly = berth.pier.water ?? waterPolygons.get(berth.pier.waterFaceId);
    if (waterPoly && ![shipCenter, bow, stern, ...corners].every(p => pointInPolygon(p, waterPoly))) {
      continue;
    }

    // (4) 橋・道路との干渉判定
    if (crossingLines.some(l => distSegmentToSegment(stern, bow, l.a, l.b) < beam / 2 + l.halfWidth + 1.5)) continue;

    // (4b) 出航できる水域か（入江の奥・狭い水路に押し込まない）
    if (seaBerth(berth.pier) && !onOpenWater(shipCenter)) continue;

    // (5) 他の船との衝突判定
    const shipCollision = placedShips.some(other => {
      const d = distance(shipCenter, other.point ?? [0, 0]);
      const otherSpec = SHIP_SPECS[other.shipType ?? "small"];
      const minDistance = (beam + otherSpec.baseBeamMeters) / 2 + 2.5;
      return d < minDistance;
    });
    if (shipCollision) continue;

    usedPierSides.add(berthKey);

    const shipRotation = -Math.atan2(shipDir[0], shipDir[1]);

    placedShips.push({
      id: `${GEN_PREFIX}ship-${placedShips.length}`,
      kind: "ship",
      faceIds: berth.pier.waterFaceId ? [berth.pier.waterFaceId] : [],
      point: shipCenter,
      rotation: shipRotation,
      sizeMeters,
      shipType: chosenType,
      locked: false
    });
  }

  // 桟橋だけでは目標隻数に満たず、かつ桟橋が存在する場合にのみ、十分な水域があれば泊地（Anchorage）に配置
  if (
    placedShips.length < targetCount &&
    knownPiers.length > 0 &&
    placedShips.length < 2 &&
    coastalHarborFaces.length > 0
  ) {
    const harborCenter = polygonCentroid(facePoints(document.mesh, coastalHarborFaces[0]));
    for (const [waterId, waterPoly] of waterPolygons) {
      if (placedShips.length >= targetCount) break;
      const waterFace = document.mesh.faces[waterId];
      if (!waterFace || waterFace.properties.water !== "sea") continue;
      const depth = waterFace.properties.depth ?? 3;
      if (depth < 3.0) continue;

      const waterCenter = polygonCentroid(waterPoly);
      const toWater: Point = [waterCenter[0] - harborCenter[0], waterCenter[1] - harborCenter[1]];
      const len = Math.hypot(toWater[0], toWater[1]);
      if (len < 10) continue;
      const normToWater: Point = [toWater[0] / len, toWater[1] / len];

      const allowedTypes = typesForWater(waterId);
      let chosenType: ShipType = exploration ? (rng() < 0.5 ? "medium" : "large") : "medium";
      if (!allowedTypes.includes(chosenType)) {
        chosenType = allowedTypes[0];
      }
      if (chosenType === "large" && depth < 3) {
        chosenType = "medium";
      }
      if (chosenType === "medium" && depth < 3.0) {
        chosenType = "small";
      }

      const spec = SHIP_SPECS[chosenType];
      const sizeMeters = spec.defaultSizeMeters;
      const beam = (sizeMeters / spec.baseLengthMeters) * spec.baseBeamMeters;

      // 泊地（沖合35〜55m）
      const anchorPt: Point = [harborCenter[0] + normToWater[0] * 42, harborCenter[1] + normToWater[1] * 42];
      if (!pointInPolygon(anchorPt, waterPoly)) continue;

      const rotation = -Math.atan2(normToWater[0], normToWater[1]);
      const dir: Point = [normToWater[0], normToWater[1]];
      const normal: Point = [-dir[1], dir[0]];
      const halfLen = sizeMeters * 0.48;
      const halfBeam = beam / 2 + 1.2;

      const bow: Point = [anchorPt[0] + dir[0] * halfLen, anchorPt[1] + dir[1] * halfLen];
      const stern: Point = [anchorPt[0] - dir[0] * halfLen, anchorPt[1] - dir[1] * halfLen];
      const corners: Point[] = [
        [anchorPt[0] + dir[0] * halfLen + normal[0] * halfBeam, anchorPt[1] + dir[1] * halfLen + normal[1] * halfBeam],
        [anchorPt[0] + dir[0] * halfLen - normal[0] * halfBeam, anchorPt[1] + dir[1] * halfLen - normal[1] * halfBeam],
        [anchorPt[0] - dir[0] * halfLen - normal[0] * halfBeam, anchorPt[1] - dir[1] * halfLen - normal[1] * halfBeam],
        [anchorPt[0] - dir[0] * halfLen + normal[0] * halfBeam, anchorPt[1] - dir[1] * halfLen + normal[1] * halfBeam]
      ];

      // 陸地との干渉判定（船首・船尾・四隅・中心点すべてが陸地に入っていないこと）
      const hitsLand = landPolygons.some(
        lp =>
          pointInPolygon(anchorPt, lp) ||
          pointInPolygon(bow, lp) ||
          pointInPolygon(stern, lp) ||
          corners.some(c => pointInPolygon(c, lp))
      );
      if (hitsLand) continue;

      // 水域ポリゴン内に船体が収まっていること
      if (!pointInPolygon(bow, waterPoly) || !pointInPolygon(stern, waterPoly)) continue;
      if (crossingLines.some(l => distSegmentToSegment(stern, bow, l.a, l.b) < beam / 2 + l.halfWidth + 1.5)) continue;

      if (knownPiers.some(p => distPointToSegment(anchorPt, p.start, p.end) < 20)) continue;
      if (!onOpenWater(anchorPt) || field.clearance(anchorPt) < halfLen) continue;

      const collides = placedShips.some(s => distance(anchorPt, s.point ?? [0, 0]) < 25);
      if (collides) continue;

      placedShips.push({
        id: `${GEN_PREFIX}ship-${placedShips.length}`,
        kind: "ship",
        faceIds: [waterId],
        point: anchorPt,
        rotation,
        sizeMeters,
        shipType: chosenType,
        locked: false
      });
      break;
    }
  }

  return placedShips;
}

/**
 * 都市ドキュメントに港湾船を生成・配置する。
 * 既存の未ロックかつ自動生成（gc:ship-...）の船を再生成する。
 */
export function spawnHarborShips(document: CityDocument, seed = "harbor-ships", profiler?: ProcessingProfiler): void {
  // 自動生成された未ロックの船要素をクリア
  document.elements = document.elements.filter(e => e.locked || e.kind !== "ship" || !e.id.startsWith(GEN_PREFIX));

  const ships = measureProcessing(profiler, "ship-plan", () => planHarborShips(document, seed, profiler));
  if (ships.length > 0) {
    document.elements.push(...ships);
  }
}
