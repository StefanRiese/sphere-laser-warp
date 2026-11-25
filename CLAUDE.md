# CLAUDE.md

Guidance for working in this repository.

## Project

Sphere Laser Warp: a static, client-side website (GitHub Pages) that pre-warps a flat
image so it looks undistorted when laser-engraved on a ball with a rotary unit.
Primary hardware: xTool M1 + RA2 Pro in chuck mode (direct rotation, no rollers), via
xTool Creative Space or LightBurn. Roller-drive kinematics is out of scope unless requested.

## Planned layout

- `core/`: pure, DOM-free TypeScript (projections, warp). Unit-tested.
- `web/`: Vite app (UI, canvas and three.js preview, Web Worker for resampling).
- `presets/`: machine presets as JSON (`name`, `description`, `notes`, `params`); picked up automatically by `web/presets.ts`, validated by `core/presets.test.ts`.
- `docs/`: geometry write-up.
- `.github/workflows/pages.yml`: build and deploy to Pages.

## Geometry (keep consistent everywhere)

- Ball radius R, horizontal rotary axis, beam from the top.
- Axis position `x = R·sin φ`, rotation `θ = λ`.
- Versus a cylinder of equal diameter: width scale `1/cos φ`, height scale `cos φ`.
- Image placement: `axisAngleDeg` picks which image direction runs along the axis; `offsetAxisMm`/`offsetRotationDeg` move the image centre on the ball (sphere is rotated so the centre sits at the projection pole).
- Canonical warp output: columns = axis, rows = rotation. The export may be transposed (`transpose()`); the 3D preview always uses the canonical layout.
- Image size can be defined by width or height; core only takes `imageWidthMm`.
- Projections: azimuthal equidistant (default), stereographic, Lambert equal-area.
- Latitude limit default about ±30° because of spot elongation and defocus.

## Conventions

- No backend, no uploads, no tracking. Everything runs in the browser.
- Keep `core/` free of DOM and browser APIs so it can be tested in Node.
- Heavy resampling runs in a Web Worker.
- Parameters live in the URL hash so setups are shareable.
- Add or update tests with every change to projection or warp maths.
- Record user-visible changes in `CHANGELOG.md` under `[Unreleased]`.

## Git

- Solo repo: commit and push directly to `main`, no branches or PRs unless asked.
- Never add `Co-Authored-By: Claude` or any other mention of Claude to commits or PRs.
