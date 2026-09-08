# Constellation data schema

The contract for `orion/src/data/constellations/<id>.json`. Applies to any constellation.

Canonical copies live in that folder, but the app does **not** fetch them at runtime — the same
object is embedded in `getEmbeddedConstellationData()` in `orion/src/js/constellation-loader.js`.
Generate the embedded copy from the file with a script; hand transcription drifts.

Top-level keys, in order:
`metadata`, `portal`, `display`, `gridBox`, `stars`, `connections`, `deepSkyObjects`, `journey`.

## metadata

```json
{"name": "Andromeda", "displayName": "Andromeda the Chained Princess",
 "description": "...", "mythology": "...",
 "season": "autumn", "hemisphere": "northern", "abbreviation": "And"}
```

`name` is what the HUD shows. `abbreviation` is the IAU three-letter code — also the key used to
look the figure up in the d3-celestial line data.

## portal

```json
{"width": 8, "height": 7, "borderColor": "#00ff00", "doorHeight": 7,
 "doorDuration": 4000, "lineDrawDuration": 1000, "lineDelay": 100,
 "position": {"x": 0, "y": 0, "z": 0.1}}
```

`width`/`height` are the nominal portal size and the units `position2D` is fitted to. **The
drawn frame is half that** — `portal.js` draws its border at `width/4` and `height/4`
half-extents, and the constellation container's 0.5 scale makes the two agree. Several bugs
came from missing that relationship, so anything deriving geometry from the portal must use
`width/4`, not a constant.

Use whole numbers so a `cellSize` of 0.5 divides evenly and no partial grid cell appears.

## display

```json
{"gridWidth": 8, "gridHeight": 7, "gridSize": 0.5, "gridColor": "#00ff00",
 "distanceScale": 0.0009, "zDepthScale": 0.7,
 "scale": {"x": 0.5, "y": 0.5, "z": 0.5},
 "position": {"x": 0, "y": 0, "z": -1.5}}
```

`gridWidth`/`gridHeight` mirror the portal. `scale` and `position` place the constellation
container relative to the portal — the grid walls use them to put the shaft's front edge on the
portal plane.

## gridBox

The shaft behind the opening.

```json
{"width": 8, "height": 7, "depth": 7, "cellSize": 0.5,
 "color": "#00ff00", "opacity": 0.6}
```

`width`/`height` mirror the portal; `depth` sets both how far the shaft recedes and the 3D star
spread (`depthExtent = depth * zDepthScale`). Left and right walls span `depth × height`; top
and bottom span `width × depth`.

## stars

```json
{"id": "mirach", "name": "Mirach", "designation": "β Andromedae",
 "isMajor": true, "position2D": {"x": -1.476, "y": -0.639},
 "distance": 199, "magnitude": 2.07, "spectralClass": "M0III",
 "color": "#ff7744", "size": 0.13, "stellarType": "red_giant",
 "info": {"basic": "...", "scientific": {"class": "...", "temperature": "..."}}}
```

- `id` — lowercase snake_case, referenced by `connections`.
- `name` — the display name; the DOM exposes it as `data-name` and the journey looks stars up
  by it. Must be unique.
- `position2D` — from `tools/project-constellation.js`, fitted to this constellation's portal.
- `distance` in light-years; drives the 3D depth spread.
- `color` from spectral class, `size` from magnitude — see `constellation-builder`.
- **No `esoteric` field.** It was removed after the original text proved fabricated; lore lives
  in `journey` with sources.
- `physics` *(strongly recommended)* —
  `{"massSolar": 3.63, "radiusSolar": 2.94, "tempKelvin": 11950, "note": "Primary"}`.

  Feeds the star's Starsong tone through `nu_max ∝ M / (R² √T)`, which needs numbers rather
  than the prose in `info.scientific`. Take them from the **individual star's Wikipedia
  infobox** - the "List of stars in..." page does not carry them. Quoted ranges become the
  central value; multiple systems use the named primary, recorded in the optional `note`
  (`"Component Aa"`, `"14-19 M, 640-764 R; midpoints"`).

  Formally optional. When absent, mass, radius and temperature are all estimated from
  `spectralClass`, and the Starsong tab honestly labels the tone as derived from the star's
  TYPE rather than measured. But the estimate is poor: checked against Andromeda's real
  figures it was out by as much as 4.6x, matched the true size ordering for only 6 of 14
  stars, and gave three Orion stars an identical tone for sharing a class. Radius is squared
  in the relation, so its error dominates.

  **Never guess to fill the field.** A star whose article publishes temperature but not mass -
  Phi Andromedae is the standing case - ships with no `physics` block at all. Half-measured is
  the fallback wearing a measurement's clothes.

## connections

```json
{"from": "almach", "to": "mirach", "type": "body"}
```

Endpoints are star `id`s and must all resolve. `type` names the limb (`belt`, `sword`, `chain`,
`arm`, `wing`, `tail`...) — free-form, drawn from the figure itself.

## deepSkyObjects

Every object carries the base fields, and is projected in the **same run** as the stars so they
share a centre and scale:

```json
{"id": "m31", "name": "Andromeda Galaxy", "designation": "M31, NGC 224",
 "type": "spiral_galaxy", "layer": "galaxy",
 "position2D": {"x": -0.315, "y": 0.462},
 "distance": 2537000, "magnitude": 3.44, "size": 2.0, "description": "..."}
```

### `layer` — whether it is explorable, and how

`type` keeps its astronomical meaning. **`layer` selects behaviour**, and is what the deep-sky
feature reads:

| `layer` | Tapping its marker |
|---|---|
| `nebula` | constellation hides; a turbulent gas field grows at the CENTRE of the grid |
| `galaxy` | same, with a spiral-arm field instead |
| `cluster` | the cluster's own stars REPLACE the constellation; explore them like any figure |
| `none` | no marker; the object stays in the data but out of the layer |

`resolveLayer()` in `src/js/deep-sky-field.js` derives it: an explicit valid `layer` wins,
otherwise it is inferred from `type` by substring, otherwise `none`. Prefer stating it
explicitly anyway — a reader should not have to run the resolver in their head.

**Only one object of a close group gets a marker.** M42 and M43 sit 0.03 units apart in Orion's
sword; M31, M32 and M110 within 0.2 in Andromeda. Overlapping rings are untappable, so the
companions carry `"layer": "none"`.

**An in-layer object MUST have `position2D`.** `createDeepSkyMarkers()` reads it without a guard,
so a marked object without one throws at load — and if it happens during a cluster restore it
leaves the layer stuck over a half-restored figure.

### `field` — the look of a nebula or galaxy

Required for `nebula` and `galaxy`; meaningless for the others. Keys must match
`FIELD_DEFAULTS[layer]` in `src/js/deep-sky-field.js`, and `colors` is a comma-separated
**string**, not an array — it is read through an A-Frame schema.

```json
"field": {"count": 3200, "spread": 3.4, "sizeRatio": 0.13, "opacity": 0.24,
          "turbulence": 3.6, "contrast": 3.2, "cores": 4, "coreGain": 0.9,
          "dust": 0.8, "fill": 1.9, "embedded": 4, "spin": 0.05,
          "colors": "#eaf2ff,#ffe0c4,#ff4d6a,#8e1e46"}
```

Gas and stars want **opposite** treatments, established by prototype and easy to get backwards:

| | Nebula | Galaxy |
|---|---|---|
| `sizeRatio` | ~0.13 — **large** sprites | ~0.02 — **small** |
| `opacity` | ~0.24 — **faint**, they accumulate into cloud | ~0.85 — **crisp** |
| `count` | ~3,200 | ~8,000 |

Give a nebula small bright points and it reads as confetti; give a galaxy big faint ones and it
smears. `sizeRatio` is a fraction of `spread`, so density survives any object scale.

Shipping counts are lower than looks best on desktop — the phone also runs the camera feed,
SLAM tracking and the portal geometry.

### `info` and `sources` — what the object's ring says

Required for anything not `none`, and shaped like a star's so the existing panel renders it
unchanged. Inside the object, a second dashed ring (`role: 'detail'`) opens this.

```json
"info": {"basic": "...", "scientific": "..."}, "sources": "..."
```

**Depth is expressive, not measured.** A far object is clamped to the back of the constellation's
box and the box is never extended — M31 at 2.54 Mly would otherwise flatten Andromeda to a
plane. Because the geometry no longer carries distance, `info.scientific` must state the real
figure in words.

### A `cluster`'s own figure

A cluster adds `stars` and `connections` in the **exact** constellation schema, so
`createStarEntity` and `createConnectionLine` consume them unchanged and the stars get Starsong
tones for free. Its stars are marked visited individually, and finding the last one returns you.

```json
{"id": "m45", "name": "Pleiades", "layer": "cluster",
 "position2D": {"x": 1.2, "y": 0.4}, "distance": 444,
 "stars": [ /* full star schema, physics included */ ],
 "connections": [ /* full connection schema */ ],
 "info": {"basic": "...", "scientific": "..."}, "sources": "..."}
```

A cluster does **not** carry its own `portal` or `gridBox` — it borrows the parent's, so the
frame never jumps. Its stars are positioned in the parent's portal, so project them to fit it.

## journey

```json
{"id": "m31", "title": "The Little Cloud", "view": "2d", "detailScale": 2.5,
 "centerStarName": "Nu Andromedae", "targetStarNames": ["Mu Andromedae", "Nu Andromedae"],
 "story": "...", "sources": "al-Sufi, Book of Fixed Stars (c. 964); Wikipedia"}
```

- `centerStarName` / `targetStarNames` use star **`name`** values, not ids.
- `view` is `"2d"`; the journey forces the flat layout so every star is coplanar.
- `detailScale` shrinks enlarged star models when targets crowd (~1.2 tight, ~2.5 loose);
  omit otherwise.
- `sources` is required on every stop.

## Validation

```bash
cd orion/src/data/constellations && python -c "
import json,io
d=json.load(io.open('<id>.json',encoding='utf-8'))
ids={s['id'] for s in d['stars']}; names={s['name'] for s in d['stars']}
assert not [c for c in d['connections'] if c['from'] not in ids or c['to'] not in ids]
assert all(st['centerStarName'] in names for st in d.get('journey',[]))
assert all(n in names for st in d.get('journey',[]) for n in st['targetStarNames'])
assert all(st.get('sources') for st in d.get('journey',[]))
assert not any('esoteric' in s.get('info',{}) for s in d['stars'])
hw=d['portal']['width']/2; hh=d['portal']['height']/2
assert all(abs(s['position2D']['x'])<=hw and abs(s['position2D']['y'])<=hh for s in d['stars'])
print('OK', len(d['stars']),'stars', len(d['connections']),'connections', len(d.get('journey',[])),'stops')
"
```

Files are UTF-8; Greek designations (α, β, δ) are expected.
