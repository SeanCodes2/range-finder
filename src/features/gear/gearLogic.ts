// Pure helpers for the Gear tab. Kept free of React/db so they can be unit tested.
import type { Ammo, CleaningEvent, Rifle, ZeroEvent } from '@/store/types';

export interface ClickPreset { label: string; unit: Rifle['clickUnit']; value: number }
export const CLICK_PRESETS: ClickPreset[] = [
  { label: '1/4 MOA', unit: 'MOA', value: 0.25 },
  { label: '1/8 MOA', unit: 'MOA', value: 0.125 },
  { label: '0.1 MRAD', unit: 'MRAD', value: 0.1 },
  { label: '0.05 MRAD', unit: 'MRAD', value: 0.05 },
];
export function matchClickPreset(unit: Rifle['clickUnit'], value: number): ClickPreset | undefined {
  return CLICK_PRESETS.find(p => p.unit === unit && Math.abs(p.value - value) < 1e-9);
}

const byNewest = <T extends { createdAt: number }>(a: T, b: T) => b.createdAt - a.createdAt;

export function cleaningsFor(rifleId: string, all: CleaningEvent[]): CleaningEvent[] {
  return all.filter(e => e.rifleId === rifleId).sort(byNewest);
}
export function zerosFor(rifleId: string, all: ZeroEvent[]): ZeroEvent[] {
  return all.filter(e => e.rifleId === rifleId).sort(byNewest);
}

/** Rounds fired since the most recent cleaning, or the total if never cleaned. Never negative. */
export function roundsSinceCleaning(rifle: Rifle, cleanings: CleaningEvent[]): number {
  const last = cleaningsFor(rifle.id, cleanings)[0];
  if (!last) return rifle.roundCount;
  return Math.max(0, rifle.roundCount - last.roundCountAt);
}

/** Most recent zero distance in meters: last ZeroEvent if any, else the rifle's own zeroDistanceM. */
export function currentZeroM(rifle: Rifle, zeros: ZeroEvent[]): number {
  const last = zerosFor(rifle.id, zeros)[0];
  return last ? last.distanceM : rifle.zeroDistanceM;
}

export const LOW_STOCK = 20;
export const isLowStock = (a: Pick<Ammo, 'onHand'>) => a.onHand < LOW_STOCK;

export function inventoryValue(a: Pick<Ammo, 'onHand' | 'costPerRound'>): number | undefined {
  if (a.costPerRound == null || !isFinite(a.costPerRound)) return undefined;
  return a.onHand * a.costPerRound;
}

export function inventoryTotals(ammo: Ammo[]): { rounds: number; value: number; priced: number } {
  let rounds = 0, value = 0, priced = 0;
  for (const a of ammo) {
    rounds += a.onHand;
    const v = inventoryValue(a);
    if (v != null) { value += v; priced++; }
  }
  return { rounds, value, priced };
}

/** Parse a numeric text input; returns fallback for blank/invalid. */
export function num(s: string, fallback = 0): number {
  const v = parseFloat(s);
  return Number.isFinite(v) ? v : fallback;
}
/** Parse an optional numeric text input; blank -> undefined. */
export function optNum(s: string): number | undefined {
  if (s.trim() === '') return undefined;
  const v = parseFloat(s);
  return Number.isFinite(v) ? v : undefined;
}

export const fmtMoney = (v: number) => '$' + v.toFixed(2);
export const fmtBc = (bc: number) => bc.toFixed(3).replace(/^0/, '');
