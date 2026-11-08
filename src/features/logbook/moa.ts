// Group-size angular helpers.
import { mToYd } from '@/app/geo';

/** Extreme spread in inches at a distance (meters) → MOA. 1 MOA = 1.047 in per 100 yd. null when not computable. */
export function groupMoa(groupSizeIn: number | undefined, distanceM: number | undefined): number | null {
  if (groupSizeIn == null || distanceM == null) return null;
  const yd = mToYd(distanceM);
  if (!(yd > 0) || !(groupSizeIn >= 0) || !Number.isFinite(groupSizeIn)) return null;
  return groupSizeIn / (1.047 * yd / 100);
}

export const moaToMrad = (moa: number) => moa / 3.4377468;

/** "0.95 MOA (0.28 mrad)" or '' when not computable. */
export function fmtGroupAngle(groupSizeIn: number | undefined, distanceM: number | undefined): string {
  const moa = groupMoa(groupSizeIn, distanceM);
  if (moa == null) return '';
  return `${moa.toFixed(2)} MOA (${moaToMrad(moa).toFixed(2)} mrad)`;
}
