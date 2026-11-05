/** All lengths are millimetres, all weights kilograms. */

export type VehicleKind = 'semi' | 'truck' | 'van' | 'container';

export interface Vehicle {
  presetId: string;
  kind: VehicleKind;
  /** Internal cargo space. x = length (front wall → door), y = width, z = height. */
  length: number;
  width: number;
  height: number;
  /** Maximum cargo weight. */
  payload: number;
  /**
   * Semi-trailers only: distance from the front wall to the kingpin and to the
   * centre of the axle group. Used for a rough load split; editable because
   * every trailer differs.
   */
  kingpinX?: number;
  axleX?: number;
}

export type ItemKind = 'pallet' | 'box' | 'long';

export interface CargoItem {
  id: string;
  name: string;
  kind: ItemKind;
  length: number;
  width: number;
  height: number;
  /** Weight of one unit. */
  weight: number;
  quantity: number;
  /** Whether other cargo may be placed on top. */
  stackable: boolean;
  /** Whether the unit may be turned 90° on the floor (never tipped over). */
  rotatable: boolean;
  /** Delivery stop; 1 is unloaded first. */
  stop: number;
  color: string;
}

export interface PlanOptions {
  /** Load later stops deeper so earlier stops are never blocked (LIFO). */
  respectStops: boolean;
  /** Minimum share of a unit's base that must rest on cargo below (0–1). */
  minSupport: number;
}

export interface Placement {
  /** Order in which the unit is loaded (0-based). */
  seq: number;
  itemId: string;
  unit: number;
  x: number;
  y: number;
  z: number;
  /** Dimensions after rotation. */
  l: number;
  w: number;
  h: number;
  weight: number;
  stop: number;
  rotated: boolean;
}

export type UnplacedReason = 'tooLarge' | 'overweight' | 'noSpace' | 'invalid';

export interface Unplaced {
  itemId: string;
  count: number;
  reason: UnplacedReason;
}

export interface Balance {
  /** Centre of gravity of the cargo. */
  cogX: number;
  cogY: number;
  cogZ: number;
  /** Lateral offset of the centre of gravity from the centreline (mm, + = right). */
  lateralOffset: number;
  /** Share of cargo weight in the front half of the cargo space (0–1). */
  frontShare: number;
  /** Semi-trailers: estimated cargo weight on kingpin and axle group. */
  kingpinLoad?: number;
  axleLoad?: number;
}

export interface PlanResult {
  placements: Placement[];
  unplaced: Unplaced[];
  totalUnits: number;
  loadedWeight: number;
  loadedVolume: number;
  /** Loading metres: occupied floor length (m) as used for road freight pricing. */
  ldm: number;
  /** Furthest occupied point from the front wall (mm). */
  usedLength: number;
  balance: Balance | null;
  /** Milliseconds spent planning. */
  elapsed: number;
}
