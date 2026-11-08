// Atmosphere model for the ballistics solver. Pure, no React.
// Takes the app's `Conditions` (imperial: °F, inHg station pressure, % RH, ft) and produces
// air density, density ratio vs ICAO standard, speed of sound and density altitude.
// Missing fields fall back to ICAO standard sea level (59 °F, 29.92 inHg, 0 % RH).
import type { Conditions } from '@/store/types';

export const ICAO = {
  tempF: 59,
  pressureInHg: 29.92126,
  humidityPct: 0,
  altitudeFt: 0,
  /** Standard sea-level air density, lb/ft³. */
  densityLbFt3: 0.0764742,
  /** Speed of sound at 59 °F, fps. */
  speedOfSoundFps: 1116.45,
} as const;

export interface Atmosphere {
  tempF: number;
  pressureInHg: number;
  humidityPct: number;
  /** Air density, lb/ft³. */
  densityLbFt3: number;
  /** density / ICAO standard density. 1.0 at standard. */
  densityRatio: number;
  /** Speed of sound in this air, fps. */
  speedOfSoundFps: number;
  /** Density altitude, ft. */
  densityAltitudeFt: number;
}

const R_DRY = 287.058; // J/(kg·K)
const R_VAP = 461.495;
const GAMMA = 1.4;
const KG_M3_TO_LB_FT3 = 0.0624279606;
const MPS_TO_FPS = 1 / 0.3048;

export const fToK = (f: number) => (f - 32) * 5 / 9 + 273.15;
export const inHgToPa = (p: number) => p * 3386.389;

/** Saturation vapour pressure (Pa) over water, Tetens formula. tC in °C. */
export function saturationVaporPressurePa(tC: number): number {
  return 610.78 * Math.pow(10, (7.5 * tC) / (tC + 237.3));
}

/** ICAO standard pressure (inHg) at a geopotential altitude in ft. */
export function standardPressureAtAltitudeInHg(altFt: number): number {
  return ICAO.pressureInHg * Math.pow(1 - 6.87535e-6 * altFt, 5.2559);
}

/** ICAO standard temperature (°F) at altitude in ft (lapse 3.566 °F / 1000 ft). */
export function standardTempAtAltitudeF(altFt: number): number {
  return ICAO.tempF - 0.003566 * altFt;
}

/**
 * Density altitude (ft) from a density ratio, using the standard-atmosphere inversion
 * 145442.16 * (1 - sigma^0.234969).
 */
export function densityAltitudeFt(densityRatio: number): number {
  return 145442.16 * (1 - Math.pow(densityRatio, 0.234969));
}

/**
 * Build an atmosphere from (possibly incomplete) conditions.
 * Rules: station pressure wins over altitude. If pressure is missing but altitude is given,
 * standard pressure at that altitude is used. If temperature is missing and altitude is given,
 * standard temperature at that altitude is used. Humidity defaults to 0 %.
 */
export function atmosphereFrom(c: Conditions | undefined | null): Atmosphere {
  const altFt = c?.altitudeFt ?? ICAO.altitudeFt;
  const tempF = isNum(c?.tempF) ? c!.tempF! : (isNum(c?.altitudeFt) ? standardTempAtAltitudeF(altFt) : ICAO.tempF);
  const pressureInHg = isNum(c?.pressureInHg) ? c!.pressureInHg! : (isNum(c?.altitudeFt) ? standardPressureAtAltitudeInHg(altFt) : ICAO.pressureInHg);
  const humidityPct = clamp(isNum(c?.humidityPct) ? c!.humidityPct! : ICAO.humidityPct, 0, 100);
  return computeAtmosphere(tempF, pressureInHg, humidityPct);
}

export function computeAtmosphere(tempF: number, pressureInHg: number, humidityPct: number): Atmosphere {
  const T = fToK(tempF);
  const tC = T - 273.15;
  const P = inHgToPa(pressureInHg);
  const pv = Math.min(P, (humidityPct / 100) * saturationVaporPressurePa(tC));
  const pd = P - pv;
  const rhoKg = pd / (R_DRY * T) + pv / (R_VAP * T);
  const densityLbFt3 = rhoKg * KG_M3_TO_LB_FT3;
  const densityRatio = densityLbFt3 / ICAO.densityLbFt3;
  // Speed of sound: dry-air form (what JBM and most solvers use); the humidity effect is <0.5 %.
  const speedOfSoundFps = Math.sqrt(GAMMA * R_DRY * T) * MPS_TO_FPS;
  return {
    tempF, pressureInHg, humidityPct, densityLbFt3, densityRatio, speedOfSoundFps,
    densityAltitudeFt: densityAltitudeFt(densityRatio),
  };
}

export const STANDARD_ATMOSPHERE: Atmosphere = computeAtmosphere(ICAO.tempF, ICAO.pressureInHg, ICAO.humidityPct);

/** Conditions object representing ICAO standard, for the "Standard" reset button. */
export const STANDARD_CONDITIONS: Conditions = {
  tempF: ICAO.tempF, pressureInHg: 29.92, humidityPct: 0, windMph: 0, windDirDeg: 0, altitudeFt: 0, source: 'manual',
};

function isNum(v: unknown): v is number { return typeof v === 'number' && Number.isFinite(v); }
function clamp(v: number, lo: number, hi: number) { return Math.min(hi, Math.max(lo, v)); }
