import type { CityDocument } from "../types/document";
import type { FortSite } from "../types/fortSite";
import { fortHeight, fortRouteNodes, validateFortSite } from "./fortSiteGeometry";
import { clone } from "./mesh";

export function editFortSite(document: CityDocument, edit: (site: FortSite) => void): CityDocument | null {
  if (!document.fortSite) return null;
  const next = clone(document);
  edit(next.fortSite!);
  const old = document.fortSite!,
    site = next.fortSite!;
  if (
    old.motte.heightMeters !== site.motte.heightMeters ||
    old.motte.summitRadiusMeters !== site.motte.summitRadiusMeters ||
    old.motte.baseRadiusMeters !== site.motte.baseRadiusMeters
  ) {
    const fence = site.defenses.find(d => d.id === "fort:summit-palisade");
    if (fence) fence.radiusMeters = site.motte.summitRadiusMeters - 0.2;
    const moat = site.moats.find(d => d.id === "fort:motte-moat");
    if (moat) moat.radiusMeters = site.motte.baseRadiusMeters + 3.5;
    const foot = site.junctions.find(n => n.id === "fort:stair-foot");
    if (foot) foot.point = [site.motte.center[0], site.motte.center[1] - site.motte.baseRadiusMeters];
    const landing = site.junctions.find(n => n.id === "fort:summit-landing");
    if (landing) {
      landing.point = [site.motte.center[0], site.motte.center[1] - site.motte.summitRadiusMeters];
      landing.elevationMeters = site.groundElevationMeters + site.motte.heightMeters + 0.2;
    }
    const nodes = fortRouteNodes(next),
      levels = new Map(site.junctions.map(n => [n.id, n.elevationMeters]));
    for (const gate of site.gates) {
      const p = nodes.get(gate.id);
      if (p) levels.set(gate.id, fortHeight(site, p) + 0.2);
    }
    for (const part of next.castles?.find(c => c.id === site.castleId)?.parts ?? [])
      levels.set(
        part.id,
        part.role === "keep" ? site.groundElevationMeters + site.motte.heightMeters : site.bailey.elevationMeters
      );
    for (const route of site.routes) {
      const a = nodes.get(route.from),
        b = nodes.get(route.to);
      if (a) route.points[0] = [...a];
      if (b) route.points[route.points.length - 1] = [...b];
      route.elevationsMeters[0] = levels.get(route.from) ?? route.elevationsMeters[0];
      route.elevationsMeters[route.elevationsMeters.length - 1] =
        levels.get(route.to) ?? route.elevationsMeters.at(-1)!;
    }
  }
  return validateFortSite(next).length ? null : next;
}
export function removeFortComponent(document: CityDocument, id: string): CityDocument | null {
  const site = document.fortSite;
  if (!site) return null;
  const next = clone(document),
    target = next.fortSite!;
  const defense = target.defenses.find(d => d.id === id),
    moat = target.moats.find(d => d.id === id),
    route = target.routes.find(d => d.id === id);
  const castle = next.castles?.find(c => c.id === site.castleId),
    part = castle?.parts.find(p => p.id === id);
  if (defense?.locked || moat?.locked || route?.locked || part?.locked || (part && castle?.locked)) return null;
  const gates = target.gates.filter(g => g.id === id || g.defenseId === id);
  for (const gate of gates) {
    const wall = target.defenses.find(d => d.id === gate.defenseId)!;
    const point: [number, number] = [
      wall.center[0] + Math.cos(gate.angleRadians) * wall.radiusMeters,
      wall.center[1] + Math.sin(gate.angleRadians) * wall.radiusMeters
    ];
    target.junctions.push({ id: gate.id, point, elevationMeters: fortHeight(site, point) });
  }
  target.gates = target.gates.filter(g => !gates.includes(g));
  target.defenses = target.defenses.filter(d => d.id !== id);
  target.moats = target.moats.filter(d => d.id !== id);
  target.routes = target.routes.filter(d => d.id !== id && d.from !== id && d.to !== id);
  if (part) {
    castle!.parts = castle!.parts.filter(p => p.id !== id);
    target.buildings = target.buildings.filter(b => b.partId !== id);
  }
  return validateFortSite(next).length ? null : next;
}
