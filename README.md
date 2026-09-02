# STAR Arts — AR Constellation Gallery

A web-hosted gallery of augmented-reality constellation experiences, served as static files over HTTPS (GitHub Pages). Built from exported [8th Wall](https://www.8thwall.org/) / A-Frame projects, so they run in the phone browser (iPhone Safari + Android Chrome) with no app install.

## How it works

- **`index.html`** — the gallery landing page. It fetches `data/catalog.json` and renders a card + "Launch" link for each constellation.
- **`data/catalog.json`** — the catalog ("database") of constellations. Each entry points to a hosted experience folder.
- **`<id>/`** — one folder per constellation, containing that constellation's self-contained AR build (e.g. `orion/`).

```
star-gallery/
├── index.html            # gallery landing page
├── data/
│   └── catalog.json      # list of constellations (the catalog)
├── orion/                # Orion AR experience (self-contained build)
│   ├── index.html
│   ├── bundle.js
│   ├── external/         # bundled AR engine
│   └── assets/
└── README.md
```

## Adding a new constellation

1. Build/export the constellation experience and copy its files into a new folder, e.g. `lyra/`.
2. Add an entry to `data/catalog.json`:

   ```json
   {
     "id": "lyra",
     "name": "Lyra",
     "displayName": "Lyra the Harp",
     "description": "…",
     "path": "lyra/",
     "stars": 5,
     "season": "Summer"
   }
   ```

3. Commit and push — GitHub Pages redeploys automatically.

## Hosting (GitHub Pages)

This repo is served by GitHub Pages from the default branch root. HTTPS is required for camera access, and Pages provides it automatically.

- Repo → **Settings → Pages → Build and deployment → Source: Deploy from a branch**, branch `main` / folder `/ (root)`.
- The site appears at `https://<user>.github.io/<repo>/`.

## Notes

- Each constellation build is self-contained (bundles its own AR engine), so it keeps working independently. The bundled engine (`external/`) is the bulk of each build; a future optimization is to share one engine across constellations.
- The experiences use camera access (AR), so they must be opened over HTTPS on a supported mobile browser.
