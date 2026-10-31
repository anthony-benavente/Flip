import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { Icon } from '../../shared/icon';
import { EditorActions } from '../../state/editor-actions';

/** A selected wall corner. */
@Component({
  selector: 'app-corner-properties',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './properties.css',
  template: `
    <h2>Corner</h2>
    <p class="tip">Joins {{ wallCount() }} wall{{ wallCount() === 1 ? '' : 's' }}. Drag it to reshape the room; drop it on another corner to merge them.</p>
    <div class="actions">
      <button class="btn danger" (click)="actions.deleteSelection()"><app-icon name="trash" /> Delete corner &amp; walls</button>
    </div>
  `,
})
export class CornerProperties {
  readonly wallCount = input.required<number>();
  protected readonly actions = inject(EditorActions);
}

/** Several selected items. */
@Component({
  selector: 'app-multi-properties',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './properties.css',
  template: `
    <h2>{{ count() }} selected</h2>
    <div class="actions">
      @if (allFurniture()) {
        <button class="btn" (click)="actions.rotateSelection(90)">↻ Rotate</button>
        <button class="btn" (click)="actions.duplicateSelection()"><app-icon name="copy" /> Duplicate</button>
      }
      <button class="btn danger" (click)="actions.deleteSelection()"><app-icon name="trash" /> Delete</button>
    </div>
  `,
})
export class MultiProperties {
  readonly count = input.required<number>();
  readonly allFurniture = input.required<boolean>();
  protected readonly actions = inject(EditorActions);
}
