import { describe, expect, it } from 'vitest';
import { fmtConditions, openMeteoUrl, parseOpenMeteo } from './weather';

const sample = {
  latitude: 38.81, longitude: -94.93, generationtime_ms: 0.1, utc_offset_seconds: -21600,
  timezone: 'GMT', timezone_abbreviation: 'GMT', elevation: 320.0,
  current_units: {
    time: 'iso8601', interval: 'seconds', temperature_2m: '°F', relative_humidity_2m: '%',
    surface_pressure: 'hPa', wind_speed_10m: 'mp/h', wind_direction_10m: '°',
  },
  current: {
    time: '2026-11-07T15:00', interval: 900, temperature_2m: 61.7, relative_humidity_2m: 43,
    surface_pressure: 1012.4, wind_speed_10m: 8.3, wind_direction_10m: 241,
  },
};

describe('parseOpenMeteo', () => {
  it('maps the current block and elevation into Conditions', () => {
    const c = parseOpenMeteo(sample, 1_700_000_000_000);
    expect(c.tempF).toBe(61.7);
    expect(c.humidityPct).toBe(43);
    expect(c.pressureInHg).toBeCloseTo(29.9, 1); // 1012.4 hPa
    expect(c.windMph).toBe(8.3);
    expect(c.windDirDeg).toBe(241);
    expect(c.altitudeFt).toBe(1050); // 320 m
    expect(c.source).toBe('open-meteo');
    expect(c.fetchedAt).toBe(1_700_000_000_000);
  });
  it('leaves missing fields undefined', () => {
    const c = parseOpenMeteo({ current: { temperature_2m: 50 } }, 1);
    expect(c.tempF).toBe(50);
    expect(c.pressureInHg).toBeUndefined();
    expect(c.altitudeFt).toBeUndefined();
  });
  it('throws on a malformed payload', () => {
    expect(() => parseOpenMeteo({ error: true, reason: 'bad' })).toThrow();
    expect(() => parseOpenMeteo(null)).toThrow();
  });
});

describe('openMeteoUrl', () => {
  it('targets api.open-meteo.com with the expected params', () => {
    const u = openMeteoUrl(38.81234567, -94.9);
    expect(u.startsWith('https://api.open-meteo.com/v1/forecast?')).toBe(true);
    expect(u).toContain('latitude=38.81235');
    expect(u).toContain('temperature_unit=fahrenheit');
    expect(u).toContain('wind_speed_unit=mph');
    expect(u).toContain('pressure_unit=hPa');
  });
});

describe('fmtConditions', () => {
  it('formats a full set', () => {
    expect(fmtConditions({ tempF: 61.7, pressureInHg: 29.9, windMph: 8.3, windDirDeg: 240 })).toBe('62°F · 29.9 inHg · 8 mph from 240°');
  });
  it('converts to Celsius when asked', () => {
    expect(fmtConditions({ tempF: 32 }, 'C')).toBe('0°C');
  });
  it('is empty with no data', () => {
    expect(fmtConditions({})).toBe('');
    expect(fmtConditions(undefined)).toBe('');
  });
});
