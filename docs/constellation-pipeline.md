# Constellation pipeline

How a constellation name becomes a working AR experience. The process is generic: it takes any
of the 88 IAU constellations, with no assumptions carried over from the ones already built.

It exists because Orion and Andromeda were built by hand, and the same handful of mistakes
showed up both times. Each stage below encodes what went wrong so it does not go wrong again.

## Running it

```
Use the constellation-orchestrator agent to add <constellation name>.
```

Or by hand, which is the same sequence:

```bash
node tools/import-brain.mjs                    # refresh tools/brain/ from the vault
node tools/draft-constellation.mjs Lyr         # tools/drafts/lyra.json + lyra.html
#   ...fill the gaps the draft lists, vault first...
node tools/import-brain.mjs && node tools/draft-constellation.mjs Lyr
node tools/draft-constellation.mjs Lyr --promote
```

Spec: `docs/superpowers/specs/2026-10-05-constellation-authoring-pipeline-design.md`.

## Where the data comes from

| Data | Owner | How it arrives |
|---|---|---|
| figure, names, designations, HIP, positions, magnitudes | the Constellation Brain vault | `import-brain.mjs` → `tools/brain/` |
| lore by culture, sources, pronunciations, deep-sky object notes | the vault | read by `tools/lib/brain-lore.mjs`, synthesis and Starseed removed |
| mass, radius, temperature, distance | `tools/brain/physics.json` (the harvest) | measured values only, via `measuredPhysics` |
| ids, sizes, colours, isMajor, portal, grid, box, season, hemisphere, positions | computed | `tools/lib/constellation-rules.mjs`, `project-constellation.js` |
| journey, panel prose, physics overrides, deep-sky objects | researched | `tools/input/<id>-research.json` |

**Vault first.** Anything researched that the vault should own - lore, a pronunciation, an
object's history - is written into the vault by its own rules, linted and committed there, then
re-imported. The app never holds lore the vault does not.

## The draft

`draft-constellation.mjs` writes the shipped schema plus a `_draft` block, and never fills a
researched field with placeholder text - an absent field cannot render as if it were real.

- `required` - blocks promotion: star `info`, `pronunciation` on each named star, a full spectral
  class, the `journey`, the deep-sky list (`[]` is an answer), and `displayName`, `description`
  and `mythology`.
