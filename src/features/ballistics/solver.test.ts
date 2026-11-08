import { describe, expect, it } from 'vitest';
import { computeAtmosphere, STANDARD_ATMOSPHERE } from './atmosphere';
import { dragCd, energyFtLb, inToMoa, inToMrad, moaToMrad, mradToMoa, solveTrajectory, solveZeroAngle, toClicks, trueMuzzleVelocity, windAngleFromBearings } from './solver';

const yd = (y: number) => y * 0.9144;
const SMK175_G7 = { bc: 0.243, dragModel: 'G7' as const, muzzleVelocityFps: 2600, bulletWeightGr: 175 };
const ELDM140_G7 = { bc: 0.326, dragModel: 'G7' as const, muzzleVelocityFps: 2710, bulletWeightGr: 140 };
const RIFLE = { scopeHeightIn: 1.5, zeroDistanceM: yd(100) };

describe('drag tables', () => {
  it('interpolates and clamps', () => {
    expect(dragCd('G1', 1.0)).toBeCloseTo(0.4805, 4);
    expect(dragCd('G7', 1.0)).toBeCloseTo(0.3803, 4);
    expect(dragCd('G7', 2.025)).toBeCloseTo((0.2980 + 0.2951) / 2, 4);
    expect(dragCd('G1', -1)).toBeCloseTo(0.2629, 4);
    expect(dragCd('G1', 9)).toBeCloseTo(0.4988, 4);
  });
  it('G7 peaks just past Mach 1', () => {
    expect(dragCd('G7', 1.05)).toBeGreaterThan(dragCd('G7', 0.8));
    expect(dragCd('G7', 1.05)).toBeGreaterThan(dragCd('G7', 2.5));
  });
});

describe('angular helpers', () => {
  it('1 MOA is ~1.047 in at 100 yd, 1 MRAD is 3.6 in', () => {
    expect(inToMoa(1.047, yd(100))).toBeCloseTo(1, 2);
    expect(inToMrad(3.6, yd(100))).toBeCloseTo(1, 3);
    expect(moaToMrad(mradToMoa(1))).toBeCloseTo(1, 9);
    expect(mradToMoa(1)).toBeCloseTo(3.438, 3);
  });
  it('clicks round to nearest', () => {
    expect(toClicks(3.2, 0.25)).toBe(13);
    expect(toClicks(3.1, 0.25)).toBe(12);
    expect(toClicks(1.24, 0.1)).toBe(12);
    expect(toClicks(-2.3, 0.25)).toBe(-9);
    expect(toClicks(5, 0)).toBe(0);
  });
  it('energy', () => {
    expect(energyFtLb(175, 2600)).toBeCloseTo(2626, 0);
  });
  it('wind angle from bearings', () => {
    expect(windAngleFromBearings(90, 0)).toBe(90);
    expect(windAngleFromBearings(0, 90)).toBe(270);
    expect(windAngleFromBearings(10, 350)).toBe(20);
  });
});

describe('zero', () => {
  it('path crosses the line of sight at the zero range', () => {
    const r = solveTrajectory({ ammo: SMK175_G7, rifle: RIFLE, rangesM: [0, yd(100)] });
    expect(r.points[0].pathIn).toBeCloseTo(-1.5, 2);
    expect(Math.abs(r.points[1].pathIn)).toBeLessThan(0.01);
    expect(r.zeroAngleRad).toBeGreaterThan(0);
  });
  it('a 200 yd zero puts the bullet high at 100', () => {
    const r = solveTrajectory({ ammo: SMK175_G7, rifle: { ...RIFLE, zeroDistanceM: yd(200) }, rangesM: [yd(100), yd(200)] });
    expect(r.points[0].pathIn).toBeGreaterThan(1.5);
    expect(r.points[0].pathIn).toBeLessThan(3);
    expect(Math.abs(r.points[1].pathIn)).toBeLessThan(0.01);
  });
  it('zero angle is bigger for slower bullets', () => {
    expect(solveZeroAngle({ ...SMK175_G7, muzzleVelocityFps: 2000 }, RIFLE)).toBeGreaterThan(solveZeroAngle(SMK175_G7, RIFLE));
  });
});

