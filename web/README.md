# Coco Web Pet

The web edition is a standalone static PWA. It uses the same authored whole-character frames as the Windows and macOS editions and can be deployed independently through GitHub Pages.

## Local preview

From the repository root, run:

```powershell
./tools/prepare_web_preview.ps1
python -m http.server 8080
```

Then open `http://localhost:8080/web/`. The preview script creates a local `web/assets` junction on Windows, so it does not duplicate the animation files. Remove the junction with `./tools/prepare_web_preview.ps1 -Remove` when desired.

Do not open `index.html` directly from `file://`; the browser cannot load `data.json` or register the service worker in that mode.

## GitHub Pages

`.github/workflows/pages.yml` validates the site, expands the losslessly deduplicated runtime archive (222 unique PNGs for 292 logical frame references), assembles the web shell and assets into one Pages artifact, and deploys it on pushes to `main` that affect the web edition. In repository **Settings → Pages**, set **Source** to **GitHub Actions** once. The expected project URL is:

`https://forcemind.github.io/PetDesktop/`

## Web-only features

- 32 selectable authored actions plus body-region interactions
- one-slot click queue, with a neutral standing handoff between actions
- automatic performances and optional idle gestures
- five idle outfits, four backgrounds, adaptive bilingual speech bubbles
- drag, wheel resize, keyboard shortcuts, fullscreen and saved preferences
- mobile-first bottom-sheet controls, touch dragging, body-area taps and two-finger pinch resize
- installable PWA shell with on-demand offline frame caching
