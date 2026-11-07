/** Width of the left sidebar (icon rail plus panel) in px: limits, default, and the saved choice. */
export const SIDEBAR_MIN = 266;
export const SIDEBAR_MAX = 520;
export const SIDEBAR_DEFAULT = 306;
/** How far an arrow key moves the divider. */
export const SIDEBAR_STEP = 16;

const KEY = 'flip.sidebarWidth';

export function clampSidebarWidth(width: number): number {
  if (!Number.isFinite(width)) return SIDEBAR_DEFAULT;
  return Math.round(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, width)));
}

/** The saved width, or the default when nothing usable is stored (storage can be blocked or hold junk). */
export function loadSidebarWidth(storage: Pick<Storage, 'getItem'> | null = safeStorage()): number {
  try {
    const raw = storage?.getItem(KEY);
    return raw == null ? SIDEBAR_DEFAULT : clampSidebarWidth(Number(raw));
  } catch {
    return SIDEBAR_DEFAULT;
  }
}

export function saveSidebarWidth(width: number, storage: Pick<Storage, 'setItem'> | null = safeStorage()): void {
  try {
    storage?.setItem(KEY, String(clampSidebarWidth(width)));
  } catch {
    // A full or blocked store only means the width is not remembered.
  }
}

function safeStorage(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}
