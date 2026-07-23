import type { Burg } from "../types/models";
import type { PackedGraph } from "../types/PackedGraph";
import { rn } from "./numberUtils";

/** Fraction of the shore-to-centre distance that keeps a port anchor inside its haven water cell. */
export const PORT_ANCHOR_WATER_OFFSET = 0.1;

/**
 * Returns the water-side visual attachment point for a coastal port.
 *
 * The burg's logical cell and icon remain on land. Its anchor and generated
 * sea-route endpoint sit inside the unique haven water cell instead. A river
 * port has no haven and keeps its burg position.
 */
export function getPortAnchorPosition(pack: Readonly<PackedGraph>, burg: Readonly<Burg>): [number, number] {
  const havenCell = pack.cells.haven?.[burg.cell];
  if (!burg.port || !havenCell) return [burg.x, burg.y];

  const sharedVertices = pack.cells.v[burg.cell].filter(vertexId => pack.vertices.c[vertexId].includes(havenCell));
  if (sharedVertices.length !== 2) return [burg.x, burg.y];

  const [first, second] = sharedVertices.map(vertexId => pack.vertices.p[vertexId]);
  if (!first || !second) return [burg.x, burg.y];

  const edgeX = (first[0] + second[0]) / 2;
  const edgeY = (first[1] + second[1]) / 2;
  const [havenX, havenY] = pack.cells.p[havenCell];

  return [
    rn(edgeX + (havenX - edgeX) * PORT_ANCHOR_WATER_OFFSET, 2),
    rn(edgeY + (havenY - edgeY) * PORT_ANCHOR_WATER_OFFSET, 2)
  ];
}
