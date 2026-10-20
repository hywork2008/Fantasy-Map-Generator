import type { CityDocument, Point } from "../types/document";
import { fortCircle, fortHeight } from "./fortSiteGeometry";
import { nearestOnPolyline, polygonArea, polygonCentroid } from "./geom";
import { facePoints } from "./mesh";
import { intersectConvex, subtractConvex } from "./parcelGeometry";
import type { CityTerrain } from "./terrainElevation";

/** A separate, fine drawing mesh follows the authored earthworks without touching editor topology. */
export function fortSiteTerrain(document: CityDocument): CityTerrain {
  const site = document.fortSite!;
  const heightAt = (point: Point) => fortHeight(site, point) - site.groundElevationMeters;
  const triangles: CityTerrain["triangles"] = [];
  const circles = [
    { center: site.motte.center, radius: site.motte.summitRadiusMeters },
    { center: site.motte.center, radius: site.motte.baseRadiusMeters },
    { center: site.bailey.center, radius: site.bailey.radiusMeters },
    ...site.moats.flatMap(moat => {
      const half = moat.widthMeters / 2,
        waterDepth = Math.max(
          0,
          Math.min(moat.depthMeters, site.waterElevationMeters - site.groundElevationMeters + moat.depthMeters)
        );
      const waterHalf = half * (1 - 0.35 * (1 - waterDepth / moat.depthMeters));
      return [-half, -half * 0.65, half * 0.65, half, -waterHalf, waterHalf].map(offset => ({
        center: moat.center,
        radius: moat.radiusMeters + offset
      }));
    })
  ].map(circle => ({ ...circle, ring: fortCircle(circle.center, circle.radius) }));
  const emit = (faceId: string, triangle: [Point, Point, Point]) => {
    let pieces: Point[][] = [triangle];
    for (const circle of circles) {
      const radii = triangle.map(p => Math.hypot(p[0] - circle.center[0], p[1] - circle.center[1]));
      if (
        Math.max(...radii) < circle.radius * Math.cos(Math.PI / 64) - 1e-7 ||
        (Math.min(...radii) > circle.radius &&
          nearestOnPolyline(circle.center, [...triangle, triangle[0]]).dist > circle.radius + 1e-7)
      )
        continue;
      pieces = pieces.flatMap(piece => {
        const inside = intersectConvex(piece, circle.ring);
        if (inside.length < 3 || Math.abs(polygonArea(inside)) < 1e-9) return [piece];
        if (Math.abs(Math.abs(polygonArea(inside)) - Math.abs(polygonArea(piece))) < 1e-8) return [piece];
        return [...subtractConvex(piece, circle.ring, 1e-9), inside];
      });
    }
    for (const piece of pieces)
      for (let i = 1; i < piece.length - 1; i++) {
        const points: [Point, Point, Point] = [piece[0], piece[i], piece[i + 1]];
        if (Math.abs(polygonArea(points)) > 1e-9)
          triangles.push({ faceId, points, heights: points.map(heightAt) as [number, number, number] });
      }
  };
  const midpoint = (a: Point, b: Point): Point => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const add = (faceId: string, a: Point, b: Point, c: Point, depth: number) => {
    if (depth > 0) {
      const ab = midpoint(a, b),
        bc = midpoint(b, c),
        ca = midpoint(c, a);
      add(faceId, a, ab, ca, depth - 1);
      add(faceId, ab, b, bc, depth - 1);
      add(faceId, ca, bc, c, depth - 1);
      add(faceId, ab, bc, ca, depth - 1);
    } else emit(faceId, [a, b, c]);
  };
  for (const face of Object.values(document.mesh.faces)) {
    const ring = facePoints(document.mesh, face),
      center = polygonCentroid(ring);
    const nearby = [site.motte.center, site.bailey.center].some(
      p => Math.hypot(center[0] - p[0], center[1] - p[1]) < 55 + document.frame.blockSizeMeters
    );
    const depth = nearby ? Math.max(1, Math.min(5, Math.ceil(Math.log2(document.frame.blockSizeMeters / 2)))) : 0;
    // Original convex starting cells keep coincident boundary subdivisions in adjacent patches.
    for (let i = 0; i < ring.length; i++) add(face.id, center, ring[i], ring[(i + 1) % ring.length], depth);
  }
  return {
    datumMeters: site.groundElevationMeters,
    relief: true,
    heightAt,
    triangles,
    foundationAt(ring) {
      return Math.max(0, ...ring.map(heightAt), heightAt(polygonCentroid([...ring])));
    }
  };
}
