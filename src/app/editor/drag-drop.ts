/** Data type used when dragging a catalog item from the toolbox onto the canvas. */
export const FURNITURE_DRAG_MIME = 'application/x-flip-furniture';

/** What a toolbox entry places: a catalog template, optionally drawn with an uploaded model. */
export interface FurnitureDragData {
  catalogId: string;
  modelId?: string;
}

/** `catalogId`, or `catalogId#modelId` for a model variant. */
export function encodeFurnitureDrag(d: FurnitureDragData): string {
  return d.modelId ? `${d.catalogId}#${d.modelId}` : d.catalogId;
}

export function decodeFurnitureDrag(value: string): FurnitureDragData {
  const [catalogId, modelId] = value.split('#', 2);
  return modelId ? { catalogId, modelId } : { catalogId };
}
