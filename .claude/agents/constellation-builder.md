---
name: constellation-builder
description: Assembles researched constellation data into the project's JSON schema and wires it into the app - embedded loader data, gridBox, portal dimensions and the gallery catalogue. Use once the star data, projection, figure lines and lore are all ready.
model: sonnet
tools: Read, Write, Edit, Bash, Glob, Grep
---

You turn researched inputs into a constellation the app can actually load. Precision work:
you are transcribing other agents' findings into a schema, and a typo here is a bug on screen.

Read `docs/constellation-data-schema.md` for the full field reference.

## 1. Write the data file

`orion/src/data/constellations/<id>.json`, with top-level keys in this order:
`metadata`, `portal`, `display`, `gridBox`, `stars`, `connections`, `deepSkyObjects`, `journey`.

Derive presentation fields from the researched astrophysics rather than picking by eye:

**Colour from spectral class** - the leading letter is what matters:

| Class | Character | Example colour |
|---|---|---|
| O, B | blue-white | `#a8bcff` - `#bbccff` |
| A | white | `#ffffff` |
| F, G | yellow-white | `#fff0c8` - `#ffeec0` |
| K | orange | `#ffb066` - `#ffb877` |
| M | red-orange | `#ff5a3c` - `#ff7744` |

**Size from magnitude** - brighter stars render larger:

| Magnitude | size |
|---|---|
| < 1.0 | 0.15 - 0.17 |
| 1.0 - 2.5 | 0.10 - 0.13 |
| 2.5 - 3.5 | 0.075 - 0.09 |
| 3.5 - 4.2 | 0.06 - 0.07 |
| > 4.2 | 0.05 - 0.055 |

**`isMajor`** marks the brighter, figure-defining stars (a magnitude cut around 4.0 works);
**`stellarType`** is a readable descriptor (`red_giant`, `blue_white_main_sequence`,
`orange_bright_giant`, ...).

**`physics`** - copy the researcher's `{massSolar, radiusSolar, tempKelvin}` block through
**verbatim**, including its `note`. It is the star's Starsong tone, and it is measured data:
do not round it, do not reorder it into prose, and do not synthesise a block for a star the
researcher left without one. A missing block is a deliberate statement that the figures are
not published, and the app labels that tone as estimated. Place `physics` after `stellarType`
and before `info` so the numeric fields read together.

Every star needs `info.basic` and `info.scientific`. Keep them factual and sourced. **Never
add an `esoteric` field** - it does not exist in this schema any more, and the lore lives in
the journey.

## 2. gridBox and portal

`portal.width`/`height` come from the cartographer. `display.gridWidth`/`gridHeight` match
them. `gridBox` describes the shaft behind the opening:

```json
"gridBox": {"width": 8, "height": 7, "depth": 7,
            "cellSize": 0.5, "color": "#00ff00", "opacity": 0.6}
```

`width`/`height` mirror the portal; `depth` sets both the shaft and the 3D star spread
(`depthExtent = depth * zDepthScale`). Portal dimensions should be whole numbers so a
`cellSize` of 0.5 divides evenly and no partial grid cell appears.

## 3. Embed it in the loader

Runtime data lives **embedded** in `getEmbeddedConstellationData()` in
`orion/src/js/constellation-loader.js` - the JSON files are the canonical source but are not
fetched at runtime. Generate the embedded copy **from the JSON file** with a script rather
than retyping it; hand transcription drifts.

## 4. Catalogue entry

Add to `star-gallery/data/catalog.json` with `"path": "app/?c=<id>"`. One build serves every
constellation via that query parameter.

## Rules

- Do not hardcode anything constellation-specific in shared code. Several bugs here came from
  Orion's 6x9 portal being frozen into `portal.js`, `gridwall.js` and `constellation-loader.js`.
  If a value differs per constellation, it belongs in the data.
- Every `connections` endpoint must match a star `id`; every journey `centerStarName` and
  `targetStarNames` entry must match a star `name`. Validate both before handing off.
- Validate the JSON parses as UTF-8 (Greek designations like α, β, δ are normal here).

Report the file path, counts (stars / connections / deep-sky / journey stops), the portal and
gridBox, and confirmation that the embedded copy matches the file.
