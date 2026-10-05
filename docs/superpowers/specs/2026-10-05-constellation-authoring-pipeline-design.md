# Constellation authoring pipeline — design

**Date:** 2026-10-05
**Status:** Approved in brainstorming, awaiting spec review
**Repos touched:** this app repo, and the Constellation Brain vault at
`C:\Users\TearS\STAR-Arts\Consetellations\Constellation Brain` (its own git repo)

## 1. Goal

Make adding a constellation to the AR app fast, without lowering the standard the three shipped
constellations (Orion, Andromeda, Taurus) were held to. A new constellation must look and behave
exactly like the shipped ones; what differs between constellations is the number of stars, the
stars' details, and the deep-sky objects.

The plan is to add **a handful (2–5) next**, each reviewed carefully. This design speeds up the
one-at-a-time path. It does not batch-generate all 88.

## 2. Decisions taken in brainstorming

| Question | Decision |
|---|---|
| How many constellations | A handful next, each reviewed — speed up the per-constellation path |
| How journey stops are chosen | Story-first; popularity breaks ties |
| Deep-sky types with no renderer | Build new renderers as needed; each is designed on its own, preferably as a subtle change to an existing renderer |
| What lore may flow from the Brain into the app | The Brain's **sourced** tier only, from **historical cultures** only. No AI synthesis, no Starseed |
| Approach | **A — a deterministic draft generator; agents fill only the judgment gaps** |
| Research not already in the Brain | Is written **into the Brain first**, following the vault's own conventions, then flows to the app |
| `gen-web-data.mjs` in the vault | **Retire it** |

## 3. What exists today

This design extends a working pipeline rather than replacing it.

**In this repo:**
- Six agents in `.claude/agents/`: `constellation-orchestrator` plus `star-data-researcher`,
  `figure-cartographer`, `lore-researcher`, `constellation-builder`, `constellation-verifier`.
- `docs/constellation-pipeline.md` — handoff contracts and the eight failures the pipeline
  prevents. `docs/constellation-data-schema.md` — the field reference.
- `tools/import-brain.mjs` — imports figures and star identity from the Brain into `tools/brain/`.
- `tools/brain/` — already imported for **all 88 constellations**: 691 figure stars, 242 with
  proper names; `physics.json` holds measured mass, radius and temperature for **657 of 691**,
  sourced; `journeys-draft.json` covers only the three shipped constellations.
- `tools/project-constellation.js` — the shared projection. Verified 2026-10-05 to reproduce the
  shipped Andromeda's positions exactly (max difference 0.0).
- `tools/sync-loader-data.mjs` — regenerates the embedded copy in `constellation-loader.js` from
  the JSON. All three constellations pass `--check` as of 2026-10-05.
- `tools/render-journeys.mjs` — renders draft journeys into a review page.

**In the Brain:** an Obsidian vault with 88 constellation notes, 244 star notes, 2 object notes,
60 source notes, 8 culture notes and 5 thread notes; four agents (`star-harvester`,
`source-scribe`, `thread-weaver`, `vault-verifier`); a tested linter at `_meta/lint/`. Its
agents dispatch by name only when Claude Code runs inside the vault; from another project the
vault's own roster prescribes general agents handed the matching brief.

**Gone stale:** `import-brain.mjs` defaults to the vault's old OneDrive path, which no longer
exists. The pipeline doc's reference table predates Taurus, lists Andromeda at 15 stars (it has
6), and quotes a projection scale of 11.7818 (it is now 16.2118). Neither doc knows the
`pronunciation` field.

## 4. The data points

Every field a constellation needs, grouped by where it comes from. The first three groups are
instant and identical on every run; only **Researched** needs judgment.

### 4.1 Imported from the Brain
- `metadata.name`, `metadata.abbreviation`, `metadata.season`, `metadata.hemisphere`
- per star: `hip`, `name`, `designation`, `magnitude`, `spectralClass`
- the figure's connecting lines (Stellarium western sky culture)
- per named star: `pronunciation` — **when the star's vault note already carries it**. A named
  star whose note lacks one is a §4.5 gap, filled **into the vault** and then imported (§8.2), so
  the field always arrives by this route.

### 4.2 Harvested
From `tools/brain/physics.json`:
- per star: `distance`, `physics.massSolar`, `physics.radiusSolar`, `physics.tempKelvin`
- `physics.note` — a short attribution drawn from the harvest's `sources`

