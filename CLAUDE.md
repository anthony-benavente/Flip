# Flip

Room layout planner. Users redraw their room as a 2D floor plan, place furniture from a catalog, and check the result in a 3D preview. Angular 22 (standalone components, signals, zoneless), plain CSS, three.js for 3D. There is no backend yet.

## Commands

```bash
npm start              # dev server, http://localhost:4200
npm test               # Vitest unit + component tests (jsdom), ~500 tests, ~12 s
npm run e2e            # Playwright against installed Chrome; starts its own server on :4321
npm run build          # production build to dist/flip
```

Run a single Vitest file with `npx ng test --watch=false --include src/app/geometry/units.spec.ts`.

## Architecture

| Folder | Role |
| --- | --- |
| `src/app/model` | Document types (`plan.model.ts`), furniture catalog data (`catalog.ts`), 2D furniture drawings (`furniture-symbols.ts`), paint swatches, floor materials and room color schemes (`palettes.ts`), starter plans (`defaults.ts`), uploaded-model metadata (`custom-model.ts`), uploaded art images and their header parsing (`art-image.ts`), and **`plan-operations.ts`**: the pure edits UI code applies to a plan draft. |
| `src/app/geometry` | Pure math with no Angular: units, vectors, snapping, the wall graph (`wall-geometry.ts`), room detection and wall faces, furniture snapping and overlap, heights of items off the floor (`elevation.ts`), snapping on a wall face (`elevation-snap.ts`), splitting a wall around its openings plus trim sizes (`wall-pieces.ts`), and 2D viewport math (`viewport.ts`). |
| `src/app/state` | `PlanStore` holds the document, undo/redo and derived rooms and segments. `EditorStore` holds UI state: tool, selection, viewport, canvas size, overlay and view mode. `EditorActions` holds selection-aware commands: place, delete, duplicate, rotate and nudge. |
| `src/app/persistence` | `plan-repository.ts` holds only the `PlanRepository` contract and the `PLAN_REPOSITORY` token. `LocalPlanRepository` uses localStorage. `plan-migration.ts` validates and upgrades documents. `PlanFileService` handles JSON import/export. Uploaded 3D models: `model-repository.ts` (`ModelRepository`, `MODEL_REPOSITORY`), `IndexedDbModelRepository`, `MemoryModelRepository` (fallback and tests) and `ModelLibrary` (signal of model metadata plus cached bytes). Art images mirror that: `image-repository.ts` (`ImageRepository`, `IMAGE_REPOSITORY`), `IndexedDbImageRepository`, `MemoryImageRepository` and `ImageLibrary` (adds object URLs for the page). `idb.ts` is the shared IndexedDB file database. |
| `src/app/editor` | `editor-page/` is the page shell. `canvas/` holds `PlanCanvas` (input and wiring) and `view-models.ts` (pure template data). `tools/` holds the tools plus `createTools`. `properties/` holds a thin `PropertiesPanel` and one component per selection kind. `toolbox/`. `elevation/` is the wall elevation view (`WallElevation` plus pure `elevation-view-models.ts`). `model-library/` and `model-upload/` are the 3D model library and upload/edit dialogs. `shortcuts.ts` is the keymap and help, `autosave.ts` is the page-scoped saver, `drag-drop.ts` is the catalog drag type. |
| `src/app/preview3d` | `Preview3d` is the component. `preview-engine.ts` (renderer, camera, controls; loaded by dynamic `import()` only). `scene-builder.ts` builds the plan's three.js objects, renderer-free and testable. `model-fit.ts` stretches an uploaded model into an item's box, `model-cache.ts` parses glTF and caches by id, `model-preview.ts` is the upload dialog's lazy 3D view. `texture-cache.ts` decodes art images, `floor-textures.ts` generates floor patterns. `cutaway.ts` and `furniture-meshes.ts` hold the rest. |
| `src/app/shared` | Reusable UI and helpers: `FurnitureSymbol` (SVG `g[appFurnitureSymbol]`), `ColorSwatches`, `LengthInput`, `Icon`, `PlanThumbnail`, `color.ts` (`shade`), `base64.ts` and `dom.ts` (`isTypingTarget`, `focusWhileOpen` for dialogs). |
| `src/app/projects` | The project list page. |
| `src/app/testing` | Test-only fixtures, including `glb.ts` (`boxGlb()`, a generated GLB used by unit and e2e tests). App code must never import them. |

Dependency direction: `model` and `geometry` (pure) ← `state` ← `editor`, `projects` and `preview3d`. Lower layers never import from `editor`.

Routes: `/` shows the projects page and `/plan/:id` opens the editor. Both are lazy.

## Conventions and invariants

