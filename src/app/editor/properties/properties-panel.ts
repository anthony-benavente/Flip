import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { formatArea, formatLength } from '../../geometry/units';
import { clampOpeningOffset, reclampOpenings, setWallLength } from '../../geometry/wall-geometry';
import { EXTERIOR_WALL_COLOR, Room, roomsBesideWall, wallFaceColor } from '../../geometry/room-detection';
import { catalogItem } from '../../model/catalog';
import { DisplayUnits, FurnitureItem, newId, Opening, Plan, Wall, WallSide } from '../../model/plan.model';
import { EditorActions } from '../../state/editor-actions';
import { EditorStore } from '../../state/editor.store';
import { PlanStore } from '../../state/plan.store';
import { Icon } from '../../shared/icon';
import { LengthInput } from '../../shared/length-input';

export const FLOOR_SWATCHES = [
  { name: 'Oak', color: '#c9a77c' },
  { name: 'Light wood', color: '#e3cda4' },
  { name: 'Walnut', color: '#7d5a3c' },
  { name: 'Gray tile', color: '#b9bbbd' },
  { name: 'White tile', color: '#ecebe7' },
  { name: 'Carpet', color: '#cdbfae' },
  { name: 'Concrete', color: '#9e9b96' },
];

export const WALL_SWATCHES = [
  { name: 'White', color: '#f7f6f3' },
  { name: 'Warm white', color: '#efe9df' },
  { name: 'Greige', color: '#d6cfc3' },
  { name: 'Sage', color: '#b9c4ad' },
  { name: 'Blue gray', color: '#a9b6c2' },
  { name: 'Terracotta', color: '#c98b6b' },
  { name: 'Charcoal', color: '#55575b' },
];

/** Bolder paints for accent walls. */
export const ACCENT_SWATCHES = [
  { name: 'Navy', color: '#2f4a6d' },
  { name: 'Forest', color: '#3f6b4f' },
  { name: 'Teal', color: '#2f7f80' },
  { name: 'Terracotta', color: '#c06a4a' },
  { name: 'Mustard', color: '#d4a537' },
  { name: 'Blush', color: '#d9a6a1' },
  { name: 'Charcoal', color: '#3d3f44' },
  { name: 'Sage', color: '#b9c4ad' },
];

export const FURNITURE_SWATCHES = ['#7a8ca3', '#b08d6e', '#8b6b4a', '#3c3f44', '#e6e1d8', '#5f8a4f', '#a83f3f', '#d9b44a', '#c9ccd1', '#f4f4f2'];

