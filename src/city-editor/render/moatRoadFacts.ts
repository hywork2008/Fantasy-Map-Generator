import { MoatReservation } from "../core/moats";
import type { CityDocument, Point } from "../core/types";

export interface MoatBridgeDeck {
  points: Point[];
  width: number;
}

/**
 * Cuts road runs where they cross a moat. The dry parts stay roads; each wet
 * part becomes a bridge deck. Read-only: one reservation per road width.
 */
export class MoatRoadSplitter {
  private readonly reservations = new Map<number, MoatReservation>();
  /** Decks found so far, in the order the runs were split. */
  readonly decks: MoatBridgeDeck[] = [];

  constructor(private readonly document: CityDocument) {}

  dryRuns(runs: Point[][], width: number): Point[][] {
    let moat = this.reservations.get(width);
    if (!moat) {
      moat = new MoatReservation(this.document, width / 2 + 1);
      this.reservations.set(width, moat);
    }
    const reservation = moat;
    return runs.flatMap(run => {
      const parts = reservation.roadParts(run);
      this.decks.push(...parts.bridges.map(points => ({ points, width })));
      return parts.dry;
    });
  }
}
