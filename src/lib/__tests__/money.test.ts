import {
  fitInputToDecimals,
  formatAmountNumber,
  formatInput,
  formatMinorNumber,
  formatMoney,
  formatMoneyExact,
  formatSignedMoney,
  inputDecimals,
  inputToMinor,
  isoDecimals,
  minorToInput,
  minorToTypedInput,
  pressKey,
  sanitizeAmountText,
  type KeypadKey,
} from '../money';

const type = (keys: KeypadKey[], decimals: number) => keys.reduce((acc, k) => pressKey(acc, k, decimals), '');

describe('formatMoney', () => {
  it('formats with the ledger currency symbol and en-AU grouping', () => {
    expect(formatMoney('AUD', 123450)).toBe('$1,234.50');
    expect(formatMoney('AUD', 5)).toBe('$0.05');
    expect(formatMoney('JPY', 250000)).toBe('¥250,000');
    expect(formatMoney('TWD', 30000)).toBe('NT$300');
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

  it('shows TWD to the dollar, keeping the stored cents out of sight', () => {
    expect(formatMoney('TWD', 70060)).toBe('NT$701');
    expect(formatMoney('TWD', 70049)).toBe('NT$700');
    expect(formatMoney('TWD', 1250)).toBe('NT$13');
    expect(formatSignedMoney('TWD', -70060)).toBe('−NT$701');
    expect(formatAmountNumber('TWD', 123456789)).toBe('1,234,568');
  });

  it('rounds shown amounts down or up when asked', () => {
    expect(formatMoney('TWD', 33334, { round: 'floor' })).toBe('NT$333');
    expect(formatMoney('TWD', 33333, { round: 'ceil' })).toBe('NT$334');
    expect(formatMoney('AUD', 33333, { round: 'ceil' })).toBe('$333.33');
  });

  it('shows all ISO decimals when exact', () => {
    expect(formatMoneyExact('TWD', 70060)).toBe('NT$700.60');
    expect(formatMoneyExact('JPY', 3333)).toBe('¥3,333');
  });
});

describe('TWD input', () => {
  it('types whole dollars and stores cents', () => {
    expect(inputDecimals('TWD')).toBe(0);
    expect(isoDecimals('TWD')).toBe(2);
    expect(type(['1', '.', '0', '0', '0'], inputDecimals('TWD'))).toBe('1000');
    expect(inputToMinor('1000', isoDecimals('TWD'))).toBe(100000);
  });

  it('prefills the shown amount', () => {
    expect(minorToTypedInput(70060, 'TWD')).toBe('701');
    expect(minorToTypedInput(1250, 'AUD')).toBe('12.5');
    expect(minorToInput(1250, isoDecimals('TWD'))).toBe('12.5');
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

describe('sanitizeAmountText', () => {
  it('keeps digits and one point, capped to the currency decimals', () => {
    expect(sanitizeAmountText('12.345', 2)).toBe('12.34');
    expect(sanitizeAmountText('1,234.5', 2)).toBe('1234.5');
    expect(sanitizeAmountText('1.2.3', 2)).toBe('1.23');
    expect(sanitizeAmountText('.5', 2)).toBe('0.5');
    expect(sanitizeAmountText('007', 2)).toBe('7');
    expect(sanitizeAmountText('abc', 2)).toBe('');
  });

  it('drops the decimals for zero-decimal currencies', () => {
    expect(sanitizeAmountText('1500.5', 0)).toBe('1500');
  });

  it('caps the integer part', () => {
    expect(sanitizeAmountText('12345678901', 2)).toBe('123456789');
  });
});
