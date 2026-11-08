// Point-mass 3-DOF trajectory solver. Pure, no React.
// Units: integration is done in imperial (ft, fps, lb) because BC and the drag tables are
// defined that way; the public API takes meters for ranges and inches for sight height.
import type { Ammo, ClickUnit, DragModel, Rifle } from '@/store/types';
import { type Atmosphere, STANDARD_ATMOSPHERE } from './atmosphere';

// ---------- Standard drag tables (Mach, Cd). Public-domain reference projectiles. ----------
const G1: [number, number][] = [
  [0.00, 0.2629], [0.05, 0.2558], [0.10, 0.2487], [0.15, 0.2413], [0.20, 0.2344], [0.25, 0.2278], [0.30, 0.2214], [0.35, 0.2155],
  [0.40, 0.2104], [0.45, 0.2061], [0.50, 0.2032], [0.55, 0.2020], [0.60, 0.2034], [0.70, 0.2165], [0.725, 0.2230], [0.75, 0.2313],
  [0.775, 0.2417], [0.80, 0.2546], [0.825, 0.2706], [0.85, 0.2901], [0.875, 0.3136], [0.90, 0.3415], [0.925, 0.3734], [0.95, 0.4084],
  [0.975, 0.4448], [1.0, 0.4805], [1.025, 0.5136], [1.05, 0.5427], [1.075, 0.5677], [1.10, 0.5883], [1.125, 0.6053], [1.15, 0.6191],
  [1.20, 0.6393], [1.25, 0.6518], [1.30, 0.6589], [1.35, 0.6621], [1.40, 0.6625], [1.45, 0.6607], [1.50, 0.6573], [1.55, 0.6528],
  [1.60, 0.6474], [1.65, 0.6413], [1.70, 0.6347], [1.75, 0.6280], [1.80, 0.6210], [1.85, 0.6141], [1.90, 0.6072], [1.95, 0.6003],
  [2.00, 0.5934], [2.05, 0.5867], [2.10, 0.5804], [2.15, 0.5743], [2.20, 0.5685], [2.25, 0.5630], [2.30, 0.5577], [2.35, 0.5527],
  [2.40, 0.5481], [2.45, 0.5438], [2.50, 0.5397], [2.60, 0.5325], [2.70, 0.5264], [2.80, 0.5211], [2.90, 0.5168], [3.00, 0.5133],
  [3.10, 0.5105], [3.20, 0.5084], [3.30, 0.5067], [3.40, 0.5054], [3.50, 0.5040], [3.60, 0.5030], [3.70, 0.5022], [3.80, 0.5016],
  [3.90, 0.5010], [4.00, 0.5006], [4.20, 0.4998], [4.40, 0.4995], [4.60, 0.4992], [4.80, 0.4990], [5.00, 0.4988],
];
const G7: [number, number][] = [
  [0.00, 0.1198], [0.05, 0.1197], [0.10, 0.1196], [0.15, 0.1194], [0.20, 0.1193], [0.25, 0.1194], [0.30, 0.1194], [0.35, 0.1194],
  [0.40, 0.1193], [0.45, 0.1193], [0.50, 0.1194], [0.55, 0.1193], [0.60, 0.1194], [0.65, 0.1197], [0.70, 0.1202], [0.725, 0.1207],
  [0.75, 0.1215], [0.775, 0.1226], [0.80, 0.1242], [0.825, 0.1266], [0.85, 0.1306], [0.875, 0.1368], [0.90, 0.1464], [0.925, 0.1660],
  [0.95, 0.2054], [0.975, 0.2993], [1.0, 0.3803], [1.025, 0.4015], [1.05, 0.4043], [1.075, 0.4034], [1.10, 0.4014], [1.125, 0.3987],
  [1.15, 0.3955], [1.20, 0.3884], [1.25, 0.3810], [1.30, 0.3732], [1.35, 0.3657], [1.40, 0.3580], [1.50, 0.3440], [1.55, 0.3376],
  [1.60, 0.3315], [1.65, 0.3260], [1.70, 0.3209], [1.75, 0.3160], [1.80, 0.3117], [1.85, 0.3078], [1.90, 0.3042], [1.95, 0.3010],
  [2.00, 0.2980], [2.05, 0.2951], [2.10, 0.2922], [2.15, 0.2892], [2.20, 0.2864], [2.25, 0.2835], [2.30, 0.2807], [2.35, 0.2779],
  [2.40, 0.2752], [2.45, 0.2725], [2.50, 0.2697], [2.55, 0.2670], [2.60, 0.2643], [2.65, 0.2615], [2.70, 0.2588], [2.75, 0.2561],
  [2.80, 0.2533], [2.85, 0.2506], [2.90, 0.2479], [2.95, 0.2451], [3.00, 0.2424], [3.10, 0.2368], [3.20, 0.2313], [3.30, 0.2258],
  [3.40, 0.2205], [3.50, 0.2154], [3.60, 0.2106], [3.70, 0.2060], [3.80, 0.2017], [3.90, 0.1975], [4.00, 0.1935], [4.20, 0.1861],
  [4.40, 0.1793], [4.60, 0.1730], [4.80, 0.1672], [5.00, 0.1618],
];
const TABLES: Record<DragModel, [number, number][]> = { G1, G7 };

