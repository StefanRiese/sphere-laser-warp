# Changelog

All notable changes to this project are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Interactive 3D ball preview (three.js, lazy-loaded) showing the engraving wrapped on the ball, with a ball colour picker.
- SVG files can be uploaded; they are rasterised at a resolution matched to the output.
- Vite + TypeScript app with a Web Worker warp, live preview, PNG export (with DPI metadata) and SVG export (mm size, embedded raster).
- `core/` projections (equidistant, stereographic, equal-area) and bilinear warp, with unit tests.
- GitHub Pages deploy workflow.
- Initial repository with MIT license, README, changelog and CLAUDE.md.
- Scope decision: chuck-driven rotary only, PNG/SVG output only; no G-code, no roller kinematics.
