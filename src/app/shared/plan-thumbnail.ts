import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { wallSegments } from '../geometry/wall-geometry';
import { Plan } from '../model/plan.model';

/** Small static drawing of a plan's walls, for the project list. */
@Component({
  selector: 'app-plan-thumbnail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (view(); as v) {
      <svg [attr.viewBox]="v.box" preserveAspectRatio="xMidYMid meet">
        @for (f of v.furniture; track $index) {
          <rect [attr.x]="-f.width / 2" [attr.y]="-f.depth / 2" [attr.width]="f.width" [attr.height]="f.depth"
            [attr.fill]="f.color" opacity="0.7" [attr.transform]="'translate(' + f.x + ' ' + f.y + ') rotate(' + f.rotation + ')'" />
        }
        <path [attr.d]="v.walls" [attr.stroke-width]="v.stroke" stroke="var(--wall)" stroke-linecap="square" fill="none" />
      </svg>
    } @else {
      <span class="empty">Empty plan</span>
    }
  `,
  styles: `
    :host { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; }
    svg { width: 100%; height: 100%; }
    .empty { color: var(--text-muted); font-size: 12px; }
  `,
})
export class PlanThumbnail {
  readonly plan = input.required<Plan>();

  protected readonly view = computed(() => {
    const plan = this.plan();
    const segs = wallSegments(plan);
    if (!segs.length) return null;
    const xs = segs.flatMap((s) => [s.a.x, s.b.x]);
    const ys = segs.flatMap((s) => [s.a.y, s.b.y]);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const w = Math.max(...xs) - minX;
    const h = Math.max(...ys) - minY;
    const pad = Math.max(w, h) * 0.08 + 20;
    return {
      box: `${minX - pad} ${minY - pad} ${w + pad * 2} ${h + pad * 2}`,
      walls: segs.map((s) => `M${s.a.x} ${s.a.y}L${s.b.x} ${s.b.y}`).join(''),
      stroke: Math.max(8, Math.max(w, h) / 60),
      furniture: plan.furniture,
    };
  });
}
