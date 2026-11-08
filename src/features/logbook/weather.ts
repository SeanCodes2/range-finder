// Open-Meteo current conditions → Conditions. api.open-meteo.com is the only host the CSP allows.
import { fToC, hPaToInHg, mToFt } from '@/app/geo';
import type { Conditions } from '@/store/types';

const BASE = 'https://api.open-meteo.com/v1/forecast';
const CURRENT = 'temperature_2m,relative_humidity_2m,surface_pressure,wind_speed_10m,wind_direction_10m';

export function openMeteoUrl(lat: number, lon: number): string {
  return `${BASE}?latitude=${lat.toFixed(5)}&longitude=${lon.toFixed(5)}&current=${CURRENT}` +
    `&temperature_unit=fahrenheit&wind_speed_unit=mph&pressure_unit=hPa`;
}

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const round = (v: number | undefined, dp: number) => (v == null ? undefined : Number(v.toFixed(dp)));

/** Pure parse of an Open-Meteo /v1/forecast response (current block + elevation). Throws on a malformed payload. */
export function parseOpenMeteo(json: unknown, now: number = Date.now()): Conditions {
  const root = json as { current?: Record<string, unknown>; elevation?: unknown } | null;
  const cur = root && typeof root === 'object' ? root.current : undefined;
  if (!cur || typeof cur !== 'object') throw new Error('Unexpected weather response');
  const pressureHPa = num(cur.surface_pressure);
  const elevM = num(root!.elevation);
  return {
    tempF: round(num(cur.temperature_2m), 1),
    pressureInHg: pressureHPa == null ? undefined : round(hPaToInHg(pressureHPa), 2),
    humidityPct: round(num(cur.relative_humidity_2m), 0),
    windMph: round(num(cur.wind_speed_10m), 1),
    windDirDeg: round(num(cur.wind_direction_10m), 0),
    altitudeFt: elevM == null ? undefined : round(mToFt(elevM), 0),
    source: 'open-meteo',
    fetchedAt: now,
  };
}

/** Fetch current conditions at a point. Rejects with a short, user-showable message. */
export async function fetchConditions(lat: number, lon: number): Promise<Conditions> {
  let res: Response;
  try {
    res = await fetch(openMeteoUrl(lat, lon), { signal: AbortSignal.timeout(12000) });
  } catch (e) {
    throw new Error((e as Error)?.name === 'TimeoutError' ? 'Weather request timed out' : 'No connection to weather service');
  }
  if (!res.ok) throw new Error(`Weather service error (${res.status})`);
  return parseOpenMeteo(await res.json());
}

/** One-line summary, e.g. "62°F · 29.9 inHg · 8 mph from 240°". Empty string when nothing is set. */
export function fmtConditions(c: Conditions | undefined, tempUnit: 'F' | 'C' = 'F'): string {
  if (!c) return '';
  const parts: string[] = [];
  if (c.tempF != null) parts.push(`${Math.round(tempUnit === 'C' ? fToC(c.tempF) : c.tempF)}°${tempUnit}`);
  if (c.pressureInHg != null) parts.push(`${c.pressureInHg.toFixed(1)} inHg`);
  if (c.windMph != null) parts.push(`${Math.round(c.windMph)} mph` + (c.windDirDeg != null ? ` from ${Math.round(c.windDirDeg)}°` : ''));
  else if (c.windDirDeg != null) parts.push(`wind from ${Math.round(c.windDirDeg)}°`);
  return parts.join(' · ');
}
