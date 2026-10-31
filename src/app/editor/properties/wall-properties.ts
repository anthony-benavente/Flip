import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Room, roomsBesideWall, wallFaceColor } from '../../geometry/room-detection';
import { setWallLength, WallSegment } from '../../geometry/wall-geometry';
import { ACCENT_SWATCHES, EXTERIOR_WALL_COLOR, matchingScheme, Swatch } from '../../model/palettes';
import { setWallColor, updateWall } from '../../model/plan-operations';
import { WallSide } from '../../model/plan.model';
import { ColorPick, ColorSwatches } from '../../shared/color-swatches';
import { Icon } from '../../shared/icon';
import { LengthInput } from '../../shared/length-input';
import { EditorActions } from '../../state/editor-actions';
import { EditorStore } from '../../state/editor.store';
import { PlanStore } from '../../state/plan.store';

/** Length, thickness and height of one wall, plus accent paint for each of its faces. */
@Component({
  selector: 'app-wall-properties',
  imports: [ColorSwatches, Icon, LengthInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './properties.css',
  template: `
    @let w = segment().wall;
    <h2>Wall</h2>
    <label class="field">
      <span>Length</span>
      <app-length-input [value]="segment().length" [units]="units()" [min]="5" label="Wall length" (valueChange)="setLength($event)" />
    </label>
    <p class="tip">Changing the length moves the wall's end corner along its direction.</p>
    <div class="row">
      <label class="field">
        <span>Thickness</span>
        <app-length-input [value]="w.thickness" [units]="units()" [min]="2" [max]="100" label="Wall thickness" (valueChange)="update({ thickness: $event })" />
      </label>
      <label class="field">
        <span>Height</span>
        <app-length-input [value]="w.height" [units]="units()" [min]="50" [max]="1000" label="Wall height" (valueChange)="update({ height: $event })" />
      </label>
    </div>
    @if (openingCount()) {
      <p class="tip">{{ openingCount() }} door/window opening{{ openingCount() === 1 ? '' : 's' }} on this wall.</p>
    }
    <h3>Paint</h3>
    @for (s of sides(); track s.side) {
      <div class="field wall-side" [attr.data-side]="s.side">
        <div class="side-head">
          <span class="side-chip" [style.background]="s.color"></span>
          <span class="side-label">{{ s.label }}</span>
          @if (s.accent) {
            <span class="badge">Accent</span>
          }
          <button class="btn ghost elevation-btn" [attr.aria-label]="'Elevation of ' + s.label" title="Arrange art and shelves on this side (E)" (click)="editor.openElevation(segment().wall.id, s.side)">
            Elevation
          </button>
        </div>
        <app-color-swatches
          [swatches]="s.swatches"
          [selected]="s.accent"
          [pickerValue]="s.color"
          [ariaSuffix]="' accent for ' + s.label"
          [customLabel]="'Custom color for ' + s.label"
          (pick)="paint(s.side, $event)"
        />
        @if (s.accent) {
          <button class="btn ghost reset" (click)="clearPaint(s.side)">{{ s.hasRoom ? 'Match room color' : 'Clear accent' }}</button>
        }
      </div>
    }
    <p class="tip">Accent colors show as a stripe on the plan and as paint in the 3D view.</p>
    <div class="actions">
      <button class="btn danger" (click)="actions.deleteSelection()"><app-icon name="trash" /> Delete wall</button>
    </div>
  `,
})
export class WallProperties {
  readonly segment = input.required<WallSegment>();

  private readonly plan = inject(PlanStore);
  protected readonly actions = inject(EditorActions);
  protected readonly editor = inject(EditorStore);
  protected readonly units = this.plan.units;

  protected readonly openingCount = computed(() => this.plan.plan().openings.filter((o) => o.wallId === this.segment().wall.id).length);

  /** Both faces, room-facing first. A free-standing wall's faces are called Side A and Side B. */
  protected readonly sides = computed(() => {
    const seg = this.segment();
    const beside = roomsBesideWall(seg, this.plan.rooms());
    const sides = (['front', 'back'] as const).map((side) => {
      const room = beside[side];
      return {
        side,
        label: room ? `Facing ${room.name}` : 'Outside',
        hasRoom: !!room,
        accent: seg.wall.colors?.[side] ?? null,
        swatches: accentSwatchesFor(room),
        color: wallFaceColor(seg, side, room) ?? EXTERIOR_WALL_COLOR,
      };
    });
    sides.sort((x, y) => Number(!x.hasRoom) - Number(!y.hasRoom));
    if (!sides.some((x) => x.hasRoom)) {
      sides[0].label = 'Side A';
      sides[1].label = 'Side B';
    }
    return sides;
  });

  private get id(): string {
    return this.segment().wall.id;
  }

  protected setLength(length: number): void {
    this.plan.update((d) => setWallLength(d, this.id, length));
  }

  protected update(patch: { thickness?: number; height?: number }): void {
    this.plan.update((d) => updateWall(d, this.id, patch));
  }

  protected paint(side: WallSide, pick: ColorPick): void {
    this.plan.update((d) => setWallColor(d, this.id, side, pick.color), {
      coalesceKey: pick.live ? `accent:${this.id}:${side}` : undefined,
    });
  }

  protected clearPaint(side: WallSide): void {
    this.plan.update((d) => setWallColor(d, this.id, side, null));
  }
}

/** Accent paints, led by the suggestion of the room's color scheme when it has one. */
function accentSwatchesFor(room: Room | null): Swatch[] {
  const scheme = room && matchingScheme(room);
  if (!scheme) return ACCENT_SWATCHES;
  const same = (s: Swatch) => s.color.toLowerCase() === scheme.accent.toLowerCase();
  return [{ name: `${scheme.name} accent`, color: scheme.accent }, ...ACCENT_SWATCHES.filter((s) => !same(s))];
}
