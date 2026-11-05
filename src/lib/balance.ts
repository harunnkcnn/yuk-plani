import type { Balance, Placement, Vehicle } from './types';

/**
 * Centre of gravity of the cargo, assuming each unit's weight sits at its
 * geometric centre. For semi-trailers the cargo weight is split between the
 * kingpin and the axle group as a simple beam on two supports.
 * These are planning estimates, not legal axle-load checks.
 */
export function computeBalance(vehicle: Vehicle, placements: Placement[]): Balance | null {
  const total = placements.reduce((s, p) => s + p.weight, 0);
  if (total <= 0) return null;
  let mx = 0;
  let my = 0;
  let mz = 0;
  let front = 0;
  for (const p of placements) {
    const cx = p.x + p.l / 2;
    mx += p.weight * cx;
    my += p.weight * (p.y + p.w / 2);
    mz += p.weight * (p.z + p.h / 2);
    if (cx < vehicle.length / 2) front += p.weight;
  }
  const cogX = mx / total;
  const balance: Balance = {
    cogX,
    cogY: my / total,
    cogZ: mz / total,
    lateralOffset: my / total - vehicle.width / 2,
    frontShare: front / total,
  };
  if (vehicle.kind === 'semi' && vehicle.kingpinX !== undefined && vehicle.axleX !== undefined && vehicle.axleX > vehicle.kingpinX) {
    const span = vehicle.axleX - vehicle.kingpinX;
    balance.kingpinLoad = (total * (vehicle.axleX - cogX)) / span;
    balance.axleLoad = total - balance.kingpinLoad;
  }
  return balance;
}

export type BalanceLevel = 'ok' | 'watch' | 'bad';

/** Simple rules of thumb for the UI. */
export function judgeBalance(vehicle: Vehicle, b: Balance): { lateral: BalanceLevel; longitudinal: BalanceLevel } {
  const lateralRatio = Math.abs(b.lateralOffset) / vehicle.width;
  const position = b.cogX / vehicle.length;
  return {
    lateral: lateralRatio < 0.05 ? 'ok' : lateralRatio < 0.1 ? 'watch' : 'bad',
    longitudinal:
      b.kingpinLoad !== undefined && b.kingpinLoad < 0 ? 'bad' : position >= 0.3 && position <= 0.6 ? 'ok' : position >= 0.2 && position <= 0.7 ? 'watch' : 'bad',
  };
}
