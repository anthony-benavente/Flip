import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Stroke icon paths on a 24x24 grid. */
const ICONS: Record<string, string> = {
  select: 'M5 3l13 8-6 1.5L9 19z',
  wall: 'M3 20V4h6v10h12v6z',
  door: 'M4 20h16M7 20V4h8v16M12 12h.01',
  window: 'M4 5h16v14H4zM12 5v14M4 12h16',
  pan: 'M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3',
  undo: 'M9 14L4 9l5-5M4 9h11a5 5 0 010 10h-3',
  redo: 'M15 14l5-5-5-5M20 9H9a5 5 0 000 10h3',
  fit: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5',
  help: 'M12 21a9 9 0 100-18 9 9 0 000 18zM9.5 9a2.5 2.5 0 015 .5c0 1.5-2.5 2-2.5 3.5M12 17h.01',
  download: 'M12 4v12M7 11l5 5 5-5M4 20h16',
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
  back: 'M15 18l-6-6 6-6',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  copy: 'M8 8h12v12H8zM4 16V4h12',
  rotate: 'M20 11a8 8 0 10-2.3 5.7M20 4v7h-7',
  plus: 'M12 5v14M5 12h14',
  cube: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5',
  plan: 'M4 4h16v16H4zM4 12h7v8M11 4v5',
  split: 'M4 4h16v16H4zM12 4v16',
  search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4-4',
  close: 'M6 6l12 12M18 6L6 18',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z',
  top: 'M12 3v12M8 11l4 4 4-4M4 20h16',
  perspective: 'M3 17l9 4 9-4M3 17V7l9-4 9 4v10M12 21V11',
  walk: 'M13 5a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM12 7l-2 5 3 3v6M10 12l-3 1M12 7l3 3 3 1M13 15l-1-3',
  flip: 'M12 3v18M8 7l-5 5 5 5M16 7l5 5-5 5',
};

@Component({
  selector: 'app-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path [attr.d]="path()" /></svg>`,
  styles: `:host { display: inline-flex; } svg { width: var(--icon-size, 18px); height: var(--icon-size, 18px); }`,
})
export class Icon {
  readonly name = input.required<string>();
  protected readonly path = computed(() => ICONS[this.name()] ?? '');
}
