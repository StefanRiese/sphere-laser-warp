# CLAUDE.md

Guidance for working in this repository.

## Project

Sphere Laser Warp: a static, client-side website (GitHub Pages) that pre-warps a flat
image so it looks undistorted when laser-engraved on a ball with a rotary unit.
Primary hardware: xTool M1 + RA2 Pro, via xTool Creative Space or LightBurn.

## Planned layout

- `core/`: pure, DOM-free TypeScript (projections, warp, machine kinematics, G-code). Unit-tested.
- `web/`: Vite app (UI, canvas and three.js preview, Web Worker for resampling).
- `presets/`: machine presets as JSON.
- `docs/`: geometry write-up.
- `.github/workflows/pages.yml`: build and deploy to Pages.

## Geometry (keep consistent everywhere)

- Ball radius R, horizontal rotary axis, beam from the top.
- Axis position `x = R·sin φ`, rotation `θ = λ`.
- Versus a cylinder of equal diameter: width scale `1/cos φ`, height scale `cos φ`.
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