- **Units:** store all lengths in centimeters and all angles in degrees. Feet and inches are display only, through `formatLength`, `parseLength` and `formatArea` in `geometry/units.ts`. Plan coordinates are y-down. In 3D, plan (x, y) maps to (X, Z) in meters.
- **Editing the document:** always go through `PlanStore.update(draft => ...)`. It deep-clones the plan, so mutating the draft is fine. Put any edit that has rules, such as clamping, normalizing or creating metadata, in `model/plan-operations.ts` (or `wall-geometry.ts` for wall-graph changes), and call it from the UI. Do not write the rule inline in a component. Pass `{ coalesceKey }` for continuous gestures such as drags and nudges, then call `commit()` when the gesture ends, so the whole gesture is one undo step.
- **Walls:** walls share `WallNode`s, so use the helpers in `wall-geometry.ts`: `addWall`, `splitWall`, `mergeNodes`, `removeWalls` and `reclampOpenings`. `addWall` splits existing walls at T-junctions and crossings. Room detection assumes walls meet only at shared nodes.
- **Accent walls:** each face of a wall can carry its own paint in the optional `Wall.colors` field (`{ front?, back? }`). `front` is the face on the side the wall's normal (`perp(b - a)`) points to. A face without an accent uses the wall color of the room on that side. Use `roomsBesideWall` and `wallFaceColor` from `geometry/room-detection.ts` instead of re-deriving sides. `splitWall` copies the colors onto both pieces.
- **Rooms:** rooms are derived from the wall graph and never stored. `RoomMeta` (name and colors) attaches by an anchor point inside the room. A selected room is identified by its `key`, which is the sorted wall ids, so the key changes when its walls are split.
- **Thin components:** `PlanCanvas` only wires signals to the builders in `canvas/view-models.ts` and handles input. Each properties section is its own component. New canvas visuals get a pure builder plus a spec. New panel sections get their own component that uses `properties.css`.
- **Shortcuts:** add or change keys only in `editor/shortcuts.ts`. The help dialog renders from the same table, and `shortcuts.spec.ts` rejects duplicate bindings.
- **Furniture drawing:** use `<g appFurnitureSymbol>` anywhere a furniture symbol appears. Do not re-implement `symbolParts` rendering. Colors and swatches come from `model/palettes.ts`. Use `ColorSwatches` for any swatch row.
- **Tools:** tools implement `Tool` in `editor/tools/tool.ts`. They receive world coordinates and a `hit`, which the canvas reads from `data-kind`, `data-id` and `data-handle` attributes on SVG elements. A tool's `onKeyDown` runs before the global shortcuts in `EditorPage.onKeyDown`, and returning true consumes the key.
- **Uploaded 3D models:** a model is a *variant* of a catalog template (`CustomModel.catalogId`). A placed item keeps its own `catalogId`, size and 2D symbol, and `FurnitureItem.modelId` only swaps its 3D look; the model is stretched per axis to the item's box (`fitModelToBox`) after the model's quarter-turn `orientation`. Models live in `MODEL_REPOSITORY` (IndexedDB), never in the plan; a missing model falls back to the built-in primitive and keeps the `modelId`. Plan export embeds used models as base64 under `models`; import restores them and remaps ids on a clash. Fitted instances share geometry with `ModelCache`, so `disposePlanScene` skips meshes tagged `SHARED_MODEL`. Only .glb and self-contained .gltf are read so far.
- **Heights and mounts:** a catalog item's `mount` is `floor` (default), `wall` or `ceiling`. `FurnitureItem.elevation` is the bottom of the item above the floor; always read heights through `itemElevation`, because ceiling items ignore `elevation` and hang at the ceiling minus their height (their Height is the drop). `stackable` items rest on the floor item under their center (`restingElevation`) when placed or dragged, and dragging a base carries them (`itemsRestingOn`). A wall item hangs on the face its back is flush against (`mountedWall`); move it with `moveOnWall`. `findOverlaps` ignores pairs at different heights. A room's ceiling height is the height of its tallest wall; `setRoomCeilingHeight` sets all of its walls, so there is no stored ceiling field.
- **Room finishes:** `RoomMeta` has optional `ceilingColor`, `trimColor`, `floorMaterial` and `crownMolding`; `attachRoomMeta` fills defaults from `palettes.ts`. A color scheme (`ROOM_SCHEMES`) is applied as one `upsertRoomMeta` patch and is recognized by comparing finishes (`matchingScheme`), not stored. Trim sizes live in `geometry/wall-pieces.ts` for both the 3D trim and the elevation drawing.
- **Art images:** `FurnitureItem.artImageId` points at an image in `IMAGE_REPOSITORY` (its own IndexedDB database, `flip-images`), never in the plan. A missing image falls back to a plain picture. Export embeds used images under `images` and import remaps clashing ids, through the same code as models. Image type and size come from the file header (`readImageHeader`), so no decoding is needed outside the 3D view.
- **Elevation view:** `EditorStore.elevation` holds the open wall face and replaces the 3D preview beside the plan; closing it returns to the current view mode. Its drawing frame puts x along the face as seen from that side (`+dir` for the front, `-dir` for the back; see `faceFrame`) and y = -height. Keys go to `WallElevation.handleKey` before the canvas and global shortcuts.
- **Dialogs:** use the shared `.modal-backdrop` / `.modal` styles, call `focusWhileOpen` and stop `keydown` propagation in the dialog, so Escape and editor shortcuts never reach the plan behind it.
- **Storage:** keep storage behind `PLAN_REPOSITORY`. User accounts are planned, and a server repository should be a drop-in replacement. Bump `CURRENT_SCHEMA_VERSION` and extend `migratePlan` in `plan-migration.ts` for any incompatible change to the document format. Optional new fields need no bump.
- **Bundle size:** three.js must stay in a lazy chunk. Never import `preview-engine`, `scene-builder`, `furniture-meshes` or `three` statically from code reachable without the 3D view. The initial bundle is about 250 kB.
- **Styles:** the component style budget is 10 kB (warning) and 20 kB (error). Shared button, input and segmented styles live in `src/styles.css`.

