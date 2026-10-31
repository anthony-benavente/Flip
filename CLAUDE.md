# Flip

Room layout planner. Users redraw their room as a 2D floor plan, place furniture from a catalog, and check the result in a 3D preview. Angular 22 (standalone components, signals, zoneless), plain CSS, three.js for 3D. There is no backend yet.

## Commands

```bash
npm start              # dev server, http://localhost:4200
npm test               # Vitest unit + component tests (jsdom), ~275 tests, ~5 s
npm run e2e            # Playwright against installed Chrome; starts its own server on :4321
npm run build          # production build to dist/flip
```

Run a single Vitest file with `npx ng test --watch=false --include src/app/geometry/units.spec.ts`.

## Architecture

| Folder | Role |
| --- | --- |
| `src/app/model` | `plan.model.ts` holds the document types. `catalog.ts` holds the furniture definitions and their 2D symbol parts. `defaults.ts` holds the starter plan and default sizes. |
| `src/app/geometry` | Pure functions with no Angular: units, vector math, snapping, wall editing, room detection, furniture snapping and overlap. Most logic lives here and is unit-tested. |
| `src/app/state` | `PlanStore` holds the document plus undo/redo. `EditorStore` holds UI state: tool, selection, viewport, overlay. `EditorActions` holds commands shared by the keyboard, toolbox and panel. |
| `src/app/persistence` | The `PlanRepository` interface and `PLAN_REPOSITORY` token, `LocalPlanRepository` (localStorage), `migratePlan`, and JSON import/export. |
| `src/app/editor` | The editor page, the SVG canvas, tools (`select`, `wall`, `opening`, `pan`), the toolbox and the properties panel. |
| `src/app/preview3d` | The three.js preview. `preview-engine.ts` is loaded with dynamic `import()` only. `wall-pieces.ts` holds the pure wall-splitting math. `furniture-meshes.ts` holds the primitive models. |
| `src/app/projects` | The project list page. |
| `src/app/testing` | Test-only fixtures. App code must never import them. |

Routes: `/` shows the projects page and `/plan/:id` opens the editor. Both are lazy.

## Conventions and invariants

- **Units:** store all lengths in centimeters and all angles in degrees. Feet and inches are display only, through `formatLength`, `parseLength` and `formatArea` in `geometry/units.ts`. Plan coordinates are y-down. In 3D, plan (x, y) maps to (X, Z) in meters.
- **Editing the document:** always go through `PlanStore.update(draft => ...)`. It deep-clones the plan, so mutating the draft is fine. Pass `{ coalesceKey }` for continuous gestures such as drags and nudges, then call `commit()` when the gesture ends, so the whole gesture is one undo step.
- **Walls:** walls share `WallNode`s, so use the helpers in `wall-geometry.ts`: `addWall`, `splitWall`, `mergeNodes`, `removeWalls` and `reclampOpenings`. `addWall` splits existing walls at T-junctions and crossings. Room detection assumes walls meet only at shared nodes.
- **Accent walls:** each face of a wall can carry its own paint in the optional `Wall.colors` field (`{ front?, back? }`). `front` is the face on the side the wall's normal (`perp(b - a)`) points to. A face without an accent uses the wall color of the room on that side. Use `roomsBesideWall` and `wallFaceColor` from `geometry/room-detection.ts` instead of re-deriving sides. `splitWall` copies the colors onto both pieces.
- **Rooms:** rooms are derived from the wall graph and never stored. `RoomMeta` (name and colors) attaches by an anchor point inside the room. A selected room is identified by its `key`, which is the sorted wall ids, so the key changes when its walls are split.
- **Tools:** tools implement `Tool` in `editor/tools/tool.ts`. They receive world coordinates and a `hit`, which the canvas reads from `data-kind`, `data-id` and `data-handle` attributes on SVG elements. A tool's `onKeyDown` runs before the global shortcuts in `EditorPage.onKeyDown`, and returning true consumes the key.
- **Storage:** keep storage behind `PLAN_REPOSITORY`. User accounts are planned, and a server repository should be a drop-in replacement. Bump `CURRENT_SCHEMA_VERSION` and extend `migratePlan` for any change to the document format.
- **Bundle size:** three.js must stay in a lazy chunk. Never import `preview-engine`, `furniture-meshes` or `three` statically from code reachable without the 3D view. The initial bundle is about 250 kB.
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
- The original design plan is at `C:\Users\abena\.claude\plans\i-want-an-application-glittery-glade.md`, which now holds the test plan.
- **Nothing is committed beyond the scaffold** (`8b4307c initial commit`).

## Open tasks

Priority order. Check items off or remove them as they are done.

- [ ] **Commit the work.** All v1 code and tests are uncommitted. Use a feature branch, or ask before committing to `master`.
- [ ] **Add CI.** Run `npm test`, `npm run build` and `npm run e2e`. The Playwright config already switches to retries and a GitHub reporter when `CI` is set. CI needs Chrome installed, or change `channel` to the bundled Chromium.
- [ ] **Add user accounts.** Implement an `HttpPlanRepository`, add an auth flow, and swap the provider in `app.config.ts`. Add a one-time migration of local plans into the account.
- [ ] **Bring selected furniture to the top.** It currently draws in array order, so it can sit under other items.
- [ ] **Clean up wall corners.** Corners use square caps: overlapping lines in 2D and overlapping boxes in 3D. They look wrong at non-90° angles. Mitered joins would fix this.
- [ ] **Support rooms with holes.** A free-standing inner wall loop, such as a pillar or island wall, is not subtracted from the outer room's area.
- [ ] **Merge collinear walls.** Walls that overlap on the same line are not merged, and room detection may misbehave on them.
- [ ] **Fix the zoom label.** It shows screen pixels per cm as a percentage, which means nothing to users. Show a scale bar or "1 ft = N px" instead.
- [ ] **Add touch support.** Pointer events work, but pinch-zoom and two-finger pan are missing.
- [ ] **Allow custom furniture.** Users can resize catalog items but cannot create a named custom item or catalog entry.
- [ ] **3D extras:** first-person walk mode, door and window frames, and lighter shadows in the top view.
- [ ] **Persist undo history.** It is lost on reload.