@Component({
  selector: 'app-properties-panel',
  imports: [Icon, LengthInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './properties-panel.html',
  styleUrl: './properties-panel.css',
})
export class PropertiesPanel {
  protected readonly planStore = inject(PlanStore);
  protected readonly editor = inject(EditorStore);
  protected readonly actions = inject(EditorActions);

  protected readonly floorSwatches = FLOOR_SWATCHES;
  protected readonly wallSwatches = WALL_SWATCHES;
  protected readonly accentSwatches = ACCENT_SWATCHES;
  protected readonly furnitureSwatches = FURNITURE_SWATCHES;
  protected readonly units = this.planStore.units;

  protected readonly view = computed(() => {
    const sel = this.editor.selection();
    const plan = this.planStore.plan();
    if (sel.length === 0) return { kind: 'plan' as const };
    if (sel.length > 1) {
      return { kind: 'multi' as const, count: sel.length, allFurniture: sel.every((s) => s.kind === 'furniture') };
    }
    const s = sel[0];
    switch (s.kind) {
      case 'wall': {
        const seg = this.planStore.segmentById().get(s.id);
        if (!seg) return { kind: 'plan' as const };
        const beside = roomsBesideWall(seg, this.planStore.rooms());
        const sides = (['front', 'back'] as const).map((side) => {
          const room = beside[side];
          const accent = seg.wall.colors?.[side] ?? null;
          return {
            side,
            label: room ? `Facing ${room.name}` : 'Outside',
            room,
            accent,
            color: wallFaceColor(seg, side, room) ?? EXTERIOR_WALL_COLOR,
          };
        });
        // Room-facing sides first; a free-standing wall shows both sides.
        sides.sort((x, y) => Number(!x.room) - Number(!y.room));
        if (!sides.some((x) => x.room)) {
          sides[0].label = 'Side A';
          sides[1].label = 'Side B';
        }
        return {
          kind: 'wall' as const,
          wall: seg.wall,
          length: seg.length,
          openings: plan.openings.filter((o) => o.wallId === s.id).length,
          sides,
        };
      }
      case 'node': {
        const n = this.planStore.nodes().get(s.id);
        if (!n) return { kind: 'plan' as const };
        return { kind: 'node' as const, id: n.id, walls: plan.walls.filter((w) => w.a === n.id || w.b === n.id).length };
      }
      case 'opening': {
        const o = plan.openings.find((x) => x.id === s.id);
        const seg = o && this.planStore.segmentById().get(o.wallId);
        if (!o || !seg) return { kind: 'plan' as const };
        return { kind: 'opening' as const, opening: o, wallLength: seg.length, wallHeight: seg.wall.height };
      }
      case 'furniture': {
        const f = plan.furniture.find((x) => x.id === s.id);
        if (!f) return { kind: 'plan' as const };
        return { kind: 'furniture' as const, item: f, type: catalogItem(f.catalogId).name };
      }
      case 'room': {
        const r = this.planStore.rooms().find((x) => x.key === s.id);
        if (!r) return { kind: 'plan' as const };
        return { kind: 'room' as const, room: r };
      }
    }
  });

  protected readonly planStats = computed(() => {
    const rooms = this.planStore.rooms();
    const plan = this.planStore.plan();
    return {
      rooms: rooms.length,
      area: formatArea(
        rooms.reduce((s, r) => s + r.area, 0),
        this.units(),
      ),
      walls: plan.walls.length,
      furniture: plan.furniture.length,
    };
  });

  protected fmt(cm: number): string {
    return formatLength(cm, this.units());
  }

  protected area(cm2: number): string {
    return formatArea(cm2, this.units());
  }

  protected perimeter(room: Room): string {
    let p = 0;
    for (let i = 0; i < room.polygon.length; i++) {
      const a = room.polygon[i];
      const b = room.polygon[(i + 1) % room.polygon.length];
      p += Math.hypot(b.x - a.x, b.y - a.y);
    }
    return formatLength(p, this.units());
  }

  // --- plan --------------------------------------------------------------

  protected setPlan<K extends keyof Plan>(key: K, value: Plan[K]): void {
    this.planStore.update((d) => {
      d[key] = value;
    });
  }

  protected setUnits(units: DisplayUnits): void {
    if (units !== this.units()) this.setPlan('displayUnits', units);
  }

  // --- walls -------------------------------------------------------------

  protected setWallLength(id: string, length: number): void {
    this.planStore.update((d) => setWallLength(d, id, length));
  }

  protected setWall(id: string, patch: Partial<Wall>): void {
    this.planStore.update((d) => {
      const w = d.walls.find((x) => x.id === id);
      if (w) Object.assign(w, patch);
      reclampOpenings(d);
    });
  }

  /** Sets or clears (color = null) the accent paint on one face of a wall. */
  protected setWallColor(id: string, side: WallSide, color: string | null, coalesceKey?: string): void {
    this.planStore.update(
      (d) => {
        const w = d.walls.find((x) => x.id === id);
        if (!w) return;
        const colors = { ...w.colors };
        if (color) colors[side] = color;
        else delete colors[side];
        if (Object.keys(colors).length) w.colors = colors;
        else delete w.colors;
      },
      { coalesceKey },
    );
  }

  // --- openings ----------------------------------------------------------

  protected setOpening(id: string, patch: Partial<Opening>, wallLength?: number): void {
    this.planStore.update((d) => {
      const o = d.openings.find((x) => x.id === id);
      if (!o) return;
      Object.assign(o, patch);
      if (wallLength !== undefined) {
        o.width = Math.min(o.width, wallLength);
        o.offset = clampOpeningOffset(o.offset, o.width, wallLength);
      }
    });
  }

  // --- furniture ---------------------------------------------------------

  protected setFurniture(id: string, patch: Partial<FurnitureItem>, coalesceKey?: string): void {
    this.planStore.update(
      (d) => {
        const f = d.furniture.find((x) => x.id === id);
        if (f) Object.assign(f, patch);
      },
      { coalesceKey },
    );
  }

  protected setRotation(id: string, value: string): void {
    const v = parseFloat(value);
    if (!Number.isFinite(v)) return;
    let r = ((v % 360) + 360) % 360;
    if (r > 180) r -= 360;
    this.setFurniture(id, { rotation: r });
  }

  protected resetFurnitureSize(item: FurnitureItem): void {
    const c = catalogItem(item.catalogId);
    this.setFurniture(item.id, { width: c.width, depth: c.depth, height: c.height });
  }

  // --- rooms -------------------------------------------------------------

  protected setRoom(room: Room, patch: { name?: string; floorColor?: string; wallColor?: string }, coalesceKey?: string): void {
    this.planStore.update(
      (d) => {
        let meta = room.meta ? d.rooms.find((m) => m.id === room.meta!.id) : undefined;
        if (!meta) {
          meta = { id: newId('r'), anchor: room.label, name: room.name, floorColor: room.floorColor, wallColor: room.wallColor };
          d.rooms.push(meta);
        }
        // Keep the anchor well inside the room as walls move.
        meta.anchor = room.label;
        Object.assign(meta, patch);
      },
      { coalesceKey },
    );
  }

  protected value(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }
}
