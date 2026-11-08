import { describe, expect, it } from 'vitest';
import { fromLocalInput, num, str, toLocalInput } from './fmt';

describe('datetime-local round trip', () => {
  it('round-trips to the minute in local time', () => {
    const ms = new Date(2026, 10, 7, 14, 5).getTime();
    expect(toLocalInput(ms)).toBe('2026-11-07T14:05');
    expect(fromLocalInput('2026-11-07T14:05')).toBe(ms);
  });
  it('rejects empty / garbage', () => {
    expect(fromLocalInput('')).toBeNull();
    expect(fromLocalInput('nope')).toBeNull();
  });
});

describe('num / str', () => {
  it('parses numbers and blanks', () => {
    expect(num('12.5')).toBe(12.5);
    expect(num('')).toBeUndefined();
    expect(num('  ')).toBeUndefined();
    expect(num('abc')).toBeUndefined();
  });
  it('formats with optional precision', () => {
    expect(str(undefined)).toBe('');
    expect(str(91.44, 1)).toBe('91.4');
    expect(str(100, 1)).toBe('100');
    expect(str(3)).toBe('3');
  });
});