- `absences` - stars whose harvest holds only spectral-type estimates. They ship without
  `physics` and the app labels their tone as estimated (failure #8).
- `rendererGaps` - deep-sky objects whose type has no renderer. They ship with `layer: "none"`,
  which keeps them in the data but draws nothing; each gap is its own design task.
- `journeyCandidates` - named stars by brightness, and the two stars nearest each object.
- `scientificDrafts` - the panel's science lines in one format, to revise into `info.scientific`.

The review sheet, `tools/drafts/<id>.html`, shows all of it with the figure as the portal frames
it. `--promote` refuses while any required gap is open; otherwise it writes the data file without
`_draft`, adds the loader's embedded block with `sync-loader-data.mjs <id> --add`, and checks the
two agree.

**The gallery catalogue waits.** `star-gallery/data/catalog.json` drives the live gallery, so a
new constellation's card is added when it is promoted to live, not at app-preview.

## Agents

| Agent | Model | Role now |
|---|---|---|
| `constellation-orchestrator` | **opus** | Runs the sequence above and enforces its gates. |
| `lore-researcher` | **opus** | Brain first; writes back to the vault; chooses and writes the journey (spec section 6). |
| `star-data-researcher` | sonnet | Confirms each physics absence against the star's own article, or supplies a measured override. |
| `constellation-verifier` | **haiku** | Build, geometry and data checks, including no `_draft`, pronunciations, and no synthesis. |
| `figure-cartographer`, `constellation-builder` | sonnet | Retired from new constellations - the generator and `--promote` do their work. Kept for hand edits. |

## The eight failures this pipeline exists to prevent

1. **A star that is not in the figure.** Orion carried "Eta Orionis" in its sword; the real eta
   Orionis is west of the belt. Reconcile the star set against sourced figure lines, and
   against the user's reference image when there is one.
2. **Projecting a stale star set.** The projection centre is the set's own centroid, so adding
   two stars to Andromeda moved every position *and* changed the portal aspect from 1.44 to
   1.16. Any change to the set means a full re-projection.
3. **Invented lore.** The original per-star "esoteric" text was fabricated. Sourced or absent.
4. **One constellation's dimensions hardcoded in shared code.** Orion's 6x9 portal was frozen
   into the hider wall travel, the grid wall sizing and the position scaling. All three only
   surfaced when a second constellation arrived. Anything that varies per constellation belongs
   in the data.
5. **Measuring geometry in world space.** `#root` moves when the constellation is placed, so
   world coordinates taken moments apart are not comparable. Measure in `#root`-local space.
6. **Editing `constellation-loader.js` with a tool that normalises line endings.** That file
   is ~92 KB, mostly one embedded data literal. Three separate attempts in this project turned a
   ten-line change into a 1,500-2,900 line diff by rewriting every line ending; all three were
   caught only by running `git diff --stat` before committing, and discarded. Patch it with a
   byte-precise script, check the stat, and never commit a reformatted file. The same hazard
   applies to the JSON data files: rewriting one with `json.dumps` escapes every Greek letter in
   a designation (`α` becomes `α`), so change a single value surgically in the raw
   text instead of re-serialising the document.
7. **Hand-editing the embedded copy.** The runtime reads the copy inside
   `getEmbeddedConstellationData()`, not the JSON file. Regenerate it from the file with a
   brace-matching script and then assert the two are deep-equal; Orion once drifted silently and
   the difference was invisible on screen.
8. **Star tones left to the spectral-class estimate.** Each star sings a pitch derived from
   `nu_max ∝ M / (R² √T)`. Without measured mass, radius and temperature the app estimates all
   three from the spectral class - and measured against the real figures for Andromeda that
   estimate was out by up to **4.6x**, agreed on the size ordering for only **6 of 14** stars,
   and handed three Orion stars an *identical* tone because they share a class. Radius is
   squared, so its error dominates. Collect the real numbers in stage 1.

## Star tones

The Starsong tab plays each star, so the physics is part of the data, not an afterthought.

- **Where the numbers come from.** The "List of stars in <Constellation>" page does *not*
  carry mass, radius or temperature. Each star's own Wikipedia article does, in the infobox.
  That is one fetch per star, at stage 1, by `star-data-researcher`.
- **What honest absence looks like.** Some stars genuinely have no published mass or radius.
  Phi Andromedae publishes temperature and luminosity but only a *combined system* mass, so it
  ships with no `physics` block and the app labels its tone as estimated. Inventing a mass from
  the spectral type would be the fallback wearing a measurement's clothes.
- **How it is checked.** `constellation-verifier` section 1b reports measured coverage, flags
  any zero or shared `nu_max`, and prints the stars ordered by pitch - which must run from the
  largest and coolest up to the smallest and hottest.

## Deep-sky objects: the second layer

A constellation's nebulae, galaxies and clusters are not decoration — each one with a `layer`
becomes a place you can go. See `docs/constellation-data-schema.md` for the full field
reference; what the pipeline needs to know:

- **The research file lists them** under `deepSky`: `raH`/`dec`, distance, magnitude, angular
  size, `type`, a `description`, and - for anything the viewer can enter - sourced `info` and
  `sources`. Their history goes into the vault's `objects/` first.
- **The type picks the layer.** `tools/deep-sky-presets.json` maps each `type` to a renderer and
  seeds its `field`/`render` blocks inline. A type with no renderer ships as `layer: "none"` -
  in the data, but invisible: the loader draws markers only for objects it can enter. Such an
  object reaches the viewer through the journey's prose until its renderer is designed.
- **The generator projects them in the same run** as the stars, so they share a centre and scale.
- **Only the primary of a close group gets a marker.** Companions carry `"layer": "none"`.
- **A cluster needs its own star set**, in the full star schema with `physics`, projected to fit
  the PARENT's portal because it borrows that portal and box.
- **Depth is clamped, never extended.** A far object parks at the back of the box, so the real
  distance has to be stated in `info.scientific` — the geometry no longer carries it.

## Genericity notes

The pipeline has to cope with the whole sky, not just the bright northern figures:

- **Lore-poor constellations.** Lacaille's 18th-century southern inventions (Antlia, Fornax,
  Telescopium...) have no classical mythology and many unnamed stars. The lore agent falls back
  to naming history, deep-sky objects or observational history, and produces fewer stops rather
  than padding.
