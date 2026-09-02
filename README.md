# STAR Arts — AR Constellation Gallery

A web-hosted gallery of augmented-reality constellation experiences, served as static files over HTTPS (GitHub Pages). Built from exported [8th Wall](https://www.8thwall.org/) / A-Frame projects, so they run in the phone browser (iPhone Safari + Android Chrome) with no app install.

## How it works

- **`index.html`** — the gallery landing page. It fetches `data/catalog.json` and renders a card + "Launch" link for each constellation.
- **`data/catalog.json`** — the catalog ("database") of constellations. Each entry points to a hosted experience folder.
- **`app/`** — a single self-contained AR build that serves every constellation. The constellation is chosen by a query parameter: `app/?c=orion`, `app/?c=andromeda`. A back control in the top-left of the experience returns to this gallery.

```
star-gallery/
├── index.html            # gallery landing page
├── data/
│   └── catalog.json      # list of constellations (the catalog)
├── app/                  # the AR experience (serves every constellation)
│   ├── index.html        #   app/?c=orion  |  app/?c=andromeda
│   ├── bundle.js
│   ├── external/         # bundled AR engine
│   └── assets/
└── README.md
```

## Adding a new constellation

1. Add the constellation to the app data (`src/data/constellations/<id>.json` plus the embedded
   copy in `constellation-loader.js`), then rebuild and copy the build into `app/`.
2. Add an entry to `data/catalog.json`:

   ```json
   {
     "id": "lyra",
     "name": "Lyra",
     "displayName": "Lyra the Harp",
     "description": "…",
     "path": "app/?c=lyra",
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

- One build serves all constellations, so the bundled AR engine (`external/`, the bulk of the ~37 MB) is downloaded once and shared rather than duplicated per constellation.
- The experiences use camera access (AR), so they must be opened over HTTPS on a supported mobile browser.
