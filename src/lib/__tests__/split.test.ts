import { splitEvenly } from '../split';

describe('splitEvenly', () => {
  it('gives the remainder to the first people, one minor unit each', () => {
    expect(splitEvenly(1000, 3)).toEqual([334, 333, 333]);
    expect(splitEvenly(1002, 4)).toEqual([251, 251, 250, 250]);
  });

  it('always adds up to the total', () => {
    for (const total of [0, 1, 7, 4800, 99999]) {
      for (let n = 1; n <= 7; n++) {
        const shares = splitEvenly(total, n);
        expect(shares.reduce((a, b) => a + b, 0)).toBe(total);
        expect(Math.max(...shares) - Math.min(...shares)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('rejects invalid input', () => {
    expect(() => splitEvenly(100, 0)).toThrow();
    expect(() => splitEvenly(10.5, 2)).toThrow();
    expect(() => splitEvenly(-1, 2)).toThrow();
  });
});
