import { describe, expect, it } from 'vitest';
import type { Ammo, CleaningEvent, Rifle, ZeroEvent } from '@/store/types';
import { currentZeroM, fmtBc, inventoryTotals, inventoryValue, isLowStock, matchClickPreset, num, optNum, roundsSinceCleaning } from './gearLogic';

const rifle: Rifle = {
  id: 'r1', createdAt: 1, updatedAt: 1, name: 'Test', caliber: '6.5 CM', scopeHeightIn: 1.8,
  clickUnit: 'MRAD', clickValue: 0.1, zeroDistanceM: 91.44, roundCount: 1200,
};
const clean = (roundCountAt: number, createdAt: number): CleaningEvent => ({ id: 'c' + createdAt, createdAt, updatedAt: createdAt, rifleId: 'r1', roundCountAt });
const zero = (distanceM: number, createdAt: number, rifleId = 'r1'): ZeroEvent => ({ id: 'z' + createdAt, createdAt, updatedAt: createdAt, rifleId, distanceM });

describe('roundsSinceCleaning', () => {
  it('uses total when never cleaned', () => expect(roundsSinceCleaning(rifle, [])).toBe(1200));
  it('uses the latest cleaning by createdAt', () => {
    expect(roundsSinceCleaning(rifle, [clean(800, 10), clean(1000, 20), clean(500, 5)])).toBe(200);
  });
  it('ignores other rifles and never goes negative', () => {
    const other = { ...clean(1150, 30), rifleId: 'r2' };
    expect(roundsSinceCleaning(rifle, [other, clean(1000, 20)])).toBe(200);
    expect(roundsSinceCleaning(rifle, [clean(5000, 40)])).toBe(0);
  });
});

describe('currentZeroM', () => {
  it('falls back to rifle.zeroDistanceM', () => expect(currentZeroM(rifle, [])).toBe(91.44));
  it('uses newest zero event for this rifle', () => {
    expect(currentZeroM(rifle, [zero(182.88, 10), zero(91.44, 5), zero(300, 50, 'r2')])).toBe(182.88);
  });
});

describe('inventory', () => {
  const a = (onHand: number, costPerRound?: number): Ammo => ({
    id: 'a' + onHand, createdAt: 1, updatedAt: 1, name: 'x', caliber: 'c', bulletWeightGr: 140, bc: 0.3, dragModel: 'G7', muzzleVelocityFps: 2700, onHand, costPerRound,
  });
  it('flags low stock below 20', () => {
    expect(isLowStock(a(19))).toBe(true);
    expect(isLowStock(a(20))).toBe(false);
  });
  it('values only priced ammo', () => {
    expect(inventoryValue(a(10, 1.5))).toBe(15);
    expect(inventoryValue(a(10))).toBeUndefined();
    expect(inventoryTotals([a(10, 1.5), a(100), a(40, 2)])).toEqual({ rounds: 150, value: 95, priced: 2 });
  });
});

describe('parsing + formatting', () => {
  it('num / optNum', () => {
    expect(num('12.5')).toBe(12.5);
    expect(num('', 7)).toBe(7);
    expect(num('abc')).toBe(0);
    expect(optNum('')).toBeUndefined();
    expect(optNum(' ')).toBeUndefined();
    expect(optNum('3')).toBe(3);
  });
  it('fmtBc drops leading zero', () => expect(fmtBc(0.326)).toBe('.326'));
  it('matchClickPreset', () => {
    expect(matchClickPreset('MOA', 0.25)?.label).toBe('1/4 MOA');
    expect(matchClickPreset('MRAD', 0.1)?.label).toBe('0.1 MRAD');
    expect(matchClickPreset('MOA', 0.3)).toBeUndefined();
  });
});