### 4.3 Computed by rule
Each rule was checked against the three shipped constellations.

| Field | Rule |
|---|---|
| star `id` | from the **designation**: Greek letters spelled out, superscripts to digits, any parenthetical dropped, lower-cased, runs of non-alphanumerics to one underscore — `θ² Tauri` → `theta2_tauri`, `64 Orionis` → `64_orionis`. Falls back to `hip_<number>` for a star with no designation. See §4.3.1 |
| `isMajor` | `magnitude < 4.0` — matches all 37 shipped figure stars, and 45 of 46 including cluster stars. The one exception is Merope (4.18) in the Pleiades cluster, hand-set as major; it is left as is |
| `position2D` | `project-constellation.js` over the final star set, in one pass |
| `portal.width`, `portal.height` | the projection tool's suggested whole-number portal |
| `portal.doorHeight` | `min(portal.height, 7)` |
| `display.gridWidth`, `display.gridHeight` | equal to the portal |
| `gridBox.width`, `gridBox.height` | equal to the portal |
| `gridBox.depth` | `min(portal.width, portal.height)` |
| `color` | from `physics.tempKelvin`, falling back to the spectral class letter, through the **same** blackbody ramp `star-visual` draws with — so the panel and flash tint match the rendered star |
| `size` | `0.1538 − 0.0205 × magnitude`, clamped to `[0.05, 0.17]` — a least-squares fit to the 46 shipped stars, mean error 0.008 against the hand-tuned values |
| `stellarType` | colour by spectral letter (O blue, B blue-white, A white, F yellow-white, G yellow, K orange, M red) joined to luminosity class (I supergiant, II bright giant, III giant, IV subgiant, V main sequence). Informational: no app code reads it |
| `info.scientific.class` | `"<spectralClass> <stellarType in words>"`, e.g. `"B7 III blue-white giant"` |
| connection `type` | `figure`; `belt` for an asterism to be drawn white (the only type the renderer treats specially) |
| journey `view` | `2d` |

The shipped three keep their hand-tuned `color` and `size`. These rules apply to new
constellations only.

#### 4.3.1 Why star ids come from the designation

A star's `id` must never change once shipped: `discovery-store` saves a user's visited stars
against it (`defaultStore.mark(constellation, record.id)`), and connections reference it. The
spec promises re-drafting whenever the Brain changes (§5.5), so the id rule must give the same
answer across re-drafts.

A **proper name can change** — Chamukuy and Tianguan are recent IAU names — so an id derived from
the name would silently move on a re-draft and orphan every user's progress on that star. A
**Bayer or Flamsteed designation never changes**, so that is what the id is built from.

The shipped ids follow no single rule — 37 of 46 match the name, 18 of 46 the designation; some
use the Bayer form (Chamukuy is `theta2_tauri`), Andromeda abbreviates (`delta_and`). **They are
left exactly as they are**, since changing any of them would wipe users' saved progress.

### 4.4 Drafted by rule, revised in review
`info.scientific.temperature`, `.mass` and `.radius` are drafted from the measured physics in
one consistent format — `"About 29,500 K"`, `"About 33 times the Sun's mass"`, `"About 20 times
the Sun's radius"` — and **revised by the prose stage wherever a source gives a range or a
caveat**. The shipped data shows why this cannot be fully automatic: Betelgeuse's radius reads
*"640–764 times the Sun's radius"* while its physics stores a single 700, and the three shipped
constellations do not share one format.

### 4.5 Researched
The labelled gaps the agents fill:
- per named star: `pronunciation`
- per star: `info.basic`, `info.scientific.feature`
- `metadata.displayName`, `metadata.description`, `metadata.mythology`
- the `journey` (§6)
- the `deepSkyObjects` (§7)

### 4.6 Shared defaults
Identical in all three shipped constellations: `portal.borderColor`, `doorDuration`,
`lineDrawDuration`, `lineDelay`, `portal.position`; `display.gridColor`, `gridSize`,
`distanceScale`, `zDepthScale`, `scale`, `position`; `gridBox.cellSize`, `color`, `opacity`,
`wallZ`.

