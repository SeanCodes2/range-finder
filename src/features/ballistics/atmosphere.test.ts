import { describe, expect, it } from 'vitest';
import { ICAO, STANDARD_ATMOSPHERE, atmosphereFrom, computeAtmosphere, densityAltitudeFt, standardPressureAtAltitudeInHg, standardTempAtAltitudeF } from './atmosphere';

describe('atmosphere', () => {
  it('ICAO standard reproduces reference density and speed of sound', () => {
    expect(STANDARD_ATMOSPHERE.densityLbFt3).toBeCloseTo(ICAO.densityLbFt3, 4);
    expect(STANDARD_ATMOSPHERE.densityRatio).toBeCloseTo(1, 3);
    expect(STANDARD_ATMOSPHERE.speedOfSoundFps).toBeCloseTo(ICAO.speedOfSoundFps, 0);
    expect(Math.abs(STANDARD_ATMOSPHERE.densityAltitudeFt)).toBeLessThan(10);
  });

  it('matches a JBM reference run (80 F, 29.92 inHg, 60 % RH)', () => {
    const a = computeAtmosphere(80, 29.92, 60);
    // JBM: density 0.07265 lb/ft3, speed of sound 1138.9 fps
    expect(a.densityLbFt3).toBeGreaterThan(0.0722);
    expect(a.densityLbFt3).toBeLessThan(0.0732);
    expect(a.speedOfSoundFps).toBeCloseTo(1138.9, 0);
  });

  it('hot, humid air is thinner; cold dry air is denser', () => {
    expect(computeAtmosphere(95, 29.92, 80).densityRatio).toBeLessThan(0.95);
    expect(computeAtmosphere(0, 30.5, 10).densityRatio).toBeGreaterThan(1.1);
    expect(computeAtmosphere(95, 29.92, 80).densityAltitudeFt).toBeGreaterThan(2000);
  });

  it('standard lapse functions', () => {
    expect(standardPressureAtAltitudeInHg(0)).toBeCloseTo(29.92, 1);
    expect(standardPressureAtAltitudeInHg(5000)).toBeCloseTo(24.90, 1);
    expect(standardTempAtAltitudeF(5000)).toBeCloseTo(41.2, 0);
    expect(densityAltitudeFt(1)).toBeCloseTo(0, 5);
  });

  it('altitude-only conditions give standard atmosphere at that altitude', () => {
    const a = atmosphereFrom({ altitudeFt: 5000 });
    expect(a.densityAltitudeFt).toBeGreaterThan(4900);
    expect(a.densityAltitudeFt).toBeLessThan(5100);
  });

  it('station pressure wins over altitude', () => {
    const a = atmosphereFrom({ altitudeFt: 5000, pressureInHg: 29.92, tempF: 59, humidityPct: 0 });
    expect(a.densityRatio).toBeCloseTo(1, 3);
  });

  it('missing / null conditions fall back to standard', () => {
    expect(atmosphereFrom(undefined).densityRatio).toBeCloseTo(1, 3);
    expect(atmosphereFrom({}).densityRatio).toBeCloseTo(1, 3);
    expect(atmosphereFrom({ tempF: NaN }).densityRatio).toBeCloseTo(1, 3);
  });

  it('clamps humidity to 0..100', () => {
    expect(atmosphereFrom({ humidityPct: 250 }).humidityPct).toBe(100);
    expect(atmosphereFrom({ humidityPct: -5 }).humidityPct).toBe(0);
  });
});
