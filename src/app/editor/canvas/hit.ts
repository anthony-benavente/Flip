import { Hit, HitKind } from '../tools/tool';

/** The hit under a pointer: the nearest element with `data-kind`, plus its `data-id` and `data-handle`. */
export function readHit(target: EventTarget | null): Hit | null {
  const el = (target as Element | null)?.closest?.('[data-kind]');
  if (!el) return null;
  return {
    kind: el.getAttribute('data-kind') as HitKind,
    id: el.getAttribute('data-id') ?? '',
    handle: el.getAttribute('data-handle') ?? undefined,
  };
}
