import { describe, expect, it } from 'vitest';
import { barrelLifeFor, barrelLifeFraction, normalizeCaliber } from './barrelLife';

describe('normalizeCaliber', () => {
  it('strips punctuation, whitespace and case', () => {
    expect(normalizeCaliber('.308 Win')).toBe('308');
    expect(normalizeCaliber('308 WIN')).toBe('308');
    expect(normalizeCaliber(' .308 ')).toBe('308');
    expect(normalizeCaliber('.223 Rem')).toBe('223');
  });
  it('handles metric designations', () => {
    expect(normalizeCaliber('5.56 NATO')).toBe('556');
    expect(normalizeCaliber('5.56x45mm')).toBe('556');
    expect(normalizeCaliber('7.62x51')).toBe('762');
    expect(normalizeCaliber('6.5 CM')).toBe('65cm');
    expect(normalizeCaliber('6.5mm Creedmoor')).toBe('65creedmoor');
    expect(normalizeCaliber('6mm Creedmoor')).toBe('6creedmoor');
    expect(normalizeCaliber('6 Creed')).toBe('6creedmoor');
  });
  it('maps magnum aliases', () => {
    expect(normalizeCaliber('300 WM')).toBe('300winmag');
    expect(normalizeCaliber('.300 Win Mag')).toBe('300winmag');
    expect(normalizeCaliber('.338 Lapua Mag')).toBe('338lapua');
    expect(normalizeCaliber('7mm Rem Mag')).toBe('7remmag');
  });
});

describe('barrelLifeFor', () => {
  it('finds common calibers regardless of spelling', () => {
    expect(barrelLifeFor('.308 Win')?.rounds).toBe(8000);
    expect(barrelLifeFor('308')?.rounds).toBe(8000);
    expect(barrelLifeFor('7.62 NATO')?.rounds).toBe(8000);
    expect(barrelLifeFor('.223')?.rounds).toBe(15000);
    expect(barrelLifeFor('5.56')?.rounds).toBe(15000);
    expect(barrelLifeFor('6.5 Creedmoor')?.rounds).toBe(3000);
    expect(barrelLifeFor('6.5 CM')?.rounds).toBe(3000);
    expect(barrelLifeFor('6mm Creedmoor')?.rounds).toBe(2000);
    expect(barrelLifeFor('6.5 PRC')?.rounds).toBe(2000);
    expect(barrelLifeFor('.300 Win Mag')?.rounds).toBe(2500);
    expect(barrelLifeFor('300 WM')?.rounds).toBe(2500);
  });
  it('tolerates a trailing qualifier', () => {
    expect(barrelLifeFor('6.5 Creedmoor Match')?.rounds).toBe(3000);
  });
  it('returns undefined for rimfire, pistol and unknowns', () => {
    expect(barrelLifeFor('.22 LR')).toBeUndefined();
    expect(barrelLifeFor('9mm')).toBeUndefined();
    expect(barrelLifeFor('')).toBeUndefined();
    expect(barrelLifeFor('banana')).toBeUndefined();
  });
});

describe('barrelLifeFraction', () => {
  it('clamps to 0..1', () => {
    expect(barrelLifeFraction(0, 3000)).toBe(0);
    expect(barrelLifeFraction(1500, 3000)).toBe(0.5);
    expect(barrelLifeFraction(9000, 3000)).toBe(1);
    expect(barrelLifeFraction(-5, 3000)).toBe(0);
    expect(barrelLifeFraction(100, 0)).toBe(0);
  });
});
