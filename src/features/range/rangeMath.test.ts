import { describe, expect, it } from 'vitest';
import {
  accClass, arrivedRadiusM, arrowRotation, continuousAngle, courseFromFixes, defaultStakeLabel,
  fmtDelta, fmtDistanceValue, headingFromOrientation, norm180, norm360, targetHint,
} from './rangeMath';

describe('angles', () => {
  it('norm360 wraps into 0..360', () => {
    expect(norm360(370)).toBe(10);
    expect(norm360(-10)).toBe(350);
    expect(norm360(720)).toBe(0);
  });
  it('norm180 gives the shortest signed turn', () => {
    expect(norm180(190)).toBe(-170);
    expect(norm180(-190)).toBe(170);
    expect(norm180(180)).toBe(180);
  });
  it('arrowRotation points up when facing the stake', () => {
    expect(arrowRotation(90, 90)).toBe(0);
    expect(arrowRotation(10, 350)).toBe(20);
    expect(arrowRotation(350, 10)).toBe(340);
    expect(arrowRotation(45, null)).toBe(45); // no heading: north-up
  });
  it('continuousAngle never spins the long way', () => {
    expect(continuousAngle(350, 10)).toBe(370);
    expect(continuousAngle(10, 350)).toBe(-10);
    expect(continuousAngle(720, 0)).toBe(720);
  });
});

describe('heading from orientation events', () => {
  it('prefers webkitCompassHeading', () => {
    expect(headingFromOrientation({ webkitCompassHeading: 123, alpha: 5, absolute: true })).toBe(123);
  });
  it('uses absolute alpha, inverted', () => {
    expect(headingFromOrientation({ alpha: 90, absolute: true })).toBe(270);
    expect(headingFromOrientation({ alpha: 0, absolute: true })).toBe(0);
  });
  it('rejects relative alpha and missing data', () => {
    expect(headingFromOrientation({ alpha: 90, absolute: false })).toBeNull();
    expect(headingFromOrientation({ alpha: null })).toBeNull();
    expect(headingFromOrientation({ webkitCompassHeading: NaN, alpha: null })).toBeNull();
  });
  it('compensates for screen rotation', () => {
    expect(headingFromOrientation({ webkitCompassHeading: 350, alpha: null }, 90)).toBe(80);
  });
});

describe('distance helpers', () => {
  it('accClass thresholds', () => {
    expect(accClass(3)).toBe('ok');
    expect(accClass(5)).toBe('ok');
    expect(accClass(12)).toBe('warn');
    expect(accClass(40)).toBe('bad');
    expect(accClass(null)).toBe('');
  });
  it('fmtDistanceValue', () => {
    expect(fmtDistanceValue(91.44, 'yd')).toBe('100');
    expect(fmtDistanceValue(5, 'm')).toBe('5.0');
  });
  it('targetHint', () => {
    const t100 = 91.44;
    expect(targetHint(60 * 0.9144, t100, 'yd')).toEqual({ text: '40.0 yd to go', tone: 'warn' });
    expect(targetHint(t100 + 0.5, t100, 'yd').tone).toBe('good');
    expect(targetHint(105 * 0.9144, t100, 'yd')).toEqual({ text: '5.0 yd too far', tone: 'bad' });
    expect(targetHint(97, 100, 'm')).toEqual({ text: '3.0 m to go', tone: 'warn' });
  });
  it('defaultStakeLabel rounds in display unit', () => {
    expect(defaultStakeLabel(91.6, 'yd')).toBe('100 yd');
    expect(defaultStakeLabel(199.6, 'm')).toBe('200 m');
  });
  it('fmtDelta signs', () => {
    expect(fmtDelta(100, 100, 'm')).toBe('0.0 m');
    expect(fmtDelta(101.3, 100, 'm')).toBe('+1.3 m');
    expect(fmtDelta(99.2, 100, 'm')).toBe('−0.8 m');
  });
  it('arrivedRadiusM is at least 2 m', () => {
    expect(arrivedRadiusM(1)).toBe(2);
    expect(arrivedRadiusM(7)).toBe(7);
  });
});

describe('courseFromFixes', () => {
  const a = { lat: 38.8, lon: -94.9, acc: 3, t: 1000 };
  it('needs movement over 1 m/s', () => {
    const slow = { ...a, lat: 38.800005, t: 2000 }; // ~0.55 m in 1 s
    expect(courseFromFixes(a, slow)).toBeNull();
  });
  it('returns bearing of travel when moving', () => {
    const north = { ...a, lat: 38.80002, t: 2000 }; // ~2.2 m north in 1 s
    const c = courseFromFixes(a, north);
    expect(c).not.toBeNull();
    expect(Math.abs(norm180(c! - 0))).toBeLessThan(1);
  });
  it('rejects bad ordering / nulls', () => {
    expect(courseFromFixes(null, a)).toBeNull();
    expect(courseFromFixes(a, { ...a, t: 500 })).toBeNull();
  });
});