### 4.7 Shared colour math
The blackbody ramp (`BB`, `bbColor`, `tempToRamp`, `CLASS_K`) moves out of
`orion/src/js/star-visual.js` into a dependency-free module that both `star-visual` and the draft
generator import. There is one ramp, not two. `star-visual`'s behaviour does not change.

## 5. The draft generator

```
node tools/draft-constellation.mjs <Abbr>        # e.g. Lyr
node tools/draft-constellation.mjs <Abbr> --promote
```

### 5.1 What it does
1. Reads `tools/brain/` (figure, identity, physics) and the deep-sky preset registry (§7.2).
2. Fills every field in §4.1–§4.4 and §4.6.
3. Runs the projection over the final star set in one pass.
4. Writes `tools/drafts/<id>.json` — the draft — and `tools/drafts/<id>.html` — the review sheet.

Drafts live **outside** `orion/src/data/` so an unfinished constellation cannot ship by accident.

### 5.2 Gaps
Researched fields are **left absent — never filled with placeholder text** — and listed in a
top-level `_draft` block. Each gap records its JSON path, what fills it, and whether it blocks
shipping. Placeholder text can render in the app as if it were real; an absent field cannot.

Two kinds:
- **Required** — star `info` (a star's panel will not open without it: `star-info-overlay`
  requires both name and info), `pronunciation` on every named star, the `journey`, each chosen
  deep-sky object, and `metadata.displayName`, `metadata.description` and `metadata.mythology`
  (all three shipped constellations carry all three, and the gallery card shows `displayName`).
- **Honest absence** — physics for a star whose sources publish none. It ships without, and the
  app labels its tone as estimated, as it does today. Physics is **never** inferred from the
  spectral class — failure #8 in the pipeline doc.

### 5.3 The review sheet
Built the way `render-journeys.mjs` builds its page. It shows: a preview of the figure; the star
table; the journey stops with their sources, **plus the candidate stops that were not chosen**;
the deep-sky objects and any renderer gaps; open `_draft` gaps; and warnings — projection
distortion past 45° (the pipeline doc names Hydra, Eridanus, Draco and Serpens), and which stars
have unpublished physics.

### 5.4 Promotion
`--promote` refuses while any **required** gap is open. Otherwise it copies the draft into
`orion/src/data/constellations/<id>.json` without the `_draft` block, runs
`sync-loader-data.mjs <id>`, and adds the entry to `star-gallery/data/catalog.json`, built from
the constellation's `metadata` and star count in the shape the three existing entries use
(`id`, `name`, `displayName`, `description`, `path: app/?c=<id>`, `stars`, `season`,
`hemisphere`). The verifier then runs. A shipped data file carrying a `_draft` block fails verification.

### 5.5 Determinism
The same inputs produce a byte-identical draft. A re-run after the Brain changes therefore shows
only what changed. Files are written LF, without a BOM, Greek letters unescaped — the same rules
`import-brain.mjs` already follows.

## 6. Choosing the journey

### 6.1 Kinds of stop
All four appear in the shipped journeys.

| Kind | Example | Targets |
|---|---|---|
| single star | Betelgeuse, Rigel, Aldebaran | one star |
| group | Orion's Belt; the Rainy Sisters (the Hyades) | a named asterism |
| pointer | The Little Cloud; Guest Star of 1054 | star(s) beside a deep-sky object |
| whole figure | The Bull of Heaven | the constellation's own myth |

### 6.2 Rules
- **Eligibility is story-first.** A stop exists only if a **sourced** telling from a
  **historical culture** supports it — checked in the Brain first, researched fresh if the Brain
  is thin. Brightness never earns a stop on its own.
- **Popularity breaks ties**, measured as the brightness of the stop's brightest star.
- **Four to five stops.** Fewer for a lore-poor constellation; never padded.
- **Ordered as a path across the figure, with a pointer stop last** where one exists. Since the
  journey now frames every stop against one fixed anchor, each stop slides the whole figure, so a
  path keeps each slide short.
- **Centre star:** the star itself for a single-star stop; the middle member for a group.
- Each stop carries `id`, `title`, `view`, `centerStarName`, `targetStarNames`, `story`, `sources`.

### 6.3 Who does what
The generator proposes **candidates** mechanically: named stars ranked by brightness, and the
stars nearest each deep-sky object as pointer candidates. It cannot find group or whole-figure
stops — those live in the sources, not the data. The lore stage selects the stops, finds the
groups, orders the path and writes each story with its sources. The user approves the selection
on the review sheet.

