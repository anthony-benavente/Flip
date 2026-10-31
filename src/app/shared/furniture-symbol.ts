import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { FurnitureShape } from '../model/catalog';
import { isRoundShape, symbolParts } from '../model/furniture-symbols';
import { shade } from './color';

/**
 * Top-down drawing of one furniture item, centered on the origin in item-local units (cm).
 * Use on an SVG group: `<g appFurnitureSymbol [shape]="..." [width]="..." [depth]="..." [color]="..." />`.
 * The caller positions and rotates the group.
 */
@Component({
  selector: 'g[appFurnitureSymbol]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (round()) {
      <svg:ellipse class="base" [attr.rx]="width() / 2" [attr.ry]="depth() / 2" [attr.fill]="color()" [attr.stroke]="stroke()" />
    } @else {
      <svg:rect
        class="base"
        [attr.x]="-width() / 2"
        [attr.y]="-depth() / 2"
        [attr.width]="width()"
        [attr.height]="depth()"
        rx="2"
        [attr.fill]="color()"
        [attr.stroke]="stroke()"
      />
    }
    @for (p of parts(); track $index) {
      @switch (p.t) {
        @case ('rect') {
          <svg:rect class="part" [attr.x]="p.x" [attr.y]="p.y" [attr.width]="p.w" [attr.height]="p.h" [attr.rx]="p.r ?? 0" [attr.fill]="p.fill" [attr.stroke]="stroke()" />
        }
        @case ('circle') {
          <svg:circle class="part" [attr.cx]="p.cx" [attr.cy]="p.cy" [attr.r]="p.r" [attr.fill]="p.fill" [attr.stroke]="stroke()" />
        }
        @case ('line') {
          <svg:line class="part" [attr.x1]="p.x1" [attr.y1]="p.y1" [attr.x2]="p.x2" [attr.y2]="p.y2" [attr.stroke]="stroke()" />
        }
      }
    }
  `,
  styles: `
    .base,
    .part {
      stroke-width: 1;
      vector-effect: non-scaling-stroke;
    }
    .part {
      pointer-events: none;
    }
  `,
})
export class FurnitureSymbol {
  readonly shape = input.required<FurnitureShape>();
  readonly width = input.required<number>();
  readonly depth = input.required<number>();
  readonly color = input.required<string>();

  protected readonly round = computed(() => isRoundShape(this.shape()));
  protected readonly stroke = computed(() => shade(this.color(), -0.45));
  protected readonly parts = computed(() =>
    symbolParts(this.shape(), this.width(), this.depth()).map((p) => ({
      ...p,
      fill: 'tone' in p && p.tone !== undefined ? shade(this.color(), p.tone) : 'none',
    })),
  );
}