## Testing notes

- **Tools:** test tools by calling `onPointerDown`, `onPointerMove`, `onPointerUp` and `onKeyDown` directly. Use `pointer()`, `toolContext()`, `squareRoom()` and `key()` from `src/app/testing/fixtures.ts`.
- **jsdom gaps:** jsdom has no `ResizeObserver`, so call `installResizeObserver()` before creating `PlanCanvas` or `EditorPage`. It also has no WebGL, so `EditorPage` specs replace `Preview3d` with a fake component.
- **Zoneless rendering:** after dispatching DOM events in component specs, call `fixture.detectChanges()`, because the browser would run change detection there. Promises that `whenStable` does not track need an `await new Promise(r => setTimeout(r))`.
- **E2E:** every e2e test fails on any console error, through the auto fixture in `e2e/helpers.ts`. Use web-first assertions instead of fixed waits. Use `savedPlan(page, predicate)` to read the stored plan, because it polls until autosave catches up.

## Status

- The v1 feature set is complete:
  - walls with snapping and typed lengths
  - doors and windows
  - catalog furniture with drag/drop, wall snapping and overlap warnings
  - automatic room detection with area labels
  - per-room colors
  - accent walls: paint either face of a wall from the wall's properties
  - feet/inches or metric
  - undo/redo and autosave
  - JSON import/export
  - 3D preview with cutaway, corner view and top view
  - uploaded glTF/GLB furniture models: a model library, uploading as a variant of a catalog item, editing name, template and rotation afterwards, and embedding in exports
  - interior design: wall decor and lighting (art, mirrors, shelves, wall TV, sconces, pendants, chandeliers, ceiling fans), stacking small items on furniture, height off the floor, uploaded pictures on art, room color schemes, floor materials, ceiling height and color, trim with crown molding, and a wall elevation view for arranging items on a wall
- The original design plan is at `C:\Users\abena\.claude\plans\i-want-an-application-glittery-glade.md`, which now holds the test plan.
- **Git:** commit new work on a feature branch, or ask before committing to `master`.

## Open tasks

Priority order. Check items off or remove them as they are done.


- [ ] **Add CI.** Run `npm test`, `npm run build` and `npm run e2e`. The Playwright config already switches to retries and a GitHub reporter when `CI` is set. CI needs Chrome installed, or change `channel` to the bundled Chromium.
- [ ] **Add user accounts.** Implement an `HttpPlanRepository`, add an auth flow, and swap the provider in `app.config.ts`. Add a one-time migration of local plans into the account.
- [ ] **Bring selected furniture to the top.** It currently draws in array order, so it can sit under other items.
- [ ] **Clean up wall corners.** Corners use square caps: overlapping lines in 2D and overlapping boxes in 3D. They look wrong at non-90° angles. Mitered joins would fix this.
- [ ] **Support rooms with holes.** A free-standing inner wall loop, such as a pillar or island wall, is not subtracted from the outer room's area.
- [ ] **Merge collinear walls.** Walls that overlap on the same line are not merged, and room detection may misbehave on them.
- [ ] **Fix the zoom label.** It shows screen pixels per cm as a percentage, which means nothing to users. Show a scale bar or "1 ft = N px" instead.
- [ ] **Add touch support.** Pointer events work, but pinch-zoom and two-finger pan are missing.
- [ ] **Allow custom furniture.** Users can resize catalog items but cannot create a named custom item or catalog entry.
- [ ] **3D extras:** first-person walk mode (the room ceilings already face down for it), real lights for lamps and sconces, and lighter shadows in the top view.
- [ ] **Persist undo history.** It is lost on reload.
- [ ] **More 3D model formats.** Add FBX, OBJ and STL (three.js loaders, chosen by extension in `parseModel`) for AutoCAD/Revit exports, and .zip uploads that pick the best file in a manufacturer bundle and explain that .rfa/.rvt/.dwg cannot be read.
- [ ] **Model thumbnails.** The library and catalog show the template's 2D symbol, not a render of the model.