/** Drag coefficient of the standard projectile at a given Mach number (linear interpolation). */
export function dragCd(model: DragModel, mach: number): number {
  const t = TABLES[model];
  if (mach <= t[0][0]) return t[0][1];
  const last = t[t.length - 1];
  if (mach >= last[0]) return last[1];
  // binary search
  let lo = 0, hi = t.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (t[mid][0] <= mach) lo = mid; else hi = mid; }
  const [m0, c0] = t[lo], [m1, c1] = t[hi];
  return c0 + ((mach - m0) / (m1 - m0)) * (c1 - c0);
}

// ---------- constants ----------
const G = 32.174; // ft/s²
const FT_PER_M = 1 / 0.3048;
const FPS_PER_MPH = 5280 / 3600;
/** ρ·π/(8·144) with ρ in lb/ft³, BC in lb/in² → deceleration = K·(ρ/ρ0)·Cd·v²/BC in ft/s². */
const K_DRAG = (0.0764742 * Math.PI) / (8 * 144);

export const inToMoa = (inches: number, rangeM: number) => rangeM <= 0 ? 0 : (Math.atan(inches / 12 / (rangeM * FT_PER_M)) * 180 / Math.PI) * 60;
export const inToMrad = (inches: number, rangeM: number) => rangeM <= 0 ? 0 : Math.atan(inches / 12 / (rangeM * FT_PER_M)) * 1000;
export const moaToIn = (moa: number, rangeM: number) => Math.tan((moa / 60) * Math.PI / 180) * rangeM * FT_PER_M * 12;
export const mradToIn = (mrad: number, rangeM: number) => Math.tan(mrad / 1000) * rangeM * FT_PER_M * 12;
export const moaToMrad = (moa: number) => (moa / 60) * (Math.PI / 180) * 1000;
export const mradToMoa = (mrad: number) => (mrad / 1000) * (180 / Math.PI) * 60;
export const energyFtLb = (weightGr: number, vFps: number) => (weightGr * vFps * vFps) / 450436;

/** Angle in the rifle's unit → whole clicks (nearest). */
export const toClicks = (angle: number, clickValue: number) => clickValue > 0 ? Math.round(angle / clickValue) : 0;

/**
 * Wind angle relative to the line of fire. 0 = headwind (from the target), 90 = full value from
 * the right, 180 = tailwind, 270 = full value from the left.
 */
export function windAngleFromBearings(windFromDeg: number, lineOfFireDeg: number): number {
  return ((windFromDeg - lineOfFireDeg) % 360 + 360) % 360;
}

// ---------- inputs / outputs ----------
export interface AmmoInput { bc: number; dragModel: DragModel; muzzleVelocityFps: number; bulletWeightGr: number }
export interface RifleInput { scopeHeightIn: number; zeroDistanceM: number }
export interface WindInput { speedMph: number; angleDeg: number }

