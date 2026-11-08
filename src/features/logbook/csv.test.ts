import { describe, expect, it } from 'vitest';
import { csvField, toCsv } from './csv';

describe('csvField', () => {
  it('passes plain values through', () => {
    expect(csvField('abc')).toBe('abc');
    expect(csvField(12.5)).toBe('12.5');
    expect(csvField(true)).toBe('true');
  });
  it('blanks null/undefined/NaN', () => {
    expect(csvField(null)).toBe('');
    expect(csvField(undefined)).toBe('');
    expect(csvField(NaN)).toBe('');
  });
  it('quotes commas, quotes and newlines', () => {
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('line1\nline2')).toBe('"line1\nline2"');
  });
});

describe('toCsv', () => {
  it('writes a header from first-seen keys and CRLF rows', () => {
    const out = toCsv([{ a: 1, b: 'x' }, { a: 2, b: 'y, z', c: 'extra' }]);
    expect(out).toBe('a,b,c\r\n1,x,\r\n2,"y, z",extra\r\n');
  });
  it('honours an explicit column order', () => {
    expect(toCsv([{ a: 1, b: 2 }], ['b', 'a'])).toBe('b,a\r\n2,1\r\n');
  });
  it('returns empty for no rows and no columns', () => {
    expect(toCsv([])).toBe('');
    expect(toCsv([], ['a'])).toBe('a\r\n');
  });
});
