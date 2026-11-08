import { describe, expect, it } from 'vitest';
import { fmtGroupAngle, groupMoa, moaToMrad } from './moa';
import { ydToM } from '@/app/geo';

describe('groupMoa', () => {
  it('1.047 in at 100 yd is 1 MOA', () => {
    expect(groupMoa(1.047, ydToM(100))).toBeCloseTo(1, 6);
  });
  it('1 in at 100 yd is ~0.955 MOA', () => {
    expect(groupMoa(1, ydToM(100))).toBeCloseTo(0.9551, 3);
  });
  it('scales with distance', () => {
    expect(groupMoa(2.094, ydToM(200))).toBeCloseTo(1, 6);
    expect(groupMoa(0.5, ydToM(50))).toBeCloseTo(0.9551, 3);
  });
  it('returns null when not computable', () => {
    expect(groupMoa(undefined, 100)).toBeNull();
    expect(groupMoa(1, undefined)).toBeNull();
    expect(groupMoa(1, 0)).toBeNull();
    expect(groupMoa(-1, 100)).toBeNull();
    expect(groupMoa(NaN, 100)).toBeNull();
  });
});

describe('moaToMrad / fmtGroupAngle', () => {
  it('converts 1 MOA to ~0.291 mrad', () => {
    expect(moaToMrad(1)).toBeCloseTo(0.2909, 3);
  });
  it('formats both units', () => {
    expect(fmtGroupAngle(1.047, ydToM(100))).toBe('1.00 MOA (0.29 mrad)');
    expect(fmtGroupAngle(undefined, 100)).toBe('');
  });
});
