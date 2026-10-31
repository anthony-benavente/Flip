import { CM_PER_FOOT, CM_PER_INCH, formatArea, formatLength, parseLength, SQCM_PER_SQFT } from './units';

describe('formatLength', () => {
  it('formats feet and inches', () => {
    expect(formatLength(12 * CM_PER_FOOT + 6 * CM_PER_INCH, 'imperial')).toBe(`12' 6"`);
    expect(formatLength(14 * CM_PER_FOOT, 'imperial')).toBe(`14' 0"`);
    expect(formatLength(30 * CM_PER_INCH, 'imperial')).toBe(`2' 6"`);
    expect(formatLength(8 * CM_PER_INCH, 'imperial')).toBe(`8"`);
  });

  it('rounds to the nearest half inch and carries into feet', () => {
    expect(formatLength(4.5 * CM_PER_INCH, 'imperial')).toBe(`4.5"`);
    expect(formatLength(11.9 * CM_PER_INCH, 'imperial')).toBe(`1' 0"`);
  });

  it('formats metric', () => {
    expect(formatLength(381, 'metric')).toBe('3.81 m');
    expect(formatLength(45, 'metric')).toBe('45 cm');
    expect(formatLength(200, 'metric')).toBe('2.00 m');
  });
});

describe('formatArea', () => {
  it('formats square feet and square meters', () => {
    expect(formatArea(168 * SQCM_PER_SQFT, 'imperial')).toBe('168 sq ft');
    expect(formatArea(150000, 'metric')).toBe('15 m²');
  });
});

describe('parseLength', () => {
  const ft = (f: number, i = 0) => f * CM_PER_FOOT + i * CM_PER_INCH;

  it.each([
    [`12'6"`, ft(12, 6)],
    [`12' 6"`, ft(12, 6)],
    [`12' 6`, ft(12, 6)],
    ['12 6', ft(12, 6)],
    ['12ft 6in', ft(12, 6)],
    [`12.5'`, ft(12.5)],
    ['30"', ft(0, 30)],
    ['30in', ft(0, 30)],
    ['12', ft(12)],
    ['150cm', 150],
    ['1.5m', 150],
    ['1500mm', 150],
  ])('parses %s in imperial mode', (text, expected) => {
    expect(parseLength(text, 'imperial')).toBeCloseTo(expected, 6);
  });

  it('treats bare numbers as centimeters in metric mode', () => {
    expect(parseLength('150', 'metric')).toBe(150);
    expect(parseLength('2,5m', 'metric')).toBe(250);
    expect(parseLength(`10'`, 'metric')).toBeCloseTo(ft(10), 6);
  });

  it('rejects garbage', () => {
    expect(parseLength('', 'imperial')).toBeNull();
    expect(parseLength('abc', 'imperial')).toBeNull();
    expect(parseLength('12 6', 'metric')).toBeNull();
  });
});
