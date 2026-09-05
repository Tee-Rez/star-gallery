# Constellation pipeline

How a constellation name becomes a working AR experience. The process is generic: it takes any
of the 88 IAU constellations, with no assumptions carried over from the ones already built.

It exists because Orion and Andromeda were built by hand, and the same handful of mistakes
showed up both times. Each stage below encodes what went wrong so it does not go wrong again.

## Running it

```
Use the constellation-orchestrator agent to add <constellation name>.
```

The orchestrator delegates each stage and checks the handoff before the next one starts. You
can also call a single specialist directly when only one part needs redoing - re-projecting
after a star set changes, or re-checking lore against sources.

## Stages

| # | Stage | Agent | Model | Why that model |
|---|---|---|---|---|
| 1 | Star set + astrometry + physics | `star-data-researcher` | sonnet | High-volume extraction from catalogue tables and infoboxes into a fixed shape. Needs care, not deep reasoning. |
| 2 | Figure lines + projection | `figure-cartographer` | sonnet | Decoding coordinates and driving a deterministic script; the maths lives in the tool, not the model. |
| 3 | Sourced lore | `lore-researcher` | **opus** | The judgment call that carries the most risk - separating documented history from plausible-sounding invention. Worth the tokens. |
| 4 | Data + integration | `constellation-builder` | sonnet | Schema transcription and precise file surgery. Mechanical but unforgiving. |
| 5 | Build + verification | `constellation-verifier` | **haiku** | A fixed checklist producing numbers. Cheapest model that can run commands and compare values. |
| — | Orchestration | `constellation-orchestrator` | **opus** | Sequences the work, judges whether each handoff is good enough, and decides when a stage must be re-run. |

Stage 3 needs only the star **names** from stage 1, so it can run alongside stage 2. Everything
else is sequential.

## Handoff contracts

**1 → 2** `tools/input/<id>-stars.json` — every star with `id`, `name`, `designation`, `raH`
(hours), `dec` (degrees), `dist`, `mag`, `spectralClass`, `source`; a `physics` block
(`massSolar`, `radiusSolar`, `tempKelvin`) on every star whose article publishes those figures;
optional `deepSky` entries with the same coordinate fields.

**2 → 4** The chosen portal `width`/`height`, the projection `scale`, a `position2D` per star
and per deep-sky object, and the connection pairs with a `type` on each.

**3 → 4** The `journey` array — each stop with `id`, `title`, `centerStarName`,
`targetStarNames`, `story`, `sources`.

**4 → 5** The data file path, the constellation `id`, and confirmation the embedded loader copy
matches the JSON.

## The six failures this pipeline exists to prevent

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
6. **Star tones left to the spectral-class estimate.** Each star sings a pitch derived from
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

## The projection tool

```bash
node tools/project-constellation.js <input.json>            # aspect + suggested portal
node tools/project-constellation.js <input.json> <W> <H>    # final positions
```

Shared so the maths is written once. It reproduces the shipped Andromeda exactly (scale
11.7818), which is the regression test to run if it is ever changed.

## Files

```
.claude/agents/            the six agent definitions
docs/constellation-pipeline.md      this file
docs/constellation-data-schema.md   the data contract
tools/project-constellation.js      shared projection
tools/input/<id>-stars.json         stage 1 output
orion/src/data/constellations/      canonical constellation data
star-gallery/data/catalog.json      gallery listing
```

## Reference state

Both shipped constellations pass every check in `constellation-verifier`, so either can be
read as a worked example of the schema:

| | Stars | Connections | Deep-sky | Stops | Portal | Measured physics |
|---|---|---|---|---|---|---|
| Orion | 15 | 15 | 2 | 5 | 6 x 9 | 15 / 15 |
| Andromeda | 15 | 14 | 5 | 5 | 8 x 7 | 14 / 15 |

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