describe('reference trajectories', () => {
  // Reference: JBM Ballistics run, 175 gr SMK, G1 0.496, 2650 fps, 1.9 in sight height, 100 yd zero,
  // 80 F / 29.92 inHg / 60 % RH. JBM elevation (MOA): 200 1.8, 300 4.4, 400 7.6, 500 11.1, 600 15.0,
  // 700 19.5, 800 24.5, 900 30.1, 1000 36.4.
  it('tracks a JBM run within 0.5 MOA to 1000 yd', () => {
    const atm = computeAtmosphere(80, 29.92, 60);
    const r = solveTrajectory({
      ammo: { bc: 0.496, dragModel: 'G1', muzzleVelocityFps: 2650, bulletWeightGr: 175 },
      rifle: { scopeHeightIn: 1.9, zeroDistanceM: yd(100) }, atmosphere: atm,
      rangesM: [200, 300, 400, 500, 600, 700, 800, 900, 1000].map(yd),
    });
    const jbm = [1.8, 4.4, 7.6, 11.1, 15.0, 19.5, 24.5, 30.1, 36.4];
    r.points.forEach((p, i) => expect(Math.abs(p.elevMoa - jbm[i])).toBeLessThan(0.5));
  });

  it('.308 175 SMK G7 .243 @ 2600, 100 yd zero, standard atmosphere', () => {
    const r = solveTrajectory({ ammo: SMK175_G7, rifle: RIFLE, rangesM: [yd(500), yd(1000)] });
    const [p500, p1000] = r.points;
    expect(p500.dropIn).toBeGreaterThan(55); expect(p500.dropIn).toBeLessThan(68);
    expect(p500.elevMoa).toBeGreaterThan(10.5); expect(p500.elevMoa).toBeLessThan(13);
    expect(p500.velocityFps).toBeGreaterThan(1700); expect(p500.velocityFps).toBeLessThan(1850);
    expect(p1000.elevMoa).toBeGreaterThan(38); expect(p1000.elevMoa).toBeLessThan(43);
    expect(p1000.velocityFps).toBeGreaterThan(1050); expect(p1000.velocityFps).toBeLessThan(1300);
    expect(p1000.tofS).toBeGreaterThan(1.6); expect(p1000.tofS).toBeLessThan(1.9);
    expect(p1000.mach).toBeLessThan(1.2);
    // consistency between unit columns
    expect(moaToMrad(p1000.elevMoa)).toBeCloseTo(p1000.elevMrad, 6);
  });

  it('6.5 CM 140 ELD-M G7 .326 @ 2710: 1000 yd 29-32 MOA', () => {
    const r = solveTrajectory({ ammo: ELDM140_G7, rifle: RIFLE, rangesM: [yd(1000)] });
    expect(r.points[0].elevMoa).toBeGreaterThan(29);
    expect(r.points[0].elevMoa).toBeLessThan(32);
    expect(r.points[0].velocityFps).toBeGreaterThan(1400);
    expect(r.points[0].velocityFps).toBeLessThan(1600);
  });

  it('thin air flattens the trajectory', () => {
    const sea = solveTrajectory({ ammo: SMK175_G7, rifle: RIFLE, rangesM: [yd(800)] }).points[0];
    const high = solveTrajectory({ ammo: SMK175_G7, rifle: RIFLE, atmosphere: computeAtmosphere(85, 24.9, 20), rangesM: [yd(800)] }).points[0];
    expect(high.elevMoa).toBeLessThan(sea.elevMoa - 1.5);
    expect(high.velocityFps).toBeGreaterThan(sea.velocityFps + 80);
  });

  it('ranges past where the bullet gets are omitted; energy and mach are populated', () => {
    const r = solveTrajectory({ ammo: SMK175_G7, rifle: RIFLE, rangesM: [yd(100), yd(50000)] });
    expect(r.points.length).toBe(1);
    expect(r.points[0].energyFtLb).toBeGreaterThan(2000);
    expect(r.points[0].mach).toBeGreaterThan(2);
  });
});

