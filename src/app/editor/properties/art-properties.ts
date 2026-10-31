import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { ArtImage, IMAGE_FILE_ACCEPT } from '../../model/art-image';
import { setFurnitureArt } from '../../model/plan-operations';
import { FurnitureItem } from '../../model/plan.model';
import { ImageLibrary } from '../../persistence/image-library';
import { PlanStore } from '../../state/plan.store';

/** Chooses, uploads and deletes the picture shown on an art item. */
@Component({
  selector: 'app-art-properties',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./properties.css', './art-properties.css'],
  template: `
    @let f = item();
    <div class="field">
      <span>Picture</span>
      <div class="art-grid" role="group" aria-label="Pictures">
        <button class="art-tile art-none" [class.active]="!f.artImageId" [attr.aria-pressed]="!f.artImageId" (click)="choose(undefined)">None</button>
        @for (img of library.images(); track img.id) {
          <div class="art-tile" [class.active]="img.id === f.artImageId">
            <button class="art-pick" [title]="img.name" [attr.aria-label]="'Show ' + img.name" [attr.aria-pressed]="img.id === f.artImageId" (click)="choose(img)">
              @if (library.url(img.id); as url) {
                <img [src]="url" alt="" />
              } @else {
                <span>{{ img.name }}</span>
              }
            </button>
            <button class="art-remove" title="Delete picture" [attr.aria-label]="'Delete ' + img.name" (click)="remove(img)">×</button>
          </div>
        }
      </div>
      <label class="btn art-upload">
        Upload picture…
        <input type="file" [accept]="accept" aria-label="Upload picture" (change)="upload($event)" />
      </label>
      <label class="check">
        <input type="checkbox" [checked]="fitFrame()" (change)="fitFrame.set($any($event.target).checked)" />
        Shape the frame to the picture
      </label>
      @if (error(); as message) {
        <small class="note error" role="alert">{{ message }}</small>
      }
      @if (missing()) {
        <small class="note">This item's picture was deleted or is not in this browser. It shows a plain picture.</small>
      }
    </div>
  `,
})
export class ArtProperties {
  readonly item = input.required<FurnitureItem>();

  private readonly plan = inject(PlanStore);
  protected readonly library = inject(ImageLibrary);
  protected readonly accept = IMAGE_FILE_ACCEPT;
  protected readonly fitFrame = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly missing = computed(() => !!this.item().artImageId && !this.library.image(this.item().artImageId));

  protected choose(image: ArtImage | undefined): void {
    const id = this.item().id;
    const aspect = image && this.fitFrame() ? image.height / image.width : undefined;
    this.plan.update((d) => setFurnitureArt(d, id, image?.id, aspect));
  }

  protected async upload(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.error.set(null);
    try {
      this.choose(await this.library.upload(file));
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : String(e));
    }
  }

  protected async remove(image: ArtImage): Promise<void> {
    if (!confirm(`Delete the picture "${image.name}"? Art showing it in any plan goes back to a plain picture.`)) return;
    await this.library.remove(image.id);
  }
}
