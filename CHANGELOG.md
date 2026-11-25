# Changelog

All notable changes to this project are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- "GitHub" link in the header pointing to the repository.
- Site icon (favicon, also shown next to the title in the header) and status badges in the README.
- Theme switch (sun/moon icon button, light/dark; starts with the system setting), remembered across visits; the dark theme now has readable button text.
- "Donate" / "Spenden" button in the header linking to the maintainer's PayPal.me page.
- Vector export: for an uploaded SVG, "Download vector SVG (paths)" warps the paths onto the ball and writes them as polylines in mm (fills, strokes, fill rules and holes kept; constant stroke width; unsupported content is reported).
- Warp core (`core/`): equidistant, stereographic and equal-area projections, bilinear resampling, with unit tests.
- Web app (Vite + TypeScript, warp in a Web Worker) with live flat preview, PNG export (with DPI metadata) and SVG export (size in mm, embedded raster).
- Upload of raster images and SVG files (SVGs are rasterised at a resolution matched to the output).
- Image size defined by width or height; rotation axis direction in the image (any angle); image position along the axis; export orientation (rotation along image height or width).
- Interactive 3D ball preview (three.js, lazy-loaded) with ball colour picker, rotation axis and rotation direction arrow, and a switch to show the original image without warp for comparison.
- Built-in sample image, loaded on start.
- Calibration test pattern (5 mm grid, 10 mm centre square, circles, corner squares) and a helper that evaluates a measured test engraving and suggests the real ball diameter.
- Machine presets: JSON files in `presets/` appear in a dropdown; includes xTool M1 + RA2 Pro (chuck, axis direction 90°).
- English / German language switch, following the browser on first visit and remembered afterwards. UI texts live in `web/strings.ts`; a test keeps both languages in sync.
- GitHub Pages deploy workflow (tests, build, deploy).
- README, changelog and CLAUDE.md; MIT license.

### Changed
- The output is cropped to the image footprint and never padded; the info line shows how far from the equator the image reaches.
- The file hint under the preview follows the export orientation.

### Removed
- Latitude limit and its 3D overlay.
- Mirror option and reverse-rotation-direction option.
- Descriptive text under the preset dropdown.
- Scope decisions: no G-code generation, no roller-drive kinematics.

### Fixed
- The flat preview has a fixed frame, so changing the resolution or the image size no longer changes its displayed size.
- The "without warp" 3D view respects the rotation axis direction in the image.
