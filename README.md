# Sphere Laser Warp

A browser tool that pre-distorts a flat image so that, once engraved on a ball
(for example a glass Christmas bauble) with a rotary unit, it looks **undistorted**.

Everything runs client-side as a static site on GitHub Pages. Images are never uploaded.

> **Status:** M1 implemented (upload, warp preview, PNG/SVG export). See [CHANGELOG.md](CHANGELOG.md).

## Usage

1. Open the site, load an image (PNG, JPG, SVG and other browser-supported formats), enter the ball diameter and the image width on the ball.
2. Define the image size by width or height, set which image direction runs along the rotation
   axis, and optionally move the image along or around the ball.
3. Download the **PNG** (carries the DPI, so it imports at the right size) or the **SVG**
   (physical size in mm, raster embedded) and import it in xTool Studio / LightBurn.
4. In rotary mode set the object diameter to the ball diameter. By default the image width runs along
   the rotation axis and the image height wraps around the ball; the export orientation can be swapped.

Import behaviour of the SVG in xTool Studio is untested; use the PNG if it misbehaves.

## Development

```sh
npm install
npm run dev     # local dev server
npm test        # unit tests for core/
npm run build   # typecheck + production build into dist/
```

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

Developed for an **xTool M1** with an **RA2 Pro** rotary in **chuck mode** (the ball is
clamped and rotated directly, no rollers), using xTool Creative Space or LightBurn in
rotary mode. Other gantry or rotary setups should work through the
generic PNG export.

## Planned features

- [x] M1: image upload (raster and SVG), parameter form, live pre-warped preview, PNG and SVG export
- [x] M2a: 3D ball preview
- [x] M2b: latitude-limit overlay in the preview
- [ ] M3: machine presets (xTool M1 + RA2 Pro chuck first); G-code and roller-drive maths are out of scope
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
