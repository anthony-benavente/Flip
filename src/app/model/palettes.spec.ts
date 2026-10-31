import {
  ACCENT_SWATCHES,
  CEILING_SWATCHES,
  FLOOR_MATERIALS,
  FLOOR_SWATCHES,
  matchingScheme,
  ROOM_SCHEMES,
  schemeFinishes,
  TRIM_SWATCHES,
  WALL_SWATCHES,
} from './palettes';

const HEX = /^#[0-9a-f]{6}$/i;

describe('palettes', () => {
  it.each([
    ['floor', FLOOR_SWATCHES],
    ['wall', WALL_SWATCHES],
    ['accent', ACCENT_SWATCHES],
    ['ceiling', CEILING_SWATCHES],
    ['trim', TRIM_SWATCHES],
  ])('has valid, uniquely named %s swatches', (_kind, swatches) => {
    expect(new Set(swatches.map((s) => s.name)).size).toBe(swatches.length);
    for (const s of swatches) expect(s.color, s.name).toMatch(HEX);
  });

  it('has complete, uniquely named room schemes', () => {
    expect(new Set(ROOM_SCHEMES.map((s) => s.name)).size).toBe(ROOM_SCHEMES.length);
    const materials = FLOOR_MATERIALS.map((m) => m.id);
    for (const s of ROOM_SCHEMES) {
      for (const color of [s.floorColor, s.wallColor, s.ceilingColor, s.trimColor, s.accent]) expect(color, s.name).toMatch(HEX);
      expect(materials, s.name).toContain(s.floorMaterial);
    }
  });

  it('recognizes a room painted with a scheme, ignoring hex case', () => {
    const coastal = ROOM_SCHEMES.find((s) => s.name === 'Coastal')!;
    const finishes = schemeFinishes(coastal);
    expect(matchingScheme(finishes)).toBe(coastal);
    expect(matchingScheme({ ...finishes, wallColor: finishes.wallColor.toUpperCase() })).toBe(coastal);
    expect(matchingScheme({ ...finishes, floorMaterial: 'carpet' })).toBeNull();
  });
});
