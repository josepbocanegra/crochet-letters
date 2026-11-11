# Crochet letter

Turn a letter or a digit into a crochet stitch chart. The glyph is rasterised
with the chosen font, thresholded into a grid where every square is one single
crochet, and exported as a printable A4 PDF.

Pick the letter, the width and height in stitches, the font, and the ink
threshold; the chart can be edited square by square before exporting. The
squares have a colour of their own, and the background can be picked by hand or
derived from the letter colour by colour theory (complementary, split
complementary, analogous, triadic, monochrome).

This started as a small app my wife asked for — she loves crochet and wanted her
letters as stitch charts — and it is kept small on purpose: one page, no
account, no backend.

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # logic, colour rules and PDF checks (node --test style asserts)
npm run build    # dist/
```

No runtime dependencies: the build is Vite + TypeScript, and the PDF is written
by hand in `src/pdf.ts` (no library). Fonts come from Google Fonts at runtime,
so the font picker needs network access.

## Where things live

| File | What it holds |
| --- | --- |
| `src/model.ts` | Stitch limits, fonts, letter parsing, pattern type |
| `src/color.ts` | Hex/HSL conversion and the background colour rules |
| `src/raster.ts` | Draws the glyph on a canvas and loads the web font |
| `src/trace.ts` | Turns the glyph bitmap into the stitch grid |
| `src/pdf.ts` | A4 PDF writer (page geometry, cells, row numbers) |
| `src/main.ts` | DOM wiring, state, chart rendering, downloads |
| `deploy/` | Script and nginx vhost for a self-hosted deployment |

## Deploying

Self-hosted on an nginx container; see [`deploy/README.md`](deploy/README.md).

`deploy/` is a **minimal example**, kept short so it can be read in one sitting:
SSH to one machine, `rsync` the bundle, reload nginx. It is not a productised
pipeline — no TLS, no security headers, no rollback, no CI — and you are expected
to **replace it with whatever fits your infrastructure** (Pages hosting, a
container, `systemd` + CI, …). The app itself is just static files and does not
care how they get there.

## Credits

Background photograph, fonts and their licences: see [`CREDITS.md`](CREDITS.md).

## Licence

MIT — see [`LICENSE`](LICENSE). Forks, changes and commercial use are welcome;
keep the copyright notice and the licence text with the copy.
