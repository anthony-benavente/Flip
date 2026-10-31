# Flip

Redraw your room as a floor plan, drag furniture around, and preview the arrangement in 3D before moving anything.

## Running it

```bash
npm install
npm start          # dev server at http://localhost:4200
npm test           # unit and component tests (Vitest)
npm run e2e        # end-to-end tests (Playwright, uses your installed Chrome)
npm run build      # production build in dist/flip
```

## Tests

- **Unit and component tests** sit next to the code as `*.spec.ts` and run in jsdom. Shared helpers live in `src/app/testing/fixtures.ts`. Tools are tested by calling their pointer and key handlers directly, so these tests need no DOM events.
- **End-to-end tests** live in `e2e/`. Playwright starts the dev server on port 4321, or reuses one already running there. Every test fails if the page logs a console error. Run `npx playwright test --ui` to watch the tests run.

## Using the editor

- **Draw walls** with the Wall tool (`W`). Click each corner, click the first corner to close a room, and double-click or press `Esc` to stop. While drawing, type a length such as `12' 6"` or `3.5m` and press `Enter` to place the next corner exactly. Hold `Shift` for right angles.
- **Add doors and windows** with `D` and `N`, then click a wall.
- **Add furniture** by dragging it from the left panel onto the plan, or by clicking it to drop it in the middle of the view. Items near a wall snap flush against it.
- **Edit** with the Select tool (`V`). Drag corners, walls, openings and furniture. Selected furniture gets resize and rotate handles. The right panel edits exact sizes, colors, room names and floor and wall colors.
- **Preview in 3D** with the Plan / Split / 3D switch in the top bar.
- Press `?` for every keyboard shortcut.

Plans autosave to the browser's local storage. Use Export and Import to move a plan between browsers as a `.flip.json` file.

## Code layout

| Folder | What lives there |
| --- | --- |
| `src/app/model` | Plan data types, the furniture catalog with 2D symbols, starter plans |
| `src/app/geometry` | Pure geometry: units, snapping, wall editing, room detection, furniture placement |
| `src/app/state` | Signal stores for the plan (with undo/redo) and the editor UI, plus shared editing actions |
| `src/app/persistence` | `PlanRepository` interface, the localStorage implementation, file import/export |
| `src/app/editor` | Editor page, SVG floor plan canvas, tools, toolbox and properties panel |
| `src/app/preview3d` | three.js preview, loaded lazily so it stays out of the main bundle |
| `src/app/projects` | Project list page |

All lengths are stored in centimeters. Feet and inches are only a display format.

Storage goes through the `PLAN_REPOSITORY` injection token in `app.config.ts`. To add user accounts, implement `PlanRepository` against a server and provide it there. No component changes are needed.
