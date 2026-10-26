import {
  fitInputToDecimals,
  formatInput,
  formatMinorNumber,
  formatMoney,
  formatSignedMoney,
  inputToMinor,
  minorToInput,
  pressKey,
  type KeypadKey,
} from '../money';

const type = (keys: KeypadKey[], decimals: number) => keys.reduce((acc, k) => pressKey(acc, k, decimals), '');

describe('formatMoney', () => {
  it('formats with the ledger currency symbol and en-AU grouping', () => {
    expect(formatMoney('AUD', 123450)).toBe('$1,234.50');
    expect(formatMoney('AUD', 5)).toBe('$0.05');
    expect(formatMoney('JPY', 250000)).toBe('¥250,000');
    expect(formatMoney('TWD', 30000)).toBe('NT$300.00');
    expect(formatMoney('CHF', 1000)).toBe('CHF 10.00');
    expect(formatMoney('BHD', 1234)).toBe('BHD 1.234');
  });

  it('adds a sign prefix', () => {
    expect(formatMoney('AUD', 420000, { sign: '+' })).toBe('+$4,200.00');
    expect(formatSignedMoney('AUD', -1200)).toBe('−$12.00');
    expect(formatSignedMoney('AUD', 0)).toBe('$0.00');
  });

  it('rejects non-integer amounts', () => {
    expect(() => formatMinorNumber(12.5, 2)).toThrow();
  });
});

describe('keypad input', () => {
  it('types digits and a decimal point', () => {
    expect(type(['4', '2', '.', '5'], 2)).toBe('42.5');
    expect(type(['.', '5'], 2)).toBe('0.5');
  });

  it('caps decimals at the currency minor units', () => {
    expect(type(['1', '.', '2', '3', '4'], 2)).toBe('1.23');
  });

  it('ignores the decimal key for zero-decimal currencies', () => {
    expect(type(['1', '.', '5'], 0)).toBe('15');
  });

  it('allows only one decimal point', () => {
    expect(type(['1', '.', '.', '2'], 2)).toBe('1.2');
  });

  it('caps the integer part at 9 digits', () => {
    expect(type(['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'], 2)).toBe('123456789');
  });

  it('drops a leading zero', () => {
    expect(type(['0', '0', '7'], 2)).toBe('7');
  });

  it('deletes the last character', () => {
    expect(pressKey('12.5', 'del', 2)).toBe('12.');
    expect(pressKey('', 'del', 2)).toBe('');
  });
});

describe('inputToMinor', () => {
  it('converts without floating point', () => {
    expect(inputToMinor('42.5', 2)).toBe(4250);
    expect(inputToMinor('0.1', 2)).toBe(10);
    expect(inputToMinor('19.99', 2)).toBe(1999);
    expect(inputToMinor('1.', 2)).toBe(100);
    expect(inputToMinor('2500', 0)).toBe(2500);
    expect(inputToMinor('', 2)).toBe(0);
    expect(inputToMinor('999999999.99', 2)).toBe(99999999999);
  });

  it('round-trips with minorToInput', () => {
    for (const minor of [1, 10, 1999, 4250, 100, 99999999999]) {
      expect(inputToMinor(minorToInput(minor, 2), 2)).toBe(minor);
    }
    expect(minorToInput(4250, 2)).toBe('42.5');
    expect(minorToInput(100, 2)).toBe('1');
    expect(minorToInput(2500, 0)).toBe('2500');
  });
});

describe('formatInput', () => {
  it('groups the integer part and keeps the typed decimals', () => {
    expect(formatInput('1234.5')).toBe('1,234.5');
    expect(formatInput('1234.')).toBe('1,234.');
    expect(formatInput('')).toBe('0');
  });
});

describe('fitInputToDecimals', () => {
  it('drops decimals when switching to a zero-decimal currency', () => {
    expect(fitInputToDecimals('42.50', 0)).toBe('42');
    expect(fitInputToDecimals('42.505', 2)).toBe('42.50');
    expect(fitInputToDecimals('42', 0)).toBe('42');
  });
});
