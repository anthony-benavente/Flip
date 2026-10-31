import { DisplayUnits } from '../model/plan.model';

export const CM_PER_INCH = 2.54;
export const CM_PER_FOOT = 30.48;
export const SQCM_PER_SQFT = CM_PER_FOOT * CM_PER_FOOT;

/** Formats a length in centimeters, e.g. `12' 6"` or `3.81 m`. */
export function formatLength(cm: number, units: DisplayUnits): string {
  const sign = cm < 0 ? '-' : '';
  cm = Math.abs(cm);
  if (units === 'metric') {
    if (cm < 100) return `${sign}${round(cm, 1)} cm`;
    return `${sign}${round(cm / 100, 2).toFixed(2)} m`;
  }
  // Round to the nearest half inch.
  let totalInches = Math.round((cm / CM_PER_INCH) * 2) / 2;
  let feet = Math.floor(totalInches / 12);
  let inches = totalInches - feet * 12;
  if (inches >= 12) {
    feet += 1;
    inches -= 12;
  }
  const inchStr = Number.isInteger(inches) ? `${inches}` : inches.toFixed(1);
  if (feet === 0) return `${sign}${inchStr}"`;
  return `${sign}${feet}' ${inchStr}"`;
}

export function formatArea(sqcm: number, units: DisplayUnits): string {
  if (units === 'metric') return `${round(sqcm / 10000, 1)} m²`;
  return `${Math.round(sqcm / SQCM_PER_SQFT)} sq ft`;
}

/**
 * Parses a user-entered length into centimeters. Returns null when unparseable.
 *
 * Imperial: `12'6"`, `12' 6`, `12 6`, `12ft 6in`, `12.5'`, `30"`, `30in`; a bare number is feet.
 * Metric:   `150cm`, `1.5m`, `1500mm`; a bare number is centimeters.
 * Explicit unit suffixes work in either mode.
 */
export function parseLength(input: string, units: DisplayUnits): number | null {
  const s = input.trim().toLowerCase().replace(/,/g, '.').replace(/[’′]/g, "'").replace(/[”″]/g, '"');
  if (!s) return null;
  const num = '(\\d+(?:\\.\\d+)?|\\.\\d+)';

  let m = s.match(new RegExp(`^${num}\\s*(mm|cm|m)$`));
  if (m) {
    const v = parseFloat(m[1]);
    return m[2] === 'mm' ? v / 10 : m[2] === 'm' ? v * 100 : v;
  }

  m = s.match(new RegExp(`^${num}\\s*(?:'|ft|feet|foot)\\s*(?:${num}\\s*(?:"|in|inch|inches)?)?$`));
  if (m) {
    return parseFloat(m[1]) * CM_PER_FOOT + (m[2] ? parseFloat(m[2]) * CM_PER_INCH : 0);
  }

  m = s.match(new RegExp(`^${num}\\s*(?:"|in|inch|inches)$`));
  if (m) return parseFloat(m[1]) * CM_PER_INCH;

  if (units === 'imperial') {
    m = s.match(new RegExp(`^${num}\\s+${num}$`));
    if (m) return parseFloat(m[1]) * CM_PER_FOOT + parseFloat(m[2]) * CM_PER_INCH;
  }

  m = s.match(new RegExp(`^${num}$`));
  if (m) return units === 'imperial' ? parseFloat(m[1]) * CM_PER_FOOT : parseFloat(m[1]);

  return null;
}

/** Grid spacing used for snapping in each unit system. */
export function gridSize(units: DisplayUnits): number {
  return units === 'imperial' ? 6 * CM_PER_INCH : 10;
}

/** Major grid line spacing (every foot / every meter). */
export function majorGridSize(units: DisplayUnits): number {
  return units === 'imperial' ? CM_PER_FOOT : 100;
}

function round(v: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}