export interface SolveOptions {
  ammo: AmmoInput;
  rifle: RifleInput;
  atmosphere?: Atmosphere;
  /** Atmosphere the rifle was zeroed in (defaults to the firing atmosphere). */
  zeroAtmosphere?: Atmosphere;
  wind?: WindInput;
  rangesM: number[];
  /** Integration step, seconds. Default 0.001 (1 ms). */
  dtS?: number;
}

export interface TrajectoryPoint {
  rangeM: number;
  /** Bullet path relative to line of sight, inches. Positive = above. */
  pathIn: number;
  /** -pathIn: positive = bullet below the line of sight. */
  dropIn: number;
  /** Elevation correction to put the bullet on the line of sight. Positive = come UP. */
  elevMoa: number;
  elevMrad: number;
  /** Lateral drift, inches. Positive = bullet drifted right. */
  driftIn: number;
  /** Wind correction. Positive = hold RIGHT (for a left drift). */
  windMoa: number;
  windMrad: number;
  velocityFps: number;
  energyFtLb: number;
  tofS: number;
  mach: number;
}

export interface SolveResult {
  points: TrajectoryPoint[];
  /** Launch angle above the line of sight, radians. */
  zeroAngleRad: number;
  /** Max range actually integrated before the bullet went subsonic+slow / fell too far. */
  maxRangeM: number;
}

// ---------- integration ----------
interface State { x: number; y: number; z: number; vx: number; vy: number; vz: number }

function deriv(s: State, k: number, model: DragModel, atm: Atmosphere, wx: number, wz: number) {
  const rvx = s.vx - wx, rvy = s.vy, rvz = s.vz - wz;
  const v = Math.sqrt(rvx * rvx + rvy * rvy + rvz * rvz);
  const cd = dragCd(model, v / atm.speedOfSoundFps);
  const a = k * atm.densityRatio * cd * v; // per-component factor
  return { dx: s.vx, dy: s.vy, dz: s.vz, dvx: -a * rvx, dvy: -a * rvy - G, dvz: -a * rvz };
}

function rk4(s: State, dt: number, k: number, model: DragModel, atm: Atmosphere, wx: number, wz: number): State {
  const d1 = deriv(s, k, model, atm, wx, wz);
  const s2 = adv(s, d1, dt / 2); const d2 = deriv(s2, k, model, atm, wx, wz);
  const s3 = adv(s, d2, dt / 2); const d3 = deriv(s3, k, model, atm, wx, wz);
  const s4 = adv(s, d3, dt); const d4 = deriv(s4, k, model, atm, wx, wz);
  return {
    x: s.x + dt / 6 * (d1.dx + 2 * d2.dx + 2 * d3.dx + d4.dx),
    y: s.y + dt / 6 * (d1.dy + 2 * d2.dy + 2 * d3.dy + d4.dy),
    z: s.z + dt / 6 * (d1.dz + 2 * d2.dz + 2 * d3.dz + d4.dz),
    vx: s.vx + dt / 6 * (d1.dvx + 2 * d2.dvx + 2 * d3.dvx + d4.dvx),
    vy: s.vy + dt / 6 * (d1.dvy + 2 * d2.dvy + 2 * d3.dvy + d4.dvy),
    vz: s.vz + dt / 6 * (d1.dvz + 2 * d2.dvz + 2 * d3.dvz + d4.dvz),
  };
}
function adv(s: State, d: ReturnType<typeof deriv>, h: number): State {
  return { x: s.x + d.dx * h, y: s.y + d.dy * h, z: s.z + d.dz * h, vx: s.vx + d.dvx * h, vy: s.vy + d.dvy * h, vz: s.vz + d.dvz * h };
}

interface Sample { x: number; y: number; z: number; v: number; t: number }

/**
 * Integrate until x reaches maxX ft (or the bullet is clearly done). Returns samples at every step.
 * y is relative to the line of sight (bore starts at -sightHeight).
 */
