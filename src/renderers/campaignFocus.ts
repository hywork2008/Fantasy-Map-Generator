/**
 * Where the campaign window looks. The battle screen frames the engagement cell.
 * A regiment frames that same cell when it is in the open battle. Otherwise it
 * frames the midpoint of the nearest enemy that still fits in the week window,
 * or the regiment itself when no enemy is that close.
 */

export interface CampaignAnchor {
  x: number;
  y: number;
  cellId: number;
}

export interface CampaignForce {
  state: number;
  i: number;
  x: number;
  y: number;
}

export interface CampaignBattleAnchor {
  x: number;
  y: number;
  cell: number;
  attackers: Pick<CampaignForce, "state" | "i">[];
  defenders: Pick<CampaignForce, "state" | "i">[];
}

/** The open battle screen. `cell` is the defender pack cell stored on the battle. */
export function battleCampaignAnchor(battle: { x: number; y: number; cell: number }): CampaignAnchor {
  return { x: battle.x, y: battle.y, cellId: battle.cell };
}

function sameForce(a: Pick<CampaignForce, "state" | "i">, b: Pick<CampaignForce, "state" | "i">): boolean {
  return a.state === b.state && a.i === b.i;
}

/**
 * Center for 「この戦闘を3Dで見る」 on a regiment.
 * `contactReachPx` is the window side in map pixels. An enemy farther than that
 * is not a contact yet, so the camera stays on the regiment.
 */
export function regimentCampaignAnchor(input: {
  regiment: CampaignForce;
  battle: CampaignBattleAnchor | null;
  enemies: readonly CampaignForce[];
  contactReachPx: number;
  cellAt: (x: number, y: number) => number;
}): CampaignAnchor {
  const { regiment, battle } = input;
  if (
    battle &&
    (battle.attackers.some(force => sameForce(force, regiment)) ||
      battle.defenders.some(force => sameForce(force, regiment)))
  ) {
    return battleCampaignAnchor(battle);
  }

  let nearest: CampaignForce | null = null;
  let nearestDistance = Infinity;
  for (const enemy of input.enemies) {
    if (sameForce(enemy, regiment)) continue;
    if (!Number.isFinite(enemy.x) || !Number.isFinite(enemy.y)) continue;
    const distance = Math.hypot(enemy.x - regiment.x, enemy.y - regiment.y);
    if (distance < nearestDistance) {
      nearest = enemy;
      nearestDistance = distance;
    }
  }

  const reach = Number.isFinite(input.contactReachPx) ? input.contactReachPx : 0;
  if (nearest && nearestDistance <= reach) {
    const x = (regiment.x + nearest.x) / 2;
    const y = (regiment.y + nearest.y) / 2;
    return { x, y, cellId: input.cellAt(x, y) };
  }

  return { x: regiment.x, y: regiment.y, cellId: input.cellAt(regiment.x, regiment.y) };
}
