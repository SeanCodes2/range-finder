import { describe, expect, it } from 'vitest';
import { applyToAmmo, applyToRifle, inventoryMoves } from './inventory';
import type { Ammo, Rifle } from '@/store/types';

const sort = (ms: ReturnType<typeof inventoryMoves>) => [...ms].sort((a, b) => (a.kind + a.id).localeCompare(b.kind + b.id));

describe('inventoryMoves', () => {
  it('new group adds rounds to rifle and ammo', () => {
    expect(sort(inventoryMoves(null, { rifleId: 'r1', ammoId: 'a1', rounds: 5 }))).toEqual([
      { kind: 'ammo', id: 'a1', delta: 5 }, { kind: 'rifle', id: 'r1', delta: 5 },
    ]);
  });
  it('delete reverses', () => {
    expect(sort(inventoryMoves({ rifleId: 'r1', ammoId: 'a1', rounds: 5 }, null))).toEqual([
      { kind: 'ammo', id: 'a1', delta: -5 }, { kind: 'rifle', id: 'r1', delta: -5 },
    ]);
  });
  it('edit applies only the delta and drops zero moves', () => {
    expect(inventoryMoves({ rifleId: 'r1', ammoId: 'a1', rounds: 5 }, { rifleId: 'r1', ammoId: 'a1', rounds: 8 }))
      .toEqual(expect.arrayContaining([{ kind: 'rifle', id: 'r1', delta: 3 }, { kind: 'ammo', id: 'a1', delta: 3 }]));
    expect(inventoryMoves({ rifleId: 'r1', ammoId: 'a1', rounds: 5 }, { rifleId: 'r1', ammoId: 'a1', rounds: 5 })).toEqual([]);
  });
  it('re-attributing a session moves rounds between docs', () => {
    const ms = sort(inventoryMoves({ rifleId: 'r1', ammoId: 'a1', rounds: 20 }, { rifleId: 'r2', ammoId: 'a1', rounds: 20 }));
    expect(ms).toEqual([{ kind: 'rifle', id: 'r1', delta: -20 }, { kind: 'rifle', id: 'r2', delta: 20 }]);
  });
  it('ignores missing ids and non-finite rounds', () => {
    expect(inventoryMoves(null, { rounds: 5 })).toEqual([]);
    expect(inventoryMoves(null, { rifleId: 'r1', rounds: NaN })).toEqual([]);
    expect(inventoryMoves(null, { ammoId: 'a1', rounds: 3 })).toEqual([{ kind: 'ammo', id: 'a1', delta: 3 }]);
  });
});

describe('apply helpers', () => {
  it('rifle roundCount goes up, ammo onHand goes down', () => {
    const r = { roundCount: 100 } as Rifle;
    const a = { onHand: 40 } as Ammo;
    expect(applyToRifle(r, 5).roundCount).toBe(105);
    expect(applyToAmmo(a, 5).onHand).toBe(35);
    expect(applyToRifle(r, -5).roundCount).toBe(95);
    expect(applyToAmmo(a, -5).onHand).toBe(45);
  });
  it('treats missing counts as zero', () => {
    expect(applyToRifle({} as Rifle, 3).roundCount).toBe(3);
    expect(applyToAmmo({} as Ammo, 3).onHand).toBe(-3);
  });
});