function integrate(opts: { ammo: AmmoInput; sightHeightFt: number; angleRad: number; atm: Atmosphere; wx: number; wz: number; maxXft: number; dt: number }): Sample[] {
  const { ammo, atm, wx, wz, dt, maxXft } = opts;
  const k = K_DRAG / Math.max(ammo.bc, 1e-4);
  let s: State = {
    x: 0, y: -opts.sightHeightFt, z: 0,
    vx: ammo.muzzleVelocityFps * Math.cos(opts.angleRad), vy: ammo.muzzleVelocityFps * Math.sin(opts.angleRad), vz: 0,
  };
  const out: Sample[] = [{ x: 0, y: s.y, z: 0, v: ammo.muzzleVelocityFps, t: 0 }];
  let t = 0;
  const maxT = 20;
  while (s.x < maxXft && t < maxT) {
    s = rk4(s, dt, k, ammo.dragModel, atm, wx, wz);
    t += dt;
    const v = Math.sqrt(s.vx * s.vx + s.vy * s.vy + s.vz * s.vz);
    out.push({ x: s.x, y: s.y, z: s.z, v, t });
    if (s.vx <= 1 || s.y < -3000) break; // stopped going downrange / fell ~3000 ft below LOS
  }
  return out;
}

function sampleAt(samples: Sample[], xFt: number): Sample | null {
  if (samples.length < 2 || xFt > samples[samples.length - 1].x) return null;
  // samples are monotonic in x while vx>0; binary search
  let lo = 0, hi = samples.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (samples[mid].x <= xFt) lo = mid; else hi = mid; }
  const a = samples[lo], b = samples[hi];
  const f = b.x === a.x ? 0 : (xFt - a.x) / (b.x - a.x);
  return { x: xFt, y: a.y + f * (b.y - a.y), z: a.z + f * (b.z - a.z), v: a.v + f * (b.v - a.v), t: a.t + f * (b.t - a.t) };
}

/** Find the launch angle (rad) that puts the bullet on the line of sight at the zero range. Secant iteration. */
export function solveZeroAngle(ammo: AmmoInput, rifle: RifleInput, atm: Atmosphere = STANDARD_ATMOSPHERE, dt = 0.001): number {
  const zeroFt = Math.max(rifle.zeroDistanceM, 1) * FT_PER_M;
  const sightFt = rifle.scopeHeightIn / 12;
  const f = (ang: number) => {
    const s = integrate({ ammo, sightHeightFt: sightFt, angleRad: ang, atm, wx: 0, wz: 0, maxXft: zeroFt, dt });
    const p = sampleAt(s, zeroFt);
    return p ? p.y : -1e9;
  };
  // Initial guesses: vacuum angle plus a bit.
  let a0 = 0, a1 = (sightFt / zeroFt) + (G * zeroFt) / (2 * ammo.muzzleVelocityFps * ammo.muzzleVelocityFps);
  let y0 = f(a0), y1 = f(a1);
  for (let i = 0; i < 25; i++) {
    if (Math.abs(y1) < 1e-5) break; // 0.00001 ft ≈ 0.0001 in
    const denom = y1 - y0;
    if (denom === 0) break;
    const a2 = a1 - y1 * (a1 - a0) / denom;
    a0 = a1; y0 = y1; a1 = a2; y1 = f(a1);
  }
  return a1;
}

