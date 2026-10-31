# Interior design tasks

Tracker for the interior design feature (colors, art, verticality) on branch `feature/interior-design`. Work the tasks in order. After each one: run the checks it names, tick its box here, and commit code plus tick together as `Interior T#: ...`. To resume, start at the first unchecked box and check `git status` for partial work.


### Setup
- [x] **T0: Tracker.**
  - Create `docs/interior-design-tasks.md` (this list, from the Task list heading down).
  - Add a one-line pointer under "Open tasks" in `CLAUDE.md`.
  - Commit.

### Milestone 1: Vertical foundation
- [x] **T1: Data and catalog flags.**
  - `plan.model.ts`: add `FurnitureItem.elevation?` (cm, floor to the item's bottom) and `artImageId?`.
  - `catalog.ts`: add `CatalogItem.mount?: 'floor'|'wall'|'ceiling'`, `defaultElevation?` (center height for wall items) and `stackable?`.
  - Add the categories `'Wall decor'` and `'Lighting'` to the union and to `CATALOG_CATEGORIES`.
  - `defaults.ts` `createFurniture`: wall items get `elevation = defaultElevation − height/2`.
  - Done when: `catalog.spec` and `defaults.spec` pass.
- [x] **T2: New shapes, catalog entries and 2D symbols.**
  - Shapes: `art`, `canvas-art`, `mirror`, `shelf`, `tv-wall`, `sconce`, `pendant`, `chandelier`, `ceiling-fan`, `table-lamp`, `vase`, `books`.
  - Catalog entries:
    - framed print S/M/L at 145 cm center, large canvas, round and rectangular mirrors, floating shelf, wall TV, sconce at 165 cm (all `mount: 'wall'`);
    - pendant, chandelier and ceiling fan (`mount: 'ceiling'`, `noWallSnap`);
    - table lamp, vase and books (`stackable`), plus `stackable` on the existing `tv` and `plant`.
  - Keep `box` last. Art depth must be at least 3 cm.
  - Add `symbolParts` cases in `furniture-symbols.ts`, and `isRoundShape` entries for the round items.
  - Done when: `catalog.spec` passes, including symbols staying inside each footprint.
- [x] **T3: 3D meshes for the new shapes.**
  - Add a case per shape in `furniture-meshes.ts` `build`, built at local y = 0.
  - Add `build(..., opts?: { map?: Texture })` now. The `art` picture plane uses `map` if given, otherwise a tint of the color.
  - Lights use `emissive`.
  - Done when: `furniture-meshes.spec` passes.
- [x] **T4: Elevation geometry.**
  - New `geometry/elevation.ts`:
    - `ceilingHeightAt(rooms, p)`
    - `itemElevation(item, rooms)`: ceiling items hang at ceiling − height; others use `elevation ?? 0`
    - `restingElevation(item, furniture, rooms)`
    - `itemsRestingOn(base, furniture, rooms)`
    - `mountedWall(item, segments)`: a back within 5 cm of a face, aligned, returns `{ seg, side, along }`
  - Add `Room.ceilingHeight` (the max height of the room's walls) in `room-detection.ts` `attachRoomMeta`.
  - Done when: `elevation.spec.ts` and `room-detection.spec` pass.
- [x] **T5: Vertical-aware overlaps.**
  - `findOverlaps` (`furniture-geometry.ts:130`) takes an elevation resolver.
  - Items whose vertical ranges don't overlap aren't flagged.
  - Wall-mounted items skip the wall-outline check.
  - Update the caller in `plan-canvas.ts:97`.
  - Done when: new `furniture-geometry.spec` cases pass.
- [x] **T6: Operations.**
  - `updateFurniture` clamps `elevation` to `[0, ceiling − height]`, taking a ceiling-height argument.
  - New `setRoomCeilingHeight(draft, room, h)` sets the height of every wall in the room through `updateWall`.
  - Done when: `plan-operations.spec` passes.
- [x] **T7: Placement, stacking and carrying.**
  - `EditorActions.placeFurniture`: stackable items get `restingElevation`; wall items keep the back-to-wall snap.
  - `select.tool.ts` `dragFurniture`: stackable items re-rest on each move, and dragging a base also moves `itemsRestingOn` it.
  - Done when: specs for the select tool and editor-actions pass.
- [x] **T8: 2D plan rendering.**
  - `furnitureViews` sorts by `itemElevation` (floor-layer items first).
  - It adds `mount`; ceiling items draw at reduced opacity. (Height badge dropped: the Elevation field in T10 covers it.)
  - Done when: `view-models.spec` passes.
- [x] **T9: 3D elevation and cutaway.**
  - `scene-builder.ts:71` sets y from `itemElevation`. The bounds at `:81` include the top.
  - `SceneWall.attached` comes from `mountedWall`, and `PreviewEngine.updateCutaway` hides attached items on cut walls.
  - Done when: `scene-builder.spec` passes.
- [x] **T10: Properties.**
  - `furniture-properties.ts` gets an Elevation `LengthInput` for floor and wall items (following the sill pattern in `opening-properties.ts:31-35`), and a "Hangs from ceiling" tip for ceiling items.
  - Done when: specs pass.
- [x] **T11: M1 e2e.**
  - `e2e/interior.spec.ts`: a dresser plus a table lamp stacks (saved `elevation` equals the dresser height, no overlap warning), and a framed print gets the wall elevation.
  - Done when: `npm run build` and `npm run e2e` pass.

### Milestone 2: Colors
- [x] **T12: Room finish data and palettes.**
  - `RoomMeta` optional fields: `ceilingColor`, `trimColor`, `floorMaterial: 'solid'|'wood'|'tile'|'carpet'|'concrete'` and `crownMolding?`.
  - Resolve their defaults on `Room` in `attachRoomMeta`.
  - Widen the `upsertRoomMeta` patch (`plan-operations.ts:84`).
  - `palettes.ts`: `DEFAULT_CEILING_COLOR`, `DEFAULT_TRIM_COLOR`, `CEILING_SWATCHES`, `TRIM_SWATCHES` and `ROOM_SCHEMES` (about 8, each with floor color and material, wall, ceiling, trim and accent).
  - Done when: `palettes.spec` (valid hex, unique names) and `room-detection.spec` pass.
- [x] **T13: Room properties UI.**
  - Scheme chips: one `upsertRoomMeta`, so one undo step.
  - Floor material as a segmented control.
  - Ceiling height through `setRoomCeilingHeight`, with a tip that shared walls change the neighboring room too.
  - Ceiling and trim colors with `ColorSwatches`, using the existing `pickColor` coalescing.
  - Crown molding checkbox.
  - The room's scheme accent goes first in the accent swatches in `wall-properties.ts`.
  - Split out a `RoomFinishes` component if the style budget requires it.
  - Done when: a spec shows a scheme applies in one undo step.
- [x] **T14: Floor textures.**
  - New `preview3d/floor-textures.ts`, a pure tileable grayscale RGBA generator per material.
  - The factory caches a `DataTexture` (`RepeatWrapping`, repeat in meters) and disposes it.
  - `buildFloor` uses `map` tinted by `floorColor`.
  - Done when: `floor-textures.spec` and `scene-builder.spec` pass.
- [x] **T15: Ceiling and trim in 3D.**
  - Per room, a downward-facing ceiling at `ceilingHeight` in `ceilingColor`, with `castShadow = false`, named `ceiling:${key}`.
  - A per-wall `trim` sub-group:
    - baseboards on room faces along pieces that touch the floor;
    - crown when the room has `crownMolding`;
    - casings around openings.
  - Colors come from `roomsBesideWall` → `trimColor`.
  - Done when: `scene-builder.spec` passes and the solid-count test is unchanged.
- [x] **T16: 2D floor patterns.**
  - `roomViews` gets `pattern`, and `plan-canvas.html` `<defs>` holds an SVG pattern per material.
  - Done when: the e2e scheme test (saved room meta has all its fields) passes, along with `npm run build` and `npm run e2e`.

### Milestone 3: Art images
- [x] **T17: Shared IndexedDB helper.**
  - Extract `open`/`run`/`request` from `indexed-db-model.repository.ts` into `persistence/idb.ts`. No behavior change.
  - Done when: existing tests pass.
- [x] **T18: Image storage.**
  - `model/art-image.ts` (`ArtImage`, `isArtImage`, accepted types png/jpeg/webp, 10 MB max).
  - `image-repository.ts` (`IMAGE_REPOSITORY`).
  - `IndexedDbImageRepository` (database `flip-images` v1) and `MemoryImageRepository`.
  - `image-library.ts`, mirroring `ModelLibrary` and adding `objectUrl(id)`, revoked on remove.
  - Add a PNG fixture in `testing/png.ts`.
  - Done when: `art-image.spec` and `image-library.spec` pass.
- [ ] **T19: Export and import.**
  - An optional `images` key in `plan-file.service.ts`, handled like `models`: embed, restore and remap on clash.
  - `remapFurnitureArt` and `setFurnitureArt(draft, id, imageId?, fitAspect?)` in `plan-operations.ts`.
  - Done when: `plan-file.service.spec` and `plan-operations.spec` pass.
- [ ] **T20: Art properties UI.**
  - `properties/art-properties.ts` for `art` and `canvas-art` items: a thumbnail grid, Upload, None, Match proportions, and remove with confirm.
  - Done when: a spec passes.
- [ ] **T21: Art textures in 3D.**
  - `preview3d/texture-cache.ts` (lazy, mirrors `ModelCache`).
  - `buildPlanScene` gets an images resolver, so the art `map` is set.
  - `Preview3d`'s effect tracks `imageLibrary.images()`, and `PreviewEngine.update` loads missing textures and reruns.
  - Done when: `scene-builder.spec` passes, plus e2e (upload the fixture, `artImageId` saved, export and re-import keeps it), `npm run build` and `npm run e2e`.

### Milestone 4: Wall elevation view
- [ ] **T22: Prep refactors.**
  - Move `preview3d/wall-pieces.ts` (and its spec) to `geometry/`, and update imports.
  - Move `readHit` from `plan-canvas.ts` into a shared canvas helper.
  - Done when: tests pass.
- [ ] **T23: State and entry points.**
  - `ViewMode` gains `'elevation'` (left out of `cycleViewMode`).
  - Add an `editor.elevation` signal with `openElevation`/`closeElevation`; the view auto-closes if the wall disappears.
  - An "Elevation" button per face in `WallProperties.sides()`.
  - Shortcut `E` in `shortcuts.ts`.
  - Done when: specs for the editor store and shortcuts pass.
- [ ] **T24: Elevation view models.**
  - `editor/elevation/elevation-view-models.ts`:
    - `faceFrame(seg, side)`, which isn't mirrored (a test proves it);
    - the wall, trim and ceiling band;
    - openings via `wallPieces`;
    - mounted items with the image URL;
    - floor and ceiling furniture within 60 cm as silhouettes;
    - guides (floor, ceiling, eye level 145 cm, furniture tops, art-above-furniture band) and dimensions.
  - Done when: the spec passes.
- [ ] **T25: Elevation snapping and the move operation.**
  - `geometry/elevation-snap.ts`: eye level, centered over the furniture below, edges and centers of other items, grid.
  - `moveOnWall(draft, id, seg, side, along, elevation)` in `plan-operations.ts`, which keeps the item flush and clamped.
  - Done when: the specs pass.
- [ ] **T26: Elevation component.**
  - `editor/elevation/wall-elevation.ts/.html/.css`:
    - its own viewport (pan and zoom via `viewport.ts`);
    - drag with `coalesceKey` + `commit()`, with Alt turning off snapping;
    - shared selection;
    - arrow nudges via `handleKey`, which `EditorPage.onKeyDown` checks before the shortcuts;
    - catalog drop via `FURNITURE_DRAG_MIME`;
    - a header with the face name, Flip side, and Close.
  - `editor-page` shows the plan and elevation side by side.
  - Done when: `wall-elevation.spec` passes (dispatched pointer events plus `detectChanges`).
- [ ] **T27: M4 e2e.**
  - Open the elevation from wall properties, drag the print up, check the saved `elevation` changes, then close it and return to the previous view.
  - Done when: `npm run build` and `npm run e2e` pass.

### Wrap-up
- [ ] **T28: Docs and final checks.**
  - `CLAUDE.md`:
    - conventions: mounts and elevation with `itemElevation` as the single source; ceiling height = wall heights; art images live in `IMAGE_REPOSITORY`, never in the plan; the elevation frame;
    - folder table and status;
    - remove "door and window frames" from 3D extras, and the tracker pointer.
  - Check that the initial bundle stays at about 250 kB and three.js is still lazy.
  - Do a manual check with `npm start`.
  - Done when: everything is green. Then ask the user before merging to `master`.

---

## Design notes (reference for the tasks above)

- **Elevation semantics:** `elevation` is the bottom of the item in cm. Ceiling items aren't stored at a height: they hang at `ceilingHeightAt − height`, so Height acts as the drop and they follow ceiling changes.
- **Ceiling height:** derived from the room's walls, the max of their `height`. No new stored field.
- **Ceiling visibility:** it faces down, so it's culled from the overhead and corner cameras and never blocks the view. It's seen from below and in the elevation view.
- **Cutaway:** cut walls scale their group's y, so wall art lives at scene level and is hidden with its wall instead.
- **Trim** goes in a `trim` sub-group so `scene-builder.spec`'s solid-count assertions hold.
- **Face frame:** viewed from the room, `u` runs along `−dir` for the front face and `+dir` for the back face, so the elevation isn't mirrored.
- **Bundle:** `texture-cache`, `floor-textures` and `furniture-meshes` are imported only by the engine and scene builder. `ImageLibrary` doesn't import three.
- **Image database:** a separate `flip-images` database, so the models database's upgrade logic stays untouched.

## Verification
- After each task: `npm test`. At each milestone's end: `npm run build` (budgets, lazy three.js) and `npm run e2e`.
- E2E coverage in `e2e/interior.spec.ts`: stacking, scheme, art upload with export round-trip, elevation drag. All use `savedPlan(page, predicate)`.
- Manual check with `npm start`:
  - art textures in 3D;
  - a pendant hanging from the ceiling;
  - baseboards and casings;
  - wood and tile floors;
  - art hidden along with its cut wall;
  - dragging in the elevation view.
