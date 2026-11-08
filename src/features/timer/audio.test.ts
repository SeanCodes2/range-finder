import { describe, it, expect } from 'vitest';
import { detectShot, initialDetectState, markBeep, cfgFor, measure, splitsOf, summarize, thresholdFor, randomDelayMs } from './audio';

const cfg = { threshold: 0.35, deadMs: 120, beepMaskMs: 350 };

describe('detectShot', () => {
  it('fires when peak meets threshold and nothing masks it', () => {
    const r = detectShot(0.5, 1000, initialDetectState(), cfg);
    expect(r.shot).toBe(true);
    expect(r.state.lastShotAt).toBe(1000);
  });
  it('ignores peaks below threshold and leaves state untouched', () => {
    const s = initialDetectState();
    const r = detectShot(0.34, 1000, s, cfg);
    expect(r.shot).toBe(false);
    expect(r.state).toBe(s);
  });
  it('treats NaN peak as no shot', () => {
    expect(detectShot(NaN, 1000, initialDetectState(), cfg).shot).toBe(false);
  });
  it('enforces dead time after a shot', () => {
    let s = initialDetectState();
    let r = detectShot(0.9, 1000, s, cfg); s = r.state;
    expect(r.shot).toBe(true);
    r = detectShot(0.9, 1000 + 119, s, cfg); s = r.state;
    expect(r.shot).toBe(false);
    expect(s.lastShotAt).toBe(1000); // dead-time rejections do not extend the window
    r = detectShot(0.9, 1000 + 120, s, cfg);
    expect(r.shot).toBe(true);
  });
  it('masks the window right after our own beep', () => {
    let s = markBeep(initialDetectState(), 5000);
    expect(detectShot(1, 5000, s, cfg).shot).toBe(false);
    expect(detectShot(1, 5349, s, cfg).shot).toBe(false);
    const r = detectShot(1, 5350, s, cfg);
    expect(r.shot).toBe(true);
    s = r.state;
    expect(s.lastBeepAt).toBe(5000);
  });
  it('a par beep mid-run masks again without clearing shot history', () => {
    let s = initialDetectState();
    s = detectShot(1, 1000, s, cfg).state;
    s = markBeep(s, 3000);
    expect(s.lastShotAt).toBe(1000);
    expect(detectShot(1, 3100, s, cfg).shot).toBe(false);
    expect(detectShot(1, 3400, s, cfg).shot).toBe(true);
  });
  it('sensitivity thresholds are ordered high < med < low', () => {
    expect(thresholdFor('high')).toBeLessThan(thresholdFor('med'));
    expect(thresholdFor('med')).toBeLessThan(thresholdFor('low'));
    expect(cfgFor('med').threshold).toBe(thresholdFor('med'));
  });
});

describe('measure', () => {
  it('computes peak and rms', () => {
    const m = measure([0, 0.5, -1, 0.5]);
    expect(m.peak).toBe(1);
    expect(m.rms).toBeCloseTo(Math.sqrt((0 + 0.25 + 1 + 0.25) / 4));
  });
  it('handles empty buffers', () => {
    expect(measure([])).toEqual({ peak: 0, rms: 0 });
  });
});

describe('splits and summary', () => {
  it('splitsOf gives first-shot time then deltas', () => {
    expect(splitsOf([1.2, 1.5, 2.1])).toEqual([1.2, 0.3, 0.6].map(x => expect.closeTo(x, 9)));
  });
  it('summarize', () => {
    const s = summarize([1.0, 1.4, 2.0]);
    expect(s.shots).toBe(3);
    expect(s.firstS).toBe(1.0);
    expect(s.totalS).toBe(2.0);
    expect(s.avgSplitS).toBeCloseTo(0.5);
    expect(summarize([]).firstS).toBeNull();
    expect(summarize([0.9]).avgSplitS).toBeNull();
  });
});

describe('randomDelayMs', () => {
  it('stays within range and tolerates swapped bounds', () => {
    for (let i = 0; i < 50; i++) {
      const d = randomDelayMs(4, 1);
      expect(d).toBeGreaterThanOrEqual(1000);
      expect(d).toBeLessThanOrEqual(4000);
    }
    expect(randomDelayMs(2, 2)).toBe(2000);
  });
});
