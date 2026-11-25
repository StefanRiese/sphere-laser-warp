# CLAUDE.md

Guidance for working in this repository.

## Project

Sphere Laser Warp: a static, client-side website (GitHub Pages) that pre-warps a flat
image so it looks undistorted when laser-engraved on a ball with a rotary unit.
Primary hardware: xTool M1 + RA2 Pro in chuck mode (direct rotation, no rollers), via
xTool Studio or LightBurn. Roller-drive kinematics is out of scope unless requested.

## Layout

- `core/`: pure, DOM-free TypeScript, unit-tested in Node: `projection.ts` (sphere <-> image plane, placement), `warp.ts` (resampling, footprint crop, `transpose`), `calibration.ts` (test-engraving evaluation), `vector.ts` (forward mapping and polyline warp for the vector export).
- `web/`: Vite app. `main.ts` wires the UI; `warp.worker.ts` runs the warp; `preview3d.ts` is the three.js ball (lazy-loaded); `export.ts` (PNG with DPI, SVG), `loadImage.ts` (raster and SVG upload), `vectorWarp.ts` (vector SVG export: samples SVG geometry in the browser, maps it with `core/vector.ts`), `sample.ts` and `calibration.ts` (generated test images), `presets.ts`, `i18n.ts` + `strings.ts`.
- `presets/`: machine presets as JSON (`name`, `name_de`, `description`, `params`); picked up automatically by `web/presets.ts`, validated by `core/presets.test.ts`.
- `.github/workflows/pages.yml`: test, build and deploy to Pages on every push to `main`.

## Commands

- `npm run dev`, `npm test`, `npm run typecheck`, `npm run build` (typecheck + build into `dist/`).
- The UI is only verified by running it: build, serve `dist/` (for example `python3 -m http.server -d dist`) and drive it with a headless browser. Wait for the worker result before taking a screenshot.

## Geometry (keep consistent everywhere)

- Ball radius R, horizontal rotary axis, beam from the top.
- Axis position `x = R·sin φ`, rotation `θ = λ`.
- Versus a cylinder of equal diameter: width scale `1/cos φ`, height scale `cos φ`.
- Image placement: `axisAngleDeg` picks which image direction runs along the axis; `offsetAxisMm` moves the image centre along the axis (sphere is rotated so the centre sits at the projection pole).
- Canonical warp output: columns = axis, rows = rotation. The export may be transposed (`transpose()`); the 3D preview always uses the canonical layout.
- Vector export uses the same mapping as the raster warp, run forward (image -> file). File y is the arc length `R*theta`. Subpaths are measured one by one because browsers disagree on whether `getTotalLength` includes the jump between subpaths; corners are refined after even sampling.
- Image size can be defined by width or height; core only takes `imageWidthMm`.
- No mirror and no reverse-rotation option: the rotation direction is fixed (theta increases with the file rows); the axis direction angle is the only orientation control.
- Projections: azimuthal equidistant (default), stereographic, Lambert equal-area.
- No latitude limit. The output is cropped to the image footprint and never padded; the UI reports the maximum latitude reached (spot elongation and defocus are physical).

## Conventions

- All user-facing text goes through `web/strings.ts` (English and German); use `data-i18n` in HTML or `t()` in code. `core/i18n.test.ts` checks key parity and that every `data-i18n` key exists.
- No backend, no uploads, no tracking. Everything runs in the browser.
- Keep `core/` free of DOM and browser APIs so it can be tested in Node.
- Heavy resampling runs in a Web Worker.
- Not implemented yet: keeping parameters in the URL hash so setups are shareable.
- Add or update tests with every change to projection or warp maths.
- Record user-visible changes in `CHANGELOG.md` under `[Unreleased]`; keep `README.md` usage and roadmap current.
- Out of scope unless asked: G-code generation, roller-drive kinematics.

## Git

- Solo repo: commit and push directly to `main`, no branches or PRs unless asked.
- Never add `Co-Authored-By: Claude` or any other mention of Claude to commits or PRs.