describe('wind', () => {
  it('10 mph full value from the right drifts the bullet left; hold is right', () => {
    const r = solveTrajectory({ ammo: SMK175_G7, rifle: RIFLE, wind: { speedMph: 10, angleDeg: 90 }, rangesM: [yd(500), yd(1000)] });
    const [p500, p1000] = r.points;
    expect(p500.driftIn).toBeLessThan(0);
    expect(p500.windMoa).toBeGreaterThan(3.5); expect(p500.windMoa).toBeLessThan(5);
    expect(p1000.windMoa).toBeGreaterThan(9); expect(p1000.windMoa).toBeLessThan(12.5);
  });
  it('wind from the left mirrors; head/tail wind has ~no lateral effect', () => {
    const right = solveTrajectory({ ammo: SMK175_G7, rifle: RIFLE, wind: { speedMph: 10, angleDeg: 90 }, rangesM: [yd(600)] }).points[0];
    const left = solveTrajectory({ ammo: SMK175_G7, rifle: RIFLE, wind: { speedMph: 10, angleDeg: 270 }, rangesM: [yd(600)] }).points[0];
    const head = solveTrajectory({ ammo: SMK175_G7, rifle: RIFLE, wind: { speedMph: 10, angleDeg: 0 }, rangesM: [yd(600)] }).points[0];
    expect(left.windMoa).toBeCloseTo(-right.windMoa, 3);
    expect(Math.abs(head.windMoa)).toBeLessThan(0.01);
  });
  it('half-value wind at 45 deg is ~70 % of full value', () => {
    const full = solveTrajectory({ ammo: SMK175_G7, rifle: RIFLE, wind: { speedMph: 10, angleDeg: 90 }, rangesM: [yd(600)] }).points[0];
    const half = solveTrajectory({ ammo: SMK175_G7, rifle: RIFLE, wind: { speedMph: 10, angleDeg: 45 }, rangesM: [yd(600)] }).points[0];
    expect(half.windMoa / full.windMoa).toBeGreaterThan(0.65);
    expect(half.windMoa / full.windMoa).toBeLessThan(0.75);
  });
  it('wind does not change elevation materially', () => {
    const calm = solveTrajectory({ ammo: SMK175_G7, rifle: RIFLE, rangesM: [yd(800)] }).points[0];
    const windy = solveTrajectory({ ammo: SMK175_G7, rifle: RIFLE, wind: { speedMph: 15, angleDeg: 90 }, rangesM: [yd(800)] }).points[0];
    expect(Math.abs(windy.elevMoa - calm.elevMoa)).toBeLessThan(0.3);
  });
});

describe('truing', () => {
  it('recovers the MV that produced an observed hold (MOA)', () => {
    const truth = solveTrajectory({ ammo: { ...SMK175_G7, muzzleVelocityFps: 2680 }, rifle: RIFLE, rangesM: [yd(800)] }).points[0];
    const t = trueMuzzleVelocity({ ammo: SMK175_G7, rifle: RIFLE, distanceM: yd(800), observed: truth.elevMoa, observedUnit: 'MOA' });
    expect(t.converged).toBe(true);
    expect(Math.abs(t.mvFps - 2680)).toBeLessThanOrEqual(3);
  });
  it('works in MRAD and inches, and in non-standard air', () => {
    const atm = computeAtmosphere(40, 25.1, 30);
    const truth = solveTrajectory({ ammo: ELDM140_G7, rifle: RIFLE, atmosphere: atm, rangesM: [yd(700)] }).points[0];
    const a = trueMuzzleVelocity({ ammo: { ...ELDM140_G7, muzzleVelocityFps: 2500 }, rifle: RIFLE, atmosphere: atm, distanceM: yd(700), observed: truth.elevMrad, observedUnit: 'MRAD' });
    const b = trueMuzzleVelocity({ ammo: { ...ELDM140_G7, muzzleVelocityFps: 2900 }, rifle: RIFLE, atmosphere: atm, distanceM: yd(700), observed: truth.dropIn, observedUnit: 'in' });
    expect(Math.abs(a.mvFps - 2710)).toBeLessThanOrEqual(3);
    expect(Math.abs(b.mvFps - 2710)).toBeLessThanOrEqual(3);
  });
  it('more observed drop means a lower trued MV', () => {
    const slow = trueMuzzleVelocity({ ammo: SMK175_G7, rifle: RIFLE, distanceM: yd(600), observed: 17, observedUnit: 'MOA' });
    const fast = trueMuzzleVelocity({ ammo: SMK175_G7, rifle: RIFLE, distanceM: yd(600), observed: 15, observedUnit: 'MOA' });
    expect(slow.mvFps).toBeLessThan(fast.mvFps);
  });
  it('flags out-of-range observations', () => {
    const t = trueMuzzleVelocity({ ammo: SMK175_G7, rifle: RIFLE, distanceM: yd(600), observed: -50, observedUnit: 'MOA' });
    expect(t.converged).toBe(false);
  });
});

describe('step size', () => {
  it('2 ms and 1 ms steps agree closely (RK4)', () => {
    const a = solveTrajectory({ ammo: SMK175_G7, rifle: RIFLE, rangesM: [yd(1000)], dtS: 0.001 }).points[0];
    const b = solveTrajectory({ ammo: SMK175_G7, rifle: RIFLE, rangesM: [yd(1000)], dtS: 0.002 }).points[0];
    expect(Math.abs(a.elevMoa - b.elevMoa)).toBeLessThan(0.05);
    expect(STANDARD_ATMOSPHERE.densityRatio).toBeCloseTo(1, 3);
  });
});
