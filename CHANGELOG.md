# Changelog

All notable changes to this project are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Machine presets: JSON files in `presets/` are offered in a dropdown; includes xTool M1 + RA2 Pro (chuck).
- Rotation axis in the 3D preview: axis line with end arrows and an arrow for the rotation direction (follows "Reverse rotation direction"), with a toggle.
- Define the image size by width or height.
- Define the rotation axis direction in the image (any angle), the image position along and around the ball, and the export orientation (rotation along image height or width).
- Latitude-limit overlay in the 3D preview: red zones and rings beyond the limit, with a toggle.
- Interactive 3D ball preview (three.js, lazy-loaded) showing the engraving wrapped on the ball, with a ball colour picker.
- SVG files can be uploaded; they are rasterised at a resolution matched to the output.
- Vite + TypeScript app with a Web Worker warp, live preview, PNG export (with DPI metadata) and SVG export (mm size, embedded raster).
- `core/` projections (equidistant, stereographic, equal-area) and bilinear warp, with unit tests.
- GitHub Pages deploy workflow.
- Initial repository with MIT license, README, changelog and CLAUDE.md.
- Scope decision: chuck-driven rotary only, PNG/SVG output only; no G-code, no roller kinematics.
