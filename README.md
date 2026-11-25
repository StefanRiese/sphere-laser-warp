# Sphere Laser Warp

A browser tool that pre-distorts a flat image so that, once engraved on a ball
(for example a glass Christmas bauble) with a rotary unit, it looks **undistorted**.

Everything runs client-side as a static site on GitHub Pages. Images are never uploaded.

> **Status:** planning. No code yet, see [CHANGELOG.md](CHANGELOG.md) and the roadmap below.

## The problem

On a sphere, rows of the engraving are circles of latitude. Away from the equator
they are shorter than the equator, and the surface tilts away from the beam. A flat
image engraved as-is is stretched horizontally and compressed vertically toward the
poles. This tool applies the inverse warp.

## How it works

For a ball of radius R with a horizontal rotary axis:

- axis position `x = R·sin φ`, rotation angle `θ = λ` (latitude φ, longitude λ)
- the image is placed on the sphere with a chosen projection (azimuthal equidistant by
  default, also stereographic and Lambert equal-area)
- the output raster is resampled so columns/rows map to axis position and rotation
- relative to a cylinder of the same diameter: width is scaled by `1/cos φ`, height by `cos φ`

Beyond roughly ±30–35° latitude the spot elongates and defocuses, so the tool shows a
warning overlay for that zone.

## Target hardware

Developed for an **xTool M1** with an **RA2 Pro** rotary, using xTool Creative Space
or LightBurn in rotary mode. Other gantry or rotary setups should work through the
generic PNG export.

## Planned features

- [ ] M1: image upload, parameter form, live pre-warped preview, PNG export
- [ ] M2: 3D ball preview, extra projections, latitude-limit overlay
- [ ] M3: G-code export, machine presets (xTool M1 + RA2 Pro first), roller-drive maths
- [ ] M4: SVG path warp, tiled-cap mode for large images
- [ ] M5: calibration test pattern and fitting

## Planned stack

TypeScript, Vite, a small UI layer, Web Workers for resampling, three.js for the 3D
preview, GitHub Actions deploying to GitHub Pages.

## Notes on glass

A blue diode laser barely marks clear glass. Engrave a coating (the mirror or paint
layer on a bauble) or apply a black paint or spray layer. Test on a spare ball first.

## Contributing

Issues and presets for other machines are welcome once the first release is out.

## License

[MIT](LICENSE)