/** Full solve: zero, then trajectory with wind, reported at the requested ranges. */
export function solveTrajectory(o: SolveOptions): SolveResult {
  const atm = o.atmosphere ?? STANDARD_ATMOSPHERE;
  const zeroAtm = o.zeroAtmosphere ?? atm;
  const dt = o.dtS ?? 0.001;
  const angle = solveZeroAngle(o.ammo, o.rifle, zeroAtm, dt);
  const ranges = [...o.rangesM].filter(r => r >= 0);
  const maxFt = Math.max(1, ...ranges) * FT_PER_M + 1;
  const w = o.wind?.speedMph ?? 0;
  const th = ((o.wind?.angleDeg ?? 90) * Math.PI) / 180;
  // Wind FROM angle th (0 = from the target = headwind). Vector points the opposite way.
  const wx = -w * FPS_PER_MPH * Math.cos(th);
  const wz = -w * FPS_PER_MPH * Math.sin(th);
  const samples = integrate({ ammo: o.ammo, sightHeightFt: o.rifle.scopeHeightIn / 12, angleRad: angle, atm, wx, wz, maxXft: maxFt, dt });
  const maxRangeM = samples[samples.length - 1].x / FT_PER_M;
  const points: TrajectoryPoint[] = [];
  for (const rangeM of ranges) {
    const p = sampleAt(samples, rangeM * FT_PER_M);
    if (!p) continue;
    const pathIn = p.y * 12;
    const driftIn = p.z * 12;
    points.push({
      rangeM, pathIn, dropIn: -pathIn,
      elevMoa: inToMoa(-pathIn, rangeM), elevMrad: inToMrad(-pathIn, rangeM),
      driftIn, windMoa: inToMoa(-driftIn, rangeM), windMrad: inToMrad(-driftIn, rangeM),
      velocityFps: p.v, energyFtLb: energyFtLb(o.ammo.bulletWeightGr, p.v), tofS: p.t, mach: p.v / atm.speedOfSoundFps,
    });
  }
  return { points, zeroAngleRad: angle, maxRangeM };
}

export const toAmmoInput = (a: Ammo): AmmoInput => ({ bc: a.bc, dragModel: a.dragModel, muzzleVelocityFps: a.muzzleVelocityFps, bulletWeightGr: a.bulletWeightGr });
export const toRifleInput = (r: Rifle): RifleInput => ({ scopeHeightIn: r.scopeHeightIn, zeroDistanceM: r.zeroDistanceM });

// ---------- truing ----------
export interface TrueMvOptions {
  ammo: AmmoInput;
  rifle: RifleInput;
  atmosphere?: Atmosphere;
  /** Distance at which the hold was observed. */
  distanceM: number;
  /** Observed elevation hold that centred the group (positive = up). */
  observed: number;
  observedUnit: ClickUnit | 'in';
  minMvFps?: number;
  maxMvFps?: number;
}

export interface TrueMvResult {
  mvFps: number;
  /** Elevation predicted with the new MV, in the observed unit (should match `observed`). */
  predicted: number;
  converged: boolean;
}

/** Back-solve muzzle velocity from an observed elevation hold at a distance. Bisection (drop is monotonic in MV). */
export function trueMuzzleVelocity(o: TrueMvOptions): TrueMvResult {
  const atm = o.atmosphere ?? STANDARD_ATMOSPHERE;
  const elevAt = (mv: number) => {
    const r = solveTrajectory({ ammo: { ...o.ammo, muzzleVelocityFps: mv }, rifle: o.rifle, atmosphere: atm, rangesM: [o.distanceM], dtS: 0.002 });
    const p = r.points[0];
    if (!p) return Number.POSITIVE_INFINITY; // bullet never got there: treat as huge hold
    return o.observedUnit === 'MOA' ? p.elevMoa : o.observedUnit === 'MRAD' ? p.elevMrad : p.dropIn;
  };
  // f(mv) = predicted - observed; decreasing in mv.
  let lo = o.minMvFps ?? 400, hi = o.maxMvFps ?? 6000;
  let fLo = elevAt(lo) - o.observed, fHi = elevAt(hi) - o.observed;
  if (fLo < 0) return { mvFps: lo, predicted: fLo + o.observed, converged: false };
  if (fHi > 0) return { mvFps: hi, predicted: fHi + o.observed, converged: false };
  let mid = (lo + hi) / 2, fMid = 0;
  for (let i = 0; i < 40; i++) {
    mid = (lo + hi) / 2;
    fMid = elevAt(mid) - o.observed;
    if (Math.abs(hi - lo) < 0.5) break;
    if (fMid > 0) lo = mid; else hi = mid;
  }
  return { mvFps: Math.round(mid), predicted: fMid + o.observed, converged: true };
}