- **Sprawling constellations.** Gnomonic projection distorts beyond roughly 45 degrees from its
  centre and fails near 90. `tools/project-constellation.js` reports `maxSeparationDeg` and
  warns; Hydra, Eridanus, Draco and Serpens will trip it.
- **Any portal aspect.** Portrait, landscape or square. Orion is 6x9, Andromeda 8x7. The tool
  suggests a whole-number portal from the figure's own aspect.
- **Stars without proper names.** Bayer or Flamsteed designations are normal and fine.
- **Constellations crossing 0h RA.** The figure-line source uses negative degrees there; convert
  before matching.

## Verifying in a browser

Earlier belief in this project was that nothing could be checked without a phone, because the
app boots through 8th Wall's `xrweb` SLAM pipeline. That is wrong, and the over-caution let a
dead-on-arrival bug reach review: **the camera gates AR placement only.** A-Frame component
initialisation, event wiring, the scene graph, `localStorage` and the HUD all work headlessly.

```bash
cd orion && npm run build
npx http-server dist -p 5111 -c-1 -s     # -c-1 disables caching
```

Then load `http://127.0.0.1:5111/index.html?c=<id>` and drive components from the console.

- **Use `npx http-server`, not `python -m http.server`** — the latter behaved unreliably here
  and the app silently fell back to default data, which looks like a passing test.
- **Disable caching (`-c-1`).** A stale `bundle.js` will happily report the previous build's
  behaviour; a query string on the HTML does not bust the bundle.
- What still needs a real device: frame rate with camera plus SLAM running, and any judgement
  about how something *looks*.

## The projection tool

```bash
node tools/project-constellation.js <input.json>            # aspect + suggested portal
node tools/project-constellation.js <input.json> <W> <H>    # final positions
```

Shared so the maths is written once; the draft generator calls it. The regression test if it is
ever changed: it must reproduce every shipped position exactly from `tools/input/<id>-stars.json`
- Orion at 6 x 9 (scale 14.218), Andromeda at 8 x 7 (16.2118) and Taurus at 8 x 6 (12.3288), all
19, 6 and 12 stars matching to the last digit.

## Files

```
.claude/agents/                     the agent definitions
docs/constellation-pipeline.md      this file
docs/constellation-data-schema.md   the data contract
tools/import-brain.mjs              vault -> tools/brain/
tools/draft-constellation.mjs       draft, review sheet, --promote
tools/lib/constellation-rules.mjs   every computed field
tools/lib/brain-lore.mjs            vault lore, synthesis and Starseed removed
tools/deep-sky-presets.json         deep-sky type -> renderer
tools/project-constellation.js      shared projection
tools/sync-loader-data.mjs          data file -> the loader's embedded copy
tools/input/<id>-research.json      everything researched for one constellation
tools/drafts/<id>.json, .html       the draft and its review sheet
orion/src/data/constellations/      canonical constellation data
star-gallery/data/catalog.json      gallery listing (live only)
```

## Reference state

The shipped constellations pass every check in `constellation-verifier`, so either can be
read as a worked example of the schema:

| | Stars | Connections | Deep-sky | Stops | Portal | Measured physics |
|---|---|---|---|---|---|---|
| Orion | 19 | 21 | 2 | 5 | 6 x 9 | 19 / 19 |
| Andromeda | 6 | 5 | 5 | 4 | 8 x 7 | 6 / 6 |
| Taurus | 12 | 12 | 2 | 4 | 8 x 6 | 12 / 12 |

Three inconsistencies were closed when this pipeline was written, all of them the kind the
stages above now prevent:

- The fabricated `esoteric` fields were deleted from `orion.json` and from the embedded copy.
  They had been removed from the *app* earlier but left in the data.
- Orion's journey lived only in the embedded copy; it now lives in `orion.json` like
  Andromeda's, and the embedded copy is generated from the file.
- **`orion.json` had drifted from what actually ran.** It still listed Eta Orionis rather than
  42 Orionis and carried pre-projection hand-tuned positions. Worse, the embedded copy itself
  held a stale projection: when Eta was swapped for 42 Orionis the new star was placed using
  the *old* centroid instead of re-projecting the set, which is failure #2 above. Orion has
  since been re-projected cleanly over its final 15 stars (scale 13.0712) and both copies are
  now byte-identical.

That last one is the argument for the whole pipeline: the drift was invisible on screen -
about 0.05 units - and would never have been caught by looking at the app.
