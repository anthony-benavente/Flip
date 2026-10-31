import { computed, inject, Injectable, signal } from '@angular/core';
import { ArtImage, ArtImageRecord, imageNameFromFile, MAX_IMAGE_BYTES, readImageHeader } from '../model/art-image';
import { newId } from '../model/plan.model';
import { IMAGE_REPOSITORY } from './image-repository';

/**
 * The user's uploaded art images: a signal of their metadata, cached bytes for the 3D view and
 * object URLs for showing them in the page. Never imports three.js.
 */
@Injectable({ providedIn: 'root' })
export class ImageLibrary {
  private readonly repo = inject(IMAGE_REPOSITORY);
  private readonly list = signal<ArtImage[]>([]);
  private readonly bytesCache = new Map<string, Promise<ArrayBuffer | null>>();
  private readonly urls = signal<ReadonlyMap<string, string>>(new Map());
  private readonly loadingUrls = new Set<string>();

  /** All images, oldest first. */
  readonly images = this.list.asReadonly();
  private readonly byId = computed(() => new Map(this.list().map((m) => [m.id, m])));
  /** Resolves once the first listing has loaded. */
  readonly ready: Promise<void> = this.refresh();

  image(id: string | undefined): ArtImage | undefined {
    return id ? this.byId().get(id) : undefined;
  }

  /** Reloads the listing from storage. */
  async refresh(): Promise<void> {
    try {
      const images = await this.repo.list();
      this.list.set(images.sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
    } catch (e) {
      console.warn('Could not read the art image library.', e);
    }
  }

  /** Adds a PNG, JPEG or WebP file. */
  async upload(file: File): Promise<ArtImage> {
    if (file.size > MAX_IMAGE_BYTES) throw new Error(`${file.name} is larger than ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`);
    const data = await file.arrayBuffer();
    const header = readImageHeader(data);
    if (!header) throw new Error(`${file.name} is not a PNG, JPEG or WebP image.`);
    const meta: ArtImage = {
      id: newId('i'),
      name: imageNameFromFile(file.name),
      fileName: file.name,
      ...header,
      byteSize: data.byteLength,
      createdAt: new Date().toISOString(),
    };
    await this.add({ meta, data });
    return meta;
  }

  /** Stores an image record as is (for imports), replacing any image with the same id. */
  async add(record: ArtImageRecord): Promise<void> {
    await this.repo.save(record);
    this.bytesCache.set(record.meta.id, Promise.resolve(record.data));
    this.list.update((l) => [...l.filter((m) => m.id !== record.meta.id), { ...record.meta }]);
  }

  /** The full record, read from storage. */
  record(id: string): Promise<ArtImageRecord | null> {
    return this.repo.get(id);
  }

  /** Deletes an image. Art that showed it falls back to a plain picture. */
  async remove(id: string): Promise<void> {
    await this.repo.delete(id);
    this.bytesCache.delete(id);
    const url = this.urls().get(id);
    if (url) {
      URL.revokeObjectURL(url);
      this.urls.update((m) => new Map([...m].filter(([k]) => k !== id)));
    }
    this.list.update((l) => l.filter((m) => m.id !== id));
  }

  /** An image's file bytes, read once and cached; `null` when the image is gone. */
  bytes(id: string): Promise<ArrayBuffer | null> {
    let p = this.bytesCache.get(id);
    if (!p) {
      p = this.repo.get(id).then((r) => r?.data ?? null);
      this.bytesCache.set(id, p);
      p.then((data) => data ?? this.bytesCache.delete(id), () => this.bytesCache.delete(id));
    }
    return p;
  }

  /**
   * An object URL for showing the image in the page. Reads a signal, so templates update when it
   * arrives: the first call starts loading and returns undefined.
   */
  url(id: string | undefined): string | undefined {
    if (!id) return undefined;
    const url = this.urls().get(id);
    if (!url && !this.loadingUrls.has(id) && typeof URL.createObjectURL === 'function') {
      this.loadingUrls.add(id);
      // Outside the current read, since signals cannot be written while templates render.
      queueMicrotask(() => void this.loadUrl(id));
    }
    return url;
  }

  private async loadUrl(id: string): Promise<void> {
    try {
      const [data, meta] = [await this.bytes(id), this.image(id)];
      if (!data || !meta) return;
      const url = URL.createObjectURL(new Blob([data], { type: meta.mimeType }));
      this.urls.update((m) => new Map(m).set(id, url));
    } finally {
      this.loadingUrls.delete(id);
    }
  }
}
