import { describe, expect, it } from 'vitest';
import { AMMO_PRESETS, findPreset, presetKey } from './presets';

describe('AMMO_PRESETS', () => {
  it('has unique keys and sane values', () => {
    const keys = new Set(AMMO_PRESETS.map(presetKey));
    expect(keys.size).toBe(AMMO_PRESETS.length);
    for (const p of AMMO_PRESETS) {
      expect(p.bulletWeightGr).toBeGreaterThan(30);
      expect(p.bc).toBeGreaterThan(0.1);
      expect(p.bc).toBeLessThan(1);
      expect(['G1', 'G7']).toContain(p.dragModel);
      expect(p.muzzleVelocityFps).toBeGreaterThan(2000);
      expect(p.muzzleVelocityFps).toBeLessThan(3500);
    }
  });
  it('finds by key', () => {
    const p = AMMO_PRESETS[0];
    expect(findPreset(presetKey(p))).toEqual(p);
    expect(findPreset('nope')).toBeUndefined();
  });
});
