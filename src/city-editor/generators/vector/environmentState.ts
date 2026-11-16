import type { VectorCityDocument } from "../../types/vector/document";
import { defenseReservations } from "./defense";
import { ferryReservations } from "./ferry";
import { forestReservations } from "./forest";
import { guildReservations } from "./guild";
import { harborReservations } from "./harbor";
import { innReservations } from "./inn";
import { openLandmarkReservations } from "./landmark";
import { monasteryReservations } from "./monastery";
/** Reserved feature land a farm track may still cross: everything but the fields and woods. */
export const builtFeatureReservations = (doc: VectorCityDocument) => [
  ...Object.values(doc.environment?.features ?? {}).map(f => f.boundary),
  ...Object.values(doc.environment?.defenses ?? {}).flatMap(defenseReservations),
  ...(doc.environment?.harbor ? harborReservations(doc.environment.harbor) : []),
  ...Object.values(doc.environment?.ferries ?? {}).flatMap(ferryReservations),
  ...Object.values(doc.environment?.monasteries ?? {}).flatMap(monasteryReservations),
  ...guildReservations(doc),
  ...innReservations(doc),
  ...openLandmarkReservations(doc),
  ...(doc.environment?.landscape
    ? [
        ...doc.environment.landscape.parks.flatMap(p => p.lawns),
        ...doc.environment.landscape.cemeteries.map(c => ({ outer: c.boundary, holes: [] }))
      ]
    : [])
];
export const featureReservations = (doc: VectorCityDocument) => [
  ...Object.values(doc.environment?.features ?? {}).map(f => f.boundary),
  ...Object.values(doc.environment?.defenses ?? {}).flatMap(defenseReservations),
  ...(doc.environment?.harbor ? harborReservations(doc.environment.harbor) : []),
  ...Object.values(doc.environment?.ferries ?? {}).flatMap(ferryReservations),
  ...Object.values(doc.environment?.monasteries ?? {}).flatMap(monasteryReservations),
  ...guildReservations(doc),
  ...innReservations(doc),
  ...openLandmarkReservations(doc),
  ...forestReservations(doc),
  ...(doc.environment?.landscape
    ? [
        ...doc.environment.landscape.parks.flatMap(p => p.lawns),
        ...doc.environment.landscape.farms.map(f => f.polygon),
        ...doc.environment.landscape.cemeteries.map(c => ({ outer: c.boundary, holes: [] }))
      ]
    : [])
];