## 7. Deep-sky objects

### 7.1 Type and layer stay separate
`type` is what the object is, and is open-ended. `layer` is how the engine draws it when the
viewer enters: `nebula`, `galaxy`, `cluster`, or `none` (a tappable marker that cannot be
entered). A new type costs nothing; a new layer is engine work.

### 7.2 The preset registry
`tools/deep-sky-presets.json` maps each `type` to a layer and seed values for its `field` and
`render` blocks. The draft copies the preset **inline** into the object — the shape M42 and M31
already use — so each object can still be tuned individually afterwards. The app does not change
for any supported type.

It starts with only what exists today:

| Type | Status | Seeded from |
|---|---|---|
| `emission_nebula` | supported — `nebula` | M42 |
| `spiral_galaxy` | supported — `galaxy` | M31 |
| `open_cluster` with named members | supported — `cluster` | M45 (needs its own projected star set) |

Every other type is recorded as **needs a renderer**, with a suggested starting point:

| Type | Likely starting point |
|---|---|
| elliptical / dwarf galaxy | spiral generator, no arms, large bulge |
| reflection nebula | nebula generator, cooler palette |
| planetary nebula | nebula generator plus a ring layout |
| supernova remnant | nebula generator plus a filamentary shell |
| globular cluster | dense spherical point field |
| open cluster with unnamed members | sparse point field — the `cluster` layer cannot use it, because it rebuilds the cluster as a figure from named stars |

### 7.3 When a type has no renderer
It does not block the constellation. The draft gives the object `layer: none` with its sourced
info, and the review sheet lists it as a **renderer gap**. Each gap becomes its own design task,
starting from whether an existing generator can express it with a subtle change. When the
renderer exists, its preset joins the registry and the object is upgraded to enterable.

### 7.4 Which objects are included
Messier objects inside the constellation first — the canonical well-known list, which serves as
the popularity measure — then notable named objects with real lore. Every object needs sourced
info and sources, as a star does. Carried over from the pipeline: only the primary of a close
group gets its own ring; a far object parks at the back of the box with its real distance stated
in its info.

The Brain holds only two object notes (the Pleiades and the Hyades), so deep-sky research is done
fresh for each constellation and is the slowest part of adding one.

## 8. Data ownership and the Brain write-back

### 8.1 One owner per kind of data, flowing one way

| Data | Owner | Flow |
|---|---|---|
| figure, names, designations, HIP, positions, magnitudes | Brain | → app, by import |
| lore by culture, sources, cultures | Brain | → app; journeys and prose draw on it |
| `pronunciation` | Brain — star frontmatter | → app |
| deep-sky object lore, type, distance | Brain — `objects/` | → app |
| mass, radius, temperature, distance | app — `tools/brain/physics.json` | stays; the vault holds "only physics the lore needs" |
| panel prose, journey retelling | app | stays |
| positions, portal, render presets | app | stays |

### 8.2 Vault first
When research finds something the Brain should own, it is written into the vault, linted, then
re-imported; only then does the draft pick it up. Never the reverse. Every journey story in the
app therefore traces to a vault note, and the app never holds lore the vault does not.

### 8.3 Written by the vault's own rules
The agents filling gaps are handed the vault's own briefs — `star-harvester` and
`source-scribe` as they stand, plus a new **object brief** added to the vault's `.claude/agents/`:
`star-harvester`'s rules and back-half applied to `_templates/object.md`, since the vault has no
agent for objects today. The vault's `CLAUDE.md` and design doc are the law:

- **Star notes** from `_templates/star.md`: lore by tradition in the sourced tier with inline
  citations; `aliases` for every name a reader might arrive by; the three anchors the linter
  requires — a constellation, a source and a culture.
- **The back-half**, which the vault treats as non-negotiable: append the star to each cited
  source's `## Quoted in` and each culture's `## Stars and threads`; open a thread only when a
  motif reaches two cultures; update the constellation note and `Home.md`.
- **New sources** get a `sources/` note with `rights:` **before** anything cites them.
- **New deep-sky objects** get an `objects/` note from `_templates/object.md`.
- **`pronunciation`** goes in star frontmatter. It joins `_templates/star.md` and the vault's
  `CLAUDE.md`, so the vault's own harvests carry it too. The linter does not police frontmatter
  keys, so this needs no linter change.
