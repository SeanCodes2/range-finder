// Pure helpers for the Range feature: angle normalization, arrow rotation, target hints,
// GPS course, stake labels. No React, no DOM — covered by rangeMath.test.ts.
import { bearingDeg, distanceM, mToYd, ydToM } from '@/app/geo';
import type { GeoPoint } from '@/store/types';

export type DistUnit = 'yd' | 'm';
export type Tone = 'good' | 'warn' | 'bad';

/** 0..360 */
export const norm360 = (d: number) => ((d % 360) + 360) % 360;
/** -180..180 (signed shortest turn) */
export const norm180 = (d: number) => { const n = norm360(d); return n > 180 ? n - 360 : n; };

/** CSS rotation (deg, 0..360) for an arrow that should point toward `bearingTo` when the device faces `heading`. */
export const arrowRotation = (bearingTo: number, heading: number | null) => norm360(bearingTo - (heading ?? 0));

/** Carry a displayed angle toward `target` by the shortest turn so CSS transitions never spin the long way. */
export const continuousAngle = (prev: number, target: number) => prev + norm180(target - prev);

/** GPS accuracy class for `.status-dot` */
export const accClass = (acc: number | null | undefined): 'ok' | 'warn' | 'bad' | '' =>
  acc == null ? '' : acc <= 5 ? 'ok' : acc <= 15 ? 'warn' : 'bad';

export const toDisplay = (m: number, unit: DistUnit) => (unit === 'yd' ? mToYd(m) : m);
export const fromDisplay = (v: number, unit: DistUnit) => (unit === 'yd' ? ydToM(v) : v);

/** Number part of a distance for the big readout (1 decimal under 10, whole otherwise). */
export const fmtDistanceValue = (m: number, unit: DistUnit) => {
  const v = toDisplay(m, unit);
  return v < 10 ? v.toFixed(1) : Math.round(v).toString();
};

/** Walking hint while trying to reach `targetM` from the firing line, given current distance `distM`. */
export function targetHint(distM: number, targetM: number, unit: DistUnit): { text: string; tone: Tone } {
  const diff = toDisplay(targetM - distM, unit);
  if (Math.abs(diff) <= 1) return { text: 'On target — drop a stake', tone: 'good' };
  if (diff > 0) return { text: `${diff.toFixed(1)} ${unit} to go`, tone: 'warn' };
  return { text: `${(-diff).toFixed(1)} ${unit} too far`, tone: 'bad' };
}

/** "100 yd" style default label for a dropped stake. */
export const defaultStakeLabel = (distM: number, unit: DistUnit) => `${Math.round(toDisplay(distM, unit))} ${unit}`;

/** Signed delta "+1.3 yd" / "−0.8 m" / "0.0 yd". */
export function fmtDelta(actualM: number, intendedM: number, unit: DistUnit) {
  const d = toDisplay(actualM - intendedM, unit);
  const r = Math.round(d * 10) / 10;
  const sign = r > 0 ? '+' : r < 0 ? '−' : '';
  return `${sign}${Math.abs(r).toFixed(1)} ${unit}`;
}

/** Course over ground from two consecutive fixes; null unless moving faster than `minSpeed` m/s. */
export function courseFromFixes(prev: GeoPoint | null, cur: GeoPoint | null, minSpeed = 1): number | null {
  if (!prev || !cur || cur.t <= prev.t) return null;
  const dt = (cur.t - prev.t) / 1000;
  const d = distanceM(prev, cur);
  if (d / dt < minSpeed) return null;
  return bearingDeg(prev, cur);
}

/** Arrived when inside the larger of 2 m or the current fix accuracy. */
export const arrivedRadiusM = (acc: number) => Math.max(2, acc);

/** Heading from a DeviceOrientationEvent-shaped object. iOS: webkitCompassHeading; others: absolute alpha. */
export function headingFromOrientation(
  e: { webkitCompassHeading?: number | null; alpha: number | null; absolute?: boolean },
  screenAngle = 0,
): number | null {
  const w = e.webkitCompassHeading;
  if (typeof w === 'number' && Number.isFinite(w)) return norm360(w + screenAngle);
  if (e.alpha != null && e.absolute) return norm360(360 - e.alpha + screenAngle);
  return null;
}
