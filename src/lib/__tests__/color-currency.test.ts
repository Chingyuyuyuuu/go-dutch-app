import { oklchToHex, withAlpha } from '../color';
import { ALL_CURRENCY_CODES, getCurrency, matchesCurrency } from '../currency';

describe('oklchToHex', () => {
  it('converts reference colours', () => {
    expect(oklchToHex(1, 0, 0)).toBe('#ffffff');
    expect(oklchToHex(0, 0, 0)).toBe('#000000');
    expect(oklchToHex(0.627955, 0.257683, 29.2339)).toBe('#ff0000');
  });

  it('produces a warm cream for the default background', () => {
    // bg = oklch(0.945 0.03 85) — close to the design system's #f5ead8.
    expect(oklchToHex(0.945, 0.03, 85)).toMatch(/^#f[0-9a-f]e[0-9a-f]d[0-9a-f]$/);
  });

  it('adds alpha', () => {
    expect(withAlpha('#201e1d', 0.16)).toBe('rgba(32, 30, 29, 0.16)');
  });
});

describe('currencies', () => {
  it('uses ISO 4217 minor units', () => {
    expect(getCurrency('AUD').minorUnits).toBe(2);
    expect(getCurrency('JPY').minorUnits).toBe(0);
    expect(getCurrency('KRW').minorUnits).toBe(0);
    expect(getCurrency('VND').minorUnits).toBe(0);
    expect(getCurrency('BHD').minorUnits).toBe(3);
  });

  it('covers the full list, sorted, without funds or metals', () => {
    expect(ALL_CURRENCY_CODES.length).toBeGreaterThan(140);
    expect(ALL_CURRENCY_CODES).toEqual([...ALL_CURRENCY_CODES].sort());
    expect(ALL_CURRENCY_CODES).not.toContain('XAU');
  });

  it('searches code, English and Chinese names', () => {
    expect(matchesCurrency('AUD', 'aud')).toBe(true);
    expect(matchesCurrency('AUD', 'australian')).toBe(true);
    expect(matchesCurrency('AUD', '澳幣')).toBe(true);
    expect(matchesCurrency('AUD', 'yen')).toBe(false);
    expect(matchesCurrency('JPY', '')).toBe(true);
  });
});
