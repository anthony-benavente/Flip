import { clampSidebarWidth, loadSidebarWidth, saveSidebarWidth, SIDEBAR_DEFAULT, SIDEBAR_MAX, SIDEBAR_MIN } from './sidebar-width';

describe('sidebar width', () => {
  it('keeps the width between the limits', () => {
    expect(clampSidebarWidth(10)).toBe(SIDEBAR_MIN);
    expect(clampSidebarWidth(9999)).toBe(SIDEBAR_MAX);
    expect(clampSidebarWidth(340.4)).toBe(340);
    expect(clampSidebarWidth(NaN)).toBe(SIDEBAR_DEFAULT);
  });

  it('round-trips through storage', () => {
    const data = new Map<string, string>();
    const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
    expect(loadSidebarWidth(storage)).toBe(SIDEBAR_DEFAULT);
    saveSidebarWidth(400, storage);
    expect(loadSidebarWidth(storage)).toBe(400);
  });

  it('falls back to the default for junk or a throwing store', () => {
    expect(loadSidebarWidth({ getItem: () => 'wide' })).toBe(SIDEBAR_DEFAULT);
    expect(
      loadSidebarWidth({
        getItem: () => {
          throw new Error('blocked');
        },
      }),
    ).toBe(SIDEBAR_DEFAULT);
    expect(() =>
      saveSidebarWidth(400, {
        setItem: () => {
          throw new Error('full');
        },
      }),
    ).not.toThrow();
  });
});
