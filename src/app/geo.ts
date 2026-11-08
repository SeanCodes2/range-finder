// Geodesy + unit helpers shared by features.
import type { GeoPoint } from '@/store/types';

const R = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Haversine great-circle distance in meters. */
export function distanceM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Initial bearing from a to b, degrees true, 0..360. */
export function bearingDeg(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

export const compassPoint = (b: number) => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(b / 45) % 8];

/** Accuracy-weighted average of several fixes. */
export function averageFixes(pts: GeoPoint[]): GeoPoint {
  let w = 0, lat = 0, lon = 0, alt = 0, nAlt = 0;
  for (const p of pts) {
    const k = 1 / Math.max(p.acc, 1) ** 2;
    w += k; lat += p.lat * k; lon += p.lon * k;
    if (p.alt != null) { alt += p.alt; nAlt++; }
  }
  const acc = Math.min(...pts.map(p => p.acc)) / Math.sqrt(Math.max(1, pts.length / 2));
  return { lat: lat / w, lon: lon / w, acc, alt: nAlt ? alt / nAlt : undefined, t: Date.now() };
}

// ---- units ----
export const M_PER_YD = 0.9144;
export const M_PER_FT = 0.3048;
export const mToYd = (m: number) => m / M_PER_YD;
export const ydToM = (y: number) => y * M_PER_YD;
export const mToFt = (m: number) => m / M_PER_FT;
export const ftToM = (f: number) => f * M_PER_FT;
export const fpsToMps = (v: number) => v * M_PER_FT;
export const mpsToFps = (v: number) => v / M_PER_FT;
export const fToC = (f: number) => (f - 32) * 5 / 9;
export const cToF = (c: number) => c * 9 / 5 + 32;
export const inHgToHPa = (p: number) => p * 33.8639;
export const hPaToInHg = (p: number) => p / 33.8639;

export function fmtDistance(m: number, unit: 'yd' | 'm'): string {
  const v = unit === 'yd' ? mToYd(m) : m;
  return (v < 10 ? v.toFixed(1) : Math.round(v).toString()) + ' ' + unit;
}