- **Stars with no lore get no note.** The vault covers named stars only (244 of 691 figure stars)
  and the linter fails a star note with no culture link. Unnamed figure stars come from the
  import and the harvest alone.

### 8.4 Synthesis stays in the vault
The vault exists partly for its labelled cross-cultural synthesis, so the harvester may still
write it there. **The importer strips every `[!warning] Synthesis — AI-generated` callout and
every Starseed section** on the way to the app. The brainstorming decision is enforced in code,
not by discipline.

### 8.5 Two repos
Vault changes are committed in the vault's repo; app changes in this one. `node
_meta/lint/lint.mjs` must exit clean before any vault commit. The draft records the vault commit
it was built from, as provenance.

## 9. End to end

1. `import-brain.mjs` refreshes `tools/brain/` from the vault, stripping synthesis and Starseed.
2. `draft-constellation.mjs <Abbr>` writes the draft and review sheet.
3. Agents fill the gaps: lore, pronunciations and object notes **into the vault**, linted; journey
   and panel prose into the draft.
4. Re-import, re-draft. The only diff is what was added.
5. The user reviews the sheet.
6. `--promote`.
7. `constellation-verifier`, then app-preview, the user's device test, and promotion to live as
   today.

### 9.1 What happens to the agents

| Agent | Becomes |
|---|---|
| `star-data-researcher` | mostly replaced by import + harvest; confirms honest absence for unmeasured stars |
| `figure-cartographer` | replaced by the draft generator; its distortion warning moves to the review sheet |
| `lore-researcher` | narrowed: Brain first, writes back, applies §6 |
| `constellation-builder` | replaced by `--promote` |
| `constellation-verifier` | kept; gains three checks — no `_draft` block, `pronunciation` on every named star, no synthesis in app data |
| `constellation-orchestrator` | rewritten for §9's sequence |

## 10. Verification

- **Rules against reality.** Tests assert that the §4.3 rules for the portal, grid and box
  reproduce all three shipped constellations exactly, and that `isMajor` matches every shipped
  star except the one documented exception (Merope). A new exception means the rule is wrong.
- **Determinism.** Drafting the same constellation twice is byte-identical.
- **The importer's filter.** Tested on Vega, whose note carries both a synthesis callout and a
  Starseed section; neither may reach the import.
- **The promotion guard.** Refuses with a required gap open; succeeds once closed; the embedded
  copy then passes `sync-loader-data.mjs --check`.
- **The vault.** Lint clean after every write-back.
- **Projection.** The regression asserts shipped positions are reproduced, replacing the stale
  scale number.
- **Shared colour math.** `star-visual` renders identically before and after the ramp moves.

## 11. Repairs folded in

1. `import-brain.mjs`: default vault path to
   `C:\Users\TearS\STAR-Arts\Consetellations\Constellation Brain`.
2. **Retire** `_meta/scripts/gen-web-data.mjs` in the vault. It writes physics straight into this
   repo's shipped JSON, bypassing the embedded copy — failure #7. It is dormant (none of its
   distinctive fields are in the current data) but its relative paths still resolve, so it
   remains a live hazard.
3. `docs/constellation-pipeline.md`: the reference table gains Taurus and correct counts; the
   projection regression asserts positions, not a scale number.
4. `docs/constellation-data-schema.md`: add `pronunciation`, `_draft`, and the preset registry.

## 12. Out of scope

- **New deep-sky renderers.** Each is its own design (§7.3).
- **Retrofitting the shipped three** to the §4.3 rules. They keep their hand-tuned values.
- **Batch-drafting all 88.** The generator makes this possible later; it is not built for it now.

## 13. Pilot

The pilot is this design's acceptance test. The implementation plan builds the tooling; Lyra's
own content — its research, vault notes and review — is a separate piece of work run through the
finished pipeline, which is what proves it.

Prove the pipeline end to end on **Lyra**:
- Vega's lore is already rich in the Brain, so it exercises the reuse path.
- The figure is compact, so there is no projection distortion.
- Its marquee object, the Ring Nebula (M57), is a planetary nebula with no renderer, so it tests
  the renderer-gap path rather than only the happy one.
